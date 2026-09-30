// S6 + S8 — EXT. Classroom building, golden hour (1× world).
// S6: the pelican zooms past, skids, reverses into frame, peers over his
//     sunglasses: "想去海边？" … "上车！" *ding*
// S8: Clawd leaps out of the window into the basket; off they go.
import { C, clamp, lerp, ease, hash, mix, bayer } from '../core.js';
import { drawClawd, emote } from '../clawd.js';
import { drawRider, BIKE_GEO } from '../pelican.js';
import { puff, speedLines, sparkle } from '../fx.js';
import { speech } from '../ui.js';
import { BEAT } from '../cues.js';
import { text } from '../font.js';

const P = {
  sky: C('#F7C98A'), sky2: C('#FBE3B0'),
  wall: C('#F0BF7E'), wallLine: C('#DDA566'), wallSh: C('#C98A52'), trim: C('#FFF1D6'), trimSh: C('#E3B57C'),
  glassIn: C('#B8704A'), glassDk: C('#8E5238'),
  path: C('#E9CFA0'), pathDk: C('#D2AE78'), grass: C('#8CC152'), grassDk: C('#5E9E3A'),
  bush: C('#5E9E3A'), bushHi: C('#8CC152'), bushDk: C('#3E7A2C'),
  tree: C('#3E8948'), treeHi: C('#63C74D'), trunk: C('#7A4A33'),
  shadow: C('#B98452'), ink: C('#181425'), white: C('#FFFFFF'), dust: C('#F4E3C0'),
};

const GROUND = 158;
const WIN = { x: 100, y: 58, w: 58, h: 62 };
const STOP_X = 110;                                   // bike origin when parked under the window

