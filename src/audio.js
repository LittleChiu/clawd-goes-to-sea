// ─────────────────────────────────────────────────────────────
//  audio.js — the fully procedural soundtrack of 《Clawd 去看海》
//
//  Pure JS: runs unchanged in Node and in the browser (no Node APIs,
//  no Web Audio, no dependencies). Deterministic: every random choice
//  comes from a seeded mulberry32 stream. All timing is read from
//  cues.js, so moving a cue there moves the sound with it.
//
//  §1  helpers — PRNG, pitch/scale maths, grid + local cues
//  §2  render context + music automation (pitch / cutoff / gain curves)
//  §3  synth core — voice(): PolyBLEP pulse, triangle, sine, FM bell,
//      noise; ADSR; vibrato, bends, pitch env; one-pole LP; TPT SVF
//  §4  drum kit
//  §5  SFX library
//  §6  ambience beds
//  §7  dialogue blips
//  §8  music — Clawd's theme + the six parts
//  §9  effects + mix + master (ping-pong delay, reverb, bus LP/gain,
//      DC blocker, look-ahead limiter, normalise)
//  §10 public API — renderSoundtrack(), encodeWav()
// ─────────────────────────────────────────────────────────────
import {
  PARTS, SHOTS, BEAT, DIALOG, AMBIENCE, MONTAGE_CUTS, DURATION, charTimes, SILENT_CHARS,
} from './cues.js';

// ════════════════════════ §1 helpers ════════════════════════
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ss = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Independent, named random streams: changing one sound never reshuffles another.
const rng = (label) => mulberry32(hashStr(String(label)));

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function nm(n) { // 'F#5' | 'Bb3' | midi number → midi number
  if (typeof n === 'number') return n;
  const r = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  if (!r) throw new Error('bad note ' + n);
  return 12 * (+r[3] + 1) + PCN[r[1]] + (r[2] === '#' ? 1 : r[2] === 'b' ? -1 : 0);
}
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
// scale degree d (0 = tonic, may be negative / > 6) → midi
function deg(tonic, scale, d) { const o = Math.floor(d / 7); return tonic + 12 * o + scale[d - 7 * o]; }

const part = (id) => PARTS.find((p) => p.id === id);
const shot = (id) => SHOTS.find((s) => s.id === id);
function grid(id) {
  const p = part(id), beat = 60 / p.bpm;
  return { p, beat, bar: 4 * beat, e8: beat / 2, s16: beat / 4, at: (bar, b = 0) => p.start + (bar * 4 + b) * beat };
}
// first grid point (every `unit` beats of part `id`) at or after time t
function nextGrid(id, t, unit = 1) {
  const g = grid(id), step = g.beat * unit;
  return g.p.start + Math.ceil((t - g.p.start) / step - 1e-9) * step;
}
function typingSpan(line) { // [first char, last char] times of a typewriter line
  const ct = charTimes(line);
  return ct.length ? [ct[0].t, ct[ct.length - 1].t] : [line.t, line.t];
}
// smooth 0→1→0 window used for ambience edges
function edge(t, t0, t1, fi, fo) { return ss((t - t0) / Math.max(fi, 1e-6)) * ss((t1 - t) / Math.max(fo, 1e-6)); }

// Local cues that cues.js does not define — all derived from cues.js values.
const LOCAL = {
  powerDown: 0.6,                                                // faceplant power-down length (s)
  stuckKey: { t: BEAT.faceplant + 0.4, dur: 1.2 },               // face resting on the keyboard
  smallSnore: BEAT.faceplant + 0.95,                             // Clawd's tiny snore before the wish
  flaps: [0.55, 0.42, 0.29, 0.16].map((d) => BEAT.gullLand - d), // wing flaps before the gull lands
  scuttle: BEAT.waveIn.map((t) => t + 0.15),                     // Clawd scuttles away from each wave
  get pelicanResume() { return nextGrid('pelican', BEAT.shades + 0.25, 1); }, // groove back after the shades
  get flourish() { return nextGrid('beach', BEAT.laugh + 0.1, 1); },          // music back after the laugh
};

// ═══════════════ §2 render context + automation ═══════════════
const CR = 32; // control-rate block (samples) for modulation / automation

function makeCtx(sr) {
  const N = Math.ceil(DURATION * sr), K = Math.ceil(N / CR) + 2;
  const f32 = (n) => new Float32Array(n);
  return {
    sr, N, K,
    musL: f32(N), musR: f32(N), // music bus
    dly: f32(N), rev: f32(N),   // mono sends: ping-pong delay, reverb (music only)
    fxL: f32(N), fxR: f32(N),   // SFX + ambience + dialogue bus
    pitch: f32(K).fill(1),      // music pitch multiplier (sags, power-down, record stop)
    cut: f32(K).fill(16000),    // music bus low-pass cutoff (Hz)
    gain: f32(K).fill(1),       // music bus gain (balance, cuts, ducking, fades)
    notes: [], part: '',
  };
}
// piecewise curve through [t, v] points (sorted); log = interpolate geometrically
function fillPts(ctx, arr, pts, log = false) {
  pts = pts.slice().sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let k = 0; k < ctx.K; k++) {
    const t = (k * CR) / ctx.sr;
    while (j < pts.length - 2 && t >= pts[j + 1][0]) j++;
    const [t0, v0] = pts[j], [t1, v1] = pts[Math.min(j + 1, pts.length - 1)];
    const u = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : t >= t1 ? 1 : 0;
    arr[k] = log ? v0 * Math.pow(v1 / v0, u) : v0 + (v1 - v0) * u;
  }
}
// multiply arr by fn(t) over [t0, t1)
function mulSpan(ctx, arr, t0, t1, fn) {
  const k0 = clamp(Math.floor((t0 * ctx.sr) / CR), 0, ctx.K), k1 = clamp(Math.ceil((t1 * ctx.sr) / CR), 0, ctx.K);
  for (let k = k0; k < k1; k++) arr[k] *= fn((k * CR) / ctx.sr);
}

// Per-part balance of the music bus and its base low-pass (warmth).
const PART_GAIN = { grind: 1, wish: 1, pelican: 0.77, ride: 1, beach: 1.1, sunset: 0.78 };
const PART_CUT = { grind: 3000, wish: 6500, pelican: 9000, ride: 15000, beach: 10000, sunset: 9000 };

function buildAutomation(ctx) {
  const g = grid('grind');
  const fp = BEAT.faceplant, pd = LOCAL.powerDown;
  const wish = part('wish'), pel = part('pelican');
  const resume = LOCAL.pelicanResume, pickup = resume - 2 * grid('pelican').s16;
  const back = LOCAL.flourish;

  // ── pitch (semitones): nod-off sag, faceplant power-down, record-scratch stop
  const semis = new Float32Array(ctx.K);
  fillPts(ctx, semis, [
    [0, 0],
    [BEAT.nodOff, 0], [BEAT.nodOff + 0.3, -0.5], [BEAT.jolt - 0.012, -2.3], [BEAT.jolt + 0.012, 0],
    [fp, 0], [fp + pd * 0.25, -1.5], [fp + pd * 0.5, -5], [fp + pd * 0.75, -12], [fp + pd, -30],
    [wish.start - 0.3, -30], [wish.start - 0.29, 0],
    [BEAT.skid, 0], [BEAT.skid + 0.08, -2], [BEAT.skid + 0.16, -8], [BEAT.skid + 0.26, -26],
    [pickup - 0.03, -26], [pickup - 0.02, 0],
  ]);
  for (let k = 0; k < ctx.K; k++) ctx.pitch[k] = Math.pow(2, semis[k] / 12);

  // ── cutoff (Hz, geometric): per-part warmth + the sag / power-down / S7 thinning / risers
  const base = [], cp = [];
  for (const p of PARTS) base.push([p.start + 0.001, PART_CUT[p.id], p], [p.end - 0.001, PART_CUT[p.id], p]);
  cp.push(
    [g.at(2) - 0.05, 3000], [g.at(2) + 0.05, 4200],            // dorm interior: a bit brighter
    [BEAT.nodOff, 4200], [BEAT.jolt - 0.012, 600], [BEAT.jolt + 0.012, 4800],
    [g.at(4) - 0.03, 4800], [g.at(4) + 0.03, 6500],            // terminal
    [g.at(5) - 0.03, 6500], [g.at(5) + 0.03, 8000],            // montage
    [fp, 8000], [fp + pd, 200], [wish.start - 0.01, 200],
    [BEAT.skid, 9000], [BEAT.skid + 0.26, 700], [pickup - 0.02, 700], [pickup, 9000],
    [shot('S7').start - 0.02, 9000], [shot('S7').start + 0.1, 2400], [shot('S8').start, 2000],
    [pel.end - 0.02, 16000],                                   // riser opens into the ride
    [BEAT.hill, 15000], [BEAT.crest, 16000],
    [shot('S13').start, 9000], [DURATION, 4500],
  );
  // a part's defaults yield to explicit points placed near them inside the same part
  for (const [t0, v, p] of base) if (!cp.some(([t]) => t >= p.start && t <= p.end && Math.abs(t - t0) < 0.05)) cp.push([t0, v]);
  fillPts(ctx, ctx.cut, cp.filter(([t]) => t >= 0 && t <= DURATION + 1), true);

  // ── gain: part balance × cuts/fades × dialogue ducking
  const pg = [];
  PARTS.forEach((p, i) => {
    const prev = i ? PARTS[i - 1].id : p.id;
    pg.push([p.start - 0.04, PART_GAIN[prev]], [p.start + 0.04, PART_GAIN[p.id]]);
  });
  pg.push([0, PART_GAIN[PARTS[0].id]], [DURATION + 1, PART_GAIN[PARTS[PARTS.length - 1].id]]);
  fillPts(ctx, ctx.gain, pg);

  const cuts = new Float32Array(ctx.K);
  fillPts(ctx, cuts, [
    [0, 0], [0.02, 1],
    [fp, 1], [fp + pd * 0.25, 0.8], [fp + pd * 0.5, 0.52], [fp + pd * 0.75, 0.22], [fp + pd, 0],
    [wish.start, 0], [wish.start + 0.9, 1],                               // dissolve in
    [BEAT.bubblePop, 1], [BEAT.bubblePop + 0.012, 0], [pel.start - 0.012, 0], [pel.start, 1],
    [BEAT.skid + 0.02, 1], [BEAT.skid + 0.14, 0.7], [BEAT.skid + 0.27, 0], [pickup - 0.012, 0], [pickup, 1],
    [BEAT.gulp, 1], [BEAT.gulp + 0.008, 0], [back - 0.012, 0], [back, 1],   // stops dead on the gulp
    [DURATION - 1.9, 1], [DURATION - 0.08, 0],                            // final fade
  ]);
  for (let k = 0; k < ctx.K; k++) ctx.gain[k] *= cuts[k];

  // crescendos: the montage treadmill and the downhill both build toward their payoff
  const m0 = g.at(5);
  mulSpan(ctx, ctx.gain, m0, fp, (t) => 0.84 + 0.16 * ss((t - m0) / (fp - m0)));
  mulSpan(ctx, ctx.gain, BEAT.hill, BEAT.crest, (t) => 0.97 + 0.13 * ((t - BEAT.hill) / (BEAT.crest - BEAT.hill)));
  mulSpan(ctx, ctx.gain, BEAT.crest, part('ride').end, () => 1.1); // the sea reveal is the loudest moment of the film

  // duck the music ~30 % while a line is typing (smooth 60 ms in / 150 ms out)
  for (const line of DIALOG) {
    if (!line.cps || line.who === 'caption') continue;
    const [a, b] = typingSpan(line);
    const t0 = a - 0.06, t1 = b + 0.12;
    mulSpan(ctx, ctx.gain, t0, t1 + 0.15, (t) => 1 - 0.3 * ss((t - t0) / 0.06) * ss((t1 + 0.15 - t) / 0.15));
  }
}

