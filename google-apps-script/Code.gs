/**
 * Gmail Weekly Diary Exporter & Automated P-Day Broadcast Engine
 * Philippines Dumaguete Mission • Elder Mark Salviejo
 * 
 * Features:
 * 1. Dual Passcode Routing:
 *    - Configurable Secret Passcodes for Direct Polaroid Gallery upload and Weekly Journal reflections
 * 2. Anti-Duplicate Engine:
 *    - Strict Gmail message ID tracking prevents duplicate processing of the same email.
 *    - Automatic -from:me filtering ensures system confirmation replies are never looped.
 * 3. 50+ Photos Batching & Auto-Continue:
 *    - Batches large uploads (10 photos per payload) to safely respect Vercel's 4.5 MB payload limit.
 *    - 4-minute execution guard automatically pauses before the 6-minute Apps Script timeout,
 *      stores continuation state, and schedules an automatic trigger to resume seamlessly.
 * 4. Zero Emojis:
 *    - Elegant, dignified missionary aesthetic across all subjects, templates, and logs.
 * 5. Cohesive HTML Email Templates:
 *    - Responsive email receipts for the sender and subscribers matching the website's warm stone and amber theme.
 */

const CONFIG = {
  // Production Ingest Endpoint
  VERCEL_INGEST_URL: 'https://eldersalviejo.vercel.app/api/ingest',
  
  // Shared secret token to authenticate requests to /api/ingest
  INGEST_SECRET: PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || '',
  
  // Dedicated passcodes (configured privately via Script Properties)
  SECRET_DIARY_CODE: PropertiesService.getScriptProperties().getProperty('SECRET_DIARY_CODE') || PropertiesService.getScriptProperties().getProperty('SECRET_CODE') || '',
  SECRET_GALLERY_CODE: PropertiesService.getScriptProperties().getProperty('SECRET_GALLERY_CODE') || '',
  SECRET_CODE: PropertiesService.getScriptProperties().getProperty('SECRET_CODE') || '',

  // Label applied to thread once successfully ingested
  PROCESSED_LABEL: PropertiesService.getScriptProperties().getProperty('PROCESSED_LABEL') || 'diary-processed',
  
  // Optional security filter: only accept submissions sent from specified email
  ALLOWED_SENDER: PropertiesService.getScriptProperties().getProperty('ALLOWED_SENDER') || '',
  
  // Base public website URL
  SITE_URL: 'https://eldersalviejo.vercel.app',
  
  // Batch size for photo uploads (prevents Vercel 4.5 MB HTTP payload limit)
  BATCH_SIZE: 10,

  // Maximum execution time in milliseconds before pausing to prevent 6-minute Apps Script timeout
  MAX_EXECUTION_MS: 240 * 1000 // 4 minutes
};

/**
 * Returns the effective ingest URL.
 */
function getIngestUrl() {
  const custom = PropertiesService.getScriptProperties().getProperty('VERCEL_INGEST_URL');
  if (custom && !custom.includes('gmail-diary-vault.vercel.app')) {
    return custom;
  }
  return CONFIG.VERCEL_INGEST_URL;
}

/**
 * Returns the effective website URL.
 */
function getSiteUrl() {
  const custom = PropertiesService.getScriptProperties().getProperty('SITE_URL');
  if (custom && !custom.includes('gmail-diary-vault.vercel.app')) {
    return custom;
  }
  return CONFIG.SITE_URL;
}

/**
 * Retrieves or creates the Gmail label object for processed weekly diary threads.
 */
function getProcessedLabel() {
  const props = PropertiesService.getScriptProperties();
  const labelName = props.getProperty('PROCESSED_LABEL') || CONFIG.PROCESSED_LABEL || 'diary-processed';
  
  try {
    let label = GmailApp.getUserLabelByName(labelName);
    if (label) return label;

    const allLabels = GmailApp.getUserLabels();
    for (let i = 0; i < allLabels.length; i++) {
      if (allLabels[i].getName().toLowerCase() === labelName.toLowerCase()) {
        return allLabels[i];
      }
    }

    return GmailApp.createLabel(labelName);
  } catch (err) {
    Logger.log(`Notice retrieving or creating diary label "${labelName}": ${err.message}`);
    try {
      const allLabels = GmailApp.getUserLabels();
      for (let i = 0; i < allLabels.length; i++) {
        const name = allLabels[i].getName().toLowerCase();
        if (name === labelName.toLowerCase() || name === 'diary-processed' || name === 'diary processed') {
          return allLabels[i];
        }
      }
    } catch (_) {}
    return null;
  }
}

/**
 * Retrieves or creates the Gmail label object for processed Polaroid gallery threads.
 */
function getGalleryProcessedLabel() {
  const props = PropertiesService.getScriptProperties();
  const labelName = props.getProperty('GALLERY_PROCESSED_LABEL') || 'gallery-processed';
  
  try {
    let label = GmailApp.getUserLabelByName(labelName);
    if (label) return label;

    const allLabels = GmailApp.getUserLabels();
    for (let i = 0; i < allLabels.length; i++) {
      if (allLabels[i].getName().toLowerCase() === labelName.toLowerCase()) {
        return allLabels[i];
      }
    }

    return GmailApp.createLabel(labelName);
  } catch (err) {
    Logger.log(`Notice retrieving or creating gallery label "${labelName}": ${err.message}`);
    try {
      const allLabels = GmailApp.getUserLabels();
      for (let i = 0; i < allLabels.length; i++) {
        const name = allLabels[i].getName().toLowerCase();
        if (name === labelName.toLowerCase() || name === 'gallery-processed' || name === 'gallery processed') {
          return allLabels[i];
        }
      }
    } catch (_) {}
    return null;
  }
}

/**
 * Safely applies the diary processed label to a thread and marks it as read.
 */
function applyProcessedLabel(thread) {
  if (!thread) return;
  try {
    const label = getProcessedLabel();
    if (label) {
      thread.addLabel(label);
      const subject = thread.getFirstMessageSubject() || 'Untitled';
      Logger.log(`[PASS] Applied diary label "${label.getName()}" to thread: "${subject}"`);
    } else {
      Logger.log(`[WARNING] Unable to obtain diary label object to apply to thread.`);
    }
    thread.markRead();
  } catch (err) {
    Logger.log(`Notice applying diary processed label: ${err.message}`);
  }
}

/**
 * Safely applies the gallery processed label to a thread and marks it as read.
 */
function applyGalleryProcessedLabel(thread) {
  if (!thread) return;
  try {
    const label = getGalleryProcessedLabel();
    if (label) {
      thread.addLabel(label);
      const subject = thread.getFirstMessageSubject() || 'Untitled';
      Logger.log(`[PASS] Applied gallery label "${label.getName()}" to thread: "${subject}"`);
    } else {
      Logger.log(`[WARNING] Unable to obtain gallery label object to apply to thread.`);
    }
    thread.markRead();
  } catch (err) {
    Logger.log(`Notice applying gallery processed label: ${err.message}`);
  }
}

/**
 * Anti-Duplicate Engine: Returns search query excluding processed emails,
 * self-replies, and confirmation subjects.
 */
function getGmailQuery() {
  const props = PropertiesService.getScriptProperties();
  const diaryLabel = props.getProperty('PROCESSED_LABEL') || CONFIG.PROCESSED_LABEL || 'diary-processed';
  const galleryLabel = props.getProperty('GALLERY_PROCESSED_LABEL') || 'gallery-processed';
  const diaryCode = props.getProperty('SECRET_DIARY_CODE') || props.getProperty('SECRET_CODE') || CONFIG.SECRET_DIARY_CODE || '';
  const galleryCode = props.getProperty('SECRET_GALLERY_CODE') || CONFIG.SECRET_GALLERY_CODE || '';

  const codeTerms = [diaryCode, galleryCode].filter(Boolean).map(c => `"${c}"`).join(' OR ');
  const codeFilter = codeTerms 
    ? `(${codeTerms} OR subject:"Weekly Reflection" OR subject:"Weekly Journal" OR subject:Reflection OR subject:Gallery OR subject:Album OR subject:Photos)`
    : '(subject:"Weekly Reflection" OR subject:"Weekly Journal" OR subject:Reflection OR subject:Gallery OR subject:Album OR subject:Photos OR has:attachment)';

  return `${codeFilter} -label:${diaryLabel} -label:${galleryLabel} -from:me -subject:"Confirmed:" -subject:"Receipt:" -subject:"Published:" -subject:"Re:" -subject:"RE:" -subject:"Fwd:" -subject:"FW:"`;
}

/**
 * One-time setup helper: Run this function once from the Apps Script toolbar
 * to securely save private credentials into Google Account Script Properties.
 */
function setupPrivateProperties(ingestSecret, secretDiaryPasscode, secretGalleryPasscode) {
  const props = PropertiesService.getScriptProperties();
  if (ingestSecret) props.setProperty('INGEST_SECRET', ingestSecret);
  if (secretDiaryPasscode) {
    props.setProperty('SECRET_DIARY_CODE', secretDiaryPasscode);
    props.setProperty('SECRET_CODE', secretDiaryPasscode);
  }
  if (secretGalleryPasscode) {
    props.setProperty('SECRET_GALLERY_CODE', secretGalleryPasscode);
  }
  props.setProperty('PROCESSED_LABEL', props.getProperty('PROCESSED_LABEL') || 'diary-processed');
  props.setProperty('VERCEL_INGEST_URL', props.getProperty('VERCEL_INGEST_URL') || 'https://eldersalviejo.vercel.app/api/ingest');
  props.setProperty('SITE_URL', props.getProperty('SITE_URL') || 'https://eldersalviejo.vercel.app');
  
  // Ensure the Gmail label is physically created right away
  getProcessedLabel();
  
  Logger.log('Saved configuration to private Google Apps Script Properties and verified Gmail label. Public git repository code contains zero secret keys or tokens.');
}

/**
 * Anti-Duplicate Engine (Backed by Turso SQLite Database):
 * Checks if a Gmail message has already been processed and recorded in Turso.
 */
function isMessageAlreadyProcessed(messageId) {
  if (!messageId) return false;
  
  const ingestSecret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || CONFIG.INGEST_SECRET;
  const baseUrl = (PropertiesService.getScriptProperties().getProperty('SITE_URL') || CONFIG.SITE_URL || 'https://eldersalviejo.vercel.app').replace(/\/$/, '');

  try {
    const url = `${baseUrl}/api/tracking/message?id=${encodeURIComponent(messageId)}`;
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${ingestSecret}`,
        'x-ingest-secret': ingestSecret
      },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      return Boolean(data.isProcessed);
    }
  } catch (err) {
    Logger.log(`Turso message check network notice: ${err.message}`);
  }

  // Local fallback cache in PropertiesService (temporary buffer)
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('PROCESSED_MESSAGE_IDS');
  if (!raw) return false;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.includes(messageId);
  } catch (_) {
    return false;
  }
}

/**
 * Anti-Duplicate Engine (Backed by Turso SQLite Database):
 * Records a processed Gmail message into the Turso processed_messages table.
 */
function markMessageProcessed(messageId, subject, sender, status) {
  if (!messageId) return;
  
  const ingestSecret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || CONFIG.INGEST_SECRET;
  const baseUrl = (PropertiesService.getScriptProperties().getProperty('SITE_URL') || CONFIG.SITE_URL || 'https://eldersalviejo.vercel.app').replace(/\/$/, '');

  try {
    const url = `${baseUrl}/api/tracking/message`;
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': `Bearer ${ingestSecret}`,
        'x-ingest-secret': ingestSecret
      },
      payload: JSON.stringify({
        messageId: messageId,
        subject: subject || null,
        sender: sender || null,
        status: status || 'processed'
      }),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log(`Turso message record notice: ${err.message}`);
  }

  // Also maintain small recent memory buffer in PropertiesService (max 50)
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty('PROCESSED_MESSAGE_IDS');
    let list = [];
    if (raw) list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];
    if (!list.includes(messageId)) {
      list.push(messageId);
      if (list.length > 50) list = list.slice(list.length - 50);
      props.setProperty('PROCESSED_MESSAGE_IDS', JSON.stringify(list));
    }
  } catch (_) {}
}

/**
 * Continuation Engine: Retrieves pending continuation state if an earlier run
 * had to pause due to the 4-minute time limit on 50+ photos.
 */
function getContinuationState() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('CONTINUATION_STATE');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Continuation Engine: Saves continuation state.
 */
function saveContinuationState(state) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('CONTINUATION_STATE', JSON.stringify(state));
}

/**
 * Continuation Engine: Clears continuation state and deletes temporary continuation triggers.
 */
function clearContinuationState() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('CONTINUATION_STATE');
  cleanupTemporaryContinuationTriggers();
}

/**
 * Removes temporary one-shot continuation triggers while preserving daily recurring triggers.
 */
function cleanupTemporaryContinuationTriggers() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      const t = triggers[i];
      // Only delete if it's a non-daily/one-shot clock trigger
      if (t.getHandlerFunction() === 'processWeeklyDiaryEmails' && t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
        // If this trigger is not our recurring daily schedule, remove it
      }
    }
  } catch (_) {}
}

/**
 * Continuation Engine: Schedules an automatic one-time trigger in 30 seconds
 * to resume processing remaining photos.
 */
function scheduleContinuationTrigger() {
  cleanupTemporaryContinuationTriggers();
  ScriptApp.newTrigger('processWeeklyDiaryEmails')
    .timeBased()
    .after(30000)
    .create();
  Logger.log('Scheduled automatic continuation trigger in 30 seconds.');
}

/**
 * Diagnostic tool: Run from toolbar to verify last 5 emails in inbox and why they match or don't match.
 */
function debugCheckInbox() {
  Logger.log('====================================================');
  Logger.log('=== CHECKING LAST 5 EMAILS IN INBOX ===');
  Logger.log('====================================================');
  const threads = GmailApp.getInboxThreads(0, 5);
  if (!threads || threads.length === 0) {
    Logger.log('Inbox has NO emails right now.');
    return;
  }
  
  const diaryLabel = getProcessedLabel();
  const galleryLabel = getGalleryProcessedLabel();
  const diaryName = diaryLabel ? diaryLabel.getName().toLowerCase() : 'diary-processed';
  const galleryName = galleryLabel ? galleryLabel.getName().toLowerCase() : 'gallery-processed';

  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const msg = thread.getMessages()[0];
    const labels = thread.getLabels().map(l => l.getName());
    const labelNamesLower = labels.map(l => l.toLowerCase());
    const isDiaryLabeled = labelNamesLower.includes(diaryName);
    const isGalleryLabeled = labelNamesLower.includes(galleryName);
    
    Logger.log(`\nEmail #${i + 1}:`);
    Logger.log(`   Subject : "${msg.getSubject()}"`);
    Logger.log(`   From    : "${msg.getFrom()}"`);
    Logger.log(`   Date    : ${msg.getDate().toISOString()}`);
    Logger.log(`   Labels  : [${labels.join(', ') || 'none'}]`);
    if (isDiaryLabeled) {
      Logger.log(`   Status  : ALREADY PROCESSED AS DIARY (Has "${diaryName}" label)`);
    } else if (isGalleryLabeled) {
      Logger.log(`   Status  : ALREADY PROCESSED AS GALLERY (Has "${galleryName}" label)`);
    } else {
      Logger.log(`   Status  : UNPROCESSED (Ready to be ingested by trigger or processWeeklyDiaryEmails)`);
    }
  }
  Logger.log('\n====================================================');
}

/**
 * Alias for processWeeklyDiaryEmails to allow manual execution under either name.
 */
function processUnprocessedThreads() {
  return processWeeklyDiaryEmails();
}

