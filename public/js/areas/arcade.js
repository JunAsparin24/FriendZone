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

const CLAW_COST = 25;
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

/** A claw machine: glass box full of plushies, a moving claw, a prize chute and flashing bulbs. */
function clawMachine(g, x, z, color, anim) {
  const m = new THREE.Group();
  m.position.set(x, 0, z);
  g.add(m);
  add(m, new THREE.BoxGeometry(1.7, 1.0, 1.7), toon(color), { p: [0, 0.5, 0], outline: true });
  add(m, new THREE.BoxGeometry(1.6, 1.5, 1.6), toon('#dff4ff', { transparent: true, opacity: 0.22 }), { p: [0, 1.75, 0], cast: false });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(m, new THREE.BoxGeometry(0.08, 1.5, 0.08), toon(color), { p: [sx * 0.8, 1.75, sz * 0.8] });
  add(m, new THREE.BoxGeometry(1.75, 0.35, 1.75), toon(color), { p: [0, 2.67, 0], outline: true });
  add(m, new THREE.BoxGeometry(1.6, 0.25, 0.05), basic('#ffffff'), { p: [0, 2.67, 0.88], cast: false });
  neonSign(m, 'CLAW', '#ffd84d', { p: [0, 2.67, 0.91], w: 1.4, h: 0.32 });
  // a heap of plushies
  for (let i = 0; i < 14; i++) {
    const px = (((i * 37) % 11) / 11 - 0.5) * 1.2, pz = (((i * 53) % 11) / 11 - 0.5) * 1.2;
    add(m, new THREE.SphereGeometry(0.17, 12, 10), toon(NEON[i % NEON.length]), { p: [px, 1.15 + (i % 3) * 0.1, pz] });
  }
  add(m, new THREE.BoxGeometry(0.5, 0.35, 0.06), toon('#1a1330'), { p: [0.45, 0.45, 0.86] }); // prize chute
  add(m, new THREE.BoxGeometry(0.6, 0.12, 0.4), toon('#2e2266'), { p: [-0.35, 1.05, 0.95], r: [0.3, 0, 0] }); // controls
  add(m, new THREE.SphereGeometry(0.06, 10, 8), toon('#ff5d73'), { p: [-0.5, 1.2, 0.98] });
  add(m, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), toon('#6ee7a0'), { p: [-0.2, 1.13, 0.98], r: [0.3, 0, 0] });
  const rail = add(m, new THREE.BoxGeometry(1.5, 0.04, 0.06), toon('#c0c6d4'), { p: [0, 2.42, 0] });
  const head = new THREE.Group();
  m.add(head);
  add(head, new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), toon('#c0c6d4'), { p: [0, 0.2, 0] });
  add(head, new THREE.CylinderGeometry(0.08, 0.1, 0.1, 10), toon('#c0c6d4'), { p: [0, 0, 0] });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    add(head, new THREE.BoxGeometry(0.03, 0.18, 0.03), toon('#c0c6d4'), { p: [Math.cos(a) * 0.08, -0.1, Math.sin(a) * 0.08], r: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4] });
  }
  const bulbs = [];
  for (let k = 0; k < 10; k++) bulbs.push(add(m, new THREE.SphereGeometry(0.045, 8, 6), basic('#ffffff'), { p: [-0.8 + (k / 9) * 1.6, 2.86, 0.88], cast: false }));
  anim.push((t) => {
    head.position.set(Math.sin(t * 0.7 + x) * 0.5, 2.2 - Math.max(0, Math.sin(t * 0.9 + z)) * 0.5, Math.cos(t * 0.5) * 0.4);
    rail.position.z = head.position.z;
    bulbs.forEach((b, k) => b.material.color.set(NEON[(k + Math.floor(t * 6)) % NEON.length]));
  });
  return m;
}

