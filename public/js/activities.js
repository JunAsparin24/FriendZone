// What each place in the world opens. There are three kinds:
//   area  – you teleport into a full-screen 3D area (stage.js)
//   world – it happens right there in the world (fishing off the dock)
//   mount – a panel opens over the world (trading, the shop, houses…)
// `icon` names an SVG badge from icons.js; `battle` switches the music to the fight playlist.
import { fishJournal, fishMarket } from './games/fishing.js';
import { archery } from './games/archery.js';
import { racing } from './games/racing.js';
import { arena } from './games/arena.js';
import { lasertag } from './games/lasertag.js';
import { boss } from './games/boss.js';
import { house } from './games/house.js';
import { doodle } from './games/doodle.js';
import { arcadeArea } from './areas/arcade.js';
import { tavernArea } from './areas/tavern.js';
import { casinoArea } from './areas/casino.js';
import { styleShopArea, petShopArea } from './areas/store.js';
import { beachArea } from './areas/beach.js';
import { wardrobe } from './wardrobe.js';

export const ACTIVITIES = {
  racing: { icon: 'racing', emoji: '🏎️', name: 'Racing', place: 'Race Track', scene: 'race', area: racing,
    touch: { buttons: [{ icon: '🌀', label: 'Drift', key: ' ', code: 'Space' }, { icon: '🎁', label: 'Item', key: 'Shift', code: 'ShiftLeft' }, { icon: '↩️', label: 'Back', key: 'q', code: 'KeyQ' }], hint: 'Left thumb: push up to drive, left/right to steer · hold <b>Drift</b> through corners' } },
  arena: { icon: 'arena', emoji: '⚔️', name: 'Arena', place: 'The Arena', scene: 'arena', battle: true, area: arena,
    touch: { buttons: [{ icon: '🔫', label: 'Fire', key: 'f', code: 'KeyF', big: true }, { icon: '⤴️', label: 'Jump', key: ' ', code: 'Space' }, { icon: '💨', label: 'Slide', key: 'Shift', code: 'ShiftLeft' }], hint: 'Left thumb: move · Right thumb: drag to look · hold <b>Fire</b> to shoot' } },
  // (through the doorway in the Arcade; leaving takes you back there)
  lasertag: { icon: 'arcade', emoji: '🔫', name: 'Laser Tag', place: 'Laser Tag', scene: 'lasertag', battle: true, area: lasertag, back: 'arcade',
    touch: { buttons: [{ icon: '🔫', label: 'Fire', key: 'f', code: 'KeyF', big: true }, { icon: '⤴️', label: 'Jump', key: ' ', code: 'Space' }, { icon: '🫳', label: 'Lie down', key: 'c', code: 'KeyC' }], hint: 'Left thumb: move · Right thumb: drag to look · hold <b>Fire</b> · <b>Lie down</b> behind low cover' } },
  boss: { icon: 'boss', emoji: '👾', name: 'Boss', place: 'Boss Cave', scene: 'boss', battle: true, area: boss,
    touch: { aim: true, buttons: [{ icon: '💨', label: 'Dash', key: ' ', code: 'Space' }], hint: 'Left thumb: move · Right thumb: touch where to shoot · <b>Dash</b> to dodge' } },
  arcade: { icon: 'arcade', emoji: '🕹️', name: 'Arcade', place: 'The Arcade', scene: 'arcade', area: arcadeArea,
    touch: { hint: 'Left thumb: walk · Right thumb: look around · tap a cabinet to play' } },
  archery: { icon: 'archery', emoji: '🏹', name: 'Archery', place: 'Archery Range', scene: 'archery', area: archery,
    touch: { stick: false, hint: '<b>Hold</b> to draw the bow, drag to aim, let go to shoot' } },
  casino: { icon: 'casino', emoji: '🎰', name: 'Casino', place: 'The Casino', scene: 'casino', area: casinoArea,
    touch: { hint: 'Left thumb: walk · Right thumb: look around · tap things to use them' } },
  fishing: { icon: 'fishing', emoji: '🎣', name: 'Fishing', world: 'fishing' },
  journal: { icon: 'fishing', emoji: '📖', name: 'Fish Journal', wide: true, mount: fishJournal },
  journalOcean: { icon: 'fishing', emoji: '📖', name: 'Fish Journal', wide: true, mount: (body) => fishJournal(body, { water: 'ocean' }) },
  fishstand: { icon: 'fishing', emoji: '🐟', name: 'Fish Market', wide: true, mount: fishMarket },
  doodle: { icon: 'doodle', emoji: '🎨', name: 'Doodle', scene: 'doodle', wide: true, mount: doodle },
  trading: { icon: 'tavern', emoji: '🍺', name: 'Trading Tavern', place: 'Trading Tavern', scene: 'tavern', area: tavernArea,
    touch: { hint: 'Left thumb: walk · walk up to someone to trade with them' } },
  shop: { icon: 'shop', emoji: '👕', name: 'Style Shop', place: 'Style Shop', scene: 'shop', area: styleShopArea,
    touch: { hint: 'Left thumb: walk · Right thumb: look around · tap things to use them' } },
  pets: { icon: 'pets', emoji: '🐾', name: 'Pet Shop', place: 'Pet Shop', scene: 'petshop', area: petShopArea,
    touch: { hint: 'Left thumb: walk · Right thumb: look around · tap things to use them' } },
  portal: { icon: 'portal', emoji: '🌴', name: 'Coral Cove', place: 'Coral Cove', scene: 'beach', area: beachArea,
    touch: { buttons: [{ icon: '🏀', label: 'Shoot/Dig', key: 'f', code: 'KeyF', big: true }, { icon: '🫳', label: 'Steal/Spin', key: 'c', code: 'KeyC' }, { icon: '🤾', label: 'Pass', key: 'v', code: 'KeyV' }, { icon: '↔️', label: 'Cross', key: 'z', code: 'KeyZ' }, { icon: '✋', label: 'Block', key: 'b', code: 'KeyB' }], hint: 'Left thumb: walk · Right thumb: look around · <b>Dig</b> where the detector beeps fastest' } },
  wardrobe: { icon: 'wardrobe', emoji: '🪞', name: 'Wardrobe', wide: true, mount: (body) => wardrobe(body) },
  house: { icon: 'house', emoji: '🏠', name: 'Houses', place: 'Houses', scene: 'house', area: house,
    touch: { buttons: [{ icon: '🔄', label: 'Rotate', key: 'r', code: 'KeyR' }], hint: 'Left thumb: walk · Right thumb: look around · tap to place furniture' } },
};
