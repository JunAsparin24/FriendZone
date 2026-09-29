// Small shared 3D effects for the areas: particle bursts, floating text, glowing orbs and ground rings.
import * as THREE from 'three';
import { TAU, additive, glowTexture, puffTexture, basic } from './materials.js';

/** Pooled additive sparks with velocity, gravity and fade. */
export class Sparks {
  constructor(scene, count = 220) {
    this.list = Array.from({ length: count }, () => {
      const s = new THREE.Sprite(additive(glowTexture, 0xffffff, 1));
      s.visible = false;
      s.userData = { vx: 0, vy: 0, vz: 0, life: 0, max: 1, g: 0, size: 0.3 };
      scene.add(s);
      return s;
    });
    this.i = 0;
  }

  burst(x, y, z, color = '#ffffff', { n = 14, speed = 5, up = 2, gravity = 9, size = 0.35, life = 0.6 } = {}) {
    for (let k = 0; k < n; k++) {
      const s = this.list[this.i++ % this.list.length];
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.8);
      s.position.set(x, y, z);
      s.material.color.set(color);
      Object.assign(s.userData, { vx: Math.cos(a) * v, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), g: gravity, size });
      s.userData.max = s.userData.life;
      s.visible = true;
    }
  }

  /** One soft puff that just fades where it is (trails, dust). */
  puff(x, y, z, color = '#ffffff', size = 0.6, life = 0.35) {
    const s = this.list[this.i++ % this.list.length];
    s.position.set(x, y, z);
    s.material.color.set(color);
    Object.assign(s.userData, { vx: 0, vy: 0.3, vz: 0, life, max: life, g: 0, size });
    s.visible = true;
  }

  update(dt) {
    for (const s of this.list) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      u.vy -= u.g * dt;
      s.position.x += u.vx * dt;
      s.position.y = Math.max(0.05, s.position.y + u.vy * dt);
      s.position.z += u.vz * dt;
      const k = u.life / u.max;
      s.scale.setScalar(u.size * (0.4 + k * 0.6));
      s.material.opacity = Math.min(1, k * 1.6);
    }
  }
}

/** Floating text ("+10", "CRIT!", "BONK!") that rises and fades. */
export class FloatText {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  add(text, x, y, z, color = '#ffffff', size = 1) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.font = '900 56px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(20,15,40,.85)';
    ctx.strokeText(text, 128, 50);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.renderOrder = 10;
    s.position.set(x, y, z);
    s.scale.set(2.4 * size, 0.9 * size, 1);
    this.scene.add(s);
    this.items.push({ s, age: 0 });
  }

  update(dt) {
    this.items = this.items.filter((it) => {
      it.age += dt;
      it.s.position.y += dt * 1.4;
      it.s.material.opacity = Math.min(1, 2.2 - it.age * 2);
      if (it.age < 1.1) return true;
      this.scene.remove(it.s);
      it.s.material.map.dispose();
      it.s.material.dispose();
      return false;
    });
  }
}

/** A glowing orb (bullets, boss projectiles): a small core plus an additive halo. */
export function orb(color = '#ffffff', r = 0.18, halo = 3.5) {
  const g = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), basic('#ffffff'));
  const glow = new THREE.Sprite(additive(glowTexture, new THREE.Color(color), 0.9));
  glow.scale.setScalar(r * halo * 2);
  g.add(glow);
  g.userData.glow = glow;
  return g;
}

const ringCache = new Map();
/** Flat ring/disc on the ground (telegraphs, pickup pads, revive circles). */
export function groundRing(inner, outer, color, opacity = 0.5) {
  const key = `${inner}|${outer}`;
  if (!ringCache.has(key)) ringCache.set(key, new THREE.RingGeometry(inner, outer, 48));
  const m = new THREE.Mesh(ringCache.get(key), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

export function groundDisc(r, color, opacity = 0.35) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

const emojiTex = new Map();
/** A camera-facing emoji sprite (power-ups, markers). */
export function emojiSprite(emoji, size = 1) {
  if (!emojiTex.has(emoji)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = '100px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 72);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    emojiTex.set(emoji, t);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex.get(emoji), transparent: true, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

/** Instanced crowd of bobbing spectators on stands; returns an update(t) function. */
export function crowd(parent, spots, colors = ['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#ffffff', '#e57bff', '#ff9f43']) {
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.35, 3, 8), new THREE.MeshToonMaterial({ color: '#ffffff' }), spots.length);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshToonMaterial({ color: '#f6c9a0' }), spots.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  const skins = ['#ffe0c4', '#f6c9a0', '#e3ac78', '#c68642', '#8d5524'];
  spots.forEach((s, i) => {
    body.setColorAt(i, c.set(colors[i % colors.length]));
    head.setColorAt(i, c.set(skins[(i * 7) % skins.length]));
  });
  parent.add(body, head);
  const update = (t, hype = 1) => {
    spots.forEach((s, i) => {
      const hop = Math.abs(Math.sin(t * (3 + hype * 3) + i * 1.7)) * 0.18 * hype;
      m.makeTranslation(s.x, s.y + 0.4 + hop, s.z);
      body.setMatrixAt(i, m);
      m.makeTranslation(s.x, s.y + 0.85 + hop, s.z);
      head.setMatrixAt(i, m);
    });
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return update;
}

export { puffTexture };
