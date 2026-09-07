/**
 * Vercel Serverless Function: POST /api/subscribe
 * 
 * Allows visitors/readers to insert their email to subscribe to updates.
 * Stores email in Turso SQLite database.
 */

const { addSubscriber, initDatabase } = require('../lib/turso');

module.exports = async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    const email = body ? body.email : null;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    await initDatabase();
    const result = await addSubscriber(email);

    return res.status(200).json({
      success: true,
      message: "You're subscribed! You'll receive email updates whenever a new weekly journal is published.",
      email: result.email
    });
  } catch (err) {
    console.error('Error in /api/subscribe:', err);
    return res.status(500).json({
      error: 'Failed to save subscription',
      details: err.message
    });
  }
};
