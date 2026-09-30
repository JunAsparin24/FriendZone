// Procedural sound effects: everything is synthesized with Web Audio, so there are no audio files.
//   sfx('coin')                      play a sound
//   sfx('step', { vol: 0.4, pan })   quieter / panned (spatial sounds in the world)
//   ambient('fountain')              looping bed with .set(volume) / .stop()
// Volumes come from settings.js; music (music.js) plays through its own bus on the same context.
import { settings, onSettings } from './settings.js';

let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, gestured = false;
const startHooks = [];
let V = 1, P = 0; // volume + pan for the sound currently being built
const lastPlayed = {};

function ensure() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 14;
  comp.ratio.value = 5;
  master = ac.createGain();
  sfxBus = ac.createGain();
  musicBus = ac.createGain();
  sfxBus.connect(master);
  musicBus.connect(master);
  master.connect(comp);
  comp.connect(ac.destination);
  applyVolumes(true);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ac;
}

function applyVolumes(instant = false) {
  if (!ac) return;
  const set = (node, v) => (instant ? (node.gain.value = v) : node.gain.setTargetAtTime(v, ac.currentTime, 0.05));
  set(master, settings.muted ? 0 : settings.master);
  set(sfxBus, settings.sfx);
  set(musicBus, settings.musicOn ? settings.music * 0.55 : 0);
}
onSettings(() => applyVolumes());

// Browsers only allow audio after a user gesture.
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(ev, () => {
    const first = !gestured;
    gestured = true;
    if (ensure() && ac.state === 'suspended' && !document.hidden) ac.resume();
    if (first) startHooks.splice(0).forEach((fn) => fn());
  }, { capture: true, passive: true });
}

// Pause everything while the tab is hidden (timers are throttled there, so music would stutter).
document.addEventListener('visibilitychange', () => {
  if (!ac) return;
  if (document.hidden) ac.suspend();
  else if (gestured) ac.resume();
});

/** The shared audio context + music bus, once the player has interacted with the page. */
export function audio() {
  if (!gestured || !ensure()) return null;
  return { ac, musicBus, noiseBuf };
}

/** Run fn once audio is allowed (right away if it already is). */
export function onAudioStart(fn) {
  if (gestured) fn();
  else startHooks.push(fn);
}

// ---------------------------------------------------------------------------
// building blocks
// ---------------------------------------------------------------------------

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

function out(node) {
  if (P) {
    const pan = ac.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, P));
    node.connect(pan);
    pan.connect(sfxBus);
  } else node.connect(sfxBus);
}

function envelope(g, t, attack, dur, vol) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * V), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
}

