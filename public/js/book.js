/**
 * Mission Book Compiler
 * Dynamically renders all weekly missionary letters, scriptures,
 * and high-resolution photographs into an exquisite printable book format.
 */

(function () {
  async function loadCompleteBook() {
    const container = document.getElementById('bookWeeklyChapters');
    const loadingState = document.getElementById('bookLoadingState');
    const tocDynamic = document.getElementById('tocDynamicWeeks');
    if (!container) return;

    try {
      // 1. Fetch weeks list from API or SWR cache
      const cached = localStorage.getItem('elder_salviejo_weeks_cache');
      let weeks = [];

      try {
        const res = await fetch('/api/weeks');
        if (res.ok) {
          const data = await res.json();
          weeks = data.weeks || [];
        } else if (cached) {
          weeks = JSON.parse(cached);
        }
      } catch (err) {
        if (cached) weeks = JSON.parse(cached);
      }

      if (loadingState) loadingState.remove();

      if (!weeks || weeks.length === 0) {
        if (tocDynamic) {
          tocDynamic.innerHTML = `
            <div class="p-2.5 rounded-lg bg-amber-50/50 border border-amber-200/60 text-xs italic text-stone-600">
              Weekly field letters will appear here as they are published following MTC entrance (Dec 11, 2026).
            </div>
          `;
        }

        container.innerHTML = `
          <div class="bg-[#fdfbf7] border border-amber-200/90 rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center shadow-md avoid-break">
            <svg class="w-10 h-10 mx-auto mb-3 text-amber-800/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            <h3 class="font-serif text-lg sm:text-xl font-bold text-stone-900">
              Weekly Field Chapters Begin Following MTC Entrance
            </h3>
            <p class="text-xs sm:text-sm text-stone-600 max-w-lg mx-auto mt-2 leading-relaxed">
              Elder Salviejo enters the MTC on <strong>December 11, 2026</strong>. Each week, on Preparation Day (P-Day), his weekly missionary reflections, scripture notes, and photographs will automatically be typeset and appended into this permanent mission book.
            </p>
            <div class="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-amber-900 bg-amber-100/80 px-3.5 py-1.5 rounded-lg border border-amber-300">
              <span>Philippines Dumaguete Mission • Ready for Automatic Publishing</span>
            </div>
          </div>
        `;
        return;
      }

      // 2. Fetch full details for each week in chronological order
      // (Sort oldest to newest for a classic book reading experience)
      const sortedWeeks = [...weeks].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

      // 3. Populate Table of Contents
      if (tocDynamic) {
        tocDynamic.innerHTML = sortedWeeks.map((w, idx) => {
          const chapNum = idx + 2;
          const chapId = `chapter-week-${w.slug || idx + 1}`;
          const title = w.title || `Weekly Letter #${idx + 1}`;
          const dateStr = w.publishedAt
            ? new Date(w.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : `Week ${idx + 1}`;
          return `
            <a href="#${chapId}" class="group flex items-baseline justify-between gap-3 p-2.5 rounded-lg hover:bg-amber-50/80 border border-transparent hover:border-amber-200 transition text-stone-800">
              <div class="flex items-baseline gap-2 min-w-0">
                <span class="font-serif font-bold text-amber-900 text-sm">Ch. ${chapNum}.</span>
                <span class="font-medium text-xs sm:text-sm text-stone-900 group-hover:text-amber-800 truncate">${escapeHtml(title)}</span>
              </div>
              <div class="border-b border-dotted border-stone-300 flex-1 mx-1"></div>
              <span class="text-xs font-mono text-stone-500 shrink-0">${escapeHtml(dateStr)}</span>
            </a>
          `;
        }).join('');
      }

      let chaptersHtml = '';

      for (let i = 0; i < sortedWeeks.length; i++) {
        const w = sortedWeeks[i];
        let weekDetails = w;

        // Fetch detailed entries if not fully present
        try {
          const detailRes = await fetch(`/api/weeks/${w.slug}`);
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

        chaptersHtml += `
          <article id="${chapId}" class="book-chapter bg-[#fdfbf7] border border-amber-200/90 rounded-2xl sm:rounded-3xl p-6 sm:p-10 shadow-md space-y-6">
            
            <!-- Chapter Header -->
            <div class="border-b border-amber-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span class="text-xs font-bold uppercase tracking-widest text-amber-800">Chapter ${i + 2}</span>
                <h2 class="font-serif text-2xl sm:text-3xl font-bold text-stone-900 mt-0.5">
                  ${escapeHtml(weekDetails.title || `Weekly Letter #${i + 1}`)}
                </h2>
              </div>
              <div class="text-xs text-stone-500 font-medium">
                <span>${pDayDate}</span>
              </div>
            </div>

            <!-- Scripture of the Week Box (if present) -->
            ${verse && (verse.reference || verse.text) ? `
              <div class="avoid-break p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
                <div class="text-[10px] uppercase font-bold tracking-widest text-amber-900 mb-1">
                  Scripture Study Focus • ${escapeHtml(verse.reference || '')}
                </div>
                <blockquote class="font-serif italic text-stone-800 text-xs sm:text-sm leading-relaxed">
                  “${escapeHtml(verse.text || '')}”
                </blockquote>
              </div>
            ` : ''}

            <!-- Daily Entries & Reflections (Optimized for US Letter real estate) -->
            <div class="space-y-6">
              ${entries.map((entry, idx) => `
                <div class="avoid-break border-t border-amber-100/80 pt-4 first:border-t-0 first:pt-0">
                  ${entry.day ? `
                    <h3 class="font-serif text-base sm:text-lg font-bold text-stone-900 pb-2 flex items-center gap-2">
                      <span class="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                      <span>${escapeHtml(entry.day)}</span>
                      ${entry.date ? `<span class="text-xs font-sans text-stone-500 font-normal">(${escapeHtml(entry.date)})</span>` : ''}
                    </h3>
                  ` : ''}

                  ${entry.image ? `
                    <!-- 2-Column Space Utilization: Text Reflection + Polaroid Photo Spread -->
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-5 items-start mt-2">
                      <div class="md:col-span-7 space-y-2">
                        ${entry.text ? `
                          <p class="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                            ${escapeHtml(entry.text)}
                          </p>
                        ` : ''}
                      </div>
                      <div class="md:col-span-5 text-center avoid-break">
                        <div class="inline-block p-2.5 sm:p-3 bg-white border border-amber-200/90 rounded-xl shadow-md rotate-1 hover:rotate-0 transition transform duration-200 max-w-full">
                          <img
                            src="${escapeHtml(entry.image)}"
                            alt="Week Photo"
                            class="max-h-56 sm:max-h-64 w-auto max-w-full mx-auto rounded-lg object-contain"
                            loading="eager"
                            decoding="async"
                          />
                          ${entry.caption ? `
                            <p class="text-xs text-stone-600 italic mt-2 font-hand text-base">${escapeHtml(entry.caption)}</p>
                          ` : ''}
                        </div>
                      </div>
                    </div>
                  ` : `
                    <!-- Full Width Clean Typography Reflection -->
                    <div class="mt-1">
                      ${entry.text ? `
                        <p class="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                          ${escapeHtml(entry.text)}
                        </p>
                      ` : ''}
                    </div>
                  `}
                </div>
              `).join('')}
            </div>

            <div class="pt-4 border-t border-amber-200 flex items-center justify-between">
              <span class="text-xs text-stone-400 uppercase tracking-widest font-medium">Philippines Dumaguete Mission</span>
              <span class="font-hand text-xl text-amber-900">Elder Salviejo</span>
            </div>

          </article>
        `;
      }

      container.innerHTML = chaptersHtml;

    } catch (err) {
      console.error('Error compiling mission book:', err);
      if (loadingState) {
        loadingState.innerHTML = `
          <p class="text-sm text-rose-600 font-medium">Unable to compile full book chapters.</p>
          <button onclick="location.reload()" class="mt-2 text-xs px-3 py-1.5 bg-stone-900 text-white rounded">Retry</button>
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
