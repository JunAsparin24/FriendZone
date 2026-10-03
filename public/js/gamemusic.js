// Game themes: little chiptune songs synthesized live, one for each game, that take over from the
// playlist while you play (and hand back when you leave). Each song is a tempo, a key, a chord loop,
// a drum groove and a melody grown from a seed, so they all sound different but cost no files.
import { audio } from './sfx.js';

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], blues: [0, 3, 5, 6, 7, 10, 12], phryg: [0, 1, 3, 5, 7, 8, 10] };
// drums: 16 steps per bar. k kick, s snare, h hat, o open hat
export const SONGS = {
  race: { name: 'Turbo Lap', bpm: 156, root: 45, scale: 'major', prog: [0, 5, 3, 4], seed: 11, lead: 'square', bass: 'saw', drums: ['k.h.s.h.k.k.s.h.', 'k.h.s.hkk.h.s.ho'], density: 0.7 },
  arena: { name: 'Arena Clash', bpm: 148, root: 43, scale: 'minor', prog: [0, 5, 6, 4], seed: 23, lead: 'saw', bass: 'square', drums: ['k.hsk.h.k.hsk.hs', 'k.hsk.h.kkhsk.hs'], density: 0.65 },
  boss: { name: 'The Dungeon Boss', bpm: 132, root: 40, scale: 'phryg', prog: [0, 1, 0, 6], seed: 31, lead: 'saw', bass: 'saw', drums: ['k..sk.k.k..sk.ks', 'k..sk.k.k..skkss'], density: 0.55 },
  lasertag: { name: 'Neon Tag', bpm: 140, root: 42, scale: 'minor', prog: [0, 3, 5, 4], seed: 47, lead: 'square', bass: 'square', drums: ['k.h.s.h.k.h.s.h.', 'k.h.s.h.k.hks.ho'], density: 0.6, arp: true },
  archery: { name: 'Bullseye Breeze', bpm: 104, root: 50, scale: 'major', prog: [0, 3, 4, 3], seed: 53, lead: 'triangle', bass: 'triangle', drums: ['k...h...s...h...', 'k...h.k.s...h.h.'], density: 0.45 },
  arcade: { name: 'Insert Coin', bpm: 128, root: 48, scale: 'major', prog: [0, 5, 3, 4], seed: 61, lead: 'square', bass: 'triangle', drums: ['k.h.s.hhk.h.s.h.', 'k.h.s.hhk.hks.hh'], density: 0.75, arp: true },
  casino: { name: 'High Roller Lounge', bpm: 96, root: 45, scale: 'dorian', prog: [0, 3, 0, 4], seed: 71, lead: 'triangle', bass: 'triangle', drums: ['k..hs..hk.khs..h', 'k..hs..hk.khs.hh'], density: 0.4, swing: 0.18 },
  doodle: { name: 'Doodle Time', bpm: 118, root: 52, scale: 'major', prog: [0, 4, 5, 3], seed: 83, lead: 'triangle', bass: 'square', drums: ['k...s...k.k.s...', 'k...s...k.k.s.h.'], density: 0.55 },
  tavern: { name: 'The Trading Tavern', bpm: 112, root: 47, scale: 'dorian', prog: [0, 6, 3, 4], seed: 97, lead: 'triangle', bass: 'triangle', drums: ['k..h..k.s..h..h.', 'k..h..k.s..h.hh.'], density: 0.5, swing: 0.25 },
  beach: { name: 'Coral Cove Summer', bpm: 100, root: 50, scale: 'major', prog: [0, 4, 5, 3], seed: 101, lead: 'triangle', bass: 'square', drums: ['k..h.hs.k.hh.hs.', 'k..h.hs.k.hhkhs.'], density: 0.5, swing: 0.12 },
};

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

