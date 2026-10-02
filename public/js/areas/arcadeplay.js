// The Arcade's walk-up machines, played right there in the room: the camera moves in and buttons appear
// on screen. The claw machines are full of real plushies (win one and it goes in your house storage);
// skee-ball and air hockey cost coins like the cabinets and pay out tickets.
import * as THREE from 'three';
import { net } from '../net.js';
import { me, fmt, esc } from '../state.js';
import { CATALOG } from '../catalog.js';
import { toon, basic, TAU } from '../three/materials.js';
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
  const body = toon(color), chrome = toon('#c0c6d4');
  add(new THREE.BoxGeometry(1.7, 1.0, 1.7), body, [0, 0.5, 0]);
  add(new THREE.BoxGeometry(1.6, 0.04, 1.6), toon('#2a1f5e'), [0, 1.0, 0]); // the floor inside
  add(new THREE.BoxGeometry(1.6, 1.5, 1.6), toon('#dff4ff', { transparent: true, opacity: 0.16, depthWrite: false }), [0, 1.75, 0]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.BoxGeometry(0.08, 1.5, 0.08), body, [sx * 0.8, 1.75, sz * 0.8]);
  add(new THREE.BoxGeometry(1.75, 0.35, 1.75), body, [0, 2.67, 0]);
  add(new THREE.BoxGeometry(1.4, 0.24, 0.05), basic('#ffd84d'), [0, 2.67, 0.88]);
  // the prize chute in the front right corner: a glass wall round a hole, and a flap below
  add(new THREE.BoxGeometry(0.42, 0.3, 0.02), toon('#dff4ff', { transparent: true, opacity: 0.35 }), [0.5, 1.17, 0.29]);
  add(new THREE.BoxGeometry(0.02, 0.3, 0.42), toon('#dff4ff', { transparent: true, opacity: 0.35 }), [0.29, 1.17, 0.5]);
  add(new THREE.BoxGeometry(0.4, 0.02, 0.4), basic('#000000'), [0.5, 1.025, 0.5]);
  add(new THREE.BoxGeometry(0.44, 0.3, 0.04), toon('#1a1330'), [0.5, 0.42, 0.86]);
  add(new THREE.BoxGeometry(0.6, 0.12, 0.4), toon('#2e2266'), [-0.35, 1.05, 0.95], [0.3, 0, 0]);
  add(new THREE.SphereGeometry(0.06, 10, 8), toon('#ff5d73'), [-0.5, 1.2, 0.98]);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), toon('#6ee7a0'), [-0.2, 1.13, 0.98], [0.3, 0, 0]);
  // the gantry and the claw
  const rail = add(new THREE.BoxGeometry(1.5, 0.04, 0.06), chrome, [0, 2.45, 0]);
  const head = new THREE.Group();
  m.add(head);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 6), chrome);
  m.add(cable);
  head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 12), chrome));
  const prongs = [];
  for (let k = 0; k < 3; k++) {
    const piv = new THREE.Group();
    piv.rotation.y = (k / 3) * TAU;
    head.add(piv);
    const arm = new THREE.Group();
    arm.position.set(0.06, -0.04, 0);
    piv.add(arm);
    const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.025), chrome);
    a1.position.y = -0.08;
    arm.add(a1);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.025), chrome);
    tip.position.set(-0.02, -0.18, 0);
    tip.rotation.z = 0.6;
    arm.add(tip);
    prongs.push(arm);
  }
  const bulbs = [];
  for (let k = 0; k < 10; k++) bulbs.push(add(new THREE.SphereGeometry(0.045, 8, 6), basic('#ffffff'), [-0.8 + (k / 9) * 1.6, 2.86, 0.88]));
  // the plushies: a heap in the glass box (clear of the chute)
  const prizes = [];
  const spawn = (pos) => {
    const f = pickPrize();
    const obj = buildFurniture(f.id).group;
    obj.scale.setScalar(0.42);
    m.add(obj);
    const p = { id: f.id, name: f.name, obj, x: pos.x, z: pos.z, y: 2.3, rest: 1.02 + Math.random() * 0.06, vy: 0, held: false };
    obj.rotation.y = (Math.random() - 0.5) * 1.2;
    obj.rotation.z = (Math.random() - 0.5) * 0.4;
    prizes.push(p);
    return p;
  };
  for (let i = 0; i < 13; i++) {
    let px, pz;
    do { px = (Math.random() - 0.5) * 1.3; pz = (Math.random() - 0.5) * 1.3; } while (px > 0.22 && pz > 0.22);
    const p = spawn({ x: px, z: pz });
    p.y = p.rest;
  }
  const M = { group: m, head, prongs, prizes, spawn, open: 1, hx: 0, hz: 0, hy: 2.25, playing: false };
  M.setOpen = (o) => { M.open = o; prongs.forEach((a) => { a.rotation.z = 0.25 + o * 0.55; }); };
  M.setOpen(1);
  M.place = () => {
    head.position.set(M.hx, M.hy, M.hz);
    rail.position.z = M.hz;
    cable.position.set(M.hx, (2.45 + M.hy) / 2, M.hz);
    cable.scale.y = Math.max(0.01, 2.45 - M.hy);
  };
  anim.push((t, dt) => {
    bulbs.forEach((b, k) => b.material.color.setHSL(((k / 10) + t * (M.playing ? 0.6 : 0.15)) % 1, 0.9, 0.65));
    if (!M.playing) { M.hx = Math.sin(t * 0.5 + x) * 0.45; M.hz = Math.cos(t * 0.4 + z) * 0.4; M.hy = 2.25; }
    // gravity for the plushies (the ones not in the claw)
    for (const p of prizes) {
      if (p.held) continue;
      if (p.y > p.rest) { p.vy -= 9 * dt; p.y = Math.max(p.rest, p.y + p.vy * dt); if (p.y === p.rest) p.vy = 0; }
      p.obj.position.set(p.x, p.y, p.z);
    }
    M.place();
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
    M.playing = true; M.hx = 0; M.hz = 0; M.hy = 2.25; M.setOpen(1);
    msg.textContent = 'Move the claw with the arrows (or WASD), then DROP (Space)!';
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
      const map = { a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r', w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b' };
      if (map[k]) hold(map[k], down);
      if (down && !e.repeat && (k === ' ' || k === 'enter')) { if (st.phase === 'aim') drop(); else if (st.phase === 'ready') start(); }
      if (down && k === 'escape') ui.done();
    },
    update(dt, t, cam) {
      const w = M.group.position;
      easeCamera(cam, new THREE.Vector3(w.x, 2.45, w.z + 1.75), new THREE.Vector3(w.x + M.hx * 0.25, 1.45, w.z - 0.1), dt, st.cam);
      const T = st.target;
      if (st.phase === 'aim') {
        M.hx = THREE.MathUtils.clamp(M.hx + st.dir.x * 0.6 * dt, -0.68, 0.68);
        M.hz = THREE.MathUtils.clamp(M.hz + st.dir.z * 0.6 * dt, -0.68, 0.68);
        if ((st.timer -= dt) <= 0) drop();
        msg.textContent = `Move the claw, then DROP! ⏱ ${Math.ceil(st.timer)}`;
      } else if (st.phase === 'drop') {
        const bottom = (T ? T.y : 1.05) + 0.2;
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
        M.hy = Math.min(2.25, M.hy + 0.7 * dt);
        const P = st.carry;
        if (P) {
          P.x += (M.hx - P.x) * Math.min(1, dt * 8); P.z += (M.hz - P.z) * Math.min(1, dt * 8);
          P.y = M.hy - 0.28;
          P.obj.position.set(P.x, P.y, P.z);
          if (!st.result.win && M.hy > 1.55) { P.held = false; P.vy = 0.5; P.rest = 1.02 + Math.random() * 0.06; st.carry = null; M.setOpen(0.6); sfx('bonk', { power: 0.3 }); }
        }
        if (M.hy >= 2.25) {
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
  add(new THREE.BoxGeometry(1.4, 0.8, 3.2), toon('#7c4dff'), [0, 0.4, 0]);
  add(new THREE.BoxGeometry(1.2, 0.05, 2.6), toon('#d8b07a'), [0, 0.82, 0.2], [-0.12, 0, 0]);
  add(new THREE.BoxGeometry(1.4, 1.6, 0.5), toon('#2a1f5e'), [0, 1.2, -1.5]);
  const ring = (r, y, c, px = 0) => add(new THREE.TorusGeometry(r, 0.035, 6, 28), basic(c), [px, y, -1.24]);
  ring(0.5, 1.25, '#ffd84d'); ring(0.32, 1.25, '#ff4fd8'); ring(0.15, 1.25, '#39e6ff');
  for (const s of [-1, 1]) { ring(0.1, 1.72, '#6ee7a0', s * 0.42); add(new THREE.CircleGeometry(0.09, 16), basic('#05030f'), [s * 0.42, 1.72, -1.245]); }
  add(new THREE.CircleGeometry(0.13, 20), basic('#05030f'), [0, 1.25, -1.245]);
  // a score screen above
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.PlaneGeometry(1.1, 0.4), new THREE.MeshBasicMaterial({ map: tex }), [0, 2.2, -1.24]);
  const show = (top, bottom) => {
    const x2 = c.getContext('2d');
    x2.fillStyle = '#05030f'; x2.fillRect(0, 0, 256, 96);
    x2.font = '40px "Luckiest Guy", Rubik, sans-serif'; x2.textAlign = 'center'; x2.fillStyle = '#ffd84d'; x2.fillText(top, 128, 46);
    x2.font = '22px Rubik, sans-serif'; x2.fillStyle = '#b9a0ff'; x2.fillText(bottom, 128, 80);
    tex.needsUpdate = true;
  };
  show('SKEE-BALL', 'insert coin');
  const ball = add(new THREE.SphereGeometry(0.1, 14, 10), toon('#ffffff'), [0, 0.95, 1]);
  const L = { group: lane, ball, show, playing: false };
  anim.push((t) => { if (L.playing) return; const f = (t * 0.6 + x) % 1; ball.position.set(Math.sin(f * 9) * 0.1, 0.95 + f * 0.35 + Math.sin(f * Math.PI) * 0.3, 1.2 - f * 2.6); });
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
    stop() { off(); L.playing = false; L.show('SKEE-BALL', 'insert coin'); },
  };
  function next(pts, text) {
    st.score += pts;
    st.balls -= 1;
    sfx(pts >= 50 ? 'coin' : pts ? 'pop' : 'bonk', { power: 0.3 });
    L.show(String(st.score), `${st.balls} ball${st.balls === 1 ? '' : 's'} left`);
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
export function hockeyTable(g, x, z, anim) {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  g.add(t);
  const add = (geo, mat, p, r) => { const o = new THREE.Mesh(geo, mat); o.position.set(...p); if (r) o.rotation.set(...r); t.add(o); return o; };
  add(new THREE.BoxGeometry(2.0, 0.9, 3.4), toon('#2a1f5e'), [0, 0.45, 0]);
  add(new THREE.BoxGeometry(1.8, 0.04, 3.2), toon('#e6f4ff'), [0, 0.92, 0]);
  add(new THREE.BoxGeometry(1.8, 0.02, 0.04), basic('#ff4fd8'), [0, 0.95, 0]);
  add(new THREE.TorusGeometry(0.3, 0.015, 6, 24), basic('#ff4fd8'), [0, 0.95, 0], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.6, 0.03, 0.06), basic('#05030f'), [0, 0.95, s * 1.6]); // goal slots
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.66, 0.08, 0.06), toon('#7c4dff'), [sx * 0.63, 0.98, s * 1.63]);
    add(new THREE.BoxGeometry(0.06, 0.08, 3.3), toon('#7c4dff'), [s * 0.93, 0.98, 0]);
  }
  const puck = add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 18), toon('#ff3b5c'), [0, 0.955, 0]);
  const mine = add(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 18), toon('#39c6ff'), [0, 0.99, 1.3]);
  const cpu = add(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 18), toon('#ffd84d'), [0, 0.99, -1.3]);
  for (const m of [mine, cpu]) { const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), toon('#ffffff')); knob.position.y = 0.08; m.add(knob); } // the handles
  const H = { group: t, puck, mine, cpu, playing: false };
  anim.push((tt) => { if (H.playing) return; puck.position.x = Math.sin(tt * 2.3 + x) * 0.7; puck.position.z = Math.sin(tt * 1.7) * 1.3; cpu.position.x = puck.position.x * 0.8; mine.position.x = puck.position.x * 0.7; });
  return H;
}

