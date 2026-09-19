/**
 * Cloudflare Worker: Instant Email Receiver & Ingestion Trigger
 * Philippines Dumaguete Mission • Elder Salviejo
 *
 * Capabilities:
 * 1. Cloudflare Email Routing (email handler):
 *    - Receives incoming email at your custom domain (e.g. journal@yourdomain.com)
 *    - Instantly triggers Google Apps Script or forwards payload to /api/ingest in 0.0 seconds!
 * 2. Scheduled Cron Trigger (scheduled handler):
 *    - Automatically pings Apps Script every 1 minute if configured as a cron trigger.
 * 3. HTTP Webhook Endpoint (fetch handler):
 *    - Allows instant manual ping or webhook dispatch via HTTP GET / POST.
 */

export default {
  /**
   * 1. Cloudflare Email Routing Handler
   * Triggers the exact millisecond an email arrives at your domain.
   */
  async email(message, env, ctx) {
    const from = message.from;
    const to = message.to;
    const subject = message.headers.get('subject') || '';

    console.log(`[Cloudflare Email Worker] Received email from ${from} to ${to} with subject: "${subject}"`);

    // Target Google Apps Script Web App URL and Ingest Secret
    const appsScriptUrl = env.APPS_SCRIPT_URL;
    const ingestSecret = env.INGEST_SECRET;

    if (appsScriptUrl) {
      try {
        const pingUrl = `${appsScriptUrl}?action=process&secret=${encodeURIComponent(ingestSecret || '')}`;
        console.log(`[Cloudflare Email Worker] Pinging Apps Script instant webhook: ${pingUrl}`);
        
        const response = await fetch(pingUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Cloudflare-Email-Worker/1.0'
          }
        });
        
        const resultText = await response.text();
        console.log(`[Cloudflare Email Worker] Apps Script responded (HTTP ${response.status}): ${resultText}`);
      } catch (err) {
        console.error(`[Cloudflare Email Worker] Error pinging Apps Script: ${err.message}`);
      }
    } else {
      console.warn('[Cloudflare Email Worker] APPS_SCRIPT_URL secret not configured in Cloudflare environment.');
    }
  },

  /**
   * 2. Scheduled Cron Trigger Handler
   * Runs on a schedule (e.g. every 1 minute) via Cloudflare crons.
   */
  async scheduled(event, env, ctx) {
    const appsScriptUrl = env.APPS_SCRIPT_URL;
    const ingestSecret = env.INGEST_SECRET;

    if (!appsScriptUrl) {
      console.warn('[Cloudflare Cron] APPS_SCRIPT_URL not configured.');
      return;
    }

    const pingUrl = `${appsScriptUrl}?action=process&secret=${encodeURIComponent(ingestSecret || '')}`;
    try {
      const res = await fetch(pingUrl);
      console.log(`[Cloudflare Cron] Triggered Apps Script (HTTP ${res.status})`);
    } catch (err) {
      console.error(`[Cloudflare Cron] Failed to trigger Apps Script: ${err.message}`);
    }
  },

  /**
   * 3. HTTP Fetch Handler
   * Allows manual test ping from browser or external service.
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'online',
        service: 'Elder Salviejo Cloudflare Ingestion Trigger',
        mission: 'Philippines Dumaguete Mission',
        hasAppsScriptUrl: Boolean(env.APPS_SCRIPT_URL),
        hasSecret: Boolean(env.INGEST_SECRET)
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Manual instant trigger endpoint: /trigger or /sync
    if (url.pathname === '/trigger' || url.pathname === '/sync' || url.pathname === '/process') {
      const appsScriptUrl = env.APPS_SCRIPT_URL;
      const ingestSecret = env.INGEST_SECRET;

      if (!appsScriptUrl) {
        return new Response(JSON.stringify({ error: 'APPS_SCRIPT_URL not set in Cloudflare environment' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const pingUrl = `${appsScriptUrl}?action=process&secret=${encodeURIComponent(ingestSecret || '')}`;
      const res = await fetch(pingUrl);
      const text = await res.text();

      return new Response(text, {
        status: res.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
