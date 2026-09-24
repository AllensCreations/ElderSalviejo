/**
 * Vercel Serverless Function: GET /api/book
 *
 * Fetches all weekly journals with parsed entries and verses in ascending chronological order
 * for the complete Elder Salviejo Memory Book & PDF Maker.
 * Highly cached at edge for instant compilation without sequential database queries.
 */

const { getFullBookWeeks, initDatabase, isTursoConfigured } = require('../lib/turso');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Edge and browser cache: 5 minutes max-age with 10 minute stale-while-revalidate window
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.setHeader('Content-Type', 'application/json');

  const tursoReady = isTursoConfigured();

  try {
    await initDatabase();
    const weeks = await getFullBookWeeks();

    return res.status(200).json({
      success: true,
      count: weeks.length,
      weeks,
      _debug: { tursoConfigured: tursoReady }
    });
  } catch (error) {
    console.error('[/api/book] Error fetching book weeks:', error);
    return res.status(500).json({
      error: 'Internal Server Error fetching mission record book',
      details: error.message,
      _debug: { tursoConfigured: tursoReady }
    });
  }
};
