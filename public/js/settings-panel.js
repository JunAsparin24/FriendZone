// The ⚙️ Settings overlay: audio, music, controls and graphics. It sits above everything else so it
// can be opened in the middle of a game.
import { settings, setSetting, DEFAULTS } from './settings.js';
import { music } from './music.js';
import { iconSvg } from './icons.js';
import { sfx } from './sfx.js';

const $ = (sel, root = document) => root.querySelector(sel);

const SLIDERS = {
  master: { label: 'Master volume', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  music: { label: 'Music', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  sfx: { label: 'Sound effects', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  camSens: { label: 'Camera sensitivity', min: 0.2, max: 3, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  zoomSens: { label: 'Zoom sensitivity', min: 0.2, max: 3, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  keyTurn: { label: 'Q / R turn speed', min: 0.2, max: 3, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
};
const TOGGLES = {
  musicOn: 'Background music',
  nowPlaying: 'Show song names',
  invertY: 'Invert camera up/down',
  shake: 'Screen shake',
  names: 'Name tags in the world',
  dayNight: 'Day and night cycle',
};
const CONTROLS = [
  ['Move', 'WASD / arrows, or click the ground'], ['Run', 'Hold Shift'], ['Turn camera', 'Drag, or Q / R'],
  ['Zoom', 'Scroll wheel'], ['Enter a building', 'E or click it'], ['Chat', 'Enter'], ['Emotes', '1 – 6'],
  ['Close a window', 'Esc'],
];

let el = null;

function slider(key) {
  const s = SLIDERS[key];
  return `<label class="set-row"><span>${s.label}</span>
    <input type="range" data-slider="${key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${settings[key]}">
    <b data-val="${key}">${s.fmt(settings[key])}</b></label>`;
}
const toggle = (key) => `<label class="set-row set-toggle"><span>${TOGGLES[key]}</span>
  <input type="checkbox" data-toggle="${key}" ${settings[key] ? 'checked' : ''}><i class="switch"></i></label>`;

function render() {
  el.innerHTML = `
    <div class="settings-box" role="dialog" aria-label="Settings">
      <button class="modal-close" data-close aria-label="Close">✕</button>
      <h2>${iconSvg('settings')} Settings</h2>
      <div class="set-grid">
        <section>
          <h3>🔊 Audio</h3>
          ${slider('master')}${slider('sfx')}
          <label class="set-row set-toggle"><span>Mute everything</span><input type="checkbox" data-toggle="muted" ${settings.muted ? 'checked' : ''}><i class="switch"></i></label>
          <h3>${iconSvg('music')} Music</h3>
          ${toggle('musicOn')}${slider('music')}${toggle('nowPlaying')}
          <div class="now-playing"><span>Now playing: <b data-song>${music.current ?? '—'}</b></span>
            <button class="btn small" data-skip>⏭ Next song</button></div>
        </section>
        <section>
          <h3>🎮 Controls</h3>
          ${slider('camSens')}${slider('zoomSens')}${slider('keyTurn')}${toggle('invertY')}
          <h3>🖥️ Graphics</h3>
          <div class="set-row"><span>Quality</span><div class="seg">${['low', 'medium', 'high'].map((q) =>
            `<button data-quality="${q}" class="${settings.quality === q ? 'on' : ''}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
          <p class="muted small">Lower quality turns off shadows and renders fewer pixels. Try it if the game feels slow.</p>
          ${toggle('shake')}${toggle('names')}${toggle('dayNight')}
        </section>
      </div>
      <details class="keys"><summary>⌨️ Controls cheat sheet</summary>
        <ul>${CONTROLS.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul></details>
      <div class="row between"><button class="btn ghost small" data-reset>Reset to defaults</button><button class="btn primary" data-close>Done</button></div>
    </div>`;
}

function onInput(e) {
  const s = e.target.dataset.slider;
  if (s) {
    const v = Number(e.target.value);
    setSetting({ [s]: v });
    $(`[data-val="${s}"]`, el).textContent = SLIDERS[s].fmt(v);
    if (s === 'sfx' || s === 'master') sfx('coin');
  }
  const t = e.target.dataset.toggle;
  if (t) {
    setSetting({ [t]: e.target.checked });
    sfx('switch');
  }
}

function onClick(e) {
  if (e.target === el || e.target.closest('[data-close]')) { closeSettings(); return; }
  const q = e.target.closest('[data-quality]');
  if (q) {
    setSetting({ quality: q.dataset.quality });
    el.querySelectorAll('[data-quality]').forEach((b) => b.classList.toggle('on', b === q));
    sfx('click');
  }
  if (e.target.closest('[data-skip]')) { music.skip(); sfx('click'); }
  if (e.target.closest('[data-reset]')) {
    setSetting({ ...DEFAULTS });
    render();
    sfx('pop');
  }
}

const onKey = (e) => {
  if (e.key === 'Escape' && el && !el.classList.contains('hidden')) {
    e.stopImmediatePropagation();
    closeSettings();
  }
};

export function openSettings() {
  if (!el) {
    el = document.createElement('div');
    el.className = 'settings-overlay hidden';
    document.body.append(el);
    el.addEventListener('input', onInput);
    el.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey, true);
    music.onChange((name) => { const s = el && $('[data-song]', el); if (s) s.textContent = name; });
  }
  render();
  el.classList.remove('hidden');
  sfx('open');
}

export function closeSettings() {
  if (!el || el.classList.contains('hidden')) return;
  el.classList.add('hidden');
  sfx('close');
}
