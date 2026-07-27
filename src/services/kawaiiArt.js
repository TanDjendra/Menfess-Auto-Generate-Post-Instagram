/**
 * Kawaii drawing toolkit.
 *
 * Everything here is drawn with plain canvas paths (no external image assets),
 * and every shape takes a plain coordinate space of 1080x1080 "design units".
 * The caller scales the context, so the exact same code renders the 1080px PNG
 * and the small animated GIF frames.
 */

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ *
 * basic helpers
 * ------------------------------------------------------------------ */

function withState(ctx, fn) {
  ctx.save();
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  };
}

/** Same colour with an alpha channel, e.g. alpha('#ff6f9c', 0.2). */
function alpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Mixes two hex colours, amount 0 = a, 1 = b. */
function mix(a, b, amount) {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  const r = Math.round(c1.r + (c2.r - c1.r) * amount);
  const g = Math.round(c1.g + (c2.g - c1.g) * amount);
  const bl = Math.round(c1.b + (c2.b - c1.b) * amount);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Loop-safe sine wave: phase in turns, returns -1..1, seamless for t in [0,1). */
function wave(t, cycles = 1, phase = 0) {
  return Math.sin((t * cycles + phase) * TAU);
}

/* ------------------------------------------------------------------ *
 * decorative shapes
 * ------------------------------------------------------------------ */

function heart(ctx, cx, cy, size, rotation = 0, fill = '#ff6f9c', outline = null) {
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.scale(size / 100, size / 100);
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.bezierCurveTo(-55, -14, -34, -62, 0, -34);
    ctx.bezierCurveTo(34, -62, 55, -14, 0, 30);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (outline) {
      ctx.lineWidth = 7;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }
  });
}

function star(ctx, cx, cy, size, rotation = 0, fill = '#ffd166', points = 5, innerRatio = 0.46) {
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? size : size * innerRatio;
      const angle = (i / (points * 2)) * TAU - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  });
}

/** Four-point twinkle / sparkle. */
function sparkle(ctx, cx, cy, size, fill = '#ffffff', rotation = 0) {
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 0.16, -size * 0.16, size, 0);
    ctx.quadraticCurveTo(size * 0.16, size * 0.16, 0, size);
    ctx.quadraticCurveTo(-size * 0.16, size * 0.16, -size, 0);
    ctx.quadraticCurveTo(-size * 0.16, -size * 0.16, 0, -size);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  });
}

function cloud(ctx, cx, cy, width, fill = '#ffffff', outline = null) {
  const u = width / 100;
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.scale(u, u);
    ctx.beginPath();
    ctx.arc(-28, 4, 22, 0, TAU);
    ctx.arc(-2, -12, 28, 0, TAU);
    ctx.arc(28, 2, 24, 0, TAU);
    ctx.arc(2, 14, 22, 0, TAU);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (outline) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }
  });
}

function flower(ctx, cx, cy, size, petal = '#ffb6cd', core = '#ffd166', rotation = 0) {
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.fillStyle = petal;
    for (let i = 0; i < 5; i++) {
      withState(ctx, () => {
        ctx.rotate((i / 5) * TAU);
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.6, size * 0.36, size * 0.6, 0, 0, TAU);
        ctx.fill();
      });
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.34, 0, TAU);
    ctx.fillStyle = core;
    ctx.fill();
  });
}

function ribbonBow(ctx, cx, cy, size, fill = '#ff8ab0', outline = null) {
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.scale(size / 100, size / 100);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-46, -34, -60, 18, -8, 12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(46, -34, 60, 18, 8, 12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 4, 12, 11, 0, 0, TAU);
    ctx.fill();
    if (outline) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }
  });
}

/** Dashed rounded border used as the "stitched" inner frame of the card. */
function dashedRoundRect(ctx, x, y, w, h, r, color, lineWidth = 4, dash = [14, 14]) {
  withState(ctx, () => {
    ctx.setLineDash(dash);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    roundRectPath(ctx, x, y, w, h, r);
    ctx.stroke();
  });
}

