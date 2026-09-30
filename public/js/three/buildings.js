// 3D building models. Each builder gets the spot and returns a Group centered on the spot's
// footprint, with its front (door side) facing +Z. `anim` collects per-frame animation callbacks.
import * as THREE from 'three';
import { TAU, toon, basic, shiny, outlineMaterial, canvasTexture, additive, glowTexture } from './materials.js';
import { Character } from './character.js';
import { PX, CENTER, heightAt } from '../map.js';
import { letterSign } from './signs3d.js';

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

const splatTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  const colors = ['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#b77bff', '#ff9f43'];
  for (let i = 0; i < 14; i++) {
    const x = (i * 71) % 256, y = (i * 113) % 220 + 10, r = 8 + (i % 4) * 5;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + i;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5, r * 0.3, 0, TAU); ctx.fill();
    }
    ctx.fillRect(x - 2, y, 4, r * 2.2);
  }
});
const easelTex = canvasTexture(256, 320, (ctx) => {
  ctx.fillStyle = '#fffdf6';
  ctx.fillRect(0, 0, 256, 320);
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffb347';
  ctx.fillStyle = '#ffd84d';
  ctx.beginPath(); ctx.arc(190, 70, 34, 0, TAU); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath(); ctx.moveTo(190 + Math.cos(a) * 46, 70 + Math.sin(a) * 46); ctx.lineTo(190 + Math.cos(a) * 62, 70 + Math.sin(a) * 62); ctx.stroke();
  }
  ctx.strokeStyle = '#1a1330';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(180, 66, 4, 0, TAU); ctx.arc(200, 66, 4, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(190, 76, 12, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.fillStyle = '#ff5d73';
  ctx.beginPath(); ctx.moveTo(40, 190); ctx.lineTo(100, 130); ctx.lineTo(160, 190); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9fd8ff';
  ctx.fillRect(55, 190, 90, 80); ctx.strokeRect(55, 190, 90, 80);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(88, 225, 26, 45);
  ctx.strokeStyle = '#3fb356';
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(0, 290); ctx.bezierCurveTo(80, 270, 170, 305, 256, 280); ctx.stroke();
});

/**
 * A building's name in big 3D marquee letters (like the casino): glowing faces, sides in the
 * building's colour, chasing bulbs, standing on a steel rail. Fills the old w × h board area.
 */
function signBoard(g, ctx, text, { w = 6, h = 1.4, p = [0, 0, 0], bg = ['#d6334a', '#8f1530'], fg = '#ffffff', frame = '#5a3a22' } = {}) {
  const light = (c) => new THREE.Color(c).getHSL({}).l > 0.75;
  const side = light(bg[0]) ? fg : bg[0];
  const face = light(fg) ? '#fff6e0' : '#fff6e0';
  const rail = add(g, new THREE.BoxGeometry(w * 0.96, 0.14, 0.34), toon('#23263f'), { p: [p[0], p[1] - h / 2 - 0.02, p[2] - 0.1], outline: true });
  const sign = letterSign(text, { w: w * 0.94, h: h * 0.95, face, side, depth: Math.min(0.32, h * 0.22) });
  sign.position.set(p[0], p[1] - h / 2 + 0.06, p[2] + 0.05);
  g.add(sign);
  return rail;
}

/** A small group positioned in the builder's frame. */
function sub(g, x, y, z, ry = 0) {
  const o = new THREE.Group();
  o.position.set(x, y, z);
  o.rotation.y = ry;
  g.add(o);
  return o;
}

function cone(g, x, z) {
  add(g, new THREE.ConeGeometry(0.28, 0.8, 12), toon('#ff7a2e'), { p: [x, 0.45, z], outline: true });
  add(g, new THREE.CylinderGeometry(0.2, 0.22, 0.14, 12), toon('#ffffff'), { p: [x, 0.5, z] });
  add(g, new THREE.BoxGeometry(0.62, 0.08, 0.62), toon('#ff7a2e'), { p: [x, 0.04, z] });
}

function tires(g, x, z, n = 3) {
  for (let i = 0; i < n; i++) add(g, new THREE.TorusGeometry(0.45, 0.22, 10, 20), toon(i % 2 ? '#e0463c' : '#23232b'), { p: [x, 0.23 + i * 0.44, z], r: [Math.PI / 2, 0, 0], outline: true });
}

function barrel(g, x, z, c = '#8b5a2b') {
  add(g, new THREE.CylinderGeometry(0.5, 0.5, 1.2, 16), mapped(plankTex, c, 2, 0.5), { p: [x, 0.6, z], outline: true });
  for (const y of [0.25, 0.95]) add(g, new THREE.TorusGeometry(0.51, 0.04, 6, 20), toon('#4a2e1c'), { p: [x, y, z], r: [Math.PI / 2, 0, 0] });
}

function crate(g, x, y, z, sz = 0.9, ry = 0) {
  add(g, new THREE.BoxGeometry(sz, sz, sz), mapped(plankTex, '#c28a4e', 1, 1), { p: [x, y + sz / 2, z], r: [0, ry, 0], outline: true });
}

// ---- builders ------------------------------------------------------------------

/** Block-letter shapes for C A S I N O (1 unit tall), for the casino's 3D sign. */
function casinoLetters() {
  const arc = (cx, cy, ro, ri, a0, a1) => {
    const sh = new THREE.Shape();
    sh.absarc(cx, cy, ro, a0, a1, false);
    sh.absarc(cx, cy, ri, a1, a0, true);
    sh.closePath();
    return sh;
  };
  const poly = (pts, holes = []) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    return sh;
  };
  const ring = (cx, cy, rx, ry, ix, iy) => {
    const sh = new THREE.Shape();
    sh.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(cx, cy, ix, iy, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    return sh;
  };
  return [
    { w: 0.9, shapes: [arc(0.48, 0.5, 0.5, 0.29, 0.75, Math.PI * 2 - 0.75)] },
    { w: 0.84, shapes: [poly([[0, 0], [0.22, 0], [0.29, 0.22], [0.55, 0.22], [0.62, 0], [0.84, 0], [0.53, 1], [0.31, 1]], [[[0.35, 0.39], [0.49, 0.39], [0.42, 0.64]]])] },
    { w: 0.78, shapes: [arc(0.39, 0.735, 0.265, 0.09, 0.4, Math.PI * 1.5), arc(0.39, 0.265, 0.265, 0.09, Math.PI + 0.4, Math.PI * 2.5)] },
    { w: 0.26, shapes: [poly([[0, 0], [0.26, 0], [0.26, 1], [0, 1]])] },
    { w: 0.76, shapes: [poly([[0, 0], [0.21, 0], [0.21, 0.6], [0.55, 0], [0.76, 0], [0.76, 1], [0.55, 1], [0.55, 0.4], [0.21, 1], [0, 1]])] },
    { w: 0.88, shapes: [ring(0.44, 0.5, 0.44, 0.5, 0.23, 0.3)] },
  ];
}

export const BUILDERS = {
  studio(g, w, d, anim) {
    const h = 4.2;
    walls(g, w, h, d, '#ffffff', splatTex);
    add(g, new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), toon('#39c6ff'), { p: [0, h + 0.17, 0], outline: true });
    ['#ff5d73', '#ffd84d', '#6ee7a0', '#b77bff', '#ff9f43'].forEach((c, i) => {
      const x = -w / 2 + 0.8 + i * (w - 1.6) / 4;
      add(g, new THREE.CylinderGeometry(0.12, 0.08, 0.5 + (i % 3) * 0.3, 8), toon(c), { p: [x, h - 0.1 - (i % 3) * 0.15, d / 2 + 0.28] });
      add(g, new THREE.SphereGeometry(0.13, 8, 6), toon(c), { p: [x, h - 0.4 - (i % 3) * 0.3, d / 2 + 0.28] });
    });
    const pencil = new THREE.Group();
    add(pencil, new THREE.CylinderGeometry(0.45, 0.45, 5, 6), toon('#ffd84d'), { r: [0, 0, Math.PI / 2], outline: true });
    add(pencil, new THREE.ConeGeometry(0.45, 1.1, 6), toon('#f6c9a0'), { p: [3.05, 0, 0], r: [0, 0, -Math.PI / 2], outline: true });
    add(pencil, new THREE.ConeGeometry(0.14, 0.35, 6), toon('#2b2f4a'), { p: [3.45, 0, 0], r: [0, 0, -Math.PI / 2] });
    add(pencil, new THREE.CylinderGeometry(0.48, 0.48, 0.5, 12), shiny('#c0c6d4'), { p: [-2.7, 0, 0], r: [0, 0, Math.PI / 2], outline: true });
    add(pencil, new THREE.CylinderGeometry(0.46, 0.46, 0.6, 12), toon('#ff9fb4'), { p: [-3.2, 0, 0], r: [0, 0, Math.PI / 2], outline: true });
    pencil.position.set(0, h + 1.1, -0.6);
    pencil.rotation.set(0, 0.3, 0.22);
    g.add(pencil);
    anim.push((t) => { pencil.position.y = h + 1.1 + Math.sin(t * 1.6) * 0.12; });
    windowPane(g, -w * 0.26, 2.4, d / 2 + 0.06, 2.6, 1.7, '#fff6c9');
    door(g, w * 0.25, d / 2 + 0.08, 1.6, 2.6, '#ff9f43');
    const easel = new THREE.Group();
    for (const [x, rz] of [[-0.45, 0.12], [0.45, -0.12]]) add(easel, new THREE.BoxGeometry(0.1, 2.4, 0.1), toon('#8b5a2b'), { p: [x, 1.2, 0], r: [0, 0, rz] });
    add(easel, new THREE.BoxGeometry(0.1, 2.2, 0.1), toon('#8b5a2b'), { p: [0, 1.1, -0.45], r: [-0.35, 0, 0] });
    add(easel, new THREE.BoxGeometry(1.3, 0.08, 0.2), toon('#8b5a2b'), { p: [0, 0.95, 0.08] });
    add(easel, new THREE.PlaneGeometry(1.2, 1.5), new THREE.MeshToonMaterial({ map: easelTex }), { p: [0, 1.75, 0.1], r: [-0.1, 0, 0], outline: false });
    easel.position.set(-w * 0.42, 0, d / 2 + 1.3);
    easel.rotation.y = 0.35;
    g.add(easel);
    for (const [x, c] of [[w * 0.44, '#ff5d73'], [w * 0.44 - 0.7, '#39c6ff']]) {
      add(g, new THREE.CylinderGeometry(0.28, 0.24, 0.5, 14), toon('#e8e2f4'), { p: [x, 0.25, d / 2 + 0.9], outline: true });
      add(g, new THREE.CylinderGeometry(0.26, 0.26, 0.04, 14), toon(c), { p: [x, 0.5, d / 2 + 0.9] });
    }
  },

  arcade(g, w, d, anim, ctx) {
    // a neon-trimmed games hall: dark purple walls, a marquee sign with chasing bulbs, a big pixel
    // invader on the roof and glowing windows showing cabinets inside
    const h = 5.2;
    walls(g, w, h, d, '#3b2a6e');
    add(g, new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), toon('#221845'), { p: [0, h + 0.2, 0], outline: true });
    const neon = (c) => basic(c);
    for (const [y, c] of [[h - 0.15, '#ff4fd8'], [0.7, '#39e6ff']]) {
      add(g, new THREE.BoxGeometry(w + 0.08, 0.12, 0.08), neon(c), { p: [0, y, d / 2 + 0.05], cast: false });
    }
    for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) add(g, new THREE.BoxGeometry(0.1, h, 0.1), neon('#ff4fd8'), { p: [x, h / 2, d / 2 + 0.05], cast: false });
    // door + glowing windows with little cabinets
    door(g, 0, d / 2 + 0.08, 2.0, 3.0, '#ff4fd8');
    for (const x of [-w * 0.3, w * 0.3]) {
      add(g, new THREE.BoxGeometry(2.6, 1.9, 0.12), toon('#1a1330'), { p: [x, 2.3, d / 2 + 0.06] });
      add(g, new THREE.BoxGeometry(2.4, 1.7, 0.14), toon('#6a4fd8', { emissive: '#8b6bff', emissiveIntensity: 0.6 }), { p: [x, 2.3, d / 2 + 0.07], cast: false });
      for (const o of [-0.6, 0, 0.6]) add(g, new THREE.BoxGeometry(0.4, 1.0, 0.05), toon(['#ff5d73', '#39c6ff', '#ffd84d'][(o + 0.6) / 0.6 | 0]), { p: [x + o, 1.95, d / 2 + 0.16], cast: false });
    }
    // marquee: big 3D letters with chasing bulbs
    signBoard(g, ctx, 'ARCADE', { w: 7.5, h: 1.7, p: [0, h + 1.3, d / 2 - 0.2], bg: ['#6a4fd8'], frame: '#140c33' });
    // a pixel space invader on the roof that bobs about
    const inv = new THREE.Group();
    inv.position.set(-w * 0.28, h + 0.4, -d * 0.1);
    g.add(inv);
    const px = ['0010000100', '0001001000', '0011111100', '0110110110', '1111111111', '1011111101', '1010000101', '0001101100'];
    const pm = basic('#6ee7a0');
    px.forEach((row, r) => [...row].forEach((ch, cI) => {
      if (ch === '1') add(inv, new THREE.BoxGeometry(0.28, 0.28, 0.28), pm, { p: [(cI - 4.5) * 0.28, (7 - r) * 0.28 + 0.2, 0], cast: false });
    }));
    anim.push((t) => { inv.position.y = h + 0.4 + Math.abs(Math.sin(t * 2)) * 0.25; inv.rotation.y = Math.sin(t * 0.8) * 0.4; });
    // a giant joystick by the door
    const js = new THREE.Group();
    js.position.set(w / 2 + 1.2, 0, d / 2 + 0.8);
    g.add(js);
    add(js, new THREE.BoxGeometry(1.2, 0.5, 1.2), toon('#221845'), { p: [0, 0.25, 0], outline: true });
    const stick = add(js, new THREE.CylinderGeometry(0.08, 0.08, 1.2, 10), toon('#c0c6d4'), { p: [0, 1.0, 0] });
    add(stick, new THREE.SphereGeometry(0.28, 16, 12), toon('#ff5d73'), { p: [0, 0.65, 0], outline: true });
    anim.push((t) => { stick.rotation.z = Math.sin(t * 1.3) * 0.25; stick.rotation.x = Math.cos(t * 1.1) * 0.2; });
    add(js, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), toon('#39c6ff'), { p: [-0.35, 0.55, 0.35], outline: true });
  },

  garage(g, w, d, anim, ctx) {
    // a Grand Prix pit building: three pit garages, a checkered band, a glass control tower and a big rooftop sign
    const h = 4.6;
    walls(g, w, h, d, '#eef1f6');
    add(g, new THREE.BoxGeometry(w + 0.7, 0.4, d + 0.7), toon('#3a3f55'), { p: [0, h + 0.2, 0], outline: true });
    add(g, new THREE.BoxGeometry(w + 0.1, 0.55, d + 0.1), mapped(checkerTex, '#ffffff', w / 1.1, 1), { p: [0, h - 0.4, 0], cast: false });
    const rollers = new THREE.MeshToonMaterial({ map: tiled(rollerTex, 1, 1), gradientMap: toon('#fff').gradientMap });
    const bayCols = ['#e0463c', '#39c6ff', '#ffd84d'];
    const x0 = -w / 2 + 1, bw = (w * 0.64) / 3;
    bayCols.forEach((c, i) => {
      const bx = x0 + bw * (i + 0.5);
      add(g, new THREE.BoxGeometry(bw - 0.3, 3.5, 0.2), toon('#3a3f55'), { p: [bx, 1.75, d / 2 + 0.05] });
      add(g, new THREE.BoxGeometry(bw - 0.8, 3.1, 0.26), rollers, { p: [bx, 1.6, d / 2 + 0.08] });
      add(g, new THREE.BoxGeometry(bw - 0.3, 0.35, 0.3), toon(c), { p: [bx, 3.55, d / 2 + 0.12] });
      add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.12, 20), toon('#ffffff'), { p: [bx, 3.55, d / 2 + 0.3], r: [Math.PI / 2, 0, 0], outline: true });
      add(g, new THREE.CylinderGeometry(0.3, 0.3, 0.14, 20), toon(c), { p: [bx, 3.55, d / 2 + 0.32], r: [Math.PI / 2, 0, 0], cast: false });
    });
    // office door + windows on the right, under the tower
    const tx = w / 2 - 3.6;
    door(g, tx - 1.4, d / 2 + 0.08, 1.4, 2.5, '#3a3f55');
    windowPane(g, tx + 1.4, 2.2, d / 2 + 0.06, 1.8, 1.1, '#8fd3ff');
    // the control tower
    const tw = 5.4, td = 5.2, ty = h + 0.4;
    add(g, new THREE.BoxGeometry(tw * 0.72, 3.4, td * 0.72), mapped(sidingTex, '#dfe4ee', 1.5, 1.4), { p: [tx, ty + 1.7, -0.4], outline: true });
    add(g, new THREE.BoxGeometry(tw + 0.3, 0.35, td + 0.3), toon('#3a3f55'), { p: [tx, ty + 3.55, -0.4], outline: true });
    add(g, new THREE.BoxGeometry(tw, 2.2, td), toon('#5fb8ff', { emissive: '#7fd0ff', emissiveIntensity: 0.3, transparent: true, opacity: 0.85 }), { p: [tx, ty + 4.8, -0.4], cast: false });
    for (let k = 0; k <= 4; k++) {
      const x = tx - tw / 2 + (k * tw) / 4;
      add(g, new THREE.BoxGeometry(0.16, 2.2, 0.16), toon('#eef1f6'), { p: [x, ty + 4.8, -0.4 + td / 2 + 0.02] });
      add(g, new THREE.BoxGeometry(0.16, 2.2, 0.16), toon('#eef1f6'), { p: [x, ty + 4.8, -0.4 - td / 2 - 0.02] });
    }
    add(g, new THREE.BoxGeometry(tw + 1.4, 0.4, td + 1.4), toon('#e0463c'), { p: [tx, ty + 6.1, -0.4], outline: true });
    add(g, new THREE.BoxGeometry(tw + 1.45, 0.3, td + 1.45), mapped(checkerTex, '#ffffff', 6, 1), { p: [tx, ty + 5.8, -0.4], cast: false });
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), toon('#5b5f73'), { p: [tx + 1.6, ty + 7.5, -1.2] });
    const beacon = add(g, new THREE.SphereGeometry(0.2, 10, 8), basic('#ff4040'), { p: [tx + 1.6, ty + 8.75, -1.2], cast: false });
    anim.push((t) => { beacon.visible = t % 1.2 < 0.6; });
    // a satellite dish on the tower roof
    add(g, new THREE.SphereGeometry(0.7, 16, 8, 0, TAU, 0, Math.PI / 2.6), toon('#eef1f6', { side: THREE.DoubleSide }), { p: [tx - 1.5, ty + 7.0, -1.4], r: [-0.8, 0.4, 0], outline: true });
    // the big sign on the roof above the pit garages, on two legs
    const sx = x0 + bw * 1.5;
    for (const o of [-3.6, 3.6]) add(g, new THREE.BoxGeometry(0.22, 2.2, 0.22), toon('#3a3f55'), { p: [sx + o, h + 1.3, d / 2 - 1.2] });
    signBoard(g, ctx, 'GRAND PRIX', { w: 10, h: 2.1, p: [sx, h + 2.0, d / 2 - 1.0], bg: ['#e0463c', '#a3212a'], frame: '#23232b' });
    // grandstand flags along the roof edge
    const fc = ['#e0463c', '#ffffff', '#39c6ff', '#ffd84d'];
    for (let k = 0; k < 9; k++) {
      const x = -w / 2 + 0.6 + (k * (w - 1.2)) / 8;
      if (Math.abs(x - tx) < tw / 2 + 0.4) continue;
      add(g, new THREE.CylinderGeometry(0.035, 0.035, 1.1, 5), toon('#5b5f73'), { p: [x, h + 0.95, -d / 2 + 0.3] });
      add(g, new THREE.ConeGeometry(0.28, 0.6, 3), toon(fc[k % 4], { side: THREE.DoubleSide }), { p: [x + 0.28, h + 1.3, -d / 2 + 0.3], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.1] });
    }
    // the pit apron: kerbs, tyres, cones and chequered flags
    for (let k = 0; k < 16; k++) add(g, new THREE.BoxGeometry(w / 16, 0.12, 0.6), toon(k % 2 ? '#ffffff' : '#e0463c'), { p: [-w / 2 + (k + 0.5) * (w / 16), 0.06, d / 2 + 2.2] });
    flag(g, -w / 2 - 1.2, d / 2 + 0.8, anim);
    flag(g, w / 2 + 1.2, d / 2 + 0.8, anim);
    tires(g, -w / 2 + 0.9, d / 2 + 1.1, 4);
    tires(g, -w / 2 + 2.0, d / 2 + 1.3, 3);
    tires(g, w / 2 - 0.9, d / 2 + 1.1, 3);
    for (let k = 0; k < 3; k++) cone(g, x0 + bw * (k + 0.5) + bw * 0.38, d / 2 + 1.1);
  },

  cave(g, w, d, anim, ctx) {
    const rock = (x, y, z, r, c, s = [1, 1, 1]) => add(g, faceted(new THREE.DodecahedronGeometry(r, 1)), toon(c), { p: [x, y, z], s, outline: true });
    signBoard(g, ctx, 'BOSS CAVE', { w: 6, h: 1.2, p: [0, 6.7, 1.6], bg: ['#6a2fd6'], frame: '#23263f' });
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
    // torches either side of the (now open) entrance
    for (const s of [-1, 1]) {
      add(g, new THREE.CylinderGeometry(0.08, 0.1, 1.6, 8), toon('#4a2e1c'), { p: [s * 2.6, 0.8, d / 2 - 0.4], outline: true });
      const flame = new THREE.Sprite(additive(glowTexture, 0xff9a3a, 0.9));
      flame.scale.setScalar(0.9);
      flame.position.set(s * 2.6, 1.75, d / 2 - 0.4);
      g.add(flame);
      anim.push((t) => { flame.scale.setScalar(0.8 + Math.sin(t * 11 + s) * 0.08 + Math.sin(t * 7) * 0.06); });
    }
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
  },

  colosseum(g, w, d, anim, ctx) {
    const rx = w / 2, rz = d / 2, h = 5.2;
    signBoard(g, ctx, 'ARENA', { w: 5.4, h: 1.6, p: [0, h + 1.05, rz - 0.2], bg: ['#d6334a'], frame: '#23263f' });
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
  },

  range(g, w, d, anim, ctx) {
    // a timber longhouse with a tall entrance tower wearing a giant target, and a covered shooting line out front
    const hd = d * 0.6, hz = -d / 2 + hd / 2, h = 4.2;
    const hall = sub(g, 0, 0, hz);
    walls(hall, w, h, hd, '#c8a57a', plankTex);
    gable(hall, w, hd, 3.0, h, '#2f7f5e');
    // entrance tower, turned so its gable faces the front
    const tW = 5.6, tD = hd + 1.4, tH = 6.6;
    const tz = hz + 0.7;
    const tower = sub(g, 0, 0, tz, Math.PI / 2);
    walls(tower, tD, tH, tW, '#d9b485', plankTex);
    gable(tower, tD, tW, 2.8, tH, '#2f7f5e', 0.5);
    const fz = tz + tD / 2;
    door(g, 0, fz + 0.08, 1.8, 2.9, '#6b4226');
    signBoard(g, ctx, 'ARCHERY', { w: 4.4, h: 0.95, p: [0, 3.55, fz + 0.2], bg: ['#6b4226', '#4a2e1c'], fg: '#ffe9a8', frame: '#3a2414' });
    const rings = ['#ffffff', '#23232b', '#39a0ff', '#e0463c', '#ffd84d'];
    rings.forEach((c, i) => add(g, new THREE.CylinderGeometry(1.25 - i * 0.24, 1.25 - i * 0.24, 0.12, 32), toon(c), { p: [0, 5.2, fz + 0.1 + i * 0.03], r: [Math.PI / 2, 0, 0], outline: i === 0, cast: false }));
    const arrow = sub(g, 0.25, 5.35, fz + 0.2);
    arrow.rotation.set(-0.35, 0.3, 0);
    add(arrow, new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), toon('#8b5a2b'), { p: [0, 0, 0.7], r: [Math.PI / 2, 0, 0] });
    add(arrow, new THREE.ConeGeometry(0.14, 0.4, 3), toon('#ff5d73', { side: THREE.DoubleSide }), { p: [0, 0, 1.35], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.2] });
    // the covered shooting line on either side of the tower
    const vz0 = hz + hd / 2, vz1 = d / 2 + 0.2, vd = vz1 - vz0;
    for (const side of [-1, 1]) {
      const x0 = side * (tW / 2 + 0.3), x1 = side * (w / 2 + 0.3), cx = (x0 + x1) / 2, vw = Math.abs(x1 - x0);
      add(g, new THREE.BoxGeometry(vw, 0.18, vd + 0.5), mapped(plankTex, '#2f7f5e', 2, 1), { p: [cx, 3.35, vz0 + vd / 2], r: [0.16, 0, 0], outline: true });
      add(g, new THREE.BoxGeometry(vw, 0.14, vd), mapped(plankTex, '#a0703f', 2, 1), { p: [cx, 0.07, vz0 + vd / 2] });
      for (let k = 0; k <= 3; k++) {
        const x = x0 + ((x1 - x0) * k) / 3;
        add(g, new THREE.BoxGeometry(0.26, 3.1, 0.26), toon('#6b4226'), { p: [x, 1.55, vz1 - 0.2], outline: true });
        if (k < 3) {
          const mx = x + (x1 - x0) / 6;
          add(g, new THREE.BoxGeometry(Math.abs(x1 - x0) / 3 - 0.3, 0.12, 0.12), toon('#8b5a2b'), { p: [mx, 1.0, vz1 - 0.2] });
          // a pennant banner hanging between posts
          add(g, new THREE.ConeGeometry(0.35, 0.8, 3), toon(k % 2 ? '#ffd84d' : '#2f7f5e', { side: THREE.DoubleSide }), { p: [mx, 2.55, vz1 - 0.2], r: [Math.PI, 0, 0], s: [1, 1, 0.12], cast: false });
        }
      }
      // a quiver barrel and hay bales on each wing
      barrel(g, side * (w / 2 - 0.8), vz0 + 0.8);
      for (let k = 0; k < 5; k++) add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), toon('#e8c96a'), { p: [side * (w / 2 - 0.8) + (k - 2) * 0.12, 1.5, vz0 + 0.8 + ((k * 3) % 2) * 0.1], r: [0, 0, (k - 2) * 0.1] });
      add(g, new THREE.BoxGeometry(1.4, 0.8, 0.9), toon('#e8c96a'), { p: [side * (tW / 2 + 1.6), 0.55, vz0 + 0.7], outline: true });
    }
    for (const [x, z] of [[-w / 2 + 0.8, d / 2 + 1.1], [w / 2 - 0.8, d / 2 + 1.1]]) {
      add(g, new THREE.CylinderGeometry(0.5, 0.55, 0.9, 12), toon('#e8c96a'), { p: [x, 0.45, z], outline: true });
    }
  },

  casino(g, w, d, anim, ctx) {
    const h = 4.8;
    walls(g, w, h, d, '#3a1f5c', stoneTex);
    add(g, new THREE.BoxGeometry(w + 0.6, 0.45, d + 0.6), shiny('#ffc53d'), { p: [0, h + 0.2, 0] });
    // the sign: big 3D block letters (glowing faces, red returns) standing on a steel rail on the roof
    // edge, each one ringed with marquee bulbs that chase round the letters
    const signW = w * 0.9;
    const letters = casinoLetters();
    const units = letters.reduce((n, l) => n + l.w, 0) + 0.18 * (letters.length - 1);
    const k = Math.min(2.1, signW / units);
    const sign = new THREE.Group();
    sign.position.set(-(units * k) / 2, h + 0.45, d / 2 - 0.3);
    g.add(sign);
    add(g, new THREE.BoxGeometry(units * k + 0.6, 0.22, 0.5), toon('#23263f'), { p: [0, h + 0.34, d / 2 - 0.15], outline: true });
    const face = new THREE.MeshToonMaterial({ color: '#fff6e0', emissive: '#ffe9b0', emissiveIntensity: 0.55, gradientMap: toon('#fff').gradientMap });
    const side = toon('#c21838');
    const on = basic('#fff6b0'), off = basic('#7a5a1a');
    const bulbs = [];
    const bulbGeo = new THREE.SphereGeometry(0.026, 8, 6);
    let x = 0;
    for (const l of letters) {
      const lg = new THREE.Group();
      lg.position.x = x * k;
      lg.scale.setScalar(k);
      sign.add(lg);
      const geo = new THREE.ExtrudeGeometry(l.shapes, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 1, curveSegments: 18 });
      add(lg, geo, [face, side], { p: [0, 0, -0.32], outline: true });
      // bulbs along every edge of the letter (outer outline and holes), just proud of the face
      for (const sh of l.shapes) {
        for (const path of [sh, ...sh.holes]) {
          const len = path.getLength();
          const n = Math.max(4, Math.round(len / 0.2));
          path.getSpacedPoints(n).slice(0, n).forEach((pt) => {
            const bulb = new THREE.Mesh(bulbGeo, on);
            bulb.position.set(pt.x, pt.y, 0.035);
            lg.add(bulb);
            bulbs.push(bulb);
          });
        }
      }
      x += l.w + 0.18;
    }
    // soft glow behind the whole sign
    const halo = new THREE.Sprite(additive(glowTexture, 0xff5d73, 0.35));
    halo.scale.set(units * k * 1.3, k * 2.2, 1);
    halo.position.set(0, h + 0.45 + k * 0.5, d / 2 - 0.6);
    g.add(halo);
    anim.push((t) => {
      const step = Math.floor(t * 8);
      bulbs.forEach((b, i) => { b.material = (step + i) % 3 === 0 ? off : on; });
      halo.material.opacity = 0.28 + Math.sin(t * 3) * 0.06;
    });
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

  market(g, w, d, anim, ctx) {
    // a two-storey timber trading hall with a coin-topped cupola, and a striped stall counter out front
    const hd = d * 0.55, hz = -d / 2 + hd / 2, h = 5.0;
    const hall = sub(g, 0, 0, hz);
    walls(hall, w * 0.92, h, hd, '#b98a55', plankTex);
    gable(hall, w * 0.92, hd, 3.0, h, '#c0572f');
    const hf = hz + hd / 2;
    for (const x of [-w * 0.3, 0, w * 0.3]) windowPane(g, x, 4.3, hf + 0.06, 1.3, 0.9, '#ffe3a0');
    // cupola on the ridge with a spinning gold coin
    const ry = h + 3.0;
    add(g, new THREE.BoxGeometry(1.7, 1.5, 1.7), mapped(plankTex, '#e8d2a8', 1, 1), { p: [0, ry + 0.4, hz], outline: true });
    add(g, new THREE.ConeGeometry(1.5, 1.4, 4), toon('#c0572f'), { p: [0, ry + 1.85, hz], r: [0, Math.PI / 4, 0], outline: true });
    const coin = add(g, new THREE.CylinderGeometry(0.55, 0.55, 0.14, 24), shiny('#ffd84d'), { p: [0, ry + 3.1, hz], r: [Math.PI / 2, 0, 0], outline: true });
    add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), toon('#5b5f73'), { p: [0, ry + 2.65, hz] });
    anim.push((t) => { coin.rotation.z = t * 1.5; });
    signBoard(g, ctx, 'TRADING TAVERN', { w: 8.2, h: 1.3, p: [0, h + 0.9, hf + 0.9], bg: ['#4a2e1c', '#2e1b10'], fg: '#ffd84d', frame: '#8b5a2b' });
    for (const o of [-3.2, 3.2]) add(g, new THREE.BoxGeometry(0.2, 1.6, 0.2), toon('#4a2e1c'), { p: [o, h + 0.2, hf + 0.8] });
    // stall: counter, posts and a sloped striped awning from the hall to the front
    const wood = toon('#b07a45');
    const cz = d / 2 - 1.0;
    add(g, new THREE.BoxGeometry(w * 0.86, 1.2, 1.4), mapped(plankTex, '#b07a45', 3, 0.5), { p: [0, 0.6, cz], outline: true });
    add(g, new THREE.BoxGeometry(w * 0.9, 0.16, 1.7), toon('#8b5a2b'), { p: [0, 1.25, cz] });
    for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.3, 3.5, 0.3), wood, { p: [sx * w * 0.45, 1.75, d / 2 - 0.3] });
    const az0 = hf, az1 = d / 2 + 0.4, aLen = Math.hypot(az1 - az0, 1.0);
    add(g, new THREE.PlaneGeometry(w * 0.96, aLen), new THREE.MeshToonMaterial({ map: tiled(awningTex('#e0463c', '#ffffff'), 4, 1), side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap }), { p: [0, 3.95, (az0 + az1) / 2], r: [-Math.PI / 2 + Math.atan2(1.0, az1 - az0), 0, 0] });
    for (let i = 0; i < 16; i++) {
      const x = -w * 0.48 + (i + 0.5) * (w * 0.96 / 16);
      add(g, new THREE.CircleGeometry(w * 0.96 / 32, 12, Math.PI, Math.PI), toon(i % 2 ? '#ffffff' : '#e0463c', { side: THREE.DoubleSide }), { p: [x, 3.45, az1], cast: false });
    }
    const goods = [['#e0463c', 0.2], ['#ff9f43', 0.2], ['#ffd84d', 0.18], ['#6ee7a0', 0.2], ['#9b59b6', 0.17]];
    for (let i = 0; i < 22; i++) {
      const [c, r] = goods[i % goods.length];
      add(g, new THREE.SphereGeometry(r, 10, 8), toon(c), { p: [-w * 0.38 + (i % 11) * (w * 0.76 / 10), 1.5, cz - 0.3 + Math.floor(i / 11) * 0.55] });
    }
    // weighing scales on the counter
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), shiny('#ffd84d'), { p: [w * 0.32, 1.78, cz] });
    add(g, new THREE.BoxGeometry(1.0, 0.05, 0.05), shiny('#ffd84d'), { p: [w * 0.32, 2.2, cz] });
    for (const o of [-0.45, 0.45]) add(g, new THREE.CylinderGeometry(0.22, 0.12, 0.08, 12), shiny('#ffd84d'), { p: [w * 0.32 + o, 1.9, cz] });
    // sacks, crates and barrels
    for (const s of [-1, 1]) {
      barrel(g, s * (w / 2 + 0.6), d / 2 - 0.8);
      crate(g, s * (w / 2 + 0.5), 0, d / 2 - 2.2, 1.0, 0.2 * s);
      crate(g, s * (w / 2 + 0.5), 1.0, d / 2 - 2.2, 0.75, -0.3 * s);
    }
    for (let k = 0; k < 3; k++) add(g, new THREE.SphereGeometry(0.42, 12, 10), toon('#d9b26a'), { p: [-w * 0.3 + k * 0.7, 0.4, d / 2 + 0.3], s: [1, 1.15, 1], outline: true });
  },

  boutique(g, w, d, anim, ctx) {
    // a two-storey fashion house: display windows with mannequins, a balcony, and a rooftop sign
    const h1 = 4.2, h2 = 3.4;
    walls(g, w, h1, d, '#ffd6e8');
    add(g, new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), toon('#ffffff'), { p: [0, h1 + 0.17, 0], outline: true });
    add(g, new THREE.BoxGeometry(w - 1.0, h2, d - 1.0), mapped(sidingTex, '#fff0f6', (w - 1) / 2.5, h2 / 2.5), { p: [0, h1 + 0.35 + h2 / 2, -0.2], outline: true });
    add(g, new THREE.BoxGeometry(w - 0.4, 0.3, d - 0.4), toon('#ffffff'), { p: [0, h1 + 0.35 + h2 + 0.15, -0.2] });
    const top = h1 + 0.35 + h2 + 0.3;
    gable(g, w - 1.0, d - 1.0, 2.4, top, '#2ed8c3', 0.5);
    // upper windows + balcony
    const uz = (d - 1.0) / 2 - 0.2;
    for (const x of [-w * 0.3, 0, w * 0.3]) windowPane(g, x, h1 + 2.1, uz + 0.06, 1.5, 1.5, '#ffe3f1');
    add(g, new THREE.BoxGeometry(w * 0.8, 0.2, 1.4), toon('#ffffff'), { p: [0, h1 + 0.45, uz + 0.7], outline: true });
    for (let k = 0; k <= 16; k++) add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), toon('#ffffff'), { p: [-w * 0.4 + (k * w * 0.8) / 16, h1 + 0.95, uz + 1.35] });
    add(g, new THREE.BoxGeometry(w * 0.8, 0.12, 0.12), toon('#ffffff'), { p: [0, h1 + 1.35, uz + 1.35] });
    // rooftop sign
    signBoard(g, ctx, 'STYLE SHOP', { w: 8.5, h: 1.7, p: [0, top + 1.0, uz + 0.8], bg: ['#2ed8c3', '#169e8e'], frame: '#ffffff', stroke: 'rgba(0,60,60,.4)' });
    // two display bays with mannequins, a grand door in the middle
    const dw = w * 0.32;
    const looks = [
      { skin: '#f6c9a0', hairColor: '#f2d16b', topColor: '#e57bff', bottomColor: '#23263f', hair: 'hair_long', top: 'top_suit', hat: 'hat_tophat', face: 'face_monocle', back: 'back_none', aura: 'aura_none' },
      { skin: '#c68642', hairColor: '#2b1d14', topColor: '#ffd84d', bottomColor: '#3b5bdb', hair: 'hair_afro', top: 'top_hawaiian', hat: 'hat_none', face: 'face_sunglasses', back: 'back_none', aura: 'aura_none' },
    ];
    [-1, 1].forEach((side, i) => {
      const dx = side * w * 0.28;
      add(g, new THREE.BoxGeometry(dw, 0.5, 1.6), toon('#ffffff'), { p: [dx, 0.25, d / 2 + 0.8] });
      add(g, new THREE.BoxGeometry(dw, 3, 0.1), toon('#bde9f5', { transparent: true, opacity: 0.25 }), { p: [dx, 2, d / 2 + 1.55], cast: false });
      for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.2, 3.2, 1.7), toon('#ffffff'), { p: [dx + s * dw / 2, 1.9, d / 2 + 0.8] });
      add(g, new THREE.BoxGeometry(dw + 0.2, 0.25, 1.7), toon('#ffffff'), { p: [dx, 3.5, d / 2 + 0.8] });
      add(g, new THREE.PlaneGeometry(dw + 0.6, 1.2), new THREE.MeshToonMaterial({ map: tiled(awningTex('#2ed8c3', '#ffffff'), 2, 1), side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap }), { p: [dx, 3.85, d / 2 + 1.95], r: [-0.9, 0, 0] });
      const c = new Character(looks[i]);
      c.root.position.set(dx, 0.5, d / 2 + 0.75);
      c.root.rotation.y = -side * 0.35;
      c.root.traverse((o) => { o.castShadow = false; });
      g.add(c.root);
      anim.push((t, dt) => c.update(dt, t + i * 3, false));
      // a potted topiary beside the door
      const px = side * 1.8;
      add(g, new THREE.CylinderGeometry(0.4, 0.3, 0.7, 12), toon('#ffffff'), { p: [px, 0.35, d / 2 + 0.6], outline: true });
      add(g, new THREE.SphereGeometry(0.55, 14, 10), toon('#3fb356'), { p: [px, 1.2, d / 2 + 0.6], outline: true });
      add(g, new THREE.SphereGeometry(0.38, 14, 10), toon('#3fb356'), { p: [px, 1.9, d / 2 + 0.6], outline: true });
    });
    door(g, 0, d / 2 + 0.08, 2.0, 3.0, '#e57bff');
    add(g, new THREE.BoxGeometry(2.8, 0.14, 1.3), toon('#ffffff'), { p: [0, 3.35, d / 2 + 0.6], outline: true });
  },

  petshop(g, w, d, anim, ctx) {
    const h = 4.4, rise = 3.0;
    walls(g, w, h, d, '#fff1c9');
    gable(g, w, d, rise, h, '#ff8fc7');
    // a big round shop window with a pet bed, a striped awning and a doghouse out front
    const wx = -w * 0.2;
    add(g, new THREE.CylinderGeometry(1.35, 1.35, 0.2, 32), toon('#ffffff'), { p: [wx, 2.3, d / 2 + 0.05], r: [Math.PI / 2, 0, 0], outline: true });
    add(g, new THREE.CylinderGeometry(1.15, 1.15, 0.22, 32), toon('#bde9f5', { emissive: '#ffd27a', emissiveIntensity: 0.25 }), { p: [wx, 2.3, d / 2 + 0.07], r: [Math.PI / 2, 0, 0], cast: false });
    add(g, new THREE.PlaneGeometry(w * 0.9, 1.3), new THREE.MeshToonMaterial({ map: tiled(awningTex('#ff8fc7', '#ffffff'), 3, 1), side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap }), { p: [0, 3.95, d / 2 + 0.7], r: [-0.8, 0, 0] });
    for (let i = 0; i < 12; i++) {
      const x = -w * 0.45 + (i + 0.5) * (w * 0.9 / 12);
      add(g, new THREE.CircleGeometry(w * 0.9 / 24, 12, Math.PI, Math.PI), toon(i % 2 ? '#ffffff' : '#ff8fc7', { side: THREE.DoubleSide }), { p: [x, 3.46, d / 2 + 1.16], cast: false });
    }
    door(g, w * 0.28, d / 2 + 0.08, 1.5, 2.6, '#ff8fc7');
    // a bone-shaped sign
    const bone = sub(g, 0, h + 0.5, d / 2 + 0.9);
    add(bone, new THREE.BoxGeometry(5.6, 1.1, 0.3), toon('#fffaf0'), { outline: true });
    for (const x of [-2.9, 2.9]) for (const y of [-0.42, 0.42]) add(bone, new THREE.SphereGeometry(0.5, 14, 10), toon('#fffaf0'), { p: [x, y, 0], s: [1, 1, 0.45], outline: true });
    signBoard(bone, ctx, 'PET SHOP', { w: 5.0, h: 0.9, p: [0, 0, 0.1], bg: ['#fffaf0'], fg: '#ff5fa8', frame: '#fffaf0', stroke: 'rgba(120,40,80,.25)' });
    anim.push((t) => { bone.rotation.z = Math.sin(t * 1.5) * 0.03; });
    // a big lazy cat napping on the ridge, tail swishing
    const cat = sub(g, -w * 0.18, h + rise - 0.1, 0);
    const fur = toon('#ffb04d'), white = toon('#fffaf0'), ink = basic('#2a1a12'), pink = toon('#ff8fc7');
    add(cat, new THREE.SphereGeometry(1.0, 20, 14), fur, { p: [0, 0.55, 0], s: [1.6, 0.75, 1.0], outline: true });
    const head = sub(cat, -1.55, 0.95, 0.35);
    add(head, new THREE.SphereGeometry(0.78, 20, 14), fur, { outline: true });
    add(head, new THREE.SphereGeometry(0.4, 14, 10), white, { p: [0, -0.22, 0.55], s: [1.2, 0.8, 0.7] });
    for (const s of [-1, 1]) {
      add(head, new THREE.ConeGeometry(0.28, 0.5, 4), fur, { p: [s * 0.42, 0.66, 0], r: [0, 0, -s * 0.35], outline: true });
      add(head, new THREE.ConeGeometry(0.15, 0.28, 4), pink, { p: [s * 0.4, 0.62, 0.08], r: [0, 0, -s * 0.35] });
      // sleepy closed eyes
      add(head, new THREE.TorusGeometry(0.11, 0.03, 6, 12, Math.PI), ink, { p: [s * 0.28, 0.08, 0.7], r: [0, 0, Math.PI] });
      add(head, new THREE.SphereGeometry(0.12, 10, 8), pink, { p: [s * 0.45, -0.12, 0.6], s: [1, 0.6, 0.4] });
    }
    add(head, new THREE.SphereGeometry(0.07, 8, 6), pink, { p: [0, -0.1, 0.84] });
    for (const x of [-1.0, -0.4]) add(cat, new THREE.SphereGeometry(0.28, 12, 8), white, { p: [x, 0.2, 0.75], s: [1.2, 0.7, 1] });
    const tail = sub(cat, 1.5, 0.5, 0);
    add(tail, new THREE.CapsuleGeometry(0.16, 1.2, 4, 8), fur, { p: [0.55, 0, 0.3], r: [0, 0, -1.2], outline: true });
    anim.push((t) => {
      tail.rotation.y = Math.sin(t * 1.8) * 0.5;
      head.rotation.z = Math.sin(t * 0.6) * 0.06;
      cat.scale.y = 1 + Math.sin(t * 1.4) * 0.03;
    });
    // the doghouse and a fenced play yard with toys
    const dh = sub(g, -w / 2 - 1.2, 0, d / 2 - 0.5, 0.5);
    add(dh, new THREE.BoxGeometry(1.4, 1.1, 1.4), toon('#e0463c'), { p: [0, 0.55, 0], outline: true });
    const roof = new THREE.Shape();
    roof.moveTo(-0.95, 0); roof.lineTo(0.95, 0); roof.lineTo(0, 0.8); roof.closePath();
    const rg = new THREE.ExtrudeGeometry(roof, { depth: 1.6, bevelEnabled: false });
    rg.translate(0, 0, -0.8);
    add(dh, rg, toon('#8b5a2b'), { p: [0, 1.1, 0], outline: true });
    add(dh, new THREE.CircleGeometry(0.38, 16), toon('#2a1a12'), { p: [0, 0.5, 0.71], cast: false });
    const yx = w / 2 + 1.6, yz = 0;
    const picket = toon('#ffffff');
    for (let k = 0; k <= 8; k++) {
      const z = yz - 3 + (k * 6) / 8;
      add(g, new THREE.BoxGeometry(0.14, 0.9, 0.14), picket, { p: [yx + 1.3, 0.45, z] });
    }
    for (let k = 0; k <= 3; k++) for (const z of [yz - 3, yz + 3]) add(g, new THREE.BoxGeometry(0.14, 0.9, 0.14), picket, { p: [yx - 1.3 + (k * 2.6) / 3, 0.45, z] });
    for (const y of [0.35, 0.75]) {
      add(g, new THREE.BoxGeometry(0.08, 0.1, 6), picket, { p: [yx + 1.3, y, yz] });
      for (const z of [yz - 3, yz + 3]) add(g, new THREE.BoxGeometry(2.6, 0.1, 0.08), picket, { p: [yx, y, z] });
    }
    add(g, new THREE.SphereGeometry(0.3, 14, 10), toon('#ffd84d'), { p: [yx, 0.3, yz - 1], outline: true });
    add(g, new THREE.SphereGeometry(0.25, 14, 10), toon('#39c6ff'), { p: [yx + 0.5, 0.25, yz + 1.2], outline: true });
    add(g, new THREE.TorusGeometry(0.4, 0.12, 8, 20), toon('#ff8fc7'), { p: [yx - 0.4, 0.12, yz + 0.2], r: [Math.PI / 2, 0, 0], outline: true });
  },

  houses(g, w, d, anim, ctx) {
    const palette = [['#fff1c9', '#4a7bd0'], ['#d8f0ff', '#e0463c'], ['#e8ffe0', '#7c6bff']];
    // three homes side by side on one line, with a clear gap between their roofs
    const hw = w / 3 - 1.5, hd = d * 0.55;
    palette.forEach(([wall, roof], i) => {
      const house = new THREE.Group();
      house.position.set(-w / 3 + i * (w / 3), 0, (d - hd) / 2 - 1);
      const h = 3.2;
      walls(house, hw, h, hd, wall);
      gable(house, hw, hd, 2.2, h, roof, 0.35);
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
    for (const sx of [-1.1, 1.1]) add(g, new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), toon('#8b5a2b'), { p: [sx, 0.9, d / 2 + 0.6] });
    signBoard(g, ctx, 'HOMES', { w: 2.6, h: 0.75, p: [0, 1.95, d / 2 + 0.7], bg: ['#2ed8c3'], frame: '#8b5a2b' });
  },
};

