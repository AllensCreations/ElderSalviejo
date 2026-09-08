/**
 * Mission Countdown & Journey Milestones
 * Calculates live time until MTC entrance (Dec 11, 2026)
 * and 24-month missionary service progress thereafter.
 */

(function () {
  const MTC_DATE = new Date('2026-12-11T08:00:00+08:00'); // Dec 11, 2026, 8:00 AM PST
  const RETURN_DATE = new Date('2028-12-11T08:00:00+08:00'); // 24-month mission completion
  const TOTAL_MISSION_DAYS = 730;

  function updateCountdown() {
    const now = new Date();
    const display = document.getElementById('countdownDisplay');
    const title = document.getElementById('countdownTitle');
    const statusBadge = document.getElementById('countdownStatusBadge');
    
    // Call page elements if present
    const callDisplay = document.getElementById('callCountdownDisplay');

    if (!display && !callDisplay) return;

    if (now < MTC_DATE) {
      // Countdown Phase (Before Dec 11, 2026)
      const diff = MTC_DATE.getTime() - now.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      const html = `
        <div class="flex items-center gap-1 sm:gap-1.5 text-center">
          <div class="px-2 sm:px-2.5 py-1.5 bg-stone-900 text-white rounded-lg shadow-xs min-w-[44px] sm:min-w-[50px]">
            <span class="block text-sm sm:text-base font-bold font-mono text-amber-300 leading-tight">${days}</span>
            <span class="text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-semibold">Days</span>
          </div>
          <span class="font-bold text-amber-700 text-xs sm:text-sm">:</span>
          <div class="px-2 sm:px-2.5 py-1.5 bg-stone-900 text-white rounded-lg shadow-xs min-w-[44px] sm:min-w-[50px]">
            <span class="block text-sm sm:text-base font-bold font-mono text-amber-300 leading-tight">${String(hours).padStart(2, '0')}</span>
            <span class="text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-semibold">Hours</span>
          </div>
          <span class="font-bold text-amber-700 text-xs sm:text-sm">:</span>
          <div class="px-2 sm:px-2.5 py-1.5 bg-stone-900 text-white rounded-lg shadow-xs min-w-[44px] sm:min-w-[50px]">
            <span class="block text-sm sm:text-base font-bold font-mono text-amber-300 leading-tight">${String(mins).padStart(2, '0')}</span>
            <span class="text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-semibold">Mins</span>
          </div>
          <span class="font-bold text-amber-700 text-xs sm:text-sm">:</span>
          <div class="px-2 sm:px-2.5 py-1.5 bg-stone-900 text-white rounded-lg shadow-xs min-w-[44px] sm:min-w-[50px]">
            <span class="block text-sm sm:text-base font-bold font-mono text-amber-400 leading-tight">${String(secs).padStart(2, '0')}</span>
            <span class="text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-semibold">Secs</span>
          </div>
        </div>
      `;

      if (display) display.innerHTML = html;
      if (callDisplay) callDisplay.innerHTML = html;

      if (title) title.innerText = 'Entering the Missionary Training Center (MTC)';
      if (statusBadge) statusBadge.innerText = 'MTC Entrance Countdown';

    } else if (now < RETURN_DATE) {
      // Active Mission Phase (Dec 11, 2026 - Dec 11, 2028)
      const elapsedMs = now.getTime() - MTC_DATE.getTime();
      const servedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
      const remainingDays = Math.max(0, TOTAL_MISSION_DAYS - servedDays);
      const pct = Math.min(100, Math.max(1, Math.round((servedDays / TOTAL_MISSION_DAYS) * 100)));
      const currentMonth = Math.min(24, Math.floor(servedDays / 30.4) + 1);

      if (title) title.innerText = `Philippines Dumaguete Mission • Month ${currentMonth} of 24`;
      if (statusBadge) statusBadge.innerText = 'Active Missionary Service';

      const progressHtml = `
        <div class="w-full sm:w-64 space-y-1.5">
          <div class="flex items-center justify-between text-xs font-semibold text-stone-700">
            <span>${servedDays} Days Served</span>
            <span class="text-amber-800 font-bold">${pct}%</span>
            <span>${remainingDays} Days Left</span>
          </div>
          <div class="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden border border-stone-300/60 shadow-inner">
            <div class="h-full bg-gradient-to-r from-amber-600 to-amber-500 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
          </div>
        </div>
      `;

      if (display) display.innerHTML = progressHtml;
      if (callDisplay) callDisplay.innerHTML = progressHtml;

    } else {
      // Completed Phase
      if (title) title.innerText = 'Mission Honorably Completed!';
      if (statusBadge) statusBadge.innerText = 'Faithfully Returned';

      const finishedHtml = `
        <span class="px-3.5 py-1.5 bg-emerald-100 text-emerald-800 font-semibold text-xs rounded-lg border border-emerald-300">
          🎉 24 Months Completed • Welcome Home Elder Salviejo!
        </span>
      `;

      if (display) display.innerHTML = finishedHtml;
      if (callDisplay) callDisplay.innerHTML = finishedHtml;
    }
  }

  // Initialize immediately, then tick every second
  document.addEventListener('DOMContentLoaded', () => {
    updateCountdown();
    setInterval(updateCountdown, 1000);
  });
})();
