const App = {
  el: null,
  currentUser: null,
  searchTimeout: null,
  cache: { categories: [], tags: [], materials: [], users: [] },
  pendingFiles: [],

  // ── Init ──
  async init() {
    this.el = document.getElementById('app');
    const savedUser = localStorage.getItem('pv_user');
    if (savedUser) {
      try { this.currentUser = JSON.parse(savedUser); } catch(e) { localStorage.removeItem('pv_user'); }
    }
    
    window.addEventListener('hashchange', () => this.route());
    await this.loadCache();
    this.updateUserNav();
    this.route();
  },

  async loadCache() {
    try {
      const [cats, tags, mats] = await Promise.all([
        API.getCategories(), API.getTags(), API.getMaterials()
      ]);
      this.cache.categories = cats || [];
      this.cache.tags = tags || [];
      this.cache.materials = mats || [];
      
      // Only try to fetch users if logged in
      if (this.currentUser) {
        try {
          this.cache.users = await API.getUsers();
        } catch(e) { /* ignore auth error */ }
      }
    } catch (e) { console.error('Cache load failed:', e); }
  },

  // ── Routing ──
  route() {
    const hash = location.hash.slice(1) || '/';
    const [path, query] = hash.split('?');
    const params = new URLSearchParams(query || '');

    const links = document.querySelectorAll('.nav-link');
    links.forEach(l => l.classList.remove('active'));

    if (path === '/' || path === '/dashboard') {
      document.getElementById('nav-dashboard')?.classList.add('active');
      this.renderDashboard();
    } else if (path === '/models') {
      document.getElementById('nav-models')?.classList.add('active');
      this.renderModels(Object.fromEntries(params));
    } else if (path.startsWith('/models/')) {
      document.getElementById('nav-models')?.classList.add('active');
      this.renderModelDetail(path.split('/')[2]);
    } else if (path === '/projects') {
      document.getElementById('nav-projects')?.classList.add('active');
      this.renderProjects();
    } else if (path.startsWith('/projects/')) {
      document.getElementById('nav-projects')?.classList.add('active');
      this.renderProjectDetail(path.split('/')[2]);
    } else if (path.startsWith('/share/')) {
      this.renderSharedModel(path.split('/')[2]);
    } else if (path === '/profile') {
      this.renderProfile();
    } else if (path === '/settings') {
      document.getElementById('nav-settings')?.classList.add('active');
      this.renderSettings();
    } else if (path === '/reset-password') {
      this.showResetPassword(params.get('token'));
    } else {
      this.renderDashboard();
    }
  },

  navigate(path) {
    location.hash = path;
  },

  // ── Toast ──
  toast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
  },

  // ── Modal ──
  openModal(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-overlay').classList.add('active');
  },
  closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
  },

  // ─── Dashboard ────────────────────────────────────────────────────────
  async renderDashboard() {
    this.el.innerHTML = `<div class="page-header"><div><h1 class="page-title">Dashboard</h1><p class="page-subtitle">Your 3D printing overview</p></div>${this.currentUser ? '<button class="btn btn-primary" onclick="App.showCreateModel()">+ New Model</button>' : ''}</div><div class="stats-grid"><div class="stat-card"><div class="skeleton" style="width:60%;height:32px;margin-top:40px"></div></div><div class="stat-card"><div class="skeleton" style="width:60%;height:32px;margin-top:40px"></div></div><div class="stat-card"><div class="skeleton" style="width:60%;height:32px;margin-top:40px"></div></div><div class="stat-card"><div class="skeleton" style="width:60%;height:32px;margin-top:40px"></div></div></div>`;
    try {
      const stats = await API.getStats();
      this.el.innerHTML = `
        <div class="page-header"><div><h1 class="page-title">Dashboard</h1><p class="page-subtitle">Your 3D printing overview</p></div>${this.currentUser ? '<button class="btn btn-primary" onclick="App.showCreateModel()">+ New Model</button>' : ''}</div>
        ${UI.statsCards(stats)}
        <div class="dashboard-panels">
          <div class="glass-panel"><div class="panel-header"><div class="panel-title">🕐 Recent Models</div></div><div class="panel-body">${UI.recentModels(stats.recentModels)}</div></div>
          <div class="glass-panel"><div class="panel-header"><div class="panel-title">🖨 Recent Prints</div></div><div class="panel-body">${UI.recentPrints(stats.recentPrints)}</div></div>
          <div class="glass-panel"><div class="panel-header"><div class="panel-title">🧵 Material Usage</div></div><div class="panel-body">${UI.materialChart(stats.materialUsage)}</div></div>
        </div>`;
    } catch (e) {
      this.el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load dashboard</div></div>';
    }
  },

  // ─── Models List ──────────────────────────────────────────────────────
  async renderModels(params = {}) {
    const toolbar = UI.toolbar(this.cache.categories, this.cache.tags, this.cache.users);
    this.el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Models</h1><p class="page-subtitle">Manage your 3D model library</p></div>
        ${this.currentUser ? '<button class="btn btn-primary" onclick="App.showCreateModel()">+ New Model</button>' : ''}
      </div>
      ${toolbar}
      <div id="models-grid"><div class="model-grid">${'<div class="model-card"><div class="model-card-thumb"><div class="skeleton" style="width:100%;height:100%"></div></div><div class="model-card-body"><div class="skeleton" style="width:70%;height:18px;margin-bottom:8px"></div><div class="skeleton" style="width:40%;height:14px"></div></div></div>'.repeat(6)}</div></div>`;

    // Restore filter values
    if (params.search) document.getElementById('search-input').value = params.search;
    if (params.category) document.getElementById('filter-category').value = params.category;
    if (params.tag) document.getElementById('filter-tag').value = params.tag;
    if (params.user) document.getElementById('filter-user').value = params.user;
    if (params.printed) document.getElementById('filter-printed').value = params.printed;
    if (params.sort) document.getElementById('filter-sort').value = params.sort;

    // Hide scan if not admin
    if (!this.currentUser || this.currentUser.role !== 'admin') {
      const scanBtn = document.getElementById('scan-btn');
      if (scanBtn) scanBtn.style.display = 'none';
    }

    await this.fetchAndRenderModels(params);
  },

  async fetchAndRenderModels(params = {}) {
    try {
      const models = await API.getModels(params);
      const grid = document.getElementById('models-grid');
      if (!grid) return;
      if (!models.length) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">No models found</div><div class="empty-state-sub">Create your first model to get started</div></div>';
        return;
      }
      grid.innerHTML = `<div class="model-grid">${models.map(m => UI.modelCard(m)).join('')}</div>`;
      if (typeof Viewer !== 'undefined' && Viewer.generateThumbnails) {
        setTimeout(() => Viewer.generateThumbnails(), 50);
      }
    } catch (e) {
      console.error(e);
      document.getElementById('models-grid').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load models</div></div>';
    }
  },

  handleSearch(val) {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.handleFilter(), 300);
  },

  handleFilter() {
    const params = {
      search: document.getElementById('search-input')?.value || '',
      category: document.getElementById('filter-category')?.value || '',
      tag: document.getElementById('filter-tag')?.value || '',
      user: document.getElementById('filter-user')?.value || '',
      printed: document.getElementById('filter-printed')?.value || '',
      sort: document.getElementById('filter-sort')?.value || 'updated',
    };
    this.fetchAndRenderModels(params);
  },

  // ── Auth ──
  showLogin() { this.openModal('Login', UI.loginForm()); },
  showRegister() { this.openModal('Register', UI.registerForm()); },
  showForgotPassword() { this.openModal('Reset Password', UI.forgotPasswordForm()); },
  showResetPassword(token) { if (token) this.openModal('Choose New Password', UI.resetPasswordForm(token)); },
  
  async handleLogin(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await API.login(fd.get('username'), fd.get('password'));
      localStorage.setItem('pv_token', res.token);
      localStorage.setItem('pv_user', JSON.stringify(res.user));
      this.currentUser = res.user;
      this.toast('Welcome back, ' + res.user.username);
      this.closeModal();
      this.updateUserNav();
      await this.loadCache();
      this.route();
    } catch(e) { this.toast(e.message, 'error'); }
  },
  
  async handleRegister(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.register(fd.get('username'), fd.get('email'), fd.get('password'));
      this.toast('Registration successful! Please login.');
      this.showLogin();
    } catch(e) { this.toast(e.message, 'error'); }
  },

  async handleForgotPassword(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await API.forgotPassword(fd.get('email'));
      this.toast(res.message);
      this.closeModal();
    } catch(e) { this.toast(e.message, 'error'); }
  },

  async handleResetPassword(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('password') !== fd.get('confirm')) return this.toast('Passwords do not match', 'error');
    try {
      const res = await API.resetPassword(fd.get('token'), fd.get('password'));
      this.toast(res.message);
      this.closeModal();
      window.location.hash = '#/';
      this.showLogin();
    } catch(e) { this.toast(e.message, 'error'); }
  },
  
  async handleUpdateProfile(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = { username: fd.get('username'), email: fd.get('email') };
    if (fd.get('password')) data.password = fd.get('password');
    try {
      await API.updateProfile(data);
      this.toast('Profile updated successfully');
      // Refresh user info
      const user = await API.getMe();
      this.currentUser = user;
      localStorage.setItem('pv_user', JSON.stringify(user));
      this.updateUserNav();
    } catch(e) { this.toast(e.message, 'error'); }
  },

  async handleSaveSMTP(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    try {
      await API.saveSMTPSettings(data);
      this.toast('SMTP settings saved');
    } catch(e) { this.toast(e.message, 'error'); }
  },
  
  handleLogout() {
    localStorage.removeItem('pv_token');
    localStorage.removeItem('pv_user');
    this.currentUser = null;
    this.toast('Logged out');
    this.updateUserNav();
    this.route();
  },
  
  updateUserNav() {
    const sec = document.getElementById('nav-user-section');
    if (!sec) return;
    if (this.currentUser) {
      sec.innerHTML = `
        <div class="dropdown">
          <button class="btn btn-ghost" style="display:flex;align-items:center;gap:8px;padding:8px 12px">
            👤 ${this.currentUser.username}
          </button>
          <div class="dropdown-content" style="right: 0">
            <div class="dropdown-header">${this.currentUser.role.toUpperCase()} ACCOUNT</div>
            <a href="#/profile">Edit Profile</a>
            <a href="#" onclick="event.preventDefault();App.handleLogout()">Log Out</a>
          </div>
        </div>`;
    } else {
      sec.innerHTML = `<button class="btn btn-ghost" onclick="App.showLogin()">🔑 Login</button>`;
    }
  },

  async renderProfile() {
    if (!this.currentUser) return this.navigate('/');
    this.el.innerHTML = UI.profilePage(this.currentUser);
  },

  // ─── Projects ────────────────────────────────────────────────────────
  async renderProjects() {
    if (!this.currentUser) {
      this.el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔐</div><div class="empty-state-text">Login to view projects</div><div class="empty-state-sub">Projects are private and require an account</div><button class="btn btn-primary btn-sm" onclick="App.showLogin()" style="margin-top:16px">Login</button></div>';
      return;
    }
    this.el.innerHTML = '<div class="skeleton-grid"></div>';
    try {
      const projects = await API.getProjects();
      this.el.innerHTML = UI.projectsPage(projects);
    } catch (e) { this.toast('Failed to load projects', 'error'); }
  },

  async renderProjectDetail(id) {
    this.el.innerHTML = '<div class="skeleton-grid"></div>';
    try {
      const project = await API.getProject(id);
      this.el.innerHTML = UI.projectDetail(project);
      if (typeof Viewer !== 'undefined' && Viewer.generateThumbnails) {
        setTimeout(() => Viewer.generateThumbnails(), 50);
      }
    } catch (e) { this.toast('Failed to load project', 'error'); }
  },

  showCreateProject() {
    this.openModal('New Project', UI.projectForm());
  },

  async handleProjectSubmit(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = { name: fd.get('name'), description: fd.get('description') };
    try {
      if (id) {
        // Update (TBD if needed)
      } else {
        await API.createProject(data);
        this.toast('Project created');
        this.closeModal();
        this.renderProjects();
      }
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async deleteProject(id) {
    if (!confirm('Are you sure you want to delete this project? Models will not be deleted.')) return;
    try {
      await API.deleteProject(id);
      this.toast('Project deleted');
      this.navigate('/projects');
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async addToProject(modelId) {
    const projects = await API.getProjects();
    if (!projects.length) {
      if (confirm('No projects found. Create one now?')) this.showCreateProject();
      return;
    }
    const html = `
      <div class="form-grid">
        <label>Select Project</label>
        <select id="project-select" class="form-input">
          ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
        <button class="btn btn-primary" onclick="App.handleAddToProject(${modelId})" style="margin-top:16px;width:100%">Add to Project</button>
      </div>`;
    this.openModal('Add to Project', html);
  },

  async handleAddToProject(modelId) {
    const projectId = document.getElementById('project-select').value;
    try {
      await API.addModelToProject(projectId, modelId);
      this.toast('Added to project');
      this.closeModal();
    } catch (e) { this.toast(e.message, 'error'); }
  },

  // ─── Sharing ─────────────────────────────────────────────────────────
  showShareModal(modelId) {
    this.openModal('Share Model', UI.shareModal(modelId));
  },

  async generateShare(modelId) {
    const days = document.getElementById('share-expiry').value;
    try {
      const { slug } = await API.createShare(modelId, days);
      const link = `${window.location.origin}/#/share/${slug}`;
      const res = document.getElementById('share-result');
      const input = document.getElementById('share-link-input');
      input.value = link;
      res.style.display = 'block';
    } catch (e) { this.toast(e.message, 'error'); }
  },

  copyShareLink() {
    const input = document.getElementById('share-link-input');
    input.select();
    document.execCommand('copy');
    this.toast('Link copied to clipboard');
  },

  showCreateVersion(id, name) {
    const html = `
      <form onsubmit="App.handleVersionSubmit(event, ${id})" class="form-grid">
        <div class="form-group">
          <label>Version Name</label>
          <input type="text" name="name" value="${name} (v2)" required class="form-input" placeholder="e.g. My Model v2">
        </div>
        <div class="form-group">
          <label>Description of changes (optional)</label>
          <textarea name="description" class="form-textarea" placeholder="What changed in this version?"></textarea>
        </div>
        <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:8px">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Version</button>
        </div>
      </form>`;
    this.openModal('New Version', html);
  },

  async handleVersionSubmit(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = { name: fd.get('name'), description: fd.get('description') };
    try {
      const res = await API.createVersion(id, data);
      this.toast('Version created');
      this.closeModal();
      this.navigate(`/models/${res.id}`);
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async renderSharedModel(slug) {
    this.el.innerHTML = '<div style="padding:40px;text-align:center">Loading shared model...</div>';
    try {
      const model = await API.getSharedModel(slug);
      this.el.innerHTML = UI.publicModelDetail(model);
      
      const stlFile = model.files.find(f => f.file_type === 'stl');
      if (stlFile && typeof Viewer !== 'undefined') {
        setTimeout(() => {
          Viewer.create('public-viewer', stlFile.url);
        }, 100);
      }
    } catch (e) {
      this.el.innerHTML = `<div class="empty-state">⚠️ Share link invalid or expired</div>`;
    }
  },

  openInSlicer(fileUrl, slicer) {
    const absoluteUrl = window.location.origin + fileUrl;
    let protocol = '';
    if (slicer === 'bambustudio') protocol = 'bambustudio://open?file=';
    else if (slicer === 'prusaslicer') protocol = 'prusaslicer://';
    else if (slicer === 'orcaslicer') protocol = 'orcaslicer://open?file=';
    
    if (protocol) {
      window.location.href = protocol + absoluteUrl;
      this.toast(`Opening in ${slicer}...`);
    } else {
      // Fallback for Cura: just download?
      window.open(fileUrl, '_blank');
    }
  },

  // ─── Model Detail ────────────────────────────────────────────────────
  async renderModelDetail(id) {
    if (typeof Viewer !== 'undefined') Viewer.cleanup();
    this.el.innerHTML = '<div style="padding:40px;text-align:center"><div class="skeleton" style="width:200px;height:30px;margin:0 auto 20px"></div><div class="skeleton" style="width:100%;height:200px"></div></div>';
    try {
      const model = await API.getModel(id);
      this.el.innerHTML = `
        <div style="margin-bottom:16px">
          <a href="#/models" style="color:var(--text-secondary);font-size:.85rem;display:inline-flex;align-items:center;gap:4px">← Back to Models</a>
        </div>
        ${UI.modelDetail(model)}`;
      // Initialize 3D viewer if STL or 3MF file exists
      const stlFile = (model.files || []).find(f => f.file_type === 'stl' || f.file_type === '3mf');
      if (stlFile && typeof Viewer !== 'undefined') {
        const stlUrl = `${stlFile.url || '/uploads/'+stlFile.filename}?t=${Date.now()}`;
        setTimeout(async () => {
          const v = Viewer.create(`stl-viewer-${model.id}`, stlUrl);
          if (v && !model.thumbnail_url) {
            setTimeout(() => Viewer.takeSnapshot(model.id, v.renderer, v.scene, v.camera), 2500);
          }
        }, 100);
      }
    } catch (e) {
      this.el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Model not found</div></div>';
    }
  },

  async handleScanLibrary() {
    const btn = document.getElementById('scan-btn');
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon rotating">🔄</span> Scanning...';

    try {
      const token = localStorage.getItem('pv_token');
      const res = await fetch('/api/library/scan', { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        this.toast(`Scan complete! Added ${data.modelsAdded} models and ${data.filesAdded} files.`);
        this.fetchAndRenderModels();
      } else {
        if (res.status === 401) this.toast('Please login as admin to scan', 'error');
        else alert('Scan failed: ' + data.error);
      }
    } catch (e) {
      console.error(e);
      this.toast('Scan failed', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  },

  previewStl(modelId, url) {
    if (typeof Viewer === 'undefined') return;
    Viewer.cleanup();
    const container = document.getElementById(`stl-viewer-${modelId}`);
    if (container) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted)">Loading...</div>';
      container.dataset.stlUrl = url;
      setTimeout(() => {
        Viewer.create(`stl-viewer-${modelId}`, url);
      }, 50);
    }
  },

  async renderSettings() {
    this.el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Settings</h1><p class="page-subtitle">Configure your PrintVault instance</p></div>
      </div>
      <div class="settings-tabs" style="display:flex;gap:8px;margin-bottom:24px;border-bottom:1px solid var(--border);padding-bottom:1px">
        <button class="tab-btn active" data-tab="categories" style="background:none;border:none;color:var(--text-secondary);padding:10px 20px;cursor:pointer;font-weight:600;border-bottom:2px solid transparent;transition:all .2s">Categories</button>
        <button class="tab-btn" data-tab="tags" style="background:none;border:none;color:var(--text-secondary);padding:10px 20px;cursor:pointer;font-weight:600;border-bottom:2px solid transparent;transition:all .2s">Tags</button>
        <button class="tab-btn" data-tab="materials" style="background:none;border:none;color:var(--text-secondary);padding:10px 20px;cursor:pointer;font-weight:600;border-bottom:2px solid transparent;transition:all .2s">Materials</button>
        ${this.currentUser?.role === 'admin' ? '<button class="tab-btn" data-tab="smtp" style="background:none;border:none;color:var(--text-secondary);padding:10px 20px;cursor:pointer;font-weight:600;border-bottom:2px solid transparent;transition:all .2s">SMTP & Mail</button>' : ''}
        ${this.currentUser?.role === 'admin' ? '<button class="tab-btn" data-tab="users" style="background:none;border:none;color:var(--text-secondary);padding:10px 20px;cursor:pointer;font-weight:600;border-bottom:2px solid transparent;transition:all .2s">Users</button>' : ''}
      </div>
      <div id="settings-content"></div>`;

    const content = this.el.querySelector('#settings-content');
    const tabs = this.el.querySelectorAll('.tab-btn');

    const switchTab = async (tab) => {
      tabs.forEach(t => {
        const active = t.dataset.tab === tab;
        t.style.color = active ? 'var(--accent-cyan)' : 'var(--text-secondary)';
        t.style.borderBottomColor = active ? 'var(--accent-cyan)' : 'transparent';
      });
      content.innerHTML = '<div class="skeleton" style="height:300px;width:100%"></div>';

      try {
        if (tab === 'categories') {
          const cats = await API.getCategories();
          content.innerHTML = `<div class="settings-grid">${UI.settingsPanel('📁 Categories', cats, 'categories')}</div>`;
        } else if (tab === 'tags') {
          const tags = await API.getTags();
          content.innerHTML = `<div class="settings-grid">${UI.settingsPanel('🏷 Tags', tags, 'tags')}</div>`;
        } else if (tab === 'materials') {
          const mats = await API.getMaterials();
          content.innerHTML = `<div class="settings-grid">${UI.settingsPanel('🧵 Materials', mats, 'materials')}</div>`;
        } else if (tab === 'smtp') {
          const config = await API.getSMTPSettings();
          content.innerHTML = `
            <div class="glass-panel" style="max-width:800px">
              <div class="panel-header"><div class="panel-title">SMTP Mail Configuration</div></div>
              <div class="panel-body">${UI.smtpSettingsForm(config)}</div>
            </div>`;
        } else if (tab === 'users') {
          const users = await API.getUsers();
          content.innerHTML = `
            <div class="glass-panel">
              <div class="panel-header"><div class="panel-title">User Management</div></div>
              <div class="panel-body">
                <table style="width:100%;border-collapse:collapse;font-size:.9rem">
                  <thead><tr style="text-align:left;color:var(--text-muted);border-bottom:1px solid var(--border)"><th style="padding:12px">ID</th><th style="padding:12px">Username</th><th style="padding:12px">Email</th><th style="padding:12px">Role</th></tr></thead>
                  <tbody>${users.map(u => `<tr style="border-bottom:1px solid var(--border);color:var(--text-secondary)"><td style="padding:12px">${u.id}</td><td style="padding:12px;font-weight:600">${u.username}</td><td style="padding:12px">${u.email || '-'}</td><td style="padding:12px"><span class="badge badge-${u.role === 'admin' ? 'purple' : 'cyan'}">${u.role}</span></td></tr>`).join('')}</tbody>
                </table>
              </div>
            </div>`;
        }
      } catch (e) { console.error(e); }
    };

    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    switchTab('categories');
  },

  // ─── Actions ──────────────────────────────────────────────────────────
  async showCreateModel() {
    await this.loadCache();
    this.pendingFiles = [];
    this.openModal('New Model', UI.modelForm(null, this.cache.categories, this.cache.tags));
    setTimeout(() => document.getElementById('model-name-input')?.focus(), 100);
  },

  handleCreateFileSelect(e) {
    const files = Array.from(e.target.files);
    this.addPendingFiles(files);
  },

  handleCreateFileDrop(e) {
    const files = Array.from(e.dataTransfer.files);
    this.addPendingFiles(files);
  },

  addPendingFiles(files) {
    this.pendingFiles.push(...files);
    this.renderPendingFiles();
  },

  removePendingFile(index) {
    this.pendingFiles.splice(index, 1);
    this.renderPendingFiles();
  },

  renderPendingFiles() {
    const list = document.getElementById('create-file-list');
    if (!list) return;
    if (!this.pendingFiles.length) { list.style.display = 'none'; return; }
    list.style.display = 'block';
    list.innerHTML = this.pendingFiles.map((f, i) =>
      `<div class="upload-file-item">
        <span class="badge badge-${f.name.split('.').pop().toLowerCase()}">${f.name.split('.').pop().toUpperCase()}</span>
        <span>${f.name}</span>
        <span style="color:var(--text-muted);font-size:.7rem">${UI.formatSize(f.size)}</span>
        <button class="remove-file" onclick="event.preventDefault();App.removePendingFile(${i})">×</button>
      </div>`
    ).join('');
  },

  async showEditModel(id) {
    try {
      const [model] = await Promise.all([API.getModel(id), this.loadCache()]);
      this.openModal('Edit Model', UI.modelForm(model, this.cache.categories, this.cache.tags));
    } catch (e) { this.toast('Failed to load model', 'error'); }
  },

  async handleModelSubmit(e, id) {
    e.preventDefault();
    const form = new FormData(e.target);
    const tags = Array.from(e.target.querySelectorAll('input[name="tags"]:checked')).map(c => parseInt(c.value));
    const data = {
      name: form.get('name'),
      description: form.get('description'),
      print_tips: form.get('print_tips'),
      category_id: form.get('category_id') || null,
      tags,
    };
    try {
      if (id) {
        await API.updateModel(id, data);
        this.toast('Model updated');
        this.closeModal();
        this.renderModelDetail(id);
      } else {
        const model = await API.createModel(data);
        // Upload pending files if any
        if (this.pendingFiles.length > 0) {
          try {
            await API.uploadFiles(model.id, this.pendingFiles);
            this.toast(`Model created with ${this.pendingFiles.length} file(s)`);
          } catch (ue) {
            this.toast('Model created but file upload failed: ' + ue.message, 'error');
          }
          this.pendingFiles = [];
        } else {
          this.toast('Model created');
        }
        this.closeModal();
        this.navigate(`/models/${model.id}`);
      }
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async confirmDeleteModel(id, name) {
    if (!this.currentUser) return;
    if (!confirm(`Are you sure you want to delete "${name}"? This will also delete all files and print history.`)) return;
    try {
      await API.deleteModel(id);
      this.toast('Model deleted');
      this.navigate('/models');
    } catch (e) { this.toast(e.message, 'error'); }
  },

  copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => this.toast('Path copied'));
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        this.toast('Path copied');
      } catch (err) {
        console.error('Fallback copy failed', err);
        this.toast('Failed to copy', 'error');
      }
      document.body.removeChild(textArea);
    }
  },

  // ── Files ──
  showUploadFiles(modelId) {
    this.openModal('Upload Files', UI.uploadForm(modelId));
  },

  async handleFileSelect(e, modelId) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    await this.uploadFilesAction(modelId, files);
  },

  async handleFileDrop(e, modelId) {
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    await this.uploadFilesAction(modelId, files);
  },

  async uploadFilesAction(modelId, files) {
    const progress = document.getElementById('upload-progress');
    if (progress) progress.innerHTML = `<div style="color:var(--accent-cyan);font-size:.875rem">⏳ Uploading ${files.length} file(s)...</div>`;
    try {
      await API.uploadFiles(modelId, files);
      this.toast(`${files.length} file(s) uploaded`);
      this.closeModal();
      this.renderModelDetail(modelId);
    } catch (e) {
      this.toast(e.message, 'error');
      if (progress) progress.innerHTML = `<div style="color:var(--error);font-size:.875rem">❌ ${e.message}</div>`;
    }
  },

  async deleteFile(fileId, modelId) {
    if (!confirm('Delete this file?')) return;
    try {
      await API.deleteFile(fileId);
      this.toast('File deleted');
      this.renderModelDetail(modelId);
    } catch (e) { this.toast(e.message, 'error'); }
  },

  // ── Prints ──
  async showLogPrint(modelId) {
    await this.loadCache();
    this.openModal('Log Print', UI.printForm(modelId, this.cache.materials));
  },

  async handlePrintSubmit(e, modelId) {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await API.addPrint(modelId, {
        material_id: form.get('material_id') || null,
        successful: e.target.querySelector('[name="successful"]').checked,
        notes: form.get('notes'),
        printed_at: form.get('printed_at'),
      });
      this.toast('Print logged');
      this.closeModal();
      this.renderModelDetail(modelId);
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async deletePrint(printId, modelId) {
    if (!confirm('Delete this print entry?')) return;
    try {
      await API.deletePrint(printId);
      this.toast('Print entry deleted');
      this.renderModelDetail(modelId);
    } catch (e) { this.toast(e.message, 'error'); }
  },

  // ── Settings Items ──
  async addSettingsItem(type) {
    const input = document.getElementById(`add-${type}-input`);
    const name = input?.value?.trim();
    if (!name) return;

    try {
      const data = { name };
      if (type === 'categories') {
        data.color = document.getElementById(`add-${type}-color`)?.value || '#8b5cf6';
      }
      if (type === 'categories') await API.createCategory(data);
      else if (type === 'tags') await API.createTag(data);
      else if (type === 'materials') await API.createMaterial(data);

      this.toast(`${type.slice(0,-1)} added`);
      this.renderSettings();
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async deleteSettingsItem(type, id, name) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      if (type === 'categories') await API.deleteCategory(id);
      else if (type === 'tags') await API.deleteTag(id);
      else if (type === 'materials') await API.deleteMaterial(id);

      this.toast(`${type.slice(0,-1)} deleted`);
      this.renderSettings();
    } catch (e) { this.toast(e.message, 'error'); }
  },
};

// ── Close modal on overlay click ──
document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) App.closeModal();
});

// ── Close modal on Escape ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') App.closeModal();
});

// ── Initialize ──
document.addEventListener('DOMContentLoaded', () => App.init());
