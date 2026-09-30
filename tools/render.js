// Renders the film to MP4 (H.264 + AAC) via ffmpeg.
//   node tools/render.js [--fps 60] [--scale 6] [--out dist/clawd-goes-to-sea.mp4] [--from 0 --to 64.5]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Gfx, W, H } from '../src/core.js';
import { renderFrame } from '../src/film.js';
import { DURATION } from '../src/cues.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const FPS = +(args.fps || 60), SCALE = +(args.scale || 6);
const from = +(args.from || 0), to = +(args.to || DURATION);
const out = path.resolve(root, args.out || 'dist/clawd-goes-to-sea.mp4');
const wav = path.join(os.tmpdir(), `clawd-render-${process.pid}.wav`);   // private copy: nothing else writes here
fs.mkdirSync(path.dirname(out), { recursive: true });

// 1) soundtrack
let haveAudio = false;
try {
  const { renderSoundtrack, encodeWav } = await import('../src/audio.js');
  const t0 = Date.now();
  const { left, right, sampleRate } = renderSoundtrack(48000);
  fs.writeFileSync(wav, encodeWav(left, right, sampleRate));
  haveAudio = true;
  console.log(`audio: ${((Date.now() - t0) / 1000).toFixed(2)}s (${(left.length / sampleRate).toFixed(2)} s @ ${sampleRate} Hz)`);
} catch (e) {
  console.warn('audio unavailable, rendering silent video:', e.message);
}

// 2) video frames → ffmpeg
const ffArgs = [
  '-y', '-hide_banner', '-loglevel', 'error', '-stats',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
];
if (haveAudio) ffArgs.push('-ss', String(from), '-t', String(to - from), '-i', wav);
ffArgs.push(
  '-vf', `scale=${W * SCALE}:${H * SCALE}:flags=neighbor,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
);
if (haveAudio) ffArgs.push('-c:a', 'aac', '-b:a', '256k');
ffArgs.push('-movflags', '+faststart', '-t', String(to - from), out);

const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
const g = new Gfx(W, H);
const n = Math.round((to - from) * FPS);
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  renderFrame(g, from + i / FPS);
  const buf = Buffer.from(g.u8.buffer.slice(0));
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
if (haveAudio) fs.rmSync(wav, { force: true });
console.log(`\nvideo: ${n} frames @ ${FPS}fps in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
