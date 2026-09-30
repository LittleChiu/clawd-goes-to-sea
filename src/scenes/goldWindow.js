// S5 — Golden afternoon, looking in through the classroom window.
// The room has emptied. A seagull lands on the sill: "嘎". Clawd looks up,
// and a thought bubble fills with the sea. "……好想去看海啊。"
import { C, clamp, lerp, ease, hash, mix, bayer, scratch } from '../core.js';
import { drawClawd, emote } from '../clawd.js';
import { drawGull } from '../actors.js';
import { sparkle } from '../fx.js';
import { speech } from '../ui.js';
import { BEAT } from '../cues.js';
import { text } from '../font.js';

const P = {
  wall: C('#F0BF7E'), wallLine: C('#DDA566'), wallSh: C('#C4854F'),
  frame: C('#FFF1D6'), frameSh: C('#E3B57C'), frameDk: C('#B98452'),
  in0: C('#B8704A'), in1: C('#CF8858'), inLit: C('#EDB270'), inDk: C('#8E5238'),
  desk: C('#8E5238'), deskHi: C('#B06C48'), chair: C('#6A3B2B'),
  beam: C('#FFE0A0'), dust: C('#FFF4D0'),
  lid: C('#B7AFA8'), lidHi: C('#E7DDD2'), lidDk: C('#8C8078'), logo: C('#FFFFFF'),
  ink: C('#181425'), white: C('#FFFFFF'),
  sky: C('#8FD3FF'), sky2: C('#D4F1FF'), sea: C('#2E8FD6'), sea2: C('#56B8F0'), foam: C('#FFFFFF'),
  sand: C('#F6D98E'), sand2: C('#E9BE6A'), sun: C('#FFE066'), palm: C('#3E8948'), palmT: C('#8A5C3A'),
  boat: C('#F4F1EC'), sail: C('#E43B44'),
};

const WIN = { x: 26, y: 14, w: 268, h: 136 };

export function goldWindow(g, lt, shot, t) {
  // ── interior (seen through the glass) ──
  g.push(); g.clip(WIN.x, WIN.y, WIN.w, WIN.h);
  drawInterior(g, t);
  // Clawd + laptop
  const st = clawdState(t);
  const cx = 112, foot = 124 + st.dy;
  drawClawd(g, cx, foot, { s: 3, legs: 'hide', eyes: st.eyes, lx: st.lx, ly: st.ly, armL: st.armL, armR: st.armR, blush: st.blush, tint: C('#FFD08A'), tintA: 0.12 });
  if (st.eyes === 'sparkle') {
    for (let i = 0; i < 4; i++) {
      const ph = ((t - BEAT.sparkle) * 1.6 + i / 4) % 1;
      sparkle(g, cx - 34 + (i % 2) * 64 + Math.round(hash(i) * 8), foot - 34 + Math.floor(i / 2) * 16 - Math.round(ph * 6), ph);
    }
  }
  drawLaptop(g, 84, 116, t);
  // glass reflections
  for (const [x0, w] of [[70, 10], [86, 4], [210, 14], [230, 5]]) {
    for (let y = WIN.y; y < WIN.y + WIN.h; y++) {
      const xx = x0 + (WIN.y + WIN.h - y) * 0.45;
      for (let i = 0; i < w; i++) if (bayer(Math.round(xx + i), y) < 0.35) g.pxa(xx + i, y, P.white, 0.18);
    }
  }
  g.pop();

  // ── exterior wall + window frame ──
  drawFrame(g);

  // emotes
  if (t > 21.95 && t < 22.65) emote(g, '?', cx + 26, foot - 38, 3, P.ink);
  if (t > BEAT.bellDistant && t < BEAT.bellDistant + 0.4) emote(g, '!', cx + 24, foot - 42, 3);

  // seagull: flies in, lands on the sill, cries, startles away when the bubble pops
  drawSeagull(g, t);

  // thought bubble with the dream sea
  drawDream(g, t, cx, foot - 30);

  // the line
  speech(g, 'wish', t, cx - 8, foot - 34, { side: 'left', lift: 6 });
}