/** Washi tape strip stuck on a card corner. */
function washiTape(ctx, cx, cy, w, h, rotation, color) {
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // torn-look stripes
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    for (let i = -w / 2; i < w / 2; i += 18) {
      ctx.fillRect(i, -h / 2, 7, h);
    }
  });
}

/** Row of small dots with a heart in the middle - a cute text divider. */
function dottedDivider(ctx, cx, cy, width, color, heartColor) {
  const count = 9;
  const gap = width / (count - 1);
  for (let i = 0; i < count; i++) {
    const x = cx - width / 2 + i * gap;
    if (i === Math.floor(count / 2)) {
      heart(ctx, x, cy, 26, 0, heartColor);
      continue;
    }
    ctx.beginPath();
    ctx.arc(x, cy, 4.5, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/** Scalloped (cloud-like) band along an edge. */
function scallopBand(ctx, y, width, bumpRadius, color, flip = false) {
  withState(ctx, () => {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (flip) {
      ctx.moveTo(0, y + bumpRadius);
      for (let x = 0; x <= width + bumpRadius; x += bumpRadius * 2) {
        ctx.arc(x + bumpRadius, y + bumpRadius, bumpRadius, Math.PI, 0, true);
      }
      ctx.lineTo(width, y + bumpRadius * 2);
      ctx.lineTo(0, y + bumpRadius * 2);
    } else {
      ctx.moveTo(0, y);
      for (let x = 0; x <= width + bumpRadius; x += bumpRadius * 2) {
        ctx.arc(x + bumpRadius, y, bumpRadius, Math.PI, 0, false);
      }
      ctx.lineTo(width, 0);
      ctx.lineTo(0, 0);
    }
    ctx.closePath();
    ctx.fill();
  });
}

/* ------------------------------------------------------------------ *
 * mascots
 * ------------------------------------------------------------------ */

function eyes(ctx, cx, cy, r, ink, blink) {
  const dx = r * 0.36;
  const eyeY = cy + r * 0.02;
  const eyeR = r * 0.13;

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = r * 0.09;
  ctx.lineCap = 'round';

  for (const sign of [-1, 1]) {
    const ex = cx + sign * dx;
    if (blink) {
      // happy closed eye: upward arc
      ctx.beginPath();
      ctx.arc(ex, eyeY + eyeR * 0.4, eyeR * 1.1, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeR * 0.92, eyeR * 1.12, 0, 0, TAU);
      ctx.fill();
      // glossy highlight
      ctx.beginPath();
      ctx.arc(ex - eyeR * 0.3, eyeY - eyeR * 0.42, eyeR * 0.3, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.fillStyle = ink;
    }
  }
}

function blush(ctx, cx, cy, r, color) {
  withState(ctx, () => {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = color;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + sign * r * 0.62, cy + r * 0.3, r * 0.17, r * 0.11, 0, 0, TAU);
      ctx.fill();
    }
  });
}

function smileMouth(ctx, cx, cy, r, ink) {
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * 0.075;
  ctx.lineCap = 'round';
  // little "w" shaped kawaii mouth
  ctx.beginPath();
  ctx.arc(cx - r * 0.08, cy + r * 0.3, r * 0.085, 0, Math.PI);
  ctx.arc(cx + r * 0.08, cy + r * 0.3, r * 0.085, 0, Math.PI);
  ctx.stroke();
}

/**
 * Draws a kawaii animal head.
 * @param {string} type - bear | cat | bunny | panda | frog | chick
 * @param {object} palette - theme object
 * @param {object} [opts] - { blink, tilt }
 */
function mascot(ctx, type, cx, cy, r, palette, opts = {}) {
  const { blink = false, tilt = 0 } = opts;
  const ink = '#4a3b46';
  const outline = palette.accentDeep;

  const skins = {
    bear: '#ffe4c4',
    cat: '#fff7f0',
    bunny: '#fffdfb',
    panda: '#ffffff',
    frog: '#c7ecb0',
    chick: '#ffe28a'
  };
  const skin = skins[type] || '#fffaf5';

  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.lineJoin = 'round';

    // ears / head-top details drawn before the face circle
    const earFill = type === 'panda' ? '#4a3b46' : skin;
    if (type === 'bear' || type === 'panda') {
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sign * r * 0.68, -r * 0.7, r * 0.3, 0, TAU);
        ctx.fillStyle = earFill;
        ctx.fill();
        if (type !== 'panda') {
          ctx.lineWidth = r * 0.07;
          ctx.strokeStyle = outline;
          ctx.stroke();
        }
      }
    } else if (type === 'cat') {
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sign * r * 0.28, -r * 0.78);
        ctx.lineTo(sign * r * 0.86, -r * 1.16);
        ctx.lineTo(sign * r * 0.88, -r * 0.42);
        ctx.closePath();
        ctx.fillStyle = skin;
        ctx.fill();
        ctx.lineWidth = r * 0.07;
        ctx.strokeStyle = outline;
        ctx.stroke();
        // inner ear
        ctx.beginPath();
        ctx.moveTo(sign * r * 0.44, -r * 0.74);
        ctx.lineTo(sign * r * 0.76, -r * 0.98);
        ctx.lineTo(sign * r * 0.77, -r * 0.56);
        ctx.closePath();
        ctx.fillStyle = palette.accentSoft;
        ctx.fill();
      }
    } else if (type === 'bunny') {
      for (const sign of [-1, 1]) {
        withState(ctx, () => {
          ctx.rotate(sign * 0.16);
          ctx.beginPath();
          ctx.ellipse(sign * r * 0.38, -r * 1.06, r * 0.19, r * 0.52, 0, 0, TAU);
          ctx.fillStyle = skin;
          ctx.fill();
          ctx.lineWidth = r * 0.07;
          ctx.strokeStyle = outline;
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(sign * r * 0.38, -r * 1.02, r * 0.09, r * 0.34, 0, 0, TAU);
          ctx.fillStyle = palette.accentSoft;
          ctx.fill();
        });
      }
    } else if (type === 'chick') {
      // hair tuft
      ctx.beginPath();
      ctx.moveTo(-r * 0.12, -r * 0.92);
      ctx.quadraticCurveTo(0, -r * 1.42, r * 0.18, -r * 0.9);
      ctx.closePath();
      ctx.fillStyle = skin;
      ctx.fill();
      ctx.lineWidth = r * 0.06;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }

    // head
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.lineWidth = r * 0.075;
    ctx.strokeStyle = outline;
    ctx.stroke();

    if (type === 'frog') {
      // eyes bulge on top of the head
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sign * r * 0.58, -r * 0.72, r * 0.3, 0, TAU);
        ctx.fillStyle = skin;
        ctx.fill();
        ctx.lineWidth = r * 0.07;
        ctx.strokeStyle = outline;
        ctx.stroke();
        if (!blink) {
          ctx.beginPath();
          ctx.arc(sign * r * 0.58, -r * 0.72, r * 0.12, 0, TAU);
          ctx.fillStyle = ink;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(sign * r * 0.58 - r * 0.13, -r * 0.72);
          ctx.lineTo(sign * r * 0.58 + r * 0.13, -r * 0.72);
          ctx.lineWidth = r * 0.06;
          ctx.strokeStyle = ink;
          ctx.stroke();
        }
      }
      // wide smile
      ctx.beginPath();
      ctx.arc(0, r * 0.05, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = r * 0.08;
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      ctx.stroke();
      blush(ctx, 0, r * 0.12, r, palette.accentSoft);
      return;
    }

    if (type === 'panda') {
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sign * r * 0.38, r * 0.02, r * 0.26, r * 0.29, sign * 0.25, 0, TAU);
        ctx.fillStyle = '#4a3b46';
        ctx.fill();
      }
    }

    eyes(ctx, 0, 0, r, type === 'panda' ? '#ffffff' : ink, blink);

    // nose / snout
    if (type === 'bear' || type === 'panda') {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.24, r * 0.19, r * 0.11, 0, 0, TAU);
      ctx.fillStyle = type === 'panda' ? '#4a3b46' : palette.accentSoft;
      ctx.fill();
    } else if (type === 'chick') {
      ctx.beginPath();
      ctx.moveTo(-r * 0.16, r * 0.18);
      ctx.lineTo(r * 0.16, r * 0.18);
      ctx.lineTo(0, r * 0.42);
      ctx.closePath();
      ctx.fillStyle = '#ffa726';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, r * 0.16);
      ctx.lineTo(r * 0.1, r * 0.16);
      ctx.lineTo(0, r * 0.28);
      ctx.closePath();
      ctx.fillStyle = palette.accent;
      ctx.fill();
    }

    if (type === 'cat') {
      // whiskers
      ctx.lineWidth = r * 0.045;
      ctx.strokeStyle = alpha(ink, 0.55);
      for (const sign of [-1, 1]) {
        for (const off of [-0.08, 0.06]) {
          ctx.beginPath();
          ctx.moveTo(sign * r * 0.58, r * (0.12 + off));
          ctx.lineTo(sign * r * 1.02, r * (0.06 + off * 1.6));
          ctx.stroke();
        }
      }
    }

    if (type !== 'chick') smileMouth(ctx, 0, r * 0.02, r, ink);
    blush(ctx, 0, r * 0.06, r, palette.accentSoft);
  });
}

