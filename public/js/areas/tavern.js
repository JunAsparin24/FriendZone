// The Tavern, inside the Trading Post: a cosy inn with a bar, a crackling fireplace and tables. It's the
// only place you can trade: walk up to someone and press E to ask them.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf } from '../state.js';
import { toon, basic, additive, glowTexture, flameTexture, TAU } from '../three/materials.js';
import { room, sign, add, openWalker, shopkeeper, counter } from './store.js';
import { tradeWindow } from '../games/trading.js';
import { listen } from '../games/util.js';
import { sfx } from '../sfx.js';
import { toast } from '../state.js';

function barrel(g, x, z, y = 0, lying = false) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  if (lying) b.rotation.z = Math.PI / 2;
  g.add(b);
  add(b, new THREE.CylinderGeometry(0.5, 0.5, 1.1, 16), toon('#8b5a2b'), { p: [0, 0.55, 0], outline: true });
  for (const yy of [0.18, 0.92]) add(b, new THREE.TorusGeometry(0.51, 0.04, 6, 20), toon('#3a2a1a'), { p: [0, yy, 0], r: [Math.PI / 2, 0, 0] });
  return b;
}

function table(g, x, z, anim) {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  g.add(t);
  add(t, new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20), toon('#a0703f'), { p: [0, 0.8, 0], outline: true });
  add(t, new THREE.CylinderGeometry(0.1, 0.16, 0.8, 10), toon('#6b4226'), { p: [0, 0.4, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    add(t, new THREE.CylinderGeometry(0.28, 0.25, 0.5, 12), toon('#8b5a2b'), { p: [Math.cos(a) * 1.35, 0.25, Math.sin(a) * 1.35], outline: true });
  }
  // a candle and a couple of mugs
  add(t, new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), toon('#fff6e0'), { p: [0, 0.96, 0] });
  const flame = new THREE.Sprite(additive(glowTexture, 0xffb347, 0.9));
  flame.scale.setScalar(0.35);
  flame.position.set(0, 1.12, 0);
  t.add(flame);
  anim.push((time) => { flame.scale.setScalar(0.3 + Math.sin(time * 13 + x) * 0.04); });
  for (const [mx, mz] of [[0.4, 0.2], [-0.35, -0.3]]) {
    add(t, new THREE.CylinderGeometry(0.11, 0.1, 0.24, 12), toon('#ffd84d'), { p: [mx, 0.98, mz], outline: true });
    add(t, new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12), toon('#ffffff'), { p: [mx, 1.12, mz] });
  }
  return t;
}

