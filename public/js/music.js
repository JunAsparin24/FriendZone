// Background music: a tiny step sequencer playing synthesized songs (drums, bass, chords, arps and
// a lead), so there are no audio files. The main playlist shuffles and cycles; fights switch to
// battle tracks. Melodies are written as scale degrees so they always stay in key:
//   1-7 = degree in the lead octave, q w e r t y u = one octave up, z x c v b n m = one octave down,
//   '-' = hold the previous note, '.' = rest. One token per 16th note, 16 per bar.
import { audio, onAudioStart } from './sfx.js';
import { settings, onSettings } from './settings.js';

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10],
};
const HOUSE = { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' };

const SONGS = [
  {
    name: 'Sunny Plaza', bpm: 124, root: 60, scale: 'major', chords: ['1', '5', '6', '4'],
    drums: { ...HOUSE, o: '..............x.' }, bass: 'x.o.x.o.x.o.x.o.', chordRhythm: '..x...x...x...x.', chordType: 'stab',
    arp: 'x.xxx.xxx.xxx.x.', leadType: 'square',
    lead: [
      '3 . 5 . q . 5 3 - . 2 . 3 . 5 .', '7 . 5 . 2 . 5 7 - . 6 . 5 . 2 .', '6 . q . 3 . q 6 - . 5 . 3 . 1 .', '4 . 6 . q . 6 4 - . 3 . 2 . - .',
      'q . - . 7 . q . 5 . - . 3 . 5 .', '2 . - . 7 . 5 . 7 . q . 2 . - .', '3 . - . 2 . q . 6 . 5 . 3 . 5 .', '4 . 3 . 2 . 1 . 2 . - . - . . .',
    ],
    form: [[4, 'khc'], [8, 'kshbcl'], [8, 'kshobcal'], [4, 'hca'], [8, 'kshobcal'], [4, 'kshbc']],
  },
  {
    // light and bouncy: no pumping bass line, just plucks and a soft groove
    name: 'Lemonade Stand', bpm: 120, root: 64, scale: 'major', chords: ['1', '4', '6', '5'],
    drums: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.', p: '' }, bass: 'x.......x.......', bassType: 'soft',
    chordRhythm: 'x..x..x.x..x..x.', chordType: 'pluck', arp: '..x...x...x...x.', leadType: 'triangle', leadOct: 0,
    lead: [
      '3 . 5 . q . - . 7 . q . 5 . - .', '4 . 6 . q . - . 6 . 5 . 4 . - .', '6 . 5 . 3 . 5 . 6 . q . w . - .', '5 . - . 2 . 5 . 7 . - . 5 . - .',
      'q . 7 . 6 . 5 . 3 . - . 5 . 6 .', '4 . 6 . q . 6 . 4 . - . 3 . 2 .', '3 . 5 . 6 . q . w . q . 6 . 5 .', '5 . - . - . 7 . q . - . - . . .',
    ],
    form: [[4, 'hca'], [8, 'kshbcl'], [8, 'kshbcal'], [4, 'hcal'], [8, 'kshbcal'], [4, 'hcb']],
  },
  {
    name: 'Kart Party', bpm: 150, root: 62, scale: 'mixo', chords: ['1', '7', '4', '1'],
    drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bass: 'x.x.o.x.x.x.o.x.',
    chordRhythm: 'x..x..x...x..x..', chordType: 'stab', arp: null, leadType: 'saw',
    lead: [
      '1 . 3 . 5 . 3 . 1 . 3 . 5 . q .', '7 . 4 . 2 . 4 . 7 . - . 4 . - .', '6 . 4 . q . 6 . 4 . 2 . 1 . - .', '5 . 3 . 1 . 3 . 5 . - . - . . .',
      'q . q . 7 . q . 5 . 3 . 5 . q .', '7 . 7 . 4 . 7 . w . - . 7 . - .', '6 . 6 . q . 6 . 4 . 6 . q . w .', 'q . - . 5 . - . 3 . - . 1 . - .',
    ],
    form: [[4, 'khb'], [8, 'kshbcl'], [8, 'kshbcl'], [4, 'khc'], [8, 'kshbcl'], [4, 'kshbc']],
  },
  {
    name: 'Beach Hop', bpm: 112, root: 55, scale: 'major', chords: ['1', '3', '4', '5'],
    drums: { k: 'x...x...x...x...', s: '...x..x....x..x.', h: '..x...x...x...x.', o: '' }, bass: 'x..o..x.x..o..x.',
    chordRhythm: 'x..x..x...x.x...', chordType: 'pluck', arp: null, leadType: 'pluck', leadOct: 24,
    lead: [
      '1 . 3 . 5 . 3 . q . - . 5 . 3 .', '3 . 5 . 7 . 5 . 3 . - . 2 . 3 .', '4 . 6 . q . 6 . 4 . 3 . 4 . 6 .', '5 . 7 . w . 7 . 5 . - . 4 . 2 .',
      'q . 7 . q . 5 . 3 . 5 . q . w .', 'e . w . 7 . 5 . 3 . - . 5 . - .', '6 . q . 6 . 4 . 6 . q . e . - .', 'w . 7 . 5 . 7 . w . - . - . . .',
    ],
    form: [[4, 'khc'], [8, 'kshbcl'], [8, 'kshbcl'], [4, 'shc'], [8, 'kshbcl'], [4, 'khbc']],
  },
  {
    name: 'Friends Forever', bpm: 132, root: 65, scale: 'major', chords: ['1', '6', '2', '5'],
    drums: { ...HOUSE, p: '....x.......x...' }, bass: 'x.x.o.x.x.x.o.x.', chordRhythm: 'x...............', chordType: 'pad',
    arp: 'x.xxx.xxx.xxx.xx', leadType: 'triangle', leadOct: 0,
    lead: [
      '5 . 6 . 5 . 3 . 1 . 3 . 5 . - .', '6 . - . 5 . 6 . q . - . 6 . 5 .', '4 . 2 . 4 . 6 . 5 . 4 . 2 . - .', '7 . 5 . 2 . 5 . 7 . - . - . . .',
      'q . - . 7 . q . w . q . 5 . - .', '6 . - . q . 6 . 5 . 3 . 5 . 6 .', '4 . 5 . 6 . 4 . 2 . 4 . 6 . w .', 'q . - . 7 . - . 5 . - . 2 . - .',
    ],
    form: [[4, 'hca'], [8, 'khpbcal'], [8, 'kshpbcal'], [4, 'ca'], [8, 'kshpbcal'], [4, 'khbca']],
  },
  // ---- battle tracks ----
  {
    name: 'Boss Rumble', battle: true, bpm: 152, root: 52, scale: 'minor', chords: ['1', '6', '7', '1'],
    drums: { k: 'x.x...x.x.x...x.', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' }, bass: 'x.x.o.x.x.x.o.x.', bassType: 'square',
    chordRhythm: 'x.......x.......', chordType: 'pad', arp: 'xxxxxxxxxxxxxxxx', leadType: 'square',
    lead: [
      '1 . 1 . 5 . 3 . 1 . 3 . 5 . 7 .', 'q . - . 7 . 6 . 3 . - . 6 . 7 .', 'w . - . q . 7 . 4 . - . 2 . 4 .', '3 . 2 . 1 . - . 5 . - . 1 . - .',
      'q . w . e . w . q . 7 . 5 . 7 .', 'q . 7 . 6 . 3 . 6 . 7 . q . w .', 'e . - . w . q . 7 . - . w . q .', '7 . - . 5 . - . 3 . 2 . 1 . - .',
    ],
    form: [[4, 'khba'], [8, 'kshbcl'], [8, 'kshbcal'], [4, 'kbca'], [8, 'kshbcal']],
  },
  {
    name: 'Bumper Blitz', battle: true, bpm: 160, root: 60, scale: 'minor', chords: ['1', '4', '6', '5'],
    drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' }, bass: 'xoxoxoxoxoxoxoxo', bassType: 'saw',
    chordRhythm: '..x...x...x...x.', chordType: 'stab', arp: null, leadType: 'saw', leadOct: 0,
    lead: [
      '5 . 5 . q . 5 . 3 . 5 . 7 . q .', '6 . 6 . q . 6 . 4 . 6 . q . - .', '3 . 3 . 6 . 3 . q . 7 . 6 . 3 .', '2 . 5 . 7 . 5 . 2 . - . 7 . 5 .',
      'q . - . 7 . q . w . - . q . 7 .', 'q . - . 6 . 4 . 6 . - . q . - .', '6 . q . e . q . 6 . 5 . 3 . 6 .', '5 . - . 7 . - . w . - . 5 . - .',
    ],
    form: [[4, 'khob'], [8, 'kshobcl'], [8, 'kshobcl'], [4, 'kbc'], [8, 'kshobcl']],
  },
];

const PLAYLISTS = {
  main: SONGS.filter((s) => !s.battle),
  battle: SONGS.filter((s) => s.battle),
};
const FILL = '....x...x.x.xxxx';

// ---------------------------------------------------------------------------
// instruments (all scheduled at an exact audio time into the song's gain node)
// ---------------------------------------------------------------------------

const hz = (n) => 440 * 2 ** ((n - 69) / 12);

function voice(A, dest, t, { type = 'square', f, dur, vol, attack = 0.005, release = 0.06, lp = null, q = 1, detune = 0, vib = 0, to = null }) {
  const { ac } = A;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  osc.detune.value = detune;
  if (vib) {
    const lfo = ac.createOscillator(), depth = ac.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(vib, t + Math.min(0.25, dur));
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + release + 0.05);
  }
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, dur) + release);
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
  g.connect(dest);
  osc.start(t);
  osc.stop(t + Math.max(attack, dur) + release + 0.05);
}