export function hockeyGame(H, ui, stage) {
  const R_P = 0.1, R_M = 0.14, XW = 0.9 - R_P, ZW = 1.6;
  const st = { phase: 'ready', me: 0, cpu: 0, p: { x: 0, z: 0, vx: 0, vz: 0 }, m: { x: 0, z: 1.3, vx: 0, vz: 0 }, c: { x: 0, z: -1.3, vx: 0, vz: 0 }, goal: null, keys: new Set(), cam: {}, waiting: false, pause: 0 };
  ui.hud.innerHTML = `<div class="ap-top"><b>🏒 Air Hockey</b><span class="ap-score"></span><span class="ap-wallet"></span></div><div class="ap-msg"></div><div class="ap-pad"></div>`;
  const msg = ui.hud.querySelector('.ap-msg'), pad = ui.hud.querySelector('.ap-pad'), scoreEl = ui.hud.querySelector('.ap-score'), wal = ui.hud.querySelector('.ap-wallet');
  const renderPad = () => {
    wal.innerHTML = wallet();
    scoreEl.innerHTML = st.phase === 'ready' ? '' : `You <b>${st.me}</b> – <b>${st.cpu}</b> CPU`;
    if (st.phase === 'ready') buttons(pad, [{ id: 'play', label: `🪙 ${ARCADE_COST} · Play to 5`, cls: 'primary' }, { id: 'exit', label: 'Leave', cls: 'ghost' }], (id, d) => { if (!d) return; if (id === 'play') pay(); else ui.done(); });
    else buttons(pad, [{ id: 'exit', label: '✕ Quit', cls: 'ghost' }], (id, d) => { if (d) ui.done(); });
  };
  const pay = () => {
    if (st.waiting) return;
    if ((me()?.coins ?? 0) < ARCADE_COST) { msg.innerHTML = `<span class="lose">You need 🪙 ${ARCADE_COST} to play.</span>`; sfx('error'); return; }
    st.waiting = true;
    net.send('arcade_play', { g: 'hockey' });
  };
  const serve = (toward) => { Object.assign(st.p, { x: 0, z: toward * 0.3, vx: (Math.random() - 0.5) * 0.6, vz: 0 }); st.pause = 0.8; };
  const begin = () => {
    Object.assign(st, { phase: 'play', me: 0, cpu: 0, waiting: false });
    Object.assign(st.m, { x: 0, z: 1.3 }); Object.assign(st.c, { x: 0, z: -1.3 });
    serve(-1);
    H.playing = true;
    msg.textContent = 'Move your blue mallet with the mouse (or drag, or WASD). First to 5!';
    sfx('coin');
    renderPad();
  };
  // the pointer moves your mallet: where it points on the table
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.97), hitP = new THREE.Vector3();
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
    arcade_go: (m) => { if (m.g === 'hockey' && st.waiting) begin(); },
    error: (m) => { if (m.for === 'arcade_play' && st.waiting) { st.waiting = false; msg.innerHTML = `<span class="lose">${esc(m.msg ?? '')}</span>`; } },
    arcade_result: (m) => { if (m.g === 'hockey') { msg.innerHTML += ` · +${fmt(m.tickets ?? 0)} 🎟️`; sfx('coins', { n: 4 }); } },
    player: () => { wal.innerHTML = wallet(); },
  });
  msg.textContent = 'Beat the machine at air hockey: first to five goals wins tickets!';
  renderPad();
  const hitMallet = (m) => {
    const p = st.p, dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
    if (d >= R_P + R_M || d === 0) return;
    const nx = dx / d, nz = dz / d;
    p.x = m.x + nx * (R_P + R_M); p.z = m.z + nz * (R_P + R_M);
    const rv = (p.vx - m.vx) * nx + (p.vz - m.vz) * nz;
    if (rv < 0) { p.vx -= 1.9 * rv * nx; p.vz -= 1.9 * rv * nz; }
    p.vx += m.vx * 0.35; p.vz += m.vz * 0.35;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 6) { p.vx *= 6 / sp; p.vz *= 6 / sp; }
    sfx('bonk', { power: Math.min(1, sp / 6) * 0.4 });
  };
  const moveMallet = (m, tx, tz, maxSp, zLo, zHi, dt) => {
    tx = THREE.MathUtils.clamp(tx, -0.9 + R_M, 0.9 - R_M); tz = THREE.MathUtils.clamp(tz, zLo, zHi);
    let dx = tx - m.x, dz = tz - m.z;
    const d = Math.hypot(dx, dz), step = maxSp * dt;
    if (d > step) { dx *= step / d; dz *= step / d; }
    m.vx = dx / dt; m.vz = dz / dt;
    m.x += dx; m.z += dz;
  };
  return {
    key(e, down) {
      const k = e.key.toLowerCase();
      if (down) st.keys.add(k); else st.keys.delete(k);
      if (down && k === ' ' && st.phase === 'ready') pay();
      if (down && k === 'escape') ui.done();
    },
    update(dt, t, cam) {
      const w = H.group.position;
      easeCamera(cam, new THREE.Vector3(w.x, 2.9, w.z + 2.7), new THREE.Vector3(w.x, 0.9, w.z + 0.1), dt, st.cam);
      if (st.phase !== 'play') return;
      dt = Math.min(dt, 1 / 30);
      // you: follow the pointer (or the keys)
      const kx = (st.keys.has('d') || st.keys.has('arrowright') ? 1 : 0) - (st.keys.has('a') || st.keys.has('arrowleft') ? 1 : 0);
      const kz = (st.keys.has('s') || st.keys.has('arrowdown') ? 1 : 0) - (st.keys.has('w') || st.keys.has('arrowup') ? 1 : 0);
      if (kx || kz) aim = { x: st.m.x + kx * 0.5, z: st.m.z + kz * 0.5 };
      if (aim) moveMallet(st.m, aim.x, aim.z, 7, 0.12 + R_M, ZW - R_M, dt);
      // the machine: guards its goal, and attacks when the puck's on its side
      const p = st.p, c = st.c;
      const attack = p.z < 0 && (p.vz > -1.5 || p.z > -0.8);
      moveMallet(c, attack ? p.x + (Math.random() - 0.5) * 0.04 : p.x * 0.6, attack ? p.z - 0.18 : -1.3, attack ? 3.2 : 2.4, -ZW + R_M, -0.12 - R_M, dt);
      if (st.pause > 0) st.pause -= dt;
      else {
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.vx *= 1 - 0.25 * dt; p.vz *= 1 - 0.25 * dt;
        if (Math.abs(p.x) > XW) { p.x = Math.sign(p.x) * XW; p.vx *= -0.92; sfx('bonk', { power: 0.15 }); }
        if (Math.abs(p.z) > ZW - R_P) {
          if (Math.abs(p.x) < 0.3 - R_P * 0.3) {
            // a goal!
            const mine = p.z < 0;
            if (mine) st.me += 1; else st.cpu += 1;
            sfx(mine ? 'coin' : 'lose');
            msg.textContent = mine ? 'GOAL! ⚡' : 'The machine scored…';
            renderPad();
            if (st.me >= 5 || st.cpu >= 5) {
              const won = st.me >= 5;
              st.phase = 'ready';
              H.playing = false;
              msg.textContent = won ? `🏆 You win ${st.me}–${st.cpu}!` : `You lost ${st.me}–${st.cpu}. Rematch?`;
              net.send('arcade_score', { g: 'hockey', s: st.me * 100 + (won ? 300 : 0) });
              renderPad();
              return;
            }
            serve(mine ? 1 : -1);
          } else { p.z = Math.sign(p.z) * (ZW - R_P); p.vz *= -0.92; sfx('bonk', { power: 0.15 }); }
        }
        hitMallet(st.m);
        hitMallet(c);
      }
      H.puck.position.set(p.x, 0.955, p.z);
      H.mine.position.set(st.m.x, 0.99, st.m.z);
      H.cpu.position.set(c.x, 0.99, c.z);
    },
    stop() { off(); H.playing = false; stage.canvas.removeEventListener('pointermove', onMove); stage.canvas.removeEventListener('pointerdown', onMove); },
  };
}
