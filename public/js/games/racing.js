// Racing (3D): three laps of a winding Grand Prix circuit. Mash alternating ← → (or A D, or the
// pedals) to drive; keep the rhythm to build speed. The server counts the steps; the track is just a
// (pretty) view of everyone's progress.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf, colorOf } from '../state.js';
import { toon, shiny, canvasTexture, outlineMaterial, additive, glowTexture, TAU } from '../three/materials.js';
import { Sparks, crowd } from '../three/fx.js';
import { sfx } from '../sfx.js';
import { listen, confetti } from './util.js';

const TW = 12;          // track width
const LANE = 2.1;
const OUT = outlineMaterial(0.04);

// The circuit: a closed spline through these points (x, z). The start/finish straight runs +x at z = 40.
const CONTROL = [
  [0, 40], [40, 40], [72, 32], [84, 8], [70, -14], [44, -12], [26, -28], [36, -52], [14, -66],
  [-24, -60], [-54, -46], [-66, -24], [-88, -6], [-80, 20], [-56, 26], [-34, 40],
];
const curve = new THREE.CatmullRomCurve3(CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
const L = curve.getLength();
const SAMPLES = 2000;
const table = curve.getSpacedPoints(SAMPLES).map((p, i, arr) => {
  const n = arr[(i + 1) % SAMPLES];
  const dx = n.x - p.x, dz = n.z - p.z, len = Math.hypot(dx, dz) || 1;
  return { x: p.x, z: p.z, dx: dx / len, dz: dz / len };
});

/** Point on the track `s` units from the start line, `off` units to the left of the direction of travel. */
function track(s, off = 0) {
  const u = (((s % L) + L) % L) / L * SAMPLES;
  const i = Math.floor(u) % SAMPLES, f = u - Math.floor(u);
  const a = table[i], b = table[(i + 1) % SAMPLES];
  const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
  const dx = a.dx + (b.dx - a.dx) * f, dz = a.dz + (b.dz - a.dz) * f;
  const len = Math.hypot(dx, dz) || 1;
  return { x: x + (dz / len) * off, z: z - (dx / len) * off, dx: dx / len, dz: dz / len, heading: Math.atan2(dx, dz) };
}

/** How far a point is from the track's centre line (roughly). */
function distToTrack(x, z) {
  let best = Infinity;
  for (let i = 0; i < SAMPLES; i += 8) best = Math.min(best, Math.hypot(table[i].x - x, table[i].z - z));
  return best;
}

function ribbon(width, off, step = 0.5) {
  const pos = [], uv = [], idx = [];
  let i = 0;
  for (let s = 0; s <= L + 0.001; s += step, i++) {
    const a = track(s, off + width / 2), b = track(s, off - width / 2);
    pos.push(a.x, 0, a.z, b.x, 0, b.z);
    uv.push(0, s / 4, 1, s / 4);
    if (i) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const wrap = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
const asphaltTex = wrap(canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#4a4c5e';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)';
    ctx.fillRect((i * 97) % 256, (i * 61) % 256, 2, 2);
  }
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (const u of [0.25, 0.5, 0.75]) ctx.fillRect(u * 256 - 2, 0, 4, 120);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillRect(4, 0, 5, 256);
  ctx.fillRect(247, 0, 5, 256);
}));
const curbTex = wrap(canvasTexture(64, 64, (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#e0463c';
  ctx.fillRect(0, 0, 64, 32);
}));
const checkerTex = canvasTexture(128, 32, (ctx) => {
  for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) {
    ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
    ctx.fillRect(c * 16, r * 16, 16, 16);
  }
});
const grassTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#5fae55';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? '#58a44f' : '#66b65b';
    ctx.fillRect(0, i * 22, 256, 11);
  }
}, { repeat: [40, 40] });
const bannerTex = (text, bg) => canvasTexture(512, 96, (ctx) => {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.font = '64px "Luckiest Guy", Rubik, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 256, 72);
});

