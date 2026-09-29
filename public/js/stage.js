// Full-screen 3D "areas" you teleport into from the world: the race track, arena, casino floor,
// boss cave, bumper dome and archery range. There is one shared renderer; each area builds its
// scene into the stage and gets helpers for characters, name tags, input, cameras and prompts.
import * as THREE from 'three';
import { registerLook, mouseLooking } from './mouselook.js';
import { net } from './net.js';
import { S, esc, isTyping } from './state.js';
import { Character } from './three/character.js';
import { settings, onSettings, pixelRatio, shakeScale } from './settings.js';
import { iconSvg } from './icons.js';
import { sfx } from './sfx.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TALL_HATS = new Set(['hat_party', 'hat_tophat', 'hat_wizard', 'hat_halo', 'hat_viking', 'hat_crown', 'hat_horns']);

class Stage {
  constructor() {
    this.el = null;
    this.active = null;
    this.keys = new Set();
    this.mouse = new THREE.Vector2(0, 0);
    this.mouseIn = false;
    this.people = new Map();
    this.frameFns = [];
    this.shakeAmt = 0;
  }

  setup() {
    if (this.el) return;
    const el = document.createElement('section');
    el.className = 'area hidden';
    el.innerHTML = `
      <canvas class="area-canvas"></canvas>
      <div class="world-labels area-labels"></div>
      <div class="area-hud"></div>
      <div class="area-top"><button class="btn small area-exit">← Leave</button><div class="area-title"></div></div>
      <div class="area-banner hidden"></div>
      <div class="hud-prompt area-prompt hidden"></div>
      <div class="area-fade"></div>`;
    document.body.append(el);
    this.el = el;
    this.canvas = el.querySelector('.area-canvas');
    this.labels = el.querySelector('.area-labels');
    this.hud = el.querySelector('.area-hud');
    this.title = el.querySelector('.area-title');
    this.promptEl = el.querySelector('.area-prompt');
    this.bannerEl = el.querySelector('.area-banner');
    this.fade = el.querySelector('.area-fade');
    el.querySelector('.area-exit').onclick = () => this.onExit?.();

    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setPixelRatio(pixelRatio());
    this.renderer = r;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
    this.raycaster = new THREE.Raycaster();
    registerLook({
      canvas: this.canvas,
      active: () => !!this.active && !!this.orbit && !this.orbit.fixed && !document.querySelector('#modal:not(.hidden)'),
      look: (dx, dy) => {
        const o = this.orbit;
        o.yaw -= dx * 0.0035 * settings.camSens;
        o.pitch = clamp(o.pitch + dy * 0.0025 * settings.camSens * (settings.invertY ? -1 : 1), o.minPitch ?? 0.25, o.maxPitch ?? 1.3);
      },
    });
    onSettings((s, changed) => {
      if ('quality' in changed) { r.setPixelRatio(pixelRatio()); this.resize(); }
    });

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (!this.active || isTyping() || document.querySelector('#modal:not(.hidden)')) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (k === 'e' && !e.repeat && this.near) this.near.use();
      this.onKey?.(e, true);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (this.active) this.onKey?.(e, false);
    });
    window.addEventListener('blur', () => this.keys.clear());
    const toNdc = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    this.canvas.addEventListener('pointermove', (e) => {
      toNdc(e);
      this.mouseIn = true;
      const d = this.drag;
      if (d) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true;
        if (d.moved && this.orbit && !this.orbit.fixed) {
          this.orbit.yaw -= dx * 0.0055 * settings.camSens;
          this.orbit.pitch = clamp(this.orbit.pitch + dy * 0.0035 * settings.camSens * (settings.invertY ? -1 : 1), this.orbit.minPitch ?? 0.25, this.orbit.maxPitch ?? 1.3);
        }
        d.x = e.clientX;
        d.y = e.clientY;
      }
      this.onPointer?.('move', e);
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      toNdc(e);
      this.drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
      this.pointerDown = true;
      this.onPointer?.('down', e);
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.active) return;
      const d = this.drag;
      this.drag = null;
      this.pointerDown = false;
      if (mouseLooking()) { if (d && !d.moved && d.button === 0) this.near?.use(); return; } // cursor hidden: click uses what's nearby
      this.onPointer?.('up', e, d);
      if (d && !d.moved && d.button === 0) this.clickInteract();
    });
    this.canvas.addEventListener('pointerleave', () => { this.mouseIn = false; });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.orbit) this.orbit.dist = clamp(this.orbit.dist * (1 + e.deltaY * 0.0011 * settings.zoomSens), this.orbit.minDist ?? 4, this.orbit.maxDist ?? 30);
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---- lifecycle ------------------------------------------------------------------

  /** Teleport into an area. activity.area(stage) builds it and returns a cleanup function. */
  open(activity, { onExit }) {
    this.setup();
    this.close();
    this.scene = new THREE.Scene();
    this.people.clear();
    this.labels.innerHTML = '';
    this.hud.innerHTML = '';
    this.hud.className = 'area-hud';
    this.frameFns = [];
    this.interactables = [];
    this.near = null;
    this.orbit = null;
    this.onKey = this.onPointer = null;
    this.onExit = onExit;
    this.shakeAmt = 0;
    this.title.innerHTML = `${iconSvg(activity.icon) || activity.emoji} ${esc(activity.place ?? activity.name)}`;
    this.el.classList.remove('hidden');
    this.fade.classList.remove('out');
    void this.fade.offsetWidth;
    this.fade.classList.add('out');
    this.resize();
    this.active = activity;
    try {
      this.cleanup = activity.area(this);
    } catch (e) {
      console.error('area failed to load', e);
      this.cleanup = null;
      this.banner('Something went wrong loading this place. Press <b>← Leave</b>.', 6000);
    }
    this.last = performance.now();
    const frame = (now) => {
      if (!this.active) return;
      this.raf = requestAnimationFrame(frame);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(frame);
    sfx('enter');
  }

  close() {
    if (!this.active) return;
    cancelAnimationFrame(this.raf);
    try { this.cleanup?.(); } catch (e) { console.error(e); }
    this.cleanup = null;
    this.active = null;
    this.keys.clear();
    for (const k of [...this.people.keys()]) this.removePerson(k);
    this.scene = null;
    this.el.classList.add('hidden');
    this.promptEl.classList.add('hidden');
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < 700 ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    for (const fn of this.frameFns) fn(dt, now);
    this.updatePeople(dt, now / 1000);
    this.updateInteract();
    if (this.orbit?.target) this.applyOrbit(dt);
    const base = this.camera.position.clone();
    const sh = this.shakeAmt * shakeScale();
    if (sh > 0.001) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    this.renderer.render(this.scene, this.camera);
    this.camera.position.copy(base);
    this.updateLabels();
  }

  onFrame(fn) { this.frameFns.push(fn); }

  shake(amount) { this.shakeAmt = Math.max(this.shakeAmt, amount); }

  banner(html, ms = 2200) {
    this.bannerEl.innerHTML = html;
    this.bannerEl.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.bannerEl.classList.add('hidden'), ms);
  }

  // ---- scene helpers --------------------------------------------------------------

  /** Standard sky + sun lighting. */
  lights({ sky = 0xdcefff, ground = 0x6d8f55, hemi = 1.2, sun = 2.2, sunColor = 0xfff0d4, sunPos = [20, 40, 25], box = 40, background = '#8fd0ff', fog = null } = {}) {
    const s = this.scene;
    s.background = new THREE.Color(background);
    if (fog) s.fog = new THREE.Fog(fog[0], fog[1], fog[2]);
    s.add(new THREE.HemisphereLight(sky, ground, hemi));
    const light = new THREE.DirectionalLight(sunColor, sun);
    light.position.set(...sunPos);
    light.castShadow = settings.quality !== 'low';
    light.shadow.mapSize.set(settings.quality === 'high' ? 2048 : 1024, settings.quality === 'high' ? 2048 : 1024);
    Object.assign(light.shadow.camera, { left: -box, right: box, top: box, bottom: -box, near: 1, far: 200 });
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.03;
    s.add(light, light.target);
    return light;
  }

  /** Where the mouse points on the horizontal plane y = height (or null). */
  pointerOnPlane(height = 0) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), p) ? p : null;
  }

  /** Objects under the mouse. */
  pick(objects) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  // ---- people ----------------------------------------------------------------------

  /** A player's 3D character with a floating name tag. Set p.x/p.z/p.heading/p.moving each frame. */
  person(k) {
    let p = this.people.get(k);
    if (p) return p;
    const char = new Character(S.players[k]?.look);
    char.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(char.root);
    const el = document.createElement('div');
    el.className = `wl-actor${k === S.me ? ' me' : ''}`;
    el.innerHTML = '<div class="wl-emote hidden"></div><div class="wl-bubble hidden"></div><div class="area-sub"></div><div class="wl-tag"><span class="wl-lv"></span><b></b></div>';
    this.labels.append(el);
    p = {
      k, char, el, sub: el.querySelector('.area-sub'), x: 0, y: 0, z: 0, heading: 0, moving: false, speed: 1.25,
      smooth: true, visible: true, lookRef: null, tagKey: '', labelLift: 0,
    };
    this.people.set(k, p);
    return p;
  }

  removePerson(k) {
    const p = this.people.get(k);
    if (!p) return;
    this.scene?.remove(p.char.root);
    p.el.remove();
    this.people.delete(k);
  }

  updatePeople(dt, t) {
    for (const p of this.people.values()) {
      const look = S.players[p.k]?.look;
      if (look && look !== p.lookRef) { p.lookRef = look; p.char.setLook(look); p.char.setProp?.(p.char.propKind); }
      const root = p.char.root;
      root.visible = p.visible;
      root.position.set(p.x, p.y, p.z);
      const cur = root.rotation.y;
      const diff = Math.atan2(Math.sin(p.heading - cur), Math.cos(p.heading - cur));
      root.rotation.y = p.smooth ? cur + diff * Math.min(1, dt * 12) : p.heading;
      p.char.update(dt, t, p.moving, p.speed);
    }
  }

  updateLabels() {
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (const p of this.people.values()) {
      const pl = S.players[p.k];
      const r = p.char.root;
      const tall = TALL_HATS.has(pl?.look?.hat) ? 0.45 : 0;
      v.set(r.position.x, r.position.y + (2.2 + tall + p.labelLift + p.char.rig.head.position.y - 1.52) * r.scale.y + p.char.rig.body.position.y, r.position.z);
      const s = v.clone().project(this.camera);
      if (!p.visible || s.z > 1 || s.z < -1) { p.el.style.display = 'none'; continue; }
      p.el.style.display = '';
      const dist = this.camera.position.distanceTo(v);
      const scale = clamp(17 / dist, 0.55, 1.1);
      p.el.style.transform = `translate3d(${(((s.x + 1) / 2) * w).toFixed(1)}px, ${(((1 - s.y) / 2) * h).toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      if (pl && p.tagKey !== `${pl.name}|${pl.level}|${pl.color}`) {
        p.tagKey = `${pl.name}|${pl.level}|${pl.color}`;
        p.el.querySelector('.wl-tag b').textContent = pl.name;
        p.el.querySelector('.wl-lv').textContent = `Lv ${pl.level}`;
        p.el.querySelector('.wl-tag').style.setProperty('--c', pl.color);
      }
    }
  }

  // ---- cameras -----------------------------------------------------------------------

  /** Orbit camera around a moving target (drag to turn, scroll to zoom). */
  useOrbit({ target = new THREE.Vector3(), yaw = 0, pitch = 0.7, dist = 14, height = 1.3, ...limits } = {}) {
    this.orbit = { target, yaw, pitch, dist, height, cur: null, ...limits };
    return this.orbit;
  }

  applyOrbit(dt) {
    const o = this.orbit;
    const goal = o.target.clone().add(new THREE.Vector3(0, o.height, 0));
    if (!o.cur) o.cur = goal.clone();
    o.cur.lerp(goal, 1 - Math.exp(-dt * 9));
    // below a low orbit the camera stays off the floor and tilts its gaze up instead (never straight up)
    const LOW = 0.08, orbit = Math.max(o.pitch, LOW), cp = Math.cos(orbit);
    this.camera.position.set(o.cur.x + Math.sin(o.yaw) * cp * o.dist, Math.max(0.5, o.cur.y + Math.sin(orbit) * o.dist), o.cur.z + Math.cos(o.yaw) * cp * o.dist);
    this.camera.lookAt(o.cur.x, o.cur.y + Math.max(0, LOW - o.pitch) * o.dist * 1.1, o.cur.z);
  }

  // ---- interactables ("Press E to …") -----------------------------------------------

  /** Something you can walk up to and use. obj (optional) is clickable. */
  interactable({ x, z, r = 2, label, icon = null, use, obj = null }) {
    const it = { x, z, r, label, icon, use, obj };
    this.interactables.push(it);
    if (obj) obj.traverse((o) => { o.userData.interact = it; });
    return it;
  }

  updateInteract() {
    const me = this.people.get(S.me);
    let near = null;
    if (me && this.interactables.length) {
      let best = Infinity;
      for (const it of this.interactables) {
        const d = Math.hypot(me.x - it.x, me.z - it.z);
        if (d < it.r && d < best) { best = d; near = it; }
      }
    }
    if (near !== this.near) {
      this.near = near;
      this.promptEl.classList.toggle('hidden', !near);
      if (near) {
        this.promptEl.innerHTML = `Press <kbd>E</kbd> or click to ${near.icon ? `<span class="prompt-ico">${iconSvg(near.icon)}</span> ` : ''}${esc(near.label)}`;
        this.promptEl.onclick = () => near.use();
        sfx('near');
      }
    }
  }

  clickInteract() {
    const objs = this.interactables.filter((i) => i.obj).map((i) => i.obj);
    if (!objs.length) return false;
    const hit = this.pick(objs)[0];
    const it = hit?.object.userData.interact;
    if (!it) return false;
    const me = this.people.get(S.me);
    if (me && Math.hypot(me.x - it.x, me.z - it.z) < it.r + 3) it.use();
    else if (this.walkTo) this.walkTo(it);
    return true;
  }

  // ---- walking around (casino floor etc.) ---------------------------------------------

  /**
   * Let the player walk around a room with WASD/click-to-walk, with others in the same scene
   * synced through area_move. solids: [{ x, z, w, d }] boxes (centre + size) or [{ x, z, r }] circles.
   */
  walker({ spawn = { x: 0, z: 0 }, bounds, solids = [], speed = 5, orbit = {} }) {
    const me = this.person(S.me);
    Object.assign(me, { x: spawn.x, z: spawn.z, heading: Math.PI });
    const o = this.useOrbit({ target: new THREE.Vector3(), yaw: 0, pitch: 0.62, dist: 11, minDist: 5, maxDist: 20, minPitch: -0.45, ...orbit });
    let target = null, sent = { at: 0, x: 0, z: 0 };
    const R = 0.4;
    const blocked = (x, z) => {
      if (bounds && (x < bounds.minX + R || x > bounds.maxX - R || z < bounds.minZ + R || z > bounds.maxZ - R)) return true;
      return solids.some((s) => (s.r != null ? Math.hypot(x - s.x, z - s.z) < s.r + R
        : Math.abs(x - s.x) < s.w / 2 + R && Math.abs(z - s.z) < s.d / 2 + R));
    };
    this.walkTo = (it) => { target = { x: it.x, z: it.z, stopAt: it.r * 0.7, use: it.use }; };
    const prevPointer = this.onPointer;
    this.onPointer = (type, e, d) => {
      prevPointer?.(type, e, d);
      if (type !== 'up' || !d || d.moved || d.button !== 0) return;
      const objs = this.interactables.filter((i) => i.obj).map((i) => i.obj);
      if (objs.length && this.pick(objs).length) return; // clickInteract handles that
      const p = this.pointerOnPlane(0);
      if (p) target = { x: p.x, z: p.z, stopAt: 0.2 };
    };
    const offs = [
      net.on('area', (m) => {
        for (const k of [...this.people.keys()]) if (k !== S.me) this.removePerson(k);
        for (const q of m.others) { const p = this.person(q.k); Object.assign(p, { x: q.x ?? 0, z: q.z ?? 0, tx: q.x ?? 0, tz: q.z ?? 0, heading: q.h ?? 0 }); }
      }),
      net.on('area_pos', (m) => {
        const p = this.person(m.k);
        if (p.tx == null) { p.x = m.x; p.z = m.z; }
        p.tx = m.x; p.tz = m.z; p.heading = m.h;
      }),
      net.on('area_del', (m) => this.removePerson(m.k)),
    ];
    this.onFrame((dt, now) => {
      const k = this.keys;
      let ix = 0, iy = 0;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      if (k.has('w') || k.has('arrowup')) iy -= 1;
      if (k.has('s') || k.has('arrowdown')) iy += 1;
      if (k.has('q')) o.yaw += dt * 2 * settings.keyTurn;
      if (k.has('r')) o.yaw -= dt * 2 * settings.keyTurn;
      let dx = 0, dz = 0;
      if (ix || iy) {
        const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw), rx = Math.cos(o.yaw), rz = -Math.sin(o.yaw);
        dx = rx * ix - fx * iy;
        dz = rz * ix - fz * iy;
        target = null;
      } else if (target) {
        const vx = target.x - me.x, vz = target.z - me.z, d = Math.hypot(vx, vz);
        if (d <= target.stopAt) { const use = target.use; target = null; use?.(); }
        else { dx = vx / d; dz = vz / d; }
      }
      const len = Math.hypot(dx, dz);
      const run = k.has('shift') ? 1.9 : 0.7;
      me.moving = false;
      me.speed = run > 1 ? 1.9 : 0.85;
      if (len) {
        const step = speed * run * dt;
        const nx = me.x + (dx / len) * step, nz = me.z + (dz / len) * step;
        const bx = me.x, bz = me.z;
        if (!blocked(nx, me.z)) me.x = nx;
        if (!blocked(me.x, nz)) me.z = nz;
        if (Math.abs(me.x - bx) + Math.abs(me.z - bz) > 0.0001) { me.moving = true; me.heading = Math.atan2(me.x - bx, me.z - bz); }
        else target = null;
      }
      o.target.set(me.x, 0, me.z);
      if (now - sent.at > 80 && (me.x !== sent.x || me.z !== sent.z)) {
        sent = { at: now, x: me.x, z: me.z };
        net.send('area_move', { x: +me.x.toFixed(2), z: +me.z.toFixed(2), h: +me.heading.toFixed(2) });
      }
      const lerp = 1 - Math.exp(-dt * 12);
      for (const p of this.people.values()) {
        if (p.k === S.me || p.tx == null) continue;
        const ox = p.tx - p.x, oz = p.tz - p.z;
        p.x += ox * lerp;
        p.z += oz * lerp;
        p.moving = Math.hypot(ox, oz) > 0.05;
      }
    });
    return { me, stop: () => offs.forEach((f) => f()) };
  }
}

export const stage = new Stage();
