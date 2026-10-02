// Houses (3D): every member has a house you can walk around in. Decorate it with furniture you buy
// or win around the zone, then visit (and ❤️) everyone else's. Visiting puts you inside their
// house, together with anyone else who's there. Furniture is usable: lamps switch, the jukebox
// plays, chairs and sofas are for sitting…
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, fmt, me, nameOf, toast } from '../state.js';
import { CATALOG } from '../catalog.js';
import { portraitInto } from '../avatar.js';
import { toon, basic } from '../three/materials.js';
import { buildFurniture, floorTexture, wallTexture, ceilingTexture, wallIsTall, SWATCH, surfaceImage, furnitureThumb } from '../three/furniture.js';
import { sfx } from '../sfx.js';
import { buildDoor, doorImage } from '../three/doors.js';
import { iconSvg } from '../icons.js';

let NX = 14, NZ = 14;  // this room's size in tiles (width x depth: bigger with house upgrades)
const T = 1.6;        // world units per tile, so furniture is people-sized
const WALL_H = 3.2;   // in tiles
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
function setDims([w, d] = [14, 14]) {
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
// free things (plain walls) never run out: you can put up as many as the limit
const owned = (id) => (FURN[id]?.free ? FURN[id].max ?? 99 : me().furni?.[id] ?? 0);
const ownsDeco = (d) => d.free || owned(d.id) > 0;
const MIN_SIZE = 6; // (HOUSE_MIN on the server)
/** The biggest room you can have, from the house upgrades you own: [width, depth]. */
function maxSize() {
  const have = CATALOG.houseSizes.filter((z) => z.free || owned(z.id) > 0);
  return [Math.max(...have.map((z) => z.w)), Math.max(...have.map((z) => z.d))];
}
// where you sit on things (in tiles above the floor)
const BEDS = new Set(['bed', 'bed_princess', 'hammock']);
// top: the height of the cushion/mattress; front: how far its front edge is from the middle (model units)
const SEATS = {
  chair: { top: 0.525, front: 0.25 }, armchair: { top: 0.53, front: 0.41 }, sofa: { top: 0.53, front: 0.41, n: 2 },
  beanbag: { top: 0.5, front: 0.3 }, bed: { top: 0.6, front: 0 }, sofa_pink: { top: 0.53, front: 0.41, n: 2 },
  armchair_pink: { top: 0.53, front: 0.41 }, beanbag_pink: { top: 0.5, front: 0.3 }, bed_princess: { top: 0.6, front: 0 },
  sofa_leather: { top: 0.53, front: 0.41, n: 2 }, armchair_leather: { top: 0.53, front: 0.41 },
  sofa_gray: { top: 0.53, front: 0.41, n: 2 }, armchair_gray: { top: 0.53, front: 0.41 },
  gaming_chair: { top: 0.56, front: 0.25 }, log_bench: { top: 0.62, front: 0.2, n: 2 }, stump_stool: { top: 0.46, front: 0.1 },
  sofa_green: { top: 0.53, front: 0.41, n: 2 }, armchair_green: { top: 0.53, front: 0.41 }, hammock: { top: 0.62, front: 0 }, piano_bench: { top: 0.53, front: 0.19 }, toilet: { top: 0.52, front: 0.28 },
};
// pictures of the real thing: a 3D snapshot of furniture, the actual texture for floors and walls
const furniImg = (id) => `<img class="fem-img" src="${furnitureThumb(id)}" alt="">`;
const decoBg = (id) => (id.startsWith('door_') ? `background:url(${doorImage(id)}) center/cover` : `background:url(${surfaceImage(id)}) center/cover, ${SWATCH[id] ?? '#888'}`);

// furniture snaps to quarter tiles, so things can go almost anywhere
const SNAP = 4;
const snap = (v) => Math.round(v * SNAP) / SNAP;

/** Footprint cells (on the quarter-tile grid) of a placed item, keyed by layer so rugs can sit under furniture. */
function cellsOf(it) {
  const f = FURN[it.id];
  if (!f) return [];
  const kind = kindOf(it.id);
  if (kind === 'wall') {
    const start = Math.round((it.r % 2 === 0 ? it.x : it.y) * SNAP);
    const h = heightOf(it), wh = wallH(it.id);
    const r0 = Math.round((h - wh / 2) * SNAP), r1 = Math.round((h + wh / 2) * SNAP);
    const out = [];
    for (let i = 0; i < f.w * SNAP; i++) for (let j = r0; j < r1; j++) out.push(`wall:${it.r % 4}:${start + i}:${j}`);
    return out;
  }
  const [w, d] = footprint(it);
  const x0 = Math.round(it.x * SNAP), y0 = Math.round(it.y * SNAP);
  const out = [];
  for (let i = 0; i < w * SNAP; i++) for (let j = 0; j < d * SNAP; j++) out.push(`${kind}:${x0 + i}:${y0 + j}`);
  return out;
}

function fits(it) {
  const f = FURN[it.id];
  if (kindOf(it.id) === 'wall') {
    const start = it.r % 2 === 0 ? it.x : it.y;
    if (it.r % 4 === 2 && start < DOOR.x1 && start + f.w > DOOR.x0 && heightOf(it) - wallH(it.id) / 2 < DOOR.h - 0.01) return false; // not over the door
    return start >= 0 && start + f.w <= (it.r % 2 === 0 ? NX : NZ);
  }
  const [w, d] = footprint(it);
  return it.x >= 0 && it.y >= 0 && it.x + w <= NX && it.y + d <= NZ;
}
/** Plain room walls are dragged out to any length (it.l, in tiles); everything else is its own size. */
const isDragWall = (id) => !!FURN[id]?.drag;
const lenOf = (it) => (isDragWall(it.id) ? it.l ?? FURN[it.id].w : FURN[it.id].w);
const footprint = (it) => { const f = FURN[it.id], w = lenOf(it); return it.r % 2 ? [f.d, w] : [w, f.d]; };
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
  items.forEach((o, i) => { if (i !== skip && FURN[o.id]?.room && !isDoor(o.id)) groundCells(o).forEach((c) => set.add(c)); });
  return set;
}
/** A door has to sit wholly inside a wall. */
const inWall = (it, walls) => groundCells(it).every((c) => walls.has(c));
/**
 * How a drawn wall is built: the gaps where doors are in it (in the wall's own frame, which runs from
 * -len/2 to len/2 and may run either way along the room depending on how it's turned), which ends are
 * open (and so get papered), and the solid stretches either side of each door (room tiles).
 */
