// Walk-in shops: the Style Shop (mannequins for every kind of clothing, a crate machine, a mirror)
// and the Pet Shop (pens full of pets to meet, and an egg incubator to hatch a random one).
// Walk up to something and press E: it opens the matching part of the shop.
import * as THREE from 'three';
import { net } from '../net.js';
import { esc, fmt, me } from '../state.js';
import { CATALOG, ITEMS, RARITY } from '../catalog.js';
import { portraitInto } from '../avatar.js';
import { Character, DEFAULT_LOOK } from '../three/character.js';
import { buildPet } from '../three/pets.js';
import { toon, basic, canvasTexture, outlineMaterial, additive, glowTexture, TAU } from '../three/materials.js';
import { wardrobe } from '../wardrobe.js';
import { sfx } from '../sfx.js';
import { $, listen, confetti } from '../games/util.js';

const OUT = outlineMaterial(0.035);
export function add(parent, geo, mat, { p = [0, 0, 0], r = null, s = null, outline = false, cast = true } = {}) {
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

/** A shop room: floor, walls (the ones between you and the camera hide), a doorway, lights. */
export function room(stage, { w, d, floor, wall, trim, motif = null }) {
  const g = new THREE.Group();
  const floorTex = canvasTexture(256, 256, (c) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      c.fillStyle = (x + y) % 2 ? floor[0] : floor[1];
      c.fillRect(x * 32, y * 32, 32, 32);
    }
  }, { repeat: [w / 4, d / 4] });
  add(g, new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ map: floorTex }), { r: [-Math.PI / 2, 0, 0], cast: false });
  // outside: a lawn, and a stone path up to the door
  add(g, new THREE.PlaneGeometry(120, 120), toon('#6fbf5e'), { p: [0, -0.02, 0], r: [-Math.PI / 2, 0, 0], cast: false });
  add(g, new THREE.PlaneGeometry(3, 8), toon('#d8c7a4'), { p: [0, -0.01, d / 2 + 4], r: [-Math.PI / 2, 0, 0], cast: false });
  const H = 5;
  // striped wallpaper with an optional little motif
  const paper = canvasTexture(256, 256, (c) => {
    c.fillStyle = wall;
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(255,255,255,.35)';
    for (let x = 0; x < 256; x += 64) c.fillRect(x, 0, 28, 256);
    if (motif) motif(c);
  }, { repeat: [w / 3, H / 3] });
  const wallMat = new THREE.MeshToonMaterial({ map: paper, side: THREE.DoubleSide });
  const walls = {
    back: add(g, new THREE.PlaneGeometry(w, H), wallMat, { p: [0, H / 2, -d / 2] }),
    front: add(g, new THREE.PlaneGeometry(w, H), wallMat, { p: [0, H / 2, d / 2], r: [0, Math.PI, 0] }),
    left: add(g, new THREE.PlaneGeometry(d, H), wallMat, { p: [-w / 2, H / 2, 0], r: [0, Math.PI / 2, 0] }),
    right: add(g, new THREE.PlaneGeometry(d, H), wallMat, { p: [w / 2, H / 2, 0], r: [0, -Math.PI / 2, 0] }),
  };
  for (const [k, m] of Object.entries(walls)) {
    const along = k === 'back' || k === 'front';
    add(m, new THREE.BoxGeometry(along ? w : d, 0.3, 0.12), toon(trim), { p: [0, -H / 2 + 0.15, 0.05], cast: false });
    add(m, new THREE.BoxGeometry(along ? w : d, 0.2, 0.12), toon(trim), { p: [0, H / 2 - 0.1, 0.05], cast: false });
    // panelled wainscot along the bottom with a rail on top
    const len = along ? w : d, n = Math.floor(len / 1.6);
    add(m, new THREE.BoxGeometry(len, 1.3, 0.06), toon('#ffffff'), { p: [0, -H / 2 + 0.65, 0.03], cast: false });
    add(m, new THREE.BoxGeometry(len, 0.1, 0.14), toon(trim), { p: [0, -H / 2 + 1.32, 0.06], cast: false });
    for (let k = 0; k < n; k++) add(m, new THREE.BoxGeometry(1.2, 0.85, 0.04), toon('#f3eef8'), { p: [-len / 2 + 0.8 + (k * (len - 1.6)) / Math.max(1, n - 1), -H / 2 + 0.68, 0.07], cast: false });
  }
  // sunny windows on the side walls
  for (const side of [walls.left, walls.right]) {
    for (const x of [-d / 4, d / 4]) {
      add(side, new THREE.BoxGeometry(2.2, 1.8, 0.1), toon('#ffffff'), { p: [x, 0.7, 0.05], cast: false });
      add(side, new THREE.BoxGeometry(1.9, 1.5, 0.12), toon('#bfe6ff', { emissive: '#bfe6ff', emissiveIntensity: 0.45 }), { p: [x, 0.7, 0.07], cast: false });
      add(side, new THREE.BoxGeometry(0.08, 1.5, 0.14), toon('#ffffff'), { p: [x, 0.7, 0.09], cast: false });
      add(side, new THREE.BoxGeometry(1.9, 0.08, 0.14), toon('#ffffff'), { p: [x, 0.7, 0.09], cast: false });
    }
  }
  add(walls.front, new THREE.BoxGeometry(2.6, 3.4, 0.2), toon('#ffffff'), { p: [0, -H / 2 + 1.7, 0.02] });
  add(walls.front, new THREE.BoxGeometry(2.1, 3.0, 0.25), basic('#fff3c4'), { p: [0, -H / 2 + 1.5, 0.04], cast: false });
  for (const [x, z] of [[-w / 4, -d / 4], [w / 4, -d / 4], [0, d / 5]]) {
    const light = new THREE.PointLight(0xfff0dc, 16, 16, 1.6);
    light.position.set(x, H - 0.4, z);
    g.add(light);
    add(g, new THREE.SphereGeometry(0.3, 12, 8), basic('#fff6c9'), { p: [x, H - 0.2, z], cast: false });
  }
  stage.onFrame(() => {
    const c = stage.camera.position;
    walls.front.visible = c.z < d / 2 - 0.3;
    walls.back.visible = c.z > -d / 2 + 0.3;
    walls.left.visible = c.x > -w / 2 + 0.3;
    walls.right.visible = c.x < w / 2 - 0.3;
  });
  return g;
}

