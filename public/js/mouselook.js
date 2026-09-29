// Mouse look: tap Ctrl to hide the cursor and turn the camera just by moving the mouse (pointer lock).
// Tap Ctrl again (or Esc) to get the cursor back. The world and the walk-around rooms register a
// target; whichever is active gets the mouse.
import { isTyping } from './state.js';

const targets = [];
let armed = false;
const hint = document.createElement('div');
hint.className = 'mouselook-hint hidden';
hint.innerHTML = '🖱️ Mouse look · <kbd>Ctrl</kbd> to show the cursor';
document.body.append(hint);

/** target: { canvas, active(): bool, look(dx, dy) } */
export function registerLook(target) {
  targets.push(target);
  return () => targets.splice(targets.indexOf(target), 1);
}

const current = () => targets.find((t) => document.pointerLockElement === t.canvas) ?? null;
export const mouseLooking = () => !!current();

// Mouse look is "sticky": once you turn it on it follows you from the town into buildings and back
// (the lock moves to whichever view is showing) until you turn it off with Ctrl or Esc.
let sticky = false, ourExit = false, fails = 0;

function exitLock() {
  if (!document.pointerLockElement) return;
  ourExit = true;
  document.exitPointerLock();
}

function lock(t) {
  try {
    const p = t.canvas.requestPointerLock();
    p?.then?.(() => { fails = 0; });
    p?.catch?.(() => { if (++fails > 3) sticky = false; }); // the browser can refuse without a click/key
  } catch { sticky = false; }
}

function toggle() {
  if (document.pointerLockElement || sticky) { sticky = false; exitLock(); return; }
  const t = targets.find((x) => x.active());
  if (!t) return;
  sticky = true;
  fails = 0;
  lock(t);
}

// Ctrl on its own toggles; Ctrl+C and friends don't
window.addEventListener('keydown', (e) => {
  if (e.key === 'Control') { armed = !e.repeat && !isTyping(); return; }
  armed = false;
}, true);
window.addEventListener('keyup', (e) => {
  if (e.key === 'Control' && armed) toggle();
  armed = false;
}, true);

window.addEventListener('mousemove', (e) => {
  const t = current();
  if (t) t.look(e.movementX, e.movementY);
});
document.addEventListener('pointerlockchange', () => {
  hint.classList.toggle('hidden', !current());
  // the browser let go of the lock by itself (Esc, alt-tab): that turns mouse look off
  if (!document.pointerLockElement && !ourExit) sticky = false;
  ourExit = false;
});
// keep the lock on whatever view is active: hand it over when you go in or out of a building, and
// give the cursor back while a panel is open
setInterval(() => {
  const t = current();
  const want = targets.find((x) => x.active()) ?? null;
  if (document.pointerLockElement && (!t || !t.active())) exitLock();
  else if (sticky && want && !document.pointerLockElement) lock(want);
}, 250);
