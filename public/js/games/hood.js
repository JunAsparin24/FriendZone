// The neighbourhood: one street with a plot for every member of the zone. A plot starts empty; whatever
// its owner builds on it (walls, doors, roofs, paths, a yard) stands there for everyone to see. house.js
// builds the house you're at in full (furniture and all) and keeps the world centred on it; this file
// draws the street and everybody else's house from the outside.
//
// Coordinates: "hood" coordinates are world units with the street along x at z = 0; this is what goes
// over the network. Each plot has its own tile grid (0..PLOT.w across, 0..PLOT.d back to front, the
// street at the front); plots on the far side of the street are turned round to face it.
import * as THREE from 'three';
import { toon, canvasTexture, glowTexture } from '../three/materials.js';
import { dayPhase } from '../three/daynight.js';
import { S } from '../state.js';
import { PLOT, YARD_ITEMS, buildRoofs, buildGround, buildYard, defaultExt, extMaterial } from '../three/exterior.js';
import { buildShell } from './house.js';

export const T = 1.6;                 // world units per tile
const ROAD = 15, VERGE = 2.6, WALK = 3; // the road's width, the grass strip beside it, and the pavement
const PW = PLOT.w * T, PD = PLOT.d * T;
const EDGE = ROAD / 2 + VERGE + WALK; // from the middle of the road to the front of the plots
const MIN_PLOTS = 6;

