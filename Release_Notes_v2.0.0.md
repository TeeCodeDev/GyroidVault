# GyroidVault v2.0.0

Hey everyone! It's finally here: **GyroidVault 2.0**.

What started out as fixing a few annoying UI quirks turned into a pretty much complete overhaul of how you view, inspect, and organize 3D models. We've spent a lot of late nights testing this with actual real-world libraries (including some crazy 2TB+ monster folders), and we're super excited to finally get it out there.

Here’s a breakdown of what's new, what got fixed, and what you can play with.

---

## 🚀 The Big Stuff

### 🧩 Studio 2.0 & Multi-Part Assembly
Ever download a model that has 6 or 8 separate STL files (like a tabletop miniature, a multi-material model, or a mechanical print) and you had to click through each file one by one just to guess how they fit together?
- **All Parts in One Scene:** In the 3D viewer, you now have a `🧩 PART:` selector. Choose **✦ All Parts Combined** and GyroidVault loads all your model's STLs and 3MFs right onto the virtual build plate at the same time, giving each part its own distinct color.
- **Real Physical Dimensions (`W × D × H mm`):** No more guessing how large a print actually is before firing up your slicer. The viewer measures the true bounding box in millimeters and shows it right in the top bar.
- **Live Filament Swatches:** Quickly toggle between 7 filament colors (Cyan, Orange, Emerald, Purple, Gold, White, Slate) to see how a model looks in different PLA/PETG shades.
- **Better Inspection Tools:** Wireframe mode, X-Ray mode, standard camera angles (Iso, Top, Front, Side), and a 1-click `Cover` button that grabs a snapshot of your current camera view to use as the model's thumbnail.

### 🎨 Calm 2-Column Detail Layout
The old model detail page was getting a bit crowded with cards everywhere. We completely rebuilt it:
- **Left column:** A spacious, distraction-free 3D viewport and quick-action bar (Download, Slice, Add to Collection).
- **Right column:** A clean tabbed workspace for your Markdown notes & print tips, unified file tables (with G-Code print specs), version history, and print logs.
- **Quick Specs:** Material, layer height, estimated print time, and weight right where you need them.

### 📚 2x2 Collection Collages & Streaming ZIPs
- **Dynamic 2x2 Collages:** Folders and collections now automatically generate a neat 2x2 grid preview from the models inside them.
- **1-Click ZIP Downloads:** You can now download an entire collection as a single ZIP. It streams straight from disk to your browser without hogging the server's RAM.

### 🏷️ Bulk Editing That Actually Works
Selecting 30 models one-by-one just to add a "Flexi" or "BoardGame" tag was painful. You can now `Ctrl+Click` or `Shift+Click` models in the library grid to:
- Add or replace tags across everything selected.
- Move entire batches into a different category.
- Bulk update privacy or visibility.

---

## ⚡ Under the Hood & Bug Fixes

### 📦 Massive Libraries (2TB+) & Background Scanner
If you pointed GyroidVault at a 50,000-model library on your NAS, the old scanner could lock up your HTTP requests or run out of memory trying to inspect giant archives.
- **Background Worker:** The scanner now runs asynchronously with live polling. You can see real-time folder and file counters in the UI while you keep browsing.
- **Memory Guard:** Added a 300MB buffer limit on archive inspections so Node.js won't crash when scanning massive 3MF or ZIP archives.
- **Concurrency Locks:** No more duplicate scan jobs triggering accidentally if two admins click scan at the same time.

### 🖱️ Fixed: That Annoying Modal Closing Bug!
If you ever tried to drag-rotate a 3D model, highlight text in a description, or grab a scrollbar, and your mouse slipped just 1 pixel outside the box... *poof*, the modal closed and your unsaved notes were gone.
- We rewrote the click-outside handler: it now checks both `mousedown` and `mouseup`. Unless you deliberately click down and release on the dark backdrop, the modal stays open.
- Also added an "Unsaved Changes" prompt so you won't accidentally lose a long print description if you hit `Esc`.

### 3D Preview Fix for STL / 3MF
Fixed a bug where setting an STL or 3MF as the primary preview file wouldn't update the library grid if an old thumbnail was cached. It now automatically clears the stale cached image and renders a fresh 3D preview.

---

## 🔒 Security & Housekeeping
Nothing flashy here, just good old-fashioned hygiene to keep your self-hosted vault safe:
- **Database Safety:** Switched all remaining raw SQL queries (like share link generation) to strict parameterized queries to prevent SQL injection.
- **Path Traversal Guard:** File uploads and model paths are strictly locked to your configured `LIBRARY_PATH` — no sneaky `../` directory escapes.
- **Private Collections:** Fixed an authorization gap where direct file download URLs on private collections could be guessed. If a collection is private, non-admins cannot stream or download its files.
- **Sanitized Inputs:** Model descriptions, print notes, and Markdown links are strictly escaped and sanitized to prevent XSS.
- **Rate Limiting:** Added sensible rate limits to auth endpoints (login, password reset) to block brute-force bots without bothering legitimate users.
- **Masked Secrets:** SMTP mail passwords and sensitive configuration keys are now masked (`••••••••`) in the settings UI.

---

## 🛠️ How to Upgrade

If you're running Docker:
```bash
docker pull ghcr.io/teecodedev/gyroidvault:latest
docker compose up -d
```

Or update directly via the **Unraid Community Apps** tab if you're on Unraid.

Database migrations run automatically on first start. As always with major releases, taking a quick backup of your `data/` folder before updating is good practice!

---

*Thanks to everyone in the community for testing, filing issues, and sharing feedback. If you run into anything weird, open an issue on [GitHub](https://github.com/TeeCodeDev/GyroidVault/issues).*
