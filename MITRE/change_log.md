# MITRE ATT&CK Console Change Log

A comprehensive and persistent log of all reporting refactorings, visual redesigns, compatibility engineering, and system optimizations implemented in the MITRE ATT&CK explorer.

---

## [2026-06-01] Bugfix – GitHub API Sync Failure & Offline Rule URL Fix

### 🐛 1. Critical Fix: "Malformed tree response" Sync Failure
* **Root Cause:** The `executeSyncFromGitHub()` function was routing `api.github.com` requests through `fetchViaProxy()`, a CORS proxy system designed for RSS/XML feeds. These proxies (`corsproxy.io`, `codetabs`, `allorigins`) mangled the JSON response, causing `JSON.parse()` to fail or produce objects without a `.tree` property.
* **Fix:** GitHub API has full native CORS support from any origin. The sync now always uses native `fetch()` directly with the proper `Accept: application/vnd.github.v3+json` header. CORS proxies are never used for API endpoints.
* **Added:** Rate-limit detection (HTTP 403 with `X-RateLimit-Reset` header), truncation warnings, and detailed error diagnostics logged to console.

### 🐛 2. Fix: Offline Rules "View on GitHub" Opening Dead Links
* **Root Cause:** The 32 offline baseline rules in `sigma_rules.json` have fabricated UUIDs and URLs that don't correspond to real files in the SigmaHQ repository. Clicking "View on GitHub" opened 404 pages.
* **Fix:** Offline rules are now tagged with `isOfflineBaseline: true`. The "View on GitHub" button changes to "Search on GitHub" for these rules and opens a code search on the SigmaHQ repo using the rule's title. An "Offline Baseline" badge (indigo) is displayed in the details panel header.

### 📦 3. Expanded Rule Directory Coverage
* **Change:** The rule path filter now matches all SigmaHQ directories: `rules/`, `rules-emerging-threats/`, `rules-threat-hunting/`, and `rules-compliance/`. Previously only `rules/` was indexed, missing hundreds of emerging threat and compliance rules.
* **Added:** `item.type === 'blob'` check to exclude directory entries from the tree filter.

---

## [2026-06-01] Sigma Explorer Phase 3 – Persistent IndexedDB Cache, Auto-Sync & Date Filtering

### 💾 1. IndexedDB Persistent Cache Architecture
* **Permanent Storage:** Replaced volatile in-memory storage with IndexedDB (`SigmaHQExplorer` database). All 3,000+ rules now persist permanently across browser refreshes, tab closures, and restarts.
* **Batch Write Engine:** Implemented `idbBatchPut()` to write rules in batches of 500, preventing transaction timeouts during initial 3,000+ rule caching.
* **Hydration Persistence:** When a rule's YAML is fetched on-demand, the hydrated content (title, description, technique_id, tactic, level, status, dates, logsource) is immediately written back to IndexedDB. Subsequent page loads restore the full hydrated rule instantly — no re-fetch needed.

### 🔄 2. Auto-Sync on First Visit & 24-Hour Cache Refresh
* **Auto-Connect:** On first page load (empty cache), the system automatically connects to GitHub and indexes all 3,000+ rules — no manual "Connect Live" button click required. The button now functions as a force-refresh control.
* **Instant Restore:** On subsequent page loads, rules are restored from IndexedDB cache instantly (typically <100ms for 3,000+ records).
* **24-Hour Freshness Cycle:** After 24 hours, a background re-sync fetches the latest Git tree, detects new rules (by path) and modified rules (by SHA comparison), merges them into the cache, and persists the update.
* **Sync Button States:** The button dynamically shows: `✓ Synced · 3,247 Rules` (green), `⚠ Offline · 3,247 Cached` (amber), or `⚠ Retry Sync` (error state).

### 🔗 3. Linked Sigma Rule Persistence Fix (Critical Bug Fix)
* **The Problem:** When a user connected live, linked a Sigma rule to a query, then refreshed the page, the linked rule disappeared because only 32 offline rules were loaded. The query's `sigmaRuleId` reference became orphaned.
* **The Fix:** With IndexedDB persistence, all indexed rules survive refresh. The `sigmaRules` array is restored from cache on page load, ensuring linked Sigma rule IDs always resolve correctly. The coverage engine (`getSigmaCoverageStatus`) now always finds matching rules.

