const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

require('./db');
const authRoutes = require('./routes/auth');
const offeringRoutes = require('./routes/offerings');
const reimbursementRoutes = require('./routes/reimbursements');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// basic rate limit middleware for API in general (login has its own stricter one)
let requestCount = 0;
let windowStart = Date.now();
app.use((req, res, next) => {
  if (Date.now() - windowStart > 60 * 1000) {
    requestCount = 0;
    windowStart = Date.now();
  }
  requestCount += 1;
  if (requestCount > 3000) {
    return res.status(429).json({ error: 'Too many requests, slow down' });
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/offerings', offeringRoutes);
app.use('/api/reimbursements', reimbursementRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// serve the built client in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Cell Offerings Tracker API running on http://localhost:${PORT}`);
});
