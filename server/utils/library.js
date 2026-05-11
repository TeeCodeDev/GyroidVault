const fs = require('fs');
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
  if (!fs.existsSync(libraryPath)) {
    throw new Error(`Library path not found: ${libraryPath}`);
  }

  const results = { modelsAdded: 0, filesAdded: 0, skipped: 0 };
  const items = fs.readdirSync(libraryPath, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory()) {
      // Each top-level directory is a model
      const modelPath = path.resolve(path.join(libraryPath, item.name));
      const modelName = item.name;

      // Check if model already exists by library_path
      let model = db.get('SELECT id, thumbnail FROM models WHERE library_path = ?', [modelPath]);
      if (!model) {
        const r = db.run('INSERT INTO models (name, library_path) VALUES (?, ?)', [modelName, modelPath]);
        model = { id: r.lastId, thumbnail: null };
        results.modelsAdded++;
      }

      // Scan files in the model directory
      const files = fs.readdirSync(modelPath);
      for (const filename of files) {
        const filePath = path.resolve(path.join(modelPath, filename));
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) continue;

        const ext = path.extname(filename).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext) || IMAGE_EXTENSIONS.includes(ext)) {
          const ft = getFileType(filename);
          
          // Check if file already exists
          const existingFile = db.get('SELECT id FROM files WHERE library_path = ?', [filePath]);
          if (!existingFile) {
            let metadata = null;
            if (ft === 'gcode') {
              const meta = parseGcodeMetadata(filePath);
              if (meta) metadata = JSON.stringify(meta);
            }

            // Store relative path for serving via /library static route
            // We use the filename as the unique identifier in the UI for now,
            // but we'll need to handle the pathing in index.js
            
            // If it's an image and model has no thumbnail, set it
            if (ft === 'image' && !model.thumbnail) {
              db.run('UPDATE models SET thumbnail = ? WHERE id = ?', [filename, model.id]);
              model.thumbnail = filename;
            }

            db.run('INSERT INTO files (model_id, filename, original_name, file_type, file_size, metadata, library_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [model.id, filename, filename, ft, stat.size, metadata, filePath]);
            results.filesAdded++;
          } else {
            results.skipped++;
          }
        }
      }
    }
  }

  return results;
}

module.exports = { scanLibrary };
