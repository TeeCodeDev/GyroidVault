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
    
    let emailSent = false;
    try {
      const { sendInviteEmail } = require('../utils/email');
      await sendInviteEmail(email, token, req);
      emailSent = true;
    } catch (mailErr) {
      // SMTP not configured or failed - allow admin to use/copy the invite token
    }
    
    res.json({ message: emailSent ? 'Invitation sent' : 'Invitation created (SMTP not configured)', token });
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

﻿// ─── OIDC / SSO AUTHENTICATION (Discussion #65) ───────────────────────────
router.get('/oidc/login', authLimiter, async (req, res) => {
  try {
    const oidc = require('../utils/oidc');
    const config = oidc.getOidcConfig();

    if (!config.oidc_enabled) {
      return res.status(400).json({ error: 'Single Sign-On (OIDC) is not enabled on this instance' });
    }
    if (!config.oidc_issuer_url || !config.oidc_client_id) {
      return res.status(500).json({ error: 'OIDC is not fully configured (missing issuer URL or client ID)' });
    }

    const endpoints = await oidc.discoverOidcEndpoints(config.oidc_issuer_url);
    if (!endpoints.authorization_endpoint) {
      return res.status(502).json({ error: 'Failed to discover OIDC authorization endpoint' });
    }

    const state = crypto.randomBytes(24).toString('hex');
    const nonce = crypto.randomBytes(24).toString('hex');

    const redirectUri = oidc.getRedirectUri(req, config.oidc_redirect_uri);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

    res.cookie('oidc_state', state, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000 // 10 minutes
    });
    res.cookie('oidc_nonce', nonce, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000
    });

    const authUrl = new URL(endpoints.authorization_endpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.oidc_client_id);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', config.oidc_scopes || 'openid profile email groups');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    res.redirect(authUrl.toString());
  } catch (err) {
    console.error('OIDC Login error:', err);
    res.redirect('/?error=sso_failed&message=' + encodeURIComponent(err.message || 'Failed to initiate SSO login'));
  }
});

