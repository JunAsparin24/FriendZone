// The Arcade's walk-up machines, played right there in the room: the camera moves in and buttons appear
// on screen. The claw machines are full of real plushies (win one and it goes in your house storage);
// skee-ball and air hockey cost coins like the cabinets and pay out tickets.
import * as THREE from 'three';
import { net } from '../net.js';
import { me, fmt, esc } from '../state.js';
import { CATALOG } from '../catalog.js';
import { toon, basic, canvasTexture, TAU } from '../three/materials.js';
import { buildFurniture } from '../three/furniture.js';
import { sfx } from '../sfx.js';
import { listen } from '../games/util.js';
import { ARCADE_COST } from '../games/arcadegames.js';

export const CLAW_COST = 25;
const PRIZES = () => CATALOG.furniture.filter((f) => f.claw);
const pickPrize = () => {
  // commons turn up more often than the rare ones
  const list = PRIZES(), w = (f) => ({ common: 6, rare: 3, epic: 1.6 }[f.rarity] ?? 3);
  let r = Math.random() * list.reduce((a, f) => a + w(f), 0);
  return list.find((f) => (r -= w(f)) < 0) ?? list[0];
};
const wallet = () => `🪙 <b>${fmt(me()?.coins ?? 0)}</b> · 🎟️ <b>${fmt(me()?.tickets ?? 0)}</b>`;

/** Hold-to-press buttons: [{ id, label, cls }] → calls onHold(id, down). */
function buttons(el, list, onHold) {
  el.innerHTML = list.map((b) => `<button class="btn ${b.cls ?? ''}" data-b="${b.id}">${b.label}</button>`).join('');
  el.querySelectorAll('[data-b]').forEach((btn) => {
    const id = btn.dataset.b;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onHold(id, true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => onHold(id, false));
  });
}
/** Ease the camera to a spot, looking at a point. */
function easeCamera(cam, pos, look, dt, state) {
  state.p ??= cam.position.clone();
  state.l ??= look.clone().add(new THREE.Vector3(0, -0.5, -1));
  const k = 1 - Math.exp(-dt * 5);
  state.p.lerp(pos, k);
  state.l.lerp(look, k);
  cam.position.copy(state.p);
  cam.lookAt(state.l);
}

