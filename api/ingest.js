/**
 * Vercel Serverless Function: POST /api/ingest
 * 
 * Receives the structured weekly diary JSON payload from Google Apps Script,
 * validates the Bearer token against INGEST_SECRET,
 * and writes the entry into the Turso SQLite database.
 */

const { saveWeeklyDiary, initDatabase, getAllSubscribers } = require('../lib/turso');
const { lookupScripture } = require('../lib/scriptures');

module.exports = async function handler(req, res) {
  // Allow CORS preflight if needed
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // 1. Authenticate secret token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const configuredSecret = process.env.INGEST_SECRET;

  if (configuredSecret && token !== configuredSecret) {
    console.warn('⚠️ Unauthorized /api/ingest attempt with invalid token.');
    return res.status(401).json({
      error: 'Unauthorized: Invalid or missing Authorization Bearer token'
    });
  }

  try {
    // Parse body if received as raw string or stream
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (parseErr) {
        return res.status(400).json({ error: 'Invalid JSON payload in request body' });
      }
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Empty or invalid JSON body' });
    }

    const {
      slug,
      title,
      publishedAt = new Date().toISOString(),
      rawSubject,
      sender,
      entries,
      totalEntries,
      imageCount,
      verse
    } = body;

    if (!title) {
      return res.status(400).json({ error: 'Missing required field: `title`' });
    }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Missing or empty required field: `entries` array' });
    }

    // Auto-generate slug if not provided
    const cleanSlug = slug || generateSlug(title, new Date(publishedAt));

    const finalTotal = typeof totalEntries === 'number' ? totalEntries : entries.length;
    const finalImages = typeof imageCount === 'number' ? imageCount : entries.filter(e => !!e.image).length;

    // Automatic Scripture Lookup via bcbooks/scriptures-json
    let resolvedVerse = null;
    if (verse) {
      if (typeof verse === 'string') {
        const found = await lookupScripture(verse);
        resolvedVerse = found || { reference: verse, text: '' };
      } else if (typeof verse === 'object') {
        if (verse.reference && (!verse.text || verse.text.trim() === '')) {
          const found = await lookupScripture(verse.reference);
          resolvedVerse = found || verse;
        } else {
          resolvedVerse = verse;
        }
      }
    }

    // Ensure database table exists
    await initDatabase();

    // Persist into Turso SQLite
    await saveWeeklyDiary({
      slug: cleanSlug,
      title,
      publishedAt,
      rawSubject: rawSubject || null,
      sender: sender || null,
      entries,
      totalEntries: finalTotal,
      imageCount: finalImages,
      verse: resolvedVerse
    });

    console.log(`✅ Successfully ingested weekly diary: "${title}" (slug: ${cleanSlug})`);

    const subscribers = await getAllSubscribers();

    return res.status(200).json({
      success: true,
      message: 'Weekly diary ingested and stored successfully',
      slug: cleanSlug,
      title,
      publishedAt,
      entriesCount: entries.length,
      imageCount: finalImages,
      viewUrl: `/week/${cleanSlug}`,
      subscribers: subscribers || []
    });
  } catch (error) {
    console.error('❌ Error processing /api/ingest:', error);
    return res.status(500).json({
      error: 'Internal Server Error during ingestion',
      details: error.message
    });
  }
};

function generateSlug(title, date) {
  const d = date instanceof Date && !isNaN(date) ? date : new Date();
  const dateStr = d.toISOString().split('T')[0];
  const cleanTitle = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${dateStr}-${cleanTitle}`.substring(0, 64);
}
