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
// horses (and the unicorn): a proper horse shape, with a saddle
// ---------------------------------------------------------------------------

/** A tapered limb/neck piece from a to b (radius ra at a, rb at b), with a ball at the joint end. */
function limb(parent, a, b, ra, rb, mat, outline = true) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const m = add(parent, cyl(rb, ra, d.length(), 14), mat, { outline });
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

// how far a horse travels per stride (world units), so the hooves keep pace with the ground
const TROT_STRIDE = 3.0, GALLOP_STRIDE = 4.4;

function horse(g, { coat, dark, mane, hoof = '#2a1d16', saddle = '#8b3a2b', unicorn = false, blaze = null, socks = null }) {
  const coatM = toon(coat), darkM = toon(dark), hoofM = toon(hoof);
  const maneCols = Array.isArray(mane) ? mane : [mane];
  const maneM = (i) => toon(maneCols[i % maneCols.length]);
  const body = group(g, 0, 0, 0);
  // the barrel: a long, deep body, a rounded chest and a higher, rounder rump (the croup)
  add(body, cap(0.27, 0.72), coatM, { p: [0, 0.98, -0.02], r: [Math.PI / 2, 0, 0], s: [0.92, 1.05, 1] });
  add(body, sph(0.3, 20, 16), coatM, { p: [0, 1.0, 0.42], s: [0.9, 1.02, 0.95] });
  add(body, sph(0.31, 20, 16), coatM, { p: [0, 1.04, -0.46], s: [0.95, 1, 0.95] });
  add(body, sph(0.2, 16, 12), coatM, { p: [0, 1.17, 0.36], s: [0.8, 0.7, 1.1] }); // withers
  // neck: arching up and forward from the withers (in the neck's frame +y runs up it)
  const neck = group(body, 0, 1.12, 0.48);
  neck.rotation.x = 0.55;
  limb(neck, [0, -0.04, 0.0], [0, 0.5, 0.0], 0.2, 0.13, coatM);
  add(neck, sph(0.19, 16, 12), coatM, { p: [0, 0.02, -0.02], s: [0.95, 1.1, 1.05] });
  // head: a long face tapering to a soft muzzle, angled down from the poll
  const head = group(neck, 0, 0.52, 0.02);
  head.rotation.x = 1.25; // (in the head's frame +y runs down the face to the nose, -z is the forehead side)
  add(head, sph(0.14, 16, 12), coatM, { p: [0, 0.0, 0.02], s: [0.9, 1.0, 1.0] }); // the skull
  limb(head, [0, 0.02, 0.03], [0, 0.34, 0.04], 0.12, 0.085, coatM); // the long face
  add(head, sph(0.1, 14, 10), toon(mix(coat, '#2a2026', 0.12)), { p: [0, 0.37, 0.05], s: [0.95, 0.85, 1.05] }); // the muzzle
  add(head, sph(0.11, 14, 10), coatM, { p: [0, 0.06, 0.09], s: [0.85, 0.9, 0.8] }); // round cheeks / jaw
  const ears = [];
  for (const s of [-1, 1]) {
    add(head, sph(0.022, 8, 6), basic('#1d1b2e'), { p: [s * 0.05, 0.44, 0.02], outline: false }); // nostrils
    const eye = add(head, sph(0.032, 10, 8), basic('#1d1b2e'), { p: [s * 0.115, 0.06, -0.03], outline: false });
    add(eye, sph(0.011, 6, 4), basic('#ffffff'), { p: [0.008 * s, -0.01, -0.025], outline: false });
    // tall, pointed ears
    ears.push(add(head, cone(0.04, 0.16, 8), coatM, { p: [s * 0.065, -0.1, -0.08], r: [-1.85, 0, s * 0.18], s: [1, 1, 0.7] }));
    // the bit and the reins running back to the saddle
    add(head, sph(0.02, 8, 6), shiny('#c0c6d4'), { p: [s * 0.085, 0.36, 0.08], outline: false });
  }
  if (blaze) add(head, box(0.05, 0.36, 0.015), toon(blaze), { p: [0, 0.2, -0.1], r: [0.06, 0, 0], outline: false });
  // bridle: a noseband and a cheek strap
  const leather = toon('#3a2414');
  add(head, torus(0.105, 0.012, 20), leather, { p: [0, 0.28, 0.045], r: [Math.PI / 2 + 0.05, 0, 0], outline: false });
  for (const s of [-1, 1]) add(head, box(0.012, 0.3, 0.02), leather, { p: [s * 0.11, 0.14, 0.03], outline: false });
  // reins: from the bit back to where the rider holds them (just ahead of the saddle)
  const reins = [-1, 1].map(() => add(body, cyl(0.007, 0.007, 1, 4), leather, { outline: false }));
  // the mane: long locks falling down one side of the neck, and a forelock between the ears
  const maneLocks = [];
  for (let i = 0; i < 9; i++) {
    const lock = group(neck, 0.03, 0.02 + i * 0.058, -0.16 + i * 0.006);
    add(lock, cap(0.04, 0.16 - i * 0.006), maneM(i), { p: [0.04, -0.08, 0], r: [0, 0, 0.35], s: [0.7, 1, 1] });
    maneLocks.push(lock);
  }
  add(head, cap(0.04, 0.1), maneM(0), { p: [0, -0.04, -0.13], r: [0.5, 0, 0], s: [1, 1, 0.7] }); // forelock
  if (unicorn) {
    // a golden spiral horn, up from the forehead and pointing forward
    const horn = add(head, cone(0.04, 0.32, 10), shiny('#ffd84d', { metalness: 0.5, emissive: '#ffb84d', emissiveIntensity: 0.25 }), { p: [0, 0.02, -0.2], r: [-1.25, 0, 0] });
    for (let k = 0; k < 3; k++) add(horn, torus(0.032 - k * 0.008, 0.006, 12), toon('#fff1b0'), { p: [0, -0.08 + k * 0.08, 0], r: [Math.PI / 2 + 0.3, 0, 0], outline: false });
  }
  // the tail: a fall of long strands from the top of the rump, swishing
  const tail = group(body, 0, 1.14, -0.74);
  add(tail, cap(0.05, 0.08), coatM, { p: [0, -0.02, -0.03], r: [-0.6, 0, 0] }); // the dock
  const strands = [];
  for (let i = 0; i < 5; i++) {
    const st = group(tail, (i - 2) * 0.025, -0.04, -0.06);
    add(st, cap(0.045, 0.42), maneM(i), { p: [0, -0.24, 0], s: [0.9, 1, 0.9] });
    st.rotation.z = (i - 2) * 0.08;
    strands.push(st);
  }
  // saddle, blanket and stirrups
  add(body, box(0.5, 0.04, 0.52), toon(mix(saddle, '#ffffff', 0.18)), { p: [0, 1.25, 0.0], outline: false });
  const seatM = toon(saddle);
  add(body, cap(0.13, 0.24), seatM, { p: [0, 1.3, 0.0], r: [Math.PI / 2, 0, 0], s: [1.55, 1, 0.45] });
  add(body, box(0.08, 0.1, 0.07), seatM, { p: [0, 1.36, 0.18] }); // the horn of the saddle
  add(body, box(0.26, 0.08, 0.05), seatM, { p: [0, 1.35, -0.17], outline: false }); // the cantle
  for (const s of [-1, 1]) {
    add(body, box(0.015, 0.36, 0.03), leather, { p: [s * 0.3, 1.1, 0.02], outline: false });
    add(body, torus(0.045, 0.012, 12), shiny('#c0c6d4'), { p: [s * 0.3, 0.9, 0.02], r: [0, Math.PI / 2, 0], outline: false });
  }
  // four long legs. Front: forearm, knee, cannon, fetlock, hoof. Back: thigh angled back to the hock,
  // which bends the other way, then the cannon down to the hoof.
  const legs = [];
  for (const [x, z, front] of [[-0.15, 0.42, 1], [0.15, 0.42, 1], [-0.15, -0.5, 0], [0.15, -0.5, 0]]) {
    const hip = group(body, x, 0.86, z);
    if (front) limb(hip, [0, 0.05, 0], [0, -0.36, 0.01], 0.1, 0.065, coatM);
    else {
      add(hip, sph(0.15, 14, 10), coatM, { p: [0, 0.06, -0.02], s: [0.75, 1.1, 1] }); // the gaskin / haunch
      limb(hip, [0, 0.05, -0.02], [0, -0.36, -0.1], 0.11, 0.065, coatM);
    }
    const knee = group(hip, 0, -0.37, front ? 0.01 : -0.1);
    add(knee, sph(0.064, 10, 8), coatM, { outline: false });
    limb(knee, [0, 0, 0], [0, -0.3, front ? 0.01 : 0.02], 0.052, 0.045, coatM);
    add(knee, sph(0.055, 10, 8), coatM, { p: [0, -0.31, 0.015], outline: false }); // fetlock
    add(knee, cyl(0.058, 0.07, 0.08, 12), hoofM, { p: [0, -0.37, 0.03] });
    if (socks) add(knee, cyl(0.056, 0.06, 0.12, 12), toon(socks), { p: [0, -0.27, 0.015], outline: false });
    if (unicorn) add(knee, torus(0.06, 0.018, 12), toon('#ffb3d9'), { p: [0, -0.29, 0.015], r: [Math.PI / 2, 0, 0], outline: false });
    legs.push({ hip, knee, front, side: x > 0 ? 1 : 0 });
  }
  let phase = 0, w = 0, gallop = 0, earT = 2, earSide = 0, look = 0, lookT = 3;
  const sparkles = unicorn ? sparkleTrail(g) : null;
  if (unicorn) { const hg = new THREE.Sprite(additive(glowTexture, 0xffe27a, 0.6)); hg.scale.setScalar(0.35); hg.position.set(0, 0.0, -0.3); head.add(hg); }
  const bit = new THREE.Vector3(), hands = new THREE.Vector3();
  return {
    seat: 1.34, stance: 'straddle', speed: unicorn ? 2.05 : 1.9, bob: 0,
    tick(t, dt, moving, speed = 1, ground = null) {
      w += ((moving ? 1 : 0) - w) * Math.min(1, dt * 6);
      // trot at a normal pace, gallop when you put your foot down (or watching someone else go fast)
      const v = ground ?? (moving ? 7.5 * this.speed * speed : 0);
      gallop += ((v > 15.5 ? 1 : 0) - gallop) * Math.min(1, dt * 3);
      // the legs cycle once per stride, so the hooves keep up with how fast you're really going
      const stride = TROT_STRIDE + (GALLOP_STRIDE - TROT_STRIDE) * gallop;
      const before = phase;
      phase += dt * TAU * (v / stride) * (moving ? 1 : w);
      if (Math.floor(before / Math.PI) !== Math.floor(phase / Math.PI) && w > 0.3) this.onStep?.();
      for (const L of legs) {
        // trot: diagonal pairs together; gallop: back pair then front pair, a beat apart
        const trotOff = (L.front ? 0 : Math.PI) + (L.front === L.side ? 0 : Math.PI);
        const gallopOff = (L.front ? 0 : Math.PI * 0.85) + L.side * 0.35;
        const p = phase + trotOff * (1 - gallop) + gallopOff * gallop;
        const reach = 0.42 + gallop * 0.28;
        L.hip.rotation.x = Math.sin(p) * reach * w + Math.sin(t * 0.8 + L.side) * 0.02 * (1 - w);
        // knees fold as the leg swings forward (front knees bend back, hocks bend forward)
        L.knee.rotation.x = (L.front ? 1 : -1) * Math.max(0, Math.cos(p)) * (0.9 + gallop * 0.4) * w;
      }
      body.position.y = Math.abs(Math.sin(phase)) * (0.04 + gallop * 0.05) * w;
      this.bob = body.position.y;
      body.rotation.x = Math.sin(phase) * (0.015 + gallop * 0.05) * w;
      // breathing when still
      body.scale.y = 1 + Math.sin(t * 1.6) * 0.01 * (1 - w);
      // the head nods with each stride; standing, it looks about now and then
      if ((lookT -= dt) <= 0) { look = (Math.random() - 0.5) * 0.8; lookT = 2 + Math.random() * 4; }
      neck.rotation.x = 0.55 + Math.sin(phase * 2) * (0.04 + gallop * 0.08) * w + Math.sin(t * 1.3) * 0.04 * (1 - w) + (1 - w) * 0.06 + gallop * 0.15;
      neck.rotation.y += ((1 - w) * look - neck.rotation.y) * Math.min(1, dt * 2);
      maneLocks.forEach((m, i) => { m.rotation.x = -0.15 - w * 0.35 + Math.sin(phase * 2 - i * 0.6) * 0.18 * w + Math.sin(t * 1.5 + i) * 0.05; });
      // an ear flicks now and then
      if ((earT -= dt) <= 0) { earSide = Math.random() < 0.5 ? 0 : 1; earT = 1.5 + Math.random() * 3; }
      ears.forEach((e, i) => { e.rotation.x = -1.85 + (i === earSide && earT > 1.2 ? Math.sin((earT - 1.2) * 30) * 0.3 : 0); });
      tail.rotation.x = 0.25 + w * (0.5 + gallop * 0.4) + Math.sin(phase) * 0.15 * w;
      tail.rotation.z = Math.sin(t * 2.1) * 0.3 * (1 - w * 0.6);
      strands.forEach((st, i) => { st.rotation.x = Math.sin(t * 3 + i) * 0.06 + w * 0.2; });
      // reins: from each side of the bit back to the rider's hands
      g.updateMatrixWorld(true);
      [-1, 1].forEach((s, i) => {
        body.worldToLocal(head.localToWorld(bit.set(s * 0.085, 0.36, 0.08)));
        // to about where the rider's hands are, or draped over the front of the saddle with no one on
        if (this.ridden) hands.set(s * 0.16, 1.78, 0.32); else hands.set(s * 0.09, 1.36, 0.2);
        const d = hands.clone().sub(bit);
        reins[i].position.copy(bit).add(hands).multiplyScalar(0.5);
        reins[i].scale.y = d.length();
        reins[i].quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      });
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

// a little cruiser bike sized for chibi legs: the rider's feet stay on the pedals the whole way round
const BIKE = { wheel: 0.25, crankY: 0.27, crank: 0.105, pedalX: 0.125, barY: 0.84, barZ: 0.3, gripX: 0.21, saddleZ: -0.1 };
function bike(g, { frame = '#e0463c' }) {
  const frameM = shiny(frame, { metalness: 0.3, roughness: 0.4 });
  const R = BIKE.wheel;
  const front = wheel(g, R, { z: 0.42, spokes: 8, width: 0.05 }), back = wheel(g, R, { z: -0.42, spokes: 8, width: 0.05 });
  const tube = (a, b, r = 0.028, mat = frameM, parent = g) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const m = add(parent, cyl(r, r, d.length(), 8), mat, { outline: false });
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  const bb = [0, BIKE.crankY, 0], seatTop = [0, 0.42, -0.07], head = [0, 0.62, 0.31];
  // the frame: a low step-through, forks, stem and swept-back cruiser bars
  tube(bb, seatTop);                                      // seat tube
  tube(bb, head, 0.032);                                  // down tube
  tube([0, 0.4, -0.06], [0, 0.6, 0.3], 0.024);            // top tube
  tube(bb, [0, R, -0.42], 0.02);                          // chain stays
  tube(seatTop, [0, R, -0.42], 0.02);                     // seat stays
  tube([0, 0.68, 0.32], [0, R, 0.42], 0.024);             // fork
  tube(head, [0, BIKE.barY, BIKE.barZ - 0.02], 0.022);    // stem
  tube([-BIKE.gripX, BIKE.barY, BIKE.barZ - 0.06], [0, BIKE.barY, BIKE.barZ], 0.018);
  tube([0, BIKE.barY, BIKE.barZ], [BIKE.gripX, BIKE.barY, BIKE.barZ - 0.06], 0.018);
  for (const s of [-1, 1]) add(g, cyl(0.026, 0.026, 0.09, 8), toon('#1d1b2e'), { p: [s * (BIKE.gripX + 0.03), BIKE.barY, BIKE.barZ - 0.07], r: [0, 0, Math.PI / 2], outline: false });
  // the saddle on a seat post, raised to suit whoever's riding
  const post = group(g, 0, 0, BIKE.saddleZ);
  const postTube = add(post, cyl(0.016, 0.016, 1, 6), shiny('#c0c6d4'), { outline: false });
  const saddle = group(post, 0, 0.6, 0);
  add(saddle, cap(0.055, 0.12), toon('#3a2a20'), { r: [Math.PI / 2, 0, 0], s: [1.6, 1, 0.55] });
  add(saddle, sph(0.07, 12, 8), toon('#3a2a20'), { p: [0, 0.0, -0.06], s: [1.5, 0.45, 1] });
  // lamp, basket, mudguards, chain and kickstand
  add(g, cone(0.04, 0.07, 10), basic('#fff6c9'), { p: [0, 0.7, 0.4], r: [Math.PI / 2, 0, 0], outline: false });
  add(g, box(0.2, 0.13, 0.15), toon('#c9955a'), { p: [0, 0.74, 0.44] });
  for (let k = 0; k < 3; k++) add(g, box(0.205, 0.008, 0.155), toon('#a8743f'), { p: [0, 0.7 + k * 0.035, 0.44], outline: false });
  for (const z of [0.42, -0.42]) add(g, geo('fender2', () => new THREE.TorusGeometry(R + 0.04, 0.025, 6, 20, Math.PI * 0.75)), shiny(frame, { metalness: 0.3 }), { p: [0, R, z], r: [0, Math.PI / 2, Math.PI * 0.12], outline: false });
  tube([0.06, BIKE.crankY + 0.06, 0], [0.06, R + 0.04, -0.42], 0.01, toon('#2b2f4a'));
  tube([0.06, BIKE.crankY - 0.06, 0], [0.06, R - 0.04, -0.42], 0.01, toon('#2b2f4a'));
  add(g, cyl(0.07, 0.07, 0.015, 18), toon('#2b2f4a'), { p: [0.06, BIKE.crankY, 0], r: [0, 0, Math.PI / 2], outline: false }); // chainring
  const stand = group(g, -0.07, BIKE.crankY + 0.02, -0.12);
  add(stand, cyl(0.013, 0.013, 0.3, 6), toon('#2b2f4a'), { p: [0, -0.15, 0], outline: false });
  // the crank: two arms half a turn apart, each with a pedal that stays level as it goes round
  const crank = group(g, 0, BIKE.crankY, 0);
  add(crank, cyl(0.03, 0.03, 0.26, 10), shiny('#c0c6d4'), { r: [0, 0, Math.PI / 2], outline: false });
  const pedals = [];
  for (const s of [-1, 1]) {
    const arm = group(crank, s * 0.1, 0, 0);
    arm.rotation.x = s > 0 ? 0 : Math.PI;
    add(arm, box(0.02, BIKE.crank, 0.025), shiny('#8d96a8'), { p: [0, -BIKE.crank / 2, 0], outline: false });
    const pedal = group(arm, s * (BIKE.pedalX - 0.1), -BIKE.crank, 0);
    add(pedal, box(0.08, 0.02, 0.06), toon('#1d1b2e'), { outline: false });
    pedals.push(pedal);
  }
  let roll = 0, crankA = 0;
  return {
    seat: 0.6, stance: 'pedal', speed: 1.75, crank,
    /** Raise the saddle for this rider's legs (thigh + shin length); returns how high their hips go. */
    fit(leg) {
      const low = BIKE.crankY - BIKE.crank, dz = -BIKE.saddleZ;
      // (never lower than the top of the frame: very short legs just reach for the pedals)
      const hip = Math.max(0.5, low + Math.sqrt(Math.max(0.01, (leg * 0.94) ** 2 - dz * dz)));
      saddle.position.y = hip - 0.06;
      postTube.scale.y = Math.max(0.05, saddle.position.y - 0.4);
      postTube.position.y = 0.4 + postTube.scale.y / 2;
      this.seat = hip;
      return hip;
    },
    /** Where pedal s (-1 the rider's right, 1 their left) and grip s are, in the bike's frame. */
    pedalAt(s, v) { const a = crankA + (s > 0 ? 0 : Math.PI); return v.set(s * BIKE.pedalX, BIKE.crankY - Math.cos(a) * BIKE.crank, -Math.sin(a) * BIKE.crank); },
    gripAt(s, v) { return v.set(s * (BIKE.gripX + 0.02), BIKE.barY + 0.02, BIKE.barZ - 0.07); },
    tick(t, dt, moving, speed = 1, ground = null) {
      // the wheels roll exactly as far as the bike goes; the cranks turn at a steady gear ratio
      const v = ground ?? (moving ? 7.5 * this.speed * speed : 0);
      roll += (dt * v) / R;
      front.rotation.x = back.rotation.x = roll;
      crankA = roll * 0.32;
      crank.rotation.x = crankA;
      for (const p of pedals) p.rotation.x = -crankA - p.parent.rotation.x; // (pedals stay flat)
      this.pedal = crankA;
      // the kickstand swings down when you stop, and the bike leans on it a little
      stand.rotation.z += ((moving ? -1.4 : -0.35) - stand.rotation.z) * Math.min(1, dt * 6);
      g.rotation.z += ((moving ? 0 : 0.05) - g.rotation.z) * Math.min(1, dt * 4);
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
    tick(t, dt, moving, speed = 1, ground = null) { roll += (dt * (ground ?? (moving ? 7.5 * this.speed * speed : 0))) / 0.09; fw.rotation.x = bw.rotation.x = roll; },
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
    tick(t, dt, moving, speed = 1, ground = null) {
      roll += (dt * (ground ?? (moving ? 7.5 * this.speed * speed : 0))) / 0.045;
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
    fit: m.fit?.bind(m), pedalAt: m.pedalAt?.bind(m), gripAt: m.gripAt?.bind(m),
    get seatY() { return m.seat; }, get pedal() { return m.pedal ?? 0; }, get bob() { return m.bob ?? 0; }, get hop() { return m.hop ?? 0; },
    set onStep(fn) { m.onStep = fn; }, set onTrick(fn) { m.onTrick = fn; }, set ridden(v) { m.ridden = v; },
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