function clawdState(t) {
  const s = { eyes: 'half', lx: 0, ly: 0.5, armL: 0, armR: 0, dy: 0, blush: false };
  const typing = t < 21.85;
  if (typing) { const ph = Math.floor(t * 5) % 2; s.armL = ph ? -0.5 : 0.5; s.armR = ph ? 0.5 : -0.5; }
  if (t >= 21.85) { s.eyes = 'open'; s.lx = 1; s.ly = 0.2; s.armL = 1; s.armR = 1; }
  if (t >= BEAT.bubble[0]) { s.lx = 0.6; s.ly = -0.5; }
  if (t >= BEAT.sparkle) { s.eyes = 'sparkle'; s.blush = true; s.lx = 0.5; s.ly = -0.3; s.dy = -Math.round(Math.abs(Math.sin(t * 2.2))); }
  if (t >= BEAT.bubblePop) { s.eyes = 'half'; s.blush = false; s.lx = 0; s.ly = 0.6; s.dy = 1; s.armL = 1.5; s.armR = 1.5; }
  if (t >= BEAT.bellDistant) { s.eyes = 'wide'; s.lx = 1; s.ly = 0; s.dy = -1; }
  if (t < 21.85 && (t % 2.7) > 2.55) s.eyes = 'closed';
  return s;
}

function drawInterior(g, t) {
  const { x, y, w, h } = WIN;
  g.vgrad(x, y, w, y + h, [[y, P.in0], [y + h, P.in1]]);
  // back wall details: bulletin board, clock, door
  g.rect(40, 34, 60, 34, P.inDk); g.rect(42, 36, 56, 30, C('#C79A6A'));
  for (let i = 0; i < 6; i++) g.rect(46 + (i % 3) * 18, 40 + Math.floor(i / 3) * 13, 12, 9, [C('#F4E3C0'), C('#F6B0A0'), C('#BFE3C0')][i % 3]);
  g.disc(250, 34, 8, P.inDk); g.disc(250, 34, 7, C('#F4E3C0'));
  g.line(250, 34, 250, 29, P.ink); g.line(250, 34, 254, 36, P.ink);            // ~5 o'clock
  g.rect(268, 48, 26, 70, P.inDk); g.rect(271, 51, 20, 67, C('#9A5E40')); g.px(287, 86, C('#F4E3C0'));
  // sun beams slanting across the wall
  for (const bx of [130, 190]) g.poly([bx, y, bx + 26, y, bx - 34, y + h, bx - 60, y + h], mix(P.inLit, P.in0, 0.25));
  // empty desks + upturned chairs
  for (const dx of [180, 236]) {
    g.rect(dx, 100, 40, 4, P.desk); g.rect(dx, 100, 40, 1, P.deskHi);
    g.rect(dx + 2, 104, 3, 30, P.inDk); g.rect(dx + 35, 104, 3, 30, P.inDk);
    g.rect(dx + 6, 90, 28, 3, P.chair); g.rect(dx + 8, 80, 2, 10, P.chair); g.rect(dx + 30, 80, 2, 10, P.chair);
  }
  // Clawd's desk
  g.rect(60, 136, 110, 14, P.desk); g.rect(60, 136, 110, 2, P.deskHi);
  // floating dust motes in the light
  for (let i = 0; i < 18; i++) {
    const px = 40 + ((hash(i) * 240 + t * (4 + hash(i + 7) * 5)) % 240);
    const py = 20 + ((hash(i + 3) * 110 + Math.sin(t * 0.8 + i) * 6 + t * 2) % 110);
    if (bayer(i, Math.floor(t * 4)) < 0.7) g.px(px, py, P.dust);
  }
}

function drawLaptop(g, x, y, t) {
  const w = 56, h = 30;
  g.rect(x, y, w, h, P.lid);
  g.rect(x, y, w, 1, P.lidHi); g.rect(x, y, 1, h, P.lidHi);
  g.rect(x + w - 1, y, 1, h, P.lidDk); g.rect(x + 1, y + h - 2, w - 2, 2, P.lidDk);
  const lx = x + w / 2, ly = y + 13;
  g.rect(lx - 1, ly - 4, 2, 9, P.logo); g.rect(lx - 4, ly - 1, 9, 2, P.logo);
  g.px(lx - 3, ly - 3, P.logo); g.px(lx + 3, ly - 3, P.logo); g.px(lx - 3, ly + 3, P.logo); g.px(lx + 3, ly + 3, P.logo);
}

