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
    │ (Parses text by day tags & converts images to Base64 data URIs)
    ▼
[Vercel Backend API (/api/ingest)]
    │ (Validates Bearer token & writes to Turso Cloud SQLite)
    ▼
[Turso SQLite Database]
    │ (Stores immutable weekly records & subscriber emails)
    ▼
[Automated Monday Broadcast]
    ├─ (Website Visitors) -> Enter email in "Stay Connected" widget to subscribe
    ├─ (Email Newsletter) -> Dummy Gmail sends rich HTML update to all subscribers
    ├─ (Author Receipt)  -> Confirmation receipt sent back to Elder Salviejo
    ▼
[Vercel Dynamic Frontend]
    ├─ (/)     -> Live Directory: Elder Salviejo's Weekly Journal Vault
    └─ (/week/[id]) -> Polaroid Viewer: Scrollable photos & sticky-note reflections
```

---

### 1. The Input Layer: Two Submission Modes

#### A. Weekly Diary Reflections (P-Day Letters)
* Draft your reflection in Gmail during your Preparation Day (P-Day).
* **Subject**: `Weekly Reflection: Week 2 in Dumaguete [YOUR_DIARY_PASSCODE]`
* **Body Format**:
  ```text
  -VERSE-
  Alma 26:12
  "Yea, I know that I am nothing; as to my strength I am weak; therefore I will not boast of myself, but I will boast of my God, for in his strength I can do all things."

  --- MONDAY ---
  Preparation day! Did laundry, emailed family, and played basketball with the district elders.

  --- TUESDAY ---
  Morning companion study in Alma 26. Walked through Sibulan and met an investigator family.
  ...
  --- SUNDAY ---
  Sacrament meeting in Dumaguete 1st Ward. Bore testimony of the Savior Jesus Christ.

  --- WEEKLY REPORT ---
  Lessons: 14
  Investigators: 6
  Baptisms: 0
  Sacrament: 2
  ```
* **Attachments**: 7 daily routine photos (`.jpg`, `.png`, `.heic`).
* **Processing**: Statistical report sections are automatically stripped from public view, photos are stored in GitHub & jsDelivr CDN, subscribers are notified via email, and the thread is labeled `diary-processed`.

#### B. Direct Polaroid Photo Gallery Uploads
* Send raw mission memories and photo albums directly to the live Polaroid Wall.
* **Subject**: `Sibulan District Conference [YOUR_GALLERY_PASSCODE]` *(Include album categories like `Baptisms`, `Companions`, `Service`, `Transfers`, `Teaching`, `P-Day`)*.
* **Body (Optional Caption / Story Note)**:
  ```text
  Wonderful district conference gathering with President and Sister across the Negros Oriental zone!
  ```
* **Attachments**: Any number of photos (1 to 50+ photos).
* **Processing**: Photos are optimized and pinned to `/gallery`, story captions are attached, and the thread is labeled `gallery-processed`.

### 2. The Processing Layer (Google Apps Script)
* Script located in [`google-apps-script/Code.gs`](./google-apps-script/Code.gs).
* Runs on a scheduled daily 9:00 PM trigger (`createDaily9PMTrigger`) or manual execution.
* **Smart Compression Engine**: Photos $\le 350\text{ KB}$ preserve 100% original camera quality and skip Drive processing. Photos $> 350\text{ KB}$ are resized to $800\text{px}$ width.
* Dispatches authenticated payload via `UrlFetchApp.fetch()` to `/api/ingest`.
* Automatically labels processed threads with `diary-processed` or `gallery-processed`.
* Dispatches deduplicated weekly broadcast to website subscribers from Turso SQLite.

### 3. The Transport Layer (Vercel API Endpoint)
* Serverless route [`api/ingest.js`](./api/ingest.js) deployed on Vercel.
* Enforces Bearer token security (`INGEST_SECRET`).
* Automatically commits photos & letters to GitHub (`vault/`) and saves metadata to Turso SQLite.

### 4. The Storage Layer (Turso SQLite Database & GitHub Vault)
* **Turso SQLite**: Stores `weeks`, `gallery`, `subscribers`, `broadcast_logs`, and `family_encouragements`.
* **GitHub Repository Vault (`vault/`)**: Permanent Git archive of Markdown letters and raw photos.
* **jsDelivr Edge CDN**: Global high-speed content delivery for all photos.

### 5. The Presentation Layer (Dynamic Frontend)
* **The Index Vault (`/`)**:
  * Clean archive list, Polaroid count, Month of 24 Months progress indicator, and Mission Journey Timeline.
* **The Dynamic Journal View (`/week/[slug]`)**:
  * Responsive Polaroid cards & sticky-note reflections.
  * **Family & Friends Encouragement Board**: Live message feed powered by Turso SQLite.
  * **1-Click Save / Print PDF**: Clean printable layout for scrapbooks.
  * **PWA Support**: "Add to Home Screen" on iOS & Android.
* **The Polaroid Photo Wall (`/gallery`)**:
  * Pinned 3D pushpin Polaroid cards organized by category albums with lightbox view.

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
│  └── turso.js        # Turso SQLite database client & queries
├── public/
│  ├── index.html       # The Index Vault (mini-inbox directory)
│  └── week.html       # The Dynamic Journal View (polaroids & sticky-notes)
├── sample-data/
│  ├── sample-payload.json  # 7-day demo payload with embedded SVG images
│  └── send-test-ingest.js  # CLI utility to test /api/ingest
├── scripts/
│  └── init-db.js       # Turso schema initialization script
├── .env.example        # Environment variables template
├── .gitignore         # Git ignore rules
├── package.json        # Node.js configuration and scripts
├── server.js         # Standalone local HTTP server
├── TURSO_SCHEMA.sql      # Raw SQLite schema for Turso
└── vercel.json        # Vercel deployment & URL rewrites
```

