// Full-screen 3D "areas" you teleport into from the world: the race track, arena, casino floor,
// boss cave, arcade and archery range. There is one shared renderer; each area builds its
// scene into the stage and gets helpers for characters, name tags, input, cameras and prompts.
import * as THREE from 'three';
import { guardKeys } from './keyguard.js';
import { watchContext } from './gfxguard.js';
import { registerLook, mouseLooking } from './mouselook.js';
import { net } from './net.js';
import { S, esc, isTyping } from './state.js';
import { Character } from './three/character.js';
import { settings, onSettings, pixelRatio, shakeScale } from './settings.js';
import { iconSvg } from './icons.js';
import { sfx } from './sfx.js';
import { touch, registerTouch, setTouchButtons, actionHint, fitFov } from './touch.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TALL_HATS = new Set(['hat_party', 'hat_tophat', 'hat_wizard', 'hat_halo', 'hat_viking', 'hat_crown', 'hat_horns']);

class Stage {
  constructor() {
    this.el = null;
    this.active = null;
    this.keys = new Set();
    guardKeys(this.keys);
    this.mouse = new THREE.Vector2(0, 0);
    this.mouseIn = false;
    this.people = new Map();
    this.frameFns = [];
    this.shakeAmt = 0;
  }

  setup() {
    if (this.el) return;
    // chat bubbles over whoever said it, if they're in here with you
    net.on('chat', (m) => {
      const p = this.active && this.people.get(m.k);
      if (!p) return;
      const b = p.el.querySelector('.wl-bubble');
      b.textContent = m.text;
      b.classList.remove('hidden');
      clearTimeout(p.bubbleTimer);
      p.bubbleTimer = setTimeout(() => b.classList.add('hidden'), 5000);
    });
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
    el.querySelector('.area-exit').onclick = () => (this.town ? window.dispatchEvent(new CustomEvent('fz:lobby')) : this.onExit?.());

    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: settings.quality !== 'low', powerPreference: settings.quality === 'low' ? 'default' : 'high-performance' });
    watchContext(this.canvas);
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
    // phones: the left thumb presses WASD (or walks, in rooms), the right thumb turns/aims/taps
    registerTouch({
      canvas: this.canvas,
      root: el,
      active: () => !!this.active && !document.querySelector('#modal:not(.hidden)'),
      stick: () => this.active?.touch?.stick !== false,
      keys: this.keys,
      zoom: (f) => {
        const o = this.orbit;
        if (o && !o.fixed) o.dist = clamp(o.dist * f, o.minDist ?? 4, o.maxDist ?? 30);
      },
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
      if (d && e.pointerId === d.id) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true;
        // in aiming games a finger on the screen aims, it doesn't turn the camera
        const aiming = e.pointerType === 'touch' && this.active?.touch?.aim;
        if (d.moved && this.orbit && !this.orbit.fixed && !aiming) {
          const fk = this.orbit.fps && e.pointerType === 'touch' ? 1.5 : 1; // first person on a phone: turn faster
          this.orbit.yaw -= dx * 0.0055 * settings.camSens * fk;
          this.orbit.pitch = clamp(this.orbit.pitch + dy * 0.0035 * fk * settings.camSens * (settings.invertY ? -1 : 1), this.orbit.minPitch ?? 0.25, this.orbit.maxPitch ?? 1.3);
        }
        d.x = e.clientX;
        d.y = e.clientY;
      }
      this.onPointer?.('move', e);
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      toNdc(e);
      this.mouseIn = true; // a finger has no hover, so this is where it's "pointing" now
      if (e.fzPinch || (this.drag && e.pointerType === 'touch')) return; // a second finger isn't a new drag
      this.drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button, id: e.pointerId };
      this.pointerDown = true;
      this.onPointer?.('down', e);
    });
    window.addEventListener('pointercancel', (e) => {
      if (this.drag?.id !== e.pointerId) return;
      this.drag = null;
      this.pointerDown = false;
      this.onPointer?.('up', e, { moved: true });
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.active) return;
      const d = this.drag;
      if (d && e.pointerId !== d.id) return;
      this.drag = null;
      if (e.fzPinch) { this.pointerDown = false; this.onPointer?.('up', e, { moved: true }); return; }
      this.pointerDown = false;
      if (mouseLooking()) {
        // cursor hidden: games still need to hear the button go up (or a held trigger never lets go),
        // and a plain click uses whatever's nearby
        this.onPointer?.('up', e, { ...(d ?? {}), moved: true });
        if (d && !d.moved && d.button === 0) this.near?.use();
        return;
      }
      this.onPointer?.('up', e, d);
      if (d && !d.moved && d.button === 0) this.clickInteract();
    });
    this.canvas.addEventListener('pointerleave', () => { this.mouseIn = false; });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const o = this.orbit;
      if (!o) return;
      let d = o.dist * (1 + e.deltaY * 0.0011 * settings.zoomSens);
      // walking around: zoom right in and it snaps to first person (and back out)
      if (o.fpZoom && e.deltaY < 0 && d < 4) d = o.minDist;
      else if (o.fpZoom && e.deltaY > 0 && o.dist <= o.minDist + 0.01) d = 4;
      o.dist = clamp(d, o.minDist ?? 4, o.maxDist ?? 30);
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
    // keep the town chat on top of the area, so you can talk in shops, games and houses too
    const chat = document.querySelector('#world .chat');
    if (chat) { chat.classList.add('chat-float'); document.body.append(chat); }
    const chatInput = document.querySelector('#chatInput');
    if (chatInput && !chatInput.dataset.townHint) { chatInput.dataset.townHint = chatInput.placeholder; chatInput.placeholder = touch.enabled ? 'Say something…' : 'Enter to chat'; }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) document.activeElement.blur(); // so E works straight away
    this.shakeAmt = 0;
    this.title.innerHTML = `${iconSvg(activity.icon) || activity.emoji} ${esc(activity.place ?? activity.name)}`;
    this.el.classList.remove('hidden');
    this.fade.classList.remove('out');
    void this.fade.offsetWidth;
    this.fade.classList.add('out');
    this.resize();
    this.active = activity;
    setTouchButtons(activity.touch?.buttons);
    document.body.classList.add('in-area');
    if (touch.enabled && activity.touch?.hint) setTimeout(() => this.active === activity && this.banner(activity.touch.hint, 4500), 900);
    try {
      this.cleanup = activity.area(this);
      this.tipsTab();
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

  /** A town (Coral Cove) rather than a place you pop into: the corner button goes to the lobby. */
  setTown(on) {
    this.town = on;
    this.el.querySelector('.area-exit').textContent = on ? '← Lobby' : '← Leave';
    this.el.classList.toggle('is-town', on);
  }

  close() {
    if (!this.active) return;
    cancelAnimationFrame(this.raf);
    try { this.cleanup?.(); } catch (e) { console.error(e); }
    this.cleanup = null;
    this.active = null;
    this.camRoom = null;
    this.keys.clear();
    const chat = document.querySelector('.chat.chat-float');
    if (chat) { chat.classList.remove('chat-float'); document.querySelector('#world')?.append(chat); }
    const chatInput = document.querySelector('#chatInput');
    if (chatInput?.dataset.townHint) { chatInput.placeholder = chatInput.dataset.townHint; delete chatInput.dataset.townHint; }
    setTouchButtons([]);
    document.body.classList.remove('in-area');
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
    this.camera.fov = fitFov(w < 700 ? 62 : 50, w / h);
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

  /** Fold the game's how-to-play line into an ℹ️ tab in the bottom right: shown for a few seconds when
   * you arrive, then tucked away until you click it. */
  tipsTab() {
    const tips = [...this.hud.querySelectorAll('.arena-help:not(.house-hint)')];
    if (!tips.length) return;
    const tab = document.createElement('div');
    tab.className = 'tips-tab open';
    tab.innerHTML = '<button class="tips-btn" title="How to play">ℹ️</button><div class="tips-body hud-panel"></div>';
    const body = tab.querySelector('.tips-body');
    for (const t of tips) { t.classList.remove('hud-panel', 'arena-help'); body.append(t); }
    tab.querySelector('.tips-btn').onclick = (e) => { e.stopPropagation(); tab.classList.toggle('open'); };
    tab.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.hud.append(tab);
    setTimeout(() => tab.classList.remove('open'), 6000);
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
    el.innerHTML = '<div class="wl-emote hidden"></div><div class="wl-bubble hidden"></div><div class="area-sub"></div><div class="wl-dev hidden"><span data-text="DEVELOPER">DEVELOPER</span></div><div class="wl-tag"><span class="wl-lv"></span><b></b></div>';
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
      p.el.querySelector('.wl-dev')?.classList.toggle('hidden', !(pl?.look?.aura === 'aura_devtitle'));
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
    const goal = o.target.clone().add(new THREE.Vector3(0, o.height + (o.fpZoom && o.dist < 1 && !o.fps ? 0.3 : 0), 0));
    if (!o.cur) o.cur = goal.clone();
    if (o.fps || (o.fpZoom && o.dist < 1)) {
      // first person: the camera sits at the eyes and looks along yaw/pitch (pitch > 0 looks down)
      o.cur.copy(goal);
      this.camera.position.copy(goal);
      const cp = Math.cos(o.pitch);
      this.camera.lookAt(goal.x - Math.sin(o.yaw) * cp, goal.y - Math.sin(o.pitch), goal.z - Math.cos(o.yaw) * cp);
      return;
    }
    o.cur.lerp(goal, 1 - Math.exp(-dt * 9));
    // below a low orbit the camera stays off the floor and tilts its gaze up instead (never straight up)
    const LOW = 0.08, orbit = Math.max(o.pitch, LOW), cp = Math.cos(orbit);
    let dx = Math.sin(o.yaw) * cp * o.dist, dy = Math.sin(orbit) * o.dist, dz = Math.cos(o.yaw) * cp * o.dist;
    const room = this.camRoom;
    if (room && !room.off) {
      // shorten the arm so the camera stops just inside the walls and under the wall tops
      const m = 0.35;
      let t = 1;
      if (dx > 0) t = Math.min(t, (room.maxX - m - o.cur.x) / dx); else if (dx < 0) t = Math.min(t, (room.minX + m - o.cur.x) / dx);
      if (dz > 0) t = Math.min(t, (room.maxZ - m - o.cur.z) / dz); else if (dz < 0) t = Math.min(t, (room.minZ + m - o.cur.z) / dz);
      // walls inside the room (a house's partitions): the camera stops just in front of them too
      for (const b of room.blockers ?? []) {
        let t0 = 0, t1 = 1;
        for (const [o0, d, lo, hi] of [[o.cur.x, dx, b.x0 - m * 0.6, b.x1 + m * 0.6], [o.cur.z, dz, b.z0 - m * 0.6, b.z1 + m * 0.6]]) {
          if (Math.abs(d) < 1e-6) { if (o0 < lo || o0 > hi) { t0 = 2; break; } continue; }
          let a1 = (lo - o0) / d, a2 = (hi - o0) / d;
          if (a1 > a2) [a1, a2] = [a2, a1];
          t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
        }
        if (t0 <= t1 && t0 > 0 && t0 < t) t = t0;
      }
      t = Math.max(0.12, t);
      dx *= t; dz *= t;
      dy = Math.min(dy, room.maxY - o.cur.y); // stay under the ceiling (just flatter, not closer)
    }
    this.camera.position.set(o.cur.x + dx, Math.max(0.5, o.cur.y + dy), o.cur.z + dz);
    this.camera.lookAt(o.cur.x, o.cur.y + Math.max(0, LOW - o.pitch) * o.dist * 1.1, o.cur.z);
  }

  // ---- interactables ("Press E to …") -----------------------------------------------

  /** Something you can walk up to and use. obj (optional) is clickable. */
  interactable({ x, z, r = 2, label, icon = null, use, obj = null, when = null }) {
    const it = { x, z, r, label, icon, use, obj, when }; // (when: only offered while it returns true)
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
        if (d < it.r && d < best && (!it.when || it.when())) { best = d; near = it; }
      }
    }
    if (near !== this.near) {
      this.near = near;
      this.promptEl.classList.toggle('hidden', !near);
      if (near) {
        this.promptEl.innerHTML = `${actionHint()} ${near.icon ? `<span class="prompt-ico">${iconSvg(near.icon)}</span> ` : ''}${esc(near.label)}`;
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
    if (!it || (it.when && !it.when())) return false;
    const me = this.people.get(S.me);
    if (me && Math.hypot(me.x - it.x, me.z - it.z) < it.r + 3) it.use();
    return true;
  }

  // ---- walking around (casino floor etc.) ---------------------------------------------

  /**
   * Let the player walk around a room with WASD/click-to-walk, with others in the same scene
   * synced through area_move. solids: [{ x, z, w, d }] boxes (centre + size) or [{ x, z, r }] circles.
   */
  walker({ spawn = { x: 0, z: 0 }, bounds, solids = [], speed = 5, orbit = {}, ceiling = 4.6, speedOf = null, frozen = null, blockedAt = null, wire = null }) {
    // (wire: { out, in } turn positions into the ones sent over the network and back, for a place whose
    // own coordinates move about, like the neighbourhood, which is always centred on the house you're at)
    const wOut = (x, z, h) => (wire ? wire.out(x, z, h) : { x, z, h }), wIn = (x, z, h) => (wire ? wire.in(x, z, h) : { x, z, h });
    // keep the camera inside the room: it can zoom out only as far as the walls (and stays under their top)
    this.camRoom = bounds ? { ...bounds, maxY: ceiling, off: false } : null;
    const me = this.person(S.me);
    Object.assign(me, { x: spawn.x, z: spawn.z, heading: Math.PI });
    const o = this.useOrbit({ target: new THREE.Vector3(), yaw: 0, pitch: 0.62, dist: 11, minDist: 0.3, maxDist: 20, minPitch: -0.45, fpZoom: true, ...orbit });
    let target = null, sent = { at: 0, x: 0, z: 0 };
    const R = 0.4;
    const blocked = (x, z) => {
      if (bounds && (x < bounds.minX + R || x > bounds.maxX - R || z < bounds.minZ + R || z > bounds.maxZ - R)) return true;
      if (blockedAt?.(x, z)) return true;
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
      // (no walking by tapping the floor: move with the keys or the stick)
    };
    const offs = [
      net.on('area', (m) => {
        for (const k of [...this.people.keys()]) if (k !== S.me) this.removePerson(k);
        for (const q of m.others) { const p = this.person(q.k), at = wIn(q.x ?? 0, q.z ?? 0, q.h ?? 0); Object.assign(p, { x: at.x, z: at.z, tx: at.x, tz: at.z, heading: at.h }); }
      }),
      net.on('area_pos', (m) => {
        const p = this.person(m.k), at = wIn(m.x, m.z, m.h);
        if (p.tx == null) { p.x = at.x; p.z = at.z; }
        p.tx = at.x; p.tz = at.z; p.heading = at.h;
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
      if (touch.stick.active && (touch.stick.x || touch.stick.y)) { ix = touch.stick.x; iy = touch.stick.y; } // analog thumb
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
      const run = k.has('shift') || (touch.stick.active && touch.stick.run) ? 1.65 : 0.7;
      me.moving = false;
      me.speed = run > 1 ? 1.75 : 0.85;
      if (frozen?.()) { dx = dz = 0; target = null; } // (driving a boat, fishing…)
      const fp = this.orbit === o && o.dist < 1;
      if (this.orbit === o) me.visible = !fp;
      if (fp) me.heading = o.yaw + Math.PI;
      if (Math.hypot(dx, dz)) {
        const step = (speedOf ? speedOf() : speed) * run * dt;
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
        const at = wOut(me.x, me.z, me.heading);
        net.send('area_move', { x: +at.x.toFixed(2), z: +at.z.toFixed(2), h: +at.h.toFixed(2) });
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
