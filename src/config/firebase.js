const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const dbUrl = (process.env.FIREBASE_DATABASE_URL || '').trim();
const credentialsVar = (process.env.FIREBASE_CREDENTIALS || '').trim();

let initError = null;

if (!dbUrl) {
  console.error('[Firebase] FIREBASE_DATABASE_URL is not set.');
  initError = 'FIREBASE_DATABASE_URL is not set.';
}
if (!credentialsVar) {
  console.error('[Firebase] FIREBASE_CREDENTIALS is not set.');
  if (!initError) initError = 'FIREBASE_CREDENTIALS is not set.';
}

/**
 * Accepts raw service-account JSON, double-quoted JSON, or file path.
 */
function resolveCredential(value) {
  if (!value) return null;

  let clean = value.trim();

  // If Vercel wrapped the string in double quotes: "{"type": ...}"
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.slice(1, -1).trim();
  }

  let serviceAccount = null;

  if (clean.startsWith('{')) {
    try {
      serviceAccount = JSON.parse(clean);
      console.log('[Firebase] Using service account from FIREBASE_CREDENTIALS JSON string.');
    } catch (error) {
      console.error(`[Firebase] FIREBASE_CREDENTIALS failed to parse JSON: ${error.message}`);
      initError = `FIREBASE_CREDENTIALS JSON parse error: ${error.message}`;
      return null;
    }
  } else {
    const absolutePath = path.isAbsolute(clean) ? clean : path.join(process.cwd(), clean);
    if (fs.existsSync(absolutePath)) {
      try {
        serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        console.log(`[Firebase] Using service account key file: ${absolutePath}`);
      } catch (error) {
        console.error(`[Firebase] Failed to read service account file: ${error.message}`);
        initError = `Key file read error: ${error.message}`;
        return null;
      }
    } else {
      console.error(`[Firebase] Service account file not found at: ${absolutePath}`);
      initError = `Credentials file not found at ${clean}. Please paste the raw JSON text in Vercel Environment Variables.`;
    }
  }

  if (serviceAccount) {
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    try {
      return admin.credential.cert(serviceAccount);
    } catch (err) {
      console.error(`[Firebase] admin.credential.cert failed: ${err.message}`);
      initError = `admin.credential.cert failed: ${err.message}`;
      return null;
    }
  }

  return null;
}

const appConfig = { databaseURL: dbUrl };
const credential = resolveCredential(credentialsVar);
if (credential) appConfig.credential = credential;

let db = null;
let ready = false;

try {
  if (!dbUrl) {
    throw new Error('FIREBASE_DATABASE_URL is missing.');
  }
  if (!credential) {
    throw new Error(initError || 'FIREBASE_CREDENTIALS credential resolve failed.');
  }

  if (!admin.apps.length) {
    admin.initializeApp(appConfig);
  }
  db = admin.database();
  ready = true;
  initError = null;
} catch (error) {
  ready = false;
  initError = error.message;
  console.error(`[Firebase] Initialization failed: ${error.message}`);
}

module.exports = {
  get db() {
    if (!db || !ready) throw new Error(`Firebase is not initialized (${initError || 'Check credentials'}).`);
    return db;
  },
  isReady: () => ready,
  getInitError: () => initError,
  admin
};
