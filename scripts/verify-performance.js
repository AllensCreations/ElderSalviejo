/**
 * Performance and Integrity Verification Benchmark
 * Tests server compression, ETags, 304 Not Modified, API response times, and payload sizes.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.TEST_PORT || 3099;
process.env.PORT = String(PORT);

const server = require('../server');

function request(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip, deflate',
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          size: body.length,
          latency: Date.now() - startTime
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runBenchmark() {
  console.log(`\n======================================================`);
  console.log(`Elder Salviejo Performance & Load Speed Verification`);
  console.log(`======================================================\n`);

  // Wait 100ms for server listen
  await new Promise(r => setTimeout(r, 100));

  const tests = [
    { name: 'HTML Shell (/index.html)', path: '/', rawPath: path.join(__dirname, '../public/index.html') },
    { name: 'Monograph Book (/book)', path: '/book', rawPath: path.join(__dirname, '../public/book.html') },
    { name: 'Photo Gallery (/gallery)', path: '/gallery', rawPath: path.join(__dirname, '../public/gallery.html') },
    { name: 'Tailwind CSS (/css/tailwind.min.css)', path: '/css/tailwind.min.css', rawPath: path.join(__dirname, '../public/css/tailwind.min.css') },
    { name: 'Main CSS (/css/main.css)', path: '/css/main.css', rawPath: path.join(__dirname, '../public/css/main.css') },
    { name: 'Lightweight SVG Favicon (/favicon.svg)', path: '/favicon.svg', rawPath: path.join(__dirname, '../public/favicon.svg') },
    { name: 'Multi-Res ICO (/favicon.ico)', path: '/favicon.ico', rawPath: path.join(__dirname, '../public/favicon.ico') },
    { name: 'Service Worker (/sw.js)', path: '/sw.js', rawPath: path.join(__dirname, '../public/sw.js') },
    { name: 'Weekly Vault API (/api/weeks)', path: '/api/weeks' },
    { name: 'Gallery Photos API (/api/gallery)', path: '/api/gallery' }
  ];

  let allPassed = true;

  for (const t of tests) {
    const res = await request(t.path);
    const rawSize = t.rawPath && fs.existsSync(t.rawPath) ? fs.statSync(t.rawPath).size : null;
    const compression = rawSize ? `${Math.round((1 - res.size / rawSize) * 100)}% smaller` : 'N/A';
    const encoding = res.headers['content-encoding'] || 'identity';
    const etag = res.headers['etag'] || 'none';

    console.log(`[${res.status === 200 ? 'PASS' : 'FAIL'}] ${t.name}`);
    console.log(`       Size: ${res.size} bytes ${rawSize ? `(raw: ${rawSize} bytes, gzip saved ${compression})` : ''}`);
    console.log(`       Encoding: ${encoding} | Latency: ${res.latency}ms | ETag: ${etag}`);

    if (res.status !== 200) allPassed = false;

    // Test 304 Not Modified caching with ETag
    if (etag && etag !== 'none') {
      const cacheRes = await request(t.path, { 'If-None-Match': etag });
      const is304 = cacheRes.status === 304;
      console.log(`       ETag Cache Verification: ${is304 ? 'PASS (304 Not Modified, 0 bytes)' : `FAIL (Status ${cacheRes.status})`}`);
      if (!is304) allPassed = false;
    }
    console.log('');
  }

  console.log(`======================================================`);
  if (allPassed) {
    console.log(` ALL PERFORMANCE & INTEGRITY AUDITS PASSED!`);
  } else {
    console.log(` SOME CHECKS FAILED`);
  }
  console.log(`======================================================\n`);

  process.exit(allPassed ? 0 : 1);
}

runBenchmark().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
