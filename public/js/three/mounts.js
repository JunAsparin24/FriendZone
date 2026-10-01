// Mounts: things you ride around town on (G to hop on and off). Each is built facing +Z with the
// ground at y = 0, and says where its rider goes:
//   seat   how high the rider's hips (or feet, for boards) sit
//   stance 'straddle' (horses) · 'pedal' (bikes) · 'scoot' (kick scooters) · 'board' (skate/hover boards)
//   speed  how much faster than walking it goes
//   tick(t, dt, moving, speed)  gallops, spins its wheels, bobs…
import * as THREE from 'three';
import { TAU, toon, basic, shiny, outlineMaterial, additive, glowTexture } from './materials.js';

const OUT = outlineMaterial(0.016);
const cache = new Map();
const geo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, seg = 16) => geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const sph = (r, ws = 16, hs = 12) => geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cap = (r, l) => geo(`k${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
const cone = (r, h, seg = 12) => geo(`n${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const torus = (r, t, seg = 24) => geo(`t${r},${t},${seg}`, () => new THREE.TorusGeometry(r, t, 8, seg));

function add(parent, geometry, material, { p = [0, 0, 0], r = null, s = null, outline = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  if (s != null) (Array.isArray(s) ? m.scale.set(...s) : m.scale.setScalar(s));
  m.castShadow = true;
  if (outline) {
    const o = new THREE.Mesh(geometry, OUT);
    o.userData.outline = true;
    m.add(o);
  }
  parent.add(m);
  return m;
}
const group = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

// ---------------------------------------------------------------------------
// horses (and the unicorn): a chunky, friendly pony with a saddle
// ---------------------------------------------------------------------------

function horse(g, { coat, dark, mane, hoof = '#2a1d16', saddle = '#8b3a2b', unicorn = false, blaze = null, socks = null }) {
  const coatM = toon(coat), darkM = toon(dark), hoofM = toon(hoof);
  const body = group(g, 0, 0, 0);
  // the barrel of the body, a rounded chest and rump
  add(body, cap(0.3, 1.0), coatM, { p: [0, 0.88, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.95] });
  add(body, sph(0.33), coatM, { p: [0, 0.9, 0.52], s: [0.95, 1, 0.9] });
  add(body, sph(0.32), coatM, { p: [0, 0.91, -0.52], s: [1, 1, 0.9] });
  // neck and head (the head nods as it walks)
  // (the neck leans forward; in the head's frame +y runs down the face to the nose and -z is up)
  const neck = group(body, 0, 1.0, 0.68);
  neck.rotation.x = 0.62;
  add(neck, cap(0.17, 0.42), coatM, { p: [0, 0.28, 0] });
  const ears = [];
  const head = group(neck, 0, 0.62, 0.02);
  head.rotation.x = 1.0;
  add(head, cap(0.16, 0.3), coatM, { p: [0, 0.12, 0.02], s: [0.95, 1, 1.05] });
  add(head, sph(0.15), toon(mix(coat, '#ffffff', 0.25)), { p: [0, 0.34, 0.03], s: [0.95, 0.8, 0.95] }); // muzzle
  for (const s of [-1, 1]) {
    add(head, sph(0.032, 8, 6), basic('#1d1b2e'), { p: [s * 0.06, 0.45, 0.06], outline: false }); // nostrils
    const eye = add(head, sph(0.045, 10, 8), basic('#1d1b2e'), { p: [s * 0.135, 0.06, -0.06], outline: false });
    add(eye, sph(0.016, 6, 4), basic('#ffffff'), { p: [0.01 * s, -0.015, -0.035], outline: false });
    ears.push(add(head, cone(0.05, 0.14, 8), coatM, { p: [s * 0.08, -0.1, -0.13], r: [-1.5, 0, s * 0.3] })); // ears
    // the bit and the reins running back to the saddle
    add(head, sph(0.025, 8, 6), shiny('#c0c6d4'), { p: [s * 0.12, 0.36, 0.0], outline: false });
    add(head, cyl(0.008, 0.008, 0.62, 4), toon('#3a2414'), { p: [s * 0.13, 0.06, 0.05], r: [0.12, 0, 0], outline: false });
  }
  if (blaze) add(head, box(0.06, 0.34, 0.02), toon(blaze), { p: [0, 0.18, -0.155], r: [0.05, 0, 0], outline: false });
  // reins and bridle
  const leather = toon('#3a2414');
  add(head, torus(0.155, 0.014, 20), leather, { p: [0, 0.27, 0.03], r: [0.2, 0, 0], s: [1, 1.15, 1], outline: false });
  // the mane: a row of tufts down the back of the neck (plus a forelock)
  const maneM = mane.map ? null : toon(mane);
  const maneTufts = [];
  for (let i = 0; i < 8; i++) {
    const m = maneM ?? toon(mane[i % mane.length]);
    maneTufts.push(add(neck, sph(0.09, 10, 8), m, { p: [0, 0.02 + i * 0.085, -0.15 + i * 0.005], s: [0.55, 1.15, 1.05], r: [0.3, 0, 0] }));
  }
  add(head, sph(0.07, 10, 8), maneM ?? toon(mane[0]), { p: [0, -0.04, -0.15], s: [0.7, 1.2, 0.8] }); // forelock
  if (unicorn) {
    // a golden spiral horn, up from the forehead and pointing forward
    const horn = add(head, cone(0.045, 0.32, 10), shiny('#ffd84d', { metalness: 0.5, emissive: '#ffb84d', emissiveIntensity: 0.25 }), { p: [0, 0.06, -0.26], r: [-1.05, 0, 0] });
    for (let k = 0; k < 3; k++) add(horn, torus(0.035 - k * 0.008, 0.007, 12), toon('#fff1b0'), { p: [0, -0.08 + k * 0.08, 0], r: [Math.PI / 2 + 0.3, 0, 0], outline: false });
  }
  // the tail, swishing
  const tail = group(body, 0, 0.98, -0.8);
  for (let i = 0; i < 5; i++) add(tail, sph(0.08 - i * 0.004, 10, 8), maneM ?? toon(mane[i % mane.length]), { p: [0, -0.1 - i * 0.1, -0.04 - i * 0.025], s: [0.8, 1.4, 0.8] });
  // saddle, blanket and stirrups
  add(body, box(0.5, 0.05, 0.5), toon(mix(saddle, '#ffffff', 0.15)), { p: [0, 1.17, 0.02], outline: false });
  const seatM = toon(saddle);
  add(body, cap(0.13, 0.26), seatM, { p: [0, 1.22, 0.02], r: [Math.PI / 2, 0, 0], s: [1.6, 1, 0.5] });
  add(body, box(0.1, 0.12, 0.08), seatM, { p: [0, 1.29, 0.2] }); // the horn of the saddle
  for (const s of [-1, 1]) {
    add(body, box(0.015, 0.36, 0.03), leather, { p: [s * 0.34, 1.03, 0.04], outline: false });
    add(body, torus(0.05, 0.012, 12), shiny('#c0c6d4'), { p: [s * 0.34, 0.83, 0.04], r: [0, Math.PI / 2, 0], outline: false });
  }
  // four legs, each with a knee, swinging from the shoulders and hips
  const legs = [];
  for (const [x, z, front] of [[-0.17, 0.52, 1], [0.17, 0.52, 1], [-0.17, -0.54, 0], [0.17, -0.54, 0]]) {
    const hip = group(body, x, 0.75, z);
    add(hip, cap(0.085, 0.24), coatM, { p: [0, -0.17, 0] });
    const knee = group(hip, 0, -0.34, 0);
    add(knee, cap(0.06, 0.24), coatM, { p: [0, -0.15, 0] });
    add(knee, cyl(0.075, 0.085, 0.09, 12), hoofM, { p: [0, -0.33, 0.01] });
    if (socks) add(knee, cyl(0.068, 0.072, 0.12, 12), toon(socks), { p: [0, -0.24, 0], outline: false });
    if (unicorn) add(knee, torus(0.07, 0.02, 12), toon('#ffb3d9'), { p: [0, -0.26, 0], r: [Math.PI / 2, 0, 0], outline: false });
    legs.push({ hip, knee, front, side: x > 0 ? 1 : 0 });
  }
  let phase = 0, w = 0, gallop = 0, earT = 2, earSide = 0, look = 0, lookT = 3;
  const sparkles = unicorn ? sparkleTrail(g) : null;
  if (unicorn) { const hg = new THREE.Sprite(additive(glowTexture, 0xffe27a, 0.6)); hg.scale.setScalar(0.35); hg.position.set(0, 0.0, -0.36); head.add(hg); }
  return {
    seat: 1.26, stance: 'straddle', speed: unicorn ? 2.05 : 1.9, bob: 0,
    tick(t, dt, moving, speed = 1) {
      w += ((moving ? 1 : 0) - w) * Math.min(1, dt * 6);
      // trot when taking it easy, gallop when you put your foot down
      gallop += ((speed > 1.15 ? 1 : 0) - gallop) * Math.min(1, dt * 3);
      const before = phase;
      phase += dt * (8 + gallop * 4) * w;
      if (Math.floor(before / Math.PI) !== Math.floor(phase / Math.PI) && w > 0.3) this.onStep?.();
      for (const L of legs) {
        // trot: diagonal pairs together; gallop: front pair then back pair
        const trotOff = (L.front ? 0 : Math.PI) + (L.front === L.side ? 0 : Math.PI);
        const gallopOff = (L.front ? 0 : Math.PI * 0.85) + L.side * 0.35;
        const p = phase + trotOff * (1 - gallop) + gallopOff * gallop;
        const reach = 0.45 + gallop * 0.25;
        L.hip.rotation.x = Math.sin(p) * reach * w + Math.sin(t * 0.8 + L.side) * 0.02 * (1 - w);
        L.knee.rotation.x = (L.front ? -1 : 1) * Math.max(0, Math.cos(p)) * (0.7 + gallop * 0.3) * w;
      }
      body.position.y = Math.abs(Math.sin(phase)) * (0.04 + gallop * 0.04) * w;
      this.bob = body.position.y;
      body.rotation.x = Math.sin(phase) * (0.02 + gallop * 0.05) * w;
      // breathing when still
      body.scale.y = 1 + Math.sin(t * 1.6) * 0.012 * (1 - w);
      // the head nods with each stride; standing, it looks about now and then
      if ((lookT -= dt) <= 0) { look = (Math.random() - 0.5) * 0.8; lookT = 2 + Math.random() * 4; }
      neck.rotation.x = 0.62 + Math.sin(phase * 2) * (0.05 + gallop * 0.07) * w + Math.sin(t * 1.3) * 0.04 * (1 - w) + (1 - w) * 0.08;
      neck.rotation.y += ((1 - w) * look - neck.rotation.y) * Math.min(1, dt * 2);
      maneTufts.forEach((m, i) => { m.rotation.x = 0.3 + Math.sin(phase * 2 - i * 0.6) * 0.25 * w + Math.sin(t * 1.5 + i) * 0.05; });
      // an ear flicks now and then
      if ((earT -= dt) <= 0) { earSide = Math.random() < 0.5 ? 0 : 1; earT = 1.5 + Math.random() * 3; }
      ears.forEach((e, i) => { e.rotation.x = -1.5 + (i === earSide && earT > 1.2 ? Math.sin((earT - 1.2) * 30) * 0.3 : 0); });
      tail.rotation.x = 0.35 + w * 0.5 + Math.sin(phase) * 0.2 * w;
      tail.rotation.z = Math.sin(t * 2.1) * 0.35 * (1 - w * 0.6);
      sparkles?.(t, dt, w);
    },
  };
}

/** Rainbow sparkles drifting up off a unicorn as it runs. */
function sparkleTrail(g) {
  const cols = [0xff8fc7, 0xffd84d, 0x8fe3ff, 0xb98bff, 0x9dffb0];
  const sp = Array.from({ length: 12 }, (_, i) => {
    const s = new THREE.Sprite(additive(glowTexture, cols[i % cols.length], 0.8));
    s.scale.setScalar(0.001);
    g.add(s);
    return { s, life: 0 };
  });
  let next = 0, i = 0;
  return (t, dt, w) => {
    next -= dt;
    if (w > 0.3 && next <= 0) {
      next = 0.05;
      const k = sp[i++ % sp.length];
      k.life = 1;
      k.s.position.set((Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.8, -0.6 - Math.random() * 0.3);
    }
    for (const k of sp) {
      if (k.life <= 0) { k.s.scale.setScalar(0.001); continue; }
      k.life -= dt * 1.4;
      k.s.position.y += dt * 0.6;
      k.s.position.z -= dt * 0.8;
      k.s.scale.setScalar(0.22 * Math.max(0, k.life));
    }
  };
}

// ---------------------------------------------------------------------------
// wheels
// ---------------------------------------------------------------------------

function wheel(parent, r, { z = 0, y = r, tire = '#1d1b2e', rim = '#c0c6d4', spokes = 6, width = 0.06 } = {}) {
  const w = group(parent, 0, y, z);
  const spin = group(w);
  add(spin, geo(`tire${r},${width}`, () => new THREE.TorusGeometry(r - width * 0.5, width * 0.6, 10, 28)), toon(tire), { r: [0, Math.PI / 2, 0] });
  add(spin, cyl(r * 0.18, r * 0.18, width * 1.2, 12), shiny(rim), { r: [0, 0, Math.PI / 2], outline: false });
  for (let k = 0; k < spokes; k++) add(spin, box(width * 0.3, (r - width) * 2, width * 0.3), shiny(rim), { r: [(k / spokes) * Math.PI, 0, 0], outline: false });
  return spin;
}

function bike(g, { frame = '#e0463c' }) {
  const frameM = shiny(frame, { metalness: 0.3, roughness: 0.4 });
  const front = wheel(g, 0.33, { z: 0.52, spokes: 8 }), back = wheel(g, 0.33, { z: -0.5, spokes: 8 });
  const tube = (a, b, r = 0.03, mat = frameM) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const m = add(g, cyl(r, r, d.length(), 8), mat, { outline: false });
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  // the diamond frame, forks and handlebars
  tube([0, 0.4, 0], [0, 0.95, -0.18]);           // seat tube
  tube([0, 0.4, 0], [0, 0.9, 0.36]);             // down tube
  tube([0, 0.95, -0.18], [0, 0.92, 0.36]);       // top tube
  tube([0, 0.4, 0], [0, 0.33, -0.5]);            // chain stay
  tube([0, 0.95, -0.18], [0, 0.33, -0.5]);       // seat stay
  tube([0, 1.0, 0.4], [0, 0.33, 0.52], 0.025);   // fork
  tube([-0.26, 1.08, 0.36], [0.26, 1.08, 0.36], 0.022); // bars
  tube([0, 0.9, 0.36], [0, 1.08, 0.36], 0.025);
  for (const s of [-1, 1]) add(g, cyl(0.032, 0.032, 0.1, 8), toon('#1d1b2e'), { p: [s * 0.27, 1.08, 0.36], r: [0, 0, Math.PI / 2], outline: false });
  add(g, cap(0.06, 0.16), toon('#1d1b2e'), { p: [0, 1.0, -0.2], r: [Math.PI / 2, 0, 0], s: [1.3, 1, 0.6] }); // saddle
  add(g, cone(0.05, 0.08, 10), basic('#fff6c9'), { p: [0, 0.95, 0.45], r: [Math.PI / 2, 0, 0], outline: false }); // lamp
  add(g, box(0.12, 0.1, 0.16), toon('#c9955a'), { p: [0, 0.98, 0.52], outline: false }); // a little basket
  // mudguards, a chain and a kickstand
  for (const z of [0.52, -0.5]) add(g, geo('fender', () => new THREE.TorusGeometry(0.38, 0.03, 6, 20, Math.PI * 0.75)), shiny(frame, { metalness: 0.3 }), { p: [0, 0.33, z], r: [0, Math.PI / 2, Math.PI * 0.12], outline: false });
  tube([0.07, 0.47, 0], [0.07, 0.4, -0.5], 0.012, toon('#2b2f4a'));
  tube([0.07, 0.33, 0], [0.07, 0.29, -0.5], 0.012, toon('#2b2f4a'));
  const stand = group(g, -0.08, 0.38, -0.15);
  add(stand, cyl(0.015, 0.015, 0.36, 6), toon('#2b2f4a'), { p: [0, -0.18, 0], outline: false });
  // pedals on a crank
  const crank = group(g, 0, 0.4, 0);
  add(crank, cyl(0.07, 0.07, 0.04, 14), shiny('#c0c6d4'), { r: [0, 0, Math.PI / 2], outline: false });
  for (const s of [-1, 1]) {
    const arm = group(crank, s * 0.06, 0, 0);
    arm.rotation.x = s > 0 ? 0 : Math.PI;
    add(arm, box(0.02, 0.17, 0.03), shiny('#8d96a8'), { p: [0, -0.085, 0], outline: false });
    add(arm, box(0.1, 0.02, 0.06), toon('#1d1b2e'), { p: [s * 0.05, -0.17, 0], outline: false });
  }
  let roll = 0;
  return {
    seat: 1.02, stance: 'pedal', speed: 1.75, crank,
    tick(t, dt, moving, speed = 1) {
      const v = moving ? speed : 0;
      roll += dt * v * 9;
      front.rotation.x = back.rotation.x = roll;
      crank.rotation.x = roll * 0.55;
      this.pedal = crank.rotation.x;
      // the kickstand swings down when you stop, and the bike leans on it a little
      stand.rotation.z += ((moving ? -1.4 : -0.35) - stand.rotation.z) * Math.min(1, dt * 6);
      g.rotation.z += ((moving ? 0 : 0.06) - g.rotation.z) * Math.min(1, dt * 4);
    },
  };
}

function scooter(g, { color = '#39c6ff' }) {
  const m = shiny(color, { metalness: 0.3 });
  add(g, box(0.17, 0.05, 0.72), m, { p: [0, 0.14, 0] });
  add(g, box(0.15, 0.012, 0.6), toon('#1d1b2e'), { p: [0, 0.17, -0.02], outline: false }); // grip tape
  const fw = wheel(g, 0.09, { z: 0.36, tire: '#2b2f4a', rim: '#ffd84d', spokes: 3, width: 0.05 });
  const bw = wheel(g, 0.09, { z: -0.36, tire: '#2b2f4a', rim: '#ffd84d', spokes: 3, width: 0.05 });
  const stem = add(g, cyl(0.025, 0.025, 0.95, 10), shiny('#c0c6d4'), { p: [0, 0.6, 0.36], r: [-0.12, 0, 0], outline: false });
  stem.castShadow = true;
  add(g, cyl(0.02, 0.02, 0.5, 8), shiny('#c0c6d4'), { p: [0, 1.06, 0.42], r: [0, 0, Math.PI / 2], outline: false });
  for (const s of [-1, 1]) add(g, cyl(0.03, 0.03, 0.1, 8), toon(color), { p: [s * 0.25, 1.06, 0.42], r: [0, 0, Math.PI / 2], outline: false });
  add(g, box(0.08, 0.03, 0.12), m, { p: [0, 0.2, -0.38], r: [0.3, 0, 0], outline: false }); // back brake
  let roll = 0;
  add(g, sph(0.035, 8, 6), basic('#fff6c9'), { p: [0, 0.95, 0.47], outline: false }); // a little headlight
  return {
    seat: 0.17, stance: 'scoot', speed: 1.55,
    tick(t, dt, moving, speed = 1) { roll += dt * (moving ? speed : 0) * 22; fw.rotation.x = bw.rotation.x = roll; },
  };
}

function skateboard(g, { deck = '#ff7a59', art = '#ffd84d' }) {
  const deckGeo = geo('skateDeck', () => {
    const s = new THREE.Shape();
    s.absarc(0, 0.32, 0.12, 0, Math.PI, false);
    s.absarc(0, -0.32, 0.12, Math.PI, TAU, false);
    const g2 = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2 });
    g2.rotateX(Math.PI / 2);
    return g2;
  });
  const board = group(g, 0, 0.14, 0);
  add(board, deckGeo, toon(deck), { p: [0, 0.035, 0] });
  add(board, box(0.08, 0.004, 0.5), toon(art), { p: [0, 0.04, 0], outline: false });
  const wheels = [];
  for (const z of [-0.26, 0.26]) {
    add(board, box(0.2, 0.03, 0.05), shiny('#c0c6d4'), { p: [0, -0.02, z], outline: false });
    for (const x of [-0.11, 0.11]) wheels.push(add(board, cyl(0.045, 0.045, 0.04, 12), toon('#fff6c9'), { p: [x, -0.06, z], r: [0, 0, Math.PI / 2], outline: false }));
  }
  let roll = 0, ollie = 0, next = 3;
  return {
    seat: 0.2, stance: 'board', speed: 1.5, hop: 0,
    tick(t, dt, moving, speed = 1) {
      roll += dt * (moving ? speed : 0) * 30;
      wheels.forEach((w) => { w.rotation.x = roll; });
      if (moving && (next -= dt) <= 0) { ollie = 0.001; next = 3 + Math.random() * 4; this.onTrick?.(); }
      if (ollie > 0) ollie = Math.min(1, ollie + dt * 2.2);
      const k = ollie > 0 ? Math.sin(ollie * Math.PI) : 0;
      if (ollie >= 1) ollie = 0;
      this.hop = k * 0.45;
      board.position.y = 0.14 + this.hop;
      board.rotation.x = ollie > 0 ? -Math.sin(Math.min(1, ollie * 2) * Math.PI) * 0.35 : 0; // pop the tail
      board.rotation.z = moving ? Math.sin(t * 2.4) * 0.05 : 0; // carving side to side
    },
  };
}

function hoverboard(g, { color = '#b98bff' }) {
  const board = group(g, 0, 0.32, 0);
  const glow = toon(color, { emissive: color, emissiveIntensity: 0.35 });
  add(board, cap(0.15, 0.55), shiny('#2b2f4a', { metalness: 0.4 }), { r: [Math.PI / 2, 0, 0], s: [1.4, 1, 0.3] });
  add(board, box(0.36, 0.012, 0.66), glow, { p: [0, 0.05, 0], outline: false });
  for (const z of [-0.28, 0.28]) add(board, cyl(0.07, 0.09, 0.05, 16), basic('#8fe3ff'), { p: [0, -0.05, z], outline: false });
  const under = new THREE.Sprite(additive(glowTexture, new THREE.Color(color).getHex(), 0.9));
  under.scale.set(1.1, 1.1, 1);
  under.position.y = -0.15;
  board.add(under);
  const ring = add(g, geo('hoverRing', () => new THREE.RingGeometry(0.25, 0.42, 32)), basic(color, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), { p: [0, 0.02, 0], r: [-Math.PI / 2, 0, 0], outline: false });
  const trail = [];
  for (let k = 0; k < 10; k++) { const sp = new THREE.Sprite(additive(glowTexture, new THREE.Color(color).getHex(), 0)); g.add(sp); trail.push({ sp, life: 0 }); }
  let ti = 0, tNext = 0;
  return {
    seat: 0.38, stance: 'board', speed: 2.1, board,
    tick(t, dt, moving) {
      if (moving && (tNext -= dt) <= 0) { tNext = 0.05; const k = trail[ti++ % trail.length]; k.life = 1; k.sp.position.set((Math.random() - 0.5) * 0.2, board.position.y - 0.05, -0.35); }
      for (const k of trail) { if (k.life <= 0) { k.sp.material.opacity = 0; continue; } k.life -= dt * 2.5; k.sp.position.z -= dt * 1.5; k.sp.scale.setScalar(0.35 * k.life); k.sp.material.opacity = k.life * 0.7; }
      board.position.y = 0.32 + Math.sin(t * 3) * 0.04;
      board.rotation.x = moving ? -0.08 : 0;
      this.seat = board.position.y + 0.06;
      under.material.opacity = 0.7 + Math.sin(t * 6) * 0.2;
      ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    },
  };
}

function mix(a, b, k) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
}

const BUILD = {
  mount_horse: (g) => horse(g, { coat: '#9a5b2e', dark: '#6b3a1c', mane: '#3a2414', blaze: '#fbf7ff', socks: '#fbf7ff' }),
  mount_horse_black: (g) => horse(g, { coat: '#2b2533', dark: '#18141f', mane: '#0d0b12', hoof: '#555060', saddle: '#c9a227' }),
  mount_pony: (g) => horse(g, { coat: '#ffc2dd', dark: '#e88fb8', mane: '#b98bff', hoof: '#ffffff', saddle: '#7fc8ff' }),
  mount_unicorn: (g) => horse(g, { coat: '#fbf7ff', dark: '#e8e2f4', mane: ['#ff7a9a', '#ffb44d', '#ffe066', '#7ee08a', '#6ec3ff', '#b98bff'], hoof: '#ffd84d', saddle: '#ff8fc7', unicorn: true }),
  mount_bike: (g) => bike(g, { frame: '#e0463c' }),
  mount_scooter: (g) => scooter(g, { color: '#39c6ff' }),
  mount_skateboard: (g) => skateboard(g, { deck: '#ff7a59', art: '#ffd84d' }),
  mount_hoverboard: (g) => hoverboard(g, { color: '#b98bff' }),
};

/** Build a mount: { group, seat, stance, speed, tick } (null for none / unknown). */
export function buildMount(id) {
  const make = BUILD[id];
  if (!make) return null;
  const group = new THREE.Group();
  const m = make(group);
  group.traverse((o) => { if (o.isMesh && !o.userData.outline && !o.material.transparent) o.castShadow = true; });
  return {
    group, id, stance: m.stance, speed: m.speed, tick: m.tick.bind(m),
    get seatY() { return m.seat; }, get pedal() { return m.pedal ?? 0; }, get bob() { return m.bob ?? 0; }, get hop() { return m.hop ?? 0; },
    set onStep(fn) { m.onStep = fn; }, set onTrick(fn) { m.onTrick = fn; },
  };
}

/** How much faster than walking a mount goes (1 for none). */
export const mountSpeed = (id) => ({ mount_horse: 1.9, mount_horse_black: 1.95, mount_pony: 1.85, mount_unicorn: 2.05, mount_bike: 1.75, mount_scooter: 1.55, mount_skateboard: 1.5, mount_hoverboard: 2.1 })[id] ?? 1;

/** What a mount sounds like: the call when you hop on, and what loops while you ride (null: footsteps). */
export const MOUNT_SOUND = {
  mount_horse: { on: 'neigh', loop: null }, mount_horse_black: { on: 'neigh', loop: null }, mount_pony: { on: 'neigh', loop: null },
  mount_unicorn: { on: 'magic', loop: null }, mount_bike: { on: 'bikebell', loop: 'pedal' }, mount_scooter: { on: 'skate', loop: 'roll' },
  mount_skateboard: { on: 'skate', loop: 'roll' }, mount_hoverboard: { on: 'hoverup', loop: 'hover' },
};
