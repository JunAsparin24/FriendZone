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
    add(g, box(1.9, 2.1, 0.44), toon(WOOD), { p: [0, 1.05, -0.26] });
    add(g, box(1.78, 1.96, 0.1), wood, { p: [0, 1.05, -0.43], outline: false });
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

export const floorTexture = (id) => surface(id, FLOOR_DRAW[id] ?? FLOOR_DRAW.floor_wood);
export const wallTexture = (id) => surface(id, WALL_DRAW[id] ?? WALL_DRAW.wall_cream);

/** Colour swatch for the style picker (CSS background). */
export const SWATCH = {
  floor_wood: '#c28a52', floor_checker: 'repeating-conic-gradient(#2b2f4a 0 25%, #f4f0ff 0 50%) 0 0/16px 16px',
  floor_carpet: '#3b6fd0', floor_grass: '#5fae55', floor_marble: '#ece8e2',
  wall_cream: '#fff1d6', wall_mint: '#c9f5e3', wall_stripes: 'repeating-linear-gradient(90deg,#ffc2d6 0 8px,#fff 8px 16px)',
  wall_brick: '#b5654a', wall_stars: 'radial-gradient(#ffd84d 1px, #1a2456 1.5px) 0 0/10px 10px',
};
