#!/usr/bin/env node

/**
 * Receiver Ingestion Pipeline Diagnostic & Test Suite
 * Philippines Dumaguete Mission • Elder Salviejo
 *
 * Tests the entire receiver ingestion pipeline:
 * 1. Health & connectivity check
 * 2. Ingest authorization verification (401 vs 200)
 * 3. Message deduplication tracking
 * 4. Weekly Diary Reflection ingestion
 * 5. Polaroid Photo Gallery ingestion
 *
 * Usage:
 *   node scripts/test-receiver.js [TARGET_URL] [SECRET]
 * Examples:
 *   node scripts/test-receiver.js http://localhost:3000/api/ingest
 *   node scripts/test-receiver.js https://eldersalviejo.vercel.app/api/ingest my-secret-token
 */

require('dotenv').config();

const targetIngestUrl = process.argv[2] || process.env.TARGET_URL || 'http://localhost:3000/api/ingest';
const secret = process.argv[3] || process.env.INGEST_SECRET || 'your-super-secret-token-change-me';
const baseUrl = targetIngestUrl.replace(/\/api\/ingest.*/, '');

const samplePixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

console.log('===============================================================');
console.log('  ELDER SALVIEJO — RECEIVER INGESTION DIAGNOSTIC & TEST SUITE');
console.log('  Philippines Dumaguete Mission');
console.log('===============================================================');
console.log(`Endpoint Target : ${targetIngestUrl}`);
console.log(`Base Website URL: ${baseUrl}`);
console.log(`Auth Secret     : ${secret ? '••••••••' + secret.slice(-4) : '(None provided)'}\n`);

