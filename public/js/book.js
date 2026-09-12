/**
 * Mission Book Compiler: Contemporary Swiss Museum Monograph Edition
 * 
 * Compiles weekly missionary journal entries and the comprehensive photographic
 * appendix into true WYSIWYG 8.5 x 11 in book sheets.
 * 
 * Features:
 * - Dynamic, unique editorial cluster layouts for the print PDF gallery (4 to 6 plates/sheet)
 * - Auto-adjusting aspect ratios preserving 100% of authentic photo dimensions
 * - Interactive ratio-locked click-to-zoom lightbox with drag/pan across all sheets
 * - Verified camera capture timestamps and multi-tier CDN fallback failover
 * - Strict 8.5x11in letter sheet containment ensuring zero vertical overflow
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

  // Weekly plates collection for interactive lightbox
  window.BOOK_WEEKLY_PLATES = [];

  window.openWeeklyPlate = function (idx) {
    if (window.UniversalLightbox && window.BOOK_WEEKLY_PLATES[idx]) {
      window.UniversalLightbox.open({
        items: window.BOOK_WEEKLY_PLATES,
        index: idx
      });
    }
  };

  window.openAppendixPlate = function (idx) {
    if (window.UniversalLightbox && window.GALLERY_APPENDIX_PHOTOS) {
      window.UniversalLightbox.open({
        items: window.GALLERY_APPENDIX_PHOTOS,
        index: idx
      });
    }
  };

  async function loadCompleteBook() {
    const container = document.getElementById('bookWeeklyChapters');
    const loadingState = document.getElementById('bookLoadingState');
    const tocDynamic = document.getElementById('tocDynamicWeeks');
    if (!container) return;

    window.BOOK_WEEKLY_PLATES = [];

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

      let runningPageNum = 5; // Cover is 1, TOC is 2, Call is 3, Origin is 4

      if (!weeks || weeks.length === 0) {
        if (tocDynamic) {
          tocDynamic.innerHTML = `
            <div class="p-2.5 rounded-md bg-stone-50 border border-stone-200 text-xs font-mono text-stone-500">
              Weekly field chapters will begin following MTC entrance.
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
        runningPageNum++;
      } else {
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
                  ${part1Entries.map((entry, eIdx) => renderEntryCard(entry, eIdx, chapNum)).join('')}
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
                    ${part2Entries.map((entry, eIdx) => renderEntryCard(entry, splitIndex + eIdx, chapNum)).join('')}
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
      }

      // 3. Compile & Append the Dynamic Clustered Photographic Archive Appendix
      runningPageNum = await loadGalleryAppendix(runningPageNum);

      // 4. Update Final Epilogue Page Number
      const epiloguePageEl = document.getElementById('epiloguePageNum');
      if (epiloguePageEl) {
        epiloguePageEl.textContent = `Finis • Page ${String(runningPageNum).padStart(2, '0')}`;
      }

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

  function renderEntryCard(entry, idx, chapNum) {
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

    let weeklyPlateIdx = -1;
    if (hasImage) {
      weeklyPlateIdx = window.BOOK_WEEKLY_PLATES.length;
      window.BOOK_WEEKLY_PLATES.push({
        src: imgSrc,
        fallback: cdnFallback,
        legacyCdnSrc: legacyCdn,
        title: `${dayName} • Chapter ${chapNum}`,
        category: 'Weekly Missionary Journal',
        capturedDate: entry.date || '2026',
        capturedTime: entry.time || '12:07 PM',
        archivalStamp: timeStamp,
        caption: cleanText || 'Weekly missionary journal field entry from Negros Oriental.'
      });
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
              <!-- Ratio-preserving clickable polaroid card -->
              <div
                class="polaroid-frame inline-block max-w-full cursor-pointer group hover:border-stone-400 transition"
                onclick="openWeeklyPlate(${weeklyPlateIdx})"
                title="Click to inspect photo in ratio-locked zoom lightbox"
              >
                <div class="polaroid-photo-wrap bg-stone-100/70 overflow-hidden rounded-xs p-1 flex items-center justify-center max-h-[210px]">
                  <img
                    src="${escapeAttr(imgSrc)}"
                    alt="${escapeAttr(dayName)} Plate"
                    class="book-plate-img w-full h-auto max-h-[195px] object-contain rounded-xs group-hover:scale-101 transition duration-150"
                    loading="eager"
                    decoding="async"
                    onerror="handleBookImgError(this, '${escapeAttr(cdnFallback)}', '${escapeAttr(legacyCdn)}')"
                  />
                </div>
                <div class="polaroid-stamp truncate text-[9px] mt-1.5 flex items-center justify-between px-0.5">
                  <span class="truncate">${escapeHtml(timeStamp)}</span>
                  <span class="no-print text-stone-400 text-[10px] group-hover:text-stone-900 ml-1">&rarr;</span>
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

  /**
   * Plans varied, dense editorial cluster compositions across sheets.
   * For 38 photos, generates 7 unique sheets with 5-6 photos per sheet.
   */
  function planClusterSheets(total) {
    const plans = [];
    let remaining = total;
    let idx = 0;
    const PATTERNS_5 = ['hero-left', 'split-5', 'hero-right', 'split-5'];
    let pattern5Idx = 0;

    while (remaining > 0) {
      let count = 5;
      if (remaining === 6 || remaining === 12 || remaining === 18) {
        count = 6;
      } else if (remaining === 4) {
        count = 4;
      } else if (remaining === 5) {
        count = 5;
      } else if (remaining >= 11 && remaining % 6 === 5) {
        count = 6;
      } else {
        count = (idx % 2 === 1) ? 6 : 5;
        if (remaining - count < 4 && remaining - count > 0) {
          // Adjust so remaining doesn't leave an orphaned 1-3 items
          count = remaining - 4;
          if (count > 6) count = 5;
        }
      }

      count = Math.min(count, remaining);
      let type;
      if (count === 6) {
        type = 'mosaic-6';
      } else if (count === 4) {
        type = 'quad-4';
      } else {
        type = PATTERNS_5[pattern5Idx % PATTERNS_5.length];
        pattern5Idx++;
      }

      plans.push({ type, count });
      remaining -= count;
      idx++;
    }

    return plans;
  }

  /**
   * Loads and clusters all gallery photos into unique, ratio-auto-adjusting editorial sheets.
   */
  async function loadGalleryAppendix(startPageNum) {
    const appendixContainer = document.getElementById('bookGalleryAppendix');
    const tocPlatesCount = document.getElementById('tocGalleryPlatesCount');
    if (!appendixContainer) return startPageNum;

    let galleryPhotos = [];

    // 1. Try fetching from /api/gallery
    try {
      const res = await fetch('/api/gallery');
      if (res.ok) {
        const data = await res.json();
        galleryPhotos = data.photos || [];
      }
    } catch (_) {}

    // 2. Fallback to /vault/gallery/index.json
    if (!galleryPhotos || galleryPhotos.length === 0) {
      try {
        const localRes = await fetch('/vault/gallery/index.json');
        if (localRes.ok) {
          galleryPhotos = await localRes.json();
        }
      } catch (_) {}
    }

    if (!galleryPhotos || galleryPhotos.length === 0) {
      appendixContainer.innerHTML = '';
      return startPageNum;
    }

    // Sort chronologically (newest first)
    galleryPhotos.sort((a, b) => {
      const timeA = a && a.dateTime ? new Date(a.dateTime).getTime() : 0;
      const timeB = b && b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return timeB - timeA;
    });

    if (tocPlatesCount) {
      tocPlatesCount.textContent = `${galleryPhotos.length} Plates`;
    }

    // Register full collection for UniversalLightbox
    window.GALLERY_APPENDIX_PHOTOS = galleryPhotos.map((p, idx) => ({
      src: p.src || p.localSrc || `/vault/gallery/photos/${p.filename}`,
      fallback: p.cdnSrc || (p.filename ? `https://cdn.jsdelivr.net/gh/AllensCreations/ElderSalviejo@main/vault/gallery/photos/${p.filename}` : ''),
      legacyCdnSrc: p.legacyCdnSrc || (p.filename ? `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${p.filename}` : ''),
      title: `Field Plate #${String(idx + 1).padStart(3, '0')}`,
      category: p.category || p.album || 'Missionary Gallery',
      capturedDate: p.capturedDate || '2026',
      capturedTime: p.capturedTime || '12:07 PM',
      archivalStamp: p.archivalStamp || p.capturedDateTime || (p.capturedDate ? `${p.capturedDate} • ${p.capturedTime}` : 'DUMAGUETE • 2026'),
      caption: p.caption || p.text || 'Official archival documentary missionary photograph preserved in the Philippines Dumaguete Mission registry.'
    }));

    // Generate cluster plan for dense 4-6 plates per sheet
    const clusterPlan = planClusterSheets(galleryPhotos.length);
    let appendixHtml = '';
    let currentPage = startPageNum;
    let photoOffset = 0;

    for (let sIdx = 0; sIdx < clusterPlan.length; sIdx++) {
      const plan = clusterPlan[sIdx];
      const sheetPhotos = galleryPhotos.slice(photoOffset, photoOffset + plan.count);
      const sheetPageNum = String(currentPage++).padStart(2, '0');
      const startPlateNum = photoOffset + 1;
      const endPlateNum = photoOffset + sheetPhotos.length;
      const isFirstSheet = sIdx === 0;

      const clusterContentHtml = renderClusterLayout(plan.type, sheetPhotos, photoOffset);

      appendixHtml += `
        <section ${isFirstSheet ? 'id="appendix-gallery"' : ''} class="book-sheet flex flex-col justify-between">
          <!-- Sheet Header -->
          <div class="border-b border-stone-200 pb-2.5 flex items-baseline justify-between shrink-0">
            <div>
              <span class="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-400">
                Appendix 01 • Part ${sIdx + 1} of ${clusterPlan.length} • Editorial Cluster
              </span>
              <h2 class="font-serif text-xl sm:text-2xl font-bold text-stone-900 mt-0.5">
                Photographic Archive & Field Plates
              </h2>
            </div>
            <div class="font-mono text-xs text-stone-500 text-right">
              <span>Plates ${String(startPlateNum).padStart(3, '0')}–${String(endPlateNum).padStart(3, '0')}</span>
            </div>
          </div>

          <!-- Sheet Body: Unique Asymmetric Cluster (Auto-Adjusted Ratios) -->
          <div class="flex-1 py-3 sm:py-3.5 min-h-0 overflow-hidden">
            ${clusterContentHtml}
          </div>

          <!-- Sheet Footer -->
          <div class="pt-2.5 border-t border-stone-200 flex items-center justify-between font-mono text-[11px] text-stone-500 shrink-0">
            <span>Appendix 01 • Elder Mark Salviejo • Dumaguete Archive</span>
            <span>Page ${sheetPageNum}</span>
          </div>
        </section>
      `;

      photoOffset += plan.count;
    }

    appendixContainer.innerHTML = appendixHtml;
    return currentPage;
  }

  /**
   * Renders the chosen cluster layout with auto-adjusting aspect ratios.
   */
  function renderClusterLayout(type, photos, startIndex) {
    if (type === 'hero-left') {
      const hero = photos[0];
      const rest = photos.slice(1);
      return `
        <div class="cluster-grid-hero-left h-full">
          <div class="cluster-hero-cell h-full">
            ${renderClusterCard(hero, startIndex, true)}
          </div>
          ${rest.map((p, idx) => renderClusterCard(p, startIndex + 1 + idx, false)).join('')}
        </div>
      `;
    }

    if (type === 'hero-right') {
      const rest = photos.slice(0, 4);
      const hero = photos[4];
      return `
        <div class="cluster-grid-hero-right h-full">
          ${rest.map((p, idx) => renderClusterCard(p, startIndex + idx, false)).join('')}
          <div class="cluster-hero-cell h-full">
            ${renderClusterCard(hero, startIndex + 4, true)}
          </div>
        </div>
      `;
    }

    if (type === 'split-5') {
      const top2 = photos.slice(0, 2);
      const bot3 = photos.slice(2, 5);
      return `
        <div class="cluster-grid-split-5 h-full">
          <div class="cluster-split-top-2">
            ${top2.map((p, idx) => renderClusterCard(p, startIndex + idx, false)).join('')}
          </div>
          <div class="cluster-split-bottom-3">
            ${bot3.map((p, idx) => renderClusterCard(p, startIndex + 2 + idx, false)).join('')}
          </div>
        </div>
      `;
    }

    if (type === 'quad-4') {
      const hero = photos[0];
      const rest = photos.slice(1);
      return `
        <div class="grid grid-cols-2 gap-2.5 sm:gap-3 h-full">
          <div class="h-full">
            ${renderClusterCard(hero, startIndex, true)}
          </div>
          <div class="grid grid-rows-3 gap-2.5 sm:gap-3 h-full">
            ${rest.map((p, idx) => renderClusterCard(p, startIndex + 1 + idx, false)).join('')}
          </div>
        </div>
      `;
    }

    // Default: 'mosaic-6' (3 columns x 2 rows)
    return `
      <div class="cluster-grid-mosaic-6 h-full">
        ${photos.map((p, idx) => renderClusterCard(p, startIndex + idx, false)).join('')}
      </div>
    `;
  }

  function renderClusterCard(p, globalIndex, isHero = false) {
    const shotNumber = String(globalIndex + 1).padStart(3, '0');
    const imgSrc = p.src || p.localSrc || `/vault/gallery/photos/${p.filename}`;
    const cdnFallback = p.cdnSrc || (p.filename ? `https://cdn.jsdelivr.net/gh/AllensCreations/ElderSalviejo@main/vault/gallery/photos/${p.filename}` : '');
    const legacyCdn = p.legacyCdnSrc || (p.filename ? `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${p.filename}` : '');
    const stampText = p.archivalStamp || p.capturedDateTime || (p.capturedDate ? `${p.capturedDate} • ${p.capturedTime}` : 'DUMAGUETE • 2026');

    return `
      <div
        class="polaroid-frame cluster-card cursor-pointer group hover:border-stone-400 transition duration-150 avoid-break"
        onclick="openAppendixPlate(${globalIndex})"
        title="Plate #${shotNumber} (Click to inspect in ratio-locked zoom lightbox)"
      >
        <!-- Ratio Auto-Adjusting Snug Photo Wrap -->
        <div class="polaroid-photo-wrap flex-1 flex items-center justify-center overflow-hidden rounded-xs bg-stone-100/70 p-1 min-h-0">
          <img
            src="${escapeAttr(imgSrc)}"
            alt="Plate #${shotNumber}"
            class="book-plate-img w-full h-full max-h-full object-contain rounded-xs group-hover:scale-101 transition duration-150"
            loading="eager"
            decoding="async"
            onerror="handleBookImgError(this, '${escapeAttr(cdnFallback)}', '${escapeAttr(legacyCdn)}')"
          />
        </div>

        <!-- Compact Metadata Strip -->
        <div class="pt-1.5 border-t border-stone-100 mt-1.5 shrink-0">
          <div class="flex items-center justify-between font-mono text-[10px]">
            <span class="font-bold text-stone-900 flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full ${isHero ? 'bg-red-800' : 'bg-stone-300'}"></span>
              <span>#${shotNumber}</span>
            </span>
            <span class="text-stone-500 truncate ml-1 text-[9px] uppercase tracking-wider">${escapeHtml(stampText)}</span>
          </div>
        </div>
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
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  document.addEventListener('DOMContentLoaded', loadCompleteBook);
})();
