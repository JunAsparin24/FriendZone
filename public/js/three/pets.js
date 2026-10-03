// Pets: little chibi animals that trot along next to their owner. Every pet is built from primitives
// with big heads, shiny eyes and rosy cheeks. build(id) returns { group, tick(t, dt, moving) }.
import * as THREE from 'three';
import { toon, basic, outlineMaterial, additive, glowTexture, flameTexture, canvasTexture, TAU } from './materials.js';

const OUT = outlineMaterial(0.018);

function add(parent, geo, mat, { p = [0, 0, 0], r = null, s = null, outline = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  if (s) m.scale.set(...(Array.isArray(s) ? s : [s, s, s]));
  m.castShadow = true;
  if (outline) m.add(new THREE.Mesh(geo, OUT));
  parent.add(m);
  return m;
}
const sph = (r, w = 18, h = 14) => new THREE.SphereGeometry(r, w, h);
const cyl = (a, b, h, n = 12) => new THREE.CylinderGeometry(a, b, h, n);
const cone = (r, h, n = 12) => new THREE.ConeGeometry(r, h, n);

/** Big glossy eyes + blush on a head facing +Z. */
function face(head, r, { spread = 0.36, y = 0.05, size = 0.2, color = '#1d1b2e', blush = '#ff8fab', mouth = true } = {}) {
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = add(head, sph(r * size, 14, 10), basic(color), { p: [s * r * spread, r * y, r * 0.86], s: [1, 1.15, 0.6], outline: false });
    add(e, sph(r * size * 0.42, 8, 6), basic('#ffffff'), { p: [r * size * 0.3, r * size * 0.35, r * size * 0.55], outline: false });
    add(e, sph(r * size * 0.18, 6, 4), basic('#ffffff'), { p: [-r * size * 0.3, -r * size * 0.3, r * size * 0.55], outline: false });
    eyes.push(e);
    if (blush) add(head, new THREE.CircleGeometry(r * 0.16, 14), basic(blush, { transparent: true, opacity: 0.6, depthWrite: false }), { p: [s * r * 0.6, -r * 0.18, r * 0.8], r: [0, s * 0.6, 0], outline: false });
  }
  if (mouth) add(head, new THREE.TorusGeometry(r * 0.09, r * 0.025, 6, 12, Math.PI), basic('#5a1f2a'), { p: [0, -r * 0.2, r * 0.97], r: [0, 0, Math.PI], outline: false });
  return eyes;
}

/** Four stubby legs under a body; returns them for the trotting animation. */
function legs(parent, mat, x, z, y, len = 0.18, r = 0.06) {
  return [[-x, -z], [x, -z], [-x, z], [x, z]].map(([lx, lz]) => {
    const pivot = new THREE.Group();
    pivot.position.set(lx, y, lz);
    pivot.userData.y0 = y;
    add(pivot, cyl(r, r * 0.9, len), mat, { p: [0, -len / 2, 0] });
    add(pivot, sph(r * 1.05, 10, 8), mat, { p: [0, -len, 0.01], s: [1, 0.7, 1.2], outline: false });
    parent.add(pivot);
    return pivot;
  });
}
// diagonal pairs swing together; each foot lifts as it swings forward, and settles back when you stop
const trot = (list, t, moving, speed = 14, amp = 0.6) => list.forEach((l, i) => {
  const s = Math.sin(t * speed + (i % 3 === 0 ? 0 : Math.PI));
  const goal = moving ? s * amp : 0;
  l.rotation.x += (goal - l.rotation.x) * (moving ? 1 : 0.2);
  l.position.y = (l.userData.y0 ?? l.position.y) + (moving ? Math.max(0, s) * 0.035 : 0);
});

