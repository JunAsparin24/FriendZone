// Laser Tag (3D): through the doorway in the Arcade. A dark maze lit by neon, two teams (red and blue),
// and hitscan blasters: the beam hits whatever is under your crosshair instantly. Tagging someone is
// +100 points, getting tagged is -50 and stuns you for a moment. C (or Ctrl) drops you flat on the
// floor to hide behind low cover; Space jumps. Rounds are timed; tickets for everyone at the end.
// Game logic runs in arena pixels like the Arena (20 px = 1 world unit).
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf, fmt } from '../state.js';
import { toon, basic, canvasTexture, additive, glowTexture } from '../three/materials.js';
import { Sparks, groundRing } from '../three/fx.js';
import { sfx } from '../sfx.js';
import { listen } from './util.js';
import { touch } from '../touch.js';

const K = 20, PR = 14, MOVE = 230, PRONE_MOVE = 80;
const EYE = 1.55, PRONE_EYE = 0.42;
const JUMP_V = 6, GRAVITY = 18;
const ROOM_H = 4.4, TALL = 2.8, LOW = 1.1;  // ceiling, tall walls, and low cover you can hide behind lying down
const RANGE = 1600, FIRE_GAP = 260;
const TEAM = { red: { c: '#ff3b5c', hex: 0xff3b5c, name: 'RED' }, blue: { c: '#2fa8ff', hex: 0x2fa8ff, name: 'BLUE' } };
const wallH = ([, , w, h]) => (Math.min(w, h) >= 80 ? LOW : TALL);

function add(parent, geo, mat, { p = [0, 0, 0], r = null } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  parent.add(m);
  return m;
}

/** The dark room: a glowing grid floor, black walls with neon edges, team bases at each end. */
function buildLevel(map) {
  const g = new THREE.Group();
  const W = map.w / K, H = map.h / K;
  const grid = canvasTexture(128, 128, (c) => {
    c.fillStyle = '#06041a'; c.fillRect(0, 0, 128, 128);
    c.strokeStyle = 'rgba(120,80,255,.35)'; c.lineWidth = 2; c.strokeRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(57,230,255,.25)'; c.fillRect(62, 62, 4, 4);
  }, { repeat: [W / 2, H / 2] });
  add(g, new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: grid }), { p: [W / 2, 0, H / 2], r: [-Math.PI / 2, 0, 0] });
  add(g, new THREE.PlaneGeometry(W, H), basic('#030210', { side: THREE.DoubleSide }), { p: [W / 2, ROOM_H, H / 2], r: [Math.PI / 2, 0, 0] });
  // bases: a glowing patch of floor and a big neon wall in the team colour at each end
  for (const [team, x] of [['red', 0], ['blue', W]]) {
    const col = TEAM[team];
    add(g, new THREE.PlaneGeometry(9, H - 4), basic(col.c, { transparent: true, opacity: 0.12, depthWrite: false }), { p: [team === 'red' ? 4.5 : W - 4.5, 0.02, H / 2], r: [-Math.PI / 2, 0, 0] });
    for (let k = 0; k < 3; k++) add(g, new THREE.BoxGeometry(0.1, 0.12, H - 2), basic(col.c), { p: [x + (team === 'red' ? 0.06 : -0.06), 0.8 + k * 1.3, H / 2] });
  }
  // the outer walls: black, with a neon strip low and high
  const dark = toon('#0b0820');
  for (const [w, d, x, z] of [[W, 0.4, W / 2, -0.2], [W, 0.4, W / 2, H + 0.2], [0.4, H, -0.2, H / 2], [0.4, H, W + 0.2, H / 2]]) {
    add(g, new THREE.BoxGeometry(w, ROOM_H, d), dark, { p: [x, ROOM_H / 2, z] });
    if (w > d) for (const y of [0.3, 3.4]) add(g, new THREE.BoxGeometry(w, 0.06, d + 0.05), basic('#b77bff'), { p: [x, y, z] });
  }
  // cover: tall walls and low blocks, every edge outlined in neon
  const neon = ['#b77bff', '#39e6ff', '#ff4fd8', '#6ee7a0'];
  map.walls.forEach((wl, i) => {
    const [px, py, pw, ph] = wl, h = wallH(wl), w = pw / K, d = ph / K, cx = px / K + w / 2, cz = py / K + d / 2;
    add(g, new THREE.BoxGeometry(w, h, d), dark, { p: [cx, h / 2, cz] });
    const col = basic(neon[i % neon.length]);
    for (const s of [-1, 1]) {
      add(g, new THREE.BoxGeometry(w + 0.04, 0.05, 0.05), col, { p: [cx, h, cz + s * (d / 2)] });
      add(g, new THREE.BoxGeometry(0.05, 0.05, d + 0.04), col, { p: [cx + s * (w / 2), h, cz] });
      add(g, new THREE.BoxGeometry(w + 0.04, 0.04, 0.04), col, { p: [cx, 0.06, cz + s * (d / 2)] });
      for (const t of [-1, 1]) add(g, new THREE.BoxGeometry(0.05, h, 0.05), col, { p: [cx + s * (w / 2), h / 2, cz + t * (d / 2)] });
    }
    if (h === TALL) add(g, new THREE.BoxGeometry(w + 0.02, 0.05, d + 0.02), col, { p: [cx, 1.2, cz] }); // a stripe round the middle
  });
  // dim blacklights in the ceiling
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(additive(glowTexture, 0x7c4dff, 0.35));
    s.scale.setScalar(3);
    s.position.set(((i % 3) + 0.5) * (W / 3), ROOM_H - 0.1, (Math.floor(i / 3) + 0.5) * (H / 2));
    g.add(s);
  }
  return g;
}

