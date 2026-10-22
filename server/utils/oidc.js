const { get, all } = require('../database');
const { resolveBaseUrl } = require('./email');

let discoveryCache = {
  issuerUrl: null,
  timestamp: 0,
  endpoints: null
};

function getOidcConfig() {
  const rows = all("SELECT key, value FROM system_settings WHERE key LIKE 'oidc_%'");
  const config = {
    oidc_enabled: false,
    oidc_issuer_url: '',
    oidc_client_id: '',
    oidc_client_secret: '',
    oidc_scopes: 'openid profile email groups',
    oidc_button_label: 'Single Sign-On',
    oidc_auto_create_user: true,
    oidc_default_role: 'uploader',
    oidc_admin_group: '',
    oidc_uploader_group: '',
    oidc_viewer_group: '',
    oidc_redirect_uri: ''
  };

  for (const r of rows) {
    if (r.key === 'oidc_enabled') {
      config.oidc_enabled = r.value === 'true' || r.value === '1';
    } else if (r.key === 'oidc_auto_create_user') {
      config.oidc_auto_create_user = r.value !== 'false' && r.value !== '0';
    } else {
      config[r.key] = r.value || '';
    }
  }

  return config;
}

async function discoverOidcEndpoints(issuerUrl, skipCache = false) {
  if (!issuerUrl || !issuerUrl.trim().startsWith('http')) {
    throw new Error('Valid OIDC Issuer URL is required');
  }

  const cleanIssuer = issuerUrl.trim().replace(/\/+$/, '');
  const now = Date.now();

  if (!skipCache && discoveryCache.endpoints && discoveryCache.issuerUrl === cleanIssuer && (now - discoveryCache.timestamp < 3600000)) {
    return discoveryCache.endpoints;
  }

  const discoveryUrl = `${cleanIssuer}/.well-known/openid-configuration`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(discoveryUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': 'GyroidVault-OIDC' }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`OIDC Discovery returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.authorization_endpoint || !data.token_endpoint) {
      throw new Error('Invalid OIDC discovery document: missing authorization_endpoint or token_endpoint');
    }

    const endpoints = {
      issuer: data.issuer || cleanIssuer,
      authorization_endpoint: data.authorization_endpoint,
      token_endpoint: data.token_endpoint,
      userinfo_endpoint: data.userinfo_endpoint || null,
      jwks_uri: data.jwks_uri || null,
      end_session_endpoint: data.end_session_endpoint || null
    };

    discoveryCache = {
      issuerUrl: cleanIssuer,
      timestamp: now,
      endpoints
    };

    return endpoints;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Timeout contacting OIDC discovery endpoint (${discoveryUrl})`);
    }
    throw err;
  }
}

function getRedirectUri(req, configuredRedirectUri) {
  if (configuredRedirectUri && configuredRedirectUri.trim().startsWith('http')) {
    return configuredRedirectUri.trim();
  }
  const base = resolveBaseUrl(req);
  return `${base}/api/auth/oidc/callback`;
}

function parseJwtPayload(token) {
  if (!token || typeof token !== 'string') return {};
  try {
    const parts = token.split('.');
    if (parts.length < 2) return {};
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function resolveUserRole(rawGroups, config) {
  if (!rawGroups) return config.oidc_default_role || 'uploader';

  let groups = [];
  if (Array.isArray(rawGroups)) {
    groups = rawGroups.map(g => (typeof g === 'string' ? g : (g.name || String(g))));
  } else if (typeof rawGroups === 'string') {
    groups = rawGroups.split(',').map(s => s.trim());
  }

  const adminGroup = (config.oidc_admin_group || '').trim().toLowerCase();
  const uploaderGroup = (config.oidc_uploader_group || '').trim().toLowerCase();
  const viewerGroup = (config.oidc_viewer_group || '').trim().toLowerCase();

  const lowerGroups = groups.map(g => g.toLowerCase());

  if (adminGroup && lowerGroups.includes(adminGroup)) return 'admin';
  if (uploaderGroup && lowerGroups.includes(uploaderGroup)) return 'uploader';
  if (viewerGroup && lowerGroups.includes(viewerGroup)) return 'viewer';

  const defaultRole = config.oidc_default_role || 'uploader';
  return ['admin', 'uploader', 'viewer'].includes(defaultRole) ? defaultRole : 'uploader';
}

module.exports = {
  getOidcConfig,
  discoverOidcEndpoints,
  getRedirectUri,
  parseJwtPayload,
  resolveUserRole
};
