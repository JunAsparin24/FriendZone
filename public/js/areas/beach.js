// Coral Cove: the beach town through the portal. A long sandy beach on the sea, a boardwalk of beach
// huts, Coral Park's courts and fields on the grass behind it, and Coral Pier, a big LA-style pier
// with shops, rides and a fishing platform. Boats and jet skis at the marina, swimming in the sea,
// treasure in the sand, crab races and Surf Rush. Day and night and the weather match the town's.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, fmt, esc, toast, me } from '../state.js';
import { CATALOG } from '../catalog.js';
import { toon, shiny, basic, canvasTexture, additive, glowTexture, flameTexture, TAU } from '../three/materials.js';
import { letterSign } from '../three/signs3d.js';
import { buildSky } from '../three/environment.js';
import { DayNight } from '../three/daynight.js';
import { wind, withWind } from '../three/wind.js';
import { Character, DEFAULT_LOOK } from '../three/character.js';
import { arcadeCabinet, ARCADE_GAMES } from '../games/arcadegames.js';
import { Fishing } from '../games/fishing.js';
import { sfx, ambient } from '../sfx.js';
import { listen, onKeys } from '../games/util.js';
import { touch, setTouchButtons } from '../touch.js';
import { add, box, cyl, sph, group, merge, tf, instanced, plank, stripeMat, nightLights, lamp, windowMat, seeded } from './beach/common.js';
import { buildPier, pierHeight, onPierFootprint, PIER_Y } from './beach/pier.js';
import { buildPark, Balls, COURTS } from './beach/park.js';
import { Boats } from './beach/boats.js';

// the walkable area (world units); the sea is to the south (+z)
const X0 = -230, X1 = 230, Z0 = -165, Z1 = 215;
const SWIM_MAX = 175; // the buoy line: as far out as you can swim
export const shoreZ = (x) => 62 + Math.sin(x / 23) * 4 + Math.sin(x / 9 + 1) * 1.6;
const CRAB_TRACK = { x0: 44, x1: 96, z: 16 };
const CRAB_COLORS = ['#e0463c', '#ff9f43', '#3b82f6', '#9b59ff'];
const PORTAL = { x: 0, z: -140 };
const rnd = (a, b) => a + Math.random() * (b - a);

/** In the sea (and not up on the pier or the dock)? */
const inSea = (x, z) => z > shoreZ(x) && pierHeight(x, z) == null;
/** What you stand on here: the pier/dock's height, else the ground (the sea floor counts as 0 for walking). */
const floorAt = (x, z) => pierHeight(x, z) ?? 0;

// ---- textures --------------------------------------------------------------------------------------------
const sandTex = canvasTexture(256, 256, (c) => {
  c.fillStyle = '#f2d9a0'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(200,160,90,.25)' : 'rgba(255,245,215,.4)'; c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
});
const grassTex = canvasTexture(256, 256, (c) => {
  c.fillStyle = '#7cc46a'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(60,130,60,.3)' : 'rgba(170,230,130,.3)'; c.fillRect(Math.random() * 256, Math.random() * 256, 2, 5); }
});
const mosaicTex = canvasTexture(512, 512, (c) => {
  c.fillStyle = '#e8e0d0'; c.fillRect(0, 0, 512, 512);
  c.translate(256, 256);
  for (let ring = 0; ring < 7; ring++) {
    const n = 12 + ring * 6, r0 = 30 + ring * 32;
    for (let k = 0; k < n; k++) {
      c.fillStyle = ['#2f7fe0', '#39c6ff', '#ffd84d', '#ffffff', '#8ff2ff'][(k + ring) % 5];
      c.beginPath(); c.arc(0, 0, r0 + 26, (k / n) * TAU, ((k + 0.85) / n) * TAU); c.arc(0, 0, r0, ((k + 0.85) / n) * TAU, (k / n) * TAU, true); c.fill();
    }
  }
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, 26, 0, TAU); c.fill();
});

