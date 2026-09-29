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

/** A shop room: floor, walls (the ones between you and the camera hide), a doorway, lights. */
function room(stage, { w, d, floor, wall, trim, motif = null }) {
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
function sign(g, text, { x, z, y = 3.6, ry = 0, w = 3.2, h = 0.8, bg = '#2ed8c3', fg = '#ffffff', hang = true } = {}) {
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

function shopkeeper(g, look, x, z, anim) {
  const c = new Character({ ...DEFAULT_LOOK, ...look });
  c.root.position.set(x, 0, z);
  g.add(c.root);
  anim.push((t, dt) => c.update(dt, t, false));
  return c;
}

function counter(g, x, z, w, color) {
  add(g, new THREE.BoxGeometry(w, 1.1, 0.9), toon(color), { p: [x, 0.55, z], outline: true });
  add(g, new THREE.BoxGeometry(w + 0.2, 0.1, 1.1), toon('#ffffff'), { p: [x, 1.12, z] });
  add(g, new THREE.BoxGeometry(0.5, 0.4, 0.4), toon('#2b2f4a'), { p: [x + w / 2 - 0.5, 1.37, z] }); // till
}

function openWalker(stage, { w, d, solids }) {
  const walker = stage.walker({
    spawn: { x: 0, z: d / 2 - 2.5 }, speed: 5, solids,
    bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 },
    orbit: { yaw: 0, pitch: 0.65, dist: 12, maxDist: 18 },
  });
  walker.me.heading = Math.PI;
  stage.interactable({ x: 0, z: d / 2 - 0.8, r: 1.6, label: 'go back outside', use: () => stage.onExit?.() });
  return walker;
}

// ---------------------------------------------------------------------------
// The Style Shop
// ---------------------------------------------------------------------------

const DISPLAYS = [
  { tab: 'hat', label: 'browse hats', sign: 'HATS', color: '#ff9f43', look: { hat: 'hat_cowboy', top: 'top_hawaiian' } },
  { tab: 'top', label: 'browse tops', sign: 'TOPS', color: '#ff5d73', look: { top: 'top_jersey', topColor: '#ff5d73' } },
  { tab: 'bottom', label: 'browse bottoms', sign: 'BOTTOMS', color: '#3b82f6', look: { bottom: 'bottom_cargo', bottomColor: '#8b5a2b' } },
  { tab: 'face', label: 'browse glasses & masks', sign: 'GLASSES & MASKS', color: '#8b5cf6', look: { face: 'face_sunglasses' } },
  { tab: 'back', label: 'browse backpacks & wings', sign: 'BACKPACKS & WINGS', color: '#14b8a6', look: { back: 'back_wings' } },
  { tab: 'aura', label: 'browse auras', sign: 'AURAS', color: '#e879f9', look: { aura: 'aura_sparkle' } },
  { tab: 'hair', label: 'browse hairstyles', sign: 'HAIRSTYLES', color: '#f472b6', look: { hair: 'hair_quiff', hairColor: '#ff8fc7' } },
];

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
  stage.lights({ background: '#1a0f24', sky: 0xfff0f6, ground: 0x6a4a7a, hemi: 1.3, sun: 1.0, sunPos: [6, 30, 12], box: 16 });
  const W = 24, D = 18;
  const g = room(stage, { w: W, d: D, floor: ['#fff0f6', '#ffd6e8'], wall: '#ffe4f0', trim: '#2ed8c3',
    motif: (c) => { c.fillStyle = 'rgba(46,216,195,.35)'; for (const [x, y] of [[46, 40], [110, 168], [174, 40], [238, 168]]) { c.beginPath(); c.arc(x, y, 7, 0, TAU); c.fill(); } } });
  stage.scene.add(g);
  const anim = [];
  const solids = [];
  const shop = (tab) => () => stage.openPanel({ wide: true, mount: (body) => wardrobe(body, { mode: 'shop', tab }) });

  // mannequins on round plinths, around the walls
  const spots = [[-9.5, -6], [-5, -7], [0, -7], [5, -7], [9.5, -6], [-10, 1], [10, 1]];
  DISPLAYS.forEach((dsp, i) => {
    const [x, z] = spots[i];
    const stand = new THREE.Group();
    stand.position.set(x, 0, z);
    g.add(stand);
    add(stand, new THREE.CylinderGeometry(1.0, 1.1, 0.35, 28), toon('#ffffff'), { p: [0, 0.18, 0], outline: true });
    add(stand, new THREE.CylinderGeometry(1.02, 1.02, 0.08, 28), toon('#2ed8c3'), { p: [0, 0.36, 0] });
    const c = new Character({ ...DEFAULT_LOOK, skin: '#e8e2f4', hair: 'hair_none', hairColor: '#e8e2f4', eyes: 'eyes_happy', ...dsp.look });
    c.root.position.y = 0.4;
    c.root.rotation.y = Math.atan2(-x, D / 2 - 2 - z) * 0.6;
    stand.add(c.root);
    anim.push((t, dt) => { c.update(dt, t + i, false); c.root.rotation.y += Math.sin(t * 0.6 + i) * 0.002; });
    solids.push({ x, z, r: 1.1 });
    stage.interactable({ x, z: z + 1.2, r: 2.2, label: dsp.label, icon: 'shop', obj: stand, use: shop(dsp.tab) });
    // the area's sign hangs over it, turned to face the middle of the room
    sign(g, dsp.sign, { x, z, y: 3.7, ry: Math.atan2(-x, 3 - z), w: dsp.sign.length > 10 ? 3.4 : 2.4, h: 0.75, bg: dsp.color });
    add(stand, new THREE.CylinderGeometry(1.03, 1.03, 0.1, 28), toon(dsp.color), { p: [0, 0.3, 0], cast: false });
  });

  // wall shelves of folded clothes and a rack of shirts
  const tees = ['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#b77bff', '#ff9f43'];
  clothesShelf(g, -2.5, -8.6, 0, tees);
  clothesShelf(g, 2.5, -8.6, 0, tees.slice().reverse());
  clothesShelf(g, -11.6, -2.5, Math.PI / 2, tees);
  clothesShelf(g, 11.6, -2.5, -Math.PI / 2, tees);
  solids.push({ x: -2.5, z: -8.6, w: 2.7, d: 0.7 }, { x: 2.5, z: -8.6, w: 2.7, d: 0.7 }, { x: -11.6, z: -2.5, w: 0.7, d: 2.7 }, { x: 11.6, z: -2.5, w: 0.7, d: 2.7 });
  clothesRack(g, -9, 4.5, 0.3, ['#ff5d73', '#ff8fa3', '#ffd84d', '#39c6ff', '#7c6bff']);
  solids.push({ x: -9, z: 4.5, w: 2.5, d: 1.2 });

  // the crate machine: a big gift box that bounces and glows
  const machine = new THREE.Group();
  machine.position.set(-4, 0, 1.5);
  g.add(machine);
  add(machine, new THREE.CylinderGeometry(1.4, 1.5, 0.5, 24), toon('#7c6bff'), { p: [0, 0.25, 0], outline: true });
  const gift = new THREE.Group();
  gift.position.y = 1.5;
  machine.add(gift);
  add(gift, new THREE.BoxGeometry(1.4, 1.2, 1.4), toon('#ff5d73'), { outline: true });
  add(gift, new THREE.BoxGeometry(1.5, 0.3, 1.5), toon('#ff8fa3'), { p: [0, 0.7, 0], outline: true });
  add(gift, new THREE.BoxGeometry(0.25, 1.52, 1.52), toon('#ffd84d'), {});
  add(gift, new THREE.BoxGeometry(1.52, 1.52, 0.25), toon('#ffd84d'), {});
  for (const s of [-1, 1]) add(gift, new THREE.TorusGeometry(0.25, 0.08, 8, 16), toon('#ffd84d'), { p: [s * 0.22, 1.0, 0], r: [0, 0, s * 0.6] });
  const glow = new THREE.Sprite(additive(glowTexture, 0xffd84d, 0.5));
  glow.scale.setScalar(4);
  glow.position.y = 1.5;
  machine.add(glow);
  anim.push((t) => { gift.position.y = 1.5 + Math.abs(Math.sin(t * 2.2)) * 0.25; gift.rotation.y = t * 0.6; glow.material.opacity = 0.35 + Math.sin(t * 3) * 0.15; });
  solids.push({ x: -4, z: 1.5, r: 1.5 });
  stage.interactable({ x: -4, z: 3.2, r: 2.4, label: 'open a mystery crate', icon: 'shop', obj: machine, use: shop('crates') });
  sign(g, 'MYSTERY CRATES', { x: -4, z: 1.5, y: 3.9, w: 3.4, h: 0.75, bg: '#7c6bff' });

  // the big mirror: your own wardrobe
  const mirror = new THREE.Group();
  mirror.position.set(4, 0, 1.5);
  g.add(mirror);
  add(mirror, new THREE.BoxGeometry(2.4, 3.6, 0.3), toon('#ffc53d'), { p: [0, 1.9, 0], outline: true });
  add(mirror, new THREE.BoxGeometry(2.0, 3.2, 0.32), toon('#cfe9ff', { emissive: '#9fd0ff', emissiveIntensity: 0.35 }), { p: [0, 1.9, 0.01] });
  add(mirror, new THREE.BoxGeometry(0.3, 2.6, 0.34), toon('#ffffff', { transparent: true, opacity: 0.5 }), { p: [-0.4, 2.0, 0.02], r: [0, 0, 0.4], cast: false });
  add(mirror, new THREE.BoxGeometry(2.6, 0.3, 0.8), toon('#ffc53d'), { p: [0, 0.15, 0] });
  solids.push({ x: 4, z: 1.5, w: 2.6, d: 0.8 });
  stage.interactable({ x: 4, z: 2.8, r: 2.2, label: 'change your outfit', icon: 'wardrobe', obj: mirror, use: () => stage.openPanel({ wide: true, mount: (body) => wardrobe(body) }) });
  sign(g, 'FITTING MIRROR', { x: 4, z: 1.5, y: 4.2, w: 3.2, h: 0.7, bg: '#ffb13b' });

  // counter + shopkeeper, plants, a rug
  counter(g, 8, 5.5, 4, '#2ed8c3');
  solids.push({ x: 8, z: 5.5, w: 4.2, d: 1.1 });
  shopkeeper(g, { skin: '#f6c9a0', hair: 'hair_bob', hairColor: '#ff8fc7', top: 'top_suit', topColor: '#e57bff', eyes: 'eyes_lashes', face: 'face_glasses' }, 8, 4.4, anim);
  solids.push({ x: 8, z: 4.4, r: 0.6 });
  sign(g, 'CHECKOUT', { x: 8, z: 5.5, y: 3.6, w: 2.6, h: 0.7, bg: '#2ed8c3' });
  // a round rug with a white trim
  add(g, new THREE.CircleGeometry(3.4, 40), toon('#ffffff'), { p: [0, 0.015, -1], r: [-Math.PI / 2, 0, 0], cast: false });
  add(g, new THREE.CircleGeometry(3.1, 40), toon('#ff8fc7'), { p: [0, 0.02, -1], r: [-Math.PI / 2, 0, 0], cast: false });
  add(g, new THREE.RingGeometry(2.2, 2.4, 40), toon('#ffffff'), { p: [0, 0.025, -1], r: [-Math.PI / 2, 0, 0], cast: false });
  for (const [x, z] of [[-11, 7.5], [11, 7.5]]) {
    add(g, new THREE.CylinderGeometry(0.45, 0.35, 0.8, 14), toon('#ffffff'), { p: [x, 0.4, z], outline: true });
    add(g, new THREE.IcosahedronGeometry(0.8, 1), toon('#2f9e44'), { p: [x, 1.4, z], outline: true });
    solids.push({ x, z, r: 0.6 });
  }

  const walker = openWalker(stage, { w: W, d: D, solids });
  stage.onFrame((dt, now) => { for (const fn of anim) fn(now / 1000, dt); });
  stage.banner('<div class="big">👕 Style Shop</div>Walk up to a mannequin and press <kbd>E</kbd> to shop.', 3000);
  return () => { walker.stop(); stage.scene?.remove(g); };
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
