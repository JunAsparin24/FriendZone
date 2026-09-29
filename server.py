#!/usr/bin/env python3
"""FriendZone server: serves the web client and runs the multiplayer game.

Standard library only (Python 3.9+), so there is nothing to install:

    python server.py              # then open http://localhost:8000
    PORT=3000 python server.py    # pick another port

Every FriendZone (a private group with its own invite code) and all of its
members' progress is saved to data/zones.json.
"""
import asyncio
import base64
import gzip
import hashlib
import hmac
import json
import math
import os
import random
import re
import secrets
import socket
import struct
import sys
import time
from pathlib import Path
import signal
import urllib.request
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA_FILE = Path(os.environ.get("FZ_DATA", ROOT / "data" / "zones.json"))
# Optional free cloud save (Upstash Redis REST). Free hosts wipe local files when they sleep,
# so when these are set, zones are also kept in Redis and restored on startup.
REDIS_URL = os.environ.get("UPSTASH_REDIS_REST_URL", "").rstrip("/")
REDIS_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")
REDIS_KEY = "friendzone:zones"
CLOUD_SAVE_EVERY = 30  # seconds; keeps well inside Upstash's free request allowance
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_MESSAGE = 64 * 1024
IDLE_TIMEOUT = 90  # clients ping every 25s

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
NAME_RE = re.compile(r"^[A-Za-z0-9 _\-]{1,16}$")
PIN_RE = re.compile(r"^\d{4,6}$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_MEMBERS = 50

SCENES = {"lobby", "world", "race", "arena", "boss", "house", "casino", "doodle", "bumper", "archery"}
AREA_SCENES = {"casino"}  # 3D rooms you walk around in; positions are relayed to everyone inside
POSES = {"fish", "cast", "bite", "reel", "catch", "bench"}
WORLD_W, WORLD_H = 3600, 2400
START_COINS = 500
DAILY_BONUS = 300
DAILY_SECS = 20 * 3600

RACE_LAPS = 3
RACE_LEN = 210  # steps for the whole race (70 per lap)
RACE_TIMEOUT = 100
RACE_PRIZES = [(150, 40), (80, 25), (50, 15)]  # (coins, xp) by place
RACE_PRIZE_REST = (25, 10)
RACE_PRIZE_SOLO = (40, 15)

ARENA_W, ARENA_H = 900, 600
ARENA_HP = 3
ARENA_TARGET = 5
ARENA_SPAWNS = [(70, 70), (830, 70), (70, 530), (830, 530), (450, 60), (450, 540), (60, 300), (840, 300)]

# Boss Cave: everyone in the zone teams up against one boss at a time. The server runs the boss
# (movement, attack patterns, HP); clients dodge and report their own hits, like the arena.
BOSS_W, BOSS_H = 900, 600
BOSS_TICK = 0.1
BOSS_PLAYER_HP = 5
BOSS_IFRAMES = 0.9       # seconds of invulnerability after taking a hit
BOSS_REVIVE_R = 60       # stand this close to a downed friend to revive them
BOSS_REVIVE_T = 2.0      # seconds it takes
BOSS_AUTO_REVIVE = 10    # or get back up on your own after this long
BOSS_SPAWNS = [(300, 500), (450, 530), (600, 500), (200, 450), (700, 450), (450, 460)]
BOSSES = [
    {"id": "slime", "name": "King Slime", "hp": 150, "r": 50, "speed": 80,
     "attacks": ["hop", "volley", "slam", "hop"], "loot": "trophy_slime"},
    {"id": "golem", "name": "Stone Golem", "hp": 240, "r": 56, "speed": 58,
     "attacks": ["slam", "rocks", "charge", "volley"], "loot": "trophy_golem", "drop": ("hat_horns", 0.25)},
    {"id": "dragon", "name": "Shadow Dragon", "hp": 330, "r": 60, "speed": 95,
     "attacks": ["spiral", "charge", "rocks", "volley", "spiral"], "loot": "trophy_dragon", "drop": ("aura_shadow", 0.2)},
]

ARENA_PILLARS = [(200, 140, 70, 60), (630, 140, 70, 60), (200, 400, 70, 60), (630, 400, 70, 60), (405, 265, 90, 70)]
ARENA_ITEMS = ("heal", "rapid", "shield", "speed")
ARENA_ITEM_EVERY = 6
ARENA_MAX_ITEMS = 3

# Doodle Guess: take turns drawing a word while everyone else guesses.
DOODLE_CHOOSE, DOODLE_DRAW, DOODLE_REVEAL, DOODLE_OVER = 12, 80, 5, 10
DOODLE_PRIZES = [(160, 80), (90, 50), (60, 30)]
DOODLE_REST = (20, 10)
DOODLE_MAX_POINTS = 40000
DOODLE_WORDS = [w.strip() for w in """
apple, banana, pizza, burger, donut, ice cream, cookie, cake, taco, sushi, carrot, cheese, egg, popcorn, watermelon,
cat, dog, fish, bird, snake, spider, turtle, rabbit, frog, penguin, giraffe, elephant, lion, monkey, octopus, shark,
whale, crab, bee, butterfly, snail, owl, duck, horse, cow, pig, sheep, dinosaur, dragon, unicorn, bat, mouse, bear,
house, castle, bridge, tent, lighthouse, igloo, school, rocket, airplane, car, bicycle, boat, train, bus, tractor,
helicopter, submarine, skateboard, scooter, balloon, kite, umbrella, glasses, hat, crown, shoe, sock, backpack,
guitar, piano, drum, trumpet, microphone, headphones, camera, phone, computer, television, clock, lamp, candle,
key, lock, book, pencil, scissors, hammer, ladder, bucket, broom, toothbrush, mirror, chair, bed, sofa, door,
window, sun, moon, star, cloud, rainbow, lightning, snowman, tree, flower, cactus, mushroom, volcano, mountain,
island, beach, wave, fire, ghost, robot, alien, pirate, ninja, wizard, mermaid, zombie, vampire, superhero,
soccer, basketball, trophy, medal, bowling, fishing rod, sword, shield, bow, treasure, map, compass, anchor,
heart, smile, eye, hand, foot, nose, ear, tooth, skeleton, brain, muscle, crying, sleeping, dancing, jumping,
swimming, running, snowball, sandcastle, campfire, fireworks, birthday, gift, party hat, magnet, battery, bomb,
diamond, coin, piggy bank, slot machine, dice, cards, chess, puzzle, yo-yo, teddy bear, spaceship, planet, comet,
""".split(",") if w.strip()]

# Bumper Brawl: knock everyone off a shrinking ice rink. Clients run their own car physics.
BUMPER_SPAWN_R = 150
BUMPER_ROUND_MAX = 75
BUMPER_START_DELAY = 2.5

# Roulette: one shared table in the casino, a new spin every ~30s.
ROULETTE_BET_T, ROULETTE_SPIN_T, ROULETTE_PAUSE_T = 20, 6, 4
ROULETTE_RED = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
ROULETTE_PAYS = {"num": 36, "red": 2, "black": 2, "odd": 2, "even": 2, "low": 2, "high": 2, "dozen": 3}


def roulette_hits(kind, v, n):
    if kind == "num":
        return n == v
    if n == 0:
        return False
    return {"red": n in ROULETTE_RED, "black": n not in ROULETTE_RED, "odd": n % 2 == 1, "even": n % 2 == 0,
            "low": n <= 18, "high": n >= 19, "dozen": (n - 1) // 12 + 1 == v}[kind]


def squash(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def near_miss(a, b):
    """True if the guess is one typo away from the word."""
    if a == b or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    short, long_ = sorted((a, b), key=len)
    return any(long_[:i] + long_[i + 1:] == short for i in range(len(long_)))


HOUSE_SIZE = 8  # rooms are HOUSE_SIZE x HOUSE_SIZE tiles
HOUSE_MAX_ITEMS = 80

# Cosmetics and fish are shared with the client through one catalog file.
CATALOG = json.loads((PUBLIC / "cosmetics.json").read_text("utf-8"))
ITEMS = {item["id"]: item for item in CATALOG["items"]}
FISH = CATALOG["fish"]
FURN = {f["id"]: f for f in CATALOG["furniture"]}
FLOORS = {f["id"]: f for f in CATALOG["floors"]}
WALLS = {f["id"]: f for f in CATALOG["walls"]}
LOOK_SLOTS = ("hair", "top", "hat", "face", "back", "aura")
LOOK_COLORS = {"skin": "skins", "hairColor": "hairColors", "topColor": "clothColors", "bottomColor": "clothColors"}
STAT_KEYS = ("wins", "elims", "raceWins", "arenaWins", "fish", "koi", "archeryBest", "jackpots", "bossKills", "houseLikes",
             "doodleWins", "bumperWins")

SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"]
SLOT_WEIGHTS = [30, 25, 20, 13, 8, 4]
SLOT_TRIPLE = {"🍒": 5, "🍋": 8, "🔔": 12, "⭐": 20, "💎": 40, "7️⃣": 77}
WHEEL = [0, 1.5, 0, 2, 0, 0.5, 0, 2, 0, 1.5, 0, 0.5, 0, 2, 0, 5]  # multipliers, clockwise from the top
MAX_BET = 5000
EMOTES = {"wave", "laugh", "heart", "fire", "gg", "wow"}


class GameError(Exception):
    """A problem worth showing to the player."""


# --------------------------------------------------------------------------
# WebSocket (RFC 6455) on top of asyncio streams
# --------------------------------------------------------------------------

def unmask(data, mask):
    n = len(data)
    key = (mask * (n // 4 + 1))[:n]
    return (int.from_bytes(data, "big") ^ int.from_bytes(key, "big")).to_bytes(n, "big")


class WebSocket:
    def __init__(self, reader, writer):
        self.reader, self.writer = reader, writer
        self.closed = False

    async def recv(self):
        """Return the next text message, or None once the peer closes."""
        buf = b""
        while True:
            b1, b2 = await self.reader.readexactly(2)
            op, n = b1 & 0x0F, b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", await self.reader.readexactly(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", await self.reader.readexactly(8))[0]
            if len(buf) + n > MAX_MESSAGE:
                return None
            mask = await self.reader.readexactly(4) if b2 & 0x80 else b""
            data = await self.reader.readexactly(n)
            if mask:
                data = unmask(data, mask)
            if op == 0x8:
                self._frame(0x8, data[:2])
                return None
            if op == 0x9:
                self._frame(0xA, data)
                continue
            if op == 0xA:
                continue
            buf += data
            if b1 & 0x80:
                return buf.decode("utf-8", "replace")

    def _frame(self, op, data):
        if self.closed:
            return
        n = len(data)
        if n < 126:
            head = struct.pack(">BB", 0x80 | op, n)
        elif n < 65536:
            head = struct.pack(">BBH", 0x80 | op, 126, n)
        else:
            head = struct.pack(">BBQ", 0x80 | op, 127, n)
        try:
            self.writer.write(head + data)
            if self.writer.transport.get_write_buffer_size() > 1 << 20:
                self.close()  # client is not keeping up
        except (ConnectionError, RuntimeError):
            self.close()

    def send_raw(self, data):
        self._frame(0x1, data)

    def send(self, msg):
        self.send_raw(encode(msg))

    def close(self):
        if not self.closed:
            self.closed = True
            try:
                self.writer.close()
            except Exception:
                pass


def encode(msg):
    return json.dumps(msg, separators=(",", ":"), ensure_ascii=False).encode()


# --------------------------------------------------------------------------
# Persistence
# --------------------------------------------------------------------------

def redis(method, command, body=None):
    req = urllib.request.Request(f"{REDIS_URL}/{command}", data=body, method=method,
                                 headers={"Authorization": f"Bearer {REDIS_TOKEN}"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read()).get("result")


class Store:
    def __init__(self, path):
        self.path = path
        self.zones = {}
        self.dirty = False
        self.cloud = bool(REDIS_URL and REDIS_TOKEN)
        self.cloud_dirty = False
        if path.exists():
            self.zones = json.loads(path.read_text("utf-8")).get("zones", {})
        elif self.cloud:
            try:
                blob = redis("GET", f"get/{REDIS_KEY}")
                if blob:
                    self.zones = json.loads(gzip.decompress(base64.b64decode(blob))).get("zones", {})
                print(f"Loaded {len(self.zones)} zones from cloud save")
            except Exception as e:
                # Never overwrite a save we couldn't read: stay local-only until restarted.
                self.cloud = False
                print("cloud load failed, cloud save disabled:", e)
        for zone in self.zones.values():
            for player in zone["players"].values():
                migrate(player)

    def mark(self):
        self.dirty = True
        self.cloud_dirty = True

    def cloud_snapshot(self):
        """Serialize on the game thread; returns None when there is nothing new to upload."""
        if not (self.cloud and self.cloud_dirty):
            return None
        self.cloud_dirty = False
        return base64.b64encode(gzip.compress(json.dumps({"zones": self.zones}, separators=(",", ":")).encode()))

    def cloud_upload(self, blob):
        try:
            redis("POST", f"set/{REDIS_KEY}", blob)
        except Exception as e:
            self.cloud_dirty = True
            print("cloud save failed:", e)

    def cloud_save(self):
        blob = self.cloud_snapshot()
        if blob:
            self.cloud_upload(blob)

    def save(self):
        if not self.dirty:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"zones": self.zones}, ensure_ascii=False, indent=1), "utf-8")
        os.replace(tmp, self.path)
        self.dirty = False

    async def autosave(self):
        ticks = 0
        while True:
            await asyncio.sleep(3)
            try:
                self.save()
            except OSError as e:
                print("save failed:", e)
            ticks += 1
            if ticks % (CLOUD_SAVE_EVERY // 3) == 0:
                blob = self.cloud_snapshot()
                if blob:
                    await asyncio.to_thread(self.cloud_upload, blob)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def hash_pin(pin, salt):
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), 20_000).hex()


def level_for(xp):
    return 1 + int(math.sqrt(xp / 100))


def clean(value, limit):
    text = re.sub(r"[\x00-\x1f\x7f]", "", str(value or ""))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def num(value, lo, hi):
    v = float(value)
    if not math.isfinite(v):
        raise ValueError("not a number")
    return min(hi, max(lo, v))


def default_look(color):
    hair = [i["id"] for i in CATALOG["items"] if i["slot"] == "hair" and i.get("free") and i["id"] != "hair_none"]
    return {
        "skin": random.choice(CATALOG["skins"]),
        "hairColor": random.choice(CATALOG["hairColors"][:5]),
        "topColor": color if color in CATALOG["clothColors"] else random.choice(CATALOG["clothColors"]),
        "bottomColor": "#23263f",
        "hair": random.choice(hair), "top": "top_tee",
        "hat": "hat_none", "face": "face_none", "back": "back_none", "aura": "aura_none",
    }


def default_house():
    return {
        "floor": "floor_wood", "wall": "wall_cream", "likes": [],
        "items": [
            {"id": "bed", "x": 1, "y": 0, "r": 0}, {"id": "lamp", "x": 0, "y": 0, "r": 0},
            {"id": "plant", "x": 7, "y": 0, "r": 0}, {"id": "table", "x": 5, "y": 4, "r": 0},
            {"id": "chair", "x": 5, "y": 5, "r": 2}, {"id": "closet", "x": 3, "y": 0, "r": 0},
        ],
    }


def give_closet(p):
    """Everyone gets a wardrobe in their house (older saves get one placed in the first free spot)."""
    if p["furni"].get("closet"):
        return
    p["furni"]["closet"] = 1
    taken = set()
    for it in p["house"]["items"]:
        f = FURN.get(it["id"])
        if not f or f.get("kind", "floor") != "floor":
            continue
        w, d = (f["w"], f["d"]) if it["r"] % 2 == 0 else (f["d"], f["w"])
        taken |= {(it["x"] + i, it["y"] + j) for i in range(w) for j in range(d)}
    for y in range(HOUSE_SIZE):
        for x in range(HOUSE_SIZE):
            if (x, y) not in taken:
                p["house"]["items"].append({"id": "closet", "x": x, "y": y, "r": 0})
                return


def migrate(p):
    """Fill in fields added after a profile was first saved."""
    p.setdefault("look", default_look(p.get("color")))
    p.setdefault("lookSet", False)
    p.setdefault("owned", [])
    p.setdefault("fishdex", {})
    p.setdefault("furni", {f["id"]: 1 for f in CATALOG["furniture"] if f.get("starter")})
    p.setdefault("house", default_house())
    give_closet(p)
    for stat in STAT_KEYS:
        p["stats"].setdefault(stat, 0)
    return p


def new_player(name, pin, color):
    salt = secrets.token_hex(8)
    return migrate({
        "name": name, "color": color, "salt": salt, "pin": hash_pin(pin, salt), "tokens": [],
        "coins": START_COINS, "xp": 0, "lastDaily": 0, "created": int(time.time()), "stats": {},
    })


def owns(p, item_id):
    item = ITEMS.get(item_id)
    return bool(item) and (item.get("free") or item_id in p["owned"])


def owns_deco(p, deco_id):
    """Floors and wallpapers: free ones, or bought (stored in the furniture inventory)."""
    deco = FLOORS.get(deco_id) or WALLS.get(deco_id)
    return bool(deco) and (deco.get("free") or p["furni"].get(deco_id, 0) > 0)


def met(p, cond):
    if "level" in cond:
        return level_for(p["xp"]) >= cond["level"]
    return p["stats"].get(cond["stat"], 0) >= cond["min"]


def clean_house(p, data):
    """Validate a house layout from the client: ownership, bounds and overlaps."""
    floor, wall = data.get("floor"), data.get("wall")
    if floor not in FLOORS or not owns_deco(p, floor) or wall not in WALLS or not owns_deco(p, wall):
        raise GameError("You don't own that floor or wallpaper yet.")
    items = data.get("items")
    if not isinstance(items, list) or len(items) > HOUSE_MAX_ITEMS:
        raise GameError(f"A house can hold up to {HOUSE_MAX_ITEMS} things.")
    used, taken, clean_items = {}, set(), []
    for it in items:
        f = FURN.get(it.get("id")) if isinstance(it, dict) else None
        if not f:
            raise GameError("Unknown furniture.")
        x, y, r = int(it.get("x", -1)), int(it.get("y", -1)), int(it.get("r", 0)) % 4
        used[f["id"]] = used.get(f["id"], 0) + 1
        if used[f["id"]] > p["furni"].get(f["id"], 0):
            raise GameError(f"You don't have another {f['name']}.")
        kind = f.get("kind", "floor")
        if kind == "wall":
            # r 0: on the back wall at column x; r 1: on the left wall at row y
            r %= 2
            start = x if r == 0 else y
            x, y = (x, 0) if r == 0 else (0, y)
            cells = {("wall", r, start + i) for i in range(f["w"])}
            if start < 0 or start + f["w"] > HOUSE_SIZE:
                raise GameError("That doesn't fit on the wall.")
        else:
            w, d = (f["w"], f["d"]) if r % 2 == 0 else (f["d"], f["w"])
            if x < 0 or y < 0 or x + w > HOUSE_SIZE or y + d > HOUSE_SIZE:
                raise GameError("That doesn't fit in the room.")
            cells = {(kind, x + i, y + j) for i in range(w) for j in range(d)}
        if cells & taken:
            raise GameError("Things can't overlap.")
        taken |= cells
        clean_items.append({"id": f["id"], "x": x, "y": y, "r": r})
    return {"floor": floor, "wall": wall, "items": clean_items}


def house_view(p):
    h = p["house"]
    return {"floor": h["floor"], "wall": h["wall"], "items": h["items"], "likes": h["likes"]}


def public(p, client):
    return {
        "key": p["name"].lower(), "name": p["name"], "color": p["color"],
        "coins": p["coins"], "xp": p["xp"], "level": level_for(p["xp"]), "stats": p["stats"],
        "look": p["look"], "lookSet": p["lookSet"], "owned": p["owned"], "fishdex": p["fishdex"],
        "furni": p["furni"], "house": {"n": len(p["house"]["items"]), "likes": len(p["house"]["likes"])},
        "dailyAt": p.get("lastDaily", 0) + DAILY_SECS,
        "online": client is not None, "scene": client.scene if client else None,
    }


class Client:
    def __init__(self, ws):
        self.ws = ws
        self.room = None
        self.key = None
        self.scene = None
        self.x = self.y = None  # last position in the world
        self.ax = self.az = self.ah = None  # position inside a 3D area (casino floor)
        self.pose = None  # e.g. fishing at the pond, sitting on a bench
        self.pose_extra = {}
        self.cooldowns = {}
        self.failed_pins = 0

    @property
    def player(self):
        return self.room.zone["players"][self.key]

    def ready(self, action, seconds):
        now = time.monotonic()
        if now < self.cooldowns.get(action, 0):
            return False
        self.cooldowns[action] = now + seconds
        return True


class Room:
    """Live state for one FriendZone. The persisted part lives in `zone`."""

    def __init__(self, zone):
        self.zone = zone
        self.clients = {}  # player key -> Client
        self.chat = []
        self.feed = []
        self.race = {"id": 0, "state": "idle", "racers": {}, "order": [], "field": 0, "last": {}}
        self.arena = {}  # player key -> fighter state
        self.boss = {"fighters": {}, "b": None, "task": None}
        self.arena_items = {}
        self.arena_item_seq = 0
        self.arena_spawning = False
        self.doodle = {"id": 0, "state": "idle", "queue": [], "turn": -1, "drawer": None, "word": None, "choices": [],
                       "ends": 0.0, "dur": 0, "guessed": {}, "scores": {}, "strokes": [], "shown": set(), "ranking": []}
        self.bumper = {"id": 0, "state": "waiting", "alive": set(), "round": set(), "fighters": {}, "start": 0.0,
                       "ends": 0.0, "wins": {}}
        self.roulette = {"id": 0, "state": "idle", "ends": 0.0, "bets": {}, "history": [], "result": None}

    def in_scene(self, scene):
        return [k for k, c in self.clients.items() if c.scene == scene]

    def broadcast(self, msg, scene=None, exclude=None):
        data = encode(msg)
        for c in list(self.clients.values()):
            if c is not exclude and (scene is None or c.scene == scene):
                c.ws.send_raw(data)


# --------------------------------------------------------------------------
# Game logic
# --------------------------------------------------------------------------

PRE_AUTH = {"create", "join", "resume"}
IN_ZONE = {
    "leave_zone", "scene", "move", "chat", "emote", "fish", "archery", "gamble", "daily", "gift",
    "look", "buy", "crate",
    "race_join", "race_leave", "race_start", "race_step", "arena_move", "arena_shoot", "arena_hit",
    "boss_move", "boss_shoot", "boss_hit", "boss_hurt", "arena_pick", "area_move", "pose",
    "doodle_start", "doodle_pick", "doodle_draw", "doodle_undo", "doodle_clear", "doodle_guess",
    "bumper_move", "bumper_out", "roulette_bet", "roulette_clear", "roulette_sync",
    "house_get", "house_save", "house_buy", "house_like",
}


class Game:
    def __init__(self, store):
        self.store = store
        self.rooms = {}

    def room(self, code):
        if code not in self.rooms:
            self.rooms[code] = Room(self.store.zones[code])
        return self.rooms[code]

    def dispatch(self, c, m):
        t = m.get("t")
        if t not in (IN_ZONE if c.room else PRE_AUTH):
            return
        try:
            getattr(self, "on_" + t)(c, m)
        except GameError as e:
            c.ws.send({"t": "error", "for": t, "msg": str(e)})
        except (TypeError, ValueError, KeyError, AttributeError):
            c.ws.send({"t": "error", "for": t, "msg": "Something went wrong with that request."})

    # ---- joining zones ---------------------------------------------------

    def profile_fields(self, m):
        name = clean(m.get("name"), 16)
        pin = str(m.get("pin", ""))
        color = str(m.get("color", "#39c6ff"))
        if not NAME_RE.match(name):
            raise GameError("Names are 1–16 letters, numbers, spaces, - or _.")
        if not PIN_RE.match(pin):
            raise GameError("Your PIN must be 4–6 digits.")
        if not COLOR_RE.match(color):
            color = "#39c6ff"
        return name, pin, color

    def on_create(self, c, m):
        if not c.ready("create", 10):
            raise GameError("Hang on a few seconds before making another zone.")
        zone_name = clean(m.get("zoneName"), 24)
        if not zone_name:
            raise GameError("Give your FriendZone a name.")
        name, pin, color = self.profile_fields(m)
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        while code in self.store.zones:
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        key = name.lower()
        self.store.zones[code] = {
            "code": code, "name": zone_name, "owner": key, "created": int(time.time()),
            "players": {key: new_player(name, pin, color)},
        }
        self.enter(c, code, key)

    def on_join(self, c, m):
        code = clean(m.get("code"), 12).upper().replace(" ", "")
        zone = self.store.zones.get(code)
        if not zone:
            raise GameError("No FriendZone has that code.")
        name, pin, color = self.profile_fields(m)
        key = name.lower()
        player = zone["players"].get(key)
        if player:
            if not hmac.compare_digest(player["pin"], hash_pin(pin, player["salt"])):
                c.failed_pins += 1
                if c.failed_pins >= 5:
                    c.ws.close()
                raise GameError(f"{player['name']} is already in this zone and that PIN doesn't match.")
        else:
            if len(zone["players"]) >= MAX_MEMBERS:
                raise GameError("This FriendZone is full.")
            zone["players"][key] = new_player(name, pin, color)
        self.enter(c, code, key)

    def on_resume(self, c, m):
        zone = self.store.zones.get(str(m.get("code", "")))
        player = zone and zone["players"].get(str(m.get("name", "")).lower())
        token = str(m.get("token", ""))
        if not player or token not in player["tokens"]:
            raise GameError("Please sign in again with your PIN.")
        self.enter(c, zone["code"], player["name"].lower(), token)

    def enter(self, c, code, key, token=None):
        room = self.room(code)
        player = room.zone["players"][key]
        if token is None:
            token = secrets.token_urlsafe(18)
            player["tokens"] = (player["tokens"] + [token])[-8:]
            self.store.mark()
        old = room.clients.get(key)
        if old:
            old.ws.send({"t": "kicked", "msg": "You opened this zone somewhere else."})
            self.leave(old)
            old.ws.close()
        c.room, c.key, c.scene = room, key, "lobby"
        room.clients[key] = c
        c.ws.send({
            "t": "welcome", "you": key, "token": token,
            "zone": {"code": code, "name": room.zone["name"], "owner": room.zone["owner"]},
            "players": [public(p, room.clients.get(k)) for k, p in room.zone["players"].items()],
            "chat": room.chat, "feed": room.feed, "race": self.race_view(room),
        })
        self.check_unlocks(c)
        self.push_player(room, key)

    def leave(self, c):
        room = c.room
        if not room:
            return
        self.set_scene(c, None)
        if room.clients.get(c.key) is c:
            del room.clients[c.key]
            self.push_player(room, c.key)
        c.room = None

    def on_leave_zone(self, c, m):
        self.leave(c)

    # ---- shared helpers --------------------------------------------------

    def push_player(self, room, key):
        room.broadcast({"t": "player", "p": public(room.zone["players"][key], room.clients.get(key))})

    def post_feed(self, room, text):
        entry = {"text": text, "ts": int(time.time())}
        room.feed = (room.feed + [entry])[-25:]
        room.broadcast({"t": "feed", **entry})

    def reward(self, c, coins=0, xp=0, **stats):
        p = c.player
        before = level_for(p["xp"])
        p["coins"] = max(0, p["coins"] + coins)
        p["xp"] += xp
        for stat, delta in stats.items():
            p["stats"][stat] = p["stats"].get(stat, 0) + delta
        self.store.mark()
        after = level_for(p["xp"])
        if after > before:
            self.post_feed(c.room, f"⭐ {p['name']} reached level {after}!")
        self.check_unlocks(c)
        self.push_player(c.room, c.key)

    def grant(self, c, item, source):
        c.player["owned"].append(item["id"])
        self.store.mark()
        c.ws.send({"t": "unlock", "id": item["id"], "source": source})
        if item["rarity"] in ("epic", "legendary"):
            self.post_feed(c.room, f"✨ {c.player['name']} got the {item['rarity']} {item['name']}!")

    def check_unlocks(self, c):
        p = c.player
        for item in CATALOG["items"]:
            cond = item.get("unlock")
            if cond and item["id"] not in p["owned"] and met(p, cond):
                self.grant(c, item, "achievement")
        for f in CATALOG["furniture"]:
            cond = f.get("unlock")
            if cond and not p["furni"].get(f["id"]) and met(p, cond):
                p["furni"][f["id"]] = 1
                self.store.mark()
                c.ws.send({"t": "unlock", "id": f["id"], "source": "achievement", "furni": True})

    # ---- cosmetics ---------------------------------------------------------

    def on_look(self, c, m):
        look = m.get("look")
        if not isinstance(look, dict):
            raise GameError("That outfit didn't come through.")
        new = {}
        for field, palette in LOOK_COLORS.items():
            if look.get(field) not in CATALOG[palette]:
                raise GameError("Unknown color.")
            new[field] = look[field]
        for slot in LOOK_SLOTS:
            item = ITEMS.get(look.get(slot))
            if not item or item["slot"] != slot:
                raise GameError("Unknown item.")
            if not owns(c.player, item["id"]):
                raise GameError(f"You haven't unlocked the {item['name']} yet.")
            new[slot] = item["id"]
        c.player.update(look=new, lookSet=True, color=new["topColor"])
        self.store.mark()
        self.push_player(c.room, c.key)

    def on_buy(self, c, m):
        item = ITEMS.get(str(m.get("id", "")))
        if not item or "price" not in item:
            raise GameError("That isn't for sale.")
        if owns(c.player, item["id"]):
            raise GameError("You already own that.")
        if c.player["coins"] < item["price"]:
            raise GameError(f"You need {item['price']:,} coins for that.")
        c.player["coins"] -= item["price"]
        self.grant(c, item, "shop")
        self.push_player(c.room, c.key)

    def on_crate(self, c, m):
        p, price = c.player, CATALOG["crate"]["price"]
        if p["coins"] < price:
            raise GameError(f"A crate costs {price} coins.")
        if not c.ready("crate", 1.5):
            raise GameError("Hang on, still opening the last one!")
        pool = [i for i in CATALOG["items"] if i.get("crate") and i["id"] not in p["owned"]]
        if not pool:
            raise GameError("You've already collected every crate item!")
        weights = {r: w for r, w in CATALOG["crate"]["weights"].items() if any(i["rarity"] == r for i in pool)}
        rarity = random.choices(list(weights), weights=list(weights.values()))[0]
        item = random.choice([i for i in pool if i["rarity"] == rarity])
        p["coins"] -= price
        c.ws.send({"t": "crate_result", "id": item["id"]})
        self.grant(c, item, "crate")
        self.push_player(c.room, c.key)

    # ---- scenes & the world ----------------------------------------------

    def on_scene(self, c, m):
        if m.get("scene") in SCENES:
            self.set_scene(c, m["scene"])

    def set_scene(self, c, scene):
        room, prev = c.room, c.scene
        if prev == scene and scene != "world":
            return
        if prev == "world" and scene != "world":
            room.broadcast({"t": "despawn", "k": c.key}, scene="world", exclude=c)
            c.pose = None
        if prev in AREA_SCENES and scene != prev:
            room.broadcast({"t": "area_del", "k": c.key}, scene=prev, exclude=c)
            c.ax = c.az = c.ah = None
        if prev == "arena" and scene != "arena":
            self.arena_leave(c)
        if prev == "race" and scene != "race":
            self.race_remove(c)
        if prev == "boss" and scene != "boss":
            self.boss_leave(c)
        if prev == "doodle" and scene != "doodle":
            c.scene = scene
            self.doodle_leave(room, c.key)
        if prev == "bumper" and scene != "bumper":
            self.bumper_leave(c)
        c.scene = scene
        if scene is None:
            return
        if scene == "world":
            if c.x is None:  # somewhere on the plaza, clear of the fountain
                angle, dist = random.uniform(0, math.tau), random.uniform(70, 95)
                c.x, c.y = WORLD_W / 2 + math.cos(angle) * dist, WORLD_H / 2 + math.sin(angle) * dist
            others = [{"k": o.key, "x": o.x, "y": o.y, "pose": o.pose, **(o.pose_extra if o.pose else {})}
                      for o in room.clients.values() if o.scene == "world" and o is not c]
            c.ws.send({"t": "world", "me": {"x": c.x, "y": c.y}, "others": others})
            room.broadcast({"t": "pos", "k": c.key, "x": c.x, "y": c.y}, scene="world", exclude=c)
        elif scene == "arena":
            self.arena_join(c)
        elif scene == "boss":
            self.boss_join(c)
        elif scene == "doodle":
            self.doodle_join(c)
        elif scene == "bumper":
            self.bumper_join(c)
        elif scene == "casino":
            self.roulette_join(c)
        if scene in AREA_SCENES:
            c.ws.send({"t": "area", "others": [{"k": o.key, "x": o.ax, "z": o.az, "h": o.ah} for o in room.clients.values()
                                                if o.scene == scene and o is not c and o.ax is not None]})
        elif scene == "race":
            c.ws.send({"t": "race", "race": self.race_view(room)})
        self.push_player(room, c.key)

    def on_move(self, c, m):
        if c.scene != "world":
            return
        c.x, c.y = num(m["x"], 0, WORLD_W), num(m["y"], 0, WORLD_H)
        c.room.broadcast({"t": "pos", "k": c.key, "x": round(c.x, 1), "y": round(c.y, 1)}, scene="world", exclude=c)

    def on_area_move(self, c, m):
        if c.scene not in AREA_SCENES:
            return
        c.ax, c.az, c.ah = num(m["x"], -200, 200), num(m["z"], -200, 200), num(m.get("h", 0), -7, 7)
        c.room.broadcast({"t": "area_pos", "k": c.key, "x": round(c.ax, 2), "z": round(c.az, 2), "h": round(c.ah, 2)},
                         scene=c.scene, exclude=c)

    def on_pose(self, c, m):
        """World poses other players should see (sitting on the dock fishing, the bobber...)."""
        if c.scene != "world" or not c.ready("pose", 0.1):
            return
        pose = m.get("pose") if m.get("pose") in POSES else None
        c.pose = pose
        msg = {"t": "pose", "k": c.key, "pose": pose}
        if pose and "bx" in m:
            msg.update(bx=round(num(m["bx"], -200, 200), 2), bz=round(num(m["bz"], -200, 200), 2))
        if pose and "h" in m:
            msg["h"] = round(num(m["h"], -7, 7), 3)
        c.pose_extra = {k: v for k, v in msg.items() if k in ("bx", "bz", "h")}
        c.room.broadcast(msg, scene="world", exclude=c)

    def on_chat(self, c, m):
        text = clean(m.get("text"), 140)
        if not text or not c.ready("chat", 0.4):
            return
        entry = {"k": c.key, "text": text, "ts": int(time.time())}
        c.room.chat = (c.room.chat + [entry])[-40:]
        c.room.broadcast({"t": "chat", **entry})

    def on_emote(self, c, m):
        if c.scene == "world" and m.get("e") in EMOTES and c.ready("emote", 1):
            c.room.broadcast({"t": "emote", "k": c.key, "e": m["e"]}, scene="world")

    # ---- solo activities -------------------------------------------------

    def on_fish(self, c, m):
        """Sent when the reeling minigame is won. `q` is how well the player tracked the fish."""
        if not c.ready("fish", 2.5):
            raise GameError("Easy there, the fish need a moment.")
        q = num(m.get("q", 0), 0, 1)
        weights = [f["weight"] * math.exp(f["bias"] * (q - 0.5)) for f in FISH]
        fish = random.choices(FISH, weights=weights)[0]
        lo, hi = fish["size"]
        size = round(random.uniform(lo, hi) * (0.85 + 0.3 * q), 1)
        treasure = random.randint(30, 120) if m.get("treasure") is True else 0
        entry = c.player["fishdex"].setdefault(fish["name"], {"n": 0, "best": 0})
        first, record = entry["n"] == 0, size > entry["best"]
        entry["n"] += 1
        entry["best"] = max(entry["best"], size)
        extra = {"koi": 1} if fish["rarity"] == "legendary" else {}
        self.reward(c, coins=fish["coins"] + treasure, xp=max(5, fish["coins"] // 4), fish=1, **extra)
        c.ws.send({"t": "fish_result", "fish": {**fish, "size": size}, "treasure": treasure,
                   "first": first, "record": record and not first})
        if fish["rarity"] in ("rare", "epic", "legendary"):
            self.post_feed(c.room, f"🎣 {c.player['name']} caught a {fish['rarity']} {fish['name']} ({size} in)!")

    def on_archery(self, c, m):
        if not c.ready("archery", 4):
            raise GameError("Catch your breath before the next round.")
        score = int(num(m.get("score", 0), 0, 50))
        best = c.player["stats"].get("archeryBest", 0)
        self.reward(c, coins=score * 2, xp=score, archeryBest=max(0, score - best))
        c.ws.send({"t": "archery_result", "score": score, "coins": score * 2, "best": score > best})
        if score >= 45:
            self.post_feed(c.room, f"🏹 {c.player['name']} scored {score}/50 at the range!")

    def on_gamble(self, c, m):
        bet = int(num(m.get("bet", 0), 0, MAX_BET))
        if bet < 1:
            raise GameError("Place a bet first.")
        if bet > c.player["coins"]:
            raise GameError("You don't have that many coins.")
        if not c.ready("gamble", 0.8):
            raise GameError("The dealer is still shuffling.")
        game = m.get("game")
        if game == "coinflip":
            pick = m.get("pick")
            if pick not in ("heads", "tails"):
                raise GameError("Pick heads or tails.")
            side = random.choice(["heads", "tails"])
            payout = bet * 2 if side == pick else 0
            result = {"side": side}
        elif game == "slots":
            reels = random.choices(SLOT_SYMBOLS, weights=SLOT_WEIGHTS, k=3)
            if len(set(reels)) == 1:
                payout = bet * SLOT_TRIPLE[reels[0]]
            elif len(set(reels)) == 2:
                payout = bet
            else:
                payout = 0
            result = {"reels": reels}
        elif game == "wheel":
            index = random.randrange(len(WHEEL))
            payout = int(bet * WHEEL[index])
            result = {"index": index}
        else:
            raise GameError("Unknown game.")
        jackpot = game == "slots" and payout >= bet * 12
        self.reward(c, coins=payout - bet, xp=2, **({"jackpots": 1} if jackpot else {}))
        c.ws.send({"t": "gamble_result", "game": game, "bet": bet, "payout": payout, **result})
        if payout >= bet * 10 and payout >= 500:
            self.post_feed(c.room, f"🎰 JACKPOT! {c.player['name']} won {payout:,} coins!")

    def on_daily(self, c, m):
        p = c.player
        now = int(time.time())
        wait = p.get("lastDaily", 0) + DAILY_SECS - now
        if wait > 0:
            raise GameError(f"Your next bonus is ready in {wait // 3600}h {wait % 3600 // 60}m.")
        p["lastDaily"] = now
        self.reward(c, coins=DAILY_BONUS)

    def on_gift(self, c, m):
        target = c.room.zone["players"].get(str(m.get("to", "")).lower())
        amount = int(num(m.get("amount", 0), 0, 10**9))
        if not target or target is c.player:
            raise GameError("Pick a friend to send coins to.")
        if amount < 1 or amount > c.player["coins"]:
            raise GameError("You don't have that many coins.")
        c.player["coins"] -= amount
        target["coins"] += amount
        self.store.mark()
        self.push_player(c.room, c.key)
        self.push_player(c.room, target["name"].lower())
        self.post_feed(c.room, f"💰 {c.player['name']} sent {amount:,} coins to {target['name']}.")

    # ---- racing ------------------------------------------------------------

    def race_view(self, room):
        r = room.race
        return {"state": r["state"], "racers": r["racers"], "order": r["order"], "len": RACE_LEN, "laps": RACE_LAPS}

    def race_sync(self, room):
        room.broadcast({"t": "race", "race": self.race_view(room)})

    def on_race_join(self, c, m):
        r = c.room.race
        if c.key in r["racers"]:
            return
        if r["state"] not in ("idle", "waiting"):
            raise GameError("A race is underway. You're in the next one!")
        r["racers"][c.key] = 0
        r["state"] = "waiting"
        self.race_sync(c.room)

    def on_race_leave(self, c, m):
        self.race_remove(c)

    def race_remove(self, c):
        room, r = c.room, c.room.race
        if c.key not in r["racers"]:
            return
        del r["racers"][c.key]
        r["last"].pop(c.key, None)
        if not r["racers"]:
            r.update(id=r["id"] + 1, state="idle", order=[])
        elif r["state"] == "running" and all(k in r["order"] for k in r["racers"]):
            self.race_finish(room, r["id"])
            return
        self.race_sync(room)

    def on_race_start(self, c, m):
        room, r = c.room, c.room.race
        if c.key not in r["racers"] or r["state"] != "waiting":
            return
        r.update(id=r["id"] + 1, state="countdown", order=[], last={}, field=len(r["racers"]))
        for k in r["racers"]:
            r["racers"][k] = 0
        self.race_sync(room)
        asyncio.get_running_loop().call_later(3, self.race_go, room, r["id"])

    def race_go(self, room, rid):
        r = room.race
        if r["id"] != rid or r["state"] != "countdown":
            return
        r["state"] = "running"
        self.race_sync(room)
        asyncio.get_running_loop().call_later(RACE_TIMEOUT, self.race_finish, room, rid)

    def race_finish(self, room, rid):
        r = room.race
        if r["id"] != rid or r["state"] != "running":
            return
        r["state"] = "done"
        self.race_sync(room)
        asyncio.get_running_loop().call_later(5, self.race_reset, room, rid)

    def race_reset(self, room, rid):
        r = room.race
        if r["id"] != rid or r["state"] != "done":
            return
        r.update(state="waiting" if r["racers"] else "idle", order=[])
        for k in r["racers"]:
            r["racers"][k] = 0
        self.race_sync(room)

    def on_race_step(self, c, m):
        room, r = c.room, c.room.race
        if r["state"] != "running" or c.key not in r["racers"] or c.key in r["order"]:
            return
        side = m.get("side")
        now = time.monotonic()
        last = r["last"].get(c.key)
        if side not in ("L", "R") or (last and (last[0] == side or now - last[1] < 0.045)):
            return
        r["last"][c.key] = (side, now)
        progress = r["racers"][c.key] = r["racers"][c.key] + 1
        room.broadcast({"t": "race_p", "k": c.key, "p": progress}, scene="race")
        if progress < RACE_LEN:
            return
        r["order"].append(c.key)
        place = len(r["order"])
        if r["field"] == 1:
            coins, xp = RACE_PRIZE_SOLO
        else:
            coins, xp = RACE_PRIZES[place - 1] if place <= len(RACE_PRIZES) else RACE_PRIZE_REST
        if place == 1 and r["field"] > 1:
            self.reward(c, coins=coins, xp=xp, raceWins=1, wins=1)
            self.post_feed(room, f"🏁 {c.player['name']} won the race!")
        else:
            self.reward(c, coins=coins, xp=xp)
        self.race_sync(room)
        if len(r["order"]) >= len(r["racers"]):
            self.race_finish(room, r["id"])

    # ---- arena ---------------------------------------------------------------

    @staticmethod
    def arena_spawn_point(room, key):
        """The spawn point farthest from every other living fighter."""
        others = [(f["x"], f["y"]) for k, f in room.arena.items() if k != key and f["hp"] > 0]
        if not others:
            return random.choice(ARENA_SPAWNS)
        return max(ARENA_SPAWNS, key=lambda s: min(math.dist(s, o) for o in others) + random.random())

    @staticmethod
    def fighter_view(f):
        return {"x": f["x"], "y": f["y"], "a": f["a"], "hp": f["hp"], "score": f["score"]}

    def arena_join(self, c):
        room = c.room
        x, y = self.arena_spawn_point(room, c.key)
        room.arena[c.key] = {"x": x, "y": y, "a": 0, "hp": ARENA_HP, "score": 0,
                             "spawn": time.monotonic(), "hits": set()}
        players = {k: self.fighter_view(f) for k, f in room.arena.items()}
        c.ws.send({"t": "arena", "players": players, "target": ARENA_TARGET, "hp": ARENA_HP,
                   "items": list(room.arena_items.values())})
        if not room.arena_spawning:
            room.arena_spawning = True
            asyncio.get_running_loop().call_later(3, self.arena_item_tick, room)
        room.broadcast({"t": "arena_add", "k": c.key, **players[c.key]}, scene="arena", exclude=c)

    def arena_leave(self, c):
        if c.room.arena.pop(c.key, None) is not None:
            c.room.broadcast({"t": "arena_del", "k": c.key}, scene="arena")

    def on_arena_move(self, c, m):
        f = c.room.arena.get(c.key)
        if not f or f["hp"] <= 0:
            return
        f["x"], f["y"], f["a"] = num(m["x"], 0, ARENA_W), num(m["y"], 0, ARENA_H), num(m["a"], -7, 7)
        c.room.broadcast({"t": "arena_pos", "k": c.key, "x": round(f["x"], 1), "y": round(f["y"], 1),
                          "a": round(f["a"], 2)}, scene="arena", exclude=c)

    def on_arena_shoot(self, c, m):
        f = c.room.arena.get(c.key)
        if not f or f["hp"] <= 0 or not c.ready("shoot", 0.22):
            return
        c.room.broadcast({"t": "arena_shot", "k": c.key, "id": int(num(m["id"], 0, 1e9)),
                          "x": num(m["x"], 0, ARENA_W), "y": num(m["y"], 0, ARENA_H), "a": num(m["a"], -7, 7)},
                         scene="arena", exclude=c)

    def on_arena_hit(self, c, m):
        """Sent by the player who got hit; friends are trusted to be honest."""
        room = c.room
        by = str(m.get("by", ""))
        victim, shooter = room.arena.get(c.key), room.arena.get(by)
        hit_id = (by, m.get("id"))
        if not victim or not shooter or by == c.key or victim["hp"] <= 0:
            return
        if time.monotonic() - victim["spawn"] < 1.5 or hit_id in victim["hits"]:
            return
        if len(victim["hits"]) > 300:
            victim["hits"].clear()
        victim["hits"].add(hit_id)
        victim["hp"] -= 1
        room.broadcast({"t": "arena_hp", "k": c.key, "hp": victim["hp"]}, scene="arena")
        if victim["hp"] > 0:
            return
        shooter["score"] += 1
        killer = room.clients.get(by)
        if killer:
            self.reward(killer, coins=20, xp=15, elims=1)
        room.broadcast({"t": "arena_ko", "k": c.key, "by": by, "score": shooter["score"]}, scene="arena")
        asyncio.get_running_loop().call_later(2, self.arena_respawn, room, c.key)
        if shooter["score"] >= ARENA_TARGET:
            for f in room.arena.values():
                f["score"] = 0
            if killer:
                self.reward(killer, coins=200, xp=100, wins=1, arenaWins=1)
                self.post_feed(room, f"⚔️ {killer.player['name']} won an Arena round!")
            room.broadcast({"t": "arena_round", "winner": by}, scene="arena")

    def arena_item_tick(self, room):
        if not room.arena:
            room.arena_spawning = False
            room.arena_items.clear()
            return
        if len(room.arena_items) < ARENA_MAX_ITEMS:
            for _ in range(20):
                x, y = random.uniform(60, ARENA_W - 60), random.uniform(80, ARENA_H - 50)
                if not any(px - 30 < x < px + pw + 30 and py - 30 < y < py + ph + 50 for px, py, pw, ph in ARENA_PILLARS):
                    break
            room.arena_item_seq += 1
            item = {"id": room.arena_item_seq, "kind": random.choice(ARENA_ITEMS), "x": round(x), "y": round(y)}
            room.arena_items[item["id"]] = item
            room.broadcast({"t": "arena_item", "item": item}, scene="arena")
        asyncio.get_running_loop().call_later(ARENA_ITEM_EVERY, self.arena_item_tick, room)

    def on_arena_pick(self, c, m):
        room = c.room
        f = room.arena.get(c.key)
        item = room.arena_items.get(int(num(m.get("id", 0), 0, 1e9)))
        if not f or f["hp"] <= 0 or not item or math.dist((f["x"], f["y"]), (item["x"], item["y"])) > 70:
            return
        del room.arena_items[item["id"]]
        room.broadcast({"t": "arena_picked", "id": item["id"], "k": c.key, "kind": item["kind"]}, scene="arena")
        if item["kind"] == "heal" and f["hp"] < ARENA_HP:
            f["hp"] += 1
            room.broadcast({"t": "arena_hp", "k": c.key, "hp": f["hp"], "heal": True}, scene="arena")

    def arena_respawn(self, room, key):
        f = room.arena.get(key)
        if not f or f["hp"] > 0:
            return
        f["x"], f["y"] = self.arena_spawn_point(room, key)
        f["hp"], f["spawn"] = ARENA_HP, time.monotonic()
        room.broadcast({"t": "arena_spawn", "k": key, "x": f["x"], "y": f["y"], "hp": f["hp"]}, scene="arena")

    # ---- boss cave -------------------------------------------------------------

    @staticmethod
    def boss_view(room):
        b = room.boss["b"]
        if not b:
            return None
        return {"id": b["id"], "name": b["name"], "tier": b["tier"], "x": round(b["x"], 1), "y": round(b["y"], 1),
                "hp": b["hp"], "max": b["max"], "r": b["r"], "st": b["st"], "enraged": b["enraged"]}

    @staticmethod
    def boss_fighter_view(f):
        return {"x": f["x"], "y": f["y"], "a": f["a"], "hp": f["hp"]}

    def boss_join(self, c):
        room, bs = c.room, c.room.boss
        x, y = random.choice(BOSS_SPAWNS)
        f = bs["fighters"][c.key] = {"x": x, "y": y, "a": -math.pi / 2, "hp": BOSS_PLAYER_HP, "down": 0, "rev": 0.0,
                                     "hurt": time.monotonic()}
        b = bs["b"]
        if b and b["st"] != "dead" and c.key not in b["counted"]:
            # a new friend joined mid-fight: the boss toughens up to match
            b["counted"].add(c.key)
            extra = int(b["spec"]["hp"] * 0.65 * (1 + 0.3 * b["tier"]))
            b["max"] += extra
            b["hp"] += extra
        c.ws.send({"t": "boss", "boss": self.boss_view(room), "hp": BOSS_PLAYER_HP, "kills": room.zone.get("bossKills", 0),
                   "fighters": {k: self.boss_fighter_view(o) for k, o in bs["fighters"].items()}})
        room.broadcast({"t": "boss_add", "k": c.key, **self.boss_fighter_view(f)}, scene="boss", exclude=c)
        if not bs["task"]:
            bs["task"] = asyncio.get_running_loop().create_task(self.boss_loop(room))

    def boss_leave(self, c):
        if c.room.boss["fighters"].pop(c.key, None) is not None:
            c.room.broadcast({"t": "boss_del", "k": c.key}, scene="boss")

    async def boss_loop(self, room):
        bs = room.boss
        last = time.monotonic()
        try:
            while bs["fighters"]:
                await asyncio.sleep(BOSS_TICK)
                now = time.monotonic()
                dt, last = min(0.3, now - last), now
                try:
                    self.boss_tick(room, dt, now)
                except Exception as e:  # one bad tick shouldn't end the fight
                    print("boss tick failed:", repr(e))
        finally:
            bs["task"] = None
            if not bs["fighters"]:
                bs["b"] = None  # everyone left: the next group starts on a fresh boss

    def boss_spawn(self, room, now):
        bs, kills = room.boss, room.zone.get("bossKills", 0)
        spec = BOSSES[kills % len(BOSSES)]
        tier = kills // len(BOSSES)
        n = max(1, len(bs["fighters"]))
        hp = int(spec["hp"] * (1 + 0.65 * (n - 1)) * (1 + 0.3 * tier))
        bs["b"] = {"spec": spec, "id": spec["id"], "name": spec["name"], "tier": tier, "x": BOSS_W / 2, "y": 170.0,
                   "hp": hp, "max": hp, "r": spec["r"], "st": "intro", "t": 0.0, "next": now + 4.5, "target": None,
                   "retarget": 0.0, "move": None, "enraged": False, "dmg": {}, "counted": set(bs["fighters"])}
        room.broadcast({"t": "boss_spawn", "boss": self.boss_view(room), "kills": kills}, scene="boss")

    def boss_tick(self, room, dt, now):
        bs = room.boss
        b, fighters = bs["b"], bs["fighters"]
        if b is None:
            self.boss_spawn(room, now)
            return
        b["t"] += dt
        # downed players: a friend standing close revives them, otherwise they get up on their own
        for k, f in fighters.items():
            if f["hp"] > 0:
                continue
            helped = any(o["hp"] > 0 and math.dist((o["x"], o["y"]), (f["x"], f["y"])) < BOSS_REVIVE_R
                         for ok, o in fighters.items() if ok != k)
            f["rev"] = min(BOSS_REVIVE_T, f["rev"] + dt) if helped else max(0.0, f["rev"] - dt * 0.5)
            if f["rev"] >= BOSS_REVIVE_T or now - f["down"] >= BOSS_AUTO_REVIVE:
                f["hp"] = 3 if f["rev"] >= BOSS_REVIVE_T else BOSS_PLAYER_HP
                f["rev"], f["hurt"] = 0.0, now
                room.broadcast({"t": "boss_up", "k": k, "hp": f["hp"], "helped": helped}, scene="boss")
        if b["st"] == "intro" and b["t"] >= 3.2:
            b["st"], b["t"], b["next"] = "fight", 0.0, now + 1.2
            room.broadcast({"t": "boss_phase", "st": "fight"}, scene="boss")
        elif b["st"] == "fight":
            self.boss_steer(b, fighters, dt, now)
            if now >= b["next"] and not b["move"]:
                self.boss_attack(room, b, fighters, now)
        elif b["st"] == "dead" and b["t"] >= 8:
            bs["b"] = None
        room.broadcast({"t": "boss_s", "x": round(b["x"], 1), "y": round(b["y"], 1), "hp": b["hp"], "max": b["max"],
                        "rev": {k: round(f["rev"] / BOSS_REVIVE_T, 2) for k, f in fighters.items() if f["hp"] <= 0}},
                       scene="boss")

    @staticmethod
    def boss_steer(b, fighters, dt, now):
        mv = b["move"]
        if mv:  # scripted dash or hop
            if now >= mv["t1"]:
                b["x"], b["y"], b["move"] = mv["x1"], mv["y1"], None
            elif now >= mv["t0"]:
                k = (now - mv["t0"]) / (mv["t1"] - mv["t0"])
                b["x"] = mv["x0"] + (mv["x1"] - mv["x0"]) * k
                b["y"] = mv["y0"] + (mv["y1"] - mv["y0"]) * k
            return
        alive = [k for k, f in fighters.items() if f["hp"] > 0]
        if not alive:
            tx, ty = BOSS_W / 2, 200
        else:
            if b["target"] not in alive or now >= b["retarget"]:
                b["target"] = random.choice(alive)
                b["retarget"] = now + random.uniform(3, 5)
            tx, ty = fighters[b["target"]]["x"], fighters[b["target"]]["y"]
        dx, dy = tx - b["x"], ty - b["y"]
        d = math.hypot(dx, dy)
        keep = b["r"] + 70
        if d > keep:
            step = min(d - keep, b["spec"]["speed"] * (1.35 if b["enraged"] else 1) * dt)
            b["x"] += dx / d * step
            b["y"] += dy / d * step
        b["x"] = min(BOSS_W - b["r"], max(b["r"], b["x"]))
        b["y"] = min(BOSS_H - b["r"], max(b["r"], b["y"]))

    def boss_attack(self, room, b, fighters, now):
        alive = [f for f in fighters.values() if f["hp"] > 0]
        kind = random.choice(b["spec"]["attacks"])
        if kind in ("charge", "hop") and not alive:
            kind = "volley"
        rage, x, y, r = b["enraged"], b["x"], b["y"], b["r"]
        msg = {"t": "boss_atk", "kind": kind}
        busy = 0.0  # how long the attack keeps the boss occupied
        if kind == "slam":
            targets = alive if rage else random.sample(alive, min(len(alive), 2))
            spots = [(f["x"], f["y"]) for f in targets] or [(x, y + 130)]
            msg.update(c=[[round(sx), round(sy)] for sx, sy in spots], r=85, d=1.1)
        elif kind == "rocks":
            spots = [(f["x"], f["y"]) for f in alive]
            spots += [(random.uniform(60, BOSS_W - 60), random.uniform(60, BOSS_H - 60)) for _ in range(5 if rage else 3)]
            msg.update(c=[[round(sx), round(sy)] for sx, sy in spots], r=62, d=1.3)
        elif kind == "volley":
            msg.update(x=round(x), y=round(y), n=18 if rage else 12, sp=240 if rage else 205,
                       off=round(random.uniform(0, math.tau), 3), d=0.55, waves=2 if rage else 1, gap=0.4, rot=0.13)
        elif kind == "spiral":
            waves = 11 if rage else 8
            msg.update(x=round(x), y=round(y), n=6, sp=215, off=round(random.uniform(0, math.tau), 3), d=0.5,
                       waves=waves, gap=0.16, rot=0.3 * random.choice((-1, 1)))
            busy = waves * 0.16
        else:
            f = random.choice(alive)
            if kind == "charge":
                dx, dy = f["x"] - x, f["y"] - y
                d = math.hypot(dx, dy) or 1
                tx = min(BOSS_W - r, max(r, x + dx / d * 560))
                ty = min(BOSS_H - r, max(r, y + dy / d * 560))
                dur = max(0.2, math.hypot(tx - x, ty - y) / 680)
                delay = 0.8
                msg.update(x=round(x), y=round(y), tx=round(tx), ty=round(ty), d=delay, dur=round(dur, 3))
            else:  # hop onto someone and land with a shockwave
                tx = min(BOSS_W - r, max(r, f["x"]))
                ty = min(BOSS_H - r, max(r, f["y"]))
                delay, dur = 0.35, 0.85
                msg.update(x=round(x), y=round(y), tx=round(tx), ty=round(ty), d=delay, dur=dur, r=115)
            b["move"] = {"x0": x, "y0": y, "x1": tx, "y1": ty, "t0": now + delay, "t1": now + delay + dur}
            busy = delay + dur
        room.broadcast(msg, scene="boss")
        b["next"] = now + busy + 2.2 * (0.62 if rage else 1) * random.uniform(0.85, 1.15)

    def on_boss_move(self, c, m):
        f = c.room.boss["fighters"].get(c.key)
        if not f or f["hp"] <= 0:
            return
        f["x"], f["y"], f["a"] = num(m["x"], 0, BOSS_W), num(m["y"], 0, BOSS_H), num(m["a"], -7, 7)
        c.room.broadcast({"t": "boss_pos", "k": c.key, "x": round(f["x"], 1), "y": round(f["y"], 1),
                          "a": round(f["a"], 2)}, scene="boss", exclude=c)

    def on_boss_shoot(self, c, m):
        f = c.room.boss["fighters"].get(c.key)
        if not f or f["hp"] <= 0 or not c.ready("shoot", 0.2):
            return
        c.room.broadcast({"t": "boss_shot", "k": c.key, "x": num(m["x"], 0, BOSS_W), "y": num(m["y"], 0, BOSS_H),
                          "a": num(m["a"], -7, 7)}, scene="boss", exclude=c)

    def on_boss_hit(self, c, m):
        """Sent when one of your shots hits the boss."""
        room = c.room
        b, f = room.boss["b"], room.boss["fighters"].get(c.key)
        if not b or b["st"] != "fight" or not f or f["hp"] <= 0 or not c.ready("boss_hit", 0.16):
            return
        crit = random.random() < 0.12
        dmg = 2 if crit else 1
        b["hp"] = max(0, b["hp"] - dmg)
        b["dmg"][c.key] = b["dmg"].get(c.key, 0) + dmg
        room.broadcast({"t": "boss_dmg", "k": c.key, "d": dmg, "hp": b["hp"], "crit": crit}, scene="boss")
        if not b["enraged"] and b["hp"] <= b["max"] / 2:
            b["enraged"] = True
            room.broadcast({"t": "boss_phase", "st": "enraged"}, scene="boss")
        if b["hp"] <= 0:
            self.boss_defeat(room, b)

    def on_boss_hurt(self, c, m):
        """Sent by a player who got caught by an attack; friends are trusted to be honest."""
        room = c.room
        b, f = room.boss["b"], room.boss["fighters"].get(c.key)
        now = time.monotonic()
        if not b or b["st"] != "fight" or not f or f["hp"] <= 0 or now - f["hurt"] < BOSS_IFRAMES:
            return
        f["hurt"] = now
        f["hp"] -= 1
        room.broadcast({"t": "boss_hp", "k": c.key, "hp": f["hp"]}, scene="boss")
        if f["hp"] <= 0:
            f["down"], f["rev"] = now, 0.0
            room.broadcast({"t": "boss_down", "k": c.key}, scene="boss")

    def boss_defeat(self, room, b):
        spec = b["spec"]
        b.update(st="dead", t=0.0, move=None)
        room.zone["bossKills"] = room.zone.get("bossKills", 0) + 1
        self.store.mark()
        total = sum(b["dmg"].values()) or 1
        mvp = max(b["dmg"], key=b["dmg"].get) if b["dmg"] else None
        results = {}
        for k in list(room.boss["fighters"]):
            c = room.clients.get(k)
            if not c or c.scene != "boss":
                continue
            dealt = b["dmg"].get(k, 0)
            share = dealt / total
            coins = 80 + int(320 * share) + 40 * b["tier"] + (100 if k == mvp and len(b["dmg"]) > 1 else 0)
            xp = 50 + int(120 * share)
            loot = []
            if not c.player["furni"].get(spec["loot"]):
                c.player["furni"][spec["loot"]] = 1
                loot.append(spec["loot"])
            drop = spec.get("drop")
            if drop and drop[0] not in c.player["owned"] and random.random() < drop[1]:
                self.grant(c, ITEMS[drop[0]], "boss")
                loot.append(drop[0])
            self.reward(c, coins=coins, xp=xp, bossKills=1)
            results[k] = {"coins": coins, "xp": xp, "dmg": dealt, "loot": loot}
        room.broadcast({"t": "boss_dead", "name": spec["name"], "mvp": mvp, "results": results}, scene="boss")
        mvp_name = room.zone["players"][mvp]["name"] if mvp in room.zone["players"] else None
        self.post_feed(room, f"👾 {spec['name']} was defeated!" + (f" MVP: {mvp_name}" if mvp_name else ""))

    # ---- doodle guess --------------------------------------------------------------

    def doodle_view(self, room, key):
        d = room.doodle
        word = d["word"] or ""
        show_word = d["state"] in ("reveal", "over") or key == d["drawer"] or key in d["guessed"]
        v = {
            "t": "doodle", "state": d["state"], "drawer": d["drawer"], "players": room.in_scene("doodle"),
            "turn": d["turn"] + 1, "turns": len(d["queue"]), "left": round(max(0.0, d["ends"] - time.monotonic()), 2),
            "dur": d["dur"], "scores": d["scores"], "guessed": d["guessed"], "strokes": d["strokes"],
            "hint": "".join(ch if (i in d["shown"] or not ch.isalpha()) else "_" for i, ch in enumerate(word)),
            "word": word if show_word else None, "ranking": d["ranking"],
        }
        if key == d["drawer"] and d["state"] == "choosing":
            v["choices"] = d["choices"]
        return v

    def doodle_sync(self, room):
        for k in room.in_scene("doodle"):
            room.clients[k].ws.send(self.doodle_view(room, k))

    def doodle_later(self, room, delay, fn, *args):
        asyncio.get_running_loop().call_later(delay, fn, room, room.doodle["id"], *args)

    def doodle_join(self, c):
        d = c.room.doodle
        if d["state"] in ("choosing", "drawing", "reveal"):
            d["scores"].setdefault(c.key, 0)
            if c.key not in d["queue"][d["turn"] + 1:]:
                d["queue"].append(c.key)  # late joiners get a turn at the end
        self.doodle_sync(c.room)

    def doodle_leave(self, room, key):
        d = room.doodle
        if d["state"] in ("idle", "over"):
            self.doodle_sync(room)
            return
        d["queue"] = d["queue"][:d["turn"] + 1] + [k for k in d["queue"][d["turn"] + 1:] if k != key]
        if len(room.in_scene("doodle")) < 2:
            d.update(state="idle", drawer=None, word=None, ranking=[])
            d["id"] += 1
            room.broadcast({"t": "doodle_msg", "sys": "Not enough players left, so the game ended."}, scene="doodle")
        elif key == d["drawer"] and d["state"] in ("choosing", "drawing"):
            self.doodle_reveal(room, d["id"])
            return
        self.doodle_sync(room)

    def on_doodle_start(self, c, m):
        room, d = c.room, c.room.doodle
        players = room.in_scene("doodle")
        if d["state"] not in ("idle", "over"):
            return
        if len(players) < 2:
            raise GameError("You need at least 2 players to start. Invite someone!")
        random.shuffle(players)
        rounds = 2 if len(players) <= 3 else 1
        d.update(queue=players * rounds, turn=-1, scores={k: 0 for k in players}, ranking=[])
        self.post_feed(room, f"🎨 {c.player['name']} started a Doodle Guess game! Come draw.")
        self.doodle_next(room, d["id"])

    def doodle_next(self, room, token):
        d = room.doodle
        if token != d["id"]:
            return
        present = set(room.in_scene("doodle"))
        d["turn"] += 1
        while d["turn"] < len(d["queue"]) and d["queue"][d["turn"]] not in present:
            d["turn"] += 1
        if d["turn"] >= len(d["queue"]) or len(present) < 2:
            self.doodle_over(room)
            return
        d["id"] += 1
        d.update(state="choosing", drawer=d["queue"][d["turn"]], choices=random.sample(DOODLE_WORDS, 3), word=None,
                 guessed={}, strokes=[], shown=set(), ends=time.monotonic() + DOODLE_CHOOSE, dur=DOODLE_CHOOSE)
        self.doodle_later(room, DOODLE_CHOOSE, self.doodle_auto_pick)
        self.doodle_sync(room)

    def doodle_auto_pick(self, room, token):
        d = room.doodle
        if token == d["id"] and d["state"] == "choosing":
            self.doodle_begin(room, random.choice(d["choices"]))

    def on_doodle_pick(self, c, m):
        d = c.room.doodle
        if d["state"] == "choosing" and c.key == d["drawer"]:
            self.doodle_begin(c.room, d["choices"][int(num(m.get("i", 0), 0, 2))])

    def doodle_begin(self, room, word):
        d = room.doodle
        d["id"] += 1
        d.update(state="drawing", word=word, ends=time.monotonic() + DOODLE_DRAW, dur=DOODLE_DRAW)
        self.doodle_later(room, DOODLE_DRAW * 0.45, self.doodle_hint)
        self.doodle_later(room, DOODLE_DRAW * 0.7, self.doodle_hint)
        self.doodle_later(room, DOODLE_DRAW, self.doodle_reveal)
        self.doodle_sync(room)

    def doodle_hint(self, room, token):
        d = room.doodle
        if token != d["id"] or d["state"] != "drawing":
            return
        hidden = [i for i, ch in enumerate(d["word"]) if ch.isalpha() and i not in d["shown"]]
        if len(hidden) > 2:
            d["shown"].add(random.choice(hidden))
        hint = "".join(ch if (i in d["shown"] or not ch.isalpha()) else "_" for i, ch in enumerate(d["word"]))
        room.broadcast({"t": "doodle_hint", "hint": hint}, scene="doodle")

    def doodle_reveal(self, room, token):
        d = room.doodle
        if token != d["id"] or d["state"] not in ("choosing", "drawing"):
            return
        if d["word"] is None:
            d["word"] = random.choice(d["choices"]) if d["choices"] else "?"
        d["id"] += 1
        d.update(state="reveal", ends=time.monotonic() + DOODLE_REVEAL, dur=DOODLE_REVEAL)
        self.doodle_later(room, DOODLE_REVEAL, self.doodle_next)
        self.doodle_sync(room)

    def doodle_over(self, room):
        d = room.doodle
        present = set(room.in_scene("doodle"))
        ranking = sorted((k for k in d["scores"] if k in present), key=lambda k: -d["scores"][k])
        d["id"] += 1
        d.update(state="over", drawer=None, ranking=ranking, ends=time.monotonic() + DOODLE_OVER, dur=DOODLE_OVER)
        if len(ranking) >= 2:
            for place, k in enumerate(ranking):
                coins, xp = DOODLE_PRIZES[place] if place < len(DOODLE_PRIZES) else DOODLE_REST
                extra = {"doodleWins": 1, "wins": 1} if place == 0 and d["scores"][k] > 0 else {}
                self.reward(room.clients[k], coins=coins, xp=xp, **extra)
            winner = room.zone["players"][ranking[0]]["name"]
            self.post_feed(room, f"🎨 {winner} won Doodle Guess with {d['scores'][ranking[0]]} points!")
        self.doodle_later(room, DOODLE_OVER, self.doodle_idle)
        self.doodle_sync(room)

    def doodle_idle(self, room, token):
        d = room.doodle
        if token == d["id"] and d["state"] == "over":
            d.update(state="idle", ranking=[])
            self.doodle_sync(room)

    def on_doodle_draw(self, c, m):
        room, d = c.room, c.room.doodle
        if d["state"] != "drawing" or c.key != d["drawer"]:
            return
        color = str(m.get("c", "#000000"))
        if not COLOR_RE.match(color):
            return
        width = num(m.get("w", 6), 1, 60)
        pts = [[round(num(p[0], 0, 1), 4), round(num(p[1], 0, 1), 4)] for p in m.get("p", [])[:200]]
        if not pts or sum(len(s["p"]) for s in d["strokes"]) + len(pts) > DOODLE_MAX_POINTS:
            return
        sid = int(num(m.get("id", 0), 0, 1e9))
        if d["strokes"] and d["strokes"][-1]["id"] == sid:
            d["strokes"][-1]["p"].extend(pts)
        else:
            d["strokes"].append({"id": sid, "c": color, "w": width, "p": pts})
        room.broadcast({"t": "doodle_draw", "id": sid, "c": color, "w": width, "p": pts}, scene="doodle", exclude=c)

    def on_doodle_undo(self, c, m):
        room, d = c.room, c.room.doodle
        if d["state"] == "drawing" and c.key == d["drawer"] and d["strokes"]:
            d["strokes"].pop()
            room.broadcast({"t": "doodle_undo"}, scene="doodle", exclude=c)

    def on_doodle_clear(self, c, m):
        room, d = c.room, c.room.doodle
        if d["state"] == "drawing" and c.key == d["drawer"]:
            d["strokes"] = []
            room.broadcast({"t": "doodle_clear"}, scene="doodle", exclude=c)

    def on_doodle_guess(self, c, m):
        room, d = c.room, c.room.doodle
        text = clean(m.get("text"), 60)
        if not text or not c.ready("guess", 0.4):
            return
        playing = d["state"] == "drawing" and c.key != d["drawer"] and c.key not in d["guessed"]
        if not playing:
            if d["state"] != "drawing" or (c.key != d["drawer"] and c.key not in d["guessed"]):
                room.broadcast({"t": "doodle_msg", "k": c.key, "text": text}, scene="doodle")
            return
        guess, word = squash(text), squash(d["word"])
        if guess == word:
            left = max(0.0, d["ends"] - time.monotonic())
            pts = 50 + int(100 * left / DOODLE_DRAW) + max(0, 30 - 10 * len(d["guessed"]))
            d["guessed"][c.key] = pts
            d["scores"][c.key] = d["scores"].get(c.key, 0) + pts
            d["scores"][d["drawer"]] = d["scores"].get(d["drawer"], 0) + 25
            room.broadcast({"t": "doodle_guessed", "k": c.key, "pts": pts, "scores": d["scores"]}, scene="doodle")
            c.ws.send({"t": "doodle_word", "word": d["word"]})
            if all(k in d["guessed"] or k == d["drawer"] for k in room.in_scene("doodle")):
                self.doodle_reveal(room, d["id"])
        else:
            if near_miss(guess, word):
                c.ws.send({"t": "doodle_close", "text": text})
            room.broadcast({"t": "doodle_msg", "k": c.key, "text": text}, scene="doodle")

    # ---- bumper brawl ----------------------------------------------------------------

    def bumper_view(self, room):
        b = room.bumper
        now = time.monotonic()
        return {"t": "bumper", "state": b["state"], "id": b["id"], "alive": list(b["alive"]),
                "fighters": b["fighters"], "elapsed": round(now - b["start"], 2) if b["state"] == "fight" else 0,
                "left": round(max(0.0, b["ends"] - now), 2), "wins": b["wins"], "shrink": BUMPER_ROUND_MAX - 15}

    def bumper_join(self, c):
        room, b = c.room, c.room.bumper
        b["fighters"][c.key] = {"x": 450, "y": 300, "vx": 0, "vy": 0}
        c.ws.send(self.bumper_view(room))
        room.broadcast({"t": "bumper_add", "k": c.key}, scene="bumper", exclude=c)
        self.bumper_maybe_start(room)

    def bumper_leave(self, c):
        room, b = c.room, c.room.bumper
        b["fighters"].pop(c.key, None)
        was_alive = c.key in b["alive"]
        b["alive"].discard(c.key)
        room.broadcast({"t": "bumper_del", "k": c.key}, scene="bumper")
        if was_alive and b["state"] == "fight" and len(b["alive"]) <= 1:
            self.bumper_end(room, b["id"])
        elif b["state"] in ("starting", "countdown") and len(room.in_scene("bumper")) < 2:
            b["id"] += 1
            b.update(state="waiting", alive=set())
            room.broadcast(self.bumper_view(room), scene="bumper")

    def bumper_maybe_start(self, room):
        b = room.bumper
        if b["state"] != "waiting" or len(room.in_scene("bumper")) < 2:
            return
        b["id"] += 1
        b.update(state="starting", ends=time.monotonic() + BUMPER_START_DELAY)
        room.broadcast(self.bumper_view(room), scene="bumper")
        asyncio.get_running_loop().call_later(BUMPER_START_DELAY, self.bumper_countdown, room, b["id"])

    def bumper_countdown(self, room, token):
        b = room.bumper
        if token != b["id"] or b["state"] != "starting":
            return
        players = room.in_scene("bumper")
        if len(players) < 2:
            b.update(state="waiting")
            room.broadcast(self.bumper_view(room), scene="bumper")
            return
        random.shuffle(players)
        spawns = {}
        for i, k in enumerate(players):
            a = i / len(players) * math.tau
            spawns[k] = [round(450 + math.cos(a) * BUMPER_SPAWN_R), round(300 + math.sin(a) * BUMPER_SPAWN_R * 0.95)]
            b["fighters"][k] = {"x": spawns[k][0], "y": spawns[k][1], "vx": 0, "vy": 0}
        b["id"] += 1
        b.update(state="countdown", alive=set(players), round=set(players), ends=time.monotonic() + 3)
        room.broadcast({**self.bumper_view(room), "spawns": spawns}, scene="bumper")
        asyncio.get_running_loop().call_later(3, self.bumper_fight, room, b["id"])

    def bumper_fight(self, room, token):
        b = room.bumper
        if token != b["id"] or b["state"] != "countdown":
            return
        b.update(state="fight", start=time.monotonic(), ends=time.monotonic() + BUMPER_ROUND_MAX)
        room.broadcast(self.bumper_view(room), scene="bumper")
        asyncio.get_running_loop().call_later(BUMPER_ROUND_MAX, self.bumper_end, room, b["id"])

    def on_bumper_move(self, c, m):
        b = c.room.bumper
        f = b["fighters"].get(c.key)
        if not f:
            return
        f.update(x=round(num(m["x"], -200, 1100), 1), y=round(num(m["y"], -200, 800), 1),
                 vx=round(num(m["vx"], -2000, 2000), 1), vy=round(num(m["vy"], -2000, 2000), 1))
        c.room.broadcast({"t": "bumper_pos", "k": c.key, **f, "d": bool(m.get("d"))}, scene="bumper", exclude=c)

    def on_bumper_out(self, c, m):
        room, b = c.room, c.room.bumper
        if b["state"] != "fight" or c.key not in b["alive"]:
            return
        b["alive"].discard(c.key)
        by = str(m.get("by") or "")
        by = by if by != c.key and by in b["round"] and by in room.clients else None
        room.broadcast({"t": "bumper_out", "k": c.key, "by": by}, scene="bumper")
        if by:
            self.reward(room.clients[by], coins=10, xp=5)
        if len(b["alive"]) <= 1:
            self.bumper_end(room, b["id"])

    def bumper_end(self, room, token):
        b = room.bumper
        if token != b["id"] or b["state"] != "fight":
            return
        winner = next(iter(b["alive"]), None) if len(b["alive"]) == 1 else None
        b["id"] += 1
        b.update(state="done", ends=time.monotonic() + 4)
        for k in b["round"]:
            c = room.clients.get(k)
            if not c or c.scene != "bumper":
                continue
            if k == winner:
                self.reward(c, coins=120, xp=60, bumperWins=1, wins=1)
            else:
                self.reward(c, coins=15, xp=10)
        if winner:
            b["wins"][winner] = b["wins"].get(winner, 0) + 1
            if len(b["round"]) >= 3:
                self.post_feed(room, f"💥 {room.zone['players'][winner]['name']} won a round of Bumper Brawl!")
        room.broadcast({**self.bumper_view(room), "winner": winner}, scene="bumper")
        asyncio.get_running_loop().call_later(4, self.bumper_reset, room, b["id"])

    def bumper_reset(self, room, token):
        b = room.bumper
        if token != b["id"] or b["state"] != "done":
            return
        b.update(state="waiting", alive=set(), round=set())
        room.broadcast(self.bumper_view(room), scene="bumper")
        self.bumper_maybe_start(room)

    # ---- roulette -------------------------------------------------------------------

    def roulette_view(self, room):
        r = room.roulette
        return {"t": "roulette", "state": r["state"], "left": round(max(0.0, r["ends"] - time.monotonic()), 2),
                "bets": r["bets"], "history": r["history"], "result": r["result"], "id": r["id"]}

    def roulette_join(self, c):
        room = c.room
        if room.roulette["state"] == "idle":
            self.roulette_round(room, room.roulette["id"])
        else:
            c.ws.send(self.roulette_view(room))

    def roulette_round(self, room, token):
        r = room.roulette
        if token != r["id"]:
            return
        r["id"] += 1
        if not room.in_scene("casino"):
            r.update(state="idle", bets={})
            return
        r.update(state="betting", ends=time.monotonic() + ROULETTE_BET_T, bets={}, result=None)
        room.broadcast(self.roulette_view(room), scene="casino")
        asyncio.get_running_loop().call_later(ROULETTE_BET_T, self.roulette_spin, room, r["id"])

    def roulette_spin(self, room, token):
        r = room.roulette
        if token != r["id"]:
            return
        r["id"] += 1
        r.update(state="spinning", result=random.randrange(37), ends=time.monotonic() + ROULETTE_SPIN_T)
        room.broadcast({"t": "roulette_spin", "n": r["result"], "spin": ROULETTE_SPIN_T}, scene="casino")
        asyncio.get_running_loop().call_later(ROULETTE_SPIN_T, self.roulette_payout, room, r["id"])

    def roulette_payout(self, room, token):
        r = room.roulette
        if token != r["id"]:
            return
        n = r["result"]
        wins = {}
        for k, bets in r["bets"].items():
            total = sum(b["amount"] * ROULETTE_PAYS[b["kind"]] for b in bets if roulette_hits(b["kind"], b["v"], n))
            wins[k] = total
            c = room.clients.get(k)
            if c and total:
                self.reward(c, coins=total, xp=3, **({"jackpots": 1} if any(b["kind"] == "num" and b["v"] == n for b in bets) else {}))
            elif total:  # they left the table; still pay them
                room.zone["players"][k]["coins"] += total
                self.store.mark()
            if total >= 1000:
                self.post_feed(room, f"🎡 {room.zone['players'][k]['name']} won {total:,} coins on {n} at roulette!")
        r["history"] = ([n] + r["history"])[:12]
        r["id"] += 1
        r.update(state="result", ends=time.monotonic() + ROULETTE_PAUSE_T)
        room.broadcast({"t": "roulette_result", "n": n, "wins": wins, "history": r["history"]}, scene="casino")
        asyncio.get_running_loop().call_later(ROULETTE_PAUSE_T, self.roulette_round, room, r["id"])

    def on_roulette_sync(self, c, m):
        if c.scene == "casino":
            if c.room.roulette["state"] == "idle":
                self.roulette_round(c.room, c.room.roulette["id"])
            else:
                c.ws.send(self.roulette_view(c.room))

    def on_roulette_bet(self, c, m):
        room, r, p = c.room, c.room.roulette, c.player
        kind = m.get("kind")
        if r["state"] != "betting" or r["ends"] - time.monotonic() < 0.5:
            raise GameError("No more bets! Wait for the next round.")
        if kind not in ROULETTE_PAYS:
            raise GameError("Unknown bet.")
        v = int(num(m.get("v", 0), 0, 36))
        if kind == "dozen" and v not in (1, 2, 3):
            raise GameError("Unknown bet.")
        if kind != "num" and kind != "dozen":
            v = 0
        amount = int(num(m.get("amount", 0), 0, MAX_BET))
        mine = r["bets"].setdefault(c.key, [])
        if amount < 1:
            raise GameError("Pick a chip first.")
        if sum(b["amount"] for b in mine) + amount > MAX_BET:
            raise GameError(f"The table limit is {MAX_BET:,} coins per round.")
        if amount > p["coins"]:
            raise GameError("You don't have that many coins.")
        p["coins"] -= amount
        self.store.mark()
        for b in mine:
            if b["kind"] == kind and b["v"] == v:
                b["amount"] += amount
                break
        else:
            mine.append({"kind": kind, "v": v, "amount": amount})
        room.broadcast({"t": "roulette_bet", "k": c.key, "bets": mine}, scene="casino")
        self.push_player(room, c.key)

    def on_roulette_clear(self, c, m):
        room, r = c.room, c.room.roulette
        mine = r["bets"].pop(c.key, [])
        if r["state"] != "betting" or not mine:
            if mine:
                r["bets"][c.key] = mine
            return
        c.player["coins"] += sum(b["amount"] for b in mine)
        self.store.mark()
        room.broadcast({"t": "roulette_bet", "k": c.key, "bets": []}, scene="casino")
        self.push_player(room, c.key)

    # ---- houses ------------------------------------------------------------------

    def on_house_get(self, c, m):
        key = str(m.get("k") or c.key).lower()
        owner = c.room.zone["players"].get(key)
        if not owner:
            raise GameError("That house doesn't exist.")
        c.ws.send({"t": "house", "k": key, "house": house_view(owner)})

    def on_house_save(self, c, m):
        if not c.ready("house_save", 0.2):
            return
        p = c.player
        try:
            p["house"].update(clean_house(p, m))
        except GameError:
            c.ws.send({"t": "house", "k": c.key, "house": house_view(p)})  # put the client back in sync
            raise
        self.store.mark()
        c.room.broadcast({"t": "house", "k": c.key, "house": house_view(p)})
        self.push_player(c.room, c.key)

    def on_house_buy(self, c, m):
        p = c.player
        item_id = str(m.get("id", ""))
        item = FURN.get(item_id) or FLOORS.get(item_id) or WALLS.get(item_id)
        if not item or "price" not in item:
            raise GameError("That isn't for sale.")
        have = p["furni"].get(item_id, 0)
        limit = 1 if item_id not in FURN else item.get("max", 10)
        if have >= limit:
            raise GameError("You already have that." if limit == 1 else f"You can own up to {limit} of those.")
        if p["coins"] < item["price"]:
            raise GameError(f"You need {item['price']:,} coins for that.")
        p["coins"] -= item["price"]
        p["furni"][item_id] = have + 1
        self.store.mark()
        c.ws.send({"t": "house_bought", "id": item_id})
        self.push_player(c.room, c.key)

    def on_house_like(self, c, m):
        key = str(m.get("k", "")).lower()
        owner = c.room.zone["players"].get(key)
        if not owner or key == c.key:
            raise GameError("You can't like your own house!")
        likes = owner["house"]["likes"]
        if c.key in likes:
            raise GameError("You already liked this house.")
        if not c.ready("like", 1):
            return
        likes.append(c.key)
        owner["stats"]["houseLikes"] = owner["stats"].get("houseLikes", 0) + 1
        owner["coins"] += 10
        self.store.mark()
        c.room.broadcast({"t": "house", "k": key, "house": house_view(owner)})
        self.push_player(c.room, key)
        self.post_feed(c.room, f"🏠 {c.player['name']} loved {owner['name']}'s house!")


# --------------------------------------------------------------------------
# HTTP + connection handling
# --------------------------------------------------------------------------

async def client_loop(game, ws):
    c = Client(ws)
    try:
        while True:
            text = await asyncio.wait_for(ws.recv(), IDLE_TIMEOUT)
            if text is None:
                break
            try:
                msg = json.loads(text)
            except ValueError:
                continue
            if isinstance(msg, dict) and msg.get("t") != "ping":
                game.dispatch(c, msg)
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError, OSError):
        pass
    finally:
        game.leave(c)
        ws.close()


def respond(writer, status, body=b"", ctype="text/plain; charset=utf-8", head_only=False, extra=""):
    writer.write(
        f"HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n"
        f"Cache-Control: no-cache\r\nConnection: close\r\n{extra}\r\n".encode()
    )
    if not head_only:
        writer.write(body)


_gzip_cache = {}


def static_body(file, accept_encoding):
    """File bytes, gzipped for text types when the browser allows it (cached by modification time)."""
    data = file.read_bytes()
    if "gzip" not in accept_encoding or file.suffix not in (".js", ".css", ".html", ".json"):
        return data, ""
    key = (file, file.stat().st_mtime_ns)
    if key not in _gzip_cache:
        _gzip_cache[key] = gzip.compress(data, 6)
    return _gzip_cache[key], "Content-Encoding: gzip\r\nVary: Accept-Encoding\r\n"


async def handle_connection(game, reader, writer):
    try:
        head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 15)
        lines = head.decode("latin-1").split("\r\n")
        method, target, _ = lines[0].split(" ", 2)
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        path = unquote(target.split("?", 1)[0])

        if path == "/ws" and headers.get("upgrade", "").lower() == "websocket":
            key = headers.get("sec-websocket-key", "")
            accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
            writer.write(
                "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n\r\n".encode()
            )
            await client_loop(game, WebSocket(reader, writer))
            return

        if method not in ("GET", "HEAD"):
            respond(writer, "405 Method Not Allowed", b"Method not allowed")
        else:
            file = (PUBLIC / (path.lstrip("/") or "index.html")).resolve()
            if file.is_relative_to(PUBLIC) and file.is_file():
                ctype = MIME.get(file.suffix, "application/octet-stream")
                body, extra = static_body(file, headers.get("accept-encoding", ""))
                respond(writer, "200 OK", body, ctype, head_only=method == "HEAD", extra=extra)
            else:
                respond(writer, "404 Not Found", b"Not found")
        # wait until the whole response is flushed before closing (not just below the high-water mark)
        writer.transport.set_write_buffer_limits(high=0)
        await writer.drain()
        # Let the client hang up first: closing our end while bytes are still in flight can leave the
        # tail of big files stuck on some Windows setups. Browsers close once Content-Length is read.
        try:
            await asyncio.wait_for(reader.read(), 10)
        except (asyncio.TimeoutError, ConnectionError, OSError):
            pass
    except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, asyncio.TimeoutError,
            ConnectionError, ValueError, OSError):
        pass
    finally:
        # Wait for the socket to flush and close; closing without waiting can cut off the tail
        # of large responses (e.g. the 3D engine script) on Windows.
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), 30)
        except (asyncio.TimeoutError, ConnectionError, OSError):
            pass


def lan_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


async def main():
    store = Store(DATA_FILE)
    game = Game(store)
    server = await asyncio.start_server(lambda r, w: handle_connection(game, r, w), HOST, PORT)
    saver = asyncio.create_task(store.autosave())
    if sys.platform != "win32":
        # Hosts stop the server with SIGTERM (sleep, redeploy): shut down cleanly so we save first.
        asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, server.close)
    if store.cloud:
        print("Cloud save: on (Upstash Redis)")
    print(f"FriendZone is running: http://localhost:{PORT}")
    lan = lan_address()
    if lan:
        print(f"Friends on your network can join at: http://{lan}:{PORT}")
    try:
        async with server:
            await server.serve_forever()
    finally:
        saver.cancel()
        store.save()
        store.cloud_save()


def run():
    # Windows' default Proactor loop can truncate large responses when a connection closes,
    # so use the selector loop there (plenty for a friend-group server).
    if sys.platform != "win32":
        asyncio.run(main())
    elif sys.version_info >= (3, 12):
        asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)
    else:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        asyncio.run(main())


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nSaved. Bye!")
