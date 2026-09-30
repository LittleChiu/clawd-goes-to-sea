// S12 — Sunset. Two silhouettes on the sand, the bike parked beside them.
// "代码永远写不完，" / "但海，一直都在。"
// S13 — End card: title, THE END, and one last commit.
import { C, clamp, lerp, ease, hash, mix, bayer, noise1 } from '../core.js';
import { drawClawd, emote } from '../clawd.js';
import { drawPelican, drawBike, drawRider } from '../pelican.js';
import { bouncyText } from '../fx.js';
import { letterbox, line } from '../ui.js';
import { BEAT, SHOTS } from '../cues.js';
import { text, measure } from '../font.js';

const P = {
  s0: C('#2B1B45'), s1: C('#5A2E62'), s2: C('#9A4470'), s3: C('#E0706A'), s4: C('#F7A052'), s5: C('#FFD27A'),
  sun: C('#FFE9A8'), sunCore: C('#FFF6D8'),
  sea0: C('#2A2350'), sea1: C('#3E2F62'), glint: C('#FFD27A'), glint2: C('#F7A052'),
  sand: C('#2A1A30'), sand2: C('#3A2440'), sil: C('#140C1C'),
  cloud: C('#F59A7A'), cloudSh: C('#B85C6E'), star: C('#FFF6D8'),
  cap: C('#FFF1D6'), capSh: C('#2B1B45'),
};
const S12 = SHOTS.find(s => s.id === 'S12');
const HZ = 112;

export function sunset(g, lt, shot, t) {
  const k = clamp(lt / (S12.end - S12.start));
  // sky
  g.vgrad(0, 0, 320, HZ, [[0, P.s0], [30, P.s1], [62, P.s2], [88, P.s3], [104, P.s4], [HZ, P.s5]]);
  // first stars appear as the sun goes down
  for (let i = 0; i < 16; i++) {
    const a = clamp((k - 0.35 - hash(i) * 0.4) * 4);
    if (a <= 0) continue;
    const x = hash(i * 7) * 320, y = hash(i * 13) * 40;
    if (bayer(i, 0) < a) g.px(x, y, (Math.sin(t * 3 + i) > 0 ? P.star : P.s3));
  }
  // long thin clouds lit from below
  for (const [cx, cy, w] of [[60, 52, 70], [220, 38, 90], [150, 72, 50], [290, 64, 40]]) {
    const x = cx - lt * 2;
    g.rect(x - w / 2, cy, w, 2, P.cloudSh);
    g.rect(x - w / 2 + 6, cy + 2, w - 12, 1, P.cloud);
    g.rect(x - w / 2 + 12, cy - 1, w - 30, 1, P.cloudSh);
  }
  // the sun sinking into the sea
  const sx = 214, sy = HZ - 6 + k * 12;
  g.glow(sx, sy, 60, P.s5, 0.28, 5);
  g.push(); g.clip(0, 0, 320, HZ);
  g.disc(sx, sy, 17, P.sun); g.disc(sx - 2, sy - 2, 12, P.sunCore);
  for (let y = Math.round(sy) - 16; y < sy + 17; y += 4) g.rect(sx - 20, y, 40, 1, mix(P.sun, P.s4, 0.5));   // heat bands
  g.pop();
  // sea with the glitter road
  g.vgrad(0, HZ, 320, 180, [[HZ, P.sea1], [150, P.sea0]]);
  g.rect(0, HZ, 320, 1, P.s5);
  for (let y = HZ + 2; y < 146; y += 2) {
    const spread = 6 + (y - HZ) * 1.2;
    for (let i = 0; i < 4; i++) {
      const n = noise1(y * 0.9 + i * 7.3 + t * 2.2);
      if (n < 0.45) continue;
      const x = sx + (noise1(y * 1.7 + i * 3 + t * 0.7) - 0.5) * spread * 2;
      g.rect(x, y, 3 + Math.round(n * 6), 1, n > 0.75 ? P.glint : P.glint2);
    }
  }
  // gentle swell lines
  for (let y = HZ + 6; y < 150; y += 7) for (let x = 0; x < 320; x += 23) {
    const xx = (x + Math.floor(t * 5) + y * 11) % 340 - 10;
    g.rect(xx, y, 8, 1, P.s1);
  }
  // shoreline + sand
  const shore = 144 + Math.round(Math.sin(t * 1.4) * 1.5);
  g.rect(0, shore, 320, 180 - shore, P.sand);
  for (let x = 0; x < 320; x++) if (bayer(x, shore) < 0.5) g.px(x, shore, P.glint2);
  for (let i = 0; i < 80; i++) g.px(hash(i * 3) * 320, shore + 4 + hash(i * 5) * 24, P.sand2);

  // gulls crossing the sun
  for (let i = 0; i < 3; i++) {
    const gx = ((lt * (10 + i * 3) + i * 70) % 380) - 30, gy = 58 + i * 9 + Math.sin(t * 2 + i) * 2;
    const f = Math.floor(t * 4 + i) % 2;
    g.px(gx, gy, P.sil); g.px(gx - 1, gy - 1 + f, P.sil); g.px(gx - 2, gy - 1 + f, P.sil); g.px(gx + 1, gy - 1 + f, P.sil); g.px(gx + 2, gy - 1 + f, P.sil);
  }

  // silhouettes (2×): bike, pelican sitting, Clawd leaning in
  drawBike(g, 268, 158, { s: 2, kick: true, facing: -1, wheelA: 0.2, sil: P.sil });
  const breathe = Math.round(Math.sin(t * 1.6) * 0.5);
  drawPelican(g, 104, 160, { s: 2, pose: 'sit', wing: 'fold', sil: P.sil, head: [0, breathe] });
  const lean = lt > 3.4 ? 1 : 0;                              // Clawd leans in against the pelican
  drawClawd(g, 156 - lean * 3, 160, { s: 2, legs: 'tuck', silhouette: P.sil, armL: lean ? -1 : 0.5 });
  if (lt > 3.9 && lt < 5.8) {
    const q = (lt - 3.9) / 1.9;
    emote(g, 'heart', 146, 128 - Math.round(q * 10), 2, C('#F6757A'));
  }

  letterbox(g, ease.inOut(clamp(lt / 1.2)), 16);

  // captions (fade in by dithering)
  captionFade(g, 'cap1', t, 26);
  captionFade(g, 'cap2', t, 44);
}

