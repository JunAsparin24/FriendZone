// Houses (3D): every member has a plot on the neighbourhood street (see hood.js). A plot starts empty
// and its owner builds whatever they like on it: walls drawn anywhere, doors in them, roofs laid over
// them, floors, paths, a yard, and furniture. Wherever walls close off a space it becomes a room (it
// gets a floor and a ceiling, and the walls' faces that look outdoors get the outside finish). This
// file builds the house you're at in full, runs build mode, and makes the simpler copy of everyone
// else's house that stands along the street (buildShell). Furniture is usable: lamps switch, the
// jukebox plays, chairs and sofas are for sitting…
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, fmt, me, nameOf, toast } from '../state.js';
import { CATALOG } from '../catalog.js';
import { portraitInto } from '../avatar.js';
import { toon, basic } from '../three/materials.js';
import { WINDOW_PANES, buildFurniture, furnitureParts, TRIM_MAT, outdoorPanorama, floorTexture, wallTexture, ceilingTexture, wallIsTall, surfaceSpan, SWATCH, surfaceImage, furnitureThumb } from '../three/furniture.js';
import { sfx } from '../sfx.js';
import { settings } from '../settings.js';
import { buildDoor, doorImage } from '../three/doors.js';
import { iconSvg } from '../icons.js';
import { createHood } from './hood.js';
import { PLOT, extSwatch, extMaterial, buildYardItem, buildRoofs } from '../three/exterior.js';
import { mountSpeed, MOUNT_SOUND } from '../three/mounts.js';
import { timeOfDay } from '../three/daynight.js';

let NX = PLOT.w, NZ = PLOT.d;  // the plot in tiles (width x depth): you can build anywhere on it
const T = 1.6;        // world units per tile, so furniture is people-sized
const WALL_H = 3.2;   // in tiles
const HALF_TOP = 1.3, HANG_BOTTOM = 2.2; // where a half wall stops, and where a hanging one starts
const TRIM_DEFAULT = '#f4f0ff';
const WALL_Y = 1.75;  // default height of a wall decoration's middle (tiles)
const MAX_DROP = 2.4; // how far below the ceiling a hanging thing can go
const wallH = (id) => FURN[id]?.wh ?? 1; // how tall a wall decoration is (tiles)
/** Wall decorations: how high (their middle); hanging things: how far below the ceiling. */
const heightOf = (it) => it.h ?? (kindOf(it.id) === 'wall' ? WALL_Y : 0);
function clampHeight(it, h) {
  if (kindOf(it.id) === 'wall') { const wh = wallH(it.id); return Math.max(wh / 2, Math.min(WALL_H - wh / 2, snap(h))); }
  return Math.max(0, Math.min(MAX_DROP, snap(h)));
}
let DOOR = { x0: NX / 2 - 1, x1: NX / 2 + 1, h: 2.2 }; // the front door, in tiles (middle of the front wall)
function setDims([w, d] = [PLOT.w, PLOT.d]) {
  NX = w; NZ = d;
  DOOR = { x0: NX / 2 - 1, x1: NX / 2 + 1, h: 2.2 };
}
/** A plane whose texture repeats every 2 tiles, however big it is (so walls of any length match).
 *  y0: how high its bottom edge is, so wallpaper stays pinned to the floor (above the door too). */
function tiledPlane(w, h, y0 = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2, (y0 + uv.getY(i) * h) / 2);
  return g;
}
const FURN = Object.fromEntries(CATALOG.furniture.map((f) => [f.id, f]));
const kindOf = (id) => FURN[id]?.kind ?? 'floor';
/** Anything can be recoloured (like Bloxburg), except walls, doors, plushies and admin specials. Must match server.py. */
const canRecolor = (f) => !!f && (f.recolor || (f.kind === 'door' && !f.drag) || (!f.room && !f.drag && !f.claw && !f.exclusive)); // (doors too)
// free things (plain walls) never run out: you can put up as many as the limit
// (building in someone else's house: their things, not yours; see invOf in houseArea)
let invOf = () => me();
const owned = (id) => (FURN[id]?.free ? FURN[id].max ?? 99 : invOf()?.furni?.[id] ?? 0);
const ownsDeco = (d) => d.free || owned(d.id) > 0;
const MIN_SIZE = 6; // (HOUSE_MIN on the server)
/** The biggest room you can have, from the house upgrades you own: [width, depth]. */
function maxSize() {
  const have = CATALOG.houseSizes.filter((z) => z.free || owned(z.id) > 0);
  return [Math.max(...have.map((z) => z.w)), Math.max(...have.map((z) => z.d))];
}
// where you sit on things (in tiles above the floor)
// things you can walk up to and use (anything else is just there to look at)
const USEFUL = new Set(['switch', 'tv', 'arcade', 'jukebox', 'piano', 'swap', 'splash', 'bubbles', 'crackle', 'clock', 'domain', 'lever', 'trophy', 'slam', 'roar', 'knock']);
const STANDS = new Set(['shower', 'shower_rain', 'shower_curtain']); // (you stand in these)
const SOAKS = new Set(['bathtub', 'bathtub_modern', 'bathtub_gold', 'bathtub_wood', 'jacuzzi']); // (you get in and sit)
const BEDS = new Set(['bed', 'bed_princess', 'hammock', 'bed_double', 'bed_double_tufted', 'bed_double_canopy', 'bed_double_cloud', 'bed_double_platform', 'bed_king', 'bed_king_tufted', 'bed_king_log', 'bed_king_canopy']);
// top: the height of the cushion/mattress; front: how far its front edge is from the middle (model units)
const SEATS = {
  chair: { top: 0.525, front: 0.25 }, armchair: { top: 0.53, front: 0.41 }, sofa: { top: 0.53, front: 0.41, n: 2 },
  beanbag: { top: 0.5, front: 0.3 }, bed: { top: 0.6, front: 0 }, sofa_pink: { top: 0.53, front: 0.41, n: 2 },
  armchair_pink: { top: 0.53, front: 0.41 }, beanbag_pink: { top: 0.5, front: 0.3 }, bed_princess: { top: 0.6, front: 0 },
  sofa_leather: { top: 0.53, front: 0.41, n: 2 }, armchair_leather: { top: 0.53, front: 0.41 },
  sofa_gray: { top: 0.53, front: 0.41, n: 2 }, armchair_gray: { top: 0.53, front: 0.41 },
  gaming_chair: { top: 0.56, front: 0.25 }, log_bench: { top: 0.62, front: 0.2, n: 2 }, stump_stool: { top: 0.46, front: 0.1 },
  sofa_green: { top: 0.53, front: 0.41, n: 2 }, armchair_green: { top: 0.53, front: 0.41 }, hammock: { top: 0.62, front: 0 },
  bed_double: { top: 0.6, front: 0, n: 2 }, bed_double_tufted: { top: 0.6, front: 0, n: 2 }, bed_double_canopy: { top: 0.6, front: 0, n: 2 }, bed_double_cloud: { top: 0.46, front: 0, n: 2 }, bed_double_platform: { top: 0.46, front: 0, n: 2 },
  bed_king: { top: 0.6, front: 0, n: 3 }, bed_king_tufted: { top: 0.6, front: 0, n: 3 }, bed_king_log: { top: 0.6, front: 0, n: 3 }, bed_king_canopy: { top: 0.6, front: 0, n: 3 },
  rest_chair: { top: 0.525, front: 0.22 }, rest_booth: { top: 0.52, front: 0.3, n: 2 },
  bar_stool: { top: 0.79, front: 0.1 },
  // tubs you sit down in, showers you stand in (STANDS), more toilets, the racing sim
  bathtub: { top: 0.2, front: 0 }, bathtub_modern: { top: 0.22, front: 0 }, bathtub_gold: { top: 0.2, front: 0 }, bathtub_wood: { top: 0.26, front: 0 }, jacuzzi: { top: 0.3, front: 0, n: 2 },
  shower: { top: 0.1, front: 0 }, shower_rain: { top: 0.06, front: 0 }, shower_curtain: { top: 0.1, front: 0 },
  toilet_modern: { top: 0.55, front: 0.3 }, toilet_gold: { top: 0.52, front: 0.28 }, sim_rig: { top: 0.43, front: -0.2 }, bar_stool_wood: { top: 0.79, front: 0.1 }, piano_bench: { top: 0.53, front: 0.19 }, toilet: { top: 0.52, front: 0.28 },
};
// colour variants (the Ocean sofa…) sit, and lie, just like the piece they're a colour of
for (const f of CATALOG.furniture) {
  if (!f.base) continue;
  if (SEATS[f.base]) SEATS[f.id] = SEATS[f.base];
  if (BEDS.has(f.base)) BEDS.add(f.id);
}
// pictures of the real thing: a 3D snapshot of furniture, the actual texture for floors and walls
const furniImg = (id) => `<img class="fem-img" src="${furnitureThumb(id)}" alt="">`;
const decoBg = (id) => (id.startsWith('door_') ? `background:url(${doorImage(id)}) center/cover` : `background:url(${surfaceImage(id)}) center/cover, ${SWATCH[id] ?? '#888'}`);

// surfaces: tables, desks, counters, nightstands, carts… things from the "top" kind sit on them
const SURFACE_RE = /table|desk|counter|nightstand|bedside|dresser|vanity|island|cart|sideboard|cabinet|bar_counter|kit_/;
const isSurface = (f) => !!f && (f.kind ?? 'floor') === 'floor' && !f.tuck && !f.room && (f.desk || SURFACE_RE.test(f.id)) && !SEATS[f.id];
const surfTopCache = new Map();
/** How high a surface's top is (tiles): the highest big flat part of the model (not the odd mug on it). */
function surfTop(id) {
  if (surfTopCache.has(id)) return surfTopCache.get(id);
  const f = FURN[id], g = buildFurniture(id).group;
  g.updateMatrixWorld(true);
  const area = (f.w * f.d) * 0.3;
  let top = 0, any = 0;
  const b = new THREE.Box3();
  g.traverse((o) => {
    if (!o.isMesh || o.userData.outline) return;
    b.setFromObject(o);
    any = Math.max(any, b.max.y);
    if ((b.max.x - b.min.x) * (b.max.z - b.min.z) >= area) top = Math.max(top, b.max.y);
  });
  const h = top || any || 0.75;
  surfTopCache.set(id, h);
  return h;
}

// furniture snaps to quarter tiles, so things can go almost anywhere
const SNAP = 8; // (eighth tiles: furniture and wall decorations line up nicely, easy to centre)
const snap = (v) => Math.round(v * SNAP) / SNAP;
const snapQ = (v) => Math.round(v * 4) / 4; // (room walls and doors stay on quarter tiles)

/** Footprint cells (on the quarter-tile grid) of a placed item, keyed by layer so rugs can sit under furniture. */
function cellsOf(it, check = false) {
  const f = FURN[it.id];
  if (!f) return [];
  const kind = kindOf(it.id);
  if (kind === 'wall') {
    const start = Math.round((it.r % 2 === 0 ? it.x : it.y) * SNAP);
    const h = heightOf(it), wh = wallH(it.id);
    const r0 = Math.round((h - wh / 2) * SNAP), r1 = Math.round((h + wh / 2) * SNAP);
    // (on one of your own walls, the face it hangs on is part of the key too)
    const face = (it.iw ? `iw${Math.round((it.r % 2 === 0 ? it.y : it.x) * SNAP)}:` : '') + (f.over ? 'over:' : ''); // (curtains hang over windows)
    const out = [];
    for (let i = 0; i < f.w * SNAP; i++) for (let j = r0; j < r1; j++) out.push(`wall:${face}${it.r % 4}:${start + i}:${j}`);
    return out;
  }
  const [w, d] = footprint(it);
  const x0 = Math.round(it.x * SNAP), y0 = Math.round(it.y * SNAP);
  // Chairs can tuck in under tables and desks: a chair takes "chair" cells and keeps clear of other
  // chairs and anything solid; a table/desk takes floor cells only (so a chair can share them); everything
  // else is solid and keeps clear of chairs too. `check`: the cells this must not overlap (vs occupies).
  const layers = kind !== 'floor' ? [kind] : f.tuck ? (check ? ['chair', 'solid'] : ['chair']) : f.desk ? ['floor'] : (check ? ['floor', 'chair'] : ['floor', 'solid']);
  const out = [];
  for (let i = 0; i < w * SNAP; i++) for (let j = 0; j < d * SNAP; j++) for (const l of layers) out.push(`${l}:${x0 + i}:${y0 + j}`);
  return out;
}

function fits(it) {
  const f = FURN[it.id];
  if (kindOf(it.id) === 'wall') return !!it.iw; // (things for walls hang on walls you've built: checked against the wall itself, see wallHost)
  const [w, d] = footprint(it);
  return it.x >= 0 && it.y >= 0 && it.x + w <= NX && it.y + d <= NZ;
}
/** Plain room walls are dragged out to any length (it.l, in tiles); everything else is its own size. */
const isDragWall = (id) => !!FURN[id]?.drag;
const lenOf = (it) => (isDragWall(it.id) ? it.l ?? FURN[it.id].w : FURN[it.id].w);
const footprint = (it) => {
  const f = FURN[it.id], w = lenOf(it);
  // turned 45°: it takes up the square it fits in
  // (turned 45°, it keeps the same footprint: turning never makes it take more room)
  return it.r % 2 ? [f.d, w] : [w, f.d];
};
/** Which way a piece faces: quarter turns (r), plus 45° more if it's turned diagonally (dg). */
const angleOf = (it) => it.r * (Math.PI / 2) + (it.dg ? Math.PI / 4 : 0);
/** Furniture that stands on the floor or hangs from the ceiling turns in 8 directions (walls, doors and
 *  things on walls in 4). */
const turns8 = (id) => !FURN[id]?.room && kindOf(id) !== 'wall' && kindOf(id) !== 'door';
/** The next of the 8 directions, going round: r, r + 45°, r + 90°… */
const nextTurn = (it) => (turns8(it.id) ? (it.dg ? { r: (it.r + 1) % 4, dg: undefined } : { r: it.r, dg: 1 }) : { r: (it.r + 1) % 4 });
const isDoor = (id) => kindOf(id) === 'door';
/** The floor cells (quarter tiles) something stands on, whatever layer it's on. */
function groundCells(it) {
  const [w, d] = footprint(it), x0 = Math.round(it.x * SNAP), y0 = Math.round(it.y * SNAP), out = [];
  for (let i = 0; i < w * SNAP; i++) for (let j = 0; j < d * SNAP; j++) out.push(`${x0 + i}:${y0 + j}`);
  return out;
}
/** Every cell covered by a wall you've built (leaving one item out). */
function roomWallCells(items, skip = -1) {
  const set = new Set();
  // (a wall hanging from the ceiling doesn't split the floor into rooms)
  items.forEach((o, i) => { if (i !== skip && FURN[o.id]?.room && !isDoor(o.id) && FURN[o.id].wallH !== 'hang') groundCells(o).forEach((c) => set.add(c)); });
  return set;
}
/**
 * The wall (index) a decoration on one of your own walls hangs on, or -1: a drawn wall whose face it's
 * against, long enough to hold it, and not across a door in it (unless it's above the door).
 */
function wallHost(it, items, skip = -1) {
  const f = FURN[it.id], horiz = it.r % 2 === 0, face = horiz ? it.y : it.x, start = horiz ? it.x : it.y;
  const low = (it.h ?? 1.75) - (f.wh ?? 1) / 2;
  return items.findIndex((w, i) => {
    if (i === skip || !isDragWall(w.id) || FURN[w.id].wallH || (w.r % 2 === 0) !== horiz) return false; // (full-height walls only)
    const wf = horiz ? w.y : w.x, ws = horiz ? w.x : w.y;
    if (Math.abs(face - wf) > 1e-6 && Math.abs(face - (wf + 0.25)) > 1e-6) return false;
    if (start < ws - 1e-6 || start + f.w > ws + lenOf(w) + 1e-6) return false;
    // not over a doorway (doors are 2.2 tiles tall)
    return !items.some((d) => isDoor(d.id) && (d.r % 2 === 0) === horiz && (horiz ? d.y : d.x) === wf
      && start < (horiz ? d.x : d.y) + FURN[d.id].w && start + f.w > (horiz ? d.x : d.y) && low < 2.2);
  });
}
const MAX_AREAS = 24;
/**
 * A painted floor area: every quarter-tile cell you can reach from (cx, cz) without crossing a wall you've
 * built (or leaving the house). Returns the cells as "x:z" keys, or null if the spot is inside a wall.
 */
function fillArea(cx, cz, walls, grid = null) {
  const W = NX * SNAP, D = NZ * SNAP, start = `${cx}:${cz}`;
  if (grid && grid.at((cx + 0.5) / SNAP, (cz + 0.5) / SNAP) !== 0) return null; // (not in a room: outdoors, or in a wall)
  if (cx < 0 || cz < 0 || cx >= W || cz >= D || walls.has(start)) return null;
  const seen = new Set([start]), stack = [[cx, cz]];
  while (stack.length) {
    const [x, z] = stack.pop();
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      const k = `${nx}:${nz}`;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D || seen.has(k) || walls.has(k)) continue;
      seen.add(k);
      stack.push([nx, nz]);
    }
  }
  return seen;
}
/** Cells as one floor mesh: each row's runs of cells become strips, textured like the main floor. */
function areaGeometry(cells, y) {
  const rows = new Map();
  for (const k of cells) { const [x, z] = k.split(':').map(Number); if (!rows.has(z)) rows.set(z, []); rows.get(z).push(x); }
  const pos = [], uv = [], idx = [];
  const q = 1 / SNAP;
  for (const [z, xs] of rows) {
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length;) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      const x0 = xs[i] * q, x1 = (xs[j] + 1) * q, z0 = z * q, z1 = (z + 1) * q, b = pos.length / 3;
      for (const [x, zz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) { pos.push(x, y, zz); uv.push(x / 2, (NZ - zz) / 2); }
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      i = j + 1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** A door has to sit wholly inside a wall. */
const inWall = (it, walls) => groundCells(it).every((c) => walls.has(c));
/**
 * How a drawn wall is built: the gaps where doors are in it (in the wall's own frame, which runs from
 * -len/2 to len/2 and may run either way along the room depending on how it's turned), which ends are
 * open (and so get papered), and the solid stretches either side of each door (room tiles).
 */
function wallLayout(it, items) {
  const l = lenOf(it), horiz = it.r % 2 === 0, start = horiz ? it.x : it.y, perp = horiz ? it.y : it.x;
  const sign = it.r % 4 === 0 || it.r % 4 === 3 ? 1 : -1, mid = start + l / 2;
  const gaps = items.filter((o) => isDoor(o.id) && o.r % 2 === it.r % 2 && (horiz ? o.y : o.x) === perp)
    .map((o) => { const a = horiz ? o.x : o.y; return [a, a + FURN[o.id].w]; })
    .filter(([a, b]) => a >= start - 1e-6 && b <= start + l + 1e-6)
    .sort((p, q) => p[0] - q[0]);
  // windows hung on this wall (on either face) are holes right through it: [from, to, bottom, top]
  const panes = FURN[it.id].wallH ? [] : items.filter((o) => o.iw && WINDOW_PANES[o.id] && o.r % 2 === it.r % 2).map((o) => {
    const face = horiz ? o.y : o.x;
    if (Math.abs(face - perp) > 1e-6 && Math.abs(face - perp - 0.25) > 1e-6) return null;
    const [pw, ph] = WINDOW_PANES[o.id], c = (horiz ? o.x : o.y) + FURN[o.id].w / 2, h = o.h ?? WALL_Y;
    if (c - pw / 2 < start - 1e-6 || c + pw / 2 > start + l + 1e-6) return null;
    return [...[sign * (c - pw / 2 - mid), sign * (c + pw / 2 - mid)].sort((p, q) => p - q), h - ph / 2, h + ph / 2];
  }).filter(Boolean);
  const openings = [...gaps.map(([a, b]) => [sign * (a - mid), sign * (b - mid)].sort((p, q) => p - q)), ...panes];
  // an end is open unless another wall carries on from it (or it runs into the house's own walls). A full
  // wall that meets a half wall (or a hanging one) shows its end above (or below) it.
  const N = horiz ? NX : NZ, q = 1 / SNAP;
  const wallCells = (kind) => { const set = new Set(); items.forEach((o) => { if (FURN[o.id]?.room && !isDoor(o.id) && (FURN[o.id].wallH ?? 'full') === kind) groundCells(o).forEach((c) => set.add(c)); }); return set; };
  const full = wallCells('full'), low = wallCells('low'), hang = wallCells('hang'), mineH = FURN[it.id].wallH ?? 'full';
  const capAt = (along) => {
    if (along < 0 || along >= N) return false;
    const k = horiz ? `${Math.round(along * SNAP)}:${Math.round(perp * SNAP)}` : `${Math.round(perp * SNAP)}:${Math.round(along * SNAP)}`;
    if (full.has(k)) return false;
    if (mineH !== 'full') return !(mineH === 'low' ? low : hang).has(k);
    if (low.has(k) && hang.has(k)) return [HALF_TOP, HANG_BOTTOM];
    if (low.has(k)) return [HALF_TOP, WALL_H];
    if (hang.has(k)) return [0, HANG_BOTTOM];
    return true;
  };
  const lowOpen = capAt(start - q), highOpen = capAt(start + l);
  const caps = sign > 0 ? [lowOpen, highOpen] : [highOpen, lowOpen];
  const segs = [];
  let a = start;
  for (const [g0, g1] of gaps) { if (g0 > a) segs.push([a, g0]); a = g1; }
  if (start + l > a) segs.push([a, start + l]);
  return { openings, caps, segs };
}

// ---------------------------------------------------------------------------
// what a house is made of: shared by the house you're at and the ones you see along the street
// ---------------------------------------------------------------------------

const paperMats = new Map();
/** A wall face's finish: a wallpaper, or an outside finish ("ext:<finish>:<#colour>"). */
function faceMat(id) {
  if (!paperMats.has(id)) {
    let mat;
    if (id.startsWith('ext:')) { const [, m, c] = id.split(':'); mat = extMaterial(m, c).clone(); }
    else {
      const tex = wallTexture(id);
      tex.repeat.set(1 / surfaceSpan(id), wallIsTall(id) ? 2 / WALL_H : 1 / surfaceSpan(id));
      mat = new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, side: THREE.DoubleSide });
    }
    // (a wall's finish is a sheet a hair in front of its core: from across the street the two would
    // flicker through each other, so the sheet always wins)
    Object.assign(mat, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    paperMats.set(id, mat);
  }
  return paperMats.get(id);
}
const surfMats = new Map();
/** A floor or ceiling as a material (one per texture). */
function surfMat(tex, both = false) {
  const key = `${tex.uuid}|${both}`;
  if (!surfMats.has(key)) { tex.repeat.setScalar(1 / (tex.image.width / 256)); surfMats.set(key, new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, side: both ? THREE.DoubleSide : THREE.FrontSide })); }
  return surfMats.get(key);
}
/** A wall face's own finish is kept under this key (by where the wall is and which way the face looks). */
const faceKey = (it, face) => `w:${it.x}:${it.y}:${it.r % 2}:${(face + it.r) % 4}`;
/** A wall's own trim colour is kept under this key. */
const trimKeyOf = (it) => `i:${it.x}:${it.y}:${it.r % 2}`;
const trimMats = new Map();
const trimMat = (c) => { if (!trimMats.has(c)) { const m = TRIM_MAT.clone(); m.color.set(c); trimMats.set(c, m); } return trimMats.get(c); };

