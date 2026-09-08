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
  setupPrivateProperties('YOUR_VERCEL_INGEST_SECRET', '159266');
  ```
4. Click **Run**. When finished, revert those values in the code so they stay blank in Git.

#### Method B: In Project Settings UI
1. Click **Project Settings** (gear icon on the left sidebar).
2. Scroll to **Script Properties** and click **Add script property** for each:

| Property | Value | Description |
| :--- | :--- | :--- |
| `VERCEL_INGEST_URL` | `https://eldersalviejo.vercel.app/api/ingest` | Production ingest endpoint |
| `INGEST_SECRET` | *(Your Vercel INGEST_SECRET token)* | Shared authorization secret |
| `SECRET_CODE` | `159266` *(or your chosen passcode)* | Passcode filter for email queries |
| `SITE_URL` | `https://eldersalviejo.vercel.app` | Base public website URL |
| `DISTRIBUTION_LIST` | `family@example.com` | Optional manual extra emails |
| `ALLOWED_SENDER` | *(Optional)* | Filter to only accept emails from your missionary address |

---

### 3. One-Click Instant Trigger Setup (Any P-Day, 24/7)
Because missionary P-Days can change between transfers or companionships (Monday, Tuesday, Friday, etc.), do **not** bind the script to Monday only:

1. In the Apps Script toolbar dropdown, select:
  ```text
  create5MinuteTrigger
  ```
  *(Or choose `create1MinuteTrigger` if you want near-instant ~60-second processing!)*
2. Click **Run**.
3. Google will present an authorization modal requesting permission to read/reply to Gmail and make external HTTPS requests. Click **Review permissions** > **Advanced** > **Go to Elder Salviejo Diary Processor (unsafe)** > **Allow**.
4. Check the execution log:
  ```text
  Instant trigger created! It will automatically check for new diary emails every 5 minute(s) 24/7 on any P-Day.
  ```
The dummy account will now monitor incoming diary submissions 24/7 and automatically publish within minutes of you hitting send!

---

### 4. Elder Salviejo's P-Day Email Format
From your missionary or personal Gmail on your P-Day:
1. **To**: `your-dummy-account@gmail.com`
2. **Subject**: `Weekly Reflection: Week 2 in Dumaguete 159266` *(includes your secret code)*
3. **Body Format**:
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
  ```
4. **Attachments**: 7 photos (.jpg or .png) corresponding to Monday through Sunday.
5. **Hit Send**: Within 1–5 minutes, your photos and reflections are backed up to GitHub, loaded onto jsDelivr, stored in Turso, and emailed to all your family and friends!
