/**
 * Vercel Serverless Function: GET /api/gallery
 * 
 * Fetches all Polaroid photos for the dedicated image-only gallery.
 * Aggregates direct gallery uploads (passcode 073000), photos from weekly journals
 * (passcode 159266), and mission starter photos.
 */

const { getAllGalleryPhotos, initDatabase } = require('../lib/turso');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    await initDatabase();
    const photos = await getAllGalleryPhotos();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      success: true,
      count: photos.length,
      photos
    });
  } catch (error) {
    console.error('❌ Error fetching gallery photos:', error);
    return res.status(500).json({
      error: 'Internal Server Error fetching gallery photos',
      details: error.message
    });
  }
};