/**
 * The plot as a grid of cells (an eighth of a tile each): which are wall, and which are outdoors (you
 * can get to them from the edge of the plot without going through a full-height wall). Whatever is
 * left is a room. at(x, z) in tiles: 0 room, 1 wall, 2 outdoors.
 */
function plotGrid(items) {
  const W = NX * SNAP, D = NZ * SNAP, wall = new Uint8Array(W * D), out = new Uint8Array(W * D);
  for (const o of items) {
    const f = FURN[o.id];
    if (!f?.room || isDoor(o.id) || f.wallH) continue; // (half walls and hanging ones don't close a room off)
    const [w, d] = footprint(o), x0 = Math.round(o.x * SNAP), y0 = Math.round(o.y * SNAP);
    for (let j = Math.max(0, y0); j < Math.min(D, y0 + Math.round(d * SNAP)); j++) wall.fill(1, j * W + Math.max(0, x0), j * W + Math.min(W, x0 + Math.round(w * SNAP)));
  }
  const queue = new Int32Array(W * D);
  let n = 0;
  const push = (i) => { if (!wall[i] && !out[i]) { out[i] = 1; queue[n++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((D - 1) * W + x); }
  for (let y = 0; y < D; y++) { push(y * W); push(y * W + W - 1); }
  for (let k = 0; k < n; k++) {
    const i = queue[k], x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < W * (D - 1)) push(i + W);
  }
  const cell = (x, y) => (x < 0 || y < 0 || x >= W || y >= D ? 2 : wall[y * W + x] ? 1 : out[y * W + x] ? 2 : 0);
  const at = (tx, tz) => cell(Math.floor(tx * SNAP), Math.floor(tz * SNAP));
  // where floors and ceilings go: the rooms, and the walls round them (so doorways have a floor too)
  const covered = (x, y) => { const c = cell(x, y); return c === 0 || (c === 1 && [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cell(x + dx, y + dy) === 0)); };
  return { W, D, at, cell, covered, indoors: (tx, tz) => at(tx, tz) === 0, any: n < W * D - wall.reduce((a, v) => a + v, 0) };
}
/** The rooms' floor (or ceiling, at height y) as one mesh: each row's runs of covered cells become strips. */
function roomsGeometry(grid, y) {
  const pos = [], uv = [], idx = [], q = 1 / SNAP;
  for (let z = 0; z < grid.D; z++) for (let x = 0; x < grid.W;) {
    if (!grid.covered(x, z)) { x++; continue; }
    let j = x;
    while (j + 1 < grid.W && grid.covered(j + 1, z)) j++;
    const x0 = x * q, x1 = (j + 1) * q, z0 = z * q, z1 = (z + 1) * q, b = pos.length / 3;
    for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) { pos.push(px, y, pz); uv.push(px / 2, (NZ - pz) / 2); }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    x = j + 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Dress one built wall (or door): each face in its own finish, the trim in its colour. A face nobody
 * has painted gets the house's wallpaper if it looks into a room, and the outside finish if it looks
 * outdoors. Trim "none" takes the boards off altogether.
 */
function paintWall(group, it, h, grid, wallId = h.wall) {
  const own = h.wallp ?? {}, ext = h.ext?.wall ?? { m: 'siding', c: '#f2ead8' }, extId = `ext:${ext.m}:${ext.c}`;
  const [w, d] = footprint(it), cx = it.x + w / 2, cz = it.y + d / 2, a = angleOf(it), len = lenOf(it), sin = Math.sin(a), cos = Math.cos(a);
  const seen = {};
  const outdoors = (face) => {
    // (faces 0 / 2 are the wall's two sides, 1 / 3 its ends)
    const nx = [sin, cos, -sin, -cos][face], nz = [cos, -sin, -cos, sin][face];
    if (face % 2) return grid.at(cx + nx * (len / 2 + 0.2), cz + nz * (len / 2 + 0.2)) === 2;
    let n = 0;
    for (const t of [-0.3, 0, 0.3]) if (grid.at(cx + nx * 0.3 + cos * len * t, cz + nz * 0.3 - sin * len * t) === 2) n++;
    return n >= 2;
  };
  const trim = h.trimp?.[trimKeyOf(it)] ?? h.trim ?? TRIM_DEFAULT;
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.wallpaper) {
      const face = o.userData.face;
      o.material = faceMat(face == null ? wallId : own[faceKey(it, face)] ?? ((seen[face] ??= outdoors(face)) ? extId : wallId));
    } else if (o.material === TRIM_MAT || o.userData.isTrim) {
      o.userData.isTrim = true;
      o.visible = trim !== 'none';
      if (trim !== 'none') o.material = trimMat(trim);
    }
  });
}

/**
 * Someone's house as it stands on the street: its walls, doors and windows, each face in its finish,
 * and the floors of its rooms (no furniture, nothing to use). In plot tiles. hood.js adds the roofs,
 * paths and yard.
 */
export function buildShell(h) {
  const g = new THREE.Group(), items = h.items ?? [], grid = plotGrid(items);
  for (const it of items) {
    const f = FURN[it.id];
    if (!f) continue;
    const walling = f.room || isDoor(it.id), window = f.kind === 'wall' && it.iw && it.id.startsWith('window');
    if (!walling && !window) continue;
    try {
      const layout = isDragWall(it.id) ? wallLayout(it, items) : null;
      const built = buildFurniture(it.id, { drop: 0, len: isDragWall(it.id) || isDoor(it.id) ? lenOf(it) : 0, openings: layout?.openings, caps: layout?.caps, color: it.c ?? null, parts: it.cp ?? null }).group;
      if (window) {
        const r = it.r % 4;
        built.position.set(r % 2 === 0 ? it.x + f.w / 2 : it.x, it.h ?? WALL_Y, r % 2 === 0 ? it.y : it.y + f.w / 2);
        built.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][r];
      } else {
        const [w, d] = footprint(it);
        built.position.set(it.x + w / 2, 0, it.y + d / 2);
        built.rotation.y = angleOf(it);
        paintWall(built, it, h, grid);
      }
      built.traverse((o) => { if (o.isLight || o.isSprite) o.visible = false; else if (o.isMesh && !o.userData.outline) o.castShadow = true; });
      g.add(built);
    } catch (err) { console.error('house shell', it, err); }
  }
  const floor = new THREE.Mesh(roomsGeometry(grid, 0.004), surfMat(floorTexture(h.floor ?? 'floor_wood')));
  floor.receiveShadow = true;
  g.add(floor);
  return g;
}

// ---------------------------------------------------------------------------
// the building site: the plot's grid and the group everything you build goes into (the lawn, hedges
// and street round it are hood.js's)
// ---------------------------------------------------------------------------

