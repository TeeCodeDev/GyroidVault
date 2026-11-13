const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { handleMcpMessage } = require('../mcp/handler');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// In-memory active SSE clients
const sseClients = new Map();

/**
 * Clean up stale SSE connections periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, client] of sseClients.entries()) {
    if (now - client.lastSeen > 120000) {
      try { client.res.end(); } catch (e) {}
      sseClients.delete(sessionId);
    }
  }
}, 60000);

// ─── SSE TRANSPORT (GET /api/mcp/sse) ──────────────────────────────────────────
router.get('/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const sessionId = crypto.randomBytes(16).toString('hex');
  sseClients.set(sessionId, { res, lastSeen: Date.now() });

  logger.info(`[MCP] New SSE client connected: session=${sessionId}`);

  // Send initial endpoint event pointing to the message submission URL per MCP SSE spec
  res.write(`event: endpoint\ndata: /api/mcp/messages?sessionId=${sessionId}\n\n`);

  req.on('close', () => {
    logger.info(`[MCP] SSE client disconnected: session=${sessionId}`);
    sseClients.delete(sessionId);
  });
});

// ─── MESSAGE POST (POST /api/mcp/messages) ────────────────────────────────────
router.post('/messages', express.json(), async (req, res) => {
  const sessionId = req.query.sessionId;
  const client = sessionId ? sseClients.get(sessionId) : null;

  try {
    const response = await handleMcpMessage(req.body);

    if (client) {
      client.lastSeen = Date.now();
      client.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      return res.status(202).json({ accepted: true });
    }

    // If not connected via SSE, return direct JSON-RPC response
    res.json(response);
  } catch (err) {
    logger.error(`[MCP] Error processing message: ${err.message}`);
    res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: err.message } });
  }
});

// ─── DIRECT STATELESS POST (/api/mcp) ─────────────────────────────────────────
router.post('/', express.json(), async (req, res) => {
  try {
    const response = await handleMcpMessage(req.body);
    res.json(response);
  } catch (err) {
    logger.error(`[MCP] Direct POST error: ${err.message}`);
    res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: err.message } });
  }
});

module.exports = router;

