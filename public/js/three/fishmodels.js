// 3D models for everything you can catch at the pond, built from primitives in the toon style. Each
// fish is about 1 unit long, nose pointing +X, sitting on its belly line at y = 0 (centre y ≈ 0.25).
// `model` comes from cosmetics.json (shape + colours + extras). fishThumb() renders a side-on picture.
import * as THREE from 'three';
import { toon, basic, shiny, outlineMaterial, canvasTexture, additive, glowTexture, TAU } from './materials.js';

const OUT = outlineMaterial(0.012);
function add(parent, geo, mat, { p = [0, 0, 0], r = null, s = null, outline = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  if (s) m.scale.set(...s);
  if (outline) m.add(new THREE.Mesh(geo, OUT));
  parent.add(m);
  return m;
}
const sph = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const cyl = (a, b, h, seg = 12) => new THREE.CylinderGeometry(a, b, h, seg);

/** A body skin with an optional pattern painted on (stripes, spots, a lateral band, clown bars). */
function skin(m) {
  const pattern = m.pattern ?? 'none';
  const tex = canvasTexture(256, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, m.body); g.addColorStop(0.55, m.body); g.addColorStop(1, m.belly ?? m.body);
    c.fillStyle = g; c.fillRect(0, 0, 256, 128);
    c.fillStyle = m.pat ?? '#00000055';
    if (pattern === 'stripes') for (let x = 40; x < 230; x += 38) c.fillRect(x, 10, 12, 80);
    if (pattern === 'spots') for (let i = 0; i < 40; i++) { c.beginPath(); c.arc((i * 53) % 256, 12 + (i * 29) % 60, 4, 0, TAU); c.fill(); }
    if (pattern === 'band') c.fillRect(0, 50, 256, 16);
    if (pattern === 'clown') { c.fillStyle = '#ffffff'; for (const x of [60, 130, 200]) c.fillRect(x, 0, 22, 128); c.fillStyle = '#1a1330'; for (const x of [56, 82, 126, 152, 196, 222]) c.fillRect(x, 0, 4, 128); }
  });
  const opts = { map: tex, gradientMap: toon('#fff').gradientMap };
  if (m.shiny) return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.25, emissive: new THREE.Color(m.body), emissiveIntensity: 0.15 });
  if (m.crystal) return new THREE.MeshToonMaterial({ ...opts, transparent: true, opacity: 0.8 });
  return new THREE.MeshToonMaterial(opts);
}

function eye(g, x, y, z, r = 0.06) {
  add(g, sph(r, 12, 10), basic('#ffffff'), { p: [x, y, z], outline: false });
  add(g, sph(r * 0.6, 10, 8), basic('#1a1330'), { p: [x + r * 0.3, y, z + r * 0.45], outline: false });
}

/** Tail fin: a fan made of a flattened cone, forked or rounded. */
function tail(g, x, y, color, size = 0.3, forked = true) {
  const m = toon(color, { side: THREE.DoubleSide });
  if (forked) {
    for (const s of [-1, 1]) add(g, cone(0.08, size, 6), m, { p: [x - size * 0.35, y + s * size * 0.28, 0], r: [0, 0, Math.PI / 2 + s * 0.55], s: [1, 1, 0.25] });
  } else add(g, cone(size * 0.45, size, 10), m, { p: [x - size * 0.4, y, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.22] });
}