// ======================================================================================
// Claw machine: a glass box of plushies, a moving claw with three prongs, and a prize chute
// ======================================================================================
export function clawMachine(g, x, z, color, anim) {
  const m = new THREE.Group();
  m.position.set(x, 0, z);
  g.add(m);
  const add = (geo, mat, p, r) => { const o = new THREE.Mesh(geo, mat); o.position.set(...p); if (r) o.rotation.set(...r); m.add(o); return o; };
  const body = toon(color), dark = toon('#1a1330'), chrome = toon('#d6dbe6'), trim = toon(new THREE.Color(color).multiplyScalar(0.7).getStyle());
  const glass = toon('#dff4ff', { transparent: true, opacity: 0.13, depthWrite: false });
  // the cabinet: a body with a printed front, a coin door, and the control deck sticking out
  add(new THREE.BoxGeometry(1.7, 1.0, 1.7), body, [0, 0.5, 0]);
  add(new THREE.BoxGeometry(1.74, 0.08, 1.74), trim, [0, 0.04, 0]);
  add(new THREE.BoxGeometry(1.74, 0.06, 1.74), chrome, [0, 1.0, 0]);
  const front = canvasTexture(256, 160, (c) => {
    c.fillStyle = color; c.fillRect(0, 0, 256, 160);
    c.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < 24; i++) { c.beginPath(); c.arc((i * 47) % 256, (i * 71) % 160, 3 + (i % 4), 0, TAU); c.fill(); }
    c.font = '34px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.lineWidth = 6; c.strokeStyle = '#1a1330';
    c.strokeText('PRIZE ZONE', 128, 64); c.fillStyle = '#fff6b0'; c.fillText('PRIZE ZONE', 128, 64);
    c.font = '18px Rubik, sans-serif'; c.fillStyle = '#ffffff'; c.fillText('WIN A PLUSHIE!', 128, 100);
  });
  add(new THREE.PlaneGeometry(1.0, 0.55), new THREE.MeshBasicMaterial({ map: front }), [-0.3, 0.55, 0.851]);
  add(new THREE.BoxGeometry(0.3, 0.42, 0.04), toon('#2a2d3e'), [0.5, 0.3, 0.86]); // coin door
  for (const dx of [-0.06, 0.06]) add(new THREE.BoxGeometry(0.03, 0.1, 0.02), basic('#ff3b4f'), [0.5 + dx, 0.4, 0.885]);
  add(new THREE.BoxGeometry(0.4, 0.26, 0.06), dark, [0.5, 0.75, 0.86]); // the prize door
  add(new THREE.BoxGeometry(0.36, 0.2, 0.02), toon('#dff4ff', { transparent: true, opacity: 0.5 }), [0.5, 0.75, 0.9]);
  add(new THREE.BoxGeometry(1.1, 0.1, 0.42), toon('#2e2266'), [-0.25, 1.02, 0.98], [0.25, 0, 0]); // the control deck
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), chrome, [-0.55, 1.13, 1.0]);
  const knob = add(new THREE.SphereGeometry(0.055, 12, 10), toon('#ff3b4f'), [-0.55, 1.22, 1.0]);
  add(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16), toon('#ffd84d'), [-0.1, 1.1, 0.99], [0.25, 0, 0]); // the big DROP button
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), chrome, [-0.1, 1.08, 0.985], [0.25, 0, 0]);
  // the glass case: four panes in a chrome frame, a printed back wall, and a light strip in the roof
  for (const [w, d, px, pz] of [[1.6, 0.02, 0, 0.8], [1.6, 0.02, 0, -0.8], [0.02, 1.6, 0.8, 0], [0.02, 1.6, -0.8, 0]]) add(new THREE.BoxGeometry(w, 1.5, d), glass, [px, 1.78, pz]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.BoxGeometry(0.07, 1.52, 0.07), chrome, [sx * 0.81, 1.78, sz * 0.81]);
  for (const sz of [-1, 1]) add(new THREE.BoxGeometry(1.66, 0.05, 0.05), chrome, [0, 2.53, sz * 0.81]);
  const backTex = canvasTexture(128, 128, (c) => { c.fillStyle = '#2a1f5e'; c.fillRect(0, 0, 128, 128); c.fillStyle = 'rgba(255,143,199,.35)'; for (let i = 0; i < 16; i++) { c.beginPath(); c.arc((i * 37) % 128, (i * 53) % 128, 6, 0, TAU); c.fill(); } });
  add(new THREE.PlaneGeometry(1.56, 1.46), new THREE.MeshBasicMaterial({ map: backTex }), [0, 1.78, -0.785]);
  add(new THREE.BoxGeometry(1.56, 0.03, 1.56), toon('#ff8fc7'), [0, 1.04, 0]); // the floor of the case
  add(new THREE.BoxGeometry(1.4, 0.03, 1.4), basic('#fff6e0'), [0, 2.5, 0]);
  // the lit canopy on top with the marquee and chasing bulbs
  add(new THREE.BoxGeometry(1.78, 0.42, 1.78), body, [0, 2.76, 0]);
  add(new THREE.BoxGeometry(1.82, 0.05, 1.82), chrome, [0, 2.97, 0]);
  const marquee = canvasTexture(512, 96, (c) => {
    const gr = c.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, '#ff4fd8'); gr.addColorStop(0.5, '#ffd84d'); gr.addColorStop(1, '#39e6ff');
    c.fillStyle = '#1a1330'; c.fillRect(0, 0, 512, 96);
    c.font = '60px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = '#ffffff'; c.shadowBlur = 16; c.fillStyle = gr; c.fillText('CLAW CRAZE', 256, 52);
  });
  add(new THREE.PlaneGeometry(1.5, 0.3), new THREE.MeshBasicMaterial({ map: marquee }), [0, 2.76, 0.895]);
  // the gantry: rails down both sides, a bridge that slides along them, a carriage on the bridge
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.05, 1.55), chrome, [sx * 0.74, 2.45, 0]);
  const bridge = add(new THREE.BoxGeometry(1.5, 0.05, 0.08), chrome, [0, 2.45, 0]);
  const carriage = add(new THREE.BoxGeometry(0.16, 0.08, 0.14), toon('#2a2d3e'), [0, 2.4, 0]);
  const head = new THREE.Group();
  m.add(head);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), toon('#8a8fa8'));
  m.add(cable);
  // the claw: a weighted hub with a cap, and three jointed prongs that close together
  head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.12, 14), chrome));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, TAU, 0, Math.PI / 2), toon(color));
  cap.position.y = 0.06;
  head.add(cap);
  const prongs = [];
  for (let k = 0; k < 3; k++) {
    const piv = new THREE.Group();
    piv.rotation.y = (k / 3) * TAU;
    head.add(piv);
    const arm = new THREE.Group();
    arm.position.set(0.07, -0.05, 0);
    piv.add(arm);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.15, 0.03), chrome);
    upper.position.y = -0.075;
    arm.add(upper);
    const lower = new THREE.Group();
    lower.position.y = -0.15;
    arm.add(lower);
    const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.028), chrome);
    l2.position.set(-0.02, -0.055, 0);
    l2.rotation.z = 0.45;
    lower.add(l2);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), toon('#2a2d3e'));
    tip.position.set(-0.045, -0.11, 0);
    lower.add(tip);
    prongs.push({ arm, lower });
  }
  const bulbs = [];
  for (const y of [2.58, 2.94]) for (let k = 0; k < 12; k++) bulbs.push(add(new THREE.SphereGeometry(0.04, 8, 6), basic('#ffffff').clone(), [-0.84 + (k / 11) * 1.68, y, 0.9]));
  // the prize chute in the front right corner: a clear wall round a hole
  add(new THREE.BoxGeometry(0.44, 0.28, 0.02), toon('#dff4ff', { transparent: true, opacity: 0.35, depthWrite: false }), [0.5, 1.2, 0.27]);
  add(new THREE.BoxGeometry(0.02, 0.28, 0.44), toon('#dff4ff', { transparent: true, opacity: 0.35, depthWrite: false }), [0.27, 1.2, 0.5]);
  add(new THREE.BoxGeometry(0.42, 0.02, 0.42), basic('#05030f'), [0.5, 1.055, 0.5]);
  // the plushies: a deep heap in the case (clear of the chute)
  const prizes = [];
  const spawn = (pos) => {
    const f = pickPrize();
    const obj = buildFurniture(f.id).group;
    obj.scale.setScalar(0.4);
    m.add(obj);
    const p = { id: f.id, name: f.name, obj, x: pos.x, z: pos.z, y: 2.3, rest: 1.06 + (pos.layer ?? 0) * 0.14 + Math.random() * 0.04, vy: 0, held: false };
    obj.rotation.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.5);
    prizes.push(p);
    return p;
  };
  for (let i = 0; i < 18; i++) {
    let px, pz;
    do { px = (Math.random() - 0.5) * 1.3; pz = (Math.random() - 0.5) * 1.3; } while (px > 0.2 && pz > 0.2);
    const p = spawn({ x: px, z: pz, layer: i > 11 ? 1 : 0 });
    p.y = p.rest;
  }
  const M = { group: m, head, prongs, prizes, spawn, open: 1, hx: 0, hz: 0, hy: 2.3, playing: false, sway: new THREE.Vector2(), last: new THREE.Vector2(), knob, steer: null };
  M.setOpen = (o) => { M.open = o; prongs.forEach((p) => { p.arm.rotation.z = 0.15 + o * 0.6; p.lower.rotation.z = -0.1 + o * 0.25; }); };
  M.setOpen(1);
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  M.place = (dt = 0.016) => {
    // the claw swings a little on its cable as the gantry moves, then settles
    const vx = (M.hx - M.last.x) / Math.max(dt, 0.001), vz = (M.hz - M.last.y) / Math.max(dt, 0.001);
    M.last.set(M.hx, M.hz);
    M.sway.x += (-vx * 0.05 - M.sway.x) * Math.min(1, dt * 4);
    M.sway.y += (-vz * 0.05 - M.sway.y) * Math.min(1, dt * 4);
    const len = 2.4 - M.hy;
    head.position.set(M.hx + M.sway.x * len, M.hy, M.hz + M.sway.y * len);
    head.rotation.set(M.sway.y * 0.6, 0, -M.sway.x * 0.6);
    bridge.position.z = M.hz;
    carriage.position.set(M.hx, 2.4, M.hz);
    dir.set(M.hx - head.position.x, 2.4 - M.hy, M.hz - head.position.z);
    cable.scale.y = Math.max(0.01, dir.length());
    cable.position.set((M.hx + head.position.x) / 2, (2.4 + M.hy) / 2, (M.hz + head.position.z) / 2);
    cable.quaternion.setFromUnitVectors(up, dir.normalize());
    // the joystick leans the way you're steering
    knob.position.set(-0.55 + (M.steer?.x ?? 0) * 0.04, 1.22, 1.0 + (M.steer?.z ?? 0) * 0.04);
  };
  anim.push((t, dt) => {
    bulbs.forEach((b, k) => b.material.color.setHSL(((k / 12) + t * (M.playing ? 0.8 : 0.2)) % 1, 0.9, 0.65));
    if (!M.playing) { M.hx = Math.sin(t * 0.5 + x) * 0.45; M.hz = Math.cos(t * 0.4 + z) * 0.4; M.hy = 2.3; }
    // gravity for the plushies (the ones not in the claw)
    for (const p of prizes) {
      if (p.held) continue;
      if (p.y > p.rest) { p.vy -= 9 * dt; p.y = Math.max(p.rest, p.y + p.vy * dt); if (p.y === p.rest) p.vy = 0; }
      p.obj.position.set(p.x, p.y, p.z);
    }
    M.place(dt);
  });
  return M;
}

