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
import { buildFurniture, floorTexture, wallTexture, ceilingTexture, SWATCH, surfaceImage, furnitureThumb } from '../three/furniture.js';
import { sfx } from '../sfx.js';
import { iconSvg } from '../icons.js';

const N = 10;         // room size in tiles (HOUSE_SIZE on the server)
const T = 1.6;        // world units per tile, so furniture is people-sized
const WALL_H = 3.2;   // in tiles
const WALL_Y = 1.75;  // height of wall decorations (tiles)
const DOOR = { x0: N / 2 - 1, x1: N / 2 + 1, h: 2.2 }; // the front door, in tiles
const FURN = Object.fromEntries(CATALOG.furniture.map((f) => [f.id, f]));
const kindOf = (id) => FURN[id]?.kind ?? 'floor';
const owned = (id) => me().furni?.[id] ?? 0;
const ownsDeco = (d) => d.free || owned(d.id) > 0;
// where you sit on things (in tiles above the floor)
const BEDS = new Set(['bed', 'bed_princess']);
// top: the height of the cushion/mattress; front: how far its front edge is from the middle (model units)
const SEATS = {
  chair: { top: 0.525, front: 0.25 }, armchair: { top: 0.53, front: 0.41 }, sofa: { top: 0.53, front: 0.41 },
  beanbag: { top: 0.5, front: 0.3 }, bed: { top: 0.6, front: 0 }, sofa_pink: { top: 0.53, front: 0.41 },
  armchair_pink: { top: 0.53, front: 0.41 }, beanbag_pink: { top: 0.5, front: 0.3 }, bed_princess: { top: 0.6, front: 0 },
};
// pictures of the real thing: a 3D snapshot of furniture, the actual texture for floors and walls
const furniImg = (id) => `<img class="fem-img" src="${furnitureThumb(id)}" alt="">`;
const decoBg = (id) => `background:url(${surfaceImage(id)}) center/cover, ${SWATCH[id] ?? '#888'}`;

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
    return Array.from({ length: f.w * SNAP }, (_, i) => `wall:${it.r % 4}:${start + i}`);
  }
  const [w, d] = it.r % 2 ? [f.d, f.w] : [f.w, f.d];
  const x0 = Math.round(it.x * SNAP), y0 = Math.round(it.y * SNAP);
  const out = [];
  for (let i = 0; i < w * SNAP; i++) for (let j = 0; j < d * SNAP; j++) out.push(`${kind}:${x0 + i}:${y0 + j}`);
  return out;
}

function fits(it) {
  const f = FURN[it.id];
  if (kindOf(it.id) === 'wall') {
    const start = it.r % 2 === 0 ? it.x : it.y;
    if (it.r % 4 === 2 && start < DOOR.x1 && start + f.w > DOOR.x0) return false; // not over the door
    return start >= 0 && start + f.w <= N;
  }
  const [w, d] = it.r % 2 ? [f.d, f.w] : [f.w, f.d];
  return it.x >= 0 && it.y >= 0 && it.x + w <= N && it.y + d <= N;
}
const footprint = (it) => { const f = FURN[it.id]; return it.r % 2 ? [f.d, f.w] : [f.w, f.d]; };

// ---------------------------------------------------------------------------
// the room: floor, four walls (a doorway in the front one) and a garden outside
// ---------------------------------------------------------------------------

