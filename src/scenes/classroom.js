// M1 / M3 / M5 — INT. Classroom, day (side "stage" view).
// Owl professor at the blackboard, classmates facing front, Clawd at the
// back desk glued to his laptop — while outside the window the pelican
// cruises past towards the sea with a surfboard / a swim ring.
import { C, clamp, lerp, ease, hash, mix } from '../core.js';
import { drawClawd } from '../clawd.js';
import { drawRider } from '../pelican.js';
import { text } from '../font.js';
import { dayBadge } from './common.js';

export const CP = {
  wall: C('#EAD4AA'), wallSh: C('#D9BD8E'), wain: C('#B86F50'), wainHi: C('#C98A66'), wainDk: C('#8E5440'),
  floor: C('#8A5C4E'), floorHi: C('#9E6B58'), floorDk: C('#6E463C'),
  board: C('#2E5E4E'), boardHi: C('#3A7260'), frame: C('#733E39'), chalk: C('#F4F1EC'), chalkY: C('#FEE761'), chalkP: C('#F6A6B0'),
  sky: C('#8FD3FF'), sky2: C('#C8ECFF'), tree: C('#63C74D'), treeDk: C('#3E8948'), path: C('#D8C49A'), grass: C('#7ACB5A'),
  winFrame: C('#F4F1EC'), winFrameSh: C('#C0CBDC'),
  desk: C('#C28569'), deskDk: C('#8E5440'), deskHi: C('#E4A672'), chair: C('#6E4A3A'),
  banner: C('#C0392B'), bannerTxt: C('#FEE761'),
  ink: C('#181425'), sun: C('#FFF1C9'),
  lap: C('#C0CBDC'), lapDk: C('#8B9BB4'), glow: C('#8FD3FF'),
};

const VARIANT = [
  { board: ['数据结构', 'tree'], gear: 'surf', light: 0 },
  { board: ['算法', 'O(n log n)'], gear: 'ring', light: 0.2 },
  { board: ['期末考试', '!!!'], gear: 'none', light: 0.45 },
];

export function classroom(g, lt, shot, t) {
  const v = VARIANT[shot.variant || 0];
  drawWallAndWindows(g, lt, shot, t, v);
  drawBoard(g, v, t);
  drawOwl(g, 54, 138, t);
  // classmates
  const kids = [['bunny', 132], ['bear', 176], ['penguin', 220]];
  kids.forEach(([k, x], i) => { drawDesk(g, x, 138); drawStudent(g, k, x + 8, 138, t + i * 0.7); });
  // Clawd at the back desk, typing away
  drawDesk(g, 266, 138, true);
  const ph = Math.floor(t * 12) % 2;
  g.glow(274, 121, 12, CP.glow, 0.3, 3);
  drawClawd(g, 283, 128, { s: 1, eyes: 'half', lx: -1, legs: 'hide', armL: ph ? -1 : 0, armR: ph ? 0 : -1 });
  // laptop on his desk (side view: base + tilted screen facing Clawd)
  g.rect(261, 126, 12, 1, CP.lapDk);
  g.line(262, 125, 267, 116, CP.lap);
  g.line(263, 125, 268, 116, CP.lapDk);
  // warm light tint for later days
  if (v.light) g.recta(0, 0, 320, 180, C('#F4A04A'), v.light * 0.35);
  dayBadge(g, shot.day, lt);
}