/**
 * A hanging sign that names an area of the shop (readable from both sides), on two chains from
 * the ceiling. Returns the group.
 */
export function sign(g, text, { x, z, y = 3.6, ry = 0, w = 3.2, h = 0.8, bg = '#2ed8c3', fg = '#ffffff', hang = true } = {}) {
  // hung up near the ceiling so they don't block your view of the room
  if (hang) y = Math.max(y, 4.25);
  w *= 0.82; h *= 0.82;
  const cw = 512, ch = Math.round((512 * h) / w);
  const tex = canvasTexture(cw, ch, (c) => {
    c.fillStyle = '#ffffff';
    c.beginPath(); c.roundRect(0, 0, cw, ch, ch * 0.3); c.fill();
    c.fillStyle = bg;
    c.beginPath(); c.roundRect(8, 8, cw - 16, ch - 16, ch * 0.25); c.fill();
    let size = Math.floor(ch * 0.55);
    c.font = `${size}px "Luckiest Guy", Rubik, sans-serif`;
    while (c.measureText(text).width > cw * 0.88 && size > 12) { size -= 2; c.font = `${size}px "Luckiest Guy", Rubik, sans-serif`; }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.fillText(text, cw / 2 + 2, ch / 2 + size * 0.08 + 3);
    c.fillStyle = fg;
    c.fillText(text, cw / 2, ch / 2 + size * 0.08);
  });
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = ry;
  g.add(s);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  add(s, new THREE.PlaneGeometry(w, h), mat, { p: [0, 0, 0.03], cast: false });
  add(s, new THREE.PlaneGeometry(w, h), mat, { p: [0, 0, -0.03], r: [0, Math.PI, 0], cast: false });
  add(s, new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.05), toon('#ffffff'), { cast: false });
  if (hang) for (const sx of [-w / 2 + 0.3, w / 2 - 0.3]) add(s, new THREE.CylinderGeometry(0.02, 0.02, 5 - y - h / 2, 5), toon('#8a8aa0'), { p: [sx, (5 - y) / 2 + h / 4, 0], cast: false });
  return s;
}

export function shopkeeper(g, look, x, z, anim) {
  const c = new Character({ ...DEFAULT_LOOK, ...look });
  c.root.position.set(x, 0, z);
  g.add(c.root);
  anim.push((t, dt) => c.update(dt, t, false));
  return c;
}

export function counter(g, x, z, w, color) {
  add(g, new THREE.BoxGeometry(w, 1.1, 0.9), toon(color), { p: [x, 0.55, z], outline: true });
  add(g, new THREE.BoxGeometry(w + 0.2, 0.1, 1.1), toon('#ffffff'), { p: [x, 1.12, z] });
  add(g, new THREE.BoxGeometry(0.5, 0.4, 0.4), toon('#2b2f4a'), { p: [x + w / 2 - 0.5, 1.37, z] }); // till
}

export function openWalker(stage, { w, d, solids }) {
  const walker = stage.walker({
    spawn: { x: 0, z: d / 2 - 2.5 }, speed: 5, solids,
    bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 },
    orbit: { yaw: 0, pitch: 0.65, dist: 12, maxDist: 18 },
  });
  walker.me.heading = Math.PI;
  stage.interactable({ x: 0, z: d / 2 - 0.8, r: 2.3, label: 'go back outside', use: () => stage.onExit?.() });
  return walker;
}

// ---------------------------------------------------------------------------
// The Style Shop
// ---------------------------------------------------------------------------


/** Shelves of folded clothes against a wall. */
function clothesShelf(g, x, z, ry, colors) {
  const s = new THREE.Group();
  s.position.set(x, 0, z);
  s.rotation.y = ry;
  g.add(s);
  add(s, new THREE.BoxGeometry(2.6, 2.6, 0.08), toon('#ffffff'), { p: [0, 1.3, -0.26], outline: true });
  for (const sx of [-1.28, 1.28]) add(s, new THREE.BoxGeometry(0.08, 2.6, 0.6), toon('#ffffff'), { p: [sx, 1.3, 0], outline: true });
  add(s, new THREE.BoxGeometry(2.6, 0.1, 0.6), toon('#ffffff'), { p: [0, 2.6, 0] });
  for (const y of [0.55, 1.25, 1.95]) {
    add(s, new THREE.BoxGeometry(2.4, 0.06, 0.55), toon('#e8dff0'), { p: [0, y - 0.25, 0.03] });
    for (let k = 0; k < 4; k++) {
      const c = colors[(k + Math.round(y * 3)) % colors.length];
      for (let j = 0; j < 3; j++) add(s, new THREE.BoxGeometry(0.46, 0.1, 0.4), toon(c), { p: [-0.9 + k * 0.6, y - 0.16 + j * 0.11, 0.08], cast: false });
    }
  }
}

/** A rolling clothes rack with shirts on hangers. */
function clothesRack(g, x, z, ry, colors) {
  const r = new THREE.Group();
  r.position.set(x, 0, z);
  r.rotation.y = ry;
  g.add(r);
  const metal = toon('#c0c6d4');
  for (const sx of [-1.1, 1.1]) {
    add(r, new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), metal, { p: [sx, 1.1, 0] });
    add(r, new THREE.BoxGeometry(0.08, 0.06, 0.8), metal, { p: [sx, 0.05, 0] });
  }
  add(r, new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), metal, { p: [0, 2.15, 0], r: [0, 0, Math.PI / 2] });
  colors.forEach((c, k) => {
    const x2 = -0.9 + k * (1.8 / (colors.length - 1));
    add(r, new THREE.BoxGeometry(0.12, 0.9, 0.55), toon(c), { p: [x2, 1.6, 0], outline: true });
    add(r, new THREE.BoxGeometry(0.1, 0.35, 0.9), toon(c), { p: [x2, 1.9, 0] });
    add(r, new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), metal, { p: [x2, 2.1, 0], cast: false });
  });
}

