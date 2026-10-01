// Boats at Coral Cove: jet skis, speedboats, a fishing boat, a sailboat and a party pontoon, moored at
// the dock beside the pier. Walk up and press E to drive one (others can hop in as passengers); W/S
// for throttle, A/D to steer, E to hop off (onto the dock if you're alongside it, or into the sea).
// The driver sends the boat's position; everyone else follows it.
import * as THREE from 'three';
import { net } from '../../net.js';
import { S } from '../../state.js';
import { toon, shiny, basic, TAU } from '../../three/materials.js';
import { letterSign } from '../../three/signs3d.js';
import { add, box, cyl, sph, group, plank, stripeMat } from './common.js';
import { DOCK, DOCK2, DOCK_Y } from './pier.js';

export const BOAT_TYPES = {
  jetski: { name: 'Jet Ski', speed: 26, accel: 14, turn: 1.9, seats: [[0, 0.65, -0.1], [0, 0.65, -0.9]], len: 3, beam: 1.2 },
  speedboat: { name: 'Speedboat', speed: 22, accel: 9, turn: 1.3, seats: [[-0.5, 0.75, 0.6], [0.5, 0.75, 0.6], [-0.5, 0.75, -1.2], [0.5, 0.75, -1.2]], len: 6.5, beam: 2.4 },
  fishing: { name: 'Fishing Boat', speed: 13, accel: 5, turn: 1, seats: [[0, 0.95, 0.9], [-0.8, 0.95, -1.5], [0.8, 0.95, -1.5], [0, 0.95, -2.6]], len: 7.5, beam: 3, fishing: true },
  sail: { name: 'Sailboat', speed: 12, accel: 3.5, turn: 0.9, seats: [[0, 0.8, -2.2], [-0.7, 0.8, -1.2], [0.7, 0.8, -1.2]], len: 7, beam: 2.4 },
  pontoon: { name: 'Party Pontoon', speed: 10, accel: 3, turn: 0.8, seats: [[0, 1.15, 2.2], [-1.3, 1.15, 0.6], [1.3, 1.15, 0.6], [-1.3, 1.15, -1], [1.3, 1.15, -1], [0, 1.15, -2.4]], len: 8, beam: 3.6, fishing: true },
  banana: { name: 'Banana Boat', speed: 14, accel: 6, turn: 1.2, seats: [[0, 0.75, 1.4], [0, 0.75, 0.3], [0, 0.75, -0.8], [0, 0.75, -1.9]], len: 6, beam: 1.2 },
};
const FLEET = [
  ['js1', 'jetski', '#ff5d73'], ['js2', 'jetski', '#39c6ff'], ['js3', 'jetski', '#ffd84d'], ['js4', 'jetski', '#6ee7a0'],
  ['sb1', 'speedboat', '#ffffff'], ['sb2', 'speedboat', '#e0463c'], ['fb1', 'fishing', '#2f7fe0'], ['sl1', 'sail', '#ffffff'],
  ['pt1', 'pontoon', '#ff9f43'], ['bn1', 'banana', '#ffe14d'],
];

