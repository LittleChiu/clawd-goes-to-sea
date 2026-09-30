// ─────────────────────────────────────────────────────────────
//  Clawd — the Claude Code mascot, drawn procedurally.
//  Canonical 1× shape (straight from the terminal logo ▐▛███▜▌):
//
//      ..############..
//      ..############..
//      ..##.######.##..
//      ..##.######.##..
//      ################
//      ################
//      ..############..
//      ..############..
//      ...#.#....#.#...
//      ...#.#....#.#...
//
//  At scale ≥ 2 we add shading, claw notches, eye shine & blush.
// ─────────────────────────────────────────────────────────────
import { C, mix } from './core.js';

export const CLAWD = {
  body: C('#D77757'),
  hi: C('#EC9B79'),
  sh: C('#B35A3D'),
  dk: C('#86412B'),
  eye: C('#1B1117'),
  shine: C('#FFFFFF'),
  blush: C('#F7A1A1'),
};

// Eye patterns on a half-canonical-pixel grid (u = s/2), for s ≥ 2.
// K = eye, W = shine, B = bag (shadow), P = blush.  o = offset in u from the canonical eye's top-left.
const EYE = {
  open:    { o: [0, 0],  p: ['KK', 'KK', 'KK', 'KK'] },
  openS:   { o: [0, 0],  p: ['WK', 'KK', 'KK', 'KK'] },
  blink:   { o: [0, 3],  p: ['KK'] },
  closed:  { o: [-1, 3], p: ['KKKK'] },
  half:    { o: [0, 2],  p: ['KK', 'KK'] },
  tired:   { o: [-1, 2], p: ['.KK.', '.KK.', '....', 'BBBB'] },
  happy:   { o: [-2, 1], p: ['..KK..', '.K..K.', 'K....K'] },
  wide:    { o: [0, -1], p: ['WK', 'KK', 'KK', 'KK', 'KK'] },
  sparkle: { o: [-1, -1], p: ['.KK.', 'WWKK', 'WKKK', 'KKKK', 'KKWK', '.KK.'] },
  dizzy:   { o: [-1, 0], p: ['K..K', '.KK.', '.KK.', 'K..K'] },
  look:    { o: [0, 0],  p: ['KK', 'KK', 'KK', 'KK'] },
};

// opt:
//  s        scale (1,2,3,4…)
//  eyes     'open'|'blink'|'half'|'tired'|'happy'|'wide'|'sparkle'|'closed'|'dizzy'|'none'
//  lx, ly   eye look offset in canonical px (-1..1, fractional ok at s≥2)
//  armL/armR  vertical arm offset in canonical px (−3 … +2), or 'up' (raised), 'hide'
//  legs     'stand'|'walk'|'hide'|'tuck', phase: 0..1 walk cycle, dir: ±1
//  sx, sy   squash/stretch in real px (body wider/taller)
//  tint, tintA  colour-grade the orange (e.g. night / screen light)
//  silhouette  draw everything in one colour
//  blush    bool
//  back     bool — seen from behind (no eyes)
export function drawClawd(g, cx, footY, opt = {}) {
  const s = opt.s || 1;
  const sx = opt.sx || 0, sy = opt.sy || 0;
  const bw = 12 * s + sx, bh = 8 * s + sy;
  const legH = opt.legs === 'hide' ? 0 : opt.legs === 'tuck' ? s : 2 * s;
  const left = Math.round(cx - bw / 2), top = Math.round(footY - legH - bh);
  const P = palette(opt);
  const u = Math.max(1, s >> 1);

  // legs
  if (opt.legs !== 'hide') {
    const ph = opt.phase || 0, walk = opt.legs === 'walk';
    const lifted = ph % 1 < 0.5 ? 0 : 1;
    [1, 3, 8, 10].forEach((lx, i) => {
      const pair = i % 2;
      const up = walk && pair === lifted ? Math.max(1, s >> 1) : 0;
      const shift = walk && pair === lifted ? Math.max(1, s >> 1) * (opt.dir || 1) : 0;
      g.rect(left + Math.round(lx * bw / 12) + shift, top + bh, s, legH - up, P.leg);
    });
  }

  // body
  g.rect(left, top, bw, bh, P.body);
  if (s >= 2 && !opt.silhouette) {
    g.rect(left, top, bw, u, P.hi);
    g.rect(left, top, u, bh - u, P.hi);
    g.rect(left, top + bh - u, bw, u, P.sh);
    g.rect(left + bw - u, top + u, u, bh - u, P.sh);
    if (s >= 3) { g.rect(left + 2 * u, top + u, 2 * u, u, P.shine); }
  }

  // arms
  const armY0 = top + Math.round(4 * bh / 8);
  drawArm(g, left, top, bw, armY0, s, -1, opt.armL ?? 0, P, opt);
  drawArm(g, left, top, bw, armY0, s, +1, opt.armR ?? 0, P, opt);

  // face
  if (!opt.back && !opt.silhouette && opt.eyes !== 'none') drawEyes(g, left, top, bw, bh, s, opt, P);
  return { left, top, bw, bh, eyeY: top + Math.round(2 * bh / 8) };
}

