// The neighbourhood: one street with a plot for every member of the zone, each with their house
// standing on it (walls, roof, front door, paths and yard, all from the house's `ext` data). house.js
// puts the inside of whichever house you're at on top of this, and keeps the world centred on it.
//
// Coordinates: "hood" coordinates are world units with the street along x at z = 0; this is what goes
// over the network. Each plot has its own tile grid (0..PLOT.w across, 0..PLOT.d back to front, the
// street at the front); plots on the far side of the street are turned round to face it.
import * as THREE from 'three';
import { toon, canvasTexture } from '../three/materials.js';
import { S } from '../state.js';
import { PLOT, TH, YARD_ITEMS, houseSpot, buildExterior, buildGround, buildYard, exteriorSolids, defaultExt, extMaterial } from '../three/exterior.js';

export const T = 1.6;                 // world units per tile
const ROAD = 13, WALK = 3.4;          // the road's width, and each pavement's
const PW = PLOT.w * T, PD = PLOT.d * T;
const EDGE = ROAD / 2 + WALK;         // from the middle of the road to the front of the plots
const MIN_PLOTS = 6;
const HEDGE = 0.3;                    // half the width of the hedge between two plots (tiles)

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

export function createHood() {
  const group = new THREE.Group();
  const plots = new Map(); // plot number -> { i, key, frame, group, parts, sig, solids, size, spot, doorK }
  let count = 0, street = null;

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
  const bounds = () => ({ minX: -(count / 4) * PW - 6, maxX: (count / 4) * PW + 6, minZ: -EDGE - PD, maxZ: EDGE + PD });

  // ---- the street: road, pavements, lamps, the lawn everything stands on
  function buildStreet() {
    if (street) group.remove(street);
    street = new THREE.Group();
    const b = bounds(), len = b.maxX - b.minX + 60;
    const flat = (w, d, x, y, z, mat, shadow = true) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = shadow; street.add(m); return m; };
    flat(len + 240, (EDGE + PD) * 2 + 240, 0, -0.06, 0, toon('#5fae55'));
    const road = extMaterial('asphalt', '#55585f').clone();
    road.map = road.map.clone(); road.map.repeat.set(len / 6, ROAD / 6); road.map.needsUpdate = true;
    flat(len, ROAD, 0, -0.03, 0, road);
    for (const s of [-1, 1]) {
      const walk = extMaterial('pavers', '#d2ccc0').clone();
      walk.map = walk.map.clone(); walk.map.repeat.set(len / 3.2, WALK / 3.2); walk.map.needsUpdate = true;
      flat(len, WALK, 0, -0.012, s * (ROAD / 2 + WALK / 2), walk);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.3), toon('#b9b5ac'));
      curb.position.set(0, -0.03, s * (ROAD / 2 + 0.05));
      street.add(curb);
    }
    // the dashed line down the middle
    const dashes = Math.floor(len / 6), dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 0.26), toon('#f4e9c0'), dashes), m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    for (let k = 0; k < dashes; k++) dash.setMatrixAt(k, m4.compose(new THREE.Vector3(-len / 2 + 3 + k * 6, -0.02, 0), q, new THREE.Vector3(1, 1, 1)));
    street.add(dash);
    // a street lamp at every plot boundary, on alternate sides
    const pole = toon('#2a2d36'), bulb = toon('#fff3b8', { emissive: '#ffd27a', emissiveIntensity: 0.9 });
    for (let c = 0; c <= count / 2; c++) {
      const x = (c - count / 4) * PW, z = (c % 2 ? 1 : -1) * (ROAD / 2 + 0.7);
      const lamp = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 5.2, 8), pole); post.position.y = 2.6; post.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.5), pole); arm.position.set(0, 5.15, z > 0 ? -0.6 : 0.6);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.6), bulb); light.position.set(0, 5.02, z > 0 ? -1.15 : 1.15);
      lamp.add(post, arm, light);
      lamp.position.set(x, 0, z);
      street.add(lamp);
    }
    // trees past both ends of the street and behind the back gardens, so the world doesn't just stop
    const trunk = toon('#7a4a28'), leaves = [toon('#3f9a4a'), toon('#57b35a'), toon('#2f7a4a')];
    const tree = (x, z, s) => {
      const t = new THREE.Group();
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.36, 2.4, 7), trunk); tr.position.y = 1.2;
      const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), leaves[Math.abs(Math.round(x + z)) % 3]); lf.position.y = 3.6; lf.castShadow = true;
      t.add(tr, lf); t.position.set(x, 0, z); t.scale.setScalar(s);
      street.add(t);
    };
    for (let x = b.minX - 4; x <= b.maxX + 4; x += 9) for (const s of [-1, 1]) tree(x + (s > 0 ? 4 : 0), s * (EDGE + PD + 5 + ((x * 7) % 5 + 5) % 5), 1 + ((Math.abs(x) * 3) % 5) / 9);
    for (const s of [-1, 1]) for (let z = -EDGE - PD; z <= EDGE + PD; z += 8) if (Math.abs(z) > ROAD / 2 + 2) tree(s * (b.maxX + 5 + (Math.abs(z) % 3)), z, 1.1);
    group.add(street);
  }

  // ---- one plot: its lawn, hedges, sign, and (if someone lives there) their house and yard
  function buildPlot(i, key) {
    const p = S.players[key], h = p?.house, f = frameOf(i);
    const g = new THREE.Group();
    g.position.set(f.cx, 0, f.cz);
    g.rotation.y = f.flip < 0 ? Math.PI : 0;
    g.scale.setScalar(T);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(PLOT.w, PLOT.d), toon(i % 4 < 2 ? '#66b65c' : '#5aa852'));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(PLOT.w / 2, -0.008, PLOT.d / 2); lawn.receiveShadow = true;
    g.add(lawn);
    // hedges down both sides and along the back: where one property stops and the next starts
    const hedge = toon('#3f8a4a'), top = toon('#57b35a');
    for (const [w, d, x, z] of [[HEDGE, PLOT.d - 2, HEDGE / 2, PLOT.d / 2 - 1], [HEDGE, PLOT.d - 2, PLOT.w - HEDGE / 2, PLOT.d / 2 - 1], [PLOT.w, HEDGE, PLOT.w / 2, HEDGE / 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), hedge); m.position.set(x, 0.35, z); m.castShadow = true;
      const t = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.06, d), top); t.position.set(x, 0.72, z);
      g.add(m, t);
    }
    // the sign by the pavement: whose house it is (yours is gold), or that the plot's free
    const mine = key === S.me, post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), toon('#6b4226'));
    post.position.set(PLOT.w / 2 - 3, 0.6, PLOT.d - 0.6);
    // (a board with the name on both faces, so it reads the right way round from the garden too)
    const signMat = new THREE.MeshBasicMaterial({ map: nameSign(p ? (mine ? '★ My House' : `${p.name}'s House`) : 'For Sale', mine) });
    for (const s of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.72), signMat);
      sign.position.set(PLOT.w / 2 - 3, 1.35, PLOT.d - 0.6 + s * 0.06);
      sign.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(sign);
    }
    g.add(post);
    const plot = { i, key: p ? key : null, frame: f, group: g, sig: '', parts: null, size: null, spot: null, yard: [], doorK: 0, cut: null };
    if (p) dress(plot, h);
    group.add(g);
    return plot;
  }
  /** (Re)build a plot's house and yard from house data: { size, door, ext, win }. */
  function dress(plot, h) {
    if (plot.house) plot.group.remove(plot.house);
    const size = h?.size ?? [14, 14], ext = { ...defaultExt(), ...(h?.ext ?? {}) }, spot = houseSpot(size);
    const hg = new THREE.Group();
    const parts = buildExterior(ext, size, { door: h?.door ?? 'door_classic', windows: h?.win ?? [] });
    parts.group.position.set(spot.x, 0, spot.z);
    const ground = buildGround(ext.ground), yard = buildYard(ext.yard);
    hg.add(parts.group, ground, yard);
    plot.group.add(hg);
    Object.assign(plot, { house: hg, parts, ground, yardG: yard, size, spot, ext, solids: exteriorSolids(size), yard: ext.yard ?? [] });
    if (plot.cut) cutaway(plot, plot.cut);
    parts.door?.userData.swing?.(plot.doorK);
  }
  const sigOf = (h) => JSON.stringify([h?.size, h?.door, h?.ext, h?.win]);

  /** Bring the street in line with who lives here now (and how their houses look from outside). */
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
      if (!pl || pl.key !== key) {
        if (pl) group.remove(pl.group);
        const fresh = buildPlot(i, key);
        fresh.sig = key ? sigOf(S.players[key].house) : '';
        if (pl?.override && key === pl.key) { fresh.override = pl.override; dress(fresh, pl.override); }
        plots.set(i, fresh);
      } else if (key && !pl.override) {
        const sig = sigOf(S.players[key].house);
        if (sig !== pl.sig) { pl.sig = sig; dress(pl, S.players[key].house); }
      }
    }
  }
  const plotOf = (key) => [...plots.values()].find((p) => p.key === key) ?? null;
  /** Show a house as it's being built (before the server has heard): { size, door, ext, win }, or null to stop. */
  function override(key, h) {
    const pl = plotOf(key);
    if (!pl) return;
    pl.override = h;
    dress(pl, h ?? S.players[key]?.house);
    if (!h) pl.sig = sigOf(S.players[key]?.house);
  }
  /** Hide walls (and the roof) of a house to see inside it. cut: { walls: [4 x shown?], roof: shown? } or null. */
  function cutaway(plot, cut) {
    plot.cut = cut;
    if (!plot.parts) return;
    plot.parts.walls.forEach((w, s) => { w.visible = cut ? cut.walls[s] : true; });
    plot.parts.roof.visible = cut ? cut.roof : true;
    plot.parts.trim.visible = cut ? cut.walls.every(Boolean) : true;
    if (plot.parts.door) plot.parts.door.visible = cut ? cut.walls[2] : true;
  }

  /** Is there something solid here (hood units; r: your radius)? Hedges, house walls, trees, fences… */
  function blocked(hx, hz, r = 0.4) {
    const i = plotAt(hx, hz), pl = plots.get(i);
    if (!pl) return false;
    const p = toPlot(pl.frame, hx, hz), R = r / T;
    if (p.z < PLOT.d - 2 && (p.x < HEDGE + R || p.x > PLOT.w - HEDGE - R)) return true;
    if (p.z < HEDGE + R) return true;
    if (!pl.solids) return false;
    const x = p.x - pl.spot.x, z = p.z - pl.spot.z;
    for (const s of pl.solids) if (x > s.x0 - R && x < s.x1 + R && z > s.z0 - R && z < s.z1 + R) return true;
    for (const y of pl.yard) { const rr = YARD_ITEMS[y.id]?.r; if (rr && Math.hypot(p.x - y.x, p.z - y.y) < rr + R) return true; }
    return false;
  }

  /** Front doors swing open for whoever walks up to them. walkers: [{ x, z }] in hood units. Returns
   *  +1 / -1 if a door near `me` just opened / shut (for the sound). */
  function update(dt, walkers, me) {
    let sound = 0;
    for (const pl of plots.values()) {
      const door = pl.parts?.door;
      if (!door) continue;
      const d = toHood(pl.frame, pl.spot.x + pl.size[0] / 2, pl.spot.z + pl.size[1]);
      let want = 0;
      for (const w of walkers) {
        if (Math.hypot(w.x - d.x, w.z - d.z) > 2.6) continue;
        want = pl.frame.flip * (w.z - d.z) > 0 ? 1 : -1; // (it swings away from you)
        break;
      }
      if (want && pl.doorWant && want !== pl.doorWant) want = pl.doorWant; // (don't flap as you walk through)
      if (!!want !== !!pl.doorWant && me && Math.hypot(me.x - d.x, me.z - d.z) < 14) sound = want ? 1 : -1;
      pl.doorWant = want;
      if (pl.doorK !== want) {
        pl.doorK += Math.sign(want - pl.doorK) * Math.min(Math.abs(want - pl.doorK), dt * 3.2);
        door.userData.swing?.(pl.doorK);
      }
    }
    return sound;
  }

  /**
   * The view from a house: turns hood units into that house's own units (its room's back-left corner at
   * the origin, +z out through the front door), which is how house.js sees the world.
   */
  function viewFrom(key, size) {
    const pl = plotOf(key);
    if (!pl) return null;
    const f = pl.frame, sp = houseSpot(size ?? pl.size ?? [14, 14]), ox = sp.x * T, oz = sp.z * T, turn = f.flip < 0 ? Math.PI : 0;
    return {
      key, plot: pl, flip: f.flip, turn,
      toLocal: (hx, hz) => ({ x: f.flip * (hx - f.cx) - ox, z: f.flip * (hz - f.cz) - oz }),
      toHood: (x, z) => ({ x: f.cx + f.flip * (x + ox), z: f.cz + f.flip * (z + oz) }),
      /** Put the neighbourhood where this house sees it. */
      apply() {
        group.rotation.y = turn;
        if (f.flip > 0) group.position.set(-f.cx - ox, 0, -f.cz - oz); else group.position.set(f.cx - ox, 0, f.cz - oz);
      },
      /** The plot's own tiles <-> this house's units. */
      plotToLocal: (px, pz) => ({ x: px * T - ox, z: pz * T - oz }),
      localToPlot: (x, z) => ({ x: (x + ox) / T, z: (z + oz) / T }),
    };
  }
  /** Where you arrive at someone's house: on the pavement at the end of their path (hood units + heading). */
  function arrival(key) {
    const pl = plotOf(key);
    if (!pl) return { x: 0, z: 0, h: 0 };
    return { ...toHood(pl.frame, PLOT.w / 2, PLOT.d + 1), h: pl.frame.flip > 0 ? Math.PI : 0 };
  }
  /** Whose plot a point in hood units is on (their key), or null. */
  const ownerAt = (hx, hz) => plots.get(plotAt(hx, hz))?.key ?? null;

  sync();
  return { group, sync, override, plotOf, viewFrom, arrival, ownerAt, blocked, update, bounds, cutaway: (key, cut) => { const pl = plotOf(key); if (pl) cutaway(pl, cut); }, T, TH };
}
