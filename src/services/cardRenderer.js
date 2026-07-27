/**
 * Builds and draws the kawaii menfess card.
 *
 * The whole scene is drawn in a fixed 1080x1080 "design space" and the caller
 * only scales the context, so the big PNG and the small animated GIF frames are
 * pixel-for-pixel the same composition.
 *
 * renderScene(ctx, layout, t) is a pure function of the animation phase t
 * (0 <= t < 1) and every motion is periodic in t, so GIF loops seamlessly.
 */

const { createCanvas } = require('@napi-rs/canvas');
const art = require('./kawaiiArt');
const { font, initFonts } = require('./fonts');
const { pickStyle, MOOD_STYLES } = require('./themes');

const DESIGN = 1080;
const TAU = Math.PI * 2;

// Reusable scratch context for text measurement.
let measureCtx = null;
function getMeasureCtx() {
  if (!measureCtx) measureCtx = createCanvas(DESIGN, DESIGN).getContext('2d');
  return measureCtx;
}

/* ------------------------------------------------------------------ *
 * text layout
 * ------------------------------------------------------------------ */

/** Splits a long word that cannot fit on a single line. */
function splitLongWord(ctx, word, maxWidth) {
  const chunks = [];
  let current = '';
  for (const char of Array.from(word)) {
    if (ctx.measureText(current + char).width > maxWidth && current) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }

    const words = paragraph.trim().split(/\s+/);
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;

      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);

      if (ctx.measureText(word).width > maxWidth) {
        const chunks = splitLongWord(ctx, word, maxWidth);
        lines.push(...chunks.slice(0, -1));
        current = chunks[chunks.length - 1] || '';
      } else {
        current = word;
      }
    }
    lines.push(current);
  }

  // Drop trailing empty lines so the card is not bottom-heavy.
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/* ------------------------------------------------------------------ *
 * layout
 * ------------------------------------------------------------------ */

function buildDecorations(random, card) {
  const kinds = ['heart', 'star', 'sparkle', 'cloud', 'bow', 'flower'];
  const items = [];

  // Zones live in the margin band around the card so nothing hides the text.
  const zones = [
    { x: [40, DESIGN - 40], y: [40, card.y - 30] },                       // top band
    { x: [40, DESIGN - 40], y: [card.y + card.h + 30, DESIGN - 40] },     // bottom band
    { x: [20, card.x - 6], y: [card.y - 40, card.y + card.h + 40] },      // left strip
    { x: [card.x + card.w + 6, DESIGN - 20], y: [card.y - 40, card.y + card.h + 40] }
  ];

  const count = 20;
  for (let i = 0; i < count; i++) {
    const zone = zones[i % zones.length];
    const spanX = zone.x[1] - zone.x[0];
    const spanY = zone.y[1] - zone.y[0];
    if (spanX < 30 || spanY < 30) continue;

    items.push({
      kind: kinds[Math.floor(random() * kinds.length)],
      x: zone.x[0] + random() * spanX,
      y: zone.y[0] + random() * spanY,
      size: 18 + random() * 34,
      rotation: (random() - 0.5) * 0.9,
      phase: random(),
      cycles: random() < 0.5 ? 1 : 2,
      amp: 6 + random() * 16,
      opacity: 0.55 + random() * 0.4
    });
  }

  // Rising hearts/sparkles in the left and right strips (looping upward drift).
  const risers = [];
  for (let i = 0; i < 10; i++) {
    risers.push({
      kind: random() < 0.55 ? 'heart' : 'sparkle',
      x: (random() < 0.5 ? 20 + random() * (card.x - 30) : card.x + card.w + 10 + random() * (DESIGN - card.x - card.w - 30)),
      size: 12 + random() * 20,
      offset: random(),
      speed: 0.6 + random() * 0.8,
      sway: 10 + random() * 22,
      rotation: (random() - 0.5) * 0.8
    });
  }

  return { items, risers };
}