function buildHull(g, type, color) {
  const white = toon('#ffffff'), dark = toon('#23263f');
  const col = toon(color);
  if (type === 'jetski') {
    add(g, sph(1, 14, 10), col, { p: [0, 0.3, 0.2], s: [0.55, 0.35, 1.5], outline: true });
    add(g, box(0.7, 0.3, 1.6), dark, { p: [0, 0.55, -0.4], outline: true });
    add(g, box(0.5, 0.4, 0.3), col, { p: [0, 0.75, 0.7], outline: true });
    add(g, cyl(0.03, 0.03, 0.9, 6), toon('#8a8f9e'), { p: [0, 0.95, 0.75], r: [0, 0, Math.PI / 2] });
  } else if (type === 'speedboat') {
    add(g, box(2.4, 0.9, 5.4), white, { p: [0, 0.35, -0.3], outline: true });
    add(g, new THREE.ConeGeometry(1.2, 2.2, 4), white, { p: [0, 0.35, 3.4], r: [Math.PI / 2, Math.PI / 4, 0], s: [1.4, 1, 0.6], outline: true });
    add(g, box(2.45, 0.2, 5.5), col, { p: [0, 0.55, -0.3] });
    add(g, box(2, 0.6, 0.1), new THREE.MeshToonMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.6 }), { p: [0, 1.1, 1.3], r: [-0.4, 0, 0] });
    for (const z of [0.6, -1.2]) for (const x of [-0.5, 0.5]) add(g, box(0.7, 0.3, 0.7), toon('#f4f0ea'), { p: [x, 0.9, z] });
    add(g, box(0.7, 0.6, 0.5), dark, { p: [0, 0.55, -3.1], outline: true }); // outboard
  } else if (type === 'fishing') {
    add(g, box(3, 1.1, 6.4), col, { p: [0, 0.4, -0.3], outline: true });
    add(g, new THREE.ConeGeometry(1.5, 2, 4), col, { p: [0, 0.4, 3.9], r: [Math.PI / 2, Math.PI / 4, 0], s: [1.4, 1, 0.7], outline: true });
    add(g, box(3.05, 0.2, 6.5), white, { p: [0, 0.95, -0.3] });
    const cab = group(g, 0, 1, 1.4);
    add(cab, box(1.8, 1.6, 1.6), white, { p: [0, 0.8, 0], outline: true });
    add(cab, box(1.9, 0.15, 1.8), col, { p: [0, 1.65, 0] });
    add(cab, box(1.4, 0.6, 0.05), new THREE.MeshToonMaterial({ color: '#9fe6ff' }), { p: [0, 1.05, 0.82] });
    for (const x of [-1.2, 1.2]) add(g, cyl(0.03, 0.03, 2.4, 5), toon('#8b5a2b'), { p: [x, 2, -2], r: [0.5, 0, x > 0 ? -0.4 : 0.4] });
    add(g, cyl(0.06, 0.06, 3, 6), toon('#8a8f9e'), { p: [0, 3.2, 1.6] });
  } else if (type === 'sail') {
    add(g, box(2.2, 0.8, 5.6), white, { p: [0, 0.3, -0.2], outline: true });
    add(g, new THREE.ConeGeometry(1.1, 2, 4), white, { p: [0, 0.3, 3.4], r: [Math.PI / 2, Math.PI / 4, 0], s: [1.4, 1, 0.6], outline: true });
    add(g, box(2.25, 0.15, 5.7), toon('#2f7fe0'), { p: [0, 0.5, -0.2] });
    add(g, cyl(0.08, 0.1, 8, 8), toon('#c9955a'), { p: [0, 4.6, 0.6], outline: true });
    add(g, cyl(0.06, 0.06, 3.6, 6), toon('#c9955a'), { p: [0, 1.4, -1.1], r: [Math.PI / 2, 0, 0] });
    const sail = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 7), new THREE.Vector2(-3.4, 0)]);
    const sg = add(g, new THREE.ShapeGeometry(sail), new THREE.MeshToonMaterial({ color: '#fffaf0', side: THREE.DoubleSide, gradientMap: toon('#fff').gradientMap }), { p: [0, 1.2, 0.55], r: [0, Math.PI / 2, 0], outline: false });
    g.userData.sail = sg;
    const jib = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 6), new THREE.Vector2(2.6, 0)]);
    add(g, new THREE.ShapeGeometry(jib), stripeMat(color === '#ffffff' ? '#ff5d73' : color, '#ffffff', 2), { p: [0, 1.2, 0.7], r: [0, Math.PI / 2, 0] });
  } else if (type === 'pontoon') {
    for (const x of [-1.4, 1.4]) add(g, cyl(0.5, 0.5, 8, 12), toon('#c0c6d4'), { p: [x, 0.1, 0], r: [Math.PI / 2, 0, 0], outline: true });
    add(g, box(3.6, 0.2, 7.4), plank(2, 4, '#e8d2b0'), { p: [0, 0.7, 0], outline: true });
    for (const x of [-1.75, 1.75]) add(g, box(0.1, 0.8, 7), toon(color), { p: [x, 1.2, 0] });
    add(g, box(3.4, 0.1, 5), stripeMat(color, '#ffffff', 4), { p: [0, 3, -0.4] });
    for (const x of [-1.6, 1.6]) for (const z of [-2.8, 2]) add(g, cyl(0.05, 0.05, 2.3, 6), toon('#ffffff'), { p: [x, 1.9, z] });
    for (const x of [-1.3, 1.3]) add(g, box(0.8, 0.4, 3.6), toon('#ffffff'), { p: [x, 0.95, -0.2] });
    add(g, box(0.8, 0.9, 0.6), dark, { p: [0, 1.2, 2.6], outline: true });
  } else if (type === 'banana') {
    add(g, cyl(0.55, 0.55, 5.6, 14), col, { p: [0, 0.35, 0], r: [Math.PI / 2, 0, 0], outline: true });
    for (const s of [-1, 1]) add(g, sph(0.55, 12, 8), col, { p: [0, 0.35 + (s > 0 ? 0.25 : 0), s * 2.8], s: [1, 1, 1.4], outline: true });
    for (const x of [-0.9, 0.9]) add(g, cyl(0.3, 0.3, 4.4, 10), toon('#ff9f43'), { p: [x, 0.2, 0], r: [Math.PI / 2, 0, 0] });
    for (let k = 0; k < 4; k++) add(g, cyl(0.03, 0.03, 0.8, 5), toon('#2b2f4a'), { p: [0, 0.85, 1.4 - k * 1.1], r: [0, 0, Math.PI / 2] });
  }
}

