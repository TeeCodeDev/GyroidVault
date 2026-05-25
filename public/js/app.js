const App = {
  el: null,
  currentUser: null,
  searchTimeout: null,
  cache: { categories: [], tags: [], materials: [], users: [] },
  pendingFiles: [],
  selectedModelIds: [],
  selectedBrowsePaths: [],
  versionInfo: null,
  libraryViewMode: 'grid',

  // ── Init ──
  async init() {
    this.el = document.getElementById('app');
    const savedUser = localStorage.getItem('pv_user');
    if (savedUser) {
      try { this.currentUser = JSON.parse(savedUser); } catch(e) { localStorage.removeItem('pv_user'); }
    }
    
    window.addEventListener('hashchange', () => this.route());
    await this.loadCache();
    await this.loadViewMode();
    this.checkUpdates();
    this.updateUserNav();
    this.updateThemeIcon();
    this.route();
  },

  async checkUpdates() {
    try {
      const info = await API.getUpdateStatus();
      if (info) {
        this.versionInfo = info;
        const verEl = document.getElementById('app-version');
        if (verEl) verEl.textContent = `v${info.currentVersion}`;
        
        if (info.hasUpdate) {
          const badge = document.getElementById('update-badge');
          if (badge) badge.style.display = 'inline-flex';
        }
      }
    } catch(e) { console.warn('Update check failed', e); }
  },

  showUpdateInfo() {
    if (this.versionInfo) {
      this.openModal('Update Available', UI.aboutSection(this.versionInfo));
    }
  },

  toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
    this.updateThemeIcon();
  },

  updateThemeIcon() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    btn.innerHTML = isLight 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
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
        } catch(e) { /* user might not have permissions, just ignore */ }
      }
    } catch (e) { console.error('Cache load failed:', e); }
  },

  async loadViewMode() {
    try {
      const res = await API.getViewMode();
      if (res) this.libraryViewMode = res.library_view_mode || 'grid';
    } catch(e) { /* default to grid */ }
  },

  // ── Routing ──
  route() {
    const hash = location.hash.slice(1) || '/';
    const [path, query] = hash.split('?');
    const params = new URLSearchParams(query || '');

    const links = document.querySelectorAll('.nav-link');
    links.forEach(l => l.classList.remove('active'));
    
    // Clear selection when navigating
    this.selectedModelIds = [];
    this.selectedBrowsePaths = [];
    this.renderBulkBar();
    this.renderBulkBrowseBar();

    if (path === '/' || path === '/dashboard') {
      document.getElementById('nav-dashboard')?.classList.add('active');
      this.renderDashboard();
    } else if (path === '/models') {
      document.getElementById('nav-models')?.classList.add('active');
      this.renderModels(Object.fromEntries(params));
    } else if (path.startsWith('/models/')) {
      document.getElementById('nav-models')?.classList.add('active');
      this.renderModelDetail(path.split('/')[2]);
    } else if (path === '/projects' || path === '/collections') {
      document.getElementById('nav-collections')?.classList.add('active');
      this.renderProjects();
    } else if (path.startsWith('/projects/') || path.startsWith('/collections/')) {
      document.getElementById('nav-collections')?.classList.add('active');
      this.renderProjectDetail(path.split('/')[2]);
    } else if (path.startsWith('/share/')) {
      this.renderSharedModel(path.split('/')[2]);
    } else if (path === '/profile') {
      this.renderProfile();
    } else if (path === '/settings') {
      if (!this.currentUser || this.currentUser.role !== 'admin') {
        this.toast('Admin access required', 'error');
        this.navigate('/');
        return;
      }
      document.getElementById('nav-settings')?.classList.add('active');
      this.renderSettings();
    } else if (path === '/register') {
      this.showRegister(params.get('token') || params.get('invite'));
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
    // check if we should show folder view instead
    if (this.libraryViewMode === 'folder') {
      return this.renderBrowse(params.path || '');
    }

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
    if (params.limit) {
      const limitSelect = document.getElementById('filter-limit');
      if (limitSelect) limitSelect.value = params.limit;
    }

    // Hide scan if not admin
    if (!this.currentUser || this.currentUser.role !== 'admin') {
      const scanBtn = document.getElementById('scan-btn');
      if (scanBtn) scanBtn.style.display = 'none';
    }

    await this.fetchAndRenderModels(params);
  },

  // ─── Folder Browser ─────────────────────────────────────────────────
  async renderBrowse(browsePath = '') {
    this.currentBrowsePath = browsePath;
    const toolbar = UI.toolbar(this.cache.categories, this.cache.tags, this.cache.users);
    this.el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Browse Library</h1><p class="page-subtitle">Explore your files on disk</p></div>
        ${this.currentUser ? '<button class="btn btn-primary" onclick="App.showCreateModel()">+ New Model</button>' : ''}
      </div>
      ${toolbar}
      <div id="browse-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; min-height:36px;"></div>
      <div id="browse-wrapper" style="display:flex;gap:20px;align-items:flex-start">
        <div id="browse-tree" style="min-width:240px"><div class="skeleton" style="width:240px;height:300px;border-radius:8px"></div></div>
        <div id="browse-content" style="flex:1;min-width:0"><div class="model-grid">${'<div class="model-card"><div class="model-card-thumb"><div class="skeleton" style="width:100%;height:100%"></div></div><div class="model-card-body"><div class="skeleton" style="width:70%;height:18px;margin-bottom:8px"></div><div class="skeleton" style="width:40%;height:14px"></div></div></div>'.repeat(6)}</div></div>
      </div>`;

    try {
      // fetch tree and current folder in parallel
      const [tree, data] = await Promise.all([
        API.getFolderTree(),
        API.browseLibrary(browsePath)
      ]);

      // render tree sidebar
      const treeEl = document.getElementById('browse-tree');
      if (treeEl) treeEl.innerHTML = UI.folderTree(tree, browsePath);

      // render header with breadcrumbs, New Folder button, and search
      const headerEl = document.getElementById('browse-header');
      if (headerEl) {
        const fileCount = data.files.filter(f => f.type !== 'image').length;
        headerEl.innerHTML = `
          <div style="flex:1;display:flex;align-items:center;gap:12px">
            ${UI.breadcrumbs(data.currentPath)}
            ${this.currentUser ? `<button class="btn btn-secondary btn-sm" onclick="App.handleCreateFolder('${data.currentPath}')">+ New Folder</button>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:0.85rem;color:var(--text-muted);white-space:nowrap" id="browse-counter">Showing ${data.folders.length} Folders / ${fileCount} Files</span>
            <div style="width:250px">
              <input type="text" id="browse-search" placeholder="Filter this folder..." class="form-input" onkeyup="App.handleBrowseSearch(event)" style="padding:6px 12px; font-size:.9rem;">
            </div>
          </div>
        `;
      }

      // render folder contents
      const container = document.getElementById('browse-content');
      if (!container) return;

      const sortMode = document.getElementById('filter-sort')?.value || 'name';
      if (sortMode === 'name') {
        data.files.sort((a,b) => a.name.localeCompare(b.name));
      } else if (sortMode === 'updated' || sortMode === 'created') {
        data.files.sort((a,b) => (b.mtime || 0) - (a.mtime || 0));
      }

      const foldersHtml = data.folders.map(f => UI.folderCard(f)).join('');
      const filesHtml = data.files.filter(f => f.type !== 'image').map(f => UI.browseFileCard(f)).join('');

      if (!data.folders.length && !data.files.length) {
        container.innerHTML = `
          <div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-text">This folder is empty</div><div class="empty-state-sub">No 3D files or subfolders found here</div></div>`;
        return;
      }

      container.innerHTML = `
        <div class="model-grid">
          ${foldersHtml}
          ${filesHtml}
        </div>`;

      this.renderBulkBrowseBar();

      // trigger STL thumbnail rendering
      if (typeof Viewer !== 'undefined' && Viewer.generateThumbnails) {
        setTimeout(() => Viewer.generateThumbnails(), 50);
      }
    } catch(e) {
      console.error(e);
      const container = document.getElementById('browse-content');
      if (container) container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load folder</div></div>';
    }
  },

  browseTo(folderPath) {
    this.navigate(`/models?path=${encodeURIComponent(folderPath)}`);
  },

  handleBrowseSearch(e) {
    const q = e.target.value;
    clearTimeout(this.browseSearchTimeout);
    this.browseSearchTimeout = setTimeout(async () => {
      const container = document.getElementById('browse-content');
      if (!container) return;
      
      container.innerHTML = '<div class="model-grid">' + '<div class="model-card"><div class="model-card-thumb"><div class="skeleton" style="width:100%;height:100%"></div></div><div class="model-card-body"><div class="skeleton" style="width:70%;height:18px;margin-bottom:8px"></div><div class="skeleton" style="width:40%;height:14px"></div></div></div>'.repeat(6) + '</div>';
      
      try {
        const data = q ? await API.searchLibrary(q) : await API.browseLibrary(new URLSearchParams(location.hash.split('?')[1]).get('path') || '');
        
        // Filter based on toolbar settings
        const sortMode = document.getElementById('filter-sort')?.value || 'name';
        if (sortMode === 'name') {
          data.files.sort((a,b) => a.name.localeCompare(b.name));
        } else if (sortMode === 'updated' || sortMode === 'created') {
          data.files.sort((a,b) => (b.mtime || 0) - (a.mtime || 0));
        }

        const foldersHtml = data.folders.map(f => UI.folderCard(f)).join('');
        const filesHtml = data.files.filter(f => f.type !== 'image').map(f => UI.browseFileCard(f)).join('');
        
        if (!data.folders.length && !data.files.length) {
          container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">No matches found</div></div>`;
          return;
        }
        
        container.innerHTML = `<div class="model-grid">${foldersHtml}${filesHtml}</div>`;
        this.renderBulkBrowseBar();
        if (typeof Viewer !== 'undefined' && Viewer.generateThumbnails) setTimeout(() => Viewer.generateThumbnails(), 50);
      } catch(err) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Search failed</div></div>';
      }
    }, 400);
  },

  handleDragStart(e, itemPath) {
    e.dataTransfer.setData('text/plain', itemPath);
    e.dataTransfer.effectAllowed = 'move';

    const dragIcon = document.createElement('div');
    dragIcon.style.position = 'absolute';
    dragIcon.style.top = '-1000px';
    dragIcon.style.background = 'var(--accent-cyan)';
    dragIcon.style.color = '#fff';
    dragIcon.style.padding = '6px 12px';
    dragIcon.style.borderRadius = '20px';
    dragIcon.style.fontWeight = 'bold';
    dragIcon.style.fontSize = '12px';
    dragIcon.style.boxShadow = '0 4px 8px rgba(0,0,0,0.5)';
    dragIcon.style.pointerEvents = 'none';
    dragIcon.innerText = itemPath.split('/').pop();
    
    document.body.appendChild(dragIcon);
    e.dataTransfer.setDragImage(dragIcon, 10, 10);
    setTimeout(() => dragIcon.remove(), 100);
  },

  async handleDrop(e, targetFolderPath) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    const sourceItemPath = e.dataTransfer.getData('text/plain');
    if (!sourceItemPath || sourceItemPath === targetFolderPath) return;
    
    try {
      await API.moveItem(sourceItemPath, targetFolderPath);
      this.toast('Moved successfully');
      this.renderBrowse(this.currentBrowsePath);
    } catch(err) {
      this.toast(err.message, 'error');
    }
  },

  async handleCreateFolder(parentPath) {
    const name = prompt('Enter new folder name:');
    if (!name) return;
    try {
      await API.createFolder(parentPath, name);
      this.toast('Folder created');
      this.renderBrowse(this.currentBrowsePath);
    } catch(err) {
      this.toast(err.message, 'error');
    }
  },

  async fetchAndRenderModels(params = {}) {
    try {
      const response = await API.getModels(params);
      
      // Handle the new paginated response format or fallback to array
      const models = Array.isArray(response) ? response : (response.models || []);
      const totalPages = response.totalPages || 1;
      const currentPage = response.currentPage || 1;

      const grid = document.getElementById('models-grid');
      if (!grid) return;
      if (!models.length) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">No models found</div><div class="empty-state-sub">Create your first model to get started</div></div>';
        return;
      }
      
      grid.innerHTML = `
        <div class="model-grid">${models.map(m => UI.modelCard(m)).join('')}</div>
        ${UI.pagination(totalPages, currentPage)}
      `;
      this.renderBulkBar();
      if (typeof Viewer !== 'undefined' && Viewer.generateThumbnails) {
        setTimeout(() => Viewer.generateThumbnails(), 50);
      }
    } catch (e) {
      console.error(e);
      document.getElementById('models-grid').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load models</div></div>';
    }
  },

  renderBulkBar() {
    let bar = document.getElementById('bulk-action-bar-container');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bulk-action-bar-container';
      document.body.appendChild(bar);
    }
    bar.innerHTML = UI.bulkActionBar(this.selectedModelIds.length);
  },

  toggleModelSelection(e, id) {
    if (e) e.stopPropagation();
    const idx = this.selectedModelIds.indexOf(id);
    if (idx > -1) this.selectedModelIds.splice(idx, 1);
    else this.selectedModelIds.push(id);
    
    // Update UI without full re-render
    const card = document.querySelector(`.model-card[data-model-id="${id}"]`);
    if (card) card.classList.toggle('selected');
    this.renderBulkBar();
  },

  handleModelCardClick(e, id) {
    if (this.selectedModelIds.length > 0) {
      this.toggleModelSelection(e, id);
    } else {
      this.navigate(`/models/${id}`);
    }
  },

  clearSelection() {
    this.selectedModelIds = [];
    document.querySelectorAll('.model-card.selected').forEach(c => c.classList.remove('selected'));
    this.renderBulkBar();
  },

  selectAll() {
    const cards = document.querySelectorAll('.model-card');
    this.selectedModelIds = Array.from(cards).map(c => Number(c.dataset.modelId));
    cards.forEach(c => c.classList.add('selected'));
    this.renderBulkBar();
  },

  openBulkDelete() { this.openModal('Bulk Delete', UI.bulkDeleteForm(this.selectedModelIds.length)); },
  async handleBulkDelete(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.bulkDeleteModels(this.selectedModelIds, fd.get('delete_disk') === 'on');
      this.toast(`Deleted ${this.selectedModelIds.length} models`);
      this.clearSelection();
      this.closeModal();
      this.route();
    } catch(e) { this.toast(e.message, 'error'); }
  },

  openBulkMove() { this.openModal('Move to Category', UI.bulkMoveForm(this.cache.categories)); },
  async handleBulkMove(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.bulkUpdateModels(this.selectedModelIds, { category_id: fd.get('category_id') });
      this.toast(`Moved ${this.selectedModelIds.length} models`);
      this.clearSelection();
      this.closeModal();
      this.route();
    } catch(e) { this.toast(e.message, 'error'); }
  },

  async openBulkAddToCollection() {
    const projects = await API.getProjects();
    this.openModal('Add to Collection', UI.bulkCollectionForm(projects));
  },
  async handleBulkAddToCollectionSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.bulkAddModelsToProject(fd.get('project_id'), this.selectedModelIds);
      this.toast(`Added ${this.selectedModelIds.length} models to collection`);
      this.clearSelection();
      this.closeModal();
    } catch(e) { this.toast(e.message, 'error'); }
  },

  renderBulkBrowseBar() {
    let bar = document.getElementById('bulk-browse-action-bar-container');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bulk-browse-action-bar-container';
      document.body.appendChild(bar);
    }
    
    // Check if all rendered items are selected
    const allCards = document.querySelectorAll('#browse-content .model-card');
    const allPaths = Array.from(allCards).map(c => c.dataset.path).filter(Boolean);
    const isAllSelected = allPaths.length > 0 && allPaths.every(p => this.selectedBrowsePaths.includes(p));

    bar.innerHTML = UI.bulkBrowseActionBar(this.selectedBrowsePaths.length, isAllSelected);
  },

  toggleBrowseSelection(path) {
    const idx = this.selectedBrowsePaths.indexOf(path);
    if (idx > -1) this.selectedBrowsePaths.splice(idx, 1);
    else this.selectedBrowsePaths.push(path);
    
    // Update UI without full re-render
    const escapedPath = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const card = document.querySelector(`.model-card[data-path="${escapedPath}"]`);
    if (card) card.classList.toggle('selected');
    this.renderBulkBrowseBar();
  },

  clearBrowseSelection() {
    this.selectedBrowsePaths = [];
    document.querySelectorAll('#browse-content .model-card.selected').forEach(c => c.classList.remove('selected'));
    this.renderBulkBrowseBar();
  },

  toggleBrowseSelectAll() {
    const allCards = document.querySelectorAll('#browse-content .model-card');
    const allPaths = Array.from(allCards).map(c => c.dataset.path).filter(Boolean);
    
    const isAllSelected = allPaths.length > 0 && allPaths.every(p => this.selectedBrowsePaths.includes(p));
    
    if (isAllSelected) {
      // Deselect only the currently rendered ones
      this.selectedBrowsePaths = this.selectedBrowsePaths.filter(p => !allPaths.includes(p));
      allCards.forEach(c => c.classList.remove('selected'));
    } else {
      // Select all rendered ones
      allPaths.forEach(p => {
        if (!this.selectedBrowsePaths.includes(p)) this.selectedBrowsePaths.push(p);
      });
      allCards.forEach(c => c.classList.add('selected'));
    }
    this.renderBulkBrowseBar();
  },

  openBulkBrowseMove() {
    this.openModal('Move Items', UI.bulkBrowseMoveForm());
  },
  
  async handleBulkBrowseMoveSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.bulkMoveItems(this.selectedBrowsePaths, fd.get('target_path'));
      this.toast(`Moved ${this.selectedBrowsePaths.length} items`);
      this.clearBrowseSelection();
      this.closeModal();
      this.renderBrowse(this.currentBrowsePath);
    } catch(err) { this.toast(err.message, 'error'); }
  },

  openBulkBrowseDelete() {
    this.openModal('Bulk Delete', UI.bulkBrowseDeleteForm(this.selectedBrowsePaths.length));
  },

  async handleBulkBrowseDeleteSubmit(e) {
    e.preventDefault();
    try {
      await API.bulkDeleteItems(this.selectedBrowsePaths);
      this.toast(`Deleted ${this.selectedBrowsePaths.length} items`);
      this.clearBrowseSelection();
      this.closeModal();
      this.renderBrowse(this.currentBrowsePath);
    } catch(err) { this.toast(err.message, 'error'); }
  },

  openBulkBrowseTag() {
    this.openModal('Bulk Tag Items', UI.bulkBrowseTagForm(this.cache.tags));
  },

  async handleBulkBrowseTagSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const selectedTags = fd.getAll('tags');
    const inlineTagInput = document.getElementById('new-bulk-tag-input');
    
    let tagsToApply = [...selectedTags];
    if (inlineTagInput && inlineTagInput.value.trim()) {
      const inlineTags = inlineTagInput.value.split(',').map(t => t.trim()).filter(Boolean);
      tagsToApply = tagsToApply.concat(inlineTags);
    }
    
    if (tagsToApply.length === 0) {
      this.toast('Please select or enter at least one tag', 'error');
      return;
    }
    
    try {
      await API.bulkTagItems(this.selectedBrowsePaths, tagsToApply);
      this.toast(`Tagged ${this.selectedBrowsePaths.length} items`);
      this.clearBrowseSelection();
      this.closeModal();
      // Tagging might not immediately reflect in folder view without a backend rescan or re-fetch, but re-render is safe
      this.renderBrowse(this.currentBrowsePath);
    } catch(err) { this.toast(err.message, 'error'); }
  },

  handleSearch(val) {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.handleFilter(), 300);
  },

  handleFilter() {
    const params = new URLSearchParams();
    const search = document.getElementById('search-input')?.value;
    const category = document.getElementById('filter-category')?.value;
    const tag = document.getElementById('filter-tag')?.value;
    const user = document.getElementById('filter-user')?.value;
    const printed = document.getElementById('filter-printed')?.value;
    const sort = document.getElementById('filter-sort')?.value;
    const limit = document.getElementById('filter-limit')?.value;

    if (search) params.set('search', search);
    if (category) params.set('category', category);
    if (tag) params.set('tag', tag);
    if (user) params.set('user', user);
    if (printed) params.set('printed', printed);
    if (sort && sort !== 'updated') params.set('sort', sort);
    if (limit && limit !== '24') params.set('limit', limit);
    params.set('page', '1');

    if (this.libraryViewMode === 'folder') {
      this.renderBrowse(this.currentBrowsePath);
    } else {
      window.location.hash = `/models?${params.toString()}`;
    }
  },

  goToPage(pageNumber) {
    const params = new URLSearchParams();
    const search = document.getElementById('search-input')?.value;
    const category = document.getElementById('filter-category')?.value;
    const tag = document.getElementById('filter-tag')?.value;
    const user = document.getElementById('filter-user')?.value;
    const printed = document.getElementById('filter-printed')?.value;
    const sort = document.getElementById('filter-sort')?.value;
    const limit = document.getElementById('filter-limit')?.value;

    if (search) params.set('search', search);
    if (category) params.set('category', category);
    if (tag) params.set('tag', tag);
    if (user) params.set('user', user);
    if (printed) params.set('printed', printed);
    if (sort && sort !== 'updated') params.set('sort', sort);
    if (limit && limit !== '24') params.set('limit', limit);
    params.set('page', pageNumber);

    window.location.hash = `/models?${params.toString()}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ── Auth ──
  showLogin() { this.openModal('Login', UI.loginForm()); },
  showRegister(token = '') { this.openModal('Register', UI.registerForm(token)); },
  showForgotPassword() { this.openModal('Reset Password', UI.forgotPasswordForm()); },
  showResetPassword(token) { if (token) this.openModal('Choose New Password', UI.resetPasswordForm(token)); },
  
  async handleLogin(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await API.login(fd.get('username'), fd.get('password'));
      if (!res || !res.token) {
        this.toast('Invalid username or password', 'error');
        return;
      }
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
      await API.register(fd.get('username'), fd.get('email'), fd.get('password'), fd.get('token'));
      this.toast('Registration successful! Please login.');
      this.showLogin();
    } catch(e) { this.toast(e.message, 'error'); }
  },

  async handleInviteUser(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    const fd = new FormData(e.target);
    try {
      await API.inviteUser(fd.get('email'));
      this.toast('Invitation sent successfully', 'success');
      e.target.reset();
    } catch(err) {
      this.toast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Invite'; }
    }
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
  
  async handleSaveSystemSettings(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    try {
      await API.saveSystemSettings(data);
      await this.loadViewMode(); // refresh the cached view mode
      this.toast('System settings saved');
    } catch(e) { this.toast(e.message, 'error'); }
  },
  
  async testSMTP(e) {
    if (e) e.preventDefault();
    const btn = e?.target;
    
    // First, save current settings so we test what is on screen
    const form = btn.closest('form');
    if (form) {
      try {
        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());
        await API.saveSMTPSettings(data);
      } catch(e) { 
        return this.toast('Failed to save settings before test: ' + e.message, 'error'); 
      }
    }
    
    this.openModal('Test SMTP Connection', UI.smtpTestModal(this.currentUser?.email || ""));
  },

  async handleSendTestEmail(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('test_email');
    const btn = document.getElementById('send-test-btn');

    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    try {
      await API.testSMTP({ email });
      this.toast('Test email sent successfully! Check your inbox.', 'success');
      this.closeModal();
    } catch(e) { 
      this.toast(e.message, 'error'); 
      if (btn) { btn.disabled = false; btn.textContent = 'Send Test'; }
    }
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
    const wrapper = document.getElementById('nav-login-wrapper');
    if (!wrapper) return;
    if (this.currentUser) {
      wrapper.innerHTML = `
        <div class="dropdown">
          <button class="btn btn-ghost" style="display:flex;align-items:center;gap:8px;padding:8px 12px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>${this.currentUser.username}</span>
          </button>
          <div class="dropdown-content" style="right: 0">
            <div class="dropdown-header">${this.currentUser.role.toUpperCase()} ACCOUNT</div>
            <a href="#/profile">Edit Profile</a>
            <a href="#" onclick="event.preventDefault();App.handleLogout()">Log Out</a>
          </div>
        </div>`;
    } else {
      wrapper.innerHTML = `
        <button class="btn btn-ghost" onclick="App.showLogin()" style="display:flex;align-items:center;gap:8px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          <span>Login</span>
        </button>`;
    }
  },

  async renderProfile() {
    if (!this.currentUser) return this.navigate('/');
    this.el.innerHTML = UI.profilePage(this.currentUser);
  },

  // ─── Collections ────────────────────────────────────────────────────────
  async renderProjects() {
    if (!this.currentUser) {
      this.el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔐</div><div class="empty-state-text">Login to view collections</div><div class="empty-state-sub">Collections are private and require an account</div><button class="btn btn-primary btn-sm" onclick="App.showLogin()" style="margin-top:16px">Login</button></div>';
      return;
    }
    this.el.innerHTML = '<div class="skeleton-grid"></div>';
    try {
      const projects = await API.getProjects();
      this.el.innerHTML = UI.projectsPage(projects);
    } catch (e) { this.toast('Failed to load collections', 'error'); }
  },

  async renderProjectDetail(id) {
    this.el.innerHTML = '<div class="skeleton-grid"></div>';
    try {
      const project = await API.getProject(id);
      this.el.innerHTML = UI.projectDetail(project);
      if (typeof Viewer !== 'undefined' && Viewer.generateThumbnails) {
        setTimeout(() => Viewer.generateThumbnails(), 50);
      }
    } catch (e) { this.toast('Failed to load collection', 'error'); }
  },

  showCreateProject() {
    this.openModal('New Collection', UI.projectForm());
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
        this.toast('Collection created');
        this.closeModal();
        this.renderProjects();
      }
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async deleteProject(id) {
    if (!confirm('Are you sure you want to delete this collection? Models will not be deleted.')) return;
    try {
      await API.deleteProject(id);
      this.toast('Collection deleted');
      this.navigate('/collections');
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async addToProject(modelId) {
    const projects = await API.getProjects();
    if (!projects.length) {
      if (confirm('No collections found. Create one now?')) this.showCreateProject();
      return;
    }
    const html = `
      <div class="form-grid">
        <label>Select Collection</label>
        <select id="project-select" class="form-input">
          ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
        <button class="btn btn-primary" onclick="App.handleAddToProject(${modelId})" style="margin-top:16px;width:100%">Add to Collection</button>
      </div>`;
    this.openModal('Add to Collection', html);
  },

  async handleAddToProject(modelId) {
    const projectId = document.getElementById('project-select').value;
    try {
      await API.addModelToProject(projectId, modelId);
      this.toast('Added to collection');
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
    if (input) {
      this.copyToClipboard(input.value, 'Link copied to clipboard');
    }
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
        ${UI.modelDetail(model)}`;
      // Initialize 3D viewer if STL or 3MF file exists (prefer STL as it's more stable)
      const files = model.files || [];
      const stlFile = files.find(f => f.file_type === 'stl') || files.find(f => f.file_type === '3mf');
      if (stlFile && typeof Viewer !== 'undefined') {
        const stlUrl = `${stlFile.url || '/uploads/'+stlFile.filename}?t=${Date.now()}`;
        setTimeout(async () => {
          const v = Viewer.create(`stl-viewer-${model.id}`, stlUrl, stlFile.file_type);
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

  previewFileModal(url, name) {
    if (typeof Viewer === 'undefined') return;
    const modalHtml = `
      <div class="modal fade show" tabindex="-1" role="dialog" style="display:block;background:rgba(0,0,0,0.85);backdrop-filter:blur(4px)" onclick="App.closePreviewFileModal(event)">
        <div class="modal-dialog modal-xl" role="document" style="margin:4vh auto;height:92vh;max-width:96vw" onclick="event.stopPropagation()">
          <div class="modal-content" style="height:100%;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;overflow:hidden">
            <div class="modal-header" style="padding:12px 20px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
              <h5 class="modal-title" style="margin:0;color:var(--text-primary)">${name}</h5>
              <button type="button" class="btn btn-ghost btn-sm" onclick="App.closePreviewFileModal(event)" style="font-size:1.2rem;padding:0 8px">✕</button>
            </div>
            <div class="modal-body" style="padding:0;height:calc(100% - 55px);position:relative">
              <div id="full-preview-viewer" style="width:100%;height:100%">
                <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted)">Loading 3D Viewer...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const container = document.createElement('div');
    container.id = 'preview-modal-container';
    container.innerHTML = modalHtml;
    document.body.appendChild(container);
    
    this.previewKeyHandler = (e) => { if (e.key === 'Escape') this.closePreviewFileModal(); };
    document.addEventListener('keydown', this.previewKeyHandler);
    
    setTimeout(() => {
      Viewer.create('full-preview-viewer', url, name.toLowerCase().endsWith('.3mf') ? '3mf' : 'stl');
    }, 100);
  },

  closePreviewFileModal(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (typeof Viewer !== 'undefined') Viewer.cleanup();
    const el = document.getElementById('preview-modal-container');
    if (el) el.remove();
    if (this.previewKeyHandler) {
      document.removeEventListener('keydown', this.previewKeyHandler);
      this.previewKeyHandler = null;
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
        ${this.currentUser?.role === 'admin' ? '<button class="tab-btn" data-tab="system" style="background:none;border:none;color:var(--text-secondary);padding:10px 20px;cursor:pointer;font-weight:600;border-bottom:2px solid transparent;transition:all .2s">System</button>' : ''}
        ${this.currentUser?.role === 'admin' ? '<button class="tab-btn" data-tab="smtp" style="background:none;border:none;color:var(--text-secondary);padding:10px 20px;cursor:pointer;font-weight:600;border-bottom:2px solid transparent;transition:all .2s">SMTP & Mail</button>' : ''}
        ${this.currentUser?.role === 'admin' ? '<button class="tab-btn" data-tab="users" style="background:none;border:none;color:var(--text-secondary);padding:10px 20px;cursor:pointer;font-weight:600;border-bottom:2px solid transparent;transition:all .2s">Users</button>' : ''}
        <button class="tab-btn" data-tab="about" style="background:none;border:none;color:var(--text-secondary);padding:10px 20px;cursor:pointer;font-weight:600;border-bottom:2px solid transparent;transition:all .2s">About</button>
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
          content.innerHTML = `<div class="settings-grid">${UI.settingsPanel('Categories', cats, 'categories')}</div>`;
        } else if (tab === 'tags') {
          const tags = await API.getTags();
          content.innerHTML = `<div class="settings-grid">${UI.settingsPanel('Tags', tags, 'tags')}</div>`;
        } else if (tab === 'materials') {
          const mats = await API.getMaterials();
          content.innerHTML = `<div class="settings-grid">${UI.settingsPanel('Materials', mats, 'materials')}</div>`;
        } else if (tab === 'smtp') {
          const config = await API.getSMTPSettings();
          content.innerHTML = `
            <div class="glass-panel">
              <div class="panel-header"><div class="panel-title">SMTP Mail Configuration</div></div>
              <div class="panel-body">${UI.smtpSettingsForm(config)}</div>
            </div>`;
        } else if (tab === 'system') {
          const config = await API.getSystemSettings();
          const logs = await API.getSystemLogs();
          content.innerHTML = `
            <div class="glass-panel" style="margin-bottom:24px">
              <div class="panel-header"><div class="panel-title">System Settings</div></div>
              <div class="panel-body">${UI.systemSettingsForm(config)}</div>
            </div>
            <div class="glass-panel">
              <div class="panel-header">
                <div class="panel-title">System Logs</div>
                <button class="btn btn-ghost btn-xs" onclick="App.handleClearLogs()" style="color:var(--error)">Clear Logs</button>
              </div>
              <div class="panel-body no-pad">
                <div id="system-logs-list" style="max-height:400px;overflow-y:auto;font-family:monospace;font-size:.75rem">
                  ${logs.length ? logs.map(l => `
                    <div style="padding:8px 16px;border-bottom:1px solid var(--border);display:flex;gap:12px;${l.level === 'warning' ? 'background:rgba(245,158,11,0.05);' : ''}">
                      <span style="color:var(--text-muted);white-space:nowrap">${new Date(l.created_at).toLocaleString()}</span>
                      <span style="color:var(--accent-${l.level === 'warning' ? 'pink' : 'cyan'});font-weight:700;width:60px">[${l.level.toUpperCase()}]</span>
                      <span style="color:var(--text-secondary)">${l.message}</span>
                    </div>
                  `).join('') : '<div style="padding:20px;text-align:center;color:var(--text-muted)">No logs available</div>'}
                </div>
              </div>
            </div>`;
        } else if (tab === 'users') {
          const users = await API.getUsers();
          content.innerHTML = `
            <div class="glass-panel" style="margin-bottom:20px">
              <div class="panel-header"><div class="panel-title">Invite User</div></div>
              <div class="panel-body">
                <form onsubmit="App.handleInviteUser(event)" style="display:flex;gap:10px">
                  <input type="email" name="email" required placeholder="Email address to invite" class="form-input" style="max-width:300px">
                  <button type="submit" class="btn btn-primary">Send Invite</button>
                </form>
              </div>
            </div>
            <div class="glass-panel">
              <div class="panel-header"><div class="panel-title">User Management</div></div>
              <div class="panel-body">
                <table style="width:100%;border-collapse:collapse;font-size:.9rem">
                  <thead><tr style="text-align:left;color:var(--text-muted);border-bottom:1px solid var(--border)"><th style="padding:12px">ID</th><th style="padding:12px">Username</th><th style="padding:12px">Email</th><th style="padding:12px">Role</th></tr></thead>
                  <tbody>${users.map(u => `<tr style="border-bottom:1px solid var(--border);color:var(--text-secondary)"><td style="padding:12px">${u.id}</td><td style="padding:12px;font-weight:600">${u.username}</td><td style="padding:12px">${u.email || '-'}</td><td style="padding:12px"><span class="badge badge-${u.role === 'admin' ? 'purple' : 'cyan'}">${u.role}</span></td></tr>`).join('')}</tbody>
                </table>
              </div>
            </div>`;
        } else if (tab === 'about') {
          content.innerHTML = UI.aboutSection(this.versionInfo || { currentVersion: '1.0.0' });
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
    let formHtml = UI.modelForm(null, this.cache.categories, this.cache.tags);
    
    if (this.libraryViewMode === 'folder' && this.currentBrowsePath) {
      const folderOptionsHtml = `
        <div class="form-group">
          <input type="hidden" name="parent_folder" value="${this.currentBrowsePath}">
          <label><input type="checkbox" name="create_subfolder" value="true" checked> Create subfolder for this model</label>
        </div>
      `;
      // Inject before form-actions
      formHtml = formHtml.replace('<div class="form-actions">', folderOptionsHtml + '<div class="form-actions">');
    }
    
    this.openModal('New Model', formHtml);
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
    const MAX_SIZE = 500 * 1024 * 1024; // 500MB
    const validFiles = [];
    for (const f of files) {
      if (f.size > MAX_SIZE) {
        this.toast(`File "${f.name}" exceeds the 500MB size limit.`, 'error');
      } else {
        validFiles.push(f);
      }
    }
    if (validFiles.length) {
      this.pendingFiles.push(...validFiles);
      this.renderPendingFiles();
    }
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

  addInlineTag() {
    const input = document.getElementById('new-tag-input');
    const container = document.getElementById('model-tags-container');
    if (!input || !container) return;
    const val = input.value.trim();
    if (!val) return;
    
    const label = document.createElement('label');
    label.className = 'tag-pill-checkbox';
    // Use a prefix to identify it as a new tag string rather than an ID
    label.innerHTML = `
      <input type="checkbox" name="tags" value="NEW:${val}" checked> 
      <span class="tag-pill new">${val}</span>`;
    container.appendChild(label);
    input.value = '';
    input.focus();
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
    const tags = Array.from(e.target.querySelectorAll('input[name="tags"]:checked')).map(c => {
      if (c.value.startsWith('NEW:')) return c.value.substring(4);
      return parseInt(c.value);
    });
    const data = {
      name: form.get('name'),
      description: form.get('description'),
      print_tips: form.get('print_tips'),
      source_url: form.get('source_url'),
      category_id: form.get('category_id') || null,
      tags,
    };
    
    if (form.has('parent_folder')) {
      data.parent_folder = form.get('parent_folder');
    }
    if (form.has('create_subfolder')) {
      data.create_subfolder = form.get('create_subfolder') === 'true';
    }

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
            const uploadOpts = {
              parent_folder: data.parent_folder,
              create_subfolder: data.create_subfolder
            };
            await API.uploadFiles(model.id, this.pendingFiles, uploadOpts);
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

  confirmDeleteModel(id, name) {
    if (!this.currentUser) return;
    this.openModal('Delete Model', UI.deleteModelForm(id, name));
  },

  async handleDeleteModel(e, id) {
    e.preventDefault();
    const form = new FormData(e.target);
    const deleteDisk = form.get('delete_disk') === 'on';
    try {
      await API.deleteModel(id, deleteDisk);
      this.toast('Model deleted');
      this.closeModal();
      this.navigate('/models');
    } catch (err) { this.toast(err.message, 'error'); }
  },

  copyToClipboard(text, message = 'Copied') {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => this.toast(message));
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
        this.toast(message);
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
    const MAX_SIZE = 500 * 1024 * 1024; // 500MB
    const tooLarge = files.find(f => f.size > MAX_SIZE);
    if (tooLarge) {
      this.toast(`File "${tooLarge.name}" exceeds the 500MB size limit.`, 'error');
      return;
    }
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

  confirmDeleteFile(fileId, filename, modelId) {
    this.openModal('Delete File', UI.deleteFileForm(fileId, filename, modelId));
  },

  async handleDeleteFile(e, fileId, modelId) {
    e.preventDefault();
    const form = new FormData(e.target);
    const deleteDisk = form.get('delete_disk') === 'on';
    try {
      await API.deleteFile(fileId, deleteDisk);
      this.toast('File deleted');
      this.closeModal();
      this.renderModelDetail(modelId);
    } catch (err) { this.toast(err.message, 'error'); }
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
      await this.loadCache();
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
      await this.loadCache();
      this.renderSettings();
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async handleClearLogs() {
    if (!confirm('Clear all system logs?')) return;
    try {
      await API.clearSystemLogs();
      this.toast('Logs cleared');
      this.switchSettingsTab('system');
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async switchSettingsTab(tab) {
    const tabs = document.querySelectorAll('.settings-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    // Trigger the switch logic already defined in renderSettings
    const activeTab = Array.from(tabs).find(t => t.dataset.tab === tab);
    if (activeTab) activeTab.click();
  }
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
