/**
 * Mission Book Compiler: Contemporary Museum Catalog Edition
 * Clean Swiss publication style with sharp typography and architectural white space.
 * Enriched with Image Date/Time Stamps.
 */

(function () {
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
            <div class="p-3 rounded-md bg-stone-50 border border-stone-200 text-xs font-mono text-stone-500">
              Weekly field chapters will appear here as they are published.
            </div>
          `;
        }

        container.innerHTML = `
          <div class="bg-white border border-stone-200 rounded-xl p-8 sm:p-12 text-center shadow-xs avoid-break">
            <h3 class="font-serif text-lg sm:text-xl font-bold text-stone-900">
              Field Chapters Begin Following MTC Entrance
            </h3>
            <p class="text-xs sm:text-sm text-stone-600 max-w-lg mx-auto mt-2 leading-relaxed">
              Elder Salviejo reports to the MTC on <strong>December 11, 2026</strong>. Each week, on Preparation Day (P-Day), his missionary reflections, scripture notes, and photographs will automatically be cataloged into this publication monograph.
            </p>
          </div>
        `;
        return;
      }

      const sortedWeeks = [...weeks].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

      // Table of Contents
      if (tocDynamic) {
        tocDynamic.innerHTML = sortedWeeks.map((w, idx) => {
          const chapNum = String(idx + 2).padStart(2, '0');
          const chapId = `chapter-week-${w.slug || idx + 1}`;
          const title = w.title || `Weekly Journal Letter #${idx + 1}`;
          const dateStr = w.publishedAt
            ? new Date(w.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : `Week ${idx + 1}`;
          return `
            <a href="#${chapId}" class="group flex items-baseline justify-between gap-3 py-2 px-3 rounded-md hover:bg-stone-50 border border-transparent hover:border-stone-200 transition text-stone-800">
              <div class="flex items-baseline gap-2.5 min-w-0">
                <span class="font-mono font-bold text-xs text-stone-900">CH ${chapNum}.</span>
                <span class="font-sans text-xs sm:text-sm text-stone-900 group-hover:text-red-800 truncate font-medium">${escapeHtml(title)}</span>
              </div>
              <div class="border-b border-dotted border-stone-300 flex-1 mx-2"></div>
              <span class="text-xs font-mono text-stone-500 shrink-0">${escapeHtml(dateStr)}</span>
            </a>
          `;
        }).join('');
      }

      let chaptersHtml = '';

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

        chaptersHtml += `
          <article id="${chapId}" class="book-chapter bg-white border border-stone-200 rounded-xl p-6 sm:p-10 shadow-xs space-y-6">
            
            <!-- Chapter Header -->
            <div class="border-b border-stone-200 pb-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div>
                <span class="font-mono text-xs font-bold uppercase tracking-widest text-stone-500">Chapter ${chapNum}</span>
                <h2 class="font-serif text-2xl sm:text-3xl font-bold text-stone-900 mt-0.5">
                  ${escapeHtml(weekDetails.title || `Weekly Letter #${i + 1}`)}
                </h2>
              </div>
              <div class="font-mono text-xs text-stone-500 shrink-0">
                <span>${pDayDate}</span>
              </div>
            </div>

            <!-- Scripture Study Focus -->
            ${verse && (verse.reference || verse.text) ? `
              <div class="avoid-break p-4 bg-stone-50 border-l-3 border-l-red-800 border border-stone-200 rounded-md">
                <div class="font-mono text-[10px] uppercase font-bold tracking-widest text-red-800 mb-1">
                  Scripture Reflection • ${escapeHtml(verse.reference || '')}
                </div>
                <blockquote class="font-serif italic text-stone-800 text-xs sm:text-sm leading-relaxed">
                  “${escapeHtml(verse.text || '')}”
                </blockquote>
              </div>
            ` : ''}

            <!-- Daily Entries & Visual Plates -->
            <div class="space-y-8">
              ${entries.map((entry, idx) => {
                const timeStamp = entry.archivalStamp || entry.capturedDateTime || (entry.time ? `${entry.day} • ${entry.time}` : '');

                return `
                  <div class="avoid-break border-t border-stone-100 pt-6 first:border-t-0 first:pt-0">
                    ${entry.day ? `
                      <div class="flex items-center justify-between gap-3 mb-2">
                        <h3 class="font-mono text-xs font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
                          <span class="w-2 h-2 rounded-full bg-stone-900"></span>
                          <span>${escapeHtml(entry.day)}</span>
                          ${entry.date ? `<span class="text-stone-400 font-normal">(${escapeHtml(entry.date)})</span>` : ''}
                        </h3>
                        ${timeStamp ? `
                          <span class="font-mono text-[10px] text-stone-500 uppercase tracking-widest">
                            ${escapeHtml(timeStamp)}
                          </span>
                        ` : ''}
                      </div>
                    ` : ''}

                    ${entry.image ? `
                      <div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-start mt-3">
                        <div class="md:col-span-7">
                          ${entry.text ? `
                            <p class="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line font-sans">
                              ${escapeHtml(entry.text)}
                            </p>
                          ` : ''}
                        </div>
                        <div class="md:col-span-5 text-center avoid-break">
                          <div class="polaroid-frame inline-block max-w-full">
                            <div class="polaroid-photo-wrap">
                              <img
                                src="${escapeHtml(entry.image)}"
                                alt="Plate ${idx + 1}"
                                class="max-h-56 sm:max-h-64 w-auto max-w-full mx-auto object-contain"
                                loading="eager"
                                decoding="async"
                              />
                            </div>
                            <div class="polaroid-stamp">
                              ${escapeHtml(timeStamp || 'Dumaguete Field Plate')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ` : `
                      <div class="mt-1">
                        ${entry.text ? `
                          <p class="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line font-sans">
                            ${escapeHtml(entry.text)}
                          </p>
                        ` : ''}
                      </div>
                    `}
                  </div>
                `;
              }).join('')}
            </div>

            <div class="pt-4 border-t border-stone-200 flex items-center justify-between font-mono text-xs text-stone-400">
              <span class="uppercase tracking-wider">Philippines Dumaguete Mission</span>
              <span>Elder Mark Salviejo</span>
            </div>

          </article>
        `;
      }

      container.innerHTML = chaptersHtml;

    } catch (err) {
      console.error('Error compiling monograph:', err);
      if (loadingState) {
        loadingState.innerHTML = `
          <p class="text-sm text-stone-600 font-mono">Unable to compile full book monograph.</p>
          <button onclick="location.reload()" class="mt-2 text-xs font-mono uppercase px-3 py-1.5 bg-stone-900 text-white rounded">Retry</button>
        `;
      }
    }
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

  document.addEventListener('DOMContentLoaded', loadCompleteBook);
})();
