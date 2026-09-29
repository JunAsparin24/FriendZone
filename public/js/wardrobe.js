// Character creator, wardrobe and Style Shop (buying items + opening crates).
import { net } from './net.js';
import { S, esc, fmt, me, toast } from './state.js';
import { CATALOG, ITEMS, RARITY, owns, howToGet } from './catalog.js';
import { paintPortrait, portraitInto } from './avatar.js';
import { $, listen, hiDpiCanvas, loop, confetti } from './games/util.js';
import { sfx } from './sfx.js';

const TABS = [
  { id: 'body', label: '🧍 Body' },
  { id: 'eyes', label: '👀 Eyes' },
  { id: 'hair', label: '💇 Hair' },
  { id: 'top', label: '👕 Top' },
  { id: 'bottom', label: '👖 Bottom' },
  { id: 'hat', label: '🎩 Hat' },
  { id: 'face', label: '🕶️ Face' },
  { id: 'back', label: '🪽 Back' },
  { id: 'aura', label: '✨ Aura' },
  { id: 'crates', label: '🎁 Crates' },
];
const HEAD_SLOTS = new Set(['hair', 'hat', 'face']);
const DRAFT_DEFAULTS = {
  bottom: 'bottom_pants', shoeColor: '#23263f', eyeColor: '#1d1b2e', eyes: 'eyes_round', height: 'height_medium', build: 'build_regular',
};
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
const TILE = 98;

