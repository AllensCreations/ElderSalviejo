# Google Apps Script Setup Guide

This Google Apps Script bridges your Gmail inbox with the Vercel Ingest API. It runs on a scheduled time trigger (e.g., every 6 hours or daily), finds weekly reflection emails matching your query, parses the 7 daily reflections, encodes the 7 attached images as Base64 data URIs, and POSTs the structured payload to your Vercel `/api/ingest` endpoint.

---

## 1. Create the Script Project
1. Navigate to [script.google.com](https://script.google.com) and click **New Project**.
2. Rename the project to **Gmail Diary Pipeline**.
3. Replace the default `Code.gs` with the contents of [`Code.gs`](./Code.gs).
4. Go to **Project Settings** (gear icon) -> Check **"Show 'appsscript.json' manifest file in editor"**.
5. Switch to `appsscript.json` in the editor and paste the contents from [`appsscript.json`](./appsscript.json).

---

## 2. Configure Script Properties
In **Project Settings**, scroll down to **Script Properties** and add the following keys:

| Property | Example Value | Description |
| :--- | :--- | :--- |
| `VERCEL_INGEST_URL` | `https://your-diary-app.vercel.app/api/ingest` | URL of your deployed Vercel backend route |
| `INGEST_SECRET` | `super_secret_token_123` | Secret matching `INGEST_SECRET` in Vercel |
| `GMAIL_QUERY` | `subject:"Weekly Reflection" -label:diary-processed` | Gmail search filter for emails to process |
| `PROCESSED_LABEL` | `diary-processed` | Gmail label applied after successful ingest |

---

## 3. Email Formatting Guide

When sending your weekly email from the Gmail mobile or desktop app:
1. **Subject**: `Weekly Reflection: 2026-W36` (or any title)
2. **Body**: Use day markdown tags:
   ```text
   --- MONDAY ---
   Started the new workout routine and finished the first chapter of the book.

   --- TUESDAY ---
   Team lunch downtown and explored the botanical gardens.

   --- WEDNESDAY ---
   Midweek project milestone reached!

   --- THURSDAY ---
   Cooked homemade pasta with fresh basil.

   --- FRIDAY ---
   Celebrated the weekend with movie night.

   --- SATURDAY ---
   Hike up the mountain trails, clear skies.

   --- SUNDAY ---
   Meal prep and quiet evening reading.
   ```
3. **Attachments**: Attach exactly 7 photos (JPEG or PNG) corresponding to Monday through Sunday.

---

## 4. Test & Authorize
1. In the Apps Script editor, select function `processWeeklyDiaryEmails` and click **Run**.
2. Google will display an **Authorization Required** dialog. Grant access to Gmail and External URLs.
3. Review the execution log to confirm successful payload transmission.

---

## 5. Set Up Automated Trigger
1. Click the **Triggers** icon (clock on the left sidebar).
2. Click **+ Add Trigger** (bottom right):
   - **Function to run**: `processWeeklyDiaryEmails`
   - **Deployment**: `Head`
   - **Event source**: `Time-driven`
   - **Type**: `Hour timer` -> `Every 6 hours` (or `Day timer`)
3. Click **Save**.