function wallLayout(it, items, walls) {
  const l = lenOf(it), horiz = it.r % 2 === 0, start = horiz ? it.x : it.y, perp = horiz ? it.y : it.x;
  const sign = it.r % 4 === 0 || it.r % 4 === 3 ? 1 : -1, mid = start + l / 2;
  const gaps = items.filter((o) => isDoor(o.id) && o.r % 2 === it.r % 2 && (horiz ? o.y : o.x) === perp)
    .map((o) => { const a = horiz ? o.x : o.y; return [a, a + FURN[o.id].w]; })
    .filter(([a, b]) => a >= start - 1e-6 && b <= start + l + 1e-6)
    .sort((p, q) => p[0] - q[0]);
  const openings = gaps.map(([a, b]) => [sign * (a - mid), sign * (b - mid)].sort((p, q) => p - q));
  // an end is open unless another wall carries on from it (or it runs into the house's own walls)
  const N = horiz ? NX : NZ, q = 1 / SNAP;
  const covered = (along) => along < 0 || along >= N || walls.has(horiz ? `${Math.round(along * SNAP)}:${Math.round(perp * SNAP)}` : `${Math.round(perp * SNAP)}:${Math.round(along * SNAP)}`);
  const lowOpen = !covered(start - q), highOpen = !covered(start + l);
  const caps = sign > 0 ? [lowOpen, highOpen] : [highOpen, lowOpen];
  const segs = [];
  let a = start;
  for (const [g0, g1] of gaps) { if (g0 > a) segs.push([a, g0]); a = g1; }
  if (start + l > a) segs.push([a, start + l]);
  return { openings, caps, segs };
}

// ---------------------------------------------------------------------------
// the room: floor, four walls (a doorway in the front one) and a garden outside
// ---------------------------------------------------------------------------

function buildRoom() {
  const g = new THREE.Group();
  g.scale.setScalar(T);
  const floorMat = new THREE.MeshToonMaterial({ color: '#ffffff' });
  const floor = new THREE.Mesh(tiledPlane(NX, NZ), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(NX / 2, 0, NZ / 2);
  floor.receiveShadow = true;
  g.add(floor);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(NX + 0.6, 0.4, NZ + 0.6), toon('#6b4a2b'));
  slab.position.set(NX / 2, -0.201, NZ / 2);
  g.add(slab);
  const wallMat = new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  // (room walls you build inside fade out when they're between the camera and you)
  const wallFade = new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.22, depthWrite: false });
  const outside = toon('#e8d6b8');
  const trim = toon('#f4f0ff');
  const wallGrids = [];
  const wallGridMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4 });
  const wall = (w, h, x, y, z, ry, skirting = true) => {
    const grp = new THREE.Group();
    const face = new THREE.Mesh(tiledPlane(w, h, y - h / 2), wallMat);
    face.receiveShadow = true;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), outside);
    shell.position.z = -0.14;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.06), trim);
    base.position.set(0, -h / 2 + 0.08, 0.03);
    grp.add(face, shell);
    if (skirting) grp.add(base);
    // a grid on the wall for hanging things (every half tile up, every tile along)
    const pts = [];
    for (let x = -w / 2; x <= w / 2 + 0.001; x += 1) pts.push(x, -h / 2, 0.012, x, h / 2, 0.012);
    for (let y = -h / 2; y <= h / 2 + 0.001; y += 0.5) pts.push(-w / 2, y, 0.012, w / 2, y, 0.012);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(gg, wallGridMat);
    lines.visible = false;
    grp.add(lines);
    wallGrids.push(lines);
    grp.position.set(x, y, z);
    grp.rotation.y = ry;
    g.add(grp);
    return { grp, face };
  };
  const walls = {
    back: wall(NX, WALL_H, NX / 2, WALL_H / 2, 0, 0),
    left: wall(NZ, WALL_H, 0, WALL_H / 2, NZ / 2, Math.PI / 2),
    right: wall(NZ, WALL_H, NX, WALL_H / 2, NZ / 2, -Math.PI / 2),
  };
  // the front wall is three pieces around the doorway
  const front = new THREE.Group();
  const lw = DOOR.x0, rw = NX - DOOR.x1;
  const fl = wall(lw, WALL_H, lw / 2, WALL_H / 2, NZ, Math.PI);
  const fr = wall(rw, WALL_H, DOOR.x1 + rw / 2, WALL_H / 2, NZ, Math.PI);
  const ft = wall(DOOR.x1 - DOOR.x0, WALL_H - DOOR.h, NX / 2, DOOR.h + (WALL_H - DOOR.h) / 2, NZ, Math.PI, false);
  for (const p of [fl, ft, fr]) front.add(p.grp);
  g.add(front);
  // the front door (closed: walk up to it to go outside), in whichever style the owner picked
  const doorSlot = new THREE.Group();
  doorSlot.position.set(NX / 2, 0, NZ);
  front.add(doorSlot);
  const ceilingMat = new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  const ceiling = new THREE.Mesh(tiledPlane(NX, NZ), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(NX / 2, WALL_H, NZ / 2);
  g.add(ceiling);
  // a pitched roof on top (seen from outside while decorating)
  const roof = new THREE.Group();
  const rise = 2.2 * Math.min(1.5, NX / 10);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-NX / 2 - 0.4, 0); roofShape.lineTo(NX / 2 + 0.4, 0); roofShape.lineTo(0, rise); roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: NZ + 0.8, bevelEnabled: false });
  const roofMesh = new THREE.Mesh(roofGeo, toon('#b3403a'));
  roofMesh.position.set(NX / 2, WALL_H + 0.02, -0.4);
  roof.add(roofMesh);
  g.add(roof);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), toon('#b3203a'));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(NX / 2, 0.01, NZ - 0.45);
  g.add(mat);
  walls.front = { grp: front, faces: [fl.face, fr.face, ft.face] };
  // outside: a lawn with a path to the door, so the doorway never looks into a void
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), toon('#5fae55'));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(NX / 2, -0.4, NZ / 2);
  lawn.receiveShadow = true;
  g.add(lawn);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2, 6), toon('#d8bd88'));
  path.rotation.x = -Math.PI / 2;
  path.position.set(NX / 2, -0.39, NZ + 3.2);
  g.add(path);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = Math.max(NX, NZ) / 2 + 6 + (i % 3) * 2.5;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 8), toon('#7a4a28'));
    trunk.position.y = 0.3;
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + (i % 2) * 0.3, 1), toon(i % 3 ? '#3f9a4a' : '#57b35a'));
    leaves.position.y = 1.6;
    tree.add(trunk, leaves);
    tree.position.set(NX / 2 + Math.cos(a) * r, -0.4, NZ / 2 + Math.sin(a) * r);
    g.add(tree);
  }
  // editing helpers
  const gridPts = [];
  for (let i = 0; i <= NX; i++) gridPts.push(i, 0.015, 0, i, 0.015, NZ);
  for (let i = 0; i <= NZ; i++) gridPts.push(0, 0.015, i, NX, 0.015, i);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }));
  // fainter quarter-tile lines: furniture snaps to these
  const finePts = [];
  for (let i = 0.25; i < NX; i += 0.25) if (i % 1) finePts.push(i, 0.012, 0, i, 0.012, NZ);
  for (let i = 0.25; i < NZ; i += 0.25) if (i % 1) finePts.push(0, 0.012, i, NX, 0.012, i);
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
  g.traverse((o) => { if (o.isMesh && o !== floor && o !== lawn) o.castShadow = true; });
  return { group: g, wallGrids, floor, floorMat, wallMat, wallFade, ceiling, ceilingMat, roof, walls, grid, marker, items, doorSlot };
}