/**
 * Computes everything needed to draw one menfess card.
 * @param {string} text - menfess body
 * @param {object} [options] - { postId, handle, brand, theme, dateLabel }
 */
function buildLayout(text, options = {}) {
  initFonts();
  const ctx = getMeasureCtx();

  const body = String(text || '').replace(/\r/g, '').trim() || 'pesan kosong :(';
  const style = pickStyle(options.postId || 'preview', body, options.theme || null);

  const card = { x: 84, w: DESIGN - 168 };
  const padX = 92;
  const maxTextWidth = card.w - padX * 2;

  // Shrink the font until the text block fits the available height.
  const maxFont = body.length < 90 ? 62 : 54;
  const minFont = 27;
  const maxTextHeight = 430;

  let fontSize = maxFont;
  let lines = [];
  let lineHeight = 0;

  while (fontSize >= minFont) {
    ctx.font = font('hand', fontSize, '600');
    lines = wrapText(ctx, body, maxTextWidth);
    lineHeight = fontSize * 1.48;
    if (lines.length * lineHeight <= maxTextHeight) break;
    fontSize -= 2;
  }

  // Still too long (very long menfess): clamp with an ellipsis.
  if (lines.length * lineHeight > maxTextHeight) {
    const keep = Math.max(1, Math.floor(maxTextHeight / lineHeight));
    lines = lines.slice(0, keep);
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[\s,.]+$/, '') + '…';
  }

  const textHeight = lines.length * lineHeight;
  const headerHeight = 252;   // letter mark + title + mood pill
  const footerHeight = 178;   // divider + handle + date
  card.h = Math.min(900, Math.max(580, headerHeight + textHeight + footerHeight));
  card.y = Math.round((DESIGN - card.h) / 2 + 12);

  const textTop = Math.max(
    card.y + headerHeight,
    card.y + headerHeight + (card.h - headerHeight - footerHeight - textHeight) / 2
  );

  const mood = MOOD_STYLES[style.mood] || MOOD_STYLES.neutral;

  return {
    body,
    style,
    card,
    padX,
    lines,
    fontSize,
    lineHeight,
    textTop,
    mood,
    brand: options.brand || 'Menfess',
    handle: options.handle || '',
    dateLabel: options.dateLabel || formatDate(new Date()),
    tagline: options.tagline || 'kirim rahasiamu, tetap anonim',
    showMascot: options.mascot === true,
    decor: null // filled below
  };
}

function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/* ------------------------------------------------------------------ *
 * scene painting
 * ------------------------------------------------------------------ */

function paintBackground(ctx, layout, t) {
  const { theme } = layout.style;

  const gradient = ctx.createLinearGradient(0, 0, DESIGN * 0.3, DESIGN);
  gradient.addColorStop(0, theme.bgTop);
  gradient.addColorStop(1, theme.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, DESIGN, DESIGN);

  // Soft breathing colour blobs.
  const blobs = [
    { x: 140, y: 150, r: 400, color: theme.blobA, phase: 0 },
    { x: 980, y: 260, r: 340, color: theme.blobB, phase: 0.33 },
    { x: 860, y: 960, r: 420, color: theme.blobA, phase: 0.66 },
    { x: 120, y: 900, r: 320, color: theme.blobB, phase: 0.15 }
  ];
  for (const blob of blobs) {
    const pulse = 1 + art.wave(t, 1, blob.phase) * 0.05;
    const radial = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r * pulse);
    radial.addColorStop(0, art.alpha(blob.color, 0.55));
    radial.addColorStop(1, art.alpha(blob.color, 0));
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, DESIGN, DESIGN);
  }

  // Drifting polka dots.
  const tile = 78;
  const drift = (t * tile) % tile;
  ctx.fillStyle = art.alpha(theme.dots, 0.45);
  for (let y = -tile; y < DESIGN + tile; y += tile) {
    for (let x = -tile; x < DESIGN + tile; x += tile) {
      const odd = Math.round(y / tile) % 2 === 0;
      ctx.beginPath();
      ctx.arc(x + (odd ? tile / 2 : 0) + drift * 0.35, y + drift, 5.5, 0, TAU);
      ctx.fill();
    }
  }

  // Scalloped cloud bands top and bottom.
  art.scallopBand(ctx, 46, DESIGN, 34, art.alpha('#ffffff', 0.5), false);
  art.scallopBand(ctx, DESIGN - 116, DESIGN, 34, art.alpha('#ffffff', 0.5), true);
}