function hiss(A, dest, t, { type = 'highpass', f = 7000, dur = 0.04, vol = 0.1, q = 1 }) {
  const { ac, noiseBuf } = A;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = f;
  filter.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

const DRUMS = {
  k: (A, d, t, accent) => {
    voice(A, d, t, { type: 'sine', f: 170, to: 60, dur: 0.1, vol: accent ? 0.5 : 0.42, attack: 0.002, release: 0.08 });
    hiss(A, d, t, { type: 'lowpass', f: 2200, dur: 0.012, vol: 0.1 });
  },
  s: (A, d, t) => {
    hiss(A, d, t, { type: 'bandpass', f: 1900, q: 0.8, dur: 0.17, vol: 0.34 });
    voice(A, d, t, { type: 'triangle', f: 200, to: 150, dur: 0.06, vol: 0.18, release: 0.05 });
  },
  p: (A, d, t) => { for (let i = 0; i < 3; i++) hiss(A, d, t + i * 0.011, { type: 'bandpass', f: 1300, q: 1.2, dur: i === 2 ? 0.14 : 0.02, vol: 0.2 }); },
  h: (A, d, t, accent) => hiss(A, d, t, { f: 8000, dur: 0.035, vol: accent ? 0.09 : 0.055 }),
  o: (A, d, t) => hiss(A, d, t, { f: 6500, dur: 0.2, vol: 0.06 }),
};

const LEADS = {
  square: (A, d, t, f, dur) => voice(A, d, t, { type: 'square', f, dur, vol: 0.055, lp: 3600, vib: 5, release: 0.08 }),
  saw: (A, d, t, f, dur) => {
    voice(A, d, t, { type: 'sawtooth', f, dur, vol: 0.05, lp: 2600, q: 2, vib: 4, release: 0.08 });
    voice(A, d, t, { type: 'sawtooth', f, dur, vol: 0.03, lp: 2600, detune: 12, release: 0.08 });
  },
  triangle: (A, d, t, f, dur) => voice(A, d, t, { type: 'triangle', f, dur, vol: 0.13, vib: 6, release: 0.1 }),
  pluck: (A, d, t, f) => {
    voice(A, d, t, { type: 'triangle', f, dur: 0.02, vol: 0.14, release: 0.35 });
    voice(A, d, t, { type: 'sine', f: f * 2, dur: 0.01, vol: 0.04, release: 0.15 });
  },
};

// ---------------------------------------------------------------------------
// player
// ---------------------------------------------------------------------------

const TOKENS = (() => {
  const map = {};
  '1234567'.split('').forEach((c, i) => { map[c] = [i, 0]; });
  'qwertyu'.split('').forEach((c, i) => { map[c] = [i, 1]; });
  'zxcvbnm'.split('').forEach((c, i) => { map[c] = [i, -1]; });
  return map;
})();
const parseBar = (s) => s.split(/\s+/).filter(Boolean);

function degreeNote(song, deg, oct = 0) {
  const sc = SCALES[song.scale];
  return song.root + sc[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + oct);
}

function chordTones(song, symbol) {
  const deg = Number(symbol) - 1;
  let notes = [0, 2, 4].map((k) => degreeNote(song, deg + k));
  if (notes[0] > song.root + 6) notes = notes.map((n) => n - 12); // keep chords around the root
  return notes;
}

/** How many steps a note lasts: itself plus any '-' holds after it. */
function holdLength(tokens, i) {
  let n = 1;
  while (tokens[i + n] === '-') n++;
  return n;
}

let cur = null;              // the song that's playing
let timer = 0;
let context = 'main';
const queue = { main: [], battle: [] };
const listeners = new Set();

function nextSong() {
  const list = PLAYLISTS[context];
  if (!queue[context].length) {
    // reshuffle, never repeating the song that just ended
    const order = [...list].sort(() => Math.random() - 0.5);
    if (order.length > 1 && order[0] === cur?.song) order.push(order.shift());
    queue[context] = order;
  }
  return queue[context].shift();
}

function play(song) {
  const A = audio();
  if (!A) return;
  stopCurrent(1.2);
  const gain = A.ac.createGain();
  gain.gain.value = 0;
  gain.gain.linearRampToValueAtTime(1, A.ac.currentTime + 0.8);
  const shelf = A.ac.createBiquadFilter();
  shelf.type = 'lowshelf';
  shelf.frequency.value = 140;
  shelf.gain.value = -8;
  const hp = A.ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 55;
  gain.connect(shelf);
  shelf.connect(hp);
  hp.connect(A.musicBus);
  const bars = song.form.reduce((n, [b]) => n + b, 0);
  cur = { song, A, gain, next: A.ac.currentTime + 0.1, step: 0, bar: 0, bars, section: 0, sectionBar: 0, arpIdx: 0,
    lead: song.lead.map(parseBar) };
  listeners.forEach((fn) => fn(song.name));
  if (!timer) timer = setInterval(tick, 25);
}

function stopCurrent(fade = 0.6) {
  if (!cur) return;
  const { gain, A } = cur;
  const t = A.ac.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0, t + fade);
  setTimeout(() => gain.disconnect(), (fade + 0.5) * 1000);
  cur = null;
}

