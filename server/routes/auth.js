const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { get, run } = require('../database');
const { authenticate, getJwtSecret } = require('../middleware/auth');
const { authLimiter, loginLimiter } = require('../middleware/rateLimit');
const { getSettingBool } = require('../utils/modelHelpers');

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, password, email, invite_token } = req.body;
    if (!username || !password || !email) return res.status(400).json({ error: 'Missing fields' });
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers' });
    }
    
    const userCount = get('SELECT COUNT(*) as count FROM users').count;
    let role = 'user';

    // If there are existing users, require a valid invite token unless open registration is enabled
    if (userCount > 0) {
      if (!getSettingBool('open_registration')) {
        if (!invite_token) return res.status(403).json({ error: 'Registration requires an invite token' });
        const invite = get("SELECT * FROM user_invites WHERE token=? AND expires_at > datetime('now')", [invite_token]);
        if (!invite) return res.status(400).json({ error: 'Invalid or expired invite token' });
        if (invite.email.toLowerCase() !== email.toLowerCase()) {
          return res.status(400).json({ error: 'Email does not match the invitation' });
        }
      }
    } else {
      role = 'admin';
    }
    
    const hash = await bcrypt.hash(password, 10);
    const r = run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', [username, email, hash, role]);
    
    if (invite_token) {
      run('DELETE FROM user_invites WHERE token=?', [invite_token]);
    }

    res.status(201).json({ id: r.lastId, username, email, role });
  } catch (e) { 
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username or Email taken' });
    console.error(e); res.status(500).json({ error: 'Registration failed' }); 
  }
});

router.post('/invite', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    // Check if user exists
    const existing = get('SELECT id FROM users WHERE email=?', [email]);
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const token = crypto.randomBytes(20).toString('hex');
    run("INSERT OR REPLACE INTO user_invites (token, email, expires_at) VALUES (?, ?, datetime('now', '+7 days'))", [token, email]);
    
    const { sendInviteEmail } = require('../utils/email');
    await sendInviteEmail(email, token, req);
    
    res.json({ message: 'Invitation sent' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Failed to send invitation' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

    const identifier = String(username).trim();
    const user = get('SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)', [identifier, identifier]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign({ id: user.id, role: user.role, csrfToken }, getJwtSecret(), { expiresIn: '30d' });
    
    res.cookie('pv_token', token, { 
      httpOnly: true, 
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https', 
      sameSite: 'strict', 
      maxAge: 30 * 24 * 60 * 60 * 1000 
    });
    
    res.json({ csrfToken, user: { id: user.id, username: user.username, role: user.role, email: user.email } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Login failed' }); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('pv_token');
  res.json({ message: 'Logged out' });
});

router.get('/me', authenticate, (req, res) => {
  const user = get('SELECT id, username, email, role, preferred_slicer FROM users WHERE id=?', [req.user.id]);
  if (user) user.csrfToken = req.user.csrfToken;
  res.json(user);
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const { username, email, password, preferred_slicer } = req.body;
    const updates = [], params = [];
    if (username) { updates.push('username=?'); params.push(username); }
    if (email) { updates.push('email=?'); params.push(email); }
    if (preferred_slicer !== undefined) { updates.push('preferred_slicer=?'); params.push(preferred_slicer); }
    if (password) { 
      if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers' });
      }
      const hash = await bcrypt.hash(password, 10);
      updates.push('password_hash=?'); params.push(hash);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.user.id);
    run(`UPDATE users SET ${updates.join(',')} WHERE id=?`, params);
    res.json({ success: true });
  } catch (e) { 
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username or Email taken' });
    console.error(e); res.status(500).json({ error: 'Profile update failed' }); 
  }
});

router.post('/api-key', authenticate, (req, res) => {
  try {
    const token = jwt.sign(
      { id: req.user.id, username: req.user.username, role: req.user.role },
      getJwtSecret()
    );
    res.json({ api_key: token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to generate API Key' });
  }
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = get('SELECT * FROM users WHERE email=?', [email]);
    if (!user) return res.json({ message: 'If that email exists, we sent a reset link' });
    
    const token = crypto.randomBytes(20).toString('hex');
    run("UPDATE users SET password_reset_token=?, password_reset_expires=datetime('now', '+1 hour') WHERE id=?", [token, user.id]);
    
    const { sendResetEmail } = require('../utils/email');
    await sendResetEmail(email, token, req);
    res.json({ message: 'Reset email sent' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to send reset email' }); }
});

router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required' });
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers' });
    }
    const user = get("SELECT * FROM users WHERE password_reset_token=? AND password_reset_expires > datetime('now')", [token]);
    if (!user) return res.status(400).json({ error: 'Token invalid or expired' });
    
    const hash = await bcrypt.hash(password, 10);
    run("UPDATE users SET password_hash=?, password_reset_token=NULL, password_reset_expires=NULL WHERE id=?", [hash, user.id]);
    res.json({ message: 'Password reset successful' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to reset password' }); }
});

module.exports = router;
