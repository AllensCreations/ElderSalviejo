# 🌴 Elder Salviejo: Dedicated Dummy Receiver & Monday Broadcast Guide
> **Philippines Dumaguete Mission**

This script runs inside your **dedicated dummy Gmail account** (the receiver for Elder Salviejo's texts and photos). Every Monday (P-Day), it automatically:
1. Detects your weekly reflection email and extracts the text and 7 daily routine photos.
2. Converts photos into inline Base64 data URIs.
3. Ingests the data into your live **Vercel API** and **Turso SQLite database**.
4. **Sends it out**: Automatically emails an HTML newsletter announcement to all **website subscribers** (and any manual distribution list) with a direct button to the dynamic Polaroid viewer.
5. Sends a confirmation receipt back to your personal email address!

---

## 🛠️ Setup Walkthrough in the Dummy Account

### 1. Create the Script Project
1. Log into your **dummy Gmail account**.
2. Navigate to [script.google.com](https://script.google.com) and click **+ New project**.
3. Rename the project to **Elder Salviejo Diary Processor**.
4. Replace `Code.gs` with [`google-apps-script/Code.gs`](./Code.gs).
5. Open **Project Settings** (gear icon) > Check **"Show 'appsscript.json' manifest file in editor"**.
6. Replace `appsscript.json` with [`google-apps-script/appsscript.json`](./appsscript.json).

---

### 2. Configure Script Properties (Recommended for Security)
Under **Project Settings** (gear icon) > **Script Properties**, add your private environment variables so they are never exposed in public repositories:

| Property | Value | Description |
| :--- | :--- | :--- |
| `VERCEL_INGEST_URL` | `https://eldersalviejo.vercel.app/api/ingest` | Live production ingest endpoint |
| `INGEST_SECRET` | *(Your Vercel INGEST_SECRET token)* | Secure authorization token matching Vercel |
| `SECRET_CODE` | `159266` *(or your choice)* | Optional secret code filter |
| `SITE_URL` | `https://eldersalviejo.vercel.app` | Base public website URL |
| `DISTRIBUTION_LIST` | `family@example.com` | Optional manual extra emails (website subscribers are notified automatically!) |
| `ALLOWED_SENDER` | *(Optional)* | Optional filter to only accept emails from your address |

---

### 3. One-Click Monday Trigger Setup
1. In the Apps Script toolbar dropdown, select the function:
   ```text
   createMondayTrigger
   ```
2. Click **Run**.
3. Google will ask you to authorize permissions for Gmail and network requests. Grant access.
4. The function will automatically install a time-driven trigger that runs **every Monday at 9:00 AM (Asia/Manila time)**.

---

### 4. Elder Salviejo's Monday P-Day Routine
From your personal/missionary Gmail app every Monday:
1. **To**: `your-dummy-account@gmail.com`
2. **Subject**: `Weekly Reflection: Week 2 in Dumaguete` (or any title)
3. **Body**:
   ```text
   --- MONDAY ---
   Preparation day! Did laundry, emailed family, and played basketball with the elders.

   --- TUESDAY ---
   Morning study in Alma 26. Walked through Sibulan and met investigators.

   --- WEDNESDAY ---
   Taught the Plan of Salvation to Brother Bautista and shared buko juice.

   --- THURSDAY ---
   District Council meeting in Dumaguete City. Practiced Cebuano roleplays.

   --- FRIDAY ---
   Service project helping Nanay Elena repair her bamboo fence.

   --- SATURDAY ---
   Street contacting on Rizal Boulevard during sunset overlooking the sea.

   --- SUNDAY ---
   Sacrament meeting in Dumaguete 1st Ward. Bore testimony of the Savior.
   ```
4. **Attachments**: 7 photos (.jpg or .png) in order (Monday through Sunday).
5. **Hit Send**: The dummy account script will process the email, archive everything in Turso, and dispatch the newsletter announcement to all subscribers!
