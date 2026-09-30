// 3D furniture, floors and wallpapers for houses, built from primitives like everything else.
// Each builder makes a model centred on its footprint (w x d tiles, 1 unit per tile) with its
// front facing +Z (wall items: centred on the wall surface, facing out). Builders may push
// per-frame animations into `A.anim` (return true to finish) and return { use } for clicks.
import * as THREE from 'three';
import { TAU, toon, basic, shiny, outlineMaterial, canvasTexture, additive, glowTexture, flameTexture } from './materials.js';

const OUT = outlineMaterial(0.018);
const cache = new Map();
const geo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, seg = 20, open = false) => geo(`c${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
const sph = (r, ws = 18, hs = 14) => geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const plane = (w, h) => geo(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h));
const cone = (r, h, seg = 16) => geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));

function add(parent, geometry, material, { p = [0, 0, 0], r = null, s = null, outline = true, cast = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  if (s != null) (Array.isArray(s) ? m.scale.set(...s) : m.scale.setScalar(s));
  m.castShadow = cast;
  m.receiveShadow = true;
  if (outline) {
    const o = new THREE.Mesh(geometry, OUT);
    o.userData.outline = true;
    m.add(o);
  }
  parent.add(m);
  return m;
}

const emojiSprites = new Map();
function emojiMaterial(emoji) {
  if (!emojiSprites.has(emoji)) {
    const tex = canvasTexture(128, 128, (ctx) => {
      ctx.font = '96px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, 64, 72);
    });
    emojiSprites.set(emoji, tex);
  }
  return new THREE.SpriteMaterial({ map: emojiSprites.get(emoji), transparent: true, depthWrite: false });
}

/** Little emoji that floats up out of a piece of furniture (notes, Zzz, bubbles…). */
export function floatEmoji(g, A, emoji, y = 1.2, count = 3) {
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(emojiMaterial(emoji));
    s.scale.setScalar(0.001);
    g.add(s);
    let t = -i * 0.35;
    const dx = (Math.random() - 0.5) * 0.6;
    A.anim.push((_, dt) => {
      t += dt;
      if (t < 0) return false;
      const k = t / 1.6;
      s.position.set(dx + Math.sin(t * 4) * 0.15, y + k * 1.2, 0.2);
      s.scale.setScalar(0.35 * Math.min(1, t * 4));
      s.material.opacity = 1 - k;
      if (k >= 1) { g.remove(s); s.material.dispose(); return true; }
      return false;
    });
  }
}

/** A canvas texture you can redraw every frame (TV and arcade screens). */
function liveScreen(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const ctx = c.getContext('2d');
  return { tex, redraw: (t, on) => { draw(ctx, t, on); tex.needsUpdate = true; } };
}

const WOOD = '#a8723f', DARK_WOOD = '#6e4424';

// ---------------------------------------------------------------------------
// textures for posters, paintings and rugs
// ---------------------------------------------------------------------------

const paintingTex = canvasTexture(256, 192, (ctx) => {
  const sky = ctx.createLinearGradient(0, 0, 0, 192);
  sky.addColorStop(0, '#ffb86b');
  sky.addColorStop(1, '#ff6b9a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 256, 192);
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath(); ctx.arc(180, 80, 30, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a3a7a';
  ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(70, 70); ctx.lineTo(140, 150); ctx.fill();
  ctx.fillStyle = '#7a4a9a';
  ctx.beginPath(); ctx.moveTo(90, 160); ctx.lineTo(170, 90); ctx.lineTo(256, 160); ctx.fill();
  ctx.fillStyle = '#2f7f5e';
  ctx.fillRect(0, 150, 256, 42);
});
const posterTex = canvasTexture(192, 256, (ctx) => {
  ctx.fillStyle = '#1a3d85';
  ctx.fillRect(0, 0, 192, 256);
  ctx.fillStyle = '#ffd84d';
  for (let i = 0; i < 20; i++) ctx.fillRect((i * 53) % 192, (i * 97) % 256, 3, 3);
  ctx.font = '44px "Luckiest Guy", Rubik, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.fillText('FRIEND', 96, 110);
  ctx.fillStyle = '#ff5d8c';
  ctx.fillText('ZONE', 96, 156);
  ctx.font = '40px serif';
  ctx.fillText('🎮', 96, 220);
});
const rugTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#b3203a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#ffc53d';
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, 220, 220);
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, 176, 176);
  ctx.fillStyle = '#ffc53d';
  ctx.translate(128, 128);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(TAU / 8);
    ctx.beginPath(); ctx.ellipse(0, -44, 10, 26, 0, 0, TAU); ctx.fill();
  }
});
const heartRugTex = canvasTexture(256, 256, (ctx) => {
  const heart = (s, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(128, 128 + 90 * s);
    ctx.bezierCurveTo(128 - 130 * s, 128 - 10 * s, 128 - 90 * s, 128 - 110 * s, 128, 128 - 50 * s);
    ctx.bezierCurveTo(128 + 90 * s, 128 - 110 * s, 128 + 130 * s, 128 - 10 * s, 128, 128 + 90 * s);
    ctx.fill();
  };
  heart(1.25, '#ff7ab6');
  heart(1.05, '#ffffff');
  heart(0.95, '#ffb3d9');
  heart(0.5, '#ff8fc7');
});
const fluffyRugTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#ffc2dd';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.35)' : 'rgba(230,110,160,.18)';
    ctx.fillRect((i * 37) % 256, (i * 91) % 256, 3, 3);
  }
});
const roundRugTex = canvasTexture(256, 256, (ctx) => {
  for (let r = 128, i = 0; r > 0; r -= 18, i++) {
    ctx.fillStyle = ['#3b5bdb', '#9fd8ff', '#2ed8c3', '#f4f4f4'][i % 4];
    ctx.beginPath(); ctx.arc(128, 128, r, 0, TAU); ctx.fill();
  }
});
const targetTex = canvasTexture(128, 128, (ctx) => {
  ['#f4f4f4', '#2a2a2a', '#3aa0ff', '#ff4d4d', '#ffd84d'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(64, 64, 62 - i * 12, 0, TAU); ctx.fill();
  });
});
const skyTex = canvasTexture(256, 128, (ctx) => {
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#6ec3ff');
  g.addColorStop(1, '#d8f1ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#ffffff';
  for (const [x, y, s] of [[60, 50, 1], [180, 36, 0.8], [140, 80, 0.6]]) {
    for (const [dx, r] of [[0, 14], [14, 18], [30, 13]]) { ctx.beginPath(); ctx.arc(x + dx * s, y, r * s, 0, TAU); ctx.fill(); }
  }
  ctx.fillStyle = '#5fae55';
  ctx.beginPath(); ctx.ellipse(128, 140, 180, 40, 0, 0, TAU); ctx.fill();
});
const slotTex = canvasTexture(192, 64, (ctx) => {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 192, 64);
  ctx.font = '44px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['7️⃣', '7️⃣', '7️⃣'].forEach((s, i) => ctx.fillText(s, 32 + i * 64, 36));
});

// ---------------------------------------------------------------------------
// builders
// ---------------------------------------------------------------------------

/** An open-fronted cabinet (back, sides, top, bottom) so what's on the shelves shows. */
function carcass(g, w, h, d, z, mat, backMat) {
  add(g, box(w, h, 0.06), backMat ?? mat, { p: [0, h / 2, z - d / 2 + 0.03] });
  for (const s of [-1, 1]) add(g, box(0.06, h, d), mat, { p: [s * (w / 2 - 0.03), h / 2, z] });
  add(g, box(w, 0.06, d), mat, { p: [0, h - 0.03, z] });
  add(g, box(w, 0.06, d), mat, { p: [0, 0.03, z] });
}

function pedestal(g) {
  add(g, box(0.62, 0.5, 0.62), toon('#e8e2f4'), { p: [0, 0.25, 0] });
  add(g, box(0.7, 0.08, 0.7), toon('#c9c1dc'), { p: [0, 0.54, 0] });
}

export const FURNITURE = {
  closet(g, A) {
    const wood = toon('#8b5a2b');
    add(g, box(0.9, 2.2, 0.62), wood, { p: [0, 1.1, -0.15] });
    add(g, box(0.96, 0.12, 0.68), toon(DARK_WOOD), { p: [0, 2.26, -0.15] });
    const mirror = new THREE.MeshStandardMaterial({ color: '#cfefff', roughness: 0.05, metalness: 0.6 });
    add(g, box(0.36, 1.7, 0.03), mirror, { p: [-0.2, 1.15, 0.17], outline: false });
    add(g, box(0.36, 1.7, 0.03), toon('#a8723f'), { p: [0.2, 1.15, 0.17], outline: false });
    for (const x of [-0.04, 0.04]) add(g, sph(0.035, 8, 6), shiny('#ffd84d'), { p: [x, 1.15, 0.2], outline: false });
    const shine = new THREE.Sprite(additive(glowTexture, 0xffffff, 0.3));
    shine.scale.set(0.3, 1.2, 1);
    shine.position.set(-0.26, 1.3, 0.2);
    g.add(shine);
    return { use: () => floatEmoji(g, A, '✨', 1.8, 2) };
  },

  bed(g, A) {
    const wood = toon(WOOD);
    add(g, box(0.96, 0.3, 1.96), wood, { p: [0, 0.2, 0] });
    add(g, box(0.9, 0.18, 1.86), toon('#f4f0ff'), { p: [0, 0.44, 0.02] });
    add(g, box(0.94, 0.1, 1.25), toon('#5b8ff9'), { p: [0, 0.55, 0.33] });
    add(g, box(0.96, 0.32, 0.05), toon('#5b8ff9'), { p: [0, 0.42, 0.96], outline: false });
    add(g, sph(0.2), toon('#ffffff'), { p: [0, 0.6, -0.66], s: [1.9, 0.55, 1] });
    add(g, box(1.02, 1.05, 0.1), wood, { p: [0, 0.52, -0.95] });
    add(g, box(1.02, 0.55, 0.08), wood, { p: [0, 0.28, 0.97] });
    return { use: () => floatEmoji(g, A, '💤', 0.9) };
  },

  sofa(g, A, { color = '#e0463c', w = 1.9 } = {}) {
    const fabric = toon(color), dark = toon(new THREE.Color(color).multiplyScalar(0.8).getStyle());
    add(g, box(w, 0.36, 0.84), dark, { p: [0, 0.2, 0.02] });
    const n = w > 1.5 ? 2 : 1;
    for (let i = 0; i < n; i++) add(g, box(w / n - 0.26 / n, 0.16, 0.66), fabric, { p: [-w / 2 + 0.13 + (i + 0.5) * ((w - 0.26) / n), 0.45, 0.08] });
    add(g, box(w, 0.62, 0.22), fabric, { p: [0, 0.62, -0.32] });
    for (const s of [-1, 1]) add(g, box(0.18, 0.5, 0.84), dark, { p: [s * (w / 2 - 0.09), 0.46, 0.02] });
    add(g, sph(0.16), toon('#ffd84d'), { p: [-w / 2 + 0.32, 0.62, -0.12], s: [1, 1, 0.5], r: [0.3, 0, 0.3] });
    return { use: () => floatEmoji(g, A, '✨', 0.8, 2) };
  },
  armchair(g, A) { return FURNITURE.sofa(g, A, { color: '#39c6ff', w: 0.94 }); },

  beanbag(g, A) {
    add(g, sph(0.42, 24, 18), toon('#b77bff'), { p: [0, 0.3, 0], s: [1, 0.7, 1] });
    add(g, sph(0.3, 20, 14), toon('#c99bff'), { p: [0, 0.48, -0.12], s: [1.1, 0.8, 0.8] });
    return { use: () => floatEmoji(g, A, '😌', 0.9, 1) };
  },

  table(g) {
    add(g, cyl(0.44, 0.44, 0.06, 32), toon(WOOD), { p: [0, 0.74, 0] });
    add(g, cyl(0.05, 0.06, 0.7, 10), toon(DARK_WOOD), { p: [0, 0.37, 0] });
    add(g, cyl(0.24, 0.26, 0.05, 20), toon(DARK_WOOD), { p: [0, 0.03, 0] });
    add(g, cyl(0.07, 0.06, 0.12, 12), toon('#ffffff'), { p: [0.12, 0.83, 0.08] });
    add(g, cyl(0.06, 0.08, 0.2, 12), toon('#39c6ff'), { p: [-0.15, 0.87, -0.1] });
    add(g, sph(0.07, 10, 8), toon('#ff5d73'), { p: [-0.15, 1.0, -0.1] });
  },

  chair(g) {
    const wood = toon(WOOD);
    add(g, box(0.5, 0.06, 0.5), wood, { p: [0, 0.46, 0] });
    for (const x of [-0.21, 0.21]) for (const z of [-0.21, 0.21]) add(g, box(0.05, 0.46, 0.05), toon(DARK_WOOD), { p: [x, 0.23, z], outline: false });
    add(g, box(0.5, 0.5, 0.05), wood, { p: [0, 0.74, -0.23] });
    add(g, box(0.44, 0.05, 0.44), toon('#ff9fb4'), { p: [0, 0.5, 0.01], outline: false });
  },

  lamp(g) {
    add(g, cyl(0.2, 0.24, 0.06), shiny('#3a3f5a'), { p: [0, 0.03, 0] });
    add(g, cyl(0.025, 0.025, 1.5, 8), shiny('#3a3f5a'), { p: [0, 0.78, 0], outline: false });
    const shadeMat = toon('#ffe9b0', { side: THREE.DoubleSide }).clone();
    shadeMat.emissive = new THREE.Color('#ffcf6b');
    add(g, cyl(0.18, 0.32, 0.36, 20, true), shadeMat, { p: [0, 1.6, 0] });
    const light = new THREE.PointLight(0xffd79a, 2.4, 5.5, 1.6);
    light.position.set(0, 1.45, 0);
    g.add(light);
    const glow = new THREE.Sprite(additive(glowTexture, 0xffd27a, 0.55));
    glow.scale.setScalar(1.3);
    glow.position.y = 1.55;
    g.add(glow);
    let on = true;
    const set = () => { light.visible = glow.visible = on; shadeMat.emissiveIntensity = on ? 0.8 : 0; };
    set();
    return { use: () => { on = !on; set(); } };
  },

  plant(g) {
    add(g, cyl(0.2, 0.15, 0.34, 16), toon('#c96b2c'), { p: [0, 0.17, 0] });
    add(g, cyl(0.19, 0.19, 0.03, 16), toon('#4a2e1c'), { p: [0, 0.33, 0], outline: false });
    const leaf = toon('#3fa34d');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      add(g, sph(0.14, 12, 10), i % 2 ? leaf : toon('#56c262'), { p: [Math.cos(a) * 0.14, 0.52 + (i % 3) * 0.08, Math.sin(a) * 0.14], s: [0.6, 1.4, 0.35], r: [Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5] });
    }
  },

  tree(g) {
    add(g, cyl(0.28, 0.22, 0.44, 18), toon('#e8e2f4'), { p: [0, 0.22, 0] });
    add(g, cyl(0.05, 0.07, 1.1, 8), toon(DARK_WOOD), { p: [0, 0.95, 0] });
    for (const [x, y, z, r] of [[0, 1.65, 0, 0.42], [0.25, 1.45, 0.1, 0.3], [-0.24, 1.5, -0.05, 0.32], [0.05, 1.95, -0.1, 0.28]]) {
      add(g, sph(r, 14, 12), toon(r > 0.35 ? '#2f9e44' : '#3fb356'), { p: [x, y, z] });
    }
  },

  bookshelf(g) {
    const wood = toon(DARK_WOOD);
    carcass(g, 1.9, 2.1, 0.44, -0.26, toon(WOOD), wood);
    const colors = ['#e0463c', '#39c6ff', '#ffd84d', '#6ee7a0', '#b77bff', '#ff9f43', '#f4f4f4'];
    for (let shelf = 0; shelf < 4; shelf++) {
      const y = 0.12 + shelf * 0.5;
      add(g, box(1.8, 0.04, 0.4), wood, { p: [0, y, -0.24], outline: false });
      let x = -0.84;
      let k = shelf * 3;
      while (x < 0.8) {
        const w = 0.07 + ((k * 7) % 5) * 0.015, h = 0.3 + ((k * 13) % 4) * 0.03;
        add(g, box(w, h, 0.3), toon(colors[k % colors.length]), { p: [x + w / 2, y + 0.02 + h / 2, -0.22], outline: false });
        x += w + 0.01 + (k % 6 === 5 ? 0.18 : 0);
        k++;
      }
    }
  },

  tv(g, A) {
    add(g, box(1.7, 0.48, 0.5), toon('#3a3f5a'), { p: [0, 0.24, -0.1] });
    add(g, box(0.5, 0.2, 0.02), toon('#23263f'), { p: [-0.4, 0.26, 0.16], outline: false });
    add(g, box(0.1, 0.3, 0.1), shiny('#23263f'), { p: [0, 0.62, -0.2] });
    add(g, box(1.76, 1.02, 0.08), shiny('#15131f', { metalness: 0.3 }), { p: [0, 1.25, -0.22] });
    const screen = liveScreen(160, 90, (ctx, t, on) => {
      if (!on) { ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 160, 90); return; }
      const hue = (t * 40) % 360;
      const g2 = ctx.createLinearGradient(0, 0, 160, 90);
      g2.addColorStop(0, `hsl(${hue},80%,55%)`);
      g2.addColorStop(1, `hsl(${(hue + 120) % 360},80%,45%)`);
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, 160, 90);
      ctx.font = '28px "Luckiest Guy", Rubik, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('FZ TV', 80 + Math.sin(t * 1.3) * 40, 52 + Math.cos(t * 1.7) * 20);
    });
    const mat = new THREE.MeshBasicMaterial({ map: screen.tex });
    add(g, plane(1.62, 0.9), mat, { p: [0, 1.25, -0.175], outline: false, cast: false });
    let on = true;
    A.anim.push((t) => { screen.redraw(t, on); return false; });
    return { use: () => { on = !on; } };
  },

  fireplace(g, A) {
    add(g, box(1.9, 1.5, 0.62), toon('#b5654a'), { p: [0, 0.75, -0.19] });
    add(g, box(2.02, 0.14, 0.72), toon('#e8e2f4'), { p: [0, 1.55, -0.16] });
    add(g, box(1.1, 0.85, 0.1), basic('#1a0b08'), { p: [0, 0.48, 0.1], outline: false });
    add(g, box(1.3, 0.08, 0.3), toon('#6e6a80'), { p: [0, 0.04, 0.2] });
    for (const x of [-0.2, 0.15]) add(g, cyl(0.06, 0.06, 0.6, 8), toon(DARK_WOOD), { p: [x, 0.15, 0.1], r: [0, 0.5, Math.PI / 2], outline: false });
    const flames = [];
    const mat = additive(flameTexture, 0xffffff, 0.95);
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(mat);
      g.add(s);
      flames.push(s);
    }
    const light = new THREE.PointLight(0xff8a3a, 2, 5, 1.8);
    light.position.set(0, 0.6, 0.6);
    g.add(light);
    let boost = 0;
    A.anim.push((t, dt) => {
      boost = Math.max(0, boost - dt);
      flames.forEach((s, i) => {
        const p = (t * 1.1 + i / 7) % 1;
        s.position.set(-0.3 + (i / 6) * 0.6 + Math.sin(t * 3 + i) * 0.04, 0.2 + p * 0.55, 0.14);
        const k = (1 - p) * (1 + boost * 0.6);
        s.scale.set(0.35 * k, 0.5 * k, 1);
      });
      light.intensity = 1.8 + Math.sin(t * 13) * 0.3 + Math.sin(t * 7.3) * 0.3 + boost;
      return false;
    });
    return { use: () => { boost = 1.5; floatEmoji(g, A, '🔥', 1, 2); } };
  },

  piano(g, A) {
    const black = shiny('#15131f', { metalness: 0.2, roughness: 0.2 });
    add(g, box(1.8, 1.25, 0.55), black, { p: [0, 0.72, -0.2] });
    add(g, box(1.8, 0.1, 0.3), black, { p: [0, 0.72, 0.18] });
    for (const s of [-1, 1]) add(g, box(0.1, 0.72, 0.3), black, { p: [s * 0.85, 0.36, 0.18] });
    add(g, box(1.6, 0.05, 0.24), toon('#ffffff'), { p: [0, 0.79, 0.2], outline: false });
    for (let i = 0; i < 22; i++) {
      if ([2, 6, 9, 13, 16, 20].includes(i)) continue;
      add(g, box(0.035, 0.04, 0.13), basic('#15131f'), { p: [-0.77 + i * 0.073, 0.82, 0.15], outline: false, cast: false });
    }
    add(g, box(0.5, 0.3, 0.02), toon('#fff6c9'), { p: [0, 1.15, 0.08], r: [-0.2, 0, 0], outline: false });
    return { use: () => floatEmoji(g, A, '🎵', 1.4, 4) };
  },

  arcade(g, A) {
    const body = toon('#3b5bdb');
    add(g, box(0.78, 1.9, 0.72), body, { p: [0, 0.95, -0.08] });
    add(g, box(0.8, 0.25, 0.74), toon('#ffd84d'), { p: [0, 1.8, -0.07] });
    add(g, box(0.78, 0.12, 0.36), toon('#23263f'), { p: [0, 1.0, 0.3] });
    add(g, cyl(0.02, 0.02, 0.12, 8), toon('#23263f'), { p: [-0.15, 1.12, 0.32], outline: false });
    add(g, sph(0.045, 10, 8), toon('#e0463c'), { p: [-0.15, 1.19, 0.32], outline: false });
    for (const [x, c] of [[0.06, '#6ee7a0'], [0.17, '#ff5d73']]) add(g, cyl(0.035, 0.035, 0.03, 12), toon(c), { p: [x, 1.07, 0.33], outline: false });
    const screen = liveScreen(96, 96, (ctx, t, flash) => {
      ctx.fillStyle = flash > 0 ? '#fff6b0' : '#0b0a24';
      ctx.fillRect(0, 0, 96, 96);
      ctx.fillStyle = '#6ee7a0';
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4; i++) {
          const x = 14 + i * 20 + Math.sin(t * 2) * 8, y = 14 + row * 14;
          ctx.fillRect(x, y, 10, 6);
          ctx.fillRect(x + (Math.floor(t * 4) % 2 ? -2 : 8), y + 6, 4, 3);
        }
      }
      ctx.fillStyle = '#39c6ff';
      ctx.fillRect(40 + Math.sin(t * 1.5) * 30, 80, 14, 6);
    });
    const mat = new THREE.MeshBasicMaterial({ map: screen.tex });
    add(g, plane(0.6, 0.55), mat, { p: [0, 1.42, 0.29], r: [-0.25, 0, 0], outline: false, cast: false });
    const glow = new THREE.Sprite(additive(glowTexture, 0x6ee7ff, 0.35));
    glow.scale.setScalar(1.2);
    glow.position.set(0, 1.42, 0.4);
    g.add(glow);
    let flash = 0;
    A.anim.push((t, dt) => { flash = Math.max(0, flash - dt); screen.redraw(t, flash); return false; });
    return { use: () => { flash = 0.3; floatEmoji(g, A, '👾', 1.9, 2); } };
  },

  jukebox(g, A) {
    add(g, box(0.8, 1.2, 0.6), toon('#8f1530'), { p: [0, 0.6, -0.1] });
    add(g, geo('jukeTop', () => new THREE.CylinderGeometry(0.4, 0.4, 0.6, 24, 1, false, -Math.PI / 2, Math.PI)), toon('#8f1530'), { p: [0, 1.2, -0.1], r: [-Math.PI / 2, 0, 0] });
    const stripes = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshBasicMaterial({ color: '#ff5dac' });
      stripes.push(m);
      add(g, box(0.1, 0.9, 0.04), m, { p: [-0.22 + i * 0.22, 0.75, 0.21], outline: false, cast: false });
    }
    add(g, box(0.5, 0.25, 0.04), toon('#ffd84d'), { p: [0, 0.3, 0.21], outline: false });
    let party = 0;
    A.anim.push((t, dt) => {
      party = Math.max(0, party - dt);
      stripes.forEach((m, i) => m.color.setHSL(((t * (party ? 0.8 : 0.15)) + i * 0.2) % 1, 0.85, 0.6));
      return false;
    });
    return { use: () => { party = 4; floatEmoji(g, A, '🎶', 1.5, 5); } };
  },

  rug(g) {
    add(g, plane(1.9, 1.9), new THREE.MeshToonMaterial({ map: rugTex }), { p: [0, 0.012, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
  },
  rug_round(g) {
    add(g, geo('roundRug', () => new THREE.CircleGeometry(0.95, 40)), new THREE.MeshToonMaterial({ map: roundRugTex }), { p: [0, 0.012, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
  },

  painting(g) {
    add(g, box(0.86, 0.66, 0.05), shiny('#c9a227', { metalness: 0.6 }), { p: [0, 0, 0.025] });
    add(g, plane(0.74, 0.54), new THREE.MeshBasicMaterial({ map: paintingTex }), { p: [0, 0, 0.052], outline: false, cast: false });
  },
  poster(g) {
    add(g, plane(0.6, 0.8), new THREE.MeshBasicMaterial({ map: posterTex }), { p: [0, 0, 0.01], outline: false, cast: false });
  },
  window(g, A) {
    const frame = toon('#ffffff');
    add(g, plane(1.5, 0.95), new THREE.MeshBasicMaterial({ map: skyTex }), { p: [0, 0, 0.01], outline: false, cast: false });
    for (const [w, h, x, y] of [[1.64, 0.08, 0, 0.5], [1.64, 0.08, 0, -0.5], [0.08, 1.08, -0.78, 0], [0.08, 1.08, 0.78, 0], [0.05, 1, 0, 0], [1.5, 0.05, 0, 0]]) {
      add(g, box(w, h, 0.06), frame, { p: [x, y, 0.03], outline: false });
    }
    add(g, box(1.7, 0.08, 0.2), frame, { p: [0, -0.56, 0.1] });
    return { use: () => floatEmoji(g, A, '🐦', 0.2, 1) };
  },
  clock(g, A) {
    add(g, cyl(0.3, 0.3, 0.06, 32), toon('#8b5a2b'), { p: [0, 0, 0.03], r: [Math.PI / 2, 0, 0] });
    add(g, geo('clockFace', () => new THREE.CircleGeometry(0.26, 32)), toon('#fff6e6'), { p: [0, 0, 0.065], outline: false, cast: false });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      add(g, box(0.02, 0.05, 0.01), basic('#3a2a1a'), { p: [Math.sin(a) * 0.21, Math.cos(a) * 0.21, 0.07], r: [0, 0, -a], outline: false, cast: false });
    }
    const hand = (len, w) => {
      const pivot = new THREE.Group();
      pivot.position.z = 0.075;
      add(pivot, box(w, len, 0.01), basic('#1d1b2e'), { p: [0, len / 2, 0], outline: false, cast: false });
      g.add(pivot);
      return pivot;
    };
    const hours = hand(0.13, 0.03), minutes = hand(0.2, 0.02);
    let spin = 0;
    A.anim.push((t, dt) => {
      spin = Math.max(0, spin - dt);
      const d = new Date();
      const m = d.getMinutes() + d.getSeconds() / 60 + spin * 60;
      minutes.rotation.z = -(m / 60) * TAU;
      hours.rotation.z = -(((d.getHours() % 12) + m / 60) / 12) * TAU;
      return false;
    });
    return { use: () => { spin = 1.5; } };
  },

  sofa_pink(g, A) { return FURNITURE.sofa(g, A, { color: '#ff9fc8' }); },
  armchair_pink(g, A) { return FURNITURE.sofa(g, A, { color: '#ffb8d6', w: 0.94 }); },
  beanbag_pink(g, A) {
    add(g, sph(0.42, 24, 18), toon('#ff8fc7'), { p: [0, 0.3, 0], s: [1, 0.7, 1] });
    add(g, sph(0.3, 20, 14), toon('#ffb3d9'), { p: [0, 0.48, -0.12], s: [1.1, 0.8, 0.8] });
    return { use: () => floatEmoji(g, A, '💖', 0.9, 1) };
  },
  bed_princess(g, A) {
    const white = toon('#fff6fb'), pink = toon('#ff9fc8'), rose = toon('#ff7ab6');
    add(g, box(0.96, 0.3, 1.96), white, { p: [0, 0.2, 0] });
    add(g, box(0.9, 0.18, 1.86), toon('#fff0f7'), { p: [0, 0.44, 0.02] });
    add(g, box(0.94, 0.1, 1.25), pink, { p: [0, 0.55, 0.33] });
    add(g, box(0.96, 0.32, 0.05), pink, { p: [0, 0.42, 0.96], outline: false });
    for (const x of [-0.22, 0.22]) add(g, sph(0.17), toon('#ffffff'), { p: [x, 0.62, -0.68], s: [1.2, 0.55, 0.9] });
    add(g, sph(0.12), rose, { p: [0, 0.66, -0.5], s: [1, 0.6, 0.6] });
    // curved headboard with a heart, and a canopy on four posts
    add(g, cyl(0.51, 0.51, 0.08, 24, false), white, { p: [0, 0.75, -0.95], r: [Math.PI / 2, 0, 0], s: [1, 1, 1.25] });
    add(g, sph(0.1), rose, { p: [-0.06, 1.0, -0.9], s: [1, 1, 0.4] });
    add(g, sph(0.1), rose, { p: [0.06, 1.0, -0.9], s: [1, 1, 0.4] });
    add(g, cone(0.12, 0.14, 4), rose, { p: [0, 0.9, -0.9], r: [Math.PI, Math.PI / 4, 0], s: [1, 1, 0.4], outline: false });
    for (const x of [-0.45, 0.45]) for (const z of [-0.93, 0.93]) add(g, cyl(0.03, 0.03, 1.9, 8), white, { p: [x, 0.95, z], outline: false });
    add(g, box(1.02, 0.06, 2.0), pink, { p: [0, 1.92, 0] });
    const drape = toon('#ffd6ea', { side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    for (const x of [-0.5, 0.5]) add(g, plane(1.9, 0.5), drape, { p: [x, 1.66, 0], r: [0, Math.PI / 2, 0], outline: false, cast: false });
    return { use: () => floatEmoji(g, A, '💤', 0.9) };
  },
  vanity(g, A) {
    const white = toon('#fff6fb'), pink = toon('#ff9fc8');
    add(g, box(0.9, 0.08, 0.5), white, { p: [0, 0.74, -0.2] });
    for (const x of [-0.38, 0.38]) add(g, box(0.1, 0.72, 0.44), white, { p: [x, 0.36, -0.2] });
    add(g, box(0.4, 0.2, 0.42), pink, { p: [0, 0.6, -0.2] });
    add(g, sph(0.035, 8, 6), shiny('#ffd84d'), { p: [0, 0.6, 0.02], outline: false });
    const mirror = new THREE.MeshStandardMaterial({ color: '#dff4ff', roughness: 0.05, metalness: 0.6 });
    add(g, cyl(0.3, 0.3, 0.04, 28), pink, { p: [0, 1.2, -0.4], r: [Math.PI / 2, 0, 0], s: [1, 1, 1.25] });
    add(g, cyl(0.25, 0.25, 0.05, 28), mirror, { p: [0, 1.2, -0.38], r: [Math.PI / 2, 0, 0], s: [1, 1, 1.25], outline: false });
    add(g, cyl(0.04, 0.05, 0.14, 10), toon('#e57bff'), { p: [-0.25, 0.85, -0.1] });
    add(g, sph(0.05, 10, 8), toon('#ff5d73'), { p: [0.25, 0.83, -0.1] });
    return { use: () => floatEmoji(g, A, '✨', 1.4, 2) };
  },
  shelf_pink(g) {
    carcass(g, 1.9, 1.5, 0.44, -0.26, toon('#ffd6ea'), toon('#ffb3d9'));
    const plush = [['#c9955a', 'bear'], ['#ffffff', 'bunny'], ['#ffd84d', 'duck'], ['#b77bff', 'bear'], ['#8fd3ff', 'bunny'], ['#ff8fa3', 'bear']];
    for (let shelf = 0; shelf < 2; shelf++) {
      const y = 0.1 + shelf * 0.68;
      add(g, box(1.8, 0.04, 0.4), toon('#ff9fc8'), { p: [0, y, -0.24], outline: false });
      for (let k = 0; k < 3; k++) {
        const [c, kind] = plush[shelf * 3 + k], x = -0.58 + k * 0.58, m = toon(c);
        add(g, sph(0.15, 14, 10), m, { p: [x, y + 0.17, -0.2], s: [1, 0.95, 0.9] });
        add(g, sph(0.12, 14, 10), m, { p: [x, y + 0.4, -0.2] });
        if (kind === 'bunny') for (const s of [-1, 1]) add(g, sph(0.04, 8, 6), m, { p: [x + s * 0.05, y + 0.56, -0.2], s: [0.8, 2.2, 0.6] });
        else if (kind === 'bear') for (const s of [-1, 1]) add(g, sph(0.045, 8, 6), m, { p: [x + s * 0.09, y + 0.5, -0.2] });
        else add(g, cone(0.04, 0.08, 8), toon('#ff9f43'), { p: [x, y + 0.38, -0.08], r: [Math.PI / 2, 0, 0], outline: false });
        for (const s of [-1, 1]) add(g, sph(0.018, 6, 4), basic('#2a1a12'), { p: [x + s * 0.045, y + 0.43, -0.09], outline: false });
      }
    }
  },
  lamp_pink(g) {
    add(g, cyl(0.2, 0.24, 0.06), toon('#ffffff'), { p: [0, 0.03, 0] });
    add(g, cyl(0.025, 0.025, 1.3, 8), toon('#6ee7a0'), { p: [0, 0.68, 0], outline: false });
    const petal = toon('#ffb3d9', { side: THREE.DoubleSide }).clone();
    petal.emissive = new THREE.Color('#ff8fc7');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      add(g, sph(0.16, 12, 10), petal, { p: [Math.cos(a) * 0.1, 1.42, Math.sin(a) * 0.1], s: [0.7, 1.2, 0.45], r: [Math.sin(a) * 0.35, -a, -Math.cos(a) * 0.35] });
    }
    add(g, sph(0.07, 10, 8), toon('#ffd84d'), { p: [0, 1.36, 0], outline: false });
    const light = new THREE.PointLight(0xffb3d9, 2.2, 5, 1.6);
    light.position.set(0, 1.3, 0);
    g.add(light);
    const glow = new THREE.Sprite(additive(glowTexture, 0xff9fc8, 0.5));
    glow.scale.setScalar(1.2);
    glow.position.y = 1.4;
    g.add(glow);
    let on = true;
    const set = () => { light.visible = glow.visible = on; petal.emissiveIntensity = on ? 0.6 : 0; };
    set();
    return { use: () => { on = !on; set(); } };
  },
  teddy(g, A) {
    const fur = toon('#c9955a'), light = toon('#f2d3a8');
    add(g, sph(0.34, 18, 14), fur, { p: [0, 0.34, 0], s: [1, 0.95, 0.9] });
    add(g, sph(0.2, 14, 10), light, { p: [0, 0.32, 0.2], s: [1, 1.1, 0.6], outline: false });
    const head = add(g, sph(0.26, 18, 14), fur, { p: [0, 0.82, 0.02] });
    add(head, sph(0.1, 12, 10), light, { p: [0, -0.06, 0.2], s: [1.2, 0.9, 0.8], outline: false });
    add(head, sph(0.035, 8, 6), basic('#2a1a12'), { p: [0, -0.02, 0.29], outline: false });
    for (const s of [-1, 1]) {
      add(head, sph(0.09, 12, 10), fur, { p: [s * 0.2, 0.2, -0.02] });
      add(head, sph(0.03, 8, 6), basic('#2a1a12'), { p: [s * 0.09, 0.06, 0.23], outline: false });
      add(g, sph(0.11, 12, 10), fur, { p: [s * 0.3, 0.44, 0.1], s: [0.8, 1.3, 0.8] }); // arms
      add(g, sph(0.12, 12, 10), fur, { p: [s * 0.2, 0.1, 0.22], s: [0.9, 0.7, 1.2] }); // feet
    }
    add(g, sph(0.08, 10, 8), toon('#ff5d73'), { p: [0, 0.6, 0.2], s: [1.6, 0.8, 0.6] }); // bow
    return { use: () => floatEmoji(g, A, '💗', 1.2, 2) };
  },
  bunny_plush(g, A) {
    const fur = toon('#ffffff'), pink = toon('#ffb3d9');
    add(g, sph(0.26, 18, 14), fur, { p: [0, 0.26, 0], s: [1, 0.95, 0.95] });
    const head = add(g, sph(0.22, 18, 14), fur, { p: [0, 0.62, 0.03] });
    for (const s of [-1, 1]) {
      add(head, sph(0.07, 10, 8), fur, { p: [s * 0.09, 0.3, -0.02], s: [0.8, 2.3, 0.5], r: [0, 0, -s * 0.15] });
      add(head, sph(0.04, 8, 6), pink, { p: [s * 0.09, 0.3, 0.01], s: [0.7, 2, 0.3], r: [0, 0, -s * 0.15], outline: false });
      add(head, sph(0.03, 8, 6), basic('#2a1a12'), { p: [s * 0.08, 0.03, 0.2], outline: false });
      add(g, sph(0.09, 10, 8), fur, { p: [s * 0.16, 0.08, 0.16], s: [0.9, 0.6, 1.3] });
    }
    add(head, sph(0.03, 8, 6), pink, { p: [0, -0.04, 0.22], outline: false });
    add(g, sph(0.08, 10, 8), fur, { p: [0, 0.2, -0.26] });
    return { use: () => floatEmoji(g, A, '💖', 1.0, 2) };
  },
  flowers(g) {
    add(g, cyl(0.12, 0.09, 0.34, 16), toon('#bfe6ff', { transparent: true, opacity: 0.8 }), { p: [0, 0.17, 0] });
    const cols = ['#ff8fc7', '#ff5d73', '#ffd84d', '#ffb3d9', '#ffffff'];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, r = i ? 0.1 : 0;
      add(g, cyl(0.01, 0.01, 0.4, 5), toon('#3fa34d'), { p: [Math.cos(a) * r * 0.5, 0.45, Math.sin(a) * r * 0.5], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], outline: false });
      add(g, sph(0.08, 10, 8), toon(cols[i % cols.length]), { p: [Math.cos(a) * r, 0.65 + (i % 2) * 0.05, Math.sin(a) * r] });
    }
  },
  cake(g) {
    add(g, cyl(0.36, 0.36, 0.04, 28), toon('#ffffff'), { p: [0, 0.62, 0] });
    add(g, cyl(0.06, 0.1, 0.6, 12), toon('#ffffff'), { p: [0, 0.3, 0] });
    add(g, cyl(0.28, 0.28, 0.2, 28), toon('#ffe3ef'), { p: [0, 0.74, 0] });
    add(g, cyl(0.2, 0.2, 0.16, 28), toon('#ffb3d9'), { p: [0, 0.92, 0] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      add(g, sph(0.045, 10, 8), toon('#ff3d5a'), { p: [Math.cos(a) * 0.14, 1.03, Math.sin(a) * 0.14], s: [1, 1.2, 1] });
    }
    add(g, cyl(0.012, 0.012, 0.12, 6), toon('#ffd84d'), { p: [0, 1.08, 0], outline: false });
  },
  rug_heart(g) {
    add(g, plane(1.9, 1.9), new THREE.MeshToonMaterial({ map: heartRugTex, transparent: true, alphaTest: 0.5 }), { p: [0, 0.012, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
  },
  rug_fluffy(g) {
    add(g, geo('fluffyRug', () => new THREE.CircleGeometry(0.92, 40)), new THREE.MeshToonMaterial({ map: fluffyRugTex }), { p: [0, 0.014, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
  },
  mirror_heart(g) {
    const heart = geo('heartShape', () => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.35);
      s.bezierCurveTo(-0.5, 0, -0.4, 0.38, 0, 0.18);
      s.bezierCurveTo(0.4, 0.38, 0.5, 0, 0, -0.35);
      return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
    });
    add(g, heart, toon('#ff7ab6'), { p: [0, 0, 0], s: [1.15, 1.15, 1] });
    add(g, heart, new THREE.MeshStandardMaterial({ color: '#e9f6ff', roughness: 0.05, metalness: 0.6 }), { p: [0, 0.02, 0.03], s: [0.9, 0.9, 1], outline: false });
  },
  fairy_lights(g, A) {
    const pts = Array.from({ length: 17 }, (_, i) => new THREE.Vector3(-0.8 + i * 0.1, 0.35 - Math.sin((i / 16) * Math.PI) * 0.22 - Math.abs(Math.sin((i / 8) * Math.PI)) * 0.08, 0.05));
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.016, 5), toon('#3fa34d'), { outline: false });
    const cols = [0xff8fc7, 0xffd84d, 0xffffff, 0x9fd8ff];
    const bulbs = [];
    pts.forEach((p, i) => {
      if (i % 2) return;
      const b = add(g, sph(0.055, 10, 8), basic(`#${cols[i % 4].toString(16).padStart(6, '0')}`), { p: [p.x, p.y - 0.04, p.z], outline: false, cast: false });
      const glow = new THREE.Sprite(additive(glowTexture, cols[i % 4], 0.6));
      glow.scale.setScalar(0.4);
      b.add(glow);
      bulbs.push(glow);
    });
    let on = true;
    A.anim.push((t) => { bulbs.forEach((b, i) => { b.visible = on; b.material.opacity = 0.4 + Math.sin(t * 3 + i) * 0.25; }); });
    return { use: () => { on = !on; } };
  },
  // ---- hanging from the ceiling (built downwards from y = 0, the ceiling) ----
  chandelier(g, A) {
    const gold = shiny('#ffc53d', { metalness: 0.7 });
    add(g, cyl(0.02, 0.02, 0.5, 6), gold, { p: [0, -0.25, 0], outline: false });
    add(g, geo('chanRing', () => new THREE.TorusGeometry(0.42, 0.03, 8, 32)), gold, { p: [0, -0.62, 0], r: [Math.PI / 2, 0, 0] });
    add(g, sph(0.1, 12, 10), gold, { p: [0, -0.58, 0] });
    const flames = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, x = Math.cos(a) * 0.42, z = Math.sin(a) * 0.42;
      add(g, cyl(0.035, 0.035, 0.14, 8), toon('#fff6e0'), { p: [x, -0.53, z], outline: false });
      const f = new THREE.Sprite(additive(glowTexture, 0xffd27a, 0.9));
      f.scale.setScalar(0.25);
      f.position.set(x, -0.42, z);
      g.add(f);
      flames.push(f);
    }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; add(g, geo('crystal', () => new THREE.OctahedronGeometry(0.04)), toon('#dff4ff', { transparent: true, opacity: 0.8 }), { p: [Math.cos(a) * 0.3, -0.74, Math.sin(a) * 0.3], s: [1, 2, 1], outline: false }); }
    const light = new THREE.PointLight(0xffd79a, 3, 7, 1.5);
    light.position.y = -0.7;
    g.add(light);
    let on = true;
    const set = () => { light.visible = on; flames.forEach((f) => { f.visible = on; }); };
    return { use: () => { on = !on; set(); } };
  },
  ceiling_fan(g, A) {
    add(g, cyl(0.03, 0.03, 0.35, 6), toon('#6e4424'), { p: [0, -0.18, 0], outline: false });
    add(g, cyl(0.14, 0.12, 0.14, 16), toon('#6e4424'), { p: [0, -0.4, 0] });
    const blades = new THREE.Group();
    blades.position.y = -0.44;
    g.add(blades);
    for (let i = 0; i < 4; i++) add(blades, box(0.75, 0.02, 0.16), toon('#a8723f'), { p: [Math.cos((i / 4) * TAU) * 0.45, 0, Math.sin((i / 4) * TAU) * 0.45], r: [0, -(i / 4) * TAU, 0.08] });
    add(g, sph(0.1, 12, 10), toon('#fff3c4', { emissive: '#ffd27a', emissiveIntensity: 0.5 }), { p: [0, -0.54, 0], outline: false });
    let spin = true;
    A.anim.push((t, dt) => { if (spin) blades.rotation.y += dt * 5; return false; });
    return { use: () => { spin = !spin; } };
  },
  pendant(g) {
    add(g, cyl(0.01, 0.01, 0.8, 5), toon('#23263f'), { p: [0, -0.4, 0], outline: false });
    const shade = toon('#ffb13b', { side: THREE.DoubleSide }).clone();
    shade.emissive = new THREE.Color('#ffcf6b');
    shade.emissiveIntensity = 0.4;
    add(g, cone(0.25, 0.3, 20), shade, { p: [0, -0.9, 0] });
    const bulb = add(g, sph(0.07, 10, 8), basic('#fff6c9'), { p: [0, -1.03, 0], outline: false });
    const light = new THREE.PointLight(0xffd79a, 2, 5, 1.6);
    light.position.y = -1.1;
    g.add(light);
    let on = true;
    return { use: () => { on = !on; light.visible = bulb.visible = on; shade.emissiveIntensity = on ? 0.4 : 0; } };
  },
  hanging_plant(g) {
    for (const a of [0, 2.1, 4.2]) add(g, cyl(0.006, 0.006, 0.6, 4), toon('#e8dcc8'), { p: [Math.cos(a) * 0.08, -0.3, Math.sin(a) * 0.08], r: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], outline: false });
    add(g, sph(0.2, 16, 10, ), toon('#c96b2c'), { p: [0, -0.68, 0], s: [1, 0.7, 1] });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      add(g, sph(0.1, 10, 8), toon(i % 2 ? '#3fa34d' : '#56c262'), { p: [Math.cos(a) * 0.2, -0.62 - (i % 3) * 0.15, Math.sin(a) * 0.2], s: [0.7, 1.6, 0.5], outline: false });
    }
  },
  disco_ball(g, A) {
    add(g, cyl(0.01, 0.01, 0.4, 5), toon('#c0c6d4'), { p: [0, -0.2, 0], outline: false });
    const ball = add(g, geo('disco', () => new THREE.IcosahedronGeometry(0.3, 2)), new THREE.MeshStandardMaterial({ color: '#dfe6f5', metalness: 0.95, roughness: 0.15, flatShading: true }), { p: [0, -0.7, 0] });
    const lights = ['#ff5d73', '#39c6ff', '#6ee7a0', '#ffd84d'].map((c, i) => {
      const l = new THREE.PointLight(c, 1.4, 6, 1.5);
      g.add(l);
      return l;
    });
    let on = true;
    A.anim.push((t) => {
      ball.rotation.y = t * 0.8;
      lights.forEach((l, i) => { const a = t * 1.2 + (i * TAU) / 4; l.position.set(Math.cos(a) * 1.4, -1.2, Math.sin(a) * 1.4); l.visible = on; });
      return false;
    });
    return { use: () => { on = !on; } };
  },
  paper_lanterns(g, A) {
    add(g, cyl(0.008, 0.008, 1.9, 4), toon('#3a2a1a'), { p: [0, -0.25, 0], r: [0, 0, Math.PI / 2], outline: false });
    const cols = ['#ff5d73', '#ffd84d', '#ff9f43', '#e57bff'];
    const lan = [];
    for (let i = 0; i < 4; i++) {
      const x = -0.72 + i * 0.48;
      const m = toon(cols[i]).clone();
      m.emissive = new THREE.Color(cols[i]);
      m.emissiveIntensity = 0.45;
      lan.push(add(g, sph(0.15, 14, 12), m, { p: [x, -0.46 - (i % 2) * 0.08, 0], s: [1, 1.25, 1] }));
      add(g, cyl(0.06, 0.06, 0.04, 10), toon('#3a2a1a'), { p: [x, -0.28 - (i % 2) * 0.08, 0], outline: false });
    }
    A.anim.push((t) => { lan.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.3 + i) * 0.08; }); return false; });
  },
  star_mobile(g, A) {
    add(g, cyl(0.008, 0.008, 0.3, 4), toon('#c0c6d4'), { p: [0, -0.15, 0], outline: false });
    const arm = new THREE.Group();
    arm.position.y = -0.3;
    g.add(arm);
    add(arm, cyl(0.01, 0.01, 0.9, 4), toon('#c0c6d4'), { r: [0, 0, Math.PI / 2], outline: false });
    const star = geo('mobileStar', () => { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.05 : 0.12; sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } return new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); });
    [['#ffd84d', -0.42, -0.3], ['#fff6c9', 0.42, -0.4], ['#8fd3ff', 0, -0.55]].forEach(([c, x, y]) => {
      add(arm, cyl(0.004, 0.004, Math.abs(y), 4), toon('#c0c6d4'), { p: [x, y / 2, 0], outline: false });
      add(arm, star, toon(c, { emissive: c, emissiveIntensity: 0.3 }), { p: [x, y, 0] });
    });
    A.anim.push((t) => { arm.rotation.y = Math.sin(t * 0.5) * 1.2; return false; });
  },
  // ---- more for the walls ----
  bookshelf_wall(g) {
    add(g, box(1.8, 0.05, 0.28), toon(WOOD), { p: [0, -0.25, 0.14] });
    add(g, box(1.8, 0.05, 0.28), toon(WOOD), { p: [0, 0.25, 0.14] });
    const colors = ['#e0463c', '#39c6ff', '#ffd84d', '#6ee7a0', '#b77bff', '#ff9f43'];
    for (const y of [-0.22, 0.28]) for (let k = 0; k < 9; k++) add(g, box(0.08, 0.3, 0.2), toon(colors[(k + Math.round(y * 10)) % colors.length]), { p: [-0.7 + k * 0.17, y + 0.15, 0.13], r: [0, 0, k % 4 === 3 ? 0.25 : 0], outline: false });
  },
  tv_wall(g, A) {
    add(g, box(1.8, 1.05, 0.06), shiny('#15131f', { metalness: 0.3 }), { p: [0, 0, 0.03] });
    const screen = liveScreen(160, 90, (ctx, t, on) => {
      if (!on) { ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 160, 90); return; }
      const hue = (t * 30) % 360;
      ctx.fillStyle = `hsl(${hue},70%,45%)`; ctx.fillRect(0, 0, 160, 90);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(80 + Math.sin(t) * 50, 45 + Math.cos(t * 1.3) * 25, 12, 0, TAU); ctx.fill();
    });
    add(g, plane(1.66, 0.93), new THREE.MeshBasicMaterial({ map: screen.tex }), { p: [0, 0, 0.065], outline: false, cast: false });
    let on = true;
    A.anim.push((t) => { screen.redraw(t, on); return false; });
    return { use: () => { on = !on; } };
  },
  fishtank(g, A) {
    add(g, box(1.8, 0.7, 0.62), toon(DARK_WOOD), { p: [0, 0.35, -0.12] });
    const glass = new THREE.MeshStandardMaterial({ color: '#bfefff', transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1, depthWrite: false });
    add(g, box(1.7, 0.85, 0.56), glass, { p: [0, 1.13, -0.12], outline: false, cast: false });
    add(g, box(1.66, 0.7, 0.52), new THREE.MeshBasicMaterial({ color: '#2f8fd8', transparent: true, opacity: 0.35, depthWrite: false }), { p: [0, 1.08, -0.12], outline: false, cast: false });
    add(g, box(1.66, 0.08, 0.52), toon('#e8d49a'), { p: [0, 0.75, -0.12], outline: false });
    for (const x of [-0.5, 0.35]) add(g, cone(0.07, 0.35, 8), toon('#3fb356'), { p: [x, 0.95, -0.2], outline: false });
    const fish = ['#ff9f43', '#ffd84d', '#ff5d73'].map((c, i) => {
      const f = new THREE.Group();
      add(f, sph(0.07, 10, 8), toon(c), { s: [1.5, 0.9, 0.6], outline: false });
      add(f, cone(0.05, 0.08, 6), toon(c), { p: [-0.12, 0, 0], r: [0, 0, Math.PI / 2], outline: false });
      g.add(f);
      return f;
    });
    let rush = 0;
    A.anim.push((t, dt) => {
      rush = Math.max(0, rush - dt);
      fish.forEach((f, i) => {
        const sp = 0.5 + i * 0.2 + rush;
        const x = Math.sin(t * sp + i * 2) * 0.65;
        const dir = Math.cos(t * sp + i * 2) >= 0 ? 1 : -1;
        f.position.set(x, 0.95 + i * 0.13 + Math.sin(t * 2 + i) * 0.04, -0.2 + (i - 1) * 0.12);
        f.rotation.y = dir > 0 ? 0 : Math.PI;
      });
      return false;
    });
    return { use: () => { rush = 2; floatEmoji(g, A, '🫧', 1.4, 3); } };
  },

  trophy_race(g, A) {
    pedestal(g);
    const gold = shiny('#ffc53d', { metalness: 0.75, roughness: 0.25 });
    const cup = geo('cup', () => new THREE.LatheGeometry([[0.02, 0], [0.1, 0.02], [0.05, 0.08], [0.04, 0.2], [0.18, 0.3], [0.22, 0.52], [0.2, 0.54]].map(([x, y]) => new THREE.Vector2(x, y)), 24));
    add(g, cup, gold, { p: [0, 0.58, 0] });
    for (const s of [-1, 1]) add(g, geo('handle', () => new THREE.TorusGeometry(0.09, 0.02, 8, 16, Math.PI)), gold, { p: [s * 0.2, 0.98, 0], r: [0, 0, -s * Math.PI / 2], outline: false });
    const glow = new THREE.Sprite(additive(glowTexture, 0xffd84d, 0.35));
    glow.scale.setScalar(0.9);
    glow.position.y = 0.95;
    g.add(glow);
    return { use: () => floatEmoji(g, A, '🏁', 1.3, 2) };
  },
  trophy_arena(g, A) {
    pedestal(g);
    for (const s of [-1, 1]) {
      const sword = new THREE.Group();
      add(sword, box(0.04, 0.6, 0.02), shiny('#d8dde8'), { p: [0, 0.3, 0] });
      add(sword, box(0.18, 0.03, 0.04), shiny('#c9a227'), { p: [0, 0.02, 0] });
      sword.position.set(0, 0.62, -0.05);
      sword.rotation.z = s * 0.6;
      g.add(sword);
    }
    add(g, cyl(0.2, 0.2, 0.05, 24), toon('#d6334a'), { p: [0, 0.9, 0.02], r: [Math.PI / 2, 0, 0] });
    add(g, cyl(0.08, 0.08, 0.06, 16), shiny('#ffc53d'), { p: [0, 0.9, 0.04], r: [Math.PI / 2, 0, 0], outline: false });
    return { use: () => floatEmoji(g, A, '⚔️', 1.3, 2) };
  },
  slot_mini(g, A) {
    add(g, box(0.62, 1.2, 0.5), toon('#d6334a'), { p: [0, 0.6, -0.05] });
    add(g, box(0.66, 0.2, 0.54), shiny('#ffc53d'), { p: [0, 1.25, -0.05] });
    add(g, plane(0.5, 0.18), new THREE.MeshBasicMaterial({ map: slotTex }), { p: [0, 0.85, 0.205], outline: false, cast: false });
    add(g, cyl(0.02, 0.02, 0.45, 8), shiny('#c0c6d4'), { p: [0.36, 0.95, 0], outline: false });
    add(g, sph(0.06, 10, 8), toon('#e0463c'), { p: [0.36, 1.2, 0] });
    return { use: () => floatEmoji(g, A, '🪙', 1.4, 4) };
  },
  target(g) {
    for (const s of [-1, 1]) add(g, box(0.06, 1.2, 0.06), toon(DARK_WOOD), { p: [s * 0.25, 0.58, -0.1], r: [0.15, 0, 0] });
    add(g, cyl(0.42, 0.42, 0.12, 32), toon('#e8c96a'), { p: [0, 0.9, 0], r: [Math.PI / 2 - 0.15, 0, 0] });
    add(g, geo('targetFace', () => new THREE.CircleGeometry(0.38, 32)), new THREE.MeshToonMaterial({ map: targetTex }), { p: [0, 0.91, 0.07], r: [-0.15, 0, 0], outline: false, cast: false });
  },

  trophy_slime(g, A) {
    pedestal(g);
    add(g, sph(0.26, 20, 16), toon('#55d86a'), { p: [0, 0.8, 0], s: [1.15, 0.9, 1] });
    for (const s of [-1, 1]) {
      add(g, sph(0.05, 10, 8), basic('#ffffff'), { p: [s * 0.09, 0.86, 0.22], outline: false });
      add(g, sph(0.025, 8, 6), basic('#1d1b2e'), { p: [s * 0.09, 0.86, 0.265], outline: false });
    }
    add(g, cyl(0.12, 0.14, 0.1, 6), shiny('#ffc53d', { metalness: 0.7 }), { p: [0, 1.06, 0] });
    return { use: () => floatEmoji(g, A, '🟢', 1.3, 3) };
  },
  trophy_golem(g, A) {
    pedestal(g);
    const stone = toon('#8d8aa6');
    add(g, box(0.4, 0.34, 0.26), stone, { p: [0, 0.8, 0] });
    add(g, box(0.24, 0.2, 0.2), stone, { p: [0, 1.06, 0] });
    for (const s of [-1, 1]) add(g, box(0.1, 0.3, 0.12), stone, { p: [s * 0.27, 0.75, 0] });
    for (const s of [-1, 1]) add(g, box(0.05, 0.03, 0.02), basic('#ffb45a'), { p: [s * 0.05, 1.08, 0.105], outline: false });
    return { use: () => floatEmoji(g, A, '🗿', 1.4, 2) };
  },
  trophy_dragon(g, A) {
    pedestal(g);
    const purple = toon('#8c5ad6');
    add(g, sph(0.2, 18, 14), purple, { p: [0, 0.8, 0], s: [1, 1.1, 0.9] });
    add(g, sph(0.13, 14, 12), purple, { p: [0, 1.08, 0.06] });
    for (const s of [-1, 1]) {
      add(g, cone(0.03, 0.14, 8), toon('#f4ecd8'), { p: [s * 0.07, 1.22, 0.02], r: [0, 0, -s * 0.4], outline: false });
      const wingGeo = geo('dragonWingMini', () => {
        const sh = new THREE.Shape();
        sh.moveTo(0, 0); sh.lineTo(0.35, 0.2); sh.lineTo(0.28, -0.05); sh.lineTo(0.18, 0.02); sh.lineTo(0.1, -0.1); sh.closePath();
        return new THREE.ShapeGeometry(sh);
      });
      add(g, wingGeo, toon('#6a3fb5', { side: THREE.DoubleSide }), { p: [s * 0.12, 0.9, -0.08], s: [s, 1, 1], r: [0, s * -0.4, 0], outline: false });
      add(g, sph(0.025, 8, 6), basic('#ffe066'), { p: [s * 0.05, 1.1, 0.18], outline: false });
    }
    return { use: () => floatEmoji(g, A, '🐉', 1.5, 2) };
  },
  trophy_venom(g, A) {
    pedestal(g);
    const body = toon('#6a2f8a'), glow = basic('#8dff5a');
    add(g, sph(0.2, 16, 12), body, { p: [0, 0.78, -0.05], s: [1, 0.8, 1.2] });
    add(g, sph(0.13, 14, 10), body, { p: [0, 0.8, 0.17] });
    for (const s of [-1, 1]) {
      add(g, sph(0.03, 8, 6), glow, { p: [s * 0.05, 0.84, 0.28], outline: false });
      for (let i = 0; i < 3; i++) add(g, cyl(0.018, 0.012, 0.32, 6), toon('#3a1a4a'), { p: [s * 0.2, 0.72, -0.1 + i * 0.12], r: [0, 0, s * 0.9], outline: false });
    }
    add(g, sph(0.05, 10, 8), glow, { p: [0, 0.97, -0.08], outline: false });
    return { use: () => floatEmoji(g, A, '🫧', 1.3, 3) };
  },
  trophy_lich(g, A) {
    pedestal(g);
    const robe = toon('#3a2a5c'), bone = toon('#f1ead8');
    add(g, cone(0.22, 0.5, 10), robe, { p: [0, 0.83, 0] });
    add(g, sph(0.13, 16, 12), bone, { p: [0, 1.14, 0], s: [1, 1.05, 1] });
    for (const s of [-1, 1]) add(g, sph(0.035, 8, 6), basic('#8dff9a'), { p: [s * 0.05, 1.15, 0.11], outline: false });
    add(g, cyl(0.012, 0.012, 0.6, 6), toon('#6b4a2b'), { p: [0.2, 0.9, 0.05], outline: false });
    add(g, sph(0.05, 10, 8), basic('#8dff9a'), { p: [0.2, 1.22, 0.05], outline: false });
    return { use: () => floatEmoji(g, A, '💀', 1.5, 3) };
  },
};

