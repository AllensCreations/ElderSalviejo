/**
 * Gmail Weekly Diary Exporter & Automated Monday Broadcast Engine
 * 
 * Flow:
 * 1. You send an email every Monday to your dedicated dummy receiver Gmail account
 *    with daily reflection headers (--- MONDAY ---, etc.) and 7 photo attachments.
 * 2. This script isolates the incoming reflection, encodes images to Base64 data URIs,
 *    and POSTs the structured payload to your Vercel API and Turso SQLite database.
 * 3. In the website (Index Vault), visitors and family members can insert their emails
 *    to subscribe to updates.
 * 4. Once successfully archived into the Vault, the script automatically sends out:
 *    - An announcement newsletter to all website subscribers (and any manual distribution list)
 *      with a direct link to the dynamic polaroid viewer!
 *    - A confirmation receipt back to your personal email with the published link.
 */

const CONFIG = {
  // Your live Vercel Production Ingest Endpoint
  VERCEL_INGEST_URL: PropertiesService.getScriptProperties().getProperty('VERCEL_INGEST_URL') || 'https://gmail-diary-vault.vercel.app/api/ingest',
  
  // Shared secret token to authenticate requests to /api/ingest
  INGEST_SECRET: PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || 'gdv_sec_7f9c2d81a4b53e89c0e211ab9',
  
  // Secret security passcode that MUST be included in the email Subject line
  // (e.g. "Weekly Reflection 159266: Week 2 in Sibulan").
  // This code is automatically stripped and hidden during processing so it never appears publicly!
  SECRET_CODE: PropertiesService.getScriptProperties().getProperty('SECRET_CODE') || '159266',

  // Gmail search query to locate new diary submissions in the dummy account
  // Finds any unprocessed email containing the secret passcode 159266
  GMAIL_QUERY: PropertiesService.getScriptProperties().getProperty('GMAIL_QUERY') || '159266 -label:diary-processed',
  
  // Label applied to thread once successfully ingested
  PROCESSED_LABEL: PropertiesService.getScriptProperties().getProperty('PROCESSED_LABEL') || 'diary-processed',
  
  // Optional security filter: only accept submissions sent from your personal email address
  // Leave empty ("") to allow any email address that provides the secret code 159266
  ALLOWED_SENDER: PropertiesService.getScriptProperties().getProperty('ALLOWED_SENDER') || '',
  
  // Optional manual distribution list (comma-separated). Note: All users who insert
  // their emails on the website are automatically notified in addition to this list!
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
    
    const message = messages[messages.length - 1];
    const sender = message.getFrom();
    const subject = message.getSubject();
    const date = message.getDate();
    const body = message.getPlainBody() || message.getBody();
    
    // Security check: verify subject contains secret passcode 159266
    if (CONFIG.SECRET_CODE && !subject.includes(CONFIG.SECRET_CODE)) {
      Logger.log(`Skipping thread "${subject}": Missing required secret passcode (${CONFIG.SECRET_CODE})`);
      continue;
    }

    // Optional security check: if ALLOWED_SENDER is configured, verify the sender
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
    
    // Generate a clean slug & title (completely stripping the secret code 159266 so it remains hidden)
    const weekTitle = cleanSubjectTitle(subject, CONFIG.SECRET_CODE) || `Week of ${Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')}`;
    const weekSlug = generateSlug(weekTitle, date);
    const cleanRawSubject = subject.replace(new RegExp(`[\\[\\(]?\\s*${CONFIG.SECRET_CODE}\\s*[\\]\\)]?`, 'gi'), '').trim();
    
    // 4. Construct payload
    const payload = {
      slug: weekSlug,
      title: weekTitle,
      publishedAt: date.toISOString(),
      rawSubject: cleanRawSubject,
      sender: sender,
      entries: parsedDays,
      totalEntries: parsedDays.length,
      imageCount: encodedImages.length
    };
    
    // 5. Send POST request to Vercel API and Turso SQLite
    const ingestResult = sendPayloadToVercel(payload);
    if (ingestResult) {
      // Mark as processed in Gmail dummy inbox
      thread.addLabel(processedLabel);
      thread.markRead();
      Logger.log(`Successfully ingested and tagged thread: "${subject}"`);
      
      const liveUrl = `${CONFIG.SITE_URL}/week/${weekSlug}`;
      const dbSubscribers = Array.isArray(ingestResult.subscribers) ? ingestResult.subscribers : [];
      
      // 6. Automated Outbound Delivery to website subscribers & manual distribution list
      dispatchWeeklyBroadcast(payload, liveUrl, sender, dbSubscribers);
    } else {
      Logger.log(`Failed to ingest thread: "${subject}". Will retry on next trigger.`);
    }
  }
}

/**
 * Dispatches the weekly announcement email to all website subscribers & distribution list
 * and sends a confirmation receipt back to your personal email address.
 */
