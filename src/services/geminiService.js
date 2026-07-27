const { GoogleGenerativeAI } = require('@google/generative-ai');

require('dotenv').config();

const apiKey = (process.env.GEMINI_API_KEY || '').trim();

// Primary model is configurable; the rest are tried in order if it is
// unavailable for the key (404) or rate limited (429).
const MODEL_CHAIN = [
  process.env.GEMINI_MODEL,
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash'
].filter(Boolean).filter((model, index, all) => all.indexOf(model) === index);

const IG_CAPTION_LIMIT = 2200;

let genAI = null;

function looksLikePlaceholder(key) {
  return !key || key.includes('...') || /^(your|xxx|placeholder)/i.test(key);
}

if (!looksLikePlaceholder(apiKey)) {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log(`[GeminiService] Client ready. Model chain: ${MODEL_CHAIN.join(' -> ')}`);
  } catch (err) {
    console.error(`[GeminiService] Failed to initialize client: ${err.message}`);
  }
} else {
  console.log('[GeminiService] GEMINI_API_KEY missing/placeholder. Using offline fallback captions.');
}

const FALLBACK_OPENERS = [
  'Ada kiriman baru nih, relate nggak?',
  'Titipan dari yang malu ngomong langsung.',
  'Menfess hari ini, siapa yang ngerasa?',
  'Dari yang anonim, buat yang baca.',
  'Kiriman anonim masuk, mari kita baca bareng.'
];

const HASHTAG_SETS = {
  love: ['#menfess', '#jatuhcinta', '#doi'],
  sad: ['#menfess', '#curhat', '#healing'],
  study: ['#menfess', '#kuliah', '#nugas'],
  happy: ['#menfess', '#goodnews', '#semangat'],
  food: ['#menfess', '#jajan', '#kulineran'],
  thanks: ['#menfess', '#terimakasih', '#kindness'],
  night: ['#menfess', '#malamminggu', '#insomnia'],
  neutral: ['#menfess', '#curhatan', '#anonim']
};

/**
 * Removes anything that should never end up in a live Instagram caption:
 * markdown fences, "Caption:" prefixes, wrapping quotes and leftover prompt
 * instructions such as "+ 2 relevant hashtags".
 */
function sanitizeCaption(raw, mood = 'neutral') {
  let text = String(raw || '').trim();

  text = text.replace(/^```[a-z]*\s*/i, '').replace(/```$/g, '').trim();
  text = text.replace(/^(ini\s+)?caption(nya)?\s*[:\-]\s*/i, '').trim();
  text = text.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '').trim();
  text = text.replace(/^\*\*|\*\*$/g, '').trim();

  // Kill model leftovers that describe hashtags instead of writing them.
  text = text
    .split('\n')
    .filter(line => !/^\s*[\+\-\*]?\s*\d*\s*(other\s+)?relevant\s+hashtags?/i.test(line))
    .join('\n')
    .replace(/\+\s*\d+\s*(other\s+)?relevant\s+hashtags?/gi, '')
    .replace(/\(?\s*tambahkan\s+\d+\s+hashtag[^)\n]*\)?/gi, '')
    .trim();

  // Guarantee the account's main hashtag is present.
  if (!/#menfess\b/i.test(text)) {
    const tags = HASHTAG_SETS[mood] || HASHTAG_SETS.neutral;
    text += `\n\n${tags.join(' ')}`;
  }

  text = text.replace(/\n{3,}/g, '\n\n').trim();

  if (text.length > IG_CAPTION_LIMIT) {
    text = text.slice(0, IG_CAPTION_LIMIT - 1).replace(/\s+\S*$/, '') + '…';
  }
  return text;
}

/**
 * Offline caption used when Gemini is unconfigured, quota-limited or failing.
 */
function generateFallbackCaption(menfessText, mood = 'neutral') {
  const opener = FALLBACK_OPENERS[Math.floor(Math.random() * FALLBACK_OPENERS.length)];
  const snippet = menfessText.length > 90 ? `${menfessText.slice(0, 90).trim()}...` : menfessText;
  const tags = HASHTAG_SETS[mood] || HASHTAG_SETS.neutral;

  return `${opener}\n\n"${snippet}"\n\nKirim menfess kamu lewat link di bio.\n\n${tags.join(' ')}`;
}

function buildPrompt(menfessText) {
  return `Kamu adalah pembuat caption Instagram otomatis untuk akun menfess (pesan anonim).
Buat caption Instagram singkat dan relatable berdasarkan pesan menfess di bawah.

Aturan:
1. Bahasa gaul anak muda Indonesia yang santai dan kekinian (gaya sosmed), 1-3 baris saja.
2. Maksimal 1 emoji, dan hanya kalau benar-benar pas. Caption tanpa emoji juga bagus - jangan menaburkan emoji dekoratif.
3. Baris terakhir berisi TEPAT 3 hashtag nyata. Hashtag pertama wajib #menfess, lalu 2 hashtag lain yang spesifik dengan topik pesan (misal soal cinta: #jatuhcinta #doi; soal kuliah: #nugas #kuliah).
4. JANGAN menulis instruksi/placeholder seperti "+ 2 relevant hashtags".
5. Jangan mengulang isi pesan secara utuh, jangan membocorkan identitas siapa pun, jangan menambahkan kalimat pengantar seperti "Ini captionnya:".
6. Output hanya teks caption siap posting.

Pesan Menfess:
"${menfessText}"`;
}

function isRetryableModelError(error) {
  const message = String(error && error.message).toLowerCase();
  return /404|not found|not supported|429|quota|rate limit|unavailable|503|500/.test(message);
}

/**
 * Generates an Instagram caption for a menfess.
 * @param {string} menfessText
 * @param {string} [mood] - mood detected by themes.detectMood (for fallbacks)
 * @returns {Promise<string>}
 */
async function generateCaption(menfessText, mood = 'neutral') {
  const text = String(menfessText || '').trim();
  if (!genAI || !text) return generateFallbackCaption(text, mood);

  const prompt = buildPrompt(text);
  let lastError = null;

  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.85, topP: 0.95 }
      });

      const responseText = result.response.text();
      if (responseText && responseText.trim()) {
        const caption = sanitizeCaption(responseText, mood);
        if (caption) {
          if (modelName !== MODEL_CHAIN[0]) {
            console.log(`[GeminiService] Caption generated with fallback model "${modelName}".`);
          }
          return caption;
        }
      }
      lastError = new Error('empty response');
    } catch (error) {
      lastError = error;
      console.warn(`[GeminiService] Model "${modelName}" failed: ${error.message}`);
      if (!isRetryableModelError(error)) break;
    }
  }

  console.error(`[GeminiService] All models failed (${lastError && lastError.message}). Using fallback caption.`);
  return generateFallbackCaption(text, mood);
}

module.exports = {
  generateCaption,
  generateFallbackCaption,
  sanitizeCaption,
  MODEL_CHAIN
};
