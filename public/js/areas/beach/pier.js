// Coral Pier: a big LA-style pier running out to sea. A neon arch at the entrance, shops and
// restaurants down both sides, a carousel, then a wide deck with an amusement park (a Ferris wheel,
// a roller coaster, a drop tower and the Playland arcade), and a fishing platform at the far end.
// A floating dock alongside it is where the boats and jet skis are moored.
import * as THREE from 'three';
import { toon, shiny, basic, additive, glowTexture, TAU } from '../../three/materials.js';
import { letterSign } from '../../three/signs3d.js';
import { add, box, cyl, sph, group, plank, stripeMat, lamp, windowMat, seeded } from './common.js';

// The pier is closed for now: Coral Cove is just the beach, the park and the boats. Nothing else was
// taken out, so setting this back to true brings the whole pier back (its decks, shops, rides, fishing
// platform and the marina dock), and everything that checks pierHeight / onPierFootprint makes room again.
export const PIER_OPEN = false;

// decks (world units): the long walk, the wide amusement deck, the fishing platform, the boat dock
export const PIER_Y = 1.3, DOCK_Y = 0.45;
// the pier is modelled at x ~ 90..210 and slid west by PIER_DX (so it sits closer to everything else)
export const PIER_DX = -45;
export const PIER_WALK = { x0: 135, x1: 165, z0: -6, z1: 212 };
export const PIER_PARK = { x0: 104, x1: 196, z0: 86, z1: 164 };
export const PIER_END = { x0: 122, x1: 178, z0: 170, z1: 212 };
export const DOCK = { x0: 90, x1: 135, z0: 68, z1: 84 }; // (then out along the park deck's west side)
export const DOCK2 = { x0: 90, x1: 104, z0: 84, z1: 150 };
const RAMP = { x0: 137, x1: 163, z0: -15, z1: -6 };
const STAIRS = { x0: 131, x1: 137, z0: 72, z1: 78 }; // steps down from the pier to the dock
const inR = (r, x, z, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

/** The height of the pier/dock surface here (null if you're not on it). */
export function pierHeight(x, z) {
  if (!PIER_OPEN) return null;
  x -= PIER_DX;
  if (inR(RAMP, x, z)) return 0.1 + (PIER_Y - 0.1) * Math.min(1, Math.max(0, (z - RAMP.z0) / (RAMP.z1 - RAMP.z0)));
  if (inR(STAIRS, x, z)) return DOCK_Y + (PIER_Y - DOCK_Y) * Math.min(1, Math.max(0, (x - STAIRS.x0) / (STAIRS.x1 - STAIRS.x0)));
  if (inR(PIER_WALK, x, z) || inR(PIER_PARK, x, z) || inR(PIER_END, x, z)) return PIER_Y;
  if (inR(DOCK, x, z) || inR(DOCK2, x, z)) return DOCK_Y;
  return null;
}
/** Is (x, z) anywhere on the pier's footprint (so nothing else goes there)? */
export const onPierFootprint = (x, z, pad = 0) => PIER_OPEN && (x -= PIER_DX, [PIER_WALK, PIER_PARK, PIER_END, DOCK, DOCK2, RAMP].some((r) => inR(r, x, z, pad)));

const SHOPS = [
  // side: -1 west row (facing east), +1 east row (facing west)
  { side: -1, z: 14, name: 'Shrimp Shack', font: 'chunky', body: '#e8f0ff', trim: '#3b82f6', awn: ['#3b82f6', '#ffffff'], sign: '#ff5d73', kind: 'food' },
  { side: -1, z: 34, name: 'Taco Surf', font: 'racing', body: '#fff0c8', trim: '#ff9f43', awn: ['#ff9f43', '#fff4d6'], sign: '#2fb87a', kind: 'food' },
  { side: -1, z: 54, name: 'Bait & Tackle', font: 'medieval', body: '#d9c29a', trim: '#6b4226', awn: ['#2f7fe0', '#ffffff'], sign: '#ffd84d', kind: 'bait' },
  { side: 1, z: 64, name: 'Pier Gifts', font: 'script', body: '#ffe0ef', trim: '#ff5fa8', awn: ['#ff5fa8', '#ffffff'], sign: '#ffffff', kind: 'gift', even: false },
  { side: 1, z: 36, name: 'Pizza Pier', font: 'chunky', body: '#fff4e0', trim: '#e0463c', awn: ['#e0463c', '#ffffff'], sign: '#ffd84d', kind: 'food' },
];

export function buildPier(root, { anim, lights, solids, spots }) {
  if (!PIER_OPEN) return; // (no decks, no shops or rides, nothing to bump into or use)
  const g = group(root, PIER_DX, 0, 0);
  const s0 = solids.length, p0 = spots.length;
  const r = seeded(31);
  const deckMat = plank(8, 60, '#e8d2b0');
  const deck = (rect, rep) => add(g, box(rect.x1 - rect.x0, 0.4, rect.z1 - rect.z0), plank(rep[0], rep[1], '#e8d2b0'), { p: [(rect.x0 + rect.x1) / 2, PIER_Y - 0.2, (rect.z0 + rect.z1) / 2], outline: true });
  deck(PIER_WALK, [8, 60]);
  deck(PIER_PARK, [24, 20]);
  deck(PIER_END, [14, 11]);
  // the dock sits low on the water, on floats
  for (const D of [DOCK, DOCK2]) {
    add(g, box(D.x1 - D.x0, 0.3, D.z1 - D.z0), plank(4, 16, '#c9a472'), { p: [(D.x0 + D.x1) / 2, DOCK_Y - 0.15, (D.z0 + D.z1) / 2], outline: true });
    for (let z = D.z0 + 3; z < D.z1; z += 6) for (const x of [D.x0 + 1, D.x1 - 1]) add(g, cyl(0.25, 0.25, 2.4, 8), toon('#6b4226'), { p: [x, -0.4, z], outline: true });
    for (let z = D.z0 + 6; z < D.z1; z += 12) add(g, cyl(0.15, 0.2, 0.5, 8), toon('#3a3f55'), { p: [D.x0 + 0.5, DOCK_Y + 0.25, z] }); // cleats
  }
  // the marina sign
  const ms = letterSign('Marina', { font: 'script', even: false, w: 6, h: 1.2, face: '#ffffff', side: '#2f7fe0', depth: 0.2 });
  ms.position.set(97, DOCK_Y + 2.6, 84.5);
  g.add(ms);
  for (const sx of [-1, 1]) add(g, cyl(0.1, 0.1, 2.6, 6), toon('#ffffff'), { p: [97 + sx * 3.2, DOCK_Y + 1.3, 84.3] });
  // entrance ramp + the steps down to the dock
  add(g, box(RAMP.x1 - RAMP.x0, 0.3, RAMP.z1 - RAMP.z0 + 0.6), deckMat, { p: [150, (PIER_Y + 0.1) / 2 - 0.15, (RAMP.z0 + RAMP.z1) / 2], r: [-Math.atan2(PIER_Y - 0.1, RAMP.z1 - RAMP.z0), 0, 0] });
  for (let k = 0; k < 4; k++) add(g, box(1.5, 0.25, STAIRS.z1 - STAIRS.z0), plank(1, 2, '#c9a472'), { p: [STAIRS.x0 + 0.75 + k * 1.5, DOCK_Y + (k + 0.5) * ((PIER_Y - DOCK_Y) / 4), (STAIRS.z0 + STAIRS.z1) / 2] });
  // pilings under everything
  const pile = cyl(0.45, 0.5, 8, 10), pileMat = toon('#5a3a22');
  const pilings = (rect, step) => { for (let z = rect.z0 + 2; z <= rect.z1; z += step) for (let x = rect.x0 + 1.5; x <= rect.x1; x += step) add(g, pile, pileMat, { p: [x, PIER_Y - 4.4, z], cast: false }); };
  pilings(PIER_WALK, 10); pilings(PIER_PARK, 14); pilings(PIER_END, 12);
  // white railings round the edges (with gaps at the ramp and the dock stairs)
  const railMat = toon('#ffffff');
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
    const rg = group(g, (x0 + x1) / 2, PIER_Y, (z0 + z1) / 2, a);
    add(rg, box(0.12, 0.12, len), railMat, { p: [0, 1.1, 0] });
    add(rg, box(0.08, 0.08, len), railMat, { p: [0, 0.55, 0] });
    for (let t = -len / 2; t <= len / 2; t += 2.5) add(rg, box(0.12, 1.1, 0.12), railMat, { p: [0, 0.55, t], cast: false });
  };
  rail(PIER_WALK.x0, PIER_WALK.z0, PIER_WALK.x0, STAIRS.z0); rail(PIER_WALK.x0, STAIRS.z1, PIER_WALK.x0, PIER_PARK.z0);
  rail(PIER_WALK.x1, PIER_WALK.z0, PIER_WALK.x1, PIER_PARK.z0);
  rail(PIER_PARK.x0, PIER_PARK.z0, PIER_WALK.x0, PIER_PARK.z0); rail(PIER_WALK.x1, PIER_PARK.z0, PIER_PARK.x1, PIER_PARK.z0);
  rail(PIER_PARK.x0, PIER_PARK.z0, PIER_PARK.x0, PIER_PARK.z1); rail(PIER_PARK.x1, PIER_PARK.z0, PIER_PARK.x1, PIER_PARK.z1);
  rail(PIER_PARK.x0, PIER_PARK.z1, PIER_END.x0, PIER_PARK.z1); rail(PIER_END.x1, PIER_PARK.z1, PIER_PARK.x1, PIER_PARK.z1);
  rail(PIER_END.x0, PIER_END.z0, PIER_END.x0, PIER_END.z1); rail(PIER_END.x1, PIER_END.z0, PIER_END.x1, PIER_END.z1);
  rail(PIER_END.x0, PIER_END.z1, PIER_END.x1, PIER_END.z1);
  rail(PIER_WALK.x0, PIER_PARK.z1, PIER_WALK.x0, PIER_END.z0); rail(PIER_WALK.x1, PIER_PARK.z1, PIER_WALK.x1, PIER_END.z0);
  // (the part of the long walk between the park deck and the end platform)

  // ---- the entrance arch: a blue neon sign over the way in
  const arch = group(g, 150, PIER_Y, -3);
  for (const sx of [-1, 1]) {
    add(arch, box(1.6, 9, 1.6), toon('#f4f0ea'), { p: [sx * 13, 4.5, 0], outline: true });
    add(arch, box(2, 0.6, 2), toon('#3b82f6'), { p: [sx * 13, 9.2, 0], outline: true });
  }
  add(arch, box(27.6, 2.8, 0.8), toon('#1a3a8a'), { p: [0, 10.6, 0], outline: true });
  const archSign = letterSign('CORAL PIER', { font: 'chunky', w: 22, h: 2, face: '#fff6d0', side: '#ff9f43', depth: 0.35, bulbs: true, glow: 0.7 });
  archSign.position.set(0, 9.6, 0.45);
  arch.add(archSign);
  const sub = letterSign('amusement park · restaurants · fishing', { font: 'chunky', w: 18, h: 0.7, face: '#8ff2ff', side: '#1a3a8a', depth: 0.1, glow: 0.8 });
  sub.position.set(0, 8.35, 0.45);
  arch.add(sub);
  // (and the same on the back, for the walk home)
  const back = letterSign('CORAL PIER', { font: 'chunky', w: 22, h: 2, face: '#fff6d0', side: '#ff9f43', depth: 0.35, bulbs: true, glow: 0.7 });
  back.position.set(0, 9.6, -0.45);
  back.rotation.y = Math.PI;
  arch.add(back);
  const backSub = letterSign('see you soon!', { font: 'chunky', w: 9, h: 0.7, face: '#8ff2ff', side: '#1a3a8a', depth: 0.1, glow: 0.8 });
  backSub.position.set(0, 8.35, -0.45);
  backSub.rotation.y = Math.PI;
  arch.add(backSub);
  const neon = add(arch, box(27, 0.12, 0.12), basic('#39e6ff'), { p: [0, 12.05, 0.45], cast: false });
  anim.push((t, dt, n) => { neon.material.color.setHSL(0.52 + Math.sin(t * 2) * 0.04, 1, 0.55 + n * 0.15); });

  // ---- shops down both sides of the long walk
  for (const s of SHOPS) {
    const w = 11, d = 14;
    const x = s.side < 0 ? PIER_WALK.x0 + w / 2 + 0.3 : PIER_WALK.x1 - w / 2 - 0.3;
    const shop = group(g, x, PIER_Y, s.z, s.side < 0 ? Math.PI / 2 : -Math.PI / 2); // front (+Z) faces the middle of the pier
    add(shop, box(d, 4.2, w), toon(s.body), { p: [0, 2.1, 0], outline: true });
    add(shop, box(d + 0.6, 0.4, w + 0.6), toon(s.trim), { p: [0, 4.4, 0], outline: true });
    add(shop, box(d, 0.3, 0.3), toon(s.trim), { p: [0, 0.15, w / 2 + 0.05] });
    // big windows that glow at night, a door, a striped awning and the name in 3D letters
    for (const sx of [-1, 1]) add(shop, box(d * 0.3, 1.8, 0.1), windowMat(lights), { p: [sx * d * 0.28, 2, w / 2 + 0.06], cast: false });
    add(shop, box(1.6, 2.6, 0.12), toon(s.trim), { p: [0, 1.3, w / 2 + 0.07] });
    add(shop, box(d + 0.4, 0.14, 2.4), stripeMat(s.awn[0], s.awn[1], 3), { p: [0, 3.35, w / 2 + 1.1], r: [0.35, 0, 0], outline: true });
    const sg = letterSign(s.name, { font: s.font, even: s.even ?? true, w: d - 2, h: 1.1, face: s.sign, side: s.trim, depth: 0.2, glow: 0.55 });
    sg.position.set(0, 4.65, w / 2 - 0.2);
    shop.add(sg);
    // tables and umbrellas out front (restaurants), a rack of rods (the bait shop)
    if (s.kind === 'food') {
      for (const sx of [-1, 1]) {
        const tb = group(shop, sx * 3.8, 0, w / 2 + 3.4);
        add(tb, cyl(0.7, 0.7, 0.08, 14), toon('#ffffff'), { p: [0, 0.9, 0], outline: true });
        add(tb, cyl(0.06, 0.06, 0.9, 6), toon('#8a8f9e'), { p: [0, 0.45, 0] });
        add(tb, cyl(0.04, 0.04, 2.6, 6), toon('#ffffff'), { p: [0, 1.3, 0] });
        add(tb, new THREE.ConeGeometry(1.6, 0.6, 8, 1, true), stripeMat(s.awn[0], s.awn[1], 2), { p: [0, 2.6, 0], outline: true });
        for (const k of [-1, 1]) add(tb, box(0.5, 0.5, 0.5), toon(s.trim), { p: [k * 1.1, 0.25, 0] });
      }
    } else if (s.kind === 'bait') {
      for (let k = 0; k < 5; k++) add(shop, cyl(0.03, 0.03, 2.4, 5), toon(['#8b5a2b', '#39c6ff', '#e0463c', '#ffc53d', '#37c871'][k]), { p: [-3 + k * 0.5, 1.4, w / 2 + 0.6], r: [0.15, 0, 0] });
      add(shop, cyl(0.45, 0.4, 0.7, 12), toon('#39c6ff'), { p: [3, 0.35, w / 2 + 1.2], outline: true });
    }
    solids.push({ x, z: s.z, w: w, d: d });
    spots.push({ kind: s.kind, name: s.name, x: x - s.side * (w / 2 + 1.8), z: s.z, y: PIER_Y });
  }

  // ---- the carousel (east side, opposite the Shrimp Shack): a round pavilion with painted horses going round
  const car = group(g, PIER_WALK.x1 - 7, PIER_Y, 12);
  add(car, cyl(6.2, 6.2, 0.4, 24), toon('#ffffff'), { p: [0, 0.2, 0], outline: true });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; add(car, cyl(0.12, 0.12, 4.6, 8), shiny('#ffc53d'), { p: [Math.cos(a) * 6, 2.5, Math.sin(a) * 6] }); }
  add(car, new THREE.ConeGeometry(7.2, 2.6, 12), stripeMat('#ff5d73', '#fff4d6', 6), { p: [0, 6.1, 0], outline: true });
  add(car, sph(0.4), shiny('#ffc53d'), { p: [0, 7.6, 0] });
  const spin = group(car, 0, 0.4, 0);
  add(spin, cyl(5.2, 5.2, 0.2, 24), toon('#ffd6e8'), { p: [0, 0.1, 0] });
  add(spin, cyl(0.6, 0.6, 4.4, 12), toon('#ff9fc7'), { p: [0, 2.2, 0], outline: true });
  const horses = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const pole = group(spin, Math.cos(a) * 3.8, 0, Math.sin(a) * 3.8, -a);
    add(pole, cyl(0.05, 0.05, 4.2, 6), shiny('#ffc53d'), { p: [0, 2.2, 0] });
    const horse = group(pole, 0, 1.4, 0);
    const hc = ['#ffffff', '#ffd6e8', '#c8e6ff', '#fff0b0'][k % 4];
    add(horse, box(0.5, 0.55, 1.3), toon(hc), { outline: true });
    add(horse, box(0.35, 0.8, 0.4), toon(hc), { p: [0, 0.45, 0.55], r: [-0.4, 0, 0], outline: true });
    for (const lx of [-0.18, 0.18]) for (const lz of [-0.45, 0.45]) add(horse, box(0.12, 0.6, 0.12), toon(hc), { p: [lx, -0.5, lz], r: [lz > 0 ? -0.5 : 0.5, 0, 0] });
    add(horse, box(0.52, 0.12, 0.5), toon(['#ff5d73', '#39c6ff', '#ffd84d', '#6ee7a0'][k % 4]), { p: [0, 0.32, -0.05] });
    horses.push(horse);
  }
  anim.push((t) => { spin.rotation.y = t * 0.5; horses.forEach((h, i) => { h.position.y = 1.4 + Math.sin(t * 2 + i) * 0.35; }); });
  solids.push({ x: car.position.x, z: 12, r: 6.4 });
  spots.push({ kind: 'carousel', name: 'the carousel', x: car.position.x - 7.4, z: 12, y: PIER_Y, center: car.position, spin });

  // ---- the amusement deck
  // Ferris wheel (with a lit rim), turning slowly
  const fw = group(g, 180, PIER_Y, 125, Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(fw, cyl(0.35, 0.45, 19, 8), toon('#ffffff'), { p: [sx * 5, 9, sz * 2.2], r: [0, 0, sx * -0.27], outline: true });
  const wheel = group(fw, 0, 18, 0);
  add(wheel, new THREE.TorusGeometry(14, 0.35, 8, 64), toon('#ffffff'), { outline: true });
  add(wheel, new THREE.TorusGeometry(13, 0.18, 6, 64), toon('#ffffff'), {});
  for (let k = 0; k < 16; k++) add(wheel, box(0.18, 28, 0.18), toon('#ffffff'), { r: [0, 0, (k / 16) * Math.PI] });
  add(wheel, cyl(1, 1, 5, 12), toon('#3a3f55'), { r: [Math.PI / 2, 0, 0], outline: true });
  // bulbs round the rim, chasing colours
  const bulbN = 64;
  const bulbs = new THREE.InstancedMesh(sph(0.22, 6, 4), basic('#ffffff'), bulbN);
  const m4 = new THREE.Matrix4();
  for (let k = 0; k < bulbN; k++) { const a = (k / bulbN) * TAU; m4.makeTranslation(Math.cos(a) * 14, Math.sin(a) * 14, 0.4); bulbs.setMatrixAt(k, m4); bulbs.setColorAt(k, new THREE.Color('#ffffff')); }
  wheel.add(bulbs);
  const gondolas = [];
  const gondCols = ['#ff5d73', '#ffd84d', '#39c6ff', '#6ee7a0', '#ff9f43', '#c59bff'];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const hang = group(wheel, Math.cos(a) * 14, Math.sin(a) * 14, 0);
    const gd = group(hang, 0, -1.3, 0);
    add(gd, cyl(1.1, 1, 0.9, 10), toon(gondCols[k % 6]), { p: [0, -0.35, 0], outline: true }); // (an open tub, so you see who's riding)
    add(gd, cyl(1.1, 1.1, 0.2, 10), toon('#ffffff'), { p: [0, 1.2, 0] });
    add(gd, cyl(0.05, 0.05, 1.2, 4), toon('#2b2f4a'), { p: [0, 0.8, 0] });
    gondolas.push(hang);
  }
  const col = new THREE.Color();
  anim.push((t, dt, n) => {
    wheel.rotation.z = t * 0.08;
    gondolas.forEach((h) => { h.rotation.z = -wheel.rotation.z; });
    const step = Math.floor(t * 6);
    for (let k = 0; k < bulbN; k++) { col.setHSL(((k + step) % 16) / 16, 0.9, 0.55 + n * 0.2); bulbs.setColorAt(k, col); }
    bulbs.instanceColor.needsUpdate = true;
  });
  solids.push({ x: 180, z: 125, w: 7, d: 13 });
  spots.push({ kind: 'ferris', name: 'the Ferris wheel', x: 172.5, z: 125, y: PIER_Y, wheel, gondolas, base: fw });

  // roller coaster: a looping track on stilts round the back of the deck, with a train running round it
  const coaster = group(g, 0, PIER_Y, 0);
  const path = new THREE.CatmullRomCurve3([
    [112, 3, 96], [126, 9, 92], [142, 14, 94], [150, 6, 104], [146, 3, 116], [132, 11, 124], [116, 5, 130], [110, 12, 142],
    [124, 16, 156], [142, 8, 158], [156, 4, 150], [160, 10, 138], [150, 13, 128], [134, 6, 138], [118, 3, 118], [108, 4, 104],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'catmullrom', 0.3);
  const railGeo = new THREE.TubeGeometry(path, 300, 0.22, 6, true);
  add(coaster, railGeo, toon('#e0463c'), { outline: true });
  for (let k = 0; k < 60; k++) {
    const pt = path.getPointAt(k / 60);
    add(coaster, cyl(0.15, 0.15, pt.y, 5), toon('#ffffff'), { p: [pt.x, pt.y / 2, pt.z], cast: false });
  }
  const train = [];
  for (let k = 0; k < 4; k++) {
    const carG = group(coaster);
    add(carG, box(1.2, 0.7, 1.8), toon(['#ffd84d', '#39c6ff', '#ff5fa8', '#6ee7a0'][k]), { p: [0, 0.4, 0], outline: true });
    train.push(carG);
  }
  const tan = new THREE.Vector3();
  anim.push((t) => {
    // (slow up the hills, fast down them)
    const u0 = ((t * 0.045) + Math.sin(t * 0.3) * 0.01) % 1;
    train.forEach((c, k) => {
      const u = (u0 - k * 0.012 + 1) % 1;
      const p = path.getPointAt(u);
      path.getTangentAt(u, tan);
      c.position.set(p.x, p.y + 0.2, p.z);
      c.lookAt(p.x + tan.x, p.y + 0.2 + tan.y, p.z + tan.z);
    });
  });
  // the station: a little platform where the train starts
  add(g, box(4, 0.5, 6), toon('#e0463c'), { p: [116, PIER_Y + 0.25, 101], outline: true });
  const st = letterSign('COASTER', { font: 'chunky', w: 3.6, h: 0.6, face: '#ffffff', side: '#e0463c', depth: 0.12 });
  st.position.set(116, PIER_Y + 3.4, 104.2);
  g.add(st);
  for (const sx of [-1.7, 1.7]) add(g, cyl(0.08, 0.08, 3, 6), toon('#ffffff'), { p: [116 + sx, PIER_Y + 1.5, 104] });
  spots.push({ kind: 'coaster', name: 'the roller coaster', x: 116, z: 106.5, y: PIER_Y, path });

  // drop tower: the ring climbs slowly, hangs, then drops
  const tower = group(g, 185, PIER_Y, 96);
  add(tower, cyl(0.8, 1, 26, 12), toon('#3b82f6'), { p: [0, 13, 0], outline: true });
  add(tower, cyl(1.4, 1.4, 1, 12), toon('#ffffff'), { p: [0, 26.5, 0], outline: true });
  const beacon = add(tower, sph(0.5), basic('#ff4040'), { p: [0, 27.4, 0], cast: false });
  const ring = group(tower, 0, 2, 0);
  add(ring, new THREE.TorusGeometry(2, 0.5, 8, 20), toon('#ffd84d'), { r: [Math.PI / 2, 0, 0], outline: true });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; add(ring, box(0.5, 0.9, 0.5), toon('#ff5d73'), { p: [Math.cos(a) * 2.2, -0.6, Math.sin(a) * 2.2] }); }
  anim.push((t) => {
    const c = t % 14;
    ring.position.y = c < 8 ? 2 + (c / 8) * 21 : c < 10 ? 23 : c < 10.8 ? 23 - ((c - 10) / 0.8) ** 2 * 21 : 2;
    beacon.visible = t % 1 < 0.5;
  });
  solids.push({ x: 185, z: 96, r: 3 });
  spots.push({ kind: 'drop', name: 'the drop tower', x: 185, z: 101.5, y: PIER_Y, ring, tower });

  // ---- the fishing platform at the end: benches, a bait bucket at each spot, coin-op binoculars
  const fishing = [];
  for (let k = 0; k < 8; k++) {
    const onEnd = k < 4;
    const x = onEnd ? PIER_END.x0 + 8 + k * 13 : k < 6 ? PIER_END.x0 + 1.2 : PIER_END.x1 - 1.2;
    const z = onEnd ? PIER_END.z1 - 1.3 : PIER_END.z0 + 10 + (k % 2) * 16;
    const heading = onEnd ? 0 : k < 6 ? -Math.PI / 2 : Math.PI / 2; // facing out to sea
    add(g, cyl(0.3, 0.25, 0.5, 10), toon('#e0e6ee'), { p: [x - Math.sin(heading) * 0.2 + Math.cos(heading) * 1.2, PIER_Y + 0.25, z - Math.cos(heading) * 0.2], outline: true });
    fishing.push({ x: x - Math.sin(heading) * 0.8, z: z - Math.cos(heading) * 0.8, heading });
  }
  spots.push(...fishing.map((f) => ({ kind: 'fish', name: 'fish off the pier', ...f, y: PIER_Y })));
  for (const [x, z] of [[140, 190], [160, 190]]) {
    add(g, box(3, 0.2, 1), plank(1, 1), { p: [x, PIER_Y + 0.5, z], outline: true });
    add(g, box(3, 0.6, 0.15), plank(1, 1), { p: [x, PIER_Y + 0.85, z - 0.45] });
  }
  const bino = group(g, 150, PIER_Y, PIER_END.z1 - 1.5);
  add(bino, cyl(0.12, 0.2, 1.2, 8), toon('#3b82f6'), { p: [0, 0.6, 0] });
  add(bino, box(0.8, 0.4, 0.6), toon('#3b82f6'), { p: [0, 1.4, 0], outline: true });
  for (const sx of [-0.2, 0.2]) add(bino, cyl(0.12, 0.12, 0.5, 10), toon('#23263f'), { p: [sx, 1.45, 0.4], r: [Math.PI / 2, 0, 0] });
  const endSign = letterSign('Fishing Pier', { font: 'script', even: false, w: 10, h: 1.4, face: '#ffffff', side: '#2f7fe0', depth: 0.2 });
  endSign.position.set(150, PIER_Y + 3.2, PIER_END.z0 + 0.5);
  g.add(endSign);
  for (const sx of [-1, 1]) add(g, cyl(0.15, 0.15, 3.4, 8), toon('#ffffff'), { p: [150 + sx * 5.5, PIER_Y + 1.7, PIER_END.z0 + 0.3] });

  // lamps down both rails (lanterns hanging out over the deck)
  for (let z = 8; z < 208; z += 22) {
    if (z > 84 && z < 166) continue;
    lamp(g, lights, PIER_WALK.x0 + 0.5, z, { y: PIER_Y, ry: Math.PI / 2 });
    lamp(g, lights, PIER_WALK.x1 - 0.5, z + 11, { y: PIER_Y, ry: -Math.PI / 2 });
  }
  for (const [x, z, ry] of [[106, 90, Math.PI / 2], [106, 160, Math.PI / 2], [194, 160, -Math.PI / 2], [194, 112, -Math.PI / 2]]) lamp(g, lights, x, z, { y: PIER_Y, ry });

  // gulls perched on the railing posts
  const perched = [];
  for (let k = 0; k < 6; k++) {
    const z = 20 + k * 30 + r() * 8, x = r() < 0.5 ? PIER_WALK.x0 : PIER_WALK.x1;
    const gl = group(g, x, PIER_Y + 1.25, z, r() * TAU);
    add(gl, sph(0.28, 8, 6), toon('#ffffff'), { s: [1.4, 0.9, 0.9] });
    add(gl, sph(0.16, 8, 6), toon('#ffffff'), { p: [0.32, 0.22, 0] });
    add(gl, new THREE.ConeGeometry(0.05, 0.2, 5), toon('#ffb13b'), { p: [0.5, 0.2, 0], r: [0, 0, -Math.PI / 2] });
    add(gl, box(0.4, 0.06, 0.5), toon('#9aa3b8'), { p: [-0.05, 0.1, 0] });
    perched.push(gl);
  }
  anim.push((t) => perched.forEach((gl, i) => { gl.rotation.y += Math.sin(t * 0.7 + i * 3) * 0.004; gl.children[1].rotation.z = Math.sin(t * 3 + i) * 0.2; }));

  for (let i = s0; i < solids.length; i++) solids[i].x += PIER_DX;
  for (let i = p0; i < spots.length; i++) { spots[i].x += PIER_DX; if (spots[i].center) spots[i].center = spots[i].center.clone().setX(spots[i].center.x + PIER_DX); }
  return g;
}
