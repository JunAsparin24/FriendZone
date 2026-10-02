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
  { id: 'top', icon: '👕', label: 'Tops' },
  { id: 'bottom', icon: '👖', label: 'Bottoms' },
  { id: 'outfit', icon: '👗', label: 'Outfits' },
  { id: 'shoes', icon: '👟', label: 'Shoes' },
  { id: 'socks', icon: '🧦', label: 'Socks' },
  { id: 'hat', icon: '🎩', label: 'Hats' },
  { id: 'face', icon: '🕶️', label: 'Face' },
  { id: 'hand', icon: '🪄', label: 'Hands' },
  { id: 'back', icon: '🪽', label: 'Back' },
  { id: 'aura', icon: '✨', label: 'Aura' },
  { id: 'pet', icon: '🐾', label: 'Pet' },
  { id: 'mount', icon: '🐴', label: 'Mount' },
  { id: 'crates', icon: '🎁', label: 'Crates' },
];
const TITLES = {
  body: 'Body & skin', eyes: 'Eyes', hair: 'Hairstyle', top: 'Tops', bottom: 'Bottoms', outfit: 'Full outfits', shoes: 'Shoes', socks: 'Socks',
  hat: 'Hats & hair accessories', face: 'Glasses, masks & more', hand: 'Things to hold', back: 'Backpacks & wings', aura: 'Auras', pet: 'Pets', mount: 'Mounts', crates: 'Mystery crates',
};
// accessories you can wear more than one of: the look keys for each slot, and what to call them
const MULTI = {
  hat: { keys: ['hat', 'hat2', 'hat3'], names: ['Slot 1', 'Slot 2', 'Slot 3'] },
  face: { keys: ['face', 'face2', 'face3'], names: ['Slot 1', 'Slot 2', 'Slot 3'] },
  hand: { keys: ['hand', 'hand2'], names: ['Right hand', 'Left hand'] },
};
const ITEM_TABS = ['hair', 'top', 'bottom', 'outfit', 'hat', 'face', 'hand', 'back', 'aura', 'pet', 'mount'];
const HEAD_SLOTS = new Set(['hair', 'hat', 'face']);
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic', 'exclusive'];
const HAIR_ORDER = ['m', 'u', 'f']; // boys' cuts, then ones for anyone, then girls' styles (all one list)
const DRAFT_DEFAULTS = {
  bottom: 'bottom_pants', shoeColor: '#23263f', eyeColor: '#1d1b2e', eyes: 'eyes_round', height: 'height_medium', build: 'build_regular', pet: 'pet_none', mount: 'mount_none',
  outfit: 'outfit_none', hand: 'hand_none', hand2: 'hand_none', hat2: 'hat_none', hat3: 'hat_none', face2: 'face_none', face3: 'face_none',
};
const TILE = 98;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const zoomFor = (slot) => (slot === 'pet' ? 'pet' : slot === 'mount' ? 'mount' : slot === 'shoes' || slot === 'socks' ? 'feet' : HEAD_SLOTS.has(slot) || slot === 'eyes' ? 'head' : 'body');
const colorKey = (key) => `${key}Color`; // hat -> hatColor, face2 -> face2Color, hand -> handColor…

