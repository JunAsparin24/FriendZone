import './keybinds.js'; // first, so custom keybinds are translated before any game sees a key
import { weatherState } from './three/wind.js';
// App shell: zone selection, sign-in, lobby, world HUD, chat and activity modal.
import { actionHint, touch } from './touch.js';
import './glyphs.js'; // swaps emoji in the interface for drawn icons
import { net } from './net.js';
import { S, sceneLabel, esc, fmt, me, toast, xpForLevel, colorOf, nameOf, isTyping } from './state.js';
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
// older phone browsers (some Samsung Internet versions) don't have rounded canvas rectangles
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r = 0) {
    r = Math.min(typeof r === 'number' ? r : r[0] ?? 0, Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}
const COLORS = CATALOG.zoneColors;
const SAVED_KEY = 'friendzone.zones';

let screen = 'home';
let session = null;        // { code, name, token } for the zone you're in
let viewing = null;        // whose profile the lobby card shows
let modal = null;          // { activity, cleanup }
let area = null;           // the 3D area you're in (casino, arena…), if any

export const world = new World($('#worldCanvas'), { onActivity: openActivity, onNear: showPrompt, onRide: (on) => $('#rideBtn').classList.toggle('on', on) });

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
// Accounts: sign in once (username + password) and your zones follow you to any device. The device
// keeps a sign-in token, never your password.
// ---------------------------------------------------------------------------

const ACCOUNT_KEY = 'friendzone.account';
let account = null; // { name, zones: [{ code, zoneName, name, online }] } once signed in

function storedAccount() {
  try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY)); } catch { return null; }
}
function storeAccount(v) {
  try { if (v) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(v)); else localStorage.removeItem(ACCOUNT_KEY); } catch { /* private mode */ }
}
/** Ask the server for your account (and its list of zones) again, with the token this device has. */
function refreshAccount() {
  const a = storedAccount();
  if (a?.token) net.send('account_resume', { username: a.username, token: a.token });
}

function renderAccount() {
  const btn = $('#accountBtn');
  btn.innerHTML = account ? `👤 ${esc(account.name)}` : '👤 Sign in';
  btn.title = account ? 'Your account' : 'Sign in to your account';
  btn.classList.toggle('on', !!account);
  $('#accountBar').innerHTML = account
    ? `<span>Signed in as <b>${esc(account.name)}</b></span>`
    : '<span>Sign in to see your zones on any device.</span><button class="btn small primary" data-account>Sign in</button>';
}

/** The sign-in / create-account panel. */
function openAccountPanel() {
  if (account) {
    openModal({ account: true, mount: (body) => {
      body.innerHTML = `<div class="acct-panel"><h2>👤 ${esc(account.name)}</h2>
        <p class="muted">You're signed in. Your FriendZones are listed on the home screen on any device you sign in on.</p>
        <button class="btn danger" id="acctOut">Sign out</button></div>`;
      $('#acctOut').onclick = () => { net.send('signout', { token: storedAccount()?.token }); signedOut(); closeModal(true); };
    } });
    return;
  }
  openModal({ account: true, mount: (body) => {
    let mode = 'signin';
    body.innerHTML = `<form class="acct-panel form" id="acctForm" autocomplete="on">
      <div class="tabs"><button type="button" data-mode="signin" class="on">Sign in</button><button type="button" data-mode="signup">Create account</button></div>
      <label>Username<input name="username" maxlength="16" required autocomplete="username" placeholder="jun"></label>
      <label>Password<input name="password" type="password" maxlength="64" required autocomplete="current-password"></label>
      <p class="acct-hint muted small"></p>
      <p class="error" id="acctErr"></p>
      <button class="btn primary" id="acctGo">Sign in</button></form>`;
    const form = $('#acctForm');
    const setMode = (m) => {
      mode = m;
      form.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
      $('#acctGo').textContent = m === 'signin' ? 'Sign in' : 'Create account';
      form.password.autocomplete = m === 'signin' ? 'current-password' : 'new-password';
      form.querySelector('.acct-hint').textContent = m === 'signin' ? '' : 'Pick a username (3–16 letters or numbers) and a password (4+ characters). Zones you play while signed in are saved to it.';
      $('#acctErr').textContent = '';
    };
    form.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    form.onsubmit = (e) => {
      e.preventDefault();
      $('#acctErr').textContent = net.connected ? '' : 'Not connected to the server yet…';
      net.send(mode, { username: form.username.value.trim(), password: form.password.value });
    };
    setMode('signin');
    form.username.focus();
  } });
}

