// The shared 3D overworld: walk around, see friends, chat, emote and enter activities.
// Movement and networking use map pixels (like the server); rendering happens in Three.js.
import * as THREE from 'three';
import { wind } from './three/wind.js';
import { watchContext } from './gfxguard.js';
import { net } from './net.js';
import { S, isTyping, esc, toast } from './state.js';
import { mountSpeed } from './three/mounts.js';
import * as M from './map.js';
import { Character } from './three/character.js';
import { buildEnvironment } from './three/environment.js';
import { buildLeaderboards } from './three/leaderboards.js';
import { music } from './music.js';
import { DayNight, timeOfDay, dayPhase } from './three/daynight.js';
import { puffTexture, basic } from './three/materials.js';
import { sfx, ambient } from './sfx.js';
import { settings, onSettings, pixelRatio } from './settings.js';
import { iconSvg, iconImage } from './icons.js';
import { Fishing, Line } from './games/fishing.js';
import { Sparks } from './three/fx.js';
import { registerLook, mouseLooking } from './mouselook.js';
import { touch, registerTouch, fitFov } from './touch.js';
const PITCH_MIN = -0.55, PITCH_LOW = 0.08; // how far you can look up; where the orbit stops dropping


export const EMOTES = M.EMOTES;
export const SPOTS = M.SPOTS;

const SPEED = 150;            // map px per second: a relaxed walk
const SPRINT = 2.0;           // Shift: a run
const R = 12;                 // collision radius in map px
const TALL_HATS = new Set(['hat_party', 'hat_tophat', 'hat_wizard', 'hat_halo', 'hat_viking', 'hat_crown', 'hat_horns']);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SPOT_COLORS = {
  racing: '#ff5d73', doodle: '#e57bff', boss: '#7c6bff', arcade: '#b77bff', arena: '#ff9f43', archery: '#37c871',
  casino: '#ffd84d', fishing: '#3b82f6', fishstand: '#39a0ff', trading: '#ffc53d', shop: '#ff6fb5', house: '#2ed8c3', pets: '#ff8fc7',
};
/** 0 at night .. 1 in full daylight (for dimming the minimap). */
const dayLight = () => Math.min(1, Math.max(0, (Math.sin(dayPhase() * Math.PI * 2) + 0.12) / 0.34));
// how far a point is from a spot: the lake by its real shoreline, buildings by their footprint
const spotDist = (s, p) => (s.kind === 'pond' ? Math.max(0, M.lakeDist(p.x, p.y)) : M.distToRect(p, s));
const BUILDING_HEIGHT = { fishstand: 7, garage: 8.2, cave: 7.6, colosseum: 7.2, range: 7.4, casino: 8.4, market: 6.2, boutique: 8.2, houses: 7.4, pond: 2.2, studio: 8.4, dome: 6.4, petshop: 7.4, portal: 8.2 };