// ---------------------------------------------------------------------------

export function house(stage) {
  const WX = () => NX * T, WZ = () => NZ * T; // the room in world units
  const sun = stage.lights({ background: '#9fd4ff', sky: 0xfff4e6, ground: 0x6a5a8a, hemi: 1.35, sun: 1.7, box: 16 });
  sun.position.set(WX() / 2 + 6, 40, WZ() / 2 + 12); // high overhead so the walls don't shade the floor
  sun.target.position.set(WX() / 2, 0, WZ() / 2);
  let room = buildRoom();
  stage.scene.add(room.group);
  /** The sun's shadows cover the whole room (a big room would otherwise get a dark wedge). */
  function fitSun() {
    const box = Math.max(16, Math.max(WX(), WZ()) * 0.75 + 4);
    Object.assign(sun.shadow.camera, { left: -box, right: box, top: box, bottom: -box });
    sun.shadow.camera.updateProjectionMatrix();
  }
  fitSun();

  const solids = [];
  const bounds = { minX: 0.1, maxX: WX() - 0.1, minZ: 0.1, maxZ: WZ() - 0.1 };
  const walker = stage.walker({
    spawn: { x: WX() / 2, z: WZ() - 4.2 }, speed: 5, solids, bounds,
    orbit: { yaw: 0, pitch: 0.72, dist: 11, minDist: 5, maxDist: 20 },
    ceiling: WALL_H * T - 0.3,
  });
  const walkPointer = stage.onPointer;
  const orbit = stage.orbit;

  stage.hud.innerHTML = `
    <div class="hud-panel house-bar"><div class="house-title"></div><div class="house-actions"></div></div>
    <div class="hud-panel house-side hidden"><div class="tabs house-tabs"></div><div class="house-panel"></div></div>
    <p class="hud-panel arena-help house-hint"></p>`;
  const $h = (sel) => stage.hud.querySelector(sel);
  const titleEl = $h('.house-title'), actions = $h('.house-actions'), side = $h('.house-side');
  const tabsEl = $h('.house-tabs'), panel = $h('.house-panel'), hint = $h('.house-hint');

  let viewKey = null, home = null, edit = false, placing = null, selected = -1, tab = 'visit', sideOpen = false;
  let confirmBuy = null, saveTimer = 0, echoes = 0, ghost = null, seated = null;
  let preview = {};        // { floor?, wall? }: ones you're trying on before buying
  const trying = () => Object.keys(preview).length > 0;
  const isTrying = (id) => Object.values(preview).includes(id);
  let buyThenUse = null;   // put this up as soon as the purchase goes through
  let entries = [];           // built items: { group, use, A, it, bounce, inter }
  const mine = () => viewKey === S.me;
  const payload = () => ({
    floor: home.floor, wall: home.wall, ceiling: home.ceiling ?? 'ceil_plain', door: home.door ?? 'door_classic', size: home.size ?? [14, 14],
    items: home.items.map(({ id, x, y, r, h, l }) => ({ id, x, y, r, ...(h == null ? {} : { h }), ...(l == null ? {} : { l }) })),
  });

  // ---- building the furniture ------------------------------------------------------

  function placeGroup(g, it) {
    const f = FURN[it.id];
    if (kindOf(it.id) === 'wall') {
      const r = it.r % 4;
      const y = heightOf(it);
      if (r === 0) { g.position.set(it.x + f.w / 2, y, 0); g.rotation.y = 0; }
      else if (r === 1) { g.position.set(0, y, it.y + f.w / 2); g.rotation.y = Math.PI / 2; }
      else if (r === 2) { g.position.set(it.x + f.w / 2, y, NZ); g.rotation.y = Math.PI; }
      else { g.position.set(NX, y, it.y + f.w / 2); g.rotation.y = -Math.PI / 2; }
      return;
    }
    const [w, d] = footprint(it);
    g.position.set(it.x + w / 2, kindOf(it.id) === 'ceiling' ? WALL_H : 0, it.y + d / 2);
    g.rotation.y = it.r * (Math.PI / 2);
  }

  function rebuildItems() {
    while (room.items.children.length) room.items.remove(room.items.children[0]);
    stage.interactables = stage.interactables.filter((i) => !i.house);
    solids.length = 0;
    const walls = roomWallCells(home.items);
    entries = home.items.map((it, index) => {
      const layout = isDragWall(it.id) ? wallLayout(it, home.items, walls) : null;
      const built = buildFurniture(it.id, { drop: kindOf(it.id) === 'ceiling' ? heightOf(it) : 0, len: isDragWall(it.id) || isDoor(it.id) ? lenOf(it) : 0, openings: layout?.openings, caps: layout?.caps });
      built.group.userData.index = index;
      placeGroup(built.group, it);
      built.group.visible = !(placing && placing.from === index);
      room.items.add(built.group);
      const entry = { ...built, it, bounce: 1 };
      const kind = kindOf(it.id);
      const [w, d] = footprint(it);
      const wr = it.r % 4, half = FURN[it.id].w / 2;
      const cx = kind === 'wall' ? [it.x + half, 0.6, it.x + half, NX - 0.6][wr] : it.x + w / 2;
      const cz = kind === 'wall' ? [0.6, it.y + half, NZ - 0.6, it.y + half][wr] : it.y + d / 2;
      const f0 = FURN[it.id];
      if (isDoor(it.id)) {
        // a door in a wall: you walk through it (it opens for you)
      } else if (f0.room) {
        // walls you build inside: papered like the room, and solid right up to their ends (but not
        // through the doors in them)
        built.group.traverse((o) => { if (o.userData.wallpaper) o.material = room.wallMat; });
        entry.roomWall = true;
        if (layout) {
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
      if (f.room) return entry; // (nothing to use on a wall)
      entry.inter = stage.interactable({
        x: cx * T, z: cz * T, r: Math.max(w, d) * T * 0.5 + 1.1, obj: built.group,
        label: seat ? `${BEDS.has(it.id) ? 'lie on' : 'sit on'} the ${f.name.toLowerCase()}` : f.action === 'wardrobe' ? 'open your wardrobe' : `use the ${f.name.toLowerCase()}`,
        use: () => { if (!edit) useItem(entry); },
      });
      entry.inter.house = true;
      return entry;
    });
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

  /** Floor + wallpaper on the room, showing a previewed (not yet bought) one if you're trying it on. */
  function applySurfaces() {
    if (!home) return;
    const floor = preview.floor ?? home.floor;
    const wall = preview.wall ?? home.wall;
    // (the room's planes carry their own tiling in their UVs, so every texture repeats once per 2 tiles)
    room.floorMat.map = floorTexture(floor);
    room.floorMat.map.repeat.set(1, 1);
    room.floorMat.needsUpdate = true;
    const wt = wallTexture(wall);
    // full-height wallpapers (murals, wainscoting) span floor to ceiling once instead of repeating up the wall
    wt.repeat.set(1, wallIsTall(wall) ? 2 / WALL_H : 1);
    room.wallMat.map = room.wallFade.map = wt;
    room.wallMat.needsUpdate = room.wallFade.needsUpdate = true;
    const ct = ceilingTexture(preview.ceiling ?? home.ceiling ?? 'ceil_plain');
    ct.repeat.set(1, 1);
    room.ceilingMat.map = ct;
    room.ceilingMat.needsUpdate = true;
    const doorId = preview.door ?? home.door ?? 'door_classic';
    if (room.doorSlot.userData.id !== doorId) {
      room.doorSlot.clear();
      room.doorSlot.add(buildDoor(doorId));
      room.doorSlot.userData.id = doorId;
    }
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
  const takenBy = (i, s) => [...seatsTaken].find(([k, v]) => k !== S.me && v && v[0] === i && v[1] === s)?.[0];

  /** Sit down on the nearest free seat of a piece (E again stands you up). */
  function sit(entry) {
    const i = entries.indexOf(entry), n = seatCount(entry.it.id);
    const free = [...Array(n).keys()].filter((s) => takenBy(i, s) == null);
    if (!free.length) { toast(n > 1 ? "It's full! Every seat is taken." : "Someone's already sitting there!"); return; }
    const p = walker.me;
    const pick = free.sort((a, b) => seatSpot(entry.it, a).dist(p) - seatSpot(entry.it, b).dist(p))[0];
    seated = entry;
    entry.seat = pick;
    entry.at = placeOnSeat(p, entry.it, pick);
    seatsTaken.set(S.me, [i, pick]);
    net.send('area_sit', { seat: [i, pick] });
    net.send('area_move', { x: +p.x.toFixed(2), z: +p.z.toFixed(2), h: +p.heading.toFixed(2) });
    sfx(BEDS.has(entry.it.id) ? 'snore' : 'squish');
  }
  /** Where seat s of a piece is, across its width (in world units, before any perching forward). */
  function seatSpot(it, s) {
    const [w, d] = footprint(it), n = seatCount(it.id);
    const h = it.r * (Math.PI / 2), off = (s - (n - 1) / 2) * (FURN[it.id].w / n) * T;
    const x = (it.x + w / 2) * T + Math.cos(h) * off, z = (it.y + d / 2) * T - Math.sin(h) * off;
    return { x, z, dist: (p) => Math.hypot(p.x - x, p.z - z) };
  }
  /** Pose person p on seat s of a piece; returns where they ended up. */
  function placeOnSeat(p, it, s) {
    const seat = SEATS[it.id], bed = BEDS.has(it.id);
    const heading = it.r * (Math.PI / 2), fx = Math.sin(heading), fz = Math.cos(heading);
    p.heading = heading;
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
    const v = seatsTaken.get(k), entry = v && entries[v[0]];
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
    const fx = Math.sin(it.r * (Math.PI / 2)), fz = Math.cos(it.r * (Math.PI / 2));
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

  function useItem(entry) {
    entry.bounce = 0;
    const f = FURN[entry.it.id];
    if (seated) { standUp(); return; } // E again gets you up
    if (SEATS[entry.it.id] != null) { sit(entry); return; }
    entry.use?.();
    if (f?.use) sfx(f.use);
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
    ghost = buildFurniture(placing.id, { drop: kindOf(placing.id) === 'ceiling' ? heightOf(placing) : 0, len: isDragWall(placing.id) ? lenOf(placing) : 0 }).group;
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
    const it = { id: placing.id, x: placing.x, y: placing.y, r: placing.r, h: placing.h, l: placing.l };
    if (kindOf(placing.id) === 'ceiling' && ghost.userData.drop !== heightOf(placing)) { buildGhost(); return updateGhost(); }
    if (isDragWall(placing.id) && ghost.userData.len !== lenOf(placing)) { buildGhost(); return updateGhost(); }
    const taken = takenCells(placing.from);
    placing.valid = !placing.tooShort && fits(it) && !cellsOf(it).some((c) => taken.has(c)) && !blocksDoor(it)
      && (!isDoor(placing.id) || inWall(it, roomWallCells(home.items, placing.from)));
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
      if (r === 0) { m.rotation.set(0, 0, 0); m.position.set(it.x + f.w / 2, y, 0.02); }
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
  function blocksDoor(it) {
    if (kindOf(it.id) !== 'floor') return false;
    const [w, d] = footprint(it);
    return it.x < DOOR.x1 && it.x + w > DOOR.x0 && it.y + d > NZ - 1;
  }

  function aimPlacement() {
    const f = FURN[placing.id];
    stage.raycaster.setFromCamera(stage.mouse, stage.camera);
    if (kindOf(placing.id) === 'wall') {
      const faces = [room.walls.back.face, room.walls.left.face, ...room.walls.front.faces, room.walls.right.face];
      const h = stage.raycaster.intersectObjects(faces.filter((o) => o.parent.visible && o.parent.parent.visible !== false))[0];
      if (!h) { placing.x = -1; return; }
      const local = room.group.worldToLocal(h.point.clone());
      const r = h.object === room.walls.back.face ? 0 : h.object === room.walls.left.face ? 1 : h.object === room.walls.right.face ? 3 : 2;
      placing.r = r;
      placing.h = clampHeight(placing, local.y); // as high up the wall as you point
      if (r % 2 === 0) { placing.y = 0; placing.x = Math.max(0, Math.min(NX - f.w, snap(local.x - f.w / 2))); }
      else { placing.x = 0; placing.y = Math.max(0, Math.min(NZ - f.w, snap(local.z - f.w / 2))); }
      return;
    }
    if (isDragWall(placing.id) && placing.from < 0) { aimWall(); return; }
    if (isDoor(placing.id)) { aimDoor(); return; }
    const p = stage.pointerOnPlane(0);
    if (!p) { placing.x = -1; return; }
    const [w, d] = footprint(placing);
    placing.x = Math.max(0, Math.min(NX - w, snap(p.x / T - w / 2)));
    placing.y = Math.max(0, Math.min(NZ - d, snap(p.z / T - d / 2)));
  }

  /** A door snaps into whichever wall you point at (or near), centred on the pointer along it. */
  function aimDoor() {
    const p = stage.pointerOnPlane(0);
    if (!p) { placing.x = -1; return; }
    const px = p.x / T, pz = p.z / T, fw = FURN[placing.id].w;
    let best = null, bestD = 0.9;
    home.items.forEach((o, i) => {
      if (!isDragWall(o.id) || i === placing.from) return;
      const l = lenOf(o), horiz = o.r % 2 === 0;
      const along = horiz ? px : pz, across = horiz ? pz - (o.y + 0.125) : px - (o.x + 0.125), start = horiz ? o.x : o.y;
      const off = Math.max(0, start - along, along - (start + l));
      const dist = Math.hypot(off, across);
      if (l >= fw && dist < bestD) { bestD = dist; best = o; }
    });
    if (!best) {
      // not near a wall: show it (red) where you're pointing
      Object.assign(placing, { x: Math.max(0, Math.min(NX - fw, snap(px - fw / 2))), y: Math.max(0, Math.min(NZ - 0.25, snap(pz))), r: 0 });
      return;
    }
    const l = lenOf(best), horiz = best.r % 2 === 0, start = horiz ? best.x : best.y;
    const a = Math.max(start, Math.min(start + l - fw, snap((horiz ? px : pz) - fw / 2)));
    Object.assign(placing, horiz ? { x: a, y: best.y, r: 0 } : { x: best.x, y: a, r: 1 });
  }

  /** The quarter-tile grid point under the pointer (in tiles), or null off the floor. */
  function floorPoint() {
    const p = stage.pointerOnPlane(0);
    if (!p) return null;
    return { x: Math.max(0, Math.min(NX, snap(p.x / T))), y: Math.max(0, Math.min(NZ, snap(p.z / T))) };
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
    const q = 1 / SNAP;
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
    placing = { id, r: from >= 0 ? home.items[from].r : 0, from, x: -1, y: -1, valid: false, h: from >= 0 ? heightOf(home.items[from]) : kindOf(id) === 'ceiling' ? 0.4 : WALL_Y };
    if (isDragWall(id)) Object.assign(placing, { l: from >= 0 ? lenOf(home.items[from]) : 1 / SNAP, start: null, armed: false });
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
    const it = { id: placing.id, x: placing.x, y: placing.y, r: placing.r };
    if (kindOf(placing.id) !== 'floor' && kindOf(placing.id) !== 'rug') it.h = placing.h;
    if (isDragWall(placing.id)) it.l = placing.l;
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
    if (placing) {
      if ((isDragWall(placing.id) && placing.from < 0) || isDoor(placing.id)) return; // (drawn walls go whichever way you drag; doors go along their wall)
      if (kindOf(placing.id) !== 'wall') { placing.r = (placing.r + 1) % 4; sfx('rotate'); updateGhost(); }
      return;
    }
    if (selected < 0) return;
    const it = home.items[selected];
    if (kindOf(it.id) === 'wall') return;
    const next = { ...it, r: (it.r + 1) % 4 };
    const taken = new Set();
    home.items.forEach((o, i) => { if (i !== selected) cellsOf(o).forEach((c) => taken.add(c)); });
    if (!fits(next) || cellsOf(next).some((c) => taken.has(c)) || blocksDoor(next)) { sfx('error'); toast('No room to turn it there.', 'error'); return; }
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
    if (!fits(next) || cellsOf(next).some((c) => taken.has(c))) { sfx('error'); toast('Something is in the way.', 'error'); return; }
    home.items[selected] = next;
    commit('rotate');
  }

  /** Make the selected wall a quarter tile longer or shorter (from its far end). */
  function resizeWall(dir) {
    if (selected < 0) return;
    const it = home.items[selected];
    if (!isDragWall(it.id)) return;
    const next = { ...it, l: Math.max(1 / SNAP, lenOf(it) + dir / SNAP) };
    if (next.l === lenOf(it) || !fits(next) || cellsOf(next).some((c) => takenCells(selected).has(c)) || blocksDoor(next)) { sfx('error'); return; }
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
    const orphans = home.items.filter((it) => isDoor(it.id) && !inWall(it, walls));
    if (orphans.length) {
      const sel = home.items[selected];
      home.items = home.items.filter((it) => !orphans.includes(it));
      selected = sel ? home.items.indexOf(sel) : -1;
      toast(`🚪 Put away ${orphans.length > 1 ? `${orphans.length} doors` : 'a door'} that wasn't in a wall any more.`);
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
    if (!home || !mine()) return;
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
        if (d?.moved) placeWall(false);
        else if (placing.armed) placeWall(true);
        else placing.armed = true;
        return;
      }
      if (type === 'up' && d && !d.moved && d.button === 2) { cancelWall(); return; }
    }
    if (type === 'move' && placing) { aimPlacement(); updateGhost(); }
    if (type !== 'up' || !d || d.moved) return;
    if (d.button === 2) { rotate(); return; }
    if (placing) { aimPlacement(); updateGhost(); place(); return; }
    const idx = pickItem();
    selected = idx === selected ? -1 : idx;
    if (idx >= 0) { sfx('pickup', { vol: 0.5 }); entries[idx].bounce = 0; }
    renderSelection();
    renderAll();
  };
  stage.onKey = (e, down) => {
    if (!down) return;
    const k = e.key.toLowerCase();
    // once you sit down you stay put until you press E again
    if (seated && k === 'e' && !e.repeat && !stage.near) { standUp(); return; } // (if nothing else caught the E)
    if (edit && mine()) {
      if (k === 'r') { stage.keys.delete('r'); if (!e.repeat) rotate(); } // R turns furniture instead of the camera
      else if (k === ']' || k === 'pageup') nudgeHeight(1);
      else if (k === '[' || k === 'pagedown') nudgeHeight(-1);
      else if ((k === 'delete' || k === 'backspace') && selected >= 0) { e.preventDefault(); storeSelected(); }
    }
  };
  // Escape cancels placing/selection before it would close the house
  const onEscape = (e) => {
    if (e.key !== 'Escape' || !(placing || selected >= 0 || sideOpen)) return;
    e.stopPropagation();
    if (placing) cancelWall();
    else if (selected >= 0) { selected = -1; renderSelection(); renderAll(); }
    else { sideOpen = false; if (edit) setEdit(false); renderAll(); }
  };
  window.addEventListener('keydown', onEscape, true);

  // ---- HUD ------------------------------------------------------------------------------

  function renderAll() {
    renderHeader();
    side.classList.toggle('hidden', !sideOpen);
    side.classList.toggle('wide', sideOpen && tab !== 'visit');
    if (sideOpen) { renderTabs(); renderPanel(); }
    hint.innerHTML = !home ? 'Knocking on the door…'
      : placing && isDragWall(placing.id) && placing.from < 0 ? (placing.start
        ? `Drag (or move and click) to where the wall ends · walls join up flush at corners · <kbd>Esc</kbd> to let go`
        : `Press on the floor where the wall starts and drag it out to any length (or click the start, then the end) · <kbd>Esc</kbd> when you're done`)
      : placing && isDoor(placing.id) ? 'Point at a wall you\'ve built and click to put the door in it · <kbd>Esc</kbd> to cancel'
      : placing ? `Click to place · <kbd>R</kbd>/right-click to rotate · <kbd>Esc</kbd> to cancel${kindOf(placing.id) === 'wall' ? ' · point anywhere on a wall, as high or low as you like' : kindOf(placing.id) === 'ceiling' ? ' · it hangs above the green square · <kbd>[</kbd> <kbd>]</kbd> lower / raise it' : ''}`
        : edit ? 'Click furniture to select it · <kbd>R</kbd> rotate · <kbd>Del</kbd> put away · drag to turn the camera'
          : 'Walk around with <kbd>WASD</kbd> · <kbd>E</kbd> uses furniture (sit on chairs!) · head to the front door to leave';
  }

  function renderHeader() {
    const p = S.players[viewKey];
    const name = mine() ? 'My House' : `${esc(p?.name ?? '?')}'s House`;
    titleEl.innerHTML = `${iconSvg('house')} ${name}`;
    stage.title.innerHTML = `${iconSvg('house')} ${name}`;
    const likes = home?.likes ?? [];
    const liked = likes.includes(S.me);
    actions.innerHTML = [
      `<span class="pill">❤️ ${likes.length}</span>`,
      !mine() ? `<button class="btn small ${liked ? '' : 'primary'}" data-like ${liked ? 'disabled' : ''}>${liked ? '❤️ Liked' : '🤍 Like'}</button>` : '',
      mine() ? `<button class="btn small ${edit ? 'primary' : ''}" data-edit>${edit ? '✅ Done' : '✏️ Decorate'}</button>` : '',
      `<button class="btn small ${sideOpen && tab === 'visit' ? 'primary' : ''}" data-visits>🏘️ Visit</button>`,
      !mine() ? '<button class="btn small" data-home>🏡 My house</button>' : '',
    ].join('');
  }

  function renderTabs() {
    const list = [['visit', '🏘️ Visit'], ...(mine() ? [['items', '🛋️ Items'], ['shop', '🛒 Shop'], ['style', '🎨 Style']] : [])];
    if (!list.some(([id]) => id === tab)) tab = 'visit';
    tabsEl.innerHTML = list.map(([id, label]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${label}</button>`).join('');
  }

  function renderPanel() {
    if (!sideOpen) return;
    if (tab === 'visit') return renderVisit();
    if (tab === 'items') return renderItems();
    if (tab === 'shop') return renderShop();
    return renderStyle();
  }

  function renderVisit() {
    const list = Object.values(S.players).sort((a, b) => (b.key === S.me) - (a.key === S.me) || (b.house?.likes ?? 0) - (a.house?.likes ?? 0) || a.name.localeCompare(b.name));
    const here = (k) => Object.values(S.players).filter((p) => p.online && p.scene === `house:${k}`).length;
    panel.innerHTML = `<div class="visit-list">${list.map((p) => `
      <button class="visit-row ${p.key === viewKey ? 'on' : ''}" data-visit="${esc(p.key)}">
        <span class="vav"></span>
        <span class="vname"><b>${esc(p.name)}${p.key === S.me ? ' <small>(you)</small>' : ''}</b>
          <small>🛋️ ${p.house?.n ?? 0} · ❤️ ${p.house?.likes ?? 0}${here(p.key) ? ` · <span class="win">${here(p.key)} inside</span>` : ''}</small></span>
        <span class="vgo">${p.key === viewKey ? 'Here' : 'Go →'}</span>
      </button>`).join('')}</div>`;
    panel.querySelectorAll('[data-visit]').forEach((el) => portraitInto(el.querySelector('.vav'), S.players[el.dataset.visit]?.look, 40, 40, { zoom: 'head' }));
  }

  function placedCount(id) {
    return home ? home.items.filter((it, i) => it.id === id && !(placing && placing.from === i)).length : 0;
  }

  function renderItems() {
    const sel = selected >= 0 ? home?.items[selected] : null;
    // free walls come first (they never run out); retired pieces only show while one is still up
    const ownedList = CATALOG.furniture.filter((f) => owned(f.id) > 0 && !(f.retired && !placedCount(f.id))).sort((a, b) => !!b.free - !!a.free);
    panel.innerHTML = `
      ${sel ? `<div class="sel-box"><span class="sel-em">${furniImg(sel.id)}</span><b>${esc(FURN[sel.id].name)}</b>
        <div class="row"><button class="btn small" data-act="rotate" ${kindOf(sel.id) === 'wall' ? 'disabled' : ''}>⟳ Rotate</button>
        ${kindOf(sel.id) === 'wall' || kindOf(sel.id) === 'ceiling' ? '<button class="btn small" data-act="up" title="[ ]">▲ Up</button><button class="btn small" data-act="down" title="[ ]">▼ Down</button>' : ''}
        ${isDragWall(sel.id) ? `<button class="btn small" data-act="shorter">− Shorter</button><button class="btn small" data-act="longer">＋ Longer</button><span class="muted small">${lenOf(sel)} tiles</span>` : ''}
        <button class="btn small" data-act="move">✥ Move</button><button class="btn small" data-act="store">⬇ Put away</button></div></div>` : ''}
      <p class="muted small">Pick something to place it:</p>
      <div class="furni-grid">${ownedList.map((f) => {
        const left = owned(f.id) - placedCount(f.id);
        return `<button class="furni ${left ? '' : 'used'}" data-place="${f.id}" ${left ? '' : 'disabled'} title="${esc(f.name)}">
          <span class="fem">${furniImg(f.id)}</span><span class="fname">${esc(f.name)}</span><span class="fcount">${f.free ? (f.drag ? 'Free · drag to draw' : 'Free') : `${left}/${owned(f.id)} left`}</span></button>`;
      }).join('')}</div>
      ${ownedList.length ? '' : '<p class="muted">Nothing yet! Buy furniture in the Shop, or win trophies around the zone.</p>'}`;
  }

  function shopTile(item, kind) {
    const have = owned(item.id);
    const deco = kind !== 'furni';
    const max = deco ? 1 : item.max ?? 10;
    let foot;
    if (item.exclusive) foot = have ? 'Owned ✓' : '∞ · admins only';
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
  const SHOP_PAGES = [['furniture', '🛋️ Furniture'], ['rooms', '🧱 Walls & doors'], ['wall', '🖼️ Wallpaper'], ['floor', '🟫 Floors'], ['ceiling', '☁️ Ceilings'], ['door', '🚪 Front doors'], ['earn', '🏆 Earn']];
  const STYLE_PAGES = [['wall', '🖼️ Wallpaper'], ['floor', '🟫 Floor'], ['ceiling', '☁️ Ceiling'], ['door', '🚪 Front door'], ['size', '🏠 Room size']];
  const SET_LABEL = {
    Classics: '🛋️ Classics', Sweetheart: '💗 Sweetheart set', Rustic: '🪵 Rustic set', Modern: '🤍 Modern set', Nature: '🌿 Nature set',
    Plants: '🪴 Plants', Bathroom: '🛁 Bathroom', Gamer: '🎮 Gamer set', Lights: '💡 Lights & ceiling', 'Wall decor': '🖼️ Wall decor', Rooms: '🧱 Walls & doorways',
  };
  const DECO_LISTS = { floor: CATALOG.floors, wall: CATALOG.walls, ceiling: CATALOG.ceilings, door: CATALOG.doors };
  let shopPage = 'furniture', stylePage = 'wall';
  const shelfId = (g) => `shelf-${String(g).replace(/\W+/g, '')}`;
  /** Items grouped into labelled shelves, in the order the groups first appear. */
  function shelves(list, groupOf, tile, label = (g) => esc(g), grid = 'furni-grid') {
    const groups = [...new Set(list.map(groupOf))];
    return groups.map((g) => `<div class="wd-label shelf-label" id="${shelfId(g)}">${label(g)}</div>
      <div class="${grid}">${list.filter((x) => groupOf(x) === g).map(tile).join('')}</div>`).join('');
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
      body = (shopPage === 'rooms' ? '<p class="muted small">Plain walls are <b>free</b>: pick 🧱 Room Wall in 🛋️ Items and drag it across the floor to any length. Put doorways and doors in the gaps.</p>' : '')
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
      <button class="style-opt ${home?.[field] === d.id && !preview[field] ? 'on' : ''} ${isTrying(d.id) ? 'previewing' : ''} ${ownsDeco(d) ? '' : 'locked'}" data-style="${field}:${d.id}" title="${esc(d.name)}">
        <span class="style-sw" style="${decoBg(d.id)}"></span><span>${esc(d.name)}</span>
        <small>${ownsDeco(d) ? (home?.[field] === d.id ? '✓ Using' : 'Owned') : isTrying(d.id) ? '👀 Trying on' : `🪙 ${fmt(d.price)}`}</small></button>`;
    let body;
    if (stylePage === 'size') {
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
      const groupOf = (d) => (ownsDeco(d) ? '✓ Yours' : d.group ?? 'More');
      const sorted = [...list.filter(ownsDeco), ...list.filter((d) => !ownsDeco(d))];
      body = jumpStrip([...new Set(sorted.map(groupOf))]) + shelves(sorted, groupOf, opt(stylePage), (g) => esc(g), 'style-grid');
    }
    panel.innerHTML = `${pageStrip(STYLE_PAGES, stylePage, 'style-page')}${previewBar()}${body}`;
  }

  stage.hud.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-visit],[data-visits],[data-like],[data-edit],[data-home],[data-act],[data-place],[data-buy],[data-style],[data-preview-buy],[data-preview-stop],[data-size],[data-shop-page],[data-style-page],[data-jump]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.shopPage) { shopPage = ds.shopPage; confirmBuy = null; renderPanel(); panel.scrollTop = 0; return; }
    if (ds.stylePage) { stylePage = ds.stylePage; confirmBuy = null; renderPanel(); panel.scrollTop = 0; return; }
    if (ds.jump) { panel.querySelector(`#${ds.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (ds.size) { resize(ds.size); return; }
    if (ds.previewBuy != null) {
      const id = preview[ds.previewBuy];
      if (id) { buyThenUse = { field: ds.previewBuy, id }; net.send('house_buy', { id }); }
      return;
    }
    if (ds.previewStop != null) { setPreview(ds.previewStop, null); renderPanel(); return; }
    if (ds.tab) {
      tab = ds.tab;
      confirmBuy = null;
      if (trying()) setPreview(null);
      if (tab !== 'visit' && mine() && !edit) setEdit(true);
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
      if (confirmBuy === ds.buy) { net.send('house_buy', { id: ds.buy }); confirmBuy = null; if (ds.kind) buyThenUse = { field: ds.kind, id: ds.buy }; }
      else confirmBuy = ds.buy;
      renderPanel();
    } else if (ds.style) {
      const [field, id] = ds.style.split(':');
      const d = [...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings, ...CATALOG.doors].find((x) => x.id === id);
      if (!ownsDeco(d)) { setPreview(field, id); sfx('pop', { vol: 0.4 }); renderPanel(); return; }
      if (preview[field]) setPreview(field, null);
      if (home[field] !== id) { home[field] = id; commit('paint'); } else renderPanel();
    }
  });

  /** Make your room a tile wider/narrower or deeper/shallower ("w:1", "d:-1"); anything that no
   *  longer fits goes back in your inventory. */
  function resize(step) {
    if (!home || !mine()) return;
    const [axis, delta] = step.split(':');
    const [mw, md] = maxSize();
    const size = [...(home.size ?? [14, 14])];
    const i = axis === 'w' ? 0 : 1;
    size[i] = Math.max(MIN_SIZE, Math.min(i ? md : mw, size[i] + Number(delta)));
    if (size[0] === home.size?.[0] && size[1] === home.size?.[1]) return;
    home.size = size;
    applySize(size);
    const keep = [], taken = new Set();
    let dropped = 0;
    for (const it of home.items) {
      const cells = cellsOf(it);
      if (fits(it) && !blocksDoor(it) && !cells.some((c) => taken.has(c))) { keep.push(it); cells.forEach((c) => taken.add(c)); } else dropped++;
    }
    home.items = keep;
    selected = -1;
    if (dropped) toast(`📦 Put away ${dropped} thing${dropped > 1 ? 's' : ''} that didn't fit any more.`);
    commit('place');
  }

  function setEdit(on) {
    edit = on && mine();
    if (!edit && trying()) setPreview(null);
    room.grid.visible = edit;
    room.wallGrids.forEach((l) => { l.visible = edit; });
    if (edit) { sideOpen = true; if (tab === 'visit') tab = 'items'; if (seated) standUp(); }
    else {
      if (placing) stopPlacing();
      selected = -1;
      renderSelection();
      if (tab !== 'visit') sideOpen = false;
    }
  }

  /** Walk into someone's house (your own included). */
  function visit(k) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
      if (home && mine()) net.send('house_save', payload());
    }
    if (placing) stopPlacing();
    if (seated) standUp();
    setEdit(false);
    viewKey = k;
    home = null;
    selected = -1;
    echoes = 0;
    while (room.items.children.length) room.items.remove(room.items.children[0]);
    stage.interactables = stage.interactables.filter((i) => !i.house);
    solids.length = 0;
    Object.assign(walker.me, { x: WX() / 2, z: WZ() - 4.2, heading: Math.PI });
    net.send('scene', { scene: `house:${k}` });
    net.send('house_get', { k });
    sfx('knock');
    if (k !== S.me) stage.banner(`<div class="big">🏠 ${esc(nameOf(k))}'s House</div>Make yourself at home!`, 2200);
    renderAll();
  }

  // leave through the front door
  const exitDoor = stage.interactable({ x: WX() / 2, z: WZ() - 0.6, r: 2.3, label: 'go back outside', use: () => stage.onExit?.() });

  /** Build the room at this house's size (only when it changes: visiting a bigger house, or resizing yours). */
  function applySize(size = [14, 14]) {
    if (size[0] === NX && size[1] === NZ && room) return;
    const wasIn = { x: walker.me.x / WX(), z: walker.me.z / WZ() };
    setDims(size);
    if (ghost) room.group.remove(ghost);
    stage.scene.remove(room.group);
    room = buildRoom();
    stage.scene.add(room.group);
    room.grid.visible = edit;
    room.wallGrids.forEach((l) => { l.visible = edit; });
    ghost = null;
    buildGhost();
    Object.assign(bounds, { maxX: WX() - 0.1, maxZ: WZ() - 0.1 });
    if (stage.camRoom) Object.assign(stage.camRoom, { maxX: WX() - 0.1, maxZ: WZ() - 0.1 });
    Object.assign(exitDoor, { x: WX() / 2, z: WZ() - 0.6 });
    center.set(WX() / 2, 0, WZ() / 2);
    sun.position.set(WX() / 2 + 6, 40, WZ() / 2 + 12);
    sun.target.position.set(WX() / 2, 0, WZ() / 2);
    fitSun();
    // stay at the same spot in the room, relatively (resizing your own house while standing in it)
    walker.me.x = Math.min(WX() - 0.6, Math.max(0.6, wasIn.x * WX()));
    walker.me.z = Math.min(WZ() - 0.6, Math.max(0.6, wasIn.z * WZ()));
  }

  // ---- network ------------------------------------------------------------------------

  const off = [
    net.on('player', (m) => {
      if (m.p.key !== S.me || !buyThenUse || !home || !mine()) return;
      const d = [...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings, ...CATALOG.doors].find((x) => x.id === buyThenUse.id);
      if (!d || !ownsDeco(d)) return;
      const { field, id } = buyThenUse;
      buyThenUse = null;
      delete preview[field];
      home[field] = id;
      commit('paint');
    }),
    net.on('area', (m) => {
      seatsTaken.clear();
      for (const q of m.others) if (q.seat) seatsTaken.set(q.k, q.seat);
      setTimeout(applyAllSeats, 0); // (after the walker has added everyone)
    }),
    net.on('area_sit', (m) => {
      if (m.seat) seatsTaken.set(m.k, m.seat); else seatsTaken.delete(m.k);
      applyOtherSeat(m.k);
    }),
    net.on('area_del', (m) => seatsTaken.delete(m.k)),
    // beaten to the seat by someone else
    net.on('error', (m) => { if (m.for === 'area_sit' && seated) { const s = seated; seated = null; seatsTaken.delete(S.me); walker.me.y = 0; walker.me.char.setPose('idle'); s.at = null; } }),
    // the owner of the house you're in left the zone: back to your own
    net.on('member_left', (m) => { if (m.k === viewKey) visit(S.me); else if (sideOpen && tab === 'visit') renderVisit(); }),
    net.on('house', (m) => {
      if (m.k !== viewKey) { if (sideOpen && tab === 'visit') renderVisit(); return; }
      if (m.k === S.me && home) {
        if (echoes > 0) echoes -= 1;
        if (echoes > 0 || saveTimer) { home.likes = m.house.likes; renderHeader(); return; }
      }
      const fresh = !home;
      const same = home && JSON.stringify(payload()) === JSON.stringify({ floor: m.house.floor, wall: m.house.wall, ceiling: m.house.ceiling ?? 'ceil_plain', door: m.house.door ?? 'door_classic', size: m.house.size ?? [14, 14], items: m.house.items });
      const newLikes = home && m.house.likes.length > home.likes.length;
      if (same) home.likes = m.house.likes;
      else {
        if (seated) standUp();
        home = { ...m.house, size: m.house.size ?? [14, 14], items: m.house.items.map((it) => ({ ...it })) };
        applySize(home.size);
        rebuildItems();
        if (!fresh && !mine()) sfx('pop', { vol: 0.4 }); // the owner is redecorating while you watch
      }
      if (newLikes) { stage.people.get(m.k)?.char.emote('heart'); if (m.k === S.me) sfx('like'); }
      renderAll();
    }),
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
      } else if (orbit.fps) { orbit.fps = false; orbit.height = baseHeight; }
      // (otherwise decorating keeps your usual camera: you stay in the room, walking about as normal)
    }
    // doors open for whoever walks up to them (swinging away from them) and shut behind them
    const walkers = [walker.me, ...stage.people.values()];
    for (const e of entries) {
      if (e.A.open === undefined) continue;
      const [w, d] = footprint(e.it);
      const cx = (e.it.x + w / 2) * T, cz = (e.it.y + d / 2) * T, h = e.it.r * (Math.PI / 2);
      const near = walkers.find((q) => q && Math.hypot(q.x - cx, q.z - cz) < 2.2);
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
    if (ghost?.visible) ghost.position.y = (kindOf(placing.id) === 'wall' ? heightOf(placing) : kindOf(placing.id) === 'ceiling' ? WALL_H : 0) + Math.sin(t * 6) * 0.03;
    // hide the walls between the camera and the room
    const c = stage.camera.position;
    if (!edit && orbit.fps) { orbit.fps = false; orbit.height = baseHeight; }
    room.walls.front.grp.visible = c.z < WZ() - 0.2;
    room.walls.back.grp.visible = c.z > 0.2;
    room.walls.left.grp.visible = c.x > 0.2;
    room.walls.right.grp.visible = c.x < WX() - 0.2;
    // walls you've built inside are solid: the camera stops in front of them instead (see stage.applyOrbit)
    if (stage.camRoom) {
      stage.camRoom.blockers = entries.filter((e) => e.roomWall).map((e) => {
        const [w, d] = footprint(e.it);
        return { x0: e.it.x * T, z0: e.it.y * T, x1: (e.it.x + w) * T, z1: (e.it.y + d) * T };
      });
    }
  });

  visit(S.me);
  renderAll();
  return () => {
    walker.stop();
    off.forEach((f) => f());
    window.removeEventListener('keydown', onEscape, true);
    if (saveTimer && home && mine()) net.send('house_save', payload()); // flush a pending save
    clearTimeout(saveTimer);
    stage.scene?.remove(room.group);
    setDims([14, 14]);
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
