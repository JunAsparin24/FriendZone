// Coral Park: pickup games on the grass behind the beach (two basketball courts, a soccer pitch, a
// football field) and beach volleyball on the sand. Street-court style: bright painted courts, chain-
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
  { id: 'bb1', kind: 'basket', x: -52, z: -118, w: 28, d: 15, ball: 'basketball' },
  { id: 'bb2', kind: 'basket', x: -52, z: -78, w: 28, d: 15, ball: 'basketball' },
  { id: 'soccer', kind: 'soccer', x: -150, z: -95, w: 64, d: 40, ball: 'soccer' },
  { id: 'football', kind: 'football', x: 108, z: -95, w: 72, d: 32, ball: 'football' },
  { id: 'volley', kind: 'volley', x: -120, z: 30, w: 18, d: 9, ball: 'volleyball' },
];
const BALL = {
  basketball: { r: 0.25, bounce: 0.78, roll: 1.4, color: '#ff7a2e', hold: true, verb: 'Shoot', icon: '🏀' },
  soccer: { r: 0.24, bounce: 0.55, roll: 0.8, color: '#ffffff', hold: false, verb: 'Kick', icon: '⚽' },
  football: { r: 0.2, bounce: 0.35, roll: 2.5, color: '#8b4a22', hold: true, verb: 'Throw', icon: '🏈' },
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
    } else if (kind === 'football') {
      for (let i = 0; i < 14; i++) { c.fillStyle = i % 2 ? '#3f9a47' : '#4aa851'; c.fillRect((i * W) / 14, 0, W / 14 + 1, H); }
      const ez = 7 * px;
      c.fillStyle = '#1e4a9a'; c.fillRect(0, 0, ez, H);
      c.fillStyle = '#b3261e'; c.fillRect(W - ez, 0, ez, H);
      c.strokeRect(4, 4, W - 8, H - 8);
      for (let k = 0; k <= 10; k++) { const x = ez + (k * (W - 2 * ez)) / 10; line(x, 4, x, H - 4); }
      c.fillStyle = '#ffffff'; c.font = `bold ${3 * px}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const [x, t] of [[ez / 2, 'CORAL'], [W - ez / 2, 'COVE']]) { c.save(); c.translate(x, H / 2); c.rotate(x < W / 2 ? -Math.PI / 2 : Math.PI / 2); c.fillText(t, 0, 0); c.restore(); }
      c.font = `bold ${1.6 * px}px sans-serif`;
      for (let k = 1; k < 10; k++) { const x = ez + (k * (W - 2 * ez)) / 10; c.fillText(String(k <= 5 ? k * 10 : (10 - k) * 10), x, H - 2.5 * px); }
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
      fence(g, x - w / 2 - 2, z - d / 2 - 2, x + w / 2 + 2, z - d / 2 - 2);
      fence(g, x - w / 2 - 2, z - d / 2 - 2, x - w / 2 - 2, z + d / 2 + 2);
      fence(g, x + w / 2 + 2, z - d / 2 - 2, x + w / 2 + 2, z + d / 2 + 2);
      bleachers(g, x, z + d / 2 + 3.2, w * 0.6, Math.PI, 3);
    } else if (kind === 'soccer') {
      goal(g, x - w / 2, z, 1); goal(g, x + w / 2, z, -1);
      bleachers(g, x, z - d / 2 - 3, w * 0.7, 0, 5);
    } else if (kind === 'football') {
      for (const s of [-1, 1]) {
        const gp = group(g, x + s * (w / 2), 0, z);
        add(gp, cyl(0.15, 0.15, 3, 8), toon('#ffd84d'), { p: [0, 1.5, 0] });
        add(gp, cyl(0.12, 0.12, 5.6, 8), toon('#ffd84d'), { p: [0, 3, 0], r: [Math.PI / 2, 0, 0] });
        for (const sz of [-1, 1]) add(gp, cyl(0.1, 0.1, 5, 8), toon('#ffd84d'), { p: [0, 5.5, sz * 2.8] });
      }
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
    const label = { basket: 'HOOPS', soccer: 'SOCCER', football: 'FOOTBALL', volley: 'VOLLEYBALL' }[kind];
    tex.draw(label, [0, 0]);
    const sb = group(g, x, 0, z - d / 2 - (kind === 'basket' ? 1.2 : kind === 'volley' ? 2.5 : 6.5));
    add(sb, cyl(0.12, 0.12, 4.5, 8), toon('#3a3f55'), { p: [0, 2.25, 0] });
    add(sb, box(3.3, 1.35, 0.2), toon('#23263f'), { p: [0, 4.9, 0], outline: true });
    add(sb, new THREE.PlaneGeometry(3.1, 1.16), new THREE.MeshBasicMaterial({ map: tex }), { p: [0, 4.9, 0.11], cast: false });
    add(sb, new THREE.PlaneGeometry(3.1, 1.16), new THREE.MeshBasicMaterial({ map: tex }), { p: [0, 4.9, -0.11], r: [0, Math.PI, 0], cast: false });
    boards[ct.id] = { tex, label, s: [0, 0] };
  }
  // light towers round the park, glowing at night
  for (const [x, z] of [[-86, -135], [-86, -60], [-190, -118], [-110, -72], [72, -118], [144, -72], [-18, -135], [-18, -60]]) {
    add(g, cyl(0.2, 0.3, 12, 8), toon('#6d7488'), { p: [x, 6, z] });
    add(g, box(2.4, 1, 0.6), lights.lanternMat, { p: [x, 12.2, z], cast: false });
  }
  // the park sign: a neon arch where the boardwalk meets the courts
  const arch = group(g, -95, 0, -45);
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
  add(g, box(24, 4, 0.8), toon('#6a6f80'), { p: [-52, 2, -98], outline: true });
  for (const sz of [1, -1]) add(g, new THREE.PlaneGeometry(24, 4), new THREE.MeshToonMaterial({ map: wall, gradientMap: toon('#fff').gradientMap }), { p: [-52, 2, -98 + sz * 0.41], r: [0, sz > 0 ? 0 : Math.PI, 0], cast: false });
  solids.push({ x: -52, z: -98, w: 24, d: 0.8 });
  const dj = group(g, -95, 0, -60);
  add(dj, box(3, 1.2, 1.5), toon('#23263f'), { p: [0, 0.6, 0], outline: true });
  add(dj, box(3.2, 0.1, 1.7), toon('#ff4fd8'), { p: [0, 1.25, 0] });
  const speakers = [];
  for (const sx of [-1, 1]) {
    const sp = add(dj, box(1.2, 2.4, 1.1), toon('#1d1b2e'), { p: [sx * 2.6, 1.2, 0], outline: true });
    const cone = add(sp, cyl(0.4, 0.4, 0.1, 16), toon('#6d7488'), { p: [0, -0.3, 0.56], r: [Math.PI / 2, 0, 0] });
    speakers.push(cone);
  }
  anim.push((t) => speakers.forEach((s) => { s.scale.setScalar(1 + Math.max(0, Math.sin(t * 13)) * 0.12); }));
  solids.push({ x: -95, z: -60, w: 7, d: 2 });
  // benches along the paths
  for (let k = 0; k < 6; k++) {
    const x = -200 + k * 30 + r() * 6, z = -58;
    add(g, box(2.6, 0.15, 0.7), plank(1, 1), { p: [x, 0.55, z], outline: true });
    for (const sx of [-1, 1]) add(g, box(0.15, 0.55, 0.6), toon('#3a3f55'), { p: [x + sx * 1.1, 0.27, z] });
  }
  // solids for the fences and bleachers (the courts themselves you can walk on)
  for (const ct of COURTS) if (ct.kind === 'basket') {
    solids.push({ x: ct.x, z: ct.z - ct.d / 2 - 2, w: ct.w + 4, d: 0.3 });
    solids.push({ x: ct.x - ct.w / 2 - 2, z: ct.z, w: 0.3, d: ct.d + 4 });
    solids.push({ x: ct.x + ct.w / 2 + 2, z: ct.z, w: 0.3, d: ct.d + 4 });
    solids.push({ x: ct.x, z: ct.z + ct.d / 2 + 4.5, w: ct.w * 0.6, d: 3 });
  } else if (ct.kind !== 'volley') solids.push({ x: ct.x, z: ct.z - ct.d / 2 - 4.3, w: ct.w * 0.7, d: 4.4 });
  return { g, boards, hoops };
}

// ---- the balls ----------------------------------------------------------------------------------------
export class Balls {
  constructor(root, park) {
    this.root = root;
    this.park = park;
    this.balls = new Map();
    this.cool = 0;
    for (const ct of COURTS) {
      const n = ct.kind === 'basket' ? 2 : 1;
      for (let k = 0; k < n; k++) this.make(`${ct.id}-${k}`, ct, k);
    }
  }

  make(id, ct, k) {
    const kind = ct.ball, def = BALL[kind];
    const mesh = new THREE.Group();
    const skin = new THREE.MeshToonMaterial({ color: def.color, gradientMap: toon('#fff').gradientMap });
    add(mesh, sph(def.r, 16, 12), skin, { s: kind === 'football' ? [1, 1, 1.6] : [1, 1, 1], outline: true });
    if (kind === 'basketball') for (const rz of [0, Math.PI / 2]) add(mesh, new THREE.TorusGeometry(def.r + 0.005, 0.012, 4, 20), basic('#1d1b2e'), { r: [0, rz, 0], cast: false });
    if (kind === 'soccer') for (let i = 0; i < 6; i++) add(mesh, sph(def.r * 0.33, 5, 4), basic('#1d1b2e'), { p: [Math.cos(i) * def.r * 0.9, Math.sin(i * 2.1) * def.r * 0.6, Math.sin(i) * def.r * 0.7], cast: false });
    if (kind === 'football') add(mesh, box(0.02, 0.02, 0.18), basic('#ffffff'), { p: [0, def.r, 0], cast: false });
    if (kind === 'volleyball') for (const c of ['#3b82f6', '#ffd84d']) add(mesh, new THREE.TorusGeometry(def.r * 0.95, 0.03, 4, 20), toon(c), { r: [c === '#3b82f6' ? 0 : Math.PI / 2, 0.6, 0], cast: false });
    this.root.add(mesh);
    const home = this.home(ct, k);
    const b = { id, kind, def, ct, mesh, p: home.clone(), v: new THREE.Vector3(), held: null, own: null, sent: 0, spin: 0, lastBy: null, reset: 0, thrownBy: null, thrownAt: 0 };
    mesh.position.copy(b.p);
    this.balls.set(id, b);
  }

  home(ct, k = 0) {
    if (ct.kind === 'basket') return new THREE.Vector3(ct.x + (k ? 3 : -3), 0.3, ct.z + 2);
    if (ct.kind === 'volley') return new THREE.Vector3(ct.x - ct.w / 4, 3.2, ct.z);
    return new THREE.Vector3(ct.x, 0.3, ct.z);
  }

  /** Server state for a ball (from its owner). */
  apply(m) {
    const b = this.balls.get(m.id);
    if (!b || b.own === S.me && m.own !== S.me && performance.now() - b.sent < 200) return;
    b.own = m.own;
    b.held = m.held ?? null;
    const np = new THREE.Vector3(m.x, m.y, m.z);
    if (np.distanceTo(b.p) > 1.2 || b.held) b.p.copy(np); else b.p.lerp(np, 0.5);
    b.v.set(m.vx, m.vy, m.vz);
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

  /** The ball close enough for you to play (and what you'd do with it), or null. */
  near(me) {
    const held = this.mine();
    if (held) return { b: held, verb: held.def.verb, icon: held.def.icon };
    let best = null, bd = 2.2;
    for (const b of this.balls.values()) {
      if (b.held || b.def.hold) continue; // (ball you pick up: just walk into it)
      const d = Math.hypot(b.p.x - me.x, b.p.z - me.z);
      if (d < bd && b.p.y < 4) { bd = d; best = b; }
    }
    return best ? { b: best, verb: best.def.verb, icon: best.def.icon } : null;
  }

  /** F / the action button: shoot, throw, kick or hit. */
  act(me, hand) {
    const n = this.near(me);
    if (!n) return false;
    const b = n.b, dir = new THREE.Vector3(Math.sin(me.heading), 0, Math.cos(me.heading));
    b.lastBy = S.me;
    if (b.kind === 'basketball') {
      const hs = this.park.hoops[b.ct.id];
      const hp = hs.reduce((a, h) => (Math.hypot(h.x - me.x, h.z - me.z) < Math.hypot(a.x - me.x, a.z - me.z) ? h : a));
      const dist = Math.hypot(hp.x - me.x, hp.z - me.z);
      const make = Math.random() < (dist < 2.5 ? 0.85 : dist < 6.7 ? 0.55 : 0.36);
      const miss = make ? 0 : (0.3 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1);
      const target = new THREE.Vector3(hp.x + miss * 0.8, RIM_Y + 0.1, hp.z + miss * 0.6);
      b.held = null;
      b.p.set(me.x + dir.x * 0.4, 2.4, me.z + dir.z * 0.4);
      const T = 0.75 + dist * 0.045;
      b.v.set((target.x - b.p.x) / T, (target.y - b.p.y + 0.5 * G * T * T) / T, (target.z - b.p.z) / T);
      b.shot = { three: dist > 6.75, from: me };
      me.char.emote('shoot');
      sfx('whoosh', { vol: 0.4 });
    } else if (b.kind === 'football') {
      b.held = null;
      b.p.set(me.x + dir.x * 0.6, 2.1, me.z + dir.z * 0.6);
      b.v.set(dir.x * 17, 7.5, dir.z * 17);
      b.thrownBy = S.me; b.thrownAt = performance.now();
      me.char.emote('throw');
      sfx('whoosh', { vol: 0.4 });
    } else if (b.kind === 'soccer') {
      b.v.set(dir.x * 19, 4.5, dir.z * 19);
      me.char.emote('kick');
      sfx('kick');
    } else {
      // volleyball: pop it up and over the net towards the other side
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

  score(b, side, pts, label) {
    net.send('court_score', { court: b.ct.id, side, pts });
    b.reset = performance.now() + 1800;
    b.resetLabel = label;
  }

  update(dt, me, people) {
    const now = performance.now();
    for (const b of this.balls.values()) {
      const def = b.def, ct = b.ct;
      const mine = b.own === S.me;
      // the ball waits to be put back after a score (its owner puts it back)
      if (b.reset && now > b.reset) {
        b.reset = 0;
        if (mine) { b.p.copy(this.home(ct)); b.v.set(0, 0, 0); b.held = null; b.volleyHits = 0; this.send(b, true); }
      }
      // held: in the holder's hands (a dribble for basketball)
      if (b.held) {
        const h = people.get(b.held);
        if (!h) { b.held = null; continue; }
        const hx = Math.sin(h.heading), hz = Math.cos(h.heading);
        const dribble = b.kind === 'basketball' && h.moving ? Math.abs(Math.sin(now / 150)) : null;
        b.p.set(h.x + hx * 0.45 + hz * 0.3, dribble != null ? 0.25 + dribble * 0.9 : 1.1, h.z + hz * 0.45 - hx * 0.3);
        if (dribble != null && dribble < 0.08 && !b.bounced) { b.bounced = true; if (b.held === S.me) sfx('bounce', { vol: 0.35 }); }
        if (dribble != null && dribble > 0.3) b.bounced = false;
        b.mesh.position.copy(b.p);
        // football: carry it into the end zone for a touchdown
        if (b.held === S.me && b.kind === 'football' && Math.abs(b.p.x - ct.x) > ct.w / 2 - 7 && Math.abs(b.p.z - ct.z) < ct.d / 2 && !b.reset) {
          this.score(b, b.p.x > ct.x ? 0 : 1, 6, 'Touchdown!');
          b.held = null; b.v.set(0, 0, 0);
          this.send(b, true);
          sfx('whistle'); me.char.emote('gg');
          this.onEvent?.('🏈 TOUCHDOWN! +6');
        }
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
        if (b.v.y < -1.5) { if (Math.hypot(b.p.x - me.x, b.p.z - me.z) < 30) sfx('bounce', { vol: Math.min(0.5, -b.v.y / 20) }); }
        // volleyball: it hit the sand, so the point goes to the other side
        if (b.kind === 'volleyball' && mine && !b.reset && Math.abs(b.p.x - ct.x) < ct.w / 2 + 3 && b.volleyHits) {
          const landed = b.p.x < ct.x ? 0 : 1;
          this.score(b, 1 - landed, 1, 'Point!');
          sfx('whistle');
        }
        b.v.y = -b.v.y * def.bounce;
        if (Math.abs(b.v.y) < 1.2) b.v.y = 0;
        b.v.x *= Math.max(0, 1 - def.roll * dt);
        b.v.z *= Math.max(0, 1 - def.roll * dt);
      }
      // the court's fence (or the field's edges) keeps it in
      const hw = ct.w / 2 + (ct.kind === 'basket' ? 1.8 : 4), hd = ct.d / 2 + (ct.kind === 'basket' ? 1.8 : 4);
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
              this.score(b, h.x < ct.x ? 1 : 0, pts, pts === 3 ? 'Three!' : 'Bucket!');
              this.onEvent?.(pts === 3 ? '🏀 THREE POINTER! +3' : '🏀 Bucket! +2');
              b.reset = 0; // (basketball stays in play)
            }
          }
        }
      }
      // soccer: a goal when it crosses the line between the posts
      if (b.kind === 'soccer' && mine && !b.reset && Math.abs(b.p.x - ct.x) > ct.w / 2 && Math.abs(b.p.z - ct.z) < 3.6 && b.p.y < 2.4) {
        this.score(b, b.p.x > ct.x ? 0 : 1, 1, 'GOAL!');
        sfx('whistle'); this.onEvent?.('⚽ GOOOAL!');
      }
      // volleyball: it can't go through the net
      if (b.kind === 'volleyball' && Math.sign(prevY) && Math.abs(b.p.z - ct.z) < ct.d / 2 + 0.8 && b.p.y < ct.netTop && Math.sign(b.p.x - ct.x) !== Math.sign(b.p.x - b.v.x * dt - ct.x)) {
        b.v.x *= -0.4; b.p.x = ct.x + Math.sign(b.p.x - b.v.x * dt - ct.x) * 0.3;
      }
      // you: soccer balls get dribbled when you run into them; footballs and basketballs get picked up
      const dx = b.p.x - me.x, dz = b.p.z - me.z, d = Math.hypot(dx, dz);
      if (d < 0.75 && b.p.y < 1.6 && !this.mine()) {
        if (b.kind === 'soccer' && me.moving) {
          const sp = me.speed > 1.2 ? 9 : 6;
          b.v.set(Math.sin(me.heading) * sp, 0.6, Math.cos(me.heading) * sp);
          b.lastBy = S.me;
          this.send(b, true);
          sfx('kick', { vol: 0.3 });
        } else if (def.hold && !(b.thrownBy === S.me && now - b.thrownAt < 700) && (b.kind !== 'basketball' || b.p.y < 1.2 || b.v.y < 0)) {
          b.held = S.me; b.v.set(0, 0, 0); b.shot = null;
          this.send(b, true);
          sfx('pickup', { vol: 0.5 });
        }
      }
      // volleyball: it's heading down near you, so you bump it back automatically on a phone? no: F
      b.spin += b.v.length() * dt * 2;
      b.mesh.position.copy(b.p);
      b.mesh.rotation.set(b.spin, b.spin * 0.3, 0);
      if (mine && b.v.lengthSq() > 0.01) this.send(b);
    }
    // nets swish
    for (const hs of Object.values(this.park.hoops)) for (const h of hs) if (h.swish > 0) { h.swish = Math.max(0, h.swish - dt * 3); h.net.scale.y = 1 + h.swish * 0.6; h.net.rotation.y += dt * h.swish * 8; }
  }

  scoreboard(court, s) {
    const bd = this.park.boards[court];
    if (!bd) return;
    bd.s = s;
    bd.tex.draw(bd.label, s);
  }
}
