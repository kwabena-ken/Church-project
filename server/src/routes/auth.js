const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, authenticate, requireRole } = require('../auth');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000;
const loginAttempts = new Map();

function isLockedOut(phone) {
  const record = loginAttempts.get(phone);
  if (!record) return false;
  if (record.count < MAX_ATTEMPTS) return false;
  if (Date.now() - record.firstAttempt > LOCKOUT_MS) {
    loginAttempts.delete(phone);
    return false;
  }
  return true;
}

function recordFailure(phone) {
  const record = loginAttempts.get(phone) || { count: 0, firstAttempt: Date.now() };
  if (Date.now() - record.firstAttempt > LOCKOUT_MS) {
    record.count = 0;
    record.firstAttempt = Date.now();
  }
  record.count += 1;
  loginAttempts.set(phone, record);
}

function logAudit(userId, action, details) {
  db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(userId, action, details || null);
}

router.post('/login', (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone number and password are required' });
  }

  if (isLockedOut(phone)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 10 minutes.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE phone = ? AND is_active = 1').get(phone);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordFailure(phone);
    return res.status(401).json({ error: 'Invalid phone number or password' });
  }

  loginAttempts.delete(phone);
  logAudit(user.id, 'login', `User ${user.name} logged in`);

  const { password_hash, ...safeUser } = user;
  res.json({ token: signToken(user), user: safeUser });
});

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, name, phone, role, cell_id, is_active, created_at FROM users WHERE id = ? AND is_active = 1')
    .get(req.user.id);
  if (!user) {
    return res.status(401).json({ error: 'Account no longer active' });
  }
  res.json({ user });
});

router.get('/users', authenticate, requireRole('admin'), (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.phone, u.role, u.cell_id, u.is_active, u.created_at, c.name AS cell_name
    FROM users u LEFT JOIN cells c ON c.id = u.cell_id
    ORDER BY u.created_at DESC
  `).all();
  res.json({ users });
});

router.post('/users', authenticate, requireRole('admin'), (req, res) => {
  const { name, phone, password, role, cell_id } = req.body || {};
  if (!name || !phone || !password || !role) {
    return res.status(400).json({ error: 'Name, phone, password and role are required' });
  }
  if (!['admin', 'treasurer', 'leader'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin, treasurer or leader' });
  }
  if (role === 'leader' && !cell_id) {
    return res.status(400).json({ error: 'Leaders must be assigned to a cell' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (exists) {
    return res.status(409).json({ error: 'A user with this phone number already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (name, phone, password_hash, role, cell_id) VALUES (?, ?, ?, ?, ?)')
    .run(name, phone, hash, role, cell_id || null);
  logAudit(req.user.id, 'create_user', `Created ${role} "${name}"`);

  res.status(201).json({ user: { id: result.lastInsertRowid, name, phone, role, cell_id: cell_id || null } });
});

router.patch('/users/:id/deactivate', authenticate, requireRole('admin'), (req, res) => {
  const target = db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate yourself' });

  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(target.id);
  logAudit(req.user.id, 'deactivate_user', `Deactivated user "${target.name}"`);
  res.json({ ok: true });
});

module.exports = router;
