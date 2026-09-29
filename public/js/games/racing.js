// Racing (3D): the FriendZone Grand Prix. A long winding circuit (through a tunnel, over a lake
// bridge, past the city) with boost pads and item boxes. Everyone drives their own kart; the server
// runs the countdown, relays karts and items, and records who crosses the line first.
// W/↑ gas · S/↓ brake · A/D steer · Space drift (hold through a corner, let go for a mini-turbo) ·
// Shift or E use your item.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, esc, nameOf, colorOf } from '../state.js';
import { toon, basic, shiny, canvasTexture, outlineMaterial, additive, glowTexture, TAU } from '../three/materials.js';
import { Sparks, FloatText, crowd } from '../three/fx.js';
import { sfx } from '../sfx.js';
import { listen, confetti } from './util.js';

const TW = 16;           // track width
const GRID_S0 = 6, GRID_GAP = 4.5, GRID_SIDE = 3.4, GRID_SLOTS = 10; // the starting grid behind the line
const OUT = outlineMaterial(0.04);

// The circuit: a closed spline through these points (x, z). The start/finish straight runs +x at z = 90.
const CONTROL = [
  [0, 90], [60, 92], [110, 86], [150, 66], [170, 30], [160, -8], [124, -24], [100, -56], [118, -94], [166, -108],
  [198, -146], [182, -188], [124, -202], [64, -182], [22, -150], [-24, -168], [-74, -190], [-124, -170], [-160, -128],
  [-168, -80], [-138, -50], [-100, -60], [-70, -30], [-88, 10], [-138, 22], [-168, 54], [-150, 92], [-100, 102], [-50, 96],
];
const curve = new THREE.CatmullRomCurve3(CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
const L = curve.getLength();
const SAMPLES = 3000;
const table = curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES).map((p, i, arr) => {
  const n = arr[(i + 1) % SAMPLES];
  const dx = n.x - p.x, dz = n.z - p.z, len = Math.hypot(dx, dz) || 1;
  return { x: p.x, z: p.z, dx: dx / len, dz: dz / len };
});

/** Point on the track `s` units from the start line, `off` units to the left of the direction of travel. */
function track(s, off = 0) {
  const u = (((s % L) + L) % L) / L * SAMPLES;
  const i = Math.floor(u) % SAMPLES, f = u - Math.floor(u);
  const a = table[i], b = table[(i + 1) % SAMPLES];
  const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
  const dx = a.dx + (b.dx - a.dx) * f, dz = a.dz + (b.dz - a.dz) * f;
  const len = Math.hypot(dx, dz) || 1;
  return { x: x + (dz / len) * off, z: z - (dx / len) * off, dx: dx / len, dz: dz / len, heading: Math.atan2(dx, dz) };
}

