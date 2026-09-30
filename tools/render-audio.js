// tools/render-audio.js — render the soundtrack to dist/soundtrack.wav and print
// mix statistics so the arc can be sanity-checked without ears.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSoundtrack, encodeWav } from '../src/audio.js';
import { PARTS, SHOTS, BEAT, DURATION, DIALOG, MONTAGE_CUTS } from '../src/cues.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SR = 44100;

// ── render (timed, exactly as the browser calls it) ──
const t0 = performance.now();
const { left, right, sampleRate } = renderSoundtrack(SR);
const renderMs = performance.now() - t0;
const wav = encodeWav(left, right, sampleRate);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'soundtrack.wav'), wav);

// ── second render with debug info (also a determinism check) ──
const dbgRun = renderSoundtrack(SR, { debug: true });
const { debug } = dbgRun;
let same = dbgRun.left.length === left.length;
for (let i = 0; same && i < left.length; i++) if (dbgRun.left[i] !== left[i] || dbgRun.right[i] !== right[i]) same = false;

// ── helpers ──
const N = left.length;
const dB = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const fmt = (x, w = 7) => (Number.isFinite(x) ? x.toFixed(1) : '  -inf').padStart(w);
const idx = (t) => Math.max(0, Math.min(N, Math.round(t * SR)));
function stats(L, R, a, b, g = 1) {
  const i0 = idx(a), i1 = idx(b);
  let ss = 0, pk = 0, mid = 0, side = 0;
  for (let i = i0; i < i1; i++) {
    const l = L[i] * g, r = R[i] * g;
    ss += l * l + r * r;
    mid += (l + r) * (l + r); side += (l - r) * (l - r);
    pk = Math.max(pk, Math.abs(l), Math.abs(r));
  }
  const n = Math.max(1, 2 * (i1 - i0));
  return { rms: dB(Math.sqrt(ss / n)), peak: dB(pk), width: 10 * Math.log10((side + 1e-20) / (mid + 1e-20)) };
}
const shot = (id) => SHOTS.find((s) => s.id === id);
const part = (id) => PARTS.find((p) => p.id === id);
const ng = debug.master.normGain;

// ── global numbers ──
let peak = 0, peakAt = 0, clipped = 0, sumL = 0, sumR = 0;
for (let i = 0; i < N; i++) {
  const l = left[i], r = right[i], a = Math.max(Math.abs(l), Math.abs(r));
  if (a > peak) { peak = a; peakAt = i / SR; }
  if (Math.abs(l) >= 1 || Math.abs(r) >= 1) clipped++;
  sumL += l; sumR += r;
}
let pcmRails = 0;
const dv = new DataView(wav.buffer, 44);
for (let o = 0; o < dv.byteLength; o += 2) { const s = dv.getInt16(o, true); if (s >= 32767 || s <= -32768) pcmRails++; }

console.log('\n《Clawd 去看海》 soundtrack → dist/soundtrack.wav');
console.log(`  duration      ${(N / SR).toFixed(3)} s  (cues DURATION ${DURATION})  ·  ${sampleRate} Hz stereo 16-bit  ·  ${(wav.length / 1048576).toFixed(2)} MB`);
console.log(`  render time   ${renderMs.toFixed(0)} ms  ${renderMs < 3000 ? '(OK < 3 s)' : '(TOO SLOW)'}`);
console.log(`  deterministic ${same ? 'yes (two renders bit-identical)' : 'NO — renders differ!'}`);
console.log(`  peak          ${fmt(dB(peak))} dBFS at ${peakAt.toFixed(3)} s (${(PARTS.find((p) => peakAt >= p.start && peakAt < p.end) || {}).id})`);
console.log(`  clipped       ${clipped} float samples ≥ 1.0 · ${pcmRails} PCM samples at the rails`);
console.log(`  DC offset     L ${(sumL / N).toExponential(2)}  R ${(sumR / N).toExponential(2)}`);
console.log(`  limiter       max gain reduction ${debug.master.maxGainReductionDb.toFixed(2)} dB at ${debug.master.maxGainReductionAt.toFixed(3)} s · active (>0.1 dB) ${(100 * debug.master.limiterActive).toFixed(2)} % of the time · normalise ×${ng.toFixed(3)}`);