/* ------------------------------------------------------------------ *
 * stickers
 * ------------------------------------------------------------------ */

function stickerBoba(ctx, cx, cy, size, palette) {
  const u = size / 100;
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.scale(u, u);
    // cup
    ctx.beginPath();
    ctx.moveTo(-34, -34);
    ctx.lineTo(34, -34);
    ctx.lineTo(26, 52);
    ctx.lineTo(-26, 52);
    ctx.closePath();
    ctx.fillStyle = '#fff6ea';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = palette.accentDeep;
    ctx.stroke();
    // tea
    ctx.save();
    ctx.clip();
    ctx.fillStyle = mix(palette.accentSoft, '#c98b5e', 0.45);
    ctx.fillRect(-40, -10, 80, 70);
    ctx.fillStyle = '#4a3b46';
    const pearls = [[-14, 40], [2, 44], [16, 38], [-6, 30], [12, 26]];
    for (const [px, py] of pearls) {
      ctx.beginPath();
      ctx.arc(px, py, 6.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // lid + straw
    ctx.beginPath();
    roundRectPath(ctx, -40, -46, 80, 16, 8);
    ctx.fillStyle = palette.accent;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(6, -44);
    ctx.lineTo(20, -84);
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.strokeStyle = palette.accentDeep;
    ctx.stroke();
    // face, kept on the light part of the cup so it stays readable
    eyes(ctx, 0, -16, 30, '#4a3b46', false);
    smileMouth(ctx, 0, -14, 30, '#4a3b46');
    blush(ctx, 0, -14, 30, palette.accentSoft);
  });
}

