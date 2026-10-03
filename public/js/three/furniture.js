// 3D furniture, floors and wallpapers for houses, built from primitives like everything else.
// Each builder makes a model centred on its footprint (w x d tiles, 1 unit per tile) with its
// front facing +Z (wall items: centred on the wall surface, facing out). Builders may push
// per-frame animations into `A.anim` (return true to finish) and return { use } for clicks.
import * as THREE from 'three';
import { TAU, toon, basic, shiny, outlineMaterial, canvasTexture, additive, glowTexture, flameTexture } from './materials.js';
import { CATALOG } from '../catalog.js';

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

/** A square bistro table with a checked cloth, a candle and salt & pepper (with `food`, room for a dish). */
let clothTexC = null;
function restTable(g, food = false) {
  clothTexC ??= canvasTexture(64, 64, (c) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#ffffff' : '#c8323a'; c.fillRect(x * 8, y * 8, 8, 8); } });
  add(g, box(0.86, 0.04, 0.86), toon('#3a2216'), { p: [0, 0.76, 0] });
  add(g, box(0.92, 0.012, 0.92), new THREE.MeshToonMaterial({ map: clothTexC }), { p: [0, 0.786, 0], outline: false });
  add(g, cyl(0.04, 0.05, 0.72, 10), toon('#1d1b2e'), { p: [0, 0.38, 0] });
  add(g, box(0.5, 0.04, 0.5), toon('#1d1b2e'), { p: [0, 0.02, 0] });
  const cx = food ? 0.3 : 0, cz = food ? 0.28 : 0;
  add(g, cyl(0.03, 0.035, 0.08, 12), new THREE.MeshToonMaterial({ color: '#ffd27a', transparent: true, opacity: 0.6 }), { p: [cx, 0.83, cz], outline: false });
  add(g, cyl(0.004, 0.004, 0.03, 6), toon('#1d1b2e'), { p: [cx, 0.88, cz], outline: false });
  for (const [x, c] of [[-0.06, '#ffffff'], [0.06, '#3a3550']]) add(g, cyl(0.016, 0.02, 0.06, 10), toon(c), { p: [(food ? -0.3 : 0.2) + x, 0.82, food ? 0.3 : 0.2], outline: false });
}
let menuTexC = null;
const menuTex = () => (menuTexC ??= canvasTexture(256, 192, (c) => {
  c.fillStyle = '#1f2a22'; c.fillRect(0, 0, 256, 192);
  c.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 40; i++) c.fillRect((i * 53) % 256, (i * 37) % 192, 30, 2);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.font = 'bold 30px "Luckiest Guy", Rubik, sans-serif'; c.fillText('MENU', 128, 36);
  c.font = '17px Rubik, sans-serif'; c.textAlign = 'left';
  [['Pizza', '12'], ['Pasta', '10'], ['Burger', '9'], ['Sushi', '14'], ['Cake', '6']].forEach(([n, p], i) => {
    c.fillStyle = ['#ffd27a', '#ffffff'][i % 2]; c.fillText(n, 28, 70 + i * 24); c.textAlign = 'right'; c.fillText(`${p}🪙`, 228, 70 + i * 24); c.textAlign = 'left';
    c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(90, 66 + i * 24, 100, 1);
  });
}));
let neonTexC = null;
const neonOpenTex = () => (neonTexC ??= canvasTexture(256, 108, (c) => {
  c.clearRect(0, 0, 256, 108);
  c.font = 'bold 64px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = '#ff3b5c'; c.shadowBlur = 18; c.lineWidth = 5; c.strokeStyle = '#ff3b5c'; c.strokeText('OPEN', 128, 58);
  c.shadowBlur = 6; c.fillStyle = '#ffe1e6'; c.fillText('OPEN', 128, 58);
}));
/** A tub you can get into: bubbles that drift, livelier for a while when someone climbs in. */
function tubSoak(g, A, len, y, emoji = '🫧') {
  const bubbles = [];
  for (let i = 0; i < 10; i++) bubbles.push(add(g, sph(0.06 + (i % 3) * 0.025, 10, 8), toon('#ffffff'), { p: [(-0.5 + (i % 5) / 4) * len * 0.8, y + 0.03, (Math.floor(i / 5) - 0.5) * 0.25], outline: false }));
  let boost = 0;
  A.anim.push((t, dt) => { boost = Math.max(0, boost - dt); bubbles.forEach((b, i) => { b.position.y = y + 0.03 + Math.sin(t * (2 + boost) + i) * (0.015 + boost * 0.003); }); return false; });
  return { use: () => { boost = 10; floatEmoji(g, A, emoji, 0.9, 4); } };
}
/** Water raining down from a shower head at (x, z) from height y while it's on. */
function showerWater(g, A, x, z, y) {
  const drops = [];
  for (let i = 0; i < 14; i++) { const d = add(g, box(0.012, 0.12, 0.012), basic('#bfe8ff'), { outline: false, cast: false }); d.visible = false; drops.push(d); }
  let on = 0;
  A.anim.push((t, dt) => {
    on = Math.max(0, on - dt);
    drops.forEach((d, i) => { d.visible = on > 0; const p = (t * 2.2 + i / 14) % 1; d.position.set(x + Math.sin(i * 2.4) * 0.12, y - 0.1 - p * (y - 0.2), z + Math.cos(i * 1.7) * 0.12); });
    return false;
  });
  return { use: () => { on = 12; floatEmoji(g, A, '🚿', 2.2, 1); } };
}
/** A wall toilet-roll holder with a roll on it. */
function tpHolder(g, metal, wood = false, paper = '#ffffff') {
  add(g, wood ? box(0.3, 0.08, 0.04) : cyl(0.04, 0.04, 0.02, 14), metal, { p: [0, 0.04, 0.02], r: wood ? null : [Math.PI / 2, 0, 0] });
  add(g, box(0.02, 0.02, 0.12), metal, { p: [-0.12, 0, 0.07], outline: false });
  add(g, cyl(0.012, 0.012, 0.26, 8), metal, { p: [0, 0, 0.13], r: [0, 0, Math.PI / 2], outline: false });
  add(g, cyl(0.075, 0.075, 0.2, 18), toon(paper), { p: [0, 0, 0.13], r: [0, 0, Math.PI / 2] });
  add(g, cyl(0.025, 0.025, 0.202, 10), toon('#c9a77a'), { p: [0, 0, 0.13], r: [0, 0, Math.PI / 2], outline: false });
  add(g, box(0.2, 0.18, 0.004), toon(paper), { p: [0, -0.09, 0.205], outline: false }); // (the sheet hanging down)
}
/** RGB parts that cycle through the rainbow together (offset a little each). */
function rgbCycle(A, mats, speed = 0.2) {
  A.anim.push((t) => { mats.forEach((m, i) => m.color.setHSL(((t * speed + i * 0.08) % 1), 0.9, 0.6)); return false; });
}
let curtainTexC = null;
const curtainTex = () => (curtainTexC ??= canvasTexture(64, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#7fc8ff'; c.fillRect(i * 8, 0, 8, 64); } }));
const neonTxtC = {};
const neonTextTex = (txt, col) => (neonTxtC[txt] ??= canvasTexture(256, 128, (c) => {
  c.clearRect(0, 0, 256, 128);
  c.font = 'bold 84px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = col; c.shadowBlur = 20; c.lineWidth = 6; c.strokeStyle = col; c.strokeText(txt, 128, 68);
  c.shadowBlur = 6; c.fillStyle = '#ffffff'; c.fillText(txt, 128, 68);
}));
let neonPadC = null;
const neonControllerTex = () => (neonPadC ??= canvasTexture(256, 160, (c) => {
  c.clearRect(0, 0, 256, 160);
  c.shadowColor = '#39e6ff'; c.shadowBlur = 18; c.lineWidth = 7; c.strokeStyle = '#39e6ff';
  c.beginPath(); c.moveTo(70, 40); c.lineTo(186, 40); c.quadraticCurveTo(236, 40, 230, 100); c.quadraticCurveTo(226, 140, 196, 130); c.lineTo(170, 105); c.lineTo(86, 105); c.lineTo(60, 130); c.quadraticCurveTo(30, 140, 26, 100); c.quadraticCurveTo(20, 40, 70, 40); c.stroke();
  c.strokeStyle = '#ff4fd8'; c.shadowColor = '#ff4fd8';
  c.beginPath(); c.moveTo(66, 72); c.lineTo(98, 72); c.moveTo(82, 56); c.lineTo(82, 88); c.stroke();
  for (const [x, y] of [[172, 62], [190, 76], [154, 76], [172, 90]]) { c.beginPath(); c.arc(x, y, 6, 0, TAU); c.stroke(); }
}));
/** A plate (with a knife and fork either side) for food to sit on. */
function plateBase(g, r = 0.13) {
  add(g, cyl(r, r * 0.8, 0.015, 20), toon('#ffffff'), { p: [0, 0.008, 0] });
  add(g, cyl(r * 0.7, r * 0.7, 0.002, 20), toon('#f2f2f4'), { p: [0, 0.016, 0], outline: false });
  if (r >= 0.12) for (const s of [-1, 1]) add(g, box(0.012, 0.004, 0.16), shiny('#c0c6d4', { metalness: 0.6 }), { p: [s * (r + 0.04), 0.003, 0], outline: false });
}
function wineGlass(g, x, z, wine = '#6e1422') {
  const glass = new THREE.MeshToonMaterial({ color: '#dff4ff', transparent: true, opacity: 0.45 });
  add(g, cyl(0.025, 0.025, 0.004, 10), glass, { p: [x, 0.002, z], outline: false });
  add(g, cyl(0.004, 0.004, 0.07, 6), glass, { p: [x, 0.04, z], outline: false });
  add(g, cyl(0.03, 0.012, 0.06, 12, true), glass, { p: [x, 0.1, z], outline: false });
  add(g, cyl(0.022, 0.012, 0.025, 12), toon(wine), { p: [x, 0.085, z], outline: false });
}
/** A lamp shade at (x, y) (bottom radius rb, top rt, height h) with a light you can switch off. */
function lampShade(g, A, x, y, rt, rb, h, col, tilt = false) {
  const shade = toon(col, { side: THREE.DoubleSide }).clone();
  shade.emissive = new THREE.Color('#ffd27a'); shade.emissiveIntensity = 0.45;
  add(g, cyl(rt, rb, h, 20, true), shade, { p: [0, y, x], r: tilt ? [0, 0, 0] : null });
  const light = new THREE.PointLight(0xffd79a, 1.6, 4.5, 1.6);
  light.position.set(0, y - h * 0.3, x); g.add(light);
  let on = true;
  return { use: () => { on = !on; light.visible = on; shade.emissiveIntensity = on ? 0.45 : 0; } };
}
/** A hanging light's glowing part (`glow`: the whole shape glows, like a globe; otherwise it's a shade). */
function pendantShade(g, A, y, geometry, col, lightY, glow = false, x = 0) {
  const mat = toon(col, { side: THREE.DoubleSide }).clone();
  mat.emissive = new THREE.Color(glow ? '#ffe2a0' : '#ffcf6b'); mat.emissiveIntensity = glow ? 0.8 : 0.3;
  add(g, geometry, mat, { p: [x, y, 0], outline: !glow });
  const bulb = glow ? null : add(g, sph(0.04, 10, 8), basic('#fff6c9'), { p: [x, y - 0.02, 0], outline: false });
  const light = new THREE.PointLight(0xffd79a, 1.8, 5, 1.6);
  light.position.set(x, lightY, 0); g.add(light);
  let on = true;
  return { use: () => { on = !on; light.visible = on; if (bulb) bulb.visible = on; mat.emissiveIntensity = on ? (glow ? 0.8 : 0.3) : 0; } };
}
/** A round table with a long cloth to the floor. */
function roundCloth(g, r, col) {
  add(g, cyl(r, r, 0.03, 32), toon('#3a2216'), { p: [0, 0.76, 0] });
  add(g, cyl(r + 0.03, r + 0.12, 0.76, 32, true), toon(col, { side: THREE.DoubleSide }), { p: [0, 0.39, 0] });
  add(g, cyl(r + 0.03, r + 0.03, 0.01, 32), toon(col), { p: [0, 0.78, 0], outline: false });
}
/** A three-shelf utility cart on casters (with `cloth`: a white cloth over the top shelf, for service). */
function serviceCart(g, cloth) {
  const plastic = toon(cloth ? '#3a2216' : '#d8d6d0'), metal = shiny('#c0c6d4', { metalness: 0.6 });
  for (const y of [0.18, 0.5, 0.86]) { add(g, box(0.86, 0.04, 0.5), plastic, { p: [0, y, 0] }); add(g, box(0.86, 0.05, 0.02), plastic, { p: [0, y + 0.03, 0.24], outline: false }); add(g, box(0.86, 0.05, 0.02), plastic, { p: [0, y + 0.03, -0.24], outline: false }); }
  for (const [x, z] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) { add(g, cyl(0.018, 0.018, 0.78, 8), metal, { p: [x, 0.5, z], outline: false }); add(g, cyl(0.04, 0.04, 0.03, 10), toon('#2a2d36'), { p: [x, 0.04, z], r: [0, 0, Math.PI / 2], outline: false }); }
  for (const sx of [-1, 1]) { add(g, box(0.04, 0.16, 0.04), plastic, { p: [sx * 0.43, 0.96, -0.18], outline: false }); add(g, box(0.04, 0.16, 0.04), plastic, { p: [sx * 0.43, 0.96, 0.18], outline: false }); add(g, box(0.04, 0.04, 0.4), plastic, { p: [sx * 0.43, 1.04, 0] }); }
  if (cloth) { add(g, box(0.9, 0.01, 0.54), toon('#ffffff'), { p: [0, 0.885, 0], outline: false }); for (const sz of [-1, 1]) add(g, box(0.9, 0.24, 0.01), toon('#ffffff'), { p: [0, 0.77, sz * 0.27], outline: false }); }
}
/** A pair of floor-length curtains on a rod, gathered either side (they hang over a window). */
function curtainPair(g, col, opacity, rodCol, tie = false) {
  const mat = new THREE.MeshToonMaterial({ color: col, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  add(g, cyl(0.02, 0.02, 2.2, 8), toon(rodCol), { p: [0, 1.05, 0.12], r: [0, 0, Math.PI / 2], outline: false });
  for (const s of [-1, 1]) {
    add(g, sph(0.035, 8, 6), toon(rodCol), { p: [s * 1.1, 1.05, 0.12], outline: false });
    // a gathered panel: a wavy plane hanging from the rod
    const pg = new THREE.PlaneGeometry(0.5, 2.15, 10, 1);
    const pa = pg.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 40) * 0.025);
    pg.computeVertexNormals();
    add(g, pg, mat, { p: [s * 0.82, -0.04, 0.1], outline: false, cast: false });
    if (tie) add(g, new THREE.TorusGeometry(0.2, 0.015, 4, 12, Math.PI), toon(rodCol), { p: [s * 0.82, -0.2, 0.12], r: [0, 0, Math.PI], outline: false });
  }
}
let marbleC = null;
const marbleTop = () => (marbleC ??= canvasTexture(128, 128, (c) => { c.fillStyle = '#f2f0ec'; c.fillRect(0, 0, 128, 128); c.strokeStyle = 'rgba(120,120,130,.35)'; c.lineWidth = 1; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(Math.random() * 128, 0); for (let y = 0; y <= 128; y += 16) c.lineTo(20 + Math.random() * 90, y); c.stroke(); } }));
const chalkC = new Map();
/** A chalkboard with your own words on it (lines split by new lines or |, the first one big). */
function chalkTex(text) {
  if (chalkC.has(text)) return chalkC.get(text);
  const tex = canvasTexture(256, 192, (c) => {
    c.fillStyle = '#1f2a22'; c.fillRect(0, 0, 256, 192);
    c.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 40; i++) c.fillRect((i * 53) % 256, (i * 37) % 192, 30, 2);
    const lines = text.split(/\n|\|/).map((l) => l.trim()).filter(Boolean).slice(0, 7);
    c.textAlign = 'center'; c.fillStyle = '#ffffff';
    lines.forEach((l, i) => {
      let size = i === 0 ? 30 : 18;
      c.font = `${i === 0 ? 'bold ' : ''}${size}px "Luckiest Guy", Rubik, sans-serif`;
      while (c.measureText(l).width > 236 && size > 9) { size -= 1; c.font = `${i === 0 ? 'bold ' : ''}${size}px "Luckiest Guy", Rubik, sans-serif`; }
      c.fillStyle = i === 0 ? '#ffffff' : ['#ffd27a', '#ffffff', '#ffb3c8'][i % 3];
      c.fillText(l, 128, i === 0 ? 38 : 38 + 14 + i * 22);
    });
  });
  chalkC.set(text, tex);
  return tex;
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
    add(g, plane(1.5, 0.95), outdoorGlass(), { p: [0, 0, 0.01], outline: false, cast: false }); // (looks outside)
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
  // ---- the restaurant set ----
  rest_chair(g) {
    // a bentwood bistro chair: dark wood, a round red cushion and a hooped back
    const wood = toon('#3a2216');
    add(g, cyl(0.24, 0.24, 0.05, 24), wood, { p: [0, 0.46, 0] });
    add(g, cyl(0.21, 0.21, 0.05, 24), toon('#9e2a2a'), { p: [0, 0.5, 0], outline: false });
    for (const [x, z] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) add(g, cyl(0.022, 0.018, 0.46, 8), wood, { p: [x, 0.23, z], r: [z * 0.25, 0, -x * 0.25], outline: false });
    add(g, new THREE.TorusGeometry(0.2, 0.022, 8, 24, Math.PI), wood, { p: [0, 0.72, -0.2] });
    for (const x of [-0.2, 0.2]) add(g, cyl(0.022, 0.022, 0.26, 8), wood, { p: [x, 0.6, -0.2], outline: false });
    add(g, box(0.36, 0.03, 0.03), wood, { p: [0, 0.66, -0.2], outline: false });
  },
  rest_booth(g) {
    // a diner booth: a long padded bench with a tall tufted back, on a wood plinth
    const red = toon('#a3262e'), dark = toon('#2e1a12');
    add(g, box(1.9, 0.38, 0.6), dark, { p: [0, 0.19, 0] });
    add(g, box(1.86, 0.14, 0.6), red, { p: [0, 0.45, 0.02] });
    add(g, box(1.9, 0.9, 0.18), dark, { p: [0, 0.75, -0.3] });
    for (let i = 0; i < 4; i++) add(g, box(0.43, 0.62, 0.1), red, { p: [-0.69 + i * 0.46, 0.86, -0.18] });
    for (let i = 0; i < 4; i++) for (const y of [0.72, 1.0]) add(g, sph(0.02, 6, 4), toon('#5e1016'), { p: [-0.69 + i * 0.46, y, -0.125], outline: false });
    add(g, box(1.94, 0.06, 0.26), dark, { p: [0, 1.22, -0.3] });
  },
  rest_table(g) { restTable(g); },
  rest_pizza_table(g) {
    restTable(g, true);
    add(g, cyl(0.24, 0.24, 0.02, 24), toon('#c98a52'), { p: [0, 0.81, 0] });
    add(g, cyl(0.2, 0.2, 0.025, 24), toon('#e8a24a'), { p: [0, 0.83, 0], outline: false });
    add(g, cyl(0.18, 0.18, 0.012, 24), toon('#d8402a'), { p: [0, 0.846, 0], outline: false });
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.05 + (i % 3) * 0.045; add(g, cyl(0.024, 0.024, 0.01, 10), toon(i % 3 ? '#b02a2a' : '#fff3c4'), { p: [Math.cos(a) * r, 0.856, Math.sin(a) * r], outline: false }); }
    for (let i = 0; i < 4; i++) add(g, box(0.36, 0.004, 0.004), toon('#7a3a16'), { p: [0, 0.855, 0], r: [0, (i / 4) * Math.PI, 0], outline: false });
  },
  rest_burger_table(g) {
    restTable(g, true);
    add(g, cyl(0.17, 0.15, 0.02, 24), toon('#ffffff'), { p: [0, 0.81, 0] });
    const y0 = 0.83;
    [['#d9913a', 0.03, 0.09], ['#3a7a2a', 0.012, 0.095], ['#5a2e1a', 0.035, 0.085], ['#ffd23a', 0.01, 0.09], ['#d82a2a', 0.012, 0.08]].reduce((y, [c, h, r]) => { add(g, cyl(r, r, h, 20), toon(c), { p: [-0.04, y + h / 2, 0], outline: false }); return y + h; }, y0);
    add(g, sph(0.09, 16, 10, ), toon('#e6a24a'), { p: [-0.04, 0.93, 0], s: [1, 0.55, 1] });
    for (let i = 0; i < 6; i++) add(g, box(0.014, 0.014, 0.09), toon('#ffcf4a'), { p: [0.09 + (i % 3) * 0.02, 0.84, -0.04 + Math.floor(i / 3) * 0.05], r: [0, i * 0.5, 0.2], outline: false });
    add(g, cyl(0.035, 0.03, 0.12, 12), toon('#e0463c'), { p: [0.24, 0.85, -0.18] });
  },
  rest_sushi_table(g) {
    restTable(g, true);
    add(g, box(0.42, 0.04, 0.18), toon('#c98a52'), { p: [0, 0.82, 0] });
    for (let i = 0; i < 6; i++) {
      add(g, cyl(0.03, 0.03, 0.04, 14), toon('#1d2a1a'), { p: [-0.15 + i * 0.06, 0.86, -0.03], outline: false });
      add(g, cyl(0.022, 0.022, 0.042, 14), toon('#ffffff'), { p: [-0.15 + i * 0.06, 0.861, -0.03], outline: false });
      add(g, cyl(0.012, 0.012, 0.044, 10), toon(i % 2 ? '#ff7a4a' : '#d83a4a'), { p: [-0.15 + i * 0.06, 0.862, -0.03], outline: false });
      if (i < 4) add(g, box(0.05, 0.025, 0.03), toon('#ffffff'), { p: [-0.11 + i * 0.07, 0.855, 0.05], outline: false }), add(g, box(0.055, 0.012, 0.035), toon('#ff8a5a'), { p: [-0.11 + i * 0.07, 0.874, 0.05], outline: false });
    }
    for (const x of [0.25, 0.27]) add(g, box(0.008, 0.008, 0.26), toon('#2a1a12'), { p: [x, 0.815, 0], outline: false });
  },
  rest_pasta_table(g) {
    restTable(g, true);
    add(g, cyl(0.15, 0.1, 0.06, 24), toon('#ffffff'), { p: [0, 0.83, 0] });
    add(g, sph(0.11, 16, 10), toon('#f2cf6a'), { p: [0, 0.85, 0], s: [1, 0.35, 1], outline: false });
    add(g, sph(0.06, 12, 8), toon('#c8341f'), { p: [0, 0.88, 0], s: [1, 0.45, 1], outline: false });
    for (let i = 0; i < 3; i++) add(g, sph(0.022, 8, 6), toon('#6a2e1a'), { p: [Math.cos(i * 2.1) * 0.05, 0.9, Math.sin(i * 2.1) * 0.05], outline: false });
    add(g, cyl(0.004, 0.004, 0.12, 6), toon('#e8eef4'), { p: [0.27, 0.86, -0.15], outline: false });
    add(g, cyl(0.04, 0.012, 0.07, 14, true), new THREE.MeshToonMaterial({ color: '#dff4ff', transparent: true, opacity: 0.5 }), { p: [0.27, 0.95, -0.15], outline: false });
    add(g, cyl(0.032, 0.012, 0.04, 14), toon('#6e1422'), { p: [0.27, 0.94, -0.15], outline: false });
  },
  rest_pizza_oven(g, A) {
    // a wood-fired brick oven: a dome on a stone base, a glowing mouth and a chimney
    add(g, box(0.94, 0.7, 0.9), toon('#8a8478'), { p: [0, 0.35, -0.03] });
    add(g, box(0.98, 0.06, 0.94), toon('#5e5850'), { p: [0, 0.72, -0.03] });
    add(g, new THREE.SphereGeometry(0.44, 24, 12, 0, TAU, 0, Math.PI / 2), toon('#b5563a'), { p: [0, 0.74, -0.05] });
    add(g, new THREE.TorusGeometry(0.17, 0.05, 8, 18, Math.PI), toon('#8a3a26'), { p: [0, 0.75, 0.37] });
    add(g, new THREE.CircleGeometry(0.16, 18, 0, Math.PI), basic('#1a0703'), { p: [0, 0.75, 0.375], outline: false });
    add(g, cyl(0.07, 0.08, 0.5, 10), toon('#6e6a62'), { p: [0.1, 1.35, -0.2] });
    const glow = add(g, new THREE.CircleGeometry(0.12, 16, 0, Math.PI), basic('#ff8a2a', { transparent: true, opacity: 0.9 }), { p: [0, 0.75, 0.38], outline: false });
    const light = new THREE.PointLight(0xff8a3a, 1.4, 3.5, 1.8);
    light.position.set(0, 0.85, 0.6);
    g.add(light);
    A.anim.push((t) => { glow.material.opacity = 0.7 + Math.sin(t * 11) * 0.15 + Math.sin(t * 5.3) * 0.1; light.intensity = 1.2 + Math.sin(t * 9) * 0.3; return false; });
  },
  rest_stove(g, A) {
    // a chef's range: steel cabinet, six burners with a pan and a steaming pot
    const steel = shiny('#c8ccd4', { metalness: 0.6, roughness: 0.3 });
    add(g, box(0.92, 0.86, 0.78), steel, { p: [0, 0.43, -0.05] });
    add(g, box(0.86, 0.36, 0.02), toon('#2a2d36'), { p: [0, 0.35, 0.35], outline: false });
    add(g, box(0.8, 0.03, 0.03), steel, { p: [0, 0.6, 0.37], outline: false });
    for (let i = 0; i < 5; i++) add(g, cyl(0.025, 0.025, 0.03, 10), toon('#1d1b2e'), { p: [-0.32 + i * 0.16, 0.76, 0.35], r: [Math.PI / 2, 0, 0], outline: false });
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.1], [0.25, 0.1]]) add(g, cyl(0.1, 0.1, 0.02, 16), toon('#2a2d36'), { p: [x, 0.87, z], outline: false });
    add(g, cyl(0.13, 0.12, 0.05, 20), toon('#2a2d36'), { p: [-0.25, 0.9, 0.1] });
    add(g, box(0.25, 0.02, 0.03), toon('#2a2d36'), { p: [-0.25, 0.92, 0.32], outline: false });
    add(g, cyl(0.12, 0.12, 0.2, 20), steel, { p: [0.25, 0.98, -0.25] });
    add(g, box(0.9, 0.5, 0.06), steel, { p: [0, 1.12, -0.43] });
    const steam = [0, 1, 2].map(() => { const s = new THREE.Sprite(additive(glowTexture, 0xffffff, 0.25)); g.add(s); return s; });
    A.anim.push((t) => { steam.forEach((s, i) => { const p = (t * 0.5 + i / 3) % 1; s.position.set(0.25 + Math.sin(t * 2 + i) * 0.04, 1.1 + p * 0.5, -0.25); s.scale.setScalar(0.15 + p * 0.2); s.material.opacity = 0.3 * (1 - p); }); return false; });
  },
  rest_dessert_case(g) {
    // a glass dessert display: three shelves of cakes, tarts and donuts
    add(g, box(0.92, 0.5, 0.7), toon('#3a2216'), { p: [0, 0.25, 0] });
    add(g, box(0.9, 0.9, 0.66), new THREE.MeshToonMaterial({ color: '#dff4ff', transparent: true, opacity: 0.25 }), { p: [0, 0.95, 0], outline: false, cast: false });
    add(g, box(0.96, 0.05, 0.72), toon('#3a2216'), { p: [0, 1.42, 0] });
    for (const y of [0.52, 0.86, 1.18]) add(g, box(0.86, 0.02, 0.62), toon('#ffffff'), { p: [0, y, 0], outline: false });
    const cols = ['#ffb3d9', '#7a4a2a', '#fff3c4', '#ff6f8a', '#b77bff', '#ffd23a'];
    for (let i = 0; i < 3; i++) {
      add(g, cyl(0.09, 0.09, 0.1, 16), toon(cols[i]), { p: [-0.27 + i * 0.27, 0.58, 0.05] });
      add(g, sph(0.025, 8, 6), toon('#e0283a'), { p: [-0.27 + i * 0.27, 0.65, 0.05], outline: false });
      add(g, new THREE.TorusGeometry(0.05, 0.025, 8, 14), toon(cols[i + 3]), { p: [-0.27 + i * 0.27, 0.9, 0.05], r: [Math.PI / 2, 0, 0], outline: false });
      add(g, cyl(0.07, 0.06, 0.04, 14), toon('#e8a24a'), { p: [-0.27 + i * 0.27, 1.21, 0.05], outline: false });
      add(g, cyl(0.06, 0.06, 0.01, 14), toon(cols[(i + 1) % 6]), { p: [-0.27 + i * 0.27, 1.235, 0.05], outline: false });
    }
  },
  rest_host_stand(g) {
    // the host's podium: a menu on top and a little lamp
    add(g, box(0.6, 1.05, 0.42), toon('#3a2216'), { p: [0, 0.52, 0] });
    add(g, box(0.66, 0.05, 0.5), toon('#d4af37'), { p: [0, 1.06, 0] });
    add(g, box(0.28, 0.02, 0.36), toon('#6e1422'), { p: [-0.1, 1.1, 0.02], r: [0, 0.2, 0], outline: false });
    add(g, cyl(0.015, 0.015, 0.22, 8), toon('#d4af37'), { p: [0.2, 1.2, -0.1], outline: false });
    const shade = toon('#ffe9b0', { side: THREE.DoubleSide }).clone(); shade.emissive = new THREE.Color('#ffcf6b'); shade.emissiveIntensity = 0.7;
    add(g, cyl(0.04, 0.08, 0.08, 14, true), shade, { p: [0.2, 1.32, -0.1] });
  },
  rest_wine_rack(g) {
    add(g, box(0.9, 1.9, 0.4), toon('#2e1a12'), { p: [0, 0.95, -0.25] });
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
      add(g, cyl(0.04, 0.04, 0.32, 10), toon((r + c) % 3 ? '#1f3a22' : '#5e1020'), { p: [-0.3 + c * 0.2, 0.3 + r * 0.28, -0.13], r: [Math.PI / 2, 0, 0], outline: false });
      add(g, cyl(0.02, 0.02, 0.04, 8), toon('#d4af37'), { p: [-0.3 + c * 0.2, 0.3 + r * 0.28, 0.04], r: [Math.PI / 2, 0, 0], outline: false });
    }
  },
  rest_menu_board(g, A) {
    add(g, box(0.9, 0.7, 0.04), toon('#3a2216'), { p: [0, 0, 0.02] });
    add(g, plane(0.8, 0.6), new THREE.MeshBasicMaterial({ map: A.text ? chalkTex(A.text) : menuTex() }), { p: [0, 0, 0.042], outline: false, cast: false });
  },
  rest_neon_open(g, A) {
    add(g, box(0.86, 0.4, 0.03), toon('#141220'), { p: [0, 0, 0.015] });
    const m = new THREE.MeshBasicMaterial({ map: neonOpenTex(), transparent: true });
    add(g, plane(0.8, 0.34), m, { p: [0, 0, 0.032], outline: false, cast: false });
    A.anim.push((t) => { m.opacity = Math.floor(t * 3) % 17 === 0 ? 0.4 : 1; return false; });
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
  hanging_plant(g, A, { drop = 0 } = {}) { hangingPlant(g, 0.6 + drop); },
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
    for (const y of [-0.22, 0.28]) for (let k = 0; k < 9; k++) add(g, box(0.08, 0.3, 0.2), toon(colors[(k + Math.round(y * 10) + colors.length) % colors.length]), { p: [-0.7 + k * 0.17, y + 0.15, 0.13], r: [0, 0, k % 4 === 3 ? 0.25 : 0], outline: false });
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

  // ---- tables, drawers and sets: Rustic (warm wood + leather) and Modern (white, grey, glass) ----
  coffee_table(g) {
    const wood = toon(WOOD), dark = toon(DARK_WOOD);
    add(g, box(1.5, 0.07, 0.7), wood, { p: [0, 0.42, 0] });
    add(g, box(1.36, 0.04, 0.56), dark, { p: [0, 0.14, 0], outline: false });
    for (const x of [-0.68, 0.68]) for (const z of [-0.28, 0.28]) add(g, box(0.07, 0.4, 0.07), dark, { p: [x, 0.2, z], outline: false });
    bookStack(g, -0.45, 0.455, 0.05, 3);
    mug(g, 0.15, 0.455, 0.12, '#ff7a59');
    add(g, cyl(0.07, 0.06, 0.1, 12), toon('#e8e2f4'), { p: [0.5, 0.51, -0.1] });
    for (let i = 0; i < 4; i++) add(g, sph(0.05, 8, 6), toon(i % 2 ? '#3fa34d' : '#56c262'), { p: [0.5 + Math.cos(i * 1.6) * 0.04, 0.6, -0.1 + Math.sin(i * 1.6) * 0.04], s: [0.7, 1.4, 0.5], outline: false });
  },
  coffee_table_glass(g) {
    const metal = shiny('#c0c6d4', { metalness: 0.6, roughness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.2 });
    add(g, box(1.5, 0.04, 0.72), glass, { p: [0, 0.42, 0], outline: false });
    for (const s of [-1, 1]) {
      add(g, box(0.04, 0.4, 0.04), metal, { p: [s * 0.7, 0.2, 0.32], outline: false });
      add(g, box(0.04, 0.4, 0.04), metal, { p: [s * 0.7, 0.2, -0.32], outline: false });
      add(g, box(0.04, 0.04, 0.68), metal, { p: [s * 0.7, 0.4, 0], outline: false });
    }
    add(g, box(1.36, 0.03, 0.6), toon('#f4f4f4'), { p: [0, 0.12, 0], outline: false });
    add(g, cyl(0.12, 0.1, 0.08, 20), toon('#2b2f4a'), { p: [0.35, 0.48, 0] });
    bookStack(g, -0.4, 0.44, 0, 2, ['#f4f4f4', '#9aa3b5']);
  },
  side_table(g) {
    add(g, cyl(0.26, 0.26, 0.05, 24), toon(WOOD), { p: [0, 0.56, 0] });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; add(g, cyl(0.025, 0.02, 0.56, 8), toon(DARK_WOOD), { p: [Math.cos(a) * 0.17, 0.28, Math.sin(a) * 0.17], r: [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12], outline: false }); }
    mug(g, 0.06, 0.585, 0.05, '#39c6ff');
  },
  nightstand(g, A) { return nightstand(g, A, toon(WOOD), toon(DARK_WOOD), shiny('#ffd84d')); },
  nightstand_white(g, A) { return nightstand(g, A, toon('#f4f2ee'), toon('#d8d4cc'), shiny('#c0c6d4')); },
  dresser(g, A) { return drawers(g, A, { w: 1.7, h: 0.95, cols: 2, rows: 3, wood: toon(WOOD), front: toon('#b98049'), knob: shiny('#ffd84d') }); },
  dresser_white(g, A) { return drawers(g, A, { w: 0.8, h: 1.35, cols: 1, rows: 5, wood: toon('#f4f2ee'), front: toon('#ffffff'), knob: shiny('#c0c6d4') }); },
  sofa_leather(g, A) { return FURNITURE.sofa(g, A, { color: '#8b4a2b' }); },
  armchair_leather(g, A) { return FURNITURE.sofa(g, A, { color: '#8b4a2b', w: 0.94 }); },
  sofa_gray(g, A) { return FURNITURE.sofa(g, A, { color: '#9aa3b5' }); },
  armchair_gray(g, A) { return FURNITURE.sofa(g, A, { color: '#9aa3b5', w: 0.94 }); },
  lamp_arc(g) {
    // a modern arc lamp: a heavy marble base, a long curved arm and a dome shade hanging over
    add(g, cyl(0.2, 0.2, 0.1, 24), toon('#f1ece4'), { p: [-0.25, 0.05, 0] });
    const pts = [[-0.25, 0.1], [-0.27, 0.9], [-0.15, 1.55], [0.15, 1.85], [0.4, 1.7]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.022, 6), shiny('#c0c6d4', { metalness: 0.6 }), { outline: false });
    const shade = toon('#2b2f4a', { side: THREE.DoubleSide });
    add(g, geo('arcShade', () => new THREE.SphereGeometry(0.2, 20, 10, 0, TAU, 0, Math.PI / 2)), shade, { p: [0.4, 1.62, 0] });
    const bulb = add(g, sph(0.06, 10, 8), basic('#fff6c9'), { p: [0.4, 1.6, 0], outline: false });
    const light = new THREE.PointLight(0xffe0a8, 2, 5, 1.6);
    light.position.set(0.4, 1.4, 0);
    g.add(light);
    let on = true;
    return { use: () => { on = !on; light.visible = bulb.visible = on; } };
  },

  // ---- the bathroom ----
  toilet(g, A) {
    const white = toon('#fbfbfd');
    add(g, cyl(0.17, 0.15, 0.36, 20), white, { p: [0, 0.18, -0.04], s: [1, 1, 1.2] });
    add(g, geo('bowl', () => new THREE.CylinderGeometry(0.26, 0.19, 0.16, 24)), white, { p: [0, 0.42, -0.02], s: [0.85, 1, 1.15] });
    add(g, geo('seatRing', () => new THREE.TorusGeometry(0.2, 0.045, 8, 24)), toon('#f1f1f6'), { p: [0, 0.505, -0.02], r: [Math.PI / 2, 0, 0], s: [0.85, 1.15, 1] });
    add(g, cyl(0.15, 0.15, 0.02, 20), basic('#7fc8ff'), { p: [0, 0.47, -0.02], s: [0.8, 1, 1.1], outline: false, cast: false });
    add(g, box(0.48, 0.5, 0.2), white, { p: [0, 0.68, -0.3] });
    add(g, box(0.52, 0.05, 0.24), white, { p: [0, 0.95, -0.3] });
    add(g, box(0.08, 0.025, 0.03), shiny('#c0c6d4'), { p: [-0.16, 0.86, -0.19], outline: false });
    return { use: () => floatEmoji(g, A, '💧', 1.0, 3) };
  },
  bathtub(g, A) {
    // a white clawfoot tub, full of water and bubbles
    const white = toon('#fbfbfd');
    const tub = geo('tub', () => {
      // (a round tub profile, stretched long below)
      return new THREE.LatheGeometry([[0.0, 0], [0.3, 0.02], [0.36, 0.2], [0.4, 0.5], [0.42, 0.52], [0.36, 0.52], [0.33, 0.24], [0.0, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
    });
    add(g, tub, white, { p: [0, 0.12, 0], s: [2.15, 1, 1] });
    add(g, cyl(0.34, 0.34, 0.02, 32), new THREE.MeshStandardMaterial({ color: '#8fd8ff', transparent: true, opacity: 0.8, roughness: 0.1 }), { p: [0, 0.56, 0], s: [2.15, 1, 1], outline: false, cast: false });
    const bubbles = [];
    for (let i = 0; i < 12; i++) bubbles.push(add(g, sph(0.08 + (i % 3) * 0.03, 10, 8), toon('#ffffff'), { p: [-0.55 + (i % 6) * 0.2, 0.6, (Math.floor(i / 6) - 0.5) * 0.3], outline: false }));
    for (const x of [-0.7, 0.7]) for (const z of [-0.26, 0.26]) add(g, sph(0.06, 10, 8), shiny('#ffd84d', { metalness: 0.6 }), { p: [x, 0.08, z], outline: false });
    add(g, cyl(0.025, 0.025, 0.3, 8), shiny('#c0c6d4', { metalness: 0.6 }), { p: [-0.82, 0.72, 0], outline: false });
    add(g, box(0.14, 0.03, 0.03), shiny('#c0c6d4', { metalness: 0.6 }), { p: [-0.76, 0.86, 0], outline: false });
    add(g, sph(0.07, 12, 10), toon('#ffd84d'), { p: [0.3, 0.64, 0.08], s: [1.2, 0.9, 0.9] }); // rubber duck
    add(g, sph(0.045, 10, 8), toon('#ffd84d'), { p: [0.37, 0.72, 0.08] });
    add(g, cone(0.025, 0.04, 8), toon('#ff9f43'), { p: [0.42, 0.72, 0.08], r: [0, 0, -Math.PI / 2], outline: false });
    A.anim.push((t) => { bubbles.forEach((b, i) => { b.position.y = 0.6 + Math.sin(t * 2 + i) * 0.02; }); return false; });
    return { use: () => floatEmoji(g, A, '🫧', 0.9, 4) };
  },
  bath_sink(g, A) {
    const white = toon('#fbfbfd');
    add(g, cyl(0.1, 0.14, 0.75, 16), white, { p: [0, 0.38, -0.1] });
    add(g, geo('basin', () => new THREE.CylinderGeometry(0.3, 0.2, 0.16, 24, 1, true)), toon('#fbfbfd', { side: THREE.DoubleSide }), { p: [0, 0.83, -0.05], s: [1.2, 1, 1] });
    add(g, cyl(0.2, 0.2, 0.02, 20), basic('#cfefff'), { p: [0, 0.77, -0.05], s: [1.2, 1, 1], outline: false, cast: false });
    add(g, cyl(0.02, 0.02, 0.18, 8), shiny('#c0c6d4', { metalness: 0.6 }), { p: [0, 0.98, -0.3], outline: false });
    add(g, box(0.03, 0.03, 0.14), shiny('#c0c6d4', { metalness: 0.6 }), { p: [0, 1.06, -0.24], outline: false });
    add(g, cyl(0.035, 0.035, 0.12, 10), toon('#6ee7a0'), { p: [0.27, 0.97, -0.25] });
    return { use: () => floatEmoji(g, A, '💧', 1.2, 3) };
  },
  towel_rack(g) {
    add(g, cyl(0.02, 0.02, 0.8, 8), shiny('#c0c6d4', { metalness: 0.6 }), { p: [0, 0.25, 0.08], r: [0, 0, Math.PI / 2], outline: false });
    for (const [x, c] of [[-0.18, '#7fc8ff'], [0.2, '#ff9fc8']]) {
      add(g, box(0.32, 0.6, 0.04), toon(c), { p: [x, -0.02, 0.1] });
      add(g, box(0.32, 0.05, 0.05), toon('#ffffff'), { p: [x, -0.26, 0.1], outline: false });
    }
  },
  mirror_bath(g) {
    add(g, box(0.7, 0.9, 0.05), toon('#fbfbfd'), { p: [0, 0, 0.025] });
    add(g, box(0.6, 0.8, 0.02), new THREE.MeshStandardMaterial({ color: '#dff4ff', roughness: 0.05, metalness: 0.6 }), { p: [0, 0, 0.055], outline: false });
    add(g, box(0.7, 0.05, 0.16), toon('#fbfbfd'), { p: [0, -0.5, 0.08] });
    add(g, cyl(0.03, 0.03, 0.1, 8), toon('#ff9fc8'), { p: [-0.2, -0.42, 0.08], outline: false });
  },
  bath_mat(g) {
    add(g, geo('bathMat', () => new THREE.BoxGeometry(0.9, 0.02, 0.6)), new THREE.MeshToonMaterial({ map: bathMatTex }), { p: [0, 0.012, 0], outline: false, cast: false });
  },
  shower(g, A) {
    // a glass shower box with a tiled base and a rain head
    const metal = shiny('#c0c6d4', { metalness: 0.6 });
    add(g, box(0.92, 0.1, 0.92), toon('#e6eef5'), { p: [0, 0.05, 0] });
    const glass = new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false });
    for (const [x, z, ry] of [[0, 0.45, 0], [0.45, 0, Math.PI / 2], [-0.45, 0, Math.PI / 2]]) add(g, box(0.9, 2.0, 0.03), glass, { p: [x, 1.1, z], r: [0, ry, 0], outline: false, cast: false });
    add(g, box(0.9, 2.0, 0.04), new THREE.MeshToonMaterial({ map: floorTexture('floor_tile_white') }), { p: [0, 1.1, -0.44] });
    add(g, cyl(0.02, 0.02, 0.4, 8), metal, { p: [0, 1.95, -0.25], r: [Math.PI / 2, 0, 0], outline: false });
    add(g, cyl(0.14, 0.12, 0.04, 16), metal, { p: [0, 1.92, -0.05], outline: false });
    const drops = [];
    for (let i = 0; i < 10; i++) { const d = add(g, box(0.012, 0.12, 0.012), basic('#bfe8ff'), { outline: false, cast: false }); d.visible = false; drops.push(d); }
    let on = 0;
    A.anim.push((t, dt) => {
      on = Math.max(0, on - dt);
      drops.forEach((d, i) => { d.visible = on > 0; const p = (t * 2.2 + i / 10) % 1; d.position.set(Math.sin(i * 2.4) * 0.1, 1.85 - p * 1.7, -0.05 + Math.cos(i * 1.7) * 0.1); });
      return false;
    });
    return { use: () => { on = 12; floatEmoji(g, A, '🚿', 2.2, 1); } };
  },
  bathtub_modern(g, A) {
    // a built-in rectangular tub: white sides, a chrome mixer tap, full of water
    const white = toon('#fbfbfd'), chrome = shiny('#c0c6d4', { metalness: 0.6 });
    add(g, box(1.9, 0.5, 0.86), white, { p: [0, 0.25, 0] });
    add(g, box(1.7, 0.02, 0.66), new THREE.MeshStandardMaterial({ color: '#8fd8ff', transparent: true, opacity: 0.85, roughness: 0.1 }), { p: [0, 0.45, 0], outline: false, cast: false });
    add(g, box(1.94, 0.04, 0.9), toon('#e8e8ee'), { p: [0, 0.51, 0] });
    add(g, cyl(0.025, 0.025, 0.22, 8), chrome, { p: [-0.82, 0.62, -0.3], outline: false });
    add(g, box(0.03, 0.03, 0.16), chrome, { p: [-0.82, 0.72, -0.23], outline: false });
    return tubSoak(g, A, 1.6, 0.5);
  },
  bathtub_gold(g, A) {
    // a golden clawfoot tub on lion feet
    const gold = shiny('#d4af37', { metalness: 0.7, roughness: 0.25 });
    add(g, geo('tub', () => new THREE.LatheGeometry([[0.0, 0], [0.3, 0.02], [0.36, 0.2], [0.4, 0.5], [0.42, 0.52], [0.36, 0.52], [0.33, 0.24], [0.0, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 32)), gold, { p: [0, 0.12, 0], s: [2.15, 1, 1] });
    add(g, cyl(0.34, 0.34, 0.02, 32), new THREE.MeshStandardMaterial({ color: '#ffe3f0', transparent: true, opacity: 0.85, roughness: 0.2 }), { p: [0, 0.56, 0], s: [2.15, 1, 1], outline: false, cast: false });
    for (const x of [-0.7, 0.7]) for (const z of [-0.26, 0.26]) add(g, cone(0.07, 0.14, 8), gold, { p: [x, 0.07, z], r: [Math.PI, 0, 0], outline: false });
    add(g, cyl(0.025, 0.025, 0.3, 8), gold, { p: [-0.82, 0.72, 0], outline: false });
    for (let i = 0; i < 6; i++) add(g, sph(0.05, 8, 6), toon('#ff5d8f'), { p: [-0.5 + i * 0.2, 0.58, Math.sin(i * 2) * 0.15], s: [1, 0.3, 1], outline: false }); // (rose petals)
    return tubSoak(g, A, 1.5, 0.56);
  },
  bathtub_wood(g, A) {
    // a deep round Japanese soaking tub of wooden staves with metal hoops
    const wood = toon('#c9955a');
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; add(g, box(0.16, 0.75, 0.05), i % 2 ? wood : toon('#b98548'), { p: [Math.cos(a) * 0.4, 0.375, Math.sin(a) * 0.4], r: [0, -a + Math.PI / 2, 0], outline: false }); }
    for (const y of [0.15, 0.6]) add(g, new THREE.TorusGeometry(0.42, 0.018, 6, 32), shiny('#3a3f55'), { p: [0, y, 0], r: [Math.PI / 2, 0, 0], outline: false });
    add(g, cyl(0.38, 0.38, 0.02, 28), new THREE.MeshStandardMaterial({ color: '#9fe0e8', transparent: true, opacity: 0.85, roughness: 0.1 }), { p: [0, 0.66, 0], outline: false, cast: false });
    add(g, cyl(0.4, 0.4, 0.04, 28), toon('#8b5a2b'), { p: [0, 0.02, 0] });
    return tubSoak(g, A, 0.5, 0.66, '♨️');
  },
  jacuzzi(g, A) {
    // a big octagonal hot tub: teal water that bubbles, a wooden surround with steps
    const wood = toon('#8b5a2b');
    add(g, cyl(0.98, 0.98, 0.62, 8, true), toon('#8b5a2b', { side: THREE.DoubleSide }), { p: [0, 0.31, 0] });
    add(g, new THREE.RingGeometry(0.82, 1.0, 8, 1, Math.PI / 8), toon('#6e4424', { side: THREE.DoubleSide }), { p: [0, 0.625, 0], r: [-Math.PI / 2, 0, 0] }); // (the rim: open in the middle)
    add(g, cyl(0.82, 0.82, 0.02, 8), toon('#e8f4f8'), { p: [0, 0.2, 0], outline: false }); // (the tub floor)
    add(g, cyl(0.82, 0.82, 0.02, 8), new THREE.MeshStandardMaterial({ color: '#3fd8d0', transparent: true, opacity: 0.85, roughness: 0.1, emissive: '#0a5a5a', emissiveIntensity: 0.4 }), { p: [0, 0.6, 0], outline: false, cast: false });
    add(g, box(0.7, 0.2, 0.3), wood, { p: [0, 0.1, 0.98] });
    const fizz = [];
    for (let i = 0; i < 22; i++) fizz.push(add(g, sph(0.03 + (i % 3) * 0.015, 8, 6), basic('#ffffff', { transparent: true, opacity: 0.8 }), { outline: false, cast: false }));
    const light = new THREE.PointLight(0x3fd8d0, 0.8, 3, 1.8);
    light.position.set(0, 0.8, 0); g.add(light);
    let boost = 0;
    A.anim.push((t, dt) => {
      boost = Math.max(0, boost - dt);
      fizz.forEach((b, i) => { const a = i * 2.4 + t * 0.3, r = 0.15 + (i % 5) * 0.13; b.position.set(Math.cos(a) * r, 0.62 + Math.abs(Math.sin(t * (3 + boost * 3) + i)) * (0.03 + boost * 0.02), Math.sin(a) * r); });
      return false;
    });
    return { use: () => { boost = 12; floatEmoji(g, A, '🫧', 1.0, 5); } };
  },
  shower_rain(g, A) {
    // an open walk-in shower: a black-framed glass panel, slate tiles and a big square rain head
    const black = toon('#1d1b22');
    add(g, box(0.94, 0.06, 0.94), toon('#3a3f48'), { p: [0, 0.03, 0] });
    add(g, box(0.92, 2.1, 0.04), new THREE.MeshToonMaterial({ map: floorTexture('floor_tl_black_tiles') }), { p: [0, 1.1, -0.45] });
    add(g, box(0.03, 2.0, 0.9), new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false }), { p: [0.45, 1.05, 0], outline: false, cast: false });
    for (const [y, h] of [[0.06, 0.03], [2.05, 0.03]]) add(g, box(0.05, h, 0.92), black, { p: [0.45, y, 0], outline: false });
    add(g, box(0.05, 2.0, 0.04), black, { p: [0.45, 1.05, 0.44], outline: false });
    add(g, cyl(0.015, 0.015, 0.35, 8), black, { p: [0, 2.04, -0.28], r: [Math.PI / 2, 0, 0], outline: false });
    add(g, box(0.34, 0.03, 0.34), black, { p: [0, 2.02, -0.08] });
    add(g, box(0.12, 0.2, 0.04), toon('#2a2d36'), { p: [-0.2, 1.4, -0.41], outline: false }); // (a niche of bottles)
    return showerWater(g, A, 0, -0.08, 2.0);
  },
  shower_curtain(g, A) {
    // a tiled shower stall with a curved rod and a striped curtain
    add(g, box(0.94, 0.1, 0.94), toon('#e6eef5'), { p: [0, 0.05, 0] });
    for (const [x, z, ry] of [[0, -0.45, 0], [-0.45, 0, Math.PI / 2], [0.45, 0, Math.PI / 2]]) add(g, box(0.92, 2.1, 0.04), new THREE.MeshToonMaterial({ map: floorTexture('floor_tile_mint') }), { p: [x, 1.1, z], r: [0, ry, 0] });
    add(g, cyl(0.012, 0.012, 0.92, 8), shiny('#c0c6d4', { metalness: 0.6 }), { p: [0, 2.0, 0.44], r: [0, 0, Math.PI / 2], outline: false });
    const curtain = new THREE.MeshToonMaterial({ map: curtainTex(), side: THREE.DoubleSide });
    add(g, new THREE.PlaneGeometry(0.4, 1.8, 6, 1).translate(0, -0.9, 0), curtain, { p: [-0.25, 2.0, 0.44], outline: false });
    add(g, cyl(0.02, 0.02, 0.36, 8), shiny('#c0c6d4', { metalness: 0.6 }), { p: [0, 1.95, -0.25], r: [Math.PI / 2, 0, 0], outline: false });
    add(g, cyl(0.1, 0.08, 0.04, 14), shiny('#c0c6d4', { metalness: 0.6 }), { p: [0, 1.92, -0.06], outline: false });
    return showerWater(g, A, 0, -0.06, 1.88);
  },
  toilet_modern(g, A) {
    // a sleek wall-hung toilet with a black seat and a flush plate
    const white = toon('#fbfbfd');
    add(g, box(0.5, 0.9, 0.16), white, { p: [0, 0.75, -0.38] });
    add(g, box(0.16, 0.1, 0.02), toon('#2a2d36'), { p: [0, 0.95, -0.295], outline: false });
    add(g, geo('mbowl', () => new THREE.CylinderGeometry(0.22, 0.16, 0.24, 24)), white, { p: [0, 0.4, -0.1], s: [0.9, 1, 1.25] });
    add(g, geo('seatRing', () => new THREE.TorusGeometry(0.2, 0.045, 8, 24)), toon('#1d1b22'), { p: [0, 0.53, -0.1], r: [Math.PI / 2, 0, 0], s: [0.85, 1.15, 1] });
    add(g, cyl(0.15, 0.15, 0.02, 20), basic('#7fc8ff'), { p: [0, 0.5, -0.1], s: [0.8, 1, 1.1], outline: false, cast: false });
    return { use: () => floatEmoji(g, A, '💧', 1.0, 3) };
  },
  toilet_gold(g, A) {
    // the golden throne: a gold toilet with a red velvet lid and a little crown on the tank
    const gold = shiny('#d4af37', { metalness: 0.7, roughness: 0.25 });
    add(g, cyl(0.17, 0.15, 0.36, 20), gold, { p: [0, 0.18, -0.04], s: [1, 1, 1.2] });
    add(g, geo('bowl', () => new THREE.CylinderGeometry(0.26, 0.19, 0.16, 24)), gold, { p: [0, 0.42, -0.02], s: [0.85, 1, 1.15] });
    add(g, geo('seatRing', () => new THREE.TorusGeometry(0.2, 0.045, 8, 24)), toon('#a3262e'), { p: [0, 0.505, -0.02], r: [Math.PI / 2, 0, 0], s: [0.85, 1.15, 1] });
    add(g, box(0.48, 0.5, 0.2), gold, { p: [0, 0.68, -0.3] });
    for (let i = 0; i < 5; i++) add(g, cone(0.03, 0.08, 6), gold, { p: [-0.16 + i * 0.08, 1.0, -0.3], outline: false });
    add(g, sph(0.03, 8, 6), toon('#e0283a'), { p: [0, 0.8, -0.19], outline: false });
    return { use: () => floatEmoji(g, A, '👑', 1.2, 2) };
  },
  tp_chrome(g) { tpHolder(g, shiny('#c0c6d4', { metalness: 0.6 })); },
  tp_gold(g) { tpHolder(g, shiny('#d4af37', { metalness: 0.7 })); },
  tp_black(g) { tpHolder(g, toon('#1d1b22')); },
  tp_wood(g) { tpHolder(g, toon('#a8723f'), true); },
  tp_pink(g) { tpHolder(g, toon('#ff8fc7'), false, '#ffe3f0'); },
  tp_stack(g) {
    // a little pyramid of spare rolls on the floor
    const roll = toon('#ffffff');
    for (const [x, y, z] of [[-0.12, 0.08, 0], [0.12, 0.08, 0], [0, 0.08, 0.2], [0, 0.24, 0.07]]) {
      add(g, cyl(0.08, 0.08, 0.15, 16), roll, { p: [x, y, z] });
      add(g, cyl(0.025, 0.025, 0.152, 10), toon('#c9a77a'), { p: [x, y, z], outline: false });
    }
  },
  bath_vanity(g, A) {
    // a double vanity: a wood cabinet, a stone top with two basins and taps
    add(g, box(1.8, 0.8, 0.55), toon('#5a3a24'), { p: [0, 0.4, -0.15] });
    for (const x of [-0.45, 0.45]) { add(g, box(0.8, 0.6, 0.02), toon('#6e4a30'), { p: [x, 0.38, 0.13], outline: false }); add(g, box(0.12, 0.02, 0.02), shiny('#d4af37'), { p: [x, 0.62, 0.15], outline: false }); }
    add(g, box(1.86, 0.05, 0.6), toon('#ece8e2'), { p: [0, 0.82, -0.15] });
    for (const x of [-0.45, 0.45]) {
      add(g, cyl(0.17, 0.13, 0.08, 20), toon('#ffffff'), { p: [x, 0.88, -0.12] });
      add(g, cyl(0.13, 0.13, 0.01, 16), basic('#cfefff'), { p: [x, 0.92, -0.12], outline: false, cast: false });
      add(g, cyl(0.015, 0.015, 0.18, 8), shiny('#c0c6d4', { metalness: 0.6 }), { p: [x, 0.94, -0.36], outline: false });
      add(g, box(0.025, 0.025, 0.1), shiny('#c0c6d4', { metalness: 0.6 }), { p: [x, 1.02, -0.32], outline: false });
    }
    return { use: () => floatEmoji(g, A, '💧', 1.2, 3) };
  },

  // ---- more of the gamer set ----
  gaming_pc(g, A) {
    // a glass-sided tower with RGB fans and a glowing strip that cycle through the rainbow
    add(g, box(0.36, 0.8, 0.7), toon('#141218'), { p: [0, 0.42, 0] });
    add(g, box(0.02, 0.7, 0.6), new THREE.MeshStandardMaterial({ color: '#4a4a66', transparent: true, opacity: 0.35, roughness: 0.05 }), { p: [0.185, 0.43, 0], outline: false, cast: false });
    const glows = [];
    for (const [y, z] of [[0.62, -0.15], [0.62, 0.15], [0.3, 0]]) {
      const m = basic('#ff4fd8');
      add(g, new THREE.TorusGeometry(0.1, 0.018, 6, 20), m, { p: [0.17, y, z], r: [0, Math.PI / 2, 0], outline: false, cast: false });
      glows.push(m);
    }
    const strip = basic('#39e6ff'); glows.push(strip);
    add(g, box(0.02, 0.02, 0.6), strip, { p: [0.18, 0.79, 0], outline: false, cast: false });
    add(g, box(0.2, 0.3, 0.3), toon('#2a2d36'), { p: [0.05, 0.42, -0.05], outline: false }); // (the graphics card / board)
    add(g, cyl(0.02, 0.02, 0.01, 10), basic('#6ee7a0'), { p: [0, 0.8, 0.355], r: [Math.PI / 2, 0, 0], outline: false });
    for (const [x, z] of [[-0.14, -0.3], [0.14, -0.3], [-0.14, 0.3], [0.14, 0.3]]) add(g, box(0.06, 0.03, 0.06), toon('#2a2d36'), { p: [x, 0.015, z], outline: false });
    rgbCycle(A, glows, 0.25);
  },
  rgb_hex_panels(g, A) {
    // a cluster of hexagon light panels on the wall, a slow rainbow wave washing across them
    const cells = [[0, 0], [1, 0], [2, 0], [3, 0], [0.5, 1], [1.5, 1], [2.5, 1], [1, 2], [2, 2], [3, 2], [-0.5, 1], [3.5, 1]];
    const hex = geo('hexPanel', () => new THREE.CylinderGeometry(0.15, 0.15, 0.03, 6));
    const mats = [];
    for (const [cx, cy] of cells) {
      const m = basic('#39e6ff'); mats.push({ m, cx });
      add(g, hex, m, { p: [(cx - 1.5) * 0.27, (cy - 1) * 0.235, 0.02], r: [Math.PI / 2, 0, Math.PI / 6], outline: false, cast: false });
    }
    const light = new THREE.PointLight(0x9a6bff, 0.7, 3, 1.8); light.position.set(0, 0, 0.4); g.add(light);
    const c = new THREE.Color();
    A.anim.push((t) => { mats.forEach(({ m, cx }) => m.color.setHSL(((t * 0.06 + cx * 0.07) % 1 + 1) % 1, 0.85, 0.6)); light.color.setHSL((t * 0.06) % 1, 0.8, 0.6); return false; });
    void c;
  },
  rgb_strip(g, A) {
    // an LED strip along the wall, a rainbow chasing along it
    const n = 24, segs = [];
    for (let i = 0; i < n; i++) { const m = basic('#ff4fd8'); segs.push(m); add(g, box(1.9 / n - 0.004, 0.03, 0.02), m, { p: [-0.95 + (i + 0.5) * (1.9 / n), 0, 0.01], outline: false, cast: false }); }
    A.anim.push((t) => { segs.forEach((m, i) => m.color.setHSL(((t * 0.3 - i / n) % 1 + 1) % 1, 0.9, 0.6)); return false; });
  },
  rgb_light_bars(g, A) {
    // a pair of standing RGB light bars
    const mats = [];
    for (const x of [-0.3, 0.3]) {
      add(g, cyl(0.08, 0.1, 0.03, 16), toon('#141218'), { p: [x, 0.015, 0] });
      const m = basic('#39e6ff'); mats.push(m);
      add(g, cyl(0.03, 0.03, 0.9, 10), m, { p: [x, 0.48, 0], outline: false, cast: false });
    }
    const light = new THREE.PointLight(0x39e6ff, 0.6, 3, 1.8); light.position.set(0, 0.6, 0.2); g.add(light);
    A.anim.push((t) => { mats.forEach((m, i) => m.color.setHSL(((t * 0.12 + i * 0.5) % 1), 0.9, 0.6)); light.color.setHSL((t * 0.12) % 1, 0.9, 0.6); return false; });
  },
  neon_gg(g, A) {
    add(g, box(0.8, 0.44, 0.02), toon('#141218'), { p: [0, 0, 0.01] });
    const m = new THREE.MeshBasicMaterial({ map: neonTextTex('GG', '#b77bff'), transparent: true });
    add(g, plane(0.76, 0.4), m, { p: [0, 0, 0.025], outline: false, cast: false });
    A.anim.push((t) => { m.opacity = 0.85 + Math.sin(t * 3) * 0.15; return false; });
  },
  neon_controller(g, A) {
    const m = new THREE.MeshBasicMaterial({ map: neonControllerTex(), transparent: true });
    add(g, plane(0.9, 0.55), m, { p: [0, 0, 0.02], outline: false, cast: false });
    A.anim.push((t) => { m.opacity = Math.floor(t * 2.5) % 19 === 0 ? 0.5 : 1; return false; });
  },
  gamer_fridge(g) {
    // a mini fridge with a glass door full of energy drinks, lit from inside
    add(g, box(0.5, 0.75, 0.5), toon('#141218'), { p: [0, 0.375, -0.05] });
    add(g, box(0.44, 0.66, 0.02), new THREE.MeshStandardMaterial({ color: '#b8f0ff', transparent: true, opacity: 0.3, emissive: '#39e6ff', emissiveIntensity: 0.3 }), { p: [0, 0.39, 0.21], outline: false, cast: false });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) add(g, cyl(0.03, 0.03, 0.14, 10), toon(['#6ee7a0', '#ff4fd8', '#ffd84d', '#39e6ff'][(r + c) % 4]), { p: [-0.15 + c * 0.1, 0.16 + r * 0.21, 0.1], outline: false });
    add(g, box(0.03, 0.3, 0.03), toon('#3a3d46'), { p: [0.2, 0.45, 0.23], outline: false });
  },
  sim_rig(g) {
    // a racing simulator: a bucket seat on a frame, a wheel on a stand and pedals
    const frame = toon('#2a2d36');
    add(g, box(0.6, 0.08, 1.7), frame, { p: [0, 0.04, 0] });
    add(g, box(0.5, 0.1, 0.5), toon('#e0283a'), { p: [0, 0.38, -0.45] });
    add(g, box(0.5, 0.7, 0.12), toon('#e0283a'), { p: [0, 0.75, -0.72], r: [-0.25, 0, 0] });
    add(g, box(0.1, 0.3, 0.1), frame, { p: [0, 0.2, -0.45], outline: false });
    add(g, box(0.08, 0.7, 0.08), frame, { p: [0, 0.4, 0.45], r: [0.3, 0, 0] });
    add(g, new THREE.TorusGeometry(0.16, 0.025, 8, 24), toon('#141218'), { p: [0, 0.78, 0.36], r: [0.4, 0, 0] });
    add(g, box(0.4, 0.05, 0.12), frame, { p: [0, 0.1, 0.7], r: [0.4, 0, 0] });
  },

  // ---- on tables: plates, food and little things (they sit on whatever surface they're put on) ----
  plate_set(g) { plateBase(g); add(g, new THREE.ConeGeometry(0.04, 0.07, 4), toon('#ffffff'), { p: [0, 0.05, -0.02], outline: false }); },
  plate_steak(g) { plateBase(g); add(g, sph(0.07, 12, 8), toon('#7a3a1e'), { p: [-0.02, 0.025, 0], s: [1.3, 0.35, 1] }); for (let i = 0; i < 4; i++) add(g, cyl(0.008, 0.008, 0.07, 6), toon('#ffcf4a'), { p: [0.07, 0.02, -0.03 + i * 0.02], r: [Math.PI / 2, 0, 0.3], outline: false }); add(g, sph(0.02, 8, 6), toon('#3a8a2a'), { p: [0.05, 0.03, 0.06], outline: false }); },
  plate_pasta(g) { plateBase(g); add(g, sph(0.08, 14, 10), toon('#f2cf6a'), { p: [0, 0.02, 0], s: [1, 0.4, 1], outline: false }); add(g, sph(0.04, 10, 8), toon('#c8341f'), { p: [0, 0.04, 0], s: [1, 0.5, 1], outline: false }); add(g, sph(0.012, 6, 4), toon('#3a8a2a'), { p: [0.02, 0.06, 0.01], outline: false }); },
  plate_salad(g) { plateBase(g); for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.02 + (i % 3) * 0.025; add(g, sph(0.025, 8, 6), toon(['#5aa83a', '#7ac84a', '#d8402a', '#ffd23a'][i % 4]), { p: [Math.cos(a) * r, 0.025, Math.sin(a) * r], s: [1, 0.5, 1], outline: false }); } },
  plate_sushi(g) { add(g, box(0.3, 0.02, 0.12), toon('#c98a52'), { p: [0, 0.01, 0] }); for (let i = 0; i < 4; i++) { add(g, cyl(0.024, 0.024, 0.035, 12), toon('#1d2a1a'), { p: [-0.1 + i * 0.065, 0.038, 0], outline: false }); add(g, cyl(0.016, 0.016, 0.037, 10), toon(i % 2 ? '#ff7a4a' : '#ffffff'), { p: [-0.1 + i * 0.065, 0.039, 0], outline: false }); } },
  plate_cake(g) { plateBase(g, 0.09); add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12, 1, false, 0, Math.PI / 2.5), toon('#ffe3ef'), { p: [0, 0.04, 0] }); add(g, sph(0.014, 8, 6), toon('#e0283a'), { p: [0.02, 0.08, 0.02], outline: false }); },
  pizza_board(g) { add(g, cyl(0.17, 0.17, 0.02, 20), toon('#c98a52'), { p: [0, 0.01, 0] }); add(g, cyl(0.15, 0.15, 0.02, 20), toon('#e8a24a'), { p: [0, 0.03, 0], outline: false }); add(g, cyl(0.135, 0.135, 0.01, 20), toon('#d8402a'), { p: [0, 0.04, 0], outline: false }); for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 0.04 + (i % 3) * 0.03; add(g, cyl(0.018, 0.018, 0.008, 8), toon(i % 3 ? '#b02a2a' : '#fff3c4'), { p: [Math.cos(a) * r, 0.048, Math.sin(a) * r], outline: false }); } },
  burger_plate(g) { plateBase(g); [['#d9913a', 0.022, 0.06], ['#3a7a2a', 0.008, 0.065], ['#5a2e1a', 0.025, 0.058], ['#ffd23a', 0.007, 0.06]].reduce((y, [c, h, r]) => { add(g, cyl(r, r, h, 16), toon(c), { p: [-0.03, y + h / 2, 0], outline: false }); return y + h; }, 0.015); add(g, sph(0.06, 14, 8), toon('#e6a24a'), { p: [-0.03, 0.08, 0], s: [1, 0.55, 1] }); for (let i = 0; i < 4; i++) add(g, box(0.01, 0.01, 0.06), toon('#ffcf4a'), { p: [0.07, 0.02, -0.03 + i * 0.02], r: [0, i, 0.2], outline: false }); },
  bread_basket(g) { add(g, cyl(0.1, 0.08, 0.06, 16, true), toon('#b98548', { side: THREE.DoubleSide }), { p: [0, 0.03, 0] }); for (let i = 0; i < 4; i++) add(g, sph(0.04, 10, 8), toon('#d9a25a'), { p: [Math.cos(i * 1.6) * 0.04, 0.06, Math.sin(i * 1.6) * 0.04], s: [1.4, 0.8, 0.9], r: [0, i, 0] }); },
  fruit_bowl(g) { add(g, new THREE.SphereGeometry(0.11, 18, 10, 0, TAU, Math.PI / 2, Math.PI / 2), toon('#ffffff', { side: THREE.DoubleSide }), { p: [0, 0.1, 0] }); [['#e0283a', -0.04, 0], ['#ffd23a', 0.04, 0.01], ['#ff9f43', 0, -0.04], ['#6ee7a0', 0.01, 0.04]].forEach(([c, x, z]) => add(g, sph(0.035, 10, 8), toon(c), { p: [x, 0.08, z] })); },
  cloche(g) { plateBase(g, 0.12); add(g, new THREE.SphereGeometry(0.1, 18, 10, 0, TAU, 0, Math.PI / 2), shiny('#d8dce4', { metalness: 0.8, roughness: 0.2 }), { p: [0, 0.015, 0] }); add(g, sph(0.015, 8, 6), shiny('#d8dce4', { metalness: 0.8 }), { p: [0, 0.12, 0], outline: false }); },
  wine_set(g) { add(g, cyl(0.03, 0.035, 0.18, 12), toon('#2a4a2a'), { p: [-0.06, 0.09, 0] }); add(g, cyl(0.012, 0.02, 0.06, 10), toon('#2a4a2a'), { p: [-0.06, 0.21, 0] }); add(g, cyl(0.03, 0.03, 0.05, 12), toon('#f4ead0'), { p: [-0.06, 0.1, 0], outline: false }); for (const x of [0.04, 0.1]) wineGlass(g, x, 0); },
  champagne_bucket(g) { add(g, cyl(0.08, 0.06, 0.14, 16), shiny('#d8dce4', { metalness: 0.8, roughness: 0.2 }), { p: [0, 0.07, 0] }); add(g, cyl(0.025, 0.03, 0.2, 12), toon('#1f3a22'), { p: [0, 0.16, 0], r: [0.25, 0, 0] }); add(g, cyl(0.026, 0.026, 0.05, 12), shiny('#d4af37'), { p: [0, 0.27, 0.03], r: [0.25, 0, 0], outline: false }); },
  candle_trio(g, A) { const fl = []; [[0, 0.16], [0.05, 0.11], [-0.05, 0.08]].forEach(([x, h], i) => { add(g, cyl(0.022, 0.022, h, 12), toon('#fff3dc'), { p: [x, h / 2, (i % 2) * 0.03] }); fl.push(add(g, sph(0.012, 8, 6), basic('#ffb13b'), { p: [x, h + 0.015, (i % 2) * 0.03], s: [1, 1.6, 1], outline: false })); }); A.anim.push((t) => { fl.forEach((f, i) => f.scale.set(1, 1.4 + Math.sin(t * 9 + i) * 0.3, 1)); return false; }); },
  flower_vase(g) { add(g, cyl(0.04, 0.05, 0.16, 14), new THREE.MeshToonMaterial({ color: '#cfefff', transparent: true, opacity: 0.6 }), { p: [0, 0.08, 0] }); for (let i = 0; i < 6; i++) { const a = i * 1.05; add(g, cyl(0.004, 0.004, 0.16, 4), toon('#3a8a2a'), { p: [Math.cos(a) * 0.02, 0.22, Math.sin(a) * 0.02], r: [Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2], outline: false }); add(g, sph(0.028, 8, 6), toon(['#ffffff', '#ff8fc7', '#ffd84d'][i % 3]), { p: [Math.cos(a) * 0.04, 0.3, Math.sin(a) * 0.04] }); } },
  teapot_set(g) { add(g, sph(0.06, 14, 10), toon('#ffffff'), { p: [-0.05, 0.06, 0], s: [1, 0.85, 1] }); add(g, cyl(0.008, 0.014, 0.06, 6), toon('#ffffff'), { p: [0.01, 0.07, 0], r: [0, 0, -0.9], outline: false }); for (const [x, z] of [[0.08, -0.05], [0.08, 0.06]]) { add(g, cyl(0.035, 0.035, 0.005, 12), toon('#ffffff'), { p: [x, 0.003, z], outline: false }); add(g, cyl(0.022, 0.018, 0.035, 12), toon('#ffffff'), { p: [x, 0.022, z] }); } },
  coffee_cups(g) { for (const [x, c] of [[-0.06, '#ffffff'], [0.06, '#ffd8c4']]) { add(g, cyl(0.04, 0.04, 0.006, 14), toon('#ffffff'), { p: [x, 0.003, 0], outline: false }); add(g, cyl(0.03, 0.025, 0.05, 14), toon(c), { p: [x, 0.03, 0] }); add(g, cyl(0.026, 0.026, 0.002, 12), toon('#5a3420'), { p: [x, 0.055, 0], outline: false }); } },
  books_table(g) { [['#7a2a2a', 0.2], ['#26355e', 0.18], ['#e8e2d0', 0.16]].forEach(([c, w], i) => add(g, box(w, 0.035, w * 0.72), toon(c), { p: [0, 0.018 + i * 0.036, 0], r: [0, i * 0.2, 0] })); },
  cake_stand(g) { for (const [y, r] of [[0.0, 0.14], [0.13, 0.1], [0.24, 0.07]]) { add(g, cyl(r, r, 0.01, 18), toon('#ffffff'), { p: [0, y + 0.01, 0] }); for (let i = 0; i < Math.round(r * 40); i++) { const a = (i / Math.round(r * 40)) * TAU; add(g, cyl(0.016, 0.016, 0.02, 8), toon(['#ffb3d9', '#b77bff', '#fff3c4', '#6ee7a0'][i % 4]), { p: [Math.cos(a) * r * 0.7, y + 0.025, Math.sin(a) * r * 0.7], outline: false }); } } add(g, cyl(0.008, 0.008, 0.3, 6), shiny('#d4af37'), { p: [0, 0.15, 0], outline: false }); },
  succulent_pot(g) { add(g, cyl(0.06, 0.05, 0.08, 14), toon('#e8e2d8'), { p: [0, 0.04, 0] }); for (let i = 0; i < 7; i++) { const a = i * 0.9; add(g, cone(0.02, 0.07, 5), toon('#5aa87a'), { p: [Math.cos(a) * 0.025, 0.11, Math.sin(a) * 0.025], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], outline: false }); } },
  tlamp_ceramic(g, A) { add(g, sph(0.07, 14, 10), toon('#e8d8c4'), { p: [0, 0.07, 0], s: [1, 1.1, 1] }); add(g, cyl(0.008, 0.008, 0.1, 6), shiny('#d4af37'), { p: [0, 0.18, 0], outline: false }); return lampShade(g, A, 0, 0.26, 0.07, 0.11, 0.12, '#fff3dc'); },
  tlamp_mushroom(g, A) { add(g, cyl(0.025, 0.04, 0.16, 12), toon('#f4ead0'), { p: [0, 0.08, 0] }); return lampShade(g, A, 0, 0.18, 0.02, 0.11, 0.07, '#f4ead0'); },
  tlamp_brass(g, A) { add(g, cyl(0.05, 0.05, 0.01, 14), shiny('#d4af37'), { p: [0, 0.005, 0] }); add(g, cyl(0.007, 0.007, 0.24, 6), shiny('#d4af37'), { p: [0, 0.12, 0], outline: false }); return lampShade(g, A, 0, 0.26, 0.05, 0.09, 0.08, '#2a3a2a'); },
  laptop(g) { add(g, box(0.26, 0.012, 0.18), shiny('#b8bcc8'), { p: [0, 0.006, 0.02] }); add(g, box(0.26, 0.17, 0.01), shiny('#b8bcc8'), { p: [0, 0.09, -0.07], r: [-0.25, 0, 0] }); add(g, box(0.23, 0.14, 0.002), basic('#3b6fd0'), { p: [0, 0.09, -0.063], r: [-0.25, 0, 0], outline: false }); },

  // ---- more restaurant pieces ----
  rest_round_table(g) { roundCloth(g, 0.45, '#f4f0e8'); },
  rest_round_table_big(g) { roundCloth(g, 0.95, '#f4f0e8'); },
  rest_long_table(g) {
    add(g, box(1.84, 0.04, 0.84), toon('#3a2216'), { p: [0, 0.76, 0] });
    add(g, box(1.9, 0.02, 0.9), toon('#f4f0e8'), { p: [0, 0.785, 0], outline: false });
    for (const sx of [-1, 1]) add(g, box(0.02, 0.2, 0.9), toon('#f4f0e8'), { p: [sx * 0.95, 0.69, 0], outline: false });
    for (const sz of [-1, 1]) add(g, box(1.9, 0.2, 0.02), toon('#f4f0e8'), { p: [0, 0.69, sz * 0.45], outline: false });
    add(g, box(1.0, 0.004, 0.24), toon('#8f1530'), { p: [0, 0.797, 0], outline: false }); // (a runner)
    for (const [x, z] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) add(g, cyl(0.025, 0.025, 0.58, 8), toon('#3a2216'), { p: [x, 0.29, z], outline: false });
  },
  rest_fine_chair(g) {
    // an upholstered dining chair: a tall velvet back and seat on dark legs
    const velvet = toon('#6e1422'), wood = toon('#2a1a12');
    add(g, box(0.46, 0.1, 0.46), velvet, { p: [0, 0.48, 0.02] });
    add(g, box(0.46, 0.66, 0.1), velvet, { p: [0, 0.86, -0.2], r: [-0.08, 0, 0] });
    add(g, sph(0.23, 16, 10), velvet, { p: [0, 1.18, -0.22], s: [1, 0.3, 0.25], outline: false });
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.2], [0.18, 0.2]]) add(g, cyl(0.022, 0.016, 0.44, 8), wood, { p: [x, 0.22, z], outline: false });
  },
  rest_cart(g) { serviceCart(g, false); },
  rest_cart_cloth(g) { serviceCart(g, true); },
  rest_dessert_cart(g) {
    serviceCart(g, true);
    for (let i = 0; i < 3; i++) { add(g, cyl(0.08, 0.08, 0.1, 16), toon(['#ffb3d9', '#7a4a2a', '#fff3c4'][i]), { p: [-0.22 + i * 0.22, 0.98, 0] }); add(g, sph(0.02, 8, 6), toon('#e0283a'), { p: [-0.22 + i * 0.22, 1.05, 0], outline: false }); }
  },
  rest_bar_counter(g) {
    add(g, box(1.9, 1.0, 0.6), toon('#3a2216'), { p: [0, 0.5, 0] });
    for (let i = 0; i < 5; i++) add(g, box(0.34, 0.8, 0.02), toon('#4a2e1c'), { p: [-0.76 + i * 0.38, 0.5, 0.305], outline: false });
    add(g, box(2.0, 0.06, 0.72), toon('#1d1b22'), { p: [0, 1.03, 0.04] });
    add(g, cyl(0.02, 0.02, 1.9, 8), shiny('#d4af37'), { p: [0, 0.12, 0.36], r: [0, 0, Math.PI / 2], outline: false });
  },
  rest_divider(g) {
    // a wooden lattice screen to split up a dining room
    const wood = toon('#6e4424');
    for (const x of [-0.95, 0, 0.95]) add(g, box(0.06, 1.8, 0.06), wood, { p: [x, 0.9, 0] });
    for (let i = 0; i < 9; i++) add(g, box(1.9, 0.03, 0.03), wood, { p: [0, 0.15 + i * 0.2, 0], outline: false });
    for (let i = 0; i < 10; i++) add(g, box(0.03, 1.7, 0.03), wood, { p: [-0.86 + i * 0.19, 0.9, 0], outline: false });
  },
  rest_coat_rack(g) {
    const wood = toon('#3a2216');
    add(g, cyl(0.03, 0.035, 1.7, 10), wood, { p: [0, 0.85, 0] });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; add(g, cyl(0.015, 0.015, 0.35, 6), wood, { p: [Math.cos(a) * 0.14, 0.12, Math.sin(a) * 0.14], r: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8], outline: false }); add(g, cyl(0.012, 0.012, 0.16, 6), wood, { p: [Math.cos(a) * 0.07, 1.58, Math.sin(a) * 0.07], r: [Math.sin(a) * -0.9, 0, Math.cos(a) * 0.9], outline: false }); }
    add(g, box(0.3, 0.5, 0.12), toon('#8f1530'), { p: [0.1, 1.3, 0.05], r: [0, 0.4, 0.1] });
  },
  rest_champagne_stand(g) { add(g, cyl(0.15, 0.18, 0.02, 16), shiny('#d4af37'), { p: [0, 0.01, 0] }); add(g, cyl(0.015, 0.015, 0.7, 8), shiny('#d4af37'), { p: [0, 0.36, 0], outline: false }); add(g, cyl(0.14, 0.1, 0.22, 18), shiny('#d8dce4', { metalness: 0.8, roughness: 0.2 }), { p: [0, 0.82, 0] }); add(g, cyl(0.03, 0.035, 0.26, 12), toon('#1f3a22'), { p: [0.02, 0.95, 0], r: [0, 0, 0.2] }); },
  kitchen_island(g) {
    add(g, box(1.9, 0.86, 0.9), toon('#e4dcc8'), { p: [0, 0.43, 0] });
    for (const sx of [-1, 1]) add(g, box(0.1, 0.86, 0.1), toon('#d6ceba'), { p: [sx * 0.93, 0.43, 0.43], outline: false });
    for (let i = 0; i < 3; i++) add(g, box(0.5, 0.6, 0.02), toon('#d6ceba'), { p: [-0.6 + i * 0.6, 0.42, 0.455], outline: false });
    add(g, box(2.02, 0.06, 1.0), new THREE.MeshToonMaterial({ map: marbleTop() }), { p: [0, 0.89, 0] });
  },
  // ---- lights hanging from the ceiling ----
  pendant_bell(g, A) { add(g, cyl(0.008, 0.008, 0.9, 5), toon('#1d1b22'), { p: [0, -0.45, 0], outline: false }); add(g, cyl(0.06, 0.06, 0.1, 12), toon('#1d1b22'), { p: [0, -0.92, 0] }); return pendantShade(g, A, -1.06, geo('bellShade', () => new THREE.LatheGeometry([[0.03, 0.14], [0.08, 0.1], [0.12, 0.02], [0.15, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 20)), '#fffaf0', -1.12); },
  pendant_globe(g, A) { add(g, cyl(0.006, 0.006, 0.9, 5), shiny('#d4af37'), { p: [0, -0.45, 0], outline: false }); return pendantShade(g, A, -1.05, sph(0.16, 18, 14), '#fff6dc', -1.05, true); },
  pendant_cage(g, A) { add(g, cyl(0.008, 0.008, 0.8, 5), toon('#1d1b22'), { p: [0, -0.4, 0], outline: false }); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; add(g, cyl(0.006, 0.006, 0.26, 4), toon('#1d1b22'), { p: [Math.cos(a) * 0.1, -0.95, Math.sin(a) * 0.1], outline: false }); } for (const y of [-0.82, -1.08]) add(g, new THREE.TorusGeometry(0.1, 0.006, 4, 16), toon('#1d1b22'), { p: [0, y, 0], r: [Math.PI / 2, 0, 0], outline: false }); return pendantShade(g, A, -0.95, sph(0.05, 10, 8), '#ffe6a8', -0.95, true); },
  pendant_rattan(g, A) { add(g, cyl(0.008, 0.008, 0.7, 5), toon('#8b5a2b'), { p: [0, -0.35, 0], outline: false }); return pendantShade(g, A, -0.85, new THREE.SphereGeometry(0.22, 16, 10, 0, TAU, 0, Math.PI * 0.55), '#c9955a', -0.95); },
  pendant_trio(g, A) { add(g, box(1.6, 0.04, 0.08), toon('#1d1b22'), { p: [0, -0.02, 0] }); let res; for (const x of [-0.6, 0, 0.6]) { add(g, cyl(0.006, 0.006, 0.7, 5), toon('#1d1b22'), { p: [x, -0.37, 0], outline: false }); res = pendantShade(g, A, -0.78, cone(0.13, 0.16, 18), '#1d1b22', -0.86, false, x); } return res; },
  chandelier_crystal(g, A) {
    add(g, cyl(0.01, 0.01, 0.5, 5), shiny('#d4af37'), { p: [0, -0.25, 0], outline: false });
    const crystal = new THREE.MeshStandardMaterial({ color: '#eaf6ff', transparent: true, opacity: 0.75, metalness: 0.3, roughness: 0.05 });
    for (const [y, r, n] of [[-0.55, 0.32, 10], [-0.72, 0.22, 8], [-0.88, 0.12, 6]]) { add(g, new THREE.TorusGeometry(r, 0.012, 6, 24), shiny('#d4af37'), { p: [0, y, 0], r: [Math.PI / 2, 0, 0], outline: false }); for (let i = 0; i < n; i++) { const a = (i / n) * TAU; add(g, geo('crys', () => new THREE.OctahedronGeometry(0.035)), crystal, { p: [Math.cos(a) * r, y - 0.07, Math.sin(a) * r], s: [1, 1.8, 1], outline: false }); } }
    return pendantShade(g, A, -0.7, sph(0.06, 10, 8), '#fff6dc', -0.7, true);
  },
  recessed_light(g, A) { add(g, cyl(0.12, 0.12, 0.02, 20), toon('#f4f4f2'), { p: [0, -0.01, 0], outline: false }); return pendantShade(g, A, -0.025, cyl(0.08, 0.08, 0.01, 18), '#fffaf0', -0.2, true); },
  bed_canopy(g) {
    add(g, new THREE.TorusGeometry(0.3, 0.015, 6, 24), toon('#f4f0e8'), { p: [0, -0.5, 0], r: [Math.PI / 2, 0, 0] });
    add(g, cyl(0.006, 0.006, 0.5, 4), toon('#f4f0e8'), { p: [0, -0.25, 0], outline: false });
    add(g, new THREE.ConeGeometry(1.0, 1.9, 24, 1, true).translate(0, -0.95, 0), new THREE.MeshToonMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), { p: [0, -0.4, 0], outline: false, cast: false });
  },
  // ---- lamps on the floor ----
  lamp_arc_floor(g, A) { add(g, cyl(0.16, 0.16, 0.05, 18), toon('#d8d2c8'), { p: [0, 0.025, 0] }); const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 2.2, 0.1), new THREE.Vector3(0, 1.75, 0.9)); add(g, new THREE.TubeGeometry(curve, 24, 0.015, 6, false), shiny('#c0c6d4', { metalness: 0.6 }), { outline: false }); return lampShade(g, A, 0.9, 1.6, 0.06, 0.2, 0.16, '#f4f0e8', true); },
  lamp_tripod(g, A) { for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; add(g, cyl(0.015, 0.015, 1.4, 6), toon('#8b5a2b'), { p: [Math.cos(a) * 0.12, 0.68, Math.sin(a) * 0.12], r: [Math.sin(a) * 0.17, 0, -Math.cos(a) * 0.17], outline: false }); } return lampShade(g, A, 0, 1.42, 0.16, 0.2, 0.26, '#f4f0e8'); },
  lamp_paper(g, A) { add(g, cyl(0.12, 0.12, 0.03, 14), toon('#2a1a12'), { p: [0, 0.015, 0] }); add(g, cyl(0.012, 0.012, 0.4, 6), toon('#2a1a12'), { p: [0, 0.2, 0], outline: false }); const shade = toon('#fff6e0').clone(); shade.emissive = new THREE.Color('#ffd27a'); shade.emissiveIntensity = 0.6; add(g, cyl(0.16, 0.16, 0.9, 16), shade, { p: [0, 0.85, 0] }); const light = new THREE.PointLight(0xffd79a, 1.4, 4, 1.6); light.position.y = 0.9; g.add(light); let on = true; return { use: () => { on = !on; light.visible = on; shade.emissiveIntensity = on ? 0.6 : 0; } }; },
  lamp_globe_floor(g, A) { add(g, cyl(0.14, 0.14, 0.03, 16), shiny('#d4af37'), { p: [0, 0.015, 0] }); add(g, cyl(0.012, 0.012, 1.2, 6), shiny('#d4af37'), { p: [0, 0.6, 0], outline: false }); return pendantShade(g, A, 1.32, sph(0.15, 18, 14), '#fff6dc', 1.32, true); },
  // ---- curtains over windows, bookshelves, string lights ----
  curtain_white(g) { curtainPair(g, '#f4f0e8', 1, '#a8723f'); },
  curtain_sheer(g) { curtainPair(g, '#ffffff', 0.5, '#d8d2c8'); },
  curtain_linen(g) { curtainPair(g, '#d8ccb4', 1, '#5a3a24'); },
  curtain_grey(g) { curtainPair(g, '#8a8f9a', 1, '#1d1b22'); },
  curtain_velvet(g) { curtainPair(g, '#8f1530', 1, '#d4af37', true); },
  curtain_green(g) { curtainPair(g, '#1f4a33', 1, '#d4af37', true); },
  curtain_navy(g) { curtainPair(g, '#26355e', 1, '#c0c6d4'); },
  curtain_blush(g) { curtainPair(g, '#f2b8c9', 1, '#ffffff'); },
  curtain_black(g) { curtainPair(g, '#1e1f24', 1, '#1e1f24'); },
  curtain_mustard(g) { curtainPair(g, '#d9a53a', 1, '#5a3a24'); },
  string_lights(g, A) {
    const bulbs = [];
    const pts = []; for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push(new THREE.Vector3(-0.95 + u * 1.9, -(Math.sin(u * Math.PI * 2) ** 2) * 0.12, 0.03)); }
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.004, 4, false), toon('#2a2a2e'), { outline: false });
    for (let i = 1; i < 20; i += 2) bulbs.push(add(g, sph(0.022, 8, 6), basic('#fff0b8'), { p: [pts[i].x, pts[i].y - 0.025, 0.03], outline: false, cast: false }));
    A.anim.push((t) => { bulbs.forEach((b, i) => b.scale.setScalar(0.9 + Math.sin(t * 2 + i) * 0.12)); return false; });
  },
  floating_shelf(g) {
    add(g, box(0.9, 0.05, 0.22), toon('#a8723f'), { p: [0, -0.1, 0.11] });
    add(g, cyl(0.05, 0.04, 0.09, 12), toon('#e8e2d8'), { p: [-0.3, -0.03, 0.11] });
    for (let i = 0; i < 5; i++) add(g, cone(0.015, 0.06, 4), toon('#5aa87a'), { p: [-0.3 + Math.cos(i) * 0.02, 0.03, 0.11 + Math.sin(i) * 0.02], outline: false });
    [['#e8e2d0', 0.16], ['#1d1b22', 0.14], ['#c9955a', 0.15]].forEach(([c, h], i) => add(g, box(0.035, h, 0.15), toon(c), { p: [0.05 + i * 0.04, -0.075 + h / 2, 0.11] }));
    add(g, box(0.12, 0.14, 0.02), toon('#1d1b22'), { p: [0.32, -0.005, 0.05], r: [-0.12, 0, 0] });
  },
  bookshelf_cube(g) {
    // a tall white cubby shelving unit with books, baskets and decor
    const white = toon('#f4f4f2');
    add(g, box(1.9, 2.0, 0.4), white, { p: [0, 1.0, -0.28] });
    for (let r = 0; r <= 4; r++) add(g, box(1.9, 0.04, 0.42), white, { p: [0, 0.02 + r * 0.49, -0.27], outline: false });
    for (const x of [-0.95, -0.32, 0.32, 0.95]) add(g, box(0.04, 2.0, 0.42), white, { p: [x, 1.0, -0.27], outline: false });
    add(g, box(1.86, 1.96, 0.02), toon('#e8e8e4'), { p: [0, 1.0, -0.47], outline: false });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const x0 = -0.63 + c * 0.63, y0 = 0.06 + r * 0.49, kind = (r * 3 + c) % 4;
      if (kind === 0) for (let k = 0; k < 6; k++) add(g, box(0.04, 0.28 + (k % 3) * 0.04, 0.24), toon(['#1d1b22', '#e8e2d0', '#c9955a', '#8a8f9a'][k % 4]), { p: [x0 - 0.16 + k * 0.05, y0 + 0.15 + (k % 3) * 0.02, -0.22], outline: false });
      else if (kind === 1) add(g, box(0.4, 0.24, 0.28), toon('#c9a77a'), { p: [x0, y0 + 0.12, -0.22] });
      else if (kind === 2) { add(g, cyl(0.07, 0.06, 0.14, 12), toon('#e8e2d8'), { p: [x0, y0 + 0.07, -0.22] }); for (let k = 0; k < 6; k++) add(g, cone(0.025, 0.12, 4), toon('#4a8a5a'), { p: [x0 + Math.cos(k) * 0.03, y0 + 0.2, -0.22 + Math.sin(k) * 0.03], r: [Math.sin(k) * 0.4, 0, Math.cos(k) * 0.4], outline: false }); }
      else for (let k = 0; k < 3; k++) add(g, box(0.28 - k * 0.03, 0.04, 0.2), toon(['#26355e', '#e8e2d0', '#7a2a2a'][k]), { p: [x0, y0 + 0.02 + k * 0.04, -0.22], outline: false });
    }
  },
  // ---- plants ----
  plant_monstera(g) {
    pot(g, 0.22, 0.38, '#f1ece4');
    const leaf = toon('#2f8a3e', { side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, len = 0.45 + (i % 3) * 0.12;
      add(g, cyl(0.012, 0.012, len, 5), toon('#3f9a4a'), { p: [Math.cos(a) * 0.1, 0.38 + len / 2, Math.sin(a) * 0.1], r: [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45], outline: false });
      add(g, geo('monsteraLeaf', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.22, 0.05, 0.25, 0.3, 0, 0.42); s.bezierCurveTo(-0.25, 0.3, -0.22, 0.05, 0, 0); return new THREE.ShapeGeometry(s, 8); }), leaf,
        { p: [Math.cos(a) * (0.1 + len * 0.45), 0.38 + len * 0.9, Math.sin(a) * (0.1 + len * 0.45)], r: [-0.9, -a + Math.PI / 2, 0], outline: false });
    }
  },
  plant_cactus(g) {
    pot(g, 0.18, 0.28, '#c96b2c');
    const green = toon('#4caf50');
    add(g, capsuleGeo(0.11, 0.5), green, { p: [0, 0.62, 0] });
    add(g, capsuleGeo(0.06, 0.18), green, { p: [0.16, 0.62, 0] });
    add(g, capsuleGeo(0.06, 0.14), green, { p: [-0.15, 0.7, 0] });
    add(g, sph(0.05, 10, 8), toon('#ff5d8f'), { p: [0, 0.96, 0], outline: false });
  },
  plant_snake(g) {
    pot(g, 0.17, 0.32, '#2b2f4a');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, h = 0.5 + (i % 3) * 0.14;
      add(g, geo(`snakeLeaf${h}`, () => { const s = new THREE.Shape(); s.moveTo(-0.045, 0); s.quadraticCurveTo(-0.06, h * 0.6, 0, h); s.quadraticCurveTo(0.06, h * 0.6, 0.045, 0); return new THREE.ShapeGeometry(s, 6); }),
        toon(i % 2 ? '#3a7d3a' : '#5a9a3a', { side: THREE.DoubleSide }), { p: [Math.cos(a) * 0.06, 0.32, Math.sin(a) * 0.06], r: [Math.sin(a) * 0.12, -a, Math.cos(a) * 0.12], outline: false });
    }
  },
  plant_fern(g) {
    add(g, cyl(0.2, 0.16, 0.5, 16), toon('#e8e2f4'), { p: [0, 0.25, 0] });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      add(g, sph(0.1, 10, 8), toon(i % 2 ? '#56c262' : '#3fa34d'), { p: [Math.cos(a) * 0.24, 0.55, Math.sin(a) * 0.24], s: [0.6, 0.35, 2.6], r: [0.5, -a + Math.PI / 2, 0], outline: false });
    }
  },
  plant_succulents(g) {
    add(g, box(0.7, 0.14, 0.26), toon('#f1ece4'), { p: [0, 0.07, 0] });
    ['#7fbf8f', '#a7d3a0', '#c9a0d8', '#6fae9a'].forEach((c, i) => {
      const x = -0.24 + i * 0.16;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; add(g, sph(0.035, 8, 6), toon(c), { p: [x + Math.cos(a) * 0.035, 0.17, Math.sin(a) * 0.035], s: [0.8, 1.4, 0.6], r: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6], outline: false }); }
    });
  },
  plant_bonsai(g) {
    add(g, box(0.5, 0.1, 0.32), toon('#3a5a8a'), { p: [0, 0.05, 0] });
    const pts = [[0, 0.1, 0], [0.04, 0.25, 0], [-0.06, 0.36, 0], [0.05, 0.48, 0]].map((v) => new THREE.Vector3(...v));
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.03, 6), toon('#6e4424'), { outline: false });
    for (const [x, y, z, r] of [[0.06, 0.52, 0, 0.12], [-0.12, 0.42, 0.02, 0.09], [0.15, 0.4, -0.02, 0.08]]) add(g, sph(r, 12, 10), toon('#3f9a4a'), { p: [x, y, z], s: [1.3, 0.6, 1] });
  },
  hanging_plant_short(g, A, { drop = 0 } = {}) { hangingPlant(g, 0.3 + drop); },
  hanging_plant_long(g, A, { drop = 0 } = {}) { hangingPlant(g, 1.1 + drop); },

  // ---- gaming ----
  gaming_desk(g, A) {
    const black = toon('#1d1b2e');
    add(g, box(1.8, 0.06, 0.7), black, { p: [0, 0.74, -0.08] });
    for (const s of [-1, 1]) add(g, box(0.06, 0.72, 0.6), black, { p: [s * 0.84, 0.37, -0.08] });
    const rgb = new THREE.MeshBasicMaterial({ color: '#ff4fd8' });
    add(g, box(1.74, 0.02, 0.02), rgb, { p: [0, 0.71, 0.27], outline: false, cast: false });
    // two monitors with live screens
    const screens = [];
    for (const s of [-1, 1]) {
      add(g, box(0.08, 0.2, 0.08), black, { p: [s * 0.38, 0.87, -0.32], outline: false });
      add(g, box(0.76, 0.46, 0.04), black, { p: [s * 0.38, 1.18, -0.33], r: [0, -s * 0.18, 0] });
      const screen = liveScreen(128, 72, (ctx, t, i) => {
        if (i) { ctx.fillStyle = '#0b0a24'; ctx.fillRect(0, 0, 128, 72); ctx.fillStyle = '#6ee7a0'; for (let k = 0; k < 8; k++) ctx.fillRect(6, 6 + k * 8, 20 + ((k * 37 + Math.floor(t * 3)) % 90), 4); return; }
        const sky = ctx.createLinearGradient(0, 0, 0, 72); sky.addColorStop(0, '#39c6ff'); sky.addColorStop(1, '#b8f0ff');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, 128, 72);
        ctx.fillStyle = '#5fae55'; ctx.fillRect(0, 54, 128, 18);
        ctx.fillStyle = '#ffd84d'; const x = ((t * 40) % 150) - 10; ctx.fillRect(x, 42 - Math.abs(Math.sin(t * 5)) * 14, 10, 12);
      });
      screens.push((t) => screen.redraw(t, s > 0));
      add(g, plane(0.7, 0.4), new THREE.MeshBasicMaterial({ map: screen.tex }), { p: [s * 0.38 + s * -0.004, 1.18, -0.307], r: [0, -s * 0.18, 0], outline: false, cast: false });
    }
    add(g, box(0.55, 0.025, 0.16), toon('#2b2f4a'), { p: [-0.05, 0.785, 0.08], outline: false });
    const keys = new THREE.MeshBasicMaterial({ color: '#39e6ff' });
    add(g, box(0.5, 0.01, 0.12), keys, { p: [-0.05, 0.8, 0.08], outline: false, cast: false });
    add(g, box(0.36, 0.01, 0.28), toon('#2b2f4a'), { p: [0.42, 0.775, 0.06], outline: false });
    add(g, sph(0.04, 10, 8), black, { p: [0.42, 0.79, 0.06], s: [0.8, 0.5, 1.2], outline: false });
    // the tower, glowing through its glass side
    add(g, box(0.24, 0.5, 0.48), black, { p: [0.68, 0.25, -0.08] });
    const fan = new THREE.MeshBasicMaterial({ color: '#39e6ff' });
    add(g, cyl(0.07, 0.07, 0.01, 16), fan, { p: [0.56, 0.32, -0.08], r: [0, 0, Math.PI / 2], outline: false, cast: false });
    let party = 0;
    A.anim.push((t, dt) => {
      party = Math.max(0, party - dt);
      const h = (t * (party ? 0.6 : 0.08)) % 1;
      rgb.color.setHSL(h, 0.9, 0.6); keys.color.setHSL((h + 0.33) % 1, 0.9, 0.6); fan.color.setHSL((h + 0.66) % 1, 0.9, 0.6);
      screens.forEach((f) => f(t));
      return false;
    });
    return { use: () => { party = 3; floatEmoji(g, A, '🎮', 1.6, 2); } };
  },
  gaming_chair(g) {
    const black = toon('#1d1b2e'), red = toon('#e0463c');
    add(g, cyl(0.28, 0.28, 0.04, 5), black, { p: [0, 0.08, 0] });
    add(g, cyl(0.03, 0.03, 0.36, 8), shiny('#c0c6d4'), { p: [0, 0.27, 0], outline: false });
    add(g, box(0.52, 0.1, 0.5), black, { p: [0, 0.48, 0.02] });
    add(g, box(0.36, 0.04, 0.4), red, { p: [0, 0.54, 0.03], outline: false });
    add(g, box(0.54, 0.85, 0.12), black, { p: [0, 0.95, -0.24], r: [-0.08, 0, 0] });
    add(g, box(0.18, 0.7, 0.13), red, { p: [0, 0.92, -0.22], r: [-0.08, 0, 0], outline: false });
    add(g, box(0.3, 0.12, 0.08), red, { p: [0, 1.32, -0.18], r: [-0.08, 0, 0] });
    for (const s of [-1, 1]) add(g, box(0.06, 0.06, 0.34), black, { p: [s * 0.28, 0.68, 0.02] });
  },

  // ---- the music corner ----
  piano_bench(g) {
    const black = shiny('#15131f', { metalness: 0.2, roughness: 0.2 });
    add(g, box(0.9, 0.08, 0.38), black, { p: [0, 0.46, 0] });
    add(g, box(0.86, 0.04, 0.34), toon('#8f1530'), { p: [0, 0.51, 0], outline: false });
    for (const x of [-0.4, 0.4]) for (const z of [-0.15, 0.15]) add(g, box(0.05, 0.43, 0.05), black, { p: [x, 0.215, z], outline: false });
  },
  guitar(g, A) {
    // an acoustic guitar on a little stand
    add(g, box(0.3, 0.04, 0.25), toon('#1d1b2e'), { p: [0, 0.02, 0] });
    const body = new THREE.Group();
    body.position.set(0, 0.06, 0.02);
    body.rotation.x = -0.15;
    g.add(body);
    const wood = toon('#d9964a');
    add(body, cyl(0.2, 0.2, 0.1, 24), wood, { p: [0, 0.22, 0], r: [Math.PI / 2, 0, 0] });
    add(body, cyl(0.16, 0.16, 0.1, 24), wood, { p: [0, 0.5, 0], r: [Math.PI / 2, 0, 0] });
    add(body, cyl(0.06, 0.06, 0.02, 16), basic('#3a2414'), { p: [0, 0.48, 0.055], r: [Math.PI / 2, 0, 0], outline: false });
    add(body, box(0.06, 0.6, 0.04), toon('#6e4424'), { p: [0, 0.92, 0.01] });
    add(body, box(0.09, 0.14, 0.04), toon('#6e4424'), { p: [0, 1.26, 0.01] });
    return { use: () => floatEmoji(g, A, '🎸', 1.3, 3) };
  },

  // ---- bits and bobs ----
  candles(g, A) {
    const flames = [];
    [[-0.12, 0.3, 0.02], [0.06, 0.2, -0.08], [0.14, 0.14, 0.1]].forEach(([x, h, z]) => {
      add(g, cyl(0.05, 0.05, h, 14), toon('#fff6e0'), { p: [x, h / 2, z] });
      const f = new THREE.Sprite(additive(flameTexture, 0xffd27a, 0.9));
      f.scale.set(0.08, 0.13, 1); f.position.set(x, h + 0.06, z);
      g.add(f); flames.push(f);
    });
    const light = new THREE.PointLight(0xffb45a, 1.2, 3, 1.8);
    light.position.y = 0.4;
    g.add(light);
    let on = true;
    A.anim.push((t) => { flames.forEach((f, i) => { f.visible = on; f.scale.y = 0.13 + Math.sin(t * 11 + i * 2) * 0.02; }); light.visible = on; return false; });
    return { use: () => { on = !on; } };
  },
  laundry_basket(g) {
    add(g, cyl(0.26, 0.22, 0.45, 16, true), toon('#d8bd88', { side: THREE.DoubleSide }), { p: [0, 0.225, 0] });
    add(g, cyl(0.21, 0.21, 0.02, 16), toon('#a8723f'), { p: [0, 0.02, 0], outline: false });
    [['#39c6ff', 0.4, 0.05], ['#ff5d73', 0.43, -0.08], ['#ffd84d', 0.45, 0.1], ['#f4f4f4', 0.48, -0.02]].forEach(([c, y, x], i) => add(g, sph(0.13, 10, 8), toon(c), { p: [x, y, (i % 2 - 0.5) * 0.12], s: [1.2, 0.55, 1], r: [0, i, 0.2] }));
    add(g, box(0.1, 0.4, 0.04), toon('#23263f'), { p: [0.24, 0.42, 0.06], r: [0.3, 0, -0.5] }); // a sock hanging out
  },
  trash_can(g, A) {
    add(g, cyl(0.17, 0.14, 0.45, 18), shiny('#c0c6d4', { metalness: 0.5 }), { p: [0, 0.225, 0] });
    const lid = add(g, cyl(0.18, 0.18, 0.04, 18), shiny('#9aa3b5', { metalness: 0.5 }), { p: [0, 0.47, 0] });
    let open = 0;
    A.anim.push((t, dt) => { open = Math.max(0, open - dt); lid.rotation.x = -Math.min(1, open) * 1.1; lid.position.z = -Math.min(1, open) * 0.12; return false; });
    return { use: () => { open = 1.4; floatEmoji(g, A, '🗑️', 0.8, 1); } };
  },
  coat_rack(g) {
    const wood = toon(DARK_WOOD);
    add(g, cyl(0.03, 0.03, 1.7, 8), wood, { p: [0, 0.85, 0] });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; add(g, cyl(0.02, 0.02, 0.32, 6), wood, { p: [Math.cos(a) * 0.12, 0.1, Math.sin(a) * 0.12], r: [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1], outline: false }); }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; add(g, cyl(0.015, 0.015, 0.18, 6), wood, { p: [Math.cos(a) * 0.07, 1.62, Math.sin(a) * 0.07], r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], outline: false }); }
    add(g, box(0.36, 0.6, 0.1), toon('#3b6fd0'), { p: [0.1, 1.3, 0.05], r: [0, 0, 0.1] }); // a jacket
    add(g, sph(0.14, 12, 10), toon('#e0463c'), { p: [-0.12, 1.66, 0], s: [1, 0.55, 1] }); // a hat
  },
  book_stack(g) {
    bookStack(g, 0, 0, 0, 6, ['#e0463c', '#39c6ff', '#ffd84d', '#6ee7a0', '#b77bff', '#ff9f43'], 0.42);
  },

  // ---- on the walls ----
  deer_mount(g, A) {
    // a friendly (fake!) deer head on a wooden plaque
    const fur = toon('#a8693a'), light = toon('#e8c79a'), antler = toon('#e8dcc0');
    add(g, cyl(0.28, 0.28, 0.05, 6), toon(DARK_WOOD), { p: [0, 0, 0.025], r: [Math.PI / 2, 0, 0], s: [1, 1, 1.3] });
    add(g, cyl(0.12, 0.15, 0.26, 14), fur, { p: [0, -0.04, 0.14], r: [Math.PI / 2 - 0.3, 0, 0] });
    const head = add(g, sph(0.15, 16, 12), fur, { p: [0, 0.06, 0.3], s: [0.9, 0.95, 1.2] });
    add(head, sph(0.08, 12, 10), light, { p: [0, -0.06, 0.13], s: [1, 0.8, 1], outline: false });
    add(head, sph(0.03, 8, 6), basic('#1d1b2e'), { p: [0, -0.04, 0.2], outline: false });
    for (const s of [-1, 1]) {
      add(head, sph(0.025, 8, 6), basic('#1d1b2e'), { p: [s * 0.08, 0.04, 0.09], outline: false });
      add(head, sph(0.06, 10, 8), fur, { p: [s * 0.14, 0.1, -0.02], s: [1.6, 0.6, 0.4], r: [0, 0, s * 0.4] });
      const pts = [[0.06, 0.12, 0], [0.12, 0.3, -0.02], [0.18, 0.45, -0.04]].map(([x, y, z]) => new THREE.Vector3(s * x, y, z));
      add(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.018, 6), antler, { outline: false });
      for (const [y, dx] of [[0.25, 0.09], [0.36, -0.02]]) add(head, cone(0.014, 0.12, 6), antler, { p: [s * (0.1 + dx * 0.5), y + 0.05, -0.02], r: [0, 0, -s * (dx > 0 ? 0.9 : -0.3)], outline: false });
    }
    return { use: () => floatEmoji(g, A, '🦌', 0.5, 1) };
  },
  cutout_gojo(g, A) {
    // a life-size cardboard cutout of everyone's favourite blindfolded sorcerer, on a cardboard stand
    // (the print is unlit, like a glossy poster; the cardboard back takes the room's light)
    const front = new THREE.MeshBasicMaterial({ map: gojoTex(false), transparent: true, alphaTest: 0.5, color: '#f4f4f4' });
    const back = new THREE.MeshToonMaterial({ map: gojoTex(true), transparent: true, alphaTest: 0.5 });
    const H = 2.35, W = H * (GOJO_W / GOJO_H);
    add(g, plane(W, H), front, { p: [0, H / 2 + 0.02, 0.012], outline: false });
    add(g, plane(W, H), back, { p: [0, H / 2 + 0.02, -0.012], r: [0, Math.PI, 0], outline: false });

    add(g, box(0.5, 0.03, 0.3), toon('#b8895a'), { p: [0, 0.015, -0.1], outline: false });
    add(g, box(0.04, 0.8, 0.02), toon('#b8895a'), { p: [0, 0.4, -0.18], r: [-0.4, 0, 0], outline: false });
    return { use: () => floatEmoji(g, A, '🤞', 2.0, 1) };
  },
};

