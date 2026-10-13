// One small offscreen renderer for every snapshot: the furniture and fish pictures in the menus and the
// character portraits. It's made when a picture is wanted and let go a few seconds after the last one.
// (Phones only have so much graphics memory, and a renderer that stays open keeps its own copy of
// everything it has ever drawn: three of them, on top of the world's and the area's, could run a phone
// out of graphics memory after a long look round the furniture shop.)
import * as THREE from 'three';

let renderer = null, idle = 0;

/** The snapshot renderer (made if need be). Use it straight away: it may be gone a few seconds later. */
export function snapRenderer() {
  clearTimeout(idle);
  idle = setTimeout(release, 4000);
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

/** Let go of the renderer and everything it holds on the graphics card. */
function release() {
  if (!renderer) return;
  renderer.dispose();
  renderer.forceContextLoss();
  renderer = null;
}
