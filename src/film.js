// ─────────────────────────────────────────────────────────────
//  film.js — picks the shot for time t, renders it, and composites
//  transitions. Transitions are centred on the cut: a 0.8 s
//  dissolve into S5 runs from 19.6 s to 20.4 s.
// ─────────────────────────────────────────────────────────────
import { Gfx, W, H, C, bayer, clamp, ease } from './core.js';
import { SHOTS, TRANSITIONS, DURATION } from './cues.js';
import { SCENES } from './scenes/index.js';
import { text } from './font.js';

const A = new Gfx(W, H), B = new Gfx(W, H);
const BLACK = C('#0B0A12'), WHITE = C('#FFFFFF');

export function shotAt(t) {
  for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i].start) return i;
  return 0;
}

function drawShot(g, shot, t) {
  g.tx = 0; g.ty = 0; g.cx0 = 0; g.cy0 = 0; g.cx1 = W; g.cy1 = H; g.stack.length = 0;
  const fn = SCENES[shot.scene];
  if (fn) fn(g, t - shot.start, shot, t);
  else {
    g.clear(C('#262B44'));
    text(g, `${shot.id} · ${shot.scene}`, W / 2, H / 2 - 6, C('#F4F1EC'), { align: 'center' });
  }
}

export function renderFrame(g, t) {
  t = clamp(t, 0, DURATION - 1e-4);
  const i = shotAt(t);
  // Is t inside a transition window around cut i (into shot i) or cut i+1?
  let k = -1;
  for (const j of [i, i + 1]) {
    if (j <= 0 || j >= SHOTS.length) continue;
    const tr = TRANSITIONS[SHOTS[j].id];
    if (!tr || tr.type === 'cut') continue;
    const c = SHOTS[j].start;
    if (t >= c - tr.dur / 2 && t < c + tr.dur / 2) k = j;
  }
  if (k < 0) { drawShot(g, SHOTS[i], t); return; }
  const tr = TRANSITIONS[SHOTS[k].id];
  const p = clamp((t - (SHOTS[k].start - tr.dur / 2)) / tr.dur);   // 0..1 across the transition
  const prev = SHOTS[k - 1], next = SHOTS[k];
  switch (tr.type) {
    case 'iris': {                    // close on prev's focal point, open on next's
      const closing = p < 0.5;
      drawShot(g, closing ? prev : next, t);
      const q = closing ? 1 - p * 2 : (p - 0.5) * 2;
      const [fx, fy] = closing ? (tr.from || [W / 2, H / 2]) : (tr.to || [W / 2, H / 2]);
      const maxR = Math.hypot(W, H);
      const r = ease.inOut(q) * maxR;
      irisMask(g, fx, fy, r);
      break;
    }
    case 'dissolve': {                // ordered-dither crossfade
      drawShot(A, prev, t); drawShot(B, next, t);
      const q = ease.inOut(p);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = y * W + x;
        g.u32[o] = bayer(x, y) < q ? B.u32[o] : A.u32[o];
      }
      break;
    }
    case 'fade': {                    // to black and back, stepped
      const closing = p < 0.5;
      drawShot(g, closing ? prev : next, t);
      const q = closing ? p * 2 : 1 - (p - 0.5) * 2;
      stepFade(g, BLACK, q);
      break;
    }
    case 'flash': {                   // white flash into next
      drawShot(g, p < 0.35 ? prev : next, t);
      const q = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
      stepFade(g, WHITE, ease.out(clamp(q)));
      break;
    }
    case 'whip': {                    // fast pan with smear lines
      drawShot(A, prev, t); drawShot(B, next, t);
      const q = ease.inOut(p);
      const off = Math.round(q * W);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const sx = x + off;
        g.u32[y * W + x] = sx < W ? A.u32[y * W + sx] : B.u32[y * W + (sx - W)];
      }
      // motion smear: repeat rows horizontally
      const smear = Math.round(Math.sin(p * Math.PI) * 24);
      if (smear > 1) for (let y = 0; y < H; y++) {
        const row = y * W;
        for (let x = W - 1; x >= smear; x--) if (((x + y * 7) & 3) !== 0) g.u32[row + x] = g.u32[row + x - (smear >> 1)];
      }
      break;
    }
    case 'wipe': {                    // diagonal wipe with a dithered soft edge
      drawShot(A, prev, t); drawShot(B, next, t);
      const q = ease.inOut(p) * (W + H * 0.6 + 24) - 12;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = q - (x + (H - y) * 0.6);
        const o = y * W + x;
        g.u32[o] = d > 6 ? B.u32[o] : d < -6 ? A.u32[o] : (bayer(x, y) < (d + 6) / 12 ? B.u32[o] : A.u32[o]);
      }
      break;
    }
    default: drawShot(g, t < next.start ? prev : next, t);
  }
}

function irisMask(g, cx, cy, r) {
  const rr = r * r;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > rr) g.u32[y * W + x] = BLACK;
  }
}
function stepFade(g, c, q) {
  const a = Math.round(clamp(q) * 8) / 8;
  if (a <= 0) return;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (bayer(x, y) < a) g.u32[y * W + x] = c;
}
