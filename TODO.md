# GyroidVault To-Do List & Roadmap

---

## 🎯 Volgende Sessie: Prioriteit Focuspunten (In 1x aanpakken)

### 🎨 Deel 1: UI/UX Verfijningen (Laatste 10% aansluiten)
*Alle CSS en Javascript-handlers staan al voor 90% klaar; alleen de HTML templates moeten worden aangesloten.*
- [ ] **Snelkeuze Formaat-Pills in Toolbar:** Directe filterknoppen (`[ All ]` `[ STL ]` `[ 3MF ]` `[ STEP ]` `[ GCODE ]` `[ ZIP ]`) toevoegen aan `UI.toolbar` in `public/js/components.js`. De logica `App.setFormatFilter` en CSS `.format-pill` zijn al aanwezig.
- [ ] **Live Bibliotheek Teller in Toolbar:** `#library-summary-stats` toevoegen aan `UI.toolbar` zodat de actuele teller (`X models • Y GB`) rechtsboven in de balk direct zichtbaar is.
- [ ] **Hover Quick-Actions op Modelkaarten:** De actieknoppen (3D Preview `👁️`, Collectie `📁`, Download `📥`) toevoegen aan `UI.modelCard` in `public/js/components.js`. De overlay `.model-card-hover-actions` is al gestyled in `public/css/style.css` en `App.handleModelCardClick` vangt de kliks al op.
- [ ] **Collectie-badges op Modeldetail:** Klikbare collectie-badges toevoegen aan de header van de modeldetailpagina (`UI.modelDetail`) naast de categorie en tags.

### 🏗️ Deel 2: Codebase Architectuur & Refactoring (Modularisatie)
*Structurele opschoning om `server/index.js` (~2.800 regels) en de frontend ontkoppeld en onderhoudbaar te maken.*
- [ ] **Backend Modulariseren in Express Routers:**
  - `server/routes/auth.js` (login, registratie, sessies, profiel, API keys)
  - `server/routes/models.js` (model CRUD, queries, uploads, versies)
  - `server/routes/files.js` (downloads, slicer links, streams, previews)
  - `server/routes/projects.js` & `server/routes/tags.js` (collecties, labels, categorieën)
  - `server/routes/settings.js` & status (systeeminstellingen, SMTP, printer config, scan status)
  - `server/index.js` afslanken tot een schone bootstrap entrypoint (app setup, middleware, poort luisteren).
- [ ] **Frontend Opsplitsen in Logische Modules:**
  - De monolithische `public/js/app.js` en `components.js` opsplitsen in behapbare modules (bijv. viewer, models, collections, settings) zodat wijzigingen gerichter en veiliger worden.
- [ ] **Centrale Configuratie & Validatie:**
  - `server/config.js` introduceren voor nette validatie van omgevingsvariabelen (`PORT`, `LIBRARY_PATH`, `DATA_DIR`) bij het opstarten.

---

## 🌐 Community Issues (Backlog)
- [ ] **[Issue #6](https://github.com/TeeCodeDev/GyroidVault/issues/6):** Support 3MF Colors in 3D Viewer (kleurweergave voor multi-color 3MF bestanden in Three.js).
- [ ] **[Issue #5](https://github.com/TeeCodeDev/GyroidVault/issues/5):** Scanmethod (verbeteringen aan folder- en bibliotheekdetectie).

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
- [x] **1000x Snellere All Models Queries (#67):** Gecorreleerde subqueries verwijderd uit `/api/models`; paginate-then-hydrate patroon (<80ms op 25k+ modellen).
- [x] **Disk Sync Batching & I/O Fix (#67):** Concurrency guard, batching per 200 bestanden en 1x per uur draaien i.p.v. elke 5 minuten.
- [x] **ZIP Archief Scan Loop Fix (#69):** Virtuele archief-paden (`is_archive_entry = 1`) worden niet meer onterecht door disk-sync gewist.
- [x] **ZIP Scan Instelling (#69):** Toggle in Settings > General Settings om diepe archiefinspectie aan of uit te zetten.
- [x] **Onbevoegde Model Verwijderingen Fix (#69):** Selectie-checkboxes verborgen voor niet-ingelogden; 401 Unauthorized geeft een echte error.
- [x] **3D Viewer Fullscreen Glitch (#66):** Footer verborgen in fullscreen en canvas styling vergrendeld.

### v2.1.0 & v2.0
- [x] **STEP/STP 3D Viewer (#62):** OpenCASCADE / WebAssembly worker rendering in de 3D viewer.
- [x] **Bambu Studio Integratie (#61):** On-the-fly 3MF packaging voor `bambustudio://` deep-linking.
- [x] **Fusion 360 (.f3d) Thumbnails (#60):** Automatische thumbnail extractie uit F3D CAD bestanden.
- [x] **Multi-Select Checkboxes (#64):** "Add to Collection" venster met zoekfilter en checkboxes.
- [x] **Database Composite Indexes:** Indexen op alle foreign keys en sorteerkolommen in SQLite.
- [x] **Scanner Event-Loop Yields:** Micro-pauzes (`setImmediate`) in de folder watcher.
- [x] **Collecties Bewerken & Sync:** `PUT /api/projects/:id` en `PUT /api/models/:id/projects`.
- [x] **409 Conflict & Smart Name Suggestion:** HTTP 409 met 1-klik alternatieve naamknop.
- [x] **In-place ZIP Streaming:** Bestanden streamen direct vanuit ZIP naar slicer/viewer.
