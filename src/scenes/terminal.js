// S3 — CU of the MacBook screen: Claude Code in a terminal.
//   > 修复所有 bug  →  ✓ 12 fixed  →  ✗ 37 new  →  Issues 99+
// Also: terminalInsert() for the M7 face-on-keyboard "ffff…" gag,
//       laptopClose() for S7 (the lid comes down).
import { C, clamp, lerp, ease, noise1, mix, hash, bayer } from '../core.js';
import { drawClawd } from '../clawd.js';
import { text, measure } from '../font.js';
import { BEAT } from '../cues.js';

export const T = {
  bezel: C('#14141C'), bezelHi: C('#2A2B38'), bg: C('#1A1B26'), bar: C('#23243A'),
  fg: C('#E6E4DF'), dim: C('#7A7F99'), orange: C('#D77757'), green: C('#7BD88F'), red: C('#FF6B6B'),
  yellow: C('#FEE761'), sel: C('#2E3150'), glare: C('#FFFFFF'),
  r: C('#FF5F57'), yl: C('#FEBC2E'), gr: C('#28C840'),
};
const X0 = 26, Y0 = 16, SW = 268, SH = 142;          // screen rect inside the bezel

function frame(g, t) {
  g.clear(T.bezel);
  g.rect(X0 - 3, Y0 - 3, SW + 6, SH + 6, T.bezelHi);
  g.rect(X0, Y0, SW, SH, T.bg);
  // window chrome
  g.rect(X0, Y0, SW, 11, T.bar);
  g.disc(X0 + 8, Y0 + 5, 2, T.r); g.disc(X0 + 16, Y0 + 5, 2, T.yl); g.disc(X0 + 24, Y0 + 5, 2, T.gr);
  text(g, 'clawd — ~/campus-app — zsh', X0 + SW / 2, Y0 + 2, T.dim, { font: 'f8', align: 'center' });
  // camera notch
  g.rect(158, 10, 4, 3, C('#0A0A10'));
}

function header(g) {
  // the Claude Code v2 banner: Clawd logo + app name
  g.rect(X0 + 8, Y0 + 17, SW - 16, 30, T.bg);
  // rounded orange border
  const bx = X0 + 8, by = Y0 + 16, bw = SW - 16, bh = 30;
  g.rect(bx + 1, by, bw - 2, 1, T.orange); g.rect(bx + 1, by + bh - 1, bw - 2, 1, T.orange);
  g.rect(bx, by + 1, 1, bh - 2, T.orange); g.rect(bx + bw - 1, by + 1, 1, bh - 2, T.orange);
  drawClawd(g, bx + 18, by + 22, { s: 1, eyes: 'open' });
  text(g, 'Claude Code', bx + 32, by + 4, T.fg);
  text(g, 'v2 · ~/campus-app', bx + 32 + measure('Claude Code').w + 8, by + 6, T.dim, { font: 'f8' });
  text(g, '✻ Welcome back, Clawd!', bx + 32, by + 17, T.orange, { font: 'f8' });
}

// typewriter helper
const typedStr = (s, t, t0, cps) => (t < t0 ? '' : [...s].slice(0, Math.floor((t - t0) * cps) + 1).join(''));