function dispatchWeeklyBroadcast(payload, liveUrl, authorEmail, dbSubscribers) {
  const manualRecipients = (CONFIG.DISTRIBUTION_LIST || '').split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
    
  const dynamicSubscribers = (dbSubscribers || [])
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);

  // Combine and deduplicate
  const allRecipients = Array.from(new Set([...manualRecipients, ...dynamicSubscribers]));
  
  const firstEntrySnippet = (payload.entries.length > 0 && payload.entries[0].text)
    ? payload.entries[0].text.substring(0, 160) + '...'
    : 'A new week of daily routine photos and reflections is now live.';

  // 1. Send announcement to subscribers
  if (allRecipients.length > 0) {
    Logger.log(`Broadcasting weekly diary to ${allRecipients.length} subscriber(s): ${allRecipients.join(', ')}`);
    
    const subject = `📖 Elder Salviejo — Weekly Journal: ${payload.title} (Philippines Dumaguete Mission)`;
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #fcfbf9; border: 1px solid #e7e2d6; border-radius: 12px; overflow: hidden; color: #2d3748;">
        
        <!-- Header Banner -->
        <div style="background-color: #111827; color: #ffffff; padding: 26px 30px; text-align: center; border-bottom: 3px solid #d97706;">
          <p style="margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #fbbf24; font-weight: bold;">Philippines Dumaguete Mission</p>
          <h1 style="margin: 6px 0 0 0; font-size: 24px; font-family: Georgia, serif; font-weight: bold; line-height: 1.2; letter-spacing: 1px;">ELDER SALVIEJO</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #d1d5db; font-family: Georgia, serif; font-style: italic;">${escapeHtml(payload.title)}</p>
        </div>

        <!-- Body Content -->
        <div style="padding: 28px 30px;">
          <p style="font-size: 14px; line-height: 1.6; color: #4a5568; margin-top: 0;">
            Elder Salviejo has shared his weekly Preparation Day (P-Day) letter from the <strong>Philippines Dumaguete Mission</strong>, with <strong>${payload.imageCount} daily routine photos</strong> and missionary reflections from Monday through Sunday.
          </p>

          <!-- Polaroid Teaser Box -->
          <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 18px; margin: 22px 0;">
            <p style="margin: 0; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #92400e; letter-spacing: 1px;">Missionary Highlight</p>
            <p style="margin: 6px 0 0 0; font-size: 13px; font-style: italic; color: #78350f; line-height: 1.5;">
              "${escapeHtml(firstEntrySnippet)}"
            </p>
          </div>

          <!-- Call to Action Button -->
          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="${liveUrl}" target="_blank" style="background-color: #d97706; color: #ffffff; text-decoration: none; padding: 13px 26px; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 3px 6px rgba(0,0,0,0.12);">
              Open Elder Salviejo's Journal Viewer &rarr;
            </a>
          </div>

          <p style="text-align: center; margin-top: 18px; font-size: 12px; color: #718096;">
            Direct Link: <a href="${liveUrl}" style="color: #d97706; word-break: break-all;">${liveUrl}</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #e2e8f0; background-color: #f7fafc; padding: 14px 20px; text-align: center; font-size: 11px; color: #a0aec0;">
          You received this because you subscribed to Elder Salviejo's missionary letters at ${CONFIG.SITE_URL}
        </div>
      </div>
    `;

    for (let r = 0; r < allRecipients.length; r++) {
      try {
        GmailApp.sendEmail(allRecipients[r], subject, `New Weekly Journal: ${payload.title}\n\nView Elder Salviejo's journal here: ${liveUrl}`, {
          htmlBody: htmlBody,
          name: 'Elder Salviejo (Dumaguete Mission)'
        });
      } catch (err) {
        Logger.log(`Error sending broadcast to ${allRecipients[r]}: ${err.toString()}`);
      }
    }
  } else {
    Logger.log('No website subscribers or manual recipients found yet.');
  }

  // 2. Send confirmation receipt back to your personal email
  const authorClean = extractEmailAddress(authorEmail);
  if (authorClean) {
    Logger.log(`Sending delivery confirmation to author: ${authorClean}`);
    const receiptSubject = `✅ Published: Elder Salviejo's Weekly Journal — ${payload.title}`;
    const receiptBody = `Elder Salviejo,\n\nYour weekly missionary reflection email and daily routine photos have been successfully archived into the permanent Turso SQLite vault!\n\n` +
      `Title: ${payload.title}\n` +
      `Entries: ${payload.totalEntries} daily entries\n` +
      `Photos: ${payload.imageCount} Base64 photos\n` +
      `Live View URL: ${liveUrl}\n` +
      `Total Subscribers Notified: ${allRecipients.length}\n` +
      (allRecipients.length > 0 ? `Recipients: ${allRecipients.join(', ')}\n\n` : `(No subscribers have inserted their emails yet)\n\n`) +
      `View it live now:\n${liveUrl}`;
    
    try {
      GmailApp.sendEmail(authorClean, receiptSubject, receiptBody, {
        name: 'Elder Salviejo Journal Vault'
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
      let parsed = null;
      try { parsed = JSON.parse(responseText); } catch (_) {}
      return parsed || { success: true };
    } else {
      Logger.log(`Ingest failed: HTTP ${responseCode} - ${responseText}`);
      return null;
    }
  } catch (err) {
    Logger.log(`Exception during UrlFetchApp: ${err.toString()}`);
    return null;
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

/**
 * Strips the secret security passcode (e.g. 159266) from the subject line
 * and cleans extraneous prefixes/punctuation so the passcode remains completely hidden!
 */
function cleanSubjectTitle(rawSubject, secretCode) {
  let clean = rawSubject || '';
  if (secretCode) {
    const escaped = secretCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('[\\[\\(]?\\s*' + escaped + '\\s*[\\]\\)]?', 'gi');
    clean = clean.replace(regex, '');
  }
  clean = clean.replace(/^(weekly\s*reflection|weekly\s*journal|reflection|journal)[\s:—-]*/i, '')
               .replace(/^[-—:\s]+|[-—:\s]+$/g, '')
               .trim();
  return clean || 'Weekly Missionary Journal';
}

