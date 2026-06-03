/* ─── API Client ──────────────────────────────────────────────────────── */
const API = {
  async request(url, options = {}) {
    const csrfToken = localStorage.getItem('pv_csrf_token');
    // Don't even try profile calls if no token is present
    if (url.startsWith('/api/auth/') && !['login', 'register', 'forgot-password', 'reset-password', 'logout'].some(p => url.includes(p)) && !csrfToken) {
      return null;
    }
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const res = await fetch(url, {
      credentials: 'same-origin',
      headers,
      ...options,
    });
    if (res.status === 401) {
      if (url.includes('/api/auth/login')) {
        const err = await res.json().catch(() => ({ error: 'Invalid credentials' }));
        throw new Error(err.error || 'Invalid credentials');
      }
      return null;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  },

  // Auth
  login(username, password) {
    return this.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  },
  logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  },
  register(username, email, password, token = null) {
    return this.request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password, invite_token: token }) });
  },
  getMe() { return this.request('/api/auth/me'); },
  updateProfile(data) {
    return this.request('/api/auth/profile', { method: 'PUT', body: JSON.stringify(data) });
  },
  forgotPassword(email) {
    return this.request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  },
  resetPassword(token, password) {
    return this.request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
  },
  getUsers() { return this.request('/api/users'); },
  inviteUser(email) { return this.request('/api/auth/invite', { method: 'POST', body: JSON.stringify({ email }) }); },

  // Settings
  getSystemSettings() { return this.request('/api/settings/system'); },
  saveSystemSettings(data) { return this.request('/api/settings/system', { method: 'POST', body: JSON.stringify(data) }); },
  getSMTPSettings() { return this.request('/api/settings/smtp'); },
  saveSMTPSettings(data) { return this.request('/api/settings/smtp', { method: 'POST', body: JSON.stringify(data) }); },
  testSMTP(data) { return this.request('/api/settings/smtp/test', { method: 'POST', body: JSON.stringify(data) }); },
  getViewMode() { return this.request('/api/settings/view-mode'); },

  // Library browser
  browseLibrary(browsePath = '') {
    const qs = browsePath ? `?path=${encodeURIComponent(browsePath)}` : '';
    return this.request(`/api/browse${qs}`);
  },
  searchLibrary(q) {
    return this.request(`/api/browse/search?q=${encodeURIComponent(q)}`);
  },
  getFolderTree() { return this.request('/api/browse/tree'); },
  moveItem(source, target) { return this.request('/api/browse/move', { method: 'POST', body: JSON.stringify({ source, target }) }); },
  createFolder(parentPath, folderName) { return this.request('/api/browse/mkdir', { method: 'POST', body: JSON.stringify({ parentPath, folderName }) }); },
  bulkMoveItems(paths, target) { return this.request('/api/browse/bulk-move', { method: 'POST', body: JSON.stringify({ paths, target }) }); },
  bulkDeleteItems(paths) { return this.request('/api/browse/bulk-delete', { method: 'POST', body: JSON.stringify({ paths }) }); },
  bulkTagItems(paths, tags) { return this.request('/api/browse/bulk-tag', { method: 'POST', body: JSON.stringify({ paths, tags }) }); },

  // Models
  getModels(params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v !== '' && v != null)).toString();
    return this.request(`/api/models${qs ? '?' + qs : ''}`);
  },
  getModel(id) { return this.request(`/api/models/${id}`); },
  createModel(data) {
    return this.request('/api/models', { method: 'POST', body: JSON.stringify(data) });
  },
  updateModel(id, data) {
    return this.request(`/api/models/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteModel(id, deleteDisk = false) {
    return this.request(`/api/models/${id}?deleteDisk=${deleteDisk}`, { method: 'DELETE' });
  },
  createVersion(id, data) {
    return this.request(`/api/models/${id}/versions`, { method: 'POST', body: JSON.stringify(data) });
  },
  bulkDeleteModels(ids, deleteDisk = false) {
    return this.request('/api/models/bulk-delete', { method: 'POST', body: JSON.stringify({ ids, deleteDisk }) });
  },
  bulkUpdateModels(ids, data) {
    return this.request('/api/models/bulk-update', { method: 'POST', body: JSON.stringify({ ids, ...data }) });
  },

  // Files
  async uploadFiles(modelId, files, options = {}) {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    if (options.parent_folder) form.append('parent_folder', options.parent_folder);
    if (options.create_subfolder !== undefined) form.append('create_subfolder', options.create_subfolder);
    
    const csrfToken = localStorage.getItem('pv_csrf_token');
    const headers = {};
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const res = await fetch(`/api/models/${modelId}/files`, { method: 'POST', body: form, headers, credentials: 'same-origin' });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Upload failed'); }
    return res.json();
  },
  async uploadThumbnail(modelId, file) {
    const form = new FormData();
    form.append('thumbnail', file);
    const csrfToken = localStorage.getItem('pv_csrf_token');
    const headers = {};
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const res = await fetch(`/api/models/${modelId}/thumbnail`, { method: 'POST', body: form, headers, credentials: 'same-origin' });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Upload failed'); }
    return res.json();
  },
  deleteFile(id, deleteDisk = false) { 
    return this.request(`/api/files/${id}?deleteDisk=${deleteDisk}`, { method: 'DELETE' }); 
  },

  // Prints
  addPrint(modelId, data) {
    return this.request(`/api/models/${modelId}/prints`, { method: 'POST', body: JSON.stringify(data) });
  },
  deletePrint(id) { return this.request(`/api/prints/${id}`, { method: 'DELETE' }); },

  // Categories, Tags, Materials
  getCategories() { return this.request('/api/categories'); },
  createCategory(data) { return this.request('/api/categories', { method: 'POST', body: JSON.stringify(data) }); },
  updateCategory(id, data) { return this.request(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
  deleteCategory(id) { return this.request(`/api/categories/${id}`, { method: 'DELETE' }); },

  getTags() { return this.request('/api/tags'); },
  createTag(data) { return this.request('/api/tags', { method: 'POST', body: JSON.stringify(data) }); },
  deleteTag(id) { return this.request(`/api/tags/${id}`, { method: 'DELETE' }); },

  getMaterials() { return this.request('/api/materials'); },
  createMaterial(data) { return this.request('/api/materials', { method: 'POST', body: JSON.stringify(data) }); },
  deleteMaterial(id) { return this.request(`/api/materials/${id}`, { method: 'DELETE' }); },

  // Projects
  getProjects() { return this.request('/api/projects'); },
  getProject(id) { return this.request(`/api/projects/${id}`); },
  createProject(data) { return this.request('/api/projects', { method: 'POST', body: JSON.stringify(data) }); },
  deleteProject(id) { return this.request(`/api/projects/${id}`, { method: 'DELETE' }); },
  addModelToProject(projectId, modelId) { return this.request(`/api/projects/${projectId}/models`, { method: 'POST', body: JSON.stringify({ model_id: modelId }) }); },
  bulkAddModelsToProject(projectId, modelIds) { return this.request(`/api/projects/${projectId}/models/bulk`, { method: 'POST', body: JSON.stringify({ model_ids: modelIds }) }); },
  removeModelFromProject(projectId, modelId) { return this.request(`/api/projects/${projectId}/models/${modelId}`, { method: 'DELETE' }); },

  // Sharing
  createShare(modelId, expiresDays) { return this.request('/api/shares', { method: 'POST', body: JSON.stringify({ model_id: modelId, expires_days: expiresDays }) }); },
  getSharedModel(slug) { return this.request(`/api/shares/${slug}`); },

  // Stats & System
  getStats() { return this.request('/api/stats'); },
  getUpdateStatus() { return this.request('/api/system/updates'); },
  getSystemLogs() { return this.request('/api/system/logs'); },
  clearSystemLogs() { return this.request('/api/system/logs', { method: 'DELETE' }); },
  getPublicConfig() { return this.request('/api/system/public-config'); }
};
