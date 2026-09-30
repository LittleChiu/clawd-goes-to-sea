// Bitmap text rendering using the subset in font-data.js.
import { FONT_DATA } from './font-data.js';

// Hand-drawn glyphs for symbols the font lacks. [big (f12/f10), small (f8)]
const CUSTOM = {
  '✓': [`
......#
.....##
#...##.
##.##..
.###...
..#....`, `
....#
...#.
#.#..
.#...`],
  '✗': [`
#....#
##..##
.####.
..##..
.####.
##..##
#....#`, `
#...#
.#.#.
..#..
.#.#.
#...#`],
  '✻': [`
...#...
.#.#.#.
..###..
#######
..###..
.#.#.#.
...#...`, `
..#..
#.#.#
.###.
#.#.#
..#..`],
  '❤': [`
.##.##.
#######
#######
.#####.
..###..
...#...`, `
##.##
#####
.###.
..#..`],
  '›': [`
#...
.#..
..#.
.#..
#...`, `
#..
.#.
#..`],
};
function customGlyph(art, capH) {
  const rows = art.split('\n').filter(r => r.length);
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const bits = new Uint8Array(w * h);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) bits[y * w + x] = r[x] === '#' ? 1 : 0; });
  const yo = Math.max(0, Math.round((capH - h) / 2));      // centre on cap height
  return { adv: w + 2, w, h, xo: 1, yo, bits };
}

const cache = {};
function decode(id) {
  const f = FONT_DATA[id];
  const glyphs = new Map();
  for (const [ch, [adv, w, h, xo, yo, hex]] of Object.entries(f.glyphs)) {
    const hpr = Math.ceil(w / 8) * 2;          // hex digits per row
    const bits = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const v = parseInt(hex.substr(y * hpr, hpr), 16);
      for (let x = 0; x < w; x++) bits[y * w + x] = (v >> (hpr * 4 - 1 - x)) & 1;
    }
    glyphs.set(ch, { adv, w, h, xo, yo, bits });
  }
  const small = id === 'f8';
  for (const [ch, arts] of Object.entries(CUSTOM))
    if (!glyphs.has(ch)) glyphs.set(ch, customGlyph(small ? arts[1] : arts[0], small ? 5 : 8));
  return { ascent: f.ascent, descent: f.descent, glyphs, fallback: glyphs.get('?') };
}
export const font = id => (cache[id] ||= decode(id));

export function measure(str, id = 'f12', spacing = 0) {
  const f = font(id);
  let w = 0, best = 0, lines = 1;
  for (const ch of str) {
    if (ch === '\n') { best = Math.max(best, w); w = 0; lines++; continue; }
    const gl = f.glyphs.get(ch) || f.fallback;
    w += gl.adv + spacing;
  }
  best = Math.max(best, w);
  return { w: best - (best ? spacing : 0), h: lines * (f.ascent + f.descent) };
}

function drawRun(g, f, str, x, y, c, spacing, scale) {
  let pen = x;
  const base = y + f.ascent * scale;
  for (const ch of str) {
    const gl = f.glyphs.get(ch) || f.fallback;
    const top = base - (gl.yo + gl.h) * scale;
    for (let j = 0; j < gl.h; j++) for (let i = 0; i < gl.w; i++) {
      if (!gl.bits[j * gl.w + i]) continue;
      if (scale === 1) g.px(pen + gl.xo + i, top + j, c);
      else g.rect(pen + (gl.xo + i) * scale, top + j * scale, scale, scale, c);
    }
    pen += (gl.adv + spacing) * scale;
  }
  return pen;
}

// o: { font, align: 'left'|'center'|'right', outline, outline8, shadow, shadowOff, spacing, lineHeight, scale }
export function text(g, str, x, y, c, o = {}) {
  const id = o.font || 'f12', f = font(id), sp = o.spacing || 0, sc = o.scale || 1;
  const lh = (o.lineHeight || f.ascent + f.descent + 1) * sc;
  const lines = String(str).split('\n');
  lines.forEach((ln, li) => {
    const w = measure(ln, id, sp).w * sc;
    let lx = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
    const ly = Math.round(y + li * lh);
    if (o.shadow !== undefined) {
      const [sx, sy] = o.shadowOff || [0, 1];
      drawRun(g, f, ln, lx + sx * sc, ly + sy * sc, o.shadow, sp, sc);
    }
    if (o.outline !== undefined) {
      const offs = o.outline8
        ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
        : [[0, -1], [-1, 0], [1, 0], [0, 1]];
      for (const [dx, dy] of offs) drawRun(g, f, ln, lx + dx * sc, ly + dy * sc, o.outline, sp, sc);
    }
    drawRun(g, f, ln, lx, ly, c, sp, sc);
  });
}

// Greedy wrap by pixel width (CJK can break anywhere; keep punctuation off line starts).
const NO_START = '，。！？、；：”’）》」』…—,.!?;:)';
export function wrap(str, maxW, id = 'f12') {
  const out = [];
  let line = '';
  for (const ch of str) {
    if (ch === '\n') { out.push(line); line = ''; continue; }
    const test = line + ch;
    if (measure(test, id).w > maxW && line && !NO_START.includes(ch)) { out.push(line); line = ch; }
    else line = test;
  }
  if (line) out.push(line);
  return out.join('\n');
}
