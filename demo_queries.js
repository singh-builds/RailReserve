// =========================================================
// demo_queries.js - queries to show the data in MongoDB
// Open mongosh (or the MONGOSH tab in Compass) and paste these one by one.
// =========================================================
use railreserve

// 1. See all collections (these were the SQL tables)
show collections

// 2. SELECT * FROM train;
db.trains.find()

// 3. SELECT ... FROM train_service WHERE service_status = 'SCHEDULED' ORDER BY journey_date;
db.train_services.find({ service_status: 'SCHEDULED' }).sort({ journey_date: 1 })

// 4. Seats per class (SQL table class_inventory)
db.class_inventory.find({}, { _id: 0, service_id: 1, travel_class: 1, total_seats: 1, available_seats: 1 })

// 5. Only classes that still have seats  (WHERE available_seats > 0)
db.class_inventory.find({ available_seats: { $gt: 0 } })

// 6. All passengers
db.passengers.find({}, { _id: 0, passenger_id: 1, full_name: 1, phone: 1, id_type: 1 })

// 7. All tickets, newest first
db.tickets.find({}, { _id: 0 }).sort({ booked_at: -1 })

// 8. Find one ticket by PNR  (replace the PNR with a real one from your tickets)
db.tickets.findOne({ pnr: 'PNR123456789' })

// 9. Count tickets by status  (SELECT booking_status, COUNT(*) ... GROUP BY booking_status)
db.tickets.aggregate([{ $group: { _id: '$booking_status', total: { $sum: 1 } } }])

// 10. Waitlist in order (the order used by promote_waitlist)
db.tickets.find({ booking_status: 'WAITLIST' }).sort({ service_id: 1, travel_class: 1, waitlist_number: 1 })

// 11. A JOIN: tickets + passengers + trains  ($lookup is the MongoDB JOIN)
db.tickets.aggregate([
  { $lookup: { from: 'passengers', localField: 'passenger_id', foreignField: 'passenger_id', as: 'passenger' } },
  { $unwind: '$passenger' },
  { $lookup: { from: 'train_services', localField: 'service_id', foreignField: 'service_id', as: 'service' } },
  { $unwind: '$service' },
  { $lookup: { from: 'trains', localField: 'service.train_id', foreignField: 'train_id', as: 'train' } },
  { $unwind: '$train' },
  { $project: { _id: 0, pnr: 1, booking_status: 1, seat_number: 1, fare: 1,
                passenger: '$passenger.full_name', train: '$train.train_name',
                journey_date: '$service.journey_date' } }
])

// 12. Show the UNIQUE rules (the SQL UNIQUE constraints)
db.passengers.getIndexes()
db.tickets.getIndexes()

// 13. Try to break a rule: inserting a second user with the same email must fail
db.users.insertOne({ name: 'A', email: 'same@mail.com', password_hash: 'x' })
db.users.insertOne({ name: 'B', email: 'same@mail.com', password_hash: 'x' })   // E11000 duplicate key error