function stickerRainbowCloud(ctx, cx, cy, size, palette) {
  const u = size / 100;
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.scale(u, u);
    const bands = ['#ff8fa3', '#ffc36e', '#ffe066', '#8ee6a8', '#8fd3ff', '#c9a7ff'];
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    bands.forEach((color, i) => {
      ctx.beginPath();
      ctx.arc(0, 34, 30 + i * 10, Math.PI * 1.05, Math.PI * 1.95);
      ctx.strokeStyle = color;
      ctx.stroke();
    });
    cloud(ctx, -34, 34, 62, '#ffffff', palette.cardEdge);
    cloud(ctx, 40, 34, 62, '#ffffff', palette.cardEdge);
  });
}

function stickerCupcake(ctx, cx, cy, size, palette) {
  const u = size / 100;
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.scale(u, u);
    // frosting
    ctx.beginPath();
    ctx.arc(-16, -14, 20, 0, TAU);
    ctx.arc(16, -14, 20, 0, TAU);
    ctx.arc(0, -32, 20, 0, TAU);
    ctx.closePath();
    ctx.fillStyle = palette.accentSoft;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = palette.accentDeep;
    ctx.stroke();
    // cup
    ctx.beginPath();
    ctx.moveTo(-34, 2);
    ctx.lineTo(34, 2);
    ctx.lineTo(24, 54);
    ctx.lineTo(-24, 54);
    ctx.closePath();
    ctx.fillStyle = '#fff2dd';
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 5;
    for (let i = -20; i <= 20; i += 13) {
      ctx.beginPath();
      ctx.moveTo(i, 4);
      ctx.lineTo(i * 0.72, 52);
      ctx.strokeStyle = alpha(palette.accentDeep, 0.35);
      ctx.stroke();
    }
    heart(ctx, 0, -50, 26, 0, palette.accent);
  });
}

