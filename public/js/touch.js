// Touch controls for phones and tablets.
import { keyOf, keyLabel } from './keybinds.js';
//   Left half of the screen: an invisible, floating stick. Put your thumb down anywhere on the left
//   and drag to move (push further to run). There's no joystick drawn; it follows your thumb.
//   Right half: the camera, as before. Drag to look around, pinch to zoom, tap to walk/click/aim.
//   Buttons: games that need a key (dash, boost, drift, items…) get round action buttons on the right.
// The world and the 3D areas each register a context; whichever is active gets the touches. Games
// keep reading their usual keys: the stick presses WASD for them, and the buttons press their keys.

export const touch = {
  enabled: false,
  /** Analog stick: x/y in -1..1 (y down = back), `run` when pushed all the way. */
  stick: { x: 0, y: 0, active: false, run: false },
};

const STICK_RADIUS = 60;   // px of thumb travel for full speed
const DEAD = 0.18;         // ignore tiny wobbles
const KEY_AT = 0.38;       // how far to push before a direction key is pressed

function enable() {
  if (touch.enabled) return;
  touch.enabled = true;
  document.documentElement.classList.add('touch');
}
if (matchMedia('(hover: none) and (pointer: coarse)').matches) enable();

// ---- contexts -------------------------------------------------------------------------------------

const contexts = [];
/**
 * ctx: { canvas, root (the screen it lives in), active(): bool, stick(): bool (allow the stick), keys: Set | null (press WASD into
 *        it), zoom(factor), aim(): bool (right-side drags aim instead of turning the camera) }
 */
export function registerTouch(ctx) {
  ctx.injected = new Set();
  contexts.push(ctx);
  return () => contexts.splice(contexts.indexOf(ctx), 1);
}
const current = () => contexts.find((c) => c.active()) ?? null;

// ---- the invisible stick + pinch zoom ---------------------------------------------------------------

let stickId = null, origin = null;
const right = new Map(); // pointerId -> { x, y } for fingers on the right half
let pinchDist = 0;

// Touches start on the 3D view: the canvas itself, or any display-only overlay drawn on top of it
// (scores, meters, maps, name tags…). Real controls keep working as normal.
const INTERACTIVE = 'button, input, select, textarea, a, label, summary, [contenteditable], .touch-buttons, .hud-prompt, .area-prompt, .minimap, .chat, .modal, .race-actions, .top-ctl';
const onCanvas = (e, c) => c && (e.target === c.canvas || (c.root?.contains(e.target) && !e.target.closest(INTERACTIVE)));

window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  enable();
  const c = current();
  if (!onCanvas(e, c)) return;
  if (stickId == null && e.clientX < window.innerWidth / 2 && c.stick?.() !== false) {
    stickId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    Object.assign(touch.stick, { x: 0, y: 0, active: true, run: false });
    e.stopPropagation(); // the canvas never sees the stick's finger
    return;
  }
  right.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (right.size === 2) {
    const [a, b] = [...right.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    touch.pinching = true;
    e.fzPinch = true;
    e.stopPropagation();
  }
}, true);

window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'touch') return;
  if (e.pointerId === stickId) {
    let dx = (e.clientX - origin.x) / STICK_RADIUS, dy = (e.clientY - origin.y) / STICK_RADIUS;
    const len = Math.hypot(dx, dy);
    // a floating stick: if the thumb goes past the edge, the centre follows it
    if (len > 1) {
      origin.x = e.clientX - (dx / len) * STICK_RADIUS;
      origin.y = e.clientY - (dy / len) * STICK_RADIUS;
      dx /= len;
      dy /= len;
    }
    const mag = Math.min(1, len);
    const k = mag < DEAD ? 0 : 1;
    Object.assign(touch.stick, { x: dx * k, y: dy * k, run: mag > 0.92 });
    syncKeys();
    e.stopPropagation();
    return;
  }
  if (!right.has(e.pointerId)) return;
  right.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (right.size >= 2) {
    const [a, b] = [...right.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0 && d > 0) current()?.zoom?.(pinchDist / d);
    pinchDist = d;
    e.stopPropagation(); // pinching doesn't also turn the camera
  }
}, true);

function lift(e) {
  if (e.pointerType !== 'touch') return;
  if (e.pointerId === stickId) {
    stickId = null;
    Object.assign(touch.stick, { x: 0, y: 0, active: false, run: false });
    syncKeys();
    e.stopPropagation();
    return;
  }
  if (!right.has(e.pointerId)) return;
  right.delete(e.pointerId);
  // a finger lifting after a pinch shouldn't count as a tap
  if (touch.pinching) e.fzPinch = true;
  if (!right.size) touch.pinching = false;
}
window.addEventListener('pointerup', lift, true);
window.addEventListener('pointercancel', lift, true);

// the stick presses WASD for games that read keys. Synced right away whenever the thumb moves or lifts
// (so letting go stops you instantly, even on a slow phone), and every frame for context switches.
function syncKeys() {
  for (const c of contexts) {
    const want = new Set();
    if (c === current() && c.keys && touch.stick.active) {
      const { x, y } = touch.stick;
      if (x < -KEY_AT) want.add('a');
      if (x > KEY_AT) want.add('d');
      if (y < -KEY_AT) want.add('w');
      if (y > KEY_AT) want.add('s');
    }
    for (const k of c.injected) if (!want.has(k)) { c.keys?.delete(k); c.injected.delete(k); }
    for (const k of want) { c.keys.add(k); c.injected.add(k); } // (every frame: the stuck-key guard may have dropped it)
  }
}
function everyFrame() {
  requestAnimationFrame(everyFrame);
  syncKeys();
}
requestAnimationFrame(everyFrame);

// ---- action buttons ------------------------------------------------------------------------------

const bar = document.createElement('div');
bar.className = 'touch-buttons';
document.body.append(bar);

const sendKey = (type, key, code) => window.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true }));

/** buttons: [{ label, icon (emoji), key, code }] — each one holds its key down while pressed. */
export function setTouchButtons(buttons = []) {
  bar.innerHTML = buttons.map((b, i) => `<button type="button" data-i="${i}" class="${b.big ? 'big' : ''}"><span>${b.icon ?? ''}</span><small>${b.label}</small></button>`).join('');
  bar.querySelectorAll('button').forEach((el) => {
    const b = buttons[+el.dataset.i];
    let held = false;
    const up = () => { if (!held) return; held = false; el.classList.remove('down'); sendKey('keyup', b.key, b.code); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      held = true;
      el.classList.add('down');
      el.setPointerCapture?.(e.pointerId);
      sendKey('keydown', b.key, b.code);
    });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

/** "Press E or click to …" on a computer, "Tap to …" on a phone. */
export const actionHint = () => (touch.enabled ? 'Tap to' : `Press <kbd>${keyLabel(keyOf('interact'))}</kbd> or click to`);

/** Vertical field of view that never shows less side-to-side than a 4:3 screen would at `base`
 *  degrees, so arenas and the world still fit when a phone is held upright. */
export function fitFov(base, aspect) {
  const minH = 2 * Math.atan(Math.tan((base * Math.PI) / 360) * (4 / 3));
  const v = 2 * Math.atan(Math.tan(minH / 2) / aspect) * (180 / Math.PI);
  return Math.min(100, Math.max(base, v));
}