// ---- the Nature set: logs, moss, mushrooms, flowers and a little pond ----
const BARK = '#7a4f2e', MOSS = '#5f9e3a', MOSS_LIGHT = '#7fbf4a';
function mossTufts(g, pts, size = 0.08) {
  pts.forEach(([x, y, z], i) => add(g, sph(size * (0.8 + (i % 3) * 0.2), 10, 8), toon(i % 2 ? MOSS : MOSS_LIGHT), { p: [x, y, z], s: [1.3, 0.6, 1.1], outline: false }));
}
function logPiece(g, len, r, p, rot) {
  const m = add(g, cyl(r, r, len, 14), toon(BARK), { p, r: rot });
  for (const s of [-1, 1]) add(m, cyl(r * 0.94, r * 0.94, 0.012, 14), new THREE.MeshToonMaterial({ map: treeRingTex }), { p: [0, s * (len / 2 + 0.003), 0], outline: false });
  return m;
}
const treeRingTex = canvasTexture(64, 64, (ctx) => {
  ctx.fillStyle = '#e8c48a'; ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#b98a52'; ctx.lineWidth = 2;
  for (let r = 4; r < 32; r += 5) { ctx.beginPath(); ctx.arc(32 + (r % 3) - 1, 32, r, 0, TAU); ctx.stroke(); }
});
function flowerHead(g, x, y, z, color, s = 1) {
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; add(g, sph(0.035 * s, 8, 6), toon(color), { p: [x + Math.cos(a) * 0.04 * s, y, z + Math.sin(a) * 0.04 * s], s: [1, 0.5, 1], outline: false }); }
  add(g, sph(0.025 * s, 8, 6), toon('#ffd84d'), { p: [x, y + 0.01, z], outline: false });
}