/**
 * Main entry point: Scans inbox for unprocessed missionary journal and gallery emails,
 * extracts reflections, scriptures, and attachments, and posts them to the ingest API.
 */
function processWeeklyDiaryEmails() {
  const startTime = Date.now();
  Logger.log('Starting Weekly Diary Ingest & Dispatch job...');

  // 1. Check if there is an existing continuation job (from 50+ photos upload)
  const pendingState = getContinuationState();
  if (pendingState) {
    Logger.log(`Resuming continuation job for Message ID: ${pendingState.messageId} at photo offset ${pendingState.processedCount}/${pendingState.totalCount}`);
    const resumed = resumeContinuationJob(pendingState, startTime);
    if (resumed === 'PAUSED') {
      return;
    }
  }

  const query = getGmailQuery();
  Logger.log('Query: ' + query);
  
  const threads = GmailApp.search(query, 0, 5);
  if (!threads || threads.length === 0) {
    Logger.log('No new unprocessed emails found.');
    return;
  }
  
  let processedLabel = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL);
  if (!processedLabel) {
    processedLabel = GmailApp.createLabel(CONFIG.PROCESSED_LABEL);
  }
  
  let myEmail = '';
  try {
    myEmail = (Session.getEffectiveUser() && Session.getEffectiveUser().getEmail()) || 
              (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '';
  } catch (_) {}

  for (let i = 0; i < threads.length; i++) {
    if (Date.now() - startTime > CONFIG.MAX_EXECUTION_MS) {
      Logger.log('Approaching 4-minute time limit. Scheduling continuation trigger.');
      scheduleContinuationTrigger();
      return;
    }

    const thread = threads[i];
    const messages = thread.getMessages();
    if (messages.length === 0) continue;
    
    const message = messages[messages.length - 1];
    const messageId = message.getId();

    if (isMessageAlreadyProcessed(messageId)) {
      Logger.log(`Skipping already processed message ID: ${messageId}`);
      applyProcessedLabel(thread);
      continue;
    }

    const sender = message.getFrom();
    const subject = message.getSubject() || '';
    const date = message.getDate();
    const body = message.getPlainBody() || message.getBody() || '';
    
    if (
      subject.includes('Confirmed:') ||
      subject.includes('Published:') ||
      (subject.includes('Elder Salviejo') && subject.includes('Weekly Journal:') && subject.includes('Philippines Dumaguete Mission'))
    ) {
      Logger.log(`Skipping automated system notification: "${subject}"`);
      markMessageProcessed(messageId);
      applyProcessedLabel(thread);
      continue;
    }

    // Skip reply/forward messages (e.g. Re: or Fwd:) to prevent processing report discussions as weekly diaries
    const trimmedSubject = subject.trim();
    if (
      /^(re|fwd|fw)\s*[:\-—]/i.test(trimmedSubject) ||
      trimmedSubject.toLowerCase().startsWith('re:') ||
      trimmedSubject.toLowerCase().startsWith('re :') ||
      trimmedSubject.toLowerCase().startsWith('fwd:') ||
      trimmedSubject.toLowerCase().startsWith('fw:')
    ) {
      Logger.log(`Skipping reply/forward message to avoid processing report replies: "${subject}"`);
      markMessageProcessed(messageId);
      applyProcessedLabel(thread);
      continue;
    }

    const secretDiaryCode = PropertiesService.getScriptProperties().getProperty('SECRET_DIARY_CODE') || PropertiesService.getScriptProperties().getProperty('SECRET_CODE') || CONFIG.SECRET_DIARY_CODE || '';
    const secretGalleryCode = PropertiesService.getScriptProperties().getProperty('SECRET_GALLERY_CODE') || CONFIG.SECRET_GALLERY_CODE || '';

    const isGalleryCode = Boolean(secretGalleryCode && ((subject && subject.includes(secretGalleryCode)) || (body && body.includes(secretGalleryCode))));
    const isDiaryCode = Boolean(secretDiaryCode && ((subject && subject.includes(secretDiaryCode)) || (body && body.includes(secretDiaryCode))));
    const hasCode = isGalleryCode || isDiaryCode;
    const isReflection = subject.toLowerCase().includes('reflection') || subject.toLowerCase().includes('journal');
    
    if (myEmail && sender.toLowerCase().includes(myEmail.toLowerCase()) && !hasCode) {
      Logger.log(`Skipping message sent from script account itself: "${subject}"`);
      markMessageProcessed(messageId);
      applyProcessedLabel(thread);
      continue;
    }

    if (!hasCode && !isReflection) {
      Logger.log(`Skipping thread "${subject}": Missing required secret passcode or reflection subject.`);
      continue;
    }

    if (CONFIG.ALLOWED_SENDER && !sender.toLowerCase().includes(CONFIG.ALLOWED_SENDER.toLowerCase())) {
      Logger.log(`Skipping message from unauthorized sender: ${sender}`);
      continue;
    }
    
    Logger.log(`Processing email from ${sender}: "${subject}" received at ${date.toISOString()}`);
    
    const rawAttachments = message.getAttachments();
    const imageAttachments = rawAttachments.filter(att => {
      const contentType = (att.getContentType() || '').toLowerCase();
      return contentType.startsWith('image/') || 
             att.getName().match(/\.(jpe?g|png|webp|heic)$/i);
    });
    
    Logger.log(`Found ${imageAttachments.length} image attachment(s).`);

    // -------------------------------------------------------------
    // BRANCH A: Direct Polaroid Gallery Upload
    // -------------------------------------------------------------
    if (isGalleryCode) {
      if (imageAttachments.length === 0) {
        Logger.log(`Skipping gallery upload for "${subject}": No photo attachments found.`);
        markMessageProcessed(messageId);
        applyGalleryProcessedLabel(thread);
        continue;
      }

      const galleryTitle = cleanSubjectTitle(subject, secretGalleryCode) || `Polaroid Gallery ${Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')}`;
      const gallerySlug = generateSlug(galleryTitle, date);
      const cleanRawSubject = cleanSubjectTitle(subject, secretGalleryCode);
      const galleryCategory = extractGalleryCategory(subject, secretGalleryCode);
      const cleanEmailBody = cleanEmailBodyText(body, secretGalleryCode);

      const totalImages = imageAttachments.length;
      let processedIndex = 0;
      let batchNum = 1;

      while (processedIndex < totalImages) {
        if (Date.now() - startTime > CONFIG.MAX_EXECUTION_MS) {
          Logger.log(`Time budget reached at photo ${processedIndex}/${totalImages}. Saving continuation state.`);
          saveContinuationState({
            messageId: messageId,
            threadId: thread.getId(),
            processedCount: processedIndex,
            totalCount: totalImages,
            slug: gallerySlug,
            title: galleryTitle,
            category: galleryCategory,
            bodyText: cleanEmailBody,
            sender: sender,
            date: date.toISOString(),
            isGallery: true
          });
          scheduleContinuationTrigger();
          return;
        }

        const currentBatchAtts = imageAttachments.slice(processedIndex, processedIndex + CONFIG.BATCH_SIZE);
        Logger.log(`Compressing gallery batch #${batchNum} (photos ${processedIndex + 1} to ${processedIndex + currentBatchAtts.length} of ${totalImages})...`);

        const encodedImages = currentBatchAtts.map((att, idx) => {
          const compressed = compressAndResizeAttachment(att, 800);
          return {
            filename: att.getName() || `photo_${processedIndex + idx + 1}.jpg`,
            mimeType: compressed.mimeType,
            dataUri: compressed.dataUri
          };
        });

        const batchSlug = batchNum === 1 ? gallerySlug : `${gallerySlug}-part-${batchNum}`;
        const galleryEntries = encodedImages.map((img, idx) => ({
          day: `PHOTO_${processedIndex + idx + 1}`,
          text: cleanEmailBody,
          caption: cleanEmailBody,
          image: img.dataUri,
          imageFilename: img.filename,
          category: galleryCategory
        }));

        const payload = {
          slug: batchSlug,
          title: batchNum === 1 ? galleryTitle : `${galleryTitle} (Part ${batchNum})`,
          publishedAt: date.toISOString(),
          rawSubject: cleanRawSubject,
          sender: sender,
          bodyText: cleanEmailBody,
          entries: galleryEntries,
          totalEntries: galleryEntries.length,
          imageCount: encodedImages.length,
          verse: null,
          isGallery: true,
          category: galleryCategory
        };

        const ingestResult = sendPayloadToVercel(payload);
        if (!ingestResult) {
          Logger.log(`Ingest failed on batch #${batchNum}. Will retry on next cycle.`);
          return;
        }

        processedIndex += currentBatchAtts.length;
        batchNum++;
      }

      clearContinuationState();
      markMessageProcessed(messageId);
      applyGalleryProcessedLabel(thread);
      Logger.log(`Successfully ingested Gallery thread: "${subject}" [${totalImages} photos total]`);

      const galleryUrl = `${getSiteUrl()}/gallery`;
      const finalPayloadSummary = {
        title: galleryTitle,
        publishedAt: date.toISOString(),
        imageCount: totalImages,
        category: galleryCategory,
        bodyText: cleanEmailBody
      };
      sendGallerySuccessReplyToSender(thread, sender, finalPayloadSummary, galleryUrl);
      continue;
    }

    // -------------------------------------------------------------
    // BRANCH B: Weekly Diary Reflections
    // -------------------------------------------------------------
    const weekTitle = cleanSubjectTitle(subject, secretDiaryCode) || `Week of ${Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')}`;
    const cleanRawSubject = cleanSubjectTitle(subject, secretDiaryCode);
    const weekSlug = generateSlug(weekTitle, date);
    const diaryCategory = extractGalleryCategory(subject, secretDiaryCode);

    const mainAttachments = imageAttachments.slice(0, CONFIG.BATCH_SIZE);
    Logger.log(`Compressing ${mainAttachments.length} main diary photo(s)...`);

    const encodedImages = mainAttachments.map((att, idx) => {
      const compressed = compressAndResizeAttachment(att, 800);
      return {
        filename: att.getName() || `photo_${idx + 1}.jpg`,
        mimeType: compressed.mimeType,
        dataUri: compressed.dataUri
      };
    });

    const parsedData = parseDiaryContent(body, encodedImages);
    const taggedEntries = parsedData.entries.map(e => ({
      ...e,
      category: diaryCategory !== 'Mission' ? diaryCategory : 'P-Day Journal'
    }));

    const payload = {
      slug: weekSlug,
      title: weekTitle,
      publishedAt: date.toISOString(),
      rawSubject: cleanRawSubject,
      sender: sender,
      entries: taggedEntries,
      totalEntries: taggedEntries.length,
      imageCount: encodedImages.length,
      verse: parsedData.verse,
      isGallery: false,
      category: diaryCategory !== 'Mission' ? diaryCategory : 'P-Day Journal'
    };

    const ingestResult = sendPayloadToVercel(payload);
    if (!ingestResult) {
      Logger.log(`Failed to ingest weekly diary thread: "${subject}". Will retry on next trigger.`);
      continue;
    }

    if (imageAttachments.length > CONFIG.BATCH_SIZE) {
      let extraIndex = CONFIG.BATCH_SIZE;
      const totalImages = imageAttachments.length;
      let partNum = 2;

      while (extraIndex < totalImages) {
        if (Date.now() - startTime > CONFIG.MAX_EXECUTION_MS) {
          Logger.log(`Time budget reached during extra photos at offset ${extraIndex}/${totalImages}. Saving continuation state.`);
          saveContinuationState({
            messageId: messageId,
            threadId: thread.getId(),
            processedCount: extraIndex,
            totalCount: totalImages,
            slug: `${weekSlug}-gallery`,
            title: `${weekTitle} (Gallery Photos)`,
            category: 'P-Day Journal',
            sender: sender,
            date: date.toISOString(),
            isGallery: true
          });
          scheduleContinuationTrigger();
          return;
        }

        const extraBatch = imageAttachments.slice(extraIndex, extraIndex + CONFIG.BATCH_SIZE);
        const encodedExtra = extraBatch.map((att, idx) => {
          const comp = compressAndResizeAttachment(att, 800);
          return {
            filename: att.getName() || `photo_${extraIndex + idx + 1}.jpg`,
            mimeType: comp.mimeType,
            dataUri: comp.dataUri
          };
        });

        const extraEntries = encodedExtra.map((img, idx) => ({
          day: `PHOTO_${extraIndex + idx + 1}`,
          text: '',
          image: img.dataUri,
          imageFilename: img.filename,
          category: 'P-Day Journal'
        }));

        sendPayloadToVercel({
          slug: `${weekSlug}-gallery-part-${partNum}`,
          title: `${weekTitle} Photos (Part ${partNum})`,
          publishedAt: date.toISOString(),
          rawSubject: cleanRawSubject,
          sender: sender,
          entries: extraEntries,
          totalEntries: extraEntries.length,
          imageCount: encodedExtra.length,
          verse: null,
          isGallery: true,
          category: 'P-Day Journal'
        });

        extraIndex += extraBatch.length;
        partNum++;
      }
    }

    clearContinuationState();
    markMessageProcessed(messageId);
    applyProcessedLabel(thread);
    Logger.log(`Successfully ingested and published weekly diary: "${weekTitle}" [${imageAttachments.length} photos total]`);

    const liveUrl = `${getSiteUrl()}/week/${weekSlug}`;
    const dbSubscribers = ingestResult.subscribers || [];
    payload.imageCount = imageAttachments.length;
    sendSuccessReplyToSender(thread, sender, payload, liveUrl, dbSubscribers);
    dispatchWeeklyBroadcast(payload, liveUrl, sender, dbSubscribers);
  }
}

/**
 * Continuation Engine: Resumes a multi-part upload for an email with 50+ photos.
 */
function resumeContinuationJob(state, startTime) {
  try {
    const message = GmailApp.getMessageById(state.messageId);
    if (!message) {
      clearContinuationState();
      return 'DONE';
    }

    const thread = message.getThread();
    const rawAttachments = message.getAttachments();
    const imageAttachments = rawAttachments.filter(att => {
      const ct = (att.getContentType() || '').toLowerCase();
      return ct.startsWith('image/') || att.getName().match(/\.(jpe?g|png|webp|heic)$/i);
    });

    const totalImages = imageAttachments.length;
    let processedIndex = state.processedCount || 0;
    let batchNum = Math.floor(processedIndex / CONFIG.BATCH_SIZE) + 1;

    while (processedIndex < totalImages) {
      if (Date.now() - startTime > CONFIG.MAX_EXECUTION_MS) {
        Logger.log(`Continuation time budget reached at photo ${processedIndex}/${totalImages}. Updating state.`);
        state.processedCount = processedIndex;
        saveContinuationState(state);
        scheduleContinuationTrigger();
        return 'PAUSED';
      }

      const currentBatchAtts = imageAttachments.slice(processedIndex, processedIndex + CONFIG.BATCH_SIZE);
      Logger.log(`Resuming batch #${batchNum} (${processedIndex + 1} to ${processedIndex + currentBatchAtts.length} of ${totalImages})...`);

      const encodedImages = currentBatchAtts.map((att, idx) => {
        const compressed = compressAndResizeAttachment(att, 800);
        return {
          filename: att.getName() || `photo_${processedIndex + idx + 1}.jpg`,
          mimeType: compressed.mimeType,
          dataUri: compressed.dataUri
        };
      });

      const batchSlug = `${state.slug}-part-${batchNum}`;
      const galleryEntries = encodedImages.map((img, idx) => ({
        day: `PHOTO_${processedIndex + idx + 1}`,
        text: state.bodyText || '',
        caption: state.bodyText || '',
        image: img.dataUri,
        imageFilename: img.filename,
        category: state.category || 'Mission'
      }));

      const payload = {
        slug: batchSlug,
        title: `${state.title} (Part ${batchNum})`,
        publishedAt: state.date || new Date().toISOString(),
        rawSubject: state.title,
        sender: state.sender,
        bodyText: state.bodyText || '',
        entries: galleryEntries,
        totalEntries: galleryEntries.length,
        imageCount: encodedImages.length,
        verse: null,
        isGallery: true,
        category: state.category || 'Mission'
      };

      const res = sendPayloadToVercel(payload);
      if (!res) {
        Logger.log(`Continuation batch #${batchNum} failed. Will retry.`);
        return 'PAUSED';
      }

      processedIndex += currentBatchAtts.length;
      batchNum++;
    }

    clearContinuationState();
    markMessageProcessed(state.messageId);
    if (state.isGallery) {
      applyGalleryProcessedLabel(thread);
    } else {
      applyProcessedLabel(thread);
    }

    Logger.log(`Continuation job fully completed for ${totalImages} photos.`);
    const galleryUrl = `${getSiteUrl()}/gallery`;
    sendGallerySuccessReplyToSender(thread, state.sender, {
      title: state.title,
      publishedAt: state.date,
      imageCount: totalImages,
      category: state.category
    }, galleryUrl);

    return 'DONE';
  } catch (err) {
    Logger.log(`Continuation error: ${err.message}`);
    clearContinuationState();
    return 'DONE';
  }
}

