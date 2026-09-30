// S2 / M2 M4 M6 M7 — INT. Dorm room. Front view from behind the laptop:
// Clawd's face lit by the screen, the pelican snoring on the top bunk,
// a growing tower of coffee cups, a rubber duck, a faded beach poster.
import { C, clamp, lerp, ease, hash, noise1, mix, bayer } from '../core.js';
import { drawClawd, emote } from '../clawd.js';
import { drawPelican } from '../pelican.js';
import { snore, sparkle } from '../fx.js';
import { caption } from '../ui.js';
import { BEAT } from '../cues.js';
import { text } from '../font.js';
import { dayBadge } from './common.js';
import { terminalInsert } from './terminal.js';

const P = {
  wall: C('#23243F'), wall2: C('#2A2B4A'), wallLine: C('#1D1E36'),
  floor: C('#1A1A2E'),
  bed: C('#4A5378'), bedHi: C('#6B77A3'), bedDk: C('#343B5C'),
  mattress: C('#3B3F63'), blanket: C('#3A6EA5'), blanketHi: C('#4F8BC9'), blanketDk: C('#2A4F7A'), stripe: C('#D9E3F0'),
  pillow: C('#C9D2E3'),
  desk: C('#5B3A35'), deskHi: C('#7A4F45'), deskDk: C('#3E2629'), deskEdge: C('#8A5C4E'),
  lid: C('#9AA3B8'), lidHi: C('#C4CCDD'), lidDk: C('#6E7690'), logo: C('#F2FBFF'),
  glow: C('#8FD3FF'), glowHi: C('#D6F4FF'),
  cup: C('#E8E4DA'), cupSh: C('#B9B3A6'), sleeve: C('#9A6A48'), lidC: C('#FFFFFF'),
  can: C('#3E7BC9'), canHi: C('#8FC1F0'), canTop: C('#C0CBDC'),
  duck: C('#FEE761'), duckSh: C('#E0B83A'), duckBeak: C('#F77622'),
  night: C('#0E1030'), moon: C('#FFF3C4'), curtain: C('#4B3B6B'), curtainDk: C('#382C52'),
  dawn0: C('#F6A06A'), dawn1: C('#FBD08A'), dawn2: C('#8A6AA8'),
  clock: C('#E8E4DA'), ink: C('#181425'),
  note1: C('#FEE761'), note2: C('#F6757A'), note3: C('#8FE0A8'),
  poster: C('#E4D3B0'), sea: C('#3AA0D8'), sea2: C('#7FD4FF'), sand: C('#F2D59A'), sun: C('#FEAE34'), palm: C('#3E8948'),
  lamp: C('#3A3F5E'),
};

// variant → { cups, pelican: 'sleep'|'gone', dawn }
const VAR = [
  { cups: 5, pelican: 'sleep', clockH: 3 },
  { cups: 8, pelican: 'sleep', clockH: 2 },
  { cups: 11, pelican: 'gone', clockH: 4 },
  { cups: 14, pelican: 'sleep', clockH: 1 },
  { cups: 16, pelican: 'gone', clockH: 6, dawn: true },
];