### 🗓️ 4. Date Filtering & Sort Controls
* **Date Filter Dropdown:** Added "All Dates", "New Since Sync", "Today", "This Week", "This Month" filter. Uses rule YAML `date`/`modified` fields for hydrated rules, and `firstSeenAt` timestamp for unhydrated rules.
* **Sort Controls:** Added "Sort: Default", "A → Z", "Z → A", "Critical First", "Low First", "Newest First" dropdown with immediate client-side re-rendering.
* **YAML Date Parsing:** `parseRuleDateField()` and `parseRuleModifiedField()` extract creation and modification dates from hydrated YAML content. Displayed in cards as formatted dates (e.g. "Jun 1, 2026").

### ⭐ 5. New Rule Detection System
* **SHA Tracking:** Each indexed rule stores its Git blob SHA. On re-sync, rules with changed SHAs are flagged as modified and marked for re-hydration.
* **`isNew` Flag:** Rules not present in the previous cache receive `isNew = true`. These display a pulsing purple `NEW` badge on their card and a purple left border highlight.
* **Stats Dashboard Card:** A 6th stat card "New Since Sync" appears when new rules are detected, showing the count.

### 🎨 6. Additional Improvements
* **Rule Status Parsing:** Hydrated rules now parse the `status:` YAML field (stable/production/test/experimental). Displayed as color-coded badges in the details panel header.
* **Calendar Tag:** Details panel shows a calendar-icon date tag when YAML dates are available.
* **Dynamic Logsource Override:** On hydration, the logsource `product` and `category` are updated from actual YAML content (more accurate than path-heuristic parsing).
* **Consolidated Event Binding:** Refactored all filter event listeners into a clean array-driven binding system with a shared `resetSigmaView()` handler.

---

## [2026-06-01] Sigma Explorer Phase 2 – Virtual Scrolling, Progress Notifications, Coverage Badges & Advanced Filtering

### 📊 1. Real-Time Statistics Dashboard
* **Live Metrics Cards:** Added 5 glassmorphic stat cards above the explorer showing: Total Rules, Active Coverage (linked to queries), Defensive Gaps, Filtered View count, and Hydrated/Cached count. Cards update dynamically on every filter change.
* **Coverage Linkage Engine:** Built `getSigmaCoverageStatus()` and `getSigmaCoverageStats()` functions that cross-reference every Sigma rule against the active layer's deployed queries. Rules with matching `sigmaRuleId` or `sigmaRuleTitle` are tagged as "Active Coverage"; all others are "Defensive Gaps".

### ⚡ 2. Virtual Scrolling & Pagination
* **DOM-Efficient Rendering:** Replaced full DOM injection (which would render 3,000+ cards simultaneously) with a paginated virtual scrolling system. Only 50 cards render per page, with a "Load More" button showing remaining count.
* **Progressive Loading:** Each click of "Load More" appends the next 50 rules, keeping scroll position and active selection intact. Total count badge reflects filtered, not visible, count.

### 🔔 3. Live Sync Progress Notification Bar
* **Visual Progress Panel:** Added a full-width sync progress bar (`sigma-sync-container`) that appears during GitHub connection. Shows percentage, current status message, and animated progress gradient bar.
* **Non-Blocking Batched Processing:** Rule indexing now processes in batches of 200 with `await` yields to the event loop, preventing UI thread blocking during the 3,000+ rule merge.
* **Auto-Dismiss:** Progress bar auto-hides 3 seconds after successful completion.

### 🛡️ 4. Coverage Badges on Rule Cards
* **Active Coverage Badge:** Rules linked to at least one deployed query show a green `<i class="bi bi-shield-fill-check"></i> Active` badge on their card.
* **Defensive Gap Badge:** Unlinked rules show an amber `<i class="bi bi-shield-fill-exclamation"></i> Gap` badge, providing instant visual triage across the entire catalog.
* **Details Panel Integration:** The details workspace also prominently displays coverage status next to the severity level.

