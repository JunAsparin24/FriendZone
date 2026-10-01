// Coral Park: pickup games on the grass behind the beach (two basketball courts and a soccer pitch you
// can ready up and play proper matches on), beach volleyball on the sand, and Coral Links golf. Street-court style: bright painted courts, chain-
// link fences, bleachers, light towers and a lit scoreboard for each.
// Balls are shared: whoever touches one last simulates it and sends its state; everyone else runs the
// same physics and follows. Scores go through the server so everyone sees the same board.
import * as THREE from 'three';
import { net } from '../../net.js';
import { S, nameOf } from '../../state.js';
import { toon, shiny, basic, canvasTexture, TAU } from '../../three/materials.js';
import { letterSign } from '../../three/signs3d.js';
import { sfx } from '../../sfx.js';
import { add, box, cyl, sph, group, plank, lamp, seeded } from './common.js';

const G = 16; // gravity
export const COURTS = [
  // margin: the out-of-bounds strip round the lines that players in a match can still use
  { id: 'bb1', kind: 'basket', x: -46, z: -106, w: 28, d: 15, ball: 'basketball', margin: 2.2, match: true },
  { id: 'bb2', kind: 'basket', x: -46, z: -76, w: 28, d: 15, ball: 'basketball', margin: 2.2, match: true },
  { id: 'soccer', kind: 'soccer', x: -108, z: -92, w: 56, d: 34, ball: 'soccer', margin: 4, match: true },
  { id: 'volley', kind: 'volley', x: -96, z: 30, w: 18, d: 9, ball: 'volleyball', margin: 3 },
];
const BALL = {
  basketball: { r: 0.25, bounce: 0.78, roll: 1.4, color: '#ff7a2e', hold: true, verb: 'Shoot', icon: '🏀' },
  soccer: { r: 0.24, bounce: 0.55, roll: 0.8, color: '#ffffff', hold: false, verb: 'Kick', icon: '⚽' },
  volleyball: { r: 0.23, bounce: 0.45, roll: 3, color: '#fff4d6', hold: false, verb: 'Hit', icon: '🏐' },
};
const RIM_Y = 3.3, RIM_R = 0.42;

// ---- textures -------------------------------------------------------------------------------------
function courtTex(kind, w, d) {
  const px = 16, W = Math.round(w * px), H = Math.round(d * px);
  return canvasTexture(W, H, (c) => {
    const line = (x0, y0, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
    c.lineWidth = 3; c.strokeStyle = '#ffffff';
    if (kind === 'basket') {
      c.fillStyle = '#2f6fd6'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ff9f43';
      for (const s of [0, 1]) { const x = s ? W - 5.8 * px : 0; c.fillRect(x, H / 2 - 2.4 * px, 5.8 * px, 4.8 * px); }
      c.strokeRect(4, 4, W - 8, H - 8); line(W / 2, 4, W / 2, H - 4);
      c.beginPath(); c.arc(W / 2, H / 2, 1.8 * px, 0, TAU); c.stroke();
      for (const s of [0, 1]) {
        const hx = s ? W - 1.6 * px : 1.6 * px;
        c.beginPath(); c.arc(hx, H / 2, 6.75 * px, s ? Math.PI / 2 : -Math.PI / 2, s ? Math.PI * 1.5 : Math.PI / 2, false); c.stroke();
        c.strokeRect(s ? W - 5.8 * px : 0, H / 2 - 2.4 * px, 5.8 * px, 4.8 * px);
        c.beginPath(); c.arc(s ? W - 5.8 * px : 5.8 * px, H / 2, 1.8 * px, 0, TAU); c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,.18)'; c.font = `bold ${3 * px}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('CORAL', W / 2, H / 2);
    } else if (kind === 'soccer') {
      for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#4fa843' : '#5cb85a'; c.fillRect((i * W) / 12, 0, W / 12 + 1, H); }
      c.strokeRect(4, 4, W - 8, H - 8); line(W / 2, 4, W / 2, H - 4);
      c.beginPath(); c.arc(W / 2, H / 2, 6 * px, 0, TAU); c.stroke();
      for (const s of [0, 1]) { c.strokeRect(s ? W - 12 * px : 4, H / 2 - 12 * px, 12 * px, 24 * px); c.strokeRect(s ? W - 4 * px : 4, H / 2 - 6 * px, 4 * px, 12 * px); }
    } else {
      c.clearRect(0, 0, W, H);
      c.strokeStyle = '#3b82f6'; c.lineWidth = 5; c.strokeRect(3, 3, W - 6, H - 6); line(W / 2, 3, W / 2, H - 3);
    }
  });
}
function scoreboardTex() {
  const tex = canvasTexture(256, 96, () => {});
  tex.draw = (label, s) => {
    const c = tex.image.getContext('2d');
    c.fillStyle = '#0b0f1e'; c.fillRect(0, 0, 256, 96);
    c.strokeStyle = '#ffd84d'; c.lineWidth = 4; c.strokeRect(2, 2, 252, 92);
    c.fillStyle = '#8ff2ff'; c.font = 'bold 18px monospace'; c.textAlign = 'center'; c.fillText(label, 128, 24);
    c.font = 'bold 44px monospace'; c.fillStyle = '#ff5d73'; c.fillText(String(s[0]).padStart(2, '0'), 64, 78);
    c.fillStyle = '#39c6ff'; c.fillText(String(s[1]).padStart(2, '0'), 192, 78);
    c.fillStyle = '#ffffff'; c.fillText(':', 128, 74);
    tex.needsUpdate = true;
  };
  return tex;
}

// ---- building the park ------------------------------------------------------------------------------
function fence(g, x0, z0, x1, z1, h = 3.2, gapAt = null) {
  const mesh = new THREE.MeshBasicMaterial({ color: '#9aa3b8', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
  const fg = group(g, (x0 + x1) / 2, 0, (z0 + z1) / 2, a);
  add(fg, new THREE.PlaneGeometry(len, h), mesh, { p: [0, h / 2, 0], r: [0, Math.PI / 2, 0], cast: false });
  for (let t = -len / 2; t <= len / 2 + 0.01; t += 3) add(fg, cyl(0.06, 0.06, h, 6), toon('#6d7488'), { p: [0, h / 2, t] });
  add(fg, cyl(0.05, 0.05, len, 6), toon('#6d7488'), { p: [0, h, 0], r: [Math.PI / 2, 0, 0] });
}

function hoop(g, x, z, dir, anim) {
  const hg = group(g, x, 0, z, dir > 0 ? 0 : Math.PI);
  add(hg, cyl(0.14, 0.18, 4, 10), toon('#3a3f55'), { p: [-1.1, 2, 0], outline: true });
  add(hg, box(1, 0.14, 0.14), toon('#3a3f55'), { p: [-0.6, 3.9, 0] });
  add(hg, box(0.08, 1.2, 1.9), new THREE.MeshToonMaterial({ color: '#dff4ff', transparent: true, opacity: 0.55, gradientMap: toon('#fff').gradientMap }), { p: [-0.1, 3.8, 0], cast: false });
  add(hg, box(0.1, 0.45, 0.6), basic('#ff5d73', { transparent: true, opacity: 0.8 }), { p: [-0.05, 3.55, 0], cast: false });
  add(hg, new THREE.TorusGeometry(RIM_R, 0.03, 6, 20), toon('#ff5a1e'), { p: [0.4, RIM_Y, 0], r: [Math.PI / 2, 0, 0] });
  const net = add(hg, new THREE.CylinderGeometry(RIM_R, RIM_R * 0.6, 0.55, 12, 3, true), new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.8 }), { p: [0.4, RIM_Y - 0.28, 0], cast: false });
  return { x: x + dir * 0.4, z, net, swish: 0 };
}

function goal(g, x, z, dir, w = 7.3, h = 2.44, color = '#ffffff') {
  const gg = group(g, x, 0, z, dir > 0 ? 0 : Math.PI);
  for (const sz of [-1, 1]) add(gg, cyl(0.08, 0.08, h, 8), toon(color), { p: [0, h / 2, sz * w / 2] });
  add(gg, cyl(0.08, 0.08, w, 8), toon(color), { p: [0, h, 0], r: [Math.PI / 2, 0, 0] });
  const netMat = new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.5 });
  add(gg, new THREE.PlaneGeometry(w, h, 10, 4), netMat, { p: [-1.6, h / 2, 0], r: [0, Math.PI / 2, 0], cast: false });
  for (const sz of [-1, 1]) add(gg, new THREE.PlaneGeometry(1.6, h, 3, 4), netMat, { p: [-0.8, h / 2, sz * w / 2], cast: false });
  add(gg, new THREE.PlaneGeometry(w, 1.6, 10, 3), netMat, { p: [-0.8, h, 0], r: [-Math.PI / 2, 0, Math.PI / 2], cast: false });
}