/** Nearest sample to (x, z), searching around a hint first. Returns { i, dist, side }. */
function locate(x, z, hint = -1) {
  let best = -1, bd = Infinity;
  const scan = (from, to, step) => {
    for (let k = from; k <= to; k += step) {
      const i = ((k % SAMPLES) + SAMPLES) % SAMPLES, t = table[i];
      const d = (t.x - x) ** 2 + (t.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
  };
  if (hint >= 0) scan(hint - 80, hint + 80, 1);
  if (hint < 0 || bd > 400) { scan(0, SAMPLES - 1, 6); scan(best - 8, best + 8, 1); }
  const t = table[best];
  const side = (x - t.x) * t.dz - (z - t.z) * t.dx;
  return { i: best, dist: Math.sqrt(bd), side };
}
const distToTrack = (x, z) => locate(x, z).dist;

// the barrier walls either side of the road: karts can't get further than this from the centre line
const WALL = TW / 2 + 1.4;
const KART_R = 0.9;

/** Push (x, z) back inside the walls. Returns the outward normal if it hit, else null. */
function wallHit(x, z, hint, r) {
  const loc = locate(x, z, hint), lim = WALL - r;
  if (loc.dist <= lim) return null;
  const t = table[loc.i];
  const nx = (x - t.x) / (loc.dist || 1), nz = (z - t.z) / (loc.dist || 1);
  return { x: t.x + nx * lim, z: t.z + nz * lim, nx, nz, t, i: loc.i };
}

/** A vertical strip following the track `off` to the side, `h` tall, skipping [from, to] fractions. */
function wallStrip(off, h, skip = []) {
  const pos = [], uv = [], idx = [];
  let i = 0, prevOk = false;
  for (let s = 0; s <= L + 0.001; s += 0.6) {
    const f = s / L;
    if (skip.some(([a, b]) => f > a && f < b)) { prevOk = false; continue; }
    const a = track(s, off);
    pos.push(a.x, 0, a.z, a.x, h, a.z);
    uv.push(s / 3, 0, s / 3, 1);
    if (prevOk) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
    prevOk = true;
    i++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ribbon(width, off, step = 0.6, y = 0) {
  const pos = [], uv = [], idx = [];
  let i = 0;
  for (let s = 0; s <= L + 0.001; s += step, i++) {
    const a = track(s, off + width / 2), b = track(s, off - width / 2);
    pos.push(a.x, y, a.z, b.x, y, b.z);
    uv.push(0, s / 4, 1, s / 4);
    if (i) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const wrap = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
const asphaltTex = wrap(canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#4a4c5e';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)';
    ctx.fillRect((i * 97) % 256, (i * 61) % 256, 2, 2);
  }
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillRect(126, 0, 4, 120);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillRect(4, 0, 5, 256);
  ctx.fillRect(247, 0, 5, 256);
}));
const curbTex = wrap(canvasTexture(64, 64, (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#e0463c';
  ctx.fillRect(0, 0, 64, 32);
}));
const barrierTex = wrap(canvasTexture(128, 64, (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#e0463c';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.fillRect(0, 0, 128, 6);
  ctx.fillRect(0, 58, 128, 6);
  ctx.fillRect(0, 29, 128, 4);
}));
const checkerTex = canvasTexture(128, 32, (ctx) => {
  for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) {
    ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
    ctx.fillRect(c * 16, r * 16, 16, 16);
  }
});
const grassTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#5fae55';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? '#58a44f' : '#66b65b';
    ctx.fillRect(0, i * 22, 256, 11);
  }
}, { repeat: [60, 60] });
const bannerTex = (text, bg) => canvasTexture(512, 96, (ctx) => {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.font = '64px "Luckiest Guy", Rubik, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 256, 72);
});
const chevronTex = canvasTexture(128, 128, (ctx) => {
  ctx.fillStyle = '#ff9f1a';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#fff36b';
  for (const y of [8, 52, 96]) { ctx.beginPath(); ctx.moveTo(20, y + 28); ctx.lineTo(64, y); ctx.lineTo(108, y + 28); ctx.lineTo(108, y + 44); ctx.lineTo(64, y + 16); ctx.lineTo(20, y + 44); ctx.closePath(); ctx.fill(); }
});
const boxTex = canvasTexture(128, 128, (ctx) => {
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  ['#ff5d73', '#ffd84d', '#6ee7a0', '#39c6ff', '#b77bff'].forEach((c, i) => g.addColorStop(i / 4, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.font = '900 84px Rubik, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1a1330';
  ctx.lineWidth = 8;
  ctx.strokeText('?', 64, 70);
  ctx.fillText('?', 64, 70);
});

// the special stretches of the lap, as fractions of it
const TUNNEL = [0.17, 0.235];
const BRIDGE = [0.55, 0.625];
const CITY = [0.8, 0.89];
const PADS = [0.08, 0.29, 0.47, 0.67, 0.93];      // boost pads
const BOXES = [0.13, 0.4, 0.61, 0.85];            // rows of item boxes
const inRange = (f, [a, b]) => f >= a && f <= b;

let env = null;
function buildTrack() {
  const g = new THREE.Group();
  const add = (parent, geo, mat, p = [0, 0, 0], r = null, { outline = false, cast = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    if (r) m.rotation.set(...r);
    m.castShadow = cast;
    m.receiveShadow = true;
    if (outline) m.add(new THREE.Mesh(geo, OUT));
    parent.add(m);
    return m;
  };
  add(g, new THREE.PlaneGeometry(900, 900), new THREE.MeshToonMaterial({ map: grassTex }), [0, -0.02, 0], [-Math.PI / 2, 0, 0], { cast: false });
  // the lake under the bridge
  const lakeAt = track(L * (BRIDGE[0] + BRIDGE[1]) / 2);
  add(g, new THREE.CircleGeometry(46, 40), shiny('#3f8fcf', { roughness: 0.15, metalness: 0.2 }), [lakeAt.x, 0.0, lakeAt.z], [-Math.PI / 2, 0, 0], { cast: false });
  add(g, new THREE.RingGeometry(46, 50, 40), toon('#e8d7a8'), [lakeAt.x, 0.01, lakeAt.z], [-Math.PI / 2, 0, 0], { cast: false });
  // gravel run-off, asphalt, curbs (the bridge section sits up on the deck)
  add(g, ribbon(TW + 6, 0, 0.6, 0.012), toon('#d9c7a3'), [0, 0, 0], null, { cast: false });
  add(g, ribbon(TW, 0, 0.6, 0.03), new THREE.MeshToonMaterial({ map: asphaltTex }), [0, 0, 0], null, { cast: false });
  for (const side of [1, -1]) add(g, ribbon(1, side * (TW / 2 + 0.5), 0.6, 0.05), new THREE.MeshToonMaterial({ map: curbTex }), [0, 0, 0], null, { cast: false });

  // start/finish line + gantry with the countdown lights
  const s0 = track(0);
  add(g, new THREE.PlaneGeometry(1.6, TW), new THREE.MeshBasicMaterial({ map: checkerTex }), [s0.x, 0.06, s0.z], [-Math.PI / 2, 0, s0.heading - Math.PI / 2], { cast: false });
  // numbered grid boxes: a white bracket for each starting slot, staggered two abreast
  const gridMat = basic('#ffffff');
  for (let i = 0; i < GRID_SLOTS; i++) {
    const p = track(-GRID_S0 - i * GRID_GAP, (i % 2 ? -1 : 1) * GRID_SIDE);
    const box = new THREE.Group();
    box.position.set(p.x, 0.045, p.z);
    box.rotation.y = p.heading;
    add(box, new THREE.PlaneGeometry(3.2, 0.25), gridMat, [0, 0, 1.6], [-Math.PI / 2, 0, 0], { cast: false });
    for (const sx of [-1.6, 1.6]) add(box, new THREE.PlaneGeometry(0.25, 1.4), gridMat, [sx, 0, 1.0], [-Math.PI / 2, 0, 0], { cast: false });
    g.add(box);
  }
  const gantry = new THREE.Group();
  for (const side of [-1, 1]) add(gantry, new THREE.BoxGeometry(0.6, 8, 0.6), toon('#6b7194'), [side * (TW / 2 + 1.2), 4, 0], null, { outline: true });
  add(gantry, new THREE.BoxGeometry(TW + 3, 1.8, 0.9), toon('#23263f'), [0, 8, 0], null, { outline: true });
  add(gantry, new THREE.PlaneGeometry(TW + 2.4, 1.3), new THREE.MeshBasicMaterial({ map: bannerTex('FRIENDZONE GP', '#e0463c') }), [0, 8, -0.5], [0, Math.PI, 0], { cast: false });
  const lamps = [0, 1, 2].map((i) => {
    const m = add(gantry, new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: '#3a2a2a' }), [(i - 1) * 1.4, 8, -0.5], null, { cast: false });
    const glow = new THREE.Sprite(additive(glowTexture, 0xff3b3b, 0));
    glow.scale.setScalar(2.6);
    m.add(glow);
    return { m, glow };
  });
  gantry.position.set(s0.x, 0, s0.z);
  gantry.rotation.y = s0.heading;
  g.add(gantry);

  // grandstands along the start straight + a jumbotron
  const spots = [];
  for (let tier = 0; tier < 6; tier++) {
    const z = 90 + TW / 2 + 6 + tier * 1.4, y = 0.8 + tier * 0.9;
    add(g, new THREE.BoxGeometry(90, y, 1.4), toon(tier % 2 ? '#c3c9d6' : '#aab3c5'), [30, y / 2, z]);
    for (let i = 0; i < 60; i++) spots.push({ x: -14 + (i + 0.5) * (88 / 60), y, z });
  }
  add(g, new THREE.BoxGeometry(92, 0.3, 9), toon('#e0463c'), [30, 7.4, 90 + TW / 2 + 9.5], [0.15, 0, 0], { outline: true });
  const cheer = crowd(g, spots);
  const screen = new THREE.Group();
  add(screen, new THREE.BoxGeometry(0.6, 12, 0.6), toon('#6b7194'), [0, 6, 0]);
  add(screen, new THREE.BoxGeometry(14, 8, 0.8), toon('#23263f'), [0, 14, 0], null, { outline: true });
  const screenTex = bannerTex('🏎️ GO GO GO!', '#3b5bdb');
  add(screen, new THREE.PlaneGeometry(13, 7), new THREE.MeshBasicMaterial({ map: screenTex }), [0, 14, 0.45], null, { cast: false });
  screen.position.set(-40, 0, 72);
  screen.rotation.y = 0.5;
  g.add(screen);

  // sponsor arches around the lap
  [['🏎️ ZOOM', '#3b5bdb', 0.35], ['🍋 LEMON', '#e0a020', 0.72], ['👾 BOSS CAVE', '#6a3fb5', 0.96]].forEach(([text, col, f]) => {
    const p = track(L * f);
    const arch = new THREE.Group();
    for (const side of [-1, 1]) add(arch, new THREE.CylinderGeometry(0.35, 0.35, 6.5, 10), toon(col), [side * (TW / 2 + 1), 3.25, 0], null, { outline: true });
    add(arch, new THREE.BoxGeometry(TW + 2.6, 1.4, 0.5), toon(col), [0, 6.6, 0], null, { outline: true });
    const tex = bannerTex(text, col);
    for (const rot of [0, Math.PI]) add(arch, new THREE.PlaneGeometry(TW + 2, 1.2), new THREE.MeshBasicMaterial({ map: tex }), [0, 6.6, rot ? 0.26 : -0.26], [0, rot, 0], { cast: false });
    arch.position.set(p.x, 0, p.z);
    arch.rotation.y = p.heading;
    g.add(arch);
  });

  // the tunnel: a rock roof over the road held up by stone arches, with rocky hills either side
  const rock = toon('#8f8a99'), rockDark = toon('#6d6a85');
  const roofMat = toon('#7d788f', { side: THREE.DoubleSide });
  const TSTEP = 0.004, TR = TW / 2 + 1.6;
  for (let f = TUNNEL[0]; f <= TUNNEL[1] + 1e-6; f += TSTEP) {
    const p = track(L * f);
    const ring = new THREE.Group();
    const end = f === TUNNEL[0] || f + TSTEP > TUNNEL[1] + 1e-6;
    // an arch across the road (the torus lies in the ring's XY plane, so local X runs across the track)
    add(ring, new THREE.TorusGeometry(TR, end ? 1.3 : 0.9, 6, 16, Math.PI), end ? rockDark : rock, [0, 0, 0], null, { outline: end });
    // the roof between this arch and the next (half a cylinder along the road)
    if (f + TSTEP <= TUNNEL[1] + 1e-6) {
      const roof = new THREE.CylinderGeometry(TR - 0.4, TR - 0.4, L * TSTEP + 0.6, 16, 1, true, Math.PI / 2, Math.PI);
      add(ring, roof, roofMat, [0, 0, (L * TSTEP) / 2], [Math.PI / 2, 0, 0], { cast: false });
    }
    const lamp = add(ring, new THREE.SphereGeometry(0.25, 8, 6), basic('#ffd27a'), [0, TR - 0.9, 0], null, { cast: false });
    lamp.visible = Math.round(f * 1000) % 12 === 0;
    ring.position.set(p.x, 0, p.z);
    ring.rotation.y = p.heading;
    g.add(ring);
  }
  const mid = track(L * (TUNNEL[0] + TUNNEL[1]) / 2);
  // rocky hills hugging both sides of the tunnel, kept clear of the road
  for (let f = TUNNEL[0] - 0.01; f <= TUNNEL[1] + 0.01; f += 0.012) {
    for (const side of [-1, 1]) {
      const r = 9 + ((Math.round(f * 1000) * 7) % 5);
      const q = track(L * f, side * (TR + r * 0.9));
      if (distToTrack(q.x, q.z) < TR + r * 0.75) continue;
      const hill = add(g, new THREE.IcosahedronGeometry(r, 1), rock, [q.x, -r * 0.35, q.z], [0, f * 40, 0]);
      hill.scale.set(1, 0.75, 1);
    }
  }
  const light = new THREE.PointLight(0xffd27a, 30, 40, 1.6);
  light.position.set(mid.x, 6, mid.z);
  g.add(light);

  // the lake bridge: railings and posts along the deck
  for (let f = BRIDGE[0]; f <= BRIDGE[1]; f += 0.0025) {
    for (const side of [-1, 1]) {
      const p = track(L * f, side * (TW / 2 + 1.3));
      add(g, new THREE.BoxGeometry(0.25, 1.4, 0.25), toon('#ffffff'), [p.x, 0.7, p.z]);
      if (Math.round(f * 4000) % 6 === 0) add(g, new THREE.CylinderGeometry(0.5, 0.6, 3, 8), toon('#aab3c5'), [p.x, -1, p.z]);
    }
  }
  for (const side of [-1, 1]) add(g, ribbon(0.2, side * (TW / 2 + 1.3), 0.6, 1.35), toon('#e0463c'), [0, 0, 0], null, { cast: false });

  // barrier walls all the way round (the bridge has its own railings)
  const wallMat = new THREE.MeshToonMaterial({ map: barrierTex, side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap });
  for (const side of [-1, 1]) {
    add(g, wallStrip(side * WALL, 1.1, [BRIDGE]), wallMat, [0, 0, 0], null, { cast: false });
    add(g, ribbon(0.45, side * (WALL + 0.1), 0.6, 1.12), toon('#23263f'), [0, 0, 0], null, { cast: false });
  }

  // the city: tall blocky buildings with lit windows on both sides
  const winTex = canvasTexture(64, 128, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 128);
    for (let y = 8; y < 128; y += 20) for (let x = 6; x < 64; x += 20) { ctx.fillStyle = (x + y) % 3 ? '#9fd6ff' : '#fff1b8'; ctx.fillRect(x, y, 12, 12); }
  });
  const cityCols = ['#ffadad', '#bde0fe', '#caffbf', '#ffd6a5', '#e0c3fc', '#fdffb6'];
  let bi = 0;
  for (let f = CITY[0]; f <= CITY[1]; f += 0.009) {
    for (const side of [-1, 1]) {
      const p = track(L * f, side * (TW / 2 + 9 + (bi % 3) * 2));
      const h = 10 + ((bi * 7) % 5) * 5;
      const b = new THREE.Mesh(new THREE.BoxGeometry(9, h, 9), new THREE.MeshToonMaterial({ map: winTex, color: cityCols[bi % cityCols.length] }));
      b.material.map = winTex.clone();
      b.material.map.wrapS = b.material.map.wrapT = THREE.RepeatWrapping;
      b.material.map.repeat.set(2, h / 8);
      b.position.set(p.x, h / 2, p.z);
      b.rotation.y = p.heading;
      b.castShadow = true;
      b.add(new THREE.Mesh(b.geometry, OUT));
      g.add(b);
      bi++;
    }
  }

  // tyre walls on the outside of every tight corner
  const tyre = new THREE.TorusGeometry(0.45, 0.22, 8, 16);
  const tyreMat = toon('#23232b'), tyreRed = toon('#e0463c');
  for (let s = 0; s < L; s += 2.4) {
    const f = s / L;
    if (inRange(f, TUNNEL) || inRange(f, BRIDGE) || inRange(f, CITY)) continue;
    const a = track(s), b = track(s + 3);
    const turn = Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz);
    if (Math.abs(turn) < 0.06) continue;
    const p = track(s, (turn > 0 ? 1 : -1) * (TW / 2 + 3));
    for (let k = 0; k < 2; k++) add(g, tyre, k ? tyreRed : tyreMat, [p.x, 0.22 + k * 0.4, p.z], [Math.PI / 2, 0, 0]);
  }

  // boost pads and item box rows
  const pads = PADS.map((f, i) => {
    const off = [-3, 3, 0, -3, 3][i];
    const p = track(L * f, off);
    const m = add(g, new THREE.PlaneGeometry(3.4, 5), new THREE.MeshBasicMaterial({ map: chevronTex, transparent: true }), [p.x, 0.07, p.z], [-Math.PI / 2, 0, p.heading + Math.PI], { cast: false }); // chevrons point along the track
    return { s: L * f, off, x: p.x, z: p.z, m };
  });
  const boxes = [];
  BOXES.forEach((f) => {
    for (const off of [-4.5, -1.5, 1.5, 4.5]) {
      const p = track(L * f, off);
      const m = add(g, new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshToonMaterial({ map: boxTex, transparent: true, opacity: 0.92 }), [p.x, 1.2, p.z], null, { outline: true });
      boxes.push({ x: p.x, z: p.z, m, back: 0 });
    }
  });

  // scenery: forests, desert rocks and cacti in the south-east, palms by the lake, hot air balloons
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  let trees = 0;
  for (let i = 0; i < 3000 && trees < 380; i++) {
    const x = (rnd() - 0.5) * 500, z = (rnd() - 0.5) * 420;
    if (distToTrack(x, z) < TW / 2 + 8 || (z > 94 && z < 115 && x > -20 && x < 80) || Math.hypot(x - lakeAt.x, z - lakeAt.z) < 52 || Math.hypot(x - mid.x, z - mid.z) < 38) continue;
    const tree = new THREE.Group();
    const desert = x > 90 && z < -110;
    if (desert) {
      if (rnd() < 0.5) {
        add(tree, new THREE.CapsuleGeometry(0.5, 2.6, 4, 8), toon('#3f9a4a'), [0, 1.8, 0], null, { outline: true });
        add(tree, new THREE.CapsuleGeometry(0.3, 1, 4, 8), toon('#3f9a4a'), [0.6, 2.2, 0], [0, 0, -0.9]);
      } else add(tree, new THREE.DodecahedronGeometry(1.5 + rnd() * 2, 0), toon('#c9683a'), [0, 0.8, 0], null, { outline: true });
    } else {
      add(tree, new THREE.CylinderGeometry(0.25, 0.35, 2, 6), toon('#7a4a28'), [0, 1, 0]);
      if (rnd() < 0.45) add(tree, new THREE.ConeGeometry(1.6 + rnd(), 4.6, 8), toon(rnd() < 0.5 ? '#2f7f5e' : '#23744a'), [0, 3.7, 0]);
      else add(tree, new THREE.IcosahedronGeometry(1.7 + rnd(), 0), toon(rnd() < 0.5 ? '#3fa34d' : '#2f8a44'), [0, 3, 0]);
    }
    tree.position.set(x, 0, z);
    g.add(tree);
    trees++;
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const x = lakeAt.x + Math.cos(a) * 52, z = lakeAt.z + Math.sin(a) * 52;
    if (distToTrack(x, z) < TW / 2 + 3) continue;
    const palm = new THREE.Group();
    add(palm, new THREE.CylinderGeometry(0.2, 0.3, 5, 6), toon('#a0703f'), [0, 2.5, 0], [0, 0, 0.12]);
    for (let k = 0; k < 6; k++) add(palm, new THREE.BoxGeometry(3, 0.1, 0.8), toon('#2f9e44'), [Math.cos(k) * 1.2, 5, Math.sin(k) * 1.2], [0, -k, 0.35]);
    palm.position.set(x, 0, z);
    g.add(palm);
  }
  const balloons = [0, 1, 2, 3].map((i) => {
    const b = new THREE.Group();
    add(b, new THREE.SphereGeometry(4, 16, 12), toon(['#ff5d73', '#ffd84d', '#39c6ff', '#b77bff'][i]), [0, 5, 0], null, { outline: true });
    add(b, new THREE.BoxGeometry(1.4, 1.2, 1.4), toon('#8b5a2b'), [0, -0.6, 0]);
    b.position.set(-150 + i * 110, 40 + i * 6, -60 + (i % 2) * 130);
    g.add(b);
    return b;
  });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, h = 50 + (i % 4) * 16;
    add(g, new THREE.ConeGeometry(h * 0.9, h, 7), toon('#7e93b8'), [Math.cos(a) * 380, h / 2 - 4, Math.sin(a) * 330]);
  }
  return { group: g, lamps, cheer, pads, boxes, balloons };
}

