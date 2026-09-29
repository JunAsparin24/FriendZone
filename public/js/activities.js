// What each place in the world opens. There are three kinds:
//   area  – you teleport into a full-screen 3D area (stage.js)
//   world – it happens right there in the world (fishing off the dock)
//   mount – a panel opens over the world (trading, the shop, houses…)
// `icon` names an SVG badge from icons.js; `battle` switches the music to the fight playlist.
import { fishJournal } from './games/fishing.js';
import { archery } from './games/archery.js';
import { trading } from './games/trading.js';
import { racing } from './games/racing.js';
import { arena } from './games/arena.js';
import { boss } from './games/boss.js';
import { house } from './games/house.js';
import { doodle } from './games/doodle.js';
import { bumper } from './games/bumper.js';
import { casinoArea } from './areas/casino.js';
import { wardrobe } from './wardrobe.js';

export const ACTIVITIES = {
  racing: { icon: 'racing', emoji: '🏎️', name: 'Racing', place: 'Race Track', scene: 'race', area: racing },
  arena: { icon: 'arena', emoji: '⚔️', name: 'Arena', place: 'The Arena', scene: 'arena', battle: true, area: arena },
  boss: { icon: 'boss', emoji: '👾', name: 'Boss', place: 'Boss Cave', scene: 'boss', battle: true, area: boss },
  bumper: { icon: 'bumper', emoji: '💥', name: 'Bumper', place: 'Bumper Dome', scene: 'bumper', battle: true, area: bumper },
  archery: { icon: 'archery', emoji: '🏹', name: 'Archery', place: 'Archery Range', scene: 'archery', area: archery },
  casino: { icon: 'casino', emoji: '🎰', name: 'Casino', place: 'The Casino', scene: 'casino', area: casinoArea },
  fishing: { icon: 'fishing', emoji: '🎣', name: 'Fishing', world: 'fishing' },
  journal: { icon: 'fishing', emoji: '📖', name: 'Fish Journal', wide: true, mount: fishJournal },
  doodle: { icon: 'doodle', emoji: '🎨', name: 'Doodle', scene: 'doodle', wide: true, mount: doodle },
  trading: { icon: 'trading', emoji: '💰', name: 'Trading', mount: trading },
  shop: { icon: 'shop', emoji: '👕', name: 'Style Shop', wide: true, mount: (body) => wardrobe(body, { mode: 'shop' }) },
  wardrobe: { icon: 'wardrobe', emoji: '🪞', name: 'Wardrobe', wide: true, mount: (body) => wardrobe(body) },
  house: { icon: 'house', emoji: '🏠', name: 'Houses', scene: 'house', wide: true, mount: house },
};
