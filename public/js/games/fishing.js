// Stardew-style fishing: charge a cast, hook the bite, then hold to keep your bar on the fish.
// How well you track the fish decides how rare your catch is.
import { net } from '../net.js';
import { me, esc } from '../state.js';
import { CATALOG, RARITY } from '../catalog.js';
import { drawPerson } from '../avatar.js';
import { $, TAU, clamp, listen, onKeys, hiDpiCanvas, loop, confetti, Popups } from './util.js';

const CW = 580, CH = 400;
const WATER_Y = 150;
const TRACK = { x: 452, y: 46, w: 44, h: 300 };
const BAR_H = 74;
const HINTS = {
  idle: 'Hold <kbd>click</kbd> or <kbd>Space</kbd> to charge your cast, release to throw.',
  charging: 'Release to cast! Farther casts find better fish.',
  casting: 'Casting…',
  waiting: 'Wait for a bite… don\'t reel too early!',
  bite: '<b>Click now</b> to hook it!',
  reeling: '<b>Hold</b> to raise the green bar, let go to drop it. Keep the fish inside!',
  landing: 'Reeling it in…',
  result: 'Click to cast again.',
};

export function fishing(body) {
  body.innerHTML = `
    <h2>🎣 Fishing Pond</h2>
    <div class="game-canvas-wrap"><canvas class="fish-canvas"></canvas></div>
    <p class="hint muted small"></p>
    <button class="btn small ghost journal-btn"></button>
    <div class="journal hidden"></div>`;
  const canvas = $(body, 'canvas'), hint = $(body, '.hint'), journal = $(body, '.journal'), journalBtn = $(body, '.journal-btn');
  const ctx = hiDpiCanvas(canvas, CW, CH);
  const popups = new Popups();
  const splashes = [];

  let state = 'idle', holding = false, power = 0, chargeT = 0;
  let bobber = { x: 0, y: 0 }, cast = null, timer = 0;
  let game = null, result = null, message = '', messageT = 0;

  const setState = (s) => {
    state = s;
    hint.innerHTML = HINTS[s] ?? '';
  };
  const say = (text) => { message = text; messageT = 2.2; };
  setState('idle');

  const rodTip = () => ({ x: 148, y: 132 });

  function renderJournal() {
    const dex = me().fishdex ?? {};
    const found = CATALOG.fish.filter((f) => dex[f.name]).length;
    journalBtn.textContent = `📖 Fish Journal (${found}/${CATALOG.fish.length})`;
    journal.innerHTML = CATALOG.fish.map((f) => {
      const d = dex[f.name];
      const r = RARITY[f.rarity];
      return `<div class="jcard ${d ? '' : 'unknown'}" style="--r:${r.color}">
        <div class="jemoji">${d ? f.emoji : '❓'}</div>
        <div class="jname">${d ? esc(f.name) : '???'}</div>
        <div class="jrar">${r.label}</div>
        ${d ? `<div class="jmeta">×${d.n} · best ${d.best}"</div>` : ''}
      </div>`;
    }).join('');
  }
  journalBtn.onclick = () => journal.classList.toggle('hidden');
  renderJournal();

  function press() {
    holding = true;
    if (state === 'idle') { chargeT = 0; setState('charging'); }
    else if (state === 'waiting') { say('Too early! You spooked it.'); reset(); }
    else if (state === 'bite') startReeling();
    else if (state === 'result') reset();
  }
  function release() {
    holding = false;
    if (state === 'charging') {
      const target = { x: 190 + power * 220, y: 215 + power * 40 };
      cast = { from: rodTip(), to: target, t: 0 };
      setState('casting');
    }
  }
  function reset() {
    setState('idle');
    game = null;
    result = null;
    holding = false;
  }

  function startReeling() {
    const difficulty = 0.35 + Math.random() * 0.6;
    game = {
      d: difficulty, bar: 40, vel: 0, fish: TRACK.h / 2, target: TRACK.h / 2, retarget: 0.5,
      progress: 0.3, on: 0, total: 0, treasure: Math.random() < 0.3 ? { at: 1 + Math.random() * 2, y: 0, p: 0, life: 6, shown: false, got: false } : null,
    };
    popups.add('HOOKED!', bobber.x, bobber.y - 20, '#ffd84d', 22);
    setState('reeling');
  }

  function splash(x, y, n = 10) {
    for (let i = 0; i < n; i++) splashes.push({ x, y, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 120, life: 0.7 });
  }

  // ---- update ---------------------------------------------------------------

  function update(dt, now) {
    if (messageT > 0) messageT -= dt;
    if (state === 'charging') {
      chargeT += dt;
      power = Math.abs(Math.sin(chargeT * 2.2));
    } else if (state === 'casting') {
      cast.t += dt / 0.6;
      const p = Math.min(1, cast.t);
      bobber = { x: cast.from.x + (cast.to.x - cast.from.x) * p, y: cast.from.y + (cast.to.y - cast.from.y) * p - Math.sin(p * Math.PI) * 70 };
      if (p >= 1) {
        splash(bobber.x, bobber.y);
        timer = 1.4 + Math.random() * 3.6 - power * 0.8;
        setState('waiting');
      }
    } else if (state === 'waiting') {
      timer -= dt;
      if (timer <= 0) {
        splash(bobber.x, bobber.y, 14);
        timer = 1.0;
        setState('bite');
      }
    } else if (state === 'bite') {
      timer -= dt;
      if (timer <= 0) { say('It got away…'); reset(); }
    } else if (state === 'reeling') {
      updateReel(dt, now);
    }
    for (const s of splashes) { s.vy += 400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    for (let i = splashes.length - 1; i >= 0; i--) if (splashes[i].life <= 0) splashes.splice(i, 1);
  }

  function updateReel(dt, now) {
    const g = game;
    g.vel += (holding ? 1150 : -900) * dt;
    g.vel = clamp(g.vel, -480, 480);
    g.bar += g.vel * dt;
    if (g.bar < 0) { g.bar = 0; g.vel = Math.abs(g.vel) > 60 ? -g.vel * 0.35 : 0; }
    if (g.bar > TRACK.h - BAR_H) { g.bar = TRACK.h - BAR_H; g.vel = -Math.abs(g.vel) * 0.2; }

    g.retarget -= dt;
    if (g.retarget <= 0) {
      const dart = Math.random() < g.d * 0.4;
      g.target = dart ? clamp(g.fish + (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 120), 12, TRACK.h - 12) : 12 + Math.random() * (TRACK.h - 24);
      g.retarget = dart ? 0.25 : 0.4 + Math.random() * (1.5 - g.d);
    }
    g.fish += (g.target - g.fish) * Math.min(1, dt * (1.4 + g.d * 4.2)) + Math.sin(now / 55) * g.d * 0.7;
    g.fish = clamp(g.fish, 8, TRACK.h - 8);

    const inside = (y) => y >= g.bar - 4 && y <= g.bar + BAR_H + 4;
    const on = inside(g.fish);
    g.onBar = on;
    g.total += dt;
    if (on) g.on += dt;
    g.progress += on ? 0.32 * dt : -(0.2 + g.d * 0.14) * dt;

    const t = g.treasure;
    if (t && !t.got) {
      if (!t.shown && g.total > t.at) { t.shown = true; t.y = 30 + Math.random() * (TRACK.h - 60); }
      if (t.shown) {
        t.life -= dt;
        t.p = clamp(t.p + (inside(t.y) ? 0.55 : -0.15) * dt, 0, 1);
        if (t.p >= 1) { t.got = true; popups.add('TREASURE!', TRACK.x + TRACK.w / 2, TRACK.y + TRACK.h - t.y, '#ffc53d', 16); }
        if (t.life <= 0) g.treasure = null;
      }
    }

    if (g.progress >= 1) {
      const acc = g.on / g.total;
      const perfect = acc > 0.97;
      const q = clamp(acc * 0.8 + power * 0.1 + g.d * 0.15 - 0.05 + (perfect ? 0.08 : 0), 0, 1);
      if (perfect) popups.add('PERFECT!', 250, 120, '#6ee7a0', 26);
      net.send('fish', { q, treasure: !!g.treasure?.got });
      setState('landing');
    } else if (g.progress <= 0) {
      say('The fish escaped!');
      reset();
    }
  }

  // ---- drawing --------------------------------------------------------------

  function draw(dt, now) {
    const t = now / 1000;
    const sky = ctx.createLinearGradient(0, 0, 0, WATER_Y);
    sky.addColorStop(0, '#7ec8ff');
    sky.addColorStop(1, '#d8f1ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CW, WATER_Y);
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath(); ctx.arc(480, 40, 22, 0, TAU); ctx.fill();
    for (const [x, s] of [[80, 1], [300, 0.8], [520, 1.2]]) {
      const cx = (x + t * 6 * s) % (CW + 120) - 60;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (const [dx, r] of [[0, 14], [14, 18], [30, 13]]) { ctx.beginPath(); ctx.arc(cx + dx, 44 + s * 10, r * s, 0, TAU); ctx.fill(); }
    }
    ctx.fillStyle = '#4f9a5a';
    ctx.beginPath();
    ctx.moveTo(0, WATER_Y);
    for (let x = 0; x <= CW; x += 20) ctx.lineTo(x, WATER_Y - 18 - Math.abs(Math.sin(x * 0.07)) * 22);
    ctx.lineTo(CW, WATER_Y);
    ctx.fill();
    ctx.fillStyle = '#3b7f47';
    ctx.beginPath();
    ctx.moveTo(0, WATER_Y);
    for (let x = 0; x <= CW; x += 14) ctx.lineTo(x, WATER_Y - 6 - Math.abs(Math.sin(x * 0.11 + 1)) * 12);
    ctx.lineTo(CW, WATER_Y);
    ctx.fill();

    const water = ctx.createLinearGradient(0, WATER_Y, 0, CH);
    water.addColorStop(0, '#4aa3e6');
    water.addColorStop(1, '#1c5aa0');
    ctx.fillStyle = water;
    ctx.fillRect(0, WATER_Y, CW, CH - WATER_Y);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = WATER_Y + 16 + (i * 37) % (CH - WATER_Y - 20);
      const x = ((i * 91 + t * (12 + i)) % (CW + 60)) - 30;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10, y - 3, x + 20, y); ctx.stroke();
    }

    // dock + fisher
    ctx.fillStyle = '#6b4226';
    for (const x of [18, 70, 118]) ctx.fillRect(x, 272, 8, 90);
    ctx.fillStyle = '#a0703f';
    ctx.fillRect(0, 262, 132, 14);
    ctx.fillStyle = '#7a4f2a';
    for (let x = 0; x < 132; x += 16) ctx.fillRect(x, 262, 2, 14);
    const reeling = state === 'reeling' || state === 'landing';
    drawPerson(ctx, 72, 264, me().look, { scale: 1.6, face: 1, fishing: true });

    // rod and line
    const hand = { x: 84, y: 232 };
    let tip = rodTip();
    if (reeling) tip = { x: 140 + Math.sin(now / 60) * 2, y: 150 + (game?.onBar ? 6 : 14) };
    if (state === 'charging') tip = { x: 110 - power * 30, y: 118 - power * 6 };
    ctx.strokeStyle = '#3b2a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hand.x, hand.y);
    ctx.quadraticCurveTo((hand.x + tip.x) / 2 + 4, (hand.y + tip.y) / 2 - (reeling ? -8 : 6), tip.x, tip.y);
    ctx.stroke();
    if (state !== 'idle' && state !== 'charging') {
      const wobble = state === 'waiting' ? Math.sin(now / 300) * 2 : 0;
      const dip = state === 'bite' ? 6 + Math.sin(now / 40) * 3 : reeling ? 4 : 0;
      const bx = bobber.x, by = bobber.y + wobble + dip;
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo((tip.x + bx) / 2, Math.max(tip.y, by) + (reeling ? -10 : 18), bx, by);
      ctx.stroke();
      if (state !== 'casting') {
        ctx.strokeStyle = 'rgba(255,255,255,.4)';
        ctx.beginPath(); ctx.ellipse(bx, by + 4, 12 + Math.sin(now / 200) * 2, 3, 0, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath(); ctx.arc(bx, by, 6, Math.PI, TAU); ctx.fill();
    }
    if (state === 'bite') {
      const s = 1 + Math.sin(now / 60) * 0.1;
      ctx.save();
      ctx.translate(72, 168);
      ctx.scale(s, s);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.roundRect(-16, -20, 32, 32, 10); ctx.fill();
      ctx.fillStyle = '#ff4d4d';
      ctx.font = '900 26px Rubik, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, 5);
      ctx.restore();
    }
    if (state === 'charging') {
      ctx.fillStyle = 'rgba(13,31,74,.75)';
      ctx.beginPath(); ctx.roundRect(14, 120, 22, 124, 8); ctx.fill();
      const g = ctx.createLinearGradient(0, 240, 0, 124);
      g.addColorStop(0, '#ff5d73');
      g.addColorStop(0.5, '#ffd84d');
      g.addColorStop(1, '#6ee7a0');
      ctx.fillStyle = g;
      ctx.fillRect(18, 240 - power * 116, 14, power * 116);
    }
    for (const s of splashes) {
      ctx.fillStyle = `rgba(220,240,255,${s.life})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, TAU); ctx.fill();
    }
    if (game && reeling) drawMinigame(now);
    popups.draw(ctx, dt);

    if (messageT > 0) banner(message, 1);
    if (state === 'idle' && messageT <= 0) banner('Hold to charge your cast', 0.8);
    if (state === 'result' && result) drawResult(now);
  }

  function drawMinigame(now) {
    const g = game, T = TRACK;
    const shake = g.onBar ? 0 : Math.sin(now / 25) * 1.5;
    ctx.save();
    ctx.translate(shake, 0);
    ctx.fillStyle = '#7a4a28';
    ctx.beginPath(); ctx.roundRect(T.x - 16, T.y - 16, T.w + 60, T.h + 32, 14); ctx.fill();
    ctx.strokeStyle = '#4a2c14';
    ctx.lineWidth = 3;
    ctx.stroke();
    const tg = ctx.createLinearGradient(0, T.y, 0, T.y + T.h);
    tg.addColorStop(0, '#5bb8f0');
    tg.addColorStop(1, '#1b4f8f');
    ctx.fillStyle = tg;
    ctx.fillRect(T.x, T.y, T.w, T.h);

    const barTop = T.y + T.h - g.bar - BAR_H;
    ctx.fillStyle = g.onBar ? 'rgba(110,231,120,.75)' : 'rgba(110,231,120,.45)';
    ctx.fillRect(T.x + 2, barTop, T.w - 4, BAR_H);
    ctx.strokeStyle = g.onBar ? '#c8ffc8' : '#6ee7a0';
    ctx.lineWidth = 2;
    ctx.strokeRect(T.x + 2, barTop, T.w - 4, BAR_H);

    if (g.treasure?.shown && !g.treasure.got) {
      const ty = T.y + T.h - g.treasure.y;
      ctx.font = '20px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎁', T.x + T.w / 2, ty);
      ctx.fillStyle = '#ffc53d';
      ctx.fillRect(T.x + 6, ty + 13, (T.w - 12) * g.treasure.p, 3);
    }
    const fy = T.y + T.h - g.fish;
    ctx.save();
    ctx.translate(T.x + T.w / 2, fy);
    ctx.rotate(Math.sin(now / 90) * 0.25);
    ctx.fillStyle = g.d > 0.75 ? '#ff9f43' : '#ffe27a';
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-17, -7); ctx.lineTo(-17, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0b1a3d';
    ctx.beginPath(); ctx.arc(5, -2, 1.8, 0, TAU); ctx.fill();
    ctx.restore();

    const px = T.x + T.w + 12, pw = 14;
    ctx.fillStyle = '#2a1a0c';
    ctx.fillRect(px, T.y, pw, T.h);
    const p = clamp(g.progress, 0, 1);
    ctx.fillStyle = p < 0.33 ? '#ff5d73' : p < 0.66 ? '#ffd84d' : '#6ee7a0';
    ctx.fillRect(px + 2, T.y + T.h - p * T.h, pw - 4, p * T.h);
    ctx.restore();

    ctx.fillStyle = 'rgba(13,31,74,.75)';
    ctx.beginPath(); ctx.roundRect(T.x - 16, T.y + T.h + 22, T.w + 60, 22, 8); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 11px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const acc = g.total ? Math.round((g.on / g.total) * 100) : 100;
    ctx.fillText(`On fish ${acc}%`, T.x + T.w / 2 + 14, T.y + T.h + 37);
  }

  function banner(text, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 15px Rubik, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 30;
    ctx.fillStyle = 'rgba(13,31,74,.8)';
    ctx.beginPath(); ctx.roundRect(290 - w / 2, 12, w, 30, 15); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 290, 32);
    ctx.restore();
  }

  function drawResult(now) {
    const f = result.fish, r = RARITY[f.rarity];
    const pop = Math.min(1, (now - result.at) / 250);
    ctx.save();
    ctx.fillStyle = `rgba(8,10,25,${0.55 * pop})`;
    ctx.fillRect(0, 0, CW, CH);
    ctx.translate(CW / 2, CH / 2);
    ctx.scale(0.8 + pop * 0.2, 0.8 + pop * 0.2);
    ctx.shadowColor = r.color;
    ctx.shadowBlur = f.rarity === 'legendary' || f.rarity === 'epic' ? 30 + Math.sin(now / 150) * 10 : 12;
    ctx.fillStyle = '#1a3d85';
    ctx.beginPath(); ctx.roundRect(-150, -120, 300, 240, 20); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '56px serif';
    ctx.fillText(f.emoji, 0, -40 + Math.sin(now / 300) * 3);
    ctx.fillStyle = r.color;
    ctx.font = '900 13px Rubik, sans-serif';
    ctx.fillText(r.label.toUpperCase(), 0, 0);
    ctx.fillStyle = '#fff';
    ctx.font = '700 22px Rubik, sans-serif';
    ctx.fillText(f.name, 0, 28);
    ctx.fillStyle = '#bcd6ff';
    ctx.font = '14px Rubik, sans-serif';
    ctx.fillText(`${f.size} inches`, 0, 50);
    ctx.fillStyle = '#ffd84d';
    ctx.font = '700 16px Rubik, sans-serif';
    ctx.fillText(`+${f.coins + result.treasure} 🪙${result.treasure ? ` (🎁 +${result.treasure})` : ''}`, 0, 78);
    if (result.first || result.record) {
      ctx.fillStyle = result.first ? '#6ee7a0' : '#39c6ff';
      ctx.beginPath(); ctx.roundRect(70, -112, 70, 24, 12); ctx.fill();
      ctx.fillStyle = '#0d1f4a';
      ctx.font = '900 12px Rubik, sans-serif';
      ctx.fillText(result.first ? 'NEW!' : 'RECORD!', 105, -95);
    }
    ctx.fillStyle = '#bcd6ff';
    ctx.font = '12px Rubik, sans-serif';
    ctx.fillText('click to continue', 0, 104);
    ctx.restore();
  }

  // ---- input + lifecycle ------------------------------------------------------

  canvas.onpointerdown = (e) => { e.preventDefault(); press(); };
  const up = () => { if (holding) release(); };
  window.addEventListener('pointerup', up);
  const offKeys = onKeys(
    (e) => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) press(); } },
    (e) => { if (e.code === 'Space') up(); },
  );
  const off = listen({
    fish_result: (m) => {
      result = { ...m, at: performance.now() };
      setState('result');
      if (['rare', 'epic', 'legendary'].includes(m.fish.rarity)) confetti($(body, '.game-canvas-wrap'), { colors: [RARITY[m.fish.rarity].color, '#fff', '#ffd84d'] });
    },
    player: (m) => { if (m.p.key === me().key) renderJournal(); },
    error: (m) => {
      if (m.for !== 'fish') return;
      m.handled = true;
      say(m.msg);
      reset();
    },
  });
  const stop = loop((dt, now) => { update(dt, now); draw(dt, now); });
  return () => { stop(); off(); offKeys(); window.removeEventListener('pointerup', up); };
}
