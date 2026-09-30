// ─────────────────────────────────────────────────────────────
//  core.js — a tiny software pixel renderer (runs in Node + browser)
//  Everything draws into a 320×180 RGBA buffer. No anti-aliasing,
//  ever: every pixel is placed on purpose.
// ─────────────────────────────────────────────────────────────

export const W = 320;
export const H = 180;

// ── colour ──────────────────────────────────────────────────
// Colours are packed little-endian RGBA uint32 (0xAABBGGRR).
const _colCache = new Map();
export function C(hex) {
  let c = _colCache.get(hex);
  if (c !== undefined) return c;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  c = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  _colCache.set(hex, c);
  return c;
}
export const rgb = (r, g, b) => (0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
export const R = c => c & 255;
export const G_ = c => (c >>> 8) & 255;
export const B = c => (c >>> 16) & 255;
export function mix(a, b, t) {
  if (t <= 0) return a; if (t >= 1) return b;
  return rgb(R(a) + (R(b) - R(a)) * t, G_(a) + (G_(b) - G_(a)) * t, B(a) + (B(b) - B(a)) * t);
}
export function mul(c, k) { return rgb(Math.min(255, R(c) * k), Math.min(255, G_(c) * k), Math.min(255, B(c) * k)); }
export function lum(c) { return (R(c) * 0.299 + G_(c) * 0.587 + B(c) * 0.114) / 255; }

// ── math helpers ────────────────────────────────────────────
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => clamp((v - a) / (b - a));           // inverse lerp, clamped
export const ease = {
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: t => 1 - (1 - t) * (1 - t),
  in: t => t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: t => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  outBounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};
// integer hash → [0,1)
export function hash(n) {
  n = (n | 0) ^ 0x9e3779b9;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export const hash2 = (x, y) => hash((x | 0) * 73856093 ^ (y | 0) * 19349663);
export function noise1(x) {                 // smooth value noise
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u);
}
export const tri = x => 1 - Math.abs(((x % 2) + 2) % 2 - 1);          // triangle wave 0..1..0
export const step = (t, fps) => Math.floor(t * fps) / fps;          // quantise time → "on twos"

// 4×4 Bayer matrix for ordered dithering
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

// ── the framebuffer + drawing API ───────────────────────────
export class Gfx {
  constructor(w = W, h = H) {
    this.w = w; this.h = h;
    this.buf = new ArrayBuffer(w * h * 4);
    this.u8 = new Uint8ClampedArray(this.buf);
    this.u32 = new Uint32Array(this.buf);
    this.tx = 0; this.ty = 0;
    this.cx0 = 0; this.cy0 = 0; this.cx1 = w; this.cy1 = h;
    this.stack = [];
  }
  push() { this.stack.push([this.tx, this.ty, this.cx0, this.cy0, this.cx1, this.cy1]); }
  pop() { [this.tx, this.ty, this.cx0, this.cy0, this.cx1, this.cy1] = this.stack.pop(); }
  translate(x, y) { this.tx += Math.round(x); this.ty += Math.round(y); }
  clip(x, y, w, h) {                       // intersect clip rect (in local coords)
    x = Math.round(x + this.tx); y = Math.round(y + this.ty);
    this.cx0 = Math.max(this.cx0, x); this.cy0 = Math.max(this.cy0, y);
    this.cx1 = Math.min(this.cx1, x + Math.round(w)); this.cy1 = Math.min(this.cy1, y + Math.round(h));
  }
  clear(c) { this.u32.fill(c); }
  copyFrom(o) { this.u32.set(o.u32); }

  get(x, y) {
    x = Math.round(x + this.tx); y = Math.round(y + this.ty);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.u32[y * this.w + x];
  }
  px(x, y, c) {
    x = Math.round(x) + this.tx; y = Math.round(y) + this.ty;
    if (x < this.cx0 || y < this.cy0 || x >= this.cx1 || y >= this.cy1) return;
    this.u32[y * this.w + x] = c;
  }
  pxa(x, y, c, a) {                        // alpha-blended pixel
    x = Math.round(x) + this.tx; y = Math.round(y) + this.ty;
    if (x < this.cx0 || y < this.cy0 || x >= this.cx1 || y >= this.cy1) return;
    const i = y * this.w + x;
    this.u32[i] = mix(this.u32[i], c, a);
  }
  rect(x, y, w, h, c) {
    let x0 = Math.round(x) + this.tx, y0 = Math.round(y) + this.ty;
    let x1 = x0 + Math.round(w), y1 = y0 + Math.round(h);
    if (x0 < this.cx0) x0 = this.cx0; if (y0 < this.cy0) y0 = this.cy0;
    if (x1 > this.cx1) x1 = this.cx1; if (y1 > this.cy1) y1 = this.cy1;
    if (x1 <= x0 || y1 <= y0) return;
    const u = this.u32, W_ = this.w;
    for (let yy = y0; yy < y1; yy++) u.fill(c, yy * W_ + x0, yy * W_ + x1);
  }
  // alpha-blend a rectangle; `dither` = true uses a 1-bit pattern instead of real blending
  recta(x, y, w, h, c, a, dither = false) {
    let x0 = Math.round(x) + this.tx, y0 = Math.round(y) + this.ty;
    let x1 = x0 + Math.round(w), y1 = y0 + Math.round(h);
    if (x0 < this.cx0) x0 = this.cx0; if (y0 < this.cy0) y0 = this.cy0;
    if (x1 > this.cx1) x1 = this.cx1; if (y1 > this.cy1) y1 = this.cy1;
    const u = this.u32, W_ = this.w;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = yy * W_ + xx;
      if (dither) { if (bayer(xx, yy) < a) u[i] = c; }
      else u[i] = mix(u[i], c, a);
    }
  }
  // fill with c2 over c1 using ordered dither, level 0..1
  drect(x, y, w, h, c1, c2, level) {
    let x0 = Math.round(x) + this.tx, y0 = Math.round(y) + this.ty;
    let x1 = x0 + Math.round(w), y1 = y0 + Math.round(h);
    if (x0 < this.cx0) x0 = this.cx0; if (y0 < this.cy0) y0 = this.cy0;
    if (x1 > this.cx1) x1 = this.cx1; if (y1 > this.cy1) y1 = this.cy1;
    const u = this.u32, W_ = this.w;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++)
      u[yy * W_ + xx] = bayer(xx, yy) < level ? c2 : c1;
  }
  // vertical gradient through a list of colours with dithered bands
  // stops: [[y, colour], ...] in local coords, sorted by y
  vgrad(x, y0, w, y1, stops) {
    for (let y = y0; y < y1; y++) {
      let k = 0;
      while (k < stops.length - 2 && y >= stops[k + 1][0]) k++;
      const [ya, ca] = stops[k], [yb, cb] = stops[Math.min(k + 1, stops.length - 1)];
      const t = yb === ya ? 0 : clamp((y - ya) / (yb - ya));
      const yy = y + this.ty;
      if (yy < this.cy0 || yy >= this.cy1) continue;
      const xa = Math.max(this.cx0, Math.round(x) + this.tx), xb = Math.min(this.cx1, Math.round(x + w) + this.tx);
      const u = this.u32, row = yy * this.w;
      for (let xx = xa; xx < xb; xx++) u[row + xx] = bayer(xx, yy) < t ? cb : ca;
    }
  }
  hline(x0, x1, y, c) { if (x1 < x0) [x0, x1] = [x1, x0]; this.rect(x0, y, x1 - x0 + 1, 1, c); }
  vline(x, y0, y1, c) { if (y1 < y0) [y0, y1] = [y1, y0]; this.rect(x, y0, 1, y1 - y0 + 1, c); }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  thick(x0, y0, x1, y1, c, w = 2) {        // chunky line made of small squares
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    const o = Math.floor(w / 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.rect(Math.round(lerp(x0, x1, t)) - o, Math.round(lerp(y0, y1, t)) - o, w, w, c);
    }
  }
  // filled disc with pixel-art friendly edge (bias makes small circles rounder)
  disc(cx, cy, r, c) {
    const rr = r * r + r * 0.8;
    const ri = Math.ceil(r);
    for (let y = -ri; y <= ri; y++) {
      let span = -1;
      for (let x = 0; x <= ri; x++) if (x * x + y * y <= rr) span = x;
      if (span >= 0) this.rect(Math.round(cx) - span, Math.round(cy) + y, span * 2 + 1, 1, c);
    }
  }
  ring(cx, cy, r, c) {
    const rr0 = (r - 0.5) * (r - 0.5), rr1 = (r + 0.5) * (r + 0.5);
    const ri = Math.ceil(r) + 1;
    for (let y = -ri; y <= ri; y++) for (let x = -ri; x <= ri; x++) {
      const d = x * x + y * y;
      if (d >= rr0 && d < rr1) this.px(Math.round(cx) + x, Math.round(cy) + y, c);
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    const ryi = Math.ceil(ry);
    for (let y = -ryi; y <= ryi; y++) {
      const k = 1 - (y * y) / (ry * ry + ry * 0.6);
      if (k < 0) continue;
      const span = Math.round(rx * Math.sqrt(k));
      this.rect(Math.round(cx) - span, Math.round(cy) + y, span * 2 + 1, 1, c);
    }
  }
  // scanline polygon fill; pts = [x0,y0,x1,y1,...]
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < pts.length; i += 2) { minY = Math.min(minY, pts[i]); maxY = Math.max(maxY, pts[i]); }
    minY = Math.floor(minY); maxY = Math.ceil(maxY);
    const n = pts.length / 2, xs = [];
    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5; xs.length = 0;
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[((i + 1) % n) * 2], by = pts[((i + 1) % n) * 2 + 1];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]);
        if (xb > xa) this.rect(xa, y, xb - xa, 1, c);
      }
    }
  }
  // rotated ellipse; fn(nx, ny) → colour|0 decides each pixel from normalised coords
  ellipseFn(cx, cy, rx, ry, rot, fn) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const R_ = Math.ceil(Math.max(rx, ry)) + 1;
    for (let y = -R_; y <= R_; y++) for (let x = -R_; x <= R_; x++) {
      const px_ = x + 0.5 - (cx - Math.floor(cx)), py_ = y + 0.5 - (cy - Math.floor(cy));
      const lx = px_ * cs + py_ * sn, ly = -px_ * sn + py_ * cs;
      const nx = lx / rx, ny = ly / ry;
      if (nx * nx + ny * ny > 1) continue;
      const c = fn(nx, ny, lx, ly);
      if (c) this.px(Math.floor(cx) + x, Math.floor(cy) + y, c);
    }
  }
  // a tapered tube along a polyline of points [[x,y,r],...]
  tube(pts, c, stepLen = 0.5) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, r0] = pts[i], [x1, y1, r1] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / stepLen));
      for (let k = 0; k <= n; k++) { const t = k / n; this.disc(lerp(x0, x1, t), lerp(y0, y1, t), lerp(r0, r1, t), c); }
    }
  }
  // soft glow: blends colour with a quantised, dithered radial falloff
  glow(cx, cy, r, c, strength = 0.5, steps = 4) {
    const ri = Math.ceil(r);
    for (let y = -ri; y <= ri; y++) for (let x = -ri; x <= ri; x++) {
      const d = Math.sqrt(x * x + y * y) / r;
      if (d >= 1) continue;
      let k = (1 - d) * steps;
      const lo = Math.floor(k), fr = k - lo;
      const X = Math.round(cx) + x, Y = Math.round(cy) + y;
      const lvl = (lo + (bayer(X + this.tx, Y + this.ty) < fr ? 1 : 0)) / steps;
      if (lvl > 0) this.pxa(X, Y, c, lvl * strength);
    }
  }
  // darken/tint whole screen (or clip) with dithered alpha
  overlay(c, a, dither = false) { this.push(); this.tx = 0; this.ty = 0; this.recta(0, 0, this.w, this.h, c, a, dither); this.pop(); }

  // ── sprites ──
  // s = { w, h, d: Uint32Array (0 = transparent) }
  spr(s, x, y, flip = false, tint = 0, tintA = 0) {
    if (!s) return;
    x = Math.round(x) + this.tx; y = Math.round(y) + this.ty;
    const u = this.u32, W_ = this.w;
    for (let j = 0; j < s.h; j++) {
      const yy = y + j; if (yy < this.cy0 || yy >= this.cy1) continue;
      for (let i = 0; i < s.w; i++) {
        const c = s.d[j * s.w + (flip ? s.w - 1 - i : i)];
        if (!c) continue;
        const xx = x + i; if (xx < this.cx0 || xx >= this.cx1) continue;
        u[yy * W_ + xx] = tintA ? mix(c, tint, tintA) : c;
      }
    }
  }
  // draw sprite as a solid silhouette
  sil(s, x, y, flip, c) {
    x = Math.round(x) + this.tx; y = Math.round(y) + this.ty;
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      if (!s.d[j * s.w + (flip ? s.w - 1 - i : i)]) continue;
      const xx = x + i, yy = y + j;
      if (xx < this.cx0 || yy < this.cy0 || xx >= this.cx1 || yy >= this.cy1) continue;
      this.u32[yy * this.w + xx] = c;
    }
  }
}

