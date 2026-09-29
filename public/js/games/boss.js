// Boss Cave (3D): everyone who walks in fights the same boss together. The server runs the boss and
// its attack patterns; each player dodges and reports their own hits (like the arena).
// WASD move · mouse aim · click shoot · Space/Shift dash (invulnerable mid-dash).
// Game logic runs in cave pixels (900 x 600, like the server); 20 px = 1 world unit.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf, colorOf, fmt } from '../state.js';
import { ITEMS, CATALOG } from '../catalog.js';
import { toon, basic, canvasTexture, outlineMaterial, additive, glowTexture, TAU } from '../three/materials.js';
import { Sparks, FloatText, orb, groundRing, groundDisc } from '../three/fx.js';
import { sfx, ambient } from '../sfx.js';
import { listen, confetti } from './util.js';

const W = 900, H = 600, K = 20, PR = 14, BULLET_SPEED = 680, BULLET_LIFE = 1.1, MOVE_SPEED = 250;
const DASH_TIME = 0.18, DASH_SPEED = 820, DASH_COOLDOWN = 1.2;
const REVIVE_R = 60;
const FURN = Object.fromEntries(CATALOG.furniture.map((f) => [f.id, f]));
const THEMES = {
  slime: { floor: ['#3d7050', '#1b3a2a'], crystal: '#8dff9a', rock: '#3f6b4c', orb: '#3fcf5a', fog: '#10261a' },
  golem: { floor: ['#66637e', '#302e45'], crystal: '#ffb45a', rock: '#6d6a85', orb: '#ff8c2e', fog: '#1a1826' },
  dragon: { floor: ['#4a2b66', '#170b26'], crystal: '#c77dff', rock: '#4b2d66', orb: '#d23cff', fog: '#140820' },
};
const BOSS_EMOJI = { slime: '🟢', golem: '🗿', dragon: '🐉' };
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
  add(g, new THREE.PlaneGeometry(160, 160), toon('#120c1c'), { p: [0, -0.03, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
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
  return { group: g, floorMat, crystalMat, glowMat, lights };
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

const BUILD = { slime: buildSlime, golem: buildGolem, dragon: buildDragon };

// ---------------------------------------------------------------------------

export function boss(stage) {
  env ||= buildCave();
  stage.lights({ background: '#0b0714', sky: 0xb8a8ff, ground: 0x1a1030, hemi: 0.75, sun: 1.2, sunPos: [10, 40, 18], box: 30, fog: ['#0b0714', 40, 90] });
  stage.scene.add(env.group);
  const orbit = stage.useOrbit({ yaw: 0, pitch: 1.0, dist: 25, minDist: 15, maxDist: 34, height: 0 });
  orbit.fixed = true;
  const sparks = new Sparks(stage.scene, 300);
  const texts = new FloatText(stage.scene);
  const cave = ambient('cave');
  cave.set(0.8);
  stage.hud.innerHTML = `
    <div class="hud-panel boss-bar hidden"><div class="bb-name"></div><div class="bb-track"><i class="lag"></i><i class="hp"></i><b></b></div></div>
    <div class="hud-panel arena-scores boss-meter"></div>
    <div class="hud-panel arena-bottom"><div class="meter"><i></i><span>DASH</span></div></div>
    <p class="hud-panel arena-help">Team up! WASD move · mouse aim · click/hold shoot · <kbd>Space</kbd>/<kbd>Shift</kbd> dash (can't be hit mid-dash) · dodge the red zones · stand by a downed friend to revive them</p>`;
  const barEl = stage.hud.querySelector('.boss-bar'), meterEl = stage.hud.querySelector('.boss-meter'), dashEl = stage.hud.querySelector('.meter');
  stage.canvas.style.cursor = 'crosshair';

  const fighters = new Map();
  let boss = null, model = null, th = THEMES.slime, maxHp = 5, kills = 0;
  let bullets = [], shots = [], zones = [], lanes = [], rocks = [], timers = [], dmgBy = {};
  let firing = false, lastShot = 0, lastSend = 0, safeUntil = 0, aim = { x: W / 2, y: H / 2 };
  let dash = { t: 0, cd: 0, dx: 0, dy: 0 }, lagHp = 0;
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

  function addFighter(k, f) {
    const p = stage.person(k);
    p.char.setProp('blaster');
    p.char.aiming = true;
    fighters.set(k, { ...f, tx: f.x, ty: f.y, p, rev: 0, hurt: 0 });
  }
  function removeFighter(k) {
    const f = fighters.get(k);
    if (f?.ring) stage.scene.remove(f.ring, f.revArc);
    fighters.delete(k);
    stage.removePerson(k);
  }

  function clearAttacks() {
    for (const list of [zones, lanes, shots, rocks]) for (const o of list) stage.scene?.remove(o.mesh);
    zones = []; lanes = []; shots = []; rocks = []; timers = [];
  }

  function setBoss(b) {
    if (model) stage.scene.remove(model.g);
    model = null;
    clearAttacks();
    boss = b ? { ...b, tx: b.x, ty: b.y, hurtAt: 0, spawnAt: performance.now(), deadAt: 0, hop: null, chargeUntil: 0 } : null;
    lagHp = b?.hp ?? 0;
    dmgBy = {};
    if (boss) {
      th = theme(boss.id);
      model = (BUILD[boss.id] ?? buildSlime)(boss.r / K);
      model.g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      stage.scene.add(model.g);
      stage.scene.fog.color.set(th.fog);
    }
    renderMeter();
  }

  function renderMeter() {
    meterEl.innerHTML = [...fighters.keys()].map((k) => [k, dmgBy[k] ?? 0]).sort((a, b) => b[1] - a[1])
      .map(([k, d]) => `<span style="--c:${colorOf(k)}"><i class="dot"></i>${esc(nameOf(k))} <b>${fmt(d)}</b></span>`).join('')
      + `<span class="muted">Bosses beaten: <b>${kills}</b></span>`;
  }

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
    dash = { t: DASH_TIME, cd: DASH_COOLDOWN, ...dir };
    burstAt(mine.x, mine.y, '#ffffff', 10, 0.5);
    sfx('dash');
  }

  /** You got caught by something: tell the server (it applies i-frames and HP). */
  function hurt() {
    const mine = fighters.get(S.me);
    const now = performance.now();
    if (!mine || mine.hp <= 0 || now < safeUntil || dash.t > 0 || boss?.st !== 'fight') return;
    safeUntil = now + 900;
    net.send('boss_hurt');
  }
  const meInside = (x, y, r) => {
    const mine = fighters.get(S.me);
    return mine && mine.hp > 0 && Math.hypot(mine.x - x, mine.y - y) < r + PR * 0.4;
  };

  // ---- attacks -----------------------------------------------------------------
  function zone(x, y, r, start, fire, rock = false) {
    const [X, Z] = to3(x, y);
    const g = new THREE.Group();
    g.position.set(X, 0.04, Z);
    const outline = groundRing(r / K - 0.08, r / K, '#ff5d73', 0.9);
    const fill = groundDisc(r / K, '#ff3b50', 0.28);
    const grow = groundDisc(r / K, '#ff3b50', 0.4);
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
    if (!boss) return;
    const now = performance.now();
    const fire = now + m.d * 1000;
    if (m.kind === 'slam' || m.kind === 'rocks') {
      sfx('warn');
      for (const [x, y] of m.c) zone(x, y, m.r, now, fire, m.kind === 'rocks');
      boss.chargeUntil = fire;
      later(fire, () => {
        sfx('slam', { vol: m.kind === 'rocks' ? 0.75 : 1 });
        stage.shake(m.kind === 'rocks' ? 0.5 : 0.8);
        for (const [x, y] of m.c) {
          burstAt(x, y, m.kind === 'rocks' ? '#b8b2cf' : th.crystal, 18, 0.3, 7);
          if (meInside(x, y, m.r)) hurt();
        }
      });
    } else if (m.kind === 'volley' || m.kind === 'spiral') {
      boss.chargeUntil = fire;
      if (m.kind === 'spiral') sfx('charge');
      for (let w = 0; w < m.waves; w++) {
        later(fire + w * m.gap * 1000, () => {
          if (!boss || boss.st !== 'fight') return;
          sfx('volley', { vol: m.kind === 'spiral' ? 0.6 : 1 });
          for (let i = 0; i < m.n; i++) {
            const a = m.off + w * m.rot + (i * TAU) / m.n;
            const mesh = orb(th.orb, 0.3, 3.2);
            stage.scene.add(mesh);
            shots.push({ x: boss.x + Math.cos(a) * boss.r * 0.6, y: boss.y + Math.sin(a) * boss.r * 0.6, vx: Math.cos(a) * m.sp, vy: Math.sin(a) * m.sp, r: 10, life: 4.5, mesh });
          }
        });
      }
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
        if (meInside(m.tx, m.ty, m.r)) hurt();
      });
    }
  }

  // ---- network ------------------------------------------------------------------
  const off = listen({
    boss: (m) => {
      for (const k of [...fighters.keys()]) removeFighter(k);
      Object.entries(m.fighters).forEach(([k, f]) => addFighter(k, f));
      maxHp = m.hp;
      kills = m.kills;
      setBoss(m.boss);
      safeUntil = performance.now() + 1500;
      if (!m.boss) stage.banner('The cave is quiet… a boss is on its way!');
      else if (m.boss.st === 'fight') stage.banner(`<div class="big">${BOSS_EMOJI[m.boss.id] ?? '👾'} ${esc(m.boss.name)}</div>A fight is underway. Jump in!`);
    },
    boss_spawn: (m) => {
      kills = m.kills;
      setBoss(m.boss);
      sfx('roar');
      stage.shake(0.6);
      const tier = m.boss.tier ? ` <span class="muted">(Tier ${m.boss.tier + 1})</span>` : '';
      stage.banner(`<div class="big">${BOSS_EMOJI[m.boss.id] ?? '👾'} ${esc(m.boss.name)} appears!</div>Get ready…${tier}`, 3000);
    },
    boss_phase: (m) => {
      if (!boss) return;
      if (m.st === 'fight') { boss.st = 'fight'; stage.banner('<div class="big">FIGHT!</div>', 1200); sfx('go'); }
      if (m.st === 'enraged') {
        boss.enraged = true;
        sfx('enrage');
        stage.shake(0.8);
        stage.banner(`<div class="big">😡 ${esc(boss.name)} is enraged!</div>Its attacks are faster now.`, 2400);
      }
    },
    boss_s: (m) => {
      if (!boss) return;
      boss.tx = m.x; boss.ty = m.y; boss.hp = m.hp; boss.max = m.max;
      for (const [k, f] of fighters) f.rev = m.rev[k] ?? 0;
    },
    boss_atk: onAttack,
    boss_dmg: (m) => {
      if (!boss) return;
      boss.hp = m.hp;
      boss.hurtAt = performance.now();
      dmgBy[m.k] = (dmgBy[m.k] ?? 0) + m.d;
      renderMeter();
      const mine = m.k === S.me;
      const [X, Z] = to3(boss.x, boss.y);
      if (mine || m.crit) texts.add(m.crit ? `CRIT ${m.d}!` : `${m.d}`, X + (Math.random() - 0.5) * 2, (boss.r / K) * 2.2 + airHeight() / K, Z, m.crit ? '#ffd84d' : mine ? '#ffffff' : colorOf(m.k), m.crit ? 1.2 : 0.9);
      sfx('bosshit', { vol: mine ? 1 : 0.35, crit: m.crit && mine });
    },
    boss_add: (m) => { addFighter(m.k, m); renderMeter(); },
    boss_del: (m) => { removeFighter(m.k); renderMeter(); },
    boss_pos: (m) => { const f = fighters.get(m.k); if (f) { f.tx = m.x; f.ty = m.y; f.a = m.a; } },
    boss_shot: (m) => {
      const mesh = orb(colorOf(m.k), 0.14, 4);
      stage.scene.add(mesh);
      bullets.push({ owner: m.k, x: m.x, y: m.y, vx: Math.cos(m.a) * BULLET_SPEED, vy: Math.sin(m.a) * BULLET_SPEED, life: BULLET_LIFE, mesh });
      sfx('shoot_far');
    },
    boss_hp: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      f.hp = m.hp;
      f.hurt = performance.now();
      burstAt(f.x, f.y, '#ffffff', 10, 1.2);
      if (m.k === S.me) { stage.shake(0.5); sfx('hurt'); } else sfx('hit', { vol: 0.4 });
    },
    boss_down: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      f.hp = 0;
      burstAt(f.x, f.y, colorOf(m.k), 26, 1);
      if (m.k === S.me) { sfx('down'); stage.banner('💫 You\'re down! A friend can revive you, or you\'ll get up in 10s.', 3500); }
      else { sfx('down', { vol: 0.5 }); stage.banner(`💫 ${esc(nameOf(m.k))} is down! Stand next to them to revive.`, 2400); }
    },
    boss_up: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      f.hp = m.hp;
      f.rev = 0;
      burstAt(f.x, f.y, '#9fe8ff', 18, 1);
      sfx('revive', { vol: m.k === S.me ? 1 : 0.5 });
      if (m.k === S.me) safeUntil = performance.now() + 1200;
    },
    boss_dead: (m) => {
      if (!boss) return;
      boss.st = 'dead';
      boss.hp = 0;
      boss.deadAt = performance.now();
      clearAttacks();
      kills += 1;
      sfx('bossdie');
      stage.shake(1.4);
      const bx = boss.x, by = boss.y;
      for (let i = 0; i < 4; i++) setTimeout(() => burstAt(bx + (Math.random() - 0.5) * 60, by + (Math.random() - 0.5) * 60, ['#ffffff', '#ffd84d', '#ff5d73', th.crystal][i], 50, 2, 9), i * 180);
      setTimeout(() => confetti(stage.hud, { count: 160 }), 700);
      const mine = m.results[S.me];
      const loot = (mine?.loot ?? []).map((id) => ITEMS[id]?.name ?? FURN[id]?.name).filter(Boolean);
      stage.banner(`<div class="big">🏆 ${esc(m.name)} defeated!</div>
        ${m.mvp ? `MVP: <b>${esc(nameOf(m.mvp))}</b><br>` : ''}
        ${mine ? `You: +${fmt(mine.coins)} 🪙 · +${mine.xp} XP · ${fmt(mine.dmg)} damage` : ''}
        ${loot.length ? `<br>✨ Loot: <b>${loot.map(esc).join(', ')}</b>` : ''}
        <br><span class="muted small">The next boss arrives soon…</span>`, 7500);
      renderMeter();
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
        vx = dir.dx * MOVE_SPEED;
        vy = dir.dy * MOVE_SPEED;
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
      if (firing && now - lastShot > 230 && boss?.st === 'fight') {
        lastShot = now;
        const x = mine.x + Math.cos(mine.a) * 26, y = mine.y + Math.sin(mine.a) * 26;
        const mesh = orb(colorOf(S.me), 0.14, 4);
        stage.scene.add(mesh);
        bullets.push({ owner: S.me, x, y, vx: Math.cos(mine.a) * BULLET_SPEED, vy: Math.sin(mine.a) * BULLET_SPEED, life: BULLET_LIFE, mesh });
        burstAt(x, y, '#fff6b0', 5, 1.1);
        sfx('shoot');
        net.send('boss_shoot', { x, y, a: mine.a });
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
      p.sub.textContent = f.hp > 0 ? '❤'.repeat(Math.max(0, f.hp)) + '♡'.repeat(Math.max(0, maxHp - f.hp)) : (k === S.me ? '💫 down' : '💫 REVIVE ME');
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

    if (boss && model) {
      const bl = 1 - Math.exp(-dt * 16);
      const bx = boss.x;
      boss.x += (boss.tx - boss.x) * bl;
      boss.y += (boss.ty - boss.y) * bl;
      boss.moving = Math.abs(boss.x - bx) > 0.2;
      lagHp += (boss.hp - lagHp) * Math.min(1, dt * 3);
      const lift = airHeight(now);
      if (boss.st === 'fight' && !lift && meInside(boss.x, boss.y, boss.r * 0.85)) hurt();
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
      for (const m of model.mats) m.emissive?.setScalar(flash ? 0.45 : 0);
      bossShadow.visible = model.g.visible;
      bossShadow.position.set(X, 0.03, Z);
      bossShadow.scale.setScalar(Math.max(0.1, (boss.r / K) * 1.1 * (1 - lift / 400)));
      if (boss.enraged && boss.st === 'fight' && Math.random() < 0.3) sparks.puff(X + (Math.random() - 0.5) * 3, Math.random() * 4 + lift / K, Z + (Math.random() - 0.5) * 3, boss.id === 'dragon' ? '#c77dff' : '#ff5d5d', 0.8, 0.5);
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
      if (!dead && boss && boss.st === 'fight' && airHeight(now) < 60 && Math.hypot(boss.x - b.x, boss.y - b.y) < boss.r * 0.95) {
        dead = true;
        sparks.burst(X, 1.3, Z, colorOf(b.owner), { n: 7, speed: 3 });
        if (b.owner === S.me) net.send('boss_hit');
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
        hurt();
        sparks.burst(X, 1.1, Z, th.orb, { n: 8 });
        dead = true;
      }
      if (dead) stage.scene.remove(s.mesh);
      return !dead;
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
    const ready = 1 - dash.cd / DASH_COOLDOWN;
    dashEl.querySelector('i').style.width = `${ready * 100}%`;
    dashEl.classList.toggle('ready', ready >= 1);
  });

  return () => {
    off();
    cave.stop();
    clearAttacks();
    for (const b of bullets) stage.scene?.remove(b.mesh);
    if (model) stage.scene?.remove(model.g);
    stage.canvas.style.cursor = '';
    stage.scene?.remove(env.group);
  };
}
