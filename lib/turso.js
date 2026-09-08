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

/**
 * Turso SQLite Database Client Helper with Local Fallback
 * 
 * - When TURSO_DATABASE_URL is provided: Connects via @libsql/client/web to Turso Cloud SQLite.
 * - When TURSO_DATABASE_URL is not set: Automatically falls back to a local JSON database
 *   (data/local-vault.json) so the application runs immediately without cloud setup.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client/web');

const LOCAL_DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_DB_PATH = path.join(LOCAL_DATA_DIR, 'local-vault.json');

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

// -------------------------------------------------------------
// Local JSON Storage Helpers (Used when TURSO_DATABASE_URL is unset)
// -------------------------------------------------------------
function readLocalDb() {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      // Seed with sample data if available
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

// -------------------------------------------------------------
// Database Operations
// -------------------------------------------------------------

/**
 * Initializes the required tables and indexes if using Turso,
 * or prepares the local data directory.
 */
async function initDatabase() {
  if (isTursoConfigured()) {
    const db = getDbClient();
    const createTableQuery = `
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    const indexSlugQuery = `CREATE INDEX IF NOT EXISTS idx_journal_weeks_slug ON journal_weeks(slug);`;
    const indexDateQuery = `CREATE INDEX IF NOT EXISTS idx_journal_weeks_published_at ON journal_weeks(published_at DESC);`;

    const createSubscribersQuery = `
      CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    const indexSubscribersEmail = `CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);`;

    try {
      await db.execute(createTableQuery);
      await db.execute(indexSlugQuery);
      await db.execute(indexDateQuery);
      await db.execute(createSubscribersQuery);
      await db.execute(indexSubscribersEmail);

      // 1. Processed messages table for anti-duplicate tracking in Turso
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

      // 2. Broadcast logs table for single-broadcast delivery per subscriber in Turso
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

      // Safely ensure verse and is_gallery columns exist on existing installations
      try {
        await db.execute(`ALTER TABLE journal_weeks ADD COLUMN verse TEXT;`);
      } catch (_) {}
      try {
        await db.execute(`ALTER TABLE journal_weeks ADD COLUMN is_gallery INTEGER DEFAULT 0;`);
      } catch (_) {}

      return { success: true, mode: 'turso', message: 'Turso SQLite database schema initialized successfully.' };
    } catch (err) {
      console.warn('Turso initialization notice (network or config):', err.message);
      readLocalDb();
      return { success: true, mode: 'local', message: 'Local vault database ready at data/local-vault.json.' };
    }
  } else {
    readLocalDb();
    return { success: true, mode: 'local', message: 'Local vault database initialized at data/local-vault.json.' };
  }
}

/**
 * Inserts or updates a weekly diary or gallery record.
 */
async function saveWeeklyDiary({ slug, title, publishedAt, rawSubject, sender, entries, totalEntries, imageCount, verse, isGallery }) {
  const entriesJson = typeof entries === 'string' ? entries : JSON.stringify(entries);
  const verseJson = verse ? (typeof verse === 'string' ? verse : JSON.stringify(verse)) : null;
  const isGalleryInt = isGallery ? 1 : 0;

  if (isTursoConfigured()) {
    const db = getDbClient();
    const query = `
      INSERT INTO journal_weeks (slug, title, published_at, raw_subject, sender, entries, total_entries, image_count, verse, is_gallery)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        published_at = excluded.published_at,
        raw_subject = excluded.raw_subject,
        sender = excluded.sender,
        entries = excluded.entries,
        total_entries = excluded.total_entries,
        image_count = excluded.image_count,
        verse = excluded.verse,
        is_gallery = excluded.is_gallery,
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
        verseJson,
        isGalleryInt
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
      is_gallery: isGalleryInt,
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
 * Fetches all weeks for the Index Vault (mini-inbox summary).
 * Excludes pure gallery uploads so the diary vault remains focused on weekly journals.
 */
async function getAllWeeks() {
  let rows = [];

  if (isTursoConfigured()) {
    try {
      const db = getDbClient();
      const result = await db.execute(`
        SELECT id, slug, title, published_at, raw_subject, sender, total_entries, image_count, verse, created_at, entries, is_gallery
        FROM journal_weeks
        WHERE is_gallery = 0 OR is_gallery IS NULL
        ORDER BY published_at DESC;
      `);
      rows = result.rows;
    } catch (dbErr) {
      console.warn('Turso cloud query failed, falling back to local vault:', dbErr.message);
      rows = readLocalDb().filter(w => !w.is_gallery || w.is_gallery === 0);
      rows.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    }
  } else {
    rows = readLocalDb().filter(w => !w.is_gallery || w.is_gallery === 0);
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
 * Fetches all photos for the dedicated Polaroid Image Gallery.
 * Aggregates:
 * 1. Dedicated gallery uploads (is_gallery = 1)
 * 2. Weekly diary photos from all journal weeks
 * Strictly excludes any pre-saved starter/demo placeholder images so the gallery begins empty
 * until real emails arrive!
 */
async function getAllGalleryPhotos() {
  let rows = [];

  if (isTursoConfigured()) {
    try {
      const db = getDbClient();
      const result = await db.execute(`
        SELECT id, slug, title, published_at, created_at, entries, is_gallery
        FROM journal_weeks
        ORDER BY published_at DESC;
      `);
      rows = result.rows;
    } catch (dbErr) {
      console.warn('Turso cloud query failed for gallery, falling back to local vault:', dbErr.message);
      rows = readLocalDb();
      rows.sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
    }
  } else {
    rows = readLocalDb();
    rows.sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
  }

  const photos = [];
  const seenSrcs = new Set();

  // Collect photos from database entries (both gallery uploads and diary entries)
  for (const row of rows) {
    let entries = [];
    try {
      entries = typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries;
    } catch (_) {}

    if (Array.isArray(entries)) {
      entries.forEach((entry, idx) => {
        const imgSrc = entry.cdnImage || entry.image;
        // Strictly exclude dummy sample SVGs or local assets to ensure no presaved images appear in gallery
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
            else itemCategory = row.is_gallery ? 'Mission' : 'P-Day Journal';
          }

          photos.push({
            id: `photo-${row.slug || row.id}-${idx}`,
            src: imgSrc,
            date: row.published_at || row.created_at,
            category: itemCategory,
            caption: entry.text || entry.caption || '',
            album: row.title || itemCategory,
            slug: row.slug || '',
            isGalleryUpload: Boolean(row.is_gallery),
            source: row.is_gallery ? 'gallery' : 'journal'
          });
        }
      });
    }
  }

  return photos;
}

/**
 * Fetches a single week's full entries by slug or id for the Dynamic Viewer.
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

module.exports = {
  isTursoConfigured,
  getDbClient,
  initDatabase,
  saveWeeklyDiary,
  getAllWeeks,
  getWeekBySlugOrId,
  addSubscriber,
  getAllSubscribers,
  getAllGalleryPhotos,
  isMessageProcessed,
  recordProcessedMessage,
  getBroadcastLogsForWeek,
  recordBroadcastLogs,
  getPendingSubscribersForWeek
};

