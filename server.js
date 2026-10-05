// =========================================================
// RailReserve - Express server using MongoDB
// Same API routes as the Oracle version, so the front-end (public/) is unchanged.
// The PL/SQL procedures (book_ticket, cancel_ticket, promote_waitlist), the function
// (calculate_fare) and the trigger are now normal JavaScript functions in this file.
// =========================================================
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { connect, setupSchema, nextId, DB_NAME, MONGODB_URI } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;
const col = name => db.collection(name);
const wrap = fn => (req, res, next) => fn(req, res).catch(next);   // sends errors to the error handler
const isDuplicate = err => err && err.code === 11000;               // Oracle: ORA-00001 (unique constraint)
const iso = d => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

const hashPassword = password => crypto.createHash('sha256').update(password).digest('hex');

// ---------- Oracle function calculate_fare() ----------
const calculateFare = (distanceKm, ratePerKm) =>
  Math.round(((distanceKm * ratePerKm + 25) * 1.05) * 100) / 100;

// ---------- small helpers ----------
const findClass = (serviceId, cls) => col('class_inventory').findOne({ service_id: serviceId, travel_class: cls });

// Take ONE seat from a class. It is a single atomic MongoDB update, so two people
// can never get the last seat at the same time (this replaces SELECT ... FOR UPDATE).
async function takeSeat(serviceId, cls) {
  const before = await col('class_inventory').findOneAndUpdate(
    { service_id: serviceId, travel_class: cls, available_seats: { $gt: 0 } },
    { $inc: { available_seats: -1 } },
    { returnDocument: 'before' });
  return Boolean(before);                           // false means the class is full
}
// Seat label = the lowest seat number of that class which is not used by a confirmed ticket.
async function freeSeatLabel(serviceId, cls) {
  const klass = await findClass(serviceId, cls);
  const used = new Set((await col('tickets')
    .find({ service_id: serviceId, travel_class: cls, booking_status: 'CONFIRMED' }).toArray())
    .map(t => t.seat_number));
  for (let n = 1; n <= klass.total_seats; n++) if (!used.has(`${cls}-${n}`)) return `${cls}-${n}`;
  return `${cls}-${klass.total_seats}`;
}
const giveSeatBack = (serviceId, cls) =>
  col('class_inventory').updateOne({ service_id: serviceId, travel_class: cls }, { $inc: { available_seats: 1 } });

// ---------- Oracle procedure promote_waitlist() ----------
async function promoteWaitlist(serviceId, cls) {
  while (true) {
    if (!(await takeSeat(serviceId, cls))) break;                 // no free seat left
    const promoted = await col('tickets').findOneAndUpdate(       // oldest waitlist ticket first
      { service_id: serviceId, travel_class: cls, booking_status: 'WAITLIST' },
      { $set: { booking_status: 'CONFIRMED', seat_number: await freeSeatLabel(serviceId, cls), waitlist_number: null } },
      { sort: { waitlist_number: 1 }, returnDocument: 'after' });
    if (!promoted) { await giveSeatBack(serviceId, cls); break; } // nobody waiting
  }
}

// =========================================================
// AUTH - Sign Up
// =========================================================
app.post('/api/signup', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  if (password.length < 6)
    return res.status(400).json({ message: 'Password must contain at least 6 characters.' });
  try {
    await col('users').insertOne({
      name: name.trim(), email: email.trim().toLowerCase(),
      password_hash: hashPassword(password), created_at: new Date(),
    });
    res.status(201).json({ message: 'Account created. You can now log in.' });
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ message: 'This email is already registered.' });
    throw err;
  }
}));

// =========================================================
// AUTH - Sign In
// =========================================================
app.post('/api/signin', wrap(async (req, res) => {
  const { email, password } = req.body;
  const user = await col('users').findOne({
    email: String(email || '').trim().toLowerCase(),
    password_hash: hashPassword(String(password || '')),
  });
  if (!user) return res.status(401).json({ message: 'Invalid email or password.' });
  res.json({ name: user.name, email: user.email });
}));