export function clawGame(M, ui) {
  const st = { phase: 'ready', timer: 0, dir: { x: 0, z: 0 }, target: null, result: null, cam: {}, t: 0 };
  ui.hud.innerHTML = `<div class="ap-top"><b>🕹️ Claw Machine</b><span class="ap-wallet"></span></div>
    <div class="ap-msg">Line the claw up over a plushie, then DROP!</div>
    <div class="ap-pad"></div>`;
  const msg = ui.hud.querySelector('.ap-msg'), pad = ui.hud.querySelector('.ap-pad'), wal = ui.hud.querySelector('.ap-wallet');
  const renderPad = () => {
    wal.innerHTML = wallet();
    if (st.phase === 'aim') buttons(pad, [{ id: 'l', label: '◀' }, { id: 'f', label: '▲' }, { id: 'b', label: '▼' }, { id: 'r', label: '▶' }, { id: 'drop', label: '⬇ DROP', cls: 'primary' }, { id: 'exit', label: '✕', cls: 'ghost' }], hold);
    else if (st.phase === 'ready') buttons(pad, [{ id: 'play', label: `🪙 ${CLAW_COST} · Play`, cls: 'primary' }, { id: 'exit', label: 'Leave', cls: 'ghost' }], hold);
    else pad.innerHTML = '';
  };
  const hold = (id, down) => {
    const v = down ? 1 : 0;
    if (id === 'l') st.dir.x = -v; else if (id === 'r') st.dir.x = v; else if (id === 'f') st.dir.z = -v; else if (id === 'b') st.dir.z = v;
    if (!down) return;
    if (id === 'drop') drop();
    if (id === 'play') start();
    if (id === 'exit') ui.done();
  };
  const start = () => {
    if ((me()?.coins ?? 0) < CLAW_COST) { msg.innerHTML = `<span class="lose">You need 🪙 ${CLAW_COST} to play.</span>`; sfx('error'); return; }
    Object.assign(st, { phase: 'aim', timer: 20, result: null });
    M.playing = true; M.hx = 0; M.hz = 0; M.hy = 2.3; M.setOpen(1);
    msg.textContent = 'Steer with the buttons (or I J K L), then DROP (Enter)!';
    sfx('coin');
    renderPad();
  };
  const nearest = () => M.prizes.filter((p) => !p.held).reduce((b, p) => (!b || Math.hypot(p.x - M.hx, p.z - M.hz) < Math.hypot(b.x - M.hx, b.z - M.hz) ? p : b), null);
  const drop = () => {
    if (st.phase !== 'aim') return;
    st.phase = 'drop';
    st.target = nearest();
    sfx('whoosh');
    renderPad();
  };
  const off = listen({
    claw_result: (m) => { st.result = m; },
    error: (m) => { if (m.for === 'claw_play' && st.phase === 'wait') { st.phase = 'ready'; M.playing = false; msg.innerHTML = `<span class="lose">${esc(m.msg ?? 'Couldn\'t play.')}</span>`; renderPad(); } },
    player: () => { wal.innerHTML = wallet(); },
  });
  const finish = (text, cls) => { msg.innerHTML = `<span class="${cls}">${text}</span>`; st.phase = 'ready'; M.playing = false; renderPad(); };
  renderPad();
  return {
    key(e, down) {
      const k = e.key.toLowerCase();
      // (you can still walk about with WASD, so the claw has its own keys)
      const map = { j: 'l', l: 'r', i: 'f', k: 'b' };
      if (map[k]) hold(map[k], down);
      if (down && !e.repeat && k === 'enter') { if (st.phase === 'aim') drop(); else if (st.phase === 'ready') start(); }
      if (down && k === 'escape') ui.done();
    },
    free: true, // (played standing at the machine: you can walk about, and walking off ends it)
    anchor: { x: M.group.position.x, z: M.group.position.z + 1.7 },
    busy: () => !['ready', 'aim'].includes(st.phase),
    update(dt) {
      M.steer = st.dir;
      const T = st.target;
      if (st.phase === 'aim') {
        M.hx = THREE.MathUtils.clamp(M.hx + st.dir.x * 0.6 * dt, -0.68, 0.68);
        M.hz = THREE.MathUtils.clamp(M.hz + st.dir.z * 0.6 * dt, -0.68, 0.68);
        if ((st.timer -= dt) <= 0) drop();
        msg.textContent = `Move the claw, then DROP! ⏱ ${Math.ceil(st.timer)}`;
      } else if (st.phase === 'drop') {
        const bottom = (T ? T.y : 1.08) + 0.22;
        M.hy = Math.max(bottom, M.hy - 0.9 * dt);
        if (M.hy <= bottom) {
          // reached the heap: pay and ask the machine whether it holds
          const d = T ? Math.hypot(T.x - M.hx, T.z - M.hz) : 1;
          net.send('claw_play', { prize: T?.id ?? PRIZES()[0].id, aim: Math.max(0, 1 - d / 0.13) });
          st.phase = 'wait';
          st.waitT = 0;
        }
      } else if (st.phase === 'wait') {
        M.setOpen(Math.max(0.15, M.open - dt * 2.5));
        if ((st.waitT += dt) > 6) finish('The machine got stuck. Try again!', 'lose');
        if (st.result && M.open <= 0.16) {
          // a grab: whatever it decided, the claw picks the plushie up a little
          if (T && Math.hypot(T.x - M.hx, T.z - M.hz) < 0.22) { T.held = true; st.carry = T; }
          st.phase = 'lift';
        }
      } else if (st.phase === 'lift') {
        M.hy = Math.min(2.3, M.hy + 0.7 * dt);
        const P = st.carry;
        if (P) {
          P.x += (M.hx - P.x) * Math.min(1, dt * 8); P.z += (M.hz - P.z) * Math.min(1, dt * 8);
          P.y = M.hy - 0.28;
          P.obj.position.set(P.x, P.y, P.z);
          if (!st.result.win && M.hy > 1.55) { P.held = false; P.vy = 0.5; P.rest = 1.02 + Math.random() * 0.06; st.carry = null; M.setOpen(0.6); sfx('bonk', { power: 0.3 }); }
        }
        if (M.hy >= 2.3) {
          if (st.carry) st.phase = 'carry';
          else finish(st.result.win ? 'It slipped… but the machine felt bad: check again!' : 'So close! It slipped out of the claw.', 'lose');
        }
      } else if (st.phase === 'carry') {
        const P = st.carry;
        M.hx += (0.5 - M.hx) * Math.min(1, dt * 2.5);
        M.hz += (0.5 - M.hz) * Math.min(1, dt * 2.5);
        P.x = M.hx; P.z = M.hz; P.y = M.hy - 0.28;
        P.obj.position.set(P.x, P.y, P.z);
        if (Math.hypot(M.hx - 0.5, M.hz - 0.5) < 0.02) { M.setOpen(1); P.held = false; P.rest = 0.2; P.vy = 0; st.phase = 'fall'; }
      } else if (st.phase === 'fall') {
        const P = st.carry;
        if (P.y <= 0.25) {
          M.group.remove(P.obj);
          M.prizes.splice(M.prizes.indexOf(P), 1);
          st.carry = null;
          setTimeout(() => { let px, pz; do { px = (Math.random() - 0.5) * 1.3; pz = (Math.random() - 0.5) * 1.3; } while (px > 0.22 && pz > 0.22); M.spawn({ x: px, z: pz }); }, 900);
          sfx('reveal', { rarity: 'epic' });
          const bonus = st.result.item ? ' And a bonus: the <b>Claw Plushie</b> to hold!' : '';
          finish(`🎉 You won the <b>${esc(P.name)}</b>! It's in your house storage (🛋️ Items).${bonus}`, 'win');
        }
      }
    },
    stop() { off(); M.playing = false; if (st.carry) { st.carry.held = false; st.carry = null; } },
  };
}