function bleachers(g, x, z, len, ry, rows = 4) {
  const bg = group(g, x, 0, z, ry);
  for (let k = 0; k < rows; k++) {
    add(bg, box(len, 0.25, 0.9), plank(len / 2, 1, '#dfe6ee'), { p: [0, 0.5 + k * 0.55, -k * 0.9], outline: true });
    add(bg, box(len, 0.55 * (k + 1), 0.1), toon('#6d7488'), { p: [0, 0.27 * (k + 1), -k * 0.9 + 0.45], cast: false });
  }
}

export function buildPark(root, { anim, lights, solids, spots }) {
  const g = group(root);
  const r = seeded(77);
  const boards = {};
  const hoops = {};
  for (const ct of COURTS) {
    const { x, z, w, d, kind } = ct;
    if (kind !== 'volley') {
      // a slab for the court, painted on top
      const tex = courtTex(kind, w + (kind === 'basket' ? 0 : 0), d);
      add(g, box(w + 4, 0.1, d + 4), toon(kind === 'basket' ? '#3a3f55' : '#3f8a3a'), { p: [x, 0.03, z], cast: false });
      add(g, new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ map: tex, gradientMap: toon('#fff').gradientMap }), { p: [x, 0.09, z], r: [-Math.PI / 2, 0, 0], cast: false });
    } else {
      add(g, new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: courtTex('volley', w, d), transparent: true }), { p: [x, 0.05, z], r: [-Math.PI / 2, 0, 0], cast: false });
    }
    if (kind === 'basket') {
      hoops[ct.id] = [hoop(g, x - w / 2 + 1.2, z, 1, anim), hoop(g, x + w / 2 - 1.2, z, -1, anim)];
      const fz = ct.id === 'bb1' ? z - d / 2 - 2 : z + d / 2 + 2;
      fence(g, x - w / 2 - 2, fz, x + w / 2 + 2, fz);
      fence(g, x - w / 2 - 2, z - d / 2 - 2, x - w / 2 - 2, z + d / 2 + 2);
      fence(g, x + w / 2 + 2, z - d / 2 - 2, x + w / 2 + 2, z + d / 2 + 2);
      bleachers(g, x, z + (ct.id === 'bb1' ? -1 : 1) * (d / 2 + 3.2), w * 0.6, ct.id === 'bb1' ? 0 : Math.PI, 3);
    } else if (kind === 'soccer') {
      goal(g, x - w / 2, z, 1); goal(g, x + w / 2, z, -1);
      bleachers(g, x, z - d / 2 - 3, w * 0.7, 0, 5);
    } else {
      // volleyball: posts and a net across the middle
      for (const sz of [-1, 1]) add(g, cyl(0.08, 0.08, 2.8, 8), toon('#ffffff'), { p: [x, 1.4, z + sz * (d / 2 + 0.8)] });
      add(g, new THREE.PlaneGeometry(d + 1.6, 0.9, 12, 3), new THREE.MeshBasicMaterial({ color: '#1d1b2e', wireframe: true, transparent: true, opacity: 0.7 }), { p: [x, 2.2, z], r: [0, Math.PI / 2, 0], cast: false });
      add(g, box(0.06, 0.08, d + 1.6), toon('#ffffff'), { p: [x, 2.65, z] });
      ct.netTop = 2.65;
    }
    // scoreboard on a pole
    const tex = scoreboardTex();
    const label = { basket: 'HOOPS', soccer: 'SOCCER', volley: 'VOLLEYBALL' }[kind];
    tex.draw(label, [0, 0]);
    const sb = group(g, x + (kind === 'soccer' ? w / 2 - 6 : 0), 0, z - d / 2 - (kind === 'basket' ? 1.2 : kind === 'volley' ? 2.5 : 3));
    add(sb, cyl(0.12, 0.12, 4.5, 8), toon('#3a3f55'), { p: [0, 2.25, 0] });
    add(sb, box(3.3, 1.35, 0.2), toon('#23263f'), { p: [0, 4.9, 0], outline: true });
    add(sb, new THREE.PlaneGeometry(3.1, 1.16), new THREE.MeshBasicMaterial({ map: tex }), { p: [0, 4.9, 0.11], cast: false });
    add(sb, new THREE.PlaneGeometry(3.1, 1.16), new THREE.MeshBasicMaterial({ map: tex }), { p: [0, 4.9, -0.11], r: [0, Math.PI, 0], cast: false });
    boards[ct.id] = { tex, label, s: [0, 0] };
  }
  // light towers round the park, glowing at night
  for (const [x, z] of [[-140, -114], [-140, -70], [-76, -114], [-76, -70], [-24, -118], [-24, -64]]) {
    add(g, cyl(0.2, 0.3, 12, 8), toon('#6d7488'), { p: [x, 6, z] });
    add(g, box(2.4, 1, 0.6), lights.lanternMat, { p: [x, 12.2, z], cast: false });
  }
  // the park sign: a neon arch where the boardwalk meets the courts
  const arch = group(g, -76, 0, -48);
  for (const sx of [-1, 1]) add(arch, box(1, 7, 1), toon('#23263f'), { p: [sx * 8, 3.5, 0], outline: true });
  add(arch, box(17, 1.8, 0.6), toon('#23263f'), { p: [0, 7.4, 0], outline: true });
  const ps = letterSign('CORAL PARK', { font: 'military', w: 14, h: 1.3, face: '#ffd84d', side: '#ff5d73', depth: 0.25, bulbs: true, glow: 0.7 });
  ps.position.set(0, 6.7, 0.35);
  arch.add(ps);
  // a graffiti wall between the courts, and a DJ booth with thumping speakers
  const wall = canvasTexture(512, 128, (c) => {
    c.fillStyle = '#6a6f80'; c.fillRect(0, 0, 512, 128);
    const cols = ['#ff4fd8', '#39e6ff', '#ffd84d', '#6ee7a0', '#ff9f43'];
    for (let i = 0; i < 40; i++) { c.fillStyle = cols[i % 5] + '88'; c.beginPath(); c.arc(Math.random() * 512, Math.random() * 128, 6 + Math.random() * 22, 0, TAU); c.fill(); }
    c.font = 'bold 64px sans-serif'; c.lineWidth = 8; c.strokeStyle = '#1d1b2e'; c.fillStyle = '#ffd84d'; c.textAlign = 'center';
    c.strokeText('COVE BALL', 256, 88); c.fillText('COVE BALL', 256, 88);
  });
  add(g, box(24, 4, 0.8), toon('#6a6f80'), { p: [-46, 2, -90.5], outline: true });
  for (const sz of [1, -1]) add(g, new THREE.PlaneGeometry(24, 4), new THREE.MeshToonMaterial({ map: wall, gradientMap: toon('#fff').gradientMap }), { p: [-46, 2, -90.5 + sz * 0.41], r: [0, sz > 0 ? 0 : Math.PI, 0], cast: false });
  solids.push({ x: -46, z: -90.5, w: 24, d: 0.8 });
  const dj = group(g, -24, 0, -56);
  add(dj, box(3, 1.2, 1.5), toon('#23263f'), { p: [0, 0.6, 0], outline: true });
  add(dj, box(3.2, 0.1, 1.7), toon('#ff4fd8'), { p: [0, 1.25, 0] });
  const speakers = [];
  for (const sx of [-1, 1]) {
    const sp = add(dj, box(1.2, 2.4, 1.1), toon('#1d1b2e'), { p: [sx * 2.6, 1.2, 0], outline: true });
    const cone = add(sp, cyl(0.4, 0.4, 0.1, 16), toon('#6d7488'), { p: [0, -0.3, 0.56], r: [Math.PI / 2, 0, 0] });
    speakers.push(cone);
  }
  anim.push((t) => speakers.forEach((s) => { s.scale.setScalar(1 + Math.max(0, Math.sin(t * 13)) * 0.12); }));
  solids.push({ x: -24, z: -56, w: 7, d: 2 });
  // benches along the paths
  for (let k = 0; k < 6; k++) {
    const x = -150 + k * 22 + r() * 4, z = -60.5;
    add(g, box(2.6, 0.15, 0.7), plank(1, 1), { p: [x, 0.55, z], outline: true });
    for (const sx of [-1, 1]) add(g, box(0.15, 0.55, 0.6), toon('#3a3f55'), { p: [x + sx * 1.1, 0.27, z] });
  }
  // solids for the fences and bleachers (the courts themselves you can walk on)
  for (const ct of COURTS) if (ct.kind === 'basket') {
    solids.push({ x: ct.x, z: ct.id === 'bb1' ? ct.z - ct.d / 2 - 2 : ct.z + ct.d / 2 + 2, w: ct.w + 4, d: 0.3 });
    solids.push({ x: ct.x - ct.w / 2 - 2, z: ct.z, w: 0.3, d: ct.d + 4 });
    solids.push({ x: ct.x + ct.w / 2 + 2, z: ct.z, w: 0.3, d: ct.d + 4 });
    solids.push({ x: ct.x, z: ct.z + (ct.id === 'bb1' ? -1 : 1) * (ct.d / 2 + 4.5), w: ct.w * 0.6, d: 3 });
  } else if (ct.kind === 'soccer') solids.push({ x: ct.x, z: ct.z - ct.d / 2 - 4.3, w: ct.w * 0.7, d: 4.4 });
  const golf = buildGolf(g, { anim, solids });
  return { g, boards, hoops, golf };
}

