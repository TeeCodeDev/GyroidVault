require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { initDatabase, all, get, run, UPLOADS_DIR } = require('./database');
const { upload, getFileType, setUploadsDir } = require('./middleware/upload');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticate, requireAdmin, requireUploader, getJwtSecret } = require('./middleware/auth');
const { validatePathConfinement, safeInt, safeUrl } = require('./middleware/security');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const LIBRARY_PATH = process.env.LIBRARY_PATH || path.join(__dirname, '..', 'data', 'library');

// Ensure library directory exists
if (!fs.existsSync(LIBRARY_PATH)) {
  fs.mkdirSync(LIBRARY_PATH, { recursive: true });
}

function logEvent(level, message) {
  try {
    run('INSERT INTO system_logs (level, message) VALUES (?, ?)', [level, message]);
  } catch (e) {
    console.error('Failed to log event:', e);
  }
}

// ─── FILE SYNC ──────────────────────────────────────────────────
// Quick hack to make sure files in DB didn't get manualy deleted from disk
async function syncLibraryWithDisk() {
  try {
    const files = all('SELECT id, library_path, original_name FROM files WHERE library_path IS NOT NULL');
    let deletedCount = 0;
    for (const file of files) {
      await new Promise(setImmediate); // Yield to event loop
      try {
        await fs.promises.access(file.library_path);
      } catch (err) {
        const msg = `File missing from disk, removing from DB: ${file.original_name}`;
        console.log(`[Sync] ${msg}`);
        logEvent('warning', msg);
        run('DELETE FROM files WHERE id=?', [file.id]);
        deletedCount++;
      }
    }
    
    // Cleanup empty models, otherwise the UI gets cluttered with ghost entries
    const emptyModels = all(`
      SELECT m.id, m.name FROM models m 
      LEFT JOIN files f ON f.model_id = m.id 
      WHERE f.id IS NULL AND m.library_path IS NOT NULL
    `);
    for (const model of emptyModels) {
      await new Promise(setImmediate); // Yield to event loop
      const msg = `Model directory empty/missing, removing model: ${model.name}`;
      console.log(`[Sync] ${msg}`);
      logEvent('warning', msg);
      run('DELETE FROM models WHERE id=?', [model.id]);
      deletedCount++;
    }

    if (deletedCount > 0) logEvent('info', `Library sync complete. Removed ${deletedCount} stale entries.`);
  } catch (e) {
    console.error('[Sync] Error during library sync:', e);
  }
}

// run it every 5 mins
setInterval(syncLibraryWithDisk, 300000);
// Initial sync after boot
setTimeout(syncLibraryWithDisk, 10000);

function getSettingBool(key, defaultValue = false) {
  const row = get('SELECT value FROM system_settings WHERE key=?', [key]);
  if (!row) return defaultValue;
  return row.value === 'true' || row.value === '1';
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https:"],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", "https:", "data:", "blob:", "chrome-extension:", "moz-extension:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://api.github.com", "blob:", "data:"],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(cookieParser());
app.use(express.json());

app.use((req, res, next) => {
  // Always permit public auth, public config, public release notes, and public shares
  if (
    req.path.startsWith('/api/auth/') ||
    req.path === '/api/system/public-config' ||
    req.path.startsWith('/api/shares/') ||
    req.path === '/api/system/updates' ||
    req.path === '/api/system/release-notes' ||
    req.path.startsWith('/js/') ||
    req.path.startsWith('/css/') ||
    req.path === '/' ||
    req.path.startsWith('/index.html')
  ) {
    return next();
  }

  // Populate req.user whenever a valid token is present; enforce if private instance is enabled
  let token = req.cookies.pv_token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (token) {
    try {
      req.user = jwt.verify(token, getJwtSecret());
    } catch(e) {
      if (getSettingBool('require_login_to_view')) {
        return res.status(401).json({ error: 'Private instance - invalid token' });
      }
    }
  } else if (getSettingBool('require_login_to_view')) {
    return res.status(401).json({ error: 'Private instance - login required' });
  }
  next();
});

const blockedIPsStore = new Map(); // ip -> { attempts, blockedAt, expiresAt }

function trackFailedLogin(ip) {
  const now = Date.now();
  const entry = blockedIPsStore.get(ip) || { attempts: 0, blockedAt: null, expiresAt: null };
  entry.attempts += 1;
  if (entry.attempts >= 3) {
    entry.blockedAt = new Date().toISOString();
    entry.expiresAt = new Date(now + 15 * 60 * 1000).toISOString();
  }
  blockedIPsStore.set(ip, entry);
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  validate: { xForwardedForHeader: false }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again after 15 minutes.' },
  validate: { xForwardedForHeader: false }
});

const heavyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many resource-intensive requests, please try again later.' },
  validate: { xForwardedForHeader: false }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  handler: (req, res) => {
    trackFailedLogin(req.ip || req.connection.remoteAddress);
    res.status(429).json({ error: 'Too many login attempts from this IP, please try again after 15 minutes' });
  },
  validate: { xForwardedForHeader: false }
});

// Apply baseline rate limiting to all /api routes
app.use('/api', apiLimiter);

// ─── AUTH ───────────────────────────────────────────────────────────────────

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, password, email, invite_token } = req.body;
    if (!username || !password || !email) return res.status(400).json({ error: 'Missing fields' });
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers' });
    }
    
    const userCount = get('SELECT COUNT(*) as count FROM users').count;
    let role = 'user';

    // If there are existing users, require a valid invite token
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

