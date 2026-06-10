/* ─── UI Components ───────────────────────────────────────────────────── */
const UI = {
  // Gradient generator based on string hash
  gradient(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    const h1 = Math.abs(h % 360), h2 = (h1 + 40) % 360;
    return `linear-gradient(135deg, hsl(${h1},70%,25%), hsl(${h2},60%,15%))`;
  },

  formatSize(bytes) {
    if (!bytes) return '0 B';
    const u = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  },

  formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  formatDateShort(d) {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  fileTypeIcon(type) {
    const icons = {
      stl: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
      gcode: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12H9"></path><path d="M15 9H9"></path><path d="M12 15H9"></path></svg>',
      image: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
      '3mf': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>',
      step: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11.5 2.1-4.8 1.4c-.6.2-1 .6-1.1 1.2l-.7 4.2c-.1.5.1 1 .5 1.3l3.2 2.7c.4.3.9.4 1.4.2l4.8-1.4c.6-.2 1-.6 1.1-1.2l.7-4.2c.1-.5-.1-1-.5-1.3L12.9 2.3c-.4-.3-.9-.4-1.4-.2Z"></path><path d="M6 15v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"></path><path d="m12 11 4 3"></path><path d="m12 11-4 3"></path><path d="M12 11v6"></path></svg>',
      obj: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>'
    };
    const icon = icons[type] || `<span style="font-size:.65rem">${type.toUpperCase().substring(0,3)}</span>`;
    return `<div class="file-icon ${type}">${icon}</div>`;
  },

  // dashboard stats 
  statsCards(stats) {
    return `<div class="stats-grid">
      <div class="stat-card"><div class="stat-icon cyan">📦</div><div class="stat-value">${stats.totalModels}</div><div class="stat-label">Total Models</div></div>
      <div class="stat-card"><div class="stat-icon green">✅</div><div class="stat-value">${stats.printedModels}</div><div class="stat-label">Printed Models</div></div>
      <div class="stat-card"><div class="stat-icon purple">🎯</div><div class="stat-value">${stats.successRate}%</div><div class="stat-label">Success Rate</div></div>
      <div class="stat-card"><div class="stat-icon pink">📁</div><div class="stat-value">${stats.totalFiles}</div><div class="stat-label">Total Files (${this.formatSize(stats.totalSize)})</div></div>
    </div>`;
  },
  // breadcrumb nav for folder browser
  breadcrumbs(currentPath) {
    const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];
    let crumbs = `<a href="#" onclick="event.preventDefault();App.browseTo('')" style="color:var(--accent-cyan);text-decoration:none;font-weight:600">🏠 Home</a>`;
    
    let accumulated = '';
    for (let i = 0; i < parts.length; i++) {
      accumulated += (accumulated ? '/' : '') + parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        crumbs += ` <span style="color:var(--text-muted);margin:0 6px">›</span> <span style="color:var(--text-primary);font-weight:600">${parts[i]}</span>`;
      } else {
        const pathCopy = accumulated;
        crumbs += ` <span style="color:var(--text-muted);margin:0 6px">›</span> <a href="#" onclick="event.preventDefault();App.browseTo('${pathCopy}')" style="color:var(--accent-cyan);text-decoration:none">${parts[i]}</a>`;
      }
    }
    
    return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;padding:0;font-size:.9rem">${crumbs}</div>`;
  },

  // sidebar tree for folder browser
  folderTree(nodes, activePath = '') {
    function renderNode(node, depth = 0) {
      const isActive = activePath === node.path;
      const isParent = activePath.startsWith(node.path + '/');
      const isOpen = isActive || isParent;
      const hasChildren = node.children && node.children.length > 0;
      const indent = depth * 16;
      
      const arrow = hasChildren 
        ? `<span style="display:inline-block;width:14px;font-size:10px;transition:transform .2s;transform:rotate(${isOpen ? '90' : '0'}deg);cursor:pointer" onclick="event.stopPropagation();const childDiv = this.parentElement.nextElementSibling; if(childDiv && childDiv.classList.contains('tree-children')) { childDiv.classList.toggle('collapsed'); childDiv.style.display = childDiv.style.display === 'none' ? 'block' : 'none'; } this.style.transform=this.style.transform.includes('90')?'rotate(0deg)':'rotate(90deg)'">▶</span>`
        : `<span style="display:inline-block;width:14px"></span>`;
      
      let html = `<div class="tree-node" style="padding:4px 8px 4px ${8 + indent}px;cursor:pointer;border-radius:4px;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isActive ? 'background:var(--accent-cyan);background:rgba(0,212,255,0.15);color:var(--accent-cyan);font-weight:600' : 'color:var(--text-secondary)'}" onclick="App.browseTo('${node.path}')" title="${node.name}" ondragover="event.preventDefault(); this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="App.handleDrop(event, '${node.path}')">
        ${arrow} 📁 ${node.name}
      </div>`;
      
      if (hasChildren) {
        const childrenHtml = node.children.map(c => renderNode(c, depth + 1)).join('');
        html += `<div class="tree-children ${isOpen ? '' : 'collapsed'}" style="${isOpen ? '' : 'display:none'}">${childrenHtml}</div>`;
      }
      return html;
    }
    
    // root item
    const isRootActive = activePath === '';
    let html = `<div class="tree-node" style="padding:4px 8px;cursor:pointer;border-radius:4px;font-size:.8rem;font-weight:600;${isRootActive ? 'background:rgba(0,212,255,0.15);color:var(--accent-cyan)' : 'color:var(--text-secondary)'}" onclick="App.browseTo('')" ondragover="event.preventDefault(); this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="App.handleDrop(event, '')">
      🏠 Library Root
    </div>`;
    
    html += nodes.map(n => renderNode(n, 0)).join('');
    
    return `<div class="folder-tree-sidebar" style="width:25%;min-width:260px;max-width:500px;resize:horizontal;max-height:calc(100vh - 200px);overflow-y:auto;overflow-x:hidden;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:8px 4px">
      ${html}
    </div>`;
  },

  folderCard(folder) {
    const isSelected = App.selectedBrowsePaths?.includes(folder.path);
    return `<div class="model-card ${isSelected ? 'selected' : ''}" data-path="${folder.path}" onclick="App.browseTo('${folder.path}')" style="cursor:pointer" draggable="true" ondragstart="App.handleDragStart(event, '${folder.path}')" ondragover="event.preventDefault(); this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="App.handleDrop(event, '${folder.path}')">
      <div class="model-card-checkbox" onclick="event.stopPropagation(); App.toggleBrowseSelection('${folder.path}')"></div>
      <div class="model-card-thumb">
        <div class="model-card-placeholder" style="background:linear-gradient(135deg, hsl(220,50%,22%), hsl(240,40%,16%));display:flex;align-items:center;justify-content:center;font-size:3rem">📁</div>
      </div>
      <div class="model-card-body">
        <div class="model-card-name">${folder.name}</div>
        <div class="model-card-meta"><span class="badge badge-stl">${folder.itemCount} items</span></div>
      </div>
    </div>`;
  },

  browseFileCard(file) {
    const isPreviewable = file.type === 'stl' || file.type === '3mf';
    let thumb;
    if (file.thumbnailUrl) {
      thumb = `<img src="${file.thumbnailUrl}" alt="${file.name}">`;
    } else if (isPreviewable) {
      thumb = `<div class="model-card-placeholder stl-thumb-target" data-stl-url="${file.url}?t=${Date.now()}" style="background:${this.gradient(file.name)}">📦</div>`;
    } else if (file.type === 'image') {
      thumb = `<img src="${file.url}" alt="${file.name}">`;
    } else {
      thumb = `<div class="model-card-placeholder" style="background:${this.gradient(file.name)}">📦</div>`;
    }
    
    const folderLabel = file.folderPath ? `<div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px" title="${file.folderPath}">📁 ${file.folderPath}</div>` : '';
    const itemPath = `${file.folderPath ? file.folderPath+'/' : ''}${file.name}`;
    const isSelected = App.selectedBrowsePaths?.includes(itemPath);
    
    const clickHandler = isPreviewable ? `onclick="App.previewFileModal('${file.url}', '${file.name}')" style="cursor:pointer"` : '';

    return `<div class="model-card ${isSelected ? 'selected' : ''}" data-path="${itemPath}" draggable="true" ondragstart="App.handleDragStart(event, '${itemPath}')" ${clickHandler}>
      <div class="model-card-checkbox" onclick="event.stopPropagation(); App.toggleBrowseSelection('${itemPath}')"></div>
      <div class="model-card-thumb">${thumb}<div class="model-card-badges"><span class="badge badge-${file.type}">${file.type}</span></div></div>
      <div class="model-card-body">
        <div class="model-card-name">${file.name}</div>
        ${folderLabel}
        <div class="model-card-meta" style="font-size:.75rem;color:var(--text-muted)">${this.formatSize(file.size)}</div>
      </div>
    </div>`;
  },

  // ── Model Card ──
  modelCard(m) {
    let thumb;
    if (m.thumbnail) {
      const thumbUrl = m.thumbnail.startsWith('/') ? m.thumbnail : `/uploads/${m.thumbnail}`;
      thumb = `<img src="${thumbUrl}" alt="${m.name}">`;
    } else if (m.stl_file) {
      const stlUrl = m.stl_file.startsWith('/') ? m.stl_file : `/uploads/${m.stl_file}`;
      thumb = `<div class="model-card-placeholder stl-thumb-target" data-stl-url="${stlUrl}?t=${Date.now()}" style="background:${this.gradient(m.name)}">📦</div>`;
    } else {
      thumb = `<div class="model-card-placeholder" style="background:${this.gradient(m.name)}">📦</div>`;
    }
    const types = (m.file_types || []).filter(t => t !== 'image').map(t =>
      `<span class="badge badge-${t}">${t}</span>`
    ).join('');
    const printed = m.has_printed
      ? '<span class="badge badge-printed">✓ Printed</span>'
      : '<span class="badge badge-not-printed">Not printed</span>';
    const cat = m.category_name
      ? `<span class="badge badge-category" style="background:${m.category_color}20;color:${m.category_color};border:1px solid ${m.category_color}33">${m.category_name}</span>`
      : '';
    const isAdmin = App.currentUser?.role === 'admin';
    const plusBtn = isAdmin ? `<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();App.addToProject(${m.id})" title="Add to project" style="margin-top:-4px;margin-right:-8px;padding:4px">➕</button>` : '';

    const isSelected = App.selectedModelIds?.includes(m.id);

    return `<div class="model-card ${isSelected ? 'selected' : ''}" onclick="App.handleModelCardClick(event, ${m.id})" data-model-id="${m.id}">
      <div class="model-card-checkbox" onclick="App.toggleModelSelection(event, ${m.id})"></div>
      <div class="model-card-thumb">${thumb}<div class="model-card-badges">${types}</div></div>
      <div class="model-card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="model-card-name" style="flex:1">${m.name}</div>
          ${plusBtn}
        </div>
        <div class="model-card-meta">${cat} ${printed}</div>
      </div>
      <div class="model-card-footer">
        <span style="font-size:.75rem;color:var(--text-muted)">${m.file_count || 0} files</span>
        <span style="font-size:.75rem;color:var(--text-muted)">${this.formatDate(m.updated_at)}</span>
      </div>
    </div>`;
  },

  bulkActionBar(count) {
    return `
      <div class="bulk-action-bar ${count > 0 ? 'active' : ''}">
        <div class="bulk-count">${count} items selected</div>
        <div class="bulk-actions">
          <button class="btn btn-secondary btn-sm" onclick="App.openBulkMove()">📁 Move</button>
          <button class="btn btn-secondary btn-sm" onclick="App.openBulkAddToCollection()">➕ Collection</button>
          <button class="btn btn-danger btn-sm" onclick="App.openBulkDelete()">🗑 Delete</button>
          <button class="btn btn-ghost btn-sm" onclick="App.clearSelection()">✕ Clear</button>
        </div>
      </div>`;
  },

  bulkBrowseActionBar(count, isAllSelected) {
    return `
      <div class="bulk-action-bar ${count > 0 ? 'active' : ''}">
        <div class="bulk-count">${count} items selected</div>
        <div class="bulk-actions">
          <button class="btn btn-secondary btn-sm" onclick="App.toggleBrowseSelectAll()">${isAllSelected ? '✕ Deselect All' : '✓ Select All'}</button>
          <button class="btn btn-secondary btn-sm" onclick="App.openBulkBrowseMove()">📁 Move</button>
          <button class="btn btn-secondary btn-sm" onclick="App.openBulkBrowseTag()">🏷️ Tag</button>
          <button class="btn btn-danger btn-sm" onclick="App.openBulkBrowseDelete()">🗑 Delete</button>
          <button class="btn btn-ghost btn-sm" onclick="App.clearBrowseSelection()">✕ Clear</button>
        </div>
      </div>`;
  },

  bulkDeleteForm(count) {
    return `
      <form id="bulk-delete-form" onsubmit="App.handleBulkDelete(event)">
        <div style="margin-bottom: 20px; color: var(--text-secondary)">
          Are you sure you want to delete <strong>${count} models</strong>?<br>
          This action cannot be undone.
        </div>
        <div class="form-group" style="padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2)">
          <label class="form-checkbox" style="color: #ef4444; font-weight: 600; margin: 0">
            <input type="checkbox" name="delete_disk"> 
            Also permanently delete physical files from disk
          </label>
        </div>
        <div class="form-actions" style="margin-top: 24px">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-danger">Delete ${count} Models</button>
        </div>
      </form>`;
  },

  bulkMoveForm(categories = []) {
    const options = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    return `
      <form onsubmit="App.handleBulkMove(event)">
        <div class="form-group">
          <label class="form-label">Select Category</label>
          <select class="form-select" name="category_id">
            <option value="">(None)</option>
            ${options}
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Move Models</button>
        </div>
      </form>`;
  },

  bulkCollectionForm(projects = []) {
    const options = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    return `
      <form onsubmit="App.handleBulkAddToCollectionSubmit(event)">
        <div class="form-group">
          <label class="form-label">Select Collection</label>
          <select class="form-select" name="project_id">
            ${options}
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add to Collection</button>
        </div>
      </form>`;
  },

  bulkBrowseMoveForm() {
    return `
      <form onsubmit="App.handleBulkBrowseMoveSubmit(event)">
        <div class="form-group">
          <label class="form-label">Destination Path</label>
          <input type="text" class="form-input" name="target_path" placeholder="e.g. /3dprints/toys" required>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Move Items</button>
        </div>
      </form>`;
  },

  bulkBrowseDeleteForm(count) {
    return `
      <form onsubmit="App.handleBulkBrowseDeleteSubmit(event)">
        <div style="margin-bottom: 20px; color: var(--text-secondary)">
          Are you sure you want to delete <strong>${count} items</strong>?<br>
          This action cannot be undone.
        </div>
        <div class="form-actions" style="margin-top: 24px">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-danger">Delete ${count} Items</button>
        </div>
      </form>`;
  },

  bulkBrowseTagForm(tags = []) {
    const tagCheckboxes = tags.map(t =>
      `<label class="tag-pill-checkbox">
        <input type="checkbox" name="tags" value="${t.name}">
        <span class="tag-pill">${t.name}</span>
      </label>`
    ).join('');

    return `
      <form onsubmit="App.handleBulkBrowseTagSubmit(event)">
        <div class="form-group">
          <label class="form-label">Tags</label>
          <div id="bulk-browse-tags-container" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            ${tagCheckboxes}
          </div>
          <div class="add-inline" style="max-width:250px;margin-top:4px">
            <input type="text" id="new-bulk-tag-input" class="form-input" placeholder="Add new tag (comma separated)...">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Tag Items</button>
        </div>
      </form>`;
  },

  modelDetail(model) {
    const isAdmin = App.currentUser?.role === 'admin';
    const cat = model.category_name
      ? `<span class="badge badge-category" style="background:${model.category_color}20;color:${model.category_color};border:1px solid ${model.category_color}33">${model.category_name}</span>`
      : '';
    const tags = (model.tags || []).map(t => `<span class="badge badge-tag">${t.name}</span>`).join('');
    const printed = model.has_printed
      ? '<span class="badge badge-printed">✓ Printed</span>'
      : '<span class="badge badge-not-printed">Not printed</span>';
    const sourceLink = model.source_url
      ? `<a href="${model.source_url}" target="_blank" class="badge badge-category" style="background:var(--bg-tertiary);color:var(--accent-cyan);text-decoration:none;border:1px solid var(--border)">🔗 Source</a>`
      : '';

    // Find first STL or 3MF file for 3D preview
    const stlFile = (model.files || []).find(f => f.file_type === 'stl' || f.file_type === '3mf');
    let viewerHtml;

    if (stlFile) {
      viewerHtml = `
      <div class="glass-panel" style="margin-bottom:24px;overflow:visible">
        <div class="panel-header">
          <div class="panel-title">🔮 3D Preview</div>
        </div>
        <div class="panel-body no-pad">
          <div class="viewer-container" id="stl-viewer-${model.id}" data-stl-url="${stlFile.url || '/uploads/'+stlFile.filename}" data-fallback-thumbnail="${model.thumbnail_url || ''}">
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted)">Loading 3D preview...</div>
          </div>
          <div style="padding:12px 16px;font-size:.7rem;color:var(--text-muted);border-top:1px solid var(--border);background:rgba(0,0,0,0.1)">
            🖱 Drag to rotate · Scroll to zoom · Right-click to pan
          </div>
        </div>
      </div>`;
    } else if (model.thumbnail_url) {
      viewerHtml = `
      <div class="glass-panel" style="margin-bottom:24px;overflow:hidden">
        <div class="panel-header">
          <div class="panel-title">🖼️ Model Preview</div>
        </div>
        <div class="panel-body no-pad" style="height:400px;background:var(--bg-dark);display:flex;align-items:center;justify-content:center">
          <img src="${model.thumbnail_url}" style="max-width:100%;max-height:100%;object-fit:contain">
        </div>
      </div>`;
    } else {
      viewerHtml = `
      <div class="glass-panel" style="margin-bottom:24px;overflow:visible">
        <div class="panel-header">
          <div class="panel-title">🔮 3D Preview</div>
        </div>
        <div class="panel-body">
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:350px;color:var(--text-muted);text-align:center">
            <div style="font-size:3.5rem;margin-bottom:16px;opacity:.2">📦</div>
            <div style="font-size:1.1rem;font-weight:600;color:var(--text-secondary)">No 3D Preview Available</div>
            <div style="font-size:.85rem;margin-top:6px;max-width:280px">Upload an STL or 3MF file to this model to enable the interactive 3D viewer.</div>
          </div>
        </div>
      </div>`;
    }

    const filesHtml = (model.files || []).filter(f => f.file_type !== 'document').map(f => {
      let metaHtml = '';
      if (f.metadata) {
        try {
          const meta = typeof f.metadata === 'string' ? JSON.parse(f.metadata) : f.metadata;
          const items = [];
          if (meta.layerHeight) items.push(`<span><b>LH:</b> ${meta.layerHeight}mm</span>`);
          if (meta.infill) items.push(`<span><b>Infill:</b> ${meta.infill}%</span>`);
          if (meta.printTime) items.push(`<span><b>Time:</b> ${meta.printTime}</span>`);
          if (meta.tempNozzle && meta.tempBed) items.push(`<span><b>Temp:</b> ${meta.tempNozzle}°C/${meta.tempBed}°C</span>`);
          else if (meta.tempNozzle) items.push(`<span><b>Temp:</b> ${meta.tempNozzle}°C</span>`);
          if (meta.filamentType) items.push(`<span><b>Mat:</b> ${meta.filamentType}</span>`);
          
          // Improved filament usage display
          if (meta.weight) items.push(`<span><b>Used:</b> ${meta.weight}g</span>`);
          else if (meta.filamentUsed) {
            const val = meta.filamentUsed;
            const unit = val.endsWith('m') ? '' : 'm';
            items.push(`<span><b>Used:</b> ${val}${unit}</span>`);
          }

          if (meta.supports === '1') items.push(`<span><b>Supports:</b> Yes</span>`);
          if (meta.printerModel) items.push(`<span><b>Printer:</b> ${meta.printerModel}</span>`);
          if (items.length) metaHtml = `<div class="file-gcode-meta" style="display:flex;flex-wrap:wrap;gap:12px;font-size:0.75rem;color:var(--text-secondary);margin-top:6px;background:rgba(255,255,255,0.03);padding:4px 8px;border-radius:4px;border:1px solid var(--border)">${items.join('')}</div>`;
        } catch(e) {}
      }

      return `
      <div class="file-item">
        ${this.fileTypeIcon(f.file_type)}
        <div class="file-info">
          <div class="file-name">${f.original_name}</div>
          <div class="file-meta">${this.formatSize(f.file_size)} · ${this.formatDate(f.uploaded_at)} · 👤 ${f.uploader_name || 'System'}</div>
          ${metaHtml}
        </div>
        <div class="file-actions" style="display:flex;gap:4px;align-items:center">
          ${(f.file_type === 'stl' || f.file_type === '3mf') ? `
            <div class="dropdown">
              <button class="btn btn-ghost btn-xs" title="Open in Slicer" style="color:var(--accent-purple);font-weight:600;font-size:0.7rem;border:1px solid var(--accent-purple);padding:3px 10px;border-radius:4px;line-height:1;white-space:nowrap">OPEN IN SLICER</button>
              <div class="dropdown-content">
                <div class="dropdown-header">Open in Slicer</div>
                <a href="orcaslicer://open?file=${encodeURIComponent(window.location.origin + (f.url || '/api/files/' + f.id + '/download/model.' + f.file_type))}">OrcaSlicer</a>
                <a href="elegooslicer://open?file=${encodeURIComponent(window.location.origin + (f.url || '/api/files/' + f.id + '/download/model.' + f.file_type))}">Elegoo Slicer</a>
                <a href="cura://open?file=${encodeURIComponent(window.location.origin + (f.url || '/api/files/' + f.id + '/download/model.' + f.file_type))}">Ultimaker Cura</a>
              </div>
            </div>
          ` : ''}
          ${(f.file_type === 'stl' || f.file_type === '3mf') ? `<button class="btn btn-ghost" style="padding:6px;color:var(--accent-cyan)" onclick="event.stopPropagation();App.previewStl(${model.id},'${f.url || '/uploads/'+f.filename}', '${f.file_type}')" title="Preview"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>` : ''}
          <a href="/api/files/${f.id}/download" class="btn btn-ghost" style="padding:6px" title="Download"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></a>
          ${isAdmin ? `<button class="btn btn-ghost" style="padding:6px;color:var(--error)" onclick="event.stopPropagation();App.confirmDeleteFile(${f.id},'${(f.original_name || f.filename).replace(/'/g, "\\'")}',${model.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>` : ''}
        </div>
      </div>`;
    }).join('');

    const docsHtml = (model.files || []).filter(f => f.file_type === 'document').map(f => {
      return `
      <div class="file-item">
        <div class="file-type-icon" style="background:rgba(255,165,0,0.2);color:#ffa500;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.7rem">DOC</div>
        <div class="file-info">
          <div class="file-name">${f.original_name}</div>
          <div class="file-meta">${this.formatSize(f.file_size)} · ${this.formatDate(f.uploaded_at)} · 👤 ${f.uploader_name || 'System'}</div>
        </div>
        <div class="file-actions" style="display:flex;gap:4px;align-items:center">
          <a href="/api/files/${f.id}/download" target="_blank" class="btn btn-ghost" style="padding:6px;color:var(--accent-cyan)" title="View Document"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></a>
          ${isAdmin ? `<button class="btn btn-ghost" style="padding:6px;color:var(--error)" onclick="event.stopPropagation();App.confirmDeleteFile(${f.id},'${(f.original_name || f.filename).replace(/'/g, "\\'")}',${model.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>` : ''}
        </div>
      </div>`;
    }).join('');

    const printsHtml = (model.prints || []).map(p => `
      <div class="print-item">
        <div class="print-status ${p.successful ? 'success' : 'failed'}"></div>
        <div class="print-info">
          <div class="print-material">${p.material_name || 'Unknown material'} ${p.successful ? '' : '<span style="color:var(--error);font-size:.75rem"> — Failed</span>'}</div>
          <div class="print-date">${this.formatDate(p.printed_at)}</div>
          ${p.notes ? `<div class="print-notes">${p.notes}</div>` : ''}
        </div>
        <button class="btn btn-ghost" style="padding:6px;color:var(--error)" onclick="App.deletePrint(${p.id},${model.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
      </div>
    `).join('');

    const breadcrumbs = `
      <div class="breadcrumbs">
        <a href="#/models">Library</a>
        <span>/</span>
        ${model.category_id ? `<a href="#/models?category=${model.category_id}">${model.category_name}</a><span>/</span>` : ''}
        <span class="current">${model.name}</span>
      </div>
    `;

    return `
      ${breadcrumbs}
      <div class="detail-header">
        <div>
          <div class="detail-title">${model.name}</div>
          <div class="detail-meta">${cat} ${printed}</div>
        </div>
        <div class="detail-actions" style="display:flex;gap:8px;flex-wrap:wrap">
          ${isAdmin ? `
          <button class="btn btn-secondary btn-sm" onclick="App.showShareModal(${model.id})" title="Share Model">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          <button class="btn btn-secondary btn-sm" onclick="App.addToProject(${model.id})" title="Add to Collection">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Collection
          </button>
          <button class="btn btn-secondary btn-sm" onclick="App.showCreateVersion(${model.id},'${model.name.replace(/'/g, "\\'")}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Version
          </button>
          <button class="btn btn-secondary btn-sm" onclick="App.showEditModel(${model.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <button class="btn btn-danger btn-sm" onclick="App.confirmDeleteModel(${model.id},'${model.name.replace(/'/g, "\\'")}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            Delete
          </button>
          ` : ''}
        </div>
      </div>

      <div class="detail-layout">
        <div>
          ${viewerHtml}
          ${model.description ? `
          <div class="glass-panel" style="margin-bottom:24px">
            <div class="panel-header"><div class="panel-title">📝 Description</div></div>
            <div class="panel-body"><div class="detail-description">${model.description}</div></div>
          </div>` : ''}
          ${(tags || sourceLink) ? `
          <div class="glass-panel" style="margin-bottom:24px">
            <div class="panel-header"><div class="panel-title">🏷️ Tags & Links</div></div>
            <div class="panel-body">
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${tags}
                ${sourceLink}
              </div>
            </div>
          </div>` : ''}
        </div>

        <div>
          <div class="glass-panel">
            <div class="panel-header">
              <div class="panel-title">🖨 Print History</div>
              <button class="btn btn-success btn-xs" onclick="App.showLogPrint(${model.id})">+ Log Print</button>
            </div>
            <div class="panel-body no-pad">
              ${printsHtml || '<div class="empty-state" style="padding:30px"><div class="empty-state-text">No prints logged</div><div class="empty-state-sub">Log your first print</div></div>'}
            </div>
          </div>

          <div class="glass-panel" style="margin-top:16px">
            <div class="panel-header" style="border-bottom:1px solid var(--border-color);padding:0">
              <div style="display:flex;width:100%;align-items:center;">
                <div style="display:flex;gap:20px;padding:16px 16px 0 16px;flex:1">
                  <div onclick="App.switchFilesTab(event, 'files')" style="padding-bottom:12px;cursor:pointer;border-bottom:2px solid var(--accent-cyan);color:var(--text);font-weight:600">📁 Files (${model.files?.filter(f => f.file_type !== 'document').length || 0})</div>
                  ${docsHtml ? `<div onclick="App.switchFilesTab(event, 'docs')" style="padding-bottom:12px;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-muted);font-weight:600">📄 Documentation (${model.files?.filter(f => f.file_type === 'document').length || 0})</div>` : ''}
                </div>
                <div style="padding:12px 16px">
                  ${isAdmin ? `<button class="btn btn-primary btn-xs" onclick="App.showUploadFiles(${model.id})">+ Upload</button>` : ''}
                </div>
              </div>
            </div>
            <div class="panel-body no-pad" style="overflow:visible">
              <div id="tab-content-files">
                ${filesHtml || '<div class="empty-state" style="padding:30px"><div class="empty-state-text">No files yet</div><div class="empty-state-sub">Upload STL, Gcode, or 3MF files</div></div>'}
              </div>
              ${docsHtml ? `
              <div id="tab-content-docs" style="display:none">
                ${docsHtml}
              </div>` : ''}
            </div>
          </div>

          ${model.versions?.length ? `
          <div class="glass-panel" style="margin-top:16px">
            <div class="panel-header"><div class="panel-title">🔄 Other Versions</div></div>
            <div class="panel-body no-pad">
              ${model.versions.map(v => `
                <div class="activity-item" style="cursor:pointer;padding:12px" onclick="App.navigate('/models/${v.id}')">
                  <div style="flex:1">
                    <div style="font-weight:600;font-size:.85rem">${v.name}</div>
                    <div style="font-size:.7rem;color:var(--text-muted)">${this.formatDateShort(v.created_at)} · ${v.file_count} files</div>
                  </div>
                  <div style="color:var(--accent-cyan);font-size:.8rem">View →</div>
                </div>`).join('')}
            </div>
          </div>` : ''}
          ${model.print_tips ? `
          <div class="glass-panel" style="margin-top:16px">
            <div class="panel-header"><div class="panel-title">💡 Print Tips</div></div>
            <div class="panel-body"><div class="detail-tips">${model.print_tips}</div></div>
          </div>` : ''}
        </div>
      </div>`;
  },

  // ── Create/Edit Model Form ──
  modelForm(model = null, categories = [], tags = []) {
    const isEdit = !!model;
    const selTags = model?.tags?.map(t => t.id) || [];
    const catOptions = categories.map(c =>
      `<option value="${c.id}" ${model?.category_id == c.id ? 'selected' : ''}>${c.name}</option>`
    ).join('');
    const tagCheckboxes = tags.map(t =>
      `<label class="tag-pill-checkbox">
        <input type="checkbox" name="tags" value="${t.id}" ${selTags.includes(t.id) ? 'checked' : ''}>
        <span class="tag-pill">${t.name}</span>
      </label>`
    ).join('');

    return `
      <form id="model-form" onsubmit="App.handleModelSubmit(event,${model?.id || 'null'})">
        <div class="form-group">
          <label class="form-label">Name *</label>
          <input class="form-input" name="name" required value="${model?.name || ''}" placeholder="e.g. Phone Stand v2" id="model-name-input">
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" name="category_id">
            <option value="">No category</option>${catOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Source URL (optional)</label>
          <input class="form-input" type="url" name="source_url" value="${model?.source_url || ''}" placeholder="e.g. https://www.printables.com/...">
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" name="description" placeholder="Describe this model...">${model?.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Print Tips</label>
          <textarea class="form-textarea" name="print_tips" placeholder="Recommended settings, supports needed, etc...">${model?.print_tips || ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Tags</label>
          <div id="model-tags-container" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            ${tagCheckboxes}
          </div>
          <div class="add-inline" style="max-width:250px;margin-top:4px">
            <input type="text" id="new-tag-input" class="form-input" placeholder="Add new tag..." onkeydown="if(event.key==='Enter'){event.preventDefault();App.addInlineTag();}">
            <button type="button" class="btn btn-secondary btn-sm" onclick="App.addInlineTag()">Add</button>
          </div>
        </div>
        ${!isEdit ? `
        <div class="form-group">
          <label class="form-label">Files (optional)</label>
          <div class="upload-zone" id="create-upload-zone" style="padding:20px"
            onclick="document.getElementById('create-file-input').click()"
            ondragover="event.preventDefault();this.classList.add('dragover')"
            ondragleave="this.classList.remove('dragover')"
            ondrop="event.preventDefault();this.classList.remove('dragover');App.handleCreateFileDrop(event)">
            <div class="upload-zone-text"><strong>Click to browse</strong> or drag & drop files</div>
            <div style="color:var(--text-muted);font-size:.7rem;margin-top:4px">STL · Gcode · 3MF · OBJ · STEP · Images · Documents</div>
            <input type="file" id="create-file-input" multiple accept=".stl,.gcode,.3mf,.obj,.step,.stp,.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md" onchange="App.handleCreateFileSelect(event)">
          </div>
          <div id="create-file-list" class="upload-file-list" style="display:none"></div>
        </div>` : ''}
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Model'}</button>
        </div>
      </form>`;
  },

  // ── Upload Files Form ──
  uploadForm(modelId) {
    return `
      <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()"
        ondragover="event.preventDefault();this.classList.add('dragover')"
        ondragleave="this.classList.remove('dragover')"
        ondrop="event.preventDefault();this.classList.remove('dragover');App.handleFileDrop(event,${modelId})">
        <div class="upload-zone-icon">📁</div>
        <div class="upload-zone-text"><strong>Click to browse</strong> or drag & drop files</div>
        <div style="color:var(--text-muted);font-size:.75rem;margin-top:6px">STL · Gcode · 3MF · OBJ · STEP · Images · Documents</div>
        <input type="file" id="file-input" multiple accept=".stl,.gcode,.3mf,.obj,.step,.stp,.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md" onchange="App.handleFileSelect(event,${modelId})">
      </div>
      <div id="upload-progress" style="margin-top:16px"></div>`;
  },

  // ── Log Print Form ──
  printForm(modelId, materials = []) {
    const matOptions = materials.map(m =>
      `<option value="${m.id}">${m.name}${m.is_preset ? '' : ' (custom)'}</option>`
    ).join('');

    return `
      <form id="print-form" onsubmit="App.handlePrintSubmit(event,${modelId})">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Material</label>
            <select class="form-select" name="material_id">${matOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Date</label>
            <input class="form-input" type="date" name="printed_at" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-checkbox" style="font-weight:600">
            <input type="checkbox" name="successful" checked> Successful print
          </label>
        </div>
        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <textarea class="form-textarea" name="notes" placeholder="Print settings, observations..." rows="2"></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Log Print</button>
        </div>
      </form>`;
  },

  // ── Delete Confirmations ──
  deleteModelForm(id, name) {
    return `
      <form id="delete-model-form" onsubmit="App.handleDeleteModel(event, ${id})">
        <div style="margin-bottom: 20px; color: var(--text-secondary)">
          Are you sure you want to delete <strong>"${name}"</strong>?<br>
          This will remove the model, all its files, and print history from GyroidVault.
        </div>
        <div class="form-group" style="padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2)">
          <label class="form-checkbox" style="color: #ef4444; font-weight: 600; margin: 0">
            <input type="checkbox" name="delete_disk"> 
            Also permanently delete physical files from disk
          </label>
        </div>
        <div class="form-actions" style="margin-top: 24px">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-danger">Delete Model</button>
        </div>
      </form>
    `;
  },

  deleteFileForm(fileId, filename, modelId) {
    return `
      <form id="delete-file-form" onsubmit="App.handleDeleteFile(event, ${fileId}, ${modelId})">
        <div style="margin-bottom: 20px; color: var(--text-secondary)">
          Are you sure you want to delete <strong>"${filename}"</strong> from GyroidVault?
        </div>
        <div class="form-group" style="padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2)">
          <label class="form-checkbox" style="color: #ef4444; font-weight: 600; margin: 0">
            <input type="checkbox" name="delete_disk"> 
            Also permanently delete physical file from disk
          </label>
        </div>
        <div class="form-actions" style="margin-top: 24px">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-danger">Delete File</button>
        </div>
      </form>
    `;
  },

  // ── Toolbar ──
  toolbar(categories = [], tags = [], users = []) {
    const catOpts = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const tagOpts = tags.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    const userOpts = users.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
    return `
      <div class="toolbar">
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search models..." id="search-input" oninput="App.handleSearch(this.value)">
        </div>
        <select class="filter-select" id="filter-category" onchange="App.handleFilter()">
          <option value="">All Categories</option>${catOpts}
        </select>
        <select class="filter-select" id="filter-tag" onchange="App.handleFilter()">
          <option value="">All Tags</option>${tagOpts}
        </select>
        <select class="filter-select" id="filter-user" onchange="App.handleFilter()">
          <option value="">All Users</option>${userOpts}
        </select>
        <select class="filter-select" id="filter-printed" onchange="App.handleFilter()">
          <option value="">All Status</option>
          <option value="true">Printed</option>
          <option value="false">Not Printed</option>
        </select>
        <select class="filter-select" id="filter-sort" onchange="App.handleFilter()">
          <option value="updated">Last Updated</option>
          <option value="created">Date Created</option>
          <option value="name">Name</option>
          <option value="prints">Most Printed</option>
        </select>
        <select class="filter-select" id="filter-limit" onchange="App.handleFilter()">
          <option value="24">24 per page</option>
          <option value="48">48 per page</option>
          <option value="96">96 per page</option>
        </select>
        <button class="btn btn-secondary btn-sm" onclick="App.selectAll()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
          Select All
        </button>
        <button class="btn btn-primary btn-sm" id="scan-btn" onclick="App.handleScanLibrary()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
          Scan Library
        </button>
      </div>`;
  },

  // ── Pagination ──
  pagination(totalPages, currentPage) {
    if (totalPages <= 1) return '';
    
    let buttons = '';
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    // Always render Prev button to prevent UI jumping
    const prevDisabled = currentPage <= 1 ? 'disabled style="opacity:0.3;cursor:default"' : `onclick="App.goToPage(${currentPage - 1})"`;
    buttons += `<button class="btn btn-secondary btn-sm" ${prevDisabled}>← Prev</button>`;

    if (startPage > 1) {
      buttons += `<button class="btn btn-secondary btn-sm" onclick="App.goToPage(1)">1</button>`;
      if (startPage > 2) buttons += `<span style="padding: 4px 8px; color: var(--text-muted)">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === currentPage ? 'btn-primary' : 'btn-secondary';
      buttons += `<button class="btn ${activeClass} btn-sm" onclick="App.goToPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) buttons += `<span style="padding: 4px 8px; color: var(--text-muted)">...</span>`;
      buttons += `<button class="btn btn-secondary btn-sm" onclick="App.goToPage(${totalPages})">${totalPages}</button>`;
    }

    // Always render Next button to prevent UI jumping
    const nextDisabled = currentPage >= totalPages ? 'disabled style="opacity:0.3;cursor:default"' : `onclick="App.goToPage(${currentPage + 1})"`;
    buttons += `<button class="btn btn-secondary btn-sm" ${nextDisabled}>Next →</button>`;

    return `
      <div class="pagination-container" style="display: flex; justify-content: center; gap: 6px; margin-top: 32px; padding-bottom: 24px;">
        ${buttons}
      </div>
    `;
  },

  // ── Settings panels ──
  settingsPanel(title, items, type) {
    const listHtml = items.map(item => {
      const color = item.color ? `<span class="color-dot" style="background:${item.color}"></span>` : '';
      const preset = item.is_preset ? '<span style="font-size:.7rem;color:var(--text-muted);margin-left:4px">(preset)</span>' : '';
      const count = item.model_count != null ? `<span style="font-size:.75rem;color:var(--text-muted)">${item.model_count || item.usage_count || 0}</span>` : '';
      const canDelete = type === 'materials' ? !item.is_preset : true;
      return `<div class="settings-item">
        <span class="settings-item-name">${color} ${item.name}${preset}</span>
        <div class="settings-item-actions">
          ${count}
          ${canDelete ? `<button class="btn btn-ghost btn-xs" style="color:var(--error);padding:4px" onclick="App.deleteSettingsItem('${type}',${item.id},'${item.name.replace(/'/g, "\\'")}')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>` : ''}
        </div>
      </div>`;
    }).join('');

    const colorInput = type === 'categories' ? `
      <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;border:2px solid var(--border);position:relative">
        <input type="color" id="add-${type}-color" value="#8b5cf6" style="width:150%;height:150%;position:absolute;top:-25%;left:-25%;border:none;background:none;cursor:pointer">
      </div>` : '';

    const iconMap = {
      categories: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.6"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
      tags: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.6"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
      materials: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.6"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>'
    };

    return `<div class="glass-panel">
      <div class="panel-header"><div class="panel-title">${iconMap[type] || ''} ${title}</div></div>
      <div class="panel-body">
        ${listHtml || '<div style="color:var(--text-muted);font-size:.875rem;padding:8px 0">None yet</div>'}
        <div class="add-inline">
          <input class="form-input" id="add-${type}-input" placeholder="Add new ${type.slice(0,-1)}...">
          ${colorInput}
          <button class="btn btn-primary btn-sm" onclick="App.addSettingsItem('${type}')">Add</button>
        </div>
      </div>
    </div>`;
  },

  // ── Dashboard sections ──
  recentModels(models) {
    if (!models.length) return '<div style="color:var(--text-muted);padding:8px 0;font-size:.875rem">No models yet</div>';
    return models.map(m => `
      <div class="activity-item" style="cursor:pointer" onclick="App.navigate('/models/${m.id}')">
        <div class="activity-dot" style="background:${m.category_color || 'var(--text-muted)'}"></div>
        <div style="flex:1;font-weight:500">${m.name}</div>
        <span style="font-size:.75rem;color:var(--text-muted)">${this.formatDateShort(m.created_at)}</span>
      </div>`).join('');
  },

  recentPrints(prints) {
    if (!prints.length) return '<div style="color:var(--text-muted);padding:8px 0;font-size:.875rem">No prints logged yet</div>';
    return prints.map(p => `
      <div class="activity-item" style="cursor:pointer" onclick="App.navigate('/models/${p.model_id}')">
        <div class="print-status ${p.successful ? 'success' : 'failed'}"></div>
        <div style="flex:1"><span style="font-weight:500">${p.model_name}</span> <span style="color:var(--text-muted);font-size:.8rem">— ${p.material_name || 'Unknown'}</span></div>
        <span style="font-size:.75rem;color:var(--text-muted)">${this.formatDateShort(p.printed_at)}</span>
      </div>`).join('');
  },

  materialChart(usage) {
    if (!usage.length) return '<div style="color:var(--text-muted);padding:8px 0;font-size:.875rem">No data yet</div>';
    const max = Math.max(...usage.map(u => u.count));
    return usage.map(u => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="width:50px;font-size:.8rem;font-weight:600;text-align:right">${u.name}</span>
        <div style="flex:1;height:24px;background:var(--bg-input);border-radius:6px;overflow:hidden">
          <div style="height:100%;width:${(u.count/max)*100}%;background:var(--accent-gradient);border-radius:6px;transition:width .5s ease"></div>
        </div>
        <span style="font-size:.75rem;color:var(--text-muted);width:24px">${u.count}</span>
      </div>`).join('');
  },

  loginForm(allowRegistration = false) {
    return `
      <form onsubmit="App.handleLogin(event)" class="form-grid">
        <div class="form-group">
          <label>Username</label>
          <input type="text" name="username" required placeholder="Enter username" class="form-input">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" required placeholder="Enter password" class="form-input">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px">
          <div style="display:flex; flex-direction:column; gap:4px">
            ${allowRegistration ? `<a href="#" onclick="event.preventDefault();App.showRegister()" style="font-size:.85rem;color:var(--accent-cyan)">No account? Register</a>` : ''}
            <a href="#" onclick="event.preventDefault();App.showForgotPassword()" style="font-size:.75rem;color:var(--text-muted)">Forgot password?</a>
          </div>
          <button type="submit" class="btn btn-primary">Login</button>
        </div>
      </form>`;
  },

  registerForm(token = '') {
    return `
      <form onsubmit="App.handleRegister(event)" class="form-grid">
        <input type="hidden" name="token" value="${token}">
        <div class="form-group">
          <label>Username</label>
          <input type="text" name="username" required placeholder="Choose username" class="form-input">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" required placeholder="Your email address" class="form-input">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" required placeholder="Choose password" class="form-input">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px">
          <a href="#" onclick="event.preventDefault();App.showLogin()" style="font-size:.85rem;color:var(--accent-cyan)">Already have an account? Login</a>
          <button type="submit" class="btn btn-primary">Register</button>
        </div>
      </form>`;
  },

  forgotPasswordForm() {
    return `
      <form onsubmit="App.handleForgotPassword(event)" class="form-grid">
        <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:16px">Enter your email and we'll send you a reset link.</p>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" required placeholder="Your email address" class="form-input">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px">
          <a href="#" onclick="event.preventDefault();App.showLogin()" style="font-size:.85rem;color:var(--accent-cyan)">Back to Login</a>
          <button type="submit" class="btn btn-primary">Send Link</button>
        </div>
      </form>`;
  },

  resetPasswordForm(token) {
    return `
      <form onsubmit="App.handleResetPassword(event)" class="form-grid">
        <input type="hidden" name="token" value="${token}">
        <div class="form-group">
          <label>New Password</label>
          <input type="password" name="password" required placeholder="Enter new password" class="form-input">
        </div>
        <div class="form-group">
          <label>Confirm Password</label>
          <input type="password" name="confirm" required placeholder="Confirm new password" class="form-input">
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:20px">
          <button type="submit" class="btn btn-primary">Reset Password</button>
        </div>
      </form>`;
  },

  systemSettingsForm(config = {}) {
    return `
      <form onsubmit="App.handleSaveSystemSettings(event)" class="form-grid">
        <h3 style="grid-column: 1 / -1; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 5px;">General Settings</h3>
        <div class="form-group">
          <label>Library View Mode</label>
          <select name="library_view_mode" class="form-input">
            <option value="grid" ${(config.library_view_mode || 'grid') === 'grid' ? 'selected' : ''}>All Models (flat grid)</option>
            <option value="folder" ${config.library_view_mode === 'folder' ? 'selected' : ''}>Folder View (browse disk)</option>
          </select>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Choose how the Models page displays your library.</p>
        </div>
        <div class="form-group">
          <label>Auto-Scan Interval (Hours)</label>
          <input type="number" name="auto_scan_interval" value="${config.auto_scan_interval !== undefined ? config.auto_scan_interval : 24}" min="0" max="168" class="form-input">
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Set to 0 to disable background scanning. Default is 24.</p>
        </div>
        
        <h3 style="grid-column: 1 / -1; margin-top: 15px; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 5px;">Security & Access</h3>
        <div class="form-group">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" name="open_registration" value="true" ${config.open_registration === 'true' ? 'checked' : ''}>
            Enable Open Registration
          </label>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">If enabled, anyone can register without an invite token.</p>
        </div>
        <div class="form-group">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" name="require_login_to_view" value="true" ${config.require_login_to_view === 'true' ? 'checked' : ''}>
            Private Instance Mode
          </label>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">If enabled, guests will be forced to log in before viewing any content.</p>
        </div>

        <div style="grid-column: 1 / -1; margin-top:20px">
          <button type="submit" class="btn btn-primary">Save System Settings</button>
        </div>
      </form>`;
  },

  smtpSettingsForm(config = {}) {
    return `
      <form onsubmit="App.handleSaveSMTP(event)" class="form-grid">
        <div class="form-group">
          <label>SMTP Host</label>
          <input type="text" name="smtp_host" value="${config.smtp_host || ''}" placeholder="smtp.gmail.com" class="form-input">
        </div>
        <div class="form-group">
          <label>SMTP Port</label>
          <input type="number" name="smtp_port" value="${config.smtp_port || 587}" class="form-input">
        </div>
        <div class="form-group">
          <label>SMTP User</label>
          <input type="text" name="smtp_user" value="${config.smtp_user || ''}" class="form-input">
        </div>
        <div class="form-group">
          <label>SMTP Password</label>
          <input type="password" name="smtp_pass" value="${config.smtp_pass || ''}" class="form-input">
        </div>
        <div class="form-group">
          <label>From Email</label>
          <input type="text" name="smtp_from" value="${config.smtp_from || ''}" placeholder="GyroidVault <noreply@example.com>" class="form-input">
        </div>
        <div class="form-group">
          <label>Secure (SSL/TLS)</label>
          <select name="smtp_secure" class="form-input">
            <option value="false" ${config.smtp_secure === 'false' ? 'selected' : ''}>STARTTLS (Port 587)</option>
            <option value="true" ${config.smtp_secure === 'true' ? 'selected' : ''}>SSL (Port 465)</option>
          </select>
        </div>
        <div style="margin-top:20px; display:flex; gap:10px;">
          <button type="submit" class="btn btn-primary">Save SMTP Settings</button>
          <button type="button" class="btn btn-secondary" onclick="App.testSMTP(event)">Send Test Email</button>
        </div>
      </form>`;
  },

  profilePage(user) {
    return `
      <div class="page-header">
        <div><h1 class="page-title">My Profile</h1><p class="page-subtitle">Manage your account settings</p></div>
      </div>
      <div class="card" style="max-width:600px">
        <form onsubmit="App.handleUpdateProfile(event)" class="form-grid">
          <div class="form-group">
            <label>Username</label>
            <input type="text" name="username" value="${user.username}" required class="form-input">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" value="${user.email || ''}" required class="form-input">
          </div>
          <div class="form-group">
            <label>New Password (leave blank to keep current)</label>
            <input type="password" name="password" placeholder="••••••••" class="form-input">
          </div>
          <div style="margin-top:20px">
            <button type="submit" class="btn btn-primary">Update Profile</button>
          </div>
        </form>
      </div>`;
  },

  projectsPage(projects) {
    const list = projects.map(p => this.projectCard(p)).join('');
    return `
      <div class="page-header">
        <div><h1 class="page-title">Collections</h1><p class="page-subtitle">Group models into collections</p></div>
        <button class="btn btn-primary" onclick="App.showCreateProject()">+ New Collection</button>
      </div>
      <div class="model-grid">
        ${list || '<div class="empty-state" style="grid-column: 1/-1">No collections yet</div>'}
      </div>`;
  },

  projectCard(p) {
    return `
      <div class="model-card" onclick="App.navigate('/projects/${p.id}')">
        <div class="model-card-thumb">
          ${p.thumbnail ? `<img src="/uploads/${p.thumbnail}">` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:3rem;opacity:.1">📁</div>'}
        </div>
        <div class="model-card-body">
          <div class="model-card-title">${p.visibility === 'private' ? '🔒 ' : ''}${p.name}</div>
          <div class="model-card-meta">${p.model_count} models</div>
        </div>
      </div>`;
  },

  projectDetail(project) {
    const models = project.models.map(m => this.modelCard(m)).join('');
    return `
      <div class="page-header">
        <div>
          <div class="breadcrumbs" style="margin-bottom:8px">
            <a href="#/collections"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg> Back to Collections</a>
          </div>
          <h1 class="page-title">${project.visibility === 'private' ? '🔒 ' : ''}${project.name}</h1>
          <p class="page-subtitle">${project.description || 'No description'}</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-danger btn-sm" onclick="App.deleteProject(${project.id})">🗑 Delete</button>
        </div>
      </div>
      <div class="model-grid">
        ${models || '<div class="empty-state" style="grid-column: 1/-1">No models in this collection yet</div>'}
      </div>`;
  },

  projectForm(project = null) {
    return `
      <form onsubmit="App.handleProjectSubmit(event, ${project?.id || 'null'})" class="form-grid">
        <div class="form-group">
          <label>Collection Name</label>
          <input type="text" name="name" value="${project?.name || ''}" required class="form-input" placeholder="e.g. Iron Man Helm">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea name="description" class="form-textarea" placeholder="What is this collection about?">${project?.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Visibility</label>
          <select name="visibility" class="form-input">
            <option value="public" ${project?.visibility === 'public' ? 'selected' : ''}>Public (Visible to everyone)</option>
            <option value="private" ${project?.visibility === 'private' ? 'selected' : ''}>Private (Only you can see this)</option>
          </select>
        </div>
        <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:8px">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">${project ? 'Save' : 'Create'}</button>
        </div>
      </form>`;
  },

  smtpTestModal(defaultEmail = '') {
    return `
      <form onsubmit="App.handleSendTestEmail(event)" class="form-grid">
        <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 16px;">
          Enter the email address where you would like to receive the test message.
        </p>
        <div class="form-group">
          <label>Recipient Email</label>
          <input type="email" name="test_email" value="${defaultEmail}" required placeholder="e.g. you@example.com" class="form-input">
        </div>
        <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="send-test-btn">Send Test</button>
        </div>
      </form>`;
  },

  shareModal(modelId) {
    return `
      <div class="form-grid">
        <p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:16px">Create a public link to share this model with others.</p>
        <div class="form-group">
          <label>Expiry (optional)</label>
          <select id="share-expiry" class="form-input">
            <option value="">Never expires</option>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="App.generateShare(${modelId})" style="width:100%;margin-top:10px">Generate Link</button>
        <div id="share-result" style="margin-top:20px;display:none">
          <label>Public Link</label>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input type="text" id="share-link-input" readonly class="form-input" style="flex:1">
            <button class="btn btn-secondary" onclick="App.copyShareLink()">Copy</button>
          </div>
        </div>
      </div>`;
  },

  publicModelDetail(model) {
    // Simplified version of modelDetail for public viewing
    const stlFile = model.files.find(f => f.file_type === 'stl') || model.files.find(f => f.file_type === '3mf');
    return `
      <div style="max-width:1000px;margin:0 auto;padding:20px">
        <div class="detail-header">
          <div><h1 class="page-title">${model.name}</h1><p class="page-subtitle">Public Shared Model</p></div>
        </div>
        <div class="detail-layout">
          <div>
            ${stlFile ? `
              <div class="glass-panel" style="margin-bottom:24px">
                <div class="panel-header"><div class="panel-title">🔮 3D Preview</div></div>
                <div class="panel-body no-pad">
                  <div class="viewer-container" id="public-viewer" data-stl-url="${stlFile.url}"></div>
                </div>
              </div>` : ''}
            <div class="glass-panel">
              <div class="panel-header"><div class="panel-title">📝 Description</div></div>
              <div class="panel-body">${model.description || 'No description'}</div>
            </div>
          </div>
          <div>
            <div class="glass-panel">
              <div class="panel-header"><div class="panel-title">📁 Files</div></div>
              <div class="panel-body no-pad">
                ${model.files.map(f => `
                  <div class="file-item">
                    <div style="flex:1">
                      <div class="file-name">${f.original_name}</div>
                      <div class="file-meta">${this.formatSize(f.file_size)}</div>
                    </div>
                    <a href="${f.url}" download class="btn btn-ghost" style="padding:6px">📥</a>
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  aboutSection(versionInfo = {}) {
    const renderedChangelog = this.renderMarkdown(versionInfo.changelog || 'No release notes available.');
    return `
      <div class="glass-panel">
        <div class="panel-header"><div class="panel-title">About GyroidVault</div></div>
        <div class="panel-body">
          <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:24px;flex-wrap:wrap">
            <div style="width:80px;height:80px;background:var(--accent-gradient);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:3rem;box-shadow:0 8px 16px rgba(0,0,0,0.2)">🗄️</div>
            <div style="flex:1">
              <h3 style="margin:0 0 4px 0;font-size:1.4rem;background:var(--accent-gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent">GyroidVault</h3>
              <p style="margin:0;font-size:.9rem;color:var(--text-secondary)">Self-hosted 3D model management for enthusiasts and professionals.</p>
              <div style="margin-top:12px;display:flex;gap:12px">
                <a href="https://github.com/TeeCodeDev/GyroidVault" target="_blank" class="btn btn-secondary btn-xs">
                  <svg height="14" viewBox="0 0 16 16" width="14" style="vertical-align:middle;margin-right:6px"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
                  GitHub Repository
                </a>
                <a href="https://ko-fi.com/D1D51ZGUNL" target="_blank" class="btn btn-secondary btn-xs" style="color:#f59e0b;border-color:rgba(245,158,11,0.3)">
                  <svg height="14" viewBox="0 0 24 24" width="14" style="vertical-align:middle;margin-right:6px"><path fill="currentColor" d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.724c-.304 0-.55.245-.55.55v14.23c0 .305.246.55.55.55h16.471c.305 0 .55-.245.55-.55 0-2.81 2.503-2.658 2.503-6.19 0-1.63-.231-3.081-.231-3.081s4.536.852 3.864-1.416zm-7.653 4.295c-.328.328-.775.464-1.121.353-.346-.111-.57-.424-.57-.751 0-.327.224-.64.57-.751.346-.111.793.025 1.121.353.328.328.328.86 0 1.188z"></path></svg>
                  Buy me a Coffee
                </a>
            </div>
          </div>
          
          <div style="border-top:1px solid var(--border);padding-top:20px;margin-top:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <div style="font-weight:600;font-size:.95rem">Version Information</div>
              <span class="badge badge-tag" style="background:var(--bg-input)">v${versionInfo.currentVersion || '1.0.0'}</span>
            </div>
            
            ${versionInfo.hasUpdate ? `
              <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);padding:16px;border-radius:8px;margin-bottom:20px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div style="color:#f59e0b;font-weight:600">🚀 Update available: v${versionInfo.latestVersion}</div>
                  <a href="${versionInfo.url}" target="_blank" class="btn btn-primary btn-xs">View on GitHub</a>
                </div>
              </div>
            ` : '<div style="color:var(--success);font-size:.85rem;margin-bottom:20px">✓ You are running the latest version</div>'}

            <div style="font-weight:600;font-size:.95rem;margin-bottom:12px">What\'s New</div>
            <div class="changelog-body" style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:20px;max-height:600px;overflow-y:auto;font-size:.9rem;line-height:1.6;color:var(--text-secondary)">${renderedChangelog}</div>
          </div>
        </div>
      </div>`;
  },

  renderMarkdown(text) {
    if (!text) return '';
    return text
      // Headers
      .replace(/^### (.*$)/gim, '<h4 style="margin:16px 0 8px;color:var(--text-primary)">$1</h4>')
      .replace(/^## (.*$)/gim, '<h3 style="margin:20px 0 10px;color:var(--accent-cyan)">$1</h3>')
      .replace(/^# (.*$)/gim, '<h2 style="margin:24px 0 12px;color:var(--accent-cyan)">$1</h2>')
      // Bold
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      // Lists
      .replace(/^\* (.*$)/gim, '<li style="margin-left:20px;margin-bottom:4px">$1</li>')
      .replace(/^- (.*$)/gim, '<li style="margin-left:20px;margin-bottom:4px">$1</li>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" style="color:var(--accent-cyan)">$1</a>')
      // Newlines to BR
      .replace(/\n/gim, '<br>');
  }
};
