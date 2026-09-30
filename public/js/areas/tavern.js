// The Trading Tavern: a medieval inn with timber walls, candle chandeliers, a crackling
// fireplace, a bard, and long feast tables full of regulars eating and drinking. It's the only place you
// can trade: walk up to someone and press E to ask them.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf } from '../state.js';
import { toon, basic, additive, glowTexture, flameTexture, canvasTexture, TAU } from '../three/materials.js';
import { Character, DEFAULT_LOOK } from '../three/character.js';
import { room, sign, add, openWalker, shopkeeper, counter } from './store.js';
import { tradeWindow } from '../games/trading.js';
import { listen } from '../games/util.js';
import { sfx } from '../sfx.js';
import { toast } from '../state.js';

const WOOD = '#8b5a2b', DARK = '#4a2e18', IRON = '#3a3640';

function barrel(g, x, z, y = 0, lying = false) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  if (lying) b.rotation.z = Math.PI / 2;
  g.add(b);
  add(b, new THREE.CylinderGeometry(0.5, 0.5, 1.1, 16), toon(WOOD), { p: [0, 0.55, 0], outline: true });
  for (const yy of [0.18, 0.92]) add(b, new THREE.TorusGeometry(0.51, 0.04, 6, 20), toon('#3a2a1a'), { p: [0, yy, 0], r: [Math.PI / 2, 0, 0] });
  return b;
}

// ---- the food and drink on the tables ------------------------------------------------------

