const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../auth');

const router = express.Router();

function logAudit(userId, action, details) {
  db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(userId, action, details || null);
}

// Leader submits an offering for their cell
router.post('/', authenticate, requireRole('leader'), (req, res) => {
  const { amount, meeting_date, momo_transaction_id } = req.body || {};

  if (!amount || !meeting_date || !momo_transaction_id) {
    return res.status(400).json({ error: 'Amount, meeting date and momo transaction ID are required' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  const txnId = String(momo_transaction_id).trim();
  if (txnId.length < 6 || txnId.length > 40) {
    return res.status(400).json({ error: 'Momo transaction ID must be between 6 and 40 characters' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meeting_date)) {
    return res.status(400).json({ error: 'Meeting date must be in YYYY-MM-DD format' });
  }

  const duplicate = db.prepare('SELECT id FROM offerings WHERE momo_transaction_id = ?').get(txnId);
  if (duplicate) {
    logAudit(req.user.id, 'duplicate_submission', `Blocked duplicate transaction ID "${txnId}"`);
    return res.status(409).json({ error: 'This momo transaction ID has already been submitted. One payment can only be claimed once.' });
  }

  const result = db.prepare(`
    INSERT INTO offerings (cell_id, submitted_by, amount, meeting_date, momo_transaction_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.cell_id, req.user.id, parsedAmount, meeting_date, txnId);

  logAudit(req.user.id, 'submit_offering', `Submitted GHS ${parsedAmount} for meeting ${meeting_date}, txn ${txnId}`);

  const offering = db.prepare('SELECT * FROM offerings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ offering });
});

// Leader sees their own submissions and statuses
router.get('/mine', authenticate, requireRole('leader'), (req, res) => {
  const offerings = db.prepare(`
    SELECT o.*, c.name AS cell_name,
      r.id AS reimbursement_id, r.paid_at AS reimbursed_at
    FROM offerings o
    JOIN cells c ON c.id = o.cell_id
    LEFT JOIN reimbursements r ON r.offering_id = o.id
    WHERE o.submitted_by = ?
    ORDER BY o.created_at DESC
  `).all(req.user.id);

  const totals = {
    verified: offerings.filter(o => o.status === 'verified' && !o.reimbursement_id)
      .reduce((sum, o) => sum + o.amount, 0),
    reimbursed: offerings.filter(o => o.reimbursement_id)
      .reduce((sum, o) => sum + o.amount, 0),
    pending: offerings.filter(o => o.status === 'pending')
      .reduce((sum, o) => sum + o.amount, 0)
  };

  res.json({ offerings, totals });
});

// Treasurer/admin sees pending verifications
router.get('/pending', authenticate, requireRole('treasurer', 'admin'), (req, res) => {
  const offerings = db.prepare(`
    SELECT o.*, c.name AS cell_name, u.name AS leader_name, u.phone AS leader_phone
    FROM offerings o
    JOIN cells c ON c.id = o.cell_id
    JOIN users u ON u.id = o.submitted_by
    WHERE o.status = 'pending'
    ORDER BY o.created_at ASC
  `).all();
  res.json({ offerings });
});

// Treasurer/admin sees all offerings (history/reports)
router.get('/', authenticate, requireRole('treasurer', 'admin'), (req, res) => {
  const offerings = db.prepare(`
    SELECT o.*, c.name AS cell_name, u.name AS leader_name,
      r.paid_at AS reimbursed_at
    FROM offerings o
    JOIN cells c ON c.id = o.cell_id
    JOIN users u ON u.id = o.submitted_by
    LEFT JOIN reimbursements r ON r.offering_id = o.id
    ORDER BY o.created_at DESC
  `).all();
  res.json({ offerings });
});

// Treasurer verifies a pending offering
router.patch('/:id/verify', authenticate, requireRole('treasurer', 'admin'), (req, res) => {
  const offering = db.prepare('SELECT * FROM offerings WHERE id = ?').get(req.params.id);
  if (!offering) return res.status(404).json({ error: 'Offering not found' });
  if (offering.status !== 'pending') {
    return res.status(400).json({ error: `Offering is already ${offering.status}` });
  }

  db.prepare(`
    UPDATE offerings SET status = 'verified', verified_by = ?, verified_at = datetime('now')
    WHERE id = ?
  `).run(req.user.id, offering.id);

  logAudit(req.user.id, 'verify_offering', `Verified offering #${offering.id} (GHS ${offering.amount}, txn ${offering.momo_transaction_id})`);

  res.json({ offering: db.prepare('SELECT * FROM offerings WHERE id = ?').get(offering.id) });
});

// Treasurer rejects a pending offering with a reason
router.patch('/:id/reject', authenticate, requireRole('treasurer', 'admin'), (req, res) => {
  const { reason } = req.body || {};
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'A rejection reason is required' });
  }

  const offering = db.prepare('SELECT * FROM offerings WHERE id = ?').get(req.params.id);
  if (!offering) return res.status(404).json({ error: 'Offering not found' });
  if (offering.status !== 'pending') {
    return res.status(400).json({ error: `Offering is already ${offering.status}` });
  }

  db.prepare("UPDATE offerings SET status = 'rejected', rejection_reason = ?, verified_by = ?, verified_at = datetime('now') WHERE id = ?")
    .run(String(reason).trim(), req.user.id, offering.id);

  logAudit(req.user.id, 'reject_offering', `Rejected offering #${offering.id}: ${String(reason).trim()}`);

  res.json({ offering: db.prepare('SELECT * FROM offerings WHERE id = ?').get(offering.id) });
});

module.exports = router;
