/* ─── 3D STL Viewer ───────────────────────────────────────────────────── */
const Viewer = {
  activeViewers: [],

  cleanup() {
    for (const v of this.activeViewers) {
      if (v.animId) cancelAnimationFrame(v.animId);
      if (v.renderer) { v.renderer.dispose(); }
      if (v.controls) v.controls.dispose();
      if (v.resizeObserver) v.resizeObserver.disconnect();
      if (v.onKeyDown) window.removeEventListener('keydown', v.onKeyDown);
    }
    document.body.style.overflow = '';
    this.activeViewers = [];
  },

  create(containerId, fileUrl, fileType = null, meta = {}) {
    const container = document.getElementById(containerId);
    if (!container || typeof THREE === 'undefined') return;
    const is3MF = fileType === '3mf' || (!fileType && fileUrl.toLowerCase().includes('.3mf'));
    const isGcode = fileType === 'gcode' || fileType === 'bgcode' || (!fileType && (fileUrl.toLowerCase().includes('.gcode') || fileUrl.toLowerCase().includes('.bgcode')));
    console.log('[Viewer] Create:', { fileUrl, fileType, is3MF, isGcode });
    
    if (isGcode && typeof GCodePreview !== 'undefined') {
      container.style.position = 'relative';
      container.innerHTML = `
        <canvas style="width:100%;height:100%;display:block;"></canvas>
        <div class="gcode-controls-bar" style="position:absolute;bottom:12px;left:12px;right:12px;background:rgba(18,18,30,0.85);backdrop-filter:blur(8px);border:1px solid var(--border);border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:12px;color:var(--text-primary);z-index:10;font-size:0.85rem;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
          <span id="gcode-layer-label" style="font-weight:600;white-space:nowrap;min-width:110px;">Loading G-Code...</span>
          <input type="range" id="gcode-layer-slider" min="1" max="1" value="1" disabled style="flex:1;cursor:pointer;accent-color:var(--accent-cyan);">
          <span id="gcode-z-label" style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">Z: -- mm</span>
        </div>
      `;

      // Determine dynamic build volume grid based on printer model or metadata
      let buildVol = { x: 250, y: 250, z: 250 };
      if (meta && meta.printerModel) {
        const pm = String(meta.printerModel).toLowerCase();
        if (pm.includes('bambu') || pm.includes('x1') || pm.includes('p1') || pm.includes('a1')) buildVol = { x: 256, y: 256, z: 256 };
        else if (pm.includes('prusa mk') || pm.includes('mk3') || pm.includes('mk4')) buildVol = { x: 250, y: 210, z: 220 };
        else if (pm.includes('ender') || pm.includes('v2')) buildVol = { x: 220, y: 220, z: 250 };
        else if (pm.includes('voron')) buildVol = { x: 300, y: 300, z: 300 };
      }

      // Determine top layer highlight color based on filament color if provided
      let layerColor = 0x00d4ff;
      if (meta && meta.filamentColor && /^#[0-9A-F]{6}$/i.test(meta.filamentColor)) {
        layerColor = new THREE.Color(meta.filamentColor).getHex();
      }

      const canvas = container.querySelector('canvas');
      const preview = GCodePreview.init({
        canvas: canvas,
        topLayerColor: layerColor,
        lastSegmentColor: new THREE.Color(0xffffff).getHex(),
        buildVolume: buildVol,
        initialCameraPosition: [0, 400, 450],
        backgroundColor: 0x161625
      });
      
      const viewer = { preview, isGcode: true, animId: null, renderer: { dispose: () => preview.dispose && preview.dispose() } };
      this.activeViewers.push(viewer);
      
      const layerLabel = container.querySelector('#gcode-layer-label');
      const layerSlider = container.querySelector('#gcode-layer-slider');
      const zLabel = container.querySelector('#gcode-z-label');

      // Load G-Code via fetch and process chunks
      fetch(fileUrl)
        .then(response => {
          if (!response.body) throw new Error('ReadableStream not supported.');
          return preview._readFromStream(response.body);
        })
        .then(() => {
          console.log('G-Code loaded');
          const layers = preview.layers || [];
          const totalLayers = layers.length || 1;
          
          // Auto-center camera on model bounding box
          if (preview.group && typeof THREE !== 'undefined') {
            try {
              const box = new THREE.Box3().setFromObject(preview.group);
              if (!box.isEmpty()) {
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                if (preview.controls) {
                  preview.controls.target.copy(center);
                  const maxDim = Math.max(size.x, size.y, size.z, 30);
                  preview.camera.position.set(center.x, center.y + maxDim * 0.8, center.z + maxDim * 1.8);
                  preview.controls.update();
                }
              }
            } catch (e) { console.error('Auto-center camera error:', e); }
          }

          if (totalLayers > 1) {
            layerSlider.max = totalLayers;
            layerSlider.value = totalLayers;
            layerSlider.disabled = false;
            
            const updateLayerUI = () => {
              const val = parseInt(layerSlider.value, 10);
              preview.endLayer = val;
              preview.render();
              
              const currentLayer = layers[val - 1];
              let currentZ = 0;
              if (currentLayer) {
                if (currentLayer.commands) {
                  const cmdWithZ = currentLayer.commands.find(c => c.params && c.params.z !== undefined);
                  if (cmdWithZ) currentZ = cmdWithZ.params.z;
                }
                if (currentZ === 0 && currentLayer.height) currentZ = currentLayer.height;
              }
              if (!currentZ && preview.parser && preview.parser.curZ) currentZ = preview.parser.curZ;

              layerLabel.innerText = `Layer ${val} / ${totalLayers}`;
              zLabel.innerText = currentZ ? `Z: ${(Number(currentZ)).toFixed(2)} mm` : '';
            };

            layerSlider.oninput = updateLayerUI;
            updateLayerUI();
          } else {
            layerLabel.innerText = 'G-Code Preview';
            zLabel.innerText = '';
          }
        })
        .catch(err => {
          console.error('GCode load error:', err);
          container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:.85rem;flex-direction:column;gap:8px">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent-yellow)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Could not load 3D G-Code preview</span>
          </div>`;
        });
        
      return viewer;
    }

    if (typeof fflate !== 'undefined') { 
      window.fflate = fflate; 
      THREE.fflate = fflate; 
    }
    const loaderClass = is3MF ? (THREE.ThreeMFLoader || THREE['3MFLoader'] || THREE.MFLoader) : (THREE.STLLoader);
    console.log('[Viewer] Using loader:', loaderClass?.name || 'Unknown');
    if (!loaderClass) return;
    const loader = new loaderClass();

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161625);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.style.position = 'relative';
    container.appendChild(renderer.domElement);

    // Extract model ID if in model detail container id format (stl-viewer-123)
    const modelIdMatch = containerId.match(/stl-viewer-(\d+)/);
    const modelId = modelIdMatch ? parseInt(modelIdMatch[1], 10) : (meta?.modelId || null);

    // Controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.0;

    // Lighting
    scene.add(new THREE.AmbientLight(0x606080, 0.6));

    const light1 = new THREE.DirectionalLight(0x00d4ff, 0.7);
    light1.position.set(1, 2, 1);
    scene.add(light1);

    const light2 = new THREE.DirectionalLight(0x8b5cf6, 0.5);
    light2.position.set(-2, -1, -1);
    scene.add(light2);

    const light3 = new THREE.DirectionalLight(0xffffff, 0.4);
    light3.position.set(0, -1, 2);
    scene.add(light3);

    // Grid
    const grid = new THREE.GridHelper(200, 30, 0x252545, 0x1a1a35);
    scene.add(grid);

    // Multi-part assembly setup
    const modelFiles = (meta?.modelFiles || []).filter(f => f.file_type === 'stl' || f.file_type === '3mf');
    let activePartVal = meta?.activeFileId ? String(meta.activeFileId) : (modelFiles.length > 1 ? 'all' : (modelFiles[0] ? String(modelFiles[0].id) : null));
    const partPalette = [0x00ccee, 0xf97316, 0x10b981, 0x8b5cf6, 0xeab308, 0xec4899, 0x38bdf8, 0xa855f7];

    // Interactive Overlay DOM Structure
    const overlayHtml = `
      <div class="viewer-overlay-top">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <div class="viewer-pill" id="${containerId}-dims" style="display:none;font-weight:600">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;opacity:0.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> <span class="dims-text">-- × -- × -- mm</span>
          </div>
          ${modelFiles.length > 1 ? `
            <div class="viewer-pill" style="display:inline-flex;align-items:center;gap:5px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;opacity:0.8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              <select id="${containerId}-part-select" style="background:transparent;border:none;color:var(--text-primary);font-size:0.75rem;font-weight:600;cursor:pointer;outline:none;padding-right:2px">
                <option value="all" ${activePartVal === 'all' ? 'selected' : ''} style="background:#181829;color:#fff">✦ All Parts on Build Plate (${modelFiles.length})</option>
                ${modelFiles.map(f => `<option value="${f.id}" ${String(f.id) === activePartVal ? 'selected' : ''} style="background:#181829;color:#fff">${f.original_name || f.filename}</option>`).join('')}
              </select>
            </div>
          ` : ''}
        </div>
        <div class="viewer-pill" style="display:flex;gap:4px">
          <button class="viewer-tool-btn active" id="${containerId}-btn-rotate" title="Toggle Auto-Rotate">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            <span>Spin</span>
          </button>
          ${modelId ? `
            <button class="viewer-tool-btn" id="${containerId}-btn-thumb" title="Capture current 3D view as model thumbnail">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>Cover</span>
            </button>
          ` : ''}
          <button class="viewer-tool-btn" id="${containerId}-btn-fullscreen" title="Fullscreen 3D Studio">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
      </div>

      <!-- Bottom Interactive Studio Dock -->
      <div class="viewer-bottom-dock">
        <!-- Camera Angle Presets -->
        <button class="viewer-tool-btn active" data-view="iso" title="Isometric View">Iso</button>
        <button class="viewer-tool-btn" data-view="top" title="Top View">Top</button>
        <button class="viewer-tool-btn" data-view="front" title="Front View">Front</button>
        <button class="viewer-tool-btn" data-view="side" title="Side View">Side</button>

        <div class="viewer-dock-sep"></div>

        <!-- Shading Modes -->
        <button class="viewer-tool-btn active" data-shading="solid" title="Solid Shading">Solid</button>
        <button class="viewer-tool-btn" data-shading="wireframe" title="Wireframe Mesh">Wire</button>
        <button class="viewer-tool-btn" data-shading="xray" title="X-Ray Inspection">X-Ray</button>

        <div class="viewer-dock-sep"></div>

        <!-- Color Palette -->
        <div style="display:flex;align-items:center;gap:4px">
          <div class="viewer-swatch active" data-color="#00ccee" style="background:#00ccee" title="Cyan"></div>
          <div class="viewer-swatch" data-color="#f97316" style="background:#f97316" title="Orange"></div>
          <div class="viewer-swatch" data-color="#10b981" style="background:#10b981" title="Green"></div>
          <div class="viewer-swatch" data-color="#8b5cf6" style="background:#8b5cf6" title="Purple"></div>
          <div class="viewer-swatch" data-color="#eab308" style="background:#eab308" title="Gold"></div>
          <div class="viewer-swatch" data-color="#f1f5f9" style="background:#f1f5f9" title="White"></div>
          <div class="viewer-swatch" data-color="#475569" style="background:#475569" title="Slate Black"></div>
        </div>

        <div class="viewer-dock-sep"></div>

        <!-- Grid Toggle -->
        <button class="viewer-tool-btn active" id="${containerId}-btn-grid" title="Toggle Grid Floor">
          <span>Grid</span>
        </button>
      </div>
    `;

    const overlayEl = document.createElement('div');
    overlayEl.innerHTML = overlayHtml;
    container.appendChild(overlayEl);

    let targetObject = null;
    let initialCameraDist = 100;
    let modelCenter = new THREE.Vector3();
    let currentShadingMode = 'solid';
    let currentColorHex = '#00ccee';

    // Wire up Auto-Rotate Toggle
    const rotateBtn = container.querySelector(`#${containerId}-btn-rotate`);
    if (rotateBtn) {
      rotateBtn.onclick = () => {
        controls.autoRotate = !controls.autoRotate;
        rotateBtn.classList.toggle('active', controls.autoRotate);
      };
    }

    // Wire up Grid Toggle
    const gridBtn = container.querySelector(`#${containerId}-btn-grid`);
    if (gridBtn) {
      gridBtn.onclick = () => {
        grid.visible = !grid.visible;
        gridBtn.classList.toggle('active', grid.visible);
      };
    }

    // Wire up Fullscreen Toggle
    const fsBtn = container.querySelector(`#${containerId}-btn-fullscreen`);
    const parentStage = container.closest('.detail-stage-box') || container;
    const toggleFullscreen = () => {
      const isFs = parentStage.classList.toggle('viewer-fullscreen-active');
      document.body.style.overflow = isFs ? 'hidden' : '';
      if (fsBtn) {
        fsBtn.innerHTML = isFs
          ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`
          : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
      }
      setTimeout(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }, 50);
    };
    if (fsBtn) fsBtn.onclick = toggleFullscreen;

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && parentStage.classList.contains('viewer-fullscreen-active')) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Wire up Snapshot Button
    const thumbBtn = container.querySelector(`#${containerId}-btn-thumb`);
    if (thumbBtn && modelId) {
      thumbBtn.onclick = async () => {
        thumbBtn.disabled = true;
        thumbBtn.innerHTML = `<span>Saving...</span>`;
        const res = await Viewer.takeSnapshot(modelId, renderer, scene, camera);
        thumbBtn.disabled = false;
        thumbBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>Cover ✓</span>
        `;
        if (typeof App !== 'undefined' && App.toast) {
          App.toast('3D view saved as model thumbnail!');
        }
      };
    }

    // Camera Angle Presets
    const viewButtons = container.querySelectorAll('.viewer-bottom-dock [data-view]');
    const setCameraView = (viewName) => {
      viewButtons.forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
      controls.autoRotate = false;
      if (rotateBtn) rotateBtn.classList.remove('active');

      const dist = initialCameraDist;
      controls.target.copy(modelCenter);

      if (viewName === 'iso') {
        camera.position.set(modelCenter.x + dist * 0.65, modelCenter.y + dist * 0.55, modelCenter.z + dist * 0.95);
      } else if (viewName === 'top') {
        camera.position.set(modelCenter.x, modelCenter.y + dist * 1.35, modelCenter.z + 0.001);
      } else if (viewName === 'front') {
        camera.position.set(modelCenter.x, modelCenter.y + dist * 0.15, modelCenter.z + dist * 1.25);
      } else if (viewName === 'side') {
        camera.position.set(modelCenter.x + dist * 1.25, modelCenter.y + dist * 0.15, modelCenter.z);
      }
      controls.update();
    };

    viewButtons.forEach(btn => {
      btn.onclick = () => setCameraView(btn.dataset.view);
    });

    // Shading Mode Switcher
    const shadingButtons = container.querySelectorAll('.viewer-bottom-dock [data-shading]');
    const setShadingMode = (mode) => {
      currentShadingMode = mode;
      shadingButtons.forEach(b => b.classList.toggle('active', b.dataset.shading === mode));
      if (!targetObject) return;

      targetObject.traverse((child) => {
        if (child.isMesh && child.material) {
          if (mode === 'solid') {
            child.material.wireframe = false;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            child.material.depthWrite = true;
          } else if (mode === 'wireframe') {
            child.material.wireframe = true;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            child.material.depthWrite = true;
          } else if (mode === 'xray') {
            child.material.wireframe = false;
            child.material.transparent = true;
            child.material.opacity = 0.35;
            child.material.depthWrite = false;
          }
          child.material.needsUpdate = true;
        }
      });
    };

    shadingButtons.forEach(btn => {
      btn.onclick = () => setShadingMode(btn.dataset.shading);
    });

    // Color Swatches
    const swatches = container.querySelectorAll('.viewer-bottom-dock .viewer-swatch');
    const setModelColor = (hex) => {
      currentColorHex = hex;
      swatches.forEach(s => s.classList.toggle('active', s.dataset.color === hex));
      if (!targetObject) return;
      targetObject.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.color.set(hex);
          child.material.needsUpdate = true;
        }
      });
    };

    swatches.forEach(swatch => {
      swatch.onclick = () => setModelColor(swatch.dataset.color);
    });

    // Smooth Surface Normal Computation for curved CAD geometry (eliminates faceted triangle artifacts)
    const smoothGeometryNormals = (geometry, maxAngleDeg = 45) => {
      try {
        const pos = geometry.attributes.position;
        if (!pos || pos.count < 3) return;
        const count = pos.count;
        if (count > 250000) {
          geometry.computeVertexNormals();
          return;
        }

        const maxCos = Math.cos(maxAngleDeg * Math.PI / 180);
        const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
        const cb = new THREE.Vector3(), ab = new THREE.Vector3();
        const faceNormals = new Float32Array(count * 3);
        const vertexMap = new Map();
        const precision = 20; // 0.05mm spatial hashing tolerance

        for (let i = 0; i < count; i += 3) {
          pA.fromBufferAttribute(pos, i);
          pB.fromBufferAttribute(pos, i + 1);
          pC.fromBufferAttribute(pos, i + 2);

          cb.subVectors(pC, pB);
          ab.subVectors(pA, pB);
          cb.cross(ab).normalize();

          for (let j = 0; j < 3; j++) {
            const idx = i + j;
            faceNormals[idx * 3] = cb.x;
            faceNormals[idx * 3 + 1] = cb.y;
            faceNormals[idx * 3 + 2] = cb.z;

            const p = (j === 0) ? pA : (j === 1 ? pB : pC);
            const key = `${Math.round(p.x * precision)},${Math.round(p.y * precision)},${Math.round(p.z * precision)}`;
            let list = vertexMap.get(key);
            if (!list) {
              list = [];
              vertexMap.set(key, list);
            }
            list.push(idx);
          }
        }

        const normals = new Float32Array(count * 3);
        const vNorm = new THREE.Vector3();
        const fNorm = new THREE.Vector3();
        const nOther = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
          fNorm.set(faceNormals[i * 3], faceNormals[i * 3 + 1], faceNormals[i * 3 + 2]);
          vNorm.copy(fNorm);

          pA.fromBufferAttribute(pos, i);
          const key = `${Math.round(pA.x * precision)},${Math.round(pA.y * precision)},${Math.round(pA.z * precision)}`;
          const neighbors = vertexMap.get(key);

          if (neighbors && neighbors.length > 1) {
            for (let k = 0; k < neighbors.length; k++) {
              const nIdx = neighbors[k];
              if (nIdx !== i) {
                nOther.set(faceNormals[nIdx * 3], faceNormals[nIdx * 3 + 1], faceNormals[nIdx * 3 + 2]);
                if (fNorm.dot(nOther) >= maxCos) {
                  vNorm.add(nOther);
                }
              }
            }
            vNorm.normalize();
          }

          normals[i * 3] = vNorm.x;
          normals[i * 3 + 1] = vNorm.y;
          normals[i * 3 + 2] = vNorm.z;
        }

        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.attributes.normal.needsUpdate = true;
      } catch (e) {
        console.warn('Smooth normals fallback:', e);
        geometry.computeVertexNormals();
      }
    };

    // Geometry Loader Helper
    const loadGeometryPromise = (url, type, colorHex = 0x00ccee) => {
      return new Promise((resolve, reject) => {
        const is3D3MF = type === '3mf' || url.toLowerCase().includes('.3mf');
        const lClass = is3D3MF ? (THREE.ThreeMFLoader || THREE['3MFLoader'] || THREE.MFLoader) : THREE.STLLoader;
        if (!lClass) return reject(new Error('Loader not found'));
        const l = new lClass();

        l.load(
          url,
          (object) => {
            const rawSize = new THREE.Vector3();
            if (is3D3MF) {
              object.traverse(child => {
                if (child.isMesh && child.geometry) {
                  smoothGeometryNormals(child.geometry);
                  if (child.material) {
                    child.material.flatShading = false;
                    child.material.needsUpdate = true;
                  }
                }
              });
              const box = new THREE.Box3().setFromObject(object);
              box.getSize(rawSize);
              resolve({ object, rawSize, is3MF: true });
            } else {
              const geometry = object;
              smoothGeometryNormals(geometry);
              geometry.computeBoundingBox();
              if (geometry.boundingBox) geometry.boundingBox.getSize(rawSize);
              geometry.center();

              const material = new THREE.MeshPhongMaterial({
                color: colorHex,
                specular: 0x333355,
                shininess: 35,
                flatShading: false,
              });
              const mesh = new THREE.Mesh(geometry, material);
              mesh.rotation.x = -Math.PI / 2;
              resolve({ object: mesh, rawSize, is3MF: false });
            }
          },
          undefined,
          reject
        );
      });
    };

    // Render Part(s) Function
    const renderPartSelection = async (selection) => {
      // Clean previous object
      if (targetObject) {
        scene.remove(targetObject);
        targetObject.traverse(child => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          }
        });
        targetObject = null;
      }

      const dimsEl = container.querySelector(`#${containerId}-dims`);
      const footerEl = container.parentElement.querySelector('.detail-stage-footer');

      try {
        if (selection === 'all' && modelFiles.length > 1) {
          // Combined Multi-part Assembly
          const group = new THREE.Group();
          let combinedRawSize = new THREE.Vector3();

          const loadedParts = await Promise.all(
            modelFiles.map((f, idx) => {
              const u = `${f.url || '/uploads/'+f.filename}?t=${Date.now()}`;
              const col = partPalette[idx % partPalette.length];
              return loadGeometryPromise(u, f.file_type, col).catch(err => {
                console.warn('Failed to load part:', f.filename, err);
                return null;
              });
            })
          );

          const validParts = loadedParts.filter(Boolean);
          const count = validParts.length;

          if (count > 1) {
            // Wrap each part in an identity container to ensure standard world axis positioning
            const partWrappers = validParts.map(p => {
              const wrapper = new THREE.Group();
              wrapper.add(p.object);
              const b = new THREE.Box3().setFromObject(wrapper);
              const s = new THREE.Vector3();
              b.getSize(s);
              const c = new THREE.Vector3();
              b.getCenter(c);
              return { wrapper, box: b, size: s, center: c };
            });

            // Grid distribution: arrange into 2D layout (e.g. 2x2 for 4 parts)
            const cols = Math.ceil(Math.sqrt(count));
            const gap = 14; // 14mm spacing between parts on the print bed

            const colWidths = [];
            const rowDepths = [];
            partWrappers.forEach((item, idx) => {
              const col = idx % cols;
              const row = Math.floor(idx / cols);
              colWidths[col] = Math.max(colWidths[col] || 0, Math.max(item.size.x, 15));
              rowDepths[row] = Math.max(rowDepths[row] || 0, Math.max(item.size.z, 15));
            });

            const totalWidth = colWidths.reduce((a, b) => a + b, 0) + (colWidths.length - 1) * gap;
            const totalDepth = rowDepths.reduce((a, b) => a + b, 0) + (rowDepths.length - 1) * gap;

            const startX = -totalWidth / 2;
            const startZ = -totalDepth / 2;

            partWrappers.forEach((item, idx) => {
              const col = idx % cols;
              const row = Math.floor(idx / cols);

              let cellCenterX = startX;
              for (let c = 0; c < col; c++) cellCenterX += colWidths[c] + gap;
              cellCenterX += colWidths[col] / 2;

              let cellCenterZ = startZ;
              for (let r = 0; r < row; r++) cellCenterZ += rowDepths[r] + gap;
              cellCenterZ += rowDepths[row] / 2;

              // Position wrapper so it sits centered in the cell and rests flat on the bed (Y=0)
              item.wrapper.position.x = cellCenterX - item.center.x;
              item.wrapper.position.z = cellCenterZ - item.center.z;
              item.wrapper.position.y = -item.box.min.y;

              group.add(item.wrapper);
            });
          } else if (count === 1) {
            group.add(validParts[0].object);
          }

          const groupBoundingBox = new THREE.Box3().setFromObject(group);
          groupBoundingBox.getSize(combinedRawSize);
          const center = new THREE.Vector3();
          groupBoundingBox.getCenter(center);

          const maxDim = Math.max(combinedRawSize.x, combinedRawSize.y, combinedRawSize.z, 1);
          const scale = 70 / maxDim;
          group.scale.set(scale, scale, scale);

          group.position.x = -center.x * scale;
          group.position.y = 0; // Bottom rests flat on build plate grid!
          group.position.z = -center.z * scale;

          targetObject = group;
          scene.add(group);

          // Update Dimensions
          if (dimsEl && (combinedRawSize.x > 0 || combinedRawSize.y > 0 || combinedRawSize.z > 0)) {
            const dimsText = dimsEl.querySelector('.dims-text');
            if (dimsText) {
              const dx = (Math.round(combinedRawSize.x * 10) / 10).toFixed(1);
              const dy = (Math.round(combinedRawSize.y * 10) / 10).toFixed(1);
              const dz = (Math.round(combinedRawSize.z * 10) / 10).toFixed(1);
              dimsText.innerText = `${dx} × ${dy} × ${dz} mm (Plate footprint)`;
            }
            dimsEl.style.display = 'inline-flex';
          }

          if (footerEl) {
            footerEl.innerHTML = `
              <span style="display:flex;align-items:center;gap:6px">
                <span class="badge badge-category" style="background:rgba(0,212,255,0.15);color:var(--accent-cyan)">BUILD PLATE</span>
                <span style="color:var(--text-secondary);font-weight:500">Plate View (${validParts.length} parts arranged)</span>
              </span>
              <span style="opacity:0.6;font-size:0.7rem;display:inline-flex;align-items:center;gap:4px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="18" rx="6"/><line x1="12" y1="7" x2="12" y2="11"/></svg>Drag to rotate · Scroll to zoom · Right-click to pan</span>
            `;
          }
        } else {
          // Single Part
          const singleFile = modelFiles.find(f => String(f.id) === String(selection)) || modelFiles[0];
          const singleUrl = singleFile ? `${singleFile.url || '/uploads/'+singleFile.filename}?t=${Date.now()}` : fileUrl;
          const singleType = singleFile ? singleFile.file_type : fileType;

          const loaded = await loadGeometryPromise(singleUrl, singleType, new THREE.Color(currentColorHex).getHex());
          
          if (loaded.is3MF) {
            const box = new THREE.Box3().setFromObject(loaded.object);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            const maxDim = Math.max(size.x, size.y, size.z, 1);
            const scale = 60 / maxDim;
            loaded.object.scale.set(scale, scale, scale);

            loaded.object.position.x = -center.x * scale;
            loaded.object.position.y = (-center.y * scale) + (size.y * scale) / 2;
            loaded.object.position.z = -center.z * scale;
            targetObject = loaded.object;
          } else {
            const box = new THREE.Box3().setFromObject(loaded.object);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z, 1);
            const scale = 60 / maxDim;
            loaded.object.scale.set(scale, scale, scale);
            loaded.object.position.y = (size.y * scale) / 2;
            targetObject = loaded.object;
          }

          scene.add(targetObject);

          // Update Dimensions
          if (dimsEl && (loaded.rawSize.x > 0 || loaded.rawSize.y > 0 || loaded.rawSize.z > 0)) {
            const dimsText = dimsEl.querySelector('.dims-text');
            if (dimsText) {
              const dx = (Math.round(loaded.rawSize.x * 10) / 10).toFixed(1);
              const dy = (Math.round(loaded.rawSize.y * 10) / 10).toFixed(1);
              const dz = (Math.round(loaded.rawSize.z * 10) / 10).toFixed(1);
              dimsText.innerText = `${dx} × ${dy} × ${dz} mm`;
            }
            dimsEl.style.display = 'inline-flex';
          }

          if (footerEl && singleFile) {
            footerEl.innerHTML = `
              <span style="display:flex;align-items:center;gap:6px">
                <span class="badge badge-${singleFile.file_type}">${singleFile.file_type.toUpperCase()}</span>
                <span style="color:var(--text-secondary);font-weight:500">${singleFile.original_name || singleFile.filename}</span>
              </span>
              <span style="opacity:0.6;font-size:0.7rem;display:inline-flex;align-items:center;gap:4px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="18" rx="6"/><line x1="12" y1="7" x2="12" y2="11"/></svg>Drag to rotate · Scroll to zoom · Right-click to pan</span>
            `;
          }
        }

        // Apply active shading mode
        setShadingMode(currentShadingMode);

        // Auto-frame camera
        if (targetObject) {
          const finalBox = new THREE.Box3().setFromObject(targetObject);
          finalBox.getCenter(modelCenter);
          const finalSize = new THREE.Vector3();
          finalBox.getSize(finalSize);

          const maxDim = Math.max(finalSize.x, finalSize.y, finalSize.z, 1);
          const fov = camera.fov * (Math.PI / 180);
          let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
          cameraZ *= 2.2;
          initialCameraDist = cameraZ;

          camera.position.set(modelCenter.x + cameraZ * 0.65, modelCenter.y + cameraZ * 0.55, modelCenter.z + cameraZ * 0.95);
          controls.target.copy(modelCenter);
          controls.update();

          if (typeof viewer !== 'undefined') viewer.targetObject = targetObject;
        }
      } catch (err) {
        console.error('Part loading error:', err);
      }
    };

    // Wire up Part Selector Dropdown
    const partSelectEl = container.querySelector(`#${containerId}-part-select`);
    if (partSelectEl) {
      partSelectEl.onchange = (e) => {
        renderPartSelection(e.target.value);
      };
    }

    // Initial Load
    renderPartSelection(activePartVal || 'all');

    // Animation loop
    const viewer = { renderer, controls, animId: null, resizeObserver: null, onKeyDown };
    window.addEventListener('error', (e) => {
      const msg = e.message || (e.error && e.error.message);
      if (msg && (msg.includes('signalUnknownCredential') || msg.includes('webauthnInterceptor'))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return true;
      }
    }, true);

    const animate = () => {
      viewer.animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);
    viewer.resizeObserver = resizeObserver;

    this.activeViewers.push(viewer);
    return { ...viewer, scene, camera, targetObject };
  },

  async takeSnapshot(modelId, renderer, scene, camera) {
    if (!renderer || !scene || !camera) return;
    
    // Render one frame with specific settings for thumbnail
    renderer.render(scene, camera);
    
    return new Promise((resolve) => {
      renderer.domElement.toBlob(async (blob) => {
        if (!blob) return resolve(null);
        const file = new File([blob], `thumb_${modelId}.png`, { type: 'image/png' });
        try {
          const res = await API.uploadThumbnail(modelId, file);
          resolve(res);
        } catch(e) {
          console.error('Snapshot upload failed:', e);
          resolve(null);
        }
      }, 'image/png');
    });
  },

  async generateThumbnails() {
    if (typeof THREE === 'undefined' || !THREE.STLLoader) return;
    const targets = document.querySelectorAll('.stl-thumb-target');
    if (targets.length === 0) return;

    // Create a single off-screen renderer
    const width = 300;
    const height = 200;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161625);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    
    // Lighting
    scene.add(new THREE.AmbientLight(0x606080, 0.6));
    const light1 = new THREE.DirectionalLight(0x00d4ff, 0.7); light1.position.set(1, 2, 1); scene.add(light1);
    const light2 = new THREE.DirectionalLight(0x8b5cf6, 0.5); light2.position.set(-2, -1, -1); scene.add(light2);
    const light3 = new THREE.DirectionalLight(0xffffff, 0.4); light3.position.set(0, -1, 2); scene.add(light3);
    const grid = new THREE.GridHelper(200, 30, 0x252545, 0x1a1a35);
    scene.add(grid);

    if (typeof fflate !== 'undefined') { window.fflate = fflate; THREE.fflate = fflate; }

    for (const target of targets) {
      target.classList.remove('stl-thumb-target'); 
      const url = target.dataset.stlUrl;
      if (!url) continue;

      try {
        if (typeof fflate !== 'undefined') { window.fflate = fflate; THREE.fflate = fflate; }
        const is3MF = url.toLowerCase().includes('.3mf');
        const loaderClass = is3MF ? (THREE.ThreeMFLoader || THREE['3MFLoader'] || THREE.MFLoader) : THREE.STLLoader;
        if (!loaderClass) continue;
        const loader = new loaderClass();
        const object = await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
        
        // Remove previous objects
        while(scene.children.length > 0){ 
          const child = scene.children[0];
          if (child.type === 'Mesh' || child.type === 'Group') {
            scene.remove(child);
          } else {
            break; // Keep lights/grid
          }
        }
        // Re-add lights and grid if they were at the end, but better to just filter
        scene.children.filter(c => c.type === 'Mesh' || c.type === 'Group').forEach(c => scene.remove(c));

        let maxDim = 0;
        let modelCenterY = 0;

        if (is3MF) {
          const box = new THREE.Box3().setFromObject(object);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);
          
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 60 / maxDim;
          object.scale.set(scale, scale, scale);
          
          object.position.x = -center.x * scale;
          object.position.y = (-center.y * scale) + (size.y * scale) / 2;
          object.position.z = -center.z * scale;
          
          modelCenterY = (size.y * scale) / 2;
          scene.add(object);
        } else {
          const geometry = object;
          if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) geometry.computeVertexNormals();
          geometry.center();
          
          const material = new THREE.MeshPhongMaterial({ color: 0x00ccee, specular: 0x333355, shininess: 35 });
          const mesh = new THREE.Mesh(geometry, material);
          
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          const size = new THREE.Vector3();
          box.getSize(size);
          
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 60 / maxDim;
          mesh.scale.set(scale, scale, scale);
          
          mesh.rotation.x = -Math.PI / 2;
          modelCenterY = (size.z * scale) / 2;
          mesh.position.y = modelCenterY;
          scene.add(mesh);
        }
        
        // Position camera consistently for normalized object size (60)
        camera.position.set(50, 45 + modelCenterY, 65);
        camera.lookAt(0, modelCenterY, 0);
        
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        
        target.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.3s" onload="this.style.opacity=1">`;
        target.style.background = 'transparent';

        const modelId = target.closest('[data-model-id]')?.dataset.modelId;
        if (modelId) {
          fetch(dataUrl).then(res => res.blob()).then(blob => {
            const file = new File([blob], `thumb_${modelId}.png`, { type: 'image/png' });
            API.uploadThumbnail(modelId, file).catch(() => {});
          });
        }
      } catch (e) {
        console.error('Failed to generate thumb for', url, e);
      }
    }
    
    renderer.dispose();
    renderer.forceContextLoss();
  }
};