// ---- Coral Links: six holes of golf on the grass east of the portal ------------------------------------------
export const HOLES = [
  { tee: [34, -50], cup: [64, -64], par: 3 },
  { tee: [74, -50], cup: [96, -76], par: 3 },
  { tee: [104, -96], cup: [72, -110], par: 4 },
  { tee: [60, -124], cup: [30, -110], par: 3 },
  { tee: [34, -88], cup: [58, -86], par: 3 },
  { tee: [44, -132], cup: [100, -128], par: 5 },
];
export const PONDS = [{ x: 82, z: -92, r: 7 }, { x: 46, z: -118, r: 4.5 }];
export const BUNKERS = [{ x: 60, z: -59, r: 2.6 }, { x: 99, z: -71, r: 2.2 }, { x: 77, z: -114, r: 2.4 }, { x: 95, z: -132, r: 3 }];
const GREEN_R = 6;

function buildGolf(g, { anim, solids }) {
  const flat = (geo, color, y, opts = {}) => add(g, geo, toon(color, opts), { p: [0, y, 0], r: [-Math.PI / 2, 0, 0], cast: false });
  const flags = [];
  HOLES.forEach((h, i) => {
    const [tx, tz] = h.tee, [cx, cz] = h.cup;
    // a fairway from the tee to the green (a long rounded strip), the green, the tee box
    const len = Math.hypot(cx - tx, cz - tz), a = Math.atan2(cx - tx, cz - tz);
    const fw = add(g, new THREE.CapsuleGeometry(4.2, len, 4, 12), toon('#74c460'), { p: [(tx + cx) / 2, 0.035, (tz + cz) / 2], r: [Math.PI / 2, 0, -a], s: [1, 1, 0.01], cast: false });
    fw.rotation.set(-Math.PI / 2, 0, a + Math.PI);
    add(g, new THREE.CircleGeometry(GREEN_R, 32), toon('#8fdc72'), { p: [cx, 0.05, cz], r: [-Math.PI / 2, 0, 0], cast: false });
    add(g, new THREE.CircleGeometry(0.42, 16), basic('#1d1b2e'), { p: [cx, 0.06, cz], r: [-Math.PI / 2, 0, 0], cast: false });
    add(g, box(4, 0.12, 3), toon('#8fdc72'), { p: [tx, 0.06, tz], r: [0, a, 0], cast: false });
    for (const sx of [-1, 1]) add(g, sph(0.22, 8, 6), toon(['#ff5d73', '#39c6ff', '#ffd84d'][i % 3]), { p: [tx + Math.cos(a) * sx * 1.6, 0.2, tz - Math.sin(a) * sx * 1.6] });
    // the pin and its flag (waving in the wind)
    add(g, cyl(0.04, 0.04, 3.2, 6), toon('#ffffff'), { p: [cx, 1.6, cz] });
    const flag = add(g, new THREE.PlaneGeometry(1, 0.6, 5, 2).translate(0.5, 0, 0), toon(['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#ff9f43', '#c59bff'][i], { side: THREE.DoubleSide }), { p: [cx, 2.9, cz] });
    flags.push({ flag, base: Float32Array.from(flag.geometry.attributes.position.array) });
    // a little sign at the tee: the hole and its par
    const sg = letterSign(`Hole ${i + 1}  Par ${h.par}`, { font: 'chunky', w: 3, h: 0.5, face: '#ffffff', side: '#2f7a3a', depth: 0.1 });
    sg.position.set(tx - Math.sin(a) * 2.6, 1.3, tz - Math.cos(a) * 2.6);
    sg.rotation.y = a;
    g.add(sg);
    add(g, cyl(0.06, 0.06, 1.2, 6), toon('#8b5a2b'), { p: [tx - Math.sin(a) * 2.6, 0.6, tz - Math.cos(a) * 2.6] });
  });
  for (const pd of PONDS) {
    add(g, new THREE.CircleGeometry(pd.r, 32), toon('#3fb6e0', { transparent: true, opacity: 0.9 }), { p: [pd.x, 0.07, pd.z], r: [-Math.PI / 2, 0, 0], cast: false });
    add(g, new THREE.RingGeometry(pd.r, pd.r + 0.5, 32), toon('#d9c98c'), { p: [pd.x, 0.065, pd.z], r: [-Math.PI / 2, 0, 0], cast: false });
  }
  for (const bk of BUNKERS) add(g, new THREE.CircleGeometry(bk.r, 20), toon('#f2dfa8'), { p: [bk.x, 0.06, bk.z], r: [-Math.PI / 2, 0, 0], cast: false });
  // the clubhouse sign by the path
  const arch = group(g, 30, 0, -42);
  for (const sx of [-1, 1]) add(arch, cyl(0.2, 0.25, 4.6, 8), toon('#ffffff'), { p: [sx * 5, 2.3, 0], outline: true });
  add(arch, box(11, 1.6, 0.4), toon('#2f7a3a'), { p: [0, 4.6, 0], outline: true });
  const sg = letterSign('Coral Links', { font: 'script', even: false, w: 9, h: 1.3, face: '#ffffff', side: '#1f5a2a', depth: 0.2 });
  sg.position.set(0, 4, 0.25);
  arch.add(sg);
  solids.push({ x: 25, z: -42, r: 0.4 }, { x: 35, z: -42, r: 0.4 });
  anim.push((t) => flags.forEach(({ flag, base }) => {
    const pp = flag.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = base[i * 3]; pp.setZ(i, Math.sin(t * 6 - x * 4) * 0.09 * x * 1.5); }
    pp.needsUpdate = true;
  }));
  return { holes: HOLES };
}

