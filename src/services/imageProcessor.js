const { createCanvas } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const fs = require('fs');
const path = require('path');

const { initFonts } = require('./fonts');
const { DESIGN, buildLayout, renderScene } = require('./cardRenderer');

require('dotenv').config();

const TEMP_DIR = path.join(process.cwd(), 'temp');
const ASSETS_DIR = path.join(process.cwd(), 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');
const TEMPLATE_PATH = path.join(ASSETS_DIR, 'template.png');

for (const dir of [TEMP_DIR, ASSETS_DIR, FONTS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

initFonts();

if (fs.existsSync(TEMPLATE_PATH)) {
  console.log('[ImageProcessor] Note: assets/template.png is no longer used; cards are drawn procedurally.');
}

const CONFIG = {
  imageSize: clampInt(process.env.CARD_SIZE, 1080, 540, 1440),
  gifEnabled: process.env.GIF_ENABLED !== 'false',
  gifSize: clampInt(process.env.GIF_SIZE, 480, 240, 720),
  gifFrames: clampInt(process.env.GIF_FRAMES, 20, 6, 60),
  gifDelay: clampInt(process.env.GIF_DELAY, 80, 40, 400),
  gifColors: clampInt(process.env.GIF_COLORS, 200, 32, 256),
  brand: process.env.BRAND_TITLE || 'Menfess',
  handle: process.env.IG_HANDLE || '',
  tagline: process.env.BRAND_TAGLINE || 'kirim rahasiamu, tetap anonim',
  theme: process.env.CARD_THEME || null,
  mascot: process.env.CARD_MASCOT === 'true'
};

function clampInt(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Creates a canvas + context already scaled from design space to `size`. */
function createScaledCanvas(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const scale = size / DESIGN;
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

function layoutFor(text, postId, overrides = {}) {
  return buildLayout(text, {
    postId,
    brand: overrides.brand || CONFIG.brand,
    handle: overrides.handle !== undefined ? overrides.handle : CONFIG.handle,
    tagline: overrides.tagline || CONFIG.tagline,
    theme: overrides.theme || CONFIG.theme,
    mascot: overrides.mascot !== undefined ? overrides.mascot : CONFIG.mascot
  });
}

/**
 * Renders the static card as a PNG buffer.
 * @param {string} text
 * @param {string} postId
 * @param {object} [options] - { size, theme, handle, brand, tagline, layout }
 * @returns {{buffer: Buffer, layout: object}}
 */
function renderCardBuffer(text, postId, options = {}) {
  const size = clampInt(options.size, CONFIG.imageSize, 320, 2160);
  const layout = options.layout || layoutFor(text, postId, options);
  const { canvas, ctx } = createScaledCanvas(size);

  renderScene(ctx, layout, 0);

  const buffer = options.format === 'jpeg'
    ? canvas.toBuffer('image/jpeg', 92)
    : canvas.toBuffer('image/png');

  return { buffer, layout };
}

/**
 * Renders the animated version of the same card as a GIF buffer.
 * Every motion is periodic so the loop is seamless.
 * @param {string} text
 * @param {string} postId
 * @param {object} [options] - { size, frames, delay, colors, layout, theme }
 */
function renderGifBuffer(text, postId, options = {}) {
  const size = clampInt(options.size, CONFIG.gifSize, 160, 1080);
  const frames = clampInt(options.frames, CONFIG.gifFrames, 4, 60);
  const delay = clampInt(options.delay, CONFIG.gifDelay, 20, 1000);
  const colors = clampInt(options.colors, CONFIG.gifColors, 16, 256);

  const layout = options.layout || layoutFor(text, postId, options);
  const { canvas, ctx } = createScaledCanvas(size);
  const encoder = GIFEncoder();

  // First pass: render every frame and keep the raw pixels.
  const framePixels = [];
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.restore();
    renderScene(ctx, layout, t);
    framePixels.push(Uint8ClampedArray.from(ctx.getImageData(0, 0, size, size).data));
  }

  // One shared palette built from a subsample of a few frames keeps the file
  // small and avoids colour flicker between frames.
  const sampleIndexes = [0, Math.floor(frames / 3), Math.floor((frames * 2) / 3)];
  const samples = [];
  for (const index of sampleIndexes) {
    const data = framePixels[index];
    for (let p = 0; p < data.length; p += 4 * 3) {
      samples.push(data[p], data[p + 1], data[p + 2], data[p + 3]);
    }
  }
  const palette = quantize(new Uint8ClampedArray(samples), colors, { format: 'rgb565' });

  framePixels.forEach((data, i) => {
    const indexed = applyPalette(data, palette, 'rgb565');
    encoder.writeFrame(indexed, size, size, {
      palette,
      delay,
      repeat: 0,
      first: i === 0
    });
  });

  encoder.finish();
  return { buffer: Buffer.from(encoder.bytesView()), layout, frames, size, delay };
}

function uniqueName(prefix, postId, ext) {
  const safeId = String(postId || 'menfess').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'menfess';
  return `${prefix}_${safeId}_${Date.now()}.${ext}`;
}

/**
 * Generates the static menfess card and writes it to /temp.
 * Kept for backwards compatibility with the original API.
 * @param {string} text
 * @param {string} postId
 * @param {object} [options]
 * @returns {Promise<string>} path to the PNG
 */
async function generateMenfessImage(text, postId, options = {}) {
  const { buffer, layout } = renderCardBuffer(text, postId, options);
  const outputPath = path.join(options.outDir || TEMP_DIR, uniqueName('menfess', postId, 'png'));

  fs.writeFileSync(outputPath, buffer);
  console.log(
    `[ImageProcessor] Card rendered (${layout.style.theme.name} / ${layout.style.mascot}, ` +
    `${(buffer.length / 1024).toFixed(0)} KB) -> ${outputPath}`
  );
  return outputPath;
}

/**
 * Generates the animated GIF version and writes it to /temp.
 * @param {string} text
 * @param {string} postId
 * @param {object} [options] - pass { layout } to reuse the PNG layout
 * @returns {Promise<string|null>} path to the GIF, or null when disabled
 */
async function generateMenfessGif(text, postId, options = {}) {
  if (options.enabled === false || (!CONFIG.gifEnabled && options.enabled === undefined)) {
    return null;
  }

  const started = Date.now();
  const { buffer, frames, size } = renderGifBuffer(text, postId, options);
  const outputPath = path.join(options.outDir || TEMP_DIR, uniqueName('menfess', postId, 'gif'));

  fs.writeFileSync(outputPath, buffer);
  console.log(
    `[ImageProcessor] Animated GIF rendered (${frames} frames @ ${size}px, ` +
    `${(buffer.length / 1024).toFixed(0)} KB, ${Date.now() - started}ms) -> ${outputPath}`
  );
  return outputPath;
}

/**
 * Renders both the static card and the animated GIF from a single layout, so
 * they are guaranteed to be the same design.
 */
async function generateMenfessMedia(text, postId, options = {}) {
  const layout = layoutFor(text, postId, options);
  const imagePath = await generateMenfessImage(text, postId, { ...options, layout });
  let gifPath = null;

  try {
    gifPath = await generateMenfessGif(text, postId, { ...options, layout });
  } catch (err) {
    console.error(`[ImageProcessor] GIF rendering failed (continuing with PNG only): ${err.message}`);
  }

  return { imagePath, gifPath, layout };
}

/**
 * Deletes generated files in /temp older than maxAgeMs.
 * @param {number} [maxAgeMs] - default 6 hours
 */
function cleanupTemp(maxAgeMs = 6 * 60 * 60 * 1000) {
  if (!fs.existsSync(TEMP_DIR)) return 0;
  let removed = 0;

  for (const file of fs.readdirSync(TEMP_DIR)) {
    if (!/^menfess_.*\.(png|gif|jpg|jpeg|mp4)$/i.test(file)) continue;
    const full = path.join(TEMP_DIR, file);
    try {
      if (Date.now() - fs.statSync(full).mtimeMs > maxAgeMs) {
        fs.unlinkSync(full);
        removed++;
      }
    } catch (err) {
      console.warn(`[Cleanup] Could not inspect ${file}: ${err.message}`);
    }
  }

  if (removed) console.log(`[Cleanup] Removed ${removed} stale file(s) from temp/.`);
  return removed;
}

module.exports = {
  CONFIG,
  TEMP_DIR,
  generateMenfessImage,
  generateMenfessGif,
  generateMenfessMedia,
  renderCardBuffer,
  renderGifBuffer,
  cleanupTemp
};