/** The blaster in your hands: chunky, with a glowing team-coloured strip and muzzle. */
function viewModel() {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.13, 0.15, 0.52), toon('#262a40'), { p: [0, 0, -0.1] });
  add(g, new THREE.BoxGeometry(0.1, 0.2, 0.12), toon('#1a1c2c'), { p: [0, -0.15, 0.05], r: [0.3, 0, 0] });
  const strip = add(g, new THREE.BoxGeometry(0.135, 0.03, 0.4), basic('#ffffff'), { p: [0, 0.06, -0.1] });
  const tip = add(g, new THREE.CylinderGeometry(0.04, 0.045, 0.1, 12), basic('#ffffff'), { p: [0, 0.01, -0.4], r: [Math.PI / 2, 0, 0] });
  const flash = new THREE.Sprite(additive(glowTexture, 0xffffff, 0));
  flash.scale.setScalar(0.5);
  flash.position.set(0, 0.01, -0.47);
  g.add(flash);
  g.traverse((o) => { o.castShadow = false; });
  g.scale.setScalar(0.72);
  g.position.set(0.3, -0.3, -0.6);
  return { group: g, flash, setTeam(team) { strip.material.color.set(TEAM[team].c); tip.material.color.set(TEAM[team].c); flash.material.color.set(TEAM[team].c); } };
}