export function dormInt(g, lt, shot, t) {
  const v = VAR[shot.variant || 0];
  const main = shot.id === 'S2';

  // Clawd's state over time
  let eyes = 'tired', typing = true, dy = 0, jolt = 0, face = false;
  if (main) {
    if (t > BEAT.nodOff && t < BEAT.jolt) {
      const k = clamp((t - BEAT.nodOff) / 0.6);
      eyes = k < 0.4 ? 'half' : 'closed'; typing = false; dy = Math.round(ease.inOut(k) * 3);
    } else if (t >= BEAT.jolt && t < BEAT.jolt + 0.45) {
      eyes = 'wide'; jolt = 1; dy = -Math.round(Math.sin(clamp((t - BEAT.jolt) / 0.3) * Math.PI) * 4);
    }
    const blinkT = (t - 5.0) % 2.3;
    if (eyes === 'tired' && blinkT > 2.15) eyes = 'closed';
  }
  if (shot.id === 'M7') {
    if (t < BEAT.faceplant - 0.35) { eyes = 'half'; typing = Math.floor(t * 4) % 3 !== 0; dy = Math.round(Math.sin(t * 5) * 1); }
    else if (t < BEAT.faceplant) { eyes = 'closed'; typing = false; dy = Math.round(ease.in(clamp((t - (BEAT.faceplant - 0.35)) / 0.35)) * 3); }
    else face = true;
    if (t > BEAT.faceplant + 0.5) return terminalInsert(g, t, 'ffff');
  }

  drawRoom(g, t, v, main);

  // screen light pool on the wall behind Clawd
  const fl = noise1(t * 6) * 0.06;
  g.glow(160, 112, 72, P.glow, 0.2 + fl, 5);

  // ── Clawd behind the laptop ──
  const cx = 160, foot = 131 + dy;
  if (!face) {
    const ph = Math.floor(t * 14) % 2;
    const armL = typing ? (ph ? -1 : 0.5) : 1.5, armR = typing ? (ph ? 0.5 : -1) : 1.5;
    drawClawd(g, cx, foot, { s: 3, eyes, legs: 'hide', armL, armR, tint: P.glow, tintA: 0.12, ly: 0.3 });
    if (eyes === 'tired' || eyes === 'half') emote(g, 'sweat', cx + 22, foot - 30, 2);
    if (jolt) { emote(g, '!', cx - 1, foot - 40, 3); }
  } else {
    // face-planted: slumped behind the lid, just the top of the head and limp claws show
    const k = clamp((t - BEAT.faceplant) / 0.12);
    drawClawd(g, cx, foot + 10 + Math.round(k * 6), { s: 3, eyes: 'none', legs: 'hide', armL: 2, armR: 2, tint: P.glow, tintA: 0.12 });
    snore(g, cx + 14, foot - 16, t, C('#C8F1FF'));
  }

  drawLaptop(g, t);
  drawDeskItems(g, t, v, shot);

  // caption + day badge
  if (main) caption(g, '宿舍 · 凌晨 3:00', t, 5.35, 9.7, { font: 'f12' });
  if (shot.day) dayBadge(g, shot.day, t - shot.start);
}

