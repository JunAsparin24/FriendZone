// Casino: slots with real spinning reels, a prize wheel and a 3D coin flip.
import { net } from '../net.js';
import { me, fmt } from '../state.js';
import { $, TAU, listen, hiDpiCanvas, loop, confetti } from './util.js';

const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
const CELL = 84;
const WHEEL = [0, 1.5, 0, 2, 0, 0.5, 0, 2, 0, 1.5, 0, 0.5, 0, 2, 0, 5]; // must match server.py
const WHEEL_COLORS = { 0: '#2b2f4a', 0.5: '#6b7194', 1.5: '#39c6ff', 2: '#6ee7a0', 5: '#ffc53d' };
const rand = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

export function casino(body) {
  body.innerHTML = `
    <h2>🎰 Casino</h2>
    <div class="tabs"><button class="on" data-tab="slots">🎰 Slots</button><button data-tab="wheel">🎡 Wheel</button><button data-tab="coinflip">🪙 Coin flip</button></div>
    <div class="bet-row">
      <label>Bet <input type="number" min="1" value="50" class="bet"></label>
      <div class="chips"><button data-b="10">10</button><button data-b="50">50</button><button data-b="100">100</button><button data-b="half">½</button><button data-b="max">Max</button></div>
    </div>
    <div class="casino-stage">
      <div data-pane="slots">
        <div class="slot-machine">
          <div class="slot-lights">★ LUCKY SEVENS ★</div>
          <div class="slot-window">${[0, 1, 2].map(() => `<div class="reel"><div class="strip"><div class="cell">${rand()}</div><div class="cell">${rand()}</div></div></div>`).join('')}<div class="payline"></div></div>
          <button class="lever" aria-label="Pull lever"><span class="knob"></span></button>
        </div>
        <button class="btn primary wide" id="spin">Spin</button>
        <p class="muted small center">A pair gives your bet back. Three of a kind: 🍒×5 🍋×8 🔔×12 ⭐×20 💎×40 7️⃣×77</p>
      </div>
      <div data-pane="wheel" class="hidden">
        <div class="wheel-wrap"><canvas class="wheel"></canvas><div class="wheel-pointer"></div></div>
        <button class="btn primary wide" id="spinWheel">Spin the wheel</button>
        <p class="muted small center">Land on ×1.5, ×2 or the golden ×5!</p>
      </div>
      <div data-pane="coinflip" class="hidden">
        <div class="coin-stage"><div class="coin3d"><div class="face heads">👑</div><div class="face tails">🦅</div></div></div>
        <div class="row center"><button class="btn" data-pick="heads">👑 Heads</button><button class="btn" data-pick="tails">🦅 Tails</button></div>
        <p class="muted small center">Double or nothing.</p>
      </div>
    </div>
    <p class="result big-result"></p>
    <p class="muted center">Balance: <b class="bal"></b> 🪙</p>`;
  const betInput = $(body, '.bet'), result = $(body, '.result'), bal = $(body, '.bal'), stage = $(body, '.casino-stage');
  const reels = [...body.querySelectorAll('.reel')], lever = $(body, '.lever'), coin = $(body, '.coin3d');
  let busy = false, timers = [], flips = 0;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const showBalance = () => { if (!busy) bal.textContent = fmt(me().coins); };
  showBalance();

  body.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    if (busy) return;
    body.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    body.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.tab));
    result.textContent = '';
  }));
  body.querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => {
    const coins = me().coins;
    betInput.value = b.dataset.b === 'max' ? Math.min(coins, 5000) : b.dataset.b === 'half' ? Math.max(1, Math.floor(coins / 2)) : b.dataset.b;
  }));

  const play = (game, extra = {}) => {
    if (busy) return;
    busy = true;
    result.textContent = '';
    result.className = 'result big-result';
    net.send('gamble', { game, bet: Number(betInput.value), ...extra });
    if (game === 'slots') {
      lever.classList.remove('pull');
      void lever.offsetWidth;
      lever.classList.add('pull');
      reels.forEach((r) => r.classList.add('spinning'));
    }
  };

  const finish = (m, text) => {
    busy = false;
    const won = m.payout > m.bet;
    result.textContent = text ?? (won ? `You won ${fmt(m.payout)} 🪙!` : m.payout === m.bet ? 'Bet returned.' : `You lost ${fmt(m.bet)} 🪙`);
    result.className = `result big-result ${won ? 'win' : m.payout === m.bet ? '' : 'lose'}`;
    if (won) confetti(stage, { count: m.payout >= m.bet * 10 ? 160 : 70 });
    showBalance();
  };

  // ---- slots ----
  function spinReel(reel, finalSym, i) {
    const strip = reel.firstElementChild;
    reel.classList.remove('spinning');
    const current = strip.children[strip.children.length - 2]?.textContent ?? rand();
    const syms = [current];
    for (let k = 0; k < 16 + i * 7; k++) syms.push(rand());
    syms.push(finalSym, rand());
    strip.innerHTML = syms.map((s) => `<div class="cell">${s}</div>`).join('');
    strip.style.transition = 'none';
    strip.style.transform = `translateY(${CELL * 0.3}px)`;
    void strip.offsetHeight;
    const dur = 0.9 + i * 0.45;
    strip.style.transition = `transform ${dur}s cubic-bezier(.12,.8,.25,1.06)`;
    strip.style.transform = `translateY(${-(syms.length - 2) * CELL + CELL * 0.3}px)`;
    return dur * 1000;
  }
  $(body, '#spin').onclick = () => play('slots');
  lever.onclick = () => play('slots');

  // ---- wheel ----
  const wheelCanvas = $(body, '.wheel');
  const WS = 280;
  const wctx = hiDpiCanvas(wheelCanvas, WS, WS);
  const seg = TAU / WHEEL.length;
  let rot = 0, spin = null;
  function drawWheel() {
    wctx.clearRect(0, 0, WS, WS);
    wctx.save();
    wctx.translate(WS / 2, WS / 2);
    wctx.fillStyle = '#ffc53d';
    wctx.beginPath(); wctx.arc(0, 0, WS / 2 - 2, 0, TAU); wctx.fill();
    wctx.rotate(rot);
    WHEEL.forEach((mult, i) => {
      const a0 = -Math.PI / 2 + i * seg;
      wctx.fillStyle = WHEEL_COLORS[mult];
      wctx.beginPath(); wctx.moveTo(0, 0); wctx.arc(0, 0, WS / 2 - 12, a0, a0 + seg); wctx.closePath(); wctx.fill();
      wctx.strokeStyle = 'rgba(255,255,255,.3)';
      wctx.stroke();
      wctx.save();
      wctx.rotate(a0 + seg / 2);
      wctx.fillStyle = mult === 0 ? '#bcd6ff' : mult === 5 ? '#3a2a00' : '#0d1f4a';
      wctx.font = '800 14px Rubik, sans-serif';
      wctx.textAlign = 'center';
      wctx.fillText(mult === 0 ? '✖' : `×${mult}`, WS / 2 - 38, 5);
      wctx.restore();
    });
    for (let i = 0; i < WHEEL.length; i++) {
      const a = -Math.PI / 2 + i * seg;
      wctx.fillStyle = '#fff6c9';
      wctx.beginPath(); wctx.arc(Math.cos(a) * (WS / 2 - 7), Math.sin(a) * (WS / 2 - 7), 3, 0, TAU); wctx.fill();
    }
    wctx.restore();
    wctx.fillStyle = '#1a3d85';
    wctx.beginPath(); wctx.arc(WS / 2, WS / 2, 26, 0, TAU); wctx.fill();
    wctx.strokeStyle = '#ffc53d';
    wctx.lineWidth = 4;
    wctx.stroke();
    wctx.font = '20px serif';
    wctx.textAlign = 'center';
    wctx.fillText('🎡', WS / 2, WS / 2 + 7);
  }
  drawWheel();
  const pointer = $(body, '.wheel-pointer');
  const stopWheelLoop = loop((dt) => {
    if (!spin) return;
    spin.t += dt / 4;
    const p = Math.min(1, spin.t);
    const eased = 1 - (1 - p) ** 4;
    const before = Math.floor(rot / seg);
    rot = spin.from + (spin.to - spin.from) * eased;
    if (Math.floor(rot / seg) !== before) {
      pointer.classList.remove('tick');
      void pointer.offsetWidth;
      pointer.classList.add('tick');
    }
    drawWheel();
    if (p >= 1) {
      const m = spin.msg;
      spin = null;
      finish(m, m.payout ? `×${WHEEL[m.index]}! ${m.payout > m.bet ? `You won ${fmt(m.payout)} 🪙!` : `${fmt(m.payout)} 🪙 back.`}` : `No luck! You lost ${fmt(m.bet)} 🪙`);
    }
  });
  $(body, '#spinWheel').onclick = () => play('wheel');

  // ---- coin ----
  body.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => play('coinflip', { pick: b.dataset.pick })));

  const off = listen({
    gamble_result: (m) => {
      if (m.game === 'slots') {
        const durations = m.reels.map((sym, i) => spinReel(reels[i], sym, i));
        later(() => {
          if (new Set(m.reels).size === 1) reels.forEach((r) => r.classList.add('winner'));
          later(() => reels.forEach((r) => r.classList.remove('winner')), 1800);
          finish(m, new Set(m.reels).size === 1 ? `JACKPOT ${m.reels[0]}×3! You won ${fmt(m.payout)} 🪙!` : undefined);
        }, Math.max(...durations) + 80);
      } else if (m.game === 'wheel') {
        const target = -(m.index + 0.5) * seg + (Math.random() - 0.5) * seg * 0.6;
        const delta = ((target - rot) % TAU + TAU) % TAU;
        spin = { from: rot, to: rot + TAU * 5 + delta, t: 0, msg: m };
      } else {
        flips += 1;
        coin.style.transform = `rotateY(${flips * 1800 + (m.side === 'tails' ? 180 : 0)}deg)`;
        coin.parentElement.classList.remove('toss');
        void coin.offsetWidth;
        coin.parentElement.classList.add('toss');
        later(() => finish(m, `${m.side === 'heads' ? '👑 HEADS' : '🦅 TAILS'}! ${m.payout ? `You won ${fmt(m.payout)} 🪙!` : `You lost ${fmt(m.bet)} 🪙`}`), 1450);
      }
    },
    error: (m) => {
      if (m.for !== 'gamble') return;
      m.handled = true;
      reels.forEach((r) => r.classList.remove('spinning'));
      busy = false;
      result.textContent = m.msg;
      result.className = 'result big-result lose';
    },
    player: (m) => { if (m.p.key === me().key) showBalance(); },
  });
  return () => { timers.forEach(clearTimeout); stopWheelLoop(); off(); };
}
