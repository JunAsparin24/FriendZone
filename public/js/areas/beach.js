// Coral Cove: the beach town through the portal. A long sandy beach with the sea to the south, a
// boardwalk of beach huts and shops, a pier with a lighthouse and a Ferris wheel. Things to do:
//   Surf Rush   – the surf shack's arcade game (high scores on the shack's board)
//   Crab Races  – bet on one of four crabs; they race on a sand track for everyone to watch
//   Treasure    – your metal detector beeps faster near buried treasure; dig (F) to find it
import * as THREE from 'three';
import { net } from '../net.js';
import { S, fmt, esc, toast, me } from '../state.js';
import { toon, shiny, basic, canvasTexture, additive, glowTexture, outlineMaterial, TAU } from '../three/materials.js';
import { letterSign } from '../three/signs3d.js';
import { arcadeCabinet } from '../games/arcadegames.js';
import { sfx } from '../sfx.js';
import { listen, onKeys } from '../games/util.js';

// the walkable area (world units); the sea is to the south (+z)
const X0 = -225, X1 = 225, Z0 = -150, Z1 = 116; // (Maplewood is 360 x 240)
const PIER_X = 120, PIER_W = 5;
export const shoreZ = (x) => 62 + Math.sin(x / 23) * 4 + Math.sin(x / 9 + 1) * 1.6;
/** Height of the ground here: up the ramp and along the pier, otherwise the beach. */
const pierY = (x, z) => (Math.abs(x - PIER_X) < PIER_W / 2 + 0.3 && z > 54 ? 0.85 * Math.min(1, (z - 54) / 6) : 0);
const CRAB_TRACK = { x0: 44, x1: 96, z: 16 }; // crabs run from x0 to x1 in 4 lanes around z
const CRAB_COLORS = ['#e0463c', '#ff9f43', '#3b82f6', '#9b59ff'];
const OUT = outlineMaterial(0.04);

const rnd = (a, b) => a + Math.random() * (b - a);
let seed = 7;
const srand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const sr = (a, b) => a + srand() * (b - a);

function add(parent, geo, mat, { p = [0, 0, 0], r = null, s = null, outline = false, cast = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  if (s) m.scale.set(...s);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (outline) m.add(new THREE.Mesh(geo, OUT));
  parent.add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (a, b, h, n = 12) => new THREE.CylinderGeometry(a, b, h, n);
const sph = (r, a = 14, b = 10) => new THREE.SphereGeometry(r, a, b);

/** Merge several geometries (each already transformed) into one, for instancing. */
function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
const tf = (g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));

/** Many copies of one geometry: [{ x, y, z, ry, s, color }]. */
function instanced(parent, geo, mat, list, { outline = true, cast = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach((it, i) => {
    e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    q.setFromEuler(e);
    const s = it.s ?? 1;
    m.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), q, new THREE.Vector3(it.sx ?? s, it.sy ?? s, it.sz ?? s));
    im.setMatrixAt(i, m);
    if (it.color) im.setColorAt(i, new THREE.Color(it.color));
  });
  im.castShadow = cast;
  im.receiveShadow = true;
  parent.add(im);
  if (outline) {
    const ol = new THREE.InstancedMesh(geo, OUT, list.length);
    for (let i = 0; i < list.length; i++) { im.getMatrixAt(i, m); ol.setMatrixAt(i, m); }
    parent.add(ol);
  }
  return im;
}

// ---- textures -----------------------------------------------------------------------------------
const sandTex = canvasTexture(256, 256, (c) => {
  c.fillStyle = '#f2d9a0'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    c.fillStyle = Math.random() < 0.5 ? 'rgba(200,160,90,.25)' : 'rgba(255,245,215,.4)';
    c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
}, { repeat: [60, 40] });
const grassTex = canvasTexture(256, 256, (c) => {
  c.fillStyle = '#7cc46a'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(60,130,60,.3)' : 'rgba(170,230,130,.3)'; c.fillRect(Math.random() * 256, Math.random() * 256, 2, 5); }
}, { repeat: [50, 16] });
const plankTex = canvasTexture(256, 256, (c) => {
  c.fillStyle = '#c99a62'; c.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) { c.fillStyle = 'rgba(80,45,15,.35)'; c.fillRect(0, y + 29, 256, 3); for (let k = 0; k < 5; k++) { c.fillStyle = 'rgba(80,45,15,.12)'; c.fillRect((k * 61 + y * 3) % 256, y + 6, 30, 2); } }
});
const plank = (rx, ry) => { const t = plankTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true; return new THREE.MeshToonMaterial({ map: t, gradientMap: toon('#fff').gradientMap }); };
const stripeTex = (a, b) => canvasTexture(128, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect(i * 16, 0, 16, 64); } });