function paintDecor(ctx, layout, t) {
  const { theme } = layout.style;
  const { items, risers } = layout.decor;

  const palette = [theme.accent, theme.accentSoft, theme.tape, '#ffffff', theme.blobB];

  items.forEach((item, i) => {
    const bob = art.wave(t, item.cycles, item.phase) * item.amp;
    const spin = item.rotation + art.wave(t, 1, item.phase) * 0.18;
    const color = palette[i % palette.length];

    ctx.save();
    ctx.globalAlpha = item.opacity;
    switch (item.kind) {
      case 'heart':
        // Thin outline only reads well on the bigger hearts.
        art.heart(ctx, item.x, item.y + bob, item.size, spin, color, item.size > 30 ? art.alpha('#ffffff', 0.7) : null);
        break;
      case 'star':
        art.star(ctx, item.x, item.y + bob, item.size * 0.6, spin, theme.tape);
        break;
      case 'sparkle': {
        const pulse = 0.65 + (art.wave(t, 2, item.phase) + 1) * 0.25;
        art.sparkle(ctx, item.x, item.y + bob, item.size * 0.75 * pulse, '#ffffff', spin);
        break;
      }
      case 'cloud':
        art.cloud(ctx, item.x, item.y + bob, item.size * 2.1, art.alpha('#ffffff', 0.85), null);
        break;
      case 'bow':
        art.ribbonBow(ctx, item.x, item.y + bob, item.size * 1.1, theme.accentSoft);
        break;
      default:
        art.flower(ctx, item.x, item.y + bob, item.size * 0.8, theme.accentSoft, theme.tape, spin);
    }
    ctx.restore();
  });

  // Looping upward drift: fade in at the bottom, fade out at the top.
  const span = 360;
  for (const riser of risers) {
    const progress = (riser.offset + t * riser.speed) % 1;
    const y = layout.card.y + layout.card.h * 0.9 - progress * span;
    const x = riser.x + Math.sin(progress * TAU) * riser.sway;
    const fade = Math.sin(progress * Math.PI);

    ctx.save();
    ctx.globalAlpha = 0.15 + fade * 0.6;
    if (riser.kind === 'heart') {
      art.heart(ctx, x, y, riser.size, riser.rotation + progress * 0.8, theme.accent);
    } else {
      art.sparkle(ctx, x, y, riser.size * 0.7, '#ffffff', progress * TAU);
    }
    ctx.restore();
  }
}

