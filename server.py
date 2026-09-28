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
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA_FILE = Path(os.environ.get("FZ_DATA", ROOT / "data" / "zones.json"))
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

SCENES = {"lobby", "world", "race", "arena"}
WORLD_W, WORLD_H = 1800, 1200
START_COINS = 500
DAILY_BONUS = 300
DAILY_SECS = 20 * 3600

RACE_LEN = 80
RACE_TIMEOUT = 45
RACE_PRIZES = [(150, 40), (80, 25), (50, 15)]  # (coins, xp) by place
RACE_PRIZE_REST = (25, 10)
RACE_PRIZE_SOLO = (40, 15)

ARENA_W, ARENA_H = 900, 600
ARENA_HP = 3
ARENA_TARGET = 5
ARENA_SPAWNS = [(70, 70), (830, 70), (70, 530), (830, 530), (450, 60), (450, 540), (60, 300), (840, 300)]

# Cosmetics and fish are shared with the client through one catalog file.
CATALOG = json.loads((PUBLIC / "cosmetics.json").read_text("utf-8"))
ITEMS = {item["id"]: item for item in CATALOG["items"]}
FISH = CATALOG["fish"]
LOOK_SLOTS = ("hair", "top", "hat", "face", "back", "aura")
LOOK_COLORS = {"skin": "skins", "hairColor": "hairColors", "topColor": "clothColors", "bottomColor": "clothColors"}
STAT_KEYS = ("wins", "elims", "raceWins", "arenaWins", "fish", "koi", "archeryBest", "jackpots")

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

class Store:
    def __init__(self, path):
        self.path = path
        self.zones = {}
        self.dirty = False
        if path.exists():
            self.zones = json.loads(path.read_text("utf-8")).get("zones", {})
            for zone in self.zones.values():
                for player in zone["players"].values():
                    migrate(player)

    def mark(self):
        self.dirty = True

    def save(self):
        if not self.dirty:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"zones": self.zones}, ensure_ascii=False, indent=1), "utf-8")
        os.replace(tmp, self.path)
        self.dirty = False

    async def autosave(self):
        while True:
            await asyncio.sleep(3)
            try:
                self.save()
            except OSError as e:
                print("save failed:", e)


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


def migrate(p):
    """Fill in fields added after a profile was first saved."""
    p.setdefault("look", default_look(p.get("color")))
    p.setdefault("lookSet", False)
    p.setdefault("owned", [])
    p.setdefault("fishdex", {})
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


def public(p, client):
    return {
        "key": p["name"].lower(), "name": p["name"], "color": p["color"],
        "coins": p["coins"], "xp": p["xp"], "level": level_for(p["xp"]), "stats": p["stats"],
        "look": p["look"], "lookSet": p["lookSet"], "owned": p["owned"], "fishdex": p["fishdex"],
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
            if not cond or item["id"] in p["owned"]:
                continue
            if "level" in cond:
                met = level_for(p["xp"]) >= cond["level"]
            else:
                met = p["stats"].get(cond["stat"], 0) >= cond["min"]
            if met:
                self.grant(c, item, "achievement")

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
        if prev == "arena" and scene != "arena":
            self.arena_leave(c)
        if prev == "race" and scene != "race":
            self.race_remove(c)
        c.scene = scene
        if scene is None:
            return
        if scene == "world":
            if c.x is None:  # somewhere on the plaza, clear of the fountain
                angle, dist = random.uniform(0, math.tau), random.uniform(70, 95)
                c.x, c.y = WORLD_W / 2 + math.cos(angle) * dist, WORLD_H / 2 + math.sin(angle) * dist
            others = [{"k": o.key, "x": o.x, "y": o.y} for o in room.clients.values() if o.scene == "world" and o is not c]
            c.ws.send({"t": "world", "me": {"x": c.x, "y": c.y}, "others": others})
            room.broadcast({"t": "pos", "k": c.key, "x": c.x, "y": c.y}, scene="world", exclude=c)
        elif scene == "arena":
            self.arena_join(c)
        elif scene == "race":
            c.ws.send({"t": "race", "race": self.race_view(room)})
        self.push_player(room, c.key)

    def on_move(self, c, m):
        if c.scene != "world":
            return
        c.x, c.y = num(m["x"], 0, WORLD_W), num(m["y"], 0, WORLD_H)
        c.room.broadcast({"t": "pos", "k": c.key, "x": round(c.x, 1), "y": round(c.y, 1)}, scene="world", exclude=c)

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
        return {"state": r["state"], "racers": r["racers"], "order": r["order"], "len": RACE_LEN}

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
        c.ws.send({"t": "arena", "players": players, "target": ARENA_TARGET, "hp": ARENA_HP})
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

    def arena_respawn(self, room, key):
        f = room.arena.get(key)
        if not f or f["hp"] > 0:
            return
        f["x"], f["y"] = self.arena_spawn_point(room, key)
        f["hp"], f["spawn"] = ARENA_HP, time.monotonic()
        room.broadcast({"t": "arena_spawn", "k": key, "x": f["x"], "y": f["y"], "hp": f["hp"]}, scene="arena")


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
