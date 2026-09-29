// Houses: every member gets a room to decorate with furniture they buy or win around the zone,
// and can visit (and ❤️) everyone else's. Furniture is clickable: lamps switch, the jukebox plays…
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, fmt, me, nameOf, toast, isTyping } from '../state.js';
import { CATALOG } from '../catalog.js';
import { portraitInto } from '../avatar.js';
import { Character } from '../three/character.js';
import { basic } from '../three/materials.js';
import { buildFurniture, floorTexture, wallTexture, SWATCH } from '../three/furniture.js';
import { sfx } from '../sfx.js';
import { settings, onSettings, pixelRatio } from '../settings.js';
import { iconSvg } from '../icons.js';
import { $, listen, loop } from './util.js';

const N = 8;          // room size in tiles (HOUSE_SIZE on the server)
const WALL_H = 3.2;
const WALL_Y = 1.75;  // height of wall decorations
const FURN = Object.fromEntries(CATALOG.furniture.map((f) => [f.id, f]));
const kindOf = (id) => FURN[id]?.kind ?? 'floor';
const owned = (id) => me().furni?.[id] ?? 0;
const ownsDeco = (d) => d.free || owned(d.id) > 0;

/** Footprint cells of a placed item, keyed by layer so rugs can sit under furniture. */
function cellsOf(it) {
  const f = FURN[it.id];
  if (!f) return [];
  const kind = kindOf(it.id);
  if (kind === 'wall') {
    const start = it.r % 2 === 0 ? it.x : it.y;
    return Array.from({ length: f.w }, (_, i) => `wall:${it.r % 2}:${start + i}`);
  }
  const [w, d] = it.r % 2 ? [f.d, f.w] : [f.w, f.d];
  const out = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push(`${kind}:${it.x + i}:${it.y + j}`);
  return out;
}

function fits(it) {
  const f = FURN[it.id];
  if (kindOf(it.id) === 'wall') {
    const start = it.r % 2 === 0 ? it.x : it.y;
    return start >= 0 && start + f.w <= N;
  }
  const [w, d] = it.r % 2 ? [f.d, f.w] : [f.w, f.d];
  return it.x >= 0 && it.y >= 0 && it.x + w <= N && it.y + d <= N;
}

// ---------------------------------------------------------------------------
// One renderer shared by every visit (browsers limit how many WebGL contexts a page may have).
// ---------------------------------------------------------------------------

let R = null;

