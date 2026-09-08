# Elder Salviejo: Dedicated Dummy Receiver & Instant P-Day Broadcast Guide
> **Philippines Dumaguete Mission**

This script runs inside your **dedicated dummy Gmail account** (the receiver for Elder Salviejo's texts and photos). It operates **continuously 24/7**, so whenever you send your reflection email on **ANY Preparation Day (P-Day)**:
1. **Instantly Detects**: Picks up your weekly email and extracts the reflections and 7 daily routine photos within minutes.
2. **Encodes & Ships**: Converts photos into inline Base64 data URIs and POSTs the structured payload to your live Vercel API.
3. **Multi-CDN & Auto-Save**: Vercel automatically saves the full diary JSON, Markdown letter, and raw photos into your GitHub repository (`vault/`) and makes them available worldwide via the **jsDelivr CDN** (`https://cdn.jsdelivr.net/gh/...`).
4. **Database Archiving**: Saves the week into your **Turso SQLite database**.
5. **Automated Newsletter Broadcast**: Emails a polaroid announcement to all **website subscribers** (and any manual distribution list) with a direct link to the live viewer.
6. **Confirmation Receipt**: Replies directly to your email thread confirming that your journal is published!

---

## Step-by-Step Setup in the Dummy Account

### 1. Create the Google Apps Script Project
1. Log into your **dummy Gmail account**.
2. Go to [script.google.com](https://script.google.com) and click **+ New project**.
3. Rename the project to **Elder Salviejo Diary Processor**.
4. Replace the default `Code.gs` with the code in [`google-apps-script/Code.gs`](./Code.gs).
5. In the left sidebar, click **Project Settings** (gear icon) > Check **"Show 'appsscript.json' manifest file in editor"**.
6. Return to the editor, click `appsscript.json`, and replace its content with [`google-apps-script/appsscript.json`](./appsscript.json).
7. Press `Ctrl + S` (`Cmd + S`) to save.

---

### 2. Configure Private Credentials (Zero Secrets in Public Git)
To keep your public GitHub repository 100% clean and free of secret keys, store your private secrets directly in Google Apps Script properties:

#### Method A: Using the Setup Function (Easiest)
1. At the bottom of [`Code.gs`](./Code.gs), find the `setupPrivateProperties` helper.
2. In the toolbar function dropdown, select `setupPrivateProperties`.
3. Open `Code.gs` temporarily and adjust the parameters to your secrets:
  ```javascript
  setupPrivateProperties('YOUR_VERCEL_INGEST_SECRET', 'YOUR_DIARY_PASSCODE', 'YOUR_GALLERY_PASSCODE');
  ```
4. Click **Run**. When finished, revert those values in the code so they stay blank in Git.

#### Method B: In Project Settings UI
1. Click **Project Settings** (gear icon on the left sidebar).
2. Scroll to **Script Properties** and click **Add script property** for each:

| Property | Value | Description |
| :--- | :--- | :--- |
| `VERCEL_INGEST_URL` | `https://eldersalviejo.vercel.app/api/ingest` | Production ingest endpoint |
| `INGEST_SECRET` | *(Your private Vercel INGEST_SECRET)* | Shared authorization secret |
| `SECRET_DIARY_CODE` | *(Your private chosen passcode)* | Passcode filter for weekly diary reflections |
| `SECRET_GALLERY_CODE` | *(Your private gallery passcode)* | Passcode filter for direct photo gallery uploads |
| `SITE_URL` | `https://eldersalviejo.vercel.app` | Base public website URL |
| `ALLOWED_SENDER` | *(Optional)* | Filter to only accept emails from your missionary address |

> **Note on Subscribers:** All subscribers are automatically stored and managed centrally in your **Turso SQLite database** whenever family, friends, or supporters subscribe via the website form. You do not need to manage any email lists in Google Apps Script!

---

### 3. One-Click 9:00 PM Daily Trigger Setup
To set the script to process every day automatically at **9:00 PM (21:00)**:

1. In the Apps Script toolbar dropdown, select:
   ```text
   createDaily9PMTrigger
   ```
2. Click **Run**.
3. It will automatically delete all previous / obsolete triggers and set a clean daily 9:00 PM schedule.
4. Check the execution log:
   ```text
   SUCCESS: Daily 9:00 PM (21:00) trigger active! All other triggers have been removed.
   ```

---

### 4. How to Send Submissions from Gmail

You can submit two types of emails to your dummy receiver account:

---

#### Option A: Weekly Diary Reflections (P-Day Letters)
- **To**: `your-dummy-account@gmail.com`
- **Subject**: `Weekly Reflection: Week 2 in Dumaguete [YOUR_DIARY_PASSCODE]` *(e.g. `Weekly Reflection: Week 2 in Dumaguete 159266`)*
- **Body Format**:
  ```text
  -VERSE-
  Alma 26:12
  "Yea, I know that I am nothing; as to my strength I am weak; therefore I will not boast of myself, but I will boast of my God, for in his strength I can do all things."

  --- MONDAY ---
  Preparation day! Did laundry, wrote emails home, and played basketball with the district elders.

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

  --- WEEKLY REPORT ---
  Lessons: 14
  Investigators: 6
  Baptisms: 0
  Sacrament: 2
  ```
- **Attachments**: 7 photos (.jpg, .png, .heic) matching each day from Monday to Sunday.
- **What Happens**:
  1. The reflection and daily photos are saved to GitHub, jsDelivr CDN, and Turso SQLite.
  2. Private statistical report numbers (`Lessons: 14`, etc.) are automatically stripped from public view.
  3. All website subscribers receive the **Weekly Broadcast Newsletter**.
  4. Elder Salviejo receives an instant **Confirmation Receipt**.
  5. The thread in the dummy account is labeled **`diary-processed`**.

---

#### Option B: Direct Polaroid Photo Gallery Uploads
- **To**: `your-dummy-account@gmail.com`
- **Subject**: `Sibulan District Conference [YOUR_GALLERY_PASSCODE]` *(e.g. `Sibulan District Conference 073000`)*
  - *Tip: Include category keywords in the subject like `Baptisms`, `Companions`, `Service`, `Transfers`, `Teaching`, or `P-Day` to automatically organize into albums!*
- **Body Format (Optional Caption / Story Note)**:
  ```text
  Wonderful district conference gathering with President and Sister across the Negros Oriental zone!
  ```
  *(Any text written in the email body automatically attaches as the Polaroid photo story caption across all uploaded photos).*
- **Attachments**: Any number of photos (1 to 50+ photos).
- **What Happens**:
  1. Photos are automatically compressed (if $> 350\text{ KB}$) and pinned to the **Polaroid Photo Wall** on `/gallery`.
  2. Elder Salviejo receives a **Polaroid Gallery Synced Receipt** with album statistics and live gallery link.
  3. The thread in the dummy account is labeled **`gallery-processed`**.