---

## Quickstart Guide

### 1. Clone & Install Dependencies
```bash
git clone <your-repo-url>
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

### 3. Initialize the Turso Database
If you haven't created a database yet with the Turso CLI:
```bash
# Install Turso CLI (if not already installed)
curl -sSfL https://get.tur.so/install.sh | bash

# Create database
turso db create diary-vault

# Retrieve database URL and token
turso db show diary-vault --url
turso db tokens create diary-vault
```

Run the schema migration:
```bash
npm run db:init
```

### 4. Local Development & Testing
Start the local server:
```bash
npm start
```
* **Index Vault**: Visit `http://localhost:3000`
* **Demo Page**: Visit `http://localhost:3000/week/sample`

Test the ingest pipeline locally without waiting for Gmail:
```bash
npm run test:ingest
```

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import the repository in [Vercel Dashboard](https://vercel.com/new).
3. In **Project Settings** > **Environment Variables**, add:
  * `TURSO_DATABASE_URL`: Your Turso DB URL
  * `TURSO_AUTH_TOKEN`: Your Turso auth token
  * `INGEST_SECRET`: Secret token for authorization
4. Click **Deploy**.

---

## Google Apps Script Setup

1. Open [Google Apps Script](https://script.google.com) and create a **New Project**.
2. Copy the contents of [`google-apps-script/Code.gs`](./google-apps-script/Code.gs) into `Code.gs`.
3. In **Project Settings**, enable the `appsscript.json` manifest and paste [`google-apps-script/appsscript.json`](./google-apps-script/appsscript.json).
4. Add **Script Properties**:
  * `VERCEL_INGEST_URL`: `https://your-project.vercel.app/api/ingest`
  * `INGEST_SECRET`: Same value as in Vercel
  * `GMAIL_QUERY`: `subject:"Weekly Reflection" -label:diary-processed`
5. Add a **Time-driven Trigger** on `processWeeklyDiaryEmails` (e.g. Every 6 hours).
6. Refer to [`google-apps-script/README.md`](./google-apps-script/README.md) for full details.

---

## Security Best Practices
* **Token Authentication:** The `/api/ingest` route requires `Authorization: Bearer <INGEST_SECRET>`. Unauthenticated requests receive HTTP 401.
* **SQL Parameterization:** Queries to Turso use parameterized positional arguments to prevent SQL injection.
* **Content Escaping:** Frontend views sanitize all text using HTML entity escaping before injection into the DOM.
* **Immutable Storage:** Database records use `ON CONFLICT(slug) DO UPDATE` to allow updating or re-running a week without corrupting existing historical records.

---

## License
MIT License. Crafted for personal journaling and private family sharing.