let env = null;
function buildTrack() {
  const g = new THREE.Group();
  const add = (parent, geo, mat, p = [0, 0, 0], r = null, { outline = false, cast = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    if (r) m.rotation.set(...r);
    m.castShadow = cast;
    m.receiveShadow = true;
    if (outline) m.add(new THREE.Mesh(geo, OUT));
    parent.add(m);
    return m;
  };
  add(g, new THREE.PlaneGeometry(600, 600), new THREE.MeshToonMaterial({ map: grassTex }), [0, -0.02, 0], [-Math.PI / 2, 0, 0], { cast: false });
  // gravel run-off strips, asphalt and curbs
  add(g, ribbon(TW + 5, 0), toon('#d9c7a3'), [0, 0.01, 0], null, { cast: false });
  add(g, ribbon(TW, 0), new THREE.MeshToonMaterial({ map: asphaltTex }), [0, 0.02, 0], null, { cast: false });
  for (const side of [1, -1]) add(g, ribbon(0.9, side * (TW / 2 + 0.45)), new THREE.MeshToonMaterial({ map: curbTex }), [0, 0.04, 0], null, { cast: false });

  // start/finish line + gantry with the countdown lights
  const s0 = track(0);
  add(g, new THREE.PlaneGeometry(1.4, TW), new THREE.MeshBasicMaterial({ map: checkerTex }), [s0.x, 0.05, s0.z], [-Math.PI / 2, 0, s0.heading - Math.PI / 2], { cast: false });
  const gantry = new THREE.Group();
  for (const side of [-1, 1]) add(gantry, new THREE.BoxGeometry(0.5, 7, 0.5), toon('#6b7194'), [side * (TW / 2 + 1), 3.5, 0], null, { outline: true });
  add(gantry, new THREE.BoxGeometry(TW + 2.6, 1.6, 0.8), toon('#23263f'), [0, 7, 0], null, { outline: true });
  add(gantry, new THREE.PlaneGeometry(TW + 2, 1.2), new THREE.MeshBasicMaterial({ map: bannerTex('FRIENDZONE GP', '#e0463c') }), [0, 7, -0.45], [0, Math.PI, 0], { cast: false });
  const lamps = [0, 1, 2].map((i) => {
    const m = add(gantry, new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({ color: '#3a2a2a' }), [(i - 1) * 1.3, 7, -0.45], null, { cast: false });
    const glow = new THREE.Sprite(additive(glowTexture, 0xff3b3b, 0));
    glow.scale.setScalar(2.4);
    m.add(glow);
    return { m, glow };
  });
  gantry.position.set(s0.x, 0, s0.z);
  gantry.rotation.y = s0.heading;
  g.add(gantry);

  // sponsor arches around the lap
  const sponsors = [['🏎️ ZOOM', '#3b5bdb'], ['🍋 LEMON', '#e0a020'], ['👾 BOSS', '#6a3fb5']];
  sponsors.forEach(([text, col], i) => {
    const p = track(L * (0.25 + i * 0.25));
    const arch = new THREE.Group();
    for (const side of [-1, 1]) add(arch, new THREE.CylinderGeometry(0.3, 0.3, 5.5, 10), toon(col), [side * (TW / 2 + 0.8), 2.75, 0], null, { outline: true });
    add(arch, new THREE.BoxGeometry(TW + 2.2, 1.2, 0.5), toon(col), [0, 5.6, 0], null, { outline: true });
    const tex = bannerTex(text, col);
    for (const rot of [0, Math.PI]) add(arch, new THREE.PlaneGeometry(TW + 1.6, 1), new THREE.MeshBasicMaterial({ map: tex }), [0, 5.6, rot ? 0.26 : -0.26], [0, rot, 0], { cast: false });
    arch.position.set(p.x, 0, p.z);
    arch.rotation.y = p.heading;
    g.add(arch);
  });

  // grandstands along the start/finish straight (outside it, towards +z)
  const spots = [];
  for (let tier = 0; tier < 5; tier++) {
    const z = 40 + TW / 2 + 5 + tier * 1.4, y = 0.8 + tier * 0.9;
    add(g, new THREE.BoxGeometry(62, y, 1.4), toon(tier % 2 ? '#c3c9d6' : '#aab3c5'), [8, y / 2, z]);
    for (let i = 0; i < 44; i++) spots.push({ x: -22 + (i + 0.5) * (60 / 44), y, z });
  }
  add(g, new THREE.BoxGeometry(64, 0.3, 8), toon('#e0463c'), [8, 6.4, 40 + TW / 2 + 7.8], [0.15, 0, 0], { outline: true });
  const cheer = crowd(g, spots);

  // tyre walls on the outside of every tight corner
  const tyre = new THREE.TorusGeometry(0.45, 0.22, 8, 16);
  const tyreMat = toon('#23232b');
  const tyreRed = toon('#e0463c');
  for (let s = 0; s < L; s += 2.2) {
    const a = track(s), b = track(s + 3);
    const turn = Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz);
    if (Math.abs(turn) < 0.05) continue;
    const p = track(s, (turn > 0 ? 1 : -1) * (TW / 2 + 2.6));
    for (let k = 0; k < 2; k++) add(g, tyre, k ? tyreRed : tyreMat, [p.x, 0.22 + k * 0.4, p.z], [Math.PI / 2, 0, 0]);
  }

  // infield lake, trees and hay bales, kept clear of the track
  add(g, new THREE.CircleGeometry(9, 32), shiny('#3f8fcf', { roughness: 0.2 }), [-26, 0.03, -12], [-Math.PI / 2, 0, 0], { cast: false });
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  let trees = 0;
  for (let i = 0; i < 900 && trees < 170; i++) {
    const x = (rnd() - 0.5) * 300, z = (rnd() - 0.5) * 240;
    if (distToTrack(x, z) < TW / 2 + 6 || (z > 44 && z < 62 && x > -26 && x < 42) || Math.hypot(x + 26, z + 12) < 11) continue;
    const tree = new THREE.Group();
    add(tree, new THREE.CylinderGeometry(0.25, 0.35, 2, 6), toon('#7a4a28'), [0, 1, 0]);
    if (rnd() < 0.45) add(tree, new THREE.ConeGeometry(1.5 + rnd(), 4.4, 8), toon(rnd() < 0.5 ? '#2f7f5e' : '#23744a'), [0, 3.6, 0]);
    else add(tree, new THREE.IcosahedronGeometry(1.6 + rnd(), 0), toon(rnd() < 0.5 ? '#3fa34d' : '#2f8a44'), [0, 3, 0]);
    tree.position.set(x, 0, z);
    g.add(tree);
    trees++;
  }
  for (let i = 0; i < 24; i++) {
    const p = track(L * (i / 24) + 7, (i % 2 ? 1 : -1) * (TW / 2 + 5));
    if (distToTrack(p.x, p.z) < TW / 2 + 3) continue;
    add(g, new THREE.CylinderGeometry(0.7, 0.7, 1.2, 14), toon('#e8c96a'), [p.x, 0.6, p.z], [0, 0, Math.PI / 2], { outline: true });
  }
  return { group: g, lamps, cheer };
}

