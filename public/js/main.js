// App shell: zone selection, sign-in, lobby, world HUD, chat and activity modal.
import { net } from './net.js';
import { S, SCENE_LABEL, esc, fmt, me, toast, xpForLevel, colorOf, nameOf, isTyping } from './state.js';
import { World, EMOTES } from './world.js';
import { ACTIVITIES } from './activities.js';
import { portraitInto } from './avatar.js';
import { CATALOG, ITEMS, RARITY, owns } from './catalog.js';
import { wardrobe } from './wardrobe.js';
import { sfx } from './sfx.js';
import { settings, setSetting, onSettings } from './settings.js';
import { openSettings } from './settings-panel.js';
import { music } from './music.js';
import { iconSvg } from './icons.js';
import { stage } from './stage.js';

const FURN = Object.fromEntries(CATALOG.furniture.map((f) => [f.id, f]));

const $ = (sel) => document.querySelector(sel);
const COLORS = CATALOG.clothColors;
const SAVED_KEY = 'friendzone.zones';

let screen = 'home';
let session = null;        // { code, name, token } for the zone you're in
let viewing = null;        // whose profile the lobby card shows
let modal = null;          // { activity, cleanup }
let area = null;           // the 3D area you're in (casino, arena…), if any

export const world = new World($('#worldCanvas'), { onActivity: openActivity, onNear: showPrompt });

// ---------------------------------------------------------------------------
// Zones remembered on this device
// ---------------------------------------------------------------------------

function savedZones() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || []; } catch { return []; }
}

function writeSaved(list) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

function rememberZone(entry) {
  writeSaved([entry, ...savedZones().filter((z) => z.code !== entry.code)]);
}

function forgetZone(code) {
  writeSaved(savedZones().filter((z) => z.code !== code));
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function show(id) {
  screen = id;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  if (id === 'home') renderHome();
  if (id === 'lobby') renderLobby();
  if (id === 'world') { renderHud(); renderChat(); }
}

function renderHome() {
  const list = savedZones();
  $('#noZones').hidden = list.length > 0;
  $('#myZones').innerHTML = list.map((z) => `
    <li>
      <button class="zone-item" data-code="${esc(z.code)}">
        <span class="zn">${esc(z.zoneName)}</span>
        <span class="muted">as ${esc(z.name)} · ${esc(z.code)}</span>
      </button>
      <button class="icon-btn" data-forget="${esc(z.code)}" title="Remove from this device">✕</button>
    </li>`).join('');
}

$('#myZones').addEventListener('click', (e) => {
  const forget = e.target.closest('[data-forget]');
  if (forget) {
    forgetZone(forget.dataset.forget);
    renderHome();
    return;
  }
  const item = e.target.closest('[data-code]');
  if (!item) return;
  const z = savedZones().find((x) => x.code === item.dataset.code);
  if (z) enterSaved(z);
});

function enterSaved(z) {
  session = { code: z.code, name: z.name, token: z.token };
  net.send('resume', session);
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) show(go.dataset.go);
  const b = e.target.closest('button, .swatch, [data-k]');
  if (b && !b.disabled) sfx('click');
});

// ---------------------------------------------------------------------------
// Sound toggle (remembered on this device)
// ---------------------------------------------------------------------------

function renderSound() {
  $('#muteBtn').textContent = settings.muted ? '🔇' : settings.master < 0.4 ? '🔈' : '🔊';
  $('#muteBtn').title = settings.muted ? 'Sound off (click to turn on)' : 'Sound on (click to mute)';
  document.body.classList.toggle('no-names', !settings.names);
}
$('#muteBtn').onclick = () => {
  setSetting({ muted: !settings.muted });
  sfx('pop');
};
$('#settingsBtn').innerHTML = iconSvg('settings');
$('#settingsBtn').onclick = () => openSettings();
onSettings(renderSound);
renderSound();

// a little "now playing" card whenever the music moves on to a new song
music.onChange((name) => {
  if (settings.nowPlaying && screen !== 'home') toast(`🎵 Now playing: ${name}`, 'music');
});