// ═══════════════════════ §3 synth core ═══════════════════════
const WAVE = { pulse: 0, tri: 1, sine: 2, fm: 3, noise: 4 };
function blep(t, dt) { // PolyBLEP residual
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function bendAt(b, t) { // piecewise-linear [[t, semis], …]
  if (t <= b[0][0]) return b[0][1];
  for (let i = 1; i < b.length; i++) {
    if (t < b[i][0]) { const [t0, v0] = b[i - 1], [t1, v1] = b[i]; return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
  }
  return b[b.length - 1][1];
}
function filtFreq(fl, tt, T) {
  if (fl.fn) return fl.fn(tt);
  if (Array.isArray(fl.f)) { const u = clamp(tt / (fl.time ?? T), 0, 1); return fl.f[0] * Math.pow(fl.f[1] / fl.f[0], u); }
  return fl.f;
}

/*  voice(ctx, o) — one enveloped note / sound event.
    t, dur (gate, s) · f (Hz) or m (midi) · wave: pulse|tri|sine|fm|noise · duty
    a (attack) d (decay τ) s (sustain) r (release) — a, r ≥ 2 ms, always
    g gain · pan (-1..1 or [from, to]) · bus 'mus'|'fx' · dly / rev: music sends
    vib [rate, semis, delay, fadeIn = .15, decayτ] · bend [[t, semis]…] · penv [semis, τ]
    trem [rate, depth] · fm [ratio, index, index τ] · lp Hz or [from, to, τ] (one-pole)
    filt { type: lp|bp|hp, f: Hz | [from, to], time, q, fn(tt) } (TPT state-variable)
    aFn(tt) amplitude curve · role (logged for key/range checks) · seed (noise)      */
function voice(ctx, o) {
  const sr = ctx.sr, N = ctx.N;
  const i0 = Math.round(o.t * sr);
  const dur = Math.max(0, o.dur ?? 0.1);
  const a = Math.max(0.002, o.a ?? 0.004), r = Math.max(0.002, o.r ?? 0.03);
  const nOn = Math.max(1, Math.round(dur * sr)), nRel = Math.max(1, Math.round(r * sr));
  const nA = Math.max(1, Math.round(a * sr)), total = nOn + nRel;
  if (i0 >= N || i0 + total <= 0) return;
  const mus = (o.bus ?? 'mus') === 'mus';
  const L = mus ? ctx.musL : ctx.fxL, R = mus ? ctx.musR : ctx.fxR;
  const usePc = o.pc ?? mus;
  const f0 = o.f ?? mtof(o.m);
  if (mus && o.role) ctx.notes.push({ part: ctx.part, role: o.role, t: o.t, dur, m: o.m ?? null, f: f0 });
  const wave = WAVE[o.wave ?? 'pulse'];
  const duty = o.duty ?? 0.5, dcOff = 2 * duty - 1;
  const g = o.g ?? 0.1, s = o.s ?? 1;
  const kDec = o.d ? Math.exp(-1 / (o.d * sr)) : 1;
  const pan0 = Array.isArray(o.pan) ? o.pan[0] : (o.pan ?? 0), pan1 = Array.isArray(o.pan) ? o.pan[1] : pan0;
  const dS = mus ? (o.dly ?? 0) * g : 0, rS = mus ? (o.rev ?? 0) * g : 0;
  const { vib, bend, penv, trem, fm, filt, aFn } = o;
  const lpO = o.lp;
  const rnd = wave === 4 ? mulberry32((Math.imul(i0 + 1, 2654435761) ^ hashStr(o.seed ?? 'n')) >>> 0) : null;
  const fType = filt ? (filt.type === 'lp' ? 0 : filt.type === 'bp' ? 1 : 2) : -1;

  let ph = 0, phm = 0, dec = 1, held = 0, y1 = 0, lpc = 1;
  let ic1 = 0, ic2 = 0, fa1 = 0, fa2 = 0, fa3 = 0, fk = 1;
  let dt = f0 / sr, gl = 0, gr = 0, tr = 1, idx = 0, amP = 1, amC = 1, cnt = 0;
  const jEnd = Math.min(total, N - i0);
  for (let j = 0; j < jEnd; j++) {
    if (cnt === 0) { // ── control rate
      cnt = CR;
      const tt = j / sr;
      let semi = 0;
      if (vib) {
        const vt = tt - (vib[2] ?? 0);
        if (vt > 0) {
          let dep = vib[1] * Math.min(1, vt / (vib[3] ?? 0.15));
          if (vib[4]) dep *= Math.exp(-vt / vib[4]);
          semi += dep * Math.sin(TAU * vib[0] * vt);
        }
      }
      if (bend) semi += bendAt(bend, tt);
      if (penv) semi += penv[0] * Math.exp(-tt / penv[1]);
      const k = ((i0 + j) / CR) | 0;
      const pcm = usePc && k >= 0 && k < ctx.K ? ctx.pitch[k] : 1;
      dt = Math.min(0.45, (f0 * (semi ? Math.pow(2, semi / 12) : 1) * pcm) / sr);
      const pan = pan0 === pan1 ? pan0 : pan0 + ((pan1 - pan0) * j) / total;
      const ang = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
      gl = Math.cos(ang) * g; gr = Math.sin(ang) * g;
      if (trem) tr = 1 - trem[1] * (0.5 + 0.5 * Math.sin(TAU * trem[0] * tt));
      if (fm) idx = fm[1] * Math.exp(-tt / fm[2]);
      if (lpO) {
        const fc = Array.isArray(lpO) ? lpO[1] + (lpO[0] - lpO[1]) * Math.exp(-tt / lpO[2]) : lpO;
        lpc = 1 - Math.exp((-TAU * Math.min(fc * pcm, sr * 0.45)) / sr);
      }
      if (filt) {
        const fc = clamp(filtFreq(filt, tt, dur + r) * pcm, 20, sr * 0.45);
        const gg = Math.tan((Math.PI * fc) / sr);
        fk = 1 / (filt.q ?? 0.707);
        fa1 = 1 / (1 + gg * (gg + fk)); fa2 = gg * fa1; fa3 = gg * fa2;
      }
      if (aFn) { amP = j ? amC : aFn(tt); amC = aFn(tt + CR / sr); }
    }
    cnt--;
    // envelope
    let e;
    if (j < nOn) {
      if (j < nA) e = j / nA; else { dec *= kDec; e = s + (1 - s) * dec; }
      held = e;
    } else e = held * (1 - (j - nOn) / nRel);
    // oscillator
    let x;
    if (wave === 0) {
      x = ph < duty ? 1 : -1;
      x += blep(ph, dt);
      let t2 = ph - duty; if (t2 < 0) t2 += 1;
      x -= blep(t2, dt) + dcOff;
    } else if (wave === 1) x = 1 - 4 * Math.abs(ph - 0.5);
    else if (wave === 2) x = Math.sin(TAU * ph);
    else if (wave === 3) { x = Math.sin(TAU * ph + idx * Math.sin(TAU * phm)); phm += dt * fm[0]; phm -= Math.floor(phm); }
    else x = rnd() * 2 - 1;
    ph += dt; if (ph >= 1) ph -= 1;
    if (fType >= 0) {
      const v3 = x - ic2, v1 = fa1 * ic1 + fa2 * v3, v2 = ic2 + fa2 * ic1 + fa3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      x = fType === 0 ? v2 : fType === 1 ? v1 * fk : x - fk * v1 - v2;
    }
    if (lpO) { y1 += lpc * (x - y1); x = y1; }
    let v = x * e * tr;
    if (aFn) v *= amP + ((amC - amP) * (CR - cnt - 1)) / CR;
    const i = i0 + j;
    if (i < 0) continue;
    L[i] += v * gl; R[i] += v * gr;
    if (dS) ctx.dly[i] += v * dS;
    if (rS) ctx.rev[i] += v * rS;
  }
}
const fx = (ctx, o) => voice(ctx, { bus: 'fx', ...o, g: (o.g ?? 0.1) * (ctx.fxScale ?? 1) });
// run f() with SFX levels scaled by k (nestable)
function lvl(ctx, k, f) { const p = ctx.fxScale ?? 1; ctx.fxScale = p * k; f(); ctx.fxScale = p; }

// ════════════════════════ §4 drum kit ════════════════════════
// (music bus: drums follow the music pitch curve, so power-downs drag them too)
function kick(ctx, t, g = 1, o = {}) {
  voice(ctx, { t, dur: 0.3, a: 0.002, d: o.d ?? 0.075, s: 0, r: 0.03, wave: 'sine', f: o.f ?? 48, penv: [o.pe ?? 26, 0.026], g: 0.62 * g });
  voice(ctx, { t, dur: 0.004, a: 0.002, r: 0.008, wave: 'noise', seed: 'kc', filt: { type: 'hp', f: 2500 }, g: 0.1 * g });
}
function snare(ctx, t, g = 1, o = {}) {
  voice(ctx, { t, dur: 0.3, a: 0.002, d: o.d ?? 0.07, s: 0, r: 0.03, wave: 'noise', seed: 'sn', filt: { type: 'bp', f: o.f ?? 3000, q: 0.6 }, lp: o.lp, g: 0.3 * g, pan: o.pan ?? 0.05, rev: o.rev ?? 0.12 });
  voice(ctx, { t, dur: 0.12, a: 0.002, d: 0.035, s: 0, r: 0.02, wave: 'tri', f: 185, penv: [6, 0.018], g: 0.28 * g });
}
function hat(ctx, t, g = 1, o = {}) {
  voice(ctx, { t, dur: o.open ? 0.3 : 0.1, a: 0.002, d: o.open ? 0.1 : 0.02, s: 0, r: 0.02, wave: 'noise', seed: 'ht', filt: { type: 'hp', f: o.f ?? 7500, q: 0.8 }, lp: o.lp, g: 0.13 * g, pan: o.pan ?? 0.25 });
}
function clap(ctx, t, g = 1, o = {}) {
  [[0, 0.55], [0.011, 0.7], [0.022, 0.85]].forEach(([d, k]) =>
    voice(ctx, { t: t + d, dur: 0.008, a: 0.002, d: 0.005, s: 0, r: 0.005, wave: 'noise', seed: 'cl' + d, filt: { type: 'bp', f: 1300, q: 1.2 }, g: 0.34 * g * k, pan: o.pan ?? -0.08 }));
  voice(ctx, { t: t + 0.03, dur: 0.25, a: 0.002, d: 0.07, s: 0, r: 0.03, wave: 'noise', seed: 'clt', filt: { type: 'bp', f: 1150, q: 0.9 }, g: 0.3 * g, pan: o.pan ?? -0.08, rev: 0.25 });
}
function crash(ctx, t, g = 1, o = {}) {
  const d = o.d ?? 0.8;
  voice(ctx, { t, dur: d * 3, a: 0.002, d, s: 0, r: 0.3, wave: 'noise', seed: 'cr1', filt: { type: 'hp', f: 4200, q: 0.7 }, g: 0.26 * g, pan: -0.35, rev: 0.2 });
  voice(ctx, { t, dur: d * 3, a: 0.002, d: d * 0.8, s: 0, r: 0.3, wave: 'noise', seed: 'cr2', filt: { type: 'bp', f: 6500, q: 1.3 }, g: 0.2 * g, pan: 0.4, rev: 0.2 });
  voice(ctx, { t, dur: d * 2, a: 0.002, d: d * 0.5, s: 0, r: 0.2, wave: 'fm', f: 587, fm: [2.76, 4, 0.3], g: 0.025 * g, pan: 0.1 });
}
function shaker(ctx, t, g = 1, o = {}) {
  voice(ctx, { t, dur: 0.07, a: 0.008, d: 0.028, s: 0, r: 0.02, wave: 'noise', seed: 'sh', filt: { type: 'bp', f: 7200, q: 1.1 }, g: 0.12 * g, pan: o.pan ?? -0.3 });
}
function tom(ctx, t, f, g = 1, pan = 0) {
  voice(ctx, { t, dur: 0.3, a: 0.002, d: 0.09, s: 0, r: 0.03, wave: 'sine', f, penv: [7, 0.03], g: 0.4 * g, pan });
  voice(ctx, { t, dur: 0.03, a: 0.002, d: 0.012, s: 0, r: 0.01, wave: 'noise', seed: 'tm', filt: { type: 'bp', f: 1500, q: 0.8 }, g: 0.1 * g, pan });
}
function rim(ctx, t, g = 1, pan = 0.2) { // woodblock-ish "tok"
  voice(ctx, { t, dur: 0.05, a: 0.002, d: 0.014, s: 0, r: 0.01, wave: 'tri', f: 1050, penv: [3, 0.01], g: 0.13 * g, pan });
  voice(ctx, { t, dur: 0.005, a: 0.002, r: 0.004, wave: 'noise', seed: 'rm', filt: { type: 'bp', f: 2600, q: 1.2 }, g: 0.08 * g, pan });
}
function riser(ctx, t0, t1, g = 1) { // noise sweep up into a downbeat
  voice(ctx, { t: t0, dur: t1 - t0, a: 0.05, r: 0.02, wave: 'noise', seed: 'rs' + t0, filt: { type: 'bp', f: [400, 7000], q: 1.1 }, aFn: (tt) => Math.pow(tt / (t1 - t0), 1.6), g: 0.2 * g, pan: [-0.3, 0.3], rev: 0.2 });
}

// ════════════════════════ §5 SFX library ════════════════════════
function sfxSwitch(ctx, t, m, pan) { // light switch: click + an in-key 'tink' + tiny clunk
  fx(ctx, { t, dur: 0.01, a: 0.002, d: 0.004, s: 0, r: 0.006, wave: 'noise', seed: 'sw', filt: { type: 'bp', f: 3800, q: 1.1 }, g: 0.32, pan });
  fx(ctx, { t: t + 0.001, dur: 0.14, a: 0.002, d: 0.04, s: 0, r: 0.03, wave: 'sine', m, g: 0.07, pan, lp: 5000 });
  fx(ctx, { t: t + 0.003, dur: 0.04, a: 0.002, d: 0.012, s: 0, r: 0.01, wave: 'tri', f: 170, penv: [7, 0.008], g: 0.12, pan });
}
function sfxKey(ctx, t, o = {}) { // one mechanical key: noise click + tiny tonal tick + body thock
  const g = o.g ?? 1, pan = o.pan ?? 0, lp = o.muffled ? 900 : undefined;
  fx(ctx, { t, dur: 0.006, a: 0.002, d: 0.003, s: 0, r: 0.006, wave: 'noise', seed: 'k', filt: { type: 'bp', f: o.hf ?? 3200, q: 0.8 }, lp, g: 0.3 * g, pan });
  fx(ctx, { t, dur: 0.01, a: 0.002, d: 0.004, s: 0, r: 0.004, wave: 'sine', f: o.tf ?? 2100, lp, g: 0.06 * g, pan });
  fx(ctx, { t: t + 0.0015, dur: 0.018, a: 0.002, d: 0.007, s: 0, r: 0.006, wave: 'tri', f: o.bf ?? 260, lp, g: 0.13 * g, pan });
}
function sfxSnore(ctx, t, o = {}) { // noisy rattling inhale + airy exhale (~1 s)
  const sm = !!o.small, g = o.g ?? 1, pan = o.pan ?? (sm ? -0.05 : 0.4);
  const inh = sm ? 0.42 : 0.58, exh = sm ? 0.36 : 0.45, fl = sm ? 38 : 27;
  fx(ctx, { t, dur: inh, a: inh * 0.6, r: 0.1, wave: 'noise', seed: 'sni', filt: { type: 'bp', f: sm ? [700, 1000] : [300, 520], q: 1.8 }, trem: [fl, 0.85], g: (sm ? 0.16 : 0.34) * g, pan });
  fx(ctx, { t, dur: inh, a: inh * 0.6, r: 0.1, wave: 'pulse', duty: 0.25, f: sm ? 150 : 70, lp: sm ? 900 : 480, trem: [fl, 0.9], g: (sm ? 0.05 : 0.13) * g, pan });
  const te = t + inh + 0.12;
  fx(ctx, { t: te, dur: exh, a: 0.08, d: exh * 0.5, s: 0.2, r: 0.12, wave: 'noise', seed: 'snx', filt: { type: 'lp', f: sm ? 1400 : 800, q: 0.7 }, g: (sm ? 0.1 : 0.2) * g, pan });
  if (sm) fx(ctx, { t: te + 0.03, dur: exh * 0.8, a: 0.05, r: 0.1, wave: 'sine', f: 1500, bend: [[0, 0], [exh, -4]], g: 0.02 * g, pan });
}
function sfxJolt(ctx, t) { // startled awake: quick 'boing' up + hit
  fx(ctx, { t, dur: 0.11, a: 0.002, d: 0.06, s: 0, r: 0.03, wave: 'tri', f: 330, bend: [[0, 0], [0.1, 19]], g: 0.2, pan: -0.1 });
  fx(ctx, { t, dur: 0.04, a: 0.002, d: 0.015, s: 0, r: 0.02, wave: 'noise', seed: 'jo', filt: { type: 'bp', f: 2500, q: 0.8 }, g: 0.18 });
}
function sfxDing(ctx, t) { // success: bright two-note bell A5 → E6
  fx(ctx, { t, dur: 0.8, a: 0.002, d: 0.28, s: 0, r: 0.2, wave: 'fm', m: 81, fm: [3, 1.1, 0.08], g: 0.13, pan: 0.1 });
  fx(ctx, { t: t + 0.09, dur: 1.1, a: 0.002, d: 0.4, s: 0, r: 0.25, wave: 'fm', m: 88, fm: [3, 1.1, 0.08], g: 0.17, pan: 0.1 });
}
function sfxError(ctx, t) { // error buzz: two beating low 'bzzt's
  for (let k = 0; k < 2; k++) {
    const tt = t + k * 0.16;
    fx(ctx, { t: tt, dur: 0.12, a: 0.004, r: 0.02, wave: 'pulse', duty: 0.5, f: 104, lp: 2200, g: 0.11, pan: 0.1 });
    fx(ctx, { t: tt, dur: 0.12, a: 0.004, r: 0.02, wave: 'pulse', duty: 0.25, f: 110.5, lp: 2200, g: 0.09, pan: 0.1 });
  }
}
function sfxAlarm(ctx, t) { // alarm blip: fast alternating beeps (E6 / B5)
  for (let k = 0; k < 5; k++) fx(ctx, { t: t + k * 0.075, dur: 0.055, a: 0.003, r: 0.01, wave: 'pulse', duty: 0.25, m: k % 2 ? 83 : 88, lp: 4500, g: 0.085, pan: 0.1 });
}
function sfxThink(ctx, t0, t1) { // tiny 'spinner' ticks while the agent thinks
  for (let t = t0, k = 0; t < t1 - 0.02; t += 0.1, k++) fx(ctx, { t, dur: 0.012, a: 0.002, r: 0.008, wave: 'sine', f: k % 2 ? 1600 : 2000, g: 0.028, pan: 0.15 });
}
function sfxCut(ctx, t, i) { // montage accent: pre-whoosh into a tick on the cut
  const big = i === 0, pre = big ? 0.22 : 0.08;
  fx(ctx, { t: t - pre, dur: pre, a: pre * 0.7, r: 0.04, wave: 'noise', seed: 'cut' + i, filt: { type: 'bp', f: big ? [600, 3500] : [1500, 5500], q: 1.2 }, g: big ? 0.22 : 0.14, pan: i % 2 ? [0.5, -0.5] : [-0.5, 0.5] });
  fx(ctx, { t, dur: 0.008, a: 0.002, d: 0.004, s: 0, r: 0.005, wave: 'noise', seed: 'ct', filt: { type: 'hp', f: 3000 }, g: 0.07 });
  fx(ctx, { t, dur: 0.05, a: 0.002, d: 0.015, s: 0, r: 0.01, wave: 'sine', f: 2637, g: 0.05 });
}
function sfxFaceplant(ctx, t) { // thud + keyboard mash + console power-down tone
  fx(ctx, { t, dur: 0.3, a: 0.002, d: 0.08, s: 0, r: 0.05, wave: 'sine', f: 52, penv: [15, 0.03], g: 0.55 });
  fx(ctx, { t, dur: 0.08, a: 0.002, d: 0.03, s: 0, r: 0.02, wave: 'noise', seed: 'fp', filt: { type: 'lp', f: 900 }, g: 0.32 });
  const R = rng('mash');
  for (let k = 0; k < 9; k++) sfxKey(ctx, t + R() * 0.05, { g: 0.6 + 0.4 * R(), pan: (R() - 0.5) * 0.6, hf: 2500 + R() * 1500 });
  fx(ctx, { t: t + 0.02, dur: LOCAL.powerDown, a: 0.01, r: 0.05, wave: 'pulse', duty: 0.25, f: 660, bend: [[0, 0], [0.15, -5], [0.35, -14], [LOCAL.powerDown, -36]], lp: 2500, aFn: (tt) => Math.max(0, 1 - tt / 0.65), g: 0.06 });
}
function sfxStuckKey(ctx, t0, dur) { // face on the keyboard: auto-repeat clicks
  for (let t = t0; t < t0 + dur; t += 1 / 28) {
    const g = 0.7 * (1 - (0.5 * (t - t0)) / dur) * edge(t, t0, t0 + dur, 0.05, 0.2);
    fx(ctx, { t, dur: 0.004, a: 0.002, d: 0.002, s: 0, r: 0.004, wave: 'noise', seed: 'st', filt: { type: 'bp', f: 3500, q: 1.5 }, g: 0.25 * g, pan: -0.05 });
    fx(ctx, { t, dur: 0.008, a: 0.002, r: 0.004, wave: 'sine', f: 2400, g: 0.03 * g, pan: -0.05 });
  }
}
function sfxFlap(ctx, t, i) {
  fx(ctx, { t, dur: 0.06, a: 0.014, d: 0.04, s: 0, r: 0.04, wave: 'noise', seed: 'flap' + i, filt: { type: 'bp', f: [500, 1300], q: 0.9 }, g: 0.26, pan: 0.5 - i * 0.07 });
}
function sfxPerch(ctx, t) { // little feet on the sill
  fx(ctx, { t, dur: 0.012, a: 0.002, d: 0.005, s: 0, r: 0.008, wave: 'noise', seed: 'pe', filt: { type: 'bp', f: 2200, q: 1.5 }, g: 0.22, pan: 0.3 });
  fx(ctx, { t, dur: 0.04, a: 0.002, d: 0.012, s: 0, r: 0.01, wave: 'tri', f: 420, g: 0.1, pan: 0.3 });
}
function sfxGull(ctx, t, o = {}) { // 'kyow' calls; distant ones are darker with echoes
  const g = o.g ?? 1, pan = o.pan ?? 0.35, n = o.n ?? 2, base = o.f ?? 1250, dist = !!o.dist, glp = o.lp ?? (dist ? 2600 : 5000);
  const taps = dist ? [[0, 1], [0.21, 0.32], [0.44, 0.13]] : [[0, 1]];
  for (const [ed, eg] of taps) {
    for (let k = 0; k < n; k++) {
      const tt = t + ed + k * 0.3, gg = g * eg * (k ? 0.8 : 1), pn = ed ? -pan * 0.6 : pan;
      fx(ctx, { t: tt, dur: 0.22, a: 0.015, r: 0.06, wave: 'pulse', duty: 0.25, f: base * (k ? 0.94 : 1), bend: [[0, -5], [0.04, 2], [0.12, 0], [0.24, -7]], vib: [11, 0.35, 0, 0.01], filt: { type: 'bp', f: 1900, q: 0.8 }, lp: glp, g: 0.12 * gg, pan: pn });
      fx(ctx, { t: tt, dur: 0.2, a: 0.02, r: 0.06, wave: 'noise', seed: 'gr' + k, filt: { type: 'bp', f: 2400, q: 2 }, lp: glp, g: 0.05 * gg, pan: pn });
    }
  }
}
function sfxBubble(ctx, t, i) { // thought-bubble pop-in blips: C6, E6, G6
  fx(ctx, { t, dur: 0.05, a: 0.003, d: 0.03, s: 0.3, r: 0.03, wave: 'sine', m: [84, 88, 91][i % 3], bend: [[0, -5], [0.03, 0]], g: 0.15, pan: 0.15 + 0.08 * i });
  fx(ctx, { t, dur: 0.008, a: 0.002, r: 0.005, wave: 'noise', seed: 'bb', filt: { type: 'bp', f: 3000, q: 1 }, g: 0.06, pan: 0.2 });
}
function sfxSparkle(ctx, t) { // twinkle run (C-major pentatonic, C7–A7) + echo
  const R = rng('sparkle'), ms = [105, 103, 100, 98, 96, 100, 103, 108];
  for (const [ed, eg] of [[0, 1], [0.26, 0.35]]) {
    ms.forEach((m, k) => fx(ctx, { t: t + ed + k * 0.05 + R() * 0.015, dur: 0.45, a: 0.002, d: 0.12, s: 0, r: 0.15, wave: 'fm', m, fm: [2, 0.6, 0.05], g: 0.045 * eg, pan: ed ? 0.4 - 0.1 * k : -0.4 + 0.1 * k }));
  }
}
function sfxPop(ctx, t) { // the dream bubble bursts
  fx(ctx, { t, dur: 0.07, a: 0.002, d: 0.03, s: 0, r: 0.03, wave: 'noise', seed: 'pop', filt: { type: 'bp', f: 1800, q: 0.7 }, g: 0.5 });
  fx(ctx, { t, dur: 0.08, a: 0.002, d: 0.035, s: 0, r: 0.02, wave: 'sine', f: 1100, bend: [[0, 0], [0.07, -22]], g: 0.32 });
  fx(ctx, { t, dur: 0.02, a: 0.002, d: 0.008, s: 0, r: 0.01, wave: 'noise', seed: 'pop2', filt: { type: 'hp', f: 5000 }, g: 0.25 });
}
function sfxBikeBell(ctx, t, o = {}) { // 'brr-ring ring': striker flutter on two strikes
  const g = o.g ?? 1, pan = o.pan ?? 0.2, dist = !!o.dist, lp = dist ? 2400 : undefined;
  const taps = dist ? [[0, 1, pan], [0.24, 0.3, -pan], [0.5, 0.12, pan]] : [[0, 1, pan]];
  for (const [ed, eg, pn] of taps) {
    [0, 0.17].forEach((rt, ri) => {
      for (let s = 0; s < 3; s++) {
        const tt = t + ed + rt + s * 0.028, gg = g * eg * (1 - s * 0.25) * (ri ? 0.85 : 1);
        fx(ctx, { t: tt, dur: 0.6, a: 0.002, d: 0.22, s: 0, r: 0.15, wave: 'sine', f: 2780, trem: [9, 0.2], lp, g: 0.085 * gg, pan: pn });
        fx(ctx, { t: tt, dur: 0.4, a: 0.002, d: 0.12, s: 0, r: 0.1, wave: 'sine', f: 4130, lp, g: 0.045 * gg, pan: pn });
        fx(ctx, { t: tt, dur: 0.006, a: 0.002, r: 0.004, wave: 'noise', seed: 'bl', filt: { type: 'hp', f: 4000 }, lp, g: 0.05 * gg, pan: pn });
      }
    });
  }
}
function sfxZoom(ctx, t) { // the pelican zooms past: doppler whoosh L → R
  const pk = 0.2, bell = (tt) => Math.exp(-Math.pow((tt - pk) / 0.12, 2));
  fx(ctx, { t: t - 0.12, dur: 0.55, a: 0.01, r: 0.08, wave: 'noise', seed: 'zm', filt: { type: 'bp', q: 1, fn: (tt) => 700 + 2000 * bell(tt) }, aFn: bell, g: 0.5, pan: [-0.9, 0.9] });
  fx(ctx, { t: t - 0.12, dur: 0.5, a: 0.05, r: 0.08, wave: 'tri', f: 170, bend: [[0, 3], [pk, 0], [0.5, -5]], aFn: bell, g: 0.12, pan: [-0.8, 0.8] });
}
function sfxSkid(ctx, t) { // tyre screech + record-scratch
  fx(ctx, { t, dur: 0.42, a: 0.015, r: 0.12, wave: 'noise', seed: 'sk', filt: { type: 'bp', q: 7, fn: (tt) => 2300 * (1 - 0.25 * tt) * (1 + 0.04 * Math.sin(TAU * 37 * tt)) }, g: 0.55, pan: 0.2 });
  fx(ctx, { t, dur: 0.42, a: 0.015, r: 0.12, wave: 'pulse', duty: 0.125, f: 2250, bend: [[0, 0], [0.42, -4]], vib: [31, 0.5, 0, 0.01], lp: 5000, g: 0.045, pan: 0.2 });
  fx(ctx, { t: t + 0.01, dur: 0.24, a: 0.004, r: 0.04, wave: 'noise', seed: 'scr', filt: { type: 'bp', q: 3, fn: (tt) => 350 + 1700 * Math.abs(Math.sin(TAU * 6.5 * tt)) * Math.max(0.2, 1 - tt / 0.3) }, g: 0.36, pan: -0.1 });
}
function sfxFreewheel(ctx, t0, t1) { // ratchet ticks while backing up, slowing to a stop
  for (let t = t0; t < t1;) {
    const u = (t - t0) / (t1 - t0);
    fx(ctx, { t, dur: 0.004, a: 0.002, d: 0.002, s: 0, r: 0.004, wave: 'noise', seed: 'fw', filt: { type: 'bp', f: 5200, q: 2 }, g: 0.22, pan: 0.2 });
    fx(ctx, { t, dur: 0.012, a: 0.002, d: 0.004, s: 0, r: 0.005, wave: 'sine', f: 3700, g: 0.05, pan: 0.2 });
    t += 0.045 + 0.035 * u * u;
  }
}
function sfxShing(ctx, t) { // sunglasses glint (A6 / E7 / A7 — F major)
  fx(ctx, { t, dur: 0.12, a: 0.03, r: 0.05, wave: 'noise', seed: 'shg', filt: { type: 'hp', f: [3000, 9000], q: 0.8 }, g: 0.14, pan: 0.25 });
  [[93, 0.08, 0.35], [100, 0.065, 0.3], [105, 0.045, 0.25]].forEach(([m, gg, dd]) =>
    fx(ctx, { t: t + 0.04, dur: 0.8, a: 0.002, d: dd, s: 0, r: 0.2, wave: 'fm', m, fm: [1.41, 0.8, 0.1], g: gg, pan: 0.25 }));
}
function sfxLid(ctx, t) { // plastic click + screen-off 'bwoop'
  fx(ctx, { t, dur: 0.008, a: 0.002, d: 0.004, s: 0, r: 0.006, wave: 'noise', seed: 'ld', filt: { type: 'bp', f: 2400, q: 1.2 }, g: 0.42 });
  fx(ctx, { t, dur: 0.03, a: 0.002, d: 0.01, s: 0, r: 0.01, wave: 'tri', f: 1350, g: 0.12 });
  fx(ctx, { t: t + 0.002, dur: 0.05, a: 0.002, d: 0.018, s: 0, r: 0.015, wave: 'sine', f: 150, penv: [5, 0.01], g: 0.3 });
  fx(ctx, { t: t + 0.03, dur: 0.2, a: 0.004, d: 0.12, s: 0.2, r: 0.05, wave: 'sine', f: 780, bend: [[0, 0], [0.2, -26]], g: 0.17 });
}
function sfxBoing(ctx, t) { // the leap: wobbly spring 'boing' + whoosh
  fx(ctx, { t, dur: 0.4, a: 0.004, d: 0.25, s: 0, r: 0.08, wave: 'tri', f: 200, bend: [[0, 0], [0.12, 14], [0.4, 19]], vib: [13, 1.4, 0, 0.005, 0.25], g: 0.32 });
  fx(ctx, { t: t - 0.05, dur: 0.32, a: 0.1, d: 0.1, s: 0, r: 0.08, wave: 'noise', seed: 'bo', filt: { type: 'bp', f: [700, 3200], q: 1 }, g: 0.16, pan: [-0.3, 0.3] });
}
function sfxLand(ctx, t) { // thump into the basket + wicker creak
  fx(ctx, { t, dur: 0.22, a: 0.002, d: 0.06, s: 0, r: 0.05, wave: 'sine', f: 50, penv: [16, 0.025], g: 0.48 });
  fx(ctx, { t, dur: 0.04, a: 0.002, d: 0.015, s: 0, r: 0.015, wave: 'noise', seed: 'la', filt: { type: 'lp', f: 1500 }, g: 0.22 });
  fx(ctx, { t: t + 0.04, dur: 0.32, a: 0.02, r: 0.06, wave: 'pulse', duty: 0.08, f: 55, bend: [[0, 0], [0.1, 5], [0.2, 2], [0.32, 7]], filt: { type: 'bp', f: 900, q: 5 }, g: 0.4, pan: 0.1 });
  const R = rng('wicker');
  for (let k = 0; k < 6; k++) fx(ctx, { t: t + 0.05 + R() * 0.3, dur: 0.005, a: 0.002, r: 0.004, wave: 'noise', seed: 'wk' + k, filt: { type: 'bp', f: 1500 + R() * 2000, q: 2 }, g: 0.14, pan: (R() - 0.5) * 0.4 });
}
function sfxWave(ctx, t, o = {}) { // one surf swell: rising roar, break, receding foam hiss
  const g = o.g ?? 1, pan = o.pan ?? 0, len = o.len ?? 4, big = !!o.big;
  const rise = big ? 0.85 : 1.3, fall = len - rise, top = big ? 3400 : 2100;
  const dk = o.duck || (() => 1), tf = t + rise * 0.85;
  fx(ctx, { t, dur: len, a: 0.02, r: 0.3, wave: 'noise', seed: 'wv' + t, filt: { type: 'lp', q: 0.7, fn: (tt) => (tt < rise ? 320 * Math.pow(top / 320, tt / rise) : Math.max(260, top * Math.pow(0.15, (tt - rise) / fall))) }, aFn: (tt) => (tt < rise ? ss(tt / rise) : Math.exp(-(tt - rise) / (fall * 0.38))) * dk(t + tt), g: (big ? 0.45 : 0.26) * g, pan });
  fx(ctx, { t: tf, dur: fall, a: 0.08, d: fall * 0.3, s: 0, r: 0.3, wave: 'noise', seed: 'foam' + t, filt: { type: 'hp', f: 2600, q: 0.5 }, aFn: (tt) => dk(tf + tt), g: (big ? 0.14 : 0.09) * g, pan: -pan * 0.5 });
}
function sfxSplash(ctx, t) {
  fx(ctx, { t, dur: 0.5, a: 0.004, d: 0.14, s: 0, r: 0.1, wave: 'noise', seed: 'spl', filt: { type: 'bp', f: [3200, 1200], q: 0.6 }, g: 0.5, pan: -0.15 });
  fx(ctx, { t, dur: 0.12, a: 0.002, d: 0.04, s: 0, r: 0.03, wave: 'noise', seed: 'spl2', filt: { type: 'lp', f: 700 }, g: 0.32, pan: -0.1 });
  const R = rng('drops');
  for (let k = 0; k < 7; k++) fx(ctx, { t: t + 0.06 + R() * 0.45, dur: 0.03, a: 0.002, d: 0.012, s: 0, r: 0.01, wave: 'sine', f: 1300 + R() * 1700, bend: [[0, -3], [0.025, 4]], g: 0.07, pan: (R() - 0.5) * 1.2 });
}
function sfxCrabs(ctx, t) { // a cluster of tiny crab clicks + 'pip' pops (D6 G6 B6)
  const R = rng('crabs');
  for (let k = 0; k < 14; k++) {
    const tt = t + R() * 0.45, pan = (R() - 0.5) * 1.4;
    fx(ctx, { t: tt, dur: 0.004, a: 0.002, r: 0.003, wave: 'noise', seed: 'cb' + k, filt: { type: 'bp', f: 4000 + R() * 2000, q: 2 }, g: 0.2, pan });
    fx(ctx, { t: tt, dur: 0.01, a: 0.002, d: 0.004, s: 0, r: 0.004, wave: 'tri', f: 2200 + R() * 1200, g: 0.06, pan });
  }
  [86, 91, 95].forEach((m, i) => fx(ctx, { t: t + 0.05 + i * 0.11, dur: 0.035, a: 0.003, d: 0.02, s: 0.2, r: 0.02, wave: 'pulse', duty: 0.5, m, bend: [[0, -4], [0.02, 0]], lp: 5000, g: 0.05, pan: -0.4 + i * 0.4 }));
}
function sfxScuttle(ctx, t, dur, dir = 1) { // sideways claw-steps
  let k = 0;
  for (let tt = t; tt < t + dur; tt += 1 / 18, k++) fx(ctx, { t: tt, dur: 0.004, a: 0.002, r: 0.003, wave: 'noise', seed: 'sc' + k, filt: { type: 'bp', f: k % 2 ? 3800 : 3100, q: 2.5 }, g: 0.12 * edge(tt, t, t + dur, 0.05, 0.15), pan: dir * (-0.4 + (0.8 * (tt - t)) / dur) });
}
function sfxBuzz(ctx, t) { // phone vibrating on the sand/towel: ~180 Hz rattle
  fx(ctx, { t, dur: 0.23, a: 0.01, r: 0.025, wave: 'pulse', duty: 0.5, f: 180, trem: [32, 0.55], lp: 1400, g: 0.17, pan: 0.2 });
  fx(ctx, { t, dur: 0.23, a: 0.01, r: 0.025, wave: 'noise', seed: 'bz', filt: { type: 'bp', f: 360, q: 1.5 }, trem: [32, 0.7], g: 0.17, pan: 0.2 });
}
function sfxNotify(ctx, t) { // the 'alert' line: two-tone notification ping E6 → A6 (+ echo)
  for (const [ed, eg] of [[0, 1], [0.19, 0.28]]) {
    [[88, 0, 0.09], [93, 0.1, 0.3]].forEach(([m, dt, d]) => {
      fx(ctx, { t: t + ed + dt, dur: d + 0.1, a: 0.003, d: d * 0.6, s: 0, r: 0.08, wave: 'sine', m, g: 0.17 * eg, pan: ed ? -0.1 : 0.25 });
      fx(ctx, { t: t + ed + dt, dur: d, a: 0.003, d: d * 0.4, s: 0, r: 0.05, wave: 'pulse', duty: 0.25, m, lp: 4000, g: 0.03 * eg, pan: ed ? -0.1 : 0.25 });
    });
  }
}
function sfxChomp(ctx, t) { // beak snap: two woody clacks + a low chomp
  [0, 0.04].forEach((dt, i) => {
    fx(ctx, { t: t + dt, dur: 0.012, a: 0.002, d: 0.006, s: 0, r: 0.006, wave: 'noise', seed: 'ch' + i, filt: { type: 'bp', f: 1800, q: 1.4 }, g: 0.48, pan: 0.1 });
    fx(ctx, { t: t + dt, dur: 0.05, a: 0.002, d: 0.015, s: 0, r: 0.01, wave: 'tri', f: i ? 620 : 780, g: 0.22, pan: 0.1 });
  });
  fx(ctx, { t: t + 0.04, dur: 0.08, a: 0.002, d: 0.03, s: 0, r: 0.02, wave: 'sine', f: 160, penv: [6, 0.015], g: 0.26 });
}
function sfxGulp(ctx, t) { // two pitch-dropping 'glug' bubbles
  [0, 0.2].forEach((dt, i) => {
    fx(ctx, { t: t + dt, dur: 0.12, a: 0.006, d: 0.08, s: 0.2, r: 0.04, wave: 'sine', f: i ? 360 : 440, bend: [[0, 0], [0.11, -11]], g: 0.38, pan: 0.1 });
    fx(ctx, { t: t + dt, dur: 0.1, a: 0.006, r: 0.04, wave: 'tri', f: i ? 180 : 220, bend: [[0, 0], [0.1, -9]], filt: { type: 'bp', f: 500, q: 2 }, g: 0.28, pan: 0.1 });
  });
}

// ════════════════════════ §6 ambience beds ════════════════════════
// Comedic dead air after the gulp: the surf ducks ~9 dB (60 ms down at BEAT.gulp,
// ~300 ms back up centred on BEAT.laugh). The glugs and blips are not affected.
const SURF_DUCK = Math.pow(10, -9 / 20);
function surfDuck(t) {
  const a = BEAT.gulp, b = BEAT.laugh;
  if (t <= a || t >= b + 0.15) return 1;
  const w = t < a + 0.06 ? ss((t - a) / 0.06) : t > b - 0.15 ? ss((b + 0.15 - t) / 0.3) : 1;
  return 1 - (1 - SURF_DUCK) * w;
}
function ambTyping(ctx, a) { // mechanical keyboard, 12–18 keys/s (slow: 4–6), muffled = far away
  const R = rng('typing' + a.start);
  const [lo, hi] = a.slow ? [4, 6] : [12, 18];
  let t = a.start + R() * 0.05;
  while (t < a.end - 0.02) {
    const space = R() < 0.07;
    const g = a.gain * (0.75 + 0.5 * R()) * (space ? 1.15 : 1) * (a.muffled ? 1.6 : 1);
    sfxKey(ctx, t, { g, pan: (a.muffled ? 0.3 : -0.05) + (R() - 0.5) * 0.3, muffled: a.muffled, hf: space ? 1800 : 2600 + R() * 1400, tf: 1800 + R() * 900, bf: space ? 150 : 220 + R() * 80 });
    t += (1 / (lo + (hi - lo) * R())) * (0.6 + 0.8 * R());
    if (R() < 0.04) t += 0.15 + 0.2 * R(); // tiny thinking pauses
  }
}
function ambCrickets(ctx, a) { // three crickets: short 3–4 pulse chirp groups
  [{ f: 4400, pan: -0.55, per: 0.62, g: 1 }, { f: 4950, pan: 0.5, per: 0.81, g: 0.8 }, { f: 4700, pan: 0.1, per: 1.13, g: 0.55 }].forEach((b, bi) => {
    const R = rng('cricket' + bi + a.start);
    for (let t = a.start + R() * 0.4; t < a.end - 0.2; t += b.per * (0.85 + 0.3 * R())) {
      const n = 3 + (R() < 0.5 ? 1 : 0), g = 0.055 * a.gain * b.g * edge(t, a.start - 1, a.end, 0.1, 0.7);
      for (let k = 0; k < n; k++) fx(ctx, { t: t + k * 0.028, dur: 0.011, a: 0.003, r: 0.008, wave: 'sine', f: b.f * (1 + (R() - 0.5) * 0.01), g, pan: b.pan });
    }
  });
}
function sfxTick(ctx, t, hi, g) { // clock: tick (high) / tock (low)
  const pan = 0.4;
  fx(ctx, { t, dur: 0.004, a: 0.002, d: 0.002, s: 0, r: 0.004, wave: 'noise', seed: 'tk', filt: { type: 'hp', f: 2500 }, g: 0.22 * g, pan });
  fx(ctx, { t, dur: 0.05, a: 0.002, d: 0.014, s: 0, r: 0.01, wave: 'sine', f: hi ? 2900 : 2300, g: 0.08 * g, pan });
  fx(ctx, { t, dur: 0.04, a: 0.002, d: 0.01, s: 0, r: 0.01, wave: 'tri', f: hi ? 1250 : 1000, filt: { type: 'bp', f: hi ? 1250 : 1000, q: 3 }, g: 0.14 * g, pan });
}
function ambClock(ctx, a) { let n = 0; for (let t = a.start + 0.5; t < a.end - 0.01; t += 1, n++) sfxTick(ctx, t, n % 2 === 0, a.gain); }
function ambBirds(ctx, a) { // distant soft chirps
  const R = rng('birds' + a.start);
  for (let t = a.start + 0.3 + R() * 0.5; t < a.end - 0.3; t += 0.7 + R() * 1.3) {
    const n = 1 + Math.floor(R() * 3), base = 3200 + R() * 1600, pan = (R() - 0.5) * 1.4;
    for (let k = 0; k < n; k++) {
      fx(ctx, { t: t + k * (0.09 + R() * 0.05), dur: 0.05 + R() * 0.04, a: 0.004, r: 0.02, wave: 'sine', f: base * (1 + (R() - 0.5) * 0.15), bend: [[0, -3], [0.03, 2 + R() * 3], [0.08, -1]], g: 0.07 * a.gain * edge(t, a.start, a.end, 0.5, 0.5), pan, lp: 5000 });
    }
  }
}
function hillBoost(t) { // wind rushes on the downhill, peaks at the crest, then settles
  if (t < BEAT.hill) return 0;
  if (t < BEAT.crest) return ss((t - BEAT.hill) / (BEAT.crest - BEAT.hill));
  return 0.35 + 0.65 * Math.exp(-(t - BEAT.crest) / 0.8);
}
function ambWind(ctx, a) {
  [-0.6, 0.6].forEach((pan, c) => {
    const R = rng('wind' + c), p1 = R() * TAU, p2 = R() * TAU;
    fx(ctx, { t: a.start, dur: a.end - a.start, a: 0.6, r: 0.8, wave: 'noise', seed: 'wind' + c,
      filt: { type: 'bp', q: 0.55, fn: (tt) => (520 + 260 * Math.sin(0.9 * tt + p1) + 200 * Math.sin(2.3 * tt + p2)) * (1 + 1.3 * hillBoost(a.start + tt)) },
      aFn: (tt) => (0.72 + 0.28 * Math.sin(1.3 * tt + p2)) * (1 + 1.1 * hillBoost(a.start + tt)),
      g: 0.22 * a.gain, pan });
  });
}
function sfxChainTick(ctx, t, g, pan) {
  fx(ctx, { t, dur: 0.004, a: 0.002, d: 0.002, s: 0, r: 0.004, wave: 'noise', seed: 'chn', filt: { type: 'bp', f: 5500, q: 2 }, g: 0.26 * g, pan });
  fx(ctx, { t, dur: 0.015, a: 0.002, d: 0.005, s: 0, r: 0.006, wave: 'sine', f: 3300, g: 0.05 * g, pan });
  fx(ctx, { t: t + 0.001, dur: 0.02, a: 0.002, d: 0.006, s: 0, r: 0.006, wave: 'tri', f: 640, g: 0.07 * g, pan });
}
function ambChain(ctx, a) { // ≈4 ticks/s pedalling; coasting downhill = lighter, faster ratchet
  const R = rng('chain');
  for (let t = a.start; t < a.end;) {
    const coast = t > BEAT.hill && t < BEAT.crest;
    sfxChainTick(ctx, t, a.gain * edge(t, a.start, a.end, 0.3, 0.3) * (coast ? 0.6 : 0.8 + 0.4 * R()), 0.1 + (R() - 0.5) * 0.2);
    t += coast ? 1 / 12 : 0.25;
  }
}
function ambWaves(ctx, a) { // sea bed + a surf swell every ~4 s, alternating sides
  const R = rng('waves'), T = a.end - a.start;
  [-0.5, 0.5].forEach((pan, c) => fx(ctx, { t: a.start, dur: T, a: 1.5, r: 0.3, wave: 'noise', seed: 'bed' + c, filt: { type: 'lp', f: 420, q: 0.6 }, aFn: (tt) => (0.8 + 0.2 * Math.sin((TAU * tt) / 7.3 + c * 2)) * surfDuck(a.start + tt), g: 0.15 * a.gain, pan }));
  for (let t = a.start + 0.3, k = 0; t < a.end - 1.5; t += 3.7 + R() * 0.7, k++) {
    sfxWave(ctx, t, { g: a.gain * (0.8 + 0.35 * R()) * Math.min(1, (t - a.start + 0.5) / 1.5), pan: k % 2 ? 0.35 : -0.35, len: Math.min(3.6 + R() * 0.8, a.end - t), duck: surfDuck });
  }
}
const AMB = { typing: ambTyping, crickets: ambCrickets, clock: ambClock, birds: ambBirds, wind: ambWind, chain: ambChain, waves: ambWaves };
function renderAmbience(ctx) { for (const a of AMBIENCE) if (AMB[a.type]) AMB[a.type](ctx, a); }

// ════════════════════════ §7 dialogue blips ════════════════════════
function blipClawd(ctx, t, f, g = 1) { // small, cute, high: 25 % pulse ~45 ms
  f = clamp(f, 780, 1320);
  fx(ctx, { t, dur: 0.03, a: 0.003, d: 0.03, s: 0.5, r: 0.015, wave: 'pulse', duty: 0.25, f, bend: [[0, 1], [0.03, -0.5]], lp: 6000, g: 0.14 * g, pan: -0.05 });
  fx(ctx, { t, dur: 0.028, a: 0.003, d: 0.02, s: 0.4, r: 0.012, wave: 'sine', f: f * 2, g: 0.025 * g, pan: -0.05 });
}
function blipPelican(ctx, t, f, g = 1) { // lower, goofy, round: triangle + a little pulse ~70 ms
  f = clamp(f, 220, 420);
  fx(ctx, { t, dur: 0.05, a: 0.004, d: 0.05, s: 0.6, r: 0.02, wave: 'tri', f, bend: [[0, 2], [0.05, -1.5]], g: 0.34 * g, pan: 0.12 });
  fx(ctx, { t, dur: 0.05, a: 0.004, d: 0.04, s: 0.5, r: 0.02, wave: 'pulse', duty: 0.25, f, bend: [[0, 2], [0.05, -1.5]], lp: 1800, g: 0.08 * g, pan: 0.12 });
}
// per-line intonation: base offset, slope per blip (semitones), level
const LINE_STYLE = { wish: { semi: -1, slope: -0.3, g: 0.9 }, ask: { slope: 0.6, g: 1.1 }, hopon: { semi: 2, g: 1.2 }, hold: { slope: 1, g: 1.4 }, wah: { slope: 1.2, g: 2.4 }, sea: { semi: 3, g: 3.4 }, gulp: { semi: -4, g: 1.1 } };
function renderBlips(ctx) {
  for (const line of DIALOG) {
    if (!line.cps || line.who === 'phone' || line.who === 'caption') continue;
    const st = LINE_STYLE[line.id] || {}, R = rng('blip:' + line.id);
    const clawd = line.who === 'clawd', base = clawd ? 1050 : 300;
    let n = 0;
    for (const { t, ch } of charTimes(line)) {
      if (SILENT_CHARS.includes(ch)) continue;
      const semi = (st.semi ?? 0) + (st.slope ?? 0) * n + (R() - 0.5) * 3;
      (clawd ? blipClawd : blipPelican)(ctx, t, base * Math.pow(2, semi / 12), st.g ?? 1);
      n++;
    }
  }
}
function sfxLaugh(ctx, t) { // Clawd giggles: bouncy ascending trill (G5 B5 A5 C6 B5 D6 E6)
  [79, 83, 81, 84, 83, 86, 88].forEach((m, i) => blipClawd(ctx, t + i * 0.068, mtof(m), i === 6 ? 1.1 : 0.95));
}

// ─── every BEAT → its SFX ───
// Per-cue SFX level (linear), tuned so each cue reads over the music it sits in.
const SFX_LEVEL = {
  lightsOff: 1.7, snores: 1.6, jolt: 1.4, termPrompt: 3, termThinking: 1.2, termFixed: 1, termNewBugs: 1, termIssues: 1.7,
  montageCut: 4.5, faceplant: 1, stuckKey: 1, smallSnore: 1, flaps: 1, gullLand: 1, gullCry: 0.9, bubble: 1, sparkle: 1.9,
  bubblePop: 1, bellDistant: 1.3, zoomPast: 1.3, skid: 1.3, freewheel: 1, shades: 1.3, bell1: 1.9, lidClose: 1,
  jump: 1.45, land: 1.25, bell2: 2.8, gulls: 4.2, waveIn: 1.25, scuttle: 1, splash: 1.25, crabsPop: 1.7,
  buzz: 1, alert: 1, snap: 1, gulp: 1, laugh: 1,
};
function renderSfx(ctx) {
  const L = (k, f) => lvl(ctx, SFX_LEVEL[k] ?? 1, f);
  // S1 — light switches on the 8th grid; their 'tinks' fall down A minor as the dorm sleeps
  const LIGHT = [88, 86, 84, 83, 81, 79, 77, 76];
  L('lightsOff', () => BEAT.lightsOff.forEach((t, i, arr) => sfxSwitch(ctx, t, LIGHT[i % LIGHT.length], -0.6 + (1.2 * i) / Math.max(1, arr.length - 1))));
  // S2
  L('snores', () => BEAT.snores.forEach((t) => sfxSnore(ctx, t)));
  L('jolt', () => sfxJolt(ctx, BEAT.jolt));
  // S3 — terminal gag
  L('termPrompt', () => {
    const R = rng('prompt'), nKeys = Math.max(3, Math.floor((BEAT.termThinking - BEAT.termPrompt) / 0.075));
    for (let k = 0; k < nKeys; k++) sfxKey(ctx, BEAT.termPrompt + k * 0.075 + R() * 0.01, { g: 0.85, pan: 0.05, hf: 2800 + R() * 1200 });
  });
  L('termThinking', () => sfxThink(ctx, BEAT.termThinking, BEAT.termFixed));
  L('termFixed', () => sfxDing(ctx, BEAT.termFixed));
  L('termNewBugs', () => sfxError(ctx, BEAT.termNewBugs));
  L('termIssues', () => sfxAlarm(ctx, BEAT.termIssues));
  // montage + faceplant
  L('montageCut', () => MONTAGE_CUTS.forEach((t, i) => sfxCut(ctx, t, i)));
  L('faceplant', () => sfxFaceplant(ctx, BEAT.faceplant));
  L('stuckKey', () => sfxStuckKey(ctx, LOCAL.stuckKey.t, LOCAL.stuckKey.dur));
  L('smallSnore', () => sfxSnore(ctx, LOCAL.smallSnore, { small: true, g: 0.8 }));
  // S5 — golden afternoon
  L('flaps', () => LOCAL.flaps.forEach((t, i) => sfxFlap(ctx, t, i)));
  L('gullLand', () => sfxPerch(ctx, BEAT.gullLand));
  L('gullCry', () => BEAT.gullCry.forEach((t, i) => sfxGull(ctx, t, { n: 2, pan: 0.4, g: i ? 0.8 : 1, f: i ? 1180 : 1250 })));
  L('bubble', () => BEAT.bubble.forEach((t, i) => sfxBubble(ctx, t, i)));
  L('sparkle', () => sfxSparkle(ctx, BEAT.sparkle));
  L('bubblePop', () => sfxPop(ctx, BEAT.bubblePop));
  L('bellDistant', () => sfxBikeBell(ctx, BEAT.bellDistant, { dist: true, g: 0.45, pan: -0.5 }));
  // S6 — the pelican arrives
  L('zoomPast', () => sfxZoom(ctx, BEAT.zoomPast));
  L('skid', () => sfxSkid(ctx, BEAT.skid));
  L('freewheel', () => sfxFreewheel(ctx, BEAT.reverse, BEAT.stop));
  L('shades', () => sfxShing(ctx, BEAT.shades));
  L('bell1', () => sfxBikeBell(ctx, BEAT.bell1, { g: 0.9, pan: 0.25 }));
  // S7 / S8
  L('lidClose', () => sfxLid(ctx, BEAT.lidClose));
  L('jump', () => sfxBoing(ctx, BEAT.jump));
  L('land', () => sfxLand(ctx, BEAT.land));
  L('bell2', () => sfxBikeBell(ctx, BEAT.bell2, { g: 1, pan: 0.1 }));
  // S9 — gulls over the newly revealed sea
  L('gulls', () => BEAT.gulls.forEach((t, i) => sfxGull(ctx, t, { dist: true, lp: 4200, n: i ? 2 : 3, pan: i ? -0.5 : 0.55, g: 0.85, f: i ? 1320 : 1200 })));
  // S10 — beach
  L('waveIn', () => BEAT.waveIn.forEach((t, i) => sfxWave(ctx, t - 0.75, { big: true, pan: i % 2 ? 0.3 : -0.3, len: 2.8 })));
  L('scuttle', () => LOCAL.scuttle.forEach((t, i) => sfxScuttle(ctx, t, 0.55, i % 2 ? -1 : 1)));
  L('splash', () => sfxSplash(ctx, BEAT.splash));
  L('crabsPop', () => sfxCrabs(ctx, BEAT.crabsPop));
  // S11 — phone gag
  L('buzz', () => BEAT.buzz.forEach((t) => sfxBuzz(ctx, t)));
  L('alert', () => { for (const l of DIALOG) if (l.who === 'phone') sfxNotify(ctx, l.t); });
  L('snap', () => sfxChomp(ctx, BEAT.snap));
  L('gulp', () => sfxGulp(ctx, BEAT.gulp));
  L('laugh', () => sfxLaugh(ctx, BEAT.laugh));
}

// ════════════════════════ §8 music ════════════════════════
// ── instruments (music bus). `role` feeds the key / range checks.
function lead(ctx, t, m, len, o = {}) {
  voice(ctx, { role: o.role ?? 'lead', t, m, dur: len * (o.gate ?? 0.9), wave: 'pulse', duty: o.duty ?? 0.25, a: o.a ?? 0.006, d: o.d ?? 0.3, s: o.s ?? 0.75, r: o.r ?? 0.07, vib: o.vib ?? [5.5, 0.14, 0.14], lp: o.lp ?? 5500, g: o.g ?? 0.1, pan: o.pan ?? 0, dly: o.dly ?? 0.3, rev: o.rev ?? 0.1 });
}
function bass(ctx, t, m, len, o = {}) {
  voice(ctx, { role: 'bass', t, m, dur: len * (o.gate ?? 0.85), wave: 'tri', a: 0.004, d: o.d ?? 0.35, s: o.s ?? 0.55, r: o.r ?? 0.03, lp: o.lp ?? 2500, g: o.g ?? 0.26 });
}
function arp(ctx, t, m, len, o = {}) {
  voice(ctx, { role: o.role ?? 'arp', t, m, dur: len * (o.gate ?? 0.7), wave: 'pulse', duty: o.duty ?? 0.125, a: 0.003, d: o.d ?? 0.12, s: o.s ?? 0.25, r: o.r ?? 0.05, lp: o.lp ?? 3800, g: o.g ?? 0.045, pan: o.pan ?? 0, dly: o.dly ?? 0.3, rev: o.rev ?? 0.1 });
}
function bell(ctx, t, m, o = {}) { // FM: ratio 1 ≈ harp, ratio 3 ≈ glockenspiel
  voice(ctx, { role: o.role ?? 'bell', t, m, dur: o.dur ?? 1.2, wave: 'fm', fm: o.fm ?? [3, 1.4, 0.15], a: o.a ?? 0.003, d: o.d ?? 0.45, s: 0, r: o.r ?? 0.2, g: o.g ?? 0.06, pan: o.pan ?? 0, dly: o.dly ?? 0.35, rev: o.rev ?? 0.4, lp: o.lp });
}
function pad(ctx, t, notes, len, o = {}) { // two detuned soft pulses per note, slow attack
  notes.forEach((m, i) => [-0.07, 0.07].forEach((det) =>
    voice(ctx, { role: 'pad', t, m, f: mtof(m + det), dur: len, wave: 'pulse', duty: 0.5, a: o.a ?? 0.5, r: o.r ?? 0.8, lp: o.lp ?? 1100, g: o.g ?? 0.015, pan: det < 0 ? -0.45 : 0.45, rev: o.rev ?? 0.3, vib: [0.35 + 0.1 * i, 0.04, 0, 0.5] })));
}
function pluck(ctx, t, m, o = {}) { // ukulele-ish: bright attack, fast decay, closing low-pass
  voice(ctx, { role: o.role ?? 'uke', t, m, dur: o.dur ?? 0.3, wave: 'pulse', duty: o.duty ?? 0.35, a: 0.002, d: o.d ?? 0.09, s: 0, r: 0.04, lp: [o.bright ?? 5000, 700, 0.07], bend: [[0, 0.25], [0.02, 0]], g: o.g ?? 0.06, pan: o.pan ?? 0, dly: o.dly ?? 0.15, rev: o.rev ?? 0.08 });
}
function strum(ctx, t, notes, o = {}) {
  const ns = o.up ? [...notes].reverse() : notes, sp = o.spread ?? 0.012;
  ns.forEach((m, i) => pluck(ctx, t + i * sp, m, { ...o, pan: (o.pan ?? 0) + (i - (ns.length - 1) / 2) * 0.12 }));
}
function slap(ctx, t, m, len, o = {}) { // slap-ish bass: pitch-enveloped pulse + triangle body
  const g = o.g ?? 0.2;
  voice(ctx, { role: 'bass', t, m, dur: len * 0.8, wave: 'pulse', duty: 0.25, a: 0.002, d: 0.1, s: 0.35, r: 0.03, penv: [7, 0.012], lp: [3200, 500, 0.08], g });
  voice(ctx, { t, m, dur: len * 0.8, wave: 'tri', a: 0.002, d: 0.2, s: 0.5, r: 0.03, g: g * 0.9 });
}
function stab(ctx, t, notes, len, o = {}) {
  notes.forEach((m, i) => voice(ctx, { role: 'stab', t, m, dur: len, wave: 'pulse', duty: 0.125, a: 0.003, d: 0.06, s: 0.3, r: 0.04, lp: o.lp ?? 4200, g: o.g ?? 0.03, pan: i % 2 ? 0.3 : -0.3, dly: o.dly ?? 0.15 }));
}

// ── Clawd's theme: a 2-bar motif (M1 M2) and its answering phrase (A1 A2).
//    [scale degree, length in 8ths]. In D major:
//    M1  D E F#— A F#  |  M2  E D B A——  |  A1  D E F#— A B  |  A2  A F# E D——
export const THEME = {
  M1: [[0, 1], [1, 1], [2, 3], [4, 1], [2, 2]],
  M2: [[1, 1], [0, 1], [-2, 2], [-3, 4]],
  A1: [[0, 1], [1, 1], [2, 3], [4, 1], [5, 2]],
  A2: [[4, 1], [2, 1], [1, 2], [0, 4]],
};
function phrase(t, unit, tonic, scale, ph, fn) { // plays a phrase → end time
  for (const [d, n] of ph) { if (d !== null) fn(t, deg(tonic, scale, d), n * unit); t += n * unit; }
  return t;
}
const shift = (ph, k) => ph.map(([d, n]) => [d === null ? null : d + k, n]);

// ── grind · 96 BPM · A minor · 8 bars
function musicGrind(ctx) {
  ctx.part = 'grind';
  const G = grid('grind'), { at, e8, s16, beat } = G;
  const stopAt = BEAT.faceplant + LOCAL.powerDown, ok = (t) => t < stopAt - 0.01;
  const TON = nm('A4');
  const AM9 = ['A3', 'C4', 'E4', 'G4', 'B4'].map(nm), FM9 = ['F3', 'A3', 'C4', 'E4', 'G4'].map(nm);
  const UPDN = [0, 1, 2, 3, 4, 3, 2, 1];
  // bars 1–4: gentle night arpeggio Am9 → Fmaj9, soft triangle bass
  for (let b = 0; b < 4; b++) {
    const ch = b % 2 ? FM9 : AM9;
    for (let k = 0; k < 8; k++) arp(ctx, at(b, k / 2), ch[UPDN[k]], e8, { duty: 0.25, g: b < 2 ? 0.042 : 0.032, pan: k % 2 ? 0.3 : -0.3, lp: 2600, d: 0.2, s: 0.2, gate: 0.9, dly: 0.35, rev: 0.18 });
    if (b < 2) bass(ctx, at(b), nm(b ? 'F2' : 'A2'), G.bar, { g: 0.13, d: 0.9, s: 0.5, gate: 0.98 });
  }
  // bars 3–4: lo-fi drums (swung hats) + walking bass
  for (let b = 2; b < 4; b++) {
    const [r, f5, top] = b === 2 ? ['A2', 'E2', 'G2'] : ['F2', 'C3', 'E2'];
    bass(ctx, at(b, 0), nm(r), 1.5 * beat, { g: 0.18 });
    bass(ctx, at(b, 1.5), nm(r), 0.5 * beat, { g: 0.15 });
    bass(ctx, at(b, 2.5), nm(f5), 0.5 * beat, { g: 0.17 });
    bass(ctx, at(b, 3), nm(top), beat, { g: 0.17 });
    kick(ctx, at(b, 0), 0.55); kick(ctx, at(b, 2.5), 0.45);
    snare(ctx, at(b, 1), 0.45, { lp: 5000 }); snare(ctx, at(b, 3), 0.45, { lp: 5000 });
    for (let k = 0; k < 8; k++) hat(ctx, at(b, k / 2) + (k % 2 ? 0.045 : 0), k % 2 ? 0.45 : 0.7, { lp: 9000 });
  }
  // the minor theme, half-remembered: M1, then M2 sagging into the nod-off
  const lo = { duty: 0.25, g: 0.085, lp: 3000, vib: [5, 0.18, 0.15], dly: 0.35, rev: 0.2, pan: -0.1, gate: 0.95 };
  phrase(at(2), e8, TON, MINOR, THEME.M1, (t, m, len) => lead(ctx, t, m, len, lo));
  phrase(at(3), e8, TON, MINOR, THEME.M2, (t, m, len) => lead(ctx, t, m, len, lo));
  snare(ctx, BEAT.jolt, 0.9); crash(ctx, BEAT.jolt, 0.35, { d: 0.25 }); // jolt: accent, music snaps back
  // bar 5: terminal — tense 16th 'compile loop' over D → E
  const OST = ['E5', 'A5', 'C6', 'A5'].map(nm);
  for (let k = 0; k < 16; k++) arp(ctx, at(4, k / 4), OST[k % 4], s16, { g: 0.04 + 0.025 * (k / 15), lp: 5000, d: 0.06, s: 0.3, gate: 0.8, pan: k % 2 ? 0.25 : -0.25, dly: 0.12, rev: 0.05 });
  for (let k = 0; k < 8; k++) bass(ctx, at(4, k / 2), nm(k < 4 ? 'D2' : 'E2'), e8, { g: 0.2, gate: 0.6 });
  for (let q = 0; q < 4; q++) { kick(ctx, at(4, q), 0.45); if (q % 2) snare(ctx, at(4, q), 0.35); }
  for (let k = 0; k < 16; k++) { const t = at(4, k / 4); if (t >= BEAT.termThinking - 0.01) hat(ctx, t, k % 2 ? 0.35 : 0.55); }
  // bars 6–8: montage treadmill — four-on-the-floor, octave-pumping bass, busier hats
  const MCH = [['A2', ['A3', 'C4', 'E4']], ['A2', ['A3', 'C4', 'E4']], ['F2', ['F3', 'A3', 'C4']], ['G2', ['G3', 'B3', 'D4']], ['A2', ['A3', 'C4', 'E4']], ['A2', ['A3', 'C4', 'E4']]];
  for (let h = 0; h < 6; h++) {
    const b = 5 + (h >> 1), b0 = (h & 1) * 2, [root, tones] = MCH[h];
    for (let k = 0; k < 4; k++) { const t = at(b, b0 + k / 2); if (ok(t)) bass(ctx, t, nm(root) + (k % 2 ? 12 : 0), e8, { gate: 0.7, g: 0.21 }); }
    for (let k = 0; k < 8; k++) { const t = at(b, b0 + k / 4); if (ok(t)) arp(ctx, t, nm(tones[k % 3]) + 12, s16, { g: 0.028, lp: 5500, pan: k % 2 ? 0.35 : -0.35, dly: 0.2 }); }
  }
  for (let b = 5; b < 8; b++) {
    for (let q = 0; q < 4; q++) { const t = at(b, q); if (!ok(t)) continue; kick(ctx, t, 0.68); if (q % 2) snare(ctx, t, 0.6); }
    const sub = b === 5 ? 2 : 4; // 8ths → 16ths
    for (let k = 0; k < 4 * sub; k++) { const t = at(b, k / sub); if (ok(t)) hat(ctx, t, k % sub === 0 ? 0.8 : 0.5, { open: b === 7 && k % sub === sub / 2 }); }
  }
  crash(ctx, at(5), 0.5, { d: 0.5 });
  // lead: M1, M1 a third higher, then the answer's cadence — dragged down by the power-down
  const lm = { duty: 0.25, g: 0.09, lp: 4500, vib: [5.5, 0.12, 0.2], dly: 0.3, rev: 0.12, gate: 0.8, pan: -0.1 };
  const play = (t, m, len) => { if (ok(t)) lead(ctx, t, m, len, lm); };
  phrase(at(5), e8, TON, MINOR, THEME.M1, play);
  phrase(at(6), e8, TON, MINOR, shift(THEME.M1, 2), play);
  phrase(at(7), e8, TON, MINOR, THEME.A2, play);
}

// ── wish · ~70 BPM feel · C major · ambient
function musicWish(ctx) {
  ctx.part = 'wish';
  const P = part('wish'), beat = 60 / P.bpm;
  const t0 = BEAT.bubbleOpen, tEnd = BEAT.bubblePop;
  // golden, very quiet pad before the dream
  pad(ctx, P.start + 0.4, ['C3', 'G3', 'E4', 'B4'].map(nm), BEAT.clawdLooks - P.start - 0.1, { g: 0.011, a: 1.2, r: 1.0, lp: 900 });
  pad(ctx, BEAT.clawdLooks, ['F3', 'C4', 'E4', 'A4'].map(nm), t0 - BEAT.clawdLooks + 0.3, { g: 0.013, a: 0.8, r: 0.6, lp: 1000 });
  // the dream opens: harp glissando, then shimmering arpeggios, one chord per beat
  ['C5', 'E5', 'G5', 'B5', 'C6', 'E6', 'G6', 'B6'].map(nm).forEach((m, k) =>
    bell(ctx, t0 + k * 0.03, m, { role: 'harp', fm: [1, 1.2, 0.1], d: 0.4, dur: 0.9, g: 0.03, pan: -0.5 + k * 0.14, rev: 0.6, dly: 0.2 }));
  const DREAM = [['C3', ['C5', 'E5', 'G5', 'B5', 'D6', 'E6']], ['A2', ['A4', 'C5', 'E5', 'G5', 'B5', 'E6']], ['F2', ['F4', 'A4', 'C5', 'E5', 'G5', 'C6']], ['G2', ['G4', 'B4', 'D5', 'E5', 'G5', 'B5']]];
  for (let t = t0, c = 0; t < tEnd - 0.05; t += beat, c++) {
    const [root, tones] = DREAM[c % 4];
    bass(ctx, t, nm(root), beat, { g: 0.12, d: 0.8, s: 0.4, lp: 900, gate: 1 });
    tones.forEach((n, k) => { const tt = t + (k * beat) / 6; if (tt < tEnd - 0.02) bell(ctx, tt, nm(n), { role: 'harp', fm: [1, 1.2, 0.12], d: 0.35, dur: 0.9, g: 0.036, pan: k % 2 ? 0.45 : -0.45, dly: 0.3, rev: 0.5 }); });
  }
  // the dream sings the motif on a glockenspiel
  phrase(t0, beat / 2, nm('C6'), MAJOR, THEME.M1, (t, m, len) => { if (t < tEnd - 0.05) bell(ctx, t, m, { role: 'lead', fm: [3, 1.3, 0.2], d: 0.6, dur: len + 0.6, g: 0.05, pan: 0.1, dly: 0.45, rev: 0.45 }); });
  // soft surf-like swell inside the dream (music bus, so it pops with the bubble)
  voice(ctx, { t: t0, dur: tEnd - t0, a: 1.2, r: 0.02, wave: 'noise', seed: 'dreamsurf', filt: { type: 'lp', q: 0.7, fn: (tt) => 400 + 900 * (0.5 - 0.5 * Math.cos((TAU * tt) / 3.2)) }, aFn: (tt) => 0.6 + 0.4 * Math.sin((TAU * tt) / 3.2 - 1.2), g: 0.05, rev: 0.2 });
}

// ── pelican · 120 BPM · F major · 3 bars + a 2-beat drum pickup
function musicPelican(ctx) {
  ctx.part = 'pelican';
  const G = grid('pelican'), { at, s16, beat, bar } = G, P = G.p;
  const resume = LOCAL.pelicanResume, s7 = shot('S7'), s8 = shot('S8');
  const fillStart = P.end - 2 * beat;
  const F6 = ['F4', 'A4', 'C5', 'D5'].map(nm), BB = ['Bb3', 'D4', 'F4', 'G4'].map(nm), C7 = ['Bb3', 'C4', 'E4', 'G4'].map(nm);
  // one-bar funk loop in 16ths: F | Bb C
  const BASS = [[0, 'F2', 2], [3, 'F3', 1], [4, 'F2', 1], [6, 'A2', 1], [7, 'C3', 1], [8, 'Bb2', 2], [10, 'Bb2', 1], [11, 'D3', 1], [12, 'C3', 2], [14, 'E3', 1], [15, 'C3', 1]];
  const STABS = [[2, F6], [7, F6], [10, BB], [13, C7], [15, C7]];
  const nb = Math.ceil((P.end - P.start) / bar - 1e-6);
  const groove = (w0, w1) => { // plays the loop wherever its steps fall inside [w0, w1)
    for (let b = 0; b < nb; b++) {
      const T = (s) => at(b, s / 4), inW = (s) => T(s) >= w0 - 1e-6 && T(s) < w1 - 1e-6;
      for (const [s, n, l] of BASS) if (inW(s)) slap(ctx, T(s), nm(n), l * s16, { g: 0.2 });
      for (const s of [0, 6, 8, 11]) if (inW(s)) kick(ctx, T(s), 0.9);
      for (const s of [4, 12]) if (inW(s)) clap(ctx, T(s), 0.9);
      for (let s = 0; s < 16; s++) if (inW(s)) hat(ctx, T(s) + (s % 2 ? 0.012 : 0), s % 4 === 2 ? 0.9 : 0.5, { open: s === 14 });
      for (const [s, ch] of STABS) if (inW(s)) stab(ctx, T(s), ch, 0.09, { g: 0.03 });
    }
  };
  groove(P.start, BEAT.skid + 1.5 * s16);                      // yanked to a stop by the skid
  slap(ctx, resume - 2 * s16, nm('C3'), s16, { g: 0.18 });       // pickup after the shades…
  slap(ctx, resume - s16, nm('E3'), s16, { g: 0.2 });
  groove(resume, s7.start);                                      // …and the groove is back
  // S7: thin to a held suspense note while the claw hovers over the lid
  voice(ctx, { role: 'lead', t: s7.start, m: nm('C5'), dur: BEAT.lidClose - s7.start, wave: 'pulse', duty: 0.5, a: 0.08, r: 0.02, vib: [6.5, 0.2, 0.1], lp: 2200, g: 0.06, dly: 0.2, rev: 0.25 });
  bass(ctx, s7.start, nm('C2'), BEAT.lidClose - s7.start, { g: 0.15, s: 0.8, d: 1, gate: 1 });
  for (let t = s7.start; t < BEAT.lidClose - 0.01; t += G.e8) hat(ctx, t, 0.35);
  // S8: groove returns under a riser + rising C7 arpeggio, then the drum pickup into the ride
  groove(s8.start, fillStart);
  riser(ctx, s8.start, P.end, 1.25);
  ['C4', 'E4', 'G4', 'Bb4', 'C5', 'E5', 'G5', 'Bb5'].map(nm).forEach((m, k) => {
    const t = s8.start + k * s16;
    if (t < fillStart - 1e-6) arp(ctx, t, m, s16, { role: 'lead', duty: 0.25, g: 0.05, lp: 6000, pan: k % 2 ? 0.3 : -0.3 });
  });
  for (let k = 0; k < 4; k++) snare(ctx, fillStart + k * s16, 0.65 + 0.12 * k);
  for (let k = 0; k < 8; k++) hat(ctx, fillStart + k * s16, 0.55 + 0.05 * k);
  kick(ctx, fillStart, 1); kick(ctx, fillStart + beat, 0.9);
  [196, 175, 147, 110].forEach((f, k) => tom(ctx, fillStart + beat + k * s16, f, 1.05 + 0.05 * k, 0.4 - 0.25 * k));
}

// ── ride · 160 BPM · D major · 8 bars — the theme, fast and joyful
const PCS = { C: 0, 'C#': 1, D: 2, E: 4, F: 5, 'F#': 6, G: 7, A: 9, B: 11 };
function chordNotes(names, low, n = 12) { // ascending chord tones from `low`
  const pcs = names.map((x) => PCS[x]), out = [];
  for (let m = low; out.length < n; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
}
function musicRide(ctx) {
  ctx.part = 'ride';
  const G = grid('ride'), { at, e8, s16, beat, bar } = G, P = G.p;
  const TON = nm('D5');
  const nBars = Math.round((P.end - P.start) / bar);
  const hillBar = Math.round((BEAT.hill - P.start) / bar), crestBar = Math.round((BEAT.crest - P.start) / bar);
  const CH = { D: ['D', 'F#', 'A'], G: ['G', 'B', 'D'], A: ['A', 'C#', 'E'], Bm: ['B', 'D', 'F#'] };
  const ROOT = { D: 'D2', G: 'G2', A: 'A2', Bm: 'B1' };
  const HARM = { M1: ['D', 'D'], M2: ['G', 'A'], A1: ['Bm', 'Bm'], A2: ['A', 'D'] };
  const city = ['M1', 'M2', 'A1', 'A2'], chorus = ['M1', 'A1', 'M2', 'A1'];
  const plan = [];
  for (let b = 0; b < nBars; b++) {
    if (b < hillBar) plan.push({ sec: 'city', ph: city[b % 4], harm: HARM[city[b % 4]] });
    else if (b < crestBar) { const c = (crestBar - 1 - b) % 2 ? 'G' : 'A'; plan.push({ sec: 'hill', ph: null, harm: [c, c] }); }
    else if (b === nBars - 1) plan.push({ sec: 'crest', ph: 'A2', harm: HARM.A2, last: true });
    else { const ph = chorus[(b - crestBar) % 4]; plan.push({ sec: 'crest', ph, harm: ph === 'A1' ? ['Bm', 'G'] : HARM[ph] }); }
  }
  const ARP = [0, 1, 2, 3, 1, 2, 3, 2];
  crash(ctx, P.start, 0.9, { d: 0.8 }); // the flash cut into the ride
  plan.forEach((pb, b) => {
    const { sec, harm, last } = pb, crest = sec === 'crest', hill = sec === 'hill';
    const chordAt = (beatPos) => harm[beatPos < 2 ? 0 : 1];
    // bass: 8th-note octave bounce on the root
    for (let k = 0; k < 8; k++) {
      if (last && k >= 6) continue;
      bass(ctx, at(b, k / 2), nm(ROOT[chordAt(k / 2)]) + (k % 2 ? 12 : 0), e8, { g: crest ? 0.29 : 0.24, gate: 0.75 });
    }
    // 16th arps under the tune (city + crest), ping-ponged
    if (!hill) for (let k = 0; k < (last ? 8 : 16); k++) {
      const ns = chordNotes(CH[chordAt(k / 4)], nm('D4'));
      arp(ctx, at(b, k / 4), ns[ARP[k % 8]], s16, { g: crest ? 0.03 : 0.028, lp: 6000, pan: k % 2 ? 0.4 : -0.4, dly: 0.2, rev: 0.05 });
    }
    // soft sustained chords for body in the chorus
    if (crest) for (let h = 0; h < (last ? 1 : 2); h++) pad(ctx, at(b, 2 * h), chordNotes(CH[harm[h]], nm('A3'), 3), 2 * beat * 0.95, { g: 0.013, a: 0.02, r: 0.12, lp: 2600, rev: 0.12 });
    // drums
    if (sec === 'city') {
      [0, 2, 2.5].forEach((q) => kick(ctx, at(b, q), 0.85));
      [1, 3].forEach((q) => snare(ctx, at(b, q), 0.75));
      for (let k = 0; k < 8; k++) hat(ctx, at(b, k / 2), k % 2 ? 0.8 : 0.55, { open: k === 7 });
    } else if (hill) {
      const roll = b === crestBar - 1;
      if (!roll) {
        [0, 1.5, 2, 3].forEach((q) => kick(ctx, at(b, q), 0.85));
        [1, 3, 3.5, 3.75].forEach((q, i) => snare(ctx, at(b, q), i < 2 ? 0.75 : 0.5));
        for (let k = 0; k < 16; k++) hat(ctx, at(b, k / 4), k % 2 ? 0.45 : 0.75);
      } else { // accelerating snare roll into the crest: 8ths → 16ths → 32nds
        for (let q = 0; q < 4; q++) kick(ctx, at(b, q), 0.8);
        const hits = [];
        for (let k = 0; k < 4; k++) hits.push(k / 2);
        for (let k = 0; k < 4; k++) hits.push(2 + k / 4);
        for (let k = 0; k < 8; k++) hits.push(3 + k / 8);
        hits.forEach((q) => snare(ctx, at(b, q), 0.35 + 0.55 * (q / 4), { d: 0.05 }));
      }
    } else {
      if (b === crestBar) crash(ctx, at(b), 1.3, { d: 1.1 });
      const beats = last ? 3 : 4;
      for (let q = 0; q < beats; q++) { kick(ctx, at(b, q), 1); if (q % 2) { snare(ctx, at(b, q), 0.85); clap(ctx, at(b, q), 0.5); } }
      for (let k = 0; k < (last ? 8 : 16); k++) hat(ctx, at(b, k / 4), k % 2 ? 0.45 : 0.8, { pan: 0.3 });
      if (last) { // D chord hit on beat 3, tom fill into the beach
        crash(ctx, at(b, 2), 0.8, { d: 0.7 });
        [220, 196, 165, 131].forEach((f, k) => tom(ctx, at(b, 3 + k / 4), f, 0.9, 0.4 - 0.25 * k));
      }
    }
    if (hill && b === hillBar) riser(ctx, BEAT.hill, BEAT.crest, 1.3);
    // melody
    if (hill) { // rising arpeggios up two octaves
      const c = harm[0], ns = chordNotes(CH[c], nm(c === 'G' ? 'G4' : 'A4'));
      for (let k = 0; k < 16; k++) lead(ctx, at(b, k / 4), ns[(k >> 2) + (k & 3)], s16, { duty: 0.25, g: 0.09, lp: 7000, vib: false, gate: 0.8, d: 0.1, s: 0.5, pan: k % 2 ? 0.25 : -0.25, dly: 0.25, rev: 0.08 });
    } else if (!crest) {
      phrase(at(b), e8, TON, MAJOR, THEME[pb.ph], (t, m, len) => lead(ctx, t, m, len, { duty: 0.25, g: 0.1, lp: 7000, vib: [6, 0.1, 0.12], dly: 0.25, rev: 0.08, pan: -0.1 }));
    } else { // the big chorus: 50 % lead + harmony a third below + octave sparkle, wide
      const ph = THEME[pb.ph];
      const harmPh = ph.map(([d, n], i) => [d - (last && i === ph.length - 1 ? 3 : 2), n]);
      phrase(at(b), e8, TON, MAJOR, ph, (t, m, len) => {
        lead(ctx, t, m, len, { duty: 0.5, g: 0.115, lp: 7500, vib: [6, 0.12, 0.1], dly: 0.35, rev: 0.12, pan: -0.2 });
        lead(ctx, t, m + 12, len, { role: 'lead8va', duty: 0.125, g: 0.026, lp: 8000, vib: [6, 0.1, 0.1], dly: 0.4, rev: 0.15, pan: 0.05 });
      });
      phrase(at(b), e8, TON, MAJOR, harmPh, (t, m, len) => lead(ctx, t, m, len, { role: 'harmony', duty: 0.25, g: 0.065, lp: 6000, vib: [5.8, 0.1, 0.12], dly: 0.35, rev: 0.12, pan: 0.4 }));
    }
  });
}

// ── beach · 120 BPM · G major · 4 bars — ukulele bounce, dead stop on the gulp
function musicBeach(ctx) {
  ctx.part = 'beach';
  const G = grid('beach'), { at, e8, s16, beat, bar } = G, P = G.p;
  const back = LOCAL.flourish, gag = shot('S11').start, stop = BEAT.gulp - 0.005;
  const UKE = { G: ['G4', 'B4', 'D5', 'G5'], Em: ['G4', 'B4', 'E5', 'G5'], C: ['G4', 'C5', 'E5', 'G5'], D: ['A4', 'D5', 'F#5', 'A5'] };
  const ROOT = { G: ['G2', 'D3'], Em: ['E2', 'B2'], C: ['C3', 'G2'], D: ['D2', 'A2'] };
  const PROG = [['G', 'G'], ['Em', 'C'], ['C', 'D'], ['G', 'G']];
  const nb = Math.round((P.end - P.start) / bar);
  for (let b = 0; b < nb; b++) {
    const prog = PROG[Math.min(b, PROG.length - 1)];
    for (let q = 0; q < 4; q++) {
      const ch = prog[q < 2 ? 0 : 1], tb = at(b, q), inGag = tb >= gag - 1e-6;
      if (tb >= stop) continue;
      if (!inGag) strum(ctx, tb, UKE[ch].map(nm), { g: 0.05 });
      strum(ctx, tb + e8, UKE[ch].slice(1).map(nm), { g: inGag ? 0.045 : 0.035, up: true, spread: 0.008 });
      for (let k = 0; k < 4; k++) if (tb + k * s16 < stop) shaker(ctx, tb + k * s16, (k === 2 ? 1 : k === 0 ? 0.7 : 0.45) * (inGag ? 0.7 : 1));
      if (q % 2 === 0) {
        kick(ctx, tb, inGag ? 0.5 : 0.65);
        const changed = q === 2 && prog[1] !== prog[0];
        bass(ctx, tb, nm(ROOT[ch][q === 2 && !changed ? 1 : 0]), beat, { g: 0.22, gate: 0.7 });
      } else {
        rim(ctx, tb, inGag ? 0.6 : 0.85);
        if (tb + e8 < stop) bass(ctx, tb + e8, nm(ROOT[ch][1]), e8, { g: 0.16, gate: 0.5 });
      }
    }
  }
  // the theme, playful, on plucks (bars 1–2)
  const mel = (t, m, len) => { if (t < gag - 1e-6) pluck(ctx, t, m, { role: 'lead', dur: Math.max(0.12, len * 0.85), d: 0.16, duty: 0.25, g: 0.075, pan: 0.15, dly: 0.25, rev: 0.1, bright: 6000 }); };
  phrase(at(0), e8, nm('G5'), MAJOR, THEME.M1, mel);
  phrase(at(1), e8, nm('G5'), MAJOR, THEME.M2, mel);
  // the laugh brings the music back: a quick run up and a happy G chord ringing into the sunset
  ['G4', 'B4', 'D5', 'G5'].map(nm).forEach((m, k) => { pluck(ctx, back + k * s16, m, { role: 'lead', g: 0.09, d: 0.12, pan: -0.3 + 0.2 * k, dly: 0.2 }); shaker(ctx, back + k * s16, 0.6); });
  const hit = back + beat;
  strum(ctx, hit, ['G4', 'B4', 'D5', 'G5', 'B5'].map(nm), { g: 0.07, d: 0.5, dur: 1.2, spread: 0.018, rev: 0.25 });
  bass(ctx, hit, nm('G2'), 1.0, { g: 0.26, d: 0.6, s: 0.3 });
  kick(ctx, hit, 0.8); crash(ctx, hit, 0.35, { d: 0.6 });
}

// ── sunset · 72 BPM · D major — the theme, slow and warm, resolving on the end card
function musicSunset(ctx) {
  ctx.part = 'sunset';
  const G = grid('sunset'), { e8, beat } = G, P = G.p;
  const TON = nm('D5'), endCard = shot('S13').start, tail = DURATION - endCard;
  // Dmaj7 | Bm7 ‖ Gmaj7 | A7sus4 → A
  const HALF = [['D2', ['D3', 'A3', 'C#4', 'F#4']], ['B1', ['B2', 'F#3', 'A3', 'D4']], ['G1', ['G2', 'D3', 'F#3', 'B3']], ['A1', ['A2', 'E3', 'G3', 'D4']]];
  const nHalf = Math.round((endCard - P.start) / (2 * beat));
  for (let h = 0; h < nHalf; h++) {
    const t = P.start + h * 2 * beat, [root, tn] = HALF[h % 4], tones = tn.map(nm), lastHalf = h === nHalf - 1;
    bass(ctx, t, nm(root), 2 * beat, { g: 0.2, d: 1.2, s: 0.5, gate: 0.95, lp: 1200 });
    if (!lastHalf) pad(ctx, t, tones, 2 * beat, { g: 0.009, a: 0.4, r: 0.6, lp: 1300, rev: 0.4 });
    else { // sus4 resolves: D → C# on the last beat
      pad(ctx, t, tones, beat, { g: 0.009, a: 0.4, r: 0.3, lp: 1300, rev: 0.4 });
      pad(ctx, t + beat, ['A2', 'E3', 'A3', 'C#4'].map(nm), beat, { g: 0.009, a: 0.15, r: 0.5, lp: 1300, rev: 0.4 });
    }
    const ns = tones.map((m) => m + 12);
    if (lastHalf) ns[3] = nm('C#5');
    for (let k = 0; k < 4; k++) bell(ctx, t + k * e8, ns[k], { role: 'harp', fm: [1, 0.9, 0.15], d: 0.5, dur: 1.2, g: 0.028, pan: k % 2 ? 0.4 : -0.4, dly: 0.3, rev: 0.5 });
  }
  const lo = { duty: 0.25, lp: 1700, g: 0.075, vib: [4.5, 0.15, 0.25], a: 0.03, r: 0.25, d: 0.8, s: 0.7, rev: 0.45, dly: 0.3, gate: 0.97, pan: -0.05 };
  const t2 = phrase(P.start, e8, TON, MAJOR, THEME.M1, (t, m, len) => lead(ctx, t, m, len, lo));
  phrase(t2, e8, TON, MAJOR, THEME.M2, (t, m, len) => lead(ctx, t, m, len, lo));
  // resolve to the tonic on the end card: long D(add9), rolled harp, sparkling chime
  lead(ctx, endCard, TON, tail - 0.4, { ...lo, g: 0.07, r: 1.0, d: 1.5, s: 0.55, gate: 1 });
  bass(ctx, endCard, nm('D2'), tail - 0.2, { g: 0.22, d: 2.0, s: 0.3, gate: 1, lp: 900 });
  pad(ctx, endCard, ['D3', 'A3', 'E4', 'F#4', 'A4'].map(nm), tail - 0.5, { g: 0.01, a: 0.3, r: 1.2, lp: 1500, rev: 0.5 });
  ['D4', 'F#4', 'A4', 'E5', 'F#5', 'A5'].map(nm).forEach((m, k) => bell(ctx, endCard + k * e8 * 0.5, m, { role: 'harp', fm: [1, 0.9, 0.2], d: 0.9, dur: 2.2, g: 0.03, pan: -0.5 + 0.2 * k, rev: 0.6, dly: 0.3 }));
  ['D6', 'F#6', 'A6', 'D7'].map(nm).forEach((m, k) => bell(ctx, BEAT.endChime + k * 0.06, m, { role: 'chime', fm: [3, 1.5, 0.15], d: 0.8, dur: 2.4, g: 0.065 * (1 - k * 0.12), pan: -0.3 + 0.2 * k, rev: 0.6, dly: 0.4 }));
  const R = rng('chime');
  ['A6', 'D7', 'F#7', 'A7', 'D7', 'F#7'].map(nm).forEach((m, k) => bell(ctx, BEAT.endChime + 0.25 + k * 0.09 + R() * 0.03, m, { role: 'chime', fm: [2, 0.6, 0.08], d: 0.25, dur: 0.8, g: 0.018, pan: (R() - 0.5) * 1.2, rev: 0.6, dly: 0.3 }));
}

// ════════════════ §9 effects · mix · master ════════════════
// Hard cuts: delay/reverb state is cleared here (inside music-gain-zero windows) so no tail
// from before a cut leaks into the music that resumes after it.
const killSamples = (sr) => [BEAT.faceplant + LOCAL.powerDown + 0.2, BEAT.bubblePop + 0.02, BEAT.skid + 0.3, BEAT.gulp + 0.02]
  .map((t) => Math.round(t * sr)).sort((a, b) => a - b);
// Tempo-synced ping-pong delay, one line per part: [delay in beats, feedback, wet].
const DELAY = { grind: [0.75, 0.38, 0.5], wish: [0.75, 0.5, 0.55], pelican: [0.5, 0.25, 0.4], ride: [0.75, 0.33, 0.45], beach: [0.75, 0.3, 0.45], sunset: [0.75, 0.45, 0.55] };
function processDelay(ctx) {
  const { sr, N, dly, musL, musR } = ctx, kills = new Set(killSamples(sr));
  for (const p of PARTS) {
    const [beats, fb, wet] = DELAY[p.id] ?? [0.75, 0.3, 0.4];
    const D = Math.max(1, Math.round(((beats * 60) / p.bpm) * sr));
    const bl = new Float32Array(D), br = new Float32Array(D);
    const s0 = Math.round(p.start * sr), s1 = Math.min(N, Math.round(p.end * sr)), e = Math.min(N, s1 + Math.round(3 * sr));
    let w = 0, dl = 0, dr = 0;
    for (let i = s0; i < e; i++) {
      if (kills.has(i)) { bl.fill(0); br.fill(0); dl = dr = 0; }
      const x = i < s1 ? dly[i] : 0, oL = bl[w], oR = br[w];
      dl += 0.35 * (oR - dl); dr += 0.35 * (oL - dr); // damped cross-feedback → echoes alternate L / R
      bl[w] = x + dl * fb; br[w] = dr * fb;
      musL[i] += oL * wet; musR[i] += oR * wet;
      if (++w === D) w = 0;
    }
  }
}
// Freeverb-style reverb (4 damped combs + 2 allpasses per channel), mono send → stereo.
function reverbChannel(input, out, first, end, sr, spread, pre, gain, kills) {
  const sc = sr / 44100, room = 0.84, damp = 0.3, d1 = 1 - damp;
  const L = (n) => Math.max(1, Math.round((n + spread) * sc));
  const c0 = new Float32Array(L(1116)), c1 = new Float32Array(L(1188)), c2 = new Float32Array(L(1277)), c3 = new Float32Array(L(1356));
  const a0 = new Float32Array(L(556)), a1 = new Float32Array(L(441));
  let i0 = 0, i1 = 0, i2 = 0, i3 = 0, j0 = 0, j1 = 0, f0 = 0, f1 = 0, f2 = 0, f3 = 0, kn = 0;
  while (kn < kills.length && kills[kn] < first) kn++;
  for (let i = first; i < end; i++) {
    if (i === kills[kn]) { for (const b of [c0, c1, c2, c3, a0, a1]) b.fill(0); f0 = f1 = f2 = f3 = 0; kn++; }
    const k = i - pre, x = k >= 0 && k < input.length ? input[k] * gain : 0;
    let o, y, v;
    o = c0[i0]; f0 = o * d1 + f0 * damp; c0[i0] = x + f0 * room; if (++i0 === c0.length) i0 = 0; y = o;
    o = c1[i1]; f1 = o * d1 + f1 * damp; c1[i1] = x + f1 * room; if (++i1 === c1.length) i1 = 0; y += o;
    o = c2[i2]; f2 = o * d1 + f2 * damp; c2[i2] = x + f2 * room; if (++i2 === c2.length) i2 = 0; y += o;
    o = c3[i3]; f3 = o * d1 + f3 * damp; c3[i3] = x + f3 * room; if (++i3 === c3.length) i3 = 0; y += o;
    o = a0[j0]; v = o - y; a0[j0] = y + o * 0.5; if (++j0 === a0.length) j0 = 0; y = v;
    o = a1[j1]; v = o - y; a1[j1] = y + o * 0.5; if (++j1 === a1.length) j1 = 0; y = v;
    out[i] += y;
  }
}
const REVERB_GAIN = 0.05;
function processReverb(ctx) {
  const { sr, N, rev } = ctx;
  let first = -1, last = -1;
  for (let i = 0; i < N; i++) if (rev[i] !== 0) { if (first < 0) first = i; last = i; }
  if (first < 0) return;
  const pre = Math.round(0.018 * sr), end = Math.min(N, last + pre + Math.round(4 * sr));
  const kills = killSamples(sr);
  reverbChannel(rev, ctx.musL, first, end, sr, 0, pre, REVERB_GAIN, kills);
  reverbChannel(rev, ctx.musR, first, end, sr, 23, pre, REVERB_GAIN, kills);
}
// Music bus: time-varying 2-pole low-pass (ctx.cut) then gain curve (ctx.gain), per-sample interpolated.
function applyMusicBus(ctx) {
  const { sr, N, K, musL, musR, cut, gain } = ctx;
  let l1 = 0, l2 = 0, r1 = 0, r2 = 0;
  for (let k = 0; k < K - 1; k++) {
    const i0 = k * CR;
    if (i0 >= N) break;
    const i1 = Math.min(N, i0 + CR);
    const c = 1 - Math.exp((-TAU * Math.min(cut[k], sr * 0.45)) / sr), g0 = gain[k], dg = (gain[k + 1] - g0) / CR;
    for (let i = i0; i < i1; i++) {
      const g = g0 + dg * (i - i0);
      l1 += c * (musL[i] - l1); l2 += c * (l1 - l2);
      r1 += c * (musR[i] - r1); r2 += c * (r1 - r2);
      musL[i] = l2 * g; musR[i] = r2 * g;
    }
  }
}
// Look-ahead peak limiter: gain never lets |x| exceed thr; 3 ms look-ahead, 120 ms release.
function limit(L, R, sr, thr, req, env) {
  const N = L.length, W = Math.max(1, Math.round(0.003 * sr));
  for (let i = 0; i < N; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); req[i] = p > thr ? thr / p : 1; }
  const dq = new Int32Array(N);
  let h = 0, tl = 0;
  for (let i = N - 1; i >= 0; i--) { // env[i] = min(req[i … i+W]) via a monotonic deque
    while (tl > h && req[dq[tl - 1]] >= req[i]) tl--;
    dq[tl++] = i;
    while (dq[h] > i + W) h++;
    env[i] = req[dq[h]];
  }
  const rel = 1 - Math.exp(-1 / (0.12 * sr));
  let e = 1;
  for (let i = 0; i < N; i++) { const t = env[i]; e = t < e ? t : e + (t - e) * rel; env[i] = e; }
  let sum = 0, minG = 1, minAt = 0, active = 0;
  for (let i = 0; i < N; i++) { // W-sample moving average = smooth attack that lands on the peak
    sum += env[i];
    if (i >= W) sum -= env[i - W];
    const g = i >= W ? sum / W : (sum + (W - 1 - i)) / W;
    L[i] *= g; R[i] *= g;
    if (g < minG) { minG = g; minAt = i / sr; }
    if (g < 0.989) active++; // > 0.1 dB of gain reduction
  }
  return { grDb: -20 * Math.log10(minG), grAt: minAt, activeFrac: active / N };
}
const LIMIT_PCTL = 0.9999; // limiter threshold = 99.99th percentile of sample peaks (only the top 0.01 % is shaved)
const TARGET_PEAK = Math.pow(10, -1 / 20); // −1 dBFS
const FADE_OUT = 2.0;   // master fade (music AND ambience) into DURATION
function master(ctx) {
  const { sr, N, musL: L, musR: R, fxL, fxR } = ctx;
  const a = Math.exp((-TAU * 12) / sr); // DC blocker (~12 Hz one-pole high-pass)
  const f0 = Math.round((DURATION - FADE_OUT) * sr), f1 = N - Math.round(0.02 * sr);
  let xl = 0, yl = 0, xr = 0, yr = 0;
  for (let i = 0; i < N; i++) {
    const l = L[i] + fxL[i], r = R[i] + fxR[i];
    yl = l - xl + a * yl; xl = l;
    yr = r - xr + a * yr; xr = r;
    let g = i < 64 ? i / 64 : 1;
    if (i >= f0) g *= i >= f1 ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (i - f0)) / (f1 - f0));
    L[i] = yl * g; R[i] = yr * g;
  }
  let peak = 0;
  for (let i = 0; i < N; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (p > peak) peak = p; }
  // robust threshold: percentile of |x| from a 4096-bin histogram, so one stray transient can't set the mix level
  const H = new Uint32Array(4096);
  for (let i = 0; i < N; i++) H[Math.min(4095, ((Math.max(Math.abs(L[i]), Math.abs(R[i])) / (peak || 1)) * 4095) | 0)]++;
  let cum = 0, bin = 4095;
  for (let b = 0; b < 4096; b++) { cum += H[b]; if (cum >= LIMIT_PCTL * N) { bin = b; break; } }
  const thr = Math.max(peak * Math.pow(10, -4 / 20), (peak * (bin + 1)) / 4095); // never more than 4 dB of reduction
  const lim = peak > 0 ? limit(L, R, sr, thr, fxL, fxR) : { grDb: 0, grAt: 0, activeFrac: 0 }; // fx buffers reused as scratch
  let pk = 0;
  for (let i = 0; i < N; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (p > pk) pk = p; }
  const norm = pk > 0 ? TARGET_PEAK / pk : 1;
  for (let i = 0; i < N; i++) { L[i] = clamp(L[i] * norm, -1, 1); R[i] = clamp(R[i] * norm, -1, 1); }
  return { rawPeak: peak, limiterThreshold: thr, maxGainReductionDb: lim.grDb, maxGainReductionAt: lim.grAt, limiterActive: lim.activeFrac, normGain: norm };
}