export function lasertag(stage) {
  stage.lights({ background: '#030208', sky: 0x6a5aff, ground: 0x100830, hemi: 0.55, sun: 0.25, sunPos: [30, 60, 20], box: 40 });
  stage.scene.fog = new THREE.Fog('#030208', 10, 60);
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
    <div class="hud-panel lt-pose hidden">🫳 Lying down · <kbd>C</kbd> to get up</div>
    <div class="hud-panel ar-lock hidden">🖱️ Click to look around · <kbd>Esc</kbd> frees the mouse</div>
    <div class="hud-panel ar-break hidden"></div>
    <p class="hud-panel arena-help">WASD move · mouse look · click to fire · <kbd>C</kbd>/<kbd>Ctrl</kbd> lie down · <kbd>Space</kbd> jump · tag the other team!</p>`;
  const $h = (s) => stage.hud.querySelector(s);
  const ptsEl = $h('.lt-points b'), popEl = $h('.lt-pop'), crossEl = $h('.ar-cross'), stunEl = $h('.lt-stun'), lockEl = $h('.ar-lock');
  const boardEl = $h('.lt-board'), breakEl = $h('.ar-break'), timeEl = $h('.lt-time'), poseEl = $h('.lt-pose');

  const players = new Map(); // key -> { team, x, y, a, h, pr, score, tags, hits, tx, ty, p, vest, ring, stun }
  const beams = [];
  let level = null, map = null, roundEnd = 0, breakUntil = 0, breakMsg = null, tags = { red: 0, blue: 0 }, stunFor = 2;
  let firing = false, tapped = false, lastShot = 0, lastSend = 0, hitMark = 0, bob = 0, recoil = 0, eye = EYE;
  let prone = false, jump = { h: 0, v: 0 }, denied = false;
  const walls = () => map?.walls ?? [];
  const to3 = (x, y) => [x / K, y / K];
  const wallAt = (x, y, h) => walls().some((wl) => { const [px, py, pw, ph] = wl; return x > px && x < px + pw && y > py && y < py + ph && h < wallH(wl); });
  const hitsWall = (x, y) => walls().some(([px, py, pw, ph]) => Math.hypot(Math.max(px - x, 0, x - (px + pw)), Math.max(py - y, 0, y - (py + ph))) < PR);

  // ---- people ----
  function addPlayer(k, f) {
    const p = stage.person(k);
    p.char.setProp('blaster');
    p.char.aiming = true;
    const vest = new THREE.Sprite(additive(glowTexture, TEAM[f.team].hex, 0.8));
    vest.scale.set(1.5, 1.7, 1);
    stage.scene.add(vest);
    const ring = groundRing(0.45, 0.7, TEAM[f.team].c, 0.7);
    stage.scene.add(ring);
    // a glowing vest: two bright bands round the chest plus a light on the front
    const band = new THREE.Group(), glow = basic(TEAM[f.team].c);
    for (const y of [0.12, -0.1]) add(band, new THREE.TorusGeometry(0.27, 0.035, 6, 24), glow, { p: [0, y, 0], r: [Math.PI / 2, 0, 0] });
    add(band, new THREE.SphereGeometry(0.06, 10, 8), basic('#ffffff'), { p: [0, 0.02, 0.27] });
    players.set(k, { ...f, tx: f.x, ty: f.y, h: 0, pr: false, p, vest, ring, band, glow, stun: 0 });
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
    m.position.copy(start).add(dir.multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    stage.scene.add(m);
    beams.push({ m, t: 0.14 });
    sparks.burst(end.x, end.y, end.z, TEAM[team].c, { n: 6, speed: 2.5 });
  }
  /** March along the crosshair: the first wall, floor, ceiling or person the beam meets. */
  function trace(x0, y0, h0, a, p) {
    const ca = Math.cos(a), sa = Math.sin(a), dh = -Math.tan(p) / K;
    for (let t = 6; t < RANGE; t += 5) {
      const x = x0 + ca * t, y = y0 + sa * t, h = h0 + dh * t;
      if (h <= 0 || h >= ROOM_H || x < 0 || y < 0 || x > (map?.w ?? 1200) || y > (map?.h ?? 900) || wallAt(x, y, h)) return { len: t, hit: null };
      for (const [k, f] of players) {
        if (k === S.me || Math.hypot(f.x - x, f.y - y) > PR) continue;
        const bottom = f.h ?? 0, top = bottom + (f.pr ? 0.55 : 1.85);
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
      if (!locked() && e?.pointerType === 'mouse') { grab(); return; }
      if (e?.button === 0 && e?.pointerType === 'mouse') { firing = true; tapped = true; }
    }
    if (type === 'up') firing = false;
  };
  const toggleProne = () => {
    if (jump.h > 0.01) return;
    prone = !prone;
    sfx(prone ? 'land' : 'whoosh', { vol: 0.5 });
  };
  stage.onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (k === 'f' && !e.repeat) { firing = down; if (down) tapped = true; }
    if (k === 'control' && !e.repeat) { if (down !== prone) toggleProne(); return; } // hold Ctrl to stay down
    if (!down || e.repeat) return;
    if (k === 'c') toggleProne();
    if (k === ' ') { if (prone) toggleProne(); else if (jump.h <= 0.01) { jump.v = JUMP_V; sfx('jump', { vol: 0.5 }); } }
  };
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
  };
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
      <p>Next round (new teams) in <b class="ar-count">${left}</b>s</p>`;
  }

  // ---- network ----
  const off = listen({
    lt: (m) => {
      if (!level) { map = m.map; level = buildLevel(m.map); stage.scene.add(level); }
      for (const k of [...players.keys()]) removePlayer(k);
      Object.entries(m.players).forEach(([k, f]) => addPlayer(k, f));
      tags = m.tags; stunFor = m.stun;
      roundEnd = m.left > 0 ? performance.now() + m.left * 1000 : 0;
      breakUntil = m.brk > 0 ? performance.now() + m.brk * 1000 : 0;
      if (!breakUntil) { breakMsg = null; breakEl.classList.add('hidden'); }
      const mine = players.get(S.me);
      if (mine) {
        orbit.yaw = mine.team === 'red' ? -Math.PI / 2 : Math.PI / 2; orbit.pitch = 0; // face the other base
        gun.setTeam(mine.team);
        stage.banner(`<div class="big" style="color:${TEAM[mine.team].c}">You're on ${TEAM[mine.team].name}!</div>Tag the other team: +100 each. Getting tagged costs 50.`, 2600);
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
        sparks.burst(X, 1.1, Z, TEAM[v.team].c, { n: 24, speed: 4 });
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
    const stunned = mine && now < mine.stun;

    if (jump.h > 0 || jump.v > 0) {
      jump.v -= GRAVITY * dt;
      jump.h = Math.max(0, jump.h + jump.v * dt);
      if (jump.h === 0) jump.v = 0;
    }
    if (mine && !denied) {
      const dir = inputDir();
      const speed = (prone ? PRONE_MOVE : MOVE) * (stunned ? 0.5 : 1);
      mine.moving = !!dir && !onBreak;
      if (mine.moving) {
        const nx = Math.min(map.w - 16, Math.max(16, mine.x + dir.dx * speed * dt));
        if (!hitsWall(nx, mine.y)) mine.x = nx;
        const ny = Math.min(map.h - 16, Math.max(16, mine.y + dir.dy * speed * dt));
        if (!hitsWall(mine.x, ny)) mine.y = ny;
      }
      mine.a = Math.atan2(-Math.cos(orbit.yaw), -Math.sin(orbit.yaw));
      mine.h = jump.h;
      mine.pr = prone;
      if (now - lastSend > 50) { lastSend = now; net.send('lt_move', { x: mine.x, y: mine.y, a: mine.a, h: jump.h, pr: prone }); }
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
        const h0 = eye + jump.h, pitch = orbit.pitch;
        const r = trace(mine.x, mine.y, h0, mine.a, pitch);
        beam(mine.x, mine.y, h0, mine.a, pitch, r.len, mine.team, true);
        recoil = 1;
        gun.flash.material.opacity = 1;
        sfx('shoot', { vol: 0.6 });
        if (r.hit && players.get(r.hit)?.team !== mine.team) hitMark = now + 150;
        net.send('lt_shoot', { x: mine.x, y: mine.y, h: h0, a: mine.a, p: pitch, len: r.len, hit: r.hit && players.get(r.hit)?.team !== mine.team ? r.hit : null });
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
      const face = Math.atan2(Math.cos(f.a ?? 0), Math.sin(f.a ?? 0));
      p.heading = f.pr ? face + Math.PI : face; // (lying down, the head points where they're looking)
      p.char.pose = f.pr ? 'lie' : 'idle';
      p.moving = !!f.moving && !f.pr;
      const stun = now < f.stun, blink = stun && Math.floor(now / 90) % 2;
      p.visible = k !== S.me;
      f.vest.visible = k !== S.me && !blink;
      const torso = p.char.rig?.torso;
      if (torso && f.band.parent !== torso) torso.add(f.band); // (re-attached if the character gets rebuilt)
      f.band.visible = !blink;
      f.vest.position.set(x, f.pr ? 0.35 : 1.15 + (f.h ?? 0), z);
      f.vest.material.opacity = stun ? 0.35 : 0.75;
      f.ring.visible = k !== S.me;
      f.ring.position.set(x, 0.03, z);
      p.sub.textContent = stun ? '⚡ TAGGED' : '';
    }
    for (const b of beams) { b.t -= dt; b.m.material.opacity = Math.max(0, b.t / 0.14); }
    for (const b of beams.filter((q) => q.t <= 0)) { stage.scene.remove(b.m); b.m.geometry.dispose(); }
    beams.splice(0, beams.length, ...beams.filter((q) => q.t > 0));

    // first-person camera: down at floor level when lying down
    if (mine) {
      const [x, z] = to3(mine.x, mine.y);
      eye += ((prone ? PRONE_EYE : EYE) - eye) * Math.min(1, dt * 10);
      if (mine.moving && jump.h === 0) bob += dt * (prone ? 5 : 11);
      orbit.height = eye + jump.h + Math.sin(bob) * (prone ? 0.015 : 0.04);
      orbit.target.set(x, 0, z);
    }
    recoil = Math.max(0, recoil - dt * 8);
    gun.flash.material.opacity = Math.max(0, gun.flash.material.opacity - dt * 14);
    gun.group.position.set(0.3 + Math.sin(bob * 0.5) * 0.012, -0.3 + Math.abs(Math.cos(bob * 0.5)) * 0.01, -0.6 + recoil * 0.06);
    gun.group.rotation.x = recoil * 0.12;
    gun.group.visible = !!mine && !onBreak;
    sparks.update(dt);

    const secs = roundEnd ? Math.max(0, Math.ceil((roundEnd - now) / 1000)) : 0;
    const label = roundEnd ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : onBreak ? 'BREAK' : '—';
    if (timeEl.textContent !== label) timeEl.textContent = label;
    timeEl.classList.toggle('low', !!roundEnd && secs <= 15);
    crossEl.classList.toggle('hit', now < hitMark);
    crossEl.classList.toggle('hidden', !mine || onBreak);
    stunEl.classList.toggle('hidden', !stunned);
    if (stunned) stunEl.querySelector('span').textContent = `${((mine.stun - now) / 1000).toFixed(1)}s`;
    poseEl.classList.toggle('hidden', !prone);
    lockEl.classList.toggle('hidden', locked() || onBreak || !!('ontouchstart' in window));
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