function captionFade(g, id, t, y) {
  const ln = line(id);
  if (!ln || t < ln.t || t > ln.until) return;
  const a = Math.min(clamp((t - ln.t) / 0.8), clamp((ln.until - t) / 0.5));
  const tgt = { px: (X, Y, c) => { if (bayer(X, Y) < a) g.px(X, Y, c); }, rect: (X, Y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bayer(X + i, Y + j) < a) g.px(X + i, Y + j, c); } };
  text(tgt, ln.text, 160, y + 1, P.capSh, { align: 'center' });
  text(tgt, ln.text, 160, y, P.cap, { align: 'center' });
}

// ── S13: end card ─────────────────────────────────────────
export function endCard(g, lt, shot, t) {
  g.clear(C('#14121E'));
  // soft vignette stars
  for (let i = 0; i < 30; i++) { const x = hash(i * 3) * 320, y = hash(i * 7) * 180; if (Math.sin(t * 2 + i) > 0.2) g.px(x, y, C('#3A3452')); }
  // the poster image: the pelican riding a bicycle, Clawd waving from the basket
  const ride = lt * 40;
  g.rect(60, 104, 200, 1, C('#2A2640'));
  for (let i = 0; i < 6; i++) g.rect(((i * 40 - ride * 2) % 240 + 240) % 240 + 40, 106, 14, 1, C('#2A2640'));
  drawRider(g, 150, 104, { s: 2, dist: ride, pel: { shades: 1, eyes: 'happy' }, clawd: { eyes: 'happy', blush: true, armL: 'wave', armR: 'up', wavePh: Math.floor(t * 6) % 2, dy: -Math.round(Math.abs(Math.sin(t * 5))) } });
  bouncyText(g, 'Clawd 去看海', 160, 110, t, shot.start + 0.15, { scale: 2, color: C('#F4F1EC'), outline: C('#181425'), shadow: C('#D77757'), stagger: 0.06 });

  // one last commit
  const cmd = '> git commit -m "今天去看海了"';
  const n = Math.floor((lt - 1.0) * 22);
  if (n > 0) {
    const s = [...cmd].slice(0, n).join('');
    const w = measure(cmd, 'f10').w;
    text(g, s, 160 - w / 2, 140, C('#7BD88F'), { font: 'f10' });
    if (n < [...cmd].length && Math.floor(t * 6) % 2) g.rect(160 - w / 2 + measure(s, 'f10').w + 1, 141, 4, 9, C('#7BD88F'));
    if (lt > 2.4) text(g, '✓ 1 file changed: 快乐.md', 160, 154, C('#8B9BB4'), { font: 'f8', align: 'center' });
  }
  if (lt > 1.4) text(g, 'Made with Claude Code  ·  字体 Fusion Pixel (OFL)', 160, 170, C('#4A4468'), { font: 'f8', align: 'center' });
}
