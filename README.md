# Elder Salviejo • Weekly Journal Vault
> **Philippines Dumaguete Mission** • Dedicated to Family, Friends & Supporters
> 
> A serverless, decoupled event-driven pipeline bridging Elder Salviejo's weekly Monday Preparation Day (P-Day) emails to a permanent Turso Cloud SQLite database, dynamic Polaroid/sticky-note viewer on Vercel, and automated subscriber notification broadcast.

---

## Data Flow Architecture

```text
[Elder Salviejo (P-Day Email)]
    │ (Sends weekly email with daily reflections + 7 photos to dummy Gmail)
    ▼
[Dummy Gmail Receiver & Apps Script]
    │ (Runs daily 9:00 PM trigger, parses reflections, and resolves scripture)
    ▼
[Vercel Backend API (/api/ingest)]
    │ (Validates Bearer token & writes to Turso Cloud SQLite + GitHub Vault)
    ▼
[Turso SQLite Database & GitHub Vault]
    │ (Stores immutable weekly records, gallery photos, and subscriber emails)
    ▼
[Automated Monday Broadcast]
    ├─ (Website Visitors) -> Enter email in "Stay Connected" widget to subscribe
    ├─ (Email Newsletter) -> Dummy Gmail sends rich HTML update to all subscribers
    ├─ (Author Receipt)  -> Confirmation receipt sent back to Elder Salviejo
    ▼
[Vercel Dynamic Frontend]
    ├─ (/)          -> Live Directory: Elder Salviejo's Weekly Journal Vault
    ├─ (/week/[id]) -> Polaroid Viewer: Scrollable photos & sticky-note reflections
    ├─ (/gallery)   -> Polaroid Photo Wall: Dynamic albums & lightbox
    └─ (/book)      -> Digital Memory Book: 24-Month commemorative keepsake
```

---

### 1. The Input Layer: Two Submission Modes

#### A. Weekly Diary Reflections (P-Day Letters)
* Draft your reflection in Gmail during your Preparation Day (P-Day).
* **Subject**: `Weekly Reflection: Week 2 in Dumaguete [YOUR_DIARY_PASSCODE]`
* **Body Format**:
  ```text
  -VERSE- (Alma 26:12)

  --- MONDAY ---
  Preparation day! Did laundry, emailed family, and played basketball with the district elders.

  --- TUESDAY ---
  Morning companion study in Alma 26. Walked through Sibulan and met an investigator family.

  --- WEDNESDAY ---
  Taught the Plan of Salvation to Brother Bautista and enjoyed fresh buko juice from their tree.

  --- THURSDAY ---
  District Council meeting in Dumaguete City. Practiced Cebuano language roleplays.

  --- FRIDAY ---
  Service project helping Nanay Elena repair her bamboo fence after the rain.

  --- SATURDAY ---
  Street contacting along Rizal Boulevard during sunset overlooking the ocean.

  --- SUNDAY ---
  Sacrament meeting in Dumaguete 1st Ward. Bore testimony of the Savior Jesus Christ.
  ```
* **Scripture Formats Supported**:
  - `-VERSE- (Alma 26:12)` or `(Alma 26:12)` -> Automatically looks up verse text from `bcbooks/scriptures-json`.
  - `-VERSE- (VERSE 26:12)` or `(VERSE 26:12)` -> Defaults to Alma in Book of Mormon.
  - `-VERSE- (Alma 26:12) (Custom text)` -> Uses your custom verse text or personal note.
  - Supports all Standard Works (Book of Mormon, D&C, Pearl of Great Price, NT, OT).
* **Attachments**: 7 daily routine photos (`.jpg`, `.png`, `.heic`).
* **Processing**: Reflections and daily photos are saved to GitHub, jsDelivr CDN, and Turso SQLite, subscribers are notified via email, and the thread is labeled `diary-processed`.

#### B. Direct Polaroid Photo Gallery Uploads
* Send raw mission memories and photo albums directly to the live Polaroid Wall.
* **Subject**: `Sibulan District Conference [YOUR_GALLERY_PASSCODE]` *(Include album categories like `Baptisms`, `Companions`, `Service`, `Transfers`, `Teaching`, `P-Day`)*.
* **Body (Optional Caption / Story Note)**:
  ```text
  Wonderful district conference gathering with President and Sister across the Negros Oriental zone!
  ```
* **Attachments**: Any number of photos (1 to 50+ photos).
* **Processing**: Photos are optimized and pinned to `/gallery`, story captions are attached, and the thread is labeled `gallery-processed`.

---

### 2. Scripture Dataset Location (`bcbooks/scriptures-json`)

