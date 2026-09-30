// If the phone runs out of graphics memory, the browser drops the 3D context. Instead of a frozen or
// blank screen, say what happened and offer to reload with lighter graphics.
import { setSetting } from './settings.js';

let shown = false;
export function watchContext(canvas) {
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (shown) return;
    shown = true;
    const el = document.createElement('div');
    el.className = 'gfx-lost';
    el.innerHTML = `<div class="card"><h3>Your device ran out of graphics memory</h3>
      <p>We'll switch to <b>Low</b> graphics so it runs smoother.</p>
      <button class="btn primary">Reload the game</button></div>`;
    el.querySelector('button').onclick = () => { setSetting({ quality: 'low', qualityChosen: true }); location.reload(); };
    document.body.append(el);
  }, false);
}
