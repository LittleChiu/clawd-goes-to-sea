// S9 — THE RIDE (12 s, one continuous parallax shot).
// campus gate → shop street → dense forest, downhill → the trees fall away:
// the SEA. Layers scroll at different rates; zone boundaries are placed in
// each layer's own coordinates so new scenery always enters from the right.
import { C, clamp, lerp, ease, hash, mix, bayer, noise1 } from '../core.js';
import { drawRider } from '../pelican.js';
import { drawGull } from '../actors.js';
import { speedLines, sparkle } from '../fx.js';
import { speech, letterbox } from '../ui.js';
import { BEAT, SHOTS } from '../cues.js';
import { text, measure } from '../font.js';

const P = {
  sky0: C('#3E9BE0'), sky1: C('#7CC6F2'), sky2: C('#C6ECFF'),
  cloud: C('#FFFFFF'), cloudSh: C('#DDEBF7'),
  sun: C('#FFF4C2'),
  skyline: C('#A9C7E6'), skyline2: C('#93B5DA'), skyWin: C('#C9DDF0'),
  road: C('#5A6275'), roadHi: C('#6C7488'), roadDk: C('#474E5F'), line: C('#F4F1EC'), curb: C('#C0CBDC'), curbDk: C('#8B9BB4'),
  walk: C('#D8CDBA'), walkDk: C('#BDAF98'),
  treeA: C('#3E8948'), treeB: C('#63C74D'), treeC: C('#2A6B3A'), treeD: C('#1E5230'), trunk: C('#6E4A3A'),
  forest0: C('#1E4A2E'), forest1: C('#2A6B3A'), forest2: C('#3E8948'), light: C('#B8E07A'),
  lamp: C('#5A6988'), lampHi: C('#8B9BB4'),
  sea0: C('#1E6FB8'), sea1: C('#2E8FD6'), sea2: C('#56B8F0'), seaHi: C('#A8E4FF'), foam: C('#FFFFFF'),
  horizon: C('#BFE6FF'), island: C('#5E8FB4'), island2: C('#7AA6C8'), cliff: C('#C9A26A'), cliffDk: C('#A07A48'),
  rail: C('#F4F1EC'), railSh: C('#C0CBDC'), post: C('#E43B44'),
  flower1: C('#FEE761'), flower2: C('#F6757A'), flower3: C('#FFFFFF'), grass: C('#7ACB5A'), grassDk: C('#4E9A3A'),
  ink: C('#181425'),
};

const GROUND = 150;              // road surface (bike wheels)
const BIKE_X = 118;
const S9 = SHOTS.find(s => s.id === 'S9');
const T0 = S9.start, T1 = S9.end;

// speed profile (px/s at the road layer) → distance table
function speed(t) {
  if (t < T0 + 0.6) return lerp(40, 115, ease.out(clamp((t - T0) / 0.6)));
  if (t < BEAT.hill) return 115;
  if (t < BEAT.crest - 0.4) return lerp(115, 205, ease.inOut(clamp((t - BEAT.hill) / (BEAT.crest - 0.4 - BEAT.hill))));
  if (t < BEAT.crest + 0.8) return lerp(205, 85, ease.out(clamp((t - (BEAT.crest - 0.4)) / 1.2)));
  return lerp(85, 105, clamp((t - BEAT.crest - 0.8) / 2));
}
const DT = 1 / 240, TABLE = [];
{ let d = 0; for (let t = T0 - 1; t <= T1 + 1; t += DT) { TABLE.push(d); d += speed(t) * DT; } }
const dist = t => TABLE[clamp(Math.floor((t - (T0 - 1)) / DT), 0, TABLE.length - 1)];

// layer factors
const F = { far: 0.12, mid: 0.45, near: 0.85, road: 1.0, fg: 1.4 };
// The forest is a solid band in the NEAR layer. Its edges, projected to screen x,
// are the seams: left of xA everything behind is "city", right of xB it is "sea".
const T_FOREST_IN = 38.55;                               // forest starts entering from the right
const NEAR_A = F.near * dist(T_FOREST_IN) + 322;
const NEAR_B = F.near * dist(BEAT.crest) + BIKE_X + 14;  // forest ends right as the bike exits at the crest
const seams = d => [NEAR_A - F.near * d, NEAR_B - F.near * d];
// zone of a screen column x (0 city, 1 forest, 2 sea)
const zoneX = (x, sm) => (x < sm[0] ? 0 : x < sm[1] ? 1 : 2);

