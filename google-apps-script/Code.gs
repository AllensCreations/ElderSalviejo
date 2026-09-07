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
  VERCEL_INGEST_URL: PropertiesService.getScriptProperties().getProperty('VERCEL_INGEST_URL') || 'https://eldersalviejo.vercel.app/api/ingest',
  
  // Shared secret token to authenticate requests to /api/ingest
  INGEST_SECRET: PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || 'gdv_sec_7f9c2d81a4b53e89c0e211ab9',
  
  // Secret security passcode that can be included in the email Subject or Body (159266)
  // This code is automatically stripped and hidden during processing so it never appears publicly!
  SECRET_CODE: '159266',

  // Gmail search query to locate new diary submissions in the dummy account:
  // Automatically searches for 159266, Weekly Reflection, or Weekly Journal
  GMAIL_QUERY: '(159266 OR subject:"Weekly Reflection" OR subject:"Weekly Journal" OR subject:Reflection) -label:diary-processed',
  
  // Label applied to thread once successfully ingested
  PROCESSED_LABEL: PropertiesService.getScriptProperties().getProperty('PROCESSED_LABEL') || 'diary-processed',
  
  // Optional security filter: only accept submissions sent from your personal email address
  // Leave empty ("") to allow any email address
  ALLOWED_SENDER: PropertiesService.getScriptProperties().getProperty('ALLOWED_SENDER') || '',
  
  // Optional manual distribution list (comma-separated). Note: All users who insert
  // their emails on the website are automatically notified in addition to this list!
  DISTRIBUTION_LIST: PropertiesService.getScriptProperties().getProperty('DISTRIBUTION_LIST') || '',
  
  // Base public website URL for the live diary viewer
  SITE_URL: PropertiesService.getScriptProperties().getProperty('SITE_URL') || 'https://eldersalviejo.vercel.app',
  
  // Supported day headers
  DAYS: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
};

/**
 * Diagnostic tool: Run this from the Apps Script toolbar to see the exact
 * subjects, senders, and labels of the last 5 emails in this dummy account!
 */
