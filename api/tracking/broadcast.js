/**
 * Vercel Serverless Function: /api/tracking/broadcast
 * 
 * Manages Weekly Broadcast subscriber recipient logs in Turso SQLite Database.
 * GET /api/tracking/broadcast?slug=<weekSlug> -> Returns { sentRecipients: [...] }
 * POST /api/tracking/broadcast -> Body { weekSlug, recipientEmails: [...] } -> Records logs
 */

const { getBroadcastLogsForWeek, recordBroadcastLogs, initDatabase } = require('../../lib/turso');

function verifySecret(req) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return false;
  const authHeader = req.headers['authorization'] || '';
  const xSecret = req.headers['x-ingest-secret'] || '';

  if (xSecret === secret) return true;
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim() === secret;
  }
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!verifySecret(req)) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid secret token' });
  }

  try {
    await initDatabase();

    if (req.method === 'GET') {
      const slug = (req.query && req.query.slug) || (req.url && new URL(req.url, 'http://localhost').searchParams.get('slug'));
      if (!slug) {
        return res.status(400).json({ error: 'Missing required query parameter: `slug`' });
      }

      const sentRecipients = await getBroadcastLogsForWeek(slug);
      return res.status(200).json({ success: true, slug, sentRecipients });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { weekSlug, recipientEmails } = body || {};

      if (!weekSlug || !Array.isArray(recipientEmails)) {
        return res.status(400).json({ error: 'Missing required parameters: `weekSlug` (string) and `recipientEmails` (array)' });
      }

      const result = await recordBroadcastLogs({ weekSlug, recipientEmails });
      return res.status(200).json({ success: true, result });
    }
  } catch (error) {
    console.error('Error in /api/tracking/broadcast:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};
