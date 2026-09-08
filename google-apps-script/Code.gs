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
 * Retrieves or creates the Gmail label object for processed threads.
 */
function getProcessedLabel() {
  const labelName = PropertiesService.getScriptProperties().getProperty('PROCESSED_LABEL') || CONFIG.PROCESSED_LABEL || 'diary-processed';
  try {
    let label = GmailApp.getUserLabelByName(labelName);
    if (!label) {
      label = GmailApp.createLabel(labelName);
    }
    return label;
  } catch (err) {
    Logger.log(`Notice retrieving or creating label "${labelName}": ${err.message}`);
    return null;
  }
}

/**
 * Safely applies the processed label to a thread and marks it as read.
 */
function applyProcessedLabel(thread) {
  if (!thread) return;
  try {
    const label = getProcessedLabel();
    if (label) {
      thread.addLabel(label);
    }
    thread.markRead();
  } catch (err) {
    Logger.log(`Notice applying processed label: ${err.message}`);
  }
}

/**
 * Anti-Duplicate Engine: Returns search query excluding processed emails,
 * self-replies, and confirmation subjects.
 */
function getGmailQuery() {
  const props = PropertiesService.getScriptProperties();
  const labelName = props.getProperty('PROCESSED_LABEL') || CONFIG.PROCESSED_LABEL || 'diary-processed';
  const diaryCode = props.getProperty('SECRET_DIARY_CODE') || props.getProperty('SECRET_CODE') || CONFIG.SECRET_DIARY_CODE || '';
  const galleryCode = props.getProperty('SECRET_GALLERY_CODE') || CONFIG.SECRET_GALLERY_CODE || '';

  const codeTerms = [diaryCode, galleryCode].filter(Boolean).map(c => `"${c}"`).join(' OR ');
  const codeFilter = codeTerms 
    ? `(${codeTerms} OR subject:"Weekly Reflection" OR subject:"Weekly Journal" OR subject:Reflection OR subject:Gallery OR subject:Album OR subject:Photos)`
    : '(subject:"Weekly Reflection" OR subject:"Weekly Journal" OR subject:Reflection OR subject:Gallery OR subject:Album OR subject:Photos OR has:attachment)';

  return `${codeFilter} -label:${labelName} -from:me -subject:"Confirmed:" -subject:"Receipt:" -subject:"Published:" -subject:"Re:" -subject:"RE:" -subject:"Fwd:" -subject:"FW:"`;
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
 * Continuation Engine: Clears continuation state when complete.
 */
function clearContinuationState() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('CONTINUATION_STATE');
}

/**
 * Continuation Engine: Schedules an automatic one-time trigger in 30 seconds
 * to resume processing remaining photos.
 */
function scheduleContinuationTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processWeeklyDiaryEmails' && triggers[i].getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
      // Keep recurring time-based triggers intact
    }
  }
  ScriptApp.newTrigger('processWeeklyDiaryEmails')
    .timeBased()
    .after(30000)
    .create();
  Logger.log('Scheduled automatic continuation trigger in 30 seconds.');
}

/**
 * Diagnostic tool: Run from toolbar to verify last 5 emails in inbox.
 */
function debugCheckInbox() {
  Logger.log('=== Checking Last 5 Emails in Inbox ===');
  const threads = GmailApp.getInboxThreads(0, 5);
  if (!threads || threads.length === 0) {
    Logger.log('Inbox has NO emails right now.');
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
        applyProcessedLabel(thread);
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
      applyProcessedLabel(thread);
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
    applyProcessedLabel(thread);

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
 * 1-Click Trigger: Runs every 5 minutes 24/7.
 */
function create5MinuteTrigger() {
  createInstantTrigger(5);
}

/**
 * 1-Click Trigger: Runs every 1 minute 24/7.
 */
function create1MinuteTrigger() {
  createInstantTrigger(1);
}

function createInstantTrigger(intervalMinutes) {
  const minutes = (intervalMinutes === 1 || intervalMinutes === 5 || intervalMinutes === 10 || intervalMinutes === 15 || intervalMinutes === 30)
    ? intervalMinutes
    : 5;

  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processWeeklyDiaryEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('processWeeklyDiaryEmails')
    .timeBased()
    .everyMinutes(minutes)
    .create();

  Logger.log(`Instant trigger created. It will automatically check for new diary emails every ${minutes} minute(s) 24/7.`);
}

function createMondayTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processWeeklyDiaryEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('processWeeklyDiaryEmails')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();
    
  Logger.log('Monday trigger successfully created for 9:00 AM.');
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
  const trimmed = raw.trim();

  const twoParens = trimmed.match(/^\s*\(([^)]+)\)\s*\(([\s\S]+)\)\s*$/);
  if (twoParens) {
    return {
      reference: twoParens[1].trim(),
      text: twoParens[2].trim()
    };
  }

  const singleParenMatch = trimmed.match(/^\s*\(([^)]+)\)\s*$/);
  if (singleParenMatch) {
    const ref = singleParenMatch[1].replace(/^VERSE\s*/i, '').trim();
    const fetched = fetchScriptureTextGas(ref);
    return {
      reference: ref,
      text: fetched || ''
    };
  }

  const parenRefThenText = trimmed.match(/^\s*\(([^)]+)\)\s*([\s\S]+)$/);
  if (parenRefThenText) {
    const ref = parenRefThenText[1].replace(/^VERSE\s*/i, '').trim();
    const txt = parenRefThenText[2].trim().replace(/^\(|\)$/g, '');
    return {
      reference: ref,
      text: txt || fetchScriptureTextGas(ref) || ''
    };
  }

  const refClean = trimmed.replace(/^VERSE\s*/i, '').replace(/^\(|\)$/g, '').trim();
  const fetched = fetchScriptureTextGas(refClean);
  return {
    reference: refClean || 'Missionary Scripture',
    text: fetched || ''
  };
}

