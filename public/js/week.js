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

  // Build collection for UniversalLightbox
  window.WEEK_PLATES = entries.map((entry, index) => {
    const dayClean = cleanDayName(entry.day, index);
    const timeStamp = entry.archivalStamp || entry.capturedDateTime || (entry.time ? `${dayClean} • ${entry.time} (PHT)` : `${dayClean} • 2026`);
    return {
      src: entry.cdnImage || entry.image,
      title: `${dayClean} Field Plate`,
      category: 'Weekly Missionary Journal',
      capturedDate: entry.date,
      capturedTime: entry.time,
      archivalStamp: timeStamp,
      caption: cleanEntryText(entry.text) || 'Weekly missionary reflection from Negros Oriental.',
      // Store original image dimensions for aspect ratio handling if available
      width: entry.width || null,
      height: entry.height || null
    };
  });

  // Proportional auto-resize for weekly journal images (0% cropping, zero dead space)
  window.autoAdjustWeeklyJournalImage = function (img) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    const wrap = img.parentElement;
    if (!wrap) return;

    // Set aspect ratio on wrapper to prevent layout shift
    wrap.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;

    // Constrain width to prevent overflow, height will auto-adjust based on aspect ratio
    wrap.style.width = '100%';
    wrap.style.maxWidth = '560px'; // Match the polaroid-card max-width
    wrap.style.height = 'auto';
  };

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

  // Render 7-Polaroid Scrapbook Bento Grid (12x12) for weekly journal view
  const container = document.getElementById('entriesList');
  if (!container) return;

  // Debug: Log entries count
  console.log('Rendering week with', entries.length, 'entries');

  // Create bento grid container
  container.innerHTML = `
    <div class="scrapbook-grid">
      ${entries.map((entry, index) => {
        const dayClean = cleanDayName(entry.day, index).toLowerCase();
        const cleanText = cleanEntryText(entry.text);
        const stampText = entry.archivalStamp || entry.capturedDateTime || (entry.time ? `${dayClean} • ${entry.time} (PHT)` : `${dayClean} • 2026`);
        // Short excerpt for inside the polaroid caption (max 80 chars)
        const shortCaption = cleanText ? (cleanText.length > 80 ? cleanText.slice(0, 80).trimEnd() + '…' : cleanText) : stampText;

        // Determine grid class based on day
        let gridClass = '';
        let tiltClass = '';
        let isSplitLayout = false;

        switch (dayClean) {
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
            gridClass = 'col-span-2 row-span-2';
            tiltClass = 'tilt-subtle';
        }

        return `
          <article class="polaroid ${gridClass} ${tiltClass}">
            <div class="tape"></div>
            <div class="photo-frame">
              ${(entry.cdnImage || entry.image) ? `
                <img
                  src="${entry.cdnImage || entry.image}"
                  alt="${escapeHtml(dayClean)} missionary photograph"
                  loading="eager"
                  decoding="async"
                  draggable="false"
                  oncontextmenu="return false;"
                  class="weekly-journal-image group-hover:scale-105 transition duration-150 block"
                  onload="autoAdjustWeeklyJournalImage(this)"
                  onerror="handleWeeklyImgError(this, '${entry.cdnImage || ''}', '${entry.image || ''}')"
                />
              ` : `
                <div class="flex items-center justify-center h-full text-[8px] font-mono text-stone-400">Plate Pending</div>
              `}
            </div>
            <div class="polaroid-chin ${isSplitLayout ? 'flex items-center justify-center' : ''}">
              ${isSplitLayout ? `
                <div class="flex-1">
                  <div class="chin-header">
                    <strong>${escapeHtml(dayClean.slice(0, 3).toUpperCase())}</strong>
                    <span>12:00 PHT</span>
                  </div>
                </div>
                <div class="flex-1">
                  <div class="chin-caption">${escapeHtml(shortCaption)}</div>
                </div>
              ` : `
                <div class="chin-header">
                  <strong>${escapeHtml(dayClean.slice(0, 3).toUpperCase())}</strong>
                  <span>12:00 PHT</span>
                </div>
                <div class="chin-caption">${escapeHtml(shortCaption)}</div>
              `}
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
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