const SHAPES = {
  fish(g, m) {
    const len = m.len ?? 1, tall = m.tall ?? 0.4, mat = skin(m);
    const fin = m.fin ?? m.body;
    add(g, sph(0.5, 28, 20), mat, { p: [0, 0.3, 0], s: [len, tall * 1.1, m.flat ? 0.3 : 0.4] });
    tail(g, -len * 0.48, 0.3, fin, 0.35 * (m.fancy ? 1.6 : 1), !m.fancy);
    // dorsal fin (a tall sail on swordfish/marlin, spines on lionfish)
    const finMat = toon(fin, { side: THREE.DoubleSide });
    if (m.sail) add(g, cone(0.3, 0.45, 3), finMat, { p: [-0.02, 0.3 + tall * 0.55 + 0.15, 0], s: [1.2, 1, 0.1] });
    else if (m.spiky) for (let i = 0; i < 7; i++) add(g, cone(0.02, 0.35, 5), finMat, { p: [-0.25 + i * 0.08, 0.3 + tall * 0.5 + 0.12, 0], r: [0, 0, 0.25], outline: false });
    else add(g, cone(0.14, 0.18, 3), finMat, { p: [-0.05, 0.3 + tall * 0.5 + 0.03, 0], s: [1.2, 1, 0.12] });
    // belly + side fins
    add(g, cone(0.07, 0.14, 3), finMat, { p: [0.05, 0.3 - tall * 0.5, 0], r: [Math.PI, 0, 0], s: [1, 1, 0.15] });
    for (const s of [-1, 1]) add(g, cone(0.06, 0.16, 3), finMat, { p: [len * 0.1, 0.26, s * 0.17], r: [0.4 * s, 0, Math.PI / 2 + 0.6], s: [1, 1, 0.2], outline: false });
    if (m.spiky) for (const s of [-1, 1]) for (let i = 0; i < 4; i++) add(g, cone(0.015, 0.4, 4), finMat, { p: [len * 0.08, 0.2, s * (0.15 + i * 0.03)], r: [s * (0.9 + i * 0.2), 0, 0.4], outline: false });
    if (m.finlets) for (let i = 0; i < 4; i++) add(g, cone(0.02, 0.05, 3), toon(fin), { p: [-0.18 - i * 0.07, 0.3 + tall * 0.35, 0], outline: false });
    if (m.bill) add(g, cone(0.035, 0.5, 8), toon(m.body), { p: [len * 0.5 + 0.22, 0.32, 0], r: [0, 0, -Math.PI / 2] });
    if (m.whiskers) for (const s of [-1, 1]) add(g, cyl(0.008, 0.004, 0.22, 4), toon(m.fin ?? '#333'), { p: [len * 0.52, 0.22, s * 0.05], r: [s * 0.4, 0, -1.1], outline: false });
    if (m.crystal) for (let i = 0; i < 6; i++) add(g, new THREE.OctahedronGeometry(0.05), basic('#ffffff', { transparent: true, opacity: 0.8 }), { p: [-0.25 + i * 0.1, 0.3 + Math.sin(i) * 0.1, 0.17], outline: false });
    const ex = len * 0.34, ey = 0.36;
    for (const s of [-1, 1]) eye(g, ex, ey, s * (m.flat ? 0.12 : 0.15), m.fancy ? 0.07 : 0.055);
    add(g, sph(m.bigmouth ? 0.07 : 0.04, 10, 8), basic('#5a1f2a'), { p: [len * 0.49, 0.28, 0], s: [0.5, 1, 1.4], outline: false });
  },
  shark(g, m) {
    const mat = skin(m);
    add(g, sph(0.5, 28, 20), mat, { p: [0, 0.3, 0], s: [1.5, 0.42, 0.42] });
    tail(g, -0.7, 0.36, m.body, 0.45, true);
    add(g, cone(0.18, 0.34, 3), toon(m.body, { side: THREE.DoubleSide }), { p: [0.02, 0.62, 0], s: [1.3, 1, 0.12] });
    for (const s of [-1, 1]) add(g, cone(0.1, 0.34, 3), toon(m.body, { side: THREE.DoubleSide }), { p: [0.15, 0.18, s * 0.2], r: [s * 0.9, 0, 0.3], s: [1, 1, 0.15] });
    if (m.hammer) {
      add(g, sph(0.12, 14, 10), toon(m.body), { p: [0.72, 0.32, 0], s: [0.6, 0.45, 2.2] });
      for (const s of [-1, 1]) eye(g, 0.74, 0.34, s * 0.26, 0.04);
    } else for (const s of [-1, 1]) eye(g, 0.5, 0.36, s * 0.16, 0.04);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) add(g, cyl(0.004, 0.004, 0.1, 3), basic('#3a4a5a'), { p: [0.3 - i * 0.05, 0.3, s * 0.2], outline: false });
    add(g, cone(0.06, 0.2, 3), basic('#ffffff'), { p: [0.6, 0.2, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 1.4], outline: false });
  },
  puffer(g, m) {
    add(g, sph(0.34, 24, 18), skin({ ...m, pattern: 'spots' }), { p: [0, 0.34, 0] });
    for (let i = 0; i < 40; i++) {
      const v = new THREE.Vector3(Math.sin(i * 2.4) * Math.cos(i), Math.cos(i * 1.7), Math.sin(i * 1.3)).normalize();
      const sp = add(g, cone(0.03, 0.12, 5), toon(m.fin ?? '#c9a83e'), { p: [v.x * 0.36, 0.34 + v.y * 0.36, v.z * 0.36], outline: false });
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
    }
    tail(g, -0.34, 0.34, m.fin ?? m.body, 0.2, false);
    for (const s of [-1, 1]) eye(g, 0.22, 0.44, s * 0.2, 0.07);
    add(g, sph(0.05, 10, 8), basic('#5a1f2a'), { p: [0.35, 0.32, 0], outline: false });
  },
  squid(g, m) {
    const mat = toon(m.body);
    add(g, cone(0.2, 0.7, 16), mat, { p: [-0.15, 0.35, 0], r: [0, 0, Math.PI / 2] });
    add(g, cone(0.22, 0.2, 3), mat, { p: [-0.5, 0.35, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.2] });
    add(g, sph(0.19, 18, 14), mat, { p: [0.28, 0.35, 0] });
    for (const s of [-1, 1]) eye(g, 0.34, 0.42, s * 0.15, 0.06);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      add(g, cyl(0.03, 0.012, 0.45, 6), toon(m.pat ?? m.body), { p: [0.58, 0.35 + Math.sin(a) * 0.08, Math.cos(a) * 0.08], r: [0, 0, -Math.PI / 2 + Math.sin(a * 3) * 0.2], outline: false });
    }
  },
  octopus(g, m) {
    const mat = toon(m.body);
    add(g, sph(0.3, 22, 16), mat, { p: [0, 0.5, 0], s: [1, 1.2, 1] });
    for (const s of [-1, 1]) eye(g, 0.2, 0.46, s * 0.14, 0.07);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, pts = [];
      for (let k = 0; k < 5; k++) pts.push(new THREE.Vector3(Math.cos(a) * (0.15 + k * 0.1), 0.3 - k * 0.06 + Math.sin(k + i) * 0.03, Math.sin(a) * (0.15 + k * 0.1)));
      add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 6), mat, { outline: false });
    }
  },
  ray(g, m) {
    const mat = skin({ ...m, pattern: 'spots' });
    add(g, sph(0.5, 24, 12), mat, { p: [0, 0.2, 0], s: [0.8, 0.12, 1.1] });
    add(g, cyl(0.02, 0.008, 0.8, 6), toon(m.body), { p: [-0.75, 0.2, 0], r: [0, 0, Math.PI / 2] });
    for (const s of [-1, 1]) eye(g, 0.25, 0.27, s * 0.12, 0.04);
  },
  eel(g, m) {
    const pts = [];
    for (let i = 0; i <= 14; i++) pts.push(new THREE.Vector3(0.6 - i * 0.09, 0.3 + Math.sin(i * 0.9) * 0.08, Math.cos(i * 0.7) * 0.06));
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.08, 10), skin(m), {});
    add(g, sph(0.1, 14, 10), toon(m.body), { p: [0.62, 0.32, 0], s: [1.3, 0.9, 0.9] });
    for (const s of [-1, 1]) eye(g, 0.68, 0.36, s * 0.07, 0.035);
    if (m.crest) for (let i = 0; i < 9; i++) add(g, cone(0.04, 0.16, 4), toon('#b77bff'), { p: [0.55 - i * 0.11, 0.42 + Math.sin(i * 0.9) * 0.08, 0], outline: false });
  },
  jelly(g, m) {
    const mat = toon(m.body, { transparent: true, opacity: 0.8 });
    add(g, new THREE.SphereGeometry(0.3, 22, 12, 0, TAU, 0, Math.PI / 2), mat, { p: [0, 0.45, 0] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      add(g, cyl(0.01, 0.006, 0.4, 4), mat, { p: [Math.cos(a) * 0.18, 0.26, Math.sin(a) * 0.18], r: [Math.sin(i) * 0.2, 0, Math.cos(i) * 0.2], outline: false });
    }
    const glow = new THREE.Sprite(additive(glowTexture, new THREE.Color(m.body).getHex(), 0.5));
    glow.scale.setScalar(0.9); glow.position.y = 0.5; g.add(glow);
  },
  turtle(g, m) {
    add(g, sph(0.34, 20, 12), toon(m.pat ?? '#8b6a3e'), { p: [0, 0.3, 0], s: [1.2, 0.5, 1] });
    for (let i = 0; i < 5; i++) add(g, cyl(0.08, 0.08, 0.02, 6), toon('#a88050'), { p: [-0.2 + i * 0.1, 0.47, (i % 2) * 0.1 - 0.05], outline: false });
    add(g, sph(0.12, 14, 10), toon(m.body), { p: [0.46, 0.3, 0] });
    for (const s of [-1, 1]) eye(g, 0.53, 0.35, s * 0.06, 0.03);
    for (const [x, z] of [[0.25, 0.3], [-0.25, 0.28]]) for (const s of [-1, 1]) add(g, sph(0.09, 10, 8), toon(m.body), { p: [x, 0.24, s * z], s: [1.8, 0.4, 0.8] });
  },
  crab(g, m) {
    const mat = toon(m.body);
    add(g, sph(0.3, 20, 14), mat, { p: [0, 0.25, 0], s: [1, 0.5, 1.3] });
    for (const s of [-1, 1]) {
      add(g, cyl(0.02, 0.02, 0.12, 6), mat, { p: [0.18, 0.4, s * 0.08], outline: false });
      eye(g, 0.18, 0.47, s * 0.08, 0.04);
      add(g, sph(0.1, 12, 10), mat, { p: [0.32, 0.26, s * 0.35], s: [1.4, 0.7, 0.8] });
      for (let k = 0; k < 3; k++) add(g, cyl(0.02, 0.015, 0.3, 5), mat, { p: [-0.1 + k * 0.1, 0.15, s * 0.4], r: [s * 1.1, 0, 0], outline: false });
    }
  },
  angler(g, m) {
    add(g, sph(0.4, 24, 18), skin(m), { p: [0, 0.34, 0], s: [1, 0.85, 0.85] });
    tail(g, -0.38, 0.34, m.body, 0.25, false);
    for (let i = 0; i < 6; i++) add(g, cone(0.025, 0.1, 4), basic('#ffffff'), { p: [0.36, 0.26 + (i % 2) * 0.02, -0.15 + i * 0.06], r: [0, 0, i % 2 ? 0 : Math.PI], outline: false });
    for (const s of [-1, 1]) eye(g, 0.24, 0.48, s * 0.18, 0.05);
    const pts = [new THREE.Vector3(0.1, 0.66, 0), new THREE.Vector3(0.3, 0.86, 0), new THREE.Vector3(0.52, 0.74, 0)];
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.015, 5), toon(m.body), { outline: false });
    add(g, sph(0.06, 12, 10), basic('#fff6a0'), { p: [0.54, 0.7, 0], outline: false });
    const glow = new THREE.Sprite(additive(glowTexture, 0xfff08a, 0.9));
    glow.scale.setScalar(0.4); glow.position.set(0.54, 0.7, 0); g.add(glow);
  },
  boot(g) {
    const brown = toon('#6b4a2b');
    add(g, sph(0.2, 16, 12), brown, { p: [0.18, 0.12, 0], s: [1.6, 0.6, 0.9] });
    add(g, cyl(0.16, 0.18, 0.5, 14), brown, { p: [-0.1, 0.35, 0] });
    add(g, cyl(0.19, 0.19, 0.06, 14), toon('#4a2e1c'), { p: [-0.1, 0.62, 0] });
    add(g, new THREE.BoxGeometry(0.55, 0.05, 0.3), toon('#2a1a12'), { p: [0.1, 0.02, 0] });
  },
  can(g) {
    add(g, cyl(0.16, 0.16, 0.45, 18), shiny('#b8c0d0'), { p: [0, 0.23, 0], r: [0, 0, 0.3] });
    add(g, cyl(0.165, 0.165, 0.22, 18), toon('#e0463c'), { p: [0, 0.23, 0], r: [0, 0, 0.3], outline: false });
  },
  weed(g) {
    for (let i = 0; i < 7; i++) {
      const pts = [];
      for (let k = 0; k < 5; k++) pts.push(new THREE.Vector3((i - 3) * 0.06 + Math.sin(k + i) * 0.06, k * 0.14, Math.cos(i) * 0.05));
      add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.025, 5), toon(i % 2 ? '#3f8a3a' : '#5fae55'), { outline: false });
    }
  },
};

