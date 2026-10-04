// The outside of a house: wall finishes (siding, brick, stone…), roofs, paths and driveways, and yard
// decorations. Everything here is built from a house's `ext` data (see default_ext / clean_ext in
// server.py), in plot tiles, so the same code draws your own house and everyone else's on the street.
// (The walls themselves are ordinary walls you draw on the plot: see house.js.)
//
// To add a finish, roof material or ground material: add it to cosmetics.json and give it a pattern in
// PATTERNS below. To add a roof shape: add it to cosmetics.json and to ROOFS. Yard things: YARD.
import * as THREE from 'three';
import { toon, canvasTexture } from './materials.js';
import { CATALOG } from '../catalog.js';
import { WALL_T } from './doors.js';

export const WALL_H = 3.2;          // (tiles: the same as inside)
export const TH = WALL_T;           // how thick the outside walls are
export const PLOT = CATALOG.plot;   // { w, d, front }: the plot in tiles, and how far the front wall is from the street
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export const EXT_WALLS = byId(CATALOG.extWalls), ROOF_MATS = byId(CATALOG.roofMats), GROUND_MATS = byId(CATALOG.groundMats), YARD_ITEMS = byId(CATALOG.yardItems);

/** (A house is the whole plot now: its coordinates start at the plot's back-left corner.) */
export const houseSpot = () => ({ x: 0, z: 0 });

export function defaultExt() {
  const mid = Math.floor(PLOT.w / 2);
  return { wall: { m: 'siding', c: '#f2ead8' }, roofs: [], ground: [{ m: 'pavers', c: '#d8cfc0', x: mid - 1, y: PLOT.d - 5, w: 2, d: 5 }], yard: [] };
}

// ---------------------------------------------------------------------------
// patterns: light, greyish pictures that the colour you pick tints
// ---------------------------------------------------------------------------

