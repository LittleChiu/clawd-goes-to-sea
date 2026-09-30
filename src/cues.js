// ─────────────────────────────────────────────────────────────
//  cues.js — the single source of truth for timing.
//  Visual scenes AND the soundtrack both read from here, so a
//  change to a time below moves picture and sound together.
//  All times are in seconds from the start of the film.
// ─────────────────────────────────────────────────────────────

export const FPS = 30;
export const DURATION = 64.5;

// Musical parts. Visual cuts are laid on these beats.
export const PARTS = [
  { id: 'grind',   start: 0.0,  end: 20.0, bpm: 96,  key: 'A minor',  mood: 'lo-fi, sleepy, repetitive, a little melancholic; builds + speeds up through the montage, then powers down' },
  { id: 'wish',    start: 20.0, end: 27.5, bpm: 70,  key: 'C major',  mood: 'ambient, dreamy, golden hour; sparse bell arpeggios, soft pad, clock ticking' },
  { id: 'pelican', start: 27.5, end: 34.5, bpm: 120, key: 'F major',  mood: 'cheeky funky bass groove; 3 bars + a 2-beat drum pickup into the ride' },
  { id: 'ride',    start: 34.5, end: 46.5, bpm: 160, key: 'D major',  mood: 'bright, fast, joyful chiptune; the main theme. Big crash + full band at the sea reveal (42.0)' },
  { id: 'beach',   start: 46.5, end: 54.5, bpm: 120, key: 'G major',  mood: 'bouncy, playful, beachy; ukulele-like plucks; comedic stop at the gulp' },
  { id: 'sunset',  start: 54.5, end: 64.5, bpm: 72,  key: 'D major',  mood: 'slow, warm, nostalgic; the main theme reprised softly; final chord + chime' },
];

// Shots (camera setups). `scene` names map to src/scenes/*.
export const SHOTS = [
  { id: 'S1',  scene: 'dormExt',     start: 0.0,     end: 5.0 },
  { id: 'S2',  scene: 'dormInt',     start: 5.0,     end: 10.0 },
  { id: 'S3',  scene: 'terminal',    start: 10.0,    end: 12.5 },
  // Montage — each cut sits on a beat of 96 BPM (beat = 0.625s), accelerating.
  { id: 'M1',  scene: 'classroom',   start: 12.5,    end: 14.375,  day: 3,  variant: 0 },
  { id: 'M2',  scene: 'dormInt',     start: 14.375,  end: 15.625,  day: 11, variant: 1 },
  { id: 'M3',  scene: 'classroom',   start: 15.625,  end: 16.25,   day: 19, variant: 1 },
  { id: 'M4',  scene: 'dormInt',     start: 16.25,   end: 16.875,  day: 27, variant: 2 },
  { id: 'M5',  scene: 'classroom',   start: 16.875,  end: 17.1875, day: 33, variant: 2 },
  { id: 'M6',  scene: 'dormInt',     start: 17.1875, end: 17.5,    day: 38, variant: 3 },
  { id: 'M7',  scene: 'dormInt',     start: 17.5,    end: 20.0,    day: 42, variant: 4 }, // dawn — faceplant
  { id: 'S5',  scene: 'goldWindow',  start: 20.0,    end: 27.5 },
  { id: 'S6',  scene: 'windowExt',   start: 27.5,    end: 31.5 },
  { id: 'S7',  scene: 'laptopClose', start: 31.5,    end: 32.5 },
  { id: 'S8',  scene: 'windowExt',   start: 32.5,    end: 34.5,    phase: 'jump' },
  { id: 'S9',  scene: 'ride',        start: 34.5,    end: 46.5 },
  { id: 'S10', scene: 'beach',       start: 46.5,    end: 50.5 },
  { id: 'S11', scene: 'phoneGag',    start: 50.5,    end: 54.5 },
  { id: 'S12', scene: 'sunset',      start: 54.5,    end: 61.1667 },
  { id: 'S13', scene: 'endCard',     start: 61.1667, end: 64.5 },
];

// Transitions INTO a shot (keyed by shot id). Default is a hard cut.
export const TRANSITIONS = {
  S2:  { type: 'iris',     dur: 0.9, from: [176, 100], to: [160, 108] },   // iris closes on the lit window, opens on Clawd
  S3:  { type: 'cut' },
  M1:  { type: 'whip',     dur: 0.25 },
  S5:  { type: 'dissolve', dur: 0.8 },
  S6:  { type: 'cut' },
  S9:  { type: 'flash',    dur: 0.35 },
  S10: { type: 'wipe',     dur: 0.4 },
  S12: { type: 'dissolve', dur: 1.2 },
  S13: { type: 'fade',     dur: 1.0 },
};

