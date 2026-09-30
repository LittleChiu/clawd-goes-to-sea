// Render frames to PNG for review.
//   node tools/snap.js 1.5 7 22.3            → one PNG per time (×4)
//   node tools/snap.js --sheet 0 20 0.5      → contact sheet (1×, 4 per row)
//   node tools/snap.js --scale 6 --out dir 30
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Gfx, W, H, C } from '../src/core.js';
import { renderFrame } from '../src/film.js';
import { text } from '../src/font.js';
import { encodePNG } from './png.js';

const args = process.argv.slice(2);
let scale = 4, out = process.env.SNAPS || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../snaps');
let sheet = null, cols = 4;
const times = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scale') scale = +args[++i];
  else if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--cols') cols = +args[++i];
  else if (args[i] === '--sheet') sheet = [+args[++i], +args[++i], +args[++i]];
  else times.push(+args[i]);
}
fs.mkdirSync(out, { recursive: true });
const g = new Gfx(W, H);
if (sheet) {
  const [t0, t1, st] = sheet;
  const ts = [];
  for (let t = t0; t <= t1 + 1e-6; t += st) ts.push(+t.toFixed(3));
  const rows = Math.ceil(ts.length / cols), pad = 2, lab = 10;
  const S = new Gfx(cols * (W + pad) + pad, rows * (H + pad + lab) + pad);
  S.clear(C('#101018'));
  ts.forEach((t, i) => {
    renderFrame(g, t);
    const ox = pad + (i % cols) * (W + pad), oy = pad + Math.floor(i / cols) * (H + pad + lab);
    for (let y = 0; y < H; y++) S.u32.set(g.u32.subarray(y * W, y * W + W), (oy + lab + y) * S.w + ox);
    text(S, `${t.toFixed(2)}s`, ox + 1, oy, C('#FEE761'), { font: 'f8' });
  });
  const f = path.join(out, `sheet_${t0}-${t1}.png`);
  fs.writeFileSync(f, encodePNG(S.w, S.h, S.u8, scale === 4 ? 2 : scale));
  console.log(f);
} else {
  for (const t of times) {
    const t0 = Date.now();
    renderFrame(g, t);
    const f = path.join(out, `t_${t.toFixed(2)}.png`);
    fs.writeFileSync(f, encodePNG(W, H, g.u8, scale));
    console.log(f, `${Date.now() - t0}ms`);
  }
}