// ---- the balls ----------------------------------------------------------------------------------------
// Steals: F next to someone holding the ball (the server rolls the dice). Blocks: jump (Space) into an
// opponent's shot. In a match: the ball going over the lines is a throw-in for the other team, and the
// players are kept on the field (and its out-of-bounds strip).
export class Balls {
  constructor(root, park) {
    this.root = root;
    this.park = park;
    this.balls = new Map();
    this.matches = {}; // court -> the server's match state
    for (const ct of COURTS) this.make(`${ct.id}-0`, ct, 0);
  }

  make(id, ct, k) {
    const kind = ct.ball, def = BALL[kind];
    const mesh = new THREE.Group();
    const skin = new THREE.MeshToonMaterial({ color: def.color, gradientMap: toon('#fff').gradientMap });
    add(mesh, sph(def.r, 16, 12), skin, { outline: true });
    if (kind === 'basketball') for (const rz of [0, Math.PI / 2]) add(mesh, new THREE.TorusGeometry(def.r + 0.005, 0.012, 4, 20), basic('#1d1b2e'), { r: [0, rz, 0], cast: false });
    if (kind === 'soccer') for (let i = 0; i < 6; i++) add(mesh, sph(def.r * 0.33, 5, 4), basic('#1d1b2e'), { p: [Math.cos(i) * def.r * 0.9, Math.sin(i * 2.1) * def.r * 0.6, Math.sin(i) * def.r * 0.7], cast: false });
    if (kind === 'volleyball') for (const c of ['#3b82f6', '#ffd84d']) add(mesh, new THREE.TorusGeometry(def.r * 0.95, 0.03, 4, 20), toon(c), { r: [c === '#3b82f6' ? 0 : Math.PI / 2, 0.6, 0], cast: false });
    // a glowing ring on the ground under a ball waiting for a throw-in
    const ring = add(this.root, new THREE.RingGeometry(0.5, 0.7, 24), basic('#ffd84d', { transparent: true, opacity: 0.8, depthWrite: false }), { r: [-Math.PI / 2, 0, 0], cast: false });
    ring.visible = false;
    this.root.add(mesh);
    const home = this.home(ct);
    const b = { id, kind, def, ct, mesh, ring, p: home.clone(), v: new THREE.Vector3(), held: null, own: null, sent: 0, spin: 0, lastBy: null, reset: 0, inbound: null, shotBy: null, shotAt: 0 };
    mesh.position.copy(b.p);
    this.balls.set(id, b);
  }

