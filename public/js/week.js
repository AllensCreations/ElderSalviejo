/**
 * Elder Salviejo • Weekly Missionary Journal Vault
 * Week View Client Application - Version 2.0 Archival Editorial Edition
 * Enriched with Image Date & Time Metadata
 */

function setupImageProtection() {
  document.addEventListener('contextmenu', function (e) {
    if (e.target && (e.target.nodeName === 'IMG' || e.target.closest('.polaroid-card'))) {
      e.preventDefault();
      return false;
    }
  }, false);

  document.addEventListener('dragstart', function (e) {
    if (e.target && (e.target.nodeName === 'IMG' || e.target.closest('.polaroid-card'))) {
      e.preventDefault();
      return false;
    }
  }, false);
}

function getSlugFromPath() {
  const urlParams = new URLSearchParams(window.location.search);
  const queryId = urlParams.get('id') || urlParams.get('slug');
  if (queryId) return queryId;

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const weekIndex = pathParts.indexOf('week');
  if (weekIndex !== -1 && pathParts[weekIndex + 1]) {
    return decodeURIComponent(pathParts[weekIndex + 1]);
  }
  return null;
}

async function loadWeek() {
  const slug = getSlugFromPath();

  if (!slug || slug === 'sample') {
    loadSamplePayload();
    return;
  }

  // Instant SWR cache
  try {
    const cached = localStorage.getItem(`gdv_week_${slug}`);
    if (cached) {
      const cachedWeek = JSON.parse(cached);
      if (cachedWeek) renderWeek(cachedWeek);
    }
  } catch (_) {}

  try {
    const response = await fetch(`/api/weeks/${encodeURIComponent(slug)}`);
    if (!response.ok) {
      if (response.status === 404) {
        showError('The requested weekly journal entry was not found in the archive.');
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const week = data.week;
    if (!week) {
      showError('Empty response from archive.');
      return;
    }

    try {
      localStorage.setItem(`gdv_week_${slug}`, JSON.stringify(week));
    } catch (_) {}

    renderWeek(week);
  } catch (err) {
    console.warn('API error, attempting sample fallback:', err);
    loadSamplePayload();
  }
}

async function loadSamplePayload() {
  try {
    const res = await fetch('/sample-data/sample-payload.json');
    if (!res.ok) throw new Error('Failed to load sample payload');
    const sample = await res.json();
    renderWeek(sample);
  } catch (err) {
    showError('Unable to load weekly journal entries.');
  }
}

function renderWeek(week) {
  const loadingEl = document.getElementById('loadingState');
  const contentEl = document.getElementById('diaryContent');
  if (loadingEl) loadingEl.classList.add('hidden');
  if (contentEl) contentEl.classList.remove('hidden');

  const titleEl = document.getElementById('weekTitle');
  if (titleEl) titleEl.innerText = week.title || 'Weekly Missionary Journal';

  const dateStampEl = document.getElementById('weekDateStamp');
  if (dateStampEl) {
    const pubDate = new Date(week.publishedAt || week.createdAt || Date.now());
    dateStampEl.innerText = pubDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  const entries = Array.isArray(week.entries)
    ? week.entries
    : (typeof week.entries === 'string' ? JSON.parse(week.entries || '[]') : []);

  const countEl = document.getElementById('entryCountBadge');
  if (countEl) countEl.innerText = `${entries.length} Photo Plates`;

  // Scripture Card
  const verseRefEl = document.getElementById('verseReference');
  const verseTextEl = document.getElementById('verseText');
  if (week.verse && (week.verse.text || week.verse.reference)) {
    if (verseRefEl) verseRefEl.innerText = week.verse.reference || 'Weekly Scripture Reflection';
    if (verseTextEl) verseTextEl.innerText = week.verse.text || '';
  } else {
    if (verseRefEl) verseRefEl.innerText = 'Doctrine and Covenants 68:6';
    if (verseTextEl) verseTextEl.innerText = 'Wherefore, be of good cheer, and do not fear, for I the Lord am with you, and will stand by you; and you shall bear record of me, even Jesus Christ, that I am the Son of the living God...';
  }

  // Render Daily Journal Sheets
  const container = document.getElementById('entriesList');
  if (!container) return;

  container.innerHTML = entries.map((entry, index) => {
    const dayClean = cleanDayName(entry.day, index);
    const cleanText = cleanEntryText(entry.text);
    const stampText = entry.archivalStamp || entry.capturedDateTime || (entry.time ? `${dayClean} • ${entry.time} (PHT)` : `${dayClean} • 2026`);

    return `
      <article class="journal-sheet mb-12">
        
        <!-- Day Heading -->
        <div class="flex items-center justify-between gap-3 border-b border-stone-200 pb-3 mb-6">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded bg-stone-100 text-stone-800 border border-stone-300">
              ${escapeHtml(dayClean)}
            </span>
            ${entry.date ? `<span class="font-mono text-xs text-stone-500">${escapeHtml(entry.date)}</span>` : ''}
          </div>
          <span class="font-mono text-[11px] text-stone-500 uppercase tracking-widest">
            ${escapeHtml(stampText)}
          </span>
        </div>

        <!-- Reflection Body -->
        <div class="max-w-2xl mx-auto space-y-4 mb-8">
          <p class="${index === 0 ? 'docket-dropcap' : ''} text-stone-700 text-sm sm:text-base leading-relaxed font-sans">
            ${escapeHtml(cleanText || 'No reflection recorded for this day.')}
          </p>
        </div>

        <!-- Polaroid Photo Frame with Date/Time Stamp -->
        ${(entry.cdnImage || entry.image) ? `
          <div class="polaroid-card">
            <div class="polaroid-photo-frame">
              <img
                src="${entry.cdnImage || entry.image}"
                alt="${escapeHtml(dayClean)} missionary photograph"
                loading="lazy"
                decoding="async"
                draggable="false"
                oncontextmenu="return false;"
              />
            </div>
            <div class="polaroid-caption">
              ${escapeHtml(stampText)}
            </div>
          </div>
        ` : ''}

        <!-- Footer stamp -->
        <div class="pt-4 border-t border-stone-100 flex items-center justify-between font-mono text-xs text-stone-400">
          <span>Day ${index + 1} of ${entries.length} • Dumaguete Field Record</span>
          <span>Elder Salviejo</span>
        </div>

      </article>
    `;
  }).join('');
}

function cleanDayName(rawDay, index) {
  if (!rawDay) return `DAY ${index + 1}`;
  return String(rawDay).replace(/^[-—#*~:\s]+|[-—#*~:\s]+$/g, '').trim().toUpperCase() || `DAY ${index + 1}`;
}

function cleanEntryText(rawText) {
  if (!rawText) return '';
  let text = String(rawText).trim();
  text = text.replace(/^\s*[-—#*~]*\s*(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s*[-—#*~:]*\s*/i, '');
  text = text.replace(/^[-—:\s]+/, '');
  return text.trim();
}

function showError(msg) {
  const loadingEl = document.getElementById('loadingState');
  const contentEl = document.getElementById('diaryContent');
  const errorEl = document.getElementById('errorState');
  const msgEl = document.getElementById('errorMessage');

  if (loadingEl) loadingEl.classList.add('hidden');
  if (contentEl) contentEl.classList.add('hidden');
  if (errorEl) errorEl.classList.remove('hidden');
  if (msgEl) msgEl.innerText = msg;
}

document.addEventListener('DOMContentLoaded', () => {
  setupImageProtection();
  loadWeek();
});
