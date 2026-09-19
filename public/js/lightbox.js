/**
 * Universal Archival Lightbox & Ratio-Preserving Zoom Controller
 * Version 2.0 • Philippines Dumaguete Mission Monograph Standard
 * 
 * Features:
 * - 100% authentic aspect ratio preservation across all zoom levels
 * - Fluid click/tap-to-zoom toggle (1x <-> 2x)
 * - Click-coordinate centered zooming
 * - Drag-to-pan / Touch-drag with bounded canvas safety
 * - High-precision zoom controls (+, -, 100% reset)
 * - Keyboard shortcuts (Esc, Left, Right, +, -, 0)
 * - Touch swipe pagination when unzoomed
 * - Fallback CDN failover for zero broken images
 */

(function () {
  let activeItems = [];
  let currentIndex = 0;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startPointerX = 0;
  let startPointerY = 0;
  let startPanX = 0;
  let startPanY = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let showDateStamp = localStorage.getItem('galleryDateStamp') !== 'false';

  const MIN_SCALE = 1;
  const MAX_SCALE = 3.5;
  const ZOOM_STEP = 0.5;

  function createOrGetModal() {
    let modal = document.getElementById('universalLightboxModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'universalLightboxModal';
    modal.className = 'fixed inset-0 z-50 bg-stone-950/95 backdrop-blur-md hidden opacity-0 transition-opacity duration-200 flex flex-col justify-between p-3 sm:p-6 no-print';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <!-- Top Action Bar -->
      <div class="flex items-center justify-between text-stone-300 text-xs font-mono w-full max-w-5xl mx-auto shrink-0 pb-3 border-b border-stone-800">
        <div class="flex items-center gap-2 sm:gap-3 min-w-0">
          <span class="text-stone-400 shrink-0">
            PLATE <span id="ulightboxIndex" class="text-white font-bold">1</span> OF <span id="ulightboxTotal" class="text-stone-200">1</span>
          </span>
          <span id="ulightboxCatBadge" class="hidden xs:inline-block px-2 py-0.5 rounded bg-stone-800 text-stone-300 text-[10px] uppercase font-semibold truncate"></span>
        </div>

        <!-- Center / Right Controls Toolbar -->
        <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <!-- Zoom Controls -->
          <div class="inline-flex items-center bg-stone-900 border border-stone-800 rounded p-0.5">
            <button
              id="ulightboxZoomOutBtn"
              onclick="window.UniversalLightbox.zoomOut()"
              class="w-7 h-7 flex items-center justify-center text-stone-300 hover:text-white hover:bg-stone-800 rounded transition cursor-pointer"
              title="Zoom Out (-)"
              aria-label="Zoom Out"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
            </button>
            <button
              id="ulightboxZoomResetBtn"
              onclick="window.UniversalLightbox.resetZoom()"
              class="px-2 h-7 flex items-center justify-center text-[11px] text-stone-300 hover:text-white hover:bg-stone-800 rounded transition font-mono cursor-pointer"
              title="Reset Zoom (100%)"
              aria-label="Reset Zoom"
            >
              <span id="ulightboxZoomText">100%</span>
            </button>
            <button
              id="ulightboxZoomInBtn"
              onclick="window.UniversalLightbox.zoomIn()"
              class="w-7 h-7 flex items-center justify-center text-stone-300 hover:text-white hover:bg-stone-800 rounded transition cursor-pointer"
              title="Zoom In (+)"
              aria-label="Zoom In"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>

          <!-- Date Stamp Toggle -->
          <button
            id="ulightboxStampBtn"
            onclick="window.UniversalLightbox.toggleStamp()"
            class="hidden sm:inline-flex px-2.5 py-1 text-[11px] rounded bg-stone-900 border border-stone-800 text-stone-300 hover:text-white transition cursor-pointer"
            title="Toggle camera timestamp stamp"
          >
            STAMP
          </button>

          <!-- Close Modal -->
          <button
            onclick="window.UniversalLightbox.close()"
            class="p-1.5 rounded bg-stone-900 border border-stone-800 text-stone-300 hover:text-white transition cursor-pointer"
            title="Close Lightbox (Escape)"
            aria-label="Close Lightbox"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <!-- Center Inspection Canvas (Pan / Zoom Area) -->
      <div id="ulightboxCanvas" class="universal-lightbox-canvas my-3 sm:my-4 relative flex-1 flex items-center justify-center overflow-hidden">
        <!-- Prev Arrow -->
        <button
          onclick="window.UniversalLightbox.prev()"
          class="absolute left-2 sm:left-4 z-20 p-2.5 rounded-full bg-stone-900/80 hover:bg-stone-900 text-white border border-stone-800 transition cursor-pointer shadow-lg"
          title="Previous Plate (Left Arrow)"
          aria-label="Previous Plate"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>

        <!-- Ratio-Locked Image Container -->
        <div id="ulightboxImgWrap" class="universal-lightbox-wrapper relative inline-flex items-center justify-center max-w-full max-h-full">
          <img
            id="ulightboxImg"
            src=""
            alt="Plate Inspection"
            class="universal-lightbox-img rounded-sm border border-stone-800"
            draggable="false"
          />
          <div
            id="ulightboxDateStamp"
            class="absolute bottom-3 right-4 font-mono text-[11px] font-bold text-red-400 bg-stone-950/85 px-2 py-1 rounded border border-red-900/40 tracking-widest uppercase pointer-events-none transition-opacity"
          ></div>
        </div>

        <!-- Next Arrow -->
        <button
          onclick="window.UniversalLightbox.next()"
          class="absolute right-2 sm:right-4 z-20 p-2.5 rounded-full bg-stone-900/80 hover:bg-stone-900 text-white border border-stone-800 transition cursor-pointer shadow-lg"
          title="Next Plate (Right Arrow)"
          aria-label="Next Plate"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      <!-- Bottom Archival Metadata Card -->
      <div class="w-full max-w-2xl mx-auto bg-stone-900/90 border border-stone-800 rounded-lg p-3 sm:p-3.5 text-center sm:text-left shrink-0">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 border-b border-stone-800 pb-2 mb-2 font-mono text-xs">
          <div class="text-stone-400 truncate">
            <span id="ulightboxTitle" class="text-white font-semibold mr-2">Plate</span>
            <span id="ulightboxMetaTime" class="text-stone-300"></span>
          </div>
          <div class="text-stone-500 text-[10px] sm:text-[11px] uppercase tracking-wider shrink-0">
            Philippines Dumaguete Mission
          </div>
        </div>
        <p id="ulightboxCaption" class="text-xs text-stone-300 leading-relaxed font-sans"></p>
      </div>
    `;

    document.body.appendChild(modal);
    bindEvents(modal);
    return modal;
  }

  function bindEvents(modal) {
    const canvas = modal.querySelector('#ulightboxCanvas');
    const imgWrap = modal.querySelector('#ulightboxImgWrap');
    const img = modal.querySelector('#ulightboxImg');

    if (canvas) {
      canvas.addEventListener('click', (e) => {
        // If clicking on the canvas outside the image, close only if not zoomed
        if (e.target === canvas) {
          if (scale > 1) {
            resetZoom();
          } else {
            close();
          }
        }
      });
    }

    if (img) {
      // Click or tap to toggle zoom between 1x and 2x
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        if (scale === 1) {
          // Zoom to 2x centered near click
          const rect = img.getBoundingClientRect();
          const clickX = e.clientX - rect.left - rect.width / 2;
          const clickY = e.clientY - rect.top - rect.height / 2;
          scale = 2;
          panX = -clickX * 0.7;
          panY = -clickY * 0.7;
          applyTransform(true);
        } else {
          resetZoom();
        }
      });

      // Pointer / Mouse Drag to Pan
      img.addEventListener('mousedown', (e) => {
        if (scale <= 1) return;
        isDragging = true;
        startPointerX = e.clientX;
        startPointerY = e.clientY;
        startPanX = panX;
        startPanY = panY;
        img.classList.add('cursor-grabbing');
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - startPointerX;
        const deltaY = e.clientY - startPointerY;
        panX = startPanX + deltaX;
        panY = startPanY + deltaY;
        clampPan();
        applyTransform(false);
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          if (img) img.classList.remove('cursor-grabbing');
        }
      });

      // Touch events for drag-pan & swipe
      img.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          startPointerX = e.touches[0].clientX;
          startPointerY = e.touches[0].clientY;
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          startPanX = panX;
          startPanY = panY;
          if (scale > 1) isDragging = true;
        }
      }, { passive: true });

      img.addEventListener('touchmove', (e) => {
        if (scale > 1 && isDragging && e.touches.length === 1) {
          const deltaX = e.touches[0].clientX - startPointerX;
          const deltaY = e.touches[0].clientY - startPointerY;
          panX = startPanX + deltaX;
          panY = startPanY + deltaY;
          clampPan();
          applyTransform(false);
        }
      }, { passive: true });

      img.addEventListener('touchend', (e) => {
        if (isDragging) {
          isDragging = false;
        } else if (scale === 1 && e.changedTouches && e.changedTouches.length > 0) {
          const diffX = e.changedTouches[0].clientX - touchStartX;
          const diffY = e.changedTouches[0].clientY - touchStartY;
          if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX > 0) prev();
            else next();
          }
        }
      }, { passive: true });
    }

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (!modal || modal.classList.contains('hidden')) return;

      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'ArrowLeft') {
        prev();
      } else if (e.key === 'ArrowRight') {
        next();
      } else if (e.key === '+' || e.key === '=') {
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        zoomOut();
      } else if (e.key === '0') {
        resetZoom();
      }
    });
  }

  function clampPan() {
    const img = document.getElementById('ulightboxImg');
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const maxPanX = (rect.width * (scale - 1)) / 2 + 120;
    const maxPanY = (rect.height * (scale - 1)) / 2 + 120;

    panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
    panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
  }

  function applyTransform(withTransition = true) {
    const img = document.getElementById('ulightboxImg');
    const zoomText = document.getElementById('ulightboxZoomText');
    if (!img) return;

    if (withTransition) {
      img.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
    } else {
      img.style.transition = 'none';
    }

    // STRICT ASPECT-RATIO GUARANTEE: uniform scale(s) keeps aspect ratio invariant
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;

    if (scale > 1) {
      img.classList.add('zoomed');
    } else {
      img.classList.remove('zoomed');
    }

    if (zoomText) {
      zoomText.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  function resetZoom() {
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform(true);
  }

  function zoomIn() {
    if (scale >= MAX_SCALE) return;
    scale = Math.min(MAX_SCALE, scale + ZOOM_STEP);
    applyTransform(true);
  }

  function zoomOut() {
    if (scale <= MIN_SCALE) return;
    scale = Math.max(MIN_SCALE, scale - ZOOM_STEP);
    if (scale === 1) {
      panX = 0;
      panY = 0;
    } else {
      clampPan();
    }
    applyTransform(true);
  }

  function toggleStamp() {
    showDateStamp = !showDateStamp;
    localStorage.setItem('galleryDateStamp', String(showDateStamp));
    updateStampDisplay();
  }

  function updateStampDisplay() {
    const stampEl = document.getElementById('ulightboxDateStamp');
    const btn = document.getElementById('ulightboxStampBtn');
    if (stampEl) {
      stampEl.style.display = showDateStamp ? 'block' : 'none';
    }
    if (btn) {
      if (showDateStamp) {
        btn.classList.add('text-red-400');
        btn.classList.remove('text-stone-400');
      } else {
        btn.classList.remove('text-red-400');
        btn.classList.add('text-stone-400');
      }
    }
  }

  function updateCurrentItem() {
    const item = activeItems[currentIndex];
    if (!item) return;

    const modal = createOrGetModal();
    const img = modal.querySelector('#ulightboxImg');
    const idxEl = modal.querySelector('#ulightboxIndex');
    const totalEl = modal.querySelector('#ulightboxTotal');
    const catBadge = modal.querySelector('#ulightboxCatBadge');
    const titleEl = modal.querySelector('#ulightboxTitle');
    const metaTimeEl = modal.querySelector('#ulightboxMetaTime');
    const captionEl = modal.querySelector('#ulightboxCaption');
    const stampEl = modal.querySelector('#ulightboxDateStamp');

    if (idxEl) idxEl.textContent = currentIndex + 1;
    if (totalEl) totalEl.textContent = activeItems.length;

    const cat = item.category || item.album || 'Field Photography';
    if (catBadge) catBadge.textContent = cat;

    const title = item.title || `Plate #${String(currentIndex + 1).padStart(3, '0')}`;
    if (titleEl) titleEl.textContent = title;

    const timeStr = item.archivalStamp || item.capturedDateTime || (item.capturedDate ? `${item.capturedDate} • ${item.capturedTime || '12:07 PM'}` : '2026 • Negros Oriental');
    if (metaTimeEl) metaTimeEl.textContent = `• ${timeStr}`;

    const caption = item.caption || item.text || 'Official documentary missionary photograph preserved in the Philippines Dumaguete Mission archival registry.';
    if (captionEl) captionEl.textContent = caption;

    if (stampEl) {
      stampEl.textContent = item.archivalStamp || item.capturedDateTime || 'DGT • 2026';
    }
    updateStampDisplay();

    // Reset zoom and pan on item change
    resetZoom();

    // Image source with fallback failover
    if (img) {
      img.style.opacity = '0.3';
      const fallbackSrc = item.fallback || item.cdnSrc || (item.filename ? `https://cdn.jsdelivr.net/gh/AllensCreations/ElderSalviejo@main/vault/gallery/photos/${item.filename}` : '');
      const legacyFallback = item.legacyCdnSrc || (item.filename ? `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${item.filename}` : '');

      img.src = item.src || item.localSrc || fallbackSrc;
      img.alt = title;

      img.onerror = () => {
        if (fallbackSrc && img.src !== fallbackSrc) {
          img.src = fallbackSrc;
        } else if (legacyFallback && img.src !== legacyFallback) {
          img.src = legacyFallback;
        }
      };

      img.onload = () => {
        img.style.opacity = '1';
      };
    }
  }

  function open({ items, index = 0 }) {
    if (!items || items.length === 0) return;
    activeItems = items;
    currentIndex = Math.max(0, Math.min(index, items.length - 1));

    const modal = createOrGetModal();
    updateCurrentItem();

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      modal.classList.remove('opacity-0');
      modal.classList.add('opacity-100');
    });
  }

  function close() {
    const modal = document.getElementById('universalLightboxModal');
    if (!modal) return;

    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');

    setTimeout(() => {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
      resetZoom();
    }, 180);
  }

  function next() {
    if (activeItems.length <= 1) return;
    currentIndex = (currentIndex + 1) % activeItems.length;
    updateCurrentItem();
  }

  function prev() {
    if (activeItems.length <= 1) return;
    currentIndex = (currentIndex - 1 + activeItems.length) % activeItems.length;
    updateCurrentItem();
  }

  // Public API
  window.UniversalLightbox = {
    open,
    close,
    next,
    prev,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleStamp
  };

  // Backwards compatibility global functions
  window.openUniversalLightbox = (items, index) => open({ items, index });

  // DOM ready hook
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => createOrGetModal());
  } else {
    createOrGetModal();
  }
})();