function paintCard(ctx, layout, t) {
  const { theme } = layout.style;
  const { card } = layout;
  const radius = 62;

  // Glow halo that gently breathes.
  ctx.save();
  ctx.globalAlpha = 0.35 + (art.wave(t, 1, 0.2) + 1) * 0.08;
  art.roundRectPath(ctx, card.x - 16, card.y - 16, card.w + 32, card.h + 32, radius + 14);
  ctx.fillStyle = art.alpha(theme.accentSoft, 0.5);
  ctx.fill();
  ctx.restore();

  // Sticker-style outline + drop shadow.
  ctx.save();
  ctx.shadowColor = art.alpha(theme.ink, 0.18);
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  art.roundRectPath(ctx, card.x, card.y, card.w, card.h, radius);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  art.roundRectPath(ctx, card.x, card.y, card.w, card.h, radius);
  ctx.fillStyle = theme.card;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = theme.cardEdge;
  ctx.stroke();

  // Stitched inner border.
  art.dashedRoundRect(
    ctx, card.x + 22, card.y + 22, card.w - 44, card.h - 44,
    radius - 16, art.alpha(theme.accent, 0.45), 4, [16, 16]
  );

  // Washi tape on two corners.
  art.washiTape(ctx, card.x + 14, card.y + 40, 190, 46, -Math.PI / 4.4, theme.tape);
  art.washiTape(ctx, card.x + card.w - 14, card.y + card.h - 40, 190, 46, -Math.PI / 4.4, theme.accentSoft);

  // Slow shine sweep across the card.
  ctx.save();
  art.roundRectPath(ctx, card.x, card.y, card.w, card.h, radius);
  ctx.clip();
  const sweep = -card.w + ((t * (card.w * 2.4)) % (card.w * 2.4));
  const shine = ctx.createLinearGradient(card.x + sweep, card.y, card.x + sweep + 320, card.y + card.h);
  shine.addColorStop(0, 'rgba(255,255,255,0)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(card.x, card.y, card.w, card.h);
  ctx.restore();
}

function paintHeader(ctx, layout, t) {
  const { theme } = layout.style;
  const { card } = layout;
  const centerX = DESIGN / 2;

  const bob = art.wave(t, 1, 0) * 5;

  if (layout.showMascot) {
    // Optional: CARD_MASCOT=true brings back the animal peeking over the card.
    const blink = t >= 0.74 && t < 0.82;
    art.mascot(ctx, layout.style.mascot, centerX, card.y + 6 + bob, 78, theme, {
      blink,
      tilt: art.wave(t, 1, 0.25) * 0.05
    });
  } else {
    // A small letter mark: a menfess is a message, so the envelope earns its place.
    const pulse = 1 + art.wave(t, 2, 0.1) * 0.04;
    art.moodIcon(ctx, 'envelope', centerX, card.y + 74 + bob, 76, theme, { pulse });
  }

  // Brand title.
  const titleY = card.y + 156;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font('display', 66, '800');

  const titleGradient = ctx.createLinearGradient(centerX - 220, titleY - 50, centerX + 220, titleY + 10);
  titleGradient.addColorStop(0, theme.accent);
  titleGradient.addColorStop(1, theme.accentDeep);

  ctx.save();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#ffffff';
  ctx.lineJoin = 'round';
  ctx.shadowColor = art.alpha(theme.accentDeep, 0.28);
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  ctx.strokeText(layout.brand, centerX, titleY);
  ctx.restore();
  ctx.fillStyle = titleGradient;
  ctx.fillText(layout.brand, centerX, titleY);

  // Twinkles beside the title.
  const titleWidth = ctx.measureText(layout.brand).width;
  const pulse = 0.7 + (art.wave(t, 2, 0.1) + 1) * 0.2;
  art.sparkle(ctx, centerX - titleWidth / 2 - 46, titleY - 26, 20 * pulse, theme.tape, 0.3);
  art.sparkle(ctx, centerX + titleWidth / 2 + 46, titleY - 34, 15 * pulse, theme.accent, -0.2);
  art.heart(ctx, centerX + titleWidth / 2 + 30, titleY + 4, 20, 0.3, theme.accentSoft);
  art.heart(ctx, centerX - titleWidth / 2 - 26, titleY + 8, 16, -0.3, theme.accentSoft);

  // Mood pill: drawn icon + label, no emoji involved.
  ctx.font = font('body', 27, '600');
  const labelWidth = ctx.measureText(layout.mood.label).width;
  const iconSize = 38;
  const gap = 14;
  const pillHeight = 54;
  const pillWidth = labelWidth + iconSize + gap + 56;
  const pillY = titleY + 24;
  const pillMidY = pillY + pillHeight / 2;

  art.roundRectPath(ctx, centerX - pillWidth / 2, pillY, pillWidth, pillHeight, pillHeight / 2);
  ctx.fillStyle = art.alpha(theme.accentSoft, 0.55);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = art.alpha(theme.accent, 0.5);
  ctx.stroke();

  art.moodIcon(ctx, layout.mood.icon, centerX - pillWidth / 2 + 28 + iconSize / 2, pillMidY, iconSize, theme);

  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(layout.mood.label, centerX - pillWidth / 2 + 28 + iconSize + gap, pillMidY + 2);
  ctx.textAlign = 'center';
}

function paintBody(ctx, layout) {
  const { theme } = layout.style;
  const centerX = DESIGN / 2;

  // Decorative quote marks, tucked into the corners of the text block.
  const textHeight = layout.lines.length * layout.lineHeight;
  ctx.save();
  ctx.font = font('display', 84, '800');
  ctx.fillStyle = art.alpha(theme.accentSoft, 0.7);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('“', layout.card.x + 40, layout.textTop + 46);
  ctx.textAlign = 'right';
  ctx.fillText('”', layout.card.x + layout.card.w - 40, layout.textTop + textHeight + 34);
  ctx.restore();

  ctx.font = font('hand', layout.fontSize, '600');
  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  layout.lines.forEach((line, i) => {
    ctx.fillText(line, centerX, layout.textTop + i * layout.lineHeight + layout.lineHeight / 2);
  });
}

function paintFooter(ctx, layout, t) {
  const { theme } = layout.style;
  const { card } = layout;
  const centerX = DESIGN / 2;
  const baseY = card.y + card.h;

  art.dottedDivider(ctx, centerX, baseY - 128, card.w * 0.52, art.alpha(theme.accent, 0.45), theme.accent);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (layout.handle) {
    ctx.font = font('body', 32, '700');
    ctx.fillStyle = theme.accentDeep;
    ctx.fillText(layout.handle, centerX, baseY - 80);
  }

  // Without a handle the date takes its place instead of leaving a gap.
  ctx.font = font('body', 24, '500');
  ctx.fillStyle = theme.inkSoft;
  ctx.fillText(`${layout.dateLabel}  •  anonim`, centerX, baseY - (layout.handle ? 40 : 66));

  // Sticker sitting on the bottom-left card edge, gently bobbing.
  const bob = art.wave(t, 1, 0.4) * 8;
  const spin = art.wave(t, 1, 0.6) * 0.06;
  ctx.save();
  ctx.translate(card.x + 82, baseY - 26 + bob);
  ctx.rotate(spin);
  art.sticker(ctx, layout.style.sticker, 0, 0, 96, theme);
  ctx.restore();

  // Tagline below the card, flanked by two small drawn hearts.
  ctx.font = font('hand', 28, '600');
  ctx.fillStyle = art.alpha(theme.ink, 0.6);
  const taglineY = Math.min(DESIGN - 34, baseY + 62);
  ctx.fillText(layout.tagline, centerX, taglineY);

  const taglineWidth = ctx.measureText(layout.tagline).width;
  art.heart(ctx, centerX - taglineWidth / 2 - 26, taglineY - 2, 18, -0.25, art.alpha(theme.accent, 0.75));
  art.heart(ctx, centerX + taglineWidth / 2 + 26, taglineY - 2, 18, 0.25, art.alpha(theme.accent, 0.75));
}

/**
 * Draws the full card into ctx at animation phase t.
 * @param {CanvasRenderingContext2D} ctx - context already scaled to design space
 * @param {object} layout - from buildLayout()
 * @param {number} t - 0..1 animation phase (0 for the static PNG)
 */
function renderScene(ctx, layout, t = 0) {
  if (!layout.decor) {
    layout.decor = buildDecorations(layout.style.random, layout.card);
  }

  ctx.save();
  paintBackground(ctx, layout, t);
  paintDecor(ctx, layout, t);
  paintCard(ctx, layout, t);
  paintHeader(ctx, layout, t);
  paintBody(ctx, layout);
  paintFooter(ctx, layout, t);
  ctx.restore();
}

module.exports = {
  DESIGN,
  buildLayout,
  renderScene,
  wrapText,
  formatDate
};
