// Boss Cave (3D): a co-op dungeon climb. Every run starts on floor 1; clear the monsters, everyone picks
// an upgrade, and the group goes deeper. Every 3rd floor is a boss. The server runs the monsters, the
// bosses and the run; each player dodges and reports their own hits (like the arena).
// WASD move · mouse aim · click shoot · Space/Shift dash (invulnerable mid-dash).
// Game logic runs in cave pixels (900 x 600, like the server); 20 px = 1 world unit.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf, colorOf, fmt } from '../state.js';
import { ITEMS, CATALOG } from '../catalog.js';
import { toon, basic, canvasTexture, outlineMaterial, additive, glowTexture, flameTexture, TAU } from '../three/materials.js';
import { Sparks, FloatText, orb, groundRing, groundDisc } from '../three/fx.js';
import { sfx, ambient } from '../sfx.js';
import { listen, confetti, CROSSHAIR } from './util.js';

const W = 900, H = 600, K = 20, PR = 14, BULLET_SPEED = 680, BULLET_LIFE = 1.1, MOVE_SPEED = 250;
const DASH_TIME = 0.18, DASH_SPEED = 820, DASH_COOLDOWN = 1.2;
const REVIVE_R = 60;
const FURN = Object.fromEntries(CATALOG.furniture.map((f) => [f.id, f]));
const THEMES = {
  slime: { floor: ['#3d7050', '#1b3a2a'], crystal: '#8dff9a', rock: '#3f6b4c', orb: '#3fcf5a', fog: '#10261a' },
  golem: { floor: ['#66637e', '#302e45'], crystal: '#ffb45a', rock: '#6d6a85', orb: '#ff8c2e', fog: '#1a1826' },
  venom: { floor: ['#3d4a2a', '#141a0c'], crystal: '#9dff5a', rock: '#4a5a2e', orb: '#7dff3a', fog: '#0e140a' },
  lich: { floor: ['#34485a', '#0e1820'], crystal: '#7dffd0', rock: '#3b4a58', orb: '#5dffb0', fog: '#081418' },
  dragon: { floor: ['#4a2b66', '#170b26'], crystal: '#c77dff', rock: '#4b2d66', orb: '#d23cff', fog: '#140820' },
};
const BOSS_EMOJI = { slime: '🟢', golem: '🗿', venom: '🕷️', lich: '💀', dragon: '🐉' };
const POISON = '#8dff3a';
// elemental rounds: bullet colour, and the tint an enemy takes while it's burning / chilled / poisoned
const FX_COLOR = { burn: '#ff7a2e', chill: '#8fe3ff', venom: '#8dff3a' };
const bulletColor = (u, fallback) => (u.fire ? '#ff7a2e' : u.ice ? '#8fe3ff' : u.venom ? '#8dff3a' : fallback);
const UPGRADE_EMOJI = { antidote: '🧪', dmg: '💥', rate: '⚡', multi: '🔱', speed: '👟', heart: '❤️', heal: '🩹', crit: '🍀', pierce: '🏹', dash: '💨', shield: '🫧', regen: '🍗', revive: '🌀', big: '🔵' };
const UPGRADE_NAME = { dmg: 'Power Shot', rate: 'Rapid Fire', multi: 'Split Shot', speed: 'Swift Boots', heart: 'Vitality', antidote: 'Antidote', heal: 'Full Heal', crit: 'Lucky Shots', pierce: 'Piercing Rounds', dash: 'Quick Dash', shield: 'Bubble Shield', regen: 'Second Breakfast', revive: 'Second Wind', big: 'Big Bullets' };
const to3 = (x, y) => [(x - W / 2) / K, (y - H / 2) / K];
const OUT = outlineMaterial(0.05);

function add(parent, geo, mat, { p = [0, 0, 0], r = null, s = null, outline = true, cast = true } = {}) {
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

// ---------------------------------------------------------------------------
// the cave
// ---------------------------------------------------------------------------

const floors = {};
function floorTex(id) {
  const th = THEMES[id];
  return (floors[id] ||= canvasTexture(512, 342, (ctx) => {
    const g = ctx.createRadialGradient(256, 171, 30, 256, 171, 340);
    g.addColorStop(0, th.floor[0]);
    g.addColorStop(1, th.floor[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 342);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.14)';
      ctx.beginPath(); ctx.arc(rnd() * 512, rnd() * 342, 1 + rnd() * 3, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      let x = rnd() * 512, y = rnd() * 342;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }));
}

let env = null;
function buildCave() {
  const g = new THREE.Group();
  const floorMat = new THREE.MeshToonMaterial({ map: floorTex('slime') });
  add(g, new THREE.PlaneGeometry(W / K, H / K), floorMat, { r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
  const outerMat = new THREE.MeshBasicMaterial({ color: '#120c1c' });
  add(g, new THREE.PlaneGeometry(900, 900), outerMat, { p: [0, -0.03, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
  const rockMat = toon('#4a4560');
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const W2 = W / K / 2, H2 = H / K / 2;
  for (let i = 0; i < 70; i++) {
    const side = i % 4, t = rnd();
    const x = side < 2 ? -W2 - 1 + t * (W2 * 2 + 2) : side === 2 ? -W2 - 1.5 - rnd() * 2 : W2 + 1.5 + rnd() * 2;
    const z = side >= 2 ? -H2 - 1 + t * (H2 * 2 + 2) : side === 0 ? -H2 - 1.5 - rnd() * 2 : H2 + 1.5 + rnd() * 2;
    const s = 1.2 + rnd() * 2.2;
    add(g, rockGeo, rockMat, { p: [x, s * 0.5, z], r: [rnd() * 3, rnd() * 3, rnd() * 3], s: [s, s * (0.8 + rnd()), s], outline: false });
  }
  const crystalMat = new THREE.MeshBasicMaterial({ color: '#8dff9a' });
  const glowMat = additive(glowTexture, 0x8dff9a, 0.5);
  for (let i = 0; i < 14; i++) {
    const side = i % 4, t = (i + 0.5) / 14;
    const x = side < 2 ? -W2 + t * W2 * 2 : side === 2 ? -W2 - 0.4 : W2 + 0.4;
    const z = side >= 2 ? -H2 + t * H2 * 2 : side === 0 ? -H2 - 0.4 : H2 + 0.4;
    const c = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      add(c, new THREE.ConeGeometry(0.25 + k * 0.05, 1.2 + k * 0.5, 5), crystalMat, { p: [(k - 1) * 0.3, 0.6 + k * 0.25, 0], r: [0, 0, (k - 1) * 0.35], outline: false, cast: false });
    }
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(3);
    glow.position.y = 1;
    c.add(glow);
    c.position.set(x, 0, z);
    g.add(c);
  }
  const lights = [0, 1, 2].map((i) => {
    const l = new THREE.PointLight(0x8dff9a, 30, 26, 1.6);
    l.position.set(-14 + i * 14, 5, -8 + (i % 2) * 16);
    g.add(l);
    return l;
  });
  return { group: g, floorMat, crystalMat, glowMat, lights, outerMat };
}

function theme(id) {
  const th = THEMES[id] ?? THEMES.slime;
  env.floorMat.map = floorTex(id in THEMES ? id : 'slime');
  env.floorMat.needsUpdate = true;
  env.crystalMat.color.set(th.crystal);
  env.glowMat.color.set(th.crystal);
  env.lights.forEach((l) => l.color.set(th.crystal));
  return th;
}

// ---------------------------------------------------------------------------
// boss models (feet at the origin, facing +Z, sized from the boss radius in units)
// ---------------------------------------------------------------------------

function eyes(parent, y, z, spread, size, pupil = '#1d1b2e') {
  for (const s of [-1, 1]) {
    const e = add(parent, new THREE.SphereGeometry(size, 16, 12), basic('#ffffff'), { p: [s * spread, y, z], outline: false });
    add(e, new THREE.SphereGeometry(size * 0.5, 12, 10), basic(pupil), { p: [0, 0, size * 0.75], outline: false });
  }
}

function buildSlime(r) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const mat = new THREE.MeshToonMaterial({ color: '#55d86a', transparent: true, opacity: 0.93 });
  add(body, new THREE.SphereGeometry(r, 36, 26), mat, { p: [0, r * 0.85, 0], s: [1.12, 0.95, 1.12] });
  add(body, new THREE.SphereGeometry(r * 0.2, 12, 10), basic('#ffffff', { transparent: true, opacity: 0.5 }), { p: [-r * 0.45, r * 1.4, r * 0.55], s: [1, 1.6, 0.6], outline: false });
  eyes(body, r * 1.05, r * 0.9, r * 0.32, r * 0.2);
  add(body, new THREE.TorusGeometry(r * 0.22, r * 0.05, 8, 20, Math.PI), basic('#2a0f14'), { p: [0, r * 0.62, r * 1.0], r: [0, 0, Math.PI], outline: false });
  const gold = toon('#ffc53d');
  add(body, new THREE.CylinderGeometry(r * 0.42, r * 0.46, r * 0.3, 16, 1, true), toon('#ffc53d', { side: THREE.DoubleSide }), { p: [0, r * 1.78, 0] });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    add(body, new THREE.ConeGeometry(r * 0.1, r * 0.35, 6), gold, { p: [Math.sin(a) * r * 0.42, r * 2.0, Math.cos(a) * r * 0.42] });
  }
  add(body, new THREE.SphereGeometry(r * 0.08, 10, 8), toon('#e0463c'), { p: [0, r * 1.8, r * 0.44], outline: false });
  return {
    g, mats: [mat],
    tick(t, o) {
      const sq = Math.sin(t * 5) * 0.05 + o.squash;
      body.scale.set(1 + sq, 1 - sq, 1 + sq);
      mat.color.set(o.enraged ? '#ff6b5d' : '#55d86a');
    },
  };
}

function buildVenom(r) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const shell = new THREE.MeshToonMaterial({ color: '#6a2f8a' });
  const glow = new THREE.MeshBasicMaterial({ color: POISON });
  add(body, new THREE.SphereGeometry(r * 0.75, 28, 20), shell, { p: [0, r * 1.0, -r * 0.55], s: [1, 0.85, 1.2] });
  for (let i = 0; i < 4; i++) add(body, new THREE.SphereGeometry(r * 0.12, 10, 8), glow, { p: [(i % 2 ? 1 : -1) * r * 0.25, r * (1.35 + (i > 1 ? 0.2 : 0)), -r * (0.35 + i * 0.15)], s: [1, 0.5, 1], outline: false });
  add(body, new THREE.SphereGeometry(r * 0.5, 24, 18), shell, { p: [0, r * 0.95, r * 0.4] });
  const crown = toon('#8dff3a');
  for (let i = 0; i < 3; i++) add(body, new THREE.ConeGeometry(r * 0.08, r * 0.3, 6), crown, { p: [(i - 1) * r * 0.18, r * 1.5, r * 0.4] });
  eyes(body, r * 1.05, r * 0.82, r * 0.18, r * 0.12, '#1a0a20');
  for (const s of [-1, 1]) add(body, new THREE.ConeGeometry(r * 0.07, r * 0.35, 6), toon('#e8e0ff'), { p: [s * r * 0.14, r * 0.62, r * 0.82], r: [Math.PI, 0, 0], outline: false });
  const legs = [];
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const leg = new THREE.Group();
    leg.position.set(s * r * 0.35, r * 0.95, r * (0.55 - i * 0.3));
    leg.rotation.y = s * (0.3 - i * 0.35);
    body.add(leg);
    add(leg, new THREE.CylinderGeometry(r * 0.06, r * 0.05, r * 0.9, 8), new THREE.MeshToonMaterial({ color: '#3a1a4a' }), { p: [s * r * 0.35, r * 0.1, 0], r: [0, 0, s * -1.1] });
    add(leg, new THREE.CylinderGeometry(r * 0.05, r * 0.02, r * 1.0, 8), new THREE.MeshToonMaterial({ color: '#3a1a4a' }), { p: [s * r * 0.82, -r * 0.45, 0], r: [0, 0, s * 0.35] });
    legs.push({ leg, i, s });
  }
  const aura = new THREE.Sprite(additive(glowTexture, 0x8dff3a, 0.35));
  aura.scale.setScalar(r * 0.09);
  aura.position.set(0, r * 1.1, -r * 0.5);
  body.add(aura);
  return {
    g, mats: [shell],
    tick(t, o) {
      const walk = o.moving ? 12 : 3;
      legs.forEach(({ leg, i, s }) => { leg.rotation.x = Math.sin(t * walk + i * 1.7 + (s > 0 ? Math.PI : 0)) * 0.25; });
      const sq = Math.sin(t * 3) * 0.03 + o.squash;
      body.scale.set(1 + sq, 1 - sq, 1 + sq);
      shell.color.set(o.enraged ? '#a8307a' : '#6a2f8a');
      aura.material.opacity = 0.25 + Math.sin(t * 4) * 0.1;
    },
  };
}

function buildGolem(r) {
  const g = new THREE.Group();
  const stone = new THREE.MeshToonMaterial({ color: '#8d8aa6' });
  const dark = toon('#5f5c7a');
  const rune = new THREE.MeshBasicMaterial({ color: '#ffb45a' });
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group();
    leg.position.set(s * r * 0.4, r * 0.9, 0);
    add(leg, new THREE.BoxGeometry(r * 0.5, r * 0.9, r * 0.55), dark, { p: [0, -r * 0.45, 0] });
    g.add(leg);
    return leg;
  });
  const torso = add(g, new THREE.BoxGeometry(r * 1.6, r * 1.2, r * 1.0), stone, { p: [0, r * 1.5, 0] });
  add(torso, new THREE.BoxGeometry(r * 0.12, r * 0.7, 0.05), rune, { p: [0, 0, r * 0.51], outline: false });
  add(torso, new THREE.BoxGeometry(r * 0.6, r * 0.12, 0.05), rune, { p: [0, r * 0.15, r * 0.51], outline: false });
  add(g, new THREE.SphereGeometry(r * 0.3, 10, 8), toon('#5b8f4a'), { p: [-r * 0.45, r * 2.1, r * 0.1], s: [1.4, 0.4, 1], outline: false });
  const arms = [-1, 1].map((s) => {
    const arm = new THREE.Group();
    arm.position.set(s * r * 1.0, r * 1.95, 0);
    add(arm, new THREE.BoxGeometry(r * 0.45, r * 1.1, r * 0.5), stone, { p: [0, -r * 0.5, 0] });
    add(arm, new THREE.DodecahedronGeometry(r * 0.35, 0), dark, { p: [0, -r * 1.1, 0] });
    g.add(arm);
    return arm;
  });
  const head = add(g, new THREE.BoxGeometry(r * 0.85, r * 0.65, r * 0.75), stone, { p: [0, r * 2.4, 0] });
  const eyesM = [-1, 1].map((s) => add(head, new THREE.BoxGeometry(r * 0.18, r * 0.1, 0.05), rune, { p: [s * r * 0.2, r * 0.05, r * 0.38], outline: false }));
  const glow = new THREE.Sprite(additive(glowTexture, 0xffb45a, 0.6));
  glow.scale.setScalar(r * 1.2);
  glow.position.set(0, r * 1.5, r * 0.6);
  g.add(glow);
  return {
    g, mats: [stone],
    tick(t, o) {
      rune.color.set(o.enraged ? '#ff3b2a' : '#ffb45a');
      glow.material.color.set(o.enraged ? 0xff3b2a : 0xffb45a);
      const walk = o.moving ? Math.sin(t * 5) : 0;
      legs[0].rotation.x = walk * 0.4;
      legs[1].rotation.x = -walk * 0.4;
      arms.forEach((a, i) => { a.rotation.x = o.charging ? -1.4 : Math.sin(t * 2.2 + i * Math.PI) * 0.3; });
      eyesM.forEach((e) => { e.scale.y = o.enraged ? 0.5 : 1; });
    },
  };
}

