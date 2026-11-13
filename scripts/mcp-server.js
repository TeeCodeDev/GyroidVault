#!/usr/bin/env node
/**
 * GyroidVault Native Model Context Protocol (MCP) Stdio Server
 * 
 * Usage in Claude Desktop / Cursor / Antigravity config:
 * {
 *   "mcpServers": {
 *     "gyroidvault": {
 *       "command": "node",
 *       "args": ["<path-to-gyroidvault>/scripts/mcp-server.js"]
 *     }
 *   }
 * }
 */

const readline = require('readline');
const path = require('path');

// Ensure database is initialized before serving requests
const { initDatabase } = require('../server/database');
const { handleMcpMessage } = require('../server/mcp/handler');

async function main() {
  await initDatabase();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const message = JSON.parse(trimmed);
      const response = await handleMcpMessage(message);
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (err) {
      const errResponse = {
        jsonrpc: '2.0',
        error: { code: -32700, message: `Parse error: ${err.message}` }
      };
      process.stdout.write(JSON.stringify(errResponse) + '\n');
    }
  });

  process.stderr.write('[GyroidVault MCP] Stdio server initialized and listening on stdin\n');
}

main().catch(err => {
  process.stderr.write(`[GyroidVault MCP] Fatal error: ${err.message}\n`);
  process.exit(1);
});

