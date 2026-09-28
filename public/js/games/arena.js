// Arena: top-down blaster brawl. WASD to move, mouse to aim, click to shoot, Space/Shift to dash.
import { net } from '../net.js';
import { S, esc, nameOf, colorOf } from '../state.js';
import { drawPerson, nameTag } from '../avatar.js';
import { $, TAU, listen, hiDpiCanvas, loop } from './util.js';

const AW = 900, AH = 600, PR = 14, BULLET_SPEED = 660, BULLET_LIFE = 1.1, MOVE_SPEED = 250;
const DASH_TIME = 0.16, DASH_SPEED = 820, DASH_COOLDOWN = 1.4;
const PILLARS = [
  { x: 200, y: 140, w: 70, h: 60 }, { x: 630, y: 140, w: 70, h: 60 },
  { x: 200, y: 400, w: 70, h: 60 }, { x: 630, y: 400, w: 70, h: 60 },
  { x: 405, y: 265, w: 90, h: 70 },
];
const PILLAR_H = 34;
const inPillar = (x, y) => PILLARS.some((p) => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h);
const circleHitsPillar = (x, y) => PILLARS.some((p) => {
  const dx = Math.max(p.x - x, 0, x - (p.x + p.w)), dy = Math.max(p.y - y, 0, y - (p.y + p.h));
  return Math.hypot(dx, dy) < PR;
});

function renderFloor() {
  const c = document.createElement('canvas');
  const s = Math.min(2, window.devicePixelRatio || 1);
  c.width = AW * s;
  c.height = AH * s;
  const ctx = c.getContext('2d');
  ctx.scale(s, s);
  const g = ctx.createRadialGradient(AW / 2, AH / 2, 50, AW / 2, AH / 2, AW * 0.65);
  g.addColorStop(0, '#e9d3a0');
  g.addColorStop(1, '#c9ab72');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, AW, AH);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(120,90,40,.12)' : 'rgba(255,255,255,.14)';
    ctx.fillRect((i * 137.5) % AW, (i * 71.3) % AH, 2, 2);
  }
  ctx.strokeStyle = 'rgba(140,100,50,.35)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(AW / 2, AH / 2, 150, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(AW / 2, AH / 2, 220, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#8d7a5e';
  ctx.fillRect(0, 0, AW, 14);
  ctx.fillRect(0, AH - 14, AW, 14);
  ctx.fillRect(0, 0, 14, AH);
  ctx.fillRect(AW - 14, 0, 14, AH);
  ctx.fillStyle = '#a8957a';
  for (let x = 0; x < AW; x += 40) { ctx.fillRect(x + 2, 2, 36, 10); ctx.fillRect(x + 2, AH - 12, 36, 10); }
  return c;
}

