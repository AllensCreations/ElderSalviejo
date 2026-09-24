/**
 * Vercel Serverless Function: GET /api/weeks
 * 
 * Fetches the list of all weekly diaries from Turso SQLite database
 * for the Index Vault directory.
 */

const { getAllWeeks, initDatabase, isTursoConfigured } = require('../../lib/turso');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Edge SWR cache: fast archive loading with background refresh
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.setHeader('Content-Type', 'application/json');

  const tursoReady = isTursoConfigured();
  if (!tursoReady) {
    console.warn('[/api/weeks] TURSO_DATABASE_URL is not configured — falling back to local-vault.json. On Vercel, set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in project environment variables.');
  }

  try {
    await initDatabase();
    const weeks = await getAllWeeks();

    console.log(`[/api/weeks] Returned ${weeks.length} weeks (turso=${tursoReady})`);

    return res.status(200).json({
      success: true,
      count: weeks.length,
      weeks,
      _debug: { tursoConfigured: tursoReady }
    });
  } catch (error) {
    console.error('[/api/weeks] Error fetching weeks:', error);
    return res.status(500).json({
      error: 'Internal Server Error fetching diary weeks',
      details: error.message,
      _debug: { tursoConfigured: tursoReady }
    });
  }
};