export function wardrobe(body, { mode = 'wardrobe', onSaved } = {}) {
  const creating = mode === 'create';
  const tabs = creating ? TABS.filter((t) => t.id !== 'crates') : TABS;
  let tab = mode === 'shop' ? 'crates' : 'body';
  let draft = { ...DRAFT_DEFAULTS, ...me().look };
  let confirmBuy = null, opening = false, waitingSave = false;

  body.innerHTML = `
    <h2>${creating ? '✨ Create your character' : mode === 'shop' ? '👕 Style Shop' : '👕 Wardrobe'}</h2>
    ${creating ? '<p class="muted">Pick your look. You\'ll unlock cooler stuff by playing, shopping and opening crates!</p>' : ''}
    <div class="wardrobe">
      <div class="wd-preview">
        <canvas class="wd-canvas"></canvas>
        <div class="wd-name"></div>
        <div class="wd-collection muted small"></div>
        <button class="btn primary wide" id="saveLook">${creating ? "Let's go!" : 'Save look'}</button>
      </div>
      <div class="wd-panel">
        <div class="tabs wd-tabs">${tabs.map((t) => `<button data-tab="${t.id}">${t.label}</button>`).join('')}</div>
        <div class="wd-content"></div>
      </div>
    </div>`;
  const content = $(body, '.wd-content');
  const canvas = $(body, '.wd-canvas');
  const PW = 180, PH = 230;
  const pctx = hiDpiCanvas(canvas, PW, PH);

  // live 3D preview: spins slowly, drag to turn the character
  let yaw = 0.5, spin = 0.6, dragX = null;
  canvas.style.cursor = 'grab';
  canvas.onpointerdown = (e) => { dragX = e.clientX; spin = 0; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => {
    if (dragX == null) return;
    yaw += (e.clientX - dragX) * 0.012;
    dragX = e.clientX;
  };
  canvas.onpointerup = () => { dragX = null; setTimeout(() => { if (dragX == null) spin = 0.6; }, 2500); };

  const stopPreview = loop((dt, now) => {
    yaw += spin * dt;
    pctx.clearRect(0, 0, PW, PH);
    const g = pctx.createRadialGradient(PW / 2, PH - 30, 10, PW / 2, PH - 30, 110);
    g.addColorStop(0, 'rgba(255,216,77,.25)');
    g.addColorStop(1, 'rgba(255,216,77,0)');
    pctx.fillStyle = g;
    pctx.fillRect(0, 0, PW, PH);
    pctx.fillStyle = '#3a6fd0';
    pctx.beginPath(); pctx.ellipse(PW / 2, PH - 18, 60, 14, 0, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = '#4579d6';
    pctx.beginPath(); pctx.ellipse(PW / 2, PH - 22, 60, 14, 0, 0, Math.PI * 2); pctx.fill();
    paintPortrait(pctx, draft, PW, PH - 12, { time: now / 1000, yaw });
  });

  function renderHeader() {
    const p = me();
    $(body, '.wd-name').textContent = p.name;
    const total = CATALOG.items.length;
    const have = CATALOG.items.filter((i) => owns(p, i.id)).length;
    $(body, '.wd-collection').textContent = `Collection ${have}/${total} · 🪙 ${fmt(p.coins)}`;
    body.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  }

  // colors come in rows of shades (lightest to darkest), so the grid lines families up
  function swatches(label, field, colors) {
    return `<div class="wd-label">${label}</div><div class="swatches palette">${colors.map((c) =>
      `<button type="button" class="swatch ${draft[field] === c ? 'on' : ''}" data-field="${field}" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join('')}</div>`;
  }

  // body options (height, build, eye style): always free, previewed on your own character
  function choices(label, field, options, zoom = 'body') {
    return `<div class="wd-label">${label}</div><div class="tiles choice-tiles">${options.map((o) =>
      `<button class="tile ${draft[field] === o.id ? 'on' : ''}" data-choice="${field}" data-id="${o.id}" style="--r:#c3c9e4" data-zoom="${zoom}">
        <span class="tile-art"></span><span class="tile-name">${esc(o.name)}</span><span class="tile-foot">${draft[field] === o.id ? '✓' : ''}</span>
      </button>`).join('')}</div>`;
  }

  function itemTiles(slot) {
    const p = me();
    const items = CATALOG.items.filter((i) => i.slot === slot)
      .sort((a, b) => (owns(p, b.id) - owns(p, a.id)) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
    return `<div class="tiles">${items.map((it) => {
      const owned = owns(p, it.id);
      const footer = owned ? (draft[slot] === it.id ? '✓ Wearing' : '')
        : confirmBuy === it.id ? `Buy for ${fmt(it.price)}?`
          : it.price ? `🪙 ${fmt(it.price)}` : it.unlock ? `🔒 ${esc(it.unlock.hint)}` : it.drop ? `👾 ${esc(it.drop)}` : '🎁 Crates';
      return `<button class="tile ${owned ? '' : 'locked'} ${draft[slot] === it.id ? 'on' : ''} ${confirmBuy === it.id ? 'confirm' : ''}"
        data-id="${it.id}" style="--r:${RARITY[it.rarity].color}" title="${esc(it.name)} · ${RARITY[it.rarity].label} · ${esc(howToGet(it))}">
        <span class="tile-art"></span><span class="tile-name">${esc(it.name)}</span><span class="tile-foot">${footer}</span>
      </button>`;
    }).join('')}</div>`;
  }

  function renderContent() {
    renderHeader();
    if (tab === 'crates') return renderCrates();
    if (tab === 'body') {
      content.innerHTML = swatches('Skin tone', 'skin', CATALOG.skins)
        + choices('Height', 'height', CATALOG.heights) + choices('Build', 'build', CATALOG.builds);
    } else if (tab === 'eyes') {
      content.innerHTML = choices('Eye style', 'eyes', CATALOG.eyeStyles, 'head') + swatches('Eye color', 'eyeColor', CATALOG.eyeColors);
    } else {
      content.innerHTML = itemTiles(tab)
        + (tab === 'hair' ? swatches('Hair color', 'hairColor', CATALOG.hairColors) : '')
        + (tab === 'top' ? swatches('Shirt color', 'topColor', CATALOG.clothColors) : '')
        + (tab === 'bottom' ? swatches('Bottoms color', 'bottomColor', CATALOG.clothColors) + swatches('Shoe color', 'shoeColor', CATALOG.clothColors) : '');
    }
    content.querySelectorAll('.tile').forEach((t) => {
      const field = t.dataset.choice ?? tab;
      const look = { ...draft, [field]: t.dataset.id };
      const zoom = t.dataset.zoom ?? (HEAD_SLOTS.has(tab) ? 'head' : 'body');
      portraitInto(t.querySelector('.tile-art'), look, 70, 76, { zoom });
    });
  }

  content.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-field]');
    if (sw) {
      draft[sw.dataset.field] = sw.dataset.color;
      renderContent();
      return;
    }
    const choice = e.target.closest('[data-choice]');
    if (choice) {
      if (draft[choice.dataset.choice] !== choice.dataset.id) sfx('swap');
      draft[choice.dataset.choice] = choice.dataset.id;
      renderContent();
      return;
    }
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const it = ITEMS[tile.dataset.id];
    if (owns(me(), it.id)) {
      if (draft[it.slot] !== it.id) sfx('swap');
      draft[it.slot] = it.id;
      confirmBuy = null;
    } else if (it.price) {
      if (confirmBuy === it.id) {
        net.send('buy', { id: it.id });
        confirmBuy = null;
      } else confirmBuy = it.id;
    } else {
      toast(it.unlock ? `🔒 ${it.name}: ${it.unlock.hint}` : it.drop ? `👾 ${it.name} drops from the ${it.drop} in the Boss Cave.` : `🎁 ${it.name} only comes from crates.`);
    }
    renderContent();
  });

  body.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    if (opening) return;
    tab = b.dataset.tab;
    confirmBuy = null;
    renderContent();
  }));

  $(body, '#saveLook').onclick = () => {
    waitingSave = true;
    net.send('look', { look: draft });
  };

  // ---- crates ----
  function renderCrates() {
    const price = CATALOG.crate.price;
    const w = CATALOG.crate.weights;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    const left = CATALOG.items.filter((i) => i.crate && !me().owned.includes(i.id)).length;
    content.innerHTML = `
      <div class="crate-area">
        <div class="crate-box"><div class="crate-lid"></div><div class="crate-body">?</div></div>
        <div class="crate-reel hidden"><div class="crate-strip"></div><div class="crate-marker"></div></div>
        <div class="crate-reveal hidden"></div>
        <button class="btn primary" id="openCrate" ${left ? '' : 'disabled'}>${left ? `Open a crate · 🪙 ${price}` : 'You own every crate item!'}</button>
        <div class="odds">${RARITY_ORDER.map((r) => `<span style="color:${RARITY[r].color}">${RARITY[r].label} ${Math.round((w[r] / total) * 100)}%</span>`).join(' · ')}</div>
        <p class="muted small">${left} crate items left to find. You never get a duplicate.</p>
      </div>`;
    $(content, '#openCrate').onclick = () => {
      if (opening) return;
      opening = true;
      $(content, '#openCrate').disabled = true;
      $(content, '.crate-box').classList.add('shake');
      sfx('rattle');
      net.send('crate');
    };
  }

  function spinCrate(wonId) {
    const pool = CATALOG.items.filter((i) => i.crate);
    const weights = CATALOG.crate.weights;
    const pick = () => {
      let r = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
      const rarity = RARITY_ORDER.find((k) => (r -= weights[k]) < 0) ?? 'common';
      const options = pool.filter((i) => i.rarity === rarity);
      return (options.length ? options : pool)[Math.floor(Math.random() * (options.length || pool.length))];
    };
    const WIN = 34;
    const list = Array.from({ length: 40 }, (_, i) => (i === WIN ? ITEMS[wonId] : pick()));
    const reel = $(content, '.crate-reel'), strip = $(content, '.crate-strip');
    $(content, '.crate-box').classList.add('hidden');
    reel.classList.remove('hidden');
    strip.innerHTML = list.map((it) => `<div class="ctile" style="--r:${RARITY[it.rarity].color}"><span></span><b>${esc(it.name)}</b></div>`).join('');
    strip.querySelectorAll('.ctile').forEach((el, i) => {
      portraitInto(el.querySelector('span'), { ...draft, [list[i].slot]: list[i].id }, 64, 64, { zoom: HEAD_SLOTS.has(list[i].slot) ? 'head' : 'body' });
    });
    const center = reel.clientWidth / 2;
    const offset = WIN * TILE + TILE / 2 - center + (Math.random() - 0.5) * (TILE * 0.6);
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0)';
    void strip.offsetWidth;
    strip.style.transition = 'transform 4.6s cubic-bezier(.08,.75,.18,1)';
    strip.style.transform = `translateX(${-offset}px)`;
    // tick every time a tile passes the marker
    let lastTile = -1;
    const stopTicks = loop(() => {
      const x = new DOMMatrix(getComputedStyle(strip).transform).m41;
      const tile = Math.floor((center - x) / TILE);
      if (tile !== lastTile) { if (lastTile >= 0) sfx('cratetick'); lastTile = tile; }
    });
    setTimeout(() => { stopTicks(); reveal(wonId); }, 4800);
  }

  function reveal(id) {
    const it = ITEMS[id], r = RARITY[it.rarity];
    const box = $(content, '.crate-reveal');
    if (!box) return;
    $(content, '.crate-reel').classList.add('hidden');
    box.classList.remove('hidden');
    box.style.setProperty('--r', r.color);
    sfx('reveal', { rarity: it.rarity });
    box.innerHTML = `<div class="rv-art"></div><div class="rv-rarity">${r.label}</div><div class="rv-name">${esc(it.name)}</div>
      <div class="row center"><button class="btn primary" id="equipWon">Wear it</button><button class="btn" id="again">Open another</button></div>`;
    portraitInto(box.querySelector('.rv-art'), { ...draft, [it.slot]: id }, 120, 130, { zoom: HEAD_SLOTS.has(it.slot) ? 'head' : 'body' });
    if (it.rarity !== 'common') confetti(box.parentElement, { count: it.rarity === 'legendary' ? 180 : 90, colors: [r.color, '#fff', '#ffd84d'] });
    opening = false;
    $(box, '#equipWon').onclick = () => {
      draft[it.slot] = id;
      tab = it.slot;
      renderContent();
    };
    $(box, '#again').onclick = renderCrates;
  }

  const off = listen({
    player: (m) => {
      if (m.p.key !== S.me) return;
      if (waitingSave && m.p.lookSet) {
        waitingSave = false;
        toast('Looking good! ✨');
        if (onSaved) return onSaved(); // closes the modal and unmounts us
      }
      if (!opening) renderContent();
      else renderHeader();
    },
    unlock: (m) => {
      if (ITEMS[m.id] && m.source === 'shop') { draft[ITEMS[m.id].slot] = m.id; sfx('buy'); }
    },
    crate_result: (m) => spinCrate(m.id),
    error: (m) => {
      if (!['look', 'buy', 'crate'].includes(m.for)) return;
      if (m.for === 'crate') { opening = false; renderCrates(); }
      waitingSave = false;
    },
  });

  renderContent();
  return () => { stopPreview(); off(); };
}
