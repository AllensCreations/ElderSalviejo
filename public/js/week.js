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

  // Render 7-Polaroid Scrapbook Bento Grid (12x12) in true US Letter Sheet
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

      <!-- 7-Polaroid Scrapbook Bento Grid -->
      <main class="scrapbook-grid">
        ${sevenDays.map((entry, index) => {
          const dayLower = entry.dayKey;
          const shortCaption = entry.text.length > 72 ? entry.text.slice(0, 72).trimEnd() + '…' : entry.text;

          let gridClass = '';
          let tiltClass = '';
          let isSplitLayout = false;

          switch (dayLower) {
            case 'monday':
              gridClass = 'cell-mon';
              tiltClass = 'tilt-left';
              break;
            case 'tuesday':
              gridClass = 'cell-tue';
              tiltClass = 'tilt-right';
              break;
            case 'wednesday':
              gridClass = 'cell-wed';
              tiltClass = 'tilt-subtle';
              break;
            case 'thursday':
              gridClass = 'cell-thu';
              tiltClass = 'tilt-right';
              break;
            case 'friday':
              gridClass = 'cell-fri';
              tiltClass = 'tilt-left';
              break;
            case 'saturday':
              gridClass = 'cell-sat';
              tiltClass = 'tilt-subtle';
              isSplitLayout = true;
              break;
            case 'sunday':
              gridClass = 'cell-sun';
              tiltClass = 'tilt-right';
              isSplitLayout = true;
              break;
            default:
              gridClass = 'cell-wed';
              tiltClass = 'tilt-subtle';
          }

          const hasImg = Boolean(entry.image);

          return `
            <article
              class="polaroid ${gridClass} ${tiltClass}"
              ${hasImg ? `onclick="openWeekPlate(${index})"` : ''}
              title="${escapeHtml(entry.day)} Reflection (Click to zoom)"
            >
              <div class="tape"></div>
              <div class="photo-frame">
                ${hasImg ? `
                  <img
                    src="${escapeHtml(entry.image)}"
                    alt="${escapeHtml(entry.day)} missionary photograph"
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
              <div class="polaroid-chin ${isSplitLayout ? 'flex items-center justify-center' : ''}">
                ${isSplitLayout ? `
                  <div class="flex-1">
                    <div class="chin-header">
                      <strong>${escapeHtml(entry.day)}</strong>
                      <span>${escapeHtml(entry.time)}</span>
                    </div>
                  </div>
                  <div class="flex-1">
                    <div class="chin-caption" title="${escapeHtml(entry.text)}">${escapeHtml(shortCaption)}</div>
                  </div>
                ` : `
                  <div class="chin-header">
                    <strong>${escapeHtml(entry.day)}</strong>
                    <span>${escapeHtml(entry.time)}</span>
                  </div>
                  <div class="chin-caption" title="${escapeHtml(entry.text)}">${escapeHtml(shortCaption)}</div>
                `}
              </div>
            </article>
          `;
        }).join('')}
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