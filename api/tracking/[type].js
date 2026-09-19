/**
 * Vercel Serverless Function: /api/tracking/[type]
 * Consolidates /api/tracking/broadcast and /api/tracking/message into a single
 * serverless function to respect Vercel Hobby plan's 12 function limit.
 * 
 * Routes:
 * - /api/tracking/broadcast (GET, POST)
 * - /api/tracking/message   (GET, POST)
 */

const {
  isMessageProcessed,
  recordProcessedMessage,
  getBroadcastLogsForWeek,
  recordBroadcastLogs,
  initDatabase
} = require('../../lib/turso');

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

  // Determine tracking type from route param, query param, or URL path
  const parsedUrl = new URL(req.url, 'http://localhost');
  const type = req.query.type ||
               (parsedUrl.pathname.includes('broadcast') ? 'broadcast' :
                parsedUrl.pathname.includes('message') ? 'message' : '');

  try {
    await initDatabase();

    // -------------------------------------------------------------
    // TYPE A: Message Tracking (/api/tracking/message)
    // -------------------------------------------------------------
    if (type === 'message') {
      if (req.method === 'GET') {
        const messageId = (req.query && req.query.id) || parsedUrl.searchParams.get('id');
        if (!messageId) {
          return res.status(400).json({ error: 'Missing required query parameter: `id`' });
        }

        const isProcessed = await isMessageProcessed(messageId);
        return res.status(200).json({ success: true, messageId, isProcessed });
      }

      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { messageId, subject, sender, status = 'processed' } = body || {};

        if (!messageId) {
          return res.status(400).json({ error: 'Missing required body parameter: `messageId`' });
        }

        const result = await recordProcessedMessage({ messageId, subject, sender, status });
        return res.status(200).json({ success: true, result });
      }
    }

    // -------------------------------------------------------------
    // TYPE B: Broadcast Recipient Tracking (/api/tracking/broadcast)
    // -------------------------------------------------------------
    if (type === 'broadcast') {
      if (req.method === 'GET') {
        const slug = (req.query && req.query.slug) || parsedUrl.searchParams.get('slug');
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
    }

    return res.status(400).json({ error: `Unknown tracking type: "${type}". Expected 'message' or 'broadcast'.` });

  } catch (error) {
    console.error(`Error in /api/tracking/${type}:`, error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};
