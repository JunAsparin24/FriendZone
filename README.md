# FRIENDZONE

A browser-based 3D multiplayer world for your friend group, and for any other group too.

Anyone can **create a FriendZone**, a private world with its own invite code. Everyone who joins
gets a little character, and all progress (coins, levels, wins, eliminations, fish…) is saved
**per zone**. You can be in as many zones as you like: your stats in "The Squad" are separate from
your stats in "Work Friends".

## Run it

Needs Python 3.9+ and nothing else (no `pip install`).

```sh
python server.py          # or: py server.py   on Windows
```

Open http://localhost:8000. The server also prints a LAN address friends on the same Wi-Fi can use.
Set `PORT=3000` to change the port. Data is saved to `data/zones.json`.

To play with friends elsewhere, host it anywhere that runs Python (Render, Railway, Fly.io, a VPS)
with `python server.py` as the start command, or expose your machine with a tunnel such as
`cloudflared tunnel --url http://localhost:8000`.

## How zones work

1. **Create a FriendZone**: pick a zone name, your name, a 4–6 digit PIN, and a color.
2. Hit **copy link** in the lobby and send it to your group (`/?join=CODE`).
3. Friends open the link, choose a name and PIN, and they're in.
4. Your browser remembers the zones you're in. On a new device, join with the code and your
   name + PIN to get your profile back.

## Controls

| | |
|---|---|
| Move | `WASD` / arrow keys (relative to the camera), or click the ground to walk there |
| Camera | drag to rotate, scroll to zoom, `Q` / `R` to turn |
| Enter a building | walk up to it and press `E`, or click it |
| Chat / emotes | `Enter` to chat, `1`–`6` for emotes |

## What's in the world

| | Activity | |
|---|---|---|
| 🏎️ | Racing | Live multiplayer kart race: alternate ← → to drive, start lights, podium |
| ⚔️ | Arena | Live top-down blaster brawl with dashing, first to 5 knockouts wins the round |
| 🏹 | Archery | Hold to draw the bow, mind the wind, hit moving targets, score up to 50 |
| 🎣 | Fishing | Stardew-style: charge a cast, hook the bite, hold to keep your bar on the fish. Better tracking = rarer fish. Fish journal + treasure chests |
| 🎰 | Casino | Slot machine, prize wheel and a 3D coin flip |
| 💰 | Trading | Send coins to anyone in your zone |
| 👕 | Style Shop | Buy cosmetics and open mystery crates |
| 🗺️ | Exploration | Walk around the shared world, chat bubbles, emotes (keys 1–6), minimap |
| 👾 🏠 | Boss fights, Houses | Coming soon |

Plus a daily bonus, levels from XP, and a zone news feed for big moments.

## Characters and cosmetics

Everyone designs a character the first time they join a zone: skin tone, hairstyle, hair color,
outfit and colors. Starter items are free, and cooler ones are collected per zone:

- **Style Shop**: buy items with coins.
- **Mystery crates**: 400 coins for a random item you don't own yet (common → legendary).
- **Achievements**: e.g. win a race → Racing Helmet, catch a Golden Koi → Koi Spirit aura,
  reach level 15 → Crown.

Items, prices, unlock rules and fish all live in `public/cosmetics.json`, which both the server
and the client read, so adding a new item is mostly a matter of adding it there (and building its
3D model in `public/js/three/character.js`).

## Files

- `server.py`: HTTP + WebSocket server and all game rules (Python standard library only)
- `public/cosmetics.json`: cosmetics, crate odds and the fish table
- `public/js/`: the web client. `world.js` (the 3D world, camera and movement), `map.js` (layout
  shared with collisions and the minimap), `three/` (characters, buildings, environment, materials),
  `avatar.js` (3D-rendered portraits and mini-game sprites), `wardrobe.js` (creator/shop),
  `games/*.js` (one file per activity), `main.js` (screens and HUD)
- `public/vendor/three.module.min.js`: [Three.js](https://threejs.org) r164 (MIT), bundled so the
  game works without a CDN
- `data/zones.json`: saved zones and profiles (created on first run)