// the fish market stall by the pond: a counter of fish on ice, and the fishmonger who buys your catch
BUILDERS.fishstand = function fishstand(g, w, d, anim) {
  const wood = mapped(plankTex, '#b07a45', 2, 1), dark = toon('#6b4226');
  const cz = d * 0.08; // the counter's front edge lines up with where you can't walk any more
  // wooden deck
  add(g, new THREE.BoxGeometry(w, 0.25, d), mapped(plankTex, '#a0703f', w / 2, d / 2), { p: [0, 0.12, 0], outline: true });
  // back wall + posts + striped awning roof
  add(g, new THREE.BoxGeometry(w - 0.4, 3.4, 0.25), wood, { p: [0, 1.95, -d / 2 + 0.4], outline: true });
  for (const x of [-w / 2 + 0.35, w / 2 - 0.35]) for (const z of [-d / 2 + 0.4, cz]) add(g, new THREE.CylinderGeometry(0.14, 0.16, 3.7, 10), dark, { p: [x, 1.95, z], outline: true });
  const aw = add(g, new THREE.PlaneGeometry(w + 0.4, d * 0.62), new THREE.MeshToonMaterial({ map: tiled(awningTex('#2f7fe0', '#ffffff'), 5, 1), side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap }), { p: [0, 3.95, -d * 0.12], r: [-Math.PI / 2 + 0.28, 0, 0] });
  aw.castShadow = true;
  // scalloped fringe along the front
  for (let i = 0; i < 12; i++) add(g, new THREE.CylinderGeometry(0.28, 0.28, 0.05, 12, 1, false, 0, Math.PI), toon(i % 2 ? '#ffffff' : '#2f7fe0'), { p: [-w / 2 + 0.2 + (i + 0.5) * ((w + 0.0) / 12), 3.55, cz + 0.55], r: [Math.PI / 2, 0, 0], cast: false });
  // the counter, topped with crushed ice and the day's catch
  add(g, new THREE.BoxGeometry(w - 1, 1.1, 1.2), wood, { p: [0, 0.8, cz - 0.3], outline: true });
  add(g, new THREE.BoxGeometry(w - 1.1, 0.16, 1.1), toon('#e8f6ff'), { p: [0, 1.42, cz - 0.3] });
  for (let i = 0; i < 18; i++) add(g, new THREE.IcosahedronGeometry(0.09, 0), basic('#ffffff', { transparent: true, opacity: 0.85 }), { p: [-w / 2 + 0.8 + (i * 0.47) % (w - 1.6), 1.53, cz - 0.7 + (i % 3) * 0.35], cast: false });
  const catchOfTheDay = [
    { color: '#6fa8dc', belly: '#dfe9f5' }, { color: '#ff8a5c', belly: '#ffe0cc' }, { color: '#b0b7c3', belly: '#eef2f7' }, { color: '#5fbf77', belly: '#e0f5e5' },
    { color: '#e0463c', belly: '#ffd9d4' }, { color: '#ffd84d', belly: '#fff6c8' }, { color: '#7d5cff', belly: '#e6e0ff' },
  ];
  catchOfTheDay.forEach((c, i) => {
    const f = new THREE.Group();
    add(f, new THREE.SphereGeometry(0.2, 14, 10), toon(c.color), { s: [1.9, 0.75, 0.6], outline: true });
    add(f, new THREE.ConeGeometry(0.16, 0.26, 4), toon(c.color), { p: [-0.46, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.35] });
    add(f, new THREE.SphereGeometry(0.035, 8, 6), basic('#1d1b2e'), { p: [0.26, 0.05, 0.1], cast: false });
    f.position.set(-w / 2 + 1.1 + i * ((w - 2.2) / (catchOfTheDay.length - 1)), 1.62, cz - 0.3 + (i % 2 ? 0.18 : -0.18));
    f.rotation.set(Math.PI / 2 - 0.2, 0, (i % 2 ? 0.4 : -0.3));
    g.add(f);
  });
  // price slate
  const slate = canvasTexture(256, 128, (c) => {
    c.fillStyle = '#23263f'; c.fillRect(0, 0, 256, 128);
    c.strokeStyle = '#8b5a2b'; c.lineWidth = 10; c.strokeRect(5, 5, 246, 118);
    c.fillStyle = '#ffffff'; c.font = 'bold 30px Rubik, sans-serif'; c.textAlign = 'center';
    c.fillText('WE BUY FISH!', 128, 55);
    c.fillStyle = '#ffd84d'; c.font = 'bold 26px Rubik, sans-serif'; c.fillText('best prices 🪙', 128, 95);
  });
  add(g, new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: slate }), { p: [w / 2 - 1.3, 0.85, cz + 0.31], cast: false });
  // big sign on top
  signBoard(g, null, 'FISH MARKET', { w: 5.2, h: 0.9, p: [0, 4.75, -d / 2 + 0.45], bg: ['#2f7fe0'], frame: '#6b4226' });
  const bigFish = new THREE.Group();
  add(bigFish, new THREE.SphereGeometry(0.45, 16, 12), toon('#39a0ff'), { s: [2, 0.8, 0.5], outline: true });
  add(bigFish, new THREE.ConeGeometry(0.4, 0.6, 4), toon('#39a0ff'), { p: [-1.05, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.35], outline: true });
  add(bigFish, new THREE.SphereGeometry(0.08, 8, 6), basic('#1d1b2e'), { p: [0.62, 0.12, 0.2] });
  bigFish.position.set(0, 5.75, -d / 2 + 0.45);
  g.add(bigFish);
  anim.push((t) => { bigFish.rotation.z = Math.sin(t * 1.3) * 0.12; bigFish.position.y = 5.75 + Math.sin(t * 2) * 0.08; });
  // fish hanging from the awning beam
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + 1.2 + i * 0.55;
    add(g, new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), toon('#e8dcc0'), { p: [x, 3.2, cz + 0.2], cast: false });
    add(g, new THREE.SphereGeometry(0.13, 10, 8), toon(['#b0b7c3', '#ff8a5c', '#6fa8dc', '#5fbf77'][i]), { p: [x, 2.85, cz + 0.2], s: [0.6, 1.8, 0.5], outline: true });
  }
  // barrels, a crate of ice and a lantern
  for (const [x, z] of [[w / 2 - 0.5, cz + 0.9], [w / 2 - 1.2, cz + 1.3], [-w / 2 + 0.6, cz + 1]]) {
    add(g, new THREE.CylinderGeometry(0.42, 0.36, 0.95, 14), toon('#8b5a2b'), { p: [x, 0.72, z], outline: true });
    add(g, new THREE.CylinderGeometry(0.43, 0.43, 0.06, 14), toon('#3a3f5a'), { p: [x, 0.95, z], cast: false });
    add(g, new THREE.CylinderGeometry(0.43, 0.43, 0.06, 14), toon('#3a3f5a'), { p: [x, 0.5, z], cast: false });
  }
  crate(g, -w / 2 + 1.6, 0.25, cz + 1.2, 0.8, 0.3);
  add(g, new THREE.BoxGeometry(0.7, 0.12, 0.7), toon('#e8f6ff'), { p: [-w / 2 + 1.6, 1.11, cz + 1.2], r: [0, 0.3, 0] });
  const lantern = add(g, new THREE.SphereGeometry(0.2, 12, 10), basic('#ffe9a8'), { p: [w / 2 - 0.35, 3.05, cz + 0.05], cast: false });
  const halo = new THREE.Sprite(additive(glowTexture, 0xffd27a, 0.55));
  halo.scale.setScalar(1.6);
  lantern.add(halo);
  // the fishmonger: rubber apron, cap, waving at passers-by
  const monger = new Character({ skin: '#e3ac78', hairColor: '#8a8a8a', topColor: '#f4f0ff', bottomColor: '#2f5fa0', shoeColor: '#23263f', hair: 'hair_short', top: 'top_tee', bottom: 'bottom_overalls', hat: 'hat_cap', face: 'face_none', back: 'back_none', aura: 'aura_none', height: 'height_tall' });
  monger.root.position.set(0.4, 0.25, cz - 1.35);
  monger.root.traverse((o) => { o.castShadow = false; });
  g.add(monger.root);
  let waveAt = 3;
  anim.push((t, dt) => {
    monger.update(dt, t, false);
    if (t > waveAt) { monger.emote('wave'); waveAt = t + 6 + Math.random() * 6; }
  });
};

/** Build a building for a map spot; returns a Group placed in the world. */
export function buildBuilding(spot, anim, ctx) {
  const g = new THREE.Group();
  // buildings are modelled with the door on +Z; ones facing east/west have their footprint turned
  const side = spot.face === 'e' || spot.face === 'w';
  // modelled at plan size, then scaled up as a whole so doors, windows and roofs keep their proportions
  const k = spot.scale ?? 1;
  const w = (side ? spot.h : spot.w) / PX / k, d = (side ? spot.w : spot.h) / PX / k;
  BUILDERS[spot.kind](g, w, d, anim, ctx);
  g.scale.setScalar(k);
  const cx = (spot.x + spot.w / 2 - CENTER.x) / PX, cz = (spot.y + spot.h / 2 - CENTER.y) / PX;
  g.position.set(cx, heightAt(spot.x + spot.w / 2, spot.y + spot.h / 2), cz);
  g.rotation.y = { n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[spot.face] ?? 0;
  g.userData.spot = spot;
  return g;
}
