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
  return { wall: { m: 'siding', c: '#f2ead8' }, roofs: [], ground: [], yard: [] };
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
  // Japanese: white plaster between dark timber posts, a beam across it and a dark skirting board
  wafu(c, rnd) {
    fill(c, 242); speckle(c, rnd, 900, 220, 255, 2, 0.35);
    c.fillStyle = '#3a2618';
    for (const x of [0, 128]) c.fillRect(x, 0, 16, S);
    c.fillRect(0, 40, S, 12);
    c.fillRect(0, 226, S, 30);
    c.fillStyle = 'rgba(255,255,255,.12)'; for (const x of [3, 131]) c.fillRect(x, 0, 2, S);
  },
  // ---- roofs
  // Japanese kawara: rows of rounded clay tiles running down the slope, a shadow under each course
  kawara(c) {
    fill(c, 110);
    for (let x = 0; x < S; x += 32) {
      const g = c.createLinearGradient(x, 0, x + 32, 0);
      g.addColorStop(0, grey(120)); g.addColorStop(0.45, grey(245)); g.addColorStop(0.75, grey(200)); g.addColorStop(1, grey(110));
      c.fillStyle = g; c.fillRect(x + 2, 0, 28, S);
    }
    for (let y = 0; y < S; y += 64) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, y + 56, S, 8); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, y, S, 3); }
  },
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
  // stepping stones: separate slabs with the lawn showing between them (the rest of the picture is clear)
  // pond water: soft ripples and glints (it drifts slowly: see the water in buildGround)
  water(c, rnd) {
    fill(c, 205);
    for (let i = 0; i < 70; i++) {
      c.strokeStyle = `rgba(255,255,255,${0.15 + rnd() * 0.25})`; c.lineWidth = 1 + rnd() * 2;
      const x = rnd() * S, y = rnd() * S, w = 14 + rnd() * 40;
      for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) { c.beginPath(); c.ellipse(x + dx, y + dy, w, w * 0.22, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    }
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(0,30,60,.12)'; c.beginPath(); c.ellipse(rnd() * S, rnd() * S, 20 + rnd() * 30, 6 + rnd() * 8, 0, 0, Math.PI * 2); c.fill(); }
  },
  stepping(c, rnd) {
    c.clearRect(0, 0, S, S);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) {
      c.fillStyle = grey(205 + Math.floor(rnd() * 40));
      c.save(); c.translate(k * 128 + 64 + (rnd() - 0.5) * 10, r * 128 + 64 + (rnd() - 0.5) * 10); c.rotate((rnd() - 0.5) * 0.16);
      c.beginPath(); c.roundRect(-50, -44, 100, 88, 16); c.fill();
      c.fillStyle = 'rgba(0,0,0,.1)'; for (let i = 0; i < 26; i++) c.fillRect(-46 + rnd() * 92, -40 + rnd() * 80, 2 + rnd() * 3, 1.5);
      c.restore();
    }
  },
  dirt(c, rnd) { fill(c, 225); for (let i = 0; i < 700; i++) { c.fillStyle = grey(165 + Math.floor(rnd() * 90)); c.beginPath(); c.ellipse(rnd() * S, rnd() * S, 2 + rnd() * 7, 1.5 + rnd() * 4, rnd() * 3, 0, 7); c.fill(); } speckle(c, rnd, 900, 150, 250, 2, 0.4); },
  mulch(c, rnd) { fill(c, 190); for (let i = 0; i < 1100; i++) { c.fillStyle = grey(120 + Math.floor(rnd() * 130)); c.save(); c.translate(rnd() * S, rnd() * S); c.rotate(rnd() * 3); c.fillRect(-4, -1, 8, 2.4); c.restore(); } },
};

// ---- finishes in two colours: a main one (plaster, paper, boards) and a second for the wood (posts, beams,
// lattices, battens). Drawn in their real colours rather than tinted, so each can be picked on its own.
const shade = (hex, k) => { const col = new THREE.Color(hex); if (k < 1) col.multiplyScalar(k); else col.lerp(new THREE.Color('#ffffff'), k - 1); return `#${col.getHexString()}`; };
/** Vertical boards in solid wood, only thin dark joints between them (no streaks or shine). */
function boards(c, col, x0, y0, w, h, width = 22) {
  c.fillStyle = col; c.fillRect(x0, y0, w, h);
  c.fillStyle = shade(col, 0.68);
  for (let x = x0; x < x0 + w; x += width) c.fillRect(x, y0, 2, h);
}
/** Framed wooden panels in a row (a door's kick panels): solid wood, each panel a shade darker, set in its frame. */
function panels(c, col, x0, y0, w, h, n) {
  c.fillStyle = col; c.fillRect(x0, y0, w, h);
  const pw = w / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * pw + 6, y = y0 + 8, iw = pw - 12, ih = h - 16;
    c.fillStyle = shade(col, 0.86); c.fillRect(x, y, iw, ih);
    c.fillStyle = shade(col, 0.62); c.fillRect(x, y, iw, 2); c.fillRect(x, y, 2, ih);
  }
}
/** Upright posts every half repeat, each straddling its line (so a wall cut at a repeat ends in half a post
 *  at each end, and two walls meeting make one whole post at the join). */