function buildKart(color, number) {
  const g = new THREE.Group();
  const add = (geo, mat, p, r = null, outline = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    if (r) m.rotation.set(...r);
    m.castShadow = true;
    if (outline) m.add(new THREE.Mesh(geo, OUT));
    g.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(1.5, 0.35, 2.6), toon(color), [0, 0.45, 0]);
  add(new THREE.BoxGeometry(1.2, 0.3, 0.9), toon(color), [0, 0.55, 1.35], [0.25, 0, 0]);
  add(new THREE.BoxGeometry(1.7, 0.12, 0.5), toon('#23263f'), [0, 0.5, 1.75]);
  add(new THREE.BoxGeometry(1.6, 0.4, 0.3), toon('#23263f'), [0, 0.85, -1.2]);
  add(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16), toon('#23263f'), [0, 1.0, 0.75], [1.1, 0, 0], false);
  const plate = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(32, 32, 30, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0d1f4a';
    ctx.font = '900 40px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 32, 35);
  });
  add(new THREE.CircleGeometry(0.28, 20), new THREE.MeshBasicMaterial({ map: plate }), [0, 0.72, 1.62], [-1.32, 0, 0], false);
  const wheels = [];
  for (const [x, z] of [[-0.85, 0.9], [0.85, 0.9], [-0.85, -0.9], [0.85, -0.9]]) {
    const w = new THREE.Group();
    w.position.set(x, 0.36, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.34, 16), toon('#1b1b24'));
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.08), shiny('#c0c6d4'));
    w.add(tire, hub);
    g.add(w);
    wheels.push(w);
  }
  add(new THREE.CylinderGeometry(0.09, 0.12, 0.4, 8), shiny('#8d96a8'), [0.5, 0.6, -1.45], [Math.PI / 2, 0, 0], false);
  return { g, wheels };
}