// ---- the scene ------------------------------------------------------------------------------------------------
function buildBeach() {
  const g = new THREE.Group();
  const anim = [], solids = [], spots = {}, places = [];
  const lights = nightLights();
  const r = seeded(7);
  const sr = r.range;

  // sky dome (the same one the town has, driven by the same day/night and weather)
  const sky = buildSky();
  g.add(sky);
  const sunGlow = new THREE.Sprite(additive(glowTexture, 0xfff2c0, 0.9));
  sunGlow.scale.setScalar(70);
  g.add(sunGlow);

  // ground: grassy park in the north, sand down to the sea
  const flat = (shape, mat, y) => { const m = add(g, new THREE.ShapeGeometry(shape), mat, { p: [0, y, 0], r: [Math.PI / 2, 0, 0], cast: false }); m.material.side = THREE.DoubleSide; return m; };
  const sandShape = new THREE.Shape();
  sandShape.moveTo(X0 - 300, -400); sandShape.lineTo(X1 + 300, -400);
  for (let x = X1 + 300; x >= X0 - 300; x -= 4) sandShape.lineTo(x, shoreZ(x) + 3);
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(0.12, 0.12);
  flat(sandShape, new THREE.MeshToonMaterial({ map: sandTex, gradientMap: toon('#fff').gradientMap }), 0);
  const grassShape = new THREE.Shape();
  grassShape.moveTo(X0 - 300, -400); grassShape.lineTo(X1 + 300, -400);
  for (let x = X1 + 300; x >= X0 - 300; x -= 10) grassShape.lineTo(x, -30 + Math.sin(x / 17) * 2.5);
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(0.06, 0.06);
  flat(grassShape, new THREE.MeshToonMaterial({ map: grassTex, gradientMap: toon('#fff').gradientMap }), 0.02);
  // wet sand along the water's edge
  const wv = [];
  for (let x = X0 - 300; x < X1 + 300; x += 4) { const za = shoreZ(x), zb = shoreZ(x + 4); wv.push(x, 0.03, za - 5, x + 4, 0.03, zb - 5, x + 4, 0.03, zb + 2, x, 0.03, za - 5, x + 4, 0.03, zb + 2, x, 0.03, za + 2); }
  const wetGeo = new THREE.BufferGeometry(); wetGeo.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3)); wetGeo.computeVertexNormals();
  add(g, wetGeo, toon('#d9b877', { side: THREE.DoubleSide }), { cast: false });
  add(g, new THREE.PlaneGeometry(1400, 800), toon('#c9b27a'), { p: [0, -1.8, 420], r: [-Math.PI / 2, 0, 0], cast: false }); // sea floor

  // the sea: a wavy sheet, turquoise near the shore and deep blue further out (rougher in the wind)
  const seaGeo = new THREE.PlaneGeometry(1000, 520, 110, 52);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(0, 0, 60 + 260 - 8);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);
  const cols = [];
  for (let i = 0; i < seaGeo.attributes.position.count; i++) {
    const z = seaBase[i * 3 + 2];
    const c = new THREE.Color('#3fd0d4').lerp(new THREE.Color('#1c6fb8'), Math.min(1, Math.max(0, (z - 70) / 110)));
    cols.push(c.r, c.g, c.b);
  }
  seaGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const seaMat = new THREE.MeshToonMaterial({ vertexColors: true, transparent: true, opacity: 0.9, gradientMap: toon('#fff').gradientMap });
  add(g, seaGeo, seaMat, { p: [0, -0.35, 0], cast: false });
  let seaT = 0;
  anim.push((t, dt) => {
    if ((seaT += dt) < 1 / 30) return;
    seaT = 0;
    const pos = seaGeo.attributes.position, gust = wind.strength.value;
    for (let i = 0; i < pos.count; i++) {
      const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
      const calm = Math.min(1, Math.max(0.15, (z - 62) / 30)) * (0.75 + gust * 0.25);
      pos.setY(i, (Math.sin(x * 0.09 + t * 1.3) * 0.18 + Math.sin(z * 0.14 - t * 1.8) * 0.28 + Math.sin((x + z) * 0.05 + t * 0.7) * 0.2) * calm);
    }
    pos.needsUpdate = true;
    seaGeo.computeVertexNormals();
  });
  // foam lapping at the shore
  const foam = [];
  for (let k = 0; k < 2; k++) {
    const fv = [];
    for (let x = X0 - 300; x < X1 + 300; x += 4) { const za = shoreZ(x), zb = shoreZ(x + 4); fv.push(x, 0, za, x + 4, 0, zb, x + 4, 0, zb + 0.9, x, 0, za, x + 4, 0, zb + 0.9, x, 0, za + 0.9); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fv, 3));
    foam.push(add(g, fg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), { p: [0, 0.06, 0], cast: false }));
  }
  anim.push((t) => foam.forEach((f, k) => { const w = (t * 0.35 + k * 0.5) % 1; f.position.z = -1.5 + w * 3; f.material.opacity = 0.75 * Math.sin(w * Math.PI); }));
  // a line of buoys marks how far out you can swim; islands on the horizon
  for (let x = X0; x <= X1; x += 12) {
    if (onPierFootprint(x, SWIM_MAX, 6)) continue;
    const bu = add(g, sph(0.5, 10, 8), toon(x % 24 ? '#ff5d73' : '#ffffff'), { p: [x, 0, SWIM_MAX], outline: true });
    anim.push((t) => { bu.position.y = Math.sin(t * 1.5 + x) * 0.15; });
  }
  for (const [x, z, s] of [[-260, 470, 60], [-60, 520, 40], [220, 480, 70], [420, 440, 45]]) {
    add(g, sph(1, 16, 8), toon('#6fb38a'), { p: [x, -s * 0.55, z], s: [s * 1.6, s * 0.75, s], cast: false });
    add(g, cyl(s * 1.55, s * 1.62, 1, 20), toon('#ecd092'), { p: [x, 0, z], s: [1, 1, 0.62], cast: false });
  }

  // ---- the boardwalk along the top of the beach, and the walk up to the portal
  add(g, box(7, 0.2, 118), plank(2, 36), { p: [0, 0.12, -77], cast: false });
  add(g, box(460, 0.2, 7), plank(140, 2), { p: [0, 0.1, -15], cast: false });
  for (let x = -224; x <= 224; x += 8) if (!onPierFootprint(x, -15, 2)) for (const z of [-18.6, -11.4]) add(g, cyl(0.12, 0.12, 1, 6), toon('#8b5a2b'), { p: [x, 0.5, z] });
  for (let x = -210; x <= 210; x += 28) for (const z of [-19.5, -10.5]) { const lx = x + (z > -15 ? 14 : 0); if (!onPierFootprint(lx, z, 4)) lamp(g, lights, lx, z); }
  for (let z = -120; z <= -30; z += 18) for (const x of [-4.5, 4.5]) lamp(g, lights, x, z);
  // paths over to the courts and the football field
  add(g, box(200, 0.14, 5), toon('#d8d2c4'), { p: [-100, 0.08, -60], cast: false });
  add(g, box(150, 0.14, 5), toon('#d8d2c4'), { p: [75, 0.08, -60], cast: false });

  // ---- the portal home: a mosaic plaza with a great arch, flaming braziers and orbiting crystals
  const portal = group(g, PORTAL.x, 0, PORTAL.z);
  add(portal, cyl(14, 14.4, 0.3, 48), new THREE.MeshToonMaterial({ map: mosaicTex, gradientMap: toon('#fff').gradientMap }), { p: [0, 0.15, 0], outline: true });
  add(portal, new THREE.TorusGeometry(14.2, 0.35, 8, 64), toon('#c9a227'), { p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0] });
  const stone = toon('#d8d0e6'), gold = shiny('#ffc53d');
  for (const sx of [-1, 1]) {
    add(portal, box(2, 6, 2), stone, { p: [sx * 6, 3, -2], outline: true });
    add(portal, box(2.6, 0.6, 2.6), gold, { p: [sx * 6, 6.2, -2] });
    add(portal, box(2.6, 0.6, 2.6), gold, { p: [sx * 6, 0.6, -2] });
  }
  add(portal, new THREE.TorusGeometry(6, 1, 12, 48, Math.PI), stone, { p: [0, 6, -2], outline: true });
  for (let k = 0; k < 9; k++) { const a = (k / 8) * Math.PI; add(portal, box(0.5, 1.4, 2.4), gold, { p: [Math.cos(a) * 6, 6 + Math.sin(a) * 6, -2], r: [0, 0, a - Math.PI / 2] }); }
  const swirlTex = canvasTexture(256, 256, (c) => {
    const gr = c.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#8ff2ff'); gr.addColorStop(0.8, '#5a7bff'); gr.addColorStop(1, 'rgba(90,60,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 6;
    for (let k = 0; k < 5; k++) { c.beginPath(); for (let a = 0; a < 9; a += 0.1) { const rr = a * 13; c.lineTo(128 + Math.cos(a + k * 1.25) * rr, 128 + Math.sin(a + k * 1.25) * rr); } c.stroke(); }
  });
  const swirl = add(portal, new THREE.CircleGeometry(5.4, 48), new THREE.MeshBasicMaterial({ map: swirlTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }), { p: [0, 6, -2], cast: false });
  const swirlLow = add(portal, new THREE.PlaneGeometry(10.8, 6), new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }), { p: [0, 3, -2], cast: false });
  const pglow = new THREE.Sprite(additive(glowTexture, 0x7fe8ff, 0.5));
  pglow.scale.set(13, 13, 1); pglow.position.set(0, 5, -2.5);
  portal.add(pglow);
  const crystals = [];
  for (let k = 0; k < 6; k++) crystals.push(add(portal, new THREE.OctahedronGeometry(0.45), basic(['#8ff2ff', '#ff9fe0', '#ffe27a'][k % 3]), { cast: false }));
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(60 * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  portal.add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: '#bff6ff', size: 0.25, transparent: true, opacity: 0.9, depthWrite: false })));
  const sparkSeed = Array.from({ length: 60 }, () => [Math.random() * TAU, Math.random() * 4, Math.random()]);
  const flames = [];
  for (const sx of [-1, 1]) {
    const b = group(portal, sx * 11, 0, 4);
    add(b, cyl(0.3, 0.5, 2.2, 8), toon('#3a3f55'), { p: [0, 1.1, 0], outline: true });
    add(b, cyl(1, 0.6, 0.8, 12), gold, { p: [0, 2.6, 0], outline: true });
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture, color: k ? 0xffb347 : 0xff6a2e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      f.position.set((k - 1) * 0.25, 3.4, 0);
      b.add(f);
      flames.push(f);
    }
  }
  for (const a of [Math.PI * 1.15, Math.PI * 1.4, Math.PI * 1.6, Math.PI * 1.85, Math.PI * 0.85, Math.PI * 0.15]) places.push([PORTAL.x + Math.cos(a) * 12.5, PORTAL.z + Math.sin(a) * 12.5]); // (not in front of the arch)
  const homeSign = letterSign('The Town', { font: 'chunky', w: 9, h: 1.3, face: '#ffffff', side: '#5a7bff', depth: 0.25, glow: 0.6 });
  homeSign.position.set(0, 13.4, -2);
  portal.add(homeSign);
  anim.push((t) => {
    swirl.rotation.z = -t * 1.4;
    swirlLow.material.opacity = 0.4 + Math.sin(t * 3) * 0.12;
    pglow.material.opacity = 0.4 + Math.sin(t * 2) * 0.12;
    crystals.forEach((c, k) => { const a = t * 0.8 + (k / 6) * TAU; c.position.set(Math.cos(a) * 7.5, 6 + Math.sin(a * 2) * 1.2, -2 + Math.sin(a) * 2.5); c.rotation.y = t * 2; });
    sparkSeed.forEach(([a, h0, sp], i) => { const h = (h0 + t * (0.6 + sp)) % 9; sparkPos[i * 3] = Math.cos(a + t * 0.3) * (4.8 - h * 0.25); sparkPos[i * 3 + 1] = 1 + h; sparkPos[i * 3 + 2] = -2 + Math.sin(a + t * 0.3) * 0.6; });
    sparkGeo.attributes.position.needsUpdate = true;
    flames.forEach((f, k) => { const s = 1.2 + Math.sin(t * 9 + k * 2) * 0.25; f.scale.set(s * 0.9, s * 1.5, 1); f.position.y = 3.4 + Math.sin(t * 7 + k) * 0.1; });
  });
  solids.push({ x: PORTAL.x - 6, z: PORTAL.z - 2, w: 2, d: 2 }, { x: PORTAL.x + 6, z: PORTAL.z - 2, w: 2, d: 2 }, { x: PORTAL.x - 11, z: PORTAL.z + 4, r: 0.8 }, { x: PORTAL.x + 11, z: PORTAL.z + 4, r: 0.8 });
  spots.portal = { x: PORTAL.x, z: PORTAL.z - 1, spawn: PORTAL.z + 17 };

  // ---- the welcome sign: off to the side of the walk, angled towards you as you arrive
  const welcome = group(g, 16, 0, -104, Math.PI + 0.55);
  for (const sx of [-1, 1]) add(welcome, cyl(0.25, 0.3, 5, 8), toon('#8b5a2b'), { p: [sx * 6.5, 2.5, 0], outline: true });
  add(welcome, box(14, 3, 0.4), plank(5, 1), { p: [0, 3.8, -0.3], outline: true });
  const ws = letterSign('Coral Cove', { font: 'script', even: false, w: 11.5, h: 2, face: '#ffffff', side: '#ff7a59', depth: 0.3 });
  ws.position.set(0, 2.9, 0);
  welcome.add(ws);
  for (let i = 0; i < 6; i++) add(welcome, sph(0.4), toon(['#ff7aa8', '#ffd84d', '#6ee7c0'][i % 3]), { p: [-6 + i * 2.4, 5.5, 0], s: [1, 0.5, 1] });
  add(welcome, cyl(1.6, 1.8, 0.6, 12), toon('#c9a472'), { p: [0, 0.3, 0.6], s: [4.5, 1, 0.8], outline: true });
  for (let k = 0; k < 9; k++) add(welcome, sph(0.3, 8, 6), toon(['#ff5d73', '#ffd84d', '#ff9fc7'][k % 3]), { p: [-6 + k * 1.5, 0.7, 0.9] });
  solids.push({ x: 16, z: -104, w: 14, d: 3 });

  // ---- beach huts along the north side of the boardwalk (their windows light up at night)
  const hutCols = ['#ff7aa8', '#6ee7c0', '#ffd84d', '#7cc0ff', '#ff9f43', '#c59bff', '#ffffff'];
  const huts = [];
  for (let x = -208; x <= 208; x += 9) {
    if (Math.abs(x) < 16 || (x > 40 && x < 70) || (x < -45 && x > -75) || onPierFootprint(x, -24, 8) || Math.abs(x + 95) < 10) continue;
    huts.push({ x, z: -24.5, color: hutCols[Math.abs(Math.round(x / 9)) % hutCols.length] });
  }
  instanced(g, box(6, 4.2, 5).translate(0, 2.1, 0), toon('#ffffff'), huts);
  instanced(g, tf(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-3.6, 0), new THREE.Vector2(3.6, 0), new THREE.Vector2(0, 2.2)]), { depth: 5.8, bevelEnabled: false }), { p: [0, 4.2, -2.9] }), toon('#ffffff'), huts.map((h) => ({ ...h, color: new THREE.Color(h.color).multiplyScalar(0.72).getStyle() })));
  instanced(g, box(1.6, 2.6, 0.12).translate(0, 1.3, 2.52), toon('#ffffff'), huts.map((h) => ({ ...h, color: '#fffaf0' })), { outline: false });
  instanced(g, merge([box(0.9, 0.9, 0.1).translate(-1.9, 2.3, 2.52), box(0.9, 0.9, 0.1).translate(1.9, 2.3, 2.52)]), windowMat(lights, '#fff3c4'), huts, { outline: false });
  for (const h of huts) solids.push({ x: h.x, z: h.z, w: 6.4, d: 5.4 });

  // ---- palm trees (their fronds sway in the wind)
  const trunkParts = [];
  for (let i = 0; i < 7; i++) trunkParts.push(tf(cyl(0.34 - i * 0.03, 0.4 - i * 0.03, 1.15, 8), { p: [i * i * 0.022, 0.55 + i * 1.05, 0], r: [0, 0, -i * 0.035] }));
  const crownTop = [1.31, 7.5, 0];
  const leafParts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, v = [];
    for (let k = 0; k < 6; k++) {
      const u0 = k / 6, u1 = (k + 1) / 6;
      const pt = (u, side) => { const rr = u * 3.6, w = Math.sin(u * Math.PI) * 0.55 * side; const y = 0.5 * u - 2.4 * u * u; return [Math.cos(a) * rr - Math.sin(a) * w, y, Math.sin(a) * rr + Math.cos(a) * w]; };
      const [a0, a1, b0, b1] = [pt(u0, -1), pt(u0, 1), pt(u1, -1), pt(u1, 1)];
      v.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1, ...a0, ...a1, ...b0, ...a1, ...b1, ...b0);
    }
    const leaf = new THREE.BufferGeometry(); leaf.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); leaf.computeVertexNormals();
    leafParts.push(tf(leaf, { p: crownTop }));
  }
  const palms = [];
  const clearOf = (x, z, pad) => !onPierFootprint(x, z, pad) && !COURTS.some((c) => Math.abs(x - c.x) < c.w / 2 + pad + 4 && Math.abs(z - c.z) < c.d / 2 + pad + 6) && Math.hypot(x - PORTAL.x, z - PORTAL.z) > 18 && Math.abs(x) > 8 && Math.abs(z + 60) > 4;
  const palmAt = (x, z, s = sr(0.85, 1.25)) => { if (!clearOf(x, z, 2)) return; palms.push({ x, z, s, ry: sr(0, TAU) }); solids.push({ x, z, r: 0.6 * s }); };
  for (let x = -214; x <= 214; x += 14) palmAt(x + sr(-2, 2), -7.5 + sr(-1, 1));
  for (let i = 0; i < 70; i++) palmAt(sr(-224, 224), sr(-160, -34));
  for (let i = 0; i < 16; i++) { const x = sr(-215, 215); if (!(x > 30 && x < 110)) palmAt(x, sr(20, 32)); }
  for (const [x, z] of places) { palms.push({ x, z, s: 0.8, ry: sr(0, TAU) }); solids.push({ x, z, r: 1.1 }); }
  instanced(g, merge(trunkParts), toon('#a8743f'), palms);
  instanced(g, merge(leafParts), withWind(toon('#3fae4f', { side: THREE.DoubleSide }), 0.09, 4), palms, { outline: false });
  instanced(g, merge([0, 1, 2].map((k) => sph(0.26, 8, 6).translate(crownTop[0] + Math.cos(k * 2.1) * 0.35, crownTop[1] - 0.35, Math.sin(k * 2.1) * 0.35))), toon('#6b4226'), palms, { outline: false });
  instanced(g, cyl(1.1, 0.9, 1, 12), toon('#c9a472'), places.map(([x, z]) => ({ x, y: 0.5, z })));
  // beach grass on the dunes, and grass in the park (both bend in the wind)
  const tufts = [];
  for (let i = 0; i < 900; i++) { const x = sr(-225, 225), z = sr(-34, -2); if (!onPierFootprint(x, z, 1) && Math.abs(x) > 5 && Math.abs(z + 15) > 4) tufts.push({ x, z, ry: sr(0, TAU), s: sr(0.7, 1.4), color: '#8fbf5a' }); }
  for (let i = 0; i < 2600; i++) { const x = sr(-228, 228), z = sr(-163, -34); if (clearOf(x, z, 0) && Math.abs(x) > 6) tufts.push({ x, z, ry: sr(0, TAU), s: sr(0.6, 1.1), color: ['#5aa84a', '#4f9e47', '#6cbc5a'][i % 3] }); }
  const blade = merge([0, 1, 2].map((i) => tf(new THREE.ConeGeometry(0.05, 0.6 + i * 0.12, 3), { p: [(i - 1) * 0.07, (0.6 + i * 0.12) / 2, 0], r: [0, 0, (i - 1) * 0.35] })));
  instanced(g, blade, withWind(toon('#ffffff'), 0.35, 0.05), tufts, { outline: false, cast: false });

  // ---- umbrellas (flapping a little in the wind) and towels on the sand
  const umbCols = ['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#ff9f43', '#c59bff'];
  const umbs = [];
  for (let i = 0; i < 60; i++) {
    const x = sr(-210, 210), z = sr(6, 52);
    if ((x > 35 && x < 105 && z < 32) || (x > -85 && x < -45 && z < 18) || onPierFootprint(x, z, 6) || (x > -135 && x < -105 && z > 20 && z < 40) || (x > -40 && x < -18 && z > 28 && z < 44) || (x > 8 && x < 20 && z > 38)) continue;
    umbs.push({ x, z, color: umbCols[i % umbCols.length], ry: sr(0, TAU), rz: sr(-0.15, 0.15) });
  }
  instanced(g, cyl(0.06, 0.06, 3.2, 6).translate(0, 1.6, 0), toon('#ffffff'), umbs.map((u) => ({ ...u, color: '#f4f0ea' })), { outline: false });
  instanced(g, new THREE.ConeGeometry(2.3, 0.9, 10, 1, true).translate(0, 3.2, 0), withWind(toon('#ffffff', { side: THREE.DoubleSide }), 0.04, 2.8), umbs);
  instanced(g, box(1.4, 0.04, 2.6), toon('#ffffff'), umbs.map((u, i) => ({ ...u, rz: 0, y: 0.03, color: umbCols[(i + 2) % umbCols.length], x: u.x + Math.cos(u.ry) * 1.6, z: u.z - Math.sin(u.ry) * 1.6 })), { outline: false, cast: false });

  // ---- surf shack (Surf Rush)
  const shack = group(g, -66, 0, 10, Math.PI);
  add(shack, box(10, 0.4, 8), plank(3, 3), { p: [0, 0.2, 0], outline: true });
  add(shack, box(9, 4, 0.3), plank(3, 1.3), { p: [0, 2.4, -3.6], outline: true });
  for (const sx of [-1, 1]) add(shack, box(0.3, 4, 7), plank(2, 1.3), { p: [sx * 4.5, 2.4, 0], outline: true });
  add(shack, new THREE.ConeGeometry(7.6, 2.6, 4, 1), toon('#d9b56a'), { p: [0, 5.6, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.8], outline: true });
  add(shack, box(8, 1.2, 1), plank(3, 1), { p: [0, 1.0, 3.2], outline: true });
  ['#ff5d73', '#39c6ff', '#ffd84d', '#6ee7a0'].forEach((c, i) => {
    const b = add(shack, sph(1, 16, 10), toon(c), { p: [-5.8 + (i % 2) * 11.6 + (i > 1 ? (i === 2 ? 0.9 : -0.9) : 0), 1.8, 1 + (i > 1 ? 1 : 0)], s: [0.35, 1.8, 0.08], r: [0.1, 0, (i % 2 ? -1 : 1) * 0.12], outline: true });
    add(b, box(0.1, 1.9, 0.5), toon('#ffffff'), { cast: false });
  });
  const surfSign = letterSign('SURF RUSH', { font: 'chunky', w: 7, h: 1, face: '#ffffff', side: '#39c6ff', depth: 0.2 });
  surfSign.position.set(0, 7.2, 0);
  shack.add(surfSign);
  solids.push({ x: -66, z: 11, w: 10, d: 8 });
  spots.surf = { x: -66, z: 4.5 };

  // ---- crab race track + bleachers + betting booth
  const track = group(g);
  const { x0, x1, z: tz } = CRAB_TRACK;
  add(track, box(x1 - x0 + 6, 0.08, 10), toon('#e8c98c'), { p: [(x0 + x1) / 2, 0.04, tz], cast: false });
  for (let l = 0; l <= 4; l++) add(track, box(x1 - x0 + 6, 0.1, 0.12), toon('#ffffff'), { p: [(x0 + x1) / 2, 0.08, tz - 5 + l * 2.5], cast: false });
  for (let k = 0; k < 10; k++) for (let j = 0; j < 2; j++) add(track, box(0.5, 0.12, 0.5), toon((k + j) % 2 ? '#1d1b2e' : '#ffffff'), { p: [x1 + 0.25 + j * 0.5, 0.09, tz - 4.75 + k], cast: false });
  add(track, box(0.2, 0.12, 10), toon('#e0463c'), { p: [x0, 0.09, tz], cast: false });
  for (let x = x0 - 3; x <= x1 + 3; x += 4) for (const z of [tz - 5.2, tz + 5.2]) add(track, cyl(0.08, 0.08, 1, 6), toon('#8b5a2b'), { p: [x, 0.5, z] });
  for (const z of [tz - 5.2, tz + 5.2]) add(track, cyl(0.04, 0.04, x1 - x0 + 6, 6), toon('#e0463c'), { p: [(x0 + x1) / 2, 0.9, z], r: [0, 0, Math.PI / 2], cast: false });
  for (let row = 0; row < 3; row++) add(track, box(x1 - x0, 0.5, 1.4), plank(10, 1), { p: [(x0 + x1) / 2, 0.25 + row * 0.6, tz - 7.5 - row * 1.4], outline: true });
  solids.push({ x: (x0 + x1) / 2, z: tz - 9, w: x1 - x0, d: 4.4 }, { x: (x0 + x1) / 2, z: tz, w: x1 - x0 + 6, d: 10.4 });
  const crabs = CRAB_COLORS.map((c, i) => {
    const cg = group(track, x0, 0, tz - 3.75 + i * 2.5);
    cg.scale.setScalar(1.6);
    const mat = toon(c);
    add(cg, sph(0.55, 14, 10), mat, { p: [0, 0.45, 0], s: [1.25, 0.6, 1], outline: true });
    for (const sz of [-1, 1]) {
      add(cg, cyl(0.05, 0.05, 0.5, 6), mat, { p: [0.35, 0.8, sz * 0.2] });
      add(cg, sph(0.1, 8, 6), toon('#ffffff'), { p: [0.35, 1.05, sz * 0.2], outline: true });
      add(cg, sph(0.05, 6, 4), basic('#1d1b2e'), { p: [0.43, 1.07, sz * 0.2], cast: false });
      add(cg, sph(0.25, 10, 8), mat, { p: [0.75, 0.55, sz * 0.55], s: [1.2, 0.7, 0.6], outline: true });
      for (let k = 0; k < 3; k++) add(cg, cyl(0.04, 0.04, 0.6, 5), mat, { p: [-0.2 + k * 0.25, 0.3, sz * 0.62], r: [sz * 0.9, 0, 0] });
    }
    const num = letterSign(String(i + 1), { font: 'chunky', w: 0.6, h: 0.6, face: '#ffffff', side: c, depth: 0.12 });
    num.position.set(0, 1.35, 0); num.rotation.y = Math.PI;
    cg.add(num);
    return cg;
  });
  const booth = group(g, 38, 0, 8, Math.PI);
  add(booth, box(4, 2.2, 3), toon('#ffffff'), { p: [0, 1.1, 0], outline: true });
  add(booth, box(4.6, 0.2, 3.6), stripeMat('#e0463c', '#ffffff', 1), { p: [0, 2.9, 0.3], r: [0.2, 0, 0], outline: true });
  for (const sx of [-1, 1]) add(booth, cyl(0.08, 0.08, 2.8, 6), toon('#ffffff'), { p: [sx * 2.1, 1.4, 1.9] });
  const crabSign = letterSign('CRAB RACES', { font: 'chunky', w: 5.5, h: 0.9, face: '#ffffff', side: '#e0463c', depth: 0.2 });
  crabSign.position.set(0, 3.6, 0);
  booth.add(crabSign);
  solids.push({ x: 38, z: 8, w: 4.4, d: 3.4 });
  spots.crabs = { x: 38, z: 4.5 };

  // ---- treasure hut (its pirate flag flies in the wind)
  const dig = group(g, -28, 0, 36, Math.PI);
  add(dig, box(5, 3, 4), plank(2, 1), { p: [0, 1.5, 0], outline: true });
  add(dig, new THREE.ConeGeometry(4.2, 2, 4), toon('#6b4226'), { p: [0, 4, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.85], outline: true });
  add(dig, box(1.5, 1, 1), toon('#8b5a2b'), { p: [3.4, 0.5, 1.2], outline: true });
  add(dig, box(1.6, 0.35, 1.1), shiny('#ffc53d'), { p: [3.4, 1.15, 1.2] });
  const flagPole = add(dig, cyl(0.05, 0.05, 4, 6), toon('#2b2f4a'), { p: [0, 6, 0] });
  const flag = (parent, w, h, color, p) => {
    const f = add(parent, new THREE.PlaneGeometry(w, h, 6, 2).translate(w / 2, 0, 0), toon(color, { side: THREE.DoubleSide }), { p });
    const base = Float32Array.from(f.geometry.attributes.position.array);
    anim.push((t) => { const pp = f.geometry.attributes.position, ws2 = wind.strength.value; for (let i = 0; i < pp.count; i++) { const x = base[i * 3]; pp.setZ(i, Math.sin(t * (5 + ws2 * 2) - x * 4) * 0.09 * x * ws2); } pp.needsUpdate = true; });
    return f;
  };
  flag(flagPole, 1.4, 0.9, '#1d1b2e', [0, 1.4, 0]);
  const digSign = letterSign('TREASURE', { font: 'medieval', w: 5, h: 0.9, face: '#ffd84d', side: '#6b4226', depth: 0.2 });
  digSign.position.set(0, 3.1, 2.05);
  dig.add(digSign);
  solids.push({ x: -28, z: 36, w: 5.4, d: 4.4 });
  spots.dig = { x: -28, z: 32 };

  // ---- lifeguard tower and sandcastles
  const lg = group(g, 14, 0, 44);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(lg, cyl(0.12, 0.12, 3.2, 6), toon('#ffffff'), { p: [sx * 1.1, 1.6, sz * 1.1] });
  add(lg, box(3, 2, 3), toon('#e0463c'), { p: [0, 4.2, 0], outline: true });
  add(lg, box(3.6, 0.2, 3.6), toon('#ffffff'), { p: [0, 5.3, 0], outline: true });
  add(lg, box(2.2, 1, 0.1), toon('#9fe6ff', { emissive: '#9fe6ff', emissiveIntensity: 0.2 }), { p: [0, 4.4, 1.52] });
  add(lg, box(1, 0.1, 3), plank(1, 2), { p: [0, 1.4, 2.4], r: [0.8, 0, 0] });
  const lgPole = add(lg, cyl(0.04, 0.04, 2.4, 6), toon('#ffffff'), { p: [1.4, 6.4, -1.4] });
  flag(lgPole, 1, 0.6, '#ffd84d', [0, 0.8, 0]);
  solids.push({ x: 14, z: 44, w: 2.8, d: 2.8 });
  for (const [x, z] of [[-60, 42], [26, 22], [-180, 26], [190, 34], [-160, 46]]) {
    const cg = group(g, x, 0, z);
    const s = toon('#e6c27a');
    add(cg, cyl(1.2, 1.4, 0.8, 10), s, { p: [0, 0.4, 0], outline: true });
    for (let k = 0; k < 4; k++) add(cg, cyl(0.35, 0.4, 1.2, 8), s, { p: [Math.cos(k * TAU / 4 + 0.4) * 1.1, 0.8, Math.sin(k * TAU / 4 + 0.4) * 1.1], outline: true });
    add(cg, cyl(0.5, 0.6, 1.4, 8), s, { p: [0, 1.4, 0], outline: true });
    const fp = add(cg, cyl(0.02, 0.02, 0.8, 4), toon('#2b2f4a'), { p: [0, 2.4, 0] });
    flag(fp, 0.4, 0.25, '#ff5d73', [0, 0.3, 0]);
    solids.push({ x, z, r: 1.6 });
  }
  // shells, starfish and rocks
  const shellCols = ['#ffd6e0', '#ffe9c4', '#ffffff', '#ffb38a'];
  instanced(g, sph(0.18, 8, 5).scale(1, 0.35, 0.8), toon('#ffffff'), Array.from({ length: 110 }, (_, i) => ({ x: sr(-215, 215), z: sr(0, 60), y: 0.05, ry: sr(0, TAU), s: sr(0.7, 1.3), color: shellCols[i % 4] })), { outline: false, cast: false });
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, rr = i % 2 ? 0.12 : 0.34; starShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
  instanced(g, tf(new THREE.ExtrudeGeometry(starShape, { depth: 0.05, bevelEnabled: false }), { r: [-Math.PI / 2, 0, 0], p: [0, 0.03, 0] }), toon('#ffffff'), Array.from({ length: 40 }, (_, i) => ({ x: sr(-215, 215), z: sr(10, 62), ry: sr(0, TAU), color: ['#ff7a59', '#ff5fa8', '#ffb347'][i % 3] })), { outline: false, cast: false });
  instanced(g, new THREE.DodecahedronGeometry(1, 0), toon('#9a93a8'), [[-214, 58], [-205, 61], [-190, 66], [212, 60], [203, 64], [-60, 70], [-10, 72], [-150, 69], [60, 72]].map(([x, z], i) => ({ x, z, y: 0.2, s: 1.2 + (i % 3) * 0.6, ry: i })));

  // ---- tiki bar and ice cream stand on the boardwalk
  const tiki = group(g, -56, 0, -27);
  add(tiki, box(8, 1.3, 2), plank(3, 1), { p: [0, 0.65, 2], outline: true });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(tiki, cyl(0.2, 0.25, 4, 8), toon('#8b5a2b'), { p: [sx * 3.6, 2, sz * 2.4] });
  add(tiki, new THREE.ConeGeometry(6.4, 2.6, 4), toon('#d9b56a'), { p: [0, 5.2, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.7], outline: true });
  for (let k = 0; k < 5; k++) add(tiki, cyl(0.15, 0.1, 0.4, 8), toon(umbCols[k]), { p: [-2.5 + k * 1.2, 1.5, 2] });
  const tikiSign = letterSign('TIKI BAR', { font: 'chunky', w: 4.5, h: 0.8, face: '#ffd84d', side: '#6b4226', depth: 0.2 });
  tikiSign.position.set(0, 4.1, 2.5); tiki.add(tikiSign);
  for (let k = 0; k < 7; k++) add(tiki, sph(0.22, 8, 6), windowMat(lights, umbCols[k % 6]), { p: [-3.6 + k * 1.2, 3.6 - Math.sin((k / 6) * Math.PI) * 0.4, 2.6], cast: false });
  solids.push({ x: -56, z: -27, w: 8, d: 5.6 });
  spots.tiki = { x: -56, z: -21.5 };
  const ice = group(g, 56, 0, -27);
  add(ice, box(5, 2.4, 3), toon('#ffd6e8'), { p: [0, 1.2, 0], outline: true });
  add(ice, box(5.6, 0.25, 3.8), stripeMat('#ff7aa8', '#ffffff', 1), { p: [0, 3.3, 0.3], r: [0.15, 0, 0], outline: true });
  const cone = group(ice, 0, 5.2, 0);
  add(cone, new THREE.ConeGeometry(0.8, 2.2, 12), toon('#e0a860'), { r: [Math.PI, 0, 0], outline: true });
  add(cone, sph(0.95), toon('#ff9fc7'), { p: [0, 1.3, 0], outline: true });
  add(cone, sph(0.8), toon('#fff4d6'), { p: [0, 2.3, 0], outline: true });
  add(cone, sph(0.18), toon('#e0463c'), { p: [0, 3.15, 0], outline: true });
  anim.push((t) => { cone.rotation.y = t * 0.8; });
  solids.push({ x: 56, z: -27, w: 5, d: 3 });
  spots.ice = { x: 56, z: -23 };

  // ---- seagulls wheeling overhead (blown about in the wind)
  for (let k = 0; k < 10; k++) {
    const gg = group(g);
    add(gg, sph(0.25, 8, 6), toon('#ffffff'), { s: [1.6, 0.8, 0.8], cast: false });
    const wings = [-1, 1].map((s) => add(gg, box(0.1, 0.04, 1.1), toon('#e8e8f0'), { p: [0, 0, s * 0.55], cast: false }));
    const q = { cx: sr(-180, 220), cz: sr(0, 140), r: sr(8, 22), h: sr(12, 22), sp: sr(0.3, 0.6), ph: sr(0, TAU) };
    anim.push((t) => {
      const a = t * q.sp + q.ph;
      gg.position.set(q.cx + Math.cos(a) * q.r + Math.sin(t * 0.1) * 6 * wind.strength.value, q.h + Math.sin(t * 0.7 + q.ph) * 1.5, q.cz + Math.sin(a) * q.r);
      gg.rotation.y = -a;
      wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * Math.sin(t * 8 + q.ph) * 0.5; });
    });
  }

  // ---- the pier and the park
  const pierSpots = [];
  buildPier(g, { anim, lights, solids, spots: pierSpots });
  const park = buildPark(g, { anim, lights, solids, spots: [] });

  return { group: g, anim, solids, spots, pierSpots, park, crabs, seaMat, sky, sunGlow, lights };
}

