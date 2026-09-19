/**
 * Script to optimize and generate high-performance favicons & icons
 * Converts bloated 270KB ICO into sharp, lightweight multi-resolution icons & SVGs
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (-(c & 1) & 0xedb88320);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  const toCrc = Buffer.concat([t, data]);
  crc.writeUInt32BE(crc32(toCrc));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idatData = zlib.deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function resizeRgba(srcRgba, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const syStart = Math.floor(dy * yRatio);
    const syEnd = Math.min(Math.floor((dy + 1) * yRatio), srcH);
    for (let dx = 0; dx < dstW; dx++) {
      const sxStart = Math.floor(dx * xRatio);
      const sxEnd = Math.min(Math.floor((dx + 1) * xRatio), srcW);

      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let sy = syStart; sy < syEnd; sy++) {
        for (let sx = sxStart; sx < sxEnd; sx++) {
          const idx = (sy * srcW + sx) * 4;
          const alpha = srcRgba[idx + 3] / 255;
          r += srcRgba[idx] * alpha;
          g += srcRgba[idx + 1] * alpha;
          b += srcRgba[idx + 2] * alpha;
          a += srcRgba[idx + 3];
          count++;
        }
      }
      const dstIdx = (dy * dstW + dx) * 4;
      if (count > 0 && a > 0) {
        const avgAlpha = a / count;
        dst[dstIdx] = Math.round(r / (avgAlpha * count / 255));
        dst[dstIdx + 1] = Math.round(g / (avgAlpha * count / 255));
        dst[dstIdx + 2] = Math.round(b / (avgAlpha * count / 255));
        dst[dstIdx + 3] = Math.round(avgAlpha);
      } else {
        dst[dstIdx] = 0;
        dst[dstIdx + 1] = 0;
        dst[dstIdx + 2] = 0;
        dst[dstIdx + 3] = 0;
      }
    }
  }
  return dst;
}

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let currOffset = 6 + images.length * 16;
  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry[0] = img.w >= 256 ? 0 : img.w;
    entry[1] = img.h >= 256 ? 0 : img.h;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(currOffset, 12);
    entries.push(entry);
    currOffset += img.data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map(i => i.data)]);
}

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const origIcoPath = path.join(PUBLIC_DIR, 'Icon.ico');
const icoBuf = fs.readFileSync(origIcoPath);

const pixelsOffset = 22 + 40;
const rawPixels = icoBuf.slice(pixelsOffset, pixelsOffset + 256 * 256 * 4);
const rgba256 = Buffer.alloc(256 * 256 * 4);
for (let y = 0; y < 256; y++) {
  const srcY = 255 - y;
  for (let x = 0; x < 256; x++) {
    const srcIdx = (srcY * 256 + x) * 4;
    const dstIdx = (y * 256 + x) * 4;
    rgba256[dstIdx] = rawPixels[srcIdx + 2];
    rgba256[dstIdx + 1] = rawPixels[srcIdx + 1];
    rgba256[dstIdx + 2] = rawPixels[srcIdx];
    rgba256[dstIdx + 3] = rawPixels[srcIdx + 3];
  }
}

const png48 = encodePng(48, 48, resizeRgba(rgba256, 256, 256, 48, 48));
const png32 = encodePng(32, 32, resizeRgba(rgba256, 256, 256, 32, 32));
const png16 = encodePng(16, 16, resizeRgba(rgba256, 256, 256, 16, 16));

const newIco = buildIco([
  { w: 16, h: 16, data: png16 },
  { w: 32, h: 32, data: png32 },
  { w: 48, h: 48, data: png48 }
]);

// Write optimized favicons
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), newIco);
fs.writeFileSync(path.join(PUBLIC_DIR, 'Icon.ico'), newIco);
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon-32x32.png'), png32);
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon-16x16.png'), png16);

// Modern SVG favicon (archival missionary seal)
const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#991b1b"/>
      <stop offset="100%" stop-color="#7f1d1d"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <rect x="4" y="4" width="56" height="56" rx="11" fill="none" stroke="#fca5a5" stroke-width="1.5" stroke-opacity="0.3"/>
  <!-- Archival Monogram ES / Cross & Seal -->
  <path d="M22 20h20v4.5H27v7h13v4.5H27v7.5h15.5V50H22V20z" fill="#ffffff" font-weight="bold"/>
  <circle cx="47" cy="46.5" r="3.5" fill="#fef08a"/>
</svg>`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), svgFavicon, 'utf8');

console.log('Favicon optimization complete:');
console.log(`- favicon.ico: ${newIco.length} bytes (was 270,398 bytes)`);
console.log(`- Icon.ico: ${newIco.length} bytes`);
console.log(`- favicon-32x32.png: ${png32.length} bytes`);
console.log(`- favicon-16x16.png: ${png16.length} bytes`);
console.log(`- favicon.svg: ${Buffer.byteLength(svgFavicon, 'utf8')} bytes`);
