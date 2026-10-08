# Cell Offerings Tracker

A simple, secure web app that helps a church track the offerings collected from its various cells and manage the reimbursements used for member transportation.

## The Problem

The church's cell system funds transportation for members through cell offerings. The old process had major weaknesses:

- Cell leaders sent payment screenshots via WhatsApp to one person, whose inbox became flooded and messy
- The church's mobile money number receives all kinds of payments, making verification overwhelming
- Offerings were manually copied into an Excel sheet, leading to errors, duplicates and missing entries
- Any delay in verification delayed Sunday reimbursements

## The Solution

The app replaces the WhatsApp + Excel workflow with one structured system. It does **not** move money — momo payments still go to the church's number as before. The app only **tracks and verifies**.

**Cell leaders** log in and submit each offering with the amount, meeting date, and the unique **momo transaction ID** from their payment SMS. Since each transaction ID can only be submitted once, duplicate or copied claims are blocked automatically. Leaders see their status live and their reimbursement history.

**Treasurer** gets a clean dashboard of all pending submissions in one list, cross-checks each transaction ID against momo messages, then verifies or rejects (with a reason the leader can see). Verified offerings appear in a "to reimburse" list; on Sunday the treasurer marks them reimbursed.

**Admin** sees totals, all records, and manages cells, leaders and users.

## Features

- Role-based access: leader, treasurer, admin — each sees only what they should
- Secure login with JWT tokens, hashed passwords and lockout after repeated failed attempts
- Duplicate transaction ID protection — one payment can only be claimed once
- Submitted offerings are locked; every verify/reject/reimburse action is written to an audit trail
- Mobile-first design that works on any phone browser — nothing to install
- Reimbursement tracking from verification to Sunday payout

## Tech Stack

- **Frontend:** React + Vite (mobile-first)
- **Backend:** Node.js + Express
- **Database:** SQLite (Node.js built-in `node:sqlite`)
- **Auth:** JWT + bcrypt

## Getting Started

### Prerequisites

- Node.js v22.5+ (built-in SQLite module required)

### Setup

```bash
# 1. Install server dependencies
cd server
npm install

# 2. Seed the initial accounts (admin, treasurer, sample cells)
node seed.js

# 3. Start the server
npm start
```

The app runs at http://localhost:4000

### Client development (optional)

The built client is served automatically by the server. To work on the UI with hot reload:

```bash
cd client
npm install
npm run dev
```

## Default Accounts (created by seed.js)

All accounts use the same password (`ChangeMe123!` by default) — **change these before going live**.

| Role | Phone |
|---|---|
| Admin | 0000000000 |
| Treasurer | 0000000001 |
| Leaders | 0200000000 - 0200000002 |

## Project Structure

```
├── server/
│   ├── src/
│   │   ├── index.js          # Express entry point, serves the client in production
│   │   ├── db.js             # SQLite schema: users, zones, cells, offerings, reimbursements, audit_log
│   │   ├── auth.js           # JWT signing and role-based middleware
│   │   └── routes/
│   │       ├── auth.js       # Login, user management
│   │       ├── offerings.js  # Submit, verify, reject offerings
│   │       └── reimbursements.js  # Due list, mark reimbursed, history
│   ├── seed.js               # Seeds initial accounts and sample data
├── client/
│   ├── src/
│   │   ├── App.jsx           # Login + leader, treasurer and admin views
│   │   ├── api.js            # API helper with token handling
│   │   └── styles.css
```

## Going Live

Before deploying to a public link:

1. Set the `JWT_SECRET` environment variable (required in production)
2. Change all seeded passwords
3. Delete the sample cells and seed real ones via the admin account