// ======================================================================================
// Skee-ball: nine balls up the lane into the rings
// ======================================================================================
export function skeeLane(g, x, z, anim) {
  const lane = new THREE.Group();
  lane.position.set(x, 0, z);
  g.add(lane);
  const add = (geo, mat, p, r) => { const o = new THREE.Mesh(geo, mat); o.position.set(...p); if (r) o.rotation.set(...r); lane.add(o); return o; };
  const body = toon('#4b2aa8'), dark = toon('#1a1330'), chrome = toon('#d6dbe6');
  const glass = toon('#dff4ff', { transparent: true, opacity: 0.16, depthWrite: false });
  // the cabinet and the long wooden lane, rising gently to the hump
  add(new THREE.BoxGeometry(1.4, 0.8, 3.2), body, [0, 0.4, 0]);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.05, 3.1), basic('#ff4fd8'), [sx * 0.7, 0.55, 0.05]);
  const wood = canvasTexture(64, 256, (c) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = ['#d8b07a', '#cfa36c', '#dcb986', '#c99a62'][i % 4]; c.fillRect(i * 8, 0, 8, 256); }
    c.fillStyle = 'rgba(90,50,20,.25)'; for (let i = 0; i < 8; i++) c.fillRect(i * 8, 0, 1, 256);
  });
  add(new THREE.BoxGeometry(1.1, 0.04, 2.5), new THREE.MeshToonMaterial({ map: wood }), [0, 0.86, 0.35], [-0.1, 0, 0]);
  add(new THREE.CylinderGeometry(0.18, 0.18, 1.1, 18, 1, false, 0, Math.PI), toon('#c99a62'), [0, 0.98, -0.95], [0, 0, Math.PI / 2]); // the hump
  // side walls with glass on top, so balls stay in
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.12, 0.35, 2.8), body, [sx * 0.64, 1.0, 0.25]);
    add(new THREE.BoxGeometry(0.03, 0.55, 2.6), glass, [sx * 0.64, 1.45, 0.2]);
    add(new THREE.BoxGeometry(0.05, 0.05, 2.6), chrome, [sx * 0.64, 1.73, 0.2]);
  }
  // the target: a tilted board of cups in rings, with the 100s up in the corners and a net cage round it
  const board = new THREE.Group();
  board.position.set(0, 0, -1.24);
  lane.add(board);
  const bAdd = (geo, mat, p, r) => { const o = new THREE.Mesh(geo, mat); o.position.set(...p); if (r) o.rotation.set(...r); board.add(o); return o; };
  bAdd(new THREE.BoxGeometry(1.4, 1.9, 0.5), dark, [0, 1.35, -0.27]);
  const cup = (r, y, c, px = 0) => {
    bAdd(new THREE.TorusGeometry(r, 0.04, 8, 32), basic(c), [px, y, 0.01]);
    bAdd(new THREE.CylinderGeometry(r - 0.02, r - 0.02, 0.06, 28, 1, true), toon(c, { side: THREE.DoubleSide }), [px, y, -0.02], [Math.PI / 2, 0, 0]);
  };
  cup(0.5, 1.25, '#ffd84d'); cup(0.32, 1.25, '#ff4fd8'); cup(0.15, 1.25, '#39e6ff');
  bAdd(new THREE.CircleGeometry(0.13, 20), basic('#05030f'), [0, 1.25, -0.04]);
  for (const s of [-1, 1]) { cup(0.1, 1.72, '#6ee7a0', s * 0.42); bAdd(new THREE.CircleGeometry(0.085, 16), basic('#05030f'), [s * 0.42, 1.72, -0.04]); }
  // point values painted on the board
  const labels = canvasTexture(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256); c.font = 'bold 24px Rubik, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffffff';
    c.fillText('20', 128, 240); c.fillText('30', 128, 196); c.fillText('50', 128, 160); c.fillText('100', 52, 38); c.fillText('100', 204, 38);
  });
  bAdd(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: labels, transparent: true, depthWrite: false }), [0, 1.35, 0.03]);
  const netMat = new THREE.MeshBasicMaterial({ color: '#c0c6d4', wireframe: true, transparent: true, opacity: 0.35 });
  bAdd(new THREE.PlaneGeometry(1.4, 1.2, 10, 8), netMat, [0, 2.1, 0.55], [-1.2, 0, 0]); // the net over the top
  for (const sx of [-1, 1]) bAdd(new THREE.PlaneGeometry(1.0, 1.6, 6, 10), netMat, [sx * 0.7, 1.5, 0.3], [0, Math.PI / 2, 0]);
  // the marquee with the score screen
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  bAdd(new THREE.BoxGeometry(1.42, 0.5, 0.2), body, [0, 2.55, -0.2]);
  bAdd(new THREE.PlaneGeometry(1.2, 0.42), new THREE.MeshBasicMaterial({ map: tex }), [0, 2.55, -0.09]);
  const bulbs = [];
  for (let k = 0; k < 9; k++) bulbs.push(bAdd(new THREE.SphereGeometry(0.035, 8, 6), basic('#ffffff').clone(), [-0.64 + k * 0.16, 2.84, -0.1]));
  const show = (top, bottom) => {
    const x2 = c.getContext('2d');
    x2.fillStyle = '#05030f'; x2.fillRect(0, 0, 256, 96);
    x2.font = '40px "Luckiest Guy", Rubik, sans-serif'; x2.textAlign = 'center'; x2.fillStyle = '#ffd84d'; x2.fillText(top, 128, 46);
    x2.font = '22px Rubik, sans-serif'; x2.fillStyle = '#b9a0ff'; x2.fillText(bottom, 128, 80);
    tex.needsUpdate = true;
  };
  show('SKEE-BALL', 'insert coin');
  // the ball tray at the front, with the balls waiting in it
  add(new THREE.BoxGeometry(1.1, 0.12, 0.3), dark, [0, 0.86, 1.48]);
  const tray = [];
  for (let k = 0; k < 9; k++) tray.push(add(new THREE.SphereGeometry(0.075, 12, 10), toon('#f4efe6'), [-0.44 + k * 0.11, 0.97, 1.48]));
  add(new THREE.BoxGeometry(0.22, 0.12, 0.04), toon('#2a2d3e'), [0.45, 0.6, 1.61]); // ticket slot
  add(new THREE.BoxGeometry(0.14, 0.02, 0.02), basic('#ff3b4f'), [0.45, 0.62, 1.635]);
  const ball = add(new THREE.SphereGeometry(0.1, 14, 10), toon('#ffffff'), [0, 0.95, 1]);
  const L = { group: lane, ball, show, playing: false, setBalls: (n) => tray.forEach((b, k) => { b.visible = k < n; }) };
  anim.push((t) => {
    bulbs.forEach((b, k) => b.material.color.setHSL(((k / 9) + t * (L.playing ? 0.7 : 0.15)) % 1, 0.9, 0.65));
    if (L.playing) return;
    const f = (t * 0.6 + x) % 1;
    ball.position.set(Math.sin(f * 9) * 0.1, 0.95 + f * 0.35 + Math.sin(f * Math.PI) * 0.3, 1.2 - f * 2.6);
  });
  return L;
}
const SKEE_HOLES = [[0, 1.25, 0.15, 50], [0, 1.25, 0.32, 30], [0, 1.25, 0.5, 20], [-0.42, 1.72, 0.1, 100], [0.42, 1.72, 0.1, 100]];

