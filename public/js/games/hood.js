// The neighbourhood: one street with a plot for every member of the zone. A plot starts empty; whatever
// its owner builds on it (walls, doors, roofs, paths, a yard) stands there for everyone to see. house.js
// builds the house you're at in full (furniture and all) and keeps the world centred on it; this file
// draws the street and everybody else's house from the outside.
//
// Coordinates: "hood" coordinates are world units with the street along x at z = 0; this is what goes
// over the network. Each plot has its own tile grid (0..PLOT.w across, 0..PLOT.d back to front, the
// street at the front); plots on the far side of the street are turned round to face it.
import * as THREE from 'three';
import { toon, canvasTexture } from '../three/materials.js';
import { S } from '../state.js';
import { PLOT, YARD_ITEMS, buildRoofs, buildGround, buildYard, defaultExt, extMaterial } from '../three/exterior.js';
import { buildShell } from './house.js';

export const T = 1.6;                 // world units per tile
const ROAD = 13, WALK = 3.4;          // the road's width, and each pavement's
const PW = PLOT.w * T, PD = PLOT.d * T;
const EDGE = ROAD / 2 + WALK;         // from the middle of the road to the front of the plots
const MIN_PLOTS = 6;
const HEDGE = 0.3;                    // half the width of the hedge between two plots (tiles)

