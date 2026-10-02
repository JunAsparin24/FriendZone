// Background music: a shuffled playlist of tracks (public/music, one small file per track, listed in
// tracks.json). Each plays to the end, then another one at random, never the same one twice in a row.
// It goes through the music volume in ⚙️ settings (and the mute button), and fades between tracks.
import { audio, onAudioStart } from './sfx.js';
import { settings, onSettings } from './settings.js';

const TRACKS = await (await fetch('music/tracks.json')).json(); // [{ name, file }]
const LOUDNESS = 1.6; // (the music volume was set for the old, quieter synthesized songs)

let cur = null;   // { track, el, gain } playing now
let queue = [];
let context = 'main';
const listeners = new Set();

function nextTrack() {
  if (!queue.length) {
    queue = [...TRACKS].sort(() => Math.random() - 0.5);
    if (queue.length > 1 && queue[0] === cur?.track) queue.push(queue.shift());
  }
  return queue.shift();
}

function play(track) {
  const A = audio();
  if (!A || !track) return;
  stopCurrent(1.2);
  const el = new Audio(`music/${track.file}`);
  el.preload = 'auto';
  const gain = A.ac.createGain();
  gain.gain.value = 0;
  gain.gain.linearRampToValueAtTime(LOUDNESS, A.ac.currentTime + 1.2);
  A.ac.createMediaElementSource(el).connect(gain);
  gain.connect(A.musicBus);
  const me = { track, el, gain };
  el.onended = () => { if (cur === me) play(nextTrack()); };
  el.onerror = () => { if (cur === me) setTimeout(() => { if (cur === me) play(nextTrack()); }, 3000); };
  el.play().catch(() => {});
  cur = me;
  listeners.forEach((fn) => fn(track.name));
}

function stopCurrent(fade = 0.6) {
  if (!cur) return;
  const { el, gain } = cur;
  const ac = gain.context, t = ac.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0, t + fade);
  setTimeout(() => { el.pause(); el.removeAttribute('src'); el.load(); gain.disconnect(); }, (fade + 0.3) * 1000);
  cur = null;
}

function refresh() {
  if (!settings.musicOn || settings.muted) {
    stopCurrent(0.8);
    return;
  }
  if (!cur) play(nextTrack());
}

onAudioStart(refresh);
onSettings((s, changed) => {
  if ('musicOn' in changed || 'muted' in changed) refresh();
});

export const music = {
  get current() { return cur?.track.name ?? null; },
  get context() { return context; },
  /** (fights used to switch to battle music; the playlist now just carries on) */
  setContext(ctx) { context = ctx; },
  setNight() {},
  skip() {
    if (settings.musicOn && !settings.muted) play(nextTrack());
  },
  /** fn(trackName) whenever a new track starts. */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  songs: TRACKS.map((t) => ({ name: t.name })),
};