function tankard(parent, x, y, z, foam = true) {
  const t = new THREE.Group();
  t.position.set(x, y, z);
  parent.add(t);
  add(t, new THREE.CylinderGeometry(0.1, 0.11, 0.24, 12), toon('#9a6a3a'), { p: [0, 0.12, 0], outline: true });
  for (const yy of [0.04, 0.2]) add(t, new THREE.TorusGeometry(0.105, 0.012, 6, 16), toon(IRON), { p: [0, yy, 0], r: [Math.PI / 2, 0, 0] });
  add(t, new THREE.TorusGeometry(0.06, 0.018, 6, 12, Math.PI), toon('#7a4e24'), { p: [0.11, 0.13, 0], r: [0, 0, -Math.PI / 2] });
  if (foam) add(t, new THREE.SphereGeometry(0.1, 12, 8, 0, TAU, 0, Math.PI / 2), toon('#fff6e0'), { p: [0, 0.23, 0], s: [1, 0.55, 1] });
  return t;
}
function goblet(parent, x, y, z) {
  add(parent, new THREE.CylinderGeometry(0.07, 0.03, 0.12, 10), toon('#c9a44a'), { p: [x, y + 0.2, z] });
  add(parent, new THREE.CylinderGeometry(0.06, 0.06, 0.01, 10), toon('#8b1e3f'), { p: [x, y + 0.255, z] });
  add(parent, new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), toon('#c9a44a'), { p: [x, y + 0.08, z] });
  add(parent, new THREE.CylinderGeometry(0.05, 0.05, 0.015, 10), toon('#c9a44a'), { p: [x, y + 0.01, z] });
}
function roast(parent, x, y, z) {
  add(parent, new THREE.CylinderGeometry(0.38, 0.34, 0.04, 20), toon('#d9d4c8'), { p: [x, y + 0.02, z], outline: true });
  add(parent, new THREE.SphereGeometry(0.2, 16, 12), toon('#b8652a'), { p: [x, y + 0.14, z], s: [1.3, 0.8, 1], outline: true });
  for (const s of [-1, 1]) {
    add(parent, new THREE.CylinderGeometry(0.05, 0.035, 0.18, 8), toon('#a8561f'), { p: [x + s * 0.22, y + 0.14, z + 0.1], r: [0, 0, s * 1.1] });
    add(parent, new THREE.SphereGeometry(0.035, 8, 6), toon('#fff6e0'), { p: [x + s * 0.3, y + 0.19, z + 0.1] });
  }
  for (let i = 0; i < 5; i++) add(parent, new THREE.SphereGeometry(0.04, 8, 6), toon(i % 2 ? '#3fa34d' : '#e0463c'), { p: [x + Math.cos(i * 1.3) * 0.3, y + 0.06, z + Math.sin(i * 1.3) * 0.26] });
}
function bread(parent, x, y, z, ry = 0) {
  add(parent, new THREE.CapsuleGeometry(0.08, 0.16, 4, 10), toon('#d99a4e'), { p: [x, y + 0.08, z], r: [0, ry, Math.PI / 2], s: [1, 1, 0.8], outline: true });
  for (let i = -1; i <= 1; i++) add(parent, new THREE.BoxGeometry(0.015, 0.01, 0.1), toon('#f4d9a8'), { p: [x + Math.cos(ry) * i * 0.07, y + 0.155, z - Math.sin(ry) * i * 0.07], r: [0, ry + 0.5, 0] });
}
function cheese(parent, x, y, z) {
  add(parent, new THREE.CylinderGeometry(0.16, 0.16, 0.12, 16, 1, false, 0, Math.PI * 1.6), toon('#ffd84d'), { p: [x, y + 0.06, z], outline: true });
  add(parent, new THREE.BoxGeometry(0.22, 0.03, 0.16), toon('#a0703f'), { p: [x + 0.28, y + 0.015, z] });
}
function fruitBowl(parent, x, y, z) {
  add(parent, new THREE.SphereGeometry(0.17, 14, 8, 0, TAU, Math.PI / 2, Math.PI / 2), toon('#8b5a2b', { side: THREE.DoubleSide }), { p: [x, y + 0.14, z], outline: true });
  [['#e0463c', 0, 0], ['#ffd84d', 0.08, 0.05], ['#3fa34d', -0.07, 0.06], ['#e0463c', 0.04, -0.08], ['#9d4dcc', -0.05, -0.05]].forEach(([c, dx, dz]) =>
    add(parent, new THREE.SphereGeometry(0.06, 10, 8), toon(c), { p: [x + dx, y + 0.16, z + dz] }));
}
function stew(parent, x, y, z) {
  add(parent, new THREE.CylinderGeometry(0.13, 0.09, 0.09, 14), toon('#6b4226'), { p: [x, y + 0.045, z], outline: true });
  add(parent, new THREE.CylinderGeometry(0.12, 0.12, 0.01, 14), toon('#a0522d'), { p: [x, y + 0.085, z] });
  add(parent, new THREE.BoxGeometry(0.02, 0.01, 0.18), toon('#c0c6d4'), { p: [x + 0.06, y + 0.1, z], r: [0.4, 0.5, 0] });
}
function candle(parent, x, y, z, anim, h = 0.2) {
  add(parent, new THREE.CylinderGeometry(0.08, 0.09, 0.03, 10), toon('#c9a44a'), { p: [x, y + 0.015, z] });
  add(parent, new THREE.CylinderGeometry(0.045, 0.05, h, 10), toon('#fff6e0'), { p: [x, y + h / 2 + 0.03, z] });
  const f = new THREE.Sprite(additive(flameTexture, 0xffb347, 0.95));
  f.scale.set(0.14, 0.24, 1);
  f.position.set(x, y + h + 0.13, z);
  parent.add(f);
  const glow = new THREE.Sprite(additive(glowTexture, 0xffa040, 0.45));
  glow.scale.setScalar(0.9);
  glow.position.copy(f.position);
  parent.add(glow);
  anim.push((t) => { f.scale.y = 0.22 + Math.sin(t * 14 + x * 3 + z) * 0.03; glow.material.opacity = 0.4 + Math.sin(t * 9 + x) * 0.06; });
}

