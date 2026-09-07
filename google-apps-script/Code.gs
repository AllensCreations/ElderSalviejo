/**
 * Gmail Weekly Diary Exporter & Automated Monday Broadcast Engine
 * 
 * Flow:
 * 1. You send an email every Monday to your dedicated dummy receiver Gmail account
 *    with daily reflection headers (--- MONDAY ---, etc.) and 7 photo attachments.
 * 2. This script isolates the incoming reflection, encodes images to Base64 data URIs,
 *    and POSTs the structured payload to your Vercel API and Turso SQLite database.
 * 3. Once successfully archived into the Vault, the script automatically sends out:
 *    - An announcement newsletter to your distribution list (family/friends) with a link to the live polaroid viewer.
 *    - A confirmation receipt back to your personal email with the published link.
 */

const CONFIG = {
  // Your live Vercel Production Ingest Endpoint
  VERCEL_INGEST_URL: PropertiesService.getScriptProperties().getProperty('VERCEL_INGEST_URL') || 'https://gmail-diary-vault.vercel.app/api/ingest',
  
  // Shared secret token to authenticate requests to /api/ingest
  INGEST_SECRET: PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || 'gdv_sec_7f9c2d81a4b53e89c0e211ab9',
  
  // Gmail search query to locate new diary submissions in the dummy account
  GMAIL_QUERY: PropertiesService.getScriptProperties().getProperty('GMAIL_QUERY') || 'subject:"Weekly Reflection" -label:diary-processed',
  
  // Label applied to thread once successfully ingested
  PROCESSED_LABEL: PropertiesService.getScriptProperties().getProperty('PROCESSED_LABEL') || 'diary-processed',
  
  // Optional security filter: only accept submissions sent from your personal email address
  // Leave empty ("") to accept from any sender
  ALLOWED_SENDER: PropertiesService.getScriptProperties().getProperty('ALLOWED_SENDER') || '',
  
  // Distribution list: comma-separated list of family/friends emails to receive the Monday diary announcement
  // Example: "family@example.com, friend@example.com"
  DISTRIBUTION_LIST: PropertiesService.getScriptProperties().getProperty('DISTRIBUTION_LIST') || '',
  
  // Base public website URL for the live diary viewer
  SITE_URL: PropertiesService.getScriptProperties().getProperty('SITE_URL') || 'https://gmail-diary-vault.vercel.app',
  
  // Supported day headers
  DAYS: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
};

/**
 * Main entry point: executed via Monday time-driven trigger or manual run.
 */
function processWeeklyDiaryEmails() {
  Logger.log('Starting Monday Diary Ingest & Dispatch job...');
  Logger.log('Query: ' + CONFIG.GMAIL_QUERY);
  
  const threads = GmailApp.search(CONFIG.GMAIL_QUERY, 0, 5);
  if (!threads || threads.length === 0) {
    Logger.log('No new unprocessed weekly diary emails found.');
    return;
  }
  
  // Ensure the processed label exists in this dummy account
  let processedLabel = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL);
  if (!processedLabel) {
    processedLabel = GmailApp.createLabel(CONFIG.PROCESSED_LABEL);
  }
  
  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const messages = thread.getMessages();
    if (messages.length === 0) continue;
    
    // Process the most recent message in the thread
    const message = messages[messages.length - 1];
    const sender = message.getFrom();
    const subject = message.getSubject();
    const date = message.getDate();
    const body = message.getPlainBody() || message.getBody();
    
    // Security check: if ALLOWED_SENDER is configured, verify the sender
    if (CONFIG.ALLOWED_SENDER && !sender.toLowerCase().includes(CONFIG.ALLOWED_SENDER.toLowerCase())) {
      Logger.log(`Skipping message from unauthorized sender: ${sender}`);
      continue;
    }
    
    Logger.log(`Processing weekly reflection from ${sender}: "${subject}" received at ${date.toISOString()}`);
    
    // 1. Extract image attachments
    const rawAttachments = message.getAttachments();
    const imageAttachments = rawAttachments.filter(att => {
      const contentType = att.getContentType().toLowerCase();
      return contentType.startsWith('image/') || 
             att.getName().match(/\.(jpe?g|png|webp|heic)$/i);
    });
    
    Logger.log(`Found ${imageAttachments.length} image attachment(s).`);
    
    // 2. Base64 encode images into data URIs
    const encodedImages = imageAttachments.map((att, idx) => {
      const contentType = att.getContentType() || 'image/jpeg';
      const base64Data = Utilities.base64Encode(att.getBytes());
      return {
        filename: att.getName() || `day_${idx + 1}.jpg`,
        mimeType: contentType,
        dataUri: `data:${contentType};base64,${base64Data}`
      };
    });
    
    // 3. Parse daily markdown blocks
    const parsedDays = parseDiaryEntries(body, encodedImages);
    
    // Generate a clean slug / week title
    const weekTitle = subject.replace(/^[\[\(].*?[\]\)]\s*/, '').trim() || `Week of ${Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')}`;
    const weekSlug = generateSlug(weekTitle, date);
    
    // 4. Construct payload
    const payload = {
      slug: weekSlug,
      title: weekTitle,
      publishedAt: date.toISOString(),
      rawSubject: subject,
      sender: sender,
      entries: parsedDays,
      totalEntries: parsedDays.length,
      imageCount: encodedImages.length
    };
    
    // 5. Send POST request to Vercel API and Turso SQLite
    const success = sendPayloadToVercel(payload);
    if (success) {
      // Mark as processed in Gmail dummy inbox
      thread.addLabel(processedLabel);
      thread.markRead();
      Logger.log(`Successfully ingested and tagged thread: "${subject}"`);
      
      const liveUrl = `${CONFIG.SITE_URL}/week/${weekSlug}`;
      
      // 6. Automated Outbound Delivery: "and also sends it"
      dispatchWeeklyBroadcast(payload, liveUrl, sender);
    } else {
      Logger.log(`Failed to ingest thread: "${subject}". Will retry on next trigger.`);
    }
  }
}

