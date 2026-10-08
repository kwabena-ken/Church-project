const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../auth');

const router = express.Router();

function logAudit(userId, action, details) {
  db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(userId, action, details || null);
}

// Treasurer sees verified offerings awaiting reimbursement
router.get('/due', authenticate, requireRole('treasurer', 'admin'), (req, res) => {
  const due = db.prepare(`
    SELECT o.id AS offering_id, o.amount, o.momo_transaction_id, o.verified_at, o.meeting_date,
      c.name AS cell_name, u.name AS leader_name, u.phone AS leader_phone
    FROM offerings o
    JOIN cells c ON c.id = o.cell_id
    JOIN users u ON u.id = o.submitted_by
    LEFT JOIN reimbursements r ON r.offering_id = o.id
    WHERE o.status = 'verified' AND r.id IS NULL
    ORDER BY o.verified_at ASC
  `).all();

  const totalDue = due.reduce((sum, o) => sum + o.amount, 0);
  res.json({ due, total_due: totalDue });
});

// Treasurer marks a verified offering as reimbursed
router.post('/', authenticate, requireRole('treasurer', 'admin'), (req, res) => {
  const { offering_id } = req.body || {};
  if (!offering_id) {
    return res.status(400).json({ error: 'Offering ID is required' });
  }

  const offering = db.prepare('SELECT * FROM offerings WHERE id = ?').get(offering_id);
  if (!offering) return res.status(404).json({ error: 'Offering not found' });
  if (offering.status !== 'verified') {
    return res.status(400).json({ error: 'Only verified offerings can be reimbursed' });
  }

  const existing = db.prepare('SELECT id FROM reimbursements WHERE offering_id = ?').get(offering.id);
  if (existing) {
    return res.status(409).json({ error: 'This offering has already been reimbursed' });
  }

  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(offering.cell_id);
  const paidTo = db.prepare("SELECT id FROM users WHERE cell_id = ? AND role = 'leader' AND is_active = 1")
    .get(offering.cell_id);

  db.prepare('INSERT INTO reimbursements (offering_id, paid_to, amount, paid_by) VALUES (?, ?, ?, ?)')
    .run(offering.id, paidTo ? paidTo.id : offering.submitted_by, offering.amount, req.user.id);

  logAudit(req.user.id, 'reimburse', `Reimbursed GHS ${offering.amount} to "${cell ? cell.name : 'unknown cell'}" for offering #${offering.id}`);

  res.status(201).json({
    reimbursement: db.prepare('SELECT * FROM reimbursements WHERE offering_id = ?').get(offering.id)
  });
});

// Leader sees their reimbursement history
router.get('/mine', authenticate, requireRole('leader'), (req, res) => {
  const reimbursements = db.prepare(`
    SELECT r.id, r.amount, r.paid_at, o.meeting_date, o.momo_transaction_id, c.name AS cell_name
    FROM reimbursements r
    JOIN offerings o ON o.id = r.offering_id
    JOIN cells c ON c.id = o.cell_id
    WHERE r.paid_to = ?
    ORDER BY r.paid_at DESC
  `).all(req.user.id);
  res.json({ reimbursements });
});

// Admin sees all reimbursements
router.get('/', authenticate, requireRole('treasurer', 'admin'), (req, res) => {
  const reimbursements = db.prepare(`
    SELECT r.*, o.momo_transaction_id, o.meeting_date, c.name AS cell_name,
      payer.name AS paid_by_name, payee.name AS paid_to_name
    FROM reimbursements r
    JOIN offerings o ON o.id = r.offering_id
    JOIN cells c ON c.id = o.cell_id
    JOIN users payer ON payer.id = r.paid_by
    JOIN users payee ON payee.id = r.paid_to
    ORDER BY r.paid_at DESC
  `).all();
  res.json({ reimbursements });
});

module.exports = router;