export function ride(g, lt, shot, t) {
  const d = dist(t);
  const cam = k => d * F[k];
  const sm = seams(d);
  // camera tilts slightly up during the reveal (more sky + sea)
  const reveal = ease.inOut(clamp((t - (BEAT.crest - 0.3)) / 1.2));

  drawSky(g, t, reveal);
  drawFar(g, t, cam('far'), sm);
  drawMid(g, t, cam('mid'), sm);
  drawNear(g, t, cam('near'), 'back', sm);
  drawRoad(g, t, cam('road'), sm);

  // ── the heroes ──
  const bob = Math.round(Math.sin(d / 7) * 0.6);
  const fast = speed(t) > 170 ? 1 : 0;
  const cl = clawdRide(t);
  const pedalBob = Math.round(Math.sin((2 * d * 0.6) / 9) * 0.6);   // body dips twice per crank turn
  const r = drawRider(g, BIKE_X, GROUND + bob, {
    s: 1, dist: d, fast, bob: pedalBob,
    pel: { shades: 1, eyes: t > BEAT.crest ? 'happy' : 'open', head: t > BEAT.hill && t < BEAT.crest ? [1, 1] : [0, 0] },
    clawd: cl,
  });
  if (fast) speedLines(g, t, 14, 60, GROUND + 18, C('#FFFFFF'), 700, 34, 7);

  // gulls escorting them along the coast
  if (t > BEAT.crest + 0.6) {
    for (let i = 0; i < 3; i++) {
      const k = t - BEAT.crest - 0.6 - i * 0.5;
      if (k < 0) continue;
      const x = lerp(340, 60 + i * 70, ease.out(clamp(k / 2.5))) + Math.sin(t * 1.3 + i) * 6;
      const y = 50 + i * 14 + Math.sin(t * 2 + i * 2) * 4;
      drawGull(g, x, y, { s: 1, pose: 'fly', flap: t * (2.5 + i * 0.3), facing: 1 });
    }
  }

  drawNear(g, t, cam('fg'), 'fg', sm);

  // crest flash
  if (t > BEAT.crest - 0.05 && t < BEAT.crest + 0.25) {
    const q = 1 - clamp((t - BEAT.crest + 0.05) / 0.3);
    g.overlay(C('#FFFFFF'), q * 0.6, true);
  }
  letterbox(g, reveal * clamp((T1 - t) / 0.4 + 0.0), 14);

  // speech
  speech(g, 'hold', t, r.pel.head[0] - 2, r.pel.head[1] - 5, { side: 'left', lift: 6 });
  speech(g, 'wah', t, r.basketTop[0] + 4, r.basketTop[1] - 8, { side: 'right', lift: 6 });
  speech(g, 'sea', t, r.basketTop[0] + 4, r.basketTop[1] - 8, { side: 'right', lift: 8 });
}

function clawdRide(t) {
  const c = { eyes: 'happy', lx: 0, armL: 0, armR: 0, blush: true, dy: 0 };
  const look = Math.floor((t - T0) / 1.1) % 3;
  if (t < BEAT.hill) {
    c.eyes = look === 1 ? 'open' : 'happy'; c.lx = look === 1 ? -1 : look === 2 ? 1 : 0;
    if (Math.floor((t - T0) * 2) % 4 === 3) { c.armL = 'up'; c.armR = 'up'; }
    c.dy = Math.floor(t * 4) % 2 ? 0 : -1;
  } else if (t < BEAT.crest) {
    c.eyes = t > 40.4 ? 'wide' : 'open'; c.armL = 'up'; c.armR = 'up'; c.blush = false; c.dy = -1;
  } else {
    c.eyes = 'sparkle'; c.armL = 'up'; c.armR = 'up'; c.lx = -0.5;
    c.dy = -1 - Math.round(Math.abs(Math.sin((t - BEAT.crest) * 7)) * 2);
  }
  return c;
}

