// The Arcade: a dark, neon games hall. Cabinets cost coins and pay out tickets; the Laser Tag arena,
// claw machines and the prize counter (a new line-up of prizes every hour) are in here too. The big
// board on the back wall shows the zone's top score on every machine.
import * as THREE from 'three';
import { S, fmt, nameOf, esc, me } from '../state.js';
import { net } from '../net.js';
import { ITEMS, RARITY } from '../catalog.js';
import { portraitInto } from '../avatar.js';
import { sfx } from '../sfx.js';
import { toon, basic, canvasTexture, additive, glowTexture, TAU } from '../three/materials.js';
import { room, add, openWalker, sign, counter, shopkeeper } from './store.js';
import { ARCADE_GAMES, arcadeCabinet } from '../games/arcadegames.js';
import { listen, confetti } from '../games/util.js';
import { clawMachine, clawGame, skeeLane, skeeGame, hockeyTable, hockeyGame } from './arcadeplay.js';

const NEON = ['#ff4fd8', '#39e6ff', '#ffd84d', '#6ee7a0', '#b77bff', '#ff9f43'];

/** A cabinet: body, a glowing screen with the game's title art, a marquee, joystick and buttons. */
function cabinet(def) {
  const g = new THREE.Group();
  const body = toon('#221845'), side = toon(def.color);
  add(g, new THREE.BoxGeometry(1.2, 2.3, 1.0), body, { p: [0, 1.15, 0], outline: true });
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.06, 2.3, 1.02), side, { p: [s * 0.63, 1.15, 0] });
  // a neon strip up each front edge
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.04, 2.2, 0.04), basic(def.color), { p: [s * 0.6, 1.15, 0.52], cast: false });
  const screenTex = canvasTexture(256, 200, (c) => {
    const grd = c.createLinearGradient(0, 0, 0, 200);
    grd.addColorStop(0, '#0c0a2a'); grd.addColorStop(1, '#1d1450');
    c.fillStyle = grd; c.fillRect(0, 0, 256, 200);
    c.fillStyle = def.color;
    for (let i = 0; i < 30; i++) c.fillRect((i * 53) % 256, (i * 37) % 200, 3, 3);
    c.font = '38px "Luckiest Guy", Rubik, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 8; c.strokeStyle = '#000'; c.strokeText(def.name.toUpperCase(), 128, 90);
    c.fillStyle = def.color; c.fillText(def.name.toUpperCase(), 128, 90);
    c.font = '18px Rubik, sans-serif'; c.fillStyle = '#ffffff'; c.fillText('INSERT COIN', 128, 150);
  });
  const screen = add(g, new THREE.PlaneGeometry(0.95, 0.75), new THREE.MeshBasicMaterial({ map: screenTex }), { p: [0, 1.62, 0.44], r: [-0.18, 0, 0], cast: false });
  const marqueeTex = canvasTexture(256, 64, (c) => {
    c.fillStyle = def.color; c.fillRect(0, 0, 256, 64);
    c.font = '34px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#1a1330'; c.fillText(def.name.toUpperCase(), 128, 36);
  });
  add(g, new THREE.BoxGeometry(1.22, 0.36, 0.5), body, { p: [0, 2.46, 0.24] });
  add(g, new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: marqueeTex }), { p: [0, 2.46, 0.5], cast: false });
  // control panel
  add(g, new THREE.BoxGeometry(1.22, 0.14, 0.5), toon('#2e2266'), { p: [0, 1.08, 0.66], r: [0.25, 0, 0] });
  add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), toon('#c0c6d4'), { p: [-0.3, 1.22, 0.7] });
  add(g, new THREE.SphereGeometry(0.06, 10, 8), toon('#ff5d73'), { p: [-0.3, 1.32, 0.7] });
  ['#ffd84d', '#39c6ff', '#6ee7a0'].forEach((c, i) => add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), toon(c), { p: [0.05 + i * 0.14, 1.17, 0.7 - (i % 2) * 0.05], r: [0.25, 0, 0] }));
  // the coin slot
  add(g, new THREE.BoxGeometry(0.22, 0.26, 0.04), toon('#3a2f7a'), { p: [0, 0.55, 0.51] });
  add(g, new THREE.BoxGeometry(0.03, 0.12, 0.02), basic('#ff3b4f'), { p: [0, 0.57, 0.535], cast: false });
  const glow = new THREE.Sprite(additive(glowTexture, new THREE.Color(def.color).getHex(), 0.35));
  glow.scale.set(1.8, 1.4, 1);
  glow.position.set(0, 1.62, 0.6);
  g.add(glow);
  return { group: g, screen, glow };
}

