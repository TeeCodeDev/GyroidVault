const express = require('express');
const path = require('path');
const fs = require('fs');
const { initDatabase, all, get, run, UPLOADS_DIR } = require('./database');
const { upload, getFileType, setUploadsDir } = require('./middleware/upload');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticate, SECRET } = require('./middleware/auth');

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

app.use(express.json());

// ─── AUTH ───────────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
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
      if (!invite_token) return res.status(403).json({ error: 'Registration requires an invite token' });
      const invite = get("SELECT * FROM user_invites WHERE token=? AND expires_at > datetime('now')", [invite_token]);
      if (!invite) return res.status(400).json({ error: 'Invalid or expired invite token' });
      if (invite.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ error: 'Email does not match the invitation' });
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
    await sendInviteEmail(email, token, req.headers.origin || `http://${req.headers.host}`);
    
    res.json({ message: 'Invitation sent' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Failed to send invitation' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Securing JWT payload: remove username and email
    const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, email: user.email } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Login failed' }); }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = get('SELECT id, username, email, role FROM users WHERE id=?', [req.user.id]);
  res.json(user);
});

app.put('/api/auth/profile', authenticate, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const updates = [], params = [];
    if (username) { updates.push('username=?'); params.push(username); }
    if (email) { updates.push('email=?'); params.push(email); }
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

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = get('SELECT * FROM users WHERE email=?', [email]);
    if (!user) return res.json({ message: 'If that email exists, we sent a reset link' });
    
    const token = require('crypto').randomBytes(20).toString('hex');
    run("UPDATE users SET password_reset_token=?, password_reset_expires=datetime('now', '+1 hour') WHERE id=?", [token, user.id]);
    
    const { sendResetEmail } = require('./utils/email');
    await sendResetEmail(email, token, req.headers.origin || `http://${req.headers.host}`);
    res.json({ message: 'Reset email sent' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to send reset email' }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
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
  if (file.library_path) {
    const relPath = path.relative(LIBRARY_PATH, file.library_path).replace(/\\/g, '/');
    const encodedPath = relPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `/library-files/${encodedPath}`;
  }
  return `/uploads/${file.filename}`;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
if (fs.existsSync(LIBRARY_PATH)) {
  app.use('/library-files', express.static(LIBRARY_PATH));
}

// ─── MODELS ───────────────────────────────────────────────────────────

app.get('/api/models', (req, res) => {
  try {
    const { search, category, tag, user, printed, sort = 'updated', order, project_id, page = 1, limit = 24 } = req.query;
    let query = `SELECT m.*, c.name as category_name, c.color as category_color, u.username as uploader_name,
      (SELECT COUNT(*) FROM files WHERE model_id=m.id) as file_count,
      (SELECT COUNT(*) FROM print_history WHERE model_id=m.id) as print_count,
      (SELECT GROUP_CONCAT(DISTINCT file_type) FROM files WHERE model_id=m.id) as file_types,
      (SELECT filename FROM files WHERE model_id=m.id AND file_type='stl' ORDER BY uploaded_at DESC LIMIT 1) as stl_file,
      (SELECT library_path FROM files WHERE model_id=m.id AND file_type='stl' ORDER BY uploaded_at DESC LIMIT 1) as stl_library_path,
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
    
    const models = all(query, params).map(m => {
      let stl_url = null;
      if (m.stl_file) {
        stl_url = getFileUrl({ filename: m.stl_file, library_path: m.stl_library_path });
      } else if (m.mf_file) {
        stl_url = getFileUrl({ filename: m.mf_file, library_path: m.mf_library_path });
      }
      
      let thumb_url = m.thumbnail;
      if (m.thumbnail) {
        const thumbPath = m.library_path ? path.join(m.library_path, m.thumbnail) : null;
        if (thumbPath && fs.existsSync(thumbPath)) {
          thumb_url = getFileUrl({ filename: m.thumbnail, library_path: thumbPath });
        } else {
          thumb_url = `/uploads/${m.thumbnail}`;
        }
      }

      return {
        ...m,
        thumbnail: thumb_url,
        stl_file: stl_url,
        file_types: m.file_types ? [...new Set(m.file_types.split(','))] : [],
        tags: all('SELECT t.id,t.name FROM tags t JOIN model_tags mt ON mt.tag_id=t.id WHERE mt.model_id=?', [m.id]),
        has_printed: m.print_count > 0,
      };
    });
    
    res.json({
      models,
      totalItems,
      totalPages,
      currentPage: parsedPage,
      limit: parsedLimit
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch models' }); }
});

app.get('/api/models/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const model = get('SELECT m.*,c.name as category_name,c.color as category_color, u.username as uploader_name FROM models m LEFT JOIN categories c ON m.category_id=c.id LEFT JOIN users u ON m.user_id=u.id WHERE m.id=?', [id]);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    if (model.thumbnail) {
      const thumbPath = model.library_path ? path.join(model.library_path, model.thumbnail) : null;
      if (thumbPath && fs.existsSync(thumbPath)) {
        model.thumbnail_url = getFileUrl({ filename: model.thumbnail, library_path: thumbPath });
      } else {
        model.thumbnail_url = `/uploads/${model.thumbnail}`;
      }
    }

    model.files = all('SELECT f.*, u.username as uploader_name FROM files f LEFT JOIN users u ON f.user_id=u.id WHERE f.model_id=? ORDER BY uploaded_at DESC', [model.id]).map(f => ({
      ...f,
      url: getFileUrl(f)
    }));
    model.prints = all('SELECT ph.*,mat.name as material_name, u.username as printer_name FROM print_history ph LEFT JOIN materials mat ON ph.material_id=mat.id LEFT JOIN users u ON ph.user_id=u.id WHERE ph.model_id=? ORDER BY ph.printed_at DESC', [model.id]);
    model.tags = all('SELECT t.id,t.name FROM tags t JOIN model_tags mt ON mt.tag_id=t.id WHERE mt.model_id=?', [model.id]);
    model.has_printed = model.prints.length > 0;
    
    // Versions
    const rootId = model.parent_id || model.id;
    model.versions = all(`
      SELECT id, name, created_at, 
      (SELECT COUNT(*) FROM files WHERE model_id = models.id) as file_count 
      FROM models 
      WHERE (id = ? OR parent_id = ?) AND id != ? 
      ORDER BY created_at DESC`, [rootId, rootId, model.id]);

    res.json(model);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch model' }); }
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

app.post('/api/library/scan', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { scanLibrary } = require('./utils/library');
    const results = await scanLibrary(LIBRARY_PATH);
    res.json(results);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/models', authenticate, (req, res) => {
  const userId = req.user.id;
  try {
    const { name, description, print_tips, source_url, category_id, tags } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = run('INSERT INTO models (name,description,print_tips,source_url,category_id,user_id) VALUES (?,?,?,?,?,?)',
      [name.trim(), description||'', print_tips||'', source_url||'', category_id||null, userId]);
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
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create model' }); }
});

app.put('/api/models/:id', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    const model = get('SELECT * FROM models WHERE id=?', [id]);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const { name, description, print_tips, source_url, category_id, tags } = req.body;
    run("UPDATE models SET name=?,description=?,print_tips=?,source_url=?,category_id=?,updated_at=datetime('now') WHERE id=?",
      [name||model.name, description!==undefined?description:model.description, print_tips!==undefined?print_tips:model.print_tips, source_url!==undefined?source_url:model.source_url, category_id!==undefined?category_id:model.category_id, id]);
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
    const id = Number(req.params.id);
    const deleteDisk = req.query.deleteDisk === 'true';
    const success = deleteModelInternal(id, deleteDisk);
    if (!success) return res.status(404).json({ error: 'Model not found' });
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete model' }); }
});

app.post('/api/models/bulk-delete', authenticate, (req, res) => {
  try {
    const { ids, deleteDisk } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'IDs array required' });
    for (const id of ids) {
      deleteModelInternal(Number(id), !!deleteDisk);
    }
    res.json({ success: true, count: ids.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed bulk delete' }); }
});

app.post('/api/models/bulk-update', authenticate, (req, res) => {
  try {
    const { ids, category_id, tags } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'IDs array required' });
    
    for (const id of ids) {
      if (category_id !== undefined) {
        run("UPDATE models SET category_id=?, updated_at=datetime('now') WHERE id=?", [category_id || null, id]);
      }
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
    }
    res.json({ success: true, count: ids.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed bulk update' }); }
});

// ─── FILES ──────────────────────────────────────────────────────────────────

app.post('/api/models/:id/files', authenticate, upload.array('files', 20), (req, res) => {
  try {
    const id = Number(req.params.id);
    const model = get('SELECT * FROM models WHERE id=?', [id]);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
    const { parseGcodeMetadata } = require('./utils/gcode');
    const uploaded = [];
    for (const file of req.files) {
      const ft = getFileType(file.originalname);
      let metadata = null;
      if (ft === 'gcode') {
        const meta = parseGcodeMetadata(file.path);
        if (meta) metadata = JSON.stringify(meta);
        
        if (!model.thumbnail) {
          const { extractGcodeThumbnail } = require('./utils/gcode');
          const thumb = extractGcodeThumbnail(file.path, UPLOADS_DIR);
          if (thumb) {
            run('UPDATE models SET thumbnail=? WHERE id=?', [thumb, id]);
            model.thumbnail = thumb;
          }
        }
      }
      if (ft === 'image' && !model.thumbnail) run('UPDATE models SET thumbnail=? WHERE id=?', [file.filename, id]);
      
      // Move file to library if model has a library path or we can create one
      let finalPath = file.path;
      let libPath = model.library_path;
      
      if (!libPath) {
        // Create a folder for the model in library
        const safeName = model.name.replace(/[<>:"/\\|?*]/g, '').trim() || `model_${id}`;
        const basePath = req.body.parent_folder ? path.join(LIBRARY_PATH, req.body.parent_folder) : LIBRARY_PATH;
        libPath = req.body.create_subfolder !== 'false' ? path.join(basePath, safeName) : basePath;
        if (!fs.existsSync(libPath)) fs.mkdirSync(libPath, { recursive: true });
        run('UPDATE models SET library_path=? WHERE id=?', [libPath, id]);
      }

      const destPath = path.join(libPath, file.originalname);
      try {
        // Handle filename collisions in library
        let finalDest = destPath;
        let counter = 1;
        while (fs.existsSync(finalDest)) {
          const ext = path.extname(file.originalname);
          const base = path.basename(file.originalname, ext);
          finalDest = path.join(libPath, `${base}_${counter}${ext}`);
          counter++;
        }
        fs.copyFileSync(file.path, finalDest);
        fs.unlinkSync(file.path);
        finalPath = finalDest;
      } catch (err) {
        console.error('Failed to move uploaded file to library (using copy fallback):', err);
      }

      const r = run('INSERT INTO files (model_id,filename,original_name,file_type,file_size,metadata,library_path) VALUES (?,?,?,?,?,?,?)',
        [id, file.filename, file.originalname, ft, file.size, metadata, finalPath]);
      uploaded.push({ id: r.lastId, model_id: id, filename: file.filename, original_name: file.originalname, file_type: ft, file_size: file.size, metadata, library_path: finalPath });
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
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (model.thumbnail) { const p = path.join(UPLOADS_DIR, model.thumbnail); if (fs.existsSync(p)) fs.unlinkSync(p); }
    run("UPDATE models SET thumbnail=?,updated_at=datetime('now') WHERE id=?", [req.file.filename, id]);
    res.json({ thumbnail: req.file.filename });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to upload thumbnail' }); }
});

app.get('/api/files/:id/download', (req, res) => {
  try {
    const file = get('SELECT * FROM files WHERE id=?', [Number(req.params.id)]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const p = file.library_path || path.join(UPLOADS_DIR, file.filename);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'File not found on disk' });
    res.download(p, file.original_name);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to download' }); }
});

app.delete('/api/files/:id', authenticate, (req, res) => {
  try {
    const file = get('SELECT * FROM files WHERE id=?', [Number(req.params.id)]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    
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

// ─── PROJECTS ───────────────────────────────────────────────────────────────

app.get('/api/projects', authenticate, (req, res) => {
  try {
    const projects = all('SELECT p.*, COUNT(pm.model_id) as model_count FROM projects p LEFT JOIN project_models pm ON p.id=pm.project_id GROUP BY p.id ORDER BY p.created_at DESC');
    res.json(projects);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch projects' }); }
});

app.get('/api/projects/:id', authenticate, (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id=?', [Number(req.params.id)]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.models = all(`
      SELECT m.*, c.name as category_name, c.color as category_color 
      FROM models m 
      JOIN project_models pm ON m.id=pm.model_id 
      LEFT JOIN categories c ON m.category_id=c.id 
      WHERE pm.project_id=?`, [project.id]);
    res.json(project);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch project' }); }
});

app.post('/api/projects', authenticate, (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const r = run('INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)', [name, description||'', req.user.id]);
    res.status(201).json({ id: r.lastId, name, description });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create project' }); }
});

app.delete('/api/projects/:id', authenticate, (req, res) => {
  try {
    run('DELETE FROM projects WHERE id=?', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete project' }); }
});

app.post('/api/projects/:id/models', authenticate, (req, res) => {
  try {
    const { model_id } = req.body;
    run('INSERT OR IGNORE INTO project_models (project_id, model_id) VALUES (?, ?)', [Number(req.params.id), Number(model_id)]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to add model to project' }); }
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

app.delete('/api/projects/:id/models/:modelId', authenticate, (req, res) => {
  try {
    run('DELETE FROM project_models WHERE project_id=? AND model_id=?', [Number(req.params.id), Number(req.params.modelId)]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to remove model from project' }); }
});

// ─── SHARING ────────────────────────────────────────────────────────────────

app.post('/api/shares', authenticate, (req, res) => {
  try {
    const { model_id, expires_days } = req.body;
    const slug = require('crypto').randomBytes(6).toString('hex');
    const expires_at = expires_days ? `datetime('now', '+${expires_days} days')` : null;
    
    if (expires_at) {
      run(`INSERT INTO shares (id, model_id, expires_at) VALUES (?, ?, ${expires_at})`, [slug, Number(model_id)]);
    } else {
      run('INSERT INTO shares (id, model_id, expires_at) VALUES (?, ?, NULL)', [slug, Number(model_id)]);
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
        hasUpdate: latestVersion !== currentVersion,
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
app.get('/api/browse', (req, res) => {
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
    const supportedExts = ['.stl', '.gcode', '.3mf', '.step', '.obj'];
    const imageExts = ['.png', '.jpg', '.jpeg'];
    
    const dbThumbs = all('SELECT f.library_path, COALESCE(f.thumbnail, m.thumbnail) as thumbnail FROM files f JOIN models m ON f.model_id = m.id WHERE (f.thumbnail IS NOT NULL OR m.thumbnail IS NOT NULL) AND f.library_path IS NOT NULL');
    const thumbMap = new Map();
    for (const row of dbThumbs) thumbMap.set(row.library_path, row.thumbnail);

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
        
        folders.push({
          name: item.name,
          path: reqPath ? `${reqPath}/${item.name}` : item.name,
          itemCount
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
          else if (ext === '.gcode') fileType = 'gcode';
          else if (ext === '.3mf') fileType = '3mf';
          else if (ext === '.step') fileType = 'step';
          else if (ext === '.obj') fileType = 'obj';
          else if (imageExts.includes(ext)) fileType = 'image';
          
          let thumbnailUrl = null;
          const thumb = thumbMap.get(filePath);
          if (thumb) {
            thumbnailUrl = thumb.startsWith('http') ? thumb : `/uploads/${thumb}`;
          }

          files.push({
            name: item.name,
            size: stat.size,
            type: fileType,
            url: encodedUrl,
            thumbnailUrl,
            folderPath: reqPath
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
app.get('/api/browse/tree', (req, res) => {
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
app.get('/api/browse/search', (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json({ folders: [], files: [] });
    
    const dbThumbs = all('SELECT library_path, thumbnail FROM files WHERE thumbnail IS NOT NULL');
    const thumbMap = new Map();
    for (const row of dbThumbs) thumbMap.set(row.library_path, row.thumbnail);

    const folders = [];
    const files = [];
    const supportedExts = ['.stl', '.gcode', '.3mf', '.step', '.obj'];
    const imageExts = ['.png', '.jpg', '.jpeg'];
    
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
            folders.push({ name: item.name, path: childRel, itemCount });
          }
          walk(childFull, childRel);
        } else {
          if (item.name.toLowerCase().includes(q)) {
            const ext = path.extname(item.name).toLowerCase();
            if (supportedExts.includes(ext) || imageExts.includes(ext)) {
              let fileType = 'other';
              if (ext === '.stl') fileType = 'stl';
              else if (ext === '.gcode') fileType = 'gcode';
              else if (ext === '.3mf') fileType = '3mf';
              else if (ext === '.step') fileType = 'step';
              else if (ext === '.obj') fileType = 'obj';
              else if (imageExts.includes(ext)) fileType = 'image';
              
              const stat = fs.statSync(childFull);
              const encodedUrl = '/library-files/' + childRel.split('/').map(s => encodeURIComponent(s)).join('/');
              
              let thumbnailUrl = null;
              const thumb = thumbMap.get(childFull);
              if (thumb) {
                thumbnailUrl = thumb.startsWith('http') ? thumb : `/uploads/${thumb}`;
              }

              files.push({ name: item.name, size: stat.size, type: fileType, url: encodedUrl, thumbnailUrl, folderPath: relPath });
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
  settings.forEach(s => config[s.key] = s.value);
  res.json(config);
});

app.post('/api/settings/smtp', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const config = req.body;
    for (const [key, value] of Object.entries(config)) {
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
    scanIntervalId = setInterval(async () => {
      console.log('Running scheduled library scan...');
      try {
        const { scanLibrary } = require('./utils/library');
        await scanLibrary(LIBRARY_PATH);
        console.log('Scheduled library scan completed.');
      } catch (e) {
        console.error('Scheduled library scan failed:', e);
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GyroidVault running on http://0.0.0.0:${PORT}`);
    setupBackgroundScanner();
  });
})();
