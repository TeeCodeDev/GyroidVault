const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const db = require('../database');
const { parseGcodeMetadata } = require('./gcode');

const SUPPORTED_EXTENSIONS = ['.stl', '.gcode', '.3mf', '.step', '.obj'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.stl') return 'stl';
  if (ext === '.gcode') return 'gcode';
  if (ext === '.3mf') return '3mf';
  if (ext === '.step') return 'step';
  if (ext === '.obj') return 'obj';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  return 'other';
}

async function scanLibrary(libraryPath) {
  try {
    await fsPromises.access(libraryPath);
  } catch {
    throw new Error(`Library path not found: ${libraryPath}`);
  }

  const results = { modelsAdded: 0, filesAdded: 0, skipped: 0 };

  async function walk(currentPath) {
    // Yield to the event loop so the server stays responsive during massive scans
    await new Promise(setImmediate);

    let items;
    try {
      items = await fsPromises.readdir(currentPath, { withFileTypes: true });
    } catch (e) {
      console.warn(`[Scanner] Could not read directory: ${currentPath}`);
      return;
    }
    
    // Check if this directory contains any supported 3D files
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
        const r = db.run('INSERT INTO models (name, library_path) VALUES (?, ?)', [modelName, modelPath]);
        model = { id: r.lastId, thumbnail: null };
        results.modelsAdded++;
        console.log(`[Scanner] Nieuw model toegevoegd: ${modelName}`);
      }

      // Add files from this directory
      for (const item of items) {
        if (item.isDirectory()) continue;
        const filename = item.name;
        const filePath = path.join(modelPath, filename);
        const ext = path.extname(filename).toLowerCase();

        if (SUPPORTED_EXTENSIONS.includes(ext) || IMAGE_EXTENSIONS.includes(ext)) {
          let stat;
          try {
            stat = await fsPromises.stat(filePath);
          } catch(e) { continue; }

          const ft = getFileType(filename);
          const existingFile = db.get('SELECT id FROM files WHERE library_path = ?', [filePath]);
          
          if (!existingFile) {
            let metadata = null;
            if (ft === 'gcode') {
              const meta = parseGcodeMetadata(filePath);
              if (meta) metadata = JSON.stringify(meta);
              
              if (!model.thumbnail) {
                const { extractGcodeThumbnail } = require('./gcode');
                const thumb = extractGcodeThumbnail(filePath, path.join(__dirname, '..', '..', 'uploads'));
                if (thumb) {
                  db.run('UPDATE models SET thumbnail = ? WHERE id = ?', [thumb, model.id]);
                  model.thumbnail = thumb;
                }
              }
            }

            if (ft === 'image' && !model.thumbnail) {
              db.run('UPDATE models SET thumbnail = ? WHERE id = ?', [filename, model.id]);
              model.thumbnail = filename;
            }

            db.run('INSERT INTO files (model_id, filename, original_name, file_type, file_size, metadata, library_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [model.id, filename, filename, ft, stat.size, metadata, filePath]);
            results.filesAdded++;
            console.log(`[Scanner] Bestand verwerkt: ${filename}`);
          } else {
            results.skipped++;
          }
        }
      }
    }

    // Always continue walking subdirectories asynchronously
    for (const item of items) {
      if (item.isDirectory()) {
        await walk(path.join(currentPath, item.name));
      }
    }
  }

  console.log(`[Scanner] Start library scan: ${libraryPath}`);
  await walk(libraryPath);
  console.log(`[Scanner] Scan voltooid. Modellen: ${results.modelsAdded}, Bestanden: ${results.filesAdded}, Overgeslagen: ${results.skipped}`);
  return results;
}

module.exports = { scanLibrary };
