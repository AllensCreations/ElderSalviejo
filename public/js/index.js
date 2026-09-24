/**
 * Elder Salviejo • Weekly Missionary Journal Vault
 * Index Client Controller - Version 2.0 Archival Editorial Edition
 * Enriched with Image Date/Time Stamps, Slide-Over Reading Docket, and Anti-Slop Layouts
 */

let allWeeks = [];
let activeDocketIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
  // Clear search input to prevent accidental filtering
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
  console.log('[DEBUG] Search input cleared');

  setupImageProtection();
  fetchWeeks();
  fetchStats();
  setupKeyboardNavigation();
});

// Image protection against drag & context menu save
function setupImageProtection() {
  document.addEventListener('contextmenu', function (e) {
    if (e.target && e.target.nodeName === 'IMG') {
      e.preventDefault();
      return false;
    }
  }, false);

  document.addEventListener('dragstart', function (e) {
    if (e.target && e.target.nodeName === 'IMG') {
      e.preventDefault();
      return false;
    }
  }, false);
}

window.openDocketPlate = function (src, day, timeStamp, text) {
  if (window.UniversalLightbox && src) {
    window.UniversalLightbox.open({
      items: [{
        src: src,
        title: `${day} Plate`,
        category: 'Weekly Missionary Journal',
        capturedDate: timeStamp,
        capturedTime: '',
        archivalStamp: timeStamp,
        caption: text || 'Weekly missionary reflection from Negros Oriental.'
      }],
      index: 0
    });
  }
};

// Fetch total polaroid count for stats badge
async function fetchStats() {
  try {
    const res = await fetch('/api/gallery');
    if (res.ok) {
      const data = await res.json();
      const countEl = document.getElementById('totalPhotosCount');
      if (countEl && data && typeof data.count === 'number') {
        countEl.innerText = data.count;
      }
    }
  } catch (_) {}
}

