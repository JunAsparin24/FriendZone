// Casino games: slots with real spinning reels, a prize wheel, a 3D coin flip, blackjack against the
// house dealer, the shared roulette table, Plinko, Lucky Dice and High-Low. Inside the casino each machine opens just its own game (options.game).
import { net } from '../net.js';
import { roulette } from './roulette.js';
import { iconSvg } from '../icons.js';
import { me, fmt } from '../state.js';
import { $, TAU, listen, hiDpiCanvas, loop, confetti } from './util.js';
import { sfx } from '../sfx.js';

const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
const CELL = 84;
const WHEEL = [0, 1.5, 0, 0, 0.5, 0, 2, 0, 0, 1.5, 0, 0.5, 0, 0, 0, 5]; // must match server.py
// casino colours: the blanks alternate red and black, the prizes are purple, the jackpot is gold
const wheelColor = (mult, i) => (mult === 0 ? (i % 2 ? '#1a1320' : '#b3122e') : mult === 5 ? '#ffc53d' : mult === 2 ? '#7a2fc0' : '#5b1f8f');
const wheelInk = (mult) => (mult === 5 ? '#3a2400' : '#ffd84d');
const rand = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

const TITLES = { slots: 'Lucky Slots', wheel: 'Prize Wheel', coinflip: 'Coin Flip', blackjack: 'Blackjack', roulette: 'Roulette', plinko: 'Plinko', dice: 'Lucky Dice', hilo: 'High-Low' };
const PLINKO_PAYS = [9, 3, 1.4, 0.6, 0.3, 0.6, 1.4, 3, 9]; // must match server.py
const CARD_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const BJ_RESULTS = {
  blackjack: ['🃏 BLACKJACK! Pays 6 to 5', 'win'], win: ['You win!', 'win'], dealer_bust: ['Dealer busts, you win!', 'win'],
  push: ['Push: your bet comes back.', ''], lose: ['Dealer wins.', 'lose'], bust: ['Bust! Over 21.', 'lose'], dealer_bj: ['Dealer has blackjack.', 'lose'],
};
const RED = new Set(['♥', '♦']);
const cardHtml = ([rank, suit], i) => (rank === '?'
  ? `<div class="bj-card back" style="--i:${i}"></div>`
  : `<div class="bj-card ${RED.has(suit) ? 'red' : ''}" style="--i:${i}"><b>${rank}</b><i>${suit}</i><span>${suit}</span></div>`);

