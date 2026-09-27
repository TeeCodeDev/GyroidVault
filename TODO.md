# GyroidVault To-Do List & Roadmap

---

## 🎯 Volgende Sessie (v2.3.0): Aanpasbare Interface, Quick Wins & Beheer

*Doel: Gebruikers in staat stellen om via Settings zelf te bepalen welke onderdelen zichtbaar zijn in de app, aangevuld met slimme bibliotheek-automatisering en onderhoudstools.*

### 🧩 1. Module Toggles in Settings (system_settings + /api/system/public-config)
- [ ] **Organisatie & Taxonomie Toggles:**
  - enable_categories: Toon/verberg *Categories* in sidebar, toolbar-dropdown, modelkaart-badges, *Edit Model* en de *Category*-knop in de multi-select balk.
  - enable_collections: Toon/verberg *Collections* in sidebar, collectie-badges en *Add to Collection* knoppen (modeldetail & bulk-actiebalk).
  - enable_tags: Toon/verberg *Tags* in sidebar, tag-pills op modelkaarten, tag-velden en de *Tag*-knop in de bulk-actiebalk.
  - enable_favorites: Toon/verberg *Favorites* in sidebar en het ster-icoon op modelkaarten.
- [ ] **Navigatie & Toolbar Toggles:**
  - enable_browse: Toon/verberg *Folder Explorer (Browse)* in de sidebar (voor wie puur met de virtuele bibliotheek werkt).
  - enable_stats: Toon/verberg het *Statistics* dashboard in de sidebar.
  - enable_format_pills: Toon/verberg de snelkeuze formaat-knoppen (All, STL, 3MF, STEP, G-Code, OBJ) in de toolbar + mogelijkheid om per formaat aan/uit te vinken welke pills getoond worden.
- [ ] **3D-Print Workflow & Integratie Toggles:**
  - enable_print_history: Toon/verberg het *Print History / Print Log* blok op de modeldetailpagina én het *Materials* beheer.
  - enable_sharing: Toon/verberg de publieke *Share*-knop op modellen (voor 100% lokale/privé installaties).
  - enable_printers: Toon/verberg *Send to Printer* acties en printer-beheer als er geen netwerkprinter wordt gebruikt.

### ⚡ 2. Workspace Presets, Startpagina & Modelkaart Weergave
- [ ] **1-Klik Workspace Presets (bovenaan UI Settings):**
  - *Full Suite (Standaard):* Alles ingeschakeld.
  - *Minimalist / NAS Folder Mode:* Alleen *All Models*, *Folder Explorer* en *3D Viewer* aan; *Categories*, *Collections*, *Tags* en *Print History* uit.
  - *Tag-Only Mode:* *Categories* en *Collections* uit, *Tags* en *Favorites* aan.
- [ ] **Instelbare Standaard Startpagina (default_landing_page):**
  - Keuze waar GyroidVault opent: *All Models*, *Folder Explorer (Browse)* of *Collections*.
- [ ] **Modelkaart Elementen & Grid Density:**
  - Toggles om formaat-badges (STL, 3MF), bestandsgrootte en aantal bestanden op modelkaarten te tonen/verbergen.
  - Keuze tussen *Compact* (meer kaarten per rij), *Comfortable (Standaard)* en *Large* (grotere thumbnails).
  - Centrale App.isFeatureEnabled(key) helper + data-feature-* attributen op <body> zodat wijzigingen in Settings direct live werken.

### 📸 3. Automatische 3D-Thumbnail Generator & Onderhoudsfilters
- [ ] **Auto-Generate Missing 3D Thumbnail (uto_generate_thumbnail toggle in Settings):**
  - Instelling in **Settings → General**: *"Automatically capture 3D thumbnail when opening a model without cover image"*.
  - Als deze optie aan staat en je opent een model dat nog geen thumbnail heeft, maakt de 3D-viewer zodra het model geladen is op de achtergrond automatisch een snapshot en slaat die op als model-thumbnail.
  - Optioneel: Een *"Generate Missing Thumbnails"* batch-knop in Settings om ontbrekende thumbnails automatisch achter elkaar te genereren.
- [ ] **Onderhoudsfilters: "Uncategorized" & "Untagged":**
  - Filteroptie in de sidebar en/of categorie-dropdown voor **Uncategorized** (category_id IS NULL) en **Untagged** (modellen zonder tags), zodat nieuwe/ongesorteerde modellen met 1 klik te vinden en in bulk in te delen zijn.

### 💾 4. 1-Klik Database & Thumbnail Backup / Restore (in Settings)
- [ ] **Backup Download (GET /api/system/backup):**
  - Genereert met 1 klik een .zip archief met gyroidvault.db + de uploads/thumbnails map (zodat categorieën, collecties, tags, gebruikers, instellingen en custom plaatjes veiliggesteld zijn zonder de gigabytes aan 3D-bestanden).
- [ ] **Backup Restore (POST /api/system/restore):**
  - Upload een eerder gemaakte backup-ZIP vanuit Settings om de database en thumbnails direct te herstellen.

