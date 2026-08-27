# GyroidVault To-Do List & Roadmap

---

## 🚀 Prioriteit: Release v1.6.0 Takenlijst (Volgende Sessie)

### 1. ⚡ Schaalbaarheid voor 1M+ Bestanden & Scanner/UI Deadlock Fix
- [ ] **Database Composite Indexes:** Toevoegen van indexen op `files(model_id, file_type)`, `model_tags(model_id)`, `project_models(model_id)` en `models(created_at, updated_at)` om queries bij 650k+ STL's tot 1000x sneller te maken.
- [ ] **Debounced Scanner Database Exports:** Tijdens actieve achtergrondscans niet meer per bestand `saveDb()` (SQLite export) aanroepen, maar gebufferd in batches (om de 5.000 bestanden / 30 seconden) en bij voltooiing.
- [ ] **Asynchrone Event-Loop Yields:** Micro-pauzes (`setImmediate`) inbouwen in de scanner zodat WebUI HTTP-verzoeken altijd binnen milliseconden worden afgehandeld en de interface nooit vastloopt.
- [ ] **Batch Tag & File Fetching:** De `/api/models` query optimaliseren zodat alle tags voor de 24 modellen op de pagina in één `IN (...)` query worden opgehaald i.p.v. 24 aparte queries.

### 2. 🗂️ Collections / Projecten Uitbreiding
- [ ] **Hernoemen / Bewerken van Collecties:** Backend `PUT /api/projects/:id` toevoegen en "Edit Collection" modal in de UI bouwen.
- [ ] **Multi-Select Checkboxes:** "Add to Collection" venster ombouwen van single-dropdown naar een checkbox-lijst met zoekfilter en automatische pre-check van huidige collecties.
- [ ] **Sync Endpoint:** `PUT /api/models/:id/projects` toevoegen om meerdere collecties tegelijk toe te wijzen of te verwijderen.
- [ ] **Collectie Badges op Model:** Op de modeldetailpagina klikbare badges tonen van alle collecties waar het model in zit.

### 3. 🛡️ Dubbele Modelnamen & 409 Conflict
- [ ] **409 Conflict Response:** 500 server crash op `library_path` of naam-collisie vervangen door een nette `409 Conflict` statuscode.
- [ ] **Smart Name Suggestion:** Automatisch een unieke alternatieve naam genereren (`"Modelnaam (2)"`, `"Modelnaam (3)"`).
- [ ] **UI Waarschuwing:** In het modelformulier een duidelijke melding tonen met een **"Gebruik suggestie: [Naam (2)]"** 1-klik knop.

### 4. 📦 ZIP-archief Ondersteuning (Patreon / Printables bundels)
- [ ] **In-place ZIP Indexering:** Scanner en uploads `.zip` bestanden laten herkennen en de interne STL-, 3MF- en afbeeldingsbestanden indexeren (met `adm-zip`) zonder dubbele schijfruimte te verbruiken.
- [ ] **On-Demand File Streaming:** `GET /api/files/:id/stream` toevoegen om bestanden direct vanuit het ZIP-archief naar de 3D-viewer of slicer te streamen.
- [ ] **ZIP Badge & Weergave:** Duidelijke ZIP-badge op modelkaarten en in het bestandenoverzicht.

### 5. 🎨 UI/UX Verfijning & Rustig Design
- [ ] **Snelkeuze Formaat-Pills:** Bovenaan het raster directe filterknoppen: `[ All ]` `[ STL ]` `[ 3MF ]` `[ STEP ]` `[ GCODE ]` `[ ZIP ]`.
- [ ] **Live Bibliotheek Teller:** Rechtsboven in de filterbalk het actuele aantal modellen en totale bibliotheekgrootte tonen (`X models • Y GB`).
- [ ] **Subtiele Scan Indicator:** Als de achtergrondscanner draait, een rustige statusregel linksonderin de navigatie tonen (`Scanning... 1.090 / 47.865`) met een dunne voortgangsbalk.
- [ ] **Hover Quick-Actions:** Subtiele hover overlay op modelkaarten voor snelle 3D-preview (`👁️`), toevoegen aan collectie (`📁`) en download (`📥`).
- [ ] **Moderne Toast Notificaties:** Vloeiende feedbackberichten rechtsonder bij acties.

---

