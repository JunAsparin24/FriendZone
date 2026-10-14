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
import { S, toast } from '../state.js';
import { PLOT, YARD_ITEMS, buildRoofs, buildGround, buildYard, buildYardItem, defaultExt, extMaterial } from '../three/exterior.js';
import { buildShell, nightWindows } from './house.js';
import { sfx } from '../sfx.js';
import { lowGfx } from '../settings.js';

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

/**
 * Still things (trees, flower beds, hedges, road markings…) baked into one mesh coloured per vertex: a
 * whole street of them is then one draw call rather than hundreds, which is what keeps phones smooth.
 */
function bake(group) {
  group.updateMatrixWorld(true);
  const parts = [], c = new THREE.Color();
  let n = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    parts.push({ g, color: c.copy(o.material.color).toArray() });
    n += g.attributes.position.count;
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let at = 0;
  for (const { g, color } of parts) {
    const k = g.attributes.position.count;
    pos.set(g.attributes.position.array, at * 3);
    nor.set(g.attributes.normal.array, at * 3);
    for (let i = 0; i < k; i++) col.set(color, (at + i) * 3);
    at += k;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(out, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon('#ffffff').gradientMap }));
  m.castShadow = m.receiveShadow = true;
  return m;
}
/** A little animal for the street, facing +z and standing on y = 0 (the caller bakes it into one mesh). */
function critterModel(kind, i) {
  const g = new THREE.Group();
  const add = (geo, color, x, y, z, sc = [1, 1, 1], rx = 0) => { const m = new THREE.Mesh(geo, toon(color)); m.position.set(x, y, z); m.scale.set(...sc); m.rotation.x = rx; g.add(m); };
  const ball = (r) => new THREE.SphereGeometry(r, 10, 8), eye = '#1d1b2e';
  if (kind === 'rabbit') {
    const fur = ['#f4f1ea', '#b98b5e', '#8e8f96', '#e6c9a2'][i % 4];
    add(ball(0.3), fur, 0, 0.3, 0, [0.85, 0.85, 1.2]);
    add(ball(0.2), fur, 0, 0.56, 0.3);
    for (const sd of [-1, 1]) { add(new THREE.CapsuleGeometry(0.05, 0.3, 3, 6), fur, sd * 0.08, 0.9, 0.26, [1, 1, 0.6], -0.15); add(ball(0.035), eye, sd * 0.11, 0.6, 0.46); }
    add(ball(0.04), '#ff9fb4', 0, 0.54, 0.49);
    add(ball(0.11), '#ffffff', 0, 0.34, -0.36); // a cotton tail
  } else if (kind === 'squirrel') {
    const fur = i % 2 ? '#b5651d' : '#8a8f98';
    add(ball(0.2), fur, 0, 0.24, 0, [0.85, 1, 1.15]);
    add(ball(0.15), fur, 0, 0.46, 0.2);
    for (const sd of [-1, 1]) { add(new THREE.ConeGeometry(0.05, 0.12, 5), fur, sd * 0.08, 0.62, 0.17); add(ball(0.028), eye, sd * 0.085, 0.49, 0.32); }
    add(ball(0.2), fur, 0, 0.5, -0.3, [0.7, 1.5, 0.75], -0.35); // the big tail, curled up behind
    add(ball(0.1), '#f4ecd8', 0, 0.2, 0.14, [0.9, 1, 0.6]);
  } else if (kind === 'cat') {
    const fur = ['#f08a3c', '#2b2b33', '#d8d4cc', '#8a6a4c'][i % 4];
    add(ball(0.26), fur, 0, 0.36, 0, [0.8, 0.85, 1.5]);
    add(ball(0.2), fur, 0, 0.62, 0.38);
    for (const sd of [-1, 1]) {
      add(new THREE.ConeGeometry(0.07, 0.14, 4), fur, sd * 0.11, 0.82, 0.36);
      add(ball(0.03), '#b6ff6a', sd * 0.08, 0.65, 0.555);
      for (const fz of [-0.24, 0.24]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), fur, sd * 0.12, 0.15, fz);
    }
    add(new THREE.CapsuleGeometry(0.04, 0.42, 3, 6), fur, 0, 0.6, -0.42, [1, 1, 1], -0.5); // tail in the air
    add(ball(0.03), '#ff9fb4', 0, 0.6, 0.575);
  } else {
    // a songbird: robin red, bluebird, goldfinch, sparrow…
    const col = ['#e0463c', '#3b82f6', '#ffd84d', '#8a5a2b', '#39c6ff'][i % 5], wing = `#${new THREE.Color(col).multiplyScalar(0.72).getHexString()}`;
    add(ball(0.17), col, 0, 0.2, 0, [0.9, 0.95, 1.2]);
    add(ball(0.12), col, 0, 0.38, 0.12);
    add(new THREE.ConeGeometry(0.04, 0.12, 5), '#ffb02e', 0, 0.37, 0.27, [1, 1, 1], Math.PI / 2);
    for (const sd of [-1, 1]) { add(ball(0.022), eye, sd * 0.07, 0.41, 0.2); add(ball(0.12), wing, sd * 0.13, 0.22, -0.02, [0.35, 0.8, 1.1]); }
    add(new THREE.BoxGeometry(0.12, 0.03, 0.22), wing, 0, 0.2, -0.26, [1, 1, 1], 0.4);
    add(ball(0.1), '#fff3e0', 0, 0.15, 0.08, [0.8, 0.8, 0.9]);
  }
  return g;
}
let signTex = null;
/** The street's name, white on green like a real street sign. */
function streetSign() {
  return (signTex ??= canvasTexture(512, 128, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#1f7a45'; c.fillRect(6, 6, 500, 116);
    c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.strokeRect(16, 16, 480, 96);
    c.fillStyle = '#ffffff'; c.font = '800 64px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('MAPLE LANE', 256, 68);
  }));
}
let mailTex = null;
/** A little love letter, for the mailbox when your house has new likes. */
function letterTex() {
  return (mailTex ??= canvasTexture(128, 128, (c) => {
    c.clearRect(0, 0, 128, 128);
    c.font = '96px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('💌', 64, 72);
  }));
}
let saleTex = null;
/** A plot nobody's moved onto yet. */
function saleSign() {
  return (saleTex ??= canvasTexture(256, 160, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 160);
    c.strokeStyle = '#d6342c'; c.lineWidth = 10; c.strokeRect(8, 8, 240, 144);
    c.fillStyle = '#d6342c'; c.font = '800 46px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('PLOT', 128, 58); c.font = '700 30px system-ui, sans-serif'; c.fillText('available', 128, 108);
  }));
}