function setupForm(form, type) {
  const swatches = form.querySelector('.swatches');
  form.dataset.color = COLORS[Math.floor(Math.random() * COLORS.length)];
  swatches.innerHTML = COLORS.map((c) => `<button type="button" class="swatch" data-color="${c}" style="--c:${c}"></button>`).join('');
  const mark = () => swatches.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s.dataset.color === form.dataset.color));
  swatches.onclick = (e) => {
    if (e.target.dataset.color) { form.dataset.color = e.target.dataset.color; mark(); }
  };
  mark();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.color = form.dataset.color;
    form.querySelector('.error').textContent = net.connected ? '' : 'Not connected to the server yet…';
    form.querySelector('.btn.primary').disabled = true;
    setTimeout(() => { form.querySelector('.btn.primary').disabled = false; }, 800);
    net.send(type, data);
  });
}
setupForm($('#createForm'), 'create');
setupForm($('#joinForm'), 'join');

function openJoin(code = '', name = '', message = '') {
  const form = $('#joinForm');
  form.code.value = code;
  form.name.value = name;
  form.pin.value = '';
  form.querySelector('.error').textContent = message;
  show('join');
  (code ? (name ? form.pin : form.name) : form.code).focus();
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

function renderLobby() {
  if (screen !== 'lobby' || !S.zone) return;
  $('#lobbyZone').textContent = S.zone.name;
  $('#lobbyCode').textContent = S.zone.code;
  const list = Object.values(S.players).sort((a, b) =>
    b.online - a.online || b.level - a.level || a.name.localeCompare(b.name));
  $('#onlineCount').textContent = list.filter((p) => p.online).length;
  $('#memberList').innerHTML = list.map((p) => `
    <li class="${p.online ? 'on' : 'off'} ${p.key === (viewing ?? S.me) ? 'sel' : ''}" data-k="${esc(p.key)}">
      <span class="mav" style="--c:${p.color}"></span>
      <span class="nm"><span>${esc(p.name)}${p.key === S.me ? ' <small>(you)</small>' : ''}${p.key === S.zone.owner ? ' 👑' : ''}</span>
        <small class="where">${p.online ? `● ${SCENE_LABEL[p.scene] ?? 'online'}` : 'offline'}</small></span>
      <span class="lv">Lv ${p.level}</span>
    </li>`).join('');
  $('#memberList').querySelectorAll('[data-k]').forEach((li) =>
    portraitInto(li.querySelector('.mav'), S.players[li.dataset.k].look, 40, 40, { zoom: 'head' }));
  renderProfile();
  renderFeed();
}

function renderProfile() {
  const p = S.players[viewing ?? S.me] ?? me();
  const isMe = p.key === S.me;
  const lo = xpForLevel(p.level), hi = xpForLevel(p.level + 1);
  const pct = Math.round(((p.xp - lo) / (hi - lo)) * 100);
  const wait = p.dailyAt - Date.now() / 1000;
  const daily = wait <= 0
    ? '<button class="btn primary small" data-daily>🎁 Claim daily bonus (+300 🪙)</button>'
    : `<button class="btn small" disabled>🎁 Next bonus in ${Math.floor(wait / 3600)}h ${Math.floor((wait % 3600) / 60)}m</button>`;
  const s = p.stats;
  const collected = CATALOG.items.filter((i) => owns(p, i.id)).length;
  const card = $('#profileCard');
  card.innerHTML = `
    <div class="pf-head">
      <div class="pf-av"></div>
      <div class="pf-info">
        <div class="pf-name">${esc(p.name.toUpperCase())}</div>
        <div class="pf-level">Level ${p.level}</div>
        <div class="xpbar"><i style="width:${pct}%"></i></div>
        <div class="muted small">${fmt(p.xp - lo)} / ${fmt(hi - lo)} XP</div>
        <div class="muted small">👕 ${collected}/${CATALOG.items.length} cosmetics</div>
      </div>
    </div>
    <ul class="stats">
      <li><span>🪙</span><b>${fmt(p.coins)}</b> Coins</li>
      <li><span>🏆</span><b>${fmt(s.wins)}</b> Wins</li>
      <li><span>⚔️</span><b>${fmt(s.elims)}</b> Eliminations</li>
      <li><span>🏎️</span><b>${fmt(s.raceWins)}</b> Race Wins</li>
      <li><span>🎣</span><b>${fmt(s.fish)}</b> Fish Caught</li>
      <li><span>🏹</span><b>${fmt(s.archeryBest)}</b>/50 Best Archery</li>
      <li><span>👾</span><b>${fmt(s.bossKills ?? 0)}</b> Bosses Beaten</li>
      <li><span>🏠</span><b>${fmt(s.houseLikes ?? 0)}</b> House Likes</li>
      <li><span>🎨</span><b>${fmt(s.doodleWins ?? 0)}</b> Doodle Wins</li>
      <li><span>💥</span><b>${fmt(s.bumperWins ?? 0)}</b> Bumper Wins</li>
    </ul>
    <div class="row">${isMe ? `<button class="btn small" data-customize>✨ Customize</button>${daily}` : '<button class="btn ghost small" data-mine>← Back to my profile</button>'}</div>`;
  portraitInto(card.querySelector('.pf-av'), p.look, 96, 124);
}

function renderFeed() {
  $('#lobbyFeed').innerHTML = S.feed.length
    ? [...S.feed].reverse().map((f) => `<li>${esc(f.text)}</li>`).join('')
    : '<li class="muted">Nothing yet. Go make some history!</li>';
}

$('#memberList').addEventListener('click', (e) => {
  const li = e.target.closest('[data-k]');
  if (!li) return;
  viewing = li.dataset.k === S.me ? null : li.dataset.k;
  renderLobby();
});

$('#profileCard').addEventListener('click', (e) => {
  if (e.target.closest('[data-daily]')) { net.send('daily'); sfx('daily'); }
  if (e.target.closest('[data-mine]')) { viewing = null; renderLobby(); }
  if (e.target.closest('[data-customize]')) openActivity('wardrobe');
});

$('#inviteBtn').onclick = async () => {
  const link = `${location.origin}${location.pathname}?join=${S.zone.code}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('Invite link copied! Send it to your friends.');
  } catch {
    prompt('Copy this invite link:', link);
  }
};

$('#playBtn').onclick = () => {
  sfx('enter');
  show('world');
  world.start();
};

$('#switchZone').onclick = () => leaveZone();

function leaveZone() {
  closeModal(true);
  closeArea();
  world.stop();
  net.send('leave_zone');
  session = null;
  S.zone = null;
  show('home');
}

// ---------------------------------------------------------------------------
// World HUD, chat and activities
// ---------------------------------------------------------------------------

function renderHud() {
  if (screen !== 'world' || !S.zone) return;
  const p = me();
  $('#hudMe').innerHTML = `
    <span class="dot" style="--c:${p.color}"></span><b>${esc(p.name)}</b>
    <span class="pill">Lv ${p.level}</span><span class="pill">🪙 ${fmt(p.coins)}</span>
    <span class="muted zone-tag">${esc(S.zone.name)}</span>`;
  const online = Object.values(S.players).filter((x) => x.online);
  $('#hudOnline').innerHTML = `<h3>ONLINE: ${online.length}</h3>` + online.map((x) =>
    `<div class="ho" data-k="${esc(x.key)}"><span class="hav"></span>${esc(x.name)}<small>${SCENE_LABEL[x.scene] ?? ''}</small></div>`).join('');
  $('#hudOnline').querySelectorAll('[data-k]').forEach((el) =>
    portraitInto(el.querySelector('.hav'), S.players[el.dataset.k].look, 26, 26, { zoom: 'head' }));
}

$('#emoteBar').innerHTML = Object.entries(EMOTES).map(([id, glyph], i) =>
  `<button data-emote="${id}" title="Emote (${i + 1})">${glyph}</button>`).join('');
$('#emoteBar').onclick = (e) => {
  const b = e.target.closest('[data-emote]');
  if (b) world.emote(b.dataset.emote);
};

function renderChat() {
  $('#chatLog').innerHTML = S.chat.slice(-8).map((m) =>
    `<li><b style="color:${colorOf(m.k)}">${esc(nameOf(m.k))}</b> ${esc(m.text)}</li>`).join('');
}


function showPrompt(spot) {
  const el = $('#hudPrompt');
  el.classList.toggle('hidden', !spot);
  if (spot) el.innerHTML = `Press <kbd>E</kbd> or click to ${spot.verb ?? 'enter'} <span class="prompt-ico">${iconSvg(spot.id) || spot.emoji}</span> ${esc(spot.name)}`;
  el.onclick = spot ? (spot.action ?? (() => openActivity(spot.id))) : null;
}

function openActivity(id) {
  const activity = ACTIVITIES[id];
  if (!activity || modal || area) return;
  if (activity.world) world.startActivity(activity.world);
  else if (activity.area) openArea(activity);
  else openModal(activity);
}

// Another part of the UI (e.g. the wardrobe in your house) asks to switch panels.
window.addEventListener('fz:open', (e) => {
  const activity = ACTIVITIES[e.detail];
  if (!activity) return;
  closeModal(true);
  openModal(activity);
});

/** Teleport into a full-screen 3D area. */
function openArea(activity) {
  area = activity;
  world.paused = true;
  world.hidden = true;
  showPrompt(null);
  if (activity.scene) net.send('scene', { scene: activity.scene });
  music.setContext(activity.battle ? 'battle' : 'main');
  stage.open(activity, { onExit: closeArea });
}

function closeArea() {
  if (!area) return;
  const activity = area;
  closeModal(true);
  area = null;
  stage.close();
  world.hidden = false;
  world.paused = false;
  music.setContext('main');
  if (activity.scene && screen === 'world') net.send('scene', { scene: 'world' });
}
stage.openPanel = (activity) => openModal(activity);

function openModal(activity, { locked = false } = {}) {
  if (modal) return;
  world.paused = true;
  if (activity.scene) net.send('scene', { scene: activity.scene });
  $('#modal').classList.toggle('wide', !!activity.wide);
  $('#modal').classList.toggle('locked', locked);
  $('#modal').classList.remove('hidden');
  sfx('open');
  if (activity.battle) music.setContext('battle');
  modal = { activity, locked, cleanup: activity.mount($('#modalBody')) };
}

function openCreator() {
  openModal({ wide: true, mount: (body) => wardrobe(body, { mode: 'create', onSaved: () => closeModal(true) }) }, { locked: true });
}

function closeModal(force = false) {
  if (!modal || (modal.locked && force !== true)) return;
  const { activity, cleanup } = modal;
  modal = null;
  cleanup?.();
  $('#modal').classList.add('hidden');
  $('#modalBody').innerHTML = '';
  sfx('close');
  music.setContext(area?.battle ? 'battle' : 'main');
  world.paused = !!area;
  if (activity.scene && screen === 'world') net.send('scene', { scene: 'world' });
}

$('.modal-close').onclick = () => closeModal();
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });

$('#chatForm').onsubmit = (e) => {
  e.preventDefault();
  const input = $('#chatInput');
  if (input.value.trim()) net.send('chat', { text: input.value });
  input.value = '';
  input.blur();
};

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modal) closeModal();
    else if (isTyping()) document.activeElement.blur();
    else if (area) closeArea();
    else if (world.fishing) world.stopActivity();
  } else if (e.key === 'Enter' && screen === 'world' && !modal && !isTyping()) {
    e.preventDefault();
    $('#chatInput').focus();
  }
});

$('#backLobby').onclick = () => {
  closeModal();
  closeArea();
  world.stop();
  net.send('scene', { scene: 'lobby' });
  show('lobby');
};

// ---------------------------------------------------------------------------
// Server messages
// ---------------------------------------------------------------------------

net.on('welcome', (m) => {
  const wasInWorld = screen === 'world' && S.zone?.code === m.zone.code;
  S.zone = m.zone;
  S.me = m.you;
  S.players = Object.fromEntries(m.players.map((p) => [p.key, p]));
  S.chat = m.chat;
  S.feed = m.feed;
  S.race = m.race;
  session = { code: m.zone.code, name: me().name, token: m.token };
  rememberZone({ ...session, zoneName: m.zone.name });
  for (const form of [$('#createForm'), $('#joinForm')]) {
    form.reset();
    form.querySelector('.error').textContent = '';
  }
  if (location.search) history.replaceState(null, '', location.pathname);
  if (wasInWorld) {
    world.stop();
    world.start();
    renderHud();
  } else {
    viewing = null;
    show('lobby');
  }
  if (!me().lookSet) openCreator();
});

net.on('unlock', (m) => {
  if (m.furni) {
    const f = FURN[m.id];
    if (f) toast(`🏠 New furniture: ${f.emoji} ${f.name}! Place it in your house.`, 'unlock');
    return;
  }
  const item = ITEMS[m.id];
  if (!item || m.source === 'crate') return;
  const how = m.source === 'shop' ? 'Purchased' : m.source === 'boss' ? 'Boss drop' : 'Unlocked';
  toast(`✨ ${how}: ${item.name} (${RARITY[item.rarity].label})! Wear it from the wardrobe.`, 'unlock');
});

net.on('player', (m) => {
  if (!S.zone) return;
  const prev = S.players[m.p.key];
  if (prev && m.p.key === S.me) {
    const gained = m.p.coins - prev.coins;
    if (m.p.level > prev.level) setTimeout(() => sfx('levelup'), 250);
    else if (gained >= 100) sfx('coins', { n: Math.min(10, Math.round(gained / 60)) });
    else if (gained > 0) sfx('coin');
  } else if (prev && !prev.online && m.p.online && screen !== 'home') sfx('online');
  S.players[m.p.key] = m.p;
  renderLobby();
  renderHud();
});

net.on('chat', (m) => {
  S.chat = [...S.chat, m].slice(-40);
  if (m.k !== S.me && screen === 'world') sfx('chat');
  renderChat();
});

net.on('feed', (m) => {
  S.feed = [...S.feed, m].slice(-25);
  toast(m.text, 'feed');
  renderFeed();
});

net.on('race', (m) => { S.race = m.race; });
net.on('race_p', (m) => { if (S.race && m.k in S.race.racers) S.race.racers[m.k] = m.p; });

net.on('kicked', (m) => {
  session = null;
  closeModal(true);
  closeArea();
  world.stop();
  S.zone = null;
  show('home');
  toast(m.msg, 'error');
});

net.on('error', (m) => {
  // Activities mark errors they display themselves; everything else becomes a toast.
  setTimeout(() => {
    if (m.handled) return;
    if (m.for === 'create' || m.for === 'join') {
      $(`#${m.for}Form .error`).textContent = m.msg;
    } else if (m.for === 'resume') {
      const z = session;
      session = null;
      if (z) openJoin(z.code, z.name, m.msg);
    } else {
      toast(m.msg, 'error');
    }
  });
});

net.onOpen = () => {
  $('#conn').classList.add('hidden');
  if (session) net.send('resume', session);
};

net.onClose = () => {
  $('#conn').textContent = 'Connection lost, reconnecting…';
  $('#conn').classList.remove('hidden');
  closeModal(true);
  closeArea();
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const joinCode = new URLSearchParams(location.search).get('join')?.toUpperCase();
const saved = savedZones();
if (joinCode) {
  const known = saved.find((z) => z.code === joinCode);
  if (known) session = { code: known.code, name: known.name, token: known.token };
  else openJoin(joinCode);
} else {
  show('home');
}
$('#conn').classList.remove('hidden');
net.connect();
setInterval(() => { if (screen === 'lobby') renderProfile(); }, 60000); // keep the daily-bonus timer fresh
