/**
 * Vercel Serverless Function: GET /api/search
 * 
 * Full-text search across all missionary letters, scripture notes,
 * daily reflections, and Polaroid gallery albums.
 */

const { searchAllContent, initDatabase } = require('../lib/turso');

module.exports = async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD', 'OPTIONS']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const query = req.query.q || req.query.query || '';
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

  if (!query || query.trim().length === 0) {
    return res.status(200).json({
      success: true,
      query: '',
      count: 0,
      results: []
    });
  }

  try {
    await initDatabase();
    const results = await searchAllContent(query, limit);

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({
      success: true,
      query: query.trim(),
      count: results.length,
      results
    });
  } catch (error) {
    console.error('Search API Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error searching vault',
      details: error.message
    });
  }
};