// Build a sprite from ASCII art. `map` maps a char → colour hex (or null).
// '.' and ' ' are always transparent.
export function sprite(art, map) {
  const rows = art.split('\n').filter(r => r.trim().length);
  const minIndent = Math.min(...rows.map(r => r.match(/^ */)[0].length));
  const lines = rows.map(r => r.slice(minIndent).trimEnd());
  const h = lines.length, w = Math.max(...lines.map(l => l.length));
  const d = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = lines[y][x];
    if (!ch || ch === '.' || ch === ' ') continue;
    const hex = map[ch];
    if (hex) d[y * w + x] = C(hex);
  }
  return { w, h, d };
}

// Offscreen canvas for building complex sprites procedurally.
export function makeLayer(w, h) { return new Gfx(w, h); }
export function layerToSprite(g) { return { w: g.w, h: g.h, d: new Uint32Array(g.u32) }; }

// quadratic / cubic bezier sampling → [[x,y],...]
export function bez(p0, p1, p2, p3, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    if (p3) out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    else out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}

// Reusable scratch layers keyed by name (avoid per-frame allocation).
const _layers = new Map();
export function scratch(name, w, h) {
  let l = _layers.get(name);
  if (!l || l.w !== w || l.h !== h) { l = new Gfx(w, h); _layers.set(name, l); }
  l.u32.fill(0); l.tx = 0; l.ty = 0; l.cx0 = 0; l.cy0 = 0; l.cx1 = w; l.cy1 = h; l.stack.length = 0;
  return l;
}
// Blit a layer (transparent = 0) onto g at x,y; optional silhouette colour.
export function blit(g, l, x, y, sil = 0, flip = false) {
  x = Math.round(x) + g.tx; y = Math.round(y) + g.ty;
  const { w, h, u32 } = l, U = g.u32, GW = g.w;
  for (let j = 0; j < h; j++) {
    const yy = y + j; if (yy < g.cy0 || yy >= g.cy1) continue;
    for (let i = 0; i < w; i++) {
      const c = u32[j * w + (flip ? w - 1 - i : i)]; if (!c) continue;
      const xx = x + i; if (xx < g.cx0 || xx >= g.cx1) continue;
      U[yy * GW + xx] = sil || c;
    }
  }
}

// Selective outline: each new edge pixel takes a darkened version of the
// neighbouring fill colour (softer and richer than flat black lines).
export function outlineSel(g, dark, k = 0.62, diag = false) {
  const { w, h, u32 } = g, src = new Uint32Array(u32);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (src[y * w + x]) continue;
    let nb = 0;
    for (let dy = -1; dy <= 1 && !nb; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!diag && dx && dy) continue;
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && src[Y * w + X]) { nb = src[Y * w + X]; break; }
    }
    if (nb) u32[y * w + x] = mix(nb, dark, k);
  }
}

// Add a 1px outline around all opaque pixels of a layer (in place).
export function outlineLayer(g, c, diag = false) {
  const { w, h, u32 } = g, src = new Uint32Array(u32);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (src[y * w + x]) continue;
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!diag && dx && dy) continue;
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && src[Y * w + X]) { hit = true; break; }
    }
    if (hit) u32[y * w + x] = c;
  }
}