// ---- little crabs scuttling about on the wet sand (and digging in if you get too close) ------------------------
function beachCrabs(root, n = 22) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const cg = group(root);
    const col = ['#e0463c', '#ff7a2e', '#d6543c'][i % 3];
    add(cg, sph(0.22, 10, 6), toon(col), { p: [0, 0.14, 0], s: [1.3, 0.55, 1], outline: true });
    for (const sz of [-1, 1]) {
      add(cg, sph(0.1, 6, 4), toon(col), { p: [0.3, 0.16, sz * 0.18], s: [1.2, 0.7, 0.7] });
      add(cg, sph(0.04, 5, 4), basic('#1d1b2e'), { p: [0.18, 0.32, sz * 0.08], cast: false });
    }
    const legs = [];
    for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) legs.push(add(cg, cyl(0.015, 0.015, 0.22, 4), toon(col), { p: [-0.12 + k * 0.12, 0.08, sz * 0.22], r: [sz * 0.9, 0, 0], cast: false }));
    let x = rnd(-210, 210);
    while (onPierFootprint(x, 60, 4)) x = rnd(-210, 210);
    list.push({ g: cg, legs, x, z: shoreZ(x) - rnd(1, 8), dir: Math.random() < 0.5 ? -1 : 1, t: rnd(0, 4), hide: 0 });
  }
  return {
    update(dt, t, people) {
      for (const c of list) {
        let near = 99, from = 0;
        for (const p of people.values()) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < near) { near = d; from = p.x; } }
        c.t -= dt;
        if (c.t <= 0) { c.t = rnd(1, 4); c.dir = Math.random() < 0.5 ? -1 : 1; }
        if (near < 3.5) c.dir = c.x > from ? 1 : -1; // scuttle away
        const sp = near < 3.5 ? 3.2 : Math.sin(t * 2 + c.x) > 0.3 ? 0.9 : 0;
        c.x += c.dir * sp * dt;
        if (onPierFootprint(c.x, c.z, 1)) { c.x -= c.dir * sp * dt * 2; c.dir *= -1; }
        c.z = Math.min(shoreZ(c.x) - 0.5, Math.max(shoreZ(c.x) - 10, c.z + Math.sin(t + c.x) * 0.2 * dt));
        c.hide += ((near < 1.6 ? 1 : 0) - c.hide) * Math.min(1, dt * 4);
        c.g.position.set(c.x, -c.hide * 0.3, c.z);
        c.g.rotation.y = Math.PI / 2;
        c.legs.forEach((l, i) => { l.rotation.z = sp ? Math.sin(t * 22 + i) * 0.5 : 0; });
      }
    },
  };
}

