/**
 * Vercel Serverless Function: /api/encouragements
 * 
 * Allows family, friends, and ward members to leave notes of encouragement
 * for Elder Salviejo on specific weekly journal entries.
 * GET /api/encouragements?slug=<weekSlug>
 * POST /api/encouragements { slug, authorName, relationship, message }
 */

const { addEncouragement, getEncouragementsForSlug, initDatabase } = require('../lib/turso');
const { checkRateLimit, isHoneypotTriggered } = require('../lib/rate-limiter');

module.exports = async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    await initDatabase();

    if (req.method === 'GET') {
      const slug = (req.query && req.query.slug) || (req.url && new URL(req.url, 'http://localhost').searchParams.get('slug'));
      if (!slug) {
        return res.status(400).json({ error: 'Missing required query parameter: `slug`' });
      }

      const list = await getEncouragementsForSlug(slug);
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({ success: true, count: list.length, encouragements: list });
    }

    if (req.method === 'POST') {
      // IP Rate Limiting: Max 6 encouragement notes per minute
      const { limited } = checkRateLimit(req, 6, 60000);
      if (limited) {
        return res.status(429).json({
          error: 'Too many submissions. Please wait a moment before posting another encouragement note.'
        });
      }

      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (_) {
          return res.status(400).json({ error: 'Invalid JSON request body' });
        }
      }

      // Honeypot check
      if (isHoneypotTriggered(body)) {
        return res.status(200).json({
          success: true,
          message: 'Your encouragement note has been sent to Elder Salviejo!'
        });
      }

      const { slug, authorName, relationship, message } = body || {};

      if (!slug || !message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Please enter a message' });
      }

      const saved = await addEncouragement({
        slug,
        authorName: authorName || 'Family & Friend',
        relationship: relationship || 'Family & Friends',
        message: message.trim()
      });

      return res.status(200).json({
        success: true,
        message: 'Your encouragement note has been sent to Elder Salviejo!',
        encouragement: saved
      });
    }
  } catch (error) {
    console.error('Error in /api/encouragements:', error);
    return res.status(500).json({
      error: 'Internal Server Error handling encouragement notes',
      details: error.message
    });
  }
};