// =========================================================
// GET /api/services - list all scheduled services
// =========================================================
app.get('/api/services', wrap(async (req, res) => {
  const services = await col('train_services')
    .find({ service_status: 'SCHEDULED' }).sort({ journey_date: 1, service_id: 1 }).toArray();
  const trains = await col('trains').find({}).toArray();
  const trainById = new Map(trains.map(t => [t.train_id, t]));
  const inventory = await col('class_inventory')
    .find({ service_id: { $in: services.map(s => s.service_id) } }).sort({ service_id: 1 }).toArray();

  res.json(services.filter(s => trainById.has(s.train_id)).map(s => {
    const t = trainById.get(s.train_id);
    return {
      service_id: s.service_id, train_number: t.train_number, train_name: t.train_name,
      source_station: t.source_station, destination_station: t.destination_station,
      distance_km: t.distance_km, departure_time: t.departure_time, arrival_time: t.arrival_time,
      journey_date: iso(s.journey_date),
      classes: inventory.filter(c => c.service_id === s.service_id).map(c => ({
        travel_class: c.travel_class, total_seats: c.total_seats, available_seats: c.available_seats,
      })),
    };
  }));
}));

// =========================================================
// POST /api/passengers - register a passenger
// =========================================================
app.post('/api/passengers', wrap(async (req, res) => {
  const { full_name, phone, email, id_type, id_number, date_of_birth, gender } = req.body;
  if (![full_name, phone, id_type, id_number].every(Boolean))
    return res.status(400).json({ message: 'Name, phone and identification details are required.' });

  const passengerId = await nextId(db, 'passenger_id');
  try {
    await col('passengers').insertOne({
      passenger_id: passengerId, full_name, phone, id_type, id_number,
      email: email || null,
      date_of_birth: date_of_birth ? new Date(date_of_birth) : null,
      gender: gender ? gender.toUpperCase() : null,
      created_at: new Date(),
    });
    res.status(201).json({ message: 'Passenger registered successfully.', passengerId });
  } catch (err) {
    if (isDuplicate(err))
      return res.status(409).json({ message: 'A passenger with this phone or ID already exists.' });
    throw err;
  }
}));

// =========================================================
// GET /api/fare - calculate fare preview
// =========================================================
app.get('/api/fare', wrap(async (req, res) => {
  const cls = String(req.query.travel_class || '').toUpperCase();
  const serviceId = Number(req.query.service_id);
  const service = await col('train_services').findOne({ service_id: serviceId });
  const klass = service && await findClass(serviceId, cls);
  const train = klass && await col('trains').findOne({ train_id: service.train_id });
  if (!train) return res.status(400).json({ message: 'Choose a valid train service and class.' });
  res.json({ fare: calculateFare(train.distance_km, klass.base_rate_per_km), distance_km: train.distance_km });
}));

// =========================================================
// POST /api/bookings - book a ticket (Oracle procedure book_ticket)
// =========================================================
app.post('/api/bookings', wrap(async (req, res) => {
  const passengerId = Number(req.body.passenger_id);
  const serviceId = Number(req.body.service_id);
  const cls = String(req.body.travel_class || '').toUpperCase();

  if (!(await col('passengers').findOne({ passenger_id: passengerId })))
    return res.status(404).json({ message: 'Passenger ID was not found. Register the passenger first.' });

  const service = await col('train_services').findOne({ service_id: serviceId });
  const klass = service && await findClass(serviceId, cls);
  const train = klass && await col('trains').findOne({ train_id: service.train_id });
  if (!train) return res.status(400).json({ message: 'Invalid service or travel class' });          // -20001
  if (service.service_status !== 'SCHEDULED')
    return res.status(400).json({ message: 'Service is unavailable for booking' });                  // -20002

  const fare = calculateFare(train.distance_km, klass.base_rate_per_km);
  const gotSeat = await takeSeat(serviceId, cls);         // false means the class is full
  const status = gotSeat ? 'CONFIRMED' : 'WAITLIST';
  const seatLabel = gotSeat ? await freeSeatLabel(serviceId, cls) : null;

  let waitlistNo = null;
  if (status === 'WAITLIST') {
    const updated = await col('class_inventory').findOneAndUpdate(
      { service_id: serviceId, travel_class: cls },
      { $inc: { waitlist_seq: 1 } }, { returnDocument: 'after' });
    waitlistNo = updated.waitlist_seq;
  }

  const ticket = {
    passenger_id: passengerId, service_id: serviceId, travel_class: cls,
    booking_status: status, seat_number: seatLabel,
    waitlist_number: waitlistNo, fare, booked_at: new Date(), cancelled_at: null,
  };
  try {
    for (let attempt = 0; ; attempt++) {                   // PNR must be unique, so retry if it clashes
      ticket.pnr = 'PNR' + String(crypto.randomInt(0, 1e9)).padStart(9, '0');
      try { await col('tickets').insertOne(ticket); break; }
      catch (err) { if (!isDuplicate(err) || attempt >= 5) throw err; }
    }
  } catch (err) {
    if (status === 'CONFIRMED') await giveSeatBack(serviceId, cls);   // same idea as ROLLBACK
    throw err;
  }

  res.status(201).json({
    pnr: ticket.pnr, booking_status: status, fare,
    seat_number: ticket.seat_number, waitlist_number: waitlistNo,
  });
}));