/** Oscillator with a pitch glide and an attack/decay envelope. */
function tone({ type = 'sine', f = 440, to = null, dur = 0.2, vol = 0.2, at = 0, attack = 0.005, lin = false, vib = null, lp = null, q = 1 }) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (to) lin ? osc.frequency.linearRampToValueAtTime(to, t + dur) : osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (vib) {
    const lfo = ac.createOscillator(), depth = ac.createGain();
    lfo.frequency.value = vib[0];
    depth.gain.value = vib[1];
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  const g = ac.createGain();
  envelope(g, t, attack, dur, vol);
  let node = osc;
  if (lp) {
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lp;
    filter.Q.value = q;
    node.connect(filter);
    node = filter;
  }
  node.connect(g);
  out(g);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Filtered white noise burst (whooshes, thuds, splashes, crackles). */
function noise({ type = 'lowpass', f = 1000, to = null, q = 1, dur = 0.2, vol = 0.2, at = 0, attack = 0.004 }) {
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rnd(0.9, 1.1);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(f, t);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  filter.Q.value = q;
  const g = ac.createGain();
  envelope(g, t, attack, dur, vol);
  src.connect(filter);
  filter.connect(g);
  out(g);
  const offset = Math.random() * 1.5;
  src.start(t, offset);
  src.stop(t + dur + 0.05);
}

/** Play a list of MIDI notes one after another. */
function seq(notes, { step = 0.1, dur = 0.2, type = 'triangle', vol = 0.12, at = 0, attack = 0.005 } = {}) {
  notes.forEach((n, i) => {
    if (n == null) return;
    for (const m of [].concat(n)) tone({ type, f: midi(m), dur, vol, at: at + i * step, attack });
  });
}

/** Soft plucked/piano-ish note. */
function pluck(n, at = 0, vol = 0.14, dur = 0.5) {
  tone({ type: 'triangle', f: midi(n), dur, vol, at, attack: 0.004 });
  tone({ type: 'sine', f: midi(n + 12), dur: dur * 0.5, vol: vol * 0.35, at, attack: 0.004 });
}

const bell = (n, at = 0, vol = 0.1, dur = 0.8) => {
  tone({ type: 'sine', f: midi(n), dur, vol, at });
  tone({ type: 'sine', f: midi(n) * 2.76, dur: dur * 0.4, vol: vol * 0.3, at });
};

const coin = (at = 0, vol = 1) => {
  tone({ type: 'square', f: 988, dur: 0.07, vol: 0.05 * vol, at, lp: 5000 });
  tone({ type: 'square', f: 1319, dur: 0.32, vol: 0.05 * vol, at: at + 0.065, lp: 5000 });
};

const thud = (at = 0, vol = 1, f = 150) => {
  tone({ f, to: f * 0.4, dur: 0.14, vol: 0.3 * vol, at });
  noise({ f: 700, dur: 0.07, vol: 0.14 * vol, at });
};

const boom = (at = 0, vol = 1, len = 0.8) => {
  noise({ f: 1400, to: 80, dur: len, vol: 0.4 * vol, at, q: 0.6 });
  tone({ f: 110, to: 32, dur: len * 0.8, vol: 0.4 * vol, at });
};

const whoosh = (at = 0, vol = 1, from = 400, to = 2600, dur = 0.28) => noise({ type: 'bandpass', f: from, to, q: 1.2, dur, vol: 0.18 * vol, at, attack: dur * 0.3 });

const sparkle = (at = 0, vol = 1, count = 7) => {
  const scale = [84, 86, 88, 91, 93, 96, 98, 100];
  for (let i = 0; i < count; i++) tone({ f: midi(scale[i % scale.length]), dur: 0.22, vol: 0.05 * vol, at: at + i * 0.045 });
  noise({ type: 'highpass', f: 6000, dur: 0.4, vol: 0.04 * vol, at, attack: 0.05 });
};

const fanfare = (at = 0, vol = 1) => {
  seq([67, 72, 76], { step: 0.1, dur: 0.16, type: 'square', vol: 0.05 * vol, at });
  seq([[72, 76, 79, 84]], { dur: 0.7, type: 'triangle', vol: 0.09 * vol, at: at + 0.32 });
  tone({ type: 'sawtooth', f: midi(84), dur: 0.7, vol: 0.03 * vol, at: at + 0.32, lp: 2400 });
};

const sad = (at = 0, vol = 1) => {
  [67, 66, 65].forEach((n, i) => tone({ type: 'triangle', f: midi(n), dur: 0.26, vol: 0.12 * vol, at: at + i * 0.28 }));
  tone({ type: 'triangle', f: midi(64), to: midi(62), dur: 0.8, vol: 0.12 * vol, at: at + 0.84, vib: [6, 6] });
};

const cheer = (at = 0, vol = 1) => {
  noise({ type: 'bandpass', f: 1400, q: 0.6, dur: 1.4, vol: 0.12 * vol, at, attack: 0.25 });
  noise({ type: 'bandpass', f: 2600, q: 0.8, dur: 1.1, vol: 0.06 * vol, at: at + 0.1, attack: 0.2 });
};

const tick = (at = 0, vol = 1, f = 2200) => {
  tone({ type: 'square', f, dur: 0.012, vol: 0.03 * vol, at });
  noise({ type: 'bandpass', f: 3200, q: 2, dur: 0.015, vol: 0.05 * vol, at });
};

// ---------------------------------------------------------------------------
// the sound library
// ---------------------------------------------------------------------------

const SOUNDS = {
  // ---- interface ----
  click: () => { tone({ type: 'triangle', f: 1300, to: 900, dur: 0.045, vol: 0.07 }); },
  hover: () => { tone({ f: 1800, dur: 0.02, vol: 0.02 }); },
  open: () => { tone({ f: 380, to: 920, dur: 0.16, vol: 0.1 }); whoosh(0, 0.35, 700, 3000, 0.18); },
  close: () => { tone({ f: 820, to: 330, dur: 0.14, vol: 0.08 }); },
  pop: () => { tone({ type: 'triangle', f: 620, to: 1150, dur: 0.08, vol: 0.1 }); },
  notify: () => { bell(81, 0, 0.07, 0.3); bell(88, 0.09, 0.07, 0.45); },
  error: () => { tone({ type: 'square', f: 220, dur: 0.09, vol: 0.05, lp: 1500 }); tone({ type: 'square', f: 175, dur: 0.16, vol: 0.05, at: 0.1, lp: 1500 }); },
  chat: () => { tone({ f: 1150, to: 1500, dur: 0.06, vol: 0.07 }); tone({ f: 1650, dur: 0.06, vol: 0.05, at: 0.06 }); },
  coin: () => coin(),
  coins: (o) => { const n = Math.min(12, o.n ?? 6); for (let i = 0; i < n; i++) coin(i * rnd(0.06, 0.11), 0.8); },
  levelup: () => {
    seq([72, 76, 79, 84], { step: 0.09, dur: 0.22, type: 'square', vol: 0.045 });
    seq([[72, 76, 79, 84, 88]], { dur: 1.1, type: 'triangle', vol: 0.08, at: 0.38 });
    sparkle(0.4, 1.2, 10);
  },
  unlock: () => { sparkle(0, 1.3, 9); bell(88, 0.42, 0.08, 0.9); bell(93, 0.5, 0.06, 0.9); },
  buy: () => {
    noise({ type: 'bandpass', f: 3000, q: 3, dur: 0.05, vol: 0.2 });
    tone({ type: 'square', f: 180, dur: 0.05, vol: 0.05, at: 0.02, lp: 900 });
    bell(91, 0.07, 0.1, 0.7);
    bell(96, 0.07, 0.07, 0.7);
  },
  daily: () => { seq([84, 88, 91, 96], { step: 0.08, dur: 0.3, type: 'sine', vol: 0.09 }); noise({ type: 'highpass', f: 7000, dur: 0.5, vol: 0.05, attack: 0.02 }); coin(0.35); },
  gift: () => { whoosh(0, 0.8, 300, 2800, 0.3); coin(0.26); coin(0.36, 0.7); },
  whoosh: () => whoosh(),
  swap: () => { whoosh(0, 0.5, 900, 2400, 0.16); tone({ type: 'triangle', f: 700, to: 1000, dur: 0.08, vol: 0.06 }); },

  // ---- world ----
  step: (o) => {
    if (o.surface === 'stone') {
      noise({ type: 'bandpass', f: rnd(1500, 2200), q: 1.5, dur: 0.05, vol: 0.09 });
      tone({ f: rnd(110, 140), to: 70, dur: 0.05, vol: 0.06 });
    } else {
      noise({ f: rnd(500, 850), dur: 0.08, vol: 0.14 });
      noise({ type: 'highpass', f: 4000, dur: 0.05, vol: 0.02 });
    }
  },
  jump: () => { tone({ f: 260, to: 640, dur: 0.18, vol: 0.12 }); },
  land: () => { noise({ f: 420, dur: 0.1, vol: 0.16 }); },
  near: () => { bell(91, 0, 0.035, 0.35); },
  enter: () => { noise({ f: 300, dur: 0.08, vol: 0.2 }); tone({ f: 140, to: 90, dur: 0.08, vol: 0.12 }); whoosh(0.08, 0.5, 500, 2000, 0.25); },
  bird: () => {
    const base = rnd(2400, 3400), n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) tone({ f: base, to: base * rnd(1.15, 1.4), dur: 0.07, vol: 0.03, at: i * 0.11 });
  },
  online: () => { bell(84, 0, 0.05, 0.4); bell(91, 0.1, 0.05, 0.5); },
  emote_wave: () => { tone({ f: 1250, to: 1850, dur: 0.12, vol: 0.06 }); tone({ f: 1850, to: 1300, dur: 0.18, vol: 0.06, at: 0.14, vib: [9, 30] }); },
  emote_laugh: () => { for (let i = 0; i < 4; i++) tone({ type: 'sawtooth', f: 330 - i * 12, to: 250, dur: 0.08, vol: 0.06, at: i * 0.12, lp: 1100, q: 4 }); },
  emote_heart: () => { bell(84, 0, 0.06, 0.6); bell(88, 0.08, 0.06, 0.6); bell(91, 0.16, 0.06, 0.9); },
  emote_fire: () => { noise({ f: 300, to: 2400, dur: 0.5, vol: 0.2, attack: 0.1 }); for (let i = 0; i < 5; i++) noise({ type: 'highpass', f: 2500, dur: 0.02, vol: 0.08, at: 0.1 + Math.random() * 0.4 }); },
  emote_gg: () => { tone({ type: 'sawtooth', f: midi(72), dur: 0.14, vol: 0.06, lp: 2200 }); tone({ type: 'sawtooth', f: midi(79), dur: 0.4, vol: 0.06, at: 0.16, lp: 2200, vib: [6, 4] }); },
  emote_wow: () => { tone({ f: 280, to: 880, dur: 0.45, vol: 0.1, vib: [6, 16] }); },

  // ---- racing ----
  beep: () => { tone({ type: 'square', f: 440, dur: 0.2, vol: 0.07, lp: 3000 }); },
  go: () => { tone({ type: 'square', f: 880, dur: 0.55, vol: 0.08, lp: 3500 }); },
  engine: (o) => { const f = 70 + (o.speed ?? 0) * 11; tone({ type: 'sawtooth', f, to: f * 1.35, dur: 0.09, vol: 0.05, lp: 900, q: 2 }); },
  finish: () => { fanfare(0, 0.9); cheer(0.1, 0.8); },
  cheer: () => cheer(),

  // ---- arena + boss combat ----
  shoot: () => { tone({ type: 'square', f: 1400, to: 280, dur: 0.09, vol: 0.035, lp: 4000 }); noise({ type: 'highpass', f: 3000, dur: 0.03, vol: 0.04 }); },
  shoot_far: () => { tone({ type: 'square', f: 1200, to: 300, dur: 0.07, vol: 0.012, lp: 3000 }); },
  hit: () => { noise({ type: 'bandpass', f: 1300, dur: 0.06, vol: 0.15 }); tone({ f: 220, to: 80, dur: 0.08, vol: 0.12 }); },
  hurt: () => { tone({ type: 'sawtooth', f: 190, to: 85, dur: 0.22, vol: 0.09, lp: 900 }); noise({ f: 900, dur: 0.12, vol: 0.14 }); },
  ko: () => boom(0, 0.8, 0.7),
  dash: () => whoosh(0, 0.9, 600, 3400, 0.18),
  spawn: () => { tone({ f: 380, to: 1600, dur: 0.35, vol: 0.07 }); sparkle(0.15, 0.6, 5); },
  win: () => { fanfare(); cheer(0.2); coin(0.5); coin(0.6); },
  lose: () => sad(),
  bullseye: () => { thud(0, 1, 170); bell(91, 0.05, 0.1, 0.8); bell(96, 0.05, 0.06, 0.8); cheer(0.12, 0.7); },

  // ---- archery ----
  draw: () => { noise({ type: 'bandpass', f: 250, to: 900, q: 4, dur: 0.55, vol: 0.06, attack: 0.2 }); tone({ type: 'sawtooth', f: 55, to: 80, dur: 0.5, vol: 0.02, lp: 400, attack: 0.2 }); },
  twang: () => { tone({ type: 'triangle', f: 190, to: 120, dur: 0.28, vol: 0.2, vib: [30, 10] }); noise({ type: 'highpass', f: 2000, dur: 0.04, vol: 0.08 }); },
  arrow: () => whoosh(0, 0.6, 2400, 700, 0.35),
  thud: () => thud(),
  miss: () => { noise({ type: 'bandpass', f: 900, dur: 0.15, vol: 0.05 }); noise({ f: 350, dur: 0.1, vol: 0.08, at: 0.04 }); },

  // ---- fishing ----
  charge: () => { tone({ f: 300, to: 700, dur: 0.6, vol: 0.03, attack: 0.3 }); },
  cast: () => { whoosh(0, 0.8, 500, 2600, 0.3); for (let i = 0; i < 10; i++) tick(0.12 + i * 0.035, 0.7, 2600); },
  splash: () => { noise({ f: 1600, to: 250, dur: 0.38, vol: 0.28 }); tone({ f: 520, to: 140, dur: 0.12, vol: 0.12 }); },
  plop: () => { tone({ f: 700, to: 200, dur: 0.09, vol: 0.12 }); noise({ f: 900, dur: 0.12, vol: 0.08 }); },
  bite: () => { tone({ f: 420, to: 240, dur: 0.1, vol: 0.2 }); tone({ f: 420, to: 240, dur: 0.1, vol: 0.2, at: 0.14 }); bell(93, 0.05, 0.08, 0.3); },
  hook: () => { tone({ type: 'sawtooth', f: 200, to: 1300, dur: 0.15, vol: 0.06, lp: 2500 }); noise({ f: 1400, to: 300, dur: 0.2, vol: 0.12 }); },
  reel: () => tick(0, 0.8, 2400),
  treasure: () => { sparkle(0, 1.2, 8); coin(0.3); },
  catch: (o) => {
    const tier = { junk: 0, common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 4 }[o.rarity] ?? 1;
    if (tier === 0) { tone({ type: 'triangle', f: 330, to: 220, dur: 0.3, vol: 0.1 }); return; }
    seq([72, 76, 79], { step: 0.08, dur: 0.18, vol: 0.1 });
    if (tier >= 2) fanfare(0.25, 0.8);
    if (tier >= 3) sparkle(0.5, 1.3, 10);
    if (tier >= 4) { cheer(0.4); bell(96, 0.9, 0.1, 1.2); }
  },
  escape: () => { tone({ type: 'triangle', f: 600, to: 180, dur: 0.5, vol: 0.12, vib: [7, 12] }); noise({ f: 900, dur: 0.2, vol: 0.1 }); },

  // ---- casino ----
  lever: () => { noise({ f: 450, dur: 0.12, vol: 0.28 }); tone({ f: 110, to: 50, dur: 0.15, vol: 0.2 }); for (let i = 0; i < 5; i++) tick(i * 0.03, 1, 1600); },
  reeltick: () => tick(0, 1, 1100),
  reelstop: () => { noise({ type: 'bandpass', f: 1800, q: 2, dur: 0.05, vol: 0.2 }); tone({ f: 320, to: 200, dur: 0.06, vol: 0.12 }); },
  wheeltick: () => tick(0, 1.3, 2000),
  flip: () => { bell(100, 0, 0.06, 0.4); bell(107, 0, 0.03, 0.25); whoosh(0, 0.4, 1200, 3000, 0.2); },
  jackpot: () => {
    seq([72, 76, 79, 84, 79, 84, 88], { step: 0.09, dur: 0.18, type: 'square', vol: 0.05 });
    seq([[72, 76, 79, 84, 91]], { dur: 1.4, type: 'triangle', vol: 0.09, at: 0.65 });
    for (let i = 0; i < 18; i++) coin(0.2 + i * 0.09, 0.8);
    cheer(0.4, 1.2);
  },
  wah: () => sad(0, 0.9),

  // ---- crates ----
  rattle: () => { for (let i = 0; i < 6; i++) noise({ f: rnd(500, 900), dur: 0.06, vol: 0.18, at: i * 0.08 }); },
  cratetick: () => tick(0, 0.9, 1500),
  reveal: (o) => {
    const tier = { common: 0, rare: 1, epic: 2, legendary: 3 }[o.rarity] ?? 0;
    whoosh(0, 0.6, 400, 3000, 0.25);
    if (tier === 0) seq([76, 81], { step: 0.08, dur: 0.25, vol: 0.1, at: 0.1 });
    if (tier >= 1) seq([72, 76, 79, 84], { step: 0.07, dur: 0.3, vol: 0.1, at: 0.1 });
    if (tier >= 2) sparkle(0.4, 1.3, 10);
    if (tier >= 3) { fanfare(0.5); cheer(0.6); }
  },

  // ---- boss ----
  roar: () => {
    tone({ type: 'sawtooth', f: 95, to: 52, dur: 1.3, vol: 0.2, lp: 650, q: 3, vib: [8, 10], attack: 0.08 });
    tone({ type: 'sawtooth', f: 142, to: 70, dur: 1.2, vol: 0.1, lp: 900, vib: [11, 8], attack: 0.1 });
    noise({ f: 600, to: 200, dur: 1.3, vol: 0.18, attack: 0.1 });
  },
  warn: () => { tone({ type: 'square', f: 660, dur: 0.07, vol: 0.035, lp: 2500 }); tone({ type: 'square', f: 660, dur: 0.07, vol: 0.035, at: 0.1, lp: 2500 }); },
  slam: () => boom(0, 0.85, 0.5),
  volley: () => { for (let i = 0; i < 3; i++) tone({ type: 'square', f: 900 - i * 80, to: 200, dur: 0.12, vol: 0.04, at: i * 0.04, lp: 3000 }); },
  charge_boss: () => { tone({ type: 'sawtooth', f: 55, to: 150, dur: 0.8, vol: 0.12, lp: 700, attack: 0.3 }); noise({ f: 300, to: 900, dur: 0.8, vol: 0.12, attack: 0.3 }); },
  bosshit: (o) => {
    tone({ f: 230, to: 140, dur: 0.05, vol: 0.07 });
    noise({ type: 'bandpass', f: 2600, dur: 0.02, vol: 0.06 });
    if (o.crit) bell(93, 0, 0.06, 0.25);
  },
  bossdie: () => { boom(0, 1.1, 1.4); boom(0.35, 0.7, 1); fanfare(1.1); cheer(1.2, 1.3); },
  down: () => { tone({ type: 'triangle', f: 500, to: 120, dur: 0.6, vol: 0.12 }); noise({ f: 700, dur: 0.3, vol: 0.12 }); },
  revive: () => { tone({ f: 300, to: 1200, dur: 0.5, vol: 0.08 }); sparkle(0.3, 1, 7); },
  enrage: () => { SOUNDS.roar(); SOUNDS.warn(); tone({ type: 'square', f: 440, dur: 0.1, vol: 0.04, at: 0.3 }); },

  // ---- arcade ----
  boing: () => { tone({ type: 'triangle', f: 300, to: 900, dur: 0.14, vol: 0.08 }); },
  start: () => { seq([72, 76, 79, 84], { step: 0.07, dur: 0.12, type: 'square', vol: 0.05 }); },
  tick: () => { tone({ type: 'square', f: 1200, dur: 0.02, vol: 0.04, lp: 4000 }); },

  // ---- bumps and boosts (racing, arena) ----
  bonk: (o) => {
    const k = Math.min(1, (o.power ?? 1));
    tone({ type: 'triangle', f: 160 + k * 60, to: 420 + k * 200, dur: 0.12, vol: 0.12 + k * 0.1 });
    tone({ f: 90, to: 50, dur: 0.12, vol: 0.2 * k + 0.08 });
    noise({ f: 900, dur: 0.05, vol: 0.1 });
  },
  fall: () => { tone({ f: 900, to: 180, dur: 0.7, vol: 0.08, vib: [10, 20] }); SOUNDS.splash(); noise({ f: 700, to: 150, dur: 0.6, vol: 0.18, at: 0.6 }); },
  boost: () => { whoosh(0, 1, 300, 2600, 0.25); tone({ type: 'sawtooth', f: 120, to: 420, dur: 0.25, vol: 0.05, lp: 1500 }); },
  powerup: () => { seq([72, 79, 84, 88], { step: 0.05, dur: 0.14, type: 'square', vol: 0.05 }); sparkle(0.12, 0.8, 5); },
  shield: () => { tone({ f: 500, to: 1400, dur: 0.3, vol: 0.07, vib: [18, 30] }); bell(96, 0.1, 0.05, 0.6); },

  // ---- doodle ----
  brush: () => { noise({ type: 'bandpass', f: rnd(2500, 4000), q: 2, dur: 0.05, vol: 0.025 }); },
  correct: () => { seq([79, 84, 88], { step: 0.07, dur: 0.2, type: 'triangle', vol: 0.12 }); coin(0.2); sparkle(0.2, 0.7, 5); },
  guessed: () => { bell(88, 0, 0.06, 0.4); bell(93, 0.08, 0.05, 0.4); },
  close: () => { tone({ type: 'triangle', f: 520, to: 640, dur: 0.12, vol: 0.08 }); tone({ type: 'triangle', f: 520, to: 640, dur: 0.12, vol: 0.08, at: 0.14 }); },
  urgent: () => { tone({ type: 'square', f: 1100, dur: 0.05, vol: 0.035, lp: 3000 }); },
  newturn: () => { whoosh(0, 0.5); seq([67, 72, 76], { step: 0.08, dur: 0.18, type: 'triangle', vol: 0.1 }); },

  // ---- roulette ----
  chip: () => { noise({ type: 'bandpass', f: 3200, q: 3, dur: 0.03, vol: 0.18 }); noise({ type: 'bandpass', f: 2600, q: 3, dur: 0.03, vol: 0.12, at: 0.05 }); },
  ball: () => { tone({ type: 'triangle', f: rnd(2400, 3000), dur: 0.02, vol: 0.05 }); },

  // ---- houses ----
  place: () => { tone({ f: 190, to: 90, dur: 0.1, vol: 0.2 }); noise({ f: 650, dur: 0.06, vol: 0.12 }); },
  pickup: () => { tone({ f: 320, to: 640, dur: 0.08, vol: 0.1 }); },
  store: () => { tone({ f: 640, to: 240, dur: 0.12, vol: 0.1 }); whoosh(0, 0.3, 2000, 600, 0.12); },
  rotate: () => { tick(0, 1.5, 1400); whoosh(0.02, 0.3, 800, 1800, 0.1); },
  paint: () => { noise({ type: 'bandpass', f: 1800, q: 0.6, dur: 0.35, vol: 0.08, attack: 0.08 }); whoosh(0.05, 0.4); },
  knock: () => { for (const at of [0, 0.16]) { noise({ f: 280, dur: 0.07, vol: 0.3, at }); tone({ f: 140, to: 100, dur: 0.07, vol: 0.18, at }); } },
  like: () => { SOUNDS.emote_heart(); sparkle(0.2, 0.6, 5); },
  switch: () => { noise({ type: 'bandpass', f: 2500, q: 3, dur: 0.02, vol: 0.2 }); tone({ type: 'square', f: 900, dur: 0.015, vol: 0.03 }); },
  tv: () => { noise({ type: 'highpass', f: 1500, dur: 0.25, vol: 0.06 }); tone({ type: 'square', f: 1000, dur: 0.08, vol: 0.03, at: 0.2 }); },
  piano: () => {
    const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79];
    let i = Math.floor(Math.random() * 4);
    for (let k = 0; k < 8; k++) {
      i = Math.max(0, Math.min(scale.length - 1, i + Math.floor(rnd(-2, 3))));
      pluck(scale[i], k * 0.16, 0.12, 0.6);
      if (k % 4 === 0) pluck(scale[i] - 12, k * 0.16, 0.08, 0.9);
    }
  },
  jukebox: () => {
    const mel = [72, 74, 76, 79, 76, 74, 72, null, 69, 72, 74, 72, 69, 67, 69, null];
    const bass = [48, 48, 45, 45, 41, 41, 43, 43];
    mel.forEach((n, i) => { if (n) pluck(n, i * 0.15, 0.09, 0.28); });
    bass.forEach((n, i) => tone({ type: 'sine', f: midi(n), dur: 0.28, vol: 0.12, at: i * 0.3 }));
    for (let i = 0; i < 16; i++) noise({ type: 'highpass', f: 7000, dur: 0.03, vol: i % 4 === 2 ? 0.05 : 0.02, at: i * 0.15 });
  },
  arcade: () => {
    for (let i = 0; i < 8; i++) tone({ type: 'square', f: midi(72 + [0, 4, 7, 12, 7, 4, 12, 16][i]), dur: 0.06, vol: 0.035, at: i * 0.07 });
    tone({ type: 'square', f: 1600, to: 200, dur: 0.3, vol: 0.03, at: 0.6 });
  },
  crackle: () => { noise({ f: 500, dur: 1.2, vol: 0.05, attack: 0.2 }); for (let i = 0; i < 12; i++) noise({ type: 'highpass', f: rnd(2000, 5000), dur: 0.015, vol: rnd(0.04, 0.12), at: Math.random() * 1.3 }); },
  bubbles: () => { for (let i = 0; i < 7; i++) { const f = rnd(500, 1100); tone({ f, to: f * 1.8, dur: 0.06, vol: 0.06, at: i * rnd(0.06, 0.14) }); } },
  clock: () => { tick(0, 1.4, 1800); tick(0.5, 1.4, 1300); bell(84, 1, 0.07, 1); bell(79, 1.5, 0.07, 1.2); },
  trophy: () => { fanfare(0, 0.7); sparkle(0.3, 0.8, 6); },
  squish: () => { noise({ f: 500, to: 180, dur: 0.22, vol: 0.14 }); tone({ f: 160, to: 110, dur: 0.15, vol: 0.06 }); },
  rustle: () => { for (let i = 0; i < 4; i++) noise({ type: 'highpass', f: 3000, dur: 0.08, vol: 0.05, at: i * 0.05 }); },
  snore: () => { noise({ f: 350, dur: 0.9, vol: 0.12, attack: 0.4 }); tone({ f: 900, to: 1400, dur: 0.5, vol: 0.03, at: 1.1 }); },
};