// ---- people enjoying the beach (not players): sunbathers, swimmers, sandcastle builders, strollers --------------
function beachgoers(root, anim) {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const look = () => ({
    ...DEFAULT_LOOK, skin: pick(CATALOG.skins.slice(0, 12)), hairColor: pick(CATALOG.hairColors), topColor: pick(CATALOG.clothColors), bottomColor: pick(CATALOG.clothColors),
    hair: pick(['hair_short', 'hair_long', 'hair_ponytail', 'hair_curly', 'hair_afro', 'hair_bun', 'hair_locs', 'hair_waves', 'hair_braid', 'hair_puffs']),
    top: pick(['top_tank', 'top_hawaiian', 'top_tee', 'top_tank']), bottom: 'bottom_shorts', face: pick(['face_none', 'face_sunglasses', 'face_none']), hat: pick(['hat_none', 'hat_bucket', 'hat_cap', 'hat_none']),
  });
  const people = [];
  const spawn = (kind, x, z, h) => {
    const c = new Character(look());
    c.root.position.set(x, 0, z);
    c.root.rotation.y = h;
    c.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(c.root);
    if (kind === 'sun') { c.setPose('lie'); c.root.position.y = 0.06; }
    if (kind === 'swim') c.setPose('swim');
    if (kind === 'dig') { c.setPose('dig'); c.setProp('shovel'); }
    people.push({ c, kind, x, z, x0: x, t: Math.random() * 100 });
  };
  for (let i = 0; i < 10; i++) { const x = rnd(-200, 200); if (!onPierFootprint(x, 30, 8) && !(x > 30 && x < 110)) spawn('sun', x, rnd(14, 48), rnd(0, TAU)); }
  for (let i = 0; i < 6; i++) { const x = rnd(-200, 90); spawn('swim', x, shoreZ(x) + rnd(8, 30), rnd(0, TAU)); }
  spawn('dig', -58.5, 42, -1.2); spawn('dig', 27.6, 24.2, 2.6);
  for (let i = 0; i < 4; i++) { const x = rnd(-180, 80); spawn('walk', x, shoreZ(x) - 2.5, Math.PI / 2); }
  anim.push((t, dt) => {
    for (const p of people) {
      if (p.kind === 'walk') {
        p.t += dt;
        p.x = p.x0 + Math.sin(p.t * 0.05) * 40;
        p.c.root.position.set(p.x, 0, shoreZ(p.x) - 2.5);
        p.c.root.rotation.y = Math.cos(p.t * 0.05) > 0 ? Math.PI / 2 : -Math.PI / 2;
        p.c.update(dt, t, true, 0.9);
      } else if (p.kind === 'swim') {
        p.c.root.position.y = -0.95 + Math.sin(t * 1.5 + p.x) * 0.05;
        p.c.root.rotation.y += dt * 0.15;
        p.c.update(dt, t, false, 1);
      } else p.c.update(dt, t, false, 1);
    }
  });
}