  home(ct) {
    if (ct.kind === 'volley') return new THREE.Vector3(ct.x - ct.w / 4, 3.2, ct.z);
    return new THREE.Vector3(ct.x, ct.kind === 'basket' ? 0.4 : 0.3, ct.z);
  }

  // ---- matches
  match(court) { return this.matches[court]; }
  live(ct) { const m = this.matches[ct.id]; return m && (m.state === 'live' || m.state === 'countdown'); }
  teamOf(ct, k) { return this.matches[ct.id]?.teams?.[k]; }
  /** Can `k` and S.me take the ball off each other in this court's game? */
  rivals(ct, k) { if (!this.live(ct)) return true; const a = this.teamOf(ct, S.me), b = this.teamOf(ct, k); return a != null && b != null && a !== b; }
  /** The match court you're playing in right now (you're kept on it), or null. */
  myCourt() { return COURTS.find((ct) => this.live(ct) && this.teamOf(ct, S.me) != null) ?? null; }

  setMatch(m) {
    const prev = this.matches[m.court];
    this.matches[m.court] = { ...m, at: performance.now() };
    // a new game: the ball goes to centre court (whoever's first on the list puts it there for everyone)
    if (m.state === 'countdown' && prev?.state !== 'countdown') {
      const b = this.balls.get(`${m.court}-0`);
      b.p.copy(this.home(b.ct)); b.v.set(0, 0, 0); b.held = null; b.inbound = null; b.reset = 0;
      const first = Object.keys(m.teams).sort()[0];
      if (first === S.me) this.send(b, true);
    }
  }

  /** Server state for a ball (from whoever's playing it). */
  apply(m) {
    const b = this.balls.get(m.id);
    if (!b) return;
    if (!m.steal && b.own === S.me && m.own !== S.me && performance.now() - b.sent < 200) return;
    b.own = m.own;
    const wasHeld = b.held;
    b.held = m.held ?? null;
    if (b.held) b.inbound = null;
    // someone else's shot is in the air (for blocking)
    if (b.kind === 'basketball' && !b.held && wasHeld && m.vy > 3) { b.shotBy = m.own; b.shotAt = performance.now(); }
    const np = new THREE.Vector3(m.x, m.y, m.z);
    if (np.distanceTo(b.p) > 1.2 || b.held) b.p.copy(np); else b.p.lerp(np, 0.5);
    b.v.set(m.vx, m.vy, m.vz);
  }

  /** A steal, block or throw-in someone else made. */
  event(m) {
    const b = this.balls.get(m.id);
    if (m.kind === 'out' && b) b.inbound = { side: m.side, until: performance.now() + 9000 };
  }

  send(b, force = false) {
    const now = performance.now();
    if (!force && now - b.sent < 80) return;
    b.sent = now;
    b.own = S.me;
    net.send('ball', { id: b.id, x: b.p.x, y: b.p.y, z: b.p.z, vx: b.v.x, vy: b.v.y, vz: b.v.z, held: b.held });
  }

  /** The ball you're holding (if any). */
  mine() { for (const b of this.balls.values()) if (b.held === S.me) return b; return null; }

  /** What F would do right now: { b, verb, icon } or null. */
  near(me, people) {
    const held = this.mine();
    if (held) return { b: held, verb: held.kind === 'soccer' ? 'Throw in' : held.def.verb, icon: held.def.icon };
    let best = null, bd = 2.3;
    for (const b of this.balls.values()) {
      const d = Math.hypot(b.p.x - me.x, b.p.z - me.z);
      if (d > bd || b.p.y > 4) continue;
      if (b.held && b.held !== S.me) {
        if (this.rivals(b.ct, b.held)) { bd = d; best = { b, verb: 'Steal', icon: '🫳' }; }
        continue;
      }
      if (b.def.hold || b.inbound) continue; // (basketballs you pick up by walking into them)
      bd = d;
      best = { b, verb: b.kind === 'soccer' && b.lastBy && b.lastBy !== S.me && this.rivals(b.ct, b.lastBy) ? 'Tackle' : b.def.verb, icon: b.def.icon };
    }
    return best;
  }

