// S10 — The beach (wide, 1×). Clawd scuttles sideways to the water, a wave
// chases him back up the sand, little crabs pop out to say hi, splash!
import { C, clamp, lerp, ease, hash, mix, bayer, noise1 } from '../core.js';
import { drawClawd, emote } from '../clawd.js';
import { drawPelican, drawBike } from '../pelican.js';
import { drawCrab, drawGull } from '../actors.js';
import { sparkle } from '../fx.js';
import { BEAT, SHOTS } from '../cues.js';

export const BP = {
  sky0: C('#4FA8E8'), sky1: C('#9AD6FA'), sky2: C('#D8F2FF'),
  sea0: C('#1E6FB8'), sea1: C('#2E8FD6'), sea2: C('#56B8F0'), seaHi: C('#A8E4FF'),
  foam: C('#FFFFFF'), foam2: C('#DDF4FF'), wet: C('#D9B574'), wet2: C('#CCA464'),
  sand: C('#F4D797'), sand2: C('#EACB84'), sand3: C('#FBE6B4'), shell: C('#F6A6B0'), star: C('#F77622'),
  cloud: C('#FFFFFF'), cloudSh: C('#DDEBF7'), sun: C('#FFF4C2'), rock: C('#8B9BB4'), rockDk: C('#5A6988'),
  ink: C('#181425'),
};
const S10 = SHOTS.find(s => s.id === 'S10');
const HZ = 46;                                    // horizon
const SHORE = 106;                                // mean waterline

// waterline y at time t (larger = further up the beach)
export function waterline(t) {
  let y = SHORE + Math.sin(t * 1.6) * 2;
  for (const w of BEAT.waveIn) {
    const k = (t - w) / 1.6;
    if (k > 0 && k < 1) y += Math.sin(k * Math.PI) * (w === BEAT.waveIn[0] ? 36 : 22);
  }
  return y;
}

export function beach(g, lt, shot, t) {
  drawBeachBackdrop(g, t);
  // the bike's front half + the pelican cheering on the left (2× world)
  drawBike(g, -14, 158, { s: 2, kick: true, facing: 1, wheelA: 0.3 });
  const cheer = t > 48.7;
  const stretch = Math.sin(clamp((t - S10.start) / 1.2) * Math.PI);
  drawPelican(g, 50, 172, { s: 2, pose: 'stand', wing: stretch > 0.2 || cheer ? 'wave' : 'fold', wingA: cheer ? -2.3 + Math.sin(t * 12) * 0.25 : -2.4 + stretch * 0.5, shades: 1, eyes: 'happy', facing: 1 });

  // ── Clawd's choreography (3/4 view: up the screen = towards the water) ──
  let x, y, eyes = 'happy', legs = 'walk', phase = t * 8, dir = 1, armL = 0, armR = 0, emo = null, blush = true;
  const t0 = S10.start;
  if (t < 47.55) { const k = ease.inOut(clamp((t - t0) / 1.05)); x = lerp(118, 196, k); y = lerp(166, 134, k); }
  else if (t < 47.75) { x = 196; y = 134; legs = 'stand'; eyes = 'wide'; emo = '!'; blush = false; }
  else if (t < 48.35) { const k = ease.out(clamp((t - 47.75) / 0.6)); x = lerp(196, 158, k); y = lerp(134, 168, k); phase = t * 16; dir = -1; eyes = 'wide'; blush = false; armL = 'up'; armR = 'up'; }
  else if (t < 48.7) { x = 158; y = 168; legs = 'stand'; eyes = 'sparkle'; armL = 'wave'; armR = 'wave'; }
  else { x = 164 + Math.sin((t - 48.7) * 5) * 14; y = 168 - Math.round(Math.abs(Math.sin((t - 48.7) * 10)) * 3); phase = t * 10; dir = Math.cos((t - 48.7) * 5) > 0 ? 1 : -1; armL = 'up'; armR = 'up'; }
  // footprints left behind on the way down to the water
  for (let i = 0; i < 9; i++) {
    const k = i / 9, fx = lerp(118, 196, k), fy = lerp(166, 134, k);
    if (k < clamp((t - t0) / 1.05) - 0.08 && waterline(t) < fy - 4) { g.rect(fx - 6, fy + 1, 2, 1, BP.sand2); g.rect(fx + 4, fy + 2, 2, 1, BP.sand2); }
  }
  g.ellipse(x, y + 1, 14, 2, BP.sand2);                                  // shadow
  drawClawd(g, x, y, { s: 2, eyes, legs, phase: phase % 1, dir, armL, armR, blush, wavePh: Math.floor(t * 8) % 2 });
  if (emo) emote(g, emo, x + 16, y - 30, 2);

  // local crabs pop out of their holes and wave hello
  const holes = [[218, 152], [250, 160], [280, 146]];
  holes.forEach(([hx, hy], i) => {
    g.ellipse(hx, hy + 1, 5, 2, BP.wet2);
    const k = clamp((t - BEAT.crabsPop - i * 0.12) / 0.2);
    if (k <= 0) return;
    const pop = Math.round(ease.outBack(k) * 6);
    const dx = t > 48.7 ? Math.sin((t - 48.7) * 5 + i) * 8 : 0;
    drawCrab(g, hx + dx, hy - pop + 6, t + i, { s: 2, wave: t < 48.7 || Math.floor(t * 3 + i) % 2 === 0 });
  });

  // splash on the rock when the second wave hits
  if (t > BEAT.splash && t < BEAT.splash + 0.7) {
    const k = (t - BEAT.splash) / 0.7;
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * (0.15 + hash(i) * 0.7), v = 34 + hash(i + 5) * 30;
      const px = 296 + Math.cos(a) * v * k, py = 108 + Math.sin(a) * v * k + 70 * k * k;
      g.rect(px, py, 2, 2, i % 3 ? BP.foam : BP.seaHi);
    }
  }
  if (t > 48.7) for (let i = 0; i < 3; i++) sparkle(g, x - 22 + i * 22, y - 34 - (i % 2) * 8, ((t - 48.7) * 1.8 + i * 0.33) % 1);
}