function palette(opt) {
  if (opt.silhouette) { const c = opt.silhouette; return { body: c, hi: c, sh: c, leg: c, arm: c, eye: c }; }
  const t = opt.tint, a = opt.tintA || 0;
  const f = c => (t && a ? mix(c, t, a) : c);
  return {
    body: f(CLAWD.body), hi: f(CLAWD.hi), sh: f(CLAWD.sh), dk: f(CLAWD.dk),
    leg: (opt.s || 1) >= 2 ? f(CLAWD.sh) : f(CLAWD.body),
    arm: f(CLAWD.body),
    eye: CLAWD.eye, shine: CLAWD.shine, blush: f(CLAWD.blush),
  };
}

function drawArm(g, left, top, bw, armY0, s, side, pose, P, opt) {
  if (pose === 'hide') return;
  const aw = 2 * s, ah = 2 * s, u = Math.max(1, s >> 1);
  const shaded = s >= 2 && !opt.silhouette;
  if (pose === 'up' || pose === 'wave') {                // raised diagonally: \o/
    // segment 1 hugs the side of the body (rows 1..3), segment 2 steps up and out
    const X1 = side < 0 ? left - aw : left + bw, Y1 = top + s;
    const X2 = X1 + side * s, Y2 = top - 2 * s + (pose === 'wave' ? (opt.wavePh || 0) * s : 0);
    g.rect(X1, Y1, aw, 3 * s, P.arm);
    g.rect(X2, Y2, aw, 3 * s, P.arm);
    if (shaded) {
      g.rect(X2, Y2, aw, u, P.hi);
      const nx = X2 + (aw >> 1) - (u >> 1);             // pincer notch at the tip
      g.rect(nx, Y2, u, u, opt.notch ?? P.sh);
      g.rect(side < 0 ? X1 + aw - u : X1, Y1 + 3 * s - u, u, u, P.sh);
    }
    return;
  }
  const X = side < 0 ? left - aw : left + bw;
  const Y = armY0 + Math.round(pose * s);
  if (!shaded) { g.rect(X, Y, aw, ah, P.arm); return; }
  // body of the claw, leaving a notch on the outer end (reads as an open pincer)
  const outerX = side < 0 ? X : X + aw - u;
  const innerX = side < 0 ? X + u : X;
  const notchY = Y + (ah >> 1) - (u >> 1);
  g.rect(innerX, Y, aw - u, ah, P.arm);
  g.rect(outerX, Y, u, notchY - Y, P.arm);
  g.rect(outerX, notchY + u, u, Y + ah - notchY - u, P.arm);
  g.rect(innerX, Y, aw - u, u, P.hi);
  g.rect(X, Y + ah - u, aw, u, P.sh);
}