/** Build a piece of furniture. Returns { group, use, anim }. */
export function buildFurniture(id) {
  const group = new THREE.Group();
  const A = { anim: [] };
  const res = FURNITURE[id]?.(group, A) ?? {};
  return { group, use: res.use ?? null, anim: A.anim, A };
}

// ---------------------------------------------------------------------------
// floors + wallpapers
// ---------------------------------------------------------------------------

const surfaceCache = new Map();

function surface(id, draw) {
  if (!surfaceCache.has(id)) {
    const tex = canvasTexture(256, 256, draw);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    surfaceCache.set(id, tex);
  }
  return surfaceCache.get(id);
}

const FLOOR_DRAW = {
  floor_wood(ctx) {
    ctx.fillStyle = '#c28a52';
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      ctx.fillStyle = row % 2 ? '#b98049' : '#c9935c';
      ctx.fillRect(0, y, 256, 30);
      ctx.fillStyle = 'rgba(70,40,10,.35)';
      ctx.fillRect(0, y + 30, 256, 2);
      ctx.fillRect(((row * 97) % 200) + 20, y, 2, 30);
      ctx.fillStyle = 'rgba(70,40,10,.08)';
      for (let k = 0; k < 5; k++) ctx.fillRect((row * 53 + k * 47) % 256, y + 8 + (k % 3) * 6, 26, 2);
    }
  },
  floor_checker(ctx) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#2b2f4a' : '#f4f0ff';
      ctx.fillRect(c * 64, r * 64, 64, 64);
    }
  },
  floor_carpet(ctx) {
    ctx.fillStyle = '#3b6fd0';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,40,.1)';
      ctx.fillRect((i * 37) % 256, (i * 91) % 256, 2, 2);
    }
  },
  floor_grass(ctx) {
    ctx.fillStyle = '#5fae55';
    ctx.fillRect(0, 0, 256, 256);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 700; i++) {
      const x = (i * 53) % 256, y = (i * 97) % 256;
      ctx.strokeStyle = i % 2 ? 'rgba(35,95,45,.4)' : 'rgba(190,240,150,.4)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1, y - 6); ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = ['#fff6b0', '#ff9fb4', '#ffffff'][i % 3];
      ctx.beginPath(); ctx.arc((i * 71) % 256, (i * 131) % 256, 3, 0, TAU); ctx.fill();
    }
  },
  floor_blush(ctx) { carpet(ctx, '#ffc2dd', 'rgba(255,255,255,.1)', 'rgba(200,60,120,.08)'); },
  floor_lavender(ctx) { carpet(ctx, '#cdb8f2', 'rgba(255,255,255,.1)', 'rgba(90,50,160,.08)'); },
  floor_petal(ctx) {
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      ctx.fillStyle = row % 2 ? '#f5cfd9' : '#f9dbe3';
      ctx.fillRect(0, y, 256, 30);
      ctx.fillStyle = 'rgba(160,70,100,.22)';
      ctx.fillRect(0, y + 30, 256, 2);
      ctx.fillRect(((row * 97) % 200) + 20, y, 2, 30);
    }
  },
  floor_rose(ctx) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#ffb3d0' : '#ffe6f0';
      ctx.fillRect(c * 64, r * 64, 64, 64);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke(); }
  },
  floor_hearts(ctx) {
    ctx.fillStyle = '#fff0f6';
    ctx.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) heartAt(ctx, c * 64 + 32, r * 64 + 34, 14, (r + c) % 2 ? '#ff9fc8' : '#ffc2dd');
  },
  floor_dark(ctx) {
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      ctx.fillStyle = row % 2 ? '#5a3a24' : '#664329';
      ctx.fillRect(0, y, 256, 30);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(0, y + 30, 256, 2);
      ctx.fillRect(((row * 97) % 200) + 20, y, 2, 30);
    }
  },
  floor_herring(ctx) {
    ctx.fillStyle = '#b98049';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = -64; y < 320; y += 32) for (let x = 0; x < 256; x += 64) {
      for (const [dx, a] of [[0, 1], [32, -1]]) {
        ctx.save(); ctx.translate(x + dx, y + (dx ? 16 : 0)); ctx.rotate(a * Math.PI / 4);
        ctx.fillStyle = ((x + y + dx) / 32) % 2 ? '#c9935c' : '#a8723f'; ctx.fillRect(0, 0, 44, 20);
        ctx.strokeStyle = 'rgba(70,40,10,.35)'; ctx.strokeRect(0, 0, 44, 20); ctx.restore();
      }
    }
  },
  floor_terrazzo(ctx) {
    ctx.fillStyle = '#f1ece4';
    ctx.fillRect(0, 0, 256, 256);
    const cols = ['#ff8fa3', '#8fd3ff', '#ffd84d', '#6ee7a0', '#b8b2cf'];
    for (let i = 0; i < 240; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.ellipse((i * 53) % 256, (i * 97) % 256, 2 + (i % 4), 1.5 + (i % 3), i, 0, TAU); ctx.fill(); }
  },
  floor_tatami(ctx) {
    ctx.fillStyle = '#c9c07a';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(80,70,20,.25)';
    for (let y = 0; y < 256; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
    ctx.fillStyle = '#2f5a3a';
    ctx.fillRect(0, 0, 256, 8); ctx.fillRect(0, 124, 256, 8); ctx.fillRect(124, 0, 8, 256);
  },
  floor_neon(ctx) {
    ctx.fillStyle = '#120a2a';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 3;
    for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
    ctx.strokeStyle = '#39e6ff'; ctx.lineWidth = 1.5;
    for (let i = 32; i < 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
  },
  floor_sand(ctx) {
    ctx.fillStyle = '#ecd9a8';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) { ctx.fillStyle = i % 3 ? 'rgba(160,120,60,.14)' : 'rgba(255,255,255,.3)'; ctx.fillRect((i * 37) % 256, (i * 91) % 256, 2, 2); }
    ctx.fillStyle = '#ffb3c7'; ctx.beginPath(); ctx.arc(180, 70, 6, 0, TAU); ctx.fill();
  },
  floor_marble(ctx) {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#f4f1ec' : '#e6e2dc';
      ctx.fillRect(c * 128, r * 128, 128, 128);
    }
    ctx.strokeStyle = 'rgba(120,120,140,.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      let x = (i * 61) % 256, y = (i * 113) % 256;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += 20 - ((i * 7 + k * 13) % 40); y += 18; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.strokeRect(0, 0, 128, 128);
    ctx.strokeRect(128, 128, 128, 128);
  },
};

