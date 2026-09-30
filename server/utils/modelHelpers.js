const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { get, all, run, UPLOADS_DIR } = require('../database');
const { LIBRARY_PATH } = require('../config');

/**
 * Generates the public accessible URL for a given file record
 */
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

/**
 * Generates the thumbnail URL, checking uploads and folder paths
 */
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

/**
 * Internal deletion helper for models and their underlying files on disk
 */
function deleteModelInternal(id, deleteDisk = false) {
  const model = get('SELECT * FROM models WHERE id=?', [id]);
  if (!model) return false;
  const files = all('SELECT filename, library_path FROM files WHERE model_id=?', [id]);

  for (const f of files) { 
    const p = path.join(UPLOADS_DIR, f.filename); 
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (err) {}
    }
    if (deleteDisk && f.library_path && fs.existsSync(f.library_path)) {
      try { fs.unlinkSync(f.library_path); } catch (err) { console.error('Failed to delete physical file:', err); }
    }
  }
  
  if (model.thumbnail) { 
    const p = path.join(UPLOADS_DIR, model.thumbnail); 
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (err) {}
    }
    if (deleteDisk && model.library_path && fs.existsSync(path.join(model.library_path, model.thumbnail))) {
      try { fs.unlinkSync(path.join(model.library_path, model.thumbnail)); } catch (err) { console.error('Failed to delete physical thumbnail:', err); }
    }
  }
  
  if (deleteDisk && model.library_path && fs.existsSync(model.library_path)) {
    try {
      if (fs.readdirSync(model.library_path).length === 0) {
        fs.rmdirSync(model.library_path);
      }
    } catch (err) {}
  }
  // Explicitly remove child records in addition to FK cascade (#74)
  run('DELETE FROM files WHERE model_id=?', [id], true);
  run('DELETE FROM model_tags WHERE model_id=?', [id], true);
  run('DELETE FROM project_models WHERE model_id=?', [id], true);
  run('DELETE FROM print_history WHERE model_id=?', [id], true);
  run('DELETE FROM shares WHERE model_id=?', [id], true);
  run('DELETE FROM models WHERE id=?', [id]);
  return true;
}

/**
 * Fetches boolean system setting by key
 */
function getSettingBool(key, defaultValue = false) {
  const row = get('SELECT value FROM system_settings WHERE key=?', [key]);
  if (!row) return defaultValue;
  return row.value === 'true' || row.value === '1';
}

/**
 * Records system event log in SQLite
 */
function logEvent(level, message) {
  try {
    run('INSERT INTO system_logs (level, message) VALUES (?, ?)', [level, message]);
  } catch (e) {
    console.error('Failed to log event:', e);
  }
}

/**
 * Stream-based SHA256 file hashing
 */
function hashFileStream(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}


/**
 * Safely extracts an AdmZip entry buffer, falling back to raw zlib inflate + central directory
 * CRC32 check when streaming ZIP64 data descriptors cause ADM-ZIP DESCRIPTOR_FAULTY (#77).
 */
function getZipEntryBuffer(entry) {
  try {
    return entry.getData();
  } catch (err) {
    const compressed = entry.getCompressedData();
    const method = entry.header ? entry.header.method : 8;
    let out;
    if (method === 0) {
      out = Buffer.from(compressed);
    } else if (method === 8) {
      out = zlib.inflateRawSync(compressed);
    } else {
      throw err;
    }
    if (entry.header && entry.header.crc && typeof zlib.crc32 === 'function') {
      const actualCrc = zlib.crc32(out) >>> 0;
      const expectedCrc = entry.header.crc >>> 0;
      if (actualCrc !== expectedCrc) {
        throw new Error('ZIP entry CRC32 mismatch');
      }
    }
    return out;
  }
}

module.exports = {
  getZipEntryBuffer,
  getFileUrl,
  getThumbUrl,
  deleteModelInternal,
  getSettingBool,
  logEvent,
  hashFileStream
};
