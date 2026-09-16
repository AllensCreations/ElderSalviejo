/**
 * Vercel Serverless Function: GET /api/weeks
 * 
 * Fetches the list of all weekly diaries from Turso SQLite database
 * for the Index Vault directory.
 */

const crypto = require('crypto');
const { getAllWeeks, initDatabase } = require('../../lib/turso');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    await initDatabase();
    const weeks = await getAllWeeks();
    const payload = JSON.stringify({
      success: true,
      count: weeks.length,
      weeks
    });

    const etag = '"' + crypto.createHash('md5').update(payload).digest('hex').slice(0, 16) + '"';
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    if (req.headers && req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', 'application/json');
    if (res.send) {
      return res.status(200).send(payload);
    }
    return res.status(200).end(payload);
  } catch (error) {
    console.error('Error fetching weeks:', error);
    return res.status(500).json({
      error: 'Internal Server Error fetching diary weeks',
      details: error.message
    });
  }
};
