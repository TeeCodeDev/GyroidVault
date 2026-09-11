# GyroidVault v2.0.0 — Major Architecture & Studio Overhaul
**Release Date:** September 11, 2026

Welcome to GyroidVault 2.0! This milestone major release completely reimagines the model exploration experience with a calm 2-column Studio layout, an interactive 3D assembly inspection suite, physical millimeter dimension calculation, dynamic 2x2 collage collections, 1-click ZIP streaming, power batch editing, comprehensive security hardening, and crisp vector UI throughout.

---

## 🚀 Highlights & Major Features

### 💎 Official Brand Identity & Logo Debut
- **Gyroid Infill + Vault Key Emblem**: Introducing the official hexagon emblem uniting fluid organic gyroid 3D infill curves with a precision vault key.
- **High-DPI Multi-Scale Icon Suite**: Crisp transparent SVG & PNG assets, multi-resolution favicon layers (16px to 256px), and PWA icons.
- **Vibrant Dark-Themed Contrast**: Specially tuned neon glow and contrast palette matching the cyber-studio CAD dark aesthetic.

### 🎨 Model Detail Studio Redesign
- **Calm 2-Column Workspace**: Replaced the cluttered card grid with an organized layout inspired by modern CAD and slicer software.
- **Grouped Action Header**: Model title, status badges, primary `Download (STL/3MF)` CTA, collection manager, and quick slicer launcher.
- **Tabbed Model Workspace**:
  - **Overview**: Full markdown description with live formatting, list styling, and highlighted print tip callouts.
  - **Files & Slices**: Unified table for all CAD files, G-Codes with estimated print specs, and attachments.
  - **Print Log**: Chronological timeline of prints with status indicators and filament usage tracking.
  - **Versions**: Changelog history for iterative model versions.
- **Quick Specs Sidebar**: At-a-glance slicing specs (Est. Time, Weight, Filament, Layer Height) and Model Metadata (Categories, Tags, Date, Owner).

### 🧩 3D Interactive Studio & Multi-Part Assembly
- **Multi-Part Assembly Switcher (`🧩 PART:`)**: Inspect individual parts or switch to **✦ All Parts Combined** to load and render all STL/3MF parts simultaneously in the same 3D scene with distinct, harmonious palette colors.
- **Real-Time Physical Dimensions**: Automatically measures and displays the exact physical geometry bounding box in millimeters (`📐 W × D × H mm`).
- **Interactive Bottom Dock**:
  - **Camera Angle Presets**: 1-click camera views (`Iso`, `Top`, `Front`, `Side`).
  - **Shading Modes**: Switch between `Solid`, `Wireframe` mesh, and semi-transparent `X-Ray` inspection.
  - **Live Filament Swatches**: 7 real-time material colors (Cyan, Orange, Emerald Green, Purple, Gold, White, Slate Black).
  - **Studio Controls**: Toggle auto-rotation (`Spin`), toggle build plate grid floor, and expand to true Fullscreen Studio (`Esc` to exit).
- **1-Click Cover Snapshot**: Capture your preferred 3D camera angle directly as the model's primary thumbnail with a single click on `Cover`.

### 📚 Redesigned Collections & 2x2 Collages
- **Dynamic 2x2 Thumbnail Collages**: Collections automatically generate visual 2x2 collage previews from the models they contain.
- **1-Click ZIP Streaming**: Download entire collections as a single compressed archive directly from the browser without server disk bottlenecks.
- **Batch Collection Management**: Select multiple collections to update public/private visibility or delete in bulk.

### 🏷️ Power Batch Editing in Library
- **Bulk Tagging**: Append new tags or replace all tags across multiple models at once with tag pill selectors.
- **Bulk Category Move**: Reassign multiple models to a new category in one click.
- **Floating Frosted Glass Docks**: Sleek vector-based action docks with smooth slide-up animations.

---

## 🛡️ Comprehensive Security Audit & Defense Hardening
Following a thorough internal security vulnerability audit, GyroidVault 2.0 introduces multi-layered defense-in-depth across authentication, input sanitization, file integrity, and data authorization:

