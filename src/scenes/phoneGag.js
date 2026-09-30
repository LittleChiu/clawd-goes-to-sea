// S11 — Medium shot on the sand. Clawd's phone buzzes: a production alert.
// He picks it up in horror… the pelican's beak swoops in — SNAP — gulp.
// "咕嘟。"  Beat.  Clawd bursts out laughing.
import { C, clamp, lerp, ease, hash, mix } from '../core.js';
import { drawClawd, emote } from '../clawd.js';
import { drawPelican } from '../pelican.js';
import { sparkle } from '../fx.js';
import { speech, line, typed } from '../ui.js';
import { BEAT } from '../cues.js';
import { text, measure } from '../font.js';
import { BP } from './beach.js';

const HZ = 70, SAND = 120;

export function phoneGag(g, lt, shot, t) {
  backdrop(g, t);
  const [buzz0] = BEAT.buzz;
  const pickUp = 51.45, snapT = BEAT.snap, gulpT = BEAT.gulp, laughT = BEAT.laugh;

  // ── the pelican (left) ──
  let head = [0, 0], beakOpen = 0, beakRot = 0, eyes = 'happy', lump = 0, pouch = 0.35, wing = 'fold', wingA = -2.2;
  if (t > 51.75 && t < snapT) {                          // wind-up: head pulls back, eyes on the phone
    const k = ease.inOut(clamp((t - 51.75) / 0.25));
    head = [-2 * k, -1 * k]; eyes = 'open'; beakRot = -0.1 * k;
  }
  if (t >= snapT - 0.12 && t < snapT + 0.1) {            // the swoop
    const k = ease.out(clamp((t - (snapT - 0.12)) / 0.12));
    head = [lerp(-2, 9, k), lerp(-1, 9, k)]; beakOpen = t < snapT ? 1 : 0; beakRot = lerp(-0.1, 0.21, k); eyes = 'wide';
  }
  if (t >= snapT + 0.1) {                                 // pull back, pouch bulging with the phone
    const k = ease.inOut(clamp((t - snapT - 0.1) / 0.2));
    head = [lerp(9, 0, k), lerp(9, 0, k)]; beakRot = lerp(0.21, 0, k); pouch = t < gulpT ? 0.95 : 0.35; eyes = 'closed';
  }
  if (t >= gulpT) lump = clamp((t - gulpT) / 0.55);
  if (t > gulpT + 0.6) { eyes = 'happy'; }
  if (t > laughT) { eyes = 'happy'; wing = 'wave'; wingA = -2.3 + Math.sin(t * 14) * 0.25; head = [0, Math.round(Math.abs(Math.sin(t * 9)))]; }
  const pb = drawPelican(g, 110, 160, { s: 2, pose: 'stand', head, beakOpen, beakRot, eyes, lump, pouch, shades: 1.6, wing, wingA });
  if (t > gulpT + 0.6 && t < laughT) { text(g, '♪', pb.head[0] - 10, pb.head[1] - 24 - Math.round(Math.sin(t * 6) * 2), C('#181425')); }

  // ── Clawd (right), sitting on the sand ──
  let eyesC = 'happy', armL = 0.5, armR = 0.5, dy = 0, emo = null, blush = true;
  let phone = null;                                       // where the phone is drawn
  if (t < pickUp) {
    phone = { x: 166, y: 156, lying: true };
    if (t > buzz0 + 0.1) { eyesC = 'open'; blush = false; }
  } else if (t < snapT) {
    const k = ease.out(clamp((t - pickUp) / 0.15));
    armL = lerp(0.5, -1.6, k); eyesC = 'wide'; blush = false; emo = t > 51.62 ? '!!' : null;
    phone = { x: lerp(166, 168, k), y: lerp(156, 133, k), lying: false };
  } else if (t < laughT) {
    armL = -1.6; eyesC = t < snapT + 0.5 ? 'wide' : 'open'; blush = false;
    if (t > gulpT + 0.2) { eyesC = 'dizzy'; }
  } else {
    eyesC = 'happy'; armL = 'up'; armR = 'up'; dy = -Math.round(Math.abs(Math.sin((t - laughT) * 12)) * 3);
  }
  const cb = drawClawd(g, 196, 158 + dy, { s: 3, legs: 'hide', eyes: eyesC, armL, armR, blush, lx: t < laughT && t > pickUp ? -0.8 : 0 });
  if (emo) emote(g, '!!', 204, 106, 2);
  if (t > snapT + 0.05 && t < laughT && t < snapT + 0.8) emote(g, 'sweat', 226, 112, 2);

  // the phone
  if (phone) drawPhone(g, phone, t);
  // alert notification card
  const ln = line('alert');
  const s = typed(ln, t);
  if (s !== null && t < snapT) {
    const w = measure(ln.text).w + 14, x = 318 - w, y = 22;
    g.rect(x, y, w, 20, C('#181425'));
    g.rect(x + 1, y + 1, w - 2, 18, C('#2A2B3D'));
    g.rect(x + 1, y + 1, 3, 18, C('#E43B44'));
    text(g, s, x + 8, y + 4, C('#FFFFFF'));
    if (Math.floor(t * 8) % 2) {                         // flashing red border
      const r = C('#E43B44');
      g.rect(x - 1, y - 1, w + 2, 1, r); g.rect(x - 1, y + 20, w + 2, 1, r);
      g.rect(x - 1, y, 1, 20, r); g.rect(x + w, y, 1, 20, r);
    }
  }
  // SNAP! burst
  if (t > snapT && t < snapT + 0.25) {
    const k = (t - snapT) / 0.25;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.line(168 + Math.cos(a) * (6 + k * 10), 130 + Math.sin(a) * (6 + k * 10), 168 + Math.cos(a) * (10 + k * 14), 130 + Math.sin(a) * (10 + k * 14), C('#FFFFFF')); }
    text(g, 'SNAP!', 150, 98 - Math.round(k * 6), C('#FEE761'), { outline: C('#181425'), outline8: true });
  }
  speech(g, 'gulp', t, pb.head[0] + 6, pb.head[1] - 10, { side: 'right', lift: 4 });
  // laughing
  if (t > laughT) {
    for (let i = 0; i < 3; i++) {
      const ph = ((t - laughT) * 1.5 + i / 3) % 1;
      text(g, '哈', 226 + i * 14, 96 - Math.round(ph * 14) + (i % 2) * 6, C('#FFFFFF'), { outline: C('#181425'), outline8: true });
    }
    for (let i = 0; i < 3; i++) sparkle(g, 180 + i * 26, 70 + (i % 2) * 10, ((t - laughT) * 2 + i * 0.3) % 1);
  }
}

