// Bumper Brawl (3D): bumper cars on a shrinking ice rink in the middle of a lake. Knock everyone
// else into the water, be the last one standing. Each player simulates their own car (so bumps
// feel instant) and the server runs the rounds. WASD/arrows drive, Space/Shift boosts.
// Game logic runs in rink pixels (900 x 600, centre 450,300); 20 px = 1 world unit.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf, colorOf } from '../state.js';
import { toon, shiny, canvasTexture, outlineMaterial, TAU } from '../three/materials.js';
import { Sparks, FloatText, crowd } from '../three/fx.js';
import { sfx } from '../sfx.js';
import { listen, confetti } from './util.js';

const CX = 450, CY = 300, K = 20;
const R0 = 270, R1 = 95;              // rink radius (px) at the start / at the end of the shrink
const CAR = 26;                        // car radius (px)
const ACCEL = 820, MAX_SPEED = 360, FRICTION = 0.85, BOUNCE = 1.9;
const BOOST = 560, BOOST_CD = 1.6, BOOST_T = 0.25;
const to3 = (x, y) => [(x - CX) / K, (y - CY) / K];
const OUT = outlineMaterial(0.04);

const iceTex = canvasTexture(512, 512, (ctx) => {
  const g = ctx.createRadialGradient(200, 200, 30, 256, 256, 256);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#e4f6ff');
  g.addColorStop(1, '#b8e4fb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(80,160,210,.3)';
  ctx.lineWidth = 5;
  for (const r of [85, 170]) { ctx.beginPath(); ctx.arc(256, 256, r, 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(512, 256); ctx.stroke();
  ctx.fillStyle = 'rgba(214,51,74,.25)';
  ctx.beginPath(); ctx.arc(256, 256, 30, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4, r0 = 40 + ((i * 53) % 180);
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(a) * r0, 256 + Math.sin(a) * r0);
    ctx.lineTo(256 + Math.cos(a + 0.2) * (r0 + 40), 256 + Math.sin(a + 0.2) * (r0 + 40));
    ctx.stroke();
  }
});

let env = null;
function buildLake() {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 60, 60), new THREE.MeshStandardMaterial({ color: '#2f7fc8', roughness: 0.25, metalness: 0.1, flatShading: true }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.6;
  water.receiveShadow = true;
  g.add(water);
  const base = Float32Array.from(water.geometry.attributes.position.array);
  const rink = new THREE.Group();
  const ice = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64), [new THREE.MeshToonMaterial({ color: '#9fd8f0' }), new THREE.MeshToonMaterial({ map: iceTex }), new THREE.MeshToonMaterial({ color: '#9fd8f0' })]);
  ice.receiveShadow = true;
  ice.castShadow = true;
  rink.add(ice);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  edge.rotation.x = Math.PI / 2;
  rink.add(edge);
  const danger = new THREE.Mesh(new THREE.TorusGeometry(1, 0.01, 6, 96), new THREE.MeshBasicMaterial({ color: '#ff5d73', transparent: true }));
  danger.rotation.x = Math.PI / 2;
  rink.add(danger);
  g.add(rink);
  // floating ice chunks + snowy shore with spectators
  const chunks = [];
  for (let i = 0; i < 20; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6 + (i % 4) * 0.3, 0.7 + (i % 4) * 0.3, 0.3, 7), new THREE.MeshToonMaterial({ color: '#e4f6ff' }));
    c.userData = { a: i * 2.39, r: 16 + (i * 37) % 14, s: 0.02 + (i % 5) * 0.01 };
    g.add(c);
    chunks.push(c);
  }
  const shore = new THREE.Mesh(new THREE.RingGeometry(36, 70, 64), new THREE.MeshToonMaterial({ color: '#f4f8ff' }));
  shore.rotation.x = -Math.PI / 2;
  shore.position.y = -0.2;
  g.add(shore);
  const spots = [];
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * TAU;
    spots.push({ x: Math.cos(a) * (38 + (i % 2) * 1.5), y: -0.2, z: Math.sin(a) * (38 + (i % 2) * 1.5) });
  }
  const cheer = crowd(g, spots);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.1;
    const tree = new THREE.Group();
    const pine = new THREE.Mesh(new THREE.ConeGeometry(2, 5, 8), toon('#2f6f4a'));
    pine.position.y = 3.5;
    const snow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 8), toon('#ffffff'));
    snow.position.y = 5.7;
    tree.add(pine, snow);
    tree.position.set(Math.cos(a) * 46, 0, Math.sin(a) * 46);
    g.add(tree);
  }
  return {
    group: g, rink, danger, cheer,
    tick(t, dt) {
      const pos = water.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        pos.setZ(i, Math.sin(x * 0.25 + t * 1.2) * 0.18 + Math.cos(y * 0.3 + t * 0.9) * 0.18);
      }
      pos.needsUpdate = true;
      water.geometry.computeVertexNormals();
      chunks.forEach((c) => {
        c.userData.a += c.userData.s * dt;
        c.position.set(Math.cos(c.userData.a) * c.userData.r, -0.45 + Math.sin(t + c.userData.r) * 0.08, Math.sin(c.userData.a) * c.userData.r);
      });
    },
  };
}