function buildRoom() {
  const g = new THREE.Group();
  g.scale.setScalar(T);
  const wallMat = new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  // editing helpers
  const gridPts = [];
  for (let i = 0; i <= NX; i++) gridPts.push(i, 0.03, 0, i, 0.03, NZ);
  for (let i = 0; i <= NZ; i++) gridPts.push(0, 0.03, i, NX, 0.03, i);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }));
  // fainter quarter-tile lines: furniture snaps to these
  const finePts = [];
  for (let i = 0.25; i < NX; i += 0.25) if (i % 1) finePts.push(i, 0.027, 0, i, 0.027, NZ);
  for (let i = 0.25; i < NZ; i += 0.25) if (i % 1) finePts.push(0, 0.027, i, NX, 0.027, i);
  const fineGeo = new THREE.BufferGeometry();
  fineGeo.setAttribute('position', new THREE.Float32BufferAttribute(finePts, 3));
  grid.add(new THREE.LineSegments(fineGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1 })));
  grid.visible = false;
  g.add(grid);
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basic('#6ee7a0', { transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  marker.visible = false;
  g.add(marker);
  const items = new THREE.Group();
  g.add(items);
  return { group: g, wallMat, grid, marker, items };
}

// ---------------------------------------------------------------------------

export function house(stage) {
  const WX = () => NX * T, WZ = () => NZ * T; // the room in world units
  // the street everyone's houses stand on. The world is always centred on the house you're at (`view`
  // turns the street's coordinates into that house's), so everything below works in room coordinates.
  const hood = createHood();
  stage.scene.add(hood.group);
  let view = hood.viewFrom(S.me);
  view.apply();
  const sun = stage.lights({ background: '#9fd4ff', sky: 0xfff6ea, ground: 0x7a8f6a, hemi: 1.25, sun: 1.9, sunColor: 0xfff1d6, box: 38, fog: ['#cfe6f7', 130, 520] });
  const hemi = stage.scene.children.find((o) => o.isHemisphereLight);
  let clockTick = 0;
  const clockText = () => { const t = timeOfDay(); return `${t.icon} ${t.clock}`; };
  sun.position.set(WX() / 2 + 6, 40, WZ() / 2 + 12); // high overhead so the walls don't shade the floor
  sun.target.position.set(WX() / 2, 0, WZ() / 2);
  let room = buildRoom();
  stage.scene.add(room.group);

  const solids = [];
  const bounds = {};
  /** The edges of the neighbourhood, as this house sees them. */
  function fitBounds() {
    const b = hood.bounds(), p = view.toLocal(b.minX, b.minZ), q = view.toLocal(b.maxX, b.maxZ);
    Object.assign(bounds, { minX: Math.min(p.x, q.x), maxX: Math.max(p.x, q.x), minZ: Math.min(p.z, q.z), maxZ: Math.max(p.z, q.z) });
  }
  fitBounds();
  const arrive = hood.arrival(S.me);
  const walker = stage.walker({
    spawn: view.toLocal(arrive.x, arrive.z), solids, bounds, frozen: () => !!edit, // (building: you float, see below)
    speedOf: () => 5 * (riding ? mountSpeed(S.players[S.me]?.look?.mount) : 1), // (on your mount: a good deal quicker)
    orbit: { yaw: 0, pitch: 0.5, dist: 11, minDist: 5, maxDist: 26 },
    ceiling: WALL_H * T - 0.3,
    // hedges, house walls (yours and everyone else's), trees and fences
    blockedAt: (x, z) => { const h = view.toHood(x, z), o = hood.ownerAt(h.x, h.z); return (o && siteClosed(o)) || hood.blocked(h.x, h.z); },
    // over the network everyone is on the street's coordinates (while you build, your body is tucked away)
    wire: {
      out: (x, z, h) => (edit ? { x: 2500, z: 2500, h: 0 } : { ...view.toHood(x, z), h: h + view.turn }),
      in: (x, z, h) => ({ ...view.toLocal(x, z), h: h - view.turn }),
    },
  });
  // the camera is free out of doors; walls stop it (see the frame loop), and in a room it stays under the ceiling
  stage.camRoom = { minX: -1e4, maxX: 1e4, minZ: -1e4, maxZ: 1e4, maxY: 90, off: false };
  const walkPointer = stage.onPointer;
  const orbit = stage.orbit;

  stage.hud.innerHTML = `
    <div class="hud-panel house-bar"><div class="house-title"></div><div class="house-actions"></div></div>
    <div class="hud-panel house-side hidden"><div class="tabs house-tabs"></div><div class="house-panel"></div></div>
    <div class="place-bar hidden"></div>
    <p class="hud-panel arena-help house-hint"></p>`;
  const $h = (sel) => stage.hud.querySelector(sel);
  const titleEl = $h('.house-title'), actions = $h('.house-actions'), side = $h('.house-side');
  const tabsEl = $h('.house-tabs'), panel = $h('.house-panel'), hint = $h('.house-hint');

  let viewKey = null, home = null, edit = false, placing = null, selected = -1, tab = 'visit', sideOpen = false;
  let fly = null; // (where the decorating camera is floating)
  let grab = null; // (pressed on a piece: dragging it moves it)
  let trimMode = false, trimBrush = null; // (trim, one wall at a time)
  let partSel = null; // (colouring one part of the selected piece)
  let confirmBuy = null, saveTimer = 0, echoes = 0, ghost = null, seated = null;
  let preview = {};        // { floor?, wall? }: ones you're trying on before buying
  let outsideSig = '', cutSig = ''; // (what the street is showing of this house, and which walls are cut away)
  let paintMode = false, brush = null; // painting a room's floor / ceiling or one wall: on, and with what
  const PAINTABLE = new Set(['floor', 'ceiling', 'wall']);
  const areaGroup = new THREE.Group(); // the painted floors, drawn just above the main one
  const trying = () => Object.keys(preview).length > 0;
  const isTrying = (id) => Object.values(preview).includes(id);
  let buyThenUse = null;   // put this up as soon as the purchase goes through
  let entries = [];           // built items: { group, use, A, it, bounce, inter }
  const mine = () => viewKey === S.me;
  /** Can you decorate this house? Your own, or one whose owner gave you permission. */
  const canEdit = () => mine() || (home?.builders ?? []).includes(S.me);
  invOf = () => (!mine() && S.players[viewKey]) || me();
  const payload = () => ({
    k: viewKey,
    floor: home.floor, wall: home.wall, ceiling: home.ceiling ?? 'ceil_plain', door: home.door ?? 'door_classic', size: home.size ?? [14, 14],
    items: home.items.map(({ id, x, y, r, h, l, iw, dg, c, t, cp, lk }) => ({ id, x, y, r, ...(h == null ? {} : { h }), ...(l == null ? {} : { l }), ...(iw ? { iw: 1 } : {}), ...(dg ? { dg: 1 } : {}), ...(c ? { c } : {}), ...(t ? { t } : {}), ...(cp && Object.keys(cp).length ? { cp } : {}), ...(lk && isDoor(id) ? { lk: 1 } : {}) })),
    areas: home.areas ?? [], careas: home.careas ?? [], wallp: home.wallp ?? {}, trim: home.trim ?? TRIM_DEFAULT, trimp: home.trimp ?? {},
    ext: home.ext,
  });

  // ---- building the furniture ------------------------------------------------------

  /** The height of the surface under a tabletop item (every quarter-cell of it has to be on one), or null. */
  function surfaceUnder(it, skip = -1) {
    if (!home) return null;
    const under = new Map();
    home.items.forEach((o, i) => {
      if (i === skip || !isSurface(FURN[o.id])) return;
      const h = surfTop(o.id);
      for (const c of cellsOf(o)) if (c.startsWith('floor:')) under.set(c.slice(6), Math.max(under.get(c.slice(6)) ?? 0, h));
    });
    let top = null;
    for (const c of cellsOf(it)) {
      const h = under.get(c.slice(c.indexOf(':') + 1));
      if (h == null) return null;
      top = Math.max(top ?? 0, h);
    }
    return top;
  }
  function placeGroup(g, it) {
    const f = FURN[it.id];
    if (kindOf(it.id) === 'wall') {
      const r = it.r % 4;
      const y = heightOf(it);
      if (it.iw) {
        // on one of your walls: against the face it hangs on
        g.position.set(r % 2 === 0 ? it.x + f.w / 2 : it.x, y, r % 2 === 0 ? it.y : it.y + f.w / 2);
        g.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][r];
        return;
      }
      if (r === 0) { g.position.set(it.x + f.w / 2, y, 0); g.rotation.y = 0; }
      else if (r === 1) { g.position.set(0, y, it.y + f.w / 2); g.rotation.y = Math.PI / 2; }
      else if (r === 2) { g.position.set(it.x + f.w / 2, y, NZ); g.rotation.y = Math.PI; }
      else { g.position.set(NX, y, it.y + f.w / 2); g.rotation.y = -Math.PI / 2; }
      return;
    }
    const [w, d] = footprint(it);
    const y = kindOf(it.id) === 'top' ? surfaceUnder(it, placing?.from ?? -1) ?? 0 : kindOf(it.id) === 'ceiling' && !isDragWall(it.id) ? WALL_H : 0;
    g.position.set(it.x + w / 2, y, it.y + d / 2); // (a hanging wall is built at its own height; tabletop things sit on their table)
    g.rotation.y = angleOf(it);
  }

  function rebuildItems() {
    while (room.items.children.length) room.items.remove(room.items.children[0]);
    stage.interactables = stage.interactables.filter((i) => !i.house);
    solids.length = 0;
    const walls = roomWallCells(home.items);
    entries = home.items.map((it, index) => { try { return buildEntry(it, index, walls); } catch (err) {
      // (something went wrong building one piece: leave a gap for it, rather than losing the whole room)
      console.error('house item', it, err);
      const group = new THREE.Group(); group.userData.index = index; room.items.add(group);
      return { group, it, A: { anim: [] }, anim: [], bounce: 1, use: null };
    } });
    afterBuild();
  }
  function buildEntry(it, index, walls) {
    {
      const layout = isDragWall(it.id) ? wallLayout(it, home.items) : null;
      const built = buildFurniture(it.id, { drop: kindOf(it.id) === 'ceiling' && !isDragWall(it.id) ? heightOf(it) : 0, len: isDragWall(it.id) || isDoor(it.id) ? lenOf(it) : 0, openings: layout?.openings, caps: layout?.caps, color: it.c ?? null, text: it.t ?? null, parts: it.cp ?? null });
      built.group.userData.index = index;
      placeGroup(built.group, it);
      built.group.visible = !(placing && placing.from === index);
      room.items.add(built.group);
      const entry = { ...built, it, bounce: 1 };
      const kind = kindOf(it.id);
      const [w, d] = footprint(it);
      const wr = it.r % 4, half = FURN[it.id].w / 2;
      const cx = kind === 'wall' ? (it.iw ? [it.x + half, it.x + 0.6, it.x + half, it.x - 0.6][wr] : [it.x + half, 0.6, it.x + half, NX - 0.6][wr]) : it.x + w / 2;
      const cz = kind === 'wall' ? (it.iw ? [it.y + 0.6, it.y + half, it.y - 0.6, it.y + half][wr] : [0.6, it.y + half, NZ - 0.6, it.y + half][wr]) : it.y + d / 2;
      const f0 = FURN[it.id];
      if (isDoor(it.id)) {
        // a door in a wall: you walk through it (it opens for you); an archway's curve is papered like the wall
        built.group.traverse((o) => { if (o.userData.wallpaper) o.material = room.wallMat; });
        if (built.A.open !== undefined) {
          // a door with a leaf can be locked by the owner and anyone they let build: then it only opens
          // for them, and everyone else finds it shut
          const mayLock = canEdit();
          if (it.lk) {
            built.group.add(padlock());
            if (!mayLock) solids.push({ x: cx * T, z: cz * T, w: w * T + 0.1, d: d * T + 0.1 });
          }
          if (mayLock || it.lk) {
            entry.inter = stage.interactable({
              x: cx * T, z: cz * T, r: 1.9, label: mayLock ? (it.lk ? '🔓 unlock this door' : '🔒 lock this door') : '🔒 locked',
              use: () => { if (edit) return; if (mayLock) toggleLock(index); else { sfx('error'); toast('🔒 That door is locked.'); } },
            });
            entry.inter.house = true;
          }
        }
      } else if (f0.room) {
        // walls you build inside: papered like the room, and solid right up to their ends (but not
        // through the doors in them)
        built.group.traverse((o) => { if (o.userData.wallpaper) o.material = room.wallMat; });
        entry.roomWall = true;
        if (layout && f0.wallH === 'hang') entry.roomWall = 'hang'; // (overhead: you walk under it)
        else if (layout) {
          for (const [a, b] of layout.segs) {
            if (w >= d) solids.push({ x: ((a + b) / 2) * T, z: cz * T, w: (b - a) * T + 0.1, d: d * T + 0.1 });
            else solids.push({ x: cx * T, z: ((a + b) / 2) * T, w: w * T + 0.1, d: (b - a) * T + 0.1 });
          }
        } else if (f0.doorway) {
          // a doorway: only the posts either side are solid, so you can walk through the middle
          const post = 0.5;
          if (w >= d) for (const px of [it.x + post / 2, it.x + w - post / 2]) solids.push({ x: px * T, z: cz * T, w: post * T, d: d * T + 0.1 });
          else for (const pz of [it.y + post / 2, it.y + d - post / 2]) solids.push({ x: cx * T, z: pz * T, w: w * T + 0.1, d: post * T });
        } else solids.push({ x: cx * T, z: cz * T, w: w * T + 0.1, d: d * T + 0.1 });
      } else if (kind === 'floor') solids.push({ x: cx * T, z: cz * T, w: w * T - 0.15, d: d * T - 0.15 });
      const f = FURN[it.id];
      const seat = SEATS[it.id] != null;
      if (f.room || !(seat || f.action || USEFUL.has(f.use))) return entry; // (only things worth using: no towel racks or rocks)
      entry.inter = stage.interactable({
        x: cx * T, z: cz * T, r: Math.max(w, d) * T * 0.5 + 1.1, obj: built.group,
        label: seat ? `${STANDS.has(it.id) ? 'step into' : SOAKS.has(it.id) ? 'get in' : BEDS.has(it.id) ? 'lie on' : 'sit on'} the ${f.name.toLowerCase()}` : f.action === 'wardrobe' ? 'open your wardrobe' : `use the ${f.name.toLowerCase()}`,
        use: () => { if (!edit) useItem(entry); },
      });
      entry.inter.house = true;
      return entry;
    }
  }
  /** A little brass padlock over a locked door (on both faces of the wall). */
  function padlock() {
    const g = new THREE.Group(), brass = toon('#e0b23a'), steel = toon('#b9c0cc');
    for (const s of [1, -1]) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.05), brass); body.position.set(0, 2.42, s * 0.17);
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 8, 16, Math.PI), steel); loop.position.set(0, 2.5, s * 0.17);
      g.add(body, loop);
    }
    return g;
  }
  /** Lock or unlock a door (the owner, or someone they let build). */
  function toggleLock(index) {
    const it = { ...home.items[index] };
    if (!canEdit() || !isDoor(it.id)) return;
    if (it.lk) delete it.lk; else it.lk = 1;
    home.items[index] = it;
    toast(it.lk ? '🔒 Locked: only you and the people you let build can get through.' : '🔓 Unlocked: anyone can walk in.');
    commit('click');
  }
  function afterBuild() {
    // keep the light count sane: only the first few lamps really light the room
    let lights = 0;
    room.items.traverse((o) => {
      if (o.isPointLight) { o.castShadow = false; if (++lights > 4) o.intensity = 0; else o.distance *= T; }
      if (o.isMesh && !o.userData.outline) o.castShadow = true;
    });
    applySurfaces();
    renderSelection();
    applyAllSeats();
  }

  /** Floors, ceilings and wall finishes, showing a previewed (not yet bought) one if you're trying it on. */
  function applySurfaces() {
    if (!home) return;
    if ((home.trim ?? TRIM_DEFAULT) !== 'none') TRIM_MAT.color.set(home.trim ?? TRIM_DEFAULT);
    drawAreas();
    syncOutside();
  }
  /** Keep what the street shows of this house (its roofs, paths and yard) in step with what's being built. */
  function syncOutside() {
    if (!home) return;
    const sig = JSON.stringify(home.ext);
    if (sig === outsideSig) return;
    outsideSig = sig;
    cutSig = '';
    hood.setHouse(viewKey, home);
  }
  /** The rooms: wherever walls close off a space it gets the house's floor and ceiling; rooms painted
   *  on their own get theirs on top. */
  let grid = plotGrid([]);
  const ceilGroup = new THREE.Group();
  function drawAreas() {
    if (areaGroup.parent !== room.group) room.group.add(areaGroup, ceilGroup);
    for (const grp of [areaGroup, ceilGroup]) { grp.children.forEach((m) => m.geometry.dispose()); grp.clear(); }
    grid = plotGrid(home.items);
    const floor = new THREE.Mesh(roomsGeometry(grid, 0.004), surfMat(floorTexture(preview.floor ?? home.floor)));
    floor.receiveShadow = true;
    areaGroup.add(floor);
    ceilGroup.add(new THREE.Mesh(roomsGeometry(grid, WALL_H - 0.004), surfMat(ceilingTexture(preview.ceiling ?? home.ceiling ?? 'ceil_plain'), true)));
    const walls = roomWallCells(home.items);
    (home.areas ?? []).forEach((a, i) => {
      const cells = fillArea(Math.round(a.x * SNAP), Math.round(a.y * SNAP), walls, grid);
      if (!cells) return;
      const mesh = new THREE.Mesh(areaGeometry(cells, 0.007 + i * 0.0008), surfMat(floorTexture(a.f)));
      mesh.receiveShadow = true;
      areaGroup.add(mesh);
    });
    (home.careas ?? []).forEach((a, i) => {
      const cells = fillArea(Math.round(a.x * SNAP), Math.round(a.y * SNAP), walls, grid);
      if (cells) ceilGroup.add(new THREE.Mesh(areaGeometry(cells, WALL_H - 0.008 - i * 0.0008), surfMat(ceilingTexture(a.f), true)));
    });
    paintWalls();
  }
  /** Every wall and door in its finishes and trim. */
  function paintWalls() {
    for (const e of entries) if (e.roomWall || isDoor(e.it.id)) paintWall(e.group, e.it, home, grid, preview.wall ?? home.wall);
  }
  /** The wall under the pointer: { index, face } (face: which of its faces, if it's a papered one). */
  function wallUnderPointer() {
    stage.raycaster.setFromCamera(stage.mouse, stage.camera);
    const hit = stage.raycaster.intersectObjects(entries.filter((e) => e.roomWall).map((e) => e.group), true).find((h) => h.object.visible && !h.object.userData.outline);
    if (!hit) return null;
    for (let o = hit.object; o; o = o.parent) if (o.userData.index != null) return home.items[o.userData.index] ? { it: home.items[o.userData.index], face: hit.object.userData.wallpaper ? hit.object.userData.face : null } : null;
    return null;
  }
  /** Trim brush: give the wall under the pointer its own trim colour (or none). */
  function trimAt() {
    const w = wallUnderPointer();
    if (!w) { sfx('error'); return; }
    const key = trimKeyOf(w.it), own = { ...(home.trimp ?? {}) };
    if (trimBrush === (home.trim ?? TRIM_DEFAULT)) delete own[key]; else own[key] = trimBrush;
    if (Object.keys(own).length > 400) { toast('That\'s a lot of trims! Clear some first.', 'error'); return; }
    home.trimp = own;
    commit('paint');
  }
  /** Give the wall face under the pointer a finish of its own (null: back to the house's). */
  function paintFaceAt(id) {
    const w = wallUnderPointer();
    if (!w || w.face == null) { sfx('error'); return; }
    const key = faceKey(w.it, w.face), own = { ...(home.wallp ?? {}) };
    if (id == null) delete own[key]; else own[key] = id;
    if (Object.keys(own).length > 400) { toast('That\'s a lot of painted walls! Clear some first.', 'error'); return; }
    home.wallp = own;
    commit('paint');
  }
  const paintWallAt = () => paintFaceAt(brush === home.wall ? null : brush);

  /** Paint the room under the pointer with the brush (painting the main floor back takes the paint off). */
  function paintAt() {
    if (stylePage === 'wall') { paintWallAt(); return; }
    const field = stylePage === 'ceiling' ? 'careas' : 'areas', main = stylePage === 'ceiling' ? home.ceiling ?? 'ceil_plain' : home.floor;
    const p = stage.pointerOnPlane(0);
    if (!p || !brush) return;
    const cx = Math.floor((p.x / T) * SNAP), cz = Math.floor((p.z / T) * SNAP);
    const walls = roomWallCells(home.items);
    const here = fillArea(cx, cz, walls, grid);
    if (!here) { sfx('error'); toast('That isn\'t a room yet: close it off with walls first.', 'error'); return; }
    // (whatever was painted in this room before goes)
    home[field] = (home[field] ?? []).filter((a) => !here.has(`${Math.round(a.x * SNAP)}:${Math.round(a.y * SNAP)}`));
    if (brush !== main) {
      if (home[field].length >= MAX_AREAS) { toast(`You can paint up to ${MAX_AREAS} rooms.`, 'error'); return; }
      home[field].push({ f: brush, x: cx / SNAP, y: cz / SNAP });
    }
    commit('paint');
  }

  /** Try on a floor/wall (id), or stop trying one on (id null). No field: stop trying everything. */
  function setPreview(field, id = null) {
    if (!field) preview = {};
    else if (id) preview[field] = id;
    else delete preview[field];
    applySurfaces();
  }

  // ---- sitting ------------------------------------------------------------------------

  // who's sitting where: key -> [item index, seat] (seats are side by side, e.g. a sofa's two cushions)
  const seatsTaken = new Map();
  const seatCount = (id) => SEATS[id]?.n ?? 1;
  const takenBy = (i, s) => [...seatsTaken].find(([k, v]) => k !== S.me && v && v[0] === i && v[1] === s && v[2] === viewKey)?.[0];

  /** Sit down on the nearest free seat of a piece (E again stands you up). */
  function sit(entry) {
    const i = entries.indexOf(entry), n = seatCount(entry.it.id);
    const free = [...Array(n).keys()].filter((s) => takenBy(i, s) == null);
    if (!free.length) { toast(n > 1 ? "It's full! Every seat is taken." : "Someone's already sitting there!"); return; }
    const p = walker.me;
    const pick = free.sort((a, b) => seatSpot(entry.it, a).dist(p) - seatSpot(entry.it, b).dist(p))[0];
    setRiding(false);
    seated = entry;
    entry.seat = pick;
    entry.at = placeOnSeat(p, entry.it, pick);
    seatsTaken.set(S.me, [i, pick, viewKey]);
    net.send('area_sit', { seat: [i, pick, viewKey] });
    const at = view.toHood(p.x, p.z);
    net.send('area_move', { x: +at.x.toFixed(2), z: +at.z.toFixed(2), h: +(p.heading + view.turn).toFixed(2) });
    sfx(BEDS.has(entry.it.id) ? 'snore' : 'squish');
  }
  /** Where seat s of a piece is, across its width (in world units, before any perching forward). */
  function seatSpot(it, s) {
    const [w, d] = footprint(it), n = seatCount(it.id);
    const h = angleOf(it), off = (s - (n - 1) / 2) * (FURN[it.id].w / n) * T;
    const x = (it.x + w / 2) * T + Math.cos(h) * off, z = (it.y + d / 2) * T - Math.sin(h) * off;
    return { x, z, dist: (p) => Math.hypot(p.x - x, p.z - z) };
  }
  /** Pose person p on seat s of a piece; returns where they ended up. */
  function placeOnSeat(p, it, s) {
    const seat = SEATS[it.id], bed = BEDS.has(it.id);
    const heading = angleOf(it), fx = Math.sin(heading), fz = Math.cos(heading);
    p.heading = heading;
    if (STANDS.has(it.id)) {
      // in the shower: standing on the tray, facing out
      p.char.setPose('idle');
      const spot = seatSpot(it, s);
      p.x = spot.x; p.z = spot.z; p.y = seat.top * T;
      return { x: p.x, y: p.y, z: p.z, heading };
    }
    p.char.setPose(bed ? 'lie' : 'sit');
    // rest on top of the cushion, not inside it: find the lowest point of the posed body (for sitting,
    // the seat of the pants; the legs hang over the front edge) and put that on the surface
    const c = p.char, hipY = c.rig.hipY;
    c.update(0, 0, false, 1);
    let lowest;
    if (bed) {
      c.root.position.set(0, 0, 0);
      c.root.rotation.set(0, 0, 0);
      c.root.updateMatrixWorld(true);
      // the torso and legs rest on the mattress (hair and hats can sink into the pillow)
      const box = new THREE.Box3().setFromObject(c.rig.torso);
      for (const l of c.rig.legs) box.union(new THREE.Box3().setFromObject(l));
      lowest = box.min.y;
    } else lowest = hipY - 0.12;
    // sitting, you perch near the front so your knees reach the edge and the shins hang down in front
    const fwd = bed ? 0 : Math.max(0, seat.front * T - 0.2 * (hipY / 0.46) + 0.1);
    const spot = seatSpot(it, s);
    p.x = spot.x + fx * fwd;
    p.z = spot.z + fz * fwd;
    p.y = seat.top * T - lowest + 0.01;
    return { x: p.x, y: p.y, z: p.z, heading };
  }
  /** Show someone else sitting (or getting up), from what the server told us. */
  function applyOtherSeat(k) {
    const p = stage.people.get(k);
    if (!p || k === S.me) return;
    const v = seatsTaken.get(k), entry = v && v[2] === viewKey && entries[v[0]]; // (only seats in the house you're at)
    if (entry && SEATS[entry.it.id] != null && v[1] < seatCount(entry.it.id)) {
      const at = placeOnSeat(p, entry.it, v[1]);
      p.tx = at.x; p.tz = at.z;
      p.sitting = true;
    } else if (p.sitting) {
      p.sitting = false;
      p.y = 0;
      p.char.setPose('idle');
    }
  }
  const applyAllSeats = () => { for (const k of seatsTaken.keys()) applyOtherSeat(k); };
  function standUp() {
    if (!seated) return;
    const it = seated.it;
    const [w, d] = footprint(it);
    const p = walker.me;
    // step off in front of the seat (or wherever there's room)
    const fx = Math.sin(angleOf(it)), fz = Math.cos(angleOf(it));
    const tries = [[fx, fz], [-fx, -fz], [fz, -fx], [-fz, fx]];
    for (const [dx, dz] of tries) {
      const x = (it.x + w / 2 + dx * (w / 2 + 0.6)) * T, z = (it.y + d / 2 + dz * (d / 2 + 0.6)) * T;
      if (x > 0.5 && z > 0.5 && x < WX() - 0.5 && z < WZ() - 0.5 && !solids.some((s) => Math.abs(x - s.x) < s.w / 2 + 0.4 && Math.abs(z - s.z) < s.d / 2 + 0.4)) {
        p.x = x; p.z = z; break;
      }
    }
    p.y = 0;
    p.char.setPose('idle');
    seated = null;
    seatsTaken.delete(S.me);
    net.send('area_sit', { seat: null });
  }

  /** Gojo: "Ryōiki Tenkai" (at the sound-effects volume; one at a time). */
  let domainClip = null;
  function domainExpansion() {
    if (settings.muted) return;
    domainClip?.pause();
    domainClip = new Audio('sound/ryouiki_tenkai.mp3');
    domainClip.volume = Math.min(1, settings.master * settings.sfx);
    domainClip.play().catch(() => {});
  }

  function useItem(entry) {
    entry.bounce = 0;
    const f = FURN[entry.it.id];
    if (seated) { standUp(); return; } // E again gets you up
    if (SEATS[entry.it.id] != null) {
      sit(entry);
      if (STANDS.has(entry.it.id) || SOAKS.has(entry.it.id)) { entry.use?.(); if (f?.use) sfx(f.use); } // (the water comes on)
      return;
    }
    entry.use?.();
    if (f?.use === 'domain') domainExpansion();
    else if (f?.use) sfx(f.use);
    if (f?.action === 'wardrobe') {
      if (mine()) setTimeout(() => window.dispatchEvent(new CustomEvent('fz:open', { detail: 'wardrobe' })), 250);
      else toast(`That's ${nameOf(viewKey)}'s wardrobe. Use the one in your own house!`);
    }
  }

  // ---- placing furniture -----------------------------------------------------------

  const ghostOk = basic('#6ee7a0', { transparent: true, opacity: 0.55, depthWrite: false });
  const ghostBad = basic('#ff5d73', { transparent: true, opacity: 0.55, depthWrite: false });

  function buildGhost() {
    if (ghost) room.group.remove(ghost);
    ghost = null;
    if (!placing) { room.marker.visible = false; return; }
    ghost = buildFurniture(placing.id, { drop: kindOf(placing.id) === 'ceiling' && !isDragWall(placing.id) ? heightOf(placing) : 0, len: isDragWall(placing.id) ? lenOf(placing) : 0, color: placing.from >= 0 ? home.items[placing.from].c ?? null : null }).group;
    ghost.userData.drop = heightOf(placing);
    ghost.userData.len = lenOf(placing);
    ghost.traverse((o) => {
      if (o.isMesh) {
        if (o.userData.outline) o.visible = false;
        else { o.material = ghostOk; o.castShadow = false; }
      }
      if (o.isLight || o.isSprite) o.visible = false;
    });
    ghost.visible = false;
    room.group.add(ghost);
  }

  function updateGhost() {
    if (!ghost || !placing || placing.x < 0) {
      if (ghost) ghost.visible = false;
      room.marker.visible = false;
      return;
    }
    const it = { id: placing.id, x: placing.x, y: placing.y, r: placing.r, h: placing.h, l: placing.l, iw: placing.iw, dg: placing.dg };
    if (kindOf(placing.id) === 'ceiling' && ghost.userData.drop !== heightOf(placing)) { buildGhost(); return updateGhost(); }
    if (isDragWall(placing.id) && ghost.userData.len !== lenOf(placing)) { buildGhost(); return updateGhost(); }
    const taken = takenCells(placing.from);
    placing.valid = !placing.tooShort && fits(it) && !cellsOf(it, true).some((c) => taken.has(c)) && !blocksDoor(it)
      && (!isDoor(placing.id) || inWall(it, roomWallCells(home.items, placing.from)))
      && (!it.iw || wallHost(it, home.items, placing.from) >= 0)
      && (kindOf(placing.id) !== 'top' || surfaceUnder(it, placing.from) != null); // (plates and food go on a table)
    const mat = placing.valid ? ghostOk : ghostBad;
    ghost.traverse((o) => { if (o.isMesh && !o.userData.outline) o.material = mat; });
    ghost.visible = true;
    placeGroup(ghost, it);
    const f = FURN[placing.id];
    const m = room.marker;
    m.material.color.set(placing.valid ? '#6ee7a0' : '#ff5d73');
    m.visible = true;
    if (kindOf(placing.id) === 'wall') {
      m.scale.set(f.w, wallH(it.id), 1);
      const r = it.r % 4, y = heightOf(it);
      if (it.iw) {
        const off = 0.02 * (r < 2 ? 1 : -1);
        m.rotation.set(0, [0, Math.PI / 2, Math.PI, -Math.PI / 2][r], 0);
        m.position.set(r % 2 === 0 ? it.x + f.w / 2 : it.x + off, y, r % 2 === 0 ? it.y + off : it.y + f.w / 2);
      } else if (r === 0) { m.rotation.set(0, 0, 0); m.position.set(it.x + f.w / 2, y, 0.02); }
      else if (r === 1) { m.rotation.set(0, Math.PI / 2, 0); m.position.set(0.02, y, it.y + f.w / 2); }
      else if (r === 2) { m.rotation.set(0, Math.PI, 0); m.position.set(it.x + f.w / 2, y, NZ - 0.02); }
      else { m.rotation.set(0, -Math.PI / 2, 0); m.position.set(NX - 0.02, y, it.y + f.w / 2); }
    } else {
      const [w, d] = footprint(it);
      m.rotation.set(-Math.PI / 2, 0, 0);
      m.scale.set(w, d, 1);
      m.position.set(it.x + w / 2, 0.02, it.y + d / 2); // (ceiling items: marked on the floor right below)
    }
  }

  /** Keep a clear spot inside the front door so nobody gets walled in. */
  const blocksDoor = () => false; // (there's no fixed front door to keep clear any more)

  function aimPlacement() {
    const f = FURN[placing.id];
    stage.raycaster.setFromCamera(stage.mouse, stage.camera);
    if (kindOf(placing.id) === 'wall') {
      const mine = entries.filter((e) => e.roomWall && isDragWall(e.it.id)).map((e) => e.group);
      const h = stage.raycaster.intersectObjects(mine, true).find((x) => !x.object.userData.outline);
      if (!h) { placing.x = -1; return; }
      aimOwnWall(h, f);
      return;
    }
    if (isDragWall(placing.id) && placing.from < 0) { aimWall(); return; }
    if (isDoor(placing.id)) { aimDoor(); return; }
    const [w, d] = footprint(placing);
    const at = (height) => {
      const p = stage.pointerOnPlane(height * T);
      return p && { x: Math.max(0, Math.min(NX - w, snap(p.x / T - w / 2))), y: Math.max(0, Math.min(NZ - d, snap(p.z / T - d / 2))) };
    };
    if (kindOf(placing.id) === 'top') {
      // plates and food: where you point on the tabletop itself (not on the floor behind the table, which
      // is what the pointer is over once a table is tall or wide). Tallest surfaces first.
      const tops = [...new Set(home.items.filter((o, i) => i !== placing.from && isSurface(FURN[o.id])).map((o) => surfTop(o.id)))].sort((a, b) => b - a);
      for (const h of tops) {
        const s = at(h);
        if (s && surfaceUnder({ ...placing, ...s }, placing.from) === h) { placing.x = s.x; placing.y = s.y; return; }
      }
    }
    const s = at(0);
    if (!s) { placing.x = -1; return; }
    placing.x = s.x; placing.y = s.y;
  }

  /** Hanging something on one of your own walls: which side you're pointing at, and how high and far along. */
  function aimOwnWall(hit, f) {
    let index = -1;
    for (let o = hit.object; o; o = o.parent) if (o.userData.index != null) { index = o.userData.index; break; }
    const wall = home.items[index];
    if (!wall) { placing.x = -1; return; }
    const local = room.group.worldToLocal(hit.point.clone());
    const horiz = wall.r % 2 === 0, l = lenOf(wall);
    // which face: the side of the wall's middle line the pointer is on
    const mid = horiz ? wall.y + 0.125 : wall.x + 0.125, side = (horiz ? local.z : local.x) >= mid ? 1 : -1;
    const face = side > 0 ? mid + 0.125 : mid - 0.125;
    const start = horiz ? wall.x : wall.y;
    const along = Math.max(start, Math.min(start + l - f.w, snap((horiz ? local.x : local.z) - f.w / 2)));
    placing.iw = 1;
    placing.r = horiz ? (side > 0 ? 0 : 2) : (side > 0 ? 1 : 3);
    placing.h = clampHeight(placing, local.y);
    if (horiz) { placing.x = along; placing.y = face; } else { placing.x = face; placing.y = along; }
  }

  /** A door snaps into whichever wall you point at (or near), centred on the pointer along it. */
  function aimDoor() {
    const p = stage.pointerOnPlane(0);
    if (!p) { placing.x = -1; return; }
    const px = p.x / T, pz = p.z / T, fw = FURN[placing.id].w;
    let best = null, bestD = 0.9;
    home.items.forEach((o, i) => {
      if (!isDragWall(o.id) || FURN[o.id].wallH || i === placing.from) return; // (doors go in full-height walls)
      const l = lenOf(o), horiz = o.r % 2 === 0;
      const along = horiz ? px : pz, across = horiz ? pz - (o.y + 0.125) : px - (o.x + 0.125), start = horiz ? o.x : o.y;
      const off = Math.max(0, start - along, along - (start + l));
      const dist = Math.hypot(off, across);
      if (l >= fw && dist < bestD) { bestD = dist; best = o; }
    });
    if (!best) {
      // not near a wall: show it (red) where you're pointing
      Object.assign(placing, { x: Math.max(0, Math.min(NX - fw, snapQ(px - fw / 2))), y: Math.max(0, Math.min(NZ - 0.25, snapQ(pz))), r: 0 });
      return;
    }
    const l = lenOf(best), horiz = best.r % 2 === 0, start = horiz ? best.x : best.y;
    const a = Math.max(start, Math.min(start + l - fw, snapQ((horiz ? px : pz) - fw / 2)));
    Object.assign(placing, horiz ? { x: a, y: best.y, r: 0 } : { x: best.x, y: a, r: 1 });
  }

  /** The quarter-tile grid point under the pointer (in tiles), or null off the floor. */
  function floorPoint() {
    const p = stage.pointerOnPlane(0);
    if (!p) return null;
    return { x: Math.max(0, Math.min(NX, snapQ(p.x / T))), y: Math.max(0, Math.min(NZ, snapQ(p.z / T))) };
  }
  /** Every occupied cell, leaving out one item (the one being moved). */
  function takenCells(skip = -1) {
    const taken = new Set();
    home.items.forEach((o, i) => { if (i !== skip) cellsOf(o).forEach((c) => taken.add(c)); });
    return taken;
  }

  /**
   * Drawing a wall: from the grid point you started on to the one under the pointer, straight along
   * whichever way you've dragged further. A wall covers the quarter-tile "post" at each end, unless
   * another wall already does (so corners and T-joins come out flush, with no gaps and no overlaps).
   */
  function aimWall() {
    const c = floorPoint();
    if (!c) { placing.x = -1; return; }
    const s = placing.start ?? c;
    const q = FURN[placing.id]?.d ?? 0.25; // (a wall's thickness: the square "post" where two walls meet)
    const horiz = Math.abs(c.x - s.x) >= Math.abs(c.y - s.y);
    const taken = takenCells(-1);
    const postTaken = (gx, gy) => taken.has(`floor:${Math.round(gx * SNAP)}:${Math.round(gy * SNAP)}`);
    if (horiz) {
      const y = Math.min(s.y, NZ - q), lo = Math.min(s.x, c.x), hi = Math.max(s.x, c.x);
      let a = lo, b = Math.min(NX, hi + q);
      if (placing.start && postTaken(lo, y)) a = lo + q;
      if (placing.start && hi < NX && postTaken(hi, y)) b = hi;
      Object.assign(placing, { r: 0, x: a, y, l: Math.max(q, b - a), tooShort: b - a < q - 1e-6 });
    } else {
      const x = Math.min(s.x, NX - q), lo = Math.min(s.y, c.y), hi = Math.max(s.y, c.y);
      let a = lo, b = Math.min(NZ, hi + q);
      if (placing.start && postTaken(x, lo)) a = lo + q;
      if (placing.start && hi < NZ && postTaken(x, hi)) b = hi;
      Object.assign(placing, { r: 1, x, y: a, l: Math.max(q, b - a), tooShort: b - a < q - 1e-6 });
    }
    placing.end = c;
  }

  function startPlacing(id, from = -1) {
    placing = { id, r: from >= 0 ? home.items[from].r : 0, dg: from >= 0 ? home.items[from].dg : undefined, from, x: -1, y: -1, valid: false, h: from >= 0 ? heightOf(home.items[from]) : kindOf(id) === 'ceiling' ? 0.4 : WALL_Y };
    if (isDragWall(id)) Object.assign(placing, { l: from >= 0 ? lenOf(home.items[from]) : 0.25, start: null, armed: false });
    if (kindOf(id) === 'wall' && from < 0) placing.r = 0;
    selected = -1;
    buildGhost();
    if (from >= 0) entries[from].group.visible = false;
    sfx('pickup');
    renderAll();
  }

  function stopPlacing() {
    if (placing?.pressed) orbit.fixed = placing.wasFixed;
    if (placing?.from >= 0 && entries[placing.from]) entries[placing.from].group.visible = true;
    placing = null;
    buildGhost();
    renderAll();
  }

  function place() {
    if (!placing?.valid) { sfx('error'); return; }
    const it = { id: placing.id, x: placing.x, y: placing.y, r: placing.r, ...(placing.dg ? { dg: 1 } : {}) };
    if (kindOf(placing.id) !== 'floor' && kindOf(placing.id) !== 'rug') it.h = placing.h;
    if (isDragWall(placing.id)) it.l = placing.l;
    if (placing.iw) it.iw = 1;
    if (placing.from >= 0 && home.items[placing.from].c) it.c = home.items[placing.from].c;
    if (placing.from >= 0 && home.items[placing.from].lk) it.lk = 1;
    if (placing.from >= 0) home.items[placing.from] = it;
    else home.items.push(it);
    selected = placing.from >= 0 ? placing.from : home.items.length - 1;
    placing = null;
    buildGhost();
    commit('place');
    if (entries[selected]) entries[selected].bounce = 0;
  }

  /** Put up the wall being drawn, then carry straight on: clicking chains the next wall from where this
   *  one ended; dragging starts afresh with the next press. */
  function placeWall(chain) {
    if (!placing?.valid) { sfx('error'); return; }
    const { id, end } = placing;
    if (placedCount(id) >= owned(id)) { toast(`That's the most walls a house can have (${owned(id)}).`, 'error'); stopPlacing(); return; }
    home.items.push({ id, x: placing.x, y: placing.y, r: placing.r, l: placing.l });
    commit('place');
    entries[entries.length - 1].bounce = 0;
    Object.assign(placing, { start: chain ? end : null, armed: chain, x: -1, valid: false });
    aimPlacement();
    updateGhost();
    renderAll();
  }

  /** Esc / right-click while drawing walls: let go of the wall in progress, then stop altogether. */
  function cancelWall() {
    if (placing && isDragWall(placing.id) && placing.from < 0 && placing.start) {
      if (placing.pressed) orbit.fixed = placing.wasFixed;
      Object.assign(placing, { start: null, armed: false, pressed: false });
      aimPlacement(); updateGhost(); renderAll();
      return;
    }
    stopPlacing();
  }

  function rotate() {
    if (edit && tab === 'outside') { if (extPage === 'yard' && yardPick) { yardTurn = (yardTurn + 1) % 4; sfx('rotate'); moveYardGhost(); } return; }
    if (placing) {
      if ((isDragWall(placing.id) && placing.from < 0) || isDoor(placing.id)) return; // (drawn walls go whichever way you drag; doors go along their wall)
      if (kindOf(placing.id) !== 'wall') { Object.assign(placing, nextTurn(placing)); sfx('rotate'); updateGhost(); }
      return;
    }
    if (selected < 0) return;
    const it = home.items[selected];
    if (kindOf(it.id) === 'wall') return;
    const next = { ...it, ...nextTurn(it) };
    if (!next.dg) delete next.dg;
    const taken = new Set();
    home.items.forEach((o, i) => { if (i !== selected) cellsOf(o).forEach((c) => taken.add(c)); });
    if (!fits(next) || cellsOf(next, true).some((c) => taken.has(c)) || blocksDoor(next)) { sfx('error'); toast('No room to turn it there.', 'error'); return; }
    home.items[selected] = next;
    commit('rotate');
  }

  /** Move a wall decoration up/down the wall, or let a hanging thing down further / pull it up. */
  function nudgeHeight(dir) {
    const step = 0.25;
    if (placing) {
      if (kindOf(placing.id) === 'floor' || kindOf(placing.id) === 'rug') return;
      placing.h = clampHeight(placing, heightOf(placing) + (kindOf(placing.id) === 'ceiling' ? -dir : dir) * step);
      sfx('rotate');
      updateGhost();
      return;
    }
    if (selected < 0) return;
    const it = home.items[selected];
    if (kindOf(it.id) === 'floor' || kindOf(it.id) === 'rug') return;
    const next = { ...it, h: clampHeight(it, heightOf(it) + (kindOf(it.id) === 'ceiling' ? -dir : dir) * step) };
    if (next.h === heightOf(it)) { sfx('error'); return; }
    const taken = new Set();
    home.items.forEach((o, i) => { if (i !== selected) cellsOf(o).forEach((c) => taken.add(c)); });
    if (!fits(next) || cellsOf(next, true).some((c) => taken.has(c))) { sfx('error'); toast('Something is in the way.', 'error'); return; }
    home.items[selected] = next;
    commit('rotate');
  }

  /** Make the selected wall a quarter tile longer or shorter (from its far end). */
  function resizeWall(dir) {
    if (selected < 0) return;
    const it = home.items[selected];
    if (!isDragWall(it.id)) return;
    const next = { ...it, l: Math.max(0.25, lenOf(it) + dir / 4) };
    if (next.l === lenOf(it) || !fits(next) || cellsOf(next, true).some((c) => takenCells(selected).has(c)) || blocksDoor(next)) { sfx('error'); return; }
    home.items[selected] = next;
    commit('rotate');
  }

  function storeSelected() {
    if (selected < 0) return;
    home.items.splice(selected, 1);
    selected = -1;
    commit('store');
  }

  /** Apply a local change: rebuild, save (debounced) and refresh the side panel. */
  function commit(sound) {
    if (sound) sfx(sound);
    const walls = roomWallCells(home.items);
    const orphans = home.items.filter((it) => (isDoor(it.id) && !inWall(it, walls)) || (it.iw && wallHost(it, home.items) < 0));
    if (orphans.length) {
      const sel = home.items[selected];
      home.items = home.items.filter((it) => !orphans.includes(it));
      selected = sel ? home.items.indexOf(sel) : -1;
      toast(`📦 Put away ${orphans.length > 1 ? `${orphans.length} things` : 'something'} that wasn't on or in a wall any more.`);
    }
    if (seated) standUp();
    rebuildItems();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = 0;
      echoes += 1;
      net.send('house_save', payload());
    }, 350);
    renderAll();
  }

  const SELECT_OUT = new THREE.MeshBasicMaterial({ color: '#ffd84d', side: THREE.BackSide });
  SELECT_OUT.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * 0.045;');
  };
  function renderSelection() {
    entries.forEach((e, i) => {
      e.group.traverse((o) => {
        if (!o.userData.outline) return;
        o.userData.baseMat ??= o.material;
        o.material = i === selected ? SELECT_OUT : o.userData.baseMat;
      });
    });
  }

  function pickItem() {
    const hit = stage.pick(room.items.children).find((h) => h.object.visible && !h.object.userData.outline && !h.object.isSprite);
    for (let o = hit?.object; o; o = o.parent) if (o.userData.index != null) return o.userData.index;
    return -1;
  }

  // ---- input -------------------------------------------------------------------------

  stage.onPointer = (type, e, d) => {
    if (!edit) { walkPointer?.(type, e, d); return; }
    if (!home || !canEdit()) return;
    if (tab === 'outside') { outsidePointer(type, e, d); return; }
    if (tab === 'paint') { paintPointer(type, e, d); return; }
    // drawing a wall: press where it starts and drag to where it ends (or click the start, then the end).
    // The camera holds still while you drag.
    if (placing && isDragWall(placing.id) && placing.from < 0) {
      if (type === 'down' && e.button === 0) {
        const pt = floorPoint();
        if (!pt) return;
        if (!placing.start) { placing.start = pt; placing.armed = false; renderAll(); }
        placing.pressed = true;
        placing.wasFixed = orbit.fixed;
        orbit.fixed = true;
        aimPlacement(); updateGhost();
        return;
      }
      if (type === 'up' && placing.pressed) {
        placing.pressed = false;
        orbit.fixed = placing.wasFixed;
        aimPlacement(); updateGhost();
        // (each wall is its own, unless Chain Placement is on: then the next one starts where this one ended)
        if (d?.moved) placeWall(chainWalls);
        else if (placing.armed) placeWall(chainWalls);
        else placing.armed = true;
        return;
      }
      if (type === 'up' && d && !d.moved && d.button === 2) { cancelWall(); return; }
    }
    if (type === 'down' && e.button === 0 && !placing && !paintMode) {
      const idx = pickItem();
      if (idx >= 0) { grab = { idx, wasFixed: orbit.fixed }; orbit.fixed = true; } // (hold still: you're holding it)
    }
    if (type === 'move' && grab && d?.moved && !placing && home.items[grab.idx]) {
      startPlacing(home.items[grab.idx].id, grab.idx);
      placing.dragging = true;
    }
    if (type === 'up' && grab) {
      orbit.fixed = grab.wasFixed;
      grab = null;
      if (placing?.dragging) {
        // let go: it lands where you dropped it (or stays in your hand if it can't go there)
        placing.dragging = false;
        aimPlacement(); updateGhost(); place();
        return;
      }
    }
    if (type === 'move' && placing) { aimPlacement(); updateGhost(); }
    if (paintMode && brush && !placing && tab === 'style' && PAINTABLE.has(stylePage) && type === 'up' && d && !d.moved && d.button === 0) { paintAt(); return; }
    if (trimMode && trimBrush && !placing && tab === 'style' && stylePage === 'trim' && type === 'up' && d && !d.moved && d.button === 0) { trimAt(); return; }
    if (type !== 'up' || !d || d.moved) return;
    if (d.button === 2) { rotate(); return; }
    if (placing) { aimPlacement(); updateGhost(); place(); return; }
    const idx = pickItem();
    selected = idx === selected ? -1 : idx;
    partSel = null;
    if (idx >= 0) { sfx('pickup', { vol: 0.5 }); entries[idx].bounce = 0; }
    renderSelection();
    renderAll();
  };
  stage.onKey = (e, down) => {
    if (!down) return;
    const k = e.key.toLowerCase();
    // once you sit down you stay put until you press E again
    if (seated && k === 'e' && !e.repeat && !stage.near) { standUp(); return; } // (if nothing else caught the E)
    if (k === 'g' && !e.repeat && !edit && !e.target?.closest?.('input, textarea')) { setRiding(!riding); return; }
    if (edit && canEdit() && !e.target?.closest?.('input, textarea')) { // (builders too; never while you're typing)
      if (k === 'r') { stage.keys.delete('r'); if (!e.repeat) rotate(); } // R turns furniture instead of the camera
      else if (k === 't' && !e.repeat && placing && isDragWall(placing.id)) { chainWalls = !chainWalls; sfx('click'); renderAll(); }
      else if (k === ']' || k === 'pageup') nudgeHeight(1);
      else if (k === '[' || k === 'pagedown') nudgeHeight(-1);
      else if ((k === 'delete' || k === 'backspace') && selected >= 0 && tab !== 'outside') { e.preventDefault(); storeSelected(); }
    }
  };
  // Escape cancels placing/selection before it would close the house
  const onEscape = (e) => {
    if (e.key === 'Tab' && edit && !e.target.closest?.('input, textarea')) { e.preventDefault(); sideOpen = !sideOpen; if (sideOpen && tab === 'visit') tab = 'items'; renderAll(); return; }
    if (e.key !== 'Escape' || !(placing || selected >= 0 || sideOpen)) return;
    e.stopPropagation();
    if (paintMode) { paintMode = false; brush = null; renderAll(); }
    else if (placing) cancelWall();
    else if (selected >= 0) { selected = -1; renderSelection(); renderAll(); }
    else { sideOpen = false; if (edit) setEdit(false); renderAll(); }
  };
  window.addEventListener('keydown', onEscape, true);

  // ---- HUD ------------------------------------------------------------------------------

  function renderAll() {
    renderHeader();
    // while you're placing something the panels get out of the way, so you can see the whole room
    side.classList.toggle('hidden', !sideOpen || !!placing || roofing());
    $h('.house-bar').classList.toggle('hidden', !!placing);
    // what you're holding, a big Cancel, and (for walls) whether the next one carries on from this one
    const holding = placing ? FURN[placing.id]?.name : roofing() ? `${CATALOG.roofShapes.find((x) => x.id === roofBrush.s)?.name ?? ''} Roof` : edit && tab === 'outside' && extPage === 'yard' && yardPick && !yardErase ? CATALOG.yardItems.find((y) => y.id === yardPick)?.name : null;
    const pb = $h('.place-bar');
    pb.classList.toggle('hidden', !holding);
    if (holding) pb.innerHTML = `<small>${esc(holding)}</small><div><button class="pb-cancel" data-cancel>Cancel</button>${placing && isDragWall(placing.id) && placing.from < 0 ? `<button class="pb-chain ${chainWalls ? 'on' : ''}" data-chain>Chain<br>Placement (T)</button>` : ''}</div>`;
    side.classList.toggle('wide', sideOpen && tab !== 'visit');
    if (sideOpen) { renderTabs(); renderPanel(); }
    hint.innerHTML = !home ? 'Knocking on the door…'
      : edit && tab === 'paint' ? '🎨 <b>Click</b> anything to pick it (a wall, a roof, a path, furniture), then choose a colour or a material in the menu · drag to look around'
      : edit && tab === 'outside' ? outsideHint()
      : placing && isDragWall(placing.id) && placing.from < 0 ? (placing.start
        ? `Drag (or move and click) to where the wall ends · walls that meet join up flush · <kbd>Esc</kbd> to let go`
        : `Press on your plot where the wall starts and drag it out to any length (or click the start, then the end) · each wall is its own, so start the next one wherever you like · <kbd>Esc</kbd> when you're done`)
      : paintMode && brush && tab === 'style' && PAINTABLE.has(stylePage) ? `🪣 Click ${stylePage === 'wall' ? 'a wall' : 'inside a room'} to paint it · <kbd>Esc</kbd> to stop`
      : placing && isDoor(placing.id) ? 'Point at a wall you\'ve built and click to put the door in it · <kbd>Esc</kbd> to cancel'
      : placing ? `Click to place · <kbd>R</kbd>/right-click to rotate · <kbd>Esc</kbd> to cancel${kindOf(placing.id) === 'wall' ? ' · point anywhere on a wall (the house\'s or either side of one you\'ve built), as high or low as you like' : kindOf(placing.id) === 'ceiling' ? ' · it hangs above the green square · <kbd>[</kbd> <kbd>]</kbd> lower / raise it' : ''}`
        : edit ? 'Click furniture to select it · <kbd>R</kbd> rotate · <kbd>Del</kbd> put away · drag to turn the camera'
          : mine() && !home.items.length ? '🏗️ This is your plot. Press <b>Build mode</b> and draw some walls to start your house!'
            : 'Walk around with <kbd>WASD</kbd> · doors open as you walk up · <kbd>E</kbd> uses furniture · <kbd>G</kbd> rides your mount · stroll down the street to visit the neighbours';
    // the tips bar can be closed (✕) and brought back with the ❔ button up top; it stays how you left it
    hint.insertAdjacentHTML('beforeend', '<button class="hint-x" data-hint="0" title="Hide these tips">✕</button>');
    hint.classList.toggle('hidden', hintOff);
  }
  let hintOff = false;
  try { hintOff = localStorage.getItem('fz.houseHint') === 'off'; } catch { /* no storage */ }
  stage.hud.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-hint]');
    if (!t) return;
    hintOff = t.dataset.hint === '0';
    try { localStorage.setItem('fz.houseHint', hintOff ? 'off' : 'on'); } catch { /* no storage */ }
    renderAll();
  });

  function renderHeader() {
    const p = S.players[viewKey];
    const name = mine() ? 'My House' : `${esc(p?.name ?? '?')}'s House`;
    side.classList.toggle('slim', sideOpen && tab === 'outside');
    titleEl.innerHTML = `${iconSvg('house')} ${name}`;
    stage.title.innerHTML = `${iconSvg('house')} ${name}`;
    const likes = home?.likes ?? [];
    const liked = likes.includes(S.me);
    actions.innerHTML = [
      `<span class="pill" data-clock title="The same clock as the town: night falls here too">${clockText()}</span>`,
      `<span class="pill">❤️ ${likes.length}</span>`,
      !mine() ? `<button class="btn small ${liked ? '' : 'primary'}" data-like ${liked ? 'disabled' : ''}>${liked ? '❤️ Liked' : '🤍 Like'}</button>` : '',
      canEdit() ? `<button class="btn small ${edit ? 'primary' : ''}" data-edit>${edit ? '✅ Done' : mine() ? '🔨 Build mode' : '🔨 Build here'}</button>` : '',
      edit ? `<button class="btn small" data-menu title="Tab">${sideOpen ? '⬅ Hide menu' : '📋 Menu'}</button>` : '',
      `<button class="btn small ${sideOpen && tab === 'visit' ? 'primary' : ''}" data-visits>🏘️ Neighbours</button>`,
      !mine() ? '<button class="btn small" data-home>🏡 My house</button>' : '',
      hintOff ? '<button class="btn small" data-hint="1" title="Show the tips again">❔</button>' : '',
      !edit && (S.players[S.me]?.look?.mount ?? 'mount_none') !== 'mount_none' ? `<button class="btn small ${riding ? 'primary' : ''}" data-ride title="G">🐴 ${riding ? 'Get off' : 'Ride'}</button>` : '',
    ].join('');
  }

  function renderTabs() {
    // (building in a friend's house: their items and styles, but buying is up to them)
    const list = [['visit', '🏘️ Neighbours'], ...(mine() ? [['items', '🛋️ Build'], ['paint', '🎨 Paint'], ['style', '🖼️ Inside'], ['outside', '🏡 Outside'], ['shop', '🛒 Shop'], ['plots', '💾 Houses']] : canEdit() ? [['items', '🛋️ Build'], ['paint', '🎨 Paint'], ['style', '🖼️ Inside'], ['outside', '🏡 Outside'], ['shop', '🛒 Shop']] : [])]; // (builders: everything but your saved houses)
    if (!list.some(([id]) => id === tab)) tab = 'visit';
    tabsEl.innerHTML = list.map(([id, label]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${label}</button>`).join('');
  }

  function renderPanel() {
    if (!sideOpen) return;
    if (tab === 'visit') return renderVisit();
    if (tab === 'items') return renderItems();
    if (tab === 'shop') return renderShop();
    if (tab === 'plots') return renderPlots();
    if (tab === 'outside') return renderOutside();
    if (tab === 'paint') return renderPaint();
    return renderStyle();
  }
  /** Saved houses: save the one you're in as a design, swap another one in, rename or delete them. */
  let slots = null;
  function renderPlots() {
    if (!slots) { panel.innerHTML = '<h3>💾 Saved houses</h3><p class="muted">Loading…</p>'; net.send('house_slots'); return; }
    panel.innerHTML = `<h3>💾 Saved houses</h3>
      <div class="row"><button class="btn small ghost" data-x="bulldoze">🧹 Clear the plot (everything back in your inventory)</button></div>
      <p class="muted small">Save the house you're in as a design, then build something new and switch between them whenever you like. Saving doesn't use up furniture: each design uses the things you own.</p>
      <div class="row"><input class="plot-name item-search" maxlength="24" placeholder="Name this house (e.g. Cosy Cabin)"><button class="btn primary small" data-slot-save="new">💾 Save as new</button></div>
      <div class="plot-list">${slots.length ? slots.map((sl, i) => `<div class="plot-row">
        <span class="plot-ico">🏠</span><span class="plot-name-t"><b>${esc(sl.name)}</b><small class="muted">🛋️ ${sl.n} things</small></span>
        <button class="btn small primary" data-slot-load="${i}">Move in</button>
        <button class="btn small" data-slot-save="${i}" title="Save the house you're in over this one">Overwrite</button>
        <button class="btn small ghost" data-slot-del="${i}" title="Delete">🗑️</button></div>`).join('') : '<p class="muted">No saved houses yet.</p>'}</div>`;
  }

  function renderVisit() {
    const list = Object.values(S.players).sort((a, b) => (b.key === S.me) - (a.key === S.me) || (b.house?.likes ?? 0) - (a.house?.likes ?? 0) || a.name.localeCompare(b.name));
    // (who's at whose house: everyone on the street whose feet are on that plot)
    const here = (k) => [...stage.people.values()].filter((q) => { const h = view.toHood(q.x, q.z); return hood.ownerAt(h.x, h.z) === k; }).length;
    panel.innerHTML = `<div class="visit-list">${list.map((p) => `
      <button class="visit-row ${p.key === viewKey ? 'on' : ''}" data-visit="${esc(p.key)}">
        <span class="vav"></span>
        <span class="vname"><b>${esc(p.name)}${p.key === S.me ? ' <small>(you)</small>' : ''}</b>
          <small>🛋️ ${p.house?.n ?? 0} · ❤️ ${p.house?.likes ?? 0}${here(p.key) ? ` · <span class="win">${here(p.key)} there</span>` : ''}</small></span>
        ${mine() && viewKey === S.me && p.key !== S.me ? `<span class="vbuild ${(home?.builders ?? []).includes(p.key.toLowerCase()) ? 'on' : ''}" data-builder="${esc(p.key)}" title="Tap to let them build in your house, tap again to stop them">🔨 ${(home?.builders ?? []).includes(p.key.toLowerCase()) ? 'Can build ✓' : 'Let build'}</span>` : ''}
        <span class="vgo">${p.key === viewKey ? 'Here' : 'Go →'}</span>
      </button>`).join('')}</div>
      ${mine() ? '<p class="muted small">Every house is on this street: walk over, or tap <b>Go →</b> to pop up on their front path. 🔨 <b>Let build</b> lets a friend decorate your house with your furniture. Tap again to take it away.</p>' : (home?.builders ?? []).includes(S.me) ? '<p class="muted small">🔨 You can build here! Press <b>Build here</b> up top.</p>' : ''}`;
    panel.querySelectorAll('[data-visit]').forEach((el) => portraitInto(el.querySelector('.vav'), S.players[el.dataset.visit]?.look, 40, 40, { zoom: 'head' }));
  }

  function placedCount(id) {
    return home ? home.items.filter((it, i) => it.id === id && !(placing && placing.from === i)).length : 0;
  }

  function itemTile(f) {
    const left = owned(f.id) - placedCount(f.id);
    return `<button class="furni ${left ? '' : 'used'}" data-place="${f.id}" ${left ? '' : 'disabled'} title="${esc(f.name)}">
      <span class="fem">${furniImg(f.id)}</span><span class="fname">${esc(f.name)}</span><span class="fcount">${f.free ? (f.drag ? 'Free · drag to draw' : 'Free') : `${left}/${owned(f.id)} left`}</span></button>`;
  }
  /** The owned pieces matching the filters and search, shelved by set (with jump buttons). */
  function itemGridHtml() {
    const q = itemSearch.trim().toLowerCase();
    const list = CATALOG.furniture.filter((f) => owned(f.id) > 0 && !(f.retired && !f.variant && !placedCount(f.id)) && itemMatches(f)
      && (itemSet === 'all' || (f.set ?? 'Classics') === itemSet) && (!q || f.name.toLowerCase().includes(q) || (f.set ?? '').toLowerCase().includes(q)))
      .sort((a, b) => !!b.free - !!a.free);
    if (!list.length) return q ? `<p class="muted">Nothing called “${esc(itemSearch)}”.</p>` : '<p class="muted">Nothing yet! Buy furniture in the Shop, or win trophies around the zone.</p>';
    const setOf = (f) => f.set ?? 'Classics', label = (g) => SET_LABEL[g] ?? esc(g);
    return itemSet === 'all' && !q ? shelves(list, setOf, itemTile, label) : `<div class="furni-grid">${list.map(itemTile).join('')}</div>`; // (the set buttons above are the shortcuts)
  }

  function renderItems() {
    const sel = selected >= 0 ? home?.items[selected] : null;
    // the sets you own something from, for the quick filter chips
    const sets = [...new Set(CATALOG.furniture.filter((f) => owned(f.id) > 0 && itemMatches(f)).map((f) => f.set ?? 'Classics'))];
    if (itemSet !== 'all' && !sets.includes(itemSet)) itemSet = 'all';
    panel.innerHTML = `
      ${sel ? `<div class="sel-box"><span class="sel-em">${furniImg(sel.id)}</span><b>${esc(FURN[sel.id].name)}</b>
        <div class="row"><button class="btn small" data-act="rotate" ${kindOf(sel.id) === 'wall' ? 'disabled' : ''}>⟳ Rotate</button>
        ${kindOf(sel.id) === 'wall' || kindOf(sel.id) === 'ceiling' ? '<button class="btn small" data-act="up" title="[ ]">▲ Up</button><button class="btn small" data-act="down" title="[ ]">▼ Down</button>' : ''}
        ${isDragWall(sel.id) ? `<button class="btn small" data-act="shorter">− Shorter</button><button class="btn small" data-act="longer">＋ Longer</button><span class="muted small">${lenOf(sel)} tiles</span>` : ''}
        <button class="btn small" data-act="move">✥ Move</button><button class="btn small" data-act="store">⬇ Put away</button></div>
        ${FURN[sel.id].text ? `<div class="wd-label">✏️ What it says <small class="muted">(new line or | for each line)</small></div><textarea class="menu-text" maxlength="90" rows="3" placeholder="MENU|Pizza 12|Pasta 10">${esc(sel.t ?? '')}</textarea>` : ''}
        ${canRecolor(FURN[sel.id]) && furnitureParts(sel.id).length > 1 ? `<div class="wd-label">🧩 Colour a part <small class="muted">(pick one, then a colour)</small></div><div class="part-chips"><button type="button" class="part-chip ${partSel ? '' : 'on'}" data-part="">Whole thing</button>${furnitureParts(sel.id).map((p, i) => `<button type="button" class="part-chip ${partSel === p.key ? 'on' : ''}" data-part="${p.key}" title="Part ${i + 1}"><span style="--c:${sel.cp?.[p.key] ?? p.color}"></span>Part ${i + 1}</button>`).join('')}</div>` : ''}
        ${canRecolor(FURN[sel.id]) ? `<div class="wd-label">🎨 Colour</div><div class="swatches palette"><button type="button" class="swatch orig ${sel.c ? '' : 'on'}" data-recolor="" title="Original colour">↺</button>${CATALOG.clothColors.map((c) => `<button type="button" class="swatch ${sel.c === c ? 'on' : ''}" data-recolor="${c}" style="--c:${c}"></button>`).join('')}</div>` : ''}</div>` : ''}
      ${pageStrip(ITEM_FILTERS, itemFilter, 'item-filter')}
      <input class="item-search" type="search" placeholder="🔍 Search your items…" value="${esc(itemSearch)}">
      ${sets.length > 1 ? `<div class="shelf-jump item-sets"><button class="${itemSet === 'all' ? 'on' : ''}" data-item-set="all">Everything</button>${sets.map((g) => `<button class="${itemSet === g ? 'on' : ''}" data-item-set="${esc(g)}">${SET_LABEL[g] ?? esc(g)}</button>`).join('')}</div>` : ''}
      <p class="muted small">Pick something to place it:</p>
      <div class="item-grid">${itemGridHtml()}</div>`;
    const mt = panel.querySelector('.menu-text');
    if (mt) mt.onchange = () => { const it = { ...home.items[selected] }; const v = mt.value.trim().slice(0, 90); if (v) it.t = v; else delete it.t; home.items[selected] = it; commit('paint'); };
    const search = panel.querySelector('.item-search');
    search.oninput = () => { itemSearch = search.value; panel.querySelector('.item-grid').innerHTML = itemGridHtml(); }; // (only the grid: typing keeps focus)
  }

  function shopTile(item, kind) {
    const have = owned(item.id);
    const deco = kind !== 'furni';
    const max = deco ? 1 : item.max ?? 10;
    let foot;
    if (item.exclusive) foot = have ? 'Owned ✓' : '∞ · admins only';
    else if (item.claw) foot = have ? `Owned ${have}` : '🕹️ Win it from the claw!';
    else if (item.free) foot = 'Free';
    else if (item.price) foot = have >= max ? (deco ? 'Owned' : `Max ${max}`) : confirmBuy === item.id ? `Buy for ${fmt(item.price)}?` : `🪙 ${fmt(item.price)}${deco ? ' · tap to try' : ''}`;
    else foot = have ? 'Owned ✓' : item.unlock ? `🔒 ${esc(item.unlock.hint)}` : item.drop ? `👾 Beat the ${esc(item.drop)}` : '';
    const emoji = deco ? `<span class="fem swatch-em" style="${decoBg(item.id)}"></span>` : `<span class="fem">${furniImg(item.id)}</span>`;
    const buyable = item.price && have < max;
    return `<button class="furni ${buyable ? '' : 'locked'} ${confirmBuy === item.id ? 'confirm' : ''} ${isTrying(item.id) ? 'previewing' : ''}" ${buyable ? `data-buy="${item.id}"` : ''} ${buyable && deco ? `data-kind="${kind}"` : ''} title="${esc(item.name)}">
      ${emoji}<span class="fname">${esc(item.name)}</span><span class="fcount">${!deco && have ? `own ${have} · ` : ''}${foot}</span></button>`;
  }

  // The shop and the style picker are split into pages (a strip of buttons along the top). Furniture is
  // shelved by matching set; floors, wallpapers and ceilings by kind (solid colours, wood, tiles…).
  const SHOP_PAGES = [['furniture', '🛋️ Furniture'], ['rooms', '🧱 Walls & doors'], ['wall', '🖼️ Wallpaper'], ['floor', '🟫 Floors'], ['ceiling', '☁️ Ceilings'], ['earn', '🏆 Earn']];
  const STYLE_PAGES = [['wall', '🖼️ Wall finishes'], ['floor', '🟫 Floors'], ['ceiling', '☁️ Ceilings'], ['trim', '🪵 Trim']];
  const ITEM_FILTERS = [['all', 'All'], ['furniture', '🛋️ Furniture'], ['top', '🍽️ On tables'], ['decor', '🖼️ Wall decor'], ['ceiling', '💡 Ceiling'], ['rooms', '🧱 Walls & doors']];
  const itemMatches = (f) => itemFilter === 'all' || (itemFilter === 'rooms' ? f.set === 'Rooms'
    : f.set !== 'Rooms' && (itemFilter === 'decor' ? kindOf(f.id) === 'wall' : itemFilter === 'ceiling' ? kindOf(f.id) === 'ceiling' : itemFilter === 'top' ? kindOf(f.id) === 'top' : kindOf(f.id) === 'floor'));
  const SET_LABEL = {
    Classics: '🛋️ Classics', Sweetheart: '💗 Sweetheart set', Rustic: '🪵 Rustic set', Modern: '🤍 Modern set', Nature: '🌿 Nature set',
    Plants: '🪴 Plants', Bathroom: '🛁 Bathroom', Gamer: '🎮 Gamer set', Lights: '💡 Lights & ceiling', 'Wall decor': '🖼️ Wall decor', Rooms: '🧱 Walls & doorways',
    Plushies: '🧸 Claw machine plushies', Tabletop: '🍽️ Plates, food & tabletop', Curtains: '🪟 Curtains', Restaurant: '🍷 Restaurant', Rugs: '🟫 Rugs & carpets', Desks: '🖥️ Desks', Beds: '🛏️ Beds', Kitchen: '🍽️ Kitchen & dining', 'Kitchen white': '🗄️ Kitchen cabinets', 'Kitchen oak': '🪵 Oak kitchen', 'Kitchen mint': '🌿 Mint kitchen', 'Kitchen black': '🖤 Black & gold kitchen', Ocean: '🌊 Ocean set', Sunshine: '🌻 Sunshine set', Midnight: '🌙 Midnight set', Mint: '🌿 Mint set',
  };
  const DECO_LISTS = { floor: CATALOG.floors, wall: CATALOG.walls, ceiling: CATALOG.ceilings, door: CATALOG.doors };
  let shopPage = 'furniture', stylePage = 'wall', itemFilter = 'all', itemSet = 'all', itemSearch = '';
  const shelfId = (g) => `shelf-${String(g).replace(/\W+/g, '')}`;
  /** Items grouped into labelled shelves, in the order the groups first appear. */
  function shelves(list, groupOf, tile, label = (g) => esc(g), grid = 'furni-grid') {
    const groups = [...new Set(list.map(groupOf))];
    return groups.map((g) => `<div class="wd-label shelf-label" id="${shelfId(g)}">${label(g)}</div>
      <div class="${grid}">${list.filter((x) => groupOf(x) === g).map(tile).join('')}</div>`).join('')
      + (groups.length > 1 ? '<div class="shelf-end"></div>' : ''); // (room below, so even the last shelf can jump to the top)
  }
  const pageStrip = (pages, cur, attr) => `<div class="shop-pages">${pages.map(([id, label]) => `<button class="${cur === id ? 'on' : ''}" data-${attr}="${id}">${label}</button>`).join('')}</div>`;
  /** Little buttons that jump down to each shelf on the page. */
  const jumpStrip = (groups, label = (g) => esc(g)) => (groups.length > 1
    ? `<div class="shelf-jump">${groups.map((g) => `<button data-jump="${shelfId(g)}">${label(g)}</button>`).join('')}</div>` : '');

  function renderShop() {
    const setOf = (f) => f.set ?? 'Classics';
    let body = '';
    if (shopPage === 'furniture' || shopPage === 'rooms') {
      const list = CATALOG.furniture.filter((f) => (f.price || f.free) && !f.retired && (shopPage === 'rooms') === (f.set === 'Rooms'));
      const label = (g) => SET_LABEL[g] ?? esc(g);
      body = (shopPage === 'rooms' ? '<p class="muted small">Walls are <b>free</b>: pick 🧱 Wall in 🛋️ Build and drag it across your plot to any length. Doors go into walls you\'ve built.</p>' : '')
        + jumpStrip([...new Set(list.map(setOf))], label) + shelves(list, setOf, (f) => shopTile(f, 'furni'), label);
    } else if (shopPage === 'earn') {
      body = `<p class="muted small">Trophies and prizes you win around the zone.</p><div class="furni-grid">${CATALOG.furniture.filter((f) => !f.price && !f.free && !f.retired).map((f) => shopTile(f, 'furni')).join('')}</div>`;
    } else {
      const list = DECO_LISTS[shopPage].filter((d) => !d.free);
      const groupOf = (d) => d.group ?? 'More';
      body = '<p class="muted small">Tap one to try it on in your house before you buy it.</p>' + jumpStrip([...new Set(list.map(groupOf))]) + shelves(list, groupOf, (d) => shopTile(d, shopPage));
    }
    panel.innerHTML = `${pageStrip(SHOP_PAGES, shopPage, 'shop-page')}<p class="muted small">You have <b>${fmt(me().coins)}</b> 🪙</p>${previewBar()}${body}`;
  }

  /** "Trying on …" bars for anything you're previewing, with buy and put-back buttons. */
  function previewBar() {
    const all = [...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings, ...CATALOG.doors];
    return Object.entries(preview).map(([field, id]) => {
      const pd = all.find((x) => x.id === id);
      return pd ? `<div class="preview-bar"><span>👀 Trying on <b>${esc(pd.name)}</b> ${field === 'floor' ? 'floor' : field === 'ceiling' ? 'ceiling' : field === 'door' ? 'door' : 'wallpaper'}</span>
        <button class="btn primary small" data-preview-buy="${field}">Buy · 🪙 ${fmt(pd.price)}</button><button class="btn ghost small" data-preview-stop="${field}">Put back</button></div>` : '';
    }).join('');
  }

  function renderStyle() {
    const opt = (field) => (d) => `
      <button class="style-opt ${(PAINTABLE.has(field) && paintMode ? brush === d.id : home?.[field] === d.id && !preview[field]) ? 'on' : ''} ${isTrying(d.id) ? 'previewing' : ''} ${ownsDeco(d) ? '' : 'locked'}" data-style="${field}:${d.id}" title="${esc(d.name)}">
        <span class="style-sw" style="${decoBg(d.id)}"></span><span>${esc(d.name)}</span>
        <small>${ownsDeco(d) ? (home?.[field] === d.id ? '✓ Using' : 'Owned') : isTrying(d.id) ? '👀 Trying on' : `🪙 ${fmt(d.price)}`}</small></button>`;
    let body;
    if (stylePage === 'trim') {
      // the baseboards and the tops of half walls, all in one colour (free)
      const cur = home?.trim ?? TRIM_DEFAULT;
      const n = Object.keys(home?.trimp ?? {}).length;
      body = `<p class="muted small">The baseboards and the tops of half walls: any colour, or <b>No trim</b> to take them off altogether. Free to change any time. (The trim outside is under 🏡 Outside.)</p>
        <div class="row"><button class="btn small ${trimMode ? '' : 'primary'}" data-trim-mode="all">🏠 Whole house</button><button class="btn small ${trimMode ? 'primary' : ''}" data-trim-mode="wall">🖌️ One wall at a time</button>
        ${n ? `<button class="btn small ghost" data-trim-mode="clear">↺ Clear ${n} wall trim${n > 1 ? 's' : ''}</button>` : ''}</div>
        <p class="muted small">${trimMode ? (trimBrush ? 'Now click a wall to give it this trim (pick the whole-house colour to put it back).' : 'Pick a colour, then click the walls of a room.') : 'Picks the trim for every wall.'}</p>
        <div class="trim-grid"><button class="trim-opt ${(trimMode ? trimBrush : cur) === 'none' ? 'on' : ''}" data-trim="none" title="No trim at all"><span class="no-trim"></span>No trim</button>${CATALOG.trimColors.map((t) => `<button class="trim-opt ${(trimMode ? trimBrush : cur) === t.c ? 'on' : ''}" data-trim="${t.c}" title="${esc(t.name)}"><span style="--c:${t.c}"></span>${esc(t.name)}</button>`).join('')}</div>`;
    } else if (stylePage === 'size') {
      // room size: any width and depth up to the biggest house upgrade you own
      const [mw, md] = maxSize(), [sw, sd] = home?.size ?? [14, 14];
      const stepper = (axis, v, max) => `<span class="size-step"><button class="btn small" data-size="${axis}:-1" ${v <= MIN_SIZE ? 'disabled' : ''}>−</button><b>${v}</b><button class="btn small" data-size="${axis}:1" ${v >= max ? 'disabled' : ''}>+</button></span>`;
      const sizeTiles = CATALOG.houseSizes.filter((z) => !z.free).map((z) => {
        const have = owned(z.id) > 0;
        return `<button class="furni ${have ? 'locked' : ''} ${confirmBuy === z.id ? 'confirm' : ''}" ${have ? '' : `data-buy="${z.id}"`}>
          <span class="fem size-em">🏠<small>${z.w}×${z.d}</small></span><span class="fname">${esc(z.name)}</span>
          <span class="fcount">${have ? 'Owned ✓' : confirmBuy === z.id ? `Buy for ${fmt(z.price)}?` : `🪙 ${fmt(z.price)}`}</span></button>`;
      }).join('');
      body = `<div class="size-pick"><span>Width ${stepper('w', sw, mw)}</span><span>Depth ${stepper('d', sd, md)}</span></div>
        <p class="muted small">Your house can be up to <b>${mw} × ${md}</b> tiles. Bigger houses:</p>
        <div class="furni-grid">${sizeTiles}</div>
        <p class="muted small">Split it into rooms with free 🧱 walls (in 🛋️ Items) and doorways from the Shop.</p>`;
    } else {
      // the ones you own first, then the rest by kind (tap one you don't own to try it on)
      const list = DECO_LISTS[stylePage];
      const painting = PAINTABLE.has(stylePage) && paintMode, walls = stylePage === 'wall';
      const what = { floor: 'floor', ceiling: 'ceiling', wall: 'wallpaper' }[stylePage];
      const painted = walls ? Object.keys(home?.wallp ?? {}).length : (home?.[stylePage === 'ceiling' ? 'careas' : 'areas'] ?? []).length;
      const brushName = esc(list.find((x) => x.id === brush)?.name ?? '');
      const paintBar = !PAINTABLE.has(stylePage) ? '' : `<div class="shop-pages paint-bar">
          <button data-paint="off" class="${painting ? '' : 'on'}">🏠 Whole house</button><button data-paint="on" class="${painting ? 'on' : ''}">🪣 ${walls ? 'Paint one wall' : 'Paint a room'}</button>
          ${painted ? `<button data-paint="clear">✕ Clear painted ${walls ? 'walls' : 'rooms'}</button>` : ''}</div>
        <p class="muted small">${painting
    ? (brush ? `Click ${walls ? 'a wall (either side of the ones you built, or the house walls)' : 'inside a room'} to give it the <b>${brushName}</b> ${what}. Pick the main one to paint it back.`
      : `Pick one of your ${what}s, then click ${walls ? 'a wall' : 'inside a room (a space closed off by your walls)'} to give it that ${what}.`)
    : `Pick the ${what} for ${walls ? 'every wall that looks into a room (walls facing outdoors get the outside finish: see 🏡 Outside)' : 'every room'}. Use 🪣 to give ${walls ? 'single walls' : 'rooms like a bathroom'} their own ${what}.`}</p>`;
      const groupOf = (d) => (ownsDeco(d) ? '✓ Yours' : d.group ?? 'More');
      const sorted = [...list.filter(ownsDeco), ...list.filter((d) => !ownsDeco(d))];
      body = paintBar + jumpStrip([...new Set(sorted.map(groupOf))]) + shelves(sorted, groupOf, opt(stylePage), (g) => esc(g), 'style-grid');
    }
    panel.innerHTML = `${pageStrip(STYLE_PAGES, stylePage, 'style-page')}${previewBar()}${body}`;
  }

  stage.hud.addEventListener('click', (e) => {
    const t = e.target.closest('[data-slot-save],[data-slot-load],[data-slot-del],[data-builder],[data-tab],[data-visit],[data-visits],[data-menu],[data-like],[data-edit],[data-home],[data-act],[data-place],[data-buy],[data-style],[data-preview-buy],[data-preview-stop],[data-size],[data-shop-page],[data-style-page],[data-jump],[data-paint],[data-part],[data-recolor],[data-trim-mode],[data-trim],[data-item-filter],[data-item-set]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.slotSave) {
      const name = panel.querySelector('.plot-name')?.value ?? '';
      if (ds.slotSave !== 'new' && !confirm(`Save the house you're in over “${slots?.[+ds.slotSave]?.name}”?`)) return;
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; net.send('house_save', payload()); } // (the latest changes first)
      net.send('house_slot', { op: 'save', i: ds.slotSave === 'new' ? null : +ds.slotSave, name });
      return;
    }
    if (ds.slotLoad) {
      if (!confirm(`Move into “${slots?.[+ds.slotLoad]?.name}”? The house you're in now will be swapped out, so save it first if you want to keep it.`)) return;
      if (edit) setEdit(false);
      net.send('house_slot', { op: 'load', i: +ds.slotLoad });
      return;
    }
    if (ds.slotDel) { if (confirm(`Delete “${slots?.[+ds.slotDel]?.name}” for good?`)) net.send('house_slot', { op: 'delete', i: +ds.slotDel }); return; }
    if (ds.trimMode) {
      if (ds.trimMode === 'clear') { home.trimp = {}; commit('paint'); return; }
      trimMode = ds.trimMode === 'wall'; trimBrush = null; renderPanel(); return;
    }
    if (ds.trim) {
      if (trimMode) { trimBrush = ds.trim; sfx('click'); renderPanel(); return; }
      if (home.trim !== ds.trim) { home.trim = ds.trim; commit('paint'); }
      return;
    }
    if (ds.itemFilter) { itemFilter = ds.itemFilter; renderPanel(); panel.scrollTop = 0; return; }
    if (ds.itemSet) { itemSet = ds.itemSet; renderPanel(); panel.scrollTop = 0; return; }
    if (ds.part != null) { partSel = ds.part || null; renderPanel(); return; }
    if (ds.recolor != null && selected >= 0) {
      const it = { ...home.items[selected] };
      if (partSel) {
        // one part: its own colour (the whole-piece colour steps aside so the parts show as picked)
        const cp = { ...(it.cp ?? {}) };
        if (ds.recolor) cp[partSel] = ds.recolor; else delete cp[partSel];
        delete it.c;
        if (Object.keys(cp).length) it.cp = cp; else delete it.cp;
        home.items[selected] = it;
        commit('paint');
        return;
      }
      delete it.cp;
      if (ds.recolor) it.c = ds.recolor; else delete it.c;
      home.items[selected] = it;
      commit('paint');
      return;
    }
    if (ds.paint) {
      if (ds.paint === 'clear') { if (stylePage === 'wall') home.wallp = {}; else home[stylePage === 'ceiling' ? 'careas' : 'areas'] = []; commit('paint'); return; }
      paintMode = ds.paint === 'on';
      if (!paintMode) brush = null;
      renderAll();
      return;
    }
    if (ds.shopPage) { shopPage = ds.shopPage; confirmBuy = null; renderPanel(); panel.scrollTop = 0; return; }
    if (ds.stylePage) { stylePage = ds.stylePage; confirmBuy = null; brush = null; renderAll(); panel.scrollTop = 0; return; }
    if (ds.jump) {
      // scroll the shelf's label to just under the sticky tabs at the top (however many rows they wrap to)
      const el = panel.querySelector(`#${ds.jump}`);
      if (!el) return;
      const sticky = panel.querySelector('.shop-pages');
      const under = sticky && getComputedStyle(sticky).position === 'sticky' ? sticky.getBoundingClientRect().height : 0;
      const top = panel.scrollTop + el.getBoundingClientRect().top - panel.getBoundingClientRect().top - under - 6;
      panel.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      return;
    }
    if (ds.previewBuy != null) {
      const id = preview[ds.previewBuy];
      if (id) { buyThenUse = { field: ds.previewBuy, id }; net.send('house_buy', { id, k: viewKey }); }
      return;
    }
    if (ds.previewStop != null) { setPreview(ds.previewStop, null); renderPanel(); return; }
    if (ds.tab) {
      tab = ds.tab;
      confirmBuy = null;
      if (trying()) setPreview(null);
      if (tab !== 'visit' && canEdit() && !edit) setEdit(true);
      renderAll();
    } else if (ds.builder) {
      net.send('house_builder', { k: ds.builder }); // (the server flips it: on if they can't build yet, off if they can)
      sfx('click');
    } else if (ds.menu != null) {
      // decorating: tuck the menu away to see the room, bring it back (Tab does the same)
      sideOpen = !sideOpen;
      if (sideOpen && tab === 'visit') tab = 'items';
      renderAll();
    } else if (ds.visits != null) {
      sideOpen = !(sideOpen && tab === 'visit');
      tab = 'visit';
      renderAll();
    } else if (ds.visit) {
      if (ds.visit !== viewKey) visit(ds.visit);
    } else if (ds.like != null) {
      net.send('house_like', { k: viewKey });
      sfx('like');
      walker.me.char.emote('heart');
    } else if (ds.edit != null) {
      setEdit(!edit);
      renderAll();
    } else if (ds.home != null) {
      visit(S.me);
    } else if (ds.act) {
      if (ds.act === 'rotate') rotate();
      if (ds.act === 'up') nudgeHeight(1);
      if (ds.act === 'down') nudgeHeight(-1);
      if (ds.act === 'store') storeSelected();
      if (ds.act === 'longer') resizeWall(1);
      if (ds.act === 'shorter') resizeWall(-1);
      if (ds.act === 'move' && selected >= 0) startPlacing(home.items[selected].id, selected);
    } else if (ds.place) {
      if (!edit) setEdit(true);
      startPlacing(ds.place);
    } else if (ds.buy) {
      // floors and wallpapers go up on your walls while you decide
      if (ds.kind) setPreview(ds.kind, ds.buy);
      // (building in a friend's house: what you buy is theirs, and you pay)
      if (confirmBuy === ds.buy) { net.send('house_buy', { id: ds.buy, k: viewKey }); confirmBuy = null; if (ds.kind) buyThenUse = { field: ds.kind, id: ds.buy }; }
      else confirmBuy = ds.buy;
      renderPanel();
    } else if (ds.style) {
      const [field, id] = ds.style.split(':');
      const d = [...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings, ...CATALOG.doors].find((x) => x.id === id);
      if (!ownsDeco(d)) { setPreview(field, id); sfx('pop', { vol: 0.4 }); renderPanel(); return; }
      if (PAINTABLE.has(field) && paintMode) { brush = id; sfx('click'); renderAll(); return; }
      if (preview[field]) setPreview(field, null);
      if (home[field] !== id) { home[field] = id; commit('paint'); } else renderPanel();
    }
  });

  // ---- the outside: each wall's finish, the roof, the trim, paths and driveways, the yard -----------

  const EXT_PAGES = [['walls', '🧱 Outside walls'], ['roof', '🏠 Roofs'], ['paths', '🛣️ Paths & driveways'], ['yard', '🌳 Yard']];
  const MAX_ROOFS = 16;
  let roofBrush = { s: 'gable', m: 'shingle', c: '#b3403a', ch: 0, r: 0, p: 1 }, roofSel = -1; // (roofSel: the piece you've clicked to change)
  const MAX_GROUND = 48, MAX_YARD = 80; // (as on the server)
  let extPage = 'walls', extOne = false, extBrush = { m: 'brick', c: '#b5533c' };
  let pathBrush = { m: 'concrete', c: '#c9c9c9' }, pathErase = false, pathDrag = null, pathGhost = null;
  let yardPick = null, yardErase = false, yardTurn = 0, yardGhost = null;
  const half = (v) => Math.round(v * 2) / 2;
  /** Change the outside (the keys stay in the order the server keeps them, so what comes back matches). */
  function setExt(change, sound = 'paint') {
    const e = home.ext;
    home.ext = { wall: e.wall, roofs: e.roofs ?? [], ground: e.ground ?? [], yard: e.yard ?? [], ...change };
    commit(sound);
  }
  /** Where the pointer is on the plot (in plot tiles), or null. */
  function plotPoint() {
    const p = stage.pointerOnPlane(0);
    return p ? { x: p.x / T, z: p.z / T } : null;
  }
  /** Plot tiles -> where that is in the room's group. */
  const fromPlot = (x, z) => [x, z];
  const inHouse = (x, z) => grid.at(x, z) === 1; // (not in the middle of a wall)
  function clearOutsideTools() {
    if (pathDrag) orbit.fixed = pathDrag.wasFixed;
    pathDrag = null;
    for (const g of [pathGhost, yardGhost, roofMark, roofPrev, roofPin]) if (g) room.group.remove(g);
    pathGhost = yardGhost = roofMark = roofPrev = roofPin = null;
  }
  /** The stretch being dragged out for a path: from where you pressed to the pointer, on the half-tile grid. */
  function pathRect() {
    const q = plotPoint();
    if (!pathDrag || !q) return null;
    const cl = (v, hi) => Math.max(0, Math.min(hi, half(v)));
    let x0 = cl(Math.min(pathDrag.x, q.x), PLOT.w), x1 = cl(Math.max(pathDrag.x, q.x), PLOT.w), z0 = cl(Math.min(pathDrag.z, q.z), PLOT.d), z1 = cl(Math.max(pathDrag.z, q.z), PLOT.d);
    // (a click with no drag lays one tile)
    if (x1 - x0 < 0.5) { x0 = Math.max(0, Math.min(PLOT.w - 1, x0 - 0.5)); x1 = x0 + 1; }
    if (z1 - z0 < 0.5) { z0 = Math.max(0, Math.min(PLOT.d - 1, z0 - 0.5)); z1 = z0 + 1; }
    return { x: x0, y: z0, w: x1 - x0, d: z1 - z0 };
  }
  function showPathGhost() {
    const r = pathRect();
    if (!r) return;
    if (!pathGhost) { pathGhost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ghostOk); pathGhost.rotation.x = -Math.PI / 2; room.group.add(pathGhost); }
    const [x, z] = fromPlot(r.x + r.w / 2, r.y + r.d / 2);
    pathGhost.position.set(x, extPage === 'roof' ? WALL_H + 0.05 : 0.05, z);
    pathGhost.scale.set(r.w, r.d, 1);
  }
  function moveYardGhost() {
    if (yardGhost && yardGhost.userData.id !== yardPick) { room.group.remove(yardGhost); yardGhost = null; }
    const q = plotPoint();
    if (!yardPick || yardErase || !q || !edit || tab !== 'outside' || extPage !== 'yard') { if (yardGhost) yardGhost.visible = false; return; }
    if (!yardGhost) {
      yardGhost = buildYardItem(yardPick);
      yardGhost.userData.id = yardPick;
      room.group.add(yardGhost);
    }
    const x = half(q.x), z = half(q.z), ok = x >= 0.5 && x <= PLOT.w - 0.5 && z >= 0.5 && z <= PLOT.d - 0.5 && !inHouse(x, z);
    yardGhost.traverse((o) => { if (o.isMesh) { o.material = ok ? ghostOk : ghostBad; o.castShadow = false; } });
    const [gx, gz] = fromPlot(x, z);
    yardGhost.position.set(gx, 0, gz);
    yardGhost.rotation.y = yardTurn * Math.PI / 2;
    yardGhost.visible = true;
    yardGhost.userData.at = ok ? { x, z } : null;
  }
  /** Clicks and drags while the Outside tab is open (the camera still turns when you drag elsewhere). */
  function outsidePointer(type, e, d) {
    const click = type === 'up' && d && !d.moved && d.button === 0;
    if (type === 'up' && d && !d.moved && d.button === 2) { rotate(); return; }
    if (extPage === 'walls') {
      // one wall face at a time: whichever is under the pointer gets this finish
      if (click && extOne) paintFaceAt(`ext:${extBrush.m}:${extBrush.c}`);
    } else if (extPage === 'roof') {
      const roofs = home.ext.roofs ?? [];
      if (!roofPlacing) {
        // not holding a roof: a click on a piece picks it, so you can change or remove it
        if (!click) return;
        const hit = stage.pick([hood.plotOf(viewKey)?.roofs].filter(Boolean)).find((h) => h.object.userData.roof != null);
        roofSel = hit ? hit.object.userData.roof : -1;
        if (hit) { roofBrush = { ...roofBrush, ...roofs[roofSel] }; sfx('pickup', { vol: 0.5 }); }
        renderAll();
        return;
      }
      // holding a roof: click one corner, move (the roof itself shows, see-through, at the size it'll be),
      // then click the opposite corner. Pressing, dragging and letting go does the same.
      if (type === 'move') { moveRoofPreview(); return; }
      if (type === 'down' && e.button === 0 && !pathDrag) {
        const q = plotPoint();
        if (!q || q.x < -1 || q.x > PLOT.w + 1 || q.z < -1 || q.z > PLOT.d + 1) return;
        pathDrag = { x: half(q.x), z: half(q.z), wasFixed: orbit.fixed, fresh: true };
        orbit.fixed = true;
        sfx('click');
        moveRoofPreview();
        renderAll();
      } else if (type === 'up' && pathDrag && (d?.button ?? 0) === 0) {
        if (pathDrag.fresh && !d?.moved) { pathDrag.fresh = false; return; } // (the first corner is down: now the second)
        const r = pathRect();
        clearOutsideTools();
        if (!r || r.w < 2 || r.d < 2) { toast('A piece of roof has to be at least 2 tiles each way.', 'error'); renderAll(); return; }
        if (roofs.length >= MAX_ROOFS) { toast(`A house can have up to ${MAX_ROOFS} pieces of roof.`, 'error'); renderAll(); return; }
        setExt({ roofs: [...roofs, roofPiece(roofBrush, r)] }, 'place'); // (and you're still holding the roof, for the next piece)
      }
    } else if (extPage === 'paths') {
      if (pathErase) {
        if (!click) return;
        const q = plotPoint(), list = home.ext.ground ?? [];
        let i = list.length - 1;
        for (; i >= 0; i--) { const g = list[i]; if (q && q.x >= g.x && q.x <= g.x + g.w && q.z >= g.y && q.z <= g.y + g.d) break; }
        if (i < 0) { sfx('error'); return; }
        setExt({ ground: list.filter((_, k) => k !== i) }, 'store');
        return;
      }
      if (type === 'down' && e.button === 0) {
        const q = plotPoint();
        if (!q || q.x < -1 || q.x > PLOT.w + 1 || q.z < -1 || q.z > PLOT.d + 1) return;
        pathDrag = { x: q.x, z: q.z, wasFixed: orbit.fixed }; // (the camera holds still while you drag it out)
        orbit.fixed = true;
        showPathGhost();
      } else if (type === 'move' && pathDrag) showPathGhost();
      else if (type === 'up' && pathDrag) {
        const r = pathRect();
        clearOutsideTools();
        if (!r) return;
        if ((home.ext.ground ?? []).length >= MAX_GROUND) { toast(`A yard can have up to ${MAX_GROUND} paths and driveways. Rub some out first.`, 'error'); return; }
        setExt({ ground: [...(home.ext.ground ?? []), { m: pathBrush.m, c: pathBrush.c, ...r }] }, 'place');
      }
    } else if (extPage === 'yard') {
      const q = plotPoint(), list = home.ext.yard ?? [];
      const runs = yardPick && !yardErase && /^(fence|hedge)/.test(yardPick); // (laid in a line: press and drag)
      if (runs && type === 'down' && e.button === 0 && q) { pathDrag = { x: half(q.x), z: half(q.z), wasFixed: orbit.fixed, run: true }; orbit.fixed = true; return; }
      if (runs && pathDrag?.run && (type === 'move' || type === 'up') && q) {
        // a run of pieces from where you pressed to the pointer, along whichever way you've dragged further
        const dx = half(q.x) - pathDrag.x, dz = half(q.z) - pathDrag.z, along = Math.abs(dx) >= Math.abs(dz), n = Math.round(Math.abs(along ? dx : dz)), dir = Math.sign(along ? dx : dz) || 1;
        const run = [];
        for (let k = 0; k <= n; k++) { const x = pathDrag.x + (along ? k * dir : 0), z = pathDrag.z + (along ? 0 : k * dir); if (x >= 0.5 && x <= PLOT.w - 0.5 && z >= 0.5 && z <= PLOT.d - 0.5 && !inHouse(x, z)) run.push({ id: yardPick, x, y: z, r: along ? 0 : 1 }); }
        if (type === 'move') {
          if (!pathGhost) { pathGhost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ghostOk); pathGhost.rotation.x = -Math.PI / 2; room.group.add(pathGhost); }
          pathGhost.position.set(pathDrag.x + (along ? dx / 2 : 0), 0.05, pathDrag.z + (along ? 0 : dz / 2));
          pathGhost.scale.set(along ? Math.abs(dx) + 1 : 0.5, along ? 0.5 : Math.abs(dz) + 1, 1);
          if (yardGhost) yardGhost.visible = false;
          return;
        }
        const dragged = d?.moved && n > 0;
        orbit.fixed = pathDrag.wasFixed; pathDrag = null;
        if (pathGhost) { room.group.remove(pathGhost); pathGhost = null; }
        if (dragged) {
          const fresh = run.filter((a) => !list.some((y) => y.id === a.id && y.x === a.x && y.y === a.y));
          if (list.length + fresh.length > MAX_YARD) { toast(`A yard can hold up to ${MAX_YARD} things.`, 'error'); return; }
          if (fresh.length) setExt({ yard: [...list, ...fresh] }, 'place');
          return;
        }
      }
      if (type === 'move') { moveYardGhost(); return; }
      if (!click) return;
      if (!q) return;
      if (yardErase || !yardPick) {
        // put away whatever's nearest the click
        let best = -1, bd = 1.1;
        list.forEach((y, i) => { const dd = Math.hypot(y.x - q.x, y.y - q.z); if (dd < bd) { bd = dd; best = i; } });
        if (best < 0) { if (yardErase) sfx('error'); return; }
        setExt({ yard: list.filter((_, k) => k !== best) }, 'store');
        return;
      }
      moveYardGhost();
      const at = yardGhost?.userData.at;
      if (!at) { sfx('error'); toast('That has to go in the yard, not in the house.', 'error'); return; }
      if (list.length >= MAX_YARD) { toast(`A yard can hold up to ${MAX_YARD} things.`, 'error'); return; }
      setExt({ yard: [...list, { id: yardPick, x: at.x, y: at.z, r: yardTurn }] }, 'place');
    }
  }
  /** A piece of roof's data, with the keys in the order the server keeps them. */
  const roofPiece = (st, at) => ({ s: st.s, m: st.m, c: st.c, ch: st.ch ? 1 : 0, x: at.x, y: at.y, w: at.w, d: at.d, r: st.r ?? 0, p: st.p ?? 1 });
  /** Change the shape, material, colour… of the piece you've picked (or, with none picked, of the next one you lay). */
  function styleRoof(change) {
    roofBrush = { ...roofBrush, ...change };
    const roofs = home.ext.roofs ?? [], cur = roofs[roofSel];
    if (!cur) { sfx('click'); renderAll(); return; }
    setExt({ roofs: roofs.map((r, k) => (k === roofSel ? roofPiece({ ...r, ...change }, r) : r)) });
  }
  /** A frame over the piece of roof you've picked, so you can see which one it is. */
  let roofMark = null;
  // holding a roof to place: a white pin where the pointer is, and the roof itself (see-through) once a corner is down
  let roofPlacing = false, roofPrev = null, roofPin = null;
  const roofGhost = basic('#ffffff', { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const roofing = () => edit && tab === 'outside' && extPage === 'roof' && roofPlacing;
  function moveRoofPreview() {
    const q = plotPoint();
    if (!roofPin) {
      roofPin = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), basic('#ffffff')); stick.position.y = 1.1;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), basic('#ffffff')); ball.position.y = 2.3;
      roofPin.add(stick, ball);
      room.group.add(roofPin);
    }
    roofPin.visible = !!q;
    if (q) roofPin.position.set(half(q.x), 0, half(q.z));
    const r = pathDrag ? pathRect() : null, sig = r ? JSON.stringify([r, roofBrush]) : '';
    if (sig === (roofPrev?.userData.sig ?? '')) return;
    if (roofPrev) room.group.remove(roofPrev);
    roofPrev = null;
    if (!r) return;
    roofPrev = buildRoofs([roofPiece(roofBrush, r)], home.ext.wall);
    const mat = r.w >= 2 && r.d >= 2 ? roofGhost : ghostBad;
    roofPrev.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    roofPrev.userData.sig = sig;
    room.group.add(roofPrev);
  }
  function markRoof() {
    const r = edit && tab === 'outside' && extPage === 'roof' ? home?.ext?.roofs?.[roofSel] : null;
    if (!r) { if (roofMark) { room.group.remove(roofMark); roofMark = null; } return; }
    if (!roofMark) {
      roofMark = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#ffd84d' }));
      room.group.add(roofMark);
    }
    roofMark.position.set(r.x + r.w / 2, WALL_H + 2.6, r.y + r.d / 2);
    roofMark.scale.set(r.w + 1.3, 5.6, r.d + 1.3);
  }
  const outsideHint = () => (extPage === 'roof' ? (roofSel >= 0 ? '🏠 This piece is picked (yellow frame): change its shape, material, colour, pitch or turn it in the menu · click another piece to pick that one' : (roofPlacing ? (pathDrag ? '🏠 Move to size the roof · <b>click</b> to place it · <b>Cancel</b> to stop' : '🏠 <b>Click</b> where one corner of the roof goes · <b>Cancel</b> to stop') : '🏠 Pick a roof in the menu to place it · click a piece that\'s up to change it'))
    : extPage === 'walls' ? (extOne ? '🖌️ Click an outside wall to give it this finish · drag to look around · <kbd>WASD</kbd> fly, <kbd>Space</kbd> up, <kbd>Shift</kbd> down' : 'Pick a finish and a colour for the outside walls · <kbd>WASD</kbd> fly, <kbd>Space</kbd> up, <kbd>Shift</kbd> down')
    : extPage === 'paths' ? (pathErase ? '🧽 Click a path or driveway to rub it out' : '🛣️ Press on the lawn and drag to lay a path or driveway (a click lays one tile) · later pieces go over earlier ones')
      : extPage === 'yard' ? (yardErase || !yardPick ? '🧽 Click something in the yard to put it away' : (/^(fence|hedge)/.test(yardPick) ? '🌳 Press and drag to lay a whole run of it (or click for one piece) · <kbd>R</kbd> turns a single piece' : '🌳 Click the lawn to put it down · <kbd>R</kbd>/right-click to turn it'))
        : 'Fly round your house with <kbd>WASD</kbd>, <kbd>Space</kbd> and <kbd>Shift</kbd> · drag to look');

  function renderOutside() {
    const e = home?.ext;
    if (!e) { panel.innerHTML = '<p class="muted">Loading…</p>'; return; }
    const cols = (cur, attr) => `<div class="swatches palette">${CATALOG.extColors.map((c) => `<button type="button" class="swatch ${cur === c ? 'on' : ''}" data-x="${attr}:${c}" style="--c:${c}"></button>`).join('')}</div>`;
    const tile = (on, attr, style, name, inner = '') => `<button class="style-opt ${on ? 'on' : ''}" data-x="${attr}" title="${esc(name)}"><span class="style-sw" style="${style}">${inner}</span><span>${esc(name)}</span></button>`;
    const sw = (m, c) => `background:url(${extSwatch(m, c)}) center/cover`;
    const bar = (...btns) => `<div class="shop-pages paint-bar">${btns.filter(Boolean).map(([attr, label, on]) => `<button data-x="${attr}" class="${on ? 'on' : ''}">${label}</button>`).join('')}</div>`;
    let body = '';
    if (extPage === 'walls') {
      const cur = extOne ? extBrush : e.wall, n = Object.values(home.wallp ?? {}).filter((v) => v.startsWith('ext:')).length;
      body = `${bar(['one:0', '🏠 Every outside wall', !extOne], ['one:1', '🖌️ One wall at a time', extOne], n ? ['clearwalls', `↺ Clear ${n} painted wall${n > 1 ? 's' : ''}`, false] : null)}
        <p class="muted small">${extOne ? 'Pick a finish and a colour, then <b>click a wall</b>: only that side of that wall changes (a brick front, dark siding down the sides…). The other side keeps its own finish.' : 'The finish for every wall face that looks outdoors. Faces that look into a room get your wallpaper instead (🎨 Inside). Walls you\'ve painted one at a time keep their own.'}</p>
        <div class="wd-label">Finish</div><div class="style-grid">${CATALOG.extWalls.map((w) => tile(cur.m === w.id, `wallm:${w.id}`, sw(w.id, cur.m === w.id ? cur.c : w.c), w.name)).join('')}</div>
        <div class="wd-label">Colour</div>${cols(cur.c, 'wallc')}`;
    } else if (extPage === 'roof') {
      const n = (e.roofs ?? []).length, sel = (e.roofs ?? [])[roofSel], r = sel ?? roofBrush;
      body = `${bar(['roofnew', '➕ New piece', !sel], sel ? ['roofdel', '🗑️ Remove this piece', false] : null, n ? ['clearroofs', `✕ Clear all ${n}`, false] : null)}
        <p class="muted small">${sel ? `<b>Piece ${roofSel + 1} of ${n}</b> is picked (yellow frame). Everything below changes just this piece.` : '<b>Pick a roof</b> below and you\'re holding it: <b>click one corner</b> on your plot, move the pointer (the roof shows as you go) and <b>click the opposite corner</b>. Set its material, colour and pitch here first. To change one that\'s already up, <b>click it</b>.'} <span class="muted">${n}/${MAX_ROOFS}</span></p>
        <div class="wd-label">Shape</div><div class="style-grid">${CATALOG.roofShapes.map((x) => tile(r.s === x.id, `roofs:${x.id}`, 'background:#2b3050;display:grid;place-items:center;font-size:26px', x.name, x.emoji)).join('')}</div>
        ${bar(['roofturn', `⟳ Turn it (${['front', 'left', 'back', 'right'][(r.r ?? 0) % 4]})`, false], ['roofpitch:0.6', '◣ Shallow', (r.p ?? 1) === 0.6], ['roofpitch:1', '◢ Normal', (r.p ?? 1) === 1], ['roofpitch:1.4', '▲ Steep', (r.p ?? 1) === 1.4], ['chimney', r.ch ? '🧱 Chimney: on' : '🧱 Chimney: off', !!r.ch])}
        <div class="wd-label">Material</div><div class="style-grid">${CATALOG.roofMats.map((x) => tile(r.m === x.id, `roofm:${x.id}`, sw(x.id, r.m === x.id ? r.c : x.c), x.name)).join('')}</div>
        <div class="wd-label">Colour</div>${cols(r.c, 'roofc')}`;
    } else if (extPage === 'paths') {
      const n = (e.ground ?? []).length;
      body = `${bar(['perase:0', '🛣️ Lay', !pathErase], ['perase:1', '🧽 Rub out', pathErase], n ? ['clearpaths', `✕ Clear all ${n}`, false] : null)}
        <p class="muted small">${pathErase ? 'Click a path or driveway to take it up.' : 'Pick a surface and a colour, then <b>press on the lawn and drag</b> to lay it: a walk from the pavement to your door, a driveway, a patio round the back. Overlap pieces to make corners and other shapes.'} <span class="muted">${n}/${MAX_GROUND}</span></p>
        <div class="wd-label">Surface</div><div class="style-grid">${CATALOG.groundMats.map((x) => tile(pathBrush.m === x.id, `pathm:${x.id}`, sw(x.id, pathBrush.m === x.id ? pathBrush.c : x.c), x.name)).join('')}</div>
        <div class="wd-label">Colour</div>${cols(pathBrush.c, 'pathc')}`;
    } else {
      const n = (e.yard ?? []).length;
      body = `${bar(['yerase:0', '🌳 Place', !yardErase], ['yerase:1', '🧽 Put away', yardErase], n ? ['clearyard', `✕ Clear all ${n}`, false] : null)}
        <p class="muted small">${yardErase ? 'Click something in the yard to put it away.' : 'Pick something, then click the lawn to put it down (<kbd>R</kbd> turns it). Fences and hedges go down a tile at a time. All free.'} <span class="muted">${n}/${MAX_YARD}</span></p>
        <div class="furni-grid">${CATALOG.yardItems.map((y) => `<button class="furni ${yardPick === y.id && !yardErase ? 'confirm' : ''}" data-x="yard:${y.id}"><span class="fem size-em">${y.emoji}</span><span class="fname">${esc(y.name)}</span></button>`).join('')}</div>`;
    }
    panel.innerHTML = `${pageStrip(EXT_PAGES, extPage, 'x-page')}${body}`;
    markRoof();
  }

  stage.hud.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-x],[data-x-page],[data-tab]');
    if (!t || !home || !canEdit()) return;
    if (t.dataset.tab) {
      // over to the Outside tab: step back onto the front lawn and look at the house
      if (tab === 'outside' && edit) { fly = { x: WX() / 2, y: 17, z: WZ() + 4 }; orbit.yaw = 0; orbit.pitch = 0.5; }
      else { roofPlacing = false; clearOutsideTools(); }
      return;
    }
    if (t.dataset.xPage) { extPage = t.dataset.xPage; roofSel = -1; roofPlacing = false; clearOutsideTools(); sfx('click'); renderAll(); panel.scrollTop = 0; return; }
    const [op, ...rest] = t.dataset.x.split(':'), v = rest.join(':'), e = home.ext;
    const def = (list, id) => list.find((x) => x.id === id)?.c;
    if (op === 'one') { extOne = v === '1'; if (extOne) extBrush = { ...e.wall }; renderAll(); }
    else if (op === 'clearwalls') { home.wallp = Object.fromEntries(Object.entries(home.wallp ?? {}).filter(([, f]) => !f.startsWith('ext:'))); commit('paint'); }
    else if (op === 'wallm') { if (extOne) { extBrush = { m: v, c: def(CATALOG.extWalls, v) }; sfx('click'); renderPanel(); } else setExt({ wall: { m: v, c: def(CATALOG.extWalls, v) } }); }
    else if (op === 'wallc') { if (extOne) { extBrush = { ...extBrush, c: v }; sfx('click'); renderPanel(); } else setExt({ wall: { m: e.wall.m, c: v } }); }
    else if (op === 'roofs') { if (e.roofs?.[roofSel]) styleRoof({ s: v }); else { roofBrush = { ...roofBrush, s: v }; roofPlacing = true; sfx('pickup'); renderAll(); } } // (no piece picked: you're now holding this roof)
    else if (op === 'roofm') styleRoof({ m: v, c: def(CATALOG.roofMats, v) });
    else if (op === 'roofc') styleRoof({ c: v });
    else if (op === 'chimney') styleRoof({ ch: (e.roofs?.[roofSel] ?? roofBrush).ch ? 0 : 1 });
    else if (op === 'roofturn') styleRoof({ r: (((e.roofs?.[roofSel] ?? roofBrush).r ?? 0) + 1) % 4 });
    else if (op === 'roofpitch') styleRoof({ p: +v });
    else if (op === 'roofnew') { roofSel = -1; roofPlacing = true; sfx('pickup'); renderAll(); }
    else if (op === 'roofdel') { const i = roofSel; roofSel = -1; setExt({ roofs: (e.roofs ?? []).filter((_, k) => k !== i) }, 'store'); }
    else if (op === 'clearroofs') { roofSel = -1; setExt({ roofs: [] }, 'store'); }
    else if (op === 'bulldoze') {
      if (!confirm('Clear the whole plot? Every wall, roof, path and piece of furniture goes back in your inventory. (Save the house first if you want to keep it.)')) return;
      Object.assign(home, { items: [], areas: [], careas: [], wallp: {}, trimp: {} });
      selected = -1;
      setExt({ roofs: [], ground: [], yard: [] }, 'store');
    }
    else if (op === 'perase') { pathErase = v === '1'; clearOutsideTools(); renderAll(); }
    else if (op === 'clearpaths') setExt({ ground: [] }, 'store');
    else if (op === 'pathm') { pathBrush = { m: v, c: def(CATALOG.groundMats, v) }; pathErase = false; sfx('click'); renderAll(); }
    else if (op === 'pathc') { pathBrush = { ...pathBrush, c: v }; pathErase = false; sfx('click'); renderAll(); }
    else if (op === 'yerase') { yardErase = v === '1'; clearOutsideTools(); renderAll(); }
    else if (op === 'clearyard') setExt({ yard: [] }, 'store');
    else if (op === 'yard') { yardPick = yardPick === v && !yardErase ? null : v; yardErase = false; sfx('pickup'); clearOutsideTools(); renderAll(); }
  });

  // ---- mounts: ride yours along the street and round the gardens (G) ---------------------------------

  const building = new Map(); // who's in build mode right now -> whose plot they're building on
  let kickedAt = 0;
  /** A plot is closed to you while someone builds on it, unless you may build there too. */
  const siteClosed = (k) => k !== S.me && !(hood.houses[k]?.builders ?? []).includes(S.me) && [...building.values()].includes(k);
  let riding = false, chainWalls = false; // (chainWalls: Chain Placement, off unless you turn it on)
  function setRiding(on) {
    const p = walker.me;
    if (on === riding) return;
    if (on) {
      if (edit || seated) return;
      if (grid.indoors(p.x / T, p.z / T)) { toast('🐴 Mounts wait outside. Hop on in the yard or on the street.'); return; }
      if (!p.char.setRiding(true)) { toast('🐴 You need a mount! Get one at the 👕 Style Shop (Mounts).'); return; }
      riding = true;
      p.char.setPose('ride');
      sfx(MOUNT_SOUND[S.players[S.me]?.look?.mount]?.on ?? 'whoosh');
    } else {
      riding = false;
      p.char.setRiding(false);
      p.char.setPose('idle');
    }
    net.send('area_pose', { pose: riding ? { p: 'ride' } : null });
    renderHeader();
  }
  /** Someone else got on or off their mount. */
  function showRide(k, pose) {
    if (pose?.p === 'build') building.set(k, pose.v); else building.delete(k);
    const p = stage.people.get(k);
    if (!p || k === S.me || p.sitting) return;
    const on = pose?.p === 'ride';
    if (on === !!p.char.riding) return;
    p.char.setPose(p.char.setRiding(on) ? 'ride' : 'idle');
  }
  stage.hud.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-ride]')) setRiding(!riding);
    else if (ev.target.closest('[data-chain]')) { chainWalls = !chainWalls; sfx('click'); renderAll(); }
    else if (ev.target.closest('[data-cancel]')) { if (placing) stopPlacing(); else { yardPick = null; roofPlacing = false; clearOutsideTools(); renderAll(); } }
  });

  // ---- the paint tool: click anything on the plot, then give it a colour or a material -------------

  let paintSel = null, paintPage = 'material';
  function paintPointer(type, e, d) {
    if (!(type === 'up' && d && !d.moved && d.button === 0)) return;
    stage.raycaster.setFromCamera(stage.mouse, stage.camera);
    const roofs = hood.plotOf(viewKey)?.roofs;
    const hit = stage.raycaster.intersectObjects([room.items, ...(roofs ? [roofs] : [])], true).find((h) => h.object.visible && !h.object.userData.outline && !h.object.isSprite);
    paintSel = null;
    selected = -1;
    if (hit?.object.userData.roof != null) paintSel = { kind: 'roof', i: hit.object.userData.roof };
    else if (hit) {
      let index = -1;
      for (let o = hit.object; o; o = o.parent) if (o.userData.index != null) { index = o.userData.index; break; }
      const it = home.items[index];
      if (it && entries[index]?.roomWall && hit.object.userData.wallpaper && hit.object.userData.face != null) paintSel = { kind: 'face', key: faceKey(it, hit.object.userData.face) };
      else if (it && !entries[index]?.roomWall && canRecolor(FURN[it.id])) { paintSel = { kind: 'item', index }; selected = index; }
    }
    if (!paintSel) {
      // nothing standing there: the path or driveway under the pointer
      const q = plotPoint(), list = home.ext.ground ?? [];
      for (let i = list.length - 1; i >= 0 && q; i--) { const g = list[i]; if (q.x >= g.x && q.x <= g.x + g.w && q.z >= g.y && q.z <= g.y + g.d) { paintSel = { kind: 'ground', i }; break; } }
    }
    sfx(paintSel ? 'pickup' : 'error', { vol: 0.5 });
    renderSelection();
    renderAll();
  }
  function renderPaint() {
    const s = paintSel, e = home?.ext;
    const tabs = `<div class="shop-pages paint-bar"><button data-p="page:material" class="${paintPage === 'material' ? 'on' : ''}">🧱 Material</button><button data-p="page:color" class="${paintPage === 'color' ? 'on' : ''}">🎨 Colour</button>${s ? '<button data-p="reset">↺ Back to how it was</button>' : ''}</div>`;
    const what = s && e ? (s.kind === 'face' ? { name: 'This side of the wall' } : s.kind === 'roof' ? e.roofs?.[s.i] && { name: 'This piece of roof' } : s.kind === 'ground' ? e.ground?.[s.i] && { name: 'This path' } : home.items[s.index] && { name: FURN[home.items[s.index].id].name }) : null;
    if (!what) { paintSel = null; panel.innerHTML = `${tabs}<p class="muted">🎨 <b>Click anything</b> on your plot to paint it: a wall (each side on its own), a piece of roof, a path or driveway, or a piece of furniture. Then pick a material or a colour here.</p>`; return; }
    const sw = (m, c) => `background:url(${extSwatch(m, c)}) center/cover`;
    const tile = (on, attr, style, name) => `<button class="style-opt ${on ? 'on' : ''}" data-p="${attr}" title="${esc(name)}"><span class="style-sw" style="${style}"></span><span>${esc(name)}</span></button>`;
    const cols = (list, cur) => `<div class="swatches palette">${list.map((c) => `<button type="button" class="swatch ${cur === c ? 'on' : ''}" data-p="c:${c}" style="--c:${c}"></button>`).join('')}</div>`;
    let mats, colours;
    if (s.kind === 'face') {
      const cur = home.wallp?.[s.key] ?? '', [, cm, cc] = cur.startsWith('ext:') ? cur.split(':') : [];
      mats = `<div class="style-grid">${CATALOG.extWalls.map((w) => tile(cm === w.id, `m:ext:${w.id}`, sw(w.id, cm === w.id ? cc : w.c), w.name)).join('')}${CATALOG.walls.filter(ownsDeco).map((w) => tile(cur === w.id, `m:${w.id}`, decoBg(w.id), w.name)).join('')}</div>`;
      colours = cols(CATALOG.extColors, cc);
    } else if (s.kind === 'roof') {
      const r = e.roofs[s.i];
      mats = `<div class="style-grid">${CATALOG.roofMats.map((x) => tile(r.m === x.id, `m:${x.id}`, sw(x.id, r.m === x.id ? r.c : x.c), x.name)).join('')}</div>`;
      colours = cols(CATALOG.extColors, r.c);
    } else if (s.kind === 'ground') {
      const g = e.ground[s.i];
      mats = `<div class="style-grid">${CATALOG.groundMats.map((x) => tile(g.m === x.id, `m:${x.id}`, sw(x.id, g.m === x.id ? g.c : x.c), x.name)).join('')}</div>`;
      colours = cols(CATALOG.extColors, g.c);
    } else {
      mats = '<p class="muted small">Furniture keeps its own materials: give it a colour instead.</p>';
      colours = cols(CATALOG.clothColors, home.items[s.index].c);
    }
    panel.innerHTML = `${tabs}<div class="wd-label">${esc(what.name)}</div>${paintPage === 'color' ? colours : mats}`;
  }
  stage.hud.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-p]');
    if (!t || !home || !canEdit()) return;
    const [op, ...rest] = t.dataset.p.split(':'), v = rest.join(':'), s = paintSel, e = home.ext;
    if (op === 'page') { paintPage = v; sfx('click'); renderPanel(); return; }
    if (!s) return;
    const dflt = (list, id) => list.find((x) => x.id === id)?.c;
    if (s.kind === 'face') {
      const own = { ...(home.wallp ?? {}) }, cur = own[s.key] ?? '', cm = cur.startsWith('ext:') ? cur.split(':')[1] : null;
      if (op === 'reset') delete own[s.key];
      else if (op === 'm') own[s.key] = v.startsWith('ext:') ? `${v}:${dflt(CATALOG.extWalls, v.slice(4))}` : v;
      else own[s.key] = `ext:${cm ?? 'paint'}:${v}`; // (a colour on a wallpapered wall makes it a painted one)
      home.wallp = own;
      commit('paint');
    } else if (s.kind === 'roof') {
      setExt({ roofs: e.roofs.map((r, k) => (k !== s.i ? r : roofPiece({ ...r, ...(op === 'reset' ? { m: 'shingle', c: '#b3403a' } : op === 'm' ? { m: v, c: dflt(CATALOG.roofMats, v) } : { c: v }) }, r))) });
    } else if (s.kind === 'ground') {
      setExt({ ground: e.ground.map((g, k) => { if (k !== s.i) return g; const n = op === 'reset' ? { m: g.m, c: dflt(CATALOG.groundMats, g.m) } : op === 'm' ? { m: v, c: dflt(CATALOG.groundMats, v) } : { m: g.m, c: v }; return { m: n.m, c: n.c, x: g.x, y: g.y, w: g.w, d: g.d }; }) });
    } else if (home.items[s.index]) {
      const it = { ...home.items[s.index] };
      if (op === 'reset') { delete it.c; delete it.cp; } else if (op === 'c') { it.c = v; delete it.cp; } else return;
      home.items[s.index] = it;
      commit('paint');
    }
  });

  /** The street was laid out again (someone joined or left): keep looking at it from this house. */
  function restreet() {
    const nv = hood.viewFrom(viewKey);
    if (!nv) return;
    view = nv;
    view.apply();
    fitBounds();
    if (sideOpen && tab === 'visit') renderVisit();
  }

  function setEdit(on) {
    const was = edit;
    edit = on && canEdit();
    const p = walker.me;
    if (edit && !was) {
      // building: the camera floats from where you were, and your body is tucked away out of the house, so
      // nobody sees it standing about and it can't end up stuck inside something you build
      fly = { x: p.x, y: Math.min(WALL_H * T - 0.4, 2.4), z: p.z };
      Object.assign(p, { x: -200, z: -200, moving: false });
    } else if (!edit && was) {
      // done: you're standing where you were floating (or back on the pavement, if that's inside something)
      const free = (x, z) => x > 1 && z > 1 && x < WX() - 1 && z < WZ() + 5 && grid.at(x / T, z / T) !== 1 && !solids.some((s) => Math.abs(x - s.x) < s.w / 2 + 0.4 && Math.abs(z - s.z) < s.d / 2 + 0.4);
      const a = hood.arrival(viewKey), back = view.toLocal(a.x, a.z);
      Object.assign(p, fly && free(fly.x, fly.z) ? { x: fly.x, z: fly.z } : back, { moving: false });
      clearOutsideTools();
    }
    if (!edit) { paintMode = false; brush = null; }
    if (!edit && trying()) setPreview(null);
    room.grid.visible = edit;
    if (edit) setRiding(false);
    if (edit !== was) net.send('area_pose', { pose: edit ? { p: 'build', v: viewKey } : null }); // (everyone hears a plot is being built on)
    if (edit) { sideOpen = true; if (tab === 'visit') tab = 'items'; if (seated) standUp(); }
    else {
      if (placing) stopPlacing();
      selected = -1;
      renderSelection();
      if (tab !== 'visit') sideOpen = false;
    }
  }

  /** Bring the world round to another house: positions on the street stay put, the frame changes. */
  function rebase(nv) {
    const turn = view.turn - nv.turn, norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const conv = (x, z) => { const h = view.toHood(x, z); return nv.toLocal(h.x, h.z); };
    for (const p of stage.people.values()) {
      Object.assign(p, conv(p.x, p.z));
      if (p.tx != null) { const t = conv(p.tx, p.tz); p.tx = t.x; p.tz = t.z; }
      p.heading = norm(p.heading + turn);
      p.char.root.rotation.y += turn;
    }
    if (fly) Object.assign(fly, conv(fly.x, fly.z));
    orbit.yaw += turn;
    const t = conv(orbit.target.x, orbit.target.z);
    orbit.target.set(t.x, orbit.target.y, t.z);
    if (orbit.cur) { const c = conv(orbit.cur.x, orbit.cur.z); orbit.cur.set(c.x, orbit.cur.y, c.z); }
    view = nv;
    view.apply();
    fitBounds();
  }

  /** The house you're at becomes the one the world is built around: its rooms and furniture appear. */
  function activate(k) {
    if (!hood.plotOf(k)) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
      if (home && canEdit()) net.send('house_save', payload());
    }
    if (placing) stopPlacing();
    if (seated) standUp();
    setEdit(false);
    hood.setActive(null); // (the house you've left stands on its plot like everyone else's)
    viewKey = k;
    home = null;
    selected = -1;
    echoes = 0;
    outsideSig = cutSig = '';
    while (room.items.children.length) room.items.remove(room.items.children[0]);
    stage.interactables = stage.interactables.filter((i) => !i.house);
    solids.length = 0;
    rebase(hood.viewFrom(k));
    center.set(WX() / 2, 0, WZ() / 2);
    net.send('house_get', { k });
    renderAll();
  }

  /** Go straight to someone's house (your own included): you pop up on the pavement at their front path. */
  function visit(k) {
    if (!hood.plotOf(k)) return;
    activate(k);
    const a = hood.arrival(k), at = view.toLocal(a.x, a.z);
    Object.assign(walker.me, { x: at.x, z: at.z, heading: Math.PI, moving: false });
    orbit.yaw = 0;
    orbit.cur = null;
    sfx('knock');
    if (k !== S.me) stage.banner(`<div class="big">🏠 ${esc(nameOf(k))}'s House</div>Have a look round!`, 2400);
    renderAll();
  }

  // ---- network ------------------------------------------------------------------------

  const off = [
    net.on('player', (m) => {
      if (m.p.key !== viewKey || !buyThenUse || !home || !canEdit()) return;
      const d = [...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings, ...CATALOG.doors].find((x) => x.id === buyThenUse.id);
      if (!d || !ownsDeco(d)) return;
      const { field, id } = buyThenUse;
      buyThenUse = null;
      delete preview[field];
      home[field] = id;
      commit('paint');
    }),
    // the street changes when someone redecorates the outside of their house, joins or leaves
    net.on('player', () => { hood.sync(); restreet(); for (const k of hood.missing()) net.send('house_get', { k }); }),
    net.on('houses', (m) => { for (const [k, h] of Object.entries(m.houses)) if (k !== viewKey || !home) hood.setHouse(k, h); }),
    net.on('area_pose', (m) => showRide(m.k, m.pose)),
    net.on('area', (m) => {
      seatsTaken.clear();
      building.clear();
      for (const q of m.others) if (q.seat) seatsTaken.set(q.k, q.seat);
      setTimeout(() => { applyAllSeats(); for (const q of m.others) showRide(q.k, q.pose); }, 0); // (after the walker has added everyone)
    }),
    net.on('area_sit', (m) => {
      if (m.seat) seatsTaken.set(m.k, m.seat); else seatsTaken.delete(m.k);
      applyOtherSeat(m.k);
    }),
    net.on('area_del', (m) => { seatsTaken.delete(m.k); building.delete(m.k); }),
    // beaten to the seat by someone else
    net.on('error', (m) => { if (m.for === 'area_sit' && seated) { const s = seated; seated = null; seatsTaken.delete(S.me); walker.me.y = 0; walker.me.char.setPose('idle'); s.at = null; } }),
    // the owner of the house you're in left the zone: back to your own
    net.on('member_left', (m) => { hood.sync(); if (m.k === viewKey || !hood.plotOf(viewKey)) visit(S.me); else { restreet(); if (sideOpen && tab === 'visit') renderVisit(); } }),
    net.on('house', (m) => {
      if (m.k !== viewKey) { hood.setHouse(m.k, m.house); if (sideOpen && tab === 'visit') renderVisit(); return; }
      if (m.k === viewKey && home && m.by === S.me) {
        if (echoes > 0) echoes -= 1;
        if (echoes > 0 || saveTimer) { home.likes = m.house.likes; renderHeader(); return; }
      }
      const fresh = !home;
      const { k: _k, trim: _t, trimp: _tp, ...mineNow } = home ? payload() : {};
      const trimSame = (home?.trim ?? TRIM_DEFAULT) === (m.house.trim ?? TRIM_DEFAULT) && JSON.stringify(home?.trimp ?? {}) === JSON.stringify(m.house.trimp ?? {});
      const same = home && JSON.stringify(mineNow) === JSON.stringify({ floor: m.house.floor, wall: m.house.wall, ceiling: m.house.ceiling ?? 'ceil_plain', door: m.house.door ?? 'door_classic', size: m.house.size ?? [14, 14], items: m.house.items, areas: m.house.areas ?? [], careas: m.house.careas ?? [], wallp: m.house.wallp ?? {}, ext: m.house.ext });
      const newLikes = home && m.house.likes.length > home.likes.length;
      if (same && trimSame) home.likes = m.house.likes;
      else {
        if (seated) standUp();
        home = { ...m.house, size: m.house.size ?? [NX, NZ], items: m.house.items.map((it) => ({ ...it })) };
        rebuildItems();
        if (fresh) hood.setActive(viewKey);
        if (!fresh && !mine()) sfx('pop', { vol: 0.4 }); // the owner is redecorating while you watch
      }
      if (newLikes) { stage.people.get(m.k)?.char.emote('heart'); if (m.k === S.me) sfx('like'); }
      if (m.house.builders) {
        // (who may build changed: so does who the locked doors let through)
        const was = JSON.stringify(home.builders ?? []);
        home.builders = m.house.builders;
        if (was !== JSON.stringify(home.builders) && home.items.some((it) => it.lk)) rebuildItems();
      }
      if (edit && !canEdit()) { setEdit(false); toast('Your building permission here was taken away.'); }
      renderAll();
    }),
    net.on('house_slots', (m) => { slots = m.slots; if (sideOpen && tab === 'plots') renderPlots(); }),
    net.on('house_bought', (m) => {
      sfx('buy');
      const upgrade = CATALOG.houseSizes.find((z) => z.id === m.id);
      if (upgrade) { toast(`🏠 Your house can now be up to ${upgrade.w} × ${upgrade.d}! Make it bigger in 🎨 Style.`); return; }
      const item = FURN[m.id] ?? [...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings, ...CATALOG.doors].find((d) => d.id === m.id);
      toast(`🛒 Bought ${item?.name ?? 'it'}!${FURN[m.id] ? ' Find it in 🛋️ Items.' : ' Pick it in 🎨 Style.'}`);
    }),
    net.on('player', (m) => {
      if (!sideOpen) return;
      if (tab === 'visit') renderVisit();
      else if (m.p.key === S.me) renderPanel();
    }),
    net.on('error', (m) => {
      if (m.for === 'house_buy') { confirmBuy = null; renderPanel(); }
    }),
  ];

  // ---- per frame --------------------------------------------------------------------

  const center = new THREE.Vector3(WX() / 2, 0, WZ() / 2);
  const coreFade = basic('#e8d6b8', { transparent: true, opacity: 0.18, depthWrite: false });
  const baseHeight = orbit.height;
  stage.onFrame((dt, now) => {
    const t = now / 1000;
    const p = walker.me;
    if (seated) {
      // hold the seat (the walker can't move us out of the furniture)
      p.x = seated.at.x;
      p.z = seated.at.z;
      p.y = seated.at.y;
      p.heading = seated.at.heading;
      p.moving = false;
    }
    if (edit) {
      // decorating: a floating first-person camera (WASD to glide, Space up, Shift or C down, drag to look);
      // you can't see yourself, and walls and furniture don't get in the way
      const k = stage.keys;
      if (!fly) fly = { x: p.x, y: Math.min(WALL_H * T - 0.4, 2.4), z: p.z };
      let ix = 0, iy = 0;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      if (k.has('w') || k.has('arrowup')) iy -= 1;
      if (k.has('s') || k.has('arrowdown')) iy += 1;
      const sp = 6 * dt;
      if (ix || iy) {
        const fx = -Math.sin(orbit.yaw), fz = -Math.cos(orbit.yaw), rx = Math.cos(orbit.yaw), rz = -Math.sin(orbit.yaw);
        const dx = rx * ix - fx * iy, dz = rz * ix - fz * iy, l = Math.hypot(dx, dz);
        fly.x += (dx / l) * sp; fly.z += (dz / l) * sp;
      }
      if (k.has(' ')) fly.y += sp * 0.7;
      if (k.has('shift') || k.has('c')) fly.y -= sp * 0.7;
      // (anywhere over your plot, and high enough to look down on the roof)
      const lo = { x: -2 * T, z: -2 * T }, hi = { x: (PLOT.w + 2) * T, z: (PLOT.d + 5) * T };
      fly.x = Math.max(lo.x, Math.min(hi.x, fly.x)); fly.z = Math.max(lo.z, Math.min(hi.z, fly.z));
      fly.y = Math.max(0.5, Math.min(WALL_H * T + 20, fly.y));
      stage.person(S.me).visible = false;
      if (!preview.door && !preview.ceiling) {
        orbit.fps = true;
        orbit.target.set(fly.x, 0, fly.z);
        orbit.height = fly.y;
      }
    } else if (fly) {
      // back to walking: where you were, seen from behind again
      fly = null;
      orbit.fps = false; orbit.height = baseHeight;
      stage.person(S.me).visible = true;
    }
    if (edit) {
      if (preview.door) {
        // trying on a door: look at it from inside the room
        if (orbit.fps) { orbit.fps = false; orbit.height = baseHeight; }
        orbit.target.set(WX() / 2, 0, WZ() * 0.6);
        orbit.yaw += (Math.PI - orbit.yaw) * Math.min(1, dt * 4);
        orbit.dist += (7 - orbit.dist) * Math.min(1, dt * 4);
        orbit.pitch += (0.2 - orbit.pitch) * Math.min(1, dt * 4);
      } else if (preview.ceiling) {
        // trying on a ceiling: stand in the middle of the room and slowly look around up at it
        orbit.fps = true;
        orbit.target.copy(center);
        orbit.height = WALL_H * T * 0.3;
        orbit.pitch = -0.55;
        orbit.yaw += dt * 0.25;
      }
    }
    // doors open for whoever walks up to them (swinging away from them) and shut behind them
    const walkers = [walker.me, ...stage.people.values()];
    for (const e of entries) {
      if (e.A.open === undefined) continue;
      const [w, d] = footprint(e.it);
      const cx = (e.it.x + w / 2) * T, cz = (e.it.y + d / 2) * T, h = e.it.r * (Math.PI / 2);
      // (a locked door only opens for the owner and their builders)
      const near = walkers.find((q) => q && Math.hypot(q.x - cx, q.z - cz) < 2.2 && (!e.it.lk || q.k === viewKey || (home.builders ?? []).includes(q.k)));
      const open = near ? 1 : 0;
      if (near) e.A.side = (near.x - cx) * Math.sin(h) + (near.z - cz) * Math.cos(h) > 0 ? 1 : -1;
      if (open !== e.A.open) sfx(open ? 'open' : 'close', { vol: Math.hypot(walker.me.x - cx, walker.me.z - cz) < 6 ? 0.5 : 0.15 });
      e.A.open = open;
    }
    for (const e of entries) {
      e.A.anim = e.A.anim.filter((fn) => !fn(t, dt));
      if (e.bounce < 1) {
        e.bounce = Math.min(1, e.bounce + dt / 0.35);
        const k = Math.sin(e.bounce * Math.PI) * (1 - e.bounce);
        e.group.scale.set(1 + k * 0.25, 1 - k * 0.3, 1 + k * 0.25);
      }
    }
    if (ghost?.visible) ghost.position.y = (kindOf(placing.id) === 'wall' ? heightOf(placing) : kindOf(placing.id) === 'ceiling' && !isDragWall(placing.id) ? WALL_H : 0) + Math.sin(t * 6) * 0.03;
    // hide the walls between the camera and the room
    const c = stage.camera.position;
    if (!edit && orbit.fps) { orbit.fps = false; orbit.height = baseHeight; }
    // walls you've built inside are solid: the camera stops in front of them instead (see stage.applyOrbit)
    // out on the street: whichever house's plot you step onto becomes the house you're at
    const meH = view.toHood(p.x, p.z);
    // a plot someone is building on is closed to everybody who can't build there: wait on the pavement
    const here = !edit && hood.ownerAt(meH.x, meH.z);
    if (here && siteClosed(here)) {
      if (seated) standUp();
      const a = hood.arrival(here), at = view.toLocal(a.x, a.z);
      Object.assign(p, { x: at.x, z: at.z, moving: false });
      if (now - kickedAt > 4000) { kickedAt = now; stage.banner(`<div class="big">🚧 ${esc(nameOf(here))}'s plot is being built on</div>You can go in again when they're done.`, 2600); }
      return;
    }
    if (!edit && !seated) {
      const owner = hood.ownerAt(meH.x, meH.z);
      if (owner && owner !== viewKey) { activate(owner); return; }
    }
    // in a room the camera stays under the ceiling (walls stop it either way, see below)
    const indoors = !edit && grid.indoors(p.x / T, p.z / T);
    stage.camRoom.maxY = indoors ? WALL_H * T - 0.3 : 90;
    // building: the ceilings come off so you can see into the rooms, and the roofs too unless you're working on them
    const roofsOn = !edit || tab === 'paint' || (tab === 'outside' && extPage === 'roof');
    ceilGroup.visible = !edit;
    if (String(roofsOn) !== cutSig) { cutSig = String(roofsOn); hood.showRoofs(viewKey, roofsOn); }
    if (riding && (indoors || !p.char.riding)) setRiding(false); // (mounts wait outside; or you took yours off)
    hood.update(dt);
    // the sun's shadows follow you down the street
    // (in steps, not every frame: a shadow map that slides along with you makes the shadows' edges crawl)
    const sx = Math.round((edit && fly ? fly.x : p.x) / 6) * 6, sz = Math.round((edit && fly ? fly.z : p.z) / 6) * 6;
    // day and night: the sun (or moon) crosses the sky, the street lamps come on after dark
    const sh = view.toHood(sx, sz);
    hood.applyTime({ scene: stage.scene, sun, hemi, x: sx, z: sz, hx: sh.x, hz: sh.z, flip: view.flip });
    if ((clockTick = (clockTick + 1) % 120) === 0) { const el = actions.querySelector('[data-clock]'); if (el) el.textContent = clockText(); }
    if (stage.camRoom) {
      stage.camRoom.blockers = entries.filter((e) => e.roomWall && e.roomWall !== 'hang').map((e) => {
        const [w, d] = footprint(e.it);
        return { x0: e.it.x * T, z0: e.it.y * T, x1: (e.it.x + w) * T, z1: (e.it.y + d) * T };
      });
    }
  });

  net.send('house_all');
  visit(S.me);
  renderAll();
  return () => {
    walker.stop();
    off.forEach((f) => f());
    window.removeEventListener('keydown', onEscape, true);
    if (saveTimer && home && canEdit()) net.send('house_save', payload()); // flush a pending save
    clearTimeout(saveTimer);
    stage.scene?.remove(room.group);
    stage.scene?.remove(hood.group);
  };
}

/** Does the line from (x0, z0) to (x1, z1) pass through the box [ax..bx] x [az..bz]? */
function segHitsRect(x0, z0, x1, z1, ax, az, bx, bz) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dz = z1 - z0;
  for (const [p, q] of [[-dx, x0 - ax], [dx, bx - x0], [-dz, z0 - az], [dz, bz - z0]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}