function buildDragon(r) {
  const g = new THREE.Group();
  const purple = new THREE.MeshToonMaterial({ color: '#8c5ad6' });
  const belly = toon('#f0c8ff');
  add(g, new THREE.SphereGeometry(r * 0.8, 24, 18), purple, { p: [0, r * 1.1, 0], s: [1, 1.05, 1.2] });
  add(g, new THREE.SphereGeometry(r * 0.55, 18, 14), belly, { p: [0, r * 0.95, r * 0.4], s: [1, 1.2, 0.8], outline: false });
  for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(r * 0.25, 12, 10), purple, { p: [s * r * 0.45, r * 0.25, r * 0.2], s: [1, 0.8, 1.4] });
  const neck = add(g, new THREE.CylinderGeometry(r * 0.28, r * 0.4, r * 0.8, 14), purple, { p: [0, r * 1.9, r * 0.3], r: [0.3, 0, 0] });
  const head = new THREE.Group();
  head.position.set(0, r * 2.4, r * 0.55);
  g.add(head);
  add(head, new THREE.SphereGeometry(r * 0.45, 20, 16), purple, { s: [1, 0.9, 1.1] });
  add(head, new THREE.SphereGeometry(r * 0.3, 16, 12), purple, { p: [0, -r * 0.08, r * 0.4], s: [1, 0.7, 1.1] });
  for (const s of [-1, 1]) {
    add(head, new THREE.ConeGeometry(r * 0.1, r * 0.55, 8), toon('#f4ecd8'), { p: [s * r * 0.22, r * 0.45, -r * 0.1], r: [-0.4, 0, -s * 0.3] });
    add(head, new THREE.SphereGeometry(r * 0.08, 10, 8), basic('#ffe066'), { p: [s * r * 0.2, r * 0.1, r * 0.35], outline: false });
  }
  const mouth = new THREE.Sprite(additive(glowTexture, 0xff5dac, 0.8));
  mouth.scale.setScalar(r * 0.6);
  mouth.position.set(0, -r * 0.1, r * 0.75);
  head.add(mouth);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(r * 1.9, r * 1.0);
  wingShape.quadraticCurveTo(r * 1.6, r * 0.2, r * 1.8, -r * 0.3);
  wingShape.quadraticCurveTo(r * 1.2, 0, r * 1.1, -r * 0.5);
  wingShape.quadraticCurveTo(r * 0.7, -r * 0.1, r * 0.4, -r * 0.5);
  wingShape.closePath();
  const wingGeo = new THREE.ShapeGeometry(wingShape);
  const wingMat = toon('#6a3fb5', { side: THREE.DoubleSide });
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(s * r * 0.4, r * 1.6, -r * 0.3);
    const m = add(w, wingGeo, wingMat, { s: [s, 1, 1], outline: false });
    m.rotation.y = s * 0.3;
    g.add(w);
    return w;
  });
  const tail = [];
  for (let i = 0; i < 6; i++) tail.push(add(g, new THREE.SphereGeometry(r * (0.32 - i * 0.04), 12, 10), purple, { p: [0, r * (0.6 - i * 0.05), -r * (0.8 + i * 0.35)], outline: false }));
  add(tail[5], new THREE.ConeGeometry(r * 0.15, r * 0.4, 4), toon('#ff5dac'), { p: [0, 0, -r * 0.2], r: [-Math.PI / 2, 0, 0], outline: false });
  return {
    g, mats: [purple],
    tick(t, o) {
      const flap = Math.sin(t * (o.lift ? 12 : 5));
      wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.2 + flap * 0.45); });
      tail.forEach((seg, i) => { seg.position.x = Math.sin(t * 2.4 - i * 0.6) * r * 0.12 * i; });
      purple.color.set(o.enraged ? '#b54dff' : '#8c5ad6');
      mouth.material.opacity = o.charging ? 0.9 : 0.2;
      neck.rotation.x = 0.3 + Math.sin(t * 1.5) * 0.06;
    },
  };
}

