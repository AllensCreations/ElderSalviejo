/**
 * Vercel Serverless Function: GET /api/backup
 * 
 * Secure full database export and keepsake backup endpoint.
 * Protected by INGEST_SECRET.
 * Dumps all tables (journal_weeks, gallery, subscribers, family_encouragements)
 * into a structured JSON file.
 */

const { exportCompleteDatabase, initDatabase } = require('../lib/turso');
const { autoSaveToGitHub } = require('../lib/github-vault');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Authentication check
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const querySecret = req.query.secret || req.query.token || '';
  const configuredSecret = process.env.INGEST_SECRET;

  if (configuredSecret && token !== configuredSecret && querySecret !== configuredSecret) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or invalid secret token'
    });
  }

  try {
    await initDatabase();
    const backupData = await exportCompleteDatabase();

    // If requested to commit to GitHub backup directory
    if (req.query.github === 'true' || req.query.save_to_github === 'true') {
      try {
        const backupJson = JSON.stringify(backupData, null, 2);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await autoSaveToGitHub({
          path: `vault/backups/backup-${timestamp}.json`,
          content: backupJson,
          message: `backup: automated vault database export (${timestamp})`
        });
      } catch (ghErr) {
        console.warn('GitHub backup commit warning:', ghErr.message);
      }
    }

    // Direct download prompt
    if (req.query.download === 'true') {
      const filename = `elder-salviejo-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(JSON.stringify(backupData, null, 2));
    }

    return res.status(200).json({
      success: true,
      backup: backupData
    });
  } catch (error) {
    console.error('Backup export error:', error);
    return res.status(500).json({
      error: 'Internal Server Error exporting database backup',
      details: error.message
    });
  }
};
