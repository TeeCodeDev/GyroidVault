Welcome to version 1.5.0. This major update brings full support for Binary G-Code (`.bgcode`), a customizable primary 3D preview selector, rich metadata & preview modals in Folder Mode, real-time upload progress with speed & ETA, Autodesk Fusion 360 (`.f3d`) file support, Markdown descriptions with live preview, default print materials, and light/dark theme fixes.

## New Features

- **Binary G-Code (`.bgcode`) Support**: Full native support for Binary G-Code files (`GCDE` header, Deflate/zlib block decompression). GyroidVault automatically extracts slicer metadata (printer model, filament type, nozzle and bed temperatures, layer height, infill percentage, estimated print time) and generates embedded PNG thumbnails.
- **Custom Primary 3D Preview Selector**: When a model contains multiple STL or 3MF files, you can now choose exactly which file serves as the primary 3D preview and thumbnail using the `★ Set as Preview` action in the model detail view.
- **Rich Folder Mode Metadata & Previews**: File cards in Folder Mode now display essential slicer metadata chips (print time, filament type, nozzle temperature). Clicking any file opens a modal with interactive 3D/G-code toolpath inspection, slicer specifications, and quick download or send-to-printer actions.
- **Real-Time Upload Progress, Speed & ETA**: File uploads now feature a live progress bar showing transferred size, percentage, upload speed in MB/s, and estimated time remaining (ETA).
- **Organized `/library` Storage**: Model files are now stored directly inside the model's subfolder within your mounted `/library` path, keeping your disk storage organized and eliminating lingering upload caches.
- **Autodesk Fusion 360 (`.f3d`) & STEP (`.stp`) Support**: You can now store, organize, filter, and download `.f3d` CAD files and `.stp` models directly in GyroidVault alongside your STLs and 3MFs.
- **Markdown Support in Model Descriptions**: Model descriptions now support full GitHub-flavored Markdown formatting (headings, bold/italic text, lists, blockquotes, code blocks, links, and images). It also includes interactive **Write** and **Preview** tabs when creating or editing models.
- **Default Material Setting for Print Logging**: You can now configure your default material (e.g. PLA) under **Settings -> Materials**. New print logs will automatically pre-select your preferred material.

## Bug Fixes & Improvements

- **Persistent Default Categories**: Fixed an issue where container restarts or reloads would re-add previously deleted default categories. Category seeding is now guarded by a persistent `seeded_defaults` system flag.
- **Light / Dark Mode Toggle Fix**: Added a complete, polished Light Mode theme and fixed the top-right theme toggle so users can easily switch between Dark/Glass and Light mode with immediate visual icon updates.
