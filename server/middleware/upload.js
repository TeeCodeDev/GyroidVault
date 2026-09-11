const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// UPLOADS_DIR will be set after database init
let UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});

const ALLOWED_EXTENSIONS = ['.stl', '.gcode', '.bgcode', '.3mf', '.obj', '.step', '.stp', '.f3d', '.scad', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.md', '.zip'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  // Check for double extensions or dangerous intermediate extensions
  const parts = file.originalname.toLowerCase().split('.');
  const dangerousExtensions = ['js', 'php', 'exe', 'sh', 'bat', 'cmd', 'msi', 'jsp', 'asp', 'aspx', 'vbs', 'scr', 'pif', 'com'];
  const hasDangerousExt = parts.slice(0, -1).some(part => dangerousExtensions.includes(part));
  
  if (hasDangerousExt) {
    cb(new Error(`Double extension or dangerous intermediate extension detected in "${file.originalname}".`), false);
  } else if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext} is not supported.`), false);
  }
};

const getFileType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const typeMap = {
    '.stl': 'stl', '.gcode': 'gcode', '.bgcode': 'gcode', '.3mf': '3mf', '.obj': 'obj',
    '.step': 'step', '.stp': 'step', '.f3d': 'f3d', '.scad': 'scad', '.zip': 'zip',
    '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image',
    '.pdf': 'document', '.txt': 'document', '.md': 'document'
  };
  return typeMap[ext] || 'other';
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 500 * 1024 * 1024 } });

function setUploadsDir(dir) { UPLOADS_DIR = dir; }

module.exports = { upload, getFileType, setUploadsDir, ALLOWED_EXTENSIONS };
