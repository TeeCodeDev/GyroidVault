const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'printvault-secret-key-2026';

function authenticate(req, res, next) {
  const token = req.cookies.pv_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, SECRET);
    
    // CSRF protection for state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const csrfToken = req.headers['x-csrf-token'];
      if (!csrfToken || csrfToken !== decoded.csrfToken) {
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
      }
    }
    
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authenticate, SECRET };
