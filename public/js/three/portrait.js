// Offscreen renderer that snapshots 3D characters for UI portraits and 2D mini-game sprites.
import * as THREE from 'three';
import { Character, DEFAULT_LOOK } from './character.js';

let renderer, scene, persp, ortho, char;

function setup() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6a5a8a, 1.9));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
  key.position.set(2, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 1.2);
  rim.position.set(-4, 3, -3);
  scene.add(rim);
  persp = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  char = new Character(DEFAULT_LOOK);
  scene.add(char.root);
}

function prepare(look, { pose = 'idle', phase = 0, time = 0, yaw = 0, ride = false }) {
  setup();
  char.setLook(look);
  const riding = ride && char.setRiding(true);
  if (!ride && char.riding) char.setRiding(false);
  char.setPose(riding ? 'ride' : pose, phase);
  char.jumpT = 1;
  char.blinkAt = 5;
  char.update(0, time, false);
  char.root.rotation.y = yaw;
}

function size(w, h) {
  const cur = renderer.getSize(new THREE.Vector2());
  if (cur.x !== w || cur.y !== h) renderer.setSize(w, h, false);
}

/**
 * Render a portrait and return the renderer canvas (valid until the next render).
 * zoom: 'body' | 'head'; yaw rotates the character (0 faces the camera).
 */
export function renderPortrait(look, w, h, { zoom = 'body', yaw = 0.45, pose = 'idle', phase = 0, time = 0 } = {}) {
  prepare(look, { pose, phase, time, yaw: zoom === 'mount' ? yaw + 0.5 : yaw, ride: zoom === 'mount' });
  size(w, h);
  persp.aspect = w / h;
  for (const o of char.root.children) o.visible = zoom !== 'pet' || o === char.rig.pet;
  if (zoom === 'pet') {
    // just the pet, which stands beside the (hidden) character
    const px = Math.cos(yaw) * 1.19 + Math.sin(yaw) * -0.44, pz = -Math.sin(yaw) * 1.19 + Math.cos(yaw) * -0.44;
    persp.fov = 24;
    persp.position.set(px, 1.5, pz + 5.2);
    persp.lookAt(px, 0.72, pz);
  } else if (zoom === 'mount') {
    // riding: pull back to fit the mount too
    persp.fov = 24;
    const dist = Math.max(8.4, 8.4 / Math.min(1, persp.aspect * 1.1));
    persp.position.set(0, 2.1, dist);
    persp.lookAt(0, 1.25, 0);
  } else if (zoom === 'bust') {
    const dy = char.rig.head.position.y - 1.52;
    persp.fov = 24;
    persp.position.set(0, 1.55 + dy, 5.0);
    persp.lookAt(0, 1.3 + dy, 0);
  } else if (zoom === 'feet') {
    // shoes and socks, close up
    persp.fov = 24;
    persp.position.set(0.5, 0.75, 2.6);
    persp.lookAt(0, 0.22, 0);
  } else if (zoom === 'head') {
    const dy = char.rig.head.position.y - 1.52; // tiny and tall characters keep their face in frame
    persp.fov = 24;
    persp.position.set(0, 1.62 + dy, 3.4);
    persp.lookAt(0, 1.55 + dy, 0);
  } else {
    persp.fov = 24;
    const dist = Math.max(5.4, 5.4 / Math.min(1, persp.aspect * 1.25));
    persp.position.set(0, 1.35, dist);
    persp.lookAt(0, 1.0, 0);
  }
  persp.updateProjectionMatrix();
  renderer.render(scene, persp);
  return renderer.domElement;
}

// ---------------------------------------------------------------------------
// Sprite frames for the 2D canvas mini-games (side-ish view, facing right)
// ---------------------------------------------------------------------------

const FRAME_W = 180, FRAME_H = 240;
const VIEW = { left: -1.15, right: 1.15, top: 2.75, bottom: -0.3 };
const frames = new Map();
export const WALK_FRAMES = 8;

/** Returns { canvas, ax, ay, ppu }: anchor (feet) in canvas px and pixels per world unit. */
export function spriteFrame(look, pose = 'idle', frame = 0) {
  const key = `${JSON.stringify(look)}|${pose}|${frame}`;
  let f = frames.get(key);
  if (f) return f;
  prepare(look, { pose, phase: (frame / WALK_FRAMES) * Math.PI * 2, yaw: Math.PI / 2 - 0.5 });
  size(FRAME_W, FRAME_H);
  Object.assign(ortho, VIEW); // frustum edges are relative to the camera, which sits at ground level
  ortho.position.set(0, 0, 10);
  ortho.lookAt(0, 0, 0);
  ortho.updateProjectionMatrix();
  renderer.render(scene, ortho);
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  canvas.getContext('2d').drawImage(renderer.domElement, 0, 0);
  const ppu = FRAME_W / (VIEW.right - VIEW.left);
  f = { canvas, ax: FRAME_W / 2, ay: VIEW.top * ppu, ppu };
  if (frames.size > 400) frames.delete(frames.keys().next().value);
  frames.set(key, f);
  return f;
}
