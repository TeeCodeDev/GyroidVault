const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const db = require('../database');
const { parseGcodeMetadata } = require('./gcode');
const AdmZip = require('adm-zip');

const SUPPORTED_EXTENSIONS = ['.stl', '.gcode', '.bgcode', '.3mf', '.step', '.stp', '.f3d', '.obj', '.pdf', '.txt', '.md', '.zip'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.stl') return 'stl';
  if (ext === '.gcode' || ext === '.bgcode') return 'gcode';
  if (ext === '.3mf') return '3mf';
  if (ext === '.step' || ext === '.stp') return 'step';
  if (ext === '.f3d') return 'f3d';
  if (ext === '.obj') return 'obj';
  if (ext === '.zip') return 'zip';
  if (ext === '.pdf' || ext === '.txt' || ext === '.md') return 'document';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  return 'other';
}

// ── Scanner State & Lock Management ──────────────────────────────────────────
let isScanning = false;
let shouldCancel = false;
let scanStatus = {
  isScanning: false,
  startTime: null,
  elapsedSeconds: 0,
  foldersScanned: 0,
  modelsAdded: 0,
  filesAdded: 0,
  skipped: 0,
  currentFolder: '',
  error: null,
  lastCompleted: null,
  lastResults: null
};

function getScanStatus() {
  const status = { ...scanStatus };
  if (status.isScanning && status.startTime) {
    status.elapsedSeconds = Math.round((Date.now() - status.startTime) / 1000);
  }
  return status;
}

function cancelScan() {
  if (isScanning) {
    shouldCancel = true;
    console.log('[Scanner] Cancellation requested by administrator.');
    return true;
  }
  return false;
}