function drawRoom(g, t, v, main) {
  // wall with faint vertical wallpaper stripes
  g.rect(0, 0, 320, 180, P.wall);
  for (let x = 6; x < 320; x += 14) g.rect(x, 0, 1, 150, P.wall2);
  g.rect(0, 143, 320, 3, P.wallLine);

  // window (right) — night or dawn
  const wx = 226, wy = 22, ww = 70, wh = 62;
  g.rect(wx - 3, wy - 3, ww + 6, wh + 6, P.bedDk);
  if (v.dawn) {
    g.vgrad(wx, wy, ww, wy + wh, [[wy, P.dawn2], [wy + 30, P.dawn0], [wy + wh, P.dawn1]]);
    g.disc(wx + 48, wy + 50, 9, C('#FFF1C9'));
    g.glow(wx + 48, wy + 50, 26, C('#FFD08A'), 0.3, 4);
  } else {
    g.rect(wx, wy, ww, wh, P.night);
    for (let i = 0; i < 14; i++) g.px(wx + Math.floor(hash(i * 3) * ww), wy + Math.floor(hash(i * 5 + 1) * wh * 0.7), i % 3 ? C('#8B9BB4') : C('#FFFFFF'));
    g.disc(wx + 50, wy + 16, 5, P.moon); g.disc(wx + 52.5, wy + 14, 4.4, P.night);
    // city lights on the horizon
    for (let i = 0; i < 9; i++) g.rect(wx + i * 8, wy + wh - 8 - Math.floor(hash(i + 9) * 8), 7, 20, C('#161838'));
    for (let i = 0; i < 12; i++) if (hash(i + 40) > 0.4) g.px(wx + Math.floor(hash(i + 20) * ww), wy + wh - 4 - Math.floor(hash(i + 30) * 8), C('#FEAE34'));
  }
  g.rect(wx + ww / 2, wy, 2, wh, P.bedDk);
  g.rect(wx, wy + wh / 2, ww, 2, P.bedDk);
  // curtains
  g.rect(wx - 10, wy - 6, 12, wh + 20, P.curtain);
  g.rect(wx + ww - 2, wy - 6, 12, wh + 20, P.curtain);
  for (let y = wy - 6; y < wy + wh + 14; y += 1) { g.px(wx - 6, y, P.curtainDk); g.px(wx + ww + 3, y, P.curtainDk); }
  g.rect(wx - 14, wy - 8, ww + 28, 2, P.lamp);

  // wall clock
  const ccx = 196, ccy = 24;
  g.disc(ccx, ccy, 9, P.ink); g.disc(ccx, ccy, 8, P.clock);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.px(ccx + Math.round(Math.cos(a) * 6.5), ccy + Math.round(Math.sin(a) * 6.5), C('#8B9BB4')); }
  const ha = (v.clockH / 12) * Math.PI * 2 - Math.PI / 2, ma = ((t * 0.5) % 1) * 0 - Math.PI / 2;
  g.line(ccx, ccy, ccx + Math.round(Math.cos(ha) * 4), ccy + Math.round(Math.sin(ha) * 4), P.ink);
  g.line(ccx, ccy, ccx + Math.round(Math.cos(ma) * 6), ccy + Math.round(Math.sin(ma) * 6), P.ink);
  const sa = Math.floor(t) / 60 * Math.PI * 2 - Math.PI / 2;
  g.line(ccx, ccy, ccx + Math.round(Math.cos(sa) * 6), ccy + Math.round(Math.sin(sa) * 6), C('#E43B44'));

  // faded beach poster (foreshadowing!)
  const px = 118, py = 30, pw = 34, ph = 24;
  g.rect(px - 1, py - 1, pw + 2, ph + 2, C('#15162A'));
  g.rect(px, py, pw, ph, P.poster);
  g.vgrad(px + 2, py + 2, pw - 4, py + 12, [[py + 2, C('#9CC9E8')], [py + 12, C('#C9E4F2')]]);
  g.disc(px + 25, py + 7, 3, P.sun);
  g.rect(px + 2, py + 12, pw - 4, 5, P.sea);
  g.rect(px + 2, py + 12, pw - 4, 1, P.sea2);
  g.rect(px + 2, py + 17, pw - 4, 5, P.sand);
  g.rect(px + 7, py + 8, 1, 10, C('#6B4A3A'));
  g.rect(px + 4, py + 7, 7, 2, P.palm); g.px(px + 3, py + 9, P.palm); g.px(px + 11, py + 9, P.palm);
  // tape
  g.rect(px - 2, py - 2, 5, 2, C('#C8C0A8')); g.rect(px + pw - 3, py - 2, 5, 2, C('#C8C0A8'));
  // the poster is in shadow: darken it a bit
  g.recta(px, py, pw, ph, P.wall, 0.35);

  // sticky notes near the window
  const notes = [[206, 50, P.note1, 'TODO'], [207, 64, P.note2, 'BUG'], [192, 58, P.note3, 'DDL']];
  for (const [nx, ny, nc, s] of notes) {
    g.rect(nx, ny, 13, 11, mix(nc, P.wall, 0.35));
    text(g, s === 'TODO' ? '!!' : s === 'BUG' ? 'x' : '?', nx + 3, ny + 1, P.ink, { font: 'f8' });
  }

  // bunk bed (left)
  const bx = -6, bw = 118, top = 64;
  g.rect(bx + 2, 14, 4, 132, P.bedDk);                 // back post
  g.rect(bx + bw - 6, 14, 4, 132, P.bed);               // front post
  g.rect(bx + bw - 6, 14, 1, 132, P.bedHi);
  g.rect(bx, top, bw, 4, P.bed);                         // top rail
  g.rect(bx, top, bw, 1, P.bedHi);
  g.rect(bx, top - 14, bw, 3, P.bed);                    // guard rail
  g.rect(bx, top + 4, bw, 8, P.mattress);                // top mattress (side)
  // ladder
  for (let y = top + 16; y < 144; y += 12) g.rect(bx + bw - 22, y, 16, 2, P.bed);
  g.rect(bx + bw - 23, top + 4, 2, 140 - top, P.bed);
  // lower bunk: rumpled blanket in darkness
  g.rect(bx, 128, bw - 8, 16, P.bedDk);
  g.rect(bx + 4, 122, bw - 20, 8, C('#2C3350'));

  // top bunk occupant
  if (v.pelican === 'sleep') {
    const br = (Math.sin(t * 2.4) * 0.5 + 0.5);
    let snoreK = 0;
    for (const s of BEAT.snores) if (t > s && t < s + 1.1) snoreK = Math.sin((t - s) / 1.1 * Math.PI);
    const pouch = 0.25 + br * 0.15 + snoreK * 0.75;
    // pillow, then the pelican lying on its side with the beak drooping over the edge
    g.rect(bx + 70, top - 8, 26, 8, P.pillow);
    g.rect(bx + 70, top - 8, 26, 2, C('#E4EAF4'));
    const pb = drawPelican(g, 56, top + 1, { s: 2, pose: 'sleep', eyes: 'closed', wing: 'fold', pouch, head: [0, Math.round(br * 0.6)], tint: C('#2A3060'), tintA: 0.34, legs: false });
    drawNightcap(g, Math.round(pb.head[0]) - 3, Math.round(pb.head[1]) - 12);
    // blanket over the body
    g.rect(bx, top - 13, 72, 14, P.blanket);
    g.rect(bx, top - 13, 72, 2, P.blanketHi);
    for (let x = bx + 6; x < bx + 70; x += 16) g.rect(x, top - 11, 4, 12, mix(P.stripe, P.blanket, 0.55));
    g.rect(bx + 66, top - 13, 6, 14, P.blanketDk);
    snore(g, Math.round(pb.head[0]) + 8, Math.round(pb.head[1]) - 16, t * 0.9, C('#C0CBDC'));
  } else {
    // empty, neatly made (he's out at the beach…)
    g.rect(bx, top - 7, 100, 8, P.blanket);
    g.rect(bx, top - 7, 100, 2, P.blanketHi);
    g.rect(bx + 70, top - 11, 18, 5, P.pillow);
  }
  // dim everything in the room a little (night)
  if (!v.dawn) g.recta(0, 0, 320, 146, C('#0B0C22'), 0.18);
  else g.glow(262, 60, 110, C('#FFB070'), 0.22, 5);
}

