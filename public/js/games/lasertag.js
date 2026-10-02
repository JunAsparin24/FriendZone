// Laser Tag (3D): through the doorway in the Arcade. A dark two-floor maze lit by neon, two teams (red
// and blue) and hitscan blasters: the beam hits whatever is under your crosshair instantly. Tagging
// someone is +100 points, getting tagged is -50 and stuns you for a moment. C drops you onto
// your stomach to army-crawl behind low cover; Space jumps. Before every round there's a short break
// to pick your team. Rounds are timed; tickets for everyone at the end.
// Positions are in arena px like the Arena (20 px = 1 world unit); heights are in world units.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf, fmt } from '../state.js';
import { toon, basic, canvasTexture, additive, glowTexture } from '../three/materials.js';
import { Sparks, groundRing } from '../three/fx.js';
import { sfx } from '../sfx.js';
import { listen } from './util.js';
import { touch } from '../touch.js';

const K = 20, PR = 14, MOVE = 230, PRONE_MOVE = 75;
const EYE = 1.55, PRONE_EYE = 0.42;
const BODY = 1.8, PRONE_BODY = 0.6, STEP = 0.45;   // how tall you are, and how high a step you can walk up
const JUMP_V = 6, GRAVITY = 18;
const RANGE = 2000, FIRE_GAP = 260;
const TEAM = { red: { c: '#ff3b5c', hex: 0xff3b5c, name: 'RED' }, blue: { c: '#2fa8ff', hex: 0x2fa8ff, name: 'BLUE' } };
const NEON = ['#b77bff', '#39e6ff', '#ff4fd8', '#6ee7a0'];

/** Stairs become a row of solid steps: [x, y, w, h, bottom, top] like everything else. */
function expandStairs(stairs) {
  const out = [];
  for (const [x, y, w, h, dir, top] of stairs) {
    const n = Math.round(top / 0.3), sw = w / n;
    for (let i = 0; i < n; i++) {
      const sx = dir === '+x' ? x + i * sw : x + w - (i + 1) * sw;
      out.push([sx, y, sw, h, 0, ((i + 1) / n) * top, 'step']);
    }
  }
  return out;
}

/** Many boxes squashed into one mesh (one draw call per colour instead of hundreds). */
function mergedBoxes(boxes, material) {
  const pos = [], nor = [], uv = [];
  const m = new THREE.Matrix4();
  for (const [w, h, d, x, y, z] of boxes) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.applyMatrix4(m.makeTranslation(x, y, z));
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return new THREE.Mesh(geo, material);
}

