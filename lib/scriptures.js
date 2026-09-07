/**
 * Scripture Lookup Service
 * Uses https://github.com/bcbooks/scriptures-json via jsdelivr CDN
 * Automatically resolves scripture references like:
 *   - "Matthew 11:28-29"
 *   - "Matthew:11:28-29"
 *   - "Alma 37:37"
 *   - "1 Nephi 3:7"
 *   - "D&C 68:6" or "Doctrine and Covenants 68:6"
 *   - "Moses 1:39"
 *   - "Proverbs 3:5-6"
 */

const https = require('https');

const SCRIPTURES_BASE_URL = 'https://cdn.jsdelivr.net/gh/bcbooks/scriptures-json@master/reference/';

// Mapping of books to their respective JSON reference files
const VOLUME_FILES = {
  BOM: 'book-of-mormon-reference.json',
  DC: 'doctrine-and-covenants-reference.json',
  PGP: 'pearl-of-great-price-reference.json',
  NT: 'new-testament-reference.json',
  OT: 'old-testament-reference.json'
};

const BOOK_TO_VOLUME = {
  // Book of Mormon
  '1 nephi': 'BOM', '2 nephi': 'BOM', 'jacob': 'BOM', 'enos': 'BOM',
  'jarom': 'BOM', 'omni': 'BOM', 'words of mormon': 'BOM', 'mosiah': 'BOM',
  'alma': 'BOM', 'helaman': 'BOM', '3 nephi': 'BOM', '4 nephi': 'BOM',
  'mormon': 'BOM', 'ether': 'BOM', 'moroni': 'BOM',

  // Doctrine and Covenants
  'doctrine and covenants': 'DC', 'd&c': 'DC', 'd and c': 'DC', 'dc': 'DC', 'section': 'DC',

  // Pearl of Great Price
  'moses': 'PGP', 'abraham': 'PGP', 'joseph smith—matthew': 'PGP',
  'joseph smith-matthew': 'PGP', 'js-m': 'PGP', 'joseph smith—history': 'PGP',
  'joseph smith-history': 'PGP', 'js-h': 'PGP', 'articles of faith': 'PGP', 'a of f': 'PGP',

  // New Testament
  'matthew': 'NT', 'mark': 'NT', 'luke': 'NT', 'john': 'NT', 'acts': 'NT',
  'romans': 'NT', '1 corinthians': 'NT', '2 corinthians': 'NT', 'galatians': 'NT',
  'ephesians': 'NT', 'philippians': 'NT', 'colossians': 'NT', '1 thessalonians': 'NT',
  '2 thessalonians': 'NT', '1 timothy': 'NT', '2 timothy': 'NT', 'titus': 'NT',
  'philemon': 'NT', 'hebrews': 'NT', 'james': 'NT', '1 peter': 'NT',
  '2 peter': 'NT', '1 john': 'NT', '2 john': 'NT', '3 john': 'NT',
  'jude': 'NT', 'revelation': 'NT',

  // Old Testament
  'genesis': 'OT', 'exodus': 'OT', 'leviticus': 'OT', 'numbers': 'OT',
  'deuteronomy': 'OT', 'joshua': 'OT', 'judges': 'OT', 'ruth': 'OT',
  '1 samuel': 'OT', '2 samuel': 'OT', '1 kings': 'OT', '2 kings': 'OT',
  '1 chronicles': 'OT', '2 chronicles': 'OT', 'ezra': 'OT', 'nehemiah': 'OT',
  'esther': 'OT', 'job': 'OT', 'psalms': 'OT', 'psalm': 'OT', 'proverbs': 'OT',
  'ecclesiastes': 'OT', 'song of solomon': 'OT', 'isaiah': 'OT', 'jeremiah': 'OT',
  'lamentations': 'OT', 'ezekiel': 'OT', 'daniel': 'OT', 'hosea': 'OT',
  'joel': 'OT', 'amos': 'OT', 'obadiah': 'OT', 'jonah': 'OT', 'micah': 'OT',
  'nahum': 'OT', 'habakkuk': 'OT', 'zephaniah': 'OT', 'haggai': 'OT',
  'zechariah': 'OT', 'malachi': 'OT'
};

