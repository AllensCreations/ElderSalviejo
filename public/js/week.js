/**
 * Elder Salviejo • Weekly Missionary Journal Vault
 * Week View Client Application - Scrapbook, Polaroids, Scripture & Anti-Overlap
 */

// Daily pastel themes for alternating journal sheets
const DAY_THEMES = {
  MONDAY: {
    bg: 'bg-[#fef9c3]', // Butter yellow
    border: 'border-yellow-200',
    tapeRotate: '-rotate-2',
    photoRotate: 'rotate-1',
    pinColor: 'bg-red-500'
  },
  TUESDAY: {
    bg: 'bg-[#dcfce7]', // Soft mint
    border: 'border-emerald-200',
    tapeRotate: 'rotate-2',
    photoRotate: '-rotate-1',
    pinColor: 'bg-emerald-600'
  },
  WEDNESDAY: {
    bg: 'bg-[#e0f2fe]', // Sky blue
    border: 'border-sky-200',
    tapeRotate: '-rotate-2',
    photoRotate: 'rotate-1',
    pinColor: 'bg-blue-600'
  },
  THURSDAY: {
    bg: 'bg-[#ffedd5]', // Warm peach
    border: 'border-orange-200',
    tapeRotate: 'rotate-1',
    photoRotate: '-rotate-1',
    pinColor: 'bg-amber-600'
  },
  FRIDAY: {
    bg: 'bg-[#f3e8ff]', // Soft lavender
    border: 'border-purple-200',
    tapeRotate: '-rotate-2',
    photoRotate: 'rotate-1',
    pinColor: 'bg-purple-600'
  },
  SATURDAY: {
    bg: 'bg-[#ffe4e6]', // Soft rose
    border: 'border-rose-200',
    tapeRotate: 'rotate-2',
    photoRotate: '-rotate-1',
    pinColor: 'bg-rose-600'
  },
  SUNDAY: {
    bg: 'bg-[#fef08a]', // Golden honey
    border: 'border-amber-300',
    tapeRotate: '-rotate-1',
    photoRotate: 'rotate-1',
    pinColor: 'bg-yellow-600'
  }
};

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

  // Instant SWR: render from sessionStorage if previously loaded
  try {
    const cached = sessionStorage.getItem(`gdv_week_${slug}`);
    if (cached) {
      const cachedWeek = JSON.parse(cached);
      if (cachedWeek && cachedWeek.title) {
        renderWeek(cachedWeek);
      }
    }
  } catch (_) {}

  try {
    const res = await fetch(`/api/weeks/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.week) throw new Error('Week data not found in response');
    
    try {
      sessionStorage.setItem(`gdv_week_${slug}`, JSON.stringify(data.week));
    } catch (_) {}

    renderWeek(data.week);
  } catch (err) {
    console.warn('API error, attempting jsDelivr CDN week fallback:', err);
    try {
      const cdnUrl = `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/diaries/${encodeURIComponent(slug)}.json`;
      const cdnRes = await fetch(cdnUrl);
      if (cdnRes.ok) {
        const cdnWeek = await cdnRes.json();
        renderWeek(cdnWeek);
        return;
      }
    } catch (_) {}

    if (slug === 'sample' || slug === 'demo') {
      loadSamplePayload();
    } else {
      showError(`Could not load week "${escapeHtml(slug)}": ${err.message}`);
    }
  }
}

async function loadSamplePayload() {
  try {
    const res = await fetch('/sample-data/sample-payload.json');
    if (res.ok) {
      const sample = await res.json();
      renderWeek(sample);
      return;
    }
  } catch (_) {}

  // Fallback sample
  renderWeek({
    title: "Trial & Missionary Routine (Demo)",
    publishedAt: new Date().toISOString(),
    sender: "Elder Salviejo",
    entries: [
      {
        day: "Monday",
        text: "Preparation day! Did laundry, bought groceries at the local market, and spent quality time studying the scriptures with my companion.",
        image: ""
      }
    ],
    verse: {
      reference: "Doctrine and Covenants 68:6",
      text: "Wherefore, be of good cheer, and do not fear, for I the Lord am with you, and will stand by you; and you shall bear record of me, even Jesus Christ, that I am the Son of the living God..."
    }
  });
}

function renderWeek(week) {
  const loadingEl = document.getElementById('loadingState');
  const errorEl = document.getElementById('errorState');
  const contentEl = document.getElementById('diaryContent');

  if (loadingEl) loadingEl.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  if (contentEl) contentEl.classList.remove('hidden');

  const title = week.title || 'Weekly Missionary Journal';
  document.title = `${title} | Elder Salviejo • Philippines Dumaguete Mission`;

  const titleEl = document.getElementById('weekTitle');
  if (titleEl) titleEl.innerText = title;

  const pubDate = new Date(week.publishedAt || Date.now());
  const dateStampEl = document.getElementById('weekDateStamp');
  if (dateStampEl) {
    dateStampEl.innerText = pubDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  const senderEl = document.getElementById('weekSender');
  if (senderEl) senderEl.innerText = 'Elder Salviejo';

  const entries = Array.isArray(week.entries) ? week.entries : [];
  const photoCount = entries.filter(e => e.cdnImage || e.image).length;
  const countEl = document.getElementById('entryCountBadge');
  if (countEl) countEl.innerText = `${photoCount || entries.length} Daily Routine Photo${(photoCount || entries.length) === 1 ? '' : 's'}`;

  // Render Scripture Card
  const verseRefEl = document.getElementById('verseReference');
  const verseTextEl = document.getElementById('verseText');
  if (week.verse && (week.verse.text || week.verse.reference)) {
    if (verseRefEl) verseRefEl.innerText = week.verse.reference || 'Weekly Scripture';
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
    const theme = DAY_THEMES[dayClean] || DAY_THEMES.MONDAY;
    const cleanText = cleanEntryText(entry.text);

    return `
      <article class="relative max-w-3xl mx-auto">
        
        <!-- Journal Page Sheet (Safe padding and zero clipping) -->
        <div class="journal-sheet ${theme.bg} border ${theme.border}">
          
          <!-- Top Washi Tapes (Positioned safely away from pushpin) -->
          <div class="tape absolute -top-3 left-4 sm:left-8 w-20 sm:w-28 h-6 ${theme.tapeRotate}"></div>
          <div class="tape absolute -top-3 right-4 sm:right-8 w-20 sm:w-28 h-6 ${theme.tapeRotate === 'rotate-2' ? '-rotate-2' : 'rotate-2'}"></div>

          <!-- Polaroid Photo Card (Naturally follows photo aspect ratio) -->
          <div class="polaroid-card ${theme.photoRotate}">
            
            <!-- 3D Pushpin Fastening Polaroid to Paper Sheet -->
            <div class="pushpin-anchor">
              <div class="pushpin-head"></div>
              <div class="pushpin-shadow"></div>
            </div>

            <!-- Polaroid Photo Frame -->
            <div class="polaroid-photo-frame">
              ${(entry.cdnImage || entry.image) ? `
                <img
                  src="${entry.cdnImage || entry.image}"
                  alt="${escapeHtml(dayClean)} missionary photograph"
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                  oncontextmenu="return false;"
                  onerror="if (this.src !== '${entry.image || ''}') { this.src = '${entry.image || ''}'; }"
                />
              ` : `
                <div class="text-stone-400 text-xs font-medium text-center py-12 px-6">
                  <svg class="w-8 h-8 mx-auto mb-2 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  No photograph attached for ${escapeHtml(dayClean)}
                </div>
              `}
            </div>

            <!-- Handwritten Polaroid Caption (No filename!) -->
            <div class="polaroid-caption">
              ${escapeHtml(dayClean)} • Missionary Work
            </div>

          </div>

          <!-- Notes Section: Placed cleanly below polaroid with clear separation (100% readable) -->
          <div class="space-y-4 pt-2">
            
            <!-- Clean Day Header (pure MONDAY, no dashes) -->
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-3">
              <div class="flex items-center gap-2 sm:gap-2.5">
                <span class="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${theme.pinColor} shadow-sm"></span>
                <h2 class="font-serif text-xl sm:text-3xl font-bold tracking-wide text-stone-900 uppercase">
                  ${escapeHtml(dayClean)}
                </h2>
              </div>
              <span class="text-[10px] sm:text-[11px] font-sans font-bold text-stone-700 uppercase tracking-wider bg-black/5 px-2.5 sm:px-3 py-1 rounded-full border border-black/5">
                ${dayClean.includes('EXTRA') || dayClean.includes('PHOTO') ? `Photo ${index + 1} of ${entries.length} • Additional Photo` : `Day ${index + 1} of ${entries.length} • Daily Routine`}
              </span>
            </div>

            <!-- Reflection Body Text -->
            <div class="journal-entry-body">
              ${escapeHtml(cleanText || 'No reflection recorded for this day.')}
            </div>

            <!-- Daily Footer Signature -->
            <div class="pt-4 border-t border-black/5 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500 font-hand text-lg">
              <span>Elder Salviejo • Daily missionary routine</span>
              <span class="text-amber-900 font-bold">Philippines Dumaguete Mission</span>
            </div>

          </div>

        </div>
      </article>
    `;
  }).join('');
}

function cleanDayName(rawDay, index) {
  if (!rawDay) return `DAY ${index + 1}`;
  let clean = String(rawDay)
    .replace(/^[-—#*~:\s]+|[-—#*~:\s]+$/g, '')
    .trim()
    .toUpperCase();
  return clean || `DAY ${index + 1}`;
}

function cleanEntryText(rawText) {
  if (!rawText) return '';
  let text = String(rawText).trim();
  // Strip duplicate leading "-MONDAY-", "MONDAY:", etc.
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

function copyShareLink() {
  navigator.clipboard.writeText(window.location.href);
  const btn = document.getElementById('shareBtn');
  if (!btn) return;
  const original = btn.innerHTML;
  btn.innerText = 'Copied Link!';
  setTimeout(() => { btn.innerHTML = original; }, 2000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Keyboard shortcuts: Esc to go back, P to print
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    window.location.href = '/';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  setupImageProtection();
  loadWeek();
});
