# GyroidVault v2.2.0 — Quick Format Filters, Bulk Categories & Modular Architecture

This minor release introduces one-click format filter pills in the library toolbar, bulk category assignment for multi-selected items, a fix for the ZIP archive scan setting toggle, and a completely modularized backend architecture.

### ✨ New Features & UI Enhancements

- **Quick Format Filter Pills:** Added instant format filter pills (All, STL, 3MF, STEP, G-Code, OBJ) directly to the library toolbar (UI.toolbar) and made format badges on model cards clickable to quickly filter by file type.
- **Live Library Summary Counter:** Added a live model & storage summary counter (#library-summary-stats) to the library toolbar.
- **Bulk Category Assignment:** Added a **Category** action button to the floating multi-select bar in both the **All Models** library view and the **Folder Explorer** (Browse), allowing you to assign or clear a category across multiple selected models or folders at once.

### 🐛 Bug Fixes

- **ZIP Archive Scan Setting Toggle (#70):** Fixed a missing <span class="toggle-switch"></span> element on the *Scan & Index ZIP Archives* checkbox in **Settings → General**, which previously made the toggle switch invisible and seemingly unresponsive.
- **Instant Auto-Save for System Toggles (#70):** Toggling system checkboxes (such as *Scan & Index ZIP Archives* or Security toggles) now saves immediately with toast confirmation feedback, and saving the General Settings form no longer inadvertently resets Security Settings toggles.

### 🏗️ Architecture & Reliability

- **Modular Backend Architecture:** Refactored the monolithic server/index.js into focused Express route modules (server/routes/*.js), background task services (server/services/backgroundTasks.js), rate-limiting middleware (server/middleware/rateLimit.js), model helper utilities (server/utils/modelHelpers.js), and centralized configuration (server/config.js).
- **Container Health Check Endpoint:** Added a lightweight /healthz endpoint for Docker and reverse-proxy health checks.