export function arena(body) {
  body.innerHTML = `
    <div class="arena-head"><h2>⚔️ Arena</h2><div class="arena-score"></div></div>
    <div class="arena-wrap"><canvas class="arena-canvas"></canvas><div class="arena-banner hidden"></div></div>
    <p class="muted small">WASD move · mouse aim · click/hold shoot · <kbd>Space</kbd>/<kbd>Shift</kbd> dash · first to <b class="target">5</b> knockouts wins the round.</p>`;
  const canvas = $(body, 'canvas'), scoreEl = $(body, '.arena-score'), banner = $(body, '.arena-banner');
  const ctx = hiDpiCanvas(canvas, AW, AH);
  const floor = renderFloor();
  const fighters = new Map();
  const keys = new Set();
  let bullets = [], sparks = [], feed = [], shotId = 0, lastShot = 0, lastSend = 0;
  let mouse = { x: AW / 2, y: AH / 2 }, firing = false, safeUntil = 0, maxHp = 3, bannerTimer = 0;
  let shake = 0, dash = { t: 0, cd: 0, dx: 0, dy: 0 };

  const flash = (html, ms = 1800) => {
    banner.innerHTML = html;
    banner.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.add('hidden'), ms);
  };
  const renderScores = () => {
    scoreEl.innerHTML = [...fighters.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .map(([k, f]) => `<span style="--c:${colorOf(k)}"><i class="dot"></i>${esc(nameOf(k))} <b>${f.score}</b></span>`)
      .join('');
  };
  const addFighter = (k, f) => fighters.set(k, { ...f, tx: f.x, ty: f.y, face: 1, walk: 0, moving: false });
  const burst = (x, y, color, n = 12, speed = 200) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.3, color });
    }
  };

  const toArena = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * AW, y: ((e.clientY - rect.top) / rect.height) * AH };
  };
  canvas.onpointermove = (e) => { mouse = toArena(e); };
  canvas.onpointerdown = (e) => { mouse = toArena(e); firing = true; };
  const stopFiring = () => { firing = false; };
  window.addEventListener('pointerup', stopFiring);
  const onDown = (e) => {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); }
    if ((k === ' ' || k === 'shift') && !e.repeat) { e.preventDefault(); tryDash(); }
  };
  const onUp = (e) => keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);

  function inputDir() {
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
    burst(mine.x, mine.y, 'rgba(255,255,255,.8)', 10, 120);
  }

  const off = listen({
    arena: (m) => {
      fighters.clear();
      Object.entries(m.players).forEach(([k, f]) => addFighter(k, f));
      $(body, '.target').textContent = m.target;
      maxHp = m.hp;
      safeUntil = performance.now() + 1500;
      renderScores();
    },
    arena_add: (m) => { addFighter(m.k, m); renderScores(); },
    arena_del: (m) => { fighters.delete(m.k); renderScores(); },
    arena_pos: (m) => {
      const f = fighters.get(m.k);
      if (f) { f.tx = m.x; f.ty = m.y; f.a = m.a; }
    },
    arena_shot: (m) => {
      bullets.push({ owner: m.k, id: m.id, x: m.x, y: m.y, vx: Math.cos(m.a) * BULLET_SPEED, vy: Math.sin(m.a) * BULLET_SPEED, life: BULLET_LIFE });
      burst(m.x, m.y, colorOf(m.k), 4, 90);
    },
    arena_hp: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      f.hp = m.hp;
      f.hurt = performance.now();
      burst(f.x, f.y - 20, '#fff', 10, 180);
      if (m.k === S.me) shake = 10;
    },
    arena_ko: (m) => {
      const victim = fighters.get(m.k), killer = fighters.get(m.by);
      if (victim) { victim.hp = 0; burst(victim.x, victim.y - 20, colorOf(m.k), 34, 300); }
      if (killer) killer.score = m.score;
      feed = [{ text: `${nameOf(m.by)} ⚔ ${nameOf(m.k)}`, at: performance.now() }, ...feed].slice(0, 4);
      renderScores();
      if (m.k === S.me) { shake = 16; flash(`💥 ${esc(nameOf(m.by))} got you! Respawning…`); }
      else if (m.by === S.me) flash(`⚔️ You knocked out ${esc(nameOf(m.k))}! +20 🪙`);
    },
    arena_spawn: (m) => {
      const f = fighters.get(m.k);
      if (!f) return;
      Object.assign(f, { x: m.x, y: m.y, tx: m.x, ty: m.y, hp: m.hp });
      burst(m.x, m.y - 20, '#9fe8ff', 16, 140);
      if (m.k === S.me) safeUntil = performance.now() + 1500;
    },
    arena_round: (m) => {
      fighters.forEach((f) => { f.score = 0; });
      renderScores();
      flash(`<div class="big">🏆 ${esc(nameOf(m.winner))} wins the round!</div>${m.winner === S.me ? '+200 🪙' : 'Next round starting…'}`, 3500);
    },
  });

  function update(dt, now) {
    dash.cd = Math.max(0, dash.cd - dt);
    shake = Math.max(0, shake - dt * 40);
    const mine = fighters.get(S.me);
    if (mine && mine.hp > 0) {
      let vx = 0, vy = 0;
      const dir = inputDir();
      if (dash.t > 0) {
        dash.t -= dt;
        vx = dash.dx * DASH_SPEED;
        vy = dash.dy * DASH_SPEED;
        sparks.push({ x: mine.x, y: mine.y - 18, vx: 0, vy: 0, life: 0.25, color: colorOf(S.me), ghost: true });
      } else if (dir) {
        vx = dir.dx * MOVE_SPEED;
        vy = dir.dy * MOVE_SPEED;
      }
      mine.moving = !!(vx || vy);
      if (mine.moving) {
        const nx = Math.min(AW - 20, Math.max(20, mine.x + vx * dt));
        if (!circleHitsPillar(nx, mine.y)) mine.x = nx;
        const ny = Math.min(AH - 16, Math.max(36, mine.y + vy * dt));
        if (!circleHitsPillar(mine.x, ny)) mine.y = ny;
        mine.walk += dt * 14;
      }
      mine.a = Math.atan2(mouse.y - (mine.y - 22), mouse.x - mine.x);
      mine.face = Math.cos(mine.a) >= 0 ? 1 : -1;
      if (now - lastSend > 50) {
        lastSend = now;
        net.send('arena_move', { x: mine.x, y: mine.y, a: mine.a });
      }
      if (firing && now - lastShot > 240) {
        lastShot = now;
        const id = ++shotId;
        const x = mine.x + Math.cos(mine.a) * 26, y = mine.y - 22 + Math.sin(mine.a) * 26;
        bullets.push({ owner: S.me, id, x, y, vx: Math.cos(mine.a) * BULLET_SPEED, vy: Math.sin(mine.a) * BULLET_SPEED, life: BULLET_LIFE });
        burst(x, y, '#fff6b0', 5, 100);
        net.send('arena_shoot', { id, x, y, a: mine.a });
      }
    }

    const lerp = 1 - Math.exp(-dt * 14);
    for (const [k, f] of fighters) {
      if (k === S.me) continue;
      const ox = f.tx - f.x, oy = f.ty - f.y;
      f.x += ox * lerp;
      f.y += oy * lerp;
      f.face = Math.cos(f.a || 0) >= 0 ? 1 : -1;
      f.moving = Math.hypot(ox, oy) > 0.8;
      if (f.moving) f.walk += dt * 14;
    }

    bullets = bullets.filter((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 14 || b.x > AW - 14 || b.y < 14 || b.y > AH - 14 || inPillar(b.x, b.y + 22)) {
        burst(b.x, b.y, colorOf(b.owner), 6, 120);
        return false;
      }
      for (const [k, f] of fighters) {
        if (k === b.owner || f.hp <= 0 || Math.hypot(f.x - b.x, f.y - 20 - b.y) > PR + 6) continue;
        // Only the player who got hit reports it, so everyone agrees on one source of truth.
        if (k === S.me && now > safeUntil) net.send('arena_hit', { by: b.owner, id: b.id });
        return false;
      }
      return true;
    });
    sparks = sparks.filter((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.92;
      s.vy *= 0.92;
      return (s.life -= dt) > 0;
    });
  }

  function draw(now) {
    ctx.save();
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.drawImage(floor, 0, 0, AW, AH);

    const drawables = [];
    for (const p of PILLARS) drawables.push({ y: p.y + p.h, pillar: p });
    for (const [k, f] of fighters) drawables.push({ y: f.y, k, f });
    drawables.sort((a, b) => a.y - b.y);

    for (const b of bullets) {
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      ctx.beginPath(); ctx.ellipse(b.x, b.y + 22, 5, 2, 0, 0, TAU); ctx.fill();
    }
    for (const d of drawables) {
      if (d.pillar) {
        const p = d.pillar;
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.fillRect(p.x + 6, p.y + 8, p.w, p.h);
        ctx.fillStyle = '#7d7590';
        ctx.fillRect(p.x, p.y - PILLAR_H + p.h * 0.4, p.w, p.h * 0.6 + PILLAR_H);
        ctx.fillStyle = '#a49cb8';
        ctx.fillRect(p.x, p.y - PILLAR_H, p.w, p.h * 0.4 + 2);
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        ctx.fillRect(p.x, p.y - PILLAR_H, p.w, 4);
        ctx.strokeStyle = 'rgba(20,15,30,.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x, p.y - PILLAR_H, p.w, p.h + PILLAR_H);
        continue;
      }
      const { k, f } = d;
      if (f.hp <= 0) {
        drawPerson(ctx, f.x, f.y, S.players[k]?.look, { alpha: 0.3, time: now, face: f.face });
        continue;
      }
      if (k === S.me && now < safeUntil) {
        ctx.strokeStyle = `rgba(120,220,255,${0.5 + Math.sin(now / 80) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(f.x, f.y - 22, 22, 30, 0, 0, TAU); ctx.stroke();
      }
      const hurt = f.hurt && now - f.hurt < 180;
      drawPerson(ctx, f.x, f.y, S.players[k]?.look, {
        face: f.face, walk: f.walk, moving: f.moving, time: now, aim: f.a ?? 0, alpha: hurt && Math.floor(now / 40) % 2 ? 0.35 : 1,
      });
    }
    for (const b of bullets) {
      const col = colorOf(b.owner);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    for (const s of sparks) {
      ctx.globalAlpha = Math.min(1, s.life * 2.5) * (s.ghost ? 0.4 : 1);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.ghost ? 12 : 2.5, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const [k, f] of fighters) {
      if (f.hp <= 0) continue;
      nameTag(ctx, f.x, f.y - 62, nameOf(k), '❤'.repeat(f.hp) + '♡'.repeat(Math.max(0, maxHp - f.hp)), colorOf(k));
    }
    ctx.restore();

    // hud: kill feed + dash meter + crosshair
    feed = feed.filter((e) => now - e.at < 5000);
    feed.forEach((e, i) => {
      ctx.font = '700 12px Rubik, sans-serif';
      const w = ctx.measureText(e.text).width + 20;
      ctx.fillStyle = 'rgba(13,31,74,.7)';
      ctx.beginPath(); ctx.roundRect(AW - w - 18, 20 + i * 26, w, 22, 11); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(e.text, AW - w - 8, 35 + i * 26);
    });
    const ready = 1 - dash.cd / DASH_COOLDOWN;
    ctx.fillStyle = 'rgba(13,31,74,.7)';
    ctx.beginPath(); ctx.roundRect(20, AH - 44, 110, 24, 12); ctx.fill();
    ctx.fillStyle = ready >= 1 ? '#6ee7a0' : '#6b7194';
    ctx.beginPath(); ctx.roundRect(24, AH - 40, 102 * ready, 16, 8); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 11px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ready >= 1 ? 'DASH READY' : 'DASH', 75, AH - 28);
    const mine = fighters.get(S.me);
    if (mine && mine.hp > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 9, 0, TAU);
      ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y);
      ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y);
      ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y - 5);
      ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 14);
      ctx.stroke();
    }
  }

  const stop = loop((dt, now) => { update(dt, now); draw(now); });
  return () => {
    stop();
    clearTimeout(bannerTimer);
    off();
    window.removeEventListener('pointerup', stopFiring);
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
  };
}
