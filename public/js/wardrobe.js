// Character creator, wardrobe and Style Shop (buying items + opening crates).
import { net } from './net.js';
import { S, esc, fmt, me, toast } from './state.js';
import { CATALOG, ITEMS, RARITY, owns, howToGet } from './catalog.js';
import { paintPortrait, portraitInto } from './avatar.js';
import { $, listen, hiDpiCanvas, loop, confetti } from './games/util.js';
import { sfx } from './sfx.js';

const TABS = [
  { id: 'body', icon: '🧍', label: 'Body' },
  { id: 'eyes', icon: '👀', label: 'Eyes' },
  { id: 'hair', icon: '💇', label: 'Hair' },
  { id: 'top', icon: '👕', label: 'Top' },
  { id: 'bottom', icon: '👖', label: 'Bottom' },
  { id: 'hat', icon: '🎩', label: 'Hat' },
  { id: 'face', icon: '🕶️', label: 'Face' },
  { id: 'back', icon: '🪽', label: 'Back' },
  { id: 'aura', icon: '✨', label: 'Aura' },
  { id: 'pet', icon: '🐾', label: 'Pet' },
  { id: 'crates', icon: '🎁', label: 'Crates' },
];
const TITLES = {
  body: 'Body & skin', eyes: 'Eyes', hair: 'Hairstyle', top: 'Tops', bottom: 'Bottoms', hat: 'Hats',
  face: 'Glasses & masks', back: 'Backpacks & wings', aura: 'Auras', pet: 'Pets', crates: 'Mystery crates',
};
const HEAD_SLOTS = new Set(['hair', 'hat', 'face']);
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
const DRAFT_DEFAULTS = {
  bottom: 'bottom_pants', shoeColor: '#23263f', eyeColor: '#1d1b2e', eyes: 'eyes_round', height: 'height_medium', build: 'build_regular', pet: 'pet_none',
};
const TILE = 98;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const zoomFor = (slot) => (slot === 'pet' ? 'pet' : HEAD_SLOTS.has(slot) || slot === 'eyes' ? 'head' : 'body');