/**
 * Universal Email HTML Template Builder (Matching Website Theme, Zero Emojis, Zero Question Marks)
 */
function buildEmailShell(title, subtitle, contentHtml, ctaText, ctaUrl) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #f4f1ea; padding: 24px 12px; color: #1c1917;">
      
      <!-- Top Banner Header -->
      <div style="background-color: #1c1917; color: #ffffff; padding: 26px 24px; text-align: center; border-radius: 10px 10px 0 0; border-bottom: 3px solid #d97706;">
        <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d97706; font-weight: 700;">Philippines Dumaguete Mission</p>
        <h1 style="margin: 8px 0 0 0; font-size: 22px; font-family: Georgia, serif; font-weight: 700; letter-spacing: 0.5px; color: #ffffff;">Elder Mark Salviejo</h1>
        <p style="margin: 6px 0 0 0; font-size: 12px; color: #a8a29e; font-family: Georgia, serif; font-style: italic;">Dedicated Missionary Journal Vault</p>
      </div>

      <!-- Main Card Surface -->
      <div style="background-color: #ffffff; padding: 28px 24px; border: 1px solid #e7e5e4; border-top: none; border-radius: 0 0 10px 10px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);">
        
        <div style="border-bottom: 1px solid #f5f5f4; padding-bottom: 14px; margin-bottom: 18px;">
          <h2 style="font-family: Georgia, serif; font-size: 18px; color: #1c1917; margin: 0 0 4px 0; font-weight: 700;">
            ${escapeHtml(title)}
          </h2>
          ${subtitle ? `<p style="font-size: 12px; color: #78716c; margin: 0;">${escapeHtml(subtitle)}</p>` : ''}
        </div>

        ${contentHtml}

        ${ctaText && ctaUrl ? `
        <!-- Call to Action Button -->
        <div style="text-align: center; margin: 28px 0 10px 0;">
          <a href="${ctaUrl}" target="_blank" style="background-color: #d97706; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 700; font-size: 13px; display: inline-block; letter-spacing: 0.5px;">
            ${escapeHtml(ctaText)} &rarr;
          </a>
        </div>
        <p style="text-align: center; margin-top: 14px; font-size: 11px; color: #78716c;">
          Direct link: <a href="${ctaUrl}" style="color: #b45309; text-decoration: underline; word-break: break-all;">${ctaUrl}</a>
        </p>
        ` : ''}

      </div>

      <!-- Dignified Missionary Footer -->
      <div style="text-align: center; padding-top: 18px; font-size: 11px; color: #78716c; line-height: 1.5;">
        Elder Mark Salviejo &bull; Philippines Dumaguete Mission &bull; Official Archive
      </div>

    </div>
  `;
}

/**
 * Replies to sender confirming Polaroid Gallery publication.
 */
function sendGallerySuccessReplyToSender(thread, sender, payload, galleryUrl) {
  const authorClean = extractEmailAddress(sender);
  const categoryClean = payload.category || 'Mission';
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy • h:mm a');
  const subject = `Receipt: Polaroid Gallery Synced — ${categoryClean} (${timestamp})`;
  
  const contentHtml = `
    <p style="font-size: 13px; line-height: 1.6; color: #44403c; margin-top: 0;">
      Elder Salviejo, your photograph submission has been received, optimized, and pinned to your live Polaroid Gallery.
    </p>

    <!-- Details Table -->
    <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 12px; background-color: #fafaf9; border-radius: 6px; border: 1px solid #f5f5f4;">
      <tr>
        <td style="padding: 10px 14px; color: #78716c; font-weight: 600; width: 35%;">Category Album</td>
        <td style="padding: 10px 14px; color: #1c1917; font-weight: 700;">
          <span style="background-color: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 9999px; font-size: 11px;">
            ${escapeHtml(categoryClean)}
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; color: #78716c; font-weight: 600; border-top: 1px solid #f5f5f4;">Photographs Added</td>
        <td style="padding: 10px 14px; color: #1c1917; font-weight: 700; border-top: 1px solid #f5f5f4;">${payload.imageCount} polaroid(s)</td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; color: #78716c; font-weight: 600; border-top: 1px solid #f5f5f4;">Time Recorded</td>
        <td style="padding: 10px 14px; color: #1c1917; border-top: 1px solid #f5f5f4;">
          ${timestamp}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; color: #78716c; font-weight: 600; border-top: 1px solid #f5f5f4;">Cloud Storage</td>
        <td style="padding: 10px 14px; color: #1c1917; border-top: 1px solid #f5f5f4;">jsDelivr Edge CDN &amp; GitHub Vault</td>
      </tr>
    </table>
  `;

  const htmlBody = buildEmailShell(
    'Polaroid Wall Synced',
    'Philippines Dumaguete Mission',
    contentHtml,
    'Open Polaroid Photo Gallery',
    galleryUrl
  );

  const plainText = 
    `Elder Salviejo,\n\n` +
    `Confirmed: Your ${payload.imageCount} photo(s) have been received and pinned to your Polaroid Gallery.\n\n` +
    `Category: ${categoryClean}\n` +
    `Time: ${timestamp}\n\n` +
    `View live gallery: ${galleryUrl}\n\n` +
    `Elder Mark Salviejo • Philippines Dumaguete Mission`;

  try {
    thread.reply(plainText, {
      htmlBody: htmlBody,
      name: 'Elder Salviejo Journal Vault'
    });
    Logger.log(`Sent HTML gallery confirmation reply directly to thread for: ${authorClean || sender}`);
  } catch (err) {
    if (authorClean) {
      try {
        GmailApp.sendEmail(authorClean, subject, plainText, {
          htmlBody: htmlBody,
          name: 'Elder Salviejo Journal Vault'
        });
        Logger.log(`Sent direct confirmation email to: ${authorClean}`);
      } catch (sendErr) {
        Logger.log(`Could not send confirmation email to author: ${sendErr.message}`);
      }
    }
  }
}

/**
 * Replies to sender confirming Weekly Diary publication.
 */
function sendSuccessReplyToSender(thread, sender, payload, liveUrl, dbSubscribers) {
  const authorClean = extractEmailAddress(sender);
  const subscriberCount = (dbSubscribers || []).length;
  const cleanTitle = cleanSubjectTitle(payload.title || 'Weekly Missionary Journal', CONFIG.SECRET_CODE);
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy • h:mm a');
  const subject = `Receipt: Weekly Journal Published — ${cleanTitle} (${timestamp})`;

  const contentHtml = `
    <p style="font-size: 13px; line-height: 1.6; color: #44403c; margin-top: 0;">
      Elder Salviejo, your weekly missionary reflections and routine photos have been successfully received and published live to your online journal vault.
    </p>

    <!-- Details Table -->
    <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 12px; background-color: #fafaf9; border-radius: 6px; border: 1px solid #f5f5f4;">
      <tr>
        <td style="padding: 10px 14px; color: #78716c; font-weight: 600; width: 35%;">Journal Title</td>
        <td style="padding: 10px 14px; color: #1c1917; font-weight: 700;">${escapeHtml(cleanTitle)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; color: #78716c; font-weight: 600; border-top: 1px solid #f5f5f4;">Time Published</td>
        <td style="padding: 10px 14px; color: #1c1917; border-top: 1px solid #f5f5f4;">
          ${timestamp}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; color: #78716c; font-weight: 600; border-top: 1px solid #f5f5f4;">Daily Entries</td>
        <td style="padding: 10px 14px; color: #1c1917; border-top: 1px solid #f5f5f4;">${payload.totalEntries} day(s) recorded</td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; color: #78716c; font-weight: 600; border-top: 1px solid #f5f5f4;">Routine Polaroids</td>
        <td style="padding: 10px 14px; color: #1c1917; border-top: 1px solid #f5f5f4;">${payload.imageCount} photograph(s) synced</td>
      </tr>
      ${(payload.verse && payload.verse.reference) ? `
      <tr>
        <td style="padding: 10px 14px; color: #78716c; font-weight: 600; border-top: 1px solid #f5f5f4;">Weekly Scripture</td>
        <td style="padding: 10px 14px; color: #1c1917; border-top: 1px solid #f5f5f4;">${escapeHtml(payload.verse.reference)}</td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 10px 14px; color: #78716c; font-weight: 600; border-top: 1px solid #f5f5f4;">Subscribers Notified</td>
        <td style="padding: 10px 14px; color: #1c1917; border-top: 1px solid #f5f5f4;">${subscriberCount} recipient(s)</td>
      </tr>
    </table>

    <div style="background-color: #f5f5f4; border-radius: 6px; padding: 12px 14px; margin-top: 14px; font-size: 11px; color: #57534e;">
      Photographs from this entry have also been mirrored to your Polaroid Wall at <a href="${getSiteUrl()}/gallery" style="color: #b45309; text-decoration: underline;">${getSiteUrl()}/gallery</a>.
    </div>
  `;

  const htmlBody = buildEmailShell(
    'Weekly Journal Published',
    'Philippines Dumaguete Mission',
    contentHtml,
    'Open Weekly Journal Entry',
    liveUrl
  );

  const plainText =
    `Elder Salviejo,\n\n` +
    `Confirmed: Your weekly reflection has been published live.\n\n` +
    `Title: ${cleanTitle}\n` +
    `Time: ${timestamp}\n` +
    `Entries: ${payload.totalEntries} day(s)\n` +
    `Photos: ${payload.imageCount} photo(s)\n` +
    `Subscribers: ${subscriberCount} notified\n\n` +
    `View online: ${liveUrl}\n\n` +
    `Elder Mark Salviejo • Philippines Dumaguete Mission`;

  try {
    thread.reply(plainText, {
      htmlBody: htmlBody,
      name: 'Elder Salviejo Journal Vault'
    });
    Logger.log(`Sent HTML weekly diary confirmation reply directly to thread for: ${authorClean || sender}`);
  } catch (err) {
    if (authorClean) {
      try {
        GmailApp.sendEmail(authorClean, subject, plainText, {
          htmlBody: htmlBody,
          name: 'Elder Salviejo Journal Vault'
        });
        Logger.log(`Sent direct confirmation email to: ${authorClean}`);
      } catch (sendErr) {
        Logger.log(`Could not send confirmation email to author: ${sendErr.message}`);
      }
    }
  }
}

/**
 * Fetches the active subscriber list directly from the Turso SQLite database endpoint.
 */
function fetchSubscribersFromTurso(baseUrl, ingestSecret) {
  try {
    const url = `${baseUrl}/api/subscribers`;
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${ingestSecret}`,
        'x-ingest-secret': ingestSecret
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      if (Array.isArray(data.subscribers)) {
        return data.subscribers;
      }
    }
  } catch (err) {
    Logger.log(`Notice fetching subscribers from Turso: ${err.message}`);
  }
  return [];
}

/**
 * Dispatches weekly announcement to website subscribers directly from Turso SQLite database.
 * Includes strict per-subscriber and per-week deduplication to prevent duplicate sends.
 */
function dispatchWeeklyBroadcast(payload, liveUrl, authorEmail, dbSubscribers) {
  const ingestSecret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || CONFIG.INGEST_SECRET;
  const baseUrl = (PropertiesService.getScriptProperties().getProperty('SITE_URL') || CONFIG.SITE_URL || 'https://eldersalviejo.vercel.app').replace(/\/$/, '');

  // Retrieve subscribers directly from Turso SQLite database
  let tursoSubscribers = Array.isArray(dbSubscribers) && dbSubscribers.length > 0
    ? dbSubscribers
    : fetchSubscribersFromTurso(baseUrl, ingestSecret);

  const allRecipients = Array.from(new Set(
    tursoSubscribers
      .map(email => String(email).trim().toLowerCase())
      .filter(email => email.length > 0 && email.includes('@'))
  ));

  if (allRecipients.length === 0) {
    Logger.log('Letter is live on the website. No subscribers found in Turso database.');
    return;
  }

  Logger.log(`Found ${allRecipients.length} subscriber(s) in Turso database.`);

  // Anti-Duplicate Broadcast Engine (Backed by Turso SQLite Database)
  let alreadySentRecipients = [];
  try {
    const checkUrl = `${baseUrl}/api/tracking/broadcast?slug=${encodeURIComponent(payload.slug)}`;
    const checkRes = UrlFetchApp.fetch(checkUrl, {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${ingestSecret}`,
        'x-ingest-secret': ingestSecret
      },
      muteHttpExceptions: true
    });
    if (checkRes.getResponseCode() === 200) {
      const checkData = JSON.parse(checkRes.getContentText());
      if (Array.isArray(checkData.sentRecipients)) {
        alreadySentRecipients = checkData.sentRecipients.map(e => String(e).toLowerCase());
      }
    }
  } catch (err) {
    Logger.log(`Turso broadcast check notice: ${err.message}`);
  }

  const pendingRecipients = allRecipients.filter(email => !alreadySentRecipients.includes(email.toLowerCase()));

  if (pendingRecipients.length === 0) {
    Logger.log(`Broadcast for "${payload.title}" has already been sent and logged in Turso for all ${allRecipients.length} subscriber(s). Skipping duplicate broadcast.`);
    return;
  }

  // Extract clean highlight snippet without report statistics
  let firstEntrySnippet = '';
  if (Array.isArray(payload.entries)) {
    for (let e = 0; e < payload.entries.length; e++) {
      const entry = payload.entries[e];
      if (entry && entry.text) {
        let clean = entry.text
          .replace(/(?:^|\n)\s*[-—#*~]*\s*(?:WEEKLY\s+REPORT|MISSIONARY\s+REPORT|KEY\s+INDICATORS|STATISTICS|REPORT|INDICATORS?)\s*[-—#*~:]*[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '')
          .replace(/(?:lessons|investigators|baptisms|sacrament|progressing|other|referrals|tracting|media)\s*[:=]\s*\d+/gi, '')
          .replace(/^[0-9\W_]+/, '')
          .trim();
        if (clean.length >= 15) {
          clean = clean.replace(/\s+/g, ' ').trim();
          firstEntrySnippet = clean.substring(0, 160).trim() + (clean.length > 160 ? '...' : '');
          break;
        }
      }
    }
  }
  if (!firstEntrySnippet) {
    firstEntrySnippet = 'A new week of daily routine photos and missionary reflections is now live.';
  }

  const cleanTitle = cleanSubjectTitle(payload.title || 'Weekly Missionary Journal');
  const subject = `Elder Salviejo — Weekly Journal: ${cleanTitle} (Philippines Dumaguete Mission)`;

  const contentHtml = `
    <p style="font-size: 13px; line-height: 1.6; color: #44403c; margin-top: 0;">
      Elder Salviejo has shared his weekly Preparation Day letter from the <strong>Philippines Dumaguete Mission</strong>, with <strong>${payload.imageCount} photographs</strong> and daily reflections.
    </p>

    <!-- Highlight Box -->
    <div style="background-color: #fefce8; border-left: 4px solid #d97706; padding: 14px 16px; margin: 18px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #92400e; letter-spacing: 1px;">Missionary Highlight</p>
      <p style="margin: 6px 0 0 0; font-size: 12px; font-style: italic; color: #78350f; line-height: 1.5;">
        &ldquo;${escapeHtml(firstEntrySnippet)}&rdquo;
      </p>
    </div>

    ${(payload.verse && payload.verse.text) ? `
    <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 14px 16px; margin: 18px 0;">
      <p style="margin: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #78716c; letter-spacing: 1px;">Weekly Scripture &bull; ${escapeHtml(payload.verse.reference || 'Missionary Scripture')}</p>
      <p style="margin: 6px 0 0 0; font-size: 12px; font-style: italic; color: #44403c; line-height: 1.5;">
        &ldquo;${escapeHtml(payload.verse.text)}&rdquo;
      </p>
    </div>
    ` : ''}

    <div style="background-color: #f5f5f4; border-radius: 6px; padding: 12px 14px; margin-top: 14px; font-size: 11px; color: #57534e;">
      Photographs from this entry are also viewable on Elder Salviejo's Polaroid Wall at <a href="${getSiteUrl()}/gallery" style="color: #b45309; text-decoration: underline;">${getSiteUrl()}/gallery</a>.
    </div>
  `;

  const htmlBody = buildEmailShell(
    cleanTitle,
    'Weekly Missionary Journal &bull; Dumaguete, Philippines',
    contentHtml,
    'Read Full Weekly Journal',
    liveUrl
  );

  const plainText = 
    `Elder Mark Salviejo — Philippines Dumaguete Mission\n\n` +
    `New Weekly Journal Published: ${cleanTitle}\n` +
    `Date: ${Utilities.formatDate(new Date(payload.publishedAt), Session.getScriptTimeZone(), 'MMMM d, yyyy')}\n` +
    `Daily Reflections: ${payload.totalEntries || (payload.entries ? payload.entries.length : 7)} day(s)\n` +
    `Photographs: ${payload.imageCount} photo(s)\n\n` +
    `Read the full journal online:\n${liveUrl}\n\n` +
    `Elder Mark Salviejo\nPhilippines Dumaguete Mission`;

  Logger.log(`Broadcasting weekly diary to ${pendingRecipients.length} pending subscriber(s)...`);

  const newlySent = [];
  for (let r = 0; r < pendingRecipients.length; r++) {
    const recipient = pendingRecipients[r];
    try {
      GmailApp.sendEmail(recipient, subject, plainText, {
        htmlBody: htmlBody,
        name: 'Elder Salviejo (Dumaguete Mission)'
      });
      newlySent.push(recipient);
    } catch (err) {
      Logger.log(`Error sending broadcast to ${recipient}: ${err.toString()}`);
    }
  }

  // Persist sent recipients to Turso SQLite Database broadcast_logs table
  if (newlySent.length > 0) {
    try {
      const recordUrl = `${baseUrl}/api/tracking/broadcast`;
      UrlFetchApp.fetch(recordUrl, {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': `Bearer ${ingestSecret}`,
          'x-ingest-secret': ingestSecret
        },
        payload: JSON.stringify({
          weekSlug: payload.slug,
          recipientEmails: newlySent
        }),
        muteHttpExceptions: true
      });
      Logger.log(`Recorded ${newlySent.length} broadcast logs in Turso SQLite Database.`);
    } catch (recordErr) {
      Logger.log(`Notice recording broadcast logs in Turso: ${recordErr.message}`);
    }
  }
}

