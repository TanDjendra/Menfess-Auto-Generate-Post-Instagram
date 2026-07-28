/**
 * Keeps the rendered cards (PNG + animated GIF) in one folder that the web
 * server can expose, so the bot can:
 *   - hand Instagram a stable public URL of its own instead of a 3rd party host
 *   - show a gallery/preview page where the GIF can be downloaded for Stories
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

require('dotenv').config();

const MEDIA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'media')
  : path.join(process.cwd(), 'temp', 'media');

const FILE_PATTERN = /^menfess_([a-zA-Z0-9_-]+)_(\d+)\.(png|gif|jpg|jpeg)$/;

try {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
} catch (e) {
  console.warn(`[MediaStore] Could not create directory ${MEDIA_DIR}: ${e.message}`);
}

/** Public base URL of this service, e.g. https://menfess.onrender.com */
function baseUrl() {
  const raw = process.env.PUBLIC_BASE_URL || '';
  return raw.trim().replace(/\/+$/, '');
}

function publicUrlFor(fileName) {
  const base = baseUrl();
  return base ? `${base}/media/${encodeURIComponent(fileName)}` : null;
}

/**
 * Moves (or copies) a rendered file into the media folder.
 * @param {string} localPath
 * @param {object} [opts] - { keepOriginal: boolean }
 * @returns {{fileName: string, filePath: string, url: string|null}}
 */
function store(localPath, opts = {}) {
  const fileName = path.basename(localPath);
  const target = path.join(MEDIA_DIR, fileName);

  if (path.resolve(localPath) !== path.resolve(target)) {
    if (opts.keepOriginal) {
      fs.copyFileSync(localPath, target);
    } else {
      try {
        fs.renameSync(localPath, target);
      } catch (err) {
        // Cross-device rename can fail; fall back to copy + unlink.
        fs.copyFileSync(localPath, target);
        fs.unlinkSync(localPath);
      }
    }
  }

  return { fileName, filePath: target, url: publicUrlFor(fileName) };
}

/** Resolves a requested file name to a safe path inside MEDIA_DIR. */
function resolveSafe(fileName) {
  const clean = path.basename(String(fileName || ''));
  if (!FILE_PATTERN.test(clean)) return null;
  const full = path.join(MEDIA_DIR, clean);
  return fs.existsSync(full) ? full : null;
}

/**
 * Lists the most recent cards, pairing each PNG with its GIF sibling.
 * @param {number} [limit]
 */
function listRecent(limit = 12) {
  if (!fs.existsSync(MEDIA_DIR)) return [];

  const byPost = new Map();

  for (const file of fs.readdirSync(MEDIA_DIR)) {
    const match = FILE_PATTERN.exec(file);
    if (!match) continue;

    const [, postId, stamp, ext] = match;
    const entry = byPost.get(postId) || { postId, createdAt: Number(stamp), image: null, gif: null };
    entry.createdAt = Math.max(entry.createdAt, Number(stamp));
    if (ext === 'gif') entry.gif = file;
    else entry.image = file;
    byPost.set(postId, entry);
  }

  return Array.from(byPost.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map(entry => ({
      ...entry,
      imageUrl: entry.image ? `/media/${entry.image}` : null,
      gifUrl: entry.gif ? `/media/${entry.gif}` : null
    }));
}

/**
 * Deletes media older than maxAgeMs, keeping at least `keepAtLeast` newest
 * files so the gallery is never empty.
 */
function prune(maxAgeMs = 24 * 60 * 60 * 1000, keepAtLeast = 12) {
  if (!fs.existsSync(MEDIA_DIR)) return 0;

  const files = fs.readdirSync(MEDIA_DIR)
    .filter(file => FILE_PATTERN.test(file))
    .map(file => {
      const full = path.join(MEDIA_DIR, file);
      return { file, full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  let removed = 0;
  files.slice(keepAtLeast).forEach(({ full, mtime }) => {
    if (Date.now() - mtime > maxAgeMs) {
      try {
        fs.unlinkSync(full);
        removed++;
      } catch (err) {
        console.warn(`[MediaStore] Failed to prune ${full}: ${err.message}`);
      }
    }
  });

  if (removed) console.log(`[MediaStore] Pruned ${removed} old media file(s).`);
  return removed;
}

module.exports = {
  MEDIA_DIR,
  FILE_PATTERN,
  baseUrl,
  publicUrlFor,
  store,
  resolveSafe,
  listRecent,
  prune
};