/** The claw machine panel: line up the claw over a plushie and drop it. */
function clawPanel(body) {
  const CW = 360, CH = 420;
  body.innerHTML = `<div class="claw">
    <h2>🕹️ Claw Machine</h2>
    <p class="muted small">Line the claw up over a plushie and drop it. Prizes are tickets, and if you're <i>really</i> lucky, the claw-only <b>Claw Plushie</b>!</p>
    <canvas width="${CW}" height="${CH}"></canvas>
    <div class="claw-ctl">
      <button class="btn" data-c="l">◀</button>
      <button class="btn primary" data-c="go"></button>
      <button class="btn" data-c="r">▶</button>
    </div>
    <p class="claw-msg center"></p>
    <p class="muted small center arc-wallet"></p>
  </div>`;
  const cv = body.querySelector('canvas'), ctx = cv.getContext('2d');
  const goBtn = body.querySelector('[data-c="go"]'), msg = body.querySelector('.claw-msg'), wallet = body.querySelector('.arc-wallet');
  const prizes = Array.from({ length: 11 }, (_, i) => ({ x: 40 + ((i * 97) % 280), y: CH - 70 - (i % 3) * 22, c: NEON[i % NEON.length] }));
  // state: idle → aim (moving the claw) → drop → (waiting on the server) → lift → idle
  const st = { phase: 'idle', x: CW / 2, y: 40, dir: 0, open: 1, held: null, result: null, timer: 0, t: 0 };
  let raf = 0, last = performance.now();
  const renderWallet = () => { wallet.innerHTML = `🪙 <b>${fmt(me()?.coins ?? 0)}</b> · 🎟️ <b>${fmt(me()?.tickets ?? 0)}</b> tickets`; };
  const renderBtn = () => {
    goBtn.textContent = st.phase === 'aim' ? '⬇ DROP!' : st.phase === 'idle' ? `🪙 ${CLAW_COST} · Play` : '…';
    goBtn.disabled = st.phase !== 'idle' && st.phase !== 'aim';
  };
  const drop = () => {
    if (st.phase !== 'aim') return;
    st.phase = 'drop';
    const near = prizes.reduce((b, p) => (Math.abs(p.x - st.x) < Math.abs(b.x - st.x) ? p : b), prizes[0]);
    st.target = near;
    const aim = Math.max(0, 1 - Math.abs(near.x - st.x) / 34);
    net.send('claw_play', { aim });
    sfx('whoosh');
    renderBtn();
  };
  const go = () => {
    if (st.phase === 'aim') return drop();
    if (st.phase !== 'idle') return;
    if ((me()?.coins ?? 0) < CLAW_COST) { msg.innerHTML = `<span class="lose">You need 🪙 ${CLAW_COST} to play.</span>`; return; }
    Object.assign(st, { phase: 'aim', timer: 12, held: null, result: null, open: 1, y: 40 });
    msg.textContent = 'Move the claw with ◀ ▶ (or the arrow keys), then DROP!';
    sfx('coin');
    renderBtn();
  };
  const finish = () => {
    const r = st.result;
    if (st.held) {
      prizes.splice(prizes.indexOf(st.held), 1);
      if (prizes.length < 6) prizes.push(...Array.from({ length: 6 }, (_, i) => ({ x: 40 + Math.random() * 230, y: CH - 70 - (i % 3) * 22, c: NEON[i % NEON.length] })));
      msg.innerHTML = r.item ? `<span class="win">🧸 You won the <b>${esc(ITEMS[r.item]?.name ?? 'prize')}</b>!</span>` : `<span class="win">🎉 You won <b>${fmt(r.tickets)}</b> tickets!</span>`;
      sfx(r.item ? 'reveal' : 'coins', { rarity: 'legendary', n: 5 });
      if (r.item) confetti(body);
    } else {
      msg.innerHTML = '<span class="lose">So close! It slipped out of the claw.</span>';
      sfx('lose');
    }
    Object.assign(st, { held: null, phase: 'idle' });
    renderBtn();
  };
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    st.t += dt;
    if (st.phase === 'aim') {
      st.x = Math.max(30, Math.min(CW - 30, st.x + st.dir * 160 * dt));
      if ((st.timer -= dt) <= 0) drop();
    } else if (st.phase === 'drop') {
      const floor = (st.target?.y ?? CH - 80) - 30;
      if (st.y < floor) st.y = Math.min(floor, st.y + 200 * dt);
      else if (st.result) {
        st.open = Math.max(0, st.open - dt * 3);
        if (st.open <= 0) { st.phase = 'lift'; st.held = st.target; }
      }
    } else if (st.phase === 'lift') {
      // up it comes (a miss slips out halfway), then over to the chute
      if (!st.result.win && st.held && st.y < 230) { st.held = null; sfx('bonk', { power: 0.3 }); }
      if (st.y > 40) st.y = Math.max(40, st.y - 160 * dt);
      else if (st.held && st.x < CW - 45) st.x = Math.min(CW - 45, st.x + 140 * dt);
      else finish();
    }
    if (st.phase === 'idle') st.open = Math.min(1, st.open + dt * 2);
    draw();
    raf = requestAnimationFrame(tick);
  };
  const draw = () => {
    const g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#1d1450'); g.addColorStop(1, '#0c0a2a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#2a1f5e'; ctx.fillRect(CW - 80, CH - 120, 70, 110); // the chute
    ctx.fillStyle = '#ffd84d'; ctx.font = '16px "Luckiest Guy", Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('PRIZE', CW - 45, CH - 130);
    for (const p of prizes) {
      if (p === st.held) continue;
      bear(p.x, p.y, p.c);
    }
    // the rail and the claw
    ctx.fillStyle = '#c0c6d4'; ctx.fillRect(0, 18, CW, 6);
    ctx.strokeStyle = '#c0c6d4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(st.x, 24); ctx.lineTo(st.x, st.y); ctx.stroke();
    ctx.fillStyle = '#e4e8f2'; ctx.fillRect(st.x - 14, st.y - 6, 28, 12);
    const spread = 6 + st.open * 16;
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(st.x + s * 10, st.y + 4); ctx.lineTo(st.x + s * spread, st.y + 26); ctx.lineTo(st.x + s * (spread - 8), st.y + 36); ctx.stroke(); }
    if (st.held) bear(st.x, st.y + 40, st.held.c);
    if (st.phase === 'aim') { ctx.fillStyle = '#fff'; ctx.font = '22px "Luckiest Guy", Rubik, sans-serif'; ctx.fillText(Math.ceil(st.timer), 24, 52); }
    // the glass
    ctx.fillStyle = 'rgba(200,235,255,.06)'; ctx.fillRect(0, 0, CW, CH);
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(40, CH); ctx.lineTo(120, 0); ctx.stroke();
  };
  const bear = (x, y, c) => {
    ctx.fillStyle = c;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * 13, y - 16, 7, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y, 20, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(x, y + 5, 9, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a1330'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * 7, y - 4, 2.5, 0, TAU); ctx.fill(); }
  };
  const hold = (dir) => (e) => { e.preventDefault(); st.dir = dir; };
  for (const [sel, dir] of [['[data-c="l"]', -1], ['[data-c="r"]', 1]]) {
    const b = body.querySelector(sel);
    b.addEventListener('pointerdown', hold(dir));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { st.dir = 0; });
  }
  goBtn.onclick = go;
  const onKey = (e) => {
    const k = e.key.toLowerCase();
    if (['arrowleft', 'a'].includes(k)) st.dir = e.type === 'keydown' ? -1 : st.dir === -1 ? 0 : st.dir;
    else if (['arrowright', 'd'].includes(k)) st.dir = e.type === 'keydown' ? 1 : st.dir === 1 ? 0 : st.dir;
    else if ((k === ' ' || k === 'enter') && e.type === 'keydown' && !e.repeat) { e.preventDefault(); go(); }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  const off = listen({
    claw_result: (m) => { st.result = m; },
    error: (m) => { if (m.for === 'claw_play') { st.phase = 'idle'; st.y = 40; renderBtn(); } },
    player: () => renderWallet(),
  });
  renderWallet();
  renderBtn();
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); off(); window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); };
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

  // ---- claw machines and the prize counter at the front ----
  clawMachine(g, 10, 7, '#ff4fd8', anim);
  clawMachine(g, 12.6, 7, '#39c6ff', anim);
  for (const x of [10, 12.6]) {
    solids.push({ x, z: 7, w: 1.9, d: 1.9 });
    stage.interactable({ x, z: 8.7, r: 1.3, label: 'play the claw machine', icon: 'arcade', use: () => stage.openPanel({ mount: (body) => clawPanel(body) }) });
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

  // ---- in the middle: air hockey tables and skee-ball lanes (just for show) and a token machine ----
  for (const [x, z] of [[-4, 0], [4, 0]]) {
    add(g, new THREE.BoxGeometry(2.0, 0.9, 3.4), toon('#2a1f5e'), { p: [x, 0.45, z], outline: true });
    add(g, new THREE.BoxGeometry(1.8, 0.04, 3.2), toon('#e6f4ff'), { p: [x, 0.92, z], cast: false });
    add(g, new THREE.BoxGeometry(1.8, 0.02, 0.04), basic('#ff4fd8'), { p: [x, 0.95, z], cast: false });
    const puck = add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14), toon('#ff3b4f'), { p: [x, 0.96, z] });
    for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.14, 0.14, 0.1, 14), toon(s < 0 ? '#39c6ff' : '#ffd84d'), { p: [x, 0.98, z + s * 1.3] });
    anim.push((t) => { puck.position.x = x + Math.sin(t * 2.3 + x) * 0.7; puck.position.z = z + Math.sin(t * 1.7) * 1.3; });
    solids.push({ x, z, w: 2.1, d: 3.5 });
  }
  for (let k = 0; k < 3; k++) {
    const x = -2 + k * 2, z = -6.5;
    const lane = new THREE.Group();
    lane.position.set(x, 0, z);
    g.add(lane);
    add(lane, new THREE.BoxGeometry(1.4, 0.8, 3.2), toon('#7c4dff'), { p: [0, 0.4, 0], outline: true });
    add(lane, new THREE.BoxGeometry(1.2, 0.05, 2.6), toon('#d8b07a'), { p: [0, 0.82, 0.2], r: [-0.12, 0, 0], cast: false });
    add(lane, new THREE.BoxGeometry(1.4, 1.6, 0.5), toon('#2a1f5e'), { p: [0, 1.2, -1.5], outline: true });
    for (const [r, y, c] of [[0.5, 1.25, '#ffd84d'], [0.32, 1.25, '#ff4fd8'], [0.15, 1.25, '#39e6ff']]) add(lane, new THREE.TorusGeometry(r, 0.04, 6, 24), basic(c), { p: [0, y, -1.24], cast: false });
    const ball = add(lane, new THREE.SphereGeometry(0.1, 10, 8), toon('#ffffff'), { p: [0, 0.95, 1] });
    anim.push((t) => { const f = (t * 0.6 + k * 0.33) % 1; ball.position.set(Math.sin(f * 9) * 0.1, 0.95 + f * 0.35 + Math.sin(f * Math.PI) * 0.3, 1.2 - f * 2.6); });
    solids.push({ x, z: z - 0.1, w: 1.5, d: 3.6 });
  }
  neonSign(g, 'SKEE-BALL', '#b77bff', { p: [0, 3.1, -8.2], w: 3.6, h: 0.8 });

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

  const walker = openWalker(stage, { w: W, d: D, solids });
  const off = listen({ arcade_board: () => board.draw() });
  stage.onFrame((dt, now) => { for (const fn of anim) fn(now / 1000, dt); });
  stage.banner(`<div class="big">🕹️ Arcade</div>Each go costs 🪙 coins and wins 🎟️ tickets. Spend them at the prize counter: new prizes every hour!`, 3500);
  return () => { off(); walker.stop(); stage.scene?.remove(g); };
}
