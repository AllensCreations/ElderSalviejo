/**
 * Vercel Serverless Function: GET /api/stats
 * 
 * Fetches missionary milestone statistics:
 * Days served, months served out of 24, total journal weeks, total polaroids.
 */

const { getMissionStats, initDatabase } = require('../lib/turso');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    await initDatabase();
    const stats = await getMissionStats();

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error in /api/stats:', error);
    return res.status(500).json({
      error: 'Internal Server Error fetching mission stats',
      details: error.message
    });
  }
};
