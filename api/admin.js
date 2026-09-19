/**
 * Vercel Serverless Function: /api/admin & /api/admin/send
 * 
 * Secure Admin Endpoint:
 * 1. Validates admin secret against INGEST_SECRET.
 * 2. Prepares or dispatches the All-in-One Missionary Submission Kit Email
 *    (containing both "Send Weekly Diary [159266]" and "Send Gallery Photos [073000]" buttons).
 * 3. Can relay to Google Apps Script Web App (if configured) or return the generated
 *    HTML email template and mailto/web links for direct 1-click dispatch.
 */

const crypto = require('crypto');

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
        return res.status(400).json({ error: 'Invalid JSON request body' });
      }
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Missing request body' });
    }

    // 1. Authentication Check
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
    const siteUrl = process.env.SITE_URL || 'https://eldersalviejo.vercel.app';

    // 2. Prepare Links & Template
    const diarySubject = `Weekly Reflection: Week 1 in Dumaguete ${diaryPasscode}`;
    const diaryBody = `-VERSE- (Alma 26:12)\n\n--- MONDAY ---\nPreparation day! Did laundry, wrote emails to family, and companion study in Dumaguete.\n\n--- TUESDAY ---\nMorning proselyting and teaching discussions in Sibulan district.\n\n--- WEDNESDAY ---\nTaught the Plan of Salvation to Brother Bautista and enjoyed fresh buko juice.\n\n--- THURSDAY ---\nDistrict Council meeting in Dumaguete City. Practiced Cebuano language roleplays.\n\n--- FRIDAY ---\nService project helping local families repair bamboo fences.\n\n--- SATURDAY ---\nStreet contacting along Rizal Boulevard during sunset overlooking the ocean.\n\n--- SUNDAY ---\nSacrament meeting in Dumaguete 1st Ward. Bore testimony of the Savior Jesus Christ.`;

    const gallerySubject = `Dumaguete District Conference [Mission] ${galleryPasscode}`;
    const galleryBody = `Wonderful district conference gathering with companions and members across Negros Oriental!`;

    const diaryMailto = `mailto:${encodeURIComponent(dummyEmail)}?subject=${encodeURIComponent(diarySubject)}&body=${encodeURIComponent(diaryBody)}`;
    const diaryGmailWeb = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(dummyEmail)}&su=${encodeURIComponent(diarySubject)}&body=${encodeURIComponent(diaryBody)}`;

    const galleryMailto = `mailto:${encodeURIComponent(dummyEmail)}?subject=${encodeURIComponent(gallerySubject)}&body=${encodeURIComponent(galleryBody)}`;
    const galleryGmailWeb = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(dummyEmail)}&su=${encodeURIComponent(gallerySubject)}&body=${encodeURIComponent(galleryBody)}`;

    const kitSubject = `Elder Salviejo — Official Missionary Sender Kit [${diaryPasscode} & ${galleryPasscode}]`;

    // 3. Relay to Google Apps Script Web App if URL is provided
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
        } catch (_) {
          // Response may be HTML if Google required authentication/login
        }

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

    // 4. If no Apps Script URL provided, return links with explicit notice
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
    console.error('Admin send handler error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
