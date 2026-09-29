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

## Put it online (play from anywhere, no hosting on your PC)

The game is one small Python program, so any cloud host can run it 24/7 and everyone just opens the
link (e.g. `https://friendzone.onrender.com`). It stays fully multiplayer: every zone, invite code and
profile lives on that server.

**Render (easiest):**

1. Push this repo to GitHub.
2. Sign in at [render.com](https://render.com) with GitHub, then **New → Blueprint** and pick the repo.
   It reads `render.yaml` and sets everything up, including a 1 GB disk so progress is saved.
3. Wait for the deploy to finish and share the URL. Every `git push` redeploys automatically.

The blueprint uses Render's *Starter* plan because saved data needs a disk. To try it for free,
change `plan: starter` to `plan: free` and delete the `disk:` block. It works the same, but free
servers fall asleep after ~15 minutes idle (the first visit takes ~1 minute to wake it) and **zones are
wiped whenever it sleeps or redeploys**.

**Anywhere else:** the `Dockerfile` runs on Railway, Fly.io, a VPS, etc. Mount a volume at `/data`
so `data/zones.json` survives restarts. The host's `$PORT` is picked up automatically.

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
| Move | `WASD` / arrow keys (relative to the camera), or click the ground to walk there. Hold `Shift` to run |
| Camera | drag to rotate, scroll to zoom, `Q` / `R` to turn |
| Enter a building | walk up to it and press `E`, or click it. Games are played *at* their building, so go explore! |
| Leave an area | `← Leave` button (top-left) or `Esc` |
| Chat / emotes | `Enter` to chat, `1`–`6` for emotes (each has its own animation) |
| Sound + settings | 🔊 mutes everything; ⚙️ opens settings (volumes, music, camera/zoom sensitivity, invert Y, graphics quality, screen shake, name tags) |

## What's in the world

| | Activity | |
|---|---|---|
| 🏎️ | Race Track (3D) | Live kart race around an oval circuit: alternate ← → to drive, gantry start lights, chase camera, podium |
| ⚔️ | Arena (3D) | Blaster brawl inside the colosseum with dashing and power-ups (heart, rapid fire, shield, speed). First to 5 knockouts wins |
| 👾 | Boss Cave (3D) | Co-op boss fights for the whole zone: King Slime → Stone Golem → Shadow Dragon, then they come back tougher. Dodge telegraphed attacks, dash through bullets, revive downed friends. Everyone who helps gets coins, XP and a statue for their house; the MVP gets a bonus, and some bosses drop rare cosmetics |
| 💥 | Bumper Dome (3D) | Bumper cars on a shrinking ice rink: boost-ram everyone into the lake, last car standing wins. Rounds start automatically when 2+ drivers are in |
| 🎰 | Casino (3D) | Walk around a casino floor with your friends: slot machines, a prize wheel, coin flips, and a shared roulette table where everyone's chips are on the same spin |
| 🏹 | Archery Range (3D) | Over-the-shoulder archery: hold to draw, mind the wind, hit moving targets, beat the zone's best |
| 🎣 | Fishing | Right at the pond: step onto the dock, cast your line, hook the bite and keep your bar on the fish. Better tracking = rarer fish. Journal, treasure chests and pond records |
| 🎨 | Doodle Studio | Draw & guess for the whole group: take turns drawing a secret word while everyone races to guess it |
| 💰 | Trading | Send coins to anyone in your zone |
| 👕 | Style Shop | Buy cosmetics and open mystery crates |
| 🏠 | Houses | Your own 3D room: buy furniture, floors and wallpaper, place and rotate everything, then visit and ❤️ friends' houses. Your wardrobe lives here too. Furniture is interactive (lamps, TV, jukebox, piano, arcade…), and trophies unlock around the zone |
| 🗺️ | Exploration | Walk around the shared world, chat bubbles, emotes (keys 1–6), minimap |

Plus a daily bonus, levels from XP, and a zone news feed for big moments. Every action has a sound
effect and there's an upbeat soundtrack that cycles through songs (with battle music for fights), all
synthesized in the browser, so there are no audio files.

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
- `public/cosmetics.json`: cosmetics, crate odds, the fish table, and house furniture, floors and wallpapers
- `public/js/`: the web client. `world.js` (the 3D world, camera and movement), `map.js` (layout
  shared with collisions and the minimap), `stage.js` (the full-screen 3D areas you teleport into),
  `games/*.js` (one file per activity), `areas/casino.js` (the casino floor), `three/` (characters,
  buildings, furniture, effects, environment, materials), `wardrobe.js` (creator/shop), `sfx.js` +
  `music.js` (procedural sound effects and music), `settings.js` + `settings-panel.js`, `icons.js`
  (the SVG activity badges), `main.js` (screens and HUD)
- `public/icon.svg`: the app icon (browser tab)
- `public/vendor/three.module.min.js`: [Three.js](https://threejs.org) r164 (MIT), bundled so the
  game works without a CDN
- `data/zones.json`: saved zones and profiles (created on first run)