/** A long feasting table with benches down both sides, laid with a spread. */
function feastTable(g, x, z, len, anim) {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  g.add(t);
  const top = 0.86;
  add(t, new THREE.BoxGeometry(len, 0.12, 1.3), toon('#a0703f'), { p: [0, top - 0.06, 0], outline: true });
  for (let i = 0; i < Math.floor(len / 1.2); i++) add(t, new THREE.BoxGeometry(0.02, 0.005, 1.3), toon('#7a4e24'), { p: [-len / 2 + 0.6 + i * 1.2, top + 0.002, 0] });
  for (const sx of [-1, 1]) {
    add(t, new THREE.BoxGeometry(0.16, top - 0.12, 1.0), toon(DARK), { p: [sx * (len / 2 - 0.4), (top - 0.12) / 2, 0] });
    add(t, new THREE.BoxGeometry(len - 0.9, 0.1, 0.1), toon(DARK), { p: [0, 0.2, 0] });
  }
  // benches
  for (const sz of [-1, 1]) {
    add(t, new THREE.BoxGeometry(len - 0.2, 0.1, 0.45), toon(WOOD), { p: [0, 0.45, sz * 1.0], outline: true });
    for (const sx of [-1, 1]) add(t, new THREE.BoxGeometry(0.1, 0.4, 0.4), toon(DARK), { p: [sx * (len / 2 - 0.5), 0.2, sz * 1.0] });
  }
  // a table runner, then the spread
  add(t, new THREE.BoxGeometry(len - 0.6, 0.006, 0.45), toon('#8b1e3f'), { p: [0, top + 0.004, 0] });
  const y = top;
  roast(t, -len * 0.22, y, 0);
  bread(t, len * 0.08, y, 0.1, 0.3); bread(t, len * 0.14, y, -0.12, -0.4);
  cheese(t, len * 0.3, y, 0.05);
  fruitBowl(t, -len * 0.4, y, -0.1);
  candle(t, 0, y, -0.02, anim, 0.24);
  candle(t, len * 0.42, y, 0.1, anim, 0.16);
  const mugs = [];
  for (let i = 0; i < Math.floor(len / 1.1); i++) {
    const mx = -len / 2 + 0.6 + i * 1.1;
    for (const sz of [-1, 1]) {
      if ((i + (sz > 0 ? 1 : 0)) % 2) { mugs.push(tankard(t, mx + 0.15, y, sz * 0.42)); stew(t, mx - 0.18, y, sz * 0.38); }
      else goblet(t, mx, y, sz * 0.45);
    }
  }
  return t;
}

/** A small round table for two, with stools. */
function roundTable(g, x, z, anim) {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  g.add(t);
  add(t, new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20), toon('#a0703f'), { p: [0, 0.8, 0], outline: true });
  add(t, new THREE.CylinderGeometry(0.1, 0.16, 0.8, 10), toon('#6b4226'), { p: [0, 0.4, 0] });
  add(t, new THREE.CylinderGeometry(0.35, 0.35, 0.04, 16), toon('#6b4226'), { p: [0, 0.02, 0] });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    add(t, new THREE.CylinderGeometry(0.28, 0.25, 0.5, 12), toon(WOOD), { p: [Math.cos(a) * 1.35, 0.25, Math.sin(a) * 1.35], outline: true });
  }
  candle(t, 0, 0.86, 0, anim);
  tankard(t, 0.4, 0.86, 0.2); tankard(t, -0.35, 0.86, -0.3);
  bread(t, -0.2, 0.86, 0.35, 1.2);
  return t;
}

// ---- the regulars ---------------------------------------------------------------------------

const PATRONS = [
  { skin: '#f6c9a0', hair: 'hair_long', hairColor: '#c9a060', top: 'top_armor', topColor: '#aab3c5', hat: 'hat_viking' },
  { skin: '#8d5524', hair: 'hair_locs', hairColor: '#2b1d14', top: 'top_robe', topColor: '#2f7f5e', topTint: '#2f7f5e' },
  { skin: '#e3ac78', hair: 'hair_braid', hairColor: '#8b3a1e', top: 'top_hoodie', topColor: '#8b1e3f' },
  { skin: '#c68642', hair: 'hair_messy', hairColor: '#4a2e18', top: 'top_tee', topColor: '#6b8e23', hat: 'hat_robin' },
  { skin: '#ffe0c4', hair: 'hair_bun', hairColor: '#e8e0d0', top: 'top_robe', topColor: '#5b2a86' },
  { skin: '#f6c9a0', hair: 'hair_curly', hairColor: '#2b1d14', top: 'top_flannel', topColor: '#8b1e3f', topAccent: '#1d1b2e' },
  { skin: '#8d5524', hair: 'hair_short', hairColor: '#1d1b2e', top: 'top_leather', topColor: '#3a2a1a', topTint: '#5a3a1e' },
  { skin: '#e3ac78', hair: 'hair_ponytail', hairColor: '#d4a017', top: 'top_kimono', topColor: '#2f5fa0', topAccent: '#ffd84d' },
  { skin: '#c68642', hair: 'hair_afro', hairColor: '#2b1d14', top: 'top_sweater', topColor: '#a0522d', topAccent: '#fff6e0' },
  { skin: '#ffe0c4', hair: 'hair_spiky', hairColor: '#c9a060', top: 'top_tee', topColor: '#4a74b8', hat: 'hat_wizard' },
];

