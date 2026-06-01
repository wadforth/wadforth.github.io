# MITRE ATT&CK Console Change Log

A comprehensive and persistent log of all reporting refactorings, visual redesigns, compatibility engineering, and system optimizations implemented in the MITRE ATT&CK explorer.

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
