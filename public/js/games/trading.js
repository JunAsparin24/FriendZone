// Trading post: send coins to anyone in the zone.
import { net } from '../net.js';
import { S, esc, fmt, me, nameOf } from '../state.js';
import { portraitInto } from '../avatar.js';
import { $, listen } from './util.js';

export function trading(body) {
  const others = Object.values(S.players)
    .filter((p) => p.key !== S.me)
    .sort((a, b) => b.online - a.online || a.name.localeCompare(b.name));
  if (!others.length) {
    body.innerHTML = `<h2>💰 Trading Post</h2><p class="muted">Nobody else is in this zone yet. Copy the invite link from the lobby and bring your friends!</p>`;
    return () => {};
  }
  body.innerHTML = `
    <h2>💰 Trading Post</h2>
    <p class="muted">Send coins to anyone in your zone, even if they're offline.</p>
    <div class="friend-picker">${others.map((p) => `
      <button class="friend" data-k="${esc(p.key)}">
        <span class="fav"></span><b>${esc(p.name)}</b><small>${p.online ? '● online' : 'offline'}</small>
      </button>`).join('')}</div>
    <form class="gift-row">
      <input name="amount" type="number" min="1" required placeholder="Amount">
      <div class="chips"><button type="button" data-a="50">50</button><button type="button" data-a="100">100</button><button type="button" data-a="500">500</button></div>
      <button class="btn primary">Send 🪙</button>
    </form>
    <p class="result"></p>
    <p class="muted">You have <b class="bal"></b> 🪙</p>`;
  const bal = $(body, '.bal'), result = $(body, '.result'), form = $(body, 'form');
  let to = others[0].key, pending = null;
  body.querySelectorAll('.friend').forEach((b) => {
    portraitInto(b.querySelector('.fav'), S.players[b.dataset.k].look, 56, 56, { zoom: 'head' });
    b.onclick = () => { to = b.dataset.k; mark(); };
  });
  const mark = () => body.querySelectorAll('.friend').forEach((b) => b.classList.toggle('on', b.dataset.k === to));
  mark();
  body.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { form.amount.value = b.dataset.a; }));
  const showBalance = () => (bal.textContent = fmt(me().coins));
  showBalance();
  form.onsubmit = (e) => {
    e.preventDefault();
    pending = { to, amount: Number(form.amount.value) };
    net.send('gift', pending);
  };
  return listen({
    player: (m) => {
      if (m.p.key !== S.me) return;
      showBalance();
      if (pending) {
        result.textContent = `Sent ${fmt(pending.amount)} 🪙 to ${nameOf(pending.to)}!`;
        result.className = 'result win';
        form.amount.value = '';
        pending = null;
      }
    },
    error: (m) => {
      if (m.for !== 'gift') return;
      m.handled = true;
      pending = null;
      result.textContent = m.msg;
      result.className = 'result lose';
    },
  });
}