export function terminal(g, lt, shot, t) {
  frame(g, t);
  header(g);
  const lx = X0 + 10;
  let y = Y0 + 54;
  // prompt
  const pr = '修复所有 bug';
  const shown = typedStr(pr, t, BEAT.termPrompt, 20);
  text(g, '>', lx, y, T.dim);
  text(g, shown, lx + 10, y, T.fg);
  if (t < BEAT.termThinking && Math.floor(t * 4) % 2 === 0) g.rect(lx + 10 + measure(shown).w + 1, y + 1, 5, 11, T.fg);
  y += 17;
  // thinking spinner
  if (t >= BEAT.termThinking) {
    const done = t >= BEAT.termFixed;
    const spin = ['✻', '*', '✻', '+'][Math.floor(t * 10) % 4];
    const col = done ? T.dim : mix(T.orange, T.yellow, Math.sin(t * 12) * 0.5 + 0.5);
    text(g, done ? '✻' : spin, lx, y, col);
    text(g, done ? '思考了 0.5 秒' : '思考中' + '.'.repeat(1 + Math.floor(t * 6) % 3), lx + 12, y, done ? T.dim : T.orange);
    y += 17;
  }
  if (t >= BEAT.termFixed) {
    text(g, '●', lx, y, T.green);
    text(g, '已修复 12 个 bug', lx + 12, y, T.fg);
    popIcon(g, '✓', lx + 12 + measure('已修复 12 个 bug').w + 8, y, t - BEAT.termFixed, T.green);
    y += 17;
  }
  if (t >= BEAT.termNewBugs) {
    const sh = t - BEAT.termNewBugs < 0.18 ? Math.round(Math.sin(t * 90) * 2) : 0;
    text(g, '●', lx + sh, y, T.red);
    text(g, '新增 37 个 bug', lx + 12 + sh, y, T.fg);
    popIcon(g, '✗', lx + 12 + measure('新增 37 个 bug').w + 8 + sh, y, t - BEAT.termNewBugs, T.red);
    y += 17;
  }
  // status bar at the bottom: issue counter
  const sy = Y0 + SH - 16;
  g.rect(X0, sy, SW, 16, T.bar);
  text(g, 'main', X0 + 8, sy + 3, T.dim, { font: 'f8' });
  let issues = 3;
  if (t >= BEAT.termFixed) issues = 0;
  if (t >= BEAT.termNewBugs) issues = 37;
  if (t >= BEAT.termIssues) issues = 99;
  const lbl = issues >= 99 ? 'Issues: 99+' : `Issues: ${issues}`;
  const hot = t >= BEAT.termIssues;
  const flash = hot && Math.floor((t - BEAT.termIssues) * 6) % 2 === 0;
  const w = measure(lbl, 'f10').w + 10;
  g.rect(X0 + SW - w - 6, sy + 2, w, 12, hot ? (flash ? T.red : C('#A22633')) : issues === 0 ? C('#1F5C3E') : T.sel);
  text(g, lbl, X0 + SW - w - 1, sy + 3, hot ? C('#FFFFFF') : T.fg, { font: 'f10' });
  glare(g, t);
  // Clawd's claws tapping at the bottom edge
  claws(g, t, t < BEAT.termIssues + 0.1);
  if (hot) { const k = clamp((t - BEAT.termIssues) / 0.08); g.recta(0, 0, 320, 180, T.red, (1 - k) * 0.25); }
}

function popIcon(g, ch, x, y, age, col) {
  const k = clamp(age / 0.15);
  if (k < 0.5) return;
  text(g, ch, x, y - (k < 1 ? 1 : 0), col, { scale: 1 });
}

function glare(g, t) {
  // soft diagonal reflection band on the glass
  for (let y = Y0; y < Y0 + SH; y++) for (let x = X0; x < X0 + SW; x++) {
    const d = (x - X0) * 0.6 - (y - Y0) - 40 - Math.sin(t * 0.3) * 4;
    if (d > 0 && d < 22) g.pxa(x, y, T.glare, d < 2 || d > 20 ? 0.02 : 0.045);
  }
}

function claws(g, t, typing) {
  const ph = Math.floor(t * 12) % 2;
  for (const [x, side] of [[118, -1], [202, 1]]) {
    const up = typing ? (ph ^ (side > 0 ? 1 : 0)) * 3 : 0;
    const y = 170 - up;
    g.rect(x - 7, y, 14, 12, C('#D77757'));
    g.rect(x - 7, y, 14, 2, C('#EC9B79'));
    g.rect(x - 1, y, 2, 4, T.bezel);                           // pincer notch
    g.rect(x - 7, y + 10, 14, 2, C('#B35A3D'));
  }
}

// M7 insert: face on the keyboard → endless "ffff"; zzz drifts across
export function terminalInsert(g, t, mode) {
  frame(g, t);
  header(g);
  const lx = X0 + 10, y = Y0 + 54;
  const n = Math.floor((t - (BEAT.faceplant + 0.5)) * 38) + 1;
  const line = 'f'.repeat(Math.max(0, n));
  text(g, '>', lx, y, T.dim);
  // wrap the fffff across lines
  const per = 40;
  for (let i = 0; i * per < line.length && i < 5; i++) text(g, line.slice(i * per, i * per + per), lx + 10, y + i * 13, T.fg);
  const last = Math.min(4, Math.floor(line.length / per));
  g.rect(lx + 10 + measure(line.slice(last * per, last * per + per)).w + 1, y + last * 13 + 1, 5, 11, T.fg);
  const sy = Y0 + SH - 16;
  g.rect(X0, sy, SW, 16, T.bar);
  text(g, 'main', X0 + 8, sy + 3, T.dim, { font: 'f8' });
  text(g, 'Issues: 99+', X0 + SW - 58, sy + 3, T.red, { font: 'f10' });
  glare(g, t);
  // a big sleepy Z floating over the glass
  const k = (t * 0.8) % 1;
  text(g, 'Z', 238 + Math.round(k * 10), 110 - Math.round(k * 26), C('#C8F1FF'), { scale: 2, outline: T.bezel });
  text(g, 'z', 222 + Math.round(((t * 0.8 + 0.5) % 1) * 8), 124 - Math.round(((t * 0.8 + 0.5) % 1) * 20), C('#8FD3FF'), { outline: T.bezel });
  // the top of Clawd's head resting on the keys (bottom edge)
  g.rect(118, 166, 84, 14, C('#D77757'));
  g.rect(118, 166, 84, 2, C('#EC9B79'));
}

