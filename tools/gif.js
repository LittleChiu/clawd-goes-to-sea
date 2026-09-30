// Renders a stretch of the film straight from the engine to an animated GIF
// (crisp pixels, one optimised palette, no extra dithering).
//   node tools/gif.js --from 40.8 --to 45.8 --scale 2 --fps 20 --out media/preview.gif
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Gfx, W, H } from '../src/core.js';
import { renderFrame } from '../src/film.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const from = +(args.from ?? 40.8), to = +(args.to ?? 45.8), fps = +(args.fps ?? 20), scale = +(args.scale ?? 2);
const out = path.resolve(root, args.out || 'media/preview.gif');

const ff = spawn('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0',
  '-filter_complex', `scale=${W * scale}:${H * scale}:flags=neighbor,split[a][b];[a]palettegen=max_colors=256:stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
  '-loop', '0', out,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const g = new Gfx(W, H);
const n = Math.round((to - from) * fps);
for (let i = 0; i < n; i++) {
  renderFrame(g, from + i / fps);
  if (!ff.stdin.write(Buffer.from(g.u8.buffer.slice(0)))) await new Promise(r => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
console.log(`${n} frames → ${path.relative(root, out)}`);
