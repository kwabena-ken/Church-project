const bcrypt = require('bcryptjs');
const db = require('./src/db');

function logAudit(userId, action, details) {
  db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(userId, action, details || null);
}

const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
if (adminExists) {
  console.log('Admin already exists, nothing to seed.');
  process.exit(0);
}

const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

db.exec('BEGIN');
try {
  const adminHash = bcrypt.hashSync(password, 10);
  const admin = db.prepare("INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, 'admin')")
    .run('Church Admin', '0000000000', adminHash);

  const treasurerHash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, 'treasurer')")
    .run('Church Treasurer', '0000000001', treasurerHash);

  const zone = db.prepare('INSERT INTO zones (name) VALUES (?)').run('Zone 1');

  const cellNames = ['Joy Cell', 'Peace Cell', 'Faith Cell'];
  const cellIds = [];
  for (let i = 0; i < cellNames.length; i++) {
    const cell = db.prepare('INSERT INTO cells (name, zone_id) VALUES (?, ?)').run(cellNames[i], zone.lastInsertRowid);
    cellIds.push(cell.lastInsertRowid);

    const leaderHash = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO users (name, phone, password_hash, role, cell_id) VALUES (?, ?, ?, 'leader', ?)")
      .run(`${cellNames[i]} Leader`, `020000000${i}`, leaderHash, cell.lastInsertRowid);
  }

  logAudit(admin.lastInsertRowid, 'seed', 'Seeded initial admin, treasurer, zone 1 and 3 sample cells');
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

console.log('Seed complete.');
console.log('Accounts created (all use the same password):');
console.log(`  Admin:      0000000000`);
console.log(`  Treasurer:  0000000001`);
console.log(`  Leaders:    0200000000 - 0200000002`);
console.log(`  Password:   ${password}`);
console.log('IMPORTANT: change the admin password before going live.');
