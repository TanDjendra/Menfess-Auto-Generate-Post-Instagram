const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

require('dotenv').config();

const firebase = require('./config/firebase');
const { startListener, getStats, QUEUE_PATH, processPendingQueue } = require('./queueListener');
const { renderCardBuffer, renderGifBuffer, cleanupTemp, CONFIG } = require('./services/imageProcessor');
const { THEMES } = require('./services/themes');
const { verifyCredentials, isConfigured } = require('./services/instagramService');
const mediaStore = require('./services/mediaStore');

console.log('====================================================');
console.log('   Auto-Menfess Instagram - 24/7 service starting   ');
console.log('====================================================');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const MAX_TEXT_LENGTH = Math.max(50, parseInt(process.env.MAX_TEXT_LENGTH, 10) || 300);
const MAX_BODY_BYTES = 16 * 1024;
const SUBMIT_COOLDOWN_MS = Math.max(0, parseInt(process.env.SUBMIT_COOLDOWN_MS, 10) || 60 * 1000);
const PREVIEW_COOLDOWN_MS = Math.max(0, parseInt(process.env.PREVIEW_COOLDOWN_MS, 10) || 2500);
const MAX_CONCURRENT_PREVIEWS = 2;

for (const dir of [
  path.join(process.cwd(), 'temp'),
  path.join(process.cwd(), 'assets'),
  path.join(process.cwd(), 'assets', 'fonts'),
  mediaStore.MEDIA_DIR
]) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[Startup] Created directory: ${dir}`);
    }
  } catch (e) {
    console.warn(`[Startup] Warning: Could not create directory ${dir}: ${e.message}`);
  }
}

const HTML_PATH = path.join(__dirname, 'public', 'index.html');
function readForm() {
  try {
    return fs.readFileSync(HTML_PATH, 'utf8');
  } catch (error) {
    console.error(`[Startup] Could not read ${HTML_PATH}: ${error.message}`);
    return '<h1>Form sedang offline.</h1>';
  }
}
let htmlContent = readForm();

/* ------------------------------------------------------------------ *
 * rate limiting
 * ------------------------------------------------------------------ */

const cooldowns = { submit: new Map(), preview: new Map() };
let previewsInFlight = 0;

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/** @returns {number} remaining cooldown in ms (0 when allowed) */
function checkCooldown(kind, ip, windowMs) {
  if (windowMs <= 0) return 0;
  const last = cooldowns[kind].get(ip);
  if (!last) return 0;
  const elapsed = Date.now() - last;
  return elapsed >= windowMs ? 0 : windowMs - elapsed;
}

function markCooldown(kind, ip) {
  cooldowns[kind].set(ip, Date.now());
}

// Keep the maps from growing forever on a long-running instance.
setInterval(() => {
  const cutoff = Date.now() - Math.max(SUBMIT_COOLDOWN_MS, PREVIEW_COOLDOWN_MS) * 4;
  for (const map of Object.values(cooldowns)) {
    for (const [ip, stamp] of map) if (stamp < cutoff) map.delete(ip);
  }
}, 10 * 60 * 1000).unref();

// Housekeeping: drop stale renders so the disk does not fill up.
setInterval(() => {
  cleanupTemp();
  mediaStore.prune();
}, 30 * 60 * 1000).unref();

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function validateText(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return { error: 'Pesan menfess tidak boleh kosong.' };
  if (text.length > MAX_TEXT_LENGTH) {
    return { error: `Pesan terlalu panjang (maksimal ${MAX_TEXT_LENGTH} karakter).` };
  }
  return { text };
}

/* ------------------------------------------------------------------ *
 * routes
 * ------------------------------------------------------------------ */

async function handleSubmit(req, res) {
  const ip = clientIp(req);
  const wait = checkCooldown('submit', ip, SUBMIT_COOLDOWN_MS);
  if (wait > 0) {
    return sendJson(res, 429, {
      error: `Harap tunggu ${Math.ceil(wait / 1000)} detik sebelum mengirim menfess baru.`
    });
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    const tooLarge = error.message === 'PAYLOAD_TOO_LARGE';
    return sendJson(res, tooLarge ? 413 : 400, {
      error: tooLarge ? 'Data terlalu besar.' : 'Format data tidak valid.'
    });
  }

  const { text, error } = validateText(payload.text);
  if (error) return sendJson(res, 400, { error });

  if (!firebase.isReady()) {
    return sendJson(res, 503, { error: 'Database belum siap. Coba lagi nanti ya.' });
  }

  try {
    const ref = firebase.db.ref(QUEUE_PATH).push();
    await ref.set({
      text,
      posted: false,
      status: 'queued',
      createdAt: Date.now()
    });

    markCooldown('submit', ip);
    console.log(`[Server] New menfess queued from ${ip}. Key: ${ref.key}`);

    // Immediately trigger processing for serverless environments (Vercel)
    processPendingQueue().catch(err => console.error('[Server] Immediate queue processing error:', err.message));

    return sendJson(res, 200, { success: true, id: ref.key });
  } catch (err) {
    console.error('[Server] Submission failed:', err);
    return sendJson(res, 500, { error: 'Gagal mengirim menfess. Terjadi kesalahan pada server.' });
  }
}

/** Live render of the card so users can see it before submitting. */
async function handlePreview(req, res, url) {
  const ip = clientIp(req);
  const wait = checkCooldown('preview', ip, PREVIEW_COOLDOWN_MS);
  if (wait > 0) {
    return sendJson(res, 429, { error: `Sabar dulu ${Math.ceil(wait / 1000)}s, preview-nya lagi digambar…` });
  }
  if (previewsInFlight >= MAX_CONCURRENT_PREVIEWS) {
    return sendJson(res, 503, { error: 'Server sedang sibuk menggambar. Coba sebentar lagi.' });
  }

  let text = url.searchParams.get('text');
  if (req.method === 'POST') {
    try {
      text = JSON.parse(await readBody(req) || '{}').text;
    } catch (error) {
      return sendJson(res, 400, { error: 'Format data tidak valid.' });
    }
  }

  const validated = validateText(text);
  if (validated.error) return sendJson(res, 400, { error: validated.error });

  const wantsGif = url.searchParams.get('format') === 'gif';
  const theme = url.searchParams.get('theme');
  const seed = url.searchParams.get('seed') || `preview_${Date.now()}`;

  previewsInFlight++;
  markCooldown('preview', ip);

  try {
    const options = { theme: theme || undefined };
    const { buffer } = wantsGif
      ? renderGifBuffer(validated.text, seed, { ...options, size: 400, frames: 16 })
      : renderCardBuffer(validated.text, seed, { ...options, size: 720 });

    res.writeHead(200, {
      'Content-Type': wantsGif ? 'image/gif' : 'image/png',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store'
    });
    res.end(buffer);
  } catch (error) {
    console.error(`[Server] Preview render failed: ${error.message}`);
    sendJson(res, 500, { error: 'Gagal menggambar preview.' });
  } finally {
    previewsInFlight--;
  }
}

function handleMedia(res, fileName) {
  const filePath = mediaStore.resolveSafe(fileName);
  if (!filePath) {
    return sendJson(res, 404, { error: 'Media tidak ditemukan.' });
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = ext === '.gif' ? 'image/gif' : (ext === '.png' ? 'image/png' : 'image/jpeg');
  const stat = fs.statSync(filePath);

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=3600'
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleStatus(res) {
  const ig = isConfigured() ? await verifyCredentials() : { ok: false, error: 'not configured' };

  sendJson(res, 200, {
    status: 'UP',
    uptime: `${Math.round(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    firebase: firebase.isReady(),
    firebaseDebug: {
      hasDbUrl: !!process.env.FIREBASE_DATABASE_URL,
      dbUrlValue: process.env.FIREBASE_DATABASE_URL ? (process.env.FIREBASE_DATABASE_URL.slice(0, 25) + '...') : 'NONE',
      hasCredentials: !!process.env.FIREBASE_CREDENTIALS,
      credentialsLength: (process.env.FIREBASE_CREDENTIALS || '').length,
      credentialsStartsWithBrace: (process.env.FIREBASE_CREDENTIALS || '').trim().startsWith('{'),
      initError: firebase.getInitError ? firebase.getInitError() : null
    },
    instagram: ig.ok ? { connected: true, username: ig.username } : { connected: false, reason: ig.error },
    dryRun: process.env.DRY_RUN === 'true',
    render: {
      cardSize: CONFIG.imageSize,
      gif: CONFIG.gifEnabled ? `${CONFIG.gifFrames} frames @ ${CONFIG.gifSize}px` : 'disabled'
    },
    queue: getStats()
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && route === '/') {
    if (process.env.NODE_ENV !== 'production') htmlContent = readForm();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(htmlContent);
  }

  if (req.method === 'GET' && route === '/health') {
    return sendJson(res, 200, { status: 'UP', uptime: `${Math.round(process.uptime())}s` });
  }

  if (req.method === 'GET' && (route === '/status' || route === '/api/status')) {
    return handleStatus(res).catch(err => sendJson(res, 500, { error: err.message }));
  }

  if ((req.method === 'GET' || req.method === 'POST') && (route === '/api/cron' || route === '/api/process-queue')) {
    return processPendingQueue()
      .then(count => sendJson(res, 200, { success: true, processed: count }))
      .catch(err => sendJson(res, 500, { error: err.message }));
  }

  if (req.method === 'POST' && route === '/submit') {
    return handleSubmit(req, res);
  }

  if ((req.method === 'GET' || req.method === 'POST') && (route === '/preview' || route === '/api/preview')) {
    return handlePreview(req, res, url);
  }

  if (req.method === 'GET' && (route === '/api/gallery' || route === '/gallery.json')) {
    return sendJson(res, 200, { items: mediaStore.listRecent(12) });
  }

  if (req.method === 'GET' && route === '/api/themes') {
    return sendJson(res, 200, { themes: THEMES.map(t => ({ name: t.name, accent: t.accent, bg: t.bgTop })) });
  }

  if (req.method === 'GET' && route.startsWith('/media/')) {
    return handleMedia(res, decodeURIComponent(route.slice('/media/'.length)));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[Startup] Web server listening on http://localhost:${PORT}`);
    if (!mediaStore.baseUrl()) {
      console.log('[Startup] Tip: set PUBLIC_BASE_URL so Instagram can pull images from this service directly.');
    }
  });

  try {
    startListener();
  } catch (error) {
    console.error(`[Startup] Queue listener failed to start: ${error.message}`);
  }
}

module.exports = server;

// A crashed background daemon is worse than a logged error: keep running.
process.on('uncaughtException', error => {
  console.error(`[CRITICAL] Uncaught exception at ${new Date().toISOString()}:`, error);
});

process.on('unhandledRejection', reason => {
  console.error('[CRITICAL] Unhandled rejection:', reason);
});

process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM received, closing server…');
  server.close(() => process.exit(0));
});
