/**
 * Bot & Spam Protection Helper
 * - Sliding-window IP Rate Limiter
 * - Hidden Honeypot Field Validator
 */

const ipRequests = new Map();

// Periodic cleanup of stale IP records every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequests.entries()) {
    if (now - record.startTime > 600000) {
      ipRequests.delete(ip);
    }
  }
}, 600000).unref();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(req, maxAllowed = 5, windowMs = 60000) {
  const ip = getClientIp(req);
  const now = Date.now();

  const record = ipRequests.get(ip) || { count: 0, startTime: now };

  if (now - record.startTime > windowMs) {
    record.count = 1;
    record.startTime = now;
    ipRequests.set(ip, record);
    return { limited: false, remaining: maxAllowed - 1 };
  }

  record.count += 1;
  ipRequests.set(ip, record);

  if (record.count > maxAllowed) {
    return { limited: true, remaining: 0 };
  }

  return { limited: false, remaining: maxAllowed - record.count };
}

function isHoneypotTriggered(body) {
  if (!body || typeof body !== 'object') return false;
  const honeypotKeys = ['hp_website', 'hp_email', '_gotcha', 'honeypot', 'hp_field'];
  for (const key of honeypotKeys) {
    if (body[key] && String(body[key]).trim().length > 0) {
      return true; // Bot caught!
    }
  }
  return false;
}

module.exports = {
  getClientIp,
  checkRateLimit,
  isHoneypotTriggered
};
