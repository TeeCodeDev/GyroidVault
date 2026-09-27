const fs = require('fs');
const { all, get, run, saveDb } = require('../database');
const { LIBRARY_PATH, SYNC_BATCH_SIZE, SYNC_INTERVAL_MS } = require('../config');
const { logEvent } = require('../utils/modelHelpers');
const logger = require('../utils/logger');

let syncInProgress = false;
let syncIntervalId = null;
let scanIntervalId = null;

async function checkBatch(files) {
  const results = await Promise.allSettled(
    files.map(f => fs.promises.access(f.library_path))
  );
  const missing = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') missing.push(files[i]);
  });
  return missing;
}

/**
 * Background disk synchronizer: cleans up DB references to files or empty models
 * that were deleted directly from the filesystem.
 */
async function syncLibraryWithDisk() {
  if (syncInProgress) {
    logger.info('Sync', 'Skipped: previous disk sync still in progress.');
    return;
  }
  syncInProgress = true;
  try {
    // Only check physical files on disk; skip virtual entries inside archives (is_archive_entry = 1)
    const files = all('SELECT id, library_path, original_name FROM files WHERE library_path IS NOT NULL AND (is_archive_entry IS NULL OR is_archive_entry = 0)');
    let deletedCount = 0;

    for (let i = 0; i < files.length; i += SYNC_BATCH_SIZE) {
      const batch = files.slice(i, i + SYNC_BATCH_SIZE);
      const missing = await checkBatch(batch);
      for (const file of missing) {
        const msg = `File missing from disk, removing from DB: ${file.original_name}`;
        logger.warn('Sync', msg);
        logEvent('warning', msg);
        run('DELETE FROM files WHERE id=?', [file.id], true); // skipSave: batched
        deletedCount++;
      }
      await new Promise(resolve => setImmediate(resolve)); // yield to event loop
    }
    
    // Cleanup empty models to prevent ghost entries
    const emptyModels = all(`
      SELECT m.id, m.name FROM models m 
      LEFT JOIN files f ON f.model_id = m.id 
      WHERE f.id IS NULL AND m.library_path IS NOT NULL
    `);
    for (const model of emptyModels) {
      const msg = `Model directory empty/missing, removing model: ${model.name}`;
      logger.warn('Sync', msg);
      logEvent('warning', msg);
      run('DELETE FROM models WHERE id=?', [model.id], true);
      deletedCount++;
    }

    if (deletedCount > 0) {
      saveDb();
      logEvent('info', `Library sync complete. Removed ${deletedCount} stale entries.`);
    }
  } catch (e) {
    logger.error('Sync', 'Error during library sync:', e);
  } finally {
    syncInProgress = false;
  }
}

/**
 * Configures the periodic library scanner according to system_settings 'auto_scan_interval'
 */
function setupBackgroundScanner() {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  
  const setting = get('SELECT value FROM system_settings WHERE key="auto_scan_interval"');
  const hours = setting && setting.value !== undefined ? Number(setting.value) : 24;
  
  if (hours > 0) {
    logger.info('Scanner', `Starting background library scanner (interval: ${hours} hours)`);
    scanIntervalId = setInterval(() => {
      logger.info('Scanner', 'Running scheduled background library scan...');
      try {
        const { startScanAsync } = require('../utils/library');
        const res = startScanAsync(LIBRARY_PATH);
        if (res.alreadyRunning) {
          logger.info('Scanner', 'Scheduled scan skipped: another scan is already active.');
        }
      } catch (e) {
        logger.error('Scanner', 'Scheduled library scan launch failed:', e);
      }
    }, hours * 3600 * 1000);
  } else {
    logger.info('Scanner', 'Background library scanner is disabled.');
  }
}

/**
 * Bootstraps all background tasks
 */
function startBackgroundServices() {
  // Hourly disk sync
  syncIntervalId = setInterval(syncLibraryWithDisk, SYNC_INTERVAL_MS);
  // Initial sync 10s after startup
  setTimeout(syncLibraryWithDisk, 10000);
  // Scheduled scanner
  setupBackgroundScanner();
}

/**
 * Cleanly cancels background timers upon shutdown
 */
function stopBackgroundServices() {
  if (syncIntervalId) clearInterval(syncIntervalId);
  if (scanIntervalId) clearInterval(scanIntervalId);
}

module.exports = {
  syncLibraryWithDisk,
  setupBackgroundScanner,
  startBackgroundServices,
  stopBackgroundServices
};