## 🛠️ Toekomstige Brainstorm & Functies
*Veel 3D-bestandsbeheerders stoppen bij het downloaden van de bestanden. GyroidVault kan de brug slaan naar de daadwerkelijke creatie.*

- [ ] **Visueel Assemblagebord (Kanban-stijl)**
  - Deel een project (Collectie) op in kolommen/statusfases: *Nog te printen*, *Bezig met printen*, *Geprint*, en *Gemonteerd*.
  - Ideaal voor complexe projecten die uit tientallen losse STL-onderdelen bestaan.
- [ ] **BOM (Bill of Materials) & Hardware Checklist**
  - Voeg een lijst toe van benodigde niet-geprinte hardware per project (bijv. *"12x M3 10mm boutjes"*, *"4x 608 lagers"*, *"6x2mm magneten"*).
  - Vink af wat je al in huis hebt of al hebt gemonteerd.
- [ ] **Stap-voor-stap Montagehandleiding**
  - Mogelijkheid om foto's, links en Markdown-instructies toe te voegen aan een collectie, zodat je in GyroidVault direct kunt zien hoe je het project in elkaar zet.

---

## 🧵 2. Filament- & Voorraadbeheer (Fysieke Integratie)
*Koppel je digitale modellen en printlogs direct aan je fysieke voorraad filament.*

- [ ] **Visueel Filament Rek (Filament Rack)**
  - Een prachtig vormgegeven dashboard dat je fysieke rollen filament toont als realistische rollen met hun echte kleur (hex-code), merk, materiaal (PLA, PETG, TPU) en resterend gewicht.
  - Optionele integratie met de populaire **Spoolman** API, of een eenvoudige, snelle ingebouwde database.
- [ ] **Automatische Verbruiksregistratie**
  - Selecteer bij het loggen van een print de gebruikte rol filament. GyroidVault trekt automatisch het aantal verbruikte grammen (berekend uit de G-code of handmatig ingevoerd) af van het resterende gewicht van de rol.

---

## 🌐 3. Slimme Integraties & Automatische Metadata
*Bespaar tijd bij het importeren en taggen van nieuwe modellen door handmatig werk te automatiseren.*

- [ ] **1-Klik Printables / Thingiverse Metadata Importer**
  - Plak de URL van een Printables- of Thingiverse-pagina en GyroidVault haalt automatisch de titel, beschrijving, licentie, tags en de originele coverfoto's op.
- [ ] **Automatische Scanner Regels (Smart Folder Rules)**
  - Stel slimme regels in voor de automatische folder watcher. Bijvoorbeeld: *"Als de mapnaam 'TPU' bevat, voeg dan automatisch de tag 'TPU' toe en markeer als flexibel."*
  - Genereer automatisch collecties gebaseerd op de mappenstructuur op de schijf.

---

## 👁️ 4. Geavanceerde 3D & Slicer Previews
*Krijg een beter beeld van de schaal en details van een model voordat je je slicer opent.*

- [ ] **Referentie-objecten in de 3D Viewer (Scale Reference)**
  - Voeg een dropdown toe aan de 3D-viewer om een bekend alledaags object (zoals een AA-batterij, een blikje cola, een smartphone of een 3D-banaan) direct naast het model te renderen. Dit geeft direct een gevoel van de ware grootte.
- [ ] **2D Bouwplaat Planner (Print Plate Canvas)**
  - Een minimalistisch 2D-canvas dat je printerbed representeert (bijv. 256x256mm voor Bambu Lab). Sleep thumbnails van STL's op de plaat om te kijken of ze samen in één printrun passen, en sla dit op als een geplande "Print Job".

---

## 📊 5. Dashboard & Printer Monitoring
*Maak van GyroidVault het centrale zenuwcentrum van je 3D-print-setup.*

- [ ] **Live Printer Monitor Card**
  - Toon de live webcam-stream (MJPEG/WebRTC), temperatuurgrafiek en voortgangsbalk van actieve Klipper (Moonraker) of Bambu Lab printers direct op het GyroidVault-dashboard.
- [ ] **Printstatistieken & Kostenanalyse**
  - Interactieve grafieken (bijvoorbeeld met Chart.js) die laten zien hoeveel gram filament je per maand verbruikt, het succespercentage van je prints, en een schatting van de totale stroom- en materiaalkosten.
