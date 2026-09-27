const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { get, all, run } = require('../database');
const { UPLOADS_DIR } = require('../config');
const { authenticate } = require('../middleware/auth');
const { heavyLimiter } = require('../middleware/rateLimit');
const { getFileUrl } = require('../utils/modelHelpers');

// ─── GET /api/projects ────────────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
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

// ─── GET /api/projects/:id ────────────────────────────────────────────────────
router.get('/:id', authenticate, (req, res) => {
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
        SELECT COUNT(id) as total_files, SUM(file_size) as total_size, GROUP_CONCAT(DISTINCT file_type) as file_types
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

// ─── POST /api/projects ───────────────────────────────────────────────────────
router.post('/', authenticate, (req, res) => {
  try {
    const { name, description, visibility } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const vis = visibility === 'private' ? 'private' : 'public';
    const r = run('INSERT INTO projects (name, description, user_id, visibility) VALUES (?, ?, ?, ?)', [name, description||'', req.user.id, vis]);
    res.status(201).json({ id: r.lastId, name, description, visibility: vis });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create project' }); }
});

// ─── PUT /api/projects/:id ────────────────────────────────────────────────────
router.put('/:id', authenticate, (req, res) => {
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

// ─── DELETE /api/projects/:id ─────────────────────────────────────────────────
router.delete('/:id', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = get('SELECT user_id FROM projects WHERE id=?', [id]);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    if (req.user.role !== 'admin' && p.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    run('DELETE FROM projects WHERE id=?', [id]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete project' }); }
});

// ─── POST /api/projects/bulk-delete ───────────────────────────────────────────
router.post('/bulk-delete', authenticate, (req, res) => {
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

// ─── POST /api/projects/bulk-visibility ───────────────────────────────────────
router.post('/bulk-visibility', authenticate, (req, res) => {
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

// ─── POST /api/projects/:id/models ────────────────────────────────────────────
router.post('/:id/models', authenticate, (req, res) => {
  try {
    const { model_id } = req.body;
    run('INSERT OR IGNORE INTO project_models (project_id, model_id) VALUES (?, ?)', [Number(req.params.id), Number(model_id)]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to add model to project' }); }
});

// ─── POST /api/projects/:id/models/bulk ───────────────────────────────────────
router.post('/:id/models/bulk', authenticate, (req, res) => {
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

// ─── POST /api/projects/:id/models/bulk-remove ────────────────────────────────
router.post('/:id/models/bulk-remove', authenticate, (req, res) => {
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

// ─── DELETE /api/projects/:id/models/:modelId ─────────────────────────────────
router.delete('/:id/models/:modelId', authenticate, (req, res) => {
  try {
    run('DELETE FROM project_models WHERE project_id=? AND model_id=?', [Number(req.params.id), Number(req.params.modelId)]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to remove model from project' }); }
});

// ─── GET /api/projects/:id/download ───────────────────────────────────────────
router.get('/:id/download', authenticate, heavyLimiter, (req, res) => {
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
      const files = all('SELECT filename, library_path FROM files WHERE model_id=?', [model.id]);
      const folderName = model.name.replace(/[/\\?%*:|"<>]/g, '_');
      for (const file of files) {
        const filePath = (file.library_path && fs.existsSync(file.library_path))
          ? file.library_path
          : (file.filename && fs.existsSync(path.join(UPLOADS_DIR, file.filename)) ? path.join(UPLOADS_DIR, file.filename) : null);
        if (filePath) {
          zip.addLocalFile(filePath, folderName);
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

module.exports = router;
