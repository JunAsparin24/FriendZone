// Arena (3D): a first-person blaster brawl. The mouse is locked as soon as you walk in (click if your
// browser needs it; Esc frees it). WASD moves, the mouse looks, click or hold to shoot, Space jumps
// (jump over shots!), Shift slides. Power-ups glow on the ground. The map changes every round, and
// between rounds everyone sees the kills/deaths board for 10 seconds.
// Game logic runs in arena pixels (the server's units; 20 px = 1 world unit).
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf, colorOf } from '../state.js';
import { toon, basic, shiny, canvasTexture, outlineMaterial, additive, glowTexture, flameTexture, TAU } from '../three/materials.js';
import { Sparks, FloatText, orb, groundRing, emojiSprite, crowd } from '../three/fx.js';
import { sfx } from '../sfx.js';
import { listen } from './util.js';
import { touch } from '../touch.js';

const PR = 14, BULLET_SPEED = 950, BULLET_LIFE = 1.2, MOVE_SPEED = 240;
const EYE = 1.55;                          // eye height (world units)
const JUMP_V = 6.4, GRAVITY = 18;          // jump strength and fall speed (world units)
const SLIDE_TIME = 0.6, SLIDE_SPEED = 600, SLIDE_CD = 1.1;
const K = 20;             // arena px per world unit
const WALL_H = 4.2;       // how tall the cover is (world units)
const ITEM_LOOK = {
  heal: { emoji: '❤️', color: '#ff5d73', label: '+1 heart' },
  rapid: { emoji: '⚡', color: '#ffd84d', label: 'Rapid fire!' },
  shield: { emoji: '🛡️', color: '#39c6ff', label: 'Shield!' },
  speed: { emoji: '👟', color: '#6ee7a0', label: 'Speed boost!' },
};
const BUFF_TIME = { rapid: 6, shield: 5, speed: 6 }; // (a shield also pops after soaking up one hit)
const THEMES = {
  sand: { floor: '#e6cf98', line: '#c9a86a', wall: '#b8a888', wall2: '#9c8c70', trim: '#e8dcc0', accent: '#d6334a', sky: '#8fc8f5', fog: '#cfe4f5', outer: '#c9b48c', kind: 'castle' },
  hedge: { floor: '#86c86e', line: '#6aa855', wall: '#2f8a44', wall2: '#257a3a', trim: '#3fa34d', accent: '#ff8fc7', sky: '#a8dcff', fog: '#d8f0e0', outer: '#4f9a45', kind: 'hedge' },
  docks: { floor: '#b98a55', line: '#8b5a2b', wall: '#c28a4e', wall2: '#a8723f', trim: '#6b4226', accent: '#39c6ff', sky: '#ffc98a', fog: '#ffe0bf', outer: '#2a74c0', kind: 'docks' },
  stone: { floor: '#6a6680', line: '#8a86a8', wall: '#4a4760', wall2: '#3a3850', trim: '#8a86a0', accent: '#b77bff', sky: '#2a2458', fog: '#3a3068', outer: '#2a2840', kind: 'neon' },
};

const OUT = outlineMaterial(0.04);
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

