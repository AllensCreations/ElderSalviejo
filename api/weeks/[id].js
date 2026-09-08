/**
 * Vercel Serverless Function: GET /api/weeks/[id]
 * 
 * Fetches the complete payload (including the 7 daily reflections and Base64 images)
 * for a specific week by slug or integer ID.
 */

const { getWeekBySlugOrId, initDatabase } = require('../../lib/turso');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Support Vercel route params or query param
  const id = req.query.id || req.query.slug;

  if (!id) {
    return res.status(400).json({ error: 'Missing week id or slug parameter' });
  }

  try {
    await initDatabase();
    const week = await getWeekBySlugOrId(id);

    if (!week) {
      return res.status(404).json({ error: `Week not found with identifier: ${id}` });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return res.status(200).json({
      success: true,
      week
    });
  } catch (error) {
    console.error(`❌ Error fetching week ${id}:`, error);
    return res.status(500).json({
      error: 'Internal Server Error retrieving week',
      details: error.message
    });
  }
};
