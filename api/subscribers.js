/**
 * Vercel Serverless Function: GET /api/subscribers
 * 
 * Secure endpoint to fetch all subscribers. Requires Bearer <INGEST_SECRET>.
 */

const { getAllSubscribers, initDatabase } = require('../lib/turso');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const authHeader = req.headers.authorization || '';
  const xSecret = req.headers['x-ingest-secret'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || xSecret;
  const configuredSecret = process.env.INGEST_SECRET;

  if (configuredSecret && token !== configuredSecret) {
    return res.status(401).json({ error: 'Unauthorized: Invalid authentication secret' });
  }

  try {
    await initDatabase();
    const subscribers = await getAllSubscribers();
    return res.status(200).json({
      success: true,
      count: subscribers.length,
      subscribers
    });
  } catch (error) {
    console.error('Error fetching subscribers:', error);
    return res.status(500).json({ error: 'Failed to retrieve subscribers', details: error.message });
  }
};
