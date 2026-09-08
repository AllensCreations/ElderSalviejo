/**
 * Turso SQLite Database Client Helper with Local Fallback
 * 
 * - When TURSO_DATABASE_URL is provided: Connects via @libsql/client/web to Turso Cloud SQLite.
 * - When TURSO_DATABASE_URL is not set: Automatically falls back to local JSON databases
 *   (data/local-vault.json for journal_weeks, data/local-gallery.json for gallery)
 * 
 * Clean Database Structure:
 * - Table `journal_weeks`: Dedicated weekly reflections & P-Day journal letters
 * - Table `gallery`: Dedicated Polaroid photo gallery albums & direct image uploads
 * - Table `subscribers`: Newsletter subscribers
 * - Table `processed_messages`: Anti-duplicate message tracking
 * - Table `broadcast_logs`: Single-delivery broadcast tracking
 * - Table `family_encouragements`: Family & friends guestbook messages
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client/web');

const LOCAL_DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_DB_PATH = path.join(LOCAL_DATA_DIR, 'local-vault.json');
const LOCAL_GALLERY_PATH = path.join(LOCAL_DATA_DIR, 'local-gallery.json');

let clientInstance = null;

function isTursoConfigured() {
  const url = process.env.TURSO_DATABASE_URL;
  return Boolean(url && (url.startsWith('libsql://') || url.startsWith('http://') || url.startsWith('https://')));
}

function getDbClient() {
  if (!isTursoConfigured()) return null;
  if (clientInstance) return clientInstance;

  clientInstance = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });

  return clientInstance;
}

function extractMissionaryHighlightSnippet(parsedEntries) {
  if (!Array.isArray(parsedEntries) || parsedEntries.length === 0) return '';

  for (const entry of parsedEntries) {
    if (!entry || !entry.text || typeof entry.text !== 'string') continue;
    
    // Clean out report metadata, indicators, scoreboards, and statistics lines
    let text = entry.text
      .replace(/(?:^|\n)\s*[-—#*~]*\s*(?:WEEKLY\s+REPORT|MISSIONARY\s+REPORT|KEY\s+INDICATORS|STATISTICS|REPORT|INDICATORS?)\s*[-—#*~:]*[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '')
      .replace(/(?:lessons|investigators|baptisms|sacrament|progressing|other|referrals|tracting|media)\s*[:=]\s*\d+/gi, '')
      .replace(/^[0-9\W_]+/, '')
      .trim();
    
    if (text.length >= 15) {
      text = text.replace(/\s+/g, ' ').trim();
      return text.substring(0, 140).trim() + (text.length > 140 ? '...' : '');
    }
  }

  for (const entry of parsedEntries) {
    if (entry && entry.text && typeof entry.text === 'string' && entry.text.trim()) {
      const clean = entry.text.replace(/\s+/g, ' ').trim();
      return clean.substring(0, 140).trim() + (clean.length > 140 ? '...' : '');
    }
  }

  return '';
}

// -------------------------------------------------------------
// Local JSON Storage Helpers (Used when TURSO_DATABASE_URL is unset)
// -------------------------------------------------------------
function readLocalDb() {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      const samplePath = path.join(__dirname, '..', 'sample-data', 'sample-payload.json');
      let initialWeeks = [];
      if (fs.existsSync(samplePath)) {
        try {
          const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
          initialWeeks.push({
            id: 1,
            slug: sample.slug,
            title: sample.title,
            published_at: sample.publishedAt,
            raw_subject: sample.rawSubject || null,
            sender: sample.sender || 'adventurer@example.com',
            entries: JSON.stringify(sample.entries),
            total_entries: sample.totalEntries || sample.entries.length,
            image_count: sample.imageCount || sample.entries.length,
            created_at: new Date().toISOString()
          });
        } catch (_) {}
      }
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(initialWeeks, null, 2));
      return initialWeeks;
    }
    const data = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading local vault database:', err);
    return [];
  }
}

function writeLocalDb(weeks) {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(weeks, null, 2));
  } catch (err) {
    console.error('Error writing local vault database:', err);
  }
}

function readLocalGallery() {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOCAL_GALLERY_PATH)) {
      fs.writeFileSync(LOCAL_GALLERY_PATH, JSON.stringify([], null, 2));
      return [];
    }
    const data = fs.readFileSync(LOCAL_GALLERY_PATH, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading local gallery database:', err);
    return [];
  }
}

function writeLocalGallery(items) {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_GALLERY_PATH, JSON.stringify(items, null, 2));
  } catch (err) {
    console.error('Error writing local gallery database:', err);
  }
}

// -------------------------------------------------------------
// Database Operations
// -------------------------------------------------------------

/**
 * Initializes the required tables and indexes in Turso SQLite.
 */
