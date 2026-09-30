const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { get, all, run } = require('../database');
const { LIBRARY_PATH, UPLOADS_DIR } = require('../config');
const { authenticate } = require('../middleware/auth');
const { getSettingBool, hashFileStream } = require('../utils/modelHelpers');
const { getBlockedIPs, unblockIP } = require('../middleware/rateLimit');
const { setupBackgroundScanner } = require('../services/backgroundTasks');
const logger = require('../utils/logger');

// ─── PUBLIC CONFIG ──────────────────────────────────────────────────────────
router.get('/system/public-config', (req, res) => {
  const userCount = get('SELECT COUNT(*) as count FROM users').count;
  res.json({
    open_registration: getSettingBool('open_registration') || userCount === 0,
    require_login_to_view: getSettingBool('require_login_to_view')
  });
});

// ─── SYSTEM SETTINGS ────────────────────────────────────────────────────────
router.get('/settings/system', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const settings = all('SELECT * FROM system_settings WHERE key NOT LIKE "smtp_%"');
  const config = {};
  settings.forEach(s => config[s.key] = s.value);
  res.json(config);
});

router.post('/settings/system', authenticate, (req, res) => {
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

    // If deep ZIP scanning was disabled, purge any previously indexed virtual archive entries (#78)
    if (config.scan_zip_archives !== undefined && String(config.scan_zip_archives) !== 'true' && String(config.scan_zip_archives) !== '1') {
      run('DELETE FROM files WHERE is_archive_entry = 1');
    }
    
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save system settings' });
  }
});

// ─── BLOCKED IPS ────────────────────────────────────────────────────────────
router.get('/system/blocked-ips', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json(getBlockedIPs());
});

router.post('/system/unblock-ip', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP address required' });
  unblockIP(ip);
  res.json({ success: true, message: `IP ${ip} unblocked successfully` });
});

// ─── DUPLICATES SCANNER ─────────────────────────────────────────────────────
router.get('/system/duplicates', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const startTime = Date.now();
  try {
    logger.info('Duplicates', 'Starting scan for duplicate files...');
    
    // Efficiently query only file sizes that appear 2 or more times (using SQLite index)
    const duplicateSizes = all(`
      SELECT file_size 
      FROM files 
      WHERE file_size > 0 
      GROUP BY file_size 
      HAVING COUNT(*) > 1
    `).map(r => r.file_size);

    if (duplicateSizes.length === 0) {
      logger.info('Duplicates', 'Duplicate scan complete: no candidate files share identical file sizes.');
      return res.json({ success: true, duplicatesCount: 0, groups: [] });
    }

    logger.info('Duplicates', `Found ${duplicateSizes.length} file size groups with potential duplicates. Hashing candidate files...`);

    const duplicateGroups = [];
    let totalHashed = 0;

    for (const size of duplicateSizes) {
      const candidateFiles = all(`
        SELECT f.id, f.filename, f.original_name, f.file_size, f.file_type, f.library_path, f.model_id, m.name as model_name
        FROM files f
        LEFT JOIN models m ON f.model_id = m.id
        WHERE f.file_size = ?
      `, [size]);

      if (candidateFiles.length < 2) continue;

      const hashGroups = {};
      for (const f of candidateFiles) {
        const filePath = f.library_path || path.join(UPLOADS_DIR, f.filename);
        if (!fs.existsSync(filePath)) continue;

        try {
          // Stream-based SHA256 hashing (memory-safe: uses 64KB chunks instead of loading multi-GB buffers)
          const hash = await hashFileStream(filePath);
          totalHashed++;
          if (!hashGroups[hash]) hashGroups[hash] = [];
          hashGroups[hash].push(f);
        } catch (err) {
          logger.warn('Duplicates', `Failed to hash ${filePath}: ${err.message}`);
        }

        // Cooperative yield to keep event loop and HTTP server responsive
        await new Promise(resolve => setImmediate(resolve));
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

    const duration = Date.now() - startTime;
    logger.info('Duplicates', `Duplicate scan completed in ${duration}ms. Hashed ${totalHashed} files, found ${duplicateGroups.length} duplicate groups.`);

    res.json({ success: true, duplicatesCount: duplicateGroups.length, groups: duplicateGroups });
  } catch (e) {
    logger.error('Duplicates', 'Duplicate scan error:', e);
    res.status(500).json({ error: 'Failed to scan for duplicate files' });
  }
});

// ─── SMTP SETTINGS ──────────────────────────────────────────────────────────
router.get('/settings/smtp', authenticate, (req, res) => {
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

router.post('/settings/smtp', authenticate, (req, res) => {
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save SMTP settings' });
  }
});

router.post('/settings/smtp/test', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const { sendTestEmail } = require('../utils/email');
    await sendTestEmail(email);
    res.json({ success: true });
  } catch (e) { 
    console.error(e); 
    res.status(500).json({ error: e.message || 'Failed to send test email' }); 
  }
});

// ─── USERS MANAGEMENT ───────────────────────────────────────────────────────
router.get('/users', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    res.json(all('SELECT id, username, email, role FROM users ORDER BY username ASC'));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.put('/users/:id/role', authenticate, (req, res) => {
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

router.delete('/users/:id', authenticate, (req, res) => {
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

// ─── LIBRARY SCANNER ────────────────────────────────────────────────────────
router.post('/library/scan', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { startScanAsync } = require('../utils/library');
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

router.get('/library/scan/status', authenticate, (req, res) => {
  try {
    const { getScanStatus } = require('../utils/library');
    res.json(getScanStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/library/scan/cancel', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { cancelScan, getScanStatus } = require('../utils/library');
    const cancelled = cancelScan();
    res.json({ cancelled, status: getScanStatus() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── UPDATES & RELEASE NOTES ────────────────────────────────────────────────
let lastUpdateCheck = { time: 0, data: null };

router.get('/system/updates', async (req, res) => {
  try {
    const pkg = require('../../package.json');
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

router.get('/system/release-notes', (req, res) => {
  try {
    const rootDir = path.join(__dirname, '..', '..');
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

// ─── SYSTEM LOGS ────────────────────────────────────────────────────────────
router.get('/system/logs', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    res.json(all('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 100'));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

router.delete('/system/logs', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    run('DELETE FROM system_logs');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// ─── STATS ──────────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
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
      successRate: totalPrints > 0 ? Math.round((successfulPrints / totalPrints) * 100) : 0,
      totalSize, recentModels, recentPrints, materialUsage,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
