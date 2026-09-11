const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { get, run } = require('../database');

let cachedSecret = null;

function getJwtSecret() {
  if (cachedSecret && !cachedSecret.startsWith('gyroidvault-temp-')) return cachedSecret;

  // 1. Check process.env.JWT_SECRET
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    cachedSecret = process.env.JWT_SECRET.trim();
    return cachedSecret;
  }

  // 2. Check system_settings in SQLite database
  try {
    const row = get("SELECT value FROM system_settings WHERE key = 'jwt_secret'");
    if (row && row.value && row.value.trim().length >= 32) {
      cachedSecret = row.value.trim();
      return cachedSecret;
    }

    // 3. Generate a secure random 256-bit secret and persist it
    const newSecret = crypto.randomBytes(32).toString('hex');
    run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('jwt_secret', ?)", [newSecret]);
    cachedSecret = newSecret;
    console.log('✓ Generated and persisted secure 256-bit JWT secret key.');
    return cachedSecret;
  } catch (err) {
    // Database might not be ready yet during module load
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    return 'gyroidvault-temp-' + crypto.randomBytes(16).toString('hex');
  }
}

function authenticate(req, res, next) {
  let token = req.cookies.pv_token;
  let isApiToken = false;
  
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
    isApiToken = true;
  }
  
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);
    
    // CSRF protection for state-changing methods (skip if using API token)
    if (!isApiToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
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

module.exports = {
  authenticate,
  requireAdmin,
  requireUploader,
  getJwtSecret
};