// ── RMS per part and per key moment ──
const S7 = shot('S7'), S8 = shot('S8'), S11 = shot('S11'), S13 = shot('S13');
const segs = [
  ...PARTS.map((p) => [`PART ${p.id}`, p.start, p.end]),
  null,
  ['night exterior (S1)', 0, shot('S2').start],
  ['dorm, typing + snores (S2)', shot('S2').start, BEAT.nodOff],
  ['  nod-off sag', BEAT.nodOff, BEAT.jolt],
  ['  after jolt', BEAT.jolt, shot('S3').start],
  ['terminal gag (S3)', shot('S3').start, shot('M1').start],
  ['montage', shot('M1').start, BEAT.faceplant],
  ['  power-down', BEAT.faceplant, BEAT.faceplant + 0.6],
  ['  after faceplant', BEAT.faceplant + 0.6, part('wish').start],
  ['wish · quiet classroom', part('wish').start, BEAT.bubbleOpen],
  ['wish · the dream', BEAT.bubbleOpen, BEAT.bubblePop],
  ['  silence after pop', BEAT.bubblePop + 0.05, BEAT.bellDistant],
  ['pelican · first groove', part('pelican').start, BEAT.skid],
  ['  skid → shades', BEAT.skid + 0.3, BEAT.shades],
  ['pelican · groove + lines', BEAT.shades + 0.35, S7.start],
  ['  S7 suspense', S7.start, BEAT.lidClose],
  ['  S8 jump + pickup', S8.start, part('pelican').end],
  ['ride · city', part('ride').start, BEAT.hill],
  ['ride · downhill', BEAT.hill, BEAT.crest],
  ['ride · CREST (sea reveal)', BEAT.crest, part('ride').end],
  ['beach · play', part('beach').start, S11.start],
  ['beach · phone gag', S11.start, BEAT.gulp],
  ['  gulp silence (glugs+咕嘟+surf)', BEAT.gulp + 0.05, BEAT.laugh],
  ['    dead air (surf only)', BEAT.gulp + 0.55, BEAT.laugh - 0.1],
  ['  laugh + flourish', BEAT.laugh, part('beach').end],
  ['sunset', part('sunset').start, S13.start],
  ['end card', S13.start, DURATION - 0.5],
  ['  final 0.3 s', DURATION - 0.3, DURATION],
];
console.log('\n  segment                          start    end   RMS dBFS  peak dBFS   music RMS   sfx RMS   width S/M dB');
for (const s of segs) {
  if (!s) { console.log('  ' + '·'.repeat(92)); continue; }
  const [name, a, b] = s, all = stats(left, right, a, b), mu = stats(debug.musL, debug.musR, a, b, ng), fx = stats(debug.fxL, debug.fxR, a, b, ng);
  console.log(`  ${name.padEnd(30)} ${a.toFixed(2).padStart(6)} ${b.toFixed(2).padStart(6)}  ${fmt(all.rms, 8)}  ${fmt(all.peak, 9)}   ${fmt(mu.rms, 9)} ${fmt(fx.rms, 9)}   ${fmt(all.width, 8)}`);
}

