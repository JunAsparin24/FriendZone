// Player preferences (audio, controls, graphics), saved on this device.
const KEY = 'friendzone.settings';

export const DEFAULTS = {
  master: 0.8,      // overall volume
  music: 0.5,       // background music volume
  sfx: 0.9,         // sound effects volume
  muted: false,     // quick mute (the 🔊 button)
  musicOn: true,
  camSens: 1,       // camera drag sensitivity
  zoomSens: 1,      // scroll-wheel zoom sensitivity
  keyTurn: 1,       // Q / R camera turn speed
  invertY: false,
  quality: 'high',  // 'low' | 'medium' | 'high'
  shake: true,      // screen shake in the action games
  names: true,      // name tags over players in the world
  dayNight: true,   // the world goes through day and night (off: always daytime)
  nowPlaying: true, // pop up the song name when the music changes
};

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* private mode */ }
  if (!('master' in saved)) {
    // carry over the old sound preferences
    try {
      const old = JSON.parse(localStorage.getItem('friendzone.sound'));
      if (old) Object.assign(saved, { master: old.volume ?? DEFAULTS.master, muted: !!old.muted });
    } catch { /* nothing saved */ }
  }
  return { ...DEFAULTS, ...saved };
}

export const settings = load();
const listeners = new Set();

export function setSetting(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  listeners.forEach((fn) => fn(settings, patch));
}

/** Call fn(settings, changed) whenever a setting changes. Returns an unsubscribe. */
export function onSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Multiplier for screen-shake amounts. */
export const shakeScale = () => (settings.shake ? 1 : 0);

/** Renderer pixel ratio for the chosen quality. */
export const pixelRatio = () => {
  const dpr = window.devicePixelRatio || 1;
  return settings.quality === 'low' ? Math.min(1, dpr) * 0.75 : settings.quality === 'medium' ? Math.min(1.25, dpr) : Math.min(2, dpr);
};
