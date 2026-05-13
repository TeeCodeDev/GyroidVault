/* ─── API Client ──────────────────────────────────────────────────────── */
const API = {
  async request(url, options = {}) {
    const token = localStorage.getItem('pv_token');
    // Don't even try profile calls if no token is present
    if (url.startsWith('/api/auth/') && !['login', 'register', 'forgot-password', 'reset-password'].some(p => url.includes(p)) && !token) {
      return null;
    }
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, {
      headers,
      ...options,
    });
    if (res.status === 401) {
      // Don't throw for 401 on background requests to avoid triggering interceptors
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
  register(username, email, password) {
    return this.request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
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

  // Settings
  getSMTPSettings() { return this.request('/api/settings/smtp'); },
  saveSMTPSettings(data) { return this.request('/api/settings/smtp', { method: 'POST', body: JSON.stringify(data) }); },

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

  // Files
  async uploadFiles(modelId, files) {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    const token = localStorage.getItem('pv_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/models/${modelId}/files`, { method: 'POST', body: form, headers });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Upload failed'); }
    return res.json();
  },
  async uploadThumbnail(modelId, file) {
    const form = new FormData();
    form.append('thumbnail', file);
    const token = localStorage.getItem('pv_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/models/${modelId}/thumbnail`, { method: 'POST', body: form, headers });
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
  removeModelFromProject(projectId, modelId) { return this.request(`/api/projects/${projectId}/models/${modelId}`, { method: 'DELETE' }); },

  // Sharing
  createShare(modelId, expiresDays) { return this.request('/api/shares', { method: 'POST', body: JSON.stringify({ model_id: modelId, expires_days: expiresDays }) }); },
  getSharedModel(slug) { return this.request(`/api/shares/${slug}`); },

  // Stats
  getStats() { return this.request('/api/stats'); },
};
