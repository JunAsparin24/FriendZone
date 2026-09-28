// Activity registry: what each building in the world opens.
import { fishing } from './games/fishing.js';
import { archery } from './games/archery.js';
import { casino } from './games/casino.js';
import { trading } from './games/trading.js';
import { racing } from './games/racing.js';
import { arena } from './games/arena.js';
import { wardrobe } from './wardrobe.js';

const comingSoon = (emoji, name, blurb) => (body) => {
  body.innerHTML = `<h2>${emoji} ${name}</h2><p class="soon-tag">Coming soon</p><p class="muted">${blurb}</p>`;
  return () => {};
};

export const ACTIVITIES = {
  racing: { emoji: '🏎️', name: 'Racing', scene: 'race', wide: true, mount: racing },
  arena: { emoji: '⚔️', name: 'Arena', scene: 'arena', wide: true, mount: arena },
  archery: { emoji: '🏹', name: 'Archery', wide: true, mount: archery },
  fishing: { emoji: '🎣', name: 'Fishing', wide: true, mount: fishing },
  casino: { emoji: '🎰', name: 'Casino', mount: casino },
  trading: { emoji: '💰', name: 'Trading', mount: trading },
  shop: { emoji: '👕', name: 'Style Shop', wide: true, mount: (body) => wardrobe(body, { mode: 'shop' }) },
  wardrobe: { emoji: '🪞', name: 'Wardrobe', wide: true, mount: (body) => wardrobe(body) },
  boss: { emoji: '👾', name: 'Boss', mount: comingSoon('👾', 'Boss Cave', 'Team up with everyone in your zone to take down giant bosses for rare loot.') },
  house: { emoji: '🏠', name: 'Houses', mount: comingSoon('🏠', 'Houses', 'Claim a plot, build a house and decorate it with things you win around the zone.') },
};