export function skeeGame(L, ui) {
  const st = { phase: 'ready', aim: 0, power: 0, charging: false, dir: 0, balls: 9, score: 0, cam: {}, t: 0, waiting: false };
  ui.hud.innerHTML = `<div class="ap-top"><b>🎳 Skee-Ball</b><span class="ap-wallet"></span></div><div class="ap-msg"></div><div class="ap-meter hidden"><i></i></div><div class="ap-pad"></div>`;
  const msg = ui.hud.querySelector('.ap-msg'), pad = ui.hud.querySelector('.ap-pad'), meter = ui.hud.querySelector('.ap-meter'), wal = ui.hud.querySelector('.ap-wallet');
  const hold = (id, down) => {
    if (id === 'l') st.dir = down ? -1 : st.dir === -1 ? 0 : st.dir;
    if (id === 'r') st.dir = down ? 1 : st.dir === 1 ? 0 : st.dir;
    if (id === 'roll') { if (down && st.phase === 'aim') { st.charging = true; st.chargeT = 0; } else if (!down && st.charging) roll(); }
    if (!down) return;
    if (id === 'play') pay();
    if (id === 'exit') ui.done();
  };
  const renderPad = () => {
    wal.innerHTML = wallet();
    if (st.phase === 'aim' || st.phase === 'rolling') buttons(pad, [{ id: 'l', label: '◀' }, { id: 'roll', label: '🎳 Hold to roll', cls: 'primary' }, { id: 'r', label: '▶' }, { id: 'exit', label: '✕', cls: 'ghost' }], hold);
    else if (st.phase === 'ready') buttons(pad, [{ id: 'play', label: `🪙 ${ARCADE_COST} · 9 balls`, cls: 'primary' }, { id: 'exit', label: 'Leave', cls: 'ghost' }], hold);
    else pad.innerHTML = '';
    meter.classList.toggle('hidden', st.phase !== 'aim');
  };
  const pay = () => {
    if (st.waiting) return;
    if ((me()?.coins ?? 0) < ARCADE_COST) { msg.innerHTML = `<span class="lose">You need 🪙 ${ARCADE_COST} to play.</span>`; sfx('error'); return; }
    st.waiting = true;
    net.send('arcade_play', { g: 'skeeball' });
  };
  const begin = () => {
    Object.assign(st, { phase: 'aim', balls: 9, score: 0, aim: 0, waiting: false });
    L.playing = true;
    L.show('0', '9 balls');
    L.setBalls(9);
    msg.textContent = 'Aim with ◀ ▶ (or A/D). Hold ROLL (Space) to build power, let go to roll!';
    sfx('coin');
    renderPad();
  };
  const roll = () => {
    st.charging = false;
    if (st.phase !== 'aim') return;
    st.phase = 'rolling';
    st.rollT = 0;
    st.shot = { power: st.power, aim: st.aim };
    sfx('whoosh');
  };
  const off = listen({
    arcade_go: (m) => { if (m.g === 'skeeball' && st.waiting) begin(); },
    error: (m) => { if (m.for === 'arcade_play' && st.waiting) { st.waiting = false; msg.innerHTML = `<span class="lose">${esc(m.msg ?? '')}</span>`; } },
    arcade_result: (m) => { if (m.g === 'skeeball') { msg.innerHTML = `<span class="win">Final score ${fmt(m.s)}${m.best ? ' · New best!' : ''} · +${fmt(m.tickets ?? 0)} 🎟️</span>`; sfx('coins', { n: 4 }); renderPad(); } },
    player: () => { wal.innerHTML = wallet(); },
  });
  msg.textContent = 'Roll nine balls up the lane into the rings. The little holes up top are worth 100!';
  renderPad();
  const ballAt = (u, aim, power) => {
    // up the lane (u 0..1), then a hop off the ramp towards the board
    const z0 = 1.3, z1 = -0.95;
    if (u < 0.6) { const k = u / 0.6; return [aim * (1 - k * 0.2), 0.92 + k * 0.28, z0 + (z1 - z0) * k]; }
    const k = (u - 0.6) / 0.4, ty = 0.95 + power * 0.85, tx = aim * 0.8;
    return [aim * 0.8 + (tx - aim * 0.8) * k, 1.2 + (ty - 1.2) * k + Math.sin(k * Math.PI) * 0.25, z1 + (-1.2 - z1) * k];
  };
  return {
    key(e, down) {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') hold('l', down);
      if (k === 'd' || k === 'arrowright') hold('r', down);
      if (k === ' ' && !e.repeat) { if (st.phase === 'ready' && down) pay(); else hold('roll', down); }
      if (down && k === 'escape') ui.done();
    },
    update(dt, t, cam) {
      const w = L.group.position;
      easeCamera(cam, new THREE.Vector3(w.x, 2.25, w.z + 4.0), new THREE.Vector3(w.x, 1.3, w.z - 1.3), dt, st.cam);
      if (st.phase === 'aim') {
        st.aim = THREE.MathUtils.clamp(st.aim + st.dir * 0.8 * dt, -0.5, 0.5);
        if (st.charging) { st.chargeT += dt; st.power = 0.5 - 0.5 * Math.cos(st.chargeT * 3.2); }
        meter.querySelector('i').style.width = `${(st.charging ? st.power : 0) * 100}%`;
        L.ball.position.set(st.aim, 0.92, 1.35);
      } else if (st.phase === 'rolling') {
        st.rollT += dt * (0.9 + st.shot.power * 0.9);
        const u = Math.min(1, st.rollT);
        // too gentle and it rolls back down
        if (st.shot.power < 0.12 && u > 0.45) {
          L.ball.position.set(st.shot.aim, 0.92, 0);
          next(0, 'Too soft! It rolled back.');
          return;
        }
        L.ball.position.set(...ballAt(u, st.shot.aim, st.shot.power));
        if (u >= 1) {
          const [bx, by] = ballAt(1, st.shot.aim, st.shot.power);
          const wob = (Math.random() - 0.5) * 0.08;
          const hit = SKEE_HOLES.filter(([hx, hy, r]) => Math.hypot(bx + wob - hx, by + wob - hy) < r).sort((a, b) => b[3] - a[3])[0];
          const pts = hit ? hit[3] : by > 0.95 && by < 1.85 && Math.abs(bx) < 0.6 ? 10 : 0;
          next(pts, pts >= 100 ? '💯 In the top hole!' : pts ? `+${pts}` : 'Missed the rings!');
        }
      }
    },
    stop() { off(); L.playing = false; L.show('SKEE-BALL', 'insert coin'); L.setBalls(9); },
  };
  function next(pts, text) {
    st.score += pts;
    st.balls -= 1;
    sfx(pts >= 50 ? 'coin' : pts ? 'pop' : 'bonk', { power: 0.3 });
    L.show(String(st.score), `${st.balls} ball${st.balls === 1 ? '' : 's'} left`);
    L.setBalls(st.balls);
    msg.textContent = text;
    if (st.balls <= 0) {
      st.phase = 'ready';
      L.playing = false;
      net.send('arcade_score', { g: 'skeeball', s: st.score });
      msg.textContent = `Final score: ${st.score}!`;
      renderPad();
    } else st.phase = 'aim';
    st.power = 0;
  }
}