export function wardrobe(body, { mode = 'wardrobe', tab: startTab = null, onSaved } = {}) {
  const creating = mode === 'create';
  const tabs = creating ? TABS.filter((t) => t.id !== 'crates') : TABS;
  let tab = startTab ?? (mode === 'shop' ? 'crates' : 'body');
  const saved = { ...DRAFT_DEFAULTS, ...me().look };
  let draft = { ...saved };
  let filter = 'all', query = '', confirmBuy = null, opening = false, waitingSave = false, previewZoom = 'body';
  const slotIdx = { hat: 0, face: 0, hand: 0 }; // which of the accessory slots you're filling

  body.innerHTML = `
    <div class="wd2">
      <aside class="wd2-stage">
        <h2 class="wd2-title">${creating ? '✨ Create your character' : mode === 'shop' ? '👕 Style Shop' : '🪞 Wardrobe'}</h2>
        <div class="wd2-preview"><canvas class="wd-canvas"></canvas>
          <div class="wd2-zoom"><button data-zoom="body" class="on" title="Full body">🧍</button><button data-zoom="head" title="Close-up">🙂</button><button data-zoom="feet" title="Shoes">👟</button><button data-zoom="pet" title="Your pet">🐾</button><button data-zoom="mount" title="Your mount">🐴</button></div>
        </div>
        <div class="wd-name"></div>
        <div class="wd-collection muted small"></div>
        <div class="wd2-trying"></div>
        <div class="wd2-tools"><button class="btn small" id="wdRandom" title="Random outfit from things you own">🎲 Random</button><button class="btn small" id="wdReset" title="Undo your changes">↺ Reset</button></div>
        <button class="btn primary wide" id="saveLook">${creating ? "Let's go!" : 'Save look'}</button>
        <div class="wd2-unsaved muted small"></div>
      </aside>
      <nav class="wd2-rail">${tabs.map((t) => `<button data-tab="${t.id}"><span>${t.icon}</span>${t.label}</button>`).join('')}</nav>
      <section class="wd2-panel">
        <div class="wd2-head"><h3 class="wd2-section"></h3><input class="wd2-search" type="search" placeholder="🔍 Search" aria-label="Search items"><div class="wd2-filters"></div></div>
        <div class="wd-content"></div>
      </section>
    </div>`;
  const content = $(body, '.wd-content');
  const canvas = $(body, '.wd-canvas');
  const PW = 250, PH = 330;
  const pctx = hiDpiCanvas(canvas, PW, PH);

  // live 3D preview: spins slowly, drag to turn the character
  let yaw = 0.5, spin = 0, dragX = null; // (no auto-spin: drag to turn)
  canvas.style.cursor = 'grab';
  canvas.onpointerdown = (e) => { dragX = e.clientX; spin = 0; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => {
    if (dragX == null) return;
    yaw += (e.clientX - dragX) * 0.012;
    dragX = e.clientX;
  };
  canvas.onpointerup = () => { dragX = null; }

  const stopPreview = loop((dt, now) => {
    yaw += spin * dt;
    pctx.clearRect(0, 0, PW, PH);
    const g = pctx.createRadialGradient(PW / 2, PH - 30, 10, PW / 2, PH - 30, 140);
    g.addColorStop(0, 'rgba(255,216,77,.28)');
    g.addColorStop(1, 'rgba(255,216,77,0)');
    pctx.fillStyle = g;
    pctx.fillRect(0, 0, PW, PH);
    if (previewZoom === 'body') {
      pctx.fillStyle = '#3a6fd0';
      pctx.beginPath(); pctx.ellipse(PW / 2, PH - 18, 80, 17, 0, 0, Math.PI * 2); pctx.fill();
      pctx.fillStyle = '#4f86e8';
      pctx.beginPath(); pctx.ellipse(PW / 2, PH - 22, 80, 17, 0, 0, Math.PI * 2); pctx.fill();
    }
    paintPortrait(pctx, draft, PW, PH - (previewZoom === 'body' ? 12 : 0), { time: now / 1000, yaw, zoom: previewZoom === 'head' ? 'bust' : previewZoom });
  });

  const changed = () => JSON.stringify(draft) !== JSON.stringify(saved);
  // the look key a tile in this tab fills (accessory tabs: whichever slot you've picked)
  const slotKey = (t = tab) => (MULTI[t] ? MULTI[t].keys[slotIdx[t]] : t);
  const wornIn = (id) => Object.keys(draft).find((k) => draft[k] === id && ITEMS[id] && (k === ITEMS[id].slot || MULTI[ITEMS[id].slot]?.keys.includes(k)));
  /** Things you've put on to try that you don't own yet: [look key, item]. */
  const tryingOn = () => Object.entries(draft).filter(([k, id]) => ITEMS[id] && (k === ITEMS[id].slot || MULTI[ITEMS[id].slot]?.keys.includes(k)) && !owns(me(), id)).map(([k, id]) => [k, ITEMS[id]]);

  function renderHeader() {
    const p = me();
    $(body, '.wd-name').textContent = p.name;
    const total = CATALOG.items.length;
    const have = CATALOG.items.filter((i) => owns(p, i.id)).length;
    $(body, '.wd-collection').textContent = `Collection ${have}/${total} · 🪙 ${fmt(p.coins)}`;
    body.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $(body, '.wd2-section').textContent = TITLES[tab];
    const itemsTab = ITEM_TABS.includes(tab);
    $(body, '.wd2-search').classList.toggle('hidden', !itemsTab);
    $(body, '.wd2-filters').innerHTML = itemsTab
      ? [['all', 'All'], ['owned', 'Owned'], ['new', 'Not yet']].map(([id, label]) => `<button data-filter="${id}" class="${filter === id ? 'on' : ''}">${label}</button>`).join('')
      : '';
    // what you're trying on but haven't bought
    const trying = tryingOn();
    const buyable = trying.filter(([, it]) => it.price);
    const cost = buyable.reduce((a, [, it]) => a + it.price, 0);
    $(body, '.wd2-trying').innerHTML = trying.length ? `<div class="wd2-try">
        <b>👀 Trying on</b> ${trying.map(([k, it]) => `<span class="wd2-try-item" style="--r:${RARITY[it.rarity].color}">${esc(it.name)}<button data-takeoff="${k}" title="Take it off">✕</button></span>`).join('')}
        ${buyable.length ? `<button class="btn small primary" data-buyall>Buy ${buyable.length > 1 ? 'all ' : ''}· 🪙 ${fmt(cost)}</button>` : ''}
      </div>` : '';
    $(body, '.wd2-unsaved').textContent = trying.length ? 'Things you haven\'t bought come off when you save.' : !creating && changed() ? '● Unsaved changes' : '';
    $(body, '#saveLook').classList.toggle('pulse', !creating && changed());
  }

  // colors come in rows of shades (lightest to darkest), so the grid lines families up
  function swatches(label, field, colors, { original = false } = {}) {
    const cur = draft[field] ?? '';
    return `<div class="wd2-card"><div class="wd-label">${label} ${cur ? `<i class="wd2-chip" style="--c:${cur}"></i>` : ''}</div><div class="swatches palette">${
      original ? `<button type="button" class="swatch orig ${cur ? '' : 'on'}" data-field="${field}" data-color="" title="Original colour">↺</button>` : ''}${colors.map((c) =>
      `<button type="button" class="swatch ${cur === c ? 'on' : ''}" data-field="${field}" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join('')}</div></div>`;
  }
  // items marked "tint" can be recoloured from the full palette (each accessory slot has its own colour)
  const tintPicker = (key, label) => (ITEMS[draft[key]]?.tint ? swatches(`${label} (${esc(ITEMS[draft[key]].name)})`, colorKey(key), CATALOG.clothColors, { original: true }) : '');

  // tops: the main colour (tops with their own look, like suits, can be recoloured or kept original)
  // plus an accent for the tie / stripes / trim
  function topPickers() {
    const it = ITEMS[draft.top];
    const name = esc(it?.name ?? 'Top');
    return (it?.tint ? swatches(`${name} color`, 'topTint', CATALOG.clothColors, { original: true }) : swatches('Shirt color', 'topColor', CATALOG.clothColors))
      + (it?.accent ? swatches('Accent · tie, stripes & trim', 'topAccent', CATALOG.clothColors, { original: true }) : '');
  }
  function outfitPickers() {
    const it = ITEMS[draft.outfit];
    if (!it || draft.outfit === 'outfit_none') return '';
    return swatches(`${esc(it.name)} color`, 'outfitColor', CATALOG.clothColors, { original: !!it.tint })
      + (it.accent ? swatches('Accent · trim, belt & details', 'outfitAccent', CATALOG.clothColors, { original: true }) : '');
  }

  // body options (height, build, eye style, shoes, socks): always free, previewed on your own character
  function choices(label, field, options, zoom = 'body') {
    return `<div class="wd2-card"><div class="wd-label">${label}</div><div class="tiles choice-tiles">${options.map((o) =>
      `<button class="tile ${draft[field] === o.id ? 'on' : ''}" data-choice="${field}" data-id="${o.id}" style="--r:#c3c9e4" data-zoom="${zoom}">
        <span class="tile-art"></span><span class="tile-name">${esc(o.name)}</span><span class="tile-foot">${draft[field] === o.id ? '✓' : ''}</span>
      </button>`).join('')}</div></div>`;
  }

  /** The strip of slots for accessories you can wear several of. */
  function slotBar(t) {
    const m = MULTI[t];
    return `<div class="wd2-slots">${m.keys.map((k, i) => {
      const it = ITEMS[draft[k]];
      const empty = !it || it.id.endsWith('_none');
      return `<button class="wd2-slot ${slotIdx[t] === i ? 'on' : ''}" data-slot="${i}"><small>${m.names[i]}</small><b>${empty ? 'Empty' : esc(it.name)}</b>${empty ? '' : `<i data-clear="${k}" title="Take it off">✕</i>`}</button>`;
    }).join('')}</div>
    <p class="muted small">Wear up to ${m.keys.length} at once: pick a slot, then pick what goes in it.</p>`;
  }

  function itemTiles(slot) {
    const p = me();
    const key = slotKey(slot);
    const q = query.trim().toLowerCase();
    const items = CATALOG.items.filter((i) => i.slot === slot)
      .filter((i) => filter === 'all' || (filter === 'owned') === owns(p, i.id))
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => (slot === 'hair' ? HAIR_ORDER.indexOf(a.g ?? 'u') - HAIR_ORDER.indexOf(b.g ?? 'u') : 0)
        || (owns(p, b.id) - owns(p, a.id)) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
    if (!items.length) return `<p class="muted">${q ? 'Nothing matches that.' : filter === 'owned' ? "You don't own anything here yet." : 'You own everything here!'}</p>`;
    return `<div class="tiles">${items.map((it) => {
      const owned = owns(p, it.id);
      const where = wornIn(it.id);
      const on = draft[key] === it.id;
      const worn = where && !it.id.endsWith('_none');
      const footer = confirmBuy === it.id ? `Buy for ${fmt(it.price)}?`
        : owned ? (on ? '✓ Wearing' : worn && MULTI[slot] ? `✓ ${MULTI[slot].names[MULTI[slot].keys.indexOf(where)]}` : 'Owned')
          : on ? '👀 Trying on' : it.exclusive ? '✨ Exclusive' : it.price ? `🪙 ${fmt(it.price)}` : it.unlock ? `🔒 ${esc(it.unlock.hint)}` : it.drop ? `👾 ${esc(it.drop)}` : '🎁 Crates';
      return `<button class="tile ${owned ? '' : 'locked'} ${on ? 'on' : worn && MULTI[slot] ? 'worn' : ''} ${confirmBuy === it.id ? 'confirm' : ''}"
        data-id="${it.id}" style="--r:${RARITY[it.rarity].color}" title="${esc(it.name)} · ${RARITY[it.rarity].label} · ${esc(howToGet(it))}${owned ? '' : ' · tap to try it on'}">
        <span class="tile-rarity">${RARITY[it.rarity].label}</span>${owned ? '' : '<span class="tile-lock">🔒</span>'}
        <span class="tile-art"></span><span class="tile-name">${esc(it.name)}</span><span class="tile-foot">${footer}</span>
      </button>`;
    }).join('')}</div>`;
  }

  const outfitNote = () => (draft.outfit && draft.outfit !== 'outfit_none'
    ? `<p class="wd2-note">👗 You're wearing the <b>${esc(ITEMS[draft.outfit]?.name ?? 'outfit')}</b>. Picking a ${tab === 'top' ? 'top' : 'bottom'} takes it off.</p>` : '');

  function renderContent() {
    renderHeader();
    if (tab === 'crates') return renderCrates();
    const key = slotKey();
    if (tab === 'body') {
      content.innerHTML = swatches('Skin tone', 'skin', CATALOG.skins)
        + choices('Height', 'height', CATALOG.heights) + choices('Build', 'build', CATALOG.builds);
    } else if (tab === 'eyes') {
      content.innerHTML = choices('Eye style', 'eyes', CATALOG.eyeStyles, 'head') + swatches('Eye color', 'eyeColor', CATALOG.eyeColors);
    } else if (tab === 'shoes') {
      content.innerHTML = choices('Shoes', 'shoes', CATALOG.shoeStyles, 'feet') + swatches('Shoe color', 'shoeColor', CATALOG.clothColors);
    } else if (tab === 'socks') {
      content.innerHTML = choices('Socks', 'socks', CATALOG.sockStyles, 'feet') + swatches('Sock color', 'sockColor', CATALOG.clothColors);
    } else {
      content.innerHTML = (MULTI[tab] ? `<div class="wd2-card">${slotBar(tab)}</div>` : '')
        + (tab === 'top' || tab === 'bottom' ? outfitNote() : '')
        + `<div class="wd2-card">${itemTiles(tab)}${tab === 'pet' ? '<p class="muted small">Buy pets here, or hatch a random one from an egg at the 🐾 Pet Shop in town (cheaper!).</p>' : ''}${tab === 'mount' ? '<p class="muted small">Wear a mount, then press <kbd>G</kbd> (or tap 🐴) out in town to hop on and ride: much faster than walking!</p>' : ''}${tab === 'outfit' ? '<p class="muted small">An outfit replaces your top and bottoms. Shoes and socks stay yours: change them in 👟 Shoes and 🧦 Socks.</p>' : ''}</div>`
        + (tab === 'hair' ? swatches('Hair color', 'hairColor', CATALOG.hairColors) + (ITEMS[draft.hair]?.tie ? swatches('Hair tie color', 'hairTie', CATALOG.clothColors, { original: true }) : '') : '')
        + (tab === 'top' ? topPickers() : '')
        + (tab === 'bottom' ? swatches('Bottoms color', 'bottomColor', CATALOG.clothColors) : '')
        + (tab === 'outfit' ? outfitPickers() : '')
        + (MULTI[tab] ? tintPicker(key, `${MULTI[tab].names[slotIdx[tab]]} color`) : '')
        + (tab === 'back' ? tintPicker('back', 'Color') : '')
        + (tab === 'aura' ? tintPicker('aura', 'Aura color') : '');
    }
    content.querySelectorAll('.tile').forEach((t) => {
      const field = t.dataset.choice ?? key;
      const look = { ...draft, [field]: t.dataset.id };
      if (tab === 'top' || tab === 'bottom') look.outfit = 'outfit_none'; // (show the top itself, not the outfit over it)
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

  /** Put an item on (owned or just to try): into the current slot, out of any other slot it was in. */
  function wear(it) {
    const key = MULTI[it.slot] ? slotKey(it.slot) : it.slot;
    if (MULTI[it.slot]) {
      // tapping what's already in this slot takes it off; something worn in another slot moves here
      if (draft[key] === it.id && !it.id.endsWith('_none')) { draft[key] = `${it.slot}_none`; sfx('pop'); return; }
      for (const k of MULTI[it.slot].keys) if (k !== key && draft[k] === it.id) draft[k] = `${it.slot}_none`;
    }
    if (draft[key] !== it.id) sfx('swap');
    draft[key] = it.id;
    // an outfit and a top/bottom don't go together
    if (it.slot === 'top' || it.slot === 'bottom') draft.outfit = 'outfit_none';
  }

  content.addEventListener('click', (e) => {
    const clear = e.target.closest('[data-clear]');
    if (clear) { draft[clear.dataset.clear] = `${tab}_none`; sfx('pop'); renderContent(); return; }
    const slot = e.target.closest('[data-slot]');
    if (slot) { slotIdx[tab] = Number(slot.dataset.slot); confirmBuy = null; sfx('click'); renderContent(); return; }
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
      wear(it);
      confirmBuy = null;
    } else {
      // not yours yet: try it on (anything can be previewed on you), and tap again to buy it
      const key = MULTI[it.slot] ? slotKey(it.slot) : it.slot;
      if (draft[key] !== it.id) { wear(it); confirmBuy = it.price ? it.id : null; }
      else if (it.price) {
        if (confirmBuy === it.id) { net.send('buy', { id: it.id }); confirmBuy = null; } else confirmBuy = it.id;
      }
      if (!it.price) toast(it.exclusive ? `✨ ${it.name} is exclusive: only an admin can give it out.` : it.unlock ? `🔒 ${it.name}: ${it.unlock.hint}` : it.drop ? `👾 ${it.name} drops from the ${it.drop} in the Boss Cave.` : `🎁 ${it.name} only comes from crates.`);
    }
    renderContent();
  });

  /** Take off something you were trying on: back to what you had in that slot before. */
  function takeOff(k) {
    const slot = ITEMS[draft[k]]?.slot;
    draft[k] = saved[k] && owns(me(), saved[k]) ? saved[k] : (DRAFT_DEFAULTS[k] ?? `${slot}_none`);
    // (an accessory you had on in this slot before may have moved to another one since)
    if (MULTI[slot] && MULTI[slot].keys.some((o) => o !== k && draft[o] === draft[k])) draft[k] = `${slot}_none`;
  }

  body.querySelector('.wd2-stage').addEventListener('click', (e) => {
    const off = e.target.closest('[data-takeoff]');
    if (off) {
      takeOff(off.dataset.takeoff);
      sfx('pop');
      renderContent();
      return;
    }
    if (e.target.closest('[data-buyall]')) {
      for (const [, it] of tryingOn()) if (it.price) net.send('buy', { id: it.id });
      confirmBuy = null;
    }
  });

  body.querySelector('.wd2-panel').addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; renderContent(); }
  });
  $(body, '.wd2-search').addEventListener('input', (e) => { query = e.target.value; renderContent(); });
  body.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { if (!opening) showTab(b.dataset.tab); }));
  body.querySelectorAll('[data-zoom]').forEach((b) => (b.onclick = () => setZoom(b.dataset.zoom)));

  $(body, '#wdRandom').onclick = () => {
    const p = me();
    for (const slot of ['hair', 'top', 'bottom', 'hat', 'face', 'back', 'aura', 'pet']) {
      const options = CATALOG.items.filter((i) => i.slot === slot && owns(p, i.id));
      if (options.length) draft[slot] = pick(options).id;
    }
    draft.outfit = 'outfit_none';
    for (const k of ['hat2', 'hat3', 'face2', 'face3']) draft[k] = `${k.slice(0, -1)}_none`;
    draft.hairColor = pick(CATALOG.hairColors);
    draft.topColor = pick(CATALOG.clothColors);
    draft.bottomColor = pick(CATALOG.clothColors);
    draft.shoeColor = pick(CATALOG.clothColors);
    draft.eyeColor = pick(CATALOG.eyeColors);
    draft.eyes = pick(CATALOG.eyeStyles).id;
    sfx('swap');
    renderContent();
  };
  $(body, '#wdReset').onclick = () => { draft = { ...saved }; confirmBuy = null; sfx('pop'); renderContent(); };

  $(body, '#saveLook').onclick = () => {
    // anything you were only trying on comes off (back to what you had on before)
    const trying = tryingOn();
    for (const [k] of trying) takeOff(k);
    if (trying.length) toast(`Took off ${trying.map(([, it]) => it.name).join(', ')} (not bought yet).`);
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
  const lookWith = (it) => ({ ...draft, [it.slot]: it.id, ...(it.slot === 'top' || it.slot === 'bottom' ? { outfit: 'outfit_none' } : {}) });
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
      portraitInto(el.querySelector('span'), lookWith(list[i]), 64, 64, { zoom: zoomFor(list[i].slot) });
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
    portraitInto(box.querySelector('.rv-art'), lookWith(it), 120, 130, { zoom: zoomFor(it.slot) });
    if (it.rarity !== 'common') confetti(box.parentElement, { count: it.rarity === 'legendary' ? 180 : 90, colors: [r.color, '#fff', '#ffd84d'] });
    opening = false;
    $(box, '#equipWon').onclick = () => {
      wear(it);
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
      // bought it: if you weren't already trying it on, put it on
      const it = ITEMS[m.id];
      if (it && m.source === 'shop') { if (!wornIn(it.id)) wear(it); sfx('buy'); }
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
