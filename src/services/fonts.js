const { GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts');

// Fonts we ship in assets/fonts (all SIL Open Font License).
// alias -> list of candidate files, first one found wins.
const BUNDLED = {
  Sniglet: ['Sniglet-ExtraBold.ttf'],       // chunky rounded display
  SnigletSoft: ['Sniglet-Regular.ttf'],     // lighter display
  VarelaRound: ['VarelaRound-Regular.ttf'], // rounded, very readable body
  Mali: ['Mali-SemiBold.ttf'],              // cute handwriting
  MaliBold: ['Mali-Bold.ttf']
};

// Color emoji fonts shipped with the OS. First hit wins, so a card rendered on
// Windows gets full-color emoji; on Linux hosting we fall back to Noto.
const SYSTEM_EMOJI_FONTS = [
  'C:/Windows/Fonts/seguiemj.ttf',
  '/System/Library/Fonts/Apple Color Emoji.ttc',
  '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
  '/usr/share/fonts/noto/NotoColorEmoji.ttf',
  '/usr/share/fonts/truetype/noto-color-emoji/NotoColorEmoji.ttf'
];

const state = {
  display: 'sans-serif',
  displaySoft: 'sans-serif',
  body: 'sans-serif',
  hand: 'sans-serif',
  emoji: null,
  loaded: []
};

function register(filePath, alias) {
  try {
    GlobalFonts.registerFromPath(filePath, alias);
    state.loaded.push(alias);
    return true;
  } catch (err) {
    console.error(`[Fonts] Failed to register ${alias} from ${filePath}: ${err.message}`);
    return false;
  }
}

function registerBundled() {
  const found = {};
  for (const [alias, candidates] of Object.entries(BUNDLED)) {
    for (const file of candidates) {
      const full = path.join(FONTS_DIR, file);
      if (fs.existsSync(full) && register(full, alias)) {
        found[alias] = true;
        break;
      }
    }
  }
  return found;
}

/**
 * Registers any other .ttf/.otf the user dropped into assets/fonts, using the
 * file name (without weight suffix) as the family alias. Lets people bring
 * their own font without touching the code.
 */
function registerExtras() {
  if (!fs.existsSync(FONTS_DIR)) return [];
  const known = new Set(Object.values(BUNDLED).flat());
  const extras = [];

  for (const file of fs.readdirSync(FONTS_DIR)) {
    if (!/\.(ttf|otf|ttc)$/i.test(file) || known.has(file)) continue;
    const alias = path.basename(file).replace(/\.(ttf|otf|ttc)$/i, '').replace(/[\[\]]/g, '');
    if (register(path.join(FONTS_DIR, file), alias)) extras.push(alias);
  }
  return extras;
}

function registerEmoji(extras) {
  for (const candidate of SYSTEM_EMOJI_FONTS) {
    if (fs.existsSync(candidate) && register(candidate, 'MenfessEmoji')) {
      console.log(`[Fonts] Using system color emoji font: ${candidate}`);
      return 'MenfessEmoji';
    }
  }
  // Monochrome fallback bundled in assets/fonts (NotoEmoji[wght].ttf).
  const noto = extras.find(alias => /notoemoji/i.test(alias));
  if (noto) {
    console.log('[Fonts] Using bundled monochrome Noto Emoji fallback.');
    return noto;
  }
  console.warn('[Fonts] No emoji font available. Emoji may render as empty boxes.');
  return null;
}

function initFonts() {
  if (state.initialized) return state;

  if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });

  const found = registerBundled();
  const extras = registerExtras();
  const emoji = registerEmoji(extras);

  // Anything the user dropped in that is not an emoji font can serve as a
  // last-resort display font when the bundled ones are missing.
  const userFont = extras.find(alias => !/emoji/i.test(alias));

  state.display = found.Sniglet ? 'Sniglet' : (userFont || 'sans-serif');
  state.displaySoft = found.SnigletSoft ? 'SnigletSoft' : state.display;
  state.body = found.VarelaRound ? 'VarelaRound' : (userFont || 'sans-serif');
  state.hand = found.Mali ? 'Mali' : state.body;
  state.handBold = found.MaliBold ? 'MaliBold' : state.hand;
  state.emoji = emoji;
  state.initialized = true;

  console.log(`[Fonts] Registered: ${state.loaded.join(', ') || 'none'}`);
  console.log(`[Fonts] display=${state.display} body=${state.body} hand=${state.hand} emoji=${state.emoji || '-'}`);
  return state;
}

/**
 * Builds a CSS font shorthand with emoji fallback appended, e.g.
 *   font('display', 64, '800') -> `800 64px "Sniglet", "MenfessEmoji", sans-serif`
 * @param {'display'|'displaySoft'|'body'|'hand'|'handBold'} role
 * @param {number} size - px
 * @param {string} [weight] - CSS font weight/style prefix
 */
function font(role, size, weight = 'normal') {
  const s = initFonts();
  const family = s[role] || s.body;
  const stack = [`"${family}"`];
  if (s.emoji) stack.push(`"${s.emoji}"`);
  stack.push('sans-serif');
  return `${weight} ${Math.round(size * 100) / 100}px ${stack.join(', ')}`;
}

module.exports = { initFonts, font, FONTS_DIR };