function drawWallAndWindows(g, lt, shot, t, v) {
  g.rect(0, 0, 320, 180, CP.wall);
  g.rect(0, 0, 320, 6, CP.wallSh);
  // ceiling lights
  for (const x of [60, 170, 270]) { g.rect(x - 16, 0, 32, 3, C('#F4F1EC')); g.rect(x - 16, 3, 32, 1, C('#C0CBDC')); }
  // wainscot + floor
  g.rect(0, 110, 320, 30, CP.wain);
  g.rect(0, 110, 320, 2, CP.wainHi);
  for (let x = 0; x < 320; x += 20) g.rect(x, 114, 1, 26, CP.wainDk);
  g.rect(0, 138, 320, 42, CP.floor);
  g.rect(0, 138, 320, 2, CP.floorDk);
  for (let y = 146; y < 180; y += 8) g.rect(0, y, 320, 1, CP.floorDk);
  for (let y = 142, k = 0; y < 180; y += 8, k++) for (let x = (k * 37) % 60; x < 320; x += 60) g.rect(x, y, 1, 8, CP.floorDk);

  // two windows on the back wall
  const wins = [[168, 22, 62, 78], [242, 22, 62, 78]];
  for (const [x, y, w, h] of wins) {
    g.push(); g.clip(x, y, w, h);
    g.vgrad(x, y, w, y + h, [[y, CP.sky], [y + h, CP.sky2]]);
    // clouds
    for (let i = 0; i < 3; i++) { const cx = x + ((i * 47 + lt * 6) % (w + 30)) - 10; g.ellipse(cx, y + 14 + i * 9, 8, 3, C('#FFFFFF')); }
    // trees and a path outside
    for (let i = 0; i < 8; i++) g.disc(x - 8 + i * 12, y + h - 18 + (i % 2) * 3, 9, i % 2 ? CP.tree : CP.treeDk);
    g.rect(x, y + h - 10, w, 10, CP.grass);
    g.rect(x, y + h - 6, w, 6, CP.path);
    g.pop();
  }
  // the pelican cruising past outside (drawn across both windows, clipped)
  if (v.gear !== 'none') {
    const dur = shot.end - shot.start;
    const px = lerp(150, 330, clamp(lt / dur));
    for (const [x, y, w, h] of wins) {
      g.push(); g.clip(x, y, w, h);
      const r = drawRider(g, px, 100, { s: 1, dist: px, clawd: null, pel: { shades: 1 } });
      const [hx, hy] = r.pel.head;
      if (v.gear === 'surf') {                                       // surfboard balanced on his head
        const by = Math.round(hy) - 8;
        g.rect(px - 24, by, 42, 3, C('#F77622')); g.rect(px - 26, by + 1, 2, 1, C('#F77622')); g.rect(px + 18, by + 1, 2, 1, C('#F77622'));
        g.rect(px - 24, by, 42, 1, C('#FEAE34')); g.rect(px - 6, by, 3, 3, C('#FFFFFF'));
        g.rect(px - 25, by + 3, 44, 1, C('#B85C2A'));
      }
      if (v.gear === 'ring') {                                        // swim ring around the neck
        const rx = Math.round(hx) - 2, ry = Math.round(hy) + 7;
        g.ellipse(rx, ry, 7, 3, C('#E43B44')); g.ellipse(rx, ry - 1, 4, 1.2, C('#8FD3FF'));
        g.rect(rx - 5, ry - 2, 2, 5, C('#FFFFFF')); g.rect(rx + 3, ry - 2, 2, 5, C('#FFFFFF'));
      }
      g.pop();
    }
  }
  for (const [x, y, w, h] of wins) {
    g.rect(x - 3, y - 3, w + 6, 3, CP.winFrame); g.rect(x - 3, y + h, w + 6, 4, CP.winFrame);
    g.rect(x - 3, y, 3, h, CP.winFrame); g.rect(x + w, y, 3, h, CP.winFrame);
    g.rect(x + w / 2 - 1, y, 2, h, CP.winFrame); g.rect(x, y + h / 2 - 1, w, 2, CP.winFrame);
    g.rect(x - 3, y + h + 3, w + 6, 1, CP.winFrameSh);
  }
  // sun shafts on the floor
  for (const [x] of wins) g.poly([x + 4, 140, x + 60, 140, x + 30, 180, x - 26, 180], C('#F7D9A0'));
  for (const [x] of wins) g.recta(x - 26, 140, 90, 40, C('#FFF1C9'), 0.0);
  // banner above the board
  g.rect(14, 12, 112, 12, CP.banner);
  g.rect(14, 12, 112, 1, C('#E0584A'));
  text(g, '好好学习 天天向上', 70, 13, CP.bannerTxt, { font: 'f10', align: 'center' });
}

function drawBoard(g, v, t) {
  const x = 12, y = 30, w = 116, h = 64;
  g.rect(x - 3, y - 3, w + 6, h + 6, CP.frame);
  g.rect(x, y, w, h, CP.board);
  g.rect(x, y, w, 2, CP.boardHi);
  g.rect(x - 3, y + h + 3, w + 6, 3, CP.deskDk);                  // chalk tray
  g.rect(x + 10, y + h + 2, 5, 1, CP.chalk); g.rect(x + 18, y + h + 2, 4, 1, CP.chalkY);
  const [title, sub] = v.board;
  text(g, title, x + 8, y + 5, CP.chalk);
  if (sub === 'tree') {
    const nodes = [[70, 26], [50, 42], [90, 42], [40, 56], [60, 56], [100, 56]];
    for (const [a, b] of [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5]]) g.line(x + nodes[a][0], y + nodes[a][1], x + nodes[b][0], y + nodes[b][1], mix(CP.chalk, CP.board, 0.4));
    for (const [nx, ny] of nodes) { g.ring(x + nx, y + ny, 3, CP.chalk); }
  } else if (sub === '!!!') {
    text(g, '!!!', x + 70, y + 5, CP.chalkP, { scale: 2 });
    text(g, '6月30日', x + 8, y + 24, CP.chalkY);
    text(g, '范围：全部', x + 8, y + 40, CP.chalk);
  } else {
    text(g, sub, x + 8, y + 24, CP.chalkY);
    g.line(x + 8, y + 48, x + 100, y + 44, mix(CP.chalk, CP.board, 0.4));
    text(g, 'T(n)=2T(n/2)+n', x + 8, y + 49, CP.chalk, { font: 'f8' });
  }
}

