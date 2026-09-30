// Arena (3D): a third-person blaster brawl. You walk around like everywhere else, with the camera over
// your shoulder; tall walls give cover. Click to grab the mouse, then aim with the crosshair in the
// middle of the screen and click/hold to shoot; Space/Shift dashes. Power-ups glow on the ground. The
// map changes every round, and between rounds everyone sees the kills/deaths board for 10 seconds.
// Game logic runs in arena pixels (the server's units; 20 px = 1 world unit).
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf, colorOf } from '../state.js';
import { toon, basic, canvasTexture, outlineMaterial, TAU } from '../three/materials.js';
import { Sparks, FloatText, orb, groundRing, emojiSprite, crowd } from '../three/fx.js';
import { sfx } from '../sfx.js';
import { listen } from './util.js';

const PR = 14, BULLET_SPEED = 900, BULLET_LIFE = 1.2, MOVE_SPEED = 230;
const DASH_TIME = 0.16, DASH_SPEED = 820, DASH_COOLDOWN = 1.4;
const K = 20;             // arena px per world unit
const WALL_H = 4.2;       // how tall the cover is (world units)
const CAM_DIST = 5.2, SHOULDER = 0.85;
const ITEM_LOOK = {
  heal: { emoji: '❤️', color: '#ff5d73', label: '+1 heart' },
  rapid: { emoji: '⚡', color: '#ffd84d', label: 'Rapid fire!' },
  shield: { emoji: '🛡️', color: '#39c6ff', label: 'Shield!' },
  speed: { emoji: '👟', color: '#6ee7a0', label: 'Speed boost!' },
};
const BUFF_TIME = { rapid: 6, shield: 5, speed: 6 };
const THEMES = {
  sand: { floor: ['#f0dca8', '#cfb07a'], wall: '#a8a0bb', wall2: '#8e86a3', cap: '#d9c7a3', sky: '#8fd0ff', outer: '#5d4a3a' },
  hedge: { floor: ['#7cc86a', '#5fae55'], wall: '#2f8a44', wall2: '#257a3a', cap: '#3fa34d', sky: '#bfe6ff', outer: '#3f7f3a', leafy: true },
  docks: { floor: ['#b98a55', '#9c6a3c'], wall: '#c28a4e', wall2: '#a8723f', cap: '#8b5a2b', sky: '#9fd8ff', outer: '#2f6fb5', crates: true },
  stone: { floor: ['#9a96a8', '#7a768a'], wall: '#6d6a85', wall2: '#5a5773', cap: '#8a86a0', sky: '#c9b8ff', outer: '#3a3850' },
};