Object.assign(FURNITURE, {
  log_bench(g) {
    logPiece(g, 1.8, 0.2, [0, 0.42, 0], [0, 0, Math.PI / 2]).scale.set(1, 1, 0.75);
    for (const x of [-0.65, 0.65]) logPiece(g, 0.4, 0.12, [x, 0.2, 0], [0, 0, 0]);
    logPiece(g, 1.7, 0.13, [0, 0.82, -0.24], [0.15, 0, Math.PI / 2]);
    for (const x of [-0.6, 0.6]) add(g, cyl(0.04, 0.05, 0.5, 6), toon(BARK), { p: [x, 0.62, -0.22], r: [0.15, 0, 0], outline: false });
    mossTufts(g, [[-0.7, 0.6, 0.05], [0.5, 0.6, -0.08], [0.82, 0.92, -0.24], [-0.3, 0.92, -0.25]]);
  },
  stump_table(g) {
    logPiece(g, 0.7, 0.36, [0, 0.35, 0], [0, 0, 0]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; add(g, cyl(0.06, 0.12, 0.25, 6), toon(BARK), { p: [Math.cos(a) * 0.36, 0.08, Math.sin(a) * 0.36], r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], outline: false }); }
    for (const [x, z, s] of [[0.32, 0.18, 1], [0.36, 0.05, 0.7]]) { add(g, cyl(0.015 * s, 0.02 * s, 0.1 * s, 6), toon('#f4ecd8'), { p: [x, 0.2, z], outline: false }); add(g, sph(0.05 * s, 10, 6), toon('#e0463c'), { p: [x, 0.25 * s + 0.02, z], s: [1, 0.6, 1] }); }
    mug(g, -0.08, 0.705, 0.05, '#6fae55');
    mossTufts(g, [[-0.25, 0.71, -0.15], [0.2, 0.71, -0.2]], 0.06);
  },
  stump_stool(g) {
    logPiece(g, 0.45, 0.22, [0, 0.225, 0], [0, 0, 0]);
    mossTufts(g, [[0.1, 0.46, 0.05], [-0.08, 0.46, -0.06]], 0.05);
  },
  mossy_rock(g) {
    add(g, geo('rock', () => { const r = new THREE.IcosahedronGeometry(0.4, 1); r.scale(1.2, 0.7, 1); return r; }), toon('#8d8aa6'), { p: [0, 0.26, 0] });
    add(g, geo('rockMoss', () => { const r = new THREE.SphereGeometry(0.42, 16, 8, 0, TAU, 0, 1.1); r.scale(1.2, 0.55, 1); return r; }), toon(MOSS), { p: [0, 0.27, 0], outline: false });
    flowerHead(g, 0.15, 0.56, 0.1, '#ffffff', 0.8); flowerHead(g, -0.2, 0.52, -0.05, '#b98bff', 0.8);
  },
  mushroom_lamp(g, A) {
    const cap = toon('#e0463c', { emissive: '#ff6a4a', emissiveIntensity: 0.35 }).clone();
    add(g, cyl(0.09, 0.13, 0.9, 12), toon('#f4ecd8'), { p: [0, 0.45, 0] });
    add(g, geo('mushCap', () => new THREE.SphereGeometry(0.42, 22, 12, 0, TAU, 0, Math.PI / 2)), cap, { p: [0, 0.86, 0], s: [1, 0.65, 1] });
    for (let i = 0; i < 7; i++) { const a = i * 2.3, r = 0.12 + (i % 3) * 0.09; add(g, sph(0.04, 8, 6), toon('#fff6e0'), { p: [Math.cos(a) * r, 0.86 + Math.sqrt(Math.max(0, 0.42 * 0.42 - r * r)) * 0.65, Math.sin(a) * r], s: [1, 0.4, 1], outline: false }); }
    add(g, sph(0.11, 10, 8), toon('#c9955a'), { p: [0.25, 0.07, 0.1], s: [1, 0.6, 1] }); // a baby mushroom
    add(g, cyl(0.03, 0.04, 0.1, 8), toon('#f4ecd8'), { p: [0.25, 0.04, 0.1], outline: false });
    const light = new THREE.PointLight(0xffa07a, 1.8, 4.5, 1.6);
    light.position.y = 0.7;
    g.add(light);
    let on = true;
    return { use: () => { on = !on; light.visible = on; cap.emissiveIntensity = on ? 0.35 : 0; } };
  },
  terrarium(g) {
    add(g, cyl(0.3, 0.32, 0.12, 20), toon(WOOD), { p: [0, 0.06, 0] });
    add(g, cyl(0.28, 0.28, 0.08, 20), toon('#6b4a2b'), { p: [0, 0.16, 0], outline: false });
    mossTufts(g, [[0, 0.21, 0], [0.12, 0.21, 0.08], [-0.1, 0.21, -0.1], [0.05, 0.21, -0.14]], 0.09);
    add(g, cyl(0.02, 0.02, 0.2, 6), toon('#3f9a4a'), { p: [-0.08, 0.3, 0.06], outline: false });
    flowerHead(g, -0.08, 0.41, 0.06, '#ff8fc7', 0.9);
    add(g, sph(0.06, 8, 6), toon('#9aa3b5'), { p: [0.1, 0.22, -0.05], outline: false });
    add(g, geo('dome', () => new THREE.SphereGeometry(0.3, 22, 14, 0, TAU, 0, Math.PI / 2)), new THREE.MeshStandardMaterial({ color: '#d8f6ff', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false }), { p: [0, 0.18, 0], s: [1, 1.5, 1], outline: false });
  },
  bamboo(g) {
    pot(g, 0.2, 0.3, '#2b2f4a');
    for (const [x, z, h] of [[0, 0, 1.6], [0.08, 0.07, 1.3], [-0.08, 0.05, 1.45], [0.03, -0.09, 1.15]]) {
      for (let k = 0; k < h / 0.3; k++) {
        add(g, cyl(0.03, 0.03, 0.28, 8), toon(k % 2 ? '#8fbf4a' : '#9fcf5a'), { p: [x, 0.44 + k * 0.3, z], outline: false });
        add(g, cyl(0.036, 0.036, 0.03, 8), toon('#6f9f3a'), { p: [x, 0.3 + k * 0.3 + 0.28, z], outline: false });
      }
      for (let k = 0; k < 3; k++) add(g, sph(0.05, 8, 6), toon('#5fae55'), { p: [x + Math.cos(k * 2) * 0.12, 0.3 + h - k * 0.25, z + Math.sin(k * 2) * 0.12], s: [0.4, 0.18, 2.4], r: [0, k * 2, 0.3], outline: false });
    }
  },
  sunflowers(g) {
    pot(g, 0.2, 0.32, '#d9964a');
    [[0, 1.25, 0], [0.12, 1.0, 0.06], [-0.12, 0.88, -0.04]].forEach(([x, h, z]) => {
      add(g, cyl(0.02, 0.025, h - 0.3, 6), toon('#4c8a3a'), { p: [x, 0.3 + (h - 0.3) / 2, z], outline: false });
      add(g, sph(0.07, 8, 6), toon('#4c8a3a'), { p: [x + 0.06, 0.3 + h * 0.4, z], s: [1.4, 0.3, 0.8], outline: false });
      const head = new THREE.Group(); head.position.set(x, h + 0.02, z + 0.02); head.rotation.x = -0.3; g.add(head);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; add(head, sph(0.05, 8, 6), toon('#ffc93d'), { p: [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0], s: [0.6, 1.4, 0.3], r: [0, 0, a - Math.PI / 2], outline: false }); }
      add(head, cyl(0.08, 0.08, 0.04, 14), toon('#5a3a1c'), { r: [Math.PI / 2, 0, 0] });
    });
  },
  flower_bed(g) {
    add(g, box(1.8, 0.4, 0.6), toon(WOOD), { p: [0, 0.2, 0] });
    add(g, box(1.7, 0.04, 0.5), toon('#4a2e1c'), { p: [0, 0.4, 0], outline: false });
    const cols = ['#ff8fc7', '#ffd84d', '#ffffff', '#b98bff', '#ff7a59'];
    for (let i = 0; i < 14; i++) {
      const x = -0.75 + (i % 7) * 0.25, z = i < 7 ? -0.1 : 0.12, h = 0.15 + (i % 3) * 0.06;
      add(g, cyl(0.012, 0.012, h, 5), toon('#4c8a3a'), { p: [x, 0.42 + h / 2, z], outline: false });
      flowerHead(g, x, 0.43 + h, z, cols[i % cols.length]);
    }
  },
  indoor_pond(g, A) {
    // a little koi pond: a ring of stones, water, lily pads and two fish going round
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; add(g, geo('pondStone', () => { const r = new THREE.IcosahedronGeometry(0.16, 0); r.scale(1.3, 0.7, 1); return r; }), toon(i % 2 ? '#9aa3b5' : '#b8b2c8'), { p: [Math.cos(a) * 0.82, 0.08, Math.sin(a) * 0.82], r: [0, -a, 0] }); }
    add(g, geo('pondWater', () => new THREE.CircleGeometry(0.78, 28)), new THREE.MeshStandardMaterial({ color: '#3fa8d8', roughness: 0.1, transparent: true, opacity: 0.85 }), { p: [0, 0.06, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
    for (const [x, z] of [[0.3, 0.2], [-0.35, -0.15], [0.05, -0.4]]) {
      add(g, geo('lily', () => new THREE.CircleGeometry(0.12, 12, 0.3, TAU - 0.6)), toon('#4caf50', { side: THREE.DoubleSide }), { p: [x, 0.07, z], r: [-Math.PI / 2, 0, x * 5], outline: false });
    }
    flowerHead(g, 0.3, 0.09, 0.2, '#ff9fe0', 0.8);
    const fish = ['#ff7a1e', '#ffffff'].map((c) => { const f = new THREE.Group(); add(f, sph(0.06, 10, 8), toon(c), { s: [1, 0.6, 2], outline: false }); add(f, cone(0.04, 0.07, 6), toon(c), { p: [0, 0, -0.12], r: [-Math.PI / 2, 0, 0], outline: false }); g.add(f); return f; });
    A.anim.push((t) => { fish.forEach((f, i) => { const a = t * (0.6 + i * 0.25) + i * 2; f.position.set(Math.cos(a) * 0.45, 0.04, Math.sin(a) * 0.45); f.rotation.y = -a; }); return false; });
    return { use: () => floatEmoji(g, A, '🐟', 0.4, 2) };
  },
  leaf_rug(g) {
    add(g, plane(1.9, 1.9), new THREE.MeshToonMaterial({ map: leafRugTex, transparent: true, alphaTest: 0.5 }), { p: [0, 0.012, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
  },
  moss_rug(g) {
    add(g, geo('mossRug', () => new THREE.CircleGeometry(0.92, 40)), new THREE.MeshToonMaterial({ map: mossRugTex }), { p: [0, 0.014, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
  },
  hammock(g, A) {
    for (const x of [-0.85, 0.85]) { logPiece(g, 1.3, 0.06, [x, 0.65, 0], [0, 0, 0]); add(g, box(0.3, 0.05, 0.3), toon(BARK), { p: [x, 0.03, 0], outline: false }); }
    const net = geo('hammockNet', () => {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.001 + Math.sin(t * Math.PI) * 0.35, -0.8 + t * 1.6)); }
      const lg = new THREE.LatheGeometry(pts, 16, Math.PI / 2, Math.PI);
      lg.rotateZ(Math.PI / 2);
      return lg;
    });
    const hm = add(g, net, toon('#e8d6b8', { side: THREE.DoubleSide }), { p: [0, 0.75, 0] });
    for (const x of [-0.8, 0.8]) add(g, cyl(0.01, 0.01, 0.4, 4), toon('#c9b27a'), { p: [x * 0.97, 1.05, 0], r: [0, 0, x > 0 ? -0.6 : 0.6], outline: false });
    add(g, sph(0.12, 10, 8), toon('#9fcf5a'), { p: [-0.5, 0.62, 0], s: [1.2, 0.5, 1], outline: false }); // a cushion
    A.anim.push((t) => { hm.rotation.x = Math.sin(t * 1.2) * 0.06; return false; });
  },
  sofa_green(g, A) { return FURNITURE.sofa(g, A, { color: '#3f8a5a' }); },
  armchair_green(g, A) { return FURNITURE.sofa(g, A, { color: '#3f8a5a', w: 0.94 }); },
  // on the walls
  ivy_garland(g, A) {
    const leaves = [];
    for (let i = 0; i < 6; i++) {
      const x = -0.8 + i * 0.32, len = 0.5 + ((i * 7) % 4) * 0.15;
      add(g, cyl(0.012, 0.012, len, 4), toon('#4c8a3a'), { p: [x, 0.5 - len / 2, 0.05], outline: false });
      for (let k = 0; k < len / 0.12; k++) leaves.push(add(g, sph(0.05, 8, 6), toon(k % 2 ? '#5fae55' : '#7fbf4a'), { p: [x + (k % 2 ? 0.04 : -0.04), 0.5 - k * 0.12, 0.07], s: [1, 0.7, 0.3], outline: false }));
    }
    add(g, cyl(0.02, 0.02, 1.9, 6), toon('#5a3a1c'), { p: [0, 0.5, 0.05], r: [0, 0, Math.PI / 2], outline: false });
    A.anim.push((t) => { leaves.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.5 + i) * 0.15; }); return false; });
  },
  flower_box(g) {
    add(g, box(0.9, 0.22, 0.25), toon('#8b5a2b'), { p: [0, -0.1, 0.13] });
    add(g, box(0.84, 0.03, 0.2), toon('#4a2e1c'), { p: [0, 0.01, 0.13], outline: false });
    ['#ff7a9a', '#ffd84d', '#ffffff', '#b98bff', '#ff7a59'].forEach((c, i) => { add(g, cyl(0.01, 0.01, 0.14, 4), toon('#4c8a3a'), { p: [-0.32 + i * 0.16, 0.08, 0.13], outline: false }); flowerHead(g, -0.32 + i * 0.16, 0.16, 0.13, c); });
  },
  birdhouse(g, A) {
    add(g, box(0.12, 0.6, 0.06), toon('#8b5a2b'), { p: [0, -0.1, 0.03], outline: false });
    add(g, box(0.36, 0.36, 0.3), toon('#ff9f43'), { p: [0, 0.05, 0.2] });
    add(g, geo('birdRoof', () => { const r = new THREE.ConeGeometry(0.32, 0.22, 4); r.rotateY(Math.PI / 4); return r; }), toon('#3f8a5a'), { p: [0, 0.34, 0.2] });
    add(g, cyl(0.06, 0.06, 0.02, 12), basic('#2a1d16'), { p: [0, 0.07, 0.355], r: [Math.PI / 2, 0, 0], outline: false });
    add(g, cyl(0.012, 0.012, 0.1, 4), toon('#5a3a1c'), { p: [0, -0.04, 0.39], r: [Math.PI / 2, 0, 0], outline: false });
    const bird = new THREE.Group(); bird.position.set(0, 0.07, 0.36); g.add(bird);
    add(bird, sph(0.05, 10, 8), toon('#39c6ff'), { outline: false });
    add(bird, cone(0.015, 0.04, 6), toon('#ffb13b'), { p: [0, -0.01, 0.06], r: [Math.PI / 2, 0, 0], outline: false });
    let peek = 0;
    A.anim.push((t, dt) => { peek = Math.max(0, peek - dt); bird.position.z = 0.33 + Math.min(1, peek) * 0.06; bird.visible = peek > 0 || Math.sin(t * 0.4) > 0.7; return false; });
    return { use: () => { peek = 2.5; floatEmoji(g, A, '🐦', 0.4, 1); } };
  },
  moss_frame(g) {
    add(g, box(0.8, 0.8, 0.06), toon(WOOD), { p: [0, 0, 0.03] });
    add(g, box(0.66, 0.66, 0.04), toon(MOSS), { p: [0, 0, 0.05], outline: false });
    mossTufts(g, [[-0.15, 0.1, 0.08], [0.12, -0.1, 0.08], [0.15, 0.18, 0.08], [-0.18, -0.15, 0.08], [0, 0, 0.09]], 0.09);
    flowerHead(g, 0.18, -0.2, 0.1, '#ffffff', 0.8);
  },
  // hanging from the ceiling
  hanging_vines(g, A, { drop = 0 } = {}) {
    const leaves = [];
    add(g, cyl(0.25, 0.25, 0.06, 16), toon('#8b5a2b'), { p: [0, -0.03, 0], outline: false });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, len = 0.6 + drop + ((i * 5) % 3) * 0.25;
      const x = Math.cos(a) * 0.2, z = Math.sin(a) * 0.2;
      add(g, cyl(0.01, 0.01, len, 4), toon('#4c8a3a'), { p: [x, -len / 2, z], outline: false });
      for (let k = 1; k < len / 0.14; k++) leaves.push(add(g, sph(0.05, 8, 6), toon(k % 2 ? '#5fae55' : '#7fbf4a'), { p: [x + (k % 2 ? 0.035 : -0.035), -k * 0.14, z], s: [1, 0.6, 0.4], r: [0, a, 0], outline: false }));
    }
    A.anim.push((t) => { leaves.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.3 + i * 0.5) * 0.2; }); return false; });
  },
});
const leafRugTex = canvasTexture(256, 256, (ctx) => {
  ctx.translate(128, 128); ctx.rotate(-0.6);
  ctx.fillStyle = '#5fae55';
  ctx.beginPath(); ctx.moveTo(0, -120); ctx.bezierCurveTo(90, -60, 80, 70, 0, 120); ctx.bezierCurveTo(-80, 70, -90, -60, 0, -120); ctx.fill();
  ctx.strokeStyle = '#3f8a3a'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, -110); ctx.lineTo(0, 115); ctx.stroke();
  ctx.lineWidth = 4;
  for (let y = -80; y < 90; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(55, y - 30); ctx.moveTo(0, y); ctx.lineTo(-55, y - 30); ctx.stroke(); }
});
const mossRugTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#5f9e3a'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = i % 3 ? 'rgba(140,200,90,.35)' : 'rgba(40,90,30,.3)'; ctx.beginPath(); ctx.arc((i * 37) % 256, (i * 91) % 256, 2 + (i % 3), 0, TAU); ctx.fill(); }
  for (let i = 0; i < 18; i++) { ctx.fillStyle = ['#ffffff', '#ffd84d', '#ff9fe0'][i % 3]; ctx.beginPath(); ctx.arc((i * 71) % 256, (i * 113) % 256, 4, 0, TAU); ctx.fill(); }
});

