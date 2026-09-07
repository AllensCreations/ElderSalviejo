/**
 * Gmail Weekly Diary Exporter & Pipeline Engine
 * 
 * Extracts weekly reflections and daily photos from Gmail,
 * parses daily markdown tags (--- MONDAY ---, etc.),
 * converts attachments to Base64 data URIs,
 * and POSTs the structured payload to the Vercel /api/ingest backend.
 */

// Configuration: can also be customized via Script Properties (File > Project Properties > Script properties)
const CONFIG = {
  // The Vercel API Ingest URL, e.g. "https://your-project.vercel.app/api/ingest"
  VERCEL_INGEST_URL: PropertiesService.getScriptProperties().getProperty('VERCEL_INGEST_URL') || 'https://your-project.vercel.app/api/ingest',
  
  // Shared secret token to authenticate requests to /api/ingest
  INGEST_SECRET: PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || 'your-super-secret-token-change-me',
  
  // Gmail search query to locate new diary submissions
  // e.g., 'label:weekly-diary -label:diary-processed' or 'subject:"Weekly Reflection" -label:diary-processed'
  GMAIL_QUERY: PropertiesService.getScriptProperties().getProperty('GMAIL_QUERY') || 'subject:"Weekly Reflection" -label:diary-processed',
  
  // Label applied to thread once successfully ingested
  PROCESSED_LABEL: PropertiesService.getScriptProperties().getProperty('PROCESSED_LABEL') || 'diary-processed',
  
  // Supported day headers
  DAYS: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
};

/**
 * Main entry point: scheduled trigger or manual execution.
 */
function processWeeklyDiaryEmails() {
  Logger.log('Starting Gmail Weekly Diary Ingest job...');
  Logger.log('Query: ' + CONFIG.GMAIL_QUERY);
  
  const threads = GmailApp.search(CONFIG.GMAIL_QUERY, 0, 5);
  if (!threads || threads.length === 0) {
    Logger.log('No new diary emails found matching query.');
    return;
  }
  
  // Ensure the processed label exists
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
    const subject = message.getSubject();
    const date = message.getDate();
    const body = message.getPlainBody() || message.getBody();
    
    Logger.log(`Processing message: "${subject}" received at ${date.toISOString()}`);
    
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
      sender: message.getFrom(),
      entries: parsedDays,
      totalEntries: parsedDays.length,
      imageCount: encodedImages.length
    };
    
    // 5. Send POST request to Vercel API
    const success = sendPayloadToVercel(payload);
    if (success) {
      // Mark as processed in Gmail
      thread.addLabel(processedLabel);
      thread.markRead();
      Logger.log(`Successfully ingested and tagged thread: "${subject}"`);
    } else {
      Logger.log(`Failed to ingest thread: "${subject}". Will retry on next run.`);
    }
  }
}

/**
 * Parses email body text searching for day headers:
 * e.g., "--- MONDAY ---", "--- TUESDAY ---", etc.
 * Associates each day with its corresponding Base64 image.
 */
function parseDiaryEntries(bodyText, encodedImages) {
  const days = CONFIG.DAYS;
  const entries = [];
  
  // Regex pattern matching headers like:
  // --- MONDAY --- or ---MONDAY--- or ## MONDAY or [MONDAY]
  // Capture group 1: Day name
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
    // Fallback: If no explicit day tags were found, divide or provide the entire body
    Logger.log('No explicit day headers found. Using entire email as single entry.');
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
 * Transmits the JSON payload to Vercel API via UrlFetchApp
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
    Logger.log(`Posting JSON payload (${(JSON.stringify(payload).length / 1024).toFixed(1)} KB) to ${url}...`);
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

/**
 * Helper to generate URL slug
 */
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
