# GyroidVault v2.1.1 — Library Performance Boost & Stability Fixes

This maintenance release brings massive speed improvements for large libraries, fixes a loop with ZIP archive indexing, and polishes authorization and viewer controls.

### ⚡ Performance & Scalability

- **1000x Faster All Models Loading (#67):** Optimized `/api/models` by eliminating 7 correlated subqueries in the initial query that were being computed before pagination limits. Page load times on libraries with 20k+ models / 180k+ files dropped from 70–80+ seconds to <80ms. Thanks to @sparsematrix!
- **Library Sync Optimization & Reduced Disk I/O (#67):** `syncLibraryWithDisk` now processes disk checks in concurrent batches with an active re-entrancy guard, batches deletes into a single database save, and runs hourly instead of every 5 minutes. Prevents event-loop starvation and eliminates hundreds of gigabytes of idle disk writes. Thanks to @sparsematrix!

### 🐛 Bug Fixes & Improvements

- **ZIP Archive Loop Fix & Setting (#69):** Fixed an issue where virtual entries inside `.zip` archives were deleted by the disk sync because they were not found as physical files on disk, causing them to be continuously re-scanned and re-deleted. Added a system setting in General Settings to toggle whether `.zip` files should be deep-scanned or indexed as regular files.
- **Unauthorized Bulk Delete Fix (#69):** Prevented unauthenticated visitors or viewers from seeing selection checkboxes or triggering bulk delete dialogs. Fixed `API.request` so HTTP 401 Unauthorized responses properly reject with an error instead of falsely reporting success.
- **3D Viewer Fullscreen Glitch (#66):** Fixed layout jumping and footer visibility issues when entering/leaving fullscreen 3D studio mode.
- **Docker Image Version Display (#66, #69):** Resolved version discrepancy in Docker builds so the application properly reports the running version and eliminates false update banners.