function buildKart(color) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const add = (geo, mat, p, r = null, outline = true, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    if (r) m.rotation.set(...r);
    m.castShadow = true;
    if (outline) m.add(new THREE.Mesh(geo, OUT));
    parent.add(m);
    return m;
  };
  const paint = toon(color).clone(); // its own material, so a Star can make it shimmer
  add(new THREE.BoxGeometry(1.5, 0.35, 2.6), paint, [0, 0.45, 0]);
  add(new THREE.BoxGeometry(1.2, 0.3, 0.9), toon(color), [0, 0.55, 1.35], [0.25, 0, 0]);
  add(new THREE.BoxGeometry(1.7, 0.12, 0.5), toon('#23263f'), [0, 0.5, 1.75]);
  add(new THREE.BoxGeometry(1.6, 0.4, 0.3), toon('#23263f'), [0, 0.85, -1.2]);
  add(new THREE.BoxGeometry(1.9, 0.1, 0.5), toon(color), [0, 1.25, -1.35]); // spoiler
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.4, 0.3), toon('#23263f'), [s * 0.7, 1.05, -1.35], null, false);
  add(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16), toon('#23263f'), [0, 1.0, 0.75], [1.1, 0, 0], false);
  const wheels = [];
  for (const [x, z] of [[-0.85, 0.9], [0.85, 0.9], [-0.85, -0.9], [0.85, -0.9]]) {
    const w = new THREE.Group();
    w.position.set(x, 0.36, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.34, 16), toon('#1b1b24'));
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.08), shiny('#c0c6d4'));
    w.add(tire, hub);
    body.add(w);
    wheels.push(w);
  }
  const flames = [-0.45, 0.45].map((x) => {
    const f = new THREE.Sprite(additive(glowTexture, 0xff8a2a, 0));
    f.scale.set(0.8, 0.8, 1);
    f.position.set(x, 0.6, -1.6);
    body.add(f);
    return f;
  });
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 14), new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.22, depthWrite: false }));
  bubble.position.y = 0.9;
  bubble.visible = false;
  g.add(bubble);
  return { g, body, wheels, flames, bubble, color, paint };
}