// ---- walls for building rooms inside your house (the house papers them with its wallpaper) ----
Object.assign(FURNITURE, {
  // plain walls are dragged out to any length (len, in tiles). openings: [from, to] gaps along the wall
  // (in its own frame, -len/2..len/2) where a door has been put in it; caps: [left end, right end]
  // papered (an open end), or left bare (it butts up against another wall)
  room_wall(g, A, { len = 2, openings = [], caps = [true, true] } = {}) { roomWall(g, len, { openings, caps }); },
  room_wall_short(g, A, { len = 1, openings = [], caps = [true, true] } = {}) { roomWall(g, len, { openings, caps }); },
  // doors go into a wall like a picture goes on one: the wall opens up around them
  wdoor_arch(g, A, { len = 1.25 } = {}) { doorFrame(g, len); },
  wdoor_wood(g, A, { len = 1.25 } = {}) { doorFrame(g, len); return doorPanel(g, A, 'wood', len); },
  wdoor_glass(g, A, { len = 1.25 } = {}) { doorFrame(g, len); return doorPanel(g, A, 'glass', len); },
  wdoor_barn(g, A, { len = 1.25 } = {}) { doorFrame(g, len); return doorPanel(g, A, 'barn', len); },
  wdoor_white(g, A, { len = 1.25 } = {}) { doorFrame(g, len, '#f4f0ea'); return doorPanel(g, A, 'white', len); },
  wdoor_red(g, A, { len = 1.25 } = {}) { doorFrame(g, len, '#f4f0ea'); return doorPanel(g, A, 'red', len); },
  wdoor_shoji(g, A, { len = 1.25 } = {}) { doorFrame(g, len, '#6b4226'); return doorPanel(g, A, 'shoji', len); },
  wdoor_saloon(g, A, { len = 1.25 } = {}) { doorFrame(g, len); return doorPanel(g, A, 'saloon', len); },
  wdoor_beads(g, A, { len = 1.25 } = {}) { doorFrame(g, len, '#c9955a'); beadCurtain(g, A, len); },
  wdoor_round(g, A, { len = 1.25 } = {}) { archway(g, len, 'round'); },
  wdoor_stone(g, A, { len = 1.25 } = {}) { archway(g, len, 'stone'); },
  wdoor_wide(g, A, { len = 2.5 } = {}) { doorFrame(g, len); },
  wdoor_wide_arch(g, A, { len = 2.5 } = {}) { archway(g, len, 'round'); },
  // half walls, drawn out like walls: one up from the floor (a divider), one hanging from the ceiling
  room_halfwall(g, A, { len = 2, openings = [], caps = [true, true] } = {}) { roomWall(g, len, { openings, caps, top: HALF_H }); },
  room_hangwall(g, A, { len = 2, openings = [], caps = [true, true] } = {}) { roomWall(g, len, { openings, caps, bottom: ROOM_H - HANG_H }); },
  // (older houses' doorways, each in its own short stretch of wall)
  room_doorway(g) { roomWall(g, 2, { openings: [[-0.5, 0.5]] }); doorFrame(g, 1); },
  room_door(g, A) { roomWall(g, 2, { openings: [[-0.5, 0.5]] }); doorFrame(g, 1); return doorPanel(g, A, 'wood', 1); },
  room_door_glass(g, A) { roomWall(g, 2, { openings: [[-0.5, 0.5]] }); doorFrame(g, 1); return doorPanel(g, A, 'glass', 1); },
  room_door_barn(g, A) { roomWall(g, 2, { openings: [[-0.5, 0.5]] }); doorFrame(g, 1); return doorPanel(g, A, 'barn', 1); },
});
const ROOM_H = 3.2, ROOM_T = 0.25, DOOR_H = 2.2, HALF_H = 1.3, HANG_H = 1.0; // (the house's wall height, how thick these walls are: their whole footprint, so they meet flush; how tall a door is)
/** The wooden frame round a door opening `w` wide. */
function doorFrame(g, w, color = WOOD) {
  const wood = toon(color), edge = toon(shade(color, -0.15)), light = toon(shade(color, 0.12));
  // liners right through the wall's thickness, so the opening is finished inside
  for (const s of [-1, 1]) add(g, box(0.05, DOOR_H, ROOM_T + 0.01), wood, { p: [s * (w / 2 - 0.025), DOOR_H / 2, 0], outline: false });
  add(g, box(w, 0.05, ROOM_T + 0.01), wood, { p: [0, DOOR_H - 0.025, 0], outline: false });
  add(g, box(w - 0.1, 0.02, ROOM_T + 0.01), edge, { p: [0, 0.01, 0], outline: false }); // threshold
  // casing on both faces of the wall: posts on plinth blocks, a head with a little crown on top
  for (const z of [-1, 1]) {
    const f = z * (ROOM_T / 2 + 0.022);
    for (const s of [-1, 1]) {
      add(g, box(0.12, DOOR_H + 0.06, 0.04), wood, { p: [s * (w / 2 + 0.035), (DOOR_H + 0.06) / 2, f] });
      add(g, box(0.02, DOOR_H - 0.1, 0.012), light, { p: [s * (w / 2 + 0.035), DOOR_H / 2, f + z * 0.022], outline: false }); // a bead down the middle
      add(g, box(0.15, 0.22, 0.055), edge, { p: [s * (w / 2 + 0.035), 0.11, f] }); // plinth block
    }
    add(g, box(w + 0.32, 0.14, 0.05), wood, { p: [0, DOOR_H + 0.1, f] });
    add(g, box(w + 0.4, 0.04, 0.075), light, { p: [0, DOOR_H + 0.19, f], outline: false });
  }
}
/** Door furniture: a round rosette with a lever handle, on both faces of the door. */
function lever(parent, x, y, z, metal) {
  for (const s of [-1, 1]) {
    const f = s * z;
    add(parent, cyl(0.04, 0.04, 0.015, 14), metal, { p: [x, y, f], r: [Math.PI / 2, 0, 0], outline: false });
    add(parent, cyl(0.012, 0.012, 0.05, 8), metal, { p: [x, y, f + s * 0.025], r: [Math.PI / 2, 0, 0], outline: false });
    add(parent, box(0.14, 0.025, 0.025), metal, { p: [x - 0.06, y, f + s * 0.05], outline: false });
  }
}
/** A door in an opening `w` wide: it swings (or slides) open when someone walks up, and shuts behind them. */
function doorPanel(g, A, style, w) {
  const W = w - 0.08, H = DOOR_H - 0.04, T = 0.06;
  const pivot = new THREE.Group();
  g.add(pivot);
  const panel = new THREE.Group();
  pivot.add(panel);
  if (style === 'shoji') {
    // a Japanese sliding screen: a dark wooden lattice over paper, sliding into the wall
    const paperMat = toon('#fbf6e8');
    add(panel, box(W, H, 0.03), paperMat, { p: [0, H / 2, 0] });
    const lat = toon('#5a3a22');
    for (let k = 0; k <= 3; k++) add(panel, box(0.03, H, 0.045), lat, { p: [-W / 2 + (k / 3) * W, H / 2, 0], outline: false });
    for (let k = 0; k <= 6; k++) add(panel, box(W, 0.03, 0.045), lat, { p: [0, (k / 6) * H, 0], outline: false });
  } else if (style === 'barn') {
    // a sliding barn door on a rail across the front of the wall
    pivot.position.set(0, 0, ROOM_T / 2 + 0.06);
    add(g, box(w * 2 + 0.1, 0.06, 0.06), toon('#2b2f4a'), { p: [0, H + 0.12, ROOM_T / 2 + 0.06] });
    add(panel, box(W + 0.14, H, T), toon('#9a5a2e'), { p: [0, H / 2, 0] });
    for (const y of [0.3, H - 0.3]) add(panel, box(W + 0.14, 0.12, T + 0.02), toon('#6b3a1c'), { p: [0, y, 0], outline: false });
    add(panel, box(0.1, H * 1.05, T + 0.02), toon('#6b3a1c'), { p: [0, H / 2, 0], r: [0, 0, Math.atan2(W, H - 0.6)], outline: false });
    for (const x of [-0.35, 0.35]) add(panel, cyl(0.05, 0.05, 0.04, 10), toon('#2b2f4a'), { p: [x * W, H + 0.12, 0.03], r: [Math.PI / 2, 0, 0], outline: false });
    add(panel, box(0.04, 0.3, 0.04), toon('#2b2f4a'), { p: [W * 0.4, 1.0, 0.05], outline: false });
  } else {
    // a hinged door on the left of the opening, swinging away from you
    pivot.position.set(-W / 2, 0, 0);
    const wood = toon({ glass: '#f4f2ee', white: '#fbfaf6', red: '#c8243a' }[style] ?? '#a8723f');
    if (style === 'saloon') {
      // two short swing doors, one each side, slatted
      pivot.position.set(-W / 2, 0, 0);
      const half = W / 2 - 0.02;
      add(panel, box(half, 0.9, T), toon('#a8723f'), { p: [half / 2, 1.15, 0] });
      for (let k = 0; k < 4; k++) add(panel, box(half - 0.12, 0.05, T + 0.02), toon('#7a4a28'), { p: [half / 2, 0.85 + k * 0.2, 0], outline: false });
      const pivot2 = new THREE.Group();
      pivot2.position.set(W / 2, 0, 0);
      g.add(pivot2);
      add(pivot2, box(half, 0.9, T), toon('#a8723f'), { p: [-half / 2, 1.15, 0] });
      for (let k = 0; k < 4; k++) add(pivot2, box(half - 0.12, 0.05, T + 0.02), toon('#7a4a28'), { p: [-half / 2, 0.85 + k * 0.2, 0], outline: false });
      A.second = pivot2;
    } else if (style === 'glass') {
      // a french door: a white frame round glass panes
      const glass = new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false });
      for (const [bw, bh, x, y] of [[W, 0.1, W / 2, 0.05], [W, 0.1, W / 2, H - 0.05], [0.1, H, 0.05, H / 2], [0.1, H, W - 0.05, H / 2], [W, 0.06, W / 2, 0.75], [W, 0.06, W / 2, 1.45], [0.06, H, W / 2, H / 2]]) add(panel, box(bw, bh, T), wood, { p: [x, y, 0], outline: false });
      add(panel, box(W - 0.1, H - 0.1, 0.02), glass, { p: [W / 2, H / 2, 0], outline: false });
    } else {
      add(panel, box(W, H, T), wood, { p: [W / 2, H / 2, 0] });
      const inset = toon({ white: '#efebe2', red: '#b01e32' }[style] ?? '#96632f');
      // raised panels on both faces (two tall ones over a short one), each with a lighter bevel
      const bevel = toon(shade({ white: '#fbfaf6', red: '#c8243a' }[style] ?? '#a8723f', 0.15));
      for (const [y, h] of [[0.42, 0.5], [1.38, 1.0]]) for (const z of [-1, 1]) {
        add(panel, box(W * 0.68, h, 0.012), bevel, { p: [W / 2, y, z * (T / 2 + 0.006)], outline: false });
        add(panel, box(W * 0.6, h - 0.08, 0.016), inset, { p: [W / 2, y, z * (T / 2 + 0.01)], outline: false });
      }
      for (const y of [0.3, H - 0.3]) add(panel, cyl(0.022, 0.022, 0.14, 8), shiny('#8d96a8', { metalness: 0.6 }), { p: [0.005, y, 0], outline: false }); // hinges
    }
    if (style !== 'saloon') lever(panel, W - 0.12, 1.0, T / 2, shiny(style === 'white' || style === 'glass' ? '#c8ced8' : '#ffc53d', { metalness: 0.75, roughness: 0.3 }));
  }
  // A.open (0..1) is how far it should be open; the house sets it when someone's near
  let cur = 0, side = 1;
  A.open = 0;
  A.side = 1;
  A.anim.push((t, dt) => {
    const want = A.open;
    if (want > 0 && cur < 0.05) side = A.side; // swing away from whoever's coming through
    cur += (want - cur) * Math.min(1, dt * 7);
    if (style === 'barn' || style === 'shoji') pivot.position.x = -cur * (W + 0.05);
    else pivot.rotation.y = side * cur * 1.55;
    if (A.second) A.second.rotation.y = -side * cur * 1.55;
    return false;
  });
  return {};
}
/** Strings of beads across a doorway that sway as you walk through. */
function beadCurtain(g, A, w) {
  const cols = ['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#e57bff'];
  const strings = [];
  const n = Math.round(w * 9);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Group();
    s.position.set(-w / 2 + 0.08 + (i / (n - 1)) * (w - 0.16), DOOR_H - 0.05, 0);
    g.add(s);
    for (let k = 0; k < 11; k++) add(s, sph(0.025, 6, 5), toon(cols[(i + k) % cols.length]), { p: [0, -0.06 - k * 0.19, 0], outline: false });
    strings.push(s);
  }
  A.open = 0;
  A.side = 1;
  let cur = 0;
  A.anim.push((t, dt) => {
    cur += (A.open - cur) * Math.min(1, dt * 5);
    strings.forEach((s, i) => { s.rotation.x = A.side * cur * 0.7 * (0.7 + Math.sin(i * 1.7) * 0.3) + Math.sin(t * 3 + i) * 0.03 * cur; });
    return false;
  });
}
/** The wall that fills the top corners of an arched opening `w` wide (papered like the wall it's in). */
function archFill(g, w, rise) {
  const r = w / 2, shape = new THREE.Shape();
  shape.moveTo(-r, DOOR_H); shape.lineTo(-r, DOOR_H - rise);
  for (let k = 0; k <= 20; k++) { const a = Math.PI - (k / 20) * Math.PI; shape.lineTo(Math.cos(a) * r, DOOR_H - rise + Math.sin(a) * rise); }
  shape.lineTo(r, DOOR_H); shape.lineTo(-r, DOOR_H);
  const fill = new THREE.ExtrudeGeometry(shape, { depth: ROOM_T - 0.01, bevelEnabled: false });
  fill.translate(0, 0, -(ROOM_T - 0.01) / 2);
  const m = add(g, fill, toon('#fff1d6', { side: THREE.DoubleSide }), { outline: false });
  m.userData.wallpaper = true;
}
/** An open archway `w` wide: round (wooden trim, plinths and a keystone) or stone (a ring of blocks). */
function archway(g, w, style) {
  const r = w / 2, rise = Math.min(style === 'stone' ? 0.6 : 0.55, r);
  archFill(g, w, rise);
  if (style === 'stone') {
    const stone = toon('#c4beb2'), dark = toon('#a39d91');
    // jambs of alternating blocks, then voussoirs fanned round the arch with a keystone at the top
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const h = (DOOR_H - rise) / 4;
      add(g, box(k % 2 ? 0.22 : 0.3, h - 0.025, ROOM_T + 0.1), k % 2 ? dark : stone, { p: [s * (r - 0.02 + (k % 2 ? 0 : 0.04)), (k + 0.5) * h, 0] });
    }
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = Math.PI - ((k + 0.5) / n) * Math.PI, key = k === (n - 1) / 2;
      const mid = new THREE.Vector3(Math.cos(a) * (r + 0.06), DOOR_H - rise + Math.sin(a) * (rise + 0.06), 0);
      const m = add(g, box(key ? 0.26 : 0.2, key ? 0.36 : 0.28, ROOM_T + (key ? 0.14 : 0.1)), key ? stone : (k % 2 ? dark : stone), { p: mid.toArray() });
      m.rotation.z = Math.atan2(Math.sin(a) * (rise / r), Math.cos(a)) - Math.PI / 2;
    }
    return;
  }
  const wood = toon(WOOD), light = toon(shade(WOOD, 0.14)), dark = toon(shade(WOOD, -0.15));
  // the lining under the curve, through the wall, then on each face a flat casing round the opening
  // with a lighter bead along it, standing on plinth blocks
  add(g, archBand(r, rise, -0.03, 0, ROOM_T + 0.01), wood, { p: [0, 0, -(ROOM_T + 0.01) / 2], outline: false });
  for (const z of [-1, 1]) {
    const face = { p: [0, 0, z * (ROOM_T / 2)], r: z < 0 ? [0, Math.PI, 0] : null, outline: false };
    add(g, archBand(r, rise, 0, 0.11, 0.03), wood, face);
    add(g, archBand(r, rise, 0.045, 0.065, 0.042), light, face);
    for (const s of [-1, 1]) add(g, box(0.15, 0.24, 0.05), dark, { p: [s * (r + 0.055), 0.12, z * (ROOM_T / 2 + 0.025)], outline: false });
  }
}
/** A flat band in the shape of an arched opening (up both sides from the floor and round the curve),
 *  from `inner` to `outer` beyond the opening's edge, `depth` thick (extruded towards +z). */