function drawEyes(g, left, top, bw, bh, s, opt, P) {
  const e = opt.eyes || 'open';
  const lx = opt.lx || 0, ly = opt.ly || 0;
  const ex = [left + Math.round((2 + lx) * bw / 12), left + Math.round((9 + lx) * bw / 12)];
  const ey = top + Math.round((2 + ly) * bh / 8);
  if (s === 1) return eyes1(g, ex, ey, e, P);
  const u = s >> 1;
  const key = e === 'open' && s >= 3 ? 'openS' : e;
  const pat = EYE[key] || EYE.open;
  for (let k = 0; k < 2; k++) {
    const ox = ex[k] + pat.o[0] * u, oy = ey + pat.o[1] * u;
    pat.p.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        const col = ch === 'K' ? P.eye : ch === 'W' ? P.shine : ch === 'B' ? P.sh : P.blush;
        // mirror asymmetric shines on the right eye? keep same side (light from top-left)
        g.rect(ox + i * u, oy + j * u, u, u, col);
      }
    });
  }
  if (opt.blush) {
    g.rect(ex[0] - 2 * u, ey + 5 * u, 3 * u, u, P.blush);
    g.rect(ex[1] + u, ey + 5 * u, 3 * u, u, P.blush);
  }
}

function eyes1(g, ex, ey, e, P) {
  for (const X of ex) {
    switch (e) {
      case 'blink': case 'half': case 'tired': g.px(X, ey + 1, P.eye); break;
      case 'closed': g.rect(X - 1, ey + 1, 2, 1, P.eye); break;
      case 'happy': g.px(X - 1, ey + 1, P.eye); g.px(X, ey, P.eye); g.px(X + 1, ey + 1, P.eye); break;
      case 'wide': g.rect(X, ey - 1, 1, 3, P.eye); break;
      case 'sparkle': g.rect(X, ey - 1, 1, 3, P.eye); g.px(X, ey - 1, P.shine); break;
      case 'dizzy': g.px(X - 1, ey - 1, P.eye); g.px(X + 1, ey - 1, P.eye); g.px(X, ey, P.eye); g.px(X - 1, ey + 1, P.eye); g.px(X + 1, ey + 1, P.eye); break;
      default: g.rect(X, ey, 1, 2, P.eye);
    }
  }
}

// Little emotes that float near a head. (x, y) = top-left, s = pixel size.
export function emote(g, kind, x, y, s = 1, col) {
  const k = C('#1B1117'), w = C('#FFFFFF'), yl = C('#FEE761'), r = C('#E43B44'), bl = C('#8FD3FF');
  switch (kind) {
    case '!': { const c = col || r; g.rect(x, y, s, 3 * s, c); g.rect(x, y + 4 * s, s, s, c); break; }
    case '!!': { const c = col || r; for (const d of [0, 2]) { g.rect(x + d * s, y, s, 3 * s, c); g.rect(x + d * s, y + 4 * s, s, s, c); } break; }
    case '?': {
      const c = col || k;
      g.rect(x, y, 3 * s, s, c); g.rect(x + 2 * s, y + s, s, s, c); g.rect(x + s, y + 2 * s, s, s, c); g.rect(x + s, y + 4 * s, s, s, c); break;
    }
    case 'sweat': g.rect(x + s, y, s, s, bl); g.rect(x, y + s, 3 * s, 2 * s, bl); g.rect(x + s, y + s, s, s, w); break;
    case 'star': g.rect(x + s, y, s, 3 * s, col || yl); g.rect(x, y + s, 3 * s, s, col || yl); break;
    case 'bigstar':
      g.rect(x + 2 * s, y, s, 5 * s, col || yl); g.rect(x, y + 2 * s, 5 * s, s, col || yl);
      g.rect(x + s, y + s, 3 * s, 3 * s, col || yl); g.rect(x + 2 * s, y + 2 * s, s, s, w); break;
    case 'heart': {
      const c = col || r;
      g.rect(x, y, s, s, c); g.rect(x + 2 * s, y, s, s, c);
      g.rect(x, y + s, 3 * s, s, c); g.rect(x + s, y + 2 * s, s, s, c); break;
    }
    case 'note': { const c = col || k; g.rect(x + s, y, 2 * s, s, c); g.rect(x + s, y, s, 3 * s, c); g.rect(x, y + 2 * s, 2 * s, 2 * s, c); break; }
    case 'z': { const c = col || w; g.rect(x, y, 3 * s, s, c); g.rect(x + s, y + s, s, s, c); g.rect(x, y + 2 * s, 3 * s, s, c); break; }
    case 'Z': { const c = col || w; g.rect(x, y, 4 * s, s, c); g.rect(x + 2 * s, y + s, s, s, c); g.rect(x + s, y + 2 * s, s, s, c); g.rect(x, y + 3 * s, 4 * s, s, c); break; }
  }
}