export function createHood() {
  const group = new THREE.Group();
  const plots = new Map(); // plot number -> { i, key, frame, group, house (what's built on it), roofs, active }
  const houses = {};       // member key -> their house data (from the server, or as it's being built here)
  let count = 0, street = null, clouds = [], lamps = [], solids = [], butterflies = [], critters = [], fireflies = [], roam = null, dayLevel = 1, myMail = null; // (solids: the street's trees, bushes, posts… { x, z, r })
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
    nightWindows.opacity = night * 0.85; // (everyone's lights come on)
    dayLevel = day;
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
    const decor = new THREE.Group(); // (everything that stands still: baked into one mesh at the end, see bake)
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
    const trunk = toon('#5a3a26'), greens = [toon('#4f9a45'), toon('#5fae55'), toon('#3f8a4a'), toon('#7ab648')];
    /** A tree the Bloxburg way: a tall thin trunk under one big chunky crown. */
    const tree = (x, z, s) => {
      const t = new THREE.Group();
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 4.6, 6), trunk); tr.position.y = 2.3; tr.castShadow = true;
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.7, 0), greens[Math.floor(rnd() * greens.length)]);
      crown.position.y = 5.6; crown.scale.set(1, 0.82 + rnd() * 0.2, 1); crown.rotation.set(rnd() * 3, rnd() * 3, 0); crown.castShadow = true;
      t.add(tr, crown);
      t.position.set(x, 0, z); t.scale.setScalar(s);
      decor.add(t);
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
    solids = [];
    for (let c = 0; c <= cols; c++) solids.push({ x: (c - cols / 2) * PW, z: (c % 2 ? 1 : -1) * (ROAD / 2 + VERGE / 2), r: 0.3 }); // (the lamp posts)
    for (let c = 0; c < cols; c++) for (const s of [-1, 1]) {
      const x = (c - cols / 2 + 0.5) * PW + (s > 0 ? 9 : -9), z = s * (ROAD / 2 + VERGE / 2);
      tree(x, z, 0.9 + rnd() * 0.25);
      solids.push({ x, z, r: 0.5 });
    }
    // ---- making the street a nicer place: markings on the road, flower beds and bushes along the grass,
    // a hedge behind the back gardens, planted islands in the turning circles, and the street's name.
    // All of it stands still (no lights, nothing moving), so it's baked into one mesh: on a phone, hundreds
    // of little flowers would otherwise each cost a draw call.
    const yardAt = (id, x, z, s = T, ry = 0, y = 0) => { const m = buildYardItem(id); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = ry; decor.add(m); return m; };
    const shape = (geo, x, y, z, color) => { const m = new THREE.Mesh(geo, toon(color)); m.position.set(x, y, z); decor.add(m); return m; };
    const box = (w, h, d, x, y, z, color) => shape(new THREE.BoxGeometry(w, h, d), x, y, z, color);
    const paint = (w, d, x, z, color) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), toon(color)); m.rotation.x = -Math.PI / 2; m.position.set(x, -0.016, z); decor.add(m); };
    const ends = len / 2, beds = [];
    // (where the street's name signs stand, so no bush or hydrant is planted on top of them)
    const signAt = [-1, 1].map((e) => [e * (ends - 22), -(ROAD / 2 + VERGE / 2) * e]);
    const nearSign = (x, z) => signAt.some(([ax, az]) => Math.hypot(x - ax, z - az) < 3.4);
    // the road: a dashed line down the middle, white lines along the edges, a zebra crossing near each end
    for (let x = -ends + 18; x < ends - 18; x += 6) paint(3, 0.28, x, 0, '#f2c94c');
    for (const s of [-1, 1]) paint(len - 30, 0.2, 0, s * (ROAD / 2 - 0.7), '#eef0f2');
    for (const e of [-1, 1]) for (let k = -4; k <= 4; k++) paint(2.4, 0.72, e * (ends - 17), k * 1.3, '#f4f4f4');
    for (const s of [-1, 1]) {
      // a low stone edging where the pavement meets the gardens, and a tall clipped hedge behind them all
      box(len, 0.1, 0.22, 0, 0.03, s * (EDGE - 0.11), '#b8b3a8');
      box(len + 40, 1.6, 1.2, 0, 0.8, s * (EDGE + PD + 1), '#3f8a4a');
      box(len + 40, 0.12, 1.1, 0, 1.64, s * (EDGE + PD + 1), '#57b35a');
    }
    // along the grass strips, between the trees and the lamps: flower beds, bushes and the odd fire hydrant
    for (let c = 0; c < cols; c++) for (const s of [-1, 1]) {
      const mid = (c - cols / 2 + 0.5) * PW, z = s * (ROAD / 2 + VERGE / 2), treeX = mid + (s > 0 ? 9 : -9);
      yardAt('flowers', 2 * mid - treeX, z, T * 1.35, s > 0 ? 0 : Math.PI);
      yardAt('flowers', mid, z, T * 1.35, s > 0 ? Math.PI : 0);
      beds.push([2 * mid - treeX, z], [mid, z]);
      for (const bx of [mid - 17, mid + 17]) { if (nearSign(bx, z)) continue; yardAt('bush', bx, z, T * 1.4, rnd() * 6); solids.push({ x: bx, z, r: 0.8 }); }
      if ((c + (s > 0 ? 1 : 0)) % 2 === 0 && !nearSign(mid + (s > 0 ? -21 : 21), z)) {
        const hx = mid + (s > 0 ? -21 : 21), hz = z + s * 0.6, red = '#d6342c';
        shape(new THREE.CylinderGeometry(0.24, 0.28, 0.9, 10), hx, 0.45, hz, red);
        shape(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hx, 0.9, hz, red);
        box(0.84, 0.16, 0.16, hx, 0.62, hz, '#b02a24');
        solids.push({ x: hx, z: hz, r: 0.35 });
      }
    }
    // the turning circles: a raised island of grass in each, with a blossom tree in a ring of flowers
    for (const e of [-1, 1]) {
      const cx = e * ends;
      shape(new THREE.CylinderGeometry(4.7, 4.9, 0.24, 36), cx, 0.1, 0, '#9a9ca2');
      shape(new THREE.CylinderGeometry(4.4, 4.4, 0.05, 36), cx, 0.24, 0, '#5fae55');
      yardAt('tree_blossom', cx, 0, T * 2.3, rnd() * 6, 0.26);
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; yardAt('flowers', cx + Math.cos(a) * 3.3, Math.sin(a) * 3.3, T * 0.95, -a + Math.PI / 2, 0.26); }
      solids.push({ x: cx, z: 0, r: 5 });
      // the street's name on a sign at each end
      const [sx, sz] = signAt[e < 0 ? 0 : 1];
      // the post stops under the board (it used to run up through the middle of the lettering), with a
      // little cap on top; the board is a solid slab, its name on both faces
      box(0.16, 2.72, 0.16, sx, 1.36, sz, '#2a2d36');
      box(0.1, 0.96, 3.66, sx, 3.18, sz, '#f4f4f4');
      box(0.2, 0.1, 0.2, sx, 3.71, sz, '#2a2d36');
      solids.push({ x: sx, z: sz, r: 0.25 });
      // (two faces back to back, so it reads the right way round from both directions)
      for (const f of [1, -1]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: streetSign(), fog: true }));
        sign.position.set(sx + f * 0.056, 3.18, sz); sign.rotation.y = f * Math.PI / 2;
        street.add(sign);
      }
    }
    // the trees behind the back gardens and past both ends: oaks, pines and the odd blossom, not one kind
    const wood = (x, z, s) => { const k = rnd(); if (k < 0.5) tree(x, z, s); else yardAt(k < 0.85 ? 'tree_pine' : 'tree_blossom', x, z, T * s * (k < 0.85 ? 2.6 : 2.2), rnd() * 6); };
    for (let x = b.minX - 30; x <= b.maxX + 30; x += 11) for (const s of [-1, 1]) for (let row = 0; row < 2; row++) wood(x + rnd() * 7, s * (EDGE + PD + 7 + row * 12 + rnd() * 6), 1 + rnd() * 0.7);
    for (const s of [-1, 1]) for (let i = 0; i < 26; i++) { const z = (rnd() - 0.5) * 2 * (EDGE + PD + 20); if (Math.abs(z) > ROAD + 6) wood(s * (b.maxX + 16 + rnd() * 36), z, 1 + rnd() * 0.7); }
    street.add(bake(decor));
    // butterflies over the flower beds (by day): a pair of little wings each, fluttering round a bed
    butterflies = [];
    const wingCols = ['#ff8fc7', '#ffd84d', '#7fc8ff', '#ffffff', '#b77bff', '#ff9f43'];
    beds.filter((_, i) => i % (lowGfx() ? 4 : 2) === 0).slice(0, 18).forEach(([bx, bz], i) => {
      const b = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: wingCols[i % wingCols.length], side: THREE.DoubleSide });
      const wings = [-1, 1].map((sd) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.36).translate(sd * 0.22, 0, 0), mat); w.rotation.x = -Math.PI / 2; b.add(w); return w; });
      b.userData = { bx, bz, ph: rnd() * 10, wings };
      street.add(b);
      butterflies.push(b);
    });
    // ---- animals on the ground: rabbits and squirrels on the grass, songbirds pecking about the pavement,
    // a cat or two out for a stroll. They potter up and down between the road and the gardens and scatter
    // if you walk up to them. Each one is baked into a single mesh, so a street of them stays cheap.
    roam = { lo: ROAD / 2 + 0.6, hi: EDGE - 0.4, span: ends - 20 };
    critters = [];
    const kinds = ['rabbit', 'bird', 'squirrel', 'bird', 'cat', 'rabbit', 'bird', 'squirrel', 'bird', 'rabbit', 'cat', 'bird', 'squirrel', 'rabbit', 'bird', 'bird'];
    const herd = lowGfx() ? 4 : 7; // (just a few: the odd rabbit or bird to come across, not a zoo)
    for (let i = 0; i < herd; i++) {
      const kind = kinds[i % kinds.length], m = bake(critterModel(kind, Math.floor(i / 2))), side = i % 2 ? 1 : -1;
      m.scale.setScalar(kind === 'bird' ? 1.5 : 1.35); // (a little larger than life, so you can spot them from across the road)
      const x = (rnd() * 2 - 1) * roam.span, z = side * (roam.lo + rnd() * (roam.hi - roam.lo));
      m.userData = { kind, side, x, z, tx: x, tz: z, wait: rnd() * 3, ph: rnd() * 10, yaw: rnd() * 6, scare: 0, fly: 0, flyLen: 1 };
      m.position.set(x, 0, z);
      street.add(m);
      critters.push(m);
    }
    // and fireflies drifting over the flower beds once it's dark
    fireflies = [];
    const flyMat = new THREE.SpriteMaterial({ map: glowTexture, color: '#e6ff7a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    beds.filter((_, i) => i % (lowGfx() ? 3 : 1) === 0).slice(0, 24).forEach(([bx, bz]) => {
      const f = new THREE.Sprite(flyMat);
      f.userData = { bx, bz, ph: rnd() * 20 };
      f.visible = false;
      street.add(f);
      fireflies.push(f);
    });
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
  function buildPlot(i, key, keep = null) {
    const p = S.players[key], f = frameOf(i);
    const g = new THREE.Group();
    g.position.set(f.cx, 0, f.cz);
    g.rotation.y = f.flip < 0 ? Math.PI : 0;
    g.scale.setScalar(T);
    const lawnMat = new THREE.MeshToonMaterial({ color: '#66b65b', map: grass(true) }); // (mown in stripes)
    lawnMat.map = lawnMat.map.clone(); lawnMat.map.repeat.set(PLOT.w / 4, PLOT.d / 4); lawnMat.map.needsUpdate = true;
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(PLOT.w - 0.06, PLOT.d - 0.06), lawnMat);
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(PLOT.w / 2, -0.008, PLOT.d / 2); lawn.receiveShadow = true;
    g.add(lawn);
    if (p) {
      const mine = key === S.me, mx = PLOT.w / 2 + 2, mz = PLOT.d - 0.55, steel = toon('#8d9199'), dark = toon('#2a2d36');
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.09), dark); post.position.set(mx, 0.475, mz);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.52), steel); box.position.set(mx, 1.06, mz);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.52, 10, 1, false, 0, Math.PI), steel); lid.rotation.set(Math.PI / 2, 0, Math.PI / 2); lid.position.set(mx, 1.19, mz);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.1).translate(0, 0.09, 0), toon('#e0463c')); flag.position.set(mx + 0.19, 1.12, mz + 0.12);
      flag.rotation.x = Math.PI / 2; // (down: no post)
      for (const m of [post, box, lid, flag]) { m.castShadow = true; g.add(m); }
      if (mine) {
        // your own mailbox: the flag goes up and a little letter bobs over it when someone has liked your
        // house since you last came by (walk up to it to read them)
        const letter = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTex(), transparent: true, depthWrite: false }));
        letter.position.set(mx, 1.85, mz);
        letter.scale.setScalar(0.7);
        letter.visible = false;
        g.add(letter);
        myMail = { flag, letter, at: toHood(f, mx, mz), y: 1.85, checkAt: 0 };
      }
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTag(p.name, mine), transparent: true, depthWrite: false }));
      tag.position.set(mx, 2.0, mz);
      tag.scale.set(2.6, 0.65, 1);
      g.add(tag);
    } else {
      // nobody lives here yet: a sign at the front, so it reads as a plot waiting for someone, not a gap
      const sx = PLOT.w / 2 + 3, sz = PLOT.d - 1.2, wood = toon('#8a5a32');
      for (const x of [-0.7, 0.7]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), wood); post.position.set(sx + x, 0.75, sz); post.castShadow = true; g.add(post); }
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.06), new THREE.MeshToonMaterial({ map: saleSign() }));
      board.position.set(sx, 1.15, sz + 0.06);
      g.add(board);
    }
    const plot = { i, key: p ? key : null, frame: f, group: g, built: null, roofs: null, yard: [], active: false, roofsOn: true, ...(p && keep) };
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
    // (the house you're at stays the active one through all this: otherwise its plot would draw the walls
    // from its own copy of the house over the ones house.js has built)
    const was = new Map([...plots.values()].filter((pl) => pl.key).map((pl) => [pl.key, pl]));
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
      const old = key && was.get(key);
      const fresh = buildPlot(i, key, old ? { active: old.active, roofsOn: old.roofsOn } : null);
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
    for (const s of solids) if (Math.abs(hx - s.x) < s.r + r && Math.hypot(hx - s.x, hz - s.z) < s.r + r) return true; // (the street's own trees and posts)
    const pl = plots.get(plotAt(hx, hz));
    if (!pl) return false;
    const p = toPlot(pl.frame, hx, hz), R = r / T;
    for (const y of pl.yard) { const rr = YARD_ITEMS[y.id]?.r; if (rr && Math.hypot(p.x - y.x, p.z - y.y) < rr + R) return true; }
    return false;
  }

  // ---- a bit of life: birds wheeling over the street by day ----
  const birds = [], birdMat = toon('#2a2d36');
  for (let i = 0; i < (lowGfx() ? 4 : 7); i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), birdMat);
    body.scale.set(0.9, 0.7, 1.9);
    b.add(body);
    const wings = [-1, 1].map((sd) => { const w = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.34).translate(sd * 0.5, 0, 0), birdMat); b.add(w); return w; });
    b.userData = { r: 22 + i * 6, h: 10 + (i % 3) * 3, sp: (0.1 + (i % 4) * 0.03) * (i % 2 ? 1 : -1), ph: i * 1.7, cx: (i - 3) * 14, wings };
    group.add(b);
    birds.push(b);
  }

  /** Per frame: the clouds drift, birds wheel, butterflies flutter, and your mailbox keeps an eye out for
   *  likes. me: where you are (hood units), for walking up to your mailbox. */
  function update(dt, me = null) {
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 300) c.position.x = -300; }
    const t = performance.now() / 1000, awake = dayLevel > 0.3; // (birds and butterflies turn in after dark)
    for (const b of birds) {
      b.visible = awake;
      if (!awake) continue;
      const u = b.userData, a = t * u.sp + u.ph;
      b.position.set(u.cx + Math.cos(a) * u.r, u.h + Math.sin(t * 0.6 + u.ph) * 1.5, Math.sin(a) * u.r * 0.55);
      b.rotation.y = Math.atan2(-Math.sin(a) * u.sp, Math.cos(a) * 0.55 * u.sp);
      const flap = Math.sin(t * 9 + u.ph) * 0.55;
      u.wings[0].rotation.z = -flap; u.wings[1].rotation.z = flap;
    }
    for (const b of butterflies) {
      b.visible = awake;
      if (!awake) continue;
      const u = b.userData, x = u.bx + Math.sin(t * 0.8 + u.ph) * 2.2, z = u.bz + Math.cos(t * 1.1 + u.ph * 2) * 0.9;
      b.rotation.y = Math.atan2(x - b.position.x, z - b.position.z);
      b.position.set(x, 1.1 + Math.sin(t * 2.1 + u.ph) * 0.45, z);
      const flap = 0.25 + Math.abs(Math.sin(t * 16 + u.ph)) * 1.1;
      u.wings[0].rotation.z = flap; u.wings[1].rotation.z = -flap;
    }
    // the animals: stop and look about, then hop (or stroll) to somewhere new; anyone walking up sends
    // them running, and the birds take off and land further down the street
    for (const c of critters) {
      const u = c.userData, bird = u.kind === 'bird', cat = u.kind === 'cat';
      c.visible = awake || !bird; // (the birds roost at night; the rest are still out)
      if (!c.visible || !roam) continue;
      const pick = (reach, awayX = 0) => {
        u.tx = Math.max(-roam.span, Math.min(roam.span, u.x + (awayX || (Math.random() < 0.5 ? -1 : 1)) * (reach * 0.4 + Math.random() * reach)));
        u.tz = u.side * (roam.lo + Math.random() * (roam.hi - roam.lo));
      };
      u.scare -= dt;
      if (me && u.scare <= 0 && u.fly <= 0) {
        const dx = u.x - me.x, dz = u.z - me.z;
        if (Math.hypot(dx, dz) < (bird ? 5 : cat ? 2.2 : 3.6)) {
          pick(bird ? 16 : 9, dx >= 0 ? 1 : -1);
          u.wait = 0; u.scare = 1.6;
          if (bird) { u.flyLen = Math.hypot(u.tx - u.x, u.tz - u.z) / 7; u.fly = u.flyLen; }
        }
      }
      let lift = 0, tilt = 0;
      if (u.wait > 0) {
        u.wait -= dt;
        if (bird) tilt = Math.max(0, Math.sin(t * 7 + u.ph)) * 0.7 * (Math.sin(t * 0.9 + u.ph) > 0 ? 1 : 0); // pecking at the ground
        else if (!cat) tilt = -Math.max(0, Math.sin(t * 0.7 + u.ph) - 0.6) * 0.9;                           // sitting up to look round
        if (u.wait <= 0) pick(cat ? 12 : 6);
      } else {
        const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
        const sp = u.fly > 0 ? 7 : (u.scare > 0 ? 2.2 : 1) * (cat ? 1.1 : bird ? 1.3 : 2.2);
        if (d < 0.2) { u.wait = 1 + Math.random() * (cat ? 6 : 4); u.fly = 0; } else {
          const step = Math.min(d, sp * dt);
          u.x += (dx / d) * step; u.z += (dz / d) * step;
          const want = Math.atan2(dx, dz);
          u.yaw += Math.atan2(Math.sin(want - u.yaw), Math.cos(want - u.yaw)) * Math.min(1, dt * 8);
          if (u.fly > 0) { u.fly -= dt; lift = Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - u.fly / u.flyLen))) * 3.2; tilt = -0.3; }
          else lift = cat ? Math.abs(Math.sin(t * 9 + u.ph)) * 0.03 : Math.abs(Math.sin(t * (bird ? 14 : 8) + u.ph)) * (bird ? 0.14 : 0.3); // hop, hop
        }
      }
      c.position.set(u.x, lift, u.z);
      c.rotation.set(tilt, u.yaw, 0, 'YXZ');
    }
    const dark = dayLevel < 0.35;
    for (const f of fireflies) {
      f.visible = dark;
      if (!dark) continue;
      const u = f.userData;
      f.position.set(u.bx + Math.sin(t * 0.5 + u.ph) * 2.4, 0.9 + Math.sin(t * 0.8 + u.ph * 2) * 0.5, u.bz + Math.cos(t * 0.37 + u.ph) * 1.6);
      f.scale.setScalar(0.18 + Math.max(0, Math.sin(t * 2.3 + u.ph * 3)) * 0.3); // (each one blinks at its own pace)
    }
    // your mailbox
    if (myMail) {
      const likes = houses[S.me]?.likes?.length ?? 0, key = `fz.likesSeen.${S.me}`;
      let seen = 0;
      try { seen = Number(localStorage.getItem(key) ?? 0); } catch { /* no storage */ }
      if (likes < seen) { seen = likes; try { localStorage.setItem(key, String(likes)); } catch { /* no storage */ } }
      const fresh = likes - seen;
      myMail.flag.rotation.x += ((fresh > 0 ? 0 : Math.PI / 2) - myMail.flag.rotation.x) * Math.min(1, dt * 4);
      myMail.letter.visible = fresh > 0;
      if (fresh > 0) {
        myMail.letter.position.y = myMail.y + Math.sin(t * 3) * 0.1;
        if (me && Math.hypot(me.x - myMail.at.x, me.z - myMail.at.z) < 3.2) {
          try { localStorage.setItem(key, String(likes)); } catch { /* no storage */ }
          toast(`💌 ${fresh} new like${fresh > 1 ? 's' : ''} on your house! (${likes} in all)`);
          sfx('like');
        }
      }
    }
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
