const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { get, all, run } = require('../database');
const { LIBRARY_PATH } = require('../config');
const { authenticate } = require('../middleware/auth');
const { getThumbUrl } = require('../utils/modelHelpers');

// ─── POST /api/browse/move ───────────────────────────────────────────────────
router.post('/move', authenticate, (req, res) => {
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

// ─── POST /api/browse/mkdir ──────────────────────────────────────────────────
router.post('/mkdir', authenticate, (req, res) => {
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

// ─── POST /api/browse/bulk-move ──────────────────────────────────────────────
router.post('/bulk-move', authenticate, (req, res) => {
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

// ─── POST /api/browse/bulk-delete ────────────────────────────────────────────
router.post('/bulk-delete', authenticate, (req, res) => {
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

// ─── POST /api/browse/bulk-tag ───────────────────────────────────────────────
router.post('/bulk-tag', authenticate, (req, res) => {
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

// ─── POST /api/browse/bulk-category ──────────────────────────────────────────
router.post('/bulk-category', authenticate, (req, res) => {
  if (!req.user || req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { paths, category_id } = req.body;
    if (!Array.isArray(paths) || paths.length === 0) return res.status(400).json({ error: 'Missing paths' });

    const catVal = category_id ? Number(category_id) : null;
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

    for (const modelId of modelIds) {
      run("UPDATE models SET category_id=?, updated_at=datetime('now') WHERE id=?", [catVal, modelId]);
    }

    res.json({ success: true, updated: modelIds.size });
  } catch (e) {
    console.error('[Bulk Category] Error:', e);
    res.status(500).json({ error: 'Failed to bulk update category' });
  }
});

// ─── GET /api/browse ─────────────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  try {
    const reqPath = req.query.path || '';
    const fullPath = path.resolve(LIBRARY_PATH, reqPath);
    
    // Security: make sure we stay inside LIBRARY_PATH
    if (!fullPath.startsWith(path.resolve(LIBRARY_PATH))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    const supportedExts = ['.stl', '.gcode', '.bgcode', '.3mf', '.step', '.stp', '.f3d', '.obj'];
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    
    // High-performance metadata lookup only for files inside this directory
    const normFullPath = fullPath.replace(/\\/g, '/');
    const dbDirFiles = all(
      `SELECT id, model_id, library_path, metadata, thumbnail FROM files 
       WHERE (library_path LIKE ? || '/%' OR library_path LIKE ? || '\\\\%') 
         AND library_path NOT LIKE ? || '/%/%' 
         AND library_path NOT LIKE ? || '\\\\%\\\\%'`,
      [normFullPath, fullPath, normFullPath, fullPath]
    );
    const dbFileMap = new Map();
    for (const row of dbDirFiles) {
      if (row.library_path) {
        dbFileMap.set(row.library_path, row);
        dbFileMap.set(row.library_path.replace(/\\/g, '/'), row);
      }
    }

    const { parseGcodeMetadata } = require('../utils/gcode');
    const folders = [];
    const files = [];
    
    for (const item of items) {
      if (item.name.startsWith('.')) continue; // skip hidden files
      
      if (item.isDirectory()) {
        let itemCount = 0;
        const folderFullPath = path.join(fullPath, item.name);
        try {
          itemCount = fs.readdirSync(folderFullPath).filter(f => !f.startsWith('.')).length;
        } catch(e) { /* permission error, just show 0 */ }
        
        let folderThumbs = [];
        const folderModel = get('SELECT id, thumbnail FROM models WHERE library_path = ?', [folderFullPath]);
        if (folderModel && folderModel.thumbnail) {
          folderThumbs.push(getThumbUrl(folderModel.thumbnail, folderFullPath));
        }
        
        // Fast indexed SQLite query for up to 4 child thumbnails
        const fNorm = (folderFullPath + '/').replace(/\\/g, '/');
        const fWin = (folderFullPath + '\\');
        const thumbRows = all(
          `SELECT thumbnail, library_path FROM files 
           WHERE (library_path LIKE ? || '%' OR library_path LIKE ? || '%') 
             AND thumbnail IS NOT NULL 
           LIMIT 4`,
          [fNorm, fWin]
        );
        for (const tr of thumbRows) {
          const url = getThumbUrl(tr.thumbnail, path.dirname(tr.library_path));
          if (!folderThumbs.includes(url)) {
            folderThumbs.push(url);
            if (folderThumbs.length >= 4) break;
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
          const normFilePath = filePath.replace(/\\/g, '/');
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
          const dbFile = dbFileMap.get(filePath) || dbFileMap.get(normFilePath) || get('SELECT id, model_id, library_path, metadata, thumbnail FROM files WHERE library_path = ? OR library_path = ?', [filePath, normFilePath]);
          if (dbFile && dbFile.thumbnail) {
            thumbnailUrl = getThumbUrl(dbFile.thumbnail, path.dirname(filePath));
          }

          let metadata = null;
          if (dbFile?.metadata) {
            try { metadata = typeof dbFile.metadata === 'string' ? JSON.parse(dbFile.metadata) : dbFile.metadata; } catch(e){}
          }
          if (!metadata && fileType === 'gcode') {
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
    
    // Sort folders alphabetically, files by name
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    
    // Figure out parent path for the breadcrumb "go up" button
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

// ─── GET /api/browse/tree ────────────────────────────────────────────────────
router.get('/tree', authenticate, (req, res) => {
  try {
    const maxDepth = 4; // Keep it snappy
    
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

// ─── GET /api/browse/search ──────────────────────────────────────────────────
router.get('/search', authenticate, (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json({ folders: [], files: [] });
    
    const dbThumbs = all('SELECT library_path, thumbnail FROM files WHERE thumbnail IS NOT NULL');
    const thumbMap = new Map();
    for (const row of dbThumbs) thumbMap.set(row.library_path, row.thumbnail);

    const matchingModels = all(`
      SELECT library_path FROM models m
      WHERE library_path IS NOT NULL AND (
        LOWER(m.name) LIKE ?
        OR LOWER(m.description) LIKE ?
        OR m.category_id IN (SELECT id FROM categories WHERE LOWER(name) LIKE ?)
        OR m.id IN (SELECT mt.model_id FROM model_tags mt JOIN tags t ON mt.tag_id = t.id WHERE LOWER(t.name) LIKE ?)
      )
    `, [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`]);
    const matchingModelPaths = new Set(matchingModels.map(r => r.library_path));

    const dbFilesList = all('SELECT id, model_id, library_path, metadata, thumbnail FROM files WHERE library_path IS NOT NULL');
    const dbFileMap = new Map();
    for (const row of dbFilesList) dbFileMap.set(row.library_path, row);

    const { parseGcodeMetadata } = require('../utils/gcode');
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
          if (item.name.toLowerCase().includes(q) || matchingModelPaths.has(childFull)) {
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

module.exports = router;

