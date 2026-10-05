# RailReserve

A full-stack railway ticket reservation system that allows users to search train services, register passengers, calculate fares, book tickets, generate PNRs, check ticket status, cancel tickets, and manage waitlisted passengers.

## About the Project

RailReserve is a web-based railway reservation application designed to simplify the process of train ticket booking and management.

The application provides a complete reservation workflow, including user authentication, train schedule search, passenger registration, fare calculation, confirmed booking, waitlist management, PNR tracking, ticket cancellation, and automatic waitlist promotion.

The project uses a Node.js and Express.js backend with MongoDB for data storage.

## Tech Stack

### Frontend
- HTML5
- CSS3
- JavaScript

### Backend
- Node.js
- Express.js

### Database
- MongoDB
- MongoDB Node.js Driver

### Development Tools
- Visual Studio Code
- MongoDB Compass
- Git
- GitHub

## Key Features

- User Registration and Login
- Secure Password Hashing
- Train Schedule Search
- Passenger Registration
- Fare Calculation
- Confirmed Ticket Booking
- Automatic Waitlist Management
- PNR Generation
- PNR Status Checking
- Ticket Cancellation
- Automatic Waitlist Promotion
- Seat Availability Management
- Duplicate Data Validation
- MongoDB Data Storage
- Backend API Integration

## System Architecture

```text
                   RAILRESERVE
                       |
                       v
                Web Browser
                       |
            HTML / CSS / JavaScript
                       |
                 HTTP API Calls
                       |
                       v
              Node.js + Express.js
                       |
              MongoDB Node.js Driver
                       |
                       v
                 MongoDB Server
                localhost:27017
                       |
                       v
                railreserve Database
                       |
          +------------+-------------+
          |            |             |
          v            v             v
        users      passengers      trains
                                      |
                                      v
                               train_services
                                      |
                                      v
                               class_inventory
                                      |
                                      v
                                   tickets

Database

MongoDB Connection:

mongodb://localhost:27017

Database Name:

railreserve

Main Collections
users
passengers
trains
train_services
class_inventory
tickets
counters
How to Run
Requirements
Node.js 18+
MongoDB Community Server
Install Dependencies
npm install
Initialize Database
npm run seed
Start Application
npm start

Open:

http://localhost:3000
Testing

The project includes an automated test flow covering signup, login, train schedules, fare calculation, passenger registration, booking, waitlist, PNR, cancellation, and waitlist promotion.

Test Result: 24 passed, 0 failed

Run the test with:

npm run test:flow
Project Structure
RailReserve/
├── public/
├── db.js
├── server.js
├── seed.js
├── test_flow.js
├── demo_queries.js
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
└── README.md
GitHub

https://github.com/singh-builds/RailReserve

Author

Aditya Rajesh Singh

GitHub: https://github.com/singh-builds


### This is enough

It tells someone:

**What the project is → what you used → what it does → how MongoDB connects → how to run it → testing result → GitHub link.**

You don't need the huge README I gave earlier.

After pasting this into `README.md`, save it and run:

```cmd
git add README.md
git commit -m "Improve README"
git push
