// 3D building models. Each builder gets the spot and returns a Group centered on the spot's
// footprint, with its front (door side) facing +Z. `anim` collects per-frame animation callbacks.
import * as THREE from 'three';
import { TAU, toon, basic, shiny, outlineMaterial, canvasTexture, additive, glowTexture } from './materials.js';
import { Character } from './character.js';
import { PX, CENTER, heightAt } from '../map.js';

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

/** A framed sign board with lettering on the front face (text redrawn once fonts load). */
function signBoard(g, ctx, text, { w = 6, h = 1.4, p = [0, 0, 0], bg = ['#d6334a', '#8f1530'], fg = '#ffffff', frame = '#5a3a22', font = '"Luckiest Guy", Rubik, sans-serif', stroke = 'rgba(0,0,0,.35)' } = {}) {
  const cw = 1024, ch = Math.round((1024 * h) / w);
  const draw = (c) => {
    const grad = c.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, bg[0]);
    grad.addColorStop(1, bg[1] ?? bg[0]);
    c.fillStyle = grad;
    c.fillRect(0, 0, cw, ch);
    let size = Math.floor(ch * 0.7);
    c.font = `${size}px ${font}`;
    while (c.measureText(text).width > cw * 0.9 && size > 10) { size -= 4; c.font = `${size}px ${font}`; }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = size * 0.12;
    c.strokeStyle = stroke;
    c.strokeText(text, cw / 2, ch / 2 + size * 0.06);
    c.fillStyle = fg;
    c.fillText(text, cw / 2, ch / 2 + size * 0.06);
  };
  const tex = ctx?.text ? ctx.text(cw, ch, draw) : canvasTexture(cw, ch, draw);
  const fm = toon(frame);
  const face = new THREE.MeshBasicMaterial({ map: tex });
  const m = add(g, new THREE.BoxGeometry(w, h, 0.25), [fm, fm, fm, fm, face, fm], { p, outline: true });
  add(g, new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.18), fm, { p: [p[0], p[1], p[2] - 0.06] });
  return m;
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

  dome(g, w, d, anim) {
    const r = Math.min(w, d) / 2 - 0.4;
    add(g, new THREE.CylinderGeometry(r + 0.35, r + 0.55, 0.9, 48), toon('#3b5bdb'), { p: [0, 0.45, 0], outline: true });
    add(g, new THREE.CylinderGeometry(r, r, 0.08, 48), toon('#dff4ff'), { p: [0, 0.93, 0], cast: false });
    const ring = new THREE.MeshBasicMaterial({ color: '#ff5dac' });
    add(g, new THREE.TorusGeometry(r + 0.42, 0.07, 8, 64), ring, { p: [0, 0.7, 0], r: [Math.PI / 2, 0, 0], cast: false });
    const glass = new THREE.MeshStandardMaterial({ color: '#bfefff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    add(g, new THREE.SphereGeometry(r, 40, 20, 0, TAU, 0, Math.PI / 2), glass, { p: [0, 0.9, 0], outline: false, cast: false });
    const rib = toon('#ffffff');
    for (let i = 0; i < 4; i++) {
      add(g, new THREE.TorusGeometry(r, 0.06, 6, 40, Math.PI), rib, { p: [0, 0.9, 0], r: [0, (i / 4) * Math.PI, 0], cast: false });
    }
    add(g, new THREE.SphereGeometry(0.35, 12, 10), shiny('#ffc53d'), { p: [0, r + 0.95, 0] });
    // bumper cars circling inside
    const cars = ['#ff5d73', '#ffd84d', '#6ee7a0'].map((c) => {
      const car = new THREE.Group();
      add(car, new THREE.CylinderGeometry(0.55, 0.6, 0.35, 20), toon(c), { p: [0, 0.2, 0], outline: true });
      add(car, new THREE.TorusGeometry(0.62, 0.1, 8, 24), toon('#2b2f4a'), { p: [0, 0.15, 0], r: [Math.PI / 2, 0, 0] });
      add(car, new THREE.SphereGeometry(0.22, 12, 10), toon('#f6c9a0'), { p: [0, 0.65, 0] });
      car.position.y = 0.95;
      g.add(car);
      return car;
    });
    anim.push((t) => {
      const hue = (t * 0.15) % 1;
      ring.color.setHSL(hue, 0.9, 0.62);
      cars.forEach((car, i) => {
        const a = t * (0.7 + i * 0.15) + i * 2.1;
        const rr = (r - 1.1) * (0.6 + 0.4 * Math.sin(t * 0.9 + i));
        car.position.x = Math.cos(a) * rr;
        car.position.z = Math.sin(a) * rr;
        car.rotation.y = -a;
        car.position.y = 0.95 + Math.abs(Math.sin(t * 6 + i)) * 0.05;
      });
    });
    // entrance arch + neon sign
    add(g, new THREE.BoxGeometry(2.4, 2.6, 0.5), toon('#3b5bdb'), { p: [0, 1.3, r + 0.25], outline: true });
    add(g, new THREE.BoxGeometry(1.6, 2.1, 0.55), basic('#0e1535'), { p: [0, 1.05, r + 0.27] });
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
    for (const s of [-1, 1]) {
      const tape = add(g, new THREE.BoxGeometry(5, 0.32, 0.06), new THREE.MeshBasicMaterial({ map: tapeTex }), { p: [0, 1.4, d / 2 - 0.7], r: [0, 0, s * 0.28] });
      tape.castShadow = false;
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
    signBoard(g, ctx, 'TRADING POST', { w: 7.4, h: 1.3, p: [0, h + 0.9, hf + 0.9], bg: ['#4a2e1c', '#2e1b10'], fg: '#ffd84d', frame: '#8b5a2b' });
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
      c.fillText('HOMES', 128, 54);
    });
    add(g, new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), toon('#8b5a2b'), { p: [0, 0.9, d / 2 + 0.6] });
    add(g, new THREE.BoxGeometry(2.2, 0.85, 0.12), [toon('#e8c07a'), toon('#e8c07a'), toon('#e8c07a'), toon('#e8c07a'), new THREE.MeshBasicMaterial({ map: signTex }), toon('#e8c07a')], { p: [0, 1.7, d / 2 + 0.66], outline: true });
  },
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
  const cx = (spot.x + spot.w / 2 - 900) / PX, cz = (spot.y + spot.h / 2 - 600) / PX;
  g.position.set(cx, 0, cz);
  g.userData.spot = spot;
  return g;
}
