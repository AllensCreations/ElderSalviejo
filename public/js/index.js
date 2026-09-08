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

  // SWR: Instantly render cached letters if available (0ms perceived load)
  try {
    const cached = localStorage.getItem('gdv_cached_weeks');
    if (cached) {
      const cachedWeeks = JSON.parse(cached);
      if (Array.isArray(cachedWeeks) && cachedWeeks.length > 0 && allWeeks.length === 0) {
        allWeeks = cachedWeeks;
        const countEl = document.getElementById('totalWeeksCount');
        if (countEl) countEl.innerText = allWeeks.length;
        renderWeeks(allWeeks);
      }
    }
  } catch (_) {}

  // Only show the loading spinner if we had no cached letters to display
  if (allWeeks.length === 0) {
    container.innerHTML = `
      <div class="py-16 text-center text-stone-500">
        <svg class="animate-spin h-8 w-8 mx-auto mb-3 text-amber-600" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <p class="font-medium text-sm">Loading Elder Salviejo's missionary letters...</p>
      </div>
    `;
  }

  try {
    const response = await fetch('/api/weeks');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    allWeeks = data.weeks || [];

    try {
      localStorage.setItem('gdv_cached_weeks', JSON.stringify(allWeeks));
    } catch (_) {}

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
        <svg class="w-10 h-10 text-stone-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        <h3 class="font-serif font-bold text-stone-800 text-lg mt-2">No Letters Found</h3>
        <p class="text-sm text-stone-500 max-w-md mx-auto mt-1">
          Unable to load missionary letters at this time. Please check your connection or try again.
        </p>
        <div class="mt-5 flex justify-center gap-3">
          <button onclick="fetchWeeks()" class="px-5 py-2.5 bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg shadow-sm">
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
        <svg class="w-10 h-10 text-amber-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" /></svg>
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
    const scriptureText = w.verse && w.verse.reference ? escapeHtml(w.verse.reference) : 'Philippines Dumaguete Mission';

    return `
      <a href="${targetUrl}" class="inbox-card-row group">
        
        <!-- Desktop Layout (Table Grid) -->
        <div class="inbox-desktop-row">
          <!-- 1. Photo Count Badge -->
          <div class="flex items-center justify-center">
            <span class="w-8 h-8 rounded-full bg-amber-100 group-hover:bg-amber-200 text-amber-900 flex items-center justify-center text-xs font-bold transition">
              ${w.imageCount || 7}
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
              <span class="text-xs text-stone-400">${w.imageCount || 7} photos</span>
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
                ${w.imageCount || 7} photos
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
      feedback.innerText = "Subscribed! You'll receive email updates whenever Elder Salviejo publishes a new weekly missionary journal.";
      input.value = '';
    } else {
      feedback.className = 'text-[11px] mt-1.5 block text-rose-600 font-medium';
      feedback.innerText = (data.error || 'Failed to subscribe. Please try again.');
    }
  } catch (err) {
    feedback.className = 'text-[11px] mt-1.5 block text-rose-600 font-medium';
    feedback.innerText = 'Network error: ' + err.message;
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupImageProtection();
  fetchWeeks();
});