// ── layers ────────────────────────────────────────────────
function drawSky(g, t, reveal) {
  g.vgrad(0, 0, 320, GROUND, [[0, P.sky0], [60, P.sky1], [100, P.sky2]]);
  // sun
  g.glow(262, 26, 30, P.sun, 0.35, 4);
  g.disc(262, 26, 10, P.sun);
  // clouds (slow drift + tiny parallax)
  for (let i = 0; i < 6; i++) {
    const w = 320 + 120;
    const x = ((hash(i * 5) * w - (t - T0) * (3 + i) - dist(t) * 0.03) % w + w) % w - 60;
    const y = 12 + hash(i * 9) * 40;
    cloud(g, x, y, 10 + hash(i * 3) * 8);
  }
}
function cloud(g, x, y, r) {
  g.disc(x, y + 2, r * 0.9, P.cloudSh);
  g.disc(x - r, y + 4, r * 0.6, P.cloudSh);
  g.disc(x + r * 1.1, y + 4, r * 0.7, P.cloudSh);
  g.disc(x, y, r * 0.85, P.cloud);
  g.disc(x - r * 0.9, y + 3, r * 0.55, P.cloud);
  g.disc(x + r, y + 3, r * 0.62, P.cloud);
  g.rect(x - r * 1.5, y + 4, r * 3.2, r * 0.5, P.cloud);
}

function drawFar(g, t, u0, sm) {
  // city skyline (left of the forest) — sea panorama (right of it)
  const xa = Math.min(320, sm[0] + 40), xb = Math.max(0, sm[1] - 30);
  if (xa > 0) {
    g.push(); g.clip(0, 0, xa, 180);
    for (let i = Math.floor(u0 / 22) - 1; i < Math.floor((u0 + 320) / 22) + 2; i++) {
      const x = i * 22 - u0, h = 22 + Math.floor(hash(i * 7) * 40), w = 16 + Math.floor(hash(i * 3) * 10);
      const c = hash(i) > 0.5 ? P.skyline : P.skyline2;
      g.rect(x, 118 - h, w, h + 10, c);
      for (let y = 118 - h + 4; y < 116; y += 5) for (let xx = x + 3; xx < x + w - 2; xx += 4) if (hash(i * 131 + y * 7 + xx) > 0.5) g.px(xx, y, P.skyWin);
      if (hash(i * 11) > 0.8) g.rect(x + w / 2, 118 - h - 6, 1, 6, c);
    }
    g.pop();
  }
  if (xb < 320) {
    g.push(); g.clip(xb, 0, 320 - xb, 180);
    drawSea(g, t, u0);
    g.pop();
  }
}

function drawSea(g, t, u0) {
  const hz = 84;
  const ox = (u0 - F.far * dist(BEAT.crest)) * 1.0;        // slow drift of the panorama
  g.rect(0, hz, 320, GROUND - hz, P.sea1);
  g.vgrad(0, hz, 320, hz + 16, [[hz, P.sea2], [hz + 16, P.sea1]]);
  g.vgrad(0, hz + 30, 320, GROUND, [[hz + 30, P.sea1], [GROUND, P.sea0]]);
  g.rect(0, hz, 320, 1, P.horizon);
  // islands
  for (const [iu, w, h] of [[70, 64, 8], [210, 36, 5], [380, 90, 11]]) {
    const x = iu - ox;
    g.ellipse(x, hz, w / 2, h, P.island2);
    g.ellipse(x + 6, hz, w / 3, h * 0.7, P.island);
    g.rect(x - w / 2 - 1, hz, w + 2, 2, P.sea2);
  }
  // lighthouse on a cape
  const lx = 292 - ox;
  g.poly([lx - 34, hz + 1, lx + 24, hz + 1, lx + 12, hz - 7, lx - 18, hz - 9], P.island);
  g.rect(lx - 3, hz - 27, 6, 20, P.rail); g.rect(lx - 3, hz - 21, 6, 3, P.post); g.rect(lx - 3, hz - 13, 6, 3, P.post);
  g.rect(lx - 4, hz - 31, 8, 4, P.ink); g.rect(lx - 2, hz - 30, 4, 2, C('#FEE761'));
  if (Math.sin(t * 3) > 0.3) g.glow(lx, hz - 29, 9, C('#FEE761'), 0.5, 3);
  // sailboats
  for (let i = 0; i < 3; i++) {
    const bx = ((i * 110 + t * (4 + i * 2) - ox * 2) % 360 + 360) % 360 - 20, by = hz + 8 + i * 9;
    g.poly([bx - 4, by, bx + 5, by, bx + 3, by + 2, bx - 3, by + 2], P.rail);
    g.poly([bx, by, bx, by - 8 - i, bx + 5, by - 1], i === 1 ? P.post : P.rail);
  }
  // waves + glitter (screen space, animated)
  for (let y = hz + 4; y < GROUND; y += 3) {
    const band = (y - hz) / (GROUND - hz);
    for (let x = 0; x < 320; x += 10 + Math.floor(band * 8)) {
      const xx = (x + Math.floor(t * (8 + band * 20)) + y * 5) % 330 - 5;
      const n = noise1(xx * 0.07 + y * 0.3 + t * 0.8);
      if (n > 0.55) g.rect(xx, y, 3 + Math.round(band * 4), 1, n > 0.8 ? P.seaHi : P.sea2);
    }
  }
  // the sun's glitter path
  for (let i = 0; i < 30; i++) {
    const y = hz + 3 + Math.floor(hash(i * 3) * 56), x = 262 + (hash(i * 7) - 0.5) * (10 + (y - hz) * 1.3);
    const ph = (t * 1.7 + hash(i)) % 1;
    if (ph < 0.5) g.rect(x, y, 2 + (i % 3), 1, P.foam);
  }
}