function buildRoom() {
  const g = new THREE.Group();
  g.scale.setScalar(T);
  const floorMat = new THREE.MeshToonMaterial({ color: '#ffffff' });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(N, N), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(N / 2, 0, N / 2);
  floor.receiveShadow = true;
  g.add(floor);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(N + 0.6, 0.4, N + 0.6), toon('#6b4a2b'));
  slab.position.set(N / 2, -0.201, N / 2);
  g.add(slab);
  const wallMat = new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  const outside = toon('#e8d6b8');
  const trim = toon('#f4f0ff');
  const wall = (w, h, x, y, z, ry) => {
    const grp = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    face.receiveShadow = true;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), outside);
    shell.position.z = -0.14;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.06), trim);
    base.position.set(0, -h / 2 + 0.08, 0.03);
    grp.add(face, shell, base);
    grp.position.set(x, y, z);
    grp.rotation.y = ry;
    g.add(grp);
    return { grp, face };
  };
  const walls = {
    back: wall(N, WALL_H, N / 2, WALL_H / 2, 0, 0),
    left: wall(N, WALL_H, 0, WALL_H / 2, N / 2, Math.PI / 2),
    right: wall(N, WALL_H, N, WALL_H / 2, N / 2, -Math.PI / 2),
  };
  // the front wall is three pieces around the doorway
  const front = new THREE.Group();
  const lw = DOOR.x0, rw = N - DOOR.x1;
  const fl = wall(lw, WALL_H, lw / 2, WALL_H / 2, N, Math.PI);
  const fr = wall(rw, WALL_H, DOOR.x1 + rw / 2, WALL_H / 2, N, Math.PI);
  const ft = wall(DOOR.x1 - DOOR.x0, WALL_H - DOOR.h, N / 2, DOOR.h + (WALL_H - DOOR.h) / 2, N, Math.PI);
  for (const p of [fl, ft, fr]) front.add(p.grp);
  g.add(front);
  const doorFrame = toon('#8b5a2b');
  for (const x of [DOOR.x0, DOOR.x1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, DOOR.h, 0.34), doorFrame);
    post.position.set(x, DOOR.h / 2, N);
    front.add(post);
  }
  // the front door itself (closed: walk up to it to go outside)
  const doorMat = toon('#7a4a28');
  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(DOOR.x1 - DOOR.x0 - 0.14, DOOR.h - 0.04, 0.12), doorMat);
  doorPanel.position.set(N / 2, DOOR.h / 2, N - 0.02);
  front.add(doorPanel);
  for (const y of [0.55, 1.45]) {
    const inset = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.65, 0.04), toon('#8b5a2b'));
    inset.position.set(N / 2, y, N - 0.09);
    front.add(inset);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), toon('#ffc53d'));
  knob.position.set(N / 2 + 0.7, 1.05, N - 0.12);
  front.add(knob);
  const ceilingMat = new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(N, N), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(N / 2, WALL_H, N / 2);
  g.add(ceiling);
  // a pitched roof on top (seen from outside while decorating)
  const roof = new THREE.Group();
  const rise = 2.2;
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-N / 2 - 0.4, 0); roofShape.lineTo(N / 2 + 0.4, 0); roofShape.lineTo(0, rise); roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: N + 0.8, bevelEnabled: false });
  const roofMesh = new THREE.Mesh(roofGeo, toon('#b3403a'));
  roofMesh.position.set(N / 2, WALL_H + 0.02, -0.4);
  roof.add(roofMesh);
  g.add(roof);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), toon('#b3203a'));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(N / 2, 0.01, N - 0.45);
  g.add(mat);
  walls.front = { grp: front, faces: [fl.face, fr.face, ft.face] };
  // outside: a lawn with a path to the door, so the doorway never looks into a void
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), toon('#5fae55'));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(N / 2, -0.4, N / 2);
  lawn.receiveShadow = true;
  g.add(lawn);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2, 6), toon('#d8bd88'));
  path.rotation.x = -Math.PI / 2;
  path.position.set(N / 2, -0.39, N + 3.2);
  g.add(path);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 11 + (i % 3) * 2.5;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 8), toon('#7a4a28'));
    trunk.position.y = 0.3;
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + (i % 2) * 0.3, 1), toon(i % 3 ? '#3f9a4a' : '#57b35a'));
    leaves.position.y = 1.6;
    tree.add(trunk, leaves);
    tree.position.set(N / 2 + Math.cos(a) * r, -0.4, N / 2 + Math.sin(a) * r);
    g.add(tree);
  }
  // editing helpers
  const gridPts = [];
  for (let i = 0; i <= N; i++) gridPts.push(i, 0.015, 0, i, 0.015, N, 0, 0.015, i, N, 0.015, i);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }));
  // fainter quarter-tile lines: furniture snaps to these
  const finePts = [];
  for (let i = 0.25; i < N; i += 0.25) if (i % 1) finePts.push(i, 0.012, 0, i, 0.012, N, 0, 0.012, i, N, 0.012, i);
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
  return { group: g, floor, floorMat, wallMat, ceiling, ceilingMat, roof, walls, grid, marker, items };
}

