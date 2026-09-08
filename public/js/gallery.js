/**
 * Gallery Controller: Pinned Polaroid Photo Gallery
 * Strictly images only, pinned board layout (compact on desktop, scrollable on mobile),
 * dynamic album filtering, and vintage camera date stamp in lightbox.
 */

let allPhotos = [];
let filteredPhotos = [];
let activeCategory = 'All';
let activeLightboxIndex = 0;
let showDateStamp = localStorage.getItem('galleryDateStamp') !== 'false';
let touchStartX = 0;
let touchEndX = 0;

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

async function loadGallery() {
  const skeleton = document.getElementById('gallerySkeleton');
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  const filters = document.getElementById('galleryFilters');
  const countText = document.getElementById('galleryCountText');

  if (skeleton) skeleton.classList.remove('hidden');
  if (grid) grid.classList.add('hidden');
  if (empty) empty.classList.add('hidden');
  if (filters) filters.classList.add('hidden');
  if (countText) countText.textContent = 'Checking photos...';

  try {
    const res = await fetch('/api/gallery', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && Array.isArray(data.photos) && data.photos.length > 0) {
      allPhotos = data.photos;
    } else {
      allPhotos = [];
    }
  } catch (err) {
    console.warn('Could not fetch /api/gallery:', err);
    allPhotos = [];
  }

  filteredPhotos = [...allPhotos];
  renderFilters();
  renderGallery();
}

function renderFilters() {
  const filtersEl = document.getElementById('galleryFilters');
  if (!filtersEl) return;

  if (!allPhotos || allPhotos.length === 0) {
    filtersEl.classList.add('hidden');
    return;
  }

  // Extract unique categories
  const categories = ['All'];
  allPhotos.forEach(p => {
    const cat = p.category || (p.isGalleryUpload ? 'Mission' : 'P-Day Journal');
    if (cat && !categories.includes(cat)) {
      categories.push(cat);
    }
  });

  // Only show filter bar if there is more than 1 distinct category
  if (categories.length <= 1) {
    filtersEl.classList.add('hidden');
    return;
  }

  filtersEl.innerHTML = categories.map(cat => {
    const isActive = cat === activeCategory;
    const activeClass = isActive
      ? 'bg-amber-600 text-white font-semibold shadow-xs'
      : 'bg-white hover:bg-stone-50 text-stone-700 hover:text-stone-900 border border-amber-200/90 shadow-2xs';

    return `
      <button 
        onclick="setCategory('${escapeAttr(cat)}')" 
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${activeClass}"
      >
        ${escapeHtml(cat)}
      </button>
    `;
  }).join('');

  filtersEl.classList.remove('hidden');
}

function setCategory(cat) {
  activeCategory = cat;
  if (cat === 'All') {
    filteredPhotos = [...allPhotos];
  } else {
    filteredPhotos = allPhotos.filter(p => {
      const pCat = p.category || (p.isGalleryUpload ? 'Mission' : 'P-Day Journal');
      return pCat === cat;
    });
  }
  renderFilters();
  renderGallery();
}

function renderGallery() {
  const skeleton = document.getElementById('gallerySkeleton');
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  const countText = document.getElementById('galleryCountText');

  if (skeleton) skeleton.classList.add('hidden');

  if (!filteredPhotos || filteredPhotos.length === 0) {
    if (grid) grid.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    if (countText) countText.textContent = '0 Polaroids';
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (countText) {
    countText.textContent = `${filteredPhotos.length} Polaroid${filteredPhotos.length === 1 ? '' : 's'}`;
  }

  if (!grid) return;

  // Render pinned polaroid board (strictly images only, no text)
  grid.innerHTML = filteredPhotos.map((item, index) => {
    const tiltClass = TILT_CLASSES[index % TILT_CLASSES.length];
    const imgSrc = item.src || item.thumb || '';

    return `
      <div 
        class="polaroid-pinned-card ${tiltClass} max-w-[240px] w-full" 
        onclick="openLightbox(${index})"
        role="button"
        tabindex="0"
        aria-label="View photo in lightbox"
        onkeydown="if(event.key==='Enter') openLightbox(${index})"
      >
        <div class="polaroid-pin"></div>
        <div class="polaroid-frame">
          <div class="polaroid-photo-wrap">
            <img 
              src="${escapeAttr(imgSrc)}" 
              alt="Elder Salviejo Polaroid" 
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.classList.remove('hidden');
}

/* Lightbox Implementation with Feature 6 Date Stamp */
function openLightbox(index) {
  if (!filteredPhotos || filteredPhotos.length === 0) return;
  activeLightboxIndex = (index >= 0 && index < filteredPhotos.length) ? index : 0;

  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  const downloadBtn = document.getElementById('lightboxDownloadBtn');
  const indexEl = document.getElementById('lightboxIndex');
  const totalEl = document.getElementById('lightboxTotal');

  if (!modal || !img) return;

  const photo = filteredPhotos[activeLightboxIndex];
  const src = photo.src || photo.thumb || '';

  img.src = src;
  if (downloadBtn) {
    downloadBtn.href = src;
    downloadBtn.setAttribute('download', `elder-salviejo-polaroid-${activeLightboxIndex + 1}.jpg`);
  }
  if (indexEl) indexEl.textContent = activeLightboxIndex + 1;
  if (totalEl) totalEl.textContent = filteredPhotos.length;

  updateDateStampText(photo.date);

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');
  });
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
  const downloadBtn = document.getElementById('lightboxDownloadBtn');
  const indexEl = document.getElementById('lightboxIndex');

  const photo = filteredPhotos[activeLightboxIndex];
  const src = photo.src || photo.thumb || '';

  if (img) {
    img.style.opacity = '0.5';
    img.src = src;
    img.onload = () => {
      img.style.opacity = '1';
    };
  }
  if (downloadBtn) {
    downloadBtn.href = src;
    downloadBtn.setAttribute('download', `elder-salviejo-polaroid-${activeLightboxIndex + 1}.jpg`);
  }
  if (indexEl) indexEl.textContent = activeLightboxIndex + 1;

  updateDateStampText(photo.date);
}

/* Feature 6: Vintage Camera Date Stamp Logic */
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
      btn.classList.add('text-amber-400');
      btn.classList.remove('text-stone-400');
    } else {
      btn.classList.remove('text-amber-400');
      btn.classList.add('text-stone-400');
    }
  }
}

function updateDateStampText(dateStr) {
  const stamp = document.getElementById('lightboxDateStamp');
  if (!stamp) return;

  if (!dateStr) {
    stamp.textContent = '';
    return;
  }

  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      stamp.textContent = '';
      return;
    }
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    stamp.textContent = `'${yy} ${mm} ${dd}`;
  } catch (_) {
    stamp.textContent = '';
  }
}

function setupKeyboardAndTouch() {
  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('lightboxModal');
    if (!modal || modal.classList.contains('hidden')) return;

    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      navigateLightbox(-1);
    } else if (e.key === 'ArrowRight') {
      navigateLightbox(1);
    }
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
  const swipeThreshold = 50;
  const diff = touchEndX - touchStartX;

  if (Math.abs(diff) > swipeThreshold) {
    if (diff > 0) {
      navigateLightbox(-1);
    } else {
      navigateLightbox(1);
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