function posts(c, col, w) { c.fillStyle = col; for (const x of [0, 128, 256]) c.fillRect(x - w / 2, 0, w, S); }
export const TWO_TONE = {
  wafu(c, rnd, main, wood) {
    // plaster between timber posts, a beam across it and a skirting board, all in plain flat colour
    c.fillStyle = main; c.fillRect(0, 0, S, S);
    posts(c, wood, 16); c.fillStyle = wood; c.fillRect(0, 40, S, 12); c.fillRect(0, 226, S, 30);
  },
  tudor(c, rnd, main, wood) {
    c.fillStyle = main; c.fillRect(0, 0, S, S);
    posts(c, wood, 14); c.fillStyle = wood; for (const y of [0, 128]) c.fillRect(0, y, S, 14);
    c.lineWidth = 12; c.strokeStyle = wood; c.beginPath(); c.moveTo(14, 128); c.lineTo(128, 14); c.moveTo(142, 14); c.lineTo(256, 128); c.stroke();
  },
  shoji_wall(c, rnd, main, wood) {
    // the sliding screens: plain paper panes in a wooden lattice, solid wooden kick panels along the bottom
    // and a stout frame round each screen
    c.fillStyle = main; c.fillRect(0, 0, S, S);
    c.fillStyle = wood;
    for (let x = 0; x < S; x += 32) c.fillRect(x, 0, 4, 186);
    for (let y = 0; y < 186; y += 46) c.fillRect(0, y, S, 4);
    panels(c, wood, 0, 186, 128, 70, 3); panels(c, wood, 128, 186, 128, 70, 3);
    c.fillStyle = wood; c.fillRect(0, 182, S, 8);
    posts(c, wood, 10);
  },
  koshiita(c, rnd, main, wood) {
    // plaster above, a wainscot of solid wooden boards below, a beam between, posts at the panels' edges
    c.fillStyle = main; c.fillRect(0, 0, S, 150);
    boards(c, wood, 0, 160, S, 96, 20);
    c.fillStyle = shade(wood, 0.8); c.fillRect(0, 148, S, 14);
    posts(c, wood, 14);
  },
  yakisugi(c, rnd, main, wood) {
    // charred cedar: wide black-brown planks, scorched a little darker here and there, battens over the joins
    for (let x = 0; x < S; x += 32) {
      c.fillStyle = shade(main, 0.88 + rnd() * 0.12); c.fillRect(x, 0, 32, S);
      c.fillStyle = shade(main, 0.65); for (let y = rnd() * 12; y < S; y += 10 + rnd() * 12) c.fillRect(x + 2 + rnd() * 6, y, 10 + rnd() * 16, 1.5);
    }
    c.fillStyle = wood; for (let x = 0; x < S; x += 32) c.fillRect(x - 3, 0, 6, S);
  },
  itabari(c, rnd, main, wood) {
    // cedar boards running up and down, a batten over every other join
    boards(c, main, 0, 0, S, S, 32);
    c.fillStyle = wood; for (let x = 0; x < S; x += 64) c.fillRect(x - 4, 0, 8, S);
  },
  namako(c, rnd, main, wood) {
    // namako: dark square tiles set on the diagonal, joined by raised rounded lines of white plaster
    c.fillStyle = main; c.fillRect(0, 0, S, S);
    c.save(); c.lineCap = 'round';
    for (const [w, col] of [[14, shade(wood, 0.8)], [9, wood]]) {
      c.lineWidth = w; c.strokeStyle = col; c.beginPath();
      for (let k = -S; k <= S * 2; k += 64) { c.moveTo(k, 0); c.lineTo(k + S, S); c.moveTo(k, S); c.lineTo(k + S, 0); }
      c.stroke();
    }
    c.restore();
  },
};
const toneCache = new Map();
/** A two-colour finish as a repeating texture. */
export function toneTexture(id, main, wood) {
  const key = `${id}|${main}|${wood}`;
  if (!toneCache.has(key)) {
    const seed = [...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) | 0;
    const tex = canvasTexture(S, S, (c) => TWO_TONE[id](c, prng(seed), main, wood));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    toneCache.set(key, tex);
  }
  return toneCache.get(key);
}
/** Finishes drawn as one wall's height (a skirting board at the bottom, a beam near the top), not a repeat. */
export const TALL_FINISH = new Set(['wafu', 'shoji_wall', 'koshiita']);
/** The wood colour of a two-colour finish (yours, or its own). */
export const woodOf = (id, a) => (TWO_TONE[id] ? a || EXT_WALLS[id]?.a || '#3a2618' : null);

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
export function extMaterial(id, color, accent = null) {
  const wood = woodOf(id, accent), key = `${id}|${color}|${wood}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshToonMaterial({ map: wood ? toneTexture(id, color, wood) : extTexture(id), color: wood ? '#ffffff' : color, side: THREE.DoubleSide, gradientMap: toon('#ffffff').gradientMap, alphaTest: id === 'stepping' ? 0.5 : 0 }));
  return matCache.get(key);
}
const swatches = new Map();
/** A little picture of a finish in a colour, for the build menu. */
export function extSwatch(id, color, accent = null) {
  const wood = woodOf(id, accent), key = `${id}|${color}|${wood}`;
  if (!swatches.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const c = cv.getContext('2d');
    if (wood) c.drawImage(toneTexture(id, color, wood).image, 0, 0, S, S, 0, 0, 96, 96);
    else {
      c.drawImage(extTexture(id).image, 0, 0, S, S, 0, 0, 96, 96);
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = color; c.fillRect(0, 0, 96, 96);
    }
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
  saltbox(x0, x1, z0, z1, y) {
    // a gable with its ridge towards the back: a short steep slope behind, a long one down the front
    const zr = z0 + (z1 - z0) * 0.32, rise = Math.max(1.6, Math.min(4.6, (z1 - z0) * 0.3)), e = OVER;
    const kb = rise / (zr - z0), kf = rise / (z1 - zr);
    return {
      roof: [{ pts: [V(x0 - e, y - e * kb, z0 - e), V(x1 + e, y - e * kb, z0 - e), V(x1 + e, y + rise, zr), V(x0 - e, y + rise, zr)] }, { pts: [V(x0 - e, y - e * kf, z1 + e), V(x1 + e, y - e * kf, z1 + e), V(x1 + e, y + rise, zr), V(x0 - e, y + rise, zr)] }],
      walls: { 1: [{ pts: [V(x0, y, z0), V(x0, y, z1), V(x0, y + rise, zr)], hint: N.left }], 3: [{ pts: [V(x1, y, z0), V(x1, y, z1), V(x1, y + rise, zr)], hint: N.right }] },
      top: y + rise,
    };
  },
  butterfly(x0, x1, z0, z1, y) {
    // two slopes running down to a valley along the middle (a modern look)
    const xm = (x0 + x1) / 2, rise = Math.max(1.2, Math.min(3, (x1 - x0) * 0.16)), e = OVER, yv = y + 0.18, k = (rise - 0.18) / (xm - x0);
    return {
      roof: [{ pts: [V(x0 - e, y + rise + e * k, z0 - e), V(x0 - e, y + rise + e * k, z1 + e), V(xm, yv, z1 + e), V(xm, yv, z0 - e)] }, { pts: [V(x1 + e, y + rise + e * k, z0 - e), V(x1 + e, y + rise + e * k, z1 + e), V(xm, yv, z1 + e), V(xm, yv, z0 - e)] }],
      walls: {
        0: [{ pts: [V(x0, y, z0), V(xm, y, z0), V(xm, yv, z0), V(x0, y + rise, z0)], hint: N.back }, { pts: [V(xm, y, z0), V(x1, y, z0), V(x1, y + rise, z0), V(xm, yv, z0)], hint: N.back }],
        2: [{ pts: [V(x0, y, z1), V(xm, y, z1), V(xm, yv, z1), V(x0, y + rise, z1)], hint: N.front }, { pts: [V(xm, y, z1), V(x1, y, z1), V(x1, y + rise, z1), V(xm, yv, z1)], hint: N.front }],
        1: [{ pts: [V(x0, y, z0), V(x0, y, z1), V(x0, y + rise, z1), V(x0, y + rise, z0)], hint: N.left }], 3: [{ pts: [V(x1, y, z0), V(x1, y, z1), V(x1, y + rise, z1), V(x1, y + rise, z0)], hint: N.right }],
      },
      top: y + rise,
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
// roofs that overlap merge: each piece is cut off where it runs inside another (its surface and the gable
// walls under it), so two pieces meet in a clean valley or hip instead of poking through each other
// ---------------------------------------------------------------------------

/** A piece of roof as a solid: below every face of its surface, inside its footprint, above its eaves.
 *  Planes face outwards ({ n, d }: a point p is outside when n·p > d). */
function roofSolid(piece) {
  const planes = [], box = new THREE.Box3();
  piece.traverse((o) => {
    if (!o.userData.roofSurface) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index, m = o.matrixWorld;
    const tri = (i, j, k) => {
      const A = V().fromBufferAttribute(pos, i).applyMatrix4(m), B = V().fromBufferAttribute(pos, j).applyMatrix4(m), C = V().fromBufferAttribute(pos, k).applyMatrix4(m);
      box.expandByPoint(A).expandByPoint(B).expandByPoint(C);
      const n = V().subVectors(B, A).cross(V().subVectors(C, A));
      if (n.lengthSq() < 1e-10) return;
      n.normalize();
      if (n.y < 0) n.negate();
      if (n.y < 0.05) return; // (a vertical bit, a parapet: not part of the slope)
      const d = n.dot(A);
      if (!planes.some((q) => q.n.distanceTo(n) < 1e-3 && Math.abs(q.d - d) < 1e-3)) planes.push({ n, d });
    };
    for (let t = 0; t < (idx ? idx.count : pos.count); t += 3) idx ? tri(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)) : tri(t, t + 1, t + 2);
  });
  if (!planes.length) return null;
  planes.push({ n: V(-1, 0, 0), d: -box.min.x }, { n: V(1, 0, 0), d: box.max.x }, { n: V(0, 0, -1), d: -box.min.z }, { n: V(0, 0, 1), d: box.max.z }, { n: V(0, -1, 0), d: -box.min.y });
  return { planes, box };
}
/** Split a polygon (points with uvs) by a plane: [the part outside, the part inside]. */
function splitPoly(poly, { n, d }) {
  const out = [], ins = [], EPS = 1e-4;
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length], dp = n.dot(P.p) - d, dq = n.dot(Q.p) - d;
    if (dp >= -EPS) out.push(P);
    if (dp <= EPS) ins.push(P);
    if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
      const t = dp / (dp - dq), X = { p: P.p.clone().lerp(Q.p, t), uv: P.uv.clone().lerp(Q.uv, t) };
      out.push(X); ins.push(X);
    }
  }
  return [out.length >= 3 ? out : null, ins.length >= 3 ? ins : null];
}
/** What's left of a polygon once a solid's been taken out of it (a few convex pieces). */
function subtractSolid(poly, solid) {
  const kept = [];
  let cur = poly;
  for (const pl of solid.planes) {
    const [o, i] = splitPoly(cur, pl);
    if (o) kept.push(o);
    if (!i) return kept;
    cur = i;
  }
  return kept; // (what's still in hand is inside the solid: it goes)
}
/** Cut one mesh down to what's outside the given solids. */
function cutMesh(o, solids) {
  const g0 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, pos = g0.attributes.position, uv = g0.attributes.uv;
  const m = o.matrixWorld, inv = m.clone().invert(), outPos = [], outUv = [];
  let changed = false;
  for (let t = 0; t < pos.count; t += 3) {
    let polys = [[0, 1, 2].map((k) => ({ p: V().fromBufferAttribute(pos, t + k).applyMatrix4(m), uv: new THREE.Vector2().fromBufferAttribute(uv, t + k) }))];
    const tb = new THREE.Box3().setFromPoints(polys[0].map((q) => q.p));
    for (const sol of solids) {
      if (!sol.box.intersectsBox(tb)) continue;
      const next = polys.flatMap((pl) => subtractSolid(pl, sol));
      if (next.length !== 1 || next[0].length !== polys[0]?.length) changed = true;
      polys = next;
      if (!polys.length) break;
    }
    for (const pl of polys) for (let k = 1; k < pl.length - 1; k++) for (const q of [pl[0], pl[k], pl[k + 1]]) { const lp = q.p.clone().applyMatrix4(inv); outPos.push(lp.x, lp.y, lp.z); outUv.push(q.uv.x, q.uv.y); }
  }
  if (!changed) return;
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  ng.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
  ng.computeVertexNormals();
  o.geometry = ng;
}
function mergeRoofs(g) {
  g.updateMatrixWorld(true);
  const pieces = g.children, solids = pieces.map(roofSolid);
  pieces.forEach((piece, i) => {
    const others = solids.filter((sol, j) => j !== i && sol && solids[i] && sol.box.intersectsBox(solids[i].box));
    if (!others.length) return;
    piece.traverse((o) => { if (o.isMesh && (o.userData.roofSurface || o.userData.roofWall)) cutMesh(o, others); });
  });
}

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
  const wallMat = extMaterial(finish.m in EXT_WALLS ? finish.m : 'paint', finish.c, finish.a);
  list.forEach((r, i) => {
    // a piece is built round its own middle, so it can be turned (r.r quarter turns: which way a shed
    // roof slopes, which way a gable's ridge runs…) and made flatter or steeper (r.p)
    const piece = new THREE.Group(), turn = (r.r ?? 0) % 4, pitch = r.p ?? 1;
    const hw = (turn % 2 ? r.d : r.w) / 2, hd = (turn % 2 ? r.w : r.d) / 2, x0 = -hw, x1 = hw, z0 = -hd, z1 = hd;
    piece.position.set(r.x + r.w / 2, (r.lv ?? 0) * WALL_H + (r.e ?? 0), r.y + r.d / 2); // (e: on top of walls that stand that high)
    piece.rotation.y = turn * Math.PI / 2;
    const shape = (ROOFS[r.s] ?? ROOFS.gable)(x0, x1, z0, z1, WALL_H);
    const body = new THREE.Group();
    body.scale.y = pitch;
    body.position.y = WALL_H * (1 - pitch);
    piece.add(body);
    const surface = mesh(shape.roof, extMaterial(r.m in ROOF_MATS ? r.m : 'shingle', r.c ?? '#b3403a'));
    surface.userData.roofSurface = true;
    body.add(surface);
    // the wall under the roof (gable ends…): the house's outside finish, or one of its own (gw)
    const gw = r.gw && r.gw.m in EXT_WALLS ? extMaterial(r.gw.m, r.gw.c, r.gw.a) : wallMat;
    for (const faces of Object.values(shape.walls)) { const m = mesh(faces, gw); m.receiveShadow = false; m.userData.roofWall = true; body.add(m); }
    if (r.ch) {
      // a brick chimney, standing through the roof towards one end
      const cx = x1 - Math.max(1.4, (x1 - x0) * 0.22), cz = z0 + (z1 - z0) * 0.3, top = WALL_H + (shape.top - WALL_H) * pitch + 0.9;
      piece.add(boxAt(1.1, top - WALL_H, 1.1, cx, (top + WALL_H) / 2, cz, extMaterial('brick', '#a5503c')), boxAt(1.3, 0.16, 1.3, cx, top + 0.08, cz, toon('#d8d2c8')), boxAt(0.6, 0.28, 0.6, cx, top + 0.3, cz, toon('#3a3d46')));
    }
    piece.traverse((o) => { o.userData.roof = i; });
    g.add(piece);
  });
  if (list.length > 1) mergeRoofs(g);
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
    if (p.m === 'water') ripple(m); // (the water moves)
    g.add(m);
  });
  return g;
}

// ---- water: one rippling texture for every pond, drifting slowly so the water looks alive ----
const waterMats = new Map();
function waterMat(color = '#3f8fb8', opacity = 0.82) {
  const key = `${color}|${opacity}`;
  if (!waterMats.has(key)) waterMats.set(key, new THREE.MeshToonMaterial({ map: extTexture('water'), color, transparent: true, opacity, depthWrite: false, gradientMap: toon('#ffffff').gradientMap }));
  return waterMats.get(key);
}
/** Keep a water surface's ripples drifting (every pond shares the texture, so they all move together). */
function ripple(m) {
  m.onBeforeRender = () => { const t = performance.now() / 1000; m.material.map.offset.set((t * 0.018) % 1, (t * 0.011) % 1); };
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
  fence_farm(g) { const m = toon('#5a3d28'); for (const x of [-0.5, 0.5]) put(g, new THREE.BoxGeometry(0.12, 0.95, 0.12), m, x, 0.47, 0); for (const y of [0.3, 0.55, 0.8]) put(g, new THREE.BoxGeometry(1, 0.08, 0.05), m, 0, y, 0, null, [0, 0, (y - 0.55) * 0.04]); },
  fence_stone(g) { const cols = ['#9a968e', '#aaa59c', '#8a867e']; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) put(g, new THREE.BoxGeometry(0.27, 0.27, 0.36 - j * 0.04), toon(cols[(i + j) % 3]), -0.375 + i * 0.25 + (j ? 0.06 : 0), 0.14 + j * 0.27, 0, null, [0, (i % 2 ? 0.08 : -0.06), 0]); put(g, new THREE.BoxGeometry(1.02, 0.07, 0.42), toon('#b8b3a8'), 0, 0.58, 0); },
  grass_tuft(g) { for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, lean = 0.25 + (i % 3) * 0.14; put(g, new THREE.ConeGeometry(0.045, 0.75 + (i % 4) * 0.14, 4), toon(i % 2 ? '#4f9a45' : '#6cbf5f'), Math.cos(a) * 0.12, 0.36, Math.sin(a) * 0.12, null, [Math.sin(a) * lean, 0, -Math.cos(a) * lean]); } },
  fern(g) { for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; put(g, new THREE.SphereGeometry(0.3, 6, 4), toon(i % 2 ? '#3f8a4a' : '#4f9a45'), Math.cos(a) * 0.26, 0.2, Math.sin(a) * 0.26, [1.5, 0.18, 0.5], [0, -a, 0.45]); } },
  wildflowers(g) { const cols = ['#ff8fc7', '#ffd84d', '#ffffff', '#b77bff', '#ff7a59', '#7fc8ff']; for (let i = 0; i < 11; i++) { const x = Math.sin(i * 2.4) * 0.38, z = Math.cos(i * 1.7) * 0.38, h = 0.22 + (i % 4) * 0.07; put(g, cyl(0.012, 0.012, h, 4), toon('#3f8a4a'), x, h / 2, z); put(g, new THREE.SphereGeometry(0.06, 6, 5), toon(cols[i % cols.length]), x, h + 0.03, z); } },
  pebbles(g) { for (let i = 0; i < 8; i++) put(g, new THREE.DodecahedronGeometry(0.07 + (i % 3) * 0.04, 0), toon(['#9a968e', '#b0aca4', '#c4c0b6'][i % 3]), Math.sin(i * 2.1) * 0.36, 0.04, Math.cos(i * 1.3) * 0.36, [1.2, 0.6, 1]); },
  log(g) { const bark = toon('#6b4a32'); put(g, cyl(0.2, 0.22, 1.4, 9), bark, 0, 0.21, 0, null, [0, 0, Math.PI / 2]); for (const s of [-1, 1]) put(g, cyl(0.17, 0.17, 0.02, 9), toon('#d9b98a'), s * 0.71, 0.21, 0, null, [0, 0, Math.PI / 2]); put(g, cyl(0.06, 0.08, 0.3, 6), bark, 0.2, 0.42, 0.05, null, [0.5, 0, 0.3]); },
  stump(g) { put(g, cyl(0.3, 0.36, 0.36, 10), toon('#6b4a32'), 0, 0.18, 0); put(g, cyl(0.28, 0.28, 0.02, 10), toon('#d9b98a'), 0, 0.37, 0); },
  // ---- a Japanese garden ----
  stone_lantern(g) {
    // a tōrō: a stone post with a little firebox lit up inside it, under a wide six-sided cap
    const s = toon('#a19d94'), d = toon('#8c887f'), glow = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
    put(g, cyl(0.32, 0.36, 0.12, 6), d, 0, 0.06, 0);
    put(g, cyl(0.1, 0.13, 0.55, 8), s, 0, 0.395, 0);
    put(g, cyl(0.26, 0.2, 0.1, 6), d, 0, 0.72, 0);
    put(g, new THREE.BoxGeometry(0.3, 0.26, 0.3), s, 0, 0.9, 0);
    put(g, new THREE.BoxGeometry(0.16, 0.14, 0.32), glow, 0, 0.9, 0);
    put(g, new THREE.BoxGeometry(0.32, 0.14, 0.16), glow, 0, 0.9, 0);
    put(g, new THREE.ConeGeometry(0.44, 0.24, 6), d, 0, 1.15, 0);
    put(g, ball(0.07), s, 0, 1.3, 0);
  },
  pine_japanese(g) {
    // a garden pine: a trunk that leans and twists, and flat clouds of needles at the ends of its branches
    const bark = toon('#5a4232'), needles = [toon('#2f6b3a'), toon('#3a7d43'), toon('#2a5e35')], up = new THREE.Vector3(0, 1, 0);
    const limb = (a, b, r0, r1) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A);
      const m = put(g, cyl(r1, r0, dir.length(), 7), bark, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
      m.quaternion.setFromUnitVectors(up, dir.normalize());
    };
    const trunk = [[0, 0, 0], [0.28, 0.8, 0.05], [-0.12, 1.6, 0], [0.22, 2.3, -0.05], [0.05, 2.85, 0]];
    for (let i = 0; i < trunk.length - 1; i++) limb(trunk[i], trunk[i + 1], 0.2 - i * 0.035, 0.2 - (i + 1) * 0.035);
    limb(trunk[2], [-1.0, 1.75, 0.2], 0.08, 0.04);
    limb(trunk[3], [0.95, 2.45, -0.1], 0.07, 0.035);
    limb(trunk[1], [0.75, 1.25, 0.35], 0.06, 0.03);
    [[-1.05, 1.85, 0.2, 1.25], [0.98, 2.55, -0.1, 1.05], [0.05, 3.0, 0, 1.0], [0.78, 1.35, 0.35, 0.7], [-0.35, 2.4, -0.2, 0.75]].forEach(([x, y, z, s], i) => {
      put(g, ball(0.55 * s), needles[i % 3], x, y, z, [1.3, 0.42, 1.05]);
      put(g, ball(0.38 * s), needles[(i + 1) % 3], x + 0.12 * s, y + 0.1, z - 0.1 * s, [1.2, 0.4, 1]);
    });
  },
  fence_japanese(g) {
    // a white plaster garden wall on a stone footing, with a little tiled roof along its top
    const plaster = toon('#f1ece0'), tiles = toon('#5d6670'), stone = toon('#8c887f');
    put(g, new THREE.BoxGeometry(1.0, 0.3, 0.34), stone, 0, 0.15, 0);
    put(g, new THREE.BoxGeometry(1.0, 1.25, 0.28), plaster, 0, 0.92, 0);
    for (const s of [-1, 1]) put(g, new THREE.BoxGeometry(1.02, 0.05, 0.3), tiles, 0, 1.6, s * 0.12, null, [s * 0.45, 0, 0]);
    put(g, new THREE.BoxGeometry(1.04, 0.08, 0.08), toon('#4a525b'), 0, 1.68, 0);
  },
  bridge_red(g) {
    // a little arched bridge in red lacquer, with gold caps on its posts
    const red = toon('#c0392b'), wood = toon('#8a5a32'), gold = toon('#e0b23c'), L = 2.6, n = 13;
    const yAt = (x) => 0.1 + 0.32 * Math.cos((Math.PI * x) / L), slope = (x) => -0.32 * (Math.PI / L) * Math.sin((Math.PI * x) / L);
    for (let i = 0; i < n; i++) { const x = -L / 2 + ((i + 0.5) * L) / n; put(g, new THREE.BoxGeometry(L / n + 0.01, 0.06, 0.9), wood, x, yAt(x), 0, null, [0, 0, Math.atan(slope(x))]); }
    for (const z of [-0.45, 0.45]) {
      for (const x of [-1.2, -0.45, 0.45, 1.2]) { put(g, cyl(0.04, 0.04, 0.62, 8), red, x, yAt(x) + 0.31, z); put(g, ball(0.055), gold, x, yAt(x) + 0.65, z); }
      for (let i = 0; i < n; i++) { const x = -L / 2 + 0.1 + ((i + 0.5) * (L - 0.2)) / n; put(g, new THREE.BoxGeometry((L - 0.2) / n + 0.02, 0.05, 0.05), red, x, yAt(x) + 0.55, z, null, [0, 0, Math.atan(slope(x))]); }
    }
  },
  shrub_round(g) {
    // azaleas clipped into soft mounds, the way they're kept in a Japanese garden
    put(g, ball(0.42), toon('#356e3c'), 0, 0.27, 0, [1.25, 0.7, 1.1]);
    put(g, ball(0.3), toon('#3f7d45'), 0.48, 0.2, 0.2, [1.2, 0.7, 1.1]);
    put(g, ball(0.26), toon('#4a8a4a'), -0.42, 0.18, 0.25, [1.2, 0.7, 1.1]);
  },
  post_wood(g) {
    // a square timber post on a stone, as tall as a storey: for holding up a veranda's roof
    put(g, new THREE.BoxGeometry(0.34, 0.12, 0.34), toon('#8c887f'), 0, 0.06, 0);
    put(g, new THREE.BoxGeometry(0.22, WALL_H - 0.12, 0.22), toon('#8a5a32'), 0, (WALL_H + 0.12) / 2, 0);
  },
  // ---- ponds ----
  pond(g) {
    // a round pond sunk in the lawn: a dark bed, rippling water, a ring of stones and a couple of lily pads
    put(g, new THREE.CircleGeometry(1.15, 32), toon('#1f4f5f'), 0, 0.008, 0, null, [-Math.PI / 2, 0, 0]).castShadow = false;
    const w = put(g, new THREE.CircleGeometry(1.15, 32), waterMat(), 0, 0.03, 0, null, [-Math.PI / 2, 0, 0]);
    w.castShadow = false; ripple(w);
    const greys = ['#9a968e', '#aaa59c', '#8a867e', '#b5b1a8'];
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; put(g, new THREE.DodecahedronGeometry(0.17, 0), toon(greys[i % 4]), Math.cos(a) * 1.24, 0.07, Math.sin(a) * 1.24, [1.25, 0.55, 1], [0, a * 3, 0]); }
    lily(g, 0.45, 0.3, 0.17, '#ff9fd0'); lily(g, -0.4, -0.35, 0.14); lily(g, 0.1, -0.6, 0.12);
  },
  koi_pond(g) {
    // a Japanese koi pond: a curving kidney shape edged with grey rocks (a couple of big ones at the end),
    // water lilies, and koi gliding round under the surface
    const r = (a) => 1 + 0.22 * Math.sin(2 * a) + 0.08 * Math.cos(3 * a);
    const pt = (a, k = 1) => [Math.cos(a) * 1.7 * r(a) * k, Math.sin(a) * 1.05 * r(a) * k];
    const shape = new THREE.Shape();
    for (let i = 0; i <= 48; i++) { const [x, z] = pt((i / 48) * Math.PI * 2); if (i) shape.lineTo(x, -z); else shape.moveTo(x, -z); }
    put(g, new THREE.ShapeGeometry(shape, 24), toon('#1d4652'), 0, 0.006, 0, null, [-Math.PI / 2, 0, 0]).castShadow = false;
    const w = put(g, new THREE.ShapeGeometry(shape, 24), waterMat('#3a8aa8', 0.72), 0, 0.034, 0, null, [-Math.PI / 2, 0, 0]);
    w.castShadow = false; ripple(w);
    const greys = ['#8f8b83', '#a19d94', '#7d7a73', '#b0aca3'];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2, [x, z] = pt(a, 1.06), s = 0.14 + ((i * 7) % 5) * 0.03;
      put(g, new THREE.DodecahedronGeometry(s, 0), toon(i % 7 === 3 ? '#5f7a4a' : greys[i % 4]), x, s * 0.45, z, [1.3, 0.7, 1.1], [0, i * 1.7, 0]);
    }
    for (const [a, s] of [[0.15, 0.42], [-0.35, 0.3], [3.3, 0.28]]) { const [x, z] = pt(a, 1.12); put(g, new THREE.DodecahedronGeometry(s, 0), toon('#8a867e'), x, s * 0.6, z, [1.2, 0.9, 1], [0.3, a, 0]); }
    lily(g, -0.9, 0.25, 0.18, '#ffffff'); lily(g, -0.6, 0.45, 0.13); lily(g, 0.7, -0.4, 0.15, '#ff9fd0'); lily(g, 0.95, -0.15, 0.11);
    // the koi, each swimming its own loop just under the water
    [['#ff7a2e', '#ffffff'], ['#ffffff', '#e0463c'], ['#ffc53d', '#ff7a2e'], ['#f4f1ea', '#2a2d36'], ['#ff5d2e', '#ffd84d']].forEach(([body, spot], i) => {
      const fish = new THREE.Group();
      const b = put(fish, new THREE.SphereGeometry(0.09, 10, 8), toon(body), 0, 0, 0, [0.7, 0.45, 1.6]);
      put(fish, new THREE.SphereGeometry(0.05, 8, 6), toon(spot), 0.01, 0.025, 0.04, [0.8, 0.5, 1]);
      put(fish, new THREE.ConeGeometry(0.06, 0.12, 6), toon(body), 0, 0, -0.17, [1, 1, 0.3], [-Math.PI / 2, 0, 0]);
      fish.position.y = 0.018;
      g.add(fish);
      const rx = 0.55 + (i % 3) * 0.3, rz = 0.35 + (i % 2) * 0.2, cx = (i - 2) * 0.12, sp = (0.35 + i * 0.07) * (i % 2 ? 1 : -1), ph = i * 1.3;
      b.onBeforeRender = () => {
        const t = performance.now() / 1000 * sp + ph;
        fish.position.x = cx + Math.cos(t) * rx; fish.position.z = Math.sin(t) * rz;
        fish.rotation.y = Math.atan2(-Math.sin(t) * rx * sp, Math.cos(t) * rz * sp);
        fish.children[2].rotation.y = Math.sin(t * 9) * 0.4; // (the tail swishes)
      };
    });
  },
  shishi_odoshi(g) {
    // a deer-scarer: a bamboo spout trickles into a bamboo tube on a pivot; it fills, tips, empties into a
    // stone basin with a clack and rocks back to fill again
    const bamboo = toon('#9cb04a'), node = toon('#7a8a38'), stone = toon('#9a968e');
    put(g, cyl(0.42, 0.48, 0.28, 14), stone, 0, 0.14, 0.45);
    const w = put(g, new THREE.CircleGeometry(0.34, 20), waterMat(), 0, 0.29, 0.45, null, [-Math.PI / 2, 0, 0]); w.castShadow = false; ripple(w);
    for (const x of [-0.13, 0.13]) { put(g, cyl(0.035, 0.035, 0.6, 8), bamboo, x, 0.3, -0.25); put(g, cyl(0.04, 0.04, 0.03, 8), node, x, 0.42, -0.25); }
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.52, -0.25);
    g.add(pivot);
    const tube = put(pivot, cyl(0.05, 0.05, 0.78, 10), bamboo, 0, 0, 0.12, null, [Math.PI / 2, 0, 0]);
    put(pivot, cyl(0.055, 0.055, 0.03, 10), node, 0, 0, -0.08, null, [Math.PI / 2, 0, 0]);
    put(pivot, new THREE.CircleGeometry(0.045, 10), toon('#3a4a1e'), 0, 0, 0.515, null, [0, 0, 0]);
    // the spout: a bamboo post at the side, a thin pipe leaning over to drip into the tube's open end
    put(g, cyl(0.035, 0.035, 1.0, 8), bamboo, 0.42, 0.5, 0.28);
    put(g, cyl(0.04, 0.04, 0.03, 8), node, 0.42, 0.62, 0.28);
    put(g, cyl(0.022, 0.022, 0.42, 8), bamboo, 0.22, 0.93, 0.28, null, [0, 0, Math.PI / 2 - 0.25]);
    tube.onBeforeRender = () => {
      // fills slowly (its mouth rising as the water in it gets heavier), tips quickly, rocks back
      const t = (performance.now() / 1000) % 6;
      pivot.rotation.x = t < 5 ? -0.3 + (t / 5) * 0.18 : t < 5.25 ? 0.55 : -0.3 + Math.cos((t - 5.25) * 6) * 0.85 * Math.exp(-(t - 5.25) * 5);
    };
  },
  planter(g) { put(g, new THREE.BoxGeometry(0.9, 0.42, 0.42), toon('#7a4a28'), 0, 0.21, 0); for (let i = 0; i < 3; i++) put(g, ball(0.2), toon(i % 2 ? '#5fae55' : '#4f9a45'), -0.28 + i * 0.28, 0.5, 0); for (const [x, c] of [[-0.14, '#ff8fc7'], [0.14, '#ffd84d']]) put(g, new THREE.SphereGeometry(0.07, 8, 6), toon(c), x, 0.66, 0.08); },
};
/** A lily pad (with a flower on some) floating on a pond. */
function lily(g, x, z, r, flower = null) {
  put(g, new THREE.CircleGeometry(r, 14, 0.4, Math.PI * 2 - 0.5), toon('#4f9a45'), x, 0.04, z, null, [-Math.PI / 2, 0, x * 7]).castShadow = false;
  if (flower) { put(g, new THREE.ConeGeometry(r * 0.45, r * 0.5, 6), toon(flower), x, 0.08, z); put(g, new THREE.SphereGeometry(r * 0.15, 6, 4), toon('#ffd84d'), x, 0.12, z); }
}
/** One yard decoration, standing on its own spot (tiles). */
export function buildYardItem(id) {
  const g = new THREE.Group();
  (YARD[id] ?? YARD.bush)(g);
  return g;
}
const ORGANIC = /^(tree|bush|flowers|rock|grass|wild|pebbles|fern|log|stump|pine|shrub)/;
/** Everything in a yard (plot tiles). */
export function buildYard(list = []) {
  const g = new THREE.Group();
  list.forEach((it, i) => {
    const m = buildYardItem(it.id);
    m.position.set(it.x, 0, it.y);
    m.rotation.y = (it.r ?? 0) * Math.PI / 2;
    if (ORGANIC.test(it.id)) {
      // growing things never stand in rows: each is turned and sized a little differently (always the
      // same way for the same spot, so nothing jumps about when the yard is redrawn)
      const h = (n) => { const v = Math.sin(it.x * 12.9898 * n + it.y * 78.233) * 43758.5453; return v - Math.floor(v); };
      m.rotation.y += h(1) * Math.PI * 2;
      m.scale.setScalar(0.86 + h(2) * 0.34);
    }
    m.userData.yard = i;
    g.add(m);
  });
  return g;
}