function stickerLetter(ctx, cx, cy, size, palette) {
  const u = size / 100;
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.scale(u, u);
    roundRectPath(ctx, -46, -32, 92, 64, 10);
    ctx.fillStyle = '#fffdf7';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = palette.accentDeep;
    ctx.stroke();
    // opened flap
    ctx.beginPath();
    ctx.moveTo(-46, -30);
    ctx.lineTo(0, 8);
    ctx.lineTo(46, -30);
    ctx.closePath();
    ctx.fillStyle = palette.accentSoft;
    ctx.fill();
    ctx.stroke();
    heart(ctx, 0, 2, 46, 0, palette.accent, '#ffffff');
    sparkle(ctx, 44, -44, 15, palette.tape, 0.3);
  });
}

function stickerMoon(ctx, cx, cy, size, palette) {
  const u = size / 100;
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.scale(u, u);
    ctx.beginPath();
    ctx.arc(0, 0, 44, Math.PI * 0.28, Math.PI * 1.72);
    ctx.quadraticCurveTo(6, 0, 12, -34);
    ctx.closePath();
    ctx.fillStyle = '#ffe9a8';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#e5b95a';
    ctx.stroke();
    eyes(ctx, -8, 0, 30, '#6b5330', false);
    blush(ctx, -8, 4, 30, palette.accentSoft);
    star(ctx, 52, -40, 13, 0.3, '#ffd166');
    star(ctx, 42, 40, 9, 0.7, '#ffd166');
  });
}

function stickerFlower(ctx, cx, cy, size, palette) {
  withState(ctx, () => {
    flower(ctx, cx - size * 0.1, cy - size * 0.08, size * 0.5, palette.accentSoft, '#ffd166', 0.2);
    flower(ctx, cx + size * 0.34, cy + size * 0.24, size * 0.34, palette.accent, '#fff3c4', -0.4);
    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = '#8ec98a';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.1, cy + size * 0.3);
    ctx.quadraticCurveTo(cx - size * 0.26, cy + size * 0.6, cx - size * 0.12, cy + size * 0.82);
    ctx.stroke();
  });
}

/* ------------------------------------------------------------------ *
 * mood icons - small hand-drawn glyphs used instead of emoji
 * Each one is drawn inside a box of `size` centred on (cx, cy).
 * ------------------------------------------------------------------ */

/** Envelope with a heart peeking out - the menfess mark. */
function iconEnvelope(ctx, cx, cy, size, palette, opts = {}) {
  const w = size;
  const h = size * 0.72;
  const line = Math.max(1.6, size * 0.075);

  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.lineJoin = 'round';

    roundRectPath(ctx, -w / 2, -h / 2, w, h, size * 0.12);
    ctx.fillStyle = '#fffdf9';
    ctx.fill();
    ctx.lineWidth = line;
    ctx.strokeStyle = palette.accentDeep;
    ctx.stroke();

    // open flap
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2 + line * 0.2);
    ctx.lineTo(0, h * 0.14);
    ctx.lineTo(w / 2, -h / 2 + line * 0.2);
    ctx.closePath();
    ctx.fillStyle = palette.accentSoft;
    ctx.fill();
    ctx.stroke();

    const pulse = opts.pulse === undefined ? 1 : opts.pulse;
    heart(ctx, 0, h * 0.04, size * 0.42 * pulse, 0, palette.accent, '#ffffff');
  });
}

/** Heart with a little plaster on it - "needs a hug". */
function iconMendedHeart(ctx, cx, cy, size, palette) {
  withState(ctx, () => {
    heart(ctx, cx, cy - size * 0.02, size * 1.05, 0, palette.accent, '#ffffff');
    ctx.translate(cx, cy);
    ctx.rotate(-0.5);
    roundRectPath(ctx, -size * 0.26, -size * 0.075, size * 0.52, size * 0.15, size * 0.07);
    ctx.fillStyle = '#fff8ec';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.strokeStyle = palette.accentDeep;
    ctx.stroke();
    // stitches
    ctx.fillStyle = palette.accentDeep;
    for (const dx of [-0.1, 0.1]) {
      ctx.beginPath();
      ctx.arc(size * dx, 0, size * 0.025, 0, TAU);
      ctx.fill();
    }
  });
}