const WALL_DRAW = {
  wall_cream(ctx) { plainWall(ctx, '#fff1d6'); },
  wall_mint(ctx) { plainWall(ctx, '#c9f5e3'); },
  wall_stripes(ctx) {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#ffc2d6';
      ctx.fillRect(i * 32, 0, 32, 256);
    }
  },
  wall_brick(ctx) {
    ctx.fillStyle = '#d9c7b0';
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 16; row++) {
      for (let x = (row % 2) * -16; x < 256; x += 32) {
        ctx.fillStyle = ['#b5654a', '#a85a40', '#c06e52'][(row + x) % 3 === 0 ? 0 : (row * 7 + x) % 3];
        ctx.fillRect(x + 1, row * 16 + 1, 30, 14);
      }
    }
  },
  wall_blush(ctx) { plainWall(ctx, '#ffd6e6'); },
  wall_lavender(ctx) { plainWall(ctx, '#e3d6fb'); },
  wall_sky(ctx) { plainWall(ctx, '#cfeaff'); },
  wall_rose(ctx) {
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? '#ffe6f0' : '#ffc9dd';
      ctx.fillRect(i * 16, 0, 16, 256);
    }
  },
  wall_polka(ctx) {
    ctx.fillStyle = '#ffd6e6';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffffff';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { ctx.beginPath(); ctx.arc(c * 32 + (r % 2) * 16 + 8, r * 32 + 16, 6, 0, TAU); ctx.fill(); }
  },
  wall_hearts(ctx) {
    ctx.fillStyle = '#ffe3ee';
    ctx.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) heartAt(ctx, c * 51 + (r % 2) * 25 + 12, r * 51 + 26, 9, (r + c) % 3 ? '#ff9fc8' : '#ff7ab6');
  },
  wall_sakura(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#ffe6f0');
    g.addColorStop(1, '#fff6fa');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#8b5a4a';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, 60); ctx.bezierCurveTo(80, 40, 140, 90, 256, 50); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(120, 68); ctx.bezierCurveTo(150, 110, 170, 130, 190, 170); ctx.stroke();
    for (let i = 0; i < 26; i++) {
      const x = (i * 71) % 256, y = 30 + ((i * 53) % 190);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        ctx.fillStyle = i % 3 ? '#ffb3d0' : '#ff8fc0';
        ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4.5, 3, a, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#ffe28a';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
    }
  },
  wall_navy(ctx) { plainWall(ctx, '#2a3566'); },
  wall_sage(ctx) { plainWall(ctx, '#b9d3b0'); },
  wall_panels(ctx) {
    ctx.fillStyle = '#a8723f';
    ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) { ctx.fillStyle = (x / 32) % 2 ? '#b07a45' : '#9c6a3c'; ctx.fillRect(x, 0, 30, 256); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + 30, 0, 2, 256); }
  },
  wall_diamond(ctx) {
    ctx.fillStyle = '#fff1d6';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#e57bff';
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
      ctx.beginPath(); ctx.moveTo(x + 32, y); ctx.lineTo(x + 64, y + 32); ctx.lineTo(x + 32, y + 64); ctx.lineTo(x, y + 32); ctx.fill();
    }
  },
  wall_waves(ctx) {
    ctx.fillStyle = '#cfeaff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#39a0ff'; ctx.lineWidth = 6;
    for (let y = 20; y < 256; y += 42) { ctx.beginPath(); for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, y + Math.sin((x / 256) * TAU * 2) * 8); ctx.stroke(); }
  },
  wall_gamer(ctx) {
    ctx.fillStyle = '#141024';
    ctx.fillRect(0, 0, 256, 256);
    const cols = ['#ff4fd8', '#39e6ff', '#6ee7a0'];
    cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, 60 + i * 60, 256, 6); });
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 67) % 256, (i * 29) % 256, 8, 8);
  },
  wall_jungle(ctx) {
    ctx.fillStyle = '#e6f5de';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 14; i++) {
      const x = (i * 71) % 256, y = (i * 113) % 256, a = i * 0.9;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = i % 2 ? '#3f9a4a' : '#56c262';
      ctx.beginPath(); ctx.ellipse(0, 0, 30, 12, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2f7f3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(28, 0); ctx.stroke();
      ctx.restore();
    }
  },
  wall_stars(ctx) {
    ctx.fillStyle = '#1a2456';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = i % 5 ? '#ffffff' : '#ffd84d';
      const x = (i * 83) % 256, y = (i * 47) % 256, r = i % 5 ? 1.2 : 2.4;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath(); ctx.arc(190, 60, 18, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a2456';
    ctx.beginPath(); ctx.arc(198, 54, 16, 0, TAU); ctx.fill();
  },
};

