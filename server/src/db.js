const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..');
if (!fs.existsSync(path.join(dataDir, 'data.db'))) {
  // node:sqlite creates the file on open; nothing extra needed
}
const db = new DatabaseSync(path.join(dataDir, 'data.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    zone_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (zone_id) REFERENCES zones(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'treasurer', 'leader')),
    cell_id INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (cell_id) REFERENCES cells(id)
  );

  CREATE TABLE IF NOT EXISTS offerings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cell_id INTEGER NOT NULL,
    submitted_by INTEGER NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    meeting_date TEXT NOT NULL,
    momo_transaction_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    rejection_reason TEXT,
    verified_by INTEGER,
    verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (cell_id) REFERENCES cells(id),
    FOREIGN KEY (submitted_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reimbursements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    offering_id INTEGER NOT NULL UNIQUE,
    paid_to INTEGER NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    paid_by INTEGER NOT NULL,
    paid_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (offering_id) REFERENCES offerings(id),
    FOREIGN KEY (paid_to) REFERENCES users(id),
    FOREIGN KEY (paid_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

module.exports = db;
