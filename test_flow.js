// =========================================================
// test_flow.js - runs a full booking story through the API and prints every step.
// Use it to SHOW THE WORKING to your teacher:
//   1) npm run seed      2) npm start (keep it open)      3) npm run test:flow  (new terminal)
// =========================================================
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let passed = 0, failed = 0;

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
}
function check(title, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${title}${detail ? '  ->  ' + detail : ''}`);
  ok ? passed++ : failed++;
}
const step = t => console.log(`\n=== ${t}`);

(async () => {
  const run = Date.now().toString().slice(-7);          // makes phone/ID unique on every run

  step('1. Sign up and sign in (collection: users)');
  let r = await call('POST', '/api/signup', { name: 'Demo User', email: `demo${run}@mail.com`, password: 'secret123' });
  check('Sign up works', r.status === 201, r.data.message);
  r = await call('POST', '/api/signup', { name: 'Demo User', email: `demo${run}@mail.com`, password: 'secret123' });
  check('Same email again is rejected (unique index)', r.status === 409, r.data.message);
  r = await call('POST', '/api/signin', { email: `demo${run}@mail.com`, password: 'wrong-password' });
  check('Wrong password is rejected', r.status === 401, r.data.message);
  r = await call('POST', '/api/signin', { email: `demo${run}@mail.com`, password: 'secret123' });
  check('Sign in works', r.status === 200, `name = ${r.data.name}`);

  step('2. Train schedules (collections: trains + train_services)');
  const services = (await call('GET', '/api/services')).data;
  check('Schedules are loaded', services.length > 0, `${services.length} journeys found`);
  const pick = services.flatMap(s => s.classes.map(c => ({ s, c })))
    .filter(x => x.c.available_seats === x.c.total_seats)
    .sort((a, b) => a.c.total_seats - b.c.total_seats)[0];
  if (!pick) { console.log('\nNo fully empty class found. Run "npm run seed" first and try again.'); process.exit(1); }
  const { s: svc, c: cls } = pick;
  const seats = cls.total_seats;
  console.log(`  Using: ${svc.train_name} on ${svc.journey_date}, class ${cls.travel_class}, ${seats} seats`);

  step('3. Fare calculation (Oracle function calculate_fare)');
  r = await call('GET', `/api/fare?service_id=${svc.service_id}&travel_class=${cls.travel_class}`);
  check('Fare preview works', r.status === 200, `Rs ${r.data.fare} for ${r.data.distance_km} km`);
  r = await call('GET', `/api/fare?service_id=${svc.service_id}&travel_class=XX`);
  check('Wrong class is rejected', r.status === 400, r.data.message);

  step('4. Register passengers (collection: passengers)');
  const ids = [];
  for (let i = 1; i <= seats + 2; i++) {
    r = await call('POST', '/api/passengers', { full_name: `Test Passenger ${i}`, phone: `9${run}${i}0`.slice(0, 10),
      email: `p${i}.${run}@mail.com`, id_type: 'Aadhaar', id_number: `ID${run}${i}`, gender: 'Male', date_of_birth: '2000-01-01' });
    ids.push(r.data.passengerId);
  }
  check(`${ids.length} passengers registered`, ids.every(Boolean), `Passenger IDs: ${ids.join(', ')}`);
  r = await call('POST', '/api/passengers', { full_name: 'Copy', phone: `9${run}10`.slice(0, 10), id_type: 'Aadhaar', id_number: `ID${run}1` });
  check('Duplicate ID number is rejected (unique index)', r.status === 409, r.data.message);

  step(`5. Book tickets - the class has only ${seats} seats (Oracle procedure book_ticket)`);
  const pnrs = [];
  for (let i = 0; i < ids.length; i++) {
    r = await call('POST', '/api/bookings', { passenger_id: ids[i], service_id: svc.service_id, travel_class: cls.travel_class });
    pnrs.push(r.data.pnr);
    const want = i < seats ? 'CONFIRMED' : 'WAITLIST';
    check(`Booking ${i + 1} is ${want}`, r.status === 201 && r.data.booking_status === want,
      `${r.data.pnr} ${r.data.booking_status} ${r.data.seat_number ? 'seat ' + r.data.seat_number : 'WL ' + r.data.waitlist_number}`);
  }
  r = await call('POST', '/api/bookings', { passenger_id: 999999, service_id: svc.service_id, travel_class: cls.travel_class });
  check('Unknown passenger ID is rejected', r.status === 404, r.data.message);

  step('6. Seats left after bookings (collection: train_services)');
  let now = (await call('GET', '/api/services')).data.find(x => x.service_id === svc.service_id)
    .classes.find(c => c.travel_class === cls.travel_class);
  check('Available seats are 0', now.available_seats === 0, `${now.available_seats}/${now.total_seats}`);

  step('7. PNR status (collection: tickets)');
  r = await call('GET', `/api/tickets/${pnrs[0]}`);
  check('Confirmed ticket found', r.status === 200 && r.data.booking_status === 'CONFIRMED', `${r.data.full_name}, seat ${r.data.seat_number}, Rs ${r.data.fare}`);
  r = await call('GET', `/api/tickets/${pnrs[seats]}`);
  check('Waitlist ticket found', r.data.booking_status === 'WAITLIST', `waitlist number ${r.data.waitlist_number}`);
  r = await call('GET', '/api/tickets/PNR000000000');
  check('Wrong PNR gives not found', r.status === 404, r.data.message);

  step('8. Cancel a confirmed ticket - first waitlist ticket must become CONFIRMED');
  r = await call('POST', '/api/cancellations', { pnr: pnrs[0] });
  check('Cancellation works', r.status === 200, r.data.message);
  r = await call('GET', `/api/tickets/${pnrs[0]}`);
  check('Cancelled ticket shows CANCELLED', r.data.booking_status === 'CANCELLED');
  r = await call('GET', `/api/tickets/${pnrs[seats]}`);
  check('Waitlist 1 is now CONFIRMED (promote_waitlist)', r.data.booking_status === 'CONFIRMED', `seat ${r.data.seat_number}`);
  r = await call('GET', `/api/tickets/${pnrs[seats + 1]}`);
  check('Waitlist 2 is still WAITLIST', r.data.booking_status === 'WAITLIST', `waitlist number ${r.data.waitlist_number}`);
  r = await call('POST', '/api/cancellations', { pnr: pnrs[0] });
  check('Cancelling twice is rejected', r.status === 400, r.data.message);
  r = await call('POST', '/api/cancellations', { pnr: 'PNR000000000' });
  check('Cancelling a wrong PNR gives not found', r.status === 404, r.data.message);

  step('9. Cancel a confirmed ticket when nobody is waiting - seat is freed');
  r = await call('POST', '/api/cancellations', { pnr: pnrs[1] });   // promotes waitlist 2
  r = await call('POST', '/api/cancellations', { pnr: pnrs[2] });   // nobody left waiting
  now = (await call('GET', '/api/services')).data.find(x => x.service_id === svc.service_id)
    .classes.find(c => c.travel_class === cls.travel_class);
  check('Available seats updated', now.available_seats === 1, `${now.available_seats}/${now.total_seats} seats free`);

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('Test could not run:', e.message, '\nIs the server running (npm start)?'); process.exit(1); });
