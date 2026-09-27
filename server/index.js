require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// Centralized configuration and logging
const { PORT, UPLOADS_DIR, LIBRARY_PATH } = require('./config');
const logger = require('./utils/logger');

// Global unhandled error logging for Docker / Unraid visibility
process.on('uncaughtException', (err) => {
  logger.error('CRASH', 'Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('CRASH', 'Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

// Database & Middleware
const { initDatabase, get, saveDb } = require('./database');
const { setUploadsDir } = require('./middleware/upload');
const { getJwtSecret } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimit');
const { getSettingBool } = require('./utils/modelHelpers');

// Background Services
const { startBackgroundServices, stopBackgroundServices } = require('./services/backgroundTasks');

// Modular Routers
const authRoutes = require('./routes/auth');
const modelsRoutes = require('./routes/models');
const { router: filesRoutes, uploadSlicerHandler } = require('./routes/files');
const projectsRoutes = require('./routes/projects');
const browseRoutes = require('./routes/browse');
const taxonomyRoutes = require('./routes/taxonomy');
const settingsRoutes = require('./routes/settings');

const app = express();

// ─── Security & Parsing Middleware ─────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https:"],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", "https:", "data:", "blob:", "chrome-extension:", "moz-extension:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://api.github.com", "blob:", "data:"],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  hsts: false // Intentionally disabled for local Docker/HTTP deployments
}));

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(logger.requestLogger);

// ─── Private Instance Gatekeeper ───────────────────────────────────────────

app.use((req, res, next) => {
  // Always permit public auth, health check, public config, release notes, static assets, and public shares
  if (
    req.path === '/healthz' ||
    req.path.startsWith('/api/auth/') ||
    req.path === '/api/system/public-config' ||
    req.path.startsWith('/api/shares/') ||
    req.path === '/api/system/updates' ||
    req.path === '/api/system/release-notes' ||
    req.path.startsWith('/js/') ||
    req.path.startsWith('/css/') ||
    req.path.startsWith('/img/') ||
    req.path.startsWith('/favicon') ||
    req.path.startsWith('/icon') ||
    req.path === '/' ||
    req.path.startsWith('/index.html')
  ) {
    return next();
  }

  // Populate req.user whenever a valid token is present; enforce if private instance is enabled
  let token = req.cookies.pv_token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (token) {
    try {
      req.user = jwt.verify(token, getJwtSecret());
    } catch (e) {
      if (getSettingBool('require_login_to_view')) {
        return res.status(401).json({ error: 'Private instance - invalid token' });
      }
    }
  } else if (getSettingBool('require_login_to_view')) {
    return res.status(401).json({ error: 'Private instance - login required' });
  }
  next();
});

// ─── Rate Limiting ─────────────────────────────────────────────────────────

app.use('/api', apiLimiter);

// ─── Health Check Endpoint (Docker / Unraid Container Reliability) ─────────

app.get('/healthz', (req, res) => {
  try {
    const dbCheck = get('SELECT 1 as alive');
    if (!dbCheck || dbCheck.alive !== 1) {
      return res.status(503).json({ status: 'unhealthy', database: 'error' });
    }
    const pkg = require('../package.json');
    res.json({
      status: 'ok',
      version: pkg.version,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// ─── Static File Serving ───────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));

// occt-import-js (OpenCASCADE STEP/STP importer) served directly from node_modules for worker isolation
app.use('/js/vendor/occt', express.static(path.join(__dirname, '..', 'node_modules', 'occt-import-js', 'dist'), {
  setHeaders: (res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'");
  }
}));

app.use('/uploads', express.static(UPLOADS_DIR));
if (fs.existsSync(LIBRARY_PATH)) {
  app.use('/library-files', express.static(LIBRARY_PATH));
}

// Direct file access fallback for uploads
app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// ─── Route Mounting ────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/models', modelsRoutes);
app.use('/api/files', filesRoutes);
app.post('/api/upload-slicer', uploadSlicerHandler); // Legacy / direct slicer upload hook
app.use('/api/projects', projectsRoutes);
app.use('/api/browse', browseRoutes);
app.use('/api', taxonomyRoutes);
app.use('/api', settingsRoutes);

// ─── SPA Fallback & Global Error Handler ───────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  logger.error('Server', 'Unhandled route error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Bootstrap & Server Lifecycle ──────────────────────────────────────────

(async () => {
  await initDatabase();
  setUploadsDir(UPLOADS_DIR);

  // Graceful shutdown handling
  const shutdown = () => {
    logger.info('System', 'Shutting down server, saving database...');
    stopBackgroundServices();
    saveDb(true);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGUSR2', shutdown); // Nodemon restart signal

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info('System', `GyroidVault running on http://0.0.0.0:${PORT}`);
    logger.info('System', `Active library storage path: ${LIBRARY_PATH}`);
    startBackgroundServices();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn('System', `0.0.0.0:${PORT} in use, binding to 127.0.0.1:${PORT}...`);
      app.listen(PORT, '127.0.0.1', () => {
        logger.info('System', `GyroidVault running on http://localhost:${PORT}`);
        startBackgroundServices();
      });
    } else {
      logger.error('System', 'Server listen error:', err);
      throw err;
    }
  });
})();

