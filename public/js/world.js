// The shared 3D overworld: walk around, see friends, chat, emote and enter activities.
// Movement and networking use map pixels (like the server); rendering happens in Three.js.
import * as THREE from 'three';
import { net } from './net.js';
import { S, isTyping, esc } from './state.js';
import * as M from './map.js';
import { Character } from './three/character.js';
import { buildEnvironment } from './three/environment.js';
import { puffTexture, basic } from './three/materials.js';

export const EMOTES = M.EMOTES;
export const SPOTS = M.SPOTS;

const SPEED = 230;            // map px per second
const R = 12;                 // collision radius in map px
const TALL_HATS = new Set(['hat_party', 'hat_tophat', 'hat_wizard', 'hat_halo', 'hat_viking', 'hat_crown']);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const solid = (s) => (s.kind === 'pond' ? M.solidOf(s) : { x: s.x, y: s.y, w: s.w, h: s.h });
const BUILDING_HEIGHT = { garage: 8.2, cave: 7.6, colosseum: 7.2, range: 7.4, casino: 8.4, market: 6.2, boutique: 8.2, houses: 7.4, pond: 2.2 };

export class World {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.labels = document.getElementById('worldLabels');
    this.minimap = document.getElementById('minimap');
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
  }

  // ---- setup -------------------------------------------------------------------

  init() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);

    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x6d8f55, 1.25));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 170 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.env = buildEnvironment(this.scene);
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

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.camTarget = new THREE.Vector3();
    this.camReady = false;

    this.signs = SPOTS.map((s) => {
      const el = document.createElement('div');
      el.className = 'wl-sign';
      el.innerHTML = `<span class="wl-em">${s.emoji}</span>${esc(s.name)}${s.soon ? ' <small>soon</small>' : ''}<kbd>E</kbd>`;
      this.labels.append(el);
      const c = M.to3(s.x + s.w / 2, s.kind === 'pond' ? s.y : s.y + s.h / 2);
      return { spot: s, el, pos: new THREE.Vector3(c.x, BUILDING_HEIGHT[s.kind] ?? 7, c.z) };
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
        me.x = me.tx = m.me.x;
        me.y = me.ty = m.me.y;
        if (fresh) this.camReady = false;
        m.others.forEach((o) => this.addActor(o.k, o.x, o.y));
      }),
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
        a.char.jump();
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
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContext);
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
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContext);
    for (const k of [...this.actors.keys()]) this.removeActor(k);
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
      k, x, y, tx: x, ty: y, heading: 0, moving: false, char, lookRef: S.players[k]?.look, dustT: 0,
      el: { wrap, emote: wrap.children[0], bubble: wrap.children[1], tag: wrap.children[2] },
    };
    this.actors.set(k, a);
    return a;
  }

  removeActor(k) {
    const a = this.actors.get(k);
    if (!a) return;
    this.scene.remove(a.char.root);
    a.el.wrap.remove();
    clearTimeout(a.bubbleTimer);
    clearTimeout(a.emoteTimer);
    this.actors.delete(k);
  }

  emote(e) {
    if (this.actors.has(S.me) && EMOTES[e]) net.send('emote', { e });
  }

  // ---- input -------------------------------------------------------------------

  onKeyDown = (e) => {
    if (this.paused || isTyping()) return;
    const key = e.key.toLowerCase();
    if (key === 'e' && this.near) {
      this.hooks.onActivity(this.near.id);
      return;
    }
    const emoteIndex = '123456'.indexOf(key);
    if (emoteIndex >= 0 && !e.repeat) {
      this.emote(Object.keys(EMOTES)[emoteIndex]);
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'r'].includes(key)) {
      this.keys.add(key);
      e.preventDefault();
    }
  };
  onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
  onBlur = () => this.keys.clear();
  onContext = (e) => e.preventDefault();

  onPointerDown = (e) => {
    if (this.paused) return;
    this.drag = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
  };
  onPointerMove = (e) => {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true;
    if (d.moved) {
      this.yaw -= dx * 0.0055;
      this.pitch = clamp(this.pitch + dy * 0.0035, 0.28, 1.35);
      d.x = e.clientX;
      d.y = e.clientY;
    }
  };
  onPointerUp = (e) => {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved || d.button !== 0 || this.paused || !this.actors.has(S.me)) return;
    this.clickAt(e.clientX, e.clientY);
  };
  onWheel = (e) => {
    e.preventDefault();
    this.dist = clamp(this.dist * (1 + e.deltaY * 0.0011), 7, 34);
  };

  clickAt(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.env.buildings, true)[0];
    let spot = null;
    for (let o = hit?.object; o; o = o.parent) if (o.userData.spot) { spot = o.userData.spot; break; }
    if (spot) {
      if (this.near === spot) { this.hooks.onActivity(spot.id); return; }
      this.pendingSpot = spot;
      this.target = M.doorOf(spot);
      return;
    }
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, p)) return;
    const px = p.x * M.PX + M.CENTER.x, py = p.z * M.PX + M.CENTER.y;
    const pond = SPOTS.find((s) => s.kind === 'pond');
    if (M.distToRect({ x: px, y: py }, solid(pond)) === 0) {
      if (this.near === pond) { this.hooks.onActivity(pond.id); return; }
      this.pendingSpot = pond;
      this.target = M.doorOf(pond);
      return;
    }
    this.pendingSpot = null;
    this.target = { x: clamp(px, 30, M.W - 30), y: clamp(py, 30, M.H - 30) };
  }

  resize = () => {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < 700 ? 60 : 50;
    this.camera.updateProjectionMatrix();
  };

  // ---- simulation ----------------------------------------------------------------

  blocked(x, y) {
    if (Math.hypot(x - M.CENTER.x, y - M.CENTER.y) < M.FOUNTAIN_R + R + 4) return true;
    if (SPOTS.some((s) => M.distToRect({ x, y }, solid(s)) < R)) return true;
    if (this.layout.trees.some((t) => t.kind !== 'bush' && Math.hypot(x - t.x, y - t.y) < 9 + R)) return true;
    return this.layout.lamps.some((l) => Math.hypot(x - l.x, y - l.y) < 5 + R);
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
    if (me) this.updateMe(me, dt, now);

    const lerp = 1 - Math.exp(-dt * 12);
    for (const a of this.actors.values()) {
      if (a !== me) {
        const ox = a.tx - a.x, oy = a.ty - a.y;
        a.x += ox * lerp;
        a.y += oy * lerp;
        a.moving = Math.hypot(ox, oy) > 1.5;
        if (a.moving) a.heading = Math.atan2(ox, oy);
      }
      const look = S.players[a.k]?.look;
      if (look && look !== a.lookRef) {
        a.lookRef = look;
        a.char.setLook(look);
      }
      const p = M.to3(a.x, a.y);
      a.char.root.position.set(p.x, 0, p.z);
      const cur = a.char.root.rotation.y;
      const diff = Math.atan2(Math.sin(a.heading - cur), Math.cos(a.heading - cur));
      a.char.root.rotation.y = cur + diff * Math.min(1, dt * 12);
      a.char.update(dt, t, a.moving, 1.25);

      a.dustT -= dt;
      if (a.moving && a.dustT <= 0) {
        a.dustT = 0.13;
        const s = this.dust[this.dustIndex++ % this.dust.length];
        s.position.set(p.x - Math.sin(a.heading) * 0.3, 0.15, p.z - Math.cos(a.heading) * 0.3);
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

    if (me) {
      const near = SPOTS.find((s) => M.distToRect(me, solid(s)) < 44) ?? null;
      if (near !== this.near) {
        this.near = near;
        this.hooks.onNear(near);
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
      this.doorRing.position.set(p.x, 0.06, p.z);
      this.doorRing.material.opacity = 0.55 + Math.sin(t * 5) * 0.3;
      this.doorRing.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
    } else this.doorRing.visible = false;
    if (this.target) {
      const p = M.to3(this.target.x, this.target.y);
      this.targetRing.visible = true;
      this.targetRing.position.set(p.x, 0.06, p.z);
      this.targetRing.scale.setScalar(1 + Math.sin(t * 8) * 0.12);
    } else this.targetRing.visible = false;

    this.env.update(dt, t);
    this.updateCamera(dt, me);
  }

  updateMe(me, dt, now) {
    let ix = 0, iy = 0;
    if (!this.paused) {
      const k = this.keys;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      if (k.has('w') || k.has('arrowup')) iy -= 1;
      if (k.has('s') || k.has('arrowdown')) iy += 1;
      if (k.has('q')) this.yaw += dt * 2;
      if (k.has('r')) this.yaw -= dt * 2;
    }
    let dx = 0, dy = 0;
    if (ix || iy) {
      // camera-relative: forward is away from the camera
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      dx = rx * ix + fx * -iy;
      dy = rz * ix + fz * -iy;
      this.target = this.pendingSpot = null;
    } else if (this.target && !this.paused) {
      const vx = this.target.x - me.x, vy = this.target.y - me.y;
      const d = Math.hypot(vx, vy);
      if (d < 6) this.target = null;
      else { dx = vx / d; dy = vy / d; }
    }
    const len = Math.hypot(dx, dy);
    me.moving = false;
    if (len) {
      const bx = me.x, by = me.y;
      this.moveBy(me, (dx / len) * SPEED * dt, (dy / len) * SPEED * dt);
      if (Math.abs(me.x - bx) + Math.abs(me.y - by) < 0.01) this.target = null;
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
    const goal = new THREE.Vector3(p.x, 1.3, p.z);
    if (!this.camReady) { this.camTarget.copy(goal); this.camReady = true; }
    this.camTarget.lerp(goal, 1 - Math.exp(-dt * 9));
    const c = this.camTarget, cp = Math.cos(this.pitch);
    this.camera.position.set(c.x + Math.sin(this.yaw) * cp * this.dist, c.y + Math.sin(this.pitch) * this.dist, c.z + Math.cos(this.yaw) * cp * this.dist);
    this.camera.lookAt(c);
    this.sun.position.set(c.x + 26, 48, c.z + 34);
    this.sun.target.position.set(c.x, 0, c.z);
  }

  // ---- rendering ------------------------------------------------------------------

  frame = (now) => {
    if (!this.running) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
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
      v.set(a.char.root.position.x, 2.2 + tall + a.char.rig.body.position.y, a.char.root.position.z);
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
    const w = mm.clientWidth, h = mm.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (mm.width !== w * dpr) { mm.width = w * dpr; mm.height = h * dpr; }
    const ctx = mm.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.env.groundCanvas, 0, 0, w, h);
    const sx = w / M.W, sy = h / M.H;
    ctx.fillStyle = 'rgba(13,31,74,.18)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '12px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of SPOTS) ctx.fillText(s.emoji, (s.x + s.w / 2) * sx, (s.y + s.h / 2) * sy);
    const me = this.actors.get(S.me);
    if (me) {
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.beginPath();
      ctx.moveTo(me.x * sx, me.y * sy);
      const f = Math.atan2(-Math.cos(this.yaw), -Math.sin(this.yaw));
      ctx.arc(me.x * sx, me.y * sy, 34, f - 0.55, f + 0.55);
      ctx.fill();
    }
    for (const a of this.actors.values()) {
      if (a === me) continue;
      ctx.fillStyle = S.players[a.k]?.color ?? '#fff';
      ctx.strokeStyle = '#0d1f4a';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(a.x * sx, a.y * sy, 3.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (me) {
      ctx.save();
      ctx.translate(me.x * sx, me.y * sy);
      ctx.rotate(Math.PI - me.heading);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#0d1f4a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
}
