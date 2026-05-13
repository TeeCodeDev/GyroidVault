/* ─── 3D STL Viewer ───────────────────────────────────────────────────── */
const Viewer = {
  activeViewers: [],

  cleanup() {
    for (const v of this.activeViewers) {
      if (v.animId) cancelAnimationFrame(v.animId);
      if (v.renderer) { v.renderer.dispose(); v.renderer.forceContextLoss(); }
      if (v.controls) v.controls.dispose();
      if (v.resizeObserver) v.resizeObserver.disconnect();
    }
    this.activeViewers = [];
  },

  create(containerId, fileUrl) {
    const container = document.getElementById(containerId);
    if (!container || typeof THREE === 'undefined') return;
    const is3MF = fileUrl.toLowerCase().includes('.3mf');
    if (is3MF && typeof fflate !== 'undefined') { window.fflate = fflate; THREE.fflate = fflate; }
    const loaderClass = is3MF ? (THREE.ThreeMFLoader || THREE['3MFLoader'] || THREE.MFLoader) : (THREE.STLLoader);
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

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

    // Load STL
    loader.load(
      fileUrl,
      (object) => {
        if (is3MF) {
          const box = new THREE.Box3().setFromObject(object);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);
          
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 60 / maxDim;
          object.scale.set(scale, scale, scale);
          
          // Center and sit on floor
          object.position.x = -center.x * scale;
          object.position.y = (-center.y * scale) + (size.y * scale) / 2;
          object.position.z = -center.z * scale;
          
          scene.add(object);
        } else {
          const geometry = object;
          if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) geometry.computeVertexNormals();
          
          // Use built-in centering for STL geometry
          geometry.center();
          
          const material = new THREE.MeshPhongMaterial({
            color: 0x00ccee,
            specular: 0x333355,
            shininess: 35,
            flatShading: false,
          });

          const mesh = new THREE.Mesh(geometry, material);

          // Get size after centering
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          const size = new THREE.Vector3();
          box.getSize(size);
          
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 60 / maxDim;
          mesh.scale.set(scale, scale, scale);

          // STL is often Z-up, rotate to Y-up
          mesh.rotation.x = -Math.PI / 2;
          
          // After rotation: 
          // geometry Y (width) -> world Y? No, rotation is around X.
          // geometry Z (height) -> world Y.
          mesh.position.y = (size.z * scale) / 2;
          scene.add(mesh);
        }

        // Position camera
        camera.position.set(50, 40, 70);
        controls.target.set(0, 0, 0);
        controls.update();
      },
      undefined,
      (error) => {
        console.error('STL load error:', error);
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:.85rem;flex-direction:column;gap:8px">
          <span style="font-size:1.5rem">⚠️</span>
          <span>Could not load 3D preview</span>
        </div>`;
      }
    );

    // Animation loop
    const viewer = { renderer, controls, animId: null, resizeObserver: null };
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
    return { ...viewer, scene, camera };
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

  // Auto-generate thumbnails for dashboard cards
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

