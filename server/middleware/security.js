const path = require('path');

/**
 * Validates that resolving `relativePath` against `baseDir` stays strictly within `baseDir`.
 * Prevents Directory Traversal attacks (CWE-22 / CWE-23).
 * Returns the canonical absolute path if valid, or null if traversal is detected.
 */
function validatePathConfinement(baseDir, relativePath) {
  if (!baseDir) return null;
  const resolvedBase = path.resolve(baseDir);
  if (!relativePath) return resolvedBase;

  // Resolve target path
  const resolvedTarget = path.resolve(resolvedBase, relativePath);

  // Ensure target path is within base directory (or equal to it)
  if (resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep)) {
    return resolvedTarget;
  }
  return null;
}

/**
 * Safely parses and clamps an integer. Prevents SQL injection and integer overflow.
 */
function safeInt(val, defaultValue = 0, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Validates and sanitizes URLs to prevent XSS via javascript: or data: pseudo-protocols.
 * Only allows http:, https:, and mailto:.
 */
function safeUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return '';
  const trimmed = urlString.trim();
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      return trimmed;
    }
  } catch (e) {
    // Relative URLs or malformed
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
      return trimmed;
    }
  }
  return '';
}

/**
 * Escapes characters for HTML context.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  validatePathConfinement,
  safeInt,
  safeUrl,
  escapeHtml
};
