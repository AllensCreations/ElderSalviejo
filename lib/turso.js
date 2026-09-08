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

      // Safely ensure verse and is_gallery columns exist on existing installations
      try {
        await db.execute(`ALTER TABLE journal_weeks ADD COLUMN verse TEXT;`);
      } catch (_) {}
      try {
        await db.execute(`ALTER TABLE journal_weeks ADD COLUMN is_gallery INTEGER DEFAULT 0;`);
      } catch (_) {}

      return { success: true, mode: 'turso', message: 'Turso SQLite database schema initialized successfully.' };
    } catch (err) {
      console.warn('⚠️ Turso initialization notice (network or config):', err.message);
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
      console.warn('⚠️ Turso cloud query failed, falling back to local vault:', dbErr.message);
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
        previewImage = parsedEntries[0].image || null;
        snippet = parsedEntries[0].text ? parsedEntries[0].text.substring(0, 140) + '...' : '';
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
 * 1. Dedicated gallery uploads (passcode 073000, is_gallery = 1)
 * 2. Weekly diary photos from all journal weeks (passcode 159266)
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
      console.warn('⚠️ Turso cloud query failed for gallery, falling back to local vault:', dbErr.message);
      rows = readLocalDb();
      rows.sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
    }
  } else {
    rows = readLocalDb();
    rows.sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
  }

  const photos = [];
  const seenSrcs = new Set();

  // Collect photos from database entries (both 073000 gallery uploads and 159266 diary entries)
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
          photos.push({
            id: `photo-${row.slug || row.id}-${idx}`,
            src: imgSrc,
            date: row.published_at || row.created_at,
            isGalleryUpload: Boolean(row.is_gallery),
            source: row.is_gallery ? '073000' : '159266'
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

module.exports = {
  isTursoConfigured,
  getDbClient,
  initDatabase,
  saveWeeklyDiary,
  getAllWeeks,
  getWeekBySlugOrId,
  addSubscriber,
  getAllSubscribers,
  getAllGalleryPhotos
};