function debugCheckInbox() {
  Logger.log('=== Checking Last 5 Emails in Inbox ===');
  const threads = GmailApp.getInboxThreads(0, 5);
  if (!threads || threads.length === 0) {
    Logger.log('Inbox has NO emails right now! Make sure the test email was sent to this dummy account.');
    return;
  }
  for (let i = 0; i < threads.length; i++) {
    const msg = threads[i].getMessages()[0];
    const labels = threads[i].getLabels().map(l => l.getName()).join(', ') || 'none';
    Logger.log(`Email #${i + 1}: Subject="${msg.getSubject()}" | From="${msg.getFrom()}" | Labels=[${labels}]`);
  }
  Logger.log('=======================================');
}

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
    
    // Security check: verify subject or body contains passcode OR subject contains reflection/journal
    const hasCode = (subject && subject.includes(CONFIG.SECRET_CODE)) || (body && body.includes(CONFIG.SECRET_CODE));
    const isReflection = subject.toLowerCase().includes('reflection') || subject.toLowerCase().includes('journal');
    if (!hasCode && !isReflection) {
      Logger.log(`Skipping thread "${subject}": Missing required secret passcode (${CONFIG.SECRET_CODE}) or Reflection/Journal subject.`);
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
    
    Logger.log(`Found ${imageAttachments.length} image attachment(s). Compressing...`);
    
    // 2. Auto-compress and resize images into lightweight Base64 data URIs (max 800px width)
    const encodedImages = imageAttachments.map((att, idx) => {
      const compressed = compressAndResizeAttachment(att, 800);
      return {
        filename: att.getName() || `day_${idx + 1}.jpg`,
        mimeType: compressed.mimeType,
        dataUri: compressed.dataUri
      };
    });
    
    // 3. Parse daily markdown blocks & weekly scripture verse
    const parsedData = parseDiaryContent(body, encodedImages);
    
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
      entries: parsedData.entries,
      totalEntries: parsedData.entries.length,
      imageCount: encodedImages.length,
      verse: parsedData.verse
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

          ${(payload.verse && payload.verse.text) ? `
          <!-- Weekly Scripture Verse -->
          <div style="background-color: #fffbeb; border-left: 4px solid #d97706; border-radius: 6px; padding: 16px; margin: 20px 0; border: 1px solid #fef3c7;">
            <p style="margin: 0; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #92400e; letter-spacing: 1px;">Weekly Scripture • ${escapeHtml(payload.verse.reference || 'Missionary Scripture')}</p>
            <p style="margin: 6px 0 0 0; font-size: 13px; font-style: italic; color: #78350f; line-height: 1.5;">
              "${escapeHtml(payload.verse.text)}"
            </p>
          </div>
          ` : ''}

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
    Logger.log('ℹ️ Letter is successfully published and live on the website! (No email subscribers have signed up on the site yet to receive newsletter copies).');
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

/**
 * Main parser that:
 * 1. Extracts weekly scripture verse from `-VERSE- (Matthew:11:11)(VERSEHERE)`
 * 2. Parses daily sections supporting `-MONDAY-`, `- MONDAY -`, `--- MONDAY ---`, etc.
 * 3. Cleans day titles to pure MONDAY and cleans reflection body text
 */
function parseDiaryContent(bodyText, encodedImages) {
  let cleanBody = bodyText || '';
  let extractedVerse = null;

  // 1. Extract weekly scripture verse: matches -VERSE-, - VERSE -, --- VERSE ---, etc.
  const verseRegex = /(?:^|\n)\s*[-—#*~]*\s*VERSE\s*[-—#*~:]*\s*([\s\S]*)$/i;
  const verseMatch = cleanBody.match(verseRegex);
  if (verseMatch) {
    const rawVerseText = verseMatch[1].trim();
    extractedVerse = parseVerseString(rawVerseText);
    // Strip verse block from body so it doesn't bleed into Sunday's daily reflection!
    cleanBody = cleanBody.substring(0, verseMatch.index).trim();
  }

  // 2. Parse daily sections: matches -MONDAY-, - MONDAY -, --- MONDAY ---, MONDAY:, etc.
  const entries = [];
  const headerRegex = /(?:^|\n)\s*[-—#*~]*\s*(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s*[-—#*~:]*\s*(?:\n|$)/gi;

  const matches = [];
  let match;
  while ((match = headerRegex.exec(cleanBody)) !== null) {
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
      const contentEnd = (i + 1 < matches.length) ? matches[i + 1].startIndex : cleanBody.length;
      
      let dayText = cleanBody.substring(contentStart, contentEnd).trim();
      // Clean any accidental leading dashes, day headers, or colons
      dayText = dayText.replace(/^\s*[-—#*~]*\s*(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s*[-—#*~:]*\s*/i, '');
      dayText = dayText.replace(/^[-—:\s]+/, '').trim();

      const imageObj = encodedImages[i] ? encodedImages[i].dataUri : null;
      
      entries.push({
        day: current.dayName, // Pure clean "MONDAY", "TUESDAY", etc.
        text: dayText,
        image: imageObj,
        imageFilename: encodedImages[i] ? encodedImages[i].filename : null
      });
    }
  } else {
    entries.push({
      day: 'MONDAY',
      text: cleanBody.trim(),
      image: encodedImages.length > 0 ? encodedImages[0].dataUri : null,
      imageFilename: encodedImages.length > 0 ? encodedImages[0].filename : null
    });
  }

  return {
    entries: entries,
    verse: extractedVerse
  };
}

/**
 * Backward compatibility wrapper
 */
function parseDiaryEntries(bodyText, encodedImages) {
  return parseDiaryContent(bodyText, encodedImages).entries;
}

/**
 * Parses scripture verse format and automatically looks up scripture text
 * from https://github.com/bcbooks/scriptures-json
 * 
 * Supports:
 *   - -VERSE- (Matthew 11:28-29)
 *   - -VERSE- (VERSE Matthew 11:28-29)
 *   - -VERSE- (Alma 37:37)
 *   - -VERSE- (D&C 68:6) or (Doctrine and Covenants 68:6)
 *   - -VERSE- (1 Nephi 3:7)
 *   - -VERSE- (Matthew:11:11)(VERSEHERE)
 */
function parseVerseString(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Pattern 1: Two parentheses (Reference)(Text) e.g. (Matthew:11:11)(VERSEHERE)
  const twoParens = trimmed.match(/^\s*\(([^)]+)\)\s*\(([\s\S]+)\)\s*$/);
  if (twoParens) {
    return {
      reference: twoParens[1].trim(),
      text: twoParens[2].trim()
    };
  }

  // Pattern 2: Single reference in parens: e.g. (Matthew 11:28-29), (VERSE Matthew 11:28-29), (Alma 37:37)
  const singleParenMatch = trimmed.match(/^\s*\(([^)]+)\)\s*$/);
  if (singleParenMatch) {
    const ref = singleParenMatch[1].replace(/^VERSE\s*/i, '').trim();
    const fetched = fetchScriptureTextGas(ref);
    return {
      reference: ref,
      text: fetched || ''
    };
  }

  // Pattern 3: (Reference) Text e.g. (Matthew:11:11) VERSEHERE
  const parenRefThenText = trimmed.match(/^\s*\(([^)]+)\)\s*([\s\S]+)$/);
  if (parenRefThenText) {
    const ref = parenRefThenText[1].replace(/^VERSE\s*/i, '').trim();
    const txt = parenRefThenText[2].trim().replace(/^\(|\)$/g, '');
    return {
      reference: ref,
      text: txt || fetchScriptureTextGas(ref) || ''
    };
  }

  // Pattern 4: Reference without parens: e.g. Matthew 11:28-29 or Alma 37:37
  const refClean = trimmed.replace(/^VERSE\s*/i, '').replace(/^\(|\)$/g, '').trim();
  const fetched = fetchScriptureTextGas(refClean);
  return {
    reference: refClean || 'Missionary Scripture',
    text: fetched || ''
  };
}

/**
 * Automatically fetches the scripture text from bcbooks/scriptures-json via jsdelivr CDN
 */
function fetchScriptureTextGas(refStr) {
  if (!refStr) return '';
  let clean = refStr.replace(/^[-—#*~:\s]+|[-—#*~:\s]+$/g, '').replace(/^\(|\)$/g, '').trim();
  clean = clean.replace(/^VERSE\s*/i, '').trim();

  // Pattern: Book Chapter:StartVerse(-EndVerse)?
  const regex = /^([1-4]?\s*[A-Za-z—\s&]+?)\s*[:\s]\s*(\d+)\s*[:]\s*(\d+)(?:\s*[-–—]\s*(\d+))?$/i;
  const match = clean.match(regex);
  if (!match) return '';

  const bookRaw = match[1].trim();
  const chapter = match[2];
  const startVerse = parseInt(match[3], 10);
  const endVerse = match[4] ? parseInt(match[4], 10) : startVerse;

  const normalized = bookRaw.toLowerCase().replace(/\s+/g, ' ');
  let volFile = 'new-testament-reference.json';
  let isDc = false;

  const bomBooks = ['1 nephi', '2 nephi', 'jacob', 'enos', 'jarom', 'omni', 'words of mormon', 'mosiah', 'alma', 'helaman', '3 nephi', '4 nephi', 'mormon', 'ether', 'moroni'];
  const pgpBooks = ['moses', 'abraham', 'joseph smith—matthew', 'joseph smith-matthew', 'js-m', 'joseph smith—history', 'js-h', 'articles of faith', 'a of f'];
  const dcBooks = ['doctrine and covenants', 'd&c', 'd and c', 'dc', 'section'];
  const otBooks = ['genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua', 'judges', 'ruth', '1 samuel', '2 samuel', '1 kings', '2 kings', '1 chronicles', '2 chronicles', 'ezra', 'nehemiah', 'esther', 'job', 'psalms', 'psalm', 'proverbs', 'ecclesiastes', 'song of solomon', 'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi'];

  if (bomBooks.indexOf(normalized) !== -1) {
    volFile = 'book-of-mormon-reference.json';
  } else if (dcBooks.indexOf(normalized) !== -1) {
    volFile = 'doctrine-and-covenants-reference.json';
    isDc = true;
  } else if (pgpBooks.indexOf(normalized) !== -1) {
    volFile = 'pearl-of-great-price-reference.json';
  } else if (otBooks.indexOf(normalized) !== -1) {
    volFile = 'old-testament-reference.json';
  }

  try {
    const url = 'https://cdn.jsdelivr.net/gh/bcbooks/scriptures-json@master/reference/' + volFile;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      let versesObj = null;
      if (isDc) {
        versesObj = data[chapter];
      } else {
        for (const k in data) {
          if (k === 'last_modified' || k === 'version') continue;
          if (k.toLowerCase() === normalized || k.toLowerCase().replace(/—/g, '-').replace(/\s+/g, ' ') === normalized) {
            versesObj = data[k][chapter];
            break;
          }
        }
      }

      if (versesObj) {
        const verses = [];
        for (let v = startVerse; v <= endVerse; v++) {
          if (versesObj[String(v)]) {
            verses.push(versesObj[String(v)].trim());
          }
        }
        if (verses.length > 0) {
          Logger.log(`Found scripture text for "${clean}": ${verses.length} verse(s)`);
          return verses.join(' ');
        }
      }
    }
  } catch (err) {
    Logger.log(`Scripture lookup notice in Apps Script: ${err.toString()}`);
  }

  return '';
}

function sendPayloadToVercel(payload) {
  const url = CONFIG.VERCEL_INGEST_URL;
  const secret = CONFIG.INGEST_SECRET;
  
  const rawJson = JSON.stringify(payload);
  const payloadKb = Math.round(rawJson.length / 1024);
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + secret,
      'User-Agent': 'Google-Apps-Script-GmailDiary/1.0'
    },
    payload: rawJson,
    muteHttpExceptions: true
  };
  
  try {
    Logger.log(`Posting JSON payload (${payloadKb} KB) to ${url}...`);
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

/**
 * Automatically compresses and downscales large camera photos (3-5 MB each)
 * to ~60-90 KB web-optimized JPEGs (max width 800px) using Google's cloud image engine.
 * 
 * Why this is necessary:
 * Vercel Serverless Functions enforce a strict 4.5 MB HTTP payload limit (FUNCTION_PAYLOAD_TOO_LARGE).
 * 7 raw mobile photos exceed 25-35 MB in Base64.
 * Downscaling to 800px reduces the total payload for all 7 photos to under 600 KB (a 98% reduction!)
 * while keeping sharp, gorgeous polaroid visuals for phones and desktops.
 */
function compressAndResizeAttachment(att, targetWidth) {
  targetWidth = targetWidth || 800;
  let tempFile = null;
  const originalBytes = att.getBytes();
  const origKb = Math.round(originalBytes.length / 1024);

  try {
    const rawBlob = att.copyBlob();
    // Temporarily upload to Google Drive to tap into Google's native image scaling service
    tempFile = DriveApp.createFile(rawBlob);
    const fileId = tempFile.getId();

    // Strategy 1: Drive API v3 thumbnailLink
    const apiUrl = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=thumbnailLink,mimeType';
    let thumbnailLink = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      const res = UrlFetchApp.fetch(apiUrl, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });

      if (res.getResponseCode() === 200) {
        const data = JSON.parse(res.getContentText());
        if (data.thumbnailLink) {
          thumbnailLink = data.thumbnailLink;
          break;
        }
      }
      Utilities.sleep(500);
    }

    if (thumbnailLink) {
      // Replace default size parameter (e.g. =s220) with target size =s800
      let resizedUrl = thumbnailLink;
      if (resizedUrl.indexOf('=s') !== -1) {
        resizedUrl = resizedUrl.replace(/=s\d+.*$/, '=s' + targetWidth);
      } else if (resizedUrl.indexOf('=') !== -1) {
        const parts = resizedUrl.split('=');
        resizedUrl = parts.slice(0, parts.length - 1).join('=') + '=s' + targetWidth;
      } else {
        resizedUrl = resizedUrl + '=s' + targetWidth;
      }

      const resizedRes = UrlFetchApp.fetch(resizedUrl, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });

      if (resizedRes.getResponseCode() === 200) {
        const resizedBlob = resizedRes.getBlob();
        const base64Data = Utilities.base64Encode(resizedBlob.getBytes());
        const compKb = Math.round(base64Data.length * 0.75 / 1024);
        Logger.log(`Compressed "${att.getName()}": ${origKb} KB -> ${compKb} KB (saved ${Math.round((1 - compKb/origKb)*100)}%)`);
        
        return {
          mimeType: 'image/jpeg',
          dataUri: 'data:image/jpeg;base64,' + base64Data
        };
      }
    }

    // Strategy 2: Direct Google Drive thumbnail link fallback
    tempFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const directUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + targetWidth;
    const directRes = UrlFetchApp.fetch(directUrl, { muteHttpExceptions: true });

    if (directRes.getResponseCode() === 200 && directRes.getBlob().getBytes().length > 0) {
      const directBlob = directRes.getBlob();
      const base64Data = Utilities.base64Encode(directBlob.getBytes());
      const compKb = Math.round(base64Data.length * 0.75 / 1024);
      Logger.log(`Compressed "${att.getName()}" via direct thumbnailer: ${origKb} KB -> ${compKb} KB`);
      
      return {
        mimeType: 'image/jpeg',
        dataUri: 'data:image/jpeg;base64,' + base64Data
      };
    }
  } catch (err) {
    Logger.log(`Notice: Drive auto-compression skipped for "${att.getName()}": ${err.toString()}`);
  } finally {
    // Clean up temporary Drive file immediately so Drive stays completely clean
    if (tempFile) {
      try {
        tempFile.setTrashed(true);
      } catch (_) {}
    }
  }

  // Fallback: return original attachment if compression was unavailable
  Logger.log(`Using original uncompressed attachment for "${att.getName()}" (${origKb} KB)`);
  const contentType = att.getContentType() || 'image/jpeg';
  return {
    mimeType: contentType,
    dataUri: `data:${contentType};base64,${Utilities.base64Encode(originalBytes)}`
  };
}

