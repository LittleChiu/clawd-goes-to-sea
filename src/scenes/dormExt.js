// S1 — EXT. Dormitory, 3 a.m. Window lights click off on the beat until
// only one is left: a cold blue laptop glow. Title drops in over the sky.
import { C, hash, clamp, lerp, noise1, ease, mix } from '../core.js';
import { stars, bouncyText } from '../fx.js';
import { BEAT } from '../cues.js';
import { text } from '../font.js';

const P = {
  sky0: C('#0B0A1A'), sky1: C('#131430'), sky2: C('#1C1F42'), sky3: C('#2A2F5C'),
  moon: C('#FFF3C4'), moonSh: C('#E8D597'),
  far: C('#171935'), farLit: C('#5A5236'),
  wall: C('#2B2F52'), wallLit: C('#383E68'), wallDk: C('#20233F'), trim: C('#454C7A'),
  winOff: C('#15172C'), winOff2: C('#1D2040'), frame: C('#4B5283'),
  warm: C('#FEAE34'), warm2: C('#FEE761'), warmDk: C('#C9772A'),
  blue: C('#7FD4FF'), blue2: C('#C8F1FF'), blueDk: C('#3E8FC9'),
  tree: C('#0F1224'), treeHi: C('#1C2244'),
  ground: C('#1A1D33'), path: C('#262A48'), grass: C('#14222A'),
  lamp: C('#FFD37A'),
  ink: C('#181425'), white: C('#F4F1EC'), orange: C('#D77757'),
};

// Building geometry
export const DORM = { x: 92, y: 62, w: 150, cols: 6, rows: 4, cellW: 23, cellH: 23, winW: 12, winH: 14 };
export const CLAWD_WIN = { col: 3, row: 1 };
export function windowRect(col, row) {
  const x = DORM.x + 9 + col * DORM.cellW, y = DORM.y + 10 + row * DORM.cellH;
  return [x, y, DORM.winW, DORM.winH];
}
// initially lit windows, in the order they switch off
const LIT = [[0, 1], [5, 2], [2, 0], [4, 3], [1, 2], [5, 0], [0, 3], [3, 0]];

export function dormExt(g, lt, shot, t) {
  const cam = Math.round(lerp(0, -4, ease.inOut(clamp(lt / 5))));    // slow tilt down
  // sky
  g.vgrad(0, 0, 320, 180, [[0, P.sky0], [50, P.sky1], [100, P.sky2], [150, P.sky3]]);
  stars(g, 70, 0, 0, 320, 110, t, 3);
  // moon with halo
  g.glow(262, 30 + cam, 22, C('#C8C0FF'), 0.18, 4);
  g.disc(262, 30 + cam, 8, P.moon);
  g.disc(266, 27 + cam, 7.2, P.sky1);
  // re-dither the bite so it blends with the sky gradient
  // far campus silhouette
  g.push(); g.translate(0, cam);
  for (let i = 0; i < 12; i++) {
    const bx = i * 30 - 10 + Math.floor(hash(i) * 10), bw = 22 + Math.floor(hash(i + 50) * 16), bh = 20 + Math.floor(hash(i + 90) * 26);
    g.rect(bx, 150 - bh, bw, bh, P.far);
    for (let k = 0; k < 4; k++) if (hash(i * 9 + k) > 0.6) g.px(bx + 3 + Math.floor(hash(i * 5 + k) * (bw - 6)), 150 - bh + 4 + Math.floor(hash(i * 3 + k) * (bh - 8)), P.farLit);
  }
  // back tree line
  for (let i = 0; i < 40; i++) g.disc(i * 9 + (hash(i) * 6), 150 + hash(i + 3) * 4, 6 + hash(i + 7) * 5, P.tree);

  drawBuilding(g, t);

  // ground + path
  g.rect(0, 164, 320, 16, P.grass);
  g.poly([140, 164, 196, 164, 214, 180, 122, 180], P.path);
  // street lamp (left)
  g.rect(48, 118, 2, 46, C('#2E3354'));
  g.rect(44, 116, 10, 3, C('#3A4066'));
  g.rect(46, 119, 6, 2, P.lamp);
  g.glow(49, 122, 20, P.lamp, 0.22, 4);
  g.ellipse(49, 166, 16, 3, C('#2A2A3C'));
  // foreground trees (parallax, slightly faster)
  const fx = Math.round(lerp(0, -2, lt / 5));
  for (const [x0, y0, r] of [[8, 142, 22], [30, 152, 16], [300, 140, 24], [280, 156, 14], [322, 150, 18]]) {
    g.disc(x0 + fx, y0, r, P.tree);
    g.disc(x0 + fx - r * 0.3, y0 - r * 0.35, r * 0.55, P.treeHi);
    g.disc(x0 + fx - r * 0.2, y0 - r * 0.2, r * 0.58, P.tree);
  }
  g.rect(300 + fx, 150, 3, 20, P.tree);
  g.pop();

  // Title
  bouncyText(g, 'Clawd 去看海', 160, 10, t, BEAT.titleIn, {
    scale: 2, color: P.white, outline: P.ink, shadow: P.orange, stagger: 0.09, fadeOut: BEAT.titleOut,
  });
  if (t > BEAT.titleIn + 1.0 && t < BEAT.titleOut + 0.3) {
    const a = clamp((t - BEAT.titleIn - 1.0) / 0.3) * clamp((BEAT.titleOut + 0.3 - t) / 0.3);
    if (a > 0.5) text(g, 'CLAWD GOES TO THE SEA', 160, 40, C('#8B9BB4'), { font: 'f8', align: 'center', spacing: 1 });
  }
}

