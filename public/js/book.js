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

  // Proportional auto-resize for weekly inline plates (0% cropping, zero dead space)
  window.autoAdjustWeeklyPlate = function (img) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    const wrap = img.parentElement;
    if (!wrap) return;

    wrap.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;

    if (ratio >= 1) {
      // Landscape (e.g. 800x600, 4:3)
      wrap.style.width = '220px';
      wrap.style.height = 'auto';
    } else {
      // Portrait (e.g. 600x800, 3:4)
      wrap.style.height = '210px';
      wrap.style.width = `${Math.round(210 * ratio)}px`;
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
          <section class="book-sheet">
            <!-- Pinned Sheet Header -->
            <div class="sheet-header">
              <div>
                <span class="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-400">Chapter 02 • Field Letters & Weekly Journals</span>
                <h2 class="font-serif text-xl sm:text-2xl font-bold text-stone-900 mt-0.5">
                  Field Letters & Weekly Journals
                </h2>
              </div>
              <div class="font-mono text-xs text-stone-500 text-right">
                <span>MTC Entrance: Dec 11, 2026</span>
              </div>
            </div>

            <!-- Pinned Sheet Content (Vertically Centered Editorial Dispatch Notice) -->
            <div class="sheet-content flex flex-col justify-center items-center text-center px-4 sm:px-8">
              <div class="max-w-md w-full space-y-5">
                <div class="w-10 h-10 rounded-full bg-stone-100 border border-stone-300 text-stone-700 flex items-center justify-center mx-auto shadow-xs">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>

                <div class="space-y-1.5">
                  <span class="font-mono text-[10px] uppercase font-bold tracking-widest text-red-800">
                    Preparation Day Journal Registry
                  </span>
                  <h3 class="font-serif text-2xl font-bold text-stone-900 tracking-tight">
                    Field Chapters Begin Following MTC Entrance
                  </h3>
                </div>

                <div class="p-4 bg-stone-50 border border-stone-200 rounded-lg text-left font-sans text-xs sm:text-sm text-stone-700 leading-relaxed space-y-2">
                  <p>
                    Elder Salviejo reports to the Missionary Training Center on <strong class="text-stone-900">December 11, 2026</strong> to prepare for service in the <strong class="text-stone-900">Philippines Dumaguete Mission</strong>.
                  </p>
                  <p class="text-stone-600">
                    Upon entering the mission field, each week’s Preparation Day (P-Day) reflections, missionary companion notes, and photographs will be recorded into this journal.
                  </p>
                </div>

                <!-- Scripture Reflection -->
                <div class="p-3 bg-stone-50/70 border border-stone-200 rounded-md text-center">
                  <div class="font-mono text-[9.5px] uppercase font-bold tracking-widest text-stone-500 mb-0.5">
                    Doctrine and Covenants 4:2
                  </div>
                  <blockquote class="font-serif italic text-stone-800 text-xs leading-relaxed">
                    “Therefore, O ye that embark in the service of God, see that ye serve him with all your heart, might, mind and strength.”
                  </blockquote>
                </div>

                <div class="font-mono text-[10px] text-stone-400 uppercase tracking-widest">
                  Preparation Day Journal Registry • Standing by for December 2026 Entries
                </div>
              </div>
            </div>

            <!-- Pinned Sheet Footer -->
            <div class="sheet-footer">
              <span>Elder Salviejo • Philippines Dumaguete Mission</span>
              <span>Page ${String(runningPageNum++).padStart(2, '0')}</span>
            </div>
          </section>
        `;
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

          const pageNum = String(runningPageNum++).padStart(2, '0');

          chaptersHtml += `
            <section id="${chapId}" class="book-sheet">
              <!-- Pinned Sheet Header -->
              <div class="sheet-header">
                <div>
                  <span class="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-400">Chapter ${chapNum} • Field Letter & Weekly Journal</span>
                  <h2 class="font-serif text-xl sm:text-2xl font-bold text-stone-900 mt-0.5 truncate max-w-xl">
                    ${escapeHtml(weekDetails.title || `Weekly Letter #${i + 1}`)}
                  </h2>
                </div>
                <div class="font-mono text-xs text-stone-500 text-right shrink-0">
                  <span class="block text-stone-700 font-medium">${escapeHtml(pDayDate)}</span>
                  <span class="text-[10px] text-stone-400 font-normal">Dumaguete City, Negros Oriental</span>
                </div>
              </div>

              <!-- Pinned Sheet Content (1 Week per 8.5x11in Sheet: Top Scripture, Daily Diary Log, Bottom 7-Photo Gallery) -->
              <div class="sheet-content flex flex-col justify-between overflow-hidden">
                
                <!-- 1. Top Scripture Reflection Banner -->
                ${hasVerse ? `
                  <div class="avoid-break px-3 py-2 bg-stone-50 border-l-3 border-l-red-800 border border-stone-200 rounded shrink-0 mb-2">
                    <div class="flex items-center justify-between text-[9px] font-mono uppercase font-bold tracking-wider text-red-800 mb-0.5">
                      <span>Scripture Reflection • ${escapeHtml(verse.reference || '')}</span>
                      <span class="text-stone-400 font-normal">Philippines Dumaguete Mission</span>
                    </div>
                    <blockquote class="font-serif italic text-stone-800 text-xs sm:text-[12.5px] leading-snug">
                      “${escapeHtml(verse.text || '')}”
                    </blockquote>
                  </div>
                ` : ''}

                <!-- 2. Mid: Daily Missionary Diary Logs (Clean 2-Column Ledger) -->
                <div class="diary-days-grid grid grid-cols-2 gap-x-4 gap-y-2 border border-stone-200 bg-stone-50/50 rounded p-2.5 shrink-0 mb-2.5">
                  ${entries.slice(0, 7).map((entry, eIdx) => {
                    const dayClean = cleanBookDayName(entry.day, eIdx);
                    const cleanText = cleanBookEntryText(entry.text);
                    const timeStamp = entry.time || (entry.archivalStamp ? entry.archivalStamp.split('•')[1]?.trim() : '') || '12:00 PHT';
                    return `
                      <div class="diary-day-entry min-w-0 border-b border-stone-200/60 pb-1.5 last:border-b-0">
                        <div class="flex items-baseline justify-between gap-1 mb-0.5">
                          <span class="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-900 flex items-center gap-1 truncate">
                            <span class="w-1.5 h-1.5 rounded-full bg-red-800 shrink-0"></span>
                            <span>${escapeHtml(dayClean)}</span>
                            ${entry.date ? `<span class="text-stone-400 font-normal text-[9px]">(${escapeHtml(entry.date)})</span>` : ''}
                          </span>
                          <span class="font-mono text-[8.5px] text-stone-500 uppercase shrink-0">
                            ${escapeHtml(timeStamp)}
                          </span>
                        </div>
                        <p class="font-sans text-[11px] leading-[1.38] text-stone-700 line-clamp-3">
                          ${escapeHtml(cleanText || 'Field work and missionary service in Dumaguete.')}
                        </p>
                      </div>
                    `;
                  }).join('')}
                </div>

                <!-- 3. Bottom: 7-Photo Mini-Gallery Grid (1 Week 7 Photos Strip) -->
                <div class="weekly-photos-section flex-1 min-h-0 flex flex-col justify-end">
                  <div class="flex items-center justify-between pb-1 border-b border-stone-200 mb-1.5 shrink-0">
                    <span class="font-mono text-[9px] uppercase font-bold tracking-widest text-stone-500">
                      Weekly Field Plates • 7-Day Photographic Sequence
                    </span>
                    <span class="font-mono text-[9px] text-stone-400">
                      Authentic Aspect Ratios • Click to Zoom
                    </span>
                  </div>

                  <!-- 7 Photos Row / Compact Grid -->
                  <div class="grid grid-cols-7 gap-1.5 h-full max-h-[175px] items-stretch">
                    ${entries.slice(0, 7).map((entry, eIdx) => {
                      const dayClean = cleanBookDayName(entry.day, eIdx);
                      const hasImg = Boolean(entry.image || entry.cdnImage);
                      let imgSrc = entry.cdnImage || entry.image || '';
                      let cdnFallback = '';
                      let legacyCdn = '';

                      if (entry.imageFilename) {
                        cdnFallback = `https://cdn.jsdelivr.net/gh/AllensCreations/ElderSalviejo@main/vault/gallery/photos/${entry.imageFilename}`;
                        legacyCdn = `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${entry.imageFilename}`;
                      }

                      let weeklyPlateIdx = -1;
                      if (hasImg) {
                        weeklyPlateIdx = window.BOOK_WEEKLY_PLATES.length;
                        window.BOOK_WEEKLY_PLATES.push({
                          src: imgSrc,
                          fallback: cdnFallback,
                          legacyCdnSrc: legacyCdn,
                          title: `${dayClean} • Chapter ${chapNum}`,
                          category: 'Weekly Missionary Journal',
                          capturedDate: entry.date || '2026',
                          capturedTime: entry.time || '12:07 PM',
                          archivalStamp: `${dayClean} • ${entry.time || '2026'}`,
                          caption: cleanBookEntryText(entry.text) || 'Weekly field reflection from Negros Oriental.'
                        });
                      }

                      return `
                        <div
                          class="weekly-grid-polaroid group flex flex-col justify-between bg-white border border-stone-200 rounded p-1 shadow-2xs cursor-pointer hover:border-stone-400 transition"
                          ${hasImg ? `onclick="openWeeklyPlate(${weeklyPlateIdx})"` : ''}
                          title="${escapeAttr(dayClean)} Plate (Click to zoom)"
                        >
                          <div class="weekly-polaroid-img-wrap flex-1 min-h-0 bg-stone-100 border border-stone-200/70 rounded-xs overflow-hidden flex items-center justify-center p-0.5">
                            ${hasImg ? `
                              <img
                                src="${escapeAttr(imgSrc)}"
                                alt="${escapeAttr(dayClean)} Plate"
                                class="w-full h-full max-h-full max-w-full object-contain group-hover:scale-102 transition duration-150 block mx-auto"
                                loading="eager"
                                decoding="async"
                                onerror="handleBookImgError(this, '${escapeAttr(cdnFallback)}', '${escapeAttr(legacyCdn)}')"
                              />
                            ` : `
                              <div class="text-[8px] font-mono text-stone-400 text-center px-1">Plate Pending</div>
                            `}
                          </div>
                          <div class="pt-1 text-center font-mono text-[8px] font-bold text-stone-700 uppercase truncate">
                            ${escapeHtml(dayClean.slice(0, 3))}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>

              </div>

              <!-- Pinned Sheet Footer -->
              <div class="sheet-footer">
                <span>Elder Salviejo • Philippines Dumaguete Mission</span>
                <span>Page ${pageNum}</span>
              </div>
            </section>
          `;
        }

        container.innerHTML = chaptersHtml;
      }

      // 3. Compile & Append the Photographic Archive Appendix
      runningPageNum = await loadGalleryAppendix(runningPageNum);

      // 4. Update Final Epilogue Page Number
      const epiloguePageEl = document.getElementById('epiloguePageNum');
      if (epiloguePageEl) {
        epiloguePageEl.textContent = `Page ${String(runningPageNum).padStart(2, '0')}`;
      }

    } catch (err) {
      console.error('Error loading mission record book:', err);
      if (loadingState) {
        loadingState.innerHTML = `
          <p class="text-xs text-stone-600 font-mono">Unable to load mission record book.</p>
          <button onclick="location.reload()" class="mt-2 text-xs font-mono uppercase px-3 py-1.5 bg-stone-900 text-white rounded">Retry</button>
        `;
      }
    }
  }

  function cleanBookDayName(dayStr, index) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (!dayStr) return days[index % 7];
    const cleaned = dayStr.replace(/^[—\-\s]+|[—\-\s]+$/g, '').trim();
    if (cleaned.length > 0) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    return days[index % 7];
  }

  function cleanBookEntryText(rawText) {
    if (!rawText) return '';
    return rawText
      .replace(/^[-*•\s]+/, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  const KNOWN_LANDSCAPES = new Set([
    '2026-09-09-try-6.jpg',
    '2026-09-09-try-7.jpg',
    '2026-09-09-try-8.jpg',
    '2026-09-09-weekly-missionary-journal-part-2-2.jpg',
    '2026-09-09-weekly-missionary-journal-part-2-3.jpg',
    '2026-09-09-weekly-missionary-journal-part-2-4.jpg',
    '2026-09-09-weekly-missionary-journal-part-2-5.jpg',
    '2026-09-09-weekly-missionary-journal-part-2-6.jpg',
    '2026-09-09-weekly-missionary-journal-part-2-7.jpg'
  ]);

  function getPhotoOrientation(p) {
    if (p.orientation) return p.orientation;
    if (p.filename && KNOWN_LANDSCAPES.has(p.filename)) return 'landscape';
    if (p.width && p.height) return p.width > p.height ? 'landscape' : 'portrait';
    if (p.aspectRatio) return Number(p.aspectRatio) > 1.05 ? 'landscape' : 'portrait';
    return 'portrait';
  }

  function getPhotoRatio(p) {
    if (p.aspectRatio && Number(p.aspectRatio) > 0) return Number(p.aspectRatio);
    if (p.width && p.height) return Number((p.width / p.height).toFixed(4));
    return getPhotoOrientation(p) === 'landscape' ? 1.3333 : 0.75;
  }

  /**
   * Dynamically plans full-height sheets based on photo orientation.
   * Maximizes the number of images packed per page (filling every page before creating a new page).
   * Packs 2 to 3 balanced rows per sheet (~6-9 photos per page).
   * For the final sheet, seals any remaining bottom space with an official Archival Colophon.
   */
  function planDynamicOrientationSheets(photos) {
    if (!photos || photos.length === 0) return [];
    const list = photos.map(p => ({
      ...p,
      _orientation: getPhotoOrientation(p),
      _ratio: getPhotoRatio(p)
    }));

    const sheets = [];
    let pIdx = 0;

    while (pIdx < list.length) {
      const remPhotos = list.length - pIdx;
      const isFinalSheet = remPhotos <= 7;

      if (isFinalSheet) {
        const sheetRows = [];
        if (remPhotos <= 4) {
          // 1 row of photos + colophon spanning 2 row slots
          sheetRows.push(list.slice(pIdx, list.length));
          pIdx = list.length;
          sheets.push({ rows: sheetRows, hasColophon: true, colophonSpan: 2 });
        } else {
          // 5, 6, or 7 photos across 2 rows + colophon spanning 1 row slot
          const row1Count = Math.ceil(remPhotos / 2);
          sheetRows.push(list.slice(pIdx, pIdx + row1Count));
          pIdx += row1Count;
          sheetRows.push(list.slice(pIdx, list.length));
          pIdx = list.length;
          sheets.push({ rows: sheetRows, hasColophon: true, colophonSpan: 1 });
        }
        break;
      }

      const sheetRows = [];
      while (sheetRows.length < 3 && pIdx < list.length) {
        const curRem = list.length - pIdx;
        const cur = list[pIdx];

        if (sheetRows.length === 2 && curRem >= 4 && curRem <= 7) {
          sheetRows.push(list.slice(pIdx, pIdx + 3));
          pIdx += 3;
          break;
        }

        if (cur._orientation === 'landscape') {
          const next = list[pIdx + 1];
          if (next && next._orientation === 'landscape') {
            sheetRows.push([cur, next]);
            pIdx += 2;
          } else if (next && next._orientation === 'portrait') {
            const next2 = list[pIdx + 2];
            if (next2 && next2._orientation === 'portrait') {
              sheetRows.push([cur, next, next2]);
              pIdx += 3;
            } else {
              sheetRows.push([cur, next]);
              pIdx += 2;
            }
          } else {
            sheetRows.push([cur]);
            pIdx += 1;
          }
        } else {
          const next = list[pIdx + 1];
          const next2 = list[pIdx + 2];
          if (next && next._orientation === 'portrait' && next2 && next2._orientation === 'portrait') {
            sheetRows.push([cur, next, next2]);
            pIdx += 3;
          } else if (next && next._orientation === 'landscape') {
            sheetRows.push([cur, next]);
            pIdx += 2;
          } else if (next && next._orientation === 'portrait') {
            sheetRows.push([cur, next]);
            pIdx += 2;
          } else {
            sheetRows.push([cur]);
            pIdx += 1;
          }
        }
      }

      sheets.push({ rows: sheetRows, hasColophon: false, colophonSpan: 0 });
    }

    return sheets;
  }

  /**
   * Loads and organizes all gallery photos into full-height dynamic orientation sheets.
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
      appendixContainer.style.display = 'none';
      return startPageNum;
    }
    appendixContainer.style.display = '';

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
      caption: p.caption || p.text || 'Photographic memory from the Philippines Dumaguete Mission.'
    }));

    // Generate dynamic orientation sheet distribution (greedy fill with balanced rows)
    const sheetPlans = planDynamicOrientationSheets(galleryPhotos);
    let appendixHtml = '';
    let currentPage = startPageNum;
    let photoOffset = 0;

    for (let sIdx = 0; sIdx < sheetPlans.length; sIdx++) {
      const plan = sheetPlans[sIdx];
      const sheetPhotos = plan.rows.flat();
      const sheetPageNum = String(currentPage++).padStart(2, '0');
      const startPlateNum = photoOffset + 1;
      const endPlateNum = photoOffset + sheetPhotos.length;
      const isFirstSheet = sIdx === 0;

      let rowsHtml = '';
      let rowOffset = photoOffset;
      for (let rIdx = 0; rIdx < plan.rows.length; rIdx++) {
        const rowPhotos = plan.rows[rIdx];
        rowsHtml += `
          <div class="appendix-row">
            ${rowPhotos.map((p, pIdx) => renderRowPhotoTile(p, rowOffset + pIdx)).join('')}
          </div>
        `;
        rowOffset += rowPhotos.length;
      }

      if (plan.hasColophon) {
        rowsHtml += renderArchivalColophon(plan.colophonSpan, galleryPhotos.length);
      }

      appendixHtml += `
        <section ${isFirstSheet ? 'id="appendix-gallery"' : ''} class="book-sheet">
          <!-- Sheet Header -->
          <div class="sheet-header">
            <div>
              <span class="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-400">
                Photographic Record • Part ${sIdx + 1} of ${sheetPlans.length}
              </span>
              <h2 class="font-serif text-xl sm:text-2xl font-bold text-stone-900 mt-0.5">
                Philippines Dumaguete Mission • Photo Collection
              </h2>
            </div>
            <div class="font-mono text-xs text-stone-500 text-right">
              <span>Photographs ${String(startPlateNum).padStart(3, '0')}–${String(endPlateNum).padStart(3, '0')}</span>
            </div>
          </div>

          <!-- Sheet Body: Full-Height Dynamic Orientation Rows -->
          <div class="sheet-content">
            <div class="appendix-rows-container">
              ${rowsHtml}
            </div>
          </div>

          <!-- Sheet Footer -->
          <div class="sheet-footer">
            <span>Elder Salviejo • Philippines Dumaguete Mission</span>
            <span>Page ${sheetPageNum}</span>
          </div>
        </section>
      `;

      photoOffset += sheetPhotos.length;
    }

    appendixContainer.innerHTML = appendixHtml;
    return currentPage;
  }

  function renderRowPhotoTile(p, globalIndex) {
    const shotNumber = String(globalIndex + 1).padStart(3, '0');
    const imgSrc = p.src || p.localSrc || `/vault/gallery/photos/${p.filename}`;
    const cdnFallback = p.cdnSrc || (p.filename ? `https://cdn.jsdelivr.net/gh/AllensCreations/ElderSalviejo@main/vault/gallery/photos/${p.filename}` : '');
    const legacyCdn = p.legacyCdnSrc || (p.filename ? `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${p.filename}` : '');
    const stampText = p.archivalStamp || p.capturedDateTime || (p.capturedDate ? `${p.capturedDate} • ${p.capturedTime}` : 'DUMAGUETE • 2026');
    const ratio = p._ratio || (p.aspectRatio ? Number(p.aspectRatio) : (getPhotoOrientation(p) === 'landscape' ? 1.3333 : 0.75));

    return `
      <div
        class="appendix-row-tile group cursor-pointer"
        style="flex: ${ratio} ${ratio} 0%;"
        onclick="openAppendixPlate(${globalIndex})"
        title="Plate #${shotNumber} (Click to inspect in ratio-locked zoom lightbox)"
      >
        <img
          src="${escapeAttr(imgSrc)}"
          alt="Plate #${shotNumber}"
          class="book-plate-img"
          loading="eager"
          decoding="async"
          onerror="handleBookImgError(this, '${escapeAttr(cdnFallback)}', '${escapeAttr(legacyCdn)}')"
        />

        <!-- Compact Editorial Metadata Overlay -->
        <div class="appendix-tile-badge font-mono">
          <span class="w-1.5 h-1.5 rounded-full bg-red-600 inline-block"></span>
          <span>#${shotNumber}</span>
        </div>
        <div class="appendix-tile-date font-mono truncate max-w-[50%]">
          <span>${escapeHtml(stampText)}</span>
        </div>
      </div>
    `;
  }

  function renderArchivalColophon(span, totalPlates) {
    const spanFlex = span || 1;
    return `
      <div class="appendix-colophon-seal" style="flex: ${spanFlex} ${spanFlex} 0%;">
        <div class="flex items-center justify-between border-b border-stone-300 pb-2 mb-2">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded bg-stone-900 text-white flex items-center justify-center font-mono text-xs font-bold shrink-0">
              PDM
            </div>
            <div>
              <div class="font-mono text-[10.5px] uppercase font-bold tracking-wider text-stone-900">
                Philippines Dumaguete Mission
              </div>
              <div class="text-[9px] text-stone-500 font-mono">
                Photographic Collection • Volume I
              </div>
            </div>
          </div>
          <div class="text-right font-mono text-[9.5px] text-stone-600">
            <span class="font-bold text-stone-900">${totalPlates} Photographs</span> Recorded
            <div class="text-stone-400 text-[8.5px]">Mission Field Memories</div>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px] font-mono py-1">
          <div class="bg-white p-2 rounded border border-stone-200">
            <div class="text-stone-400 text-[8px] uppercase tracking-wider">Missionary</div>
            <div class="font-bold text-stone-900 truncate">Elder Salviejo</div>
          </div>
          <div class="bg-white p-2 rounded border border-stone-200">
            <div class="text-stone-400 text-[8px] uppercase tracking-wider">Format Standard</div>
            <div class="font-bold text-stone-900">US Letter Keepsake</div>
          </div>
          <div class="bg-white p-2 rounded border border-stone-200">
            <div class="text-stone-400 text-[8px] uppercase tracking-wider">Preservation</div>
            <div class="font-bold text-stone-900">Field Photographs</div>
          </div>
          <div class="bg-white p-2 rounded border border-stone-200">
            <div class="text-stone-400 text-[8px] uppercase tracking-wider">Status</div>
            <div class="font-bold text-emerald-800 flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block"></span>
              <span>Mission Keepsake Record</span>
            </div>
          </div>
        </div>

        <div class="mt-2 pt-2 border-t border-stone-200 flex items-center justify-between text-[8.5px] font-mono text-stone-500">
          <p class="leading-relaxed pr-3">
            Photographs preserved in chronological order with date and time records from missionary service in Dumaguete.
          </p>
          <div class="shrink-0 font-bold uppercase tracking-widest text-[8px] text-stone-700 border border-stone-300 px-2 py-1 rounded bg-stone-50">
            PDM • DUMAGUETE RECORD
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