/** Build the model for a catalog fish entry. */
export function buildFishModel(fish) {
  const g = new THREE.Group();
  const m = fish?.model ?? { shape: 'fish', body: '#8fa0b8' };
  (SHAPES[m.shape] ?? SHAPES.fish)(g, m);
  return g;
}

// ---- side-on snapshots for the catch card and the journal ----
const thumbs = new Map();
let rig = null;
export function fishThumb(fish) {
  if (thumbs.has(fish.name)) return thumbs.get(fish.name);
  if (!rig) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(200, 140, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7aa8, 2.2));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(2, 4, 5);
    scene.add(key);
    rig = { renderer, scene, camera: new THREE.PerspectiveCamera(28, 200 / 140, 0.05, 50) };
  }
  const { renderer, scene, camera } = rig;
  const g = buildFishModel(fish);
  g.rotation.y = -0.35;
  if (['ray', 'crab', 'octopus'].includes(fish.model?.shape)) g.rotation.x = fish.model.shape === 'ray' ? 0.95 : 0.3; // flat ones tilt up to the camera
  scene.add(g);
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g, true);
  const c = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y * 1.4, size.z) * 0.62 + 0.05;
  camera.position.set(c.x, c.y + r * 0.35, c.z + r / Math.tan((camera.fov * Math.PI) / 360));
  camera.lookAt(c);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL();
  scene.remove(g);
  thumbs.set(fish.name, url);
  return url;
}