router.get('/oidc/callback', authLimiter, async (req, res) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const clearOidcCookies = () => {
    res.clearCookie('oidc_state');
    res.clearCookie('oidc_nonce');
  };

  try {
    const oidc = require('../utils/oidc');
    const config = oidc.getOidcConfig();

    if (!config.oidc_enabled) {
      clearOidcCookies();
      return res.redirect('/?error=sso_failed&message=' + encodeURIComponent('Single Sign-On is disabled'));
    }

    if (req.query.error) {
      clearOidcCookies();
      const desc = req.query.error_description || req.query.error;
      return res.redirect('/?error=sso_failed&message=' + encodeURIComponent(desc));
    }

    const { code, state } = req.query;
    const cookieState = req.cookies.oidc_state;

    if (!state || !cookieState || state !== cookieState) {
      clearOidcCookies();
      return res.redirect('/?error=sso_failed&message=' + encodeURIComponent('Invalid or expired OIDC state parameter. Please try again.'));
    }

    if (!code) {
      clearOidcCookies();
      return res.redirect('/?error=sso_failed&message=' + encodeURIComponent('Missing authorization code from Identity Provider'));
    }

    const endpoints = await oidc.discoverOidcEndpoints(config.oidc_issuer_url);
    if (!endpoints.token_endpoint) {
      clearOidcCookies();
      return res.redirect('/?error=sso_failed&message=' + encodeURIComponent('OIDC token endpoint not available'));
    }

    const redirectUri = oidc.getRedirectUri(req, config.oidc_redirect_uri);

    const tokenParams = new URLSearchParams();
    tokenParams.set('grant_type', 'authorization_code');
    tokenParams.set('code', String(code));
    tokenParams.set('redirect_uri', redirectUri);
    tokenParams.set('client_id', config.oidc_client_id);
    if (config.oidc_client_secret) {
      tokenParams.set('client_secret', config.oidc_client_secret);
    }

    const tokenHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'GyroidVault-OIDC'
    };

    if (config.oidc_client_id && config.oidc_client_secret) {
      tokenHeaders['Authorization'] = 'Basic ' + Buffer.from(config.oidc_client_id + ':' + config.oidc_client_secret).toString('base64');
    }

    const tokenRes = await fetch(endpoints.token_endpoint, {
      method: 'POST',
      headers: tokenHeaders,
      body: tokenParams.toString()
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => '');
      console.error('OIDC Token Exchange failed:', tokenRes.status, errBody);
      clearOidcCookies();
      return res.redirect('/?error=sso_failed&message=' + encodeURIComponent('Failed to exchange authorization code for tokens'));
    }

    const tokenData = await tokenRes.json();
    const idClaims = oidc.parseJwtPayload(tokenData.id_token);

    let userinfo = {};
    if (endpoints.userinfo_endpoint && tokenData.access_token) {
      try {
        const uRes = await fetch(endpoints.userinfo_endpoint, {
          headers: {
            'Authorization': 'Bearer ' + tokenData.access_token,
            'Accept': 'application/json',
            'User-Agent': 'GyroidVault-OIDC'
          }
        });
        if (uRes.ok) {
          userinfo = await uRes.json();
        }
      } catch (uiErr) {
        console.warn('OIDC Userinfo fetch warning:', uiErr.message);
      }
    }

    const sub = String(userinfo.sub || idClaims.sub || '').trim();
    if (!sub) {
      clearOidcCookies();
      return res.redirect('/?error=sso_failed&message=' + encodeURIComponent('Identity Provider did not provide a unique subject (sub) claim'));
    }

    const email = String(userinfo.email || idClaims.email || '').trim().toLowerCase();
    let username = String(
      userinfo.preferred_username ||
      userinfo.username ||
      userinfo.nickname ||
      idClaims.preferred_username ||
      idClaims.username ||
      idClaims.nickname ||
      (email ? email.split('@')[0] : '') ||
      ('sso_' + sub.slice(0, 8))
    ).trim();

    username = username.replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 32) || ('sso_' + sub.slice(0, 8));

    const rawGroups = userinfo.groups || userinfo.roles || idClaims.groups || idClaims.roles || [];
    const mappedRole = oidc.resolveUserRole(rawGroups, config);

    let user = get('SELECT * FROM users WHERE oidc_sub = ?', [sub]);

    if (!user && email) {
      user = get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
      if (user) {
        run('UPDATE users SET oidc_sub = ? WHERE id = ?', [sub, user.id]);
        user.oidc_sub = sub;
      }
    }

    if (!user) {
      if (!config.oidc_auto_create_user) {
        clearOidcCookies();
        return res.redirect('/?error=sso_failed&message=' + encodeURIComponent('No matching GyroidVault account found and auto-provisioning is disabled'));
      }

      const totalUsers = get('SELECT COUNT(*) as c FROM users').c;
      const initialRole = totalUsers === 0 ? 'admin' : mappedRole;

      let candidateUsername = username;
      let counter = 1;
      while (get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [candidateUsername])) {
        candidateUsername = username + '_' + (counter++);
      }

      const disabledHash = '!oidc_' + crypto.randomBytes(16).toString('hex');
      const ins = run(
        'INSERT INTO users (username, email, password_hash, role, oidc_sub) VALUES (?, ?, ?, ?, ?)',
        [candidateUsername, email || null, disabledHash, initialRole, sub]
      );
      user = get('SELECT * FROM users WHERE id = ?', [ins.lastId]);
    } else {
      if (user.id !== 1 && mappedRole && mappedRole !== user.role && (config.oidc_admin_group || config.oidc_uploader_group || config.oidc_viewer_group)) {
        run('UPDATE users SET role = ? WHERE id = ?', [mappedRole, user.id]);
        user.role = mappedRole;
      }
    }

    clearOidcCookies();

    const csrfToken = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign({ id: user.id, role: user.role, csrfToken }, getJwtSecret(), { expiresIn: '30d' });

    res.cookie('pv_token', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.redirect('/?sso=1');
  } catch (err) {
    console.error('OIDC Callback error:', err);
    clearOidcCookies();
    res.redirect('/?error=sso_failed&message=' + encodeURIComponent(err.message || 'SSO authentication failed'));
  }
});


module.exports = router;