async function scanLibrary(libraryPath) {
  if (isScanning) {
    throw new Error('A library scan is already in progress');
  }

  isScanning = true;
  shouldCancel = false;
  scanStatus = {
    isScanning: true,
    startTime: Date.now(),
    elapsedSeconds: 0,
    foldersScanned: 0,
    modelsAdded: 0,
    filesAdded: 0,
    skipped: 0,
    currentFolder: path.basename(libraryPath),
    error: null,
    lastCompleted: scanStatus.lastCompleted,
    lastResults: null
  };

  try {
    await fsPromises.access(libraryPath);
  } catch (err) {
    isScanning = false;
    scanStatus.isScanning = false;
    throw new Error(`Library path not found: ${libraryPath}`);
  }

  const results = { modelsAdded: 0, filesAdded: 0, skipped: 0 };
  let processedSinceSave = 0;

  async function walk(currentPath) {
    if (shouldCancel) {
      console.log('[Scanner] Scan aborted early by cancellation request.');
      return;
    }

    // Yield to the event loop so the server stays completely responsive during massive scans
    await new Promise(setImmediate);

    let items;
    try {
      items = await fsPromises.readdir(currentPath, { withFileTypes: true });
    } catch (e) {
      console.warn(`[Scanner] Could not read directory: ${currentPath}`);
      return;
    }
    
    scanStatus.foldersScanned++;
    scanStatus.currentFolder = path.basename(currentPath) || currentPath;

    // Check if this directory contains any supported 3D/archive files
    const has3DFiles = items.some(item => {
      if (item.isDirectory()) return false;
      const ext = path.extname(item.name).toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext);
    });

    if (has3DFiles) {
      const modelPath = path.resolve(currentPath);
      const modelName = path.basename(currentPath);

      // Check if model already exists
      let model = db.get('SELECT id, thumbnail FROM models WHERE library_path = ?', [modelPath]);
      if (!model) {
        const r = db.run('INSERT INTO models (name, library_path) VALUES (?, ?)', [modelName, modelPath], true);
        model = { id: r.lastId, thumbnail: null };
        results.modelsAdded++;
        processedSinceSave++;
        scanStatus.modelsAdded = results.modelsAdded;
      }

      // Add files from this directory
      for (const item of items) {
        if (shouldCancel) return;
        if (item.isDirectory()) continue;
        const filename = item.name;
        const filePath = path.join(modelPath, filename);
        const ext = path.extname(filename).toLowerCase();

        if (ext === '.zip') {
          // In-place ZIP Archive inspection
          try {
            const existingZip = db.get('SELECT id FROM files WHERE library_path = ?', [filePath]);
            const stat = await fsPromises.stat(filePath);

            if (!existingZip) {
              db.run('INSERT INTO files (model_id, filename, original_name, file_type, file_size, library_path, is_archive_entry) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [model.id, filename, filename, 'zip', stat.size, filePath, 0], true);
              results.filesAdded++;
              processedSinceSave++;
              scanStatus.filesAdded = results.filesAdded;
            }

            // Safe memory threshold: Avoid buffering archives larger than 300MB into memory to prevent OOM
            const MAX_ZIP_INSPECT_SIZE = 300 * 1024 * 1024;
            if (stat.size > MAX_ZIP_INSPECT_SIZE) {
              console.log(`[Scanner] Archive ${filename} exceeds 300MB (${(stat.size / (1024 * 1024)).toFixed(0)}MB). Skipping in-memory entry inspection for stability.`);
              continue;
            }

            // Inspect internal files in ZIP archive without full disk extraction
            const zip = new AdmZip(filePath);
            const entries = zip.getEntries();
            for (const entry of entries) {
              if (shouldCancel) return;
              if (entry.isDirectory) continue;
              const entryExt = path.extname(entry.entryName).toLowerCase();
              if (SUPPORTED_EXTENSIONS.includes(entryExt) || IMAGE_EXTENSIONS.includes(entryExt)) {
                const entryVirtualPath = filePath + '::' + entry.entryName;
                const existingEntry = db.get('SELECT id FROM files WHERE library_path = ?', [entryVirtualPath]);
                if (!existingEntry) {
                  const entryFt = getFileType(entry.name);
                  let entryThumb = null;

                  // If it's an image inside the ZIP and model has no thumbnail, extract it as model thumbnail
                  if (entryFt === 'image' && !model.thumbnail) {
                    try {
                      const { UPLOADS_DIR } = require('../database');
                      const thumbFilename = `thumb_${Date.now()}_${path.basename(entry.entryName)}`;
                      const outPath = path.join(UPLOADS_DIR, thumbFilename);
                      fs.writeFileSync(outPath, entry.getData());
                      entryThumb = thumbFilename;
                      db.run('UPDATE models SET thumbnail = ? WHERE id = ?', [thumbFilename, model.id], true);
                      model.thumbnail = thumbFilename;
                    } catch (e) {}
                  }

                  db.run('INSERT INTO files (model_id, filename, original_name, file_type, file_size, library_path, is_archive_entry, archive_entry_path, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [model.id, entry.name, entry.entryName, entryFt, entry.header.size, entryVirtualPath, 1, entry.entryName, entryThumb], true);
                  results.filesAdded++;
                  processedSinceSave++;
                  scanStatus.filesAdded = results.filesAdded;
                } else {
                  results.skipped++;
                  scanStatus.skipped = results.skipped;
                }
              }
            }
          } catch (zipErr) {
            console.warn(`[Scanner] Could not inspect ZIP archive ${filename}:`, zipErr.message);
          }
        } else if (SUPPORTED_EXTENSIONS.includes(ext) || IMAGE_EXTENSIONS.includes(ext)) {
          let stat;
          try {
            stat = await fsPromises.stat(filePath);
          } catch(e) { continue; }

          const ft = getFileType(filename);
          const existingFile = db.get('SELECT id FROM files WHERE library_path = ?', [filePath]);
          
          if (!existingFile) {
            let metadata = null;
            let fileThumbnail = null;
            
            if (ft === 'gcode') {
              const meta = parseGcodeMetadata(filePath);
              if (meta) metadata = JSON.stringify(meta);
              
              const { extractGcodeThumbnail } = require('./gcode');
              const { UPLOADS_DIR } = require('../database');
              const thumb = extractGcodeThumbnail(filePath, UPLOADS_DIR);
              if (thumb) {
                fileThumbnail = thumb;
                if (!model.thumbnail) {
                  db.run('UPDATE models SET thumbnail = ? WHERE id = ?', [thumb, model.id], true);
                  model.thumbnail = thumb;
                }
              }
            } else if (ft === '3mf') {
              const { extract3mfThumbnail } = require('./3mf');
              const { UPLOADS_DIR } = require('../database');
              const thumb = extract3mfThumbnail(filePath, UPLOADS_DIR);
              if (thumb) {
                fileThumbnail = thumb;
                if (!model.thumbnail) {
                  db.run('UPDATE models SET thumbnail = ? WHERE id = ?', [thumb, model.id], true);
                  model.thumbnail = thumb;
                }
              }
            }

            if (ft === 'image') {
              fileThumbnail = filename;
              if (!model.thumbnail) {
                db.run('UPDATE models SET thumbnail = ? WHERE id = ?', [filename, model.id], true);
                model.thumbnail = filename;
              }
            }

            db.run('INSERT INTO files (model_id, filename, original_name, file_type, file_size, metadata, library_path, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [model.id, filename, filename, ft, stat.size, metadata, filePath, fileThumbnail], true);
            results.filesAdded++;
            processedSinceSave++;
            scanStatus.filesAdded = results.filesAdded;
          } else {
            results.skipped++;
            scanStatus.skipped = results.skipped;
          }
        }

        // Throttle database persistence to disk every 1000 items to avoid freezing CPU
        if (processedSinceSave >= 1000) {
          db.saveDb();
          processedSinceSave = 0;
          await new Promise(setImmediate);
        }
      }
    }

    // Always continue walking subdirectories asynchronously
    for (const item of items) {
      if (shouldCancel) return;
      if (item.isDirectory()) {
        await walk(path.join(currentPath, item.name));
      }
    }
  }

  try {
    console.log(`[Scanner] Start library scan: ${libraryPath}`);
    await walk(libraryPath);
    db.saveDb(); // Final save upon scan completion
    console.log(`[Scanner] Scan complete. Models: ${results.modelsAdded}, Files: ${results.filesAdded}, Skipped: ${results.skipped}`);
    
    scanStatus.lastCompleted = new Date().toISOString();
    scanStatus.lastResults = { ...results, foldersScanned: scanStatus.foldersScanned };
    return results;
  } catch (err) {
    console.error('[Scanner] Scan error:', err);
    scanStatus.error = err.message || 'Scan error occurred';
    throw err;
  } finally {
    isScanning = false;
    scanStatus.isScanning = false;
    shouldCancel = false;
  }
}

function startScanAsync(libraryPath) {
  if (isScanning) {
    return { alreadyRunning: true, status: getScanStatus() };
  }

  // Fire and forget in the background
  scanLibrary(libraryPath).catch(err => {
    console.error('[Scanner] Background scan terminated with error:', err);
  });

  return { alreadyRunning: false, status: getScanStatus() };
}

module.exports = { 
  scanLibrary, 
  startScanAsync, 
  getScanStatus, 
  cancelScan, 
  getFileType, 
  SUPPORTED_EXTENSIONS, 
  IMAGE_EXTENSIONS 
};