export function windowExt(g, lt, shot, t) {
  drawBackdrop(g, t);
  const jump = shot.phase === 'jump';

  // ── the pelican + bike ──
  let bx = STOP_X, dist = 0, fast = 0, pel = { shades: 1 }, bob = 0, facing = 1;
  if (!jump) {
    if (t < BEAT.skid) {                                // zoom past, left → right
      const k = clamp((t - (BEAT.zoomPast - 0.05)) / 0.4);
      bx = lerp(-60, 420, k); dist = bx; fast = 1;
    } else if (t < BEAT.reverse) {
      bx = 999;                                          // offscreen (skidding)
    } else if (t < BEAT.stop) {                          // back-pedalling into frame
      const k = ease.out(clamp((t - BEAT.reverse) / (BEAT.stop - BEAT.reverse)));
      bx = lerp(360, STOP_X, k); dist = bx;
    } else { bx = STOP_X; dist = STOP_X; }
    // sunglasses: peer over them, then push back up
    if (t > BEAT.shades) pel.shades = 1 + 0.75 * ease.outBack(clamp((t - BEAT.shades) / 0.25));
    if (t > 30.35) pel.shades = lerp(1.75, 1, ease.inOut(clamp((t - 30.35) / 0.15)));
    if (t > BEAT.shades && t < 30.4) { pel.eyes = 'open'; pel.head = [1, 0]; }
    if (t >= 30.5) { pel.wing = 'wave'; pel.wingA = -2.2 + Math.sin(t * 16) * 0.2; pel.eyes = 'happy'; }
    if (t >= BEAT.stop && t < BEAT.stop + 0.25) bob = Math.round(Math.sin((t - BEAT.stop) / 0.25 * Math.PI) * 1.5);
  } else {
    // S8: wait, Clawd lands, bell, then pedal off to the right
    if (t > BEAT.depart) { const k = t - BEAT.depart; bx = STOP_X + k * k * 160; dist = bx; }
    if (t > BEAT.land && t < BEAT.land + 0.2) bob = 1;
    pel.eyes = t > BEAT.land ? 'happy' : 'open';
  }
  // skid dust coming in from the right edge
  if (!jump && t > BEAT.skid && t < BEAT.skid + 0.8) puff(g, 318, GROUND - 4, t - BEAT.skid, P.dust, 7, 22, 9);
  if (!jump && t > BEAT.stop - 0.05 && t < BEAT.stop + 0.6) puff(g, STOP_X - 16, GROUND - 2, t - BEAT.stop, P.dust, 5, 12, 4);

  // Clawd inside the window (before the jump) or in the basket (after landing)
  const inBasket = jump && t >= BEAT.land;
  drawClawdInWindow(g, t, jump);

  // shadow on the path
  if (bx < 400) g.ellipse(bx + 2, GROUND, 24, 2, mix(P.path, P.shadow, 0.5));
  if (bx < 400) {
    if (fast) speedLines(g, t, 10, GROUND - 40, GROUND - 4, P.white, 900, 30, 3);
    const clawd = inBasket ? { eyes: t < BEAT.land + 0.15 ? 'closed' : 'happy', armL: t > BEAT.bell2 ? 'up' : -0.5, armR: t > BEAT.bell2 ? 'up' : -0.5, blush: true, dy: t < BEAT.land + 0.12 ? 1 : 0 } : null;
    const r = drawRider(g, bx, GROUND, { s: 1, dist: dist * 1.0, fast, bob, facing, clawd, pel });
    // bell rings
    for (const bt of [BEAT.bell1, BEAT.bell2]) if (t > bt && t < bt + 0.45) ring(g, bx + 8, GROUND - 30, t - bt);
    // speech
    speech(g, 'ask', t, r.pel.head[0] + 2, r.pel.head[1] - 6, { side: 'left', lift: 6 });
    speech(g, 'hopon', t, r.pel.head[0] + 2, r.pel.head[1] - 6, { side: 'left', lift: 6 });
  }

  // the leap (drawn over everything)
  if (jump && t >= BEAT.jump && t < BEAT.land) {
    const k = clamp((t - BEAT.jump) / (BEAT.land - BEAT.jump));
    const x0 = WIN.x + 29, y0 = WIN.y + WIN.h - 2;
    const [bx1, by1] = [STOP_X + BIKE_GEO.basket[0] + BIKE_GEO.basket[2] / 2, GROUND + BIKE_GEO.basket[1] + 4];
    const x = lerp(x0, bx1, k), y = lerp(y0, by1, k) - Math.sin(k * Math.PI) * 34;
    drawClawd(g, x, y, { s: 1, eyes: 'happy', armL: 'up', armR: 'up', legs: 'tuck' });
    for (let i = 0; i < 4; i++) { const q = clamp(k - i * 0.12); if (q > 0 && q < 1) sparkle(g, lerp(x0, bx1, q) - 6 + i * 3, lerp(y0, by1, q) - Math.sin(q * Math.PI) * 34 + 4, 1 - (k - q) * 3); }
  }
  if (jump && t >= BEAT.land && t < BEAT.land + 0.35) {
    const [bx1, by1] = [STOP_X + BIKE_GEO.basket[0] + BIKE_GEO.basket[2] / 2, GROUND + BIKE_GEO.basket[1]];
    for (let i = 0; i < 5; i++) sparkle(g, bx1 - 12 + i * 6, by1 - 6 - (i % 2) * 5, (t - BEAT.land) / 0.35 + i * 0.1);
  }
  // foreground bush (parallax depth)
  for (let i = 0; i < 6; i++) g.disc(i * 64 - 20, 184, 16, P.bushDk);
}

function ring(g, x, y, a) {
  const k = clamp(a / 0.45);
  const c = C('#FFFFFF');
  for (let i = 0; i < 3; i++) {
    const ang = -Math.PI / 2 - 0.9 + i * 0.9, r0 = 4 + k * 6, r1 = r0 + 3;
    g.line(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0, x + Math.cos(ang) * r1, y + Math.sin(ang) * r1, c);
  }
  text(g, '♪', x + 6 + Math.round(k * 4), y - 16 - Math.round(k * 6), C('#FFFFFF'), { outline: C('#181425') });
}

