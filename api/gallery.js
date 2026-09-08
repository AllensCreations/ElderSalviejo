/**
 * Vercel Serverless Function: GET /api/gallery
 * 
 * Fetches all Polaroid photos for the dedicated image-only gallery.
 * Aggregates direct gallery uploads, photos from weekly journals,
 * and mission starter photos.
 */

const { getAllGalleryPhotos, initDatabase } = require('../lib/turso');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    await initDatabase();
    let photos = await getAllGalleryPhotos();

    // If local/Turso has no photos, check the dedicated jsDelivr gallery index as a fallback
    if (!photos || photos.length === 0) {
      try {
        const cdnRes = await fetch('https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/index.json', {
          headers: { 'User-Agent': 'ElderSalviejo-Vault/1.0' },
          signal: AbortSignal.timeout(2500)
        });
        if (cdnRes.ok) {
          const cdnData = await cdnRes.json();
          if (Array.isArray(cdnData) && cdnData.length > 0) {
            photos = cdnData.map(item => {
              const isGallery = item.source === '073000' || item.source === 'gallery' || Boolean(item.isGalleryUpload);
              return {
                id: item.id || `cdn-${item.filename}`,
                src: item.src || item.cdnUrl,
                date: item.uploadedAt,
                category: item.category || (isGallery ? 'Mission' : 'P-Day Journal'),
                isGalleryUpload: isGallery,
                source: isGallery ? 'gallery' : 'journal'
              };
            });
          }
        }
      } catch (_) {}
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      success: true,
      count: photos.length,
      photos,
      jsdelivr: {
        folder: 'https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/',
        index: 'https://cdn.jsdelivr.net/gh/AllensCreations/gmail-diary-vault@main/vault/gallery/index.json'
      }
    });
  } catch (error) {
    console.error('Error fetching gallery photos:', error);
    return res.status(500).json({
      error: 'Internal Server Error fetching gallery photos',
      details: error.message
    });
  }
};