/**
 * Someone sitting down (on a bench at height `seatY`), facing `ry`. Every few seconds they take a
 * swig from their tankard or a bite of a drumstick; now and then they have a good laugh.
 */
function patron(g, look, x, z, ry, anim, { seatY = 0.5, food = 'mug', offset = 0 } = {}) {
  const c = new Character({ ...DEFAULT_LOOK, bottom: 'bottom_pants', bottomColor: '#4a3a2a', ...look });
  c.setPose('sit');
  c.root.position.set(x, seatY - c.rig.hipY + 0.12, z);
  c.root.rotation.y = ry;
  c.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  g.add(c.root);
  const hand = c.rig.elbows[0];
  const held = new THREE.Group();
  held.position.set(0, -0.24, 0.02);
  hand.add(held);
  if (food === 'mug') {
    const m = tankard(held, 0, -0.12, 0);
    m.rotation.x = Math.PI; // (the hand hangs down; flipped so it's upright when raised)
    m.rotation.z = 0;
    m.position.set(0, 0.02, 0);
  } else {
    add(held, new THREE.CylinderGeometry(0.06, 0.03, 0.2, 8), toon('#a8561f'), { p: [0, -0.06, 0], outline: true });
    add(held, new THREE.SphereGeometry(0.035, 8, 6), toon('#fff6e0'), { p: [0, 0.05, 0] });
  }
  let laughAt = 4 + offset * 3;
  anim.push((t, dt) => {
    c.update(dt ?? 0.016, t, false);
    // a sip: lift the arm to the mouth, tip the head back, then back down to the table
    const k = ((t + offset * 2.3) % 7) / 7;
    const lift = k < 0.18 ? Math.sin((k / 0.18) * Math.PI) : 0;
    const arm = c.rig.arms[0];
    arm.rotation.x = -0.9 - lift * 1.3;
    arm.rotation.z = -0.25 - lift * 0.1;
    hand.rotation.x = -0.7 - lift * 1.2;
    c.rig.head.rotation.x = -lift * 0.35;
    c.rig.arms[1].rotation.x = -1.0;
    c.rig.elbows[1].rotation.x = -0.6;
    if (t > laughAt) { c.emote(Math.random() < 0.6 ? 'laugh' : 'gg'); laughAt = t + 8 + Math.random() * 10; }
  });
  return c;
}