/** The high-score wall: best score on every machine, redrawn as scores come in. */
function scoreBoard() {
  const cw = 1024, ch = 640;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const x = c.getContext('2d');
    x.fillStyle = '#0c0a2a'; x.fillRect(0, 0, cw, ch);
    x.strokeStyle = '#ff4fd8'; x.lineWidth = 10; x.strokeRect(8, 8, cw - 16, ch - 16);
    x.font = '60px "Luckiest Guy", Rubik, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#ff4fd8'; x.shadowBlur = 20; x.fillStyle = '#ffffff'; x.fillText('HIGH SCORES', cw / 2, 56);
    x.shadowBlur = 0;
    ARCADE_GAMES.forEach((g, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const px = 50 + col * 480, py = 122 + row * 86;
      const top = S.arcade?.[g.id]?.[0];
      x.textAlign = 'left';
      x.font = '30px "Luckiest Guy", Rubik, sans-serif'; x.fillStyle = g.color; x.fillText(g.name.toUpperCase(), px, py);
      x.font = '26px Rubik, sans-serif'; x.fillStyle = top ? '#ffffff' : '#6a6a9a';
      x.fillText(top ? `${nameOf(top.k)} · ${fmt(top.s)}` : '— no score yet —', px, py + 34);
    });
    tex.needsUpdate = true;
  };
  draw();
  return { tex, draw };
}

/** A glowing neon sign on a wall (text drawn with a bright glow). */
function neonSign(g, text, color, { p, r = [0, 0, 0], w = 4, h = 1 }) {
  const cw = 512, ch = Math.round((512 * h) / w);
  const tex = canvasTexture(cw, ch, (c) => {
    c.clearRect(0, 0, cw, ch);
    let size = Math.floor(ch * 0.62);
    c.font = `${size}px "Luckiest Guy", Rubik, sans-serif`;
    while (c.measureText(text).width > cw * 0.9) { size -= 2; c.font = `${size}px "Luckiest Guy", Rubik, sans-serif`; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = color; c.shadowBlur = 24; c.lineWidth = 6; c.strokeStyle = color;
    c.strokeText(text, cw / 2, ch / 2 + 4);
    c.shadowBlur = 8; c.fillStyle = '#ffffff'; c.fillText(text, cw / 2, ch / 2 + 4);
  });
  return add(g, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), { p, r, cast: false });
}