export function styleShopArea(stage) {
  // a proper clothing store: racks and shelves all round, tables of folded tees, a shoe wall, a hat
  // stand, window mannequins by the door, and a till with a cashier. Staff wander the aisles tidying.
  // Click (or walk up to) any rack, shelf or table to open the shop.
  stage.lights({ background: '#1a0f24', sky: 0xfff6ee, ground: 0x7a6a8a, hemi: 1.35, sun: 0.9, sunPos: [6, 30, 12], box: 18 });
  const W = 28, D = 20;
  const g = room(stage, { w: W, d: D, floor: ['#efe6da', '#e6dccd'], wall: '#f6f1ea', trim: '#2b2f4a',
    motif: (c) => { c.fillStyle = 'rgba(43,47,74,.06)'; c.fillRect(0, 120, 256, 16); } });
  stage.scene.add(g);
  const anim = [];
  const solids = [];
  const shop = (tab = 'top') => () => stage.openPanel({ wide: true, mount: (body) => wardrobe(body, { mode: 'shop', tab }) });
  const browse = (x, z, r, obj, tab, label = 'browse the clothes') => stage.interactable({ x, z, r, label, icon: 'shop', obj, use: shop(tab) });
  const TEES = ['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#b77bff', '#ff9f43', '#f4f4f4', '#2b2f4a'];

  // ---- the walls: rails of hanging clothes, shelves of folded ones, the shoe wall ----
  for (const [x, cols] of [[-9, TEES], [-3, TEES.slice(2)], [3, TEES.slice().reverse()], [9, TEES.slice(1)]]) {
    const rail = wallRail(g, x, -D / 2 + 0.45, 0, cols);
    solids.push({ x, z: -D / 2 + 0.5, w: 4.6, d: 1.0 });
    browse(x, -D / 2 + 1.6, 2.6, rail, 'top');
  }
  clothesShelf(g, -W / 2 + 0.5, -4, Math.PI / 2, TEES);
  clothesShelf(g, -W / 2 + 0.5, 0.5, Math.PI / 2, TEES.slice().reverse());
  solids.push({ x: -W / 2 + 0.5, z: -4, w: 0.8, d: 2.7 }, { x: -W / 2 + 0.5, z: 0.5, w: 0.8, d: 2.7 });
  browse(-W / 2 + 1.8, -4, 2.6, null, 'top');
  browse(-W / 2 + 1.8, 0.5, 2.6, null, 'bottom');
  const shoes = shoeWall(g, W / 2 - 0.45, -2.5, -Math.PI / 2);
  solids.push({ x: W / 2 - 0.5, z: -2.5, w: 0.9, d: 5.2 });
  browse(W / 2 - 1.8, -2.5, 2.8, shoes, 'shoes', 'browse shoes');

  // ---- the floor: round racks, rolling racks, display tables, a hat stand ----
  for (const [x, z, k] of [[-6.5, -4.5, 0], [0, -4.8, 3], [6.5, -4.5, 5]]) {
    const r = roundRack(g, x, z, TEES.slice(k).concat(TEES.slice(0, k)));
    solids.push({ x, z, r: 1.35 });
    browse(x, z, 2.6, r, k === 3 ? 'top' : 'bottom');
  }
  for (const [x, z, ry] of [[-8, 1.5, 0.2], [8.5, 1.8, -0.25]]) {
    clothesRack(g, x, z, ry, ['#ff5d73', '#ffd84d', '#39c6ff', '#b77bff', '#f4f4f4']);
    solids.push({ x, z, w: 2.6, d: 1.2 });
    browse(x, z, 2.6, null, x > 0 ? 'outfit' : 'top', x > 0 ? 'browse the outfits' : 'browse the clothes');
  }
  for (const [x, z] of [[-3.2, 0.8], [3.2, 0.8]]) {
    const t = displayTable(g, x, z, TEES);
    solids.push({ x, z, w: 2.6, d: 1.5 });
    browse(x, z, 2.6, t, 'top');
  }
  const hats = hatStand(g, 0, 1.2);
  solids.push({ x: 0, z: 1.2, r: 0.7 });
  browse(0, 1.2, 2.2, hats, 'hat', 'browse hats');
  // accessories: a glass case of glasses and bling, and a basket of backpacks
  const glasses = glassCase(g, -11, 6.2);
  solids.push({ x: -11, z: 6.2, w: 2.6, d: 1.0 });
  browse(-11, 6.2, 2.6, glasses, 'face', 'browse glasses & masks');

  // ---- by the door: two mannequins in the window, dressed up ----
  for (const [x, look] of [[-5.5, { top: 'top_hawaiian', hat: 'hat_sunhat', bottom: 'bottom_shorts' }], [5.5, { top: 'top_suit', topColor: '#2b2f4a', hat: 'hat_beret', back: 'back_wings' }]]) {
    const stand = new THREE.Group();
    stand.position.set(x, 0, D / 2 - 1.6);
    g.add(stand);
    add(stand, new THREE.CylinderGeometry(0.9, 1.0, 0.3, 28), toon('#ffffff'), { p: [0, 0.15, 0], outline: true });
    const c = new Character({ ...DEFAULT_LOOK, skin: '#e8e2f4', hair: 'hair_none', hairColor: '#e8e2f4', eyes: 'eyes_happy', ...look });
    c.root.position.y = 0.3;
    c.root.rotation.y = Math.PI;
    stand.add(c.root);
    anim.push((t, dt) => c.update(dt, t + x, false));
    solids.push({ x, z: D / 2 - 1.6, r: 1.0 });
    browse(x, D / 2 - 1.6, 2.4, stand, 'top', 'check out the outfit');
  }

  // ---- the till ----
  counter(g, 9.5, 6, 4.4, '#2b2f4a');
  solids.push({ x: 9.5, z: 6, w: 4.6, d: 1.1 });
  const cashier = shopkeeper(g, { skin: '#f6c9a0', hair: 'hair_bob', hairColor: '#ff8fc7', top: 'top_tee', topColor: '#2ed8c3', eyes: 'eyes_lashes', face: 'face_glasses' }, 9.5, 7.0, anim);
  cashier.root.rotation.y = Math.PI;
  solids.push({ x: 9.5, z: 7.0, r: 0.6 });
  stage.interactable({ x: 9.5, z: 4.8, r: 2.4, label: 'talk to the cashier', icon: 'shop', obj: cashier.root, use: shop('crates') });
  // shopping bags behind the till, and a little plant
  for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.4, 0.5, 0.18), toon(['#ff5d73', '#ffd84d', '#39c6ff', '#b77bff'][i]), { p: [11.2 + (i % 2) * 0.5, 0.25, 7.6 + Math.floor(i / 2) * 0.3], outline: true });

  // ---- signs and finishing touches ----
  sign(g, 'STYLE SHOP', { x: 0, z: -D / 2 + 0.2, y: 4.2, w: 6, h: 1.2, bg: '#ff5d73', hang: false });
  // (signs sit on the walls and the counter, out of the camera's way)
  sign(g, 'NEW ARRIVALS', { x: -W / 2 + 0.15, z: -1.8, y: 3.4, ry: Math.PI / 2, w: 3.4, h: 0.7, bg: '#2ed8c3', hang: false });
  sign(g, 'SALE', { x: -8, z: 1.5, y: 2.55, w: 1.4, h: 0.5, bg: '#ffd84d', fg: '#2b2f4a', hang: false });
  sign(g, 'SHOES', { x: W / 2 - 0.15, z: -2.5, y: 3.4, ry: -Math.PI / 2, w: 2.2, h: 0.7, bg: '#7c6bff', hang: false });
  sign(g, 'CHECKOUT', { x: 9.5, z: 6, y: 1.75, w: 1.8, h: 0.5, bg: '#2b2f4a', hang: false });
  // a runner rug down the middle aisle
  add(g, new THREE.PlaneGeometry(2.4, 11), toon('#2b2f4a'), { p: [0, 0.012, 3.4], r: [-Math.PI / 2, 0, 0], cast: false });
  add(g, new THREE.PlaneGeometry(2.0, 10.6), toon('#ff5d73'), { p: [0, 0.016, 3.4], r: [-Math.PI / 2, 0, 0], cast: false });
  for (const [x, z] of [[-12.5, 8.4], [12.5, 8.4], [-12.5, -8.6], [12.5, -8.6]]) {
    add(g, new THREE.CylinderGeometry(0.45, 0.35, 0.8, 14), toon('#ffffff'), { p: [x, 0.4, z], outline: true });
    add(g, new THREE.IcosahedronGeometry(0.8, 1), toon('#2f9e44'), { p: [x, 1.4, z], outline: true });
    solids.push({ x, z, r: 0.6 });
  }

  // ---- staff: they wander the aisles, stopping now and then to tidy a rack ----
  const routes = [
    [[-11, -6.5], [-1.5, -6.8], [-1.5, -2.2], [-11, -2.2]],
    [[11, -7], [3.5, -7], [3.5, 3.4], [11.5, 3.4]],
    [[-12, 3.6], [-1.6, 3.6], [-1.6, 7.6], [-12, 7.6]],
  ];
  const staffLooks = [
    { skin: '#c68a5e', hair: 'hair_bun', hairColor: '#2b1d14', top: 'top_tee', topColor: '#2ed8c3', eyes: 'eyes_round' },
    { skin: '#f1c7a4', hair: 'hair_quiff', hairColor: '#ffd84d', top: 'top_tee', topColor: '#2ed8c3', eyes: 'eyes_happy' },
    { skin: '#8d5a3b', hair: 'hair_curly', hairColor: '#1d1b2e', top: 'top_tee', topColor: '#2ed8c3', eyes: 'eyes_round', face: 'face_glasses' },
  ];
  routes.forEach((route, i) => {
    const c = new Character({ ...DEFAULT_LOOK, ...staffLooks[i] });
    g.add(c.root);
    const s = { leg: 0, x: route[0][0], z: route[0][1], wait: 1 + i, heading: 0 };
    c.root.position.set(s.x, 0, s.z);
    anim.push((t, dt) => {
      let moving = false;
      if (s.wait > 0) s.wait -= dt;
      else {
        const [tx, tz] = route[(s.leg + 1) % route.length];
        const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz), step = dt * 1.6;
        if (d <= step) {
          s.x = tx; s.z = tz; s.leg = (s.leg + 1) % route.length;
          s.wait = Math.random() < 0.5 ? 1.5 + Math.random() * 2.5 : 0; // stop to tidy sometimes
        } else {
          s.x += (dx / d) * step; s.z += (dz / d) * step;
          s.heading = Math.atan2(dx, dz);
          moving = true;
        }
      }
      c.root.position.set(s.x, 0, s.z);
      const cur = c.root.rotation.y, diff = Math.atan2(Math.sin(s.heading - cur), Math.cos(s.heading - cur));
      c.root.rotation.y = cur + diff * Math.min(1, dt * 8);
      c.update(dt, t, moving, 1);
    });
  });

  const walker = openWalker(stage, { w: W, d: D, solids });
  stage.onFrame((dt, now) => { for (const fn of anim) fn(now / 1000, dt); });
  stage.banner('<div class="big">👕 Style Shop</div>Click any rack, shelf or table to shop.', 3000);
  return () => { walker.stop(); stage.scene?.remove(g); };
}