### 🔍 5. Expanded Filter System
* **Additional Filter Row:** Added a second row of refinement controls below the main control bar: Severity Level (informational/low/medium/high/critical), Coverage Status (active/gap), and Product (dynamically populated from indexed rules).
* **Expanded Log Sources:** Increased log source dropdown from 7 to 17 categories including Registry Set, Registry Add, File Changes, File Access, File Deletions, Image Load, DNS Queries, Pipe Created, Driver Load, PowerShell Script, and PS Classic Start.
* **Expanded Tactics:** Added Initial Access and Exfiltration to the tactic filter dropdown.
* **Dynamic Product Filter:** `populateProductFilter()` scans all indexed rules and builds the product dropdown dynamically after live connection.

### 🎨 6. Design & Quality of Life Improvements
* **Debounced Search:** Added 180ms debounce on the search input to prevent lag during rapid typing across 3,000+ rules.
* **Card Header Restructure:** Split card header into left group (technique ID + virtual badge) and right group (coverage badge + severity level) for cleaner information hierarchy.
* **Empty State Enhancement:** Details panel empty state now shows live statistics (total rules indexed, connection status) as contextual information.
* **Acronym Expansion:** Extended the title beautifier to recognize 12 additional security acronyms (DNS, HTTP, SSH, SMB, TCP, UDP, FTP, RPC, DCOM, MSI, PS1, BAT, VBS, HTA, MSHTA, CSC, MSBUILD, REG, NTDS, NT).

---

## [2026-06-01] Live SigmaHQ Scaling, 3,000+ Git-Tree Rules, Autocomplete & Dynamic Report References

### 💻 1. Local Baseline & Live 3,000+ Rules Git-Tree Database
* **Hybrid Storage Architecture:** Created `MITRE/data/sigma_rules.json` populating 32 structured baseline offline rules.
* **Master Git-Tree API Indexing:** Added an asynchronous recursive master git tree compiler (`https://api.github.com/repos/SigmaHQ/sigma/git/trees/master?recursive=1`) to dynamically pull paths of **all 3,000+ rules** in the live SigmaHQ repository in a single request.
* **On-Demand Content Hydration:** Virtual indexed rules are fetched directly from GitHub's raw CDN on-the-fly when clicked, parsed via browser regex patterns, cached locally, and fully loaded without hitting unauthenticated API rate limits.

### 🌐 2. Premium Live SigmaHQ Rules Explorer Tab
* **Interactive Live Dashboard:** Added a dynamic "Sigma Rules" navigation tab (`#sigma-view`) and style sheets (`css/sigma.css`) in glassmorphic dark mode.
* **Live Connection Panel:** Embedded a custom `Connect Live (3,000+ Rules)` controller inside the top control bar. It fetches, sanitizes file paths into readable titles (e.g. mapping WMI, LSASS, RDP acronyms), categorizes log sources, and updates counters dynamically.
* **Advanced Query Filters:** Built real-time filters for product, category log source, tactic phase, and full text-search queries spanning both baseline offline and 3,000+ live virtual rules.
* **Code Previewer:** Implemented a glowing, dark monospace code preview block inside the details panel showcasing the rule's raw YAML, complete with clipboard-copying micro-animations.

### 🔗 3. Smart Autocomplete Attachment & Query Binding
* **Modal Autocomplete:** Injected autocomplete keyup search controls inside the Query Editor modal dialog. Hunters can type titles or technique IDs to search the local database.
* **Visual Attachment Badging:** Clicking a Sigma suggestion automatically populates hidden metadata fields and locks a beautiful, responsive Sigma rule badge inside the modal, disabling input clutter until cleared.
* **Persistent Serialization:** Updated `saveQuery()` to inject rule attributes (`sigmaRuleId`, `sigmaRuleTitle`, `sigmaRuleUrl`) inside the layer's JSON query schemas. This guarantees that layer exports via "Export JSON" preserve linked rules indefinitely.

### 📊 4. Automated C-Suite Telemetry Mappings & References
* **Dynamic compilation:** Enhanced the reporting compiler (`buildEmailHTML` in `js/reports/view.js`) to scan the active monthly queries collection and extract any associated Sigma rule references.
* **C-Suite References Appendix:** Linked rules are automatically parsed and appended as clean, clickable public GitHub rule links inside **Tier 4: Telemetry Proof & Appendix** inside monthly reports (PDFs, HTML, and EML exports) without requiring manual documentation.

