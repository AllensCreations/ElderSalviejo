/**
 * Elder Salviejo • Weekly Missionary Journal Vault
 * Index Client Controller - Version 2.0 Archival Editorial Edition
 * Enriched with Image Date/Time Stamps, Slide-Over Reading Docket, and Anti-Slop Layouts
 */

let allWeeks = [];
let activeDocketIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
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
    const response = await fetch('/api/weeks');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    allWeeks = data.weeks || [];

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
          previewImage: sample.entries && sample.entries[0] ? sample.entries[0].image : null,
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
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const weekNum = String(weeks.length - index).padStart(2, '0');
    const titleText = escapeHtml(w.title || `Weekly Missionary Journal • Week ${weekNum}`);
    const snippetText = escapeHtml(w.snippet || 'Click to examine daily routine reflections and view field polaroids...');
    const scriptureText = w.verse && w.verse.reference ? escapeHtml(w.verse.reference) : 'Dumaguete, Negros Oriental';
    const photoCount = w.imageCount || (Array.isArray(w.entries) ? w.entries.length : 7);

    // Extract time or archival stamp if available
    let photoDateStamp = 'SEPTEMBER 2026';
    if (w.entries && w.entries[0] && w.entries[0].archivalStamp) {
      photoDateStamp = w.entries[0].archivalStamp;
    }

    return `
      <div class="ledger-row ${index === 0 ? 'ledger-row-active' : ''} p-5 sm:p-6 cursor-pointer" onclick="openDocket(${index})" role="button" tabindex="0" onkeydown="if(event.key==='Enter') openDocket(${index})">
        <div class="flex flex-col md:flex-row md:items-start justify-between gap-5">
          
          <!-- Left Column: Archival Ledger Metadata -->
          <div class="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-stone-200 pb-4 md:pb-0 md:pr-5">
            <div class="flex items-center gap-2 mb-2">
              <span class="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-800 border border-stone-300">
                WK ${weekNum}
              </span>
              ${index === 0 ? '<span class="font-mono text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">Current</span>' : ''}
            </div>
            <div class="font-mono text-xs text-stone-500 mb-1">
              ${formattedDate}
            </div>
            <div class="font-mono text-[11px] text-stone-600 flex items-center gap-1.5 mt-2">
              <svg class="w-3.5 h-3.5 text-stone-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <span>${photoCount} Photo Plates</span>
            </div>
            <div class="text-[11px] text-stone-500 truncate mt-1">
              Ref: <span class="text-stone-800 font-medium">${scriptureText}</span>
            </div>
          </div>

          <!-- Middle Column: Headline & Editorial Narrative -->
          <div class="flex-1 min-w-0 pr-0 md:pr-4">
            <h3 class="font-serif text-lg sm:text-xl font-bold text-stone-900 leading-snug group-hover:text-red-900 transition">
              ${titleText}
            </h3>
            <p class="text-xs sm:text-sm text-stone-600 mt-2 leading-relaxed line-clamp-3">
              ${snippetText}
            </p>
            <div class="mt-4 flex items-center gap-3">
              <span class="inline-flex items-center gap-1 text-xs font-semibold text-red-800 hover:text-red-950 transition font-mono uppercase tracking-wider">
                <span>Read Docket</span>
                <span>&rarr;</span>
              </span>
              <a href="/week/${encodeURIComponent(w.slug || w.id)}" onclick="event.stopPropagation()" class="text-xs text-stone-400 hover:text-stone-700 font-mono underline transition" title="Open Permalink Sheet">
                Permalink
              </a>
            </div>
          </div>

          <!-- Right Column: Refined Polaroid Preview with Date & Time Stamp -->
          ${w.previewImage ? `
            <div class="w-full sm:w-44 md:w-36 shrink-0 self-center md:self-start">
              <div class="polaroid-frame">
                <div class="polaroid-photo-wrap aspect-4-3 sm:aspect-square">
                  <img src="${w.previewImage}" alt="Week ${weekNum} Plate" loading="lazy" />
                </div>
                <div class="polaroid-stamp">
                  ${photoDateStamp}
                </div>
              </div>
            </div>
          ` : ''}

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
        entries = fullData.entries || [];
        week.entries = entries;
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
              <div class="polaroid-frame">
                <div class="polaroid-photo-wrap">
                  <img src="${entry.image}" alt="${day} Photo Plate" loading="lazy" />
                </div>
                <div class="polaroid-stamp">
                  ${timeStamp}
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