export function drawBeachBackdrop(g, t, o = {}) {
  // sky + clouds + sun
  g.vgrad(0, 0, 320, HZ, [[0, BP.sky0], [34, BP.sky1], [HZ, BP.sky2]]);
  g.glow(58, 20, 26, BP.sun, 0.3, 4); g.disc(58, 20, 9, BP.sun);
  for (let i = 0; i < 4; i++) {
    const x = ((i * 97 + t * 3) % 400) - 40, y = 10 + i * 9;
    g.disc(x, y + 2, 9, BP.cloudSh); g.disc(x + 10, y + 3, 7, BP.cloudSh);
    g.disc(x, y, 8, BP.cloud); g.disc(x + 10, y + 2, 6, BP.cloud); g.disc(x - 9, y + 3, 5, BP.cloud);
  }
  // distant gulls
  for (let i = 0; i < 3; i++) { const gx = ((i * 120 + t * 14) % 360) - 20, gy = 22 + i * 7 + Math.sin(t * 2 + i) * 2; g.px(gx, gy, BP.ink); g.px(gx - 1, gy - 1, BP.ink); g.px(gx + 1, gy - 1, BP.ink); }
  // sea
  g.rect(0, HZ, 320, SHORE + 30 - HZ, BP.sea1);
  g.vgrad(0, HZ, 320, HZ + 18, [[HZ, BP.sea2], [HZ + 18, BP.sea1]]);
  g.rect(0, HZ, 320, 1, BP.sky2);
  for (let y = HZ + 3; y < SHORE; y += 3) {
    for (let x = 0; x < 320; x += 12) {
      const xx = (x + Math.floor(t * 9) + y * 7) % 332 - 6;
      if (noise1(xx * 0.08 + y * 0.4 + t) > 0.58) g.rect(xx, y, 4, 1, BP.sea2);
    }
  }
  for (let i = 0; i < 12; i++) { const ph = (t * 1.5 + hash(i)) % 1; if (ph < 0.4) g.rect(hash(i * 3) * 320, HZ + 4 + hash(i * 5) * 40, 2, 1, BP.foam); }
  // beach: wet sand band follows the retreating water
  const wl = waterline(t);
  g.rect(0, SHORE - 2, 320, 180 - SHORE + 2, BP.sand);
  for (let i = 0; i < 260; i++) { const x = hash(i * 3) * 320, y = SHORE + hash(i * 7) * 70; g.px(x, y, i % 3 ? BP.sand2 : BP.sand3); }
  // wet sand where the wave reached recently
  const reach = Math.max(wl, ...BEAT.waveIn.map(w => (t > w && t < w + 3.2 ? SHORE + (w === BEAT.waveIn[0] ? 36 : 22) * Math.max(0, 1 - (t - w - 0.8) / 2.4) : SHORE)));
  g.rect(0, SHORE - 2, 320, Math.max(0, reach - SHORE + 4), BP.wet);
  // water sheet (thin + translucent over the sand) with a lacy foam edge
  const sheet = mix(BP.sea2, BP.wet, 0.35), sheet2 = mix(BP.sea2, BP.wet, 0.6);
  for (let x = 0; x < 320; x++) {
    const y = Math.round(wl + Math.sin(x * 0.08 + t * 3) * 2 + Math.sin(x * 0.21 - t * 2) * 1);
    for (let yy = SHORE - 2; yy < y; yy++) {
      const d = (y - yy) / Math.max(1, y - SHORE + 2);          // 0 at the edge → 1 at the sea
      g.px(x, yy, d > 0.55 || bayer(x, yy) < d * 1.6 ? sheet : sheet2);
      if (((x * 7 + yy * 13 + Math.floor(t * 6)) % 53) === 0) g.px(x, yy, BP.foam2);
    }
    g.rect(x, y, 1, 2, BP.foam);
    if (bayer(x, y + 2) < 0.5) g.px(x, y + 2, BP.foam2);
  }
  // a rock out in the surf (for the splash)
  g.ellipse(298, 110, 22, 9, BP.rockDk); g.ellipse(295, 107, 17, 7, BP.rock); g.rect(286, 103, 8, 1, C('#C0CBDC'));
  for (let x = 278; x < 320; x++) if (bayer(x, 117) < 0.6) g.px(x, 116 + Math.round(Math.sin(x * 0.4 + t * 4)), BP.foam);
  // shells & a starfish
  g.rect(58, 166, 3, 2, BP.shell); g.px(59, 165, BP.shell);
  const sx = 262, sy = 160;
  g.rect(sx - 3, sy, 7, 1, BP.star); g.rect(sx, sy - 3, 1, 7, BP.star); g.px(sx - 2, sy + 2, BP.star); g.px(sx + 2, sy + 2, BP.star);
}
