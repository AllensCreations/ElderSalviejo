/**
 * Mission Countdown & Journey Milestones
 * - Pre-MTC (until Dec 11, 2026): Countdown to entering the MTC.
 * - Active Mission (Dec 11, 2026 to Dec 11, 2028): Turns into the 2-Year Countdown
 *   counting down the full 730 days to Honorable Release & Homecoming.
 * - Post-Mission: Celebration banner.
 */

(function () {
  const MTC_DATE = new Date('2026-12-11T08:00:00+08:00'); // Dec 11, 2026, 8:00 AM PST
  const RETURN_DATE = new Date('2028-12-11T08:00:00+08:00'); // Dec 11, 2028, 8:00 AM PST (2 full years)
  const TOTAL_MISSION_DAYS = 730;

  function renderCountdownBoxes(days, hours, mins, secs, subline, alignRight = false) {
    const alignClasses = alignRight ? 'items-center md:items-end' : 'items-center';
    const textClasses = alignRight ? 'text-center md:text-right' : 'text-center';

    return `
      <div class="flex flex-col ${alignClasses} gap-1 sm:gap-1.5 w-full sm:w-auto">
        <div class="flex items-center justify-center gap-1 sm:gap-1.5 text-center flex-nowrap">
          <div class="px-1.5 xs:px-2 sm:px-2.5 py-1 sm:py-1.5 bg-stone-900 text-white rounded-lg shadow-xs min-w-[36px] xs:min-w-[44px] sm:min-w-[54px] shrink-0">
            <span class="block text-xs xs:text-sm sm:text-base font-bold font-mono text-amber-300 leading-tight">${days}</span>
            <span class="text-[7.5px] xs:text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-semibold">Days</span>
          </div>
          <span class="font-bold text-amber-700 text-xs sm:text-sm shrink-0">:</span>
          <div class="px-1.5 xs:px-2 sm:px-2.5 py-1 sm:py-1.5 bg-stone-900 text-white rounded-lg shadow-xs min-w-[32px] xs:min-w-[38px] sm:min-w-[48px] shrink-0">
            <span class="block text-xs xs:text-sm sm:text-base font-bold font-mono text-amber-300 leading-tight">${String(hours).padStart(2, '0')}</span>
            <span class="text-[7.5px] xs:text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-semibold">Hours</span>
          </div>
          <span class="font-bold text-amber-700 text-xs sm:text-sm shrink-0">:</span>
          <div class="px-1.5 xs:px-2 sm:px-2.5 py-1 sm:py-1.5 bg-stone-900 text-white rounded-lg shadow-xs min-w-[32px] xs:min-w-[38px] sm:min-w-[48px] shrink-0">
            <span class="block text-xs xs:text-sm sm:text-base font-bold font-mono text-amber-300 leading-tight">${String(mins).padStart(2, '0')}</span>
            <span class="text-[7.5px] xs:text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-semibold">Mins</span>
          </div>
          <span class="font-bold text-amber-700 text-xs sm:text-sm shrink-0">:</span>
          <div class="px-1.5 xs:px-2 sm:px-2.5 py-1 sm:py-1.5 bg-stone-900 text-white rounded-lg shadow-xs min-w-[32px] xs:min-w-[38px] sm:min-w-[48px] shrink-0">
            <span class="block text-xs xs:text-sm sm:text-base font-bold font-mono text-amber-400 leading-tight">${String(secs).padStart(2, '0')}</span>
            <span class="text-[7.5px] xs:text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-semibold">Secs</span>
          </div>
        </div>
        ${subline ? `<div class="text-[9px] xs:text-[10px] text-stone-500 font-medium ${textClasses} tracking-tight break-words max-w-full">${subline}</div>` : ''}
      </div>
    `;
  }

  function updateCountdown() {
    const now = new Date();
    const display = document.getElementById('countdownDisplay');
    const title = document.getElementById('countdownTitle');
    const statusBadge = document.getElementById('countdownStatusBadge');
    
    // Call page elements if present
    const callDisplay = document.getElementById('callCountdownDisplay');

    if (!display && !callDisplay) return;

    if (now < MTC_DATE) {
      // Phase 1: Countdown to MTC Entrance (Until Dec 11, 2026)
      const diff = MTC_DATE.getTime() - now.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      const subline = 'MTC Entrance: Dec 11, 2026 • 8:00 AM PST';

      if (display) display.innerHTML = renderCountdownBoxes(days, hours, mins, secs, subline, true);
      if (callDisplay) callDisplay.innerHTML = renderCountdownBoxes(days, hours, mins, secs, subline, false);

      if (title) title.innerText = 'Entering the Missionary Training Center (MTC)';
      if (statusBadge) statusBadge.innerText = 'MTC Entrance Countdown';

    } else if (now < RETURN_DATE) {
      // Phase 2: Turns into the 2-Year Countdown (Dec 11, 2026 to Dec 11, 2028)
      // Counts down to Homecoming & Honorable Release!
      const diff = RETURN_DATE.getTime() - now.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      const elapsedMs = now.getTime() - MTC_DATE.getTime();
      const servedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
      const pct = Math.min(100, Math.max(1, Math.round((servedDays / TOTAL_MISSION_DAYS) * 100)));
      const currentMonth = Math.min(24, Math.floor(servedDays / 30.4) + 1);

      const subline = `2-Year Mission: Day ${servedDays} of 730 (${pct}%) • Month ${currentMonth} of 24`;

      if (display) display.innerHTML = renderCountdownBoxes(days, hours, mins, secs, subline, true);
      if (callDisplay) callDisplay.innerHTML = renderCountdownBoxes(days, hours, mins, secs, subline, false);

      if (title) title.innerText = '2-Year Mission Service Countdown';
      if (statusBadge) statusBadge.innerText = '2-Year Mission Countdown';

    } else {
      // Phase 3: Mission Completed
      if (title) title.innerText = 'Mission Honorably Completed!';
      if (statusBadge) statusBadge.innerText = 'Faithfully Returned';

      const finishedHtml = `
        <div class="px-4 py-2 bg-emerald-100 text-emerald-900 font-semibold text-xs rounded-xl border border-emerald-300 text-center shadow-xs">
          24 Months Completed • Welcome Home Elder Salviejo!
        </div>
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