function archBand(r, rise, inner, outer, depth) {
  const base = DOOR_H - rise, sh = new THREE.Shape(), N = 28;
  const ro = r + outer, ri = r + inner, yo = rise + outer, yi = rise + inner;
  sh.moveTo(-ro, 0);
  sh.lineTo(-ro, base);
  for (let k = 0; k <= N; k++) { const t = Math.PI - (k / N) * Math.PI; sh.lineTo(Math.cos(t) * ro, base + Math.sin(t) * yo); }
  sh.lineTo(ro, 0);
  sh.lineTo(ri, 0);
  sh.lineTo(ri, base);
  for (let k = 0; k <= N; k++) { const t = (k / N) * Math.PI; sh.lineTo(Math.cos(t) * ri, base + Math.sin(t) * yi); }
  sh.lineTo(-ri, 0);
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 4 });
}
/** A papered face: the wallpaper repeats every 2 tiles across, and is pinned to the floor going up
 *  (y0: how high its bottom edge is), so it lines up with the room's own walls. */
function papered(w, h, y0 = 0) {
  return geo(`paper${w},${h},${y0}`, () => {
    const pg = new THREE.PlaneGeometry(w, h);
    const uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2, (y0 + uv.getY(i) * h) / 2);
    return pg;
  });
}
/**
 * A stretch of wall `w` long, papered on both faces (and on any open end), with no outlines, so walls
 * that meet run on into each other as one. Openings leave a door-sized gap with wall above it.
 */
/** The house's trim colour (baseboards and the tops of half walls): shared by every wall, so a house
 *  recolours it all at once. */
