const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const dbUrl = (process.env.FIREBASE_DATABASE_URL || '').trim();
const credentialsVar = (process.env.FIREBASE_CREDENTIALS || '').trim();

if (!dbUrl) console.error('[Firebase] FIREBASE_DATABASE_URL is not set.');
if (!credentialsVar) console.error('[Firebase] FIREBASE_CREDENTIALS is not set.');

/**
 * Accepts either a raw service-account JSON string (handy on Render/Railway)
 * or a path to the key file on disk.
 */
function resolveCredential(value) {
  if (!value) return null;

  if (value.trim().startsWith('{')) {
    try {
      const credential = admin.credential.cert(JSON.parse(value));
      console.log('[Firebase] Using service account from FIREBASE_CREDENTIALS JSON string.');
      return credential;
    } catch (error) {
      console.error(`[Firebase] FIREBASE_CREDENTIALS looks like JSON but failed to parse: ${error.message}`);
      return null;
    }
  }

  const absolutePath = path.isAbsolute(value) ? value : path.join(process.cwd(), value);
  if (!fs.existsSync(absolutePath)) {
    console.error(`[Firebase] Service account file not found at: ${absolutePath}`);
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    console.log(`[Firebase] Using service account key file: ${absolutePath}`);
    return admin.credential.cert(parsed);
  } catch (error) {
    console.error(`[Firebase] Failed to read service account file: ${error.message}`);
    return null;
  }
}

const appConfig = { databaseURL: dbUrl };
const credential = resolveCredential(credentialsVar);
if (credential) appConfig.credential = credential;

let db = null;
let ready = false;

try {
  admin.initializeApp(appConfig);
  db = admin.database();
  ready = true;
} catch (error) {
  console.error(`[Firebase] Initialization failed: ${error.message}`);
  console.error('[Firebase] The web form and preview endpoints still work, but the queue is disabled.');
}

module.exports = {
  get db() {
    if (!db) throw new Error('Firebase is not initialized (check FIREBASE_CREDENTIALS / FIREBASE_DATABASE_URL).');
    return db;
  },
  isReady: () => ready,
  admin
};