function drawPhone(g, p, t) {
  const buzzing = BEAT.buzz.some(b => t > b && t < b + 0.22);
  const jx = buzzing ? (Math.floor(t * 60) % 2 ? 1 : -1) : 0;
  const x = Math.round(p.x) + jx, y = Math.round(p.y);
  if (p.lying) {
    g.rect(x - 9, y - 3, 18, 5, C('#181425'));
    g.rect(x - 8, y - 3, 16, 2, buzzing || t > BEAT.buzz[0] ? C('#FF6B6B') : C('#3A4466'));
    if (buzzing) for (const d of [-1, 1]) { g.rect(x + d * 13, y - 4, 1, 3, C('#FFFFFF')); g.rect(x + d * 15, y - 5, 1, 5, C('#FFFFFF')); }
  } else {
    g.rect(x - 5, y - 9, 11, 18, C('#181425'));
    g.rect(x - 4, y - 8, 9, 15, C('#FF6B6B'));
    g.rect(x - 3, y - 5, 7, 2, C('#FFFFFF')); g.rect(x - 3, y - 1, 5, 1, C('#FFFFFF'));
    g.glow(x, y, 14, C('#FF6B6B'), 0.25, 3);
  }
}

function backdrop(g, t) {
  g.vgrad(0, 0, 320, HZ, [[0, C('#5AAEE6')], [40, C('#A6DAF8')], [HZ, C('#FBE0B8')]]);
  for (let i = 0; i < 3; i++) { const x = ((i * 120 + t * 4) % 420) - 50, y = 14 + i * 12; g.disc(x, y, 12, BP.cloud); g.disc(x + 14, y + 3, 9, BP.cloud); g.disc(x - 12, y + 4, 8, BP.cloud); }
  g.rect(0, HZ, 320, SAND - HZ, BP.sea1);
  g.vgrad(0, HZ, 320, HZ + 20, [[HZ, BP.sea2], [HZ + 20, BP.sea1]]);
  for (let y = HZ + 3; y < SAND; y += 4) for (let x = 0; x < 320; x += 14) { const xx = (x + Math.floor(t * 8) + y * 5) % 334 - 7; if (hash(xx * 3 + y) > 0.5) g.rect(xx, y, 5, 1, BP.sea2); }
  // foam line
  for (let x = 0; x < 320; x++) { const y = SAND + Math.round(Math.sin(x * 0.07 + t * 2.4) * 2); g.rect(x, y - 1, 1, 2, BP.foam); }
  g.rect(0, SAND + 1, 320, 180 - SAND, BP.sand);
  g.rect(0, SAND + 1, 320, 6, BP.wet);
  for (let i = 0; i < 200; i++) g.px(hash(i * 3) * 320, SAND + 8 + hash(i * 7) * 60, i % 3 ? BP.sand2 : BP.sand3);
}
