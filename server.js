/**
 * Standalone Local Development Server for Gmail Diary Vault
 * 
 * Runs without external dependencies using native Node.js HTTP.
 * Compatible with Vercel serverless function handlers in /api.
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');
const crypto = require('crypto');

const ingestHandler = require('./api/ingest');
const weeksHandler = require('./api/weeks/index');
const singleWeekHandler = require('./api/weeks/[id]');
const subscribeHandler = require('./api/subscribe');
const subscribersHandler = require('./api/subscribers');
const galleryHandler = require('./api/gallery');
const trackingMessageHandler = require('./api/tracking/message');
const trackingBroadcastHandler = require('./api/tracking/broadcast');
const encouragementsHandler = require('./api/encouragements');
const statsHandler = require('./api/stats');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// High-speed static file server with Gzip/Deflate compression and ETags
function serveStaticFile(req, res, filePath, explicitMime = null, cacheControl = null) {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Not Found' }));
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = explicitMime || MIME_TYPES[ext] || 'application/octet-stream';
    const etag = `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;

    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl);
    } else if (filePath.includes('/assets/') || filePath.includes('/photos/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (['.css', '.js', '.ico', '.svg', '.png'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    }

    res.setHeader('ETag', etag);

    if (req.headers && req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      return res.end();
    }

    res.setHeader('Content-Type', contentType);

    const acceptEncoding = (req.headers && req.headers['accept-encoding']) || '';
    const isCompressible = /^(text\/|application\/javascript|application\/json|image\/svg\+xml)/.test(contentType);

    if (isCompressible && acceptEncoding.includes('gzip')) {
      res.setHeader('Content-Encoding', 'gzip');
      const rawStream = fs.createReadStream(filePath);
      const gzip = zlib.createGzip({ level: 6 });
      return rawStream.pipe(gzip).pipe(res);
    } else if (isCompressible && acceptEncoding.includes('deflate')) {
      res.setHeader('Content-Encoding', 'deflate');
      const rawStream = fs.createReadStream(filePath);
      const deflate = zlib.createDeflate({ level: 6 });
      return rawStream.pipe(deflate).pipe(res);
    } else {
      res.setHeader('Content-Length', stats.size);
      return fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Failed to serve static file', details: err.message }));
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  req.query = Object.fromEntries(parsedUrl.searchParams.entries());

  // Add mock helpers to match Vercel Serverless Function signature
  res.status = function (statusCode) {
    res.statusCode = statusCode;
    return res;
  };
  res.json = function (data) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return res;
  };
  res.send = function (data) {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    }
    res.end(data);
    return res;
  };

  // Helper to read request body
  const readBody = () => new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (raw) {
        try {
          resolve(JSON.parse(raw));
        } catch (_) {
          resolve(raw);
        }
      } else {
        resolve(null);
      }
    });
    req.on('error', reject);
  });

  try {
    // 1. API: POST /api/ingest
    if (pathname === '/api/ingest') {
      req.body = await readBody();
      return await ingestHandler(req, res);
    }

    // 1b. API: POST /api/subscribe
    if (pathname === '/api/subscribe') {
      req.body = await readBody();
      return await subscribeHandler(req, res);
    }

    // 1c. API: GET /api/subscribers
    if (pathname === '/api/subscribers') {
      return await subscribersHandler(req, res);
    }

    // 1d. API: /api/tracking/message
    if (pathname === '/api/tracking/message') {
      if (req.method === 'POST') req.body = await readBody();
      return await trackingMessageHandler(req, res);
    }

    // 1e. API: /api/tracking/broadcast
    if (pathname === '/api/tracking/broadcast') {
      if (req.method === 'POST') req.body = await readBody();
      return await trackingBroadcastHandler(req, res);
    }

    // 1f. API: /api/encouragements
    if (pathname === '/api/encouragements') {
      if (req.method === 'POST') req.body = await readBody();
      return await encouragementsHandler(req, res);
    }

    // 1g. API: GET /api/stats
    if (pathname === '/api/stats') {
      return await statsHandler(req, res);
    }

    // 2. API: GET /api/weeks
    if (pathname === '/api/weeks') {
      return await weeksHandler(req, res);
    }

    // 2b. API: GET /api/gallery
    if (pathname === '/api/gallery') {
      return await galleryHandler(req, res);
    }

    // 3. API: GET /api/weeks/:id
    if (pathname.startsWith('/api/weeks/')) {
      const id = pathname.replace('/api/weeks/', '');
      req.query.id = decodeURIComponent(id);
      return await singleWeekHandler(req, res);
    }

    // 4. Sample data serving
    // 4b. Sample data
    if (pathname === '/sample-data/sample-payload.json') {
      const samplePath = path.join(__dirname, 'sample-data', 'sample-payload.json');
      if (fs.existsSync(samplePath)) {
        return serveStaticFile(req, res, samplePath, 'application/json');
      }
    }

    // 5. Frontend Clean Route: /gallery
    if (pathname === '/gallery') {
      const galleryHtmlPath = path.join(PUBLIC_DIR, 'gallery.html');
      return serveStaticFile(req, res, galleryHtmlPath, 'text/html; charset=UTF-8', 'public, max-age=3600, stale-while-revalidate=86400');
    }

    // 5b. Frontend Clean Route: /call and /mission-call -> Redirect to unified Book Chapter 1
    if (pathname === '/call' || pathname === '/mission-call' || pathname === '/call.html') {
      res.writeHead(302, { Location: '/book#chapter-call' });
      return res.end();
    }

    // 5c. Frontend Clean Route: /book
    if (pathname === '/book') {
      const bookHtmlPath = path.join(PUBLIC_DIR, 'book.html');
      return serveStaticFile(req, res, bookHtmlPath, 'text/html; charset=UTF-8', 'public, max-age=3600, stale-while-revalidate=86400');
    }

    // 5d. Frontend Dynamic View: /week and /week/:id
    if (pathname === '/week' || pathname.startsWith('/week/')) {
      const weekHtmlPath = path.join(PUBLIC_DIR, 'week.html');
      return serveStaticFile(req, res, weekHtmlPath, 'text/html; charset=UTF-8', 'public, max-age=3600, stale-while-revalidate=86400');
    }

    // 6. Frontend Index Vault: /
    if (pathname === '/' || pathname === '/index.html') {
      const indexHtmlPath = path.join(PUBLIC_DIR, 'index.html');
      return serveStaticFile(req, res, indexHtmlPath, 'text/html; charset=UTF-8', 'public, max-age=3600, stale-while-revalidate=86400');
    }

    // 7. Static file serving from /public
    const filePath = path.join(PUBLIC_DIR, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return serveStaticFile(req, res, filePath);
    }

    // 7b. Static file serving from /vault
    if (pathname.startsWith('/vault/')) {
      const vaultFilePath = path.join(__dirname, pathname);
      if (fs.existsSync(vaultFilePath) && fs.statSync(vaultFilePath).isFile()) {
        return serveStaticFile(req, res, vaultFilePath);
      }
    }

    // 404 Not Found
    res.status(404).json({ error: 'Page or Endpoint Not Found' });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`
=====================================================
Gmail Diary Vault running at: http://localhost:${PORT}
=====================================================
Index Vault Directory:   http://localhost:${PORT}/
Demo Weekly Diary:      http://localhost:${PORT}/week/sample
Ingest Endpoint:        http://localhost:${PORT}/api/ingest
List Weeks API:         http://localhost:${PORT}/api/weeks
=====================================================
  `);
});
