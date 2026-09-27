const path = require('path');
const fs = require('fs');

/**
 * GyroidVault Centralized Configuration & Environment Validation
 */

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// Port configuration
const rawPort = process.env.PORT || '3000';
const parsedPort = parseInt(rawPort, 10);
const PORT = (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) ? parsedPort : 3000;

// Directory Paths
const DATA_DIR = process.env.DATA_DIR 
  ? path.resolve(process.env.DATA_DIR) 
  : path.resolve(__dirname, '..', 'data');

const DB_PATH = path.join(DATA_DIR, 'gyroidvault.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const LIBRARY_PATH = process.env.LIBRARY_PATH 
  ? path.resolve(process.env.LIBRARY_PATH) 
  : path.resolve(DATA_DIR, 'library');

// Ensure essential runtime directories exist
[DATA_DIR, UPLOADS_DIR, LIBRARY_PATH].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error(`[Config] CRITICAL: Failed to create required directory "${dir}":`, err.message);
  }
});

// Periodic Sync Configuration
const SYNC_BATCH_SIZE = 200;
const SYNC_INTERVAL_MS = 3600000; // 1 hour

// Security Checks
if (isProduction && !process.env.JWT_SECRET) {
  console.warn('[Config] WARNING: Production environment detected without explicit JWT_SECRET. Secret will be persisted in database.');
}

module.exports = {
  NODE_ENV,
  isProduction,
  PORT,
  DATA_DIR,
  DB_PATH,
  UPLOADS_DIR,
  LIBRARY_PATH,
  SYNC_BATCH_SIZE,
  SYNC_INTERVAL_MS
};
