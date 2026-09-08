/**
 * Gallery Controller: Polaroid Photo Gallery
 * Strictly images only, no text, scrollable masonry with responsive lightbox.
 */

let galleryPhotos = [];
let activeLightboxIndex = 0;
let touchStartX = 0;
let touchEndX = 0;

const FALLBACK_STARTER_PHOTOS = [
  { id: 'starter-1', src: '/assets/images/elder-salviejo.jpg' },
  { id: 'starter-2', src: '/assets/images/intro/photo-1.jpg' },
  { id: 'starter-3', src: '/assets/images/intro/photo-2.jpg' },
  { id: 'starter-4', src: '/assets/images/intro/photo-3.jpg' },
  { id: 'starter-5', src: '/assets/images/intro/photo-4.jpg' },
  { id: 'starter-6', src: '/assets/images/intro/photo-5.jpg' },
  { id: 'starter-7', src: '/assets/images/intro/call-letter.jpg' },
  { id: 'starter-8', src: '/assets/images/intro/call-overview.jpg' }
];

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
});

async function loadGallery() {
  const skeleton = document.getElementById('gallerySkeleton');
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  const countText = document.getElementById('galleryCountText');

  if (skeleton) skeleton.classList.remove('hidden');
  if (grid) grid.classList.add('hidden');
  if (empty) empty.classList.add('hidden');
  if (countText) countText.textContent = 'Loading photos...';

  try {
    const res = await fetch('/api/gallery', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && Array.isArray(data.photos) && data.photos.length > 0) {
      galleryPhotos = data.photos;
    } else {
      galleryPhotos = FALLBACK_STARTER_PHOTOS;
    }
  } catch (err) {
    console.warn('Could not fetch /api/gallery, using fallback mission starter photos:', err);
    galleryPhotos = FALLBACK_STARTER_PHOTOS;
  }

  renderGallery();
}

function renderGallery() {
  const skeleton = document.getElementById('gallerySkeleton');
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  const countText = document.getElementById('galleryCountText');

  if (skeleton) skeleton.classList.add('hidden');

  if (!galleryPhotos || galleryPhotos.length === 0) {
    if (empty) empty.classList.remove('hidden');
    if (countText) countText.textContent = '0 Photos';
    return;
  }

  if (countText) {
    countText.textContent = `${galleryPhotos.length} Polaroid${galleryPhotos.length === 1 ? '' : 's'}`;
  }

  if (!grid) return;

  grid.innerHTML = galleryPhotos.map((item, index) => {
    const tiltClass = TILT_CLASSES[index % TILT_CLASSES.length];
    const imgSrc = item.src || item.thumb || '';

    return `
      <div 
        class="polaroid-frame ${tiltClass}" 
        onclick="openLightbox(${index})"
        role="button"
        tabindex="0"
        aria-label="View photo in lightbox"
        onkeydown="if(event.key==='Enter') openLightbox(${index})"
      >
        <div class="polaroid-photo-wrap">
          <img 
            src="${imgSrc}" 
            alt="Elder Salviejo Polaroid" 
            loading="lazy"
            decoding="async"
            onerror="this.src='/assets/images/elder-salviejo.jpg'"
          />
        </div>
      </div>
    `;
  }).join('');

  grid.classList.remove('hidden');
}

/* Lightbox Implementation */
function openLightbox(index) {
  if (!galleryPhotos || galleryPhotos.length === 0) return;
  activeLightboxIndex = (index >= 0 && index < galleryPhotos.length) ? index : 0;

  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  const downloadBtn = document.getElementById('lightboxDownloadBtn');
  const indexEl = document.getElementById('lightboxIndex');
  const totalEl = document.getElementById('lightboxTotal');

  if (!modal || !img) return;

  const photo = galleryPhotos[activeLightboxIndex];
  const src = photo.src || photo.thumb || '';

  img.src = src;
  if (downloadBtn) {
    downloadBtn.href = src;
    downloadBtn.setAttribute('download', `elder-salviejo-polaroid-${activeLightboxIndex + 1}.jpg`);
  }
  if (indexEl) indexEl.textContent = activeLightboxIndex + 1;
  if (totalEl) totalEl.textContent = galleryPhotos.length;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Smooth fade-in
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
  if (!galleryPhotos || galleryPhotos.length === 0) return;

  activeLightboxIndex = (activeLightboxIndex + direction + galleryPhotos.length) % galleryPhotos.length;
  
  const img = document.getElementById('lightboxImg');
  const downloadBtn = document.getElementById('lightboxDownloadBtn');
  const indexEl = document.getElementById('lightboxIndex');

  const photo = galleryPhotos[activeLightboxIndex];
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

  // Touch Swipe for Mobile Navigation
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
      // Swiped right -> go to previous
      navigateLightbox(-1);
    } else {
      // Swiped left -> go to next
      navigateLightbox(1);
    }
  }
}