// items: what they are and how likely you are to get them (front of the pack vs the back)
const ITEMS = {
  turbo: { icon: '🍄', name: 'Turbo' },
  banana: { icon: '🍌', name: 'Banana' },
  oil: { icon: '🛢️', name: 'Oil Slick' },
  shell: { icon: '🟢', name: 'Bouncy Shell' },
  rocket: { icon: '🚀', name: 'Homing Rocket' },
  zap: { icon: '⚡', name: 'Zap' },
  shield: { icon: '🫧', name: 'Bubble Shield' },
  star: { icon: '⭐', name: 'Star' },
};
function rollItem(place, field) {
  const back = field > 1 ? place / (field - 1) : 0.5; // 0 = leading, 1 = last
  const odds = {
    banana: 3 - back * 2, oil: 2 - back, shield: 2.2 - back, shell: 2.4, turbo: 1 + back * 2,
    rocket: back * 2.6, zap: back > 0.6 ? back * 1.4 : 0.1, star: back * 1.2,
  };
  let r = Math.random() * Object.values(odds).reduce((a, b) => a + b, 0);
  return Object.keys(odds).find((k) => (r -= odds[k]) < 0) ?? 'shell';
}

const ACCEL = 12, BRAKE = 30, MAX = 29, BOOST_MAX = 44, GRASS_MAX = 11;