function drawBuilding(g, t) {
  const { x, y, w, rows, cellH } = DORM;
  const h = rows * cellH + 12;
  // body with moonlit left edge and shaded right
  g.rect(x, y, w, h, P.wall);
  g.rect(x, y, 3, h, P.wallLit);
  g.rect(x + w - 4, y, 4, h, P.wallDk);
  // parapet + roof details
  g.rect(x - 2, y - 3, w + 4, 4, P.trim);
  g.rect(x + 18, y - 12, 18, 9, P.wallDk);           // water tank
  g.rect(x + 20, y - 14, 14, 2, P.trim);
  g.rect(x + w - 30, y - 18, 1, 15, P.trim);         // antenna
  g.rect(x + w - 33, y - 16, 7, 1, P.trim);
  // floor lines
  for (let r = 1; r < rows; r++) g.rect(x + 3, y + 6 + r * cellH, w - 7, 1, P.wallDk);
  // windows
  for (let r = 0; r < rows; r++) for (let c = 0; c < DORM.cols; c++) {
    const [wx, wy, ww, wh] = windowRect(c, r);
    const isClawd = c === CLAWD_WIN.col && r === CLAWD_WIN.row;
    const li = LIT.findIndex(([a, b]) => a === c && b === r);
    let state = 'off';
    if (isClawd) state = 'clawd';
    else if (li >= 0) {
      const tOff = BEAT.lightsOff[li];
      state = t < tOff ? 'on' : t < tOff + 0.06 ? 'flick' : 'off';
    }
    drawWindow(g, wx, wy, ww, wh, state, t, c * 7 + r);
  }
  // entrance
  const ex = x + w / 2 - 12;
  g.rect(ex, y + h - 22, 24, 22, P.wallDk);
  g.rect(ex + 2, y + h - 19, 20, 19, C('#3B3350'));
  g.rect(ex + 3, y + h - 18, 8, 18, C('#4C4368')); g.rect(ex + 13, y + h - 18, 8, 18, C('#4C4368'));
  g.rect(ex - 4, y + h - 25, 32, 3, P.trim);
  g.rect(ex + 6, y + h - 30, 12, 5, C('#1F5C3E'));   // little green sign
  text(g, '3', ex + 10, y + h - 31, C('#9CF0B8'), { font: 'f8' });
}

function drawWindow(g, x, y, w, h, state, t, seed) {
  g.rect(x - 1, y - 1, w + 2, h + 2, P.frame);
  if (state === 'on' || state === 'flick') {
    const c = state === 'flick' ? P.warm2 : P.warm;
    g.rect(x, y, w, h, c);
    g.rect(x, y, w, 2, P.warm2);
    // curtain + silhouette variety
    if (seed % 3 === 0) g.rect(x, y, 3, h, P.warmDk);
    if (seed % 3 === 1) { g.rect(x + w - 4, y, 4, h, P.warmDk); }
    if (seed % 4 === 2) g.rect(x + 3, y + h - 6, 5, 6, P.warmDk);
    g.glow(x + w / 2, y + h / 2, 14, P.warm, 0.1, 3);
  } else if (state === 'clawd') {
    const fl = noise1(t * 7) > 0.55 ? 1 : 0;
    g.rect(x, y, w, h, fl ? P.blueDk : C('#35699A'));
    // the screen's cold light spilling on the ceiling/wall inside
    g.rect(x, y, w, 3, C('#294F78'));
    // tiny laptop + Clawd silhouette at the desk
    g.rect(x + 2, y + h - 4, w - 4, 1, C('#1A2A44'));                    // desk
    g.rect(x + 7, y + h - 8, 3, 4, fl ? P.blue2 : P.blue);                // laptop screen glow
    g.rect(x + 3, y + h - 7, 4, 3, P.orange);                             // Clawd!
    g.px(x + 4, y + h - 6, C('#1B1117')); g.px(x + 6, y + h - 6, C('#1B1117'));
    g.glow(x + w / 2, y + h / 2, 18, P.blue, 0.14, 3);
  } else {
    g.rect(x, y, w, h, P.winOff);
    g.rect(x + 1, y + 1, 3, 1, P.winOff2);                                // moon glint
    g.px(x + 1, y + 2, P.winOff2);
  }
  g.rect(x + (w >> 1), y, 1, h, P.frame);                                 // mullion
}
