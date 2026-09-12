/**
 * Mission Countdown & Journey Milestones
 * Archival Edition - Tuned for Version 2.0 with IBM Plex Mono and Crimson accents
 */

(function () {
  const MTC_DATE = new Date('2026-12-11T08:00:00+08:00'); // Dec 11, 2026, 8:00 AM PST
  const RETURN_DATE = new Date('2028-12-11T08:00:00+08:00'); // Dec 11, 2028, 8:00 AM PST
  const TOTAL_MISSION_DAYS = 730;

  function renderCountdownBoxes(days, hours, mins, secs, subline, alignRight = false) {
    const alignClasses = alignRight ? 'items-center md:items-end' : 'items-center';
    const textClasses = alignRight ? 'text-center md:text-right' : 'text-center';

    return `
      <div class="flex flex-col ${alignClasses} gap-1 sm:gap-1.5 w-full sm:w-auto">
        <div class="flex items-center justify-center gap-1.5 sm:gap-2 text-center flex-nowrap">
          <div class="px-2 sm:px-3 py-1.5 bg-stone-900 text-white rounded-md shadow-xs min-w-[44px] sm:min-w-[50px] shrink-0 border border-stone-800">
            <span class="block text-sm sm:text-base font-semibold font-mono text-white leading-tight">${days}</span>
            <span class="text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-medium">Days</span>
          </div>
          <span class="font-bold text-stone-400 text-xs sm:text-sm shrink-0">:</span>
          <div class="px-2 sm:px-3 py-1.5 bg-stone-900 text-white rounded-md shadow-xs min-w-[40px] sm:min-w-[46px] shrink-0 border border-stone-800">
            <span class="block text-sm sm:text-base font-semibold font-mono text-white leading-tight">${String(hours).padStart(2, '0')}</span>
            <span class="text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-medium">Hours</span>
          </div>
          <span class="font-bold text-stone-400 text-xs sm:text-sm shrink-0">:</span>
          <div class="px-2 sm:px-3 py-1.5 bg-stone-900 text-white rounded-md shadow-xs min-w-[40px] sm:min-w-[46px] shrink-0 border border-stone-800">
            <span class="block text-sm sm:text-base font-semibold font-mono text-white leading-tight">${String(mins).padStart(2, '0')}</span>
            <span class="text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-medium">Mins</span>
          </div>
          <span class="font-bold text-stone-400 text-xs sm:text-sm shrink-0">:</span>
          <div class="px-2 sm:px-3 py-1.5 bg-stone-900 text-white rounded-md shadow-xs min-w-[40px] sm:min-w-[46px] shrink-0 border border-stone-800">
            <span class="block text-sm sm:text-base font-semibold font-mono text-red-400 leading-tight">${String(secs).padStart(2, '0')}</span>
            <span class="text-[8px] sm:text-[9px] uppercase tracking-wider text-stone-400 font-medium">Secs</span>
          </div>
        </div>
        ${subline ? `<div class="text-[10px] text-stone-500 font-mono ${textClasses} tracking-tight break-words max-w-full uppercase">${subline}</div>` : ''}
      </div>
    `;
  }

  function updateCountdown() {
    const now = new Date();
    const display = document.getElementById('countdownDisplay');
    const title = document.getElementById('countdownTitle');
    const statusBadge = document.getElementById('countdownStatusBadge');
    const callDisplay = document.getElementById('callCountdownDisplay');

    if (!display && !callDisplay) return;

    if (now < MTC_DATE) {
      // Pre-MTC
      const diff = MTC_DATE.getTime() - now.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      const html = renderCountdownBoxes(days, hours, mins, secs, 'Report Date • Dec 11, 2026', true);
      if (display) display.innerHTML = html;
      if (callDisplay) callDisplay.innerHTML = renderCountdownBoxes(days, hours, mins, secs, 'Countdown to MTC Entrance');
      if (title) title.textContent = 'Missionary Training Center Entrance';
      if (statusBadge) statusBadge.textContent = 'Upcoming Milestone';
    } else if (now < RETURN_DATE) {
      // Active Mission
      const diff = RETURN_DATE.getTime() - now.getTime();
      const daysLeft = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      const elapsedDays = Math.min(TOTAL_MISSION_DAYS, Math.max(0, TOTAL_MISSION_DAYS - daysLeft));
      const percent = ((elapsedDays / TOTAL_MISSION_DAYS) * 100).toFixed(1);

      const html = renderCountdownBoxes(daysLeft, hours, mins, secs, `${percent}% Completed • ${elapsedDays} of ${TOTAL_MISSION_DAYS} Days Served`, true);
      if (display) display.innerHTML = html;
      if (callDisplay) callDisplay.innerHTML = renderCountdownBoxes(daysLeft, hours, mins, secs, `Service in Progress (${percent}%)`);
      if (title) title.textContent = 'Philippines Dumaguete Mission Service';
      if (statusBadge) statusBadge.textContent = 'Field Service Active';
    } else {
      // Completed
      const completedHtml = `
        <div class="px-4 py-2 bg-stone-900 text-white rounded-md text-xs font-mono uppercase tracking-wider border border-stone-800">
          Honorably Released • Mission Complete
        </div>
      `;
      if (display) display.innerHTML = completedHtml;
      if (callDisplay) callDisplay.innerHTML = completedHtml;
      if (title) title.textContent = 'Honorably Released from Full-Time Service';
      if (statusBadge) statusBadge.textContent = 'Mission Complete';
    }
  }

  setInterval(updateCountdown, 1000);
  document.addEventListener('DOMContentLoaded', updateCountdown);
})();
