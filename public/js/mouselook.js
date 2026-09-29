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

function toggle() {
  if (document.pointerLockElement) { document.exitPointerLock(); return; }
  const t = targets.find((x) => x.active());
  if (!t) return;
  try {
    const p = t.canvas.requestPointerLock();
    p?.catch?.(() => {}); // the browser can refuse (e.g. right after leaving the lock)
  } catch { /* not supported */ }
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
document.addEventListener('pointerlockchange', () => hint.classList.toggle('hidden', !current()));
// if a panel opens or you leave the place, give the cursor back
setInterval(() => {
  const t = current();
  if (document.pointerLockElement && (!t || !t.active())) document.exitPointerLock();
}, 250);