function floorTex(th) {
  const t = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = th.floor; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) { ctx.fillStyle = i % 2 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.08)'; ctx.fillRect((i * 137.5) % 256, (i * 71.3) % 256, 2, 2); }
    ctx.strokeStyle = th.line;
    if (th.kind === 'docks') { ctx.lineWidth = 3; for (let y = 0; y < 256; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); } }
    else if (th.kind === 'hedge') { ctx.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 60; i++) { ctx.beginPath(); ctx.arc((i * 71) % 256, (i * 113) % 256, 2, 0, TAU); ctx.fill(); } }
    else { ctx.lineWidth = 3; for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); } }
    if (th.kind === 'neon') { ctx.strokeStyle = th.accent; ctx.lineWidth = 2; for (let i = 0; i <= 256; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); } }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function wallTex(th) {
  const t = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = th.wall2; ctx.fillRect(0, 0, 128, 128);
    if (th.kind === 'hedge') {
      for (let i = 0; i < 120; i++) { ctx.fillStyle = ['#2f8a44', '#3fa34d', '#257a3a'][i % 3]; ctx.beginPath(); ctx.ellipse((i * 53) % 128, (i * 37) % 128, 7, 4, i, 0, TAU); ctx.fill(); }
      ctx.fillStyle = th.accent; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc((i * 43) % 128, (i * 71) % 128, 3, 0, TAU); ctx.fill(); }
    } else if (th.kind === 'docks') {
      ctx.fillStyle = th.wall; ctx.fillRect(4, 4, 120, 120);
      ctx.strokeStyle = th.trim; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 120, 120);
      ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(124, 124); ctx.stroke();
    } else {
      for (let r = 0; r < 4; r++) for (let x = (r % 2) * -16; x < 128; x += 32) {
        ctx.fillStyle = (r + x / 32) % 2 ? th.wall : th.wall2;
        ctx.fillRect(x + 1, r * 32 + 1, 30, 30);
      }
      if (th.kind === 'neon') { ctx.fillStyle = th.accent; ctx.fillRect(0, 60, 128, 4); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function torch(g, x, y, z, anim, color = 0xff9a3a) {
  add(g, new THREE.CylinderGeometry(0.07, 0.09, 0.6, 8), toon('#4a2e1c'), { p: [x, y, z] });
  add(g, new THREE.CylinderGeometry(0.16, 0.1, 0.16, 10), toon('#6b6a70'), { p: [x, y + 0.34, z] });
  const f = new THREE.Sprite(additive(flameTexture, color, 0.95));
  f.scale.set(0.5, 0.75, 1);
  f.position.set(x, y + 0.62, z);
  g.add(f);
  anim.push((t) => { f.scale.y = 0.7 + Math.sin(t * 13 + x) * 0.08; });
}

/** Build a map's 3D level from the server's layout: floor, walls and themed dressing. */
function buildLevel(map) {
  const th = THEMES[map.theme] ?? THEMES.sand;
  const g = new THREE.Group();
  const anim = [];
  const W = map.w / K, H = map.h / K;
  const ft = floorTex(th);
  ft.repeat.set(W / 5, H / 5);
  add(g, new THREE.PlaneGeometry(W, H), new THREE.MeshToonMaterial({ map: ft }), { p: [W / 2, 0, H / 2], r: [-Math.PI / 2, 0, 0], cast: false });
  // a big emblem painted in the middle of the floor
  const emblem = canvasTexture(256, 256, (c) => {
    c.strokeStyle = th.accent; c.lineWidth = 10; c.globalAlpha = 0.55;
    c.beginPath(); c.arc(128, 128, 110, 0, TAU); c.stroke();
    c.beginPath(); c.arc(128, 128, 70, 0, TAU); c.stroke();
    c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 26 : 60; c.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } c.closePath(); c.fillStyle = th.accent; c.fill();
  });
  add(g, new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ map: emblem, transparent: true, depthWrite: false }), { p: [W / 2, 0.02, H / 2], r: [-Math.PI / 2, 0, 0], cast: false });
  const meshes = [];
  const wt = wallTex(th);
  const wallMat = (len) => { const t = wt.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, len / 2), WALL_H / 2); return new THREE.MeshToonMaterial({ map: t }); };
  const trim = toon(th.trim);
  const block = (x, y, w, h, height) => {
    const m = add(g, new THREE.BoxGeometry(w, height, h), wallMat(Math.max(w, h)), { p: [x + w / 2, height / 2, y + h / 2], outline: true });
    meshes.push(m);
    if (th.kind === 'castle' || th.kind === 'neon') {
      add(g, new THREE.BoxGeometry(w + 0.25, 0.3, h + 0.25), trim, { p: [x + w / 2, height + 0.15, y + h / 2], outline: true });
      // crenellations along the top
      const n = Math.max(1, Math.floor(Math.max(w, h) / 1.2));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        add(g, new THREE.BoxGeometry(0.5, 0.5, 0.5), trim, { p: [w >= h ? x + t * w : x + w / 2, height + 0.55, w >= h ? y + h / 2 : y + t * h], outline: true });
      }
    } else if (th.kind === 'hedge') {
      for (let i = 0; i < Math.max(2, Math.floor((w + h) / 1.5)); i++) {
        const t = Math.random();
        add(g, new THREE.IcosahedronGeometry(0.45 + Math.random() * 0.25, 0), toon(i % 3 ? '#3fa34d' : '#2f8a44'), { p: [x + (w >= h ? t * w : w / 2), height + 0.1, y + (w >= h ? h / 2 : t * h)] });
      }
    } else if (th.kind === 'docks') {
      add(g, new THREE.BoxGeometry(w + 0.1, 0.12, h + 0.1), toon(th.trim), { p: [x + w / 2, height, y + h / 2] });
    }
    if (th.kind === 'neon') {
      const strip = add(g, new THREE.BoxGeometry(w + 0.04, 0.08, h + 0.04), basic(th.accent), { p: [x + w / 2, 0.9, y + h / 2], cast: false });
      anim.push((t) => { strip.material.color.setHSL(((t * 0.05) + (x + y) * 0.01) % 1, 0.9, 0.62); });
    }
    return m;
  };
  // the outer walls, taller than the cover
  const OW = WALL_H + 1.6;
  block(-1, -1, W + 2, 1, OW);
  block(-1, H, W + 2, 1, OW);
  block(-1, 0, 1, H, OW);
  block(W, 0, 1, H, OW);
  // cover: crates are shorter and come in stacks; everything else is full height
  map.walls.forEach(([px, py, pw, ph], i) => {
    const x = px / K, y = py / K, w = pw / K, h = ph / K;
    if (th.kind === 'docks') {
      const col = ['#c28a4e', '#39a0ff', '#e0463c', '#6ee7a0'][i % 4];
      const m = add(g, new THREE.BoxGeometry(w, WALL_H * 0.72, h), i % 3 === 0 ? wallMat(Math.max(w, h)) : toon(col), { p: [x + w / 2, WALL_H * 0.36, y + h / 2], outline: true });
      meshes.push(m);
      if (i % 3 !== 0) for (let k = 0; k < 4; k++) add(g, new THREE.BoxGeometry(w + 0.02, 0.08, 0.06), toon('#23263f'), { p: [x + w / 2, 0.4 + k * 0.7, y + h + 0.01], cast: false });
    } else block(x, y, w, h, WALL_H);
    // decorations on the cover
    if (th.kind === 'castle' && i % 2 === 0) {
      add(g, new THREE.PlaneGeometry(0.9, 1.8), toon(th.accent, { side: THREE.DoubleSide }), { p: [x + w / 2, WALL_H - 1.2, y + h + 0.03], cast: false });
      add(g, new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), toon('#ffc53d'), { p: [x + w / 2, WALL_H - 0.3, y + h + 0.05], r: [0, 0, Math.PI / 2] });
    }
  });
  // themed dressing around the edges
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
  if (th.kind === 'castle') {
    for (let i = 0; i < 10; i++) { const t = (i + 0.5) / 10; torch(g, t * W, 2.4, 0.1, anim); torch(g, t * W, 2.4, H - 0.1, anim); }
    for (const z of [-3, H + 3]) add(g, new THREE.BoxGeometry(W + 6, OW + 1.5, 4), toon(th.wall2), { p: [W / 2, (OW + 1.5) / 2, z] });
    const spots = [];
    for (let i = 0; i < 44; i++) { const t = (i + 0.5) / 44; spots.push({ x: t * W, y: OW + 1.6, z: -2 }, { x: t * W, y: OW + 1.6, z: H + 2 }); }
    anim.push(crowd(g, spots.filter((_, i) => i % 3 !== 2)).bind(null));
    for (let i = 0; i < 8; i++) add(g, new THREE.PlaneGeometry(2, 4), toon(['#d6334a', '#ffd84d', '#39c6ff'][i % 3], { side: THREE.DoubleSide }), { p: [(i + 0.5) * (W / 8), OW + 3.2, -1.05] });
  } else if (th.kind === 'hedge') {
    for (let i = 0; i < 40; i++) {
      const a = rnd() * TAU, r = Math.max(W, H) * 0.62 + rnd() * 18;
      const x = W / 2 + Math.cos(a) * r, z = H / 2 + Math.sin(a) * r;
      add(g, new THREE.CylinderGeometry(0.3, 0.4, 3, 8), toon('#7a4a28'), { p: [x, 1.5, z] });
      add(g, new THREE.IcosahedronGeometry(2.4 + rnd(), 1), toon(rnd() < 0.5 ? '#3fa34d' : '#2f8a44'), { p: [x, 4.4, z] });
    }
    for (let i = 0; i < 8; i++) {
      const x = (i % 4 + 0.5) * (W / 4), z = i < 4 ? 0.8 : H - 0.8;
      add(g, new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), toon('#23263f'), { p: [x, 1.1, z] });
      add(g, new THREE.SphereGeometry(0.22, 12, 10), basic('#fff3b0'), { p: [x, 2.3, z], cast: false });
      const glow = new THREE.Sprite(additive(glowTexture, 0xfff0a0, 0.6)); glow.scale.setScalar(1.6); glow.position.set(x, 2.3, z); g.add(glow);
    }
  } else if (th.kind === 'docks') {
    const water = add(g, new THREE.PlaneGeometry(400, 400), shiny('#2a74c0', { roughness: 0.2, metalness: 0.1 }), { p: [W / 2, -0.6, H / 2], r: [-Math.PI / 2, 0, 0], cast: false });
    anim.push((t) => { water.position.y = -0.6 + Math.sin(t) * 0.05; });
    for (let i = 0; i < 12; i++) add(g, new THREE.CylinderGeometry(0.22, 0.22, 2.4, 8), toon('#6b4226'), { p: [(i % 6 + 0.5) * (W / 6), 0.6, i < 6 ? -1.5 : H + 1.5] });
    for (let i = 0; i < 3; i++) {
      const x = W * (0.2 + i * 0.3), z = -14 - i * 4;
      add(g, new THREE.BoxGeometry(10, 3, 3.5), toon(['#e0463c', '#ffffff', '#39a0ff'][i]), { p: [x, 0.6, z] });
      add(g, new THREE.CylinderGeometry(0.12, 0.12, 9, 6), toon('#c0c6d4'), { p: [x, 5.5, z] });
      add(g, new THREE.PlaneGeometry(3, 4), toon('#fff6e8', { side: THREE.DoubleSide }), { p: [x + 1.5, 6, z], r: [0, Math.PI / 2, 0] });
    }
    for (let i = 0; i < 2; i++) {
      const x = i ? W + 6 : -6;
      add(g, new THREE.BoxGeometry(1, 16, 1), toon('#ffd84d'), { p: [x, 8, H / 2] });
      add(g, new THREE.BoxGeometry(12, 0.8, 0.8), toon('#ffd84d'), { p: [x + (i ? -5 : 5), 15.6, H / 2] });
    }
    for (let i = 0; i < 14; i++) add(g, new THREE.CylinderGeometry(0.4, 0.4, 1.1, 14), toon(i % 2 ? '#8b5a2b' : '#3b82f6'), { p: [0.8 + rnd() * (W - 1.6), 0.55, rnd() < 0.5 ? 0.7 : H - 0.7], outline: true });
  } else if (th.kind === 'neon') {
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU, r = Math.max(W, H) * 0.75 + (i % 3) * 8, h = 12 + (i * 7) % 20;
      const x = W / 2 + Math.cos(a) * r, z = H / 2 + Math.sin(a) * r;
      add(g, new THREE.BoxGeometry(6, h, 6), toon('#1c1a32'), { p: [x, h / 2, z] });
      for (let k = 0; k < 4; k++) add(g, new THREE.BoxGeometry(6.05, 0.2, 6.05), basic(['#ff4fd8', '#39e6ff', '#b77bff'][(i + k) % 3]), { p: [x, 2 + k * (h / 4), z], cast: false });
    }
    for (let i = 0; i < 16; i++) torch(g, (i % 8 + 0.5) * (W / 8), 3.2, i < 8 ? 0.1 : H - 0.1, anim, 0xb77bff);
  }
  return { group: g, meshes, anim, theme: th };
}