function drawBackdrop(g, t) {
  // sky strip above the building
  g.vgrad(0, 0, 320, 30, [[0, P.sky], [30, P.sky2]]);
  // distant tree canopy peeking over the roof
  for (let i = 0; i < 12; i++) g.disc(i * 30 + 8, 22 + (i % 3) * 2, 12, i % 2 ? P.treeHi : P.tree);
  // building wall
  g.rect(0, 26, 320, GROUND - 26, P.wall);
  for (let y = 30; y < GROUND - 6; y += 6) g.rect(0, y, 320, 1, P.wallLine);
  g.rect(0, 26, 320, 3, P.trim);                       // eave
  g.rect(0, 29, 320, 2, P.wallSh);
  // second-floor window strips (cut off at the top)
  for (const x of [30, 180, 250]) {
    g.rect(x - 3, 26, 46, 14, P.trim);
    g.rect(x, 26, 40, 11, P.glassDk);
  }
  // other ground-floor window (right)
  drawWindowFrame(g, 200, 58, 58, 62, false);
  // Clawd's window
  drawWindowFrame(g, WIN.x, WIN.y, WIN.w, WIN.h, true);
  // drainpipe
  g.rect(176, 26, 4, GROUND - 26, P.trimSh); g.rect(176, 26, 1, GROUND - 26, P.trim);
  // bushes along the wall
  for (let i = 0; i < 10; i++) {
    const x = i * 34 + 6, r = 9 + (i % 3) * 2;
    if (x > 90 && x < 170) continue;                  // keep the space under the window clear
    g.disc(x, GROUND - 6, r, P.bushDk); g.disc(x - 2, GROUND - 8, r - 2, P.bush); g.disc(x - 4, GROUND - 11, r - 6, P.bushHi);
  }
  // tree on the far right
  g.rect(296, 40, 6, GROUND - 40, P.trunk);
  g.disc(300, 40, 22, P.tree); g.disc(292, 32, 14, P.treeHi); g.disc(310, 46, 14, P.tree);
  // path + grass verge
  g.rect(0, GROUND - 2, 320, 180 - GROUND + 2, P.path);
  g.rect(0, GROUND - 2, 320, 2, P.pathDk);
  for (let x = 0; x < 320; x += 9) g.px(x + ((x * 7) % 5), GROUND + 6 + (x % 3) * 4, P.pathDk);
  g.rect(0, 172, 320, 8, P.grass);
  g.rect(0, 172, 320, 1, P.grassDk);
  // long golden-hour shadow of the building edge
  g.recta(0, GROUND, 320, 5, P.shadow, 0.35);
}

function drawWindowFrame(g, x, y, w, h, open) {
  g.rect(x - 4, y - 4, w + 8, h + 8, P.trim);
  g.rect(x, y, w, h, P.glassIn);
  // interior hints
  g.rect(x, y + h - 14, w, 14, P.glassDk);
  g.rect(x + 4, y + 10, 18, 12, C('#C79A6A'));
  g.rect(x + w / 2 - 1, y, 2, open ? 20 : h, P.trim);     // (the open window's lower sash is raised)
  if (open) { g.rect(x, y, w, 20, mix(P.glassIn, C('#FFE0A0'), 0.3)); g.rect(x, y + 18, w, 3, P.trim); }
  g.rect(x - 7, y + h + 1, w + 14, 5, P.trim);             // sill
  g.rect(x - 7, y + h + 5, w + 14, 2, P.trimSh);
  if (!open) for (let i = 0; i < 8; i++) g.pxa(x + 6 + i * 2, y + 30 - i * 3, C('#FFFFFF'), 0.4);
}

function drawClawdInWindow(g, t, jump) {
  if (jump && t >= BEAT.jump) return;
  const cx = WIN.x + 29, foot = WIN.y + WIN.h - 4;
  // his closed laptop on the desk
  g.rect(WIN.x + 8, WIN.y + WIN.h - 12, 18, 2, C('#C0CBDC'));
  if (!jump) {
    let eyes = 'half', lx = 0, emo = null;
    if (t > BEAT.zoomPast && t < BEAT.skid + 0.2) { eyes = 'open'; lx = 1; }
    if (t > BEAT.reverse) { eyes = 'wide'; lx = -0.5; emo = t < BEAT.stop + 0.6 ? '!' : null; }
    if (t > 29.5) { eyes = 'sparkle'; lx = -0.5; }
    if (t > 30.6) { eyes = 'happy'; }
    drawClawd(g, cx, foot, { s: 1, eyes, lx, legs: 'hide', armL: t > 30.6 ? 'up' : 0, armR: t > 30.6 ? 'up' : 0 });
    if (emo) emote(g, '!', cx + 9, foot - 18, 1);
  } else {
    // climbing onto the sill, crouching for the jump
    const crouch = t > BEAT.jump - 0.25 ? 1 : 0;
    drawClawd(g, cx, WIN.y + WIN.h + 1, { s: 1, eyes: 'open', lx: -1, ly: 0.5, legs: 'stand', sy: -crouch, armL: crouch ? 1 : 0, armR: crouch ? 1 : 0 });
  }
}