function plainWall(ctx, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(0,0,0,.035)';
  for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 2, 256);
}

const CEIL_DRAW = {
  ceil_plain(ctx) { plainWall(ctx, '#fbf8f2'); },
  ceil_beams(ctx) {
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 64) { ctx.fillStyle = '#8b5a2b'; ctx.fillRect(x, 0, 18, 256); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 14, 0, 4, 256); }
  },
  ceil_sky(ctx) {
    ctx.fillStyle = '#8fd0ff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffffff';
    for (const [x, y, r] of [[60, 70, 26], [90, 64, 20], [190, 170, 30], [215, 160, 22], [150, 40, 16]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  },
  ceil_stars(ctx) { WALL_DRAW.wall_stars(ctx); },
  ceil_pink(ctx) {
    const g = ctx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, '#ffd6ea'); g.addColorStop(1, '#d6ecff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  },
  ceil_coffered(ctx) {
    ctx.fillStyle = '#e8e2d4';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) { ctx.fillStyle = '#d4ccb8'; ctx.fillRect(x + 8, y + 8, 48, 48); ctx.fillStyle = '#c8bfa8'; ctx.fillRect(x + 14, y + 14, 36, 36); }
  },
  ceil_glow(ctx) {
    ctx.fillStyle = '#23285a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = ['#c8ff8a', '#fff6b0', '#8fe3ff'][i % 3];
      const x = (i * 83) % 256, y = (i * 47) % 256;
      ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 2.5 : 6; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.fill();
    }
  },
};
export const ceilingTexture = (id) => surface(id, CEIL_DRAW[id] ?? CEIL_DRAW.ceil_plain);
export const floorTexture = (id) => surface(id, FLOOR_DRAW[id] ?? FLOOR_DRAW.floor_wood);
export const wallTexture = (id) => surface(id, WALL_DRAW[id] ?? WALL_DRAW.wall_cream);

