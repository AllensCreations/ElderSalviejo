/**
 * Gallery Controller: Archival Polaroid & Documentary Photo Gallery
 * Version 2.0 Archival Edition with Enriched Camera Capture Metadata & Multi-Tier Fallback
 */

let allPhotos = [];
let filteredPhotos = [];
let activeCategory = 'All';
let activeLightboxIndex = 0;
let showDateStamp = localStorage.getItem('galleryDateStamp') !== 'false';
let touchStartX = 0;
let touchEndX = 0;

const PAGE_SIZE = 24;
let displayedCount = PAGE_SIZE;

const TILT_CLASSES = [
  'tilt-neg-2',
  'tilt-pos-1',
  'tilt-neg-1',
  'tilt-pos-2',
  'tilt-zero'
];

document.addEventListener('DOMContentLoaded', () => {
  loadGallery();
  setupKeyboardAndTouch();
  updateDateStampUi();
});

// Image fallback handler to guarantee zero broken images
window.handleGalleryImgError = function (img, cdnSrc, legacyCdnSrc) {
  if (!img) return;
  const count = parseInt(img.dataset.retryCount || '0', 10);
  if (count === 0 && cdnSrc) {
    img.dataset.retryCount = '1';
    img.src = cdnSrc;
  } else if (count === 1 && legacyCdnSrc) {
    img.dataset.retryCount = '2';
    img.src = legacyCdnSrc;
  }
};

async function loadGallery() {
  const skeleton = document.getElementById('gallerySkeleton');
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  const countText = document.getElementById('galleryCountText');
  const loadMore = document.getElementById('galleryLoadMoreContainer');

  const sortByNewest = (list) => {
    return list.sort((a, b) => {
      const timeA = a && a.dateTime ? new Date(a.dateTime).getTime() : 0;
      const timeB = b && b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return timeB - timeA;
    });
  };

  // 1. Instant SWR from LocalStorage
  try {
    const cachedRaw = localStorage.getItem('gdv_cached_gallery_v2');
    if (cachedRaw) {
      const cachedList = JSON.parse(cachedRaw);
      if (Array.isArray(cachedList) && cachedList.length > 0) {
        allPhotos = sortByNewest(cachedList);
        filteredPhotos = [...allPhotos];
        if (countText) countText.textContent = `${allPhotos.length} Plates`;
        renderFilters();
        renderGallery();
      }
    }
  } catch (_) {}

  if (allPhotos.length === 0) {
    if (skeleton) skeleton.classList.remove('hidden');
    if (grid) grid.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
    if (loadMore) loadMore.classList.add('hidden');
    if (countText) countText.textContent = 'Loading plates...';
  }

  // 2. Fetch fresh gallery data
  try {
    const res = await fetch('/api/gallery');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && Array.isArray(data.photos)) {
      allPhotos = sortByNewest(data.photos);
      try {
        localStorage.setItem('gdv_cached_gallery_v2', JSON.stringify(allPhotos));
      } catch (_) {}
    }
  } catch (err) {
    console.warn('Could not fetch /api/gallery, attempting local vault fallback:', err);
    if (allPhotos.length === 0) {
      try {
        const localRes = await fetch('/vault/gallery/index.json');
        if (localRes.ok) {
          const localData = await localRes.json();
          if (Array.isArray(localData)) {
            allPhotos = sortByNewest(localData);
          }
        }
      } catch (_) {}
    }
  }

  filteredPhotos = filterByCategory(allPhotos, activeCategory);
  if (countText) {
    countText.textContent = `${allPhotos.length} Plates`;
  }
  renderFilters();
  renderGallery();
}

function filterByCategory(list, cat) {
  if (cat === 'All') return list;
  return list.filter(p => {
    const pCat = p.category || 'Mission';
    return pCat === cat;
  });
}

function renderFilters() {
  const container = document.getElementById('galleryFilters');
  if (!container) return;

  const cats = ['All', 'Mission', 'Chapel & District', 'Companions'];
  
  container.innerHTML = cats.map(cat => {
    const isActive = cat === activeCategory;
    const count = cat === 'All' ? allPhotos.length : allPhotos.filter(p => (p.category || 'Mission') === cat).length;
    if (count === 0 && cat !== 'All') return '';

    return `
      <button 
        onclick="setCategory('${cat}')"
        class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded-md transition duration-150 flex items-center gap-1.5 ${
          isActive 
            ? 'bg-stone-900 text-white font-semibold shadow-xs' 
            : 'bg-white hover:bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200'
        }"
      >
        <span>${cat}</span>
        <span class="text-[10px] opacity-60">(${count})</span>
      </button>
    `;
  }).join('');

  container.classList.remove('hidden');
}

