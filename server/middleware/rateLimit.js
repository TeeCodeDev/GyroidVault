const rateLimit = require('express-rate-limit');

/**
 * In-memory store for IP addresses that have exceeded failed login thresholds
 */
const blockedIPsStore = new Map(); // ip -> { attempts, blockedAt, expiresAt }

function trackFailedLogin(ip) {
  const now = Date.now();
  const entry = blockedIPsStore.get(ip) || { attempts: 0, blockedAt: null, expiresAt: null };
  entry.attempts += 1;
  if (entry.attempts >= 3) {
    entry.blockedAt = new Date().toISOString();
    entry.expiresAt = new Date(now + 15 * 60 * 1000).toISOString();
  }
  blockedIPsStore.set(ip, entry);
}

function getBlockedIPs() {
  const now = Date.now();
  const list = [];
  for (const [ip, info] of blockedIPsStore.entries()) {
    if (info.expiresAt && new Date(info.expiresAt).getTime() > now) {
      list.push({ ip, attempts: info.attempts, blockedAt: info.blockedAt, expiresAt: info.expiresAt });
    }
  }
  return list;
}

function unblockIP(ip) {
  return blockedIPsStore.delete(ip);
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  validate: { xForwardedForHeader: false }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again after 15 minutes.' },
  validate: { xForwardedForHeader: false }
});

const heavyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many resource-intensive requests, please try again later.' },
  validate: { xForwardedForHeader: false }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  handler: (req, res) => {
    trackFailedLogin(req.ip || req.connection.remoteAddress);
    res.status(429).json({ error: 'Too many login attempts from this IP, please try again after 15 minutes' });
  },
  validate: { xForwardedForHeader: false }
});

module.exports = {
  apiLimiter,
  authLimiter,
  heavyLimiter,
  loginLimiter,
  trackFailedLogin,
  getBlockedIPs,
  unblockIP
};