function iconBook(ctx, cx, cy, size, palette) {
  const w = size * 0.94;
  const h = size * 0.74;
  const line = Math.max(1.4, size * 0.06);

  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.lineJoin = 'round';
    ctx.lineWidth = line;
    ctx.strokeStyle = palette.accentDeep;

    // two pages meeting at the spine
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.32);
    ctx.quadraticCurveTo(-w * 0.5, -h * 0.5, -w * 0.5, -h * 0.24);
    ctx.lineTo(-w * 0.5, h * 0.36);
    ctx.quadraticCurveTo(-w * 0.25, h * 0.2, 0, h * 0.42);
    ctx.quadraticCurveTo(w * 0.25, h * 0.2, w * 0.5, h * 0.36);
    ctx.lineTo(w * 0.5, -h * 0.24);
    ctx.quadraticCurveTo(w * 0.5, -h * 0.5, 0, -h * 0.32);
    ctx.closePath();
    ctx.fillStyle = '#fffdf7';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -h * 0.32);
    ctx.lineTo(0, h * 0.42);
    ctx.stroke();

    // bookmark ribbon
    ctx.beginPath();
    ctx.moveTo(w * 0.24, -h * 0.36);
    ctx.lineTo(w * 0.24, h * 0.1);
    ctx.lineWidth = line * 1.6;
    ctx.strokeStyle = palette.accent;
    ctx.stroke();
  });
}

function iconConfetti(ctx, cx, cy, size, palette) {
  withState(ctx, () => {
    ctx.translate(cx, cy);
    const colors = [palette.accent, palette.tape, palette.accentSoft, palette.blobB];

    // party popper cone
    ctx.beginPath();
    ctx.moveTo(-size * 0.46, size * 0.44);
    ctx.lineTo(-size * 0.02, size * 0.06);
    ctx.lineTo(-size * 0.16, -size * 0.16);
    ctx.closePath();
    ctx.fillStyle = palette.accentDeep;
    ctx.fill();

    // bits flying out
    const bits = [
      [0.14, -0.34, 0.2], [0.38, -0.14, 0.16], [0.28, 0.16, 0.14],
      [0.02, -0.06, 0.13], [0.46, 0.32, 0.12]
    ];
    bits.forEach(([bx, by, r], i) => {
      ctx.beginPath();
      ctx.ellipse(size * bx, size * by, size * r * 0.5, size * r * 0.32, i * 0.7, 0, TAU);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
    });
    star(ctx, size * 0.2, -size * 0.44, size * 0.16, 0.2, palette.tape);
  });
}

function iconBowl(ctx, cx, cy, size, palette) {
  const line = Math.max(1.4, size * 0.065);
  withState(ctx, () => {
    ctx.translate(cx, cy + size * 0.08);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // steam
    ctx.lineWidth = line;
    ctx.strokeStyle = alpha(palette.accentDeep, 0.6);
    for (const dx of [-0.2, 0.08]) {
      ctx.beginPath();
      ctx.moveTo(size * dx, -size * 0.28);
      ctx.quadraticCurveTo(size * (dx + 0.12), -size * 0.44, size * dx, -size * 0.58);
      ctx.stroke();
    }

    // bowl
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, -size * 0.1);
    ctx.quadraticCurveTo(0, size * 0.58, size * 0.5, -size * 0.1);
    ctx.closePath();
    ctx.fillStyle = '#fffdf7';
    ctx.fill();
    ctx.lineWidth = line;
    ctx.strokeStyle = palette.accentDeep;
    ctx.stroke();

    // soup line
    ctx.beginPath();
    ctx.moveTo(-size * 0.42, -size * 0.06);
    ctx.lineTo(size * 0.42, -size * 0.06);
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = line * 1.2;
    ctx.stroke();
  });
}