function drawFrame(g) {
  const { x, y, w, h } = WIN;
  // wall around the window (clapboard in warm sun)
  const wall = (X, Y, W_, H_) => {
    g.rect(X, Y, W_, H_, P.wall);
    for (let yy = Y + 5; yy < Y + H_; yy += 7) g.rect(X, yy, W_, 1, P.wallLine);
  };
  wall(0, 0, 320, y - 6); wall(0, y + h + 10, 320, 180 - (y + h + 10));
  wall(0, 0, x - 6, 180); wall(x + w + 6, 0, 320 - (x + w + 6), 180);
  // frame
  g.rect(x - 6, y - 6, w + 12, 6, P.frame); g.rect(x - 6, y - 6, w + 12, 1, C('#FFFFFF'));
  g.rect(x - 6, y, 6, h, P.frame); g.rect(x + w, y, 6, h, P.frameSh);
  g.rect(x + w / 2 - 2, y, 4, h, P.frame); g.rect(x + w / 2 + 1, y, 1, h, P.frameSh);
  // sill (in front, casting a shadow on the wall)
  g.rect(x - 12, y + h, w + 24, 8, P.frame);
  g.rect(x - 12, y + h, w + 24, 2, C('#FFFFFF'));
  g.rect(x - 12, y + h + 8, w + 24, 2, P.frameDk);
  g.recta(x - 10, y + h + 10, w + 20, 6, P.wallSh, 0.6);
  // shadow of the frame's top edge falling into the room
  g.recta(x, y, w, 5, P.inDk, 0.35);
  // ivy leaves at the corner (for charm)
  for (let i = 0; i < 9; i++) g.disc(300 - i * 3 + (i % 2) * 4, 10 + i * 8, 3.2, i % 2 ? C('#63C74D') : C('#3E8948'));
}

function drawSeagull(g, t) {
  const sillY = WIN.y + WIN.h;
  const landX = 246;
  if (t < BEAT.gullLand) {
    const k = clamp((t - 20.0) / (BEAT.gullLand - 20.0));
    const e = ease.out(k);
    drawGull(g, lerp(350, landX, e), lerp(40, sillY, e) - Math.sin(k * Math.PI) * 10, { s: 2, pose: 'fly', flap: t * 3.2, facing: -1 });
  } else if (t < BEAT.bubblePop + 0.05) {
    let op = 0;
    for (const c of BEAT.gullCry) if (t > c && t < c + 0.28) op = Math.sin((t - c) / 0.28 * Math.PI);
    const hop = t - BEAT.gullLand < 0.15 ? Math.round(Math.sin((t - BEAT.gullLand) / 0.15 * Math.PI) * -3) : 0;
    const look = t > BEAT.bubbleOpen ? 0.6 : -0.4;
    drawGull(g, landX, sillY + hop, { s: 2, pose: 'stand', beakOpen: op, facing: -1, look });
    if (op > 0.3) {
      // "嘎" lettering
      text(g, '嘎！', landX - 10, sillY - 52, P.white, { outline: P.ink, outline8: true, scale: 1 });
    }
  } else {
    const k = clamp((t - BEAT.bubblePop) / 0.6);
    drawGull(g, lerp(landX, 360, ease.in(k)), sillY - ease.out(k) * 90, { s: 2, pose: 'fly', flap: t * 4, facing: 1 });
  }
}

