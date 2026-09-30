// Speech bubbles, captions, title cards — pixel UI shared by all scenes.
import { C, clamp, ease, bayer } from './core.js';
import { text, measure } from './font.js';
import { DIALOG } from './cues.js';

export const INK = C('#181425');
export const PAPER = C('#FFFFFF');
const PAPER_SH = C('#C0CBDC');

export const line = id => DIALOG.find(d => d.id === id);

// How many characters of a line are visible at time t (typewriter).
export function typed(ln, t) {
  if (!ln || t < ln.t || t >= ln.until) return null;
  const chars = [...ln.text];
  if (!ln.cps) return ln.text;
  return chars.slice(0, Math.min(chars.length, Math.floor((t - ln.t) * ln.cps) + 1)).join('');
}

// Rounded pixel box with 1px ink outline and a bottom shadow line.
export function box(g, x, y, w, h, fill = PAPER, ink = INK, shadow = PAPER_SH) {
  g.rect(x + 1, y, w - 2, h, ink);
  g.rect(x, y + 1, w, h - 2, ink);
  g.rect(x + 1, y + 1, w - 2, h - 2, fill);
  if (shadow) g.rect(x + 2, y + h - 2, w - 4, 1, shadow);
}

// Speech bubble for a DIALOG line id. (ax, ay) = point the tail aims at (speaker's mouth/head).
// side: 'left' | 'right' — which side of the anchor the bubble sits on.
export function speech(g, id, t, ax, ay, o = {}) {
  const ln = line(id);
  const str = typed(ln, t);
  if (str === null) return;
  const full = measure(ln.text, o.font || 'f12');
  const padX = 5, padY = 3;
  const w = full.w + padX * 2, h = full.h + padY * 2 - 1;
  const side = o.side || 'right';
  const lift = o.lift ?? 10;
  let x = side === 'right' ? ax - 6 : ax - w + 6;
  let y = ay - lift - h;
  x = clamp(x, 3, g.w - w - 3); y = clamp(y, 3, g.h - h - 3);
  // pop-in: first 3 frames squash
  const age = t - ln.t, pop = age < 0.1 ? Math.round((0.1 - age) * 30) : 0;
  const out = ln.until - t < 0.1;
  if (out) return;
  const yy = y + pop;
  const fill = o.fill ?? PAPER, ink = o.ink ?? INK;
  // tail
  const tx = clamp(ax, x + 6, x + w - 7), ty = yy + h - 1;
  const tipY = Math.min(ay - 3, ty + 7);
  for (let k = 0; k <= tipY - ty; k++) {
    const half = Math.max(0, 3 - Math.floor(k * 3 / Math.max(1, tipY - ty)));
    const cx = Math.round(tx + ((ax - tx) * k) / Math.max(1, tipY - ty));
    g.rect(cx - half - 1, ty + k, half * 2 + 3, 1, ink);
    if (half > 0 || k === 0) g.rect(cx - half, ty + k, half * 2 + 1, 1, fill);
  }
  box(g, x, yy, w, h, fill, ink, o.shadow === false ? 0 : PAPER_SH);
  // re-open the tail seam
  g.rect(tx - 2, ty, 5, 1, fill);
  text(g, str, x + padX, yy + padY - 1, o.color ?? INK, { font: o.font || 'f12' });
}

// Small location / time caption (top-left).
export function caption(g, str, t, t0, t1, o = {}) {
  if (t < t0 || t > t1) return;
  const f = o.font || 'f10';
  const m = measure(str, f);
  const a = Math.min(inv(t0, t0 + 0.25, t), inv(t1, t1 - 0.25, t));
  if (a <= 0) return;
  const x = o.x ?? 6, y = o.y ?? 6;
  const w = m.w + 10, h = m.h + 5;
  // slide in from the left
  const off = Math.round((1 - ease.outCubic(clamp(a))) * -(w + 8));
  g.recta(x + off, y, w, h, C('#181425'), 0.72);
  g.rect(x + off, y, 2, h, C('#D77757'));
  text(g, str, x + off + 6, y + 2, o.color ?? C('#F4F1EC'), { font: f });
}
function inv(a, b, v) { return clamp((v - a) / (b - a)); }

// Cinematic letterbox bars, amount 0..1
export function letterbox(g, amt, size = 16) {
  const h = Math.round(size * clamp(amt));
  if (h <= 0) return;
  g.push(); g.tx = 0; g.ty = 0;
  g.rect(0, 0, g.w, h, INK); g.rect(0, g.h - h, g.w, h, INK);
  g.pop();
}

// Dithered fade to a colour, amount 0..1 (quantised in 8 steps for a retro feel)
export function fadeTo(g, c, amt) {
  const a = Math.round(clamp(amt) * 8) / 8;
  if (a <= 0) return;
  g.push(); g.tx = 0; g.ty = 0; g.cx0 = 0; g.cy0 = 0; g.cx1 = g.w; g.cy1 = g.h;
  const u = g.u32;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (bayer(x, y) < a) u[y * g.w + x] = c;
  g.pop();
}