/** The dark room: a glowing grid floor, black boxes with neon edges, the upstairs decks, team bases. */
function buildLevel(map, solids) {
  const g = new THREE.Group();
  const W = map.w / K, H = map.h / K, CEIL = map.ceiling;
  const gridTex = (rx, ry) => canvasTexture(128, 128, (c) => {
    c.fillStyle = '#06041a'; c.fillRect(0, 0, 128, 128);
    c.strokeStyle = 'rgba(120,80,255,.35)'; c.lineWidth = 2; c.strokeRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(57,230,255,.25)'; c.fillRect(62, 62, 4, 4);
  }, { repeat: [rx, ry] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: gridTex(W / 2, H / 2) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, H / 2);
  g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, H), basic('#030210', { side: THREE.DoubleSide }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(W / 2, CEIL, H / 2);
  g.add(ceil);
  const dark = [], edges = NEON.map(() => []), team = { red: [], blue: [] };
  // team bases: a glowing patch of floor and neon stripes on the end wall
  for (const [t, x] of [['red', 0], ['blue', W]]) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(9, H - 4), basic(TEAM[t].c, { transparent: true, opacity: 0.12, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(t === 'red' ? 4.5 : W - 4.5, 0.02, H / 2);
    g.add(pad);
    for (let k = 0; k < 4; k++) team[t].push([0.1, 0.12, H - 2, x + (t === 'red' ? 0.06 : -0.06), 0.8 + k * 1.4, H / 2]);
  }
  // the outer walls
  for (const [w, d, x, z] of [[W, 0.4, W / 2, -0.2], [W, 0.4, W / 2, H + 0.2], [0.4, H, -0.2, H / 2], [0.4, H, W + 0.2, H / 2]]) {
    dark.push([w, CEIL, d, x, CEIL / 2, z]);
    if (w > d) for (const y of [0.3, 3.4]) edges[0].push([w, 0.06, d + 0.05, x, y, z]);
  }
  // every solid: a dark box with its edges outlined in neon (steps just get a strip on the front edge)
  const decks = [];
  solids.forEach((sd, i) => {
    const [px, py, pw, ph, z0, z1, kind] = sd, w = pw / K, d = ph / K, h = z1 - z0, cx = px / K + w / 2, cz = py / K + d / 2, cy = z0 + h / 2;
    dark.push([w, h, d, cx, cy, cz]);
    const e = edges[i % NEON.length];
    if (kind === 'step') { e.push([w + 0.02, 0.04, d + 0.02, cx, z1, cz]); return; }
    if (z0 > 2 && w > 3 && d > 3) decks.push(sd);
    for (const s of [-1, 1]) {
      for (const y of [z0 + 0.03, z1]) {
        e.push([w + 0.04, 0.05, 0.05, cx, y, cz + s * (d / 2)]);
        e.push([0.05, 0.05, d + 0.04, cx + s * (w / 2), y, cz]);
      }
      if (h > 0.5) for (const t of [-1, 1]) e.push([0.05, h, 0.05, cx + s * (w / 2), cy, cz + t * (d / 2)]);
    }
  });
  g.add(mergedBoxes(dark, toon('#0b0820')));
  edges.forEach((list, i) => { if (list.length) g.add(mergedBoxes(list, basic(NEON[i]))); });
  for (const t of ['red', 'blue']) g.add(mergedBoxes(team[t], basic(TEAM[t].c)));
  // the upstairs floors get the glowing grid too, so you can see where you're walking
  for (const [px, py, pw, ph, , z1] of decks) {
    const top = new THREE.Mesh(new THREE.PlaneGeometry(pw / K, ph / K), new THREE.MeshBasicMaterial({ map: gridTex(pw / K / 2, ph / K / 2) }));
    top.rotation.x = -Math.PI / 2;
    top.position.set(px / K + pw / K / 2, z1 + 0.01, py / K + ph / K / 2);
    g.add(top);
  }
  // dim blacklights in the ceiling
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(additive(glowTexture, 0x7c4dff, 0.35));
    s.scale.setScalar(3.5);
    s.position.set(((i % 4) + 0.5) * (W / 4), CEIL - 0.1, (Math.floor(i / 4) + 0.5) * (H / 2));
    g.add(s);
  }
  return g;
}

/** The blaster in your hands: chunky, with a glowing team-coloured strip and muzzle. */
function viewModel() {
  const g = new THREE.Group();
  const box = (geo, mat, p, r) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (r) m.rotation.set(...r); g.add(m); return m; };
  box(new THREE.BoxGeometry(0.13, 0.15, 0.52), toon('#262a40'), [0, 0, -0.1]);
  box(new THREE.BoxGeometry(0.1, 0.2, 0.12), toon('#1a1c2c'), [0, -0.15, 0.05], [0.3, 0, 0]);
  const strip = box(new THREE.BoxGeometry(0.135, 0.03, 0.4), basic('#ffffff'), [0, 0.06, -0.1]);
  const tip = box(new THREE.CylinderGeometry(0.04, 0.045, 0.1, 12), basic('#ffffff'), [0, 0.01, -0.4], [Math.PI / 2, 0, 0]);
  const flash = new THREE.Sprite(additive(glowTexture, 0xffffff, 0));
  flash.scale.setScalar(0.5);
  flash.position.set(0, 0.01, -0.47);
  g.add(flash);
  g.scale.setScalar(0.72);
  g.position.set(0.3, -0.3, -0.6);
  return { group: g, flash, setTeam(t) { for (const m of [strip, tip, flash]) m.material.color.set(TEAM[t].c); } };
}