function drawMid(g, t, u0, sm) {
  const SW = 36;
  for (let i = Math.floor(u0 / SW) - 2; i < Math.floor((u0 + 320) / SW) + 3; i++) {
    const x = i * SW - u0;
    if (x + SW < sm[0] + 30) building(g, x, i);
    else if (x > sm[1] - 10) seaMid(g, x, i, t);
  }
  // campus gate at the very start
  const gx = 50 - u0;
  if (gx > -130 && gx < 330) gate(g, gx);
}

function building(g, x, i) {
  const kinds = ['shop', 'shop', 'apt', 'shop', 'house'];
  const k = kinds[Math.floor(hash(i * 17) * kinds.length)];
  const cols = [C('#F6C58A'), C('#F4A6A0'), C('#BFE3C0'), C('#C9D7F2'), C('#F4E3C0'), C('#E7C3F0')];
  const col = cols[Math.floor(hash(i * 5) * cols.length)];
  const dark = mix(col, P.ink, 0.25);
  if (k === 'apt') {
    const h = 70 + Math.floor(hash(i) * 20);
    g.rect(x, GROUND - 22 - h, 34, h + 22, col); g.rect(x + 30, GROUND - 22 - h, 4, h + 22, dark);
    for (let y = GROUND - 16 - h; y < GROUND - 26; y += 11) for (let xx = x + 4; xx < x + 28; xx += 9) { g.rect(xx, y, 6, 6, C('#8FC1F0')); g.rect(xx, y, 6, 1, C('#FFFFFF')); }
    return;
  }
  const h = 40 + Math.floor(hash(i + 3) * 18);
  g.rect(x, GROUND - 22 - h, 35, h + 22, col);
  g.rect(x + 31, GROUND - 22 - h, 4, h + 22, dark);
  g.rect(x - 1, GROUND - 22 - h, 37, 3, dark);
  if (k === 'house') {
    g.poly([x - 3, GROUND - 22 - h, x + 17, GROUND - 36 - h, x + 38, GROUND - 22 - h], C('#C0392B'));
    g.rect(x + 6, GROUND - 16 - h, 9, 9, C('#8FC1F0')); g.rect(x + 20, GROUND - 16 - h, 9, 9, C('#8FC1F0'));
    return;
  }
  // shop: awning + sign
  const signs = ['奶茶', '便利店', '书店', '网吧', '修电脑', '早餐', '水果'];
  const sgn = signs[Math.floor(hash(i * 29) * signs.length)];
  g.rect(x + 4, GROUND - 12 - h, 26, 8, C('#FFFFFF'));
  text(g, sgn, x + 17, GROUND - 13 - h, P.ink, { font: 'f8', align: 'center' });
  g.rect(x + 4, GROUND - 40, 27, 18, C('#8FC1F0'));                              // shop window
  g.rect(x + 4, GROUND - 40, 27, 2, C('#FFFFFF'));
  const aw = [C('#E43B44'), C('#3E8948'), C('#0099DB'), C('#F77622')][Math.floor(hash(i * 31) * 4)];
  for (let k2 = 0; k2 < 7; k2++) g.rect(x + 2 + k2 * 4, GROUND - 46, 4, 5, k2 % 2 ? aw : C('#FFFFFF'));
  for (let k2 = 0; k2 < 7; k2++) g.rect(x + 3 + k2 * 4, GROUND - 41, 2, 1, k2 % 2 ? aw : C('#FFFFFF'));
  g.rect(x + 12, GROUND - 22, 1, 0, P.ink);
}