export function tavernArea(stage) {
  stage.lights({ background: '#140a04', sky: 0xffd8a8, ground: 0x4a2a14, hemi: 1.0, sun: 0.7, sunPos: [6, 30, 12], box: 16 });
  const W = 24, D = 18;
  const g = room(stage, {
    w: W, d: D, floor: ['#8b5a2b', '#7a4e24'], wall: '#b98a55', trim: '#5a3a1e',
    motif: (c) => { c.fillStyle = 'rgba(60,30,10,.18)'; for (let y = 0; y < 256; y += 32) c.fillRect(0, y, 256, 3); },
  });
  stage.scene.add(g);
  const anim = [];
  const solids = [];

  // the bar along the back wall, with a barkeep, taps and shelves of bottles
  counter(g, -4, -6.2, 8, '#6b4226');
  solids.push({ x: -4, z: -6.2, w: 8.2, d: 1.1 });
  shopkeeper(g, { skin: '#e8b48a', hair: 'hair_bun', hairColor: '#8b3a1e', top: 'top_hoodie', topColor: '#2f7f5e', eyes: 'eyes_happy' }, -4, -7.2, anim);
  solids.push({ x: -4, z: -7.2, r: 0.6 });
  for (let i = 0; i < 3; i++) add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8), toon('#c0c6d4'), { p: [-6 + i * 0.6, 1.4, -6.2] });
  for (const y of [1.6, 2.5]) {
    add(g, new THREE.BoxGeometry(8, 0.1, 0.5), toon('#5a3a1e'), { p: [-4, y, -D / 2 + 0.3] });
    for (let i = 0; i < 12; i++) add(g, new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), toon(['#3fa34d', '#8b1e3f', '#c9955a', '#39a0ff'][i % 4]), { p: [-7.6 + i * 0.66, y + 0.25, -D / 2 + 0.3] });
  }
  // barrels stacked in the corner
  barrel(g, 7.5, -7.8); barrel(g, 8.7, -7.8); barrel(g, 8.1, -7.8, 1.1);
  barrel(g, 10.8, -4, 0.5, true);
  solids.push({ x: 8.1, z: -7.8, w: 2.4, d: 1.2 }, { x: 10.8, z: -4, w: 1.2, d: 1.2 });

  // the fireplace on the left wall
  const fp = new THREE.Group();
  fp.position.set(-W / 2 + 0.6, 0, 2);
  fp.rotation.y = Math.PI / 2;
  g.add(fp);
  add(fp, new THREE.BoxGeometry(3.2, 3.2, 1.0), toon('#8a8599'), { p: [0, 1.6, 0], outline: true });
  add(fp, new THREE.BoxGeometry(2.0, 1.5, 0.3), basic('#1a0d06'), { p: [0, 0.9, 0.4] });
  add(fp, new THREE.BoxGeometry(3.6, 0.25, 1.3), toon('#6b4226'), { p: [0, 3.25, 0.1], outline: true });
  const fire = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Sprite(additive(flameTexture, 0xff8a2a, 0.95));
    f.scale.set(0.8, 1.1, 1);
    f.position.set((i - 1) * 0.45, 0.75, 0.5);
    fp.add(f);
    fire.push(f);
  }
  const fireLight = new THREE.PointLight(0xff8a3a, 12, 12, 1.6);
  fireLight.position.set(0, 1.2, 1.4);
  fp.add(fireLight);
  anim.push((t) => {
    fire.forEach((f, i) => { f.scale.y = 1.0 + Math.sin(t * 9 + i * 2) * 0.2; });
    fireLight.intensity = 11 + Math.sin(t * 13) * 2 + Math.sin(t * 7) * 1.5;
  });
  solids.push({ x: -W / 2 + 0.6, z: 2, w: 1.2, d: 3.4 });

  // tables with stools and candles
  for (const [x, z] of [[-5, 2], [1.5, 0.5], [6.5, 3.5], [-6.5, 6.3]]) { table(g, x, z, anim); solids.push({ x, z, r: 1.0 }); }

  // a trading notice board
  const nb = new THREE.Group();
  nb.position.set(W / 2 - 0.3, 0, 3);
  nb.rotation.y = -Math.PI / 2;
  g.add(nb);
  add(nb, new THREE.BoxGeometry(2.6, 1.8, 0.1), toon('#8b5a2b'), { p: [0, 2.0, 0], outline: true });
  ['#fff6d6', '#ffe0b0', '#ffffff', '#fff0f6'].forEach((c, i) => add(nb, new THREE.BoxGeometry(0.6, 0.7, 0.02), toon(c), { p: [-0.9 + i * 0.6, 2.0 + (i % 2 ? 0.2 : -0.15), 0.06], r: [0, 0, (i - 1.5) * 0.08] }));

  sign(g, 'THE TAVERN', { x: 0, z: -4.5, y: 4.3, w: 3.8, h: 0.9, bg: '#8b3a1e' });
  sign(g, 'TRADE HERE', { x: 6, z: 0, y: 4.3, w: 3.0, h: 0.75, bg: '#2f7f5e' });

  const walker = openWalker(stage, { w: W, d: D, solids });

  // ---- trading: a "trade with …" prompt follows whoever you're standing next to ----------------
  const spots = new Map(); // key -> interactable
  const syncPeople = () => {
    for (const [k, p] of stage.people) {
      if (k === S.me) continue;
      let it = spots.get(k);
      if (!it) {
        it = stage.interactable({ x: p.x, z: p.z, r: 1.8, label: `trade with ${nameOf(k)}`, icon: 'tavern',
          use: () => { net.send('trade_ask', { to: k }); sfx('click'); } });
        spots.set(k, it);
      }
      it.x = p.x; it.z = p.z;
    }
    for (const [k, it] of spots) {
      if (stage.people.has(k)) continue;
      stage.interactables = stage.interactables.filter((i) => i !== it);
      spots.delete(k);
    }
  };

  // someone asks you: a little card at the top of the screen
  const ask = document.createElement('div');
  ask.className = 'hud-panel trade-ask hidden';
  stage.hud.append(ask);
  let askFrom = null, askTimer = 0;
  const showAsk = (k) => {
    askFrom = k;
    ask.innerHTML = `<b>${esc(nameOf(k))}</b> wants to trade! <button class="btn primary small" data-yes>Trade</button><button class="btn ghost small" data-no>No thanks</button>`;
    ask.classList.remove('hidden');
    clearTimeout(askTimer);
    askTimer = setTimeout(() => answer(false), 20000);
  };
  const answer = (yes) => {
    if (!askFrom) return;
    net.send('trade_answer', { from: askFrom, yes });
    askFrom = null;
    ask.classList.add('hidden');
    clearTimeout(askTimer);
  };
  ask.addEventListener('click', (e) => { if (e.target.closest('[data-yes]')) answer(true); if (e.target.closest('[data-no]')) answer(false); });

  let openId = null;
  const off = listen({
    trade_asked: (m) => { sfx('near'); showAsk(m.from); },
    trade: (m) => {
      if (openId === m.id) return; // the open window keeps itself up to date
      openId = m.id;
      stage.openPanel({ wide: true, mount: (body) => tradeWindow(body, m) });
    },
    trade_done: () => { openId = null; toast('🤝 Trade complete!'); },
    trade_closed: (m) => {
      if (openId !== m.id) return;
      openId = null;
      stage.closePanel?.();
      toast(m.why, 'error');
    },
  });

  stage.onFrame((dt, now) => { syncPeople(); for (const fn of anim) fn(now / 1000, dt); });
  stage.banner('<div class="big">🍺 The Tavern</div>Walk up to a friend and press <kbd>E</kbd> to trade coins, cosmetics and furniture.', 3500);
  return () => { off(); clearTimeout(askTimer); ask.remove(); walker.stop(); stage.scene?.remove(g); };
}