  /** F / the action button: shoot, kick, hit, steal or throw in. */
  act(me, people) {
    const n = this.near(me, people);
    if (!n) return false;
    const b = n.b, dir = new THREE.Vector3(Math.sin(me.heading), 0, Math.cos(me.heading));
    if (n.verb === 'Steal') { net.send('ball_steal', { id: b.id }); me.char.emote('kick'); sfx('whoosh', { vol: 0.3 }); return true; }
    b.lastBy = S.me;
    if (b.kind === 'soccer' && b.held === S.me) {
      // throw-in: both hands over the head
      b.held = null;
      b.p.set(me.x + dir.x * 0.6, 2.1, me.z + dir.z * 0.6);
      b.v.set(dir.x * 11, 4, dir.z * 11);
      me.char.emote('shoot');
      sfx('whoosh', { vol: 0.4 });
    } else if (b.kind === 'basketball') {
      const hs = this.park.hoops[b.ct.id];
      const hp = hs.reduce((a, h) => (Math.hypot(h.x - me.x, h.z - me.z) < Math.hypot(a.x - me.x, a.z - me.z) ? h : a));
      const dist = Math.hypot(hp.x - me.x, hp.z - me.z);
      // contested shots go in less often
      const guarded = [...people.values()].some((p) => p !== me && Math.hypot(p.x - me.x, p.z - me.z) < 1.8 && this.rivals(b.ct, p.k));
      const make = Math.random() < (dist < 2.5 ? 0.82 : dist < 6.7 ? 0.52 : 0.34) * (guarded ? 0.7 : 1);
      const miss = make ? 0 : (0.3 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1);
      const target = new THREE.Vector3(hp.x + miss * 0.8, RIM_Y + 0.1, hp.z + miss * 0.6);
      b.held = null;
      b.p.set(me.x + dir.x * 0.4, 2.4, me.z + dir.z * 0.4);
      const T = 0.75 + dist * 0.045;
      b.v.set((target.x - b.p.x) / T, (target.y - b.p.y + 0.5 * G * T * T) / T, (target.z - b.p.z) / T);
      b.shot = { three: dist > 6.75 };
      me.char.emote('shoot');
      sfx('whoosh', { vol: 0.4 });
    } else if (b.kind === 'soccer') {
      b.v.set(dir.x * 19, 4.5, dir.z * 19);
      me.char.emote('kick');
      sfx('kick');
    } else {
      const other = b.p.x < b.ct.x ? 1 : -1;
      const tx = b.ct.x + other * (2 + Math.random() * 5), tz = b.ct.z + (Math.random() - 0.5) * 6;
      const T = 1.5;
      b.p.y = Math.max(b.p.y, 1.8);
      b.v.set((tx - b.p.x) / T, (0 - b.p.y + 0.5 * G * T * T) / T, (tz - b.p.z) / T);
      b.volleyHits = (b.volleyHits ?? 0) + 1;
      me.char.emote('bump');
      sfx('bounce');
    }
    this.send(b, true);
    return true;
  }

  score(b, side, pts) {
    net.send('court_score', { court: b.ct.id, side, pts });
    if (b.kind !== 'basketball') b.reset = performance.now() + 1800;
  }

  /** Over the lines in a match: a throw-in for the other team, from where it went out. */
  out(b) {
    const ct = b.ct;
    const lastTeam = b.lastBy != null ? this.teamOf(ct, b.lastBy) : null;
    const side = lastTeam == null ? (b.p.x < ct.x ? 0 : 1) : 1 - lastTeam;
    b.p.x = Math.min(Math.max(b.p.x, ct.x - ct.w / 2 - 0.4), ct.x + ct.w / 2 + 0.4);
    b.p.z = Math.min(Math.max(b.p.z, ct.z - ct.d / 2 - 0.4), ct.z + ct.d / 2 + 0.4);
    b.p.y = b.def.r + 0.09;
    b.v.set(0, 0, 0);
    b.inbound = { side, until: performance.now() + 9000 };
    this.send(b, true);
    net.send('ball_event', { kind: 'out', id: b.id, side });
    sfx('whistle');
  }

