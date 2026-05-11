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
    if (!container || typeof THREE === 'undefined' || !THREE.STLLoader) return;

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
    const loader = new THREE.STLLoader();
    loader.load(
      fileUrl,
      (geometry) => {
        if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) {
          geometry.computeVertexNormals();
        }

        const material = new THREE.MeshPhongMaterial({
          color: 0x00ccee,
          specular: 0x333355,
          shininess: 35,
          flatShading: false,
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Center and scale
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const center = new THREE.Vector3();
        box.getCenter(center);
        mesh.position.sub(center);

        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 60 / maxDim;
        mesh.scale.set(scale, scale, scale);

        // STL is often Z-up, rotate to Y-up
        mesh.rotation.x = -Math.PI / 2;
        
        // Make it sit on the grid floor
        mesh.position.y = (size.z * scale) / 2;

        scene.add(mesh);

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

    const loader = new THREE.STLLoader();

    for (const target of targets) {
      target.classList.remove('stl-thumb-target'); // Process only once
      const url = target.dataset.stlUrl;
      if (!url) continue;

      try {
        const geometry = await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
        if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) geometry.computeVertexNormals();
        
        const material = new THREE.MeshPhongMaterial({ color: 0x00ccee, specular: 0x333355, shininess: 35 });
        const mesh = new THREE.Mesh(geometry, material);
        
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const center = new THREE.Vector3();
        box.getCenter(center);
        mesh.position.sub(center);
        
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 60 / maxDim;
        mesh.scale.set(scale, scale, scale);
        
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = (size.z * scale) / 2;
        
        // Remove previous mesh if any
        const prevMesh = scene.children.find(c => c.type === 'Mesh');
        if (prevMesh) { scene.remove(prevMesh); prevMesh.geometry.dispose(); prevMesh.material.dispose(); }
        
        scene.add(mesh);
        
        // Auto-scale camera to fit model
        const fov = camera.fov * (Math.PI / 180);
        let cameraDist = Math.abs(maxDim / Math.sin(fov / 2));
        cameraDist *= 1.2; // Safe margin
        
        camera.position.set(cameraDist * 0.7, cameraDist * 0.6, cameraDist * 0.7);
        camera.lookAt(0, 0, 0);
        
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        
        target.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.3s" onload="this.style.opacity=1">`;
        target.style.background = 'transparent';

        // Auto-upload the thumbnail so it's persistent
        const modelId = target.closest('[data-model-id]')?.dataset.modelId;
        if (modelId) {
          fetch(dataUrl).then(res => res.blob()).then(blob => {
            const file = new File([blob], `thumb_${modelId}.png`, { type: 'image/png' });
            API.uploadThumbnail(modelId, file).catch(err => console.warn('Thumb upload failed', err));
          });
        }
      } catch (e) {
        console.error('Failed to generate thumb for', url, e);
      }
    }
    
    // Cleanup
    renderer.dispose();
    renderer.forceContextLoss();
  }
};