/** The blaster you see in first person, held at the bottom right of the screen. */
function viewModel(color) {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.12, 0.14, 0.5), toon('#3b4266'), { p: [0, 0, -0.1] });
  add(g, new THREE.BoxGeometry(0.1, 0.2, 0.12), toon('#23263f'), { p: [0, -0.14, 0.05], r: [0.3, 0, 0] });
  add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.28, 10), shiny('#8d96a8'), { p: [0, 0.02, -0.46], r: [Math.PI / 2, 0, 0] });
  add(g, new THREE.BoxGeometry(0.13, 0.03, 0.3), toon(color), { p: [0, 0.075, -0.1], s: [0.6, 1, 1], cast: false });
  const tip = add(g, new THREE.SphereGeometry(0.035, 10, 8), basic('#6ee7ff'), { p: [0, 0.02, -0.61], cast: false });
  const flash = new THREE.Sprite(additive(glowTexture, 0xfff6b0, 0));
  flash.scale.setScalar(0.4);
  tip.add(flash);
  g.traverse((o) => { o.castShadow = false; if (o.material) o.material.depthTest = true; });
  g.scale.setScalar(0.72);
  g.position.set(0.3, -0.3, -0.6);
  return { group: g, flash };
}

export function arena(stage) {
  const sun = stage.lights({ background: '#8fd0ff', sunPos: [30, 60, 20], box: 45, hemi: 1.25 });
  const orbit = stage.useOrbit({ yaw: 0, pitch: 0, dist: 0.01, minDist: 0.01, maxDist: 0.01, height: EYE, minPitch: -1.35, maxPitch: 1.35 });
  orbit.fps = true;
  const oldFov = stage.camera.fov;
  stage.camera.fov = 72;
  stage.camera.updateProjectionMatrix();
  stage.scene.add(stage.camera); // so the blaster in your hands renders
  const gun = viewModel(colorOf(S.me));
  stage.camera.add(gun.group);
  const sparks = new Sparks(stage.scene);
  const texts = new FloatText(stage.scene);
  stage.hud.innerHTML = `
    <div class="hud-panel ar-top"><b class="ar-map"></b><span>first to <b class="target">7</b> knockouts</span></div>
    <div class="hud-panel ar-board"></div>
    <div class="hud-panel arena-feed hidden"></div>
    <div class="ar-cross"><i></i><i></i><i></i><i></i><b></b></div>
    <div class="hud-panel ar-bottom"><div class="ar-hearts"></div><div class="meter"><i></i><span>SLIDE</span></div><div class="buffs"></div></div>
    <div class="hud-panel ar-lock hidden">🖱️ Click to look around · <kbd>Esc</kbd> frees the mouse</div>
    <div class="hud-panel ar-break hidden"></div>
    <p class="hud-panel arena-help">WASD move · mouse look · click or hold to shoot · <kbd>Space</kbd> jump · <kbd>Shift</kbd> slide · grab the glowing power-ups</p>`;
  const $h = (s) => stage.hud.querySelector(s);
  const boardEl = $h('.ar-board'), feedEl = $h('.arena-feed'), crossEl = $h('.ar-cross'), lockEl = $h('.ar-lock');
  const slideEl = $h('.meter'), buffsEl = $h('.buffs'), heartsEl = $h('.ar-hearts'), breakEl = $h('.ar-break');

  const fighters = new Map();
  const items = new Map();
  let level = null, mapInfo = null;
  let bullets = [], shotId = 0, lastShot = 0, lastSend = 0, safeUntil = 0, maxHp = 3, feed = [];
  let firing = false, tapped = false, breakUntil = 0, breakBoard = null, hitMark = 0, bob = 0, recoil = 0;
  let jump = { h: 0, v: 0 }, slide = { t: 0, cd: 0, dx: 0, dy: 0 };
  const picking = new Set();
  const AW = () => mapInfo?.w ?? 1200, AH = () => mapInfo?.h ?? 900;
  const to3 = (x, y) => [x / K, y / K];

  const walls = () => mapInfo?.walls ?? [];
  const inWall = (x, y) => walls().some(([px, py, pw, ph]) => x > px && x < px + pw && y > py && y < py + ph);
  const circleHitsWall = (x, y) => walls().some(([px, py, pw, ph]) => {
    const dx = Math.max(px - x, 0, x - (px + pw)), dy = Math.max(py - y, 0, y - (py + ph));
    return Math.hypot(dx, dy) < PR;
  });

  function setMap(map) {
    if (level && mapInfo?.id === map.id) { mapInfo = map; return; }
    if (level) stage.scene.remove(level.group);
    mapInfo = map;
    level = buildLevel(map);
    stage.scene.add(level.group);
    stage.scene.background = new THREE.Color(level.theme.sky);
    stage.scene.fog = new THREE.Fog(level.theme.fog, 35, 140);
    sun.target.position.set(map.w / K / 2, 0, map.h / K / 2);
    sun.position.set(map.w / K / 2 + 20, 60, map.h / K / 2 + 15);
    $h('.ar-map').textContent = `⚔️ ${map.name}`;
  }

  const renderBoard = () => {
    boardEl.innerHTML = `<table><tr><th></th><th>K</th><th>D</th></tr>${[...fighters.entries()].sort((a, b) => b[1].score - a[1].score || (a[1].deaths ?? 0) - (b[1].deaths ?? 0))
      .map(([k, f]) => `<tr class="${k === S.me ? 'me' : ''}"><td><i class="dot" style="--c:${colorOf(k)}"></i>${esc(nameOf(k))}</td><td>${f.score}</td><td>${f.deaths ?? 0}</td></tr>`).join('')}</table>`;
  };
  const addFighter = (k, f) => {
    const p = stage.person(k);
    p.char.setProp('blaster');
    p.char.aiming = true;
    fighters.set(k, { ...f, tx: f.x, ty: f.y, h: 0, p, hurt: 0, buffs: {} });
  };
  const removeFighter = (k) => {
    const f = fighters.get(k);
    if (f?.bubble) stage.scene.remove(f.bubble);
    fighters.delete(k);
    stage.removePerson(k);
  };
  const burstAt = (x, y, color, n = 12, h = 1) => { const [X, Z] = to3(x, y); sparks.burst(X, h, Z, color, { n }); };

  function addItem(it) {
    const look = ITEM_LOOK[it.kind];
    const g = new THREE.Group();
    const [x, z] = to3(it.x, it.y);
    g.position.set(x, 0, z);
    const ring = groundRing(0.6, 0.95, look.color, 0.8);
    ring.position.y = 0.04;
    g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 5, 16, 1, true), basic(look.color, { transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 2.5;
    g.add(beam);
    const s = emojiSprite(look.emoji, 1.2);
    s.position.y = 1.1;
    g.add(s);
    const glow = orb(look.color, 0.14, 7);
    glow.position.y = 1.1;
    g.add(glow);
    stage.scene.add(g);
    items.set(it.id, { ...it, g, s, ring, born: performance.now() });
  }
  function removeItem(id) {
    const it = items.get(id);
    if (!it) return;
    stage.scene.remove(it.g);
    items.delete(id);
    picking.delete(id);
  }

  // ---- input: the mouse is grabbed straight away (browsers may want one click first) ----
  const locked = () => document.pointerLockElement === stage.canvas;
  const grab = () => { if (!locked()) { try { stage.canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* not supported */ } } };
  grab();
  const onLockChange = () => { if (!locked()) firing = tapped = false; }; // letting go of the mouse always stops shooting
  document.addEventListener('pointerlockchange', onLockChange);
  const onBlur = () => { firing = tapped = false; };
  window.addEventListener('blur', onBlur);
  // belt and braces: only shoot while the left button is really held down
  const onMouseUp = (e) => { if (e.button === 0) firing = false; };
  const onMouseMove = (e) => { if (firing && e.pointerType !== 'touch' && !(e.buttons & 1)) firing = false; };
  window.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('pointermove', onMouseMove, true);
  stage.onPointer = (type, e) => {
    if (type === 'down') {
      if (!locked() && e?.pointerType === 'mouse') { grab(); return; } // that click only grabs the mouse
      // (phones: the right thumb only looks around; the Fire button shoots)
      if (e?.button === 0 && e?.pointerType === 'mouse') { firing = true; tapped = true; } // (a quick tap still fires once)
    }
    if (type === 'up') firing = false;
  };
  stage.onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (k === 'f' && !e.repeat) { firing = down; if (down) tapped = true; } // the phone's Fire button (F on a keyboard)
    if (!down || e.repeat) return;
    if (k === ' ') tryJump();
    if (k === 'shift' || k === 'c') trySlide();
  };
  /** Movement relative to where you look: W is forwards. Returns a unit vector in arena px axes. */
  function inputDir() {
    const keys = stage.keys;
    const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const r = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    if (!f && !r) return null;
    const fx = -Math.sin(orbit.yaw), fz = -Math.cos(orbit.yaw), rx = -fz, rz = fx;
    const dx = fx * f + rx * r, dy = fz * f + rz * r, l = Math.hypot(dx, dy);
    return { dx: dx / l, dy: dy / l };
  }
  function tryJump() {
    const mine = fighters.get(S.me);
    if (!mine || mine.hp <= 0 || jump.h > 0.01) return;
    jump.v = JUMP_V;
    sfx('jump', { vol: 0.6 });
  }
  function trySlide() {
    const mine = fighters.get(S.me);
    if (!mine || mine.hp <= 0 || slide.cd > 0 || jump.h > 0.01) return;
    const dir = inputDir() ?? { dx: -Math.sin(orbit.yaw), dy: -Math.cos(orbit.yaw) };
    slide = { t: SLIDE_TIME, cd: SLIDE_CD, ...dir };
    sfx('whoosh');
  }

  /** a: heading, p: pitch (> 0 aims down), h: launch height. Shots fly in a straight line along the aim. */
  function spawnBullet(owner, id, x, y, a, h = 1.15, p = 0) {
    const mesh = orb(colorOf(owner), 0.12, 4);
    stage.scene.add(mesh);
    const flat = Math.cos(p) * BULLET_SPEED;
    bullets.push({ owner, id, x, y, h, vx: Math.cos(a) * flat, vy: Math.sin(a) * flat, vh: (-Math.sin(p) * BULLET_SPEED) / K, life: BULLET_LIFE, mesh });
  }

  // ---- network --------------------------------------------------------------------
  const off = listen({
    arena: (m) => {
      setMap(m.map);
      for (const k of [...fighters.keys()]) removeFighter(k);
      Object.entries(m.players).forEach(([k, f]) => addFighter(k, f));
      for (const id of [...items.keys()]) removeItem(id);
      (m.items ?? []).forEach(addItem);
      $h('.target').textContent = m.target;
      maxHp = m.hp;
      safeUntil = performance.now() + 1500;
      breakUntil = m.brk > 0 ? performance.now() + m.brk * 1000 : 0;
      if (!breakUntil) { breakBoard = null; breakEl.classList.add('hidden'); }
      const mine = fighters.get(S.me);
      if (mine) { orbit.yaw = Math.atan2(mine.x - AW() / 2, mine.y - AH() / 2); orbit.pitch = 0; } // face the middle
      renderBoard();
    },
    arena_add: (m) => { addFighter(m.k, m); renderBoard(); },
    arena_del: (m) => { removeFighter(m.k); renderBoard(); },
    arena_pos: (m) => { const f = fighters.get(m.k); if (f) { f.tx = m.x; f.ty = m.y; f.a = m.a; f.h = m.h ?? 0; f.sl = m.sl; } },
    arena_shot: (m) => {
      const f = fighters.get(m.k);
      spawnBullet(m.k, m.id, m.x, m.y, m.a, m.h ?? 1.15 + (f?.h ?? 0), m.p ?? 0);
      const me2 = fighters.get(S.me);
      const d = f && me2 ? Math.hypot(f.x - me2.x, f.y - me2.y) : 600;
      sfx('shoot_far', { vol: Math.max(0.15, 1 - d / 900) });
    },
    arena_hp: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      f.hp = m.hp;
      if (m.heal) { burstAt(f.x, f.y, '#ff9fb4', 16, 1.2); return; }
      f.hurt = performance.now();
      burstAt(f.x, f.y, '#ffffff', 10, 1.2);
      if (m.k === S.me) { stage.shake(0.35); sfx('hurt'); } else sfx('hit', { vol: 0.6 });
    },
    arena_ko: (m) => {
      const victim = fighters.get(m.k), killer = fighters.get(m.by);
      if (victim) { victim.hp = 0; victim.deaths = m.deaths ?? (victim.deaths ?? 0) + 1; burstAt(victim.x, victim.y, colorOf(m.k), 40, 1); }
      if (killer) killer.score = m.score;
      sfx('ko', { vol: m.k === S.me || m.by === S.me ? 1 : 0.5 });
      feed = [{ text: `${nameOf(m.by)} ⚔ ${nameOf(m.k)}`, at: performance.now() }, ...feed].slice(0, 5);
      renderBoard();
      if (m.k === S.me) { firing = tapped = false; stage.banner(`💥 ${esc(nameOf(m.by))} got you! Respawning…`, 1800); }
      else if (m.by === S.me) { stage.banner(`⚔️ You knocked out ${esc(nameOf(m.k))}! +20 🪙`, 1800); hitMark = performance.now() + 400; }
    },
    arena_spawn: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      Object.assign(f, { x: m.x, y: m.y, tx: m.x, ty: m.y, hp: m.hp });
      burstAt(m.x, m.y, '#9fe8ff', 16, 1);
      if (m.k === S.me) { safeUntil = performance.now() + 1500; sfx('spawn'); jump = { h: 0, v: 0 }; }
    },
    arena_round: (m) => {
      sfx(m.winner === S.me ? 'win' : 'cheer');
      firing = tapped = false;
      breakUntil = performance.now() + m.secs * 1000;
      breakBoard = m;
      renderBreak();
      breakEl.classList.remove('hidden');
    },
    arena_item: (m) => { addItem(m.item); sfx('pop', { vol: 0.5 }); },
    arena_shield_pop: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      f.buffs.shield = 0;
      burstAt(f.x, f.y, '#9fe8ff', 16, 1.2);
    },
    arena_item_gone: (m) => {
      const it = items.get(m.id);
      if (it) burstAt(it.x, it.y, '#ffffff', 10, 1);
      removeItem(m.id);
    },
    arena_picked: (m) => {
      const it = items.get(m.id);
      if (it) burstAt(it.x, it.y, ITEM_LOOK[m.kind].color, 20, 1);
      removeItem(m.id);
      const f = fighters.get(m.k);
      if (f && BUFF_TIME[m.kind]) f.buffs[m.kind] = performance.now() + BUFF_TIME[m.kind] * 1000;
      if (m.k === S.me) {
        sfx(m.kind === 'shield' ? 'shield' : 'powerup');
        stage.banner(`${ITEM_LOOK[m.kind].emoji} ${ITEM_LOOK[m.kind].label}`, 1200);
      }
    },
  });

  /** The between-rounds board: winner, everyone's kills and deaths, and what map is next. */
  function renderBreak() {
    const m = breakBoard;
    if (!m) return;
    const left = Math.max(0, Math.ceil((breakUntil - performance.now()) / 1000));
    breakEl.innerHTML = `<div class="big">🏆 ${esc(nameOf(m.winner))} wins the round!</div>
      <table class="ar-kd"><tr><th>#</th><th>Player</th><th>Kills</th><th>Deaths</th><th>K/D</th></tr>
      ${m.board.map((e, i) => `<tr class="${e.k === S.me ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][i] ?? i + 1}</td><td><i class="dot" style="--c:${colorOf(e.k)}"></i>${esc(nameOf(e.k))}</td><td>${e.kills}</td><td>${e.deaths}</td><td>${(e.kills / Math.max(1, e.deaths)).toFixed(1)}</td></tr>`).join('')}</table>
      <p>Next map: <b>${esc(m.next)}</b> in <b class="ar-count">${left}</b>s</p>`;
  }

  // ---- simulation --------------------------------------------------------------------
  stage.onFrame((dt, now) => {
    const t = now / 1000;
    slide.cd = Math.max(0, slide.cd - dt);
    const mine = fighters.get(S.me);
    const has = (f, b) => (f.buffs[b] ?? 0) > now;
    const onBreak = now < breakUntil;
    if (!onBreak && breakBoard) { breakBoard = null; breakEl.classList.add('hidden'); }
    if (onBreak && breakBoard) { const c = breakEl.querySelector('.ar-count'); const left = String(Math.max(0, Math.ceil((breakUntil - now) / 1000))); if (c && c.textContent !== left) c.textContent = left; }

    // jumping: a simple arc
    if (jump.h > 0 || jump.v > 0) {
      jump.v -= GRAVITY * dt;
      jump.h = Math.max(0, jump.h + jump.v * dt);
      if (jump.h === 0) { jump.v = 0; sfx('land', { vol: 0.3 }); }
    }

    if (mine && mine.hp > 0) {
      let vx = 0, vy = 0;
      const dir = inputDir();
      const speed = MOVE_SPEED * (has(mine, 'speed') ? 1.45 : 1);
      if (slide.t > 0) {
        slide.t -= dt;
        const k = Math.max(0, slide.t / SLIDE_TIME);
        vx = slide.dx * (speed + (SLIDE_SPEED - speed) * k);
        vy = slide.dy * (speed + (SLIDE_SPEED - speed) * k);
        if (Math.random() < 0.5) { const [X, Z] = to3(mine.x, mine.y); sparks.puff(X, 0.15, Z, '#ffffff', 0.8, 0.3); }
      } else if (dir) {
        vx = dir.dx * speed;
        vy = dir.dy * speed;
      }
      mine.moving = !!(vx || vy);
      if (mine.moving) {
        const nx = Math.min(AW() - 16, Math.max(16, mine.x + vx * dt));
        if (!circleHitsWall(nx, mine.y)) mine.x = nx;
        const ny = Math.min(AH() - 16, Math.max(16, mine.y + vy * dt));
        if (!circleHitsWall(mine.x, ny)) mine.y = ny;
      }
      // phones: a gentle aim assist while shooting, pulling the view towards someone close to the crosshair
      if (touch.enabled && firing) {
        let best = null, bestErr = 0.16;
        for (const [k, f] of fighters) {
          if (k === S.me || f.hp <= 0) continue;
          const want = Math.atan2(-(f.x - mine.x), -(f.y - mine.y));
          const err = Math.atan2(Math.sin(want - orbit.yaw), Math.cos(want - orbit.yaw));
          if (Math.abs(err) < Math.abs(bestErr) && Math.hypot(f.x - mine.x, f.y - mine.y) < 900) { best = err; bestErr = err; }
        }
        if (best != null) orbit.yaw += best * Math.min(1, dt * 5);
      }
      mine.a = Math.atan2(-Math.cos(orbit.yaw), -Math.sin(orbit.yaw)); // where you look
      mine.h = jump.h;
      if (now - lastSend > 50) {
        lastSend = now;
        net.send('arena_move', { x: mine.x, y: mine.y, a: mine.a, h: jump.h, sl: slide.t > 0 });
      }
      // click or hold to shoot (only while the button is down, never on its own)
      if ((firing || tapped) && !onBreak && now - lastShot > (has(mine, 'rapid') ? 120 : 240)) {
        lastShot = now;
        tapped = false;
        const id = ++shotId;
        // from your eyes, straight down the crosshair (up, down and all)
        const pitch = orbit.pitch, reach = 24 * Math.cos(pitch);
        const x = mine.x + Math.cos(mine.a) * reach, y = mine.y + Math.sin(mine.a) * reach;
        const h0 = Math.max(0.1, orbit.height - (Math.sin(pitch) * 24) / K);
        if (!inWall(x, y) || h0 > WALL_H) {
          spawnBullet(S.me, id, x, y, mine.a, h0, pitch);
          recoil = 1;
          gun.flash.material.opacity = 1;
          sfx('shoot');
          net.send('arena_shoot', { id, x, y, a: mine.a, h: h0, p: pitch });
        }
      }
      for (const it of items.values()) {
        if (!picking.has(it.id) && Math.hypot(it.x - mine.x, it.y - mine.y) < 32) {
          picking.add(it.id);
          net.send('arena_pick', { id: it.id });
        }
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
      p.y = f.h ?? 0;
      p.heading = Math.atan2(Math.cos(f.a ?? 0), Math.sin(f.a ?? 0));
      p.moving = !!f.moving && !f.sl;
      p.char.pose = f.sl ? 'sit' : 'idle';
      p.speed = has(f, 'speed') ? 1.9 : 1.3;
      const blink = f.hurt && now - f.hurt < 250 && Math.floor(now / 50) % 2;
      p.visible = k !== S.me && f.hp > 0 && !blink; // you don't see your own body in first person
      p.sub.textContent = f.hp > 0 && k !== S.me ? '❤'.repeat(Math.max(0, f.hp)) + '♡'.repeat(Math.max(0, maxHp - f.hp)) : '';
      const shielded = has(f, 'shield') || (k === S.me && now < safeUntil);
      if (k !== S.me && shielded && !f.bubble) {
        f.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.25, depthWrite: false }));
        stage.scene.add(f.bubble);
      }
      if (f.bubble) {
        f.bubble.visible = shielded && f.hp > 0;
        f.bubble.position.set(x, 1 + (f.h ?? 0), z);
        f.bubble.material.opacity = 0.18 + Math.sin(now / 90) * 0.08;
      }
    }

    bullets = bullets.filter((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.h += b.vh * dt;
      b.life -= dt;
      const [X, Z] = to3(b.x, b.y);
      b.mesh.position.set(X, b.h, Z);
      let dead = b.life <= 0 || b.h <= 0.03 || b.x < 0 || b.x > AW() || b.y < 0 || b.y > AH() || (inWall(b.x, b.y) && b.h < WALL_H);
      if (!dead) {
        for (const [k, f] of fighters) {
          if (k === b.owner || f.hp <= 0 || Math.hypot(f.x - b.x, f.y - b.y) > PR + 7) continue;
          // jump over a shot, or slide under a high one
          const bottom = f.h ?? 0, top = bottom + (f.sl || (k === S.me && slide.t > 0) ? 0.9 : 1.8);
          if (b.h < bottom || b.h > top) continue;
          dead = true;
          if (b.owner === S.me) hitMark = Math.max(hitMark, now + 180);
          // only the player who got hit reports it, so everyone agrees on one source of truth
          if (k === S.me && now > safeUntil && !has(f, 'shield')) net.send('arena_hit', { by: b.owner, id: b.id });
          else if (has(f, 'shield')) {
            // the shield soaks up this one hit, then pops
            f.buffs.shield = 0;
            sparks.burst(X, b.h, Z, '#9fe8ff', { n: 20, speed: 4 });
            sfx('pop');
            if (k === S.me) { net.send('arena_shield_pop'); stage.banner('🛡️ Shield broke!', 900); }
          }
          break;
        }
      }
      if (dead) {
        sparks.burst(X, b.h, Z, colorOf(b.owner), { n: 6, speed: 3 });
        stage.scene.remove(b.mesh);
        return false;
      }
      return true;
    });

    for (const it of items.values()) {
      it.s.position.y = 1.1 + Math.sin(now / 250 + it.id) * 0.2;
      it.ring.rotation.z = now / 600;
      it.g.visible = now - it.born < 5000 || Math.floor(now / 110) % 2 === 0; // blinks before it vanishes
    }

    // first-person camera: at your eyes (lower while sliding), plus a little head bob and gun sway
    const mineF = fighters.get(S.me);
    if (mineF) {
      const [x, z] = to3(mineF.x, mineF.y);
      const low = slide.t > 0 ? 0.65 : 0;
      if (mineF.moving && jump.h === 0 && slide.t <= 0) bob += dt * 11;
      orbit.height = EYE - low + jump.h + Math.sin(bob) * 0.04;
      orbit.target.set(x, 0, z);
    }
    recoil = Math.max(0, recoil - dt * 8);
    gun.flash.material.opacity = Math.max(0, gun.flash.material.opacity - dt * 14);
    gun.group.position.set(0.3 + Math.sin(bob * 0.5) * 0.012, -0.3 + Math.abs(Math.cos(bob * 0.5)) * 0.01 - (slide.t > 0 ? 0.04 : 0), -0.6 + recoil * 0.06);
    gun.group.rotation.x = recoil * 0.12;
    gun.group.visible = !!mineF && mineF.hp > 0 && !onBreak;
    for (const fn of level?.anim ?? []) fn(t, fighters.size > 1 ? 1.2 : 0.4);
    sparks.update(dt);
    texts.update(dt);

    crossEl.classList.toggle('hit', now < hitMark);
    crossEl.classList.toggle('hidden', !mineF || mineF.hp <= 0 || onBreak);
    lockEl.classList.toggle('hidden', locked() || onBreak || !!('ontouchstart' in window));
    heartsEl.innerHTML = mineF ? '❤'.repeat(Math.max(0, mineF.hp)) + '<s>' + '♡'.repeat(Math.max(0, maxHp - mineF.hp)) + '</s>' + (now < safeUntil || (mineF && has(mineF, 'shield')) ? ' 🫧' : '') : '';
    const ready = 1 - slide.cd / SLIDE_CD;
    slideEl.querySelector('i').style.width = `${ready * 100}%`;
    slideEl.classList.toggle('ready', ready >= 1);
    buffsEl.innerHTML = mineF ? Object.entries(mineF.buffs).filter(([, until]) => until > now)
      .map(([b, until]) => `<span>${ITEM_LOOK[b].emoji} ${Math.ceil((until - now) / 1000)}s</span>`).join('') : '';
    feed = feed.filter((e) => now - e.at < 5000);
    feedEl.innerHTML = feed.map((e) => `<div>${esc(e.text)}</div>`).join('');
    feedEl.classList.toggle('hidden', !feed.length);
  });

  return () => {
    off();
    document.removeEventListener('pointerlockchange', onLockChange);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('mouseup', onMouseUp, true);
    window.removeEventListener('pointermove', onMouseMove, true);
    if (locked()) document.exitPointerLock();
    for (const b of bullets) stage.scene?.remove(b.mesh);
    for (const id of [...items.keys()]) removeItem(id);
    stage.camera.remove(gun.group);
    stage.scene?.remove(stage.camera);
    stage.camera.fov = oldFov;
    stage.camera.updateProjectionMatrix();
    if (stage.scene) stage.scene.fog = null;
    if (level) stage.scene?.remove(level.group);
  };
}
