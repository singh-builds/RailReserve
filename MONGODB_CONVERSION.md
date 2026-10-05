# How the project was converted from Oracle (SQL) to MongoDB

## 1. Big idea (simple words)
- Oracle keeps data in **tables with rows**. MongoDB keeps data in **collections with documents** (JSON-like).
- Oracle logic was written in **PL/SQL inside the database** (procedures, function, trigger).
  In MongoDB this logic is written in **JavaScript in `server.js`**.
- The website (HTML/JS) is not changed, because the API routes and their answers are the same.

## 2. Tables -> Collections
| Oracle table | MongoDB collection | Important changes |
|---|---|---|
| `rr_users` | `users` | Same fields. Unique index on `email`. |
| `passenger` | `passengers` | `passenger_id` still a number (from a `counters` collection). Unique on phone, id_number, email. |
| `train` | `trains` | Same fields. Unique on `train_number`. |
| `train_service` | `train_services` | Same fields. `journey_date` is a Date. Unique on (`train_id`, `journey_date`). |
| `class_inventory` | `class_inventory` | One document per class of a journey. Unique on (`service_id`, `travel_class`). Extra field `waitlist_seq` counts waitlist numbers. |
| `ticket` | `tickets` | Same fields. Unique on `pnr`. |
| (identity columns) | `counters` | Gives the next `passenger_id`, `service_id`, `train_id` (replaces `GENERATED AS IDENTITY`). |

## 3. SQL rules -> MongoDB rules
| Oracle | MongoDB (in `db.js`) |
|---|---|
| `PRIMARY KEY` / `UNIQUE` | unique index (`createIndex(..., { unique: true })`) |
| `CHECK (booking_status IN (...))` | `$jsonSchema` validator with `enum` |
| `REFERENCES` (foreign key) | not enforced by MongoDB; the code checks it (for example "Passenger ID was not found") |
| `JOIN` | `$lookup` in demo queries, or separate `find` calls in the server |
| `ORA-00001` (duplicate) | error code `11000` -> HTTP 409 |

## 4. PL/SQL -> JavaScript (in `server.js`)
| Oracle (PL/SQL) | MongoDB version |
|---|---|
| `calculate_fare()` function | `calculateFare()` - same formula: `(distance x rate + 25) x 1.05` |
| `book_ticket` procedure | route `POST /api/bookings` |
| `cancel_ticket` procedure | route `POST /api/cancellations` |
| `promote_waitlist` procedure | function `promoteWaitlist()` |
| `ticket_inventory_change` trigger | `takeSeat()` and `giveSeatBack()` change `available_seats` whenever a ticket becomes or stops being CONFIRMED |
| `SELECT ... FOR UPDATE` (lock) | one atomic `findOneAndUpdate` with `available_seats > 0` and `$inc: -1` |
| `COMMIT` / `ROLLBACK` | MongoDB changes one document atomically. If saving the ticket fails, the seat is given back. |
| `RAISE_APPLICATION_ERROR -20001..-20004` | HTTP 400 / 404 messages with the same text |

## 5. How a booking works now
1. Check passenger, journey and class exist (else 404 / 400).
2. Calculate the fare.
3. Try to take one seat: `findOneAndUpdate({ available_seats: { $gt: 0 } }, { $inc: { available_seats: -1 } })`.
   - Got a seat -> ticket is **CONFIRMED** with the lowest free seat label (CC-1, CC-2, ...).
   - No seat left -> ticket is **WAITLIST** with the next waitlist number.
4. Save the ticket with a unique PNR.

Cancelling a CONFIRMED ticket gives the seat back and the oldest WAITLIST ticket becomes CONFIRMED.

## 6. Small things changed on purpose
- Seat labels now use the lowest free seat number, so two tickets never show the same seat.
- Waitlist numbers keep counting up (1, 2, 3...) and are not reused.
- The file `public/server.js` of the old zip was removed: it was an old copy of the server inside the public
  folder, so anyone could download it from the browser.
- `.gitignore` and `.env.example` were corrected.
- The original Oracle files are saved in the folder `old_oracle_version/`.
- The old SQL file has no `CREATE TABLE rr_users`, but `server.js` used it. In MongoDB this is the `users` collection, created automatically.

## 7. Questions your teacher may ask
**Why MongoDB?** Data is stored as flexible JSON-like documents, it needs no fixed table design, and it is easy to use with Node.js.
**Where did the stored procedures go?** Into JavaScript functions in `server.js`.
**How do you stop two people booking the last seat?** The seat is taken with one atomic update that only works when `available_seats > 0`.
**What replaces joins?** `$lookup` (see query 11 in `demo_queries.js`), or reading the other collection by id.
**What replaces foreign keys?** MongoDB does not enforce them, so the Node code checks that the passenger and journey exist.