export const TRIM_MAT = toon('#f4f0ff').clone();
function roomWall(g, w, { openings = [], caps = [true, true], bottom = 0, top = ROOM_H } = {}) {
  const core = toon('#e8d6b8'), trim = TRIM_MAT, paper = toon('#fff1d6', { side: THREE.DoubleSide });
  // (wallpaper doesn't take shadows: the wall's own core, a hair behind it, would darken it, and the
  // house's own walls don't either, so the two always match)
  const paperAt = (geom, p, ry, face) => { const m = add(g, geom, paper, { p, r: [0, ry, 0], outline: false }); m.receiveShadow = false; m.userData.wallpaper = true; m.userData.face = face; };
  // one solid stretch from x0 to x1, y0 to y1
  const piece = (x0, x1, y0, y1) => {
    const pw = x1 - x0, ph = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (pw < 0.01) return;
    add(g, box(pw, ph, ROOM_T - 0.004), core, { p: [cx, cy, 0], outline: false });
    for (const s of [-1, 1]) {
      paperAt(papered(pw, ph, y0), [cx, cy, s * (ROOM_T / 2 - 0.001)], s > 0 ? 0 : Math.PI, s > 0 ? 0 : 2);
      if (y0 === 0) add(g, box(pw, 0.16, 0.05), trim, { p: [cx, 0.08, s * (ROOM_T / 2 + 0.02)], outline: false });
    }
  };
  const gaps = openings.map(([a, b]) => [Math.max(-w / 2, a), Math.min(w / 2, b)]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let x = -w / 2;
  for (const [a, b] of gaps) {
    piece(x, a, bottom, top);
    if (top > DOOR_H) piece(a, b, Math.max(bottom, DOOR_H), top); // the wall above the door
    x = b;
  }
  piece(x, w / 2, bottom, top);
  // a half wall's open edge gets a cap in the trim colour (a top rail with a little lip under it)
  for (const [y, dir] of [[top, 1], [bottom, -1]]) {
    if (dir > 0 ? top >= ROOM_H : bottom <= 0) continue;
    add(g, box(w + 0.02, 0.05, ROOM_T + 0.07), trim, { p: [0, y + dir * 0.012, 0], outline: false });
    add(g, box(w, 0.03, ROOM_T + 0.025), trim, { p: [0, y - dir * 0.025, 0], outline: false });
  }
  // open ends get papered (and skirting) too, so a wall never shows a bare edge. A cap can be [y0, y1]:
  // just that much of the end (a full wall where a half wall meets it: only the part above it shows)
  caps.forEach((on, i) => {
    if (!on) return;
    const s = i ? 1 : -1, [y0, y1] = on === true ? [bottom, top] : on;
    if (y1 - y0 < 0.01) return;
    paperAt(papered(ROOM_T, y1 - y0, y0), [s * (w / 2 + 0.001), (y0 + y1) / 2, 0], s * Math.PI / 2, s > 0 ? 1 : 3);
    if (y0 === 0) add(g, box(0.05, 0.16, ROOM_T + 0.09), trim, { p: [s * (w / 2 + 0.02), 0.08, 0], outline: false });
  });
}

// ---- helpers for the newer furniture ----
const capsuleGeo = (r, l) => geo(`cap${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 12));
function bookStack(g, x, y, z, n, cols = ['#e0463c', '#39c6ff', '#ffd84d', '#6ee7a0'], scale = 0.3) {
  for (let i = 0; i < n; i++) add(g, box(scale, 0.05, scale * 0.72), toon(cols[i % cols.length]), { p: [x + ((i * 7) % 3 - 1) * 0.015, y + 0.025 + i * 0.05, z], r: [0, ((i * 5) % 4 - 1.5) * 0.12, 0], outline: i === n - 1 });
}
function mug(g, x, y, z, color) {
  add(g, cyl(0.05, 0.045, 0.1, 14), toon(color), { p: [x, y + 0.05, z] });
  add(g, geo('mugHandle', () => new THREE.TorusGeometry(0.03, 0.01, 6, 12, Math.PI)), toon(color), { p: [x + 0.05, y + 0.05, z], r: [0, 0, -Math.PI / 2], outline: false });
}
function pot(g, r, h, color) {
  add(g, cyl(r, r * 0.78, h, 18), toon(color), { p: [0, h / 2, 0] });
  add(g, cyl(r * 0.94, r * 0.94, 0.02, 18), toon('#4a2e1c'), { p: [0, h - 0.01, 0], outline: false });
}
function nightstand(g, A, wood, front, knob) {
  add(g, box(0.56, 0.55, 0.46), wood, { p: [0, 0.3, -0.1] });
  add(g, box(0.6, 0.04, 0.5), wood, { p: [0, 0.59, -0.1] });
  for (const y of [0.18, 0.42]) {
    add(g, box(0.48, 0.2, 0.02), front, { p: [0, y, 0.135], outline: false });
    add(g, sph(0.025, 8, 6), knob, { p: [0, y, 0.155], outline: false });
  }
  // a little lamp and an alarm clock
  add(g, cyl(0.06, 0.08, 0.04, 14), toon('#2b2f4a'), { p: [-0.13, 0.63, -0.14] });
  add(g, cyl(0.012, 0.012, 0.18, 6), toon('#2b2f4a'), { p: [-0.13, 0.74, -0.14], outline: false });
  const shade = toon('#ffe9b0', { side: THREE.DoubleSide }).clone();
  shade.emissive = new THREE.Color('#ffcf6b');
  shade.emissiveIntensity = 0.7;
  add(g, cyl(0.08, 0.12, 0.13, 16, true), shade, { p: [-0.13, 0.86, -0.14] });
  add(g, box(0.13, 0.1, 0.06), toon('#e0463c'), { p: [0.14, 0.66, -0.04] });
  add(g, plane(0.09, 0.05), basic('#6ee7a0'), { p: [0.14, 0.665, -0.009], outline: false, cast: false });
  let on = true;
  return { use: () => { on = !on; shade.emissiveIntensity = on ? 0.7 : 0; } };
}
function drawers(g, A, { w, h, cols, rows, wood, front, knob }) {
  add(g, box(w, h, 0.5), wood, { p: [0, h / 2 + 0.06, -0.15] });
  add(g, box(w + 0.04, 0.04, 0.54), wood, { p: [0, h + 0.08, -0.15] });
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) add(g, box(0.06, 0.07, 0.44), wood, { p: [x, 0.035, -0.15], outline: false });
  const dw = (w - 0.08) / cols, dh = (h - 0.06) / rows;
  const fronts = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = new THREE.Group();
    d.position.set(-w / 2 + 0.04 + (c + 0.5) * dw, 0.09 + (r + 0.5) * dh, 0.105);
    g.add(d);
    add(d, box(dw - 0.03, dh - 0.03, 0.03), front, { outline: false });
    add(d, box(0.12, 0.025, 0.025), knob, { p: [0, 0, 0.025], outline: false });
    fronts.push(d);
  }
  // something on top
  add(g, box(0.18, 0.1, 0.12), toon('#b77bff'), { p: [w / 2 - 0.2, h + 0.15, -0.15] });
  add(g, box(0.19, 0.03, 0.13), shiny('#ffd84d'), { p: [w / 2 - 0.2, h + 0.215, -0.15], outline: false });
  let open = 0;
  const which = () => fronts[Math.floor(Math.random() * fronts.length)];
  let d0 = fronts[0];
  A.anim.push((t, dt) => { open = Math.max(0, open - dt); d0.position.z = 0.105 + Math.min(1, open) * 0.25; return false; });
  return { use: () => { d0.position.z = 0.105; d0 = which(); open = 1.6; floatEmoji(g, A, ['👕', '🧦', '👖'][Math.floor(Math.random() * 3)], h + 0.2, 1); } };
}
function hangingPlant(g, len) {
  const cord = toon('#efe3cc'), knot = toon('#e2d2b4');
  // macramé: three cords from a ring at the ceiling, knotted part way down, gathering under the pot
  add(g, new THREE.TorusGeometry(0.05, 0.012, 6, 16), toon('#c9a227'), { p: [0, -0.03, 0], r: [Math.PI / 2, 0, 0], outline: false });
  const potY = -len - 0.12;
  for (const a of [0, 2.1, 4.2]) {
    const top = new THREE.Vector3(Math.cos(a) * 0.03, -0.06, Math.sin(a) * 0.03), rim = new THREE.Vector3(Math.cos(a) * 0.19, potY + 0.12, Math.sin(a) * 0.19);
    const mid = top.clone().lerp(rim, 0.55);
    for (const [p0, p1] of [[top, mid], [mid, rim]]) {
      const d = p1.clone().sub(p0), l = d.length();
      const m = add(g, cyl(0.007, 0.007, l, 4), cord, { p: p0.clone().lerp(p1, 0.5).toArray(), outline: false });
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
    add(g, sph(0.018, 8, 6), knot, { p: mid.toArray(), s: [1, 1.4, 1], outline: false });
    // the cord carries on down under the pot to a tassel
    const under = new THREE.Vector3(0, potY - 0.2, 0), d2 = under.clone().sub(rim);
    const m2 = add(g, cyl(0.007, 0.007, d2.length(), 4), cord, { p: rim.clone().lerp(under, 0.5).toArray(), outline: false });
    m2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2.normalize());
  }
  add(g, sph(0.03, 8, 6), knot, { p: [0, potY - 0.2, 0], outline: false });
  for (let k = 0; k < 6; k++) add(g, cyl(0.005, 0.005, 0.14, 3), cord, { p: [Math.cos(k) * 0.012, potY - 0.29, Math.sin(k) * 0.012], outline: false });
  // the pot: a rounded glazed bowl with a rim, and dark soil
  const pot = new THREE.LatheGeometry([[0, -0.13], [0.11, -0.12], [0.17, -0.06], [0.19, 0.04], [0.2, 0.1], [0.215, 0.11], [0.215, 0.13], [0.19, 0.13]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
  add(g, pot, toon('#e9dcc6'), { p: [0, potY, 0] });
  add(g, new THREE.TorusGeometry(0.2, 0.012, 6, 24), toon('#c96b2c'), { p: [0, potY + 0.06, 0], r: [Math.PI / 2, 0, 0], outline: false });
  add(g, cyl(0.19, 0.19, 0.02, 20), toon('#4a3020'), { p: [0, potY + 0.115, 0], outline: false });
  // a bushy crown of heart-shaped leaves, then vines trailing down over the rim
  const greens = ['#2f7d3a', '#3f9a47', '#56b25a', '#6cc46a'];
  const leaf = sph(0.07, 10, 8);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + (i % 2) * 0.2, r = 0.06 + (i % 3) * 0.06;
    const lf = add(g, leaf, toon(greens[i % 4]), { p: [Math.cos(a) * r, potY + 0.17 + (i % 4) * 0.035, Math.sin(a) * r], s: [1, 0.35, 1.4], outline: false });
    lf.rotation.set(-0.5, -a + Math.PI / 2, 0, 'YXZ');
  }
  for (let v = 0; v < 7; v++) {
    const a = (v / 7) * TAU + 0.3, L = 0.35 + ((v * 3) % 5) * 0.12;
    const start = new THREE.Vector3(Math.cos(a) * 0.2, potY + 0.11, Math.sin(a) * 0.2);
    const steps = 6;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const p = start.clone().add(new THREE.Vector3(Math.cos(a) * 0.05 * Math.sin(t * 3), -L * t, Math.sin(a) * 0.05 * Math.sin(t * 3)));
      if (k < steps) add(g, cyl(0.006, 0.006, L / steps + 0.01, 4), toon('#3a7a32'), { p: [p.x, p.y - L / steps / 2, p.z], outline: false });
      const lf = add(g, leaf, toon(greens[(v + k) % 4]), { p: [p.x + Math.cos(a + k) * 0.03, p.y, p.z + Math.sin(a + k) * 0.03], s: [0.75 - t * 0.25, 0.3, 1.05 - t * 0.35], outline: false });
      lf.rotation.set(-1.1, -a + Math.PI / 2 + (k % 2 ? 0.5 : -0.5), 0, 'YXZ');
    }
  }
}
const bathMatTex = canvasTexture(128, 96, (ctx) => {
  ctx.fillStyle = '#9fd8ff'; ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = '#ffffff';
  for (let y = 8; y < 96; y += 12) for (let x = (y / 12) % 2 ? 8 : 14; x < 128; x += 12) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.strokeRect(4, 4, 120, 88);
});
const gojoCache = {};
const GOJO_W = 512, GOJO_H = 1600;
setTimeout(() => { gojoTex(false); gojoTex(true); }, 0);
/** The cutout's print (the official art, with a die-cut cardboard border round it), or its plain
 *  corrugated cardboard back. Drawn as soon as the picture loads. */
function gojoTex(back) {
  if (gojoCache[back]) return gojoCache[back];
  const tex = canvasTexture(GOJO_W, GOJO_H, () => {});
  const img = new Image();
  img.onload = () => {
    const c = tex.image.getContext('2d');
    const h = GOJO_H - 60, w = h * (img.width / img.height), x = (GOJO_W - w) / 2, y = 30;
    // the cardboard edge: the figure's silhouette, grown by ~12px all round, in cardboard brown
    const sil = document.createElement('canvas');
    sil.width = GOJO_W; sil.height = GOJO_H;
    const sc = sil.getContext('2d');
    sc.drawImage(img, x, y, w, h);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = '#b8895a'; sc.fillRect(0, 0, GOJO_W, GOJO_H);
    for (let a = 0; a < TAU; a += TAU / 24) for (const r of [6, 12]) c.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
    if (back) {
      c.globalCompositeOperation = 'source-atop';
      c.strokeStyle = 'rgba(90,60,30,.2)'; c.lineWidth = 3;
      for (let k = 0; k < GOJO_W; k += 14) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, GOJO_H); c.stroke(); }
      c.fillStyle = 'rgba(60,40,20,.55)'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center';
      c.save(); c.translate(GOJO_W / 2, GOJO_H * 0.55); c.rotate(-Math.PI / 2); c.fillText('THIS SIDE BACK', 0, 0); c.restore();
      c.globalCompositeOperation = 'source-over';
    } else {
      // a thin white print border just inside the cardboard, then the art
      sc.globalCompositeOperation = 'source-over';
      c.drawImage(img, x, y, w, h);
    }
    tex.needsUpdate = true;
    thumbs.delete('cutout_gojo'); // (re-snap the shop picture now the print's there)
  };
  img.src = new URL('../../img/gojo.png', import.meta.url).href;
  gojoCache[back] = tex;
  return tex;
}

// hanging things that make their own strings longer when let down (the rest get a cord to the ceiling)
const OWN_DROP = new Set(['hanging_plant', 'hanging_plant_short', 'hanging_plant_long', 'hanging_vines']);

/** Build a piece of furniture. Returns { group, use, anim }. `drop`: how far below the ceiling a
 *  hanging thing has been let down (it stays tied to the ceiling). */
const FURN_DATA = Object.fromEntries(CATALOG.furniture.map((f) => [f.id, f]));
const recolorCache = new Map();
/**
 * Recolour a piece: find its main colour (the colourful one used on the most parts) and move it, and every
 * shade of the same hue (darker trims, lighter cushions), to the new colour. Wood, metal and whites stay.
 */
/** The most common colourful hue in a canvas texture (sampled), as HSL. */
function textureHue(img) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
  const d = x.getImageData(0, 0, 32, 32).data, bins = new Map(), col = new THREE.Color();
  for (let i = 0; i < d.length; i += 4) {
    col.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    const hsl = col.getHSL({});
    if (d[i + 3] < 128 || hsl.s < 0.25 || hsl.l > 0.92 || hsl.l < 0.1) continue;
    const k = Math.round(hsl.h * 24) % 24;
    const b = bins.get(k) ?? { n: 0, s: 0, l: 0 };
    b.n++; b.s += hsl.s; b.l += hsl.l;
    bins.set(k, b);
  }
  if (!bins.size) return null;
  const [k, b] = [...bins].sort((p, q) => q[1].n - p[1].n)[0];
  return { h: k / 24, s: b.s / b.n, l: b.l / b.n };
}
/** A textured piece (rugs, mats): the picture hue-shifted (and lightened/darkened) towards the new colour. */
function recolorTexture(mat, to) {
  const key = `${mat.map.uuid}${to}`;
  if (!recolorCache.has(key)) {
    const img = mat.map.image, from = img && textureHue(img);
    if (!from) { recolorCache.set(key, mat); return mat; }
    const t = new THREE.Color(to).getHSL({});
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    // (gently: whites stay white and the colours stay rich, it's mostly the hue that moves)
    x.filter = `hue-rotate(${Math.round((t.h - from.h) * 360)}deg) saturate(${Math.max(0.75, Math.min(2.2, t.s / Math.max(0.05, from.s))).toFixed(2)}) brightness(${Math.max(0.6, Math.min(1.3, (t.l + 0.35) / (from.l + 0.35))).toFixed(2)})`;
    x.drawImage(img, 0, 0);
    const tex = mat.map.clone();
    tex.image = c;
    tex.needsUpdate = true;
    const m = mat.clone();
    m.map = tex;
    recolorCache.set(key, m);
  }
  return recolorCache.get(key);
}
function recolor(group, to, from = null) {
  const target = new THREE.Color(to).getHSL({});
  const mats = [];
  group.traverse((o) => { if (o.isMesh && !o.userData.outline && o.material?.color && !o.material.map) mats.push(o); });
  // pieces whose colour is in their texture (rugs, mats) get the texture shifted instead
  const textured = [];
  group.traverse((o) => { if (o.isMesh && !o.userData.outline && o.material?.map?.image?.getContext) textured.push(o); });
  const count = new Map();
  for (const o of mats) {
    const hsl = o.material.color.getHSL({});
    if (hsl.s < 0.18 || hsl.l > 0.93 || hsl.l < 0.08) continue; // (greys, whites and near-blacks aren't "the colour")
    const k = o.material.color.getHex();
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  if (!count.size || (textured.length && !from)) {
    // (no plain colourful parts, or the colour lives in a texture: shift the texture)
    for (const o of textured) o.material = recolorTexture(o.material, to);
    if (!count.size) return;
    if (textured.length) return;
  }
  const main = new THREE.Color(from ?? [...count].sort((a, b) => b[1] - a[1])[0][0]).getHSL({});
  const near = (h) => Math.min(Math.abs(h - main.h), 1 - Math.abs(h - main.h)) < 0.07;
  for (const o of mats) {
    const hsl = o.material.color.getHSL({});
    if (hsl.s < 0.18 || !near(hsl.h)) continue;
    const key = `${o.material.uuid}${to}`;
    if (!recolorCache.has(key)) {
      const m = o.material.clone();
      m.color.setHSL(target.h, Math.min(1, hsl.s * (target.s / Math.max(0.05, main.s))), Math.max(0.04, Math.min(0.96, hsl.l + (target.l - main.l))));
      recolorCache.set(key, m);
    }
    o.material = recolorCache.get(key);
  }
}

/** color: recolour it (pieces you can recolour, and colour variants of other pieces, which name a base). */
// ---- big rugs in lots of colours: each one its own catalogue entry, drawn in its own colours ----
const RUG_COLORS = {
  navy: ['Navy', '#2b3a6b', '#e9d8a6'], sage: ['Sage', '#8fae8b', '#f4efe1'], mustard: ['Mustard', '#e0a83a', '#5a3a22'],
  terracotta: ['Terracotta', '#c8643b', '#f3d9b1'], lavender: ['Lavender', '#b39ddb', '#fff3fb'], charcoal: ['Charcoal', '#3a3a48', '#c9c3b8'],
  cream: ['Cream', '#efe3c8', '#8b5a2b'], blush: ['Blush', '#f2a7b8', '#ffffff'], teal: ['Teal', '#1f8a8a', '#ffd84d'],
  burgundy: ['Burgundy', '#7a2335', '#e8c27a'], forest: ['Forest', '#2f6b4f', '#f4e3b5'], sky: ['Sky', '#7fc8ff', '#ffffff'],
};
const RUG_SHAPES = { rug_large: 'rect', rug_xl: 'rect', rug_runner: 'runner', rug_round_large: 'round', rug_shag: 'shag' };
const rugTexCache = new Map();
function bigRugTexture(shape, col, acc, w, d) {
  const key = `${shape}${col}${acc}${w}${d}`;
  if (rugTexCache.has(key)) return rugTexCache.get(key);
  const cw = 512, ch = Math.round((512 * d) / w);
  const tex = canvasTexture(cw, ch, (c) => {
    c.fillStyle = col; c.fillRect(0, 0, cw, ch);
    const light = shade(col, 0.18), dark = shade(col, -0.18);
    if (shape === 'shag') {
      // deep pile: thousands of little tufts, lighter and darker
      for (let i = 0; i < 9000; i++) { c.fillStyle = i % 3 ? light : dark; c.globalAlpha = 0.35; c.fillRect((i * 37.7) % cw, (i * 91.3) % ch, 3, 3); }
      c.globalAlpha = 1;
      return;
    }
    if (shape === 'round') {
      for (let r = cw / 2, i = 0; r > 0; r -= cw / 14, i++) { c.fillStyle = [col, acc, dark, light][i % 4]; c.beginPath(); c.arc(cw / 2, ch / 2, r, 0, TAU); c.fill(); }
      return;
    }
    c.strokeStyle = acc;
    c.lineWidth = 14; c.strokeRect(22, 22, cw - 44, ch - 44);
    c.lineWidth = 5; c.strokeRect(48, 48, cw - 96, ch - 96);
    if (shape === 'runner') {
      // a row of diamonds down the middle
      const n = Math.max(3, Math.round(w * 2));
      for (let k = 0; k < n; k++) {
        const x = 70 + ((cw - 140) * (k + 0.5)) / n, y = ch / 2, s = Math.min(ch * 0.28, (cw - 140) / n / 2.4);
        c.fillStyle = k % 2 ? acc : light;
        c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y); c.closePath(); c.fill();
      }
      return;
    }
    // a medallion in the middle and little corner motifs
    c.fillStyle = dark; c.beginPath(); c.ellipse(cw / 2, ch / 2, cw * 0.2, ch * 0.24, 0, 0, TAU); c.fill();
    c.fillStyle = acc; c.beginPath(); c.ellipse(cw / 2, ch / 2, cw * 0.12, ch * 0.15, 0, 0, TAU); c.fill();
    c.fillStyle = light; c.beginPath(); c.ellipse(cw / 2, ch / 2, cw * 0.05, ch * 0.06, 0, 0, TAU); c.fill();
    for (const [x, y] of [[80, 80], [cw - 80, 80], [80, ch - 80], [cw - 80, ch - 80]]) { c.fillStyle = acc; c.beginPath(); c.arc(x, y, 12, 0, TAU); c.fill(); }
  });
  rugTexCache.set(key, tex);
  return tex;
}
function bigRug(g, shape, colorKey, w, d) {
  const [, col, acc] = RUG_COLORS[colorKey];
  const mat = new THREE.MeshToonMaterial({ map: bigRugTexture(shape, col, acc, w, d) });
  const rw = w - 0.12, rd = d - 0.12;
  if (shape === 'round') add(g, geo(`bigRound${rw}`, () => new THREE.CircleGeometry(rw / 2, 56)), mat, { p: [0, 0.012, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
  else if (shape === 'shag') {
    add(g, box(rw, 0.035, rd), mat, { p: [0, 0.018, 0], outline: false, cast: false });
  } else {
    add(g, plane(rw, rd), mat, { p: [0, 0.012, 0], r: [-Math.PI / 2, 0, 0], outline: false, cast: false });
    // fringe along the short ends
    const fr = toon(acc);
    for (const s of [-1, 1]) add(g, box(0.06, 0.008, rd * 0.92), fr, { p: [s * (rw / 2 + 0.03), 0.008, 0], outline: false, cast: false });
  }
}
for (const f of CATALOG.furniture) {
  const m = f.id.match(/^(rug_large|rug_xl|rug_runner|rug_round_large|rug_shag)_([a-z]+)$/);
  if (m && RUG_COLORS[m[2]]) FURNITURE[f.id] = (g) => bigRug(g, RUG_SHAPES[m[1]], m[2], f.w, f.d);
}

// ---- bedside tables: a few nicer styles, each with a lamp you can switch on and off ----
function lampOn(shade, on) { shade.emissiveIntensity = on ? 0.75 : 0; }
function bedsideLamp(g, x, z, y, { base = '#2b2f4a', shadeCol = '#ffe9b0', kind = 'drum' } = {}) {
  const shadeMat = toon(shadeCol, { side: THREE.DoubleSide }).clone();
  shadeMat.emissive = new THREE.Color('#ffcf6b');
  shadeMat.emissiveIntensity = 0.75;
  if (kind === 'mushroom') {
    add(g, cyl(0.035, 0.07, 0.16, 14), toon(base), { p: [x, y + 0.08, z] });
    add(g, geo('mushLampTop', () => new THREE.SphereGeometry(0.12, 18, 10, 0, TAU, 0, Math.PI / 2)), shadeMat, { p: [x, y + 0.16, z] });
  } else if (kind === 'globe') {
    add(g, cyl(0.06, 0.07, 0.03, 14), toon(base), { p: [x, y + 0.015, z] });
    add(g, sph(0.1, 16, 12), shadeMat, { p: [x, y + 0.13, z], outline: false });
  } else {
    add(g, sph(0.07, 14, 10), toon(base), { p: [x, y + 0.07, z], s: [1, 1.15, 1] });
    add(g, cyl(0.01, 0.01, 0.1, 6), toon('#c0c6d4'), { p: [x, y + 0.18, z], outline: false });
    add(g, cyl(0.075, 0.11, 0.13, 18, true), shadeMat, { p: [x, y + 0.27, z] });
  }
  return shadeMat;
}
function bedside(g, A, o) {
  const { w = 0.58, h = 0.52, d = 0.44, body, front, knob, legs = 'none', drawers = 2, top = null, lamp = {}, extra = null, round = false } = o;
  const lift = legs === 'none' ? 0.02 : legs === 'tall' ? 0.2 : 0.12;
  const z0 = -0.12;
  if (round) {
    // a round pedestal table
    add(g, cyl(w / 2, w / 2, 0.04, 28), top ?? body, { p: [0, h + lift, z0] });
    add(g, cyl(w / 2 - 0.03, w / 2 - 0.03, h - 0.2, 24), body, { p: [0, lift + (h - 0.2) / 2 + 0.17, z0] });
    add(g, cyl(0.04, 0.05, 0.17, 10), body, { p: [0, lift + 0.085, z0] });
    add(g, cyl(0.16, 0.2, 0.03, 18), body, { p: [0, 0.015, z0] });
    add(g, box(w * 0.55, 0.12, 0.02), front, { p: [0, h + lift - 0.12, z0 + w / 2 - 0.025], outline: false });
    add(g, sph(0.022, 8, 6), knob, { p: [0, h + lift - 0.12, z0 + w / 2 - 0.005], outline: false });
  } else {
    add(g, box(w, h, d), body, { p: [0, lift + h / 2, z0] });
    add(g, box(w + 0.03, 0.035, d + 0.03), top ?? body, { p: [0, lift + h + 0.017, z0] });
    const dh = (h - 0.06) / Math.max(1, drawers);
    for (let k = 0; k < drawers; k++) {
      const y = lift + 0.03 + dh * (k + 0.5);
      add(g, box(w - 0.07, dh - 0.035, 0.02), front, { p: [0, y, z0 + d / 2 + 0.005], outline: false });
      if (knob) add(g, box(0.1, 0.018, 0.02), knob, { p: [0, y, z0 + d / 2 + 0.022], outline: false }); // a bar pull
    }
    if (!drawers) add(g, box(w - 0.07, h * 0.42, 0.02), toon('#3a2414'), { p: [0, lift + h * 0.72, z0 + d / 2 - 0.01], outline: false }); // an open shelf
    if (legs !== 'none') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = add(g, cyl(0.016, legs === 'tall' ? 0.012 : 0.01, lift, 8), legs === 'gold' ? shiny('#d4af37', { metalness: 0.7 }) : body,
          { p: [sx * (w / 2 - 0.05), lift / 2, z0 + sz * (d / 2 - 0.05)], outline: false });
        if (legs === 'splay') leg.rotation.set(sz * 0.18, 0, -sx * 0.18);
      }
    }
  }
  const lampY = lift + h + (round ? 0.02 : 0.035);
  const shadeMat = bedsideLamp(g, -0.14, z0 - 0.05, lampY, lamp);
  extra?.(g, lampY, z0);
  let on = true;
  return { use: () => { on = !on; lampOn(shadeMat, on); } };
}
const bookPile = (g, y, z0) => bookStack(g, 0.13, y, z0 + 0.02, 3, undefined, 0.2);
const littlePlant = (g, y, z0) => {
  add(g, cyl(0.05, 0.04, 0.08, 12), toon('#e07a4f'), { p: [0.15, y + 0.04, z0 - 0.04] });
  for (let k = 0; k < 4; k++) add(g, cone(0.03, 0.14, 5), toon('#4fae5a'), { p: [0.15 + Math.cos(k * 1.6) * 0.02, y + 0.14, z0 - 0.04 + Math.sin(k * 1.6) * 0.02], r: [Math.cos(k * 1.6) * 0.3, 0, Math.sin(k * 1.6) * 0.3] });
};
const alarmClock = (g, y, z0) => {
  add(g, box(0.12, 0.09, 0.05), toon('#e0463c'), { p: [0.15, y + 0.045, z0 + 0.04] });
  add(g, plane(0.08, 0.045), basic('#6ee7a0'), { p: [0.15, y + 0.05, z0 + 0.066], outline: false, cast: false });
};
Object.assign(FURNITURE, {
  nightstand_mid(g, A) { return bedside(g, A, { body: toon('#8b5a2b'), front: toon('#a8723f'), knob: shiny('#d4af37', { metalness: 0.7 }), legs: 'splay', drawers: 2, lamp: { kind: 'drum', base: '#e9e4da', shadeCol: '#fff3d6' }, extra: bookPile }); },
  nightstand_float(g, A) { return bedside(g, A, { h: 0.34, body: toon('#f4f2ee'), front: toon('#ffffff'), knob: null, legs: 'tall', drawers: 1, lamp: { kind: 'globe', base: '#c9a227' }, extra: littlePlant }); },
  nightstand_rattan(g, A) { return bedside(g, A, { body: toon('#c9a26a'), front: toon('#e2c28e'), knob: toon('#6e4424'), legs: 'short', drawers: 2, lamp: { kind: 'mushroom', base: '#f4efe1', shadeCol: '#fff6e0' }, extra: littlePlant }); },
  nightstand_round(g, A) { return bedside(g, A, { w: 0.6, h: 0.5, round: true, body: toon('#e9e4da'), front: toon('#d8d0c2'), knob: shiny('#d4af37', { metalness: 0.7 }), lamp: { kind: 'mushroom', base: '#d9a441', shadeCol: '#ffe7a8' }, extra: alarmClock }); },
  nightstand_glam(g, A) { return bedside(g, A, { body: new THREE.MeshStandardMaterial({ color: '#dfe6ee', metalness: 0.75, roughness: 0.12 }), front: new THREE.MeshStandardMaterial({ color: '#eef3f8', metalness: 0.8, roughness: 0.08 }), knob: shiny('#d4af37', { metalness: 0.8 }), top: shiny('#d4af37', { metalness: 0.6 }), legs: 'gold', drawers: 3, lamp: { kind: 'drum', base: '#d4af37', shadeCol: '#ffffff' }, extra: bookPile }); },
  nightstand_pastel(g, A) { return bedside(g, A, { body: toon('#ffc2dd'), front: toon('#ffd9ea'), knob: toon('#ff7ab6'), legs: 'splay', drawers: 2, lamp: { kind: 'globe', base: '#ff9fc8' }, extra: alarmClock }); },
  nightstand_black(g, A) { return bedside(g, A, { body: toon('#23232e'), front: toon('#2e2e3c'), knob: shiny('#d4af37', { metalness: 0.7 }), legs: 'none', drawers: 3, lamp: { kind: 'drum', base: '#16141f', shadeCol: '#f4efe1' }, extra: littlePlant }); },
  nightstand_open(g, A) { return bedside(g, A, { body: toon('#b98049'), front: toon('#a8723f'), knob: null, legs: 'short', drawers: 0, lamp: { kind: 'globe', base: '#6e4424' }, extra: bookPile }); },
});

// ---- the view outside: one painted panorama (sky, hills, trees, a meadow and a fence) that windows look
// out onto and the house's garden sits in. (No fence painted in: it would fill every window.) Windows sample it by view direction, so it shifts as you move.
let panoTex = null;
export function outdoorPanorama() {
  if (panoTex) return panoTex;
  panoTex = canvasTexture(2048, 1024, (c) => {
    const W = 2048, H = 1024, hz = H * 0.5;
    const sky = c.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#5aa8f0'); sky.addColorStop(0.7, '#a8d8ff'); sky.addColorStop(1, '#e6f4ff');
    c.fillStyle = sky; c.fillRect(0, 0, W, hz + 2);
    // the sun and soft clouds
    c.fillStyle = 'rgba(255,250,220,.9)'; c.beginPath(); c.arc(W * 0.3, H * 0.18, 34, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,245,200,.25)'; c.beginPath(); c.arc(W * 0.3, H * 0.18, 70, 0, TAU); c.fill();
    for (let i = 0; i < 26; i++) {
      const x = (i * 337) % W, y = 60 + ((i * 131) % 300), s = 0.6 + ((i * 7) % 5) / 6;
      c.fillStyle = 'rgba(255,255,255,.85)';
      for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(x + k * 34 * s, y + Math.sin(k * 1.7) * 8 * s, 46 * s, 22 * s, 0, 0, TAU); c.fill(); }
    }
    // far hills, nearer hills
    const hills = (base, amp, col, seed) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(0, hz + 4);
      for (let x = 0; x <= W; x += 16) c.lineTo(x, base - Math.abs(Math.sin(x / 260 + seed)) * amp - Math.sin(x / 90 + seed * 2) * amp * 0.15);
      c.lineTo(W, hz + 4); c.closePath(); c.fill();
    };
    hills(hz, 110, '#9cc7d9', 1);
    hills(hz, 70, '#7fb07a', 3);
    // a tree line along the horizon
    for (let x = 0; x < W; x += 14) {
      const h = 18 + ((x * 13) % 26);
      c.fillStyle = ['#3f8a46', '#4f9c4f', '#357a3d'][(x / 14) % 3 | 0];
      c.beginPath(); c.ellipse(x, hz - h * 0.5, 12, h * 0.75, 0, 0, TAU); c.fill();
    }
    // the meadow below the horizon, dotted with flowers
    const g = c.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#79b85c'); g.addColorStop(1, '#4f9a45');
    c.fillStyle = g; c.fillRect(0, hz, W, H - hz);
    for (let i = 0; i < 1400; i++) {
      const y = hz + 8 + ((i * 53) % (H - hz - 8)), x = (i * 97.3) % W;
      c.fillStyle = i % 9 === 0 ? ['#ff8fc7', '#ffd84d', '#ffffff', '#b77bff'][i % 4] : 'rgba(40,90,40,.25)';
      c.fillRect(x, y, i % 9 === 0 ? 5 : 3, i % 9 === 0 ? 5 : 6);
    }
  });
  panoTex.mapping = THREE.EquirectangularReflectionMapping;
  return panoTex;
}
/** Glass that shows the outdoor panorama in whatever direction you look through it. */
function outdoorGlass() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: outdoorPanorama() } },
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D map; varying vec3 vW;
      void main() {
        vec3 d = normalize(vW - cameraPosition);
        vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415926 + 0.5);
        vec3 col = texture2D(map, uv).rgb;
        col = mix(col, vec3(0.85, 0.95, 1.0), 0.08); // a faint glassy tint
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
/** A window frame (white by default) round a pane of outdoor glass: w×h, with `bars` mullions. */
function windowFrame(g, w, h, { frame = '#ffffff', bars = [1, 1], sill = true, round = false } = {}) {
  const fm = toon(frame);
  if (round) {
    add(g, geo(`roundPane${w}`, () => new THREE.CircleGeometry(w / 2, 40)), outdoorGlass(), { p: [0, 0, 0.012], outline: false, cast: false });
    add(g, geo(`roundFrame${w}`, () => new THREE.TorusGeometry(w / 2, 0.06, 10, 40)), fm, { p: [0, 0, 0.04] });
    add(g, box(w, 0.04, 0.04), fm, { p: [0, 0, 0.04], outline: false });
    add(g, box(0.04, w, 0.04), fm, { p: [0, 0, 0.04], outline: false });
    return;
  }
  add(g, plane(w, h), outdoorGlass(), { p: [0, 0, 0.012], outline: false, cast: false });
  for (const [bw, bh, x, y] of [[w + 0.14, 0.08, 0, h / 2 + 0.03], [w + 0.14, 0.08, 0, -h / 2 - 0.03], [0.08, h + 0.12, -w / 2 - 0.03, 0], [0.08, h + 0.12, w / 2 + 0.03, 0]]) add(g, box(bw, bh, 0.07), fm, { p: [x, y, 0.035], outline: false });
  for (let i = 1; i <= bars[0]; i++) add(g, box(0.04, h, 0.05), fm, { p: [-w / 2 + (i * w) / (bars[0] + 1), 0, 0.03], outline: false });
  for (let i = 1; i <= bars[1]; i++) add(g, box(w, 0.04, 0.05), fm, { p: [0, -h / 2 + (i * h) / (bars[1] + 1), 0.03], outline: false });
  if (sill) add(g, box(w + 0.24, 0.07, 0.2), fm, { p: [0, -h / 2 - 0.1, 0.1] });
}

// ---- desks: a slab on legs or drawers, with things on top (all tuck a chair in) ----
function desk(g, A, o) {
  const { w = 1.7, d = 0.72, top, legs, legStyle = 'straight', drawers = false, hutch = false, glass = false, stuff = [] } = o;
  const z0 = -0.1, H = 0.74;
  add(g, box(w, 0.05, d), glass ? new THREE.MeshStandardMaterial({ color: '#cfeaff', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.2 }) : top, { p: [0, H, z0], outline: !glass });
  if (legStyle === 'trestle') {
    for (const s of [-1, 1]) { add(g, box(0.08, H - 0.03, d - 0.12), legs, { p: [s * (w / 2 - 0.12), (H - 0.03) / 2, z0] }); add(g, box(0.1, 0.05, d), legs, { p: [s * (w / 2 - 0.12), 0.025, z0] }); }
    add(g, box(w - 0.3, 0.06, 0.05), legs, { p: [0, 0.25, z0] });
  } else if (legStyle === 'frame') {
    // a metal frame: side loops and a crossbar (standing desks, industrial)
    for (const s of [-1, 1]) { add(g, box(0.05, H, 0.05), legs, { p: [s * (w / 2 - 0.08), H / 2, z0] }); add(g, box(0.07, 0.04, d - 0.04), legs, { p: [s * (w / 2 - 0.08), 0.02, z0] }); }
    add(g, box(w - 0.16, 0.05, 0.05), legs, { p: [0, H - 0.08, z0 - d / 2 + 0.08] });
  } else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (drawers && sx > 0) continue;
      const l = add(g, cyl(0.025, legStyle === 'tapered' ? 0.016 : 0.025, H, 8), legs, { p: [sx * (w / 2 - 0.07), H / 2, z0 + sz * (d / 2 - 0.07)], outline: false });
      if (legStyle === 'tapered') l.rotation.set(sz * 0.08, 0, -sx * 0.08);
    }
  }
  if (drawers) {
    // a pedestal of drawers on the right
    add(g, box(0.45, H - 0.05, d - 0.06), top, { p: [w / 2 - 0.26, (H - 0.05) / 2, z0] });
    for (let k = 0; k < 3; k++) {
      add(g, box(0.39, 0.19, 0.02), legs, { p: [w / 2 - 0.26, 0.13 + k * 0.22, z0 + d / 2 - 0.02], outline: false });
      add(g, box(0.12, 0.02, 0.02), shiny('#c0c6d4'), { p: [w / 2 - 0.26, 0.17 + k * 0.22, z0 + d / 2 - 0.005], outline: false });
    }
  }
  if (hutch) {
    // shelves above the back of the desk, with books
    add(g, box(w, 0.7, 0.04), top, { p: [0, H + 0.37, z0 - d / 2 + 0.02] });
    for (const s of [-1, 1]) add(g, box(0.04, 0.7, 0.26), top, { p: [s * (w / 2 - 0.02), H + 0.37, z0 - d / 2 + 0.13] });
    add(g, box(w, 0.04, 0.26), top, { p: [0, H + 0.42, z0 - d / 2 + 0.13] });
    add(g, box(w, 0.04, 0.28), top, { p: [0, H + 0.73, z0 - d / 2 + 0.13] });
    bookStack(g, -w / 2 + 0.3, H + 0.44, z0 - d / 2 + 0.13, 4, undefined, 0.22);
    for (let k = 0; k < 6; k++) add(g, box(0.05, 0.22, 0.17), toon(['#e0463c', '#39c6ff', '#ffd84d', '#6ee7a0', '#b77bff', '#ff9f43'][k]), { p: [w / 2 - 0.5 + k * 0.065, H + 0.55, z0 - d / 2 + 0.12], outline: false });
  }
  const y = H + 0.025;
  for (const s of stuff) {
    if (s === 'monitor') {
      add(g, box(0.62, 0.38, 0.03), toon('#1d1f2e'), { p: [0, y + 0.38, z0 - 0.15] });
      add(g, plane(0.57, 0.33), basic('#3b82f6'), { p: [0, y + 0.38, z0 - 0.133], outline: false, cast: false });
      add(g, box(0.05, 0.18, 0.04), toon('#2b2f4a'), { p: [0, y + 0.1, z0 - 0.17] });
      add(g, box(0.22, 0.02, 0.14), toon('#2b2f4a'), { p: [0, y + 0.01, z0 - 0.15] });
      add(g, box(0.44, 0.02, 0.14), toon('#2b2f4a'), { p: [0, y + 0.01, z0 + 0.12] }); // keyboard
      add(g, box(0.07, 0.025, 0.11), toon('#2b2f4a'), { p: [0.32, y + 0.012, z0 + 0.12] }); // mouse
    } else if (s === 'laptop') {
      add(g, box(0.36, 0.02, 0.25), toon('#c0c6d4'), { p: [-0.1, y + 0.01, z0 + 0.05] });
      const lid = add(g, box(0.36, 0.24, 0.015), toon('#c0c6d4'), { p: [-0.1, y + 0.12, z0 - 0.08], r: [-0.25, 0, 0] });
      add(lid, plane(0.32, 0.2), basic('#9fd8ff'), { p: [0, 0, 0.009], outline: false, cast: false });
    } else if (s === 'lamp') {
      add(g, cyl(0.07, 0.08, 0.03, 14), toon('#2b2f4a'), { p: [-w / 2 + 0.25, y + 0.015, z0 - 0.15] });
      add(g, cyl(0.012, 0.012, 0.32, 6), toon('#2b2f4a'), { p: [-w / 2 + 0.25, y + 0.17, z0 - 0.15], outline: false });
      const sh = toon('#ffe9b0', { side: THREE.DoubleSide }).clone(); sh.emissive = new THREE.Color('#ffcf6b'); sh.emissiveIntensity = 0.6;
      add(g, cone(0.11, 0.13, 16), sh, { p: [-w / 2 + 0.32, y + 0.34, z0 - 0.12], r: [0.5, 0, -0.4] });
    } else if (s === 'plant') {
      add(g, cyl(0.06, 0.05, 0.1, 12), toon('#e07a4f'), { p: [w / 2 - 0.2, y + 0.05, z0 - 0.18] });
      for (let k = 0; k < 5; k++) add(g, cone(0.035, 0.18, 5), toon('#4fae5a'), { p: [w / 2 - 0.2 + Math.cos(k * 1.3) * 0.025, y + 0.17, z0 - 0.18 + Math.sin(k * 1.3) * 0.025], r: [Math.cos(k * 1.3) * 0.35, 0, Math.sin(k * 1.3) * 0.35] });
    } else if (s === 'books') bookStack(g, w / 2 - 0.25, y, z0 + 0.12, 3, undefined, 0.22);
    else if (s === 'pc') {
      add(g, box(0.22, 0.48, 0.48), toon('#1d1f2e'), { p: [w / 2 - 0.2, 0.24, z0] });
      add(g, box(0.005, 0.4, 0.03), basic('#ff4fd8'), { p: [w / 2 - 0.09, 0.26, z0 + 0.15], outline: false });
    } else if (s === 'mirror') {
      add(g, box(0.62, 0.72, 0.04), toon('#ff9fc8'), { p: [0, y + 0.44, z0 - d / 2 + 0.06] });
      add(g, plane(0.54, 0.64), new THREE.MeshStandardMaterial({ color: '#e9f6ff', roughness: 0.05, metalness: 0.6 }), { p: [0, y + 0.44, z0 - d / 2 + 0.085], outline: false });
    }
  }
}

// ---- beds: double and king sizes in several styles; lie down on either side ----
function bigBed(g, A, o) {
  const { w = 1.9, frame, blanket, sheet = '#f4f0ff', pillow = '#ffffff', style = 'panel', low = false, extra = null } = o;
  const L = 1.96, base = low ? 0.16 : 0.3;
  add(g, box(w, base, L), frame, { p: [0, base / 2 + 0.04, 0] });
  add(g, box(w - 0.06, 0.2, L - 0.08), toon(sheet), { p: [0, base + 0.14, 0.02] });
  // the duvet, folded back at the top, and a throw across the foot
  add(g, box(w - 0.02, 0.1, L * 0.64), toon(blanket), { p: [0, base + 0.27, L * 0.17], outline: true });
  add(g, box(w - 0.02, 0.12, 0.14), toon(shade(blanket, 0.18)), { p: [0, base + 0.29, -L * 0.14], outline: false });
  add(g, box(w + 0.01, 0.34, 0.05), toon(blanket), { p: [0, base + 0.12, L / 2 - 0.0], outline: false });
  // pillows: two (or three) in a row
  const n = w > 2.2 ? 3 : 2;
  for (let k = 0; k < n; k++) add(g, sph(0.2, 14, 10), toon(pillow), { p: [-w / 2 + (k + 0.5) * (w / n), base + 0.33, -L / 2 + 0.3], s: [w / n / 0.46, 0.5, 0.8] });
  if (style === 'panel') add(g, box(w + 0.06, 1.1, 0.1), frame, { p: [0, 0.55, -L / 2 - 0.02] });
  if (style === 'tufted') {
    // a tall padded headboard with buttons
    const pad = toon(o.head ?? '#8a8fa8');
    add(g, box(w + 0.12, 1.35, 0.16), pad, { p: [0, 0.68, -L / 2 - 0.04] });
    for (let r = 0; r < 3; r++) for (let k = 0; k < Math.round(w * 3); k++) add(g, sph(0.02, 6, 5), toon(shade(o.head ?? '#8a8fa8', -0.25)), { p: [-w / 2 + 0.17 + k * ((w - 0.3) / Math.max(1, Math.round(w * 3) - 1)), 0.6 + r * 0.25, -L / 2 + 0.05], outline: false });
  }
  if (style === 'canopy') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, cyl(0.04, 0.04, 2.3, 10), frame, { p: [sx * (w / 2 - 0.02), 1.15, sz * (L / 2 - 0.02)] });
    for (const sz of [-1, 1]) add(g, box(w, 0.06, 0.06), frame, { p: [0, 2.3, sz * (L / 2 - 0.02)] });
    for (const sx of [-1, 1]) add(g, box(0.06, 0.06, L), frame, { p: [sx * (w / 2 - 0.02), 2.3, 0] });
    const drape = toon(o.drape ?? '#ffffff', { transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, box(0.3, 2.1, 0.02), drape, { p: [sx * (w / 2 - 0.15), 1.25, sz * (L / 2 - 0.05)], outline: false });
    add(g, box(w + 0.04, 0.4, 0.02), drape, { p: [0, 2.12, -L / 2 + 0.01], outline: false });
    add(g, box(0.9, 1.0, 0.1), frame, { p: [0, 0.6, -L / 2 - 0.02] });
  }
  if (style === 'log') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, cyl(0.09, 0.1, sz < 0 ? 1.2 : 0.7, 10), frame, { p: [sx * (w / 2 - 0.04), sz < 0 ? 0.6 : 0.35, sz * (L / 2 - 0.04)] });
    for (const y of [0.55, 0.85, 1.1]) add(g, cyl(0.07, 0.07, w - 0.1, 10), frame, { p: [0, y, -L / 2 - 0.02], r: [0, 0, Math.PI / 2] });
  }
  if (style === 'cloud') {
    // a puffy headboard made of soft clouds
    for (let k = 0; k < 5; k++) add(g, sph(0.32, 16, 12), toon(o.head ?? '#ffffff'), { p: [-w / 2 + 0.2 + k * ((w - 0.4) / 4), 0.85 + Math.sin(k * 1.3) * 0.12, -L / 2 - 0.05], s: [1, 1, 0.45] });
  }
  if (style === 'platform') add(g, box(w + 0.5, 0.06, L + 0.1), frame, { p: [0, 0.03, 0.02] }); // a wide low plinth, and a slim headboard
  if (style === 'platform') add(g, box(w + 0.5, 0.6, 0.06), frame, { p: [0, 0.38, -L / 2 - 0.02] });
  extra?.(g);
  return { use: () => floatEmoji(g, A, '💤', 0.9) };
}

// ---- kitchens: modular units (each one tile) in four finishes; line them up to build a kitchen ----
const KITCHEN = {
  white: { door: '#f6f4f0', top: '#e9e6ef', handle: ['#c0c6d4', true], vein: '#c9c3d8' },
  oak: { door: '#c99a62', top: '#a8723f', handle: ['#2b2b33', false], vein: null },
  mint: { door: '#9fd6b8', top: '#fbfaf6', handle: ['#d4af37', true], vein: null },
  black: { door: '#2a2a33', top: '#f2f0f5', handle: ['#d4af37', true], vein: '#c9c3d8' },
};
function kitchenUnit(g, A, finish, part) {
  const k = KITCHEN[finish], door = toon(k.door), top = toon(k.top), handle = k.handle[1] ? shiny(k.handle[0], { metalness: 0.7 }) : toon(k.handle[0]);
  const steel = shiny('#c8ced8', { metalness: 0.7, roughness: 0.3 }), dark = toon('#1d1f2e');
  const z0 = -0.2, D = 0.6, H = 0.88;
  const base = () => {
    add(g, box(0.98, H - 0.1, D - 0.04), door, { p: [0, (H - 0.1) / 2 + 0.08, z0] });
    add(g, box(0.94, 0.08, D - 0.1), dark, { p: [0, 0.04, z0 - 0.02], outline: false }); // the plinth
    add(g, box(1.0, 0.05, D + 0.02), top, { p: [0, H, z0 + 0.01] });
    if (k.vein) for (let i = 0; i < 3; i++) add(g, box(0.5, 0.002, 0.01), toon(k.vein), { p: [-0.2 + i * 0.2, H + 0.026, z0 - 0.15 + i * 0.12], r: [0, 0.4 - i * 0.3, 0], outline: false });
  };
  const doors = (n, y0 = 0.12, h = H - 0.2) => {
    const dw = 0.96 / n;
    for (let i = 0; i < n; i++) {
      const x = -0.48 + (i + 0.5) * dw;
      add(g, box(dw - 0.03, h, 0.02), door, { p: [x, y0 + h / 2, z0 + D / 2 - 0.005] });
      add(g, box(0.02, 0.14, 0.025), handle, { p: [x + (i % 2 ? -1 : 1) * (dw / 2 - 0.07), y0 + h - 0.12, z0 + D / 2 + 0.012], outline: false });
    }
  };
  if (part === 'counter' || part === 'counter_coffee' || part === 'counter_micro') {
    base(); doors(2);
    if (part === 'counter_coffee') {
      add(g, box(0.26, 0.34, 0.26), dark, { p: [0.15, H + 0.195, z0 - 0.05] });
      add(g, box(0.2, 0.06, 0.12), steel, { p: [0.15, H + 0.12, z0 + 0.06], outline: false });
      add(g, cyl(0.035, 0.03, 0.07, 12), toon('#ffffff'), { p: [0.15, H + 0.06, z0 + 0.06] });
      add(g, sph(0.025, 8, 6), basic('#6ee7a0'), { p: [0.08, H + 0.3, z0 + 0.081], outline: false });
      add(g, cyl(0.07, 0.06, 0.1, 14), toon('#f2c14e'), { p: [-0.25, H + 0.075, z0] }); // a jar of beans
    }
    if (part === 'counter_micro') {
      add(g, box(0.5, 0.28, 0.34), steel, { p: [0.05, H + 0.165, z0 - 0.04] });
      add(g, plane(0.32, 0.2), toon('#1d1f2e'), { p: [-0.02, H + 0.165, z0 + 0.131], outline: false, cast: false });
      add(g, plane(0.08, 0.04), basic('#6ee7a0'), { p: [0.22, H + 0.24, z0 + 0.131], outline: false, cast: false });
    }
  } else if (part === 'drawers') {
    base();
    for (let i = 0; i < 3; i++) {
      add(g, box(0.93, 0.21, 0.02), door, { p: [0, 0.2 + i * 0.23, z0 + D / 2 - 0.005] });
      add(g, box(0.3, 0.02, 0.025), handle, { p: [0, 0.27 + i * 0.23, z0 + D / 2 + 0.012], outline: false });
    }
  } else if (part === 'sink') {
    base(); doors(2);
    add(g, box(0.62, 0.02, 0.4), steel, { p: [0, H + 0.016, z0 + 0.02], outline: false });
    add(g, box(0.56, 0.02, 0.34), toon('#8d96a8'), { p: [0, H + 0.02, z0 + 0.02], outline: false });
    add(g, cyl(0.02, 0.02, 0.32, 8), steel, { p: [0, H + 0.18, z0 - 0.22] });
    add(g, cyl(0.016, 0.016, 0.2, 8), steel, { p: [0, H + 0.33, z0 - 0.13], r: [Math.PI / 2, 0, 0] });
    for (const s of [-1, 1]) add(g, cyl(0.025, 0.025, 0.04, 8), steel, { p: [s * 0.1, H + 0.05, z0 - 0.22] });
  } else if (part === 'stove') {
    // an oven with a glass door and four burners that glow when it's on
    add(g, box(0.98, H - 0.1, D - 0.04), steel, { p: [0, (H - 0.1) / 2 + 0.08, z0] });
    add(g, box(0.94, 0.08, D - 0.1), dark, { p: [0, 0.04, z0 - 0.02], outline: false });
    add(g, box(1.0, 0.05, D + 0.02), dark, { p: [0, H, z0 + 0.01] });
    add(g, box(0.8, 0.46, 0.02), dark, { p: [0, 0.4, z0 + D / 2 - 0.005] });
    add(g, plane(0.6, 0.28), toon('#3a2a20'), { p: [0, 0.42, z0 + D / 2 + 0.008], outline: false, cast: false });
    add(g, box(0.7, 0.03, 0.04), steel, { p: [0, 0.66, z0 + D / 2 + 0.025], outline: false });
    for (let i = 0; i < 4; i++) add(g, cyl(0.025, 0.025, 0.03, 10), toon('#2b2b33'), { p: [-0.3 + i * 0.2, 0.76, z0 + D / 2 + 0.01], r: [Math.PI / 2, 0, 0], outline: false });
    const glow = toon('#2b2b33').clone();
    glow.emissive = new THREE.Color('#ff4a1a'); glow.emissiveIntensity = 0;
    for (const [x, z] of [[-0.22, -0.1], [0.22, -0.1], [-0.22, 0.12], [0.22, 0.12]]) add(g, geo('burner', () => new THREE.TorusGeometry(0.08, 0.015, 6, 20)), glow, { p: [x, H + 0.03, z0 + z], r: [Math.PI / 2, 0, 0], outline: false });
    add(g, cyl(0.12, 0.1, 0.12, 16), toon('#e0463c'), { p: [0.22, H + 0.09, z0 + 0.12] }); // a pot on the back
    let on = false;
    return { use: () => { on = !on; glow.emissiveIntensity = on ? 1 : 0; floatEmoji(g, A, on ? '🔥' : '🍳', 1.2); } };
  } else if (part === 'fridge') {
    add(g, box(0.92, 1.9, 0.66), door, { p: [0, 0.97, z0 + 0.02] });
    add(g, box(0.88, 0.02, 0.02), toon(shade(k.door, -0.2)), { p: [0, 1.3, z0 + 0.36], outline: false });
    for (const [y, h] of [[1.62, 0.5], [0.75, 0.9]]) add(g, box(0.03, Math.min(0.45, h * 0.6), 0.04), handle, { p: [0.36, y, z0 + 0.38], outline: false });
    add(g, box(0.18, 0.12, 0.01), toon('#ffd84d'), { p: [-0.2, 1.05, z0 + 0.36], r: [0, 0, 0.1], outline: false }); // a note
    add(g, sph(0.025, 8, 6), toon('#e0463c'), { p: [-0.2, 1.11, z0 + 0.37], outline: false });
  } else if (part === 'dishwasher') {
    base();
    add(g, box(0.92, H - 0.2, 0.02), steel, { p: [0, 0.12 + (H - 0.2) / 2, z0 + D / 2 - 0.005] });
    add(g, box(0.6, 0.03, 0.04), steel, { p: [0, H - 0.13, z0 + D / 2 + 0.02], outline: false });
    add(g, plane(0.1, 0.03), basic('#39c6ff'), { p: [0.35, H - 0.13, z0 + D / 2 + 0.01], outline: false, cast: false });
  } else if (part === 'island') {
    // two tiles long, with an overhang on the front for stools
    add(g, box(1.9, H - 0.1, 0.62), door, { p: [0, (H - 0.1) / 2 + 0.08, -0.12] });
    add(g, box(1.86, 0.08, 0.56), dark, { p: [0, 0.04, -0.14], outline: false });
    add(g, box(2.0, 0.05, 0.98), top, { p: [0, H, 0.04] });
    for (let i = 0; i < 4; i++) add(g, box(0.42, H - 0.24, 0.02), door, { p: [-0.72 + i * 0.48, 0.12 + (H - 0.24) / 2, -0.43] });
    add(g, cyl(0.16, 0.12, 0.08, 16), toon('#ffffff'), { p: [-0.4, H + 0.065, 0.05] }); // a fruit bowl
    for (const [x, z, c] of [[-0.45, 0.03, '#e0463c'], [-0.36, 0.08, '#ffd84d'], [-0.4, -0.02, '#6ee7a0']]) add(g, sph(0.05, 8, 6), toon(c), { p: [x, H + 0.13, z] });
  } else if (part === 'upper') {
    // a wall cabinet (hangs on the wall like decor)
    add(g, box(0.98, 0.62, 0.34), door, { p: [0, 0, 0.17] });
    for (const s of [-1, 1]) {
      add(g, box(0.46, 0.58, 0.02), door, { p: [s * 0.245, 0, 0.345] });
      add(g, box(0.02, 0.12, 0.025), handle, { p: [s * 0.04, -0.2, 0.36], outline: false });
    }
  }
  return {};
}
function barStool(g, A, seat, legs) {
  add(g, cyl(0.2, 0.18, 0.08, 18), toon(seat), { p: [0, 0.75, 0] });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; const l = add(g, cyl(0.018, 0.018, 0.74, 6), legs, { p: [Math.cos(a) * 0.13, 0.37, Math.sin(a) * 0.13], outline: false }); l.rotation.set(Math.sin(a) * -0.12, 0, Math.cos(a) * 0.12); }
  add(g, geo('stoolRing', () => new THREE.TorusGeometry(0.15, 0.012, 6, 20)), legs, { p: [0, 0.28, 0], r: [Math.PI / 2, 0, 0], outline: false });
}
function diningTable(g, A, { round = false, top, legs, w = 1.8 }) {
  if (round) {
    add(g, cyl(0.48, 0.48, 0.05, 32), top, { p: [0, 0.74, 0] });
    add(g, cyl(0.06, 0.08, 0.7, 12), legs, { p: [0, 0.36, 0] });
    add(g, cyl(0.3, 0.34, 0.05, 20), legs, { p: [0, 0.025, 0] });
  } else {
    add(g, box(w, 0.06, 0.9), top, { p: [0, 0.74, 0] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, box(0.07, 0.72, 0.07), legs, { p: [sx * (w / 2 - 0.08), 0.36, sz * 0.36] });
  }
  add(g, cyl(0.07, 0.05, 0.16, 14), toon('#ffffff'), { p: [0, 0.85, 0] });
  for (let k = 0; k < 3; k++) add(g, sph(0.05, 8, 6), toon(['#ff8fc7', '#ffd84d', '#ffffff'][k]), { p: [Math.cos(k * 2.1) * 0.04, 0.96, Math.sin(k * 2.1) * 0.04] });
}

Object.assign(FURNITURE, {
  // windows
  window_big(g) { windowFrame(g, 2.6, 1.3, { bars: [2, 0] }); },
  window_tall(g) { windowFrame(g, 0.8, 1.7, { bars: [0, 2] }); },
  window_round(g) { windowFrame(g, 0.8, 0.8, { round: true }); },
  window_wood(g) { windowFrame(g, 1.5, 1.0, { frame: '#8b5a2b', bars: [1, 1] }); },
  // desks
  desk_writing(g, A) { desk(g, A, { top: toon('#a8723f'), legs: toon('#8b5a2b'), legStyle: 'tapered', stuff: ['lamp', 'books', 'laptop'] }); },
  desk_computer(g, A) { desk(g, A, { top: toon('#f4f2ee'), legs: toon('#e6e2da'), drawers: true, stuff: ['monitor', 'plant'] }); },
  desk_standing(g, A) { desk(g, A, { top: toon('#c9a26a'), legs: toon('#2b2b33'), legStyle: 'frame', stuff: ['laptop', 'plant'] }); },
  desk_glass(g, A) { desk(g, A, { glass: true, top: toon('#ffffff'), legs: shiny('#c8ced8', { metalness: 0.7 }), legStyle: 'frame', stuff: ['laptop', 'books'] }); },
  desk_study(g, A) { desk(g, A, { top: toon('#e2c28e'), legs: toon('#c99a62'), hutch: true, stuff: ['lamp', 'laptop'] }); },
  desk_pink(g, A) { desk(g, A, { w: 1.4, top: toon('#ffd9ea'), legs: toon('#ffc2dd'), legStyle: 'tapered', stuff: ['mirror', 'plant'] }); },
  desk_rustic(g, A) { desk(g, A, { top: toon('#8b5a2b'), legs: toon('#6e4424'), legStyle: 'trestle', stuff: ['lamp', 'books'] }); },
  desk_gamer(g, A) { desk(g, A, { top: toon('#1d1f2e'), legs: toon('#ff4fd8'), legStyle: 'frame', stuff: ['monitor', 'pc'] }); },
  // beds
  bed_double(g, A) { return bigBed(g, A, { frame: toon('#a8723f'), blanket: '#5b8ff9' }); },
  bed_double_tufted(g, A) { return bigBed(g, A, { frame: toon('#8a8fa8'), blanket: '#e9e4f2', pillow: '#c9c3d8', style: 'tufted', head: '#8a8fa8' }); },
  bed_double_canopy(g, A) { return bigBed(g, A, { frame: toon('#f4f2ee'), blanket: '#ffc2dd', style: 'canopy', drape: '#fff0f6' }); },
  bed_double_cloud(g, A) { return bigBed(g, A, { frame: toon('#d9ecff'), blanket: '#b7d7ff', sheet: '#ffffff', style: 'cloud', low: true }); },
  bed_double_platform(g, A) { return bigBed(g, A, { frame: toon('#c99a62'), blanket: '#f4efe1', pillow: '#9a948c', style: 'platform', low: true }); },
  bed_king(g, A) { return bigBed(g, A, { w: 2.8, frame: toon('#5a3a22'), blanket: '#7a2335', style: 'panel' }); },
  bed_king_tufted(g, A) { return bigBed(g, A, { w: 2.8, frame: toon('#2a2a33'), blanket: '#1f2a5a', pillow: '#e8c27a', style: 'tufted', head: '#2f3a6b' }); },
  bed_king_log(g, A) { return bigBed(g, A, { w: 2.8, frame: toon('#8b5a2b'), blanket: '#2f6b4f', pillow: '#f4e3b5', style: 'log' }); },
  bed_king_canopy(g, A) { return bigBed(g, A, { w: 2.8, frame: toon('#d4af37'), blanket: '#f4efe1', pillow: '#ffffff', style: 'canopy', drape: '#fff8e8' }); },
  // kitchens
  bar_stool(g, A) { barStool(g, A, '#2a2a33', shiny('#c8ced8', { metalness: 0.7 })); },
  bar_stool_wood(g, A) { barStool(g, A, '#a8723f', toon('#8b5a2b')); },
  dining_table(g, A) { diningTable(g, A, { top: toon('#a8723f'), legs: toon('#8b5a2b') }); },
  dining_table_round(g, A) { diningTable(g, A, { round: true, top: toon('#f4f2ee'), legs: toon('#c99a62') }); },
});
for (const finish of Object.keys(KITCHEN)) {
  for (const part of ['counter', 'drawers', 'sink', 'stove', 'fridge', 'dishwasher', 'island', 'upper', 'counter_coffee', 'counter_micro']) {
    FURNITURE[`kit_${finish}_${part}`] = (g, A) => kitchenUnit(g, A, finish, part);
  }
}

// ---- plushies: prizes from the Arcade's claw machines (and furniture for your house). One squishy
// style for all of them: bears, animals, and little chibi anime characters. ----
const PLUSH = {
  // bears
  plush_bear_brown: { kind: 'bear', fur: '#a8723f', belly: '#e8c99a', bow: '#e0463c' },
  plush_bear_pink: { kind: 'bear', fur: '#ffb3d0', belly: '#ffe3ee', bow: '#ffffff' },
  plush_bear_blue: { kind: 'bear', fur: '#8fc4ff', belly: '#e3f1ff', bow: '#ffd84d' },
  plush_bear_white: { kind: 'bear', fur: '#f6f3ee', belly: '#ffffff', bow: '#39c6ff' },
  plush_bear_panda: { kind: 'bear', fur: '#ffffff', belly: '#ffffff', ears: '#1d1b2e', patches: '#1d1b2e', limbs: '#1d1b2e' },
  plush_bear_gold: { kind: 'bear', fur: '#ffcf4a', belly: '#fff2c2', bow: '#b03a48', shiny: true },
  plush_bear_lavender: { kind: 'bear', fur: '#c9b0f0', belly: '#f1e8ff', bow: '#ff8fc7' },
  // animals
  plush_bunny: { kind: 'bunny', fur: '#ffffff', belly: '#ffe3ee', inner: '#ffb3d0' },
  plush_cat: { kind: 'cat', fur: '#ff9f43', belly: '#fff1dc', inner: '#ffb3d0' },
  plush_cat_black: { kind: 'cat', fur: '#2b2b38', belly: '#3a3a4a', inner: '#ff8fc7', eyeCol: '#ffd84d' },
  plush_fox: { kind: 'fox', fur: '#ff7a2f', belly: '#ffffff', inner: '#2b1d14' },
  plush_frog: { kind: 'frog', fur: '#6ccf5a', belly: '#dff7b8' },
  plush_dino: { kind: 'dino', fur: '#6ee7a0', belly: '#e9fff2', spikes: '#ffd84d' },
  plush_penguin: { kind: 'penguin', fur: '#2b2f4a', belly: '#ffffff', beak: '#ff9f43' },
  plush_duck: { kind: 'duck', fur: '#ffd84d', belly: '#fff3b0', beak: '#ff9f43' },
  plush_octopus: { kind: 'octopus', fur: '#ff7aa8', belly: '#ffd0e0' },
  plush_axolotl: { kind: 'axolotl', fur: '#ffb3d0', belly: '#ffe3ee', gills: '#ff5d8f' },
  plush_shark: { kind: 'shark', fur: '#7f9cb8', belly: '#ffffff' },
  plush_pig: { kind: 'pig', fur: '#ffb6c8', belly: '#ffd6e0', inner: '#ff8fae' },
  // chibis
  plush_gojo: { kind: 'chibi', skin: '#ffe0c8', hair: '#f4f6ff', style: 'spiky', outfit: '#1d2340', extra: ['blindfold', 'collar'] },
  plush_sukuna: { kind: 'chibi', skin: '#ffd9c0', hair: '#ff9fb4', style: 'undercut', outfit: '#f4efe6', outfit2: '#1d1b2e', extra: ['marks', 'kimono'] },
  plush_itadori: { kind: 'chibi', skin: '#ffd9c0', hair: '#ff9fb4', style: 'undercut', hair2: '#4a2e22', outfit: '#1d2340', extra: ['hood'] },
  plush_megumi: { kind: 'chibi', skin: '#ffe0c8', hair: '#1d1b2e', style: 'spiky', outfit: '#1d2340', extra: ['collar'] },
  plush_naruto: { kind: 'chibi', skin: '#ffd2a8', hair: '#ffd23f', style: 'spiky', outfit: '#ff7a1a', outfit2: '#1d2340', extra: ['headband', 'whiskers'] },
  plush_goku: { kind: 'chibi', skin: '#ffd2a8', hair: '#1d1b2e', style: 'bigspiky', outfit: '#ff7a1a', outfit2: '#2f5bd6', extra: ['belt'] },
  plush_luffy: { kind: 'chibi', skin: '#ffd2a8', hair: '#1d1b2e', style: 'messy', outfit: '#d6283a', outfit2: '#3b6fd6', extra: ['strawhat', 'scar'] },
  plush_tanjiro: { kind: 'chibi', skin: '#ffd9c0', hair: '#7a2a2a', style: 'messy', outfit: '#1d1b2e', extra: ['checker', 'earrings', 'forehead'] },
  plush_nezuko: { kind: 'chibi', skin: '#ffe3d2', hair: '#1d1b2e', style: 'long', hair2: '#ff8a3d', outfit: '#ff9fc8', extra: ['muzzle', 'ribbon'] },
  plush_kakashi: { kind: 'chibi', skin: '#ffe0c8', hair: '#d8dbe6', style: 'spiky', outfit: '#3f5a46', extra: ['mask', 'headband'] },
  plush_sasuke: { kind: 'chibi', skin: '#ffe0c8', hair: '#1d1b2e', style: 'spiky', outfit: '#2b2f4a', extra: ['collar'] },
  plush_vegeta: { kind: 'chibi', skin: '#ffd2a8', hair: '#1d1b2e', style: 'bigspiky', outfit: '#2f5bd6', outfit2: '#ffffff', extra: ['armor'] },
  plush_zoro: { kind: 'chibi', skin: '#f2c49a', hair: '#4caf50', style: 'messy', outfit: '#ffffff', outfit2: '#2f6b4f', extra: ['earrings', 'sash'] },
  plush_zenitsu: { kind: 'chibi', skin: '#ffe0c8', hair: '#ffd23f', style: 'messy', outfit: '#ffd23f', outfit2: '#1d1b2e', extra: ['triangles'] },
  plush_deku: { kind: 'chibi', skin: '#ffe0c8', hair: '#2f6b4f', style: 'messy', outfit: '#3fae8a', outfit2: '#1d1b2e', extra: ['freckles'] },
  plush_todoroki: { kind: 'chibi', skin: '#ffe0c8', hair: '#f4f6ff', style: 'split', hair2: '#d6283a', outfit: '#2f3a6b', extra: ['scarEye'] },
  // little monsters
  plush_pikachu: { kind: 'mon', mon: 'pika', fur: '#ffd23f', belly: '#ffe680' },
  plush_charmander: { kind: 'mon', mon: 'char', fur: '#ff8a3d', belly: '#ffe0a0' },
  plush_squirtle: { kind: 'mon', mon: 'squirt', fur: '#7fd0f0', belly: '#ffe8a8' },
  plush_bulbasaur: { kind: 'mon', mon: 'bulba', fur: '#7fcfb0', belly: '#9fe0c4' },
  plush_jigglypuff: { kind: 'mon', mon: 'jiggly', fur: '#ffb3d0', belly: '#ffb3d0' },
  plush_eevee: { kind: 'mon', mon: 'eevee', fur: '#b7834f', belly: '#f4e3c0' },
  plush_gengar: { kind: 'mon', mon: 'gengar', fur: '#6a4caf', belly: '#6a4caf' },
  plush_snorlax: { kind: 'mon', mon: 'snorlax', fur: '#2f5a6b', belly: '#f4e3c0' },
};
const PLUSH_EMOJI = { mon: '⚡', bear: '🧸', bunny: '🐰', cat: '🐱', fox: '🦊', frog: '🐸', dino: '🦖', penguin: '🐧', duck: '🦆', octopus: '🐙', axolotl: '🦎', shark: '🦈', pig: '🐷', chibi: '✨' };
const checkerTex = canvasTexture(64, 64, (c) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = (x + y) % 2 ? '#1d1b2e' : '#2f8a5a'; c.fillRect(x * 16, y * 16, 16, 16); } });

/** A soft toy, about half a tile across and 0.55 tall, sitting on the floor facing +z. */
function plushie(g, A, sp) {
  const fur = sp.shiny ? shiny(sp.fur, { metalness: 0.35, roughness: 0.35 }) : toon(sp.fur), belly = toon(sp.belly ?? sp.fur), ink = basic('#1d1b2e'), white = basic('#ffffff');
  const P = new THREE.Group();
  g.add(P);
  const S = (geo, mat, p, s, r, outline = true) => add(P, geo, mat, { p, s, r, outline });
  const eyes = (y, z, gap = 0.07, r = 0.028, col = '#1d1b2e') => { for (const s of [-1, 1]) { const e = S(sph(r, 10, 8), basic(col), [s * gap, y, z], [1, 1.25, 0.5], null, false); S(sph(r * 0.38, 6, 5), white, [s * gap + 0.008, y + 0.01, z + 0.012], null, null, false); void e; } };
  const blush = (y, z, gap = 0.11) => { for (const s of [-1, 1]) S(sph(0.025, 8, 6), toon('#ff9fb4'), [s * gap, y, z], [1.3, 0.7, 0.3], null, false); };
  if (sp.kind === 'chibi') {
    const skin = toon(sp.skin), cloth = toon(sp.outfit), cloth2 = toon(sp.outfit2 ?? sp.outfit), hair = toon(sp.hair);
    // a little body with stubby arms and legs, then a big head
    S(cyl(0.1, 0.12, 0.17, 16), sp.extra.includes('checker') ? new THREE.MeshToonMaterial({ map: checkerTex }) : cloth, [0, 0.16, 0]);
    if (sp.extra.includes('kimono')) S(box(0.05, 0.17, 0.02), toon(sp.outfit2), [0, 0.16, 0.115], null, [0, 0, 0.3], false);
    if (sp.extra.includes('belt')) S(cyl(0.122, 0.122, 0.03, 16), toon(sp.outfit2), [0, 0.12, 0], null, null, false);
    for (const s of [-1, 1]) {
      S(sph(0.045, 10, 8), cloth2, [s * 0.055, 0.05, 0.03], [1, 0.9, 1.3]);
      S(sph(0.04, 10, 8), sp.extra.includes('checker') ? cloth : cloth, [s * 0.13, 0.17, 0.02], [0.9, 1.3, 0.9]);
      S(sph(0.025, 8, 6), skin, [s * 0.15, 0.12, 0.04], null, null, false);
    }
    const hy = 0.36;
    S(sph(0.16, 20, 16), skin, [0, hy, 0], [1.05, 0.98, 1]);
    // hair: a cap over the top and back, then the style on top
    S(sph(0.168, 20, 16), hair, [0, hy + 0.025, -0.02], [1.06, 0.95, 1.02]);
    if (sp.style === 'spiky' || sp.style === 'bigspiky') {
      const big = sp.style === 'bigspiky' ? 1.6 : 1;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU, up = k % 2 ? 0.9 : 1.1;
        S(cone(0.05 * big, 0.14 * big * up, 6), hair, [Math.cos(a) * 0.1, hy + 0.13 + Math.sin(a) * 0.02, Math.sin(a) * 0.1 - 0.02], null, [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]);
      }
      S(cone(0.06 * big, 0.18 * big, 6), hair, [0, hy + 0.2, -0.02]);
      for (let k = -2; k <= 2; k++) S(cone(0.035, 0.1, 5), hair, [k * 0.05, hy + 0.08, 0.13], null, [1.9, 0, k * 0.15], false); // a fringe
    } else if (sp.style === 'undercut') {
      for (let k = 0; k < 7; k++) { const a = Math.PI * (0.15 + (k / 6) * 0.7); S(cone(0.04, 0.09, 5), hair, [Math.cos(a) * 0.12, hy + 0.14, Math.sin(a) * 0.04], null, [0, 0, (Math.PI / 2 - a) * 0.6]); }
      S(sph(0.165, 16, 12), toon(sp.hair2 ?? shade(sp.hair, -0.35)), [0, hy - 0.01, -0.03], [1.04, 0.8, 1.0], null, false); // the shaved sides
      for (let k = -1; k <= 1; k++) S(cone(0.03, 0.08, 5), hair, [k * 0.05, hy + 0.1, 0.13], null, [1.9, 0, k * 0.2], false);
    } else if (sp.style === 'messy') {
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; S(sph(0.06, 8, 6), hair, [Math.cos(a) * 0.13, hy + 0.1 + (k % 3) * 0.02, Math.sin(a) * 0.12 - 0.01]); }
      for (let k = -2; k <= 2; k++) S(cone(0.04, 0.09, 5), hair, [k * 0.045, hy + 0.09, 0.135], null, [2, 0, k * 0.2], false);
    } else if (sp.style === 'split') {
      // half and half: one colour on the right, the other on the left
      S(geo('halfHair', () => new THREE.SphereGeometry(0.17, 16, 12, 0, Math.PI)), toon(sp.hair2), [0, hy + 0.03, -0.02], [1.06, 0.95, 1.02]);
      for (let k = -2; k <= 2; k++) S(cone(0.035, 0.1, 5), k < 0 ? toon(sp.hair2) : hair, [k * 0.045, hy + 0.09, 0.135], null, [2, 0, k * 0.15], false);
    } else if (sp.style === 'long') {
      S(box(0.3, 0.32, 0.1), hair, [0, hy - 0.1, -0.12]);
      S(box(0.3, 0.1, 0.1), toon(sp.hair2), [0, hy - 0.29, -0.12], null, null, false); // dip-dyed ends
      for (let k = -2; k <= 2; k++) S(cone(0.035, 0.09, 5), hair, [k * 0.045, hy + 0.09, 0.135], null, [2, 0, k * 0.15], false);
    }
    // face
    const fz = 0.152;
    if (sp.extra.includes('blindfold')) S(box(0.34, 0.06, 0.04), toon('#14141c'), [0, hy + 0.03, 0.135], null, null, false);
    else eyes(hy + 0.01, fz, 0.065, 0.03, sp.extra.includes('marks') ? '#b0172a' : '#1d1b2e');
    blush(hy - 0.045, fz - 0.01);
    S(sph(0.015, 8, 6), toon('#b03a48'), [0, hy - 0.06, fz], [1.4, 0.7, 0.4], null, false); // a little mouth
    if (sp.extra.includes('marks')) for (const s of [-1, 1]) { S(box(0.04, 0.008, 0.01), ink, [s * 0.065, hy - 0.03, fz + 0.002], null, null, false); S(box(0.04, 0.008, 0.01), ink, [s * 0.065, hy - 0.045, fz], null, null, false); S(sph(0.012, 6, 5), basic('#b0172a'), [s * 0.065, hy + 0.06, fz - 0.01], null, null, false); }
    if (sp.extra.includes('whiskers')) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) S(box(0.05, 0.006, 0.006), ink, [s * 0.1, hy - 0.025 - k * 0.015, fz - 0.015], null, [0, s * 0.4, 0], false);
    if (sp.extra.includes('scar')) S(box(0.006, 0.035, 0.006), toon('#b03a48'), [-0.07, hy - 0.035, fz + 0.002], null, null, false);
    if (sp.extra.includes('forehead')) S(box(0.04, 0.02, 0.006), toon('#b03a48'), [-0.05, hy + 0.08, fz - 0.01], null, null, false);
    if (sp.extra.includes('earrings')) for (const s of [-1, 1]) S(box(0.025, 0.05, 0.005), toon('#f4efe6'), [s * 0.165, hy - 0.06, 0], null, null, false);
    if (sp.extra.includes('mask')) S(sph(0.12, 14, 10), toon('#2b2f4a'), [0, hy - 0.06, 0.07], [1.25, 0.6, 0.9], null, false);
    if (sp.extra.includes('armor')) { S(cyl(0.12, 0.13, 0.12, 16), toon('#ffffff'), [0, 0.2, 0], null, null, false); for (const s of [-1, 1]) S(sph(0.05, 8, 6), toon('#ffd23f'), [s * 0.11, 0.25, 0.02], [1, 0.6, 1], null, false); }
    if (sp.extra.includes('sash')) S(box(0.26, 0.03, 0.03), toon(sp.outfit2), [0, 0.13, 0.11], null, [0, 0, 0.35], false);
    if (sp.extra.includes('triangles')) for (let k = 0; k < 4; k++) S(cone(0.03, 0.05, 3), toon('#ffffff'), [-0.08 + k * 0.055, 0.1, 0.12], null, [Math.PI / 2, 0, 0], false);
    if (sp.extra.includes('freckles')) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) S(sph(0.006, 5, 4), toon('#8b5a2b'), [s * (0.08 + k * 0.012), hy - 0.03 + (k % 2) * 0.01, fz - 0.012], null, null, false);
    if (sp.extra.includes('scarEye')) S(sph(0.05, 10, 8), toon('#c0563f'), [0.07, hy + 0.01, fz - 0.03], [1.2, 1, 0.3], null, false);
    if (sp.extra.includes('muzzle')) S(cyl(0.018, 0.018, 0.2, 8), toon('#7fae5a'), [0, hy - 0.055, fz + 0.01], null, [0, 0, Math.PI / 2]);
    if (sp.extra.includes('ribbon')) S(sph(0.05, 10, 8), toon('#ff8fc7'), [0.08, hy + 0.12, -0.08], [1.4, 0.7, 0.5]);
    if (sp.extra.includes('headband')) { S(cyl(0.172, 0.172, 0.04, 20, true), toon('#2f5bd6'), [0, hy + 0.06, 0], null, null, false); S(box(0.11, 0.045, 0.01), shiny('#c8ced8', { metalness: 0.6 }), [0, hy + 0.06, 0.168], null, null, false); }
    if (sp.extra.includes('collar')) S(cyl(0.1, 0.11, 0.06, 16), cloth, [0, 0.27, 0]);
    if (sp.extra.includes('hood')) S(geo('hoodRing', () => new THREE.TorusGeometry(0.1, 0.035, 8, 16)), toon('#d6283a'), [0, 0.26, -0.01], null, [Math.PI / 2, 0, 0]);
    if (sp.extra.includes('strawhat')) {
      S(cyl(0.26, 0.26, 0.015, 24), toon('#f2d27a'), [0, hy + 0.15, 0], null, [0.12, 0, 0]);
      S(cyl(0.13, 0.15, 0.09, 18), toon('#f2d27a'), [0, hy + 0.2, -0.01], null, [0.12, 0, 0]);
      S(cyl(0.152, 0.152, 0.03, 18, true), toon('#d6283a'), [0, hy + 0.17, -0.01], null, [0.12, 0, 0], false);
    }
    return { use: () => floatEmoji(g, A, '💖', 0.7) };
  }
  if (sp.kind === 'mon') return monPlush(g, A, P, S, sp, fur, belly, ink, white, eyes, blush);
  // animals: a round body and a round head, then each kind's features
  const tall = sp.kind === 'penguin' || sp.kind === 'duck';
  if (sp.kind !== 'octopus') {
    S(sph(0.15, 18, 14), fur, [0, 0.15, 0], [1, tall ? 1.15 : 0.95, 0.95]);
    S(sph(0.09, 14, 10), belly, [0, 0.14, 0.09], [1, 1.1, 0.5], null, false);
  }
  const hy = sp.kind === 'octopus' ? 0.22 : tall ? 0.38 : 0.37, hr = sp.kind === 'octopus' ? 0.18 : 0.14;
  S(sph(hr, 18, 14), sp.patches ? toon(sp.fur) : fur, [0, hy, 0.01], [1.05, sp.kind === 'octopus' ? 1.1 : 0.95, 1]);
  const fz = hr * 0.94 + 0.01;
  const limbs = toon(sp.limbs ?? sp.fur);
  if (!['octopus', 'shark', 'penguin', 'duck'].includes(sp.kind)) for (const s of [-1, 1]) {
    S(sph(0.05, 10, 8), limbs, [s * 0.13, 0.17, 0.05], [0.9, 1.3, 0.9]); // arms
    S(sph(0.055, 10, 8), limbs, [s * 0.08, 0.04, 0.09], [1, 0.7, 1.3]); // feet
  }
  const earCol = toon(sp.ears ?? sp.fur);
  if (sp.kind === 'bear' || sp.kind === 'pig') {
    for (const s of [-1, 1]) {
      S(sph(sp.kind === 'pig' ? 0.04 : 0.05, 10, 8), earCol, [s * 0.1, hy + 0.11, -0.01], sp.kind === 'pig' ? [1, 1.2, 0.5] : null);
      if (sp.patches) S(sph(0.04, 10, 8), toon(sp.patches), [s * 0.055, hy + 0.01, fz - 0.025], [1, 1.2, 0.5], null, false);
    }
    if (sp.kind === 'pig') { S(cyl(0.045, 0.045, 0.03, 14), toon(sp.inner), [0, hy - 0.03, fz], null, [Math.PI / 2, 0, 0], false); for (const s of [-1, 1]) S(sph(0.01, 6, 5), ink, [s * 0.016, hy - 0.03, fz + 0.016], null, null, false); }
    else { S(sph(0.05, 10, 8), toon(sp.belly), [0, hy - 0.035, fz - 0.02], [1.2, 0.85, 0.6], null, false); S(sph(0.016, 8, 6), ink, [0, hy - 0.02, fz + 0.005], null, null, false); }
    if (sp.bow) S(sph(0.04, 10, 8), toon(sp.bow), [0, 0.27, 0.1], [1.6, 0.7, 0.5]);
    eyes(hy + 0.01, fz - 0.01, 0.055, 0.022);
  } else if (sp.kind === 'bunny') {
    for (const s of [-1, 1]) { S(sph(0.04, 10, 8), fur, [s * 0.05, hy + 0.2, -0.01], [0.8, 2.6, 0.6], [0, 0, -s * 0.12]); S(sph(0.022, 8, 6), toon(sp.inner), [s * 0.05, hy + 0.2, 0.01], [0.7, 2.4, 0.3], [0, 0, -s * 0.12], false); }
    S(sph(0.016, 8, 6), toon(sp.inner), [0, hy - 0.02, fz], null, null, false);
    eyes(hy + 0.01, fz - 0.01, 0.055, 0.022);
  } else if (sp.kind === 'cat' || sp.kind === 'fox') {
    for (const s of [-1, 1]) { S(cone(0.05, 0.09, 4), fur, [s * 0.08, hy + 0.13, 0], null, [0, Math.PI / 4, -s * 0.25]); S(cone(0.028, 0.05, 4), toon(sp.inner), [s * 0.08, hy + 0.125, 0.02], null, [0, Math.PI / 4, -s * 0.25], false); }
    if (sp.kind === 'fox') {
      S(sph(0.06, 10, 8), belly, [0, hy - 0.035, fz - 0.02], [1.3, 0.8, 0.8], null, false);
      S(sph(0.07, 12, 10), fur, [0.1, 0.12, -0.15], [0.9, 0.9, 1.9], [0.3, 0.5, 0]); // a big bushy tail
      S(sph(0.045, 10, 8), belly, [0.15, 0.15, -0.27], null, null, false); // with a white tip
    }
    else S(capsuleGeo(0.025, 0.18), fur, [0.12, 0.12, -0.12], null, [0.6, 0, -0.9]);
    S(sph(0.014, 8, 6), toon(sp.kind === 'fox' ? '#1d1b2e' : '#ff8fae'), [0, hy - 0.02, fz + 0.005], null, null, false);
    eyes(hy + 0.01, fz - 0.01, 0.055, 0.024, sp.eyeCol ?? '#1d1b2e');
  } else if (sp.kind === 'frog') {
    for (const s of [-1, 1]) { S(sph(0.05, 12, 10), fur, [s * 0.07, hy + 0.1, 0.05]); S(sph(0.03, 10, 8), white, [s * 0.07, hy + 0.11, 0.09], null, null, false); S(sph(0.016, 8, 6), ink, [s * 0.07, hy + 0.11, 0.115], null, null, false); }
    S(geo('frogMouth', () => new THREE.TorusGeometry(0.06, 0.008, 6, 16, Math.PI)), ink, [0, hy - 0.02, fz - 0.005], null, [0, 0, Math.PI], false);
  } else if (sp.kind === 'dino') {
    for (let k = 0; k < 5; k++) S(cone(0.035, 0.07, 4), toon(sp.spikes), [0, hy + 0.12 - k * 0.07, -0.08 - k * 0.025], null, [-0.6 - k * 0.15, 0, 0]);
    S(cone(0.07, 0.22, 10), fur, [0, 0.1, -0.2], null, [-1.9, 0, 0]);
    eyes(hy + 0.02, fz - 0.01, 0.06, 0.024);
  } else if (sp.kind === 'penguin' || sp.kind === 'duck') {
    S(cone(0.035, 0.08, 8), toon(sp.beak), [0, hy - 0.02, fz + 0.02], [sp.kind === 'duck' ? 1.6 : 1, 1, sp.kind === 'duck' ? 0.6 : 1], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) { S(sph(0.05, 10, 8), fur, [s * 0.15, 0.17, 0], [0.5, 1.4, 0.9], [0, 0, s * 0.3]); S(sph(0.045, 8, 6), toon(sp.beak), [s * 0.06, 0.02, 0.08], [1, 0.4, 1.4], null, false); }
    if (sp.kind === 'duck') S(sph(0.03, 8, 6), fur, [0, hy + 0.14, 0], [0.6, 1.6, 0.6]);
    eyes(hy + 0.03, fz - 0.01, 0.055, 0.022);
  } else if (sp.kind === 'octopus') {
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.3; S(capsuleGeo(0.035, 0.12), fur, [Math.cos(a) * 0.13, 0.05, Math.sin(a) * 0.13], null, [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]); }
    eyes(hy, fz, 0.07, 0.03);
    blush(hy - 0.05, fz - 0.01, 0.12);
  } else if (sp.kind === 'axolotl') {
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) S(cone(0.022, 0.09, 6), toon(sp.gills), [s * 0.14, hy + 0.05 - k * 0.04, -0.02], null, [0, 0, -s * (1.0 + k * 0.4)]);
    S(capsuleGeo(0.04, 0.14), fur, [0, 0.12, -0.17], null, [1.2, 0, 0]);
    eyes(hy, fz - 0.005, 0.07, 0.022);
    S(geo('axoSmile', () => new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI)), ink, [0, hy - 0.04, fz], null, [0, 0, Math.PI], false);
  } else if (sp.kind === 'shark') {
    S(cone(0.06, 0.14, 4), fur, [0, hy + 0.16, -0.03], [0.4, 1, 1], [-0.3, 0, 0]);
    S(cone(0.07, 0.16, 4), fur, [0, 0.12, -0.2], [0.4, 1, 1], [-1.6, 0, 0]);
    for (const s of [-1, 1]) S(cone(0.05, 0.12, 4), fur, [s * 0.15, 0.13, 0.02], [1, 1, 0.4], [0, 0, s * 1.9]);
    S(sph(0.1, 14, 10), belly, [0, hy - 0.06, fz - 0.06], [1.2, 0.6, 0.6], null, false);
    eyes(hy + 0.02, fz - 0.01, 0.07, 0.022);
    for (let k = -2; k <= 2; k++) S(cone(0.008, 0.016, 3), white, [k * 0.015, hy - 0.05, fz + 0.005], null, [Math.PI, 0, 0], false);
  }
  if (sp.kind !== 'octopus' && sp.kind !== 'axolotl') blush(hy - 0.035, fz - 0.02, 0.09);
  return { use: () => floatEmoji(g, A, '💖', 0.7) };
}
/** The little monsters: each its own shape (ears, tails, shells, bulbs, flames). */
function monPlush(g, A, P, S, sp, fur, belly, ink, white, eyes, blush) {
  const m = sp.mon;
  const red = toon('#ff4a4a');
  if (m === 'jiggly' || m === 'gengar' || m === 'snorlax') {
    // one big round body that's also the head
    const r = m === 'snorlax' ? 0.24 : 0.2, cy = r;
    S(sph(r, 20, 16), fur, [0, cy, 0], m === 'snorlax' ? [1.1, 1, 1] : null);
    if (m === 'jiggly') {
      S(sph(0.06, 10, 8), fur, [0.02, cy * 2 - 0.02, 0.12], [1, 1, 0.6], [0.6, 0, 0.4]); // the curl
      for (const s of [-1, 1]) { S(cone(0.07, 0.1, 4), fur, [s * 0.15, cy * 2 - 0.02, 0], null, [0, Math.PI / 4, -s * 0.5]); S(sph(0.04, 8, 6), fur, [s * 0.18, cy - 0.02, 0.06]); S(sph(0.05, 8, 6), fur, [s * 0.08, 0.03, 0.06], [1, 0.6, 1.2]); }
      for (const s of [-1, 1]) { S(sph(0.05, 12, 10), basic('#1d1b2e'), [s * 0.07, cy + 0.03, r * 0.9], [1, 1.1, 0.4], null, false); S(sph(0.035, 10, 8), basic('#3b9ce0'), [s * 0.07, cy + 0.02, r * 0.93], [1, 1.1, 0.4], null, false); S(sph(0.014, 6, 5), white, [s * 0.07 + 0.012, cy + 0.05, r * 0.95], null, null, false); }
      blush(cy - 0.05, r * 0.86, 0.12);
    } else if (m === 'gengar') {
      for (let k = 0; k < 7; k++) { const a = Math.PI * (0.15 + (k / 6) * 0.7); S(cone(0.04, 0.1, 5), fur, [Math.cos(a) * 0.17, cy + 0.14 + Math.sin(a) * 0.02, -0.08], null, [-0.4, 0, (Math.PI / 2 - a) * 0.7]); }
      for (const s of [-1, 1]) { S(cone(0.06, 0.12, 4), fur, [s * 0.13, cy * 2 - 0.02, 0], null, [0, Math.PI / 4, -s * 0.45]); S(sph(0.04, 8, 6), fur, [s * 0.2, cy - 0.03, 0.05]); S(sph(0.05, 8, 6), fur, [s * 0.09, 0.03, 0.06], [1, 0.6, 1.2]); }
      for (const s of [-1, 1]) S(sph(0.038, 10, 8), red, [s * 0.07, cy + 0.06, r * 0.88], [1.2, 0.8, 0.4], [0, 0, -s * 0.4], false);
      S(box(0.18, 0.04, 0.02), white, [0, cy - 0.04, r * 0.95], null, null, false); // the big grin
    } else {
      S(sph(0.18, 16, 12), belly, [0, cy - 0.02, 0.1], [1.1, 1.05, 0.6], null, false);
      S(sph(0.12, 14, 10), fur, [0, cy * 2 + 0.03, 0], [1.1, 0.9, 1]);
      S(sph(0.08, 12, 10), belly, [0, cy * 2 + 0.02, 0.06], [1.2, 0.9, 0.6], null, false);
      for (const s of [-1, 1]) { S(cone(0.035, 0.06, 4), fur, [s * 0.08, cy * 2 + 0.13, 0], null, [0, Math.PI / 4, -s * 0.3]); S(sph(0.05, 8, 6), fur, [s * 0.25, cy, 0.04]); S(sph(0.07, 8, 6), belly, [s * 0.12, 0.04, 0.12], [1, 0.6, 1.3]); S(box(0.03, 0.005, 0.01), ink, [s * 0.035, cy * 2 + 0.04, 0.12], null, null, false); }
      S(box(0.06, 0.005, 0.01), ink, [0, cy * 2 - 0.01, 0.125], null, null, false);
    }
    return { use: () => floatEmoji(g, A, '💖', 0.7) };
  }
  // the rest: a body and a head
  S(sph(0.14, 18, 14), fur, [0, 0.15, 0], [1, 0.95, 0.95]);
  if (m !== 'pika' && m !== 'eevee') S(sph(0.09, 14, 10), belly, [0, 0.14, 0.08], [1, 1.1, 0.5], null, false);
  const hy = 0.36, fz = 0.14;
  S(sph(0.14, 18, 14), fur, [0, hy, 0.01], [1.08, 0.95, 1]);
  for (const s of [-1, 1]) { S(sph(0.045, 10, 8), fur, [s * 0.12, 0.17, 0.05], [0.9, 1.3, 0.9]); S(sph(0.05, 10, 8), fur, [s * 0.08, 0.04, 0.08], [1, 0.7, 1.3]); }
  if (m === 'pika') {
    for (const s of [-1, 1]) { S(cone(0.045, 0.2, 6), fur, [s * 0.09, hy + 0.17, -0.01], null, [0, 0, -s * 0.35]); S(cone(0.03, 0.07, 6), ink, [s * 0.125, hy + 0.255, -0.01], null, [0, 0, -s * 0.35], false); S(sph(0.03, 8, 6), red, [s * 0.1, hy - 0.04, fz - 0.025], [1.1, 1, 0.4], null, false); }
    // the lightning-bolt tail
    for (const [x, y, w, h, r] of [[0.08, 0.18, 0.05, 0.12, -0.5], [0.13, 0.28, 0.05, 0.12, 0.5], [0.16, 0.38, 0.1, 0.12, -0.3]]) S(box(w, h, 0.03), fur, [x, y, -0.14], null, [0, 0, r]);
    for (const y of [0.18, 0.12]) S(box(0.12, 0.02, 0.01), toon('#8b5a2b'), [0, y, -0.13], null, null, false);
  } else if (m === 'char') {
    S(cone(0.05, 0.22, 10), fur, [0.06, 0.1, -0.17], null, [-1.4, 0, 0.3]);
    const flame = new THREE.Sprite(additive(flameTexture, 0xff7a2a, 0.95));
    flame.scale.set(0.12, 0.18, 1);
    flame.position.set(0.08, 0.16, -0.27);
    P.add(flame);
  } else if (m === 'squirt') {
    S(sph(0.15, 16, 12), toon('#a8723f'), [0, 0.16, -0.06], [1.05, 1, 0.75]); // the shell
    S(sph(0.12, 14, 10), toon('#f4e3a0'), [0, 0.15, 0.06], [1, 1.1, 0.5], null, false);
    S(geo('squirtTail', () => new THREE.TorusGeometry(0.05, 0.022, 6, 14, Math.PI * 1.5)), fur, [0, 0.06, -0.18], null, [0, Math.PI / 2, 0]);
  } else if (m === 'bulba') {
    S(sph(0.12, 14, 10), toon('#5fae6a'), [0, 0.28, -0.08], [1, 1.1, 1]); // the bulb
    for (let k = 0; k < 4; k++) S(cone(0.04, 0.1, 4), toon('#3f9a4a'), [Math.cos(k * 1.6) * 0.07, 0.36, -0.08 + Math.sin(k * 1.6) * 0.07], null, [Math.sin(k * 1.6) * 0.5, 0, -Math.cos(k * 1.6) * 0.5]);
    for (const s of [-1, 1]) S(cone(0.035, 0.06, 4), fur, [s * 0.1, hy + 0.12, 0], null, [0, Math.PI / 4, -s * 0.4]);
    for (const [x, y] of [[-0.06, hy + 0.08], [0.07, hy + 0.05], [0.1, 0.18]]) S(sph(0.025, 8, 6), toon('#4f9a85'), [x, y, 0.12], [1, 1, 0.4], null, false);
  } else if (m === 'eevee') {
    for (const s of [-1, 1]) S(cone(0.06, 0.2, 4), fur, [s * 0.11, hy + 0.15, -0.01], null, [0, Math.PI / 4, -s * 0.5]);
    S(sph(0.08, 12, 10), belly, [0, 0.27, 0.05], [1.6, 0.8, 1]); // the fluffy collar
    S(sph(0.08, 12, 10), fur, [0.05, 0.17, -0.17], [1, 1.2, 1.3], [0.5, 0, 0.3]);
    S(sph(0.05, 10, 8), belly, [0.07, 0.25, -0.22], null, null, false);
  }
  eyes(hy + 0.01, fz - 0.005, 0.06, m === 'char' || m === 'squirt' ? 0.028 : 0.024, m === 'bulba' ? '#c0283a' : '#1d1b2e');
  if (m !== 'pika') blush(hy - 0.035, fz - 0.02, 0.09);
  S(geo('monSmile', () => new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI)), ink, [0, hy - 0.035, fz], null, [0, 0, Math.PI], false);
  return { use: () => floatEmoji(g, A, '💖', 0.7) };
}
for (const [id, sp] of Object.entries(PLUSH)) FURNITURE[id] = (g, A) => plushie(g, A, sp);
export const PLUSH_IDS = Object.keys(PLUSH);
export const plushEmoji = (id) => PLUSH_EMOJI[PLUSH[id]?.kind] ?? '🧸';

export function buildFurniture(id, { drop = 0, len = 0, openings = [], caps = [true, true], color = null, text = null } = {}) {
  const data = FURN_DATA[id];
  if (data?.base) return buildFurniture(data.base, { drop, len, openings, caps, color: color ?? data.color, text });
  const group = new THREE.Group();
  const A = { anim: [], text }; // (text: what's written on it, for the chalkboard menu)
  let target = group;
  if (drop > 0 && !OWN_DROP.has(id)) {
    target = new THREE.Group();
    target.position.y = -drop;
    group.add(target);
    add(group, cyl(0.012, 0.012, drop, 5), toon('#3a3f5a'), { p: [0, -drop / 2, 0], outline: false });
  }
  const res = FURNITURE[id]?.(target, A, OWN_DROP.has(id) ? { drop } : len ? { len, openings, caps } : undefined) ?? {};
  if (color) recolor(group, color, data?.recolorFrom ?? null); // (recolorFrom: which colour is the one to change)
  return { group, use: res.use ?? null, anim: A.anim, A };
}

// ---------------------------------------------------------------------------
// floors + wallpapers
// ---------------------------------------------------------------------------

const surfaceCache = new Map();

function surface(id, draw, h = 256) {
  if (!surfaceCache.has(id)) {
    const tex = canvasTexture(256, h, draw);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    surfaceCache.set(id, tex);
  }
  return surfaceCache.get(id);
}

const FLOOR_DRAW = {
  floor_emerald(ctx) {
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
      ctx.fillStyle = (x + y) % 128 ? '#1f5a3a' : '#24684a'; ctx.fillRect(x, y, 64, 64);
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(x + 4, y + 4, 56, 8);
    }
    ctx.strokeStyle = '#123524'; ctx.lineWidth = 3;
    for (let k = 0; k <= 256; k += 64) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 256); ctx.moveTo(0, k); ctx.lineTo(256, k); ctx.stroke(); }
  },
  floor_olive(ctx) {
    const rnd = prng(41);
    ctx.fillStyle = '#4d5a2a'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = i % 2 ? 'rgba(110,125,60,.35)' : 'rgba(30,40,15,.3)'; ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
  },
  floor_espresso(ctx) {
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      ctx.fillStyle = row % 2 ? '#3a2416' : '#432a1a'; ctx.fillRect(0, y, 256, 30);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, y + 30, 256, 2);
      ctx.fillRect(((row * 97) % 200) + 20, y, 2, 30);
      ctx.fillStyle = 'rgba(255,220,180,.05)'; for (let k = 0; k < 4; k++) ctx.fillRect((row * 53 + k * 61) % 256, y + 8 + k * 5, 50, 1);
    }
  },
  floor_chestnut(ctx) {
    // a herringbone parquet in warm chestnut
    ctx.fillStyle = '#6e4224'; ctx.fillRect(0, 0, 256, 256);
    for (let y = -64; y < 320; y += 32) for (let x = -64; x < 320; x += 64) {
      for (const [dx, rot, col] of [[0, Math.PI / 4, '#7a4a28'], [32, -Math.PI / 4, '#8b5a32']]) {
        ctx.save(); ctx.translate(x + dx, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.fillRect(0, 0, 46, 23); ctx.strokeStyle = 'rgba(40,20,8,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(0, 0, 46, 23); ctx.restore();
      }
    }
  },
  floor_cocoa(ctx) {
    const rnd = prng(9);
    ctx.fillStyle = '#5a3d2b'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = i % 2 ? 'rgba(140,100,70,.3)' : 'rgba(30,18,10,.3)'; ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
  },
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
  // ---- nature ----
  floor_moss(ctx) {
    const rnd = prng(73);
    ctx.fillStyle = '#5f9e3a'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) { ctx.fillStyle = i % 3 ? 'rgba(150,210,90,.3)' : 'rgba(40,90,30,.28)'; ctx.beginPath(); ctx.arc(rnd() * 256, rnd() * 256, 1.5 + (i % 3), 0, TAU); ctx.fill(); }
  },
  floor_forest(ctx) {
    const rnd = prng(87);
    ctx.fillStyle = '#7a5a34'; ctx.fillRect(0, 0, 256, 256);
    const cols = ['#c9752e', '#e0a23a', '#9a5a2a', '#6f8a3a', '#b8452e'];
    for (let i = 0; i < 140; i++) {
      ctx.save(); ctx.translate(rnd() * 256, rnd() * 256); ctx.rotate(i * 1.7);
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke();
      ctx.restore();
    }
  },
  floor_pebbles(ctx) {
    const rnd = prng(94);
    ctx.fillStyle = '#8a8478'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 220; i++) { ctx.fillStyle = ['#c9c2b4', '#a8a090', '#d8d2c6', '#9aa3b5'][i % 4]; ctx.beginPath(); ctx.ellipse(rnd() * 256, rnd() * 256, 7 + (i % 4) * 2, 5 + (i % 3) * 2, i, 0, TAU); ctx.fill(); }
  },
  floor_bamboo(ctx) {
    for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = (x / 32) % 2 ? '#d8c27a' : '#cdb46a'; ctx.fillRect(x, 0, 30, 256);
      ctx.fillStyle = 'rgba(90,70,20,.35)'; ctx.fillRect(x + 30, 0, 2, 256);
      for (let y = ((x / 32) * 37) % 64; y < 256; y += 64) ctx.fillRect(x + 2, y, 26, 3);
    }
  },
  floor_clover(ctx) {
    const rnd = prng(87);
    ctx.fillStyle = '#6fbf5e'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * 256, y = rnd() * 256;
      ctx.fillStyle = i % 2 ? '#4f9e3e' : '#5fae4a';
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + i; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 4, 0, TAU); ctx.fill(); }
    }
    for (let i = 0; i < 10; i++) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(rnd() * 256, rnd() * 256, 3.5, 0, TAU); ctx.fill(); }
  },
  // ---- bathroom tiles ----
  floor_tile_white(ctx) { squareTiles(ctx, 4, ['#f7f8fa', '#eef1f5'], '#c9cfd8', 3); },
  floor_tile_blue(ctx) { squareTiles(ctx, 16, ['#5fa8e8', '#7fc0f0', '#4a8fd8', '#9fd2f5', '#ffffff'], '#e8f2fb', 1.5, true); },
  floor_tile_mint(ctx) { squareTiles(ctx, 8, ['#bfeee0', '#a8e4d2'], '#ffffff', 2); },
  floor_tile_hex(ctx) {
    ctx.fillStyle = '#d8dde3'; ctx.fillRect(0, 0, 256, 256);
    const r = 16, h = r * Math.sqrt(3);
    for (let row = -1; row < 256 / h + 1; row++) for (let col = -1; col < 256 / (r * 3) + 1; col++) {
      for (const off of [0, 1]) {
        const x = col * r * 3 + off * r * 1.5, y = row * h + off * h / 2;
        ctx.fillStyle = (row * 3 + col + off) % 7 === 0 ? '#2b2f4a' : '#ffffff';
        ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; ctx.lineTo(x + Math.cos(a) * (r - 1.5), y + Math.sin(a) * (r - 1.5)); } ctx.fill();
      }
    }
  },
  floor_tile_checker(ctx) { squareTiles(ctx, 8, ['#1d1b2e', '#f7f8fa'], '#9aa3b5', 1.5, false, true); },
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
  wall_forest_green(ctx) { plainWall(ctx, '#1b3a27'); },
  wall_olive(ctx) { plainWall(ctx, '#6b7a3a'); },
  wall_hunter(ctx) {
    ctx.fillStyle = '#2a4d34'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) { ctx.fillStyle = '#335c40'; ctx.fillRect(x, 0, 14, 256); ctx.fillStyle = 'rgba(255,220,140,.25)'; ctx.fillRect(x + 15, 0, 2, 256); }
  },
  wall_wainscot(ctx) { wainscot(ctx, '#2f5a3c', '#5a3a24'); },
  wall_mocha(ctx) { plainWall(ctx, '#7a5a44'); },
  wall_walnut(ctx) {
    ctx.fillStyle = '#4a2f1d'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) { ctx.fillStyle = (x / 32) % 2 ? '#523422' : '#45291a'; ctx.fillRect(x, 0, 30, 256); ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x + 30, 0, 2, 256); }
    const rnd = prng(5); ctx.fillStyle = 'rgba(255,210,170,.06)'; for (let i = 0; i < 60; i++) ctx.fillRect(rnd() * 256, rnd() * 256, 1, 30);
  },
  wall_damask(ctx) {
    ctx.fillStyle = '#4b3222'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#5c3f2c';
    for (let y = 0; y < 256; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < 288; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.quadraticCurveTo(x + 22, y + 32, x, y + 56); ctx.quadraticCurveTo(x - 22, y + 32, x, y + 8); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y + 32, 5, 0, TAU); ctx.fillStyle = '#6e4d36'; ctx.fill(); ctx.fillStyle = '#5c3f2c';
    }
  },
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
    // one tall mural: a blossoming branch reaching across the top, petals drifting down to the floor
    const H = ctx.canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ffe3ef'); g.addColorStop(1, '#fff8fb');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, H);
    ctx.strokeStyle = '#7a4a3c'; ctx.lineCap = 'round';
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-10, 40); ctx.bezierCurveTo(70, 20, 150, 80, 266, 36); ctx.stroke();
    ctx.lineWidth = 4;
    for (const [x0, y0, x1, y1] of [[60, 34, 95, 110], [150, 58, 190, 130], [210, 50, 240, 92], [110, 52, 120, 82]]) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + 12, (y0 + y1) / 2, x1, y1); ctx.stroke(); }
    const rnd = prng(12);
    const blossom = (x, y, r) => {
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + r; ctx.fillStyle = k % 2 ? '#ffb3d0' : '#ffc6dc'; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 5, 3.4, a, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#ff8fb8'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
    };
    for (let i = 0; i < 46; i++) { const x = rnd() * 256, y = 18 + rnd() * 120 * (0.4 + 0.6 * Math.abs(Math.sin(x / 50))); blossom(x, y, rnd() * TAU); }
    // a few petals drifting down, thinning out towards the floor
    for (let i = 0; i < 22; i++) { const y = 150 + Math.pow(rnd(), 1.6) * (H - 170); ctx.fillStyle = 'rgba(255,160,200,.7)'; ctx.beginPath(); ctx.ellipse(rnd() * 256, y, 3.5, 2, rnd() * TAU, 0, TAU); ctx.fill(); }
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
    // one tall mural: big tropical leaves growing up from the floor and hanging in from the top
    const H = ctx.canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#effae6'); g.addColorStop(1, '#dff2d4');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, H);
    const leaf = (x, y, len, a, col) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(20,70,30,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.95, 0); ctx.stroke();
      ctx.lineWidth = 1;
      for (let k = 1; k < 6; k++) { const t = (k / 6) * len; ctx.beginPath(); ctx.moveTo(t, 0); ctx.lineTo(t + len * 0.08, -len * 0.14); ctx.moveTo(t, 0); ctx.lineTo(t + len * 0.08, len * 0.14); ctx.stroke(); }
      ctx.restore();
    };
    const cols = ['#2f8a40', '#3f9a4a', '#56b25e', '#277a38'];
    // from the floor
    for (let i = 0; i < 9; i++) leaf(i * 30 + 10, H + 6, 120 + (i % 3) * 40, -Math.PI / 2 + (i % 2 ? 0.45 : -0.45) + Math.sin(i) * 0.2, cols[i % 4]);
    // hanging in from the top
    for (let i = 0; i < 6; i++) leaf(i * 46 + 20, -6, 80 + (i % 2) * 30, Math.PI / 2 + (i % 2 ? 0.5 : -0.5), cols[(i + 1) % 4]);
  },
  wall_forest(ctx) {
    // one tall mural: a sky, rolling hills, and a row of pines standing on the floor
    const H = ctx.canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#cdeeff'); g.addColorStop(0.55, '#e8f6e4'); g.addColorStop(1, '#bfe2ad');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, H);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const [x, y, r] of [[50, 60, 16], [68, 54, 20], [88, 62, 14], [190, 90, 14], [206, 84, 18]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#a8d898';
    ctx.beginPath(); ctx.moveTo(0, H * 0.62);
    for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, H * 0.62 - Math.sin((x / 256) * TAU) * 18);
    ctx.lineTo(256, H); ctx.lineTo(0, H); ctx.fill();
    const pine = (x, h, c) => {
      ctx.fillStyle = '#6e4a2a'; ctx.fillRect(x - 4, H - 30, 8, 30);
      ctx.fillStyle = c;
      for (let k = 0; k < 4; k++) { const top = H - 30 - h + k * (h / 4.5), w = 16 + k * 9; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w, top + h / 3); ctx.lineTo(x - w, top + h / 3); ctx.fill(); }
    };
    [[22, 190, '#4f9a4a'], [74, 240, '#3f8a4a'], [128, 170, '#5fae55'], [180, 230, '#3f7a42'], [232, 200, '#4f9a4a']].forEach(([x, h, c]) => pine(x, h, c));
  },
  wall_bamboo(ctx) {
    ctx.fillStyle = '#e8f0c8'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 10; x < 256; x += 42) {
      ctx.fillStyle = '#8fbf4a'; ctx.fillRect(x, 0, 12, 256);
      ctx.fillStyle = '#6f9f3a'; for (let y = (x * 3) % 50; y < 256; y += 50) ctx.fillRect(x - 1, y, 14, 3);
      ctx.fillStyle = '#5fae55';
      for (let y = (x * 7) % 80; y < 256; y += 80) { ctx.beginPath(); ctx.ellipse(x + 22, y, 14, 4, -0.5, 0, TAU); ctx.fill(); }
    }
  },
  wall_ivy(ctx) {
    ctx.fillStyle = '#f1ece0'; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#5a7a3a'; ctx.lineWidth = 2;
    for (let x = 20; x < 256; x += 64) { ctx.beginPath(); for (let y = 0; y <= 256; y += 8) ctx.lineTo(x + Math.sin(y / 20) * 12, y); ctx.stroke(); }
    for (let i = 0; i < 70; i++) {
      const y = (i * 37) % 256, x = 20 + (i % 4) * 64 + Math.sin(y / 20) * 12;
      ctx.fillStyle = i % 2 ? '#4f9a4a' : '#6fae5a';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (i % 2 ? 10 : -10), y - 6); ctx.lineTo(x + (i % 2 ? 6 : -6), y + 6); ctx.fill();
    }
  },
  wall_birch(ctx) {
    ctx.fillStyle = '#e8eedf'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 8; x < 256; x += 50) {
      ctx.fillStyle = '#f8f8f2'; ctx.fillRect(x, 0, 22, 256);
      ctx.fillStyle = '#2b2b30'; for (let y = (x * 5) % 40; y < 256; y += 28) ctx.fillRect(x + (y % 3) * 3, y, 8 + (y % 5), 3);
      ctx.fillStyle = 'rgba(120,160,90,.4)'; ctx.fillRect(x + 22, 0, 3, 256);
    }
  },
  wall_greenhouse(ctx) {
    // tall glass panes in white frames, with a bed of plants along the bottom
    const H = ctx.canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#d8f2ff'); g.addColorStop(1, '#d6f0e2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, H);
    ctx.fillStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 4; i++) ctx.fillRect(i * 64 + 8, 10, 14, H * 0.55);
    const rnd = prng(31);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = ['#3f9a4a', '#5fae55', '#7fbf4a'][i % 3]; ctx.beginPath(); ctx.ellipse(rnd() * 256, H - 18 - rnd() * 60, 18, 7, rnd() * TAU, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 8; i++) { ctx.fillStyle = ['#ff8fb8', '#ffd84d', '#ffffff'][i % 3]; ctx.beginPath(); ctx.arc(rnd() * 256, H - 30 - rnd() * 50, 4, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6;
    for (let x = 0; x <= 256; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (const y of [0, H * 0.4, H * 0.75]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
  },
  wall_tile_subway(ctx) { subwayTiles(ctx, '#fbfbfd', '#c9cfd8'); },
  wall_tile_mint(ctx) { subwayTiles(ctx, '#c9f0e2', '#ffffff'); },
  wall_tile_blue(ctx) { squareTiles(ctx, 8, ['#8fc4ee', '#a6d1f2'], '#ffffff', 2); },
  wall_tile_pink(ctx) { squareTiles(ctx, 8, ['#ffd0e2', '#ffc2d9'], '#ffffff', 2); },
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

/** A colour made lighter (k > 0) or darker (k < 0). */
function shade(c, k) {
  const col = new THREE.Color(c);
  return `#${(k >= 0 ? col.lerp(new THREE.Color('#ffffff'), k) : col.multiplyScalar(1 + k)).getHexString()}`;
}
/** Wood panelling along the bottom (about a third of the wall), paint above it, and a chair rail. */
function wainscot(ctx, upper, panel = '#5a3a24') {
  const H = ctx.canvas.height, top = Math.round(H * 0.7);
  plainWall(ctx, upper);
  ctx.fillStyle = panel; ctx.fillRect(0, top, 256, H - top);
  for (let x = 6; x < 256; x += 64) {
    ctx.strokeStyle = 'rgba(0,0,0,.32)'; ctx.lineWidth = 3; ctx.strokeRect(x, top + 16, 52, H - top - 34);
    ctx.strokeStyle = 'rgba(255,230,190,.14)'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, top + 20, 44, H - top - 42);
  }
  ctx.fillStyle = shade(panel, 0.12); ctx.fillRect(0, top - 8, 256, 12);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(0, top + 4, 256, 3);
}
/** One colour up top and another below a white rail. */
function twoTone(ctx, upper, lower) {
  const H = ctx.canvas.height, mid = Math.round(H * 0.62);
  plainWall(ctx, upper);
  ctx.fillStyle = lower; ctx.fillRect(0, mid, 256, H - mid);
  ctx.fillStyle = '#fbf8f2'; ctx.fillRect(0, mid - 6, 256, 9);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, mid + 3, 256, 2);
}
function stripes(ctx, a, b, n = 8) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.fillRect(i * (256 / n), 0, 256 / n, 256); }
}
function damaskWall(ctx, c, motif) {
  plainWall(ctx, c);
  for (let y = 0; y < 256; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < 288; x += 64) {
    ctx.fillStyle = motif;
    ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.quadraticCurveTo(x + 24, y + 32, x, y + 58); ctx.quadraticCurveTo(x - 24, y + 32, x, y + 6); ctx.fill();
    ctx.fillStyle = shade(motif, 0.12); ctx.beginPath(); ctx.arc(x, y + 32, 6, 0, TAU); ctx.fill();
    for (const s of [-1, 1]) { ctx.fillStyle = motif; ctx.beginPath(); ctx.ellipse(x + s * 14, y + 20, 7, 3, s * 0.7, 0, TAU); ctx.fill(); }
  }
}
function brickWall(ctx, c, mortar) {
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, 256, 256);
  const rnd = prng(31);
  for (let row = 0; row < 16; row++) for (let x = (row % 2) * -32; x < 256; x += 64) {
    ctx.fillStyle = shade(c, (rnd() - 0.5) * 0.18); ctx.fillRect(x + 2, row * 16 + 2, 60, 12);
  }
}
function woodPanels(ctx, c) {
  ctx.fillStyle = c; ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = (x / 32) % 2 ? shade(c, 0.05) : shade(c, -0.07); ctx.fillRect(x, 0, 30, 256);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + 30, 0, 2, 256);
  }
}
function planks(ctx, c) {
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    ctx.fillStyle = row % 2 ? shade(c, -0.06) : shade(c, 0.04); ctx.fillRect(0, y, 256, 30);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(0, y + 30, 256, 2); ctx.fillRect(((row * 97) % 200) + 20, y, 2, 30);
    ctx.fillStyle = 'rgba(0,0,0,.07)';
    for (let k = 0; k < 5; k++) ctx.fillRect((row * 53 + k * 47) % 256, y + 8 + (k % 3) * 6, 26, 2);
  }
}
/** Floors, wallpapers and ceilings that are just a style and a colour (or two) in cosmetics.json. */
const DECO = Object.fromEntries([...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings].map((d) => [d.id, d]));
function decoDraw(d, kind) {
  if (!d?.color) return null;
  const c = d.color, c2 = d.color2;
  const styles = {
    wall: {
      wainscot: (x) => wainscot(x, c, c2 ?? '#5a3a24'), twotone: (x) => twoTone(x, c, c2 ?? '#ffffff'),
      stripes: (x) => stripes(x, c, c2 ?? '#ffffff'), subway: (x) => subwayTiles(x, c, c2 ?? '#ffffff'), panels: (x) => woodPanels(x, c),
      lined: (x) => linedWall(x, c), damask: (x) => damaskWall(x, c, c2 ?? shade(c, 0.12)), brick: (x) => brickWall(x, c, c2 ?? shade(c, -0.35)),
      linen: (x) => { plainWall(x, c); const rnd = prng(9); for (let i = 0; i < 900; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.06)'; x.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1); } },
    },
    floor: {
      carpet: (x) => carpet(x, c, 'rgba(255,255,255,.08)', 'rgba(0,0,0,.08)'), planks: (x) => planks(x, c),
      tiles: (x) => squareTiles(x, 4, [c, shade(c, 0.06)], c2 ?? shade(c, -0.25), 3),
      checker: (x) => squareTiles(x, 4, [c, c2 ?? '#f4f0e8'], shade(c, -0.2), 1.5, false, true),
      paint: (x) => { x.fillStyle = c; x.fillRect(0, 0, 256, 256); },
    },
    ceiling: {
      coffered: (x) => { x.fillStyle = c; x.fillRect(0, 0, 256, 256); for (let yy = 0; yy < 256; yy += 64) for (let xx = 0; xx < 256; xx += 64) { x.fillStyle = shade(c, -0.08); x.fillRect(xx + 8, yy + 8, 48, 48); x.fillStyle = shade(c, -0.14); x.fillRect(xx + 14, yy + 14, 36, 36); } },
      planks: (x) => planks(x, c),
      tiles: (x) => squareTiles(x, 4, [c, shade(c, 0.05)], c2 ?? shade(c, -0.2), 2.5),
      stars: (x) => { x.fillStyle = c; x.fillRect(0, 0, 256, 256); const rnd = prng(17); for (let i = 0; i < 70; i++) { x.fillStyle = i % 6 ? '#ffffff' : (c2 ?? '#ffd84d'); x.beginPath(); x.arc(rnd() * 256, rnd() * 256, i % 6 ? 1.2 : 2.6, 0, TAU); x.fill(); } },
      beams: (x) => { plainWall(x, c); for (let k = 0; k < 256; k += 64) { x.fillStyle = c2 ?? '#6e4424'; x.fillRect(k, 0, 18, 256); x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(k + 14, 0, 4, 256); } },
    },
  };
  return styles[kind]?.[d.style] ?? ((x) => plainWall(x, c));
}
const TALL_STYLES = new Set(['wainscot', 'twotone']);
const TALL_WALLS = new Set(['wall_wainscot', 'wall_sakura', 'wall_jungle', 'wall_forest', 'wall_greenhouse']);
/** Wallpapers drawn as one picture from the floor to the ceiling (they repeat sideways, never upwards). */
export const wallIsTall = (id) => TALL_WALLS.has(id) || TALL_STYLES.has(DECO[id]?.style);
const WALL_TALL_PX = 410; // (256 px per 2 tiles across, so 410 for the 3.2 tiles up)

function plainWall(ctx, color) {
  const H = ctx.canvas.height; // (full-height wallpapers are taller than 256)
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, H); // (just the colour: the lined ones are their own style, below)
}
function linedWall(ctx, color) {
  const H = ctx.canvas.height;
  plainWall(ctx, color);
  ctx.fillStyle = 'rgba(0,0,0,.07)';
  for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 2, H);
}