/** A rail of hanging clothes fixed to the back wall, with a shelf above. */
function wallRail(g, x, z, ry, colors) {
  const r = new THREE.Group();
  r.position.set(x, 0, z);
  r.rotation.y = ry;
  g.add(r);
  const metal = toon('#c0c6d4');
  add(r, new THREE.BoxGeometry(4.6, 0.08, 0.5), toon('#ffffff'), { p: [0, 2.75, 0.05], outline: true });
  add(r, new THREE.CylinderGeometry(0.03, 0.03, 4.4, 8), metal, { p: [0, 2.3, 0.25], r: [0, 0, Math.PI / 2] });
  for (const sx of [-2.2, 2.2]) add(r, new THREE.BoxGeometry(0.06, 0.06, 0.3), metal, { p: [sx, 2.3, 0.1] });
  colors.concat(colors).slice(0, 11).forEach((c, k) => {
    const xx = -2 + k * 0.4;
    add(r, new THREE.BoxGeometry(0.1, 0.95, 0.5), toon(c), { p: [xx, 1.8, 0.28], outline: true });
    add(r, new THREE.BoxGeometry(0.08, 0.32, 0.85), toon(c), { p: [xx, 2.05, 0.28] });
  });
  // folded stacks on the shelf above
  for (let k = 0; k < 6; k++) for (let j = 0; j < 3; j++) add(r, new THREE.BoxGeometry(0.5, 0.1, 0.38), toon(colors[(k + j) % colors.length]), { p: [-1.9 + k * 0.76, 2.84 + j * 0.11, 0.05], cast: false });
  return r;
}

