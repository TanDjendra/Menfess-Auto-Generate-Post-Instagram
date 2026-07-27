/**
 * Pastel kawaii palettes for the menfess cards.
 * Every theme is picked deterministically from the post id, so the PNG and the
 * animated GIF of the same menfess always look like the same card.
 */

const THEMES = [
  {
    name: 'strawberry-milk',
    bgTop: '#ffe6ef', bgBottom: '#fff7fa',
    blobA: '#ffc2d6', blobB: '#ffe0b3',
    accent: '#ff6f9c', accentSoft: '#ffb6cd', accentDeep: '#e14b7a',
    card: '#fffdfd', cardEdge: '#ffd0de',
    ink: '#6b3448', inkSoft: '#a9748a',
    tape: '#ffd166', dots: '#ffc2d6'
  },
  {
    name: 'mint-soda',
    bgTop: '#ddf9ec', bgBottom: '#f4fffb',
    blobA: '#b6f0d8', blobB: '#cdeaff',
    accent: '#2fb894', accentSoft: '#9fe6cd', accentDeep: '#1d8d70',
    card: '#fdfffe', cardEdge: '#bfeedd',
    ink: '#2b5348', inkSoft: '#6e9389',
    tape: '#7fd1ff', dots: '#b6f0d8'
  },
  {
    name: 'lavender-dream',
    bgTop: '#ece3ff', bgBottom: '#f9f6ff',
    blobA: '#d6c6ff', blobB: '#ffd8f0',
    accent: '#8b6cf0', accentSoft: '#c9b8ff', accentDeep: '#6a4ad6',
    card: '#fefdff', cardEdge: '#ddd0ff',
    ink: '#443066', inkSoft: '#7f6ba1',
    tape: '#ff9ecb', dots: '#d6c6ff'
  },
  {
    name: 'peach-sunset',
    bgTop: '#ffe9d6', bgBottom: '#fff8f1',
    blobA: '#ffd0ac', blobB: '#ffc9c9',
    accent: '#ff8a4c', accentSoft: '#ffc79f', accentDeep: '#e06a2c',
    card: '#fffdfa', cardEdge: '#ffd8bd',
    ink: '#6f4026', inkSoft: '#a97a5d',
    tape: '#ffe066', dots: '#ffd0ac'
  },
  {
    name: 'blueberry-sky',
    bgTop: '#ddebff', bgBottom: '#f5faff',
    blobA: '#bcd8ff', blobB: '#dcd0ff',
    accent: '#4f8ef7', accentSoft: '#a9cbff', accentDeep: '#2f6bd0',
    card: '#fdfeff', cardEdge: '#c8ddff',
    ink: '#2b426b', inkSoft: '#6a7fa5',
    tape: '#ffb3d1', dots: '#bcd8ff'
  },
  {
    name: 'matcha-latte',
    bgTop: '#edf7d9', bgBottom: '#fafdf1',
    blobA: '#d4ebac', blobB: '#ffe9b8',
    accent: '#7fae43', accentSoft: '#c5e39a', accentDeep: '#5f8a2c',
    card: '#fefff9', cardEdge: '#d8ecb4',
    ink: '#4a5626', inkSoft: '#7f8c5c',
    tape: '#ffd166', dots: '#d4ebac'
  },
  {
    name: 'bubblegum-pop',
    bgTop: '#ffe0f7', bgBottom: '#fff6fd',
    blobA: '#ffc0ec', blobB: '#c9e8ff',
    accent: '#ea54b4', accentSoft: '#ffb3e3', accentDeep: '#c23a94',
    card: '#fffdff', cardEdge: '#ffcaee',
    ink: '#653056', inkSoft: '#a1719b',
    tape: '#8fd8ff', dots: '#ffc0ec'
  },
  {
    name: 'cream-honey',
    bgTop: '#fff3d6', bgBottom: '#fffdf4',
    blobA: '#ffe3a3', blobB: '#ffd6c2',
    accent: '#eaa42c', accentSoft: '#ffd98a', accentDeep: '#c9851a',
    card: '#fffefa', cardEdge: '#ffe6b8',
    ink: '#6b4c1c', inkSoft: '#a5854f',
    tape: '#ffb3c1', dots: '#ffe3a3'
  }
];