function tavernDecor(g, W, D, anim) {
  // exposed ceiling beams and the posts that hold them up
  for (let i = 0; i < 5; i++) add(g, new THREE.BoxGeometry(W, 0.35, 0.35), toon(DARK), { p: [0, 4.75, -D / 2 + 2 + i * 3.6] });
  add(g, new THREE.BoxGeometry(0.35, 0.3, D), toon(DARK), { p: [0, 4.5, 0] });
  for (const [x, z] of [[-9.5, -3], [9.5, -3], [-9.5, 6.5], [9.5, 6.5]]) {
    add(g, new THREE.BoxGeometry(0.4, 4.8, 0.4), toon(DARK), { p: [x, 2.4, z], outline: true });
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.2, 1.2, 0.2), toon(DARK), { p: [x + s * 0.45, 4.15, z], r: [0, 0, s * 0.7] });
  }
  // iron chandeliers with candles
  for (const [x, z] of [[-4.5, 0.5], [4.5, 0.5], [0, -3.5]]) {
    const ch = new THREE.Group();
    ch.position.set(x, 3.4, z);
    g.add(ch);
    add(ch, new THREE.CylinderGeometry(0.015, 0.015, 1.3, 5), toon(IRON), { p: [0, 0.7, 0] });
    add(ch, new THREE.TorusGeometry(0.7, 0.04, 6, 24), toon(IRON), { r: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      candle(ch, Math.cos(a) * 0.7, 0.02, Math.sin(a) * 0.7, anim, 0.18);
    }
    const light = new THREE.PointLight(0xffb060, 5, 9, 1.8);
    light.position.y = -0.2;
    ch.add(light);
    anim.push((t) => { ch.rotation.y = Math.sin(t * 0.3 + x) * 0.05; light.intensity = 4.6 + Math.sin(t * 11 + x) * 0.4; });
  }
  // banners and shields on the walls
  [['#8b1e3f', -7], ['#2f5fa0', 0.5], ['#2f7f5e', 8]].forEach(([c, x], i) => {
    add(g, new THREE.BoxGeometry(1.1, 2, 0.04), toon(c), { p: [x, 3.2, -D / 2 + 0.08] });
    add(g, new THREE.ConeGeometry(0.55, 0.5, 3), toon(c), { p: [x, 2.0, -D / 2 + 0.08], r: [0, 0, Math.PI], s: [1, 1, 0.08] });
    add(g, new THREE.CircleGeometry(0.28, 5), toon('#ffc53d'), { p: [x, 3.3, -D / 2 + 0.11] });
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), toon(IRON), { p: [x, 4.22, -D / 2 + 0.12], r: [0, 0, Math.PI / 2] });
    if (i === 1) return;
  });
  for (const [z, c] of [[-4, '#8b1e3f'], [7, '#2f5fa0']]) {
    const sh = new THREE.Group();
    sh.position.set(W / 2 - 0.1, 2.6, z);
    sh.rotation.y = -Math.PI / 2;
    g.add(sh);
    add(sh, new THREE.CylinderGeometry(0.5, 0.5, 0.08, 20), toon(c), { r: [Math.PI / 2, 0, 0], outline: true });
    add(sh, new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12), toon('#c0c6d4'), { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.03] });
    for (const s of [-1, 1]) add(sh, new THREE.BoxGeometry(0.07, 1.4, 0.03), toon('#c0c6d4'), { p: [0, 0, -0.08], r: [0, 0, s * 0.7] });
  }
  // antlers over the fireplace
  const ant = new THREE.Group();
  ant.position.set(-W / 2 + 0.2, 3.9, 2);
  g.add(ant);
  add(ant, new THREE.BoxGeometry(0.1, 0.5, 0.35), toon(WOOD), {});
  for (const s of [-1, 1]) {
    add(ant, new THREE.CylinderGeometry(0.03, 0.05, 0.7, 6), toon('#e8dcc0'), { p: [0.2, 0.25, s * 0.3], r: [s * 0.8, 0, 0] });
    add(ant, new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), toon('#e8dcc0'), { p: [0.22, 0.45, s * 0.4], r: [-s * 0.3, 0, 0] });
  }
  // a bearskin rug and a couple of worn rugs
  add(g, new THREE.CircleGeometry(1.4, 10), toon('#5a3a1e'), { p: [-9, 0.012, 2], r: [-Math.PI / 2, 0, 0], s: [1.3, 0.9, 1], cast: false });
  add(g, new THREE.PlaneGeometry(3.2, 6), toon('#8b3a1e'), { p: [0, 0.01, 4.5], r: [-Math.PI / 2, 0, 0], cast: false });
  add(g, new THREE.PlaneGeometry(2.8, 5.6), toon('#c9955a'), { p: [0, 0.012, 4.5], r: [-Math.PI / 2, 0, 0], cast: false });
  // herbs and garlic hanging from the beams near the bar
  for (let i = 0; i < 6; i++) {
    const x = -7.5 + i * 1.1;
    add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4), toon('#c9b48c'), { p: [x, 4.3, -D / 2 + 2] });
    add(g, new THREE.ConeGeometry(0.12, 0.3, 6), toon(i % 2 ? '#5b8f4a' : '#e8e0d0'), { p: [x, 3.9, -D / 2 + 2], r: [Math.PI, 0, 0] });
  }
}

