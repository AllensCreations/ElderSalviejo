/**
 * Vercel Serverless Function: POST /api/admin/send
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
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const providedSecret = body.secret || bearerToken || req.query.secret || '';
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

        const gasJson = await gasResponse.json();
        return res.status(200).json({
          success: true,
          mode: 'gas_dispatched',
          recipient: recipientEmail,
          dummyInbox: dummyEmail,
          details: gasJson
        });
      } catch (gasErr) {
        console.warn('Apps Script relay error, returning template payload directly:', gasErr.message);
      }
    }

    // 4. Return complete template payload with ready-to-launch links
    return res.status(200).json({
      success: true,
      mode: 'template_ready',
      recipient: recipientEmail,
      dummyInbox: dummyEmail,
      subject: `Elder Mark Salviejo — P-Day Template & Submission Kit [${diaryPasscode} & ${galleryPasscode}]`,
      links: {
        diaryMailto,
        diaryGmailWeb,
        galleryMailto,
        galleryGmailWeb
      },
      templates: {
        diary: { subject: diarySubject, body: diaryBody },
        gallery: { subject: gallerySubject, body: galleryBody }
      },
      message: `Template kit prepared for ${recipientEmail}. Ready for 1-click dispatch or Apps Script delivery.`
    });

  } catch (err) {
    console.error('Admin send handler error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