/** The prize counter: this hour's prizes for tickets (exclusives first). */
function ticketShop(body) {
  let shop = null, timer = 0;
  const zoomFor = (slot) => (slot === 'pet' ? 'pet' : slot === 'mount' ? 'mount' : ['hat', 'face', 'hair'].includes(slot) ? 'head' : 'body');
  const render = () => {
    const tix = me()?.tickets ?? 0;
    if (!shop) { body.innerHTML = '<h2>🎟️ Prize Counter</h2><p class="muted">Loading the prizes…</p>'; return; }
    const left = Math.max(0, shop.ends * 1000 - Date.now()), mins = Math.floor(left / 60000), secs = Math.floor((left % 60000) / 1000);
    body.innerHTML = `<div class="tix">
      <div class="tix-head"><h2>🎟️ Prize Counter</h2><span class="tix-bal">🎟️ <b>${fmt(tix)}</b></span></div>
      <p class="muted small">Win tickets on the cabinets, Laser Tag and the claw machine. <b>New prizes in ${mins}:${String(secs).padStart(2, '0')}</b></p>
      <div class="tix-grid">${shop.items.map((e) => {
        const it = ITEMS[e.id], owned = me()?.owned.includes(e.id);
        return `<div class="tix-card ${e.ex ? 'ex' : ''} r-${it.rarity}" data-id="${e.id}">
          ${e.ex ? '<span class="tix-badge">✨ Ticket exclusive</span>' : ''}
          <span class="tix-art"></span>
          <b>${esc(it.name)}</b><small style="color:${RARITY[it.rarity]?.color ?? '#fff'}">${RARITY[it.rarity]?.label ?? it.rarity}</small>
          <button class="btn small ${owned ? '' : 'primary'}" data-buy="${e.id}" ${owned || tix < e.price ? 'disabled' : ''}>${owned ? 'Owned' : `🎟️ ${fmt(e.price)}`}</button>
        </div>`;
      }).join('')}</div></div>`;
    body.querySelectorAll('.tix-card').forEach((el) => {
      const it = ITEMS[el.dataset.id];
      portraitInto(el.querySelector('.tix-art'), { ...me().look, [it.slot]: it.id }, 96, 100, { zoom: zoomFor(it.slot) });
    });
  };
  body.onclick = (e) => {
    const id = e.target.closest('[data-buy]')?.dataset.buy;
    if (id) { net.send('ticket_buy', { id }); sfx('click'); }
  };
  const off = listen({
    ticket_shop: (m) => { shop = m; render(); },
    player: () => { if (shop) render(); },
    unlock: (m) => { if (m.source === 'tickets') { sfx('reveal', { rarity: ITEMS[m.id]?.rarity }); confetti(body); } },
  });
  net.send('ticket_shop');
  render();
  // the countdown, and a fresh line-up when the hour turns over
  timer = setInterval(() => {
    if (!shop) return;
    if (Date.now() >= shop.ends * 1000) { shop = null; net.send('ticket_shop'); }
    const el = body.querySelector('.tix p b');
    if (el && shop) { const left = Math.max(0, shop.ends * 1000 - Date.now()); el.textContent = `New prizes in ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`; }
  }, 1000);
  return () => { off(); clearInterval(timer); };
}