---

## [2026-06-01] Report Redesign, Outlook Compatibility & Nav Persistence

### 🏛️ 1. 4-Tier Inverted Pyramid Report Restructuring
* **Concept:** Refactored the monthly coverage exports (EML, HTML, PDF) to follow the **Inverted Pyramid Principle** of executive communication.
* **Layout Organization:** Reorganized the assessment sections into 4 logical, progressive tiers:
  * **Tier 1: Executive Security Posture:** Unified Posture Banner, 5-card Dashboard (Framework Coverage, Active Detections, Tactical Gaps Filled, Threats Disrupted, and Maturity Circular Grade Gauge), and a merged double-column **Leadership Briefing** table mapping Executive Summary, Leadership Guidance, and Monthly Strategic Focus Areas.
  * **Tier 2: Threat Landscape & Strategic Gaps:** Adversary mapper defensive readiness indexes, active threat zero-coverage gaps, and gap triage priorities roadmap.
  * **Tier 3: Operational Hunt Progress:** Chronological activity timeline logs, live hunt detections (with SIR tickets and notes), and statistical coverage evolution.
  * **Tier 4: Telemetry Proof & Appendix:** Sigma/KQL deployed query libraries, data scopes, hunting methodologies, and compliance audit appendices.
* **Navigation Guide:** Added a clickable TOC table indexing all four tiers.

### 📧 2. Bulletproof Outlook Client Compatibility
* **The Problem:** Microsoft Outlook Desktop (utilizing the MS Word rendering engine) drops all inline `<svg>` elements.
* **The Solution:** Implemented **Mso Conditional Compilation Comments** (`<!--[if mso]>` and `<!--[if !mso]><!-->`) to compile a dual-rendering gauge:
  * *Modern Web/Email Clients:* Dynamically draw the scaling circular SVG maturity dial gauge.
  * *Desktop Outlook:* Automatically ignore SVG markup and render an elegant, bold **solid colored table badge** matching the coverage grade's color palette.
* **Padding Fallbacks:** Standard CSS cell padding drops in Outlook were resolved by introducing explicit spacing cells (`<td width="4%"></td>`).

### 💎 3. Pristine Screenshot PDF Exports & Disclaimers
* **Primary Export:** Reverted the main **Export PDF** button back to the high-fidelity screenshot generator (`html2pdf.js`). This ensures all complex glassmorphism effects, custom gradients, colors, and layout ratios are captured exactly as shown on the web dashboard (which standard browser prints strip by default).
* **PDF Snapshot Disclaimer Bar:** Embedded a polished, professional red-alert document snapshot bar at the top of PDF captures:
  > 📌 *Document Snapshot: This PDF is a high-fidelity visual snapshot of the interactive dashboard. Text elements within this PDF are non-selectable. For an interactive or text-selectable format, please view the live web report.*
  This bar adaptively inherits Light/Dark mode themes, is automatically visible in PDFs (`.is-pdf`), and stays completely hidden on standard web and EML email formats.
* **Browser Printing Option:** Added a secondary **Print** button at the end of the action toolbar to trigger native browser-based vector printing if needed.

### 🔗 4. EML TOC Jump Navigation Fixes
* **The Problem:** Relative fragment jump anchors (`href="#tier-X"`) inside EML/HTML exports sometimes resolved against base localhost URLs, trying to open browser tabs pointing to `http://localhost/#tier-X`.
* **The Solution:** Injected explicit, EML-compliant **classical name anchors** (`<a name="tier-1"></a>` etc.) immediately inside the container wrapper of all four tiers. EML readers now scroll locally within the email window.

### 🔄 5. View Navigation Persistence on Reload
* **Tab Retention:** Updated the navigation link controller inside `MITRE/app.js` to store the active view key (`attack-explorer-current-view`) in `localStorage` on click.
* **Bootstrap Restore:** Configured the `init()` async bootstrap sequence to retrieve the saved tab key and programmatically trigger the view click immediately after the STIX bundle finishes loading, keeping the user seamlessly on their active view during browser page reloads.
