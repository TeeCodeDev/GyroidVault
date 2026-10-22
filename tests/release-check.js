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
const http = require('http');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');
const AdmZip = require('adm-zip');

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

  await check('Static AST scope & undeclared identifier scanner across all server & client JS files (Issue #81 guard)', () => {
    const { checkAllScopes } = require('./ast-scope-checker');
    checkAllScopes(ROOT_DIR);
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
      ['UI.uiSettingsForm', () => UI.uiSettingsForm({ default_landing_page: 'models', enable_categories: 'true', default_view_mode: 'grid' })],
      ['UI.systemSettingsForm', () => UI.systemSettingsForm({ scan_zip_archives: 'true', scan_method: 'folder' })],
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

  await check('WhatsNew popup only triggers once and Detail Header CSS does not overflow button row (Issues #79 & #80 guard)', () => {
    let openedCount = 0;
    const origOpen = App.openWhatsNew;
    App.openWhatsNew = function () {
      openedCount++;
      sandbox.localStorage.setItem('gv_last_seen_version', this.WHATS_NEW_VERSION || '2.0.2');
    };
    const origSetTimeout = sandbox.setTimeout;
    sandbox.setTimeout = (fn) => { fn(); return 1; };

    // Legacy '2.0.0' seen value should be recognized and NOT trigger popup
    sandbox.localStorage.setItem('gv_last_seen_version', '2.0.0');
    App.checkWhatsNew();
    assert(openedCount === 0, 'Expected checkWhatsNew not to open when gv_last_seen_version is 2.0.0 (Issue #79)');
    assert(sandbox.localStorage.getItem('gv_last_seen_version') === App.WHATS_NEW_VERSION, 'Expected 2.0.0 to upgrade to WHATS_NEW_VERSION');

    // Fresh user: triggers once, then subsequent refreshes never trigger again
    sandbox.localStorage.removeItem('gv_last_seen_version');
    App.checkWhatsNew();
    assert(openedCount === 1, 'Expected checkWhatsNew to open once for fresh user');
    App.checkWhatsNew();
    assert(openedCount === 1, 'Expected checkWhatsNew NOT to open on second refresh (Issue #79)');

    sandbox.setTimeout = origSetTimeout;
    App.openWhatsNew = origOpen;

    // Guest vs Logged-in Download All (.zip) & no duplicate ZIP button check
    const savedUser = App.currentUser;
    App.currentUser = null;
    const guestDetailHtml = UI.modelDetail(mockModel, false);
    assert(!guestDetailHtml.includes('Download All (.zip)'), 'Guest user should NOT see Download All (.zip) button');
    assert(!guestDetailHtml.includes('+ Log Print'), 'Guest user should NOT see + Log Print button');

    App.currentUser = savedUser;
    const authDetailHtml = UI.modelDetail(mockModel, false);
    const dlMatches = authDetailHtml.split('/api/models/1/download');
    assert(dlMatches.length - 1 === 1, `Expected exactly 1 model ZIP download button for logged-in user, found ${dlMatches.length - 1}`);

        // Issue #80 CSS check
    const cssContent = fs.readFileSync(path.join(ROOT_DIR, 'public/css/style.css'), 'utf8');
    assert(!cssContent.includes('.detail-header{display:grid;grid-template-columns:minmax(0, 1fr) var(--detail-sidebar-width)'), 'Expected .detail-header not to constrain actions to --detail-sidebar-width (Issue #80)');
    assert(cssContent.includes('.detail-actions .btn{white-space:nowrap'), 'Expected .detail-actions .btn to have white-space:nowrap (Issue #80)');
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

  await check('Creality Print Slicer integration & Protocol Handler verification', () => {
    const compContent = fs.readFileSync(path.join(ROOT_DIR, 'public/js/components.js'), 'utf8');
    const appContent = fs.readFileSync(path.join(ROOT_DIR, 'public/js/app.js'), 'utf8');

    assert(compContent.includes("'crealityprint'"), 'Expected crealityprint in slicerLinks in components.js');
    assert(compContent.includes('crealityprintlink://open?file='), 'Expected crealityprintlink schema in components.js');
    assert(appContent.includes("slicer === 'crealityprint'"), 'Expected crealityprint protocol handling in App.openInSlicer in app.js');
  });

  await check('.3MF Surface Shading vertex normal calculation guard', () => {
    const viewerContent = fs.readFileSync(path.join(ROOT_DIR, 'public/js/viewer.js'), 'utf8');
    assert(viewerContent.includes('geometry.index'), 'Expected geometry.index check in smoothGeometryNormals');
    assert(viewerContent.includes('geometry.computeVertexNormals()'), 'Expected geometry.computeVertexNormals() call in smoothGeometryNormals');
  });

  await check('Card SVG quick actions, model detail collection badges & maintenance filters render correctly', () => {
    // 1. UI.modelCard quick-actions and tooltips (Issue #82)
    const cardHtml = UI.modelCard(mockModel);
    assert(cardHtml.includes('class="model-card-hover-actions"'), 'Expected .model-card-hover-actions in modelCard');
    assert(cardHtml.includes('App.quickPreviewModel'), 'Expected App.quickPreviewModel in quick actions');
    assert(cardHtml.includes('App.addToProject'), 'Expected App.addToProject in quick actions');
    assert(cardHtml.includes('/download'), 'Expected download link in quick actions');
    assert(cardHtml.includes('<svg'), 'Expected SVG elements in quick actions');
    assert(!cardHtml.includes('👁️') && !cardHtml.includes('📁') && !cardHtml.includes('📥'), 'Quick actions must use SVG icons, not emojis');
    assert(cardHtml.includes('title="Voron Stealthburner"'), 'Expected title attribute on modelCard name (Issue #82)');

    // Folder card tooltip (Issue #82)
    const folderCardHtml = UI.folderCard({ name: 'Gadgets & Tools', path: 'gadgets', itemCount: 3, thumbnails: [] });
    assert(folderCardHtml.includes('title="Gadgets &amp; Tools"'), 'Expected title attribute on folderCard name (Issue #82)');

    // 2. UI.modelDetail collection badges
    const detailHtml = UI.modelDetail({ ...mockModel, projects: mockProjects });
    assert(detailHtml.includes('badge-collection'), 'Expected badge-collection in modelDetail');
    assert(detailHtml.includes('/collections/1'), 'Expected link to collection in modelDetail');

    // 3. Maintenance filters in UI.toolbar
    const toolbarHtml = UI.toolbar(mockCategories, mockTags, mockUsers, 'all');
    assert(toolbarHtml.includes('value="uncategorized"'), 'Expected uncategorized option in toolbar category filter');
    assert(toolbarHtml.includes('value="untagged"'), 'Expected untagged option in toolbar tag filter');

    // 4. Settings Forms (UI Form: landing page, module toggles; System Form: backup, scanner, sync interval)
    const uiSettingsHtml = UI.uiSettingsForm({ default_landing_page: 'models', enable_categories: 'true' });
    assert(uiSettingsHtml.includes('name="default_landing_page"'), 'Expected default_landing_page select in UI settings');
    assert(uiSettingsHtml.includes('name="enable_categories"'), 'Expected enable_categories toggle in UI settings');
    assert(uiSettingsHtml.includes('name="enable_collections"'), 'Expected enable_collections toggle in UI settings');
    assert(uiSettingsHtml.includes('name="default_theme"'), 'Expected default_theme select in UI settings');
    assert(uiSettingsHtml.includes('name="default_accent"'), 'Expected default_accent in UI settings');
    assert(uiSettingsHtml.includes('accent-color-btn'), 'Expected accent-color-btn in UI settings');

    const systemSettingsHtml = UI.systemSettingsForm({ scan_zip_archives: 'true', auto_sync_interval: 2 });
    assert(systemSettingsHtml.includes('/api/system/backup'), 'Expected backup download link in system settings');
    assert(systemSettingsHtml.includes('name="auto_sync_interval"'), 'Expected auto_sync_interval input in system settings (Issue #83)');
    assert(systemSettingsHtml.includes('name="auto_scan_interval"'), 'Expected auto_scan_interval input in system settings');

    // Forms full width (no max-width: 580px)
    const smtpHtml = UI.smtpSettingsForm({});
    assert(!smtpHtml.includes('max-width: 580px;'), 'Expected SMTP form to be full width without max-width: 580px');
    const printersHtml = UI.printersSettingsForm([]);
    assert(!printersHtml.includes('max-width: 580px;'), 'Expected Printers form to be full width without max-width: 580px');
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

  async function apiReq(endpoint, { method = 'GET', body = null, session = null, includeCsrf = true, headers = {}, redirect = 'follow', raw = false } = {}) {
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
      body: body && !(body instanceof FormData) ? JSON.stringify(body) : body,
      redirect
    });
    const setCookie = res.headers.get('set-cookie');
    const location = res.headers.get('location');
    let data;
    if (raw) {
      const buf = await res.arrayBuffer();
      data = Buffer.from(buf);
    } else {
      data = await res.json().catch(() => ({}));
    }
    return { status: res.status, ok: res.ok, data, setCookie, location, headers: res.headers };
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

    let matrixModelId = null;

    await check('Multi-format file upload matrix (.stl, .zip archive with internal scan, .3mf, .gcode, .step, images)', async () => {
      const createRes = await apiReq('/api/models', {
        method: 'POST',
        session: adminSession,
        body: { name: 'Multi-Format Matrix Model', description: 'Testing multi-format file uploads' }
      });
      assert((createRes.status === 200 || createRes.status === 201) && createRes.data.id, 'Failed to create matrix model');
      matrixModelId = createRes.data.id;

      const AdmZip = require('adm-zip');
      const { meshTo3mf, stlToMesh } = require('../server/utils/3mf');

      const stlContent = 'solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid test\n';
      const gcodeContent = '; generated by PrusaSlicer 2.7\n; filament used [mm] = 120.5\n; estimated printing time = 15m\nG28\nG1 Z10\n';
      const stepContent = 'ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'STEP AP214\'),\'1\');\nFILE_NAME(\'cube.step\',\'2026-10-01\',(\'Author\'),(\'Org\'),\'\',\'\',\'\');\nFILE_SCHEMA((\'AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }\'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n';
      const pngBuf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

      const mesh = stlToMesh(Buffer.from(stlContent, 'utf8'));
      const threeMfBuf = meshTo3mf(mesh);

      const zip = new AdmZip();
      zip.addFile('nested_part.stl', Buffer.from(stlContent, 'utf8'));
      zip.addFile('docs/readme.txt', Buffer.from('Archive info', 'utf8'));
      const zipBuf = zip.toBuffer();

      const form = new FormData();
      form.append('files', new Blob([zipBuf], { type: 'application/zip' }), 'archive_bundle.zip');
      form.append('files', new Blob([threeMfBuf], { type: 'model/3mf' }), 'matrix_cube.3mf');
      form.append('files', new Blob([gcodeContent], { type: 'text/x-gcode' }), 'test_toolpath.gcode');
      form.append('files', new Blob([stepContent], { type: 'model/step' }), 'matrix_bracket.step');
      form.append('files', new Blob([pngBuf], { type: 'image/png' }), 'render_photo.png');

      const upRes = await apiReq(`/api/models/${matrixModelId}/files`, {
        method: 'POST',
        session: adminSession,
        body: form
      });
      assert(upRes.status === 200 || upRes.status === 201, `Multi-format file upload failed (${upRes.status}): ${JSON.stringify(upRes.data)}`);

      const getRes = await apiReq(`/api/models/${matrixModelId}`, { session: adminSession });
      assert(getRes.status === 200, `GET /api/models/${matrixModelId} failed (${getRes.status})`);
      const files = getRes.data.files || [];
      const types = files.map(f => f.file_type);

      assert(types.includes('zip'), 'ZIP archive file type missing from model files');
      assert(types.includes('3mf'), '3MF file type missing from model files');
      assert(types.includes('gcode'), 'Gcode file type missing from model files');
      assert(types.includes('step'), 'STEP file type missing from model files');
      assert(types.includes('image'), 'Image file type missing from model files');

      const zipInternalEntry = files.find(f => f.library_path && f.library_path.includes('::nested_part.stl'));
      assert(zipInternalEntry, 'Internal STL inside uploaded ZIP archive was not indexed');
      assert(zipInternalEntry.file_type === 'stl', `Expected internal zip file to be "stl", got ${zipInternalEntry.file_type}`);
    });

    await check('Direct slicer file upload endpoint (/api/upload-slicer)', async () => {
      const gcodeContent = '; generated by PrusaSlicer 2.7\n; filament used [mm] = 250.0\n; estimated printing time = 30m\nG28\nG1 Z15\n';
      const form = new FormData();
      form.append('file', new Blob([gcodeContent], { type: 'text/x-gcode' }), 'slicer_direct_print.gcode');

      const slicerRes = await apiReq('/api/upload-slicer', {
        method: 'POST',
        session: adminSession,
        body: form
      });
      assert(slicerRes.status === 201, `Slicer upload failed (${slicerRes.status}): ${JSON.stringify(slicerRes.data)}`);
      assert(slicerRes.data.model_id, 'Slicer upload response missing model_id');

      const getRes = await apiReq(`/api/models/${slicerRes.data.model_id}`, { session: adminSession });
      assert(getRes.status === 200, 'Failed to fetch model created by slicer upload');
      assert(getRes.data.files && getRes.data.files.length >= 1, 'No files associated with slicer model');
      assert(getRes.data.files[0].file_type === 'gcode', `Expected slicer file type "gcode", got ${getRes.data.files[0].file_type}`);
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

      const unauthSync = await apiReq('/api/library/sync', { method: 'POST' });
      assert(unauthSync.status === 401, `Unauthenticated POST /api/library/sync should be 401, got ${unauthSync.status}`);
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

      const viewerSync = await apiReq('/api/library/sync', { method: 'POST', session: viewerSession });
      assert(viewerSync.status === 403, `Viewer POST /api/library/sync should be 403, got ${viewerSync.status}`);
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

    await check('Settings: Auto-sync interval persists and reconfigures background sync (Issue #83)', async () => {
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { auto_sync_interval: '12' }
      });

      let sysRes = await apiReq('/api/settings/system', { session: adminSession });
      assert(sysRes.status === 200, 'GET /api/settings/system failed');
      assert(sysRes.data.auto_sync_interval === '12', `Expected auto_sync_interval="12", got "${sysRes.data.auto_sync_interval}"`);

      // Test disabling auto sync (0 hours)
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { auto_sync_interval: '0' }
      });

      sysRes = await apiReq('/api/settings/system', { session: adminSession });
      assert(sysRes.data.auto_sync_interval === '0', `Expected auto_sync_interval="0", got "${sysRes.data.auto_sync_interval}"`);

      // Reset back to 1
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { auto_sync_interval: '1' }
      });
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

      // 5. Subfolders named "stl files" / "Version 1" / "Version 2" & doc-only folders + disabled ZIP scan cleanup (Issue #78 guard)
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { scan_zip_archives: 'false' }
      });

      const standRoot = path.join(tmpLibDir, 'Blue Curved Stand');
      fs.mkdirSync(path.join(standRoot, 'Version 1', 'stl files'), { recursive: true });
      fs.mkdirSync(path.join(standRoot, 'Version 2', 'stl files'), { recursive: true });
      fs.writeFileSync(path.join(standRoot, 'Version 1', 'stl files', 'stand_v1.stl'), stlContent, 'utf8');
      fs.writeFileSync(path.join(standRoot, 'Version 2', 'readme.txt'), 'Print instructions', 'utf8');
      fs.writeFileSync(path.join(standRoot, 'Version 2', 'changelog.pdf'), '%PDF-1.4', 'utf8');
      fs.writeFileSync(path.join(standRoot, 'Version 2', 'stl files', 'stand_v2.stl'), stlContent, 'utf8');

      const docsOnlyDir = path.join(tmpLibDir, 'Random Notes Folder');
      fs.mkdirSync(docsOnlyDir, { recursive: true });
      fs.writeFileSync(path.join(docsOnlyDir, 'notes.txt'), 'Just text notes, no 3D files', 'utf8');

      await runScanAndWait();

      const allScannedRes = await apiReq('/api/models?limit=100', { session: adminSession });
      const allScannedModels = allScannedRes.data.models || [];
      const bogusSubfolderModel = allScannedModels.find(m => ['stl files', 'Version 1', 'Version 2', 'Random Notes Folder'].includes(m.name));
      assert(!bogusSubfolderModel, `Expected no standalone model named "${bogusSubfolderModel?.name}" (Issue #78)`);

      const standModel = allScannedModels.find(m => m.name === 'Blue Curved Stand');
      assert(standModel, 'Expected parent folder "Blue Curved Stand" to be indexed as a single model (Issue #78)');
      assert(standModel.file_count === 4, `Expected "Blue Curved Stand" to have all 4 files from its Version/stl subfolders, got ${standModel.file_count}`);

      const pDetailAfterDisable = await apiReq(`/api/models/${pModel.id}`, { session: adminSession });
      const remainingArchiveEntries = (pDetailAfterDisable.data.files || []).filter(f => f.is_archive_entry === 1);
      assert(remainingArchiveEntries.length === 0, `Expected 0 virtual archive entries after disabling scan_zip_archives, got ${remainingArchiveEntries.length} (Issue #78)`);
    });

    await check('Scan Method: Folder Mode (with root file grouping) vs. File Mode (companion pairing & re-scan) (Issue #5 guard)', async () => {
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

      // 1. Verify default system setting is 'folder'
      const sysSettings = await apiReq('/api/settings/system', { session: adminSession });
      assert((sysSettings.data.scan_grouping_mode || 'folder') === 'folder', 'Default scan_grouping_mode should be "folder"');

      // 2. Test Folder Mode root file grouping:
      // Direct root files with matching base name (e.g. root_cube.stl + root_cube.png + root_cube.gcode)
      // must NOT be lumped into a single generic "tmp-library" or "library" model.
      const dummyStl = 'solid rootcube\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid rootcube\n';
      fs.writeFileSync(path.join(tmpLibDir, 'root_cube.stl'), dummyStl, 'utf8');
      fs.writeFileSync(path.join(tmpLibDir, 'root_cube.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47])); // dummy PNG header
      fs.writeFileSync(path.join(tmpLibDir, 'root_cube.gcode'), '; G-Code generated\nG28\nG1 Z10\n', 'utf8');

      await runScanAndWait();

      const searchRoot = await apiReq('/api/models?search=root_cube', { session: adminSession });
      const rootCubeModel = (searchRoot.data.models || []).find(m => m.name === 'root_cube');
      assert(rootCubeModel, 'Scanner did not index loose root files as "root_cube" model (Issue #5)');
      assert(rootCubeModel.file_count === 3, `Expected root_cube model to have 3 grouped files (stl, png, gcode), got ${rootCubeModel.file_count}`);
      assert(rootCubeModel.thumbnail && rootCubeModel.thumbnail.includes('root_cube.png'), `Expected root_cube thumbnail to include "root_cube.png", got "${rootCubeModel.thumbnail}"`);

      // 3. Test File Mode:
      // Subfolder "Animals" containing multiple models with companion files
      const animalsDir = path.join(tmpLibDir, 'Animals');
      fs.mkdirSync(animalsDir, { recursive: true });
      fs.writeFileSync(path.join(animalsDir, 'baby_turtle.stl'), dummyStl, 'utf8');
      fs.writeFileSync(path.join(animalsDir, 'baby_turtle.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      fs.writeFileSync(path.join(animalsDir, 'baby_turtle.gcode'), '; G-Code baby turtle\n', 'utf8');
      fs.writeFileSync(path.join(animalsDir, 'baby_turtle.pdf'), '%PDF-1.4 baby turtle', 'utf8');

      fs.writeFileSync(path.join(animalsDir, 'articulated_gecko.3mf'), 'PK\x03\x04gecko', 'utf8');
      fs.writeFileSync(path.join(animalsDir, 'articulated_gecko.webp'), Buffer.from([0x52, 0x49, 0x46, 0x46]));

      fs.writeFileSync(path.join(animalsDir, 'solitary_frog.stl'), dummyStl, 'utf8');

      // Test multi-format identical stems in File Mode (benchy.stl + benchy.3mf + benchy.step in 1 model)
      const benchyDir = path.join(tmpLibDir, 'Benchies');
      fs.mkdirSync(benchyDir, { recursive: true });
      fs.writeFileSync(path.join(benchyDir, '3d_benchy.stl'), dummyStl, 'utf8');
      fs.writeFileSync(path.join(benchyDir, '3d_benchy.3mf'), 'PK\x03\x043mf_benchy', 'utf8');
      fs.writeFileSync(path.join(benchyDir, '3d_benchy.step'), 'ISO-10303-21; benchy', 'utf8');

      // Test companion suffix & punctuation variation: Mechanical Dragon.STL + Mechanical_Dragon_preview.PNG
      const dragonDir = path.join(tmpLibDir, 'Dragons');
      fs.mkdirSync(dragonDir, { recursive: true });
      fs.writeFileSync(path.join(dragonDir, 'Mechanical Dragon.STL'), dummyStl, 'utf8');
      fs.writeFileSync(path.join(dragonDir, 'Mechanical_Dragon_preview.PNG'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      // Test single-item folder fallback thumbnail: SingleItem with lamp.stl + cover.jpg
      const lampDir = path.join(tmpLibDir, 'Desk Lamp');
      fs.mkdirSync(lampDir, { recursive: true });
      fs.writeFileSync(path.join(lampDir, 'lamp_base.stl'), dummyStl, 'utf8');
      fs.writeFileSync(path.join(lampDir, 'cover.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      // Switch to File Mode
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { scan_grouping_mode: 'file' }
      });

      await runScanAndWait();

      // Check baby_turtle model
      const turtleSearch = await apiReq('/api/models?search=baby_turtle', { session: adminSession });
      const turtleModel = (turtleSearch.data.models || []).find(m => m.name === 'baby_turtle');
      assert(turtleModel, 'File mode did not index individual model "baby_turtle"');
      assert(turtleModel.file_count === 4, `Expected baby_turtle to have 4 files (stl, png, gcode, pdf), got ${turtleModel.file_count}`);
      assert(turtleModel.thumbnail && turtleModel.thumbnail.includes('baby_turtle.png'), `Expected baby_turtle thumbnail to include baby_turtle.png, got ${turtleModel.thumbnail}`);

      // Check articulated_gecko model
      const geckoSearch = await apiReq('/api/models?search=articulated_gecko', { session: adminSession });
      const geckoModel = (geckoSearch.data.models || []).find(m => m.name === 'articulated_gecko');
      assert(geckoModel, 'File mode did not index individual model "articulated_gecko"');
      assert(geckoModel.file_count === 2, `Expected articulated_gecko to have 2 files (3mf, webp), got ${geckoModel.file_count}`);
      assert(geckoModel.thumbnail && geckoModel.thumbnail.includes('articulated_gecko.webp'), `Expected articulated_gecko thumbnail to include articulated_gecko.webp, got ${geckoModel.thumbnail}`);

      // Check solitary_frog model
      const frogSearch = await apiReq('/api/models?search=solitary_frog', { session: adminSession });
      const frogModel = (frogSearch.data.models || []).find(m => m.name === 'solitary_frog');
      assert(frogModel && frogModel.file_count === 1, 'File mode did not index solitary_frog');

      // Check multi-format benchy model (3 files under 1 model)
      const benchySearch = await apiReq('/api/models?search=3d_benchy', { session: adminSession });
      const benchyModel = (benchySearch.data.models || []).find(m => m.name === '3d_benchy');
      assert(benchyModel && benchyModel.file_count === 3, `Expected 3d_benchy to have 3 multi-format files (.stl, .3mf, .step), got ${benchyModel?.file_count}`);

      // Check companion suffix matching on Mechanical Dragon
      const dragonSearch = await apiReq('/api/models?search=Mechanical%20Dragon', { session: adminSession });
      const dragonModel = (dragonSearch.data.models || []).find(m => m.name === 'Mechanical Dragon');
      assert(dragonModel, 'Expected model "Mechanical Dragon" to be indexed in File Mode');
      assert(dragonModel.thumbnail && dragonModel.thumbnail.includes('Mechanical_Dragon_preview.PNG'), `Expected dragon thumbnail to match preview companion, got ${dragonModel.thumbnail}`);

      // Check single-item folder thumbnail fallback on Desk Lamp
      const lampSearch = await apiReq('/api/models?search=lamp_base', { session: adminSession });
      const lampModel = (lampSearch.data.models || []).find(m => m.name === 'lamp_base');
      assert(lampModel, 'Expected model "lamp_base" to be indexed in File Mode');
      assert(lampModel.thumbnail && lampModel.thumbnail.includes('cover.jpg'), `Expected lamp_base to adopt single folder cover.jpg fallback, got ${lampModel.thumbnail}`);

      // Verify Browse API (/api/browse) file-to-model linkage in File Mode
      const browseAnimals = await apiReq('/api/browse?path=Animals', { session: adminSession });
      assert(browseAnimals.status === 200, `Browse Animals failed (${browseAnimals.status})`);
      const browseFiles = browseAnimals.data.files || [];
      const browseTurtleStl = browseFiles.find(f => f.name === 'baby_turtle.stl');
      const browseGecko3mf = browseFiles.find(f => f.name === 'articulated_gecko.3mf');
      assert(browseTurtleStl && browseTurtleStl.model_id === turtleModel.id, `Browse file baby_turtle.stl should link to model_id=${turtleModel.id}, got ${browseTurtleStl?.model_id}`);
      assert(browseGecko3mf && browseGecko3mf.model_id === geckoModel.id, `Browse file articulated_gecko.3mf should link to model_id=${geckoModel.id}, got ${browseGecko3mf?.model_id}`);

      // Verify that no folder model named "Animals" was created in File Mode
      const animalsFolderSearch = await apiReq('/api/models?search=Animals', { session: adminSession });
      const animalsFolderModel = (animalsFolderSearch.data.models || []).find(m => m.name === 'Animals');
      assert(!animalsFolderModel, 'In File Mode, folder "Animals" should not be created as a model');

      // 4. Test Switching back to Folder Mode and Re-scanning
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { scan_grouping_mode: 'folder' }
      });

      await runScanAndWait();

      // In Folder Mode, "Animals" folder must now be a single consolidated model containing all 7 files
      const animalsRes = await apiReq('/api/models?search=Animals', { session: adminSession });
      const consolidatedAnimals = (animalsRes.data.models || []).find(m => m.name === 'Animals');
      assert(consolidatedAnimals, 'After switching back to Folder Mode, "Animals" model should exist');
      assert(consolidatedAnimals.file_count === 7, `Expected consolidated "Animals" model to contain all 7 files, got ${consolidatedAnimals.file_count}`);

      // Standalone file-mode models should have been cleanly cleaned up
      const oldTurtleRes = await apiReq('/api/models?search=baby_turtle', { session: adminSession });
      const oldTurtle = (oldTurtleRes.data.models || []).find(m => m.name === 'baby_turtle');
      assert(!oldTurtle, 'After re-scanning to Folder Mode, standalone baby_turtle model should have been cleaned up');
    });

    await check('Scan Method: Physical Disk Deletion & Manual Disk Sync on File-Mode models (Issue #5 guard)', async () => {
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

      // 1. Switch to File Mode and create a model with companion files for physical deletion testing
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { scan_grouping_mode: 'file' }
      });

      const robotStl = path.join(tmpLibDir, 'robot_warrior.stl');
      const robotPng = path.join(tmpLibDir, 'robot_warrior.png');
      const robotGcode = path.join(tmpLibDir, 'robot_warrior.gcode');
      const dummyStl = 'solid robot\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid robot\n';
      fs.writeFileSync(robotStl, dummyStl, 'utf8');
      fs.writeFileSync(robotPng, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      fs.writeFileSync(robotGcode, '; robot gcode\n', 'utf8');

      await runScanAndWait();

      const searchRobot = await apiReq('/api/models?search=robot_warrior', { session: adminSession });
      const robotModel = (searchRobot.data.models || []).find(m => m.name === 'robot_warrior');
      assert(robotModel, 'Expected robot_warrior model to exist');

      // 2. Perform physical deletion (?deleteDisk=true) on file-mode model
      const delRobotRes = await apiReq(`/api/models/${robotModel.id}?deleteDisk=true`, {
        method: 'DELETE',
        session: adminSession
      });
      assert(delRobotRes.status === 200, `DELETE /api/models/:id?deleteDisk=true failed (${delRobotRes.status}): ${JSON.stringify(delRobotRes.data)}`);

      // Verify physical files are unlinked from disk without ENOTDIR error
      assert(!fs.existsSync(robotStl), 'robot_warrior.stl should be physically deleted from disk');
      assert(!fs.existsSync(robotPng), 'robot_warrior.png companion thumbnail should be physically deleted from disk');
      assert(!fs.existsSync(robotGcode), 'robot_warrior.gcode companion file should be physically deleted from disk');

      // Verify model is deleted from DB
      const afterDel = await apiReq(`/api/models/${robotModel.id}`, { session: adminSession });
      assert(afterDel.status === 404, `Expected 404 after deleting robot model, got ${afterDel.status}`);

      // 3. Test Manual Disk Sync (/api/library/sync) on deleted physical file
      const ghostStl = path.join(tmpLibDir, 'ghost_component.stl');
      fs.writeFileSync(ghostStl, dummyStl, 'utf8');

      await runScanAndWait();

      const searchGhost = await apiReq('/api/models?search=ghost_component', { session: adminSession });
      const ghostModel = (searchGhost.data.models || []).find(m => m.name === 'ghost_component');
      assert(ghostModel, 'Expected ghost_component to be indexed');

      // Delete physical file directly from filesystem (simulating manual NAS file deletion)
      fs.unlinkSync(ghostStl);
      assert(!fs.existsSync(ghostStl), 'ghost_component.stl should be gone from disk');

      // Trigger disk sync endpoint
      const syncRes = await apiReq('/api/library/sync', {
        method: 'POST',
        session: adminSession
      });
      assert(syncRes.status === 200, `POST /api/library/sync failed (${syncRes.status}): ${JSON.stringify(syncRes.data)}`);

      // Verify ghost_component was pruned from database
      const afterSync = await apiReq('/api/models?search=ghost_component', { session: adminSession });
      const remainingGhost = (afterSync.data.models || []).find(m => m.name === 'ghost_component');
      assert(!remainingGhost, 'Ghost model should have been purged by disk sync after physical file removal');

      // 4. Restore default Folder Mode
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { scan_grouping_mode: 'folder' }
      });
    });

    await check('Model Download All (.zip) stream & extraction verification (Issue #75 guard)', async () => {
      // 1. Authenticated Admin download
      const dlRes = await fetch(`${baseUrl}/api/models/${createdModelId}/download`, {
        headers: { Cookie: adminSession.cookie }
      });
      assert(dlRes.status === 200, `Model download failed (${dlRes.status})`);
      const dlBuffer = Buffer.from(await dlRes.arrayBuffer());
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(dlBuffer);
      const entries = zip.getEntries();
      assert(entries.length > 0, 'Downloaded model zip archive was empty');
      assert(entries.some(e => e.entryName.includes('gridfinity_bin.stl')), 'ZIP did not contain uploaded STL file');

      // 2. Public share token download (unauthenticated)
      const shareRes = await apiReq('/api/shares', {
        method: 'POST',
        session: adminSession,
        body: { model_id: createdModelId, expires_days: 1 }
      });
      const slug = shareRes.data.slug;
      const pubDlRes = await fetch(`${baseUrl}/api/models/${createdModelId}/download?share=${slug}`);
      assert(pubDlRes.status === 200, `Public share ZIP download failed (${pubDlRes.status})`);

      // 3. Invalid share token or missing auth is rejected
      const unauthDl = await fetch(`${baseUrl}/api/models/${createdModelId}/download`);
      assert(unauthDl.status === 401, `Expected 401 for unauthenticated download without share, got ${unauthDl.status}`);
      const badShareDl = await fetch(`${baseUrl}/api/models/${createdModelId}/download?share=invalid_slug_xyz`);
      assert(badShareDl.status === 403, `Expected 403 for invalid share token, got ${badShareDl.status}`);
    });

    await check('Security: Path traversal and filename injection guards on uploads and slicer', async () => {
      // 1. Attempt path traversal in model files upload
      const form = new FormData();
      form.append('files', new Blob(['solid safe\nendsolid safe\n'], { type: 'model/stl' }), '../../evil_traversal.stl');
      const upRes = await apiReq(`/api/models/${createdModelId}/files`, {
        method: 'POST',
        session: adminSession,
        body: form
      });
      assert(upRes.status === 200 || upRes.status === 201, `Upload with traversal name failed (${upRes.status})`);
      
      // Verify file was never written outside library or upload directories
      assert(!fs.existsSync(path.join(tmpRoot, 'evil_traversal.stl')), 'File escaped into parent tmp directory!');
      assert(!fs.existsSync(path.join(ROOT_DIR, 'evil_traversal.stl')), 'File escaped into project root!');

      // 2. Attempt path traversal in slicer upload
      const slicerForm = new FormData();
      slicerForm.append('file', new Blob(['; gcode safe\nG28\n'], { type: 'text/x-gcode' }), '../../../slicer_evil.gcode');
      const slicerRes = await apiReq('/api/upload-slicer', {
        method: 'POST',
        session: adminSession,
        body: slicerForm
      });
      assert(slicerRes.status === 201, `Slicer upload with traversal name failed (${slicerRes.status})`);
      assert(!fs.existsSync(path.join(tmpRoot, 'slicer_evil.gcode')), 'Slicer file escaped into parent directory!');
    });

    await check('Taxonomy deletion cascade: Removing Category or Collection cleans up model associations', async () => {
      // 1. Category cascade to models
      const testCat = await apiReq('/api/categories', {
        method: 'POST',
        session: adminSession,
        body: { name: 'Temporary Category', color: '#ff0055' }
      });
      const catId = testCat.data.id;
      await apiReq(`/api/models/${createdModelId}`, {
        method: 'PUT',
        session: adminSession,
        body: { category_id: catId }
      });

      const beforeCatDel = await apiReq(`/api/models/${createdModelId}`, { session: adminSession });
      assert(beforeCatDel.data.category_id === catId, 'Category was not assigned to model');

      const delCatRes = await apiReq(`/api/categories/${catId}`, { method: 'DELETE', session: adminSession });
      assert(delCatRes.status === 200, `Category delete failed (${delCatRes.status})`);

      const afterCatDel = await apiReq(`/api/models/${createdModelId}`, { session: adminSession });
      assert(afterCatDel.status === 200 && (afterCatDel.data.category_id === null || afterCatDel.data.category_id === undefined),
        `Expected model category_id to be reset to null, got ${afterCatDel.data.category_id}`);

      // 2. Collection delete cascade to project_models
      const testProj = await apiReq('/api/projects', {
        method: 'POST',
        session: adminSession,
        body: { name: 'Temporary Collection', visibility: 'public' }
      });
      const tempProjId = testProj.data.id;
      await apiReq(`/api/models/${createdModelId}/projects`, {
        method: 'PUT',
        session: adminSession,
        body: { project_ids: [tempProjId] }
      });

      const delProjRes = await apiReq(`/api/projects/${tempProjId}`, { method: 'DELETE', session: adminSession });
      assert(delProjRes.status === 200, `Collection delete failed (${delProjRes.status})`);

      const getDelProj = await apiReq(`/api/projects/${tempProjId}`, { session: adminSession });
      assert(getDelProj.status === 404, 'Deleted collection should return 404');
    });

    await check('Auth security: Password strength enforcement and Invite Token lifecycle', async () => {
      // 1. Weak passwords rejected
      const weak1 = await apiReq('/api/auth/register', {
        method: 'POST',
        body: { username: 'weak_user1', email: 'w1@example.com', password: 'short1' }
      });
      assert(weak1.status === 400 && weak1.data.error.includes('at least 8 characters'), 'Short password should be rejected');

      const weak2 = await apiReq('/api/auth/register', {
        method: 'POST',
        body: { username: 'weak_user2', email: 'w2@example.com', password: 'onlylettersnopassword' }
      });
      assert(weak2.status === 400 && weak2.data.error.includes('both letters and numbers'), 'Letter-only password should be rejected');

      const weak3 = await apiReq('/api/auth/register', {
        method: 'POST',
        body: { username: 'weak_user3', email: 'w3@example.com', password: '1234567890123' }
      });
      assert(weak3.status === 400 && weak3.data.error.includes('both letters and numbers'), 'Digit-only password should be rejected');

      // 2. Disable open registration and verify invite token enforcement
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: { open_registration: 'false' }
      });

      const uninvited = await apiReq('/api/auth/register', {
        method: 'POST',
        body: { username: 'uninvited_user', email: 'uninvited@example.com', password: 'StrongPass123!' }
      });
      assert(uninvited.status === 403, `Expected 403 for registration without invite token, got ${uninvited.status}`);

      // 3. Admin generates invite token
      const inviteRes = await apiReq('/api/auth/invite', {
        method: 'POST',
        session: adminSession,
        body: { email: 'invited@example.com' }
      });
      assert(inviteRes.status === 200 && inviteRes.data.token, `Invite creation failed: ${JSON.stringify(inviteRes.data)}`);
      const inviteToken = inviteRes.data.token;

      // 4. Registration with mismatched email fails
      const wrongEmail = await apiReq('/api/auth/register', {
        method: 'POST',
        body: { username: 'wrong_email_user', email: 'other@example.com', password: 'StrongPass123!', invite_token: inviteToken }
      });
      assert(wrongEmail.status === 400 && wrongEmail.data.error.includes('does not match'), 'Wrong email should be rejected for invite token');

      // 5. Registration with correct invite succeeds
      const goodInvite = await apiReq('/api/auth/register', {
        method: 'POST',
        body: { username: 'invited_vip', email: 'invited@example.com', password: 'StrongPass123!', invite_token: inviteToken }
      });
      assert(goodInvite.status === 201 && goodInvite.data.id, `Invited user registration failed: ${JSON.stringify(goodInvite.data)}`);

      // 6. Token is consumed and cannot be reused
      const reuseInvite = await apiReq('/api/auth/register', {
        method: 'POST',
        body: { username: 'reused_user', email: 'invited@example.com', password: 'StrongPass123!', invite_token: inviteToken }
      });
      assert(reuseInvite.status === 400, `Reused invite token should be rejected, got ${reuseInvite.status}`);
    });

    await check('Single Sign-On (OIDC): Discovery, code exchange, JIT provisioning, group mapping, and account linking', async () => {
      const mockUsers = {
        'auth_code_admin': {
          sub: 'oidc_sub_admin_123',
          email: 'oidc_admin@company.local',
          preferred_username: 'oidc_bob',
          groups: ['gyroid_admins', 'employees']
        },
        'auth_code_link': {
          sub: 'oidc_sub_existing_456',
          email: 'admin@test.local',
          preferred_username: 'admin_test',
          groups: []
        }
      };

      const mockIdpServer = http.createServer((req, res) => {
        const u = new URL(req.url, `http://${req.headers.host}`);
        if (u.pathname === '/.well-known/openid-configuration') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            issuer: `http://${req.headers.host}`,
            authorization_endpoint: `http://${req.headers.host}/authorize`,
            token_endpoint: `http://${req.headers.host}/token`,
            userinfo_endpoint: `http://${req.headers.host}/userinfo`
          }));
        } else if (u.pathname === '/token' && req.method === 'POST') {
          let body = '';
          req.on('data', d => body += d);
          req.on('end', () => {
            const params = new URLSearchParams(body);
            const code = params.get('code');
            const user = mockUsers[code];
            if (!user) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: 'invalid_grant' }));
            }
            const idTokenPayload = {
              sub: user.sub,
              email: user.email,
              preferred_username: user.preferred_username,
              aud: 'gyroid_client_id'
            };
            const idToken = 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify(idTokenPayload)).toString('base64url') + '.';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              access_token: 'mock_access_' + code,
              id_token: idToken,
              token_type: 'Bearer'
            }));
          });
        } else if (u.pathname === '/userinfo') {
          const auth = req.headers['authorization'] || '';
          const code = auth.replace('Bearer mock_access_', '');
          const user = mockUsers[code];
          if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'unauthorized' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(user));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise(r => mockIdpServer.listen(0, '127.0.0.1', r));
      const idpPort = mockIdpServer.address().port;
      const idpUrl = `http://127.0.0.1:${idpPort}`;

      try {
        const saveConf = await apiReq('/api/settings/system', {
          method: 'POST',
          session: adminSession,
          body: {
            oidc_enabled: 'true',
            oidc_issuer_url: idpUrl,
            oidc_client_id: 'gyroid_client_id',
            oidc_client_secret: 'super_secret_key_123',
            oidc_button_label: 'Authentik SSO',
            oidc_admin_group: 'gyroid_admins',
            oidc_auto_create_user: 'true',
            oidc_default_role: 'uploader'
          }
        });
        assert(saveConf.status === 200, `Saving OIDC settings failed: ${JSON.stringify(saveConf.data)}`);

        const testDisc = await apiReq('/api/settings/oidc/test', {
          method: 'POST',
          session: adminSession,
          body: { issuer_url: idpUrl }
        });
        assert(testDisc.status === 200 && testDisc.data.success, `OIDC test discovery failed: ${JSON.stringify(testDisc.data)}`);
        assert(testDisc.data.endpoints.token_endpoint.includes('/token'), 'Expected token_endpoint in discovered endpoints');

        const pub = await apiReq('/api/system/public-config');
        assert(pub.data.oidc_enabled === true, 'Expected oidc_enabled=true in public config');
        assert(pub.data.oidc_button_label === 'Authentik SSO', `Expected oidc_button_label="Authentik SSO", got ${pub.data.oidc_button_label}`);
        assert(!JSON.stringify(pub.data).includes('super_secret_key_123'), 'Public config must not leak client secret');

        const loginRes = await apiReq('/api/auth/oidc/login', { redirect: 'manual' });
        assert(loginRes.status === 302, `Expected 302 redirect from /api/auth/oidc/login, got ${loginRes.status}`);
        const redirectUrl = new URL(loginRes.location);
        assert(redirectUrl.pathname === '/authorize', `Expected redirect to /authorize, got ${redirectUrl.pathname}`);
        assert(redirectUrl.searchParams.get('client_id') === 'gyroid_client_id', 'Expected client_id param');
        const stateParam = redirectUrl.searchParams.get('state');
        assert(stateParam, 'Expected state query parameter');

        const stateCookie = (loginRes.setCookie || '').match(/oidc_state=([^;]+)/)?.[1];
        assert(stateCookie, 'Expected oidc_state cookie to be set');

        const badStateRes = await apiReq(`/api/auth/oidc/callback?code=auth_code_admin&state=wrong_state`, {
          redirect: 'manual',
          headers: { 'Cookie': `oidc_state=${stateCookie}` }
        });
        assert(badStateRes.status === 302, 'Expected 302 on failed state');
        assert(badStateRes.location.includes('error=sso_failed'), `Expected error redirect on state mismatch: ${badStateRes.location}`);

        const goodCallback = await apiReq(`/api/auth/oidc/callback?code=auth_code_admin&state=${stateParam}`, {
          redirect: 'manual',
          headers: { 'Cookie': `oidc_state=${stateCookie}` }
        });
        assert(goodCallback.status === 302, `Expected 302 from callback, got ${goodCallback.status}`);
        assert(goodCallback.location.includes('sso=1'), `Expected redirect to /?sso=1, got ${goodCallback.location}`);

        const sessionCookie = (goodCallback.setCookie || '').match(/pv_token=([^;]+)/)?.[0];
        assert(sessionCookie, 'Expected pv_token session cookie in OIDC callback response');

        const meRes = await apiReq('/api/auth/me', {
          headers: { 'Cookie': sessionCookie }
        });
        assert(meRes.status === 200, `GET /api/auth/me with OIDC session failed: ${meRes.status}`);
        assert(meRes.data.username === 'oidc_bob', `Expected username "oidc_bob", got "${meRes.data.username}"`);
        assert(meRes.data.role === 'admin', `Expected mapped role "admin", got "${meRes.data.role}"`);

        const loginRes2 = await apiReq('/api/auth/oidc/login', { redirect: 'manual' });
        const redirectUrl2 = new URL(loginRes2.location);
        const stateParam2 = redirectUrl2.searchParams.get('state');
        const stateCookie2 = (loginRes2.setCookie || '').match(/oidc_state=([^;]+)/)?.[1];

        const linkCallback = await apiReq(`/api/auth/oidc/callback?code=auth_code_link&state=${stateParam2}`, {
          redirect: 'manual',
          headers: { 'Cookie': `oidc_state=${stateCookie2}` }
        });
        assert(linkCallback.status === 302 && linkCallback.location.includes('sso=1'), `Linking callback failed: ${linkCallback.location}`);
        const linkSession = (linkCallback.setCookie || '').match(/pv_token=([^;]+)/)?.[0];
        const linkedMe = await apiReq('/api/auth/me', { headers: { 'Cookie': linkSession } });
        assert(linkedMe.status === 200, 'Linked user /me failed');
        assert(linkedMe.data.email === 'admin@test.local', 'Expected linked email admin@test.local');

      } finally {
        await new Promise(r => mockIdpServer.close(r));
      }
    });

    await check('Security: Public config (/api/system/public-config) does not leak secrets', async () => {
      const pubConfRes = await apiReq('/api/system/public-config');
      assert(pubConfRes.status === 200, `/api/system/public-config returned ${pubConfRes.status}`);
      const data = pubConfRes.data;

      assert(typeof data.open_registration === 'boolean', 'Expected open_registration boolean in public config');
      assert(typeof data.require_login_to_view === 'boolean', 'Expected require_login_to_view boolean in public config');

      const jsonStr = JSON.stringify(data).toLowerCase();
      const forbiddenTokens = ['secret', 'jwt', 'token', 'password', 'smtp_pass', 'hash', 'private'];
      for (const token of forbiddenTokens) {
        assert(!jsonStr.includes(`"${token}"`), `Public config leaked sensitive property: ${token}`);
      }
    });

    await check('Maintenance Filters: "Uncategorized" & "Untagged" queries', async () => {
      // Create a test category and tag
      const catRes = await apiReq('/api/categories', { method: 'POST', session: adminSession, body: { name: 'Maint Cat', color: '#3b82f6' } });
      const tagRes = await apiReq('/api/tags', { method: 'POST', session: adminSession, body: { name: 'maint_tag' } });
      const catId = catRes.data.id;
      const tagId = tagRes.data.id;

      // Model 1: has category + tag
      const mBoth = await apiReq('/api/models', { method: 'POST', session: adminSession, body: { name: 'Maint Both', category_id: catId } });
      await apiReq(`/api/models/${mBoth.data.id}`, { method: 'PUT', session: adminSession, body: { tags: [tagId] } });

      // Model 2: has category, no tag
      const mCatOnly = await apiReq('/api/models', { method: 'POST', session: adminSession, body: { name: 'Maint CatOnly', category_id: catId } });

      // Model 3: has no category, but has tag
      const mTagOnly = await apiReq('/api/models', { method: 'POST', session: adminSession, body: { name: 'Maint TagOnly' } });
      await apiReq(`/api/models/${mTagOnly.data.id}`, { method: 'PUT', session: adminSession, body: { tags: [tagId] } });

      // Model 4: has neither category nor tag
      const mClean = await apiReq('/api/models', { method: 'POST', session: adminSession, body: { name: 'Maint Clean' } });

      // Test uncategorized filter
      const uncatRes = await apiReq('/api/models?category=uncategorized&limit=100', { session: adminSession });
      const uncatIds = uncatRes.data.models.map(m => m.id);
      assert(uncatIds.includes(mTagOnly.data.id), 'Expected mTagOnly in uncategorized');
      assert(uncatIds.includes(mClean.data.id), 'Expected mClean in uncategorized');
      assert(!uncatIds.includes(mBoth.data.id), 'Did not expect mBoth in uncategorized');
      assert(!uncatIds.includes(mCatOnly.data.id), 'Did not expect mCatOnly in uncategorized');

      // Test untagged filter
      const untagRes = await apiReq('/api/models?tag=untagged&limit=100', { session: adminSession });
      const untagIds = untagRes.data.models.map(m => m.id);
      assert(untagIds.includes(mCatOnly.data.id), 'Expected mCatOnly in untagged');
      assert(untagIds.includes(mClean.data.id), 'Expected mClean in untagged');
      assert(!untagIds.includes(mBoth.data.id), 'Did not expect mBoth in untagged');
      assert(!untagIds.includes(mTagOnly.data.id), 'Did not expect mTagOnly in untagged');

      // Combined uncategorized + untagged
      const bothFilterRes = await apiReq('/api/models?category=uncategorized&tag=untagged&limit=100', { session: adminSession });
      const bothFilterIds = bothFilterRes.data.models.map(m => m.id);
      assert(bothFilterIds.includes(mClean.data.id), 'Expected mClean in uncategorized + untagged');
      assert(!bothFilterIds.includes(mCatOnly.data.id), 'Did not expect mCatOnly in both');
      assert(!bothFilterIds.includes(mTagOnly.data.id), 'Did not expect mTagOnly in both');
      assert(!bothFilterIds.includes(mBoth.data.id), 'Did not expect mBoth in both');
    });

    await check('Typed Search Syntax (tag:, -tag:, cat:, format:)', async () => {
      // Create specific category and tags for syntax tests
      const catRes = await apiReq('/api/categories', { method: 'POST', session: adminSession, body: { name: 'SyntaxCat', color: '#10b981' } });
      const tagAlphaRes = await apiReq('/api/tags', { method: 'POST', session: adminSession, body: { name: 'syntax_alpha' } });
      const tagBetaRes = await apiReq('/api/tags', { method: 'POST', session: adminSession, body: { name: 'syntax_beta' } });

      // Model A: SyntaxCat + syntax_alpha
      const mA = await apiReq('/api/models', { method: 'POST', session: adminSession, body: { name: 'Searchable Alpha Dragon', category_id: catRes.data.id } });
      await apiReq(`/api/models/${mA.data.id}`, { method: 'PUT', session: adminSession, body: { tags: [tagAlphaRes.data.id] } });

      // Model B: SyntaxCat + syntax_beta
      const mB = await apiReq('/api/models', { method: 'POST', session: adminSession, body: { name: 'Searchable Beta Benchy', category_id: catRes.data.id } });
      await apiReq(`/api/models/${mB.data.id}`, { method: 'PUT', session: adminSession, body: { tags: [tagBetaRes.data.id] } });

      // Test tag:syntax_alpha
      const resAlpha = await apiReq('/api/models?search=' + encodeURIComponent('tag:syntax_alpha'), { session: adminSession });
      const idsAlpha = resAlpha.data.models.map(m => m.id);
      assert(idsAlpha.includes(mA.data.id), 'Expected mA in tag:syntax_alpha');
      assert(!idsAlpha.includes(mB.data.id), 'Did not expect mB in tag:syntax_alpha');

      // Test cat:SyntaxCat -tag:syntax_alpha
      const resBeta = await apiReq('/api/models?search=' + encodeURIComponent('cat:SyntaxCat -tag:syntax_alpha'), { session: adminSession });
      const idsBeta = resBeta.data.models.map(m => m.id);
      assert(idsBeta.includes(mB.data.id), 'Expected mB in cat:SyntaxCat -tag:syntax_alpha');
      assert(!idsBeta.includes(mA.data.id), 'Did not expect mA in cat:SyntaxCat -tag:syntax_alpha');

      // Test combined free text + tag
      const resCombo = await apiReq('/api/models?search=' + encodeURIComponent('tag:syntax_beta Benchy'), { session: adminSession });
      const idsCombo = resCombo.data.models.map(m => m.id);
      assert(idsCombo.includes(mB.data.id), 'Expected mB in tag:syntax_beta Benchy');
      assert(!idsCombo.includes(mA.data.id), 'Did not expect mA in tag:syntax_beta Benchy');
    });

    await check('1-Click Database & Thumbnail Backup (GET /api/system/backup)', async () => {
      // Security: Unauthenticated request must be blocked
      const unauthRes = await apiReq('/api/system/backup');
      assert(unauthRes.status === 401, `Expected 401 for unauthenticated backup, got ${unauthRes.status}`);

      // Security: Viewer request must be blocked
      const viewerRes = await apiReq('/api/system/backup', { session: viewerSession });
      assert(viewerRes.status === 403, `Expected 403 for viewer backup, got ${viewerRes.status}`);

      // Authorized Admin request returns valid ZIP
      const backupRes = await apiReq('/api/system/backup', { session: adminSession, raw: true });
      assert(backupRes.status === 200, `Expected 200 for admin backup, got ${backupRes.status}`);
      assert(backupRes.headers.get('content-type') === 'application/zip', 'Expected application/zip content type');
      const disp = backupRes.headers.get('content-disposition') || '';
      assert(disp.includes('attachment; filename="gyroidvault-backup-'), `Expected backup filename in Content-Disposition: ${disp}`);

      // Verify ZIP archive integrity
      const zip = new AdmZip(backupRes.data);
      const dbEntry = zip.getEntry('gyroidvault.db');
      assert(dbEntry !== null, 'Expected gyroidvault.db inside backup ZIP archive');
      assert(dbEntry.header.size > 0, 'Expected gyroidvault.db in backup ZIP to have non-zero size');
    });

    await check('Configurable Default Landing Page & Module Toggles (system_settings + public-config)', async () => {
      // Default state in public-config
      const initialPub = await apiReq('/api/system/public-config');
      assert(initialPub.data.default_landing_page === 'dashboard', `Expected default_landing_page="dashboard", got ${initialPub.data.default_landing_page}`);
      assert(initialPub.data.enable_categories === true, 'Expected enable_categories=true by default');
      assert(initialPub.data.enable_collections === true, 'Expected enable_collections=true by default');
      assert(initialPub.data.enable_tags === true, 'Expected enable_tags=true by default');

      // Admin toggles landing page and module toggles
      const saveRes = await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: {
          default_landing_page: 'models',
          enable_categories: 'false',
          enable_tags: 'false'
        }
      });
      assert(saveRes.status === 200, 'Expected 200 saving system settings');

      // Verify public-config reflects the changes immediately for unauthenticated visitors
      const updatedPub = await apiReq('/api/system/public-config');
      assert(updatedPub.data.default_landing_page === 'models', `Expected default_landing_page="models", got ${updatedPub.data.default_landing_page}`);
      assert(updatedPub.data.enable_categories === false, 'Expected enable_categories=false');
      assert(updatedPub.data.enable_tags === false, 'Expected enable_tags=false');
      assert(updatedPub.data.enable_collections === true, 'Expected enable_collections to remain true');

      // Reset back to defaults
      await apiReq('/api/settings/system', {
        method: 'POST',
        session: adminSession,
        body: {
          default_landing_page: 'dashboard',
          enable_categories: 'true',
          enable_tags: 'true'
        }
      });
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