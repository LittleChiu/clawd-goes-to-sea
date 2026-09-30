// Deterministic, time-based effects shared by scenes (no state: every
// particle is a pure function of time and its index).
import { C, hash, clamp, lerp, mix, bayer, noise1 } from './core.js';
import { text, measure, font } from './font.js';

// twinkling star field
export function stars(g, n, x0, y0, w, h, t, seed = 1, cols) {
  const c = cols || [C('#FFFFFF'), C('#C0CBDC'), C('#8B9BB4')];
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(hash(seed * 1000 + i) * w), y = y0 + Math.floor(hash(seed * 2000 + i) * h);
    const tw = Math.sin(t * (1.5 + hash(i * 7 + seed) * 3) + i) * 0.5 + 0.5;
    const big = hash(i * 13 + seed) > 0.9;
    const col = tw > 0.75 ? c[0] : tw > 0.35 ? c[1] : c[2];
    g.px(x, y, col);
    if (big && tw > 0.6) { g.px(x - 1, y, c[2]); g.px(x + 1, y, c[2]); g.px(x, y - 1, c[2]); g.px(x, y + 1, c[2]); }
  }
}

// 4-point sparkle ✦ at (x,y) with size phase 0..1
export function sparkle(g, x, y, ph, col = C('#FFFFFF'), col2 = C('#FEE761')) {
  const k = Math.sin(clamp(ph) * Math.PI);
  const r = Math.round(k * 3);
  if (r <= 0) return;
  g.px(x, y, col);
  for (let i = 1; i <= r; i++) {
    const c = i === r ? col2 : col;
    g.px(x + i, y, c); g.px(x - i, y, c); g.px(x, y + i, c); g.px(x, y - i, c);
  }
  if (r >= 3) { g.px(x + 1, y + 1, col2); g.px(x - 1, y - 1, col2); g.px(x + 1, y - 1, col2); g.px(x - 1, y + 1, col2); }
}

// puff of dust / cloud: expanding discs that fade by dithering
export function puff(g, x, y, age, col = C('#E4E0D8'), n = 5, spread = 10, seed = 3) {
  if (age < 0 || age > 0.6) return;
  const p = age / 0.6;
  for (let i = 0; i < n; i++) {
    const a = hash(seed * 31 + i) * Math.PI - Math.PI;         // mostly upward/backward
    const d = p * spread * (0.6 + hash(seed * 17 + i) * 0.6);
    const r = (1 - p) * (2 + hash(i + seed) * 2.5);
    if (r < 0.5) continue;
    g.disc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.5 - p * 3, r, col);
  }
}

// speed lines streaking horizontally
export function speedLines(g, t, n, y0, y1, col, speed = 400, len = 24, seed = 5) {
  for (let i = 0; i < n; i++) {
    const y = Math.round(lerp(y0, y1, hash(seed * 11 + i)));
    const x = g.w - (((t * speed * (0.7 + hash(i * 3 + seed) * 0.6)) + hash(i + seed) * 900) % (g.w + len * 2)) + len;
    g.rect(x, y, Math.round(len * (0.5 + hash(i * 5) * 0.8)), 1, col);
  }
}

// Big bouncy title letters; returns nothing. chars pop in at t0 + i*stagger.
export function bouncyText(g, str, cx, y, t, t0, o = {}) {
  const sc = o.scale || 2, fid = o.font || 'f12', stagger = o.stagger ?? 0.07;
  const chars = [...str];
  const f = font(fid);
  const widths = chars.map(ch => ((f.glyphs.get(ch) || f.fallback).adv) * sc);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = Math.round(cx - total / 2);
  chars.forEach((ch, i) => {
    const age = t - (t0 + i * stagger);
    if (age < 0) { x += widths[i]; return; }
    const k = clamp(age / 0.35);
    const dy = Math.round((1 - easeOutBack(k)) * -18 * (o.drop ?? 1));
    if (o.fadeOut !== undefined && t > o.fadeOut) {
      const q = clamp((t - o.fadeOut - i * 0.03) / 0.3);
      if (q >= 1) { x += widths[i]; return; }
      // dissolve letters by dropping them down while dithering them away
      const yy = y + Math.round(q * q * 10);
      drawGlyph(g, ch, x, yy, o, sc, fid, q);
    } else drawGlyph(g, ch, x, y + dy, o, sc, fid, 0);
    x += widths[i];
  });
}
function drawGlyph(g, ch, x, y, o, sc, fid, fade) {
  const opts = { font: fid, scale: sc };
  const O8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  // dithered target when fading out
  const tgt = fade > 0
    ? { px: () => {}, rect: (X, Y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bayer(X + i, Y + j) >= fade) g.px(X + i, Y + j, c); } }
    : g;
  // 1) extruded shadow: the outlined glyph shape, pushed down by 1–2 font pixels
  if (o.shadow !== undefined) for (let d = 1; d <= 2; d++) for (const [dx, dy] of O8) text(tgt, ch, x + dx * sc, y + (dy + d) * sc, o.shadow, opts);
  // 2) ink outline (8-way), 3) fill
  if (o.outline !== undefined) for (const [dx, dy] of O8) text(tgt, ch, x + dx * sc, y + dy * sc, o.outline, opts);
  text(tgt, ch, x, y, o.color, opts);
}
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// soft light cone from a point (e.g. laptop screen) — dithered, additive-ish
export function cone(g, x, y, dir, spread, len, col, strength = 0.35) {
  for (let yy = -len; yy <= len; yy++) for (let xx = 0; xx <= len; xx++) {
    const lx = xx * dir, ly = yy;
    const d = Math.hypot(xx, yy);
    if (d > len) continue;
    const ang = Math.abs(Math.atan2(ly, Math.abs(lx)));
    if (ang > spread) continue;
    const k = (1 - d / len) * (1 - ang / spread);
    const lvl = Math.floor(k * 4 + bayer(x + lx, y + ly)) / 4;
    if (lvl > 0) g.pxa(x + lx, y + ly, col, lvl * strength);
  }
}

// floating "Z z z"
export function snore(g, x, y, t, col = C('#FFFFFF')) {
  for (let i = 0; i < 3; i++) {
    const ph = ((t * 0.7 + i / 3) % 1);
    const X = Math.round(x + ph * 10 + Math.sin(ph * 6 + i) * 2), Y = Math.round(y - ph * 16);
    if (ph > 0.85) continue;
    const s = ph < 0.3 ? 'z' : 'Z';
    const sz = ph < 0.3 ? 1 : 1;
    if (s === 'z') { g.rect(X, Y, 3 * sz, 1, col); g.px(X + 1, Y + 1, col); g.rect(X, Y + 2, 3 * sz, 1, col); }
    else { g.rect(X, Y, 4, 1, col); g.px(X + 2, Y + 1, col); g.px(X + 1, Y + 2, col); g.rect(X, Y + 3, 4, 1, col); }
  }
}

export { noise1, mix };