function tick() {
  if (!cur) { clearInterval(timer); timer = 0; return; }
  const { A } = cur;
  if (A.ac.state !== 'running') return;
  const now = A.ac.currentTime;
  if (cur.next < now - 0.3) cur.next = now + 0.05; // we fell behind (e.g. the tab was busy): skip ahead
  while (cur && cur.next < now + 0.15) {
    scheduleStep(cur, cur.next);
    advance();
  }
}

function advance() {
  const c = cur;
  c.next += 60 / c.song.bpm / 4;
  c.step += 1;
  if (c.step < 16) return;
  c.step = 0;
  c.bar += 1;
  c.sectionBar += 1;
  if (c.sectionBar >= c.song.form[c.section][0]) {
    c.sectionBar = 0;
    c.section += 1;
    if (c.section >= c.song.form.length) play(nextSong()); // song over: on to the next one
  }
}

function scheduleStep(c, t) {
  const { song, A, gain: d, step } = c;
  const [bars, parts] = song.form[c.section];
  const has = (p) => parts.includes(p);
  const stepDur = 60 / song.bpm / 4;
  const symbol = song.chords[c.bar % song.chords.length];
  const tones = chordTones(song, symbol);

  for (const k of ['k', 's', 'h', 'o', 'p']) {
    if (!has(k)) continue;
    let pat = song.drums[k];
    if (k === 's' && c.sectionBar === bars - 1 && bars > 2) pat = FILL;
    const ch = pat?.[step];
    if (ch === 'x' || ch === 'X') DRUMS[k](A, d, t, ch === 'X' || step % 4 === 0);
  }

  if (has('b')) {
    const ch = song.bass[step];
    if (ch && ch !== '.' && ch !== '-') {
      let n = tones[0] - 24;
      if (n < 34) n += 12;
      if (ch === 'o') n += 12;
      if (ch === '5') n = tones[2] - 24;
      const len = holdLength(song.bass, step);
      const type = song.bassType ?? 'sawtooth';
      if (type === 'soft') {
        voice(A, d, t, { type: 'triangle', f: hz(n + 12), dur: stepDur * len * 0.8, vol: 0.09, release: 0.08 });
      } else {
        // a round, quiet bass: no resonant filter and just a little sub
        voice(A, d, t, { type: type === 'saw' ? 'sawtooth' : type, f: hz(n + 12), dur: stepDur * len * 0.8, vol: type === 'square' ? 0.035 : 0.045, lp: 900, q: 0.7, release: 0.05 });
        voice(A, d, t, { type: 'triangle', f: hz(n), dur: stepDur * len * 0.8, vol: 0.07, release: 0.05 });
      }
    }
  }

  if (has('c') && song.chordRhythm[step] === 'x') {
    const len = holdLength(song.chordRhythm, step) * stepDur;
    for (const n of tones) {
      if (song.chordType === 'pad') {
        voice(A, d, t, { type: 'sawtooth', f: hz(n), dur: len * 0.95, vol: 0.022, lp: 1300, attack: 0.12, release: 0.3, detune: -8 });
        voice(A, d, t, { type: 'triangle', f: hz(n), dur: len * 0.95, vol: 0.04, attack: 0.1, release: 0.3, detune: 8 });
      } else if (song.chordType === 'pluck') {
        voice(A, d, t, { type: 'triangle', f: hz(n + 12), dur: 0.02, vol: 0.06, release: 0.25 });
      } else {
        voice(A, d, t, { type: 'sawtooth', f: hz(n), dur: Math.min(len, stepDur * 1.5), vol: 0.03, lp: 2400, release: 0.08, detune: -7 });
        voice(A, d, t, { type: 'sawtooth', f: hz(n), dur: Math.min(len, stepDur * 1.5), vol: 0.03, lp: 2400, release: 0.08, detune: 7 });
      }
    }
  }

  if (has('a') && song.arp?.[step] === 'x') {
    const spread = [...tones, ...tones.map((n) => n + 12)];
    const n = spread[c.arpIdx++ % spread.length] + 12;
    voice(A, d, t, { type: 'square', f: hz(n), dur: stepDur * 0.6, vol: 0.022, lp: 3200, release: 0.04 });
  }

  if (has('l')) {
    const bar = c.lead[c.bar % c.lead.length];
    const tok = bar[step];
    const def = TOKENS[tok];
    if (def) {
      const n = degreeNote(song, def[0], def[1]) + (song.leadOct ?? 12);
      const len = holdLength(bar, step);
      LEADS[song.leadType ?? 'square'](A, d, t, hz(n), stepDur * len * 0.9);
    }
  }
}

// ---------------------------------------------------------------------------

function refresh() {
  if (!settings.musicOn || settings.muted) {
    stopCurrent(0.8);
    return;
  }
  if (!cur) play(nextSong());
}

onAudioStart(refresh);
onSettings((s, changed) => {
  if ('musicOn' in changed || 'muted' in changed) refresh();
});

export const music = {
  get current() { return cur?.song.name ?? null; },
  get context() { return context; },
  /** 'main' (playlist) or 'battle' (fights). */
  setContext(ctx) {
    if (ctx === context || !PLAYLISTS[ctx]) return;
    context = ctx;
    if (cur) play(nextSong());
  },
  skip() {
    if (settings.musicOn && !settings.muted) play(nextSong());
  },
  /** fn(songName) whenever a new song starts. */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  songs: SONGS.map((s) => ({ name: s.name, battle: !!s.battle, bpm: s.bpm })),
};