function buildCar(color) {
  const g = new THREE.Group();
  const add = (geo, mat, p, outline = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    m.castShadow = true;
    if (outline) m.add(new THREE.Mesh(geo, OUT));
    g.add(m);
    return m;
  };
  add(new THREE.TorusGeometry(1.2, 0.26, 10, 32), toon('#2b2f4a'), [0, 0.35, 0]).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(1.1, 1.2, 0.6, 32), toon(color), [0, 0.45, 0]);
  add(new THREE.CylinderGeometry(0.9, 1.0, 0.3, 24), toon('#ffffff'), [0, 0.8, 0.15]);
  add(new THREE.BoxGeometry(0.9, 0.5, 0.15), shiny('#bfefff', { transparent: true, opacity: 0.6 }), [0, 1.1, 0.75], false);
  add(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), shiny('#c0c6d4'), [0, 1.6, -0.8], false);
  add(new THREE.SphereGeometry(0.12, 10, 8), toon('#ffd84d'), [0, 2.5, -0.8], false);
  return g;
}

export function bumper(stage) {
  env ||= buildLake();
  stage.lights({ background: '#bfe6ff', sky: 0xeaf6ff, ground: 0x9fc4e0, hemi: 1.3, sunPos: [12, 40, 18], box: 22 });
  stage.scene.add(env.group);
  const orbit = stage.useOrbit({ yaw: 0, pitch: 0.95, dist: 30, minDist: 18, maxDist: 42, height: 0 });
  orbit.fixed = true;
  orbit.target.set(0, 0, 1.5);
  const sparks = new Sparks(stage.scene);
  const texts = new FloatText(stage.scene);
  stage.hud.innerHTML = `
    <div class="hud-panel arena-scores bumper-wins"></div>
    <div class="hud-panel bumper-status"></div>
    <div class="hud-panel arena-bottom"><div class="meter"><i></i><span>BOOST</span></div></div>
    <div class="bumper-count hidden"></div>
    <p class="hud-panel arena-help">Drive with <kbd>WASD</kbd>/arrows · <kbd>Space</kbd>/<kbd>Shift</kbd> to boost-ram · knock everyone off the ice before it melts. Last car standing wins 120 🪙!</p>`;
  const winsEl = stage.hud.querySelector('.bumper-wins'), statusEl = stage.hud.querySelector('.bumper-status');
  const meterEl = stage.hud.querySelector('.meter'), countEl = stage.hud.querySelector('.bumper-count');

  const cars = new Map();   // key -> { x, y, vx, vy, tx, ty, fall, dash, face, mesh, p }
  let state = 'waiting', alive = new Set(), wins = {}, fightAt = 0, shrinkT = 60, endsAt = 0;
  let me = null, boostCd = 0, boostT = 0, lastHit = null, lastSend = 0, lastCount = -1;

  const radius = (now = performance.now()) => {
    if (state !== 'fight') return R0;
    const t = (now - fightAt) / 1000;
    return R0 - (R0 - R1) * Math.min(1, Math.max(0, (t - 5) / Math.max(1, shrinkT - 5)));
  };
  const car = (k) => {
    if (!cars.has(k)) {
      const mesh = buildCar(colorOf(k));
      stage.scene.add(mesh);
      const p = stage.person(k);
      p.char.pose = 'sit';
      p.smooth = false;
      p.labelLift = 0.6;
      cars.set(k, { x: CX, y: CY, vx: 0, vy: 0, tx: CX, ty: CY, fall: 0, dash: false, face: 0, mesh, p });
    }
    return cars.get(k);
  };
  const dropCar = (k) => {
    const c = cars.get(k);
    if (!c) return;
    stage.scene.remove(c.mesh);
    stage.removePerson(k);
    cars.delete(k);
  };
  const playing = () => state === 'fight' && alive.has(S.me) && me && !me.fall;
  const practicing = () => (state === 'waiting' || state === 'starting' || state === 'done') && me && !me.fall;

  function renderWins() {
    winsEl.innerHTML = [...cars.keys()].sort((a, b) => (wins[b] ?? 0) - (wins[a] ?? 0))
      .map((k) => `<span style="--c:${colorOf(k)}"><i class="dot"></i>${esc(nameOf(k))} <b>${wins[k] ?? 0}</b>🏆</span>`).join('');
  }
  function place(k, x, y) {
    Object.assign(car(k), { x, y, tx: x, ty: y, vx: 0, vy: 0, fall: 0 });
  }
  const burstAt = (x, y, color, n = 14, speed = 5, h = 0.8) => { const [X, Z] = to3(x, y); sparks.burst(X, h, Z, color, { n, speed }); };

  // ---- input ---------------------------------------------------------------------
  stage.onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (down && (k === ' ' || k === 'shift') && !e.repeat) boost();
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
  function boost() {
    if (!(playing() || practicing()) || boostCd > 0) return;
    const sp = Math.hypot(me.vx, me.vy);
    const dir = inputDir() ?? (sp > 20 ? { dx: me.vx / sp, dy: me.vy / sp } : { dx: Math.sin(me.face), dy: Math.cos(me.face) });
    me.vx += dir.dx * BOOST;
    me.vy += dir.dy * BOOST;
    boostCd = BOOST_CD;
    boostT = BOOST_T;
    sfx('boost');
    burstAt(me.x, me.y, '#ffffff', 10, 3);
  }

  // ---- network ---------------------------------------------------------------------
  function applyView(m) {
    const was = state;
    state = m.state;
    endsAt = performance.now() + (m.left ?? 0) * 1000;
    alive = new Set(m.alive);
    wins = m.wins ?? wins;
    shrinkT = m.shrink ?? shrinkT;
    for (const k of Object.keys(m.fighters)) car(k);
    for (const k of [...cars.keys()]) if (!(k in m.fighters)) dropCar(k);
    me = car(S.me);
    if (m.spawns) {
      for (const [k, [x, y]] of Object.entries(m.spawns)) place(k, x, y);
      boostCd = 0;
      lastHit = null;
    }
    if (state === 'fight') fightAt = performance.now() - (m.elapsed ?? 0) * 1000;
    if (state === 'countdown') { lastCount = -1; stage.banner('<div class="big">Get ready!</div>Knock everyone off the ice!', 1500); }
    if (state === 'fight' && was !== 'fight') sfx('go');
    if (state === 'waiting' && cars.size < 2) stage.banner('Waiting for another driver… practice your moves!', 2600);
    if (m.winner !== undefined && state === 'done') {
      if (m.winner === S.me) { sfx('win'); confetti(stage.hud, { count: 160 }); stage.banner('<div class="big">🏆 You win!</div>+120 🪙', 3800); }
      else if (m.winner) { sfx('cheer'); stage.banner(`<div class="big">🏆 ${esc(nameOf(m.winner))} wins!</div>Next round soon…`, 3800); }
      else stage.banner('<div class="big">Time!</div>Nobody got knocked off. Rematch!', 3000);
    }
    renderWins();
  }

  const off = listen({
    bumper: applyView,
    bumper_add: (m) => { car(m.k); renderWins(); },
    bumper_del: (m) => { dropCar(m.k); renderWins(); },
    bumper_pos: (m) => {
      const c = car(m.k);
      if (c.fall) return;
      c.tx = m.x; c.ty = m.y; c.vx = m.vx; c.vy = m.vy; c.dash = m.d;
    },
    bumper_out: (m) => {
      alive.delete(m.k);
      const c = cars.get(m.k);
      if (c && m.k !== S.me && !c.fall) { c.fall = 0.001; sfx('fall', { vol: 0.6 }); }
      if (m.by) { const v = cars.get(m.k); if (v) { const [X, Z] = to3(v.x, v.y); texts.add(`${nameOf(m.by)} 💥`, X, 3, Z, colorOf(m.by), 0.9); } }
      if (m.by === S.me) { sfx('coin'); stage.banner(`💥 You knocked off ${esc(nameOf(m.k))}! +10 🪙`, 1800); }
    },
  });

  function fallOff() {
    me.fall = 0.001;
    sfx('fall');
    stage.shake(0.6);
    if (state === 'fight' && alive.has(S.me)) {
      const by = lastHit && performance.now() - lastHit.at < 3500 ? lastHit.k : null;
      alive.delete(S.me);
      net.send('bumper_out', { by });
      stage.banner(`<div class="big">💦 Splash!</div>${by ? `${esc(nameOf(by))} got you. ` : ''}Watch the rest of the round…`, 2600);
    }
  }

  // ---- simulation ---------------------------------------------------------------------
  stage.onFrame((dt, now) => {
    const t = now / 1000;
    boostCd = Math.max(0, boostCd - dt);
    boostT = Math.max(0, boostT - dt);
    const R = radius(now);
    if (me && (playing() || practicing())) {
      const dir = inputDir();
      if (dir) { me.vx += dir.dx * ACCEL * dt; me.vy += dir.dy * ACCEL * dt; }
      const sp = Math.hypot(me.vx, me.vy);
      const cap = boostT > 0 ? MAX_SPEED + BOOST : MAX_SPEED;
      if (sp > cap) { me.vx *= cap / sp; me.vy *= cap / sp; }
      const f = Math.exp(-FRICTION * dt);
      me.vx *= f;
      me.vy *= f;
      me.x += me.vx * dt;
      me.y += me.vy * dt;
      // bumping into other cars: each client resolves its own side of the collision
      for (const [k, o] of cars) {
        if (k === S.me || o.fall || (state === 'fight' && !alive.has(k))) continue;
        const dx = me.x - o.x, dy = me.y - o.y, d = Math.hypot(dx, dy) || 0.01;
        if (d >= CAR * 2) continue;
        const nx = dx / d, ny = dy / d;
        me.x += nx * (CAR * 2 - d) * 0.5;
        me.y += ny * (CAR * 2 - d) * 0.5;
        const rel = (me.vx - o.vx) * nx + (me.vy - o.vy) * ny;
        if (rel < 0) {
          const j = (-BOUNCE * rel) / 2 * (o.dash ? 1.5 : 1) + 50;
          me.vx += nx * j;
          me.vy += ny * j;
          const power = Math.min(1, -rel / 500);
          sfx('bonk', { power });
          burstAt(me.x - nx * CAR, me.y - ny * CAR, '#fff6b0', 8 + Math.round(power * 10), 3 + power * 5, 0.9);
          if (power > 0.35) {
            stage.shake(0.35 * power);
            const [X, Z] = to3(me.x - nx * CAR, me.y - ny * CAR);
            texts.add('BONK!', X, 2.5, Z, '#ffd84d', 0.7 + power * 0.4);
          }
          lastHit = { k, at: now };
        }
      }
      if (Math.hypot(me.x - CX, me.y - CY) > R + 6) {
        if (playing()) fallOff();
        else if (practicing()) { me.fall = 0.001; sfx('fall', { vol: 0.6 }); }
      }
      if (now - lastSend > 50) {
        lastSend = now;
        net.send('bumper_move', { x: me.x, y: me.y, vx: me.vx, vy: me.vy, d: boostT > 0 });
      }
    }

    const lerp = 1 - Math.exp(-dt * 15);
    for (const [k, c] of cars) {
      if (k !== S.me && !c.fall) {
        c.x += (c.tx - c.x) * lerp;
        c.y += (c.ty - c.y) * lerp;
      }
      if (c.fall) {
        c.fall += dt;
        if (k === S.me && c.fall > 1.6 && state !== 'fight') place(S.me, CX + (Math.random() - 0.5) * 80, CY + (Math.random() - 0.5) * 80);
      }
      const hidden = state === 'fight' && !alive.has(k) && !c.fall;
      const [X, Z] = to3(c.x, c.y);
      const sink = c.fall ? Math.min(1, c.fall / 0.7) : 0;
      const sp = Math.hypot(c.vx, c.vy);
      if (sp > 30) c.face += Math.atan2(Math.sin(Math.atan2(c.vx, c.vy) - c.face), Math.cos(Math.atan2(c.vx, c.vy) - c.face)) * Math.min(1, dt * 8);
      const y = 0.5 - sink * 2.5;
      c.mesh.visible = !hidden && c.fall < 1.2;
      c.mesh.position.set(X, y, Z);
      c.mesh.rotation.set(sink * 0.8, c.face, Math.sin(now / 120 + X) * 0.03 * Math.min(1, sp / 200));
      c.p.x = X;
      c.p.y = y + 0.35;
      c.p.z = Z;
      c.p.heading = c.face;
      c.p.visible = c.mesh.visible;
      if (c.fall > 0.55 && c.fall - dt <= 0.55) sparks.burst(X, 0, Z, '#bfefff', { n: 26, speed: 6, up: 5 });
      if ((c.dash || (k === S.me && boostT > 0)) && !c.fall) sparks.puff(X, 0.8, Z, colorOf(k), 1.6, 0.3);
    }

    // the rink melts from the edge
    const r3 = R / K;
    env.rink.scale.set(r3, 0.5, r3);
    env.rink.position.y = 0.25;
    env.danger.visible = state === 'fight' && R < R0 - 1;
    env.danger.scale.setScalar(Math.max(0.1, (R - 14) / R));
    env.danger.material.opacity = 0.5 + Math.sin(t * 8) * 0.35;
    env.tick(t, dt);
    env.cheer(t, state === 'fight' ? 1.3 : 0.4);
    sparks.update(dt);
    texts.update(dt);

    const left = Math.max(0, (endsAt - now) / 1000);
    statusEl.textContent = state === 'waiting' ? (cars.size < 2 ? 'Waiting for another driver… (practice mode)' : 'Getting ready…')
      : state === 'starting' ? `Next round in ${Math.ceil(left)}…`
        : state === 'fight' ? `${alive.size} left · ${R < R0 - 1 ? 'the ice is melting!' : 'fight!'} · ${Math.ceil(left)}s${alive.has(S.me) ? '' : ' · 👀 spectating'}`
          : state === 'countdown' ? 'Get ready…' : 'Round over!';
    if (state === 'countdown') {
      const n = Math.ceil(left);
      if (n !== lastCount && n > 0) { lastCount = n; sfx('beep'); }
      countEl.classList.remove('hidden');
      countEl.textContent = n > 0 ? String(n) : 'GO!';
    } else countEl.classList.add('hidden');
    const ready = 1 - boostCd / BOOST_CD;
    meterEl.querySelector('i').style.width = `${ready * 100}%`;
    meterEl.classList.toggle('ready', ready >= 1);
  });

  return () => {
    off();
    for (const k of [...cars.keys()]) dropCar(k);
    stage.scene?.remove(env.group);
  };
}