function prng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const grey = (v) => `rgb(${v},${v},${v})`;
const S = 256;
const fill = (c, v) => { c.fillStyle = grey(v); c.fillRect(0, 0, S, S); };
/** Speckles, wrapping round the edges. */
function speckle(c, rnd, n, lo, hi, size = 1.5, alpha = 0.5) {
  c.globalAlpha = alpha;
  for (let i = 0; i < n; i++) { c.fillStyle = grey(lo + Math.floor(rnd() * (hi - lo))); const s = 0.6 + rnd() * size; c.fillRect(rnd() * S, rnd() * S, s, s); }
  c.globalAlpha = 1;
}
/** Rows of staggered blocks (bricks, slates, shingles…), each a slightly different shade. */
function courses(c, rnd, { rows, cols, gap = 2, mortar = 215, lo = 150, hi = 205, round = 0, stagger = 0.5 }) {
  fill(c, mortar);
  const h = S / rows, w = S / cols;
  for (let r = 0; r < rows; r++) {
    // (the block that runs off the right edge comes back in on the left, in the same shade)
    const shades = Array.from({ length: cols }, () => grey(lo + Math.floor(rnd() * (hi - lo))));
    for (let k = -1; k < cols; k++) {
      const x = (k + (r % 2) * stagger) * w + gap / 2, y = r * h + gap / 2;
      c.fillStyle = shades[(k + cols) % cols];
      if (round) { c.beginPath(); c.roundRect(x, y, w - gap, h - gap, round); c.fill(); } else c.fillRect(x, y, w - gap, h - gap);
    }
  }
}
const PATTERNS = {
  // ---- walls
  paint(c, rnd) { fill(c, 238); speckle(c, rnd, 500, 225, 250, 2, 0.35); },
  siding(c) { fill(c, 236); for (let y = 0; y < S; y += 32) { c.fillStyle = grey(250); c.fillRect(0, y, S, 3); c.fillStyle = grey(170); c.fillRect(0, y + 28, S, 4); c.fillStyle = grey(215); c.fillRect(0, y + 24, S, 4); } },
  batten(c) { fill(c, 232); for (let x = 0; x < S; x += 64) { c.fillStyle = grey(180); c.fillRect(x + 24, 0, 2, S); c.fillRect(x + 40, 0, 2, S); c.fillStyle = grey(250); c.fillRect(x + 26, 0, 14, S); } },
  brick(c, rnd) { courses(c, rnd, { rows: 8, cols: 4, gap: 4, mortar: 236, lo: 150, hi: 215 }); speckle(c, rnd, 700, 120, 240, 2, 0.25); },
  stone(c, rnd) {
    fill(c, 120);
    let y = 0;
    for (const h of [44, 36, 52, 40, 48, 36]) {
      let x = -rnd() * 40;
      while (x < S) { const w = 34 + rnd() * 52; c.fillStyle = grey(165 + Math.floor(rnd() * 75)); for (const dx of [0, -S]) { c.beginPath(); c.roundRect(x + dx + 2, y + 2, w - 4, h - 4, 9); c.fill(); } x += w; }
      y += h;
    }
    speckle(c, rnd, 900, 130, 250, 2, 0.2);
  },
  stucco(c, rnd) { fill(c, 232); speckle(c, rnd, 2600, 195, 255, 2.4, 0.5); },
  concrete(c, rnd) { fill(c, 218); speckle(c, rnd, 1400, 190, 240, 2, 0.4); c.fillStyle = grey(165); for (const p of [0, 128]) { c.fillRect(p, 0, 2, S); c.fillRect(0, p, S, 2); } c.fillStyle = grey(150); for (const x of [24, 104, 152, 232]) for (const y of [24, 104, 152, 232]) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); } },
  planks(c, rnd) { fill(c, 150); for (let y = 0; y < S; y += 32) { c.fillStyle = grey(200 + Math.floor(rnd() * 45)); c.fillRect(0, y + 1, S, 30); c.fillStyle = grey(175); for (let i = 0; i < 5; i++) c.fillRect(0, y + 4 + rnd() * 24, S, 1); const j = rnd() * S; c.fillStyle = grey(140); c.fillRect(j, y + 1, 2, 30); } },
  shake(c, rnd) { courses(c, rnd, { rows: 8, cols: 8, gap: 2, mortar: 120, lo: 185, hi: 250 }); c.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < S; y += 32) c.fillRect(0, y + 27, S, 5); },
  panel(c) { fill(c, 235); c.fillStyle = grey(120); for (const p of [0, 128]) { c.fillRect(p, 0, 3, S); c.fillRect(0, p, S, 3); } c.fillStyle = grey(250); for (const p of [3, 131]) { c.fillRect(p, 0, 2, S); c.fillRect(0, p, S, 2); } },
  logs(c) { for (let y = 0; y < S; y += 64) { const g = c.createLinearGradient(0, y, 0, y + 64); g.addColorStop(0, grey(120)); g.addColorStop(0.3, grey(250)); g.addColorStop(0.75, grey(190)); g.addColorStop(1, grey(95)); c.fillStyle = g; c.fillRect(0, y, S, 64); c.fillStyle = 'rgba(0,0,0,.12)'; for (const k of [18, 30, 44]) c.fillRect(0, y + k, S, 1); } },
  tudor(c, rnd) { fill(c, 240); speckle(c, rnd, 900, 215, 255, 2, 0.4); c.fillStyle = '#2e2018'; for (const x of [0, 128]) c.fillRect(x, 0, 14, S); for (const y of [0, 128]) c.fillRect(0, y, S, 14); c.lineWidth = 12; c.strokeStyle = '#2e2018'; c.beginPath(); c.moveTo(14, 128); c.lineTo(128, 14); c.moveTo(142, 256); c.lineTo(256, 142); c.stroke(); },
  // ---- roofs
  shingle(c, rnd) { courses(c, rnd, { rows: 8, cols: 6, gap: 2, mortar: 110, lo: 190, hi: 245 }); c.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < S; y += 32) c.fillRect(0, y + 28, S, 4); },
  tile(c) { fill(c, 130); for (let r = 0; r < 8; r++) for (let k = -1; k < 8; k++) { const x = (k + (r % 2) * 0.5) * 32, y = r * 32; const g = c.createLinearGradient(x, 0, x + 32, 0); g.addColorStop(0, grey(150)); g.addColorStop(0.5, grey(250)); g.addColorStop(1, grey(150)); c.fillStyle = g; c.beginPath(); c.roundRect(x + 1, y - 6, 30, 36, [0, 0, 15, 15]); c.fill(); } },
  metal(c) { fill(c, 228); for (let x = 0; x < S; x += 64) { c.fillStyle = grey(250); c.fillRect(x + 28, 0, 8, S); c.fillStyle = grey(150); c.fillRect(x + 36, 0, 3, S); c.fillStyle = grey(190); c.fillRect(x + 25, 0, 3, S); } },
  slate(c, rnd) { courses(c, rnd, { rows: 8, cols: 4, gap: 2, mortar: 100, lo: 165, hi: 240 }); },
  thatch(c, rnd) { fill(c, 215); for (let i = 0; i < 900; i++) { c.fillStyle = grey(160 + Math.floor(rnd() * 90)); c.fillRect(rnd() * S, rnd() * S, 1.5, 14 + rnd() * 26); } c.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < S; y += 64) c.fillRect(0, y + 58, S, 6); },
  smooth(c, rnd) { fill(c, 235); speckle(c, rnd, 400, 220, 250, 2, 0.3); },
  // ---- ground
  asphalt(c, rnd) { fill(c, 205); speckle(c, rnd, 3000, 150, 255, 2, 0.55); },
  cobble(c, rnd) { fill(c, 120); for (let r = 0; r < 8; r++) { const sh = Array.from({ length: 8 }, () => grey(175 + Math.floor(rnd() * 70))); for (let k = -1; k < 8; k++) { c.fillStyle = sh[(k + 8) % 8]; c.beginPath(); c.ellipse((k + (r % 2) * 0.5) * 32 + 16, r * 32 + 16, 14, 13, 0, 0, 7); c.fill(); } } },
  pavers(c, rnd) { courses(c, rnd, { rows: 4, cols: 4, gap: 4, mortar: 150, lo: 205, hi: 245, stagger: 0 }); speckle(c, rnd, 600, 170, 250, 2, 0.25); },
  gravel(c, rnd) { fill(c, 190); for (let i = 0; i < 1500; i++) { c.fillStyle = grey(140 + Math.floor(rnd() * 115)); c.beginPath(); c.arc(rnd() * S, rnd() * S, 1.5 + rnd() * 3, 0, 7); c.fill(); } },
  deck(c, rnd) { fill(c, 130); for (let x = 0; x < S; x += 32) { c.fillStyle = grey(205 + Math.floor(rnd() * 45)); c.fillRect(x + 1, 0, 30, S); c.fillStyle = grey(180); for (let i = 0; i < 4; i++) c.fillRect(x + 4 + rnd() * 24, 0, 1, S); } },
  flag(c, rnd) { fill(c, 130); for (let r = 0; r < 4; r++) { let x = -rnd() * 50; while (x < S) { const w = 50 + rnd() * 60; c.fillStyle = grey(180 + Math.floor(rnd() * 65)); for (const dx of [0, -S]) { c.beginPath(); c.roundRect(x + dx + 3, r * 64 + 3, w - 6, 58, 12); c.fill(); } x += w; } } },
  sand(c, rnd) { fill(c, 240); speckle(c, rnd, 2200, 205, 255, 1.6, 0.5); },
  mulch(c, rnd) { fill(c, 190); for (let i = 0; i < 1100; i++) { c.fillStyle = grey(120 + Math.floor(rnd() * 130)); c.save(); c.translate(rnd() * S, rnd() * S); c.rotate(rnd() * 3); c.fillRect(-4, -1, 8, 2.4); c.restore(); } },
};

