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

## Component Mechanics

### 1. The Input Layer (Monday P-Day Email)
* Draft your reflection in Gmail during Monday Preparation Day.
* Format daily entries using explicit day tags:
 ```text
 --- MONDAY ---
 Preparation day! Did laundry, emailed family, and played basketball with the elders.

 --- TUESDAY ---
 Morning study in Alma 26. Walked through Sibulan and met investigators.
 ...
 --- SUNDAY ---
 Sacrament meeting in Dumaguete 1st Ward. Bore testimony of the Savior.
 ```
* Attach **7 image files** (`.jpg` or `.png`) directly to the email corresponding to each day's routine photo.
* Send to your dedicated **dummy receiver Gmail account**.

### 2. The Processing Layer (Google Apps Script)
* Script located in [`google-apps-script/Code.gs`](./google-apps-script/Code.gs).
* Runs on a scheduled time trigger (e.g. hourly or daily) or manual trigger.
* Finds unread reflection threads matching `GMAIL_QUERY`.
* **Base64 Encoding Engine:** Web browsers cannot access raw email binary blobs. The script executes `Utilities.base64Encode()` to transform each photo into an inline data URI (`data:image/jpeg;base64,...`).
* Maps each day tag to its corresponding image into an array of daily reflection objects.
* Dispatches an authenticated HTTP POST via `UrlFetchApp.fetch()` to your Vercel backend `/api/ingest`.
* Tags the processed thread in Gmail with label `diary-processed` to avoid duplicate processing.

### 3. The Transport Layer (Vercel API Endpoint)
* Serverless route [`api/ingest.js`](./api/ingest.js) deployed on Vercel Edge/Serverless.
* Enforces Bearer token security (`INGEST_SECRET`).
* Parameterizes incoming JSON payload into SQL statement.

### 4. The Storage Layer (Turso SQLite Database)
* Connects via `@libsql/client/web` using `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
* Stores immutable weekly entries in the `journal_weeks` table:
 ```sql
 CREATE TABLE journal_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  published_at TEXT NOT NULL,
  raw_subject TEXT,
  sender TEXT,
  entries TEXT NOT NULL,
  total_entries INTEGER DEFAULT 7,
  image_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
 );
 ```

### 5. The Presentation Layer (Dynamic Frontend)
* **The Index Vault (`/`)**:
 * Mini-inbox style directory.
 * Shows archive list with date stamps, titles, senders, reflection previews, and thumbnail badges.
* **The Dynamic Journal View (`/week/[id]`)**:
 * Fetches the selected week and loops through the 7 daily entries.
 * **Polaroid Cards:** Injects the Base64 data URI directly into `<img>` tags inside a white polaroid frame with washi tape and handwritten captions.
 * **Sticky-Note Reflections:** Warm pastel notes with pushpins, subtle rotations, and clean typography.
 * **Self-Contained & Immutable:** Zero external image hosting dependencies (AWS S3, Cloudinary, etc.); photos are stored permanently as Base64 strings directly in SQLite.
 * Built-in **Print / Save PDF** styling and one-click share link.

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