// Minimum gap between repeats of spammy sounds (seconds).
const THROTTLE = { brush: 0.06, ball: 0.03, bonk: 0.08, urgent: 0.3, chip: 0.04, step: 0.05, reeltick: 0.03, wheeltick: 0.02, reel: 0.05, cratetick: 0.03, shoot_far: 0.05, bosshit: 0.04, hit: 0.03, click: 0.03, pop: 0.08, coin: 0.05, chat: 0.1, engine: 0.03, hover: 0.04 };

/** Play a named sound. opts: vol (0..1 multiplier), pan (-1..1), plus sound-specific options. */
export function sfx(name, opts = {}) {
  if (!gestured || settings.muted || settings.sfx <= 0 || !SOUNDS[name] || !ensure() || ac.state === 'closed') return;
  const now = performance.now() / 1000;
  if (THROTTLE[name] && now - (lastPlayed[name] ?? 0) < THROTTLE[name]) return;
  lastPlayed[name] = now;
  V = opts.vol ?? 1;
  P = opts.pan ?? 0;
  if (V <= 0.01) return;
  try { SOUNDS[name](opts); } catch (e) { if (window.FZ_DEBUG_SOUND) console.warn('sound failed:', name, e); } // never let a sound break the game
  V = 1;
  P = 0;
}

