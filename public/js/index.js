/**
 * Elder Salviejo • Weekly Missionary Journal Vault
 * Index Client Application - Letter Fetching, Search, Subscription & Anti-Save
 */

let allWeeks = [];

// Apply global anti-save & anti-drag listeners
function setupImageProtection() {
  document.addEventListener('contextmenu', function (e) {
    if (e.target && e.target.nodeName === 'IMG') {
      e.preventDefault();
      return false;
    }
  }, false);

  document.addEventListener('dragstart', function (e) {
    if (e.target && e.target.nodeName === 'IMG') {
      e.preventDefault();
      return false;
    }
  }, false);
}

// Fetch all archived missionary letters from the vault API
async function fetchWeeks() {
  const container = document.getElementById('weeksList');
  if (!container) return;

  container.innerHTML = `
    <div class="py-16 text-center text-stone-500">
      <svg class="animate-spin h-8 w-8 mx-auto mb-3 text-amber-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      <p class="font-medium text-sm">Loading Elder Salviejo's missionary letters...</p>
    </div>
  `;

  try {
    const response = await fetch('/api/weeks');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    allWeeks = data.weeks || [];

    const countEl = document.getElementById('totalWeeksCount');
    if (countEl) countEl.innerText = allWeeks.length;

    renderWeeks(allWeeks);
  } catch (err) {
    console.warn('API error, attempting jsDelivr CDN index fallback:', err);
    try {
      const cdnUrl = 'https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/index.json';
      const cdnRes = await fetch(cdnUrl);
      if (cdnRes.ok) {
        const cdnWeeks = await cdnRes.json();
        allWeeks = Array.isArray(cdnWeeks) ? cdnWeeks : [];
        const countEl = document.getElementById('totalWeeksCount');
        if (countEl) countEl.innerText = allWeeks.length;
        renderWeeks(allWeeks);
        return;
      }
    } catch (_) {}

    console.error('Failed to load weeks:', err);
    container.innerHTML = `
      <div class="py-12 px-6 text-center">
        <span class="text-3xl">📭</span>
        <h3 class="font-serif font-bold text-stone-800 text-lg mt-2">No Letters Found</h3>
        <p class="text-sm text-stone-500 max-w-md mx-auto mt-1">
          Unable to load missionary letters at this time. Please check your connection or try again.
        </p>
        <div class="mt-5 flex justify-center gap-3">
          <button onclick="fetchWeeks()" class="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-lg shadow-sm">
            Try Again
          </button>
        </div>
      </div>
    `;
  }
}

