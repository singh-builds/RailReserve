// =========================================================
// db.js - MongoDB connection + "schema" (validators and indexes)
// This file replaces the CREATE TABLE part of database.sql.
// =========================================================
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'railreserve';

async function connect() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  return { client, db: client.db(DB_NAME) };
}

// Oracle: CHECK constraints  ->  MongoDB: $jsonSchema validator
async function makeCollection(db, name, validator) {
  const exists = await db.listCollections({ name }).hasNext();
  if (exists) return;
  try {
    await db.createCollection(name, validator ? { validator: { $jsonSchema: validator } } : {});
  } catch (err) {
    // Some Mongo-compatible servers do not support validators. The app still works.
    console.warn(`(note) validator for "${name}" skipped: ${err.message}`);
    await db.createCollection(name).catch(() => {});
  }
}

async function setupSchema(db) {
  await makeCollection(db, 'users');
  await makeCollection(db, 'passengers', {
    bsonType: 'object',
    required: ['passenger_id', 'full_name', 'phone', 'id_type', 'id_number'],
    properties: { gender: { enum: ['MALE', 'FEMALE', 'OTHER', null] } }       // ck_passenger_gender
  });
  await makeCollection(db, 'trains');
  await makeCollection(db, 'train_services', {
    bsonType: 'object',
    required: ['service_id', 'train_id', 'journey_date', 'service_status'],
    properties: { service_status: { enum: ['SCHEDULED', 'CANCELLED', 'COMPLETED'] } }   // ck_service_status
  });
  await makeCollection(db, 'class_inventory', {
    bsonType: 'object',
    required: ['service_id', 'travel_class', 'total_seats', 'available_seats', 'base_rate_per_km'],
    properties: { available_seats: { bsonType: ['int', 'long', 'double'], minimum: 0 } }   // part of ck_seat_count
  });
  await makeCollection(db, 'tickets', {
    bsonType: 'object',
    required: ['pnr', 'passenger_id', 'service_id', 'travel_class', 'booking_status', 'fare'],
    properties: { booking_status: { enum: ['CONFIRMED', 'WAITLIST', 'CANCELLED'] } }    // ck_ticket_status
  });
  await makeCollection(db, 'counters');

  // Oracle: UNIQUE / PRIMARY KEY  ->  MongoDB: unique index
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('passengers').createIndex({ passenger_id: 1 }, { unique: true });
  await db.collection('passengers').createIndex({ phone: 1 }, { unique: true });
  await db.collection('passengers').createIndex({ id_number: 1 }, { unique: true });
  // email is optional, so the unique rule only applies when an email is given
  await db.collection('passengers').createIndex({ email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: 'string' } } })
    .catch(err => console.warn('(note) unique email index skipped:', err.message));
  await db.collection('trains').createIndex({ train_id: 1 }, { unique: true });
  await db.collection('trains').createIndex({ train_number: 1 }, { unique: true });
  await db.collection('train_services').createIndex({ service_id: 1 }, { unique: true });
  await db.collection('train_services').createIndex({ train_id: 1, journey_date: 1 }, { unique: true }); // uq_train_service
  await db.collection('class_inventory').createIndex({ service_id: 1, travel_class: 1 }, { unique: true }); // uq_service_class
  await db.collection('tickets').createIndex({ pnr: 1 }, { unique: true });
  await db.collection('tickets').createIndex({ service_id: 1, travel_class: 1, booking_status: 1, waitlist_number: 1 }); // ix_ticket_waitlist
}

// Oracle: GENERATED AS IDENTITY  ->  MongoDB: a small "counters" collection
async function nextId(db, name) {
  const r = await db.collection('counters').findOneAndUpdate(
    { _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  const doc = r && r.value !== undefined ? r.value : r;   // works with old and new driver result shapes
  return doc.seq;
}

module.exports = { connect, setupSchema, nextId, DB_NAME, MONGODB_URI };
