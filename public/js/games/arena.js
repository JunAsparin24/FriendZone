// Arena (3D): a blaster brawl on the sand inside the colosseum. WASD to move, the mouse aims,
// click/hold to shoot, Space/Shift to dash. Power-ups spawn on the sand. The game logic runs in
// arena pixels (900 x 600, the same units the server uses); 20 px = 1 world unit.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf, colorOf } from '../state.js';
import { toon, canvasTexture, outlineMaterial, TAU } from '../three/materials.js';
import { Sparks, FloatText, orb, groundRing, emojiSprite, crowd } from '../three/fx.js';
import { sfx } from '../sfx.js';
import { listen } from './util.js';

const AW = 900, AH = 600, PR = 14, BULLET_SPEED = 660, BULLET_LIFE = 1.1, MOVE_SPEED = 250;
const DASH_TIME = 0.16, DASH_SPEED = 820, DASH_COOLDOWN = 1.4;
const K = 20; // arena px per world unit
const PILLARS = [
  { x: 200, y: 140, w: 70, h: 60 }, { x: 630, y: 140, w: 70, h: 60 },
  { x: 200, y: 400, w: 70, h: 60 }, { x: 630, y: 400, w: 70, h: 60 },
  { x: 405, y: 265, w: 90, h: 70 },
];
const ITEM_LOOK = {
  heal: { emoji: '❤️', color: '#ff5d73', label: '+1 heart' },
  rapid: { emoji: '⚡', color: '#ffd84d', label: 'Rapid fire!' },
  shield: { emoji: '🛡️', color: '#39c6ff', label: 'Shield!' },
  speed: { emoji: '👟', color: '#6ee7a0', label: 'Speed boost!' },
};
const BUFF_TIME = { rapid: 6, shield: 5, speed: 6 };
const to3 = (x, y) => [(x - AW / 2) / K, (y - AH / 2) / K];
const inPillar = (x, y) => PILLARS.some((p) => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h);
const circleHitsPillar = (x, y) => PILLARS.some((p) => {
  const dx = Math.max(p.x - x, 0, x - (p.x + p.w)), dy = Math.max(p.y - y, 0, y - (p.y + p.h));
  return Math.hypot(dx, dy) < PR;
});