const CEIL_DRAW = {
  ceil_galaxy(ctx) {
    const g = ctx.createRadialGradient(90, 110, 10, 128, 128, 200);
    g.addColorStop(0, '#b25bff'); g.addColorStop(0.35, '#4a2a9a'); g.addColorStop(0.7, '#1a1a4a'); g.addColorStop(1, '#0d0d26');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(255,120,220,.18)'; ctx.beginPath(); ctx.ellipse(170, 170, 70, 30, 0.6, 0, TAU); ctx.fill();
    const rnd = prng(23);
    for (let i = 0; i < 90; i++) { ctx.fillStyle = i % 9 ? 'rgba(255,255,255,.9)' : '#9fe8ff'; ctx.beginPath(); ctx.arc(rnd() * 256, rnd() * 256, i % 9 ? 1 : 2.4, 0, TAU); ctx.fill(); }
  },
  ceil_sunset(ctx) {
    const g = ctx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, '#ff7a59'); g.addColorStop(0.5, '#ffb36b'); g.addColorStop(1, '#c86bd0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(255,240,220,.55)';
    for (const [x, y, r] of [[50, 80, 22], [75, 74, 18], [190, 180, 26], [215, 172, 20]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  },
  ceil_clouds(ctx) {
    ctx.fillStyle = '#9fd4ff'; ctx.fillRect(0, 0, 256, 256);
    const rnd = prng(41);
    for (let i = 0; i < 9; i++) { const x = rnd() * 256, y = rnd() * 256; ctx.fillStyle = 'rgba(255,255,255,.92)'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + k * 13 - 26, y + Math.sin(k) * 6, 14 + (k % 2) * 5, 0, TAU); ctx.fill(); } }
  },
  ceil_rainbow(ctx) {
    ['#ff8a8a', '#ffc27a', '#fff09a', '#a8f0a0', '#9fd8ff', '#c8a8ff'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, (i * 256) / 6, 256, 256 / 6 + 1); });
  },
  ceil_stained(ctx) {
    ctx.fillStyle = '#2b2f4a'; ctx.fillRect(0, 0, 256, 256);
    const cols = ['#ff5d73', '#39c6ff', '#ffd84d', '#6ee7a0', '#b77bff'];
    for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) {
      ctx.fillStyle = cols[(xx * 3 + yy * 2) % 5];
      ctx.beginPath(); ctx.moveTo(xx * 64 + 32, yy * 64 + 4); ctx.lineTo(xx * 64 + 60, yy * 64 + 32); ctx.lineTo(xx * 64 + 32, yy * 64 + 60); ctx.lineTo(xx * 64 + 4, yy * 64 + 32); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.15)'; for (let i = 0; i < 16; i++) ctx.fillRect((i % 4) * 64 + 20, Math.floor(i / 4) * 64 + 16, 8, 14);
  },
  ceil_forest(ctx) { plainWall(ctx, '#2c5238'); },
  ceil_walnut(ctx) {
    for (let x = 0; x < 256; x += 32) { ctx.fillStyle = (x / 32) % 2 ? '#523422' : '#46291a'; ctx.fillRect(x, 0, 30, 256); ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x + 30, 0, 2, 256); }
  },
  ceil_mocha_beams(ctx) {
    ctx.fillStyle = '#8a6a52'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 64) { ctx.fillStyle = '#3e2718'; ctx.fillRect(x, 0, 20, 256); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + 16, 0, 4, 256); }
  },
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
  ceil_canopy(ctx) {
    const rnd = prng(80);
    ctx.fillStyle = '#9fd8ff'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 120; i++) { ctx.fillStyle = ['#3f8a4a', '#5fae55', '#7fbf4a', '#4f9a4a'][i % 4]; ctx.beginPath(); ctx.ellipse(rnd() * 256, rnd() * 256, 16, 8, i, 0, TAU); ctx.fill(); }
  },
  ceil_greenhouse(ctx) {
    const g = ctx.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#bfe8ff'); g.addColorStop(1, '#e4f6ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(80, 70, 22, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
    for (let x = 0; x <= 256; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(256, x); ctx.stroke(); }
  },
  ceil_tile(ctx) { squareTiles(ctx, 4, ['#fbfbfd', '#f1f3f6'], '#d4d9e0', 2.5); },
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
export const ceilingTexture = (id) => surface(id, CEIL_DRAW[id] ?? decoDraw(DECO[id], 'ceiling') ?? CEIL_DRAW.ceil_plain);
export const floorTexture = (id) => surface(id, FLOOR_DRAW[id] ?? decoDraw(DECO[id], 'floor') ?? FLOOR_DRAW.floor_wood);
export const wallTexture = (id) => surface(id, WALL_DRAW[id] ?? decoDraw(DECO[id], 'wall') ?? WALL_DRAW.wall_cream, wallIsTall(id) ? WALL_TALL_PX : 256);