// ---------------------------------------------------------------------------

export function house(stage) {
  const W = N * T;
  const sun = stage.lights({ background: '#9fd4ff', sky: 0xfff4e6, ground: 0x6a5a8a, hemi: 1.35, sun: 1.7, box: 16 });
  sun.position.set(W / 2 + 6, 40, W / 2 + 12); // high overhead so the walls don't shade the floor
  sun.target.position.set(W / 2, 0, W / 2);
  const room = buildRoom();
  stage.scene.add(room.group);

  const solids = [];
  const walker = stage.walker({
    spawn: { x: W / 2, z: W - 4.2 }, speed: 5, solids,
    bounds: { minX: 0.1, maxX: W - 0.1, minZ: 0.1, maxZ: W - 0.1 },
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
  const payload = () => ({ floor: home.floor, wall: home.wall, ceiling: home.ceiling ?? 'ceil_plain', items: home.items.map(({ id, x, y, r }) => ({ id, x, y, r })) });

  // ---- building the furniture ------------------------------------------------------

  function placeGroup(g, it) {
    const f = FURN[it.id];
    if (kindOf(it.id) === 'wall') {
      const r = it.r % 4;
      if (r === 0) { g.position.set(it.x + f.w / 2, WALL_Y, 0); g.rotation.y = 0; }
      else if (r === 1) { g.position.set(0, WALL_Y, it.y + f.w / 2); g.rotation.y = Math.PI / 2; }
      else if (r === 2) { g.position.set(it.x + f.w / 2, WALL_Y, N); g.rotation.y = Math.PI; }
      else { g.position.set(N, WALL_Y, it.y + f.w / 2); g.rotation.y = -Math.PI / 2; }
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
    entries = home.items.map((it, index) => {
      const built = buildFurniture(it.id);
      built.group.userData.index = index;
      placeGroup(built.group, it);
      built.group.visible = !(placing && placing.from === index);
      room.items.add(built.group);
      const entry = { ...built, it, bounce: 1 };
      const kind = kindOf(it.id);
      const [w, d] = footprint(it);
      const wr = it.r % 4, half = FURN[it.id].w / 2;
      const cx = kind === 'wall' ? [it.x + half, 0.6, it.x + half, N - 0.6][wr] : it.x + w / 2;
      const cz = kind === 'wall' ? [0.6, it.y + half, N - 0.6, it.y + half][wr] : it.y + d / 2;
      if (kind === 'floor') solids.push({ x: cx * T, z: cz * T, w: w * T - 0.15, d: d * T - 0.15 });
      const f = FURN[it.id];
      const seat = SEATS[it.id] != null;
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
  }

  /** Floor + wallpaper on the room, showing a previewed (not yet bought) one if you're trying it on. */
  function applySurfaces() {
    if (!home) return;
    const floor = preview.floor ?? home.floor;
    const wall = preview.wall ?? home.wall;
    room.floorMat.map = floorTexture(floor);
    room.floorMat.map.repeat.set(N / 2, N / 2);
    room.floorMat.needsUpdate = true;
    const wt = wallTexture(wall);
    wt.repeat.set(N / 2, WALL_H / 2);
    room.wallMat.map = wt;
    room.wallMat.needsUpdate = true;
    const ct = ceilingTexture(preview.ceiling ?? home.ceiling ?? 'ceil_plain');
    ct.repeat.set(N / 2, N / 2);
    room.ceilingMat.map = ct;
    room.ceilingMat.needsUpdate = true;
  }
  /** Try on a floor/wall (id), or stop trying one on (id null). No field: stop trying everything. */
  function setPreview(field, id = null) {
    if (!field) preview = {};
    else if (id) preview[field] = id;
    else delete preview[field];
    applySurfaces();
  }

  // ---- sitting ------------------------------------------------------------------------

  function sit(entry) {
    const it = entry.it;
    const [w, d] = footprint(it);
    const p = walker.me;
    seated = entry;
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
    p.x = (it.x + w / 2) * T + fx * fwd;
    p.z = (it.y + d / 2) * T + fz * fwd;
    p.y = seat.top * T - lowest + 0.01;
    entry.at = { x: p.x, y: p.y, z: p.z, heading };
    sfx(bed ? 'snore' : 'squish');
  }
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
      if (x > 0.5 && z > 0.5 && x < W - 0.5 && z < W - 0.5 && !solids.some((s) => Math.abs(x - s.x) < s.w / 2 + 0.4 && Math.abs(z - s.z) < s.d / 2 + 0.4)) {
        p.x = x; p.z = z; break;
      }
    }
    p.y = 0;
    p.char.setPose('idle');
    seated = null;
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
    ghost = buildFurniture(placing.id).group;
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
    const it = { id: placing.id, x: placing.x, y: placing.y, r: placing.r };
    const taken = new Set();
    home.items.forEach((o, i) => { if (i !== placing.from) cellsOf(o).forEach((c) => taken.add(c)); });
    placing.valid = fits(it) && !cellsOf(it).some((c) => taken.has(c)) && !blocksDoor(it);
    const mat = placing.valid ? ghostOk : ghostBad;
    ghost.traverse((o) => { if (o.isMesh && !o.userData.outline) o.material = mat; });
    ghost.visible = true;
    placeGroup(ghost, it);
    const f = FURN[placing.id];
    const m = room.marker;
    m.material.color.set(placing.valid ? '#6ee7a0' : '#ff5d73');
    m.visible = true;
    if (kindOf(placing.id) === 'wall') {
      m.scale.set(f.w, 1.1, 1);
      const r = it.r % 4;
      if (r === 0) { m.rotation.set(0, 0, 0); m.position.set(it.x + f.w / 2, WALL_Y, 0.02); }
      else if (r === 1) { m.rotation.set(0, Math.PI / 2, 0); m.position.set(0.02, WALL_Y, it.y + f.w / 2); }
      else if (r === 2) { m.rotation.set(0, Math.PI, 0); m.position.set(it.x + f.w / 2, WALL_Y, N - 0.02); }
      else { m.rotation.set(0, -Math.PI / 2, 0); m.position.set(N - 0.02, WALL_Y, it.y + f.w / 2); }
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
    return it.x < DOOR.x1 && it.x + w > DOOR.x0 && it.y + d > N - 1;
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
      if (r % 2 === 0) { placing.y = 0; placing.x = Math.max(0, Math.min(N - f.w, snap(local.x - f.w / 2))); }
      else { placing.x = 0; placing.y = Math.max(0, Math.min(N - f.w, snap(local.z - f.w / 2))); }
      return;
    }
    const p = stage.pointerOnPlane(0);
    if (!p) { placing.x = -1; return; }
    const [w, d] = footprint(placing);
    placing.x = Math.max(0, Math.min(N - w, snap(p.x / T - w / 2)));
    placing.y = Math.max(0, Math.min(N - d, snap(p.z / T - d / 2)));
  }

  function startPlacing(id, from = -1) {
    placing = { id, r: from >= 0 ? home.items[from].r : 0, from, x: -1, y: -1, valid: false };
    if (kindOf(id) === 'wall' && from < 0) placing.r = 0;
    selected = -1;
    buildGhost();
    if (from >= 0) entries[from].group.visible = false;
    sfx('pickup');
    renderAll();
  }

  function stopPlacing() {
    if (placing?.from >= 0 && entries[placing.from]) entries[placing.from].group.visible = true;
    placing = null;
    buildGhost();
    renderAll();
  }

  function place() {
    if (!placing?.valid) { sfx('error'); return; }
    const it = { id: placing.id, x: placing.x, y: placing.y, r: placing.r };
    if (placing.from >= 0) home.items[placing.from] = it;
    else home.items.push(it);
    selected = placing.from >= 0 ? placing.from : home.items.length - 1;
    placing = null;
    buildGhost();
    commit('place');
    if (entries[selected]) entries[selected].bounce = 0;
  }

  function rotate() {
    if (placing) {
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

  function storeSelected() {
    if (selected < 0) return;
    home.items.splice(selected, 1);
    selected = -1;
    commit('store');
  }

  /** Apply a local change: rebuild, save (debounced) and refresh the side panel. */
  function commit(sound) {
    if (sound) sfx(sound);
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
      else if ((k === 'delete' || k === 'backspace') && selected >= 0) { e.preventDefault(); storeSelected(); }
    }
  };
  // Escape cancels placing/selection before it would close the house
  const onEscape = (e) => {
    if (e.key !== 'Escape' || !(placing || selected >= 0 || sideOpen)) return;
    e.stopPropagation();
    if (placing) stopPlacing();
    else if (selected >= 0) { selected = -1; renderSelection(); renderAll(); }
    else { sideOpen = false; if (edit) setEdit(false); renderAll(); }
  };
  window.addEventListener('keydown', onEscape, true);

  // ---- HUD ------------------------------------------------------------------------------

  function renderAll() {
    renderHeader();
    side.classList.toggle('hidden', !sideOpen);
    if (sideOpen) { renderTabs(); renderPanel(); }
    hint.innerHTML = !home ? 'Knocking on the door…'
      : placing ? `Click to place · <kbd>R</kbd>/right-click to rotate · <kbd>Esc</kbd> to cancel${kindOf(placing.id) === 'wall' ? ' · point at any wall' : kindOf(placing.id) === 'ceiling' ? ' · it hangs from the ceiling above the green square' : ''}`
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
    const ownedList = CATALOG.furniture.filter((f) => owned(f.id) > 0);
    panel.innerHTML = `
      ${sel ? `<div class="sel-box"><span class="sel-em">${furniImg(sel.id)}</span><b>${esc(FURN[sel.id].name)}</b>
        <div class="row"><button class="btn small" data-act="rotate" ${kindOf(sel.id) === 'wall' ? 'disabled' : ''}>⟳ Rotate</button>
        <button class="btn small" data-act="move">✥ Move</button><button class="btn small" data-act="store">⬇ Put away</button></div></div>` : ''}
      <p class="muted small">Pick something to place it:</p>
      <div class="furni-grid">${ownedList.map((f) => {
        const left = owned(f.id) - placedCount(f.id);
        return `<button class="furni ${left ? '' : 'used'}" data-place="${f.id}" ${left ? '' : 'disabled'} title="${esc(f.name)}">
          <span class="fem">${furniImg(f.id)}</span><span class="fname">${esc(f.name)}</span><span class="fcount">${left}/${owned(f.id)} left</span></button>`;
      }).join('')}</div>
      ${ownedList.length ? '' : '<p class="muted">Nothing yet! Buy furniture in the Shop, or win trophies around the zone.</p>'}`;
  }

  function shopTile(item, kind) {
    const have = owned(item.id);
    const deco = kind !== 'furni';
    const max = deco ? 1 : item.max ?? 10;
    let foot;
    if (item.free) foot = 'Free';
    else if (item.price) foot = have >= max ? (deco ? 'Owned' : `Max ${max}`) : confirmBuy === item.id ? `Buy for ${fmt(item.price)}?` : `🪙 ${fmt(item.price)}${deco ? ' · tap to try' : ''}`;
    else foot = have ? 'Owned ✓' : item.unlock ? `🔒 ${esc(item.unlock.hint)}` : item.drop ? `👾 Beat the ${esc(item.drop)}` : '';
    const emoji = deco ? `<span class="fem swatch-em" style="${decoBg(item.id)}"></span>` : `<span class="fem">${furniImg(item.id)}</span>`;
    const buyable = item.price && have < max;
    return `<button class="furni ${buyable ? '' : 'locked'} ${confirmBuy === item.id ? 'confirm' : ''} ${isTrying(item.id) ? 'previewing' : ''}" ${buyable ? `data-buy="${item.id}"` : ''} ${buyable && deco ? `data-kind="${kind}"` : ''} title="${esc(item.name)}">
      ${emoji}<span class="fname">${esc(item.name)}</span><span class="fcount">${!deco && have ? `own ${have} · ` : ''}${foot}</span></button>`;
  }

  function renderShop() {
    const furn = CATALOG.furniture.filter((f) => f.price);
    const earn = CATALOG.furniture.filter((f) => !f.price);
    panel.innerHTML = `
      <p class="muted small">You have <b>${fmt(me().coins)}</b> 🪙</p>
      <div class="wd-label">Furniture</div><div class="furni-grid">${furn.map((f) => shopTile(f, 'furni')).join('')}</div>
      <div class="wd-label">Floors</div><div class="furni-grid">${CATALOG.floors.filter((d) => !d.free).map((d) => shopTile(d, 'floor')).join('')}</div>
      <div class="wd-label">Wallpaper</div><div class="furni-grid">${CATALOG.walls.filter((d) => !d.free).map((d) => shopTile(d, 'wall')).join('')}</div>
      <div class="wd-label">Ceilings</div><div class="furni-grid">${CATALOG.ceilings.filter((d) => !d.free).map((d) => shopTile(d, 'ceiling')).join('')}</div>
      <div class="wd-label">Earn these around the zone</div><div class="furni-grid">${earn.map((f) => shopTile(f, 'furni')).join('')}</div>`;
  }

  function renderStyle() {
    const pick = (list, field) => list.map((d) => `
      <button class="style-opt ${home?.[field] === d.id && !preview[field] ? 'on' : ''} ${isTrying(d.id) ? 'previewing' : ''} ${ownsDeco(d) ? '' : 'locked'}" data-style="${field}:${d.id}" title="${esc(d.name)}">
        <span class="style-sw" style="${decoBg(d.id)}"></span><span>${esc(d.name)}</span>
        <small>${ownsDeco(d) ? (home?.[field] === d.id ? '✓ Using' : '') : isTrying(d.id) ? '👀 Trying on' : `🪙 ${fmt(d.price)}`}</small></button>`).join('');
    const all = [...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings];
    const bar = Object.entries(preview).map(([field, id]) => {
      const pd = all.find((x) => x.id === id);
      return pd ? `<div class="preview-bar"><span>👀 Trying on <b>${esc(pd.name)}</b> ${field === 'floor' ? 'floor' : field === 'ceiling' ? 'ceiling' : 'wallpaper'}</span>
        <button class="btn primary small" data-preview-buy="${field}">Buy · 🪙 ${fmt(pd.price)}</button><button class="btn ghost small" data-preview-stop="${field}">Put back</button></div>` : '';
    }).join('');
    panel.innerHTML = `${bar}<div class="wd-label">Floor</div><div class="style-grid">${pick(CATALOG.floors, 'floor')}</div>
      <div class="wd-label">Wallpaper</div><div class="style-grid">${pick(CATALOG.walls, 'wall')}</div>
      <div class="wd-label">Ceiling</div><div class="style-grid">${pick(CATALOG.ceilings, 'ceiling')}</div>`;
  }

  stage.hud.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-visit],[data-visits],[data-like],[data-edit],[data-home],[data-act],[data-place],[data-buy],[data-style],[data-preview-buy],[data-preview-stop]');
    if (!t) return;
    const ds = t.dataset;
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
      if (ds.act === 'store') storeSelected();
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
      const d = [...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings].find((x) => x.id === id);
      if (!ownsDeco(d)) { setPreview(field, id); sfx('pop', { vol: 0.4 }); renderPanel(); return; }
      if (preview[field]) setPreview(field, null);
      if (home[field] !== id) { home[field] = id; commit('paint'); } else renderPanel();
    }
  });

  function setEdit(on) {
    edit = on && mine();
    if (stage.camRoom) stage.camRoom.off = edit; // decorating gets the bird's-eye view over the walls
    if (!edit && trying()) setPreview(null);
    room.grid.visible = edit;
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
    Object.assign(walker.me, { x: W / 2, z: W - 4.2, heading: Math.PI });
    net.send('scene', { scene: `house:${k}` });
    net.send('house_get', { k });
    sfx('knock');
    if (k !== S.me) stage.banner(`<div class="big">🏠 ${esc(nameOf(k))}'s House</div>Make yourself at home!`, 2200);
    renderAll();
  }

  // leave through the front door
  stage.interactable({ x: W / 2, z: W - 0.6, r: 2.3, label: 'go back outside', use: () => stage.onExit?.() });

  // ---- network ------------------------------------------------------------------------

  const off = [
    net.on('player', (m) => {
      if (m.p.key !== S.me || !buyThenUse || !home || !mine()) return;
      const d = [...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings].find((x) => x.id === buyThenUse.id);
      if (!d || !ownsDeco(d)) return;
      const { field, id } = buyThenUse;
      buyThenUse = null;
      delete preview[field];
      home[field] = id;
      commit('paint');
    }),
    // the owner of the house you're in left the zone: back to your own
    net.on('member_left', (m) => { if (m.k === viewKey) visit(S.me); else if (sideOpen && tab === 'visit') renderVisit(); }),
    net.on('house', (m) => {
      if (m.k !== viewKey) { if (sideOpen && tab === 'visit') renderVisit(); return; }
      if (m.k === S.me && home) {
        if (echoes > 0) echoes -= 1;
        if (echoes > 0 || saveTimer) { home.likes = m.house.likes; renderHeader(); return; }
      }
      const fresh = !home;
      const same = home && JSON.stringify(payload()) === JSON.stringify({ floor: m.house.floor, wall: m.house.wall, ceiling: m.house.ceiling ?? 'ceil_plain', items: m.house.items });
      const newLikes = home && m.house.likes.length > home.likes.length;
      if (same) home.likes = m.house.likes;
      else {
        if (seated) standUp();
        home = { ...m.house, items: m.house.items.map((it) => ({ ...it })) };
        rebuildItems();
        if (!fresh && !mine()) sfx('pop', { vol: 0.4 }); // the owner is redecorating while you watch
      }
      if (newLikes) { stage.people.get(m.k)?.char.emote('heart'); if (m.k === S.me) sfx('like'); }
      renderAll();
    }),
    net.on('house_bought', (m) => {
      sfx('buy');
      const item = FURN[m.id] ?? [...CATALOG.floors, ...CATALOG.walls, ...CATALOG.ceilings].find((d) => d.id === m.id);
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

  const center = new THREE.Vector3(W / 2, 0, W / 2);
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
      if (preview.ceiling) {
        // trying on a ceiling: stand in the middle of the room and slowly look around up at it
        orbit.fps = true;
        orbit.target.copy(center);
        orbit.height = WALL_H * T * 0.3;
        orbit.pitch = -0.55;
        orbit.yaw += dt * 0.25;
      } else {
        // decorating: pull the camera up for an overview of the whole room
        if (orbit.fps) { orbit.fps = false; orbit.height = baseHeight; orbit.pitch = 0.95; }
        orbit.target.copy(center);
        orbit.dist += (19 - orbit.dist) * Math.min(1, dt * 4);
        orbit.pitch += (0.95 - orbit.pitch) * Math.min(1, dt * 4);
      }
    } else if (orbit.dist > 15) orbit.dist += (11 - orbit.dist) * Math.min(1, dt * 3);
    for (const e of entries) {
      e.A.anim = e.A.anim.filter((fn) => !fn(t, dt));
      if (e.bounce < 1) {
        e.bounce = Math.min(1, e.bounce + dt / 0.35);
        const k = Math.sin(e.bounce * Math.PI) * (1 - e.bounce);
        e.group.scale.set(1 + k * 0.25, 1 - k * 0.3, 1 + k * 0.25);
      }
    }
    if (ghost?.visible) ghost.position.y = (kindOf(placing.id) === 'wall' ? WALL_Y : kindOf(placing.id) === 'ceiling' ? WALL_H : 0) + Math.sin(t * 6) * 0.03;
    // hide the walls between the camera and the room
    const c = stage.camera.position;
    if (!edit && orbit.fps) { orbit.fps = false; orbit.height = baseHeight; }
    room.ceiling.visible = !edit || !!preview.ceiling;
    room.roof.visible = !edit;
    room.walls.front.grp.visible = c.z < W - 0.2;
    room.walls.back.grp.visible = c.z > 0.2;
    room.walls.left.grp.visible = c.x > 0.2;
    room.walls.right.grp.visible = c.x < W - 0.2;
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
  };
}