// ── Story beats (visual AND audio events) ───────────────────
export const BEAT = {
  // S1 — dorm exterior at night: window lights switch off on 8th notes
  lightsOff: [0.625, 1.25, 1.5625, 1.875, 2.5, 2.8125, 3.125, 3.75],
  titleIn: 1.0, titleOut: 4.1,

  // S2 — inside: typing, snoring, micro-sleep jolt
  snores: [5.5, 7.0, 8.5],
  nodOff: 7.6, jolt: 8.4375,

  // S3 — terminal gag
  termPrompt: 10.05, termThinking: 10.45, termFixed: 10.95, termNewBugs: 11.45, termIssues: 11.9,

  // M7 — dawn faceplant
  faceplant: 18.35,

  // S5 — golden afternoon
  gullLand: 21.1, gullCry: [21.55, 22.35], clawdLooks: 21.9,
  bubble: [22.7, 22.95, 23.2], bubbleOpen: 23.4, sparkle: 24.2, bubblePop: 26.95,
  bellDistant: 27.2,

  // S6 — the pelican arrives
  zoomPast: 27.55, skid: 28.5, reverse: 28.75, stop: 29.25, shades: 29.32, bell1: 30.6,

  // S7 — the lid closes
  lidClose: 32.0,

  // S8 — the leap
  jump: 32.8, land: 33.4, bell2: 34.0, depart: 34.2,

  // S9 — the ride
  hill: 39.0, crest: 42.0, gulls: [44.0, 45.3],

  // S10 — beach
  waveIn: [47.2, 49.2], splash: 48.7, crabsPop: 48.0,

  // S11 — phone gag
  buzz: [50.8, 51.1, 51.4, 51.7], snap: 52.15, gulp: 52.4, laugh: 53.3,

  // S12/S13
  sunsetCaps: [55.3, 57.5], endChime: 61.6,
};

// Typewriter dialogue. `cps` = characters per second.
// Bubbles stay up until `until`. Captions fade in (no blips).
export const DIALOG = [
  { id: 'wish',  who: 'clawd',   t: 25.0, text: '……好想去看海啊。',   cps: 9,  until: 26.8 },
  { id: 'ask',   who: 'pelican', t: 29.4, text: '想去海边？',         cps: 12, until: 30.45 },
  { id: 'hopon', who: 'pelican', t: 30.5, text: '上车！',             cps: 14, until: 31.5 },
  { id: 'hold',  who: 'pelican', t: 39.3, text: '抓紧咯——！',         cps: 14, until: 40.4 },
  { id: 'wah',   who: 'clawd',   t: 40.5, text: '哇啊啊啊——！',       cps: 16, until: 41.9 },
  { id: 'sea',   who: 'clawd',   t: 43.0, text: '是海！！',           cps: 10, until: 44.9 },
  { id: 'alert', who: 'phone',   t: 50.85, text: '【告警】线上服务崩了！', cps: 40, until: 52.2 },
  { id: 'gulp',  who: 'pelican', t: 52.7, text: '咕嘟。',             cps: 8,  until: 53.7 },
  { id: 'cap1',  who: 'caption', t: 55.3, text: '代码永远写不完，',   cps: 0,  until: 60.4 },
  { id: 'cap2',  who: 'caption', t: 57.5, text: '但海，一直都在。',   cps: 0,  until: 60.4 },
];

// Characters that do not "blip" when typed out.
export const SILENT_CHARS = '…，。！？、—【】 ,.!?';

// Returns the times at which each visible character of a line appears.
export function charTimes(line) {
  const out = [];
  if (!line.cps) return out;
  const chars = [...line.text];
  for (let i = 0; i < chars.length; i++) out.push({ t: line.t + i / line.cps, ch: chars[i] });
  return out;
}

// Continuous ambience / loops (audio), with rough gain 0..1.
export const AMBIENCE = [
  { type: 'typing',   start: 0.0,   end: 5.0,   gain: 0.25, muffled: true },
  { type: 'typing',   start: 5.0,   end: 7.6,   gain: 0.7 },
  { type: 'typing',   start: 8.6,   end: 10.0,  gain: 0.75 },
  { type: 'typing',   start: 12.5,  end: 18.3,  gain: 0.5 },
  { type: 'typing',   start: 20.0,  end: 21.8,  gain: 0.35, slow: true },
  { type: 'crickets', start: 0.0,   end: 5.0,   gain: 0.3 },
  { type: 'clock',    start: 5.0,   end: 10.0,  gain: 0.25 },
  { type: 'clock',    start: 20.0,  end: 27.3,  gain: 0.4 },
  { type: 'birds',    start: 20.0,  end: 27.3,  gain: 0.15 },
  { type: 'wind',     start: 34.5,  end: 46.5,  gain: 0.35 },
  { type: 'chain',    start: 34.3,  end: 46.3,  gain: 0.2 },
  { type: 'waves',    start: 42.0,  end: 64.5,  gain: 0.5 },
];

export const MONTAGE_CUTS = SHOTS.filter(s => s.id.startsWith('M')).map(s => s.start);
