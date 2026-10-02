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
    ".mp3": "audio/mpeg",
    ".ico": "image/x-icon",
}

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
NAME_RE = re.compile(r"^[A-Za-z0-9 _\-]{1,16}$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_MEMBERS = 50
# the online world anyone signed in can join: one shared save (your progress there is your account's),
# played in copies ("servers") of up to PUBLIC_MAX people each
PUBLIC_CODE = "PUBLIC"
PUBLIC_MAX = 20
# accounts: one username + password that signs you in to all your zones, on any device
USERNAME_RE = re.compile(r"^[A-Za-z0-9_\-]{3,16}$")
PASSWORD_MIN, PASSWORD_MAX = 4, 64

SCENES = {"lobby", "world", "race", "arena", "lasertag", "boss", "house", "casino", "doodle", "archery", "shop", "petshop", "arcade", "tavern", "beach"}
AREA_SCENES = {"casino", "shop", "petshop", "arcade", "tavern", "beach"}  # 3D rooms you walk around in; positions are relayed to everyone inside
COVE_OPEN = False  # Coral Cove is still being built: only admins can go through the portal for now


def is_area(scene):
    """Walk-around rooms: the casino, and every member's house ("house:<owner>")."""
    return scene in AREA_SCENES or (isinstance(scene, str) and scene.startswith("house:"))
POSES = {"fish", "cast", "bite", "reel", "catch", "bench", "ride"}
WORLD_W, WORLD_H = 7200, 4800
START_COINS = 500
DAILY_BONUS = 300
DAILY_SECS = 20 * 3600

RACE_LAPS = 3
RACE_TIMEOUT = 300          # seconds before a race is called
RACE_MIN_LAP = 20           # nobody can really lap the Grand Prix faster than this
RACE_ITEMS = {"turbo", "turbo3", "banana", "bananas", "oil", "shell", "rocket", "zap", "shield", "star", "bomb"}
RACE_PRIZES = [(150, 40), (80, 25), (50, 15)]  # (coins, xp) by place
RACE_PRIZE_REST = (25, 10)
RACE_PRIZE_SOLO = (40, 15)

ARENA_W, ARENA_H = 1200, 900     # every map is this size (arena px; 20 px = 1 world unit)
ARENA_HP = 3
ARENA_TARGET = 7
ARENA_BREAK = 10                   # seconds between rounds (the scoreboard shows)
# The maps rotate every round. Walls are (x, y, w, h) rectangles, full height in 3D.
ARENA_MAPS = [
    {"id": "colosseum", "name": "Colosseum", "theme": "sand",
     "walls": [(250, 180, 90, 90), (860, 180, 90, 90), (250, 630, 90, 90), (860, 630, 90, 90), (540, 400, 120, 100),
               (560, 120, 80, 30), (560, 750, 80, 30)],
     "spawns": [(80, 80), (1120, 80), (80, 820), (1120, 820), (600, 60), (600, 840), (60, 450), (1140, 450)]},
    {"id": "maze", "name": "Hedge Maze", "theme": "hedge",
     "walls": [(180, 0, 40, 330), (180, 570, 40, 330), (980, 0, 40, 330), (980, 570, 40, 330), (380, 200, 440, 40),
               (380, 660, 440, 40), (380, 240, 40, 160), (780, 500, 40, 160), (580, 380, 40, 140), (0, 430, 120, 40),
               (1080, 430, 120, 40)],
     "spawns": [(90, 90), (1110, 90), (90, 810), (1110, 810), (600, 110), (600, 790), (300, 450), (900, 450)]},
    {"id": "docks", "name": "Crate Docks", "theme": "docks",
     "walls": [(200, 150, 80, 80), (280, 150, 80, 80), (840, 150, 80, 80), (840, 230, 80, 80), (520, 300, 160, 80),
               (520, 520, 160, 80), (200, 670, 80, 80), (920, 670, 80, 80), (840, 670, 80, 80), (100, 400, 60, 100),
               (1040, 400, 60, 100), (380, 420, 60, 60), (760, 420, 60, 60)],
     "spawns": [(70, 70), (1130, 70), (70, 830), (1130, 830), (600, 60), (600, 840), (450, 250), (750, 650)]},
    {"id": "cross", "name": "Crossroads", "theme": "stone",
     "walls": [(0, 0, 360, 260), (840, 0, 360, 260), (0, 640, 360, 260), (840, 640, 360, 260), (560, 390, 80, 120),
               (440, 430, 80, 40), (680, 430, 80, 40), (160, 400, 60, 100), (980, 400, 60, 100), (560, 120, 80, 60),
               (560, 720, 80, 60)],
     "spawns": [(600, 60), (600, 840), (60, 450), (1140, 450), (420, 320), (780, 580), (420, 580), (780, 320)]},
]

# Dungeon (Boss Cave): a co-op climb. Every run starts on floor 1: clear the monsters on each floor,
# everyone picks an upgrade, and the group goes deeper. Every third floor is a boss. The run ends
# when everyone is down, and the zone remembers the highest floor reached. The server runs the
# monsters and bosses; clients dodge and report their own hits, like the arena.
BOSS_W, BOSS_H = 900, 600
BOSS_TICK = 0.05         # 20 updates a second, so monsters move smoothly
BOSS_PLAYER_HP = 100     # health, not hearts: every attack does its own amount of damage
BOSS_REVIVE_HP = 30      # what you get back up with (revived by a friend, Second Wind, or the next floor)
# damage each kind of hit does on floor 1 (it grows a little every floor); "poison" also poisons you
HIT_DMG = {"shot": 12, "slam": 22, "rocks": 18, "curse": 16, "hop": 26, "boss": 20, "touch": 10, "brute": 18,
           "poison": 8, "puddle": 6}
POISON_T, POISON_DPS = 4.0, 6  # how long poison lasts and how much it drains per second
BOSS_IFRAMES = 0.9       # seconds of invulnerability after taking a hit
BOSS_REVIVE_R = 60       # stand this close to a downed friend to revive them
BOSS_REVIVE_T = 2.0      # seconds it takes; revived players always come back with one heart
BOSS_SPAWNS = [(300, 500), (450, 530), (600, 500), (200, 450), (700, 450), (450, 460)]
DUNGEON_DMG = 10         # damage per bullet before upgrades
DUNGEON_INTRO_T = 2.6
DUNGEON_PICK_T = 20
DUNGEON_OVER_T = 10
DUNGEON_BOSS_EVERY = 3
DUNGEON_MAX_MOBS = 14    # alive at once
BOSSES = [
    {"id": "slime", "name": "King Slime", "hp": 1500, "r": 50, "speed": 80,
     "attacks": ["hop", "volley", "summon", "slam", "hop"], "minions": ["slimelet"], "loot": "trophy_slime"},
    {"id": "golem", "name": "Stone Golem", "hp": 2400, "r": 56, "speed": 58,
     "attacks": ["slam", "rocks", "charge", "volley"], "loot": "trophy_golem", "drop": ("hat_horns", 0.25)},
    {"id": "venom", "name": "Venom Queen", "hp": 2300, "r": 52, "speed": 75, "poison": True,
     "attacks": ["puddles", "volley", "summon", "puddles", "charge", "spiral"], "minions": ["toad", "toad", "bat"],
     "loot": "trophy_venom"},
    {"id": "lich", "name": "Bone Lich", "hp": 2200, "r": 46, "speed": 70,
     "attacks": ["summon", "volley", "curse", "blink", "summon", "spiral"], "minions": ["bat", "archer", "skeleton"],
     "loot": "trophy_lich"},
    {"id": "dragon", "name": "Shadow Dragon", "hp": 3300, "r": 60, "speed": 95,
     "attacks": ["spiral", "charge", "rocks", "volley", "spiral"], "loot": "trophy_dragon", "drop": ("aura_shadow", 0.2)},
]
# Monsters: hp before floor scaling, radius, speed (px/s) and how they fight.
MOBS = {
    "bat": {"hp": 30, "r": 14, "speed": 150},
    "slimelet": {"hp": 45, "r": 16, "speed": 95},
    "skeleton": {"hp": 55, "r": 15, "speed": 85},
    "archer": {"hp": 45, "r": 15, "speed": 70, "range": 240, "every": 2.4},
    "wisp": {"hp": 60, "r": 16, "speed": 40, "every": 3.4},
    "brute": {"hp": 140, "r": 24, "speed": 52, "every": 4.2},
    "toad": {"hp": 70, "r": 17, "speed": 80, "range": 200, "every": 2.8},  # spits poison
}
MOB_UNLOCK = [(1, "bat"), (1, "slimelet"), (2, "skeleton"), (3, "archer"), (4, "toad"), (5, "wisp"), (7, "brute")]
UPGRADES = {
    "dmg": {"name": "Power Shot", "emoji": "💥", "desc": "+18% damage", "max": 8},
    "rate": {"name": "Rapid Fire", "emoji": "⚡", "desc": "Shoot 14% faster", "max": 5},
    "multi": {"name": "Split Shot", "emoji": "🔱", "desc": "+1 bullet per shot (split bullets hit a bit softer)", "max": 3},
    "speed": {"name": "Swift Boots", "emoji": "👟", "desc": "Move 15% faster", "max": 4},
    "heart": {"name": "Vitality", "emoji": "❤️", "desc": "+25 max HP, and heal 25 HP", "max": 6},
    "crit": {"name": "Lucky Shots", "emoji": "🍀", "desc": "+7% chance to crit for double damage", "max": 5},
    "pierce": {"name": "Piercing Rounds", "emoji": "🏹", "desc": "Bullets fly through monsters", "max": 1},
    "dash": {"name": "Quick Dash", "emoji": "💨", "desc": "Dash cooldown -30%", "max": 2},
    "shield": {"name": "Bubble Shield", "emoji": "🫧", "desc": "Block the first hit on every floor", "max": 1},
    "regen": {"name": "Second Breakfast", "emoji": "🍗", "desc": "Heal 20 HP after every floor", "max": 2},
    "antidote": {"name": "Antidote", "emoji": "🧪", "desc": "Poison hurts half as much and wears off twice as fast", "max": 1},
    "revive": {"name": "Second Wind", "emoji": "🌀", "desc": "Once per run, get back up on your own (30 HP)", "max": 1},
    "big": {"name": "Big Bullets", "emoji": "🔵", "desc": "Bigger bullets, easier hits", "max": 2},
    "fire": {"name": "Fire Rounds", "emoji": "🔥", "desc": "Hits set enemies on fire: they burn for 3s", "max": 3},
    "ice": {"name": "Frost Rounds", "emoji": "❄️", "desc": "Hits chill enemies, slowing them for 2s", "max": 2},
    "venom": {"name": "Venom Rounds", "emoji": "🧪", "desc": "Hits poison enemies; poison stacks up to 5 times", "max": 3},
}

ARENA_ITEMS = ("heal", "rapid", "shield", "speed")
ARENA_ITEM_EVERY = 6
ARENA_ITEM_LIFE = 6.5   # an untouched power-up disappears after this long
ARENA_MAX_ITEMS = 3

# Doodle Guess: take turns drawing a word while everyone else guesses.
DOODLE_CHOOSE, DOODLE_DRAW, DOODLE_REVEAL, DOODLE_OVER = 12, 80, 5, 10
DOODLE_PRIZES = [(160, 80), (90, 50), (60, 30)]
DOODLE_REST = (20, 10)
DOODLE_MAX_POINTS = 40000
DOODLE_CUSTOM_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 '-]{1,23}$")
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


def bj_value(hand):
    """Best blackjack total for a hand of (rank, suit) cards; aces count 11 when they fit."""
    total = sum(10 if r in ("J", "Q", "K") else 1 if r == "A" else int(r) for r, _ in hand)
    if any(r == "A" for r, _ in hand) and total + 10 <= 21:
        total += 10
    return total


def bj_soft(hand):
    total = sum(10 if r in ("J", "Q", "K") else 1 if r == "A" else int(r) for r, _ in hand)
    return any(r == "A" for r, _ in hand) and total + 10 <= 21


# ---- chat filter ------------------------------------------------------------------------
# Catches swears even when they're dressed up: l33t (sh1t, @ss), symbols (f*ck, $hit), accents,
# spaced or dotted letters (f u c k, f.u.c.k) and stretched letters (fuuuck). Short words that hide
# inside innocent ones (ass in "class", hell in "hello") only count as whole words.
LEET = str.maketrans({"0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s",
                      "7": "t", "+": "t", "8": "b", "9": "g", "6": "g", "(": "c", "<": "c", "€": "e", "¢": "c"})
# rude anywhere inside a word
BAD_ROOTS = ("fuck", "fuk", "fck", "fuq", "phuck", "shit", "cunt", "bitch", "biatch", "nigg", "nigga", "niger",
             "faggot", "fagot", "whore", "slut", "retard", "pussy", "asshole", "arsehole", "bastard", "motherf",
             "wank", "twat", "dildo", "jizz", "cocksuck", "blowjob", "handjob", "porn", "penis", "vagina", "boner",
             "horny", "dumbass", "jackass", "bullshit", "goddamn", "damnit", "dammit", "kike", "chink", "tranny",
             "negro", "hitler", "nazi", "rapist", "molest", "pedo", "stfu", "gtfo")
# rude only as a whole word (plus simple endings)
BAD_WORDS = ("ass", "arse", "fag", "dick", "cock", "cum", "tit", "tits", "titty", "boob", "rape", "hell", "damn",
             "crap", "piss", "sex", "sexy", "hoe", "kys", "prick", "balls", "butthole", "douche", "thot", "milf",
             "anal", "cuck", "spic", "wtf", "shat", "sht")
ENDINGS = ("", "s", "es", "ed", "ing", "er", "ers", "y", "ies")
# innocent words that happen to contain a rude root
SAFE = ("scunthorpe", "cockpit", "cockatoo", "peacock", "hancock", "shitake", "shiitake", "penistone", "hitchcock",
        "therapist", "grape", "drape", "spicy", "spice", "shitzu", "cocktail", "classic", "document")


def _norm(text):
    import unicodedata
    t = unicodedata.normalize("NFKD", str(text).lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return t.translate(LEET)


def _forms(w):
    """A word as typed, with runs of 3+ letters squeezed (fuuuck -> fuck) and with every run squeezed."""
    return {w, re.sub(r"(.)\1{2,}", r"\1", w), re.sub(r"(.)\1+", r"\1", w)}


def is_rude(text):
    t = _norm(text)
    chunks = [c for c in re.split(r"\s+", t) if c]
    words = [re.sub(r"[^a-z]", "", c) for c in chunks]
    cands = set()
    for w in words:
        if w:
            cands |= _forms(w)
    # letters spelled out one or two at a time: "f u c k", "sh it"
    run = ""
    for w in words + ["   "]:
        if 0 < len(w) <= 2:
            run += w
        else:
            if len(run) >= 3:
                cands |= _forms(run)
            run = ""
    for w in cands:
        if any(safe in w for safe in SAFE):
            continue
        if any(root in w for root in BAD_ROOTS):
            return True
        if any(w == bad + end for bad in BAD_WORDS for end in ENDINGS):
            return True
    return False


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


HOUSE_SIZE = 14  # a new house is HOUSE_SIZE x HOUSE_SIZE tiles (bigger with house upgrades)
OLD_HOUSE_SIZE = 10  # (houses saved before rooms could be resized were this big)
HOUSE_WALL_H = 3.2  # wall height, tiles
HOUSE_WALL_Y = 1.75  # default height of a wall decoration's middle
HOUSE_DOOR_H = 2.2  # the front door's height (things can hang on the wall above it)
HOUSE_MAX_DROP = 2.4  # how far below the ceiling a hanging thing can go
HOUSE_MAX_ITEMS = 120

# Cosmetics and fish are shared with the client through one catalog file.
CATALOG = json.loads((PUBLIC / "cosmetics.json").read_text("utf-8"))
ITEMS = {item["id"]: item for item in CATALOG["items"]}
TRIM_COLORS = {t["c"] for t in CATALOG["trimColors"]}  # the house trim (baseboards, half-wall tops)
FISH = CATALOG["fish"]
FISH_BAG_MAX = 60
FISH_BY_NAME = {f["name"]: f for f in FISH}
FISH_RENAMED = {"Shark": "Great White Shark", "Tuna": "Yellowfin Tuna", "Crab": "Dungeness Crab", "Seaweed Clump": "Pond Weed", "Eel": "Freshwater Eel"}


def fish_price(fish, size):
    """What the fishmonger pays: the fish's value, more for a big one (up to +60%), less for a tiddler."""
    lo, hi = fish["size"]
    k = (size - lo) / max(0.1, hi - lo)
    return max(1, round(fish["coins"] * (0.8 + 0.8 * min(1.0, max(0.0, k)))))


FISH_DAMP = {"legendary": 0.05, "epic": 0.4, "mythic": 0.012}  # makes the rarest catches much rarer
# how hard each rarity fights on the line (the reeling minigame reads this)
FISH_FIGHT = {"junk": 0.2, "common": 0.35, "uncommon": 0.5, "rare": 0.7, "epic": 0.9, "legendary": 1.15, "mythic": 1.5}

WEATHER_BLOCK = 480  # the forecast changes every 8 minutes


# the forecast: each 8-minute spell is one of these (out of 256)
WEATHER_ODDS = (("sunny", 90), ("cloudy", 50), ("windy", 40), ("rain", 52), ("storm", 24))
WEATHER_KINDS = tuple(k for k, _ in WEATHER_ODDS)


def weather_scheduled(now=None):
    block = int((now if now is not None else time.time()) // WEATHER_BLOCK)
    roll = ((block * 2654435761) & 0xFFFFFFFF) >> 8 & 0xFF
    for kind, n in WEATHER_ODDS:
        if roll < n:
            return kind
        roll -= n
    return "sunny"


def rain_scheduled(now=None):
    return weather_scheduled(now) in ("rain", "storm")


def weather(room):
    return room.weather_override or weather_scheduled()


def raining(room):
    """Rain or a thunderstorm (when the mythic fish come out)."""
    return weather(room) in ("rain", "storm")
RODS = {r["id"]: r for r in CATALOG["rods"]}
FURN = {f["id"]: f for f in CATALOG["furniture"]}
FLOORS = {f["id"]: f for f in CATALOG["floors"]}
WALLS = {f["id"]: f for f in CATALOG["walls"]}
CEILINGS = {f["id"]: f for f in CATALOG["ceilings"]}
DOORS = {f["id"]: f for f in CATALOG["doors"]}
HOUSE_SIZES = {f["id"]: f for f in CATALOG["houseSizes"]}  # room size upgrades
HOUSE_MIN = 6  # the smallest a room can be made (tiles)
LOOK_SLOTS = ("hair", "top", "bottom", "outfit", "hat", "face", "back", "hand", "aura", "pet", "mount")
# extra accessory slots: up to three hats/hair accessories and three face items at once, and a thing in
# each hand (each one holds an item from its base slot)
EXTRA_SLOTS = {"hat2": "hat", "hat3": "hat", "face2": "face", "face3": "face", "hand2": "hand"}
# optional recolours: a top's own colour + trim, hair ties, and each accessory slot's colour
LOOK_TINTS = ("hatColor", "hat2Color", "hat3Color", "faceColor", "face2Color", "face3Color", "backColor", "handColor", "hand2Color",
              "topTint", "topAccent", "outfitColor", "outfitAccent", "hairTie", "auraColor")
LOOK_COLORS = {"skin": "skins", "hairColor": "hairColors", "topColor": "clothColors", "bottomColor": "clothColors",
               "shoeColor": "clothColors", "eyeColor": "eyeColors", "sockColor": "clothColors", "pupilColor": "pupilColors"}
LOOK_CHOICES = {"eyes": "eyeStyles", "height": "heights", "build": "builds", "shoes": "shoeStyles", "socks": "sockStyles"}
# racing vehicles you can pick in the garage (all race the same; it's how you look doing it)
VEHICLE_TYPES = ("kart", "moto", "buggy", "f1", "truck")


def vehicle_of(p):
    v = p.get("vehicle") or {}
    return {"type": v.get("type", "kart"), "color": v.get("color", p["color"]), "accent": v.get("accent", "#23263f")}


LOOK_EXTRAS = {"pet": "pet_none", "mount": "mount_none", "bottom": "bottom_pants", "outfit": "outfit_none", "hand": "hand_none", "hand2": "hand_none",
               "hat2": "hat_none", "hat3": "hat_none", "face2": "face_none", "face3": "face_none", "shoeColor": "#23263f", "eyeColor": "#1d1b2e", "pupilColor": "#15131f", "eyes": "eyes_round",
               "shoes": "shoes_sneakers", "socks": "socks_none", "sockColor": "#f5f5f5",
               "height": "height_medium", "build": "build_regular"}
STAT_KEYS = ("wins", "elims", "raceWins", "arenaWins", "fish", "koi", "archeryBest", "jackpots", "bossKills", "houseLikes",
             "doodleWins", "bumperWins", "dungeonBest", "mythic")

SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"]
SLOT_WEIGHTS = [30, 25, 20, 13, 8, 4]
SLOT_TRIPLE = {"🍒": 5, "🍋": 8, "🔔": 12, "⭐": 20, "💎": 40, "7️⃣": 77}
WHEEL = [0, 1.5, 0, 0, 0.5, 0, 2, 0, 0, 1.5, 0, 0.5, 0, 0, 0, 5]  # multipliers, clockwise from the top
# The house always wins (eventually): the casino is rigged in its favour. Rough paybacks per coin bet:
# coin flip 80%, slots ~55%, wheel 50%, blackjack ~81%, roulette ~63%.
COINFLIP_WIN = 0.4           # chance you call the coin right
SLOT_PAIR_PAYS = 0.5         # a pair gives back half your bet
SLOT_NEAR_MISS = 0.35        # a winning line that slips to a near miss at the last reel
WHEEL_ZERO_WEIGHT = 1.6      # the empty slices come up more often
BJ_DEALER_LUCK = 0.5         # chance the dealer's busting card is swapped for another
# ---- Coral Cove (the beach town) ----
MATCH_COURTS = {  # first to `to` points, or whoever's ahead after `time` seconds; up to `max` a side
    "bb1": {"to": 11, "time": 240, "max": 3}, "bb2": {"to": 11, "time": 240, "max": 3},
    "soccer": {"to": 5, "time": 300, "max": 5},
}
STEAL_CHANCE = 0.4
GOLF_PARS = (3, 3, 4, 3, 4, 5)
CRAB_NAMES = ["Pinchy", "Sandy", "Clawdia", "Sir Scuttle"]
CRAB_BET_T, CRAB_RACE_T, CRAB_PAUSE_T = 20, 9.5, 6
CRAB_PAYS = 3.5               # 4 crabs, so a fair price would be 4x
CRAB_BETS = (10, 50, 100, 250, 500)
ROULETTE_HOUSE = 0.35        # chance a spin lands on whatever pays the table least
MAX_BET = 5000
BJ_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
BJ_SUITS = ["♠", "♥", "♦", "♣"]
BJ_DECKS = 4
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
        self.accounts = {}  # username (lower case) -> {name, salt, hash, tokens, zones: {code: member key}}
        self.dirty = False
        if path.exists():
            data = json.loads(path.read_text("utf-8"))
            self.zones = data.get("zones", {})
            self.accounts = data.get("accounts", {})
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
        tmp.write_text(json.dumps({"zones": self.zones, "accounts": self.accounts}, ensure_ascii=False, indent=1), "utf-8")
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

def hash_password(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 120_000).hex()


# the arcade cabinets: highest believable score, coins per point, and the most coins one run can pay
ARCADE_GAMES = {
    "snake": {"name": "Snake", "max": 2000, "pay": 1.0, "cap": 60},
    "breakout": {"name": "Brick Breaker", "max": 20000, "pay": 0.06, "cap": 60},
    "flappy": {"name": "Flappy Friend", "max": 2000, "pay": 2.0, "cap": 60},
    "blocks": {"name": "Block Drop", "max": 500000, "pay": 0.02, "cap": 80},
    "merge": {"name": "2048", "max": 400000, "pay": 0.01, "cap": 80},
    "hop": {"name": "Sky Hop", "max": 100000, "pay": 0.03, "cap": 60},
    "surf": {"name": "Surf Rush", "max": 60000, "pay": 0.02, "cap": 70},  # (played at the surf shack in Coral Cove)
    "second": {"name": "One Second", "max": 1000, "pay": 0.06, "cap": 60},
    "memory": {"name": "Memory Match", "max": 5000, "pay": 0.03, "cap": 50},
    "blaster": {"name": "Star Blaster", "max": 100000, "pay": 0.01, "cap": 70},
    "whack": {"name": "Whack-a-Mole", "max": 5000, "pay": 0.03, "cap": 60},
    "skeeball": {"name": "Skee-Ball", "max": 900, "pay": 0.12, "cap": 90},  # (the lanes in the middle of the Arcade)
    "hockey": {"name": "Air Hockey", "max": 800, "pay": 0.1, "cap": 80},
}
# Laser Tag (through the doorway in the Arcade): a dark 3D maze, two teams, hitscan blasters. Tagging
# someone is +100 points, getting tagged is -50 (and stuns you for a moment). Rounds are timed; at the
# end everyone gets tickets for their points, and the winning team gets a bonus.
LT_W, LT_H = 1600, 1200
LT_ROUND = 180
LT_BREAK = 8        # the results screen
LT_PICK = 15        # then everyone picks a team before the next round starts
LT_TAG_PTS, LT_HIT_PTS = 100, 50
LT_STUN = 2.0
LT_TEAMS = ("red", "blue")
_DECK = (2.35, 2.6)  # the upstairs floor: underside and top (world units)
LT_MAP = {
    "id": "neon2", "name": "Neon Towers", "w": LT_W, "h": LT_H, "ceiling": 6.4,
    # solid boxes [x, y, w, h, bottom, top]: x/y/w/h in arena px (20 px = 1 world unit), heights in world units
    "solids": [
        # upstairs: a deck along the top and bottom, joined by a bridge over the middle
        [500, 80, 600, 200, *_DECK], [500, 920, 600, 200, *_DECK], [740, 280, 120, 640, *_DECK],
        # their legs
        [510, 240, 30, 30, 0, 2.35], [1060, 240, 30, 30, 0, 2.35], [510, 930, 30, 30, 0, 2.35], [1060, 930, 30, 30, 0, 2.35],
        [785, 430, 30, 30, 0, 2.35], [785, 740, 30, 30, 0, 2.35],
        # rails upstairs (low: crouch-height cover up there)
        [500, 272, 240, 8, 2.6, 3.4], [860, 272, 240, 8, 2.6, 3.4], [500, 920, 240, 8, 2.6, 3.4], [860, 920, 240, 8, 2.6, 3.4],
        [740, 330, 8, 540, 2.6, 3.4], [852, 330, 8, 540, 2.6, 3.4],
        [620, 140, 60, 60, 2.6, 4.2], [920, 980, 60, 60, 2.6, 4.2],  # crates on the decks
        # downstairs: tall walls
        [250, 330, 40, 220, 0, 2.8], [250, 650, 40, 220, 0, 2.8], [1310, 330, 40, 220, 0, 2.8], [1310, 650, 40, 220, 0, 2.8],
        [420, 520, 160, 40, 0, 2.8], [1020, 640, 160, 40, 0, 2.8], [560, 360, 40, 140, 0, 2.8], [1000, 700, 40, 140, 0, 2.8],
        [600, 700, 40, 140, 0, 2.8], [960, 360, 40, 140, 0, 2.8], [320, 210, 40, 100, 0, 2.8], [1240, 890, 40, 100, 0, 2.8],
        # and low cover to lie down behind
        [130, 560, 100, 80, 0, 1.1], [1370, 560, 100, 80, 0, 1.1], [650, 560, 80, 80, 0, 1.1], [870, 560, 80, 80, 0, 1.1],
        [400, 250, 90, 60, 0, 1.1], [1110, 890, 90, 60, 0, 1.1], [400, 890, 90, 60, 0, 1.1], [1110, 250, 90, 60, 0, 1.1],
        [690, 380, 70, 70, 0, 1.1], [840, 750, 70, 70, 0, 1.1],
    ],
    # stairs [x, y, w, h, direction it climbs ("+x" or "-x"), top height]: up to each end of both decks
    "stairs": [[300, 100, 200, 80, "+x", 2.6], [1100, 100, 200, 80, "-x", 2.6], [300, 1020, 200, 80, "+x", 2.6], [1100, 1020, 200, 80, "-x", 2.6]],
    "spawns": {"red": [[70, 150], [70, 450], [70, 750], [70, 1050], [160, 300], [160, 900]],
               "blue": [[1530, 150], [1530, 450], [1530, 750], [1530, 1050], [1440, 300], [1440, 900]]},
}

# inside the Arcade a go on a cabinet costs coins and pays out tickets (spent at the prize counter);
# Surf Rush at the beach is still free and pays coins
ARCADE_PLAY_COST = 10
CLAW_COST = 25
CLAW_RARITY = {"common": 1.0, "rare": 0.7, "epic": 0.45}  # rarer plushies are harder to grab
CLAW_PLUSH_CHANCE = 0.04  # of a win: also the claw-only plushie you can hold, if you haven't got one
# the prize counter: a new line-up every hour, a couple of ticket-only exclusives plus regular cosmetics
TICKET_PRICES = {"common": 150, "rare": 400, "epic": 900, "legendary": 2200, "mythic": 4500}
TICKET_SHOP_SIZE, TICKET_SHOP_EXCLUSIVES = 6, 2


def ticket_shop(hour):
    rng = random.Random(f"tickets-{hour}")
    regular = sorted(i["id"] for i in CATALOG["items"] if i.get("crate") and not i.get("exclusive"))
    special = sorted(i["id"] for i in CATALOG["items"] if i.get("tickets"))
    picks = rng.sample(special, min(TICKET_SHOP_EXCLUSIVES, len(special))) + rng.sample(regular, min(TICKET_SHOP_SIZE, len(regular)))
    return [{"id": i, "price": ITEMS[i].get("tix") or TICKET_PRICES.get(ITEMS[i]["rarity"], 500), "ex": bool(ITEMS[i].get("tickets"))} for i in picks]
# what a slot goes back to if you trade away the thing you're wearing
TRADE_FALLBACK = {"hair": "hair_short", "top": "top_tee", "bottom": "bottom_pants", "pet": "pet_none"}

# Admin mode: type "/admin <password>" in chat. Only a salted hash of the password lives here; set
# FZ_ADMIN_PASSWORD in the environment to use a different one.
ADMIN_SALT = "9f3c1a7e5b2d4c86"
ADMIN_HASH = "2934a976ed4535a241389018d6ef8bf92946d5a76726cc45855dc8a3f4d59595"


def admin_password_ok(pw):
    if os.environ.get("FZ_ADMIN_PASSWORD"):
        return hmac.compare_digest(pw.encode(), os.environ["FZ_ADMIN_PASSWORD"].encode())
    got = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(ADMIN_SALT), 200_000).hex()
    return hmac.compare_digest(got, ADMIN_HASH)


ADMIN_HELP = [
    "/give <name|me|all> <coins> — give coins",
    "/take <name|me> <coins> — take coins away",
    "/setcoins <name|me> <coins> — set someone's coins",
    "/xp <name|me> <amount> — give XP",
    "/item <name|me> <item id|all> — give a cosmetic (or every one)",
    "/furni <name|me> <furniture id|all> [count] — give furniture, floors or wallpaper",
    "/items [search] — list item ids",
    "/score <name|me> <game> <value> — set a high score / leaderboard stat (/score me list for the games)",
    "/tp <name> — teleport yourself to someone (in town, or into the shop/area they're in)",
    "/bring <name> — teleport someone to you",
    "/kick <name> — send someone back to the home screen",
    "/boot <name> [minutes] — kick someone off the whole server (every zone) and keep them out (default 10 min)",
    "/unboot <name> — let someone booted come back early",
    "/announce <message> — post to the zone news",
    "/players — who's here, with coins",
    "/rain <on|off|auto> — rain on or off",
    "/weather <sunny|cloudy|windy|rain|storm|auto> — change the weather",
    "/filter <on|off> — the chat filter for this zone (on by default)",
    "/unadmin — turn admin mode off",
]


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
        **LOOK_EXTRAS,
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
        taken.add((it["x"], it["y"], w, d))
    for y in range(HOUSE_SIZE):
        for x in range(HOUSE_SIZE):
            if not any(tx < x + 1 and x < tx + w and ty < y + 1 and y < ty + d for tx, ty, w, d in taken):
                p["house"]["items"].append({"id": "closet", "x": x, "y": y, "r": 0})
                return


def grow_house(h):
    """Houses from before sizes existed move into the bigger default room (everything keeps its spot;
    anything on the front wall where the door now is goes back in the inventory)."""
    if "size" in h:
        return
    h["size"] = [HOUSE_SIZE, HOUSE_SIZE]
    door = (HOUSE_SIZE / 2 - 1, HOUSE_SIZE / 2 + 1)
    keep = []
    for it in h["items"]:
        f = FURN.get(it["id"])
        if f and f.get("kind") == "wall" and it["r"] % 4 == 2 and it["x"] < door[1] and it["x"] + f["w"] > door[0]:
            continue
        keep.append(it)
    h["items"] = keep


# doors used to come in their own 2-tile block of wall; now a door is put into a wall you've drawn
LEGACY_DOORS = {"room_doorway": "wdoor_arch", "room_door": "wdoor_wood", "room_door_glass": "wdoor_glass", "room_door_barn": "wdoor_barn"}


def migrate_doors(p):
    for old, new in LEGACY_DOORS.items():
        if p["furni"].get(old):
            p["furni"][new] = p["furni"].get(new, 0) + p["furni"].pop(old)
    items = []
    for it in p["house"]["items"]:
        new = LEGACY_DOORS.get(it.get("id"))
        if not new:
            items.append(it)
            continue
        x, y, r = it["x"], it["y"], it.get("r", 0) % 4
        items.append({"id": "room_wall", "x": x, "y": y, "r": r % 2, "l": 2})
        items.append({"id": new, "x": snap_q(x + 0.375) if r % 2 == 0 else x, "y": y if r % 2 == 0 else snap_q(y + 0.375), "r": r % 2})
    p["house"]["items"] = items


def migrate(p):
    """Fill in fields added after a profile was first saved."""
    p.setdefault("look", default_look(p.get("color")))
    p.setdefault("lookSet", False)
    for field, value in LOOK_EXTRAS.items():
        p["look"].setdefault(field, value)
    # items that were taken out of the game (e.g. the tutu) fall back to the default for their slot
    for slot, fallback in (("bottom", "bottom_pants"), ("outfit", "outfit_none")):
        if p["look"].get(slot) not in ITEMS:
            p["look"][slot] = fallback
    p.setdefault("owned", [])
    p.setdefault("fishdex", {})
    p.setdefault("fishbag", [])   # caught fish waiting to be sold at the Fish Market: {id, name, size}
    # fish that were renamed when the ocean got its own fish
    for old, new in FISH_RENAMED.items():
        if old in p["fishdex"]:
            was = p["fishdex"].pop(old)
            cur = p["fishdex"].setdefault(new, {"n": 0, "best": 0})
            cur["n"] += was.get("n", 0)
            cur["best"] = max(cur["best"], was.get("best", 0))
    for f in p["fishbag"]:
        f["name"] = FISH_RENAMED.get(f["name"], f["name"])
    p.setdefault("rods", ["rod_twig"])
    p.setdefault("rod", "rod_twig")
    p.setdefault("furni", {f["id"]: 1 for f in CATALOG["furniture"] if f.get("starter")})
    p.setdefault("house", default_house())
    give_closet(p)
    grow_house(p["house"])
    migrate_doors(p)
    for stat in STAT_KEYS:
        p["stats"].setdefault(stat, 0)
    return p


def new_player(name, color, account=None):
    return migrate({
        "key": name.lower(), "name": name, "color": color, "tokens": [], **({"account": account} if account else {}),
        "coins": START_COINS, "xp": 0, "lastDaily": 0, "created": int(time.time()), "stats": {},
    })


def owns(p, item_id):
    item = ITEMS.get(item_id)
    return bool(item) and (item.get("free") or item_id in p["owned"])


def owns_deco(p, deco_id):
    """Floors and wallpapers: free ones, or bought (stored in the furniture inventory)."""
    deco = FLOORS.get(deco_id) or WALLS.get(deco_id) or CEILINGS.get(deco_id) or DOORS.get(deco_id)
    return bool(deco) and (deco.get("free") or p["furni"].get(deco_id, 0) > 0)


def max_house(p):
    """The biggest room this player can have (width, depth), from the size upgrades they own."""
    sizes = [s for s in HOUSE_SIZES.values() if s.get("free") or p["furni"].get(s["id"], 0) > 0]
    return max(s["w"] for s in sizes), max(s["d"] for s in sizes)


def house_dims(h):
    w, d = (h.get("size") or [OLD_HOUSE_SIZE, OLD_HOUSE_SIZE])[:2]
    return int(w), int(d)


def met(p, cond):
    if "level" in cond:
        return level_for(p["xp"]) >= cond["level"]
    return p["stats"].get(cond["stat"], 0) >= cond["min"]


HOUSE_SNAP = 4  # furniture snaps to quarter tiles


def snap_q(v):
    try:
        v = round(float(v) * HOUSE_SNAP) / HOUSE_SNAP
    except (TypeError, ValueError):
        return -1
    return int(v) if v == int(v) else v


def clean_house(p, data):
    """Validate a house layout from the client: ownership, bounds and overlaps."""
    floor, wall, ceiling = data.get("floor"), data.get("wall"), data.get("ceiling") or "ceil_plain"
    if floor not in FLOORS or not owns_deco(p, floor) or wall not in WALLS or not owns_deco(p, wall):
        raise GameError("You don't own that floor or wallpaper yet.")
    if ceiling not in CEILINGS or not owns_deco(p, ceiling):
        raise GameError("You don't own that ceiling yet.")
    door = data.get("door") or "door_classic"
    if door not in DOORS or not owns_deco(p, door):
        raise GameError("You don't own that door yet.")
    try:
        W, D = (int(v) for v in (data.get("size") or [HOUSE_SIZE, HOUSE_SIZE])[:2])
    except (TypeError, ValueError):
        raise GameError("That isn't a room size.")
    max_w, max_d = max_house(p)
    if not (HOUSE_MIN <= W <= max_w and HOUSE_MIN <= D <= max_d):
        raise GameError("Buy a bigger house upgrade first!")
    door_x = (W / 2 - 1, W / 2 + 1)
    items = data.get("items")
    if not isinstance(items, list) or len(items) > HOUSE_MAX_ITEMS:
        raise GameError(f"A house can hold up to {HOUSE_MAX_ITEMS} things.")
    used, taken, clean_items = {}, set(), []
    wall_cells, door_cells = set(), []  # (every door has to sit inside a wall)
    drawn, hanging = [], []  # the walls you've built, and what hangs on them (each must be on one)
    for it in items:
        f = FURN.get(it.get("id")) if isinstance(it, dict) else None
        if not f:
            raise GameError("Unknown furniture.")
        # positions snap to quarter tiles; overlaps are checked on that finer grid
        x, y, r = snap_q(it.get("x", -1)), snap_q(it.get("y", -1)), int(it.get("r", 0)) % 4
        used[f["id"]] = used.get(f["id"], 0) + 1
        # free things (plain walls) don't need buying, they just have a limit
        if used[f["id"]] > (f.get("max", 99) if f.get("free") else p["furni"].get(f["id"], 0)):
            raise GameError(f"You don't have another {f['name']}.")
        kind = f.get("kind", "floor")
        h = None
        iw = kind == "wall" and bool(it.get("iw"))
        dg = False
        if iw:
            # on one of your own walls: r is the way it faces; along the wall from `start`, against the
            # face at `face` (x for walls running across, y for walls running up and down... see the client)
            start, face = (x, y) if r % 2 == 0 else (y, x)
            wh = f.get("wh", 1)
            h = snap_q(it.get("h", HOUSE_WALL_Y))
            if not (wh / 2 - 0.01 <= h <= HOUSE_WALL_H - wh / 2 + 0.01):
                raise GameError("That doesn't fit on the wall.")
            rows = range(round((h - wh / 2) * HOUSE_SNAP), round((h + wh / 2) * HOUSE_SNAP))
            cells = {("wall", "iw", round(face * HOUSE_SNAP), r, round(start * HOUSE_SNAP) + i, j) for i in range(round(f["w"] * HOUSE_SNAP)) for j in rows}
            hanging.append((f["name"], r % 2, face, start, f["w"]))
        elif kind == "wall":
            # which wall: r 0 back (column x), 1 left (row y), 2 front (column x), 3 right (row y); h: how
            # high its middle is. The wall is a grid too, so things can stack up it.
            start = x if r % 2 == 0 else y
            x, y = (x, 0) if r % 2 == 0 else (0, y)
            wh = f.get("wh", 1)
            h = snap_q(it.get("h", HOUSE_WALL_Y))
            if not (wh / 2 - 0.01 <= h <= HOUSE_WALL_H - wh / 2 + 0.01):
                raise GameError("That doesn't fit on the wall.")
            rows = range(round((h - wh / 2) * HOUSE_SNAP), round((h + wh / 2) * HOUSE_SNAP))
            cells = {("wall", r, round(start * HOUSE_SNAP) + i, j) for i in range(round(f["w"] * HOUSE_SNAP)) for j in rows}
            if start < 0 or start + f["w"] > (W if r % 2 == 0 else D):
                raise GameError("That doesn't fit on the wall.")
            if r == 2 and start < door_x[1] and start + f["w"] > door_x[0] and h - wh / 2 < HOUSE_DOOR_H - 0.01:
                raise GameError("That's where the door is.")
        else:
            if kind == "ceiling":  # h: how far below the ceiling it hangs
                h = snap_q(it.get("h", 0))
                if not (0 <= h <= HOUSE_MAX_DROP):
                    raise GameError("That can't hang that low.")
            length = f["w"]
            if f.get("drag"):  # plain walls are drawn out to any length (in quarter tiles)
                length = snap_q(it.get("l", f["w"]))
                if not (0.25 <= length <= max(W, D)):
                    raise GameError("That wall is the wrong length.")
            w, d = (length, f["d"]) if r % 2 == 0 else (f["d"], length)
            # furniture turned 45° takes up the square it fits in (walls and doors only turn in quarters)
            dg = bool(it.get("dg")) and not f.get("room") and kind != "door"
            if x < 0 or y < 0 or x + w > W or y + d > D:
                raise GameError("That doesn't fit in the room.")
            x0, y0 = round(x * HOUSE_SNAP), round(y * HOUSE_SNAP)
            spots = [(x0 + i, y0 + j) for i in range(round(w * HOUSE_SNAP)) for j in range(round(d * HOUSE_SNAP))]
            cells = {(kind, a, b) for a, b in spots}
            if kind == "floor":
                # chairs tuck in under tables and desks (the same rules as the house editor)
                layers, check = (("chair",), ("chair", "solid")) if f.get("tuck") else (("floor",), ("floor",)) if f.get("desk") else (("floor", "solid"), ("floor", "chair"))
                cells = {(l, a, b) for l in layers for a, b in spots}
                if {(l, a, b) for l in check for a, b in spots} & taken:
                    raise GameError("Things can't overlap.")
            if f.get("drag") and not f.get("wallH"):  # (doors and wall decorations go on full-height walls)
                wall_cells |= {(c[1], c[2]) for c in cells}
                drawn.append((r % 2, x if r % 2 == 0 else y, length, y if r % 2 == 0 else x))
            if kind == "door":
                door_cells.append((f["name"], {(c[1], c[2]) for c in cells}))
        if kind != "floor" and cells & taken:
            raise GameError("Things can't overlap.")
        taken |= cells
        clean_items.append({"id": f["id"], "x": x, "y": y, "r": r, **({"h": h} if h is not None else {}), **({"l": length} if kind == "floor" and f.get("drag") else {}), **({"iw": 1} if iw else {}), **({"dg": 1} if kind != "wall" and dg else {}),
                            **({"c": it["c"]} if f.get("recolor") and it.get("c") in CATALOG["clothColors"] else {})})
    for name, cells in door_cells:
        if not cells <= wall_cells:
            raise GameError(f"The {name} has to go in a wall.")
    for name, axis, face, start, w in hanging:
        if not any(a == axis and face in (perp, perp + 0.25) and ws <= start and start + w <= ws + l for a, ws, l, perp in drawn):
            raise GameError(f"The {name} has to hang on a wall.")
    # rooms with their own floor: a floor you own and a spot in the room (it fills out to the walls)
    areas = data.get("areas") or []
    if not isinstance(areas, list) or len(areas) > 24:
        raise GameError("That's too many painted rooms.")
    def painted(spots, kinds, what):
        """Rooms painted with their own floor / ceiling: one you own, and a spot in the room (it fills out to the walls)."""
        if not isinstance(spots, list) or len(spots) > 24:
            raise GameError("That's too many painted rooms.")
        out = []
        for a in spots:
            fid = a.get("f") if isinstance(a, dict) else None
            if fid not in kinds or not owns_deco(p, fid):
                raise GameError(f"You don't own that {what} yet.")
            ax, ay = snap_q(a.get("x", -1)), snap_q(a.get("y", -1))
            if not (0 <= ax < W and 0 <= ay < D):
                raise GameError("That's outside the house.")
            out.append({"f": fid, "x": ax, "y": ay})
        return out
    clean_areas = painted(areas, FLOORS, "floor")
    clean_careas = painted(data.get("careas") or [], CEILINGS, "ceiling")
    # single walls with their own wallpaper: which face -> which wallpaper
    wallp = data.get("wallp") or {}
    if not isinstance(wallp, dict) or len(wallp) > 64:
        raise GameError("That's too many painted walls.")
    clean_wallp = {}
    for k, v in wallp.items():
        if not isinstance(k, str) or len(k) > 40 or v not in WALLS or not owns_deco(p, v):
            raise GameError("You don't own that wallpaper yet.")
        clean_wallp[k] = v
    trim = data.get("trim") if data.get("trim") in TRIM_COLORS else "#f4f0ff"
    return {"floor": floor, "wall": wall, "ceiling": ceiling, "door": door, "size": [W, D], "items": clean_items,
            "areas": clean_areas, "careas": clean_careas, "wallp": clean_wallp, "trim": trim}


def house_view(p):
    h = p["house"]
    return {"floor": h["floor"], "wall": h["wall"], "ceiling": h.get("ceiling", "ceil_plain"), "door": h.get("door", "door_classic"),
            "size": list(house_dims(h)), "items": h["items"], "likes": h["likes"], "areas": h.get("areas", []),
            "careas": h.get("careas", []), "wallp": h.get("wallp", {}), "trim": h.get("trim", "#f4f0ff")}


def public(p, client):
    return {
        "key": p.get("key", p["name"].lower()), "name": p["name"], "color": p["color"],
        "coins": p["coins"], "tickets": p.get("tickets", 0), "xp": p["xp"], "level": level_for(p["xp"]), "stats": p["stats"],
        "look": p["look"], "lookSet": p["lookSet"], "owned": p["owned"], "fishdex": p["fishdex"], "fishbag": p.get("fishbag", []), "rods": p["rods"], "rod": p["rod"],
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
        self.aseat = None  # [furniture index, seat] while sitting on something in a house
        self.apose = None  # what you're doing in a 3D area others should see: {"p": pose, "v": vehicle id…}
        self.pose = None  # e.g. fishing at the pond, sitting on a bench
        self.pose_extra = {}
        self.cooldowns = {}
        self.failed_pins = 0
        self.account = None  # the signed-in account's username, if any
        self.admin = False
        self.admin_fails = 0
        self.dgn = None  # the dungeon run this player is in (each group gets its own)
        self.hooked = None  # the fish on your line right now (decided when it bites)

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
        self.arena_map = int(os.environ.get("FZ_ARENA_MAP", 0))  # index into ARENA_MAPS
        self.arena_break = 0.0      # while now < this, it's the scoreboard break between rounds
        self.dungeons = []  # live DungeonRun instances
        self.weather_override = None  # admin /weather (or /rain); None follows the forecast
        self.rain_sent = None
        self.arena_items = {}
        self.arena_item_seq = 0
        self.arena_spawning = False
        self.lt = {}            # laser tag: player key -> {team, x, y, a, score, tags, hits, stun, spawn}
        self.lt_round = 0       # bumps every round (stale timers check it)
        self.lt_end = 0.0       # when this round ends (0: no round running)
        self.lt_break = 0.0     # while now < this, it's the scoreboard break
        self.lt_pick = 0.0      # while now < this, everyone picks a team (then the round starts)
        self.lt_tags = {"red": 0, "blue": 0}
        self.doodle = {"id": 0, "state": "idle", "queue": [], "turn": -1, "drawer": None, "word": None, "choices": [],
                       "ends": 0.0, "dur": 0, "guessed": {}, "scores": {}, "strokes": [], "shown": set(), "ranking": []}
        self.trades = {}      # id -> a live trade between two people in the tavern
        self.trade_seq = 0
        self.roulette = {"id": 0, "state": "idle", "ends": 0.0, "bets": {}, "history": [], "result": None}
        self.balls = {}   # Coral Cove: id -> last known state
        self.matches = {}  # Coral Park court -> the pickup game played on it
        self.courts = {}  # Coral Cove: court -> {"s": [home, away]}
        self.boats = {}   # Coral Cove: id -> {"driver", x, z, h, v}
        self.crabs = {"id": 0, "state": "idle", "ends": 0.0, "bets": {}, "times": [], "winner": None, "history": []}

    def in_scene(self, scene):
        return [k for k, c in self.clients.items() if c.scene == scene]

    def broadcast(self, msg, scene=None, exclude=None):
        data = encode(msg)
        for c in list(self.clients.values()):
            if c is not exclude and (scene is None or c.scene == scene):
                c.ws.send_raw(data)


class DungeonRun:
    """One group's private dungeon. It stands in for the Room in the dungeon code: "boss" scene messages
    only go to this run's members, everything else (feed, zone, clients) is the real room."""

    def __init__(self, room):
        self.room = room
        self.members = set()
        self.boss = {"fighters": {}, "b": None, "task": None, "state": "lobby", "floor": 0, "ends": 0.0, "mobs": {},
                     "mob_id": 0, "queue": [], "spawn_at": 0.0, "dmg": {}, "ran": set(), "last": None, "mvp": None}

    def __getattr__(self, name):
        return getattr(self.room, name)

    def in_scene(self, scene):
        keys = self.room.in_scene(scene)
        return [k for k in keys if k in self.members] if scene == "boss" else keys

    def broadcast(self, msg, scene=None, exclude=None):
        if scene != "boss":
            return self.room.broadcast(msg, scene=scene, exclude=exclude)
        data = encode(msg)
        for k in list(self.members):
            c = self.room.clients.get(k)
            if c and c is not exclude and c.scene == "boss":
                c.ws.send_raw(data)


# --------------------------------------------------------------------------
# Game logic
# --------------------------------------------------------------------------

PRE_AUTH = {"create", "join", "resume", "zones_online", "signup", "signin", "account_resume", "signout", "play", "play_public"}
IN_ZONE = {
    "leave_zone", "scene", "move", "chat", "emote", "fish", "archery", "gamble", "daily", "rename", "quit_zone",
    "look", "buy", "crate", "pet_egg", "rod", "bj_deal", "bj_hit", "bj_stand", "bj_double",
    "race_join", "race_leave", "race_start", "race_ready", "race_vehicle", "race_pos", "race_done", "race_item", "race_hit", "arena_move", "arena_shoot", "arena_hit",
    "boss_move", "boss_shoot", "boss_hit", "boss_hurt", "boss_start", "boss_pick", "arena_pick", "arena_shield_pop", "area_move", "area_sit", "area_pose", "crab_bet", "ball", "ball_steal", "ball_event", "court_join", "court_ready", "court_leave", "court_score", "golf_done", "boat", "boat_take", "boat_leave", "pose",
    "doodle_start", "doodle_pick", "doodle_draw", "doodle_undo", "doodle_clear", "doodle_guess",
    "play_public", "lt_move", "lt_shoot", "lt_team", "arcade_score", "arcade_play", "claw_play", "ticket_shop", "ticket_buy", "trade_ask", "trade_answer", "trade_offer", "trade_ready", "trade_cancel", "roulette_bet", "roulette_clear", "roulette_sync",
    "house_get", "house_save", "house_buy", "house_like", "fish_sell", "fish_hook",
}


class Game:
    def __init__(self, store):
        self.store = store
        self.rooms = {}
        self.booted = {}  # player name (lowercase) -> when they may come back (admin /boot, server-wide)

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

    # ---- accounts ----------------------------------------------------------

    def account_view(self, user):
        """What the home screen shows when you're signed in: your name and the zones you're in."""
        acct = self.store.accounts[user]
        zones = []
        for code, key in list(acct["zones"].items()):
            zone = self.store.zones.get(code)
            member = zone and zone["players"].get(key)
            if not member:  # (the zone closed, or you left it)
                acct["zones"].pop(code, None)
                continue
            room = self.rooms.get(code)
            zones.append({"code": code, "zoneName": zone["name"], "name": member["name"], "online": len(room.clients) if room else 0})
        return {"t": "account", "name": acct["name"], "zones": zones, "public": self.public_online()}

    def sign_in_as(self, c, user, token=None):
        acct = self.store.accounts[user]
        if token is None:
            token = secrets.token_urlsafe(24)
            acct["tokens"] = (acct["tokens"] + [token])[-10:]
            self.store.mark()
        c.account = user
        c.ws.send({**self.account_view(user), "token": token})

    def on_signup(self, c, m):
        if not c.ready("signup", 3):
            raise GameError("Hang on a moment and try again.")
        name, pw = clean(m.get("username"), 16), str(m.get("password", ""))
        if not USERNAME_RE.match(name):
            raise GameError("Usernames are 3–16 letters, numbers, - or _ (no spaces).")
        if is_rude(name):
            raise GameError("That username has a word that isn't allowed. Keep it friendly!")
        if not PASSWORD_MIN <= len(pw) <= PASSWORD_MAX:
            raise GameError(f"Your password needs to be at least {PASSWORD_MIN} characters.")
        user = name.lower()
        if user in self.store.accounts:
            raise GameError("That username is taken. Try another, or sign in if it's yours.")
        salt = secrets.token_hex(16)
        self.store.accounts[user] = {"name": name, "salt": salt, "hash": hash_password(pw, salt), "tokens": [], "zones": {}, "created": int(time.time())}
        self.store.mark()
        self.sign_in_as(c, user)

    def on_signin(self, c, m):
        user, pw = clean(m.get("username"), 16).lower(), str(m.get("password", ""))
        acct = self.store.accounts.get(user)
        if not acct or not hmac.compare_digest(acct["hash"], hash_password(pw, acct["salt"])):
            c.failed_pins += 1
            if c.failed_pins >= 8:
                c.ws.close()
            raise GameError("That username and password don't match.")
        self.sign_in_as(c, user)

    def on_account_resume(self, c, m):
        """Signing back in on a device that's been signed in before (it keeps a token, not your password)."""
        user, token = clean(m.get("username"), 16).lower(), str(m.get("token", ""))
        acct = self.store.accounts.get(user)
        if not acct or not token or token not in acct["tokens"]:
            raise GameError("Please sign in again.")
        self.sign_in_as(c, user, token)

    def on_signout(self, c, m):
        acct = self.store.accounts.get(c.account or "")
        token = str(m.get("token", ""))
        if acct and token in acct["tokens"]:
            acct["tokens"].remove(token)
            self.store.mark()
        c.account = None
        c.ws.send({"t": "signed_out"})

    def on_play(self, c, m):
        """Open one of your account's zones (no name or PIN needed)."""
        acct = self.store.accounts.get(c.account or "")
        if not acct:
            raise GameError("Sign in first.")
        code = str(m.get("code", "")).upper()
        key = acct["zones"].get(code)
        zone = self.store.zones.get(code)
        if not key or not zone or key not in zone["players"]:
            acct["zones"].pop(code, None)
            raise GameError("You're not in that zone any more.")
        self.enter(c, code, key)

    def public_zone(self):
        zone = self.store.zones.get(PUBLIC_CODE)
        if not zone:
            zone = {"code": PUBLIC_CODE, "name": "FriendZone Online", "owner": "", "public": True, "created": int(time.time()), "players": {}}
            self.store.zones[PUBLIC_CODE] = zone
            self.store.mark()
        return zone

    def public_rooms(self):
        return [r for k, r in self.rooms.items() if k.startswith(PUBLIC_CODE + "#")]

    def public_online(self):
        return sum(len(r.clients) for r in self.public_rooms())

    def public_room(self, key):
        """Which online server you go in: the one you're already in (coming back after a blip), else the
        busiest one with space (so people end up together), else a new one."""
        rooms = self.public_rooms()
        for r in rooms:
            if key in r.clients:
                return r
        open_ = [r for r in rooms if len(r.clients) < PUBLIC_MAX]
        if open_:
            return max(open_, key=lambda r: len(r.clients))
        n = 1
        while f"{PUBLIC_CODE}#{n}" in self.rooms:
            n += 1
        room = Room(self.public_zone())
        room.server = n
        self.rooms[f"{PUBLIC_CODE}#{n}"] = room
        return room

    def on_play_public(self, c, m):
        """Join the online world (your progress there is saved to your account)."""
        if c.room and not m.get("hop"):  # (already in a zone: only "New server" makes sense)
            return
        acct = self.signed_in(c)
        zone = self.public_zone()
        key = c.account
        if key not in zone["players"]:
            zone["players"][key] = new_player(acct["name"], self.zone_color(m), c.account)
            self.store.mark()
        if m.get("hop"):
            # "New server": move to a different copy of the world with space, to play with other people
            here = c.room if c.room and c.room.zone is zone else None
            others = [r for r in self.public_rooms() if r is not here and len(r.clients) < PUBLIC_MAX]
            if not others:
                raise GameError("There aren't any other servers with space right now. Try again in a bit!")
            self.leave(c)
            self.enter(c, PUBLIC_CODE, key, room=max(others, key=lambda r: len(r.clients)))
            return
        self.enter(c, PUBLIC_CODE, key)

    def link_account(self, c, code, key):
        """Tie a zone profile to the signed-in account (once it's yours, it's yours on every device)."""
        acct = self.store.accounts.get(c.account or "")
        player = self.store.zones[code]["players"][key]
        if not acct or player.get("account") not in (None, c.account):
            return
        if player.get("account") != c.account or acct["zones"].get(code) != key:
            player["account"] = c.account
            acct["zones"][code] = key
            self.store.mark()

    # ---- joining zones ---------------------------------------------------

    def on_zones_online(self, c, m):
        """The home screen asks how many people are in each of your saved zones right now."""
        if not c.ready("zones_online", 2):
            return
        raw = m.get("codes") or []
        codes = [str(x).upper()[:12] for x in raw[:20]] if isinstance(raw, list) else []
        counts = {}
        for code in codes:
            if code in self.store.zones:
                room = self.rooms.get(code)
                counts[code] = len(room.clients) if room else 0
        c.ws.send({"t": "zones_online", "counts": counts, "public": self.public_online()})

    def signed_in(self, c):
        """Your account (you need one to make or join a zone: it's how you get back in on any device)."""
        acct = self.store.accounts.get(c.account or "")
        if not acct:
            raise GameError("Sign in first (top right), then you can make or join zones.")
        return acct

    @staticmethod
    def zone_color(m):
        color = str(m.get("color", "#39c6ff"))
        return color if COLOR_RE.match(color) else "#39c6ff"

    def on_create(self, c, m):
        acct = self.signed_in(c)
        if not c.ready("create", 10):
            raise GameError("Hang on a few seconds before making another zone.")
        zone_name = clean(m.get("zoneName"), 24)
        if is_rude(zone_name):
            raise GameError("That zone name has a word that isn't allowed. Keep it friendly!")
        if not zone_name:
            raise GameError("Give your FriendZone a name.")
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        while code in self.store.zones:
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        key = acct["name"].lower()
        self.store.zones[code] = {
            "code": code, "name": zone_name, "owner": key, "created": int(time.time()),
            "players": {key: new_player(acct["name"], self.zone_color(m), c.account)},
        }
        self.enter(c, code, key)

    @staticmethod
    def find_member(zone, name):
        """The member called `name` (their current name, or the one they joined with) -> (key, player)."""
        low = str(name or "").strip().lower()
        if low in zone["players"]:
            return low, zone["players"][low]
        for key, p in zone["players"].items():
            if p["name"].lower() == low:
                return key, p
        return low, None

    def on_join(self, c, m):
        """Join a zone with its invite code: you go in under your username (your profile there from
        before, if you have one), and it's on your home screen from then on."""
        acct = self.signed_in(c)
        code = clean(m.get("code"), 12).upper().replace(" ", "")
        zone = self.store.zones.get(code)
        if not zone:
            raise GameError("No FriendZone has that code.")
        key = acct["zones"].get(code)
        if key not in zone["players"]:
            key, player = self.find_member(zone, acct["name"])
            if player and player.get("account") in (None, c.account):
                pass  # (a profile under your name from before accounts: it's yours now)
            else:
                if len(zone["players"]) >= MAX_MEMBERS:
                    raise GameError("This FriendZone is full.")
                # someone else already goes by your username here: you're "name 2" (rename in the lobby)
                name, n = acct["name"], 2
                while self.find_member(zone, name)[1]:
                    name = f"{acct['name'][:13]} {n}"
                    n += 1
                key = name.lower()
                zone["players"][key] = new_player(name, self.zone_color(m), c.account)
        self.enter(c, code, key)

    def on_resume(self, c, m):
        zone = self.store.zones.get(str(m.get("code", "")))
        key, player = self.find_member(zone, m.get("name")) if zone else (None, None)
        token = str(m.get("token", ""))
        if not player or token not in player["tokens"]:
            raise GameError("That zone needs you to sign in again.")
        self.enter(c, zone["code"], key, token)

    def enter(self, c, code, key, token=None, room=None):
        online = code == PUBLIC_CODE
        until = self.booted.get(key, 0)
        if until > time.time():
            mins = max(1, round((until - time.time()) / 60))
            raise GameError(f"An admin removed you from the server. You can come back in {mins} minute{'s' if mins != 1 else ''}.")
        room = room or (self.public_room(key) if online else self.room(code))
        player = room.zone["players"][key]
        player.setdefault("key", key)  # older saves: pin the key before the name can change
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
        if c.account and not online:  # (the online world isn't one of "your zones": it's always there)
            self.link_account(c, code, key)
        c.ws.send({
            "t": "welcome", "you": key, "token": token,
            "zone": {"code": code, "name": room.zone["name"], "owner": room.zone["owner"], **({"public": True, "server": getattr(room, "server", 1), "max": PUBLIC_MAX} if online else {})},
            "players": [public(p, room.clients.get(k)) for k, p in room.zone["players"].items()],
            "chat": room.chat, "feed": room.feed, "race": self.race_view(room), "arcade": room.zone.get("arcade", {}),
            "rain": raining(room), "weather": weather(room), "admin": c.admin,
            "account": self.store.accounts[c.account]["name"] if c.account in self.store.accounts else None,
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

    def on_quit_zone(self, c, m):
        """Leave a zone for good: your member profile (coins, cosmetics, house…) is deleted and your
        name disappears from the member list, chat, news, leaderboards' likes and so on."""
        if m.get("confirm") is not True:
            raise GameError("Please confirm you want to leave this zone.")
        if c.room.zone.get("public"):
            raise GameError("You can't delete yourself from the online world. Head back to the menu instead.")
        room, key, name = c.room, c.key, c.player["name"]
        zone = room.zone
        self.leave(c)
        gone = zone["players"].pop(key, None)
        acct = self.store.accounts.get((gone or {}).get("account") or "")
        if acct:
            acct["zones"].pop(zone["code"], None)
        # scrub what other people can still see
        low = name.lower()
        room.chat = [e for e in room.chat if e.get("k") != key]
        room.feed = [e for e in room.feed if low not in e.get("text", "").lower()]
        for p in zone["players"].values():
            likes = p.get("house", {}).get("likes")
            if isinstance(likes, list) and key in likes:
                likes.remove(key)
        r = room.race
        r["racers"].pop(key, None)
        if key in r.get("order", []):
            r["order"].remove(key)
        if key in r.get("grid", []):
            r["grid"].remove(key)
        # hand the zone to the most experienced member left, or close it if nobody is
        if not zone["players"]:
            self.store.zones.pop(zone["code"], None)
            self.rooms.pop(zone["code"], None)
        else:
            if zone["owner"] == key:
                zone["owner"] = max(zone["players"], key=lambda k: zone["players"][k]["xp"])
            room.broadcast({"t": "member_left", "k": key, "owner": zone["owner"], "feed": room.feed, "chat": room.chat})
        self.store.mark()
        c.ws.send({"t": "quit_zone", "code": zone["code"]})

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

    def on_rename(self, c, m):
        name = clean(m.get("name"), 16)
        if not NAME_RE.match(name):
            raise GameError("Names are 1–16 letters, numbers, spaces, - or _.")
        self.check_clean(c.room, name, "That name")
        if not c.ready("rename", 5):
            raise GameError("Give it a few seconds before changing your name again.")
        low = name.lower()
        for key, p in c.room.zone["players"].items():
            if key != c.key and (key == low or p["name"].lower() == low):
                raise GameError(f"Someone in this zone is already called {p['name']}.")
        old = c.player["name"]
        if name == old:
            return
        c.player["name"] = name
        self.store.mark()
        self.push_player(c.room, c.key)
        c.ws.send({"t": "renamed", "name": name})
        self.post_feed(c.room, f"✏️ {old} is now called {name}.")

    def on_look(self, c, m):
        look = m.get("look")
        if not isinstance(look, dict):
            raise GameError("That outfit didn't come through.")
        new = {}
        for field, palette in LOOK_COLORS.items():
            if look.get(field) not in CATALOG[palette]:
                raise GameError("Unknown color.")
            new[field] = look[field]
        for field, options in LOOK_CHOICES.items():
            if look.get(field) not in {o["id"] for o in CATALOG[options]}:
                raise GameError("Unknown body option.")
            new[field] = look[field]
        for field in LOOK_TINTS:
            col = look.get(field) or ""
            if col and col not in CATALOG["clothColors"]:
                raise GameError("Unknown color.")
            if col:
                new[field] = col
        for slot in LOOK_SLOTS:
            item = ITEMS.get(look.get(slot))
            if not item or item["slot"] != slot:
                raise GameError("Unknown item.")
            if not owns(c.player, item["id"]):
                raise GameError(f"You haven't unlocked the {item['name']} yet.")
            new[slot] = item["id"]
        for slot, base in EXTRA_SLOTS.items():
            item = ITEMS.get(look.get(slot) or f"{base}_none")
            if not item or item["slot"] != base:
                raise GameError("Unknown item.")
            if not owns(c.player, item["id"]):
                raise GameError(f"You haven't unlocked the {item['name']} yet.")
            new[slot] = item["id"]
        # the same accessory can't be worn twice over
        for base in ("hat", "face", "hand"):
            worn = [new[k] for k in [base, *[k for k, b in EXTRA_SLOTS.items() if b == base]] if not new[k].endswith("_none")]
            if len(worn) != len(set(worn)):
                raise GameError("You're already wearing that.")
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
        # anything in the crate can come out, even things you already have: a duplicate
        # gives you half the crate's price back instead
        pool = [i for i in CATALOG["items"] if i.get("crate")]
        weights = {r: w for r, w in CATALOG["crate"]["weights"].items() if any(i["rarity"] == r for i in pool)}
        rarity = random.choices(list(weights), weights=list(weights.values()))[0]
        item = random.choice([i for i in pool if i["rarity"] == rarity])
        p["coins"] -= price
        dupe = item["id"] in p["owned"]
        refund = price // 2 if dupe else 0
        c.ws.send({"t": "crate_result", "id": item["id"], "dupe": dupe, "refund": refund})
        if dupe:
            p["coins"] += refund
            self.store.mark()
        else:
            self.grant(c, item, "crate")
        self.push_player(c.room, c.key)

    def on_pet_egg(self, c, m):
        """Hatch a pet egg: a random pet you don't have yet (rarer ones are rarer)."""
        p, price = c.player, CATALOG["petEgg"]["price"]
        if p["coins"] < price:
            raise GameError(f"A pet egg costs {price} coins.")
        if not c.ready("pet_egg", 1.5):
            raise GameError("Hang on, the last egg is still hatching!")
        pool = [i for i in CATALOG["items"] if i.get("petRoll") and i["id"] not in p["owned"]]
        if not pool:
            raise GameError("You've already got every pet!")
        weights = {r: w for r, w in CATALOG["petEgg"]["weights"].items() if any(i["rarity"] == r for i in pool)}
        rarity = random.choices(list(weights), weights=list(weights.values()))[0]
        item = random.choice([i for i in pool if i["rarity"] == rarity])
        p["coins"] -= price
        c.ws.send({"t": "pet_hatched", "id": item["id"]})
        self.grant(c, item, "egg")
        self.push_player(c.room, c.key)

    # ---- scenes & the world ----------------------------------------------

    def on_scene(self, c, m):
        scene = m.get("scene")
        if scene == "beach" and not COVE_OPEN and not c.admin:
            return self.sys(c, "🚧 Coral Cove is coming soon!")
        if scene in SCENES:
            self.set_scene(c, scene)
        elif isinstance(scene, str) and scene.startswith("house:") and scene[6:] in c.room.zone["players"]:
            self.set_scene(c, scene)  # walking into someone's house

    def set_scene(self, c, scene):
        room, prev = c.room, c.scene
        if prev == scene and scene != "world":
            return
        if prev == "world" and scene != "world":
            room.broadcast({"t": "despawn", "k": c.key}, scene="world", exclude=c)
            c.pose = None
        if is_area(prev) and scene != prev:
            room.broadcast({"t": "area_del", "k": c.key}, scene=prev, exclude=c)
            c.ax = c.az = c.ah = None
            c.aseat = None
            c.apose = None
            if prev == "beach":
                self.boat_release(room, c.key)
                for court in list(room.matches):
                    self.court_drop(room, court, c.key)
        if prev == "arena" and scene != "arena":
            self.arena_leave(c)
        if prev == "lasertag" and scene != "lasertag":
            self.lt_leave(c)
        if prev == "race" and scene != "race":
            self.race_remove(c)
        if prev == "boss" and scene != "boss":
            self.boss_leave(c)
        if prev == "doodle" and scene != "doodle":
            c.scene = scene
            self.doodle_leave(room, c.key)
        if prev == "tavern" and scene != "tavern":
            self.trade_drop(room, c.key, "left the tavern")
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
        elif scene == "lasertag":
            self.lt_join(c)
        elif scene == "boss":
            self.boss_join(c)
        elif scene == "doodle":
            self.doodle_join(c)
        elif scene == "casino":
            self.roulette_join(c)
        elif scene == "beach":
            self.beach_join(c)
        if is_area(scene):
            c.ws.send({"t": "area", "others": [{"k": o.key, "x": o.ax, "z": o.az, "h": o.ah, "seat": o.aseat, "pose": o.apose} for o in room.clients.values()
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
        if not is_area(c.scene):
            return
        c.ax, c.az, c.ah = num(m["x"], -260, 260), num(m["z"], -260, 260), num(m.get("h", 0), -7, 7)
        c.room.broadcast({"t": "area_pos", "k": c.key, "x": round(c.ax, 2), "z": round(c.az, 2), "h": round(c.ah, 2)},
                         scene=c.scene, exclude=c)

    def on_area_pose(self, c, m):
        """Swimming, digging, driving a boat…: a small dict everyone else in the area gets."""
        if not is_area(c.scene) or not c.ready("apose", 0.05):
            return
        raw = m.get("pose")
        pose = None
        if isinstance(raw, dict):
            pose = {k: v for k, v in raw.items() if k in ("p", "v", "prop", "y") and isinstance(v, (str, int, float)) and len(str(v)) < 24}
        c.apose = pose
        c.room.broadcast({"t": "area_pose", "k": c.key, "pose": pose}, scene=c.scene, exclude=c)

    # ---- Coral Cove: shared balls, court scores and boats ----------------------------------
    # Balls are simulated by whoever touched them last (they send their state); everyone else follows.

    def on_ball(self, c, m):
        if c.scene != "beach" or not c.ready("ball", 0.04):
            return
        bid = str(m.get("id", ""))[:12]
        try:
            st = {k: round(num(m[k], -300, 300), 3) for k in ("x", "y", "z", "vx", "vy", "vz")}
        except (KeyError, TypeError, ValueError):
            return
        st.update(id=bid, own=c.key, held=m.get("held") if isinstance(m.get("held"), str) else None)
        cur = c.room.balls.get(bid)
        # just stolen: the old holder's last few updates (still saying they've got it) don't count
        if cur and cur.get("lock") and time.time() - cur["lock"][1] < 1.0 and c.key != cur["lock"][0]:
            return
        c.room.balls[bid] = st
        c.room.broadcast({"t": "ball", **st}, scene="beach", exclude=c)

    # ---- Coral Park pickup games: steals, blocks, and matches you ready up for -------------------

    def on_ball_steal(self, c, m):
        """Reach in for the ball someone's holding. Close enough and lucky: it's yours."""
        if c.scene != "beach" or c.ax is None or not c.ready("steal", 1.1):
            return
        bid = str(m.get("id", ""))[:12]
        room = c.room
        b = room.balls.get(bid)
        holder = b and b.get("held")
        h = room.clients.get(holder) if holder else None
        if not h or holder == c.key or h.ax is None or math.hypot(h.ax - c.ax, h.az - c.az) > 2.4:
            return
        match = room.matches.get(bid.split("-")[0])
        if match and match["state"] == "live":
            t = match["teams"]
            if c.key not in t or holder not in t or t[c.key] == t[holder]:
                return  # (no stealing from your own team, or from outside the game)
        # never a sure thing: best right up close, a long shot at arm's length
        if random.random() < STEAL_CHANCE * (1.35 - math.hypot(h.ax - c.ax, h.az - c.az) / 2.4):
            b.update(held=c.key, own=c.key, vx=0, vy=0, vz=0, lock=(c.key, time.time()))
            room.broadcast({"t": "ball", **{k: v for k, v in b.items() if k != "lock"}, "steal": True}, scene="beach")
            room.broadcast({"t": "ball_event", "kind": "steal", "by": c.key, "from": holder, "id": bid}, scene="beach")
            self.reward(c, xp=2)
        else:
            room.broadcast({"t": "ball_event", "kind": "reach", "by": c.key, "from": holder, "id": bid}, scene="beach")

    def on_ball_event(self, c, m):
        """Blocks, tackles and throw-ins: the player's game works out the ball's new path and sends it
        itself; this just tells everyone (for the banner and the crowd)."""
        kind = m.get("kind")
        if c.scene != "beach" or kind not in ("block", "out", "tackle") or not c.ready("bevent", 0.4):
            return
        c.room.broadcast({"t": "ball_event", "kind": kind, "by": c.key, "from": str(m.get("from", ""))[:24],
                          "id": str(m.get("id", ""))[:12], "side": 1 if m.get("side") == 1 else 0}, scene="beach")
        if kind == "block":
            self.reward(c, xp=2)

    def match_view(self, room, court):
        mt = room.matches[court]
        return {"t": "court_match", "court": court, "state": mt["state"], "teams": mt["teams"], "ready": sorted(mt["ready"]),
                "s": mt["s"], "left": round(max(0.0, mt["ends"] - time.monotonic()), 1), "to": MATCH_COURTS[court]["to"],
                "winner": mt.get("winner")}

    def court_of(self, c, m):
        court = str(m.get("court", ""))
        if c.scene != "beach" or court not in MATCH_COURTS:
            raise GameError("That's not a court.")
        return c.room.matches.setdefault(court, {"state": "lobby", "teams": {}, "ready": set(), "s": [0, 0], "ends": 0.0, "id": 0}), court

    def on_court_join(self, c, m):
        mt, court = self.court_of(c, m)
        if mt["state"] in ("countdown", "live"):
            raise GameError("You can't switch sides mid-game." if c.key in mt["teams"] else "A game's on! Wait for the next one.")
        side = 1 if m.get("side") == 1 else 0
        if sum(1 for v in mt["teams"].values() if v == side) >= MATCH_COURTS[court]["max"] and mt["teams"].get(c.key) != side:
            raise GameError("That side is full.")
        for other in list(c.room.matches):  # (one game at a time)
            if other != court:
                self.court_drop(c.room, other, c.key)
        mt["teams"][c.key] = side
        mt["ready"].discard(c.key)
        c.room.broadcast(self.match_view(c.room, court), scene="beach")

    def on_court_leave(self, c, m):
        for court in list(c.room.matches):
            self.court_drop(c.room, court, c.key)

    def court_drop(self, room, court, key):
        mt = room.matches.get(court)
        if not mt or key not in mt["teams"]:
            return
        mt["teams"].pop(key, None)
        mt["ready"].discard(key)
        if mt["state"] in ("countdown", "live") and len(set(mt["teams"].values())) < 2:
            self.match_end(room, court, mt["id"], forfeit=True)
        else:
            room.broadcast(self.match_view(room, court), scene="beach")

    def on_court_ready(self, c, m):
        mt, court = self.court_of(c, m)
        if c.key not in mt["teams"] or mt["state"] not in ("lobby", "over"):
            return
        mt["ready"] ^= {c.key}
        teams = mt["teams"]
        if len(set(teams.values())) == 2 and all(k in mt["ready"] for k in teams):
            mt["id"] += 1
            mt.update(state="countdown", s=[0, 0], winner=None, ends=time.monotonic() + 3)
            asyncio.get_running_loop().call_later(3, self.match_go, c.room, court, mt["id"])
        c.room.broadcast(self.match_view(c.room, court), scene="beach")

    def match_go(self, room, court, token):
        mt = room.matches.get(court)
        if not mt or mt["id"] != token or mt["state"] != "countdown":
            return
        mt.update(state="live", ends=time.monotonic() + MATCH_COURTS[court]["time"])
        room.broadcast(self.match_view(room, court), scene="beach")
        asyncio.get_running_loop().call_later(MATCH_COURTS[court]["time"], self.match_end, room, court, token)

    def match_end(self, room, court, token, forfeit=False):
        mt = room.matches.get(court)
        if not mt or mt["id"] != token or mt["state"] not in ("countdown", "live"):
            return
        s = mt["s"]
        if forfeit:
            winner = next(iter(mt["teams"].values()), None)
        else:
            winner = None if s[0] == s[1] else (0 if s[0] > s[1] else 1)
        mt.update(state="over", winner=winner, ready=set())
        mt["id"] += 1
        for k, side in mt["teams"].items():
            cl = room.clients.get(k)
            if cl and side == winner and not forfeit:
                self.reward(cl, coins=40, xp=25)
        if winner is not None and not forfeit:
            names = ", ".join(room.zone["players"][k]["name"] for k, v in mt["teams"].items() if v == winner)
            sport = "🏀" if court.startswith("bb") else "⚽"
            self.post_feed(room, f"{sport} {names} won {max(s)}–{min(s)} at Coral Park!")
        room.broadcast(self.match_view(room, court), scene="beach")
        mt["state"] = "lobby"

    def on_golf_done(self, c, m):
        """Holed out on the golf course: strokes for that hole (par pays best)."""
        if c.scene != "beach" or not c.ready("golf", 3):
            return
        hole, strokes = int(num(m.get("hole", 0), 0, 8)), int(num(m.get("strokes", 9), 1, 20))
        par = GOLF_PARS[hole] if hole < len(GOLF_PARS) else 3
        under = par - strokes
        coins = max(3, 12 + under * 10) if strokes < 10 else 2
        self.reward(c, coins=coins, xp=5 + max(0, under) * 5)
        c.ws.send({"t": "golf_result", "hole": hole, "strokes": strokes, "par": par, "coins": coins})
        if strokes == 1:
            self.post_feed(c.room, f"⛳ {c.player['name']} got a HOLE IN ONE at Coral Links!")

    def on_court_score(self, c, m):
        if c.scene != "beach" or not c.ready("score", 0.5):
            return
        court = str(m.get("court", ""))[:12]
        mt = c.room.matches.get(court)
        if mt and mt["teams"]:
            # a match court with players signed up: points only count in a live game, for the scorer's team
            if mt["state"] != "live" or c.key not in mt["teams"]:
                return
            side = mt["teams"][c.key] if court.startswith("bb") else (1 if m.get("side") == 1 else 0)
            mt["s"][side] += int(num(m.get("pts", 1), 1, 3))
            c.room.broadcast({"t": "court_score", "court": court, "s": mt["s"], "by": c.key, "pts": m.get("pts", 1)}, scene="beach")
            c.room.broadcast(self.match_view(c.room, court), scene="beach")
            if mt["s"][side] >= MATCH_COURTS[court]["to"]:
                self.match_end(c.room, court, mt["id"])
            return
        side = 1 if m.get("side") == 1 else 0
        pts = int(num(m.get("pts", 1), 1, 7))
        board = c.room.courts.setdefault(court, {"s": [0, 0], "at": 0})
        if time.time() - board["at"] > 600:
            board["s"] = [0, 0]  # a fresh game after a quiet spell
        board["s"][side] += pts
        board["at"] = time.time()
        c.room.broadcast({"t": "court_score", "court": court, "s": board["s"], "by": c.key, "pts": pts}, scene="beach")
        if pts >= 3 and c.ready("scorexp", 3):
            self.reward(c, coins=pts * 2, xp=pts)

    def boat_release(self, room, key):
        for bid, b in room.boats.items():
            if b.get("driver") == key:
                b["driver"] = None
                room.broadcast({"t": "boat", "id": bid, **b}, scene="beach")

    def on_boat_take(self, c, m):
        if c.scene != "beach":
            return
        bid = str(m.get("id", ""))[:12]
        b = c.room.boats.setdefault(bid, {"driver": None})
        if b.get("driver") and b["driver"] != c.key and b["driver"] in c.room.clients:
            raise GameError("Someone's already driving that!")
        self.boat_release(c.room, c.key)
        b["driver"] = c.key
        c.room.broadcast({"t": "boat", "id": bid, **b}, scene="beach")

    def on_boat_leave(self, c, m):
        self.boat_release(c.room, c.key)

    def on_boat(self, c, m):
        if c.scene != "beach" or not c.ready("boat", 0.04):
            return
        bid = str(m.get("id", ""))[:12]
        b = c.room.boats.get(bid)
        if not b or b.get("driver") != c.key:
            return
        try:
            b.update(x=round(num(m["x"], -400, 400), 2), z=round(num(m["z"], -400, 400), 2), h=round(num(m["h"], -50, 50), 3), v=round(num(m.get("v", 0), -60, 60), 2))
        except (KeyError, TypeError, ValueError):
            return
        c.room.broadcast({"t": "boat", "id": bid, **b}, scene="beach", exclude=c)

    def on_area_sit(self, c, m):
        """Sitting on a seat in a house (a sofa has two); one person per seat. seat: [item, seat] or None."""
        if not (c.scene or "").startswith("house:"):
            return
        seat = m.get("seat")
        if seat is not None:
            try:
                seat = [int(seat[0]), int(seat[1])]
            except (TypeError, ValueError, IndexError):
                raise GameError("That isn't a seat.")
            if not (0 <= seat[0] < HOUSE_MAX_ITEMS and 0 <= seat[1] < 4):
                raise GameError("That isn't a seat.")
            if any(o.aseat == seat for o in c.room.clients.values() if o is not c and o.scene == c.scene):
                raise GameError("Someone's already sitting there!")
        c.aseat = seat
        c.room.broadcast({"t": "area_sit", "k": c.key, "seat": seat}, scene=c.scene, exclude=c)

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

    def check_clean(self, room, text, what="That"):
        """Refuse rude text (unless an admin turned the filter off for this zone)."""
        if text and not room.zone.get("noFilter") and is_rude(text):
            raise GameError(f"{what} has a word that isn't allowed here. Keep it friendly!")

    def on_chat(self, c, m):
        text = clean(m.get("text"), 140)
        if text.startswith("/"):
            # commands are never shown in the chat
            if c.ready("command", 0.25):
                self.command(c, text)
            return
        if not text or not c.ready("chat", 0.4):
            return
        self.check_clean(c.room, text, "Your message")
        entry = {"k": c.key, "text": text, "ts": int(time.time())}
        c.room.chat = (c.room.chat + [entry])[-40:]
        c.room.broadcast({"t": "chat", **entry})

    # ---- chat commands -------------------------------------------------------

    def sys(self, c, text, kind="info"):
        c.ws.send({"t": "sys", "text": text, "kind": kind})

    def command(self, c, text):
        parts = text[1:].split()
        cmd, args = (parts[0].lower() if parts else ""), parts[1:]
        if cmd == "admin":
            if c.admin:
                return self.sys(c, "You're already an admin. Type /help for commands.")
            if not args:
                return self.sys(c, "Type /admin followed by the password.", "error")
            if c.admin_fails >= 5:
                return self.sys(c, "Too many wrong passwords. Reconnect to try again.", "error")
            if not admin_password_ok(" ".join(args)):
                c.admin_fails += 1
                return self.sys(c, "Wrong password.", "error")
            c.admin = True
            c.ws.send({"t": "admin", "on": True})
            print(f"[admin] {c.player['name']} turned on admin mode in zone {c.room.zone['code']}", flush=True)
            return self.sys(c, "🛡️ Admin mode on! Type /help to see what you can do.", "ok")
        if cmd == "help":
            if not c.admin:
                return self.sys(c, "Commands: /admin <password>")
            return self.sys(c, "Admin commands:\n" + "\n".join(ADMIN_HELP))
        if not c.admin:
            return self.sys(c, f"Unknown command /{cmd}.", "error")
        fn = getattr(self, "admin_" + cmd, None) if cmd.isalpha() else None
        if not fn:
            return self.sys(c, f"Unknown command /{cmd}. Type /help for the list.", "error")
        try:
            fn(c, args)
        except GameError as e:
            self.sys(c, str(e), "error")
        except (ValueError, IndexError):
            self.sys(c, "That didn't look right. Type /help for how to use it.", "error")

    def _adm_targets(self, c, name):
        """'me', 'all', or a member's name (spaces allowed) -> list of keys."""
        low = name.strip().lower()
        if low in ("me", "myself", ""):
            return [c.key]
        if low in ("all", "everyone"):
            return list(c.room.zone["players"])
        key, p = self.find_member(c.room.zone, name)
        if not p:
            raise GameError(f"Nobody here is called {name}.")
        return [key]

    def _adm_amount(self, c, args):
        if len(args) < 2:
            raise GameError("Give a name and an amount, like /give me 500.")
        amount = int(args[-1].replace(",", ""))
        if abs(amount) > 10**9:
            raise GameError("That's too big a number.")
        return self._adm_targets(c, " ".join(args[:-1])), amount

    def _adm_touch(self, c, keys):
        self.store.mark()
        for k in keys:
            self.push_player(c.room, k)

    def names(self, c, keys):
        ps = c.room.zone["players"]
        return "everyone" if len(keys) > 1 else ps[keys[0]]["name"]

    def admin_give(self, c, args):
        keys, amount = self._adm_amount(c, args)
        for k in keys:
            p = c.room.zone["players"][k]
            p["coins"] = max(0, p["coins"] + amount)
        self._adm_touch(c, keys)
        self.sys(c, f"Gave {amount:,} coins to {self.names(c, keys)}.", "ok")

    def admin_take(self, c, args):
        keys, amount = self._adm_amount(c, args)
        self.admin_give(c, args[:-1] + [str(-abs(amount))])

    def admin_setcoins(self, c, args):
        keys, amount = self._adm_amount(c, args)
        for k in keys:
            c.room.zone["players"][k]["coins"] = max(0, amount)
        self._adm_touch(c, keys)
        self.sys(c, f"{self.names(c, keys)} now has {max(0, amount):,} coins.", "ok")

    def admin_xp(self, c, args):
        keys, amount = self._adm_amount(c, args)
        for k in keys:
            p = c.room.zone["players"][k]
            p["xp"] = max(0, p["xp"] + amount)
        self._adm_touch(c, keys)
        self.sys(c, f"Gave {amount:,} XP to {self.names(c, keys)}.", "ok")

    def admin_item(self, c, args):
        if len(args) < 2:
            raise GameError("Like: /item me hat_crown (or /item me all). /items lists ids.")
        item_id = args[-1].lower()
        keys = self._adm_targets(c, " ".join(args[:-1]))
        # (exclusive items like the OG Tester aura are only ever given one at a time, on purpose)
        ids = [i["id"] for i in CATALOG["items"] if not i.get("exclusive")] if item_id == "all" else [item_id]
        if item_id != "all" and item_id not in ITEMS:
            raise GameError(f"No item called {item_id}. Try /items {item_id.split('_')[0]}")
        for k in keys:
            owned = c.room.zone["players"][k]["owned"]
            owned.extend(i for i in ids if i not in owned)
        self._adm_touch(c, keys)
        self.sys(c, f"Gave {'every cosmetic' if item_id == 'all' else ITEMS[item_id]['name']} to {self.names(c, keys)}.", "ok")

    def admin_furni(self, c, args):
        if len(args) < 2:
            raise GameError("Like: /furni me sofa_pink 2 (or /furni me all).")
        count = 1
        if args[-1].isdigit() and len(args) >= 3:
            count = max(1, min(20, int(args[-1])))
            args = args[:-1]
        fid = args[-1].lower()
        keys = self._adm_targets(c, " ".join(args[:-1]))
        every = {**FURN, **FLOORS, **WALLS, **CEILINGS, **DOORS}
        if fid != "all" and fid not in every:
            raise GameError(f"No furniture called {fid}. Try /items {fid.split('_')[0]}")
        # (exclusive furniture like the Gojo cutout is only ever given out by name, on purpose)
        ids = [i for i, f in every.items() if not f.get("exclusive")] if fid == "all" else [fid]
        for k in keys:
            inv = c.room.zone["players"][k]["furni"]
            for i in ids:
                limit = FURN[i].get("max", 10) if i in FURN else 1
                inv[i] = min(limit, inv.get(i, 0) + count)
        self._adm_touch(c, keys)
        self.sys(c, f"Gave {'all the furniture' if fid == 'all' else every[fid]['name']} to {self.names(c, keys)}.", "ok")

    # leaderboard names for /score, and the stat each one sets
    SCORE_STATS = {"dungeon": "dungeonBest", "archery": "archeryBest", "race": "raceWins", "arena": "arenaWins",
                   "kills": "elims", "ko": "elims", "fish": "fish", "boss": "bossKills", "jackpots": "jackpots",
                   "koi": "koi", "mythic": "mythic", "likes": "houseLikes"}

    def admin_score(self, c, args):
        if len(args) >= 2 and args[-1].lower() == "list":
            games = sorted(self.SCORE_STATS) + sorted(ARCADE_GAMES)
            return self.sys(c, "Games: " + ", ".join(games) + " (or any stat name)")
        if len(args) < 3:
            raise GameError("Like: /score me snake 1500 (or /score me list).")
        game, value = args[-2].lower(), int(float(args[-1]))
        if value < 0:
            raise GameError("Scores can't be negative.")
        keys = self._adm_targets(c, " ".join(args[:-2]))
        room = c.room
        if game in ARCADE_GAMES:
            cfg = ARCADE_GAMES[game]
            value = min(value, cfg["max"])
            board = room.zone.setdefault("arcade", {}).setdefault(game, [])
            for k in keys:
                board[:] = [e for e in board if e["k"] != k]
                if value > 0:
                    board.append({"k": k, "s": value, "ts": int(time.time())})
            board.sort(key=lambda e: (-e["s"], e["ts"]))
            del board[10:]
            room.broadcast({"t": "arcade_board", "g": game, "board": board})
            label = cfg["name"]
        else:
            stat = self.SCORE_STATS.get(game) or next((st for st in {v for v in self.SCORE_STATS.values()} if st.lower() == game), game)
            if not re.fullmatch(r"[a-zA-Z]{2,24}", stat):
                raise GameError("That isn't a game or stat. Try /score me list.")
            for k in keys:
                room.zone["players"][k]["stats"][stat] = value
                cl = next((o for o in room.clients.values() if o.key == k), None)
                if cl:
                    self.check_unlocks(cl)
            label = stat
        self._adm_touch(c, keys)
        self.sys(c, f"Set {self.names(c, keys)}'s {label} to {value:,}.", "ok")

    def admin_items(self, c, args):
        q = " ".join(args).lower()
        ids = [i["id"] for i in CATALOG["items"]] + list(FURN) + list(FLOORS) + list(WALLS) + list(CEILINGS) + list(DOORS)
        hits = [i for i in ids if q in i][:60]
        self.sys(c, (", ".join(hits) or "Nothing matches.") + (" …" if len(hits) == 60 else ""))

    def admin_kick(self, c, args):
        keys = self._adm_targets(c, " ".join(args))
        if keys == [c.key] or len(keys) != 1:
            raise GameError("Name one other person to kick.")
        target = c.room.clients.get(keys[0])
        if not target:
            raise GameError("They aren't online right now.")
        target.ws.send({"t": "kicked", "msg": "An admin sent you back to the home screen."})
        self.leave(target)
        self.sys(c, f"Kicked {self.names(c, keys)}.", "ok")

    def _one_online(self, c, args, what):
        keys = self._adm_targets(c, " ".join(args))
        if keys == [c.key] or len(keys) != 1:
            raise GameError(f"Name one other person to {what}.")
        target = c.room.clients.get(keys[0])
        if not target:
            raise GameError("They aren't online right now.")
        return target

    def _teleport(self, mover, dest):
        """Move `mover` next to `dest`: in town, or into the walk-in area (shop, arcade…) they're in."""
        if dest.scene == "world" and dest.x is not None:
            mover.x = num(dest.x + random.uniform(-30, 30), 0, WORLD_W)
            mover.y = num(dest.y + random.uniform(-30, 30), 0, WORLD_H)
            mover.ws.send({"t": "tp", "scene": "world", "x": mover.x, "y": mover.y})
            if mover.scene == "world":
                mover.room.broadcast({"t": "pos", "k": mover.key, "x": round(mover.x, 1), "y": round(mover.y, 1)}, scene="world", exclude=mover)
        elif dest.scene in AREA_SCENES:
            mover.ws.send({"t": "tp", "scene": dest.scene, "ax": round((dest.ax or 0) + 0.9, 2), "az": round(dest.az or 0, 2)})
        else:
            raise GameError(f"{dest.player['name']} is busy ({dest.scene or 'in the lobby'}). Teleporting works in town and in the shops and areas.")

    def admin_tp(self, c, args):
        target = self._one_online(c, args, "teleport to")
        self._teleport(c, target)
        self.sys(c, f"✨ Teleported to {target.player['name']}.", "ok")

    def admin_bring(self, c, args):
        target = self._one_online(c, args, "bring")
        self._teleport(target, c)
        self.sys(target, f"✨ {c.player['name']} (admin) brought you to them.", "ok")
        self.sys(c, f"✨ Brought {target.player['name']} to you.", "ok")

    def admin_boot(self, c, args):
        if not args:
            raise GameError("Like: /boot Bob (or /boot Bob 60 to keep them out for an hour).")
        minutes = 10
        if len(args) > 1 and args[-1].isdigit():
            minutes = min(60 * 24 * 7, int(args[-1]))
            args = args[:-1]
        key = " ".join(args).strip().lower()
        if key == c.key or key in ("me", "all", "everyone"):
            raise GameError("Name one other person to boot.")
        hits = [(room, o) for room in self.rooms.values() for o in list(room.clients.values())
                if o.key == key or o.player and o.player["name"].lower() == key]
        if minutes:
            self.booted[key] = time.time() + minutes * 60
        for room, o in hits:
            o.ws.send({"t": "kicked", "msg": "An admin removed you from the server."})
            self.leave(o)
            o.ws.close()
        where = f"from {len({id(r) for r, _ in hits})} zone(s)" if hits else "(they weren't online)"
        self.sys(c, f"Booted {' '.join(args)} {where}" + (f"; they're kept out for {minutes} min." if minutes else "."), "ok")

    def admin_unboot(self, c, args):
        key = " ".join(args).strip().lower()
        if self.booted.pop(key, None) is None:
            raise GameError(f"{' '.join(args) or 'Nobody'} isn't booted.")
        self.sys(c, f"{' '.join(args)} can come back now.", "ok")

    def admin_announce(self, c, args):
        msg = clean(" ".join(args), 120)
        if not msg:
            raise GameError("Like: /announce Party at the fountain!")
        self.post_feed(c.room, f"📣 {msg}")
        self.sys(c, "Announced.", "ok")

    def admin_players(self, c, args):
        ps = c.room.zone["players"]
        rows = [f"{p['name']}{' (online)' if k in c.room.clients else ''}: {p['coins']:,} coins, level {level_for(p['xp'])}" for k, p in ps.items()]
        self.sys(c, "\n".join(rows))

    def admin_filter(self, c, args):
        mode = (args[0].lower() if args else "")
        if mode not in ("on", "off"):
            raise GameError("Like: /filter on or /filter off")
        c.room.zone["noFilter"] = mode == "off"
        self.store.mark()
        self.sys(c, f"Chat filter is {'ON' if mode == 'on' else 'OFF'} for this zone.", "ok")

    def admin_rain(self, c, args):
        mode = (args[0].lower() if args else "")
        if mode not in ("on", "off", "auto"):
            raise GameError("Like: /rain on, /rain off or /rain auto")
        c.room.weather_override = None if mode == "auto" else "rain" if mode == "on" else "sunny"
        self.weather_tick()
        self.sys(c, f"Weather: {'following the forecast' if mode == 'auto' else 'rain' if mode == 'on' else 'clear skies'}.", "ok")

    def admin_weather(self, c, args):
        mode = (args[0].lower() if args else "")
        if mode not in WEATHER_KINDS + ("auto",):
            raise GameError("Like: /weather sunny, cloudy, windy, rain, storm or auto")
        c.room.weather_override = None if mode == "auto" else mode
        self.weather_tick()
        self.sys(c, f"Weather: {'following the forecast' if mode == 'auto' else mode}.", "ok")

    def weather_tick(self):
        for room in list(self.rooms.values()):
            w = weather(room)
            if w != room.rain_sent:
                room.rain_sent = w
                room.broadcast({"t": "weather", "rain": raining(room), "weather": w})

    async def weather_loop(self):
        while True:
            await asyncio.sleep(5)
            try:
                self.weather_tick()
            except Exception as e:  # never let the weather take the server down
                print("weather tick failed:", repr(e))

    def admin_unadmin(self, c, args):
        c.admin = False
        c.ws.send({"t": "admin", "on": False})
        self.sys(c, "Admin mode off.")

    def on_emote(self, c, m):
        if c.scene == "world" and m.get("e") in EMOTES and c.ready("emote", 1):
            c.room.broadcast({"t": "emote", "k": c.key, "e": m["e"]}, scene="world")

    # ---- solo activities -------------------------------------------------

    def on_fish_hook(self, c, m):
        """A fish bit and the player hooked it: decide what it is now, so rarer fish fight harder."""
        if not c.ready("hook", 1.0):
            raise GameError("Easy there, the fish need a moment.")
        # a longer cast and a luckier rod find better fish (capped, and the rarest are damped, so even
        # the best rod lands a legendary well under 1% of the time)
        power = num(m.get("p", 0), 0, 1)
        q = min(1.25, 0.35 + power * 0.25 + RODS.get(c.player["rod"], {}).get("luck", 0))
        rain = raining(c.room)
        # the pond has freshwater fish; the sea at Coral Cove has its own
        water = "ocean" if c.scene == "beach" else "pond"
        pool = [f for f in FISH if f.get("water", "pond") == water and (f["rarity"] != "mythic" or rain)]
        weights = [f["weight"] * math.exp(f["bias"] * (q - 0.5)) * FISH_DAMP.get(f["rarity"], 1) for f in pool]
        fish = random.choices(pool, weights=weights)[0]
        c.hooked = {"fish": fish, "at": time.monotonic()}
        fight = FISH_FIGHT.get(fish["rarity"], 0.5) * random.uniform(0.92, 1.08)
        c.ws.send({"t": "fish_hooked", "d": round(fight, 3), "pat": fish["rarity"] in ("legendary", "mythic"),
                   "seed": random.randint(0, 9999)})

    def on_fish(self, c, m):
        """Sent when the reeling minigame is won. `q` is how well the player tracked the fish."""
        hooked = getattr(c, "hooked", None)
        c.hooked = None
        if not hooked or time.monotonic() - hooked["at"] < 1.2:
            raise GameError("Nothing on the line!")
        if not c.ready("fish", 2.0):
            raise GameError("Easy there, the fish need a moment.")
        fish = hooked["fish"]
        q = num(m.get("q", 0), 0, 1)
        lo, hi = fish["size"]
        size = round(random.uniform(lo, hi) * (0.85 + 0.3 * q), 1)
        treasure = random.randint(30, 120) if m.get("treasure") is True else 0
        entry = c.player["fishdex"].setdefault(fish["name"], {"n": 0, "best": 0})
        first, record = entry["n"] == 0, size > entry["best"]
        entry["n"] += 1
        entry["best"] = max(entry["best"], size)
        extra = {"koi": 1} if fish["rarity"] in ("legendary", "mythic") else {}
        if fish["rarity"] == "mythic":
            extra["mythic"] = 1
        # the catch goes in your fish bag, to sell at the Fish Market (a full bag sells it on the spot, at half price)
        bag = c.player["fishbag"]
        price = fish_price(fish, size)
        bagged = len(bag) < FISH_BAG_MAX
        if bagged:
            c.player["fishseq"] = c.player.get("fishseq", 0) + 1
            bag.append({"id": c.player["fishseq"], "name": fish["name"], "size": size})
        coins = treasure + (0 if bagged else price // 2)
        self.reward(c, coins=coins, xp=max(5, fish["coins"] // 4), fish=1, **extra)
        c.ws.send({"t": "fish_result", "fish": {**fish, "size": size}, "treasure": treasure, "price": price,
                   "bagged": bagged, "sold": 0 if bagged else price // 2,
                   "first": first, "record": record and not first})
        if fish["rarity"] in ("rare", "epic", "legendary", "mythic"):
            self.post_feed(c.room, f"🎣 {c.player['name']} caught a {fish['rarity']} {fish['name']} ({size} in)!")

    def on_fish_sell(self, c, m):
        """Sell the chosen fish from your bag to the fishmonger (ids, or all: true)."""
        bag = c.player["fishbag"]
        if m.get("all") is True:
            ids = {f["id"] for f in bag}
        else:
            raw = m.get("ids")
            ids = {int(num(i, 0, 1e9)) for i in raw[:FISH_BAG_MAX]} if isinstance(raw, list) else set()
        sold = [f for f in bag if f["id"] in ids and f["name"] in FISH_BY_NAME]
        if not sold:
            raise GameError("Pick some fish to sell first.")
        total = sum(fish_price(FISH_BY_NAME[f["name"]], f["size"]) for f in sold)
        c.player["fishbag"] = [f for f in bag if f["id"] not in ids]
        self.reward(c, coins=total)
        c.ws.send({"t": "fish_sold", "n": len(sold), "coins": total})

    def on_rod(self, c, m):
        """Buy a fishing rod, or pick one you own."""
        rod = RODS.get(str(m.get("id", "")))
        p = c.player
        if not rod:
            raise GameError("Unknown rod.")
        if rod["id"] not in p["rods"]:
            if p["coins"] < rod["price"]:
                raise GameError(f"The {rod['name']} costs {rod['price']:,} coins.")
            p["coins"] -= rod["price"]
            p["rods"].append(rod["id"])
            if rod["price"] >= 6000:
                self.post_feed(c.room, f"🎣 {p['name']} bought the {rod['name']}!")
        p["rod"] = rod["id"]
        self.store.mark()
        self.push_player(c.room, c.key)

    def on_archery(self, c, m):
        if not c.ready("archery", 2):
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
            other = "tails" if pick == "heads" else "heads"
            side = pick if random.random() < COINFLIP_WIN else other
            payout = bet * 2 if side == pick else 0
            result = {"side": side}
        elif game == "slots":
            reels = random.choices(SLOT_SYMBOLS, weights=SLOT_WEIGHTS, k=3)
            if len(set(reels)) == 1 and random.random() < SLOT_NEAR_MISS:
                reels[2] = random.choice([x for x in SLOT_SYMBOLS if x != reels[0]])  # so close!
            if len(set(reels)) == 1:
                payout = bet * SLOT_TRIPLE[reels[0]]
            elif len(set(reels)) == 2:
                payout = int(bet * SLOT_PAIR_PAYS)
            else:
                payout = 0
            result = {"reels": reels}
        elif game == "wheel":
            index = random.choices(range(len(WHEEL)), weights=[WHEEL_ZERO_WEIGHT if w == 0 else 1 for w in WHEEL])[0]
            payout = int(bet * WHEEL[index])
            result = {"index": index}
        else:
            raise GameError("Unknown game.")
        jackpot = game == "slots" and payout >= bet * 12
        self.reward(c, coins=payout - bet, xp=2, **({"jackpots": 1} if jackpot else {}))
        c.ws.send({"t": "gamble_result", "game": game, "bet": bet, "payout": payout, **result})
        if payout >= bet * 10 and payout >= 500:
            self.post_feed(c.room, f"🎰 JACKPOT! {c.player['name']} won {payout:,} coins!")

    # ---- blackjack: each player plays their own hand against the house dealer ----

    def bj_send(self, c, **extra):
        h = c.bj
        done = h["done"]
        dealer = h["dealer"] if done else h["dealer"][:1] + [["?", "?"]]
        c.ws.send({"t": "bj", "player": h["player"], "dealer": dealer, "pv": bj_value(h["player"]),
                   "dv": bj_value(h["dealer"]) if done else bj_value(h["dealer"][:1]), "bet": h["bet"], "done": done,
                   "result": h.get("result"), "payout": h.get("payout", 0),
                   "canDouble": not done and len(h["player"]) == 2 and c.player["coins"] >= h["bet"], **extra})

    def bj_draw(self, h):
        if len(h["shoe"]) < 15:
            h["shoe"] = [[r, s] for r in BJ_RANKS for s in BJ_SUITS] * BJ_DECKS
            random.shuffle(h["shoe"])
        return h["shoe"].pop()

    def on_bj_deal(self, c, m):
        if getattr(c, "bj", None) and not c.bj["done"]:
            raise GameError("Finish this hand first.")
        bet = int(num(m.get("bet", 0), 0, MAX_BET))
        if bet < 1:
            raise GameError("Place a bet first.")
        if bet > c.player["coins"]:
            raise GameError("You don't have that many coins.")
        if not c.ready("bj", 0.6):
            raise GameError("The dealer is still shuffling.")
        shoe = c.bj["shoe"] if getattr(c, "bj", None) else []
        c.bj = h = {"shoe": shoe, "bet": bet, "player": [], "dealer": [], "done": False}
        c.player["coins"] -= bet
        self.store.mark()
        for _ in range(2):
            h["player"].append(self.bj_draw(h))
            h["dealer"].append(self.bj_draw(h))
        self.push_player(c.room, c.key)
        if bj_value(h["player"]) == 21 or bj_value(h["dealer"]) == 21:
            self.bj_finish(c)
        else:
            self.bj_send(c)

    def on_bj_hit(self, c, m):
        h = getattr(c, "bj", None)
        if not h or h["done"] or not c.ready("bj_act", 0.25):
            return
        h["player"].append(self.bj_draw(h))
        if bj_value(h["player"]) >= 21:
            self.bj_finish(c)
        else:
            self.bj_send(c)

    def on_bj_stand(self, c, m):
        h = getattr(c, "bj", None)
        if h and not h["done"]:
            self.bj_finish(c)

    def on_bj_double(self, c, m):
        h = getattr(c, "bj", None)
        if not h or h["done"] or len(h["player"]) != 2:
            return
        if c.player["coins"] < h["bet"]:
            raise GameError("You don't have enough coins to double.")
        c.player["coins"] -= h["bet"]
        h["bet"] *= 2
        h["player"].append(self.bj_draw(h))
        self.bj_finish(c)

    def bj_finish(self, c):
        """Dealer plays out (stands on all 17s), then settle the hand."""
        h = c.bj
        pv = bj_value(h["player"])
        natural = pv == 21 and len(h["player"]) == 2
        dealer_natural = bj_value(h["dealer"]) == 21 and len(h["dealer"]) == 2
        if pv <= 21 and not natural and not dealer_natural:
            # the house hits soft 17
            while bj_value(h["dealer"]) < 17 or (bj_value(h["dealer"]) == 17 and bj_soft(h["dealer"])):
                h["dealer"].append(self.bj_draw(h))
                if bj_value(h["dealer"]) > 21 and random.random() < BJ_DEALER_LUCK:
                    h["dealer"][-1] = self.bj_draw(h)  # the dealer's lucky streak
        dv = bj_value(h["dealer"])
        bet = h["bet"]
        if pv > 21:
            result, payout = "bust", 0
        elif natural and not dealer_natural:
            result, payout = "blackjack", bet * 2  # blackjack pays even money here
        elif dealer_natural and not natural:
            result, payout = "dealer_bj", 0
        elif dv > 21:
            result, payout = "dealer_bust", bet * 2
        elif pv > dv:
            result, payout = "win", bet * 2
        elif pv == dv and pv >= 20:
            result, payout = "push", bet
        elif pv == dv:
            result, payout = "lose", 0  # the house wins ties below 20
        else:
            result, payout = "lose", 0
        h.update(done=True, result=result, payout=payout)
        self.reward(c, coins=payout, xp=3)
        self.bj_send(c)
        if payout - bet >= 1000:
            self.post_feed(c.room, f"🃏 {c.player['name']} won {payout - bet:,} coins at blackjack!")

    def on_daily(self, c, m):
        p = c.player
        now = int(time.time())
        wait = p.get("lastDaily", 0) + DAILY_SECS - now
        if wait > 0:
            raise GameError(f"Your next bonus is ready in {wait // 3600}h {wait % 3600 // 60}m.")
        p["lastDaily"] = now
        self.reward(c, coins=DAILY_BONUS)

    # ---- racing ------------------------------------------------------------

    # Kart racing: every driver simulates their own kart (so steering feels instant) and streams its
    # position; the server runs the countdown, relays karts and items, and records the finish.

    def race_view(self, room):
        r = room.race
        players = room.zone["players"]
        return {"state": r["state"], "racers": r["racers"], "order": r["order"], "laps": RACE_LAPS,
                "ready": sorted(r.get("ready", set()) & set(r["racers"])),
                "cars": {k: vehicle_of(players[k]) for k in r["racers"] if k in players},
                "since": round(time.monotonic() - r.get("goAt", time.monotonic()), 2) if r["state"] == "running" else 0,
                "times": r.get("times", {}),
                # the starting order is fixed once a race starts; before that it's whoever is on the grid
                "grid": r.get("grid", list(r["racers"])) if r["state"] in ("countdown", "running") else list(r["racers"])}

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
        r.setdefault("ready", set()).discard(c.key)
        self.race_sync(c.room)

    def on_race_ready(self, c, m):
        """Ready up on the grid (or stand down). When everyone on it is ready, the race starts."""
        room, r = c.room, c.room.race
        if c.key not in r["racers"] or r["state"] != "waiting":
            return
        ready = r.setdefault("ready", set())
        if m.get("ready", True):
            ready.add(c.key)
        else:
            ready.discard(c.key)
        if len(r["racers"]) >= 2 and all(k in ready for k in r["racers"]):
            self.race_begin(room)
        else:
            self.race_sync(room)

    def on_race_vehicle(self, c, m):
        """Pick your ride in the garage: a kart, a motorbike, a buggy, an F1 car or a monster truck, in your colours."""
        if not c.ready("race_vehicle", 0.2):
            return
        kind, color, accent = m.get("type"), m.get("color"), m.get("accent")
        if kind not in VEHICLE_TYPES or color not in CATALOG["clothColors"] or accent not in CATALOG["clothColors"]:
            raise GameError("That isn't something the garage can build.")
        c.player["vehicle"] = {"type": kind, "color": color, "accent": accent}
        self.store.mark()
        if c.key in c.room.race["racers"]:
            self.race_sync(c.room)

    def on_race_leave(self, c, m):
        self.race_remove(c)

    def race_remove(self, c):
        room, r = c.room, c.room.race
        if c.key not in r["racers"]:
            return
        del r["racers"][c.key]
        r.setdefault("ready", set()).discard(c.key)
        if not r["racers"]:
            r.update(id=r["id"] + 1, state="idle", order=[])
        elif r["state"] == "running" and all(k in r["order"] for k in r["racers"]):
            self.race_finish(room, r["id"])
            return
        elif r["state"] == "waiting" and len(r["racers"]) >= 2 and all(k in r["ready"] for k in r["racers"]):
            self.race_begin(room)  # the one holding everyone up left
            return
        self.race_sync(room)

    def on_race_start(self, c, m):
        # (older clients: "start" now just means you're ready)
        self.on_race_ready(c, {"ready": True})

    def race_begin(self, room):
        r = room.race
        r.update(id=r["id"] + 1, state="countdown", order=[], field=len(r["racers"]), times={},
                 grid=list(r["racers"]), ready=set())
        for k in r["racers"]:
            r["racers"][k] = 0
        self.race_sync(room)
        asyncio.get_running_loop().call_later(3, self.race_go, room, r["id"])

    def race_go(self, room, rid):
        r = room.race
        if r["id"] != rid or r["state"] != "countdown":
            return
        r["state"], r["goAt"] = "running", time.monotonic()
        self.race_sync(room)
        asyncio.get_running_loop().call_later(RACE_TIMEOUT, self.race_finish, room, rid)

    def race_finish(self, room, rid):
        r = room.race
        if r["id"] != rid or r["state"] != "running":
            return
        r["state"] = "done"
        self.race_sync(room)
        asyncio.get_running_loop().call_later(6, self.race_reset, room, rid)

    def race_reset(self, room, rid):
        r = room.race
        if r["id"] != rid or r["state"] != "done":
            return
        r.update(state="waiting" if r["racers"] else "idle", order=[], ready=set())
        for k in r["racers"]:
            r["racers"][k] = 0
        self.race_sync(room)

    def on_race_pos(self, c, m):
        """Your kart: position, heading, speed, race progress (laps, fractional) and status flags."""
        room, r = c.room, c.room.race
        if r["state"] not in ("countdown", "running") or c.key not in r["racers"]:
            return
        progress = num(m.get("p", 0), -1, RACE_LAPS + 0.5)
        r["racers"][c.key] = round(progress, 4)
        room.broadcast({"t": "race_kp", "k": c.key, "x": round(num(m["x"], -500, 500), 2), "z": round(num(m["z"], -500, 500), 2),
                        "h": round(num(m.get("h", 0), -1e4, 1e4), 3), "v": round(num(m.get("v", 0), -60, 80), 1),
                        "p": r["racers"][c.key], "f": str(m.get("f", ""))[:12]}, scene="race", exclude=c)

    def on_race_item(self, c, m):
        """Somebody used an item: everyone sees it (hazards, projectiles, zaps)."""
        room, r = c.room, c.room.race
        kind = m.get("kind")
        if r["state"] != "running" or c.key not in r["racers"] or kind not in RACE_ITEMS or not c.ready("race_item", 0.3):
            return
        room.broadcast({"t": "race_item", "k": c.key, "kind": kind, "id": str(m.get("id", ""))[:24],
                        "x": round(num(m.get("x", 0), -500, 500), 2), "z": round(num(m.get("z", 0), -500, 500), 2),
                        "h": round(num(m.get("h", 0), -1e4, 1e4), 3), "target": str(m.get("target", ""))[:20]}, scene="race")

    def on_race_hit(self, c, m):
        """Your kart got hit by (or drove over) something: take it off everyone's track."""
        room, r = c.room, c.room.race
        if r["state"] != "running" or c.key not in r["racers"]:
            return
        room.broadcast({"t": "race_hit", "k": c.key, "id": str(m.get("id", ""))[:24], "by": str(m.get("by", ""))[:20]}, scene="race")

    def on_race_done(self, c, m):
        room, r = c.room, c.room.race
        if r["state"] != "running" or c.key not in r["racers"] or c.key in r["order"]:
            return
        elapsed = time.monotonic() - r["goAt"]
        if r["racers"][c.key] < RACE_LAPS - 0.05 or elapsed < RACE_MIN_LAP * RACE_LAPS:
            return  # not actually finished (or impossibly fast)
        r["order"].append(c.key)
        r["times"][c.key] = round(elapsed, 2)
        place = len(r["order"])
        if r["field"] == 1:
            coins, xp = RACE_PRIZE_SOLO
        else:
            coins, xp = RACE_PRIZES[place - 1] if place <= len(RACE_PRIZES) else RACE_PRIZE_REST
        if place == 1 and r["field"] > 1:
            self.reward(c, coins=coins, xp=xp, raceWins=1, wins=1)
            self.post_feed(room, f"🏁 {c.player['name']} won the Grand Prix in {elapsed:.1f}s!")
        else:
            self.reward(c, coins=coins, xp=xp)
        self.race_sync(room)
        if len(r["order"]) >= len(r["racers"]):
            self.race_finish(room, r["id"])

    # ---- arena ---------------------------------------------------------------

    @staticmethod
    def arena_map(room):
        return ARENA_MAPS[room.arena_map % len(ARENA_MAPS)]

    @staticmethod
    def arena_spawn_point(room, key):
        """The spawn point farthest from every other living fighter."""
        spawns = Game.arena_map(room)["spawns"]
        others = [(f["x"], f["y"]) for k, f in room.arena.items() if k != key and f["hp"] > 0]
        if not others:
            return random.choice(spawns)
        return max(spawns, key=lambda s: min(math.dist(s, o) for o in others) + random.random())

    @staticmethod
    def fighter_view(f):
        return {"x": f["x"], "y": f["y"], "a": f["a"], "hp": f["hp"], "score": f["score"], "deaths": f["deaths"]}

    def arena_view(self, room):
        mp = self.arena_map(room)
        return {"t": "arena", "players": {k: self.fighter_view(f) for k, f in room.arena.items()},
                "target": ARENA_TARGET, "hp": ARENA_HP, "items": list(room.arena_items.values()),
                "map": {"id": mp["id"], "name": mp["name"], "theme": mp["theme"], "walls": mp["walls"], "w": ARENA_W, "h": ARENA_H},
                "brk": round(max(0.0, room.arena_break - time.monotonic()), 2)}

    def arena_join(self, c):
        room = c.room
        x, y = self.arena_spawn_point(room, c.key)
        room.arena[c.key] = {"x": x, "y": y, "a": 0, "hp": ARENA_HP, "score": 0, "deaths": 0,
                             "spawn": time.monotonic(), "hits": set()}
        c.ws.send(self.arena_view(room))
        if not room.arena_spawning:
            room.arena_spawning = True
            asyncio.get_running_loop().call_later(3, self.arena_item_tick, room)
        room.broadcast({"t": "arena_add", "k": c.key, **self.fighter_view(room.arena[c.key])}, scene="arena", exclude=c)

    def arena_leave(self, c):
        if c.room.arena.pop(c.key, None) is not None:
            c.room.broadcast({"t": "arena_del", "k": c.key}, scene="arena")

    def on_arena_move(self, c, m):
        f = c.room.arena.get(c.key)
        if not f or f["hp"] <= 0:
            return
        f["x"], f["y"], f["a"] = num(m["x"], 0, ARENA_W), num(m["y"], 0, ARENA_H), num(m["a"], -7, 7)
        c.room.broadcast({"t": "arena_pos", "k": c.key, "x": round(f["x"], 1), "y": round(f["y"], 1),
                          "a": round(f["a"], 2), "h": round(num(m.get("h", 0), 0, 6), 2), "sl": bool(m.get("sl"))},
                         scene="arena", exclude=c)

    def on_arena_shoot(self, c, m):
        f = c.room.arena.get(c.key)
        if not f or f["hp"] <= 0 or not c.ready("shoot", 0.1) or time.monotonic() < c.room.arena_break:
            return
        # h: launch height (world units), p: aim pitch, so the shot flies exactly where the crosshair was
        c.room.broadcast({"t": "arena_shot", "k": c.key, "id": int(num(m["id"], 0, 1e9)),
                          "x": num(m["x"], 0, ARENA_W), "y": num(m["y"], 0, ARENA_H), "a": num(m["a"], -7, 7),
                          "h": round(num(m.get("h", 1.15), 0, 12), 3), "p": round(num(m.get("p", 0), -1.6, 1.6), 4)},
                         scene="arena", exclude=c)

    def on_arena_shield_pop(self, c, m):
        """Your shield soaked up a hit and broke: tell everyone so its bubble disappears for them too."""
        if c.key in c.room.arena and c.ready("shieldpop", 0.3):
            c.room.broadcast({"t": "arena_shield_pop", "k": c.key}, scene="arena", exclude=c)

    def on_arena_hit(self, c, m):
        """Sent by the player who got hit; friends are trusted to be honest."""
        room = c.room
        by = str(m.get("by", ""))
        victim, shooter = room.arena.get(c.key), room.arena.get(by)
        hit_id = (by, m.get("id"))
        if not victim or not shooter or by == c.key or victim["hp"] <= 0 or time.monotonic() < room.arena_break:
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
        victim["deaths"] += 1
        killer = room.clients.get(by)
        if killer:
            self.reward(killer, coins=20, xp=15, elims=1)
        room.broadcast({"t": "arena_ko", "k": c.key, "by": by, "score": shooter["score"], "deaths": victim["deaths"]}, scene="arena")
        if shooter["score"] >= ARENA_TARGET:
            self.arena_round_over(room, by)
        else:
            asyncio.get_running_loop().call_later(2, self.arena_respawn, room, c.key)

    def arena_round_over(self, room, winner):
        """A round is won: everyone sees the kills/deaths board for ARENA_BREAK seconds, then a new map."""
        killer = room.clients.get(winner)
        if killer:
            self.reward(killer, coins=200, xp=100, wins=1, arenaWins=1)
            self.post_feed(room, f"⚔️ {killer.player['name']} won an Arena round!")
        board = sorted(({"k": k, "kills": f["score"], "deaths": f["deaths"]} for k, f in room.arena.items()),
                       key=lambda e: (-e["kills"], e["deaths"]))
        room.arena_break = time.monotonic() + ARENA_BREAK
        nxt = ARENA_MAPS[(room.arena_map + 1) % len(ARENA_MAPS)]
        room.broadcast({"t": "arena_round", "winner": winner, "board": board, "secs": ARENA_BREAK, "next": nxt["name"]}, scene="arena")
        asyncio.get_running_loop().call_later(ARENA_BREAK, self.arena_next_round, room)

    def arena_next_round(self, room):
        room.arena_map = (room.arena_map + 1) % len(ARENA_MAPS)
        room.arena_items.clear()
        now = time.monotonic()
        for k in list(room.arena):
            f = room.arena[k]
            f.update(hp=ARENA_HP, score=0, deaths=0, spawn=now, hits=set())
            f["x"], f["y"] = -999, -999
        for k in list(room.arena):
            room.arena[k]["x"], room.arena[k]["y"] = self.arena_spawn_point(room, k)
        room.broadcast(self.arena_view(room), scene="arena")

    def arena_item_tick(self, room):
        if not room.arena:
            room.arena_spawning = False
            room.arena_items.clear()
            return
        walls = self.arena_map(room)["walls"]
        if len(room.arena_items) < ARENA_MAX_ITEMS and time.monotonic() >= room.arena_break:
            for _ in range(40):
                x, y = random.uniform(80, ARENA_W - 80), random.uniform(80, ARENA_H - 80)
                if not any(px - 40 < x < px + pw + 40 and py - 40 < y < py + ph + 40 for px, py, pw, ph in walls):
                    break
            room.arena_item_seq += 1
            item = {"id": room.arena_item_seq, "kind": random.choice(ARENA_ITEMS), "x": round(x), "y": round(y)}
            room.arena_items[item["id"]] = item
            room.broadcast({"t": "arena_item", "item": item}, scene="arena")
            asyncio.get_running_loop().call_later(ARENA_ITEM_LIFE, self.arena_item_expire, room, item["id"])
        asyncio.get_running_loop().call_later(ARENA_ITEM_EVERY, self.arena_item_tick, room)

    def arena_item_expire(self, room, item_id):
        """Power-ups nobody grabs fade away after a few seconds."""
        if room.arena_items.pop(item_id, None):
            room.broadcast({"t": "arena_item_gone", "id": item_id}, scene="arena")

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
        if not f or f["hp"] > 0 or time.monotonic() < room.arena_break:
            return
        f["x"], f["y"] = self.arena_spawn_point(room, key)
        f["hp"], f["spawn"] = ARENA_HP, time.monotonic()
        room.broadcast({"t": "arena_spawn", "k": key, "x": f["x"], "y": f["y"], "hp": f["hp"]}, scene="arena")

    # ---- dungeon (boss cave) -------------------------------------------------------

    @staticmethod
    def boss_view(room):
        b = room.boss["b"]
        if not b:
            return None
        return {"id": b["id"], "name": b["name"], "tier": b["tier"], "x": round(b["x"], 1), "y": round(b["y"], 1),
                "hp": b["hp"], "max": b["max"], "r": b["r"], "st": b["st"], "enraged": b["enraged"]}

    @staticmethod
    def boss_fighter_view(f):
        return {"x": f["x"], "y": f["y"], "a": f["a"], "hp": f["hp"], "max": f["max"], "up": f["up"],
                "shield": f["shield"]}

    @staticmethod
    def mob_view(m):
        return [m["id"], m["kind"], round(m["x"], 1), round(m["y"], 1), m["hp"], m["max"]]

    def dungeon_view(self, room, key, **extra):
        bs = room.boss
        f = bs["fighters"].get(key)
        v = {"t": "boss", "state": bs["state"], "floor": bs["floor"], "best": room.zone.get("dungeonBest", 0),
             "left": round(max(0.0, bs["ends"] - time.monotonic()), 2), "boss": self.boss_view(room),
             "mobs": [self.mob_view(m) for m in bs["mobs"].values()],
             "fighters": {k: self.boss_fighter_view(o) for k, o in bs["fighters"].items()},
             "picked": [k for k, o in bs["fighters"].items() if o["picked"]], "last": bs["last"], "mvp": bs.get("mvp"), **extra}
        if f and bs["state"] == "pick" and not f["picked"]:
            v["choices"] = [{"id": u, **UPGRADES[u], "lvl": f["up"].get(u, 0)} for u in f["choices"]]
        return v

    def dungeon_sync(self, room, **extra):
        for k in room.in_scene("boss"):
            room.clients[k].ws.send(self.dungeon_view(room, k, **extra))

    @staticmethod
    def new_fighter():
        x, y = random.choice(BOSS_SPAWNS)
        return {"x": x, "y": y, "a": -math.pi / 2, "hp": BOSS_PLAYER_HP, "max": BOSS_PLAYER_HP, "down": 0, "rev": 0.0,
                "hurt": time.monotonic(), "up": {}, "shield": False, "wind": False, "picked": False, "choices": [], "poison": 0.0, "ptick": 0.0}

    def boss_join(self, c):
        # you join a group that's still in the lobby (so friends can start together); a run that's already
        # going stays private, and you get your own
        run = next((r for r in c.room.dungeons if r.boss["state"] == "lobby" and r.members), None)
        if not run:
            run = DungeonRun(c.room)
            c.room.dungeons.append(run)
        run.members.add(c.key)
        c.dgn = run
        room, bs = run, run.boss
        f = bs["fighters"][c.key] = self.new_fighter()
        if bs["state"] in ("intro", "fight", "pick"):
            bs["ran"].add(c.key)
            if bs["state"] == "pick":
                f["choices"] = self.dungeon_choices(f)
        b = bs["b"]
        if b and b["st"] != "dead" and c.key not in b["counted"]:
            # a new friend joined mid-fight: the boss toughens up to match
            b["counted"].add(c.key)
            extra = int(b["base"] * 0.65)
            b["max"] += extra
            b["hp"] += extra
        c.ws.send(self.dungeon_view(room, c.key))
        room.broadcast({"t": "boss_add", "k": c.key, **self.boss_fighter_view(f)}, scene="boss", exclude=c)
        if not bs["task"]:
            bs["task"] = asyncio.get_running_loop().create_task(self.boss_loop(room))

    def boss_leave(self, c):
        run, c.dgn = c.dgn, None
        if not run:
            return
        run.members.discard(c.key)
        if run.boss["fighters"].pop(c.key, None) is not None:
            run.broadcast({"t": "boss_del", "k": c.key}, scene="boss")
        if not run.members and not run.boss["task"] and run in run.room.dungeons:
            run.room.dungeons.remove(run)

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
                except Exception as e:  # one bad tick shouldn't end the run
                    print("dungeon tick failed:", repr(e))
        finally:
            bs["task"] = None
            if not bs["fighters"]:
                # everyone left: the next group starts a fresh run
                bs.update(state="lobby", floor=0, b=None, mobs={}, queue=[], dmg={}, ran=set())
                if not room.members and room in room.room.dungeons:
                    room.room.dungeons.remove(room)

    # ---- runs and floors ----

    def on_boss_start(self, c, m):
        room, bs = c.dgn, c.dgn.boss
        if bs["state"] != "lobby" or c.key not in bs["fighters"]:
            return
        for f in bs["fighters"].values():
            f.update(hp=BOSS_PLAYER_HP, max=BOSS_PLAYER_HP, up={}, shield=False, wind=False, picked=False, choices=[], rev=0.0)
        bs.update(floor=0, dmg={}, ran=set(bs["fighters"]), last=None, mvp=None)
        self.post_feed(room.room, f"🏰 {c.player['name']} started a dungeon run!")
        self.dungeon_floor(room, time.monotonic())

    def dungeon_floor(self, room, now):
        """Go one floor deeper: patch everyone up, then either spawn a boss or line up monsters."""
        bs = room.boss
        bs["floor"] += 1
        floor = bs["floor"]
        bs.update(state="intro", ends=now + DUNGEON_INTRO_T, mobs={}, queue=[], b=None, spawn_at=now + DUNGEON_INTRO_T)
        for f in bs["fighters"].values():
            if f["hp"] <= 0:
                f["hp"] = BOSS_REVIVE_HP  # downed friends get back up between floors
            elif f["up"].get("regen"):
                f["hp"] = min(f["max"], f["hp"] + 20 * f["up"]["regen"])
            f["poison"] = 0.0
            f.update(shield=bool(f["up"].get("shield")), picked=False, choices=[], rev=0.0, hurt=now)
        if floor % DUNGEON_BOSS_EVERY == 0:
            self.boss_spawn(room, now)
        else:
            pool = [kind for at, kind in MOB_UNLOCK if floor >= at]
            n = max(1, len(bs["fighters"]))
            count = min(32, 4 + int(floor * 1.6) + 2 * (n - 1))
            newest = [kind for at, kind in MOB_UNLOCK if at == floor]
            bs["queue"] = newest + [random.choice(pool) for _ in range(count - len(newest))]
            random.shuffle(bs["queue"])
        self.dungeon_sync(room, spawn=True)

    def dungeon_choices(self, f):
        pool = [u for u, spec in UPGRADES.items() if f["up"].get(u, 0) < spec["max"]]
        weights = [2 if u in ("heart", "dmg") else 1 for u in pool]
        picks = []
        while pool and len(picks) < 3:
            u = random.choices(pool, weights)[0]
            i = pool.index(u)
            pool.pop(i)
            weights.pop(i)
            picks.append(u)
        return picks

    @staticmethod
    def dungeon_apply(f, u):
        f["up"][u] = f["up"].get(u, 0) + 1
        if u == "heart":
            f["max"] += 25
            if f["hp"] > 0:
                f["hp"] = min(f["max"], f["hp"] + 25)
        elif u == "shield":
            f["shield"] = True

    def dungeon_clear(self, room, now):
        bs = room.boss
        bs.update(state="pick", ends=now + DUNGEON_PICK_T)
        for f in bs["fighters"].values():
            choices = self.dungeon_choices(f)
            f.update(picked=not choices, choices=choices)  # nothing left to pick: don't hold anyone up
        room.broadcast({"t": "boss_clear", "floor": bs["floor"]}, scene="boss")
        self.dungeon_sync(room)

    def on_boss_pick(self, c, m):
        bs = c.dgn.boss
        f = bs["fighters"].get(c.key)
        u = str(m.get("id", ""))
        if bs["state"] != "pick" or not f or f["picked"] or (u not in f["choices"] and u != "skip"):
            return
        if u != "skip":
            self.dungeon_apply(f, u)
        f["picked"] = True
        c.dgn.broadcast({"t": "boss_picked", "k": c.key, "id": u, "f": self.boss_fighter_view(f)}, scene="boss")

    def dungeon_wipe(self, room, now):
        """Everyone is down: the run is over. Pay out by floors cleared and damage dealt."""
        bs = room.boss
        floor, cleared = bs["floor"], bs["floor"] - 1
        record = floor > room.zone.get("dungeonBest", 0)
        if record:
            room.zone["dungeonBest"] = floor
        total = sum(bs["dmg"].values()) or 1
        results = {}
        for k in bs["ran"]:
            c = room.clients.get(k)
            if not c or c.scene != "boss":
                continue
            share = bs["dmg"].get(k, 0) / total
            coins = 25 * cleared + int(150 * share * min(1, cleared / 3)) + (10 if cleared else 0)
            xp = 15 * cleared + int(60 * share)
            c.player["stats"]["dungeonBest"] = max(c.player["stats"].get("dungeonBest", 0), floor)
            self.reward(c, coins=coins, xp=xp)
            results[k] = {"coins": coins, "xp": xp, "dmg": bs["dmg"].get(k, 0)}
        bs.update(state="over", ends=now + DUNGEON_OVER_T, b=None, mobs={}, queue=[],
                  last={"floor": floor, "names": [room.zone["players"][k]["name"] for k in bs["ran"] if k in room.zone["players"]]})
        self.store.mark()
        if record and len(bs["ran"]):
            names = ", ".join(bs["last"]["names"][:4])
            self.post_feed(room.room, f"🏰 New dungeon record! {names} reached floor {floor}.")
        room.broadcast({"t": "boss_wipe", "floor": floor, "record": record, "results": results}, scene="boss")
        self.dungeon_sync(room)

    def boss_tick(self, room, dt, now):
        bs = room.boss
        fighters, st = bs["fighters"], bs["state"]
        if st == "over":
            if now >= bs["ends"]:
                bs["state"] = "lobby"
                self.dungeon_sync(room)
            return
        if st == "lobby":
            return
        if st == "pick":
            if now >= bs["ends"] or all(f["picked"] for f in fighters.values()):
                for f in fighters.values():
                    if not f["picked"] and f["choices"]:
                        self.dungeon_apply(f, random.choice(f["choices"]))
                self.dungeon_floor(room, now)
            return
        b = bs["b"]
        if st == "intro" and now >= bs["ends"]:
            bs["state"] = st = "fight"
            if b:
                b.update(st="fight", next=now + 1.2)
            room.broadcast({"t": "boss_phase", "st": "fight"}, scene="boss")
        # poison drains health a little at a time
        for k, f in fighters.items():
            if f["hp"] <= 0 or f.get("poison", 0) <= now:
                continue
            f["ptick"] = f.get("ptick", 0.0) + dt
            if f["ptick"] < 0.5:
                continue
            f["ptick"] = 0.0
            drain = max(1, round(POISON_DPS * 0.5 * (0.5 if f["up"].get("antidote") else 1) * self.dungeon_scale(bs)))
            f["hp"] = max(0, f["hp"] - drain)
            room.broadcast({"t": "boss_hp", "k": k, "hp": f["hp"], "poison": round(f["poison"] - now, 2), "d": drain}, scene="boss")
            if f["hp"] <= 0:
                f["down"], f["rev"], f["poison"] = now, 0.0, 0.0
                room.broadcast({"t": "boss_down", "k": k}, scene="boss")
        # downed players: a friend standing close revives them
        for k, f in fighters.items():
            if f["hp"] > 0:
                continue
            helped = any(o["hp"] > 0 and math.dist((o["x"], o["y"]), (f["x"], f["y"])) < BOSS_REVIVE_R
                         for ok, o in fighters.items() if ok != k)
            f["rev"] = min(BOSS_REVIVE_T, f["rev"] + dt) if helped else max(0.0, f["rev"] - dt * 0.5)
            wind = f["up"].get("revive") and not f["wind"] and now - f["down"] >= 4
            if f["rev"] >= BOSS_REVIVE_T or wind:
                if wind and f["rev"] < BOSS_REVIVE_T:
                    f["wind"] = True
                f["hp"], f["rev"], f["hurt"], f["poison"] = BOSS_REVIVE_HP, 0.0, now, 0.0
                room.broadcast({"t": "boss_up", "k": k, "hp": BOSS_REVIVE_HP, "helped": helped, "wind": bool(wind and not helped)}, scene="boss")
        if st == "fight":
            if fighters and all(f["hp"] <= 0 for f in fighters.values()):
                self.dungeon_wipe(room, now)
                return
            self.dungeon_dots(room, dt, now)
            cap = min(DUNGEON_MAX_MOBS, 5 + bs["floor"] // 2 + len(fighters))
            if bs["queue"] and now >= bs["spawn_at"] and len(bs["mobs"]) < cap:
                n = min(len(bs["queue"]), 3, cap - len(bs["mobs"]))
                self.spawn_mobs(room, [bs["queue"].pop() for _ in range(n)])
                bs["spawn_at"] = now + 1.3
            self.mobs_tick(room, dt, now)
            if b and b["st"] == "fight":
                self.boss_steer(b, fighters, dt, now)
                if now >= b["next"] and not b["move"]:
                    self.boss_attack(room, b, fighters, now)
            boss_done = not b or (b["st"] == "dead" and now - b["deadAt"] >= 2.5)
            if not bs["mobs"] and not bs["queue"] and boss_done:
                self.dungeon_clear(room, now)
                return
        msg = {"t": "boss_s", "m": {m["id"]: [round(m["x"], 1), round(m["y"], 1)] for m in bs["mobs"].values()},
               "rev": {k: round(f["rev"] / BOSS_REVIVE_T, 2) for k, f in fighters.items() if f["hp"] <= 0}}
        if b:
            msg.update(x=round(b["x"], 1), y=round(b["y"], 1), hp=b["hp"], max=b["max"])
        room.broadcast(msg, scene="boss")

    # ---- monsters ----

    def spawn_mobs(self, room, kinds, near=None):
        bs = room.boss
        mult = 1 + 0.24 * (bs["floor"] - 1) + 0.012 * (bs["floor"] - 1) ** 2  # monsters toughen up as you climb
        players = [(f["x"], f["y"]) for f in bs["fighters"].values()] or [(BOSS_W / 2, BOSS_H / 2)]
        now = time.monotonic()
        out = []
        for kind in kinds:
            spec = MOBS[kind]
            if near:
                x, y = near[0] + random.uniform(-110, 110), near[1] + random.uniform(-60, 110)
            else:
                # come in from the edges, as far from the players as possible
                spots = [(random.choice((40, BOSS_W - 40)), random.uniform(40, BOSS_H - 40)) for _ in range(4)]
                spots += [(random.uniform(40, BOSS_W - 40), random.choice((40, BOSS_H - 40))) for _ in range(4)]
                x, y = max(spots, key=lambda s: min(math.dist(s, p) for p in players))
            bs["mob_id"] += 1
            hp = int(spec["hp"] * mult)
            m = {"id": bs["mob_id"], "kind": kind, "hp": hp, "max": hp, "r": spec["r"], "t": random.uniform(0, 5),
                 "x": min(BOSS_W - spec["r"], max(spec["r"], x)), "y": min(BOSS_H - spec["r"], max(spec["r"], y)),
                 "next": now + random.uniform(1.2, 2.6), "wind": 0.0, "fast": min(1.4, 1 + 0.03 * bs["floor"])}
            bs["mobs"][m["id"]] = m
            out.append(self.mob_view(m))
        if out:
            room.broadcast({"t": "mob_add", "mobs": out, "near": bool(near)}, scene="boss")

    def mobs_tick(self, room, dt, now):
        bs = room.boss
        alive = [f for f in bs["fighters"].values() if f["hp"] > 0]
        if not alive:
            return
        mobs = list(bs["mobs"].values())
        shots = []
        for m in mobs:
            spec, kind = MOBS[m["kind"]], m["kind"]
            f = min(alive, key=lambda o: (o["x"] - m["x"]) ** 2 + (o["y"] - m["y"]) ** 2)
            dx, dy = f["x"] - m["x"], f["y"] - m["y"]
            d = math.hypot(dx, dy) or 1
            ux, uy = dx / d, dy / d
            m["t"] += dt
            if kind == "bat":  # weaves side to side as it swoops in
                w = math.sin(m["t"] * 4) * 0.9
                vx, vy = ux - uy * w, uy + ux * w
            elif kind == "slimelet":  # hops
                hop = m["t"] % 1.1 < 0.45
                vx, vy = (ux * 2.2, uy * 2.2) if hop else (0.0, 0.0)
            elif kind == "archer":  # keeps its distance and strafes
                want = spec["range"]
                s = 1 if d > want + 40 else -1 if d < want - 60 else 0
                side = math.sin(m["t"] * 0.7)
                vx, vy = ux * s - uy * side * 0.6, uy * s + ux * side * 0.6
            elif kind == "toad":  # hops about at a distance
                hop = m["t"] % 1.4 < 0.5
                s = 1 if d > spec["range"] + 30 else -0.6 if d < spec["range"] - 50 else 0.3
                side = math.sin(m["t"] * 0.9)
                vx, vy = ((ux * s - uy * side) * 2.0, (uy * s + ux * side) * 2.0) if hop else (0.0, 0.0)
            elif kind == "wisp":  # drifts about
                vx, vy = ux * 0.5 + math.cos(m["t"]) * 0.8, uy * 0.5 + math.sin(m["t"] * 1.3) * 0.8
            else:  # skeletons and brutes walk straight at you
                vx, vy = ux, uy
            if m["wind"] > now:
                vx = vy = 0.0
            for o in mobs:  # don't stack up on each other
                if o is m:
                    continue
                ox, oy = m["x"] - o["x"], m["y"] - o["y"]
                od, lim = math.hypot(ox, oy), m["r"] + o["r"] + 4
                if 0 < od < lim:
                    vx += ox / od * (lim - od) / lim * 1.5
                    vy += oy / od * (lim - od) / lim * 1.5
            sp = spec["speed"] * m["fast"] * (1 - m["chill"]["slow"] if m.get("chill") and m["chill"]["until"] > now else 1)
            m["x"] = min(BOSS_W - m["r"], max(m["r"], m["x"] + vx * sp * dt))
            m["y"] = min(BOSS_H - m["r"], max(m["r"], m["y"] + vy * sp * dt))
            if "every" in spec and now >= m["next"]:
                m["next"] = now + spec["every"] * random.uniform(0.85, 1.2)
                if kind == "toad" and d < spec["range"] + 180:
                    shots.append({"x": round(m["x"]), "y": round(m["y"]), "a": round(math.atan2(dy, dx), 3), "n": 1, "sp": 190, "p": 1})
                elif kind == "archer" and d < spec["range"] + 160:
                    shots.append({"x": round(m["x"]), "y": round(m["y"]), "a": round(math.atan2(dy, dx), 3), "n": 1, "sp": 250})
                elif kind == "wisp":
                    shots.append({"x": round(m["x"]), "y": round(m["y"]), "a": round(random.uniform(0, math.tau), 3), "n": 6, "sp": 165})
                elif kind == "brute" and d < 220:
                    m["wind"] = now + 0.9
                    room.broadcast({"t": "boss_atk", "kind": "slam", "c": [[round(f["x"]), round(f["y"])]], "r": 62, "d": 0.9,
                                    "mob": m["id"]}, scene="boss")
                else:
                    m["next"] = now + 0.5
        if shots:
            room.broadcast({"t": "mob_shot", "s": shots}, scene="boss")

    # ---- bosses ----

    def boss_spawn(self, room, now):
        bs = room.boss
        idx = bs["floor"] // DUNGEON_BOSS_EVERY - 1
        spec = BOSSES[idx % len(BOSSES)]
        tier = idx // len(BOSSES)
        n = max(1, len(bs["fighters"]))
        base = int(spec["hp"] * (1 + 0.45 * tier) * (1 + 0.12 * (bs["floor"] - 1)))
        hp = int(base * (1 + 0.65 * (n - 1)))
        bs["b"] = {"spec": spec, "id": spec["id"], "name": spec["name"], "tier": tier, "x": BOSS_W / 2, "y": 170.0,
                   "hp": hp, "max": hp, "base": base, "r": spec["r"], "st": "intro", "next": now + 99, "target": None,
                   "retarget": 0.0, "move": None, "enraged": False, "dmg": {}, "counted": set(bs["fighters"]), "deadAt": 0.0}

    @staticmethod
    def boss_steer(b, fighters, dt, now):
        mv = b["move"]
        if mv:  # scripted dash, hop or teleport
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
        keep = b["r"] + 70 + (120 if b["id"] == "lich" else 0)  # the lich hangs back behind its minions
        if d > keep:
            chill = 1 - b["chill"]["slow"] * 0.6 if b.get("chill") and b["chill"]["until"] > now else 1  # bosses shrug off some of it
            step = min(d - keep, b["spec"]["speed"] * (1.35 if b["enraged"] else 1) * chill * dt)
            b["x"] += dx / d * step
            b["y"] += dy / d * step
        b["x"] = min(BOSS_W - b["r"], max(b["r"], b["x"]))
        b["y"] = min(BOSS_H - b["r"], max(b["r"], b["y"]))

    def boss_attack(self, room, b, fighters, now):
        bs = room.boss
        alive = [f for f in fighters.values() if f["hp"] > 0]
        kind = random.choice(b["spec"]["attacks"])
        if kind in ("charge", "hop") and not alive:
            kind = "volley"
        if kind == "summon" and len(bs["mobs"]) >= DUNGEON_MAX_MOBS - 3:
            kind = "volley"
        rage, x, y, r = b["enraged"], b["x"], b["y"], b["r"]
        msg = {"t": "boss_atk", "kind": kind}
        busy = 0.0  # how long the attack keeps the boss occupied
        if kind == "slam":
            targets = alive if rage else random.sample(alive, min(len(alive), 2))
            spots = [(f["x"], f["y"]) for f in targets] or [(x, y + 130)]
            msg.update(c=[[round(sx), round(sy)] for sx, sy in spots], r=85, d=1.1)
        elif kind == "puddles":
            # blobs of poison that splash down and linger on the floor
            spots = [(f["x"] + random.uniform(-30, 30), f["y"] + random.uniform(-30, 30)) for f in alive]
            spots += [(random.uniform(80, BOSS_W - 80), random.uniform(80, BOSS_H - 80)) for _ in range(4 if rage else 2)]
            msg.update(c=[[round(sx), round(sy)] for sx, sy in spots], r=64, d=1.1, linger=5.5 if rage else 4.5)
            busy = 0.8
        elif kind in ("rocks", "curse"):
            spots = [(f["x"], f["y"]) for f in alive]
            spots += [(random.uniform(60, BOSS_W - 60), random.uniform(60, BOSS_H - 60)) for _ in range(5 if rage else 3)]
            msg.update(c=[[round(sx), round(sy)] for sx, sy in spots], r=62 if kind == "rocks" else 72, d=1.3 if kind == "rocks" else 1.2)
        elif kind == "volley":
            if b["spec"].get("poison"):
                msg["p"] = 1
            msg.update(x=round(x), y=round(y), n=18 if rage else 12, sp=240 if rage else 205,
                       off=round(random.uniform(0, math.tau), 3), d=0.55, waves=2 if rage else 1, gap=0.4, rot=0.13)
        elif kind == "spiral":
            if b["spec"].get("poison"):
                msg["p"] = 1
            waves = 11 if rage else 8
            msg.update(x=round(x), y=round(y), n=6, sp=215, off=round(random.uniform(0, math.tau), 3), d=0.5,
                       waves=waves, gap=0.16, rot=0.3 * random.choice((-1, 1)))
            busy = waves * 0.16
        elif kind == "summon":
            count = (4 if rage else 3) + (len(alive) > 2)
            msg.update(x=round(x), y=round(y), d=0.9)
            minions = [random.choice(b["spec"]["minions"]) for _ in range(count)]
            asyncio.get_running_loop().call_later(0.9, self.boss_summon, room, b, minions)
            busy = 1.2
        elif kind == "blink":
            spots = [(random.uniform(120, BOSS_W - 120), random.uniform(100, BOSS_H - 160)) for _ in range(6)]
            tx, ty = max(spots, key=lambda s: min((math.dist(s, (f["x"], f["y"])) for f in alive), default=0))
            msg.update(x=round(x), y=round(y), tx=round(tx), ty=round(ty), d=0.6)
            b["move"] = {"x0": tx, "y0": ty, "x1": tx, "y1": ty, "t0": now + 0.6, "t1": now + 0.62}
            busy = 0.9
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

    def boss_summon(self, room, b, minions):
        room_left = DUNGEON_MAX_MOBS - len(room.boss["mobs"])
        if room.boss["b"] is b and b["st"] == "fight" and room.boss["state"] == "fight" and room_left > 0:
            self.spawn_mobs(room, minions[:room_left], near=(b["x"], b["y"]))

    # ---- players ----

    def on_boss_move(self, c, m):
        f = c.dgn.boss["fighters"].get(c.key)
        if not f or f["hp"] <= 0:
            return
        f["x"], f["y"], f["a"] = num(m["x"], 0, BOSS_W), num(m["y"], 0, BOSS_H), num(m["a"], -7, 7)
        c.dgn.broadcast({"t": "boss_pos", "k": c.key, "x": round(f["x"], 1), "y": round(f["y"], 1),
                          "a": round(f["a"], 2)}, scene="boss", exclude=c)

    def on_boss_shoot(self, c, m):
        f = c.dgn.boss["fighters"].get(c.key)
        if not f or f["hp"] <= 0 or not c.ready("shoot", 0.06):
            return
        c.dgn.broadcast({"t": "boss_shot", "k": c.key, "x": num(m["x"], 0, BOSS_W), "y": num(m["y"], 0, BOSS_H),
                          "a": num(m["a"], -7, 7), "n": int(num(m.get("n", 1), 1, 4))}, scene="boss", exclude=c)

    def on_boss_hit(self, c, m):
        """Sent when one of your shots hits a monster (id) or the boss (no id)."""
        room, bs = c.dgn, c.dgn.boss
        f = bs["fighters"].get(c.key)
        if bs["state"] != "fight" or not f or f["hp"] <= 0 or not c.ready("boss_hit", 0.02):
            return
        up = f["up"]
        crit = random.random() < 0.06 + 0.07 * up.get("crit", 0)
        # upgrades help, but gently: a volley of split shots is worth ~60% more per extra bullet, not 100%
        n = 1 + up.get("multi", 0)
        dmg = int(DUNGEON_DMG * (1 + 0.18 * up.get("dmg", 0)) * ((1 + 0.6 * (n - 1)) / n) * (2 if crit else 1))
        if m.get("id") is not None:
            target = bs["mobs"].get(int(num(m["id"], 0, 1e9)))
            if not target:
                return
        else:
            target = bs["b"]
            if not target or target["st"] != "fight":
                return
        self.dungeon_status(target, up, c.key, time.monotonic())
        self.dungeon_damage(room, target, c.key, dmg, crit=crit)

    @staticmethod
    def dungeon_status(target, up, key, now):
        """Elemental rounds: set it burning, chill it, or add a stack of poison."""
        if up.get("fire"):
            target["burn"] = {"until": now + 3.0, "dps": 4 + 4 * up["fire"], "k": key}
        if up.get("ice"):
            target["chill"] = {"until": now + 2.0, "slow": 0.2 + 0.15 * up["ice"]}
        if up.get("venom"):
            v = target.get("venom")
            stacks = min(5, (v["n"] if v and v["until"] > now else 0) + 1)
            target["venom"] = {"until": now + 4.0, "n": stacks, "dps": (2 + 1.5 * up["venom"]) * stacks, "k": key}

    def dungeon_damage(self, room, target, key, dmg, crit=False, fx=None):
        """Damage a monster or the boss (whichever `target` is) on behalf of player `key`."""
        bs = room.boss
        dmg = max(0, min(int(dmg), int(target["hp"])))
        if dmg <= 0:
            return
        target["hp"] -= dmg
        bs["dmg"][key] = bs["dmg"].get(key, 0) + dmg
        now = time.monotonic()
        status = [k for k in ("burn", "chill", "venom") if target.get(k) and target[k]["until"] > now]
        if target is bs["b"]:
            b = target
            b["dmg"][key] = b["dmg"].get(key, 0) + dmg
            room.broadcast({"t": "boss_dmg", "k": key, "d": dmg, "hp": b["hp"], "crit": crit, "fx": fx, "st": status}, scene="boss")
            if not b["enraged"] and b["hp"] <= b["max"] / 2:
                b["enraged"] = True
                room.broadcast({"t": "boss_phase", "st": "enraged"}, scene="boss")
            if b["hp"] <= 0:
                self.boss_defeat(room, b)
            return
        mob = target
        if mob["hp"] <= 0:
            bs["mobs"].pop(mob["id"], None)
            room.broadcast({"t": "mob_die", "id": mob["id"], "k": key, "d": dmg, "crit": crit, "fx": fx}, scene="boss")
        else:
            room.broadcast({"t": "mob_dmg", "id": mob["id"], "hp": mob["hp"], "k": key, "d": dmg, "crit": crit, "fx": fx, "st": status}, scene="boss")

    def dungeon_dots(self, room, dt, now):
        """Burning and poisoned monsters (and bosses) take damage every half second."""
        bs = room.boss
        targets = list(bs["mobs"].values()) + ([bs["b"]] if bs["b"] and bs["b"]["st"] == "fight" else [])
        for t in targets:
            for kind in ("burn", "venom"):
                st = t.get(kind)
                if not st or st["until"] <= now:
                    continue
                st["acc"] = st.get("acc", 0.0) + dt
                if st["acc"] < 0.5:
                    continue
                st["acc"] -= 0.5
                self.dungeon_damage(room, t, st["k"], max(1, round(st["dps"] * 0.5)), fx=kind)
                if t["hp"] <= 0:
                    break

    @staticmethod
    def dungeon_scale(bs):
        """Monsters hit a little harder on every floor."""
        return 1 + 0.045 * max(0, bs["floor"] - 1)

    def on_boss_hurt(self, c, m):
        """Sent by a player who got caught by an attack; friends are trusted to be honest."""
        room, bs = c.dgn, c.dgn.boss
        f = bs["fighters"].get(c.key)
        now = time.monotonic()
        if bs["state"] != "fight" or not f or f["hp"] <= 0 or now - f["hurt"] < BOSS_IFRAMES:
            if f and f["hp"] > 0 and m.get("src") == "puddle" and bs["state"] == "fight":
                f["poison"] = max(f["poison"], now + POISON_T * (0.5 if f["up"].get("antidote") else 1))  # still keeps you poisoned
            return
        f["hurt"] = now
        if f["shield"]:
            f["shield"] = False
            room.broadcast({"t": "boss_shield", "k": c.key}, scene="boss")
            return
        src = str(m.get("src", "shot"))
        dmg = max(1, round(HIT_DMG.get(src, HIT_DMG["shot"]) * self.dungeon_scale(bs)))
        if src in ("poison", "puddle"):
            f["poison"] = now + POISON_T * (0.5 if f["up"].get("antidote") else 1)
        f["hp"] = max(0, f["hp"] - dmg)
        room.broadcast({"t": "boss_hp", "k": c.key, "hp": f["hp"], "d": dmg,
                        "poison": round(max(0.0, f["poison"] - now), 2)}, scene="boss")
        if f["hp"] <= 0:
            f["poison"] = 0.0
            f["down"], f["rev"] = now, 0.0
            room.broadcast({"t": "boss_down", "k": c.key}, scene="boss")

    def boss_defeat(self, room, b):
        spec, bs = b["spec"], room.boss
        b.update(st="dead", move=None, deadAt=time.monotonic())
        for mid in list(bs["mobs"]):  # its minions crumble with it
            room.broadcast({"t": "mob_die", "id": mid, "k": None}, scene="boss")
        bs["mobs"] = {}
        room.zone["bossKills"] = room.zone.get("bossKills", 0) + 1
        self.store.mark()
        total = sum(b["dmg"].values()) or 1
        mvp = max(b["dmg"], key=b["dmg"].get) if b["dmg"] else None
        room.boss["mvp"] = mvp  # wears a crown through the next floor
        results = {}
        for k in list(bs["fighters"]):
            c = room.clients.get(k)
            if not c or c.scene != "boss":
                continue
            dealt = b["dmg"].get(k, 0)
            share = dealt / total
            coins = 60 + int(220 * share) + 40 * b["tier"] + (80 if k == mvp and len(b["dmg"]) > 1 else 0)
            xp = 40 + int(100 * share)
            loot = []
            if spec["loot"] in FURN and not c.player["furni"].get(spec["loot"]):
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
        self.post_feed(room.room, f"👾 {spec['name']} was defeated on floor {bs['floor']}!" + (f" MVP: {mvp_name}" if mvp_name else ""))

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
        # how many times everyone gets to draw: the starter picks (1-6), or it's more with fewer players
        try:
            rounds = max(1, min(6, int(m.get("rounds"))))
        except (TypeError, ValueError):
            rounds = 4 if len(players) <= 2 else 3 if len(players) <= 4 else 2
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
        if d["state"] != "choosing" or c.key != d["drawer"]:
            return
        if "word" in m:
            # the artist made up their own word
            word = clean(m.get("word"), 24)
            if not DOODLE_CUSTOM_RE.match(word) or len(squash(word)) < 2:
                raise GameError("Custom words are 2–24 letters, numbers, spaces or dashes.")
            self.check_clean(c.room, word, "That word")
            self.doodle_begin(c.room, word.lower())
            c.room.broadcast({"t": "doodle_msg", "sys": f"✏️ {c.player['name']} made up their own word!"}, scene="doodle")
            return
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
        self.check_clean(room, text, "Your message")
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

    # ---- Coral Cove: crab races ------------------------------------------
    # Crab races run on a loop while anyone's at the beach: bet on a crab, watch them scuttle, 3.5x if yours wins.

    def beach_join(self, c):
        room = c.room
        for court in room.matches:
            c.ws.send(self.match_view(room, court))
        c.ws.send({"t": "beach", "balls": [{k: v for k, v in b.items() if k != "lock"} for b in room.balls.values()],
                   "courts": {k: v["s"] for k, v in room.courts.items()}, "boats": room.boats})
        if room.crabs["state"] == "idle":
            self.crab_round(room, room.crabs["id"])
        else:
            c.ws.send(self.crab_view(room))

    def crab_view(self, room):
        r = room.crabs
        return {"t": "crabs", "state": r["state"], "left": round(max(0.0, r["ends"] - time.monotonic()), 2), "bets": r["bets"],
                "times": r["times"], "winner": r["winner"], "history": r["history"], "names": CRAB_NAMES, "pays": CRAB_PAYS}

    def crab_round(self, room, token):
        r = room.crabs
        if token != r["id"]:
            return
        r["id"] += 1
        if not room.in_scene("beach"):
            r.update(state="idle", bets={})
            return
        r.update(state="betting", ends=time.monotonic() + CRAB_BET_T, bets={}, times=[], winner=None)
        room.broadcast(self.crab_view(room), scene="beach")
        asyncio.get_running_loop().call_later(CRAB_BET_T, self.crab_race, room, r["id"])

    def crab_race(self, room, token):
        r = room.crabs
        if token != r["id"]:
            return
        r["id"] += 1
        winner = random.randrange(4)
        times = [round(random.uniform(8.1, CRAB_RACE_T - 0.2), 2) for _ in range(4)]
        times[winner] = round(random.uniform(7.2, 7.9), 2)
        r.update(state="racing", winner=winner, times=times, ends=time.monotonic() + CRAB_RACE_T)
        room.broadcast(self.crab_view(room), scene="beach")
        asyncio.get_running_loop().call_later(CRAB_RACE_T, self.crab_payout, room, r["id"])

    def crab_payout(self, room, token):
        r = room.crabs
        if token != r["id"]:
            return
        r["id"] += 1
        w, wins = r["winner"], {}
        for k, bets in r["bets"].items():
            total = int(sum(b["amount"] for b in bets if b["crab"] == w) * CRAB_PAYS)
            wins[k] = total
            if not total:
                continue
            c = room.clients.get(k)
            if c:
                self.reward(c, coins=total, xp=3)
            else:
                room.zone["players"][k]["coins"] += total
                self.store.mark()
            if total >= 1000:
                self.post_feed(room, f"🦀 {room.zone['players'][k]['name']} won {total:,} coins on {CRAB_NAMES[w]} at the crab races!")
        r["history"] = ([w] + r["history"])[:10]
        r.update(state="result", ends=time.monotonic() + CRAB_PAUSE_T)
        room.broadcast({**self.crab_view(room), "wins": wins}, scene="beach")
        asyncio.get_running_loop().call_later(CRAB_PAUSE_T, self.crab_round, room, r["id"])

    def on_crab_bet(self, c, m):
        room = c.room
        r = room.crabs
        if c.scene != "beach" or r["state"] != "betting":
            raise GameError("Bets are closed. Wait for the next race!")
        crab, amount = int(m.get("crab", -1)), int(m.get("amount", 0))
        if not 0 <= crab < 4 or amount not in CRAB_BETS:
            raise GameError("That isn't a bet.")
        mine = r["bets"].setdefault(c.key, [])
        if sum(b["amount"] for b in mine) + amount > 2000:
            raise GameError("That's the table limit: 2,000 coins a race.")
        if c.player["coins"] < amount:
            raise GameError("You don't have enough coins.")
        c.player["coins"] -= amount
        mine.append({"crab": crab, "amount": amount})
        self.store.mark()
        self.push_player(room, c.key)
        room.broadcast({"t": "crab_bets", "bets": r["bets"]}, scene="beach")

    # ---- arcade ------------------------------------------------------------------
    # Each cabinet is a little 2D game played in your browser; the server keeps a top-10 board per game
    # for the zone and pays a few coins for a good run.

    def on_arcade_play(self, c, m):
        """Put your coins in a cabinet (in the Arcade): one go, which pays out tickets at the end."""
        game = str(m.get("g", ""))
        if game not in ARCADE_GAMES or c.scene != "arcade" or not c.ready("arcade_play", 0.5):
            return
        if c.player["coins"] < ARCADE_PLAY_COST:
            raise GameError(f"A go costs {ARCADE_PLAY_COST} coins.")
        self.reward(c, coins=-ARCADE_PLAY_COST)
        c.arcade_paid = game
        c.ws.send({"t": "arcade_go", "g": game})

    def on_arcade_score(self, c, m):
        game = str(m.get("g", ""))
        cfg = ARCADE_GAMES.get(game)
        if not cfg or c.scene not in ("arcade", "beach"):
            return
        score = int(num(m.get("s", 0), 0, cfg["max"]))
        paid = c.scene == "arcade"
        if paid:  # (only a go you paid for counts)
            if getattr(c, "arcade_paid", None) != game:
                return
            c.arcade_paid = None
        elif not c.ready("arcade", 3):
            return
        boards = c.room.zone.setdefault("arcade", {})
        board = boards.setdefault(game, [])
        mine = next((e for e in board if e["k"] == c.key), None)
        best = score > (mine["s"] if mine else -1)
        if best:
            if mine:
                board.remove(mine)
            board.append({"k": c.key, "s": score, "ts": int(time.time())})
            board.sort(key=lambda e: (-e["s"], e["ts"]))
            del board[10:]
        top = bool(board) and board[0]["k"] == c.key and best and score > 0
        earned = min(cfg["cap"], int(score * cfg["pay"]))
        if paid:
            tickets = max(2, earned)
            c.player["tickets"] = c.player.get("tickets", 0) + tickets
            self.reward(c, xp=min(40, tickets // 2))
            c.ws.send({"t": "arcade_result", "g": game, "s": score, "coins": 0, "tickets": tickets, "best": best})
        else:
            self.reward(c, coins=earned, xp=min(40, earned // 2))
            c.ws.send({"t": "arcade_result", "g": game, "s": score, "coins": earned, "best": best})
        if best:
            self.store.mark()
            c.room.broadcast({"t": "arcade_board", "g": game, "board": board})
        if top and len(board) > 1:
            self.post_feed(c.room, f"🕹️ {c.player['name']} set a new {cfg['name']} high score: {score:,}!")

    def on_claw_play(self, c, m):
        """A go on the claw machine: `prize` is the plushie the claw came down on, `aim` (0..1) how
        well it lined up. Win and that plushie goes into your house storage."""
        if c.scene != "arcade" or not c.ready("claw", 1.5):
            return
        prize = FURN.get(str(m.get("prize", "")))
        if not prize or not prize.get("claw"):
            return
        if c.player["coins"] < CLAW_COST:
            raise GameError(f"The claw costs {CLAW_COST} coins.")
        aim = num(m.get("aim", 0), 0, 1)
        self.reward(c, coins=-CLAW_COST)
        odds = (0.12 + 0.55 * aim) * CLAW_RARITY.get(prize.get("rarity", "common"), 1)
        win = random.random() < odds
        bonus = None
        if win:
            p = c.player
            p["furni"][prize["id"]] = min(prize.get("max", 30), p["furni"].get(prize["id"], 0) + 1)
            plush = ITEMS.get("hand_plushie")
            if plush and plush["id"] not in p["owned"] and random.random() < CLAW_PLUSH_CHANCE:
                bonus = plush["id"]
                self.grant(c, plush, "claw")
            if prize.get("rarity") == "epic":
                self.post_feed(c.room, f"🕹️ {p['name']} won the {prize['name']} from the claw machine!")
            self.store.mark()
            self.push_player(c.room, c.key)
        c.ws.send({"t": "claw_result", "win": win, "prize": prize["id"], "item": bonus})

    def on_ticket_shop(self, c, m):
        hour = int(time.time() // 3600)
        c.ws.send({"t": "ticket_shop", "items": ticket_shop(hour), "ends": (hour + 1) * 3600})

    def on_ticket_buy(self, c, m):
        """Swap tickets for something from this hour's prize counter."""
        if c.scene != "arcade" or not c.ready("ticket_buy", 0.5):
            return
        entry = next((e for e in ticket_shop(int(time.time() // 3600)) if e["id"] == m.get("id")), None)
        if not entry:
            raise GameError("That prize isn't on the counter any more. The prizes change every hour!")
        item = ITEMS[entry["id"]]
        if item["id"] in c.player["owned"]:
            raise GameError("You already have that.")
        if c.player.get("tickets", 0) < entry["price"]:
            raise GameError(f"You need {entry['price']:,} tickets for that.")
        c.player["tickets"] -= entry["price"]
        self.grant(c, item, "tickets")
        self.push_player(c.room, c.key)

    # ---- laser tag ------------------------------------------------------------------

    @staticmethod
    def lt_view(f):
        return {"team": f["team"], "x": f["x"], "y": f["y"], "a": f["a"], "score": f["score"], "tags": f["tags"], "hits": f["hits"]}

    def lt_state(self, room):
        now = time.monotonic()
        return {"t": "lt", "players": {k: self.lt_view(f) for k, f in room.lt.items()}, "map": LT_MAP,
                "left": round(max(0.0, room.lt_end - now), 1), "brk": round(max(0.0, room.lt_break - now), 1),
                "pick": round(max(0.0, room.lt_pick - now), 1),
                "tags": room.lt_tags, "pts": [LT_TAG_PTS, LT_HIT_PTS], "stun": LT_STUN}

    @staticmethod
    def lt_spawn(room, team):
        spots = LT_MAP["spawns"][team]
        others = [(f["x"], f["y"]) for f in room.lt.values()]
        if not others:
            return list(random.choice(spots))
        return list(max(spots, key=lambda s: min(math.dist(s, o) for o in others) + random.random() * 40))

    def lt_join(self, c):
        """Through the Laser Tag door: pay for a go, join the smaller team, and start a round if none is on."""
        room = c.room
        if c.player["coins"] < ARCADE_PLAY_COST:
            c.ws.send({"t": "lt_denied", "msg": f"Laser Tag costs {ARCADE_PLAY_COST} coins."})
            return
        self.reward(c, coins=-ARCADE_PLAY_COST)
        counts = {t: sum(1 for f in room.lt.values() if f["team"] == t) for t in LT_TEAMS}
        team = min(LT_TEAMS, key=lambda t: (counts[t], random.random()))
        x, y = self.lt_spawn(room, team)
        room.lt[c.key] = {"team": team, "x": x, "y": y, "a": 0 if team == "red" else math.pi, "score": 0, "tags": 0, "hits": 0,
                          "stun": 0.0, "spawn": time.monotonic()}
        now = time.monotonic()
        if not room.lt_end and now >= room.lt_break and now >= room.lt_pick:
            self.lt_begin_pick(room)
        c.ws.send(self.lt_state(room))
        room.broadcast({"t": "lt_add", "k": c.key, **self.lt_view(room.lt[c.key])}, scene="lasertag", exclude=c)

    def lt_leave(self, c):
        room = c.room
        if room.lt.pop(c.key, None) is None:
            return
        room.broadcast({"t": "lt_del", "k": c.key}, scene="lasertag")
        if not room.lt:  # everyone's gone: stop the round
            room.lt_round += 1
            room.lt_end = 0.0
            room.lt_break = 0.0
            room.lt_pick = 0.0
            room.lt_tags = {"red": 0, "blue": 0}

    def lt_begin_pick(self, room):
        """Before a round: LT_PICK seconds to choose a team (you can walk around, but not shoot yet)."""
        room.lt_round += 1
        room.lt_end = 0.0
        room.lt_pick = time.monotonic() + LT_PICK
        asyncio.get_running_loop().call_later(LT_PICK, self.lt_go, room, room.lt_round)

    def on_lt_team(self, c, m):
        """Pick a team while teams are being picked (no team can get more than one player ahead)."""
        room = c.room
        f = room.lt.get(c.key)
        team = m.get("team")
        if not f or team not in LT_TEAMS or team == f["team"] or room.lt_end:
            return
        counts = {t: sum(1 for g in room.lt.values() if g["team"] == t) for t in LT_TEAMS}
        other = LT_TEAMS[1 - LT_TEAMS.index(team)]
        if counts[team] + 1 > (counts[other] - 1) + 1:  # (after the switch)
            raise GameError(f"The {team} team is full. Teams can't be more than one player apart.")
        f["team"] = team
        f["x"], f["y"] = self.lt_spawn(room, team)
        room.broadcast({"t": "lt_team", "k": c.key, "team": team, "x": f["x"], "y": f["y"]}, scene="lasertag")

    def lt_go(self, room, round_id):
        """Picking's over: everyone back to their base and the round begins."""
        if round_id != room.lt_round or not room.lt:
            return
        now = time.monotonic()
        for f in room.lt.values():
            f["x"] = f["y"] = -9999
        for f in room.lt.values():
            f["x"], f["y"] = self.lt_spawn(room, f["team"])
            f.update(a=0 if f["team"] == "red" else math.pi, score=0, tags=0, hits=0, stun=0.0, spawn=now)
        room.lt_pick = 0.0
        self.lt_start(room)
        room.broadcast(self.lt_state(room), scene="lasertag")

    def lt_start(self, room):
        room.lt_round += 1
        room.lt_end = time.monotonic() + LT_ROUND
        room.lt_tags = {"red": 0, "blue": 0}
        asyncio.get_running_loop().call_later(LT_ROUND, self.lt_round_over, room, room.lt_round)

    def on_lt_move(self, c, m):
        f = c.room.lt.get(c.key)
        if not f:
            return
        f["x"], f["y"], f["a"] = num(m.get("x", 0), 0, LT_W), num(m.get("y", 0), 0, LT_H), num(m.get("a", 0), -7, 7)
        c.room.broadcast({"t": "lt_pos", "k": c.key, "x": round(f["x"], 1), "y": round(f["y"], 1), "a": round(f["a"], 2),
                          "h": round(num(m.get("h", 0), 0, 8), 2), "pr": bool(m.get("pr"))}, scene="lasertag", exclude=c)

    def on_lt_shoot(self, c, m):
        """A hitscan shot: the shooter's game works out what the beam hit (friends are trusted)."""
        room = c.room
        f = room.lt.get(c.key)
        now = time.monotonic()
        if not f or not room.lt_end or now < f["stun"] or not c.ready("lt_shoot", 0.22):
            return
        room.broadcast({"t": "lt_beam", "k": c.key, "x": num(m.get("x", 0), 0, LT_W), "y": num(m.get("y", 0), 0, LT_H),
                        "h": round(num(m.get("h", 1.4), 0, 8), 2), "a": round(num(m.get("a", 0), -7, 7), 3),
                        "p": round(num(m.get("p", 0), -1.6, 1.6), 3), "len": round(num(m.get("len", 0), 0, 2000), 1)},
                       scene="lasertag", exclude=c)
        victim_key = str(m.get("hit") or "")
        v = room.lt.get(victim_key)
        if not v or victim_key == c.key or v["team"] == f["team"] or now < v["stun"] or now - v["spawn"] < 1.5:
            return
        if math.dist((f["x"], f["y"]), (v["x"], v["y"])) > num(m.get("len", 0), 0, 2000) + 120:
            return  # (the beam couldn't have reached them)
        v["stun"] = now + LT_STUN
        f["score"] += LT_TAG_PTS
        f["tags"] += 1
        v["score"] = max(0, v["score"] - LT_HIT_PTS)
        v["hits"] += 1
        room.lt_tags[f["team"]] += 1
        room.broadcast({"t": "lt_tag", "by": c.key, "k": victim_key, "s1": f["score"], "s2": v["score"],
                        "tags": room.lt_tags}, scene="lasertag")

    def lt_round_over(self, room, round_id):
        if round_id != room.lt_round or not room.lt:
            return
        red, blue = room.lt_tags["red"], room.lt_tags["blue"]
        winner = "red" if red > blue else "blue" if blue > red else None
        board = sorted(({"k": k, "team": f["team"], "score": f["score"], "tags": f["tags"], "hits": f["hits"]} for k, f in room.lt.items()),
                       key=lambda e: -e["score"])
        payouts = {}
        for e in board:
            cl = room.clients.get(e["k"])
            if not cl:
                continue
            tickets = max(5, e["score"] // 10) + (25 if e["team"] == winner else 0)
            cl.player["tickets"] = cl.player.get("tickets", 0) + tickets
            payouts[e["k"]] = tickets
            self.reward(cl, xp=min(60, 10 + e["tags"] * 3))
        room.lt_end = 0.0
        room.lt_break = time.monotonic() + LT_BREAK
        room.broadcast({"t": "lt_round", "winner": winner, "tags": room.lt_tags, "board": board, "tickets": payouts, "secs": LT_BREAK},
                       scene="lasertag")
        asyncio.get_running_loop().call_later(LT_BREAK, self.lt_next_round, room, round_id)

    def lt_next_round(self, room, round_id):
        """After the results: pick teams again (they stay as they were unless people switch)."""
        if round_id != room.lt_round or not room.lt:
            return
        room.lt_break = 0.0
        self.lt_begin_pick(room)
        room.broadcast(self.lt_state(room), scene="lasertag")

    # ---- trading (only in the tavern) ----------------------------------------------
    # Walk up to someone in the tavern and ask to trade. Both put coins, cosmetics and furniture on
    # the table; once both press Ready, the swap happens all at once.

    def tradable_item(self, item_id):
        it = ITEMS.get(item_id)
        return bool(it) and not it.get("free") and "unlock" not in it and "achievement" not in it

    def trade_of(self, room, key):
        return next((t for t in room.trades.values() if key in t["who"]), None)

    def trade_view(self, t):
        return {"t": "trade", "id": t["id"], "who": t["who"], "offers": t["offers"], "ready": t["ready"]}

    def trade_send(self, room, t, msg=None):
        for k in t["who"]:
            cl = room.clients.get(k)
            if cl:
                cl.ws.send(msg or self.trade_view(t))

    def trade_drop(self, room, key, why):
        t = self.trade_of(room, key)
        if t:
            room.trades.pop(t["id"], None)
            self.trade_send(room, t, {"t": "trade_closed", "id": t["id"], "why": f"{room.zone['players'].get(key, {}).get('name', 'They')} {why}."})

    def on_trade_ask(self, c, m):
        room = c.room
        if c.scene != "tavern":
            raise GameError("Trading happens inside the Trading Tavern.")
        key, other = self.find_member(room.zone, m.get("to"))
        cl = room.clients.get(key)
        if not other or key == c.key or not cl or cl.scene != "tavern":
            raise GameError("They need to be here in the tavern to trade.")
        if self.trade_of(room, c.key) or self.trade_of(room, key):
            raise GameError("One of you is already trading.")
        if not c.ready("trade_ask", 3):
            raise GameError("Hang on a moment before asking again.")
        cl.ws.send({"t": "trade_asked", "from": c.key})
        self.sys(c, f"Asked {other['name']} to trade…")

    def on_trade_answer(self, c, m):
        room = c.room
        key, other = self.find_member(room.zone, m.get("from"))
        asker = room.clients.get(key)
        if not other or not asker:
            return
        if not m.get("yes"):
            return self.sys(asker, f"{c.player['name']} said no thanks.")
        if c.scene != "tavern" or asker.scene != "tavern":
            raise GameError("You both need to be in the tavern.")
        if self.trade_of(room, c.key) or self.trade_of(room, key):
            raise GameError("One of you is already trading.")
        room.trade_seq += 1
        empty = lambda: {"coins": 0, "items": [], "furni": {}}
        t = {"id": room.trade_seq, "who": [key, c.key], "offers": {key: empty(), c.key: empty()}, "ready": {key: False, c.key: False}}
        room.trades[t["id"]] = t
        self.trade_send(room, t)

    def check_offer(self, p, offer):
        """Make sure someone still has everything they put on the table."""
        if offer["coins"] > p["coins"]:
            raise GameError(f"{p['name']} doesn't have {offer['coins']:,} coins.")
        for i in offer["items"]:
            if i not in p["owned"] or not self.tradable_item(i):
                raise GameError(f"{p['name']} can't trade that item.")
        placed = {}
        for it in p["house"]["items"]:
            placed[it["id"]] = placed.get(it["id"], 0) + 1
        for fid, n in offer["furni"].items():
            if fid not in FURN or "price" not in FURN[fid] or p["furni"].get(fid, 0) - placed.get(fid, 0) < n:
                raise GameError(f"{p['name']} doesn't have that furniture free to trade (put it away first).")

    def on_trade_offer(self, c, m):
        room = c.room
        t = self.trade_of(room, c.key)
        if not t:
            return
        offer = {
            "coins": int(num(m.get("coins", 0), 0, 10**9)),
            "items": [str(i) for i in list(m.get("items") or [])[:24]],
            "furni": {str(k): int(num(v, 1, 20)) for k, v in dict(m.get("furni") or {}).items() if int(num(v, 0, 20)) > 0},
        }
        offer["items"] = list(dict.fromkeys(offer["items"]))
        self.check_offer(c.player, offer)
        t["offers"][c.key] = offer
        t["ready"] = {k: False for k in t["who"]}  # any change means both look again
        self.trade_send(room, t)

    def on_trade_ready(self, c, m):
        room = c.room
        t = self.trade_of(room, c.key)
        if not t:
            return
        t["ready"][c.key] = bool(m.get("on", True))
        if not all(t["ready"].values()):
            return self.trade_send(room, t)
        a, b = t["who"]
        pa, pb = room.zone["players"][a], room.zone["players"][b]
        oa, ob = t["offers"][a], t["offers"][b]
        try:
            self.check_offer(pa, oa)
            self.check_offer(pb, ob)
            for i in oa["items"]:
                if i in pb["owned"]:
                    raise GameError(f"{pb['name']} already has {ITEMS[i]['name']}.")
            for i in ob["items"]:
                if i in pa["owned"]:
                    raise GameError(f"{pa['name']} already has {ITEMS[i]['name']}.")
        except GameError as e:
            t["ready"] = {k: False for k in t["who"]}
            self.trade_send(room, t, {**self.trade_view(t), "error": str(e)})
            return
        for giver, taker, offer in ((pa, pb, oa), (pb, pa, ob)):
            giver["coins"] -= offer["coins"]
            taker["coins"] += offer["coins"]
            for i in offer["items"]:
                giver["owned"].remove(i)
                taker["owned"].append(i)
                slot = ITEMS[i]["slot"]
                for k in [slot, *[k for k, b in EXTRA_SLOTS.items() if b == slot]]:
                    if giver["look"].get(k) == i:
                        giver["look"][k] = TRADE_FALLBACK.get(slot, f"{slot}_none")
            for fid, n in offer["furni"].items():
                giver["furni"][fid] -= n
                taker["furni"][fid] = taker["furni"].get(fid, 0) + n
        room.trades.pop(t["id"], None)
        self.store.mark()
        self.push_player(room, a)
        self.push_player(room, b)
        self.trade_send(room, t, {"t": "trade_done", "id": t["id"]})
        self.post_feed(room, f"🤝 {pa['name']} and {pb['name']} made a trade at the tavern.")

    def on_trade_cancel(self, c, m):
        self.trade_drop(c.room, c.key, "cancelled the trade")

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
        n = random.randrange(37)
        bets = [b for mine in r["bets"].values() for b in mine]
        if bets and random.random() < ROULETTE_HOUSE:
            # the house nudges the ball onto whichever number pays out the least
            owed = lambda x: sum(b["amount"] * ROULETTE_PAYS[b["kind"]] for b in bets if roulette_hits(b["kind"], b["v"], x))
            low = min(owed(x) for x in range(37))
            n = random.choice([x for x in range(37) if owed(x) == low])
        r.update(state="spinning", result=n, ends=time.monotonic() + ROULETTE_SPIN_T)
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
        item = FURN.get(item_id) or FLOORS.get(item_id) or WALLS.get(item_id) or CEILINGS.get(item_id) or DOORS.get(item_id) or HOUSE_SIZES.get(item_id)
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
    weather = asyncio.create_task(game.weather_loop())
    print(f"FriendZone is running: http://localhost:{PORT}")
    lan = lan_address()
    if lan:
        print(f"Friends on your network can join at: http://{lan}:{PORT}")
    try:
        async with server:
            await server.serve_forever()
    finally:
        saver.cancel()
        weather.cancel()
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
