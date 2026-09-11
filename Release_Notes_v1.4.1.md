# GyroidVault v1.4.1 — 3D G-Code Layer Inspection & Security
**Release Date:** August 1, 2026

Welcome to version 1.4.1! This update introduces interactive 3D G-code layer slicing inspection, dynamic build plate scaling, IP rate-limit administration, duplicate file detection, and redesigned security and maintenance panels.

## New Features

- **Interactive 3D G-Code Layer Inspection**: You can now inspect parsed G-Code files layer by layer directly in your browser! The built-in 3D viewer features an interactive layer slider showing real-time layer numbers (`Layer X / Y`) and live Z-height readouts in mm.
- **Dynamic Build Volume Grid & Filament Colors**: The G-code 3D previewer automatically detects your printer model from metadata and resizes the build volume grid accordingly (supporting Bambu Lab 256x256, Prusa 250x210, Creality Ender 220x220, Voron 300x300, and more). It also matches the highlight colors to your specified filament.
- **Auto-Centered 3D Camera Framing**: The 3D camera automatically calculates the exact bounding box of parsed G-Code models, centering the camera target and framing the view perfectly regardless of slicer bed offsets.
- **Duplicate File Finder**: A brand new duplicate model scanner under **Settings -> Maintenance**. It uses SHA-256 file hashing to quickly discover duplicate STL, 3MF, or G-Code files across your library.
- **IP Auto-Block & Rate-Limit Management**: Administrators can now monitor IP addresses flagged for failed login attempts under **Settings -> Security** and unblock them with a single click without restarting the server.
- **Redesigned Settings Tabs**: The settings area has been reorganized with dedicated **Security** and **Maintenance** tabs, featuring modern iOS-style toggle switches for Open Registration and Private Instance Mode.
- **Global Search Shortcut (`Ctrl + K` / `Cmd + K`)**: Easily trigger the global search bar from anywhere in the application by pressing `Ctrl+K` on Windows/Linux or `Cmd+K` on macOS.
- **Smart Printer UI**: The "Send to Printer" button now cleanly hides itself when no printers are configured, preventing unnecessary clicks.

## Bug Fixes

- **Terabyte Library Size Formatting**: Fixed a formatting issue where library storage sizes exceeding 1 TB were displayed as `"1.1 undefined"`. Units now correctly support TB and PB scale.
- **Deletion Security Guards**: Enforced strict authentication and role-based guards on model and file deletion API endpoints to prevent unauthorized actions.
- **Docker Workflow Stability**: Upgraded the container build pipeline to Node 22 LTS, resolving registry timeout issues during multi-architecture image builds.