### 🛡️ 5. CodeQL & Security Hardening (GitHub Security Alerts Opschonen)
- [ ] **server/index.js:156 (#33, #101, #115 — /uploads/:filename route):** Overbodige pp.get('/uploads/:filename') verwijderen (wordt al veilig afgehandeld door express.static(UPLOADS_DIR)) of voorzien van path.basename() + rate-limiter.
- [ ] **server/routes/files.js:295 (#116–#120 — uploadSlicerHandler path sanitization):** path.basename(req.file.originalname) en inline startsWith(path.resolve(LIBRARY_PATH)) check toevoegen zodat CodeQL de path-confinement herkent.
- [ ] **server/routes/models.js (#121–#126 — CodeQL Path Confinement herkenning):** Naast alidatePathConfinement een expliciete inline path.resolve(...).startsWith(...) guard zetten zodat CodeQL deze meldingen automatisch sluit.
- [ ] **public/js/app.js:2764 (#3 — DOM XSS in ddInlineTag):** UI.esc(val) toepassen bij het renderen van een nieuwe inline tag-pill.
- [ ] **public/js/components.js & public/js/app.js (#4, #8, #9, #108, #109 — Incomplete backslash sanitization):** .replace(/\\/g, '\\\\') toevoegen vóór .replace(/'/g, "\\'") op de 5 gemelde plekken.
- [ ] **server/routes/models.js:307 (#114 — Polynomial ReDoS) & server/utils/3mf.js / 3d.js (#112, #113 — Tainted format string):** Regex /^(.*?)\s*\(?v(\d+)\)?$/i vervangen door een lineaire check en console.error('...', err) vervangen door vaste format-strings (console.error('... %s', msg)).
- [ ] **.github/workflows/update-unraid-template.yml:9 (#1 — Missing workflow permissions & XML escaping):** Explicit permissions: contents: read toevoegen + release body via env-variabele uitlezen en &/</> escapen zodat Unraid XML altijd 100% valide blijft en backticks niet verdwijnen.

---

## 🌐 Community Requests & Issues (Backlog)
- [ ] **[Discussion #65](https://github.com/TeeCodeDev/GyroidVault/discussions/65):** Generic OIDC / SSO Support (Authentik, Keycloak, Authelia, Pocket ID) met .well-known/openid-configuration auto-discovery, JIT user provisioning, groep-naar-rol mapping (dmin/uploader/iewer) en lokaal wachtwoord fallback.
- [ ] **[Issue #6](https://github.com/TeeCodeDev/GyroidVault/issues/6):** Support 3MF Colors & Object Tree in 3D Viewer (Bambu/OrcaSlicer paint_color / extruder filament kleuren uitlezen + losse objecten in 3MF aan/uit vinken).
- [ ] **[Issue #5](https://github.com/TeeCodeDev/GyroidVault/issues/5):** Scanmethod (verbeteringen aan folder- en bibliotheekdetectie).

---

## 🎨 Overige UI/UX & Architectuur Verfijningen
- [ ] **Hover Quick-Actions op Modelkaarten:** De actieknoppen (3D Preview 👁️, Collectie 📁, Download 📥) toevoegen aan UI.modelCard in public/js/components.js.
- [ ] **Collectie-badges op Modeldetail:** Klikbare collectie-badges toevoegen aan de header van de modeldetailpagina (UI.modelDetail) naast de categorie en tags.
- [ ] **Frontend Opsplitsen in Logische Modules:** De monolithische public/js/app.js en components.js opsplitsen in behapbare modules (bijv. viewer, models, collections, settings).

---

## 🛠️ Toekomstige Brainstorm & Functies
- [ ] **Visueel Assemblagebord (Kanban-stijl):** Deel een collectie op in kolommen (*Nog te printen*, *Bezig*, *Geprint*, *Gemonteerd*).
- [ ] **BOM (Bill of Materials) & Hardware Checklist:** Boutjes, moertjes, lagers en magneten per project afvinken.
- [ ] **Stap-voor-stap Montagehandleiding:** Foto's en Markdown instructies koppelen aan een collectie.
- [ ] **Filament- & Voorraadbeheer (Filament Rack):** Visueel rollenoverzicht met gewicht/kleur en optionele Spoolman-integratie.
- [ ] **Live Printer Monitor & Dashboard:** Webcam-streams, temperatuurgrafieken en kostenstatistieken via Moonraker/Bambu.

---

## ✅ Reeds Afgerond (Changelog)

### v2.2.0 (Recent)
- [x] **Snelkeuze Formaat-Pills & Klikbare Badges:** Formaat-filterknoppen (All, STL, 3MF, STEP, G-Code, OBJ) en live bibliotheekteller in de toolbar + klikbare formaat-badges op modelkaarten.
- [x] **Bulk Categorie Toewijzing:** Multi-select *Category* knop toegevoegd aan de zwevende actiebalk in zowel *All Models* als *Folder Explorer* (Browse).
- [x] **ZIP Archief Toggle Fix (#70):** Ontbrekende .toggle-switch span toegevoegd aan *Scan & Index ZIP Archives* in General Settings, inclusief directe auto-save met toast-bevestiging en bescherming van Security-toggles.
- [x] **Modulaire Backend Architectuur:** server/index.js opgesplitst in Express routers (server/routes/*), services, middleware, utils en server/config.js, plus /healthz healthcheck endpoint.

### v2.1.1
- [x] **1000x Snellere All Models Queries (#67):** Gecorreleerde subqueries verwijderd uit /api/models; paginate-then-hydrate patroon (<80ms op 25k+ modellen).
- [x] **Disk Sync Batching & I/O Fix (#67):** Concurrency guard, batching per 200 bestanden en 1x per uur draaien i.p.v. elke 5 minuten.
- [x] **ZIP Archief Scan Loop Fix (#69):** Virtuele archief-paden (is_archive_entry = 1) worden niet meer onterecht door disk-sync gewist.
- [x] **ZIP Scan Instelling (#69):** Toggle in Settings > General Settings om diepe archiefinspectie aan of uit te zetten.
- [x] **Onbevoegde Model Verwijderingen Fix (#69):** Selectie-checkboxes verborgen voor niet-ingelogden; 401 Unauthorized geeft een echte error.
- [x] **3D Viewer Fullscreen Glitch (#66):** Footer verborgen in fullscreen en canvas styling vergrendeld.