export function racing(stage) {
  env ||= buildTrack();
  stage.lights({ background: '#8fd0ff', sunPos: [40, 70, 40], box: 110, hemi: 1.25 });
  stage.scene.add(env.group);
  const sparks = new Sparks(stage.scene);
  stage.hud.innerHTML = `
    <div class="hud-panel race-top"><div class="race-pos"></div><div class="race-lap"></div><div class="race-bar"></div></div>
    <div class="hud-panel race-speed"><b>0</b><small>steps/s</small></div>
    <div class="race-count hidden"></div>
    <div class="hud-panel race-actions"></div>
    <div class="pedals hidden"><button data-side="L"><span>◀</span>L</button><button data-side="R">R<span>▶</span></button></div>
    <p class="hud-panel arena-help">Alternate <kbd>←</kbd> <kbd>→</kbd> (or <kbd>A</kbd> <kbd>D</kbd>, or tap the pedals) as fast as you can. Keep the rhythm to build speed! 3 laps.</p>`;
  const posEl = stage.hud.querySelector('.race-pos'), barEl = stage.hud.querySelector('.race-bar'), lapEl = stage.hud.querySelector('.race-lap');
  const speedEl = stage.hud.querySelector('.race-speed b'), countEl = stage.hud.querySelector('.race-count');
  const actions = stage.hud.querySelector('.race-actions'), pedals = stage.hud.querySelector('.pedals');

  const karts = new Map();   // key -> { kart, p, disp }
  const steps = {};
  let lastState = null, stateAt = performance.now(), lastSide = null, lastLit = 0, finished = false, myLap = 1;
  const cam = { pos: new THREE.Vector3(0, 30, 90), look: new THREE.Vector3() };

  const racers = () => Object.keys(S.race?.racers ?? {});
  const laps = () => S.race?.laps ?? 1;
  const raceDist = () => L * laps() + 3;
  function speedOf(k, now) {
    const list = (steps[k] ?? []).filter((ts) => now - ts < 600);
    steps[k] = list;
    return list.length / 0.6;
  }

  function syncKarts() {
    const list = racers();
    list.forEach((k, i) => {
      if (karts.has(k)) return;
      const kart = buildKart(colorOf(k), i + 1);
      stage.scene.add(kart.g);
      const p = stage.person(k);
      p.char.pose = 'sit';
      p.smooth = false;
      p.labelLift = 0.3;
      karts.set(k, { kart, p, disp: 0 });
    });
    for (const [k, v] of karts) {
      if (list.includes(k)) continue;
      stage.scene.remove(v.kart.g);
      stage.removePerson(k);
      karts.delete(k);
    }
  }

  function renderControls() {
    const r = S.race;
    if (!r) return;
    syncKarts();
    const inRace = S.me in r.racers;
    const canJoin = !inRace && (r.state === 'idle' || r.state === 'waiting');
    actions.innerHTML = [
      canJoin ? '<button class="btn primary" data-a="join">Join race</button>' : '',
      inRace && r.state === 'waiting' ? '<button class="btn primary" data-a="start">🏁 Start race!</button>' : '',
      inRace && r.state === 'waiting' ? '<button class="btn ghost" data-a="leave">Leave grid</button>' : '',
      r.state === 'waiting' ? `<span class="muted">${racers().length} on the grid. Anyone on it can start.</span>` : '',
      !inRace && !canJoin ? '<span class="muted">Race in progress. You\'re up next!</span>' : '',
    ].join('');
    actions.classList.toggle('hidden', !actions.innerHTML);
    pedals.classList.toggle('hidden', !(inRace && (r.state === 'running' || r.state === 'countdown')));
    if (r.state !== lastState) {
      const was = lastState;
      lastState = r.state;
      stateAt = performance.now();
      if (r.state === 'countdown') { lastSide = null; lastLit = 0; finished = false; myLap = 1; for (const v of karts.values()) v.disp = 0; }
      if (r.state === 'running' && was === 'countdown') sfx('go');
      if (r.state === 'done' && was === 'running' && inRace) {
        const won = r.order[0] === S.me && racers().length > 1;
        sfx(won ? 'win' : 'cheer');
        if (won) confetti(stage.hud, { count: 160 });
        const podium = r.order.slice(0, 3).map((k, i) => `${['🥇', '🥈', '🥉'][i]} <b style="color:${colorOf(k)}">${esc(nameOf(k))}</b>`).join(' &nbsp; ');
        stage.banner(`<div class="big">🏁 Race over!</div>${podium || 'Time! Nobody finished.'}`, 5000);
      }
    }
    if (!finished && r.order.includes(S.me)) {
      finished = true;
      sfx('finish');
      const place = r.order.indexOf(S.me);
      stage.banner(`<div class="big">${['🥇 1st!', '🥈 2nd!', '🥉 3rd!'][place] ?? `${place + 1}th`}</div>You crossed the line!`, 2500);
    }
  }

  function step(side) {
    const r = S.race;
    if (!r || r.state !== 'running' || !(S.me in r.racers) || side === lastSide) return;
    lastSide = side;
    net.send('race_step', { side });
    sfx('engine', { speed: speedOf(S.me, performance.now()) });
    pedals.querySelectorAll('button').forEach((b) => b.classList.toggle('next', b.dataset.side !== side));
  }

  actions.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a) net.send(`race_${a}`);
  };
  pedals.querySelectorAll('button').forEach((b) => (b.onpointerdown = (e) => { e.preventDefault(); step(b.dataset.side); }));
  stage.onKey = (e, down) => {
    if (!down || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') step('L');
    if (k === 'arrowright' || k === 'd') step('R');
  };
  const off = listen({
    race: renderControls,
    race_p: (m) => (steps[m.k] ||= []).push(performance.now()),
  });

  stage.onFrame((dt, now) => {
    const r = S.race;
    if (!r) return;
    const t = now / 1000;
    const list = racers();
    list.forEach((k, i) => {
      const v = karts.get(k);
      if (!v) return;
      const target = (r.racers[k] ?? 0) / r.len;
      v.disp += (target - v.disp) * Math.min(1, dt * 8);
      const lane = Math.max(-TW / 2 + 1, Math.min(TW / 2 - 1, (i - (list.length - 1) / 2) * LANE));
      const s = -3 + v.disp * raceDist();
      const pt = track(s, lane);
      const speed = speedOf(k, now);
      v.kart.g.position.set(pt.x, speed > 4 ? Math.abs(Math.sin(now / 40 + i)) * 0.04 : 0, pt.z);
      v.kart.g.rotation.y = pt.heading;
      v.kart.wheels.forEach((w) => { w.rotation.x += dt * speed * 2; });
      v.p.x = pt.x - pt.dx * 0.2;
      v.p.y = 0.45 + v.kart.g.position.y;
      v.p.z = pt.z - pt.dz * 0.2;
      v.p.heading = pt.heading;
      v.p.sub.textContent = r.order.includes(k) ? ['🥇', '🥈', '🥉'][r.order.indexOf(k)] ?? '🏁' : '';
      if (speed > 1 && Math.random() < dt * (6 + speed * 2)) {
        const back = track(s - 1.6, lane);
        sparks.puff(back.x + (Math.random() - 0.5) * 0.3, 0.6, back.z, speed > 9 ? '#ffb13b' : '#dfe3ee', 0.7, 0.5);
      }
    });

    // lap callouts for you
    const mine0 = karts.get(S.me);
    if (mine0 && r.state === 'running' && !finished) {
      const lap = Math.min(laps(), Math.floor(((r.racers[S.me] ?? 0) / r.len) * laps()) + 1);
      if (lap > myLap) {
        myLap = lap;
        sfx('notify');
        stage.banner(`<div class="big">${lap === laps() ? '🏁 Final lap!' : `Lap ${lap}/${laps()}`}</div>`, 1500);
      }
    }

    // countdown lights on the gantry
    const since = (now - stateAt) / 1000;
    const lit = r.state === 'countdown' ? Math.min(3, Math.floor(since) + 1) : 0;
    const go = r.state === 'running' && since < 1.2;
    env.lamps.forEach((l, i) => {
      const on = go || i < lit;
      l.m.material.color.set(go ? '#4dff7a' : on ? '#ff3b3b' : '#3a2a2a');
      l.glow.material.color.set(go ? 0x4dff7a : 0xff3b3b);
      l.glow.material.opacity = on ? 0.9 : 0;
    });
    if (r.state === 'countdown' && lit !== lastLit) { lastLit = lit; sfx('beep'); }
    countEl.classList.toggle('hidden', !(r.state === 'countdown' || go));
    countEl.textContent = go ? 'GO!' : String(Math.max(1, 4 - lit));
    countEl.classList.toggle('go', go);

    // chase camera behind your kart (or the leader when you're watching)
    const mine = karts.get(S.me) ?? [...karts.values()].sort((a, b) => b.disp - a.disp)[0];
    if (mine) {
      const pt = track(-3 + mine.disp * raceDist(), 0);
      const kp = mine.kart.g.position;
      cam.pos.lerp(new THREE.Vector3(kp.x - pt.dx * 9, 4.6, kp.z - pt.dz * 9), 1 - Math.exp(-dt * 4));
      cam.look.lerp(new THREE.Vector3(kp.x + pt.dx * 5, 1, kp.z + pt.dz * 5), 1 - Math.exp(-dt * 6));
    } else {
      cam.pos.lerp(new THREE.Vector3(8, 40, 110), 1 - Math.exp(-dt * 2));
      cam.look.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-dt * 2));
    }
    stage.camera.position.copy(cam.pos);
    stage.camera.lookAt(cam.look);
    env.cheer(t, r.state === 'running' ? 1.4 : 0.4);
    sparks.update(dt);

    const order = [...list].sort((a, b) => (r.racers[b] ?? 0) - (r.racers[a] ?? 0));
    barEl.innerHTML = list.map((k) => `<span style="left:${Math.min(100, ((r.racers[k] ?? 0) / r.len) * 100)}%;--c:${colorOf(k)}" title="${esc(nameOf(k))}" class="${k === S.me ? 'me' : ''}"></span>`).join('')
      + Array.from({ length: laps() - 1 }, (_, i) => `<em style="left:${((i + 1) / laps()) * 100}%"></em>`).join('');
    posEl.innerHTML = S.me in r.racers ? `<b>${order.indexOf(S.me) + 1}</b><small>/${list.length}</small>` : '<small>Spectating</small>';
    lapEl.textContent = S.me in r.racers ? `Lap ${Math.min(laps(), Math.floor(((r.racers[S.me] ?? 0) / r.len) * laps()) + 1)}/${laps()}` : '';
    speedEl.textContent = speedOf(S.me, now).toFixed(1);
  });

  net.send('race_join');
  renderControls();
  return () => {
    off();
    for (const [k, v] of karts) { stage.scene?.remove(v.kart.g); stage.removePerson(k); }
    stage.scene?.remove(env.group);
  };
}