function prng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const tagTex = new Map();
/** A name floating over a mailbox (yours in gold). */
function nameTag(text, mine) {
  const key = `${text}|${mine}`;
  if (!tagTex.has(key)) tagTex.set(key, canvasTexture(512, 128, (c) => {
    c.clearRect(0, 0, 512, 128);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let size = 76;
    do { c.font = `800 ${size}px system-ui, sans-serif`; size -= 3; } while (c.measureText(text).width > 480 && size > 20);
    c.lineJoin = 'round'; c.lineWidth = 12; c.strokeStyle = 'rgba(20,22,30,.9)'; c.strokeText(text, 256, 66);
    c.fillStyle = mine ? '#ffd84d' : '#ffffff'; c.fillText(text, 256, 66);
  }));
  return tagTex.get(key);
}
// grass: soft blades and mottling, so big lawns aren't one flat green; lawns are mown in stripes
let grassTex = null, lawnTex = null;
function grass(stripes) {
  const make = () => {
    const tex = canvasTexture(256, 256, (c) => {
      const rnd = prng(stripes ? 11 : 5);
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 256);
      if (stripes) { c.fillStyle = 'rgba(0,0,0,.04)'; for (let x = 0; x < 256; x += 64) c.fillRect(x, 0, 32, 256); }
      for (let i = 0; i < 2600; i++) {
        const v = rnd();
        c.fillStyle = v < 0.5 ? `rgba(0,40,0,${0.05 + rnd() * 0.09})` : `rgba(255,255,200,${0.05 + rnd() * 0.1})`;
        c.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.5, 2 + rnd() * 5);
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  };
  if (stripes) return (lawnTex ??= make());
  return (grassTex ??= make());
}

export function createHood() {
  const group = new THREE.Group();
  const plots = new Map(); // plot number -> { i, key, frame, group, house (what's built on it), roofs, active }
  const houses = {};       // member key -> their house data (from the server, or as it's being built here)
  let count = 0, street = null, clouds = [], lamps = [];
  // ---- day and night (the same clock as the town, so it's evening here when it's evening there)
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, fog: false });
  const bulbMat = new THREE.MeshToonMaterial({ color: '#fff3b8', emissive: '#ffd27a', emissiveIntensity: 0.2, gradientMap: toon('#fff').gradientMap });
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture, color: '#ffcf8a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const sky = new THREE.Color('#9fd4ff');
  // stars: a dome of points far overhead, faded in after dusk
  const starGeo = new THREE.BufferGeometry(), starPos = [], srnd = prng(99);
  for (let i = 0; i < 700; i++) { const a = srnd() * Math.PI * 2, e = 0.12 + srnd() * 1.4, r = 430; starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  group.add(stars);
  // a few real lights that sit on whichever street lamps are nearest you
  const lampLights = Array.from({ length: 5 }, () => { const l = new THREE.PointLight('#ffd9a0', 0, 34, 1.5); group.add(l); return l; });
  const SKY = { day: new THREE.Color('#9fd4ff'), dusk: new THREE.Color('#f3a57c'), night: new THREE.Color('#0a1130') };
  const LIGHT = { sunDay: new THREE.Color('#fff1d6'), sunDusk: new THREE.Color('#ffb070'), moon: new THREE.Color('#9fb4ff'), hemiDay: new THREE.Color('#fff6ea'), hemiNight: new THREE.Color('#7f93d6'), groundDay: new THREE.Color('#7a8f6a'), groundNight: new THREE.Color('#1d2540'), cloudNight: new THREE.Color('#34416b'), white: new THREE.Color('#ffffff') };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  /**
   * Set the light for the time of day. at: { scene, sun, hemi, x, z (where you are, in the scene's own
   * units), hx, hz (the same spot in hood units), flip }. Returns how much daylight there is (0..1).
   */
  function applyTime(at, phase = dayPhase()) {
    const a = phase * Math.PI * 2, up = Math.sin(a), day = smooth(-0.14, 0.2, up), dusk = (1 - smooth(0.02, 0.5, Math.abs(up))) * 0.75, night = 1 - day;
    sky.copy(SKY.night).lerp(SKY.day, day).lerp(SKY.dusk, dusk * (0.35 + 0.65 * day));
    at.scene.background = sky;
    at.scene.fog?.color.copy(sky);
    at.hemi.intensity = 0.52 + 0.73 * day;
    at.hemi.color.copy(LIGHT.hemiNight).lerp(LIGHT.hemiDay, day);
    at.hemi.groundColor.copy(LIGHT.groundNight).lerp(LIGHT.groundDay, day);
    at.sun.intensity = 0.3 + 1.6 * day;
    at.sun.color.copy(LIGHT.moon).lerp(LIGHT.sunDay, day).lerp(LIGHT.sunDusk, dusk * day);
    // the sun crosses the sky by day; by night the moon does the same from the other side
    const b = up >= -0.05 ? a : a - Math.PI, dx = Math.cos(b) * 0.85, dy = Math.max(0.3, Math.sin(b)), dz = 0.45, n = 46 / Math.hypot(dx, dy, dz);
    at.sun.position.set(at.x + at.flip * dx * n, dy * n, at.z + at.flip * dz * n);
    at.sun.target.position.set(at.x, 0, at.z);
    stars.material.opacity = night * 0.95;
    cloudMat.color.copy(LIGHT.cloudNight).lerp(LIGHT.white, day).lerp(SKY.dusk, dusk * day * 0.5);
    cloudMat.opacity = 0.55 + 0.35 * day;
    bulbMat.emissiveIntensity = 0.15 + 1.9 * night;
    poolMat.opacity = night * 0.55;
    if (night > 0.02 && lamps.length) {
      const near = [...lamps].sort((p, q) => Math.hypot(p.x - at.hx, p.z - at.hz) - Math.hypot(q.x - at.hx, q.z - at.hz));
      lampLights.forEach((l, i) => { const lp = near[i]; l.intensity = lp ? night * 90 : 0; if (lp) l.position.set(lp.x, 4.9, lp.z); });
    } else for (const l of lampLights) l.intensity = 0;
    return day;
  }


  /** Where plot i is: the corner its tile grid starts from (hood units) and which way it faces. */
  function frameOf(i, n = count) {
    const col = Math.floor(i / 2), far = i % 2 === 1, cols = n / 2, x0 = (col - cols / 2) * PW;
    return far ? { flip: -1, cx: x0 + PW, cz: EDGE + PD } : { flip: 1, cx: x0, cz: -EDGE - PD };
  }
  const toHood = (f, px, pz) => ({ x: f.cx + f.flip * px * T, z: f.cz + f.flip * pz * T });
  const toPlot = (f, hx, hz) => ({ x: (f.flip * (hx - f.cx)) / T, z: (f.flip * (hz - f.cz)) / T });
  /** Which plot (number) a point in hood units is on, or -1 on the street or beyond the houses. */
  function plotAt(hx, hz) {
    if (Math.abs(hz) < EDGE || Math.abs(hz) > EDGE + PD) return -1;
    const col = Math.floor(hx / PW + count / 4);
    if (col < 0 || col >= count / 2) return -1;
    return col * 2 + (hz > 0 ? 1 : 0);
  }
  const bounds = () => ({ minX: -(count / 4) * PW - 10, maxX: (count / 4) * PW + 10, minZ: -EDGE - PD, maxZ: EDGE + PD });

  // ---- the street: a wide plain road, a kerb, a strip of grass with trees, then the pavement
  function buildStreet() {
    if (street) group.remove(street);
    street = new THREE.Group();
    clouds = [];
    lamps = [];
    const b = bounds(), len = b.maxX - b.minX + 8, rnd = prng(count * 7 + 3), cols = count / 2;
    const flat = (w, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; street.add(m); return m; };
    const tiled = (mat, rx, rz) => { const m = mat.clone(); m.map = m.map.clone(); m.map.repeat.set(rx, rz); m.map.needsUpdate = true; return m; };
    const field = new THREE.MeshToonMaterial({ color: '#5fae55', map: grass(false) });
    flat(900, 900, 0, -0.07, 0, tiled(field, 150, 150));
    const roadMat = extMaterial('asphalt', '#8b8d92'), walkMat = extMaterial('stucco', '#bdbec2'), kerbMat = toon('#63656a');
    flat(len, ROAD, 0, -0.03, 0, tiled(roadMat, len / 7, ROAD / 7));
    for (const s of [-1, 1]) {
      // a turning circle at each end of the street
      const end = new THREE.Mesh(new THREE.CircleGeometry(ROAD * 0.9, 40), roadMat);
      end.rotation.x = -Math.PI / 2; end.position.set(s * (len / 2), -0.032, 0); end.receiveShadow = true;
      street.add(end);
      // the kerb, and the pavement beyond the strip of grass
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.45), kerbMat);
      kerb.position.set(0, -0.02, s * (ROAD / 2 + 0.1));
      kerb.receiveShadow = true;
      street.add(kerb);
      flat(len, WALK, 0, -0.012, s * (ROAD / 2 + VERGE + WALK / 2), tiled(walkMat, len / 4, WALK / 4));
    }
    // street lamps and trees along the grass strips, one of each per plot
    const pole = toon('#2a2d36'), bulb = bulbMat;
    const trunk = toon('#5a3a26'), greens = [toon('#4f9a45', { flatShading: true }), toon('#5fae55', { flatShading: true }), toon('#3f8a4a', { flatShading: true }), toon('#7ab648', { flatShading: true })];
    /** A tree the Bloxburg way: a tall thin trunk under one big chunky crown. */
    const tree = (x, z, s) => {
      const t = new THREE.Group();
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 4.6, 6), trunk); tr.position.y = 2.3; tr.castShadow = true;
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.7, 0), greens[Math.floor(rnd() * greens.length)]);
      crown.position.y = 5.6; crown.scale.set(1, 0.82 + rnd() * 0.2, 1); crown.rotation.set(rnd() * 3, rnd() * 3, 0); crown.castShadow = true;
      t.add(tr, crown);
      t.position.set(x, 0, z); t.scale.setScalar(s);
      street.add(t);
    };
    for (let c = 0; c <= cols; c++) {
      const x = (c - cols / 2) * PW, side = c % 2 ? 1 : -1, z = side * (ROAD / 2 + VERGE / 2);
      const lamp = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 5.4, 8), pole); post.position.y = 2.7; post.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 2.2), pole); arm.position.set(0, 5.35, -side * 1);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.8), pole); head.position.set(0, 5.3, -side * 1.9);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.62), bulb); light.position.set(0, 5.21, -side * 1.9);
      lamp.add(post, arm, head, light);
      lamp.position.set(x, 0, z);
      street.add(lamp);
      // (after dark: a pool of light on the road under it)
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), poolMat);
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.03, z - side * 1.9);
      street.add(pool);
      lamps.push({ x, z: z - side * 1.9 });
    }
    for (let c = 0; c < cols; c++) for (const s of [-1, 1]) tree((c - cols / 2 + 0.5) * PW + (s > 0 ? 9 : -9), s * (ROAD / 2 + VERGE / 2), 0.9 + rnd() * 0.25);
    // more trees behind the back gardens and past both ends, and hills on the horizon
    for (let x = b.minX - 30; x <= b.maxX + 30; x += 11) for (const s of [-1, 1]) for (let row = 0; row < 2; row++) tree(x + rnd() * 7, s * (EDGE + PD + 7 + row * 12 + rnd() * 6), 1 + rnd() * 0.7);
    for (const s of [-1, 1]) for (let i = 0; i < 26; i++) { const z = (rnd() - 0.5) * 2 * (EDGE + PD + 20); if (Math.abs(z) > ROAD + 6) tree(s * (b.maxX + 16 + rnd() * 36), z, 1 + rnd() * 0.7); }
    const hillCols = ['#6fae6a', '#7fb878', '#8fc48a', '#9cc7a8'];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.2, r = 300 + rnd() * 120, h = 28 + rnd() * 50;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(hillCols[i % 4]));
      hill.scale.set(70 + rnd() * 60, h, 70 + rnd() * 60);
      hill.position.set(Math.cos(a) * r, -1, Math.sin(a) * r);
      street.add(hill);
    }
    // clouds, drifting
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 5; k++) { const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + rnd() * 6, 10, 8), cloudMat); puff.position.set(k * 7 - 14 + rnd() * 3, rnd() * 3, rnd() * 5); puff.scale.y = 0.55; c.add(puff); }
      c.position.set((rnd() - 0.5) * 520, 62 + rnd() * 30, (rnd() - 0.5) * 420);
      c.userData.v = 0.6 + rnd() * 0.9;
      clouds.push(c);
      street.add(c);
    }
    group.add(street);
  }

  // ---- one plot: a plain flat piece of land (no fences: it's yours to build on), with the owner's
  // mailbox at the kerb and their name over it
  function buildPlot(i, key) {
    const p = S.players[key], f = frameOf(i);
    const g = new THREE.Group();
    g.position.set(f.cx, 0, f.cz);
    g.rotation.y = f.flip < 0 ? Math.PI : 0;
    g.scale.setScalar(T);
    const lawnMat = new THREE.MeshToonMaterial({ color: '#66b65b', map: grass(false) });
    lawnMat.map = lawnMat.map.clone(); lawnMat.map.repeat.set(PLOT.w / 4, PLOT.d / 4); lawnMat.map.needsUpdate = true;
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(PLOT.w - 0.06, PLOT.d - 0.06), lawnMat);
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(PLOT.w / 2, -0.008, PLOT.d / 2); lawn.receiveShadow = true;
    g.add(lawn);
    if (p) {
      const mine = key === S.me, mx = PLOT.w / 2 + 2, mz = PLOT.d - 0.55, steel = toon('#8d9199'), dark = toon('#2a2d36');
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.09), dark); post.position.set(mx, 0.475, mz);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.52), steel); box.position.set(mx, 1.06, mz);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.52, 10, 1, false, 0, Math.PI), steel); lid.rotation.set(Math.PI / 2, 0, Math.PI / 2); lid.position.set(mx, 1.19, mz);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.1), toon('#e0463c')); flag.position.set(mx + 0.19, 1.22, mz + 0.12);
      for (const m of [post, box, lid, flag]) { m.castShadow = true; g.add(m); }
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTag(p.name, mine), transparent: true, depthWrite: false }));
      tag.position.set(mx, 2.0, mz);
      tag.scale.set(2.6, 0.65, 1);
      g.add(tag);
    }
    const plot = { i, key: p ? key : null, frame: f, group: g, built: null, roofs: null, yard: [], active: false, roofsOn: true };
    group.add(g);
    if (plot.key) dress(plot);
    return plot;
  }
  /** (Re)build what stands on a plot from its owner's house data. The house you're at (active) is built
   *  in full by house.js, so here it only gets its roofs, paths and yard. */
  function dress(plot) {
    if (plot.built) plot.group.remove(plot.built);
    plot.built = plot.roofs = null;
    const h = houses[plot.key];
    if (!h) return;
    const ext = { ...defaultExt(), ...(h.ext ?? {}) };
    const g = new THREE.Group();
    // (plots used to come with a mailbox of their own in the yard: the one at the kerb has replaced it)
    ext.yard = (ext.yard ?? []).filter((y) => !(y.id === 'mailbox' && y.x === Math.floor(PLOT.w / 2) + 2 && y.y === PLOT.d - 1));
    const roofs = buildRoofs(ext.roofs, ext.wall), ground = buildGround(ext.ground), yard = buildYard(ext.yard);
    roofs.visible = plot.roofsOn;
    g.add(ground, yard, roofs);
    if (!plot.active) { try { g.add(buildShell(h)); } catch (err) { console.error('house on plot', plot.key, err); } }
    plot.group.add(g);
    Object.assign(plot, { built: g, roofs, yard: ext.yard ?? [] });
  }

  /** Bring the street in line with who lives here now. */
  function sync() {
    const members = Object.values(S.players);
    const top = Math.max(-1, ...members.map((p) => p.plot ?? 0));
    const n = Math.max(MIN_PLOTS, Math.ceil((top + 1) / 2) * 2 + 2); // (always a couple of plots free at the end)
    const byPlot = new Map(members.map((p) => [p.plot ?? 0, p.key]));
    if (n !== count) {
      // the street got longer: everything moves along, so lay it all out again
      for (const pl of plots.values()) group.remove(pl.group);
      plots.clear();
      count = n;
      buildStreet();
    }
    for (let i = 0; i < count; i++) {
      const key = byPlot.get(i) ?? null, pl = plots.get(i);
      if (pl && pl.key === key) continue;
      if (pl) group.remove(pl.group);
      const fresh = buildPlot(i, key);
      if (pl && key && pl.key === key) { fresh.active = pl.active; fresh.roofsOn = pl.roofsOn; }
      plots.set(i, fresh);
    }
  }
  const plotOf = (key) => [...plots.values()].find((p) => p.key === key) ?? null;
  /** A member's house changed (or we've just heard what it is): show it on their plot. */
  function setHouse(key, h) {
    houses[key] = h;
    const pl = plotOf(key);
    if (pl) dress(pl);
  }
  /** The house you're at: house.js builds it in full, so its plot stops drawing the walls itself. */
  function setActive(key) {
    for (const pl of plots.values()) {
      const on = pl.key != null && pl.key === key;
      if (pl.active !== on) { pl.active = on; pl.roofsOn = true; dress(pl); }
    }
  }
  /** Take the roofs off a house (to see into it while building) or put them back. */
  function showRoofs(key, on) {
    const pl = plotOf(key);
    if (!pl) return;
    pl.roofsOn = on;
    if (pl.roofs) pl.roofs.visible = on;
  }

  /** Is there something solid here (hood units; r: your radius)? Hedges, and trees and fences in yards.
   *  (The walls of the house you're at are house.js's business.) */
  function blocked(hx, hz, r = 0.4) {
    const pl = plots.get(plotAt(hx, hz));
    if (!pl) return false;
    const p = toPlot(pl.frame, hx, hz), R = r / T;
    for (const y of pl.yard) { const rr = YARD_ITEMS[y.id]?.r; if (rr && Math.hypot(p.x - y.x, p.z - y.y) < rr + R) return true; }
    return false;
  }

  /** Per frame: the clouds drift. */
  function update(dt) {
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 300) c.position.x = -300; }
  }

  /**
   * The view from a plot: turns hood units into that plot's own units (its back-left corner at the
   * origin, +z out towards the street), which is how house.js sees the world.
   */
  function viewFrom(key) {
    const pl = plotOf(key);
    if (!pl) return null;
    const f = pl.frame, turn = f.flip < 0 ? Math.PI : 0;
    return {
      key, plot: pl, flip: f.flip, turn,
      toLocal: (hx, hz) => ({ x: f.flip * (hx - f.cx), z: f.flip * (hz - f.cz) }),
      toHood: (x, z) => ({ x: f.cx + f.flip * x, z: f.cz + f.flip * z }),
      /** Put the neighbourhood where this plot sees it. */
      apply() {
        group.rotation.y = turn;
        if (f.flip > 0) group.position.set(-f.cx, 0, -f.cz); else group.position.set(f.cx, 0, f.cz);
      },
    };
  }
  /** Where you arrive at someone's plot: on the pavement at the middle of their frontage (hood units). */
  function arrival(key) {
    const pl = plotOf(key);
    if (!pl) return { x: 0, z: 0, h: 0 };
    return { ...toHood(pl.frame, PLOT.w / 2, PLOT.d + 1), h: pl.frame.flip > 0 ? Math.PI : 0 };
  }
  /** Whose plot a point in hood units is on (their key), or null. */
  const ownerAt = (hx, hz) => plots.get(plotAt(hx, hz))?.key ?? null;
  /** Members whose house we haven't been told about yet. */
  const missing = () => [...plots.values()].filter((p) => p.key && !houses[p.key]).map((p) => p.key);

  sync();
  return { group, applyTime, sync, setHouse, setActive, showRoofs, plotOf, viewFrom, arrival, ownerAt, blocked, update, bounds, missing, houses, T };
}