let furTexB = null, furTexG = null;
/** Fur with fine pale hair streaks over a base colour (`dense`: how much of it is frosted). */
function grizzle(base, dense) {
  return canvasTexture(256, 128, (c) => {
    c.fillStyle = base; c.fillRect(0, 0, 256, 128);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1600; i++) {
      const x = rnd() * 256, y = rnd() * 128, top = 1 - y / 128; // (v runs top to bottom on a sphere)
      if (rnd() > dense + top * 0.5) continue;
      c.strokeStyle = `rgba(${160 + rnd() * 60},${160 + rnd() * 60},${165 + rnd() * 60},${0.2 + rnd() * 0.35})`;
      c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 3, y + 4 + rnd() * 5); c.stroke();
    }
  });
}
const BUILD = {
  pet_binturong(g0) {
    // shaggy grizzled fur: black with fine pale hair streaks, thicker frosting towards the top
    furTexB ??= grizzle('#17161b', 0.2);
    furTexG ??= grizzle('#48474e', 0.55);
    // a binturong (bearcat), a bit bigger than most pets: a long, low, arched body of shaggy black fur
    // frosted grey, a small head held low with a tapered snout, small amber eyes, little rounded ears with
    // long black tufts, a spray of long white whiskers, and a thick tail as long as its body that hangs
    // down and curls under at the tip
    const g = new THREE.Group();
    g.scale.setScalar(1.35);
    g0.add(g);
    const fur = toon('#17161b'), coat = new THREE.MeshToonMaterial({ map: furTexB, gradientMap: toon('#fff').gradientMap }), grey = toon('#2c2b31'), face0 = new THREE.MeshToonMaterial({ map: furTexG, gradientMap: toon('#fff').gradientMap }), white = basic('#f0f0f0');
    // the body: shoulders and hips humped, the back arched between them
    // one smooth, slightly arched body (shoulders and hips blended in), all in the grizzled coat
    add(g, sph(0.19, 24, 16), coat, { p: [0, 0.31, -0.03], s: [1, 0.98, 2.0] });
    add(g, sph(0.165, 24, 16), face0, { p: [0, 0.35, 0.15], s: [1.04, 1, 1.0], outline: false }); // shoulders (grey, like the head)
    add(g, sph(0.165, 24, 16), coat, { p: [0, 0.355, -0.19], s: [1.04, 1, 1.15], outline: false }); // hips
    const L = legs(g, fur, 0.11, 0.17, 0.22, 0.19, 0.06);
    for (const l of L) for (let k = -1; k <= 1; k++) add(l, cone(0.012, 0.05, 4), toon('#2a2420'), { p: [k * 0.025, -0.2, 0.06], r: [1.4, 0, 0], outline: false }); // claws
    L.slice(2).forEach((l) => l.traverse((o) => { if (o.isMesh && !o.userData.outline && o.material === fur) o.material = face0; }));
    L.slice(2).forEach((l) => add(l, sph(0.065, 8, 6), face0, { p: [0, -0.06, 0.02], s: [1, 1.4, 1], outline: false })); // frosted forelegs
    // the head: small, held low and forward, the snout tapering to a black nose
    const locks = [];
    const head = new THREE.Group();
    head.position.set(0, 0.34, 0.36);
    g.add(head);
    add(head, sph(0.14), face0, { s: [1.15, 0.95, 1.05] });
    
    add(head, cone(0.075, 0.16, 12), face0, { p: [0, -0.03, 0.15], r: [Math.PI / 2, 0, 0] });
    add(head, sph(0.03, 10, 8), toon('#0c0b0e'), { p: [0, -0.03, 0.23], s: [1.2, 0.9, 1] });
    for (const s of [-1, 1]) {
      // small amber eyes with dark pupils and a glint
      const e = add(head, sph(0.032, 12, 10), basic('#c8862a'), { p: [s * 0.062, 0.03, 0.112], s: [1, 0.9, 0.6], outline: false });
      add(e, sph(0.02, 8, 6), basic('#0c0806'), { p: [0, 0, 0.014], outline: false });
      add(e, sph(0.009, 6, 4), white, { p: [0.01, 0.011, 0.026], outline: false });
      add(head, sph(0.012, 6, 4), toon('#c8c6cc'), { p: [s * 0.055, 0.06, 0.1], s: [1.6, 0.6, 1], outline: false }); // pale brows
      // little rounded ears, rimmed pale, with long black tufts sweeping up and back
      add(head, sph(0.045, 10, 8), fur, { p: [s * 0.11, 0.1, -0.04], s: [1, 1, 0.55] });
      add(head, new THREE.TorusGeometry(0.04, 0.012, 6, 14), toon('#e8e6ea'), { p: [s * 0.11, 0.1, -0.02], outline: false });
      // long white whiskers fanning out from the snout
      for (let k = 0; k < 4; k++) add(head, cyl(0.0018, 0.0018, 0.26, 3), white, { p: [s * 0.13, -0.04 - k * 0.012, 0.12 - k * 0.01], r: [0, s * 0.35, s * (1.35 - k * 0.12)], outline: false });
    }
    // the tail: thick and bushy, as long as the body, lying back behind with the tip curling up
    const tail = new THREE.Group();
    tail.position.set(0, 0.36, -0.38);
    g.add(tail);
    const segs = [];
    let parent = tail;
    for (let i = 0; i < 16; i++) {
      const sg = new THREE.Group();
      sg.position.set(0, 0, i ? -0.05 : 0);
      parent.add(sg);
      const r = 0.12 - i * 0.0045;
      add(sg, sph(r, 12, 10), coat, { p: [0, 0, -0.04], s: [1, 1, 1.15] }); // (solid black: no stripes)

      segs.push(sg);
      parent = sg;
    }
    return (t, dt, m) => {
      trot(L, t, m, 10, 0.45);
      // the tail droops down behind and curls forward at the tip, swaying slowly
      segs.forEach((sg, i) => {
        sg.rotation.x = (i === 0 ? -0.5 : i < 9 ? 0.035 : 0.3) + Math.sin(t * 1.6 + i * 0.5) * 0.025; // (back and low, the tip curling up)
        sg.rotation.y = Math.sin(t * 1.2 - i * 0.45) * (m ? 0.05 : 0.1);
      });
      head.rotation.y = Math.sin(t * 0.6) * 0.3;
      head.rotation.x = 0.15 + Math.sin(t * 0.9) * 0.05; // (snuffling along, nose down)
      locks.forEach((l, i) => { l.rotation.x = Math.sin(t * 2.2 + i) * (m ? 0.25 : 0.1); });
    };
  },
  pet_ghost(g) {
    // a little arcade ghost: a dome with a wavy skirt, big eyes looking where it's going
    const body = toon('#ff5d8f'), white = basic('#ffffff'), blue = basic('#2a4bd7');
    const fly = new THREE.Group();
    g.add(fly);
    add(fly, new THREE.SphereGeometry(0.2, 20, 12, 0, TAU, 0, Math.PI / 2), body, { p: [0, 0.12, 0] });
    add(fly, cyl(0.2, 0.2, 0.12, 20, 1), body, { p: [0, 0.06, 0] });
    const skirt = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; skirt.push(add(fly, cone(0.06, 0.1, 6), body, { p: [Math.cos(a) * 0.15, -0.03, Math.sin(a) * 0.15], r: [Math.PI, 0, 0], outline: false })); }
    const pupils = [];
    for (const s of [-1, 1]) {
      add(fly, sph(0.06, 12, 10), white, { p: [s * 0.08, 0.17, 0.15], s: [1, 1.2, 0.6], outline: false });
      pupils.push(add(fly, sph(0.03, 10, 8), blue, { p: [s * 0.08, 0.17, 0.19], outline: false }));
    }
    return (t) => {
      fly.position.y = 0.55 + Math.sin(t * 2.5) * 0.08;
      skirt.forEach((c, k) => { c.position.y = -0.03 + Math.sin(t * 10 + k * 2) * 0.02; });
      pupils.forEach((p) => { p.position.x = Math.sign(p.position.x) * 0.08 + Math.sin(t * 0.8) * 0.02; });
    };
  },
  pet_invader(g) {
    // a pixel space invader built out of cubes, stomping between its two frames
    const m = toon('#6ee7a0');
    const fly = new THREE.Group();
    g.add(fly);
    const px = 0.05;
    const A = ['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'];
    const B = ['..X.....X..', 'X..X...X..X', 'X.XXXXXXX.X', 'XXX.XXX.XXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..X.....X..', '.X.......X.'];
    const frame = (rows) => {
      const f = new THREE.Group();
      rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') add(f, new THREE.BoxGeometry(px, px, px * 1.6), m, { p: [(x - 5) * px, (3.5 - y) * px, 0], outline: false }); }));
      fly.add(f);
      return f;
    };
    const fa = frame(A), fb = frame(B);
    return (t) => {
      fly.position.y = 0.5 + Math.abs(Math.sin(t * 3)) * 0.06;
      const on = Math.floor(t * 2.5) % 2 === 0;
      fa.visible = on;
      fb.visible = !on;
    };
  },
  pet_corgi(g) {
    const fur = toon('#e8944a'), light = toon('#fff3de');
    add(g, sph(0.19), fur, { p: [0, 0.24, -0.05], s: [1, 0.8, 1.45] });
    add(g, sph(0.14), light, { p: [0, 0.2, 0.06], s: [0.9, 0.7, 1.1], outline: false });
    const L = legs(g, fur, 0.1, 0.15, 0.16, 0.12, 0.05);
    const head = add(g, sph(0.2), fur, { p: [0, 0.45, 0.17] });
    add(head, sph(0.1), light, { p: [0, -0.07, 0.15], s: [1.2, 0.8, 1] });
    add(head, sph(0.035, 10, 8), toon('#2a1a12'), { p: [0, -0.03, 0.25], outline: false });
    const ears = [-1, 1].map((s) => add(head, cone(0.08, 0.18, 4), fur, { p: [s * 0.12, 0.2, 0], r: [0, 0, -s * 0.3] }));
    face(head, 0.2, { spread: 0.36, y: 0.15, size: 0.18 });
    const tail = add(g, sph(0.06, 10, 8), light, { p: [0, 0.3, -0.32] });
    return (t, dt, m) => { trot(L, t, m, 18, 0.7); tail.position.x = Math.sin(t * 16) * 0.04; ears.forEach((e, i) => { e.rotation.x = Math.sin(t * 4 + i) * 0.1; }); };
  },
  pet_turtle(g) {
    const skin = toon('#8fcf7a'), shell = toon('#5a8f3a'), rim = toon('#d9b26a');
    add(g, new THREE.SphereGeometry(0.24, 18, 10, 0, TAU, 0, Math.PI / 2), shell, { p: [0, 0.2, 0], s: [1, 0.6, 1.1] });
    add(g, cyl(0.24, 0.24, 0.05, 20), rim, { p: [0, 0.13, 0], s: [1, 1, 1.1] });
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; add(g, cyl(0.06, 0.06, 0.02, 6), toon('#4a7a2e'), { p: [Math.cos(a) * 0.12, 0.33, Math.sin(a) * 0.13], r: [-0.3, 0, 0], outline: false }); }
    const L = legs(g, skin, 0.15, 0.13, 0.12, 0.09, 0.05);
    const head = add(g, sph(0.11), skin, { p: [0, 0.2, 0.3] });
    face(head, 0.11, { spread: 0.4, y: 0.2, size: 0.22, blush: null });
    return (t, dt, m) => { trot(L, t, m, 8, 0.4); head.position.z = 0.3 + Math.sin(t * 1.4) * 0.03; };
  },
  pet_owl(g) {
    const fur = toon('#a07850'), light = toon('#f4e3c0'), beak = toon('#ffb13b');
    const body = add(g, sph(0.22), fur, { p: [0, 0.35, 0], s: [1, 1.1, 0.95] });
    add(body, sph(0.15), light, { p: [0, -0.04, 0.12], s: [1, 1.1, 0.5], outline: false });
    for (const s of [-1, 1]) {
      add(g, cone(0.05, 0.12, 4), fur, { p: [s * 0.13, 0.62, 0], r: [0, 0, -s * 0.3] });
      add(g, sph(0.08, 14, 10), basic('#ffffff'), { p: [s * 0.09, 0.42, 0.18], s: [1, 1, 0.4], outline: false });
      add(g, sph(0.045, 10, 8), basic('#1d1b2e'), { p: [s * 0.09, 0.42, 0.21], s: [1, 1, 0.4], outline: false });
      add(g, sph(0.035, 8, 6), beak, { p: [s * 0.06, 0.12, 0.08], s: [1, 0.5, 1.4], outline: false });
    }
    add(g, cone(0.03, 0.07, 6), beak, { p: [0, 0.37, 0.22], r: [Math.PI / 2 + 0.4, 0, 0], outline: false });
    const wings = [-1, 1].map((s) => add(g, sph(0.1), fur, { p: [s * 0.2, 0.36, -0.02], s: [0.4, 1.1, 0.9] }));
    return (t, dt, m) => { wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (m ? 0.3 + Math.sin(t * 20) * 0.4 : 0.05); }); g.rotation.y = Math.sin(t * 0.8) * 0.2; };
  },
  pet_koala(g) {
    const fur = toon('#9a9aa8'), light = toon('#e8e8f0'), nose = toon('#2b2f4a');
    add(g, sph(0.2), fur, { p: [0, 0.27, -0.03], s: [1, 1, 1.05] });
    add(g, sph(0.13), light, { p: [0, 0.24, 0.1], s: [1, 1.1, 0.5], outline: false });
    const L = legs(g, fur, 0.1, 0.1, 0.18, 0.13, 0.06);
    const head = add(g, sph(0.21), fur, { p: [0, 0.52, 0.07] });
    for (const s of [-1, 1]) { add(head, sph(0.11), fur, { p: [s * 0.2, 0.1, -0.02], s: [1, 1, 0.5] }); add(head, sph(0.07), light, { p: [s * 0.2, 0.1, 0.02], s: [1, 1, 0.4], outline: false }); }
    add(head, sph(0.06), nose, { p: [0, -0.03, 0.2], s: [0.8, 1.2, 0.7], outline: false });
    face(head, 0.21, { spread: 0.38, y: 0.2, size: 0.15 });
    return (t, dt, m) => { trot(L, t, m, 10, 0.5); head.rotation.z = Math.sin(t * 1.2) * 0.1; };
  },
  pet_redpanda(g) {
    const fur = toon('#d0602a'), dark = toon('#3a1f14'), light = toon('#fff3de');
    add(g, sph(0.18), fur, { p: [0, 0.26, -0.05], s: [1, 0.85, 1.35] });
    const L = legs(g, dark, 0.09, 0.13, 0.19, 0.15, 0.05);
    const head = add(g, sph(0.2), fur, { p: [0, 0.48, 0.14], s: [1.1, 0.95, 1] });
    add(head, sph(0.09), light, { p: [0, -0.06, 0.15], s: [1.4, 0.8, 0.8] });
    for (const s of [-1, 1]) { add(head, cone(0.07, 0.12, 5), fur, { p: [s * 0.15, 0.17, 0], r: [0, 0, -s * 0.4] }); add(head, sph(0.05, 8, 6), light, { p: [s * 0.12, 0.05, 0.15], s: [1, 0.7, 0.4], outline: false }); }
    face(head, 0.2, { spread: 0.36, y: 0.12, size: 0.17 });
    const tail = new THREE.Group();
    tail.position.set(0, 0.3, -0.25);
    g.add(tail);
    for (let i = 0; i < 6; i++) add(tail, sph(0.07 - i * 0.004, 10, 8), i % 2 ? light : fur, { p: [0, i * 0.04, -i * 0.05], outline: false });
    return (t, dt, m) => { trot(L, t, m); tail.rotation.x = -0.2 + Math.sin(t * 2) * 0.25; tail.rotation.z = Math.sin(t * 1.5) * 0.3; };
  },
  pet_bee(g) {
    const yellow = toon('#ffd23f'), black = toon('#1d1b2e'), wing = basic('#dff4ff', { transparent: true, opacity: 0.7, depthWrite: false });
    const body = new THREE.Group();
    g.add(body);
    add(body, sph(0.17), yellow, { p: [0, 0, 0], s: [1, 0.95, 1.25] });
    for (const z of [-0.06, 0.08]) add(body, cyl(0.172, 0.172, 0.05, 18), black, { p: [0, 0, z], r: [Math.PI / 2, 0, 0], outline: false });
    add(body, cone(0.04, 0.08, 8), black, { p: [0, 0, -0.24], r: [-Math.PI / 2, 0, 0], outline: false });
    const head = add(body, sph(0.12), yellow, { p: [0, 0.04, 0.2] });
    face(head, 0.12, { spread: 0.4, y: 0.1, size: 0.22 });
    for (const s of [-1, 1]) add(head, cyl(0.006, 0.006, 0.12, 4), black, { p: [s * 0.05, 0.13, 0.02], r: [0.3, 0, -s * 0.3], outline: false });
    const wings = [-1, 1].map((s) => add(body, sph(0.1, 12, 8), wing, { p: [s * 0.13, 0.15, -0.02], s: [1.2, 0.3, 0.7], outline: false }));
    return (t) => { body.position.y = 0.6 + Math.sin(t * 3) * 0.06; wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (0.3 + Math.sin(t * 50) * 0.4); }); };
  },
  pet_jellyfish(g) {
    const bell = toon('#ff9fe0', { transparent: true, opacity: 0.85 }), glow = additive(glowTexture, 0xff7ad8, 0.5);
    const body = new THREE.Group();
    g.add(body);
    add(body, new THREE.SphereGeometry(0.2, 18, 12, 0, TAU, 0, Math.PI / 2), bell, { p: [0, 0, 0] });
    const tent = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; tent.push(add(body, cyl(0.015, 0.008, 0.3, 5), toon('#ffc0ee'), { p: [Math.cos(a) * 0.12, -0.15, Math.sin(a) * 0.12], outline: false })); }
    const s = new THREE.Sprite(glow);
    s.scale.setScalar(0.7);
    body.add(s);
    face(body, 0.2, { spread: 0.36, y: 0.25, size: 0.16 });
    return (t) => { body.position.y = 0.7 + Math.sin(t * 2) * 0.08; body.scale.y = 1 + Math.sin(t * 4) * 0.08; tent.forEach((tn, k) => { tn.rotation.x = Math.sin(t * 3 + k) * 0.3; }); };
  },
  pet_phoenix(g, A) {
    const red = toon('#ff5a2a'), gold = toon('#ffc53d'), beak = toon('#ffe080');
    const body = new THREE.Group();
    g.add(body);
    add(body, sph(0.17), red, { p: [0, 0, 0], s: [1, 1, 1.2] });
    add(body, sph(0.1), gold, { p: [0, -0.03, 0.1], s: [1, 1.1, 0.5], outline: false });
    const head = add(body, sph(0.12), red, { p: [0, 0.16, 0.14] });
    add(head, cone(0.03, 0.08, 6), beak, { p: [0, -0.01, 0.13], r: [Math.PI / 2, 0, 0], outline: false });
    for (let k = -1; k <= 1; k++) add(head, cone(0.025, 0.12, 5), gold, { p: [k * 0.04, 0.13, -0.03], r: [-0.4, 0, k * 0.4], outline: false });
    face(head, 0.12, { spread: 0.42, y: 0.15, size: 0.2, blush: null, mouth: false });
    const wings = [-1, 1].map((s) => { const w = add(body, sph(0.13, 12, 8), gold, { p: [s * 0.18, 0.05, -0.02], s: [1.4, 0.25, 0.8] }); return w; });
    const tail = [];
    for (let k = -1; k <= 1; k++) tail.push(add(body, cone(0.05, 0.3, 6), k ? gold : red, { p: [k * 0.06, -0.02, -0.28], r: [-Math.PI / 2 - 0.3, 0, k * 0.3] }));
    const flames = [];
    for (let k = 0; k < 3; k++) { const f = new THREE.Sprite(additive(flameTexture, 0xff8a2a, 0.85)); f.scale.set(0.18, 0.3, 1); body.add(f); flames.push(f); }
    return (t) => {
      body.position.y = 0.75 + Math.sin(t * 2.4) * 0.07;
      wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * Math.sin(t * 8) * 0.6; });
      flames.forEach((f, k) => { f.position.set((k - 1) * 0.06, -0.05 + Math.sin(t * 9 + k) * 0.02, -0.42 - (k % 2) * 0.05); f.scale.y = 0.26 + Math.sin(t * 13 + k) * 0.05; });
    };
  },
  pet_puppy(g, A) {
    const fur = toon('#e8b778'), light = toon('#fff3de'), dark = toon('#8b5a2b');
    const body = add(g, sph(0.2), fur, { p: [0, 0.28, -0.05], s: [1, 0.9, 1.25] });
    add(body, sph(0.15), light, { p: [0, -0.04, 0.06], s: [0.9, 0.8, 1], outline: false });
    const L = legs(g, fur, 0.1, 0.12, 0.2);
    const head = add(g, sph(0.22), fur, { p: [0, 0.55, 0.12] });
    add(head, sph(0.1), light, { p: [0, -0.07, 0.17], s: [1.2, 0.8, 0.9] });
    add(head, sph(0.04, 10, 8), toon('#2a1a12'), { p: [0, -0.03, 0.26], outline: false });
    const ears = [-1, 1].map((s) => add(head, sph(0.09), dark, { p: [s * 0.2, 0.02, -0.02], s: [0.6, 1.4, 0.4], r: [0, 0, s * 0.25] }));
    face(head, 0.22, { spread: 0.34, y: 0.15, size: 0.18 });
    const tail = add(g, cyl(0.03, 0.02, 0.18, 8), fur, { p: [0, 0.38, -0.3], r: [-0.8, 0, 0] });
    return (t, dt, m) => { trot(L, t, m); tail.rotation.z = Math.sin(t * 14) * 0.6; ears.forEach((e, i) => { e.rotation.x = Math.sin(t * 3 + i) * 0.15; }); head.rotation.z = Math.sin(t * 1.6) * 0.08; };
  },
  pet_kitten(g) {
    const fur = toon('#b9b3c9'), stripe = toon('#8e86a6'), pink = toon('#ffb3c7');
    add(g, sph(0.18), fur, { p: [0, 0.26, -0.05], s: [1, 0.9, 1.3] });
    const L = legs(g, fur, 0.09, 0.12, 0.2, 0.17, 0.05);
    const head = add(g, sph(0.22), fur, { p: [0, 0.52, 0.1], s: [1.1, 0.95, 1] });
    for (const s of [-1, 1]) {
      add(head, cone(0.08, 0.16, 4), fur, { p: [s * 0.14, 0.2, 0], r: [0, 0, -s * 0.3] });
      add(head, cone(0.045, 0.1, 4), pink, { p: [s * 0.14, 0.19, 0.03], r: [0, 0, -s * 0.3], outline: false });
      for (const k of [-1, 1]) add(head, cyl(0.004, 0.004, 0.16, 4), basic('#4a4458'), { p: [s * 0.2, -0.05 + k * 0.025, 0.18], r: [0, 0, Math.PI / 2 + k * 0.15], outline: false });
    }
    add(head, sph(0.025, 8, 6), pink, { p: [0, -0.05, 0.22], outline: false });
    add(head, new THREE.BoxGeometry(0.03, 0.08, 0.02), stripe, { p: [0, 0.16, 0.18], outline: false });
    face(head, 0.22, { spread: 0.34, y: 0.1, size: 0.19, color: '#2f9e44' });
    const tail = new THREE.Group();
    tail.position.set(0, 0.3, -0.26);
    g.add(tail);
    for (let i = 0; i < 5; i++) add(tail, sph(0.035, 8, 6), i % 2 ? stripe : fur, { p: [0, i * 0.05, -i * 0.03], outline: false });
    return (t, dt, m) => { trot(L, t, m); tail.rotation.x = -0.3 + Math.sin(t * 2) * 0.3; tail.rotation.z = Math.sin(t * 1.3) * 0.4; };
  },
  pet_bunny(g) {
    const fur = toon('#fffaf5'), pink = toon('#ffb3c7');
    const body = add(g, sph(0.19), fur, { p: [0, 0.22, -0.02], s: [1, 0.95, 1.1] });
    add(g, sph(0.08), fur, { p: [0, 0.22, -0.22] });
    const head = add(g, sph(0.2), fur, { p: [0, 0.45, 0.1] });
    const ears = [-1, 1].map((s) => {
      const ear = new THREE.Group();
      ear.position.set(s * 0.08, 0.16, -0.02);
      head.add(ear);
      add(ear, sph(0.06), fur, { p: [0, 0.14, 0], s: [0.8, 2.4, 0.5] });
      add(ear, sph(0.035), pink, { p: [0, 0.14, 0.02], s: [0.8, 2.6, 0.4], outline: false });
      return ear;
    });
    add(head, sph(0.03, 8, 6), pink, { p: [0, -0.02, 0.2], outline: false });
    face(head, 0.2, { spread: 0.38, y: 0.12, size: 0.2 });
    return (t, dt, m) => {
      const hop = m ? Math.abs(Math.sin(t * 8)) : 0;
      body.parent.position.y = hop * 0.15;
      ears.forEach((e, i) => { e.rotation.z = (i ? -1 : 1) * (0.15 + hop * 0.3 + Math.sin(t * 2 + i) * 0.05); });
    };
  },
  pet_duck(g) {
    const yellow = toon('#ffd84d'), orange = toon('#ff9f43');
    const body = add(g, sph(0.2), yellow, { p: [0, 0.22, -0.02], s: [1, 0.85, 1.25] });
    const wings = [-1, 1].map((s) => add(body, sph(0.1), yellow, { p: [s * 0.18, 0.02, -0.02], s: [0.4, 0.8, 1.2] }));
    const head = add(g, sph(0.16), yellow, { p: [0, 0.46, 0.1] });
    add(head, sph(0.08), orange, { p: [0, -0.04, 0.15], s: [1.2, 0.45, 1.1] });
    add(head, cone(0.03, 0.1, 6), yellow, { p: [0, 0.17, -0.02], r: [-0.4, 0, 0], outline: false });
    face(head, 0.16, { spread: 0.42, y: 0.25, size: 0.2, mouth: false });
    const feet = [-1, 1].map((s) => add(g, sph(0.06), orange, { p: [s * 0.08, 0.02, 0.05], s: [1, 0.3, 1.4] }));
    return (t, dt, m) => {
      g.children[0].rotation.z = m ? Math.sin(t * 10) * 0.12 : 0;
      wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (Math.sin(t * (m ? 16 : 3)) * 0.2); });
      feet.forEach((f, i) => { f.position.z = 0.05 + (m ? Math.sin(t * 10 + i * Math.PI) * 0.06 : 0); });
    };
  },
  pet_hamster(g) {
    const fur = toon('#f2b36a'), cream = toon('#fff3de'), pink = toon('#ffb3c7');
    const body = add(g, sph(0.24), fur, { p: [0, 0.22, 0], s: [1.1, 0.9, 1.1] });
    add(body, sph(0.18), cream, { p: [0, -0.04, 0.1], s: [1, 0.9, 0.8], outline: false });
    for (const s of [-1, 1]) {
      add(body, sph(0.06), fur, { p: [s * 0.14, 0.2, 0], s: [1, 1, 0.5] });
      add(body, sph(0.035), pink, { p: [s * 0.14, 0.2, 0.02], s: [1, 1, 0.4], outline: false });
      add(body, sph(0.08), cream, { p: [s * 0.16, -0.02, 0.18], s: [1, 0.8, 0.7], outline: false }); // puffy cheeks
    }
    add(body, sph(0.025, 8, 6), pink, { p: [0, 0.03, 0.26], outline: false });
    face(body, 0.24, { spread: 0.3, y: 0.18, size: 0.15 });
    return (t, dt, m) => { body.position.y = 0.22 + (m ? Math.abs(Math.sin(t * 12)) * 0.05 : Math.sin(t * 3) * 0.01); body.scale.x = 1.1 + Math.sin(t * 5) * 0.02; };
  },
  pet_frog(g) {
    const green = toon('#6ee7a0'), belly = toon('#d9ffe8');
    const body = add(g, sph(0.22), green, { p: [0, 0.18, 0], s: [1.2, 0.8, 1.1] });
    add(body, sph(0.16), belly, { p: [0, -0.04, 0.1], s: [1.1, 0.7, 0.8], outline: false });
    for (const s of [-1, 1]) {
      const eyeball = add(body, sph(0.09), green, { p: [s * 0.12, 0.2, 0.05] });
      add(eyeball, sph(0.06), basic('#ffffff'), { p: [0, 0.01, 0.05], outline: false });
      add(eyeball, sph(0.035), basic('#1d1b2e'), { p: [0, 0.01, 0.1], outline: false });
      add(g, sph(0.07), green, { p: [s * 0.2, 0.04, 0.15], s: [1.3, 0.4, 1.5] });
    }
    add(body, new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), basic('#2f6e4a'), { p: [0, 0.02, 0.2], r: [0, 0, Math.PI], outline: false });
    for (const s of [-1, 1]) add(body, new THREE.CircleGeometry(0.035, 12), basic('#ff8fab', { transparent: true, opacity: 0.6 }), { p: [s * 0.16, 0.04, 0.2], outline: false });
    return (t, dt, m) => {
      const hop = m ? Math.max(0, Math.sin(t * 7)) : 0;
      body.position.y = 0.18 + hop * 0.22;
      body.scale.y = 0.8 + Math.sin(t * 4) * 0.03 + hop * 0.1;
    };
  },
  pet_penguin(g) {
    const black = toon('#23263f'), white = toon('#ffffff'), orange = toon('#ff9f43');
    const body = add(g, sph(0.2), black, { p: [0, 0.3, 0], s: [1, 1.3, 0.95] });
    add(body, sph(0.16), white, { p: [0, -0.03, 0.08], s: [0.9, 1.2, 0.8], outline: false });
    const flippers = [-1, 1].map((s) => add(body, sph(0.07), black, { p: [s * 0.19, 0, 0], s: [0.4, 1.4, 0.8], r: [0, 0, s * 0.3] }));
    const head = add(body, sph(0.16), black, { p: [0, 0.26, 0.02], s: [1, 0.8, 1] });
    add(head, sph(0.12), white, { p: [0, -0.02, 0.06], s: [1.1, 0.9, 0.85], outline: false });
    add(head, cone(0.04, 0.08, 8), orange, { p: [0, -0.02, 0.17], r: [Math.PI / 2, 0, 0], outline: false });
    // small white eye patches so the dark eyes still show up against the black head
    for (const sx of [-1, 1]) add(head, sph(0.032, 14, 10), white, { p: [sx * 0.058, 0.045, 0.145], s: [1, 1.15, 0.5], outline: false });
    face(head, 0.2, { spread: 0.29, y: 0.23, size: 0.105, mouth: false });
    for (const s of [-1, 1]) add(g, sph(0.05), orange, { p: [s * 0.08, 0.02, 0.06], s: [1, 0.35, 1.5] });
    return (t, dt, m) => { body.rotation.z = m ? Math.sin(t * 9) * 0.18 : Math.sin(t * 1.5) * 0.04; flippers.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * (0.3 + Math.abs(Math.sin(t * (m ? 9 : 2))) * 0.4); }); };
  },
  pet_panda(g) {
    const white = toon('#fffaf5'), black = toon('#23263f');
    add(g, sph(0.22), white, { p: [0, 0.26, -0.04], s: [1.05, 0.95, 1.15] });
    const L = legs(g, black, 0.11, 0.12, 0.2, 0.16, 0.07);
    const head = add(g, sph(0.24), white, { p: [0, 0.56, 0.1] });
    for (const s of [-1, 1]) {
      add(head, sph(0.08), black, { p: [s * 0.18, 0.18, -0.02], s: [1, 1, 0.6] });
      add(head, sph(0.075), black, { p: [s * 0.09, 0.03, 0.18], s: [0.8, 1.1, 0.5], r: [0, 0, s * 0.5], outline: false });
    }
    add(head, sph(0.035, 8, 6), black, { p: [0, -0.06, 0.23], s: [1.3, 0.8, 1], outline: false });
    face(head, 0.24, { spread: 0.36, y: 0.12, size: 0.15 });
    return (t, dt, m) => { trot(L, t, m, 10, 0.4); head.rotation.z = Math.sin(t * 1.2) * 0.1; };
  },
  pet_fox(g) {
    const orange = toon('#ff8a3d'), white = toon('#fff6ea'), dark = toon('#3a2410');
    add(g, sph(0.18), orange, { p: [0, 0.27, -0.06], s: [0.95, 0.85, 1.35] });
    const L = legs(g, dark, 0.08, 0.13, 0.2, 0.18, 0.045);
    const head = add(g, sph(0.2), orange, { p: [0, 0.52, 0.12] });
    add(head, cone(0.1, 0.18, 12), white, { p: [0, -0.06, 0.2], r: [Math.PI / 2, 0, 0] });
    add(head, sph(0.03, 8, 6), dark, { p: [0, -0.06, 0.3], outline: false });
    for (const s of [-1, 1]) {
      add(head, cone(0.08, 0.2, 4), orange, { p: [s * 0.12, 0.2, -0.02], r: [0, 0, -s * 0.25] });
      add(head, cone(0.04, 0.1, 4), dark, { p: [s * 0.12, 0.26, 0.01], r: [0, 0, -s * 0.25], outline: false });
    }
    face(head, 0.2, { spread: 0.4, y: 0.18, size: 0.18, color: '#3a2410' });
    const tail = new THREE.Group();
    tail.position.set(0, 0.32, -0.28);
    g.add(tail);
    add(tail, sph(0.1), orange, { p: [0, 0.05, -0.1], s: [0.9, 0.9, 1.7] });
    add(tail, sph(0.06), white, { p: [0, 0.07, -0.26], outline: false });
    return (t, dt, m) => { trot(L, t, m); tail.rotation.y = Math.sin(t * 3) * 0.4; };
  },
  pet_capybara(g) {
    const fur = toon('#a8764a'), dark = toon('#6e4a2e'), nose = toon('#3a2616');
    const body = add(g, sph(0.22), fur, { p: [0, 0.3, -0.06], s: [1, 0.88, 1.45] });
    add(body, sph(0.16), toon('#bf8c5c'), { p: [0, -0.07, 0.04], s: [0.95, 0.7, 1.15], outline: false }); // lighter belly
    const L = legs(g, dark, 0.12, 0.16, 0.2, 0.14, 0.055);
    const head = new THREE.Group();
    head.position.set(0, 0.48, 0.24);
    g.add(head);
    add(head, sph(0.17), fur, { s: [0.95, 0.9, 1.25] }); // long, boxy capybara head
    add(head, sph(0.12), dark, { p: [0, -0.04, 0.17], s: [1.05, 0.85, 0.75] }); // big square snout
    for (const s of [-1, 1]) {
      add(head, sph(0.018, 8, 6), nose, { p: [s * 0.045, 0.0, 0.26], outline: false }); // nostrils
      add(head, sph(0.045, 10, 8), dark, { p: [s * 0.11, 0.13, -0.08], s: [1, 0.8, 0.55] }); // tiny round ears
    }
    // sleepy, content eyes: dark ovals with heavy lids that droop further while it rests
    const lids = [];
    for (const s of [-1, 1]) {
      const eye = add(head, sph(0.03, 12, 8), basic('#1d1b2e'), { p: [s * 0.12, 0.06, 0.1], s: [1, 0.9, 0.6], outline: false });
      add(eye, sph(0.009, 6, 4), basic('#ffffff'), { p: [0.009, 0.01, 0.022], outline: false }); // tiny sparkle
      lids.push(add(head, new THREE.SphereGeometry(0.034, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), fur, { p: [s * 0.12, 0.062, 0.1], s: [1.05, 1, 0.75], outline: false }));
      add(head, new THREE.CircleGeometry(0.03, 12), basic('#ff8fab', { transparent: true, opacity: 0.5, depthWrite: false }), { p: [s * 0.14, -0.01, 0.13], r: [0, s * 0.7, 0], outline: false });
    }
    // the famous mandarin on its head, with a little leaf
    const orange = new THREE.Group();
    orange.position.set(0, 0.16, -0.01);
    head.add(orange);
    add(orange, sph(0.065, 14, 10), toon('#ff9a2e'), { p: [0, 0.05, 0], s: [1, 0.85, 1] });
    add(orange, cyl(0.006, 0.006, 0.025, 5), toon('#6b4226'), { p: [0, 0.11, 0], outline: false });
    add(orange, sph(0.03, 8, 6), toon('#4caf50'), { p: [0.025, 0.115, 0], s: [1.4, 0.3, 0.8], r: [0, 0, -0.4], outline: false });
    const tail = add(body, sph(0.03, 8, 6), dark, { p: [0, 0.05, -0.22], outline: false });
    let rest = 0;
    return (t, dt, m) => {
      trot(L, t, m, 8, 0.4); // an unhurried waddle
      g.rotation.z = m ? Math.sin(t * 8) * 0.04 : 0;
      head.rotation.x = m ? Math.sin(t * 8) * 0.05 : Math.sin(t * 0.8) * 0.04 + 0.05;
      orange.rotation.z = Math.sin(t * (m ? 8 : 1.2)) * (m ? 0.12 : 0.05);
      // eyes relax the longer it stands still; a slow, blissful blink now and then
      rest = m ? Math.max(0, rest - dt * 3) : Math.min(1, rest + dt * 0.5);
      const blink = Math.max(0, Math.sin(t * 0.9) - 0.94) * 16;
      lids.forEach((l) => { l.rotation.x = -0.2 + Math.min(1, 0.35 + rest * 0.35 + blink) * 1.2; });
      tail.position.y = 0.05 + Math.sin(t * 2) * 0.005;
    };
  },
  pet_giraffe(g) {
    const yellow = toon('#ffd36b'), spot = toon('#c9803a'), dark = toon('#6b4226'), light = toon('#fff1c9');
    const body = add(g, sph(0.2), yellow, { p: [0, 0.42, -0.04], s: [0.95, 0.85, 1.25] });
    [[0.12, 0.08, 0.05], [-0.13, 0.05, -0.08], [0.02, 0.15, -0.14], [-0.05, -0.02, 0.15], [0.14, -0.04, -0.12], [-0.15, 0.1, 0.08]].forEach(([x, y, z]) => {
      add(body, sph(0.05, 10, 8), spot, { p: [x, y, z], s: [1, 1, 0.4], outline: false });
    });
    const L = legs(g, yellow, 0.1, 0.13, 0.36, 0.34, 0.045);
    L.forEach((l) => add(l, sph(0.05, 8, 6), dark, { p: [0, -0.34, 0.01], s: [1, 0.6, 1.2], outline: false }));
    const neck = new THREE.Group();
    neck.position.set(0, 0.52, 0.12);
    g.add(neck);
    add(neck, cyl(0.065, 0.09, 0.5), yellow, { p: [0, 0.22, 0.05], r: [0.2, 0, 0] });
    [[0.05, 0.1], [-0.05, 0.25], [0.04, 0.38]].forEach(([x, y]) => add(neck, sph(0.035, 8, 6), spot, { p: [x, y, 0.1 + y * 0.1], s: [1, 1, 0.4], outline: false }));
    const head = add(neck, sph(0.16), yellow, { p: [0, 0.52, 0.14], s: [1, 0.95, 1.05] });
    add(head, sph(0.1), light, { p: [0, -0.07, 0.12], s: [1.1, 0.8, 0.9] });
    for (const s of [-1, 1]) {
      add(head, cyl(0.02, 0.025, 0.12, 8), dark, { p: [s * 0.06, 0.18, -0.02] }); // ossicones
      add(head, sph(0.032, 8, 6), dark, { p: [s * 0.06, 0.25, -0.02] });
      add(head, sph(0.05), yellow, { p: [s * 0.16, 0.06, -0.02], s: [1.3, 0.6, 0.6], r: [0, 0, s * 0.4] });
      add(head, sph(0.012, 6, 4), dark, { p: [s * 0.04, -0.07, 0.21], outline: false });
    }
    face(head, 0.16, { spread: 0.44, y: 0.2, size: 0.2 });
    const tail = add(g, cyl(0.012, 0.012, 0.2, 6), yellow, { p: [0, 0.42, -0.28], r: [0.4, 0, 0] });
    add(tail, sph(0.03, 8, 6), dark, { p: [0, -0.1, 0], outline: false });
    return (t, dt, m) => {
      trot(L, t, m, 9, 0.45);
      neck.rotation.x = Math.sin(t * 1.3) * 0.08 + (m ? Math.sin(t * 9) * 0.05 : 0);
      neck.rotation.z = Math.sin(t * 0.9) * 0.06;
      tail.rotation.z = Math.sin(t * 4) * 0.4;
    };
  },
  pet_axolotl(g) {
    const pink = toon('#ffb3d1'), deep = toon('#ff6fb5');
    const body = add(g, sph(0.16), pink, { p: [0, 0.18, -0.05], s: [0.9, 0.8, 1.5] });
    const head = add(g, sph(0.2), pink, { p: [0, 0.26, 0.2], s: [1.2, 0.85, 0.95] });
    const gills = [];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      gills.push(add(head, sph(0.04, 8, 6), deep, { p: [s * (0.21 + i * 0.02), 0.06 + (i - 1) * 0.07, -0.04], s: [1.8, 0.7, 0.7], r: [0, 0, s * (0.5 - i * 0.5)] }));
    }
    face(head, 0.2, { spread: 0.45, y: 0.1, size: 0.14, blush: '#ff6fb5' });
    const tail = add(body, cone(0.08, 0.3, 8), pink, { p: [0, 0.02, -0.26], r: [-Math.PI / 2, 0, 0], s: [0.4, 1, 1] });
    const L = legs(g, pink, 0.12, 0.1, 0.1, 0.08, 0.035);
    return (t, dt, m) => { trot(L, t, m, 12, 0.7); tail.rotation.y = Math.sin(t * (m ? 10 : 3)) * 0.4; gills.forEach((gl, i) => { gl.scale.x = 1.8 + Math.sin(t * 4 + i) * 0.3; }); };
  },
  pet_unicorn(g, A) {
    const white = toon('#fffaff'), gold = toon('#ffc53d', { emissive: '#7a5200', emissiveIntensity: 0.3 });
    const mane = ['#ff8fc7', '#ffd84d', '#6ee7a0', '#39c6ff', '#b77bff'];
    add(g, sph(0.2), white, { p: [0, 0.4, -0.04], s: [0.95, 0.85, 1.3] });
    const L = legs(g, white, 0.1, 0.13, 0.34, 0.3, 0.05);
    L.forEach((l) => add(l, cyl(0.055, 0.055, 0.05, 10), toon('#b77bff'), { p: [0, -0.29, 0] }));
    const head = add(g, sph(0.19), white, { p: [0, 0.68, 0.16], s: [1, 1, 1.05] });
    add(head, sph(0.11), toon('#ffe4f2'), { p: [0, -0.08, 0.14], s: [1.1, 0.8, 0.9], outline: false });
    add(head, cone(0.035, 0.24, 10), gold, { p: [0, 0.24, 0.07], r: [0.35, 0, 0] });
    for (const s of [-1, 1]) add(head, cone(0.045, 0.1, 6), white, { p: [s * 0.1, 0.18, -0.03], r: [0, 0, -s * 0.3] });
    mane.forEach((c, i) => add(head, sph(0.06, 10, 8), toon(c), { p: [0, 0.16 - i * 0.07, -0.12 - i * 0.02], outline: false }));
    face(head, 0.19, { spread: 0.4, y: 0.16, size: 0.2, color: '#5b2a86' });
    const tail = new THREE.Group();
    tail.position.set(0, 0.44, -0.28);
    g.add(tail);
    mane.forEach((c, i) => add(tail, sph(0.05, 10, 8), toon(c), { p: [0, -i * 0.05, -i * 0.03], outline: false }));
    const sparkle = new THREE.Sprite(additive(glowTexture, 0xffe8ff, 0.6));
    sparkle.scale.setScalar(0.5);
    g.add(sparkle);
    return (t, dt, m) => {
      trot(L, t, m, 9, 0.5);
      tail.rotation.x = Math.sin(t * 3) * 0.3;
      const a = t * 2;
      sparkle.position.set(Math.cos(a) * 0.35, 0.6 + Math.sin(t * 3) * 0.15, Math.sin(a) * 0.35);
      sparkle.material.opacity = 0.3 + Math.abs(Math.sin(t * 4)) * 0.5;
    };
  },
  pet_snake(g) {
    // a chubby green snake: a chain of body segments that slithers side to side in a wave, with a
    // diamond pattern down its back, a flicking forked tongue and a little rattle-free tail tip
    const green = toon('#4cc66a'), belly = toon('#e8f5b0'), spot = toon('#2e8b4a');
    const segs = [];
    const N = 11;
    for (let i = 0; i < N; i++) {
      const r = 0.085 - Math.pow(i / N, 1.6) * 0.06;
      const seg = new THREE.Group();
      g.add(seg);
      add(seg, sph(r, 14, 10), green, { s: [1, 0.85, 1.25] });
      add(seg, sph(r * 0.8, 10, 8), belly, { p: [0, -r * 0.35, 0], s: [1, 0.5, 1.2], outline: false });
      if (i % 2 === 0 && i < N - 1) add(seg, sph(r * 0.45, 8, 6), spot, { p: [0, r * 0.72, 0], s: [1, 0.4, 1.3], r: [0, Math.PI / 4, 0], outline: false });
      segs.push({ seg, r, z: -0.06 - i * 0.075 });
    }
    const head = add(g, sph(0.12), green, { p: [0, 0.14, 0.08], s: [1.05, 0.8, 1.2] });
    add(head, sph(0.09), belly, { p: [0, -0.05, 0.04], s: [1, 0.5, 1.1], outline: false });
    face(head, 0.12, { spread: 0.48, y: 0.3, size: 0.24, blush: '#ff8fab', mouth: false });
    const tongue = new THREE.Group();
    tongue.position.set(0, -0.03, 0.13);
    head.add(tongue);
    add(tongue, cyl(0.008, 0.008, 0.08, 5), basic('#ff4d6d'), { p: [0, 0, 0.04], r: [Math.PI / 2, 0, 0], outline: false });
    for (const sx of [-1, 1]) add(tongue, cyl(0.006, 0.006, 0.035, 5), basic('#ff4d6d'), { p: [sx * 0.01, 0, 0.09], r: [Math.PI / 2, 0, sx * 0.5], outline: false });
    let flick = 0;
    return (t, dt, m) => {
      const speed = m ? 9 : 2.2, amp = m ? 0.09 : 0.04;
      segs.forEach(({ seg, r, z }, i) => {
        seg.position.set(Math.sin(t * speed - i * 0.75) * amp * Math.min(1, i / 2 + 0.3), r * 0.85, z);
      });
      head.position.x = Math.sin(t * speed + 0.75) * amp * 0.5;
      head.position.y = 0.14 + (m ? 0 : Math.sin(t * 1.3) * 0.03);
      head.rotation.y = Math.sin(t * speed + 0.3) * 0.25;
      flick = Math.max(0, flick - (dt || 0.016) * 4);
      if (Math.random() < (dt || 0.016) * 0.7) flick = 1;
      tongue.scale.set(1, 1, Math.sin(flick * Math.PI) * 1.2 + 0.001);
    };
  },
  pet_dragon(g) {
    const purple = toon('#9d7bff'), belly = toon('#ffe4b5'), wingMat = toon('#ff8fc7', { side: THREE.DoubleSide });
    const fly = new THREE.Group();
    g.add(fly);
    add(fly, sph(0.18), purple, { p: [0, 0, 0], s: [0.9, 1, 1.1] });
    add(fly, sph(0.13), belly, { p: [0, -0.02, 0.08], s: [0.9, 1, 0.8], outline: false });
    const head = add(fly, sph(0.18), purple, { p: [0, 0.24, 0.08] });
    add(head, sph(0.09), belly, { p: [0, -0.06, 0.14], s: [1.2, 0.7, 0.9], outline: false });
    for (const s of [-1, 1]) {
      add(head, cone(0.035, 0.12, 8), toon('#fff3de'), { p: [s * 0.08, 0.17, -0.02], r: [-0.3, 0, -s * 0.2] });
      add(head, sph(0.012, 6, 4), basic('#5b2a86'), { p: [s * 0.04, -0.05, 0.22], outline: false });
    }
    face(head, 0.18, { spread: 0.4, y: 0.16, size: 0.2 });
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.3, 0.14); shape.lineTo(0.26, -0.02); shape.lineTo(0.18, 0.02); shape.lineTo(0.12, -0.08); shape.closePath();
    const wingGeo = new THREE.ShapeGeometry(shape);
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Group();
      w.position.set(s * 0.1, 0.06, -0.08);
      add(w, wingGeo, wingMat, { s: [s, 1, 1], r: [0, s * 0.3, 0], outline: false });
      fly.add(w);
      return w;
    });
    const tail = add(fly, cone(0.06, 0.26, 8), purple, { p: [0, -0.1, -0.2], r: [-2.2, 0, 0] });
    return (t) => {
      fly.position.y = 0.75 + Math.sin(t * 3) * 0.1;
      wings.forEach((w, i) => { w.rotation.y = (i ? -1 : 1) * (0.3 + Math.sin(t * 14) * 0.5); });
      tail.rotation.z = Math.sin(t * 3) * 0.3;
    };
  },
};