/** A round rack: a ring of hanging clothes round a pole, on a chrome base. */
function roundRack(g, x, z, colors) {
  const r = new THREE.Group();
  r.position.set(x, 0, z);
  g.add(r);
  const metal = toon('#c0c6d4');
  add(r, new THREE.CylinderGeometry(0.5, 0.6, 0.06, 20), metal, { p: [0, 0.03, 0] });
  add(r, new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), metal, { p: [0, 0.8, 0] });
  add(r, new THREE.TorusGeometry(1.0, 0.03, 8, 36), metal, { p: [0, 1.55, 0], r: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU, c = colors[k % colors.length];
    const hanger = new THREE.Group();
    hanger.position.set(Math.cos(a), 1.5, Math.sin(a));
    hanger.rotation.y = -a;
    r.add(hanger);
    add(hanger, new THREE.BoxGeometry(0.1, 0.9, 0.5), toon(c), { p: [0, -0.4, 0], outline: true });
    add(hanger, new THREE.BoxGeometry(0.08, 0.3, 0.78), toon(c), { p: [0, -0.15, 0] });
  }
  return r;
}

/** A low wooden table with stacks of folded tees and a little price sign. */
function displayTable(g, x, z, colors) {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  g.add(t);
  add(t, new THREE.BoxGeometry(2.4, 0.1, 1.3), toon('#c9955a'), { p: [0, 0.8, 0], outline: true });
  for (const sx of [-1.1, 1.1]) for (const sz of [-0.55, 0.55]) add(t, new THREE.BoxGeometry(0.1, 0.8, 0.1), toon('#8b5a2b'), { p: [sx, 0.4, sz] });
  for (let k = 0; k < 4; k++) for (let j = 0; j < 4 - (k % 2); j++) add(t, new THREE.BoxGeometry(0.46, 0.1, 0.4), toon(colors[(k * 2 + j) % colors.length]), { p: [-0.85 + k * 0.56, 0.9 + j * 0.11, 0.2 - (k % 2) * 0.4], cast: false });
  add(t, new THREE.BoxGeometry(0.4, 0.28, 0.04), toon('#ffffff'), { p: [0.9, 1.0, 0.45], r: [-0.3, 0, 0], outline: true });
  return t;
}

/** A wall of shelves lined with pairs of sneakers and boots. */
function shoeWall(g, x, z, ry) {
  const s = new THREE.Group();
  s.position.set(x, 0, z);
  s.rotation.y = ry;
  g.add(s);
  add(s, new THREE.BoxGeometry(5, 3, 0.1), toon('#ffffff'), { p: [0, 1.5, -0.3], outline: true });
  const cols = ['#ff5d73', '#f4f4f4', '#2b2f4a', '#39c6ff', '#ffd84d', '#8b5a2b', '#6ee7a0'];
  for (let row = 0; row < 5; row++) {
    const y = 0.45 + row * 0.55;
    add(s, new THREE.BoxGeometry(4.8, 0.05, 0.5), toon('#e8dff0'), { p: [0, y, -0.05] });
    for (let k = 0; k < 6; k++) {
      const c = cols[(row * 3 + k) % cols.length];
      for (const dz of [-0.07, 0.07]) {
        add(s, new THREE.BoxGeometry(0.16, 0.12, 0.34), toon(c), { p: [-2 + k * 0.8 + dz * 1.4, y + 0.08, 0], outline: true });
        add(s, new THREE.BoxGeometry(0.17, 0.04, 0.35), toon('#ffffff'), { p: [-2 + k * 0.8 + dz * 1.4, y + 0.04, 0], cast: false });
      }
    }
  }
  return s;
}

/** A tall stand of hats on pegs. */
function hatStand(g, x, z) {
  const h = new THREE.Group();
  h.position.set(x, 0, z);
  g.add(h);
  add(h, new THREE.CylinderGeometry(0.5, 0.55, 0.08, 18), toon('#2b2f4a'), { p: [0, 0.04, 0] });
  add(h, new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), toon('#8b5a2b'), { p: [0, 1.1, 0] });
  const hats = [['#e0463c', 'cap'], ['#ffd84d', 'bucket'], ['#2b2f4a', 'beanie'], ['#8b5a2b', 'cowboy'], ['#ff8fc7', 'beret'], ['#39c6ff', 'cap']];
  hats.forEach(([c, kind], i) => {
    const a = (i / hats.length) * TAU, y = 1.0 + (i % 3) * 0.45;
    const peg = new THREE.Group();
    peg.position.set(Math.cos(a) * 0.32, y, Math.sin(a) * 0.32);
    h.add(peg);
    if (kind === 'cowboy') { add(peg, new THREE.CylinderGeometry(0.32, 0.32, 0.03, 18), toon(c), {}); add(peg, new THREE.CylinderGeometry(0.15, 0.17, 0.2, 14), toon(c), { p: [0, 0.1, 0], outline: true }); }
    else if (kind === 'bucket') add(peg, new THREE.CylinderGeometry(0.16, 0.24, 0.2, 14), toon(c), { outline: true });
    else if (kind === 'beret') add(peg, new THREE.SphereGeometry(0.22, 14, 8), toon(c), { s: [1, 0.3, 1], outline: true });
    else add(peg, new THREE.SphereGeometry(0.18, 14, 10, 0, TAU, 0, Math.PI / 2), toon(c), { outline: true });
  });
  return h;
}