app.post('/api/auth/invite', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    // Check if user exists
    const existing = get('SELECT id FROM users WHERE email=?', [email]);
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const token = require('crypto').randomBytes(20).toString('hex');
    run("INSERT OR REPLACE INTO user_invites (token, email, expires_at) VALUES (?, ?, datetime('now', '+7 days'))", [token, email]);
    
    const { sendInviteEmail } = require('./utils/email');
    await sendInviteEmail(email, token, req);
    
    res.json({ message: 'Invitation sent' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Failed to send invitation' });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = get('SELECT * FROM users WHERE username = ?', [username]);
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

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('pv_token');
  res.json({ message: 'Logged out' });
});

app.get('/api/system/public-config', (req, res) => {
  const userCount = get('SELECT COUNT(*) as count FROM users').count;
  res.json({
    open_registration: getSettingBool('open_registration') || userCount === 0,
    require_login_to_view: getSettingBool('require_login_to_view')
  });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = get('SELECT id, username, email, role, preferred_slicer FROM users WHERE id=?', [req.user.id]);
  if (user) user.csrfToken = req.user.csrfToken;
  res.json(user);
});

app.put('/api/auth/profile', authenticate, async (req, res) => {
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

app.post('/api/auth/api-key', authenticate, (req, res) => {
  try {
    const token = jwt.sign(
      { id: req.user.id, username: req.user.username, role: req.user.role },
      getJwtSecret()
      // No expiration for API tokens (or set a very long one like 10y)
    );
    res.json({ api_key: token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to generate API Key' });
  }
});

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = get('SELECT * FROM users WHERE email=?', [email]);
    if (!user) return res.json({ message: 'If that email exists, we sent a reset link' });
    
    const token = require('crypto').randomBytes(20).toString('hex');
    run("UPDATE users SET password_reset_token=?, password_reset_expires=datetime('now', '+1 hour') WHERE id=?", [token, user.id]);
    
    const { sendResetEmail } = require('./utils/email');
    await sendResetEmail(email, token, req);
    res.json({ message: 'Reset email sent' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to send reset email' }); }
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
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

function getFileUrl(file) {
  if (file.is_archive_entry || (file.library_path && file.library_path.includes('::'))) {
    return `/api/files/${file.id}/stream`;
  }
  if (file.library_path) {
    const relPath = path.relative(LIBRARY_PATH, file.library_path).replace(/\\/g, '/');
    const encodedPath = relPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `/library-files/${encodedPath}`;
  }
  return `/uploads/${file.filename}`;
}

function getThumbUrl(thumbnail, folderPath = null) {
  if (!thumbnail) return null;
  if (thumbnail.startsWith('http')) return thumbnail;
  
  if (fs.existsSync(path.join(UPLOADS_DIR, thumbnail))) {
    return `/uploads/${thumbnail}`;
  }
  
  if (folderPath) {
    const thumbPath = path.join(folderPath, thumbnail);
    if (fs.existsSync(thumbPath)) {
      return getFileUrl({ filename: thumbnail, library_path: thumbPath });
    }
  }
  
  return `/uploads/${thumbnail}`;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
if (fs.existsSync(LIBRARY_PATH)) {
  app.use('/library-files', express.static(LIBRARY_PATH));
}

// Stream file content directly from disk or from inside ZIP archives
app.get('/api/files/:id/stream', (req, res, next) => {
  const shareSlug = req.query.share;
  const doStream = () => {
    try {
      const id = Number(req.params.id);
      const file = get('SELECT * FROM files WHERE id=?', [id]);
      if (!file) return res.status(404).json({ error: 'File not found' });

      if (shareSlug) {
        const share = get("SELECT * FROM shares WHERE id=? AND (expires_at IS NULL OR expires_at > datetime('now'))", [shareSlug]);
        if (!share || file.model_id !== share.model_id) {
          return res.status(403).json({ error: 'Invalid or expired share link' });
        }
      } else {
        // Enforce privacy check: if model is in private project(s), ensure user is owner or admin
        const privateProjects = all('SELECT p.user_id FROM projects p JOIN project_models pm ON p.id=pm.project_id WHERE pm.model_id=? AND p.visibility="private"', [file.model_id]);
        if (privateProjects.length > 0) {
          if (!req.user || (req.user.role !== 'admin' && !privateProjects.some(p => p.user_id === req.user.id))) {
            return res.status(403).json({ error: 'Access denied to private file' });
          }
        }
      }

    if (file.is_archive_entry && file.library_path && file.library_path.includes('::')) {
      const [zipPath, entryPath] = file.library_path.split('::');
      if (!fs.existsSync(zipPath)) return res.status(404).json({ error: 'Archive file not found' });

      const AdmZip = require('adm-zip');
      const zip = new AdmZip(zipPath);
      const entry = zip.getEntry(entryPath);
      if (!entry) return res.status(404).json({ error: 'File not found in archive' });

      const mimeMap = {
        '.stl': 'model/stl',
        '.3mf': 'model/3mf',
        '.obj': 'model/obj',
        '.step': 'model/step',
        '.stp': 'model/step',
        '.f3d': 'application/octet-stream',
        '.gcode': 'text/x-gcode',
        '.bgcode': 'application/octet-stream',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
        '.md': 'text/markdown'
      };
      const ext = path.extname(file.filename).toLowerCase();
      const contentType = mimeMap[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
      return res.send(entry.getData());
    }

    if (file.library_path && fs.existsSync(file.library_path)) {
      const confined = validatePathConfinement(LIBRARY_PATH, path.relative(LIBRARY_PATH, file.library_path));
      if (!confined) return res.status(403).json({ error: 'Access denied' });
      return res.sendFile(confined);
    }
    const uploadPath = path.join(UPLOADS_DIR, file.filename);
    if (fs.existsSync(uploadPath)) {
      const confined = validatePathConfinement(UPLOADS_DIR, path.relative(UPLOADS_DIR, uploadPath));
      if (!confined) return res.status(403).json({ error: 'Access denied' });
      return res.sendFile(confined);
    }

      res.status(404).json({ error: 'File data not found on disk' });
    } catch (e) {
      console.error('Stream error:', e);
      res.status(500).json({ error: 'Failed to stream file' });
    }
  };

  if (shareSlug) {
    doStream();
  } else if (getSettingBool('require_login_to_view')) {
    authenticate(req, res, doStream);
  } else {
    doStream();
  }
});

// ─── MODELS ───────────────────────────────────────────────────────────

app.get('/api/models', (req, res) => {
  try {
    const { search, category, tag, format, user, printed, sort = 'updated', order, project_id, page = 1, limit = 24 } = req.query;
    let query = `SELECT m.*, c.name as category_name, c.color as category_color, u.username as uploader_name,
      (SELECT COUNT(*) FROM files WHERE model_id=m.id) as file_count,
      (SELECT COUNT(*) FROM print_history WHERE model_id=m.id) as print_count,
      (SELECT GROUP_CONCAT(DISTINCT file_type) FROM files WHERE model_id=m.id) as file_types,
      COALESCE(
        (SELECT filename FROM files WHERE id=m.preview_file_id AND file_type IN ('stl','3mf')),
        (SELECT filename FROM files WHERE model_id=m.id AND file_type='stl' ORDER BY uploaded_at DESC LIMIT 1)
      ) as stl_file,
      COALESCE(
        (SELECT library_path FROM files WHERE id=m.preview_file_id AND file_type IN ('stl','3mf')),
        (SELECT library_path FROM files WHERE model_id=m.id AND file_type='stl' ORDER BY uploaded_at DESC LIMIT 1)
      ) as stl_library_path,
      (SELECT filename FROM files WHERE model_id=m.id AND file_type='3mf' ORDER BY uploaded_at DESC LIMIT 1) as mf_file,
      (SELECT library_path FROM files WHERE model_id=m.id AND file_type='3mf' ORDER BY uploaded_at DESC LIMIT 1) as mf_library_path
      FROM models m 
      LEFT JOIN categories c ON m.category_id=c.id
      LEFT JOIN users u ON m.user_id=u.id`;
    
    const conds = [], params = [];
    
    // Filter out versions in main view
    if (!project_id) {
      conds.push("m.parent_id IS NULL");
    }

    if (search) { conds.push("(m.name LIKE ? OR m.description LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
    if (category) { conds.push("m.category_id=?"); params.push(Number(category)); }
    if (tag) { conds.push("m.id IN (SELECT model_id FROM model_tags WHERE tag_id=?)"); params.push(Number(tag)); }
    if (format && format !== 'all') {
      conds.push("m.id IN (SELECT DISTINCT model_id FROM files WHERE file_type=?)");
      params.push(format.toLowerCase());
    }
    if (user) { conds.push("m.user_id=?"); params.push(Number(user)); }
    if (printed === 'true') conds.push("m.id IN (SELECT DISTINCT model_id FROM print_history)");
    else if (printed === 'false') conds.push("m.id NOT IN (SELECT DISTINCT model_id FROM print_history)");
    if (project_id) { conds.push("m.id IN (SELECT model_id FROM project_models WHERE project_id=?)"); params.push(Number(project_id)); }

    let countQuery = 'SELECT COUNT(m.id) as total FROM models m';
    if (conds.length) {
      const whereClause = ' WHERE ' + conds.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }
    
    const totalItems = get(countQuery, params).total;
    const parsedLimit = Number(limit) || 24;
    const parsedPage = Math.max(1, Number(page) || 1);
    const totalPages = Math.ceil(totalItems / parsedLimit);
    const offset = (parsedPage - 1) * parsedLimit;

    const sortMap = { name:'m.name', created:'m.created_at', updated:'m.updated_at', prints:'print_count', files:'file_count' };
    const sqlOrder = order ? (order === 'asc' ? 'ASC' : 'DESC') : (sort === 'name' ? 'ASC' : 'DESC');
    query += ` ORDER BY ${sortMap[sort]||'m.updated_at'} ${sqlOrder} LIMIT ? OFFSET ?`;
    params.push(parsedLimit, offset);
    
    const rawModels = all(query, params);
    const modelIds = rawModels.map(m => m.id);

    // High-performance batched tag and project fetching for all models on current page
    const tagsByModel = {};
    const projectsByModel = {};
    if (modelIds.length) {
      const placeholders = modelIds.map(() => '?').join(',');
      const allTags = all(`SELECT mt.model_id, t.id, t.name FROM tags t JOIN model_tags mt ON mt.tag_id=t.id WHERE mt.model_id IN (${placeholders})`, modelIds);
      allTags.forEach(t => {
        if (!tagsByModel[t.model_id]) tagsByModel[t.model_id] = [];
        tagsByModel[t.model_id].push({ id: t.id, name: t.name });
      });

      const allProjects = all(`SELECT pm.model_id, p.id, p.name, p.visibility FROM projects p JOIN project_models pm ON pm.project_id=p.id WHERE pm.model_id IN (${placeholders})`, modelIds);
      allProjects.forEach(p => {
        if (!projectsByModel[p.model_id]) projectsByModel[p.model_id] = [];
        projectsByModel[p.model_id].push({ id: p.id, name: p.name, visibility: p.visibility });
      });
    }

    const models = rawModels.map(m => {
      let stl_url = null;
      if (m.stl_file) {
        stl_url = getFileUrl({ filename: m.stl_file, library_path: m.stl_library_path });
      } else if (m.mf_file) {
        stl_url = getFileUrl({ filename: m.mf_file, library_path: m.mf_library_path });
      }
      
      let thumb_url = getThumbUrl(m.thumbnail, m.library_path);

      return {
        ...m,
        thumbnail: thumb_url,
        stl_file: stl_url,
        file_types: m.file_types ? [...new Set(m.file_types.split(','))] : [],
        tags: tagsByModel[m.id] || [],
        projects: projectsByModel[m.id] || [],
        has_printed: m.print_count > 0,
      };
    });

    const totalSizeObj = get('SELECT SUM(file_size) as total_bytes FROM files');
    const totalStorageBytes = totalSizeObj?.total_bytes || 0;
    
    res.json({
      models,
      totalItems,
      totalPages,
      currentPage: parsedPage,
      limit: parsedLimit,
      totalStorageBytes
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch models' }); }
});

app.get('/api/models/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const model = get('SELECT m.*,c.name as category_name,c.color as category_color, u.username as uploader_name FROM models m LEFT JOIN categories c ON m.category_id=c.id LEFT JOIN users u ON m.user_id=u.id WHERE m.id=?', [id]);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    // Enforce private collection access control
    const privateProjects = all('SELECT p.id, p.user_id FROM projects p JOIN project_models pm ON p.id=pm.project_id WHERE pm.model_id=? AND p.visibility="private"', [id]);
    const publicProjects = all('SELECT p.id FROM projects p JOIN project_models pm ON p.id=pm.project_id WHERE pm.model_id=? AND p.visibility="public"', [id]);
    if (privateProjects.length > 0 && publicProjects.length === 0) {
      if (!req.user || (req.user.role !== 'admin' && !privateProjects.some(p => p.user_id === req.user.id) && model.user_id !== req.user.id)) {
        return res.status(403).json({ error: 'Access denied to private model' });
      }
    }

    if (model.thumbnail) {
      model.thumbnail_url = getThumbUrl(model.thumbnail, model.library_path);
    }

    model.files = all('SELECT f.*, u.username as uploader_name FROM files f LEFT JOIN users u ON f.user_id=u.id WHERE f.model_id=? ORDER BY (CASE WHEN f.id = ? THEN 0 ELSE 1 END), f.uploaded_at DESC', [model.id, model.preview_file_id || 0]).map(f => ({
      ...f,
      is_preview: Boolean(model.preview_file_id && f.id === model.preview_file_id),
      url: getFileUrl(f)
    }));
    model.prints = all('SELECT ph.*,mat.name as material_name, u.username as printer_name FROM print_history ph LEFT JOIN materials mat ON ph.material_id=mat.id LEFT JOIN users u ON ph.user_id=u.id WHERE ph.model_id=? ORDER BY ph.printed_at DESC', [model.id]);
    model.tags = all('SELECT t.id,t.name FROM tags t JOIN model_tags mt ON mt.tag_id=t.id WHERE mt.model_id=?', [model.id]);
    model.projects = all('SELECT p.id, p.name, p.visibility FROM projects p JOIN project_models pm ON p.id=pm.project_id WHERE pm.model_id=?', [model.id]);
    model.has_printed = model.prints.length > 0;
    
    // Versions
    const rootId = parent_id = model.parent_id || model.id;
    model.versions = all(`
      SELECT id, name, created_at, 
      (SELECT COUNT(*) FROM files WHERE model_id = models.id) as file_count 
      FROM models 
      WHERE (id = ? OR parent_id = ?) AND id != ? 
      ORDER BY created_at DESC`, [rootId, rootId, model.id]);

    res.json(model);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch model' }); }
});

app.put('/api/models/:id/preview-file', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    const { file_id } = req.body;
    const model = get('SELECT * FROM models WHERE id=?', [id]);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    if (req.user.role !== 'admin' && model.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const file = get('SELECT * FROM files WHERE id=? AND model_id=?', [Number(file_id), id]);
    if (!file) return res.status(404).json({ error: 'File not found on this model' });

    run("UPDATE models SET preview_file_id=?, updated_at=datetime('now') WHERE id=?", [file.id, id]);

    // If file has a thumbnail or is an image, update model thumbnail; if 3D, clear old snapshot so 3D preview renders
    if (file.thumbnail) {
      run('UPDATE models SET thumbnail=? WHERE id=?', [file.thumbnail, id]);
    } else if (file.file_type === 'image') {
      run('UPDATE models SET thumbnail=? WHERE id=?', [file.filename, id]);
    } else if (file.file_type === 'stl' || file.file_type === '3mf') {
      run('UPDATE models SET thumbnail=NULL WHERE id=?', [id]);
    }

    res.json({ success: true, preview_file_id: file.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to set preview file' });
  }
});

app.post('/api/models/:id/versions', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    const parent = get('SELECT * FROM models WHERE id = ?', [id]);
    if (!parent) return res.status(404).json({ error: 'Parent model not found' });

    const rootId = parent.parent_id || parent.id;
    const { name, description } = req.body;
    
    const r = run(`
      INSERT INTO models (name, description, category_id, user_id, parent_id) 
      VALUES (?, ?, ?, ?, ?)`, 
      [name || `${parent.name} (New Version)`, description || parent.description, parent.category_id, req.user.id, rootId]
    );
    
    // Copy tags
    const tags = all('SELECT tag_id FROM model_tags WHERE model_id = ?', [id]);
    for (const t of tags) {
      run('INSERT INTO model_tags (model_id, tag_id) VALUES (?, ?)', [r.lastId, t.tag_id]);
    }

    res.status(201).json({ id: r.lastId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create version' }); }
});

app.post('/api/library/scan', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { startScanAsync } = require('./utils/library');
    const result = startScanAsync(LIBRARY_PATH);
    if (result.alreadyRunning) {
      return res.status(409).json({ error: 'A library scan is already in progress', status: result.status });
    }
    res.json({ message: 'Library scan started in background', status: result.status });
  } catch (e) {
    console.error('Scan start error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/library/scan/status', authenticate, (req, res) => {
  try {
    const { getScanStatus } = require('./utils/library');
    res.json(getScanStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/library/scan/cancel', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { cancelScan, getScanStatus } = require('./utils/library');
    const cancelled = cancelScan();
    res.json({ cancelled, status: getScanStatus() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/models', authenticate, requireUploader, (req, res) => {
  const userId = req.user.id;
  try {
    let { name, description, print_tips, source_url, category_id, tags, custom_meta, parent_folder, create_subfolder, auto_rename } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    
    let trimmedName = name.trim();
    let safeName = trimmedName.replace(/[<>:"/\\|?*]/g, '').trim() || `model_${Date.now()}`;
    
    // Strict path confinement check on parent_folder
    let basePath = LIBRARY_PATH;
    if (parent_folder) {
      const confined = validatePathConfinement(LIBRARY_PATH, parent_folder);
      if (!confined) return res.status(400).json({ error: 'Invalid parent folder path' });
      basePath = confined;
    }

    let libPath = create_subfolder !== false && create_subfolder !== 'false' ? path.join(basePath, safeName) : basePath;
    const confinedLib = validatePathConfinement(LIBRARY_PATH, path.relative(LIBRARY_PATH, libPath));
    if (!confinedLib) return res.status(400).json({ error: 'Invalid model folder path' });
    libPath = confinedLib;

    if (source_url) {
      source_url = safeUrl(source_url);
    }

    // Check if model with this name or library_path already exists
    const existingModel = get('SELECT id, name, library_path FROM models WHERE name = ? OR library_path = ?', [trimmedName, libPath]);
    if (existingModel) {
      const isAvailable = (candidate) => {
        const safe = candidate.replace(/[<>:"/\\|?*]/g, '').trim();
        const p = create_subfolder !== false && create_subfolder !== 'false' ? path.join(basePath, safe) : basePath;
        return !get('SELECT id FROM models WHERE name = ? OR library_path = ?', [candidate, p]);
      };

      const suggestions = [];
      const currentYear = new Date().getFullYear();

      // 1. Versioning: detect if name ends with v1, v2, etc.
      const versionMatch = trimmedName.match(/^(.*?)\s*\(?v(\d+)\)?$/i);
      if (versionMatch) {
        const base = versionMatch[1].trim();
        const nextVer = parseInt(versionMatch[2], 10) + 1;
        const vCandidate = `${base} v${nextVer}`;
        if (isAvailable(vCandidate)) suggestions.push(vCandidate);
      } else {
        const vCandidate = `${trimmedName} (v2)`;
        if (isAvailable(vCandidate)) suggestions.push(vCandidate);
      }

      // 2. Creative / Workflow suffixes
      const contextualVariants = [
        `${trimmedName} - Remix`,
        `${trimmedName} (Mod)`,
        `${trimmedName} - Variant`,
        `${trimmedName} [${currentYear}]`,
        `${trimmedName} (Copy)`
      ];

      for (const v of contextualVariants) {
        if (isAvailable(v) && !suggestions.includes(v)) {
          suggestions.push(v);
        }
      }

      // 3. Numbered fallback
      let counter = 2;
      while (suggestions.length < 5 && counter < 100) {
        const numCandidate = `${trimmedName} (${counter})`;
        if (isAvailable(numCandidate) && !suggestions.includes(numCandidate)) {
          suggestions.push(numCandidate);
        }
        counter++;
      }

      const primarySuggestion = suggestions[0] || `${trimmedName} (2)`;

      if (auto_rename !== true && auto_rename !== 'true') {
        return res.status(409).json({
          error: `A model with the name "${trimmedName}" already exists.`,
          suggested_name: primarySuggestion,
          suggested_names: suggestions
        });
      }

      trimmedName = primarySuggestion;
      safeName = trimmedName.replace(/[<>:"/\\|?*]/g, '').trim();
      libPath = create_subfolder !== false && create_subfolder !== 'false' ? path.join(basePath, safeName) : basePath;
      const reconfined = validatePathConfinement(LIBRARY_PATH, path.relative(LIBRARY_PATH, libPath));
      if (!reconfined) return res.status(400).json({ error: 'Invalid model folder path' });
      libPath = reconfined;
    }

    try {
      if (!fs.existsSync(libPath)) fs.mkdirSync(libPath, { recursive: true });
    } catch (dirErr) {
      console.warn('Could not create library folder for model:', dirErr);
    }

    let metaStr = '{}';
    if (custom_meta !== undefined) {
      metaStr = typeof custom_meta === 'string' ? custom_meta : JSON.stringify(custom_meta);
    }

    const r = run('INSERT INTO models (name,description,print_tips,source_url,category_id,custom_meta,user_id,library_path) VALUES (?,?,?,?,?,?,?,?)',
      [trimmedName, description||'', print_tips||'', source_url||'', category_id||null, metaStr, userId, libPath]);
    if (tags?.length) { 
      for (const t of tags) {
        let tagId = t;
        if (typeof t === 'string') {
          run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [t]);
          tagId = get('SELECT id FROM tags WHERE name=?', [t]).id;
        }
        run('INSERT OR IGNORE INTO model_tags (model_id,tag_id) VALUES (?,?)', [r.lastId, tagId]); 
      }
    }
    res.status(201).json(get('SELECT * FROM models WHERE id=?', [r.lastId]));
  } catch (e) {
    console.error('Failed to create model:', e);
    res.status(500).json({ error: 'Failed to create model' });
  }
});

app.put('/api/models/:id', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    const model = get('SELECT * FROM models WHERE id=?', [id]);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    if (req.user.role !== 'admin' && model.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const { name, description, print_tips, source_url, category_id, tags, custom_meta } = req.body;
    
    let metaStr = model.custom_meta;
    if (custom_meta !== undefined) {
      metaStr = typeof custom_meta === 'string' ? custom_meta : JSON.stringify(custom_meta);
    }

    let cleanSourceUrl = model.source_url;
    if (source_url !== undefined) {
      cleanSourceUrl = safeUrl(source_url);
    }

    run("UPDATE models SET name=?,description=?,print_tips=?,source_url=?,category_id=?,custom_meta=?,updated_at=datetime('now') WHERE id=?",
      [name||model.name, description!==undefined?description:model.description, print_tips!==undefined?print_tips:model.print_tips, cleanSourceUrl, category_id!==undefined?category_id:model.category_id, metaStr, id]);
    if (tags !== undefined) {
      run('DELETE FROM model_tags WHERE model_id=?', [id]);
      if (tags?.length) {
        for (const t of tags) {
          let tagId = t;
          if (typeof t === 'string') {
            run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [t]);
            tagId = get('SELECT id FROM tags WHERE name=?', [t]).id;
          }
          run('INSERT OR IGNORE INTO model_tags (model_id,tag_id) VALUES (?,?)', [id, tagId]);
        }
      }
    }
    res.json(get('SELECT * FROM models WHERE id=?', [id]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update model' }); }
});

// Helper to delete a single model and its associated files
function deleteModelInternal(id, deleteDisk = false) {
  const model = get('SELECT * FROM models WHERE id=?', [id]);
  if (!model) return false;
  const files = all('SELECT filename, library_path FROM files WHERE model_id=?', [id]);

  for (const f of files) { 
    const p = path.join(UPLOADS_DIR, f.filename); 
    if (fs.existsSync(p)) fs.unlinkSync(p); 
    if (deleteDisk && f.library_path && fs.existsSync(f.library_path)) {
      try { fs.unlinkSync(f.library_path); } catch(err) { console.error('Failed to delete physical file:', err); }
    }
  }
  
  if (model.thumbnail) { 
    const p = path.join(UPLOADS_DIR, model.thumbnail); 
    if (fs.existsSync(p)) fs.unlinkSync(p); 
    if (deleteDisk && model.library_path && fs.existsSync(path.join(model.library_path, model.thumbnail))) {
      try { fs.unlinkSync(path.join(model.library_path, model.thumbnail)); } catch(err) { console.error('Failed to delete physical thumbnail:', err); }
    }
  }
  
  if (deleteDisk && model.library_path && fs.existsSync(model.library_path)) {
    try {
      if (fs.readdirSync(model.library_path).length === 0) {
        fs.rmdirSync(model.library_path);
      }
    } catch(err) {}
  }
  run('DELETE FROM models WHERE id=?', [id]);
  return true;
}

app.delete('/api/models/:id', authenticate, (req, res) => {
  try {
    if (!req.user || req.user.role === 'viewer') return res.status(403).json({ error: 'Viewer accounts cannot delete data' });
    const id = Number(req.params.id);
    const model = get('SELECT user_id FROM models WHERE id=?', [id]);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    if (req.user.role !== 'admin' && model.user_id && model.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const deleteDisk = req.query.deleteDisk === 'true';
    const success = deleteModelInternal(id, deleteDisk);
    if (!success) return res.status(404).json({ error: 'Model not found' });
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete model' }); }
});

app.post('/api/models/bulk-delete', authenticate, (req, res) => {
  try {
    if (!req.user || req.user.role === 'viewer') return res.status(403).json({ error: 'Viewer accounts cannot delete data' });
    const { ids, deleteDisk } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'IDs array required' });
    let count = 0;
    for (const id of ids) {
      const numId = Number(id);
      const model = get('SELECT user_id FROM models WHERE id=?', [numId]);
      if (model && (req.user.role === 'admin' || !model.user_id || model.user_id === req.user.id)) {
        if (deleteModelInternal(numId, !!deleteDisk)) count++;
      }
    }
    res.json({ success: true, count });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed bulk delete' }); }
});

app.post('/api/models/bulk-update', authenticate, (req, res) => {
  try {
    const { ids, category_id, tags, add_tags, remove_tags } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'IDs array required' });
    
    for (const id of ids) {
      if (req.user.role !== 'admin') {
        const model = get('SELECT user_id FROM models WHERE id=?', [id]);
        if (model && model.user_id !== req.user.id) continue;
      }
      
      if (category_id !== undefined) {
        run("UPDATE models SET category_id=?, updated_at=datetime('now') WHERE id=?", [category_id || null, id]);
      }

      if (add_tags && Array.isArray(add_tags)) {
        for (const t of add_tags) {
          if (!t) continue;
          run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [t]);
          const tagRow = get('SELECT id FROM tags WHERE name=?', [t]);
          if (tagRow) {
            run('INSERT OR IGNORE INTO model_tags (model_id,tag_id) VALUES (?,?)', [id, tagRow.id]);
          }
        }
      }

      if (remove_tags && Array.isArray(remove_tags)) {
        for (const t of remove_tags) {
          if (!t) continue;
          const tagRow = get('SELECT id FROM tags WHERE name=?', [t]);
          if (tagRow) {
            run('DELETE FROM model_tags WHERE model_id=? AND tag_id=?', [id, tagRow.id]);
          }
        }
      }

      if (tags !== undefined) {
        run('DELETE FROM model_tags WHERE model_id=?', [id]);
        if (tags?.length) {
          for (const t of tags) {
            let tagId = t;
            if (typeof t === 'string') {
              run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [t]);
              const tagRow = get('SELECT id FROM tags WHERE name=?', [t]);
              tagId = tagRow ? tagRow.id : null;
            }
            if (tagId) {
              run('INSERT OR IGNORE INTO model_tags (model_id,tag_id) VALUES (?,?)', [id, tagId]);
            }
          }
        }
      }
    }
    res.json({ success: true, count: ids.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed bulk update' }); }
});

// ─── FILES ──────────────────────────────────────────────────────────────────

app.post('/api/upload-slicer', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const filename = req.file.originalname;
    const name = path.parse(filename).name;
    const userId = req.user.id;
    const safeName = name.replace(/[<>:"/\\|?*]/g, '').trim() || `model_${Date.now()}`;
    const libPath = path.join(LIBRARY_PATH, safeName);
    if (!fs.existsSync(libPath)) fs.mkdirSync(libPath, { recursive: true });

    let finalDest = path.join(libPath, filename);
    let counter = 1;
    while (fs.existsSync(finalDest)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      finalDest = path.join(libPath, `${base}_${counter}${ext}`);
      counter++;
    }
    fs.copyFileSync(req.file.path, finalDest);
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    // Extract metadata & thumbnail
    const fileType = getFileType(filename);
    const size = fs.statSync(finalDest).size;
    let metadata = null;
    let thumbnail = null;

    if (fileType === 'gcode') {
      const { parseGcodeMetadata, extractGcodeThumbnail } = require('./utils/gcode');
      const meta = parseGcodeMetadata(finalDest);
      if (meta) metadata = JSON.stringify(meta);
      thumbnail = extractGcodeThumbnail(finalDest, UPLOADS_DIR);
    } else if (fileType === '3mf') {
      const { extract3mfThumbnail } = require('./utils/3mf');
      thumbnail = extract3mfThumbnail(finalDest, UPLOADS_DIR);
    }

    // Create new model
    const r = run('INSERT INTO models (name, user_id, library_path, thumbnail) VALUES (?, ?, ?, ?)',
      [name, userId, libPath, thumbnail]);
    const modelId = r.lastId;

    const rFile = run('INSERT INTO files (model_id, filename, original_name, file_size, file_type, metadata, library_path, thumbnail) VALUES (?,?,?,?,?,?,?,?)',
      [modelId, path.basename(finalDest), filename, size, fileType, metadata, finalDest, thumbnail]);
    
    if (fileType === 'stl' || fileType === '3mf') {
      run('UPDATE models SET preview_file_id=? WHERE id=?', [rFile.lastId, modelId]);
    }
      
    res.status(201).json({ success: true, model_id: modelId, message: 'Uploaded successfully' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to process slicer upload' });
  }
});

app.post('/api/models/:id/files', authenticate, upload.array('files', 20), (req, res) => {
  try {
    const id = Number(req.params.id);
    const model = get('SELECT * FROM models WHERE id=?', [id]);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    if (req.user.role !== 'admin' && model.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
    const { parseGcodeMetadata, extractGcodeThumbnail } = require('./utils/gcode');
    const { extract3mfThumbnail } = require('./utils/3mf');
    const uploaded = [];

    // Ensure model has a library directory
    let libPath = model.library_path;
    if (!libPath || !fs.existsSync(libPath)) {
      const safeName = model.name.replace(/[<>:"/\\|?*]/g, '').trim() || `model_${id}`;
      let basePath = LIBRARY_PATH;
      if (req.body.parent_folder) {
        const confined = validatePathConfinement(LIBRARY_PATH, req.body.parent_folder);
        if (!confined) return res.status(400).json({ error: 'Invalid parent folder path' });
        basePath = confined;
      }
      libPath = req.body.create_subfolder !== 'false' ? path.join(basePath, safeName) : basePath;
      const confinedLib = validatePathConfinement(LIBRARY_PATH, path.relative(LIBRARY_PATH, libPath));
      if (!confinedLib) return res.status(400).json({ error: 'Invalid model library path' });
      libPath = confinedLib;
      if (!fs.existsSync(libPath)) fs.mkdirSync(libPath, { recursive: true });
      run('UPDATE models SET library_path=? WHERE id=?', [libPath, id]);
      model.library_path = libPath;
    }

    for (const file of req.files) {
      // Malware Scanning / Magic Bytes validation
      try {
        const buffer = Buffer.alloc(4);
        const fd = fs.openSync(file.path, 'r');
        fs.readSync(fd, buffer, 0, 4, 0);
        fs.closeSync(fd);
        const hex = buffer.toString('hex').toUpperCase();
        // MZ = 4D5A, ELF = 7F454C46, Script = 2321 (#!...)
        if (hex.startsWith('4D5A') || hex.startsWith('7F454C46') || hex.startsWith('2321')) {
          fs.unlinkSync(file.path);
          console.error(`[SECURITY] Blocked upload of ${file.originalname}: Executable magic bytes detected (${hex})`);
          continue;
        }
      } catch (err) {
        console.error('Failed to validate magic bytes for', file.originalname, err);
      }
      
      const safeOriginalName = path.basename(file.originalname);
      const ft = getFileType(safeOriginalName);
      
      // Move file into library folder with strict path confinement
      let finalDest = path.join(libPath, safeOriginalName);
      try {
        let counter = 1;
        while (fs.existsSync(finalDest)) {
          const ext = path.extname(safeOriginalName);
          const base = path.basename(safeOriginalName, ext);
          finalDest = path.join(libPath, `${base}_${counter}${ext}`);
          counter++;
        }
        const confinedDest = validatePathConfinement(libPath, path.relative(libPath, finalDest));
        if (!confinedDest) {
          fs.unlinkSync(file.path);
          continue;
        }
        fs.copyFileSync(file.path, confinedDest);
        finalDest = confinedDest;
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Failed to move uploaded file to library:', err);
        finalDest = file.path;
      }

      let metadata = null;
      let fileThumbnail = null;

      if (ft === 'gcode') {
        const meta = parseGcodeMetadata(finalDest);
        if (meta) metadata = JSON.stringify(meta);
        fileThumbnail = extractGcodeThumbnail(finalDest, UPLOADS_DIR);
        if (fileThumbnail && !model.thumbnail) {
          run('UPDATE models SET thumbnail=? WHERE id=?', [fileThumbnail, id]);
          model.thumbnail = fileThumbnail;
        }
      } else if (ft === '3mf') {
        fileThumbnail = extract3mfThumbnail(finalDest, UPLOADS_DIR);
        if (fileThumbnail && !model.thumbnail) {
          run('UPDATE models SET thumbnail=? WHERE id=?', [fileThumbnail, id]);
          model.thumbnail = fileThumbnail;
        }
      } else if (ft === 'image') {
        fileThumbnail = path.basename(finalDest);
        if (!model.thumbnail) {
          run('UPDATE models SET thumbnail=? WHERE id=?', [fileThumbnail, id]);
          model.thumbnail = fileThumbnail;
        }
      }

      const r = run('INSERT INTO files (model_id,filename,original_name,file_type,file_size,metadata,library_path,thumbnail) VALUES (?,?,?,?,?,?,?,?)',
        [id, path.basename(finalDest), file.originalname, ft, file.size, metadata, finalDest, fileThumbnail]);
      
      // If model has no preview file set, default to first STL or 3MF
      if (!model.preview_file_id && (ft === 'stl' || ft === '3mf')) {
        run('UPDATE models SET preview_file_id=? WHERE id=?', [r.lastId, id]);
        model.preview_file_id = r.lastId;
      }

      uploaded.push({ id: r.lastId, model_id: id, filename: path.basename(finalDest), original_name: file.originalname, file_type: ft, file_size: file.size, metadata, library_path: finalDest, thumbnail: fileThumbnail });

      // Inspect internal files in uploaded ZIP archive without full disk extraction
      if (ft === 'zip') {
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(finalDest);
          const entries = zip.getEntries();
          const { SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS } = require('./utils/library');
          for (const entry of entries) {
            if (entry.isDirectory) continue;
            const entryExt = path.extname(entry.entryName).toLowerCase();
            if (SUPPORTED_EXTENSIONS.includes(entryExt) || IMAGE_EXTENSIONS.includes(entryExt)) {
              const entryVirtualPath = finalDest + '::' + entry.entryName;
              const entryFt = getFileType(entry.name);
              let entryThumb = null;

              if (entryFt === 'image' && !model.thumbnail) {
                try {
                  const thumbFilename = `thumb_${Date.now()}_${path.basename(entry.entryName)}`;
                  const outPath = path.join(UPLOADS_DIR, thumbFilename);
                  fs.writeFileSync(outPath, entry.getData());
                  entryThumb = thumbFilename;
                  run('UPDATE models SET thumbnail=? WHERE id=?', [thumbFilename, id]);
                  model.thumbnail = thumbFilename;
                } catch (e) {}
              }

              const entryR = run('INSERT INTO files (model_id, filename, original_name, file_type, file_size, library_path, is_archive_entry, archive_entry_path, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, entry.name, entry.entryName, entryFt, entry.header.size, entryVirtualPath, 1, entry.entryName, entryThumb]);

              if (!model.preview_file_id && (entryFt === 'stl' || entryFt === '3mf')) {
                run('UPDATE models SET preview_file_id=? WHERE id=?', [entryR.lastId, id]);
                model.preview_file_id = entryR.lastId;
              }

              uploaded.push({ id: entryR.lastId, model_id: id, filename: entry.name, original_name: entry.entryName, file_type: entryFt, file_size: entry.header.size, library_path: entryVirtualPath, thumbnail: entryThumb });
            }
          }
        } catch (zipErr) {
          console.warn('Could not inspect uploaded zip archive:', zipErr);
        }
      }
    }
    run("UPDATE models SET updated_at=datetime('now') WHERE id=?", [id]);
    res.status(201).json(uploaded);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to upload files' }); }
});

app.post('/api/models/:id/thumbnail', authenticate, upload.single('thumbnail'), (req, res) => {
  try {
    const id = Number(req.params.id);
    const model = get('SELECT * FROM models WHERE id=?', [id]);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    if (req.user.role !== 'admin' && model.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (model.thumbnail) { const p = path.join(UPLOADS_DIR, model.thumbnail); if (fs.existsSync(p)) fs.unlinkSync(p); }
    run("UPDATE models SET thumbnail=?,updated_at=datetime('now') WHERE id=?", [req.file.filename, id]);
    res.json({ thumbnail: req.file.filename });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to upload thumbnail' }); }
});

app.get('/api/files/:id/download/:filename?', heavyLimiter, (req, res, next) => {
  const shareSlug = req.query.share;
  const doDownload = () => {
    try {
      const file = get('SELECT * FROM files WHERE id=?', [Number(req.params.id)]);
      if (!file) return res.status(404).json({ error: 'File not found' });

      if (shareSlug) {
        const share = get("SELECT * FROM shares WHERE id=? AND (expires_at IS NULL OR expires_at > datetime('now'))", [shareSlug]);
        if (!share || file.model_id !== share.model_id) {
          return res.status(403).json({ error: 'Invalid or expired share link' });
        }
      } else {
        const privateProjects = all('SELECT p.user_id FROM projects p JOIN project_models pm ON p.id=pm.project_id WHERE pm.model_id=? AND p.visibility="private"', [file.model_id]);
        if (privateProjects.length > 0) {
          if (!req.user || (req.user.role !== 'admin' && !privateProjects.some(p => p.user_id === req.user.id))) {
            return res.status(403).json({ error: 'Access denied to private file' });
          }
        }
      }

      const p = file.library_path || path.join(UPLOADS_DIR, file.filename);
      if (!fs.existsSync(p)) return res.status(404).json({ error: 'File not found on disk' });

      const baseDir = file.library_path ? LIBRARY_PATH : UPLOADS_DIR;
      const confined = validatePathConfinement(baseDir, path.relative(baseDir, p));
      if (!confined) return res.status(403).json({ error: 'Access denied' });

      res.download(confined, file.original_name);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to download' }); }
  };

  if (shareSlug) {
    doDownload();
  } else if (getSettingBool('require_login_to_view')) {
    authenticate(req, res, doDownload);
  } else {
    doDownload();
  }
});

app.delete('/api/files/:id', authenticate, (req, res) => {
  try {
    if (!req.user || req.user.role === 'viewer') return res.status(403).json({ error: 'Viewer accounts cannot delete data' });
    const file = get('SELECT f.*, m.user_id as model_owner FROM files f JOIN models m ON f.model_id = m.id WHERE f.id=?', [Number(req.params.id)]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (req.user.role !== 'admin' && file.model_owner && file.model_owner !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    
    const deleteDisk = req.query.deleteDisk === 'true';
    
    // Always delete from uploads dir if it exists there
    const p = path.join(UPLOADS_DIR, file.filename); 
    if (fs.existsSync(p)) fs.unlinkSync(p);
    
    // Delete from physical library path if requested
    if (deleteDisk && file.library_path && fs.existsSync(file.library_path)) {
      try { fs.unlinkSync(file.library_path); } catch(err) { console.error('Failed to delete physical file:', err); }
    }
    
    run('DELETE FROM files WHERE id=?', [file.id]);
    run("UPDATE models SET updated_at=datetime('now') WHERE id=?", [file.model_id]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete file' }); }
});

app.post('/api/files/:id/send-to-printer', authenticate, async (req, res) => {
  try {
    const { printer_id } = req.body;
    if (!printer_id) return res.status(400).json({ error: 'Printer ID required' });
    
    const file = get('SELECT f.*, m.user_id as model_owner FROM files f JOIN models m ON f.model_id = m.id WHERE f.id=?', [Number(req.params.id)]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    
    const settings = get("SELECT value FROM system_settings WHERE key='printers'");
    if (!settings || !settings.value) return res.status(400).json({ error: 'No printers configured' });
    
    const printers = JSON.parse(settings.value);
    const printer = printers.find(p => p.id === String(printer_id));
    if (!printer) return res.status(404).json({ error: 'Printer not found' });
    
    const targetPath = file.library_path || path.join(UPLOADS_DIR, file.filename);
    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'Physical file not found on disk' });
    
    const fileData = fs.readFileSync(targetPath);
    const blob = new Blob([fileData]);
    
    const fd = new FormData();
    fd.append('file', blob, file.original_name || file.filename);
    fd.append('root', 'gcodes');
    
    const moonrakerUrl = `${printer.url}/server/files/upload`;
    
    const headers = {};
    if (printer.api_key) {
      headers['X-Api-Key'] = printer.api_key;
    }

    const response = await fetch(moonrakerUrl, {
      method: 'POST',
      headers,
      body: fd
    });
    
    if (!response.ok) {
      const txt = await response.text();
      return res.status(response.status).json({ error: 'Moonraker error: ' + txt });
    }
    
    const result = await response.json();
    res.json({ success: true, result });
  } catch (e) {
    console.error('Send to printer error:', e);
    res.status(500).json({ error: 'Failed to send to printer: ' + e.message });
  }
});

// ─── PROJECTS / COLLECTIONS ───────────────────────────────────────────────
app.get('/api/projects', authenticate, (req, res) => {
  try {
    let query = 'SELECT p.*, COUNT(pm.model_id) as model_count FROM projects p LEFT JOIN project_models pm ON p.id=pm.project_id ';
    if (req.user.role !== 'admin') {
      query += 'WHERE p.visibility="public" OR p.user_id=? ';
    }
    query += 'GROUP BY p.id ORDER BY p.created_at DESC';
    
    const projects = req.user.role === 'admin' ? all(query) : all(query, [req.user.id]);

    // Attach up to 4 sample model thumbnails for rich collage cards
    if (projects.length > 0) {
      const projectIds = projects.map(p => p.id);
      const placeholders = projectIds.map(() => '?').join(',');
      const sampleModels = all(`
        SELECT pm.project_id, m.thumbnail, m.name
        FROM project_models pm
        JOIN models m ON pm.model_id = m.id
        WHERE pm.project_id IN (${placeholders})
        ORDER BY pm.rowid DESC
      `, projectIds);

      const samplesByProject = {};
      sampleModels.forEach(sm => {
        if (!samplesByProject[sm.project_id]) samplesByProject[sm.project_id] = [];
        if (samplesByProject[sm.project_id].length < 4 && sm.thumbnail) {
          samplesByProject[sm.project_id].push(sm.thumbnail);
        }
      });

      projects.forEach(p => {
        p.sample_thumbnails = samplesByProject[p.id] || [];
      });
    }

    res.json(projects);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch projects' }); }
});

app.get('/api/projects/:id', authenticate, (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id=?', [Number(req.params.id)]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.visibility === 'private' && req.user.role !== 'admin' && project.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: Private project' });
    }
    project.models = all(`
      SELECT m.*, c.name as category_name, c.color as category_color,
      (SELECT COUNT(*) FROM files WHERE model_id=m.id) as file_count,
      (SELECT COUNT(*) FROM print_history WHERE model_id=m.id) as print_count,
      (SELECT GROUP_CONCAT(DISTINCT file_type) FROM files WHERE model_id=m.id) as file_types,
      COALESCE(
        (SELECT filename FROM files WHERE id=m.preview_file_id AND file_type IN ('stl','3mf')),
        (SELECT filename FROM files WHERE model_id=m.id AND file_type='stl' ORDER BY uploaded_at DESC LIMIT 1)
      ) as stl_file,
      COALESCE(
        (SELECT library_path FROM files WHERE id=m.preview_file_id AND file_type IN ('stl','3mf')),
        (SELECT library_path FROM files WHERE model_id=m.id AND file_type='stl' ORDER BY uploaded_at DESC LIMIT 1)
      ) as stl_library_path,
      (SELECT filename FROM files WHERE model_id=m.id AND file_type='3mf' ORDER BY uploaded_at DESC LIMIT 1) as mf_file,
      (SELECT library_path FROM files WHERE model_id=m.id AND file_type='3mf' ORDER BY uploaded_at DESC LIMIT 1) as mf_library_path
      FROM models m 
      JOIN project_models pm ON m.id=pm.model_id 
      LEFT JOIN categories c ON m.category_id=c.id 
      WHERE pm.project_id=?`, [project.id]);

    project.models = project.models.map(m => {
      let stl_url = null;
      if (m.stl_file) {
        stl_url = getFileUrl({ filename: m.stl_file, library_path: m.stl_library_path });
      } else if (m.mf_file) {
        stl_url = getFileUrl({ filename: m.mf_file, library_path: m.mf_library_path });
      }
      return {
        ...m,
        thumbnail_url: m.thumbnail ? `/uploads/${m.thumbnail}` : null,
        stl_url,
        has_printed: (m.print_count || 0) > 0,
        file_types: m.file_types ? m.file_types.split(',') : []
      };
    });

    // Compute collection file stats
    const modelIds = project.models.map(m => m.id);
    if (modelIds.length > 0) {
      const placeholders = modelIds.map(() => '?').join(',');
      const stats = get(`
        SELECT COUNT(id) as total_files, SUM(size) as total_size, GROUP_CONCAT(DISTINCT file_type) as file_types
        FROM files
        WHERE model_id IN (${placeholders})
      `, modelIds);
      project.total_files = stats?.total_files || 0;
      project.total_size = stats?.total_size || 0;
      project.file_types = (stats?.file_types || '').split(',').filter(Boolean);
    } else {
      project.total_files = 0;
      project.total_size = 0;
      project.file_types = [];
    }

    res.json(project);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch project' }); }
});

app.post('/api/projects', authenticate, (req, res) => {
  try {
    const { name, description, visibility } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const vis = visibility === 'private' ? 'private' : 'public';
    const r = run('INSERT INTO projects (name, description, user_id, visibility) VALUES (?, ?, ?, ?)', [name, description||'', req.user.id, vis]);
    res.status(201).json({ id: r.lastId, name, description, visibility: vis });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create project' }); }
});

app.put('/api/projects/:id', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    const project = get('SELECT * FROM projects WHERE id=?', [id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (req.user.role !== 'admin' && project.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const { name, description, visibility } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const vis = visibility === 'private' ? 'private' : (visibility || project.visibility || 'public');

    run('UPDATE projects SET name=?, description=?, visibility=? WHERE id=?', [name.trim(), description !== undefined ? description : project.description, vis, id]);
    res.json(get('SELECT * FROM projects WHERE id=?', [id]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

app.delete('/api/projects/:id', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = get('SELECT user_id FROM projects WHERE id=?', [id]);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    if (req.user.role !== 'admin' && p.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    run('DELETE FROM projects WHERE id=?', [id]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete project' }); }
});

// Bulk Delete Projects / Collections
app.post('/api/projects/bulk-delete', authenticate, (req, res) => {
  try {
    const { project_ids } = req.body;
    if (!Array.isArray(project_ids) || project_ids.length === 0) {
      return res.status(400).json({ error: 'project_ids array required' });
    }
    let deletedCount = 0;
    for (const id of project_ids) {
      const p = get('SELECT user_id FROM projects WHERE id=?', [Number(id)]);
      if (p && (req.user.role === 'admin' || p.user_id === req.user.id)) {
        run('DELETE FROM projects WHERE id=?', [Number(id)]);
        deletedCount++;
      }
    }
    res.json({ success: true, count: deletedCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed bulk delete projects' });
  }
});

// Bulk Update Visibility for Projects / Collections
app.post('/api/projects/bulk-visibility', authenticate, (req, res) => {
  try {
    const { project_ids, visibility } = req.body;
    if (!Array.isArray(project_ids) || !visibility) {
      return res.status(400).json({ error: 'project_ids array and visibility required' });
    }
    const vis = visibility === 'private' ? 'private' : 'public';
    let updatedCount = 0;
    for (const id of project_ids) {
      const p = get('SELECT user_id FROM projects WHERE id=?', [Number(id)]);
      if (p && (req.user.role === 'admin' || p.user_id === req.user.id)) {
        run('UPDATE projects SET visibility=? WHERE id=?', [vis, Number(id)]);
        updatedCount++;
      }
    }
    res.json({ success: true, count: updatedCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed bulk update visibility' });
  }
});

app.post('/api/projects/:id/models', authenticate, (req, res) => {
  try {
    const { model_id } = req.body;
    run('INSERT OR IGNORE INTO project_models (project_id, model_id) VALUES (?, ?)', [Number(req.params.id), Number(model_id)]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to add model to project' }); }
});

app.put('/api/models/:id/projects', authenticate, (req, res) => {
  try {
    const modelId = Number(req.params.id);
    const model = get('SELECT id FROM models WHERE id=?', [modelId]);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const { project_ids } = req.body;
    if (!Array.isArray(project_ids)) return res.status(400).json({ error: 'project_ids array required' });

    // Remove existing assignments
    run('DELETE FROM project_models WHERE model_id=?', [modelId]);

    // Insert new assignments
    for (const pid of project_ids) {
      run('INSERT OR IGNORE INTO project_models (project_id, model_id) VALUES (?, ?)', [Number(pid), modelId]);
    }

    const updatedProjects = all('SELECT p.id, p.name, p.visibility FROM projects p JOIN project_models pm ON p.id=pm.project_id WHERE pm.model_id=?', [modelId]);
    res.json({ success: true, projects: updatedProjects });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to sync model projects' });
  }
});

app.post('/api/projects/:id/models/bulk', authenticate, (req, res) => {
  try {
    const { model_ids } = req.body;
    if (!Array.isArray(model_ids)) return res.status(400).json({ error: 'model_ids array required' });
    const projectId = Number(req.params.id);
    for (const mid of model_ids) {
      run('INSERT OR IGNORE INTO project_models (project_id, model_id) VALUES (?, ?)', [projectId, Number(mid)]);
    }
    res.json({ success: true, count: model_ids.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed bulk add to project' }); }
});

app.post('/api/projects/:id/models/bulk-remove', authenticate, (req, res) => {
  try {
    const { model_ids } = req.body;
    if (!Array.isArray(model_ids)) return res.status(400).json({ error: 'model_ids array required' });
    const projectId = Number(req.params.id);
    for (const mid of model_ids) {
      run('DELETE FROM project_models WHERE project_id=? AND model_id=?', [projectId, Number(mid)]);
    }
    res.json({ success: true, count: model_ids.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed bulk remove from project' }); }
});

app.delete('/api/projects/:id/models/:modelId', authenticate, (req, res) => {
  try {
    run('DELETE FROM project_models WHERE project_id=? AND model_id=?', [Number(req.params.id), Number(req.params.modelId)]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to remove model from project' }); }
});

// Download Collection as ZIP
app.get('/api/projects/:id/download', authenticate, heavyLimiter, (req, res) => {
  try {
    const AdmZip = require('adm-zip');
    const projectId = Number(req.params.id);
    const project = get('SELECT * FROM projects WHERE id=?', [projectId]);
    if (!project) return res.status(404).json({ error: 'Collection not found' });
    if (project.visibility === 'private' && req.user.role !== 'admin' && project.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const models = all(`
      SELECT m.id, m.name
      FROM models m
      JOIN project_models pm ON m.id = pm.model_id
      WHERE pm.project_id = ?
    `, [projectId]);

    if (!models.length) return res.status(400).json({ error: 'No models in this collection to download' });

    const zip = new AdmZip();

    for (const model of models) {
      const files = all('SELECT filename, filepath FROM files WHERE model_id=?', [model.id]);
      const folderName = model.name.replace(/[/\\?%*:|"<>]/g, '_');
      for (const file of files) {
        if (file.filepath && fs.existsSync(file.filepath)) {
          zip.addLocalFile(file.filepath, folderName);
        }
      }
    }

    const zipBuffer = zip.toBuffer();
    const safeName = (project.name || 'collection').replace(/[/\\?%*:|"<>]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (e) {
    console.error('Error creating collection zip:', e);
    res.status(500).json({ error: 'Failed to create collection zip' });
  }
});

// ─── SHARING ────────────────────────────────────────────────────────────────

app.post('/api/shares', authenticate, (req, res) => {
  try {
    const { model_id, expires_days } = req.body;
    const modelId = safeInt(model_id, 0);
    if (!modelId) return res.status(400).json({ error: 'Valid model_id is required' });

    const model = get('SELECT id, user_id FROM models WHERE id=?', [modelId]);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    if (req.user.role !== 'admin' && model.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const slug = require('crypto').randomBytes(6).toString('hex');
    const days = (expires_days !== undefined && expires_days !== null && expires_days !== '') 
      ? safeInt(expires_days, 7, 1, 365) 
      : null;
    
    if (days !== null) {
      run("INSERT INTO shares (id, model_id, expires_at) VALUES (?, ?, datetime('now', '+' || ? || ' days'))", [slug, modelId, days]);
    } else {
      run('INSERT INTO shares (id, model_id, expires_at) VALUES (?, ?, NULL)', [slug, modelId]);
    }
    
    res.json({ slug });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create share' }); }
});

app.get('/api/shares/:slug', (req, res) => {
  try {
    const share = get("SELECT * FROM shares WHERE id=? AND (expires_at IS NULL OR expires_at > datetime('now'))", [req.params.slug]);
    if (!share) return res.status(404).json({ error: 'Share not found or expired' });
    
    const model = get('SELECT m.*,c.name as category_name,c.color as category_color FROM models m LEFT JOIN categories c ON m.category_id=c.id WHERE m.id=?', [share.model_id]);
    model.files = all('SELECT * FROM files WHERE model_id=? ORDER BY uploaded_at DESC', [model.id]).map(f => ({
      ...f,
      url: getFileUrl(f)
    }));
    res.json(model);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch shared model' }); }
});

// ─── PRINT HISTORY ──────────────────────────────────────────────────────────

app.post('/api/models/:id/prints', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM models WHERE id=?', [id])) return res.status(404).json({ error: 'Model not found' });
    const { material_id, successful = true, notes = '', printed_at } = req.body;
    const date = printed_at || new Date().toISOString();
    const r = run('INSERT INTO print_history (model_id,material_id,successful,notes,printed_at) VALUES (?,?,?,?,?)',
      [id, material_id||null, successful?1:0, notes, date]);
    run("UPDATE models SET updated_at=datetime('now') WHERE id=?", [id]);
    res.status(201).json(get('SELECT ph.*,mat.name as material_name FROM print_history ph LEFT JOIN materials mat ON ph.material_id=mat.id WHERE ph.id=?', [r.lastId]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to add print' }); }
});

app.delete('/api/prints/:id', authenticate, (req, res) => {
  try {
    const p = get('SELECT * FROM print_history WHERE id=?', [Number(req.params.id)]);
    if (!p) return res.status(404).json({ error: 'Not found' });
    run('DELETE FROM print_history WHERE id=?', [p.id]);
    run("UPDATE models SET updated_at=datetime('now') WHERE id=?", [p.model_id]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete print' }); }
});

// ─── CATEGORIES ─────────────────────────────────────────────────────────────

app.get('/api/categories', (req, res) => {
  try { res.json(all('SELECT c.*,(SELECT COUNT(*) FROM models WHERE category_id=c.id) as model_count FROM categories c ORDER BY c.name')); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/categories', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = run('INSERT INTO categories (name,color) VALUES (?,?)', [name.trim(), color||'#8b5cf6']);
    res.status(201).json(get('SELECT * FROM categories WHERE id=?', [r.lastId]));
  } catch (e) { res.status(e.message?.includes('UNIQUE') ? 409 : 500).json({ error: e.message?.includes('UNIQUE') ? 'Already exists' : 'Failed' }); }
});
app.put('/api/categories/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name, color } = req.body;
    run('UPDATE categories SET name=COALESCE(?,name),color=COALESCE(?,color) WHERE id=?', [name, color, Number(req.params.id)]);
    res.json(get('SELECT * FROM categories WHERE id=?', [Number(req.params.id)]));
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/categories/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try { run('DELETE FROM categories WHERE id=?', [Number(req.params.id)]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ── SYSTEM & UPDATES ───────────────────────────────────────────────────────
let lastUpdateCheck = { time: 0, data: null };

app.get('/api/system/updates', async (req, res) => {
  try {
    const pkg = require('../package.json');
    const currentVersion = pkg.version;
    
    // Cache for 1 hour to stay under GitHub rate limits
    if (lastUpdateCheck.data && (Date.now() - lastUpdateCheck.time < 3600000)) {
      return res.json({ ...lastUpdateCheck.data, currentVersion });
    }

    const githubRes = await fetch('https://api.github.com/repos/TeeCodeDev/GyroidVault/releases/latest', {
      headers: { 'User-Agent': 'GyroidVault-Server' }
    });
    
    if (githubRes.ok) {
      const release = await githubRes.json();
      const latestVersion = release.tag_name.replace('v', '');
      const data = {
        latestVersion,
        hasUpdate: latestVersion.localeCompare(currentVersion, undefined, { numeric: true }) > 0,
        changelog: release.body,
        published_at: release.published_at,
        url: release.html_url
      };
      lastUpdateCheck = { time: Date.now(), data };
      res.json({ ...data, currentVersion });
    } else {
      // If 404, it just means no releases yet
      const data = {
        latestVersion: currentVersion,
        hasUpdate: false,
        changelog: '',
        url: 'https://github.com/TeeCodeDev/GyroidVault'
      };
      res.json({ ...data, currentVersion });
    }
  } catch (e) {
    console.error('Update check failed:', e);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});

app.get('/api/system/release-notes', (req, res) => {
  try {
    const rootDir = path.join(__dirname, '..');
    const files = fs.readdirSync(rootDir).filter(f => f.startsWith('Release_Notes_') && f.endsWith('.md'));
    files.sort((a, b) => {
      const vA = a.match(/Release_Notes_v?([\d\.]+)\.md/i)?.[1] || '';
      const vB = b.match(/Release_Notes_v?([\d\.]+)\.md/i)?.[1] || '';
      return vB.localeCompare(vA, undefined, { numeric: true });
    });

    const notes = files.map(filename => {
      const match = filename.match(/Release_Notes_v?([\d\.]+)\.md/i);
      const version = match ? match[1] : filename;
      const content = fs.readFileSync(path.join(rootDir, filename), 'utf8');
      
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const dateMatch = content.match(/\*\*Release Date:\*\*\s*(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : `GyroidVault v${version}`;
      const releaseDate = dateMatch ? dateMatch[1].trim() : '';

      return { version, filename, content, title, releaseDate };
    });

    res.json({ notes });
  } catch (e) {
    console.error('Failed to get release notes:', e);
    res.status(500).json({ error: 'Failed to read release notes' });
  }
});

// ─── TAGS ───────────────────────────────────────────────────────────────────

app.get('/api/tags', (req, res) => {
  try { res.json(all('SELECT t.*,(SELECT COUNT(*) FROM model_tags WHERE tag_id=t.id) as model_count FROM tags t ORDER BY t.name')); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/tags', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = run('INSERT INTO tags (name) VALUES (?)', [name.trim()]);
    res.status(201).json(get('SELECT * FROM tags WHERE id=?', [r.lastId]));
  } catch (e) { res.status(e.message?.includes('UNIQUE') ? 409 : 500).json({ error: e.message?.includes('UNIQUE') ? 'Already exists' : 'Failed' }); }
});
app.delete('/api/tags/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try { run('DELETE FROM tags WHERE id=?', [Number(req.params.id)]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ─── MATERIALS ──────────────────────────────────────────────────────────────

app.get('/api/materials', (req, res) => {
  try { res.json(all('SELECT mat.*,(SELECT COUNT(*) FROM print_history WHERE material_id=mat.id) as usage_count FROM materials mat ORDER BY mat.is_preset DESC,mat.name')); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/materials', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = run('INSERT INTO materials (name,is_preset) VALUES (?,0)', [name.trim()]);
    res.status(201).json(get('SELECT * FROM materials WHERE id=?', [r.lastId]));
  } catch (e) { res.status(e.message?.includes('UNIQUE') ? 409 : 500).json({ error: e.message?.includes('UNIQUE') ? 'Already exists' : 'Failed' }); }
});
app.delete('/api/materials/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const m = get('SELECT * FROM materials WHERE id=?', [Number(req.params.id)]);
    if (!m) return res.status(404).json({ error: 'Not found' });
    if (m.is_preset) return res.status(403).json({ error: 'Cannot delete preset materials' });
    run('DELETE FROM materials WHERE id=?', [m.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ─── STATS ──────────────────────────────────────────────────────────────────
app.get('/api/system/logs', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    res.json(all('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 100'));
  } catch (e) { res.status(500).json({ error: 'Failed to fetch logs' }); }
});

app.delete('/api/system/logs', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    run('DELETE FROM system_logs');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to clear logs' }); }
});

// public setting so all users know which view mode to use
app.get('/api/settings/view-mode', (req, res) => {
  const row = get("SELECT value FROM system_settings WHERE key='library_view_mode'");
  res.json({ library_view_mode: row?.value || 'grid' });
});

app.post('/api/browse/move', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { source, target } = req.body;
    if (!source || !target) return res.status(400).json({ error: 'Missing source or target' });
    
    const srcAbs = path.join(LIBRARY_PATH, source);
    const targetAbs = path.join(LIBRARY_PATH, target, path.basename(source));
    
    if (!srcAbs.startsWith(path.resolve(LIBRARY_PATH)) || !targetAbs.startsWith(path.resolve(LIBRARY_PATH))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    fs.renameSync(srcAbs, targetAbs);
    
    const likePattern = srcAbs + '%';
    run('UPDATE files SET library_path = REPLACE(library_path, ?, ?) WHERE library_path LIKE ?', [srcAbs, targetAbs, likePattern]);
    run('UPDATE models SET library_path = REPLACE(library_path, ?, ?) WHERE library_path LIKE ?', [srcAbs, targetAbs, likePattern]);
    
    res.json({ success: true });
  } catch (e) {
    console.error('[Move] Error:', e);
    res.status(500).json({ error: 'Failed to move folder/file' });
  }
});

app.post('/api/browse/mkdir', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { parentPath, folderName } = req.body;
    if (!folderName) return res.status(400).json({ error: 'Missing folder name' });
    
    const fullPath = path.join(LIBRARY_PATH, parentPath || '', folderName);
    
    if (!fullPath.startsWith(path.resolve(LIBRARY_PATH))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    fs.mkdirSync(fullPath, { recursive: true });
    
    res.json({ success: true });
  } catch (e) {
    console.error('[Mkdir] Error:', e);
    res.status(500).json({ error: 'Failed to create directory' });
  }
});

app.post('/api/browse/bulk-move', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { paths, target } = req.body;
    if (!Array.isArray(paths) || typeof target !== 'string') return res.status(400).json({ error: 'Missing paths or target' });

    for (const source of paths) {
      const srcAbs = path.join(LIBRARY_PATH, source);
      const targetAbs = path.join(LIBRARY_PATH, target, path.basename(source));
      
      if (!srcAbs.startsWith(path.resolve(LIBRARY_PATH)) || !targetAbs.startsWith(path.resolve(LIBRARY_PATH))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (fs.existsSync(srcAbs)) {
        fs.renameSync(srcAbs, targetAbs);
      }
      
      const likePattern = srcAbs + '%';
      run('UPDATE files SET library_path = REPLACE(library_path, ?, ?) WHERE library_path LIKE ?', [srcAbs, targetAbs, likePattern]);
      run('UPDATE models SET library_path = REPLACE(library_path, ?, ?) WHERE library_path LIKE ?', [srcAbs, targetAbs, likePattern]);
    }
    
    res.json({ success: true });
  } catch (e) {
    console.error('[Bulk Move] Error:', e);
    res.status(500).json({ error: 'Failed to bulk move' });
  }
});

app.post('/api/browse/bulk-delete', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { paths } = req.body;
    if (!Array.isArray(paths)) return res.status(400).json({ error: 'Missing paths' });

    for (const source of paths) {
      const absPath = path.join(LIBRARY_PATH, source);
      if (!absPath.startsWith(path.resolve(LIBRARY_PATH))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      if (fs.existsSync(absPath)) {
        fs.rmSync(absPath, { recursive: true, force: true });
      }
      
      const likePattern = absPath + '%';
      
      const matchingModels = all('SELECT DISTINCT model_id FROM files WHERE library_path LIKE ?', [likePattern]);
      
      run('DELETE FROM files WHERE library_path LIKE ?', [likePattern]);
      run('DELETE FROM models WHERE library_path LIKE ?', [likePattern]);

      for (const row of matchingModels) {
        if (row.model_id) {
          const fileCount = get('SELECT COUNT(*) as c FROM files WHERE model_id = ?', [row.model_id]).c;
          if (fileCount === 0) {
            run('DELETE FROM models WHERE id = ?', [row.model_id]);
          }
        }
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[Bulk Delete] Error:', e);
    res.status(500).json({ error: 'Failed to bulk delete' });
  }
});

app.post('/api/browse/bulk-tag', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { paths, tags } = req.body;
    if (!Array.isArray(paths) || !Array.isArray(tags)) return res.status(400).json({ error: 'Missing paths or tags' });

    const modelIds = new Set();

    for (const source of paths) {
      const absPath = path.join(LIBRARY_PATH, source);
      if (!absPath.startsWith(path.resolve(LIBRARY_PATH))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const likePattern = absPath + '%';
      
      const filesModels = all('SELECT DISTINCT model_id FROM files WHERE library_path LIKE ?', [likePattern]);
      for (const row of filesModels) {
         if (row.model_id) modelIds.add(row.model_id);
      }
      
      const mainModels = all('SELECT id FROM models WHERE library_path LIKE ?', [likePattern]);
      for (const row of mainModels) {
         modelIds.add(row.id);
      }
    }

    if (modelIds.size > 0) {
      const finalTagIds = [];
      for (const t of tags) {
        if (typeof t === 'string' && t.startsWith('NEW:')) {
          const tagName = t.substring(4).trim();
          if (tagName) {
            run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName]);
            const row = get('SELECT id FROM tags WHERE name = ?', [tagName]);
            if (row) finalTagIds.push(row.id);
          }
        } else {
          finalTagIds.push(Number(t));
        }
      }

      for (const modelId of modelIds) {
        for (const tagId of finalTagIds) {
          run('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)', [modelId, tagId]);
        }
        run("UPDATE models SET updated_at=datetime('now') WHERE id=?", [modelId]);
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[Bulk Tag] Error:', e);
    res.status(500).json({ error: 'Failed to bulk tag' });
  }
});

// browse the library folder structure on disk
app.get('/api/browse', authenticate, (req, res) => {
  try {
    const reqPath = req.query.path || '';
    const fullPath = path.resolve(LIBRARY_PATH, reqPath);
    
    // security: make sure we stay inside LIBRARY_PATH
    if (!fullPath.startsWith(path.resolve(LIBRARY_PATH))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    const supportedExts = ['.stl', '.gcode', '.bgcode', '.3mf', '.step', '.stp', '.f3d', '.obj'];
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    
    const dbThumbs = all('SELECT library_path, thumbnail FROM files WHERE thumbnail IS NOT NULL AND library_path IS NOT NULL');
    const thumbMap = new Map();
    for (const row of dbThumbs) thumbMap.set(row.library_path, row.thumbnail);

    const dbFilesList = all('SELECT id, model_id, library_path, metadata, thumbnail FROM files WHERE library_path IS NOT NULL');
    const dbFileMap = new Map();
    for (const row of dbFilesList) dbFileMap.set(row.library_path, row);

    const { parseGcodeMetadata } = require('./utils/gcode');
    const folders = [];
    const files = [];
    
    for (const item of items) {
      if (item.name.startsWith('.')) continue; // skip hidden files
      
      if (item.isDirectory()) {
        // count how many items are inside (non-recursive, just immediate children)
        let itemCount = 0;
        try {
          itemCount = fs.readdirSync(path.join(fullPath, item.name)).filter(f => !f.startsWith('.')).length;
        } catch(e) { /* permission error, just show 0 */ }
        let folderThumbs = [];
        const folderFullPath = path.join(fullPath, item.name);
        
        const folderModel = get('SELECT id, thumbnail FROM models WHERE library_path = ?', [folderFullPath]);
        if (folderModel && folderModel.thumbnail) {
          folderThumbs.push(getThumbUrl(folderModel.thumbnail, folderFullPath));
        }
        
        const folderPrefix = (folderFullPath + '/').replace(/\\/g, '/');
        for (const [libPath, thumb] of thumbMap.entries()) {
          const normalizedLibPath = libPath.replace(/\\/g, '/');
          if (normalizedLibPath.startsWith(folderPrefix)) {
            const url = getThumbUrl(thumb, path.dirname(libPath));
            if (!folderThumbs.includes(url)) {
              folderThumbs.push(url);
              if (folderThumbs.length >= 4) break;
            }
          }
        }
        
        folders.push({
          name: item.name,
          path: reqPath ? `${reqPath}/${item.name}` : item.name,
          itemCount,
          thumbnails: folderThumbs,
          model_id: folderModel ? folderModel.id : null
        });
      } else {
        const ext = path.extname(item.name).toLowerCase();
        if (supportedExts.includes(ext) || imageExts.includes(ext)) {
          const filePath = path.join(fullPath, item.name);
          const stat = fs.statSync(filePath);
          const relPath = path.relative(LIBRARY_PATH, filePath).replace(/\\/g, '/');
          const encodedUrl = '/library-files/' + relPath.split('/').map(s => encodeURIComponent(s)).join('/');
          
          let fileType = 'other';
          if (ext === '.stl') fileType = 'stl';
          else if (ext === '.gcode' || ext === '.bgcode') fileType = 'gcode';
          else if (ext === '.3mf') fileType = '3mf';
          else if (ext === '.step' || ext === '.stp') fileType = 'step';
          else if (ext === '.f3d') fileType = 'f3d';
          else if (ext === '.obj') fileType = 'obj';
          else if (imageExts.includes(ext)) fileType = 'image';
          
          let thumbnailUrl = null;
          const dbFile = dbFileMap.get(filePath);
          const thumb = dbFile?.thumbnail || thumbMap.get(filePath);
          if (thumb) {
            thumbnailUrl = getThumbUrl(thumb, path.dirname(filePath));
          }

          let metadata = null;
          if (dbFile?.metadata) {
            try { metadata = typeof dbFile.metadata === 'string' ? JSON.parse(dbFile.metadata) : dbFile.metadata; } catch(e){}
          }
          if (!metadata && (fileType === 'gcode')) {
            metadata = parseGcodeMetadata(filePath);
          }

          files.push({
            id: dbFile ? dbFile.id : null,
            name: item.name,
            size: stat.size,
            type: fileType,
            ext: ext.replace('.', ''),
            url: encodedUrl,
            thumbnailUrl,
            metadata,
            folderPath: reqPath,
            model_id: dbFile ? dbFile.model_id : null
          });
        }
      }
    }
    
    // sort folders alphabetically, files by name
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    
    // figure out parent path for the breadcrumb "go up" button
    const parts = reqPath.split('/').filter(Boolean);
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : (parts.length === 1 ? '' : null);
    
    res.json({
      currentPath: reqPath,
      parentPath,
      folders,
      files
    });
  } catch (e) {
    console.error('[Browse] Error:', e);
    res.status(500).json({ error: 'Failed to browse directory' });
  }
});

// folder tree for sidebar nav (recursive, folders only)
app.get('/api/browse/tree', authenticate, (req, res) => {
  try {
    const maxDepth = 4; // dont go too deep, keeps it snappy
    
    function scanTree(dirPath, relPath, depth) {
      if (depth >= maxDepth) return [];
      
      let entries;
      try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
      catch(e) { return []; }
      
      return entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(entry => {
          const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
          const childFull = path.join(dirPath, entry.name);
          return {
            name: entry.name,
            path: childRel,
            children: scanTree(childFull, childRel, depth + 1)
          };
        });
    }
    
    res.json(scanTree(LIBRARY_PATH, '', 0));
  } catch(e) {
    console.error('[Tree] Error:', e);
    res.status(500).json({ error: 'Failed to load folder tree' });
  }
});

// global folder search (recursive)
app.get('/api/browse/search', authenticate, (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json({ folders: [], files: [] });
    
    const dbThumbs = all('SELECT library_path, thumbnail FROM files WHERE thumbnail IS NOT NULL');
    const thumbMap = new Map();
    for (const row of dbThumbs) thumbMap.set(row.library_path, row.thumbnail);

    const dbFilesList = all('SELECT id, model_id, library_path, metadata, thumbnail FROM files WHERE library_path IS NOT NULL');
    const dbFileMap = new Map();
    for (const row of dbFilesList) dbFileMap.set(row.library_path, row);

    const { parseGcodeMetadata } = require('./utils/gcode');
    const folders = [];
    const files = [];
    const supportedExts = ['.stl', '.gcode', '.bgcode', '.3mf', '.step', '.stp', '.f3d', '.obj'];
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    
    function walk(dir, relPath) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch(e) { return; }
      
      for (const item of entries) {
        if (item.name.startsWith('.')) continue;
        
        const childRel = relPath ? `${relPath}/${item.name}` : item.name;
        const childFull = path.join(dir, item.name);
        
        if (item.isDirectory()) {
          if (item.name.toLowerCase().includes(q)) {
            let itemCount = 0;
            try { itemCount = fs.readdirSync(childFull).filter(f => !f.startsWith('.')).length; } catch(e){}
            let folderThumbs = [];
            const folderFullPath = childFull;
            
            const folderModel = get('SELECT id, thumbnail FROM models WHERE library_path = ?', [folderFullPath]);
            if (folderModel && folderModel.thumbnail) folderThumbs.push(getThumbUrl(folderModel.thumbnail, folderFullPath));
            
            const folderPrefix = folderFullPath + path.sep;
            for (const [libPath, thumb] of thumbMap.entries()) {
              if (libPath.startsWith(folderPrefix)) {
                const url = getThumbUrl(thumb, path.dirname(libPath));
                if (!folderThumbs.includes(url)) {
                  folderThumbs.push(url);
                  if (folderThumbs.length >= 4) break;
                }
              }
            }
            folders.push({
              name: item.name,
              path: childRel,
              itemCount,
              thumbnails: folderThumbs,
              model_id: folderModel ? folderModel.id : null
            });
          }
          walk(childFull, childRel);
        } else {
          if (item.name.toLowerCase().includes(q)) {
            const ext = path.extname(item.name).toLowerCase();
            if (supportedExts.includes(ext) || imageExts.includes(ext)) {
              let fileType = 'other';
              if (ext === '.stl') fileType = 'stl';
              else if (ext === '.gcode' || ext === '.bgcode') fileType = 'gcode';
              else if (ext === '.3mf') fileType = '3mf';
              else if (ext === '.step' || ext === '.stp') fileType = 'step';
              else if (ext === '.f3d') fileType = 'f3d';
              else if (ext === '.obj') fileType = 'obj';
              else if (imageExts.includes(ext)) fileType = 'image';
              
              const stat = fs.statSync(childFull);
              const encodedUrl = '/library-files/' + childRel.split('/').map(s => encodeURIComponent(s)).join('/');
              
              let thumbnailUrl = null;
              const dbFile = dbFileMap.get(childFull);
              const thumb = dbFile?.thumbnail || thumbMap.get(childFull);
              if (thumb) {
                thumbnailUrl = getThumbUrl(thumb, path.dirname(childFull));
              }

              let metadata = null;
              if (dbFile?.metadata) {
                try { metadata = typeof dbFile.metadata === 'string' ? JSON.parse(dbFile.metadata) : dbFile.metadata; } catch(e){}
              }
              if (!metadata && fileType === 'gcode') {
                metadata = parseGcodeMetadata(childFull);
              }

              files.push({
                id: dbFile ? dbFile.id : null,
                name: item.name,
                size: stat.size,
                type: fileType,
                ext: ext.replace('.', ''),
                url: encodedUrl,
                thumbnailUrl,
                metadata,
                folderPath: relPath,
                model_id: dbFile ? dbFile.model_id : null
              });
            }
          }
        }
      }
    }
    
    walk(LIBRARY_PATH, '');
    res.json({ folders, files });
  } catch(e) {
    console.error('[Browse Search] Error:', e);
    res.status(500).json({ error: 'Failed to search library' });
  }
});

app.get('/api/settings/system', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const settings = all('SELECT * FROM system_settings WHERE key NOT LIKE "smtp_%"');
  const config = {};
  settings.forEach(s => config[s.key] = s.value);
  res.json(config);
});

// ─── IP UNBLOCK & DUPLICATES SYSTEM ─────────────────────────────────────────

app.get('/api/system/blocked-ips', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const now = Date.now();
  const list = [];
  for (const [ip, info] of blockedIPsStore.entries()) {
    if (info.expiresAt && new Date(info.expiresAt).getTime() > now) {
      list.push({ ip, attempts: info.attempts, blockedAt: info.blockedAt, expiresAt: info.expiresAt });
    }
  }
  res.json(list);
});

app.post('/api/system/unblock-ip', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP address required' });
  blockedIPsStore.delete(ip);
  res.json({ success: true, message: `IP ${ip} unblocked successfully` });
});

app.get('/api/system/duplicates', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const crypto = require('crypto');
    const files = all(`
      SELECT f.id, f.filename, f.original_name, f.file_size, f.file_type, f.library_path, f.model_id, m.name as model_name
      FROM files f
      LEFT JOIN models m ON f.model_id = m.id
      WHERE f.file_size > 0
    `);

    const sizeGroups = {};
    for (const f of files) {
      if (!sizeGroups[f.file_size]) sizeGroups[f.file_size] = [];
      sizeGroups[f.file_size].push(f);
    }

    const duplicateGroups = [];
    for (const [size, candidateFiles] of Object.entries(sizeGroups)) {
      if (candidateFiles.length < 2) continue;

      const hashGroups = {};
      for (const f of candidateFiles) {
        const filePath = f.library_path || path.join(UPLOADS_DIR, f.filename);
        if (!fs.existsSync(filePath)) continue;
        try {
          const fileBuffer = fs.readFileSync(filePath);
          const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
          if (!hashGroups[hash]) hashGroups[hash] = [];
          hashGroups[hash].push(f);
        } catch (e) {}
      }

      for (const [hash, matchingFiles] of Object.entries(hashGroups)) {
        if (matchingFiles.length > 1) {
          duplicateGroups.push({
            hash,
            size: Number(size),
            files: matchingFiles
          });
        }
      }
    }

    res.json({ success: true, duplicatesCount: duplicateGroups.length, groups: duplicateGroups });
  } catch (e) {
    console.error('Duplicate scan error:', e);
    res.status(500).json({ error: 'Failed to scan for duplicate files' });
  }
});

app.post('/api/settings/system', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const config = req.body;
    for (const [key, value] of Object.entries(config)) {
      run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, String(value)]);
    }
    
    // Refresh background scanner if interval changed
    if (config.auto_scan_interval !== undefined) {
      setupBackgroundScanner();
    }
    
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to save system settings' }); }
});

app.get('/api/settings/smtp', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const settings = all('SELECT * FROM system_settings WHERE key LIKE "smtp_%"');
  const config = {};
  settings.forEach(s => {
    if (s.key === 'smtp_pass') {
      config[s.key] = s.value ? '••••••••' : '';
      config.smtp_has_pass = Boolean(s.value);
    } else {
      config[s.key] = s.value;
    }
  });
  res.json(config);
});

app.post('/api/settings/smtp', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const config = req.body;
    for (const [key, value] of Object.entries(config)) {
      if (key === 'smtp_pass' && (value === '••••••••' || value === '')) {
        continue; // Keep existing stored password when mask is submitted
      }
      run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
    }
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to save SMTP settings' }); }
});

app.post('/api/settings/smtp/test', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const { sendTestEmail } = require('./utils/email');
    await sendTestEmail(email);
    res.json({ success: true });
  } catch (e) { 
    console.error(e); 
    res.status(500).json({ error: e.message || 'Failed to send test email' }); 
  }
});

app.get('/api/users', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    res.json(all('SELECT id, username, email, role FROM users ORDER BY username ASC'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch users' }); }
});

app.put('/api/users/:id/role', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const userId = parseInt(req.params.id, 10);
  const { role } = req.body;
  
  if (userId === 1) return res.status(400).json({ error: 'Cannot change the role of the master admin (User ID 1)' });
  if (!['admin', 'uploader', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  
  try {
    run('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

app.delete('/api/users/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const userId = parseInt(req.params.id, 10);
  
  if (userId === 1) return res.status(400).json({ error: 'Cannot delete the master admin (User ID 1)' });
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  
  try {
    run('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const totalModels = get('SELECT COUNT(*) as c FROM models').c;
    const totalFiles = get('SELECT COUNT(*) as c FROM files').c;
    const totalPrints = get('SELECT COUNT(*) as c FROM print_history').c;
    const successfulPrints = get('SELECT COUNT(*) as c FROM print_history WHERE successful=1').c;
    const printedModels = get('SELECT COUNT(DISTINCT model_id) as c FROM print_history').c;
    const totalSize = get('SELECT COALESCE(SUM(file_size),0) as s FROM files').s;
    const recentModels = all('SELECT m.*,c.name as category_name,c.color as category_color FROM models m LEFT JOIN categories c ON m.category_id=c.id ORDER BY m.created_at DESC LIMIT 5');
    const recentPrints = all('SELECT ph.*,m.name as model_name,mat.name as material_name FROM print_history ph JOIN models m ON ph.model_id=m.id LEFT JOIN materials mat ON ph.material_id=mat.id ORDER BY ph.printed_at DESC LIMIT 5');
    const materialUsage = all('SELECT mat.name,COUNT(ph.id) as count FROM materials mat JOIN print_history ph ON ph.material_id=mat.id GROUP BY mat.id ORDER BY count DESC LIMIT 5');
    res.json({
      totalModels, totalFiles, totalPrints, successfulPrints, printedModels,
      successRate: totalPrints > 0 ? Math.round((successfulPrints/totalPrints)*100) : 0,
      totalSize, recentModels, recentPrints, materialUsage,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch stats' }); }
});

// ─── Uploaded Files ───────────────────────────────────────────────────────

app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// ─── SPA Fallback & Error Handler ─────────────────────────────────────────

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, '..', 'public', 'index.html')); });
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

// ─── BACKGROUND TASKS ───────────────────────────────────────────────────────
let scanIntervalId = null;

function setupBackgroundScanner() {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  
  const setting = get('SELECT value FROM system_settings WHERE key="auto_scan_interval"');
  const hours = setting && setting.value !== undefined ? Number(setting.value) : 24;
  
  if (hours > 0) {
    console.log(`Starting background library scanner (interval: ${hours} hours)`);
    scanIntervalId = setInterval(() => {
      console.log('[Scanner] Running scheduled background library scan...');
      try {
        const { startScanAsync } = require('./utils/library');
        const res = startScanAsync(LIBRARY_PATH);
        if (res.alreadyRunning) {
          console.log('[Scanner] Scheduled scan skipped: another scan is already active.');
        }
      } catch (e) {
        console.error('Scheduled library scan launch failed:', e);
      }
    }, hours * 3600 * 1000);
  } else {
    console.log('Background library scanner is disabled.');
  }
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

(async () => {
  await initDatabase();
  setUploadsDir(UPLOADS_DIR);

  // Graceful shutdown to save DB before process exit
  const { saveDb } = require('./database');
  const shutdown = () => {
    console.log('\nShutting down server, saving database...');
    saveDb(true);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGUSR2', shutdown); // nodemon restart signal

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`GyroidVault running on http://0.0.0.0:${PORT}`);
    setupBackgroundScanner();
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`0.0.0.0:${PORT} in use, binding to 127.0.0.1:${PORT}...`);
      app.listen(PORT, '127.0.0.1', () => {
        console.log(`GyroidVault running on http://localhost:${PORT}`);
        setupBackgroundScanner();
      });
    } else {
      throw err;
    }
  });
})();