function buildLich(r) {
  const g = new THREE.Group();
  const robe = new THREE.MeshToonMaterial({ color: '#3a2a5c' });
  const bone = toon('#f1ead8');
  const glowGreen = basic('#8dff9a');
  const body = new THREE.Group();
  g.add(body);
  add(body, new THREE.ConeGeometry(r * 0.75, r * 1.9, 20, 1, true), toon('#3a2a5c', { side: THREE.DoubleSide }), { p: [0, r * 1.15, 0] });
  add(body, new THREE.SphereGeometry(r * 0.5, 18, 14), robe, { p: [0, r * 1.75, 0], s: [1.1, 0.8, 1] });
  const skull = add(body, new THREE.SphereGeometry(r * 0.38, 20, 16), bone, { p: [0, r * 2.25, r * 0.05], s: [1, 1.08, 1] });
  add(skull, new THREE.BoxGeometry(r * 0.4, r * 0.18, r * 0.3), bone, { p: [0, -r * 0.3, r * 0.1] });
  for (const s of [-1, 1]) {
    add(skull, new THREE.SphereGeometry(r * 0.1, 10, 8), basic('#120a1c'), { p: [s * r * 0.14, r * 0.02, r * 0.32], outline: false });
    add(skull, new THREE.SphereGeometry(r * 0.05, 8, 6), glowGreen, { p: [s * r * 0.14, r * 0.02, r * 0.38], outline: false });
  }
  // the hood is open at the front so the skull shows
  const hood = add(body, new THREE.SphereGeometry(r * 0.5, 18, 12, Math.PI / 2 + 0.95, TAU - 1.9, 0, 2.1), robe, { p: [0, r * 2.3, -r * 0.08], s: [1, 1.1, 1.05] });
  hood.material.side = THREE.DoubleSide;
  for (const s of [-1, 1]) add(body, new THREE.ConeGeometry(r * 0.08, r * 0.4, 6), toon('#ffc53d'), { p: [s * r * 0.3, r * 2.8, 0], r: [0, 0, -s * 0.3] });
  // staff with a floating soul gem
  const staff = new THREE.Group();
  staff.position.set(r * 0.75, r * 1.2, r * 0.3);
  body.add(staff);
  add(staff, new THREE.CylinderGeometry(r * 0.05, r * 0.06, r * 2.4, 8), toon('#6b4a2b'), { p: [0, r * 0.4, 0] });
  const gem = add(staff, new THREE.OctahedronGeometry(r * 0.2), glowGreen, { p: [0, r * 1.8, 0], outline: false });
  const gemGlow = new THREE.Sprite(additive(glowTexture, 0x8dff9a, 0.8));
  gemGlow.scale.setScalar(r * 1.4);
  gem.add(gemGlow);
  const hands = [-1, 1].map((s) => add(body, new THREE.SphereGeometry(r * 0.12, 10, 8), bone, { p: [s * r * 0.7, r * 1.3, r * 0.3] }));
  return {
    g, mats: [robe],
    tick(t, o) {
      body.position.y = r * 0.25 + Math.sin(t * 2) * r * 0.12; // it floats
      gem.rotation.y = t * 2;
      gemGlow.material.opacity = o.charging ? 1 : 0.55 + Math.sin(t * 4) * 0.2;
      glowGreen.color.set(o.enraged ? '#ff5dac' : '#8dff9a');
      gemGlow.material.color.set(o.enraged ? 0xff5dac : 0x8dff9a);
      hands[0].position.y = r * (1.3 + (o.charging ? 0.8 : Math.sin(t * 3) * 0.08));
      staff.rotation.z = o.charging ? -0.3 : Math.sin(t * 1.5) * 0.08;
    },
  };
}

const BUILD = { slime: buildSlime, golem: buildGolem, venom: buildVenom, dragon: buildDragon, lich: buildLich };

// ---------------------------------------------------------------------------
// monsters (feet at the origin, facing +Z)
// ---------------------------------------------------------------------------

const MOB_R = { bat: 14, slimelet: 16, skeleton: 15, archer: 15, wisp: 16, brute: 24, toad: 17 };
const MOB_NAME = { bat: 'Bat', slimelet: 'Slimelet', skeleton: 'Skeleton', archer: 'Skeleton Archer', wisp: 'Wisp', brute: 'Brute', toad: 'Poison Toad' };

function skeletonBody(g, hood) {
  const bone = toon('#f1ead8');
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.14, 0.55, 0);
    add(leg, new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), bone, { p: [0, -0.26, 0] });
    g.add(leg);
    return leg;
  });
  add(g, new THREE.BoxGeometry(0.4, 0.45, 0.22), hood ? toon('#3b3a58') : bone, { p: [0, 0.82, 0] });
  if (!hood) for (let i = 0; i < 3; i++) add(g, new THREE.BoxGeometry(0.42, 0.04, 0.24), toon('#c9c1ad'), { p: [0, 0.72 + i * 0.1, 0], outline: false });
  const skull = add(g, new THREE.SphereGeometry(0.22, 14, 12), bone, { p: [0, 1.22, 0] });
  for (const s of [-1, 1]) add(skull, new THREE.SphereGeometry(0.06, 8, 6), basic('#1a0f14'), { p: [s * 0.08, 0.02, 0.18], outline: false });
  if (hood) add(g, new THREE.ConeGeometry(0.3, 0.55, 12), toon('#3b3a58'), { p: [0, 1.35, -0.04] });
  const arms = [-1, 1].map((s) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.26, 1.0, 0);
    add(arm, new THREE.CylinderGeometry(0.045, 0.045, 0.45, 6), bone, { p: [0, -0.22, 0] });
    g.add(arm);
    return arm;
  });
  return { legs, arms };
}

function buildMob(kind) {
  const g = new THREE.Group();
  const mats = [];
  let tick = () => {};
  if (kind === 'bat') {
    const body = new THREE.Group();
    body.position.y = 1.3;
    g.add(body);
    const fur = new THREE.MeshToonMaterial({ color: '#6a4494' });
    mats.push(fur);
    add(body, new THREE.SphereGeometry(0.4, 14, 12), fur);
    for (const s of [-1, 1]) {
      add(body, new THREE.ConeGeometry(0.08, 0.2, 6), fur, { p: [s * 0.14, 0.3, 0], r: [0, 0, -s * 0.3] });
      add(body, new THREE.SphereGeometry(0.06, 8, 6), basic('#ff3b50'), { p: [s * 0.1, 0.06, 0.26], outline: false });
    }
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.lineTo(1.0, 0.35); wingShape.lineTo(0.88, -0.07); wingShape.lineTo(0.64, 0.03);
    wingShape.lineTo(0.46, -0.17); wingShape.lineTo(0.26, -0.03); wingShape.closePath();
    const wingGeo = new THREE.ShapeGeometry(wingShape);
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Group();
      w.position.set(s * 0.2, 0.05, 0);
      add(w, wingGeo, toon('#51307a', { side: THREE.DoubleSide }), { s: [s, 1, 1], r: [Math.PI / 2, 0, 0], outline: false });
      body.add(w);
      return w;
    });
    tick = (t) => {
      wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(t * 16) * 0.7; });
      body.position.y = 1.3 + Math.sin(t * 5) * 0.12;
    };
  } else if (kind === 'slimelet') {
    const mat = new THREE.MeshToonMaterial({ color: '#7be08a', transparent: true, opacity: 0.92 });
    mats.push(mat);
    const body = new THREE.Group();
    g.add(body);
    add(body, new THREE.SphereGeometry(0.42, 18, 14), mat, { p: [0, 0.36, 0], s: [1.1, 0.85, 1.1] });
    eyes(body, 0.45, 0.35, 0.14, 0.09);
    tick = (t, o) => {
      const hop = Math.max(0, Math.sin(t * 5.7));
      body.position.y = hop * 0.45;
      body.scale.set(1 + (1 - hop) * 0.12, 1 - (1 - hop) * 0.12, 1 + (1 - hop) * 0.12);
    };
  } else if (kind === 'skeleton' || kind === 'archer') {
    const hood = kind === 'archer';
    const { legs, arms } = skeletonBody(g, hood);
    if (hood) {
      const bow = add(arms[1], new THREE.TorusGeometry(0.35, 0.025, 6, 16, Math.PI), toon('#8b5a2b'), { p: [0, -0.45, 0.1], r: [0, Math.PI / 2, Math.PI / 2], outline: false });
      bow.castShadow = false;
    } else {
      add(arms[1], new THREE.BoxGeometry(0.06, 0.55, 0.02), shinyBlade, { p: [0, -0.6, 0.1], r: [0.3, 0, 0], outline: false });
    }
    tick = (t, o) => {
      const w = o.moving ? Math.sin(t * 9) : 0;
      legs[0].rotation.x = w * 0.5;
      legs[1].rotation.x = -w * 0.5;
      arms[0].rotation.x = -w * 0.4;
      arms[1].rotation.x = hood ? -1.3 : -0.6 + w * 0.3;
    };
  } else if (kind === 'toad') {
    const body = new THREE.Group();
    g.add(body);
    const skin = new THREE.MeshToonMaterial({ color: '#5fbf3a' });
    mats.push(skin);
    add(body, new THREE.SphereGeometry(0.55, 16, 12), skin, { p: [0, 0.5, 0], s: [1.1, 0.75, 1] });
    add(body, new THREE.SphereGeometry(0.42, 14, 10), toon('#e8f5a0'), { p: [0, 0.38, 0.22], s: [1, 0.6, 0.8], outline: false });
    for (const s of [-1, 1]) {
      add(body, new THREE.SphereGeometry(0.17, 12, 10), skin, { p: [s * 0.25, 0.9, 0.2] });
      add(body, new THREE.SphereGeometry(0.1, 10, 8), basic('#ffffff'), { p: [s * 0.25, 0.94, 0.33], outline: false });
      add(body, new THREE.SphereGeometry(0.06, 8, 6), basic('#1a0a20'), { p: [s * 0.25, 0.94, 0.41], outline: false });
      add(body, new THREE.SphereGeometry(0.16, 10, 8), skin, { p: [s * 0.45, 0.2, -0.1], s: [1, 0.5, 1.6] });
    }
    for (let i = 0; i < 5; i++) add(body, new THREE.SphereGeometry(0.07, 8, 6), toon('#9b3ad8'), { p: [Math.cos(i * 2) * 0.35, 0.82, Math.sin(i * 2) * 0.3 - 0.1], outline: false });
    tick = (t) => { body.position.y = Math.abs(Math.sin(t * 4.5)) * 0.35; body.scale.y = 1 - Math.abs(Math.cos(t * 4.5)) * 0.08; };
  } else if (kind === 'wisp') {
    const core = new THREE.Group();
    core.position.y = 1.3;
    g.add(core);
    const mat = new THREE.MeshBasicMaterial({ color: '#7dfcff' });
    mats.push(mat);
    add(core, new THREE.SphereGeometry(0.26, 14, 12), mat, { outline: false });
    const glow = new THREE.Sprite(additive(glowTexture, 0x7dfcff, 0.8));
    glow.scale.setScalar(1.6);
    core.add(glow);
    const flame = new THREE.Sprite(additive(flameTexture, 0x9ffcff, 0.8));
    flame.scale.set(0.6, 0.9, 1);
    flame.position.y = 0.3;
    core.add(flame);
    tick = (t) => {
      core.position.y = 1.3 + Math.sin(t * 3) * 0.2;
      glow.material.opacity = 0.6 + Math.sin(t * 6) * 0.2;
      flame.scale.y = 0.8 + Math.sin(t * 11) * 0.15;
    };
  } else { // brute
    const skin = new THREE.MeshToonMaterial({ color: '#6c9a4a' });
    mats.push(skin);
    const legs = [-1, 1].map((s) => {
      const leg = new THREE.Group();
      leg.position.set(s * 0.3, 0.6, 0);
      add(leg, new THREE.BoxGeometry(0.32, 0.6, 0.34), toon('#5a3a22'), { p: [0, -0.3, 0] });
      g.add(leg);
      return leg;
    });
    add(g, new THREE.SphereGeometry(0.6, 18, 14), skin, { p: [0, 1.1, 0], s: [1.15, 1, 0.9] });
    add(g, new THREE.BoxGeometry(0.9, 0.2, 0.7), toon('#5a3a22'), { p: [0, 0.72, 0], outline: false });
    const head = add(g, new THREE.SphereGeometry(0.32, 14, 12), skin, { p: [0, 1.75, 0.12] });
    for (const s of [-1, 1]) {
      add(head, new THREE.ConeGeometry(0.07, 0.25, 8), toon('#f4ecd8'), { p: [s * 0.22, 0.2, 0], r: [0, 0, -s * 0.6] });
      add(head, new THREE.SphereGeometry(0.05, 8, 6), basic('#ffd84d'), { p: [s * 0.11, 0.05, 0.28], outline: false });
      add(head, new THREE.ConeGeometry(0.035, 0.1, 6), toon('#ffffff'), { p: [s * 0.09, -0.15, 0.26], outline: false });
    }
    const club = new THREE.Group();
    club.position.set(0.7, 1.35, 0);
    g.add(club);
    add(club, new THREE.CylinderGeometry(0.1, 0.18, 0.95, 8), toon('#8b5a2b'), { p: [0, -0.25, 0.3], r: [1.1, 0, 0] });
    tick = (t, o) => {
      const w = o.moving ? Math.sin(t * 5) : 0;
      legs[0].rotation.x = w * 0.35;
      legs[1].rotation.x = -w * 0.35;
      club.rotation.x = o.windup ? -1.6 : Math.sin(t * 2) * 0.15;
    };
  }
  // tiny health bar that shows up once the monster is hurt
  const bar = new THREE.Group();
  bar.position.y = kind === 'brute' ? 2.4 : kind === 'bat' || kind === 'wisp' ? 2.0 : 1.75;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.12), new THREE.MeshBasicMaterial({ color: '#1a1330', depthTest: false, transparent: true }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.08), new THREE.MeshBasicMaterial({ color: '#ff5d73', depthTest: false, transparent: true }));
  fill.position.z = 0.001;
  back.renderOrder = fill.renderOrder = 5;
  bar.add(back, fill);
  bar.visible = false;
  g.add(bar);
  g.traverse((o) => { if (o.isMesh && o !== back && o !== fill) o.castShadow = true; });
  return { g, mats, tick, bar, fill };
}
const shinyBlade = basic('#c9d2e0');