/** A glass counter case of sunglasses and jewellery. */
function glassCase(g, x, z) {
  const c = new THREE.Group();
  c.position.set(x, 0, z);
  g.add(c);
  add(c, new THREE.BoxGeometry(2.4, 0.7, 0.9), toon('#ffffff'), { p: [0, 0.35, 0], outline: true });
  add(c, new THREE.BoxGeometry(2.4, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.3, roughness: 0.05 }), { p: [0, 0.95, 0], cast: false });
  for (let k = 0; k < 5; k++) {
    const gx = -0.9 + k * 0.45;
    for (const s of [-1, 1]) add(c, new THREE.TorusGeometry(0.06, 0.012, 6, 14), toon(['#1d1b2e', '#e0463c', '#ffd84d', '#39c6ff', '#b77bff'][k]), { p: [gx + s * 0.07, 0.78, 0], r: [Math.PI / 2, 0, 0] });
  }
  return c;
}

// ---------------------------------------------------------------------------
// The Pet Shop
// ---------------------------------------------------------------------------

const PETS = () => CATALOG.items.filter((i) => i.slot === 'pet' && i.id !== 'pet_none');

function petEgg(body) {
  const price = CATALOG.petEgg.price;
  const w = CATALOG.petEgg.weights;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let hatching = false;
  const render = () => {
    const left = PETS().filter((p) => !me().owned.includes(p.id)).length;
    body.innerHTML = `
      <h2>🥚 Pet Egg Incubator</h2>
      <div class="egg-stage"><div class="egg"><i></i><i></i><i></i></div><div class="egg-reveal hidden"></div></div>
      <button class="btn primary" id="hatch" ${left ? '' : 'disabled'}>${left ? `Hatch an egg · 🪙 ${fmt(price)}` : 'You have every pet!'}</button>
      <p class="odds center">${['common', 'rare', 'epic', 'legendary'].map((r) => `<span style="color:${RARITY[r].color}">${RARITY[r].label} ${Math.round((w[r] / total) * 100)}%</span>`).join(' · ')}</p>
      <p class="muted small center">A random pet you don't have yet. Want a particular one? Visit the pens to buy it outright.</p>
      <p class="muted center">Balance: <b>${fmt(me().coins)}</b> 🪙</p>`;
    $(body, '#hatch').onclick = () => {
      if (hatching) return;
      hatching = true;
      $(body, '#hatch').disabled = true;
      $(body, '.egg').classList.add('wobble');
      sfx('rattle');
      net.send('pet_egg');
    };
  };
  const off = listen({
    pet_hatched: (m) => {
      const it = ITEMS[m.id], r = RARITY[it.rarity];
      setTimeout(() => {
        const egg = $(body, '.egg');
        egg.classList.remove('wobble');
        egg.classList.add('crack');
        sfx('pop');
      }, 1400);
      setTimeout(() => {
        hatching = false;
        $(body, '.egg').classList.add('hidden');
        const box = $(body, '.egg-reveal');
        box.classList.remove('hidden');
        box.style.setProperty('--r', r.color);
        box.innerHTML = `<div class="rv-art"></div><div class="rv-rarity">${r.label}</div><div class="rv-name">${esc(it.name)}!</div>
          <div class="row center"><button class="btn primary" id="equipPet">Take them home</button><button class="btn" id="again">Hatch another</button></div>`;
        portraitInto(box.querySelector('.rv-art'), { ...me().look, pet: it.id }, 150, 150, { zoom: 'pet' });
        sfx('reveal', { rarity: it.rarity });
        confetti(body, { count: it.rarity === 'legendary' ? 200 : 90, colors: [r.color, '#fff', '#ff8fc7'] });
        $(box, '#equipPet').onclick = () => { net.send('look', { look: { ...me().look, pet: it.id } }); sfx('swap'); render(); };
        $(box, '#again').onclick = render;
      }, 2300);
    },
    error: (m) => { if (m.for === 'pet_egg') { hatching = false; render(); } },
    player: () => { if (!hatching && !body.querySelector('.egg-reveal:not(.hidden)')) render(); },
  });
  render();
  return off;
}