function carpet(ctx, base, light, dark) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = i % 2 ? light : dark;
    ctx.fillRect((i * 37) % 256, (i * 91) % 256, 2, 2);
  }
}

function heartAt(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s);
  ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s, y - s * 1.3, x, y - s * 0.55);
  ctx.bezierCurveTo(x + s, y - s * 1.3, x + s * 1.5, y - s * 0.1, x, y + s);
  ctx.fill();
}

/** A data-URL image of a floor or wallpaper, for the style picker and shop. */
export function surfaceImage(id) {
  const tex = FLOOR_DRAW[id] ? floorTexture(id) : CEIL_DRAW[id] ? ceilingTexture(id) : wallTexture(id);
  const img = tex.image;
  return img?.toDataURL ? img.toDataURL() : '';
}

// ---- furniture snapshots: a little 3D picture of each piece, for the shop and inventory ----
const thumbs = new Map();
let thumbRig = null;
export function furnitureThumb(id) {
  if (thumbs.has(id)) return thumbs.get(id);
  if (!thumbRig) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(160, 160, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa8, 2.2));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    thumbRig = { renderer, scene, camera: new THREE.PerspectiveCamera(30, 1, 0.05, 50) };
  }
  const { renderer, scene, camera } = thumbRig;
  const item = buildFurniture(id);
  const g = item.group;
  g.traverse((o) => { if (o.isPointLight) o.visible = false; });
  const holder = new THREE.Group();
  holder.add(g);
  const flat = ['rug', 'rug_round', 'rug_heart', 'rug_fluffy'].includes(id);
  holder.rotation.y = flat ? 0 : -0.55;
  scene.add(holder);
  holder.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g, true);
  const c = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.62 + 0.05;
  const dist = r / Math.sin((camera.fov * Math.PI) / 360);
  const dir = flat ? new THREE.Vector3(0, 1, 0.55).normalize() : new THREE.Vector3(0, 0.35, 1).normalize();
  camera.position.copy(c).addScaledVector(dir, dist);
  camera.lookAt(c);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL();
  scene.remove(holder);
  thumbs.set(id, url);
  return url;
}
/** Colour swatch for the style picker (CSS background). */
export const SWATCH = {
  floor_wood: '#c28a52', floor_checker: 'repeating-conic-gradient(#2b2f4a 0 25%, #f4f0ff 0 50%) 0 0/16px 16px',
  floor_carpet: '#3b6fd0', floor_grass: '#5fae55', floor_marble: '#ece8e2',
  wall_cream: '#fff1d6', wall_mint: '#c9f5e3', wall_stripes: 'repeating-linear-gradient(90deg,#ffc2d6 0 8px,#fff 8px 16px)',
  wall_brick: '#b5654a', wall_stars: 'radial-gradient(#ffd84d 1px, #1a2456 1.5px) 0 0/10px 10px',
};