export function casino(body, { game = null } = {}) {
  body.innerHTML = `
    <h2>${iconSvg(game === 'roulette' ? 'roulette' : 'casino')} ${game ? TITLES[game] : 'Casino'}</h2>
    <div class="tabs ${game ? 'hidden' : ''}"><button class="on" data-tab="slots">🎰 Slots</button><button data-tab="wheel">🎡 Wheel</button><button data-tab="coinflip">🪙 Coin flip</button><button data-tab="blackjack">🃏 Blackjack</button><button data-tab="roulette">🎡 Roulette</button><button data-tab="plinko">🔻 Plinko</button><button data-tab="dice">🎲 Dice</button><button data-tab="hilo">🂠 High-Low</button></div>
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
      <div data-pane="blackjack" class="hidden">
        <div class="bj-table">
          <div class="bj-row"><div class="bj-label">Dealer <em class="bj-dv"></em></div><div class="bj-hand bj-dealer"></div></div>
          <div class="bj-row"><div class="bj-label">You <em class="bj-pv"></em></div><div class="bj-hand bj-player"></div></div>
        </div>
        <div class="row center bj-actions">
          <button class="btn primary" id="bjDeal">Deal</button>
          <button class="btn hidden" id="bjHit">Hit</button>
          <button class="btn hidden" id="bjStand">Stand</button>
          <button class="btn hidden" id="bjDouble">Double</button>
        </div>
        <p class="muted small center">Get closer to 21 than the dealer without going over. Dealer hits soft 17, blackjack pays 6 to 5, and the house wins ties under 20.</p>
      </div>
      <div data-pane="roulette" class="hidden"></div>
      <div data-pane="plinko" class="hidden">
        <canvas class="plinko"></canvas>
        <button class="btn primary wide" id="dropPlinko">Drop the ball</button>
        <p class="muted small center">The ball bounces down through the pegs. The edge slots pay ×9!</p>
      </div>
      <div data-pane="dice" class="hidden">
        <div class="dice-stage"><span class="die">⚂</span><span class="die">⚄</span></div>
        <div class="row center"><button class="btn" data-dice="under">⬇ Under 7 (×2)</button><button class="btn" data-dice="seven">🎯 Exactly 7 (×5)</button><button class="btn" data-dice="over">⬆ Over 7 (×2)</button></div>
        <p class="muted small center">Two dice: call the total.</p>
      </div>
      <div data-pane="hilo" class="hidden">
        <div class="hilo-stage"><div class="hilo-card hilo-a">?</div><div class="hilo-card hilo-b back"></div></div>
        <div class="row center"><button class="btn" id="hiloDeal">Deal a card</button><button class="btn hidden" data-hilo="lower">⬇ Lower</button><button class="btn hidden" data-hilo="higher">⬆ Higher</button></div>
        <p class="muted small center">Is the next card higher or lower? The less likely the guess, the more it pays. A tie loses.</p>
      </div>
    </div>
    <p class="result big-result"></p>
    <p class="muted center">Balance: <b class="bal"></b> 🪙</p>`;
  const betInput = $(body, '.bet'), result = $(body, '.result'), bal = $(body, '.bal'), stage = $(body, '.casino-stage');
  const reels = [...body.querySelectorAll('.reel')], lever = $(body, '.lever'), coin = $(body, '.coin3d');
  let busy = false, timers = [], flips = 0, reelTicks = 0;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const showBalance = () => { if (!busy) bal.textContent = fmt(me().coins); };
  showBalance();

  let stopRoulette = null;
  const showTab = (tab) => {
    body.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    body.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== tab));
    $(body, '.bet-row').classList.toggle('hidden', tab === 'roulette');
    body.querySelector('.bal').parentElement.classList.toggle('hidden', false);
    result.textContent = '';
    if (tab === 'roulette' && !stopRoulette) stopRoulette = roulette($(body, '[data-pane=roulette]'));
  };
  body.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { if (!busy) showTab(b.dataset.tab); }));
  body.classList.toggle('casino-roulette', game === 'roulette');
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
      sfx('lever');
      clearInterval(reelTicks);
      reelTicks = setInterval(() => sfx('reeltick'), 75);
    }
    if (game === 'wheel') sfx('whoosh');
  };

  const finish = (m, text) => {
    busy = false;
    const won = m.payout > m.bet;
    result.textContent = text ?? (won ? `You won ${fmt(m.payout)} 🪙!` : m.payout === m.bet ? 'Bet returned.' : `You lost ${fmt(m.bet)} 🪙`);
    result.className = `result big-result ${won ? 'win' : m.payout === m.bet ? '' : 'lose'}`;
    if (won) confetti(stage, { count: m.payout >= m.bet * 10 ? 160 : 70 });
    if (m.payout >= m.bet * 10) sfx('jackpot');
    else if (won) sfx('coins', { n: Math.min(12, Math.round((m.payout / m.bet) * 3)) });
    else if (m.payout === m.bet) sfx('pop');
    else sfx('wah');
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
      wctx.fillStyle = wheelColor(mult, i);
      wctx.beginPath(); wctx.moveTo(0, 0); wctx.arc(0, 0, WS / 2 - 12, a0, a0 + seg); wctx.closePath(); wctx.fill();
      wctx.strokeStyle = '#c99700'; wctx.lineWidth = 1.5;
      wctx.stroke();
      wctx.save();
      wctx.rotate(a0 + seg / 2);
      wctx.fillStyle = wheelInk(mult);
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
    wctx.fillStyle = '#1a1320';
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
      sfx('wheeltick');
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

  // ---- plinko: pegs in a triangle, the ball follows the path the server rolled ----
  const plCanvas = $(body, '.plinko'), PW = 300, PH = 300, ROWS = 8;
  const pctx = hiDpiCanvas(plCanvas, PW, PH);
  let pball = null;
  const pegAt = (r, k) => ({ x: PW / 2 + (k - r / 2) * 30, y: 30 + r * 28 });
  function drawPlinko() {
    pctx.clearRect(0, 0, PW, PH);
    pctx.fillStyle = '#1a1030'; pctx.beginPath(); pctx.roundRect(0, 0, PW, PH, 16); pctx.fill();
    pctx.fillStyle = '#e8e2ff';
    for (let r = 0; r < ROWS; r++) for (let k = 0; k <= r + 1; k++) { const p = pegAt(r, k - 0.5); pctx.beginPath(); pctx.arc(p.x, p.y, 3.2, 0, TAU); pctx.fill(); }
    PLINKO_PAYS.forEach((mult, i) => {
      const x = PW / 2 + (i - 4) * 30;
      pctx.fillStyle = mult >= 3 ? '#ffc53d' : mult >= 1 ? '#7a2fc0' : '#3a2a5a';
      pctx.beginPath(); pctx.roundRect(x - 14, PH - 40, 28, 30, 6); pctx.fill();
      pctx.fillStyle = mult >= 3 ? '#3a2400' : '#ffffff'; pctx.font = '800 11px Rubik, sans-serif'; pctx.textAlign = 'center';
      pctx.fillText(`×${mult}`, x, PH - 21);
    });
    if (pball) { pctx.fillStyle = '#ff5d8f'; pctx.beginPath(); pctx.arc(pball.x, pball.y, 7, 0, TAU); pctx.fill(); pctx.strokeStyle = '#fff'; pctx.lineWidth = 2; pctx.stroke(); }
  }
  drawPlinko();
  const stopPlinko = loop((dt) => {
    if (!pball?.path) return;
    pball.t += dt * 5.5;
    const step = Math.floor(pball.t), f = pball.t - step;
    if (step >= ROWS) {
      const x = PW / 2 + (pball.slot - 4) * 30;
      pball.x += (x - pball.x) * 0.3; pball.y = Math.min(PH - 26, pball.y + dt * 220);
      drawPlinko();
      if (pball.y >= PH - 26 && !pball.done) { pball.done = true; const m = pball.msg; later(() => finish(m, `×${PLINKO_PAYS[m.slot]}! ${m.payout > m.bet ? `You won ${fmt(m.payout)} 🪙!` : m.payout ? `${fmt(m.payout)} 🪙 back.` : `You lost ${fmt(m.bet)} 🪙`}`), 250); }
      return;
    }
    // between pegs: from the column it's in, a little hop to the next row, left or right
    const col = pball.path.slice(0, step).reduce((a, b) => a + b, 0);
    const from = { x: PW / 2 + (col - step / 2) * 30, y: 12 + step * 28 }, dir = pball.path[step];
    const to = { x: PW / 2 + (col + dir - (step + 1) / 2) * 30, y: 12 + (step + 1) * 28 };
    pball.x = from.x + (to.x - from.x) * f;
    pball.y = from.y + (to.y - from.y) * f - Math.sin(f * Math.PI) * 8;
    if (step !== pball.lastStep) { pball.lastStep = step; sfx('wheeltick'); }
    drawPlinko();
  });
  $(body, '#dropPlinko').onclick = () => { pball = { x: PW / 2, y: 12, t: 0 }; drawPlinko(); play('plinko'); };

  // ---- dice ----
  body.querySelectorAll('[data-dice]').forEach((b) => (b.onclick = () => play('dice', { pick: b.dataset.dice })));

  // ---- high-low ----
  const hiloA = $(body, '.hilo-a'), hiloB = $(body, '.hilo-b');
  const cardFace = (el, n) => { el.classList.toggle('back', !n); el.textContent = n ? CARD_NAMES[n] : ''; el.classList.toggle('red', n === 1 || n > 10); };
  $(body, '#hiloDeal').onclick = () => { if (!busy) { net.send('hilo_deal'); cardFace(hiloB, 0); sfx('pop', { vol: 0.5 }); } };
  body.querySelectorAll('[data-hilo]').forEach((b) => (b.onclick = () => play('hilo', { pick: b.dataset.hilo })));

  // ---- coin ----
  body.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => play('coinflip', { pick: b.dataset.pick })));

  // ---- blackjack ----
  const bj = { shownP: 0, shownD: 0, lenD: 0, hole: false, done: true };
  const bjEl = (sel) => $(body, sel);
  function renderHand(el, cards, shown) {
    // only newly dealt cards animate in
    el.innerHTML = cards.map((c, i) => cardHtml(c, Math.max(0, i - shown))).join('');
    el.querySelectorAll('.bj-card').forEach((c, i) => c.classList.toggle('fresh', i >= shown));
  }
  function renderBj(m) {
    bj.open = !m.done;
    const newP = m.player.length - bj.shownP, newD = m.dealer.filter((c) => c[0] !== '?').length - bj.shownD;
    renderHand(bjEl('.bj-player'), m.player, bj.shownP);
    renderHand(bjEl('.bj-dealer'), m.dealer, bj.hole && m.done ? 1 : bj.lenD); // the hole card flips over at the end
    bj.lenD = m.dealer.length;
    bj.hole = !m.done;
    if (newP + newD > 0) for (let i = 0; i < Math.min(4, newP + newD); i++) later(() => sfx('place'), i * 140);
    bj.shownP = m.player.length;
    bj.shownD = m.dealer.filter((c) => c[0] !== '?').length;
    bjEl('.bj-pv').textContent = m.pv;
    bjEl('.bj-dv').textContent = m.done ? m.dv : `${m.dv} + ?`;
    bj.done = m.done;
    bjEl('#bjDeal').classList.toggle('hidden', !m.done);
    bjEl('#bjHit').classList.toggle('hidden', m.done);
    bjEl('#bjStand').classList.toggle('hidden', m.done);
    bjEl('#bjDouble').classList.toggle('hidden', m.done || !m.canDouble);
    $(body, '.bet-row').classList.toggle('locked', !m.done);
    if (m.done) {
      const [text, cls] = BJ_RESULTS[m.result] ?? ['', ''];
      later(() => {
        busy = false;
        result.textContent = `${text}${m.payout > m.bet ? ` +${fmt(m.payout - m.bet)} 🪙` : m.payout === m.bet ? '' : ` −${fmt(m.bet)} 🪙`}`;
        result.className = `result big-result ${cls}`;
        if (cls === 'win') { confetti(stage, { count: m.result === 'blackjack' ? 140 : 60 }); sfx(m.result === 'blackjack' ? 'jackpot' : 'coins', { n: 6 }); }
        else if (cls === 'lose') sfx('wah');
        else sfx('pop');
        showBalance();
      }, 450);
    }
  }
  bjEl('#bjDeal').onclick = () => {
    if (busy) return;
    busy = true;
    result.textContent = '';
    bj.shownP = bj.shownD = bj.lenD = 0;
    bj.hole = false;
    bjEl('.bj-player').innerHTML = bjEl('.bj-dealer').innerHTML = '';
    net.send('bj_deal', { bet: Number(betInput.value) });
    sfx('flip');
  };
  bjEl('#bjHit').onclick = () => net.send('bj_hit');
  bjEl('#bjStand').onclick = () => net.send('bj_stand');
  bjEl('#bjDouble').onclick = () => net.send('bj_double');

  const off = listen({
    gamble_result: (m) => {
      if (m.game === 'plinko') { if (pball) Object.assign(pball, { path: m.path, slot: m.slot, msg: m, t: 0, done: false }); return; }
      if (m.game === 'dice') {
        const dice = [...body.querySelectorAll('.die')];
        dice.forEach((d) => d.classList.add('rolling'));
        sfx('rattle');
        let ticks = 0;
        const roll = setInterval(() => { dice.forEach((d) => { d.textContent = DIE[1 + Math.floor(Math.random() * 6)]; }); if (++ticks > 9) clearInterval(roll); }, 70);
        later(() => {
          dice.forEach((d, i) => { d.classList.remove('rolling'); d.textContent = DIE[m.dice[i]]; });
          const total = m.dice[0] + m.dice[1];
          finish(m, `Rolled ${total}! ${m.payout ? `You won ${fmt(m.payout)} 🪙!` : `You lost ${fmt(m.bet)} 🪙`}`);
        }, 800);
        return;
      }
      if (m.game === 'hilo') {
        cardFace(hiloB, m.next);
        sfx('pop', { vol: 0.5 });
        body.querySelectorAll('[data-hilo]').forEach((b) => b.classList.add('hidden'));
        later(() => finish(m, `${CARD_NAMES[m.next]}! ${m.payout ? `You won ${fmt(m.payout)} 🪙!` : m.next === m.first ? 'A tie: the house wins.' : `You lost ${fmt(m.bet)} 🪙`}`), 500);
        return;
      }
      if (m.game === 'slots') {
        const durations = m.reels.map((sym, i) => spinReel(reels[i], sym, i));
        durations.forEach((d, i) => later(() => {
          sfx('reelstop');
          if (i === durations.length - 1) clearInterval(reelTicks);
        }, d));
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
        sfx('flip');
        later(() => sfx('reelstop'), 1300);
        later(() => finish(m, `${m.side === 'heads' ? '👑 HEADS' : '🦅 TAILS'}! ${m.payout ? `You won ${fmt(m.payout)} 🪙!` : `You lost ${fmt(m.bet)} 🪙`}`), 1450);
      }
    },
    error: (m) => {
      if (m.for?.startsWith('bj_')) { m.handled = true; busy = false; sfx('error'); result.textContent = m.msg; result.className = 'result big-result lose'; return; }
      if (m.for !== 'gamble') return;
      m.handled = true;
      clearInterval(reelTicks);
      sfx('error');
      reels.forEach((r) => r.classList.remove('spinning'));
      busy = false;
      result.textContent = m.msg;
      result.className = 'result big-result lose';
    },
    bj: renderBj,
    hilo_card: (m) => {
      cardFace(hiloA, m.card);
      for (const pick of ['higher', 'lower']) {
        const b = body.querySelector(`[data-hilo=${pick}]`);
        b.classList.toggle('hidden', !m[pick]);
        b.textContent = `${pick === 'higher' ? '⬆ Higher' : '⬇ Lower'} (×${m[pick]})`;
      }
      result.textContent = '';
    },
    player: (m) => { if (m.p.key === me().key) showBalance(); },
  });
  showTab(game ?? 'slots');
  return () => { if (bj.open) net.send('bj_stand'); /* (closing the table mid-hand: you stand) */ timers.forEach(clearTimeout); clearInterval(reelTicks); stopWheelLoop(); stopPlinko(); off(); stopRoulette?.(); body.classList.remove('casino-roulette'); };
}