// =========================================================
// GET /api/tickets/:pnr - PNR status lookup
// =========================================================
app.get('/api/tickets/:pnr', wrap(async (req, res) => {
  const t = await col('tickets').findOne({ pnr: req.params.pnr.toUpperCase() });
  const passenger = t && await col('passengers').findOne({ passenger_id: t.passenger_id });
  const service = t && await col('train_services').findOne({ service_id: t.service_id });
  const train = service && await col('trains').findOne({ train_id: service.train_id });
  if (!t || !passenger || !train) return res.status(404).json({ message: 'No ticket found for this PNR.' });

  res.json({
    pnr: t.pnr, booking_status: t.booking_status,
    seat_number: t.seat_number, waitlist_number: t.waitlist_number,
    fare: t.fare, full_name: passenger.full_name,
    train_name: train.train_name, train_number: train.train_number,
    source_station: train.source_station, destination_station: train.destination_station,
    journey_date: iso(service.journey_date), travel_class: t.travel_class,
  });
}));

// =========================================================
// POST /api/cancellations - cancel ticket (Oracle procedure cancel_ticket)
// =========================================================
app.post('/api/cancellations', wrap(async (req, res) => {
  const pnr = String(req.body.pnr || '').toUpperCase();

  // One atomic update: only a ticket that is not cancelled yet can be cancelled.
  const before = await col('tickets').findOneAndUpdate(
    { pnr, booking_status: { $ne: 'CANCELLED' } },
    { $set: { booking_status: 'CANCELLED', seat_number: null, waitlist_number: null, cancelled_at: new Date() } },
    { returnDocument: 'before' });

  if (!before) {
    const exists = await col('tickets').findOne({ pnr });
    return exists
      ? res.status(400).json({ message: 'This ticket is already cancelled.' })   // -20003
      : res.status(404).json({ message: 'No ticket found for this PNR.' });      // -20004
  }

  if (before.booking_status === 'CONFIRMED') {
    await giveSeatBack(before.service_id, before.travel_class);       // Oracle trigger ticket_inventory_change
    await promoteWaitlist(before.service_id, before.travel_class);    // Oracle procedure promote_waitlist
  }
  res.json({ message: 'Ticket cancelled and seat availability updated.' });
}));

// ---------- error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Server error.' });
});

// =========================================================
// Start server
// =========================================================
const PORT = process.env.PORT || 3000;
connect().then(async ({ db: database }) => {
  db = database;
  await setupSchema(db);
  console.log(`MongoDB connected: ${MONGODB_URI}  (database: ${DB_NAME})`);
  if (!(await col('trains').countDocuments()))
    console.log('No trains found. Run "npm run seed" once to add the sample trains.');
  app.listen(PORT, () => console.log(`RailReserve running at http://localhost:${PORT}`));
}).catch(err => {
  console.error('Could not connect to MongoDB:', err.message);
  console.error('Make sure MongoDB is running (see README), or set MONGODB_URI.');
  process.exit(1);
});
