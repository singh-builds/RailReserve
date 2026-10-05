# RailReserve - Train Ticket Reservation (Node.js + Express + MongoDB)

This is the same RailReserve project, now using **MongoDB** instead of Oracle.
The web pages (`public/`) are unchanged. Only the database part was converted.

## What you need
1. **Node.js** (version 18 or newer)
2. **MongoDB Community Server** - download from mongodb.com. In the installer keep
   "Install MongoDB as a Service" and "Install MongoDB Compass" ticked.
   Compass is the free app where you can SEE your data (very useful for showing the working).
   (No MongoDB on your PC? Use a free MongoDB Atlas cluster and set `MONGODB_URI`, see below.)

## Run it (3 steps)
```
npm install
npm run seed      # creates the collections and adds sample trains (run once; running again resets the data)
npm start         # then open http://localhost:3000
```
Sign up, sign in, register a passenger, book a ticket, search the PNR, cancel the ticket.

## Show the working
- Open **MongoDB Compass**, connect to `mongodb://localhost:27017`, open database **railreserve**.
  Keep it open while you use the website and press the refresh button in Compass after each action.
- Run the automatic demo (open a second terminal while `npm start` is running):
  ```
  npm run test:flow
  ```
  It prints every step with PASS/FAIL (sign up, booking, waitlist, cancel, waitlist promotion).
- Run the queries in `demo_queries.js` inside **mongosh** (or the MONGOSH tab at the bottom of Compass).
- Read `MONGODB_CONVERSION.md` - it explains how every SQL table and PL/SQL part became MongoDB.

## Settings (optional)
| Name | Default |
|------|---------|
| `MONGODB_URI` | `mongodb://localhost:27017` |
| `DB_NAME` | `railreserve` |
| `PORT` | `3000` |

Windows PowerShell example: `$env:MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net"; npm start`

## Files
| File | Purpose |
|------|---------|
| `server.js` | Express server + all API routes (MongoDB code, replaces PL/SQL) |
| `db.js` | Connection, indexes (UNIQUE rules) and validators (CHECK rules) |
| `seed.js` | Sample trains, journeys and seats |
| `test_flow.js` | Automatic demo of the full booking story |
| `demo_queries.js` | Queries to show in mongosh / Compass |
| `old_oracle_version/` | The original Oracle files (server, SQL, README, screenshots), kept for comparison |
| `public/` | Front-end (unchanged) |

## API (unchanged)
POST `/api/signup`, POST `/api/signin`, GET `/api/services`, POST `/api/passengers`,
GET `/api/fare`, POST `/api/bookings`, GET `/api/tickets/:pnr`, POST `/api/cancellations`