  update(dt, me, people, jumping) {
    const now = performance.now();
    for (const b of this.balls.values()) {
      const def = b.def, ct = b.ct;
      const mine = b.own === S.me;
      const live = this.live(ct) && this.matches[ct.id].state === 'live';
      if (b.inbound && now > b.inbound.until) b.inbound = null;
      b.ring.visible = !!b.inbound;
      if (b.inbound) { b.ring.position.set(b.p.x, 0.12, b.p.z); b.ring.material.color.set(b.inbound.side ? '#39c6ff' : '#ff5d73'); }
      if (b.reset && now > b.reset) {
        b.reset = 0;
        if (mine) { b.p.copy(this.home(ct)); b.v.set(0, 0, 0); b.held = null; b.volleyHits = 0; this.send(b, true); }
      }
      // held: in the holder's hands (a dribble while they move, for basketball)
      if (b.held) {
        const h = people.get(b.held);
        if (!h) { b.held = null; continue; }
        const hx = Math.sin(h.heading), hz = Math.cos(h.heading);
        const throwIn = b.kind === 'soccer';
        const dribble = b.kind === 'basketball' && h.moving ? Math.abs(Math.sin(now / 150)) : null;
        b.p.set(h.x + hx * (throwIn ? 0.1 : 0.45) + (throwIn ? 0 : hz * 0.3), h.y + (throwIn ? 2.1 : dribble != null ? 0.25 + dribble * 0.9 : 1.1), h.z + hz * (throwIn ? 0.1 : 0.45) - (throwIn ? 0 : hx * 0.3));
        if (dribble != null && dribble < 0.08 && !b.bounced) { b.bounced = true; if (b.held === S.me) sfx('bounce', { vol: 0.35 }); }
        if (dribble != null && dribble > 0.3) b.bounced = false;
        b.mesh.position.copy(b.p);
        if (b.held === S.me) this.send(b);
        continue;
      }
      // flight
      const prevY = b.p.y;
      b.v.y -= G * dt;
      b.p.addScaledVector(b.v, dt);
      const floor = def.r + (ct.kind === 'volley' ? 0 : 0.09);
      if (b.p.y < floor) {
        b.p.y = floor;
        if (b.v.y < -1.5 && Math.hypot(b.p.x - me.x, b.p.z - me.z) < 30) sfx('bounce', { vol: Math.min(0.5, -b.v.y / 20) });
        if (b.kind === 'volleyball' && mine && !b.reset && Math.abs(b.p.x - ct.x) < ct.w / 2 + 3 && b.volleyHits) {
          this.score(b, b.p.x < ct.x ? 1 : 0, 1);
          sfx('whistle');
        }
        b.v.y = -b.v.y * def.bounce;
        if (Math.abs(b.v.y) < 1.2) b.v.y = 0;
        b.v.x *= Math.max(0, 1 - def.roll * dt);
        b.v.z *= Math.max(0, 1 - def.roll * dt);
      }
      // soccer: a goal when it crosses the line between the posts
      const inGoalMouth = b.kind === 'soccer' && Math.abs(b.p.z - ct.z) < 3.6 && b.p.y < 2.4;
      if (b.kind === 'soccer' && mine && !b.reset && Math.abs(b.p.x - ct.x) > ct.w / 2 && inGoalMouth) {
        this.score(b, b.p.x > ct.x ? 0 : 1, 1);
        sfx('whistle'); this.onEvent?.('⚽ GOOOAL!');
      }
      // a match: over the lines is out (a throw-in); otherwise the fence (or the field's edge) keeps it in
      const outX = Math.abs(b.p.x - ct.x) > ct.w / 2 + def.r, outZ = Math.abs(b.p.z - ct.z) > ct.d / 2 + def.r;
      if (live && mine && !b.inbound && !b.reset && (outX || outZ) && !inGoalMouth && b.kind !== 'volleyball') this.out(b);
      const hw = ct.w / 2 + ct.margin, hd = ct.d / 2 + ct.margin;
      if (Math.abs(b.p.x - ct.x) > hw) { b.p.x = ct.x + Math.sign(b.p.x - ct.x) * hw; b.v.x *= -0.5; }
      if (Math.abs(b.p.z - ct.z) > hd) { b.p.z = ct.z + Math.sign(b.p.z - ct.z) * hd; b.v.z *= -0.5; }
      // basketball: the rim and backboard, and a basket when it drops through the hoop
      if (b.kind === 'basketball') {
        for (const h of this.park.hoops[ct.id]) {
          const dx = b.p.x - h.x, dz = b.p.z - h.z, dh = Math.hypot(dx, dz);
          const bx = h.x - Math.sign(h.x - ct.x) * -0.5;
          if (Math.abs(b.p.x - bx) < def.r && Math.abs(b.p.z - h.z) < 0.95 && b.p.y > RIM_Y - 0.1 && b.p.y < RIM_Y + 1.1) { b.v.x *= -0.6; b.p.x = bx + Math.sign(b.p.x - bx || 1) * def.r; }
          if (Math.abs(b.p.y - RIM_Y) < def.r && Math.abs(dh - RIM_R) < def.r && dh > 0.01) {
            const push = (RIM_R + (dh > RIM_R ? def.r : -def.r) - dh);
            b.p.x += (dx / dh) * push; b.p.z += (dz / dh) * push;
            b.v.x = (b.v.x + (dx / dh) * 2) * 0.6; b.v.z = (b.v.z + (dz / dh) * 2) * 0.6; b.v.y *= 0.5;
            if (Math.hypot(b.p.x - me.x, b.p.z - me.z) < 30) sfx('bonk', { vol: 0.3 });
          }
          if (prevY >= RIM_Y && b.p.y < RIM_Y && dh < RIM_R - def.r * 0.3) {
            h.swish = 1;
            if (Math.hypot(b.p.x - me.x, b.p.z - me.z) < 40) sfx('swish');
            if (mine && b.lastBy === S.me) {
              const pts = b.shot?.three ? 3 : 2;
              this.score(b, 0, pts);
              this.onEvent?.(pts === 3 ? '🏀 THREE POINTER! +3' : '🏀 Bucket! +2');
            }
          }
        }
        // block: jump into a rival's shot on its way up
        if (jumping && b.shotBy && b.shotBy !== S.me && now - b.shotAt < 900 && b.v.y > -2 && b.p.y > 1.4 && b.p.y < 3.9
          && Math.hypot(b.p.x - me.x, b.p.z - me.z) < 1.7 && this.rivals(ct, b.shotBy)) {
          const away = new THREE.Vector3(b.p.x - me.x, 0, b.p.z - me.z).normalize();
          b.v.set(away.x * 7, 2.5, away.z * 7);
          const from = b.shotBy;
          b.shotBy = null; b.shot = null; b.lastBy = S.me;
          this.send(b, true);
          net.send('ball_event', { kind: 'block', id: b.id, from });
          sfx('slam'); me.char.emote('bump');
          this.onEvent?.('🚫 BLOCKED!');
        }
      }
      // volleyball: it can't go through the net
      if (b.kind === 'volleyball' && Math.abs(b.p.z - ct.z) < ct.d / 2 + 0.8 && b.p.y < ct.netTop && Math.sign(b.p.x - ct.x) !== Math.sign(b.p.x - b.v.x * dt - ct.x)) {
        b.v.x *= -0.4; b.p.x = ct.x + Math.sign(b.p.x - b.v.x * dt - ct.x) * 0.3;
      }
      // you: run into a soccer ball to dribble it; walk into a basketball to pick it up (a throw-in ball:
      // only the team throwing in can touch it, and they pick it up)
      const dx = b.p.x - me.x, dz = b.p.z - me.z, d = Math.hypot(dx, dz);
      if (d < 0.75 && b.p.y < 1.6 && !this.mine()) {
        const myTeam = this.teamOf(ct, S.me);
        if (b.inbound) {
          if (myTeam === b.inbound.side || !this.live(ct)) { b.held = S.me; b.v.set(0, 0, 0); b.inbound = null; b.lastBy = S.me; this.send(b, true); sfx('pickup', { vol: 0.5 }); }
        } else if (b.kind === 'soccer' && me.moving) {
          const sp = me.speed > 1.2 ? 9 : 6;
          b.v.set(Math.sin(me.heading) * sp, 0.6, Math.cos(me.heading) * sp);
          b.lastBy = S.me;
          this.send(b, true);
          sfx('kick', { vol: 0.3 });
        } else if (def.hold && (b.p.y < 1.2 || b.v.y < 0) && !(b.lastBy === S.me && now - b.sent < 500)) {
          b.held = S.me; b.v.set(0, 0, 0); b.shot = null; b.lastBy = S.me;
          this.send(b, true);
          sfx('pickup', { vol: 0.5 });
        }
      }
      b.spin += b.v.length() * dt * 2;
      b.mesh.position.copy(b.p);
      b.mesh.rotation.set(b.spin, b.spin * 0.3, 0);
      if (mine && b.v.lengthSq() > 0.01) this.send(b);
    }
    for (const hs of Object.values(this.park.hoops)) for (const h of hs) if (h.swish > 0) { h.swish = Math.max(0, h.swish - dt * 3); h.net.scale.y = 1 + h.swish * 0.6; h.net.rotation.y += dt * h.swish * 8; }
  }

