// Archery (3D): stand at the shooting line and send five arrows downrange. Aim with the mouse,
// hold to draw (your aim steadies), release to shoot. Hold too long and your arms shake; the wind
// pushes arrows and the last two targets move. Aiming happens on a flat "target plane" measured in
// the same units as the old 2D range (580 x 380 px), so the scoring rules are unchanged.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, fmt } from '../state.js';
import { toon, canvasTexture, outlineMaterial, TAU } from '../three/materials.js';
import { Sparks, FloatText, emojiSprite } from '../three/fx.js';
import { sfx } from '../sfx.js';
import { listen, confetti } from './util.js';

const CW = 580, ARROWS = 5, TR = 60, TY = 150;
const DIST = 24;            // target distance (units)
const PX = 34;              // plane px per unit
const TARGET_Y = 2.6;       // height of the target centre (units)
const planePos = (cx, cy) => new THREE.Vector3((cx - CW / 2) / PX, TARGET_Y - (cy - TY) / PX, -DIST);
const OUT = outlineMaterial(0.03);

const faceTex = canvasTexture(256, 256, (ctx) => {
  const colors = ['#f4f4f4', '#f4f4f4', '#2a2a2a', '#2a2a2a', '#3aa0ff', '#3aa0ff', '#ff4d4d', '#ff4d4d', '#ffd84d', '#ffd84d'];
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = colors[i];
    ctx.beginPath(); ctx.arc(128, 128, 126 - i * 12.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
});
const grassTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#6fbd5f';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#66b458' : '#78c667';
    ctx.fillRect(i * 32, 0, 16, 256);
  }
}, { repeat: [10, 10] });

let env = null;
function buildRange() {
  const g = new THREE.Group();
  const add = (parent, geo, mat, p = [0, 0, 0], r = null, outline = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    if (r) m.rotation.set(...r);
    m.castShadow = true;
    m.receiveShadow = true;
    if (outline) m.add(new THREE.Mesh(geo, OUT));
    parent.add(m);
    return m;
  };
  add(g, new THREE.PlaneGeometry(200, 200), new THREE.MeshToonMaterial({ map: grassTex }), [0, 0, -30], [-Math.PI / 2, 0, 0]).castShadow = false;
  // the shooting booth
  const wood = toon('#a8723f');
  for (const x of [-3.4, 3.4]) for (const z of [-1.5, 2]) add(g, new THREE.BoxGeometry(0.25, 4.8, 0.25), wood, [x, 2.4, z], null, true);
  add(g, new THREE.BoxGeometry(7.6, 0.25, 4.4), toon('#2f7f5e'), [0, 4.9, 0.25], [0.12, 0, 0], true);
  add(g, new THREE.BoxGeometry(6.4, 0.9, 0.2), wood, [0, 0.45, -1.5], null, true);
  add(g, new THREE.BoxGeometry(7, 0.1, 5), toon('#c9955a'), [0, 0.05, 0.3]).castShadow = false;
  // lanes, hay bales, flags
  for (const x of [-7, 7]) add(g, new THREE.BoxGeometry(0.08, 0.08, DIST + 6), toon('#ffffff'), [x, 0.4, -DIST / 2]);
  for (const [x, z] of [[-5, -8], [5.5, -12], [-6, -17], [6, -20]]) add(g, new THREE.CylinderGeometry(0.7, 0.7, 1.2, 14), toon('#e8c96a'), [x, 0.6, z], [0, 0, Math.PI / 2], true);
  const flags = [];
  for (const x of [-6.5, 6.5]) {
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 5, 8), toon('#6b4a2b'), [x, 2.5, -10]);
    flags.push(add(g, new THREE.ConeGeometry(0.35, 1.6, 8, 1, true), toon('#ff5d73', { side: THREE.DoubleSide }), [x, 4.6, -10], [0, 0, -Math.PI / 2]));
  }
  // decorative targets in the other lanes
  for (const x of [-11, 11]) {
    const t = new THREE.Group();
    add(t, new THREE.CylinderGeometry(1.4, 1.4, 0.3, 32), toon('#e8c96a'), [0, 0, 0], [Math.PI / 2, 0, 0], true);
    add(t, new THREE.CircleGeometry(1.3, 32), new THREE.MeshToonMaterial({ map: faceTex }), [0, 0, 0.16]);
    t.position.set(x, 2.2, -DIST);
    g.add(t);
  }
  // rolling hills + trees in the distance
  for (let i = 0; i < 9; i++) add(g, new THREE.SphereGeometry(14 + (i % 3) * 5, 20, 12), toon(i % 2 ? '#7ccf6b' : '#6ab85d'), [-60 + i * 15, -6, -70 - (i % 2) * 12]).castShadow = false;
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 40; i++) {
    const x = (rnd() - 0.5) * 90, z = -34 - rnd() * 30;
    const tr = new THREE.Group();
    add(tr, new THREE.CylinderGeometry(0.25, 0.35, 2, 6), toon('#7a4a28'), [0, 1, 0]);
    add(tr, new THREE.ConeGeometry(1.6 + rnd(), 4, 8), toon(rnd() < 0.5 ? '#2f7f5e' : '#3fa34d'), [0, 3.6, 0]);
    tr.position.set(x, 0, z);
    g.add(tr);
  }
  // the live target, on a stand that can slide sideways
  const target = new THREE.Group();
  add(target, new THREE.CylinderGeometry(TR / PX + 0.2, TR / PX + 0.2, 0.4, 40), toon('#e8c96a'), [0, 0, 0], [Math.PI / 2, 0, 0], true);
  add(target, new THREE.CircleGeometry(TR / PX, 40), new THREE.MeshToonMaterial({ map: faceTex }), [0, 0, 0.21]);
  for (const s of [-1, 1]) add(target, new THREE.BoxGeometry(0.18, TARGET_Y + 0.4, 0.18), toon('#6b4a2b'), [s * 1.2, -TARGET_Y / 2, -0.3], [0.12, 0, 0], true);
  target.position.set(0, TARGET_Y, -DIST);
  g.add(target);
  return { group: g, target, flags };
}