function gate(g, x) {
  const stone = C('#C0CBDC'), st2 = C('#8B9BB4'), red = C('#C0392B');
  g.rect(x, GROUND - 78, 12, 78, stone); g.rect(x + 10, GROUND - 78, 2, 78, st2);
  g.rect(x + 96, GROUND - 78, 12, 78, stone); g.rect(x + 106, GROUND - 78, 2, 78, st2);
  g.rect(x - 6, GROUND - 90, 120, 14, red);
  g.rect(x - 6, GROUND - 90, 120, 2, C('#E0584A'));
  g.rect(x - 8, GROUND - 92, 124, 3, st2);
  text(g, '码农大学', x + 54, GROUND - 89, C('#FEE761'), { align: 'center' });
}

function forestTree(g, x, i, depth) {
  const h = 110 + Math.floor(hash(i * 7) * 30);
  const cx = x + 18;
  g.rect(cx - 3, GROUND - h + 30, 6, h, P.forest0);
  for (let k = 0; k < 5; k++) g.disc(cx + (hash(i * 13 + k) - 0.5) * 30, GROUND - h + 20 + k * 16, 20 - k, k % 2 ? P.forest1 : P.forest0);
  g.rect(x - 6, 0, 48, GROUND - h + 20, P.forest0);   // canopy closes overhead
  for (let k = 0; k < 6; k++) g.disc(x + hash(i * 3 + k) * 40, GROUND - h + 10 - k * 14, 16, k % 2 ? P.forest1 : P.forest0);
}

function seaMid(g, x, i, t) {
  // below the coastal road: rocks, a strip of beach, foam
  if (hash(i * 19) > 0.6) {
    g.ellipse(x + 18, GROUND - 4, 14, 6, P.cliffDk);
    g.ellipse(x + 16, GROUND - 6, 11, 5, P.cliff);
  }
}