export function wardrobe(body, { mode = 'wardrobe', tab: startTab = null, onSaved } = {}) {
  const creating = mode === 'create';
  const tabs = creating ? TABS.filter((t) => t.id !== 'crates') : TABS;
  let tab = startTab ?? (mode === 'shop' ? 'crates' : 'body');
  const saved = { ...DRAFT_DEFAULTS, ...me().look };
  let draft = { ...saved };
  let filter = 'all', confirmBuy = null, opening = false, waitingSave = false, previewZoom = 'body';

  body.innerHTML = `
    <div class="wd2">
      <aside class="wd2-stage">
        <h2 class="wd2-title">${creating ? '✨ Create your character' : mode === 'shop' ? '👕 Style Shop' : '🪞 Wardrobe'}</h2>
        <div class="wd2-preview"><canvas class="wd-canvas"></canvas>
          <div class="wd2-zoom"><button data-zoom="body" class="on" title="Full body">🧍</button><button data-zoom="head" title="Close-up">🙂</button><button data-zoom="pet" title="Your pet">🐾</button></div>
        </div>
        <div class="wd-name"></div>
        <div class="wd-collection muted small"></div>
        <div class="wd2-tools"><button class="btn small" id="wdRandom" title="Random outfit from things you own">🎲 Random</button><button class="btn small" id="wdReset" title="Undo your changes">↺ Reset</button></div>
        <button class="btn primary wide" id="saveLook">${creating ? "Let's go!" : 'Save look'}</button>
        <div class="wd2-unsaved muted small"></div>
      </aside>
      <nav class="wd2-rail">${tabs.map((t) => `<button data-tab="${t.id}"><span>${t.icon}</span>${t.label}</button>`).join('')}</nav>
      <section class="wd2-panel">
        <div class="wd2-head"><h3 class="wd2-section"></h3><div class="wd2-filters"></div></div>
        <div class="wd-content"></div>
      </section>
    </div>`;
  const content = $(body, '.wd-content');
  const canvas = $(body, '.wd-canvas');
  const PW = 220, PH = 290;
  const pctx = hiDpiCanvas(canvas, PW, PH);

  // live 3D preview: spins slowly, drag to turn the character
  let yaw = 0.5, spin = 0.5, dragX = null;
  canvas.style.cursor = 'grab';
  canvas.onpointerdown = (e) => { dragX = e.clientX; spin = 0; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => {
    if (dragX == null) return;
    yaw += (e.clientX - dragX) * 0.012;
    dragX = e.clientX;
  };
  canvas.onpointerup = () => { dragX = null; setTimeout(() => { if (dragX == null) spin = 0.5; }, 2500); };

  const stopPreview = loop((dt, now) => {
    yaw += spin * dt;
    pctx.clearRect(0, 0, PW, PH);
    const g = pctx.createRadialGradient(PW / 2, PH - 30, 10, PW / 2, PH - 30, 130);
    g.addColorStop(0, 'rgba(255,216,77,.28)');
    g.addColorStop(1, 'rgba(255,216,77,0)');
    pctx.fillStyle = g;
    pctx.fillRect(0, 0, PW, PH);
    if (previewZoom === 'body') {
      pctx.fillStyle = '#3a6fd0';
      pctx.beginPath(); pctx.ellipse(PW / 2, PH - 18, 72, 16, 0, 0, Math.PI * 2); pctx.fill();
      pctx.fillStyle = '#4f86e8';
      pctx.beginPath(); pctx.ellipse(PW / 2, PH - 22, 72, 16, 0, 0, Math.PI * 2); pctx.fill();
    }
    paintPortrait(pctx, draft, PW, PH - (previewZoom === 'body' ? 12 : 0), { time: now / 1000, yaw, zoom: previewZoom === 'head' ? 'bust' : previewZoom });
  });

  const changed = () => JSON.stringify(draft) !== JSON.stringify(saved);

  function renderHeader() {
    const p = me();
    $(body, '.wd-name').textContent = p.name;
    const total = CATALOG.items.length;
    const have = CATALOG.items.filter((i) => owns(p, i.id)).length;
    $(body, '.wd-collection').textContent = `Collection ${have}/${total} · 🪙 ${fmt(p.coins)}`;
    body.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $(body, '.wd2-section').textContent = TITLES[tab];
    const itemsTab = !['body', 'eyes', 'crates'].includes(tab);
    $(body, '.wd2-filters').innerHTML = itemsTab
      ? [['all', 'All'], ['owned', 'Owned'], ['new', 'Not yet']].map(([id, label]) => `<button data-filter="${id}" class="${filter === id ? 'on' : ''}">${label}</button>`).join('')
      : '';
    $(body, '.wd2-unsaved').textContent = !creating && changed() ? '● Unsaved changes' : '';
    $(body, '#saveLook').classList.toggle('pulse', !creating && changed());
  }

  // colors come in rows of shades (lightest to darkest), so the grid lines families up
  function swatches(label, field, colors, { original = false } = {}) {
    const cur = draft[field] ?? '';
    return `<div class="wd2-card"><div class="wd-label">${label} ${cur ? `<i class="wd2-chip" style="--c:${cur}"></i>` : ''}</div><div class="swatches palette">${
      original ? `<button type="button" class="swatch orig ${cur ? '' : 'on'}" data-field="${field}" data-color="" title="Original colour">↺</button>` : ''}${colors.map((c) =>
      `<button type="button" class="swatch ${cur === c ? 'on' : ''}" data-field="${field}" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join('')}</div></div>`;
  }
  // hats and back items marked "tint" can be recoloured from the full palette
  const tintPicker = (slot, field, label) => (ITEMS[draft[slot]]?.tint ? swatches(`${label} (${esc(ITEMS[draft[slot]].name)})`, field, CATALOG.clothColors, { original: true }) : '');

  // tops: the main colour (tops with their own look, like suits, can be recoloured or kept original)
  // plus an accent for the tie / stripes / trim
  function topPickers() {
    const it = ITEMS[draft.top];
    const name = esc(it?.name ?? 'Top');
    return (it?.tint ? swatches(`${name} color`, 'topTint', CATALOG.clothColors, { original: true }) : swatches('Shirt color', 'topColor', CATALOG.clothColors))
      + (it?.accent ? swatches(`Accent · tie, stripes & trim`, 'topAccent', CATALOG.clothColors, { original: true }) : '');
  }

  // body options (height, build, eye style): always free, previewed on your own character
  function choices(label, field, options, zoom = 'body') {
    return `<div class="wd2-card"><div class="wd-label">${label}</div><div class="tiles choice-tiles">${options.map((o) =>
      `<button class="tile ${draft[field] === o.id ? 'on' : ''}" data-choice="${field}" data-id="${o.id}" style="--r:#c3c9e4" data-zoom="${zoom}">
        <span class="tile-art"></span><span class="tile-name">${esc(o.name)}</span><span class="tile-foot">${draft[field] === o.id ? '✓' : ''}</span>
      </button>`).join('')}</div></div>`;
  }

  function itemTiles(slot) {
    const p = me();
    const items = CATALOG.items.filter((i) => i.slot === slot)
      .filter((i) => filter === 'all' || (filter === 'owned') === owns(p, i.id))
      .sort((a, b) => (owns(p, b.id) - owns(p, a.id)) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
    if (!items.length) return `<p class="muted">${filter === 'owned' ? "You don't own anything here yet." : 'You own everything here!'}</p>`;
    return `<div class="tiles">${items.map((it) => {
      const owned = owns(p, it.id);
      const footer = owned ? (draft[slot] === it.id ? '✓ Wearing' : 'Owned')
        : confirmBuy === it.id ? `Buy for ${fmt(it.price)}?`
          : it.price ? `🪙 ${fmt(it.price)}` : it.unlock ? `🔒 ${esc(it.unlock.hint)}` : it.drop ? `👾 ${esc(it.drop)}` : '🎁 Crates';
      return `<button class="tile ${owned ? '' : 'locked'} ${draft[slot] === it.id ? 'on' : ''} ${confirmBuy === it.id ? 'confirm' : ''}"
        data-id="${it.id}" style="--r:${RARITY[it.rarity].color}" title="${esc(it.name)} · ${RARITY[it.rarity].label} · ${esc(howToGet(it))}">
        <span class="tile-rarity">${RARITY[it.rarity].label}</span>${owned ? '' : '<span class="tile-lock">🔒</span>'}
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
      content.innerHTML = `<div class="wd2-card">${itemTiles(tab)}${tab === 'pet' ? '<p class="muted small">Buy pets here, or hatch a random one from an egg at the 🐾 Pet Shop in town (cheaper!).</p>' : ''}</div>`
        + (tab === 'hair' ? swatches('Hair color', 'hairColor', CATALOG.hairColors) : '')
        + (tab === 'top' ? topPickers() : '')
        + (tab === 'bottom' ? swatches('Bottoms color', 'bottomColor', CATALOG.clothColors)
          + choices('Shoes', 'shoes', CATALOG.shoeStyles, 'feet') + swatches('Shoe color', 'shoeColor', CATALOG.clothColors)
          + choices('Socks', 'socks', CATALOG.sockStyles, 'feet') + swatches('Sock color', 'sockColor', CATALOG.clothColors) : '')
        + (tab === 'hat' ? tintPicker('hat', 'hatColor', 'Hat color') : '')
        + (tab === 'back' ? tintPicker('back', 'backColor', 'Color') : '');
    }
    content.querySelectorAll('.tile').forEach((t) => {
      const field = t.dataset.choice ?? tab;
      const look = { ...draft, [field]: t.dataset.id };
      const zoom = t.dataset.zoom ?? zoomFor(tab);
      portraitInto(t.querySelector('.tile-art'), look, 84, 90, { zoom });
    });
  }

  function setZoom(z) {
    previewZoom = z;
    body.querySelectorAll('[data-zoom]').forEach((b) => b.classList.toggle('on', b.dataset.zoom === z));
  }

  function showTab(id) {
    tab = id;
    confirmBuy = null;
    if (id !== 'crates') setZoom(zoomFor(id));
    renderContent();
    content.scrollTop = 0;
  }

  content.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-field]');
    if (sw) {
      draft[sw.dataset.field] = sw.dataset.color;
      sfx('click');
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

  body.querySelector('.wd2-panel').addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; renderContent(); }
  });
  body.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { if (!opening) showTab(b.dataset.tab); }));
  body.querySelectorAll('[data-zoom]').forEach((b) => (b.onclick = () => setZoom(b.dataset.zoom)));

  $(body, '#wdRandom').onclick = () => {
    const p = me();
    for (const slot of ['hair', 'top', 'bottom', 'hat', 'face', 'back', 'aura', 'pet']) {
      const options = CATALOG.items.filter((i) => i.slot === slot && owns(p, i.id));
      if (options.length) draft[slot] = pick(options).id;
    }
    draft.hairColor = pick(CATALOG.hairColors);
    draft.topColor = pick(CATALOG.clothColors);
    draft.bottomColor = pick(CATALOG.clothColors);
    draft.shoeColor = pick(CATALOG.clothColors);
    draft.eyeColor = pick(CATALOG.eyeColors);
    draft.eyes = pick(CATALOG.eyeStyles).id;
    sfx('swap');
    renderContent();
  };
  $(body, '#wdReset').onclick = () => { draft = { ...saved }; sfx('pop'); renderContent(); };

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
        <button class="btn primary" id="openCrate">Open a crate · 🪙 ${price}</button>
        <div class="odds">${RARITY_ORDER.map((r) => `<span style="color:${RARITY[r].color}">${RARITY[r].label} ${Math.round((w[r] / total) * 100)}%</span>`).join(' · ')}</div>
        <p class="muted small">${left} crate items left to find. Get one you already own and you get half your coins back.</p>
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

  let lastDupe = 0;
  function spinCrate(wonId) {
    const pool = CATALOG.items.filter((i) => i.crate);
    const weights = CATALOG.crate.weights;
    const pickOne = () => {
      let r = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
      const rarity = RARITY_ORDER.find((k) => (r -= weights[k]) < 0) ?? 'common';
      const options = pool.filter((i) => i.rarity === rarity);
      return (options.length ? options : pool)[Math.floor(Math.random() * (options.length || pool.length))];
    };
    const WIN = 34;
    const list = Array.from({ length: 40 }, (_, i) => (i === WIN ? ITEMS[wonId] : pickOne()));
    const reel = $(content, '.crate-reel'), strip = $(content, '.crate-strip');
    $(content, '.crate-box').classList.add('hidden');
    reel.classList.remove('hidden');
    strip.innerHTML = list.map((it) => `<div class="ctile" style="--r:${RARITY[it.rarity].color}"><span></span><b>${esc(it.name)}</b></div>`).join('');
    strip.querySelectorAll('.ctile').forEach((el, i) => {
      portraitInto(el.querySelector('span'), { ...draft, [list[i].slot]: list[i].id }, 64, 64, { zoom: zoomFor(list[i].slot) });
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
      ${lastDupe ? `<div class="rv-dupe">Duplicate! You got <b>🪙 ${fmt(lastDupe)}</b> back.</div>` : ''}
      <div class="row center"><button class="btn primary" id="equipWon">Wear it</button><button class="btn" id="again">Open another</button></div>`;
    portraitInto(box.querySelector('.rv-art'), { ...draft, [it.slot]: id }, 120, 130, { zoom: zoomFor(it.slot) });
    if (it.rarity !== 'common') confetti(box.parentElement, { count: it.rarity === 'legendary' ? 180 : 90, colors: [r.color, '#fff', '#ffd84d'] });
    opening = false;
    $(box, '#equipWon').onclick = () => {
      draft[it.slot] = id;
      showTab(it.slot);
    };
    $(box, '#again').onclick = renderCrates;
  }

  const off = listen({
    player: (m) => {
      if (m.p.key !== S.me) return;
      if (waitingSave && m.p.lookSet) {
        waitingSave = false;
        Object.assign(saved, draft);
        toast('Looking good! ✨');
        if (onSaved) return onSaved(); // closes the modal and unmounts us
      }
      if (!opening) renderContent();
      else renderHeader();
    },
    unlock: (m) => {
      if (ITEMS[m.id] && m.source === 'shop') { draft[ITEMS[m.id].slot] = m.id; sfx('buy'); }
    },
    crate_result: (m) => { lastDupe = m.dupe ? m.refund : 0; spinCrate(m.id); },
    error: (m) => {
      if (!['look', 'buy', 'crate'].includes(m.for)) return;
      if (m.for === 'crate') { opening = false; renderCrates(); }
      waitingSave = false;
    },
  });

  showTab(tab);
  return () => { stopPreview(); off(); };
}
