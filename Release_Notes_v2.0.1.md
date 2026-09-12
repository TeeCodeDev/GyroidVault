# GyroidVault v2.0.1 — Hotfix Release

**Release Date:** September 12, 2026

A quick hotfix release addressing two community-reported issues following the v2.0.0 launch:

### 🐛 Bug Fixes

- **Fix Collection Crash (`no such column: size`)**: Fixed a query typo (`SUM(size)` -> `SUM(file_size)`) when fetching collection details that caused an HTTP 500 error and prevented models from displaying in collections (#56).
- **Set Uploaded Images as Cover**: Added the missing "Set as Cover" action button for uploaded photos and renders in the model files list, allowing users to choose an image file as the primary gallery thumbnail instead of a 3D snapshot.