function drawNear(g, t, u0, layer, sm) {
  if (layer === 'fg') {
    const SW = 44;
    for (let i = Math.floor(u0 / SW) - 1; i < Math.floor((u0 + 320) / SW) + 2; i++) {
      const x = i * SW - u0, z = zoneX(x, sm);
      if (hash(i * 7) < 0.45) continue;
      g.disc(x, 186, 12 + hash(i) * 6, z === 1 ? P.forest0 : P.grassDk);
      g.disc(x + 8, 184, 8, z === 1 ? P.forest1 : P.grass);
      if (z === 2) for (let k = 0; k < 3; k++) g.rect(x - 6 + k * 6, 174 + (k % 2) * 2, 2, 2, [P.flower1, P.flower2, P.flower3][k]);
    }
    return;
  }
  const SW = 40;
  // city + coast props
  for (let i = Math.floor(u0 / SW) - 1; i < Math.floor((u0 + 320) / SW) + 2; i++) {
    const x = i * SW - u0, z = zoneX(x + 5, sm);
    if (z === 0) {
      if (i % 3 === 0) {
        g.rect(x, GROUND - 60, 2, 60, P.lamp); g.rect(x, GROUND - 60, 10, 2, P.lamp); g.rect(x + 7, GROUND - 58, 5, 2, P.lampHi);
      } else if (i % 3 === 1) {
        g.rect(x + 1, GROUND - 26, 3, 26, P.trunk);
        g.disc(x + 2, GROUND - 34, 11, P.treeA); g.disc(x - 2, GROUND - 38, 7, P.treeB);
      }
    } else if (z === 2) {
      g.rect(x, GROUND - 12, SW, 2, P.rail); g.rect(x, GROUND - 10, SW, 1, P.railSh);
      g.rect(x + 4, GROUND - 14, 2, 14, i % 2 ? P.post : P.rail);
      if (i % 5 === 2) {
        g.rect(x + 20, GROUND - 30, 2, 30, P.lamp);
        g.rect(x + 10, GROUND - 38, 24, 10, C('#0099DB')); g.rect(x + 10, GROUND - 38, 24, 1, C('#FFFFFF'));
        text(g, '海边→', x + 22, GROUND - 38, C('#FFFFFF'), { font: 'f8', align: 'center' });
      }
    }
  }
  // the forest band: a solid wall of trees between the seams, with ragged edges
  const [xa, xb] = sm;
  if (xb < -40 || xa > 360) return;
  const L = Math.max(-40, Math.floor(xa)), R_ = Math.min(360, Math.ceil(xb));
  g.rect(L, 0, R_ - L, GROUND - 1, P.forest0);
  // canopy lumps along the top + ragged leading/trailing edges
  for (let i = Math.floor((xa + u0) / 14) - 1; i < Math.floor((xb + u0) / 14) + 2; i++) {
    const x = i * 14 - u0;
    const edge = Math.min(x - xa, xb - x);
    const r = 12 + hash(i * 3) * 8;
    const y = edge < 20 ? 20 + (20 - edge) * 3 * hash(i) : 4 + hash(i * 7) * 12;
    g.disc(x, y, r, hash(i) > 0.5 ? P.forest1 : P.forest0);
    g.disc(x - 4, y - 5, r * 0.5, P.forest2);
  }
  for (const [ex, dir] of [[xa, -1], [xb, 1]]) {
    for (let k = 0; k < 9; k++) g.disc(ex + dir * (2 + hash(k * 5 + (dir > 0 ? 50 : 0)) * 8), 16 + k * 15, 9 + hash(k) * 5, k % 2 ? P.forest1 : P.forest0);
  }
  // leaf clusters at all depths inside the wall
  g.push(); g.clip(L, 0, R_ - L, GROUND);
  for (let i = Math.floor((xa + u0) / 11) - 1; i < Math.floor((xb + u0) / 11) + 2; i++) {
    const x = i * 11 - u0;
    for (let k = 0; k < 3; k++) {
      const y = 26 + hash(i * 7 + k * 101) * 100, r = 5 + hash(i * 3 + k) * 7;
      g.disc(x + hash(i + k * 9) * 8, y, r, k === 2 ? P.forest2 : P.forest1);
      g.disc(x + hash(i + k * 9) * 8 - 2, y - 2, r * 0.45, k === 2 ? P.treeB : P.forest2);
    }
  }
  // light shafts slanting through the canopy
  for (let k = 0; k < 4; k++) {
    const bx = ((hash(k * 17) * 400 - u0 * 1.0) % 420 + 420) % 420 - 60;
    for (let y = 0; y < GROUND; y++) {
      const x0 = bx + y * 0.45;
      for (let i = 0; i < 10; i++) if (bayer(Math.round(x0 + i), y) < 0.28) g.pxa(x0 + i, y, P.light, 0.35);
    }
  }
  // undergrowth along the road edge
  for (let i = Math.floor((xa + u0) / 9) - 1; i < Math.floor((xb + u0) / 9) + 2; i++) {
    const x = i * 9 - u0;
    g.disc(x, GROUND - 5, 6 + hash(i * 5) * 4, hash(i) > 0.5 ? P.forest1 : P.forest2);
  }
  g.pop();
  // trunks with lit edges
  for (let i = Math.floor((xa + u0) / 26); i < Math.floor((xb + u0) / 26) + 1; i++) {
    const x = i * 26 - u0 + Math.floor(hash(i * 9) * 10);
    if (x < xa + 4 || x > xb - 8) continue;
    g.rect(x, 40, 5, GROUND - 48, P.treeD);
    g.rect(x, 40, 1, GROUND - 48, P.forest2);
    g.disc(x + 2, 40, 9, P.forest1); g.disc(x, 37, 4, P.forest2);
  }
  // dappled light flickering on the forest floor
  for (let i = 0; i < 12; i++) {
    const x = xa + ((hash(i * 13) * (xb - xa)) | 0);
    if (noise1(i * 1.7 + t * 4) > 0.55) g.rect(x, GROUND - 3 - (i % 3), 6 + (i % 4) * 2, 1, P.light);
  }
}

function drawRoad(g, t, u0, sm) {
  g.rect(0, GROUND - 2, 320, 30, P.road);
  g.rect(0, GROUND - 2, 320, 1, P.roadHi);
  for (let i = Math.floor(u0 / 30) - 1; i < Math.floor((u0 + 320) / 30) + 2; i++) g.rect(i * 30 - u0, GROUND + 12, 14, 2, P.line);
  for (let i = Math.floor(u0 / 7); i < Math.floor((u0 + 320) / 7) + 1; i++) if (hash(i) > 0.7) g.px(i * 7 - u0, GROUND + 4 + Math.floor(hash(i + 1) * 20), P.roadDk);
  g.rect(0, GROUND + 26, 320, 3, P.curb); g.rect(0, GROUND + 29, 320, 1, P.curbDk);
  g.rect(0, GROUND + 30, 320, 10, P.walk);
}
