// 3D building models. Each builder gets the spot and returns a Group centered on the spot's
// footprint, with its front (door side) facing +Z. `anim` collects per-frame animation callbacks.
import * as THREE from 'three';
import { TAU, toon, basic, shiny, outlineMaterial, canvasTexture, emojiTexture, additive, glowTexture } from './materials.js';
import { Character } from './character.js';
import { PX } from '../map.js';

const faceted = (geo) => { const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); return g; };

const OUT = outlineMaterial(0.045);

function add(parent, geometry, material, { p = [0, 0, 0], r = null, s = null, outline = false, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  if (s) m.scale.set(...s);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (outline) m.add(new THREE.Mesh(geometry, OUT));
  parent.add(m);
  return m;
}

// ---- textures ----------------------------------------------------------------

const sidingTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = 'rgba(0,0,0,.09)';
    ctx.fillRect(0, y + 28, 256, 4);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(0, y, 256, 3);
  }
});
const plankTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = 'rgba(60,30,0,.14)';
    ctx.fillRect(x + 29, 0, 3, 256);
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = 'rgba(60,30,0,.06)';
      ctx.fillRect(x + 4 + ((k * 37) % 22), (k * 53) % 256, 2, 30);
    }
  }
});
const shingleTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.fillRect(0, y + 28, 256, 4);
    for (let x = (row % 2) * 24; x < 256; x += 48) ctx.fillRect(x, y, 3, 30);
  }
});
const stoneTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    for (let x = (row % 2) * 32 - 32; x < 256; x += 64) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + ((x * 7 + row * 13) % 5) * 0.015})`;
      ctx.fillRect(x + 2, row * 32 + 2, 60, 28);
    }
  }
});
const rollerTex = canvasTexture(128, 256, (ctx) => {
  ctx.fillStyle = '#c3c9d6';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 16) {
    ctx.fillStyle = '#9aa1b3';
    ctx.fillRect(0, y + 12, 128, 4);
  }
});
const awningTex = (a, b) => canvasTexture(256, 64, (ctx) => {
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? b : a;
    ctx.fillRect(i * 32, 0, 32, 64);
  }
});
const checkerTex = canvasTexture(128, 96, (ctx) => {
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
    ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
    ctx.fillRect(c * 16, r * 16, 16, 16);
  }
});
const arenaWallTex = canvasTexture(512, 256, (ctx) => {
  ctx.fillStyle = '#e6d3ae';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(0,0,0,.06)';
  for (let y = 0; y < 256; y += 20) ctx.fillRect(0, y, 512, 2);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 8; i++) {
      const x = 16 + i * 64, y = 40 + row * 110;
      ctx.fillStyle = '#5b4a38';
      ctx.beginPath();
      ctx.roundRect(x, y, 34, 70, [17, 17, 0, 0]);
      ctx.fill();
      ctx.fillStyle = '#cdb893';
      ctx.fillRect(x - 10, y + 70, 54, 8);
    }
  }
  ctx.fillStyle = '#c9b48c';
  ctx.fillRect(0, 0, 512, 12);
});

function tiled(tex, rx, ry) {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}
function mapped(tex, color, rx, ry, opts = {}) {
  return new THREE.MeshToonMaterial({ map: tiled(tex, rx, ry), color, gradientMap: toon('#fff').gradientMap, ...opts });
}

// ---- pieces ------------------------------------------------------------------

function walls(g, w, h, d, color, tex = sidingTex, y0 = 0) {
  const mat = mapped(tex, color, w / 2.5, h / 2.5);
  add(g, new THREE.BoxGeometry(w, h, d), mat, { p: [0, y0 + h / 2, 0], outline: true });
  add(g, new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3), mapped(stoneTex, '#8f8a99', w / 2, 0.3), { p: [0, 0.25, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.28, h, 0.28), toon('#fffaf0'), { p: [sx * (w / 2), y0 + h / 2, sz * (d / 2)] });
  }
}

function gable(g, w, d, rise, y, color, overhang = 0.7) {
  const shape = new THREE.Shape();
  const hd = d / 2 + overhang;
  shape.moveTo(-hd, 0);
  shape.lineTo(hd, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -(w + overhang * 2) / 2);
  geo.rotateY(Math.PI / 2);
  const mat = mapped(shingleTex, color, 0.45, 0.45);
  const roof = add(g, geo, mat, { p: [0, y, 0], outline: true });
  add(g, new THREE.BoxGeometry(w + overhang * 2 + 0.1, 0.22, 0.3), toon(new THREE.Color(color).multiplyScalar(0.75).getStyle()), { p: [0, y + rise, 0] });
  return roof;
}

function door(g, x, z, w = 1.6, h = 2.6, color = '#7a4a28') {
  const d = new THREE.Group();
  add(d, new THREE.BoxGeometry(w + 0.3, h + 0.15, 0.12), toon('#fffaf0'), { p: [0, h / 2, -0.02] });
  add(d, new THREE.BoxGeometry(w, h - w / 2, 0.16), toon(color), { p: [0, (h - w / 2) / 2, 0] });
  add(d, new THREE.CylinderGeometry(w / 2, w / 2, 0.16, 20, 1, false, 0, Math.PI), toon(color), { p: [0, h - w / 2, 0], r: [Math.PI / 2, Math.PI / 2, 0] });
  add(d, new THREE.SphereGeometry(0.09, 10, 8), shiny('#ffd84d'), { p: [w * 0.32, h * 0.42, 0.12] });
  add(d, new THREE.BoxGeometry(w + 0.8, 0.14, 0.7), toon('#a89f92'), { p: [0, 0.07, 0.35] });
  d.position.set(x, 0, z);
  g.add(d);
}

function windowPane(g, x, y, z, w = 1.5, h = 1.2, glow = '#9fd6ff') {
  const win = new THREE.Group();
  add(win, new THREE.BoxGeometry(w + 0.24, h + 0.24, 0.1), toon('#ffffff'));
  add(win, new THREE.BoxGeometry(w, h, 0.12), toon(glow, { emissive: glow, emissiveIntensity: 0.35 }), { cast: false });
  add(win, new THREE.BoxGeometry(0.08, h, 0.16), toon('#ffffff'), { cast: false });
  add(win, new THREE.BoxGeometry(w, 0.08, 0.16), toon('#ffffff'), { cast: false });
  add(win, new THREE.BoxGeometry(w + 0.4, 0.28, 0.4), toon('#6b4a2b'), { p: [0, -h / 2 - 0.2, 0.15] });
  ['#ff5d73', '#ffd84d', '#e57bff', '#ffffff'].forEach((c, i) => {
    add(win, new THREE.SphereGeometry(0.14, 8, 6), toon(c), { p: [-w / 2 + 0.2 + i * (w - 0.4) / 3, -h / 2 - 0.02, 0.2] });
  });
  win.position.set(x, y, z);
  g.add(win);
}

function emblem(g, emoji, ring, x, y, z, r = 0.9) {
  const tex = emojiTexture(emoji, 256, ring);
  const mats = [toon(ring), new THREE.MeshBasicMaterial({ map: tex }), toon(ring)];
  const disc = add(g, new THREE.CylinderGeometry(r, r, 0.16, 36), mats, { p: [x, y, z], r: [Math.PI / 2, 0, 0], outline: true });
  return disc;
}

function flag(g, x, z, anim) {
  add(g, new THREE.CylinderGeometry(0.07, 0.07, 4.2, 8), toon('#5b5f73'), { p: [x, 2.1, z] });
  const geo = new THREE.PlaneGeometry(1.4, 1, 8, 4);
  geo.translate(0.7, 0, 0);
  const base = Float32Array.from(geo.attributes.position.array);
  const cloth = add(g, geo, new THREE.MeshToonMaterial({ map: checkerTex, side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap }), { p: [x, 3.6, z] });
  anim.push((t) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = base[i * 3];
      pos.setZ(i, Math.sin(t * 5 - px * 3 + x) * 0.12 * px);
    }
    pos.needsUpdate = true;
  });
  return cloth;
}

// ---- builders ------------------------------------------------------------------

export const BUILDERS = {
  garage(g, w, d, anim) {
    const h = 4.4;
    walls(g, w, h, d, '#e4e8ef');
    gable(g, w, d, 2.8, h, '#e0463c');
    const gw = w * 0.42;
    add(g, new THREE.BoxGeometry(gw + 0.5, 3.6, 0.2), toon('#6b7194'), { p: [0, 1.8, d / 2 + 0.05] });
    add(g, new THREE.BoxGeometry(gw, 3.3, 0.24), new THREE.MeshToonMaterial({ map: tiled(rollerTex, 1, 1), gradientMap: toon('#fff').gradientMap }), { p: [0, 1.65, d / 2 + 0.08] });
    windowPane(g, -w * 0.36, 2.6, d / 2 + 0.06);
    windowPane(g, w * 0.36, 2.6, d / 2 + 0.06);
    emblem(g, '🏎️', '#e0463c', 0, h + 1.2, d / 2 + 0.2, 0.85);
    flag(g, -w / 2 - 1.2, d / 2 + 0.8, anim);
    flag(g, w / 2 + 1.2, d / 2 + 0.8, anim);
    for (const [x, z, y] of [[w / 2 - 1, d / 2 + 1.2, 0.25], [w / 2 - 1, d / 2 + 1.2, 0.72], [w / 2 - 2.1, d / 2 + 1.4, 0.25]]) {
      add(g, new THREE.TorusGeometry(0.45, 0.22, 10, 20), toon('#23232b'), { p: [x, y, z], r: [Math.PI / 2, 0, 0], outline: true });
    }
  },

  cave(g, w, d, anim) {
    const rock = (x, y, z, r, c, s = [1, 1, 1]) => add(g, faceted(new THREE.DodecahedronGeometry(r, 1)), toon(c), { p: [x, y, z], s, outline: true });
    rock(0, 1.6, -0.6, 4.6, '#7a7589', [1.35, 0.95, 0.95]);
    rock(-4.4, 1.0, 0.4, 2.6, '#86819a', [1, 0.9, 1]);
    rock(4.6, 1.1, 0.2, 2.7, '#7f7a92', [1, 0.95, 1]);
    rock(1.5, 4.2, -1.2, 2.2, '#948fa6');
    rock(-2.2, 3.6, -1.5, 1.8, '#8a859d');
    for (const [x, y, z, r] of [[-1.5, 5.1, -0.3, 0.9], [2.6, 5.4, -1.8, 0.7], [-4, 2.8, 0.8, 0.7]]) {
      add(g, new THREE.SphereGeometry(r, 12, 8), toon('#5b8f4a'), { p: [x, y, z], s: [1.4, 0.35, 1.2] });
    }
    // half-cylinder arch: the upper half of a cylinder lying along Z
    add(g, new THREE.CylinderGeometry(2.1, 2.1, 1.4, 28, 1, false, -Math.PI / 2, Math.PI), basic('#0b0614'), { p: [0, 0, d / 2 - 1.2], r: [-Math.PI / 2, 0, 0], s: [1, 1, 1.25], cast: false });
    const eyes = [];
    for (const s of [-1, 1]) {
      const eye = add(g, new THREE.SphereGeometry(0.16, 12, 8), basic('#e07bff'), { p: [s * 0.55, 1.15, d / 2 - 1.3], s: [1.3, 0.7, 0.5], cast: false });
      const glow = new THREE.Sprite(additive(glowTexture, 0xc04dff, 0.8));
      glow.scale.setScalar(1.1);
      eye.add(glow);
      eyes.push({ eye, glow });
    }
    anim.push((t) => {
      const pulse = 0.6 + Math.sin(t * 2.4) * 0.4;
      const blink = t % 5 < 0.14;
      eyes.forEach(({ eye, glow }) => { eye.visible = !blink; glow.material.opacity = 0.4 + pulse * 0.5; });
    });
    emblem(g, '👾', '#7c6bff', 0, 6.4, 0.4, 0.8);
  },

  colosseum(g, w, d, anim) {
    const rx = w / 2, rz = d / 2, h = 5.2;
    const outer = new THREE.CylinderGeometry(1, 1, h, 64, 1, true);
    const wallMat = new THREE.MeshToonMaterial({ map: tiled(arenaWallTex, 5, 1), side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap });
    add(g, outer, wallMat, { p: [0, h / 2, 0], s: [rx, 1, rz] });
    const rim = new THREE.RingGeometry(0.8, 1.03, 64);
    add(g, rim, toon('#d9c7a3', { side: THREE.DoubleSide }), { p: [0, h, 0], r: [-Math.PI / 2, 0, 0], s: [rx, rz, 1] });
    add(g, new THREE.CylinderGeometry(0.8, 0.8, h * 0.7, 64, 1, true), toon('#b39c72', { side: THREE.DoubleSide }), { p: [0, h * 0.35, 0], s: [rx, 1, rz] });
    add(g, new THREE.CircleGeometry(0.8, 48), toon('#e8cf95'), { p: [0, 0.06, 0], r: [-Math.PI / 2, 0, 0], s: [rx, rz, 1] });
    // crowd on the stands
    const crowd = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), toon('#ffffff'), 90);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    const colors = ['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#ffffff', '#e57bff', '#ff9f43'];
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * TAU + (i % 3) * 0.02;
      const k = 0.86 + (i % 2) * 0.08;
      m.makeTranslation(Math.cos(a) * rx * k, h * 0.7 + 0.2 + (i % 2) * 0.45, Math.sin(a) * rz * k);
      crowd.setMatrixAt(i, m);
      crowd.setColorAt(i, c.set(colors[i % colors.length]));
    }
    g.add(crowd);
    const base = [];
    for (let i = 0; i < 90; i++) { crowd.getMatrixAt(i, m); base.push(m.elements[13]); }
    anim.push((t) => {
      for (let i = 0; i < 90; i += 1) {
        crowd.getMatrixAt(i, m);
        m.elements[13] = base[i] + Math.abs(Math.sin(t * 3 + i)) * 0.18;
        crowd.setMatrixAt(i, m);
      }
      crowd.instanceMatrix.needsUpdate = true;
    });
    // gate + banners
    add(g, new THREE.BoxGeometry(3.4, 3.6, 0.5), toon('#3a2d22'), { p: [0, 1.8, rz + 0.05] });
    for (let x = -1.2; x <= 1.21; x += 0.6) add(g, new THREE.CylinderGeometry(0.06, 0.06, 3.3, 6), shiny('#8d96a8'), { p: [x, 1.7, rz + 0.35] });
    add(g, new THREE.BoxGeometry(3.4, 0.2, 0.2), shiny('#8d96a8'), { p: [0, 3.2, rz + 0.35] });
    for (const a of [-0.9, -0.45, 0.45, 0.9]) {
      const ang = Math.PI / 2 - a * 0.9;
      const bx = Math.cos(ang) * rx * 1.01, bz = Math.sin(ang) * rz * 1.01;
      add(g, new THREE.PlaneGeometry(0.9, 2), toon('#d6334a', { side: THREE.DoubleSide }), { p: [bx, h - 1.3, bz], r: [0, Math.atan2(bx / rx / rx, bz / rz / rz), 0] });
    }
    emblem(g, '⚔️', '#c9772a', 0, h + 1, rz + 0.2, 0.9);
  },

  range(g, w, d) {
    const h = 3.8;
    walls(g, w, h, d, '#c8a57a', plankTex);
    gable(g, w, d, 2.6, h, '#2f7f5e');
    door(g, 0, d / 2 + 0.08);
    windowPane(g, -w * 0.3, 2.3, d / 2 + 0.06);
    windowPane(g, w * 0.3, 2.3, d / 2 + 0.06);
    emblem(g, '🏹', '#2f7f5e', 0, h + 1.1, d / 2 + 0.3, 0.8);
    for (const [x, z] of [[-w / 2 + 0.8, d / 2 + 1.1], [w / 2 - 0.8, d / 2 + 1.1]]) {
      add(g, new THREE.CylinderGeometry(0.5, 0.55, 0.9, 12), toon('#e8c96a'), { p: [x, 0.45, z], outline: true });
    }
  },

  casino(g, w, d, anim, ctx) {
    const h = 4.8;
    walls(g, w, h, d, '#3a1f5c', stoneTex);
    add(g, new THREE.BoxGeometry(w + 0.6, 0.45, d + 0.6), shiny('#ffc53d'), { p: [0, h + 0.2, 0] });
    const signW = w * 0.86, signH = 2.4;
    const signTex = ctx.text(512, 144, (c) => {
      const grad = c.createLinearGradient(0, 0, 0, 144);
      grad.addColorStop(0, '#d6334a');
      grad.addColorStop(1, '#8f1530');
      c.fillStyle = grad;
      c.fillRect(0, 0, 512, 144);
      c.font = '92px "Luckiest Guy", Rubik, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 14;
      c.strokeStyle = '#7a0f28';
      c.strokeText('CASINO', 256, 80);
      c.fillStyle = '#ffe27a';
      c.fillText('CASINO', 256, 80);
    });
    add(g, new THREE.BoxGeometry(signW, signH, 0.4), [toon('#8f1530'), toon('#8f1530'), toon('#8f1530'), toon('#8f1530'), new THREE.MeshBasicMaterial({ map: signTex }), toon('#8f1530')], { p: [0, h + 1.6, d / 2 - 0.4], outline: true });
    const on = basic('#fff6b0'), off = basic('#8a6a1a');
    const bulbs = [];
    for (let i = 0; i < 16; i++) {
      const x = -signW / 2 + 0.3 + (i * (signW - 0.6)) / 15;
      for (const y of [h + 1.6 + signH / 2 - 0.15, h + 1.6 - signH / 2 + 0.15]) {
        bulbs.push(add(g, new THREE.SphereGeometry(0.1, 8, 6), on, { p: [x, y, d / 2 - 0.17], cast: false }));
      }
    }
    anim.push((t) => bulbs.forEach((b, i) => { b.material = (Math.floor(t * 6) + i) % 3 === 0 ? on : off; }));
    add(g, new THREE.BoxGeometry(3, 3.2, 0.2), shiny('#ffc53d'), { p: [0, 1.6, d / 2 + 0.05] });
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(1.25, 2.9, 0.24), toon('#8b5cc6', { emissive: '#6b3fa0', emissiveIntensity: 0.4 }), { p: [s * 0.68, 1.5, d / 2 + 0.08] });
    windowPane(g, -w * 0.34, 2.6, d / 2 + 0.06, 1.6, 1.4, '#e57bff');
    windowPane(g, w * 0.34, 2.6, d / 2 + 0.06, 1.6, 1.4, '#e57bff');
    add(g, new THREE.BoxGeometry(2.8, 0.06, 2.2), toon('#b3203a'), { p: [0, 0.03, d / 2 + 1.1] });
    for (const s of [-1, 1]) {
      add(g, new THREE.CylinderGeometry(0.4, 0.3, 0.7, 12), toon('#c9772a'), { p: [s * 2.2, 0.35, d / 2 + 0.8], outline: true });
      add(g, new THREE.IcosahedronGeometry(0.65, 0), toon('#2f9e44'), { p: [s * 2.2, 1.2, d / 2 + 0.8], outline: true });
    }
  },

  market(g, w, d) {
    const wood = toon('#b07a45');
    add(g, new THREE.BoxGeometry(w * 0.9, 1.2, 1.6), mapped(plankTex, '#b07a45', 3, 0.5), { p: [0, 0.6, d / 2 - 1.2], outline: true });
    add(g, new THREE.BoxGeometry(w * 0.94, 0.16, 1.9), toon('#8b5a2b'), { p: [0, 1.25, d / 2 - 1.2] });
    add(g, new THREE.BoxGeometry(w * 0.9, 2.6, 0.3), mapped(plankTex, '#9c6a3c', 3, 0.8), { p: [0, 1.3, -d / 2 + 0.6] });
    for (const sx of [-1, 1]) for (const z of [d / 2 - 0.4, -d / 2 + 0.6]) add(g, new THREE.BoxGeometry(0.3, 3.8, 0.3), wood, { p: [sx * w * 0.45, 1.9, z] });
    const aw = new THREE.PlaneGeometry(w * 0.98, d * 0.95);
    add(g, aw, new THREE.MeshToonMaterial({ map: tiled(awningTex('#e0463c', '#ffffff'), 3, 1), side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap }), { p: [0, 3.95, 0.1], r: [-Math.PI / 2 + 0.18, 0, 0] });
    for (let i = 0; i < 14; i++) {
      const x = -w * 0.49 + (i + 0.5) * (w * 0.98 / 14);
      add(g, new THREE.CircleGeometry(w * 0.98 / 28, 12, Math.PI, Math.PI), toon(i % 2 ? '#ffffff' : '#e0463c', { side: THREE.DoubleSide }), { p: [x, 3.55, d / 2 + 0.55], cast: false });
    }
    const goods = [['#e0463c', 0.2], ['#ff9f43', 0.2], ['#ffd84d', 0.18], ['#6ee7a0', 0.2], ['#9b59b6', 0.17]];
    for (let i = 0; i < 22; i++) {
      const [c, r] = goods[i % goods.length];
      add(g, new THREE.SphereGeometry(r, 10, 8), toon(c), { p: [-w * 0.4 + (i % 11) * (w * 0.8 / 10), 1.5, d / 2 - 1.6 + Math.floor(i / 11) * 0.55] });
    }
    add(g, new THREE.SphereGeometry(0.45, 14, 10), toon('#d9b26a'), { p: [w * 0.34, 1.75, d / 2 - 1.2], s: [1, 1.1, 1], outline: true });
    add(g, new THREE.TorusGeometry(0.2, 0.06, 6, 16), toon('#8b5a2b'), { p: [w * 0.34, 2.2, d / 2 - 1.2], r: [Math.PI / 2, 0, 0] });
    for (const s of [-1, 1]) {
      add(g, new THREE.CylinderGeometry(0.55, 0.55, 1.3, 16), mapped(plankTex, '#8b5a2b', 2, 0.5), { p: [s * (w / 2 + 0.6), 0.65, d / 2 - 0.8], outline: true });
      add(g, new THREE.TorusGeometry(0.56, 0.05, 6, 20), toon('#4a2e1c'), { p: [s * (w / 2 + 0.6), 0.95, d / 2 - 0.8], r: [Math.PI / 2, 0, 0] });
    }
    emblem(g, '💰', '#c9a227', 0, 4.9, 0.6, 0.8);
  },

  boutique(g, w, d, anim) {
    const h = 4.4;
    walls(g, w, h, d, '#ffd6e8');
    gable(g, w, d, 2.6, h, '#2ed8c3');
    const dw = w * 0.5, dx = -w * 0.2;
    add(g, new THREE.BoxGeometry(dw, 0.5, 1.6), toon('#ffffff'), { p: [dx, 0.25, d / 2 + 0.8] });
    add(g, new THREE.BoxGeometry(dw, 3, 0.1), toon('#bde9f5', { transparent: true, opacity: 0.28 }), { p: [dx, 2, d / 2 + 1.55], cast: false });
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.2, 3.2, 1.7), toon('#ffffff'), { p: [dx + s * dw / 2, 1.9, d / 2 + 0.8] });
    add(g, new THREE.BoxGeometry(dw + 0.2, 0.25, 1.7), toon('#ffffff'), { p: [dx, 3.5, d / 2 + 0.8] });
    add(g, new THREE.PlaneGeometry(dw + 0.6, 1.4), new THREE.MeshToonMaterial({ map: tiled(awningTex('#2ed8c3', '#ffffff'), 2, 1), side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap }), { p: [dx, 3.9, d / 2 + 2], r: [-0.9, 0, 0] });
    const looks = [
      { skin: '#f6c9a0', hairColor: '#f2d16b', topColor: '#e57bff', bottomColor: '#23263f', hair: 'hair_long', top: 'top_suit', hat: 'hat_tophat', face: 'face_monocle', back: 'back_none', aura: 'aura_none' },
      { skin: '#c68642', hairColor: '#2b1d14', topColor: '#ffd84d', bottomColor: '#3b5bdb', hair: 'hair_afro', top: 'top_hawaiian', hat: 'hat_none', face: 'face_sunglasses', back: 'back_none', aura: 'aura_none' },
    ];
    looks.forEach((look, i) => {
      const c = new Character(look);
      c.root.position.set(dx + (i ? 1 : -1) * dw * 0.24, 0.5, d / 2 + 0.8);
      c.root.rotation.y = (i ? -1 : 1) * 0.35;
      c.root.traverse((o) => { o.castShadow = false; });
      g.add(c.root);
      anim.push((t, dt) => c.update(dt, t + i * 3, false));
    });
    door(g, w * 0.3, d / 2 + 0.08, 1.6, 2.8, '#e57bff');
    emblem(g, '👕', '#e57bff', 0, h + 1.1, d / 2 + 0.3, 0.8);
  },

  houses(g, w, d, anim, ctx) {
    const palette = [['#fff1c9', '#4a7bd0'], ['#d8f0ff', '#e0463c'], ['#e8ffe0', '#7c6bff']];
    const hw = w / 3 - 0.8, hd = d * 0.55;
    palette.forEach(([wall, roof], i) => {
      const house = new THREE.Group();
      house.position.set(-w / 3 + i * (w / 3), 0, (i % 2 ? 0.6 : -0.6) + (d - hd) / 2 - 1);
      const h = 3.2;
      walls(house, hw, h, hd, wall);
      gable(house, hw, hd, 2.2, h, roof, 0.4);
      add(house, new THREE.BoxGeometry(0.6, 1.8, 0.6), toon('#8f5a3a'), { p: [hw * 0.28, h + 1.4, -hd * 0.15], outline: true });
      door(house, 0, hd / 2 + 0.08, 1.1, 2.1);
      windowPane(house, -hw * 0.3, 2, hd / 2 + 0.06, 0.9, 0.8);
      windowPane(house, hw * 0.3, 2, hd / 2 + 0.06, 0.9, 0.8);
      g.add(house);
      const smoke = [];
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.puff, color: 0xeef2ff, transparent: true, depthWrite: false }));
        house.add(s);
        smoke.push(s);
      }
      anim.push((t) => smoke.forEach((s, k) => {
        const p = (t * 0.3 + k / 4 + i * 0.2) % 1;
        s.position.set(hw * 0.28 + Math.sin(p * 4 + i) * 0.3, h + 2.4 + p * 3, -hd * 0.15);
        s.scale.setScalar(0.5 + p * 1.2);
        s.material.opacity = 0.7 * (1 - p);
      }));
    });
    const signTex = ctx.text(256, 96, (c) => {
      c.fillStyle = '#e8c07a';
      c.fillRect(0, 0, 256, 96);
      c.strokeStyle = '#8b5a2b';
      c.lineWidth = 8;
      c.strokeRect(4, 4, 248, 88);
      c.font = '44px "Luckiest Guy", Rubik, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#5a3a1c';
      c.fillText('SOON!', 128, 54);
    });
    add(g, new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), toon('#8b5a2b'), { p: [0, 0.9, d / 2 + 0.6] });
    add(g, new THREE.BoxGeometry(2.2, 0.85, 0.12), [toon('#e8c07a'), toon('#e8c07a'), toon('#e8c07a'), toon('#e8c07a'), new THREE.MeshBasicMaterial({ map: signTex }), toon('#e8c07a')], { p: [0, 1.7, d / 2 + 0.66], outline: true });
  },
};

/** Build a building for a map spot; returns a Group placed in the world. */
export function buildBuilding(spot, anim, ctx) {
  const g = new THREE.Group();
  const w = spot.w / PX, d = spot.h / PX;
  BUILDERS[spot.kind](g, w, d, anim, ctx);
  const cx = (spot.x + spot.w / 2 - 900) / PX, cz = (spot.y + spot.h / 2 - 600) / PX;
  g.position.set(cx, 0, cz);
  if (spot.facing === 'north') g.rotation.y = Math.PI; // models are built facing +Z (south)
  g.userData.spot = spot;
  return g;
}
