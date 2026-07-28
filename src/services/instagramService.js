const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const mediaStore = require('./mediaStore');

require('dotenv').config();

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION || 'v20.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function credentials() {
  return {
    userId: (process.env.IG_USER_ID || '').trim(),
    token: (process.env.IG_ACCESS_TOKEN || '').trim()
  };
}

/**
 * True when both Instagram credentials look usable (non-empty and not one of
 * the placeholder values shipped in .env.example).
 */
function isConfigured() {
  const { userId, token } = credentials();
  if (!userId || !token) return false;
  if (/^(your|xxx|placeholder|1784\.\.\.)/i.test(userId) || userId.includes('...')) return false;
  if (/^(your|xxx|placeholder|eaa\.\.\.)/i.test(token) || token.includes('...')) return false;
  return /^\d{5,}$/.test(userId);
}

/**
 * Makes a local file reachable by Instagram's servers.
 *
 * Preferred path: this service hosts the file itself (PUBLIC_BASE_URL), which is
 * far more reliable than a throwaway host. Fallback: tmpfiles.org, which keeps
 * uploads for ~60 minutes - enough for Instagram to fetch the image.
 *
 * @param {string} localFilePath
 * @returns {Promise<string>} public direct URL
 */
async function uploadImageToPublicUrl(localFilePath) {
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`File not found at path: ${localFilePath}`);
  }

  const selfHosted = mediaStore.baseUrl();
  if (selfHosted) {
    const { url } = mediaStore.store(localFilePath, { keepOriginal: true });
    console.log(`[InstagramService] Serving image from this service: ${url}`);
    return url;
  }

  console.log(`[InstagramService] Uploading ${path.basename(localFilePath)} to temporary public host...`);

  const form = new FormData();
  form.append('file', fs.createReadStream(localFilePath));

  // Try multiple hosts in order of reliability
  const hosts = [
    {
      name: 'imgur',
      upload: async () => {
        const imageData = fs.readFileSync(localFilePath).toString('base64');
        const resp = await axios.post('https://api.imgur.com/3/image', {
          image: imageData,
          type: 'base64'
        }, {
          headers: { Authorization: 'Client-ID 546c25a59c58ad7' },
          timeout: 60000
        });
        if (resp.data && resp.data.success && resp.data.data && resp.data.data.link) {
          return resp.data.data.link;
        }
        throw new Error(`Bad response: ${JSON.stringify(resp.data)}`);
      }
    },
    {
      name: 'freeimage.host',
      upload: async () => {
        const imageData = fs.readFileSync(localFilePath).toString('base64');
        const params = new URLSearchParams();
        params.append('key', '6d207e02198a847aa98d0a2a901485a5');
        params.append('source', imageData);
        params.append('format', 'json');
        const resp = await axios.post('https://freeimage.host/api/1/upload', params, {
          timeout: 60000
        });
        if (resp.data && resp.data.status_code === 200 && resp.data.image && resp.data.image.url) {
          return resp.data.image.url;
        }
        throw new Error(`Bad response: ${JSON.stringify(resp.data)}`);
      }
    }
  ];

  for (const host of hosts) {
    try {
      const url = await host.upload();
      console.log(`[InstagramService] File uploaded to ${host.name}. Direct URL: ${url}`);
      return url;
    } catch (err) {
      console.warn(`[InstagramService] ${host.name} failed: ${err.message}. Trying next...`);
    }
  }

  throw new Error('All temporary image hosts failed.');
}

/**
 * Polls the media container until Instagram finished ingesting the image.
 */
async function pollContainerStatus(containerId, accessToken, maxAttempts = 10, intervalMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(`${GRAPH_BASE}/${containerId}`, {
        params: { fields: 'status_code,status', access_token: accessToken },
        timeout: 20000
      });

      const { status_code: statusCode, status } = response.data;
      console.log(`[InstagramService] Container ${containerId} (${attempt}/${maxAttempts}): ${statusCode}`);

      if (statusCode === 'FINISHED') return true;
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new Error(`Container processing failed: ${statusCode}. Detail: ${status}`);
      }
    } catch (err) {
      const apiError = err.response && err.response.data && err.response.data.error;
      if (apiError && (apiError.code === 100 || apiError.code === 190)) {
        throw new Error('STATUS_POLLING_NOT_SUPPORTED');
      }
      if (/Container processing failed/.test(err.message)) throw err;
      console.warn(`[InstagramService] Warning while polling container: ${err.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timeout waiting for media container ${containerId} to finish processing.`);
}

/**
 * Publishes an image to Instagram (create container -> wait -> publish).
 * @param {string} imageUrl - public direct URL of the image
 * @param {string} caption
 * @returns {Promise<string>} published media id
 */
async function postToInstagram(imageUrl, caption) {
  const { userId, token } = credentials();

  if (!isConfigured()) {
    throw new Error('Instagram credentials (IG_USER_ID / IG_ACCESS_TOKEN) are missing or still placeholders.');
  }

  console.log('[InstagramService] Creating Instagram media container...');

  let containerId;
  try {
    const response = await axios.post(`${GRAPH_BASE}/${userId}/media`, null, {
      params: { image_url: imageUrl, caption, access_token: token },
      timeout: 60000
    });
    containerId = response.data.id;
    console.log(`[InstagramService] Media container created. ID: ${containerId}`);
  } catch (error) {
    const details = error.response ? JSON.stringify(error.response.data) : error.message;
    throw new Error(`Instagram media container creation failed: ${details}`);
  }

  try {
    await pollContainerStatus(containerId, token);
    console.log('[InstagramService] Media container is ready to publish.');
  } catch (pollError) {
    if (pollError.message === 'STATUS_POLLING_NOT_SUPPORTED') {
      console.log('[InstagramService] Status polling not permitted by token scope. Waiting 5s instead...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      throw pollError;
    }
  }

  console.log(`[InstagramService] Publishing container ${containerId}...`);
  try {
    const response = await axios.post(`${GRAPH_BASE}/${userId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: token },
      timeout: 60000
    });
    console.log(`[InstagramService] Published! Media ID: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    const details = error.response ? JSON.stringify(error.response.data) : error.message;
    throw new Error(`Instagram media publish failed: ${details}`);
  }
}

/**
 * Quick credential smoke test - returns the connected IG account username.
 * @returns {Promise<{ok: boolean, username?: string, error?: string}>}
 */
async function verifyCredentials() {
  const { userId, token } = credentials();
  if (!isConfigured()) return { ok: false, error: 'credentials missing or placeholder' };

  try {
    const response = await axios.get(`${GRAPH_BASE}/${userId}`, {
      params: { fields: 'username,followers_count', access_token: token },
      timeout: 20000
    });
    return { ok: true, username: response.data.username };
  } catch (error) {
    const details = error.response ? JSON.stringify(error.response.data) : error.message;
    return { ok: false, error: details };
  }
}

module.exports = {
  uploadImageToPublicUrl,
  postToInstagram,
  verifyCredentials,
  isConfigured,
  GRAPH_BASE
};