// ---- Crab Race panel ---------------------------------------------------------------------------------------
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

/** Playland: pick any arcade game to play right here on the pier. */
function playlandPanel(body) {
  let off = null;
  const games = [...ARCADE_GAMES, { id: 'surf', name: 'Surf Rush', color: '#39c6ff' }];
  body.innerHTML = `<h2>🕹️ Playland</h2><p class="muted small">Every cabinet from the town's arcade, out on the pier.</p>
    <div class="playland">${games.map((gm) => `<button class="playland-game" data-g="${gm.id}" style="--c:${gm.color}">${esc(gm.name)}</button>`).join('')}</div>`;
  body.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b && !off) off = arcadeCabinet(body, b.dataset.g); });
  return () => off?.();
}

// ---- the area -------------------------------------------------------------------------------------------------------
let env = null;
export function beachArea(stage) {
  env ||= buildBeach();
  const { group: scene3, anim, solids, spots, pierSpots, park, crabs, seaMat, lights } = env;
  const S3 = stage.scene;
  S3.add(scene3);
  stage.camera.far = 1600; // (the sky dome and the horizon are a long way off)
  stage.camera.updateProjectionMatrix();
  // lights, fog and the day/night cycle (shared with the town: same sun, same weather)
  S3.fog = new THREE.Fog('#cfe4fb', 140, 420);
  const hemi = new THREE.HemisphereLight(0xe8f7ff, 0xf2d9a0, 1.2);
  const sun = new THREE.DirectionalLight(0xfff0d4, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  S3.add(hemi, sun, sun.target);
  const dayNight = new DayNight(S3, { sky: env.sky, sunGlow: env.sunGlow, lit: lights, windows: lights.windows, cloudMat: null }, hemi, sun);
  dayNight.groundAt = (x, z) => floorAt(x, z);

  const boats = new Boats(scene3, { anim: [], solids, isWater: (x, z) => inSea(x, z) && x > -400 && x < 400 && z < 480 });
  const balls = new Balls(scene3, park);
  const critters = beachCrabs(scene3);
  if (!env.npcs) { env.npcs = true; beachgoers(scene3, anim); }

  // ---- you: walking, wading, swimming
  let mode = 'walk'; // walk | dig | boat | fish | ride
  let boardedAt = 0; // (the E that gets you on mustn't also get you straight off)
  const walker = stage.walker({
    spawn: { x: rnd(-2, 2), z: spots.portal.spawn }, speed: 6,
    bounds: { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 },
    solids,
    orbit: { yaw: 0, pitch: 0.42, dist: 12, maxDist: 34 },
    ceiling: 200,
    speedOf: () => (inSea(walker.me.x, walker.me.z) && walker.me.z - shoreZ(walker.me.x) > 3 ? 3.6 : 6),
    frozen: () => mode !== 'walk',
    // railings: you can't step up or down more than a stair (so you get on and off the pier by the ramp or the steps); and not past the buoys
    blockedAt: (x, z) => z > SWIM_MAX || Math.abs(floorAt(x, z) - floorAt(walker.me.x, walker.me.z)) > 0.55,
  });
  const me3 = walker.me;
  me3.heading = 0;
  const orbit = stage.orbit;

  // others' poses (digging, on a boat, on a ride, fishing): from area_pose
  const poses = new Map();

  /** Height + pose for anyone, from where they are (the pier, the dock, wading, swimming, a boat). */
  const placePerson = (p, pose, t) => {
    if (pose?.p === 'boat') {
      const b = boats.boats.get(pose.v);
      if (b) { const s = boats.seatPos(b, +pose.s || 0); p.x = s.x; p.z = s.z; p.y = s.y - 0.55; p.heading = s.h; p.tx = s.x; p.tz = s.z; p.char.lean = b.lean ?? 0; }
      if (p.char.pose !== 'drive') { p.char.setPose('drive'); p.char.setProp(null); }
      return;
    }
    if (pose?.p === 'ride' && pose.y != null) { p.y = +pose.y; if (p.char.pose !== 'sit') { p.char.setPose('sit'); p.char.setProp(null); } return; }
    const fl = pierHeight(p.x, p.z);
    if (fl != null) p.y = fl;
    else if (inSea(p.x, p.z)) {
      const depth = p.z - shoreZ(p.x);
      p.y = depth < 3 ? -depth * 0.25 : -0.95 + Math.sin(t * 2 + p.x) * 0.04;
      if (depth >= 3) { if (p.char.pose !== 'swim') { p.char.setPose('swim'); p.char.setProp(null); } return; }
    } else p.y = 0;
    const want = pose?.p === 'dig' ? 'dig' : pose?.p === 'fish' ? 'fish' : 'idle';
    if (p.char.pose !== want && !(want === 'fish' && p === me3)) { p.char.setPose(want); p.char.setProp(want === 'dig' ? 'shovel' : want === 'fish' ? 'rod' : null); }
  };
  const sendPose = (pose) => net.send('area_pose', { pose });

  // ---- HUD: the treasure detector and the context hint
  stage.hud.insertAdjacentHTML('beforeend', `
    <div class="hud-panel beach-detector"><div class="det-top">📡 <b>Treasure detector</b></div><div class="det-bar"><i></i></div><button class="btn small primary det-dig">⛏️ Dig <kbd>F</kbd></button></div>
    <div class="hud-panel beach-ctx hidden"></div>
    <p class="hud-panel arena-help">Walk the sand: the detector beeps faster near buried treasure, press <kbd>F</kbd> to dig · Swim in the sea · <kbd>E</kbd> at the marina to drive a boat or jet ski (<kbd>WASD</kbd>) · Fish off the end of the pier, or from a boat · Play ball at Coral Park (<kbd>F</kbd> shoots, kicks, throws or hits) · Rides, food and Playland on the pier</p>`);
  const bar = stage.hud.querySelector('.det-bar i'), digBtn = stage.hud.querySelector('.det-dig'), ctxEl = stage.hud.querySelector('.beach-ctx');
  if (touch.enabled) setTouchButtons([{ icon: '✋', label: 'Dig', key: 'f', code: 'KeyF' }]);
  let treasure = [], beepAt = 0;
  const holes = [];
  const addHole = (x, z) => {
    holes.push(add(scene3, new THREE.CircleGeometry(0.7, 14), toon('#c9a462'), { p: [x, 0.07, z], r: [-Math.PI / 2, 0, 0], cast: false }));
    holes.push(add(scene3, sph(0.5, 10, 6), toon('#e8c98c'), { p: [x + 0.9, 0, z], s: [1, 0.45, 1], cast: false }));
    while (holes.length > 40) scene3.remove(holes.shift());
  };
  // sand flying off the spade
  const grains = [];
  const grainMat = toon('#e8c98c');
  const throwSand = () => {
    for (let k = 0; k < 6; k++) {
      const m = add(scene3, sph(0.07, 5, 4), grainMat, { p: [me3.x + Math.sin(me3.heading) * 0.8, 0.3, me3.z + Math.cos(me3.heading) * 0.8], cast: false });
      grains.push({ m, v: new THREE.Vector3(-Math.sin(me3.heading) * rnd(1, 2.5) + rnd(-1, 1), rnd(3, 5), -Math.cos(me3.heading) * rnd(1, 2.5) + rnd(-1, 1)), life: 1 });
    }
  };
  let digT = 0;
  const doDig = () => {
    if (mode !== 'walk') return;
    if (inSea(me3.x, me3.z) || pierHeight(me3.x, me3.z) != null || me3.z < -2) { toast('Dig in the sand on the beach!'); return; }
    mode = 'dig'; digT = 1.25;
    me3.char.setPose('dig'); me3.char.setProp('shovel');
    sendPose({ p: 'dig', prop: 'shovel' });
    net.send('area_move', { x: +me3.x.toFixed(2), z: +me3.z.toFixed(2), h: +me3.heading.toFixed(2) });
    setTimeout(() => net.send('beach_dig', {}), 900);
  };
  digBtn.onclick = doDig;

  // ---- fishing (off the pier, or from a boat)
  let fishing = null;
  const fishHost = {
    water: 'ocean', scene: S3, hudRoot: stage.hud,
    fishActor: () => ({ char: me3.char, el: { emote: me3.el.querySelector('.wl-emote') }, set lift(v) { /* (heights come from the pier) */ } }),
    isWater: (x, z) => inSea(x, z),
    stopActivity: () => stopFishing(),
  };
  const startFishing = (spot) => {
    if (fishing) return;
    mode = 'fish';
    if (spot.x != null) { me3.x = spot.x; me3.z = spot.z; }
    me3.heading = spot.heading;
    fishing = new Fishing(fishHost, { X: me3.x, Z: me3.z, heading: spot.heading, dock: false });
    sendPose({ p: 'fish', prop: 'rod' });
  };
  function stopFishing() {
    if (!fishing) return;
    fishing.stop();
    fishing = null;
    mode = boats.ride ? 'boat' : 'walk';
    sendPose(boats.ride ? { p: 'boat', v: boats.ride.b.id, s: boats.ride.seat } : null);
    if (boats.ride) me3.char.setPose('drive');
  }

  // ---- rides: Ferris wheel, roller coaster, carousel, drop tower
  let ride = null;
  const startRide = (kind, sp) => {
    if (mode !== 'walk') return;
    boardedAt = performance.now();
    ride = { kind, sp, t: 0, T: { ferris: 75, coaster: 26, carousel: 30, drop: 14 }[kind] };
    mode = 'ride';
    me3.char.setPose('sit');
    sfx(kind === 'coaster' ? 'whoosh' : 'pop');
    stage.banner({ ferris: '🎡 All aboard the Ferris wheel! Look out over the bay.', coaster: '🎢 Hold on tight!', carousel: '🎠 Round and round…', drop: '🗼 Up, up, up… and DOWN!' }[kind], 2600);
  };
  const tmpV = new THREE.Vector3(), tmpT = new THREE.Vector3();
  const endRide = () => {
    if (!ride) return;
    const sp = ride.sp;
    ride = null; mode = 'walk';
    me3.x = sp.x; me3.z = sp.z; me3.y = PIER_Y;
    me3.char.setPose('idle');
    sendPose(null);
  };
  const rideUpdate = (dt, t) => {
    ride.t += dt;
    const sp = ride.sp;
    if (ride.kind === 'ferris') { sp.gondolas[0].getWorldPosition(tmpV); me3.x = tmpV.x; me3.z = tmpV.z; me3.y = tmpV.y - 1.9; }
    else if (ride.kind === 'carousel') { const a = t * 0.5; me3.x = sp.center.x + Math.cos(-a) * 3.8; me3.z = sp.center.z + Math.sin(-a) * 3.8; me3.y = PIER_Y + 1.6 + Math.sin(t * 2) * 0.35; me3.heading = -a; }
    else if (ride.kind === 'drop') { sp.ring.getWorldPosition(tmpV); me3.x = tmpV.x + 2.6; me3.z = tmpV.z; me3.y = tmpV.y - 1.5; me3.heading = -Math.PI / 2; }
    else if (ride.kind === 'coaster') {
      const u = (ride.t / ride.T) % 1;
      sp.path.getPointAt(u, tmpV); sp.path.getTangentAt(u, tmpT);
      me3.x = tmpV.x; me3.z = tmpV.z; me3.y = PIER_Y + tmpV.y + 0.4; me3.heading = Math.atan2(tmpT.x, tmpT.z);
      if (tmpT.y < -0.3 && Math.random() < dt * 3) sfx('whoosh', { vol: 0.3 });
    }
    if (Math.random() < dt * 6) sendPose({ p: 'ride', y: +me3.y.toFixed(2) });
    if (ride.t >= ride.T) endRide();
  };

  // ---- boats
  const seatTaken = (bid, s) => [...poses.entries()].some(([k, p]) => k !== S.me && p?.p === 'boat' && p.v === bid && +p.s === s);
  const boardBoat = (b) => {
    const seat = boats.board(b, seatTaken);
    if (seat < 0) { toast('That boat is full!'); return; }
    mode = 'boat';
    boardedAt = performance.now();
    me3.char.setPose('drive'); me3.char.setProp(null);
    sendPose({ p: 'boat', v: b.id, s: seat });
    stage.banner(seat === 0 ? `🚤 You're driving the <b>${b.t.name}</b>! <kbd>W</kbd>/<kbd>S</kbd> throttle · <kbd>A</kbd>/<kbd>D</kbd> steer · <kbd>E</kbd> to hop off` : `You hopped aboard the <b>${b.t.name}</b>. <kbd>E</kbd> to hop off.`, 3500);
    sfx('horn');
  };
  const leaveBoat = () => {
    const at = boats.leave();
    mode = 'walk';
    if (at) { me3.x = at.x; me3.z = at.z; }
    me3.char.setPose('idle');
    sendPose(null);
  };

  // ---- interactables
  stage.interactable({ x: spots.portal.x, z: spots.portal.z, r: 6, label: 'go through the portal to The Town', use: () => stage.onExit?.() });
  stage.interactable({ x: spots.surf.x, z: spots.surf.z, r: 4, label: 'play Surf Rush', use: () => stage.openPanel({ wide: true, mount: (body) => arcadeCabinet(body, 'surf') }) });
  let crabState = null;
  stage.interactable({ x: spots.crabs.x, z: spots.crabs.z, r: 3.5, label: 'bet on the crab races', use: () => stage.openPanel({ mount: (body) => crabPanel(body, () => crabState) }) });
  stage.interactable({ x: spots.dig.x, z: spots.dig.z, r: 3.5, label: 'read the treasure map', use: () => stage.banner('🏴‍☠️ Treasure is buried all over the beach! Watch the <b>detector</b>: the fuller it gets (and the faster it beeps), the closer you are. Stand right on top and press <b>F</b> to dig.', 6500) });
  const snack = (name) => () => { me3.char.emote('heart'); sfx('coin', { vol: 0.5 }); stage.banner(`😋 You grabbed something tasty from <b>${esc(name)}</b>.`, 1800); };
  stage.interactable({ x: spots.tiki.x, z: spots.tiki.z, r: 3.5, label: 'order a coconut drink', use: snack('the Tiki Bar') });
  stage.interactable({ x: spots.ice.x, z: spots.ice.z, r: 3.5, label: 'get an ice cream', use: snack('the ice cream stand') });
  for (const sp of pierSpots) {
    const use = {
      food: snack(sp.name), gift: () => stage.banner('🎁 Postcards, shell necklaces and Coral Cove snow globes. Cute!', 2200),
      bait: () => stage.banner('🎣 Head to the end of the pier (or take a boat out) to fish the ocean. New fish out there!', 3000),
      fish: () => startFishing(sp), playland: () => stage.openPanel({ wide: true, mount: playlandPanel }),
      ferris: () => startRide('ferris', sp), coaster: () => startRide('coaster', sp), carousel: () => startRide('carousel', sp), drop: () => startRide('drop', sp),
    }[sp.kind];
    const label = { food: `eat at ${sp.name}`, gift: `browse ${sp.name}`, bait: 'chat at the bait shop', fish: 'fish off the pier', playland: 'play at Playland', ferris: 'ride the Ferris wheel', coaster: 'ride the roller coaster', carousel: 'ride the carousel', drop: 'ride the drop tower' }[sp.kind];
    if (use) stage.interactable({ x: sp.x, z: sp.z, r: sp.kind === 'fish' ? 1.6 : 3.2, label, use });
  }
  // the nearest boat you could board (follows you around the marina)
  const boatInter = stage.interactable({ x: 1e6, z: 1e6, r: 0, label: 'board the boat', use: () => { const b = boats.nearest(me3); if (b && mode === 'walk') boardBoat(b); } });

  // ---- input: F for the context action; E off boats and rides; Space/click to fish
  const action = () => {
    if (mode === 'fish' || mode === 'ride') return;
    if (mode === 'boat') { const b = boats.ride.b; if (b.t.fishing || Math.abs(b.v) < 1) startFishing({ heading: b.h + Math.PI / 2 }); return; }
    if (balls.act(me3)) return;
    doDig();
  };
  const offKeys = onKeys((e) => {
    const k = e.key.toLowerCase();
    if (k === 'f' && !e.repeat) action();
    if (k === 'e' && !e.repeat && performance.now() - boardedAt > 400) { if (mode === 'boat') leaveBoat(); else if (mode === 'ride') endRide(); }
  });
  stage.onKey = (e, down) => {
    if (!fishing) return;
    if (e.code === 'Space') { if (down && !e.repeat) fishing.press(); else if (!down) fishing.release(); }
    if (down && ['w', 'a', 's', 'd'].includes(e.key.toLowerCase()) && !boats.ride) stopFishing();
  };
  stage.onPointer = (type, e) => {
    if (!fishing || e?.target?.closest?.('.fish-hud button, .fish-rods')) return;
    if (type === 'down') fishing.press();
    if (type === 'up') fishing.release();
  };

  // ---- crab race playback
  let race = null;
  const setCrabs = (m) => {
    crabState = { ...m, at: performance.now() };
    if (m.state === 'racing') race = { at: performance.now(), times: m.times };
    if (m.state === 'betting') { race = null; crabs.forEach((c) => { c.position.x = CRAB_TRACK.x0; }); }
    if (m.state === 'result' && m.winner != null) {
      const win = m.wins?.[S.me];
      if (Math.hypot(me3.x - 70, me3.z - 16) < 45) stage.banner(`🦀 <b>${esc(m.names[m.winner])}</b> wins the crab race!${win ? ` You won <b>${fmt(win)}</b> 🪙!` : ''}`, 3500);
      if (win) sfx('win');
    }
  };
  balls.onEvent = (msg) => stage.banner(`<span class="big">${msg}</span>`, 1500);

  const off = listen({
    beach: (m) => {
      treasure = m.treasure;
      for (const b of m.balls ?? []) balls.apply(b);
      for (const [court, s] of Object.entries(m.courts ?? {})) balls.scoreboard(court, s);
      for (const [id, b] of Object.entries(m.boats ?? {})) boats.apply(id, b);
    },
    treasure: (m) => { treasure = m.treasure; },
    beach_hole: (m) => addHole(m.x, m.z),
    dig_result: (m) => {
      addHole(m.x, m.z);
      if (!m.found) { toast('Nothing here… keep looking!'); return; }
      const what = { chest: '🏴‍☠️ A TREASURE CHEST', pearl: '🦪 A shiny pearl', coins: '🪙 A pouch of coins' }[m.kind] ?? 'Treasure';
      stage.banner(`${what}! <b>+${fmt(m.coins)}</b> 🪙`, 3000);
      sfx(m.kind === 'chest' ? 'win' : 'coin');
      me3.char.emote('gg');
    },
    crabs: (m) => setCrabs(m),
    crab_bets: (m) => { if (crabState) crabState.bets = m.bets; },
    area: (m) => { poses.clear(); for (const q of m.others) if (q.pose) poses.set(q.k, q.pose); },
    area_pose: (m) => { if (m.pose) poses.set(m.k, m.pose); else poses.delete(m.k); },
    area_del: (m) => poses.delete(m.k),
    ball: (m) => balls.apply(m),
    court_score: (m) => {
      balls.scoreboard(m.court, m.s);
      const ct = COURTS.find((c) => c.id === m.court);
      if (ct && Math.hypot(me3.x - ct.x, me3.z - ct.z) < 60) sfx('cheer', { vol: 0.4 });
    },
    boat: (m) => boats.apply(m.id, m),
    error: (m) => { if (m.for === 'boat_take' && boats.ride) { boats.ride = null; mode = 'walk'; me3.char.setPose('idle'); sendPose(null); } },
  });

  // ---- sounds: the surf, the wind, the rain, gulls, the boat's motor
  const waves = ambient('waves'), windS = ambient('wind'), rainS = ambient('rain'), engine = ambient('engine');
  let gullAt = 3;
  const center = new THREE.Vector3();

  stage.onFrame((dt, now) => {
    const t = now / 1000;
    const dn = dayNight.update(center.set(me3.x, 0, me3.z));
    seaMat.color.setScalar(0.35 + dn.day * 0.65);
    for (const fn of anim) fn(t, dt, dn.night);
    boats.animate(t, dt);
    critters.update(dt, t, stage.people);
    // you
    if (mode === 'dig') {
      digT -= dt;
      if (Math.random() < dt * 4) { throwSand(); sfx('dig', { vol: 0.5 }); }
      if (digT <= 0) { mode = 'walk'; me3.char.setPose('idle'); me3.char.setProp(null); sendPose(null); }
    }
    if (boats.ride) {
      boats.drive(dt, stage.keys);
      const b = boats.ride.b, s = boats.seatPos(b, boats.ride.seat);
      me3.x = s.x; me3.z = s.z; me3.y = s.y - 0.55; me3.heading = s.h;
      me3.char.lean = b.lean ?? 0;
      engine.set(0.2 + Math.min(1, Math.abs(b.v) / b.t.speed) * 0.8, Math.abs(b.v) / b.t.speed);
    } else engine.set(0);
    if (mode === 'ride' && ride) rideUpdate(dt, t);
    if (fishing) fishing.update(dt, now);
    // everyone's height and pose (pier, dock, wading, swimming, boats, rides)
    for (const p of stage.people.values()) {
      if (p === me3) { if (mode === 'walk' || mode === 'dig' || (mode === 'fish' && !boats.ride)) placePerson(p, mode === 'fish' ? { p: 'fish' } : mode === 'dig' ? { p: 'dig' } : null, t); }
      else placePerson(p, poses.get(p.k), t);
    }
    if (mode === 'walk' && inSea(me3.x, me3.z) && me3.moving && Math.random() < dt * 2.5) sfx('swim', { vol: 0.35 });
    // the camera follows you up onto the pier, the rides and the boats
    orbit.target.y = me3.y;
    // sand flying
    for (let i = grains.length - 1; i >= 0; i--) {
      const gr = grains[i];
      gr.v.y -= 14 * dt; gr.m.position.addScaledVector(gr.v, dt); gr.life -= dt;
      if (gr.life <= 0 || gr.m.position.y < 0) { scene3.remove(gr.m); grains.splice(i, 1); }
    }
    // the nearest boat you could board
    const nb = mode === 'walk' ? boats.nearest(me3, 3.5) : null;
    boatInter.x = nb ? me3.x : 1e6; boatInter.z = nb ? me3.z : 1e6; boatInter.r = nb ? 1 : 0;
    if (nb) boatInter.label = nb.driver && nb.driver !== S.me ? `hop aboard the ${nb.t.name}` : `drive the ${nb.t.name}`;
    // the context hint (and the phone's action button)
    const near = mode === 'walk' ? balls.near(me3) : null;
    const canFishBoat = boats.ride && (boats.ride.b.t.fishing || Math.abs(boats.ride.b.v) < 1);
    const ctx = mode === 'boat' ? `${canFishBoat ? '🎣 <kbd>F</kbd> fish from the boat · ' : ''}<kbd>E</kbd> hop off`
      : mode === 'ride' ? '<kbd>E</kbd> get off the ride' : near ? `${near.icon} <kbd>F</kbd> ${near.verb}` : null;
    ctxEl.classList.toggle('hidden', !ctx);
    if (ctx && ctxEl.dataset.k !== ctx) { ctxEl.dataset.k = ctx; ctxEl.innerHTML = ctx; }
    const tb = document.querySelector('.touch-buttons button small');
    if (tb) tb.textContent = mode === 'boat' ? 'Fish' : near ? near.verb : 'Dig';
    balls.update(dt, me3, stage.people);
    // the treasure detector
    if (treasure.length) {
      const d = Math.min(...treasure.map((q) => Math.hypot(q.x - me3.x, q.z - me3.z)));
      const onSand = me3.z > -2 && me3.z < shoreZ(me3.x) + 1 && mode === 'walk' && pierHeight(me3.x, me3.z) == null;
      const k = onSand ? Math.max(0, 1 - d / 28) : 0;
      bar.style.width = `${Math.round(k * 100)}%`;
      bar.style.background = k > 0.9 ? '#6ee7a0' : k > 0.6 ? '#ffd84d' : '#39c6ff';
      if (k > 0.05 && now > beepAt) { sfx('near', { vol: 0.25 + k * 0.4 }); beepAt = now + 1400 - k * 1250; }
    }
    // crabs racing
    if (race) {
      const el = (now - race.at) / 1000;
      crabs.forEach((c, i) => {
        const u = Math.min(1, el / race.times[i]);
        const wob = u < 1 ? Math.sin(el * 7 + i * 2) * 0.03 * (1 - u) : 0;
        c.position.x = CRAB_TRACK.x0 + (CRAB_TRACK.x1 - CRAB_TRACK.x0) * Math.min(1, Math.max(0, u + wob));
        c.position.y = u < 1 ? Math.abs(Math.sin(el * 14 + i)) * 0.12 : 0;
      });
    }
    // sounds
    const shoreD = Math.abs(me3.z - shoreZ(me3.x));
    waves.set(Math.max(0.15, 1 - shoreD / 70) * (0.8 + wind.strength.value * 0.15));
    windS.set(Math.max(0, wind.strength.value - 1.3) * 0.5);
    rainS.set(dn.storm);
    if ((gullAt -= dt) <= 0) { gullAt = 4 + Math.random() * 9; if (me3.z > -40 && dn.night < 0.5) sfx('gull', { vol: 0.4 }); }
  });

  return () => {
    walker.stop(); off(); offKeys();
    fishing?.stop();
    if (boats.ride) net.send('boat_leave', {});
    for (const s of [waves, windS, rainS, engine]) s.stop();
    setTouchButtons([]);
    for (const b of boats.boats.values()) scene3.remove(b.g);
    for (const b of balls.balls.values()) scene3.remove(b.mesh);
    stage.scene?.remove(scene3);
    stage.camera.far = 600;
    stage.camera.updateProjectionMatrix();
  };
}