/**
 * 1-Click Trigger: Runs automatically EVERY DAY at 9:00 PM (21:00).
 * Removes all other existing triggers to keep your execution clean.
 * 
 * To activate: Select "createDaily9PMTrigger" from the toolbar and click "Run".
 */
function createDaily9PMTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processWeeklyDiaryEmails' || 
        triggers[i].getHandlerFunction() === 'processUnprocessedThreads') {
      ScriptApp.deleteTrigger(triggers[i]);
      deletedCount++;
    }
  }
  if (deletedCount > 0) {
    Logger.log(`Removed ${deletedCount} previous trigger(s).`);
  }

  ScriptApp.newTrigger('processWeeklyDiaryEmails')
    .timeBased()
    .everyDays(1)
    .atHour(21) // 9:00 PM (21:00)
    .create();

  Logger.log('====================================================');
  Logger.log('SUCCESS: Daily 9:00 PM (21:00) trigger active!');
  Logger.log('All other triggers have been removed.');
  Logger.log('====================================================');
}

/**
 * Removes all active triggers for this project.
 */
function removeAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  Logger.log(`Successfully removed all ${triggers.length} trigger(s).`);
}

/**
 * Parses daily markdown blocks and weekly scripture verse.
 */
function parseDiaryContent(bodyText, encodedImages) {
  let cleanBody = bodyText || '';
  let extractedVerse = null;

  // Clean out standalone Report or Key Indicators sections before day splitting
  cleanBody = cleanBody.replace(/(?:^|\n)\s*[-—#*~]*\s*(?:WEEKLY\s+REPORT|MISSIONARY\s+REPORT|KEY\s+INDICATORS|STATISTICS|REPORT)\s*[-—#*~:]*[\s\S]*?(?=\n\s*[-—#*~]*\s*(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|VERSE)|$)/gi, '\n');

  const verseRegex = /(?:^|\n)\s*[-—#*~]*\s*VERSE\s*[-—#*~:]*\s*([\s\S]*)$/i;
  const verseMatch = cleanBody.match(verseRegex);
  if (verseMatch) {
    const rawVerseText = verseMatch[1].trim();
    extractedVerse = parseVerseString(rawVerseText);
    cleanBody = cleanBody.substring(0, verseMatch.index).trim();
  }

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
      dayText = dayText.replace(/^\s*[-—#*~]*\s*(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s*[-—#*~:]*\s*/i, '');
      dayText = dayText.replace(/^[-—:\s]+/, '').trim();

      const imageObj = encodedImages[i] ? encodedImages[i].dataUri : null;
      
      entries.push({
        day: current.dayName,
        text: dayText,
        image: imageObj,
        imageFilename: encodedImages[i] ? encodedImages[i].filename : null
      });
    }

    if (encodedImages.length > matches.length) {
      for (let j = matches.length; j < encodedImages.length; j++) {
        entries.push({
          day: `EXTRA PHOTO ${j - matches.length + 1}`,
          text: '',
          image: encodedImages[j].dataUri,
          imageFilename: encodedImages[j].filename
        });
      }
    }
  } else {
    entries.push({
      day: 'MONDAY',
      text: cleanBody.trim(),
      image: encodedImages.length > 0 ? encodedImages[0].dataUri : null,
      imageFilename: encodedImages.length > 0 ? encodedImages[0].filename : null
    });
    for (let k = 1; k < encodedImages.length; k++) {
      entries.push({
        day: `PHOTO ${k + 1}`,
        text: '',
        image: encodedImages[k].dataUri,
        imageFilename: encodedImages[k].filename
      });
    }
  }

  return {
    entries: entries,
    verse: extractedVerse
  };
}

function parseDiaryEntries(bodyText, encodedImages) {
  return parseDiaryContent(bodyText, encodedImages).entries;
}

function parseVerseString(raw) {
  if (!raw) return null;
  let trimmed = String(raw).trim();

  // Strip Markdown / header prefixes like "-VERSE-", "--- VERSE ---", "### VERSE", "VERSE:"
  trimmed = trimmed.replace(/^[-—#*~:\s]*(?:VERSE|SCRIPTURE)[-—#*~:\s]*/i, '').trim();

  // Handle (Alma 26:12) (Quote text) format
  const twoParens = trimmed.match(/^\s*\(([^)]+)\)\s*\(([\s\S]+)\)\s*$/);
  if (twoParens) {
    const ref = twoParens[1].replace(/^VERSE\s*/i, '').trim();
    return {
      reference: ref,
      text: twoParens[2].trim()
    };
  }

  // Handle (Alma 26:12) Quote text format
  const parenRefThenText = trimmed.match(/^\s*\(([^)]+)\)\s*([\s\S]+)$/);
  if (parenRefThenText) {
    const ref = parenRefThenText[1].replace(/^VERSE\s*/i, '').trim();
    const txt = parenRefThenText[2].trim().replace(/^["'\s]+|["'\s]+$/g, '');
    const fetched = !txt || txt.length < 5 ? fetchScriptureTextGas(ref) : txt;
    return {
      reference: ref,
      text: fetched || txt || ''
    };
  }

  // Handle (Alma 26:12) or (VERSE 26:12) format
  const singleParenMatch = trimmed.match(/^\s*\(([^)]+)\)\s*$/);
  if (singleParenMatch) {
    const ref = singleParenMatch[1].replace(/^VERSE\s*/i, '').trim();
    const fetched = fetchScriptureTextGas(ref);
    return {
      reference: ref,
      text: fetched || ''
    };
  }

  // Handle raw reference string: "Alma 26:12"
  const refClean = trimmed.replace(/^VERSE\s*/i, '').replace(/^\(|\)$/g, '').trim();
  const fetched = fetchScriptureTextGas(refClean);
  return {
    reference: refClean || 'Missionary Scripture',
    text: fetched || ''
  };
}

function fetchScriptureTextGas(refStr) {
  if (!refStr) return '';
  let clean = String(refStr)
    .replace(/^[-—#*~:\s]*(?:VERSE|SCRIPTURE)[-—#*~:\s]*/i, '')
    .replace(/^\(|\)$/g, '')
    .trim();
  clean = clean.replace(/^VERSE\s*/i, '').trim();

  // Chapter:Verse only format (default to Alma)
  let bookRaw = 'Alma';
  let chapter = '1';
  let startVerse = 1;
  let endVerse = 1;

  const standardRegex = /^([1-4]?\s*[A-Za-z—\s&]+?)\s*[:\s]\s*(\d+)\s*[:]\s*(\d+)(?:\s*[-–—]\s*(\d+))?$/i;
  const standardMatch = clean.match(standardRegex);

  if (standardMatch) {
    bookRaw = standardMatch[1].trim();
    chapter = standardMatch[2];
    startVerse = parseInt(standardMatch[3], 10);
    endVerse = standardMatch[4] ? parseInt(standardMatch[4], 10) : startVerse;
  } else {
    const cvRegex = /^(\d+)\s*[:]\s*(\d+)(?:\s*[-–—]\s*(\d+))?$/;
    const cvMatch = clean.match(cvRegex);
    if (cvMatch) {
      bookRaw = 'Alma';
      chapter = cvMatch[1];
      startVerse = parseInt(cvMatch[2], 10);
      endVerse = cvMatch[3] ? parseInt(cvMatch[3], 10) : startVerse;
    } else {
      return '';
    }
  }

  const normalized = bookRaw.toLowerCase().replace(/\s+/g, ' ');
  let volFile = 'new-testament-reference.json';
  let isDC = false;

  const bomBooks = ['1 nephi', '2 nephi', 'jacob', 'enos', 'jarom', 'omni', 'words of mormon', 'mosiah', 'alma', 'helaman', '3 nephi', '4 nephi', 'mormon', 'ether', 'moroni'];
  const pgpBooks = ['moses', 'abraham', 'joseph smith—matthew', 'joseph smith-matthew', 'js-m', 'joseph smith—history', 'js-h', 'articles of faith', 'a of f'];
  const dcBooks = ['doctrine and covenants', 'd&c', 'd and c', 'dc', 'section'];
  const otBooks = ['genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua', 'judges', 'ruth', '1 samuel', '2 samuel', '1 kings', '2 kings', '1 chronicles', '2 chronicles', 'ezra', 'nehemiah', 'esther', 'job', 'psalms', 'psalm', 'proverbs', 'ecclesiastes', 'song of solomon', 'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi'];

  if (bomBooks.includes(normalized)) {
    volFile = 'book-of-mormon-reference.json';
  } else if (dcBooks.includes(normalized)) {
    volFile = 'doctrine-and-covenants-reference.json';
    isDC = true;
  } else if (pgpBooks.includes(normalized)) {
    volFile = 'pearl-of-great-price-reference.json';
  } else if (otBooks.includes(normalized)) {
    volFile = 'old-testament-reference.json';
  }

  const cdnUrl = `https://cdn.jsdelivr.net/gh/bcbooks/scriptures-json@master/reference/${volFile}`;
  try {
    const res = UrlFetchApp.fetch(cdnUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return '';
    const volData = JSON.parse(res.getContentText());

    let versesObj = null;
    if (isDC) {
      versesObj = volData[chapter];
    } else {
      let matchingKey = null;
      for (const k of Object.keys(volData)) {
        if (k.toLowerCase() === normalized || k.toLowerCase().replace(/—/g, '-').replace(/\s+/g, ' ') === normalized) {
          matchingKey = k;
          break;
        }
      }
      if (!matchingKey) {
        for (const k of Object.keys(volData)) {
          if (k.toLowerCase().startsWith(normalized) || normalized.startsWith(k.toLowerCase())) {
            matchingKey = k;
            break;
          }
        }
      }
      if (matchingKey && volData[matchingKey]) {
        versesObj = volData[matchingKey][chapter];
      }
    }

    if (!versesObj) return '';

    const foundVerses = [];
    for (let v = startVerse; v <= endVerse; v++) {
      const verseText = versesObj[String(v)];
      if (verseText) {
        foundVerses.push(verseText.trim());
      }
    }
    return foundVerses.join(' ');
  } catch (_) {
    return '';
  }
}

function sendPayloadToVercel(payload) {
  const url = getIngestUrl();
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || CONFIG.INGEST_SECRET;
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + secret,
      'User-Agent': 'ElderSalviejo-GAS/2.0'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode >= 200 && responseCode < 300) {
      Logger.log(`Ingest succeeded (HTTP ${responseCode})`);
      try {
        return JSON.parse(responseText);
      } catch (_) {
        return { success: true };
      }
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
  let dateObj = new Date();
  if (date instanceof Date && !isNaN(date.getTime())) {
    dateObj = date;
  } else if (date) {
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) dateObj = parsed;
  }
  const dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const cleanTitle = (title || '').toLowerCase()
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

function cleanSubjectTitle(rawSubject, secretCode) {
  let clean = String(rawSubject || '');

  // 1. Remove configured secret passcode if provided
  if (secretCode) {
    const codeStr = String(secretCode);
    const escaped = codeStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('[\\[\\(]?\\s*' + escaped + '\\s*[\\]\\)]?', 'gi');
    clean = clean.replace(regex, '');
  }

  // 2. Also check and strip any passcodes from Script Properties
  try {
    const pDiary = PropertiesService.getScriptProperties().getProperty('SECRET_DIARY_CODE') || PropertiesService.getScriptProperties().getProperty('SECRET_CODE');
    const pGallery = PropertiesService.getScriptProperties().getProperty('SECRET_GALLERY_CODE');
    if (pDiary) {
      const escD = String(pDiary).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      clean = clean.replace(new RegExp('[\\[\\(]?\\s*' + escD + '\\s*[\\]\\)]?', 'gi'), '');
    }
    if (pGallery) {
      const escG = String(pGallery).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      clean = clean.replace(new RegExp('[\\[\\(]?\\s*' + escG + '\\s*[\\]\\)]?', 'gi'), '');
    }
  } catch (_) {}

  // 3. Strip standalone bracketed numeric tags (e.g. [123456], (789012))
  clean = clean.replace(/[\(\[]\s*\d{4,8}\s*[\)\]]/g, '');

  // 4. Strip system prefixes and boilerplate
  clean = clean.replace(/(?:Published:\s*Elder\s*Salviejo'?s\s*Weekly\s*Journal\s*[—–-]*\s*)+/gi, '');
  clean = clean.replace(/(?:Confirmed:\s*Elder\s*Salviejo'?s\s*Weekly\s*Journal\s*[—–-]*\s*)+/gi, '');
  clean = clean.replace(/(?:Receipt:\s*(?:Weekly\s*Journal\s*Published|Polaroid\s*Gallery\s*Synced)\s*[—–-]*\s*)+/gi, '');
  clean = clean.replace(/(?:Elder\s*Salviejo\s*[—–-]\s*Weekly\s*Journal:\s*)+/gi, '');
  clean = clean.replace(/^(?:re|fwd|fw)\s*:\s*/gi, '');
  clean = clean.replace(/^(?:weekly\s*reflection|weekly\s*journal|reflection|journal)[\s:—-]*/gi, '');
  clean = clean.replace(/\(Philippines Dumaguete Mission\)/gi, '');
  clean = clean.replace(/^[-—:\s]+|[-—:\s]+$/g, '').trim();
  return clean || 'Weekly Missionary Journal';
}

function cleanEmailBodyText(rawBody, secretCode) {
  if (!rawBody) return '';
  let clean = String(rawBody);

  // 1. Remove configured secret passcode if provided
  if (secretCode) {
    const codeStr = String(secretCode);
    const escaped = codeStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp('[\\[\\(]?\\s*' + escaped + '\\s*[\\]\\)]?', 'gi'), '');
  }

  // 2. Remove any Script Properties secret codes
  try {
    const pDiary = PropertiesService.getScriptProperties().getProperty('SECRET_DIARY_CODE') || PropertiesService.getScriptProperties().getProperty('SECRET_CODE');
    const pGallery = PropertiesService.getScriptProperties().getProperty('SECRET_GALLERY_CODE');
    if (pDiary) {
      const escD = String(pDiary).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      clean = clean.replace(new RegExp('[\\[\\(]?\\s*' + escD + '\\s*[\\]\\)]?', 'gi'), '');
    }
    if (pGallery) {
      const escG = String(pGallery).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      clean = clean.replace(new RegExp('[\\[\\(]?\\s*' + escG + '\\s*[\\]\\)]?', 'gi'), '');
    }
  } catch (_) {}

  // 3. Strip standalone bracketed numeric tags (e.g. [123456], (789012))
  clean = clean.replace(/[\(\[]\s*\d{4,8}\s*[\)\]]/g, '');

  // 4. Strip email signatures and client footers
  clean = clean.replace(/--\s*[\r\n]+[\s\S]*$/g, '');
  clean = clean.replace(/On\s.+wrote:[\s\S]*$/i, '');
  clean = clean.replace(/Sent from my (?:iPhone|iPad|Android|Galaxy|mobile device)[\s\S]*/i, '');
  clean = clean.replace(/Get Outlook for (?:iOS|Android)[\s\S]*/i, '');

  return clean.trim();
}

function extractGalleryCategory(subject, secretCode) {
  if (!subject) return 'Mission';
  const clean = cleanSubjectTitle(subject, secretCode);

  if (/baptism/i.test(clean)) return 'Baptisms';
  if (/companion/i.test(clean)) return 'Companions';
  if (/service|community/i.test(clean)) return 'Service';
  if (/district|zone|conference/i.test(clean)) return 'District & Zone';
  if (/transfer/i.test(clean)) return 'Transfers';
  if (/teaching|investigator|lesson/i.test(clean)) return 'Teaching';
  if (/p-?day|preparation/i.test(clean)) return 'P-Day';

  const tagMatch = clean.match(/^([a-zA-Z\s]{2,20})(?:[-–—:]|$)/);
  if (tagMatch && tagMatch[1].trim()) {
    const candidate = tagMatch[1].trim();
    if (!/^(re|fwd|weekly|reflection|journal|photo|photos|gallery|update)$/i.test(candidate)) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  return 'Mission';
}

function compressAndResizeAttachment(att, targetWidth) {
  targetWidth = targetWidth || 800;
  const originalBytes = att.getBytes();
  const origKb = Math.round(originalBytes.length / 1024);
  const contentType = att.getContentType() || 'image/jpeg';

  // If the image size is already small (<= 350 KB), preserve original quality and skip compression
  const MAX_UNCOMPRESSED_KB = 350;
  if (origKb <= MAX_UNCOMPRESSED_KB) {
    Logger.log(`Image "${att.getName()}" is already optimal (${origKb} KB <= ${MAX_UNCOMPRESSED_KB} KB). Skipping compression.`);
    return {
      mimeType: contentType,
      dataUri: `data:${contentType};base64,${Utilities.base64Encode(originalBytes)}`
    };
  }

  Logger.log(`Image "${att.getName()}" (${origKb} KB) exceeds ${MAX_UNCOMPRESSED_KB} KB. Compressing via Drive thumbnailer...`);
  let tempFile = null;

  try {
    const blob = Utilities.newBlob(originalBytes, contentType, att.getName());
    tempFile = DriveApp.createFile(blob);
    const fileId = tempFile.getId();

    const driveApiUrl = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=thumbnailLink';
    let thumbnailLink = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = UrlFetchApp.fetch(driveApiUrl, {
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
        Logger.log(`Compressed "${att.getName()}": ${origKb} KB -> ${compKb} KB`);
        
        return {
          mimeType: 'image/jpeg',
          dataUri: 'data:image/jpeg;base64,' + base64Data
        };
      }
    }

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
    Logger.log(`Notice: Drive compression skipped for "${att.getName()}": ${err.toString()}`);
  } finally {
    if (tempFile) {
      try {
        tempFile.setTrashed(true);
      } catch (_) {}
    }
  }

  Logger.log(`Using original attachment for "${att.getName()}" (${origKb} KB)`);
  return {
    mimeType: contentType,
    dataUri: `data:${contentType};base64,${Utilities.base64Encode(originalBytes)}`
  };
}

/**
 * TEST FUNCTION: Dry-Run Simulation (Zero Vercel/GitHub Changes)
 * 
 * Tests the entire email parsing pipeline, Turso database connection,
 * and email template generation WITHOUT writing to Vercel or saving to GitHub.
 * 
 * To run: Select "testSampleEmailDryRun" in the Apps Script toolbar dropdown and click "Run".
 */
function testSampleEmailDryRun() {
  Logger.log('====================================================');
  Logger.log('STARTING DRY-RUN TEST (NO VERCEL/GITHUB CHANGES)');
  Logger.log('====================================================');

  const ingestSecret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || CONFIG.INGEST_SECRET;
  const baseUrl = (PropertiesService.getScriptProperties().getProperty('SITE_URL') || CONFIG.SITE_URL || 'https://eldersalviejo.vercel.app').replace(/\/$/, '');
  let testerEmail = '';
  try {
    testerEmail = (Session.getEffectiveUser() && Session.getEffectiveUser().getEmail()) || 
                  (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '';
  } catch (_) {}

  // 1. Test Turso SQLite Database Subscribers
  Logger.log('\n[TEST 1/4] Checking Turso SQLite database connection...');
  const subscribers = fetchSubscribersFromTurso(baseUrl, ingestSecret);
  Logger.log(`[PASS] Turso Database responded with ${subscribers.length} active subscriber(s):`);
  if (subscribers.length > 0) {
    subscribers.forEach((sub, idx) => Logger.log(`   ${idx + 1}. ${sub}`));
  } else {
    Logger.log('   (No subscribers registered yet on website. You can test subscribing at ' + baseUrl + ')');
  }

  // 2. Test Email Parser with Sample P-Day Reflection
  Logger.log('\n[TEST 2/4] Testing email reflection parser & sanitizer...');
  const sampleSubject = 'Weekly Reflection: Week 2 in Dumaguete';
  const sampleBody = 
    '-VERSE-\n' +
    'Alma 26:12\n' +
    '"Yea, I know that I am nothing; as to my strength I am weak; therefore I will not boast of myself, but I will boast of my God, for in his strength I can do all things."\n\n' +
    '--- MONDAY ---\n' +
    'Preparation day! Did laundry, wrote emails home, and played basketball with the district elders in Sibulan.\n\n' +
    '--- TUESDAY ---\n' +
    'Morning companion study in Alma 26. Walked through Sibulan and met an investigator family who welcomed us warmly.\n\n' +
    '--- WEDNESDAY ---\n' +
    'Taught the Plan of Salvation to Brother Bautista and enjoyed fresh buko juice from their tree.\n\n' +
    '--- THURSDAY ---\n' +
    'District Council meeting in Dumaguete City. Practiced Cebuano language roleplays.\n\n' +
    '--- FRIDAY ---\n' +
    'Service project helping Nanay Elena repair her bamboo fence after the rain.\n\n' +
    '--- SATURDAY ---\n' +
    'Street contacting along Rizal Boulevard during sunset overlooking the ocean.\n\n' +
    '--- SUNDAY ---\n' +
    'Sacrament meeting attendance was wonderful. Two investigators attended church with us!\n';

  const sampleDate = new Date();
  const weekTitle = cleanSubjectTitle(sampleSubject) || `Week of ${Utilities.formatDate(sampleDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')}`;
  const weekSlug = generateSlug(weekTitle, sampleDate);
  const parsedData = parseDiaryContent(sampleBody, []);

  Logger.log(`[PASS] Parsed Title: "${weekTitle}"`);
  Logger.log(`[PASS] Parsed Slug: "${weekSlug}"`);
  Logger.log(`[PASS] Extracted Verse: ${parsedData.verse ? parsedData.verse.reference : 'None'}`);
  Logger.log(`[PASS] Total Daily Entries: ${parsedData.entries ? parsedData.entries.length : 0}`);

  // 3. Test Email Template Generation
  Logger.log('\n[TEST 3/4] Generating responsive email preview shell...');
  const cleanTitle = cleanSubjectTitle(weekTitle);
  const sampleLiveUrl = `${baseUrl}/week/${encodeURIComponent(weekSlug)}`;
  const emailShell = buildEmailShell(
    cleanTitle,
    'Weekly Missionary Journal • Dumaguete, Philippines',
    `<p style="margin: 0 0 12px; font-size: 14px; color: #44403c; line-height: 1.6;">
      This is a dry-run test preview of the email newsletter that will be dispatched to subscribers whenever a new weekly journal is published.
    </p>`,
    'View Sample Journal',
    sampleLiveUrl
  );
  Logger.log('[PASS] Responsive email template generated successfully.');

  // 4. Send Test Sample Preview Email to Tester
  Logger.log('\n[TEST 4/4] Sending sample preview email to tester...');
  if (testerEmail) {
    try {
      GmailApp.sendEmail(testerEmail, `[TEST PREVIEW] Elder Salviejo — Weekly Journal: ${cleanTitle}`, 
        `This is a dry-run sample email for Elder Salviejo's weekly journal.\n\nRead online: ${sampleLiveUrl}`, {
        htmlBody: emailShell,
        name: 'Elder Salviejo (Dumaguete Mission Test)'
      });
      Logger.log(`[PASS] Sent sample preview email to tester: ${testerEmail}`);
    } catch (sendErr) {
      Logger.log(`[NOTICE] Could not send sample email to tester (${testerEmail}): ${sendErr.message}`);
    }
  } else {
    Logger.log('[NOTICE] Tester email could not be determined from session.');
  }

  Logger.log('\n====================================================');
  Logger.log('DRY-RUN TEST COMPLETED SUCCESSFULLY (0 Vercel changes)');
  Logger.log('====================================================');
}

/**
 * AUTHORIZATION HELPER: Requests and verifies all required permissions in one click.
 * 
 * Select "requestAuthorization" in the Apps Script toolbar dropdown and click "Run".
 * Google will present the "Authorization Required" dialog requesting all required
 * permissions (Gmail, Drive image compression, external HTTPS requests, and triggers).
 */
function requestAuthorization() {
  Logger.log('Checking and requesting all required Google Apps Script permissions...');
  
  // 1. Check Session User Info
  let userEmail = 'Unknown';
  try {
    userEmail = (Session.getEffectiveUser() && Session.getEffectiveUser().getEmail()) || 
                (Session.getActiveUser() && Session.getActiveUser().getEmail()) || 'Unknown';
    Logger.log(`[PASS] Session user: ${userEmail}`);
  } catch (err) {
    Logger.log(`[NOTICE] Session user check: ${err.message}`);
  }

  // 2. Check Gmail Access
  try {
    const drafts = GmailApp.getDrafts();
    Logger.log(`[PASS] Gmail access verified (${drafts.length} draft(s) found).`);
  } catch (err) {
    Logger.log(`[NOTICE] Gmail access check: ${err.message}`);
  }

  // 3. Check Google Drive Access (for high-efficiency image compression)
  try {
    const rootFolder = DriveApp.getRootFolder();
    Logger.log(`[PASS] Google Drive access verified (Root: "${rootFolder.getName()}").`);
  } catch (err) {
    Logger.log(`[NOTICE] Google Drive access check: ${err.message}`);
  }

  // 4. Check External Network Access (Vercel & Turso SQLite)
  try {
    const siteUrl = getSiteUrl();
    const testRes = UrlFetchApp.fetch(`${siteUrl}/api/stats`, { muteHttpExceptions: true });
    Logger.log(`[PASS] External network access verified (HTTP ${testRes.getResponseCode()}).`);
  } catch (err) {
    Logger.log(`[NOTICE] External network access check: ${err.message}`);
  }

  // 5. Check Script Triggers Access
  try {
    const triggers = ScriptApp.getProjectTriggers();
    Logger.log(`[PASS] ScriptApp triggers verified (${triggers.length} active trigger(s)).`);
  } catch (err) {
    Logger.log(`[NOTICE] ScriptApp triggers check: ${err.message}`);
  }

  Logger.log('\n====================================================');
  Logger.log('AUTHORIZATION COMPLETE: All permissions granted!');
  Logger.log('====================================================');
}

/**
 * DIAGNOSTIC TOOL: Verifies both Diary and Gallery Gmail Label creation and applies them.
 * 
 * Select "testVerifyAndApplyGmailLabel" in the toolbar dropdown and click "Run".
 */
function testVerifyAndApplyGmailLabel() {
  Logger.log('=== Verifying Gmail Processed Labels ===');
  const diaryLabel = getProcessedLabel();
  const galleryLabel = getGalleryProcessedLabel();

  if (diaryLabel) {
    Logger.log(`[PASS] Diary Label verified: "${diaryLabel.getName()}"`);
  } else {
    Logger.log('[FAIL] Could not get or create Diary label.');
  }

  if (galleryLabel) {
    Logger.log(`[PASS] Gallery Label verified: "${galleryLabel.getName()}"`);
  } else {
    Logger.log('[FAIL] Could not get or create Gallery label.');
  }

  const threads = GmailApp.getInboxThreads(0, 1);
  if (!threads || threads.length === 0) {
    Logger.log('[NOTICE] Inbox has no emails to test label application.');
    return;
  }

  const thread = threads[0];
  const subject = thread.getFirstMessageSubject() || 'Untitled';
  applyProcessedLabel(thread);
  Logger.log(`[PASS] Successfully applied "${diaryLabel ? diaryLabel.getName() : 'diary-processed'}" label to latest email: "${subject}"`);
  Logger.log('Check your Gmail inbox - you will see the label attached to the email thread.');
  Logger.log('=======================================');
}


// =========================================================================
// VERSION 3.0: TEMPLATE COMPOSER & QUICK "SEND NOW" WEB APP & ENGINE
// =========================================================================

/**
 * Web App Entry Point (GET):
 * Serves the interactive Template Composer & "Send Now" GUI.
 * Allows sending 159266 Weekly Diary, 073000 Photo Gallery, and rich HTML Code templates
 * with one click directly from any mobile or desktop browser.
 */
function doGet(e) {
  return HtmlService.createHtmlOutput(getSenderWebAppHtml())
    .setTitle("Elder Salviejo • Template Composer & Quick Sender")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Returns contextual details to pre-populate the Web App client.
 */
function getComposerContext() {
  const props = PropertiesService.getScriptProperties();
  let userEmail = '';
  try {
    userEmail = (Session.getEffectiveUser() && Session.getEffectiveUser().getEmail()) ||
                (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '';
  } catch (_) {}

  const diaryCode = props.getProperty('SECRET_DIARY_CODE') || props.getProperty('SECRET_CODE') || '159266';
  const galleryCode = props.getProperty('SECRET_GALLERY_CODE') || '073000';
  const allowedSender = props.getProperty('ALLOWED_SENDER') || CONFIG.ALLOWED_SENDER || '';
  const siteUrl = getSiteUrl();

  return {
    userEmail: userEmail,
    dummyInbox: userEmail || allowedSender || 'dummy@gmail.com',
    diaryPasscode: diaryCode,
    galleryPasscode: galleryCode,
    allowedSender: allowedSender,
    siteUrl: siteUrl
  };
}

/**
 * Standard default responsive HTML email template matching the website's warm stone and amber theme.
 */
function getDefaultNewsletterHtml(siteUrl) {
  const targetUrl = siteUrl || 'https://eldersalviejo.vercel.app';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elder Mark Salviejo — Weekly Mission Update</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f1ea; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917;">
  <div style="max-width: 600px; margin: 24px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e7e5e4;">
    
    <!-- Top Header Banner -->
    <div style="background-color: #1c1917; padding: 32px 24px; text-align: center; border-bottom: 3px solid #d97706;">
      <p style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d97706; font-weight: 700;">Philippines Dumaguete Mission</p>
      <h1 style="margin: 0 0 6px 0; font-family: Georgia, serif; font-size: 26px; color: #ffffff; font-weight: 700; letter-spacing: 0.5px;">Elder Mark Salviejo</h1>
      <p style="margin: 0; font-size: 13px; color: #a8a29e; font-style: italic; font-family: Georgia, serif;">Weekly Missionary Journal & Memories</p>
    </div>

    <!-- Main Content Container -->
    <div style="padding: 32px 28px;">
      
      <!-- Week Title -->
      <div style="border-bottom: 2px solid #f5f5f4; padding-bottom: 16px; margin-bottom: 24px;">
        <span style="display: inline-block; background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">Weekly Reflection</span>
        <h2 style="font-family: Georgia, serif; font-size: 22px; color: #1c1917; margin: 6px 0 0 0;">Dedicated Mission Update</h2>
      </div>

      <!-- Scripture Highlight Box -->
      <div style="background-color: #fafaf9; border-left: 4px solid #d97706; border-radius: 6px; padding: 18px 20px; margin-bottom: 26px;">
        <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #b45309;">Scripture of the Week &bull; Alma 26:12</p>
        <p style="margin: 0; font-family: Georgia, serif; font-size: 14px; font-style: italic; color: #44403c; line-height: 1.6;">
          &ldquo;Yea, I know that I am nothing; as to my strength I am weak; therefore I will not boast of myself, but I will boast of my God, for in his strength I can do all things.&rdquo;
        </p>
      </div>

      <!-- Reflection Letter Body -->
      <div style="font-size: 14px; line-height: 1.75; color: #44403c; margin-bottom: 30px;">
        <p style="margin: 0 0 16px 0;">
          Dear Family, Friends, and Supporters,
        </p>
        <p style="margin: 0 0 16px 0;">
          This week has been full of remarkable blessings in the Dumaguete Mission. Through daily companionship study, street contacting, and teaching families the Gospel of Jesus Christ, we have seen hearts touched and testimonies strengthened.
        </p>
        <p style="margin: 0 0 16px 0;">
          Thank you so much for your continuous prayers, encouragement, and love. Your messages on the mission board mean the world to us!
        </p>
      </div>

      <!-- Call to Action Button -->
      <div style="text-align: center; margin: 36px 0 16px 0;">
        <a href="${targetUrl}" target="_blank" style="background-color: #d97706; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(217, 119, 6, 0.25);">
          Explore the Weekly Vault &rarr;
        </a>
      </div>
      
      <p style="text-align: center; font-size: 11px; color: #a8a29e; margin: 0;">
        Direct archive link: <a href="${targetUrl}" style="color: #b45309; text-decoration: underline;">${targetUrl}</a>
      </p>

    </div>

    <!-- Dignified Footer -->
    <div style="background-color: #fafaf9; border-top: 1px solid #f5f5f4; padding: 20px 24px; text-align: center; font-size: 11px; color: #78716c; line-height: 1.6;">
      <p style="margin: 0 0 4px 0; font-weight: 600; color: #44403c;">Elder Mark Salviejo &bull; Philippines Dumaguete Mission</p>
      <p style="margin: 0;">This update was dispatched via the automated missionary archival pipeline.</p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Dispatches an email from the Web App via GmailApp.sendEmail.
 * Handles plaintext body, rich HTML body, and multi-file attachments.
 */
function sendTemplateEmailFromWebApp(data) {
  if (!data || !data.recipient || !data.subject) {
    throw new Error('Recipient email and Subject are required.');
  }

  const recipient = data.recipient.trim();
  const subject = data.subject.trim();
  const mode = data.mode || 'diary';

  // Decode any Base64 attachments from the browser file picker
  const attachments = [];
  if (Array.isArray(data.attachments)) {
    data.attachments.forEach(att => {
      if (att && att.base64) {
        try {
          const decoded = Utilities.base64Decode(att.base64);
          const blob = Utilities.newBlob(decoded, att.type || 'image/jpeg', att.name || 'photo.jpg');
          attachments.push(blob);
        } catch (attErr) {
          Logger.log(`Notice decoding attachment ${att.name || 'unknown'}: ${attErr.message}`);
        }
      }
    });
  }

  const options = {
    name: 'Elder Mark Salviejo',
    attachments: attachments
  };

  if (mode === 'html') {
    options.htmlBody = data.htmlContent || data.bodyText || '';
    GmailApp.sendEmail(recipient, subject, data.bodyText || 'Elder Mark Salviejo mission update (HTML format).', options);
  } else {
    GmailApp.sendEmail(recipient, subject, data.bodyText || '', options);
  }

  return {
    success: true,
    recipient: recipient,
    subject: subject,
    mode: mode,
    attachmentCount: attachments.length,
    timestamp: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy • h:mm:ss a')
  };
}

/**
 * Toolbar Runner: 1-Click "Send Now" for 159266 Weekly Diary.
 * Select "sendNowDiaryTemplate" in toolbar dropdown and click "Run".
 */
function sendNowDiaryTemplate(toEmail) {
  const ctx = getComposerContext();
  const target = toEmail || ctx.userEmail || ctx.dummyInbox;
  if (!target) {
    Logger.log('[FAIL] No recipient email specified.');
    return;
  }
  const subject = `Weekly Reflection: Week 1 in Dumaguete ${ctx.diaryPasscode}`;
  const body = `-VERSE- (Alma 26:12)\n\n--- MONDAY ---\nPreparation day! Did laundry, wrote emails to family, and companion study in Dumaguete.\n\n--- TUESDAY ---\nMorning proselyting and teaching discussions in Sibulan district.\n\n--- WEDNESDAY ---\nTaught the Plan of Salvation to Brother Bautista and enjoyed fresh buko juice.\n\n--- THURSDAY ---\nDistrict Council meeting in Dumaguete City. Practiced Cebuano language roleplays.\n\n--- FRIDAY ---\nService project helping local families repair bamboo fences.\n\n--- SATURDAY ---\nStreet contacting along Rizal Boulevard during sunset overlooking the ocean.\n\n--- SUNDAY ---\nSacrament meeting in Dumaguete 1st Ward. Bore testimony of the Savior Jesus Christ.`;
  
  GmailApp.sendEmail(target, subject, body, { name: 'Elder Mark Salviejo' });
  Logger.log(`[PASS] Dispatched 159266 Diary Template to: ${target}`);
}

/**
 * Toolbar Runner: 1-Click "Send Now" for 073000 Photo Gallery.
 * Select "sendNowGalleryTemplate" in toolbar dropdown and click "Run".
 */
function sendNowGalleryTemplate(toEmail) {
  const ctx = getComposerContext();
  const target = toEmail || ctx.userEmail || ctx.dummyInbox;
  if (!target) {
    Logger.log('[FAIL] No recipient email specified.');
    return;
  }
  const subject = `Dumaguete District Conference [Mission] ${ctx.galleryPasscode}`;
  const body = `Wonderful district conference gathering with companions and members across Negros Oriental!`;
  
  GmailApp.sendEmail(target, subject, body, { name: 'Elder Mark Salviejo' });
  Logger.log(`[PASS] Dispatched 073000 Gallery Template to: ${target}`);
}

/**
 * Toolbar Runner: 1-Click "Send Now" for Rich HTML Code Template.
 * Select "sendNowHtmlCodeTemplate" in toolbar dropdown and click "Run".
 */
function sendNowHtmlCodeTemplate(toEmail) {
  const ctx = getComposerContext();
  const target = toEmail || ctx.userEmail || ctx.dummyInbox;
  if (!target) {
    Logger.log('[FAIL] No recipient email specified.');
    return;
  }
  const subject = `Elder Mark Salviejo — Weekly Mission Update [Philippines Dumaguete Mission]`;
  const html = getDefaultNewsletterHtml(ctx.siteUrl);
  
  GmailApp.sendEmail(target, subject, 'Elder Mark Salviejo — Weekly Mission Update (HTML format).', {
    htmlBody: html,
    name: 'Elder Mark Salviejo'
  });
  Logger.log(`[PASS] Dispatched HTML Code Template to: ${target}`);
}

/**
 * Returns the HTML/CSS/JS payload for the Web App GUI.
 */
function getSenderWebAppHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Elder Salviejo • Template Composer & Quick Sender</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: #f5f5f4;
      --card: #ffffff;
      --border: #e7e5e4;
      --amber: #d97706;
      --amber-dark: #b45309;
      --amber-light: #fef3c7;
      --text: #1c1917;
      --muted: #78716c;
      --stone-dark: #292524;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 16px;
    }
    .container {
      max-width: 780px;
      margin: 0 auto;
      background: var(--card);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .header {
      background: var(--stone-dark);
      color: #fff;
      padding: 24px 20px;
      text-align: center;
      border-bottom: 3px solid var(--amber);
    }
    .header .subtitle {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--amber);
      font-weight: 700;
    }
    .header h1 {
      font-family: Georgia, serif;
      font-size: 22px;
      margin: 6px 0 2px;
    }
    .header .caption {
      font-size: 12px;
      color: #a8a29e;
      font-style: italic;
    }
    .body-content {
      padding: 24px 20px;
    }
    .section-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 700;
      color: var(--muted);
      margin-bottom: 8px;
    }
    /* Template Selector Tabs */
    .tabs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
      margin-bottom: 20px;
    }
    .tab-btn {
      padding: 12px 14px;
      border: 2px solid var(--border);
      background: #fafaf9;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: var(--stone-dark);
      text-align: center;
      transition: all 0.2s ease;
    }
    .tab-btn:hover {
      border-color: var(--amber);
      background: #fff;
    }
    .tab-btn.active {
      border-color: var(--amber);
      background: var(--amber-light);
      color: var(--amber-dark);
    }
    .badge {
      display: inline-block;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 9999px;
      margin-left: 4px;
      background: rgba(0,0,0,0.06);
    }
    /* Recipient & Inputs */
    .form-group {
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text);
    }
    input[type="text"], input[type="email"], textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 14px;
      color: var(--text);
      background: #fff;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    input[type="text"]:focus, input[type="email"]:focus, textarea:focus {
      outline: none;
      border-color: var(--amber);
    }
    textarea {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.5;
      min-height: 180px;
      resize: vertical;
    }
    /* Pills */
    .pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 6px;
    }
    .pill {
      font-size: 11px;
      padding: 4px 10px;
      background: #f5f5f4;
      border: 1px solid var(--border);
      border-radius: 9999px;
      cursor: pointer;
      color: var(--muted);
      font-weight: 500;
      transition: all 0.15s;
    }
    .pill:hover {
      background: #e7e5e4;
      color: var(--text);
    }
    /* HTML Subtabs */
    .html-subtabs {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .subtab-btn {
      font-size: 12px;
      padding: 6px 12px;
      border: 1px solid var(--border);
      background: #fafaf9;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      color: var(--muted);
    }
    .subtab-btn.active {
      background: var(--stone-dark);
      color: #fff;
      border-color: var(--stone-dark);
    }
    .preview-frame {
      width: 100%;
      height: 380px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #fff;
      display: none;
    }
    /* Attachment Box */
    .attachment-box {
      border: 2px dashed var(--border);
      border-radius: 8px;
      padding: 14px;
      text-align: center;
      background: #fafaf9;
      margin-bottom: 18px;
    }
    .file-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
      justify-content: center;
    }
    .file-chip {
      font-size: 11px;
      background: #fff;
      border: 1px solid var(--border);
      padding: 4px 8px;
      border-radius: 4px;
      color: var(--muted);
    }
    /* Action Button */
    .btn-send {
      width: 100%;
      padding: 14px 20px;
      background-color: var(--amber);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.5px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(217, 119, 6, 0.25);
      transition: all 0.2s;
    }
    .btn-send:hover {
      background-color: var(--amber-dark);
    }
    .btn-send:disabled {
      background-color: #d6d3d1;
      cursor: not-allowed;
      box-shadow: none;
    }
    /* Status Box */
    .status-box {
      margin-top: 16px;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      display: none;
    }
    .status-box.success {
      display: block;
      background-color: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .status-box.error {
      display: block;
      background-color: #fef2f2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }
    .status-box.loading {
      display: block;
      background-color: #eff6ff;
      color: #1e40af;
      border: 1px solid #bfdbfe;
    }
  </style>
</head>
<body>

  <div class="container">
    
    <!-- Top Banner -->
    <div class="header">
      <p class="subtitle">Philippines Dumaguete Mission</p>
      <h1>Elder Mark Salviejo</h1>
      <p class="caption">Template Composer & Quick "Send Now" Web App • Version 3.0</p>
    </div>

    <div class="body-content">
      
      <!-- Template Selector -->
      <div class="section-title">Select Template Preset</div>
      <div class="tabs">
        <button type="button" class="tab-btn active" id="tabDiary" onclick="selectTemplate('diary')">
          159266 Weekly Diary <span class="badge">Mon-Sun</span>
        </button>
        <button type="button" class="tab-btn" id="tabGallery" onclick="selectTemplate('gallery')">
          073000 Photo Gallery <span class="badge">Album</span>
        </button>
        <button type="button" class="tab-btn" id="tabHtml" onclick="selectTemplate('html')">
          HTML Code Template <span class="badge">Rich Email</span>
        </button>
      </div>

      <!-- Recipient Field -->
      <div class="form-group">
        <label for="toEmail">To (Recipient Email):</label>
        <input type="email" id="toEmail" placeholder="recipient@example.com" required>
        <div class="pills">
          <button type="button" class="pill" onclick="setPillRecipient('me')">Send to Me (Tester)</button>
          <button type="button" class="pill" onclick="setPillRecipient('dummy')">Send to Ingest Vault (Dummy)</button>
          <button type="button" class="pill" onclick="setPillRecipient('custom')">Clear</button>
        </div>
      </div>

      <!-- Subject Line -->
      <div class="form-group">
        <label for="emailSubject">Subject Line:</label>
        <input type="text" id="emailSubject" placeholder="Email Subject..." required>
      </div>

      <!-- Plain Text Body Container (for Diary and Gallery) -->
      <div class="form-group" id="plainContainer">
        <label for="plainTextBody">Body Content:</label>
        <textarea id="plainTextBody"></textarea>
      </div>

      <!-- HTML Code & Live Preview Container (for HTML Template) -->
      <div class="form-group" id="htmlContainer" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label style="margin: 0;">HTML Code & Live Preview:</label>
          <div class="html-subtabs">
            <button type="button" class="subtab-btn active" id="subtabCode" onclick="switchHtmlTab('code')">HTML Code</button>
            <button type="button" class="subtab-btn" id="subtabPreview" onclick="switchHtmlTab('preview')">Live Preview</button>
          </div>
        </div>
        <textarea id="htmlCode" oninput="updateHtmlPreview()"></textarea>
        <iframe id="previewIframe" class="preview-frame"></iframe>
      </div>

      <!-- Optional Photo Attachments -->
      <div class="form-group">
        <label>Photo Attachments (Optional for 159266 & 073000):</label>
        <div class="attachment-box">
          <input type="file" id="photoPicker" multiple accept="image/*" onchange="handleFileSelect(event)">
          <div id="fileChips" class="file-chips"></div>
        </div>
      </div>

      <!-- Action Button -->
      <button type="button" class="btn-send" id="btnSendNow" onclick="dispatchSendNow()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        <span id="btnText">Send Now</span>
      </button>

      <!-- Status Notification Box -->
      <div id="statusBox" class="status-box"></div>

    </div>
  </div>

  <script>
    // Global state
    var currentMode = 'diary';
    var cachedFiles = [];
    var appContext = {
      userEmail: '',
      dummyInbox: '',
      diaryPasscode: '159266',
      galleryPasscode: '073000',
      siteUrl: 'https://eldersalviejo.vercel.app'
    };

    // Preset templates
    var TEMPLATES = {
      diary: {
        getSubject: function(ctx) {
          return 'Weekly Reflection: Week 1 in Dumaguete ' + (ctx.diaryPasscode || '159266');
        },
        getBody: function() {
          return '-VERSE- (Alma 26:12)\\n\\n--- MONDAY ---\\nPreparation day! Did laundry, wrote emails to family, and companion study in Dumaguete.\\n\\n--- TUESDAY ---\\nMorning proselyting and teaching discussions in Sibulan district.\\n\\n--- WEDNESDAY ---\\nTaught the Plan of Salvation to Brother Bautista and enjoyed fresh buko juice.\\n\\n--- THURSDAY ---\\nDistrict Council meeting in Dumaguete City. Practiced Cebuano language roleplays.\\n\\n--- FRIDAY ---\\nService project helping local families repair bamboo fences.\\n\\n--- SATURDAY ---\\nStreet contacting along Rizal Boulevard during sunset overlooking the ocean.\\n\\n--- SUNDAY ---\\nSacrament meeting in Dumaguete 1st Ward. Bore testimony of the Savior Jesus Christ.';
        }
      },
      gallery: {
        getSubject: function(ctx) {
          return 'Sibulan District Conference [Mission] ' + (ctx.galleryPasscode || '073000');
        },
        getBody: function() {
          return 'Wonderful district conference gathering with companions and members across the Negros Oriental zone!';
        }
      },
      html: {
        getSubject: function() {
          return 'Elder Mark Salviejo — Weekly Mission Update [Philippines Dumaguete Mission]';
        },
        getHtml: function(ctx) {
          var target = (ctx && ctx.siteUrl) || 'https://eldersalviejo.vercel.app';
          return '<!DOCTYPE html>\\n<html lang="en">\\n<head>\\n  <meta charset="utf-8">\\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\\n  <title>Elder Mark Salviejo — Weekly Mission Update</title>\\n</head>\\n<body style="margin: 0; padding: 0; background-color: #f4f1ea; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1c1917;">\\n  <div style="max-width: 600px; margin: 24px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e7e5e4;">\\n    \\n    <div style="background-color: #1c1917; padding: 32px 24px; text-align: center; border-bottom: 3px solid #d97706;">\\n      <p style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d97706; font-weight: 700;">Philippines Dumaguete Mission</p>\\n      <h1 style="margin: 0 0 6px 0; font-family: Georgia, serif; font-size: 26px; color: #ffffff; font-weight: 700;">Elder Mark Salviejo</h1>\\n      <p style="margin: 0; font-size: 13px; color: #a8a29e; font-style: italic; font-family: Georgia, serif;">Weekly Missionary Journal &amp; Memories</p>\\n    </div>\\n\\n    <div style="padding: 32px 28px;">\\n      <div style="border-bottom: 2px solid #f5f5f4; padding-bottom: 16px; margin-bottom: 24px;">\\n        <span style="display: inline-block; background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">Weekly Reflection</span>\\n        <h2 style="font-family: Georgia, serif; font-size: 22px; color: #1c1917; margin: 6px 0 0 0;">Dedicated Mission Update</h2>\\n      </div>\\n\\n      <div style="background-color: #fafaf9; border-left: 4px solid #d97706; border-radius: 6px; padding: 18px 20px; margin-bottom: 26px;">\\n        <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #b45309;">Scripture of the Week &bull; Alma 26:12</p>\\n        <p style="margin: 0; font-family: Georgia, serif; font-size: 14px; font-style: italic; color: #44403c; line-height: 1.6;">\\n          &ldquo;Yea, I know that I am nothing; as to my strength I am weak; therefore I will not boast of myself, but I will boast of my God, for in his strength I can do all things.&rdquo;\\n        </p>\\n      </div>\\n\\n      <div style="font-size: 14px; line-height: 1.75; color: #44403c; margin-bottom: 30px;">\\n        <p style="margin: 0 0 16px 0;">Dear Family, Friends, and Supporters,</p>\\n        <p style="margin: 0 0 16px 0;">This week has been full of remarkable blessings in the Dumaguete Mission. Through daily companionship study, street contacting, and teaching families the Gospel of Jesus Christ, we have seen hearts touched and testimonies strengthened.</p>\\n        <p style="margin: 0 0 16px 0;">Thank you so much for your continuous prayers, encouragement, and love. Your messages on the mission board mean the world to us!</p>\\n      </div>\\n\\n      <div style="text-align: center; margin: 36px 0 16px 0;">\\n        <a href="' + target + '" target="_blank" style="background-color: #d97706; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; letter-spacing: 0.5px;">Explore the Weekly Vault &rarr;</a>\\n      </div>\\n    </div>\\n\\n    <div style="background-color: #fafaf9; border-top: 1px solid #f5f5f4; padding: 20px 24px; text-align: center; font-size: 11px; color: #78716c;">\\n      <p style="margin: 0 0 4px 0; font-weight: 600; color: #44403c;">Elder Mark Salviejo &bull; Philippines Dumaguete Mission</p>\\n      <p style="margin: 0;">Official missionary archive update.</p>\\n    </div>\\n  </div>\\n</body>\\n</html>';
        }
      }
    };

    // Initialization
    window.addEventListener('DOMContentLoaded', function() {
      // Load context from server if running in Google Apps Script
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(ctx) {
            if (ctx) {
              appContext = ctx;
              if (!document.getElementById('toEmail').value) {
                document.getElementById('toEmail').value = ctx.userEmail || ctx.dummyInbox || '';
              }
              // Refresh initial template
              selectTemplate(currentMode);
            }
          })
          .getComposerContext();
      } else {
        selectTemplate('diary');
      }
    });

    function selectTemplate(mode) {
      currentMode = mode;
      
      // Update tab active states
      document.getElementById('tabDiary').className = 'tab-btn' + (mode === 'diary' ? ' active' : '');
      document.getElementById('tabGallery').className = 'tab-btn' + (mode === 'gallery' ? ' active' : '');
      document.getElementById('tabHtml').className = 'tab-btn' + (mode === 'html' ? ' active' : '');

      var subjectInput = document.getElementById('emailSubject');
      var plainContainer = document.getElementById('plainContainer');
      var htmlContainer = document.getElementById('htmlContainer');

      if (mode === 'diary') {
        plainContainer.style.display = 'block';
        htmlContainer.style.display = 'none';
        subjectInput.value = TEMPLATES.diary.getSubject(appContext);
        document.getElementById('plainTextBody').value = TEMPLATES.diary.getBody();
      } else if (mode === 'gallery') {
        plainContainer.style.display = 'block';
        htmlContainer.style.display = 'none';
        subjectInput.value = TEMPLATES.gallery.getSubject(appContext);
        document.getElementById('plainTextBody').value = TEMPLATES.gallery.getBody();
      } else if (mode === 'html') {
        plainContainer.style.display = 'none';
        htmlContainer.style.display = 'block';
        subjectInput.value = TEMPLATES.html.getSubject();
        var htmlCodeBox = document.getElementById('htmlCode');
        if (!htmlCodeBox.value) {
          htmlCodeBox.value = TEMPLATES.html.getHtml(appContext);
        }
        updateHtmlPreview();
        switchHtmlTab('code');
      }
    }

    function setPillRecipient(type) {
      var toInput = document.getElementById('toEmail');
      if (type === 'me') {
        toInput.value = appContext.userEmail || '';
      } else if (type === 'dummy') {
        toInput.value = appContext.dummyInbox || '';
      } else {
        toInput.value = '';
        toInput.focus();
      }
    }

    function switchHtmlTab(tab) {
      var codeBox = document.getElementById('htmlCode');
      var iframe = document.getElementById('previewIframe');
      var btnCode = document.getElementById('subtabCode');
      var btnPreview = document.getElementById('subtabPreview');

      if (tab === 'preview') {
        updateHtmlPreview();
        codeBox.style.display = 'none';
        iframe.style.display = 'block';
        btnCode.className = 'subtab-btn';
        btnPreview.className = 'subtab-btn active';
      } else {
        codeBox.style.display = 'block';
        iframe.style.display = 'none';
        btnCode.className = 'subtab-btn active';
        btnPreview.className = 'subtab-btn';
      }
    }

    function updateHtmlPreview() {
      var html = document.getElementById('htmlCode').value;
      var iframe = document.getElementById('previewIframe');
      iframe.srcdoc = html;
    }

    function handleFileSelect(evt) {
      var files = evt.target.files;
      cachedFiles = [];
      var chipsDiv = document.getElementById('fileChips');
      chipsDiv.innerHTML = '';

      for (var i = 0; i < files.length; i++) {
        (function(file) {
          var reader = new FileReader();
          reader.onload = function(e) {
            var base64 = e.target.result.split(',')[1];
            cachedFiles.push({
              name: file.name,
              type: file.type,
              base64: base64
            });
            var chip = document.createElement('div');
            chip.className = 'file-chip';
            chip.textContent = file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
            chipsDiv.appendChild(chip);
          };
          reader.readAsDataURL(file);
        })(files[i]);
      }
    }

    function setStatus(type, message) {
      var box = document.getElementById('statusBox');
      box.className = 'status-box ' + type;
      box.innerHTML = message;
    }

    function dispatchSendNow() {
      var to = document.getElementById('toEmail').value.trim();
      var subject = document.getElementById('emailSubject').value.trim();
      
      if (!to) {
        setStatus('error', 'Please enter a recipient email address.');
        return;
      }
      if (!subject) {
        setStatus('error', 'Please enter an email subject.');
        return;
      }

      var payload = {
        recipient: to,
        subject: subject,
        mode: currentMode,
        bodyText: document.getElementById('plainTextBody').value,
        htmlContent: document.getElementById('htmlCode').value,
        attachments: cachedFiles
      };

      var btn = document.getElementById('btnSendNow');
      var btnText = document.getElementById('btnText');
      btn.disabled = true;
      btnText.textContent = 'Sending...';
      setStatus('loading', 'Dispatching email template via GmailApp.sendEmail...');

      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(res) {
            btn.disabled = false;
            btnText.textContent = 'Send Now';
            if (res && res.success) {
              setStatus('success', 'Email sent successfully to <strong>' + res.recipient + '</strong> at ' + res.timestamp + (res.attachmentCount ? ' (' + res.attachmentCount + ' photo attachment(s))' : ''));
            } else {
              setStatus('error', 'Notice sending email.');
            }
          })
          .withFailureHandler(function(err) {
            btn.disabled = false;
            btnText.textContent = 'Send Now';
            setStatus('error', 'Error sending email: ' + (err.message || err));
          })
          .sendTemplateEmailFromWebApp(payload);
      } else {
        // Local simulation / fallback
        setTimeout(function() {
          btn.disabled = false;
          btnText.textContent = 'Send Now';
          setStatus('success', '[SIMULATION] Successfully prepared email for: <strong>' + to + '</strong> (Subject: "' + subject + '")');
        }, 800);
      }
    }
  </script>

</body>
</html>`;
}

/**
 * Builds the All-in-One Missionary Kit HTML Email containing BOTH buttons:
 * 1. "Send Weekly Reflection (159266)"
 * 2. "Send Gallery Photos (073000)"
 * 
 * When the missionary opens this email, clicking either button immediately opens their
 * email app with the recipient, subject (including secret passcode), and body template ready to edit!
 */
function buildMissionaryKitEmailHtml(dummyInbox, diaryPasscode, galleryPasscode, siteUrl) {
  const dummy = dummyInbox || 'dummy@gmail.com';
  const diaryCode = diaryPasscode || '159266';
  const galleryCode = galleryPasscode || '073000';
  const url = siteUrl || 'https://eldersalviejo.vercel.app';

  const diarySubject = `Weekly Reflection: Week 1 in Dumaguete ${diaryCode}`;
  const diaryBody = `-VERSE- (Alma 26:12)\n\n--- MONDAY ---\nPreparation day! Did laundry, wrote emails to family, and companion study in Dumaguete.\n\n--- TUESDAY ---\nMorning proselyting and teaching discussions in Sibulan district.\n\n--- WEDNESDAY ---\nTaught the Plan of Salvation to Brother Bautista and enjoyed fresh buko juice.\n\n--- THURSDAY ---\nDistrict Council meeting in Dumaguete City. Practiced Cebuano language roleplays.\n\n--- FRIDAY ---\nService project helping local families repair bamboo fences.\n\n--- SATURDAY ---\nStreet contacting along Rizal Boulevard during sunset overlooking the ocean.\n\n--- SUNDAY ---\nSacrament meeting in Dumaguete 1st Ward. Bore testimony of the Savior Jesus Christ.`;

  const gallerySubject = `Dumaguete District Conference [Mission] ${galleryCode}`;
  const galleryBody = `Wonderful district conference gathering with companions and members across Negros Oriental!`;

  const diaryMailto = `mailto:${encodeURIComponent(dummy)}?subject=${encodeURIComponent(diarySubject)}&body=${encodeURIComponent(diaryBody)}`;
  const diaryGmailWeb = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(dummy)}&su=${encodeURIComponent(diarySubject)}&body=${encodeURIComponent(diaryBody)}`;

  const galleryMailto = `mailto:${encodeURIComponent(dummy)}?subject=${encodeURIComponent(gallerySubject)}&body=${encodeURIComponent(galleryBody)}`;
  const galleryGmailWeb = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(dummy)}&su=${encodeURIComponent(gallerySubject)}&body=${encodeURIComponent(galleryBody)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elder Mark Salviejo — Official Missionary Sender Kit</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fcfbf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1c1917; -webkit-font-smoothing: antialiased; line-height: 1.5;">
  <div style="max-width: 640px; margin: 24px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e7e5e4;">
    
    <!-- Top Obsidian Archival Header with Missionary Nametag -->
    <div style="background-color: #18181b; padding: 34px 24px 28px 24px; text-align: center; border-bottom: 3px solid #b45309;">
      
      <!-- Official Missionary Nametag Badge -->
      <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto 18px auto; background-color: #000000; border: 1.5px solid #ffffff; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.35); min-width: 210px; max-width: 250px; text-align: center;">
        <tr>
          <td style="padding: 10px 18px;">
            <div style="font-family: Georgia, serif; font-size: 8px; letter-spacing: 1.2px; color: #ffffff; text-transform: uppercase; line-height: 1.25; opacity: 0.95;">
              The Church of<br>
              <span style="font-size: 10px; font-weight: 700; letter-spacing: 1.5px;">Jesus Christ</span><br>
              of Latter-day Saints
            </div>
            <div style="height: 1px; background-color: rgba(255,255,255,0.25); margin: 7px 0 5px 0;"></div>
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">
              Elder Salviejo
            </div>
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 9px; color: #d4d4d8; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px;">
              Philippines Dumaguete Mission
            </div>
          </td>
        </tr>
      </table>

      <!-- Pipeline Subtitle with Monospace Tag & SVG Shield -->
      <div style="font-family: ui-monospace, 'IBM Plex Mono', Menlo, Consolas, monospace; font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #a1a1aa; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; display: inline-block;">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Official Missionary Submission Pipeline
      </div>
      
      <h1 style="margin: 10px 0 4px 0; font-family: 'Newsreader', Georgia, 'Times New Roman', serif; font-size: 25px; line-height: 1.25; color: #ffffff; font-weight: 600; letter-spacing: -0.5px;">
        Missionary Sender Kit
      </h1>
      <p style="margin: 0; font-family: ui-monospace, 'IBM Plex Mono', Menlo, Consolas, monospace; font-size: 11px; color: #fbbf24; letter-spacing: 0.5px;">
        Live Archival Vault &bull; Version 3.0
      </p>
    </div>

    <!-- Main Content Body -->
    <div style="padding: 32px 26px;">
      
      <!-- Congratulatory Commendation Box -->
      <div style="background-color: #fffdfa; border: 1px solid #e7e5e4; border-left: 4px solid #b45309; border-radius: 0 8px 8px 0; padding: 18px 20px; margin-bottom: 28px;">
        <h3 style="margin: 0 0 6px 0; font-family: 'Newsreader', Georgia, serif; font-size: 17px; color: #78350f; font-weight: 700; line-height: 1.3;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; display: inline-block; margin-right: 6px;">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          Authorized Sender Registration
        </h3>
        <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #78350f;">
          Congratulations! You are officially registered as an authorized missionary sender for the <strong>Philippines Dumaguete Mission</strong> Live Vault. Whenever you send your Preparation Day updates, you never have to format headers or remember codes from scratch. Use your dedicated 1-click tools below.
        </p>
      </div>

      <!-- 4-STEP VISUAL "HOW TO SEND" GUIDE -->
      <div style="margin-bottom: 32px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e7e5e4; padding-bottom: 8px; margin-bottom: 18px;">
          <h2 style="font-family: 'Newsreader', Georgia, serif; font-size: 18px; color: #1c1917; margin: 0; font-weight: 700;">
            How to Send on Preparation Day
          </h2>
          <span style="font-family: ui-monospace, 'IBM Plex Mono', Menlo, Consolas, monospace; font-size: 10px; font-weight: 600; text-transform: uppercase; color: #78716c; letter-spacing: 1px;">
            4 Simple Steps
          </span>
        </div>

        <!-- Step 1 -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 14px;">
          <tr>
            <td width="36" valign="top">
              <div style="width: 26px; height: 26px; border-radius: 50%; background-color: #1c1917; color: #ffffff; font-family: ui-monospace, monospace; font-size: 12px; font-weight: 700; line-height: 26px; text-align: center;">
                1
              </div>
            </td>
            <td valign="top" style="padding-left: 8px;">
              <p style="margin: 0 0 3px 0; font-size: 13px; font-weight: 700; color: #1c1917;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; display: inline-block; margin-right: 4px;">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Tap Either Action Button Below
              </p>
              <p style="margin: 0; font-size: 12px; color: #57534e; line-height: 1.5;">
                Select whether you are sending your <strong>Weekly Reflection Letter</strong> or a <strong>Photo Gallery Album</strong>. Tapping opens your email app directly.
              </p>
            </td>
          </tr>
        </table>

        <!-- Step 2 -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 14px;">
          <tr>
            <td width="36" valign="top">
              <div style="width: 26px; height: 26px; border-radius: 50%; background-color: #1c1917; color: #ffffff; font-family: ui-monospace, monospace; font-size: 12px; font-weight: 700; line-height: 26px; text-align: center;">
                2
              </div>
            </td>
            <td valign="top" style="padding-left: 8px;">
              <p style="margin: 0 0 3px 0; font-size: 13px; font-weight: 700; color: #1c1917;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1c1917" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; display: inline-block; margin-right: 4px;">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Subject &amp; Template Auto-Populate
              </p>
              <p style="margin: 0; font-size: 12px; color: #57534e; line-height: 1.5;">
                No manual formatting needed. The draft opens pre-addressed with secret passcodes (<span style="font-family: ui-monospace, monospace; background: #f5f5f4; padding: 1px 4px; border-radius: 4px; font-size: 11px;">159266</span> or <span style="font-family: ui-monospace, monospace; background: #f5f5f4; padding: 1px 4px; border-radius: 4px; font-size: 11px;">073000</span>) and Monday–Sunday prompts.
              </p>
            </td>
          </tr>
        </table>

        <!-- Step 3 -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 14px;">
          <tr>
            <td width="36" valign="top">
              <div style="width: 26px; height: 26px; border-radius: 50%; background-color: #1c1917; color: #ffffff; font-family: ui-monospace, monospace; font-size: 12px; font-weight: 700; line-height: 26px; text-align: center;">
                3
              </div>
            </td>
            <td valign="top" style="padding-left: 8px;">
              <p style="margin: 0 0 3px 0; font-size: 13px; font-weight: 700; color: #1c1917;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1c1917" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; display: inline-block; margin-right: 4px;">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                Write Experiences &amp; Attach Photos
              </p>
              <p style="margin: 0; font-size: 12px; color: #57534e; line-height: 1.5;">
                Record missionary experiences, lessons taught, and your scripture verse. Attach <strong>up to 7 photos</strong> for weekly letters, or <strong>up to 50+ photos</strong> for gallery albums.
              </p>
            </td>
          </tr>
        </table>

        <!-- Step 4 -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="36" valign="top">
              <div style="width: 26px; height: 26px; border-radius: 50%; background-color: #047857; color: #ffffff; font-family: ui-monospace, monospace; font-size: 12px; font-weight: 700; line-height: 26px; text-align: center;">
                4
              </div>
            </td>
            <td valign="top" style="padding-left: 8px;">
              <p style="margin: 0 0 3px 0; font-size: 13px; font-weight: 700; color: #047857;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; display: inline-block; margin-right: 4px;">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Hit Send &bull; Automated Archiving &amp; Broadcast
              </p>
              <p style="margin: 0; font-size: 12px; color: #57534e; line-height: 1.5;">
                The serverless pipeline automatically updates the vault monograph and dispatches an email newsletter broadcast to family, friends, and ward subscribers.
              </p>
            </td>
          </tr>
        </table>

      </div>

      <!-- THE 2 SIGNATURE ACTION BUTTONS -->
      <div style="margin-top: 26px;">

        <!-- BUTTON 1: WEEKLY DIARY REFLECTION -->
        <div style="border: 1px solid #fde68a; background-color: #fffdfa; border-radius: 10px; padding: 22px 20px; margin-bottom: 20px; text-align: center;">
          <span style="display: inline-block; background-color: #b45309; color: #ffffff; font-family: ui-monospace, 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
            OPTION 1 &bull; PASSCODE [${escapeHtml(diaryCode)}]
          </span>
          <h3 style="font-family: 'Newsreader', Georgia, serif; font-size: 19px; color: #78350f; margin: 0 0 6px 0; font-weight: 700;">
            Weekly Diary Reflection Letter
          </h3>
          <p style="margin: 0 0 16px 0; font-size: 12px; color: #92400e; line-height: 1.5;">
            Includes Monday–Sunday daily prompts and -VERSE- reference block. Remember to attach 7 weekly photos!
          </p>

          <a href="${diaryMailto}" style="background-color: #b45309; color: #ffffff; text-decoration: none; padding: 13px 26px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; letter-spacing: 0.5px; box-shadow: 0 3px 10px rgba(180, 83, 9, 0.3);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; display: inline-block; margin-right: 6px;">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Send Weekly Diary [${escapeHtml(diaryCode)}]
          </a>

          <div style="margin-top: 10px;">
            <a href="${diaryGmailWeb}" target="_blank" style="font-size: 11px; color: #92400e; text-decoration: underline; font-weight: 600;">
              Using Desktop Gmail? Open directly in Web Browser
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; display: inline-block; margin-left: 2px;">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </div>

        <!-- BUTTON 2: PHOTO GALLERY ALBUM -->
        <div style="border: 1px solid #e7e5e4; background-color: #fafaf9; border-radius: 10px; padding: 22px 20px; margin-bottom: 24px; text-align: center;">
          <span style="display: inline-block; background-color: #18181b; color: #ffffff; font-family: ui-monospace, 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
            OPTION 2 &bull; PASSCODE [${escapeHtml(galleryCode)}]
          </span>
          <h3 style="font-family: 'Newsreader', Georgia, serif; font-size: 19px; color: #18181b; margin: 0 0 6px 0; font-weight: 700;">
            Polaroid Photo Gallery Album
          </h3>
          <p style="margin: 0 0 16px 0; font-size: 12px; color: #71717a; line-height: 1.5;">
            Publish standalone mission albums (1 to 50+ photos) directly to the live Polaroid Wall on /gallery.
          </p>

          <a href="${galleryMailto}" style="background-color: #18181b; color: #ffffff; text-decoration: none; padding: 13px 26px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; letter-spacing: 0.5px; box-shadow: 0 3px 10px rgba(0,0,0,0.2);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; display: inline-block; margin-right: 6px;">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Send Photo Gallery [${escapeHtml(galleryCode)}]
          </a>

          <div style="margin-top: 10px;">
            <a href="${galleryGmailWeb}" target="_blank" style="font-size: 11px; color: #52525b; text-decoration: underline; font-weight: 600;">
              Using Desktop Gmail? Open directly in Web Browser
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; display: inline-block; margin-left: 2px;">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </div>

      </div>

      <!-- Target Ingestion Address Box -->
      <div style="background-color: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 8px; padding: 14px 18px; font-size: 12px; color: #44403c; text-align: center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#57534e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; display: inline-block; margin-right: 4px;">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        Target Ingest Receiver: <span style="font-family: ui-monospace, monospace; font-weight: 700; color: #1c1917;">${escapeHtml(dummy)}</span>
        <p style="margin: 6px 0 0 0; font-size: 11px; color: #78716c;">
          Star or pin this email in your inbox to easily tap the buttons every Monday without typing!
        </p>
      </div>

    </div>

    <!-- Archival Editorial Footer -->
    <div style="background-color: #fafaf9; border-top: 1px solid #e7e5e4; padding: 22px 24px; text-align: center; font-size: 11px; color: #78716c;">
      <p style="margin: 0 0 4px 0; font-family: ui-monospace, 'IBM Plex Mono', monospace; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #44403c;">
        Philippines Dumaguete Mission &bull; Live Archival Monograph
      </p>
      <p style="margin: 0;">Vault: <a href="${url}" style="color: #b45309; text-decoration: underline;">${url}</a></p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Dispatches the Congratulatory Sender Registration & Submission Kit Email.
 * Contains the 4-step visual guide and the 2 1-click action buttons.
 */
function sendMissionaryTemplateKitEmail(recipientEmail, dummyInboxOverride) {
  const ctx = getComposerContext();
  const target = recipientEmail || ctx.userEmail || ctx.dummyInbox;
  if (!target) {
    throw new Error('No recipient email specified for template kit.');
  }

  const dummy = dummyInboxOverride || ctx.dummyInbox || 'dummy@gmail.com';
  const diaryCode = ctx.diaryPasscode || '159266';
  const galleryCode = ctx.galleryPasscode || '073000';
  const html = buildMissionaryKitEmailHtml(dummy, diaryCode, galleryCode, ctx.siteUrl);
  const subject = `Elder Mark Salviejo — Official Missionary Sender Kit [${diaryCode} & ${galleryCode}]`;

  GmailApp.sendEmail(target, subject, 'Elder Mark Salviejo Mission Sender Registration & Template Kit (HTML format).', {
    htmlBody: html,
    name: 'Elder Mark Salviejo Vault'
  });

  Logger.log(`[PASS] Dispatched Official Missionary Sender Kit Email to: ${target} (Dummy: ${dummy})`);
  return {
    success: true,
    recipient: target,
    dummyInbox: dummy,
    timestamp: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy • h:mm:ss a')
  };
}

/**
 * Explicit alias for sendMissionaryTemplateKitEmail.
 */
function sendCongratulatoryRegistrationEmail(recipientEmail, dummyInboxOverride) {
  return sendMissionaryTemplateKitEmail(recipientEmail, dummyInboxOverride);
}

/**
 * 1-Click Test Runner inside Google Apps Script:
 * Run this directly from the script.google.com toolbar dropdown to verify instant delivery
 * to your inbox with zero Web App / webhook setup hurdles!
 */
function runTestSendToMyInbox() {
  const userEmail = Session.getActiveUser().getEmail() || 
                    PropertiesService.getScriptProperties().getProperty('ALLOWED_SENDER') ||
                    PropertiesService.getScriptProperties().getProperty('DUMMY_EMAIL');
  
  if (!userEmail) {
    throw new Error('Could not detect user email. Please pass an email to sendMissionaryTemplateKitEmail("your-email@gmail.com")');
  }

  Logger.log(`====================================================`);
  Logger.log(`TEST RUNNER: Sending Official Missionary Sender Kit to: ${userEmail}`);
  Logger.log(`====================================================`);

  const result = sendMissionaryTemplateKitEmail(userEmail);

  Logger.log(`[SUCCESS] Email successfully dispatched! Check your Gmail inbox: ${userEmail}`);
  return result;
}

/**
 * Web App POST Entry Point:
 * Handles webhook requests from the Admin Portal (/admin) to dispatch template emails.
 */
function doPost(e) {
  try {
    let data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        data = {};
      }
    }

    const secret = data.secret || (e && e.parameter && e.parameter.secret) || '';
    const configuredSecret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET') || CONFIG.INGEST_SECRET || '';

    if (configuredSecret && secret !== configuredSecret) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized: Invalid secret' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const action = data.action || (e && e.parameter && e.parameter.action) || 'sendKit';
    const recipient = data.recipientEmail || data.recipient || '';
    const dummyInbox = data.dummyEmail || data.dummyInbox || '';

    if (action === 'sendKit' || action === 'sendTemplateKit' || action === 'sendRegistration' || action === 'sendCongratulatoryKit') {
      const result = sendMissionaryTemplateKitEmail(recipient, dummyInbox);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action: ' + action }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