/**
 * Dispatches the weekly announcement email to your family/friends distribution list
 * and sends a confirmation receipt back to your personal email address.
 */
function dispatchWeeklyBroadcast(payload, liveUrl, authorEmail) {
  const recipients = CONFIG.DISTRIBUTION_LIST.split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0);
  
  const firstEntrySnippet = (payload.entries.length > 0 && payload.entries[0].text)
    ? payload.entries[0].text.substring(0, 160) + '...'
    : 'A new week of daily routine photos and reflections is now live.';

  // 1. Send announcement to family/friends distribution list
  if (recipients.length > 0) {
    Logger.log(`Broadcasting weekly diary to ${recipients.length} recipient(s): ${recipients.join(', ')}`);
    
    const subject = `📖 New Weekly Diary: ${payload.title}`;
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #fcfbf9; border: 1px solid #e7e2d6; border-radius: 12px; overflow: hidden; color: #2d3748;">
        
        <!-- Header Banner -->
        <div style="background-color: #1a202c; color: #ffffff; padding: 24px 30px; text-align: center;">
          <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d69e2e; font-weight: bold;">Weekly Reflection Published</p>
          <h1 style="margin: 8px 0 0 0; font-size: 22px; font-family: Georgia, serif; font-weight: bold; line-height: 1.3;">${escapeHtml(payload.title)}</h1>
        </div>

        <!-- Body Content -->
        <div style="padding: 28px 30px;">
          <p style="font-size: 14px; line-height: 1.6; color: #4a5568; margin-top: 0;">
            A new weekly journal entry has been archived into the vault with <strong>${payload.imageCount} daily photos</strong> and personal routine reflections from Monday through Sunday.
          </p>

          <!-- Polaroid Teaser Box -->
          <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 18px; margin: 22px 0;">
            <p style="margin: 0; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #92400e; letter-spacing: 1px;">Monday Highlight</p>
            <p style="margin: 6px 0 0 0; font-size: 13px; font-style: italic; color: #78350f; line-height: 1.5;">
              "${escapeHtml(firstEntrySnippet)}"
            </p>
          </div>

          <!-- Call to Action Button -->
          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="${liveUrl}" target="_blank" style="background-color: #d97706; color: #ffffff; text-decoration: none; padding: 13px 26px; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 3px 6px rgba(0,0,0,0.12);">
              Open Polaroid Diary Viewer &rarr;
            </a>
          </div>

          <p style="text-align: center; margin-top: 18px; font-size: 12px; color: #718096;">
            Direct Link: <a href="${liveUrl}" style="color: #d97706; word-break: break-all;">${liveUrl}</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #e2e8f0; background-color: #f7fafc; padding: 14px 20px; text-align: center; font-size: 11px; color: #a0aec0;">
          Delivered automatically via the Monday Gmail Diary Pipeline
        </div>
      </div>
    `;

    for (let r = 0; r < recipients.length; r++) {
      try {
        GmailApp.sendEmail(recipients[r], subject, `New Weekly Diary: ${payload.title}\n\nView it here: ${liveUrl}`, {
          htmlBody: htmlBody,
          name: 'Weekly Diary Vault'
        });
      } catch (err) {
        Logger.log(`Error sending broadcast to ${recipients[r]}: ${err.toString()}`);
      }
    }
  } else {
    Logger.log('DISTRIBUTION_LIST is empty. Skipping broadcast email.');
  }

  // 2. Send confirmation receipt back to your personal email
  const authorClean = extractEmailAddress(authorEmail);
  if (authorClean) {
    Logger.log(`Sending delivery confirmation to author: ${authorClean}`);
    const receiptSubject = `✅ Weekly Diary Published: ${payload.title}`;
    const receiptBody = `
      Hi,\n\nYour weekly reflection email has been successfully ingested and published into the permanent Turso SQLite vault!\n\n
      Title: ${payload.title}\n
      Entries: ${payload.totalEntries} daily entries\n
      Photos: ${payload.imageCount} Base64 photos\n
      Live View URL: ${liveUrl}\n
      Broadcast Sent To: ${recipients.length > 0 ? recipients.join(', ') : 'None (DISTRIBUTION_LIST not configured)'}\n\n
      View it live now:\n${liveUrl}
    `;
    
    try {
      GmailApp.sendEmail(authorClean, receiptSubject, receiptBody, {
        name: 'Diary Pipeline Bot'
      });
    } catch (err) {
      Logger.log(`Error sending receipt to author: ${err.toString()}`);
    }
  }
}

/**
 * Helper to install a recurring Monday trigger with 1 click!
 * Run this function once from the Apps Script editor toolbar.
 */
function createMondayTrigger() {
  // Clear any old triggers for this function to prevent duplicates
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processWeeklyDiaryEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // Creates a trigger that runs every Monday between 9:00 AM and 10:00 AM
  ScriptApp.newTrigger('processWeeklyDiaryEmails')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();
    
  Logger.log('🎉 Monday trigger successfully created! It will automatically run every Monday at 9:00 AM.');
}

/**
 * Parses email body text searching for day headers:
 * e.g., "--- MONDAY ---", "--- TUESDAY ---", etc.
 */
function parseDiaryEntries(bodyText, encodedImages) {
  const entries = [];
  const headerRegex = /(?:^|\n)\s*(?:---|###|#)?\s*(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s*(?:---|:)?\s*(?:\n|$)/gi;
  
  const matches = [];
  let match;
  while ((match = headerRegex.exec(bodyText)) !== null) {
    matches.push({
      dayName: match[1].toUpperCase(),
      startIndex: match.index,
      headerLength: match[0].length
    });
  }
  
  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const contentStart = current.startIndex + current.headerLength;
      const contentEnd = (i + 1 < matches.length) ? matches[i + 1].startIndex : bodyText.length;
      
      const dayText = bodyText.substring(contentStart, contentEnd).trim();
      const imageObj = encodedImages[i] ? encodedImages[i].dataUri : null;
      
      entries.push({
        day: capitalize(current.dayName),
        text: dayText,
        image: imageObj,
        imageFilename: encodedImages[i] ? encodedImages[i].filename : null
      });
    }
  } else {
    entries.push({
      day: 'Weekly Note',
      text: bodyText.trim(),
      image: encodedImages.length > 0 ? encodedImages[0].dataUri : null,
      imageFilename: encodedImages.length > 0 ? encodedImages[0].filename : null
    });
  }
  
  return entries;
}

/**
 * Transmits the JSON payload to Vercel API
 */
function sendPayloadToVercel(payload) {
  const url = CONFIG.VERCEL_INGEST_URL;
  const secret = CONFIG.INGEST_SECRET;
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + secret,
      'User-Agent': 'Google-Apps-Script-GmailDiary/1.0'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    Logger.log(`Posting JSON payload to ${url}...`);
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode >= 200 && responseCode < 300) {
      Logger.log(`Ingest succeeded: HTTP ${responseCode} - ${responseText}`);
      return true;
    } else {
      Logger.log(`Ingest failed: HTTP ${responseCode} - ${responseText}`);
      return false;
    }
  } catch (err) {
    Logger.log(`Exception during UrlFetchApp: ${err.toString()}`);
    return false;
  }
}

function generateSlug(title, date) {
  const dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const cleanTitle = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${dateStr}-${cleanTitle}`.substring(0, 64);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function extractEmailAddress(rawSender) {
  if (!rawSender) return null;
  const match = rawSender.match(/<([^>]+)>/);
  if (match) return match[1];
  return rawSender.trim();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