// ---- the scene ---------------------------------------------------------------------------------
function buildBeach() {
  const g = new THREE.Group();
  const anim = [], solids = [], spots = {};
  seed = 7;

  // ground: grassy town in the north, sand down to the sea, wet sand at the water's edge
  // (shapes are drawn in x/y and laid flat, so their y becomes the world's z)
  const sandShape = new THREE.Shape();
  sandShape.moveTo(X0 - 100, -200); sandShape.lineTo(X1 + 100, -200);
  for (let x = X1 + 100; x >= X0 - 100; x -= 4) sandShape.lineTo(x, shoreZ(x) + 3);
  sandTex.repeat.set(0.12, 0.12);
  const ground = add(g, new THREE.ShapeGeometry(sandShape), new THREE.MeshToonMaterial({ map: sandTex, side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap }), { r: [Math.PI / 2, 0, 0], cast: false });
  // the seabed, seen through the water
  add(g, new THREE.PlaneGeometry(800, 500), toon('#c9b27a'), { p: [0, -1.6, 300], r: [-Math.PI / 2, 0, 0], cast: false });
  const grassShape = new THREE.Shape();
  grassShape.moveTo(X0 - 100, -200); grassShape.lineTo(X1 + 100, -200);
  for (let x = X1 + 100; x >= X0 - 100; x -= 10) grassShape.lineTo(x, -20 + Math.sin(x / 17) * 2);
  const grass = add(g, new THREE.ShapeGeometry(grassShape), new THREE.MeshToonMaterial({ map: grassTex, gradientMap: toon('#fff').gradientMap }), { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0], cast: false });
  grassTex.repeat.set(0.05, 0.05);
  grass.material.side = THREE.DoubleSide;
  // wet sand strip
  const wetPts = [];
  for (let x = X0 - 100; x <= X1 + 100; x += 4) wetPts.push(x);
  const wetGeo = new THREE.BufferGeometry();
  const wv = [];
  wetPts.forEach((x, i) => { if (i === 0) return; const xa = wetPts[i - 1]; const za = shoreZ(xa), zb = shoreZ(x); wv.push(xa, 0.03, za - 5, x, 0.03, zb - 5, x, 0.03, zb + 2, xa, 0.03, za - 5, x, 0.03, zb + 2, xa, 0.03, za + 2); });
  wetGeo.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3));
  wetGeo.computeVertexNormals();
  add(g, wetGeo, toon('#d9b877', { side: THREE.DoubleSide }), { cast: false });

  // the sea: a big wavy plane, turquoise near the shore and deep blue further out
  const seaGeo = new THREE.PlaneGeometry(700, 420, 140, 70);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(0, 0, 60 + 210 - 8);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);
  const cols = [];
  for (let i = 0; i < seaGeo.attributes.position.count; i++) {
    const z = seaBase[i * 3 + 2];
    const c = new THREE.Color('#3fd0d4').lerp(new THREE.Color('#1c6fb8'), Math.min(1, Math.max(0, (z - 70) / 90)));
    cols.push(c.r, c.g, c.b);
  }
  seaGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sea = add(g, seaGeo, new THREE.MeshToonMaterial({ vertexColors: true, transparent: true, opacity: 0.92, gradientMap: toon('#fff').gradientMap }), { p: [0, -0.35, 0], cast: false });
  let seaT = 0;
  anim.push((t, dt) => {
    if ((seaT += dt) < 1 / 30) return; // the sea only needs updating 30 times a second
    seaT = 0;
    const pos = seaGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
      const calm = Math.min(1, Math.max(0.15, (z - 62) / 30)); // flatter right at the shore
      pos.setY(i, (Math.sin(x * 0.09 + t * 1.3) * 0.18 + Math.sin(z * 0.14 - t * 1.8) * 0.28 + Math.sin((x + z) * 0.05 + t * 0.7) * 0.2) * calm);
    }
    pos.needsUpdate = true;
    seaGeo.computeVertexNormals();
  });
  // foam lapping at the shore
  const foamMat = basic('#ffffff', { transparent: true, opacity: 0.7, depthWrite: false });
  const foam = [];
  for (let k = 0; k < 2; k++) {
    const fv = [];
    wetPts.forEach((x, i) => { if (i === 0) return; const xa = wetPts[i - 1]; const za = shoreZ(xa), zb = shoreZ(x); fv.push(xa, 0, za, x, 0, zb, x, 0, zb + 0.9, xa, 0, za, x, 0, zb + 0.9, xa, 0, za + 0.9); });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fv, 3));
    const f = add(g, fg, foamMat.clone(), { p: [0, 0.06, 0], cast: false });
    f.material.side = THREE.DoubleSide;
    foam.push(f);
  }
  anim.push((t) => foam.forEach((f, k) => { const w = (t * 0.35 + k * 0.5) % 1; f.position.z = -1.5 + w * 3; f.material.opacity = 0.75 * Math.sin(w * Math.PI); }));
  // the water is in the way, except along the pier
  solids.push({ x: (X0 + PIER_X - PIER_W / 2) / 2 - 50, z: 140, w: PIER_X - PIER_W / 2 - X0 + 100, d: 2 * (140 - 66) });
  solids.push({ x: (PIER_X + PIER_W / 2 + X1) / 2 + 50, z: 140, w: X1 - PIER_X - PIER_W / 2 + 100, d: 2 * (140 - 66) });

  // ---- the boardwalk: north-south from the portal to the sand, then along the top of the beach
  add(g, box(7, 0.2, 100), plank(2, 30), { p: [0, 0.1, -65], cast: false });
  add(g, box(420, 0.2, 7), plank(126, 2), { p: [0, 0.1, -15], cast: false });
  for (let x = -208; x <= 208; x += 8) for (const z of [-18.6, -11.4]) add(g, cyl(0.12, 0.12, 1, 6), toon('#8b5a2b'), { p: [x, 0.5, z] });
  // lamps along it
  for (let x = -196; x <= 196; x += 28) {
    for (const z of [-19.5, -10.5]) {
      add(g, cyl(0.1, 0.14, 4, 8), toon('#2b2f4a'), { p: [x + (z > -15 ? 14 : 0), 2, z] });
      add(g, sph(0.35), basic('#fff3c4'), { p: [x + (z > -15 ? 14 : 0), 4.2, z], cast: false });
    }
  }

  // ---- the portal home, at the top of the boardwalk
  const portal = new THREE.Group();
  portal.position.set(0, 0, -112);
  g.add(portal);
  const stone = toon('#b8b2c8');
  add(portal, new THREE.TorusGeometry(4.2, 0.7, 12, 40, Math.PI), stone, { p: [0, 3.2, 0], outline: true });
  for (const sx of [-1, 1]) add(portal, box(1.4, 3.2, 1.4), stone, { p: [sx * 4.2, 1.6, 0], outline: true });
  const swirlTex = canvasTexture(256, 256, (c) => {
    const gr = c.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#8ff2ff'); gr.addColorStop(0.8, '#5a7bff'); gr.addColorStop(1, 'rgba(90,60,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 6;
    for (let k = 0; k < 5; k++) { c.beginPath(); for (let a = 0; a < 9; a += 0.1) { const r = a * 13; c.lineTo(128 + Math.cos(a + k * 1.25) * r, 128 + Math.sin(a + k * 1.25) * r); } c.stroke(); }
  });
  const swirl = add(portal, new THREE.CircleGeometry(3.6, 40), new THREE.MeshBasicMaterial({ map: swirlTex, transparent: true, side: THREE.DoubleSide }), { p: [0, 3.2, 0], cast: false });
  const pglow = new THREE.Sprite(additive(glowTexture, 0x7fe8ff, 0.5));
  pglow.scale.set(12, 12, 1); pglow.position.set(0, 3.2, 0.3);
  portal.add(pglow);
  anim.push((t) => { swirl.rotation.z = -t * 1.4; pglow.material.opacity = 0.4 + Math.sin(t * 2) * 0.12; });
  const home = letterSign('TO MAPLEWOOD', { font: 'chunky', w: 7, h: 0.8, face: '#ffffff', side: '#5a7bff', depth: 0.2 });
  home.position.set(0, 8.3, 0);
  portal.add(home);
  spots.portal = { x: 0, z: -110, spawn: -92 };

  // ---- welcome sign
  const welcome = new THREE.Group();
  welcome.position.set(0, 0, -86);
  welcome.rotation.y = Math.PI;
  g.add(welcome);
  for (const sx of [-1, 1]) add(welcome, cyl(0.25, 0.3, 6, 8), toon('#8b5a2b'), { p: [sx * 8.5, 3, 0], outline: true });
  add(welcome, box(18, 3.2, 0.4), plank(6, 1), { p: [0, 5, -0.3], outline: true });
  const ws = letterSign('Coral Cove', { font: 'script', even: false, w: 15, h: 2.2, face: '#ffffff', side: '#ff7a59', depth: 0.3 });
  ws.position.set(0, 3.9, 0);
  welcome.add(ws);
  for (let i = 0; i < 6; i++) add(welcome, sph(0.4), toon(['#ff7aa8', '#ffd84d', '#6ee7c0'][i % 3]), { p: [-8 + i * 3.2, 6.8, 0], s: [1, 0.5, 1] });

  // ---- beach huts along the north side of the boardwalk
  const hutCols = ['#ff7aa8', '#6ee7c0', '#ffd84d', '#7cc0ff', '#ff9f43', '#c59bff', '#ffffff'];
  const huts = [];
  for (let x = -200; x <= 200; x += 9) {
    if (Math.abs(x) < 16 || (x > 40 && x < 70) || (x < -45 && x > -75)) continue;
    huts.push({ x, z: -24.5, color: hutCols[Math.abs(Math.round(x / 9)) % hutCols.length] });
  }
  const hutBody = merge([tf(box(6, 4.2, 5), { p: [0, 2.1, 0] })]);
  const roofShape = new THREE.Shape([new THREE.Vector2(-3.6, 0), new THREE.Vector2(3.6, 0), new THREE.Vector2(0, 2.2)]);
  const hutRoof = tf(new THREE.ExtrudeGeometry(roofShape, { depth: 5.8, bevelEnabled: false }), { p: [0, 4.2, -2.9] });
  instanced(g, hutBody, toon('#ffffff'), huts);
  instanced(g, hutRoof, toon('#ffffff'), huts.map((h) => ({ ...h, color: new THREE.Color(h.color).multiplyScalar(0.72).getStyle() })));
  const hutDoor = tf(box(1.6, 2.6, 0.12), { p: [0, 1.3, 2.52] });
  instanced(g, hutDoor, toon('#ffffff'), huts.map((h) => ({ ...h, color: '#fffaf0' })), { outline: false });
  for (const h of huts) solids.push({ x: h.x, z: h.z, w: 6.4, d: 5.4 });

  // ---- palm trees (instanced: trunk, leaves, coconuts)
  const trunkParts = [];
  for (let i = 0; i < 7; i++) trunkParts.push(tf(cyl(0.34 - i * 0.03, 0.4 - i * 0.03, 1.15, 8), { p: [i * i * 0.022, 0.55 + i * 1.05, 0], r: [0, 0, -i * 0.035] }));
  const trunkGeo = merge(trunkParts);
  const crownTop = [0.36 * 1.0 + 0.95, 7.5, 0];
  const leafParts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const leaf = new THREE.BufferGeometry();
    // a long drooping leaf: a strip of quads that arcs down
    const v = [];
    const seg = 6;
    for (let k = 0; k < seg; k++) {
      const u0 = k / seg, u1 = (k + 1) / seg;
      const pt = (u, side) => { const r = u * 3.6, w = Math.sin(u * Math.PI) * 0.55 * side; const y = 0.5 * u - 2.4 * u * u; return [Math.cos(a) * r - Math.sin(a) * w, y, Math.sin(a) * r + Math.cos(a) * w]; };
      const [a0, a1, b0, b1] = [pt(u0, -1), pt(u0, 1), pt(u1, -1), pt(u1, 1)];
      v.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      v.push(...a0, ...a1, ...b0, ...a1, ...b1, ...b0);
    }
    leaf.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    leaf.computeVertexNormals();
    leafParts.push(tf(leaf, { p: crownTop }));
  }
  const leafGeo = merge(leafParts);
  const nutGeo = merge([0, 1, 2].map((k) => tf(sph(0.26, 8, 6), { p: [crownTop[0] + Math.cos(k * 2.1) * 0.35, crownTop[1] - 0.35, Math.sin(k * 2.1) * 0.35] })));
  const palms = [];
  const palmAt = (x, z, s = sr(0.85, 1.25)) => { palms.push({ x, z, s, ry: sr(0, TAU) }); solids.push({ x, z, r: 0.6 * s }); };
  for (let x = -206; x <= 206; x += 14) { if (Math.abs(x) > 8) { palmAt(x + sr(-2, 2), -7.5 + sr(-1, 1)); } }
  for (let i = 0; i < 44; i++) { const x = sr(-218, 218), z = sr(-145, -32); if (Math.abs(x) > 12 && Math.hypot(x + 128, z + 62) > 16 && Math.hypot(x, z + 86) > 14) palmAt(x, z); }
  for (let i = 0; i < 14; i++) { const x = sr(-215, 215); const z = sr(40, 52); if (!(x > 30 && x < 110) && Math.abs(x - PIER_X) > 10) palmAt(x, z - 20); }
  instanced(g, trunkGeo, toon('#a8743f'), palms);
  instanced(g, leafGeo, toon('#3fae4f', { side: THREE.DoubleSide }), palms, { outline: false });
  instanced(g, nutGeo, toon('#6b4226'), palms, { outline: false });

  // ---- umbrellas and towels scattered on the sand
  const umbCols = ['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#ff9f43', '#c59bff'];
  const umbs = [];
  for (let i = 0; i < 46; i++) {
    const x = sr(-205, 205), z = sr(6, 50);
    if ((x > 35 && x < 105 && z < 32) || (x > -85 && x < -50 && z < 16) || Math.abs(x - PIER_X) < 8 || (x > -40 && x < -18 && z > 28 && z < 44)) continue;
    umbs.push({ x, z, color: umbCols[i % umbCols.length], ry: sr(0, TAU), rz: sr(-0.15, 0.15) });
  }
  const poleGeo = tf(cyl(0.06, 0.06, 3.2, 6), { p: [0, 1.6, 0] });
  const canopyGeo = tf(new THREE.ConeGeometry(2.3, 0.9, 10, 1, true), { p: [0, 3.2, 0] });
  instanced(g, poleGeo, toon('#ffffff'), umbs.map((u) => ({ ...u, color: '#f4f0ea' })), { outline: false });
  instanced(g, canopyGeo, toon('#ffffff', { side: THREE.DoubleSide }), umbs);
  const towelGeo = tf(box(1.4, 0.04, 2.6), { p: [1.6, 0.03, 0.6] });
  instanced(g, towelGeo, toon('#ffffff'), umbs.map((u, i) => ({ ...u, rz: 0, color: umbCols[(i + 2) % umbCols.length] })), { outline: false, cast: false });

  // ---- surf shack (Surf Rush)
  const shack = new THREE.Group();
  shack.position.set(-66, 0, 10);
  shack.rotation.y = Math.PI;
  g.add(shack);
  add(shack, box(10, 0.4, 8), plank(3, 3), { p: [0, 0.2, 0], outline: true });
  add(shack, box(9, 4, 0.3), plank(3, 1.3), { p: [0, 2.4, -3.6], outline: true });
  for (const sx of [-1, 1]) add(shack, box(0.3, 4, 7), plank(2, 1.3), { p: [sx * 4.5, 2.4, 0], outline: true });
  const thatch = add(shack, new THREE.ConeGeometry(7.6, 2.6, 4, 1), toon('#d9b56a'), { p: [0, 5.6, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.8], outline: true });
  thatch.castShadow = true;
  add(shack, box(8, 1.2, 1), plank(3, 1), { p: [0, 1.0, 3.2], outline: true });
  // surfboards leaning on the front
  ['#ff5d73', '#39c6ff', '#ffd84d', '#6ee7a0'].forEach((c, i) => {
    const b = add(shack, sph(1, 16, 10), toon(c), { p: [-5.8 + (i % 2) * 11.6 + (i > 1 ? (i === 2 ? 0.9 : -0.9) : 0), 1.8, 1 + (i > 1 ? 1 : 0)], s: [0.35, 1.8, 0.08], r: [0.1, 0, (i % 2 ? -1 : 1) * 0.12], outline: true });
    add(b, box(0.1, 1.9, 0.5), toon('#ffffff'), { p: [0, 0, 0], cast: false });
  });
  const surfSign = letterSign('SURF RUSH', { font: 'chunky', w: 7, h: 1, face: '#ffffff', side: '#39c6ff', depth: 0.2 });
  surfSign.position.set(0, 7.2, 0);
  shack.add(surfSign);
  solids.push({ x: -66, z: 11, w: 10, d: 8 });
  spots.surf = { x: -66, z: 4.5 };

  // ---- crab race track + bleachers + betting booth
  const track = new THREE.Group();
  g.add(track);
  const { x0, x1, z: tz } = CRAB_TRACK;
  add(track, box(x1 - x0 + 6, 0.08, 10), toon('#e8c98c'), { p: [(x0 + x1) / 2, 0.04, tz], cast: false });
  for (let l = 0; l <= 4; l++) add(track, box(x1 - x0 + 6, 0.1, 0.12), toon('#ffffff'), { p: [(x0 + x1) / 2, 0.08, tz - 5 + l * 2.5], cast: false });
  for (let k = 0; k < 10; k++) for (let j = 0; j < 2; j++) add(track, box(0.5, 0.12, 0.5), toon((k + j) % 2 ? '#1d1b2e' : '#ffffff'), { p: [x1 + 0.25 + j * 0.5, 0.09, tz - 4.75 + k * 1 + 0.5 * 0], cast: false });
  add(track, box(0.2, 0.12, 10), toon('#e0463c'), { p: [x0, 0.09, tz], cast: false });
  // rope fence round it
  for (let x = x0 - 3; x <= x1 + 3; x += 4) for (const z of [tz - 5.2, tz + 5.2]) add(track, cyl(0.08, 0.08, 1, 6), toon('#8b5a2b'), { p: [x, 0.5, z] });
  for (const z of [tz - 5.2, tz + 5.2]) add(track, cyl(0.04, 0.04, x1 - x0 + 6, 6), toon('#e0463c'), { p: [(x0 + x1) / 2, 0.9, z], r: [0, 0, Math.PI / 2], cast: false });
  // bleachers on the north side
  for (let row = 0; row < 3; row++) add(track, box(x1 - x0, 0.5, 1.4), plank(10, 1), { p: [(x0 + x1) / 2, 0.25 + row * 0.6, tz - 7.5 - row * 1.4], outline: true });
  solids.push({ x: (x0 + x1) / 2, z: tz - 9, w: x1 - x0, d: 4.4 });
  solids.push({ x: (x0 + x1) / 2, z: tz, w: x1 - x0 + 6, d: 10.4 });
  // the crabs
  const crabs = CRAB_COLORS.map((c, i) => {
    const cg = new THREE.Group();
    cg.position.set(x0, 0, tz - 3.75 + i * 2.5);
    cg.scale.setScalar(1.6);
    track.add(cg);
    const mat = toon(c);
    const bodyM = add(cg, sph(0.55, 14, 10), mat, { p: [0, 0.45, 0], s: [1.25, 0.6, 1], outline: true });
    for (const sz of [-1, 1]) {
      add(cg, cyl(0.05, 0.05, 0.5, 6), mat, { p: [0.35, 0.8, sz * 0.2] });
      add(cg, sph(0.1, 8, 6), toon('#ffffff'), { p: [0.35, 1.05, sz * 0.2], outline: true });
      add(cg, sph(0.05, 6, 4), basic('#1d1b2e'), { p: [0.43, 1.07, sz * 0.2], cast: false });
      const claw = add(cg, sph(0.25, 10, 8), mat, { p: [0.75, 0.55, sz * 0.55], s: [1.2, 0.7, 0.6], outline: true });
      claw.userData.base = claw.position.y;
      for (let k = 0; k < 3; k++) add(cg, cyl(0.04, 0.04, 0.6, 5), mat, { p: [-0.2 + k * 0.25, 0.3, sz * 0.62], r: [sz * 0.9, 0, 0] });
    }
    const num = letterSign(String(i + 1), { font: 'chunky', w: 0.6, h: 0.6, face: '#ffffff', side: c, depth: 0.12 });
    num.position.set(0, 1.35, 0);
    num.rotation.y = Math.PI;
    cg.add(num);
    return cg;
  });
  // betting booth with a striped awning
  const booth = new THREE.Group();
  booth.position.set(38, 0, 8);
  booth.rotation.y = Math.PI;
  g.add(booth);
  add(booth, box(4, 2.2, 3), toon('#ffffff'), { p: [0, 1.1, 0], outline: true });
  add(booth, box(4.6, 0.2, 3.6), new THREE.MeshToonMaterial({ map: stripeTex('#e0463c', '#ffffff'), gradientMap: toon('#fff').gradientMap }), { p: [0, 2.9, 0.3], r: [0.2, 0, 0], outline: true });
  for (const sx of [-1, 1]) add(booth, cyl(0.08, 0.08, 2.8, 6), toon('#ffffff'), { p: [sx * 2.1, 1.4, 1.9] });
  const crabSign = letterSign('CRAB RACES', { font: 'chunky', w: 5.5, h: 0.9, face: '#ffffff', side: '#e0463c', depth: 0.2 });
  crabSign.position.set(0, 3.6, 0);
  booth.add(crabSign);
  solids.push({ x: 38, z: 8, w: 4.4, d: 3.4 });
  spots.crabs = { x: 38, z: 4.5 };

  // ---- treasure hut: a pirate-y shack where you learn about the detector
  const dig = new THREE.Group();
  dig.position.set(-28, 0, 36);
  dig.rotation.y = Math.PI;
  g.add(dig);
  add(dig, box(5, 3, 4), plank(2, 1), { p: [0, 1.5, 0], outline: true });
  add(dig, new THREE.ConeGeometry(4.2, 2, 4), toon('#6b4226'), { p: [0, 4, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.85], outline: true });
  add(dig, box(1.5, 1, 1), toon('#8b5a2b'), { p: [3.4, 0.5, 1.2], outline: true }); // chest
  add(dig, box(1.6, 0.35, 1.1), shiny('#ffc53d'), { p: [3.4, 1.15, 1.2] });
  add(dig, cyl(0.05, 0.05, 2, 6), toon('#8b5a2b'), { p: [-3, 1, 1.8], r: [0.3, 0, 0.2] }); // shovel
  add(dig, box(0.5, 0.7, 0.06), toon('#9aa3b8'), { p: [-3.1, 0.2, 2.1], r: [0.3, 0, 0.2] });
  const flagG = add(dig, cyl(0.05, 0.05, 4, 6), toon('#2b2f4a'), { p: [0, 6, 0] });
  add(flagG, box(1.4, 0.9, 0.04), toon('#1d1b2e'), { p: [0.7, 1.4, 0] });
  add(flagG, sph(0.2, 8, 6), toon('#ffffff'), { p: [0.6, 1.45, 0.03], s: [1, 1, 0.3] });
  const digSign = letterSign('TREASURE', { font: 'medieval', w: 5, h: 0.9, face: '#ffd84d', side: '#6b4226', depth: 0.2 });
  digSign.position.set(0, 3.1, 2.05);
  dig.add(digSign);
  solids.push({ x: -28, z: 36, w: 5.4, d: 4.4 });
  spots.dig = { x: -28, z: 32 };

  // ---- lifeguard tower
  const lg = new THREE.Group();
  lg.position.set(14, 0, 44);
  g.add(lg);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(lg, cyl(0.12, 0.12, 3.2, 6), toon('#ffffff'), { p: [sx * 1.1, 1.6, sz * 1.1] });
  add(lg, box(3, 2, 3), toon('#e0463c'), { p: [0, 4.2, 0], outline: true });
  add(lg, box(3.6, 0.2, 3.6), toon('#ffffff'), { p: [0, 5.3, 0], outline: true });
  add(lg, box(2.2, 1, 0.1), toon('#9fe6ff', { emissive: '#9fe6ff', emissiveIntensity: 0.2 }), { p: [0, 4.4, 1.52] });
  add(lg, box(1, 0.1, 3), plank(1, 2), { p: [0, 1.4, 2.4], r: [0.8, 0, 0] });
  solids.push({ x: 14, z: 44, w: 2.8, d: 2.8 });

  // ---- volleyball net (just for show) and sandcastles
  for (const sx of [-1, 1]) add(g, cyl(0.08, 0.08, 2.6, 6), toon('#ffffff'), { p: [-2 + sx * 5, 1.3, 30] });
  add(g, box(10, 1, 0.04), toon('#ffffff', { transparent: true, opacity: 0.6 }), { p: [-2, 2.1, 30], cast: false });
  const ball = add(g, sph(0.35), toon('#ffd84d'), { p: [-4, 0.35, 32], outline: true });
  anim.push((t) => { ball.position.y = 0.35 + Math.abs(Math.sin(t * 2.2)) * 2.5; ball.position.z = 30 + Math.sin(t * 1.1) * 3; });
  for (const [x, z] of [[-100, 30], [26, 22], [140, 20], [-180, 26], [190, 34]]) {
    const cg = new THREE.Group(); cg.position.set(x, 0, z); g.add(cg);
    const s = toon('#e6c27a');
    add(cg, cyl(1.2, 1.4, 0.8, 10), s, { p: [0, 0.4, 0], outline: true });
    for (let k = 0; k < 4; k++) add(cg, cyl(0.35, 0.4, 1.2, 8), s, { p: [Math.cos(k * TAU / 4 + 0.4) * 1.1, 0.8, Math.sin(k * TAU / 4 + 0.4) * 1.1], outline: true });
    add(cg, cyl(0.5, 0.6, 1.4, 8), s, { p: [0, 1.4, 0], outline: true });
    add(cg, cyl(0.02, 0.02, 0.8, 4), toon('#2b2f4a'), { p: [0, 2.4, 0] });
    add(cg, box(0.4, 0.25, 0.02), toon('#ff5d73'), { p: [0.2, 2.7, 0] });
    solids.push({ x, z, r: 1.6 });
  }
  // shells and starfish
  const shellCols = ['#ffd6e0', '#ffe9c4', '#ffffff', '#ffb38a'];
  const shells = [];
  for (let i = 0; i < 90; i++) { const x = sr(-215, 215), z = sr(0, 58); shells.push({ x, z, y: 0.05, ry: sr(0, TAU), s: sr(0.7, 1.3), color: shellCols[i % 4] }); }
  instanced(g, tf(sph(0.18, 8, 5), { s: [1, 0.35, 0.8] }), toon('#ffffff'), shells, { outline: false, cast: false });
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, r = i % 2 ? 0.12 : 0.34; starShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = tf(new THREE.ExtrudeGeometry(starShape, { depth: 0.05, bevelEnabled: false }), { r: [-Math.PI / 2, 0, 0], p: [0, 0.03, 0] });
  instanced(g, starGeo, toon('#ffffff'), Array.from({ length: 32 }, (_, i) => ({ x: sr(-215, 215), z: sr(10, 60), ry: sr(0, TAU), color: ['#ff7a59', '#ff5fa8', '#ffb347'][i % 3] })), { outline: false, cast: false });

  // ---- the pier and lighthouse
  const pierLen = 58;
  add(g, box(PIER_W, 0.3, pierLen), plank(2, 20), { p: [PIER_X, 0.7, 60 + pierLen / 2 - 4], outline: true });
  for (let z = 58; z < 58 + pierLen; z += 4) for (const sx of [-1, 1]) add(g, cyl(0.18, 0.18, 2.4, 6), toon('#6b4226'), { p: [PIER_X + sx * (PIER_W / 2 - 0.1), -0.5, z] });
  for (let z = 58; z < 58 + pierLen - 4; z += 3) for (const sx of [-1, 1]) add(g, cyl(0.06, 0.06, 1, 6), toon('#ffffff'), { p: [PIER_X + sx * (PIER_W / 2 - 0.1), 1.35, z] });
  for (const sx of [-1, 1]) add(g, box(0.1, 0.1, pierLen - 4), toon('#ffffff'), { p: [PIER_X + sx * (PIER_W / 2 - 0.1), 1.85, 58 + (pierLen - 4) / 2], cast: false });
  // ramp up onto it
  add(g, box(PIER_W, 0.3, 6), plank(2, 2), { p: [PIER_X, 0.35, 57], r: [-0.12, 0, 0] });
  const lh = new THREE.Group();
  lh.position.set(PIER_X, 0.85, Z1 - 1);
  g.add(lh);
  for (let k = 0; k < 5; k++) add(lh, cyl(1.6 - k * 0.18, 1.78 - k * 0.18, 2.2, 16), toon(k % 2 ? '#e0463c' : '#ffffff'), { p: [0, 1.1 + k * 2.2, 0], outline: true });
  add(lh, cyl(1.3, 1.3, 0.3, 16), toon('#2b2f4a'), { p: [0, 11.2, 0], outline: true });
  add(lh, cyl(0.8, 0.8, 1.6, 12), toon('#fff3a0', { emissive: '#fff3a0', emissiveIntensity: 0.8 }), { p: [0, 12.2, 0] });
  add(lh, new THREE.ConeGeometry(1.2, 1.4, 12), toon('#e0463c'), { p: [0, 13.7, 0], outline: true });
  const beam = add(lh, new THREE.ConeGeometry(2.4, 26, 16, 1, true), basic('#fff6b0', { transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }), { p: [13, 12.2, 0], r: [0, 0, Math.PI / 2], cast: false });
  const beamPivot = new THREE.Group(); beamPivot.position.set(0, 0, 0); lh.add(beamPivot); beamPivot.add(beam);
  anim.push((t) => { beamPivot.rotation.y = t * 0.6; });
  solids.push({ x: PIER_X, z: Z1 - 1, r: 2.1 });

  // ---- Ferris wheel on the grass to the west
  const fw = new THREE.Group();
  fw.position.set(-128, 0, -62);
  g.add(fw);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(fw, cyl(0.25, 0.3, 14, 8), toon('#ffffff'), { p: [sx * 4, 7, sz * 1.6], r: [0, 0, sx * -0.28], outline: true });
  const wheel = new THREE.Group(); wheel.position.set(0, 13, 0); fw.add(wheel);
  add(wheel, new THREE.TorusGeometry(10, 0.25, 8, 48), toon('#ff5fa8'), { outline: true });
  add(wheel, new THREE.TorusGeometry(9.3, 0.12, 6, 48), toon('#ffffff'), {});
  for (let k = 0; k < 12; k++) add(wheel, box(0.14, 20, 0.14), toon('#ffffff'), { r: [0, 0, (k / 12) * Math.PI] });
  const cars = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const car = new THREE.Group();
    car.position.set(Math.cos(a) * 10, Math.sin(a) * 10, 0);
    wheel.add(car);
    add(car, box(1.6, 1.3, 1.4), toon(umbCols[k % umbCols.length]), { p: [0, -1, 0], outline: true });
    add(car, cyl(0.04, 0.04, 0.8, 4), toon('#2b2f4a'), { p: [0, -0.2, 0] });
    cars.push(car);
  }
  add(wheel, cyl(0.8, 0.8, 3.6, 12), toon('#2b2f4a'), { r: [Math.PI / 2, 0, 0], outline: true });
  anim.push((t) => { wheel.rotation.z = t * 0.12; cars.forEach((c) => { c.rotation.z = -wheel.rotation.z; }); });
  solids.push({ x: -128, z: -62, w: 12, d: 5 });

  // ---- tiki bar and ice cream stand by the boardwalk (just for looks)
  const tiki = new THREE.Group(); tiki.position.set(-56, 0, -27); g.add(tiki);
  add(tiki, box(8, 1.3, 2), plank(3, 1), { p: [0, 0.65, 2], outline: true });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(tiki, cyl(0.2, 0.25, 4, 8), toon('#8b5a2b'), { p: [sx * 3.6, 2, sz * 2.4] });
  add(tiki, new THREE.ConeGeometry(6.4, 2.6, 4), toon('#d9b56a'), { p: [0, 5.2, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.7], outline: true });
  for (let k = 0; k < 5; k++) add(tiki, cyl(0.15, 0.1, 0.4, 8), toon(umbCols[k]), { p: [-2.5 + k * 1.2, 1.5, 2] });
  const tikiSign = letterSign('TIKI BAR', { font: 'chunky', w: 4.5, h: 0.8, face: '#ffd84d', side: '#6b4226', depth: 0.2 });
  tikiSign.position.set(0, 4.1, 2.5); tiki.add(tikiSign);
  solids.push({ x: -56, z: -27, w: 8, d: 5.6 });
  const ice = new THREE.Group(); ice.position.set(56, 0, -27); g.add(ice);
  add(ice, box(5, 2.4, 3), toon('#ffd6e8'), { p: [0, 1.2, 0], outline: true });
  add(ice, box(5.6, 0.25, 3.8), new THREE.MeshToonMaterial({ map: stripeTex('#ff7aa8', '#ffffff'), gradientMap: toon('#fff').gradientMap }), { p: [0, 3.3, 0.3], r: [0.15, 0, 0], outline: true });
  const cone = new THREE.Group(); cone.position.set(0, 5.2, 0); ice.add(cone);
  add(cone, new THREE.ConeGeometry(0.8, 2.2, 12), toon('#e0a860'), { p: [0, 0, 0], r: [Math.PI, 0, 0], outline: true });
  add(cone, sph(0.95), toon('#ff9fc7'), { p: [0, 1.3, 0], outline: true });
  add(cone, sph(0.8), toon('#fff4d6'), { p: [0, 2.3, 0], outline: true });
  add(cone, sph(0.18), toon('#e0463c'), { p: [0, 3.15, 0], outline: true });
  anim.push((t) => { cone.rotation.y = t * 0.8; });
  solids.push({ x: 56, z: -27, w: 5, d: 3 });

  // ---- boats bobbing out at sea, rocks, and gulls
  const boats = [];
  for (const [x, z, c] of [[-90, 100, '#ffffff'], [-20, 130, '#ff5d73'], [60, 110, '#ffd84d'], [160, 140, '#39c6ff']]) {
    const b = new THREE.Group(); b.position.set(x, -0.2, z); g.add(b);
    add(b, sph(1, 14, 8), toon(c), { s: [3.2, 0.9, 1.3], p: [0, 0.2, 0], outline: true });
    add(b, cyl(0.08, 0.08, 5, 6), toon('#8b5a2b'), { p: [0, 2.8, 0] });
    add(b, new THREE.ConeGeometry(1.6, 3.8, 3), toon('#fffaf0'), { p: [0.6, 3, 0], s: [1, 1, 0.1], outline: true });
    boats.push(b);
  }
  anim.push((t) => boats.forEach((b, i) => { b.position.y = -0.1 + Math.sin(t * 1.2 + i) * 0.25; b.rotation.z = Math.sin(t * 0.9 + i * 2) * 0.08; }));
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  instanced(g, rockGeo, toon('#9a93a8'), [[-214, 58], [-205, 61], [-190, 66], [212, 60], [203, 64], [95, 68], [-60, 70], [-10, 72], [-150, 69], [170, 67]].map(([x, z], i) => ({ x, z, y: 0.2, s: 1.2 + (i % 3) * 0.6, ry: i })));
  const gulls = [];
  for (let k = 0; k < 7; k++) {
    const gg = new THREE.Group(); g.add(gg);
    add(gg, sph(0.25, 8, 6), toon('#ffffff'), { s: [1.6, 0.8, 0.8], cast: false });
    const wings = [-1, 1].map((s) => add(gg, box(0.1, 0.04, 1.1), toon('#e8e8f0'), { p: [0, 0, s * 0.55], cast: false }));
    gulls.push({ gg, wings, cx: sr(-180, 180), cz: sr(20, 90), r: sr(8, 22), h: sr(12, 20), sp: sr(0.3, 0.6), ph: sr(0, TAU) });
  }
  anim.push((t) => gulls.forEach((q) => {
    const a = t * q.sp + q.ph;
    q.gg.position.set(q.cx + Math.cos(a) * q.r, q.h + Math.sin(t * 0.7 + q.ph) * 1.5, q.cz + Math.sin(a) * q.r);
    q.gg.rotation.y = -a;
    q.wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * Math.sin(t * 8 + q.ph) * 0.5; });
  }));

  // ---- dunes with beach grass between the boardwalk and the sand
  for (let i = 0; i < 22; i++) {
    const x = sr(-205, 205);
    if (Math.abs(x) < 10 || (x > 30 && x < 45)) continue;
    add(g, sph(1, 12, 8), toon('#ecd092'), { p: [x, -0.2, sr(-5, -2)], s: [sr(3, 5), 1.1, 1.6], cast: false });
    for (let k = 0; k < 4; k++) add(g, new THREE.ConeGeometry(0.08, 1.3, 4), toon('#8fbf5a'), { p: [x + sr(-2, 2), 1, sr(-5, -2)], r: [sr(-0.3, 0.3), 0, sr(-0.3, 0.3)], cast: false });
  }

  return { group: g, anim, solids, spots, crabs, sea, ground };
}