/** Rain: a soft hiss of drops, a low rumble underneath, and the odd close patter. */
function rainAmbient() {
  let nodes = null, stopped = false, level = 0, timer = 0;
  const start = () => {
    if (nodes || stopped || !gestured || !ensure()) return;
    const mk = (type, f, q) => {
      const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(fl); fl.connect(g); g.connect(sfxBus); src.start();
      return { src, g };
    };
    nodes = [mk('bandpass', 2600, 0.35), mk('lowpass', 380, 0.7)];
    // close raindrops pattering on things
    timer = setInterval(() => {
      if (level < 0.05 || !nodes) return;
      for (let i = 0; i < 3; i++) if (Math.random() < level) noise({ type: 'bandpass', f: rnd(2500, 6000), q: 3, dur: 0.02, vol: 0.02 * level, at: Math.random() * 0.1 });
    }, 110);
  };
  return {
    set(v) {
      start();
      level = Math.max(0, v);
      if (!nodes) return;
      nodes[0].g.gain.setTargetAtTime(level * 0.09, ac.currentTime, 0.4);
      nodes[1].g.gain.setTargetAtTime(level * 0.07, ac.currentTime, 0.4);
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      nodes?.forEach((n) => { try { n.src.stop(); } catch { /* already stopped */ } });
      nodes = null;
    },
  };
}

/** Looping ambience; returns { set(volume), stop() }. */
export function ambient(kind) {
  if (kind === 'rain') return rainAmbient();
  let src = null, gain = null, stopped = false;
  const start = () => {
    if (src || stopped || !gestured || !ensure()) return;
    src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = kind === 'fountain' ? 'lowpass' : 'bandpass';
    filter.frequency.value = kind === 'cave' ? 260 : kind === 'fire' ? 600 : 750;
    filter.Q.value = kind === 'cave' ? 0.8 : 0.4;
    gain = ac.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start();
  };
  return {
    set(v) {
      start();
      if (gain) gain.gain.setTargetAtTime(Math.max(0, v) * 0.1, ac.currentTime, 0.15);
    },
    stop() {
      stopped = true;
      try { src?.stop(); } catch { /* already stopped */ }
      src = null;
    },
  };
}

export const SOUND_NAMES = Object.keys(SOUNDS);