// ---------------------------------------------------------------------------

export function boss(stage) {
  env ||= buildCave();
  stage.lights({ background: '#0b0714', sky: 0xb8a8ff, ground: 0x1a1030, hemi: 0.75, sun: 1.2, sunPos: [10, 40, 18], box: 30, fog: ['#0b0714', 40, 90] });
  stage.scene.add(env.group);
  const orbit = stage.useOrbit({ yaw: 0, pitch: 1.0, dist: 25, minDist: 15, maxDist: 34, height: 0 });
  orbit.fixed = true;
  const sparks = new Sparks(stage.scene, 400);
  const texts = new FloatText(stage.scene);
  const cave = ambient('cave');
  cave.set(0.8);
  stage.hud.innerHTML = `
    <div class="hud-panel dg-floor"></div>
    <div class="hud-panel boss-bar hidden"><div class="bb-name"></div><div class="bb-track"><i class="lag"></i><i class="hp"></i><b></b></div></div>
    <div class="hud-panel arena-scores boss-meter"></div>
    <div class="hud-panel arena-bottom"><div class="dg-myhp"><i></i><b></b></div><div class="meter"><i></i><span>DASH</span></div><div class="dg-ups"></div></div>
    <div class="hud-panel dg-panel hidden"></div>
    <p class="hud-panel arena-help">WASD move · mouse aim · click/hold shoot · <kbd>Space</kbd>/<kbd>Shift</kbd> dash (can't be hit mid-dash) · stand by a downed friend to revive them</p>`;
  const $h = (sel) => stage.hud.querySelector(sel);
  const barEl = $h('.boss-bar'), meterEl = $h('.boss-meter'), dashEl = $h('.meter'), floorEl = $h('.dg-floor');
  const panelEl = $h('.dg-panel'), upsEl = $h('.dg-ups'), myHpEl = $h('.dg-myhp');
  let myHpKey = '';
  /** Your own health, big and clear at the bottom of the screen. */
  function renderMyHp(now) {
    const f = fighters.get(S.me);
    if (!f) return;
    const max = f.max ?? 100, poisoned = (f.poisonUntil ?? 0) > now;
    const key = `${f.hp}|${max}|${poisoned}`;
    if (key === myHpKey) return;
    myHpKey = key;
    myHpEl.classList.toggle('poison', poisoned);
    myHpEl.classList.toggle('low', f.hp > 0 && f.hp / max < 0.3);
    myHpEl.querySelector('i').style.width = `${Math.max(0, Math.min(100, (f.hp / max) * 100))}%`;
    myHpEl.querySelector('b').textContent = f.hp > 0 ? `❤ ${Math.ceil(f.hp)} / ${max}${poisoned ? '  ☠ poisoned' : ''}` : '💫 down';
  }
  stage.canvas.style.cursor = CROSSHAIR;

  const fighters = new Map();
  const mobs = new Map();
  let boss = null, model = null, th = THEMES.slime;
  let run = { state: 'lobby', floor: 0, best: 0, endsAt: 0, choices: null, picked: new Set(), last: null, results: null };
  let bullets = [], shots = [], zones = [], lanes = [], rocks = [], timers = [], dmgBy = {};
  let firing = false, lastShot = 0, lastSend = 0, safeUntil = 0, aim = { x: W / 2, y: H / 2 };
  let dash = { t: 0, cd: 0, dx: 0, dy: 0 }, lagHp = 0, panelKey = '';
  const reticle = groundRing(0.35, 0.55, '#ffffff', 0.85);
  stage.scene.add(reticle);
  const bossShadow = groundDisc(1, '#000000', 0.35);
  stage.scene.add(bossShadow);

  const later = (at, fn) => timers.push({ at, fn });
  const burstAt = (x, y, color, n = 12, h = 1, speed = 5) => { const [X, Z] = to3(x, y); sparks.burst(X, h, Z, color, { n, speed }); };
  const airHeight = (now = performance.now()) => {
    const hop = boss?.hop;
    if (!hop || now < hop.t0 || now > hop.t1) return 0;
    return Math.sin(((now - hop.t0) / (hop.t1 - hop.t0)) * Math.PI) * 130;
  };
  const up = (k = S.me) => fighters.get(k)?.up ?? {};
  const moveSpeed = () => MOVE_SPEED * (1 + 0.15 * (up().speed ?? 0));
  const shotGap = () => 230 * Math.pow(0.86, up().rate ?? 0);
  const dashCooldown = () => DASH_COOLDOWN * Math.pow(0.7, up().dash ?? 0);
  const bulletR = (k) => 5 * (1 + 0.5 * (up(k).big ?? 0));
  /** Floors come in bands of three, each themed after the boss waiting at the end of it. */
  const bandTheme = (floor) => ['slime', 'golem', 'venom', 'lich', 'dragon'][Math.floor(Math.max(0, floor - 1) / 3) % 5];

  function addFighter(k, f) {
    const p = stage.person(k);
    p.char.setProp('blaster');
    p.char.aiming = true;
    fighters.set(k, { ...f, tx: f.x, ty: f.y, p, rev: 0, hurt: 0 });
  }
  function removeFighter(k) {
    const f = fighters.get(k);
    if (f?.ring) stage.scene.remove(f.ring, f.revArc);
    if (f?.bubble) stage.scene.remove(f.bubble);
    fighters.delete(k);
    stage.removePerson(k);
  }

  function addMob([id, kind, x, y, hp, max]) {
    if (mobs.has(id)) return;
    const m = buildMob(kind);
    stage.scene.add(m.g);
    mobs.set(id, { id, kind, x, y, tx: x, ty: y, vx: 0, vy: 0, seenAt: performance.now(), hp, max, r: MOB_R[kind] ?? 16, model: m, hurtAt: 0, bornAt: performance.now(), windUntil: 0 });
  }
  function removeMob(id, pop = true) {
    const m = mobs.get(id);
    if (!m) return;
    stage.scene?.remove(m.model.g);
    mobs.delete(id);
    if (pop) {
      burstAt(m.x, m.y, m.kind === 'wisp' ? '#7dfcff' : m.kind === 'slimelet' ? '#7be08a' : '#f1ead8', 16, 1, 6);
      const [X, Z] = to3(m.x, m.y);
      sparks.puff(X, 1, Z, '#ffffff', 1.4, 0.4);
    }
  }
  function clearMobs() { for (const id of [...mobs.keys()]) removeMob(id, false); }

  function clearAttacks() {
    for (const list of [zones, lanes, shots, rocks]) for (const o of list) stage.scene?.remove(o.mesh);
    zones = []; lanes = []; shots = []; rocks = []; timers = [];
  }

  function setBoss(b) {
    if (model) stage.scene.remove(model.g);
    model = null;
    boss = b ? { ...b, tx: b.x, ty: b.y, hurtAt: 0, spawnAt: performance.now(), deadAt: 0, hop: null, chargeUntil: 0 } : null;
    lagHp = b?.hp ?? 0;
    if (boss) {
      model = (BUILD[boss.id] ?? buildSlime)(boss.r / K);
      model.g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      stage.scene.add(model.g);
    }
  }

  function setTheme(id) {
    th = theme(id);
    // the sky, the fog and the ground beyond the walls all share one color, so the cave has no visible edge
    stage.scene.fog.color.set(th.fog);
    stage.scene.background = new THREE.Color(th.fog);
    env.outerMat.color.set(th.fog);
  }

  function renderMeter() {
    meterEl.innerHTML = [...fighters.keys()].map((k) => [k, dmgBy[k] ?? 0]).sort((a, b) => b[1] - a[1])
      .map(([k, d]) => `<span style="--c:${colorOf(k)}"><i class="dot"></i>${esc(nameOf(k))} <b>${fmt(d)}</b></span>`).join('');
  }
  function renderFloor() {
    const inRun = run.state !== 'lobby' && run.state !== 'over';
    floorEl.innerHTML = inRun
      ? `<b>🏰 Floor ${run.floor}</b>${run.floor % 3 === 0 ? ' · <span class="dg-bossfloor">BOSS</span>' : ` · boss on ${Math.ceil(run.floor / 3) * 3}`}<span class="muted"> · record ${run.best}</span>`
      : `<b>🏰 The Dungeon</b><span class="muted"> · record floor ${run.best}</span>`;
    const u = up();
    upsEl.innerHTML = Object.entries(u).map(([id, n]) => `<span title="${esc(UPGRADE_NAME[id] ?? id)}">${UPGRADE_EMOJI[id] ?? '⭐'}${n > 1 ? `<b>${n}</b>` : ''}</span>`).join('');
  }

  // ---- the lobby / upgrade picker / run summary card -----------------------------
  function renderPanel() {
    const now = performance.now();
    const left = Math.max(0, Math.ceil((run.endsAt - now) / 1000));
    let html = '';
    if (run.state === 'lobby') {
      const here = [...fighters.keys()];
      html = `<h3>🏰 The Dungeon</h3>
        <p>Start on <b>floor 1</b> and climb as high as your group can. Clear the monsters on each floor, then everyone picks an upgrade. Every 3rd floor is a boss!</p>
        <p class="muted small">Downed friends can be revived (they come back with 30 HP). If everyone goes down, the run is over.</p>
        <p>Zone record: <b>floor ${run.best}</b>${run.last ? ` · last run reached floor ${run.last.floor}` : ''}</p>
        <div class="dg-here">${here.map((k) => `<span style="--c:${colorOf(k)}"><i class="dot"></i>${esc(nameOf(k))}</span>`).join('')}</div>
        <button class="btn primary" data-start>⚔️ Start run${here.length > 1 ? ` (${here.length} players)` : ''}</button>`;
    } else if (run.state === 'pick') {
      const total = fighters.size, done = run.picked.size;
      if (run.choices) {
        html = `<h3>✨ Floor ${run.floor} cleared!</h3><p class="muted">Pick an upgrade · ${left}s</p>
          <div class="dg-cards">${run.choices.map((c) => `<button class="dg-card" data-pick="${esc(c.id)}">
            <span class="dg-emoji">${c.emoji}</span><b>${esc(c.name)}</b><span>${esc(c.desc)}</span>${c.lvl ? `<em>Level ${c.lvl} → ${c.lvl + 1}</em>` : '<em>New!</em>'}
          </button>`).join('')}</div>
          <button class="btn ghost small" data-pick="skip">Skip · next floor</button>`;
      } else {
        html = `<h3>✨ Floor ${run.floor} cleared!</h3><p>Waiting for the others to pick… (${done}/${total})</p><p class="muted">Next floor in ${left}s</p>`;
      }
    } else if (run.state === 'over') {
      const mine = run.results?.[S.me];
      html = `<h3>💀 The run is over</h3>
        <p>Your group reached <b>floor ${run.last?.floor ?? run.floor}</b>.${run.record ? ' <b class="dg-record">New zone record!</b>' : ''}</p>
        ${mine ? `<p>You: +${fmt(mine.coins)} 🪙 · +${mine.xp} XP · ${fmt(mine.dmg)} damage</p>` : ''}
        <p class="muted small">Back at the entrance in ${left}s…</p>`;
    }
    const key = html;
    if (key !== panelKey) {
      panelKey = key;
      panelEl.innerHTML = html;
    }
    panelEl.classList.toggle('hidden', !html);
  }
  panelEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-start]')) { net.send('boss_start'); sfx('click'); }
    const pick = e.target.closest('[data-pick]');
    if (pick && run.choices) {
      net.send('boss_pick', { id: pick.dataset.pick });
      run.choices = null;
      sfx('powerup');
      renderPanel();
    }
  });

  // ---- input -------------------------------------------------------------------
  stage.onPointer = (type) => {
    if (type === 'down') firing = true;
    if (type === 'up') firing = false;
  };
  stage.onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (down && (k === ' ' || k === 'shift') && !e.repeat) tryDash();
  };
  function inputDir() {
    const keys = stage.keys;
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    const len = Math.hypot(dx, dy);
    return len ? { dx: dx / len, dy: dy / len } : null;
  }
  function tryDash() {
    const mine = fighters.get(S.me);
    if (!mine || mine.hp <= 0 || dash.cd > 0) return;
    const dir = inputDir() ?? { dx: Math.cos(mine.a ?? 0), dy: Math.sin(mine.a ?? 0) };
    dash = { t: DASH_TIME, cd: dashCooldown(), ...dir };
    burstAt(mine.x, mine.y, '#ffffff', 10, 0.5);
    sfx('dash');
  }

  /** You got caught by something: tell the server (it applies i-frames, shields and HP). */
  function hurt(src = 'shot') {
    const mine = fighters.get(S.me);
    const now = performance.now();
    if (!mine || mine.hp <= 0 || dash.t > 0 || run.state !== 'fight') return;
    if (now < safeUntil) {
      // standing in a poison puddle keeps you poisoned even while you can't be hit
      if (src === 'puddle' && now > (puddleSent ?? 0) + 500) { puddleSent = now; net.send('boss_hurt', { src }); }
      return;
    }
    safeUntil = now + 900;
    net.send('boss_hurt', { src });
  }
  let puddleSent = 0;
  const meInside = (x, y, r) => {
    const mine = fighters.get(S.me);
    return mine && mine.hp > 0 && Math.hypot(mine.x - x, mine.y - y) < r + PR * 0.4;
  };

  function fireBullets(owner, x, y, a, n) {
    const spread = 0.13;
    for (let i = 0; i < n; i++) {
      const aa = a + (i - (n - 1) / 2) * spread;
      const r = bulletR(owner);
      const mesh = orb(bulletColor(up(owner), colorOf(owner)), 0.14 * (r / 5), 4);
      stage.scene.add(mesh);
      bullets.push({ owner, x, y, vx: Math.cos(aa) * BULLET_SPEED, vy: Math.sin(aa) * BULLET_SPEED, life: BULLET_LIFE, mesh, r, hit: new Set(), pierce: !!up(owner).pierce });
    }
  }
  function enemyShot(x, y, a, sp, color = th.orb, size = 0.3, poison = false) {
    const mesh = orb(poison ? POISON : color, size, 3.2);
    stage.scene.add(mesh);
    shots.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: size * 33, life: 4.5, mesh, poison });
  }
  /** A pool of poison that sits on the floor for a while; standing in it keeps you poisoned. */
  function puddle(x, y, r, until) {
    const [X, Z] = to3(x, y);
    const g = new THREE.Group();
    g.position.set(X, 0.03, Z);
    g.add(groundDisc(r / K, POISON, 0.35), groundRing(r / K - 0.1, r / K, '#c8ff8a', 0.6));
    stage.scene.add(g);
    puddles.push({ x, y, r, until, mesh: g });
  }
  let puddles = [];

  // ---- attacks -----------------------------------------------------------------
  function zone(x, y, r, start, fire, { rock = false, color = '#ff3b50' } = {}) {
    const [X, Z] = to3(x, y);
    const g = new THREE.Group();
    g.position.set(X, 0.04, Z);
    const outline = groundRing(r / K - 0.08, r / K, color === '#ff3b50' ? '#ff5d73' : color, 0.9);
    const fill = groundDisc(r / K, color, 0.28);
    const grow = groundDisc(r / K, color, 0.4);
    g.add(outline, fill, grow);
    stage.scene.add(g);
    zones.push({ x, y, r, start, fire, mesh: g, grow });
    if (rock) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), toon(th.rock));
      m.castShadow = true;
      m.position.set(X, 14, Z);
      stage.scene.add(m);
      rocks.push({ mesh: m, start, fire });
    }
  }

  function onAttack(m) {
    const now = performance.now();
    const fire = now + m.d * 1000;
    if (m.kind === 'slam' || m.kind === 'rocks' || m.kind === 'curse') {
      sfx('warn', { vol: m.mob ? 0.5 : 1 });
      const color = m.kind === 'curse' ? '#a45bff' : '#ff3b50';
      for (const [x, y] of m.c) zone(x, y, m.r, now, fire, { rock: m.kind === 'rocks', color });
      if (m.mob) { const mob = mobs.get(m.mob); if (mob) mob.windUntil = fire; } else if (boss) boss.chargeUntil = fire;
      later(fire, () => {
        sfx('slam', { vol: m.mob ? 0.55 : m.kind === 'slam' ? 1 : 0.75 });
        stage.shake(m.mob ? 0.3 : m.kind === 'slam' ? 0.8 : 0.5);
        for (const [x, y] of m.c) {
          burstAt(x, y, m.kind === 'rocks' ? '#b8b2cf' : m.kind === 'curse' ? '#c77dff' : th.crystal, 18, 0.3, 7);
          if (meInside(x, y, m.r)) hurt(m.mob ? 'brute' : m.kind);
        }
      });
      return;
    }
    if (m.kind === 'puddles') {
      sfx('warn');
      if (boss) boss.chargeUntil = fire;
      for (const [x, y] of m.c) zone(x, y, m.r, now, fire, { color: POISON });
      later(fire, () => {
        sfx('splash', { vol: 0.8 });
        for (const [x, y] of m.c) {
          burstAt(x, y, POISON, 16, 0.4, 5);
          puddle(x, y, m.r, fire + m.linger * 1000);
          if (meInside(x, y, m.r)) hurt('puddle');
        }
      });
      return;
    }
    if (!boss) return;
    if (m.kind === 'volley' || m.kind === 'spiral') {
      boss.chargeUntil = fire;
      if (m.kind === 'spiral') sfx('charge');
      for (let w = 0; w < m.waves; w++) {
        later(fire + w * m.gap * 1000, () => {
          if (!boss || boss.st !== 'fight') return;
          sfx('volley', { vol: m.kind === 'spiral' ? 0.6 : 1 });
          for (let i = 0; i < m.n; i++) {
            const a = m.off + w * m.rot + (i * TAU) / m.n;
            enemyShot(boss.x + Math.cos(a) * boss.r * 0.6, boss.y + Math.sin(a) * boss.r * 0.6, a, m.sp, th.orb, 0.3, !!m.p);
          }
        });
      }
    } else if (m.kind === 'summon') {
      boss.chargeUntil = fire;
      sfx('cast');
      const [X, Z] = to3(m.x, m.y);
      for (let i = 0; i < 3; i++) setTimeout(() => sparks.burst(X, 1.5, Z, th.crystal, { n: 20, speed: 5, up: 4 }), i * 250);
      stage.banner(`🪄 ${esc(boss.name)} summons minions!`, 1400);
    } else if (m.kind === 'blink') {
      boss.chargeUntil = fire;
      sfx('whoosh');
      later(fire, () => {
        if (!boss) return;
        burstAt(boss.x, boss.y, th.crystal, 26, 1.5, 6);
        boss.x = boss.tx = m.tx;
        boss.y = boss.ty = m.ty;
        burstAt(m.tx, m.ty, th.crystal, 26, 1.5, 6);
      });
    } else if (m.kind === 'charge') {
      sfx('charge_boss');
      const [x0, z0] = to3(m.x, m.y), [x1, z1] = to3(m.tx, m.ty);
      const len = Math.max(0.1, Math.hypot(x1 - x0, z1 - z0));
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(len, (boss.r * 2) / K), new THREE.MeshBasicMaterial({ color: '#ff3b50', transparent: true, opacity: 0.3, depthWrite: false }));
      plane.rotation.set(-Math.PI / 2, 0, -Math.atan2(z1 - z0, x1 - x0));
      plane.position.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2);
      stage.scene.add(plane);
      lanes.push({ mesh: plane, start: now, fire, end: fire + m.dur * 1000 });
      boss.chargeUntil = fire + m.dur * 1000;
      later(fire, () => { stage.shake(0.4); sfx('dash'); });
    } else if (m.kind === 'hop') {
      sfx('jump', { vol: 0.8 });
      const land = fire + m.dur * 1000;
      boss.hop = { t0: fire, t1: land };
      zone(m.tx, m.ty, m.r, now, land);
      later(land, () => {
        sfx('slam');
        stage.shake(1);
        const [X, Z] = to3(m.tx, m.ty);
        sparks.burst(X, 0.3, Z, th.crystal, { n: 30, speed: 9, up: 1 });
        if (meInside(m.tx, m.ty, m.r)) hurt('hop');
      });
    }
  }

  function damageText(x, y, h, m) {
    const mine = m.k === S.me;
    if (!mine && !m.crit) return;
    const [X, Z] = to3(x, y);
    const color = m.fx ? FX_COLOR[m.fx] : m.crit ? '#ffd84d' : mine ? '#ffffff' : colorOf(m.k);
    texts.add(m.crit ? `CRIT ${m.d}!` : `${m.d}`, X + (Math.random() - 0.5) * 1.5, h, Z, color, m.crit ? 1.1 : m.fx ? 0.6 : 0.8);
  }

  // ---- network ------------------------------------------------------------------
  function applyView(m) {
    const now = performance.now();
    const was = run.state, wasFloor = run.floor;
    run.state = m.state;
    run.floor = m.floor;
    run.best = m.best;
    run.endsAt = now + (m.left ?? 0) * 1000;
    run.choices = m.choices ?? null;
    run.picked = new Set(m.picked ?? []);
    run.last = m.last;
    for (const k of [...fighters.keys()]) if (!(k in m.fighters)) removeFighter(k);
    for (const [k, f] of Object.entries(m.fighters)) {
      const cur = fighters.get(k);
      if (!cur) { addFighter(k, f); continue; }
      Object.assign(cur, { hp: f.hp, max: f.max, up: f.up, shield: f.shield });
      if (m.spawn || k !== S.me) Object.assign(cur, { tx: f.x, ty: f.y });
      if (m.spawn && k === S.me) Object.assign(cur, { x: f.x, y: f.y });
    }
    clearMobs();
    (m.mobs ?? []).forEach(addMob);
    if (m.spawn || !m.boss || m.boss.id !== boss?.id) {
      clearAttacks();
      setBoss(m.boss);
    } else Object.assign(boss, { hp: m.boss.hp, max: m.boss.max, st: m.boss.st, enraged: m.boss.enraged });
    setTheme(m.boss?.id ?? (run.floor ? bandTheme(run.floor) : 'slime'));
    if (m.spawn) {
      safeUntil = now + 1500;
      if (run.floor === 1) { dmgBy = {}; run.results = null; run.record = false; }
      if (m.boss) {
        sfx('roar');
        stage.shake(0.6);
        stage.banner(`<div class="big">${BOSS_EMOJI[m.boss.id] ?? '👾'} Floor ${run.floor}: ${esc(m.boss.name)}!</div>${m.boss.tier ? `Tier ${m.boss.tier + 1} · ` : ''}Get ready…`, 2600);
      } else {
        sfx('enter');
        stage.banner(`<div class="big">🏰 Floor ${run.floor}</div>Clear out the monsters!`, 2200);
      }
    } else if (was !== run.state || wasFloor !== run.floor) {
      if (run.state === 'fight' && m.boss) stage.banner(`<div class="big">${BOSS_EMOJI[m.boss.id] ?? '👾'} ${esc(m.boss.name)}</div>A fight is underway on floor ${run.floor}. Jump in!`);
      else if (run.state === 'fight') stage.banner(`<div class="big">🏰 Floor ${run.floor}</div>A run is underway. Jump in!`);
    }
    panelKey = '';
    renderPanel();
    renderMeter();
    renderFloor();
  }

  const off = listen({
    boss: applyView,
    boss_phase: (m) => {
      if (m.st === 'fight') {
        run.state = 'fight';
        if (boss) { boss.st = 'fight'; stage.banner('<div class="big">FIGHT!</div>', 1200); }
        sfx('go');
        renderPanel();
      }
      if (m.st === 'enraged' && boss) {
        boss.enraged = true;
        sfx('enrage');
        stage.shake(0.8);
        stage.banner(`<div class="big">😡 ${esc(boss.name)} is enraged!</div>Its attacks are faster now.`, 2400);
      }
    },
    boss_s: (m) => {
      if (boss && m.hp !== undefined) { boss.tx = m.x; boss.ty = m.y; boss.hp = m.hp; boss.max = m.max; }
      for (const [id, [x, y]] of Object.entries(m.m ?? {})) {
        const mob = mobs.get(Number(id));
        if (!mob) continue;
        const now = performance.now(), gap = Math.max(0.03, (now - (mob.seenAt ?? now - 50)) / 1000);
        mob.vx = mob.vx * 0.4 + ((x - mob.tx) / gap) * 0.6;
        mob.vy = mob.vy * 0.4 + ((y - mob.ty) / gap) * 0.6;
        mob.tx = x; mob.ty = y; mob.seenAt = now;
      }
      for (const [k, f] of fighters) f.rev = m.rev?.[k] ?? 0;
    },
    boss_atk: onAttack,
    boss_dmg: (m) => {
      if (!boss) return;
      boss.hp = m.hp;
      if (!m.fx) boss.hurtAt = performance.now();
      boss.st2 = m.st ?? boss.st2;
      boss.stAt = performance.now();
      dmgBy[m.k] = (dmgBy[m.k] ?? 0) + m.d;
      renderMeter();
      damageText(boss.x, boss.y, (boss.r / K) * 2.2 + airHeight() / K, m);
      sfx('bosshit', { vol: m.k === S.me ? 1 : 0.35, crit: m.crit && m.k === S.me });
    },
    mob_add: (m) => {
      m.mobs.forEach(addMob);
      if (m.near) for (const [, , x, y] of m.mobs) burstAt(x, y, th.crystal, 14, 0.5, 4);
      else sfx('spawn', { vol: 0.4 });
    },
    mob_dmg: (m) => {
      const mob = mobs.get(m.id);
      if (!mob) return;
      mob.hp = m.hp;
      if (!m.fx) mob.hurtAt = performance.now();
      mob.st2 = m.st ?? mob.st2;
      mob.stAt = performance.now();
      dmgBy[m.k] = (dmgBy[m.k] ?? 0) + m.d;
      renderMeter();
      damageText(mob.x, mob.y, 2, m);
      if (m.k === S.me) sfx('hit', { vol: 0.5 });
    },
    mob_die: (m) => {
      const mob = mobs.get(m.id);
      if (m.k) {
        dmgBy[m.k] = (dmgBy[m.k] ?? 0) + (m.d ?? 0);
        renderMeter();
        if (mob) damageText(mob.x, mob.y, 2, m);
        sfx('ko', { vol: m.k === S.me ? 0.6 : 0.25 });
      }
      removeMob(m.id);
    },
    mob_shot: (m) => {
      for (const s of m.s) {
        for (let i = 0; i < s.n; i++) enemyShot(s.x, s.y, s.a + (i * TAU) / s.n, s.sp, s.n > 1 ? '#7dfcff' : '#f1ead8', s.p ? 0.26 : 0.22, !!s.p);
      }
      sfx('arrow', { vol: 0.35 });
    },
    boss_add: (m) => { addFighter(m.k, m); renderMeter(); if (run.state === 'lobby') { panelKey = ''; renderPanel(); } },
    boss_del: (m) => { removeFighter(m.k); renderMeter(); if (run.state === 'lobby') { panelKey = ''; renderPanel(); } },
    boss_pos: (m) => { const f = fighters.get(m.k); if (f) { f.tx = m.x; f.ty = m.y; f.a = m.a; } },
    boss_shot: (m) => {
      fireBullets(m.k, m.x, m.y, m.a, m.n ?? 1);
      sfx('shoot_far');
    },
    boss_hp: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      const tick = m.poison > 0 && f.hp - m.hp <= 6 && (f.poisonUntil ?? 0) > performance.now();
      f.hp = m.hp;
      if (m.poison > 0) f.poisonUntil = performance.now() + m.poison * 1000;
      if (m.d) { const [X, Z] = to3(f.x, f.y); texts.add(`-${m.d}`, X, 2.6, Z, m.poison > 0 ? POISON : '#ff5d73', tick ? 0.5 : 0.8); }
      if (tick) return; // a poison tick: just the number
      f.hurt = performance.now();
      burstAt(f.x, f.y, m.poison > 0 ? POISON : '#ffffff', 10, 1.2);
      if (m.k === S.me) { stage.shake(0.5); sfx('hurt'); } else sfx('hit', { vol: 0.4 });
    },
    boss_shield: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      f.shield = false;
      f.hurt = performance.now();
      burstAt(f.x, f.y, '#9fe8ff', 24, 1.2, 6);
      sfx('shield', { vol: m.k === S.me ? 1 : 0.4 });
      if (m.k === S.me) stage.banner('🫧 Your shield blocked a hit!', 1400);
    },
    boss_down: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      f.hp = 0;
      burstAt(f.x, f.y, colorOf(m.k), 26, 1);
      const alone = [...fighters.values()].every((o) => o.hp <= 0);
      if (m.k === S.me) {
        sfx('down');
        const wind = up().revive && !f.windUsed;
        if (!alone) stage.banner(`💫 You're down! ${wind ? 'Second Wind will pick you up in 4s…' : 'A friend can revive you (you\'ll come back with 30 HP).'}`, 3500);
      } else { sfx('down', { vol: 0.5 }); stage.banner(`💫 ${esc(nameOf(m.k))} is down! Stand next to them to revive.`, 2400); }
    },
    boss_up: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      f.hp = m.hp;
      f.rev = 0;
      if (m.wind) f.windUsed = true;
      burstAt(f.x, f.y, '#9fe8ff', 18, 1);
      sfx('revive', { vol: m.k === S.me ? 1 : 0.5 });
      if (m.k === S.me) { safeUntil = performance.now() + 1200; if (m.wind) stage.banner('🌀 Second Wind! Back on your feet.', 1600); }
    },
    boss_dead: (m) => {
      if (!boss) return;
      boss.st = 'dead';
      boss.hp = 0;
      boss.deadAt = performance.now();
      clearAttacks();
      sfx('bossdie');
      stage.shake(1.4);
      const bx = boss.x, by = boss.y;
      for (let i = 0; i < 4; i++) setTimeout(() => burstAt(bx + (Math.random() - 0.5) * 60, by + (Math.random() - 0.5) * 60, ['#ffffff', '#ffd84d', '#ff5d73', th.crystal][i], 50, 2, 9), i * 180);
      setTimeout(() => confetti(stage.hud, { count: 160 }), 700);
      const mine = m.results[S.me];
      const loot = (mine?.loot ?? []).map((id) => ITEMS[id]?.name ?? FURN[id]?.name).filter(Boolean);
      stage.banner(`<div class="big">🏆 ${esc(m.name)} defeated!</div>
        ${m.mvp ? `MVP: <b>${esc(nameOf(m.mvp))}</b><br>` : ''}
        ${mine ? `You: +${fmt(mine.coins)} 🪙 · +${mine.xp} XP` : ''}
        ${loot.length ? `<br>✨ Loot: <b>${loot.map(esc).join(', ')}</b>` : ''}`, 4000);
    },
    boss_clear: (m) => {
      sfx('cheer');
      clearAttacks();
      for (const b of bullets) stage.scene.remove(b.mesh);
      bullets = [];
    },
    boss_picked: (m) => {
      const f = fighters.get(m.k);
      if (f) Object.assign(f, { hp: m.f.hp, max: m.f.max, up: m.f.up, shield: m.f.shield });
      run.picked.add(m.k);
      if (m.k === S.me) run.choices = null;
      else { const [X, Z] = f ? to3(f.x, f.y) : [0, 0]; texts.add(`${UPGRADE_EMOJI[m.id] ?? '⭐'} ${UPGRADE_NAME[m.id] ?? ''}`, X, 3, Z, colorOf(m.k), 0.8); }
      renderFloor();
    },
    boss_wipe: (m) => {
      run.results = m.results;
      run.record = m.record;
      clearAttacks();
      sfx(m.record ? 'win' : 'lose');
      if (m.record) setTimeout(() => confetti(stage.hud, { count: 200 }), 300);
    },
  });

  // ---- simulation + rendering --------------------------------------------------------
  stage.onFrame((dt, now) => {
    const t = now / 1000;
    dash.cd = Math.max(0, dash.cd - dt);
    timers = timers.filter((tm) => (tm.at <= now ? (tm.fn(), false) : true));
    const p3 = stage.pointerOnPlane(1);
    if (p3 && stage.mouseIn) aim = { x: p3.x * K + W / 2, y: p3.z * K + H / 2 };
    reticle.position.set((aim.x - W / 2) / K, 0.06, (aim.y - H / 2) / K);

    const mine = fighters.get(S.me);
    reticle.visible = !!mine && mine.hp > 0;
    if (mine && mine.hp > 0) {
      let vx = 0, vy = 0;
      const dir = inputDir();
      if (dash.t > 0) {
        dash.t -= dt;
        vx = dash.dx * DASH_SPEED;
        vy = dash.dy * DASH_SPEED;
        const [X, Z] = to3(mine.x, mine.y);
        sparks.puff(X, 0.9, Z, colorOf(S.me), 1.2, 0.3);
      } else if (dir) {
        vx = dir.dx * moveSpeed();
        vy = dir.dy * moveSpeed();
      }
      mine.moving = !!(vx || vy);
      if (mine.moving) {
        mine.x = Math.min(W - 22, Math.max(22, mine.x + vx * dt));
        mine.y = Math.min(H - 22, Math.max(22, mine.y + vy * dt));
      }
      mine.a = Math.atan2(aim.y - mine.y, aim.x - mine.x);
      if (now - lastSend > 50) {
        lastSend = now;
        net.send('boss_move', { x: mine.x, y: mine.y, a: mine.a });
      }
      if (firing && now - lastShot > shotGap() && run.state === 'fight') {
        lastShot = now;
        const x = mine.x + Math.cos(mine.a) * 26, y = mine.y + Math.sin(mine.a) * 26;
        const n = 1 + (up().multi ?? 0);
        fireBullets(S.me, x, y, mine.a, n);
        burstAt(x, y, '#fff6b0', 5, 1.1);
        sfx('shoot');
        net.send('boss_shoot', { x, y, a: mine.a, n });
      }
    }

    const lerp = 1 - Math.exp(-dt * 14);
    for (const [k, f] of fighters) {
      if (k !== S.me) {
        const ox = f.tx - f.x, oy = f.ty - f.y;
        f.x += ox * lerp;
        f.y += oy * lerp;
        f.moving = Math.hypot(ox, oy) > 0.8;
      }
      const [x, z] = to3(f.x, f.y);
      const p = f.p;
      p.x = x;
      p.z = z;
      p.heading = Math.atan2(Math.cos(f.a ?? 0), Math.sin(f.a ?? 0));
      p.moving = f.hp > 0 && !!f.moving;
      p.char.pose = f.hp > 0 ? 'idle' : 'sit';
      p.char.aiming = f.hp > 0;
      const blink = f.hurt && now - f.hurt < 250 && Math.floor(now / 50) % 2;
      p.visible = !blink;
      const max = f.max ?? 100;
      const poisoned = (f.poisonUntil ?? 0) > now;
      if (k === S.me) renderMyHp(now);
      const hpKey = `${f.hp}|${max}|${f.shield}|${poisoned}`;
      if (hpKey !== f.hpKey) {
        f.hpKey = hpKey;
        p.sub.innerHTML = f.hp > 0
          ? `<span class="dg-hp ${poisoned ? 'poison' : ''}">${f.shield ? '🫧' : ''}<i style="width:${Math.max(0, Math.min(100, (f.hp / max) * 100)).toFixed(0)}%"></i><b>${Math.max(0, Math.ceil(f.hp))}${poisoned ? ' ☠' : ''}</b></span>`
          : (k === S.me ? '💫 down' : '💫 REVIVE ME');
      }
      // shield bubble
      if (f.shield && f.hp > 0) {
        if (!f.bubble) {
          f.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 14), new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.18, depthWrite: false }));
          stage.scene.add(f.bubble);
        }
        f.bubble.visible = true;
        f.bubble.position.set(x, 1, z);
        f.bubble.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
      } else if (f.bubble) f.bubble.visible = false;
      if (f.hp <= 0) {
        if (!f.ring) {
          f.ring = groundRing(REVIVE_R / K - 0.12, REVIVE_R / K, '#9fe8ff', 0.6);
          f.revArc = new THREE.Mesh(new THREE.RingGeometry(REVIVE_R / K - 0.3, REVIVE_R / K, 40, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: '#6ee7a0', side: THREE.DoubleSide, transparent: true, depthWrite: false }));
          f.revArc.rotation.x = -Math.PI / 2;
          f.revShown = 0;
          stage.scene.add(f.ring, f.revArc);
        }
        f.ring.visible = f.revArc.visible = true;
        f.ring.position.set(x, 0.06, z);
        f.revArc.position.set(x, 0.07, z);
        if (Math.abs(f.rev - f.revShown) > 0.03) {
          f.revShown = f.rev;
          f.revArc.geometry.dispose();
          f.revArc.geometry = new THREE.RingGeometry(REVIVE_R / K - 0.3, REVIVE_R / K, 40, 1, Math.PI / 2, Math.max(0.001, TAU * f.rev));
        }
      } else if (f.ring) {
        f.ring.visible = f.revArc.visible = false;
      }
    }

    // monsters
    const ml = 1 - Math.exp(-dt * 12);
    for (const mob of mobs.values()) {
      const px = mob.x, py = mob.y;
      // where it should be by now: the last update, carried forward at its speed (for a short while)
      const ahead = Math.min(0.12, (now - mob.seenAt) / 1000);
      mob.x += (mob.tx + mob.vx * ahead - mob.x) * ml;
      mob.y += (mob.ty + mob.vy * ahead - mob.y) * ml;
      const moving = Math.abs(mob.x - px) + Math.abs(mob.y - py) > 0.15;
      const [X, Z] = to3(mob.x, mob.y);
      const g = mob.model.g;
      const grow = Math.min(1, (now - mob.bornAt) / 350);
      g.position.set(X, 0, Z);
      g.scale.setScalar(grow * (mob.r / 16));
      if (mine) {
        const [mx, mz] = to3(mine.x, mine.y);
        const want = Math.atan2(mx - X, mz - Z), cur = g.rotation.y;
        g.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 8);
      }
      mob.model.tick(t + mob.id, { moving, windup: now < mob.windUntil });
      const flash = now - mob.hurtAt < 90;
      const st = now - (mob.stAt ?? 0) < 3000 ? mob.st2 : null;
      for (const m of mob.model.mats) {
        if (flash) m.emissive?.setScalar(0.5);
        else if (st?.length) m.emissive?.set(FX_COLOR[st[0]]).multiplyScalar(0.35 + Math.sin(now / 120) * 0.1);
        else m.emissive?.setScalar(0);
      }
      if (st?.length && Math.random() < 0.15) sparks.puff(...(() => { const [X, Z] = to3(mob.x, mob.y); return [X, 1.4, Z]; })(), FX_COLOR[st[Math.floor(Math.random() * st.length)]], 0.5, 0.4);
      if (mob.hp < mob.max) {
        mob.model.bar.visible = true;
        mob.model.bar.quaternion.copy(stage.camera.quaternion);
        mob.model.bar.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -g.rotation.y, 0)));
        const k = Math.max(0.001, mob.hp / mob.max);
        mob.model.fill.scale.x = k;
        mob.model.fill.position.x = -0.43 * (1 - k);
      }
      if (run.state === 'fight' && grow >= 1 && meInside(mob.x, mob.y, mob.r * 0.8)) hurt(mob.kind === 'brute' ? 'brute' : 'touch');
    }

    if (boss && model) {
      const bl = 1 - Math.exp(-dt * 16);
      const bx = boss.x;
      boss.x += (boss.tx - boss.x) * bl;
      boss.y += (boss.ty - boss.y) * bl;
      boss.moving = Math.abs(boss.x - bx) > 0.2;
      lagHp += (boss.hp - lagHp) * Math.min(1, dt * 3);
      const lift = airHeight(now);
      if (boss.st === 'fight' && !lift && meInside(boss.x, boss.y, boss.r * 0.85)) hurt('boss');
      const [X, Z] = to3(boss.x, boss.y);
      let scale = 1;
      if (boss.st === 'intro') scale = 0.3 + Math.min(1, (now - boss.spawnAt) / 1500) * 0.7;
      if (boss.st === 'dead') scale = Math.max(0.001, 1 - (now - boss.deadAt) / 1000);
      model.g.visible = scale > 0.01;
      model.g.scale.setScalar(scale);
      model.g.position.set(X, lift / K, Z);
      const target = mine ?? [...fighters.values()][0];
      if (target) {
        const [mx, mz] = to3(target.x, target.y);
        const want = Math.atan2(mx - X, mz - Z), cur = model.g.rotation.y;
        model.g.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 6);
      }
      const squash = boss.hop ? (now < boss.hop.t0 ? 0.18 : now < boss.hop.t1 ? -0.12 : Math.max(0, 0.2 - (now - boss.hop.t1) / 1500)) : 0;
      model.tick(t, { enraged: boss.enraged, squash, lift, charging: now < boss.chargeUntil, moving: boss.moving });
      const flash = now - boss.hurtAt < 90;
      const bst = now - (boss.stAt ?? 0) < 3000 ? boss.st2 ?? [] : [];
      for (const m of model.mats) {
        if (flash) m.emissive?.setScalar(0.45);
        else if (bst.length) m.emissive?.set(FX_COLOR[bst[0]]).multiplyScalar(0.25);
        else m.emissive?.setScalar(0);
      }
      bossShadow.visible = model.g.visible;
      bossShadow.position.set(X, 0.03, Z);
      bossShadow.scale.setScalar(Math.max(0.1, (boss.r / K) * 1.1 * (1 - lift / 400)));
      if (boss.enraged && boss.st === 'fight' && Math.random() < 0.3) sparks.puff(X + (Math.random() - 0.5) * 3, Math.random() * 4 + lift / K, Z + (Math.random() - 0.5) * 3, th.crystal, 0.8, 0.5);
      barEl.classList.toggle('hidden', boss.st === 'dead');
      barEl.querySelector('.bb-name').textContent = `${boss.name}${boss.tier ? ` ${'★'.repeat(Math.min(5, boss.tier))}` : ''}${boss.enraged ? ' · ENRAGED' : ''}`;
      barEl.querySelector('.hp').style.width = `${Math.max(0, boss.hp / boss.max) * 100}%`;
      barEl.querySelector('.lag').style.width = `${Math.max(0, lagHp / boss.max) * 100}%`;
      barEl.querySelector('b').textContent = `${fmt(boss.hp)} / ${fmt(boss.max)}`;
      barEl.classList.toggle('enraged', !!boss.enraged);
    } else {
      barEl.classList.add('hidden');
      bossShadow.visible = false;
    }

    bullets = bullets.filter((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const [X, Z] = to3(b.x, b.y);
      b.mesh.position.set(X, 1.1, Z);
      let dead = b.life <= 0 || b.x < 10 || b.x > W - 10 || b.y < 10 || b.y > H - 10;
      if (!dead && run.state === 'fight') {
        for (const mob of mobs.values()) {
          if (b.hit.has(mob.id) || Math.hypot(mob.x - b.x, mob.y - b.y) >= mob.r + b.r) continue;
          b.hit.add(mob.id);
          sparks.burst(X, 1.1, Z, colorOf(b.owner), { n: 6, speed: 3 });
          if (b.owner === S.me) net.send('boss_hit', { id: mob.id });
          if (!b.pierce) { dead = true; break; }
        }
      }
      if (!dead && boss && boss.st === 'fight' && !b.hit.has('boss') && airHeight(now) < 60 && Math.hypot(boss.x - b.x, boss.y - b.y) < boss.r * 0.95 + b.r - 5) {
        b.hit.add('boss');
        sparks.burst(X, 1.3, Z, colorOf(b.owner), { n: 7, speed: 3 });
        if (b.owner === S.me) net.send('boss_hit');
        if (!b.pierce) dead = true;
      }
      if (dead) stage.scene.remove(b.mesh);
      return !dead;
    });
    shots = shots.filter((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const [X, Z] = to3(s.x, s.y);
      s.mesh.position.set(X, 1.1, Z);
      let dead = s.life <= 0 || s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20;
      const m2 = fighters.get(S.me);
      if (!dead && m2 && m2.hp > 0 && Math.hypot(m2.x - s.x, m2.y - s.y) < s.r + PR - 2 && dash.t <= 0 && now >= safeUntil) {
        hurt(s.poison ? 'poison' : 'shot');
        sparks.burst(X, 1.1, Z, s.poison ? POISON : th.orb, { n: 8 });
        dead = true;
      }
      if (dead) stage.scene.remove(s.mesh);
      return !dead;
    });
    puddles = puddles.filter((p) => {
      const left = p.until - now;
      p.mesh.children.forEach((c) => { c.material.opacity = Math.min(0.4, left / 1500) * (0.85 + Math.sin(now / 200) * 0.15); });
      if (left > 0 && meInside(p.x, p.y, p.r * 0.85)) hurt('puddle');
      if (left > 0) return true;
      stage.scene.remove(p.mesh);
      return false;
    });
    zones = zones.filter((z) => {
      const k = Math.min(1, (now - z.start) / Math.max(1, z.fire - z.start));
      z.grow.scale.setScalar(Math.max(0.001, k));
      if (now >= z.fire) z.mesh.children.forEach((c) => { c.material.color.set('#fff3c4'); c.material.opacity = Math.max(0, 0.5 * (1 - (now - z.fire) / 350)); });
      if (now < z.fire + 350) return true;
      stage.scene.remove(z.mesh);
      return false;
    });
    rocks = rocks.filter((r) => {
      const k = Math.min(1, (now - r.start) / Math.max(1, r.fire - r.start));
      r.mesh.position.y = 14 * (1 - k * k) + 0.6;
      r.mesh.rotation.x += dt * 3;
      if (now < r.fire + 250) return true;
      stage.scene.remove(r.mesh);
      return false;
    });
    lanes = lanes.filter((l) => {
      l.mesh.material.opacity = now < l.fire ? 0.2 + 0.15 * Math.sin(now / 60) : 0.15;
      if (now < l.end + 200) return true;
      stage.scene.remove(l.mesh);
      return false;
    });

    if (mine) {
      const [x, z] = to3(mine.x, mine.y);
      orbit.target.set(x * 0.7, 0, z * 0.7 + 2);
    }
    sparks.update(dt);
    texts.update(dt);
    if (run.state === 'pick' || run.state === 'over') renderPanel();
    const ready = 1 - dash.cd / dashCooldown();
    dashEl.querySelector('i').style.width = `${Math.min(1, ready) * 100}%`;
    dashEl.classList.toggle('ready', ready >= 1);
  });

  return () => {
    off();
    cave.stop();
    clearAttacks();
    clearMobs();
    for (const b of bullets) stage.scene?.remove(b.mesh);
    for (const f of fighters.values()) if (f.bubble) stage.scene?.remove(f.bubble);
    if (model) stage.scene?.remove(model.g);
    stage.canvas.style.cursor = '';
    stage.scene?.remove(env.group);
  };
}