const OUT = outlineMaterial(0.04);
function add(parent, geo, mat, { p = [0, 0, 0], r = null, outline = false, cast = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (outline) m.add(new THREE.Mesh(geo, OUT));
  parent.add(m);
  return m;
}

const texCache = new Map();
function floorTex(th) {
  const key = `f${th.floor}`;
  if (!texCache.has(key)) {
    const t = canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = th.floor[0]; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1600; i++) { ctx.fillStyle = i % 2 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.1)'; ctx.fillRect((i * 137.5) % 256, (i * 71.3) % 256, 2, 2); }
      ctx.strokeStyle = th.floor[1]; ctx.lineWidth = 3;
      for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(key, t);
  }
  return texCache.get(key);
}
function wallTex(th) {
  const key = `w${th.wall}`;
  if (!texCache.has(key)) {
    const t = canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = th.wall2; ctx.fillRect(0, 0, 128, 128);
      if (th.leafy) {
        for (let i = 0; i < 90; i++) { ctx.fillStyle = i % 2 ? th.wall : '#3fa34d'; ctx.beginPath(); ctx.ellipse((i * 53) % 128, (i * 37) % 128, 7, 4, i, 0, TAU); ctx.fill(); }
      } else if (th.crates) {
        ctx.fillStyle = th.wall; ctx.fillRect(6, 6, 116, 116);
        ctx.strokeStyle = th.cap; ctx.lineWidth = 8; ctx.strokeRect(6, 6, 116, 116);
        ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(122, 122); ctx.stroke();
      } else {
        for (let r = 0; r < 4; r++) for (let x = (r % 2) * -16; x < 128; x += 32) {
          ctx.fillStyle = r % 2 ? th.wall : th.wall2;
          ctx.fillRect(x + 1, r * 32 + 1, 30, 30);
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

/** Build a map's 3D level from the server's layout. Returns { group, walls (meshes), cheer }. */
function buildLevel(map) {
  const th = THEMES[map.theme] ?? THEMES.sand;
  const g = new THREE.Group();
  const W = map.w / K, H = map.h / K;
  const ft = floorTex(th).clone();
  ft.needsUpdate = true;
  ft.repeat.set(W / 6, H / 6);
  add(g, new THREE.PlaneGeometry(W, H), new THREE.MeshToonMaterial({ map: ft }), { p: [W / 2, 0, H / 2], r: [-Math.PI / 2, 0, 0], cast: false });
  add(g, new THREE.PlaneGeometry(260, 260), toon(th.outer), { p: [W / 2, -0.05, H / 2], r: [-Math.PI / 2, 0, 0], cast: false });
  const meshes = [];
  const box = (x, y, w, h, height, mat, outline = true) => {
    const m = add(g, new THREE.BoxGeometry(w, height, h), mat, { p: [x + w / 2, height / 2, y + h / 2], outline });
    meshes.push(m);
    return m;
  };
  const wt = wallTex(th);
  const wallMat = (w, h) => { const t = wt.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.max(w, h) / 2), WALL_H / 2); return new THREE.MeshToonMaterial({ map: t }); };
  // the outer walls
  const OW = WALL_H + 1.2;
  box(-1, -1, W + 2, 1, OW, wallMat(W, 1));
  box(-1, H, W + 2, 1, OW, wallMat(W, 1));
  box(-1, 0, 1, H, OW, wallMat(1, H));
  box(W, 0, 1, H, OW, wallMat(1, H));
  // cover
  for (const [px, py, pw, ph] of map.walls) {
    const x = px / K, y = py / K, w = pw / K, h = ph / K;
    const tall = th.crates ? WALL_H * 0.7 : WALL_H;
    box(x, y, w, h, tall, wallMat(w, h));
    add(g, new THREE.BoxGeometry(w + 0.2, 0.25, h + 0.2), toon(th.cap), { p: [x + w / 2, tall + 0.12, y + h / 2], outline: true });
  }
  // a crowd up on the stands outside the walls
  const spots = [];
  for (let i = 0; i < 40; i++) {
    const t = (i + 0.5) / 40;
    spots.push({ x: t * W, y: OW + 0.2, z: -2.5 }, { x: t * W, y: OW + 0.2, z: H + 2.5 });
  }
  for (const z of [-2.5, H + 2.5]) add(g, new THREE.BoxGeometry(W + 4, OW, 3), toon(th.wall2), { p: [W / 2, OW / 2, z] });
  const cheer = crowd(g, spots.filter((_, i) => i % 3 !== 2));
  return { group: g, meshes, cheer, theme: th };
}

export function arena(stage) {
  const sun = stage.lights({ background: '#8fd0ff', sunPos: [30, 60, 20], box: 45, hemi: 1.25 });
  const orbit = stage.useOrbit({ yaw: 0, pitch: 0.22, dist: CAM_DIST, minDist: CAM_DIST, maxDist: CAM_DIST, height: 1.65, minPitch: -0.5, maxPitch: 1.05 });
  const sparks = new Sparks(stage.scene);
  const texts = new FloatText(stage.scene);
  stage.hud.innerHTML = `
    <div class="hud-panel ar-top"><b class="ar-map"></b><span>first to <b class="target">7</b> knockouts</span></div>
    <div class="hud-panel ar-board"></div>
    <div class="hud-panel arena-feed hidden"></div>
    <div class="ar-cross"><i></i><i></i><i></i><i></i><b></b></div>
    <div class="hud-panel ar-bottom"><div class="ar-hearts"></div><div class="meter"><i></i><span>DASH</span></div><div class="buffs"></div></div>
    <div class="hud-panel ar-lock hidden">🖱️ Click to aim · <kbd>Esc</kbd> frees the mouse</div>
    <div class="hud-panel ar-break hidden"></div>
    <p class="hud-panel arena-help">WASD move · mouse aim · click/hold shoot · <kbd>Space</kbd>/<kbd>Shift</kbd> dash · grab the glowing power-ups</p>`;
  const $h = (s) => stage.hud.querySelector(s);
  const boardEl = $h('.ar-board'), feedEl = $h('.arena-feed'), crossEl = $h('.ar-cross'), lockEl = $h('.ar-lock');
  const dashEl = $h('.meter'), buffsEl = $h('.buffs'), heartsEl = $h('.ar-hearts'), breakEl = $h('.ar-break');
  stage.canvas.style.cursor = 'crosshair';

  const fighters = new Map();
  const items = new Map();
  let level = null, mapInfo = null;
  let bullets = [], shotId = 0, lastShot = 0, lastSend = 0, safeUntil = 0, maxHp = 3, feed = [], target = 7;
  let firing = false, dash = { t: 0, cd: 0, dx: 0, dy: 0 }, breakUntil = 0, breakBoard = null, hitMark = 0;
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
    fighters.set(k, { ...f, tx: f.x, ty: f.y, p, hurt: 0, buffs: {} });
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
    // a soft column of light so you can spot it across the map
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
    items.set(it.id, { ...it, g, s, ring });
  }
  function removeItem(id) {
    const it = items.get(id);
    if (!it) return;
    stage.scene.remove(it.g);
    items.delete(id);
    picking.delete(id);
  }

  // ---- input ---------------------------------------------------------------------
  const locked = () => document.pointerLockElement === stage.canvas;
  stage.onPointer = (type, e) => {
    if (type === 'down') {
      if (!locked() && e?.pointerType === 'mouse') {
        try { stage.canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* not supported */ }
        return; // this click just grabs the mouse
      }
      firing = true;
    }
    if (type === 'up') firing = false;
  };
  stage.onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (down && (k === ' ' || k === 'shift') && !e.repeat) tryDash();
  };
  /** Movement relative to where the camera looks: W is forwards. Returns a unit vector in arena px axes. */
  function inputDir() {
    const keys = stage.keys;
    const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const r = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    if (!f && !r) return null;
    const fx = -Math.sin(orbit.yaw), fz = -Math.cos(orbit.yaw), rx = -fz, rz = fx;
    const dx = fx * f + rx * r, dy = fz * f + rz * r, l = Math.hypot(dx, dy);
    return { dx: dx / l, dy: dy / l };
  }
  function tryDash() {
    const mine = fighters.get(S.me);
    if (!mine || mine.hp <= 0 || dash.cd > 0) return;
    const dir = inputDir() ?? { dx: -Math.sin(orbit.yaw), dy: -Math.cos(orbit.yaw) };
    dash = { t: DASH_TIME, cd: DASH_COOLDOWN, ...dir };
    burstAt(mine.x, mine.y, '#ffffff', 10, 0.5);
    sfx('dash');
  }

  function spawnBullet(owner, id, x, y, a) {
    const mesh = orb(colorOf(owner), 0.13, 4);
    stage.scene.add(mesh);
    bullets.push({ owner, id, x, y, vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: BULLET_LIFE, mesh });
  }

  // ---- network --------------------------------------------------------------------
  const off = listen({
    arena: (m) => {
      setMap(m.map);
      for (const k of [...fighters.keys()]) removeFighter(k);
      Object.entries(m.players).forEach(([k, f]) => addFighter(k, f));
      for (const id of [...items.keys()]) removeItem(id);
      (m.items ?? []).forEach(addItem);
      target = m.target;
      $h('.target').textContent = m.target;
      maxHp = m.hp;
      safeUntil = performance.now() + 1500;
      breakUntil = m.brk > 0 ? performance.now() + m.brk * 1000 : 0;
      if (!breakUntil) { breakBoard = null; breakEl.classList.add('hidden'); }
      const mine = fighters.get(S.me);
      if (mine) orbit.yaw = Math.atan2(mine.x - AW() / 2, mine.y - AH() / 2); // face the middle
      renderBoard();
    },
    arena_add: (m) => { addFighter(m.k, m); renderBoard(); },
    arena_del: (m) => { removeFighter(m.k); renderBoard(); },
    arena_pos: (m) => { const f = fighters.get(m.k); if (f) { f.tx = m.x; f.ty = m.y; f.a = m.a; } },
    arena_shot: (m) => {
      spawnBullet(m.k, m.id, m.x, m.y, m.a);
      const f = fighters.get(m.k), me2 = fighters.get(S.me);
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
      if (m.k === S.me) { stage.shake(0.5); sfx('hurt'); } else sfx('hit', { vol: 0.6 });
    },
    arena_ko: (m) => {
      const victim = fighters.get(m.k), killer = fighters.get(m.by);
      if (victim) { victim.hp = 0; victim.deaths = m.deaths ?? (victim.deaths ?? 0) + 1; burstAt(victim.x, victim.y, colorOf(m.k), 40, 1); }
      if (killer) killer.score = m.score;
      sfx('ko', { vol: m.k === S.me || m.by === S.me ? 1 : 0.5 });
      feed = [{ text: `${nameOf(m.by)} ⚔ ${nameOf(m.k)}`, at: performance.now() }, ...feed].slice(0, 5);
      renderBoard();
      if (m.k === S.me) { stage.shake(0.9); stage.banner(`💥 ${esc(nameOf(m.by))} got you! Respawning…`, 1800); }
      else if (m.by === S.me) { stage.banner(`⚔️ You knocked out ${esc(nameOf(m.k))}! +20 🪙`, 1800); hitMark = performance.now() + 400; }
    },
    arena_spawn: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      Object.assign(f, { x: m.x, y: m.y, tx: m.x, ty: m.y, hp: m.hp });
      burstAt(m.x, m.y, '#9fe8ff', 16, 1);
      if (m.k === S.me) { safeUntil = performance.now() + 1500; sfx('spawn'); }
    },
    arena_round: (m) => {
      sfx(m.winner === S.me ? 'win' : 'cheer');
      firing = false;
      breakUntil = performance.now() + m.secs * 1000;
      breakBoard = m;
      renderBreak();
      breakEl.classList.remove('hidden');
    },
    arena_item: (m) => { addItem(m.item); sfx('pop', { vol: 0.5 }); },
    arena_picked: (m) => {
      const it = items.get(m.id);
      if (it) burstAt(it.x, it.y, ITEM_LOOK[m.kind].color, 20, 1);
      removeItem(m.id);
      const f = fighters.get(m.k);
      if (f && BUFF_TIME[m.kind]) f.buffs[m.kind] = performance.now() + BUFF_TIME[m.kind] * 1000;
      if (m.k === S.me) {
        sfx(m.kind === 'shield' ? 'shield' : 'powerup');
        if (f) { const [x, z] = to3(f.x, f.y); texts.add(ITEM_LOOK[m.kind].label, x, 2.6, z, ITEM_LOOK[m.kind].color, 0.8); }
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
  const ray = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const tmp = new THREE.Vector3();
  stage.onFrame((dt, now) => {
    dash.cd = Math.max(0, dash.cd - dt);
    const mine = fighters.get(S.me);
    const has = (f, b) => (f.buffs[b] ?? 0) > now;
    const onBreak = now < breakUntil;
    if (!onBreak && breakBoard) { breakBoard = null; breakEl.classList.add('hidden'); }
    if (onBreak && breakBoard) { const c = breakEl.querySelector('.ar-count'); const left = String(Math.max(0, Math.ceil((breakUntil - now) / 1000))); if (c && c.textContent !== left) c.textContent = left; }

    // where the crosshair points: the first wall or fighter along the camera's centre ray
    let aimX = null, aimY = null;
    if (mine && level) {
      ray.setFromCamera(center, stage.camera);
      ray.far = 80;
      const hit = ray.intersectObjects(level.meshes, false)[0];
      let dist = hit ? hit.distance : 60;
      for (const [k, f] of fighters) {
        if (k === S.me || f.hp <= 0) continue;
        tmp.set(f.x / K, 1.1, f.y / K);
        const d = ray.ray.distanceSqToPoint(tmp);
        const along = tmp.clone().sub(ray.ray.origin).dot(ray.ray.direction);
        if (d < 0.8 && along > 0 && along < dist) dist = along;
      }
      ray.ray.at(dist, tmp);
      aimX = tmp.x * K; aimY = tmp.z * K;
    }

    if (mine && mine.hp > 0) {
      let vx = 0, vy = 0;
      const dir = inputDir();
      const speed = MOVE_SPEED * (has(mine, 'speed') ? 1.45 : 1);
      if (dash.t > 0) {
        dash.t -= dt;
        vx = dash.dx * DASH_SPEED;
        vy = dash.dy * DASH_SPEED;
        const [X, Z] = to3(mine.x, mine.y);
        sparks.puff(X, 0.9, Z, colorOf(S.me), 1.2, 0.3);
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
      // face where you aim (or along the camera if the aim point is right on top of you)
      if (aimX != null && Math.hypot(aimX - mine.x, aimY - mine.y) > 30) mine.a = Math.atan2(aimY - mine.y, aimX - mine.x);
      else mine.a = Math.atan2(-Math.cos(orbit.yaw), -Math.sin(orbit.yaw));
      if (now - lastSend > 50) {
        lastSend = now;
        net.send('arena_move', { x: mine.x, y: mine.y, a: mine.a });
      }
      if (firing && !onBreak && now - lastShot > (has(mine, 'rapid') ? 120 : 240)) {
        lastShot = now;
        const id = ++shotId;
        const x = mine.x + Math.cos(mine.a) * 24, y = mine.y + Math.sin(mine.a) * 24;
        if (!inWall(x, y)) {
          spawnBullet(S.me, id, x, y, mine.a);
          burstAt(x, y, '#fff6b0', 5, 1.1);
          sfx('shoot');
          net.send('arena_shoot', { id, x, y, a: mine.a });
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
      p.heading = Math.atan2(Math.cos(f.a ?? 0), Math.sin(f.a ?? 0));
      p.moving = !!f.moving;
      p.speed = has(f, 'speed') ? 1.9 : 1.3;
      const blink = f.hurt && now - f.hurt < 250 && Math.floor(now / 50) % 2;
      p.visible = f.hp > 0 && !blink;
      p.sub.textContent = f.hp > 0 && k !== S.me ? '❤'.repeat(Math.max(0, f.hp)) + '♡'.repeat(Math.max(0, maxHp - f.hp)) : '';
      const shielded = has(f, 'shield') || (k === S.me && now < safeUntil);
      if (shielded && !f.bubble) {
        f.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.25, depthWrite: false }));
        stage.scene.add(f.bubble);
      }
      if (f.bubble) {
        f.bubble.visible = shielded && f.hp > 0;
        f.bubble.position.set(x, 1, z);
        f.bubble.material.opacity = 0.18 + Math.sin(now / 90) * 0.08;
      }
      if (has(f, 'speed') && f.moving && Math.random() < 0.4) sparks.puff(x, 0.3, z, '#6ee7a0', 0.6, 0.3);
    }

    bullets = bullets.filter((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const [X, Z] = to3(b.x, b.y);
      b.mesh.position.set(X, 1.15, Z);
      let dead = b.life <= 0 || b.x < 0 || b.x > AW() || b.y < 0 || b.y > AH() || inWall(b.x, b.y);
      if (!dead) {
        for (const [k, f] of fighters) {
          if (k === b.owner || f.hp <= 0 || Math.hypot(f.x - b.x, f.y - b.y) > PR + 7) continue;
          dead = true;
          if (b.owner === S.me) hitMark = Math.max(hitMark, now + 180);
          // only the player who got hit reports it, so everyone agrees on one source of truth
          if (k === S.me && now > safeUntil && !has(f, 'shield')) net.send('arena_hit', { by: b.owner, id: b.id });
          else if (has(f, 'shield')) sparks.burst(X, 1.1, Z, '#9fe8ff', { n: 8 });
          break;
        }
      }
      if (dead) {
        sparks.burst(X, 1.15, Z, colorOf(b.owner), { n: 6, speed: 3 });
        stage.scene.remove(b.mesh);
        return false;
      }
      return true;
    });

    for (const it of items.values()) { it.s.position.y = 1.1 + Math.sin(now / 250 + it.id) * 0.2; it.ring.rotation.z = now / 600; }

    // over-the-shoulder camera, pulled in if a wall gets between it and you
    const mineF = fighters.get(S.me);
    if (mineF && level) {
      const [x, z] = to3(mineF.x, mineF.y);
      const fx = -Math.sin(orbit.yaw), fz = -Math.cos(orbit.yaw);
      orbit.target.set(x - fz * SHOULDER, 0, z + fx * SHOULDER);
      const from = new THREE.Vector3(orbit.target.x, 1.65, orbit.target.z);
      const back = new THREE.Vector3(Math.sin(orbit.yaw) * Math.cos(Math.max(orbit.pitch, 0.08)), Math.sin(Math.max(orbit.pitch, 0.08)), Math.cos(orbit.yaw) * Math.cos(Math.max(orbit.pitch, 0.08))).normalize();
      ray.set(from, back);
      ray.far = CAM_DIST;
      const block = ray.intersectObjects(level.meshes, false)[0];
      orbit.dist = block ? Math.max(1.2, block.distance - 0.3) : CAM_DIST;
      orbit.cur = orbit.cur ?? from.clone(); // snap the first frame
    }
    level?.cheer(now / 1000, fighters.size > 1 ? 1.2 : 0.4);
    sparks.update(dt);
    texts.update(dt);

    crossEl.classList.toggle('hit', now < hitMark);
    crossEl.classList.toggle('hidden', !mineF || mineF.hp <= 0 || onBreak);
    lockEl.classList.toggle('hidden', locked() || onBreak || !!('ontouchstart' in window));
    heartsEl.innerHTML = mineF ? '❤'.repeat(Math.max(0, mineF.hp)) + '<s>' + '♡'.repeat(Math.max(0, maxHp - mineF.hp)) + '</s>' : '';
    const ready = 1 - dash.cd / DASH_COOLDOWN;
    dashEl.querySelector('i').style.width = `${ready * 100}%`;
    dashEl.classList.toggle('ready', ready >= 1);
    buffsEl.innerHTML = mineF ? Object.entries(mineF.buffs).filter(([, until]) => until > now)
      .map(([b, until]) => `<span>${ITEM_LOOK[b].emoji} ${Math.ceil((until - now) / 1000)}s</span>`).join('') : '';
    feed = feed.filter((e) => now - e.at < 5000);
    feedEl.innerHTML = feed.map((e) => `<div>${esc(e.text)}</div>`).join('');
    feedEl.classList.toggle('hidden', !feed.length);
  });

  return () => {
    off();
    if (locked()) document.exitPointerLock();
    for (const b of bullets) stage.scene?.remove(b.mesh);
    for (const id of [...items.keys()]) removeItem(id);
    stage.canvas.style.cursor = '';
    if (level) stage.scene?.remove(level.group);
  };
}