function setCategory(cat) {
  activeCategory = cat;
  filteredPhotos = filterByCategory(allPhotos, activeCategory);
  displayedCount = PAGE_SIZE;
  renderFilters();
  renderGallery();
}

function loadMorePhotos() {
  displayedCount += PAGE_SIZE;
  renderGallery();
}

function renderGallery() {
  const skeleton = document.getElementById('gallerySkeleton');
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  const countText = document.getElementById('galleryCountText');
  const loadMoreContainer = document.getElementById('galleryLoadMoreContainer');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const progressText = document.getElementById('galleryProgressText');

  if (skeleton) skeleton.classList.add('hidden');

  if (!filteredPhotos || filteredPhotos.length === 0) {
    if (grid) grid.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
    if (countText) countText.textContent = '0 Plates';
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (countText) {
    countText.textContent = `${filteredPhotos.length} Plates`;
  }

  if (!grid) return;

  const visiblePhotos = filteredPhotos.slice(0, displayedCount);

  grid.innerHTML = visiblePhotos.map((item, index) => {
    const tiltClass = TILT_CLASSES[index % TILT_CLASSES.length];
    const imgSrc = item.src || item.localSrc || `/vault/gallery/photos/${item.filename}`;
    const cdnFallback = item.cdnSrc || `https://cdn.jsdelivr.net/gh/AllensCreations/ElderSalviejo@main/vault/gallery/photos/${item.filename}`;
    const legacyCdnFallback = item.legacyCdnSrc || `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${item.filename}`;
    const isPriority = index < 4;

    const stampText = item.archivalStamp || item.capturedDateTime || (item.capturedDate ? `${item.capturedDate} • ${item.capturedTime}` : 'DUMAGUETE • 2026');
    const shotNumber = String(index + 1).padStart(3, '0');

    return `
      <div 
        class="polaroid-pinned-card ${tiltClass} w-full" 
        onclick="openLightbox(${index})"
        role="button"
        tabindex="0"
        aria-label="View photo plate in lightbox"
        onkeydown="if(event.key==='Enter') openLightbox(${index})"
      >
        <div class="polaroid-pin"></div>
        <div class="polaroid-frame">
          <div class="polaroid-photo-wrap aspect-4-3">
            <img 
              src="${escapeAttr(imgSrc)}" 
              alt="Elder Salviejo Plate ${shotNumber}" 
              loading="${isPriority ? 'eager' : 'lazy'}"
              ${isPriority ? 'fetchpriority="high"' : ''}
              decoding="async"
              onerror="handleGalleryImgError(this, '${escapeAttr(cdnFallback)}', '${escapeAttr(legacyCdnFallback)}')"
            />
          </div>
          <div class="polaroid-stamp flex items-center justify-between px-1 pt-2">
            <span class="font-mono text-[10px] text-stone-400">#${shotNumber}</span>
            <span class="font-mono text-[10px] font-medium tracking-wide text-stone-700 truncate ml-1">${escapeHtml(stampText)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.classList.remove('hidden');

  if (loadMoreContainer) {
    if (filteredPhotos.length > displayedCount) {
      loadMoreContainer.classList.remove('hidden');
      if (loadMoreBtn) loadMoreBtn.classList.remove('hidden');
      if (progressText) {
        progressText.textContent = `Showing ${visiblePhotos.length} of ${filteredPhotos.length} plates`;
      }
    } else {
      if (filteredPhotos.length > PAGE_SIZE) {
        loadMoreContainer.classList.remove('hidden');
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        if (progressText) {
          progressText.textContent = `All ${filteredPhotos.length} plates loaded`;
        }
      } else {
        loadMoreContainer.classList.add('hidden');
      }
    }
  }
}

function openLightbox(index) {
  if (!filteredPhotos || filteredPhotos.length === 0) return;
  activeLightboxIndex = (index >= 0 && index < filteredPhotos.length) ? index : 0;

  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  const indexEl = document.getElementById('lightboxIndex');
  const totalEl = document.getElementById('lightboxTotal');

  if (!modal || !img) return;

  const photo = filteredPhotos[activeLightboxIndex];
  const src = photo.src || photo.localSrc || `/vault/gallery/photos/${photo.filename}`;
  const cdnFallback = photo.cdnSrc || `https://cdn.jsdelivr.net/gh/AllensCreations/ElderSalviejo@main/vault/gallery/photos/${photo.filename}`;
  const legacyCdn = photo.legacyCdnSrc || `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${photo.filename}`;

  img.src = src;
  img.onerror = () => { handleGalleryImgError(img, cdnFallback, legacyCdn); };

  if (indexEl) indexEl.textContent = activeLightboxIndex + 1;
  if (totalEl) totalEl.textContent = filteredPhotos.length;

  updateDateStampText(photo);
  updateLightboxDetails(photo);

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');
  });
}

function updateLightboxDetails(photo) {
  const catBadge = document.getElementById('lightboxCatBadge');
  const captionText = document.getElementById('lightboxCaptionText');
  const dateText = document.getElementById('lightboxDateText');
  const timeText = document.getElementById('lightboxTimeText');
  const exifBadge = document.getElementById('lightboxExifBadge');

  const caption = photo.caption || photo.text || '';
  const category = photo.category || photo.album || 'Mission';

  if (catBadge) catBadge.textContent = category;
  if (captionText) {
    captionText.textContent = caption || 'Archival missionary photograph from the field in the Philippines Dumaguete Mission.';
  }

  if (dateText) {
    dateText.textContent = photo.capturedDate || '2026';
  }

  if (timeText) {
    timeText.textContent = photo.capturedTime ? `${photo.capturedTime} (PHT)` : '12:00 PM (PHT)';
  }

  if (exifBadge) {
    if (photo.isExif) {
      exifBadge.classList.remove('hidden');
    } else {
      exifBadge.classList.add('hidden');
    }
  }
}

function updateDateStampText(photo) {
  const stamp = document.getElementById('lightboxDateStamp');
  if (!stamp) return;

  if (photo.archivalStamp) {
    stamp.textContent = photo.archivalStamp;
    return;
  }

  if (photo.capturedDateTime) {
    stamp.textContent = photo.capturedDateTime;
    return;
  }

  stamp.textContent = 'DGT • 2026';
}

function toggleDateStamp() {
  showDateStamp = !showDateStamp;
  localStorage.setItem('galleryDateStamp', showDateStamp);
  updateDateStampUi();
}

function updateDateStampUi() {
  const stamp = document.getElementById('lightboxDateStamp');
  const btn = document.getElementById('dateStampToggleBtn');
  if (stamp) {
    stamp.style.display = showDateStamp ? 'block' : 'none';
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

function closeLightbox() {
  const modal = document.getElementById('lightboxModal');
  if (!modal) return;

  modal.classList.remove('opacity-100');
  modal.classList.add('opacity-0');

  setTimeout(() => {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }, 180);
}

function handleLightboxBackdrop(event) {
  if (event.target.id === 'lightboxModal') {
    closeLightbox();
  }
}

function navigateLightbox(direction) {
  if (!filteredPhotos || filteredPhotos.length === 0) return;
  activeLightboxIndex = (activeLightboxIndex + direction + filteredPhotos.length) % filteredPhotos.length;

  const img = document.getElementById('lightboxImg');
  const indexEl = document.getElementById('lightboxIndex');
  const photo = filteredPhotos[activeLightboxIndex];
  const src = photo.src || photo.localSrc || `/vault/gallery/photos/${photo.filename}`;
  const cdnFallback = photo.cdnSrc || `https://cdn.jsdelivr.net/gh/AllensCreations/ElderSalviejo@main/vault/gallery/photos/${photo.filename}`;
  const legacyCdn = photo.legacyCdnSrc || `https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/photos/${photo.filename}`;

  if (img) {
    img.style.opacity = '0.5';
    img.src = src;
    img.onerror = () => { handleGalleryImgError(img, cdnFallback, legacyCdn); };
    img.onload = () => { img.style.opacity = '1'; };
  }
  if (indexEl) indexEl.textContent = activeLightboxIndex + 1;

  updateDateStampText(photo);
  updateLightboxDetails(photo);
}

function setupKeyboardAndTouch() {
  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('lightboxModal');
    if (!modal || modal.classList.contains('hidden')) return;

    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') navigateLightbox(-1);
    else if (e.key === 'ArrowRight') navigateLightbox(1);
  });

  const modal = document.getElementById('lightboxModal');
  if (modal) {
    modal.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    modal.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });
  }
}

function handleSwipe() {
  const diff = touchEndX - touchStartX;
  if (Math.abs(diff) > 50) {
    if (diff > 0) navigateLightbox(-1);
    else navigateLightbox(1);
  }
}

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/"/g, '&quot;');
}
