// Trading window (only in the tavern): both sides put coins, cosmetics and furniture on the table,
// then both press Ready. Any change un-readies both, so nobody gets surprised.
import { net } from '../net.js';
import { S, esc, fmt, me, nameOf } from '../state.js';
import { CATALOG, ITEMS, RARITY } from '../catalog.js';
import { furnitureThumb } from '../three/furniture.js';
import { $, listen, confetti } from './util.js';
import { sfx } from '../sfx.js';

const FURN = Object.fromEntries(CATALOG.furniture.map((f) => [f.id, f]));
const tradable = (id) => { const it = ITEMS[id]; return it && !it.free && !it.unlock && !it.achievement; };

/** Mount the trade window for trade `t` (kept up to date through `update`). */
export function tradeWindow(body, first) {
  let t = first, sendTimer = 0, closed = false;
  const other = () => t.who.find((k) => k !== S.me);
  const mine = () => t.offers[S.me];
  let draft = JSON.parse(JSON.stringify(mine()));

  body.innerHTML = `
    <h2>🤝 Trading with <span class="tr-name"></span></h2>
    <div class="trade">
      <div class="tr-side tr-me">
        <h3>You give</h3>
        <label class="tr-coins">🪙 <input type="number" min="0" step="10" value="0"> <small>of <b class="tr-bal"></b></small></label>
        <div class="wd-label">Cosmetics</div><div class="tr-pick tr-items"></div>
        <div class="wd-label">Furniture</div><div class="tr-pick tr-furni"></div>
      </div>
      <div class="tr-side tr-them">
        <h3><span class="tr-name"></span> gives</h3>
        <div class="tr-offer"></div>
      </div>
    </div>
    <p class="error tr-err"></p>
    <div class="row center tr-actions">
      <button class="btn primary tr-ready">✓ Ready</button>
      <button class="btn ghost tr-cancel">Cancel trade</button>
    </div>
    <p class="muted small center tr-status"></p>`;
  const coinsIn = $(body, '.tr-coins input');

  const itemChip = (id, on, clickable) => {
    const it = ITEMS[id], r = RARITY[it?.rarity] ?? RARITY.common;
    return `<button class="tr-chip ${on ? 'on' : ''}" ${clickable ? `data-item="${id}"` : 'disabled'} style="--r:${r.color}"><b>${esc(it?.name ?? id)}</b><small>${r.label} ${esc(it?.slot ?? '')}</small></button>`;
  };
  const furniChip = (id, n, have, clickable) => `
    <button class="tr-chip furn ${n ? 'on' : ''}" ${clickable ? `data-furni="${id}"` : 'disabled'}>
      <img src="${furnitureThumb(id)}" alt=""><b>${esc(FURN[id]?.name ?? id)}</b><small>${clickable ? `${n}/${have}` : `×${n}`}</small></button>`;

  const push = () => {
    clearTimeout(sendTimer);
    sendTimer = setTimeout(() => net.send('trade_offer', draft), 250);
  };

  const render = () => {
    body.querySelectorAll('.tr-name').forEach((el) => { el.textContent = nameOf(other()); });
    $(body, '.tr-bal').textContent = fmt(me().coins);
    if (document.activeElement !== coinsIn) coinsIn.value = draft.coins;
    const myItems = me().owned.filter(tradable);
    $(body, '.tr-items').innerHTML = myItems.length ? myItems.map((id) => itemChip(id, draft.items.includes(id), true)).join('') : '<p class="muted small">No tradable cosmetics (free ones and trophies can\'t be traded).</p>';
    const myFurni = Object.entries(me().furni ?? {}).filter(([id, n]) => n > 0 && FURN[id]?.price);
    $(body, '.tr-furni').innerHTML = myFurni.length ? myFurni.map(([id, n]) => furniChip(id, draft.furni[id] ?? 0, n, true)).join('') : '<p class="muted small">No furniture to trade.</p>';
    const theirs = t.offers[other()];
    const parts = [];
    if (theirs.coins) parts.push(`<div class="tr-coinline">🪙 <b>${fmt(theirs.coins)}</b> coins</div>`);
    parts.push(...theirs.items.map((id) => itemChip(id, true, false)));
    parts.push(...Object.entries(theirs.furni).map(([id, n]) => furniChip(id, n, n, false)));
    $(body, '.tr-offer').innerHTML = parts.length ? `<div class="tr-pick">${parts.join('')}</div>` : '<p class="muted">Nothing yet…</p>';
    const iReady = t.ready[S.me], theyReady = t.ready[other()];
    const btn = $(body, '.tr-ready');
    btn.textContent = iReady ? '✓ Ready! (click to undo)' : '✓ Ready';
    btn.classList.toggle('on', iReady);
    $(body, '.tr-them').classList.toggle('ready', theyReady);
    $(body, '.tr-me').classList.toggle('ready', iReady);
    $(body, '.tr-status').textContent = iReady && theyReady ? 'Swapping…' : iReady ? `Waiting for ${nameOf(other())} to press Ready…` : theyReady ? `${nameOf(other())} is ready. Check their offer, then press Ready!` : 'Put things on the table, then both press Ready.';
  };

  coinsIn.addEventListener('input', () => { draft.coins = Math.max(0, Math.min(me().coins, Math.floor(Number(coinsIn.value) || 0))); push(); });
  body.addEventListener('click', (e) => {
    const it = e.target.closest('[data-item]'), fu = e.target.closest('[data-furni]');
    if (it) {
      const id = it.dataset.item;
      draft.items = draft.items.includes(id) ? draft.items.filter((x) => x !== id) : [...draft.items, id];
      sfx('pop', { vol: 0.4 }); push(); render();
    } else if (fu) {
      const id = fu.dataset.furni, have = me().furni[id] ?? 0;
      const n = ((draft.furni[id] ?? 0) + 1) % (have + 1);
      if (n) draft.furni[id] = n; else delete draft.furni[id];
      sfx('pop', { vol: 0.4 }); push(); render();
    } else if (e.target.closest('.tr-ready')) {
      clearTimeout(sendTimer);
      net.send('trade_offer', draft);
      setTimeout(() => net.send('trade_ready', { on: !t.ready[S.me] }), 80);
      sfx('click');
    } else if (e.target.closest('.tr-cancel')) {
      closed = true;
      net.send('trade_cancel');
    }
  });

  const off = listen({
    trade: (m) => {
      if (m.id !== t.id) return;
      t = m;
      $(body, '.tr-err').textContent = m.error ?? '';
      if (m.error) sfx('error');
      render();
    },
    trade_done: (m) => {
      if (m.id !== t.id) return;
      closed = true;
      sfx('reveal', { rarity: 'rare' });
      confetti(body, { count: 120 });
      $(body, '.tr-status').textContent = 'Trade complete!';
      body.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    },
    player: () => { if (!closed) render(); },
  });
  render();
  return () => {
    off();
    clearTimeout(sendTimer);
    if (!closed) net.send('trade_cancel');
  };
}
