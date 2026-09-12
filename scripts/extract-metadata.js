/**
 * Script to extract EXIF and file date & time metadata from missionary gallery photos.
 * Enriches vault/gallery/index.json with capturedAt, formattedDate, formattedTime, and stamps.
 */

const fs = require('fs');
const path = require('path');

const PHOTOS_DIR = path.join(__dirname, '..', 'vault', 'gallery', 'photos');
const INDEX_JSON_PATH = path.join(__dirname, '..', 'vault', 'gallery', 'index.json');

function extractExifDateTime(buffer) {
  const str = buffer.toString('latin1');
  // Match standard EXIF timestamp format: YYYY:MM:DD HH:MM:SS
  const matches = str.match(/\b(20\d{2})[:\-\/](0[1-9]|1[0-2])[:\-\/](0[1-9]|[12]\d|3[01])\s+([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\b/);
  if (matches) {
    const [_, year, month, day, hours, minutes, seconds] = matches;
    return {
      iso: `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`,
      year: parseInt(year, 10),
      month: parseInt(month, 10),
      day: parseInt(day, 10),
      hours: parseInt(hours, 10),
      minutes: parseInt(minutes, 10),
      seconds: parseInt(seconds, 10)
    };
  }
  return null;
}

function formatMetadata(dateObj, isExif) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsUpper = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  
  const m = months[dateObj.getUTCMonth()];
  const mUpper = monthsUpper[dateObj.getUTCMonth()];
  const d = dateObj.getUTCDate();
  const y = dateObj.getUTCFullYear();
  
  const rawH = dateObj.getUTCHours();
  const rawM = dateObj.getUTCMinutes();
  const ampm = rawH >= 12 ? 'PM' : 'AM';
  const displayH = rawH % 12 || 12;
  const padM = String(rawM).padStart(2, '0');
  const padH24 = String(rawH).padStart(2, '0');
  
  return {
    dateTime: dateObj.toISOString(),
    formattedDate: `${m} ${d}, ${y}`,
    formattedTime: `${displayH}:${padM} ${ampm}`,
    formattedDateTime: `${m} ${d}, ${y} • ${displayH}:${padM} ${ampm}`,
    archivalStamp: `${mUpper} ${String(d).padStart(2, '0')}, ${y} • ${padH24}:${padM} PHT`,
    isExif: Boolean(isExif)
  };
}

function run() {
  if (!fs.existsSync(PHOTOS_DIR)) {
    console.error('Photos directory not found:', PHOTOS_DIR);
    process.exit(1);
  }

  let indexData = [];
  if (fs.existsSync(INDEX_JSON_PATH)) {
    try {
      indexData = JSON.parse(fs.readFileSync(INDEX_JSON_PATH, 'utf8'));
    } catch (e) {
      console.warn('Failed parsing existing index.json, creating new array');
    }
  }

  const existingMap = new Map();
  for (const item of indexData) {
    if (item.filename) {
      existingMap.set(item.filename, item);
    }
  }

  const photoFiles = fs.readdirSync(PHOTOS_DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  console.log(`Found ${photoFiles.length} photo files in ${PHOTOS_DIR}`);

  const enrichedList = [];
  let exifCount = 0;

  for (const file of photoFiles) {
    const filePath = path.join(PHOTOS_DIR, file);
    const buf = fs.readFileSync(filePath);
    const stats = fs.statSync(filePath);
    
    const exifDt = extractExifDateTime(buf);
    let targetDate;
    let hasExif = false;

    if (exifDt) {
      targetDate = new Date(Date.UTC(exifDt.year, exifDt.month - 1, exifDt.day, exifDt.hours, exifDt.minutes, exifDt.seconds));
      hasExif = true;
      exifCount++;
    } else {
      // Fallback to existing uploadedAt or file birthtime/mtime
      const existing = existingMap.get(file);
      if (existing && existing.uploadedAt) {
        targetDate = new Date(existing.uploadedAt);
      } else {
        targetDate = stats.mtime;
      }
    }

    const meta = formatMetadata(targetDate, hasExif);
    const existing = existingMap.get(file) || {};

    const enriched = {
      id: existing.id || `gallery-${file.replace(/\.[^/.]+$/, '')}`,
      src: existing.src || `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${file}`,
      localSrc: `/vault/gallery/photos/${file}`,
      filename: file,
      dateTime: meta.dateTime,
      capturedDate: meta.formattedDate,
      capturedTime: meta.formattedTime,
      capturedDateTime: meta.formattedDateTime,
      archivalStamp: meta.archivalStamp,
      isExif: meta.isExif,
      uploadedAt: existing.uploadedAt || targetDate.toISOString(),
      source: existing.source || 'gallery',
      category: existing.category || 'Mission',
      caption: existing.caption || '',
      album: existing.album || 'Weekly Missionary Journal',
      slug: existing.slug || 'weekly-missionary-journal'
    };

    enrichedList.push(enriched);
  }

  // Write updated index.json
  fs.writeFileSync(INDEX_JSON_PATH, JSON.stringify(enrichedList, null, 2), 'utf8');
  console.log(`Successfully enriched ${enrichedList.length} photos (${exifCount} with camera EXIF).`);
  console.log(`Saved updated gallery index to: ${INDEX_JSON_PATH}`);
}

run();
