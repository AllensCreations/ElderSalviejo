#!/usr/bin/env node

/**
 * Script to test the /api/ingest endpoint with sample data.
 * Usage:
 *   node sample-data/send-test-ingest.js [TARGET_URL] [SECRET]
 * Default TARGET_URL: http://localhost:3000/api/ingest
 * Default SECRET: your-super-secret-token-change-me (or process.env.INGEST_SECRET)
 */

const fs = require('fs');
const path = require('path');

const targetUrl = process.argv[2] || process.env.TARGET_URL || 'http://localhost:3000/api/ingest';
const secret = process.argv[3] || process.env.INGEST_SECRET || 'your-super-secret-token-change-me';

const payloadPath = path.join(__dirname, 'sample-payload.json');

if (!fs.existsSync(payloadPath)) {
  console.error(`Error: Payload file not found at ${payloadPath}`);
  process.exit(1);
}

const payloadData = fs.readFileSync(payloadPath, 'utf8');
const parsed = JSON.parse(payloadData);

console.log(`\n📬 Sending test weekly diary to: ${targetUrl}`);
console.log(`📌 Title: "${parsed.title}"`);
console.log(`🗓  Slug:  "${parsed.slug}"`);
console.log(`🖼  Daily entries with images: ${parsed.entries.length}\n`);

fetch(targetUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${secret}`,
    'User-Agent': 'TestIngestScript/1.0'
  },
  body: payloadData
})
  .then(async (res) => {
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (_) { json = null; }
    
    if (res.ok) {
      console.log(`✅ Success (HTTP ${res.status}):`);
      console.log(JSON.stringify(json || text, null, 2));
      console.log(`\n🎉 You can now view your diary at: ${targetUrl.replace(/\/api\/ingest.*/, '')}/week/${parsed.slug}\n`);
    } else {
      console.error(`❌ Request Failed (HTTP ${res.status}):`);
      console.error(json || text);
    }
  })
  .catch((err) => {
    console.error(`💥 Network error connecting to ${targetUrl}:`, err.message);
  });