const texCache = new Map();
/** A pattern as a repeating texture (it covers 2 tiles, like the wallpapers). */
export function extTexture(id) {
  if (!texCache.has(id)) {
    const seed = [...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) | 0;
    const tex = canvasTexture(S, S, (c) => (PATTERNS[id] ?? PATTERNS.paint)(c, prng(seed)));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    texCache.set(id, tex);
  }
  return texCache.get(id);
}
const matCache = new Map();
/** A finish in a colour: one shared material per (pattern, colour). */
export function extMaterial(id, color) {
  const key = `${id}|${color}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshToonMaterial({ map: extTexture(id), color, side: THREE.DoubleSide, gradientMap: toon('#ffffff').gradientMap }));
  return matCache.get(key);
}
const swatches = new Map();
/** A little picture of a finish in a colour, for the build menu. */
export function extSwatch(id, color) {
  const key = `${id}|${color}`;
  if (!swatches.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const c = cv.getContext('2d');
    c.drawImage(extTexture(id).image, 0, 0, S, S, 0, 0, 96, 96);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = color; c.fillRect(0, 0, 96, 96);
    swatches.set(key, cv.toDataURL());
  }
  return swatches.get(key);
}

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** Flat faces (each a list of corners) as one geometry, the pattern running across each face at the
 *  same scale. hint: roughly which way the face looks, so it's lit from the right side. */
function facesGeometry(faces) {
  const pos = [], uv = [], nor = [], idx = [];
  const up = V(0, 1, 0), a = V(), b = V(), n = V(), u = V(), v = V();
  for (const { pts, hint = up } of faces) {
    a.subVectors(pts[1], pts[0]); b.subVectors(pts[2], pts[0]);
    n.crossVectors(a, b).normalize();
    const list = n.dot(hint) < 0 ? [...pts].reverse() : pts;
    if (n.dot(hint) < 0) n.negate();
    u.crossVectors(up, n);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0); else u.normalize();
    v.crossVectors(n, u);
    const base = pos.length / 3;
    for (const p of list) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(p.dot(u) / 2, p.dot(v) / 2); }
    for (let i = 1; i < list.length - 1; i++) idx.push(base, base + i, base + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const mesh = (faces, mat) => { const m = new THREE.Mesh(facesGeometry(faces), mat); m.castShadow = true; m.receiveShadow = true; return m; };
const boxAt = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };

// ---------------------------------------------------------------------------
// roofs: each shape gives the roof's own faces and the bits of wall under it (gable ends…), which
// take the finish of the wall they stand on. (x0..x1, z0..z1: the walls' outer edge; y: the wall tops.)
// ---------------------------------------------------------------------------

const OVER = 0.55; // how far the eaves hang over the walls
const N = { back: V(0, 0, -1), front: V(0, 0, 1), left: V(-1, 0, 0), right: V(1, 0, 0) };
const ROOFS = {
  gable(x0, x1, z0, z1, y) {
    const xm = (x0 + x1) / 2, rise = Math.max(1.6, Math.min(4.6, (x1 - x0) * 0.27)), e = OVER, k = rise / (xm - x0), yo = y - e * k;
    return {
      roof: [{ pts: [V(x0 - e, yo, z0 - e), V(x0 - e, yo, z1 + e), V(xm, y + rise, z1 + e), V(xm, y + rise, z0 - e)] }, { pts: [V(x1 + e, yo, z0 - e), V(x1 + e, yo, z1 + e), V(xm, y + rise, z1 + e), V(xm, y + rise, z0 - e)] }],
      walls: { 0: [{ pts: [V(x0, y, z0), V(x1, y, z0), V(xm, y + rise, z0)], hint: N.back }], 2: [{ pts: [V(x0, y, z1), V(x1, y, z1), V(xm, y + rise, z1)], hint: N.front }] },
      top: y + rise,
    };
  },
  gable_side(x0, x1, z0, z1, y) {
    const zm = (z0 + z1) / 2, rise = Math.max(1.6, Math.min(4.6, (z1 - z0) * 0.27)), e = OVER, k = rise / (zm - z0), yo = y - e * k;
    return {
      roof: [{ pts: [V(x0 - e, yo, z0 - e), V(x1 + e, yo, z0 - e), V(x1 + e, y + rise, zm), V(x0 - e, y + rise, zm)] }, { pts: [V(x0 - e, yo, z1 + e), V(x1 + e, yo, z1 + e), V(x1 + e, y + rise, zm), V(x0 - e, y + rise, zm)] }],
      walls: { 1: [{ pts: [V(x0, y, z0), V(x0, y, z1), V(x0, y + rise, zm)], hint: N.left }], 3: [{ pts: [V(x1, y, z0), V(x1, y, z1), V(x1, y + rise, zm)], hint: N.right }] },
      top: y + rise,
    };
  },
  hip(x0, x1, z0, z1, y) {
    const e = OVER, ax = x0 - e, bx = x1 + e, az = z0 - e, bz = z1 + e, w = bx - ax, d = bz - az, half = Math.min(w, d) / 2;
    const rise = Math.max(1.5, Math.min(4.2, half * 0.6)), yo = y - 0.12, yt = yo + rise;
    // the ridge runs along the longer side (a square house comes to a point)
    const r0 = w >= d ? V(ax + half, yt, az + half) : V(ax + half, yt, az + half), r1 = w >= d ? V(bx - half, yt, az + half) : V(ax + half, yt, bz - half);
    const along = w >= d;
    return {
      roof: along
        ? [{ pts: [V(ax, yo, az), V(bx, yo, az), r1, r0] }, { pts: [V(ax, yo, bz), V(bx, yo, bz), r1, r0] }, { pts: [V(ax, yo, az), V(ax, yo, bz), r0] }, { pts: [V(bx, yo, az), V(bx, yo, bz), r1] }]
        : [{ pts: [V(ax, yo, az), V(ax, yo, bz), r1, r0] }, { pts: [V(bx, yo, az), V(bx, yo, bz), r1, r0] }, { pts: [V(ax, yo, az), V(bx, yo, az), r0] }, { pts: [V(ax, yo, bz), V(bx, yo, bz), r1] }],
      walls: {}, top: yt,
    };
  },
  gambrel(x0, x1, z0, z1, y) {
    const xm = (x0 + x1) / 2, w = x1 - x0, rise = Math.max(2.2, Math.min(5.2, w * 0.36)), e = OVER, kx = w * 0.2, ky = rise * 0.64;
    const yo = y - e * (ky / kx) * 0.5, lx = x0 - e * 0.5, rx = x1 + e * 0.5;
    const prof = (z) => [V(x0, y, z), V(x0 + kx, y + ky, z), V(xm, y + rise, z), V(x1 - kx, y + ky, z), V(x1, y, z)];
    return {
      roof: [
        { pts: [V(lx, yo, z0 - e), V(lx, yo, z1 + e), V(x0 + kx, y + ky, z1 + e), V(x0 + kx, y + ky, z0 - e)], hint: V(-1, 0.5, 0) }, { pts: [V(x0 + kx, y + ky, z0 - e), V(x0 + kx, y + ky, z1 + e), V(xm, y + rise, z1 + e), V(xm, y + rise, z0 - e)] },
        { pts: [V(rx, yo, z0 - e), V(rx, yo, z1 + e), V(x1 - kx, y + ky, z1 + e), V(x1 - kx, y + ky, z0 - e)], hint: V(1, 0.5, 0) }, { pts: [V(x1 - kx, y + ky, z0 - e), V(x1 - kx, y + ky, z1 + e), V(xm, y + rise, z1 + e), V(xm, y + rise, z0 - e)] },
      ],
      walls: { 0: [{ pts: prof(z0), hint: N.back }], 2: [{ pts: prof(z1), hint: N.front }] },
      top: y + rise,
    };
  },
  mansard(x0, x1, z0, z1, y) {
    const e = OVER * 0.5, ax = x0 - e, bx = x1 + e, az = z0 - e, bz = z1 + e, yo = y - 0.1, h = 1.9, i = Math.min(1.3, (Math.min(bx - ax, bz - az) / 2) * 0.4), yt = yo + h;
    return {
      roof: [
        { pts: [V(ax, yo, az), V(bx, yo, az), V(bx - i, yt, az + i), V(ax + i, yt, az + i)], hint: V(0, 0.4, -1) }, { pts: [V(ax, yo, bz), V(bx, yo, bz), V(bx - i, yt, bz - i), V(ax + i, yt, bz - i)], hint: V(0, 0.4, 1) },
        { pts: [V(ax, yo, az), V(ax, yo, bz), V(ax + i, yt, bz - i), V(ax + i, yt, az + i)], hint: V(-1, 0.4, 0) }, { pts: [V(bx, yo, az), V(bx, yo, bz), V(bx - i, yt, bz - i), V(bx - i, yt, az + i)], hint: V(1, 0.4, 0) },
        { pts: [V(ax + i, yt, az + i), V(bx - i, yt, az + i), V(bx - i, yt, bz - i), V(ax + i, yt, bz - i)] },
      ],
      walls: {}, top: yt,
    };
  },
  shed(x0, x1, z0, z1, y) {
    // one slope, high at the front (over the street), low at the back
    const e = OVER, rise = Math.max(1.3, Math.min(3.2, (z1 - z0) * 0.2)), k = rise / (z1 - z0);
    return {
      roof: [{ pts: [V(x0 - e, y - e * k, z0 - e), V(x1 + e, y - e * k, z0 - e), V(x1 + e, y + rise + e * k, z1 + e), V(x0 - e, y + rise + e * k, z1 + e)] }],
      walls: {
        2: [{ pts: [V(x0, y, z1), V(x1, y, z1), V(x1, y + rise, z1), V(x0, y + rise, z1)], hint: N.front }],
        1: [{ pts: [V(x0, y, z0), V(x0, y, z1), V(x0, y + rise, z1)], hint: N.left }], 3: [{ pts: [V(x1, y, z0), V(x1, y, z1), V(x1, y + rise, z1)], hint: N.right }],
      },
      top: y + rise,
    };
  },
  flat(x0, x1, z0, z1, y) {
    // a flat deck behind a low parapet (the parapet is more wall: it takes each wall's finish)
    const p = 0.55, t = TH;
    const para = (ax, az, bx, bz, n, inward) => [
      { pts: [V(ax, y, az), V(bx, y, bz), V(bx, y + p, bz), V(ax, y + p, az)], hint: n },
      { pts: [V(ax + inward.x * t, y, az + inward.z * t), V(bx + inward.x * t, y, bz + inward.z * t), V(bx + inward.x * t, y + p, bz + inward.z * t), V(ax + inward.x * t, y + p, az + inward.z * t)], hint: inward },
      { pts: [V(ax, y + p, az), V(bx, y + p, bz), V(bx + inward.x * t, y + p, bz + inward.z * t), V(ax + inward.x * t, y + p, az + inward.z * t)] },
    ];
    return {
      roof: [{ pts: [V(x0, y + 0.06, z0), V(x1, y + 0.06, z0), V(x1, y + 0.06, z1), V(x0, y + 0.06, z1)] }],
      walls: { 0: para(x0, z0, x1, z0, N.back, N.front), 2: para(x0, z1, x1, z1, N.front, N.back), 1: para(x0, z0, x0, z1, N.left, N.right), 3: para(x1, z0, x1, z1, N.right, N.left) },
      top: y + p, flat: true,
    };
  },
};

// ---------------------------------------------------------------------------
// roofs: pieces you lay over the house, each a rectangle with its own shape, material and colour
// ---------------------------------------------------------------------------

/**
 * Every piece of roof on a plot (plot tiles). The wall that fills in under a roof (gable ends, a flat
 * roof's parapet) takes the house's outside finish. Each piece is a group tagged userData.roof = its
 * index, so it can be picked.
 */
export function buildRoofs(list = [], finish = { m: 'siding', c: '#f2ead8' }) {
  const g = new THREE.Group();
  const wallMat = extMaterial(finish.m in EXT_WALLS ? finish.m : 'paint', finish.c);
  list.forEach((r, i) => {
    const piece = new THREE.Group();
    const x0 = r.x, x1 = r.x + r.w, z0 = r.y, z1 = r.y + r.d;
    const shape = (ROOFS[r.s] ?? ROOFS.gable)(x0, x1, z0, z1, WALL_H);
    piece.add(mesh(shape.roof, extMaterial(r.m in ROOF_MATS ? r.m : 'shingle', r.c ?? '#b3403a')));
    for (const faces of Object.values(shape.walls)) { const m = mesh(faces, wallMat); m.receiveShadow = false; piece.add(m); }
    if (r.ch) {
      // a brick chimney, standing through the roof towards one end
      const cx = x1 - Math.max(1.4, (x1 - x0) * 0.22), cz = z0 + (z1 - z0) * 0.3, top = shape.top + 0.9;
      piece.add(boxAt(1.1, top - WALL_H, 1.1, cx, (top + WALL_H) / 2, cz, extMaterial('brick', '#a5503c')), boxAt(1.3, 0.16, 1.3, cx, top + 0.08, cz, toon('#d8d2c8')), boxAt(0.6, 0.28, 0.6, cx, top + 0.3, cz, toon('#3a3d46')));
    }
    piece.traverse((o) => { o.userData.roof = i; });
    g.add(piece);
  });
  return g;
}

// ---------------------------------------------------------------------------
// paths and driveways (plot tiles), and things for the yard
// ---------------------------------------------------------------------------

/** Paths, driveways and patios: flat pieces lying on the lawn, later ones over earlier ones. */
export function buildGround(list = []) {
  const g = new THREE.Group();
  list.forEach((p, i) => {
    const y = 0.016 + i * 0.0012;
    const m = mesh([{ pts: [V(p.x, y, p.y), V(p.x + p.w, y, p.y), V(p.x + p.w, y, p.y + p.d), V(p.x, y, p.y + p.d)] }], extMaterial(p.m in GROUND_MATS ? p.m : 'concrete', p.c ?? GROUND_MATS[p.m]?.c ?? '#c9c9c9'));
    m.castShadow = false;
    m.userData.ground = i;
    g.add(m);
  });
  return g;
}

const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const put = (g, geo, mat, x, y, z, s = null, r = null) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); m.castShadow = true; g.add(m); return m; };
const ball = (r) => new THREE.IcosahedronGeometry(r, 1);
const YARD = {
  tree_oak(g) { put(g, cyl(0.16, 0.24, 1.6), toon('#7a4a28'), 0, 0.8, 0); put(g, ball(1.15), toon('#4f9a4a'), 0, 2.3, 0); put(g, ball(0.8), toon('#5fae55'), 0.6, 2.0, 0.3); put(g, ball(0.75), toon('#3f8a4a'), -0.55, 2.1, -0.3); },
  tree_pine(g) { put(g, cyl(0.12, 0.18, 0.9), toon('#6b4226'), 0, 0.45, 0); for (let i = 0; i < 3; i++) put(g, new THREE.ConeGeometry(1.0 - i * 0.24, 1.3, 9), toon(i % 2 ? '#2f7a4a' : '#256b40'), 0, 1.3 + i * 0.75, 0); },
  tree_blossom(g) { put(g, cyl(0.13, 0.2, 1.4), toon('#6b4a3a'), 0, 0.7, 0); put(g, ball(1.0), toon('#ffb3d0'), 0, 2.0, 0); put(g, ball(0.7), toon('#ff9fc7'), 0.5, 1.8, 0.35); put(g, ball(0.65), toon('#ffd1e3'), -0.5, 1.9, -0.25); },
  bush(g) { put(g, ball(0.5), toon('#4f9a45'), 0, 0.36, 0, [1, 0.8, 1]); put(g, ball(0.34), toon('#5fae55'), 0.3, 0.3, 0.15); },
  hedge(g) { put(g, new THREE.BoxGeometry(1, 0.9, 0.5), toon('#3f8a4a'), 0, 0.45, 0); put(g, new THREE.BoxGeometry(0.96, 0.1, 0.46), toon('#57b35a'), 0, 0.94, 0); },
  flowers(g) { put(g, new THREE.BoxGeometry(0.95, 0.12, 0.6), toon('#6b4a2e'), 0, 0.06, 0); ['#ff8fc7', '#ffd84d', '#ffffff', '#b77bff', '#ff5d73', '#ffd84d'].forEach((c, i) => { const x = -0.34 + (i % 3) * 0.34, z = i < 3 ? -0.14 : 0.14; put(g, cyl(0.015, 0.015, 0.22, 5), toon('#3f8a4a'), x, 0.22, z); put(g, new THREE.SphereGeometry(0.09, 8, 6), toon(c), x, 0.36, z); }); },
  fence_picket(g) { const m = toon('#ffffff'); for (let i = 0; i < 5; i++) put(g, new THREE.BoxGeometry(0.1, 0.8, 0.05), m, -0.4 + i * 0.2, 0.4, 0); for (const y of [0.25, 0.6]) put(g, new THREE.BoxGeometry(1, 0.06, 0.04), m, 0, y, -0.03); },
  fence_wood(g) { const m = toon('#9c6b43'); for (let i = 0; i < 6; i++) put(g, new THREE.BoxGeometry(0.165, 1.3, 0.05), i % 2 ? m : toon('#8a5a32'), -0.417 + i * 0.167, 0.65, 0); put(g, new THREE.BoxGeometry(1, 0.08, 0.07), toon('#6b4226'), 0, 1.3, 0); },
  fence_iron(g) { const m = toon('#23252d'); for (let i = 0; i < 6; i++) { put(g, cyl(0.02, 0.02, 1.05, 6), m, -0.417 + i * 0.167, 0.52, 0); put(g, new THREE.ConeGeometry(0.035, 0.1, 6), m, -0.417 + i * 0.167, 1.1, 0); } for (const y of [0.15, 0.9]) put(g, new THREE.BoxGeometry(1, 0.04, 0.04), m, 0, y, 0); },
  gate(g) { const m = toon('#ffffff'); for (const x of [-0.46, 0.46]) put(g, new THREE.BoxGeometry(0.12, 1.1, 0.12), m, x, 0.55, 0); for (let i = 0; i < 4; i++) put(g, new THREE.BoxGeometry(0.1, 0.7 + Math.sin((i + 0.5) / 4 * Math.PI) * 0.18, 0.04), m, -0.27 + i * 0.18, 0.4, 0.3, null, [0, 0.9, 0]); },
  column(g) { const m = toon('#f4f1ea'); put(g, new THREE.BoxGeometry(0.5, 0.16, 0.5), m, 0, 0.08, 0); put(g, cyl(0.16, 0.19, WALL_H - 0.32, 14), m, 0, WALL_H / 2, 0); put(g, new THREE.BoxGeometry(0.5, 0.16, 0.5), m, 0, WALL_H - 0.08, 0); },
  lamp_post(g) { const m = toon('#2a2d36'); put(g, cyl(0.045, 0.07, 1.9, 8), m, 0, 0.95, 0); put(g, new THREE.BoxGeometry(0.3, 0.06, 0.3), m, 0, 2.2, 0); put(g, new THREE.BoxGeometry(0.22, 0.28, 0.22), toon('#fff3b8', { emissive: '#ffd27a', emissiveIntensity: 0.9 }), 0, 2.04, 0); },
  mailbox(g) { put(g, new THREE.BoxGeometry(0.1, 1, 0.1), toon('#7a4a28'), 0, 0.5, 0); put(g, new THREE.BoxGeometry(0.32, 0.26, 0.5), toon('#3b6fd8'), 0, 1.12, 0); put(g, new THREE.BoxGeometry(0.03, 0.2, 0.1), toon('#ff5d73'), 0.18, 1.2, 0.12); },
  bench(g) { const w = toon('#9c6b43'), m = toon('#2a2d36'); put(g, new THREE.BoxGeometry(1.5, 0.08, 0.5), w, 0, 0.5, 0); put(g, new THREE.BoxGeometry(1.5, 0.5, 0.07), w, 0, 0.85, -0.24, null, [-0.15, 0, 0]); for (const x of [-0.65, 0.65]) put(g, new THREE.BoxGeometry(0.07, 0.5, 0.46), m, x, 0.25, 0); },
  rock(g) { put(g, new THREE.DodecahedronGeometry(0.5, 0), toon('#9a968e'), 0, 0.28, 0, [1.2, 0.75, 1]); put(g, new THREE.DodecahedronGeometry(0.24, 0), toon('#b0aca4'), 0.5, 0.14, 0.25); },
  birdbath(g) { const m = toon('#c9c3b8'); put(g, cyl(0.2, 0.26, 0.1, 12), m, 0, 0.05, 0); put(g, cyl(0.08, 0.1, 0.7, 10), m, 0, 0.45, 0); put(g, cyl(0.42, 0.2, 0.14, 16), m, 0, 0.85, 0); put(g, cyl(0.36, 0.36, 0.02, 16), toon('#7fc8ff'), 0, 0.92, 0); },
  gnome(g) { put(g, cyl(0.1, 0.14, 0.26, 10), toon('#3b6fd8'), 0, 0.13, 0); put(g, new THREE.SphereGeometry(0.1, 10, 8), toon('#ffd9b3'), 0, 0.33, 0); put(g, new THREE.SphereGeometry(0.09, 10, 8), toon('#ffffff'), 0, 0.27, 0.06, [1, 1.1, 0.7]); put(g, new THREE.ConeGeometry(0.11, 0.3, 10), toon('#e0463c'), 0, 0.55, 0); },
  planter(g) { put(g, new THREE.BoxGeometry(0.9, 0.42, 0.42), toon('#7a4a28'), 0, 0.21, 0); for (let i = 0; i < 3; i++) put(g, ball(0.2), toon(i % 2 ? '#5fae55' : '#4f9a45'), -0.28 + i * 0.28, 0.5, 0); for (const [x, c] of [[-0.14, '#ff8fc7'], [0.14, '#ffd84d']]) put(g, new THREE.SphereGeometry(0.07, 8, 6), toon(c), x, 0.66, 0.08); },
};
/** One yard decoration, standing on its own spot (tiles). */
export function buildYardItem(id) {
  const g = new THREE.Group();
  (YARD[id] ?? YARD.bush)(g);
  return g;
}
/** Everything in a yard (plot tiles). */
export function buildYard(list = []) {
  const g = new THREE.Group();
  list.forEach((it, i) => {
    const m = buildYardItem(it.id);
    m.position.set(it.x, 0, it.y);
    m.rotation.y = (it.r ?? 0) * Math.PI / 2;
    m.userData.yard = i;
    g.add(m);
  });
  return g;
}
