// Cosmetics + fish catalog, shared with the server via cosmetics.json.
export const CATALOG = await (await fetch('cosmetics.json')).json();
export const ITEMS = Object.fromEntries(CATALOG.items.map((i) => [i.id, i]));
export const SLOTS = ['hair', 'top', 'bottom', 'hat', 'face', 'back', 'aura', 'pet'];

export const RARITY = {
  junk: { label: 'Junk', color: '#8a8fa8' },
  common: { label: 'Common', color: '#c3c9e4' },
  uncommon: { label: 'Uncommon', color: '#6ee7a0' },
  rare: { label: 'Rare', color: '#39c6ff' },
  epic: { label: 'Epic', color: '#b77bff' },
  legendary: { label: 'Legendary', color: '#ffc53d' },
  mythic: { label: 'Mythic', color: '#ff4fd8' },
};

export const owns = (player, id) => !!ITEMS[id]?.free || player.owned.includes(id);

export function howToGet(item) {
  if (item.free) return 'Free';
  if (item.unlock) return item.unlock.hint;
  if (item.drop) return `Boss drop: ${item.drop}`;
  if (item.price) return `${item.price.toLocaleString()} coins${item.crate ? ' · or crates' : item.petRoll ? ' · or a pet egg' : ''}`;
  return 'Crates only';
}
