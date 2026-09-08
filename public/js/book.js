/**
 * Mission Book Compiler
 * Dynamically renders all weekly missionary letters, scriptures,
 * and high-resolution photographs into an exquisite printable book format.
 */

(function () {
  async function loadCompleteBook() {
    const container = document.getElementById('bookWeeklyChapters');
    const loadingState = document.getElementById('bookLoadingState');
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
        container.innerHTML = `
          <div class="bg-white border border-stone-200 rounded-2xl p-8 sm:p-12 text-center shadow-sm avoid-break">
            <span class="text-3xl sm:text-4xl block mb-3">📬</span>
            <h3 class="font-serif text-lg sm:text-xl font-bold text-stone-900">
              Weekly Field Chapters Begin Following MTC Entrance
            </h3>
            <p class="text-xs sm:text-sm text-stone-600 max-w-lg mx-auto mt-2 leading-relaxed">
              Elder Salviejo enters the MTC on <strong>December 11, 2026</strong>. Each week, on Preparation Day (P-Day), his weekly missionary reflections, scripture notes, and photographs will automatically be typeset and appended into this permanent mission book.
            </p>
            <div class="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
              <span>📍 Philippines Dumaguete Mission • Ready for Automatic Publishing</span>
            </div>
          </div>
        `;
        return;
      }

      // 2. Fetch full details for each week in chronological order
      // (Sort oldest to newest for a classic book reading experience)
      const sortedWeeks = [...weeks].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

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

        chaptersHtml += `
          <article class="book-chapter bg-white border border-stone-200 rounded-2xl p-6 sm:p-10 shadow-md space-y-6">
            
            <!-- Chapter Header -->
            <div class="border-b border-amber-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span class="text-xs font-bold uppercase tracking-widest text-amber-800">Chapter ${i + 2}</span>
                <h2 class="font-serif text-2xl sm:text-3xl font-bold text-stone-900 mt-0.5">
                  ${escapeHtml(weekDetails.title || `Weekly Letter #${i + 1}`)}
                </h2>
              </div>
              <div class="text-xs text-stone-500 font-medium">
                <span>🗓️ ${pDayDate}</span>
              </div>
            </div>

            <!-- Scripture of the Week Box (if present) -->
            ${verse && (verse.reference || verse.text) ? `
              <div class="avoid-break p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
                <div class="text-[10px] uppercase font-bold tracking-widest text-amber-900 mb-1">
                  📖 Scripture Study Focus • ${escapeHtml(verse.reference || '')}
                </div>
                <blockquote class="font-serif italic text-stone-800 text-xs sm:text-sm leading-relaxed">
                  “${escapeHtml(verse.text || '')}”
                </blockquote>
              </div>
            ` : ''}

            <!-- Daily Entries & Reflections -->
            <div class="space-y-6">
              ${entries.map((entry, idx) => `
                <div class="avoid-break space-y-3 pt-2">
                  ${entry.day ? `
                    <h3 class="font-serif text-base sm:text-lg font-bold text-stone-900 border-b border-stone-100 pb-1 flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>${escapeHtml(entry.day)}</span>
                      ${entry.date ? `<span class="text-xs font-sans text-stone-500 font-normal">(${escapeHtml(entry.date)})</span>` : ''}
                    </h3>
                  ` : ''}

                  ${entry.text ? `
                    <p class="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                      ${escapeHtml(entry.text)}
                    </p>
                  ` : ''}

                  ${entry.image ? `
                    <div class="my-4 text-center">
                      <img
                        src="${escapeHtml(entry.image)}"
                        alt="Week Photo"
                        class="max-h-96 mx-auto rounded-xl object-contain shadow-sm border border-stone-200"
                        loading="lazy"
                        decoding="async"
                      />
                      ${entry.caption ? `
                        <p class="text-xs text-stone-500 italic mt-2">${escapeHtml(entry.caption)}</p>
                      ` : ''}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>

            <div class="pt-4 border-t border-stone-200 text-right">
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
