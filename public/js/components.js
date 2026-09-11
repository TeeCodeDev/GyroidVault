/* ─── UI Components ───────────────────────────────────────────────────── */
const UI = {
  // HTML entity escaping helper
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Safe URL protocol validator (only http, https, mailto allowed)
  safeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) return trimmed;
    return '';
  },

  // Gradient generator based on string hash
  gradient(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    const h1 = Math.abs(h % 360), h2 = (h1 + 40) % 360;
    return `linear-gradient(135deg, hsl(${h1},70%,25%), hsl(${h2},60%,15%))`;
  },

  formatSize(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i < 0) i = 0;
    if (i >= u.length) i = u.length - 1;
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
      bgcode: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12H9"></path><path d="M15 9H9"></path><path d="M12 15H9"></path></svg>',
      image: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
      '3mf': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>',
      step: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11.5 2.1-4.8 1.4c-.6.2-1 .6-1.1 1.2l-.7 4.2c-.1.5.1 1 .5 1.3l3.2 2.7c.4.3.9.4 1.4.2l4.8-1.4c.6-.2 1-.6 1.1-1.2l.7-4.2c.1-.5-.1-1-.5-1.3L12.9 2.3c-.4-.3-.9-.4-1.4-.2Z"></path><path d="M6 15v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"></path><path d="m12 11 4 3"></path><path d="m12 11-4 3"></path><path d="M12 11v6"></path></svg>',
      f3d: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><path d="M3.27 6.96L12 12.01l8.73-5.05"></path><path d="M12 22.08V12"></path></svg>',
      obj: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>'
    };
    const icon = icons[type] || `<span style="font-size:.65rem">${type.toUpperCase().substring(0,3)}</span>`;
    return `<div class="file-icon ${type}">${icon}</div>`;
  },

  // dashboard stats 
  statsCards(stats) {
    return `<div class="stats-grid">
      <div class="stat-card"><div class="stat-icon cyan"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div><div class="stat-value">${stats.totalModels}</div><div class="stat-label">Total Models</div></div>
      <div class="stat-card"><div class="stat-icon green"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="stat-value">${stats.printedModels}</div><div class="stat-label">Printed Models</div></div>
      <div class="stat-card"><div class="stat-icon purple"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></div><div class="stat-value">${stats.successRate}%</div><div class="stat-label">Success Rate</div></div>
      <div class="stat-card"><div class="stat-icon pink"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><div class="stat-value">${stats.totalFiles}</div><div class="stat-label">Total Files (${this.formatSize(stats.totalSize)})</div></div>
    </div>`;
  },
  // breadcrumb nav for folder browser
  breadcrumbs(currentPath) {
    const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];
    let crumbs = `<a href="#" onclick="event.preventDefault();App.browseTo('')" style="color:var(--accent-cyan);text-decoration:none;font-weight:600;display:inline-flex;align-items:center;gap:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Home</a>`;
    
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
        ${arrow} <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;color:#f59e0b"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>${node.name}
      </div>`;
      
      if (hasChildren) {
        const childrenHtml = node.children.map(c => renderNode(c, depth + 1)).join('');
        html += `<div class="tree-children ${isOpen ? '' : 'collapsed'}" style="${isOpen ? '' : 'display:none'}">${childrenHtml}</div>`;
      }
      return html;
    }
    
    // root item
    const isRootActive = activePath === '';
    let html = `<div class="tree-node" style="padding:4px 8px;cursor:pointer;border-radius:4px;font-size:.8rem;font-weight:600;display:flex;align-items:center;gap:6px;${isRootActive ? 'background:rgba(0,212,255,0.15);color:var(--accent-cyan)' : 'color:var(--text-secondary)'}" onclick="App.browseTo('')" ondragover="event.preventDefault(); this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="App.handleDrop(event, '')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Library Root
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
        ${folder.thumbnails && folder.thumbnails.length > 0 
          ? (folder.thumbnails.length === 1
            ? `<img src="${folder.thumbnails[0]}" style="width:100%;height:100%;object-fit:cover" loading="lazy">`
            : `<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:${folder.thumbnails.length > 2 ? '1fr 1fr' : '1fr'};width:100%;height:100%;gap:1px;background:var(--bg-card)">
                ${folder.thumbnails.map((t, i) => `<img src="${t}" style="width:100%;height:100%;object-fit:cover;${folder.thumbnails.length === 3 && i === 2 ? 'grid-column:span 2' : ''}" loading="lazy">`).join('')}
              </div>`)
          : `<div class="model-card-placeholder" style="background:linear-gradient(135deg, hsl(220,50%,22%), hsl(240,40%,16%));display:flex;align-items:center;justify-content:center;color:var(--text-muted);opacity:.5"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>`
        }
      </div>
      <div class="model-card-body">
        <div class="model-card-name">${folder.name}</div>
        <div class="model-card-meta"><span class="badge badge-stl">${folder.itemCount} items</span></div>
      </div>
    </div>`;
  },

  browseFileCard(file) {
    const is3D = file.type === 'stl' || file.type === '3mf';
    const isGcode = file.type === 'gcode';
    let thumb;
    if (file.thumbnailUrl) {
      thumb = `<img src="${file.thumbnailUrl}" alt="${file.name}">`;
    } else if (is3D) {
      thumb = `<div class="model-card-placeholder stl-thumb-target" data-stl-url="${file.url}?t=${Date.now()}" style="background:${this.gradient(file.name)};display:flex;align-items:center;justify-content:center"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>`;
    } else if (file.type === 'image') {
      thumb = `<img src="${file.url}" alt="${file.name}">`;
    } else if (isGcode) {
      thumb = `<div class="model-card-placeholder" style="background:linear-gradient(135deg, #78350f, #b45309);color:#fbbf24;display:flex;align-items:center;justify-content:center"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.6"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></div>`;
    } else {
      thumb = `<div class="model-card-placeholder" style="background:${this.gradient(file.name)};display:flex;align-items:center;justify-content:center"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>`;
    }
    
    const folderLabel = file.folderPath ? `<div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;display:flex;align-items:center;gap:3px" title="${file.folderPath}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#f59e0b"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>${file.folderPath}</div>` : '';
    const itemPath = `${file.folderPath ? file.folderPath+'/' : ''}${file.name}`;
    const isSelected = App.selectedBrowsePaths?.includes(itemPath);
    
    // Metadata summary chips
    let metaChips = '';
    if (file.metadata) {
      const chips = [];
      if (file.metadata.printTime) chips.push(`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:2px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${file.metadata.printTime}`);
      if (file.metadata.filamentType) chips.push(`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:2px"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>${file.metadata.filamentType}`);
      if (file.metadata.tempNozzle) chips.push(`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:2px"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>${file.metadata.tempNozzle}°C`);
      if (chips.length) {
        metaChips = `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${chips.map(c => `<span style="font-size:0.65rem;background:var(--bg-input);padding:1px 5px;border-radius:4px;color:var(--text-secondary);border:1px solid var(--border)">${c}</span>`).join('')}</div>`;
      }
    }

    const clickData = encodeURIComponent(JSON.stringify(file));
    const clickHandler = `onclick="App.openBrowseFileModal('${clickData}')" style="cursor:pointer"`;

    return `<div class="model-card ${isSelected ? 'selected' : ''}" data-path="${itemPath}" draggable="true" ondragstart="App.handleDragStart(event, '${itemPath}')" ${clickHandler}>
      <div class="model-card-checkbox" onclick="event.stopPropagation(); App.toggleBrowseSelection('${itemPath}')"></div>
      <div class="model-card-thumb">${thumb}<div class="model-card-badges"><span class="badge badge-${file.ext || file.type}">${file.ext || file.type}</span></div></div>
      <div class="model-card-body">
        <div class="model-card-name" title="${file.name}">${file.name}</div>
        ${folderLabel}
        <div class="model-card-meta" style="font-size:.75rem;color:var(--text-muted)">${this.formatSize(file.size)}</div>
        ${metaChips}
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
      thumb = `<div class="model-card-placeholder stl-thumb-target" data-stl-url="${stlUrl}?t=${Date.now()}" style="background:${this.gradient(m.name)};display:flex;align-items:center;justify-content:center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.35"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>`;
    } else {
      thumb = `<div class="model-card-placeholder" style="background:${this.gradient(m.name)};display:flex;align-items:center;justify-content:center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.35"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>`;
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
    const canEdit = App.currentUser?.role === 'admin' || (App.currentUser?.role !== 'viewer' && m.user_id === App.currentUser?.id);
    const plusBtn = canEdit ? `<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();App.addToProject(${m.id})" title="Add to project" style="margin-top:-4px;margin-right:-8px;padding:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>` : '';

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
          <button class="btn btn-secondary btn-sm" onclick="App.openBulkTag()" style="display:inline-flex;align-items:center;gap:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>Tag</button>
          <button class="btn btn-secondary btn-sm" onclick="App.openBulkAddToCollection()" style="display:inline-flex;align-items:center;gap:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>Collection</button>
          <button class="btn btn-danger btn-sm" onclick="App.openBulkDelete()" style="display:inline-flex;align-items:center;gap:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>
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
          <button class="btn btn-secondary btn-sm" onclick="App.openBulkBrowseMove()" style="display:inline-flex;align-items:center;gap:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Move</button>
          <button class="btn btn-secondary btn-sm" onclick="App.openBulkBrowseTag()" style="display:inline-flex;align-items:center;gap:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>Tag</button>
          <button class="btn btn-danger btn-sm" onclick="App.openBulkBrowseDelete()" style="display:inline-flex;align-items:center;gap:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>
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

  bulkTagForm(tags = []) {
    const tagCheckboxes = tags.map(t =>
      `<label class="tag-pill-checkbox">
        <input type="checkbox" name="tags" value="${t.name}">
        <span class="tag-pill">${t.name}</span>
      </label>`
    ).join('');

    return `
      <form onsubmit="App.handleBulkTagSubmit(event)">
        <div class="form-group">
          <label class="form-label">Tags</label>
          <div id="bulk-tags-container" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            ${tagCheckboxes}
          </div>
          <div class="add-inline" style="max-width:250px;margin-top:4px">
            <input type="text" id="new-bulk-tag-input" class="form-input" placeholder="Add new tag (comma separated)...">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Tag Models</button>
        </div>
      </form>`;
  },

  modelDetail(model, hasPrinters = false) {
    const canEdit = App.currentUser?.role === 'admin' || (App.currentUser?.role !== 'viewer' && model.user_id === App.currentUser?.id);
    const cat = model.category_name
      ? `<span class="badge badge-category" style="background:${model.category_color}20;color:${model.category_color};border:1px solid ${model.category_color}33">${model.category_name}</span>`
      : '';
    const tags = (model.tags || []).map(t => `<span class="badge badge-tag">${t.name}</span>`).join('');
    const printed = model.has_printed
      ? '<span class="badge badge-printed">✓ Printed</span>'
      : '<span class="badge badge-not-printed">Not printed</span>';
    const cleanSourceUrl = this.safeUrl(model.source_url);
    const sourceLink = cleanSourceUrl
      ? `<a href="${this.escapeHtml(cleanSourceUrl)}" target="_blank" rel="noopener noreferrer" class="badge badge-category" style="background:var(--bg-tertiary);color:var(--accent-cyan);text-decoration:none;border:1px solid var(--border)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Source</a>`
      : '';

    // Find first STL or 3MF file for 3D preview
    const stlFile = (model.files || []).find(f => f.file_type === 'stl' || f.file_type === '3mf');
    let viewerHtml;

    if (stlFile) {
      viewerHtml = `
      <div class="glass-panel" style="margin-bottom:24px;overflow:visible">
        <div class="panel-header">
          <div class="panel-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>3D Studio</div>
        </div>
        <div class="panel-body no-pad">
          <div class="viewer-container" id="stl-viewer-${model.id}" data-stl-url="${stlFile.url || '/uploads/'+stlFile.filename}" data-fallback-thumbnail="${model.thumbnail_url || ''}">
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted)">Loading 3D preview...</div>
          </div>
          <div style="padding:12px 16px;font-size:.7rem;color:var(--text-muted);border-top:1px solid var(--border);background:rgba(0,0,0,0.1)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Drag to rotate · Scroll to zoom · Right-click to pan
          </div>
        </div>
      </div>`;
    } else if (model.thumbnail_url) {
      viewerHtml = `
      <div class="glass-panel" style="margin-bottom:24px;overflow:hidden">
        <div class="panel-header">
          <div class="panel-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Model Preview</div>
        </div>
        <div class="panel-body no-pad" style="height:400px;background:var(--bg-dark);display:flex;align-items:center;justify-content:center">
          <img src="${model.thumbnail_url}" style="max-width:100%;max-height:100%;object-fit:contain">
        </div>
      </div>`;
    } else {
      viewerHtml = `
      <div class="glass-panel" style="margin-bottom:24px;overflow:visible">
        <div class="panel-header">
          <div class="panel-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>3D Studio</div>
        </div>
        <div class="panel-body">
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:350px;color:var(--text-muted);text-align:center">
            <div style="margin-bottom:16px;opacity:.25;color:var(--text-muted)"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
            <div style="font-size:1.1rem;font-weight:600;color:var(--text-secondary)">No 3D Preview Available</div>
            <div style="font-size:.85rem;margin-top:6px;max-width:280px">Upload an STL or 3MF file to this model to enable the interactive 3D viewer.</div>
          </div>
        </div>
      </div>`;
    }

    const gcodeFiles = (model.files || []).filter(f => f.file_type === 'gcode');
    let gcodeHtml = '';
    if (gcodeFiles.length > 0) {
      gcodeHtml = `
        <div class="glass-panel" style="margin-bottom:16px; border: 1px solid var(--accent-cyan); box-shadow: 0 0 10px rgba(0, 212, 255, 0.1);">
          <div class="panel-header">
            <div class="panel-title" style="color:var(--accent-cyan)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>G-Code Profiles</div>
          </div>
          <div class="panel-body no-pad">
            ${gcodeFiles.map(f => {
              const meta = typeof f.metadata === 'string' ? JSON.parse(f.metadata) : f.metadata || {};
              return `
              <div style="padding:16px; border-bottom:1px solid var(--border)">
                <div style="font-weight:600; margin-bottom:10px; word-break:break-all; font-size: 0.9rem;">${f.original_name || f.filename}</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.85rem;">
                  <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                    <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Est. Time</div>
                    <div style="font-weight:600">${meta.printTime || 'Unknown'}</div>
                  </div>
                  <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                    <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Weight</div>
                    <div style="font-weight:600">${meta.weight ? meta.weight + 'g' : 'Unknown'}</div>
                  </div>
                  <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                    <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Material</div>
                    <div style="font-weight:600">${meta.filamentType || 'Unknown'}</div>
                  </div>
                  <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                    <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Layer Height</div>
                    <div style="font-weight:600">${meta.layerHeight ? meta.layerHeight + 'mm' : 'Unknown'}</div>
                  </div>
                  
                  ${(meta.infill || meta.infillPattern || meta.tempNozzle || meta.tempBed || meta.supports !== undefined || meta.slicer || meta.printerModel || meta.wallLoops || meta.topBottomLayers || meta.filamentCost || meta.maxVolumetricSpeed) ? `
                  <div id="gcode-extra-${f.id}" style="display:none; grid-column: span 2; margin-top:4px;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.85rem;">
                      ${meta.infill || meta.infillPattern ? `
                      <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                        <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Infill</div>
                        <div style="font-weight:600">${meta.infill ? meta.infill + (!String(meta.infill).endsWith('%') ? '%' : '') : ''} ${meta.infillPattern ? '(' + meta.infillPattern + ')' : ''}</div>
                      </div>` : ''}
                      ${meta.wallLoops || meta.topBottomLayers ? `
                      <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                        <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Walls & Layers</div>
                        <div style="font-weight:600">${meta.wallLoops ? meta.wallLoops + ' Walls' : ''} ${meta.topBottomLayers ? (meta.wallLoops ? ' / ' : '') + meta.topBottomLayers + ' Top/Bot' : ''}</div>
                      </div>` : ''}
                      ${meta.tempNozzle ? `
                      <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                        <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Nozzle Temp</div>
                        <div style="font-weight:600">${meta.tempNozzle}</div>
                      </div>` : ''}
                      ${meta.tempBed ? `
                      <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                        <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Bed Temp</div>
                        <div style="font-weight:600">${meta.tempBed}</div>
                      </div>` : ''}
                      ${meta.supports !== undefined ? `
                      <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                        <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Supports</div>
                        <div style="font-weight:600">${meta.supports === '1' || meta.supports === 1 || meta.supports === 'true' ? 'Yes' : 'No'}</div>
                      </div>` : ''}
                      ${meta.maxVolumetricSpeed ? `
                      <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                        <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Max Vol. Speed</div>
                        <div style="font-weight:600">${meta.maxVolumetricSpeed} mm³/s</div>
                      </div>` : ''}
                      ${meta.filamentCost ? `
                      <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                        <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Print Cost</div>
                        <div style="font-weight:600">${meta.filamentCost}</div>
                      </div>` : ''}
                      ${meta.slicer ? `
                      <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                        <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Slicer</div>
                        <div style="font-weight:600">${meta.slicer}</div>
                      </div>` : ''}
                      ${meta.printerModel ? `
                      <div style="background:var(--bg-input); padding:8px; border-radius:var(--radius-sm)">
                        <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em">Printer</div>
                        <div style="font-weight:600">${meta.printerModel}</div>
                      </div>` : ''}
                    </div>
                  </div>
                  <div style="grid-column: span 2; text-align:center; margin-top:4px;">
                    <button class="btn btn-ghost btn-xs" style="color:var(--text-muted)" onclick="const el = document.getElementById('gcode-extra-${f.id}'); const isHidden = el.style.display === 'none'; el.style.display = isHidden ? 'block' : 'none'; this.innerText = isHidden ? 'Hide Details' : 'Show More Details';">Show More Details</button>
                  </div>
                  ` : ''}
                </div>
                <div style="margin-top:12px; display:flex; gap:8px">
                  <button class="btn btn-ghost btn-sm" style="color:var(--accent-cyan);border:1px solid rgba(0,212,255,0.4);" onclick="App.previewStl(${model.id}, '${f.url || '/uploads/'+f.filename}', 'gcode')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Preview G-Code</button>
                  ${hasPrinters ? `<button class="btn btn-primary btn-sm" style="flex:1" onclick="App.sendToPrinter(${f.id})">Send to Printer</button>` : ''}
                  <a href="/api/files/${f.id}/download/${encodeURIComponent(f.filename)}" class="btn btn-secondary btn-sm" download>Download</a>
                </div>
              </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    const filesHtml = (model.files || []).filter(f => f.file_type !== 'document').map(f => {
      let metaHtml = '';
      const isPreview = Boolean(f.is_preview || f.id === model.preview_file_id);
      const is3D = f.file_type === 'stl' || f.file_type === '3mf';
      const isGcode = f.file_type === 'gcode' || f.file_type === 'bgcode';

      const slicerLinks = {
        'orcaslicer': { name: 'OrcaSlicer', url: `orcaslicer://open?file=${encodeURI(window.location.origin + '/api/files/' + f.id + '/download/model.' + f.file_type)}` },
        'elegooslicer': { name: 'Elegoo Slicer', url: `elegooslicer://open?file=${encodeURI(window.location.origin + '/api/files/' + f.id + '/download/model.' + f.file_type)}` },
        'cura': { name: 'Ultimaker Cura', url: `cura://open?file=${encodeURI(window.location.origin + '/api/files/' + f.id + '/download/model.' + f.file_type)}` }
      };
      const pref = App.currentUser?.preferred_slicer;

      let slicerBtnHtml = '';
      if (is3D) {
        if (pref && slicerLinks[pref]) {
          slicerBtnHtml = `
            <div style="display:inline-flex;align-items:stretch">
              <a href="${slicerLinks[pref].url}" class="btn btn-ghost btn-xs" title="Open in ${slicerLinks[pref].name}" style="color:var(--accent-purple);font-weight:600;font-size:0.7rem;border:1px solid var(--accent-purple);border-right:none;padding:3px 8px;border-radius:4px 0 0 4px;line-height:1;white-space:nowrap;display:inline-flex;align-items:center;gap:5px">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                OPEN IN ${slicerLinks[pref].name.toUpperCase()}
              </a>
              <div class="dropdown">
                <button class="btn btn-ghost btn-xs" style="color:var(--accent-purple);border:1px solid var(--accent-purple);padding:3px 6px;border-radius:0 4px 4px 0;height:100%;display:flex;align-items:center"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
                <div class="dropdown-content">
                  <div class="dropdown-header">Other Slicers</div>
                  ${Object.entries(slicerLinks).filter(([k]) => k !== pref).map(([_, s]) => `<a href="${s.url}">${s.name}</a>`).join('')}
                </div>
              </div>
            </div>
          `;
        } else {
          slicerBtnHtml = `
            <div class="dropdown" style="display:inline-block">
              <button class="btn btn-ghost btn-xs" title="Open in Slicer" style="color:var(--accent-purple);font-weight:600;font-size:0.7rem;border:1px solid var(--accent-purple);padding:3px 8px;border-radius:4px;line-height:1;white-space:nowrap;display:inline-flex;align-items:center;gap:5px">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                OPEN IN SLICER
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="dropdown-content">
                <div class="dropdown-header">Open in Slicer</div>
                ${Object.values(slicerLinks).map(s => `<a href="${s.url}">${s.name}</a>`).join('')}
              </div>
            </div>
          `;
        }
      }

      const hasBottomBar = (canEdit && !isPreview && is3D) || is3D;

      return `
      <div class="file-item-card" style="padding:10px 14px;border-bottom:1px solid var(--border);transition:background var(--transition)">
        <!-- Top Row: Icon, File Details, Quick Action Buttons -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
            ${this.fileTypeIcon(f.file_type)}
            <div style="min-width:0;flex:1">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span class="file-name" style="font-weight:600;font-size:0.85rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%" title="${f.original_name}">${f.original_name}</span>
                ${isPreview ? `<span class="badge badge-primary badge-xs" style="font-size:0.65rem;padding:2px 6px;background:rgba(0,212,255,0.15);color:var(--accent-cyan);border:1px solid rgba(0,212,255,0.3);display:inline-flex;align-items:center;gap:3px"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Primary</span>` : ''}
              </div>
              <div class="file-meta" style="font-size:0.72rem;color:var(--text-muted);display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:2px">
                <span>${this.formatSize(f.file_size)}</span>
                <span>·</span>
                <span>${this.formatDateShort(f.uploaded_at)}</span>
                <span>·</span>
                <span style="display:inline-flex;align-items:center;gap:3px">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;opacity:0.8"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
                  ${f.uploader_name || 'System'}
                </span>
              </div>
            </div>
          </div>
          <!-- Quick Actions: 3D Preview Eye, Download, Delete -->
          <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
            ${(is3D || isGcode) ? `<button class="file-action-btn preview" onclick="event.stopPropagation();App.previewStl(${model.id},'${f.url || '/uploads/'+f.filename}', '${f.file_type}')" title="Preview 3D / G-Code"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>` : ''}
            <a href="/api/files/${f.id}/download" class="file-action-btn" title="Download file"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>
            ${canEdit ? `<button class="file-action-btn delete" onclick="event.stopPropagation();App.confirmDeleteFile(${f.id},'${(f.original_name || f.filename).replace(/'/g, "\\'")}',${model.id})" title="Delete file"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
          </div>
        </div>

        <!-- Optional Bottom Action Bar (Slicer / Set Preview) -->
        ${hasBottomBar ? `
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.06);flex-wrap:wrap">
          ${(canEdit && !isPreview && is3D) ? `<button class="btn btn-ghost btn-xs" style="color:var(--text-secondary);font-size:0.7rem;border:1px solid var(--border);padding:3px 8px;border-radius:4px;display:inline-flex;align-items:center;gap:4px;transition:all var(--transition)" onclick="event.stopPropagation();App.setPreviewFile(${model.id}, ${f.id})" title="Use this file as model 3D preview"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Set as Preview</button>` : ''}
          ${slicerBtnHtml}
        </div>` : ''}
      </div>`;
    }).join('');

    const docsHtml = (model.files || []).filter(f => f.file_type === 'document').map(f => {
      return `
      <div class="file-item">
        <div class="file-type-icon" style="background:rgba(255,165,0,0.2);color:#ffa500;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.7rem">DOC</div>
        <div class="file-info">
          <div class="file-name">${f.original_name}</div>
          <div class="file-meta" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:2px">
            <span>${this.formatSize(f.file_size)}</span>
            <span>·</span>
            <span>${this.formatDate(f.uploaded_at)}</span>
            <span>·</span>
            <span style="display:inline-flex;align-items:center;gap:3px">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${f.uploader_name || 'System'}
            </span>
          </div>
        </div>
        <div class="file-actions" style="display:flex;gap:4px;align-items:center">
          <a href="/api/files/${f.id}/download" target="_blank" class="btn btn-ghost" style="padding:6px;color:var(--accent-cyan)" title="View Document"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></a>
          ${canEdit ? `<button class="btn btn-ghost" style="padding:6px;color:var(--error)" onclick="event.stopPropagation();App.confirmDeleteFile(${f.id},'${(f.original_name || f.filename).replace(/'/g, "\\'")}',${model.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>` : ''}
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
        ${canEdit ? `<button class="btn btn-ghost" style="padding:6px;color:var(--error)" onclick="App.deletePrint(${p.id},${model.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>` : ''}
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
          <div class="detail-title">${this.escapeHtml(model.name)}</div>
          <div class="detail-meta">${cat} ${printed}</div>
        </div>
        <div class="detail-actions">
          ${canEdit ? `
          <button class="btn btn-secondary btn-sm" onclick="App.showShareModal(${model.id})" title="Share Model">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          <button class="btn btn-secondary btn-sm" onclick="App.addToProject(${model.id})" title="Add to Collection">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Collection
          </button>
          <button class="btn btn-secondary btn-sm" onclick="App.showCreateVersion(${model.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Version
          </button>
          <button class="btn btn-secondary btn-sm" onclick="App.showEditModel(${model.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <button class="btn btn-danger btn-sm" onclick="App.confirmDeleteModel(${model.id})">
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
            <div class="panel-header"><div class="panel-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Description</div></div>
            <div class="panel-body"><div class="detail-description">${this.renderMarkdown(model.description)}</div></div>
          </div>` : ''}
          ${(tags || sourceLink) ? `
          <div class="glass-panel" style="margin-bottom:24px">
            <div class="panel-header"><div class="panel-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>Tags & Links</div></div>
            <div class="panel-body">
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${tags}
                ${sourceLink}
              </div>
            </div>
          </div>` : ''}
        </div>

        <div>
          ${gcodeHtml}
          <div class="glass-panel">
            <div class="panel-header">
              <div class="panel-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print History</div>
              <button class="btn btn-secondary btn-sm" onclick="App.showLogPrint(${model.id})">+ Log Print</button>
            </div>
            <div class="panel-body">
              <div class="print-history-list">
                ${printsHtml || '<div style="color:var(--text-muted);font-size:.875rem;text-align:center;padding:16px 0">No prints recorded yet</div>'}
              </div>
            </div>
          </div>

          <div class="glass-panel" style="margin-top:16px">
            <div class="panel-header" style="border-bottom:1px solid var(--border-color);padding:0">
              <div style="display:flex;width:100%;align-items:center;">
                <div style="display:flex;gap:20px;padding:16px 16px 0 16px;flex:1">
                  <div onclick="App.switchFilesTab(event, 'files')" style="font-size:0.95rem;font-weight:600;line-height:1.4;padding-bottom:12px;cursor:pointer;border-bottom:2px solid var(--accent-cyan);color:var(--text);display:inline-flex;align-items:center;gap:6px">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                    Files (${model.files?.filter(f => f.file_type !== 'document').length || 0})
                  </div>
                  ${docsHtml ? `<div onclick="App.switchFilesTab(event, 'docs')" style="font-size:0.95rem;font-weight:600;line-height:1.4;padding-bottom:12px;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-muted);display:inline-flex;align-items:center;gap:6px">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Documentation (${model.files?.filter(f => f.file_type === 'document').length || 0})
                  </div>` : ''}
                </div>
                <div style="padding:12px 16px">
                  ${canEdit ? `<button class="btn btn-primary btn-xs" onclick="App.showUploadFiles(${model.id})" style="display:inline-flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Upload</button>` : ''}
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
            <div class="panel-header"><div class="panel-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>Other Versions</div></div>
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
            <div class="panel-header"><div class="panel-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5"/></svg>Print Tips</div></div>
            <div class="panel-body"><div class="detail-tips">${this.escapeHtml(model.print_tips)}</div></div>
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
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <label class="form-label" style="margin-bottom:0">Description (Markdown)</label>
            <div style="display:flex;gap:4px">
              <button type="button" class="btn btn-ghost btn-xs active" id="desc-tab-write" onclick="App.toggleDescTab('write')" style="padding:2px 8px;font-size:0.75rem">Write</button>
              <button type="button" class="btn btn-ghost btn-xs" id="desc-tab-preview" onclick="App.toggleDescTab('preview')" style="padding:2px 8px;font-size:0.75rem">Preview</button>
            </div>
          </div>
          <textarea class="form-textarea" id="model-description-input" name="description" placeholder="Describe this model using Markdown formatting, lists, links, images..." rows="4">${model?.description || ''}</textarea>
          <div id="model-description-preview" class="glass-panel" style="display:none;padding:12px;min-height:90px;max-height:220px;overflow-y:auto;background:var(--bg-input)"></div>
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
          <label class="form-label">Files (Optional)</label>
          <div class="upload-zone" id="create-upload-zone" onclick="document.getElementById('create-file-input').click()"
            ondragover="event.preventDefault();this.classList.add('dragover')"
            ondragleave="this.classList.remove('dragover')"
            ondrop="event.preventDefault();this.classList.remove('dragover');App.handleCreateFileDrop(event)">
            <div class="upload-zone-icon" style="color:var(--accent-cyan);opacity:0.8"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
            <div class="upload-zone-text"><strong>Click to browse</strong> or drag & drop files</div>
            <div style="color:var(--text-muted);font-size:.7rem;margin-top:4px">STL · Gcode · BGCODE · 3MF · OBJ · STEP · F3D · Images · Documents</div>
            <input type="file" id="create-file-input" multiple accept=".stl,.gcode,.bgcode,.3mf,.obj,.step,.stp,.f3d,.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md" onchange="App.handleCreateFileSelect(event)">
          </div>
          <div id="create-file-list" class="upload-file-list" style="display:none"></div>
          <div id="create-upload-progress" style="margin-top:12px"></div>
        </div>` : ''}
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="model-submit-btn">${isEdit ? 'Save Changes' : 'Create Model'}</button>
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
        <div class="upload-zone-icon" style="color:var(--accent-cyan);opacity:0.8"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
        <div class="upload-zone-text"><strong>Click to browse</strong> or drag & drop files</div>
        <div style="color:var(--text-muted);font-size:.75rem;margin-top:6px">STL · Gcode · BGCODE · 3MF · OBJ · STEP · F3D · Images · Documents</div>
        <input type="file" id="file-input" multiple accept=".stl,.gcode,.bgcode,.3mf,.obj,.step,.stp,.f3d,.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md" onchange="App.handleFileSelect(event,${modelId})">
      </div>
      <div id="upload-progress" style="margin-top:14px"></div>`;
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
    const safeName = this.escapeHtml(name || '');
    return `
      <form id="delete-model-form" onsubmit="App.handleDeleteModel(event, ${id})">
        <div style="margin-bottom: 20px; color: var(--text-secondary)">
          Are you sure you want to delete <strong>"${safeName}"</strong>?<br>
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
        <div style="display:flex;gap:4px;margin-left:auto;border-left:1px solid var(--border);padding-left:12px">
          <button class="btn btn-ghost btn-sm" id="view-mode-grid" onclick="App.setViewMode('grid')" title="Grid View" style="padding:8px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </button>
          <button class="btn btn-ghost btn-sm" id="view-mode-list" onclick="App.setViewMode('list')" title="List View" style="padding:8px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
          </button>
        </div>
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
      const isAdmin = App.currentUser?.role === 'admin';
      return `<div class="settings-item">
        <span class="settings-item-name">${color} ${item.name}${preset}</span>
        <div class="settings-item-actions">
          ${count}
          ${canDelete && isAdmin ? `<button class="btn btn-ghost btn-xs" style="color:var(--error);padding:4px" onclick="App.deleteSettingsItem('${type}',${item.id},'${item.name.replace(/'/g, "\\'")}')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>` : ''}
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

    const defaultMatBlock = type === 'materials' ? `
      <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
        <label class="form-label" style="margin-bottom:6px">Default Print Material</label>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <select class="form-select" id="default-material-select" onchange="App.setDefaultMaterial(this.value)" style="max-width:220px">
            ${items.map(m => {
              const def = localStorage.getItem('gv_default_material') || 'PLA';
              const isSel = (String(m.id) === String(def) || m.name.toLowerCase() === def.toLowerCase());
              return `<option value="${m.id}" ${isSel ? 'selected' : ''}>${m.name}</option>`;
            }).join('')}
          </select>
          <span style="font-size:0.75rem;color:var(--text-muted)">Pre-selected when logging new prints</span>
        </div>
      </div>` : '';

    return `<div class="glass-panel">
      <div class="panel-header"><div class="panel-title">${iconMap[type] || ''} ${title}</div></div>
      <div class="panel-body">
        ${defaultMatBlock}
        ${listHtml || '<div style="color:var(--text-muted);font-size:.875rem;padding:8px 0">None yet</div>'}
        ${App.currentUser?.role === 'admin' ? `
        <div class="add-inline" style="margin-top:14px">
          <input class="form-input" id="add-${type}-input" placeholder="Add new ${type.slice(0,-1)}...">
          ${colorInput}
          <button class="btn btn-primary btn-sm" onclick="App.addSettingsItem('${type}')">Add</button>
        </div>` : ''}
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

  printersSettingsForm(printers = []) {
    const list = printers.map(p => `
      <div class="settings-item">
        <div style="flex:1">
          <div style="font-weight:500">${p.name}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);display:flex;align-items:center;gap:4px">${p.url} ${p.api_key ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent-yellow)" title="API Key Configured"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3M18.5 4.5l3 3"/></svg>' : ''}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="App.deletePrinter('${p.id}')">Delete</button>
      </div>
    `).join('');
    
    return `
      ${list || '<div style="color:var(--text-muted);font-size:.875rem;padding:8px 0">No printers configured</div>'}
      <form onsubmit="App.handleAddPrinter(event)" class="form-grid" style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">
        <h4>Add Moonraker / Klipper Printer</h4>
        <div class="form-group">
          <label>Printer Name</label>
          <input type="text" name="name" required class="form-input" placeholder="e.g. Voron 2.4">
        </div>
        <div class="form-group">
          <label>Printer URL</label>
          <input type="url" name="url" required class="form-input" placeholder="e.g. http://192.168.1.100">
        </div>
        <div class="form-group">
          <label>API Key (Optional)</label>
          <input type="password" name="api_key" class="form-input" placeholder="If required by Moonraker">
        </div>
        <div>
          <button type="submit" class="btn btn-primary">Add Printer</button>
        </div>
      </form>
    `;
  },

  sendToPrinterForm(fileId, printers = []) {
    const options = printers.map(p => `<option value="${p.id}">${p.name} (${p.url})</option>`).join('');
    return `
      <form onsubmit="App.handleSendToPrinter(event, ${fileId})">
        <div class="form-group">
          <label class="form-label">Select Printer</label>
          <select class="form-select" name="printer_id">
            ${options}
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Send to Printer</button>
        </div>
      </form>`;
  },

  systemSettingsForm(config = {}) {
    config = config || {};
    return `
      <form onsubmit="App.handleSaveSystemSettings(event)" class="form-grid">
        <h3 style="grid-column: 1 / -1; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 5px;">General Settings</h3>
        <div class="form-group" style="grid-column: 1 / -1">
          <label style="font-weight:600">Default Library View Mode</label>
          <select name="library_view_mode" class="form-input" style="max-width:420px;margin-bottom:12px">
            <option value="grid" ${(config.library_view_mode || 'grid') === 'grid' ? 'selected' : ''}>All Models (Flat Grid Gallery)</option>
            <option value="folder" ${config.library_view_mode === 'folder' ? 'selected' : ''}>Folder View (Disk Directory Hierarchy)</option>
          </select>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px;margin-top:4px">
            <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px 14px;display:flex;gap:12px;align-items:flex-start">
              <div style="width:36px;height:36px;border-radius:6px;background:rgba(59,130,246,0.1);color:var(--accent-cyan);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              </div>
              <div>
                <div style="font-weight:600;font-size:0.875rem;color:var(--text-primary);margin-bottom:3px">All Models (Flat Grid Gallery)</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.4">Displays all indexed 3D models across subfolders in a single unified gallery. Best for fast global searching, tag filtering, and print status tracking.</div>
              </div>
            </div>
            <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px 14px;display:flex;gap:12px;align-items:flex-start">
              <div style="width:36px;height:36px;border-radius:6px;background:rgba(245,158,11,0.1);color:var(--warning);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div>
                <div style="font-weight:600;font-size:0.875rem;color:var(--text-primary);margin-bottom:3px">Folder View (Directory Hierarchy)</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.4">Mirrors your exact storage directory layout on disk. Browse and drill down through nested folders and collections just like a file manager.</div>
              </div>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Auto-Scan Interval (Hours)</label>
          <input type="number" name="auto_scan_interval" value="${config.auto_scan_interval !== undefined ? config.auto_scan_interval : 24}" min="0" max="168" class="form-input">
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Set to 0 to disable background scanning. Default is 24.</p>
        </div>

        <div style="grid-column: 1 / -1; margin-top:20px">
          <button type="submit" class="btn btn-primary">Save General Settings</button>
        </div>
      </form>`;
  },

  securitySettingsForm(config = {}) {
    config = config || {};
    return `
      <form onsubmit="App.handleSaveSystemSettings(event)" style="display:flex;flex-direction:column;gap:20px">
        <div style="display:flex;flex-direction:column;gap:14px">
          <label class="toggle-item">
            <div>
              <div style="font-weight:600;font-size:0.95rem;color:var(--text-primary)">Enable Open Registration</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Allows anyone to register an account without needing an invite code.</div>
            </div>
            <input type="checkbox" name="open_registration" value="true" ${config.open_registration === 'true' ? 'checked' : ''}>
            <span class="toggle-switch"></span>
          </label>

          <label class="toggle-item">
            <div>
              <div style="font-weight:600;font-size:0.95rem;color:var(--text-primary)">Private Instance Mode</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Forces all guests to log in before viewing any models or library files.</div>
            </div>
            <input type="checkbox" name="require_login_to_view" value="true" ${config.require_login_to_view === 'true' ? 'checked' : ''}>
            <span class="toggle-switch"></span>
          </label>
        </div>

        <div>
          <button type="submit" class="btn btn-primary">Save Security Settings</button>
        </div>
      </form>

      <div style="margin-top:32px; border-top:1px solid var(--border); padding-top:20px">
        <h3 style="margin-bottom:12px; font-size:1.1rem; color:var(--text-primary); display:flex; align-items:center; gap:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent-purple)"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Blocked IP Addresses</h3>
        <div id="blocked-ips-container">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="App.loadBlockedIps()">Refresh Blocked IPs</button>
            <span style="font-size:0.75rem;color:var(--text-muted)">Unblock IP addresses flagged for failed login attempts.</span>
          </div>
          <div id="blocked-ips-list"></div>
        </div>
      </div>`;
  },

  maintenanceSettingsForm() {
    return `
      <div style="display:flex;flex-direction:column;gap:24px">
        <div>
          <h3 style="margin-bottom:8px; font-size:1.1rem; color:var(--text-primary); display:flex; align-items:center; gap:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent-cyan)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Duplicate File Finder</h3>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px">Scans your library using SHA-256 file hashes to find identical 3D model files across different folders or models.</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="App.scanForDuplicates()">Scan for Duplicate Files</button>
          <div id="duplicates-results" style="margin-top:16px"></div>
        </div>
      </div>`;
  },

  smtpSettingsForm(config = {}) {
    config = config || {};
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
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Must be at least 8 characters and contain both letters and numbers.</p>
          </div>
          <div class="form-group">
            <label>Preferred Slicer</label>
            <select name="preferred_slicer" class="form-input">
              <option value="" ${!user.preferred_slicer ? 'selected' : ''}>None (Ask every time)</option>
              <option value="orcaslicer" ${user.preferred_slicer === 'orcaslicer' ? 'selected' : ''}>OrcaSlicer</option>
              <option value="elegooslicer" ${user.preferred_slicer === 'elegooslicer' ? 'selected' : ''}>Elegoo Slicer</option>
              <option value="cura" ${user.preferred_slicer === 'cura' ? 'selected' : ''}>Ultimaker Cura</option>
            </select>
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
        ${App.currentUser?.role !== 'viewer' ? '<button class="btn btn-primary" onclick="App.showCreateProject()">+ New Collection</button>' : ''}
      </div>
      <div class="model-grid">
        ${list || '<div class="empty-state" style="grid-column: 1/-1">No collections yet</div>'}
      </div>`;
  },

  projectCard(p) {
    return `
      <div class="model-card" onclick="App.navigate('/projects/${p.id}')">
        <div class="model-card-thumb">
          ${p.thumbnail ? `<img src="/uploads/${p.thumbnail}">` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);opacity:.35"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>'}
        </div>
        <div class="model-card-body">
          <div class="model-card-title">${p.visibility === 'private' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;color:var(--accent-purple)"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : ''}${p.name}</div>
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
          <h1 class="page-title">${project.visibility === 'private' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;color:var(--accent-purple)"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : ''}${project.name}</h1>
          <p class="page-subtitle">${project.description || 'No description'}</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-danger btn-sm" onclick="App.deleteProject(${project.id})" style="display:inline-flex;align-items:center;gap:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>
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
                <div class="panel-header"><div class="panel-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>3D Studio Preview</div></div>
                <div class="panel-body no-pad">
                  <div class="viewer-container" id="public-viewer" data-stl-url="${stlFile.url}"></div>
                </div>
              </div>` : ''}
            <div class="glass-panel">
              <div class="panel-header"><div class="panel-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Description</div></div>
              <div class="panel-body">${model.description || 'No description'}</div>
            </div>
          </div>
          <div>
            <div class="glass-panel">
              <div class="panel-header"><div class="panel-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Files</div></div>
              <div class="panel-body no-pad">
                ${model.files.map(f => `
                  <div class="file-item">
                    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
                      ${this.fileTypeIcon(f.file_type)}
                      <div style="min-width:0;flex:1">
                        <div class="file-name" title="${f.original_name}">${f.original_name}</div>
                        <div class="file-meta">${this.formatSize(f.file_size)}</div>
                      </div>
                    </div>
                    <a href="${f.url}" download class="file-action-btn" title="Download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>
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
            <div style="display:flex;align-items:center;justify-content:center">
              <img src="/img/logo-icon.png?v=35" alt="GyroidVault" style="width:84px;height:84px;object-fit:contain;filter:drop-shadow(0 6px 18px rgba(37,99,235,0.4)) drop-shadow(0 2px 6px rgba(56,189,248,0.25))">
            </div>
            <div style="flex:1">
              <h3 style="margin:0 0 4px 0;font-size:1.4rem;background:var(--accent-gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent">GyroidVault</h3>
              <p style="margin:0;font-size:.9rem;color:var(--text-secondary)">Self-hosted 3D model management for enthusiasts and professionals.</p>
              <div style="margin-top:12px;display:flex;gap:12px">
                <a href="https://gyroidvault.com" target="_blank" class="btn btn-secondary btn-xs" style="color:var(--accent-cyan);border-color:rgba(0,212,255,0.3)">
                  <svg height="14" viewBox="0 0 24 24" width="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  Official Website
                </a>
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
                  <div style="color:#f59e0b;font-weight:600;display:flex;align-items:center;gap:6px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>Update available: v${versionInfo.latestVersion}</div>
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
    let escaped = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // Fenced code blocks
    escaped = escaped.replace(/```([\s\S]*?)```/g, (m, code) => `<pre><code>${code.trim()}</code></pre>`);
    
    // Inline code
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    escaped = escaped.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    escaped = escaped.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    escaped = escaped.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    escaped = escaped.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold / Italic / Strike
    escaped = escaped.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/~~(.*?)~~/g, '<del>$1</del>');

    // Blockquotes
    escaped = escaped.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Horizontal Rule
    escaped = escaped.replace(/^---$/gim, '<hr>');

    // Images: enforce safe protocol on src and safe alt text
    escaped = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => {
      const cleanSrc = this.safeUrl(src);
      if (!cleanSrc) return '';
      return `<img src="${this.escapeHtml(cleanSrc)}" alt="${this.escapeHtml(alt)}" loading="lazy">`;
    });

    // Links: enforce safe protocol on href
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, href) => {
      const cleanHref = this.safeUrl(href);
      if (!cleanHref) return label;
      return `<a href="${this.escapeHtml(cleanHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    // Lists
    escaped = escaped.replace(/^\s*[-*+]\s+(.*)$/gim, '<li style="margin-left:20px">$1</li>');
    escaped = escaped.replace(/^\s*\d+\.\s+(.*)$/gim, '<li style="margin-left:20px">$1</li>');

    // Newlines to BR
    escaped = escaped.replace(/\n/gim, '<br>');

    return `<div class="markdown-body">${escaped}</div>`;
  },

  uploadProgressBox(progress = {}) {
    const { percent = 0, loaded = 0, total = 0, speed = 0, etaSec = 0 } = progress;
    const speedStr = speed > 1024 * 1024 
      ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s` 
      : `${(speed / 1024).toFixed(0)} KB/s`;
    
    let etaStr = '';
    if (etaSec > 60) {
      const m = Math.floor(etaSec / 60);
      const s = etaSec % 60;
      etaStr = `~${m}m ${s}s remaining`;
    } else if (etaSec > 0) {
      etaStr = `~${etaSec}s remaining`;
    } else {
      etaStr = 'Finishing...';
    }

    return `
      <div class="upload-progress-box">
        <div class="upload-progress-header">
          <span style="color:var(--accent-cyan)">⏳ Uploading...</span>
          <span style="font-weight:700">${percent}%</span>
        </div>
        <div class="upload-progress-track">
          <div class="upload-progress-fill" style="width:${percent}%"></div>
        </div>
        <div class="upload-progress-footer">
          <span>${this.formatSize(loaded)} / ${this.formatSize(total)} (${speedStr})</span>
          <span>${etaStr}</span>
        </div>
      </div>
    `;
  },

  whatsNewModal(version = '2.0.0', releaseNotes = []) {
    const latestNote = releaseNotes && releaseNotes.length ? releaseNotes[0] : null;
    const changelogHtml = latestNote ? `
      <div class="markdown-body" style="font-size: 0.875rem; line-height: 1.6; max-height: 380px; overflow-y: auto; padding: 16px; background: var(--bg-primary); border-radius: 10px; border: 1px solid var(--border);">
        <h3 style="margin-top:0;margin-bottom:12px;color:var(--accent-cyan)">${this.escapeHtml(latestNote.title || 'GyroidVault ' + version)}</h3>
        <div style="white-space: pre-wrap; font-family: var(--font); color: var(--text-secondary); font-size: 0.82rem;">${this.escapeHtml(latestNote.content || latestNote.rawMarkdown || '')}</div>
      </div>
    ` : `
      <div style="text-align:center;padding:28px 20px;color:var(--text-muted);font-size:0.875rem;background:var(--bg-primary);border-radius:10px;border:1px solid var(--border)">
        Changelog details are available on <a href="https://github.com/TeeCodeDev/GyroidVault/releases" target="_blank" rel="noopener noreferrer" style="color:var(--accent-cyan);font-weight:600">GitHub Releases</a>.
      </div>
    `;

    return `
      <div class="whats-new-container" style="max-width: 720px; margin: 0 auto">
        <!-- Hero Header with Official Logo -->
        <div style="text-align:center;padding:10px 10px 18px;position:relative">
          <div style="position:relative;margin-bottom:16px;display:inline-block">
            <img src="/img/logo-icon.png?v=35" alt="GyroidVault" width="94" height="94" style="display:block;margin:0 auto;filter:drop-shadow(0 8px 24px rgba(37,99,235,0.4)) drop-shadow(0 2px 8px rgba(56,189,248,0.3));object-fit:contain">
          </div>

          <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px">
            <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(37,99,235,0.12);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);padding:3px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">
              <span style="width:6px;height:6px;border-radius:50%;background:#38bdf8;box-shadow:0 0 8px #38bdf8"></span>
              Major Release v${version}
            </div>
          </div>

          <h2 style="font-size:1.55rem;font-weight:800;letter-spacing:-0.02em;margin:0 0 8px;color:var(--text-primary)">
            Welcome to GyroidVault 2.0
          </h2>
          <p style="color:var(--text-secondary);font-size:0.88rem;line-height:1.55;max-width:540px;margin:0 auto">
            Your self-hosted 3D vault and slicing workspace — equipped with Studio 2.0 multi-part assembly, real-time mm dimensions, background scanner, and hardened security.
          </p>
        </div>

        <!-- Official Website Showcase Banner -->
        <div style="background:linear-gradient(135deg, rgba(37,99,235,0.15) 0%, rgba(124,58,237,0.12) 100%);border:1px solid rgba(96,165,250,0.35);border-radius:12px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;box-shadow:0 4px 16px rgba(0,0,0,0.2)">
          <div style="display:flex;align-items:center;gap:12px;min-width:0">
            <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg, #2563eb, #7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;box-shadow:0 6px 16px rgba(37,99,235,0.4)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div style="min-width:0">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-weight:700;font-size:0.92rem;color:#ffffff">Official Website is Live!</span>
                <span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.35);padding:1px 7px;border-radius:8px;font-size:0.62rem;font-weight:700;text-transform:uppercase">Official</span>
              </div>
              <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px">
                Explore the interactive 3D Studio demo, feature overview & Docker setup at <strong style="color:var(--accent-cyan)">gyroidvault.com</strong>
              </div>
            </div>
          </div>
          <a href="https://gyroidvault.com" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="font-weight:600;white-space:nowrap;padding:7px 14px;border-radius:8px;display:inline-flex;align-items:center;gap:6px;flex-shrink:0">
            <span>Visit Website</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>

        <!-- Tabs Navigation -->
        <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:10px">
          <button id="whatsnew-tab-btn-highlights" class="btn btn-secondary btn-sm active" onclick="App.switchWhatsNewTab('highlights')" style="font-weight:600;display:inline-flex;align-items:center;gap:6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span>Highlights & Features</span>
          </button>
          <button id="whatsnew-tab-btn-changelog" class="btn btn-secondary btn-sm" onclick="App.switchWhatsNewTab('changelog')" style="font-weight:600;display:inline-flex;align-items:center;gap:6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>Full Changelog</span>
          </button>
        </div>

        <!-- Highlights Content -->
        <div id="whatsnew-content-highlights" style="display:block">
          <!-- 4-Card Bento Grid -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px;margin-bottom:18px">
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:15px;display:flex;gap:12px;align-items:flex-start;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
              <div style="width:38px;height:38px;border-radius:10px;background:rgba(37,99,235,0.15);color:var(--accent-cyan);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              </div>
              <div>
                <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);margin-bottom:3px">Studio 2.0 & Multi-Assembly</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.45">Inspect individual parts or arrange all project STL/3MF files on the virtual build plate with real-time physical mm dimension badges.</div>
              </div>
            </div>

            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:15px;display:flex;gap:12px;align-items:flex-start;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
              <div style="width:38px;height:38px;border-radius:10px;background:rgba(16,185,129,0.15);color:#10b981;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div>
                <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);margin-bottom:3px">Massive Libraries (2TB+) & Scanner</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.45">Engineered for massive libraries of 2TB+ and 10,000+ models. Indexes directories and identifies duplicates in the background with zero UI freezes.</div>
              </div>
            </div>

            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:15px;display:flex;gap:12px;align-items:flex-start;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
              <div style="width:38px;height:38px;border-radius:10px;background:rgba(139,92,246,0.15);color:#8b5cf6;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              </div>
              <div>
                <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);margin-bottom:3px">Power Batch Editing</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.45">Multi-select dozens of models across library views to bulk-assign tags, categories, or collections in a single instant action.</div>
              </div>
            </div>

            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:15px;display:flex;gap:12px;align-items:flex-start;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
              <div style="width:38px;height:38px;border-radius:10px;background:rgba(245,158,11,0.15);color:#f59e0b;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);margin-bottom:3px">Local Privacy & Access Control</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.45">Your models stay 100% private and self-hosted with zero cloud telemetry. Strictly confined to your storage folder with safe, token-protected share links.</div>
              </div>
            </div>
          </div>

          <!-- Open Source & Support Section -->
          <div style="background:linear-gradient(135deg, rgba(245,158,11,0.08), rgba(37,99,235,0.06));border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px">
            <div>
              <div style="font-weight:700;font-size:0.88rem;color:var(--text-primary);display:flex;align-items:center;gap:6px;margin-bottom:3px">
                <span>Support GyroidVault Development</span>
              </div>
              <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.4">
                GyroidVault is 100% free and open source. Consider supporting maintenance via Ko-fi!
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <a href="https://gyroidvault.com" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="font-weight:600">gyroidvault.com</a>
              <a href="https://github.com/TeeCodeDev/GyroidVault" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="font-weight:600">GitHub</a>
              <a href="https://ko-fi.com/D1D51ZGUNL" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="background:#f59e0b;border-color:#f59e0b;color:#000;font-weight:700">Ko-fi</a>
            </div>
          </div>
        </div>

        <!-- Changelog Content -->
        <div id="whatsnew-content-changelog" style="display:none;margin-bottom:20px">
          ${changelogHtml}
        </div>

        <!-- Dismiss / CTA -->
        <div>
          <button class="btn btn-primary btn-md" onclick="App.dismissWhatsNew()" style="width:100%;font-weight:700;padding:11px 20px;font-size:0.92rem;border-radius:8px">
            Get Started with v${version}
          </button>
        </div>
      </div>
    `;
  }
};
