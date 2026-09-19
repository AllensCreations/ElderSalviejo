# Graph Report - ElderSalviejo  (2026-09-19)

## Corpus Check
- 49 files · ~1,880,650 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: .css 4, (none) 3, .ico 2)

## Summary
- 343 nodes · 538 edges · 24 communities (20 shown, 4 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a55f7de1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- turso.js
- extract-metadata.js
- server.js
- package.json
- optimize-icons.js
- Data Flow Architecture
- js/gallery.js
- Step-by-Step Setup in the Dummy Account
- js/index.js
- lightbox.js
- scriptures.js
- encouragements.js
- test-receiver.js
- week.js
- manifest.json
- book.js
- appsscript.json
- vercel.json
- print-helper.js
- countdown.js
- sw.js
- Cloudflare Email Routing & Worker Trigger Guide
- fetch

## God Nodes (most connected - your core abstractions)
1. `isTursoConfigured()` - 19 edges
2. `getDbClient()` - 19 edges
3. `initDatabase()` - 17 edges
4. `server` - 11 edges
5. `readLocalDb()` - 9 edges
6. `bindEvents()` - 9 edges
7. `Step-by-Step Setup in the Dummy Account` - 8 edges
8. `autoSaveToGitHub()` - 7 edges
9. `saveWeeklyDiary()` - 7 edges
10. `saveGalleryEntry()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `initDatabase()`  [EXTRACTED]
  scripts/init-db.js → lib/turso.js

## Import Cycles
- None detected.

## Communities (24 total, 4 thin omitted)

### Community 0 - "turso.js"
Cohesion: 0.10
Nodes (42): { searchAllContent, initDatabase }, { getMissionStats, initDatabase }, {
  isMessageProcessed,
  recordProcessedMessage,
  getBroadcastLogsForWeek,
  recordBroadcastLogs,
  initDatabase
}, { getWeekBySlugOrId, initDatabase }, addEncouragement(), addSubscriber(), { createClient }, exportCompleteDatabase() (+34 more)

### Community 1 - "extract-metadata.js"
Cohesion: 0.09
Nodes (25): { getAllGalleryPhotos, initDatabase }, ref_fs, ref_http, ref_path, fs, parsed, path, payloadData (+17 more)

### Community 2 - "server.js"
Cohesion: 0.10
Nodes (24): crypto, crypto, { getAllWeeks, initDatabase }, ref_crypto, ref_url, adminHandler, crypto, encouragementsHandler (+16 more)

### Community 3 - "package.json"
Cohesion: 0.10
Nodes (19): author, dependencies, dotenv, @libsql/client, description, keywords, license, main (+11 more)

### Community 4 - "optimize-icons.js"
Cohesion: 0.12
Nodes (16): ref_zlib, crc32(), encodePng(), fs, icoBuf, makeChunk(), newIco, origIcoPath (+8 more)

### Community 5 - "Data Flow Architecture"
Cohesion: 0.11
Nodes (17): 1. Clone & Install Dependencies, 1. The Input Layer: Two Submission Modes, 2. Configure Environment Variables, 2. Scripture Dataset Location (`bcbooks/scriptures-json`), 3. API Reference & Utilities, 3. The Processing Layer (Google Apps Script), 4. Local Development & Testing, 4. The Transport Layer (Vercel API Endpoint) (+9 more)

### Community 6 - "js/gallery.js"
Cohesion: 0.18
Nodes (11): allPhotos, escapeAttr(), escapeHtml(), filterByCategory(), filteredPhotos, loadGallery(), loadMorePhotos(), renderFilters() (+3 more)

### Community 7 - "Step-by-Step Setup in the Dummy Account"
Cohesion: 0.08
Nodes (23): 1. Create the Google Apps Script Project, 2. Configure Private Credentials (Zero Secrets in Public Git), 3. Automated Trigger Setup: Instant & Scheduled Modes, 4. How to Send Submissions from Gmail, 5. Scripture Dataset Location (`bcbooks/scriptures-json`), 6. Version 3.0: Template Composer & Quick "Send Now" Web App, 7. Testing & Diagnostic Guide: How to Verify the Pipeline, A. Accessing the Interactive Web App (GUI) (+15 more)

### Community 8 - "js/index.js"
Cohesion: 0.23
Nodes (11): allWeeks, closeDocket(), escapeHtml(), fetchWeeks(), filterWeeks(), nextDocket(), openDocket(), prevDocket() (+3 more)

### Community 9 - "lightbox.js"
Cohesion: 0.33
Nodes (14): applyTransform(), bindEvents(), clampPan(), close(), createOrGetModal(), next(), open(), prev() (+6 more)

### Community 10 - "scriptures.js"
Cohesion: 0.10
Nodes (23): { autoSaveToGitHub }, { exportCompleteDatabase, initDatabase }, { autoSaveToGitHub }, { lookupScripture }, { saveWeeklyDiary, saveGalleryEntry, initDatabase, getAllSubscribers }, autoSaveToGitHub(), buildMarkdownLetter(), fetchExistingJsonFile() (+15 more)

### Community 11 - "encouragements.js"
Cohesion: 0.27
Nodes (8): { addEncouragement, getEncouragementsForSlug, initDatabase }, { checkRateLimit, isHoneypotTriggered }, { addSubscriber, getAllSubscribers, initDatabase }, { checkRateLimit, isHoneypotTriggered }, checkRateLimit(), getClientIp(), ipRequests, isHoneypotTriggered()

### Community 13 - "week.js"
Cohesion: 0.44
Nodes (7): cleanDayName(), cleanEntryText(), getSlugFromPath(), loadSamplePayload(), loadWeek(), renderWeek(), showError()

### Community 14 - "manifest.json"
Cohesion: 0.22
Nodes (8): background_color, description, display, icons, name, short_name, start_url, theme_color

### Community 15 - "book.js"
Cohesion: 0.39
Nodes (11): chunkWeekEntries(), escapeAttr(), escapeHtml(), getPhotoOrientation(), getPhotoRatio(), loadCompleteBook(), loadGalleryAppendix(), planDynamicOrientationSheets() (+3 more)

### Community 16 - "appsscript.json"
Cohesion: 0.29
Nodes (6): dependencies, enabledAdvancedServices, exceptionLogging, oauthScopes, runtimeVersion, timeZone

### Community 17 - "vercel.json"
Cohesion: 0.33
Nodes (5): cleanUrls, headers, redirects, rewrites, version

### Community 18 - "print-helper.js"
Cohesion: 0.60
Nodes (3): preloadAllImages(), showPrintGuidanceToast(), triggerPrintWithPreload()

### Community 22 - "Cloudflare Email Routing & Worker Trigger Guide"
Cohesion: 0.29
Nodes (6): 2 Ways to Use Cloudflare, Cloudflare Email Routing & Worker Trigger Guide, How It Works, How to Deploy to Cloudflare, Method A: Cloudflare Email Routing (True 0-Second Instant Ingestion), Method B: Cloudflare Scheduled Cron (Free 1-Minute Pinger)

### Community 23 - "fetch"
Cohesion: 0.83
Nodes (3): email(), fetch(), scheduled()

## Knowledge Gaps
- **142 isolated node(s):** `crypto`, `{ exportCompleteDatabase, initDatabase }`, `{ autoSaveToGitHub }`, `{ addEncouragement, getEncouragementsForSlug, initDatabase }`, `{ checkRateLimit, isHoneypotTriggered }` (+137 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 167 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `initDatabase()` connect `turso.js` to `server.js`, `extract-metadata.js`, `scriptures.js`, `encouragements.js`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `crypto`, `{ exportCompleteDatabase, initDatabase }`, `{ autoSaveToGitHub }` to the rest of the system?**
  _142 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `turso.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09948979591836735 - nodes in this community are weakly interconnected._
- **Should `extract-metadata.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08620689655172414 - nodes in this community are weakly interconnected._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10317460317460317 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `optimize-icons.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11695906432748537 - nodes in this community are weakly interconnected._