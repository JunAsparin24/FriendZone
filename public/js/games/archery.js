// Archery: aim with the mouse, hold to draw the bow (steadies your aim, but hold too long and
// your arms shake), release to shoot. Wind pushes arrows and later targets move.
import { net } from '../net.js';
import { $, TAU, clamp, listen, onKeys, hiDpiCanvas, loop, confetti, Popups } from './util.js';

const CW = 580, CH = 380;
const ARROWS = 5, TR = 60, TY = 150;
const RING_COLORS = ['#f4f4f4', '#f4f4f4', '#2a2a2a', '#2a2a2a', '#3aa0ff', '#3aa0ff', '#ff4d4d', '#ff4d4d', '#ffd84d', '#ffd84d'];

export function archery(body) {
  body.innerHTML = `
    <h2>🏹 Archery Range</h2>
    <div class="game-canvas-wrap"><canvas class="archery-canvas"></canvas></div>
    <p class="hint muted small">Aim with the mouse. <b>Hold</b> to draw the bow (your aim steadies), <b>release</b> to shoot.
      Mind the wind, and don't hold too long or your arms shake! Arrows 4–5 move.</p>
    <div class="row between"><div class="result"></div><button class="btn primary hidden" id="again">Shoot again</button></div>`;
  const canvas = $(body, 'canvas'), result = $(body, '.result'), again = $(body, '#again');
  const ctx = hiDpiCanvas(canvas, CW, CH);
  const popups = new Popups();
  let mouse = { x: CW / 2, y: TY }, drawing = false, drawT = 0, t = 0;
  let round;

  function newRound() {
    round = { n: 0, shots: [], flying: null, wait: 0, done: false, sent: false };
    setupArrow();
    again.classList.add('hidden');
    result.textContent = '';
  }

  function setupArrow() {
    const n = round.n;
    round.wind = n === 0 ? (Math.random() - 0.5) * 0.4 : (Math.random() - 0.5) * 2;
    round.moving = n >= 3;
    round.speed = n === 3 ? 0.9 : 1.4;
    round.baseX = 200 + Math.random() * 180;
    round.phase = Math.random() * TAU;
  }

  const targetX = () => (round.moving ? CW / 2 + Math.sin(t * round.speed + round.phase) * 150 : round.baseX);

  function sway() {
    let amp = 14;
    if (drawing) {
      amp = drawT < 1.2 ? 14 - (drawT / 1.2) * 10 : drawT < 2.4 ? 4 : Math.min(40, 4 + (drawT - 2.4) * 18);
    }
    return {
      x: (Math.sin(t * 1.7) + Math.sin(t * 2.9 + 1) * 0.5) * amp * 0.7,
      y: (Math.cos(t * 1.3) + Math.sin(t * 3.3 + 2) * 0.5) * amp * 0.7,
      amp,
    };
  }

  function aim() {
    const s = sway();
    return { x: mouse.x + s.x, y: mouse.y + s.y };
  }

  function release() {
    if (!drawing) return;
    drawing = false;
    if (round.done || round.flying || round.wait > 0) return;
    const power = Math.min(1, drawT / 0.8);
    if (power < 0.25) {
      popups.add('Pull further!', mouse.x, mouse.y - 20, '#ffd84d', 16);
      return;
    }
    const a = aim();
    const land = { x: a.x + round.wind * 42, y: a.y + (1 - power) * 50 };
    round.flying = { from: { x: CW / 2, y: CH - 30 }, to: land, t: 0 };
  }

  function landArrow() {
    const { to } = round.flying;
    round.flying = null;
    const tx = targetX();
    const d = Math.hypot(to.x - tx, to.y - TY);
    const pts = d <= TR ? 10 - Math.floor(d / (TR / 10)) : 0;
    round.shots.push({ pts, onTarget: d <= TR, dx: to.x - tx, dy: to.y - TY, x: to.x, y: to.y });
    popups.add(pts === 10 ? 'BULLSEYE! +10' : pts ? `+${pts}` : 'Miss', to.x, to.y - 18, pts >= 9 ? '#ffd84d' : pts ? '#fff' : '#ff8a9a', pts === 10 ? 22 : 18);
    if (pts === 10) confetti($(body, '.game-canvas-wrap'), { count: 40 });
    round.n += 1;
    if (round.n >= ARROWS) {
      round.done = true;
      const score = round.shots.reduce((s, x) => s + x.pts, 0);
      net.send('archery', { score });
      round.sent = true;
    } else {
      round.wait = 0.7;
    }
  }

  function update(dt) {
    t += dt;
    if (drawing) drawT += dt;
    if (round.wait > 0) {
      round.wait -= dt;
      if (round.wait <= 0) setupArrow();
    }
    if (round.flying) {
      round.flying.t += dt / 0.38;
      if (round.flying.t >= 1) landArrow();
    }
  }

  function draw(dt) {
    const sky = ctx.createLinearGradient(0, 0, 0, 170);
    sky.addColorStop(0, '#8fd0ff');
    sky.addColorStop(1, '#e6f6ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CW, 170);
    ctx.fillStyle = '#a4d49a';
    ctx.beginPath(); ctx.ellipse(120, 175, 220, 60, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#8cc684';
    ctx.beginPath(); ctx.ellipse(460, 180, 260, 70, 0, Math.PI, TAU); ctx.fill();
    const grass = ctx.createLinearGradient(0, 165, 0, CH);
    grass.addColorStop(0, '#79bf6b');
    grass.addColorStop(1, '#4f9a4a');
    ctx.fillStyle = grass;
    ctx.fillRect(0, 165, CW, CH - 165);
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(CW / 2 + i * 30, 165); ctx.lineTo(CW / 2 + i * 120, CH); ctx.stroke();
    }

    // wind flag
    const w = round.wind;
    const dir = w < 0 ? -1 : 1, pole = 58;
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(pole - 2, 16, 4, 34);
    ctx.fillStyle = '#ff5d73';
    ctx.beginPath();
    ctx.moveTo(pole + dir * 2, 17);
    ctx.lineTo(pole + dir * (10 + Math.abs(w) * 30), 23 + Math.sin(t * 8) * 2 * Math.abs(w));
    ctx.lineTo(pole + dir * 2, 30);
    ctx.fill();
    ctx.fillStyle = 'rgba(13,31,74,.75)';
    ctx.beginPath(); ctx.roundRect(pole - 48, 50, 96, 24, 12); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 12px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Wind ${w < -0.05 ? '←' : w > 0.05 ? '→' : '·'} ${Math.abs(w * 10).toFixed(1)}`, pole, 66);

    // target
    const tx = targetX();
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(tx - 34, TY + 30, 6, 70);
    ctx.fillRect(tx + 28, TY + 30, 6, 70);
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath(); ctx.ellipse(tx, TY + 100, 50, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8c96a';
    ctx.beginPath(); ctx.arc(tx, TY, TR + 6, 0, TAU); ctx.fill();
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = RING_COLORS[i];
      ctx.beginPath(); ctx.arc(tx, TY, TR - i * (TR / 10), 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.2)';
      ctx.stroke();
    }
    for (const s of round.shots) {
      const x = s.onTarget ? tx + s.dx : s.x, y = s.onTarget ? TY + s.dy : s.y;
      ctx.strokeStyle = '#7a4a1f';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 7, y + 13); ctx.stroke();
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath(); ctx.moveTo(x + 5, y + 10); ctx.lineTo(x + 12, y + 12); ctx.lineTo(x + 8, y + 17); ctx.fill();
      ctx.fillStyle = '#0b1a3d';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill();
      ctx.lineWidth = 1;
    }

    // arrow in flight
    if (round.flying) {
      const f = round.flying, p = f.t;
      const x = f.from.x + (f.to.x - f.from.x) * p, y = f.from.y + (f.to.y - f.from.y) * p - Math.sin(p * Math.PI) * 40;
      const s = 1.6 - p * 1.1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(f.to.y - f.from.y, f.to.x - f.from.x) + Math.PI / 2);
      ctx.scale(s, s);
      ctx.strokeStyle = '#7a4a1f';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, 14); ctx.stroke();
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-5, 16); ctx.lineTo(5, 16); ctx.fill();
      ctx.restore();
    }

    // bow
    const power = drawing ? Math.min(1, drawT / 0.8) : 0;
    const a = aim();
    const bx = CW / 2, by = CH - 22;
    const ang = Math.atan2(a.y - by, a.x - bx);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang + Math.PI / 2);
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 12, 46, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    const ex = Math.cos(Math.PI * 1.15) * 46, ey = 12 + Math.sin(Math.PI * 1.15) * 46;
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(0, ey + 8 + power * 26); ctx.lineTo(-ex, ey); ctx.stroke();
    if (!round.flying && !round.done && round.wait <= 0) {
      ctx.strokeStyle = '#7a4a1f';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, ey + 8 + power * 26); ctx.lineTo(0, ey - 34 + power * 26); ctx.stroke();
      ctx.fillStyle = '#c0c6d4';
      ctx.beginPath(); ctx.moveTo(0, ey - 42 + power * 26); ctx.lineTo(-4, ey - 32 + power * 26); ctx.lineTo(4, ey - 32 + power * 26); ctx.fill();
    }
    ctx.restore();

    // crosshair + draw meter
    if (!round.done) {
      const s = sway();
      const shaky = drawing && drawT > 2.4;
      ctx.strokeStyle = shaky ? '#ff5d73' : drawing ? '#6ee7a0' : '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 10 + s.amp * 0.3, 0, TAU);
      ctx.moveTo(a.x - 18, a.y); ctx.lineTo(a.x - 6, a.y);
      ctx.moveTo(a.x + 6, a.y); ctx.lineTo(a.x + 18, a.y);
      ctx.moveTo(a.x, a.y - 18); ctx.lineTo(a.x, a.y - 6);
      ctx.moveTo(a.x, a.y + 6); ctx.lineTo(a.x, a.y + 18);
      ctx.stroke();
      if (drawing) {
        ctx.fillStyle = 'rgba(13,31,74,.7)';
        ctx.fillRect(a.x - 22, a.y + 24, 44, 6);
        ctx.fillStyle = power >= 1 ? '#6ee7a0' : '#ffd84d';
        ctx.fillRect(a.x - 22, a.y + 24, 44 * power, 6);
        if (shaky) popupText('arms shaking!', a.x, a.y + 44, '#ff8a9a');
      }
    }

    // hud
    ctx.fillStyle = 'rgba(13,31,74,.75)';
    ctx.beginPath(); ctx.roundRect(CW - 176, 14, 162, 54, 12); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = '700 14px Rubik, sans-serif';
    const score = round.shots.reduce((s, x) => s + x.pts, 0);
    ctx.fillText(`Score ${score}/50`, CW - 164, 36);
    ctx.font = '16px serif';
    for (let i = 0; i < ARROWS; i++) {
      ctx.globalAlpha = i < round.n ? 0.25 : 1;
      ctx.fillText('➶', CW - 164 + i * 18, 58);
    }
    ctx.globalAlpha = 1;
    if (round.moving && !round.done) popupText('Moving target!', CW / 2, 40, '#ffd84d');
    popups.draw(ctx, dt);
  }

  function popupText(text, x, y, color) {
    ctx.save();
    ctx.font = '800 13px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * CW, y: ((e.clientY - r.top) / r.height) * CH };
  };
  canvas.onpointermove = (e) => { mouse = toCanvas(e); };
  canvas.onpointerdown = (e) => {
    e.preventDefault();
    mouse = toCanvas(e);
    if (round.done) return;
    drawing = true;
    drawT = 0;
  };
  window.addEventListener('pointerup', release);
  const offKeys = onKeys(
    (e) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); if (!round.done) { drawing = true; drawT = 0; } } },
    (e) => { if (e.code === 'Space') release(); },
  );
  again.onclick = newRound;
  const off = listen({
    archery_result: (m) => {
      result.innerHTML = `<b>${m.score}/50</b> · +${m.coins} 🪙${m.best ? ' · <span class="win">New personal best!</span>' : ''}`;
      again.classList.remove('hidden');
    },
    error: (m) => {
      if (m.for !== 'archery') return;
      m.handled = true;
      result.textContent = m.msg;
      again.classList.remove('hidden');
    },
  });
  newRound();
  const stop = loop((dt) => { update(dt); draw(dt); });
  return () => { stop(); off(); offKeys(); window.removeEventListener('pointerup', release); };
}