export class Boats {
  constructor(root, { anim, isWater, solids }) {
    this.root = root;
    this.isWater = isWater;
    this.boats = new Map();
    this.ride = null; // { b, seat } while you're aboard
    // moored in two rows along the dock
    FLEET.forEach(([id, type, color], i) => {
      const t = BOAT_TYPES[type];
      const g = group(root);
      const hull = group(g);
      buildHull(hull, type, color);
      const wake = add(g, new THREE.PlaneGeometry(t.beam * 1.4, t.len * 1.6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }), { p: [0, 0.08, -t.len * 0.9], r: [-Math.PI / 2, 0, 0], cast: false });
      // moored in two rows along the outside of the marina dock, noses out to sea
      const row = i % 2, slot = Math.floor(i / 2);
      const x = DOCK2.x0 - 3 - t.beam / 2 - row * 9, z = DOCK2.z0 + 6 + slot * 13;
      const b = { id, type, t, g, hull, wake, x, z, h: 0, v: 0, driver: null, homeX: x, homeZ: z, sent: 0, tx: null, tz: null, th: null };
      this.boats.set(id, b);
    });
    anim.push((t, dt) => this.animate(t, dt));
  }

  /** Server state for a boat (its driver's position). */
  apply(id, m) {
    const b = this.boats.get(id);
    if (!b) return;
    b.driver = m.driver ?? null;
    if (b.driver === S.me) return;
    if (m.x != null) { b.tx = m.x; b.tz = m.z; b.th = m.h; b.v = m.v ?? 0; }
    if (this.ride?.b === b && !b.driver && this.ride.seat === 0) this.ride = null;
  }

  nearest(p, max = 4.5) {
    let best = null, bd = max;
    for (const b of this.boats.values()) {
      const d = Math.hypot(b.x - p.x, b.z - p.z) - b.t.len * 0.35;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Where seat `i` of boat b is in the world. */
  seatPos(b, i) {
    const [sx, sy, sz] = b.t.seats[Math.min(i, b.t.seats.length - 1)];
    const c = Math.cos(b.h), s = Math.sin(b.h);
    return { x: b.x + sx * c + sz * s, y: b.hull.position.y + sy, z: b.z - sx * s + sz * c, h: b.h };
  }

  board(b, taken) {
    // the driver's seat if it's free, otherwise the first empty passenger seat
    if (!b.driver) { net.send('boat_take', { id: b.id }); b.driver = S.me; this.ride = { b, seat: 0 }; return 0; }
    for (let i = 1; i < b.t.seats.length; i++) if (!taken(b.id, i)) { this.ride = { b, seat: i }; return i; }
    return -1;
  }

  leave() {
    const r = this.ride;
    if (!r) return null;
    if (r.seat === 0) { net.send('boat_leave', {}); r.b.driver = null; }
    this.ride = null;
    // step onto the dock if it's right there, otherwise into the sea beside the boat
    const b = r.b;
    for (const D of [DOCK2, DOCK]) {
      const dockX = Math.min(Math.max(b.x, D.x0 + 1), D.x1 - 1), dockZ = Math.min(Math.max(b.z, D.z0 + 1), D.z1 - 1);
      if (Math.hypot(dockX - b.x, dockZ - b.z) < b.t.beam + 12) return { x: dockX, z: dockZ };
    }
    return { x: b.x + Math.cos(b.h) * (b.t.beam / 2 + 1.2), z: b.z - Math.sin(b.h) * (b.t.beam / 2 + 1.2) };
  }

  /** Drive (only the driver calls this): keys = the held keys. */
  drive(dt, keys) {
    const r = this.ride;
    if (!r || r.seat !== 0) return;
    const b = r.b, t = b.t;
    const thr = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 0.5 : 0);
    const steer = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0);
    b.v += thr * t.accel * dt;
    b.v *= Math.max(0, 1 - (thr ? 0.35 : 0.9) * dt);
    b.v = Math.max(-t.speed * 0.3, Math.min(t.speed, b.v));
    b.h += steer * t.turn * dt * Math.min(1, 0.25 + Math.abs(b.v) / 6) * Math.sign(b.v || 1);
    const nx = b.x + Math.sin(b.h) * b.v * dt, nz = b.z + Math.cos(b.h) * b.v * dt;
    // boats stay in the water (and bounce off the pier and the shore)
    const ok = (x, z) => this.isWater(x, z, true) && this.isWater(x + Math.sin(b.h) * t.len * 0.45, z + Math.cos(b.h) * t.len * 0.45, true);
    if (ok(nx, nz)) { b.x = nx; b.z = nz; } else { b.v *= -0.3; }
    b.lean = -steer * Math.min(1, Math.abs(b.v) / t.speed) * (b.type === 'jetski' ? 0.35 : 0.12);
    const now = performance.now();
    if (now - b.sent > 70) { b.sent = now; net.send('boat', { id: b.id, x: b.x, z: b.z, h: b.h, v: b.v }); }
  }

  animate(t, dt) {
    for (const b of this.boats.values()) {
      if (b.driver !== S.me && b.tx != null) {
        b.x += (b.tx - b.x) * Math.min(1, dt * 8);
        b.z += (b.tz - b.z) * Math.min(1, dt * 8);
        b.h += Math.atan2(Math.sin(b.th - b.h), Math.cos(b.th - b.h)) * Math.min(1, dt * 8);
      }
      const speed = Math.abs(b.v);
      b.g.position.set(b.x, 0, b.z);
      b.g.rotation.y = b.h;
      // bobbing on the swell; the bow lifts at speed
      b.hull.position.y = Math.sin(t * 1.6 + b.homeX) * 0.12 - 0.05;
      b.hull.rotation.x = -Math.min(0.14, speed / 140) + Math.sin(t * 1.3 + b.homeZ) * 0.03;
      b.hull.rotation.z = (b.lean ?? 0) + Math.sin(t * 1.1 + b.homeX) * 0.04;
      b.wake.material.opacity = Math.min(0.55, speed / 20);
      b.wake.scale.y = 0.6 + Math.min(1.5, speed / 12);
      if (b.hull.userData.sail) b.hull.userData.sail.rotation.y = Math.PI / 2 + Math.sin(t * 0.5) * 0.08;
    }
  }
}
