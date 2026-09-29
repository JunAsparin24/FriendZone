// Roulette: one shared table for everyone at the casino. A round every ~30 seconds: place chips
// while the timer runs, then watch the ball drop. Everyone's chips show up on the table.
import { net } from '../net.js';
import { S, esc, fmt, nameOf, colorOf, me } from '../state.js';
import { sfx } from '../sfx.js';
import { $, TAU, listen, hiDpiCanvas, loop, confetti } from './util.js';

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const SEG = TAU / ORDER.length;
const WS = 260;
const pocketColor = (n) => (n === 0 ? '#2f9e44' : RED.has(n) ? '#d6334a' : '#1d1b2e');
const OUTSIDE = [
  ['dozen:1', '1st 12', 4], ['dozen:2', '2nd 12', 4], ['dozen:3', '3rd 12', 4],
  ['low:0', '1–18', 2], ['even:0', 'Even', 2], ['red:0', '<i class="rl-dia red"></i>', 2], ['black:0', '<i class="rl-dia black"></i>', 2], ['odd:0', 'Odd', 2], ['high:0', '19–36', 2],
];
const PAYS = { num: '35 to 1', dozen: '2 to 1' };

export function roulette(pane) {
  pane.innerHTML = `
    <div class="rl">
      <div class="rl-left">
        <div class="rl-wheel-wrap"><canvas class="rl-wheel"></canvas></div>
        <div class="rl-status"></div>
        <div class="rl-timer"><i></i></div>
        <div class="rl-history"></div>
      </div>
      <div class="rl-right">
        <div class="rl-table">
          <button class="rl-cell zero" data-bet="num:0" style="grid-row: 1 / span 3; grid-column: 1">0<span class="rl-stack"></span></button>
          ${Array.from({ length: 36 }, (_, i) => {
            const n = i + 1, col = Math.ceil(n / 3) + 1, row = 3 - ((n - 1) % 3);
            return `<button class="rl-cell ${RED.has(n) ? 'red' : 'black'}" data-bet="num:${n}" style="grid-row:${row};grid-column:${col}">${n}<span class="rl-stack"></span></button>`;
          }).join('')}
          ${(() => {
            let col = 2;
            return OUTSIDE.map(([bet, label, span], i) => {
              const row = i < 3 ? 4 : 5;
              if (i === 3) col = 2;
              const html = `<button class="rl-cell out" data-bet="${bet}" style="grid-row:${row};grid-column:${col} / span ${span}">${label}<span class="rl-stack"></span></button>`;
              col += span;
              return html;
            }).join('');
          })()}
        </div>
        <div class="rl-bar">
          <span class="muted small">Chip:</span>
          <div class="chips rl-chips">${[10, 50, 100, 500, 1000].map((v) => `<button data-chip="${v}">${v}</button>`).join('')}</div>
          <button class="btn small ghost" data-clear>Clear my bets</button>
        </div>
        <div class="rl-players"></div>
        <p class="muted small">Numbers pay 35 to 1 · dozens 2 to 1 · red/black, odd/even, 1–18/19–36 pay even money. Up to 5,000 🪙 per round.</p>
      </div>
    </div>`;
  const wheel = $(pane, '.rl-wheel'), statusEl = $(pane, '.rl-status'), timerBar = $(pane, '.rl-timer i');
  const historyEl = $(pane, '.rl-history'), playersEl = $(pane, '.rl-players');
  const wctx = hiDpiCanvas(wheel, WS, WS);
  let chip = 50, view = null, endsAt = 0, dur = 20;
  let wheelRot = 0, ball = { ang: -Math.PI / 2, r: WS / 2 - 26, visible: false }, spin = null, lastTick = 0, highlight = null;

  // ---- table ----------------------------------------------------------------------

  function renderChips() {
    pane.querySelectorAll('[data-chip]').forEach((b) => b.classList.toggle('on', Number(b.dataset.chip) === chip));
  }
  function renderTable() {
    const byCell = {};
    for (const [k, bets] of Object.entries(view?.bets ?? {})) {
      for (const b of bets) (byCell[`${b.kind}:${b.v}`] ||= []).push({ k, amount: b.amount });
    }
    pane.querySelectorAll('[data-bet]').forEach((cell) => {
      const list = byCell[cell.dataset.bet] ?? [];
      const total = list.reduce((s, b) => s + b.amount, 0);
      cell.querySelector('.rl-stack').innerHTML = list.length
        ? `${list.slice(0, 4).map((b, i) => `<i style="--c:${colorOf(b.k)};--i:${i}" class="${b.k === S.me ? 'mine' : ''}"></i>`).join('')}<b>${total >= 1000 ? `${(total / 1000).toFixed(total % 1000 ? 1 : 0)}k` : total}</b>` : '';
      cell.classList.toggle('hit', highlight != null && isHit(cell.dataset.bet, highlight));
    });
    const rows = Object.entries(view?.bets ?? {}).filter(([, b]) => b.length);
    playersEl.innerHTML = rows.length
      ? rows.map(([k, bets]) => `<span style="--c:${colorOf(k)}"><i class="dot"></i>${esc(nameOf(k))} <b>${fmt(bets.reduce((s, b) => s + b.amount, 0))}</b></span>`).join('')
      : '<span class="muted small">No bets yet this round. Be the first!</span>';
  }
  function isHit(bet, n) {
    const [kind, v] = bet.split(':');
    if (kind === 'num') return Number(v) === n;
    if (n === 0) return false;
    return { red: RED.has(n), black: !RED.has(n), odd: n % 2 === 1, even: n % 2 === 0, low: n <= 18, high: n >= 19, dozen: Math.ceil(n / 12) === Number(v) }[kind];
  }
  function renderHistory() {
    historyEl.innerHTML = (view?.history ?? []).map((n, i) => `<span class="rl-h ${i === 0 ? 'last' : ''}" style="--c:${pocketColor(n)}">${n}</span>`).join('');
  }
  function renderStatus() {
    const st = view?.state;
    const mineTotal = (view?.bets?.[S.me] ?? []).reduce((s, b) => s + b.amount, 0);
    if (st === 'betting') statusEl.innerHTML = `<b>Place your bets!</b>${mineTotal ? ` <span class="muted">You: ${fmt(mineTotal)} 🪙</span>` : ''}`;
    else if (st === 'spinning') statusEl.innerHTML = '<b>No more bets…</b> 🎡';
    else if (st === 'result' && view.result != null) statusEl.innerHTML = `<b class="rl-num" style="--c:${pocketColor(view.result)}">${view.result}</b> ${view.result === 0 ? 'Green zero!' : RED.has(view.result) ? 'Red' : 'Black'}`;
    else statusEl.innerHTML = '<span class="muted">Opening the table…</span>';
  }

  pane.addEventListener('click', (e) => {
    const c = e.target.closest('[data-chip]');
    if (c) { chip = Number(c.dataset.chip); renderChips(); return; }
    if (e.target.closest('[data-clear]')) { net.send('roulette_clear'); return; }
    const cell = e.target.closest('[data-bet]');
    if (!cell) return;
    if (view?.state !== 'betting') { sfx('error'); statusEl.innerHTML = '<b>Wait for the next round to bet.</b>'; return; }
    const [kind, v] = cell.dataset.bet.split(':');
    net.send('roulette_bet', { kind, v: Number(v), amount: chip });
    sfx('chip');
    cell.classList.remove('pop');
    void cell.offsetWidth;
    cell.classList.add('pop');
  });

  // ---- wheel ------------------------------------------------------------------------

  function drawWheel() {
    const c = WS / 2, R = c - 6;
    wctx.clearRect(0, 0, WS, WS);
    wctx.save();
    wctx.translate(c, c);
    const wood = wctx.createRadialGradient(0, 0, R * 0.7, 0, 0, R);
    wood.addColorStop(0, '#8b5a2b');
    wood.addColorStop(1, '#5a3a1c');
    wctx.fillStyle = wood;
    wctx.beginPath(); wctx.arc(0, 0, R, 0, TAU); wctx.fill();
    wctx.fillStyle = '#3a2410';
    wctx.beginPath(); wctx.arc(0, 0, R - 12, 0, TAU); wctx.fill();
    wctx.rotate(wheelRot);
    ORDER.forEach((n, i) => {
      const a0 = -Math.PI / 2 + i * SEG;
      wctx.fillStyle = n === highlight && !spin ? '#ffd84d' : pocketColor(n);
      wctx.beginPath(); wctx.moveTo(0, 0); wctx.arc(0, 0, R - 16, a0, a0 + SEG); wctx.closePath(); wctx.fill();
      wctx.strokeStyle = '#c9a227';
      wctx.lineWidth = 1;
      wctx.stroke();
      wctx.save();
      wctx.rotate(a0 + SEG / 2);
      wctx.fillStyle = n === highlight && !spin ? '#1a1330' : '#fff';
      wctx.font = '700 10px Rubik, sans-serif';
      wctx.textAlign = 'center';
      wctx.translate(R - 27, 0);
      wctx.rotate(Math.PI / 2);
      wctx.fillText(String(n), 0, 3);
      wctx.restore();
    });
    const cone = wctx.createRadialGradient(-10, -10, 4, 0, 0, R * 0.6);
    cone.addColorStop(0, '#c98a4a');
    cone.addColorStop(1, '#5a3a1c');
    wctx.fillStyle = cone;
    wctx.beginPath(); wctx.arc(0, 0, R * 0.58, 0, TAU); wctx.fill();
    wctx.strokeStyle = '#c9a227';
    wctx.lineWidth = 3;
    wctx.stroke();
    for (let i = 0; i < 4; i++) {
      wctx.rotate(Math.PI / 2);
      wctx.fillStyle = '#ffd84d';
      wctx.fillRect(-3, 0, 6, R * 0.34);
      wctx.beginPath(); wctx.arc(0, R * 0.34, 6, 0, TAU); wctx.fill();
    }
    wctx.fillStyle = '#ffe27a';
    wctx.beginPath(); wctx.arc(0, 0, 12, 0, TAU); wctx.fill();
    wctx.restore();
    if (ball.visible) {
      const bx = c + Math.cos(ball.ang) * ball.r, by = c + Math.sin(ball.ang) * ball.r;
      wctx.fillStyle = 'rgba(0,0,0,.35)';
      wctx.beginPath(); wctx.arc(bx + 1.5, by + 2, 6, 0, TAU); wctx.fill();
      const g = wctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, 6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#c0c6d4');
      wctx.fillStyle = g;
      wctx.beginPath(); wctx.arc(bx, by, 6, 0, TAU); wctx.fill();
    }
  }

  function startSpin(n, seconds) {
    const now = performance.now();
    const T = Math.max(1.5, seconds - 0.4) * 1000;
    const idx = ORDER.indexOf(n);
    const wheelEnd = wheelRot + TAU * 2 + Math.random() * TAU;
    const pocket = wheelEnd - Math.PI / 2 + idx * SEG + SEG / 2; // where the pocket ends up
    const ballStart = ball.ang;
    let ballEnd = pocket - TAU * 5;
    while (ballEnd > ballStart - TAU * 4) ballEnd -= TAU;
    spin = { t0: now, T, wheelStart: wheelRot, wheelEnd, ballStart, ballEnd, n };
    ball.visible = true;
    highlight = null;
    sfx('whoosh');
  }

  function stepWheel(dt, now) {
    if (spin) {
      const k = Math.min(1, (now - spin.t0) / spin.T);
      const e = 1 - (1 - k) ** 3;
      wheelRot = spin.wheelStart + (spin.wheelEnd - spin.wheelStart) * e;
      const eb = 1 - (1 - k) ** 2.2;
      const prev = ball.ang;
      ball.ang = spin.ballStart + (spin.ballEnd - spin.ballStart) * eb;
      const outer = WS / 2 - 26, inner = WS / 2 - 42;
      ball.r = k < 0.7 ? outer : outer - (outer - inner) * Math.min(1, (k - 0.7) / 0.25) + Math.abs(Math.sin(k * 60)) * (1 - k) * 8;
      const speed = Math.abs(ball.ang - prev) / Math.max(dt, 0.001);
      if (now - lastTick > Math.max(40, 900 / (speed + 0.5))) { lastTick = now; sfx('ball'); }
      if (k >= 1) {
        spin = null;
        sfx('reelstop');
      }
    } else {
      const drift = dt * 0.25;
      wheelRot += drift;
      if (ball.visible && highlight != null) ball.ang += drift; // the ball rides along in its pocket
    }
    drawWheel();
  }

  // ---- network ------------------------------------------------------------------------

  const off = listen({
    roulette: (m) => {
      view = m;
      endsAt = performance.now() + m.left * 1000;
      dur = m.state === 'betting' ? 20 : Math.max(1, m.left);
      if (m.state === 'betting') { highlight = null; if (!spin) ball.visible = false; }
      renderAll();
    },
    roulette_bet: (m) => {
      if (!view) return;
      view.bets = { ...view.bets, [m.k]: m.bets };
      renderTable();
      renderStatus();
      if (m.k !== S.me) sfx('chip', { vol: 0.5 });
    },
    roulette_spin: (m) => {
      if (!view) return;
      view.state = 'spinning';
      endsAt = performance.now() + m.spin * 1000;
      dur = m.spin;
      startSpin(m.n, m.spin);
      renderStatus();
    },
    roulette_result: (m) => {
      if (!view) return;
      view.state = 'result';
      view.result = m.n;
      view.history = m.history;
      highlight = m.n;
      endsAt = performance.now() + 4000;
      dur = 4;
      renderAll();
      const mine = view.bets?.[S.me];
      const won = m.wins?.[S.me] ?? 0;
      if (mine?.length) {
        const staked = mine.reduce((s, b) => s + b.amount, 0);
        if (won > 0) {
          sfx(won >= staked * 10 ? 'jackpot' : 'coins', { n: Math.min(12, Math.round(won / staked) * 2) });
          confetti(pane.querySelector('.rl-wheel-wrap'), { count: won >= staked * 10 ? 160 : 60 });
          statusEl.innerHTML += ` · <b class="win">You won ${fmt(won)} 🪙!</b>`;
        } else {
          sfx('wah');
          statusEl.innerHTML += ` · <span class="lose">No luck this time</span>`;
        }
      }
    },
    error: (m) => {
      if (m.for !== 'roulette_bet') return;
      m.handled = true;
      statusEl.innerHTML = `<b class="lose">${esc(m.msg)}</b>`;
      sfx('error');
    },
  });

  function renderAll() {
    renderChips();
    renderTable();
    renderHistory();
    renderStatus();
  }

  renderAll();
  net.send('roulette_sync');
  const stop = loop((dt, now) => {
    stepWheel(dt, now);
    const left = Math.max(0, (endsAt - now) / 1000);
    timerBar.style.width = view && view.state !== 'idle' ? `${Math.min(100, (left / dur) * 100)}%` : '0%';
    timerBar.parentElement.classList.toggle('urgent', view?.state === 'betting' && left < 5);
    if (view?.state === 'betting') {
      const s = statusEl.querySelector('.rl-left-s');
      if (s) s.textContent = `${Math.ceil(left)}s`;
      else statusEl.insertAdjacentHTML('beforeend', ` <span class="rl-left-s muted">${Math.ceil(left)}s</span>`);
    }
  });
  return () => { stop(); off(); };
}




export { ORDER as ROULETTE_ORDER, pocketColor as roulettePocketColor };