// ======================================================================================
// Air hockey against the machine: first to five goals
// ======================================================================================
// Air hockey: two players, one at each end
// ======================================================================================
export function hockeyTable(g, x, z, anim, index) {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  g.add(t);
  const add = (geo, mat, p, r) => { const o = new THREE.Mesh(geo, mat); o.position.set(...p); if (r) o.rotation.set(...r); t.add(o); return o; };
  const body = toon('#2a1f5e'), rail = toon('#7c4dff'), chrome = toon('#d6dbe6');
  // the cabinet on four legs, with neon strips down the sides
  add(new THREE.BoxGeometry(2.0, 0.42, 3.4), body, [0, 0.69, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.14, 0.5, 0.14), toon('#1a1330'), [sx * 0.85, 0.25, sz * 1.5]);
  add(new THREE.BoxGeometry(1.7, 0.06, 3.0), toon('#1a1330'), [0, 0.18, 0]); // the shelf between the legs
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.05, 3.3), basic('#39e6ff'), [sx * 1.0, 0.62, 0]);
  // the playing surface: white with rows of tiny air holes and the markings
  const surf = canvasTexture(256, 448, (c) => {
    c.fillStyle = '#f2f8ff'; c.fillRect(0, 0, 256, 448);
    c.fillStyle = 'rgba(80,110,160,.35)';
    for (let yy = 10; yy < 448; yy += 14) for (let xx = 10; xx < 256; xx += 14) c.fillRect(xx, yy, 2, 2);
    c.strokeStyle = '#ff4fd8'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 224); c.lineTo(256, 224); c.stroke();
    c.beginPath(); c.arc(128, 224, 38, 0, TAU); c.stroke();
    c.strokeStyle = '#39c6ff'; c.lineWidth = 4;
    for (const [yy, a0, a1] of [[0, 0, Math.PI], [448, Math.PI, TAU]]) { c.beginPath(); c.arc(128, yy, 58, a0, a1); c.stroke(); }
    c.strokeStyle = 'rgba(57,198,255,.5)'; c.lineWidth = 3; for (const yy of [112, 336]) { c.beginPath(); c.moveTo(0, yy); c.lineTo(256, yy); c.stroke(); }
  });
  add(new THREE.PlaneGeometry(1.8, 3.2), new THREE.MeshToonMaterial({ map: surf }), [0, 0.905, 0], [-Math.PI / 2, 0, 0]);
  // rails round the edge, rounded at the corners, with a goal slot (lit in each side's colour) at each end
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.1, 0.12, 3.2), rail, [s * 0.95, 0.96, 0]);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.62, 0.12, 0.1), rail, [sx * 0.64, 0.96, s * 1.65]);
    for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), rail, [sx * 0.95, 0.96, s * 1.65]);
    add(new THREE.BoxGeometry(0.6, 0.06, 0.1), basic('#05030f'), [0, 0.93, s * 1.65]);
    add(new THREE.BoxGeometry(0.62, 0.025, 0.03), basic(s > 0 ? '#39c6ff' : '#ffd84d'), [0, 1.03, s * 1.7]);
  }
  const puck = add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 20), toon('#ff3b5c'), [0, 0.925, 0]);
  const mallet = (col, zz) => {
    const mm = add(new THREE.CylinderGeometry(0.14, 0.15, 0.06, 20), toon(col), [0, 0.94, zz]);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 12), toon('#ffffff'));
    knob.position.y = 0.08;
    mm.add(knob);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), toon(col));
    top.position.y = 0.15;
    mm.add(top);
    return mm;
  };
  const mallets = [mallet('#39c6ff', 1.3), mallet('#ffd84d', -1.3)]; // side 0 at the +z end, side 1 at the -z end
  // an overhead scoreboard on a post
  add(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), chrome, [1.15, 1.1, 0]);
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 96;
  const scTex = new THREE.CanvasTexture(sc); scTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Group();
  board.position.set(1.15, 2.4, 0);
  board.rotation.y = -Math.PI / 2;
  t.add(board);
  board.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.08), toon('#1a1330')));
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.38), new THREE.MeshBasicMaterial({ map: scTex })); f.position.z = s * 0.045; if (s < 0) f.rotation.y = Math.PI; board.add(f); }
  const showScore = (a, b, label = 'AIR HOCKEY') => {
    const c = sc.getContext('2d');
    c.fillStyle = '#05030f'; c.fillRect(0, 0, 256, 96);
    c.font = '18px Rubik, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#b9a0ff'; c.fillText(label, 128, 22);
    c.font = '50px "Luckiest Guy", Rubik, sans-serif';
    c.fillStyle = '#39c6ff'; c.fillText(String(a), 70, 78); c.fillStyle = '#ffffff'; c.fillText('–', 128, 76); c.fillStyle = '#ffd84d'; c.fillText(String(b), 186, 78);
    scTex.needsUpdate = true;
  };
  showScore(0, 0);
  const H = { group: t, puck, mallets, index, local: false, live: false, showScore, target: { puck: null, m: [null, null] } };
  // other people's games: follow the puck and mallets they send
  H.off = listen({
    hockey_m: (m) => { if (m.table === index && !H.local) H.target.m[m.side] = m; },
    hockey_p: (m) => { if (m.table === index && !H.local) H.target.puck = m; },
    hockey: (m) => { if (m.table === index) { H.live = m.live; showScore(m.s[0], m.s[1], m.live ? 'AIR HOCKEY' : Object.keys(m.sides).length ? 'WAITING…' : 'AIR HOCKEY'); } },
  });
  anim.push((tt, dt) => {
    if (H.local) return;
    if (H.live) {
      const k = Math.min(1, dt * 15);
      const p = H.target.puck;
      if (p) { puck.position.x += (p.x - puck.position.x) * k; puck.position.z += (p.z - puck.position.z) * k; }
      H.target.m.forEach((q, i) => { if (q) { mallets[i].position.x += (q.x - mallets[i].position.x) * k; mallets[i].position.z += (q.z - mallets[i].position.z) * k; } });
    } else {
      // idle: the puck drifts about
      puck.position.x = Math.sin(tt * 1.3 + x) * 0.6; puck.position.z = Math.sin(tt * 0.9) * 1.2;
      mallets[0].position.set(puck.position.x * 0.5, 0.94, 1.3); mallets[1].position.set(puck.position.x * 0.5, 0.94, -1.3);
    }
  });
  return H;
}