// ---- Crab Race panel -----------------------------------------------------------------------------
function crabPanel(body, getState) {
  let amount = 50;
  const render = () => {
    const st = getState();
    if (!st) { body.innerHTML = '<p class="muted">Loading the races…</p>'; return; }
    const mine = st.bets?.[S.me] ?? [];
    const left = Math.max(0, Math.ceil(st.left - (performance.now() - st.at) / 1000));
    const stake = (i) => mine.filter((b) => b.crab === i).reduce((a, b) => a + b.amount, 0);
    body.innerHTML = `
      <h2>🦀 Crab Races</h2>
      <p class="muted small">Pick a crab and place a bet. If it crosses the line first you win <b>${st.pays}x</b> your bet!</p>
      <div class="crab-status">${st.state === 'betting' ? `Bets close in <b>${left}s</b>` : st.state === 'racing' ? '🏁 They\'re off!' : st.winner != null ? `🏆 <b>${esc(st.names[st.winner])}</b> won!` : 'Waiting for the next race…'}</div>
      <div class="crab-amounts">${[10, 50, 100, 250, 500].map((a) => `<button class="btn small ${a === amount ? 'primary' : 'ghost'}" data-amt="${a}">${a} 🪙</button>`).join('')}</div>
      <div class="crab-grid">${st.names.map((n, i) => `
        <button class="crab-pick" data-crab="${i}" ${st.state !== 'betting' ? 'disabled' : ''} style="--c:${CRAB_COLORS[i]}">
          <span class="crab-num">${i + 1}</span><b>${esc(n)}</b>
          <small>${stake(i) ? `Your bet: ${fmt(stake(i))} 🪙` : 'Tap to bet'}</small></button>`).join('')}</div>
      <p class="muted small">You have <b>${fmt(me().coins)}</b> 🪙 · Recent winners: ${(st.history ?? []).slice(0, 6).map((w) => `<span style="color:${CRAB_COLORS[w]}">●</span>`).join(' ') || '—'}</p>`;
  };
  body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-amt]');
    if (a) { amount = +a.dataset.amt; render(); return; }
    const c = e.target.closest('[data-crab]');
    if (c && !c.disabled) { net.send('crab_bet', { crab: +c.dataset.crab, amount }); sfx('chip'); }
  });
  const iv = setInterval(render, 500);
  render();
  return () => clearInterval(iv);
}