/** n x n tiles with grout lines; `mosaic`: colours scattered, `checker`: alternating. */
/** A little seeded random number generator (0..1), so patterns look scattered but never change. */
function prng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function squareTiles(ctx, n, cols, grout, gw, mosaic = false, checker = false) {
  const s = 256 / n;
  ctx.fillStyle = grout; ctx.fillRect(0, 0, 256, 256);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    ctx.fillStyle = checker ? cols[(r + c) % 2] : mosaic ? cols[(r * 7 + c * 13 + r * c) % cols.length] : cols[(r * 3 + c * 5) % 3 === 0 ? 1 : 0];
    ctx.fillRect(c * s + gw / 2, r * s + gw / 2, s - gw, s - gw);
    if (!mosaic && !checker) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(c * s + gw / 2 + 3, r * s + gw / 2 + 3, s * 0.3, 2); }
  }
}
/** Brick-pattern glossy subway tiles. */
function subwayTiles(ctx, col, grout) {
  ctx.fillStyle = grout; ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) for (let x = (row % 2) * -32; x < 256; x += 64) {
    ctx.fillStyle = col; ctx.fillRect(x + 1.5, row * 16 + 1.5, 61, 13);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(x + 5, row * 16 + 3.5, 20, 2);
  }
}

function carpet(ctx, base, light, dark) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const rnd = prng(7); // (scattered, so the pile doesn't line up into stripes)
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = i % 2 ? light : dark;
    ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
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
  const kind = FLOOR_DRAW[id] || CATALOG.floors.some((d) => d.id === id) ? 'floor' : CEIL_DRAW[id] || CATALOG.ceilings.some((d) => d.id === id) ? 'ceiling' : 'wall';
  const tex = kind === 'floor' ? floorTexture(id) : kind === 'ceiling' ? ceilingTexture(id) : wallTexture(id);
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
  const flat = ['rug', 'rug_round', 'rug_heart', 'rug_fluffy', 'bath_mat'].includes(id);
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
