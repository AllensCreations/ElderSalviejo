/**
 * Vercel Serverless Function: GET /api/weeks
 * 
 * Fetches the list of all weekly diaries from Turso SQLite database
 * for the Index Vault directory.
 */

const { getAllWeeks, initDatabase } = require('../../lib/turso');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    await initDatabase();
    const weeks = await getAllWeeks();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      success: true,
      count: weeks.length,
      weeks
    });
  } catch (error) {
    console.error('Error fetching weeks:', error);
    return res.status(500).json({
      error: 'Internal Server Error fetching diary weeks',
      details: error.message
    });
  }
};
