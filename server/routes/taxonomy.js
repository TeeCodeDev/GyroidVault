const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const { get, all, run } = require('../database');
const { authenticate } = require('../middleware/auth');
const { safeInt } = require('../middleware/security');
const { getFileUrl } = require('../utils/modelHelpers');

// ─── CATEGORIES ─────────────────────────────────────────────────────────────
router.get('/categories', (req, res) => {
  try {
    res.json(all('SELECT c.*,(SELECT COUNT(*) FROM models WHERE category_id=c.id) as model_count FROM categories c ORDER BY c.name'));
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/categories', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = run('INSERT INTO categories (name,color) VALUES (?,?)', [name.trim(), color || '#8b5cf6']);
    res.status(201).json(get('SELECT * FROM categories WHERE id=?', [r.lastId]));
  } catch (e) {
    res.status(e.message?.includes('UNIQUE') ? 409 : 500).json({ error: e.message?.includes('UNIQUE') ? 'Already exists' : 'Failed' });
  }
});

router.put('/categories/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name, color } = req.body;
    run('UPDATE categories SET name=COALESCE(?,name),color=COALESCE(?,color) WHERE id=?', [name, color, Number(req.params.id)]);
    res.json(get('SELECT * FROM categories WHERE id=?', [Number(req.params.id)]));
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.delete('/categories/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    run('DELETE FROM categories WHERE id=?', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ─── TAGS ───────────────────────────────────────────────────────────────────
router.get('/tags', (req, res) => {
  try {
    res.json(all('SELECT t.*,(SELECT COUNT(*) FROM model_tags WHERE tag_id=t.id) as model_count FROM tags t ORDER BY t.name'));
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/tags', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = run('INSERT INTO tags (name) VALUES (?)', [name.trim()]);
    res.status(201).json(get('SELECT * FROM tags WHERE id=?', [r.lastId]));
  } catch (e) {
    res.status(e.message?.includes('UNIQUE') ? 409 : 500).json({ error: e.message?.includes('UNIQUE') ? 'Already exists' : 'Failed' });
  }
});

router.delete('/tags/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    run('DELETE FROM tags WHERE id=?', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ─── MATERIALS ──────────────────────────────────────────────────────────────
router.get('/materials', (req, res) => {
  try {
    res.json(all('SELECT mat.*,(SELECT COUNT(*) FROM print_history WHERE material_id=mat.id) as usage_count FROM materials mat ORDER BY mat.is_preset DESC,mat.name'));
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/materials', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = run('INSERT INTO materials (name,is_preset) VALUES (?,0)', [name.trim()]);
    res.status(201).json(get('SELECT * FROM materials WHERE id=?', [r.lastId]));
  } catch (e) {
    res.status(e.message?.includes('UNIQUE') ? 409 : 500).json({ error: e.message?.includes('UNIQUE') ? 'Already exists' : 'Failed' });
  }
});

router.delete('/materials/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const m = get('SELECT * FROM materials WHERE id=?', [Number(req.params.id)]);
    if (!m) return res.status(404).json({ error: 'Not found' });
    if (m.is_preset) return res.status(403).json({ error: 'Cannot delete preset materials' });
    run('DELETE FROM materials WHERE id=?', [m.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ─── SHARES ─────────────────────────────────────────────────────────────────
router.post('/shares', authenticate, (req, res) => {
  try {
    const { model_id, expires_days } = req.body;
    const modelId = safeInt(model_id, 0);
    if (!modelId) return res.status(400).json({ error: 'Valid model_id is required' });

    const model = get('SELECT id, user_id FROM models WHERE id=?', [modelId]);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    if (req.user.role !== 'admin' && model.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const slug = crypto.randomBytes(6).toString('hex');
    const days = (expires_days !== undefined && expires_days !== null && expires_days !== '') 
      ? safeInt(expires_days, 7, 1, 365) 
      : null;
    
    if (days !== null) {
      run("INSERT INTO shares (id, model_id, expires_at) VALUES (?, ?, datetime('now', '+' || ? || ' days'))", [slug, modelId, days]);
    } else {
      run('INSERT INTO shares (id, model_id, expires_at) VALUES (?, ?, NULL)', [slug, modelId]);
    }
    
    res.json({ slug });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create share' });
  }
});

router.get('/shares/:slug', (req, res) => {
  try {
    const share = get("SELECT * FROM shares WHERE id=? AND (expires_at IS NULL OR expires_at > datetime('now'))", [req.params.slug]);
    if (!share) return res.status(404).json({ error: 'Share not found or expired' });
    
    const model = get('SELECT m.*,c.name as category_name,c.color as category_color FROM models m LEFT JOIN categories c ON m.category_id=c.id WHERE m.id=?', [share.model_id]);
    model.share_slug = req.params.slug;
    model.files = all('SELECT * FROM files WHERE model_id=? ORDER BY uploaded_at DESC', [model.id]).map(f => {
      const base = getFileUrl(f);
      return {
        ...f,
        url: base + (base.includes('?') ? '&' : '?') + 'share=' + encodeURIComponent(req.params.slug)
      };
    });
    res.json(model);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch shared model' });
  }
});

// ─── PRINT HISTORY DELETION ─────────────────────────────────────────────────
router.delete('/prints/:id', authenticate, (req, res) => {
  try {
    const p = get('SELECT * FROM print_history WHERE id=?', [Number(req.params.id)]);
    if (!p) return res.status(404).json({ error: 'Not found' });
    run('DELETE FROM print_history WHERE id=?', [p.id]);
    run("UPDATE models SET updated_at=datetime('now') WHERE id=?", [p.model_id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete print' });
  }
});

// ─── VIEW MODE SETTING ──────────────────────────────────────────────────────
router.get('/settings/view-mode', (req, res) => {
  const row = get("SELECT value FROM system_settings WHERE key='library_view_mode'");
  res.json({ library_view_mode: row?.value || 'grid' });
});

module.exports = router;
