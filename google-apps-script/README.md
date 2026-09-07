# 📬 Google Apps Script: Dedicated Dummy Receiver & Monday Broadcast Guide

This script runs inside your **dedicated dummy Gmail account** (the receiver for your texts and images). Every Monday, it automatically:
1. Detects your reflection email and extracts the text and 7 daily routine photos.
2. Converts photos into inline Base64 data URIs.
3. Ingests the data into your live **Vercel API** and **Turso SQLite database**.
4. **Sends it out**: Automatically emails an announcement newsletter to your **family/friends distribution list** with a direct link to the dynamic polaroid viewer.
5. Sends a confirmation receipt back to your personal email address!

---

## 🛠️ Setup Walkthrough in the Dummy Account

### 1. Create the Script Project
1. Log into your **dummy Gmail account**.
2. Navigate to [script.google.com](https://script.google.com) and click **+ New project**.
3. Rename the project to **Monday Diary Pipeline**.
4. Replace `Code.gs` with [`google-apps-script/Code.gs`](./Code.gs).
5. Open **Project Settings** (gear icon) > Check **"Show 'appsscript.json' manifest file in editor"**.
6. Replace `appsscript.json` with [`google-apps-script/appsscript.json`](./appsscript.json).

---

### 2. Configure Script Properties
Under **Project Settings** > **Script Properties**, add:

| Property | Value | Description |
| :--- | :--- | :--- |
| `VERCEL_INGEST_URL` | `https://gmail-diary-vault.vercel.app/api/ingest` | Live Vercel ingest endpoint |
| `INGEST_SECRET` | `gdv_sec_7f9c2d81a4b53e89c0e211ab9` | Secure authorization token |
| `DISTRIBUTION_LIST` | `family@example.com, friend@example.com` | Comma-separated list of emails who receive the weekly diary newsletter |
| `ALLOWED_SENDER` | `your-personal-email@gmail.com` | Your real personal email (rejects any third-party spam to dummy inbox) |
| `GMAIL_QUERY` | `subject:"Weekly Reflection" -label:diary-processed` | Gmail filter in the dummy inbox |
| `PROCESSED_LABEL` | `diary-processed` | Label applied after successful ingest & send |

---

### 3. One-Click Monday Trigger Setup
1. In the Apps Script toolbar dropdown, select the function:
   ```text
   createMondayTrigger
   ```
2. Click **Run**.
3. Google will ask you to authorize permissions for Gmail and network requests. Grant access.
4. The function will automatically install a time-driven trigger that runs **every Monday at 9:00 AM**.

---

### 4. Your Monday Routine
From your personal Gmail app every Monday:
1. **To**: `your-dummy-account@gmail.com`
2. **Subject**: `Weekly Reflection: Week 36` (or any title)
3. **Body**:
   ```text
   --- MONDAY ---
   Morning trail run through the ridge, followed by coffee and reviewing quarterly goals.

   --- TUESDAY ---
   Deep work on systems architecture at the downtown public library. Cardamom buns after.

   --- WEDNESDAY ---
   Mid-week milestone reached. Team ramen dinner!

   --- THURSDAY ---
   Harvested cherry tomatoes and made fresh basil pesto.

   --- FRIDAY ---
   Backyard movie night under string lights with apple cider.

   --- SATURDAY ---
   Scenic drive up to the lake overlook. Beautiful autumn foliage.

   --- SUNDAY ---
   Baked sourdough loaves and preparing for next week!
   ```
4. **Attachments**: 7 photos (.jpg or .png) in order (Monday through Sunday).
5. **Hit Send**: The dummy account script will process the email, store everything in Turso, and dispatch the newsletter announcement to your distribution list!
