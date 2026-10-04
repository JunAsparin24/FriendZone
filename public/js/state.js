// Client-side state for the zone you're currently in, plus small shared helpers.
import { sfx } from './sfx.js';

export const S = {
  zone: null,     // { code, name, owner }
  me: null,       // your player key
  players: {},    // key -> public profile (includes online + scene)
  chat: [],
  feed: [],
  race: null,
};

export const SCENE_LABEL = {
  lobby: 'in the lobby',
  world: 'exploring',
  race: '🏎️ racing',
  arena: '⚔️ in the arena',
  boss: '🏰 in the dungeon',
  house: '🏠 at the houses',
  hood: '🏘️ in the neighbourhood',
  casino: '🎰 at the casino',
  doodle: '🎨 doodling',
  arcade: '🕹️ at the arcade',
  tavern: '🍺 at the tavern',
  archery: '🏹 at the archery range',
  shop: '👕 shopping',
  petshop: '🐾 at the pet shop',
  lasertag: '🔫 playing laser tag',
};

export const me = () => S.players[S.me];
export const nameOf = (k) => S.players[k]?.name ?? k;
/** Where someone is, for the online lists. */
export const sceneLabel = (scene) => SCENE_LABEL[scene];
export const colorOf = (k) => S.players[k]?.color ?? '#999';
export const fmt = (n) => Number(n).toLocaleString();
export const xpForLevel = (level) => 100 * (level - 1) ** 2;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const TOAST_SOUND = { error: 'error', feed: 'notify', unlock: 'unlock', music: null, '': 'pop' };

export function toast(text, kind = '') {
  sfx(TOAST_SOUND[kind] ?? 'pop');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

// (a box that's been hidden, like the town chat once you're inside a building, doesn't count)
export const isTyping = () => { const el = document.activeElement; return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) && !!el.offsetParent; };