const OUT = outlineMaterial(0.04);
function add(parent, geo, mat, { p = [0, 0, 0], r = null, outline = false, cast = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (outline) m.add(new THREE.Mesh(geo, OUT));
  parent.add(m);
  return m;
}

const sandTex = canvasTexture(512, 342, (ctx) => {
  const g = ctx.createRadialGradient(256, 171, 30, 256, 171, 330);
  g.addColorStop(0, '#f0dca8');
  g.addColorStop(1, '#cfb07a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 342);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(120,90,40,.13)' : 'rgba(255,255,255,.16)';
    ctx.fillRect((i * 137.5) % 512, (i * 71.3) % 342, 2, 2);
  }
  ctx.strokeStyle = 'rgba(150,105,55,.35)';
  ctx.lineWidth = 4;
  for (const r of [85, 125]) { ctx.beginPath(); ctx.arc(256, 171, r, 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(256, 342); ctx.stroke();
});
const stoneTex = canvasTexture(128, 128, (ctx) => {
  ctx.fillStyle = '#9a92ad';
  ctx.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 4; r++) for (let x = (r % 2) * -16; x < 128; x += 32) {
    ctx.fillStyle = ['#a8a0bb', '#8e86a3', '#b3abc4'][((r + x / 32) % 3 + 3) % 3 | 0];
    ctx.fillRect(x + 1, r * 32 + 1, 30, 30);
  }
});

let env = null;
function buildArena() {
  const g = new THREE.Group();
  add(g, new THREE.PlaneGeometry(AW / K, AH / K), new THREE.MeshToonMaterial({ map: sandTex }), { r: [-Math.PI / 2, 0, 0], cast: false });
  add(g, new THREE.PlaneGeometry(140, 120), toon('#5d4a3a'), { p: [0, -0.02, 0], r: [-Math.PI / 2, 0, 0], cast: false });
  const wallMat = new THREE.MeshToonMaterial({ map: stoneTex });
  const W2 = AW / K / 2, H2 = AH / K / 2;
  for (const [x, z, w, d] of [[0, -H2 - 0.5, AW / K + 2, 1], [0, H2 + 0.5, AW / K + 2, 1], [-W2 - 0.5, 0, 1, AH / K], [W2 + 0.5, 0, 1, AH / K]]) {
    add(g, new THREE.BoxGeometry(w, 1.4, d), wallMat, { p: [x, 0.7, z], outline: true });
  }
  // tiered stands with a cheering crowd on every side
  const spots = [];
  for (let tier = 0; tier < 4; tier++) {
    const off = 2.2 + tier * 1.6, y = 1.2 + tier * 1.1;
    for (const [x, z, w, d] of [[0, -H2 - off, AW / K + off * 2, 1.6], [0, H2 + off, AW / K + off * 2, 1.6], [-W2 - off, 0, 1.6, AH / K + off * 2], [W2 + off, 0, 1.6, AH / K + off * 2]]) {
      add(g, new THREE.BoxGeometry(w, y, d), toon(tier % 2 ? '#c9b48c' : '#b39c72'), { p: [x, y / 2, z] });
    }
    for (let i = 0; i < 26; i++) {
      const t = (i + 0.5) / 26;
      spots.push({ x: -W2 - off + t * (AW / K + off * 2), y, z: -H2 - off });
      spots.push({ x: -W2 - off + t * (AW / K + off * 2), y, z: H2 + off });
      if (i < 18) {
        spots.push({ x: -W2 - off, y, z: -H2 + ((i + 0.5) / 18) * (AH / K) });
        spots.push({ x: W2 + off, y, z: -H2 + ((i + 0.5) / 18) * (AH / K) });
      }
    }
  }
  const cheer = crowd(g, spots.filter((_, i) => i % 3 !== 2));
  for (let i = 0; i < 6; i++) {
    add(g, new THREE.PlaneGeometry(1.6, 3), toon(['#d6334a', '#ffd84d', '#39c6ff'][i % 3], { side: THREE.DoubleSide }), { p: [-18 + i * 7.2, 5.5, -H2 - 8.8] });
  }
  for (const p of PILLARS) {
    const [x, z] = to3(p.x + p.w / 2, p.y + p.h / 2);
    add(g, new THREE.BoxGeometry(p.w / K, 2.6, p.h / K), wallMat, { p: [x, 1.3, z], outline: true });
    add(g, new THREE.BoxGeometry(p.w / K + 0.3, 0.3, p.h / K + 0.3), toon('#d9c7a3'), { p: [x, 2.75, z], outline: true });
  }
  return { group: g, cheer };
}

export function arena(stage) {
  env ||= buildArena();
  stage.lights({ background: '#8fd0ff', sunPos: [14, 40, 22], box: 30, hemi: 1.25 });
  stage.scene.add(env.group);
  const orbit = stage.useOrbit({ yaw: 0, pitch: 1.0, dist: 24, minDist: 14, maxDist: 34, height: 0 });
  orbit.fixed = true;
  const sparks = new Sparks(stage.scene);
  const texts = new FloatText(stage.scene);
  stage.hud.innerHTML = `
    <div class="hud-panel arena-scores"></div>
    <div class="hud-panel arena-feed hidden"></div>
    <div class="hud-panel arena-bottom"><div class="meter"><i></i><span>DASH</span></div><div class="buffs"></div></div>
    <p class="hud-panel arena-help">WASD move · mouse aim · click/hold shoot · <kbd>Space</kbd>/<kbd>Shift</kbd> dash · first to <b class="target">5</b> knockouts wins</p>`;
  const scoresEl = stage.hud.querySelector('.arena-scores'), feedEl = stage.hud.querySelector('.arena-feed');
  const dashEl = stage.hud.querySelector('.meter'), buffsEl = stage.hud.querySelector('.buffs');
  stage.canvas.style.cursor = 'crosshair';

  const fighters = new Map();
  const items = new Map();
  let bullets = [], shotId = 0, lastShot = 0, lastSend = 0, safeUntil = 0, maxHp = 3, feed = [];
  let firing = false, dash = { t: 0, cd: 0, dx: 0, dy: 0 }, aim = { x: AW / 2, y: AH / 2 };
  const picking = new Set();
  const reticle = groundRing(0.35, 0.55, '#ffffff', 0.85);
  reticle.position.y = 0.05;
  stage.scene.add(reticle);

  const renderScores = () => {
    scoresEl.innerHTML = [...fighters.entries()].sort((a, b) => b[1].score - a[1].score)
      .map(([k, f]) => `<span style="--c:${colorOf(k)}"><i class="dot"></i>${esc(nameOf(k))} <b>${f.score}</b></span>`).join('');
  };
  const addFighter = (k, f) => {
    const p = stage.person(k);
    p.char.setProp('blaster');
    p.char.aiming = true;
    fighters.set(k, { ...f, tx: f.x, ty: f.y, p, hurt: 0, buffs: {} });
  };
  const removeFighter = (k) => {
    const f = fighters.get(k);
    if (f?.bubble) stage.scene.remove(f.bubble);
    fighters.delete(k);
    stage.removePerson(k);
  };
  const burstAt = (x, y, color, n = 12, h = 1) => { const [X, Z] = to3(x, y); sparks.burst(X, h, Z, color, { n }); };

  function addItem(it) {
    const look = ITEM_LOOK[it.kind];
    const g = new THREE.Group();
    const [x, z] = to3(it.x, it.y);
    g.position.set(x, 0, z);
    const ring = groundRing(0.5, 0.75, look.color, 0.7);
    ring.position.y = 0.04;
    g.add(ring);
    const s = emojiSprite(look.emoji, 1.1);
    s.position.y = 1;
    g.add(s);
    const glow = orb(look.color, 0.12, 6);
    glow.position.y = 1;
    g.add(glow);
    stage.scene.add(g);
    items.set(it.id, { ...it, g, s });
  }
  function removeItem(id) {
    const it = items.get(id);
    if (!it) return;
    stage.scene.remove(it.g);
    items.delete(id);
    picking.delete(id);
  }

  // ---- input ---------------------------------------------------------------------
  stage.onPointer = (type) => {
    if (type === 'down') firing = true;
    if (type === 'up') firing = false;
  };
  stage.onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (down && (k === ' ' || k === 'shift') && !e.repeat) tryDash();
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
  function tryDash() {
    const mine = fighters.get(S.me);
    if (!mine || mine.hp <= 0 || dash.cd > 0) return;
    const dir = inputDir() ?? { dx: Math.cos(mine.a ?? 0), dy: Math.sin(mine.a ?? 0) };
    dash = { t: DASH_TIME, cd: DASH_COOLDOWN, ...dir };
    burstAt(mine.x, mine.y, '#ffffff', 10, 0.5);
    sfx('dash');
  }

  function spawnBullet(owner, id, x, y, a) {
    const mesh = orb(colorOf(owner), 0.14, 4);
    stage.scene.add(mesh);
    bullets.push({ owner, id, x, y, vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: BULLET_LIFE, mesh });
  }

  // ---- network --------------------------------------------------------------------
  const off = listen({
    arena: (m) => {
      for (const k of [...fighters.keys()]) removeFighter(k);
      Object.entries(m.players).forEach(([k, f]) => addFighter(k, f));
      for (const id of [...items.keys()]) removeItem(id);
      (m.items ?? []).forEach(addItem);
      stage.hud.querySelector('.target').textContent = m.target;
      maxHp = m.hp;
      safeUntil = performance.now() + 1500;
      renderScores();
    },
    arena_add: (m) => { addFighter(m.k, m); renderScores(); },
    arena_del: (m) => { removeFighter(m.k); renderScores(); },
    arena_pos: (m) => { const f = fighters.get(m.k); if (f) { f.tx = m.x; f.ty = m.y; f.a = m.a; } },
    arena_shot: (m) => {
      spawnBullet(m.k, m.id, m.x, m.y, m.a);
      sfx('shoot_far');
    },
    arena_hp: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      f.hp = m.hp;
      if (m.heal) { burstAt(f.x, f.y, '#ff9fb4', 16, 1.2); return; }
      f.hurt = performance.now();
      burstAt(f.x, f.y, '#ffffff', 10, 1.2);
      if (m.k === S.me) { stage.shake(0.5); sfx('hurt'); } else sfx('hit', { vol: 0.6 });
    },
    arena_ko: (m) => {
      const victim = fighters.get(m.k), killer = fighters.get(m.by);
      if (victim) { victim.hp = 0; burstAt(victim.x, victim.y, colorOf(m.k), 40, 1); }
      if (killer) killer.score = m.score;
      sfx('ko', { vol: m.k === S.me || m.by === S.me ? 1 : 0.5 });
      feed = [{ text: `${nameOf(m.by)} ⚔ ${nameOf(m.k)}`, at: performance.now() }, ...feed].slice(0, 4);
      renderScores();
      if (m.k === S.me) { stage.shake(0.9); stage.banner(`💥 ${esc(nameOf(m.by))} got you! Respawning…`, 1800); }
      else if (m.by === S.me) stage.banner(`⚔️ You knocked out ${esc(nameOf(m.k))}! +20 🪙`, 1800);
    },
    arena_spawn: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      Object.assign(f, { x: m.x, y: m.y, tx: m.x, ty: m.y, hp: m.hp });
      burstAt(m.x, m.y, '#9fe8ff', 16, 1);
      if (m.k === S.me) { safeUntil = performance.now() + 1500; sfx('spawn'); }
    },
    arena_round: (m) => {
      fighters.forEach((f) => { f.score = 0; });
      renderScores();
      sfx(m.winner === S.me ? 'win' : 'cheer');
      stage.banner(`<div class="big">🏆 ${esc(nameOf(m.winner))} wins the round!</div>${m.winner === S.me ? '+200 🪙' : 'Next round starting…'}`, 3500);
    },
    arena_item: (m) => { addItem(m.item); sfx('pop', { vol: 0.5 }); },
    arena_picked: (m) => {
      const it = items.get(m.id);
      if (it) burstAt(it.x, it.y, ITEM_LOOK[m.kind].color, 20, 1);
      removeItem(m.id);
      const f = fighters.get(m.k);
      if (f && BUFF_TIME[m.kind]) f.buffs[m.kind] = performance.now() + BUFF_TIME[m.kind] * 1000;
      if (m.k === S.me) {
        sfx(m.kind === 'shield' ? 'shield' : 'powerup');
        if (f) { const [x, z] = to3(f.x, f.y); texts.add(ITEM_LOOK[m.kind].label, x, 2.6, z, ITEM_LOOK[m.kind].color, 0.8); }
      }
    },
  });

  // ---- simulation --------------------------------------------------------------------
  stage.onFrame((dt, now) => {
    dash.cd = Math.max(0, dash.cd - dt);
    const mine = fighters.get(S.me);
    const has = (f, b) => (f.buffs[b] ?? 0) > now;
    const p3 = stage.pointerOnPlane(1);
    if (p3 && stage.mouseIn) aim = { x: p3.x * K + AW / 2, y: p3.z * K + AH / 2 };
    reticle.position.set((aim.x - AW / 2) / K, 0.05, (aim.y - AH / 2) / K);
    reticle.visible = !!mine && mine.hp > 0;
    if (mine && mine.hp > 0) {
      let vx = 0, vy = 0;
      const dir = inputDir();
      const speed = MOVE_SPEED * (has(mine, 'speed') ? 1.45 : 1);
      if (dash.t > 0) {
        dash.t -= dt;
        vx = dash.dx * DASH_SPEED;
        vy = dash.dy * DASH_SPEED;
        const [X, Z] = to3(mine.x, mine.y);
        sparks.puff(X, 0.9, Z, colorOf(S.me), 1.2, 0.3);
      } else if (dir) {
        vx = dir.dx * speed;
        vy = dir.dy * speed;
      }
      mine.moving = !!(vx || vy);
      if (mine.moving) {
        const nx = Math.min(AW - 20, Math.max(20, mine.x + vx * dt));
        if (!circleHitsPillar(nx, mine.y)) mine.x = nx;
        const ny = Math.min(AH - 20, Math.max(20, mine.y + vy * dt));
        if (!circleHitsPillar(mine.x, ny)) mine.y = ny;
      }
      mine.a = Math.atan2(aim.y - mine.y, aim.x - mine.x);
      if (now - lastSend > 50) {
        lastSend = now;
        net.send('arena_move', { x: mine.x, y: mine.y, a: mine.a });
      }
      if (firing && now - lastShot > (has(mine, 'rapid') ? 120 : 240)) {
        lastShot = now;
        const id = ++shotId;
        const x = mine.x + Math.cos(mine.a) * 26, y = mine.y + Math.sin(mine.a) * 26;
        spawnBullet(S.me, id, x, y, mine.a);
        burstAt(x, y, '#fff6b0', 5, 1.1);
        sfx('shoot');
        net.send('arena_shoot', { id, x, y, a: mine.a });
      }
      for (const it of items.values()) {
        if (!picking.has(it.id) && Math.hypot(it.x - mine.x, it.y - mine.y) < 28) {
          picking.add(it.id);
          net.send('arena_pick', { id: it.id });
        }
      }
    }

    const lerp = 1 - Math.exp(-dt * 14);
    for (const [k, f] of fighters) {
      if (k !== S.me) {
        const ox = f.tx - f.x, oy = f.ty - f.y;
        f.x += ox * lerp;
        f.y += oy * lerp;
        f.moving = Math.hypot(ox, oy) > 0.8;
      }
      const [x, z] = to3(f.x, f.y);
      const p = f.p;
      p.x = x;
      p.z = z;
      p.heading = Math.atan2(Math.cos(f.a ?? 0), Math.sin(f.a ?? 0));
      p.moving = !!f.moving;
      p.speed = has(f, 'speed') ? 1.9 : 1.3;
      const blink = f.hurt && now - f.hurt < 250 && Math.floor(now / 50) % 2;
      p.visible = f.hp > 0 && !blink;
      p.sub.textContent = f.hp > 0 ? '❤'.repeat(Math.max(0, f.hp)) + '♡'.repeat(Math.max(0, maxHp - f.hp)) : '';
      const shielded = has(f, 'shield') || (k === S.me && now < safeUntil);
      if (shielded && !f.bubble) {
        f.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.25, depthWrite: false }));
        stage.scene.add(f.bubble);
      }
      if (f.bubble) {
        f.bubble.visible = shielded && f.hp > 0;
        f.bubble.position.set(x, 1, z);
        f.bubble.material.opacity = 0.18 + Math.sin(now / 90) * 0.08;
      }
      if (has(f, 'speed') && f.moving && Math.random() < 0.4) sparks.puff(x, 0.3, z, '#6ee7a0', 0.6, 0.3);
    }

    bullets = bullets.filter((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const [X, Z] = to3(b.x, b.y);
      b.mesh.position.set(X, 1.1, Z);
      let dead = b.life <= 0 || b.x < 14 || b.x > AW - 14 || b.y < 14 || b.y > AH - 14 || inPillar(b.x, b.y);
      if (!dead) {
        for (const [k, f] of fighters) {
          if (k === b.owner || f.hp <= 0 || Math.hypot(f.x - b.x, f.y - b.y) > PR + 6) continue;
          dead = true;
          // only the player who got hit reports it, so everyone agrees on one source of truth
          if (k === S.me && now > safeUntil && !has(f, 'shield')) net.send('arena_hit', { by: b.owner, id: b.id });
          else if (has(f, 'shield')) sparks.burst(X, 1.1, Z, '#9fe8ff', { n: 8 });
          break;
        }
      }
      if (dead) {
        sparks.burst(X, 1.1, Z, colorOf(b.owner), { n: 6, speed: 3 });
        stage.scene.remove(b.mesh);
        return false;
      }
      return true;
    });

    for (const it of items.values()) it.s.position.y = 1 + Math.sin(now / 250 + it.id) * 0.2;
    const mineF = fighters.get(S.me);
    if (mineF) {
      const [x, z] = to3(mineF.x, mineF.y);
      orbit.target.set(x * 0.7, 0, z * 0.7 + 2);
    }
    env.cheer(now / 1000, fighters.size > 1 ? 1.2 : 0.4);
    sparks.update(dt);
    texts.update(dt);

    const ready = 1 - dash.cd / DASH_COOLDOWN;
    dashEl.querySelector('i').style.width = `${ready * 100}%`;
    dashEl.classList.toggle('ready', ready >= 1);
    buffsEl.innerHTML = mineF ? Object.entries(mineF.buffs).filter(([, until]) => until > now)
      .map(([b, until]) => `<span>${ITEM_LOOK[b].emoji} ${Math.ceil((until - now) / 1000)}s</span>`).join('') : '';
    feed = feed.filter((e) => now - e.at < 5000);
    feedEl.innerHTML = feed.map((e) => `<div>${esc(e.text)}</div>`).join('');
    feedEl.classList.toggle('hidden', !feed.length);
  });

  return () => {
    off();
    for (const b of bullets) stage.scene?.remove(b.mesh);
    stage.canvas.style.cursor = '';
    stage.scene?.remove(env.group);
  };
}