// ---- the area ---------------------------------------------------------------------------------------
let env = null;
export function beachArea(stage) {
  env ||= buildBeach();
  const { group, anim, solids, spots, crabs } = env;
  const sun = stage.lights({ background: '#8fd8ff', sky: 0xe8f7ff, ground: 0xf2d9a0, hemi: 1.25, sun: 2.3, sunPos: [40, 70, 30], box: 45, fog: ['#bfe9ff', 140, 330] });
  stage.scene.add(group);
  const walker = stage.walker({
    spawn: { x: rnd(-2, 2), z: spots.portal.spawn }, speed: 6,
    bounds: { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 },
    solids,
    orbit: { yaw: Math.PI, pitch: 0.5, dist: 13, maxDist: 30 },
    ceiling: 80,
  });
  walker.me.heading = 0;

  // ---- HUD: the treasure detector
  stage.hud.insertAdjacentHTML('beforeend', `
    <div class="hud-panel beach-detector"><div class="det-top">📡 <b>Treasure detector</b></div><div class="det-bar"><i></i></div><button class="btn small primary det-dig">⛏️ Dig <kbd>F</kbd></button></div>
    <p class="hud-panel arena-help">Walk the sand: the detector beeps faster near buried treasure. Press <kbd>F</kbd> to dig! · Bet on the crabs at the <b>Crab Races</b> · Ride the waves at the <b>Surf Shack</b> · The portal takes you back to Maplewood</p>`);
  const bar = stage.hud.querySelector('.det-bar i'), digBtn = stage.hud.querySelector('.det-dig');
  let treasure = [], beepAt = 0, digging = 0;
  const holes = [];
  const holeMat = toon('#c9a462');
  const addHole = (x, z) => {
    const h = add(group, new THREE.CircleGeometry(0.7, 14), holeMat, { p: [x, 0.07, z], r: [-Math.PI / 2, 0, 0], cast: false });
    const pile = add(group, sph(0.5, 10, 6), toon('#e8c98c'), { p: [x + 0.9, 0, z], s: [1, 0.45, 1], cast: false });
    holes.push(h, pile);
    while (holes.length > 40) group.remove(holes.shift());
  };
  const doDig = () => {
    const p = walker.me;
    if (digging > 0 || p.z < 0 || p.z > shoreZ(p.x)) { if (p.z < 0 || p.z > shoreZ(p.x)) toast('Dig in the sand on the beach!'); return; }
    digging = 0.9;
    sfx('pop', { vol: 0.5 });
    net.send('area_move', { x: +p.x.toFixed(2), z: +p.z.toFixed(2), h: +p.heading.toFixed(2) });
    setTimeout(() => net.send('beach_dig', {}), 60);
  };
  digBtn.onclick = doDig;
  const offKeys = onKeys((e) => { if (e.key.toLowerCase() === 'f' && !e.repeat) doDig(); });

  // ---- places
  stage.interactable({ x: spots.portal.x, z: spots.portal.z, r: 4.5, label: 'go through the portal to Maplewood', use: () => stage.onExit?.() });
  stage.interactable({ x: spots.surf.x, z: spots.surf.z, r: 4, label: 'play Surf Rush', use: () => stage.openPanel({ wide: true, mount: (body) => arcadeCabinet(body, 'surf') }) });
  let crabState = null;
  stage.interactable({ x: spots.crabs.x, z: spots.crabs.z, r: 3.5, label: 'bet on the crab races', use: () => stage.openPanel({ mount: (body) => crabPanel(body, () => crabState) }) });
  stage.interactable({ x: spots.dig.x, z: spots.dig.z, r: 3.5, label: 'read the treasure map', use: () => stage.banner('🏴‍☠️ Treasure is buried all over the beach! Watch the <b>detector</b> in the corner: the fuller it gets (and the faster it beeps), the closer you are. Stand right on top and press <b>F</b> to dig.', 6500) });

  // ---- crab race playback
  let race = null; // { at, times }
  const setCrabs = (m) => {
    crabState = { ...m, at: performance.now() };
    if (m.state === 'racing') race = { at: performance.now(), times: m.times };
    if (m.state === 'betting') { race = null; crabs.forEach((c) => { c.position.x = CRAB_TRACK.x0; }); }
    if (m.state === 'result' && m.winner != null) {
      const win = m.wins?.[S.me];
      if (stage.people.get(S.me) && Math.hypot(walker.me.x - 70, walker.me.z - 16) < 45) stage.banner(`🦀 <b>${esc(m.names[m.winner])}</b> wins the crab race!${win ? ` You won <b>${fmt(win)}</b> 🪙!` : ''}`, 3500);
      if (win) sfx('win');
    }
  };

  const off = listen({
    beach: (m) => { treasure = m.treasure; },
    treasure: (m) => { treasure = m.treasure; },
    beach_hole: (m) => addHole(m.x, m.z),
    dig_result: (m) => {
      addHole(m.x, m.z);
      if (!m.found) { toast('Nothing here… keep looking!'); return; }
      const what = { chest: '🏴‍☠️ A TREASURE CHEST', pearl: '🦪 A shiny pearl', coins: '🪙 A pouch of coins' }[m.kind] ?? 'Treasure';
      stage.banner(`${what}! <b>+${fmt(m.coins)}</b> 🪙`, 3000);
      sfx(m.kind === 'chest' ? 'win' : 'coin');
    },
    crabs: (m) => setCrabs(m),
    crab_bets: (m) => { if (crabState) crabState.bets = m.bets; },
  });

  stage.onFrame((dt, now) => {
    const t = now / 1000;
    for (const fn of anim) fn(t, dt);
    // walking up onto the pier
    for (const q of stage.people.values()) q.y = pierY(q.x, q.z);
    // the sun (and its shadows) follow you around
    const p = walker.me;
    sun.position.set(p.x + 40, 70, p.z + 30);
    sun.target.position.set(p.x, 0, p.z);
    // detector
    if (treasure.length) {
      const d = Math.min(...treasure.map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
      const onSand = p.z > -2 && p.z < shoreZ(p.x) + 1;
      const k = onSand ? Math.max(0, 1 - d / 28) : 0;
      bar.style.width = `${Math.round(k * 100)}%`;
      bar.style.background = k > 0.9 ? '#6ee7a0' : k > 0.6 ? '#ffd84d' : '#39c6ff';
      if (k > 0.05 && now > beepAt) { sfx('near', { vol: 0.25 + k * 0.4 }); beepAt = now + 1400 - k * 1250; }
    }
    if (digging > 0) digging -= dt;
    // crabs scuttle
    if (race) {
      const el = (now - race.at) / 1000;
      crabs.forEach((c, i) => {
        const T = race.times[i];
        const u = Math.min(1, el / T);
        const wob = u < 1 ? Math.sin(el * 7 + i * 2) * 0.03 * (1 - u) : 0;
        c.position.x = CRAB_TRACK.x0 + (CRAB_TRACK.x1 - CRAB_TRACK.x0) * Math.min(1, Math.max(0, u + wob));
        c.position.y = u < 1 ? Math.abs(Math.sin(el * 14 + i)) * 0.12 : 0;
        c.rotation.x = u < 1 ? Math.sin(el * 20 + i) * 0.08 : 0;
      });
    } else crabs.forEach((c, i) => { c.position.y = 0; c.rotation.x = Math.sin(now / 400 + i) * 0.03; });
  });

  return () => { walker.stop(); off(); offKeys(); stage.scene?.remove(group); };
}
