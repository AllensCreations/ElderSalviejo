/**
 * Vercel Serverless Function: GET /api/debug
 * 
 * Quick diagnostic — visit /api/debug in the browser to verify
 * Turso connection, env var presence, and week count.
 * Safe to leave deployed (returns no secrets).
 */

const { isTursoConfigured, initDatabase, getAllWeeks } = require('../lib/turso');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  const tursoUrl = process.env.TURSO_DATABASE_URL || '';
  const tursoToken = process.env.TURSO_AUTH_TOKEN || '';
  const tursoReady = isTursoConfigured();

  let weekCount = 0;
  let dbError = null;

  try {
    await initDatabase();
    const weeks = await getAllWeeks();
    weekCount = weeks.length;
  } catch (err) {
    dbError = err.message;
  }

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'local',
    turso: {
      configured: tursoReady,
      urlPresent: Boolean(tursoUrl && !tursoUrl.includes('your-database-name')),
      tokenPresent: Boolean(tursoToken),
      weekCount,
      error: dbError
    },
    action: !tursoReady
      ? 'Go to Vercel Dashboard → Project → Settings → Environment Variables and add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN'
      : weekCount === 0
        ? 'Turso is connected but journal_weeks table is empty — check your Code.gs ingest logs'
        : 'Everything looks good!'
  });
};