function arrowMesh() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), toon('#8b5a2b'));
  shaft.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), toon('#c0c6d4'));
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.8;
  g.add(shaft, tip);
  for (let i = 0; i < 3; i++) {
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * TAU;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.26), toon('#ff5d73', { side: THREE.DoubleSide }));
    f.rotation.y = Math.PI / 2;
    f.position.set(0, 0.07, 0.58);
    holder.add(f);
    g.add(holder);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g; // points down -Z
}

export function archery(stage) {
  env ||= buildRange();
  stage.lights({ background: '#8fd0ff', sunPos: [18, 40, 20], box: 34, hemi: 1.3 });
  stage.scene.add(env.group);
  const sparks = new Sparks(stage.scene);
  const texts = new FloatText(stage.scene);
  stage.hud.innerHTML = `
    <div class="hud-panel arch-score"><b class="score">0</b><small>/50</small><div class="quiver"></div></div>
    <div class="hud-panel arch-wind"></div>
    <div class="hud-panel arch-board"><h4>🏆 Zone best</h4><ol></ol></div>
    <div class="arch-reticle"><i></i><div class="arch-meter hidden"><b></b></div></div>
    <div class="hud-panel arch-result hidden"><div class="res"></div><button class="btn primary" data-again>Shoot again</button></div>
    <p class="hud-panel arena-help">Aim with the mouse. <b>Hold</b> to draw the bow (your aim steadies), <b>release</b> to shoot. Mind the wind, and don't hold too long! Arrows 4–5 move.</p>`;
  const $h = (s) => stage.hud.querySelector(s);
  const reticle = $h('.arch-reticle');
  stage.canvas.style.cursor = 'none';

  const me = stage.person(S.me);
  Object.assign(me, { x: 0, z: 0.6, heading: Math.PI, smooth: false });
  me.char.setProp('bow');
  me.char.aiming = true;

  let mouse = { x: CW / 2, y: TY }, drawing = false, drawT = 0, t = 0;
  let round, stuck = [], flying = null, leaves = [];

  function newRound() {
    for (const a of stuck) a.parent?.remove(a);
    stuck = [];
    round = { n: 0, shots: [], wait: 0, done: false };
    setupArrow();
    $h('.arch-result').classList.add('hidden');
    renderHud();
  }
  function setupArrow() {
    const n = round.n;
    round.wind = n === 0 ? (Math.random() - 0.5) * 0.4 : (Math.random() - 0.5) * 2;
    round.moving = n >= 3;
    round.speed = n === 3 ? 0.9 : 1.4;
    round.baseX = 200 + Math.random() * 180;
    round.phase = Math.random() * TAU;
    renderHud();
  }
  const targetX = () => (round.moving ? CW / 2 + Math.sin(t * round.speed + round.phase) * 150 : round.baseX);

  function sway() {
    let amp = 14;
    if (drawing) amp = drawT < 1.2 ? 14 - (drawT / 1.2) * 10 : drawT < 2.4 ? 4 : Math.min(40, 4 + (drawT - 2.4) * 18);
    return { x: (Math.sin(t * 1.7) + Math.sin(t * 2.9 + 1) * 0.5) * amp * 0.7, y: (Math.cos(t * 1.3) + Math.sin(t * 3.3 + 2) * 0.5) * amp * 0.7, amp };
  }
  const aim = () => { const s = sway(); return { x: mouse.x + s.x, y: mouse.y + s.y }; };

  function startDraw() {
    if (round.done || flying || round.wait > 0) return;
    drawing = true;
    drawT = 0;
    sfx('draw');
  }

  function release() {
    if (!drawing) return;
    drawing = false;
    if (round.done || flying || round.wait > 0) return;
    const power = Math.min(1, drawT / 0.8);
    if (power < 0.25) {
      texts.add('Pull further!', 0, TARGET_Y + 1.5, -8, '#ffd84d', 0.8);
      sfx('miss');
      return;
    }
    sfx('twang');
    sfx('arrow');
    const a = aim();
    const land = { x: a.x + round.wind * 42, y: a.y + (1 - power) * 50 };
    const mesh = arrowMesh();
    stage.scene.add(mesh);
    flying = { from: new THREE.Vector3(0.1, 1.9, -0.6), to: land, t: 0, mesh };
  }

  function landArrow() {
    const { to, mesh } = flying;
    flying = null;
    const tx = targetX();
    const d = Math.hypot(to.x - tx, to.y - TY);
    const pts = d <= TR ? 10 - Math.floor(d / (TR / 10)) : 0;
    round.shots.push(pts);
    const hit = planePos(to.x, to.y);
    if (pts) {
      // stick it in the (possibly moving) target
      const local = env.target.worldToLocal(hit.clone());
      mesh.position.set(local.x, local.y, 0.25 + 0.5);
      mesh.rotation.set(0, 0, 0);
      env.target.add(mesh);
      stuck.push(mesh);
      sparks.burst(hit.x, hit.y, hit.z + 0.3, pts === 10 ? '#ffd84d' : '#ffffff', { n: pts === 10 ? 26 : 10, gravity: 4, speed: 3 });
      texts.add(pts === 10 ? 'BULLSEYE! +10' : `+${pts}`, hit.x, hit.y + 1.2, hit.z + 0.5, pts >= 9 ? '#ffd84d' : '#ffffff', pts === 10 ? 1.4 : 1);
      if (pts === 10) { confetti(stage.hud, { count: 50 }); stage.shake(0.2); }
      sfx(pts === 10 ? 'bullseye' : 'thud');
    } else {
      mesh.position.set(hit.x, 0.25, hit.z + 1.5);
      mesh.rotation.x = 0.5;
      stuck.push(mesh);
      texts.add('Miss', hit.x, 2, hit.z, '#ff8a9a', 1);
      sfx('miss');
    }
    round.n += 1;
    if (round.n >= ARROWS) {
      round.done = true;
      net.send('archery', { score: round.shots.reduce((s, x) => s + x, 0) });
    } else round.wait = 0.8;
    renderHud();
  }

  function renderHud() {
    const score = round.shots.reduce((s, x) => s + x, 0);
    $h('.score').textContent = score;
    $h('.quiver').innerHTML = Array.from({ length: ARROWS }, (_, i) => `<span class="${i < round.n ? 'used' : ''}">${i < round.n ? round.shots[i] : '➶'}</span>`).join('');
    const w = round.wind;
    $h('.arch-wind').innerHTML = `Wind <b>${w < -0.05 ? '←' : w > 0.05 ? '→' : '·'} ${Math.abs(w * 10).toFixed(1)}</b>${round.moving && !round.done ? ' · <span class="win">Moving target!</span>' : ''}`;
    const board = Object.values(S.players).filter((p) => p.stats.archeryBest > 0).sort((a, b) => b.stats.archeryBest - a.stats.archeryBest).slice(0, 6);
    $h('.arch-board ol').innerHTML = board.length ? board.map((p) => `<li class="${p.key === S.me ? 'me' : ''}"><span>${esc(p.name)}</span><b>${p.stats.archeryBest}</b></li>`).join('') : '<li class="muted">No scores yet!</li>';
  }

  // ---- input ---------------------------------------------------------------------
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), DIST);
  stage.onPointer = (type, e) => {
    if (type === 'down' && e.button === 0) startDraw();
    if (type === 'up') release();
  };
  stage.onKey = (e, down) => {
    if (e.code !== 'Space') return;
    if (down && !e.repeat) startDraw();
    if (!down) release();
  };
  $h('[data-again]').onclick = newRound;
  const off = listen({
    archery_result: (m) => {
      $h('.arch-result').classList.remove('hidden');
      $h('.res').innerHTML = `<b>${m.score}/50</b> · +${fmt(m.coins)} 🪙${m.best ? ' · <span class="win">New personal best!</span>' : ''}`;
      if (m.best) sfx('win');
      renderHud();
    },
    error: (m) => {
      if (m.for !== 'archery') return;
      m.handled = true;
      $h('.arch-result').classList.remove('hidden');
      $h('.res').textContent = m.msg;
    },
    player: () => renderHud(),
  });

  // ---- frame ---------------------------------------------------------------------
  // from the drawing-hand side and a little wider than usual, so you see your character side-on
  // drawing the bow with the targets beyond
  const camPos = new THREE.Vector3(2.5, 1.95, 2.4), camLook = new THREE.Vector3(-7, TARGET_Y - 1.3, -DIST);
  const hit = new THREE.Vector3();
  stage.onFrame((dt) => {
    t += dt;
    if (drawing) drawT += dt;
    // the bow bends as you hold, and snaps back when you let go
    const goal = drawing ? Math.min(1, drawT / 0.8) : 0;
    me.char.draw += (goal - me.char.draw) * Math.min(1, dt * (drawing ? 10 : 25));
    me.char.nocked = !flying && !round.done && round.wait <= 0;
    if (round.wait > 0) { round.wait -= dt; if (round.wait <= 0) setupArrow(); }
    const fov = (window.innerWidth < 700 ? 62 : 50) + 18;
    if (stage.camera.fov !== fov) { stage.camera.fov = fov; stage.camera.updateProjectionMatrix(); }
    stage.camera.position.copy(camPos);
    stage.camera.lookAt(camLook);
    stage.raycaster.setFromCamera(stage.mouse, stage.camera);
    if (stage.mouseIn && stage.raycaster.ray.intersectPlane(plane, hit)) mouse = { x: hit.x * PX + CW / 2, y: TY - (hit.y - TARGET_Y) * PX };
    env.target.position.x = (targetX() - CW / 2) / PX;
    // the reticle (with sway) and draw meter
    const a = aim();
    const p = planePos(a.x, a.y).project(stage.camera);
    const s = sway();
    reticle.style.transform = `translate(${((p.x + 1) / 2) * innerWidth}px, ${((1 - p.y) / 2) * innerHeight}px)`;
    reticle.classList.toggle('drawing', drawing);
    reticle.classList.toggle('shaky', drawing && drawT > 2.4);
    reticle.classList.toggle('hidden', round.done);
    const size = `${20 + s.amp * 1.2}px`;
    reticle.querySelector('i').style.width = reticle.querySelector('i').style.height = size;
    reticle.querySelector('.arch-meter b').style.width = `${Math.min(1, drawT / 0.8) * 100}%`;
    reticle.querySelector('.arch-meter').classList.toggle('hidden', !drawing);
    if (flying) {
      flying.t += dt / 0.42;
      const k = Math.min(1, flying.t);
      const end = planePos(flying.to.x, flying.to.y);
      const at = (u) => { const v = flying.from.clone().lerp(end, u); v.y += Math.sin(u * Math.PI) * 1.6; return v; };
      const pos = at(k), ahead = at(Math.min(1, k + 0.02));
      flying.mesh.position.copy(pos);
      flying.mesh.lookAt(pos.clone().multiplyScalar(2).sub(ahead)); // the arrow's tip points down -Z
      if (Math.random() < 0.6) sparks.puff(pos.x, pos.y, pos.z, '#ffffff', 0.25, 0.25);
      if (k >= 1) landArrow();
    }
    // wind: flags and drifting leaves
    env.flags.forEach((f) => {
      f.rotation.set(0, round.wind < 0 ? Math.PI : 0, -Math.PI / 2 + Math.sin(t * 6) * 0.05 * (1 + Math.abs(round.wind)));
      f.scale.y = 0.6 + Math.min(1, Math.abs(round.wind)) * 0.6;
    });
    if (Math.abs(round.wind) > 0.15 && Math.random() < Math.abs(round.wind) * dt * 6) {
      const leaf = emojiSprite('🍃', 0.4);
      leaf.position.set(round.wind > 0 ? -14 : 14, 1 + Math.random() * 4, -4 - Math.random() * 18);
      stage.scene.add(leaf);
      leaves.push({ s: leaf, life: 5 });
    }
    leaves = leaves.filter((l) => {
      l.life -= dt;
      l.s.position.x += round.wind * dt * 8;
      l.s.position.y += Math.sin(t * 3 + l.life) * dt * 0.5;
      l.s.material.rotation += dt * 2;
      if (l.life > 0) return true;
      stage.scene.remove(l.s);
      return false;
    });
    sparks.update(dt);
    texts.update(dt);
  });

  newRound();
  return () => {
    off();
    for (const a of stuck) a.parent?.remove(a);
    if (flying) stage.scene?.remove(flying.mesh);
    for (const l of leaves) stage.scene?.remove(l.s);
    stage.canvas.style.cursor = '';
    stage.scene?.remove(env.group);
    stage.resize(); // back to the normal field of view
  };
}