// In-memory cache for fetched volume JSONs
const cache = {};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url} (HTTP ${res.statusCode})`));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function getVolumeData(volKey) {
  if (cache[volKey]) return cache[volKey];
  const filename = VOLUME_FILES[volKey];
  if (!filename) throw new Error(`Unknown scripture volume: ${volKey}`);

  const url = `${SCRIPTURES_BASE_URL}${filename}`;
  const data = await fetchJson(url);
  cache[volKey] = data;
  return data;
}

/**
 * Parses a reference string into:
 * { bookRaw, volumeKey, chapter, startVerse, endVerse, formattedRef }
 */
function parseScriptureReference(refStr) {
  if (!refStr) return null;
  let clean = String(refStr)
    .replace(/^[-—#*~:\s]+|[-—#*~:\s]+$/g, '')
    .replace(/^\(|\)$/g, '')
    .trim();

  // Strip leading "VERSE" keyword if present (e.g. "VERSE Matthew 11:28-29")
  clean = clean.replace(/^VERSE\s*/i, '').trim();
  clean = clean.replace(/^\(|\)$/g, '').trim();

  // Pattern 1: Book Chapter:StartVerse-EndVerse or Book Chapter:Verse
  // e.g. "Matthew 11:28-29", "Matthew:11:28-29", "1 Nephi 3:7", "D&C 68:6", "Alma 37:37"
  const regex = /^([1-4]?\s*[A-Za-z—\s&]+?)\s*[:\s]\s*(\d+)\s*[:]\s*(\d+)(?:\s*[-–—]\s*(\d+))?$/i;
  const match = clean.match(regex);

  if (match) {
    const bookRaw = match[1].trim();
    const chapter = match[2];
    const startVerse = parseInt(match[3], 10);
    const endVerse = match[4] ? parseInt(match[4], 10) : startVerse;

    const normalizedBook = bookRaw.toLowerCase().replace(/\s+/g, ' ');
    const volumeKey = BOOK_TO_VOLUME[normalizedBook] || 'NT';

    return {
      bookRaw,
      volumeKey,
      chapter,
      startVerse,
      endVerse,
      formattedRef: `${bookRaw} ${chapter}:${startVerse}${endVerse !== startVerse ? '-' + endVerse : ''}`
    };
  }

  // Pattern 2: D&C or Book with Section / Chapter space verse: e.g. "D&C 68 6" or "Matthew 11 28"
  const noColonMatch = clean.match(/^([1-4]?\s*[A-Za-z—\s&]+?)\s+(\d+)\s+(\d+)(?:\s*[-–—]\s*(\d+))?$/i);
  if (noColonMatch) {
    const bookRaw = noColonMatch[1].trim();
    const chapter = noColonMatch[2];
    const startVerse = parseInt(noColonMatch[3], 10);
    const endVerse = noColonMatch[4] ? parseInt(noColonMatch[4], 10) : startVerse;

    const normalizedBook = bookRaw.toLowerCase().replace(/\s+/g, ' ');
    const volumeKey = BOOK_TO_VOLUME[normalizedBook] || 'NT';

    return {
      bookRaw,
      volumeKey,
      chapter,
      startVerse,
      endVerse,
      formattedRef: `${bookRaw} ${chapter}:${startVerse}${endVerse !== startVerse ? '-' + endVerse : ''}`
    };
  }

  return null;
}

/**
 * Finds the matching book key in volume JSON object
 */
function findBookKey(volumeData, bookRaw, volumeKey) {
  if (volumeKey === 'DC') {
    return null; // D&C keys are section numbers directly
  }

  const cleanBook = bookRaw.toLowerCase().replace(/\s+/g, ' ');
  for (const key of Object.keys(volumeData)) {
    if (key === 'last_modified' || key === 'version') continue;
    if (key.toLowerCase() === cleanBook) return key;
    if (key.toLowerCase().replace(/—/g, '-').replace(/\s+/g, ' ') === cleanBook) return key;
  }

  // Fuzzy match
  for (const key of Object.keys(volumeData)) {
    if (key === 'last_modified' || key === 'version') continue;
    if (key.toLowerCase().startsWith(cleanBook) || cleanBook.startsWith(key.toLowerCase())) return key;
  }

  return Object.keys(volumeData)[0];
}

/**
 * Resolves scripture text from bcbooks/scriptures-json
 */
async function lookupScripture(refStr) {
  const parsed = parseScriptureReference(refStr);
  if (!parsed) return null;

  try {
    const volumeData = await getVolumeData(parsed.volumeKey);
    let versesObj = null;

    if (parsed.volumeKey === 'DC') {
      // D&C keys are section numbers directly: data["68"]["6"]
      versesObj = volumeData[parsed.chapter];
    } else {
      const bookKey = findBookKey(volumeData, parsed.bookRaw, parsed.volumeKey);
      if (bookKey && volumeData[bookKey]) {
        versesObj = volumeData[bookKey][parsed.chapter];
      }
    }

    if (!versesObj) {
      return null;
    }

    const collectedVerses = [];
    for (let v = parsed.startVerse; v <= parsed.endVerse; v++) {
      const verseText = versesObj[String(v)];
      if (verseText) {
        collectedVerses.push(verseText.trim());
      }
    }

    if (collectedVerses.length === 0) return null;

    return {
      reference: parsed.formattedRef,
      text: collectedVerses.join(' ')
    };
  } catch (err) {
    console.warn(`Scripture lookup warning for "${refStr}":`, err.message);
    return null;
  }
}

module.exports = {
  lookupScripture,
  parseScriptureReference
};