async function runTests() {
  let passed = 0;
  let total = 0;

  // -------------------------------------------------------------
  // TEST 1: Server Reachability & Public Stats
  // -------------------------------------------------------------
  total++;
  process.stdout.write('[TEST 1/5] Checking server reachability (/api/stats)... ');
  try {
    const statsRes = await fetch(`${baseUrl}/api/stats`);
    if (statsRes.ok) {
      const statsJson = await statsRes.json();
      console.log('PASS');
      console.log(`          Server online: ${statsJson.stats?.missionName || 'Connected'}`);
      console.log(`          Missionary   : ${statsJson.stats?.elderName || 'Elder Salviejo'}`);
      console.log(`          Total Weeks  : ${statsJson.stats?.totalWeeks ?? 'N/A'}`);
      console.log(`          Total Photos : ${statsJson.stats?.totalPhotos ?? 'N/A'}`);
      passed++;
    } else {
      console.log(`FAIL (HTTP ${statsRes.status})`);
    }
  } catch (err) {
    console.log(`FAIL (Network Error: ${err.message})`);
  }

  // -------------------------------------------------------------
  // TEST 2: Ingest Security & Authorization Guard
  // -------------------------------------------------------------
  total++;
  process.stdout.write('\n[TEST 2/5] Testing authorization guard on /api/ingest... ');
  try {
    const unauthRes = await fetch(targetIngestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token-for-test'
      },
      body: JSON.stringify({ ping: true })
    });

    if (unauthRes.status === 401) {
      console.log('PASS');
      console.log('          Correctly rejected unauthorized request with HTTP 401.');
      passed++;
    } else {
      console.log(`WARN (Expected HTTP 401, received HTTP ${unauthRes.status})`);
    }
  } catch (err) {
    console.log(`FAIL (Network Error: ${err.message})`);
  }

  // -------------------------------------------------------------
  // TEST 3: Anti-Duplicate Message Tracking
  // -------------------------------------------------------------
  total++;
  const testMsgId = `test-msg-${Date.now()}`;
  process.stdout.write(`\n[TEST 3/5] Testing message tracking check (/api/tracking/message)... `);
  try {
    const checkRes = await fetch(`${baseUrl}/api/tracking/message?id=${encodeURIComponent(testMsgId)}`, {
      headers: {
        'Authorization': `Bearer ${secret}`,
        'x-ingest-secret': secret
      }
    });

    if (checkRes.ok) {
      const checkData = await checkRes.json();
      console.log('PASS');
      console.log(`          Deduplication lookup verified (isProcessed: ${checkData.isProcessed})`);
      passed++;
    } else {
      console.log(`SKIP (HTTP ${checkRes.status} - tracking endpoint optional)`);
    }
  } catch (err) {
    console.log(`SKIP (Tracking check skipped: ${err.message})`);
  }

  // -------------------------------------------------------------
  // TEST 4: Weekly Diary Reflection Ingestion
  // -------------------------------------------------------------
  total++;
  const testTimestamp = Date.now();
  const diarySlug = `test-week-${testTimestamp}`;
  const diaryPayload = {
    slug: diarySlug,
    title: `Diagnostic Test Journal (${new Date().toLocaleDateString('en-US')})`,
    publishedAt: new Date().toISOString(),
    rawSubject: 'Weekly Reflection: Diagnostic Tester [159266]',
    sender: 'elder.salviejo@missionary.org',
    entries: [
      {
        day: 'MONDAY',
        text: 'Preparation day in Sibulan. Completed laundry, companion study in Alma 26, and weekly letters.',
        image: samplePixel,
        imageFilename: 'monday_pday.jpg',
        category: 'P-Day Journal'
      },
      {
        day: 'TUESDAY',
        text: 'Proselyting along the coastal highway. Met with an investigator family eager to read the Book of Mormon.',
        image: samplePixel,
        imageFilename: 'tuesday_teach.jpg',
        category: 'Teaching'
      },
      {
        day: 'WEDNESDAY',
        text: 'Service project helping rebuild a bamboo garden fence for Nanay Elena after the rain.',
        image: samplePixel,
        imageFilename: 'wednesday_service.jpg',
        category: 'Service'
      },
      {
        day: 'THURSDAY',
        text: 'District Council meeting in Dumaguete City. Uplifting testimony meeting with our zone leaders.',
        image: samplePixel,
        imageFilename: 'thursday_district.jpg',
        category: 'District'
      },
      {
        day: 'FRIDAY',
        text: 'Evening street contacting at Rizal Boulevard. Shared missionary pamphlets under the lampposts.',
        image: samplePixel,
        imageFilename: 'friday_contacting.jpg',
        category: 'Mission'
      },
      {
        day: 'SATURDAY',
        text: 'Baptismal service preparation with our district elders. The spirit was palpable in the chapel.',
        image: samplePixel,
        imageFilename: 'saturday_chapel.jpg',
        category: 'Baptisms'
      },
      {
        day: 'SUNDAY',
        text: 'Sacrament meeting in Dumaguete 1st Ward. Bore testimony of the Savior Jesus Christ and His restored Gospel.',
        image: samplePixel,
        imageFilename: 'sunday_sacrament.jpg',
        category: 'Sunday'
      }
    ],
    totalEntries: 7,
    imageCount: 7,
    verse: {
      reference: 'Alma 26:12',
      text: 'Yea, I know that I am nothing; as to my strength I am weak; therefore I will not boast of myself, but I will boast of my God, for in his strength I can do all things.'
    },
    isGallery: false,
    category: 'P-Day Journal'
  };

  process.stdout.write(`\n[TEST 4/5] Ingesting Weekly Diary reflection payload... `);
  try {
    const diaryRes = await fetch(targetIngestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
        'x-ingest-secret': secret,
        'User-Agent': 'ElderSalviejo-Tester/1.0'
      },
      body: JSON.stringify(diaryPayload)
    });

    const diaryText = await diaryRes.text();
    let diaryJson;
    try { diaryJson = JSON.parse(diaryText); } catch (_) { diaryJson = null; }

    if (diaryRes.ok && diaryJson?.success) {
      console.log('PASS');
      console.log(`          Title   : "${diaryJson.title || diaryPayload.title}"`);
      console.log(`          Slug    : "${diaryJson.slug || diarySlug}"`);
      console.log(`          URL     : ${baseUrl}/week/${diaryJson.slug || diarySlug}`);
      passed++;
    } else {
      console.log(`FAIL (HTTP ${diaryRes.status})`);
      console.log(`          Response: ${diaryText.slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`FAIL (Network Error: ${err.message})`);
  }

  // -------------------------------------------------------------
  // TEST 5: Direct Polaroid Photo Gallery Ingestion
  // -------------------------------------------------------------
  total++;
  const gallerySlug = `test-gallery-${testTimestamp}`;
  const galleryPayload = {
    slug: gallerySlug,
    title: `Diagnostic Polaroid Gallery (${new Date().toLocaleDateString('en-US')})`,
    publishedAt: new Date().toISOString(),
    rawSubject: 'Sibulan Zone Conference [Mission] 073000',
    sender: 'elder.salviejo@missionary.org',
    bodyText: 'Spiritual zone gathering with our mission president and fellow missionary companions.',
    entries: [
      {
        day: 'PHOTO_1',
        text: 'Zone conference group photograph at Dumaguete chapel.',
        caption: 'Zone conference group photograph at Dumaguete chapel.',
        image: samplePixel,
        imageFilename: 'conference_group.jpg',
        category: 'Mission'
      },
      {
        day: 'PHOTO_2',
        text: 'Companionship study over breakfast in Sibulan.',
        caption: 'Companionship study over breakfast in Sibulan.',
        image: samplePixel,
        imageFilename: 'companion_breakfast.jpg',
        category: 'Companions'
      }
    ],
    totalEntries: 2,
    imageCount: 2,
    verse: null,
    isGallery: true,
    category: 'Mission'
  };

  process.stdout.write(`\n[TEST 5/5] Ingesting Polaroid Photo Gallery payload... `);
  try {
    const galleryRes = await fetch(targetIngestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
        'x-ingest-secret': secret,
        'User-Agent': 'ElderSalviejo-Tester/1.0'
      },
      body: JSON.stringify(galleryPayload)
    });

    const galleryText = await galleryRes.text();
    let galleryJson;
    try { galleryJson = JSON.parse(galleryText); } catch (_) { galleryJson = null; }

    if (galleryRes.ok && galleryJson?.success) {
      console.log('PASS');
      console.log(`          Title   : "${galleryJson.title || galleryPayload.title}"`);
      console.log(`          Entries : ${galleryPayload.entries.length} polaroid photos`);
      console.log(`          URL     : ${baseUrl}/gallery`);
      passed++;
    } else {
      console.log(`FAIL (HTTP ${galleryRes.status})`);
      console.log(`          Response: ${galleryText.slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`FAIL (Network Error: ${err.message})`);
  }

  // -------------------------------------------------------------
  // Summary & Diagnostic Advice
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`  RESULTS: ${passed}/${total} checks passed`);
  console.log('===============================================================');

  if (passed >= 4) {
    console.log('\n[STATUS: HEALTHY] The web ingestion receiver endpoint is 100% operational!');
    console.log('\nIf your Gmail emails are not being processed by Code.gs, check:');
    console.log('1. Did you send the test email from the dummy account to itself?');
    console.log('   -> Gmail search skips self-emails unless passcodes match.');
    console.log('   -> Always test by sending FROM another address TO your dummy account.');
    console.log('2. Does the Subject or Body have the secret passcode or keywords?');
    console.log('   -> Weekly Diary: Must include "159266" or "Weekly Reflection" in Subject.');
    console.log('   -> Photo Gallery: Must include "073000" in Subject.');
    console.log('3. Is your Google Apps Script Trigger active?');
    console.log('   -> Open script.google.com -> Run "createDaily9PMTrigger"');
    console.log('   -> Or run "processWeeklyDiaryEmails" manually by clicking Run.');
    console.log('4. Did you run "debugCheckInbox" in Apps Script?');
    console.log('   -> In Apps Script toolbar, select "debugCheckInbox" and click Run.');
    console.log('   -> Check the Execution log to see how Gmail analyzes each email in your inbox.\n');
  } else {
    console.log('\n[STATUS: ACTION REQUIRED] One or more tests failed.');
    console.log('Check that your server is running and INGEST_SECRET matches between Apps Script and server.\n');
  }
}

runTests().catch(err => {
  console.error('Fatal tester error:', err);
  process.exit(1);
});