function drawNightcap(g, x, y) {
  const c = C('#4461A8'), hi = C('#6F8DD6'), w = C('#E8E4DA');
  g.poly([x - 9, y + 8, x + 7, y + 8, x - 12, y - 6], c);
  g.poly([x - 6, y + 6, x + 3, y + 6, x - 10, y - 3], hi);
  g.rect(x - 10, y + 7, 18, 3, w);
  g.disc(x - 13, y - 7, 2.5, w);
}

function drawLaptop(g, t) {
  // back of the lid, seen from behind
  const x = 128, y = 126, w = 64, h = 34;
  g.rect(x, y, w, h, P.lid);
  g.rect(x, y, w, 1, P.lidHi);
  g.rect(x, y, 1, h, P.lidHi);
  g.rect(x + w - 1, y, 1, h, P.lidDk);
  g.rect(x + 1, y + h - 2, w - 2, 2, P.lidDk);
  // glowing logo (a little ✻ in honour of the terminal)
  const lx = x + w / 2, ly = y + 14;
  const pulse = noise1(t * 3) > 0.5 ? P.glowHi : P.logo;
  g.rect(lx - 1, ly - 4, 2, 9, pulse); g.rect(lx - 4, ly - 1, 9, 2, pulse);
  g.px(lx - 3, ly - 3, pulse); g.px(lx + 3, ly - 3, pulse); g.px(lx - 3, ly + 3, pulse); g.px(lx + 3, ly + 3, pulse);
  // screen light leaking round the lid edges
  g.rect(x - 2, y + 2, 2, h - 6, mix(P.glow, P.lid, 0.4));
  g.rect(x + w, y + 2, 2, h - 6, mix(P.glow, P.lid, 0.4));
  g.rect(x + 2, y - 1, w - 4, 1, P.glowHi);
}