export class World {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.labels = document.getElementById('worldLabels');
    this.minimap = document.getElementById('minimap');
    this.clockEl = document.getElementById('hudClock');
    this.minimap.addEventListener('click', (e) => {
      if (!this.minimap.classList.contains('big')) return this.toggleMap(true);
      // on the big map, click somewhere to walk there
      const r = this.minimap.getBoundingClientRect();
      this.pendingSpot = null;
      this.walkTo({ x: ((e.clientX - r.left) / r.width) * M.W, y: ((e.clientY - r.top) / r.height) * M.H });
      this.toggleMap(false);
    });
    this.layout = M.buildLayout();
    this.actors = new Map();
    this.keys = new Set();
    this.target = null;
    this.pendingSpot = null;
    this.near = null;
    this.paused = false;
    this.running = false;
    this.off = [];
    this.sent = { x: 0, y: 0, at: 0 };
    this.yaw = 0;
    this.pitch = 0.72;
    this.dist = 15;
    this.frameNo = 0;
    this.birdAt = 4;
  }

  // ---- setup -------------------------------------------------------------------

  init() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: settings.quality !== 'low', powerPreference: settings.quality === 'low' ? 'default' : 'high-performance' });
    watchContext(this.canvas);
    r.setPixelRatio(pixelRatio());
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1100);

    this.hemi = new THREE.HemisphereLight(0xdcefff, 0x6d8f55, 1.25);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 170 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.applyQuality();
    onSettings((s, changed) => { if ('quality' in changed) this.applyQuality(); });

    this.env = buildEnvironment(this.scene);
    this.dayNight = new DayNight(this.scene, this.env, this.hemi, this.sun);
    // rain splashes land on the terrain (or the lake's surface)
    this.dayNight.groundAt = (X, Z) => {
      const mx = X * M.PX + M.CENTER.x, my = Z * M.PX + M.CENTER.y;
      return M.inLake(mx, my) ? M.LAKE_LEVEL : M.groundAt(mx, my);
    };
    this.boards = buildLeaderboards(this.scene);
    document.fonts?.ready.then(() => this.env.redrawText());

    this.doorRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 48), basic('#ffd84d', { transparent: true, opacity: 0.8, depthWrite: false }));
    this.doorRing.rotation.x = -Math.PI / 2;
    this.doorRing.visible = false;
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.52, 32), basic('#ffffff', { transparent: true, opacity: 0.85, depthWrite: false }));
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.visible = false;
    this.scene.add(this.doorRing, this.targetRing);

    const dustMat = new THREE.SpriteMaterial({ map: puffTexture, color: 0xe9dcc0, transparent: true, depthWrite: false });
    this.dust = Array.from({ length: 48 }, () => {
      const s = new THREE.Sprite(dustMat.clone());
      s.visible = false;
      s.userData.life = 0;
      this.scene.add(s);
      return s;
    });
    this.dustIndex = 0;
    this.sparks = new Sparks(this.scene, 120);

    registerLook({
      canvas: this.canvas,
      active: () => this.running && !this.hidden && !this.paused && !this.fishing,
      look: (dx, dy) => {
        this.yaw -= dx * 0.0035 * settings.camSens;
        this.pitch = clamp(this.pitch + dy * 0.0025 * settings.camSens * (settings.invertY ? -1 : 1), PITCH_MIN, 1.35);
      },
    });
    // phones: left thumb walks (read as analog in updateMe), right thumb turns the camera, pinch zooms
    registerTouch({
      canvas: this.canvas,
      root: document.getElementById('world'),
      active: () => this.running && !this.hidden && !this.paused,
      stick: () => !this.fishing,
      keys: null,
      zoom: (f) => { this.dist = clamp(this.dist * f, 7, 34); },
    });

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.camTarget = new THREE.Vector3();
    this.camReady = false;

    this.signs = SPOTS.map((s) => {
      const el = document.createElement('div');
      el.className = 'wl-sign';
      el.innerHTML = `<span class="wl-em">${iconSvg(s.id) || s.emoji}</span>${esc(s.name)}<kbd>E</kbd>`;
      this.labels.append(el);
      const c = M.to3(s.x + s.w / 2, s.kind === 'pond' ? s.y : s.y + s.h / 2);
      return { spot: s, el, pos: new THREE.Vector3(c.x, (BUILDING_HEIGHT[s.kind] ?? 7) * (s.kind === 'pond' ? 1 : s.scale ?? 1) + M.heightAt(s.x + s.w / 2, s.y + s.h / 2), c.z) };
    });
  }

  start() {
    if (this.running) return;
    if (!this.renderer) this.init();
    this.running = true;
    this.labels.classList.remove('hidden');
    this.off.push(
      net.on('world', (m) => {
        const fresh = !this.actors.has(S.me);
        for (const k of [...this.actors.keys()]) if (k !== S.me) this.removeActor(k);
        const me = this.actors.get(S.me) ?? this.addActor(S.me, m.me.x, m.me.y);
        if (this.fishing) net.send('move', { x: me.x, y: me.y }); // stay on the dock
        else {
          me.x = me.tx = m.me.x;
          me.y = me.ty = m.me.y;
        }
        if (fresh) this.camReady = false;
        m.others.forEach((o) => { this.addActor(o.k, o.x, o.y); this.applyPose(o.k, o); });
      }),
      net.on('pose', (m) => this.applyPose(m.k, m)),
      net.on('pos', (m) => {
        const a = this.actors.get(m.k) ?? this.addActor(m.k, m.x, m.y);
        a.tx = m.x;
        a.ty = m.y;
      }),
      net.on('despawn', (m) => this.removeActor(m.k)),
      net.on('chat', (m) => {
        const a = this.actors.get(m.k);
        if (!a) return;
        a.el.bubble.textContent = m.text;
        a.el.bubble.classList.remove('hidden');
        clearTimeout(a.bubbleTimer);
        a.bubbleTimer = setTimeout(() => a.el.bubble.classList.add('hidden'), 5000);
      }),
      net.on('emote', (m) => {
        const a = this.actors.get(m.k);
        if (!a) return;
        a.char.emote(m.e);
        sfx(`emote_${m.e}`, this.spatial(a));
        const e = a.el.emote;
        e.textContent = EMOTES[m.e];
        e.classList.toggle('gg', m.e === 'gg');
        e.classList.remove('hidden', 'pop');
        void e.offsetWidth;
        e.classList.add('pop');
        clearTimeout(a.emoteTimer);
        a.emoteTimer = setTimeout(() => e.classList.add('hidden'), 2200);
      }),
    );
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContext);
    this.fountain = ambient('fountain');
    this.rainSound = ambient('rain');
    this.windSound = ambient('wind');
    this.resize();
    net.send('scene', { scene: 'world' });
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    this.off.forEach((fn) => fn());
    this.off = [];
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContext);
    if (this.fishing) { this.fishing.stop(); this.fishing = null; }
    this.seated = null;
    for (const k of [...this.actors.keys()]) this.removeActor(k);
    this.fountain?.stop();
    this.fountain = null;
    this.rainSound?.stop();
    this.rainSound = null;
    this.windSound?.stop();
    this.windSound = null;
    this.labels?.classList.add('hidden');
    this.keys.clear();
    this.target = this.pendingSpot = this.near = null;
    this.hooks.onNear(null);
  }

  // ---- actors ------------------------------------------------------------------

  addActor(k, x, y) {
    if (this.actors.has(k)) return this.actors.get(k);
    const char = new Character(S.players[k]?.look);
    this.scene.add(char.root);
    const wrap = document.createElement('div');
    wrap.className = `wl-actor${k === S.me ? ' me' : ''}`;
    wrap.innerHTML = '<div class="wl-emote hidden"></div><div class="wl-bubble hidden"></div><div class="wl-tag"><span class="wl-lv"></span><b></b></div>';
    this.labels.append(wrap);
    const a = {
      k, x, y, tx: x, ty: y, heading: 0, moving: false, char, lookRef: S.players[k]?.look, dustT: 0, speed: 1,
      el: { wrap, emote: wrap.children[0], bubble: wrap.children[1], tag: wrap.children[2] },
    };
    char.onStep = () => {
      const surface = Math.hypot(a.x - M.CENTER.x, a.y - M.CENTER.y) < M.PLAZA_R + 10 ? 'stone' : 'grass';
      const o = this.spatial(a);
      sfx('step', { ...o, vol: o.vol * (k === S.me ? 0.9 : 0.5), surface });
    };
    char.onLand = () => sfx('land', this.spatial(a));
    this.actors.set(k, a);
    return a;
  }

  /** Show what another player is doing in the world (fishing off the dock, their bobber…). */
  applyPose(k, m) {
    const a = this.actors.get(k);
    if (!a || k === S.me) return;
    a.pose = m.pose ?? null;
    if (a.pose === 'ride') {
      a.char.setProp(null);
      a.lift = 0;
      a.line?.show(false);
      a.char.setPose(a.char.setRiding(true) ? 'ride' : 'idle');
      return;
    }
    if (a.char.riding) a.char.setRiding(false);
    if (a.pose === 'bench') {
      a.char.setProp(null);
      a.char.setPose('bench');
      a.lift = 0.16;
      if (m.h != null) a.heading = m.h;
      a.line?.show(false);
      return;
    }
    a.char.setProp(a.pose ? 'rod' : null, S.players[k]?.rod ?? 'rod_twig');
    a.char.setPose(a.pose ? 'fish' : 'idle');
    a.lift = a.pose && M.inLake(a.x, a.y) ? 0.49 : 0; // up on the dock, or on the shore
    if (a.pose && m.bx != null && ['cast', 'bite', 'reel'].includes(a.pose)) {
      a.line ||= new Line(this.scene);
      a.line.show(true);
      a.line.bobber.position.set(m.bx, 0.1, m.bz);
      a.line.ripple(m.bx, m.bz, a.pose === 'bite' ? 1.4 : 0.8);
    } else a.line?.show(false);
    if (a.pose === 'catch') a.char.emote('gg');
  }

  removeActor(k) {
    const a = this.actors.get(k);
    if (!a) return;
    a.line?.dispose();
    this.scene.remove(a.char.root);
    a.el.wrap.remove();
    clearTimeout(a.bubbleTimer);
    clearTimeout(a.emoteTimer);
    this.actors.delete(k);
  }

  /** Sit down on the nearest bench (two seats per bench). */
  sit(bench) {
    const me = this.actors.get(S.me);
    if (!me || this.seated || this.fishing) return;
    if (this.riding) this.toggleRide(false);
    // pick the seat nearer to you, skipping one someone else is sitting on
    const along = { x: Math.cos(bench.h), y: -Math.sin(bench.h) }; // the bench's long axis, in map px
    const seats = [-1, 1].map((s) => ({ x: bench.x + along.x * 10 * s, y: bench.y + along.y * 10 * s }))
      .filter((p) => ![...this.actors.values()].some((a) => a.k !== S.me && a.pose === 'bench' && Math.hypot(a.x - p.x, a.y - p.y) < 6))
      .sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y));
    if (!seats.length) { sfx('error'); return; }
    this.seated = { bench, from: { x: me.x, y: me.y } };
    me.x = me.tx = seats[0].x;
    me.y = me.ty = seats[0].y;
    me.heading = bench.h;
    me.moving = false;
    me.lift = 0.16;
    me.char.setPose('bench');
    this.target = this.pendingSpot = null;
    net.send('move', { x: me.x, y: me.y });
    this.sent = { x: me.x, y: me.y, at: performance.now() };
    net.send('pose', { pose: 'bench', h: bench.h });
    this.hooks.onNear(null);
    this.nearBench = null;
    sfx('squish');
  }

  standUp() {
    const me = this.actors.get(S.me);
    if (!this.seated || !me) return;
    const h = this.seated.bench.h;
    me.x += Math.sin(h) * 22;
    me.y += Math.cos(h) * 22;
    me.tx = me.x;
    me.ty = me.y;
    me.lift = 0;
    me.char.setPose('idle');
    this.seated = null;
    net.send('move', { x: me.x, y: me.y });
    net.send('pose', { pose: null });
    sfx('pickup');
  }

  /** Things that happen right here in the world instead of in a panel or 3D area. */
  /** Hop on (or off) the mount you're wearing. */
  toggleRide(on = !this.riding) {
    const me = this.actors.get(S.me);
    if (!me || on === this.riding) return;
    if (on) {
      if (this.seated || this.fishing) return;
      if (!me.char.setRiding(true)) {
        toast('🐴 You need a mount! Get one at the 👕 Style Shop (Mounts).');
        return;
      }
      this.riding = true;
      me.char.setPose('ride');
      net.send('pose', { pose: 'ride' });
      sfx('whoosh');
    } else {
      this.riding = false;
      me.char.setRiding(false);
      me.char.setPose('idle');
      net.send('pose', { pose: null });
      sfx('land');
    }
    this.hooks.onRide?.(this.riding);
  }

  startActivity(kind) {
    if (kind !== 'fishing' || this.fishing || !this.actors.has(S.me)) return;
    if (this.riding) this.toggleRide(false);
    const pond = SPOTS.find((s) => s.kind === 'pond');
    const pa = M.to3(pond.x, pond.y), pb = M.to3(pond.x + pond.w, pond.y + pond.h);
    const dockX = (pa.x + pb.x) / 2;
    const slots = [
      { X: dockX - 0.55, Z: pa.z + 3.75, heading: 0 }, { X: dockX + 0.55, Z: pa.z + 3.75, heading: 0 },
      { X: dockX - 0.95, Z: pa.z + 2.3, heading: -Math.PI / 2 }, { X: dockX + 0.95, Z: pa.z + 2.3, heading: Math.PI / 2 },
      { X: dockX - 0.95, Z: pa.z + 1.2, heading: -Math.PI / 2 }, { X: dockX + 0.95, Z: pa.z + 1.2, heading: Math.PI / 2 },
    ];
    const taken = (s) => [...this.actors.values()].some((a) => a.k !== S.me && a.pose && a.pose !== 'bench' && Math.hypot(M.to3(a.x, a.y).x - s.X, M.to3(a.x, a.y).z - s.Z) < 0.5);
    const me = this.actors.get(S.me);
    const here = M.to3(me.x, me.y);
    let spot;
    if (Math.hypot(here.x - dockX, here.z - (pa.z + 2)) < 3.2) {
      // on (or right by) the dock: take a free spot on it
      spot = { ...(slots.find((s) => !taken(s)) ?? slots[0]), dock: true };
    } else {
      // anywhere else on the shore: step to the water's edge right here and face the lake
      const sp = M.shorePoint(me.x, me.y, 14);
      const w3 = M.to3(sp.x, sp.y);
      spot = { X: w3.x, Z: w3.z, heading: Math.atan2(-sp.nx, -sp.ny), dock: false };
    }
    me.x = me.tx = spot.X * M.PX + M.CENTER.x;
    me.y = me.ty = spot.Z * M.PX + M.CENTER.y;
    me.heading = spot.heading;
    me.moving = false;
    this.target = this.pendingSpot = null;
    net.send('move', { x: me.x, y: me.y });
    this.sent = { x: me.x, y: me.y, at: performance.now() };
    this.near = null;
    this.hooks.onNear(null);
    this.savedCam = { yaw: this.yaw, pitch: this.pitch, dist: this.dist };
    this.yaw = spot.heading + Math.PI;
    this.pitch = 0.42;
    this.dist = 7.5;
    this.fishing = new Fishing(this, spot);
  }

  stopActivity() {
    if (!this.fishing) return;
    const onDock = this.fishing.spot.dock;
    this.fishing.stop();
    this.fishing = null;
    const pond = SPOTS.find((s) => s.kind === 'pond');
    const door = M.doorOf(pond);
    const me = this.actors.get(S.me);
    if (me && onDock) { // step off the dock (on the shore you just stay where you were)
      me.x = me.tx = door.x;
      me.y = me.ty = door.y;
      me.heading = Math.PI;
      net.send('move', { x: me.x, y: me.y });
    }
    if (this.savedCam) Object.assign(this, this.savedCam);
    sfx('close');
  }

  emote(e) {
    if (this.actors.has(S.me) && EMOTES[e]) net.send('emote', { e });
  }

  /** Volume + stereo pan for a sound made by an actor, relative to you and the camera. */
  spatial(a) {
    const me = this.actors.get(S.me);
    if (!me || a === me) return { vol: 1, pan: 0 };
    const dx = a.x - me.x, dy = a.y - me.y, d = Math.hypot(dx, dy);
    const vol = Math.max(0, 1 - d / 650) ** 1.5;
    const pan = d > 1 ? ((dx * Math.cos(this.yaw) - dy * Math.sin(this.yaw)) / d) * 0.8 : 0;
    return { vol, pan };
  }

  /** Coming back out of a building: step off the doorstep and don't re-enter on the same key press. */
  leftBuilding() {
    this.enterBlockUntil = performance.now() + 700;
    const spot = this.near && M.SPOTS.find((s) => s.id === this.near.id);
    const me = this.actors.get(S.me);
    if (spot && me) {
      const [dx, dy] = M.doorDir(spot);
      const x = me.x + dx * 45, y = me.y + dy * 45;
      if (!this.blocked(x, y)) { me.x = me.tx = x; me.y = me.ty = y; }
    }
    this.near = null;
  }

  // ---- input -------------------------------------------------------------------

  onKeyDown = (e) => {
    if (this.paused || isTyping()) return;
    const key = e.key.toLowerCase();
    if (this.fishing) {
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.fishing.press(); return; }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e'].includes(key)) { this.stopActivity(); if (key === 'e') return; }
    }
    // on a bench you stay seated until you press E again
    if (this.seated) {
      if (key === 'e' && !e.repeat) this.standUp();
      if (key === 'e' || key === ' ') return;
    }
    if (key === 'e' && !this.near && this.nearBench) { this.sit(this.nearBench); return; }
    if (key === 'e' && this.near) {
      // a held-down E (or the press that just took you out of a building) mustn't walk you back in
      if (e.repeat || performance.now() < (this.enterBlockUntil ?? 0)) return;
      this.hooks.onActivity(this.near.id);
      return;
    }
    if (key === 'm' && !e.repeat) { this.toggleMap(); return; }
    if (key === 'g' && !e.repeat) { this.toggleRide(); return; }
    if (key === 'escape' && this.minimap.classList.contains('big')) { this.toggleMap(false); return; }
    const emoteIndex = '123456'.indexOf(key);
    if (emoteIndex >= 0 && !e.repeat) {
      this.emote(Object.keys(EMOTES)[emoteIndex]);
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'r', 'shift'].includes(key)) {
      this.keys.add(key);
      e.preventDefault();
    }
  };
  onKeyUp = (e) => {
    this.keys.delete(e.key.toLowerCase());
    if (this.fishing && e.code === 'Space') this.fishing.release();
  };
  onBlur = () => this.keys.clear();
  onContext = (e) => e.preventDefault();

  onPointerDown = (e) => {
    if (this.paused) return;
    if (this.fishing && e.button === 0) { this.fishing.press(); this.drag = { fishing: true, id: e.pointerId }; return; }
    if (e.fzPinch || (this.drag && e.pointerType === 'touch')) return; // a second finger (pinch) isn't a new drag
    this.drag = { x: e.clientX, y: e.clientY, button: e.button, moved: false, id: e.pointerId };
  };
  onPointerMove = (e) => {
    const d = this.drag;
    if (!d || d.fishing || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true;
    if (d.moved) {
      this.yaw -= dx * 0.0055 * settings.camSens;
      this.pitch = clamp(this.pitch + dy * 0.0035 * settings.camSens * (settings.invertY ? -1 : 1), PITCH_MIN, 1.35);
      d.x = e.clientX;
      d.y = e.clientY;
    }
  };
  onPointerUp = (e) => {
    const d = this.drag;
    if (d && e.pointerId !== d.id && !e.fzPinch) return;
    this.drag = null;
    if (d?.fishing) { this.fishing?.release(); return; }
    if (e.fzPinch) return; // lifting a finger after a pinch isn't a tap
    if (!d || d.moved || d.button !== 0 || this.paused || !this.actors.has(S.me)) return;
    if (mouseLooking()) {
      if (this.near) this.hooks.onActivity(this.near.id);
      else if (this.nearBench) this.sit(this.nearBench);
      return;
    }
    this.clickAt(e.clientX, e.clientY);
  };
  onPointerCancel = (e) => {
    if (this.drag?.id === e.pointerId) { if (this.drag.fishing) this.fishing?.release(); this.drag = null; }
  };
  onWheel = (e) => {
    e.preventDefault();
    this.dist = clamp(this.dist * (1 + e.deltaY * 0.0011 * settings.zoomSens), 7, 34);
  };

  clickAt(cx, cy) {
    if (this.seated) return; // press E to get up
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.env.buildings, true)[0];
    let spot = null;
    for (let o = hit?.object; o; o = o.parent) if (o.userData.spot) { spot = o.userData.spot; break; }
    if (spot) {
      if (this.near === spot) { this.hooks.onActivity(spot.id); return; }
      this.pendingSpot = spot;
      this.walkTo(M.doorOf(spot));
      return;
    }
    // clicks land on the terrain (hills included)
    const p = this.raycaster.intersectObject(this.env.ground, false)[0]?.point;
    if (!p) return;
    const px = p.x * M.PX + M.CENTER.x, py = p.z * M.PX + M.CENTER.y;
    const pond = SPOTS.find((s) => s.kind === 'pond');
    if (M.inLake(px, py)) {
      if (this.near === pond) { this.hooks.onActivity(pond.id); return; }
      // walk to the bit of shore nearest where you clicked, then fish there
      this.pendingSpot = pond;
      this.walkTo(M.shorePoint(px, py, 24));
      return;
    }
    this.pendingSpot = null;
    this.walkTo({ x: clamp(px, 30, M.W - 30), y: clamp(py, 30, M.H - 30) });
  }

  /** Pixel ratio + shadows for the chosen graphics quality. */
  applyQuality() {
    if (!this.renderer) return;
    const q = settings.quality;
    this.renderer.setPixelRatio(pixelRatio());
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (this.running) this.resize();
  }

  resize = () => {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = fitFov(w < 700 ? 60 : 50, w / h);
    this.camera.updateProjectionMatrix();
  };

  // ---- simulation ----------------------------------------------------------------

  blocked(x, y) {
    if (Math.hypot(x - M.CENTER.x, y - M.CENTER.y) < M.FOUNTAIN_R + R + 4) return true;
    if (SPOTS.some((s) => spotDist(s, { x, y }) < R)) return true;
    if (this.layout.trees.some((t) => t.kind !== 'bush' && Math.hypot(x - t.x, y - t.y) < 9 + R)) return true;
    if (this.layout.lamps.some((l) => Math.hypot(x - l.x, y - l.y) < 6 + R)) return true;
    if (M.inCreek(x, y)) return true; // the creek is too deep to wade: use a bridge
    const p = { x, y };
    return this.layout.solids.some((o) => (o.rect ? M.distToRect(p, o.rect) < R
      : o.circle ? Math.hypot(x - o.circle.x, y - o.circle.y) < o.circle.r + R
        : M.distToSeg(p, o.seg[0], o.seg[1]) < 3 + R));
  }

  // ---- click-to-walk routes: A* over a coarse grid of walkable cells, then trimmed so you walk in
  // straight lines wherever nothing is in the way

  walkGrid() {
    if (this.grid) return this.grid;
    const CELL = 30, cols = Math.ceil(M.W / CELL), rows = Math.ceil(M.H / CELL);
    const open = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) open[j * cols + i] = this.blocked((i + 0.5) * CELL, (j + 0.5) * CELL) ? 0 : 1;
    this.grid = { CELL, cols, rows, open };
    return this.grid;
  }

  clearLine(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 10);
    for (let k = 1; k <= n; k++) if (this.blocked(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n)) return false;
    return true;
  }

  /** Walk to a spot on the map, going round whatever is in the way. */
  walkTo(goal) {
    const me = this.actors.get(S.me);
    if (!me) return;
    this.route = null;
    if (this.clearLine(me, goal)) { this.target = goal; return; }
    const { CELL, cols, rows, open } = this.walkGrid();
    const cellOf = (p) => [clamp(Math.floor(p.x / CELL), 0, cols - 1), clamp(Math.floor(p.y / CELL), 0, rows - 1)];
    const [si, sj] = cellOf(me);
    let [gi, gj] = cellOf(goal);
    if (!open[gj * cols + gi]) { // aiming at something solid: head for the nearest open cell
      let best = null;
      for (let r = 1; r < 8 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const i = gi + di, j = gj + dj;
        if (i >= 0 && j >= 0 && i < cols && j < rows && open[j * cols + i] && !best) best = [i, j];
      }
      if (!best) { this.target = goal; return; }
      [gi, gj] = best;
      goal = { x: (gi + 0.5) * CELL, y: (gj + 0.5) * CELL };
    }
    const start = sj * cols + si, end = gj * cols + gi;
    const g = new Float32Array(cols * rows).fill(Infinity), from = new Int32Array(cols * rows).fill(-1);
    const heap = [[0, start]];
    g[start] = 0;
    const h = (c) => Math.hypot((c % cols) - gi, Math.floor(c / cols) - gj);
    let found = false;
    for (let steps = 0; heap.length && steps < 40000; steps++) {
      // (a small binary heap would be faster; the grid is small enough for a sorted pick)
      let bi = 0;
      for (let k = 1; k < heap.length; k++) if (heap[k][0] < heap[bi][0]) bi = k;
      const [, c] = heap[bi];
      heap[bi] = heap[heap.length - 1];
      heap.pop();
      if (c === end) { found = true; break; }
      const ci = c % cols, cj = Math.floor(c / cols);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
        const n = j * cols + i;
        if (!open[n] && n !== end) continue;
        if (di && dj && (!open[cj * cols + i] || !open[j * cols + ci])) continue; // no cutting corners
        const cost = g[c] + (di && dj ? 1.414 : 1);
        if (cost < g[n]) { g[n] = cost; from[n] = c; heap.push([cost + h(n), n]); }
      }
    }
    if (!found) { this.target = goal; return; }
    const cells = [];
    for (let c = end; c !== -1 && c !== start; c = from[c]) cells.unshift({ x: ((c % cols) + 0.5) * CELL, y: (Math.floor(c / cols) + 0.5) * CELL });
    cells[cells.length - 1] = goal;
    // keep only the corners you actually need
    const route = [];
    let at = { x: me.x, y: me.y };
    for (let k = 0; k < cells.length; k++) {
      const next = cells[k + 1];
      if (next && this.clearLine(at, next)) continue;
      route.push(cells[k]);
      at = cells[k];
    }
    this.target = route.shift() ?? goal;
    this.route = route;
  }

  moveBy(me, dx, dy) {
    const stuck = this.blocked(me.x, me.y); // never trap someone who spawned inside something
    const nx = clamp(me.x + dx, 26, M.W - 26);
    if (stuck || !this.blocked(nx, me.y)) me.x = nx;
    const ny = clamp(me.y + dy, 26, M.H - 26);
    if (stuck || !this.blocked(me.x, ny)) me.y = ny;
  }

  update(dt, now) {
    const me = this.actors.get(S.me);
    const t = now / 1000;
    if (me && this.fishing) this.fishing.update(dt, now);
    else if (me && !this.seated) this.updateMe(me, dt, now);

    const lerp = 1 - Math.exp(-dt * 12);
    for (const a of this.actors.values()) {
      if (a !== me) {
        const ox = a.tx - a.x, oy = a.ty - a.y;
        a.x += ox * lerp;
        a.y += oy * lerp;
        a.moving = Math.hypot(ox, oy) > 1.5;
        if (a.moving) a.heading = Math.atan2(ox, oy);
        // stride follows how fast they actually move, so feet don't slide
        const v = dt > 0 ? (Math.hypot(ox, oy) * lerp) / dt / SPEED : 0;
        a.speed += ((v > 1.5 ? 2.0 : Math.max(0.6, Math.min(1.2, v))) - a.speed) * Math.min(1, dt * 6);
      }
      const look = S.players[a.k]?.look;
      if (look && look !== a.lookRef) {
        a.lookRef = look;
        a.char.setLook(look);
      }
      const p = M.to3(a.x, a.y);
      a.ground = M.groundAt(a.x, a.y);
      a.char.root.position.set(p.x, a.ground + (a.lift ?? 0), p.z);
      a.line?.update(dt, a.char.rodTip?.getWorldPosition(new THREE.Vector3()), 0.5);
      const cur = a.char.root.rotation.y;
      const diff = Math.atan2(Math.sin(a.heading - cur), Math.cos(a.heading - cur));
      a.char.root.rotation.y = cur + diff * Math.min(1, dt * 12);
      a.char.update(dt, t, a.moving, a.speed);

      a.dustT -= dt;
      if (a.moving && a.dustT <= 0) {
        a.dustT = 0.13;
        const s = this.dust[this.dustIndex++ % this.dust.length];
        s.position.set(p.x - Math.sin(a.heading) * 0.3, a.ground + 0.15, p.z - Math.cos(a.heading) * 0.3);
        s.userData.life = 0.6;
        s.visible = true;
      }
    }
    for (const s of this.dust) {
      if (!s.visible) continue;
      s.userData.life -= dt;
      if (s.userData.life <= 0) { s.visible = false; continue; }
      const k = s.userData.life / 0.6;
      s.position.y += dt * 0.5;
      s.scale.setScalar(0.35 + (1 - k) * 0.7);
      s.material.opacity = k * 0.7;
    }

    this.sparks.update(dt);
    if (me && !this.fishing && !this.seated) {
      const near = SPOTS.find((s) => spotDist(s, me) < 44) ?? null;
      const bench = near ? null : this.layout.benches.find((b) => Math.hypot(b.x - me.x, b.y - me.y) < 34) ?? null;
      if (near !== this.near || bench !== this.nearBench) {
        this.near = near;
        this.nearBench = bench;
        this.hooks.onNear(near ?? (bench ? { id: 'bench', emoji: '🪑', name: 'the bench', verb: 'sit on', action: () => this.sit(bench) } : null));
        if (near || bench) sfx('near');
      }
      if (this.pendingSpot && near === this.pendingSpot) {
        const spot = this.pendingSpot;
        this.pendingSpot = this.target = null;
        this.hooks.onActivity(spot.id);
      }
    }
    if (this.near) {
      const d = M.doorOf(this.near), p = M.to3(d.x, d.y);
      this.doorRing.visible = true;
      this.doorRing.position.set(p.x, M.heightAt(d.x, d.y) + 0.06, p.z);
      this.doorRing.material.opacity = 0.55 + Math.sin(t * 5) * 0.3;
      this.doorRing.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
    } else this.doorRing.visible = false;
    if (this.target) {
      const goal = this.route?.length ? this.route[this.route.length - 1] : this.target;
      const p = M.to3(goal.x, goal.y);
      this.targetRing.visible = true;
      this.targetRing.position.set(p.x, M.heightAt(goal.x, goal.y) + 0.06, p.z);
      this.targetRing.scale.setScalar(1 + Math.sin(t * 8) * 0.12);
    } else this.targetRing.visible = false;

    this.env.update(dt, t);
    if ((this.boardT = (this.boardT ?? 0) + dt) > 1) { this.boardT = 0; this.boards.refresh(); } // leaderboard signs
    this.boards.tick(t);
    this.updateCamera(dt, me);
    this.updateAmbience(dt, me);
  }

  updateAmbience(dt, me) {
    if (!me || !this.fountain) return;
    const d = Math.hypot(me.x - M.CENTER.x, me.y - M.CENTER.y);
    this.fountain.set(Math.max(0, 1 - d / 320) ** 2 * 0.22 * (this.paused ? 0.2 : 1));
    this.birdAt -= dt;
    if (this.birdAt <= 0) {
      this.birdAt = 3 + Math.random() * 7;
      if (!this.paused) sfx('bird', { vol: 0.4 + Math.random() * 0.6, pan: Math.random() * 1.6 - 0.8 });
    }
  }

  updateMe(me, dt, now) {
    let ix = 0, iy = 0;
    if (!this.paused) {
      const k = this.keys;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      if (k.has('w') || k.has('arrowup')) iy -= 1;
      if (k.has('s') || k.has('arrowdown')) iy += 1;
      if (k.has('q')) this.yaw += dt * 2 * settings.keyTurn;
      if (k.has('r')) this.yaw -= dt * 2 * settings.keyTurn;
      if (touch.stick.active && (touch.stick.x || touch.stick.y)) { ix = touch.stick.x; iy = touch.stick.y; }
    }
    let dx = 0, dy = 0;
    if (ix || iy) {
      // camera-relative: forward is away from the camera
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      dx = rx * ix + fx * -iy;
      dy = rz * ix + fz * -iy;
      this.target = this.pendingSpot = this.route = null;
    } else if (this.target && !this.paused) {
      const vx = this.target.x - me.x, vy = this.target.y - me.y;
      const d = Math.hypot(vx, vy);
      if (d < (this.route?.length ? 18 : 6)) this.target = this.route?.shift() ?? null;
      else { dx = vx / d; dy = vy / d; }
    }
    const len = Math.hypot(dx, dy);
    let sprint = (this.keys.has('shift') || (touch.stick.active && touch.stick.run)) && !this.paused ? SPRINT : 1;
    me.speed = sprint > 1 ? 1.85 : 1.0;
    // riding: much quicker than walking (a little more with Shift); the mount was taken off: hop down
    if (this.riding && !me.char.riding) this.toggleRide(false);
    if (this.riding) {
      const fast = sprint > 1;
      sprint = mountSpeed(S.players[S.me]?.look?.mount) * (fast ? 1.2 : 1);
      me.speed = fast ? 1.3 : 1;
    }
    me.moving = false;
    if (len) {
      const bx = me.x, by = me.y;
      this.moveBy(me, (dx / len) * SPEED * sprint * dt, (dy / len) * SPEED * sprint * dt);
      if (Math.abs(me.x - bx) + Math.abs(me.y - by) < 0.01) this.target = this.route = null;
      else {
        me.moving = true;
        me.heading = Math.atan2(me.x - bx, me.y - by);
      }
    }
    me.tx = me.x;
    me.ty = me.y;
    if (now - this.sent.at > 80 && (me.x !== this.sent.x || me.y !== this.sent.y)) {
      this.sent = { x: me.x, y: me.y, at: now };
      net.send('move', { x: me.x, y: me.y });
    }
  }

  updateCamera(dt, me) {
    const p = me ? M.to3(me.x, me.y) : { x: 0, z: 0 };
    const goal = new THREE.Vector3(p.x, 1.3 + (me ? M.groundAt(me.x, me.y) : 0), p.z);
    if (!this.camReady) { this.camTarget.copy(goal); this.camReady = true; }
    this.camTarget.lerp(goal, 1 - Math.exp(-dt * 9));
    // below a low orbit the camera stays near the ground and tilts its gaze upwards instead, so you can
    // look up at tall buildings (but never straight up)
    const c = this.camTarget, orbit = Math.max(this.pitch, PITCH_LOW), cp = Math.cos(orbit);
    let cx = c.x + Math.sin(this.yaw) * cp * this.dist, cz = c.z + Math.cos(this.yaw) * cp * this.dist;
    let cy = c.y + Math.sin(orbit) * this.dist;
    cy = Math.max(cy, M.groundAt(M.CENTER.x + cx * M.PX, M.CENTER.y + cz * M.PX) + 0.6);
    // keep buildings from getting between you and the camera: pull in in front of any wall in the way
    const want = new THREE.Vector3(cx, cy, cz), from = new THREE.Vector3(c.x, c.y + 0.4, c.z);
    const toCam = want.clone().sub(from), full = toCam.length();
    if ((this.camRayT = (this.camRayT ?? 0) + dt) > 0.05 || this.camBlock == null) {
      this.camRayT = 0;
      this.raycaster.set(from, toCam.clone().normalize());
      this.raycaster.camera = this.camera; // (sprites need it)
      this.raycaster.far = full;
      const hit = this.raycaster.intersectObjects(this.env.solidsForCamera ?? this.env.buildings, true).find((h) => h.object.visible && !h.object.isSprite);
      this.raycaster.far = Infinity;
      this.camBlock = hit ? Math.max(1.2, hit.distance - 0.4) : full;
    }
    this.camLen = this.camLen == null ? this.camBlock : this.camLen + (Math.min(this.camBlock, full) - this.camLen) * Math.min(1, dt * (this.camBlock < this.camLen ? 18 : 4));
    if (this.camLen < full - 0.01) { const k = this.camLen / full; cx = from.x + toCam.x * k; cy = from.y + toCam.y * k; cz = from.z + toCam.z * k; }
    this.camera.position.set(cx, cy, cz);
    const lift = Math.max(0, PITCH_LOW - this.pitch) * this.dist * 1.1;
    this.camera.lookAt(c.x, c.y + lift, c.z);
    const dn = this.dayNight.update(c);
    this.rainSound?.set(dn.storm * (this.paused ? 0.3 : 1));
    this.windSound?.set(Math.max(0, wind.strength.value - 1.4) * 0.5 * (this.paused ? 0.3 : 1));
    if (this.clockEl && performance.now() - (this.clockAt ?? 0) > 1000) {
      this.clockAt = performance.now();
      const tod = timeOfDay(dn.phase);
      const wIcon = { rain: '🌧️', storm: '⛈️', cloudy: '☁️', windy: '💨' }[S.weather];
      this.clockEl.textContent = `${wIcon ?? tod.icon} ${tod.clock}`;
      this.clockEl.classList.toggle('night', tod.night);
      music.setNight(!!tod.night && settings.dayNight !== false); // chill music after dark
    }
  }

  // ---- rendering ------------------------------------------------------------------

  frame = (now) => {
    if (!this.running) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.hidden) { requestAnimationFrame(this.frame); return; } // a 3D area is covering the world
    this.update(dt, now);
    this.frameNo++;
    // behind an activity panel the world only needs an occasional redraw
    if (!this.paused || this.frameNo % 4 === 0) {
      this.renderer.render(this.scene, this.camera);
      this.updateLabels();
    }
    if (!this.mmAt || now - this.mmAt > 150) {
      this.mmAt = now;
      this.drawMinimap();
    }
    requestAnimationFrame(this.frame);
  };

  project(v, w, h) {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, visible: p.z < 1 && p.z > -1 };
  }

  updateLabels() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const camPos = this.camera.position;
    const v = new THREE.Vector3();
    for (const a of this.actors.values()) {
      const p = S.players[a.k];
      const tall = TALL_HATS.has(p?.look?.hat) ? 0.45 : 0;
      v.set(a.char.root.position.x, a.char.root.position.y - (a.lift ?? 0) + 2.2 + tall + a.char.rig.body.position.y + a.char.rig.head.position.y - 1.52, a.char.root.position.z);
      const s = this.project(v, w, h);
      const el = a.el.wrap;
      if (!s.visible) { el.style.display = 'none'; continue; }
      el.style.display = '';
      const scale = clamp(17 / camPos.distanceTo(v), 0.62, 1.15);
      el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      if (p && a.tagKey !== `${p.name}|${p.level}|${p.color}`) {
        a.tagKey = `${p.name}|${p.level}|${p.color}`;
        a.el.tag.querySelector('b').textContent = p.name;
        a.el.tag.querySelector('.wl-lv').textContent = `Lv ${p.level}`;
        a.el.tag.style.setProperty('--c', p.color);
      }
    }
    for (const sg of this.signs) {
      if (this.fishing) { sg.el.style.display = 'none'; continue; }
      const s = this.project(sg.pos, w, h);
      const dist = camPos.distanceTo(sg.pos);
      if (!s.visible || dist > 80) { sg.el.style.display = 'none'; continue; }
      sg.el.style.display = '';
      const scale = clamp(22 / dist, 0.55, 1.1);
      sg.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      sg.el.classList.toggle('near', this.near === sg.spot);
    }
  }

  drawMinimap() {
    const mm = this.minimap;
    if (!mm || !this.env || mm.offsetParent === null) return;
    const big = mm.classList.contains('big');
    const w = mm.clientWidth, h = mm.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (mm.width !== Math.round(w * dpr) || mm.height !== Math.round(h * dpr)) { mm.width = Math.round(w * dpr); mm.height = Math.round(h * dpr); }
    const ctx = mm.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.env.groundCanvas, 0, 0, w, h);
    const sx = w / M.W, sy = h / M.H;
    const night = this.dayNight ? 1 - dayLight(this.dayNight) : 0;
    ctx.fillStyle = `rgba(13,31,74,${0.12 + night * 0.35})`;
    ctx.fillRect(0, 0, w, h);
    // buildings: a soft footprint, then a round badge with the activity's icon
    const badge = big ? 34 : 22;
    for (const s of SPOTS) {
      const color = SPOT_COLORS[s.id] ?? '#ffffff';
      if (s.kind !== 'pond') {
        ctx.fillStyle = 'rgba(20,16,40,.35)';
        ctx.beginPath(); ctx.roundRect(s.x * sx, s.y * sy, s.w * sx, s.h * sy, 3); ctx.fill();
      }
      const x = (s.x + s.w / 2) * sx, y = (s.y + s.h / 2) * sy;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.arc(x, y + 1.5, badge / 2 + 1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, badge / 2 + 1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, badge / 2 - 1, 0, Math.PI * 2); ctx.fill();
      const img = iconImage(s.id, 64);
      const ic = badge * 0.78;
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x - ic / 2, y - ic / 2, ic, ic);
      else { ctx.font = `${Math.round(badge * 0.6)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.emoji, x, y + 1); }
      if (big) {
        ctx.font = '700 13px Rubik, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(13,31,74,.9)';
        ctx.strokeText(s.name, x, y + badge / 2 + 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(s.name, x, y + badge / 2 + 4);
      }
    }
    const me = this.actors.get(S.me);
    if (me) {
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath();
      ctx.moveTo(me.x * sx, me.y * sy);
      const f = Math.atan2(-Math.cos(this.yaw), -Math.sin(this.yaw));
      ctx.arc(me.x * sx, me.y * sy, big ? 70 : 34, f - 0.55, f + 0.55);
      ctx.fill();
    }
    for (const a of this.actors.values()) {
      if (a === me) continue;
      const p = S.players[a.k];
      ctx.fillStyle = p?.color ?? '#fff';
      ctx.strokeStyle = '#0d1f4a';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(a.x * sx, a.y * sy, big ? 6 : 3.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (big && p) {
        ctx.font = '700 11px Rubik, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.name, a.x * sx, a.y * sy - 8);
      }
    }
    if (me) {
      ctx.save();
      ctx.translate(me.x * sx, me.y * sy);
      ctx.rotate(Math.PI - me.heading);
      if (big) ctx.scale(1.6, 1.6);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#0d1f4a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  /** Click the minimap (or press M) to open the big map; click a place on it to walk there. */
  toggleMap(open = !this.minimap.classList.contains('big')) {
    this.minimap.classList.toggle('big', open);
    sfx(open ? 'open' : 'close');
  }
}