/** Air hockey against whoever's at the other end. `side` 0 is the +z end, 1 the -z end. */
export function hockeyGame(H, ui, stage, side) {
  const R_P = 0.1, R_M = 0.145, XW = 0.9 - R_P, ZW = 1.6, s = side ? -1 : 1, other = 1 - side;
  const st = { phase: 'join', sides: {}, sc: [0, 0], p: { x: 0, z: 0, vx: 0, vz: 0 }, m: { x: 0, z: 1.3 * s, vx: 0, vz: 0 }, o: { x: 0, z: -1.3 * s, vx: 0, vz: 0, t: 0 }, keys: new Set(), cam: {}, pause: 0, sendT: 0 };
  ui.hud.innerHTML = `<div class="ap-top"><b>🏒 Air Hockey</b><span class="ap-score"></span><span class="ap-wallet"></span></div><div class="ap-msg"></div><div class="ap-pad"></div>`;
  const msg = ui.hud.querySelector('.ap-msg'), pad = ui.hud.querySelector('.ap-pad'), scoreEl = ui.hud.querySelector('.ap-score'), wal = ui.hud.querySelector('.ap-wallet');
  const host = side === 0; // (side 0's game runs the puck)
  H.local = true;
  const render = () => {
    wal.innerHTML = wallet();
    scoreEl.innerHTML = `You <b>${st.sc[side]}</b> – <b>${st.sc[other]}</b> Them`;
    const list = st.phase === 'over' && Object.keys(st.sides).length === 2 ? [{ id: 'again', label: `🪙 ${ARCADE_COST} · Rematch`, cls: 'primary' }] : [];
    buttons(pad, [...list, { id: 'exit', label: st.phase === 'play' ? '✕ Quit' : 'Leave', cls: 'ghost' }], (id, d) => {
      if (!d) return;
      if (id === 'again') { net.send('hockey_join', { table: H.index, side }); msg.textContent = 'Waiting for them to press Rematch too…'; }
      else ui.done();
    });
  };
  const serve = (toward) => { Object.assign(st.p, { x: 0, z: toward * 0.3, vx: (Math.random() - 0.5) * 0.6, vz: 0 }); st.pause = 0.9; };
  net.send('hockey_join', { table: H.index, side });
  msg.textContent = 'Waiting for someone at the other end of the table…';
  render();
  // the pointer moves your mallet: where it points on the table
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.94), hitP = new THREE.Vector3();
  let aim = null;
  const onMove = (e) => {
    if (st.phase !== 'play') return;
    const r = stage.canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera);
    if (ray.ray.intersectPlane(plane, hitP)) aim = H.group.worldToLocal(hitP.clone());
  };
  stage.canvas.addEventListener('pointermove', onMove);
  stage.canvas.addEventListener('pointerdown', onMove);
  const off = listen({
    hockey: (m) => {
      if (m.table !== H.index) return;
      st.sides = m.sides;
      const was = st.phase;
      st.sc = m.s;
      const mine = m.sides[String(side)] === me()?.key || m.sides[String(side)] === undefined;
      if (m.live && st.phase !== 'play') { st.phase = 'play'; serve(-1); msg.textContent = 'Game on! First to 5. Move your mallet with the mouse (or drag, or WASD).'; sfx('whistle'); }
      else if (!m.live && was === 'play') {
        st.phase = 'over';
        const full = Object.keys(m.sides).length === 2;
        msg.textContent = st.sc[side] >= m.to ? `🏆 You win ${st.sc[side]}–${st.sc[other]}!` : st.sc[other] >= m.to ? `They win ${st.sc[other]}–${st.sc[side]}. Rematch?` : full ? 'Game over.' : 'Your opponent left the table.';

      } else if (!m.live && Object.keys(m.sides).length < 2) { st.phase = 'join'; msg.textContent = 'Waiting for someone at the other end of the table…'; }
      if (m.goal != null) { sfx(m.goal === side ? 'coin' : 'lose'); msg.textContent = m.goal === side ? 'GOAL! ⚡' : 'They scored…'; if (host && m.live) serve(m.goal === 0 ? -1 : 1); }
      void mine;
      H.showScore(st.sc[0], st.sc[1]);
      render();
    },
    hockey_m: (m) => {
      if (m.table !== H.index || m.side !== other) return;
      const now = performance.now(), dt = Math.max(0.016, (now - st.o.t) / 1000);
      st.o.vx = (m.x - st.o.x) / dt; st.o.vz = (m.z - st.o.z) / dt;
      st.o.x = m.x; st.o.z = m.z; st.o.t = now;
    },
    hockey_p: (m) => { if (m.table === H.index && !host) Object.assign(st.p, { x: m.x, z: m.z, vx: m.vx, vz: m.vz }); },
    error: (m) => { if (m.for === 'hockey_join') { msg.innerHTML = `<span class="lose">${esc(m.msg ?? '')}</span>`; setTimeout(() => ui.done(), 1800); } },
    arcade_result: (m) => { if (m.g === 'hockey') { msg.textContent += ` +${fmt(m.tickets ?? 0)} 🎟️`; sfx('coins', { n: 4 }); } },
    player: () => { wal.innerHTML = wallet(); },
  });
  const hitMallet = (m) => {
    const p = st.p, dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
    if (d >= R_P + R_M || d === 0) return;
    const nx = dx / d, nz = dz / d;
    p.x = m.x + nx * (R_P + R_M); p.z = m.z + nz * (R_P + R_M);
    const rv = (p.vx - m.vx) * nx + (p.vz - m.vz) * nz;
    if (rv < 0) { p.vx -= 1.9 * rv * nx; p.vz -= 1.9 * rv * nz; }
    p.vx += m.vx * 0.3; p.vz += m.vz * 0.3;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 6.5) { p.vx *= 6.5 / sp; p.vz *= 6.5 / sp; }
    sfx('bonk', { power: Math.min(1, sp / 6) * 0.4 });
  };
  const moveMallet = (m, tx, tz, dt) => {
    const zLo = side ? -ZW + R_M : 0.12 + R_M, zHi = side ? -0.12 - R_M : ZW - R_M;
    tx = THREE.MathUtils.clamp(tx, -0.9 + R_M, 0.9 - R_M); tz = THREE.MathUtils.clamp(tz, zLo, zHi);
    let dx = tx - m.x, dz = tz - m.z;
    const d = Math.hypot(dx, dz), step = 7 * dt;
    if (d > step) { dx *= step / d; dz *= step / d; }
    m.vx = dx / dt; m.vz = dz / dt;
    m.x += dx; m.z += dz;
  };
  return {
    key(e, down) {
      const k = e.key.toLowerCase();
      if (down) st.keys.add(k); else st.keys.delete(k);
      if (down && k === 'escape') ui.done();
    },
    update(dt, t, cam) {
      const w = H.group.position;
      easeCamera(cam, new THREE.Vector3(w.x, 2.9, w.z + 2.7 * s), new THREE.Vector3(w.x, 0.9, w.z + 0.1 * s), dt, st.cam);
      dt = Math.min(dt, 1 / 30);
      // your mallet: the pointer, or WASD (turned round if you're at the far end)
      const kx = ((st.keys.has('d') || st.keys.has('arrowright') ? 1 : 0) - (st.keys.has('a') || st.keys.has('arrowleft') ? 1 : 0)) * s;
      const kz = ((st.keys.has('s') || st.keys.has('arrowdown') ? 1 : 0) - (st.keys.has('w') || st.keys.has('arrowup') ? 1 : 0)) * s;
      if (kx || kz) aim = { x: st.m.x + kx * 0.5, z: st.m.z + kz * 0.5 };
      if (st.phase === 'play' && aim) moveMallet(st.m, aim.x, aim.z, dt);
      if ((st.sendT += dt) > 0.05 && st.phase === 'play') {
        st.sendT = 0;
        net.send('hockey_mallet', { table: H.index, x: st.m.x, z: st.m.z });
        if (host) net.send('hockey_puck', { table: H.index, x: st.p.x, z: st.p.z, vx: st.p.vx, vz: st.p.vz });
      }
      const p = st.p;
      if (st.phase === 'play' && host) {
        // the puck (run on side 0's game)
        if (st.pause > 0) st.pause -= dt;
        else {
          p.x += p.vx * dt; p.z += p.vz * dt;
          p.vx *= 1 - 0.22 * dt; p.vz *= 1 - 0.22 * dt;
          if (Math.abs(p.x) > XW) { p.x = Math.sign(p.x) * XW; p.vx *= -0.92; sfx('bonk', { power: 0.15 }); }
          if (Math.abs(p.z) > ZW - R_P) {
            if (Math.abs(p.x) < 0.27) {
              // into the -z goal: side 0 scores; into the +z goal: side 1 scores
              net.send('hockey_goal', { table: H.index, scorer: p.z < 0 ? 0 : 1 });
              Object.assign(p, { x: 0, z: 0, vx: 0, vz: 0 });
              st.pause = 5; // (until the server's goal message serves it)
            } else { p.z = Math.sign(p.z) * (ZW - R_P); p.vz *= -0.92; sfx('bonk', { power: 0.15 }); }
          }
          hitMallet(st.m);
          hitMallet(st.o);
        }
      } else if (st.phase === 'play') {
        // (the other end: the puck follows what side 0 sends, carried on between updates)
        p.x += p.vx * dt; p.z += p.vz * dt;
      }
      H.puck.position.set(p.x, 0.925, p.z);
      H.mallets[side].position.set(st.m.x, 0.94, st.m.z);
      H.mallets[other].position.x += (st.o.x - H.mallets[other].position.x) * Math.min(1, dt * 15);
      H.mallets[other].position.z += (st.o.z - H.mallets[other].position.z) * Math.min(1, dt * 15);
    },
    stop() {
      off();
      H.local = false;
      net.send('hockey_leave', { table: H.index });
      stage.canvas.removeEventListener('pointermove', onMove);
      stage.canvas.removeEventListener('pointerdown', onMove);
    },
  };
}