- **Parameterized SQL Execution Engine (CWE-89)**: Completely eliminated raw query interpolation in public share creation (`/api/shares`). All query parameters now utilize strictly typed integers (`safeInt`) and SQLite parameterized binding (`?`), preventing SQL injection attacks.
- **Dynamic 256-Bit Cryptographic Secret Persistence (CWE-798)**: Removed static fallback JWT secret keys. On first boot, GyroidVault automatically provisions a cryptographically secure 256-bit CSPRNG hex secret key and persists it in SQLite `system_settings`. User sessions seamlessly persist across container updates without manual environment setup.
- **Strict Filesystem Path Confinement (CWE-22 / CWE-23)**: Introduced a canonical path validation engine (`validatePathConfinement`) on model creation and file uploads (`/api/models`, `/api/models/:id/files`). Path traversal attempts using `../` or external absolute paths are rejected at the gate, keeping file operations strictly within `LIBRARY_PATH`.
- **Private Collection Isolation & IDOR Defense (CWE-639 / CWE-862)**: Gated direct CAD file streams (`/api/files/:id/stream`), downloads (`/api/files/:id/download`), and model metadata (`/api/models/:id`). Models residing in private collections are strictly restricted to the collection owner and administrators.
- **Cross-Site Scripting (XSS) Hardening (CWE-79 / CWE-80)**:
  - Universal HTML entity encoding (`escapeHtml`) across model titles, print tips, descriptions, and modal dialogues.
  - Safe URL protocol validator (`safeUrl`) allowing only `http:`, `https:`, and `mailto:` protocols—actively blocking `javascript:`, `data:`, and `vbscript:` execution.
  - Hardened Markdown image and link parsers with attribute breakout protection.
  - Replaced inline JavaScript string interpolation in event handlers with secure data attributes and handler functions.
- **Host Header Poisoning Defense (CWE-640)**: Password reset and user invitation email links now employ strict hostname syntax verification, preventing password reset token exfiltration via malicious `Host` headers.
- **Credential Protection in Settings (CWE-312)**: Upstream SMTP passwords are masked (`••••••••`) in API responses and configuration views, with write-back guards preventing accidental password overrides.
- **Content Security Policy (CSP)**: Re-enabled Helmet CSP tailored to safely support WebGL Three.js renderers, blob workers, Google Fonts, browser password managers, and local assets.
- **Tier-Based API Rate Limiting (CWE-307 / CWE-400)**: Added multi-tiered rate limiting to defend against brute-force and Denial-of-Service (DoS) abuse: baseline `/api` rate limiting (1000 req / 15m), strict authentication rate limits (15 req / 15m) across registration and password reset routes, and heavy operation limits (60 req / 15m) on ZIP downloads and bulk exports.
- **Disk & Telemetry Access Guards**: Mandatory authentication enforced across filesystem browsing endpoints (`/api/browse/*`), telemetry metrics (`/api/stats`), and static asset paths (`/uploads/*`, `/library-files/*`) in Private Instance mode.
- **Responsible Disclosure & Security Policy**: Established [`SECURITY.md`](file:///c:/Coding%20Projects/GyroidVault/SECURITY.md) and enabled GitHub Private Vulnerability Reporting for coordinated vulnerability disclosures.

---

## 🎛️ Modal UX & Form Safety
- **MouseDown + MouseUp Boundary Protection**: Fixed a browser event bubbling issue where dragging the mouse across modal boundaries (e.g., selecting text in description textareas, dragging scrollbars, or rotating 3D models with OrbitControls) dispatched unintended `click` events to the backdrop overlay. The overlay dismiss logic now strictly requires both `mousedown` and `mouseup` to originate directly on the backdrop, completely eliminating accidental modal dismissals.
- **3D Viewer Orbit Drag Immunity**: Applied the same `mousedown` + `mouseup` guard to the fullscreen 3D preview modal, allowing smooth camera rotation and panning without risk of prematurely closing the viewer.
- **Unsaved Changes Confirmation**: Added automatic form dirty state detection (`FormData` snapshot comparison) on backdrop click and `Escape` keypress, prompting the user before discarding unsaved text or staged files.

---

## 🛠️ Performance & Polish
- **Industrial Scale Background Library Scanner**: Redesigned library indexing from synchronous HTTP blocking to an asynchronous background worker with live polling (`GET /api/library/scan/status`). Features an active concurrency lock (`isScanning`), automatic page refresh re-attachment, live folder/file counts in the UI, and a 300MB memory safety guard on archive inspection to eliminate timeouts and out-of-memory crashes on massive collections.
- **Cache-Busting Engine**: Automated asset versioning prevents stale CSS/JS cache issues across browser sessions.
- **Sleek Vector Icons**: Replaced legacy emoji icons with crisp SVG icons across card hover actions, modals, and toolbars.
- **What's New Modal**: Integrated release viewer with visual highlights, full release changelogs, and direct support links.

---

## 📦 Upgrading
Pull the latest Docker image:
```bash
docker pull ghcr.io/teecodedev/gyroidvault:latest
```
Or update via Unraid Community Apps.
