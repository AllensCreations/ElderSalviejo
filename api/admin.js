/**
 * Vercel Serverless Function: /api/admin, /api/admin/send, /api/debug, /api/backup
 * 
 * Unified Admin & Diagnostics Endpoint:
 * 1. POST /api/admin & /api/admin/send: Dispatches Missionary Submission Kit Email.
 * 2. GET /api/admin?action=debug (or /api/debug): Quick system diagnostics (Turso status, week count).
 * 3. GET /api/admin?action=backup (or /api/backup): Secure full database export & JSON backup.
 * 
 * Consolidates multiple administrative functions into 1 handler to keep deployment
 * within Vercel's Hobby plan limit (<=12 serverless functions).
 */

const crypto = require('crypto');
const { isTursoConfigured, initDatabase, getAllWeeks, exportCompleteDatabase } = require('../lib/turso');
const { autoSaveToGitHub } = require('../lib/github-vault');

function timingSafeMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // -------------------------------------------------------------
  // GET Requests: Diagnostics & Database Backups
  // -------------------------------------------------------------
  if (req.method === 'GET' || req.method === 'HEAD') {
    const action = req.query.action || (req.url && req.url.includes('backup') ? 'backup' : 'debug');

    // 1. Diagnostics (/api/debug)
    if (action === 'debug') {
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
    }

    // 2. Database Backup (/api/backup)
    if (action === 'backup') {
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

        if (req.query.download === 'true') {
          const filename = `elder-salviejo-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          return res.status(200).send(JSON.stringify(backupData, null, 2));
        }

        return res.status(200).json({
          success: true,
          timestamp: new Date().toISOString(),
          counts: backupData.counts,
          data: backupData
        });
      } catch (err) {
        console.error('Backup export error:', err);
        return res.status(500).json({ error: 'Database backup failed', details: err.message });
      }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(400).json({ error: 'Unrecognized GET action. Use ?action=debug or ?action=backup' });
  }

  // -------------------------------------------------------------
  // POST Requests: Send Missionary Submission Kit
  // -------------------------------------------------------------
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        return res.status(400).json({ error: 'Invalid JSON request body' });
      }
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Missing request body' });
    }

    // Authentication Check
    const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const querySecret = (req.query && req.query.secret) || '';
    const providedSecret = (body && body.secret) || bearerToken || querySecret || '';
    const configuredSecret = process.env.INGEST_SECRET || '';

    if (configuredSecret) {
      if (!providedSecret || !timingSafeMatch(providedSecret, configuredSecret)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid admin passcode/secret' });
      }
    }

    const recipientEmail = (body.recipientEmail || body.recipient || '').trim();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid recipient email address is required' });
    }

    const dummyEmail = (body.dummyEmail || body.dummyInbox || process.env.ALLOWED_SENDER || 'dummy@gmail.com').trim();
    const diaryPasscode = body.diaryPasscode || process.env.SECRET_DIARY_CODE || '159266';
    const galleryPasscode = body.galleryPasscode || process.env.SECRET_GALLERY_CODE || '073000';
    const appsScriptUrl = (body.appsScriptUrl || process.env.APPS_SCRIPT_WEBAPP_URL || '').trim();

    // Prepare Links & Template
    const diarySubject = `Weekly Reflection: Week 1 in Dumaguete ${diaryPasscode}`;
    const diaryBody = `-VERSE- (Alma 26:12)\n\n(MONDAY)\n- Preparation day! Did laundry, wrote emails to family, and companion study in Dumaguete.\n\n(TUESDAY)\n- Morning proselyting and teaching discussions in Sibulan district.\n\n(WEDNESDAY)\n- Taught the Plan of Salvation to Brother Bautista and enjoyed fresh buko juice.\n\n(THURSDAY)\n- District Council meeting in Dumaguete City. Practiced Cebuano language roleplays.\n\n(FRIDAY)\n- Service project helping local families repair bamboo fences.\n\n(SATURDAY)\n- Street contacting along Rizal Boulevard during sunset overlooking the ocean.\n\n(SUNDAY)\n- Sacrament meeting in Dumaguete 1st Ward. Bore testimony of the Savior Jesus Christ.`;

    const gallerySubject = `Dumaguete District Conference [Mission] ${galleryPasscode}`;
    const galleryBody = `Wonderful district conference gathering with companions and members across Negros Oriental!`;

    const diaryMailto = `mailto:${encodeURIComponent(dummyEmail)}?subject=${encodeURIComponent(diarySubject)}&body=${encodeURIComponent(diaryBody)}`;
    const diaryGmailWeb = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(dummyEmail)}&su=${encodeURIComponent(diarySubject)}&body=${encodeURIComponent(diaryBody)}`;

    const galleryMailto = `mailto:${encodeURIComponent(dummyEmail)}?subject=${encodeURIComponent(gallerySubject)}&body=${encodeURIComponent(galleryBody)}`;
    const galleryGmailWeb = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(dummyEmail)}&su=${encodeURIComponent(gallerySubject)}&body=${encodeURIComponent(galleryBody)}`;

    const kitSubject = `Elder Salviejo — Official Missionary Sender Kit [${diaryPasscode} & ${galleryPasscode}]`;

    // Relay to Google Apps Script Web App if URL is provided
    if (appsScriptUrl && appsScriptUrl.startsWith('https://script.google.com')) {
      try {
        const gasResponse = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sendKit',
            secret: configuredSecret,
            recipientEmail: recipientEmail,
            dummyEmail: dummyEmail
          })
        });

        const gasText = await gasResponse.text();
        let gasJson = null;
        try {
          gasJson = JSON.parse(gasText);
        } catch (_) {}

        if (!gasResponse.ok || (gasJson && gasJson.error)) {
          const errorMsg = (gasJson && gasJson.error) ||
            (gasText.includes('<html') ? 'Google Apps Script returned an HTML login/redirect page. Make sure "Who has access" is set to "Anyone".' : `HTTP ${gasResponse.status}`);
          
          return res.status(502).json({
            error: `Google Apps Script dispatch failed: ${errorMsg}`,
            hint: 'In script.google.com, click Deploy > Manage deployments > Edit > set "Execute as: Me" and "Who has access: Anyone". You can also test instant delivery directly by running runTestSendToMyInbox() in script.google.com.',
            links: { diaryMailto, diaryGmailWeb, galleryMailto, galleryGmailWeb }
          });
        }

        return res.status(200).json({
          success: true,
          mode: 'gas_dispatched',
          recipient: recipientEmail,
          dummyInbox: dummyEmail,
          subject: kitSubject,
          details: gasJson || { message: 'Dispatched successfully via Google Apps Script' },
          links: { diaryMailto, diaryGmailWeb, galleryMailto, galleryGmailWeb }
        });
      } catch (gasErr) {
        return res.status(502).json({
          error: `Google Apps Script connection error: ${gasErr.message}`,
          hint: 'Verify that the Web App URL is accessible, or test directly from Google Apps Script editor using runTestSendToMyInbox().',
          links: { diaryMailto, diaryGmailWeb, galleryMailto, galleryGmailWeb }
        });
      }
    }

    // If no Apps Script URL provided, return links with explicit notice
    return res.status(200).json({
      success: true,
      mode: 'links_only',
      recipient: recipientEmail,
      dummyInbox: dummyEmail,
      subject: kitSubject,
      warning: 'No Google Apps Script Web App URL was provided. No email was sent to the inbox, but you can use the 1-click mailto buttons below or test runTestSendToMyInbox() directly in script.google.com.',
      links: {
        diaryMailto,
        diaryGmailWeb,
        galleryMailto,
        galleryGmailWeb
      },
      templates: {
        diary: { subject: diarySubject, body: diaryBody },
        gallery: { subject: gallerySubject, body: galleryBody }
      }
    });

  } catch (err) {
    console.error('Admin handler error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