function signedOut() {
  account = null;
  storeAccount(null);
  renderAccount();
  if (screen === 'home') renderHome();
}

net.on('account', (m) => {
  const fresh = !account;
  account = { name: m.name, zones: m.zones ?? [] };
  publicOnline = m.public ?? publicOnline;
  if (m.token) storeAccount({ username: m.name, token: m.token });
  if (modal?.activity?.account) closeModal(true);
  if (fresh && m.token) toast(`👋 Signed in as ${m.name}`);
  renderAccount();
  if (screen === 'home') renderHome(false);
  joinPending();
});
net.on('signed_out', () => {});

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

// the version (year.commit, bumped by the git hook in scripts/) in the lobby's corner
fetch('/version.json', { cache: 'no-store' }).then((r) => r.json()).then((v) => { $('#versionTag').textContent = `v${v.version}`; }).catch(() => {});

function show(id) {
  screen = id;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  $('#versionTag').hidden = $('#feedbackBtn').hidden = id === 'world'; // (menus only)
  $('#chatBtn').hidden = $('#rideBtn').hidden = id !== 'world';
  $('#accountBtn').hidden = id === 'world'; // (menus only)
  $('.chat').classList.remove('open');
  if (id === 'home') { renderHome(); if (account) refreshAccount(); }
  if (id === 'lobby') renderLobby();
  if (id === 'world') { renderHud(); renderChat(); }
}

let onlineCounts = {};
function askOnline() {
  const codes = [...new Set([...(account?.zones ?? []).map((z) => z.code), ...savedZones().map((z) => z.code)])];
  if (screen === 'home') net.send('zones_online', { codes });
}
setInterval(askOnline, 10000);
net.on('zones_online', (m) => { onlineCounts = m.counts ?? {}; publicOnline = m.public ?? publicOnline; if (screen === 'home') renderHome(false); });
let publicOnline = 0;
$('#playOnline').onclick = () => {
  if (!account) { toast('Sign in first: your online progress is saved to your account.'); openAccountPanel(); return; }
  net.send('play_public', { color: COLORS[Math.floor(Math.random() * COLORS.length)] });
};

function zoneRow(z, attr, forget = true) {
  const n = onlineCounts[String(z.code).toUpperCase()] ?? z.online;
  const badge = n == null ? '' : `<span class="zone-online ${n ? 'on' : ''}"><i class="zo-dot"></i>${n} online</span>`;
  return `
    <li>
      <button class="zone-item" ${attr}="${esc(z.code)}">
        <span class="zn">${esc(z.zoneName)}</span>
        <span class="muted">as ${esc(z.name)} · ${esc(z.code)}</span>
        ${badge}
      </button>
      ${forget ? `<button class="icon-btn" data-forget="${esc(z.code)}" title="Remove from this device">✕</button>` : ''}
    </li>`;
}

function renderHome(ask = true) {
  renderAccount();
  $('#playOnline').innerHTML = `Play online${publicOnline ? ` · <b>${publicOnline}</b> playing` : ''}`;
  const device = savedZones();
  if (account) {
    // signed in: your account's zones (on any device), then any others this device remembers
    const mine = new Set(account.zones.map((z) => z.code));
    const others = device.filter((z) => !mine.has(z.code));
    $('#myZones').innerHTML = account.zones.map((z) => zoneRow(z, 'data-play', false)).join('');
    $('#noZones').hidden = account.zones.length > 0;
    $('#deviceZonesWrap').hidden = !others.length;
    $('#deviceZones').innerHTML = others.map((z) => zoneRow(z, 'data-code')).join('');
  } else {
    $('#noZones').hidden = device.length > 0;
    $('#myZones').innerHTML = device.map((z) => zoneRow(z, 'data-code')).join('');
    $('#deviceZonesWrap').hidden = true;
  }
  if (ask) askOnline();
}

