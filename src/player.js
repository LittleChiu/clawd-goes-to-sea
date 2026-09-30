// Browser player: the film loop (synced to the audio clock), controls,
// chapters, the script with live-rendered thumbnails, animated cast portraits.
import { Gfx, W, H, C } from './core.js';
import { renderFrame } from './film.js';
import { DURATION, PARTS } from './cues.js';
import { ACTS, SCRIPT, EGGS } from './script-data.js';
import { drawClawd } from './clawd.js';
import { drawRider, drawPelican } from './pelican.js';
import { bouncyText } from './fx.js';
import { renderSoundtrack } from './audio.js';

const $ = id => document.getElementById(id);
const film = $('film'), ctx2d = film.getContext('2d');
const g = new Gfx(W, H);
const img = new ImageData(g.u8, W, H);

// ── clock: the audio context when we have sound, performance.now() otherwise ──
let actx = null, buffer = null, src = null, gain = null;
let playing = false, offset = 2.6, startAt = 0, muted = false, dirty = true, ended = false;
const wall = () => performance.now() / 1000;
function now() {
  if (!playing) return offset;
  return (actx && buffer ? actx.currentTime : wall()) - startAt;
}

async function ensureAudio() {
  if (buffer || actx === false) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('no AudioContext');
    actx = new AC();
    $('loading').hidden = false;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const { left, right, sampleRate } = renderSoundtrack(44100);
    buffer = actx.createBuffer(2, left.length, sampleRate);
    buffer.copyToChannel(left, 0); buffer.copyToChannel(right, 1);
    gain = actx.createGain(); gain.gain.value = muted ? 0 : 1; gain.connect(actx.destination);
  } catch (e) {
    console.warn('Playing without sound:', e);
    actx = false;
  } finally { $('loading').hidden = true; }
}

function startSource(at) {
  if (actx && buffer) {
    src = actx.createBufferSource(); src.buffer = buffer; src.connect(gain);
    src.start(0, Math.max(0, at));
    startAt = actx.currentTime - at;
  } else startAt = wall() - at;
}
function stopSource() { if (src) { try { src.onended = null; src.stop(); } catch (_) {} src = null; } }

async function play(from) {
  await ensureAudio();
  if (actx && actx.state === 'suspended') await actx.resume();
  if (from !== undefined) offset = from;
  if (offset >= DURATION - 0.05) offset = 0;
  stopSource(); startSource(offset);
  playing = true; ended = false;
  $('bigPlay').hidden = true; $('replay').hidden = true;
  setPlayIcon();
}
function pause() {
  if (!playing) return;
  offset = now(); stopSource(); playing = false; dirty = true; setPlayIcon();
}
function seek(t) {
  t = Math.max(0, Math.min(DURATION - 0.001, t));
  if (playing) { stopSource(); offset = t; startSource(t); }
  else { offset = t; dirty = true; }
  ended = false; $('replay').hidden = true;
}
function toggle() { playing ? pause() : play(); }

// ── UI ──
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`; };
function setPlayIcon() {
  $('play').innerHTML = playing
    ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg>'
    : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2 L14 8 L4 14 Z"/></svg>';
  $('play').setAttribute('aria-label', playing ? '暂停' : '播放');
}
function setMuteIcon() {
  $('mute').innerHTML = muted
    ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z"/><path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>'
    : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z"/><path d="M11 5.5c1.2 1.3 1.2 3.7 0 5M13 3.5c2.3 2.5 2.3 6.5 0 9" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
  $('mute').setAttribute('aria-label', muted ? '取消静音' : '静音');
}

// scrubber: coloured act segments
const PART_COL = { grind: '#3E4A7A', wish: '#E0924A', pelican: '#E43B44', ride: '#56B8F0', beach: '#EACB84', sunset: '#9A4470' };
function buildScrubber() {
  const parts = $('parts');
  for (const p of PARTS) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.style.left = `${(p.start / DURATION) * 100}%`;
    seg.style.width = `${((p.end - p.start) / DURATION) * 100}%`;
    seg.style.background = PART_COL[p.id];
    parts.appendChild(seg);
  }
  const chapters = $('chapters');
  ACTS.forEach(a => {
    const p = PARTS.find(q => q.id === a.id);
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" id="ch-${a.id}"><i style="background:${PART_COL[a.id]}"></i><b>${a.name}</b><span>${fmt(p.start)}</span></button>`;
    li.querySelector('button').addEventListener('click', () => { seek(p.start + 0.01); if (!playing) play(); });
    chapters.appendChild(li);
  });
  const scrub = $('scrub');
  let drag = false;
  const at = e => { const r = scrub.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * DURATION; };
  scrub.addEventListener('pointerdown', e => { drag = true; scrub.setPointerCapture(e.pointerId); seek(at(e)); });
  scrub.addEventListener('pointermove', e => { if (drag) seek(at(e)); });
  scrub.addEventListener('pointerup', () => { drag = false; });
  scrub.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { seek(now() - 2); e.preventDefault(); }
    if (e.key === 'ArrowRight') { seek(now() + 2); e.preventDefault(); }
  });
}