// Fetch all archived missionary letters from the vault API
async function fetchWeeks() {
  const container = document.getElementById('weeksList');
  if (!container) return;

  // SWR: Instant local cache render
  try {
    const cached = localStorage.getItem('gdv_cached_weeks');
    if (cached) {
      const cachedWeeks = JSON.parse(cached);
      if (Array.isArray(cachedWeeks) && cachedWeeks.length > 0 && allWeeks.length === 0) {
        allWeeks = cachedWeeks;
        const countEl = document.getElementById('totalWeeksCount');
        if (countEl) countEl.innerText = allWeeks.length;
        renderWeeks(allWeeks);
      }
    }
  } catch (_) {}

  try {
    const response = await fetch('/api/weeks', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    allWeeks = data.weeks || [];

    if (allWeeks.length === 0) {
      try {
        const sampleRes = await fetch('/sample-data/sample-payload.json');
        if (sampleRes.ok) {
          const sample = await sampleRes.json();
          allWeeks = [{
            id: 1,
            slug: sample.slug,
            title: sample.title,
            publishedAt: sample.publishedAt,
            rawSubject: sample.rawSubject,
            sender: sample.sender,
            totalEntries: sample.totalEntries,
            imageCount: sample.imageCount,
            verse: sample.verse,
            previewImage: sample.entries && sample.entries[0] ? (sample.entries[0].cdnImage || sample.entries[0].image) : null,
            snippet: sample.entries && sample.entries[0] ? sample.entries[0].text : '',
            entries: sample.entries
          }];
        }
      } catch (_) {}
    }

    try {
      localStorage.setItem('gdv_cached_weeks', JSON.stringify(allWeeks));
    } catch (_) {}

    const countEl = document.getElementById('totalWeeksCount');
    if (countEl) countEl.innerText = allWeeks.length;

    renderWeeks(allWeeks);
  } catch (err) {
    console.warn('API error, attempting sample payload fallback:', err);
    try {
      const sampleRes = await fetch('/sample-data/sample-payload.json');
      if (sampleRes.ok) {
        const sample = await sampleRes.json();
        allWeeks = [{
          id: 1,
          slug: sample.slug,
          title: sample.title,
          publishedAt: sample.publishedAt,
          rawSubject: sample.rawSubject,
          sender: sample.sender,
          totalEntries: sample.totalEntries,
          imageCount: sample.imageCount,
          verse: sample.verse,
          previewImage: sample.entries && sample.entries[0] ? (sample.entries[0].cdnImage || sample.entries[0].image) : null,
          snippet: sample.entries && sample.entries[0] ? sample.entries[0].text : '',
          entries: sample.entries
        }];
        const countEl = document.getElementById('totalWeeksCount');
        if (countEl) countEl.innerText = allWeeks.length;
        renderWeeks(allWeeks);
        return;
      }
    } catch (_) {}

    container.innerHTML = `
      <div class="py-14 px-6 text-center text-stone-600">
        <p class="font-mono text-xs uppercase tracking-widest text-stone-400 mb-2">[VAULT_STATUS: OFFLINE]</p>
        <h3 class="font-serif font-bold text-stone-900 text-lg">Unable to Connect to Archive</h3>
        <p class="text-xs text-stone-500 max-w-sm mx-auto mt-1">Check network connection or try refreshing the letters feed.</p>
        <button onclick="fetchWeeks()" class="mt-4 px-4 py-2 bg-stone-900 text-white rounded-md text-xs font-mono uppercase tracking-wider hover:bg-stone-800 transition">
          Retry Sync
        </button>
      </div>
    `;
  }
}

// Render weekly journal entries in Archival Two-Column Ledger layout
function renderWeeks(weeks) {
  const container = document.getElementById('weeksList');
  const countEl = document.getElementById('displayedCount');
  if (countEl) countEl.innerText = weeks.length;
  if (!container) return;

  if (weeks.length === 0) {
    container.innerHTML = `
      <div class="py-16 px-6 text-center">
        <p class="font-mono text-xs text-stone-400 uppercase tracking-widest mb-1">[ARCHIVE_EMPTY]</p>
        <h3 class="font-serif font-bold text-stone-900 text-xl">The Missionary Vault is Ready</h3>
        <p class="text-xs sm:text-sm text-stone-600 max-w-md mx-auto mt-2 leading-relaxed">
          No weekly journal emails have been published yet. On every Preparation Day (P-Day), Elder Salviejo's field letters and photo plates will be cataloged here.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = weeks.map((w, index) => {
    const pubDate = new Date(w.publishedAt || w.createdAt || Date.now());
    const formattedDate = pubDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const weekNum = String(weeks.length - index).padStart(2, '0');
    const titleText = escapeHtml(w.title || `Week ${weekNum} — Dumaguete Field Letter`);
    const snippetText = escapeHtml(w.snippet || 'Daily field reflections, companion study notes, and polaroid photographs from the Philippine mission.');
    const scriptureRef = w.verse && w.verse.reference ? escapeHtml(w.verse.reference) : null;
    const photoCount = w.imageCount || (Array.isArray(w.entries) ? w.entries.length : 7);
    const isCurrent = index === 0;

    let photoDateStamp = formattedDate.toUpperCase();
    if (w.entries && w.entries[0] && w.entries[0].archivalStamp) {
      photoDateStamp = w.entries[0].archivalStamp;
    }

    return `
      <div
        class="ledger-row ${isCurrent ? 'ledger-row-active' : ''} cursor-pointer group"
        onclick="openDocket(${index})"
        role="button"
        tabindex="0"
        onkeydown="if(event.key==='Enter') openDocket(${index})"
      >
        <div class="flex flex-col sm:flex-row sm:items-stretch gap-0">

          <!-- Left: photo preview (full-height, flush edge) -->
          ${w.previewImage ? `
            <div class="relative shrink-0 sm:w-40 md:w-44 overflow-hidden rounded-l-md bg-stone-900">
              <img
                src="${w.previewImage}"
                alt="Week ${weekNum} preview"
                loading="lazy"
                class="w-full h-full object-cover min-h-[120px] sm:min-h-[160px] opacity-90 group-hover:opacity-100 transition duration-300"
              />
              <!-- Week badge over photo -->
              <span class="absolute top-3 left-3 font-mono text-[10px] font-bold bg-stone-900/80 text-stone-100 px-2 py-0.5 rounded tracking-widest uppercase">
                Wk ${weekNum}
              </span>
            </div>
          ` : `
            <!-- No photo: minimal week badge column -->
            <div class="shrink-0 sm:w-20 md:w-24 bg-stone-50 border-r border-stone-200 flex items-center justify-center rounded-l-md">
              <div class="text-center py-6 sm:py-0">
                <span class="font-mono text-2xl font-black text-stone-300">${weekNum}</span>
                <p class="font-mono text-[8px] text-stone-400 uppercase tracking-widest mt-0.5">WK</p>
              </div>
            </div>
          `}

          <!-- Right: content -->
          <div class="flex-1 min-w-0 p-4 sm:p-5 flex flex-col gap-1.5">

            <!-- Date + current badge -->
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono text-[10px] text-stone-400 uppercase tracking-wider">${formattedDate}</span>
              ${isCurrent ? '<span class="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 uppercase tracking-widest">Current</span>' : ''}
            </div>

            <!-- Title -->
            <h3 class="font-serif text-base sm:text-lg font-bold text-stone-900 leading-snug group-hover:text-red-900 transition line-clamp-2">
              ${titleText}
            </h3>

            <!-- Snippet -->
            <p class="text-xs sm:text-sm text-stone-500 leading-relaxed line-clamp-2 flex-1">
              ${snippetText}
            </p>

            <!-- Footer row -->
            <div class="flex items-center justify-between mt-2 pt-2 border-t border-stone-100">
              <div class="flex items-center gap-3 text-[11px] font-mono text-stone-400">
                <span>${photoCount} plates</span>
                ${scriptureRef ? `<span class="text-stone-300">•</span><span class="text-amber-700">${scriptureRef}</span>` : ''}
              </div>
              <div class="flex items-center gap-3">
                <span class="font-mono text-[11px] font-bold text-red-800 group-hover:text-red-950 transition uppercase tracking-wider">
                  Open &rarr;
                </span>
                <a
                  href="/week/${encodeURIComponent(w.slug || w.id)}"
                  onclick="event.stopPropagation()"
                  class="font-mono text-[10px] text-stone-400 hover:text-stone-700 underline transition"
                >
                  Permalink
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Slide-Over Reading Docket
async function openDocket(index) {
  if (index < 0 || index >= allWeeks.length) return;
  activeDocketIndex = index;
  const week = allWeeks[index];

  const backdrop = document.getElementById('docketBackdrop');
  const panel = document.getElementById('docketPanel');
  const content = document.getElementById('docketContent');
  const titleEl = document.getElementById('docketTitle');
  const metaEl = document.getElementById('docketMeta');

  if (!backdrop || !panel || !content) return;

  const pubDate = new Date(week.publishedAt || week.createdAt || Date.now());
  const formattedDate = pubDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const weekNum = String(allWeeks.length - index).padStart(2, '0');
  if (titleEl) titleEl.innerText = week.title || `Weekly Missionary Journal • Week ${weekNum}`;
  if (metaEl) {
    metaEl.innerHTML = `
      <span>Week ${weekNum}</span>
      <span>•</span>
      <span>${formattedDate}</span>
      <span>•</span>
      <span class="text-red-800 font-semibold">Philippines Dumaguete Mission</span>
    `;
  }

  content.innerHTML = `
    <div class="py-12 text-center text-stone-400 font-mono text-xs">
      Loading archival docket...
    </div>
  `;

  backdrop.classList.add('active');
  panel.classList.add('active');
  document.body.style.overflow = 'hidden';

  // If entries aren't populated yet, fetch single week
  let entries = week.entries;
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    try {
      const res = await fetch(`/api/weeks/${encodeURIComponent(week.slug || week.id)}`);
      if (res.ok) {
        const fullData = await res.json();
        entries = (fullData.week && fullData.week.entries) || fullData.entries || [];
        week.entries = entries;
        if (fullData.week && fullData.week.verse) {
          week.verse = fullData.week.verse;
        }
      }
    } catch (_) {}
  }

  renderDocketBody(week, entries);
}

function renderDocketBody(week, entries) {
  const content = document.getElementById('docketContent');
  if (!content) return;

  const scriptureHtml = week.verse && week.verse.text ? `
    <div class="my-6 p-5 bg-white border border-stone-200 border-l-4 border-l-red-800 rounded-lg shadow-xs">
      <p class="font-serif italic text-stone-800 text-sm sm:text-base leading-relaxed">
        "${escapeHtml(week.verse.text)}"
      </p>
      <span class="block mt-2 font-mono text-xs font-semibold text-red-800 uppercase tracking-wider">
        — ${escapeHtml(week.verse.reference || 'Daily Scripture Reflection')}
      </span>
    </div>
  ` : '';

  let entriesHtml = '';
  if (Array.isArray(entries) && entries.length > 0) {
    entriesHtml = entries.map((entry, idx) => {
      const day = escapeHtml(entry.day || `Day ${idx + 1}`);
      const text = escapeHtml(entry.text || '');
      const timeStamp = entry.archivalStamp || entry.capturedDateTime || (entry.time ? `${day} • ${entry.time}` : `${day} • 2026`);

      return `
        <div class="mb-10 pb-8 border-b border-stone-200 last:border-b-0">
          <div class="flex items-center justify-between gap-3 mb-3">
            <h4 class="font-mono text-xs font-bold uppercase tracking-widest text-stone-900 bg-stone-100 px-2.5 py-1 rounded border border-stone-300">
              ${day}
            </h4>
            <span class="font-mono text-[11px] text-stone-500 uppercase tracking-wider">
              ${timeStamp}
            </span>
          </div>

          <p class="${idx === 0 ? 'docket-dropcap' : ''} text-stone-700 text-sm sm:text-base leading-relaxed">
            ${text}
          </p>

          ${entry.image ? `
            <div class="mt-5 max-w-md mx-auto">
              <div
                class="polaroid-frame cursor-pointer group hover:border-stone-400 transition"
                onclick="openDocketPlate('${escapeAttr(entry.image)}', '${escapeAttr(day)}', '${escapeAttr(timeStamp)}', '${escapeAttr(text)}')"
                title="Click to inspect photo in ratio-locked zoom lightbox"
              >
                <div class="polaroid-photo-wrap overflow-hidden rounded-xs bg-stone-100/70 p-1 flex items-center justify-center max-h-[340px]">
                  <img src="${entry.image}" alt="${day} Photo Plate" class="w-full h-auto max-h-[320px] object-contain rounded-xs group-hover:scale-101 transition duration-150" loading="lazy" />
                </div>
                <div class="polaroid-stamp flex items-center justify-between px-1 pt-1.5">
                  <span class="truncate">${timeStamp}</span>
                  <span class="text-stone-400 text-[10px] group-hover:text-stone-900 ml-1">&rarr;</span>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } else {
    entriesHtml = `
      <p class="docket-dropcap text-stone-700 text-sm sm:text-base leading-relaxed">
        ${escapeHtml(week.snippet || 'No written entries available for this week.')}
      </p>
    `;
  }

  content.innerHTML = `
    ${scriptureHtml}
    <div class="space-y-6 mt-6">
      ${entriesHtml}
    </div>
    <div class="mt-8 pt-6 border-t border-stone-200 flex items-center justify-between">
      <a href="/week/${encodeURIComponent(week.slug || week.id)}" class="inline-flex items-center gap-1 text-xs font-mono font-semibold uppercase text-stone-900 hover:text-red-800 transition">
        <span>View Full Page & Printable Sheet</span>
        <span>&rarr;</span>
      </a>
      <button onclick="closeDocket()" class="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-mono uppercase rounded transition">
        Close Docket
      </button>
    </div>
  `;
}

function closeDocket() {
  const backdrop = document.getElementById('docketBackdrop');
  const panel = document.getElementById('docketPanel');
  if (backdrop) backdrop.classList.remove('active');
  if (panel) panel.classList.remove('active');
  document.body.style.overflow = '';
}

function prevDocket() {
  if (activeDocketIndex > 0) {
    openDocket(activeDocketIndex - 1);
  }
}

function nextDocket() {
  if (activeDocketIndex < allWeeks.length - 1) {
    openDocket(activeDocketIndex + 1);
  }
}

function setupKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    const panel = document.getElementById('docketPanel');
    if (panel && panel.classList.contains('active')) {
      if (e.key === 'Escape') closeDocket();
      if (e.key === 'ArrowLeft') prevDocket();
      if (e.key === 'ArrowRight') nextDocket();
    }
  });
}

// Search & Filter
function filterWeeks() {
  const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  if (!query) {
    renderWeeks(allWeeks);
    return;
  }

  const filtered = allWeeks.filter(w => {
    const title = (w.title || '').toLowerCase();
    const snippet = (w.snippet || '').toLowerCase();
    const scripture = (w.verse && w.verse.text ? w.verse.text : '').toLowerCase();
    return title.includes(query) || snippet.includes(query) || scripture.includes(query);
  });

  renderWeeks(filtered);
}

// Email subscription
async function handleSubscribe(event) {
  event.preventDefault();
  const hp = document.getElementById('hpWebsiteInput')?.value;
  if (hp) return; // bot detected

  const emailInput = document.getElementById('subscribeEmailInput');
  const submitBtn = document.getElementById('subscribeSubmitBtn');
  const feedback = document.getElementById('subscribeFeedback');

  if (!emailInput || !feedback) return;
  const email = emailInput.value.trim();
  if (!email) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Subscribing...';
  }

  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    feedback.classList.remove('hidden', 'text-red-700', 'text-stone-600');
    if (res.ok && data.success) {
      feedback.classList.add('text-stone-900');
      feedback.innerText = 'Subscribed successfully. You will receive weekly P-Day letters.';
      emailInput.value = '';
    } else {
      feedback.classList.add('text-red-700');
      feedback.innerText = data.error || 'Subscription failed. Please try again.';
    }
  } catch (err) {
    feedback.classList.remove('hidden');
    feedback.classList.add('text-red-700');
    feedback.innerText = 'Unable to subscribe at this moment.';
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Subscribe';
    }
  }
}

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
