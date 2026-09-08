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
  preloadAllImages().catch(() => {});
});
