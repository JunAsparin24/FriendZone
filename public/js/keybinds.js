// Custom keybinds. Every game reads the default keys (W, E, Space…), so rather than teach each one
// about bindings, this sits in front of all of them: when you press a key you've bound to an action,
// it's passed on as that action's default key, and a default key you've moved elsewhere does nothing.
// It must be imported before anything else adds key listeners (main.js imports it first).
import { settings, setSetting, onSettings } from './settings.js';

export const ACTIONS = [
  { id: 'forward', label: 'Move forward', def: 'w' },
  { id: 'left', label: 'Move left', def: 'a' },
  { id: 'back', label: 'Move back', def: 's' },
  { id: 'right', label: 'Move right', def: 'd' },
  { id: 'sprint', label: 'Run / use item (race)', def: 'Shift' },
  { id: 'action', label: 'Jump · drift · dash · boost', def: ' ' },
  { id: 'interact', label: 'Enter / use / sit', def: 'e' },
  { id: 'turnLeft', label: 'Turn camera left', def: 'q' },
  { id: 'turnRight', label: 'Turn camera right', def: 'r' },
  { id: 'map', label: 'Big map', def: 'm' },
  { id: 'ride', label: 'Ride / get off your mount', def: 'g' },
  { id: 'chat', label: 'Chat', def: 'Enter' },
  { id: 'look', label: 'Mouse look (hide cursor)', def: 'Control' },
];
const LOCKED = new Set(['escape', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '1', '2', '3', '4', '5', '6']);

export const keyOf = (id) => settings.keys?.[id] ?? ACTIONS.find((a) => a.id === id)?.def;
export function keyLabel(k) {
  if (k === ' ') return 'Space';
  if (k === 'Control') return 'Ctrl';
  if (k.length === 1) return k.toUpperCase();
  return k.replace(/^Arrow/, '↑').replace('↑Left', '←').replace('↑Right', '→').replace('↑Down', '↓');
}
const codeFor = (k) => (k === ' ' ? 'Space' : k === 'Shift' ? 'ShiftLeft' : k === 'Control' ? 'ControlLeft'
  : k.length === 1 && /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : k.length === 1 && /\d/.test(k) ? `Digit${k}` : k);

let remap = new Map(), muted = new Set();
function rebuild() {
  remap = new Map();
  muted = new Set();
  for (const a of ACTIONS) {
    const k = keyOf(a.id);
    if (k.toLowerCase() !== a.def.toLowerCase()) {
      remap.set(k.toLowerCase(), a.def);
      muted.add(a.def.toLowerCase());
    }
  }
  for (const k of remap.keys()) muted.delete(k); // a default key re-used for another action still works
}
rebuild();
onSettings((s, changed) => { if ('keys' in changed) rebuild(); });

/** Bind an action to a key (null resets it). A key already used by another action is swapped over. */
export function bind(id, key) {
  const keys = { ...(settings.keys ?? {}) };
  if (key) {
    const clash = ACTIONS.find((a) => a.id !== id && keyOf(a.id).toLowerCase() === key.toLowerCase());
    if (clash) keys[clash.id] = keyOf(id);
    keys[id] = key;
  } else delete keys[id];
  for (const a of ACTIONS) if (keys[a.id] && keys[a.id].toLowerCase() === a.def.toLowerCase()) delete keys[a.id];
  setSetting({ keys });
}
export const resetBinds = () => setSetting({ keys: {} });
export const bindable = (key) => !LOCKED.has(key.toLowerCase());

// ---- the translator -------------------------------------------------------------------------
const ours = new WeakSet();
let capturing = null; // (key) => void while the settings screen waits for a key

export function captureNextKey(fn) { capturing = fn; }

function typing() {
  const el = document.activeElement;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) && !!el.offsetParent;
}

function translate(e) {
  if (ours.has(e)) return;
  if (capturing && e.type === 'keydown') {
    e.preventDefault();
    e.stopImmediatePropagation();
    const fn = capturing;
    capturing = null;
    fn(e.key === 'Escape' ? null : e.key);
    return;
  }
  if (!remap.size || typing()) return;
  const k = e.key.toLowerCase();
  const to = remap.get(k);
  if (!to && !muted.has(k)) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  if (!to) return; // a default key whose action now lives elsewhere
  const ev = new KeyboardEvent(e.type, {
    key: to, code: codeFor(to), repeat: e.repeat, bubbles: true, cancelable: true,
    shiftKey: to === 'Shift' ? e.type === 'keydown' : e.shiftKey, ctrlKey: to === 'Control' ? e.type === 'keydown' : e.ctrlKey,
  });
  ours.add(ev);
  (e.target ?? window).dispatchEvent(ev);
}
window.addEventListener('keydown', translate, true);
window.addEventListener('keyup', translate, true);