// ── the thought bubble ──
function drawDream(g, t, hx, hy) {
  if (t < BEAT.bubble[0] || t > BEAT.bubblePop + 0.3) return;
  const ink = P.ink, wh = P.white;
  // little rising bubbles from Clawd's head
  const small = [[hx + 30, hy - 8, 3], [hx + 42, hy - 20, 4.5], [hx + 56, hy - 32, 6]];
  small.forEach(([x, y, r], i) => {
    if (t < BEAT.bubble[i]) return;
    const k = ease.outBack(clamp((t - BEAT.bubble[i]) / 0.2));
    if (t > BEAT.bubblePop) return;
    g.disc(x, y, r * k + 1, ink); g.disc(x, y, r * k, wh);
  });
  if (t < BEAT.bubbleOpen) return;
  const cx = 222, cy = 58, RX = 76, RY = 44;
  let k = ease.outBack(clamp((t - BEAT.bubbleOpen) / 0.35));
  if (t > BEAT.bubblePop) {
    // pop! a ring of droplets
    const p = clamp((t - BEAT.bubblePop) / 0.3);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      g.disc(cx + Math.cos(a) * RX * (1 + p * 0.3), cy + Math.sin(a) * RY * (1 + p * 0.3), 3 * (1 - p), wh);
    }
    return;
  }
  const rx = RX * k, ry = RY * k;
  // cloud outline: bumps around an ellipse
  const bumps = 12;
  for (const [col, pad] of [[ink, 1], [wh, 0]]) {
    g.ellipse(cx, cy, rx + pad, ry + pad, col);
    for (let i = 0; i < bumps; i++) {
      const a = i / bumps * Math.PI * 2;
      g.disc(cx + Math.cos(a) * rx * 0.92, cy + Math.sin(a) * ry * 0.92, Math.min(rx, ry) * 0.28 + pad, col);
    }
  }
  // the dream: render into a layer, blit through an elliptical mask
  const iw = Math.round(rx * 1.7), ih = Math.round(ry * 1.6);
  if (iw < 8 || ih < 8) return;
  const L = scratch('dream', 140, 80);
  dreamSea(L, t, 140, 80);
  const ox = Math.round(cx - iw / 2), oy = Math.round(cy - ih / 2);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const nx = (x - iw / 2) / (iw / 2), ny = (y - ih / 2) / (ih / 2);
    if (nx * nx + ny * ny > 1) continue;
    const sx = Math.floor((x / iw) * 140), sy = Math.floor((y / ih) * 80);
    const c = L.u32[sy * 140 + sx];
    if (c) g.px(ox + x, oy + y, c);
  }
}

// A tiny animated seaside: sky, sun, sailboat, waves, sand, palm — and Clawd dancing.
export function dreamSea(g, t, w, h) {
  const hz = Math.round(h * 0.45);
  g.vgrad(0, 0, w, hz, [[0, P.sky], [hz, P.sky2]]);
  g.disc(w * 0.78, hz * 0.45, 7, P.sun);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + t * 0.6; g.px(w * 0.78 + Math.cos(a) * 10, hz * 0.45 + Math.sin(a) * 10, P.sun); }
  g.ellipse(30, 12, 10, 3, P.white); g.ellipse(40, 10, 6, 3, P.white);
  // sea
  g.rect(0, hz, w, h - hz, P.sea);
  for (let y = hz + 2; y < h * 0.78; y += 4) for (let x = 0; x < w; x += 12) {
    const xx = (x + Math.round(t * 10 + y * 3)) % (w + 12) - 6;
    g.rect(xx, y, 5, 1, P.sea2);
  }
  // sparkles on the water
  for (let i = 0; i < 5; i++) { const ph = (t * 1.3 + i * 0.37) % 1; sparkle(g, 14 + i * 26, hz + 6 + (i % 2) * 6, ph); }
  // sailboat
  const bx = ((t * 8) % (w + 40)) - 20;
  g.poly([bx - 6, hz + 2, bx + 7, hz + 2, bx + 4, hz + 5, bx - 4, hz + 5], P.boat);
  g.poly([bx, hz + 2, bx, hz - 10, bx + 7, hz + 1], P.sail);
  // beach
  const sy = Math.round(h * 0.76);
  const foam = Math.round(Math.sin(t * 2.5) * 2);
  g.rect(0, sy + foam, w, h - sy, P.sand);
  g.rect(0, sy + foam, w, 2, P.foam);
  for (let x = 0; x < w; x += 3) g.px(x, sy + foam + 2 + (x % 2), P.sand2);
  // palm tree
  g.thick(18, h, 22, sy - 16, P.palmT, 2);
  for (const a of [-2.6, -2.0, -1.2, -0.5]) g.thick(22, sy - 16, 22 + Math.cos(a) * 12, sy - 16 + Math.sin(a) * 6 + 4, P.palm, 2);
  // tiny Clawd dancing on the sand
  const hop = Math.round(Math.abs(Math.sin(t * 6)) * 3);
  drawClawd(g, 88, h - 3 - hop, { s: 1, eyes: 'happy', armL: 'up', armR: 'up' });
}
