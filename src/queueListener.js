const firebase = require('./config/firebase');
const { generateMenfessMedia, cleanupTemp } = require('./services/imageProcessor');
const { generateCaption } = require('./services/geminiService');
const { uploadImageToPublicUrl, postToInstagram, isConfigured } = require('./services/instagramService');
const mediaStore = require('./services/mediaStore');
const { detectMood } = require('./services/themes');

require('dotenv').config();

const QUEUE_PATH = process.env.QUEUE_PATH || '/menfess_queue';
const MAX_ATTEMPTS = Math.max(1, parseInt(process.env.RETRY_MAX_ATTEMPTS, 10) || 3);
const RETRY_BASE_DELAY_MS = Math.max(1000, parseInt(process.env.RETRY_BASE_DELAY_MS, 10) || 15000);
const POST_INTERVAL_MS = Math.max(0, parseInt(process.env.POST_INTERVAL_MS, 10) || 0);
const DRY_RUN = process.env.DRY_RUN === 'true';

const jobQueue = [];
const seenKeys = new Set();
let isProcessing = false;
let lastPostAt = 0;

const stats = { processed: 0, posted: 0, failed: 0, rendered: 0, lastError: null };

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Claims an item so a second instance (or a restart) cannot post it twice.
 * @returns {Promise<boolean>} true when this process won the claim
 */
async function claimItem(ref) {
  try {
    const result = await ref.child('posted').transaction(current => {
      if (current === true) return undefined; // already claimed -> abort
      return true;
    });
    return result.committed;
  } catch (err) {
    console.error(`[Queue] Failed to claim item: ${err.message}`);
    return false;
  }
}

/**
 * Runs one menfess end to end: render -> caption -> host -> publish.
 */
async function handleJob(job) {
  const { key, ref, text } = job;
  const attempt = job.attempts + 1;

  console.log('\n========================================');
  console.log(`[Queue] Item ${key} (attempt ${attempt}/${MAX_ATTEMPTS})`);
  console.log(`[Queue] "${text.slice(0, 70)}${text.length > 70 ? '…' : ''}"`);
  console.log('========================================');

  const { mood } = detectMood(text);
  let storedImage = null;
  let storedGif = null;

  // 1. Render the kawaii card (PNG) and its animated version (GIF).
  console.log('[Queue] [1/4] Rendering card…');
  const { imagePath, gifPath, layout } = await generateMenfessMedia(text, key);

  storedImage = mediaStore.store(imagePath);
  if (gifPath) storedGif = mediaStore.store(gifPath);

  await ref.update({
    theme: layout.style.theme.name,
    mascot: layout.style.mascot,
    mood,
    imageFile: storedImage.fileName,
    gifFile: storedGif ? storedGif.fileName : null,
    renderedAt: Date.now()
  });

  // 2. Caption.
  console.log('[Queue] [2/4] Generating caption…');
  const caption = await generateCaption(text, mood);

  // 3. Publish (or stop here in dry-run / unconfigured mode).
  if (DRY_RUN || !isConfigured()) {
    const reason = DRY_RUN ? 'DRY_RUN=true' : 'Instagram credentials not configured';
    console.log(`[Queue] [3/4] Skipping Instagram upload (${reason}).`);
    await ref.update({
      status: 'rendered',
      caption,
      skippedReason: reason,
      processedAt: Date.now()
    });
    stats.rendered++;
    console.log(`[Queue] Card ready locally: ${storedImage.filePath}`);
    if (storedGif) console.log(`[Queue] Animated GIF: ${storedGif.filePath}`);
    return;
  }

  if (POST_INTERVAL_MS > 0) {
    const wait = lastPostAt + POST_INTERVAL_MS - Date.now();
    if (wait > 0) {
      console.log(`[Queue] Throttling: waiting ${Math.ceil(wait / 1000)}s before the next post…`);
      await sleep(wait);
    }
  }

  console.log('[Queue] [3/4] Publishing image to a public URL…');
  const publicImageUrl = await uploadImageToPublicUrl(storedImage.filePath);

  console.log('[Queue] [4/4] Posting to Instagram…');
  const igPostId = await postToInstagram(publicImageUrl, caption);
  lastPostAt = Date.now();

  await ref.update({
    status: 'success',
    caption,
    igPostId,
    imageUrl: publicImageUrl,
    postedAt: Date.now(),
    attempts: attempt
  });

  stats.posted++;
  console.log(`[Queue] SUCCESS: ${key} posted to Instagram (media id ${igPostId}).`);
}

/**
 * Sequential worker: one menfess at a time, with retry + backoff.
 */