/** Lay out a song: per bar, the bass notes, a melody and (some songs) an arpeggio, all in steps. */
function compose(song) {
  const r = rng(song.seed), sc = SCALES[song.scale];
  const deg = (d, oct = 0) => song.root + sc[((d % 7) + 7) % 7] + 12 * (oct + Math.floor(d / 7));
  const bars = [];
  // two melody phrases, A then A' (a little varied), so it sounds like a tune not noise
  const phrase = [];
  for (let b = 0; b < 4; b++) {
    const steps = [];
    let d = song.prog[b] + 7;
    for (let i = 0; i < 16; i++) {
      if (r() < song.density && (i % 2 === 0 || r() < 0.3)) {
        d += Math.round((r() - 0.5) * 4);
        d = Math.max(song.prog[b] + 4, Math.min(song.prog[b] + 13, d));
        const len = r() < 0.3 ? 2 : 1;
        steps.push({ i, d, len });
      }
    }
    phrase.push(steps);
  }
  for (let rep = 0; rep < 2; rep++) for (let b = 0; b < 4; b++) {
    const root = song.prog[b];
    bars.push({
      bass: [0, 4, 8, 10, 12].map((i, k) => ({ i, n: deg(root, k === 3 ? 0 : -1) + (k === 3 ? 7 : 0) })).map((x) => ({ i: x.i, n: x.n - 12 })),
      lead: phrase[b].map((s) => ({ i: s.i, n: deg(rep && s.i > 11 ? s.d + 2 : s.d, 1) - 12, len: s.len })),
      chord: [deg(root), deg(root + 2), deg(root + 4)],
      drums: song.drums[(b === 3) ? 1 : 0],
    });
  }
  return bars;
}

let player = null;

/** Start a song (fading in), or stop the one playing (null). */
export function playSong(id) {
  const A = audio();
  if (player) { player.stop(); player = null; }
  const song = SONGS[id];
  if (!A || !song) return;
  const { ac, musicBus, noiseBuf } = A;
  const out = ac.createGain();
  out.gain.value = 0;
  out.gain.linearRampToValueAtTime(0.32, ac.currentTime + 1.5);
  out.connect(musicBus);
  const bars = compose(song), stepDur = 60 / song.bpm / 4;
  let bar = 0, step = 0, next = ac.currentTime + 0.1, alive = true;

  const tone = (type, f, t, dur, vol, cutoff = 4000) => {
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = type === 'saw' ? 'sawtooth' : type;
    o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  };
  const noise = (t, dur, vol, type, f) => {
    if (!noiseBuf) return;
    const s = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter();
    s.buffer = noiseBuf;
    fl.type = type; fl.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  };
  const kick = (t) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.25);
  };

  const scheduleStep = (t) => {
    const B = bars[bar];
    const swing = song.swing && step % 2 ? stepDur * song.swing : 0;
    const at = t + swing;
    for (const n of B.bass) if (n.i === step) tone(song.bass, freq(n.n), at, stepDur * 1.8, 0.16, 900);
    for (const n of B.lead) if (n.i === step) tone(song.lead, freq(n.n), at, stepDur * (n.len * 1.6 + 0.2), song.lead === 'triangle' ? 0.16 : 0.07, 3200);
    if (song.arp && step % 2 === 0) tone('square', freq(B.chord[(step / 2) % 3] + 12), at, stepDur * 0.9, 0.025, 2600);
    const d = B.drums[step];
    if (d === 'k') kick(at);
    if (d === 's') noise(at, 0.14, 0.35, 'bandpass', 1800);
    if (d === 'h') noise(at, 0.04, 0.12, 'highpass', 7000);
    if (d === 'o') noise(at, 0.18, 0.12, 'highpass', 6000);
    if (step === 0 && bar % 4 === 0) for (const c of B.chord) tone('triangle', freq(c), at, stepDur * 14, 0.035, 1500); // a soft pad
  };
  const timer = setInterval(() => {
    if (!alive) return;
    while (next < ac.currentTime + 0.25) {
      scheduleStep(next);
      next += stepDur;
      if (++step >= 16) { step = 0; bar = (bar + 1) % bars.length; }
    }
  }, 60);
  player = {
    id,
    stop() {
      alive = false;
      clearInterval(timer);
      const t = ac.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.8);
      setTimeout(() => out.disconnect(), 1200);
    },
  };
}
export const songPlaying = () => player?.id ?? null;