export function lasertag(stage) {
  stage.lights({ background: '#030208', sky: 0x6a5aff, ground: 0x100830, hemi: 0.55, sun: 0.25, sunPos: [30, 60, 20], box: 50 });
  stage.scene.fog = new THREE.Fog('#030208', 10, 65);
  const orbit = stage.useOrbit({ yaw: 0, pitch: 0, dist: 0.01, minDist: 0.01, maxDist: 0.01, height: EYE, minPitch: -1.3, maxPitch: 1.3 });
  orbit.fps = true;
  const oldFov = stage.camera.fov;
  stage.camera.fov = 72;
  stage.camera.updateProjectionMatrix();
  stage.scene.add(stage.camera);
  const gun = viewModel();
  stage.camera.add(gun.group);
  const sparks = new Sparks(stage.scene);
  stage.hud.innerHTML = `
    <div class="lt-points"><b>0</b><span>POINTS</span><div class="lt-pop"></div></div>
    <div class="hud-panel lt-top"><span class="lt-red">RED <b>0</b></span><span class="lt-time">3:00</span><span class="lt-blue"><b>0</b> BLUE</span></div>
    <div class="hud-panel lt-board"></div>
    <div class="ar-cross"><i></i><i></i><i></i><i></i><b></b></div>
    <div class="lt-stun hidden"><b>TAGGED!</b><span></span></div>
    <div class="hud-panel lt-pick hidden"></div>
    <div class="hud-panel lt-pose hidden">🪖 Crawling · <kbd>C</kbd> to get up</div>
    <div class="hud-panel ar-lock hidden">🖱️ Click to look around · <kbd>Esc</kbd> frees the mouse</div>
    <div class="hud-panel ar-break hidden"></div>
    <p class="hud-panel arena-help">WASD move · mouse look · click to fire · <kbd>C</kbd> crawl · <kbd>Space</kbd> jump · stairs lead upstairs · tag the other team!</p>`;
  const $h = (s) => stage.hud.querySelector(s);
  const ptsEl = $h('.lt-points b'), popEl = $h('.lt-pop'), crossEl = $h('.ar-cross'), stunEl = $h('.lt-stun'), lockEl = $h('.ar-lock');
  const boardEl = $h('.lt-board'), breakEl = $h('.ar-break'), timeEl = $h('.lt-time'), poseEl = $h('.lt-pose'), pickEl = $h('.lt-pick');

  const players = new Map(); // key -> { team, x, y, a, h, pr, score, tags, hits, tx, ty, p, vest, ring, band, stun }
  const beams = [];
  let level = null, map = null, solids = [], roundEnd = 0, breakUntil = 0, pickUntil = 0, breakMsg = null, tags = { red: 0, blue: 0 }, stunFor = 2;
  let firing = false, tapped = false, lastShot = 0, lastSend = 0, hitMark = 0, bob = 0, recoil = 0, eye = EYE;
  let prone = false, feet = 0, vz = 0, denied = false;
  const to3 = (x, y) => [x / K, y / K];
  const inside = (x, y, [px, py, pw, ph], r = 0) => x > px - r && x < px + pw + r && y > py - r && y < py + ph + r;
  /** The floor under you: the highest thing you could be standing on (no higher than a step up). */
  const groundAt = (x, y, f) => solids.reduce((best, sd) => (sd[5] <= f + STEP && sd[5] > best && inside(x, y, sd, PR * 0.4) ? sd[5] : best), 0);
  /** Would standing here (feet at f) put you inside something? */
  const blocked = (x, y, f, tall) => x < 16 || y < 16 || x > map.w - 16 || y > map.h - 16
    || solids.some((sd) => sd[5] > f + STEP && sd[4] < f + tall && Math.hypot(Math.max(sd[0] - x, 0, x - (sd[0] + sd[2])), Math.max(sd[1] - y, 0, y - (sd[1] + sd[3]))) < PR);
  const solidAt = (x, y, h) => solids.some((sd) => h >= sd[4] && h <= sd[5] && inside(x, y, sd));

  // ---- people (no name tags in here: you have to spot people by their vests) ----
  function addPlayer(k, f) {
    const p = stage.person(k);
    p.char.setProp('blaster');
    p.char.aiming = true;
    const tag = p.el.querySelector('.wl-tag');
    if (tag) tag.style.display = 'none';
    const vest = new THREE.Sprite(additive(glowTexture, TEAM[f.team].hex, 0.8));
    vest.scale.set(1.5, 1.7, 1);
    stage.scene.add(vest);
    const ring = groundRing(0.45, 0.7, TEAM[f.team].c, 0.7);
    stage.scene.add(ring);
    // a glowing vest: two bright bands round the chest plus a light on the front
    const band = new THREE.Group(), glow = basic(TEAM[f.team].c);
    for (const y of [0.12, -0.1]) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 24), glow); m.position.y = y; m.rotation.x = Math.PI / 2; band.add(m); }
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), basic('#ffffff'));
    light.position.set(0, 0.02, 0.27);
    band.add(light);
    players.set(k, { ...f, tx: f.x, ty: f.y, h: 0, pr: false, p, vest, ring, band, glow, stun: 0 });
  }
  function setTeam(f, team) {
    f.team = team;
    f.vest.material.color.set(TEAM[team].c);
    f.glow.color.set(TEAM[team].c);
    stage.scene.remove(f.ring);
    f.ring = groundRing(0.45, 0.7, TEAM[team].c, 0.7);
    stage.scene.add(f.ring);
  }
  function removePlayer(k) {
    const f = players.get(k);
    if (!f) return;
    stage.scene.remove(f.vest);
    stage.scene.remove(f.ring);
    players.delete(k);
    stage.removePerson(k);
  }
  const myTeam = () => players.get(S.me)?.team ?? 'red';

  // ---- beams ----
  function beam(x0, y0, h0, a, p, len, team, own = false) {
    const [X0, Z0] = to3(x0, y0);
    const end = new THREE.Vector3(X0 + (Math.cos(a) * len) / K, h0 - (Math.tan(p) * len) / K, Z0 + (Math.sin(a) * len) / K);
    // your own beam starts at the gun, not your eye
    const start = own ? new THREE.Vector3(0.22, -0.2, -0.7).applyMatrix4(stage.camera.matrixWorld) : new THREE.Vector3(X0, h0 - 0.2, Z0);
    const dir = end.clone().sub(start), L = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6, 1, true), basic(TEAM[team].c, { transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.y = L;
    m.position.copy(start).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    stage.scene.add(m);
    beams.push({ m, t: 0.14 });
    sparks.burst(end.x, end.y, end.z, TEAM[team].c, { n: 6, speed: 2.5 });
  }
  /** March along the crosshair: the first wall, floor, ceiling or person the beam meets. */
  function trace(x0, y0, h0, a, p) {
    const ca = Math.cos(a), sa = Math.sin(a), dh = -Math.tan(p) / K;
    for (let t = 6; t < RANGE; t += 5) {
      const x = x0 + ca * t, y = y0 + sa * t, h = h0 + dh * t;
      if (h <= 0 || h >= map.ceiling || x < 0 || y < 0 || x > map.w || y > map.h || solidAt(x, y, h)) return { len: t, hit: null };
      for (const [k, f] of players) {
        if (k === S.me || Math.hypot(f.x - x, f.y - y) > PR) continue;
        const bottom = f.h ?? 0, top = bottom + (f.pr ? PRONE_BODY : 1.85);
        if (h >= bottom && h <= top) return { len: t, hit: k };
      }
    }
    return { len: RANGE, hit: null };
  }

  // ---- input ----
  const locked = () => document.pointerLockElement === stage.canvas;
  const grab = () => { if (!locked()) { try { stage.canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* not supported */ } } };
  grab();
  const onLockChange = () => { if (!locked()) firing = tapped = false; };
  document.addEventListener('pointerlockchange', onLockChange);
  const onMouseUp = (e) => { if (e.button === 0) firing = false; };
  window.addEventListener('mouseup', onMouseUp, true);
  stage.onPointer = (type, e) => {
    if (type === 'down') {
      if (e?.target?.closest?.('.lt-pick')) return;
      if (!locked() && e?.pointerType === 'mouse') { grab(); return; }
      if (e?.button === 0 && e?.pointerType === 'mouse') { firing = true; tapped = true; }
    }
    if (type === 'up') firing = false;
  };
  const toggleProne = () => {
    // (no getting up under something low)
    const mine = players.get(S.me);
    if (prone && mine && blocked(mine.x, mine.y, feet, BODY)) return;
    prone = !prone;
    sfx(prone ? 'land' : 'whoosh', { vol: 0.5 });
  };
  const pickTeam = (team) => { if (pickUntil > performance.now() && team !== myTeam()) { net.send('lt_team', { team }); sfx('click'); } };
  stage.onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (k === 'f' && !e.repeat) { firing = down; if (down) tapped = true; }
    if (!down || e.repeat) return;
    if (k === 'c') toggleProne();
    if (k === '1') pickTeam('red');
    if (k === '2') pickTeam('blue');
    if (k === ' ') { if (prone) toggleProne(); else if (feet <= groundAt(players.get(S.me)?.x ?? 0, players.get(S.me)?.y ?? 0, feet) + 0.01) { vz = JUMP_V; sfx('jump', { vol: 0.5 }); } }
  };
  pickEl.addEventListener('click', (e) => { const t = e.target.closest('[data-team]')?.dataset.team; if (t) pickTeam(t); });
  function inputDir() {
    const keys = stage.keys;
    const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const r = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    if (!f && !r) return null;
    const fx = -Math.sin(orbit.yaw), fz = -Math.cos(orbit.yaw), rx = -fz, rz = fx;
    const dx = fx * f + rx * r, dy = fz * f + rz * r, l = Math.hypot(dx, dy);
    return { dx: dx / l, dy: dy / l };
  }

  // ---- HUD ----
  const popPoints = (txt, good) => {
    const el = document.createElement('i');
    el.className = good ? 'up' : 'down';
    el.textContent = txt;
    popEl.append(el);
    setTimeout(() => el.remove(), 1100);
  };
  const renderScores = () => {
    const mine = players.get(S.me);
    ptsEl.textContent = fmt(mine?.score ?? 0);
    $h('.lt-red b').textContent = tags.red;
    $h('.lt-blue b').textContent = tags.blue;
    const rows = [...players.entries()].sort((a, b) => b[1].score - a[1].score);
    boardEl.innerHTML = ['red', 'blue'].map((t) => `<div class="lt-team" style="--c:${TEAM[t].c}"><b>${TEAM[t].name}</b>${rows.filter(([, f]) => f.team === t)
      .map(([k, f]) => `<div class="${k === S.me ? 'me' : ''}"><span>${esc(nameOf(k))}</span><em>${fmt(f.score)}</em></div>`).join('')}</div>`).join('');
    renderPick();
  };
  /** Picking teams before a round: both teams' players, a button to join each, and the countdown. */
  function renderPick() {
    const on = pickUntil > performance.now();
    pickEl.classList.toggle('hidden', !on);
    if (!on) return;
    const mine = myTeam(), list = [...players.entries()];
    pickEl.innerHTML = `<div class="big">Pick your team!</div>
      <div class="lt-pick-row">${['red', 'blue'].map((t, i) => {
        const who = list.filter(([, f]) => f.team === t);
        return `<button class="lt-pick-team ${t === mine ? 'on' : ''}" data-team="${t}" style="--c:${TEAM[t].c}">
          <b>${TEAM[t].name}</b><small>${who.length} player${who.length === 1 ? '' : 's'}</small>
          <span>${who.map(([k]) => esc(nameOf(k))).join('<br>') || '—'}</span>
          <em>${t === mine ? '✔ Your team' : touch.enabled ? 'Tap to join' : `Press ${i + 1} to join`}</em></button>`;
      }).join('')}</div>
      <p>Round starts in <b class="lt-pick-count">${Math.ceil((pickUntil - performance.now()) / 1000)}</b>s · walk around and get ready!</p>`;
  }
  function renderBreak() {
    const m = breakMsg;
    if (!m) return;
    const left = Math.max(0, Math.ceil((breakUntil - performance.now()) / 1000));
    const mine = m.tickets?.[S.me];
    breakEl.innerHTML = `<div class="big" style="color:${m.winner ? TEAM[m.winner].c : '#fff'}">${m.winner ? `🏆 ${TEAM[m.winner].name} team wins!` : '🤝 It\'s a draw!'}</div>
      <p><b style="color:${TEAM.red.c}">RED ${m.tags.red}</b> tags · <b style="color:${TEAM.blue.c}">BLUE ${m.tags.blue}</b> tags</p>
      <table class="ar-kd"><tr><th>Player</th><th>Points</th><th>Tags</th><th>Tagged</th></tr>
      ${m.board.map((e) => `<tr class="${e.k === S.me ? 'me' : ''}"><td><i class="dot" style="--c:${TEAM[e.team].c}"></i>${esc(nameOf(e.k))}</td><td>${fmt(e.score)}</td><td>${e.tags}</td><td>${e.hits}</td></tr>`).join('')}</table>
      ${mine ? `<p class="arc-tix">+${fmt(mine)} 🎟️ tickets</p>` : ''}
      <p>Team picking in <b class="ar-count">${left}</b>s</p>`;
  }

  // ---- network ----
  const off = listen({
    lt: (m) => {
      if (!level) {
        map = m.map;
        solids = [...map.solids, ...expandStairs(map.stairs ?? [])];
        level = buildLevel(map, solids);
        stage.scene.add(level);
      }
      for (const k of [...players.keys()]) removePlayer(k);
      Object.entries(m.players).forEach(([k, f]) => addPlayer(k, f));
      tags = m.tags; stunFor = m.stun;
      roundEnd = m.left > 0 ? performance.now() + m.left * 1000 : 0;
      breakUntil = m.brk > 0 ? performance.now() + m.brk * 1000 : 0;
      pickUntil = m.pick > 0 ? performance.now() + m.pick * 1000 : 0;
      if (!breakUntil) { breakMsg = null; breakEl.classList.add('hidden'); }
      const mine = players.get(S.me);
      if (mine) {
        orbit.yaw = mine.team === 'red' ? -Math.PI / 2 : Math.PI / 2; orbit.pitch = 0; // face the other base
        gun.setTeam(mine.team);
        feet = 0; vz = 0;
        if (roundEnd) stage.banner(`<div class="big" style="color:${TEAM[mine.team].c}">GO! You're ${TEAM[mine.team].name}</div>Tag the other team: +100 each. Getting tagged costs 50.`, 2200);
      }
      prone = false;
      renderScores();
    },
    lt_denied: (m) => {
      denied = true;
      sfx('error');
      stage.banner(`🪙 ${esc(m.msg)}`, 2200);
      setTimeout(() => stage.onExit?.(), 1600);
    },
    lt_add: (m) => { addPlayer(m.k, m); renderScores(); },
    lt_del: (m) => { removePlayer(m.k); renderScores(); },
    lt_team: (m) => {
      const f = players.get(m.k);
      if (!f) return;
      setTeam(f, m.team);
      Object.assign(f, { x: m.x, y: m.y, tx: m.x, ty: m.y });
      if (m.k === S.me) { gun.setTeam(m.team); feet = 0; vz = 0; orbit.yaw = m.team === 'red' ? -Math.PI / 2 : Math.PI / 2; }
      renderScores();
    },
    lt_pos: (m) => { const f = players.get(m.k); if (f) Object.assign(f, { tx: m.x, ty: m.y, a: m.a, h: m.h, pr: m.pr }); },
    lt_beam: (m) => {
      const f = players.get(m.k);
      if (!f) return;
      beam(m.x, m.y, m.h, m.a, m.p, m.len, f.team);
      const me = players.get(S.me);
      sfx('shoot_far', { vol: me ? Math.max(0.12, 1 - Math.hypot(f.x - me.x, f.y - me.y) / 900) : 0.3 });
    },
    lt_tag: (m) => {
      tags = m.tags;
      const by = players.get(m.by), v = players.get(m.k);
      if (by) by.score = m.s1;
      if (v) {
        v.score = m.s2;
        v.hits = (v.hits ?? 0) + 1;
        v.stun = performance.now() + stunFor * 1000;
        const [X, Z] = to3(v.x, v.y);
        sparks.burst(X, (v.h ?? 0) + 1.1, Z, TEAM[v.team].c, { n: 24, speed: 4 });
      }
      if (m.by === S.me) { popPoints('+100', true); hitMark = performance.now() + 350; sfx('coin'); }
      if (m.k === S.me) { popPoints('-50', false); stage.shake(0.35); sfx('hurt'); firing = tapped = false; }
      renderScores();
    },
    lt_round: (m) => {
      tags = m.tags;
      roundEnd = 0;
      breakUntil = performance.now() + m.secs * 1000;
      breakMsg = m;
      firing = tapped = false;
      sfx(m.winner && m.winner === myTeam() ? 'win' : 'cheer');
      renderBreak();
      breakEl.classList.remove('hidden');
      renderScores();
    },
  });

  // ---- every frame ----
  stage.onFrame((dt, now) => {
    const mine = players.get(S.me);
    const onBreak = now < breakUntil;
    if (!onBreak && breakMsg) { breakMsg = null; breakEl.classList.add('hidden'); }
    if (onBreak && breakMsg) { const c = breakEl.querySelector('.ar-count'); const left = String(Math.max(0, Math.ceil((breakUntil - now) / 1000))); if (c && c.textContent !== left) c.textContent = left; }
    const picking = now < pickUntil;
    if (picking) { const c = pickEl.querySelector('.lt-pick-count'); const left = String(Math.max(0, Math.ceil((pickUntil - now) / 1000))); if (c && c.textContent !== left) c.textContent = left; }
    else if (!pickEl.classList.contains('hidden')) pickEl.classList.add('hidden');
    const stunned = mine && now < mine.stun;

    if (mine && map && !denied) {
      const tall = prone ? PRONE_BODY : BODY;
      const dir = inputDir();
      const speed = (prone ? PRONE_MOVE : MOVE) * (stunned ? 0.5 : 1);
      mine.moving = !!dir && !onBreak;
      if (mine.moving) {
        const nx = mine.x + dir.dx * speed * dt, ny = mine.y + dir.dy * speed * dt;
        if (!blocked(nx, mine.y, feet, tall)) mine.x = nx;
        if (!blocked(mine.x, ny, feet, tall)) mine.y = ny;
      }
      // up steps, down off edges, and jumping
      const ground = groundAt(mine.x, mine.y, feet);
      if (vz > 0 || feet > ground + 0.001) {
        vz -= GRAVITY * dt;
        feet = Math.max(ground, feet + vz * dt);
        if (feet <= ground) { if (vz < -7) sfx('land', { vol: 0.4 }); vz = 0; }
      } else feet = ground;
      mine.a = Math.atan2(-Math.cos(orbit.yaw), -Math.sin(orbit.yaw));
      mine.h = feet;
      mine.pr = prone;
      if (now - lastSend > 50) { lastSend = now; net.send('lt_move', { x: mine.x, y: mine.y, a: mine.a, h: feet, pr: prone }); }
      // phones: a gentle pull towards an enemy near the crosshair while firing
      if (touch.enabled && firing) {
        let best = null, bestErr = 0.14;
        for (const [k, f] of players) {
          if (k === S.me || f.team === mine.team) continue;
          const want = Math.atan2(-(f.x - mine.x), -(f.y - mine.y)), err = Math.atan2(Math.sin(want - orbit.yaw), Math.cos(want - orbit.yaw));
          if (Math.abs(err) < Math.abs(bestErr)) { best = err; bestErr = err; }
        }
        if (best != null) orbit.yaw += best * Math.min(1, dt * 5);
      }
      if ((firing || tapped) && !onBreak && !stunned && roundEnd && now - lastShot > FIRE_GAP) {
        lastShot = now;
        tapped = false;
        const h0 = feet + eye, pitch = orbit.pitch;
        const r = trace(mine.x, mine.y, h0, mine.a, pitch);
        beam(mine.x, mine.y, h0, mine.a, pitch, r.len, mine.team, true);
        recoil = 1;
        gun.flash.material.opacity = 1;
        sfx('shoot', { vol: 0.6 });
        const enemy = r.hit && players.get(r.hit)?.team !== mine.team ? r.hit : null;
        if (enemy) hitMark = now + 150;
        net.send('lt_shoot', { x: mine.x, y: mine.y, h: h0, a: mine.a, p: pitch, len: r.len, hit: enemy });
      }
    }

    const lerp = 1 - Math.exp(-dt * 14);
    for (const [k, f] of players) {
      if (k !== S.me) {
        const ox = f.tx - f.x, oy = f.ty - f.y;
        f.x += ox * lerp; f.y += oy * lerp;
        f.moving = Math.hypot(ox, oy) > 0.8;
      }
      const [x, z] = to3(f.x, f.y), p = f.p;
      p.x = x; p.z = z; p.y = f.h ?? 0;
      p.heading = Math.atan2(Math.cos(f.a ?? 0), Math.sin(f.a ?? 0));
      p.char.pose = f.pr ? 'crawl' : 'idle';
      p.moving = !!f.moving;
      p.speed = f.pr ? 0.8 : 1.3;
      const stun = now < f.stun, blink = stun && Math.floor(now / 90) % 2;
      p.visible = k !== S.me;
      f.vest.visible = k !== S.me && !blink;
      f.vest.position.set(x, (f.h ?? 0) + (f.pr ? 0.3 : 1.15), z);
      f.vest.material.opacity = stun ? 0.35 : 0.75;
      const torso = p.char.rig?.torso;
      if (torso && f.band.parent !== torso) torso.add(f.band); // (re-attached if the character gets rebuilt)
      f.band.visible = !blink;
      f.ring.visible = k !== S.me;
      f.ring.position.set(x, (f.h ?? 0) + 0.03, z);
      p.sub.textContent = stun ? '⚡ TAGGED' : '';
    }
    for (const b of beams) { b.t -= dt; b.m.material.opacity = Math.max(0, b.t / 0.14); }
    for (const b of beams.filter((q) => q.t <= 0)) { stage.scene.remove(b.m); b.m.geometry.dispose(); }
    beams.splice(0, beams.length, ...beams.filter((q) => q.t > 0));

    // first-person camera: down at floor level when crawling
    if (mine) {
      const [x, z] = to3(mine.x, mine.y);
      eye += ((prone ? PRONE_EYE : EYE) - eye) * Math.min(1, dt * 10);
      if (mine.moving && vz === 0) bob += dt * (prone ? 5 : 11);
      orbit.height = feet + eye + Math.sin(bob) * (prone ? 0.02 : 0.04);
      orbit.target.set(x, 0, z);
    }
    recoil = Math.max(0, recoil - dt * 8);
    gun.flash.material.opacity = Math.max(0, gun.flash.material.opacity - dt * 14);
    gun.group.position.set(0.3 + Math.sin(bob * 0.5) * 0.012, -0.3 + Math.abs(Math.cos(bob * 0.5)) * 0.01, -0.6 + recoil * 0.06);
    gun.group.rotation.x = recoil * 0.12;
    gun.group.visible = !!mine && !onBreak;
    sparks.update(dt);

    const secs = roundEnd ? Math.max(0, Math.ceil((roundEnd - now) / 1000)) : 0;
    const label = roundEnd ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : picking ? 'PICK' : onBreak ? 'BREAK' : '—';
    if (timeEl.textContent !== label) timeEl.textContent = label;
    timeEl.classList.toggle('low', !!roundEnd && secs <= 15);
    crossEl.classList.toggle('hit', now < hitMark);
    crossEl.classList.toggle('hidden', !mine || onBreak);
    stunEl.classList.toggle('hidden', !stunned);
    if (stunned) stunEl.querySelector('span').textContent = `${((mine.stun - now) / 1000).toFixed(1)}s`;
    poseEl.classList.toggle('hidden', !prone);
    lockEl.classList.toggle('hidden', locked() || onBreak || picking || !!('ontouchstart' in window));
  });

  return () => {
    off();
    document.removeEventListener('pointerlockchange', onLockChange);
    window.removeEventListener('mouseup', onMouseUp, true);
    if (locked()) document.exitPointerLock();
    for (const b of beams) stage.scene?.remove(b.m);
    for (const k of [...players.keys()]) removePlayer(k);
    stage.camera.remove(gun.group);
    stage.scene?.remove(stage.camera);
    stage.camera.fov = oldFov;
    stage.camera.updateProjectionMatrix();
    if (stage.scene) stage.scene.fog = null;
    if (level) stage.scene?.remove(level);
  };
}