function drawDeskItems(g, t, v, shot) {
  // desk surface
  g.rect(0, 158, 320, 22, P.desk);
  g.rect(0, 158, 320, 2, P.deskEdge);
  g.rect(0, 160, 320, 1, P.deskHi);
  g.rect(0, 176, 320, 4, P.deskDk);
  // keyboard base peeking under the lid
  g.rect(122, 158, 76, 3, P.lidDk);
  g.rect(124, 158, 72, 1, P.lidHi);

  // coffee cup tower (right) — sways as it grows
  const n = v.cups;
  let sway = 0;
  if (shot.id === 'M7' && t > BEAT.faceplant) sway = clamp((t - BEAT.faceplant) / 0.5);
  for (let i = 0; i < n; i++) {
    const wob = Math.round(Math.sin(t * 3 + i * 0.4) * (i / 10) * (n > 10 ? 1.2 : 0.5) + sway * sway * i * i * 0.35);
    const cx0 = 232 + wob, cy0 = 150 - i * 7 - (sway > 0.6 ? Math.round((sway - 0.6) * i * 6) : 0);
    drawCup(g, cx0, cy0);
  }
  // energy cans (left)
  for (const [x0, crushed] of [[80, 0], [92, 1], [101, 0]]) {
    const hh = crushed ? 9 : 14;
    g.rect(x0, 158 - hh, 8, hh, P.can);
    g.rect(x0 + 1, 158 - hh, 2, hh, P.canHi);
    g.rect(x0, 158 - hh, 8, 2, P.canTop);
    if (crushed) g.rect(x0 + 2, 158 - 6, 5, 1, C('#2A5C99'));
  }
  // rubber duck (for rubber-duck debugging)
  const dx = 262, dy = 150, bob = Math.round(Math.sin(t * 2) * 0.5);
  g.ellipse(dx, dy + 3 + bob, 7, 4, P.duckSh);
  g.ellipse(dx, dy + 2 + bob, 7, 4, P.duck);
  g.disc(dx + 4, dy - 4 + bob, 4, P.duck);
  g.rect(dx + 7, dy - 4 + bob, 4, 2, P.duckBeak);
  g.px(dx + 5, dy - 6 + bob, P.ink);
  g.recta(dx - 8, dy - 8, 20, 16, C('#0B0C22'), 0.25);
  // desk lamp (off)
  g.rect(44, 150, 14, 8, P.lamp); g.rect(50, 128, 2, 22, P.lamp);
  g.poly([40, 128, 60, 124, 58, 118, 42, 122], C('#454B70'));
  // tangled cable
  for (let x = 60; x < 124; x += 1) g.px(x, 170 + Math.round(Math.sin(x * 0.2) * 2), C('#2A1C22'));
}

function drawCup(g, x, y) {
  g.rect(x - 5, y, 10, 8, P.cup);
  g.rect(x + 2, y, 3, 8, P.cupSh);
  g.rect(x - 5, y + 3, 10, 3, P.sleeve);
  g.rect(x - 6, y - 1, 12, 2, P.lidC);
  g.recta(x - 6, y - 1, 12, 9, C('#0B0C22'), 0.2);
}