export function racing(stage) {
  env ||= buildTrack();
  stage.lights({ background: '#8fd0ff', sunPos: [60, 90, 50], box: 120, hemi: 1.25, fog: ['#bfe3ff', 160, 420] });
  stage.scene.add(env.group);
  const sparks = new Sparks(stage.scene, 300);
  const texts = new FloatText(stage.scene);
  stage.hud.innerHTML = `
    <div class="hud-panel race-top"><div class="race-pos"></div><div class="race-lap"></div><div class="race-time"></div></div>
    <div class="race-item"><span></span><small>Shift / E</small></div>
    <div class="hud-panel race-speed"><b>0</b><small>km/h</small></div>
    <canvas class="race-map"></canvas>
    <div class="race-count hidden"></div>
    <div class="hud-panel race-actions"></div>
    <p class="hud-panel arena-help"><kbd>W</kbd> gas · <kbd>S</kbd> brake · <kbd>A</kbd>/<kbd>D</kbd> steer · hold <kbd>Space</kbd> to drift (let go for a mini-turbo) · <kbd>Shift</kbd>/<kbd>E</kbd> use your item · hit the ⚡ pads and ❓ boxes!</p>`;
  const $h = (s) => stage.hud.querySelector(s);
  const posEl = $h('.race-pos'), lapEl = $h('.race-lap'), timeEl = $h('.race-time'), speedEl = $h('.race-speed b'), countEl = $h('.race-count');
  const actions = $h('.race-actions'), itemEl = $h('.race-item'), mapCanvas = $h('.race-map');
  const mapCtx = mapCanvas.getContext('2d');

  const karts = new Map();   // key -> { kart, p, x, z, h, v, tx, tz, th, prog, flags }
  const hazards = new Map(); // id -> { kind, x, z, mesh, t, owner, vx, vz, target }
  let lastState = null, stateAt = performance.now(), lastLit = 0, finished = false, raceStart = 0, bestLap = null, lapStart = 0;
  const cam = { pos: new THREE.Vector3(0, 30, 160), look: new THREE.Vector3() };
  // my kart
  const me = { x: 0, z: 0, h: 0, v: 0, lap: -1, i: 0, half: true, drift: 0, driftDir: 0, driftT: 0, boost: 0, spin: 0, slide: 0,
    shield: 0, star: 0, zap: 0, item: null, rolling: 0, sent: 0, lastBox: 0 };
  let placeNow = 1;

  const racers = () => Object.keys(S.race?.racers ?? {});
  const laps = () => S.race?.laps ?? 3;
  const inRace = () => S.race && S.me in S.race.racers;
  const racing = () => S.race?.state === 'running' && inRace() && !finished;

  /** Starting slot: two abreast in a staggered line behind the start, in the order people joined. */
  function gridSpot(k) {
    let list = S.race?.grid ?? racers();
    if (!list.includes(k)) list = racers();
    const i = Math.max(0, list.indexOf(k));
    return track(-GRID_S0 - i * GRID_GAP, (i % 2 ? -1 : 1) * GRID_SIDE);
  }
  function placeOnGrid() {
    const p = gridSpot(S.me);
    Object.assign(me, { x: p.x, z: p.z, h: p.heading, v: 0, lap: -1, half: true, drift: 0, boost: 0, spin: 0, slide: 0, shield: 0, star: 0, zap: 0, item: null, rolling: 0, doneSent: false });
    me.i = locate(me.x, me.z).i;
    renderItem();
  }

  function kartOf(k) {
    let v = karts.get(k);
    if (v) return v;
    const kart = buildKart(colorOf(k));
    stage.scene.add(kart.g);
    const p = stage.person(k);
    p.char.pose = 'sit';
    p.smooth = false;
    p.labelLift = 0.3;
    const g = gridSpot(k);
    v = { kart, p, x: g.x, z: g.z, h: g.heading, v: 0, tx: g.x, tz: g.z, th: g.heading, prog: 0, flags: '' };
    karts.set(k, v);
    return v;
  }
  function syncKarts() {
    const list = racers();
    list.forEach(kartOf);
    for (const [k, v] of karts) {
      if (list.includes(k)) continue;
      stage.scene.remove(v.kart.g);
      stage.removePerson(k);
      karts.delete(k);
    }
  }

  function renderControls() {
    const r = S.race;
    if (!r) return;
    syncKarts();
    const joined = inRace();
    const canJoin = !joined && (r.state === 'idle' || r.state === 'waiting');
    actions.innerHTML = [
      canJoin ? '<button class="btn primary" data-a="join">Join race</button>' : '',
      joined && r.state === 'waiting' ? '<button class="btn primary" data-a="start">🏁 Start race!</button>' : '',
      joined && r.state === 'waiting' ? '<button class="btn ghost" data-a="leave">Leave grid</button>' : '',
      r.state === 'waiting' ? `<span class="muted">${racers().length} on the grid. Anyone on it can start. Practice laps until then!</span>` : '',
      !joined && !canJoin ? '<span class="muted">Race in progress. You\'re up next!</span>' : '',
    ].join('');
    actions.classList.toggle('hidden', !actions.innerHTML);
    if (r.state !== lastState) {
      const was = lastState;
      lastState = r.state;
      stateAt = performance.now();
      if (r.state === 'countdown' || (r.state === 'waiting' && was !== 'waiting')) {
        lastLit = 0;
        finished = false;
        for (const h of hazards.values()) stage.scene.remove(h.mesh);
        hazards.clear();
        placeOnGrid();
      }
      if (r.state === 'running') {
        raceStart = performance.now() - (r.since ?? 0) * 1000;
        lapStart = raceStart;
        if (was === 'countdown') sfx('go');
      }
      if (r.state === 'done' && was === 'running' && joined) {
        const won = r.order[0] === S.me && racers().length > 1;
        sfx(won ? 'win' : 'cheer');
        if (won) confetti(stage.hud, { count: 160 });
        const podium = r.order.slice(0, 3).map((k, i) => `${['🥇', '🥈', '🥉'][i]} <b style="color:${colorOf(k)}">${esc(nameOf(k))}</b> ${r.times?.[k] ? `<small>${r.times[k].toFixed(1)}s</small>` : ''}`).join(' &nbsp; ');
        stage.banner(`<div class="big">🏁 Race over!</div>${podium || 'Time! Nobody finished.'}`, 5500);
      }
    }
    if (!finished && r.order.includes(S.me)) {
      finished = true;
      sfx('finish');
      const place = r.order.indexOf(S.me);
      stage.banner(`<div class="big">${['🥇 1st!', '🥈 2nd!', '🥉 3rd!'][place] ?? `${place + 1}th`}</div>You crossed the line in ${r.times?.[S.me]?.toFixed(1) ?? '?'}s!`, 3000);
    }
  }

  // ---- items ------------------------------------------------------------------------------
  function renderItem() {
    const span = itemEl.querySelector('span');
    itemEl.classList.toggle('rolling', me.rolling > 0);
    itemEl.classList.toggle('has', !!me.item && me.rolling <= 0);
    span.textContent = me.rolling > 0 ? Object.values(ITEMS)[Math.floor(performance.now() / 80) % 8].icon : me.item ? ITEMS[me.item].icon : '';
  }
  const uid = () => `${S.me}-${Math.random().toString(36).slice(2, 8)}`;
  function useItem() {
    if (!me.item || me.rolling > 0 || !(racing() || S.race?.state === 'waiting')) return;
    const kind = me.item;
    me.item = null;
    renderItem();
    const fx = Math.sin(me.h), fz = Math.cos(me.h);
    if (kind === 'turbo') { me.boost = 1.6; sfx('boost'); return; }
    if (kind === 'shield') { me.shield = 8; sfx('shield'); return; }
    if (kind === 'star') { me.star = 6; sfx('powerup'); return; }
    const msg = { kind, id: uid(), h: me.h };
    if (kind === 'banana' || kind === 'oil') Object.assign(msg, { x: me.x - fx * 3, z: me.z - fz * 3 });
    else Object.assign(msg, { x: me.x + fx * 2.5, z: me.z + fz * 2.5 });
    if (kind === 'rocket') {
      // aim at whoever is just ahead of you
      const ahead = [...karts.entries()].filter(([k, v]) => k !== S.me && v.prog > myProgress()).sort((a, b) => a[1].prog - b[1].prog)[0];
      msg.target = ahead?.[0] ?? '';
    }
    sfx(kind === 'zap' ? 'enrage' : 'shoot');
    if (S.race?.state === 'running') net.send('race_item', msg);
    else onItem({ ...msg, k: S.me }); // practice: only you see it
  }

  const hazardMesh = (kind) => {
    const g = new THREE.Group();
    if (kind === 'banana') {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.14, 8, 16, Math.PI * 1.2), toon('#ffd84d'));
      m.rotation.set(Math.PI / 2, 0, 0.3);
      m.position.y = 0.2;
      g.add(m);
    } else if (kind === 'oil') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), new THREE.MeshBasicMaterial({ color: '#1a1330', transparent: true, opacity: 0.85 }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.08;
      g.add(m);
      const shine = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ color: '#7c6bff', transparent: true, opacity: 0.5 }));
      shine.rotation.x = -Math.PI / 2;
      shine.position.set(0.6, 0.09, 0.4);
      g.add(shine);
    } else if (kind === 'shell') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), toon('#37c871'));
      m.position.y = 0.6;
      m.add(new THREE.Mesh(m.geometry, OUT));
      g.add(m);
    } else if (kind === 'rocket') {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 10), toon('#e0463c'));
      m.rotation.x = Math.PI / 2;
      m.position.y = 1;
      g.add(m);
      const f = new THREE.Sprite(additive(glowTexture, 0xff8a2a, 0.9));
      f.scale.setScalar(1.2);
      f.position.set(0, 1, -0.9);
      g.add(f);
    }
    return g;
  };

  function onItem(m) {
    if (m.kind === 'zap') {
      if (m.k !== S.me) {
        if (me.shield > 0 || me.star > 0) { me.shield = 0; sfx('shield'); }
        else { me.zap = 3.2; me.v *= 0.5; sfx('hurt'); stage.shake(0.4); }
        stage.banner(`⚡ ${esc(nameOf(m.k))} zapped everyone!`, 1400);
      }
      return;
    }
    const mesh = hazardMesh(m.kind);
    mesh.position.set(m.x, 0, m.z);
    stage.scene.add(mesh);
    const fast = m.kind === 'shell' ? 55 : m.kind === 'rocket' ? 48 : 0;
    hazards.set(m.id, { ...m, mesh, t: 0, vx: Math.sin(m.h) * fast, vz: Math.cos(m.h) * fast });
  }
  function removeHazard(id, pop = true) {
    const h = hazards.get(id);
    if (!h) return;
    stage.scene.remove(h.mesh);
    hazards.delete(id);
    if (pop) sparks.burst(h.x, 0.8, h.z, h.kind === 'banana' ? '#ffd84d' : h.kind === 'oil' ? '#7c6bff' : '#ffffff', { n: 14, speed: 6 });
  }
  function getHit(kind, by) {
    if (me.star > 0) return;
    if (me.shield > 0) { me.shield = 0; sfx('shield'); texts.add('🫧 Blocked!', me.x, 3, me.z, '#9fe8ff', 0.9); return; }
    if (kind === 'oil') { me.slide = 1.3; sfx('splash'); }
    else { me.spin = 1.1; me.v *= 0.3; sfx('bonk', { power: 1 }); stage.shake(0.6); }
    texts.add(kind === 'oil' ? 'SLIPPY!' : 'OUCH!', me.x, 3, me.z, '#ff5d73', 1);
    if (by && by !== S.me) stage.banner(`💥 ${esc(nameOf(by))} got you with a ${ITEMS[kind]?.name ?? kind}!`, 1500);
  }

  // ---- input -----------------------------------------------------------------------------
  stage.onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (down && !e.repeat && (k === 'shift' || k === 'e')) useItem();
    if (!down && k === ' ' && me.drift) {
      // let go of a drift: the longer you held it, the bigger the boost
      if (me.driftT > 1.4) { me.boost = Math.max(me.boost, 1.1); sfx('boost'); texts.add('SUPER TURBO!', me.x, 3, me.z, '#ff9f43', 0.9); }
      else if (me.driftT > 0.7) { me.boost = Math.max(me.boost, 0.6); sfx('boost'); }
      me.drift = 0;
    }
  };
  actions.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a) net.send(`race_${a}`);
  };
  const off = listen({
    race: renderControls,
    race_kp: (m) => {
      const v = kartOf(m.k);
      Object.assign(v, { tx: m.x, tz: m.z, th: m.h, v: m.v, prog: m.p, flags: m.f });
    },
    race_item: onItem,
    race_hit: (m) => {
      removeHazard(m.id);
      if (m.by === S.me && m.k !== S.me) { sfx('coin'); texts.add(`Hit ${nameOf(m.k)}!`, me.x, 3.5, me.z, '#6ee7a0', 0.8); }
    },
  });

  const myProgress = () => me.lap + me.i / SAMPLES;

  // ---- simulation ------------------------------------------------------------------------
  function drive(dt, now) {
    const keys = stage.keys;
    const gas = keys.has('w') || keys.has('arrowup'), brake = keys.has('s') || keys.has('arrowdown');
    const steer = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const loc = locate(me.x, me.z, me.i);
    const onGrass = loc.dist > TW / 2 + 0.6;
    me.boost = Math.max(0, me.boost - dt);
    me.spin = Math.max(0, me.spin - dt);
    me.slide = Math.max(0, me.slide - dt);
    me.shield = Math.max(0, me.shield - dt);
    me.star = Math.max(0, me.star - dt);
    me.zap = Math.max(0, me.zap - dt);
    const control = me.spin <= 0;
    let max = me.star > 0 ? 36 : me.boost > 0 ? BOOST_MAX : MAX;
    if (me.zap > 0) max *= 0.6;
    if (onGrass && me.star <= 0 && me.boost <= 0) max = GRASS_MAX;
    // pull away gently and build up speed: strongest off the line, easing off towards top speed
    if (control && gas) me.v += (me.v < 0 ? BRAKE : ACCEL * (1.15 - 0.85 * Math.min(1, Math.max(0, me.v) / MAX))) * dt;
    else if (control && brake) me.v -= (me.v > 0 ? BRAKE : ACCEL * 0.6) * dt;
    else me.v *= Math.exp(-0.9 * dt);
    if (me.boost > 0 || me.star > 0) me.v = Math.max(me.v, Math.min(max, me.v + 60 * dt));
    if (me.v > max) me.v += (max - me.v) * Math.min(1, dt * (onGrass ? 3 : 2));
    me.v = Math.max(-9, me.v);
    // drifting: hold Space while turning at speed
    if (control && keys.has(' ') && steer && me.v > 14 && !me.drift) { me.drift = 1; me.driftDir = steer; me.driftT = 0; sfx('whoosh'); }
    if (me.drift && (!keys.has(' ') || me.v < 8)) me.drift = 0;
    if (me.drift) me.driftT += dt;
    const grip = Math.min(1, Math.abs(me.v) / 10) * (me.v < 0 ? -1 : 1);
    if (!control) me.h += 11 * dt;
    else if (me.slide <= 0) {
      // a drift only tightens the turn a little; steering against it straightens you out
      const turn = me.drift ? (me.driftDir * 0.22 + steer * 0.85) : steer;
      me.h -= turn * 1.85 * grip * dt;
    }
    me.x += Math.sin(me.h) * me.v * dt;
    me.z += Math.cos(me.h) * me.v * dt;
    // bump off other karts
    for (const [k, o] of karts) {
      if (k === S.me) continue;
      const dx = me.x - o.x, dz = me.z - o.z, d = Math.hypot(dx, dz) || 0.01;
      if (d > 2.2) continue;
      me.x += (dx / d) * (2.2 - d) * 0.6;
      me.z += (dz / d) * (2.2 - d) * 0.6;
      if (o.flags.includes('S') && me.star <= 0) getHit('star', k);
      else if (me.v > 8) { me.v *= 0.8; sfx('bonk', { power: 0.4 }); }
    }
    // the walls: slide along them, losing speed the harder you hit
    const hit = wallHit(me.x, me.z, me.i, KART_R);
    if (hit) {
      me.x = hit.x;
      me.z = hit.z;
      const fx = Math.sin(me.h) * Math.sign(me.v || 1), fz = Math.cos(me.h) * Math.sign(me.v || 1);
      const into = fx * hit.nx + fz * hit.nz;
      if (into > 0) {
        if (Math.abs(me.v) > 10 && into > 0.35 && now - (me.lastWall ?? 0) > 400) { sfx('bonk', { power: 0.35 }); sparks.puff(me.x + hit.nx, 0.6, me.z + hit.nz, '#ffd27a', 1.2, 0.4); me.lastWall = now; }
        me.v *= 1 - into * 0.55;
        // turn the nose back along the wall
        const fwd = hit.t.dx * fx + hit.t.dz * fz >= 0 ? 1 : -1;
        const want = Math.atan2(hit.t.dx * fwd - hit.nx * 0.25, hit.t.dz * fwd - hit.nz * 0.25) + (me.v < 0 ? Math.PI : 0);
        const diff = Math.atan2(Math.sin(want - me.h), Math.cos(want - me.h));
        me.h += diff * Math.min(1, 0.35 + into * 0.5);
        me.drift = 0;
      }
    }
    // lap counting: cross the line going forward, having been round the far side first
    const prevI = me.i;
    me.i = locate(me.x, me.z, me.i).i;
    if (me.i > SAMPLES * 0.4 && me.i < SAMPLES * 0.6) me.half = true;
    if (prevI > SAMPLES * 0.85 && me.i < SAMPLES * 0.15) {
      if (me.half) {
        me.lap += 1;
        me.half = false;
        if (me.lap >= 1 && racing()) {
          const t = (now - lapStart) / 1000;
          lapStart = now;
          if (!bestLap || t < bestLap) bestLap = t;
          if (me.lap < laps()) { sfx('notify'); stage.banner(`<div class="big">${me.lap === laps() - 1 ? '🏁 Final lap!' : `Lap ${me.lap + 1}/${laps()}`}</div>${t.toFixed(1)}s`, 1600); }
        }
      }
    } else if (prevI < SAMPLES * 0.15 && me.i > SAMPLES * 0.85) {
      me.lap -= 1; // backwards over the line
      me.half = true;
    }
    if (racing() && myProgress() >= laps() && !me.doneSent) {
      me.doneSent = true;
      net.send('race_pos', { x: me.x, z: me.z, h: me.h, v: me.v, p: myProgress(), f: '' });
      net.send('race_done');
    }
    // boost pads
    for (const pad of env.pads) {
      if (Math.hypot(me.x - pad.x, me.z - pad.z) < 2.6 && me.boost < 0.9) { me.boost = 1.0; sfx('boost'); sparks.burst(me.x, 0.5, me.z, '#ffd84d', { n: 16, speed: 5 }); }
    }
    // item boxes (they come back a few seconds later)
    for (const b of env.boxes) {
      if (b.back > now || Math.hypot(me.x - b.x, me.z - b.z) > 2) continue;
      b.back = now + 3500;
      sparks.burst(b.x, 1.2, b.z, '#ffffff', { n: 18, speed: 6 });
      if (!me.item && me.rolling <= 0) {
        me.rolling = 1.2;
        sfx('rattle');
        me.pending = rollItem(placeNow - 1, Math.max(1, racers().length));
      }
    }
    if (me.rolling > 0) {
      me.rolling -= dt;
      if (me.rolling <= 0) { me.item = me.pending; sfx('reveal', { rarity: 'rare' }); }
      renderItem();
    }
    // hazards on the road
    for (const [id, h] of hazards) {
      if (h.k === S.me && h.t < 0.4) continue;
      const r = h.kind === 'oil' ? 2.2 : h.kind === 'banana' ? 1.4 : 1.6;
      if (Math.hypot(me.x - h.x, me.z - h.z) > r) continue;
      getHit(h.kind, h.k);
      if (S.race?.state === 'running') net.send('race_hit', { id, by: h.k });
      removeHazard(id);
    }
    if (now - me.sent > 60) {
      me.sent = now;
      const flags = `${me.boost > 0 ? 'B' : ''}${me.shield > 0 ? 'H' : ''}${me.star > 0 ? 'S' : ''}${me.zap > 0 ? 'Z' : ''}${me.spin > 0 ? 'X' : ''}${me.drift ? 'D' : ''}`;
      net.send('race_pos', { x: me.x, z: me.z, h: me.h, v: me.v, p: myProgress(), f: flags });
    }
  }

  function updateHazards(dt) {
    for (const [id, h] of hazards) {
      h.t += dt;
      if (h.kind === 'shell' || h.kind === 'rocket') {
        if (h.kind === 'rocket' && h.target) {
          const tv = h.target === S.me ? me : karts.get(h.target);
          if (tv) {
            const want = Math.atan2(tv.x - h.x, tv.z - h.z), cur = Math.atan2(h.vx, h.vz);
            const turn = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
            const a = cur + Math.max(-3 * dt, Math.min(3 * dt, turn));
            h.vx = Math.sin(a) * 48;
            h.vz = Math.cos(a) * 48;
          }
        }
        h.x += h.vx * dt;
        h.z += h.vz * dt;
        // shells bounce off the walls; rockets that stray into them blow up
        const wh = wallHit(h.x, h.z, h.i ?? -1, 0.4);
        if (wh) {
          h.i = wh.i;
          if (h.kind === 'rocket' && !h.target) { removeHazard(id); continue; }
          h.x = wh.x;
          h.z = wh.z;
          const dot = h.vx * wh.nx + h.vz * wh.nz;
          if (dot > 0) { h.vx -= 2 * dot * wh.nx; h.vz -= 2 * dot * wh.nz; }
        } else h.i = locate(h.x, h.z, h.i ?? -1).i;
        h.mesh.position.set(h.x, 0, h.z);
        h.mesh.rotation.y = Math.atan2(h.vx, h.vz);
        if (Math.random() < 0.5) sparks.puff(h.x, 0.8, h.z, h.kind === 'rocket' ? '#ffb13b' : '#dfffe6', 0.5, 0.3);
        if (h.t > (h.kind === 'rocket' ? 6 : 4)) removeHazard(id);
      } else if (h.t > 70) removeHazard(id, false);
    }
  }

  // ---- per frame -------------------------------------------------------------------------
  stage.onFrame((dt, now) => {
    const r = S.race;
    if (!r) return;
    const t = now / 1000;
    const joined = inRace();
    const canDrive = joined && (r.state === 'running' ? !finished : r.state === 'waiting');
    if (canDrive) drive(dt, now);
    else if (joined && r.state === 'countdown') me.v = 0;
    updateHazards(dt);

    // everyone's karts (mine from my own simulation, the others smoothed from the network)
    const lerp = 1 - Math.exp(-dt * 10);
    for (const [k, v] of karts) {
      if (k === S.me && joined) {
        Object.assign(v, { x: me.x, z: me.z, h: me.h, v: me.v, prog: myProgress(),
          flags: `${me.boost > 0 ? 'B' : ''}${me.shield > 0 ? 'H' : ''}${me.star > 0 ? 'S' : ''}${me.zap > 0 ? 'Z' : ''}${me.drift ? 'D' : ''}` });
      } else {
        v.x += (v.tx - v.x) * lerp;
        v.z += (v.tz - v.z) * lerp;
        v.h += Math.atan2(Math.sin(v.th - v.h), Math.cos(v.th - v.h)) * lerp;
      }
      const kg = v.kart.g;
      const zapped = v.flags.includes('Z');
      kg.position.set(v.x, Math.abs(v.v) > 20 ? Math.abs(Math.sin(now / 40 + v.x)) * 0.05 : 0, v.z);
      kg.rotation.y = v.h + (v.flags.includes('D') ? (k === S.me ? me.driftDir : 1) * -0.08 : 0);
      kg.scale.setScalar(zapped ? 0.6 : 1);
      v.kart.wheels.forEach((w) => { w.rotation.x += dt * v.v * 1.4; });
      const boosting = v.flags.includes('B');
      v.kart.flames.forEach((f) => { f.material.opacity = boosting ? 0.8 + Math.random() * 0.2 : 0; f.scale.setScalar(boosting ? 1 + Math.random() * 0.4 : 0.8); });
      v.kart.bubble.visible = v.flags.includes('H');
      const star = v.flags.includes('S');
      if (star) v.kart.paint.color.setHSL(((now / 5) % 360) / 360, 0.9, 0.6);
      else v.kart.paint.color.set(v.kart.color);
      v.p.x = v.x - Math.sin(v.h) * 0.2;
      v.p.y = 0.45 * kg.scale.x + kg.position.y;
      v.p.z = v.z - Math.cos(v.h) * 0.2;
      v.p.heading = kg.rotation.y;
      v.p.char.root.scale.setScalar(zapped ? 0.6 : 1);
      v.p.sub.textContent = r.order.includes(k) ? ['🥇', '🥈', '🥉'][r.order.indexOf(k)] ?? '🏁' : '';
      if (v.flags.includes('D') && Math.random() < 0.6) sparks.puff(v.x - Math.sin(v.h) * 1.4, 0.2, v.z - Math.cos(v.h) * 1.4, k === S.me && me.driftT > 1.4 ? '#ff9f43' : k === S.me && me.driftT > 0.7 ? '#39c6ff' : '#ffffff', 0.5, 0.3);
      if (Math.abs(v.v) > 10 && Math.random() < dt * 8) sparks.puff(v.x - Math.sin(v.h) * 1.6, 0.5, v.z - Math.cos(v.h) * 1.6, '#dfe3ee', 0.6, 0.4);
    }

    // item boxes spin (and fade while they come back); boost pads pulse; balloons drift
    for (const b of env.boxes) {
      const out = b.back > now;
      b.m.visible = !out;
      b.m.rotation.set(t * 0.7, t, 0);
      b.m.position.y = 1.2 + Math.sin(t * 2 + b.x) * 0.2;
    }
    for (const p of env.pads) p.m.material.opacity = 0.7 + Math.sin(t * 8) * 0.3;
    env.balloons.forEach((b, i) => { b.position.y = 40 + i * 6 + Math.sin(t * 0.3 + i) * 3; b.position.x += Math.sin(t * 0.1 + i) * 0.02; });

    // countdown lights on the gantry
    const since = (now - stateAt) / 1000;
    const lit = r.state === 'countdown' ? Math.min(3, Math.floor(since) + 1) : 0;
    const go = r.state === 'running' && since < 1.2;
    env.lamps.forEach((l, i) => {
      const on = go || i < lit;
      l.m.material.color.set(go ? '#4dff7a' : on ? '#ff3b3b' : '#3a2a2a');
      l.glow.material.color.set(go ? 0x4dff7a : 0xff3b3b);
      l.glow.material.opacity = on ? 0.9 : 0;
    });
    if (r.state === 'countdown' && lit !== lastLit) { lastLit = lit; sfx('beep'); }
    countEl.classList.toggle('hidden', !(r.state === 'countdown' || go));
    countEl.textContent = go ? 'GO!' : String(Math.max(1, 4 - lit));
    countEl.classList.toggle('go', go);

    // chase camera behind your kart (or the leader when you're watching)
    const order = [...karts.entries()].sort((a, b) => b[1].prog - a[1].prog);
    placeNow = Math.max(1, order.findIndex(([k]) => k === S.me) + 1);
    const follow = joined ? { x: me.x, z: me.z, h: me.h, v: me.v } : order[0]?.[1];
    if (follow) {
      const fx = Math.sin(follow.h), fz = Math.cos(follow.h);
      const back = 7.5 + Math.min(4, Math.abs(follow.v) / 10);
      cam.pos.lerp(new THREE.Vector3(follow.x - fx * back, 3.6, follow.z - fz * back), 1 - Math.exp(-dt * 5));
      cam.look.lerp(new THREE.Vector3(follow.x + fx * 6, 1.2, follow.z + fz * 6), 1 - Math.exp(-dt * 8));
    }
    stage.camera.position.copy(cam.pos);
    stage.camera.lookAt(cam.look);
    env.cheer(t, r.state === 'running' ? 1.4 : 0.4);
    sparks.update(dt);
    texts.update(dt);

    // HUD
    const running = r.state === 'running';
    posEl.innerHTML = joined ? `<b>${placeNow}</b><small>${['st', 'nd', 'rd'][placeNow - 1] ?? 'th'}/${karts.size}</small>` : '<small>Spectating</small>';
    lapEl.textContent = joined && running ? `Lap ${Math.max(1, Math.min(laps(), me.lap + 1))}/${laps()}` : r.state === 'waiting' ? 'Practice' : '';
    timeEl.textContent = running && joined ? `${((finished ? (r.times?.[S.me] ?? 0) * 1000 : now - raceStart) / 1000).toFixed(1)}s${bestLap ? ` · best lap ${bestLap.toFixed(1)}s` : ''}` : '';
    speedEl.textContent = Math.round(Math.abs(me.v) * 4.2);
    itemEl.classList.toggle('hidden', !joined);
    drawMap(order);
  });

  // a little map of the circuit with everyone on it
  const mapPts = table.filter((_, i) => i % 20 === 0);
  const xs = mapPts.map((p) => p.x), zs = mapPts.map((p) => p.z);
  const box = { x0: Math.min(...xs) - 10, x1: Math.max(...xs) + 10, z0: Math.min(...zs) - 10, z1: Math.max(...zs) + 10 };
  function drawMap(order) {
    const w = 170, h = 140, dpr = 2;
    if (mapCanvas.width !== w * dpr) { mapCanvas.width = w * dpr; mapCanvas.height = h * dpr; }
    mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mapCtx.clearRect(0, 0, w, h);
    const k = Math.min(w / (box.x1 - box.x0), h / (box.z1 - box.z0));
    const px = (x) => (x - box.x0) * k, pz = (z) => (z - box.z0) * k;
    mapCtx.lineCap = mapCtx.lineJoin = 'round';
    for (const [lw, col] of [[7, '#0d1f4a'], [4, '#e6ecff']]) {
      mapCtx.strokeStyle = col;
      mapCtx.lineWidth = lw;
      mapCtx.beginPath();
      mapPts.forEach((p, i) => (i ? mapCtx.lineTo(px(p.x), pz(p.z)) : mapCtx.moveTo(px(p.x), pz(p.z))));
      mapCtx.closePath();
      mapCtx.stroke();
    }
    for (const [key, v] of [...order].reverse()) {
      mapCtx.fillStyle = colorOf(key);
      mapCtx.strokeStyle = key === S.me ? '#fff' : '#0d1f4a';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.arc(px(v.x), pz(v.z), key === S.me ? 5 : 4, 0, TAU); mapCtx.fill(); mapCtx.stroke();
    }
  }

  net.send('race_join');
  placeOnGrid();
  renderControls();
  return () => {
    off();
    for (const [k, v] of karts) { stage.scene?.remove(v.kart.g); stage.removePerson(k); }
    for (const h of hazards.values()) stage.scene?.remove(h.mesh);
    stage.scene?.remove(env.group);
  };
}