function iconTulip(ctx, cx, cy, size, palette) {
  const line = Math.max(1.4, size * 0.06);
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.lineJoin = 'round';

    // bloom
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, -size * 0.14);
    ctx.quadraticCurveTo(-size * 0.3, -size * 0.5, 0, -size * 0.52);
    ctx.quadraticCurveTo(size * 0.3, -size * 0.5, size * 0.28, -size * 0.14);
    ctx.quadraticCurveTo(0, size * 0.06, -size * 0.28, -size * 0.14);
    ctx.closePath();
    ctx.fillStyle = palette.accent;
    ctx.fill();
    ctx.lineWidth = line;
    ctx.strokeStyle = palette.accentDeep;
    ctx.stroke();

    // petal seams
    ctx.beginPath();
    ctx.moveTo(-size * 0.1, -size * 0.46);
    ctx.lineTo(-size * 0.13, -size * 0.06);
    ctx.moveTo(size * 0.1, -size * 0.46);
    ctx.lineTo(size * 0.13, -size * 0.06);
    ctx.lineWidth = line * 0.7;
    ctx.stroke();

    // stem + leaf
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size * 0.5);
    ctx.lineWidth = line * 1.1;
    ctx.strokeStyle = '#7cb87a';
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, size * 0.24);
    ctx.quadraticCurveTo(size * 0.34, size * 0.1, size * 0.36, size * 0.36);
    ctx.quadraticCurveTo(size * 0.14, size * 0.4, 0, size * 0.24);
    ctx.closePath();
    ctx.fillStyle = '#9ed49b';
    ctx.fill();
  });
}

function iconMoon(ctx, cx, cy, size, palette) {
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(size * 0.06, 0, size * 0.46, Math.PI * 0.32, Math.PI * 1.68);
    ctx.quadraticCurveTo(size * 0.1, 0, size * 0.18, -size * 0.36);
    ctx.closePath();
    ctx.fillStyle = palette.tape;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, size * 0.055);
    ctx.strokeStyle = palette.accentDeep;
    ctx.stroke();
    star(ctx, size * 0.42, -size * 0.34, size * 0.14, 0.2, palette.accent);
    star(ctx, size * 0.34, size * 0.36, size * 0.1, 0.5, palette.accentSoft);
  });
}

function iconSparkle(ctx, cx, cy, size, palette) {
  sparkle(ctx, cx - size * 0.12, cy - size * 0.04, size * 0.42, palette.accent, 0.1);
  sparkle(ctx, cx + size * 0.28, cy + size * 0.22, size * 0.22, palette.tape, -0.2);
  sparkle(ctx, cx + size * 0.22, cy - size * 0.3, size * 0.16, palette.accentSoft, 0.4);
}

const MOOD_ICONS = {
  envelope: iconEnvelope,
  mendedHeart: iconMendedHeart,
  book: iconBook,
  confetti: iconConfetti,
  bowl: iconBowl,
  tulip: iconTulip,
  moon: iconMoon,
  sparkle: iconSparkle
};

/**
 * Draws one of the hand-made mood icons.
 * @param {string} name - key of MOOD_ICONS
 */
function moodIcon(ctx, name, cx, cy, size, palette, opts) {
  const fn = MOOD_ICONS[name] || iconSparkle;
  fn(ctx, cx, cy, size, palette, opts);
}

const STICKER_RENDERERS = {
  boba: stickerBoba,
  rainbowCloud: stickerRainbowCloud,
  cupcake: stickerCupcake,
  letter: stickerLetter,
  moon: stickerMoon,
  flower: stickerFlower
};

function sticker(ctx, name, cx, cy, size, palette) {
  const fn = STICKER_RENDERERS[name] || stickerLetter;
  fn(ctx, cx, cy, size, palette);
}

module.exports = {
  TAU,
  withState,
  roundRectPath,
  alpha,
  mix,
  wave,
  heart,
  star,
  sparkle,
  cloud,
  flower,
  ribbonBow,
  dashedRoundRect,
  washiTape,
  dottedDivider,
  scallopBand,
  mascot,
  sticker,
  moodIcon,
  MOOD_ICONS,
  eyes,
  blush,
  smileMouth,
  STICKER_RENDERERS
};
