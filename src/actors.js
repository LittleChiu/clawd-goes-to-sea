// Supporting cast: seagull, little crabs, phone.
import { C, mix, lerp, clamp, scratch, blit, outlineSel } from './core.js';

const GULL = {
  white: C('#F7F5F0'), shade: C('#CDD3E0'), wing: C('#A9B4C8'), wingDk: C('#7D8AA3'), black: C('#262B44'),
  beak: C('#FEC53A'), spot: C('#E43B44'), leg: C('#F7A13B'), eye: C('#181425'), line: C('#2B2640'),
};

// o: s, pose 'stand'|'fly', flap 0..1, beakOpen 0..1, facing, look (-1..1 head turn), sil
export function drawGull(g, x, y, o = {}) {
  const s = o.s || 1, f = o.facing || 1;
  const L = scratch('gull' + s, 44 * s, 36 * s);
  const OX = 20 * s, OY = 28 * s;
  const X = v => OX + v * s, Y = v => OY + v * s;
  const P = GULL;
  if (o.pose === 'fly') {
    const a = Math.sin((o.flap || 0) * Math.PI * 2);
    const tipY = -6 - a * 9, midY = -8 - a * 4;
    // far wing
    L.poly([X(-2), Y(-9), X(-8), Y(midY - 1), X(-16), Y(tipY - 1), X(-9), Y(-7)], P.wingDk);
    // body
    L.ellipseFn(X(0), Y(-8), 8 * s, 3.4 * s, 0, (nx, ny) => (ny > 0.35 ? P.shade : P.white));
    L.poly([X(-7), Y(-9), X(-13), Y(-8), X(-7), Y(-6)], P.white);                  // tail
    L.disc(X(7), Y(-10), 3.2 * s, P.white);
    L.poly([X(9.5), Y(-10.5), X(14), Y(-9.5), X(9.5), Y(-8.8)], P.beak);
    L.px(X(8), Y(-11), P.eye);
    // near wing
    L.poly([X(2), Y(-9), X(-3), Y(midY), X(-12), Y(tipY), X(-4), Y(-6)], P.wing);
    L.poly([X(-8), Y(lerp(midY, tipY, 0.5)), X(-12), Y(tipY), X(-9), Y(tipY + 2)], P.black);
  } else {
    const lk = o.look || 0;
    // legs
    L.rect(X(-2), Y(-4), s, 4 * s, P.leg); L.rect(X(1), Y(-4), s, 4 * s, P.leg);
    L.rect(X(-3), Y(-1), 3 * s, s, P.leg); L.rect(X(1), Y(-1), 3 * s, s, P.leg);
    // body + folded wing
    L.ellipseFn(X(-1), Y(-8), 7.5 * s, 4.5 * s, -0.15, (nx, ny) => (nx * 0.4 + ny * 0.9 > 0.55 ? P.shade : P.white));
    L.poly([X(-6), Y(-10), X(-14), Y(-8), X(-6), Y(-6)], P.white);                 // tail
    L.ellipseFn(X(-3), Y(-9), 6 * s, 2.8 * s, -0.2, (nx) => (nx < -0.5 ? P.black : P.wing));
    L.poly([X(-9), Y(-9), X(-15), Y(-8), X(-9), Y(-7)], P.black);                 // wingtips
    // head
    const hx = 4 + lk * 0.6, hy = -14;
    L.rect(X(2), Y(-13), 3 * s, 4 * s, P.white);                                   // neck
    L.disc(X(hx), Y(hy), 3.4 * s, P.white);
    const op = clamp(o.beakOpen || 0);
    L.poly([X(hx + 2.5), Y(hy - 0.5), X(hx + 7.5), Y(hy + 0.3 - op * 1.8), X(hx + 2.5), Y(hy + 0.8)], P.beak);
    L.poly([X(hx + 2.5), Y(hy + 0.8), X(hx + 7), Y(hy + 1 + op * 1.5), X(hx + 2.5), Y(hy + 1.8)], P.beak);
    L.rect(X(hx + 5.5), Y(hy + 0.8 + op * 1.2), s, s, P.spot);
    L.rect(X(hx + 1), Y(hy - 1.5), s, s, P.eye);
  }
  if (o.sil) { L.u32.forEach((c, i) => { if (c) L.u32[i] = o.sil; }); }
  else outlineSel(L, P.line, 0.7);
  if (f > 0) blit(g, L, x - OX, y - OY); else blit(g, L, x - (L.w - OX), y - OY, 0, true);
}

// Tiny beach crab (2 frames), 1× ≈ 9×6. wave: raise claws.
export function drawCrab(g, x, y, t, o = {}) {
  const c = o.col || C('#F0506E'), d = C('#9E2A4A'), k = C('#181425');
  const s = o.s || 1;
  const up = o.wave ? (Math.floor(t * 6) % 2) : 0;
  const R = (a, b, w, h, col) => g.rect(x + a * s, y + b * s, w * s, h * s, col);
  R(-3, -4, 7, 3, c); R(-3, -2, 7, 1, d);
  R(-2, -6, 1, 2, k); R(2, -6, 1, 2, k);                         // eye stalks
  R(-5, -5 - up, 2, 2, c); R(4, -5 - (1 - up) * (o.wave ? 1 : 0), 2, 2, c);   // claws
  const lp = Math.floor(t * 10) % 2;
  R(-3 - lp, -1, 1, 1, d); R(-1 + lp, -1, 1, 1, d); R(1 - lp, -1, 1, 1, d); R(3 + lp, -1, 1, 1, d);
}
