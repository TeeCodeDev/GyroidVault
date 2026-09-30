/**
 * GyroidVault Automated Pre-Release Test Suite
 * Run via: npm test (or node tests/release-check.js)
 *
 * Covers:
 *  1. JS syntax & accidental duplicate template literal check (Issue #72 guard)
 *  2. Frontend UI.* component rendering smoke test with realistic data
 *  3. Frontend button/handler integrity (every onclick/onsubmit/onchange App.* & API.* exists)
 *  4. Live E2E API & Security tests against an isolated temporary database & library:
 *     - Health check (/healthz)
 *     - Auth & RBAC (Admin vs Viewer vs Unauthenticated)
 *     - Model creation & 3D file upload
 *     - Tagging, Category assignment (single & bulk), Collection assignment
 *     - Collection editing (name, description, visibility)
 *     - Unauthorized model/collection deletion blocked (Unauthenticated=401, Viewer=403, No-CSRF=403)
 *     - Authorized model deletion (single & bulk)
 *     - Settings toggle persistence (Issue #70 guard)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}`);
}

function fail(name, err) {
  failed++;
  const msg = err instanceof Error ? err.message : String(err);
  failures.push({ name, msg });
  console.error(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m→ ${msg}\x1b[0m`);
}

async function check(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

// ─── 1. STATIC SYNTAX & TEMPLATE LITERAL CHECKS ─────────────────────────────

function getJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor' || entry.name === 'node_modules') continue;
      out.push(...getJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

async function runStaticAndUiChecks() {
  console.log('\n\x1b[1m[1/2] Frontend, Buttons & Static Integrity Checks\x1b[0m');

  const jsFiles = [
    ...getJsFiles(path.join(ROOT_DIR, 'server')),
    ...getJsFiles(path.join(ROOT_DIR, 'public', 'js'))
  ];

  await check(`All ${jsFiles.length} server & frontend JS files pass syntax check (node -c)`, () => {
    for (const f of jsFiles) {
      const stat = fs.statSync(f);
      assert(stat.size > 0, `File is empty (0 bytes): ${path.relative(ROOT_DIR, f)}`);
      execFileSync(process.execPath, ['-c', f], { stdio: 'pipe' });
    }
  });

  await check('No accidental back-to-back template literals (`...` `...`) in JS files (Issue #72 guard)', () => {
    for (const f of jsFiles) {
      const content = fs.readFileSync(f, 'utf8');
      const match = /`\s*\r?\n\s*`/.exec(content);
      if (match) {
        const line = content.substring(0, match.index).split('\n').length;
        throw new Error(`Back-to-back template literal found in ${path.relative(ROOT_DIR, f)}:${line}`);
      }
    }
  });

  // Load API, UI, and App into a browser-like sandbox
  const sandbox = {
    window: { location: { hash: '', origin: 'http://localhost:3000', pathname: '/' }, addEventListener: () => {} },
    document: {
      getElementById: () => ({ innerHTML: '', textContent: '', style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null }),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add: () => {} }, appendChild: () => {} }),
      body: { appendChild: () => {}, classList: { toggle: () => {}, add: () => {}, remove: () => {} }, style: {} },
      addEventListener: () => {}
    },
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] || null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; }
    },
    navigator: { clipboard: { writeText: async () => {} } },
    location: { hash: '', reload: () => {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    FormData: class {},
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    console,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {}
  };
  sandbox.window.document = sandbox.document;
  sandbox.window.localStorage = sandbox.localStorage;

  const apiCode = fs.readFileSync(path.join(ROOT_DIR, 'public/js/api.js'), 'utf8');
  const compCode = fs.readFileSync(path.join(ROOT_DIR, 'public/js/components.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(ROOT_DIR, 'public/js/app.js'), 'utf8');

  vm.createContext(sandbox);
  vm.runInContext(`${apiCode}\n${compCode}\n${appCode}\nthis.__API = API; this.__UI = UI; this.__App = App;`, sandbox);

  const { __API: API, __UI: UI, __App: App } = sandbox;
  App.currentUser = { id: 1, username: 'admin', email: 'admin@example.com', role: 'admin' };
  App.selectedModelIds = [1];
  App.selectedBrowsePaths = ['folderA/test.stl'];
  App.currentFormatFilter = 'all';

  const mockCategories = [{ id: 1, name: 'Functional', color: '#00d4ff', model_count: 5 }];
  const mockTags = [{ id: 1, name: 'gridfinity', model_count: 3 }];
  const mockUsers = [{ id: 1, username: 'admin', email: 'admin@example.com', role: 'admin', model_count: 5 }];
  const mockProjects = [{ id: 1, name: 'Voron Build', description: 'Printer parts', visibility: 'public', user_id: 1, model_count: 2, thumbnails: [] }];
  const mockModel = {
    id: 1,
    name: 'Voron Stealthburner',
    description: '# Stealthburner\nPrint in ABS.',
    category_id: 1,
    category_name: 'Functional',
    category_color: '#00d4ff',
    user_id: 1,
    uploader_name: 'admin',
    file_count: 2,
    file_types: ['stl', '3mf', 'step', 'gcode'],
    has_printed: true,
    print_count: 1,
    thumbnail: '/uploads/thumb.png',
    stl_file: '/uploads/part.stl',
    updated_at: '2026-09-27 12:00:00',
    created_at: '2026-09-27 12:00:00',
    tags: mockTags,
    projects: mockProjects,
    versions: [],
    files: [
      { id: 10, model_id: 1, filename: 'main_body.stl', original_name: 'main_body.stl', file_type: 'stl', file_size: 102400, url: '/uploads/main_body.stl', is_preview: true },
      { id: 11, model_id: 1, filename: 'plate.gcode', original_name: 'plate.gcode', file_type: 'gcode', file_size: 204800, url: '/uploads/plate.gcode', metadata: JSON.stringify({ printTime: '2h 15m', filamentType: 'PLA', weight: 42 }) }
    ],
    prints: [{ id: 1, material_name: 'PLA', success: 1, notes: 'Clean print', printed_at: '2026-09-27' }]
  };

  await check('All UI.* template functions render without runtime errors on populated data', () => {
    const renders = [
      ['UI.modelCard', () => UI.modelCard(mockModel)],
      ['UI.toolbar', () => UI.toolbar(mockCategories, mockTags, mockUsers, 'all')],
      ['UI.modelDetail', () => UI.modelDetail(mockModel, true)],
      ['UI.projectsPage', () => UI.projectsPage(mockProjects)],
      ['UI.projectCard', () => UI.projectCard(mockProjects[0])],
      ['UI.projectDetail', () => UI.projectDetail({ ...mockProjects[0], models: [mockModel] })],
      ['UI.folderCard', () => UI.folderCard({ name: 'Subfolder', path: 'Subfolder', itemCount: 4, thumbnails: ['/uploads/a.png', '/uploads/b.png'] })],
      ['UI.browseFileCard', () => UI.browseFileCard({ name: 'part.stl', type: 'stl', ext: 'stl', size: 50000, url: '/library-files/part.stl', folderPath: 'Subfolder', metadata: { printTime: '1h', filamentType: 'PETG', tempNozzle: 240 } })],
      ['UI.bulkActionBar', () => UI.bulkActionBar(2)],
      ['UI.bulkBrowseActionBar', () => UI.bulkBrowseActionBar(2, false)],
      ['UI.bulkTagForm', () => UI.bulkTagForm(mockTags)],
      ['UI.bulkMoveForm', () => UI.bulkMoveForm(mockCategories, 2)],
      ['UI.bulkBrowseCategoryForm', () => UI.bulkBrowseCategoryForm(mockCategories, 2)],
      ['UI.bulkCollectionForm', () => UI.bulkCollectionForm(mockProjects)],
      ['UI.collectionSelectForm', () => UI.collectionSelectForm(mockProjects, [1], 1)],
      ['UI.bulkDeleteForm', () => UI.bulkDeleteForm(2)],
      ['UI.bulkBrowseDeleteForm', () => UI.bulkBrowseDeleteForm(2)],
      ['UI.modelForm', () => UI.modelForm(mockModel, mockCategories, mockTags)],
      ['UI.projectForm', () => UI.projectForm(mockProjects[0])],
      ['UI.systemSettingsForm', () => UI.systemSettingsForm({ scan_zip_archives: 'true', default_view_mode: 'grid' })],
      ['UI.securitySettingsForm', () => UI.securitySettingsForm({ private_instance: 'false', open_registration: 'false' })],
      ['UI.maintenanceSettingsForm', () => UI.maintenanceSettingsForm()],
      ['UI.pagination', () => UI.pagination(5, 2)]
    ];

    for (const [label, fn] of renders) {
      const html = fn();
      assert(typeof html === 'string' && html.trim().length > 10, `${label} returned empty or non-string output`);
    }
  });

  await check('Every onclick / onchange / onsubmit App.* handler in HTML & components.js exists on App', () => {
    const htmlSources = [
      fs.readFileSync(path.join(ROOT_DIR, 'public/index.html'), 'utf8'),
      compCode,
      appCode
    ].join('\n');

    const handlerRegex = /\bApp\.([a-zA-Z0-9_]+)\s*\(/g;
    const missingHandlers = new Set();
    let m;
    while ((m = handlerRegex.exec(htmlSources)) !== null) {
      const fnName = m[1];
      if (typeof App[fnName] !== 'function') {
        missingHandlers.add(`App.${fnName}`);
      }
    }
    assert(missingHandlers.size === 0, `Missing App handlers: ${[...missingHandlers].join(', ')}`);
  });

  await check('Format filter resets when changing categories or navigating without format param (Issue #76 guard)', () => {
    const appSrc = fs.readFileSync(path.join(ROOT_DIR, 'public/js/app.js'), 'utf8');
    assert(appSrc.includes("const activeFormat = params.format || 'all';"), 'renderModels must reset activeFormat to "all" when params.format is omitted');
    assert(appSrc.includes("this.lastCategoryFilter"), 'handleFilter must track lastCategoryFilter to reset format when switching categories');
  });

    await check('Every API.* method called in app.js & components.js exists on API in api.js', () => {
    const frontendSources = `${compCode}\n${appCode}`;
    const apiCallRegex = /\bAPI\.([a-zA-Z0-9_]+)\s*\(/g;
    const missingApi = new Set();
    let m;
    while ((m = apiCallRegex.exec(frontendSources)) !== null) {
      const fnName = m[1];
      if (typeof API[fnName] !== 'function') {
        missingApi.add(`API.${fnName}`);
      }
    }
    assert(missingApi.size === 0, `Missing API methods: ${[...missingApi].join(', ')}`);
  });
}

// ─── 2. END-TO-END API, FUNCTIONAL & SECURITY TESTS ─────────────────────────

async function runE2ETests() {
  console.log('\n\x1b[1m[2/2] End-to-End API, Functional & Security Tests\x1b[0m');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gyroidvault-test-'));
  const tmpDataDir = path.join(tmpRoot, 'data');
  const tmpLibDir = path.join(tmpRoot, 'library');
  fs.mkdirSync(tmpDataDir, { recursive: true });
  fs.mkdirSync(tmpLibDir, { recursive: true });

  const testPort = 3498;
  const baseUrl = `http://127.0.0.1:${testPort}`;

  const serverProc = spawn(process.execPath, [path.join(ROOT_DIR, 'server/index.js')], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(testPort),
      DATA_DIR: tmpDataDir,
      LIBRARY_PATH: tmpLibDir,
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverLogs = '';
  serverProc.stdout.on('data', d => { serverLogs += d.toString(); });
  serverProc.stderr.on('data', d => { serverLogs += d.toString(); });

  const waitReady = async () => {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      try {
        const r = await fetch(`${baseUrl}/healthz`);
        if (r.ok) return;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 150));
    }
    throw new Error(`Server did not start within 8s. Logs:\n${serverLogs}`);
  };

  async function apiReq(endpoint, { method = 'GET', body = null, session = null, includeCsrf = true, headers = {} } = {}) {
    const reqHeaders = { ...headers };
    if (body && !(body instanceof FormData)) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (session?.cookie) {
      reqHeaders['Cookie'] = session.cookie;
    }
    if (includeCsrf && session?.csrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      reqHeaders['X-CSRF-Token'] = session.csrfToken;
    }
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: reqHeaders,
      body: body && !(body instanceof FormData) ? JSON.stringify(body) : body
    });
    const setCookie = res.headers.get('set-cookie');
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data, setCookie };
  }

  try {
    await check('Server starts cleanly and /healthz returns 200 OK', async () => {
      await waitReady();
      const { status, data } = await apiReq('/healthz');
      assert(status === 200, `Expected 200, got ${status}`);
      assert(data.status === 'ok', `Expected status="ok", got ${JSON.stringify(data)}`);
    });

    const adminSession = { cookie: '', csrfToken: '' };
    const viewerSession = { cookie: '', csrfToken: '' };

    await check('First registered user becomes Admin; can log in and create a Viewer user', async () => {
      const reg1 = await apiReq('/api/auth/register', {
        method: 'POST',
        body: { username: 'admin_test', email: 'admin@test.local', password: 'Password123!' }
      });
      assert(reg1.status === 201 || reg1.status === 200, `Admin register failed (${reg1.status}): ${JSON.stringify(reg1.data)}`);
      assert(reg1.data.role === 'admin', `Expected first user role="admin", got "${reg1.data.role}"`);

      // Login as Admin to get session cookie & CSRF token
      const login1 = await apiReq('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin_test', password: 'Password123!' }
      });
      assert(login1.status === 200, `Admin login failed (${login1.status}): ${JSON.stringify(login1.data)}`);
      adminSession.cookie = (login1.setCookie || '').split(';')[0];
      adminSession.csrfToken = login1.data.csrfToken;
      assert(adminSession.cookie && adminSession.csrfToken, 'Missing cookie or csrfToken for admin');

      // Enable open registration temporarily so we can register a second user
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { open_registration: 'true' }
      });

      const reg2 = await apiReq('/api/auth/register', {
        method: 'POST',
        body: { username: 'viewer_test', email: 'viewer@test.local', password: 'Password123!' }
      });
      assert(reg2.status === 201 || reg2.status === 200, `Second user register failed (${reg2.status}): ${JSON.stringify(reg2.data)}`);

      // Set second user's role explicitly to 'viewer'
      const roleRes = await apiReq(`/api/users/${reg2.data.id}/role`, {
        method: 'PUT',
        session: adminSession,
        body: { role: 'viewer' }
      });
      assert(roleRes.status === 200, `Setting viewer role failed (${roleRes.status}): ${JSON.stringify(roleRes.data)}`);

      // Login as Viewer
      const login2 = await apiReq('/api/auth/login', {
        method: 'POST',
        body: { username: 'viewer_test', password: 'Password123!' }
      });
      assert(login2.status === 200, `Viewer login failed (${login2.status})`);
      assert(login2.data.user?.role === 'viewer', `Expected role="viewer", got "${login2.data.user?.role}"`);
      viewerSession.cookie = (login2.setCookie || '').split(';')[0];
      viewerSession.csrfToken = login2.data.csrfToken;
    });

    let createdModelId = null;

    await check('Can create a model and upload a 3D (.stl) file', async () => {
      const createRes = await apiReq('/api/models', {
        method: 'POST',
        session: adminSession,
        body: { name: 'Gridfinity 1x2 Bin', description: 'Storage bin with magnet holes' }
      });
      assert((createRes.status === 200 || createRes.status === 201) && createRes.data.id, `Model create failed (${createRes.status}): ${JSON.stringify(createRes.data)}`);
      createdModelId = createRes.data.id;

      const stlContent = 'solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid test\n';
      const form = new FormData();
      form.append('files', new Blob([stlContent], { type: 'model/stl' }), 'gridfinity_bin.stl');

      const upRes = await apiReq(`/api/models/${createdModelId}/files`, {
        method: 'POST',
        session: adminSession,
        body: form
      });
      assert(upRes.status === 200 || upRes.status === 201, `File upload failed (${upRes.status}): ${JSON.stringify(upRes.data)}`);

      const listRes = await apiReq('/api/models', { session: adminSession });
      assert(listRes.status === 200, `GET /api/models failed (${listRes.status})`);
      const found = (listRes.data.models || []).find(m => m.id === createdModelId);
      assert(found, 'Created model not returned in GET /api/models');
      assert(found.file_count === 1, `Expected file_count=1, got ${found.file_count}`);
      assert(Array.isArray(found.file_types) && found.file_types.includes('stl'), `Expected file_types to include "stl", got ${JSON.stringify(found.file_types)}`);
    });

    let categoryId = null;
    let projectId = null;

    await check('Can assign Category, Tags, and Collection to a model (single & bulk)', async () => {
      const catRes = await apiReq('/api/categories', {
        method: 'POST',
        session: adminSession,
        body: { name: 'Workshop Organization', color: '#10b981' }
      });
      assert((catRes.status === 200 || catRes.status === 201) && catRes.data.id, `Category create failed: ${JSON.stringify(catRes.data)}`);
      categoryId = catRes.data.id;

      const bulkCatRes = await apiReq('/api/models/bulk-update', {
        method: 'POST',
        session: adminSession,
        body: { ids: [createdModelId], category_id: categoryId, add_tags: ['NEW:gridfinity', 'NEW:modular'] }
      });
      assert(bulkCatRes.status === 200, `Bulk update category/tags failed: ${JSON.stringify(bulkCatRes.data)}`);

      const projRes = await apiReq('/api/projects', {
        method: 'POST',
        session: adminSession,
        body: { name: 'Desk Setup', description: 'Desk organization parts', visibility: 'public' }
      });
      assert((projRes.status === 200 || projRes.status === 201) && projRes.data.id, `Collection create failed: ${JSON.stringify(projRes.data)}`);
      projectId = projRes.data.id;

      const syncProjRes = await apiReq(`/api/models/${createdModelId}/projects`, {
        method: 'PUT',
        session: adminSession,
        body: { project_ids: [projectId] }
      });
      assert(syncProjRes.status === 200, `Sync model collections failed: ${JSON.stringify(syncProjRes.data)}`);

      const detailRes = await apiReq(`/api/models/${createdModelId}`, { session: adminSession });
      assert(detailRes.status === 200, 'GET /api/models/:id failed');
      assert(detailRes.data.category_id === categoryId, `Expected category_id=${categoryId}, got ${detailRes.data.category_id}`);
      assert(detailRes.data.tags.some(t => t.name === 'gridfinity'), `Expected tag "gridfinity" on model, got ${JSON.stringify(detailRes.data.tags)}`);
      assert(detailRes.data.projects.some(p => p.id === projectId), `Expected project ${projectId} on model`);
    });

    await check('Search finds models by Name, Tag, Category, and Collection (Issue #73 guard)', async () => {
      for (const query of ['1x2 Bin', 'magnet holes', 'modular', 'Workshop Organization', 'Desk Setup']) {
        const res = await apiReq(`/api/models?search=${encodeURIComponent(query)}`, { session: adminSession });
        assert(res.status === 200, `Search for "${query}" failed with status ${res.status}`);
        const found = (res.data.models || []).some(m => m.id === createdModelId);
        assert(found, `Expected search for "${query}" to return model ${createdModelId}, got ${JSON.stringify(res.data.models?.map(m => m.name))}`);
      }
      const emptyRes = await apiReq('/api/models?search=nonexistent_xyz_999', { session: adminSession });
      assert(emptyRes.status === 200 && (emptyRes.data.models || []).length === 0, 'Expected 0 results for nonexistent search query');
    });

    await check('Can edit a Collection (name, description, visibility)', async () => {
      const editRes = await apiReq(`/api/projects/${projectId}`, {
        method: 'PUT',
        session: adminSession,
        body: { name: 'Ultimate Desk Setup', description: 'Updated collection description', visibility: 'private' }
      });
      assert(editRes.status === 200, `Collection edit failed (${editRes.status}): ${JSON.stringify(editRes.data)}`);

      const getProj = await apiReq(`/api/projects/${projectId}`, { session: adminSession });
      assert(getProj.status === 200, `GET /api/projects/${projectId} failed`);
      assert(getProj.data.name === 'Ultimate Desk Setup', `Expected updated name, got "${getProj.data.name}"`);
      assert(getProj.data.description === 'Updated collection description', 'Expected updated description');
      assert(getProj.data.visibility === 'private', `Expected visibility="private", got "${getProj.data.visibility}"`);
    });

    await check('Security: Unauthenticated user CANNOT delete or modify models/collections (returns 401)', async () => {
      const delSingle = await apiReq(`/api/models/${createdModelId}`, { method: 'DELETE' });
      assert(delSingle.status === 401, `Unauthenticated DELETE /api/models/:id should be 401, got ${delSingle.status}`);

      const delBulk = await apiReq('/api/models/bulk-delete', { method: 'POST', body: { ids: [createdModelId] } });
      assert(delBulk.status === 401, `Unauthenticated bulk-delete should be 401, got ${delBulk.status}`);

      const updBulk = await apiReq('/api/models/bulk-update', { method: 'POST', body: { ids: [createdModelId], category_id: null } });
      assert(updBulk.status === 401, `Unauthenticated bulk-update should be 401, got ${updBulk.status}`);

      const delProj = await apiReq(`/api/projects/${projectId}`, { method: 'DELETE' });
      assert(delProj.status === 401, `Unauthenticated DELETE /api/projects/:id should be 401, got ${delProj.status}`);
    });

    await check('Security: Viewer role CANNOT delete or modify models/collections (returns 403)', async () => {
      const delSingle = await apiReq(`/api/models/${createdModelId}`, { method: 'DELETE', session: viewerSession });
      assert(delSingle.status === 403, `Viewer DELETE /api/models/:id should be 403, got ${delSingle.status}`);

      const delBulk = await apiReq('/api/models/bulk-delete', { method: 'POST', session: viewerSession, body: { ids: [createdModelId] } });
      assert(delBulk.status === 403, `Viewer bulk-delete should be 403, got ${delBulk.status}`);

      const updBulk = await apiReq('/api/models/bulk-update', { method: 'POST', session: viewerSession, body: { ids: [createdModelId], category_id: null } });
      assert(updBulk.status === 403, `Viewer bulk-update should be 403, got ${updBulk.status}`);

      const browseCat = await apiReq('/api/browse/bulk-category', { method: 'POST', session: viewerSession, body: { paths: ['test'], category_id: null } });
      assert(browseCat.status === 403, `Viewer browse bulk-category should be 403, got ${browseCat.status}`);
    });

    await check('Security: Admin request without CSRF token is rejected (returns 403)', async () => {
      const noCsrf = await apiReq(`/api/models/${createdModelId}`, {
        method: 'DELETE',
        session: adminSession,
        includeCsrf: false
      });
      assert(noCsrf.status === 403, `Request without CSRF token should be 403, got ${noCsrf.status}`);

      const checkStillThere = await apiReq(`/api/models/${createdModelId}`, { session: adminSession });
      assert(checkStillThere.status === 200, 'Model was unexpectedly deleted!');
    });

    await check('Settings: Toggling a General Setting does not reset Security Settings (Issue #70 guard)', async () => {
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { private_instance: 'true' }
      });
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { scan_zip_archives: 'false' }
      });

      const sysRes = await apiReq('/api/settings/system', { session: adminSession });
      assert(sysRes.status === 200, 'GET /api/settings/system failed');
      assert(sysRes.data.private_instance === 'true', `Expected private_instance="true", got "${sysRes.data.private_instance}"`);
      assert(sysRes.data.scan_zip_archives === 'false', `Expected scan_zip_archives="false", got "${sysRes.data.scan_zip_archives}"`);
    });

    await check('3D Viewer Streaming, File Download & 3MF Conversion work (/api/files/:id/*)', async () => {
      const detailRes = await apiReq(`/api/models/${createdModelId}`, { session: adminSession });
      assert(detailRes.status === 200 && detailRes.data.files?.length === 1, 'Expected 1 file on model');
      const fileId = detailRes.data.files[0].id;

      const streamRes = await fetch(`${baseUrl}/api/files/${fileId}/stream`, {
        headers: { Cookie: adminSession.cookie }
      });
      assert(streamRes.status === 200, `Expected 200 from /api/files/:id/stream, got ${streamRes.status}`);
      const streamText = await streamRes.text();
      assert(streamText.includes('solid test'), 'Streamed STL content did not match uploaded STL');

      const dlRes = await fetch(`${baseUrl}/api/files/${fileId}/download`, {
        headers: { Cookie: adminSession.cookie }
      });
      assert(dlRes.status === 200, `Expected 200 from /api/files/:id/download, got ${dlRes.status}`);

      const mfRes = await fetch(`${baseUrl}/api/files/${fileId}/3mf`, {
        headers: { Cookie: adminSession.cookie }
      });
      assert(mfRes.status === 200, `Expected 200 from /api/files/:id/3mf, got ${mfRes.status}`);
      const mfBuf = Buffer.from(await mfRes.arrayBuffer());
      assert(mfBuf.length > 4 && mfBuf[0] === 0x50 && mfBuf[1] === 0x4b, 'Expected valid ZIP/3MF PK header');

      // Download All files of a model as .zip (Issue #75 guard)
      const zipAllRes = await fetch(`${baseUrl}/api/models/${createdModelId}/download`, {
        headers: { Cookie: adminSession.cookie }
      });
      assert(zipAllRes.status === 200, `Expected 200 from /api/models/:id/download (Issue #75), got ${zipAllRes.status}`);
      const zipAllBuf = Buffer.from(await zipAllRes.arrayBuffer());
      const AdmZip = require('adm-zip');
      const dlZip = new AdmZip(zipAllBuf);
      assert(dlZip.getEntries().some(e => e.entryName === 'gridfinity_bin.stl'), 'Expected gridfinity_bin.stl inside model ZIP download');
    });

    await check('Materials & Print History logging work (/api/materials & /api/models/:id/prints)', async () => {
      const matRes = await apiReq('/api/materials', {
        method: 'POST',
        session: adminSession,
        body: { name: 'PLA Matte Black' }
      });
      assert((matRes.status === 200 || matRes.status === 201) && matRes.data.id, `Material create failed: ${JSON.stringify(matRes.data)}`);

      const printRes = await apiReq(`/api/models/${createdModelId}/prints`, {
        method: 'POST',
        session: adminSession,
        body: { material_id: matRes.data.id, successful: true, notes: 'Clean first layer' }
      });
      assert(printRes.status === 200 || printRes.status === 201, `Print log failed: ${JSON.stringify(printRes.data)}`);

      const detailRes = await apiReq(`/api/models/${createdModelId}`, { session: adminSession });
      assert(detailRes.data.prints?.length === 1, `Expected 1 print record, got ${detailRes.data.prints?.length}`);

      const listRes = await apiReq('/api/models?printed=true', { session: adminSession });
      assert((listRes.data.models || []).some(m => m.id === createdModelId), 'Expected model in ?printed=true filter');
    });

    await check('Public Share Links work for unauthenticated visitors even on private instance (/api/shares)', async () => {
      const shareRes = await apiReq('/api/shares', {
        method: 'POST',
        session: adminSession,
        body: { model_id: createdModelId, expires_days: 7 }
      });
      assert((shareRes.status === 200 || shareRes.status === 201) && shareRes.data.slug, `Share create failed: ${JSON.stringify(shareRes.data)}`);
      const slug = shareRes.data.slug;

      // Unauthenticated visitor accesses share metadata
      const pubShare = await apiReq(`/api/shares/${slug}`);
      assert(pubShare.status === 200 && pubShare.data.id === createdModelId, `Unauthenticated share fetch failed (${pubShare.status})`);

      // Unauthenticated visitor streams file using share token
      const fileId = pubShare.data.files[0].id;
      const pubStream = await fetch(`${baseUrl}/api/files/${fileId}/stream?share=${slug}`);
      assert(pubStream.status === 200, `Public share file stream failed (${pubStream.status})`);

      // Invalid share token is rejected
      const badStream = await fetch(`${baseUrl}/api/files/${fileId}/stream?share=invalid_slug_123`);
      assert(badStream.status === 403, `Expected 403 for invalid share token, got ${badStream.status}`);
    });

    await check('Security: Standard User can manage own models, but CANNOT modify Admin models or view Private Collections', async () => {
      // Enable open registration temporarily to create standard user
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { open_registration: 'true' }
      });
      const regUser = await apiReq('/api/auth/register', {
        method: 'POST',
        body: { username: 'maker_user', email: 'maker@example.com', password: 'UserPass123!' }
      });
      assert(regUser.status === 200 || regUser.status === 201, `User registration failed: ${JSON.stringify(regUser.data)}`);

      const loginUser = await apiReq('/api/auth/login', {
        method: 'POST',
        body: { username: 'maker_user', password: 'UserPass123!' }
      });
      const userSession = {
        cookie: (loginUser.setCookie || '').split(';')[0],
        csrfToken: loginUser.data.csrfToken
      };

      // Cannot delete or update Admin's model
      const delAdminModel = await apiReq(`/api/models/${createdModelId}`, { method: 'DELETE', session: userSession });
      assert(delAdminModel.status === 403, `User should get 403 deleting Admin model, got ${delAdminModel.status}`);
      const editAdminModel = await apiReq(`/api/models/${createdModelId}`, { method: 'PUT', session: userSession, body: { name: 'Hacked' } });
      assert(editAdminModel.status === 403, `User should get 403 editing Admin model, got ${editAdminModel.status}`);

      // Cannot view Admin's private collection
      const privProj = await apiReq(`/api/projects/${projectId}`, { session: userSession });
      assert(privProj.status === 403, `User should get 403 viewing Admin private collection, got ${privProj.status}`);

      // Can create, edit, and delete own model
      const ownModel = await apiReq('/api/models', { method: 'POST', session: userSession, body: { name: 'My Custom Bracket' } });
      assert((ownModel.status === 200 || ownModel.status === 201) && ownModel.data.id, 'User failed to create own model');
      const editOwn = await apiReq(`/api/models/${ownModel.data.id}`, { method: 'PUT', session: userSession, body: { name: 'My Custom Bracket v2' } });
      assert(editOwn.status === 200, 'User failed to edit own model');
      const delOwn = await apiReq(`/api/models/${ownModel.data.id}`, { method: 'DELETE', session: userSession });
      assert(delOwn.status === 200, 'User failed to delete own model');
    });

    await check('Library Scanner indexes nested folders, ZIP+cover folders (with deep ZIP scan off), and re-scans cleanly after DB delete (Issue #74 guard)', async () => {
      // 1. Nested subfolder with STL
      const nestedFolder = path.join(tmpLibDir, 'Toolbox', 'Scanned Cable Clip');
      fs.mkdirSync(nestedFolder, { recursive: true });
      const stlContent = 'solid clip\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 5 0 0\nvertex 0 5 0\nendloop\nendfacet\nendsolid clip\n';
      fs.writeFileSync(path.join(nestedFolder, 'cable_clip.stl'), stlContent, 'utf8');

      // 2. Folder with ONLY a cover image and a .zip file while scan_zip_archives is 'false'
      const zipOnlyFolder = path.join(tmpLibDir, 'Zip Only Model');
      fs.mkdirSync(zipOnlyFolder, { recursive: true });
      fs.writeFileSync(path.join(zipOnlyFolder, 'cover.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      const AdmZip = require('adm-zip');
      const z = new AdmZip();
      z.addFile('part.stl', Buffer.from(stlContent, 'utf8'));
      z.writeZip(path.join(zipOnlyFolder, 'archive.zip'));

      const runScanAndWait = async () => {
        const startScan = await apiReq('/api/library/scan', { method: 'POST', session: adminSession });
        assert(startScan.status === 200, `Scan start failed (${startScan.status}): ${JSON.stringify(startScan.data)}`);
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 100));
          const st = await apiReq('/api/library/scan/status', { session: adminSession });
          if (st.status === 200 && !st.data.isScanning) return;
        }
        throw new Error('Library scanner did not complete within 4s');
      };

      await runScanAndWait();

      const searchScanned = await apiReq('/api/models?search=Scanned%20Cable%20Clip', { session: adminSession });
      const scannedModel = (searchScanned.data.models || []).find(m => m.name === 'Scanned Cable Clip');
      assert(scannedModel, 'Scanner did not index nested "Scanned Cable Clip" folder');
      assert(scannedModel.file_count === 1, `Expected nested scanned model to have 1 file, got ${scannedModel.file_count}`);

      const searchZipModel = await apiReq('/api/models?search=Zip%20Only%20Model', { session: adminSession });
      const zipModel = (searchZipModel.data.models || []).find(m => m.name === 'Zip Only Model');
      assert(zipModel, 'Scanner did not index "Zip Only Model" folder');
      assert(zipModel.file_count === 2, `Expected Zip Only Model (cover.jpg + archive.zip with deep scan off) to have 2 files, got ${zipModel.file_count}`);
      assert(zipModel.thumbnail, 'Expected cover.jpg to be set as thumbnail on Zip Only Model');

      // 3. Delete both models from DB ONLY (deleteDisk=false) after saveDb debounce (>1.1s) and re-scan (#74 regression check)
      await new Promise(r => setTimeout(r, 1100)); // ensure saveDb() / db.export() has run
      await apiReq(`/api/models/${scannedModel.id}?deleteDisk=false`, { method: 'DELETE', session: adminSession });
      await apiReq(`/api/models/${zipModel.id}?deleteDisk=false`, { method: 'DELETE', session: adminSession });

      await runScanAndWait();

      const rescan1 = await apiReq('/api/models?search=Scanned%20Cable%20Clip', { session: adminSession });
      const rescannedModel = (rescan1.data.models || []).find(m => m.name === 'Scanned Cable Clip');
      assert(rescannedModel && rescannedModel.file_count === 1, `After DB delete + re-scan, expected file_count=1, got ${rescannedModel?.file_count} (Issue #74)`);

      const rescan2 = await apiReq('/api/models?search=Zip%20Only%20Model', { session: adminSession });
      const rescannedZip = (rescan2.data.models || []).find(m => m.name === 'Zip Only Model');
      assert(rescannedZip && rescannedZip.file_count === 2, `After DB delete + re-scan, expected Zip Only Model file_count=2, got ${rescannedZip?.file_count} (Issue #74)`);

      const browseRes = await apiReq('/api/browse', { session: adminSession });
      assert(browseRes.status === 200 && (browseRes.data.folders || []).some(f => f.name === 'Toolbox'), 'Expected "Toolbox" in /api/browse folders');

      // 4. Streaming ZIP with 64-bit ZIP64 Data Descriptor (Printables format, Issue #77 guard)
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { scan_zip_archives: 'true' }
      });
      const zlib = require('zlib');
      const stlBuf = Buffer.from(stlContent, 'utf8');
      const rawDeflated = zlib.deflateRawSync(stlBuf);
      const crc = zlib.crc32(stlBuf);
      const fname = Buffer.from('printables_part.stl');
      const lfh = Buffer.alloc(30 + fname.length);
      lfh.writeUInt32LE(0x04034b50, 0);
      lfh.writeUInt16LE(45, 4);
      lfh.writeUInt16LE(0x0008, 6); // Bit 3: Data Descriptor
      lfh.writeUInt16LE(8, 8);
      lfh.writeUInt16LE(fname.length, 26);
      fname.copy(lfh, 30);
      const dd = Buffer.alloc(24); // 64-bit ZIP64 descriptor that triggers ADM-ZIP DESCRIPTOR_FAULTY
      dd.writeUInt32LE(0x08074b50, 0);
      dd.writeUInt32LE(crc >>> 0, 4);
      dd.writeBigUInt64LE(BigInt(rawDeflated.length), 8);
      dd.writeBigUInt64LE(BigInt(stlBuf.length), 16);
      const cdOffset = lfh.length + rawDeflated.length + dd.length;
      const cdh = Buffer.alloc(46 + fname.length);
      cdh.writeUInt32LE(0x02014b50, 0);
      cdh.writeUInt16LE(45, 4);
      cdh.writeUInt16LE(45, 6);
      cdh.writeUInt16LE(0x0008, 8);
      cdh.writeUInt16LE(8, 10);
      cdh.writeUInt32LE(crc >>> 0, 16);
      cdh.writeUInt32LE(rawDeflated.length, 20);
      cdh.writeUInt32LE(stlBuf.length, 24);
      cdh.writeUInt16LE(fname.length, 28);
      fname.copy(cdh, 46);
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(1, 8);
      eocd.writeUInt16LE(1, 10);
      eocd.writeUInt32LE(cdh.length, 12);
      eocd.writeUInt32LE(cdOffset, 16);

      const printablesFolder = path.join(tmpLibDir, 'Printables Zip64 Model');
      fs.mkdirSync(printablesFolder, { recursive: true });
      fs.writeFileSync(path.join(printablesFolder, 'modular-desk-organizer-model_files.zip'), Buffer.concat([lfh, rawDeflated, dd, cdh, eocd]));

      await runScanAndWait();

      const pSearch = await apiReq('/api/models?search=Printables%20Zip64%20Model', { session: adminSession });
      const pModel = (pSearch.data.models || []).find(m => m.name === 'Printables Zip64 Model');
      assert(pModel, 'Expected Printables Zip64 Model to be indexed');
      const pDetail = await apiReq(`/api/models/${pModel.id}`, { session: adminSession });
      const zipEntryFile = (pDetail.data.files || []).find(f => f.is_archive_entry === 1 && f.filename === 'printables_part.stl');
      assert(zipEntryFile, 'Expected printables_part.stl archive entry to be indexed');

      const zStream = await fetch(`${baseUrl}/api/files/${zipEntryFile.id}/stream`, { headers: { Cookie: adminSession.cookie } });
      assert(zStream.status === 200, `Expected 200 streaming Printables ZIP64 entry (Issue #77), got ${zStream.status}`);
      const zText = await zStream.text();
      assert(zText.includes('solid clip'), 'Streamed Printables ZIP64 STL did not match original');
    });

    await check('Authorized Admin CAN delete models (single & bulk)', async () => {
      const delRes = await apiReq(`/api/models/${createdModelId}?deleteDisk=true`, {
        method: 'DELETE',
        session: adminSession
      });
      assert(delRes.status === 200, `Admin DELETE /api/models/:id failed (${delRes.status}): ${JSON.stringify(delRes.data)}`);

      const afterGet = await apiReq(`/api/models/${createdModelId}`, { session: adminSession });
      assert(afterGet.status === 404, `Expected 404 after delete, got ${afterGet.status}`);

      const m2 = await apiReq('/api/models', { method: 'POST', session: adminSession, body: { name: 'Bulk Del 1' } });
      const m3 = await apiReq('/api/models', { method: 'POST', session: adminSession, body: { name: 'Bulk Del 2' } });
      const bulkDel = await apiReq('/api/models/bulk-delete', {
        method: 'POST',
        session: adminSession,
        body: { ids: [m2.data.id, m3.data.id], deleteDisk: true }
      });
      assert(bulkDel.status === 200, `Bulk delete failed: ${JSON.stringify(bulkDel.data)}`);
    });

  } finally {
    serverProc.kill();
    await new Promise(r => setTimeout(r, 300));
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  console.log('\x1b[1;36m═══ GyroidVault Automated Pre-Release Verification Suite ═══\x1b[0m');
  const start = Date.now();
  await runStaticAndUiChecks();
  await runE2ETests();
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`\n\x1b[1mSummary:\x1b[0m \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m (${elapsed}s)`);
  if (failed > 0) {
    process.exit(1);
  }
})();