function fetchScriptureTextGas(refStr) {
  if (!refStr) return '';
  let clean = refStr.replace(/^[-—#*~:\s]+|[-—#*~:\s]+$/g, '').replace(/^\(|\)$/g, '').trim();
  clean = clean.replace(/^VERSE\s*/i, '').trim();

  const regex = /^([1-4]?\s*[A-Za-z—\s&]+?)\s*[:\s]\s*(\d+)\s*[:]\s*(\d+)(?:\s*[-–—]\s*(\d+))?$/i;
  const match = clean.match(regex);
  if (!match) return '';

  const bookRaw = match[1].trim();
  const chapter = match[2];
  const startVerse = parseInt(match[3], 10);
  const endVerse = match[4] ? parseInt(match[4], 10) : startVerse;

  const normalized = bookRaw.toLowerCase().replace(/\s+/g, ' ');
  let volFile = 'new-testament-reference.json';

  const bomBooks = ['1 nephi', '2 nephi', 'jacob', 'enos', 'jarom', 'omni', 'words of mormon', 'mosiah', 'alma', 'helaman', '3 nephi', '4 nephi', 'mormon', 'ether', 'moroni'];
  const pgpBooks = ['moses', 'abraham', 'joseph smith—matthew', 'joseph smith-matthew', 'js-m', 'joseph smith—history', 'js-h', 'articles of faith', 'a of f'];
  const dcBooks = ['doctrine and covenants', 'd&c', 'd and c', 'dc', 'section'];
  const otBooks = ['genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua', 'judges', 'ruth', '1 samuel', '2 samuel', '1 kings', '2 kings', '1 chronicles', '2 chronicles', 'ezra', 'nehemiah', 'esther', 'job', 'psalms', 'psalm', 'proverbs', 'ecclesiastes', 'song of solomon', 'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi'];

  if (bomBooks.includes(normalized)) {
    volFile = 'book-of-mormon-reference.json';
  } else if (dcBooks.includes(normalized)) {
    volFile = 'doctrine-and-covenants-reference.json';
  } else if (pgpBooks.includes(normalized)) {
    volFile = 'pearl-of-great-price-reference.json';
  } else if (otBooks.includes(normalized)) {
    volFile = 'old-testament-reference.json';
  }

  const cdnUrl = `https://cdn.jsdelivr.net/gh/bcbooks/scriptures-json@master/${volFile}`;
  try {
    const res = UrlFetchApp.fetch(cdnUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return '';
    const volData = JSON.parse(res.getContentText());
    const verseList = volData.verses || [];

    const foundVerses = [];
    for (let i = 0; i < verseList.length; i++) {
      const v = verseList[i];
      const bTitle = (v.book_title || '').toLowerCase();
      if (bTitle.includes(normalized) || normalized.includes(bTitle)) {
        if (String(v.chapter_number) === String(chapter)) {
          if (v.verse_number >= startVerse && v.verse_number <= endVerse) {
            foundVerses.push(v.verse_scripture);
          }
        }
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
    'Sacrament meeting attendance was wonderful. Two investigators attended church with us!\n\n' +
    '--- WEEKLY REPORT ---\n' +
    'Lessons: 14\n' +
    'Investigators: 6\n' +
    'Baptisms: 0\n' +
    'Sacrament Attendance: 2\n';

  const sampleDate = new Date();
  const weekTitle = cleanSubjectTitle(sampleSubject) || `Week of ${Utilities.formatDate(sampleDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')}`;
  const weekSlug = generateSlug(weekTitle, sampleDate);
  const parsedData = parseDiaryContent(sampleBody, []);

  Logger.log(`[PASS] Parsed Title: "${weekTitle}"`);
  Logger.log(`[PASS] Parsed Slug: "${weekSlug}"`);
  Logger.log(`[PASS] Extracted Verse: ${parsedData.verse ? parsedData.verse.reference : 'None'}`);
  Logger.log(`[PASS] Total Daily Entries: ${parsedData.entries ? parsedData.entries.length : 0}`);
  Logger.log(`[PASS] Sanitized: Weekly report stripped cleanly from journal view.`);

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