function updateUI(t) {
  const p = (t / DURATION) * 100;
  $('fill').style.width = `${p}%`;
  $('head').style.left = `${p}%`;
  $('scrub').setAttribute('aria-valuenow', t.toFixed(1));
  $('scrub').setAttribute('aria-valuetext', fmt(t));
  $('time').textContent = `${fmt(t)} / ${fmt(DURATION)}`;
  const cur = PARTS.find(q => t >= q.start && t < q.end) || PARTS[PARTS.length - 1];
  document.querySelectorAll('.chapters button').forEach(b => b.classList.toggle('on', b.id === `ch-${cur.id}`));
  const shot = [...SCRIPT].reverse().find(s => t >= s.t);
  document.querySelectorAll('.shot').forEach(el => el.classList.toggle('on', shot && el.dataset.id === shot.id));
}

// ── the script, with thumbnails rendered by the film engine ──
function buildScript() {
  const list = $('shots');
  const tg = new Gfx(W, H);
  for (const s of SCRIPT) {
    const li = document.createElement('li');
    li.className = 'shot'; li.dataset.id = s.id;
    const lines = s.lines.map(([who, l]) => `<p class="line"><span class="who">${who}</span>${escape(l)}</p>`).join('');
    li.innerHTML = `
      <button type="button" class="thumb" aria-label="从 ${s.id} 开始播放"><canvas width="${W}" height="${H}"></canvas><span class="tc">${fmt(s.t)}</span></button>
      <div class="desc">
        <h3><span class="sid">${s.id}</span><span class="cam">${s.cam}</span></h3>
        <p>${s.action}</p>
        ${lines}
        <p class="snd"><span class="who">声音</span>${s.sound}</p>
      </div>`;
    renderFrame(tg, s.thumb);
    li.querySelector('canvas').getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(tg.u8), W, H), 0, 0);
    li.querySelector('.thumb').addEventListener('click', () => {
      seek(s.t + 0.01); play();
      $('screen').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    });
    list.appendChild(li);
  }
  const eggs = $('eggs');
  for (const [k, v] of EGGS) { const li = document.createElement('li'); li.innerHTML = `<b>${k}</b><span>${v}</span>`; eggs.appendChild(li); }
}
const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── animated cast portraits + pixel logo ──
const portraits = [
  { el: $('pClawd'), w: 96, h: 64, draw: (pg, t) => {
    const blink = (t % 3.1) > 2.95;
    const typing = Math.floor(t * 8) % 2;
    drawClawd(pg, 48, 54 + (Math.floor(t * 2) % 2 ? 0 : -1), { s: 4, eyes: blink ? 'closed' : 'open', armL: typing ? -0.5 : 0.5, armR: typing ? 0.5 : -0.5 });
  } },
  { el: $('pPelican'), w: 96, h: 64, draw: (pg, t) => {
    drawRider(pg, 44, 60, { s: 1, dist: t * 40, pel: { shades: 1, eyes: 'happy' }, clawd: { eyes: 'happy', armL: 'up', armR: 'up', blush: true } });
  } },
];
const logoG = new Gfx(176, 34);
function drawLogo(t) {
  logoG.clear(C('#0F0E17'));
  bouncyText(logoG, 'Clawd 去看海', 88, 4, t, 0.1, { scale: 2, color: C('#EFE9DD'), outline: C('#181425'), shadow: C('#D77757'), stagger: 0.07 });
  $('logo').getContext('2d').putImageData(new ImageData(logoG.u8, 176, 34), 0, 0);
}
function animatePortraits(t) {
  for (const p of portraits) {
    if (!p.el) continue;
    if (!p.g) { p.g = new Gfx(p.w, p.h); p.img = new ImageData(p.g.u8, p.w, p.h); p.ctx = p.el.getContext('2d'); }
    p.g.clear(C('#17152A'));
    p.draw(p.g, t);
    p.ctx.putImageData(p.img, 0, 0);
  }
}

// ── main loop ──
let logoDone = false;
const t0 = wall();
function loop() {
  let t = now();
  if (playing && t >= DURATION) {
    offset = DURATION - 0.001; stopSource(); playing = false; ended = true; dirty = true; setPlayIcon();
    $('replay').hidden = false; t = offset;
  }
  if (playing || dirty) { renderFrame(g, t); ctx2d.putImageData(img, 0, 0); updateUI(t); dirty = false; }
  const at = wall() - t0;
  if (!logoDone) { drawLogo(at); if (at > 2) logoDone = true; }
  animatePortraits(at);
  requestAnimationFrame(loop);
}

// ── wiring ──
$('bigPlay').addEventListener('click', () => play(0));
$('replay').addEventListener('click', () => play(0));
$('play').addEventListener('click', toggle);
$('restart').addEventListener('click', () => { seek(0); if (!playing) play(0); });
$('mute').addEventListener('click', () => { muted = !muted; if (gain) gain.gain.value = muted ? 0 : 1; setMuteIcon(); });
$('fs').addEventListener('click', () => {
  const el = $('screen');
  if (document.fullscreenElement) document.exitFullscreen?.();
  else (el.requestFullscreen?.() || Promise.resolve()).catch(() => {});
});
film.addEventListener('click', () => { if (!$('bigPlay').hidden) return; toggle(); });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea')) return;
  if (e.key === ' ' || e.key === 'k') { e.preventDefault(); $('bigPlay').hidden ? toggle() : play(0); }
  else if (e.key === 'ArrowLeft' && e.target === document.body) seek(now() - 3);
  else if (e.key === 'ArrowRight' && e.target === document.body) seek(now() + 3);
  else if (e.key === 'm') $('mute').click();
  else if (e.key === 'f') $('fs').click();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

setPlayIcon(); setMuteIcon();
buildScrubber();
buildScript();
requestAnimationFrame(loop);