Scripture reference files from [`bcbooks/scriptures-json`](https://github.com/bcbooks/scriptures-json) are stored directly in your repository at:
```text
vault/scriptures/
├── book-of-mormon-reference.json
├── doctrine-and-covenants-reference.json
├── new-testament-reference.json
├── old-testament-reference.json
└── pearl-of-great-price-reference.json
```
- **Local Resolution**: `lib/scriptures.js` reads these local files directly for zero latency.
- **CDN Fallback**: Falls back to jsDelivr CDN (`https://cdn.jsdelivr.net/gh/bcbooks/scriptures-json@master/reference/`).

---

### 3. The Processing Layer (Google Apps Script)
* Script located in [`google-apps-script/Code.gs`](./google-apps-script/Code.gs).
* Runs on a scheduled daily 9:00 PM trigger (`createDaily9PMTrigger`) or manual execution.
* **Smart Compression Engine**: Photos $\le 350\text{ KB}$ preserve 100% original camera quality and skip Drive processing. Photos $> 350\text{ KB}$ are resized to $800\text{px}$ width.
* Dispatches authenticated payload via `UrlFetchApp.fetch()` to `/api/ingest`.
* Automatically labels processed threads with `diary-processed` or `gallery-processed`.
* Dispatches deduplicated weekly broadcast to website subscribers from Turso SQLite.

---

### 4. The Transport Layer (Vercel API Endpoint)
* Serverless route [`api/ingest.js`](./api/ingest.js) deployed on Vercel.
* Enforces Bearer token security (`INGEST_SECRET`).
* Automatically commits photos & letters to GitHub (`vault/`) and saves metadata to Turso SQLite.

---

### 5. The Storage Layer (Turso SQLite Database & GitHub Vault)
* **Turso SQLite Database**: Stores dedicated tables for `journal_weeks`, `gallery`, `subscribers`, `processed_messages`, `broadcast_logs`, and `family_encouragements`.
* **GitHub Repository Vault (`vault/`)**: Permanent Git archive of Markdown letters, JSON gallery albums, and raw photos.
* **jsDelivr Edge CDN**: Global high-speed content delivery for all photos and scriptures.

---

### 6. The Presentation Layer (Dynamic Frontend)
* **The Index Vault (`/`)**:
  * Clean archive list, Polaroid count, and Month of 24 Months missionary progress bar.
* **The Dynamic Journal View (`/week/[slug]`)**:
  * Responsive Polaroid cards & sticky-note reflections.
  * **Family & Friends Encouragement Board**: Live message feed powered by Turso SQLite.
  * **1-Click Save / Print PDF**: Clean printable layout for scrapbooks.
  * **PWA Support**: "Add to Home Screen" on iOS & Android.
* **The Polaroid Photo Wall (`/gallery`)**:
  * Pinned 3D pushpin Polaroid cards organized by category albums with lightbox view.
* **The Digital Memory Book (`/book`)**:
  * 24-Month commemorative keepsake with scripture epilogue from Alma 7:24.

---

## Repository Structure

```text
gmail-diary-vault/
├── api/
│  ├── ingest.js       # POST /api/ingest (Auth + Turso SQL insertion)
│  └── weeks/
│    ├── index.js      # GET /api/weeks (List weeks for Index Vault)
│    └── [id].js      # GET /api/weeks/:id (Single week full payload)
├── google-apps-script/
│  ├── Code.gs        # Gmail parser & Base64 encoder engine
│  ├── appsscript.json    # Apps Script OAuth manifest
│  └── README.md       # Apps Script configuration walkthrough
├── lib/
│  ├── scriptures.js   # Offline scripture reference resolver (bcbooks/scriptures-json)
│  ├── github-vault.js # GitHub repo & jsDelivr CDN archiving
│  └── turso.js        # Turso SQLite database client & queries
├── public/
│  ├── index.html       # The Index Vault
│  ├── week.html       # The Dynamic Journal View (polaroids & sticky-notes)
│  ├── gallery.html    # The Polaroid Photo Wall
│  └── book.html       # The 24-Month Digital Memory Book
├── vault/
│  ├── scriptures/     # Reference JSONs from bcbooks/scriptures-json
│  ├── diaries/        # Archived Markdown journal entries
│  ├── gallery/        # Archived gallery JSON entries
│  └── photos/         # Stored mission images
├── sample-data/
│  └── send-test-ingest.js  # CLI utility to test /api/ingest
├── scripts/
│  └── init-db.js       # Turso schema initialization script
├── .env.example        # Environment variables template
├── .gitignore         # Git ignore rules
├── package.json        # Node.js configuration and scripts
├── server.js         # Standalone local HTTP server
└── vercel.json        # Vercel deployment & URL rewrites
```

---

## Quickstart Guide

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/AllensCreations/gmail-diary-vault.git
cd gmail-diary-vault
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your credentials:
```ini
TURSO_DATABASE_URL=libsql://your-db-org.turso.io
TURSO_AUTH_TOKEN=your-turso-token
INGEST_SECRET=generate-a-strong-random-token
```

### 3. Local Development & Testing
Start the local server:
```bash
npm start
```
* **Index Vault**: Visit `http://localhost:3000`
* **Polaroid Gallery**: Visit `http://localhost:3000/gallery`
* **Digital Memory Book**: Visit `http://localhost:3000/book`

---

## License
MIT License. Dedicated to Elder Mark Salviejo, Philippines Dumaguete Mission.