  scoreboard(court, s) {
    const bd = this.park.boards[court];
    if (!bd) return;
    bd.s = s;
    bd.tex.draw(bd.label, s);
  }
}

// ---- golf (played on your own; the ball is only yours) ---------------------------------------------------
export class Golf {
  constructor(root) {
    this.root = root;
    this.ball = add(root, sph(0.13, 12, 8), toon('#ffffff'), { outline: true });
    this.ball.visible = false;
    this.arrow = add(root, new THREE.ConeGeometry(0.35, 1.4, 8).rotateX(Math.PI / 2).translate(0, 0, 1.6), basic('#ffd84d', { transparent: true, opacity: 0.85 }), { cast: false });
    this.arrow.visible = false;
    this.game = null;
  }

  start(i) {
    const h = HOLES[i];
    const [tx, tz] = h.tee, [cx, cz] = h.cup;
    this.game = { hole: i, par: h.par, strokes: 0, p: new THREE.Vector3(tx, 0.13, tz), last: new THREE.Vector3(tx, 0.13, tz), v: new THREE.Vector3(), aim: Math.atan2(cx - tx, cz - tz), power: 0, charging: false, chargeT: 0, rolling: false, done: false };
    this.ball.visible = this.arrow.visible = true;
    this.ball.position.copy(this.game.p);
  }

  stop() { this.game = null; this.ball.visible = this.arrow.visible = false; }

  /** Space/F down: start charging; up: swing. */
  press() { const g = this.game; if (g && !g.rolling && !g.done) { g.charging = true; g.chargeT = 0; } }
  release() {
    const g = this.game;
    if (!g || !g.charging) return;
    g.charging = false;
    const [cx, cz] = HOLES[g.hole].cup;
    const putt = Math.hypot(cx - g.p.x, cz - g.p.z) < GREEN_R + 1.5;
    const pw = Math.max(0.05, g.power);
    const dir = new THREE.Vector3(Math.sin(g.aim), 0, Math.cos(g.aim));
    g.last.copy(g.p);
    g.v.set(dir.x * pw * (putt ? 12 : 30), putt ? 0 : pw * 9, dir.z * pw * (putt ? 12 : 30));
    g.strokes += 1;
    g.rolling = true;
    this.arrow.visible = false;
    sfx(putt ? 'bonk' : 'whoosh', { vol: 0.4 });
    return true;
  }

  /** Returns 'holed' | 'water' | null. */
  update(dt, keys) {
    const g = this.game;
    if (!g) return null;
    const [cx, cz] = HOLES[g.hole].cup;
    if (!g.rolling) {
      const turn = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0);
      g.aim += turn * dt * 1.4;
      if (g.charging) { g.chargeT += dt; g.power = Math.abs(Math.sin(g.chargeT * 1.6)); }
      this.arrow.position.set(g.p.x, 0.15, g.p.z);
      this.arrow.rotation.y = g.aim;
      this.arrow.scale.set(1, 1, 0.6 + g.power * 1.8 * (g.charging ? 1 : 0.4));
      return null;
    }
    // flying and rolling: slows fast in sand, normally on the grass, little on the green
    g.v.y -= 16 * dt;
    g.p.addScaledVector(g.v, dt);
    const onGreen = Math.hypot(g.p.x - cx, g.p.z - cz) < GREEN_R;
    const inSand = BUNKERS.some((b) => Math.hypot(g.p.x - b.x, g.p.z - b.z) < b.r);
    if (g.p.y <= 0.13) {
      g.p.y = 0.13;
      if (PONDS.some((pd) => Math.hypot(g.p.x - pd.x, g.p.z - pd.z) < pd.r)) {
        g.strokes += 1; // a penalty stroke, and back to where you hit from
        g.p.copy(g.last); g.v.set(0, 0, 0); g.rolling = false; this.arrow.visible = true;
        sfx('splash');
        return 'water';
      }
      g.v.y = g.v.y < -3 ? -g.v.y * (inSand ? 0.05 : 0.3) : 0;
      const k = inSand ? 5 : onGreen ? 0.9 : 1.6;
      g.v.x *= Math.max(0, 1 - k * dt); g.v.z *= Math.max(0, 1 - k * dt);
    }
    // the cup: drops in if it's going slowly enough over it
    const dc = Math.hypot(g.p.x - cx, g.p.z - cz), sp = Math.hypot(g.v.x, g.v.z);
    if (dc < 0.42 && g.p.y < 0.3 && sp < 7) {
      g.done = true; g.rolling = false; g.p.set(cx, -0.1, cz);
      this.ball.position.copy(g.p);
      sfx('reveal', { rarity: 'rare' });
      return 'holed';
    }
    if (dc < 0.42 && sp >= 7) g.v.multiplyScalar(0.85); // a lip-out slows it
    this.ball.position.copy(g.p);
    if (sp < 0.15 && g.p.y <= 0.14) { g.v.set(0, 0, 0); g.rolling = false; g.aim = Math.atan2(cx - g.p.x, cz - g.p.z); this.arrow.visible = true; }
    return null;
  }
}