function bard(g, x, z, ry, anim) {
  const c = new Character({ ...DEFAULT_LOOK, skin: '#e3ac78', hair: 'hair_long', hairColor: '#8b3a1e', top: 'top_kimono', topColor: '#6b2a86', topAccent: '#ffc53d', hat: 'hat_robin', bottom: 'bottom_pants', bottomColor: '#3a2a1a' });
  c.root.position.set(x, 0, z);
  c.root.rotation.y = ry;
  g.add(c.root);
  // a lute held across the body
  const lute = new THREE.Group();
  lute.position.set(0.05, 0.95, 0.28);
  lute.rotation.set(0.1, 0, -0.9);
  c.root.add(lute);
  add(lute, new THREE.SphereGeometry(0.2, 16, 12), toon('#c9955a'), { s: [1, 1.2, 0.45], outline: true });
  add(lute, new THREE.CircleGeometry(0.05, 12), toon('#3a2a1a'), { p: [0, 0.02, 0.095] });
  add(lute, new THREE.BoxGeometry(0.06, 0.45, 0.04), toon(DARK), { p: [0, 0.4, 0.02], outline: true });
  add(lute, new THREE.BoxGeometry(0.08, 0.1, 0.05), toon(DARK), { p: [0, 0.66, 0], r: [-0.6, 0, 0] });
  const notes = [];
  for (let i = 0; i < 3; i++) {
    const n = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTexture, transparent: true, depthWrite: false }));
    n.scale.setScalar(0.35);
    g.add(n);
    notes.push(n);
  }
  anim.push((t, dt) => {
    c.update(dt ?? 0.016, t, false);
    c.rig.body.rotation.z = Math.sin(t * 2.2) * 0.06;
    c.rig.head.rotation.z = Math.sin(t * 2.2 + 0.5) * 0.12;
    c.rig.arms[0].rotation.set(-0.9, 0, -0.5 + Math.sin(t * 16) * 0.12);
    c.rig.elbows[0].rotation.x = -1.0;
    c.rig.arms[1].rotation.set(-1.2, 0, 0.9);
    c.rig.elbows[1].rotation.x = -1.2;
    notes.forEach((n, i) => {
      const p = (t * 0.45 + i / 3) % 1;
      n.position.set(x + Math.sin(p * 6 + i) * 0.3, 1.9 + p * 1.4, z + 0.2);
      n.material.opacity = Math.sin(p * Math.PI);
    });
  });
}
const noteTexture = canvasTexture(64, 64, (c) => {
  c.font = '48px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd84d'; c.strokeStyle = '#5a3a1e'; c.lineWidth = 3;
  c.strokeText('♪', 32, 34); c.fillText('♪', 32, 34);
});