// Render the letters feed with dual-layout (Desktop table row & Mobile card) for zero overlap
function renderWeeks(weeks) {
  const container = document.getElementById('weeksList');
  const countEl = document.getElementById('displayedCount');
  if (countEl) countEl.innerText = weeks.length;
  if (!container) return;

  if (weeks.length === 0) {
    container.innerHTML = `
      <div class="py-14 px-6 text-center">
        <span class="text-3xl">🌴</span>
        <h3 class="font-serif font-bold text-stone-800 text-lg mt-2">The Missionary Vault is Ready</h3>
        <p class="text-sm text-stone-500 max-w-md mx-auto mt-1.5 leading-relaxed">
          No weekly emails have been ingested yet. When Elder Salviejo sends his Monday P-Day email with daily routine photos, it will automatically appear here!
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = weeks.map((w, index) => {
    const pubDate = new Date(w.publishedAt || w.createdAt || Date.now());
    const formattedDate = pubDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const targetUrl = `/week/${encodeURIComponent(w.slug || w.id)}`;
    const titleText = escapeHtml(w.title || 'Weekly Missionary Journal');
    const snippetText = escapeHtml(w.snippet || 'Click to read daily routine reflections and view Polaroid missionary photos...');
    const scriptureText = w.verse && w.verse.reference ? `📖 ${escapeHtml(w.verse.reference)}` : 'Philippines Dumaguete Mission';

    return `
      <a href="${targetUrl}" class="inbox-card-row group">
        
        <!-- Desktop Layout (Table Grid) -->
        <div class="inbox-desktop-row">
          <!-- 1. Photo Count Badge -->
          <div class="flex items-center justify-center">
            <span class="w-8 h-8 rounded-full bg-amber-100 group-hover:bg-amber-200 text-amber-900 flex items-center justify-center text-xs font-bold transition">
              📸 ${w.imageCount || 7}
            </span>
          </div>

          <!-- 2. Title & Subject -->
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="font-semibold text-stone-900 text-sm group-hover:text-amber-800 transition truncate">
                ${titleText}
              </h3>
              ${index === 0 ? '<span class="shrink-0 text-[10px] uppercase font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-300">Latest</span>' : ''}
            </div>
            <p class="text-xs text-stone-500 mt-0.5 truncate">
              Elder Salviejo • <span class="text-amber-800 font-medium">${scriptureText}</span>
            </p>
          </div>

          <!-- 3. Missionary Snippet -->
          <div class="text-xs text-stone-600 line-clamp-2 pr-3">
            ${snippetText}
          </div>

          <!-- 4. Date Sent -->
          <div class="text-xs text-stone-500 font-medium whitespace-nowrap">
            ${formattedDate}
          </div>

          <!-- 5. Thumbnail & Arrow -->
          <div class="flex items-center justify-end gap-2">
            ${w.previewImage ? `
              <div class="w-9 h-9 rounded border border-stone-200 shadow-sm overflow-hidden bg-stone-100 shrink-0 transform -rotate-3 group-hover:rotate-0 transition">
                <img src="${w.previewImage}" alt="Preview" class="w-full h-full object-cover" loading="lazy" />
              </div>
            ` : `
              <span class="text-xs text-stone-400">📸 ${w.imageCount || 7}</span>
            `}
            <span class="text-stone-400 group-hover:text-amber-700 group-hover:translate-x-0.5 transition font-bold">
              &rarr;
            </span>
          </div>
        </div>

        <!-- Mobile Layout (Clean Responsive Card) -->
        <div class="inbox-mobile-row">
          <div class="flex items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full text-[11px]">
                📸 ${w.imageCount || 7} photos
              </span>
              ${index === 0 ? '<span class="text-[10px] uppercase font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">Latest</span>' : ''}
            </div>
            <span class="text-stone-500 font-medium text-[11px]">${formattedDate}</span>
          </div>

          <div class="flex items-start justify-between gap-3 mt-1">
            <div class="min-w-0 flex-1">
              <h3 class="font-bold text-stone-900 text-sm group-hover:text-amber-800 transition line-clamp-1">
                ${titleText}
              </h3>
              <p class="text-xs text-amber-800 font-medium mt-0.5 truncate">
                ${scriptureText}
              </p>
              <p class="text-xs text-stone-600 mt-1 line-clamp-2 leading-relaxed">
                ${snippetText}
              </p>
            </div>

            ${w.previewImage ? `
              <div class="w-14 h-14 rounded-lg border border-stone-200 shadow-sm overflow-hidden bg-stone-100 shrink-0">
                <img src="${w.previewImage}" alt="Preview" class="w-full h-full object-cover" loading="lazy" />
              </div>
            ` : ''}
          </div>
        </div>

      </a>
    `;
  }).join('');
}

// Client-side search filter
function filterWeeks() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  const q = input.value.toLowerCase().trim();

  if (!q) {
    renderWeeks(allWeeks);
    return;
  }

  const filtered = allWeeks.filter(w => {
    return (w.title && w.title.toLowerCase().includes(q)) ||
           (w.snippet && w.snippet.toLowerCase().includes(q)) ||
           (w.rawSubject && w.rawSubject.toLowerCase().includes(q)) ||
           (w.publishedAt && w.publishedAt.toLowerCase().includes(q)) ||
           (w.verse && w.verse.reference && w.verse.reference.toLowerCase().includes(q)) ||
           (w.verse && w.verse.text && w.verse.text.toLowerCase().includes(q));
  });

  renderWeeks(filtered);
}

// Subscribe email submission
async function handleSubscribe(e) {
  e.preventDefault();
  const input = document.getElementById('subscribeEmailInput');
  const btn = document.getElementById('subscribeSubmitBtn');
  const feedback = document.getElementById('subscribeFeedback');
  if (!input || !btn || !feedback) return;

  const email = input.value.trim();
  if (!email) return;

  btn.disabled = true;
  btn.innerText = 'Subscribing...';
  feedback.className = 'text-[11px] mt-1.5 block text-stone-500 font-medium';
  feedback.innerText = 'Saving email to vault...';

  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      feedback.className = 'text-[11px] mt-1.5 block text-emerald-700 font-medium';
      feedback.innerText = "✅ Subscribed! You'll receive email updates whenever Elder Salviejo publishes a new weekly missionary journal.";
      input.value = '';
    } else {
      feedback.className = 'text-[11px] mt-1.5 block text-rose-600 font-medium';
      feedback.innerText = '⚠️ ' + (data.error || 'Failed to subscribe. Please try again.');
    }
  } catch (err) {
    feedback.className = 'text-[11px] mt-1.5 block text-rose-600 font-medium';
    feedback.innerText = '⚠️ Network error: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Subscribe</span> <span class="text-amber-400">&rarr;</span>';
  }
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

// ==========================================================================
// Collapsible Mission Call Accordion Handler
// ==========================================================================
function toggleMissionCallStory() {
  const body = document.getElementById('missionCallBody');
  const btnText = document.getElementById('missionCallToggleText');
  const btnIcon = document.getElementById('missionCallToggleIcon');
  const heroBtn = document.getElementById('heroToggleText');
  if (!body) return;

  const isHidden = body.classList.contains('hidden');
  if (isHidden) {
    body.classList.remove('hidden');
    if (btnText) btnText.innerText = 'Collapse Story';
    if (btnIcon) btnIcon.innerText = '▲';
    if (heroBtn) heroBtn.innerText = 'Hide Story';
    const section = document.getElementById('mission-call');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    body.classList.add('hidden');
    if (btnText) btnText.innerText = 'Read Story & Photos';
    if (btnIcon) btnIcon.innerText = '▼';
    if (heroBtn) heroBtn.innerText = 'Preview Story';
  }
}

// ==========================================================================
// Introduction & Mission Call Lightbox Gallery
// ==========================================================================
const INTRO_GALLERY = [
  {
    src: '/assets/images/intro/call-letter.jpg',
    fallback: 'https://i.ibb.co/HWRwq7L/Mark-Salviejo-Mission-Call-Letter-page-0001.jpg',
    title: 'Official Mission Call Letter',
    caption: 'Office of the First Presidency • Signed by President Dallin H. Oaks. Elder Mark Allen Bongolan Salviejo called to the Philippines Dumaguete Mission.'
  },
  {
    src: '/assets/images/intro/call-overview.jpg',
    fallback: 'https://i.ibb.co/mCqcbT3D/overview-2246341-page-0001.jpg',
    title: 'Philippines Dumaguete Mission Field Map',
    caption: 'Official mission boundaries covering Negros Oriental, Siquijor Island, and Visayan areas.'
  },
  {
    src: '/assets/images/intro/photo-2.jpg',
    fallback: 'https://i.ibb.co/bMqVVZqL/received-1778183986537355.jpg',
    title: 'Holding the Official Call Letter',
    caption: 'Elder Mark Salviejo outside the chapel of The Church of Jesus Christ of Latter-day Saints with his mission call letter.'
  },
  {
    src: '/assets/images/intro/photo-1.jpg',
    fallback: 'https://i.ibb.co/7JShV8Cy/received-1420724736611243.jpg',
    title: 'Spire of Faith',
    caption: 'Elder Salviejo outside the church meetinghouse beneath the chapel spire.'
  },
  {
    src: '/assets/images/intro/photo-3.jpg',
    fallback: 'https://i.ibb.co/n8M8VDR8/received-4536366903287651.jpg',
    title: 'Rejoicing in the Gospel',
    caption: 'Celebrating the mission call announcement with brother and district friends.'
  },
  {
    src: '/assets/images/intro/photo-4.jpg',
    fallback: 'https://i.ibb.co/rKPvxrBH/Messenger-creation-2242403789659455.jpg',
    title: 'YSA District Family',
    caption: 'The young single adults district group outside the chapel meetinghouse.'
  },
  {
    src: '/assets/images/intro/photo-5.jpg',
    fallback: 'https://i.ibb.co/5gwwKS9q/IMG-20260906-120706.jpg',
    title: 'Gathered by the Savior',
    caption: 'Gathered together inside the chapel hall next to the painting of Jesus Christ.'
  }
];

let currentIntroModalIndex = 0;

function openIntroModal(index) {
  if (index < 0 || index >= INTRO_GALLERY.length) return;
  currentIntroModalIndex = index;
  updateIntroModalContent();
  const modal = document.getElementById('introModal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closeIntroModal() {
  const modal = document.getElementById('introModal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function navigateIntroModal(dir) {
  currentIntroModalIndex = (currentIntroModalIndex + dir + INTRO_GALLERY.length) % INTRO_GALLERY.length;
  updateIntroModalContent();
}

function handleIntroModalBackdrop(e) {
  if (e.target && e.target.id === 'introModal') {
    closeIntroModal();
  }
}

function updateIntroModalContent() {
  const item = INTRO_GALLERY[currentIntroModalIndex];
  if (!item) return;

  const imgEl = document.getElementById('introModalImg');
  const titleEl = document.getElementById('introModalTitle');
  const captionEl = document.getElementById('introModalCaption');
  const indexEl = document.getElementById('introModalIndex');

  if (imgEl) {
    imgEl.src = item.src;
    imgEl.alt = item.title;
    imgEl.onerror = () => { imgEl.src = item.fallback; };
  }
  if (titleEl) titleEl.innerText = item.title;
  if (captionEl) captionEl.innerText = item.caption;
  if (indexEl) indexEl.innerText = `${currentIntroModalIndex + 1} / ${INTRO_GALLERY.length}`;
}

window.addEventListener('keydown', (e) => {
  const modal = document.getElementById('introModal');
  if (modal && !modal.classList.contains('hidden')) {
    if (e.key === 'Escape') closeIntroModal();
    if (e.key === 'ArrowLeft') navigateIntroModal(-1);
    if (e.key === 'ArrowRight') navigateIntroModal(1);
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupImageProtection();
  fetchWeeks();
});
