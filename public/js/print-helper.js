/**
 * Elder Salviejo • Print & PDF Preloader Helper
 * Ensures all document images and fonts are fully decoded & ready before calling window.print().
 * Preserves authentic colors and natural aspect ratios across all devices.
 */

async function preloadAllImages() {
  const images = Array.from(document.images);
  const promises = images.map(img => {
    if (!img.src) return Promise.resolve();
    if (img.complete && img.naturalWidth > 0) {
      if (img.decode) {
        return img.decode().catch(() => {});
      }
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const timer = setTimeout(resolve, 4000); // 4-second safety timeout
      const onDone = () => {
        clearTimeout(timer);
        if (img.decode) {
          img.decode().then(resolve).catch(resolve);
        } else {
          resolve();
        }
      };

      img.addEventListener('load', onDone, { once: true });
      img.addEventListener('error', onDone, { once: true });
    });
  });

  if (document.fonts && document.fonts.ready) {
    promises.push(document.fonts.ready.catch(() => {}));
  }

  await Promise.all(promises);
}

function showPrintGuidanceToast() {
  let toast = document.getElementById('printGuidanceToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'printGuidanceToast';
    toast.className = 'no-print fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] sm:w-auto bg-stone-900/95 text-stone-100 border border-stone-700/80 shadow-2xl rounded-lg px-4 py-3 backdrop-blur-md transition-all duration-300 pointer-events-auto flex items-start gap-3 text-xs';
    toast.innerHTML = `
      <div class="p-1 bg-amber-500/20 text-amber-400 rounded shrink-0 mt-0.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div class="flex-1 leading-relaxed">
        <div class="font-mono uppercase font-bold text-[10px] tracking-wider text-amber-400 mb-0.5">Print & PDF Setting Tip</div>
        <p class="text-stone-300">In the print dialog, set <strong class="text-white">Margins to 'None' (or Minimum)</strong> and check <strong class="text-white">'Background graphics'</strong> for exact 11-inch pages with zero dead space.</p>
      </div>
      <button type="button" onclick="this.closest('#printGuidanceToast').remove()" class="text-stone-400 hover:text-stone-100 transition p-1 cursor-pointer" aria-label="Dismiss">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    `;
    document.body.appendChild(toast);
  }

  clearTimeout(window._printToastTimer);
  window._printToastTimer = setTimeout(() => {
    if (toast && toast.parentElement) {
      toast.classList.add('opacity-0', '-translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }
  }, 14000);
}

async function triggerPrintWithPreload(btn) {
  let originalHtml = '';
  if (btn) {
    originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="w-3.5 h-3.5 animate-spin inline-block mr-1 text-amber-300" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      <span>Preloading...</span>
    `;
  }

  showPrintGuidanceToast();

  try {
    await preloadAllImages();
    // Brief 250ms render buffer for bitmap painting
    await new Promise(r => setTimeout(r, 250));
    window.print();
  } catch (err) {
    console.warn('Preload before print warning:', err);
    window.print();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

// Global hook for keyboard shortcut Ctrl+P / Cmd+P
window.addEventListener('beforeprint', () => {
  showPrintGuidanceToast();
  preloadAllImages().catch(() => {});
});

/**
 * Global Content Protection: Anti-Save, Anti-Longpress & Anti-Select
 */
function setupGlobalContentProtection() {
  // Prevent context menu (right-click / long-press menu) outside editable inputs
  document.addEventListener('contextmenu', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      return true;
    }
    e.preventDefault();
    return false;
  }, false);

  // Prevent drag and drop of images
  document.addEventListener('dragstart', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      return true;
    }
    e.preventDefault();
    return false;
  }, false);

  // Prevent text selection drag outside inputs
  document.addEventListener('selectstart', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      return true;
    }
    e.preventDefault();
    return false;
  }, false);

  // Prevent mobile long-press image callouts
  document.addEventListener('touchstart', (e) => {
    if (e.target && (e.target.tagName === 'IMG' || e.target.closest('.polaroid-photo-wrap') || e.target.closest('.polaroid-frame') || e.target.closest('.polaroid-card'))) {
      e.target.style.webkitTouchCallout = 'none';
      e.target.style.webkitUserSelect = 'none';
    }
  }, { passive: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupGlobalContentProtection);
} else {
  setupGlobalContentProtection();
}
