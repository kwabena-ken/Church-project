const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  console.warn('WARNING: JWT_SECRET not set, using insecure dev secret');
}

const DEV_SECRET = 'dev-only-secret-do-not-use-in-production';
const TOKEN_TTL = '12h';

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, cell_id: user.cell_id, name: user.name },
    JWT_SECRET || DEV_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET || DEV_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { signToken, authenticate, requireRole };
