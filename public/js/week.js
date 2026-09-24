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
    const response = await fetch(`/api/weeks/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!response.ok) {
      // Even on 404, try sample fallback — stale SW cache may have poisoned this URL
      console.warn(`API returned ${response.status} for ${slug}, trying fallback`);
      loadSamplePayload(slug);
      return;
    }

    const data = await response.json();
    const week = data.week;
    if (!week) {
      loadSamplePayload(slug);
      return;
    }

    try {
      localStorage.setItem(`gdv_week_${slug}`, JSON.stringify(week));
    } catch (_) {}

    renderWeek(week);
  } catch (err) {
    console.warn('API error, attempting sample fallback:', err);
    loadSamplePayload(slug);
  }
}

async function loadSamplePayload(slug) {
  try {
    const res = await fetch('/sample-data/sample-payload.json');
    if (!res.ok) throw new Error('Failed to load sample payload');
    const sample = await res.json();
    renderWeek(sample);
  } catch (err) {
    showError(`Unable to load weekly journal entries for "${slug || 'this week'}". Please check your connection and try again.`);
  }
}

function optimizeWeeklyJustifiedRows(photos) {
  const splits = [[2, 3, 2], [3, 2, 2], [2, 2, 3]];
  let best = null;
  let minVar = Infinity;

  function combinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [head, ...tail] = arr;
    const withHead = combinations(tail, k - 1).map(c => [head, ...c]);
    const withoutHead = combinations(tail, k);
    return [...withHead, ...withoutHead];
  }

  function getPartitions(items, sizes) {
    if (sizes.length === 1) return [[items]];
    const [s, ...rest] = sizes;
    const res = [];
    const comb = combinations(items, s);
    for (const c of comb) {
      const remaining = items.filter(x => !c.includes(x));
      const sub = getPartitions(remaining, rest);
      for (const sPart of sub) {
        res.push([c, ...sPart]);
      }
    }
    return res;
  }

  for (const split of splits) {
    const parts = getPartitions(photos, split);
    for (const p of parts) {
      const sums = p.map(row => row.reduce((acc, x) => acc + (x.aspectRatio || 0.75), 0));
      const mean = sums.reduce((a, b) => a + b, 0) / 3;
      const variance = sums.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
      
      let inversions = 0;
      const flattened = p.flat();
      for (let i = 0; i < flattened.length; i++) {
        for (let j = i + 1; j < flattened.length; j++) {
          if (photos.indexOf(flattened[i]) > photos.indexOf(flattened[j])) {
            inversions++;
          }
        }
      }
      const score = variance + inversions * 0.08;
      if (score < minVar) {
        minVar = score;
        best = p;
      }
    }
  }
  return best || [photos.slice(0, 2), photos.slice(2, 5), photos.slice(5)];
}

function renderWeek(week) {
  const loadingEl = document.getElementById('loadingState');
  const contentEl = document.getElementById('diaryContent');
  const errorEl = document.getElementById('errorState');
  if (loadingEl) loadingEl.classList.add('hidden');
  if (contentEl) contentEl.classList.remove('hidden');
  if (errorEl) errorEl.classList.add('hidden');

  const pubDate = new Date(week.publishedAt || week.createdAt || Date.now());
  const formattedDate = pubDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const rawEntries = Array.isArray(week.entries)
    ? week.entries
    : (typeof week.entries === 'string' ? JSON.parse(week.entries || '[]') : []);

  // Standard 7-day sequence (Mon-Sun) to ensure complete 7-image sheet layout
  const standardDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const sevenDays = standardDays.map((stdDay, idx) => {
    const found = rawEntries.find((e, eIdx) => {
      const clean = cleanDayName(e.day, eIdx).toLowerCase();
      return clean.includes(stdDay) || (stdDay === 'wednesday' && clean.includes('wed')) || (stdDay === 'thursday' && clean.includes('thu'));
    }) || rawEntries[idx];

    const dayName = stdDay.charAt(0).toUpperCase() + stdDay.slice(1);
    if (found) {
      return {
        day: dayName,
        dayKey: stdDay,
        text: cleanEntryText(found.text) || `${dayName} field reflections and missionary service in Dumaguete.`,
        image: found.cdnImage || found.image || null,
        cdnFallback: found.imageFilename ? `https://cdn.jsdelivr.net/gh/AllensCreations/ElderSalviejo@main/vault/gallery/photos/${found.imageFilename}` : '',
        legacyCdn: found.imageFilename ? `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${found.imageFilename}` : '',
        aspectRatio: (found && (found.aspectRatio || (found.width && found.height ? found.width / found.height : 0.75))) || 0.75,
        time: found.time || '12:00 PHT',
        date: found.date || '',
        archivalStamp: found.archivalStamp || ''
      };
    } else {
      return {
        day: dayName,
        dayKey: stdDay,
        text: `${dayName} companion study and field work.`,
        image: null,
        cdnFallback: '',
        legacyCdn: '',
        aspectRatio: 0.75,
        time: '12:00 PHT',
        date: '',
        archivalStamp: ''
      };
    }
  });

  // Scripture Quote & Reference
  const verse = week.verse || null;
  const verseRef = (verse && (verse.reference || verse.ref)) || 'Alma 26:12';
  const verseText = (verse && verse.text) || 'Yea, I know that I am nothing; as to my strength I am weak; therefore I will not boast of myself, but I will boast of my God, for in his strength I can do all things.';

  // Build collection for UniversalLightbox
  window.WEEK_PLATES = sevenDays.map((entry) => {
    return {
      src: entry.image,
      fallback: entry.cdnFallback,
      legacyCdnSrc: entry.legacyCdn,
      title: `${entry.day} Field Plate`,
      category: 'Weekly Missionary Journal',
      capturedDate: entry.date || formattedDate,
      capturedTime: entry.time,
      archivalStamp: entry.archivalStamp || `${entry.day} • ${entry.time}`,
      caption: entry.text
    };
  });

  window.openWeekPlate = function (idx) {
    if (window.UniversalLightbox && window.WEEK_PLATES) {
      const validItems = window.WEEK_PLATES.filter(p => Boolean(p.src));
      const targetItem = window.WEEK_PLATES[idx];
      const targetIndex = validItems.findIndex(p => p.src === targetItem?.src);
      if (targetIndex !== -1) {
        window.UniversalLightbox.open({
          items: validItems,
          index: targetIndex
        });
      }
    }
  };

  // Dynamic Aspect Ratio Optimizer: groups 7 photos into 3 balanced rows (2/3/2 combinations)
  const justifiedRows = optimizeWeeklyJustifiedRows(sevenDays);
  const rowSums = justifiedRows.map(r => r.reduce((acc, x) => acc + (x.aspectRatio || 0.75), 0));
  const rowWeights = rowSums.map(s => (s > 0 ? (1 / s).toFixed(3) : '1'));

  const justifiedRowsHtml = justifiedRows.map((row, rIdx) => {
    const weight = rowWeights[rIdx];
    const cardsHtml = row.map((entry) => {
      const origIndex = sevenDays.indexOf(entry);
      const flexVal = (entry.aspectRatio || 0.75).toFixed(3);
      const shortCaption = entry.text.length > 55 ? entry.text.slice(0, 55).trimEnd() + '…' : entry.text;
      const hasImg = Boolean(entry.image);

      return `
        <article
          class="polaroid-card"
          style="flex: ${flexVal} ${flexVal} 0px;"
          ${hasImg ? `onclick="openWeekPlate(${origIndex})"` : ''}
          title="${escapeHtml(entry.day)} Reflection (Click to zoom)"
        >
          <div class="photo-frame">
            ${hasImg ? `
              <img
                src="${escapeHtml(entry.image)}"
                alt="${escapeHtml(entry.day)} missionary photograph"
                class="w-full h-full object-contain block"
                loading="eager"
                decoding="async"
                draggable="false"
                oncontextmenu="return false;"
                onerror="handleWeeklyImgError(this, '${escapeAttr(entry.cdnFallback)}', '${escapeAttr(entry.legacyCdn)}')"
              />
            ` : `
              <div class="flex items-center justify-center h-full text-[9px] font-mono text-stone-400">Plate Pending</div>
            `}
          </div>
          <div class="polaroid-chin">
            <div class="flex items-baseline gap-1 shrink-0">
              <strong class="chin-badge">${entry.day.slice(0, 3).toUpperCase()}</strong>
              <span class="chin-time">${escapeHtml(entry.time)}</span>
            </div>
            <div class="chin-caption" title="${escapeHtml(entry.text)}">
              ${escapeHtml(shortCaption)}
            </div>
          </div>
        </article>
      `;
    }).join('');

    return `
      <div class="scrapbook-row" style="flex: ${weight} 1 0px;">
        ${cardsHtml}
      </div>
    `;
  }).join('');

  // Render 7-Polaroid Adaptive Justified Rows in true US Letter Sheet
  contentEl.innerHTML = `
    <div class="sheet">
      <!-- Masthead -->
      <header class="sheet-masthead">
        <div class="masthead-title">
          <span>Field Letter &amp; Weekly Journal</span>
          <h1>${escapeHtml(week.title || 'Weekly Missionary Journal')}</h1>
        </div>
        <div class="masthead-meta">
          <strong>${escapeHtml(formattedDate)}</strong><br>
          Dumaguete City, Negros Oriental
        </div>
      </header>

      <!-- Scripture Quote -->
      <div class="scripture-strip">
        <div class="scripture-quote">
          “${escapeHtml(verseText)}”
        </div>
        <div class="scripture-ref">
          ${escapeHtml(verseRef)}<br>
          Dumaguete Mission
        </div>
      </div>

      <!-- 7-Polaroid Adaptive Justified Rows (Aspect-Ratio Locked, Zero Open Spaces) -->
      <main class="scrapbook-adaptive-container">
        ${justifiedRowsHtml}
      </main>

      <!-- Page Footer -->
      <footer class="sheet-footer">
        <span>ELDER SALVIEJO • PHILIPPINES DUMAGUETE MISSION</span>
        <span>FIELD JOURNAL ENTRY</span>
      </footer>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function handleWeeklyImgError(img, cdnFallback, legacyCdn) {
  // Try CDN fallback first
  if (cdnFallback) {
    img.src = cdnFallback;
    return;
  }

  // Try legacy CDN
  if (legacyCdn) {
    img.src = legacyCdn;
    return;
  }

  // If all else fails, keep the broken image icon (will show alt text)
  img.onerror = null; // Prevent infinite loop
}

document.addEventListener('DOMContentLoaded', () => {
  setupImageProtection();
  loadWeek();
});