$('#home').addEventListener('click', (e) => {
  if (e.target.closest('[data-account]')) { openAccountPanel(); return; }
  const play = e.target.closest('[data-play]');
  if (play) { net.send('play', { code: play.dataset.play }); return; }
  if (!e.target.closest('.zone-list')) return;
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
  if (go && !account && (go.dataset.go === 'create' || go.dataset.go === 'join')) {
    toast('Sign in first: your zones are saved to your account.');
    openAccountPanel();
  } else if (go) show(go.dataset.go);
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
$('#accountBtn').onclick = () => openAccountPanel();
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

// An invite link (?join=CODE): signed in, you go straight in; otherwise you sign in first, then go in.
let pendingJoin = new URLSearchParams(location.search).get('join')?.toUpperCase() || null;
function joinPending() {
  if (!pendingJoin || !account || !net.connected) return;
  const known = account.zones.find((z) => z.code === pendingJoin);
  net.send(known ? 'play' : 'join', { code: pendingJoin, color: COLORS[Math.floor(Math.random() * COLORS.length)] });
  pendingJoin = null;
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

function renderLobby() {
  if (screen !== 'lobby' || !S.zone) return;
  $('#lobbyZone').textContent = S.zone.public ? `${S.zone.name} · Server ${S.zone.server}` : S.zone.name;
  $('#lobbyCode').textContent = S.zone.code;
  for (const id of ['#inviteBtn', '#quitZone']) $(id).classList.toggle('hidden', !!S.zone.public);
  $('#switchZone').textContent = S.zone.public ? 'Back to menu' : 'Switch zone';
  $('#newServer').classList.toggle('hidden', !S.zone.public);
  // the online world only lists who's in your server right now (everyone else is in another one)
  const list = Object.values(S.players).filter((p) => !S.zone.public || p.online).sort((a, b) =>
    b.online - a.online || b.level - a.level || a.name.localeCompare(b.name));
  $('#onlineCount').textContent = S.zone.public ? `${list.length}/${S.zone.max ?? 20}` : list.filter((p) => p.online).length;
  $('#memberList').innerHTML = list.map((p) => `
    <li class="${p.online ? 'on' : 'off'} ${p.key === (viewing ?? S.me) ? 'sel' : ''}" data-k="${esc(p.key)}">
      <span class="mav" style="--c:${p.color}"></span>
      <span class="nm"><span>${esc(p.name)}${p.key === S.me ? ' <small>(you)</small>' : ''}${p.key === S.zone.owner ? ' 👑' : ''}</span>
        <small class="where">${p.online ? `● ${sceneLabel(p.scene, p.key) ?? 'online'}` : 'offline'}</small></span>
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
        <div class="pf-name">${esc(p.name.toUpperCase())}${isMe ? '<button class="pf-rename" data-rename title="Change your name">✏️</button>' : ''}</div>
        ${isMe ? `<form class="pf-rename-form hidden"><input name="name" maxlength="16" value="${esc(p.name)}" autocomplete="off"><button class="btn primary small">Save</button><button type="button" class="btn ghost small" data-rename-cancel>Cancel</button></form><p class="error pf-rename-err"></p>` : ''}
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
      <li><span>🏰</span><b>${fmt(s.dungeonBest ?? 0)}</b> Best Dungeon Floor</li>
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
  const form = $('#profileCard .pf-rename-form');
  if (form && (e.target.closest('[data-rename]') || e.target.closest('[data-rename-cancel]'))) {
    const opening = !!e.target.closest('[data-rename]');
    form.classList.toggle('hidden', !opening);
    $('#profileCard .pf-name').classList.toggle('hidden', opening);
    $('#profileCard .pf-rename-err').textContent = '';
    if (opening) { form.name.focus(); form.name.select(); }
  }
});
$('#profileCard').addEventListener('submit', (e) => {
  if (!e.target.matches('.pf-rename-form')) return;
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (name) net.send('rename', { name });
});
net.on('renamed', (m) => {
  // remember the new name for signing back in on this device
  if (session) { session.name = m.name; rememberZone({ ...session, zoneName: S.zone?.name }); }
  sfx('swap');
  toast(`✏️ You're now called ${m.name}`);
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
  // you always start in the first town (never straight back into Coral Cove)
  try { localStorage.removeItem('fz.town'); } catch { /* private mode */ }
};
window.addEventListener('fz:lobby', () => $('#backLobby').click());

$('#switchZone').onclick = () => leaveZone();
$('#newServer').onclick = () => { net.send('play_public', { hop: true }); sfx('click'); };
$('#quitZone').onclick = () => { $('#quitConfirm').classList.remove('hidden'); $('#quitConfirm').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
$('#quitNo').onclick = () => $('#quitConfirm').classList.add('hidden');
$('#quitYes').onclick = () => net.send('quit_zone', { confirm: true });
net.on('quit_zone', (m) => {
  forgetZone(m.code);
  $('#quitConfirm').classList.add('hidden');
  leaveZone();
  toast('You left the zone. Your profile there has been deleted.');
});
// someone else left the zone for good: drop them from everything we show
net.on('member_left', (m) => {
  if (!S.zone) return;
  delete S.players[m.k];
  S.zone.owner = m.owner;
  S.feed = m.feed;
  S.chat = m.chat;
  if (viewing === m.k) viewing = null;
  renderLobby();
  renderChat();
  renderHud();
});

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

/** A thin bar showing progress to the next level (with the numbers on hover). */
function xpBar(p) {
  const lo = xpForLevel(p.level), hi = xpForLevel(p.level + 1);
  const pct = Math.max(0, Math.min(100, ((p.xp - lo) / (hi - lo)) * 100));
  return `<div class="hud-xp" title="${fmt(p.xp - lo)} / ${fmt(hi - lo)} XP to level ${p.level + 1}"><i style="width:${pct.toFixed(1)}%"></i><small>${fmt(p.xp - lo)} / ${fmt(hi - lo)} XP</small></div>`;
}

function renderHud() {
  if (screen !== 'world' || !S.zone) return;
  const p = me();
  $('#hudMe').innerHTML = `
    <span class="dot" style="--c:${p.color}"></span><b>${esc(p.name)}</b>
    <span class="pill">Lv ${p.level}</span><span class="pill">🪙 ${fmt(p.coins)}</span>
    <span class="muted zone-tag">${esc(S.zone.name)}</span>
    ${xpBar(p)}`;
  const online = Object.values(S.players).filter((x) => x.online);
  $('#hudOnline').innerHTML = `<h3>ONLINE: ${online.length}</h3>` + online.map((x) =>
    `<div class="ho" data-k="${esc(x.key)}"><span class="hav"></span>${esc(x.name)}<small>${sceneLabel(x.scene, x.key) ?? ''}</small></div>`).join('');
  $('#hudOnline').querySelectorAll('[data-k]').forEach((el) =>
    portraitInto(el.querySelector('.hav'), S.players[el.dataset.k].look, 26, 26, { zoom: 'head' }));
}

$('#emoteBar').innerHTML = Object.entries(EMOTES).map(([id, glyph], i) =>
  `<button data-emote="${id}" title="Emote (${i + 1})">${glyph}</button>`).join('');
$('#emoteBar').onclick = (e) => {
  const b = e.target.closest('[data-emote]');
  if (b) world.emote(b.dataset.emote);
};

// chat lines fade away after a while (they all come back while you're typing)
const CHAT_SHOW_MS = 15000;
let lastChatHtml = '';
setInterval(() => { if (S.chat?.length) renderChat(); }, 2000);
function renderChat() {
  const now = Date.now();
  for (const m of S.chat) m.seenAt ??= (m.ts && !m.sys ? Math.min(now, m.ts * 1000) : now);
  const html = S.chat.slice(-8).map((m) => {
    const old = now - m.seenAt > CHAT_SHOW_MS ? ' old' : '';
    return m.sys
      ? `<li class="sys ${m.sys}${old}">${esc(m.text).replace(/\n/g, '<br>')}</li>`
      : `<li class="${old}"><b style="color:${colorOf(m.k)}">${esc(nameOf(m.k))}</b> ${esc(m.text)}</li>`;
  }).join('');
  if (html !== lastChatHtml) { lastChatHtml = html; $('#chatLog').innerHTML = html; }
}


function showPrompt(spot) {
  const el = $('#hudPrompt');
  el.classList.toggle('hidden', !spot);
  if (spot?.id === 'portal' && !S.admin && !me()?.cove) el.innerHTML = '🚧 Coral Cove is coming soon!';
  else if (spot) el.innerHTML = `${actionHint()} ${spot.verb ?? 'enter'} <span class="prompt-ico">${iconSvg(spot.id) || spot.emoji}</span> ${esc(spot.name)}`;
  el.onclick = spot ? (spot.action ?? (() => openActivity(spot.id))) : null;
}

export function openActivity(id) {
  const activity = ACTIVITIES[id];
  if (!activity || modal || area) return;
  if (world.riding && id !== 'wardrobe') world.toggleRide(false); // (hop off to go inside)
  // Coral Cove is still being built: only admins can go through the portal for now
  if (id === 'portal' && !S.admin && !me()?.cove) { sfx('error'); toast('🚧 Coral Cove is coming soon!'); return; }
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
  music.setContext(activity.scene ?? 'main'); // (games have their own themes)
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
  world.leftBuilding();
  music.setContext('main');
  if (activity.scene && screen === 'world') net.send('scene', { scene: 'world' });
  if (activity.back && screen === 'world') setTimeout(() => openActivity(activity.back), 60); // (e.g. Laser Tag back into the Arcade)
}
// admin teleports (/tp, /bring): into town, or into the walk-in area someone's in
const TP_AREAS = { arcade: 'arcade', casino: 'casino', shop: 'shop', petshop: 'pets', tavern: 'trading', beach: 'portal' };
net.on('tp', (m) => {
  closeModal(true);
  if (m.scene === 'world') {
    // (leaving an area puts you in town where the server already moved you)
    if (area) closeArea(); else world.teleport(m.x, m.y);
    sfx('spawn');
    return;
  }
  const activity = ACTIVITIES[TP_AREAS[m.scene]];
  if (!activity) return;
  const place = () => { const p = stage.person(S.me); p.x = m.ax; p.z = m.az; sfx('spawn'); };
  if (area === activity) { place(); return; }
  if (area) closeArea();
  setTimeout(() => { if (!area) openArea(activity); setTimeout(place, 400); }, 80);
});
// one area opens another (the Arcade's Laser Tag doorway)
window.addEventListener('fz:area', (e) => {
  if (!ACTIVITIES[e.detail]) return;
  if (area) { const was = area; closeArea(); if (was.back) return; }
  setTimeout(() => openActivity(e.detail), 60);
});
stage.openPanel = (activity) => openModal(activity);
stage.closePanel = () => closeModal();

function openModal(activity, { locked = false } = {}) {
  if (modal) return;
  world.paused = true;
  if (activity.scene) net.send('scene', { scene: activity.scene });
  $('#modal').classList.toggle('wide', !!activity.wide);
  $('#modal').classList.toggle('locked', locked);
  $('#modal').classList.remove('hidden');
  sfx('open');
  if (activity.scene) music.setContext(activity.scene);
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
  music.setContext(area?.scene ?? 'main');
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
  input.type = 'text';
  input.blur();
  if (touch.enabled) $('.chat').classList.remove('open'); // back to playing
};

// phones: chat + emotes open from the 💬 button (the bottom-left corner is the movement thumb's)
// hide the password while you type "/admin …"
$('#chatInput').addEventListener('input', (e) => {
  const secret = /^\/admin\s/i.test(e.target.value);
  if ((e.target.type === 'password') !== secret) {
    const pos = e.target.selectionStart;
    e.target.type = secret ? 'password' : 'text';
    try { e.target.setSelectionRange(pos, pos); } catch { /* password inputs can't */ }
  }
});
// replies to chat commands: only you see these
net.on('sys', (m) => {
  S.chat = [...S.chat, { k: null, text: m.text, sys: m.kind ?? 'info' }].slice(-40);
  renderChat();
  if (m.kind === 'ok' || m.kind === 'error') toast(m.text.split('\n')[0], m.kind === 'error' ? 'error' : undefined);
});
net.on('admin', (m) => { S.admin = !!m.on; });
net.on('kicked', (m) => { leaveZone(); toast(m.msg, 'error'); });

$('#rideBtn').onclick = (e) => { e.currentTarget.blur(); world.toggleRide(); };
$('#chatBtn').onclick = () => {
  const open = $('.chat').classList.toggle('open');
  $('#chatBtn').classList.toggle('on', open);
  if (open) setTimeout(() => $('#chatInput').focus(), 50);
};
$('#emoteBar').addEventListener('click', () => { if (touch.enabled) $('.chat').classList.remove('open'); });
if (touch.enabled) $('#chatInput').placeholder = 'Say something…';

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modal) closeModal();
    else if (isTyping()) document.activeElement.blur();
    // (Esc never takes you out of a game or building: use the Leave / Lobby buttons)
    else if (world.fishing) world.stopActivity();
  } else if (e.key === 'Enter' && (screen === 'world' || area) && !modal && !isTyping()) {
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

net.on('weather', (m) => {
  S.rain = !!m.rain;
  S.weather = weatherState.kind = m.weather ?? (m.rain ? 'rain' : 'sunny');
});

net.on('welcome', (m) => {
  const wasInWorld = screen === 'world' && S.zone?.code === m.zone.code;
  S.zone = m.zone;
  S.me = m.you;
  S.players = Object.fromEntries(m.players.map((p) => [p.key, p]));
  S.chat = m.chat;
  S.feed = m.feed;
  S.race = m.race;
  S.arcade = m.arcade ?? {};
  S.rain = !!m.rain;
  S.weather = weatherState.kind = m.weather ?? (m.rain ? 'rain' : 'sunny');
  S.admin = !!m.admin;
  session ={ code: m.zone.code, name: me().name, token: m.token };
  if (!m.zone.public) rememberZone({ ...session, zoneName: m.zone.name });
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

net.on('arcade_board', (m) => { S.arcade = { ...(S.arcade ?? {}), [m.g]: m.board }; });
net.on('feed', (m) => {
  S.feed = [...S.feed, m].slice(-25);
  renderFeed(); // (the zone news lives in the lobby list; no pop-ups over the game)
});

net.on('race', (m) => { S.race = m.race; });
net.on('race_kp', (m) => { if (S.race && m.k in S.race.racers) S.race.racers[m.k] = m.p; });

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
    if (m.for === 'signin' || m.for === 'signup') {
      const el = document.querySelector('#acctErr');
      if (el) el.textContent = m.msg; else toast(m.msg, 'error');
    } else if (m.for === 'account_resume') {
      signedOut();
    } else if (m.for === 'play') {
      toast(m.msg, 'error');
      refreshAccount();
    } else if (m.for === 'create' || m.for === 'join') {
      $(`#${m.for}Form .error`).textContent = m.msg;
    } else if (m.for === 'resume') {
      const z = session;
      session = null;
      if (z) { forgetZone(z.code); show('home'); toast(account ? 'Join that zone again with its invite code: it will stay on your account.' : 'Sign in, then join that zone again with its invite code.', 'error'); }
    } else {
      toast(m.msg, 'error');
    }
  });
});

net.onOpen = () => {
  $('#conn').classList.add('hidden');
  refreshAccount(); // (first, so a zone you open after is linked to your account)
  if (session) net.send('resume', session);
  askOnline();
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

if (pendingJoin && !storedAccount()?.token) setTimeout(() => { toast('Sign in (or make an account) to join this zone.'); openAccountPanel(); }, 300);
show('home');
renderAccount();
$('#conn').classList.remove('hidden');
net.connect();
setInterval(() => { if (screen === 'lobby') renderProfile(); }, 60000); // keep the daily-bonus timer fresh
