/**
 * Turso SQLite Database Client Helper
 * 
 * Uses @libsql/client/web for universal compatibility across:
 * - Vercel Edge & Serverless Functions
 * - Node.js environments
 * - Lightweight environments without native C++ compilation
 */

const { createClient } = require('@libsql/client/web');

// Cache the client instance across serverless invocations
let clientInstance = null;

function getDbClient() {
  if (clientInstance) return clientInstance;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    console.warn(
      '⚠️  TURSO_DATABASE_URL is not configured in environment variables. Database operations may fail.'
    );
  }

  clientInstance = createClient({
    url: url || 'http://127.0.0.1:8080',
    authToken: authToken || undefined,
  });

  return clientInstance;
}

/**
 * Initializes the required tables and indexes if they do not already exist.
 */
async function initDatabase() {
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

  await db.execute(createTableQuery);
  await db.execute(indexSlugQuery);
  await db.execute(indexDateQuery);

  return { success: true, message: 'Database schema initialized successfully.' };
}

/**
 * Inserts or updates a weekly diary record.
 */
async function saveWeeklyDiary({ slug, title, publishedAt, rawSubject, sender, entries, totalEntries, imageCount }) {
  const db = getDbClient();
  const entriesJson = typeof entries === 'string' ? entries : JSON.stringify(entries);

  const query = `
    INSERT INTO journal_weeks (slug, title, published_at, raw_subject, sender, entries, total_entries, image_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      published_at = excluded.published_at,
      raw_subject = excluded.raw_subject,
      sender = excluded.sender,
      entries = excluded.entries,
      total_entries = excluded.total_entries,
      image_count = excluded.image_count,
      created_at = CURRENT_TIMESTAMP;
  `;

  const result = await db.execute({
    sql: query,
    args: [
      slug,
      title,
      publishedAt,
      rawSubject || null,
      sender || null,
      entriesJson,
      totalEntries || 7,
      imageCount || 0
    ]
  });

  return result;
}

/**
 * Fetches all weeks for the Index Vault (mini-inbox summary).
 * Truncates entries to only return metadata + first entry image preview to keep response light.
 */
async function getAllWeeks() {
  const db = getDbClient();
  const result = await db.execute(`
    SELECT id, slug, title, published_at, raw_subject, sender, total_entries, image_count, created_at, entries
    FROM journal_weeks
    ORDER BY published_at DESC;
  `);

  return result.rows.map(row => {
    let previewImage = null;
    let snippet = '';
    try {
      const parsedEntries = JSON.parse(row.entries);
      if (Array.isArray(parsedEntries) && parsedEntries.length > 0) {
        previewImage = parsedEntries[0].image || null;
        snippet = parsedEntries[0].text ? parsedEntries[0].text.substring(0, 140) + '...' : '';
      }
    } catch (_) {}

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      publishedAt: row.published_at,
      rawSubject: row.raw_subject,
      sender: row.sender,
      totalEntries: row.total_entries,
      imageCount: row.image_count,
      createdAt: row.created_at,
      previewImage,
      snippet
    };
  });
}

/**
 * Fetches a single week's full entries by slug or id for the Dynamic Viewer.
 */
async function getWeekBySlugOrId(identifier) {
  const db = getDbClient();
  
  const isNumeric = /^\d+$/.test(identifier);
  const sql = isNumeric
    ? `SELECT * FROM journal_weeks WHERE id = ? LIMIT 1;`
    : `SELECT * FROM journal_weeks WHERE slug = ? LIMIT 1;`;

  const result = await db.execute({
    sql,
    args: [identifier]
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  let parsedEntries = [];
  try {
    parsedEntries = JSON.parse(row.entries);
  } catch (err) {
    console.error('Error parsing entries JSON from DB:', err);
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
    createdAt: row.created_at
  };
}

module.exports = {
  getDbClient,
  initDatabase,
  saveWeeklyDiary,
  getAllWeeks,
  getWeekBySlugOrId
};
