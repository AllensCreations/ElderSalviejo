/**
 * Vercel Serverless Function: /api/tracking/message
 * 
 * Manages Gmail message processing status in Turso SQLite Database.
 * GET /api/tracking/message?id=<messageId> -> Returns { isProcessed: boolean }
 * POST /api/tracking/message -> Body { messageId, subject, sender, status } -> Records message
 */

const { isMessageProcessed, recordProcessedMessage, initDatabase } = require('../../lib/turso');

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
      const messageId = (req.query && req.query.id) || (req.url && new URL(req.url, 'http://localhost').searchParams.get('id'));
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
  } catch (error) {
    console.error('Error in /api/tracking/message:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};