const MASCOTS = ['bear', 'cat', 'bunny', 'panda', 'frog', 'chick'];
const STICKERS = ['boba', 'rainbowCloud', 'cupcake', 'letter', 'moon', 'flower'];

// Every mood gets a hand-drawn icon (see kawaiiArt.moodIcon) instead of an
// emoji, so the card never depends on a system emoji font for its own artwork.
const MOOD_STYLES = {
  love:    { label: 'kiriman cinta',  icon: 'envelope' },
  sad:     { label: 'butuh pelukan',  icon: 'mendedHeart' },
  study:   { label: 'anak rajin',     icon: 'book' },
  happy:   { label: 'kabar bahagia',  icon: 'confetti' },
  food:    { label: 'lapar mode on',  icon: 'bowl' },
  thanks:  { label: 'terima kasih',   icon: 'tulip' },
  night:   { label: 'obrolan malam',  icon: 'moon' },
  neutral: { label: 'pesan anonim',   icon: 'sparkle' }
};

const MOOD_KEYWORDS = [
  { mood: 'love', theme: 'strawberry-milk', words: /\b(cinta|suka|sayang|crush|doi|pacar|jatuh cinta|kangen|rindu|gebetan|jodoh|baper)\b/i },
  { mood: 'sad', theme: 'blueberry-sky', words: /\b(sedih|nangis|kecewa|patah hati|move on|ditinggal|capek|lelah|galau|hancur|sakit hati)\b/i },
  // Order matters: the first match wins, so specific moods come before the
  // broad ones ("makasih ... di kantin" should read as thanks, not food).
  { mood: 'thanks', theme: 'mint-soda', words: /\b(makasih|terima kasih|thanks|thank you|bersyukur|maaf)\b/i },
  { mood: 'study', theme: 'matcha-latte', words: /\b(tugas|nugas|kuliah|ujian|skripsi|belajar|dosen|sekolah|pr|deadline|praktikum)\b/i },
  { mood: 'happy', theme: 'bubblegum-pop', words: /\b(seneng|senang|bahagia|lulus|menang|hore|akhirnya|selamat|semangat|good news)\b/i },
  { mood: 'night', theme: 'lavender-dream', words: /\b(malam|tidur|insomnia|mimpi|ngantuk|bintang|larut)\b/i },
  { mood: 'food', theme: 'cream-honey', words: /\b(makan|laper|lapar|kopi|boba|jajan|nasi|kantin|mie|es teh)\b/i }
];

/** Tiny deterministic string hash (FNV-1a). */
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32) so a given post always renders identically. */
function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Detects the mood of the menfess so the card colour matches the vibe.
 * @param {string} text
 * @returns {{mood: string, theme: string|null}}
 */
function detectMood(text = '') {
  for (const entry of MOOD_KEYWORDS) {
    if (entry.words.test(text)) return { mood: entry.mood, theme: entry.theme };
  }
  return { mood: 'neutral', theme: null };
}

/**
 * Picks a full visual style (palette + mascot + sticker) for one menfess.
 * @param {string} seedKey - post id, keeps PNG/GIF in sync
 * @param {string} text - used for mood-based palette matching
 * @param {string} [forcedTheme] - theme name to force (env or query override)
 */
function pickStyle(seedKey, text = '', forcedTheme = null) {
  const seed = hashString(String(seedKey || 'menfess') + '|' + text.length);
  const random = createRandom(seed);
  const { mood, theme: moodTheme } = detectMood(text);

  const wanted = forcedTheme || moodTheme;
  const theme =
    THEMES.find(t => t.name === wanted) ||
    THEMES[Math.floor(random() * THEMES.length)];

  return {
    theme,
    mood,
    mascot: MASCOTS[Math.floor(random() * MASCOTS.length)],
    sticker: STICKERS[Math.floor(random() * STICKERS.length)],
    random,
    seed
  };
}

module.exports = {
  THEMES,
  MASCOTS,
  STICKERS,
  MOOD_STYLES,
  pickStyle,
  detectMood,
  createRandom,
  hashString
};