export function tavernArea(stage) {
  stage.lights({ background: '#140a04', sky: 0xffd8a8, ground: 0x4a2a14, hemi: 0.85, sun: 0.55, sunPos: [6, 30, 12], box: 16 });
  const W = 24, D = 18;
  // plaster between dark timber framing, and worn floorboards
  const g = room(stage, {
    w: W, d: D, floor: ['#7a4e24', '#6b4220'], wall: '#d9c29a', trim: '#4a2e18',
    motif: (c) => {
      c.fillStyle = '#4a2e18';
      c.fillRect(0, 0, 18, 256); c.fillRect(128, 0, 18, 256); c.fillRect(0, 170, 256, 16);
      c.save(); c.translate(18, 170); c.rotate(-0.95); c.fillRect(0, -7, 135, 14); c.restore();
      c.save(); c.translate(146, 170); c.rotate(-0.95); c.fillRect(0, -7, 135, 14); c.restore();
      c.fillStyle = 'rgba(80,50,20,.12)'; for (let i = 0; i < 40; i++) c.fillRect((i * 97) % 256, (i * 61) % 256, 6, 3);
    },
  });
  stage.scene.add(g);
  const anim = [];
  const solids = [];
  tavernDecor(g, W, D, anim);

  // the bar along the back wall, with a barkeep, taps and shelves of bottles
  counter(g, -4, -6.2, 8, '#6b4226');
  solids.push({ x: -4, z: -6.2, w: 8.2, d: 1.1 });
  shopkeeper(g, { skin: '#e8b48a', hair: 'hair_bun', hairColor: '#8b3a1e', top: 'top_hoodie', topColor: '#2f7f5e', eyes: 'eyes_happy' }, -4, -7.2, anim);
  solids.push({ x: -4, z: -7.2, r: 0.6 });
  for (let i = 0; i < 3; i++) {
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8), toon('#c0c6d4'), { p: [-6 + i * 0.6, 1.4, -6.2] });
    add(g, new THREE.SphereGeometry(0.07, 8, 6), toon('#1d1b2e'), { p: [-6 + i * 0.6, 1.65, -6.2] });
  }
  for (const [mx, mz] of [[-2.5, -5.9], [-1.4, -6.0], [-7.2, -5.9]]) tankard(g, mx, 1.17, mz);
  for (const y of [1.6, 2.5]) {
    add(g, new THREE.BoxGeometry(8, 0.1, 0.5), toon('#5a3a1e'), { p: [-4, y, -D / 2 + 0.3] });
    for (let i = 0; i < 12; i++) add(g, new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), toon(['#3fa34d', '#8b1e3f', '#c9955a', '#39a0ff'][i % 4]), { p: [-7.6 + i * 0.66, y + 0.25, -D / 2 + 0.3] });
  }
  // bar stools, two of them taken by regulars
  for (let i = 0; i < 5; i++) {
    const x = -7.2 + i * 1.6;
    add(g, new THREE.CylinderGeometry(0.26, 0.22, 0.08, 12), toon(WOOD), { p: [x, 0.78, -4.95], outline: true });
    add(g, new THREE.CylinderGeometry(0.05, 0.08, 0.76, 8), toon(DARK), { p: [x, 0.38, -4.95] });
    solids.push({ x, z: -4.95, r: 0.35 });
  }
  patron(g, PATRONS[6], -5.6, -4.95, Math.PI, anim, { seatY: 0.82, offset: 0.4 });
  patron(g, PATRONS[9], -0.8, -4.95, Math.PI, anim, { seatY: 0.82, offset: 1.7 });

  // barrels stacked in the corner
  barrel(g, 7.5, -7.8); barrel(g, 8.7, -7.8); barrel(g, 8.1, -7.8, 1.1);
  barrel(g, 10.8, -4, 0.5, true);
  solids.push({ x: 8.1, z: -7.8, w: 2.4, d: 1.2 }, { x: 10.8, z: -4, w: 1.2, d: 1.2 });

  // the fireplace on the left wall
  const fp = new THREE.Group();
  fp.position.set(-W / 2 + 0.6, 0, 2);
  fp.rotation.y = Math.PI / 2;
  g.add(fp);
  add(fp, new THREE.BoxGeometry(3.2, 3.2, 1.0), toon('#8a8599'), { p: [0, 1.6, 0], outline: true });
  for (let i = 0; i < 14; i++) add(fp, new THREE.BoxGeometry(0.5, 0.28, 0.04), toon(i % 3 ? '#7a768a' : '#9a96aa'), { p: [-1.3 + (i % 5) * 0.62 + (Math.floor(i / 5) % 2) * 0.3, 0.3 + Math.floor(i / 5) * 1.1 + (i % 2) * 0.35, 0.52] });
  add(fp, new THREE.BoxGeometry(2.0, 1.5, 0.3), basic('#1a0d06'), { p: [0, 0.9, 0.4] });
  add(fp, new THREE.BoxGeometry(3.6, 0.25, 1.3), toon('#6b4226'), { p: [0, 3.25, 0.1], outline: true });
  for (const s of [-1, 1]) add(fp, new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), toon('#5a3a1e'), { p: [s * 0.3, 0.35, 0.45], r: [0, 0, Math.PI / 2 + s * 0.3] });
  const pot = add(fp, new THREE.SphereGeometry(0.32, 14, 10), toon(IRON), { p: [0, 1.25, 0.4], s: [1, 0.85, 1], outline: true });
  add(pot, new THREE.CylinderGeometry(0.27, 0.27, 0.02, 14), toon('#a0522d'), { p: [0, 0.2, 0] });
  const fire = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Sprite(additive(flameTexture, 0xff8a2a, 0.95));
    f.scale.set(0.8, 1.1, 1);
    f.position.set((i - 1) * 0.45, 0.75, 0.5);
    fp.add(f);
    fire.push(f);
  }
  const fireLight = new THREE.PointLight(0xff8a3a, 12, 12, 1.6);
  fireLight.position.set(0, 1.2, 1.4);
  fp.add(fireLight);
  anim.push((t) => {
    fire.forEach((f, i) => { f.scale.y = 1.0 + Math.sin(t * 9 + i * 2) * 0.2; });
    fireLight.intensity = 11 + Math.sin(t * 13) * 2 + Math.sin(t * 7) * 1.5;
  });
  solids.push({ x: -W / 2 + 0.6, z: 2, w: 1.2, d: 3.4 });

  // two long feast tables full of regulars eating and drinking, and a couple of little tables
  const L = 5.2;
  for (const [tx, tz, who] of [[-4.6, 0.8, [0, 1, 2, 3]], [4.6, 0.8, [4, 5, 7, 8]]]) {
    feastTable(g, tx, tz, L, anim);
    solids.push({ x: tx, z: tz, w: L, d: 2.6 });
    who.forEach((pi, i) => {
      const side = i % 2 ? 1 : -1;
      const px = tx - L / 2 + 0.9 + Math.floor(i / 2) * 2.1 + (side > 0 ? 0.9 : 0);
      patron(g, PATRONS[pi], px, tz + side * 1.0, side > 0 ? Math.PI : 0, anim, { food: i === 1 || i === 2 ? 'leg' : 'mug', offset: i + tx });
    });
  }
  for (const [x, z] of [[-7, 6.3], [7, 6.3]]) { roundTable(g, x, z, anim); solids.push({ x, z, r: 1.0 }); }

  // the bard by the fire
  bard(g, -9.3, 5.4, 0.9, anim);
  solids.push({ x: -9.3, z: 5.4, r: 0.6 });

  // a trading notice board
  const nb = new THREE.Group();
  nb.position.set(W / 2 - 0.3, 0, 1);
  nb.rotation.y = -Math.PI / 2;
  g.add(nb);
  add(nb, new THREE.BoxGeometry(2.6, 1.8, 0.1), toon('#8b5a2b'), { p: [0, 2.0, 0], outline: true });
  ['#fff6d6', '#ffe0b0', '#ffffff', '#fff0f6'].forEach((c, i) => add(nb, new THREE.BoxGeometry(0.6, 0.7, 0.02), toon(c), { p: [-0.9 + i * 0.6, 2.0 + (i % 2 ? 0.2 : -0.15), 0.06], r: [0, 0, (i - 1.5) * 0.08] }));

  sign(g, 'TRADING TAVERN', { x: 0, z: -4.5, y: 4.3, w: 4.6, h: 0.9, bg: '#8b3a1e' });
  sign(g, 'TRADE HERE', { x: 8, z: 3.5, y: 4.3, w: 3.0, h: 0.75, bg: '#2f7f5e' });

  const walker = openWalker(stage, { w: W, d: D, solids });

  // ---- trading: a "trade with …" prompt follows whoever you're standing next to ----------------
  const spots = new Map(); // key -> interactable
  const syncPeople = () => {
    for (const [k, p] of stage.people) {
      if (k === S.me) continue;
      let it = spots.get(k);
      if (!it) {
        it = stage.interactable({ x: p.x, z: p.z, r: 1.8, label: `trade with ${nameOf(k)}`, icon: 'tavern',
          use: () => { net.send('trade_ask', { to: k }); sfx('click'); } });
        spots.set(k, it);
      }
      it.x = p.x; it.z = p.z;
    }
    for (const [k, it] of spots) {
      if (stage.people.has(k)) continue;
      stage.interactables = stage.interactables.filter((i) => i !== it);
      spots.delete(k);
    }
  };

  // someone asks you: a little card at the top of the screen
  const ask = document.createElement('div');
  ask.className = 'hud-panel trade-ask hidden';
  stage.hud.append(ask);
  let askFrom = null, askTimer = 0;
  const showAsk = (k) => {
    askFrom = k;
    ask.innerHTML = `<b>${esc(nameOf(k))}</b> wants to trade! <button class="btn primary small" data-yes>Trade</button><button class="btn ghost small" data-no>No thanks</button>`;
    ask.classList.remove('hidden');
    clearTimeout(askTimer);
    askTimer = setTimeout(() => answer(false), 20000);
  };
  const answer = (yes) => {
    if (!askFrom) return;
    net.send('trade_answer', { from: askFrom, yes });
    askFrom = null;
    ask.classList.add('hidden');
    clearTimeout(askTimer);
  };
  ask.addEventListener('click', (e) => { if (e.target.closest('[data-yes]')) answer(true); if (e.target.closest('[data-no]')) answer(false); });

  let openId = null;
  const off = listen({
    trade_asked: (m) => { sfx('near'); showAsk(m.from); },
    trade: (m) => {
      if (openId === m.id) return; // the open window keeps itself up to date
      openId = m.id;
      stage.openPanel({ wide: true, mount: (body) => tradeWindow(body, m) });
    },
    trade_done: () => { openId = null; toast('🤝 Trade complete!'); },
    trade_closed: (m) => {
      if (openId !== m.id) return;
      openId = null;
      stage.closePanel?.();
      toast(m.why, 'error');
    },
  });

  stage.onFrame((dt, now) => { syncPeople(); for (const fn of anim) fn(now / 1000, dt); });
  stage.banner('<div class="big">🍺 Trading Tavern</div>Walk up to a friend and press <kbd>E</kbd> to trade coins, cosmetics and furniture.', 3500);
  return () => { off(); clearTimeout(askTimer); ask.remove(); walker.stop(); stage.scene?.remove(g); };
}