function prng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const signTex = new Map();
function nameSign(text, mine) {
  const key = `${text}|${mine}`;
  if (!signTex.has(key)) signTex.set(key, canvasTexture(256, 96, (c) => {
    c.fillStyle = mine ? '#ffd84d' : '#fff8e8'; c.beginPath(); c.roundRect(4, 4, 248, 88, 14); c.fill();
    c.lineWidth = 6; c.strokeStyle = '#6b4226'; c.stroke();
    c.fillStyle = '#3a2416'; c.textAlign = 'center'; c.textBaseline = 'middle';
    let size = 38;
    do { c.font = `bold ${size}px system-ui, sans-serif`; size -= 2; } while (c.measureText(text).width > 228 && size > 14);
    c.fillText(text, 128, 50);
  }));
  return signTex.get(key);
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
  let count = 0, street = null, clouds = [];

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

  // ---- the street and the country round it
  function buildStreet() {
    if (street) group.remove(street);
    street = new THREE.Group();
    clouds = [];
    const b = bounds(), len = b.maxX - b.minX + 8, rnd = prng(count * 7 + 3);
    const flat = (w, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; street.add(m); return m; };
    const tiled = (mat, rx, rz) => { const m = mat.clone(); m.map = m.map.clone(); m.map.repeat.set(rx, rz); m.map.needsUpdate = true; return m; };
    const field = new THREE.MeshToonMaterial({ color: '#63b257', map: grass(false) });
    flat(900, 900, 0, -0.07, 0, tiled(field, 150, 150));
    flat(len, ROAD, 0, -0.03, 0, tiled(extMaterial('asphalt', '#565960'), len / 6, ROAD / 6));
    // a turning circle at each end of the street
    for (const s of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.CircleGeometry(ROAD * 0.95, 40), extMaterial('asphalt', '#565960'));
      end.rotation.x = -Math.PI / 2; end.position.set(s * (len / 2), -0.032, 0); end.receiveShadow = true;
      const isle = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.3, 24), toon('#b9b5ac')); isle.position.set(s * (len / 2), 0.02, 0);
      const bed = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.34, 24), toon('#5aa852')); bed.position.set(s * (len / 2), 0.03, 0);
      street.add(end, isle, bed);
    }
    for (const s of [-1, 1]) {
      flat(len, WALK, 0, -0.012, s * (ROAD / 2 + WALK / 2), tiled(extMaterial('pavers', '#d2ccc0'), len / 3.2, WALK / 3.2));
      const curb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 0.34), toon('#b9b5ac'));
      curb.position.set(0, -0.02, s * (ROAD / 2 + 0.05));
      curb.receiveShadow = true;
      street.add(curb);
      flat(len, 0.16, 0, -0.022, s * (ROAD / 2 - 0.7), toon('#e9e4d4')); // the white line along the kerb
    }
    // the dashed line down the middle, and a zebra crossing between every pair of houses
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), one = new THREE.Vector3(1, 1, 1);
    const dashes = Math.floor(len / 6), dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 0.26), toon('#f4e9c0'), dashes);
    for (let k = 0; k < dashes; k++) dash.setMatrixAt(k, m4.compose(new THREE.Vector3(-len / 2 + 3 + k * 6, -0.02, 0), q, one));
    street.add(dash);
    const cols = count / 2, bars = 9, zebra = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, ROAD - 2.2), toon('#f1ede2'), cols * bars);
    for (let c = 0; c < cols; c++) for (let k = 0; k < bars; k++) zebra.setMatrixAt(c * bars + k, m4.compose(new THREE.Vector3((c - cols / 2 + 0.5) * PW - 5.6 + k * 1.4, -0.018, 0), q, one));
    street.add(zebra);
    // street lamps at every plot boundary (alternate sides), a hydrant and a bench here and there
    const pole = toon('#2a2d36'), bulb = toon('#fff3b8', { emissive: '#ffd27a', emissiveIntensity: 1 });
    for (let c = 0; c <= cols; c++) {
      const x = (c - cols / 2) * PW, side = c % 2 ? 1 : -1, z = side * (ROAD / 2 + 0.75);
      const lamp = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 5.4, 8), pole); post.position.y = 2.7; post.castShadow = true;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 8), pole); foot.position.y = 0.25;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.7), pole); arm.position.set(0, 5.35, -side * 0.7);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.8), pole); head.position.set(0, 5.3, -side * 1.3);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.62), bulb); light.position.set(0, 5.21, -side * 1.3);
      lamp.add(post, foot, arm, head, light);
      lamp.position.set(x, 0, z);
      street.add(lamp);
      if (c % 2 === 0) {
        const hy = new THREE.Group(), red = toon('#d8443a');
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.6, 10), red); body.position.y = 0.3;
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), red); cap.position.y = 0.62;
        const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.44, 8), red); nose.rotation.z = Math.PI / 2; nose.position.y = 0.4;
        hy.add(body, cap, nose); hy.position.set(x + 4, 0, -z); hy.traverse((o) => { o.castShadow = true; });
        street.add(hy);
      }
    }
    // trees: a row behind each line of back gardens, a wood past both ends, and hills on the horizon
    const trunk = toon('#7a4a28'), greens = [toon('#3f9a4a'), toon('#57b35a'), toon('#2f7a4a'), toon('#6cbf5f')], pink = toon('#ffb3d0');
    const tree = (x, z, s) => {
      const t = new THREE.Group(), kind = rnd();
      if (kind < 0.3) {
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 7), trunk); tr.position.y = 0.8;
        t.add(tr);
        for (let i = 0; i < 3; i++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(1.9 - i * 0.45, 2.4, 9), greens[2 - (i % 2) * 2]); cone.position.y = 2.4 + i * 1.3; cone.castShadow = true; t.add(cone); }
      } else {
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.38, 2.6, 7), trunk); tr.position.y = 1.3;
        const leaf = kind > 0.92 ? pink : greens[Math.floor(rnd() * 4)];
        const a = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 1), leaf); a.position.y = 3.9; a.castShadow = true;
        const b2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), leaf); b2.position.set(1.1, 3.2, 0.5);
        const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), leaf); c2.position.set(-1, 3.4, -0.6);
        t.add(tr, a, b2, c2);
      }
      t.position.set(x, 0, z); t.rotation.y = rnd() * 6; t.scale.setScalar(s);
      street.add(t);
    };
    for (let x = b.minX - 30; x <= b.maxX + 30; x += 7) for (const s of [-1, 1]) for (let row = 0; row < 3; row++) tree(x + rnd() * 5, s * (EDGE + PD + 5 + row * 9 + rnd() * 5), 0.9 + rnd() * 0.6);
    for (const s of [-1, 1]) for (let i = 0; i < 46; i++) { const z = (rnd() - 0.5) * 2 * (EDGE + PD + 20); if (Math.abs(z) > ROAD + 4) tree(s * (b.maxX + 14 + rnd() * 34), z, 0.9 + rnd() * 0.7); }
    const hillCols = ['#6fae6a', '#7fb878', '#8fc48a', '#9cc7a8'];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.2, r = 300 + rnd() * 120, h = 28 + rnd() * 50;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(hillCols[i % 4]));
      hill.scale.set(70 + rnd() * 60, h, 70 + rnd() * 60);
      hill.position.set(Math.cos(a) * r, -1, Math.sin(a) * r);
      street.add(hill);
    }
    // flowers along the verges
    const bloom = ['#ff8fc7', '#ffd84d', '#ffffff', '#b77bff', '#ff7a59'];
    const n = Math.floor(len / 1.4), heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toon('#fff').gradientMap }), n * 2);
    const col = new THREE.Color();
    for (let k = 0; k < n * 2; k++) {
      const s = k % 2 ? 1 : -1;
      heads.setMatrixAt(k, m4.compose(new THREE.Vector3(-len / 2 + Math.floor(k / 2) * 1.4 + rnd(), 0.16, s * (EDGE + PD + 1.2 + rnd() * 2.5)), q, one));
      heads.setColorAt(k, col.set(bloom[Math.floor(rnd() * bloom.length)]));
    }
    street.add(heads);
    // clouds, drifting
    const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, fog: false });
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

  // ---- one plot: its lawn, hedges and sign, and whatever its owner has built on it
  function buildPlot(i, key) {
    const p = S.players[key], f = frameOf(i);
    const g = new THREE.Group();
    g.position.set(f.cx, 0, f.cz);
    g.rotation.y = f.flip < 0 ? Math.PI : 0;
    g.scale.setScalar(T);
    const lawnMat = new THREE.MeshToonMaterial({ color: i % 4 < 2 ? '#69ba5e' : '#5fb055', map: grass(true) });
    lawnMat.map = lawnMat.map.clone(); lawnMat.map.repeat.set(PLOT.w / 4, PLOT.d / 4); lawnMat.map.needsUpdate = true;
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(PLOT.w, PLOT.d), lawnMat);
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(PLOT.w / 2, -0.008, PLOT.d / 2); lawn.receiveShadow = true;
    g.add(lawn);
    // hedges down both sides and along the back: where one property stops and the next starts
    const hedge = toon('#3a8546'), top = toon('#55ad58');
    for (const [w, d, x, z] of [[HEDGE, PLOT.d - 2, HEDGE / 2, PLOT.d / 2 - 1], [HEDGE, PLOT.d - 2, PLOT.w - HEDGE / 2, PLOT.d / 2 - 1], [PLOT.w, HEDGE, PLOT.w / 2, HEDGE / 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), hedge); m.position.set(x, 0.35, z); m.castShadow = true;
      const t = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.1, d - 0.04), top); t.position.set(x, 0.73, z);
      g.add(m, t);
    }
    // stone posts where the hedges meet the pavement
    for (const x of [HEDGE / 2, PLOT.w - HEDGE / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1, 0.42), toon('#c9c3b8')); post.position.set(x, 0.5, PLOT.d - 1.9); post.castShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.52), toon('#e3ded4')); cap.position.set(x, 1.05, PLOT.d - 1.9);
      g.add(post, cap);
    }
    // the sign by the pavement: whose plot it is (yours is gold), or that it's free
    const mine = key === S.me, post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), toon('#6b4226'));
    post.position.set(PLOT.w / 2 - 3, 0.6, PLOT.d - 0.6);
    const signMat = new THREE.MeshBasicMaterial({ map: nameSign(p ? (mine ? '★ My House' : `${p.name}'s House`) : 'For Sale', mine) });
    for (const s of [1, -1]) { // (the name on both faces, so it reads the right way round from the garden too)
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.72), signMat);
      sign.position.set(PLOT.w / 2 - 3, 1.35, PLOT.d - 0.6 + s * 0.06);
      sign.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(sign);
    }
    g.add(post);
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
    if (p.z < PLOT.d - 2 && (p.x < HEDGE + R || p.x > PLOT.w - HEDGE - R)) return true;
    if (p.z < HEDGE + R) return true;
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
  return { group, sync, setHouse, setActive, showRoofs, plotOf, viewFrom, arrival, ownerAt, blocked, update, bounds, missing, houses, T };
}
