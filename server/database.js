const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'printvault.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let db = null;

// Save database to disk periodically and on changes
function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // ─── Schema ──────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      password_reset_token TEXT,
      password_reset_expires DATETIME,
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_invites (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      thumbnail TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS project_models (
      project_id INTEGER NOT NULL,
      model_id INTEGER NOT NULL,
      PRIMARY KEY (project_id, model_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY, -- Unique slug/token
      model_id INTEGER NOT NULL,
      expires_at DATETIME,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#8b5cf6',
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_preset INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      print_tips TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      category_id INTEGER,
      thumbnail TEXT,
      library_path TEXT UNIQUE, -- Path to the model directory
      user_id INTEGER,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS model_tags (
      model_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (model_id, tag_id),
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      metadata TEXT,
      library_path TEXT UNIQUE, -- Path to the original file
      user_id INTEGER,
      uploaded_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS print_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER NOT NULL,
      printed_at DATETIME DEFAULT (datetime('now')),
      material_id INTEGER,
      user_id INTEGER,
      successful INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Migration: Ensure user_id columns exist
  try {
    const mCols = all("PRAGMA table_info(models)");
    if (!mCols.some(c => c.name === 'user_id')) {
      db.run('ALTER TABLE models ADD COLUMN user_id INTEGER');
    }
    const fCols = all("PRAGMA table_info(files)");
    if (!fCols.some(c => c.name === 'user_id')) {
      db.run('ALTER TABLE files ADD COLUMN user_id INTEGER');
    }
    const pCols = all("PRAGMA table_info(print_history)");
    if (!pCols.some(c => c.name === 'user_id')) {
      db.run('ALTER TABLE print_history ADD COLUMN user_id INTEGER');
    }
    const uCols = all("PRAGMA table_info(users)");
    if (!uCols.some(c => c.name === 'email')) db.run('ALTER TABLE users ADD COLUMN email TEXT');
    if (!uCols.some(c => c.name === 'password_reset_token')) db.run('ALTER TABLE users ADD COLUMN password_reset_token TEXT');
    if (!uCols.some(c => c.name === 'password_reset_expires')) db.run('ALTER TABLE users ADD COLUMN password_reset_expires DATETIME');
    
    if (!mCols.some(c => c.name === 'parent_id')) db.run('ALTER TABLE models ADD COLUMN parent_id INTEGER');
    if (!mCols.some(c => c.name === 'source_url')) db.run('ALTER TABLE models ADD COLUMN source_url TEXT');
  } catch (e) { console.error('User migration failed:', e); }

  // Ensure metadata and library_path columns exist for existing databases
  try {
    const fCols2 = all("PRAGMA table_info(files)");
    if (!fCols2.some(c => c.name === 'metadata')) {
      db.run('ALTER TABLE files ADD COLUMN metadata TEXT');
    }
    if (!fCols2.some(c => c.name === 'library_path')) {
      db.run('ALTER TABLE files ADD COLUMN library_path TEXT');
      db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_files_library_path ON files(library_path)');
    }

    const mCols2 = all("PRAGMA table_info(models)");
    if (!mCols2.some(c => c.name === 'library_path')) {
      db.run('ALTER TABLE models ADD COLUMN library_path TEXT');
      db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_models_library_path ON models(library_path)');
    }
  } catch (e) { console.error('Migration failed:', e); }

  db.run(`
    CREATE TABLE IF NOT EXISTS print_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER NOT NULL,
      printed_at DATETIME DEFAULT (datetime('now')),
      material_id INTEGER,
      successful INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
    )
  `);

  // ─── Seed Data ───────────────────────────────────────────────────────
  const seedMaterials = [
    { name: 'PLA', is_preset: 1 },
    { name: 'PETG', is_preset: 1 },
    { name: 'ABS', is_preset: 1 },
    { name: 'ASA', is_preset: 1 },
    { name: 'TPU', is_preset: 1 },
  ];

  const seedCategories = [
    { name: 'Functional', color: '#00d4ff' },
    { name: 'Decorative', color: '#8b5cf6' },
    { name: 'Mechanical', color: '#f59e0b' },
    { name: 'Figurines', color: '#ec4899' },
    { name: 'Tools', color: '#10b981' },
    { name: 'Other', color: '#64748b' },
  ];

  for (const m of seedMaterials) {
    db.run('INSERT OR IGNORE INTO materials (name, is_preset) VALUES (?, ?)', [m.name, m.is_preset]);
  }
  for (const c of seedCategories) {
    db.run('INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)', [c.name, c.color]);
  }

  saveDb();
  console.log('✓ Database initialized');

  // Auto-save every 30 seconds
  setInterval(saveDb, 30000);

  return db;
}

// ─── Helper functions to wrap sql.js API ─────────────────────────────────

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function get(sql, params = []) {
  const results = all(sql, params);
  return results[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  const lastIdResult = all('SELECT last_insert_rowid() as id');
  const lastId = lastIdResult[0]?.id || 0;
  const changes = db.getRowsModified();
  saveDb();
  return { lastId, changes };
}

module.exports = { initDatabase, getDb, all, get, run, saveDb, UPLOADS_DIR, DATA_DIR };