/** A pet ready to add to a character: { group, tick }. Returns null for no pet / unknown ids. */
export function buildPet(id) {
  const make = BUILD[id];
  if (!make) return null;
  const group = new THREE.Group();
  const model = new THREE.Group();
  group.add(model);
  const inner = make(model) ?? (() => {});
  model.traverse((o) => { if (o.isMesh && !o.userData.outline) o.castShadow = true; });
  // a shared layer of life on top of each pet's own animation: a bouncy gait that leans into the
  // run and trails a little behind you, then an idle look-around and the odd happy hop when you stop
  let w = 0, phase = 0, hopAt = 3 + Math.random() * 4, hop = 0;
  const tick = (t, dt, moving) => {
    const step = Math.min(dt || 0, 0.05);
    w += ((moving ? 1 : 0) - w) * Math.min(1, step * 6);
    phase += step * 13 * w;
    const bounce = Math.abs(Math.sin(phase));
    if (!moving && (hopAt -= step) <= 0) { hop = 1; hopAt = 4 + Math.random() * 6; }
    hop = Math.max(0, hop - step * 2.2);
    const hopY = Math.sin(hop * Math.PI) * 0.18;
    model.position.set(Math.sin(phase * 0.5) * 0.03 * w, bounce * 0.07 * w + hopY, -0.3 * w);
    model.rotation.set(0.14 * w + Math.sin(phase * 2) * 0.03 * w - hopY * 0.6, Math.sin(t * 0.45) * 0.35 * (1 - w), Math.sin(phase) * 0.06 * w);
    const squash = 1 - (1 - bounce) * 0.06 * w + hopY * 0.3;
    model.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    inner(t, step, moving);
  };
  return { group, tick };
}
