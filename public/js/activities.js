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
import { styleShopArea, petShopArea } from './areas/store.js';
import { wardrobe } from './wardrobe.js';

export const ACTIVITIES = {
  racing: { icon: 'racing', emoji: '🏎️', name: 'Racing', place: 'Race Track', scene: 'race', area: racing,
    touch: { buttons: [{ icon: '🌀', label: 'Drift', key: ' ', code: 'Space' }, { icon: '🎁', label: 'Item', key: 'Shift', code: 'ShiftLeft' }], hint: 'Left thumb: push up to drive, left/right to steer · hold <b>Drift</b> through corners' } },
  arena: { icon: 'arena', emoji: '⚔️', name: 'Arena', place: 'The Arena', scene: 'arena', battle: true, area: arena,
    touch: { aim: true, buttons: [{ icon: '💨', label: 'Dash', key: ' ', code: 'Space' }], hint: 'Left thumb: move · Right thumb: touch where to shoot · <b>Dash</b> to dodge' } },
  boss: { icon: 'boss', emoji: '👾', name: 'Boss', place: 'Boss Cave', scene: 'boss', battle: true, area: boss,
    touch: { aim: true, buttons: [{ icon: '💨', label: 'Dash', key: ' ', code: 'Space' }], hint: 'Left thumb: move · Right thumb: touch where to shoot · <b>Dash</b> to dodge' } },
  bumper: { icon: 'bumper', emoji: '💥', name: 'Bumper', place: 'Bumper Dome', scene: 'bumper', battle: true, area: bumper,
    touch: { buttons: [{ icon: '🚀', label: 'Boost', key: ' ', code: 'Space' }], hint: 'Left thumb: drive any way · <b>Boost</b> to ram!' } },
  archery: { icon: 'archery', emoji: '🏹', name: 'Archery', place: 'Archery Range', scene: 'archery', area: archery,
    touch: { stick: false, hint: '<b>Hold</b> to draw the bow, drag to aim, let go to shoot' } },
  casino: { icon: 'casino', emoji: '🎰', name: 'Casino', place: 'The Casino', scene: 'casino', area: casinoArea,
    touch: { hint: 'Left thumb: walk · Right thumb: look around · tap things to use them' } },
  fishing: { icon: 'fishing', emoji: '🎣', name: 'Fishing', world: 'fishing' },
  journal: { icon: 'fishing', emoji: '📖', name: 'Fish Journal', wide: true, mount: fishJournal },
  doodle: { icon: 'doodle', emoji: '🎨', name: 'Doodle', scene: 'doodle', wide: true, mount: doodle },
  trading: { icon: 'trading', emoji: '💰', name: 'Trading', mount: trading },
  shop: { icon: 'shop', emoji: '👕', name: 'Style Shop', place: 'Style Shop', scene: 'shop', area: styleShopArea,
    touch: { hint: 'Left thumb: walk · Right thumb: look around · tap things to use them' } },
  pets: { icon: 'pets', emoji: '🐾', name: 'Pet Shop', place: 'Pet Shop', scene: 'petshop', area: petShopArea,
    touch: { hint: 'Left thumb: walk · Right thumb: look around · tap things to use them' } },
  wardrobe: { icon: 'wardrobe', emoji: '🪞', name: 'Wardrobe', wide: true, mount: (body) => wardrobe(body) },
  house: { icon: 'house', emoji: '🏠', name: 'Houses', place: 'Houses', scene: 'house', area: house,
    touch: { buttons: [{ icon: '🔄', label: 'Rotate', key: 'r', code: 'KeyR' }], hint: 'Left thumb: walk · Right thumb: look around · tap to place furniture' } },
};
