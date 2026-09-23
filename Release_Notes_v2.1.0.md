# GyroidVault v2.1.0 — STEP 3D Viewer, Bambu Studio & CAD Previews

A huge release packed with community contributions and requested fixes!

### ✨ What's New

- **STEP / STP 3D Viewer (#62):** You can now view `.step` and `.stp` CAD models directly in the 3D viewer. Powered by WebAssembly (OpenCASCADE) in a background Web Worker so the interface stays snappy. Big thanks to @zampierilucas!
- **Bambu Studio Integration (#61):** Added Bambu Studio to the slicer options. GyroidVault automatically packages STLs into 3MF on-the-fly so Bambu Studio opens them directly via `bambustudio://`. Thanks to @zampierilucas!
- **Fusion 360 (.f3d) Thumbnails (#60):** GyroidVault now automatically extracts the embedded rendered preview from your `.f3d` files upon upload or library scan. Thanks to @zampierilucas!

### 🐛 Fixes & Improvements

- **Collection Modal Crash (#64):** Fixed the `UI.collectionSelectForm is not a function` error when adding models to collections. Includes search filtering and multi-select checkboxes.
- **Login with Username or Email (#63):** You can now log in using either your username or email address, with whitespace trimming and case-insensitivity.
