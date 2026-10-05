// =========================================================
// seed.js - creates the collections and inserts sample trains.
// Run:  npm run seed      (it clears old data and starts fresh)
// =========================================================
const { connect, setupSchema, nextId, DB_NAME } = require('./db');

const trains = [
  { train_number: '12001', train_name: 'Shatabdi Express', source_station: 'New Delhi', destination_station: 'Bhopal',
    distance_km: 708, departure_time: '06:00', arrival_time: '14:30',
    classes: [{ travel_class: 'CC', total_seats: 3, base_rate_per_km: 1.8 }, { travel_class: '2A', total_seats: 2, base_rate_per_km: 2.4 }] },
  { train_number: '12951', train_name: 'Mumbai Rajdhani', source_station: 'Mumbai Central', destination_station: 'New Delhi',
    distance_km: 1384, departure_time: '17:00', arrival_time: '08:35',
    classes: [{ travel_class: '3A', total_seats: 2, base_rate_per_km: 1.45 }, { travel_class: '2A', total_seats: 2, base_rate_per_km: 2.15 }, { travel_class: '1A', total_seats: 1, base_rate_per_km: 3.4 }] },
  { train_number: '12627', train_name: 'Karnataka Express', source_station: 'Bengaluru', destination_station: 'New Delhi',
    distance_km: 2367, departure_time: '19:20', arrival_time: '10:20',
    classes: [{ travel_class: 'SL', total_seats: 4, base_rate_per_km: 0.65 }, { travel_class: '3A', total_seats: 3, base_rate_per_km: 1.35 }] },
];

(async () => {
  const { client, db } = await connect();
  try {
    // start fresh
    for (const name of ['users', 'passengers', 'trains', 'train_services', 'class_inventory', 'tickets', 'counters']) {
      await db.collection(name).drop().catch(() => {});
    }
    await setupSchema(db);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const [i, t] of trains.entries()) {
      const train_id = await nextId(db, 'train_id');
      const { classes, ...trainData } = t;
      await db.collection('trains').insertOne({ train_id, ...trainData, active: true });

      // one journey per train on each of the next 3 days, starting tomorrow
      for (let day = 1 + i; day <= 3 + i; day++) {
        const journey_date = new Date(today.getTime() + day * 86400000);
        const service_id = await nextId(db, 'service_id');
        await db.collection('train_services').insertOne({
          service_id, train_id, journey_date, service_status: 'SCHEDULED',
        });
        // one document per class, like a row in the class_inventory table
        await db.collection('class_inventory').insertMany(classes.map(c => ({
          service_id,
          travel_class: c.travel_class,
          total_seats: c.total_seats,
          available_seats: c.total_seats,
          base_rate_per_km: c.base_rate_per_km,
          waitlist_seq: 0,
        })));
      }
    }
    console.log(`Database "${DB_NAME}" is ready:`);
    for (const name of ['trains', 'train_services', 'class_inventory']) {
      console.log(`  ${name}: ${await db.collection(name).countDocuments()} documents`);
    }
  } finally {
    await client.close();
  }
})().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