function setupRenderer() {
  if (R) return R;
  const canvas = document.createElement('canvas');
  canvas.className = 'house-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(pixelRatio());
  onSettings((s, changed) => { if ('quality' in changed) renderer.setPixelRatio(pixelRatio()); });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a3d85');
  const camera = new THREE.PerspectiveCamera(32, 16 / 10, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6a5a8a, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0d4, 1.6);
  sun.position.set(12, 14, 9);
  sun.target.position.set(4, 0, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // the room shell: a floor slab plus back (-z) and left (-x) walls, like a diorama
  const room = new THREE.Group();
  const floorMat = new THREE.MeshToonMaterial({ color: '#ffffff' });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(N, N), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(N / 2, 0, N / 2);
  floor.receiveShadow = true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(N + 0.3, 0.4, N + 0.3), new THREE.MeshToonMaterial({ color: '#6b4a2b' }));
  slab.position.set(N / 2 - 0.15, -0.201, N / 2 - 0.15);
  const wallMat = new THREE.MeshToonMaterial({ color: '#ffffff' });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(N, WALL_H), wallMat);
  back.position.set(N / 2, WALL_H / 2, 0);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(N, WALL_H), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(0, WALL_H / 2, N / 2);
  left.receiveShadow = true;
  const trim = new THREE.MeshToonMaterial({ color: '#f4f0ff' });
  const shell = new THREE.MeshToonMaterial({ color: '#8b6a4a' });
  const parts = [
    // (the shell sits just behind the wallpaper planes so they don't z-fight)
    [new THREE.BoxGeometry(N + 0.3, WALL_H + 0.4, 0.3), shell, [N / 2 - 0.15, WALL_H / 2 - 0.2, -0.17]],
    [new THREE.BoxGeometry(0.3, WALL_H + 0.4, N), shell, [-0.17, WALL_H / 2 - 0.2, N / 2]],
    [new THREE.BoxGeometry(N, 0.16, 0.06), trim, [N / 2, 0.08, 0.03]],
    [new THREE.BoxGeometry(0.06, 0.16, N), trim, [0.03, 0.08, N / 2]],
    [new THREE.BoxGeometry(N + 0.3, 0.12, 0.34), trim, [N / 2 - 0.15, WALL_H + 0.06, -0.13]],
    [new THREE.BoxGeometry(0.34, 0.12, N), trim, [-0.13, WALL_H + 0.06, N / 2]],
  ];
  room.add(floor, slab, back, left);
  for (const [g, m, p] of parts) {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...p);
    mesh.receiveShadow = true;
    room.add(mesh);
  }
  scene.add(room);

  // editing helpers
  const gridPts = [];
  for (let i = 0; i <= N; i++) gridPts.push(i, 0.015, 0, i, 0.015, N, 0, 0.015, i, N, 0.015, i);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }));
  grid.visible = false;
  scene.add(grid);
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basic('#6ee7a0', { transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  marker.visible = false;
  scene.add(marker);

  const items = new THREE.Group();
  const people = new THREE.Group();
  scene.add(items, people);
  R = { canvas, renderer, scene, camera, floor, floorMat, wallMat, back, left, grid, marker, items, people, sun };
  return R;
}

// ---------------------------------------------------------------------------

export function house(body) {
  const r = setupRenderer();
  body.innerHTML = `
    <div class="house-head"><h2 class="house-title">🏠 Houses</h2><div class="house-actions"></div></div>
    <div class="house-main">
      <div class="house-view"><div class="house-hint"></div></div>
      <div class="house-side">
        <div class="tabs house-tabs"></div>
        <div class="house-panel"></div>
      </div>
    </div>`;
  const view = $(body, '.house-view'), hint = $(body, '.house-hint'), panel = $(body, '.house-panel');
  const tabsEl = $(body, '.house-tabs'), actions = $(body, '.house-actions'), title = $(body, '.house-title');
  view.prepend(r.canvas);

  let viewKey = S.me, home = null, edit = false, placing = null, selected = -1, tab = 'visit';
  let confirmBuy = null, saveTimer = 0, echoes = 0, ghost = null, drag = null;
  let entries = [];              // built items: { group, use, A, it, bounce }
  const walkers = [];            // characters wandering around the room
  let yaw = 0.78, pitch = 0.64, dist = 15.5;

  const mine = () => viewKey === S.me;
  const payload = () => ({ floor: home.floor, wall: home.wall, items: home.items.map(({ id, x, y, r: rot }) => ({ id, x, y, r: rot })) });

  // ---- scene building ----------------------------------------------------------

  function placeGroup(g, it) {
    const f = FURN[it.id];
    if (kindOf(it.id) === 'wall') {
      if (it.r % 2 === 0) { g.position.set(it.x + f.w / 2, WALL_Y, 0); g.rotation.y = 0; }
      else { g.position.set(0, WALL_Y, it.y + f.w / 2); g.rotation.y = Math.PI / 2; }
      return;
    }
    const [w, d] = it.r % 2 ? [f.d, f.w] : [f.w, f.d];
    g.position.set(it.x + w / 2, 0, it.y + d / 2);
    g.rotation.y = it.r * (Math.PI / 2);
  }

  function clearGroup(g) {
    while (g.children.length) g.remove(g.children[0]);
  }

  function rebuildItems() {
    clearGroup(r.items);
    entries = home.items.map((it, index) => {
      const built = buildFurniture(it.id);
      built.group.userData.index = index;
      placeGroup(built.group, it);
      built.group.visible = !(placing && placing.from === index);
      r.items.add(built.group);
      return { ...built, it, bounce: 1 };
    });
    // keep the lights count sane: only the first few lamps really light the room
    let lights = 0;
    r.items.traverse((o) => { if (o.isPointLight) o.castShadow = false; if (o.isPointLight && ++lights > 4) o.intensity = 0; });
    r.floorMat.map = floorTexture(home.floor);
    r.floorMat.map.repeat.set(N / 2, N / 2);
    r.floorMat.needsUpdate = true;
    const wt = wallTexture(home.wall);
    wt.repeat.set(N / 2, WALL_H / 2);
    r.wallMat.map = wt;
    r.wallMat.needsUpdate = true;
    for (const w of walkers) w.path = [];
    renderSelection();
  }

  function blockedCells() {
    const set = new Set();
    home.items.forEach((it) => { if (kindOf(it.id) === 'floor') cellsOf(it).forEach((c) => set.add(c.slice(6))); });
    return set;
  }

  function setupWalkers() {
    clearGroup(r.people);
    walkers.length = 0;
    const keys = [viewKey, ...(mine() ? [] : [S.me])];
    const blocked = blockedCells();
    const free = [];
    for (let x = 0; x < N; x++) for (let y = 2; y < N; y++) if (!blocked.has(`${x}:${y}`)) free.push([x, y]);
    keys.forEach((k, i) => {
      const char = new Character(S.players[k]?.look);
      char.root.scale.setScalar(0.62);
      char.root.traverse((o) => { o.castShadow = true; });
      const [x, y] = free[Math.floor(Math.random() * free.length)] ?? [4, 6];
      char.root.position.set(x + 0.5, 0, y + 0.5);
      char.root.rotation.y = Math.random() * Math.PI - Math.PI / 2;
      char.onStep = () => sfx('step', { vol: 0.15, surface: home.floor === 'floor_carpet' || home.floor === 'floor_grass' ? 'grass' : 'stone' });
      r.people.add(char.root);
      walkers.push({ key: k, char, path: [], wait: 1 + i + Math.random() * 2 });
    });
  }

  /** Breadth-first path over free tiles (furniture blocks, rugs don't). */
  function pathTo(from, to, blocked) {
    const key = (p) => `${p[0]}:${p[1]}`;
    const prev = new Map([[key(from), null]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      if (cur[0] === to[0] && cur[1] === to[1]) {
        const out = [];
        for (let p = cur; p; p = prev.get(key(p))) out.unshift(p);
        return out.slice(1);
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [cur[0] + dx, cur[1] + dy];
        if (n[0] < 0 || n[1] < 0 || n[0] >= N || n[1] >= N || prev.has(key(n)) || blocked.has(key(n))) continue;
        prev.set(key(n), cur);
        queue.push(n);
      }
    }
    return null;
  }

  function updateWalkers(dt, t) {
    if (!home) return;
    let blocked = null;
    for (const w of walkers) {
      const root = w.char.root;
      let moving = false;
      if (w.path.length) {
        const [tx, ty] = w.path[0];
        const dx = tx + 0.5 - root.position.x, dz = ty + 0.5 - root.position.z;
        const d = Math.hypot(dx, dz);
        const step = 1.5 * dt;
        if (d <= step) {
          root.position.set(tx + 0.5, 0, ty + 0.5);
          w.path.shift();
          if (!w.path.length) w.wait = 2 + Math.random() * 4;
        } else {
          root.position.x += (dx / d) * step;
          root.position.z += (dz / d) * step;
          moving = true;
          const goal = Math.atan2(dx, dz), cur = root.rotation.y;
          root.rotation.y = cur + Math.atan2(Math.sin(goal - cur), Math.cos(goal - cur)) * Math.min(1, dt * 10);
        }
      } else if ((w.wait -= dt) <= 0) {
        blocked ||= blockedCells();
        const from = [Math.floor(root.position.x), Math.floor(root.position.z)];
        const free = [];
        for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (!blocked.has(`${x}:${y}`)) free.push([x, y]);
        const to = free[Math.floor(Math.random() * free.length)];
        w.path = (to && pathTo(from, to, blocked)) ?? [];
        w.wait = 1.5 + Math.random() * 3;
        if (!w.path.length && Math.random() < 0.3) w.char.emote(['wave', 'heart', 'laugh'][Math.floor(Math.random() * 3)]);
      }
      w.char.update(dt, t, moving, 0.9);
    }
  }

  // ---- ghost (furniture being placed) --------------------------------------------

  const ghostOk = basic('#6ee7a0', { transparent: true, opacity: 0.55, depthWrite: false });
  const ghostBad = basic('#ff5d73', { transparent: true, opacity: 0.55, depthWrite: false });

  function buildGhost() {
    if (ghost) r.scene.remove(ghost);
    ghost = null;
    if (!placing) { r.marker.visible = false; return; }
    ghost = buildFurniture(placing.id).group;
    ghost.traverse((o) => {
      if (o.isMesh) {
        if (o.userData.outline) o.visible = false;
        else { o.material = ghostOk; o.castShadow = false; }
      }
      if (o.isLight || o.isSprite) o.visible = false;
    });
    ghost.visible = false;
    r.scene.add(ghost);
  }

  function updateGhost() {
    if (!ghost || !placing || placing.x < 0) {
      if (ghost) ghost.visible = false;
      r.marker.visible = false;
      return;
    }
    const it = { id: placing.id, x: placing.x, y: placing.y, r: placing.r };
    const taken = new Set();
    home.items.forEach((o, i) => { if (i !== placing.from) cellsOf(o).forEach((c) => taken.add(c)); });
    placing.valid = fits(it) && !cellsOf(it).some((c) => taken.has(c));
    const mat = placing.valid ? ghostOk : ghostBad;
    ghost.traverse((o) => { if (o.isMesh && !o.userData.outline) o.material = mat; });
    ghost.visible = true;
    placeGroup(ghost, it);
    const f = FURN[placing.id];
    const m = r.marker;
    m.material.color.set(placing.valid ? '#6ee7a0' : '#ff5d73');
    m.visible = true;
    if (kindOf(placing.id) === 'wall') {
      m.scale.set(f.w, 1.1, 1);
      if (it.r % 2 === 0) { m.rotation.set(0, 0, 0); m.position.set(it.x + f.w / 2, WALL_Y, 0.02); }
      else { m.rotation.set(0, Math.PI / 2, 0); m.position.set(0.02, WALL_Y, it.y + f.w / 2); }
    } else {
      const [w, d] = it.r % 2 ? [f.d, f.w] : [f.w, f.d];
      m.rotation.set(-Math.PI / 2, 0, 0);
      m.scale.set(w, d, 1);
      m.position.set(it.x + w / 2, 0.02, it.y + d / 2);
    }
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
    entries[selected] && (entries[selected].bounce = 0);
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
    if (!fits(next) || cellsOf(next).some((c) => taken.has(c))) { sfx('error'); toast('No room to turn it there.', 'error'); return; }
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
    rebuildItems();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = 0;
      echoes += 1;
      net.send('house_save', payload());
    }, 350);
    renderAll();
  }

  function renderSelection() {
    entries.forEach((e, i) => {
      e.group.traverse((o) => {
        if (!o.userData.outline) return;
        o.userData.baseMat ??= o.material;
        o.material = i === selected ? SELECT_OUT : o.userData.baseMat;
      });
    });
  }
  const SELECT_OUT = new THREE.MeshBasicMaterial({ color: '#ffd84d', side: THREE.BackSide });
  SELECT_OUT.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * 0.045;');
  };

  // ---- picking -------------------------------------------------------------------

  const ray = new THREE.Raycaster();
  function pointerRay(e) {
    const rect = r.canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), r.camera);
  }
  function pickItem() {
    const hit = ray.intersectObjects(r.items.children, true).find((h) => h.object.visible && !h.object.userData.outline && !h.object.isSprite);
    for (let o = hit?.object; o; o = o.parent) if (o.userData.index != null) return o.userData.index;
    return -1;
  }
  function aimPlacement() {
    const f = FURN[placing.id];
    if (kindOf(placing.id) === 'wall') {
      const hits = ray.intersectObjects([r.back, r.left]);
      const h = hits[0];
      if (!h) { placing.x = -1; return; }
      if (h.object === r.back) { placing.r = 0; placing.y = 0; placing.x = Math.max(0, Math.min(N - f.w, Math.round(h.point.x - f.w / 2))); }
      else { placing.r = 1; placing.x = 0; placing.y = Math.max(0, Math.min(N - f.w, Math.round(h.point.z - f.w / 2))); }
      return;
    }
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) { placing.x = -1; return; }
    const [w, d] = placing.r % 2 ? [f.d, f.w] : [f.w, f.d];
    placing.x = Math.max(0, Math.min(N - w, Math.round(p.x - w / 2)));
    placing.y = Math.max(0, Math.min(N - d, Math.round(p.z - d / 2)));
  }

  function onPointerDown(e) {
    drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
    try { r.canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  }
  function onPointerMove(e) {
    if (!home) return;
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) drag.moved = true;
      if (drag.moved) {
        yaw = Math.max(0.1, Math.min(1.47, yaw - dx * 0.006 * settings.camSens));
        pitch = Math.max(0.35, Math.min(1.15, pitch + dy * 0.004 * settings.camSens * (settings.invertY ? -1 : 1)));
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
    }
    pointerRay(e);
    if (placing) {
      aimPlacement();
      updateGhost();
    } else {
      const idx = pickItem();
      r.canvas.style.cursor = idx >= 0 && (edit || entries[idx]?.use || FURN[entries[idx]?.it.id]?.use) ? 'pointer' : 'grab';
    }
  }
  function onPointerUp(e) {
    const d = drag;
    drag = null;
    if (!d || d.moved || !home) return;
    pointerRay(e);
    if (d.button === 2) { rotate(); return; }
    if (placing) { aimPlacement(); updateGhost(); place(); return; }
    const idx = pickItem();
    if (edit && mine()) {
      selected = idx === selected ? -1 : idx;
      if (idx >= 0) { sfx('pickup', { vol: 0.5 }); entries[idx].bounce = 0; }
      renderSelection();
      renderAll();
      return;
    }
    if (idx >= 0) useItem(entries[idx]);
  }
  function onWheel(e) {
    e.preventDefault();
    dist = Math.max(9, Math.min(24, dist * (1 + e.deltaY * 0.001 * settings.zoomSens)));
  }

  function useItem(entry) {
    entry.bounce = 0;
    entry.use?.();
    const f = FURN[entry.it.id];
    if (f?.use) sfx(f.use);
    if (f?.action === 'wardrobe') {
      if (mine()) setTimeout(() => window.dispatchEvent(new CustomEvent('fz:open', { detail: 'wardrobe' })), 250);
      else toast(`That's ${nameOf(viewKey)}'s wardrobe. Use the one in your own house!`);
    }
  }

  const onKey = (e) => {
    if (isTyping() || !home) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && (placing || selected >= 0)) {
      e.stopPropagation();
      if (placing) stopPlacing(); else { selected = -1; renderSelection(); renderAll(); }
    } else if (k === 'r' && mine() && edit) rotate();
    else if ((k === 'delete' || k === 'backspace') && mine() && edit && selected >= 0) { e.preventDefault(); storeSelected(); }
  };

  r.canvas.addEventListener('pointerdown', onPointerDown);
  r.canvas.addEventListener('pointermove', onPointerMove);
  r.canvas.addEventListener('pointerup', onPointerUp);
  r.canvas.addEventListener('wheel', onWheel, { passive: false });
  const noMenu = (e) => e.preventDefault();
  r.canvas.addEventListener('contextmenu', noMenu);
  window.addEventListener('keydown', onKey, true); // capture: Escape cancels placing before it closes the panel

  // ---- side panel -------------------------------------------------------------------

  function renderAll() {
    renderHeader();
    renderTabs();
    renderPanel();
    hint.innerHTML = !home ? 'Knocking on the door…'
      : placing ? `Click to place · <kbd>R</kbd>/right-click to rotate · <kbd>Esc</kbd> to cancel${kindOf(placing.id) === 'wall' ? ' · point at either wall' : ''}`
        : edit && mine() ? 'Click furniture to select it · <kbd>R</kbd> rotate · <kbd>Del</kbd> put away · drag to turn the camera'
          : 'Click furniture to use it! Drag to look around, scroll to zoom.';
  }

  function renderHeader() {
    const p = S.players[viewKey];
    title.innerHTML = `${iconSvg('house')} ${mine() ? 'My House' : `${esc(p?.name ?? '?')}'s House`}`;
    const likes = home?.likes ?? [];
    const liked = likes.includes(S.me);
    actions.innerHTML = [
      `<span class="pill">❤️ ${likes.length}</span>`,
      !mine() ? `<button class="btn small ${liked ? '' : 'primary'}" data-like ${liked ? 'disabled' : ''}>${liked ? '❤️ Liked' : '🤍 Like'}</button>` : '',
      mine() ? '<button class="btn small" data-wardrobe>🪞 Wardrobe</button>' : '',
      mine() ? `<button class="btn small ${edit ? 'primary' : ''}" data-edit>${edit ? '✅ Done' : '✏️ Decorate'}</button>` : '<button class="btn small" data-home>🏡 My house</button>',
    ].join('');
  }

  function renderTabs() {
    const list = [['visit', '🏘️ Visit'], ...(mine() ? [['items', '🛋️ Items'], ['shop', '🛒 Shop'], ['style', '🎨 Style']] : [])];
    if (!list.some(([id]) => id === tab)) tab = 'visit';
    tabsEl.innerHTML = list.map(([id, label]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${label}</button>`).join('');
  }

  function renderPanel() {
    if (tab === 'visit') return renderVisit();
    if (tab === 'items') return renderItems();
    if (tab === 'shop') return renderShop();
    return renderStyle();
  }

  function renderVisit() {
    const list = Object.values(S.players).sort((a, b) => (b.key === S.me) - (a.key === S.me) || (b.house?.likes ?? 0) - (a.house?.likes ?? 0) || a.name.localeCompare(b.name));
    panel.innerHTML = `<div class="visit-list">${list.map((p) => `
      <button class="visit-row ${p.key === viewKey ? 'on' : ''}" data-visit="${esc(p.key)}">
        <span class="vav"></span>
        <span class="vname"><b>${esc(p.name)}${p.key === S.me ? ' <small>(you)</small>' : ''}</b>
          <small>🛋️ ${p.house?.n ?? 0} · ❤️ ${p.house?.likes ?? 0}${p.online ? ' · <span class="win">online</span>' : ''}</small></span>
        <span class="vgo">${p.key === viewKey ? 'Here' : 'Visit →'}</span>
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
      ${sel ? `<div class="sel-box"><span class="sel-em">${FURN[sel.id].emoji}</span><b>${esc(FURN[sel.id].name)}</b>
        <div class="row"><button class="btn small" data-act="rotate" ${kindOf(sel.id) === 'wall' ? 'disabled' : ''}>⟳ Rotate</button>
        <button class="btn small" data-act="move">✥ Move</button><button class="btn small" data-act="store">⬇ Put away</button></div></div>` : ''}
      <p class="muted small">${edit ? 'Pick something to place it:' : 'Press ✏️ Decorate to move things around.'}</p>
      <div class="furni-grid">${ownedList.map((f) => {
        const left = owned(f.id) - placedCount(f.id);
        return `<button class="furni ${left ? '' : 'used'}" data-place="${f.id}" ${left ? '' : 'disabled'} title="${esc(f.name)}">
          <span class="fem">${f.emoji}</span><span class="fname">${esc(f.name)}</span><span class="fcount">${left}/${owned(f.id)} left</span></button>`;
      }).join('')}</div>
      ${ownedList.length ? '' : '<p class="muted">Nothing yet! Buy furniture in the Shop, or win trophies around the zone.</p>'}`;
  }

  function shopTile(item, kind) {
    const have = owned(item.id);
    const deco = kind !== 'furni';
    const max = deco ? 1 : item.max ?? 10;
    let foot;
    if (item.free) foot = 'Free';
    else if (item.price) foot = have >= max ? (deco ? 'Owned' : `Max ${max}`) : confirmBuy === item.id ? `Buy for ${fmt(item.price)}?` : `🪙 ${fmt(item.price)}`;
    else foot = have ? 'Owned ✓' : item.unlock ? `🔒 ${esc(item.unlock.hint)}` : item.drop ? `👾 Beat the ${esc(item.drop)}` : '';
    const emoji = deco ? `<span class="fem swatch-em" style="background:${SWATCH[item.id] ?? '#888'}"></span>` : `<span class="fem">${item.emoji}</span>`;
    const buyable = item.price && have < max;
    return `<button class="furni ${buyable ? '' : 'locked'} ${confirmBuy === item.id ? 'confirm' : ''}" ${buyable ? `data-buy="${item.id}"` : ''} title="${esc(item.name)}">
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
      <div class="wd-label">Earn these around the zone</div><div class="furni-grid">${earn.map((f) => shopTile(f, 'furni')).join('')}</div>`;
  }

  function renderStyle() {
    const pick = (list, field) => list.map((d) => `
      <button class="style-opt ${home?.[field] === d.id ? 'on' : ''} ${ownsDeco(d) ? '' : 'locked'}" data-style="${field}:${d.id}" title="${esc(d.name)}">
        <span class="style-sw" style="background:${SWATCH[d.id] ?? '#888'}"></span><span>${esc(d.name)}</span>
        <small>${ownsDeco(d) ? (home?.[field] === d.id ? '✓ Using' : '') : `🪙 ${fmt(d.price)}`}</small></button>`).join('');
    panel.innerHTML = `<div class="wd-label">Floor</div><div class="style-grid">${pick(CATALOG.floors, 'floor')}</div>
      <div class="wd-label">Wallpaper</div><div class="style-grid">${pick(CATALOG.walls, 'wall')}</div>`;
  }

  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-visit],[data-like],[data-edit],[data-home],[data-act],[data-place],[data-buy],[data-style],[data-wardrobe]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.wardrobe != null) {
      window.dispatchEvent(new CustomEvent('fz:open', { detail: 'wardrobe' }));
    } else if (ds.tab) {
      tab = ds.tab;
      confirmBuy = null;
      if (tab !== 'visit' && mine() && !edit) setEdit(true);
      renderAll();
    } else if (ds.visit) {
      if (ds.visit !== viewKey) visit(ds.visit);
    } else if (ds.like != null) {
      net.send('house_like', { k: viewKey });
      sfx('like');
      walkers[0]?.char.emote('heart');
    } else if (ds.edit != null) {
      setEdit(!edit);
      if (edit) tab = 'items';
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
      if (confirmBuy === ds.buy) { net.send('house_buy', { id: ds.buy }); confirmBuy = null; }
      else confirmBuy = ds.buy;
      renderPanel();
    } else if (ds.style) {
      const [field, id] = ds.style.split(':');
      const d = [...CATALOG.floors, ...CATALOG.walls].find((x) => x.id === id);
      if (!ownsDeco(d)) { confirmBuy = id; tab = 'shop'; renderAll(); return; }
      if (home[field] !== id) { home[field] = id; commit('paint'); }
    }
  });

  function setEdit(on) {
    edit = on;
    r.grid.visible = on;
    if (!on) { if (placing) stopPlacing(); selected = -1; renderSelection(); }
  }

  function visit(k) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
      if (home && mine()) net.send('house_save', payload());
    }
    if (placing) stopPlacing();
    setEdit(false);
    viewKey = k;
    home = null;
    selected = -1;
    echoes = 0;
    tab = 'visit';
    clearGroup(r.items);
    clearGroup(r.people);
    walkers.length = 0;
    net.send('house_get', { k });
    sfx('knock');
    renderAll();
  }

  // ---- network ------------------------------------------------------------------------

  const off = listen({
    house: (m) => {
      if (m.k !== viewKey) { if (tab === 'visit') renderVisit(); return; }
      if (m.k === S.me && home) {
        if (echoes > 0) echoes -= 1;
        if (echoes > 0 || saveTimer) { home.likes = m.house.likes; renderHeader(); return; }
      }
      const fresh = !home;
      const same = home && JSON.stringify(payload()) === JSON.stringify({ floor: m.house.floor, wall: m.house.wall, items: m.house.items });
      const newLikes = home && m.house.likes.length > home.likes.length;
      if (same) home.likes = m.house.likes;
      else {
        home = { ...m.house, items: m.house.items.map((it) => ({ ...it })) };
        rebuildItems();
      }
      if (fresh) setupWalkers();
      if (newLikes) { walkers[0]?.char.emote('heart'); if (m.k === S.me) sfx('like'); }
      renderAll();
    },
    house_bought: (m) => {
      sfx('buy');
      const item = FURN[m.id] ?? [...CATALOG.floors, ...CATALOG.walls].find((d) => d.id === m.id);
      toast(`🛒 Bought ${item?.name ?? 'it'}!${FURN[m.id] ? ' Find it in 🛋️ Items.' : ' Pick it in 🎨 Style.'}`);
    },
    player: (m) => {
      if (tab === 'visit') renderVisit();
      else if (m.p.key === S.me) renderPanel();
    },
    error: (m) => {
      if (m.for === 'house_buy') { confirmBuy = null; renderPanel(); }
    },
  });

  // ---- render loop ----------------------------------------------------------------------

  const resize = () => {
    const w = view.clientWidth, h = Math.round(w * 0.62);
    if (!w) return;
    r.renderer.setSize(w, h, false);
    r.canvas.style.height = `${h}px`;
    r.camera.aspect = w / h;
    r.camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(view);
  resize();

  const center = new THREE.Vector3(N / 2, 0.8, N / 2);
  const stop = loop((dt, now) => {
    const t = now / 1000;
    const cp = Math.cos(pitch);
    r.camera.position.set(center.x + Math.sin(yaw) * cp * dist, center.y + Math.sin(pitch) * dist, center.z + Math.cos(yaw) * cp * dist);
    r.camera.lookAt(center);
    for (const e of entries) {
      e.A.anim = e.A.anim.filter((fn) => !fn(t, dt));
      if (e.bounce < 1) {
        e.bounce = Math.min(1, e.bounce + dt / 0.35);
        const k = Math.sin(e.bounce * Math.PI) * (1 - e.bounce);
        e.group.scale.set(1 + k * 0.25, 1 - k * 0.3, 1 + k * 0.25);
      }
    }
    if (ghost?.visible) ghost.position.y = (kindOf(placing.id) === 'wall' ? WALL_Y : 0) + Math.sin(t * 6) * 0.03;
    updateWalkers(dt, t);
    r.renderer.render(r.scene, r.camera);
  });

  visit(S.me);
  return () => {
    stop();
    off();
    ro.disconnect();
    if (saveTimer && home && mine()) net.send('house_save', payload()); // flush a pending save
    clearTimeout(saveTimer);
    window.removeEventListener('keydown', onKey, true);
    r.canvas.removeEventListener('pointerdown', onPointerDown);
    r.canvas.removeEventListener('pointermove', onPointerMove);
    r.canvas.removeEventListener('pointerup', onPointerUp);
    r.canvas.removeEventListener('wheel', onWheel);
    r.canvas.removeEventListener('contextmenu', noMenu);
    if (ghost) r.scene.remove(ghost);
    r.marker.visible = false;
    r.grid.visible = false;
    clearGroup(r.items);
    clearGroup(r.people);
    r.canvas.remove();
  };
}
