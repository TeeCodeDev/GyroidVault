const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { get, all, run } = require('../database');
const { LIBRARY_PATH, UPLOADS_DIR } = require('../config');
const { authenticate } = require('../middleware/auth');
const { heavyLimiter } = require('../middleware/rateLimit');
const { upload, getFileType } = require('../middleware/upload');
const { validatePathConfinement } = require('../middleware/security');
const { getSettingBool } = require('../utils/modelHelpers');

// ─── GET /api/files/:id/stream ────────────────────────────────────────────────
router.get('/:id/stream', (req, res, next) => {
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

// ─── GET /api/files/:id/download/:filename? ──────────────────────────────────
router.get('/:id/download/:filename?', heavyLimiter, (req, res, next) => {
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

// ─── GET /api/files/:id/3mf/:filename? ───────────────────────────────────────
// Serve any STL or 3MF as a 3MF. Bambu Studio's bambustudio:// handler refuses a
// URL that does not end in .3mf, so a plain STL has to be wrapped server-side.
router.get('/:id/3mf/:filename?', heavyLimiter, (req, res) => {
  const shareSlug = req.query.share;
  const doConvert = () => {
    try {
      const { stlToMesh, meshTo3mf } = require('../utils/3mf');
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

      if (file.file_type !== 'stl' && file.file_type !== '3mf') {
        return res.status(415).json({ error: 'Only STL and 3MF files can be served as 3MF' });
      }

      const p = file.library_path || path.join(UPLOADS_DIR, file.filename);
      if (!fs.existsSync(p)) return res.status(404).json({ error: 'File not found on disk' });

      const baseDir = file.library_path ? LIBRARY_PATH : UPLOADS_DIR;
      const confined = validatePathConfinement(baseDir, path.relative(baseDir, p));
      if (!confined) return res.status(403).json({ error: 'Access denied' });

      const name = String(file.original_name || file.filename).replace(/\.[^.]+$/, '').replace(/[/\\?%*:|"<>]/g, '_');
      res.setHeader('Content-Type', 'model/3mf');
      if (file.file_type === '3mf') return res.download(confined, `${name}.3mf`);

      if (fs.statSync(confined).size > 300 * 1024 * 1024) {
        return res.status(413).json({ error: 'File too large to convert to 3MF' });
      }

      const mesh = stlToMesh(fs.readFileSync(confined));
      if (!mesh.tris.length) return res.status(422).json({ error: 'No triangles found in STL' });

      const buffer = meshTo3mf(mesh);
      res.setHeader('Content-Disposition', `attachment; filename="${name}.3mf"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to build 3MF' }); }
  };

  if (shareSlug) {
    doConvert();
  } else if (getSettingBool('require_login_to_view')) {
    authenticate(req, res, doConvert);
  } else {
    doConvert();
  }
});

// ─── DELETE /api/files/:id ────────────────────────────────────────────────────
router.delete('/:id', authenticate, (req, res) => {
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
      try { fs.unlinkSync(file.library_path); } catch (err) { console.error('Failed to delete physical file:', err); }
    }
    
    run('DELETE FROM files WHERE id=?', [file.id]);
    run("UPDATE models SET updated_at=datetime('now') WHERE id=?", [file.model_id]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete file' }); }
});

// ─── POST /api/files/:id/send-to-printer ──────────────────────────────────────
router.post('/:id/send-to-printer', authenticate, async (req, res) => {
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

// ─── Slicer Upload Handler (mounted at /api/upload-slicer) ───────────────────
const uploadSlicerHandler = [authenticate, upload.single('file'), (req, res) => {
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
      const { parseGcodeMetadata, extractGcodeThumbnail } = require('../utils/gcode');
      const meta = parseGcodeMetadata(finalDest);
      if (meta) metadata = JSON.stringify(meta);
      thumbnail = extractGcodeThumbnail(finalDest, UPLOADS_DIR);
    } else if (fileType === '3mf') {
      const { extract3mfThumbnail } = require('../utils/3mf');
      thumbnail = extract3mfThumbnail(finalDest, UPLOADS_DIR);
    } else if (fileType === 'f3d') {
      const { extractF3dThumbnail } = require('../utils/f3d');
      thumbnail = extractF3dThumbnail(finalDest, UPLOADS_DIR);
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
}];

module.exports = {
  router,
  uploadSlicerHandler
};