async function processQueue() {
  if (isProcessing || jobQueue.length === 0) return;

  isProcessing = true;
  const job = jobQueue.shift();

  try {
    if (job.attempts === 0) {
      const claimed = await claimItem(job.ref);
      if (!claimed) {
        console.log(`[Queue] Item ${job.key} already claimed elsewhere. Skipping.`);
        return;
      }
      await job.ref.update({ status: 'processing', processedAt: Date.now() });
    }

    await handleJob(job);
    stats.processed++;
  } catch (error) {
    stats.lastError = error.message;
    console.error(`[Queue] FAILURE on ${job.key}: ${error.message}`);

    job.attempts += 1;

    if (job.attempts < MAX_ATTEMPTS) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, job.attempts - 1);
      console.log(`[Queue] Retrying ${job.key} in ${Math.round(delay / 1000)}s…`);

      try {
        await job.ref.update({ status: 'retrying', attempts: job.attempts, errorLog: error.message });
      } catch (dbError) {
        console.error(`[Queue] Could not write retry status: ${dbError.message}`);
      }

      setTimeout(() => {
        jobQueue.push(job);
        processQueue();
      }, delay);
    } else {
      stats.failed++;
      try {
        await job.ref.update({
          posted: true,           // keep it out of the active query
          status: 'failed',
          attempts: job.attempts,
          errorLog: error.message,
          failedAt: Date.now()
        });
      } catch (dbError) {
        console.error(`[Queue] Could not write failure status: ${dbError.message}`);
      }
    }
  } finally {
    isProcessing = false;
    cleanupTemp();
    mediaStore.prune();
    setImmediate(processQueue);
  }
}

/**
 * Adds a database item to the in-memory work queue.
 */
function enqueue(snapshot) {
  const key = snapshot.key;
  const value = snapshot.val();

  if (!value || typeof value.text !== 'string' || !value.text.trim()) {
    console.warn(`[QueueListener] Skipping item ${key}: no text.`);
    return;
  }
  if (seenKeys.has(key)) return;

  seenKeys.add(key);
  jobQueue.push({ key, ref: snapshot.ref, text: value.text.trim(), attempts: 0 });
  console.log(`[QueueListener] Queued ${key} (${jobQueue.length} waiting).`);
  processQueue();
}

/**
 * Starts listening for new menfess entries where posted === false.
 */
function startListener() {
  console.log('[QueueListener] Initializing Firebase queue listener…');

  if (!firebase.isReady()) {
    console.error('[QueueListener] Firebase is not initialized - queue listener disabled.');
    return false;
  }

  const db = firebase.db;

  db.ref('.info/connected').on('value', snapshot => {
    console.log(snapshot.val() === true
      ? '[QueueListener] Connected to Firebase Realtime Database.'
      : '[QueueListener] Disconnected from Firebase. Reconnecting…');
  });

  const queueQuery = db.ref(QUEUE_PATH).orderByChild('posted').equalTo(false);

  queueQuery.on('child_added', enqueue, error => {
    console.error(`[QueueListener] Listener error: ${error.message}`);
    if (/index/i.test(error.message)) {
      console.error('[QueueListener] Add this to your Realtime Database rules:');
      console.error(`  "${QUEUE_PATH.replace(/^\//, '')}": { ".indexOn": "posted" }`);
    }
  });

  console.log(`[QueueListener] Watching ${QUEUE_PATH} where posted === false.`);
  return true;
}

/**
 * Process any pending queue items in Firebase (ideal for Serverless / Cron / Submit triggers).
 */
async function processPendingQueue() {
  if (!firebase.isReady()) {
    console.warn('[QueueListener] Cannot process queue: Firebase is not ready.');
    return 0;
  }

  const db = firebase.db;
  try {
    const snapshot = await db.ref(QUEUE_PATH).orderByChild('posted').equalTo(false).limitToFirst(5).once('value');
    if (!snapshot.exists()) return 0;

    const items = snapshot.val();
    let processedCount = 0;

    for (const key of Object.keys(items)) {
      const item = items[key];
      if (!item || typeof item.text !== 'string' || !item.text.trim()) continue;

      const ref = db.ref(`${QUEUE_PATH}/${key}`);
      const claimed = await claimItem(ref);
      if (claimed) {
        await ref.update({ status: 'processing', processedAt: Date.now() });
        await handleJob({ key, ref, text: item.text.trim(), attempts: 0 });
        processedCount++;
      }
    }
    return processedCount;
  } catch (err) {
    console.error(`[QueueListener] processPendingQueue error: ${err.message}`);
    return 0;
  }
}

function getStats() {
  return { ...stats, waiting: jobQueue.length, busy: isProcessing };
}

module.exports = {
  startListener,
  getStats,
  processQueue,
  processPendingQueue,
  QUEUE_PATH
};