// Owl professor (facing right, pointer stick back towards the board)
function drawOwl(g, x, foot, t) {
  const br = C('#8A5C4E'), brD = C('#6E463C'), belly = C('#E4C9A0'), face = C('#F2DDB8'), ink = CP.ink;
  const talk = Math.floor(t * 8) % 2;
  const bob = Math.round(Math.sin(t * 3) * 0.6);
  // feet
  g.rect(x - 5, foot - 2, 4, 2, C('#F77622')); g.rect(x + 2, foot - 2, 4, 2, C('#F77622'));
  // body
  g.ellipse(x, foot - 13 + bob, 10, 12, brD);
  g.ellipse(x, foot - 14 + bob, 9, 11, br);
  g.ellipse(x + 2, foot - 11 + bob, 6, 8, belly);
  for (let k = 0; k < 3; k++) { g.px(x + 1 + k * 2, foot - 13 + bob + k, brD); g.px(x + 1 + k * 2, foot - 8 + bob, brD); }
  // head
  const hy = foot - 32 + bob;
  g.disc(x, hy, 9.5, brD);
  g.disc(x, hy, 8.8, br);
  g.poly([x - 8, hy - 5, x - 5, hy - 13, x - 3, hy - 7], br);        // ear tufts
  g.poly([x + 8, hy - 5, x + 5, hy - 13, x + 3, hy - 7], br);
  g.ellipse(x + 1, hy + 1, 7.5, 6.5, face);
  // big eyes with glasses, looking right at the class
  for (const ex of [x - 3, x + 4]) { g.disc(ex, hy, 3, C('#FFFFFF')); g.rect(ex + 1, hy - 1, 2, 2, ink); g.ring(ex, hy, 3.6, ink); }
  g.rect(x - 1, hy - 1, 2, 1, ink);
  // beak (opens while talking)
  g.poly([x, hy + 3, x + 3, hy + 3, x + 1.5, hy + 6 + talk], C('#F7A13B'));
  // wing + pointer to the board
  g.poly([x - 7, foot - 20 + bob, x - 12, foot - 30 + bob, x - 9, foot - 14 + bob], brD);
  g.line(x - 12, foot - 30 + bob, x - 30, foot - 58 + Math.round(Math.sin(t * 2) * 2), C('#5A3A2E'));
  g.px(x - 30, foot - 58 + Math.round(Math.sin(t * 2) * 2), CP.chalk);
  // "blah" tick marks from the beak
  if (talk) { g.px(x + 8, hy + 4, ink); g.px(x + 10, hy + 3, ink); }
}

function drawDesk(g, x, floor, isClawd) {
  // chair (behind, to the right) then table (in front, to the left)
  g.rect(x + 18, floor - 12, 2, 12, CP.chair);
  g.rect(x + 10, floor - 12, 10, 2, CP.chair);
  g.rect(x + 18, floor - 26, 2, 14, CP.chair);
  g.rect(x + 11, floor - 2, 1, 2, CP.chair);
  g.rect(x - 6, floor - 12, 22, 3, CP.desk);
  g.rect(x - 6, floor - 12, 22, 1, CP.deskHi);
  g.rect(x - 5, floor - 9, 2, 9, CP.deskDk); g.rect(x + 13, floor - 9, 2, 9, CP.deskDk);
  g.rect(x - 4, floor - 9, 18, 3, CP.deskDk);
  if (!isClawd) { g.rect(x - 2, floor - 13, 8, 1, C('#F4F1EC')); g.px(x + 2, floor - 14, C('#3A4466')); }  // notebook + pen
}

function drawStudent(g, kind, x, floor, t) {
  const nod = Math.round(Math.sin(t * 2.2) * 0.6);
  const y = floor - 22 + nod;                            // head centre
  if (kind === 'bunny') {
    const w = C('#F4F1EC'), p = C('#F6A6B0'), sh = C('#C0CBDC');
    g.rect(x - 4, floor - 16, 9, 6, sh);
    g.ellipse(x + 1, y - 10, 2, 7, w); g.ellipse(x + 1, y - 10, 1, 5, p);
    g.ellipse(x + 5, y - 9, 2, 6, sh);
    g.disc(x, y, 6, w);
    g.px(x - 4, y - 1, CP.ink); g.px(x - 6, y + 1, p);
  } else if (kind === 'bear') {
    const b = C('#9E6B58'), bd = C('#6E463C'), m = C('#E4C9A0');
    g.rect(x - 5, floor - 16, 11, 6, bd);
    g.disc(x + 4, y - 6, 2.5, bd); g.disc(x - 3, y - 6, 2.5, b);
    g.disc(x, y, 7, b);
    g.ellipse(x - 5, y + 2, 3, 2, m); g.px(x - 7, y + 1, CP.ink);
    g.px(x - 3, y - 2, CP.ink);
  } else {
    const k = C('#262B44'), wh = C('#F4F1EC'), o = C('#F7A13B');
    g.rect(x - 4, floor - 16, 9, 6, k);
    g.disc(x, y, 6, k);
    g.ellipse(x - 2, y + 1, 3.5, 4, wh);
    g.px(x - 3, y - 1, CP.ink);
    g.poly([x - 5, y + 1, x - 9, y + 2, x - 5, y + 3], o);
  }
}