async function initDatabase() {
  if (isTursoConfigured()) {
    const db = getDbClient();

    try {
      // 1. Table: journal_weeks (Dedicated Weekly Journals)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS journal_weeks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          published_at TEXT NOT NULL,
          raw_subject TEXT,
          sender TEXT,
          entries TEXT NOT NULL,
          total_entries INTEGER DEFAULT 7,
          image_count INTEGER DEFAULT 0,
          verse TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_journal_weeks_slug ON journal_weeks(slug);`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_journal_weeks_published_at ON journal_weeks(published_at DESC);`);

      // 2. Table: gallery (Dedicated Polaroid Gallery Albums)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS gallery (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          published_at TEXT NOT NULL,
          raw_subject TEXT,
          sender TEXT,
          category TEXT DEFAULT 'Mission',
          body_text TEXT,
          entries TEXT NOT NULL,
          total_entries INTEGER DEFAULT 0,
          image_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_gallery_slug ON gallery(slug);`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_gallery_published_at ON gallery(published_at DESC);`);

      // 3. Table: subscribers
      await db.execute(`
        CREATE TABLE IF NOT EXISTS subscribers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);`);

      // 4. Table: processed_messages (Anti-duplicate tracking)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS processed_messages (
          message_id TEXT PRIMARY KEY,
          subject TEXT,
          sender TEXT,
          status TEXT DEFAULT 'processed',
          processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_processed_messages_id ON processed_messages(message_id);`);

      // 5. Table: broadcast_logs (Single broadcast delivery tracking)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS broadcast_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_slug TEXT NOT NULL,
          recipient_email TEXT NOT NULL,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(week_slug, recipient_email)
        );
      `);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_broadcast_logs_slug ON broadcast_logs(week_slug);`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_broadcast_logs_recipient ON broadcast_logs(week_slug, recipient_email);`);

      // 6. Table: family_encouragements (Guestbook / Notes)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS family_encouragements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_slug TEXT NOT NULL,
          author_name TEXT NOT NULL,
          relationship TEXT DEFAULT 'Family & Friends',
          message TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_family_encouragements_slug ON family_encouragements(week_slug);`);

      // Safe Migration: If any legacy gallery entries were saved in journal_weeks with is_gallery = 1,
      // copy them over to the dedicated gallery table and clean up journal_weeks.
      try {
        await db.execute(`
          INSERT OR IGNORE INTO gallery (slug, title, published_at, raw_subject, sender, entries, total_entries, image_count, created_at)
          SELECT slug, title, published_at, raw_subject, sender, entries, total_entries, image_count, created_at
          FROM journal_weeks
          WHERE is_gallery = 1;
        `);
        await db.execute(`DELETE FROM journal_weeks WHERE is_gallery = 1;`);
      } catch (_) {}

      return { success: true, mode: 'turso', message: 'Turso SQLite database tables `journal_weeks` and `gallery` are ready.' };
    } catch (err) {
      console.warn('Turso initialization notice:', err.message);
      readLocalDb();
      readLocalGallery();
      return { success: true, mode: 'local', message: 'Local vault database ready at data/local-vault.json and data/local-gallery.json.' };
    }
  } else {
    readLocalDb();
    readLocalGallery();
    return { success: true, mode: 'local', message: 'Local vault database initialized.' };
  }
}

/**
 * Inserts or updates a weekly diary record in the dedicated `journal_weeks` table.
 */
async function saveWeeklyDiary({ slug, title, publishedAt, rawSubject, sender, entries, totalEntries, imageCount, verse }) {
  const entriesJson = typeof entries === 'string' ? entries : JSON.stringify(entries);
  const verseJson = verse ? (typeof verse === 'string' ? verse : JSON.stringify(verse)) : null;

  if (isTursoConfigured()) {
    const db = getDbClient();
    const query = `
      INSERT INTO journal_weeks (slug, title, published_at, raw_subject, sender, entries, total_entries, image_count, verse)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        published_at = excluded.published_at,
        raw_subject = excluded.raw_subject,
        sender = excluded.sender,
        entries = excluded.entries,
        total_entries = excluded.total_entries,
        image_count = excluded.image_count,
        verse = excluded.verse,
        created_at = CURRENT_TIMESTAMP;
    `;

    return await db.execute({
      sql: query,
      args: [
        slug,
        title,
        publishedAt,
        rawSubject || null,
        sender || null,
        entriesJson,
        totalEntries || (Array.isArray(entries) ? entries.length : 7),
        imageCount || 0,
        verseJson
      ]
    });
  } else {
    // Local storage fallback
    const weeks = readLocalDb();
    const existingIndex = weeks.findIndex(w => w.slug === slug);
    const now = new Date().toISOString();
    const parsedVerseObj = verse ? (typeof verse === 'string' ? JSON.parse(verse) : verse) : null;

    const record = {
      id: existingIndex !== -1 ? weeks[existingIndex].id : (weeks.length > 0 ? Math.max(...weeks.map(w => w.id || 0)) + 1 : 1),
      slug,
      title,
      published_at: publishedAt,
      raw_subject: rawSubject || null,
      sender: sender || null,
      entries: entriesJson,
      total_entries: totalEntries || (Array.isArray(entries) ? entries.length : 7),
      image_count: imageCount || 0,
      verse: parsedVerseObj,
      created_at: existingIndex !== -1 ? weeks[existingIndex].created_at : now,
      updated_at: now
    };

    if (existingIndex !== -1) {
      weeks[existingIndex] = record;
    } else {
      weeks.unshift(record);
    }

    writeLocalDb(weeks);
    return { success: true, id: record.id, slug };
  }
}

/**
 * Inserts or updates a photo gallery album record in the dedicated `gallery` table.
 */
async function saveGalleryEntry({ slug, title, publishedAt, rawSubject, sender, category = 'Mission', bodyText, entries, totalEntries, imageCount }) {
  const entriesJson = typeof entries === 'string' ? entries : JSON.stringify(entries);

  if (isTursoConfigured()) {
    const db = getDbClient();
    const query = `
      INSERT INTO gallery (slug, title, published_at, raw_subject, sender, category, body_text, entries, total_entries, image_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        published_at = excluded.published_at,
        raw_subject = excluded.raw_subject,
        sender = excluded.sender,
        category = excluded.category,
        body_text = excluded.body_text,
        entries = excluded.entries,
        total_entries = excluded.total_entries,
        image_count = excluded.image_count,
        created_at = CURRENT_TIMESTAMP;
    `;

    return await db.execute({
      sql: query,
      args: [
        slug,
        title,
        publishedAt,
        rawSubject || null,
        sender || null,
        category || 'Mission',
        bodyText || null,
        entriesJson,
        totalEntries || (Array.isArray(entries) ? entries.length : 0),
        imageCount || 0
      ]
    });
  } else {
    // Local storage fallback for gallery
    const galleryItems = readLocalGallery();
    const existingIndex = galleryItems.findIndex(g => g.slug === slug);
    const now = new Date().toISOString();

    const record = {
      id: existingIndex !== -1 ? galleryItems[existingIndex].id : (galleryItems.length > 0 ? Math.max(...galleryItems.map(g => g.id || 0)) + 1 : 1),
      slug,
      title,
      published_at: publishedAt,
      raw_subject: rawSubject || null,
      sender: sender || null,
      category: category || 'Mission',
      body_text: bodyText || null,
      entries: entriesJson,
      total_entries: totalEntries || (Array.isArray(entries) ? entries.length : 0),
      image_count: imageCount || 0,
      created_at: existingIndex !== -1 ? galleryItems[existingIndex].created_at : now,
      updated_at: now
    };

    if (existingIndex !== -1) {
      galleryItems[existingIndex] = record;
    } else {
      galleryItems.unshift(record);
    }

    writeLocalGallery(galleryItems);
    return { success: true, id: record.id, slug };
  }
}

/**
 * Fetches all weekly journals strictly from the `journal_weeks` table.
 */
async function getAllWeeks() {
  let rows = [];

  if (isTursoConfigured()) {
    try {
      const db = getDbClient();
      const result = await db.execute(`
        SELECT id, slug, title, published_at, raw_subject, sender, total_entries, image_count, verse, created_at, entries
        FROM journal_weeks
        ORDER BY published_at DESC;
      `);
      rows = result.rows;
    } catch (dbErr) {
      console.warn('Turso query for journal_weeks failed, using local vault:', dbErr.message);
      rows = readLocalDb();
      rows.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    }
  } else {
    rows = readLocalDb();
    rows.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  }

  return rows.map(row => {
    let previewImage = null;
    let snippet = '';
    try {
      const parsedEntries = typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries;
      if (Array.isArray(parsedEntries) && parsedEntries.length > 0) {
        const entryWithImg = parsedEntries.find(e => e && e.image);
        previewImage = entryWithImg ? entryWithImg.image : (parsedEntries[0].image || null);
        snippet = extractMissionaryHighlightSnippet(parsedEntries);
      }
    } catch (_) {}

    let parsedVerse = null;
    if (row.verse) {
      try {
        parsedVerse = typeof row.verse === 'string' ? JSON.parse(row.verse) : row.verse;
      } catch (_) {
        parsedVerse = { text: row.verse };
      }
    }

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      publishedAt: row.published_at,
      rawSubject: row.raw_subject,
      sender: row.sender,
      totalEntries: row.total_entries,
      imageCount: row.image_count,
      verse: parsedVerse,
      createdAt: row.created_at,
      previewImage,
      snippet
    };
  });
}

/**
 * Fetches all photos for the Polaroid Photo Wall.
 * Aggregates:
 * 1. Dedicated photo uploads from the `gallery` table
 * 2. Daily reflection photos from the `journal_weeks` table
 */
async function getAllGalleryPhotos() {
  let galleryRows = [];
  let journalRows = [];

  if (isTursoConfigured()) {
    const db = getDbClient();
    try {
      const gRes = await db.execute(`
        SELECT id, slug, title, published_at, category, body_text, entries, created_at
        FROM gallery
        ORDER BY published_at DESC;
      `);
      galleryRows = gRes.rows;
    } catch (_) {}

    try {
      const jRes = await db.execute(`
        SELECT id, slug, title, published_at, entries, created_at
        FROM journal_weeks
        ORDER BY published_at DESC;
      `);
      journalRows = jRes.rows;
    } catch (_) {}
  } else {
    galleryRows = readLocalGallery();
    journalRows = readLocalDb();
  }

  const photos = [];
  const seenSrcs = new Set();

  // 1. Process dedicated gallery uploads from `gallery` table
  for (const row of galleryRows) {
    let entries = [];
    try {
      entries = typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries;
    } catch (_) {}

    if (Array.isArray(entries)) {
      entries.forEach((entry, idx) => {
        const imgSrc = entry.cdnImage || entry.image;
        const isPresaved = !imgSrc || 
                           imgSrc.startsWith('data:image/svg+xml') || 
                           imgSrc.includes('/assets/images/intro/') || 
                           imgSrc.includes('/assets/images/elder-salviejo.jpg');

        if (imgSrc && !isPresaved && !seenSrcs.has(imgSrc)) {
          seenSrcs.add(imgSrc);
          const itemCategory = entry.category || row.category || 'Mission';
          const captionText = entry.caption || entry.text || row.body_text || '';

          photos.push({
            id: `gallery-${row.slug || row.id}-${idx}`,
            src: imgSrc,
            date: row.published_at || row.created_at,
            category: itemCategory,
            caption: captionText,
            album: row.title || itemCategory,
            slug: row.slug || '',
            isGalleryUpload: true,
            source: 'gallery'
          });
        }
      });
    }
  }

  // 2. Process weekly journal photos from `journal_weeks` table
  for (const row of journalRows) {
    let entries = [];
    try {
      entries = typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries;
    } catch (_) {}

    if (Array.isArray(entries)) {
      entries.forEach((entry, idx) => {
        const imgSrc = entry.cdnImage || entry.image;
        const isPresaved = !imgSrc || 
                           imgSrc.startsWith('data:image/svg+xml') || 
                           imgSrc.includes('/assets/images/intro/') || 
                           imgSrc.includes('/assets/images/elder-salviejo.jpg');

        if (imgSrc && !isPresaved && !seenSrcs.has(imgSrc)) {
          seenSrcs.add(imgSrc);
          let itemCategory = entry.category;
          if (!itemCategory) {
            const rowTitle = row.title || '';
            if (/baptism/i.test(rowTitle)) itemCategory = 'Baptisms';
            else if (/companion/i.test(rowTitle)) itemCategory = 'Companions';
            else if (/service/i.test(rowTitle)) itemCategory = 'Service';
            else if (/district|zone/i.test(rowTitle)) itemCategory = 'District & Zone';
            else if (/transfer/i.test(rowTitle)) itemCategory = 'Transfers';
            else itemCategory = 'P-Day Journal';
          }

          photos.push({
            id: `journal-${row.slug || row.id}-${idx}`,
            src: imgSrc,
            date: row.published_at || row.created_at,
            category: itemCategory,
            caption: entry.text || entry.caption || '',
            album: row.title || itemCategory,
            slug: row.slug || '',
            isGalleryUpload: false,
            source: 'journal'
          });
        }
      });
    }
  }

  // Sort newest photos first
  photos.sort((a, b) => new Date(b.date) - new Date(a.date));
  return photos;
}

/**
 * Fetches a single week's full entries strictly from `journal_weeks`.
 */
async function getWeekBySlugOrId(identifier) {
  let row = null;

  if (isTursoConfigured()) {
    const db = getDbClient();
    const isNumeric = /^\d+$/.test(identifier);
    const sql = isNumeric
      ? `SELECT * FROM journal_weeks WHERE id = ? LIMIT 1;`
      : `SELECT * FROM journal_weeks WHERE slug = ? LIMIT 1;`;

    const result = await db.execute({ sql, args: [identifier] });
    if (result.rows.length === 0) return null;
    row = result.rows[0];
  } else {
    const weeks = readLocalDb();
    row = weeks.find(w => String(w.id) === String(identifier) || w.slug === String(identifier));
    if (!row) return null;
  }

  let parsedEntries = [];
  try {
    parsedEntries = typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries;
  } catch (err) {
    console.error('Error parsing entries JSON from DB:', err);
  }

  let parsedVerse = null;
  if (row.verse) {
    try {
      parsedVerse = typeof row.verse === 'string' ? JSON.parse(row.verse) : row.verse;
    } catch (_) {
      parsedVerse = { text: row.verse };
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    publishedAt: row.published_at,
    rawSubject: row.raw_subject,
    sender: row.sender,
    entries: parsedEntries,
    totalEntries: row.total_entries,
    imageCount: row.image_count,
    verse: parsedVerse,
    createdAt: row.created_at
  };
}

/**
 * Inserts a new email subscriber into the database
 */
async function addSubscriber(email) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Invalid email address format');
  }

  if (isTursoConfigured()) {
    const db = getDbClient();
    await db.execute({
      sql: `INSERT INTO subscribers (email) VALUES (?) ON CONFLICT(email) DO NOTHING;`,
      args: [normalized]
    });
    return { success: true, email: normalized, message: 'Subscribed successfully!' };
  } else {
    const subsPath = path.join(LOCAL_DATA_DIR, 'subscribers.json');
    let subs = [];
    if (fs.existsSync(subsPath)) {
      try { subs = JSON.parse(fs.readFileSync(subsPath, 'utf8')); } catch (_) {}
    }
    if (!subs.includes(normalized)) {
      subs.push(normalized);
      fs.writeFileSync(subsPath, JSON.stringify(subs, null, 2));
    }
    return { success: true, email: normalized, message: 'Subscribed successfully!' };
  }
}

/**
 * Retrieves all subscriber email addresses
 */
async function getAllSubscribers() {
  if (isTursoConfigured()) {
    const db = getDbClient();
    const res = await db.execute(`SELECT email FROM subscribers ORDER BY created_at ASC;`);
    return res.rows.map(r => r.email);
  } else {
    const subsPath = path.join(LOCAL_DATA_DIR, 'subscribers.json');
    if (fs.existsSync(subsPath)) {
      try { return JSON.parse(fs.readFileSync(subsPath, 'utf8')); } catch (_) {}
    }
    return [];
  }
}

/**
 * Checks if a messageId has already been recorded in Turso SQLite or local cache
 */
async function isMessageProcessed(messageId) {
  if (!messageId) return false;
  if (isTursoConfigured()) {
    const db = getDbClient();
    const res = await db.execute({
      sql: 'SELECT message_id FROM processed_messages WHERE message_id = ? LIMIT 1;',
      args: [String(messageId)]
    });
    return res.rows.length > 0;
  } else {
    const pPath = path.join(LOCAL_DATA_DIR, 'processed-messages.json');
    if (fs.existsSync(pPath)) {
      try {
        const list = JSON.parse(fs.readFileSync(pPath, 'utf8'));
        return Array.isArray(list) && list.includes(String(messageId));
      } catch (_) {}
    }
    return false;
  }
}

/**
 * Records a processed Gmail messageId into Turso SQLite database
 */
async function recordProcessedMessage({ messageId, subject, sender, status = 'processed' }) {
  if (!messageId) return { success: false, error: 'Missing messageId' };
  if (isTursoConfigured()) {
    const db = getDbClient();
    await db.execute({
      sql: `INSERT INTO processed_messages (message_id, subject, sender, status)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(message_id) DO UPDATE SET
              status = excluded.status,
              processed_at = CURRENT_TIMESTAMP;`,
      args: [String(messageId), subject || null, sender || null, status]
    });
    return { success: true, messageId };
  } else {
    const pPath = path.join(LOCAL_DATA_DIR, 'processed-messages.json');
    let list = [];
    if (fs.existsSync(pPath)) {
      try { list = JSON.parse(fs.readFileSync(pPath, 'utf8')); } catch (_) {}
    }
    if (!list.includes(String(messageId))) {
      list.push(String(messageId));
      fs.writeFileSync(pPath, JSON.stringify(list, null, 2));
    }
    return { success: true, messageId };
  }
}

/**
 * Retrieves all recipient emails who have already received the broadcast for a given week
 */
async function getBroadcastLogsForWeek(weekSlug) {
  if (!weekSlug) return [];
  if (isTursoConfigured()) {
    const db = getDbClient();
    const res = await db.execute({
      sql: 'SELECT recipient_email FROM broadcast_logs WHERE week_slug = ?;',
      args: [String(weekSlug)]
    });
    return res.rows.map(r => r.recipient_email.toLowerCase());
  } else {
    const bPath = path.join(LOCAL_DATA_DIR, 'broadcast-logs.json');
    if (fs.existsSync(bPath)) {
      try {
        const logs = JSON.parse(fs.readFileSync(bPath, 'utf8'));
        return Array.isArray(logs[weekSlug]) ? logs[weekSlug].map(e => e.toLowerCase()) : [];
      } catch (_) {}
    }
    return [];
  }
}

/**
 * Records sent broadcast recipient emails for a week into Turso SQLite database
 */
async function recordBroadcastLogs({ weekSlug, recipientEmails }) {
  if (!weekSlug || !Array.isArray(recipientEmails) || recipientEmails.length === 0) {
    return { success: true, recorded: 0 };
  }
  const cleanEmails = Array.from(new Set(recipientEmails.map(e => String(e).trim().toLowerCase()).filter(Boolean)));
  
  if (isTursoConfigured()) {
    const db = getDbClient();
    for (const email of cleanEmails) {
      try {
        await db.execute({
          sql: `INSERT INTO broadcast_logs (week_slug, recipient_email)
                VALUES (?, ?)
                ON CONFLICT(week_slug, recipient_email) DO NOTHING;`,
          args: [String(weekSlug), email]
        });
      } catch (_) {}
    }
    return { success: true, recorded: cleanEmails.length };
  } else {
    const bPath = path.join(LOCAL_DATA_DIR, 'broadcast-logs.json');
    let logs = {};
    if (fs.existsSync(bPath)) {
      try { logs = JSON.parse(fs.readFileSync(bPath, 'utf8')); } catch (_) {}
    }
    if (!logs[weekSlug]) logs[weekSlug] = [];
    cleanEmails.forEach(e => {
      if (!logs[weekSlug].includes(e)) logs[weekSlug].push(e);
    });
    fs.writeFileSync(bPath, JSON.stringify(logs, null, 2));
    return { success: true, recorded: cleanEmails.length };
  }
}

/**
 * Returns pending subscribers who have NOT yet received the broadcast for a week
 */
async function getPendingSubscribersForWeek(weekSlug, allRecipients = []) {
  const sent = await getBroadcastLogsForWeek(weekSlug);
  const sentSet = new Set(sent.map(s => s.toLowerCase()));
  return allRecipients.filter(e => !sentSet.has(e.toLowerCase()));
}

/**
 * Adds an encouragement message for a specific weekly diary entry
 */
async function addEncouragement({ slug, authorName, relationship = 'Family & Friends', message }) {
  const cleanSlug = (slug || '').trim();
  const cleanAuthor = (authorName || 'Family & Friend').trim().substring(0, 100);
  const cleanRel = (relationship || 'Family & Friends').trim().substring(0, 60);
  const cleanMsg = (message || '').trim().substring(0, 2000);

  if (!cleanSlug || !cleanMsg) {
    throw new Error('Missing required fields: slug and message');
  }

  if (isTursoConfigured()) {
    const db = getDbClient();
    const result = await db.execute({
      sql: `INSERT INTO family_encouragements (week_slug, author_name, relationship, message) VALUES (?, ?, ?, ?) RETURNING id, created_at;`,
      args: [cleanSlug, cleanAuthor, cleanRel, cleanMsg]
    });
    return {
      success: true,
      id: result.rows[0] ? result.rows[0].id : null,
      slug: cleanSlug,
      authorName: cleanAuthor,
      relationship: cleanRel,
      message: cleanMsg,
      createdAt: result.rows[0] ? result.rows[0].created_at : new Date().toISOString()
    };
  } else {
    const encPath = path.join(LOCAL_DATA_DIR, 'encouragements.json');
    let list = [];
    if (fs.existsSync(encPath)) {
      try { list = JSON.parse(fs.readFileSync(encPath, 'utf8')); } catch (_) {}
    }
    const newEntry = {
      id: Date.now(),
      week_slug: cleanSlug,
      author_name: cleanAuthor,
      relationship: cleanRel,
      message: cleanMsg,
      created_at: new Date().toISOString()
    };
    list.push(newEntry);
    fs.writeFileSync(encPath, JSON.stringify(list, null, 2));
    return {
      success: true,
      id: newEntry.id,
      slug: cleanSlug,
      authorName: cleanAuthor,
      relationship: cleanRel,
      message: cleanMsg,
      createdAt: newEntry.created_at
    };
  }
}

/**
 * Retrieves all encouragement messages for a specific week slug
 */
async function getEncouragementsForSlug(slug) {
  const cleanSlug = (slug || '').trim();
  if (!cleanSlug) return [];

  if (isTursoConfigured()) {
    try {
      const db = getDbClient();
      const res = await db.execute({
        sql: `SELECT id, week_slug, author_name, relationship, message, created_at FROM family_encouragements WHERE week_slug = ? ORDER BY created_at ASC;`,
        args: [cleanSlug]
      });
      return res.rows.map(r => ({
        id: r.id,
        slug: r.week_slug,
        authorName: r.author_name,
        relationship: r.relationship,
        message: r.message,
        createdAt: r.created_at
      }));
    } catch (_) {
      return [];
    }
  } else {
    const encPath = path.join(LOCAL_DATA_DIR, 'encouragements.json');
    if (fs.existsSync(encPath)) {
      try {
        const list = JSON.parse(fs.readFileSync(encPath, 'utf8'));
        return list.filter(item => item.week_slug === cleanSlug).map(r => ({
          id: r.id,
          slug: r.week_slug,
          authorName: r.author_name,
          relationship: r.relationship,
          message: r.message,
          createdAt: r.created_at
        }));
      } catch (_) {}
    }
    return [];
  }
}

/**
 * Calculates missionary milestone stats
 */
async function getMissionStats() {
  let weeksCount = 0;
  let firstPublishedAt = null;

  if (isTursoConfigured()) {
    try {
      const db = getDbClient();
      const weeksRes = await db.execute(`SELECT COUNT(*) as count FROM journal_weeks;`);
      weeksCount = weeksRes.rows[0] ? Number(weeksRes.rows[0].count) : 0;

      const dateRes = await db.execute(`SELECT MIN(published_at) as earliest FROM journal_weeks;`);
      firstPublishedAt = dateRes.rows[0] ? dateRes.rows[0].earliest : null;
    } catch (_) {}
  } else {
    const weeks = readLocalDb();
    weeksCount = weeks.length;
    if (weeks.length > 0) {
      firstPublishedAt = weeks[weeks.length - 1].published_at;
    }
  }

  const allPhotos = await getAllGalleryPhotos();
  const photosCount = allPhotos.length;

  const missionStart = firstPublishedAt ? new Date(firstPublishedAt) : new Date('2026-08-15');
  const now = new Date();
  const diffMs = Math.max(0, now - missionStart);
  const daysServed = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
  const monthsServed = Math.min(24, Math.max(1, Math.floor(daysServed / 30.4) + 1));

  return {
    daysServed,
    monthsServed,
    totalMonths: 24,
    totalWeeks: weeksCount,
    totalPhotos: photosCount,
    missionName: 'Philippines Dumaguete Mission',
    elderName: 'Elder Mark Salviejo'
  };
}

/**
 * Full-Text Search across all missionary letters, scripture notes, and gallery polaroids
 */
async function searchAllContent(query, limit = 30) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return [];
  }

  const cleanQ = query.trim().toLowerCase();
  const searchPattern = `%${cleanQ}%`;
  const results = [];

  if (isTursoConfigured()) {
    const db = getDbClient();

    // 1. Search journal_weeks
    try {
      const jRes = await db.execute({
        sql: `
          SELECT id, slug, title, published_at, raw_subject, sender, entries, verse, created_at
          FROM journal_weeks
          WHERE LOWER(title) LIKE ?
             OR LOWER(entries) LIKE ?
             OR LOWER(verse) LIKE ?
             OR LOWER(raw_subject) LIKE ?
          ORDER BY published_at DESC
          LIMIT ?;
        `,
        args: [searchPattern, searchPattern, searchPattern, searchPattern, limit]
      });

      for (const row of jRes.rows) {
        let entries = [];
        try {
          entries = typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries;
        } catch (_) {}

        let matchedSnippet = '';
        let matchedPhoto = '';

        if (Array.isArray(entries)) {
          for (const entry of entries) {
            const entryText = entry.text || '';
            if (entryText.toLowerCase().includes(cleanQ)) {
              matchedSnippet = extractSnippet(entryText, cleanQ);
              matchedPhoto = entry.cdnImage || entry.image || matchedPhoto;
              break;
            }
            if (entry.caption && entry.caption.toLowerCase().includes(cleanQ)) {
              matchedSnippet = extractSnippet(entry.caption, cleanQ);
              matchedPhoto = entry.cdnImage || entry.image || matchedPhoto;
              break;
            }
          }
        }

        let verseObj = null;
        try {
          verseObj = typeof row.verse === 'string' ? JSON.parse(row.verse) : row.verse;
        } catch (_) {}

        if (!matchedSnippet && verseObj) {
          if (verseObj.reference && verseObj.reference.toLowerCase().includes(cleanQ)) {
            matchedSnippet = `Scripture: ${verseObj.reference}`;
          } else if (verseObj.text && verseObj.text.toLowerCase().includes(cleanQ)) {
            matchedSnippet = extractSnippet(verseObj.text, cleanQ);
          }
        }

        if (!matchedSnippet) {
          matchedSnippet = row.title;
        }

        results.push({
          type: 'journal',
          id: row.id,
          slug: row.slug,
          title: row.title,
          date: row.published_at || row.created_at,
          snippet: matchedSnippet,
          image: matchedPhoto,
          url: `/week/${row.slug}`,
          source: 'P-Day Journal'
        });
      }
    } catch (err) {
      console.warn('Turso journal search warning:', err.message);
    }

    // 2. Search gallery
    try {
      const gRes = await db.execute({
        sql: `
          SELECT id, slug, title, published_at, category, body_text, entries, created_at
          FROM gallery
          WHERE LOWER(title) LIKE ?
             OR LOWER(body_text) LIKE ?
             OR LOWER(category) LIKE ?
             OR LOWER(entries) LIKE ?
          ORDER BY published_at DESC
          LIMIT ?;
        `,
        args: [searchPattern, searchPattern, searchPattern, searchPattern, limit]
      });

      for (const row of gRes.rows) {
        let entries = [];
        try {
          entries = typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries;
        } catch (_) {}

        let matchedPhoto = '';
        let matchedSnippet = row.body_text ? extractSnippet(row.body_text, cleanQ) : '';

        if (Array.isArray(entries)) {
          for (const entry of entries) {
            matchedPhoto = entry.cdnImage || entry.image || matchedPhoto;
            if (entry.caption && entry.caption.toLowerCase().includes(cleanQ)) {
              matchedSnippet = extractSnippet(entry.caption, cleanQ);
              break;
            }
          }
        }

        results.push({
          type: 'gallery',
          id: row.id,
          slug: row.slug,
          title: row.title,
          date: row.published_at || row.created_at,
          category: row.category || 'Mission',
          snippet: matchedSnippet || row.title,
          image: matchedPhoto,
          url: `/gallery`,
          source: 'Polaroid Gallery'
        });
      }
    } catch (err) {
      console.warn('Turso gallery search warning:', err.message);
    }
  } else {
    // Local memory fallback search
    const localWeeks = readLocalDb();
    const localGallery = readLocalGallery();

    for (const row of localWeeks) {
      const titleMatch = (row.title || '').toLowerCase().includes(cleanQ);
      const textMatch = JSON.stringify(row.entries || '').toLowerCase().includes(cleanQ);
      const verseMatch = JSON.stringify(row.verse || '').toLowerCase().includes(cleanQ);

      if (titleMatch || textMatch || verseMatch) {
        results.push({
          type: 'journal',
          id: row.id || row.slug,
          slug: row.slug,
          title: row.title,
          date: row.published_at,
          snippet: row.title,
          image: '',
          url: `/week/${row.slug}`,
          source: 'P-Day Journal'
        });
      }
    }

    for (const row of localGallery) {
      const titleMatch = (row.title || '').toLowerCase().includes(cleanQ);
      const textMatch = JSON.stringify(row.entries || '').toLowerCase().includes(cleanQ);
      if (titleMatch || textMatch) {
        results.push({
          type: 'gallery',
          id: row.id || row.slug,
          slug: row.slug,
          title: row.title,
          date: row.published_at,
          category: row.category || 'Mission',
          snippet: row.title,
          image: '',
          url: `/gallery`,
          source: 'Polaroid Gallery'
        });
      }
    }
  }

  // Sort search results descending by date
  results.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return results.slice(0, limit);
}

function extractSnippet(fullText, query, maxLen = 140) {
  if (!fullText) return '';
  const idx = fullText.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return fullText.length > maxLen ? fullText.slice(0, maxLen) + '...' : fullText;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(fullText.length, idx + query.length + 80);
  let snippet = fullText.slice(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < fullText.length) snippet = snippet + '...';
  return snippet;
}

/**
 * Complete Database Export & Keepsake Backup
 * Returns all tables, metadata, and counts as structured JSON.
 */
async function exportCompleteDatabase() {
  const backup = {
    appName: 'Elder Salviejo • Weekly Missionary Journal Vault',
    mission: 'Philippines Dumaguete Mission',
    exportedAt: new Date().toISOString(),
    tables: {
      journal_weeks: [],
      gallery: [],
      subscribers: [],
      family_encouragements: [],
      processed_messages: [],
      broadcast_logs: []
    },
    counts: {}
  };

  if (isTursoConfigured()) {
    const db = getDbClient();
    try {
      const j = await db.execute(`SELECT * FROM journal_weeks ORDER BY published_at DESC;`);
      backup.tables.journal_weeks = j.rows;
    } catch (_) {}

    try {
      const g = await db.execute(`SELECT * FROM gallery ORDER BY published_at DESC;`);
      backup.tables.gallery = g.rows;
    } catch (_) {}

    try {
      const s = await db.execute(`SELECT id, email, created_at FROM subscribers ORDER BY created_at DESC;`);
      backup.tables.subscribers = s.rows;
    } catch (_) {}

    try {
      const e = await db.execute(`SELECT * FROM family_encouragements ORDER BY created_at DESC;`);
      backup.tables.family_encouragements = e.rows;
    } catch (_) {}

    try {
      const p = await db.execute(`SELECT * FROM processed_messages ORDER BY processed_at DESC;`);
      backup.tables.processed_messages = p.rows;
    } catch (_) {}

    try {
      const b = await db.execute(`SELECT * FROM broadcast_logs ORDER BY sent_at DESC;`);
      backup.tables.broadcast_logs = b.rows;
    } catch (_) {}
  } else {
    backup.tables.journal_weeks = readLocalDb();
    backup.tables.gallery = readLocalGallery();
    backup.tables.subscribers = readLocalSubscribers();
    backup.tables.family_encouragements = readLocalEncouragements();
  }

  backup.counts = {
    journalWeeks: backup.tables.journal_weeks.length,
    galleryAlbums: backup.tables.gallery.length,
    subscribers: backup.tables.subscribers.length,
    encouragements: backup.tables.family_encouragements.length,
    processedMessages: backup.tables.processed_messages.length
  };

  return backup;
}

module.exports = {
  isTursoConfigured,
  getDbClient,
  initDatabase,
  saveWeeklyDiary,
  saveGalleryEntry,
  getAllWeeks,
  getWeekBySlugOrId,
  addSubscriber,
  getAllSubscribers,
  getAllGalleryPhotos,
  isMessageProcessed,
  recordProcessedMessage,
  getBroadcastLogsForWeek,
  recordBroadcastLogs,
  getPendingSubscribersForWeek,
  addEncouragement,
  getEncouragementsForSlug,
  getMissionStats,
  searchAllContent,
  exportCompleteDatabase
};
