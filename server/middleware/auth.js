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

    // Viewers cannot modify state
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.user.role === 'viewer') {
      if (!req.path.startsWith('/api/auth/profile') && !req.path.startsWith('/api/auth/logout')) {
        return res.status(403).json({ error: 'Viewer accounts cannot modify data' });
      }
    }

    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ error: 'Admin privileges required' });
}

function requireUploader(req, res, next) {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'uploader' || req.user.role === 'user')) next();
  else res.status(403).json({ error: 'Uploader privileges required' });
}

module.exports = { authenticate, requireAdmin, requireUploader, SECRET };
