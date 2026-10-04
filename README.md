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

## Put it online

The included `Dockerfile` runs on any container host (Railway, Fly.io, Koyeb, a VPS, etc.). Mount a
volume at `/data` so `data/zones.json` survives restarts. The host's `$PORT` is picked up automatically.

For a quick test without a cloud account you can also expose your own machine with a tunnel such as
`cloudflared tunnel --url http://localhost:8000` (only works while your PC is running the server).

## How zones work

1. **Create a FriendZone**: pick a zone name, your name, a 4–6 digit PIN, and a color.
2. Hit **copy link** in the lobby and send it to your group (`/?join=CODE`).
3. Friends open the link, choose a name and PIN, and they're in.
4. Your browser remembers the zones you're in. On a new device, join with the code and your
   name + PIN to get your profile back.

## Controls

| | |
|---|---|
| Move | `WASD` / arrow keys (relative to the camera), or click the ground to walk there (you'll find your way round things). Hold `Shift` to run |
| Camera | drag to rotate, scroll to zoom, `Q` / `R` to turn. Tap `Ctrl` for mouse look (the cursor hides and the camera follows your mouse; tap again to get it back) |
| Enter a building | walk up to it and press `E`, or click it. Games are played *at* their building, so go explore! |
| Map | click the minimap or press `M` for the big map; click a spot on it to walk there |
| Leave an area | `← Leave` button (top-left) or `Esc` |
| Chat / emotes | `Enter` to chat, `1`–`6` for emotes (each has its own animation) |
| Sound + settings | 🔊 mutes everything; ⚙️ opens settings (volumes, music, camera/zoom sensitivity, invert Y, graphics quality, screen shake, name tags) |

## What's in the world

| | Activity | |
|---|---|---|
| 🏎️ | Race Track (3D) | The FriendZone Grand Prix: a real kart race on a long circuit through a tunnel, over a lake bridge and past the city, with barrier walls all the way round so you can't leave the road. Drift for mini-turbos, hit boost pads, and grab item boxes for turbos, bananas, oil slicks, bouncy shells, homing rockets, zaps, shields and stars |
| ⚔️ | Arena (3D) | Blaster brawl inside the colosseum with dashing and power-ups (heart, rapid fire, shield, speed). First to 5 knockouts wins |
| 🏰 | Dungeon (3D, the Boss Cave) | A co-op climb: every run starts on floor 1. Clear the monsters (bats, slimelets, skeletons, archers, wisps, brutes), then everyone picks one of three upgrades (more damage, split shot, extra lives, shields…) and the group goes deeper. Every 3rd floor is a boss: King Slime, Stone Golem, the Bone Lich (who summons minions) and the Shadow Dragon, getting tougher each lap. Revived friends come back with one heart; if everyone goes down, the run is over and the zone keeps its record floor |
| 💥 | Bumper Dome (3D) | Bumper cars on a shrinking ice rink: gas, brake and steer, build up speed and boost-ram everyone into the lake. Getting hit stuns you and spins you out. Last car standing wins. Rounds start automatically when 2+ drivers are in |
| 🎰 | Casino (3D) | Walk around a casino floor with your friends: slot machines, a prize wheel, coin flips, blackjack against the dealer, and a shared roulette table where everyone's chips are on the same spin |
| 🏹 | Archery Range (3D) | Side-on archery: hold to draw the string back with both hands, mind the wind, hit moving targets, beat the zone's best |
| 🎣 | Fishing | Right at the lake: step onto the dock, cast your line, hook the bite and keep your bar on the fish. Better tracking = rarer fish. Buy better rods for a bigger bar and more luck. Journal, treasure chests and pond records |
| 🎨 | Doodle Studio | Draw & guess for the whole group: take turns drawing a secret word (pick one, or make up your own) while everyone races to guess it |
| 💰 | Trading | Send coins to anyone in your zone |
| 👕 | Style Shop (3D) | Walk in and browse the mannequins for every kind of clothing, open mystery crates, or change at the mirror |
| 🐾 | Pet Shop (3D) | Meet the pets in their pens and buy one, or hatch a random pet from an egg (cheaper). Pets follow you everywhere |
| 🏠 | Houses | Maple Lane, a street where every member has a plot with their house on it. You arrive on the pavement outside yours, walk up the path and in through the front door (doors open as you walk up), and can stroll over to anyone else's. Build mode works inside and out: furniture, room walls, a finish for every wall inside (wallpaper, panelling…) and outside (siding, brick, stone, stucco, logs… one wall at a time if you like), trim or no trim, the roof (shape, material, colour, chimney), paths and driveways, and a yard of trees, fences and flowers. Furniture is interactive (lamps, TV, jukebox, piano, arcade…), friends can ❤️ your house, and you can let them build with you |
| 🗺️ | Exploration | Walk around the shared world, chat bubbles, emotes (keys 1–6), minimap |

The town has a square with a fountain, winding streets, a spring-fed creek with bridges, cottages, market stalls, a windmill on the
highland and a lighthouse by the lake. It runs on a shared day and night cycle (the lamps light up after sunset; it can be turned off in ⚙️ settings).
Plus a daily bonus, levels from XP, and a zone news feed for big moments. Every action has a sound
effect and there's an upbeat soundtrack that cycles through songs (with battle music for fights), all
synthesized in the browser, so there are no audio files.

## Characters and cosmetics

Everyone designs a character the first time they join a zone: height and build, skin tone, eye style
and color, hairstyle and hair color, top, bottoms and shoes, with every color picked from rows of shades
(pinks, blues, greens…). Starter items are free, and cooler ones are collected per zone:

- **Style Shop**: buy items with coins.
- **Mystery crates**: 400 coins for a random item you don't own yet (common → legendary).
- **Achievements**: e.g. win a race → Racing Helmet, catch a Golden Koi → Koi Spirit aura,
  reach level 15 → Crown.

Items, prices, unlock rules and fish all live in `public/cosmetics.json`, which both the server
and the client read, so adding a new item is mostly a matter of adding it there (and building its
3D model in `public/js/three/character.js`).

## Files

- `server.py`: HTTP + WebSocket server and all game rules (Python standard library only)
- `public/cosmetics.json`: cosmetics, crate odds, the fish table, and house furniture, floors and wallpapers
- `public/js/`: the web client. `world.js` (the 3D world, camera and movement), `map.js` (layout
  shared with collisions and the minimap), `stage.js` (the full-screen 3D areas you teleport into),
  `games/*.js` (one file per activity; `house.js` is the inside of a house and build mode, `hood.js` the street the houses stand on), `areas/` (the casino floor and the walk-in shops), `three/` (characters,
  pets, buildings, the town's props, furniture, the outside of houses (`exterior.js`: wall finishes, roofs, paths, yard), effects, environment, day and night, materials), `mouselook.js` (Ctrl mouse look), `wardrobe.js` (creator/shop), `sfx.js` +
  `music.js` (procedural sound effects and music), `settings.js` + `settings-panel.js`, `icons.js`
  (the SVG activity badges), `main.js` (screens and HUD)
- `public/icon.svg`: the app icon (browser tab)
- `public/vendor/three.module.min.js`: [Three.js](https://threejs.org) r164 (MIT), bundled so the
  game works without a CDN
- `data/zones.json`: saved zones and profiles (created on first run)