// ════════════════════════ §10 public API ════════════════════════
/** Render the whole film's soundtrack. → { sampleRate, left, right } (Float32Array, DURATION s).
 *  opts.debug adds { debug: { notes, master, musL, musR, fxL, fxR } } (pre-master buses). */
export function renderSoundtrack(sampleRate = 44100, opts = {}) {
  const ctx = makeCtx(sampleRate);
  buildAutomation(ctx);
  musicGrind(ctx); musicWish(ctx); musicPelican(ctx); musicRide(ctx); musicBeach(ctx); musicSunset(ctx);
  renderSfx(ctx); renderAmbience(ctx); renderBlips(ctx);
  processDelay(ctx); processReverb(ctx);
  applyMusicBus(ctx);
  const dbg = opts.debug ? { musL: ctx.musL.slice(), musR: ctx.musR.slice(), fxL: ctx.fxL.slice(), fxR: ctx.fxR.slice() } : null;
  const m = master(ctx);
  const out = { sampleRate, left: ctx.musL, right: ctx.musR };
  if (dbg) out.debug = { ...dbg, notes: ctx.notes, master: m };
  return out;
}

/** 16-bit PCM stereo WAV → Uint8Array (works in Node and the browser). */
export function encodeWav(left, right, sampleRate) {
  const n = Math.min(left.length, right.length), dataBytes = n * 4;
  const buf = new ArrayBuffer(44 + dataBytes), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, dataBytes, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) {
    v.setInt16(o, Math.round(clamp(left[i], -1, 1) * 32767), true);
    v.setInt16(o + 2, Math.round(clamp(right[i], -1, 1) * 32767), true);
  }
  return new Uint8Array(buf);
}