export function arcadeArea(stage) {
  stage.lights({ background: '#0a0620', sky: 0xb9a0ff, ground: 0x2a1a4a, hemi: 0.85, sun: 0.5, sunPos: [6, 30, 12], box: 22 });
  const W = 34, D = 26;
  const g = room(stage, {
    w: W, d: D, wall: '#1f1748', trim: '#ff4fd8', windows: false, wainscot: '#140f33', panel: '#1d1650', lamp: 0xc9a0ff,
    // the classic arcade carpet: dark, with neon squiggles, stars and shapes
    floorDraw: (c) => {
      c.fillStyle = '#120c30'; c.fillRect(0, 0, 256, 256);
      const shapes = ['#ff4fd8', '#39e6ff', '#ffd84d', '#6ee7a0', '#b77bff'];
      for (let i = 0; i < 34; i++) {
        const x = (i * 71 + i * i * 29) % 256, y = (i * 113 + i * i * 17) % 256, col = shapes[(i * 3) % shapes.length];
        c.strokeStyle = c.fillStyle = col; c.lineWidth = 4;
        if (i % 4 === 0) { c.beginPath(); for (let k = 0; k < 4; k++) c.lineTo(x + k * 9, y + (k % 2 ? 9 : -9)); c.stroke(); }
        else if (i % 4 === 1) { c.beginPath(); c.arc(x, y, 6, 0, TAU); c.stroke(); }
        else if (i % 4 === 2) { c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 7, y + 6); c.lineTo(x - 7, y + 6); c.closePath(); c.stroke(); }
        else c.fillRect(x - 3, y - 3, 6, 6);
      }
    },
    motif: (c) => { c.fillStyle = 'rgba(57,230,255,.25)'; for (const [x, y] of [[40, 50], [170, 190]]) { c.fillRect(x, y, 16, 16); c.fillRect(x + 20, y + 8, 8, 8); } },
  });
  stage.scene.add(g);
  const anim = [];
  const solids = [];
  const hw = W / 2, hd = D / 2;

  // cabinets: a row along the back wall (under the score board), and down the left wall
  const spots = [
    [-14, -11.6, 0], [-11.6, -11.6, 0], [-9.2, -11.6, 0], [-6.8, -11.6, 0], [6.8, -11.6, 0], [9.2, -11.6, 0], [11.6, -11.6, 0], [14, -11.6, 0],
    [-16, -6, Math.PI / 2], [-16, -3.4, Math.PI / 2],
  ];
  ARCADE_GAMES.forEach((def, i) => {
    const [x, z, ry] = spots[i];
    const cab = cabinet(def);
    cab.group.position.set(x, 0, z);
    cab.group.rotation.y = ry;
    g.add(cab.group);
    solids.push(ry ? { x, z, w: 1.1, d: 1.3 } : { x, z, w: 1.3, d: 1.1 });
    const fx = x + Math.sin(ry) * 1.5, fz = z + Math.cos(ry) * 1.5;
    stage.interactable({ x: fx, z: fz, r: 1.3, label: `play ${def.name}`, icon: 'arcade', obj: cab.group,
      use: () => stage.openPanel({ wide: true, mount: (body) => arcadeCabinet(body, def.id, { paid: true }) }) });
    anim.push((t) => { cab.glow.material.opacity = 0.25 + Math.sin(t * 2 + i) * 0.1; });
  });

  // the high-score wall in the middle of the back wall, with neon signs around it
  const board = scoreBoard();
  add(g, new THREE.PlaneGeometry(8, 5), new THREE.MeshBasicMaterial({ map: board.tex }), { p: [0, 2.7, -hd + 0.06], cast: false });
  neonSign(g, 'ARCADE', '#ff4fd8', { p: [-11, 4.1, -hd + 0.08], w: 5, h: 1.1 });
  neonSign(g, 'GAME ON!', '#39e6ff', { p: [11, 4.1, -hd + 0.08], w: 5, h: 1.1 });

  // ---- the Laser Tag arena: a glowing doorway on the right wall into a dark maze ----
  const lt = new THREE.Group();
  lt.position.set(hw - 0.1, 0, -4);
  lt.rotation.y = -Math.PI / 2;
  g.add(lt);
  add(lt, new THREE.BoxGeometry(5.6, 4.4, 0.4), toon('#140f33'), { p: [0, 2.2, 0], outline: true });
  add(lt, new THREE.BoxGeometry(2.6, 3.0, 0.42), basic('#05030f'), { p: [0, 1.5, 0.02], cast: false });
  const ltNeon = [];
  for (const [w, h, x, y] of [[2.9, 0.08, 0, 3.05], [0.08, 3.0, -1.4, 1.5], [0.08, 3.0, 1.4, 1.5]]) ltNeon.push(add(lt, new THREE.BoxGeometry(w, h, 0.05), basic('#39ff9e'), { p: [x, y, 0.24], cast: false }));
  neonSign(lt, 'LASER TAG', '#39ff9e', { p: [0, 3.75, 0.23], w: 4.6, h: 0.9 });
  // lasers criss-crossing the dark doorway
  const beams = [];
  for (let k = 0; k < 4; k++) beams.push(add(lt, new THREE.BoxGeometry(2.4, 0.025, 0.02), basic(k % 2 ? '#ff4fd8' : '#39ff9e'), { p: [0, 0.6 + k * 0.6, 0.25], cast: false }));
  anim.push((t) => {
    beams.forEach((b, k) => { b.rotation.z = Math.sin(t * (1 + k * 0.3) + k) * 0.5; });
    ltNeon.forEach((n) => { n.visible = Math.sin(t * 9) > -0.85; });
  });
  solids.push({ x: hw - 0.3, z: -4, w: 0.8, d: 5.6 });
  stage.interactable({ x: hw - 1.6, z: -4, r: 1.8, label: 'play Laser Tag (🪙 10)', icon: 'arcade', obj: lt,
    use: () => {
      if ((me()?.coins ?? 0) < 10) { sfx('error'); stage.banner('🪙 Laser Tag costs 10 coins.', 1800); return; }
      window.dispatchEvent(new CustomEvent('fz:area', { detail: 'lasertag' }));
    } });
  // laser tag vests hanging either side of the door
  for (const [x, y, c] of [[-2.1, 1.4, '#ff4fd8'], [-2.1, 2.2, '#39ff9e'], [2.1, 1.4, '#39ff9e'], [2.1, 2.2, '#ff4fd8']]) {
    add(lt, new THREE.BoxGeometry(0.46, 0.58, 0.12), toon('#2a2d3e'), { p: [x, y, 0.28], outline: true });
    add(lt, new THREE.BoxGeometry(0.14, 0.14, 0.04), basic(c), { p: [x, y + 0.08, 0.36], cast: false });
  }

  // ---- walk-up machines: you play them right there (the camera moves in, buttons come up) ----
  let mode = null, saved = null;
  const playHud = document.createElement('div');
  playHud.className = 'arc-play hidden';
  stage.hud.append(playHud);
  const play = (make) => {
    if (mode) return;
    saved = { orbit: stage.orbit, inter: stage.interactables };
    stage.orbit = null; // (we steer the camera ourselves)
    stage.interactables = [];
    stage.person(S.me).visible = false;
    playHud.classList.remove('hidden');
    mode = make({ hud: playHud, done: leave });
  };
  const leave = () => {
    if (!mode) return;
    mode.stop();
    mode = null;
    stage.orbit = saved.orbit;
    stage.orbit.cur = null;
    stage.interactables = saved.inter;
    stage.person(S.me).visible = true;
    playHud.classList.add('hidden');
    playHud.innerHTML = '';
  };
  stage.onKey = (e, down) => mode?.key?.(e, down);
  stage.onFrame((dt, now) => mode?.update(Math.min(dt, 0.05), now / 1000, stage.camera));

  // the claw machines: full of real plushies
  for (const [x, col] of [[10, '#ff4fd8'], [12.6, '#39c6ff']]) {
    const M = clawMachine(g, x, 7, col, anim);
    solids.push({ x, z: 7, w: 1.9, d: 1.9 });
    stage.interactable({ x, z: 8.7, r: 1.3, label: 'play the claw machine (🪙 25)', icon: 'arcade', use: () => play((ui) => clawGame(M, ui)) });
  }
  // the prize counter: a glass counter, shelves of prizes behind, and the attendant
  counter(g, -11, 6.5, 6, '#7c4dff');
  add(g, new THREE.BoxGeometry(5.6, 0.7, 0.7), toon('#dff4ff', { transparent: true, opacity: 0.35 }), { p: [-11, 1.55, 6.5], cast: false });
  for (let i = 0; i < 8; i++) add(g, new THREE.SphereGeometry(0.16, 10, 8), toon(NEON[i % NEON.length]), { p: [-13.4 + i * 0.68, 1.4, 6.5] });
  const shelf = new THREE.Group();
  shelf.position.set(-16.6, 0, 6.5);
  shelf.rotation.y = Math.PI / 2;
  g.add(shelf);
  add(shelf, new THREE.BoxGeometry(6.4, 3.4, 0.5), toon('#2a1f5e'), { p: [0, 1.7, 0], outline: true });
  for (let row = 0; row < 3; row++) {
    add(shelf, new THREE.BoxGeometry(6.2, 0.08, 0.6), toon('#ff4fd8'), { p: [0, 0.8 + row * 0.95, 0.15] });
    for (let k = 0; k < 9; k++) {
      const c = NEON[(k + row * 2) % NEON.length], px = -2.8 + k * 0.7, py = 1.05 + row * 0.95;
      if ((k + row) % 3 === 0) add(shelf, new THREE.BoxGeometry(0.4, 0.42, 0.3), toon(c), { p: [px, py, 0.3], outline: true }); // a boxed prize
      else { add(shelf, new THREE.SphereGeometry(0.2, 10, 8), toon(c), { p: [px, py, 0.3] }); add(shelf, new THREE.SphereGeometry(0.15, 10, 8), toon(c), { p: [px, py + 0.28, 0.3] }); } // a teddy
    }
  }
  neonSign(g, 'PRIZES', '#ffd84d', { p: [-hw + 0.08, 4.1, 6.5], r: [0, Math.PI / 2, 0], w: 4, h: 1 });
  shopkeeper(g, { skin: '#f1c27d', hair: 'hair_bun', hairColor: '#ff4fd8', top: 'top_hoodie', topColor: '#7c4dff', eyes: 'eyes_sparkle', hat: 'hat_headphones' }, -11, 5.4, anim);
  solids.push({ x: -11, z: 6.5, w: 6.2, d: 1.1 }, { x: -16.6, z: 6.5, w: 0.8, d: 6.4 }, { x: -11, z: 5.4, r: 0.5 });
  stage.interactable({ x: -11, z: 8, r: 2.2, label: 'trade tickets for prizes', icon: 'shop', use: () => stage.openPanel({ wide: true, mount: (body) => ticketShop(body) }) });
  sign(g, 'TICKET PRIZES', { x: -11, z: 6.5, y: 4.3, w: 3.6, h: 0.8, bg: '#7c4dff' });

  // ---- in the middle: air hockey tables and skee-ball lanes (both playable) ----
  for (const x of [-4, 4]) {
    const T = hockeyTable(g, x, 0, anim);
    solids.push({ x, z: 0, w: 2.1, d: 3.5 });
    stage.interactable({ x, z: 2.4, r: 1.3, label: 'play air hockey (🪙 10)', icon: 'arcade', use: () => play((ui) => hockeyGame(T, ui, stage)) });
  }
  for (let k = 0; k < 3; k++) {
    const x = -2 + k * 2, z = -6.5;
    const L = skeeLane(g, x, z, anim);
    solids.push({ x, z: z - 0.1, w: 1.5, d: 3.6 });
    stage.interactable({ x, z: z + 2.2, r: 0.9, label: 'play skee-ball (🪙 10)', icon: 'arcade', use: () => play((ui) => skeeGame(L, ui)) });
  }
  neonSign(g, 'SKEE-BALL', '#b77bff', { p: [0, 3.7, -8.2], w: 3.6, h: 0.8 });

  // neon strips along the floor edges and a ring of coloured spotlights
  const strips = [];
  for (const s of [-1, 1]) strips.push(add(g, new THREE.BoxGeometry(W - 1, 0.03, 0.12), basic(s < 0 ? '#39e6ff' : '#ff4fd8'), { p: [0, 0.02, s * (hd - 2.6)], cast: false }));
  anim.push((t) => strips.forEach((m, i) => { m.visible = Math.sin(t * 3 + i * Math.PI) > -0.6; }));
  const spots2 = [];
  for (const [x, z, c] of [[-8, -2, 0xff4fd8], [8, -2, 0x39e6ff], [0, 6, 0xffd84d]]) {
    const l = new THREE.PointLight(c, 14, 14, 1.6);
    l.position.set(x, 4.2, z);
    g.add(l);
    spots2.push(l);
  }
  anim.push((t) => spots2.forEach((l, i) => { l.intensity = 11 + Math.sin(t * 1.5 + i * 2) * 4; }));

  const walker = openWalker(stage, { w: W, d: D, solids, frozen: () => !!mode });
  const off = listen({ arcade_board: () => board.draw() });
  stage.onFrame((dt, now) => { for (const fn of anim) fn(now / 1000, dt); });
  stage.banner(`<div class="big">🕹️ Arcade</div>Each go costs 🪙 coins and wins 🎟️ tickets. Spend them at the prize counter: new prizes every hour!`, 3500);
  return () => { leave(); off(); walker.stop(); stage.scene?.remove(g); };
}
