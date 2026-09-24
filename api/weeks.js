/**
 * Vercel Serverless Function: /api/weeks, /api/weeks/:id, and /api/book
 * 
 * Unified handler to keep total Serverless Functions well below Vercel Hobby's 12-function limit.
 * - GET /api/weeks           -> list of all weeks (lightweight summary, s-maxage=30)
 * - GET /api/weeks?id=:id    -> single week full reflection details (s-maxage=300)
 * - GET /api/weeks?type=book -> full book batch for PDF maker & scrapbook (s-maxage=300)
 */

const { getAllWeeks, getWeekBySlugOrId, getFullBookWeeks, initDatabase, isTursoConfigured } = require('../lib/turso');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { id, slug, type, format } = req.query || {};
  const requestedId = id || slug;
  const isBookRequest = type === 'book' || format === 'book';

  const tursoReady = isTursoConfigured();

  try {
    await initDatabase();

    // 1. Batch Book Request (for PDF Maker & Memory Book)
    if (isBookRequest) {
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      res.setHeader('Content-Type', 'application/json');

      const weeks = await getFullBookWeeks();
      return res.status(200).json({
        success: true,
        count: weeks.length,
        weeks,
        _debug: { tursoConfigured: tursoReady }
      });
    }

    // 2. Single Week Details Request
    if (requestedId) {
      const week = await getWeekBySlugOrId(requestedId);
      if (!week) {
        return res.status(404).json({ error: `Week not found with identifier: ${requestedId}` });
      }

      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        success: true,
        week
      });
    }

    // 3. All Weeks Summary List (for Index Vault Archive)
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    res.setHeader('Content-Type', 'application/json');

    const weeks = await getAllWeeks();
    return res.status(200).json({
      success: true,
      count: weeks.length,
      weeks,
      _debug: { tursoConfigured: tursoReady }
    });
  } catch (error) {
    console.error('[/api/weeks] Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error handling weeks request',
      details: error.message,
      _debug: { tursoConfigured: tursoReady }
    });
  }
};
