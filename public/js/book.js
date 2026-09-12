/**
 * Mission Book Compiler: Contemporary Swiss Museum Monograph Edition
 * 
 * Compiles weekly missionary journal entries into true WYSIWYG 8.5 x 11 in book sheets.
 * Features verified camera capture timestamps, multi-tier fallback image protection,
 * and seamless print-to-PDF parity.
 */

(function () {
  // Global image error failover for book sheets
  window.handleBookImgError = function (img, cdnFallback, legacyCdnFallback) {
    if (!img) return;
    const retry = parseInt(img.dataset.retry || '0', 10);
    if (retry === 0 && cdnFallback) {
      img.dataset.retry = '1';
      img.src = cdnFallback;
    } else if (retry === 1 && legacyCdnFallback) {
      img.dataset.retry = '2';
      img.src = legacyCdnFallback;
    }
  };

  async function loadCompleteBook() {
    const container = document.getElementById('bookWeeklyChapters');
    const loadingState = document.getElementById('bookLoadingState');
    const tocDynamic = document.getElementById('tocDynamicWeeks');
    if (!container) return;

    try {
      let weeks = [];
      try {
        const res = await fetch('/api/weeks');
        if (res.ok) {
          const data = await res.json();
          weeks = data.weeks || [];
        }
      } catch (_) {}

      if (!weeks || weeks.length === 0) {
        try {
          const sampleRes = await fetch('/sample-data/sample-payload.json');
          if (sampleRes.ok) {
            const sample = await sampleRes.json();
            weeks = [sample];
          }
        } catch (_) {}
      }

      if (loadingState) loadingState.remove();

      if (!weeks || weeks.length === 0) {
        if (tocDynamic) {
          tocDynamic.innerHTML = `
            <div class="p-2.5 rounded-md bg-stone-50 border border-stone-200 text-xs font-mono text-stone-500">
              Weekly field chapters will appear here as they are published.
            </div>
          `;
        }

        container.innerHTML = `
          <section class="book-sheet text-center py-16 space-y-3">
            <h3 class="font-serif text-lg sm:text-xl font-bold text-stone-900">
              Field Chapters Begin Following MTC Entrance
            </h3>
            <p class="text-xs sm:text-sm text-stone-600 max-w-lg mx-auto leading-relaxed font-sans">
              Elder Salviejo reports to the Missionary Training Center on <strong>December 11, 2026</strong>. Each week, on Preparation Day (P-Day), his missionary reflections, scripture notes, and photographs will automatically be cataloged into this publication monograph.
            </p>
            <div class="pt-4 font-mono text-[11px] text-stone-400">
              Standing by for December 2026 Ingest
            </div>
          </section>
        `;
        return;
      }

      const sortedWeeks = [...weeks].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

      // 1. Render Table of Contents Items
      if (tocDynamic) {
        tocDynamic.innerHTML = sortedWeeks.map((w, idx) => {
          const chapNum = String(idx + 2).padStart(2, '0');
          const chapId = `chapter-week-${w.slug || idx + 1}`;
          const title = w.title || `Weekly Journal Letter #${idx + 1}`;
          const dateStr = w.publishedAt
            ? new Date(w.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : `Week ${idx + 1}`;
          return `
            <a href="#${chapId}" class="group flex items-baseline justify-between gap-3 py-2 px-2.5 rounded-md hover:bg-stone-50 border border-transparent hover:border-stone-200 transition text-stone-800">
              <div class="flex items-baseline gap-2.5 min-w-0">
                <span class="font-mono font-bold text-xs text-stone-900 shrink-0">CH ${chapNum}.</span>
                <span class="text-xs sm:text-sm text-stone-900 group-hover:text-red-800 font-medium truncate">${escapeHtml(title)}</span>
              </div>
              <div class="border-b border-dotted border-stone-300 flex-1 mx-2"></div>
              <span class="text-xs font-mono text-stone-500 shrink-0">${escapeHtml(dateStr)}</span>
            </a>
          `;
        }).join('');
      }

      // 2. Fetch Detailed Week Data & Render into WYSIWYG Book Sheets
      let chaptersHtml = '';
      let runningPageNum = 5; // Cover is 1, TOC is 2, Call is 3, Origin is 4

      for (let i = 0; i < sortedWeeks.length; i++) {
        const w = sortedWeeks[i];
        let weekDetails = w;

        try {
          const detailRes = await fetch(`/api/weeks/${encodeURIComponent(w.slug || w.id)}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            if (detailData && detailData.week) {
              weekDetails = detailData.week;
            }
          }
        } catch (_) {}

        const pDayDate = weekDetails.publishedAt
          ? new Date(weekDetails.publishedAt).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })
          : 'Preparation Day';

        const entries = Array.isArray(weekDetails.entries)
          ? weekDetails.entries
          : (typeof weekDetails.entries === 'string' ? JSON.parse(weekDetails.entries || '[]') : []);

        const verse = weekDetails.verse;
        const chapId = `chapter-week-${w.slug || i + 1}`;
        const chapNum = String(i + 2).padStart(2, '0');

        // Split entries evenly if more than 3 entries to ensure 100% WYSIWYG letter sheet fit
        const splitIndex = entries.length > 3 ? Math.ceil(entries.length / 2) : entries.length;
        const part1Entries = entries.slice(0, splitIndex);
        const part2Entries = entries.slice(splitIndex);

        // --- SHEET PART 1 ---
        const page1Num = String(runningPageNum++).padStart(2, '0');
        chaptersHtml += `
          <section id="${chapId}" class="book-sheet">
            <!-- Sheet Header -->
            <div class="border-b border-stone-200 pb-3 flex items-baseline justify-between">
              <div>
                <span class="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-400">Chapter ${chapNum} • Part 1</span>
                <h2 class="font-serif text-2xl sm:text-3xl font-bold text-stone-900 mt-0.5">
                  ${escapeHtml(weekDetails.title || `Weekly Letter #${i + 1}`)}
                </h2>
              </div>
              <div class="font-mono text-xs text-stone-500 text-right">
                <span>${pDayDate}</span>
              </div>
            </div>

            <!-- Sheet Content -->
            <div class="flex-1 py-3.5 space-y-4">
              <!-- Scripture Study Focus -->
              ${verse && (verse.reference || verse.text) ? `
                <div class="avoid-break p-3.5 bg-stone-50 border-l-3 border-l-red-800 border border-stone-200 rounded-md">
                  <div class="font-mono text-[10px] uppercase font-bold tracking-widest text-red-800 mb-1">
                    Scripture Reflection • ${escapeHtml(verse.reference || '')}
                  </div>
                  <blockquote class="font-serif italic text-stone-800 text-xs sm:text-sm leading-relaxed">
                    “${escapeHtml(verse.text || '')}”
                  </blockquote>
                </div>
              ` : ''}

              <!-- Entries Batch 1 -->
              <div class="space-y-4">
                ${part1Entries.map((entry, eIdx) => renderEntryCard(entry, eIdx)).join('')}
              </div>
            </div>

            <!-- Sheet Footer -->
            <div class="pt-3 border-t border-stone-200 flex items-center justify-between font-mono text-[11px] text-stone-500">
              <span>Chapter ${chapNum} • Elder Mark Salviejo</span>
              <span>Page ${page1Num}</span>
            </div>
          </section>
        `;

        // --- SHEET PART 2 (if week has remaining entries) ---
        if (part2Entries.length > 0) {
          const page2Num = String(runningPageNum++).padStart(2, '0');
          chaptersHtml += `
            <section class="book-sheet">
              <!-- Sheet Header -->
              <div class="border-b border-stone-200 pb-3 flex items-baseline justify-between">
                <div>
                  <span class="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-400">Chapter ${chapNum} • Part 2 (Cont.)</span>
                  <h3 class="font-serif text-xl sm:text-2xl font-bold text-stone-900 mt-0.5">
                    ${escapeHtml(weekDetails.title || `Weekly Letter #${i + 1}`)}
                  </h3>
                </div>
                <div class="font-mono text-xs text-stone-500 text-right">
                  <span>Negros Oriental</span>
                </div>
              </div>

              <!-- Sheet Content -->
              <div class="flex-1 py-3.5 space-y-4">
                <div class="space-y-4">
                  ${part2Entries.map((entry, eIdx) => renderEntryCard(entry, splitIndex + eIdx)).join('')}
                </div>
              </div>

              <!-- Sheet Footer -->
              <div class="pt-3 border-t border-stone-200 flex items-center justify-between font-mono text-[11px] text-stone-500">
                <span>Chapter ${chapNum} • Field Chronicle</span>
                <span>Page ${page2Num}</span>
              </div>
            </section>
          `;
        }
      }

      container.innerHTML = chaptersHtml;

    } catch (err) {
      console.error('Error compiling monograph book:', err);
      if (loadingState) {
        loadingState.innerHTML = `
          <p class="text-xs text-stone-600 font-mono">Unable to compile full book monograph.</p>
          <button onclick="location.reload()" class="mt-2 text-xs font-mono uppercase px-3 py-1.5 bg-stone-900 text-white rounded">Retry</button>
        `;
      }
    }
  }

  function renderEntryCard(entry, idx) {
    const dayName = entry.day || `Day ${idx + 1}`;
    const timeStamp = entry.archivalStamp || entry.capturedDateTime || (entry.time ? `${dayName} • ${entry.time} PHT` : `${dayName} • 2026`);
    const cleanText = entry.text || '';
    const hasImage = Boolean(entry.image);

    // Fallbacks for entry images
    let imgSrc = entry.image || '';
    let cdnFallback = '';
    let legacyCdn = '';

    if (entry.imageFilename) {
      cdnFallback = `https://cdn.jsdelivr.net/gh/AllensCreations/ElderSalviejo@main/vault/gallery/photos/${entry.imageFilename}`;
      legacyCdn = `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${entry.imageFilename}`;
    }

    return `
      <div class="avoid-break border-t border-stone-100 pt-3.5 first:border-t-0 first:pt-0">
        <div class="flex items-center justify-between gap-3 mb-1.5">
          <h4 class="font-mono text-xs font-bold uppercase tracking-wider text-stone-900 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-red-800"></span>
            <span>${escapeHtml(dayName)}</span>
            ${entry.date ? `<span class="text-stone-400 font-normal">(${escapeHtml(entry.date)})</span>` : ''}
          </h4>
          <span class="font-mono text-[10px] text-stone-500 uppercase tracking-wider">
            ${escapeHtml(timeStamp)}
          </span>
        </div>

        ${hasImage ? `
          <div class="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-start mt-2">
            <div class="sm:col-span-8">
              <p class="text-xs sm:text-sm text-stone-700 leading-relaxed font-sans">
                ${escapeHtml(cleanText)}
              </p>
            </div>
            <div class="sm:col-span-4 text-center avoid-break">
              <div class="polaroid-frame inline-block max-w-full">
                <div class="polaroid-photo-wrap aspect-4-3 bg-stone-100 overflow-hidden">
                  <img
                    src="${escapeAttr(imgSrc)}"
                    alt="Plate ${idx + 1}"
                    class="w-full h-full object-cover"
                    loading="eager"
                    decoding="async"
                    onerror="handleBookImgError(this, '${escapeAttr(cdnFallback)}', '${escapeAttr(legacyCdn)}')"
                  />
                </div>
                <div class="polaroid-stamp truncate text-[9px]">
                  ${escapeHtml(timeStamp)}
                </div>
              </div>
            </div>
          </div>
        ` : `
          <div class="mt-1">
            <p class="text-xs sm:text-sm text-stone-700 leading-relaxed font-sans">
              ${escapeHtml(cleanText)}
            </p>
          </div>
        `}
      </div>
    `;
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

  function escapeAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  document.addEventListener('DOMContentLoaded', loadCompleteBook);
})();
