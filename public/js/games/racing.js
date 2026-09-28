// Racing: mash alternating keys to drive your kart. Real-time with everyone on the grid.
import { net } from '../net.js';
import { S, nameOf } from '../state.js';
import { drawPerson } from '../avatar.js';
import { $, TAU, listen, onKeys, hiDpiCanvas, loop } from './util.js';

const RW = 700, TOP = 78, LANE = 60, START_X = 80, FINISH_X = RW - 56;

export function racing(body) {
  body.innerHTML = `
    <h2>🏎️ Race Track</h2>
    <div class="game-canvas-wrap"><canvas class="race-canvas"></canvas></div>
    <p class="hint muted small">Alternate <kbd>←</kbd> <kbd>→</kbd> (or <kbd>A</kbd> <kbd>D</kbd>, or tap the pedals) as fast as you can. Keep the rhythm to build speed!</p>
    <div class="race-actions row center"></div>
    <div class="pedals hidden"><button data-side="L"><span>◀</span>L</button><button data-side="R">R<span>▶</span></button></div>`;
  const canvas = $(body, 'canvas'), actions = $(body, '.race-actions'), pedals = $(body, '.pedals');
  let ctx = null, height = 0, lastState = null, stateAt = performance.now(), lastSide = null;
  const disp = {}, steps = {}, exhaust = [];
  const crowd = Array.from({ length: 46 }, (_, i) => ({ x: 14 + i * 15 + Math.random() * 6, row: i % 2, c: ['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#e57bff', '#fff', '#ff9f43'][i % 7], p: Math.random() * 6 }));

  const racers = () => Object.keys(S.race?.racers ?? {});
  const laneY = (i) => TOP + 30 + i * LANE;

  function fit() {
    const h = TOP + 30 + Math.max(2, racers().length) * LANE + 10;
    if (h !== height) {
      height = h;
      ctx = hiDpiCanvas(canvas, RW, h);
      canvas.style.aspectRatio = `${RW} / ${h}`;
    }
  }

  function renderControls() {
    const r = S.race;
    if (!r) return;
    const inRace = S.me in r.racers;
    const canJoin = !inRace && (r.state === 'idle' || r.state === 'waiting');
    actions.innerHTML = [
      canJoin ? '<button class="btn primary" data-a="join">Join race</button>' : '',
      inRace && r.state === 'waiting' ? '<button class="btn primary" data-a="start">🏁 Start race!</button>' : '',
      inRace && r.state === 'waiting' ? '<button class="btn ghost" data-a="leave">Leave grid</button>' : '',
      r.state === 'waiting' ? `<span class="muted">${racers().length} on the grid. Anyone on it can start.</span>` : '',
      !inRace && !canJoin ? '<span class="muted">Race in progress. You\'re up next!</span>' : '',
    ].join('');
    pedals.classList.toggle('hidden', !(inRace && (r.state === 'running' || r.state === 'countdown')));
    if (r.state !== lastState) {
      lastState = r.state;
      stateAt = performance.now();
      if (r.state === 'countdown') { lastSide = null; for (const k of racers()) disp[k] = 0; }
    }
    fit();
  }

  function step(side) {
    const r = S.race;
    if (!r || r.state !== 'running' || !(S.me in r.racers) || side === lastSide) return;
    lastSide = side;
    net.send('race_step', { side });
    pedals.querySelectorAll('button').forEach((b) => b.classList.toggle('next', b.dataset.side !== side));
  }

  function speedOf(k, now) {
    const list = (steps[k] ?? []).filter((ts) => now - ts < 600);
    steps[k] = list;
    return list.length / 0.6;
  }

  function drawKart(k, x, y, now, speed) {
    const look = S.players[k]?.look;
    const color = look?.topColor ?? '#39c6ff';
    drawPerson(ctx, x - 4, y + 2, look, { scale: 0.85, sitting: true, time: now, face: 1 });
    ctx.save();
    ctx.translate(x, y);
    const shake = speed > 4 ? Math.sin(now / 30) * 0.8 : 0;
    ctx.translate(0, shake);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(0, 14, 32, 5, 0, 0, TAU); ctx.fill();
    for (const wx of [-20, 18]) {
      ctx.fillStyle = '#1b1b24';
      ctx.beginPath(); ctx.arc(wx, 9, 8, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6b7194';
      ctx.lineWidth = 2;
      const a = (disp[k] ?? 0) * 1.3;
      ctx.beginPath(); ctx.moveTo(wx + Math.cos(a) * 5, 9 + Math.sin(a) * 5); ctx.lineTo(wx - Math.cos(a) * 5, 9 - Math.sin(a) * 5); ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(20,15,30,.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-30, 6); ctx.lineTo(-30, -6); ctx.lineTo(-10, -8); ctx.lineTo(4, -3); ctx.lineTo(28, -1); ctx.lineTo(32, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(14, 2, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0d1f4a';
    ctx.font = '800 7px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(racers().indexOf(k) + 1), 14, 4.5);
    ctx.fillStyle = '#2b2f4a';
    ctx.fillRect(-33, -12, 5, 10);
    ctx.restore();
  }

  function draw(dt, now) {
    fit();
    const r = S.race;
    const t = now / 1000;
    const running = r?.state === 'running';
    ctx.fillStyle = '#4f9a4a';
    ctx.fillRect(0, 0, RW, height);
    ctx.fillStyle = '#5b5f7a';
    ctx.fillRect(0, 0, RW, TOP - 8);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? '#6b7194' : '#7a809f';
      ctx.fillRect(0, 10 + i * 20, RW, 18);
    }
    for (const c of crowd) {
      const hop = Math.abs(Math.sin(t * (running ? 9 : 3) + c.p)) * (running ? 5 : 2);
      const y = 22 + c.row * 22 - hop;
      ctx.fillStyle = c.c;
      ctx.fillRect(c.x - 5, y + 6, 10, 8);
      ctx.fillStyle = '#f6c9a0';
      ctx.beginPath(); ctx.arc(c.x, y, 5, 0, TAU); ctx.fill();
      if (running && c.row === 1 && Math.sin(t * 9 + c.p) > 0.6) {
        ctx.strokeStyle = '#f6c9a0';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(c.x - 4, y + 8); ctx.lineTo(c.x - 8, y - 4); ctx.stroke();
      }
    }
    ctx.fillStyle = '#e0463c';
    for (let x = 0; x < RW; x += 28) {
      ctx.fillStyle = (x / 28) % 2 ? '#fff' : '#e0463c';
      ctx.fillRect(x, TOP - 10, 28, 6);
    }

    const list = racers();
    const trackH = Math.max(2, list.length) * LANE;
    ctx.fillStyle = '#3d3f4f';
    ctx.fillRect(0, TOP, RW, trackH);
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    for (let i = 0; i < 90; i++) ctx.fillRect((i * 97) % RW, TOP + ((i * 53) % trackH), 3, 2);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 14]);
    for (let i = 1; i < Math.max(2, list.length); i++) {
      ctx.beginPath(); ctx.moveTo(0, TOP + i * LANE); ctx.lineTo(RW, TOP + i * LANE); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const [x, w] of [[START_X - 30, 8], [FINISH_X, 14]]) {
      for (let y = TOP; y < TOP + trackH; y += 7) {
        for (let c = 0; c < w / 7; c++) {
          ctx.fillStyle = (Math.floor((y - TOP) / 7) + c) % 2 ? '#111' : '#fff';
          ctx.fillRect(x + c * 7, y, 7, 7);
        }
      }
    }

    list.forEach((k, i) => {
      const y = laneY(i);
      const target = r.racers[k] / r.len;
      disp[k] = (disp[k] ?? target) + (target - (disp[k] ?? target)) * Math.min(1, dt * 10);
      const x = START_X + (FINISH_X - START_X - 10) * disp[k];
      const speed = speedOf(k, now);
      if (speed > 1 && Math.random() < dt * (6 + speed * 3)) exhaust.push({ x: x - 34, y: y - 4, vx: -40 - speed * 10, life: 0.6, fire: speed > 9 });
      if (speed > 7) {
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 2;
        for (let s = 0; s < 3; s++) {
          const sy = y - 10 + s * 8;
          ctx.beginPath(); ctx.moveTo(x - 50 - s * 12, sy); ctx.lineTo(x - 80 - s * 12, sy); ctx.stroke();
        }
      }
      ctx.fillStyle = k === S.me ? '#ffd84d' : '#fff';
      ctx.font = '700 12px Rubik, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(nameOf(k), 6, y - 18);
      const place = r.order.indexOf(k);
      if (place >= 0) {
        ctx.font = '20px serif';
        ctx.fillText(['🥇', '🥈', '🥉'][place] ?? `${place + 1}`, FINISH_X + 18, y + 6);
      }
    });
    for (const p of exhaust) {
      p.x += p.vx * dt;
      p.y -= 12 * dt;
      p.life -= dt;
      ctx.fillStyle = p.fire && p.life > 0.4 ? `rgba(255,150,40,${p.life})` : `rgba(210,210,220,${p.life * 0.6})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 + (0.6 - p.life) * 8, 0, TAU); ctx.fill();
    }
    for (let i = exhaust.length - 1; i >= 0; i--) if (exhaust[i].life <= 0) exhaust.splice(i, 1);
    list.forEach((k, i) => drawKart(k, START_X + (FINISH_X - START_X - 10) * disp[k], laneY(i), now, speedOf(k, now)));

    if (!list.length) {
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = '700 16px Rubik, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('The grid is empty. Join to line up!', RW / 2, TOP + LANE);
    }

    const since = (now - stateAt) / 1000;
    if (r?.state === 'countdown' || (running && since < 0.9)) drawLights(running ? 4 : Math.min(3, Math.floor(since) + 1), running);
    if (r?.state === 'done') drawPodium(r.order, now);
  }

  function drawLights(lit, go) {
    const w = 170, x = RW / 2 - w / 2, y = TOP + 16;
    ctx.fillStyle = '#15131f';
    ctx.beginPath(); ctx.roundRect(x, y, w, 56, 14); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const on = go || i < lit;
      ctx.fillStyle = go ? '#4dff7a' : on ? '#ff3b3b' : '#3a2a2a';
      if (on) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16; }
      ctx.beginPath(); ctx.arc(x + 35 + i * 50, y + 28, 16, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (go) {
      ctx.fillStyle = '#4dff7a';
      ctx.font = '900 30px Rubik, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GO!', RW / 2, y + 100);
    }
  }

  function drawPodium(order, now) {
    ctx.fillStyle = 'rgba(8,10,25,.6)';
    ctx.fillRect(0, TOP, RW, height - TOP);
    if (!order.length) {
      ctx.fillStyle = '#fff';
      ctx.font = '800 20px Rubik, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Time! Nobody finished.', RW / 2, TOP + 70);
      return;
    }
    const base = height - 14;
    const slots = [[1, RW / 2 - 110, 50, '#c0c6d4'], [0, RW / 2, 80, '#ffc53d'], [2, RW / 2 + 110, 34, '#d08a4a']];
    for (const [place, x, h, col] of slots) {
      const k = order[place];
      ctx.fillStyle = col;
      ctx.fillRect(x - 46, base - h, 92, h);
      ctx.fillStyle = 'rgba(0,0,0,.2)';
      ctx.fillRect(x - 46, base - h, 92, 6);
      ctx.fillStyle = '#0d1f4a';
      ctx.font = '900 22px Rubik, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(place + 1), x, base - h / 2 + 10);
      if (!k) continue;
      drawPerson(ctx, x, base - h, S.players[k]?.look, { scale: 1.2, time: now, jump: place === 0 ? Math.abs(Math.sin(now / 250)) * 8 : 0 });
      ctx.fillStyle = '#fff';
      ctx.font = '700 12px Rubik, sans-serif';
      ctx.fillText(nameOf(k), x, base - h - 76);
    }
  }

  actions.onclick = (e) => {
    const a = e.target.dataset?.a;
    if (a) net.send(`race_${a}`);
  };
  pedals.querySelectorAll('button').forEach((b) => (b.onpointerdown = (e) => { e.preventDefault(); step(b.dataset.side); }));
  const offKeys = onKeys((e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') { e.preventDefault(); step('L'); }
    if (k === 'arrowright' || k === 'd') { e.preventDefault(); step('R'); }
  });
  const off = listen({
    race: renderControls,
    race_p: (m) => (steps[m.k] ||= []).push(performance.now()),
  });
  net.send('race_join');
  fit();
  renderControls();
  const stop = loop(draw);
  return () => { stop(); off(); offKeys(); };
}