// ── SFX / dialogue legibility: SFX-bus vs music-bus RMS in a short window after each cue ──
const ev = [
  ['lightsOff[0]', BEAT.lightsOff[0], 0.08], ['snores[0]', BEAT.snores[0], 1.0], ['jolt', BEAT.jolt, 0.15],
  ['termPrompt', BEAT.termPrompt, 0.35], ['termFixed ding', BEAT.termFixed, 0.35], ['termNewBugs', BEAT.termNewBugs, 0.3],
  ['termIssues', BEAT.termIssues, 0.35], ['montage cut 4', MONTAGE_CUTS[3] - 0.08, 0.12], ['faceplant', BEAT.faceplant, 0.2],
  ['gullCry[0]', BEAT.gullCry[0], 0.5], ['bubble[0]', BEAT.bubble[0], 0.08], ['sparkle', BEAT.sparkle, 0.45],
  ['bubblePop', BEAT.bubblePop, 0.08], ['bellDistant', BEAT.bellDistant, 0.4], ['zoomPast', BEAT.zoomPast, 0.3],
  ['skid', BEAT.skid, 0.4], ['shades', BEAT.shades, 0.3], ['bell1', BEAT.bell1, 0.35], ['lidClose', BEAT.lidClose, 0.2],
  ['jump', BEAT.jump, 0.35], ['land', BEAT.land, 0.3], ['bell2', BEAT.bell2, 0.35], ['gulls[0]', BEAT.gulls[0], 0.8],
  ['waveIn[0]', BEAT.waveIn[0], 0.5], ['splash', BEAT.splash, 0.25], ['crabsPop', BEAT.crabsPop, 0.45],
  ['buzz[0]', BEAT.buzz[0], 0.23], ['snap', BEAT.snap, 0.1], ['gulp', BEAT.gulp, 0.35], ['laugh', BEAT.laugh, 0.45],
  ...DIALOG.filter((l) => l.cps && l.who !== 'caption').map((l) => [`line "${l.id}" (${l.who})`, l.t, Math.max(0.1, [...l.text].length / l.cps)]),
];
console.log('\n  cue legibility: SFX/voice bus vs music bus, short window after each cue (short clicks read louder than RMS says)');
console.log('  cue                                               sfx RMS  music RMS   margin');
for (const [name, t, d] of ev) {
  const fx = stats(debug.fxL, debug.fxR, t, t + d, ng).rms, mu = stats(debug.musL, debug.musR, t, t + d, ng).rms;
  const margin = fx - mu;
  console.log(`  ${name.padEnd(28)} @${t.toFixed(2).padStart(6)} +${d.toFixed(2)}    ${fmt(fx)}  ${fmt(mu, 9)}  ${fmt(margin, 7)}${margin < -3 ? '  ← buried?' : ''}`);
}

// ── loudness timeline (0.5 s windows) ──
console.log('\n  loudness timeline (RMS per 0.5 s, each █ ≈ 2 dB above −60 dBFS)');
for (let t = 0; t < DURATION - 1e-9; t += 0.5) {
  const { rms } = stats(left, right, t, Math.min(DURATION, t + 0.5));
  const p = PARTS.find((q) => t >= q.start && t < q.end);
  const bar = Math.max(0, Math.round((Math.max(rms, -60) + 60) / 2));
  console.log(`  ${t.toFixed(1).padStart(5)} ${(p ? p.id : '').padEnd(8)} ${fmt(rms, 6)} ${'█'.repeat(bar)}`);
}

// ── note sanity: key membership + frequency range ──
const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
console.log('\n  notes by part: count · out-of-key (vs PARTS key) · range per role');
let outTotal = 0;
for (const p of PARTS) {
  const [ton, mode] = p.key.split(' ');
  const pcs = SCALE[mode].map((x) => (x + PC[ton]) % 12);
  const ns = debug.notes.filter((n) => n.part === p.id);
  const out = ns.filter((n) => n.m !== null && !pcs.includes(((Math.round(n.m) % 12) + 12) % 12));
  outTotal += out.length;
  console.log(`  ${p.id.padEnd(8)} ${String(ns.length).padStart(4)} notes · ${p.key.padEnd(8)} · out of key: ${out.length ? out.map((n) => `${n.role}:${noteName(Math.round(n.m))}@${n.t.toFixed(2)}`).join(', ') : 'none'}`);
  const roles = {};
  for (const n of ns) { const r = (roles[n.role] ||= { lo: Infinity, hi: 0, mlo: Infinity, mhi: -Infinity }); r.lo = Math.min(r.lo, n.f); r.hi = Math.max(r.hi, n.f); if (n.m !== null) { r.mlo = Math.min(r.mlo, n.m); r.mhi = Math.max(r.mhi, n.m); } }
  for (const [role, r] of Object.entries(roles)) {
    const flag = r.lo < 30 || r.hi > 5000 ? '  ← CHECK' : '';
    console.log(`      ${role.padEnd(8)} ${r.lo.toFixed(0).padStart(5)}–${r.hi.toFixed(0).padEnd(5)} Hz  (${noteName(Math.round(r.mlo))}–${noteName(Math.round(r.mhi))})${flag}`);
  }
}
const mel = debug.notes.filter((n) => n.role === 'lead').length;
console.log(`\n  ${debug.notes.length} logged music notes (${mel} melody), ${outTotal} out of key.\n`);