// S7 — "Issues 99+" … a claw pulls the lid shut. Click. Dark.
export function laptopClose(g, lt, shot, t) {
  const k = clamp((t - (BEAT.lidClose - 0.25)) / 0.25);      // 0 open → 1 shut
  const e = ease.in(k);
  // behind the laptop: the golden classroom, blurred to blocks
  g.vgrad(0, 0, 320, 180, [[0, C('#F4B860')], [120, C('#E0924A')], [180, C('#A8603A')]]);
  for (let i = 0; i < 9; i++) g.rect(i * 40 - 10, 20 + (i % 2) * 8, 26, 90, C('#F8CF86'));
  g.rect(0, 150, 320, 30, C('#7A4A33'));
  // the screen foreshortens as it tilts down
  const sh = Math.round(lerp(112, 3, e));
  const top = 150 - sh;
  const sx = 70, sw = 180;
  g.rect(sx - 6, top - 6, sw + 12, sh + 12, T.bezel);
  if (k < 1) {
    g.rect(sx, top, sw, sh, T.bg);
    if (sh > 30) {
      g.push(); g.clip(sx, top, sw, sh);
      const yy = top + 8;
      text(g, '●', sx + 10, yy, T.red);
      text(g, '新增 37 个 bug', sx + 22, yy, T.fg);
      const flash = Math.floor(t * 6) % 2 === 0;
      g.rect(sx + 10, yy + 22, 96, 18, flash ? T.red : C('#A22633'));
      text(g, 'Issues: 99+', sx + 16, yy + 25, C('#FFFFFF'));
      text(g, '> _', sx + 10, yy + 50, T.dim);
      g.pop();
    }
    // screen glow onto the claw
    g.glow(160, top + sh / 2, 90, C('#8FD3FF'), 0.12 * (1 - e), 4);
  } else {
    g.rect(sx, top, sw, sh, C('#9AA3B8'));
  }
  // base / keyboard deck
  g.rect(sx - 14, 150, sw + 28, 10, C('#9AA3B8'));
  g.rect(sx - 14, 150, sw + 28, 2, C('#C4CCDD'));
  g.rect(sx - 14, 158, sw + 28, 2, C('#6E7690'));
  // Clawd's big claw comes in from the right and presses the lid down
  const clawIn = ease.outCubic(clamp((t - 31.55) / 0.3));
  const cx = Math.round(lerp(340, 214, clawIn)), cy = Math.round(top - 14 + (k > 0 ? 3 : 0));
  bigClaw(g, cx, cy);
  if (k >= 1) {
    // "click!" burst lines
    const a = t - BEAT.lidClose;
    if (a < 0.3) for (let i = 0; i < 6; i++) {
      const ang = -Math.PI + i * Math.PI / 5, r0 = 10 + a * 60, r1 = r0 + 6;
      g.line(160 + Math.cos(ang) * r0, 146 + Math.sin(ang) * r0 * 0.6, 160 + Math.cos(ang) * r1, 146 + Math.sin(ang) * r1 * 0.6, C('#FFFFFF'));
    }
  }
}

// A chunky pincer (upper jaw pressing down, lower jaw open), arm trailing off-screen right.
function bigClaw(g, x, y) {
  const o = C('#D77757'), hi = C('#EC9B79'), sh = C('#B35A3D'), dk = C('#86412B');
  g.rect(x + 16, y + 4, 120, 18, o); g.rect(x + 16, y + 4, 120, 3, hi); g.rect(x + 16, y + 19, 120, 3, sh);   // arm
  g.rect(x + 34, y + 4, 2, 18, sh);                                                                     // joint
  g.rect(x - 4, y - 6, 26, 14, o); g.rect(x - 4, y - 6, 26, 3, hi); g.rect(x - 6, y + 2, 10, 6, o);      // upper jaw
  g.rect(x - 6, y + 6, 10, 2, sh);
  g.rect(x + 2, y + 16, 20, 12, o); g.rect(x + 2, y + 25, 20, 3, sh); g.rect(x - 2, y + 18, 6, 6, o);    // lower jaw
  g.rect(x + 4, y + 8, 18, 8, dk);                                                                      // the gap
  g.rect(x + 14, y - 6, 2, 34, sh);
}