export function petShopArea(stage) {
  stage.lights({ background: '#1a1408', sky: 0xfff6e0, ground: 0x8a6a4a, hemi: 1.35, sun: 1.0, sunPos: [6, 30, 12], box: 16 });
  const W = 24, D = 18;
  const g = room(stage, { w: W, d: D, floor: ['#fff1c9', '#ffe4a8'], wall: '#ffeccc', trim: '#ff8fc7',
    motif: (c) => {
      // little paw prints
      c.fillStyle = 'rgba(255,143,199,.4)';
      for (const [x, y] of [[48, 60], [176, 190]]) {
        c.beginPath(); c.ellipse(x, y, 13, 11, 0, 0, TAU); c.fill();
        for (const [dx, dy] of [[-14, -14], [-5, -20], [5, -20], [14, -14]]) { c.beginPath(); c.arc(x + dx, y + dy, 5, 0, TAU); c.fill(); }
      }
    } });
  stage.scene.add(g);
  const anim = [];
  const solids = [];

  // three pens with low picket fences; pets wander around inside
  const pens = [
    { x: -7, z: -4, w: 7, d: 5, rarities: ['common'], sign: 'COMMON PALS', color: '#6ee7a0', grass: '#9fd67a' },
    { x: 1.5, z: -4.5, w: 7, d: 4.5, rarities: ['rare'], sign: 'RARE FRIENDS', color: '#39c6ff', grass: '#8fd6b0' },
    { x: 8.5, z: -3, w: 5, d: 6, rarities: ['epic', 'legendary'], sign: 'EPIC & LEGENDARY', color: '#b77bff', grass: '#b8d98a' },
  ];
  const white = toon('#ffffff');
  const pets = [];
  pens.forEach((pen) => {
    const grp = new THREE.Group();
    grp.position.set(pen.x, 0, pen.z);
    g.add(grp);
    add(grp, new THREE.PlaneGeometry(pen.w, pen.d), toon(pen.grass), { p: [0, 0.03, 0], r: [-Math.PI / 2, 0, 0], cast: false });
    // a few tufts, a water bowl and a ball in every pen
    for (let k = 0; k < 6; k++) add(grp, new THREE.ConeGeometry(0.08, 0.25, 4), toon('#6fb85a'), { p: [(((k * 37) % 10) / 10 - 0.5) * (pen.w - 1), 0.12, (((k * 53) % 10) / 10 - 0.5) * (pen.d - 1)], cast: false });
    add(grp, new THREE.CylinderGeometry(0.3, 0.24, 0.16, 16), toon(pen.color), { p: [pen.w / 2 - 0.6, 0.08, pen.d / 2 - 0.6], outline: true });
    add(grp, new THREE.CylinderGeometry(0.24, 0.24, 0.02, 16), toon('#8fd3ff'), { p: [pen.w / 2 - 0.6, 0.16, pen.d / 2 - 0.6], cast: false });
    add(grp, new THREE.SphereGeometry(0.18, 12, 10), toon('#ff5d73'), { p: [-pen.w / 2 + 0.8, 0.18, -pen.d / 2 + 0.8], outline: true });
    sign(g, pen.sign, { x: pen.x, z: pen.z + pen.d / 2, y: 3.4, w: 3.4, h: 0.8, bg: pen.color });
    const edge = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.45);
      for (let k = 0; k <= n; k++) add(grp, new THREE.BoxGeometry(0.12, 0.9, 0.06), white, { p: [x0 + ((x1 - x0) * k) / n, 0.45, z0 + ((z1 - z0) * k) / n], r: [0, Math.atan2(x1 - x0, z1 - z0), 0] });
      const rail = add(grp, new THREE.BoxGeometry(len, 0.08, 0.05), white, { p: [(x0 + x1) / 2, 0.65, (z0 + z1) / 2] });
      rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    };
    const hw = pen.w / 2, hd = pen.d / 2;
    edge(-hw, -hd, hw, -hd); edge(-hw, hd, hw, hd); edge(-hw, -hd, -hw, hd); edge(hw, -hd, hw, hd);
    solids.push({ x: pen.x, z: pen.z, w: pen.w + 0.2, d: pen.d + 0.2 });
    const kinds = PETS().filter((p) => pen.rarities.includes(p.rarity));
    kinds.forEach((it, i) => {
      const pet = buildPet(it.id);
      if (!pet) return;
      const p = { x: (Math.random() - 0.5) * (pen.w - 1.2), z: (Math.random() - 0.5) * (pen.d - 1.2) };
      pet.group.position.set(p.x, 0, p.z);
      pet.group.scale.setScalar(1.5);
      grp.add(pet.group);
      pets.push({ pet, pen, target: { ...p }, wait: Math.random() * 2, i });
    });
    stage.interactable({ x: pen.x, z: pen.z + hd + 1.1, r: 2.4, label: `meet the ${pen.rarities.join(' & ')} pets`, icon: 'shop', obj: grp,
      use: () => stage.openPanel({ wide: true, mount: (body) => wardrobe(body, { mode: 'shop', tab: 'pet' }) }) });
  });
  anim.push((t, dt) => {
    for (const q of pets) {
      const p = q.pet.group.position;
      const dx = q.target.x - p.x, dz = q.target.z - p.z, d = Math.hypot(dx, dz);
      const moving = d > 0.05 && q.wait <= 0;
      if (moving) {
        const step = Math.min(d, dt * 0.9);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        q.pet.group.rotation.y = Math.atan2(dx, dz);
      } else if ((q.wait -= dt) <= 0 && d <= 0.05) {
        q.target = { x: (Math.random() - 0.5) * (q.pen.w - 1.2), z: (Math.random() - 0.5) * (q.pen.d - 1.2) };
        q.wait = 1 + Math.random() * 3;
      }
      q.pet.tick(t + q.i, dt, moving);
    }
  });

  // the egg incubator: a glass dome with a speckled egg that wobbles under a warm lamp
  const inc = new THREE.Group();
  inc.position.set(-5, 0, 3.5);
  g.add(inc);
  add(inc, new THREE.CylinderGeometry(1.2, 1.4, 1.0, 24), toon('#ff8fc7'), { p: [0, 0.5, 0], outline: true });
  add(inc, new THREE.SphereGeometry(1.1, 24, 16, 0, TAU, 0, Math.PI / 2), toon('#dff4ff', { transparent: true, opacity: 0.35 }), { p: [0, 1.0, 0], cast: false });
  const egg = add(inc, new THREE.SphereGeometry(0.42, 20, 16), toon('#fff6e6'), { p: [0, 1.45, 0], s: [1, 1.3, 1], outline: true });
  [[0.2, 0.1, 0.3], [-0.25, 0.25, 0.2], [0.05, -0.2, 0.38], [-0.1, 0.05, -0.38]].forEach(([x, y, z]) => add(egg, new THREE.SphereGeometry(0.07, 8, 6), toon('#ff8fc7'), { p: [x, y, z], s: [1, 1, 0.4] }));
  const warm = new THREE.Sprite(additive(glowTexture, 0xffc070, 0.5));
  warm.scale.setScalar(3);
  warm.position.y = 1.5;
  inc.add(warm);
  anim.push((t) => { egg.rotation.z = Math.sin(t * 5) * 0.12 * (Math.sin(t * 0.8) > 0.4 ? 1 : 0.2); warm.material.opacity = 0.35 + Math.sin(t * 2) * 0.1; });
  solids.push({ x: -5, z: 3.5, r: 1.4 });
  sign(g, 'EGG INCUBATOR', { x: -5, z: 3.5, y: 3.6, w: 3.2, h: 0.75, bg: '#ff8fc7' });
  stage.interactable({ x: -5, z: 5.2, r: 2.4, label: 'hatch a pet egg', icon: 'shop', obj: inc,
    use: () => stage.openPanel({ mount: (body) => petEgg(body) }) });

  // counter + shopkeeper (with her own giraffe), pet beds and a bowl of treats
  counter(g, 6, 5, 4, '#ff8fc7');
  solids.push({ x: 6, z: 5, w: 4.2, d: 1.1 });
  sign(g, 'CHECKOUT', { x: 6, z: 5, y: 3.6, w: 2.6, h: 0.7, bg: '#ffb13b' });

  // shelves of pet food along the back wall
  const shelf = new THREE.Group();
  shelf.position.set(-2.5, 0, -8.6);
  g.add(shelf);
  add(shelf, new THREE.BoxGeometry(4.4, 2.4, 0.08), toon('#c28a4e'), { p: [0, 1.2, -0.26], outline: true });
  for (const sx of [-2.18, 2.18]) add(shelf, new THREE.BoxGeometry(0.08, 2.4, 0.6), toon('#a0703f'), { p: [sx, 1.2, 0], outline: true });
  add(shelf, new THREE.BoxGeometry(4.4, 0.1, 0.6), toon('#a0703f'), { p: [0, 2.4, 0] });
  const cans = ['#ff5d73', '#39c6ff', '#ffd84d', '#6ee7a0', '#b77bff'];
  for (const y of [0.5, 1.15, 1.8]) {
    add(shelf, new THREE.BoxGeometry(4.2, 0.06, 0.55), toon('#a0703f'), { p: [0, y - 0.22, 0.04] });
    for (let k = 0; k < 7; k++) {
      const c = cans[(k + Math.round(y * 4)) % cans.length];
      if ((k + Math.round(y * 2)) % 3 === 0) add(shelf, new THREE.BoxGeometry(0.42, 0.5, 0.3), toon(c), { p: [-1.8 + k * 0.6, y + 0.03, 0.1], outline: true }); // a bag
      else add(shelf, new THREE.CylinderGeometry(0.14, 0.14, 0.3, 12), toon(c), { p: [-1.8 + k * 0.6, y - 0.07, 0.1], cast: false }); // a can
    }
  }
  solids.push({ x: -2.5, z: -8.6, w: 4.5, d: 0.7 });
  sign(g, 'TREATS & TOYS', { x: -2.5, z: -8.2, y: 3.0, w: 3.0, h: 0.7, bg: '#ff9f43', hang: false });

  // a fish tank on a stand by the right wall, fish swimming back and forth
  const tank = new THREE.Group();
  tank.position.set(10.8, 0, 3);
  tank.rotation.y = -Math.PI / 2;
  g.add(tank);
  add(tank, new THREE.BoxGeometry(2.6, 1.0, 1.0), toon('#8b5a2b'), { p: [0, 0.5, 0], outline: true });
  add(tank, new THREE.BoxGeometry(2.4, 1.3, 0.9), toon('#7fd4ff', { transparent: true, opacity: 0.55 }), { p: [0, 1.66, 0], cast: false });
  add(tank, new THREE.BoxGeometry(2.4, 0.15, 0.9), toon('#f2d59b'), { p: [0, 1.08, 0], cast: false });
  const fish = [];
  for (let k = 0; k < 3; k++) fish.push(add(tank, new THREE.SphereGeometry(0.12, 10, 8), toon(['#ff9f43', '#ffd84d', '#ff5d73'][k]), { p: [0, 1.4 + k * 0.25, 0], s: [1.5, 1, 0.6], cast: false }));
  anim.push((t) => fish.forEach((f, k) => { const a = t * (0.6 + k * 0.2) + k * 2; f.position.x = Math.sin(a) * 0.9; f.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI; }));
  solids.push({ x: 10.8, z: 3, w: 1.1, d: 2.7 });

  // a cat tree in the corner
  const tree = new THREE.Group();
  tree.position.set(-10.3, 0, 1.2);
  g.add(tree);
  add(tree, new THREE.BoxGeometry(1.6, 0.2, 1.6), toon('#c9b7e8'), { p: [0, 0.1, 0], outline: true });
  add(tree, new THREE.CylinderGeometry(0.16, 0.16, 2.6, 10), toon('#e8d2a8'), { p: [0, 1.4, 0] });
  for (const [y, x] of [[1.1, 0.35], [1.9, -0.3], [2.7, 0.1]]) add(tree, new THREE.CylinderGeometry(0.55, 0.55, 0.14, 16), toon('#c9b7e8'), { p: [x, y, 0], outline: true });
  add(tree, new THREE.SphereGeometry(0.1, 8, 6), toon('#ff5d73'), { p: [0.6, 0.85, 0.2] });
  solids.push({ x: -10.3, z: 1.2, r: 0.9 });
  shopkeeper(g, { skin: '#c68642', hair: 'hair_pigtails', hairColor: '#6e4a2e', top: 'top_hoodie', topColor: '#ffd84d', eyes: 'eyes_sparkle', pet: 'pet_giraffe' }, 5, 3.9, anim);
  solids.push({ x: 5, z: 3.9, r: 0.6 }, { x: 6.2, z: 3.4, r: 0.6 });
  for (const [x, z, c] of [[-10, 6, '#7c6bff'], [-8, 7, '#39c6ff']]) {
    add(g, new THREE.TorusGeometry(0.7, 0.3, 10, 24), toon(c), { p: [x, 0.3, z], r: [Math.PI / 2, 0, 0], outline: true });
    add(g, new THREE.CylinderGeometry(0.7, 0.7, 0.15, 20), toon('#fff6e6'), { p: [x, 0.1, z] });
    solids.push({ x, z, r: 1 });
  }

  const walker = openWalker(stage, { w: W, d: D, solids });
  stage.onFrame((dt, now) => { for (const fn of anim) fn(now / 1000, dt); });
  stage.banner('<div class="big">🐾 Pet Shop</div>Meet the pets in their pens, or hatch a surprise egg!', 3000);
  return () => { walker.stop(); stage.scene?.remove(g); };
}
