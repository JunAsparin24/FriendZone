// 3D chibi characters built from primitives, with every cosmetic from cosmetics.json.
// The character stands at the origin facing +Z; it is ~1.95 units tall.
import * as THREE from 'three';
import {
  TAU, toon, basic, shiny, outlineMaterial, canvasTexture,
  additive, starTexture, heartTexture, flameTexture, glowTexture,
} from './materials.js';

export const DEFAULT_LOOK = {
  skin: '#f6c9a0', hairColor: '#2b1d14', topColor: '#39c6ff', bottomColor: '#23263f',
  hair: 'hair_short', top: 'top_tee', hat: 'hat_none', face: 'face_none', back: 'back_none', aura: 'aura_none',
};

const R = 0.42; // head radius
const OUT = outlineMaterial(0.02);
const OUT_THIN = outlineMaterial(0.012);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

const TOPS = {
  top_tee: { sleeve: 'short' },
  top_tank: { sleeve: 'none' },
  top_hoodie: { sleeve: 'long', hood: true },
  top_hawaiian: { sleeve: 'short' },
  top_jersey: { sleeve: 'short' },
  top_suit: { sleeve: 'long', color: '#23263f' },
  top_racing: { sleeve: 'long', color: '#f4f4f4' },
  top_armor: { sleeve: 'long', color: '#aab3c5', metal: true },
  top_robe: { sleeve: 'long', color: '#5b2a86', robe: true },
};
const COVERING_HATS = new Set(['hat_cap', 'hat_beanie', 'hat_cowboy', 'hat_bucket', 'hat_tophat', 'hat_viking',
  'hat_wizard', 'hat_helmet', 'hat_robin', 'hat_party', 'hat_crown']);
const TALL_HAIR = new Set(['hair_spiky', 'hair_mohawk', 'hair_bun', 'hair_afro']);

// ---------------------------------------------------------------------------
// geometry cache + helpers
// ---------------------------------------------------------------------------

const geoCache = new Map();
const geo = (key, make) => {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
};
const sphere = (r, w = 24, h = 18) => geo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h));
const capsule = (r, l) => geo(`c${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 18));
const cyl = (rt, rb, h, seg = 24, open = false) => geo(`y${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
const cone = (r, h, seg = 18) => geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const torus = (r, t, arc = TAU, rs = 10, ts = 40) => geo(`t${r},${t},${arc},${rs},${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const dome = (r, len = Math.PI / 2) => geo(`d${r},${len}`, () => new THREE.SphereGeometry(r, 32, 16, 0, TAU, 0, len));
const circle = (r) => geo(`o${r}`, () => new THREE.CircleGeometry(r, 20));

function tint(hex, k) {
  const c = new THREE.Color(hex);
  if (k < 1) c.multiplyScalar(k);
  else c.lerp(new THREE.Color('#ffffff'), k - 1);
  return `#${c.getHexString()}`;
}

/** Add a mesh to parent. opts: p (position), s (scale), r (euler), q (quaternion), outline, shadow. */
function part(parent, geometry, material, { p = [0, 0, 0], s = 1, r = null, q = null, outline = OUT, shadow = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...p);
  if (Array.isArray(s)) m.scale.set(...s); else m.scale.setScalar(s);
  if (q) m.quaternion.copy(q);
  else if (r) m.rotation.set(...r);
  m.castShadow = shadow;
  if (outline) {
    const o = new THREE.Mesh(geometry, outline);
    o.userData.outline = true;
    m.add(o);
  }
  parent.add(m);
  return m;
}

const pointTo = (dir) => new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize());
const faceTo = (dir) => new THREE.Quaternion().setFromUnitVectors(Z, dir.clone().normalize());
/** Point on the head surface above (x, y) on the face side. */
const onFace = (x, y, lift = 0) => {
  const z = Math.sqrt(Math.max(0, R * R - x * x - y * y));
  return new THREE.Vector3(x, y, z).setLength(R + lift);
};

/** A tapered, curved tube made of short cylinders (horns, feathers). */
function taper(parent, points, r0, r1, mat) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const t0 = i / (points.length - 1), t1 = (i + 1) / (points.length - 1);
    const ra = r0 + (r1 - r0) * t0, rb = r0 + (r1 - r0) * t1;
    const dir = b.clone().sub(a);
    const seg = part(parent, cyl(Math.max(0.004, rb), ra, dir.length(), 12), mat, { outline: OUT_THIN });
    seg.position.copy(a).add(b).multiplyScalar(0.5);
    seg.quaternion.copy(pointTo(dir));
    if (i > 0) part(parent, sphere(ra, 10, 8), mat, { p: [a.x, a.y, a.z], outline: null });
  }
}

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------

const stripeTexture = canvasTexture(128, 128, (ctx) => {
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ffd84d' : '#ff5dac';
    ctx.fillRect(0, i * 16, 128, 16);
  }
});
const jerseyNumber = canvasTexture(128, 128, (ctx) => {
  ctx.font = '900 96px Rubik, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('7', 64, 70);
});
const rainbowMaterial = (() => {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  return m;
})();
function rainbowRing(radius) {
  return geo(`rainbow${radius}`, () => {
    const g = new THREE.TorusGeometry(radius, 0.03, 8, 120);
    const colors = [];
    const pos = g.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getY(i), pos.getX(i));
      c.setHSL(((a / TAU) + 1) % 1, 0.9, 0.6);
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  });
}

// ---------------------------------------------------------------------------
// hair
// ---------------------------------------------------------------------------

function hairCap(head, mat, { len = 1.35, tilt = -0.35, opacityMat = null } = {}) {
  return part(head, dome(R + 0.035, len), opacityMat ?? mat, { r: [tilt, 0, 0], outline: opacityMat ? null : OUT });
}
function fringe(head, mat, count = 4) {
  for (let i = 0; i < count; i++) {
    const x = -0.22 + (i * 0.44) / (count - 1);
    const p = onFace(x, 0.24, -0.02);
    part(head, sphere(0.13, 16, 12), mat, { p: [p.x, p.y, p.z], s: [1.15, 0.55, 0.6], q: faceTo(p), outline: OUT_THIN });
  }
}

const HAIR = {
  hair_short(head, mat) { hairCap(head, mat); fringe(head, mat); },
  hair_spiky(head, mat) {
    hairCap(head, mat);
    const dirs = [[0, 1, 0.15], [0.5, 0.85, 0.15], [-0.5, 0.85, 0.15], [0.35, 0.75, -0.5], [-0.35, 0.75, -0.5], [0, 0.65, -0.75],
      [0.78, 0.55, -0.2], [-0.78, 0.55, -0.2], [0.22, 0.85, 0.5], [-0.26, 0.85, 0.45]];
    for (const d of dirs) {
      const v = new THREE.Vector3(...d).normalize();
      part(head, cone(0.11, 0.34, 10), mat, { p: v.clone().multiplyScalar(R + 0.12).toArray(), q: pointTo(v), outline: OUT_THIN });
    }
    fringe(head, mat);
  },
  hair_long(head, mat) {
    hairCap(head, mat, { len: 1.5 });
    part(head, capsule(0.34, 0.34), mat, { p: [0, -0.3, -0.2], s: [1.05, 1, 0.5] });
    for (const s of [-1, 1]) part(head, capsule(0.1, 0.36), mat, { p: [s * 0.36, -0.22, 0.02], r: [0, 0, s * 0.08] });
    fringe(head, mat);
  },
  hair_ponytail(head, mat) {
    hairCap(head, mat);
    part(head, sphere(0.065), toon('#ff5d73'), { p: [0, 0.08, -0.45] });
    part(head, capsule(0.11, 0.34), mat, { p: [0, -0.2, -0.55], r: [0.35, 0, 0] });
    fringe(head, mat);
  },
  hair_bun(head, mat) {
    hairCap(head, mat);
    part(head, sphere(0.18), mat, { p: [0, 0.4, -0.18] });
    fringe(head, mat, 3);
  },
  hair_curly(head, mat) {
    hairCap(head, mat, { len: 1.3 });
    for (let th = 0.2; th < 1.75; th += 0.3) {
      for (let ph = 0; ph < TAU; ph += 0.55 / Math.max(0.35, Math.sin(th))) {
        const v = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
        if (v.z > 0.45 && v.y < 0.72) continue;
        part(head, sphere(0.12, 12, 10), mat, { p: v.multiplyScalar(R + 0.03).toArray(), outline: null });
      }
    }
  },
  hair_afro(head, mat) {
    const g = geo('afro', () => new THREE.SphereGeometry(0.64, 32, 24, Math.PI / 2 + 0.85, TAU - 1.7));
    part(head, g, toon(mat.color.getStyle(), { side: THREE.DoubleSide }), { p: [0, 0.14, -0.06] });
    for (let i = 0; i < 5; i++) {
      const p = onFace(-0.26 + i * 0.13, 0.27, 0.02);
      part(head, sphere(0.1, 12, 10), mat, { p: p.toArray(), outline: null });
    }
  },
  hair_mohawk(head, mat) {
    hairCap(head, mat, { opacityMat: toon(mat.color.getStyle(), { transparent: true, opacity: 0.35 }) });
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + i * 0.36;
      const v = new THREE.Vector3(0, Math.cos(a), -Math.sin(a));
      part(head, cone(0.12, 0.42, 4), mat, { p: v.clone().multiplyScalar(R + 0.12).toArray(), q: pointTo(v), s: [0.45, 1, 1], outline: OUT_THIN });
    }
  },
  hair_none(head, mat) {
    hairCap(head, mat, { len: 1.4, opacityMat: toon(mat.color.getStyle(), { transparent: true, opacity: 0.3 }) });
  },
};

// ---------------------------------------------------------------------------
// hats (in head space; top of the head is y = R)
// ---------------------------------------------------------------------------

const HATS = {
  hat_cap(head, L) {
    const m = toon(L.topColor);
    part(head, dome(R + 0.05), m, { p: [0, 0.04, 0], s: [1, 0.85, 1] });
    part(head, cyl(0.3, 0.3, 0.035, 28), toon(tint(L.topColor, 0.8)), { p: [0, 0.14, 0.36], s: [1, 1, 0.85], r: [0.12, 0, 0] });
    part(head, sphere(0.045), toon(tint(L.topColor, 1.3)), { p: [0, R + 0.02, 0] });
  },
  hat_beanie(head, L) {
    const c = tint(L.topColor, 0.85);
    part(head, dome(R + 0.06, Math.PI / 2 + 0.1), toon(c), { s: [1, 1.12, 1] });
    part(head, torus(R + 0.05, 0.06), toon(tint(L.topColor, 1.25)), { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0] });
    part(head, sphere(0.11), toon('#ffffff'), { p: [0, R + 0.2, 0] });
  },
  hat_headphones(head) {
    part(head, torus(R + 0.07, 0.035, Math.PI), toon('#2b2f4a'), { outline: OUT_THIN });
    for (const s of [-1, 1]) part(head, cyl(0.13, 0.13, 0.1), toon('#ff5d73'), { p: [s * (R + 0.04), 0, 0], r: [0, 0, Math.PI / 2] });
  },
  hat_party(head) {
    const m = new THREE.MeshToonMaterial({ map: stripeTexture, gradientMap: toon('#fff').gradientMap });
    part(head, cone(0.2, 0.58, 24), m, { p: [0.05, R + 0.26, 0], r: [0, 0, -0.18] });
    part(head, sphere(0.08), toon('#ffd84d'), { p: [0.14, R + 0.56, 0] });
  },
  hat_cat(head, L) {
    for (const s of [-1, 1]) {
      part(head, cone(0.13, 0.28, 16), toon(L.hairColor), { p: [s * 0.24, R - 0.02, 0.02], r: [0, 0, -s * 0.4] });
      part(head, cone(0.07, 0.18, 12), toon('#ff9fb4'), { p: [s * 0.23, R - 0.03, 0.07], r: [0, 0, -s * 0.4], outline: null });
    }
  },
  hat_cowboy(head) {
    const brown = toon('#8b5a2b', { side: THREE.DoubleSide });
    const brim = geo('cowboyBrim', () => new THREE.LatheGeometry([0.28, 0.62, 0.72, 0.78].map((x, i) => new THREE.Vector2(x, [0, 0, 0.06, 0.14][i])), 40));
    part(head, brim, brown, { p: [0, 0.27, 0], outline: OUT_THIN });
    part(head, cyl(0.26, 0.31, 0.32), toon('#8b5a2b'), { p: [0, 0.43, 0] });
    part(head, cyl(0.315, 0.315, 0.06), toon('#4a2e1c'), { p: [0, 0.31, 0], outline: null });
  },
  hat_bucket(head) {
    const khaki = toon('#c9b27a', { side: THREE.DoubleSide });
    const brim = geo('bucketBrim', () => new THREE.LatheGeometry([0.36, 0.5, 0.58].map((x, i) => new THREE.Vector2(x, [0, -0.07, -0.13][i])), 40));
    part(head, brim, khaki, { p: [0, 0.28, 0], outline: OUT_THIN });
    part(head, cyl(0.3, 0.38, 0.3), toon('#c9b27a'), { p: [0, 0.43, 0] });
    part(head, sphere(0.05), toon('#ff9f43'), { p: [0, 0.43, 0.35], s: [1.5, 0.8, 0.5], outline: null });
  },
  hat_robin(head) {
    part(head, cone(0.36, 0.8, 20), toon('#2f9e44'), { p: [0, 0.3, -0.12], r: [-1.2, 0, 0], s: [1, 1, 0.55] });
    const pts = [new THREE.Vector3(-0.2, 0.42, -0.05), new THREE.Vector3(-0.28, 0.62, -0.2), new THREE.Vector3(-0.3, 0.8, -0.42), new THREE.Vector3(-0.26, 0.9, -0.62)];
    taper(head, pts, 0.04, 0.01, toon('#e0463c'));
  },
  hat_helmet(head) {
    part(head, geo('helmetShell', () => new THREE.SphereGeometry(R + 0.09, 32, 20, 0, TAU, 0, 2.05)), toon('#e0463c'));
    part(head, torus(R + 0.095, 0.035, Math.PI), toon('#ffffff'), { r: [0, Math.PI / 2, 0], outline: null });
    const visor = geo('visor', () => new THREE.SphereGeometry(R + 0.1, 24, 10, Math.PI / 2 + 0.95, -1.9, 1.2, 0.62));
    part(head, visor, shiny('#1a2a4a', { transparent: true, opacity: 0.88, side: THREE.DoubleSide }), { outline: null });
  },
  hat_viking(head) {
    part(head, dome(R + 0.05), toon('#9aa3b5'));
    part(head, torus(R + 0.05, 0.045), toon('#b8860b'), { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0] });
    for (const s of [-1, 1]) {
      const pts = [[0.36, 0.18, 0], [0.55, 0.28, 0], [0.68, 0.48, 0], [0.7, 0.68, 0]].map(([x, y, z]) => new THREE.Vector3(s * x, y, z));
      taper(head, pts, 0.08, 0.012, toon('#f4ecd8'));
    }
  },
  hat_tophat(head) {
    part(head, cyl(0.44, 0.44, 0.035, 36), toon('#1d1b2e'), { p: [0, 0.32, 0] });
    part(head, cyl(0.27, 0.29, 0.56, 32), toon('#1d1b2e'), { p: [0, 0.62, 0] });
    part(head, cyl(0.295, 0.295, 0.09, 32), toon('#e0463c'), { p: [0, 0.4, 0], outline: null });
  },
  hat_wizard(head) {
    const purple = toon('#5b3fb5');
    part(head, cyl(0.58, 0.58, 0.03, 40), toon('#4a2f9a'), { p: [0, 0.3, 0] });
    part(head, cyl(0.2, 0.36, 0.42, 28), purple, { p: [0, 0.52, 0] });
    part(head, cyl(0.09, 0.2, 0.34, 24), purple, { p: [-0.06, 0.86, -0.03], r: [0.2, 0, 0.3] });
    part(head, cone(0.09, 0.3, 20), purple, { p: [-0.2, 1.08, -0.1], r: [0.5, 0, 0.9] });
    const star = part(head, geo('star', () => new THREE.OctahedronGeometry(0.07)), basic('#ffe066'), { p: [0.02, 0.6, 0.33], outline: null });
    star.userData.spin = true;
  },
  hat_halo(head, L, anim) {
    const halo = new THREE.Group();
    part(halo, torus(0.27, 0.035, TAU, 12, 48), basic('#ffe27a'), { r: [Math.PI / 2, 0, 0], outline: null, shadow: false });
    const glow = new THREE.Sprite(additive(glowTexture, 0xffd84d, 0.55));
    glow.scale.set(0.9, 0.35, 1);
    halo.add(glow);
    halo.position.y = R + 0.3;
    head.add(halo);
    anim.push((t) => { halo.position.y = R + 0.3 + Math.sin(t * 2.2) * 0.04; halo.rotation.y = t * 0.8; });
  },
  hat_horns(head, L, anim) {
    const stone = toon('#8d8aa6');
    const tips = [];
    for (const s of [-1, 1]) {
      const pts = [[0.24, 0.3, 0.02], [0.4, 0.44, 0.02], [0.5, 0.62, -0.02], [0.46, 0.8, -0.08]].map(([x, y, z]) => new THREE.Vector3(s * x, y, z));
      taper(head, pts, 0.085, 0.02, stone);
      const tip = part(head, sphere(0.035, 10, 8), basic('#ffb45a'), { p: [s * 0.46, 0.8, -0.08], outline: null, shadow: false });
      const glow = new THREE.Sprite(additive(glowTexture, 0xff9a3a, 0.7));
      glow.scale.setScalar(0.3);
      tip.add(glow);
      tips.push(glow);
    }
    anim.push((t) => tips.forEach((g, i) => { g.material.opacity = 0.45 + Math.sin(t * 3 + i) * 0.25; }));
  },
  hat_crown(head) {
    const gold = shiny('#ffc53d', { metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide });
    part(head, cyl(0.31, 0.29, 0.16, 32, true), gold, { p: [0, 0.4, 0], outline: OUT_THIN });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      part(head, cone(0.07, 0.2, 10), gold, { p: [Math.sin(a) * 0.3, 0.56, Math.cos(a) * 0.3], outline: null });
    }
    ['#e0463c', '#39c6ff', '#6ee7a0'].forEach((c, i) => {
      const a = (i - 1) * 0.6;
      part(head, sphere(0.04, 12, 10), shiny(c, { metalness: 0.2 }), { p: [Math.sin(a) * 0.31, 0.4, Math.cos(a) * 0.31], outline: null });
    });
  },
};

// ---------------------------------------------------------------------------
// face items
// ---------------------------------------------------------------------------

const EYE_X = 0.15, EYE_Y = 0.02;
const FACES = {
  face_glasses(head) {
    const m = toon('#1d1b2e');
    for (const s of [-1, 1]) {
      const p = onFace(s * EYE_X, EYE_Y, 0.035);
      part(head, torus(0.1, 0.014, TAU, 8, 28), m, { p: p.toArray(), q: faceTo(p), outline: null });
    }
    part(head, cyl(0.012, 0.012, 0.1, 6), m, { p: [0, EYE_Y + 0.01, R + 0.02], r: [0, 0, Math.PI / 2], outline: null });
  },
  face_sunglasses(head) {
    const m = shiny('#141220', { metalness: 0.4, roughness: 0.15 });
    for (const s of [-1, 1]) {
      const p = onFace(s * EYE_X, EYE_Y, 0.03);
      part(head, box(0.2, 0.13, 0.04), m, { p: p.toArray(), q: faceTo(p), outline: OUT_THIN });
    }
    part(head, box(0.1, 0.03, 0.03), m, { p: [0, EYE_Y + 0.03, R + 0.02], outline: null });
    for (const s of [-1, 1]) part(head, box(0.02, 0.03, 0.3), m, { p: [s * 0.36, EYE_Y + 0.03, 0.18], r: [0, s * 0.35, 0], outline: null });
  },
  face_mustache(head) {
    for (const s of [-1, 1]) {
      const p = onFace(s * 0.075, -0.075, 0.015);
      part(head, sphere(0.07, 14, 10), toon('#4a2e1c'), { p: p.toArray(), s: [1.5, 0.55, 0.6], r: [0, 0, s * 0.35], outline: null });
    }
  },
  face_eyepatch(head) {
    const p = onFace(EYE_X, EYE_Y, 0.02);
    part(head, cyl(0.1, 0.1, 0.025, 20), toon('#15131f'), { p: p.toArray(), q: new THREE.Quaternion().setFromUnitVectors(Y, p.clone().normalize()), outline: null });
    part(head, torus(R + 0.012, 0.013, TAU, 6, 48), toon('#15131f'), { r: [Math.PI / 2 - 0.35, 0.45, 0], outline: null });
  },
  face_ninja(head) {
    const m = toon('#1d1b2e', { side: THREE.DoubleSide });
    part(head, cyl(R + 0.025, R + 0.02, 0.24, 36, true), m, { p: [0, -0.14, 0], outline: null });
    for (const s of [-1, 1]) part(head, box(0.05, 0.2, 0.02), m, { p: [s * 0.06, -0.2, -R - 0.06], r: [0.4, 0, s * 0.3], outline: null });
  },
  face_monocle(head) {
    const gold = shiny('#ffc53d', { metalness: 0.8 });
    const p = onFace(EYE_X, EYE_Y, 0.035);
    part(head, torus(0.105, 0.014, TAU, 8, 28), gold, { p: p.toArray(), q: faceTo(p), outline: null });
    const pts = [p.clone().add(new THREE.Vector3(0, -0.1, 0)), new THREE.Vector3(0.24, -0.35, 0.3), new THREE.Vector3(0.2, -0.55, 0.22)];
    taper(head, pts, 0.008, 0.008, gold);
  },
};

// ---------------------------------------------------------------------------
// back items (in back space: behind the shoulders)
// ---------------------------------------------------------------------------

function wing(parent, side, dragon) {
  const w = new THREE.Group();
  w.position.set(side * 0.08, 0.12, -0.02);
  if (dragon) {
    const g = geo('dragonWing', () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.95, 0.42);
      s.quadraticCurveTo(0.78, 0.08, 0.9, -0.14);
      s.quadraticCurveTo(0.66, -0.04, 0.6, -0.3);
      s.quadraticCurveTo(0.4, -0.1, 0.28, -0.32);
      s.quadraticCurveTo(0.16, -0.1, 0, -0.12);
      return new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false });
    });
    part(w, g, toon('#6a3fb5', { side: THREE.DoubleSide }), { s: [side, 1, 1], outline: OUT_THIN });
  } else {
    for (let i = 0; i < 4; i++) {
      part(w, sphere(0.2, 16, 12), toon(i % 2 ? '#eef2ff' : '#ffffff'), {
        p: [side * (0.22 + i * 0.13), 0.12 - i * 0.07, -i * 0.02], s: [1.3 - i * 0.15, 0.42, 0.16], r: [0, 0, side * (0.5 - i * 0.22)], outline: OUT_THIN,
      });
    }
  }
  parent.add(w);
  return w;
}

const BACKS = {
  back_backpack(back) {
    part(back, box(0.44, 0.5, 0.22), toon('#c96b2c'), { p: [0, -0.02, -0.1] });
    part(back, box(0.46, 0.17, 0.25), toon('#e08a47'), { p: [0, 0.18, -0.1] });
    part(back, box(0.26, 0.16, 0.06), toon('#a85a24'), { p: [0, -0.14, -0.23], outline: OUT_THIN });
  },
  back_cape(back, anim, state) {
    const g = new THREE.PlaneGeometry(0.66, 0.98, 4, 10);
    g.translate(0, -0.49, 0);
    const base = Float32Array.from(g.attributes.position.array);
    const cape = new THREE.Mesh(g, toon('#d6334a', { side: THREE.DoubleSide }));
    cape.position.set(0, 0.2, -0.05);
    cape.castShadow = true;
    back.add(cape);
    state.disposables.push(g);
    anim.push((t, dt, moving) => {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x0 = base[i * 3], y0 = base[i * 3 + 1];
        const k = -y0 / 0.98;
        pos.setX(i, x0 * (1 + k * 0.3));
        pos.setZ(i, -k * k * (moving ? 0.55 : 0.1) - Math.sin(t * 4 + k * 5) * 0.035 * k);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    });
  },
  back_jetpack(back, anim) {
    const metal = shiny('#b8c0d0');
    const flames = [];
    for (const s of [-1, 1]) {
      part(back, cyl(0.1, 0.1, 0.44), metal, { p: [s * 0.12, 0, -0.14] });
      part(back, cone(0.1, 0.12), toon('#e0463c'), { p: [s * 0.12, 0.28, -0.14] });
      part(back, cyl(0.06, 0.08, 0.08), toon('#4a4f66'), { p: [s * 0.12, -0.26, -0.14] });
      const f = part(back, cone(0.07, 0.3, 12), basic('#ffb13b', { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
        { p: [s * 0.12, -0.45, -0.14], r: [Math.PI, 0, 0], outline: null, shadow: false });
      flames.push(f);
    }
    anim.push((t, dt, moving) => flames.forEach((f, i) => { f.scale.y = (moving ? 1.3 : 0.6) + Math.sin(t * 30 + i) * 0.2; }));
  },
  back_wings(back, anim) {
    const ws = [wing(back, -1, false), wing(back, 1, false)];
    anim.push((t) => ws.forEach((w, i) => { w.rotation.y = (i ? -1 : 1) * (0.55 + Math.sin(t * 4) * 0.25); }));
  },
  back_dragon(back, anim) {
    const ws = [wing(back, -1, true), wing(back, 1, true)];
    anim.push((t) => ws.forEach((w, i) => { w.rotation.y = (i ? -1 : 1) * (0.5 + Math.sin(t * 3) * 0.3); }));
  },
};

// ---------------------------------------------------------------------------
// auras (in root space so they don't bob with the body)
// ---------------------------------------------------------------------------

function sprites(parent, material, n, scale) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(material);
    s.scale.setScalar(scale);
    parent.add(s);
    list.push(s);
  }
  return list;
}

const AURAS = {
  aura_sparkle(g, anim) {
    const list = sprites(g, additive(starTexture, 0xfff3a0), 8, 0.2);
    anim.push((t) => list.forEach((s, i) => {
      const a = t * 0.7 + i * 0.8;
      s.position.set(Math.cos(a) * 0.7, 0.3 + ((i * 0.23 + t * 0.15) % 1) * 1.6, Math.sin(a) * 0.7);
      s.scale.setScalar(0.08 + Math.max(0, Math.sin(t * 4 + i * 1.7)) * 0.2);
    }));
  },
  aura_hearts(g, anim) {
    const mat = new THREE.SpriteMaterial({ map: heartTexture, transparent: true, depthWrite: false });
    const list = sprites(g, mat, 5, 0.2);
    anim.push((t) => list.forEach((s, i) => {
      const p = (t * 0.45 + i / 5) % 1;
      s.position.set(Math.sin(p * 6 + i * 2) * 0.35 + (i - 2) * 0.12, 0.6 + p * 1.8, Math.cos(i * 2.1) * 0.3);
      s.material.opacity = 1;
      s.scale.setScalar(0.22 * (1 - p * 0.5));
    }));
  },
  aura_fire(g, anim) {
    const glow = new THREE.Sprite(additive(glowTexture, 0xff7a30, 0.5));
    glow.scale.set(2, 2.4, 1);
    glow.position.y = 0.9;
    g.add(glow);
    const list = sprites(g, additive(flameTexture, 0xffffff, 0.9), 14, 0.35);
    anim.push((t) => list.forEach((s, i) => {
      const p = (t * 0.9 + i / 14) % 1;
      const a = i * 2.4;
      s.position.set(Math.cos(a) * 0.45 * (1 - p * 0.6), p * 1.5, Math.sin(a) * 0.45 * (1 - p * 0.6));
      s.scale.set(0.35 * (1 - p), 0.5 * (1 - p), 1);
    }));
  },
  aura_rainbow(g, anim) {
    const rings = [0, 1].map((i) => part(g, rainbowRing(0.8 - i * 0.12), rainbowMaterial, { p: [0, 0.95, 0], outline: null, shadow: false }));
    anim.push((t) => {
      rings[0].rotation.set(Math.PI / 2 + Math.sin(t) * 0.3, t * 1.2, 0);
      rings[1].rotation.set(Math.PI / 2 - 0.5, -t * 1.6, 0.4);
    });
  },
  aura_shadow(g, anim) {
    const glow = new THREE.Sprite(additive(glowTexture, 0x7a2fd6, 0.55));
    glow.scale.set(2, 2.6, 1);
    glow.position.y = 1;
    g.add(glow);
    const list = sprites(g, additive(flameTexture, 0xa45bff, 0.85), 16, 0.35);
    anim.push((t) => {
      glow.material.opacity = 0.45 + Math.sin(t * 2) * 0.12;
      list.forEach((s, i) => {
        const p = (t * 0.7 + i / 16) % 1;
        const a = i * 2.4 + t * 0.8;
        s.position.set(Math.cos(a) * 0.55 * (1 - p * 0.5), p * 1.9, Math.sin(a) * 0.55 * (1 - p * 0.5));
        s.scale.set(0.3 * (1 - p), 0.55 * (1 - p), 1);
      });
    });
  },
  aura_koi(g, anim) {
    const fish = [0, 1].map((i) => {
      const f = new THREE.Group();
      part(f, sphere(0.1, 14, 10), toon('#ffc53d', { emissive: '#7a5200' }), { s: [1.6, 0.8, 0.8], outline: OUT_THIN });
      part(f, cone(0.08, 0.14, 8), toon('#ffb13b'), { p: [-0.2, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.4], outline: null });
      part(f, sphere(0.03, 8, 6), toon('#e0463c'), { p: [0.02, 0.06, 0], outline: null });
      const glow = new THREE.Sprite(additive(glowTexture, 0xffd84d, 0.6));
      glow.scale.setScalar(0.5);
      f.add(glow);
      g.add(f);
      return f;
    });
    anim.push((t) => fish.forEach((f, i) => {
      const a = t * 1.5 + i * Math.PI;
      f.position.set(Math.cos(a) * 0.8, 0.8 + i * 0.35 + Math.sin(t * 2 + i) * 0.1, Math.sin(a) * 0.8);
      f.rotation.y = -a;
      f.rotation.z = Math.sin(t * 8 + i) * 0.15;
    }));
  },
};

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------

export class Character {
  constructor(look = DEFAULT_LOOK) {
    this.root = new THREE.Group();
    this.key = '';
    this.phase = 0;
    this.blinkAt = 1 + Math.random() * 3;
    this.jumpT = 1;
    this.pose = 'idle';
    this.walkW = 0;            // 0 = idle pose, 1 = full gait (blended so starts/stops are smooth)
    this.look = { yaw: 0, goal: 0, next: 2 + Math.random() * 3 };
    this.emoteName = null;
    this.emoteT = 0;
    this.onStep = null;        // called on every footfall (for footstep sounds)
    this.onLand = null;        // called when a jump lands
    this.propKind = null;      // 'blaster' | 'rod' | null, held in the right hand
    this.aiming = false;       // both arms forward, holding the blaster
    this.setLook(look);
  }

  setLook(look) {
    const L = { ...DEFAULT_LOOK, ...(look ?? {}) };
    const key = JSON.stringify(L);
    if (key === this.key) return;
    this.key = key;
    this.clear();
    this.build(L);
    if (this.propKind) this.setProp(this.propKind);
  }

  /** Put something in the right hand: 'blaster', 'rod' or null. */
  setProp(kind) {
    this.propKind = kind;
    const hand = this.rig?.elbows[0];
    if (!hand) return;
    if (this.prop) hand.remove(this.prop);
    this.prop = null;
    this.rodTip = null;
    if (!kind) return;
    const g = new THREE.Group();
    g.position.set(0, -0.2, 0.02);
    if (kind === 'blaster') {
      part(g, box(0.1, 0.26, 0.14), toon('#3b4266'), { p: [0, -0.08, 0.02], outline: OUT_THIN });
      part(g, box(0.07, 0.1, 0.1), toon('#23263f'), { p: [0, 0.04, -0.04], outline: null });
      part(g, cyl(0.035, 0.035, 0.18, 10), shiny('#8d96a8'), { p: [0, -0.3, 0.02], outline: OUT_THIN });
      const tip = part(g, sphere(0.04, 10, 8), basic('#6ee7ff'), { p: [0, -0.4, 0.02], outline: null, shadow: false });
      const glow = new THREE.Sprite(additive(glowTexture, 0x6ee7ff, 0.7));
      glow.scale.setScalar(0.25);
      tip.add(glow);
    } else if (kind === 'bow') {
      // In the hand's frame (arm held forward) -Y points forward and +Z points up. The bow is a
      // torus arc bulging forward with its grip in the hand, the string behind it.
      const R = 0.62, a = Math.PI * 0.8;
      const frame = new THREE.Group();
      frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)));
      frame.position.set(0, R, 0);
      part(frame, torus(R, 0.035, a, 8, 24), toon('#8b5a2b'), { r: [0, 0, -a / 2], outline: OUT_THIN });
      part(frame, cyl(0.005, 0.005, 2 * R * Math.sin(a / 2), 4), basic('#f4f0ff'), { p: [R * Math.cos(a / 2), 0, 0], outline: null, shadow: false });
      part(frame, cyl(0.045, 0.045, 0.16, 8), toon('#4a2e1c'), { p: [R, 0, 0], outline: null });
      g.add(frame);
    } else if (kind === 'rod') {
      g.rotation.x = -0.6;
      part(g, cyl(0.03, 0.035, 0.34, 8), toon('#c9955a'), { p: [0, 0.05, 0], outline: null });
      part(g, cyl(0.045, 0.045, 0.07, 10), shiny('#c0c6d4'), { p: [0.05, -0.12, 0], r: [0, 0, Math.PI / 2], outline: null });
      part(g, cyl(0.011, 0.02, 2.2, 6), toon('#3b2a1a'), { p: [0, -1.25, 0], outline: null });
      const tip = new THREE.Object3D();
      tip.position.y = -2.35;
      g.add(tip);
      this.rodTip = tip;
    }
    hand.add(g);
    this.prop = g;
  }

  clear() {
    this.state?.disposables.forEach((d) => d.dispose());
    while (this.root.children.length) this.root.remove(this.root.children[0]);
  }

  build(L) {
    const top = TOPS[L.top] ?? TOPS.top_tee;
    const anim = [];
    const state = { disposables: [] };
    const skin = toon(L.skin);
    const topColor = top.color ?? L.topColor;
    const topMat = top.metal ? shiny(topColor, { metalness: 0.75, roughness: 0.3 }) : toon(topColor);
    const pants = toon(L.bottomColor);
    const shoe = toon('#2a2438');

    const body = new THREE.Group();
    this.root.add(body);

    // legs: hip -> knee -> shoe, so steps can lift and bend
    const sole = toon('#f4f0ff');
    const knees = [];
    const legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.12, 0.46, 0);
      part(pivot, capsule(0.1, 0.1), pants, { p: [0, -0.1, 0] });
      const knee = new THREE.Group();
      knee.position.y = -0.2;
      part(knee, capsule(0.09, 0.08), pants, { p: [0, -0.08, 0] });
      part(knee, sphere(0.12, 18, 12), shoe, { p: [0, -0.2, 0.045], s: [0.95, 0.6, 1.4] });
      part(knee, sphere(0.12, 18, 8), sole, { p: [0, -0.235, 0.045], s: [0.98, 0.22, 1.42], outline: null });
      part(knee, sphere(0.05, 10, 8), sole, { p: [0, -0.17, 0.17], s: [1.4, 0.6, 0.5], outline: null, shadow: false });
      pivot.add(knee);
      knees.push(knee);
      body.add(pivot);
      return pivot;
    });
    part(body, sphere(0.25), pants, { p: [0, 0.54, 0], s: [1, 0.6, 0.82] });

    const torso = new THREE.Group();
    torso.position.y = 0.83;
    body.add(torso);
    if (top.robe) {
      part(torso, cyl(0.26, 0.42, 0.98, 28), topMat, { p: [0, -0.14, 0], s: [1, 1, 0.85] });
      part(torso, torus(0.42, 0.035, TAU, 8, 40), shiny('#ffc53d'), { p: [0, -0.62, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1], outline: null });
      part(torso, box(0.06, 0.95, 0.02), shiny('#ffc53d'), { p: [0, -0.14, 0.3], r: [-0.14, 0, 0], outline: null });
      part(torso, torus(0.21, 0.08, TAU, 10, 28), toon('#f4f0ff'), { p: [0, 0.33, 0], r: [Math.PI / 2, 0, 0] });
    } else {
      part(torso, capsule(0.25, 0.2), topMat, { s: [1.02, 1, 0.8] });
    }
    this.decorateTop(torso, L, top, topColor);

    part(body, cyl(0.09, 0.1, 0.16), skin, { p: [0, 1.2, 0], outline: null });

    // arms: shoulder -> elbow -> hand
    const armMat = top.sleeve === 'long' ? topMat : skin;
    const elbows = [];
    const arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.33, 1.1, 0);
      pivot.rotation.z = s * 0.1;
      part(pivot, capsule(0.08, 0.07), armMat, { p: [0, -0.09, 0] });
      if (top.sleeve === 'short') part(pivot, capsule(0.1, 0.06), topMat, { p: [0, -0.05, 0] });
      if (top.metal) part(pivot, dome(0.15), topMat, { p: [0, 0.01, 0], s: [1, 0.8, 1] });
      const elbow = new THREE.Group();
      elbow.position.y = -0.19;
      part(elbow, capsule(0.075, 0.06), armMat, { p: [0, -0.08, 0] });
      if (top.sleeve === 'long') part(elbow, torus(0.07, 0.025, TAU, 6, 16), toon(tint(topColor, top.metal ? 0.8 : 0.85)), { p: [0, -0.15, 0], r: [Math.PI / 2, 0, 0], outline: null });
      part(elbow, sphere(0.088, 16, 12), skin, { p: [0, -0.19, 0.005], s: [0.95, 1.05, 1] });
      part(elbow, sphere(0.04, 8, 6), skin, { p: [s * -0.06, -0.16, 0.04], outline: null, shadow: false }); // thumb
      pivot.add(elbow);
      elbows.push(elbow);
      body.add(pivot);
      return pivot;
    });

    const head = new THREE.Group();
    head.position.y = 1.52;
    body.add(head);
    part(head, sphere(R, 36, 28), skin);
    for (const s of [-1, 1]) part(head, sphere(0.085, 14, 10), toon(tint(L.skin, 0.93)), { p: [s * 0.41, -0.02, -0.02], s: [0.6, 1, 0.9], outline: OUT_THIN });

    const hideEyes = L.face === 'face_sunglasses' || L.hat === 'hat_helmet';
    const eyes = [];
    if (!hideEyes) {
      for (const s of [-1, 1]) {
        const p = onFace(s * EYE_X, EYE_Y, -0.012);
        const eye = part(head, sphere(0.064, 18, 14), basic('#1d1b2e'), { p: p.toArray(), q: faceTo(p), s: [0.85, 1.3, 0.5], outline: null, shadow: false });
        part(eye, sphere(0.022, 10, 8), basic('#ffffff'), { p: [0.022, 0.024, 0.05], outline: null, shadow: false });
        eyes.push(eye);
        const bp = onFace(s * EYE_X, 0.16, 0.005);
        part(head, capsule(0.016, 0.08), toon(tint(L.hairColor, 0.8)), { p: bp.toArray(), r: [0, 0, Math.PI / 2 + s * 0.15], outline: null, shadow: false });
      }
    }
    for (const s of [-1, 1]) {
      const p = onFace(s * 0.25, -0.09, 0.004);
      part(head, circle(0.065), basic('#ff7b9c', { transparent: true, opacity: 0.45, depthWrite: false }), { p: p.toArray(), q: faceTo(p), outline: null, shadow: false });
    }
    let mouth = null, mouthOpen = null;
    if (L.face !== 'face_ninja') {
      const p = onFace(0, -0.13, 0.002);
      const q = faceTo(p).multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.PI));
      mouth = part(head, torus(0.055, 0.014, Math.PI, 6, 16), basic('#6b2f2f'), { p: p.toArray(), q, outline: null, shadow: false });
      const po = onFace(0, -0.15, -0.012);
      mouthOpen = part(head, sphere(0.055, 14, 10), basic('#5a1f2a'), { p: po.toArray(), q: faceTo(po), s: [1, 0.8, 0.35], outline: null, shadow: false });
      part(mouthOpen, sphere(0.03, 10, 8), basic('#ff7b8c'), { p: [0, -0.025, 0.02], s: [1.2, 0.6, 0.6], outline: null, shadow: false });
      mouthOpen.visible = false;
    }

    const hairMat = toon(L.hairColor);
    const hair = COVERING_HATS.has(L.hat) && TALL_HAIR.has(L.hair) ? 'hair_short' : L.hair;
    (HAIR[hair] ?? HAIR.hair_short)(head, hairMat);
    FACES[L.face]?.(head);
    HATS[L.hat]?.(head, L, anim);
    head.traverse((o) => { if (o.userData.spin) anim.push((t) => { o.rotation.y = t * 2; }); });

    const back = new THREE.Group();
    back.position.set(0, 0.92, -0.2);
    body.add(back);
    BACKS[L.back]?.(back, anim, state);

    const aura = new THREE.Group();
    this.root.add(aura);
    AURAS[L.aura]?.(aura, anim);

    this.rig = { body, torso, head, legs, knees, arms, elbows, eyes, mouth, mouthOpen, anim };
    this.state = state;
  }

  decorateTop(torso, L, top, color) {
    const front = (x, y, lift = 0.012) => {
      // front surface of the (scaled) torso capsule
      const r = 0.25;
      const z = Math.abs(y) <= 0.1 ? r : Math.sqrt(Math.max(0, r * r - (Math.abs(y) - 0.1) ** 2));
      return [x, y, z * 0.8 + lift];
    };
    switch (L.top) {
      case 'top_tee':
      case 'top_tank':
        part(torso, circle(0.08), toon(L.skin), { p: front(0, 0.27, 0.004), r: [-0.5, 0, 0], outline: null, shadow: false });
        break;
      case 'top_hoodie':
        part(torso, torus(0.2, 0.08, TAU, 10, 28), toon(tint(color, 0.85)), { p: [0, 0.3, -0.1], r: [Math.PI / 2 - 0.5, 0, 0] });
        part(torso, box(0.26, 0.12, 0.02), toon(tint(color, 0.85)), { p: front(0, -0.12), outline: OUT_THIN });
        for (const s of [-1, 1]) part(torso, cyl(0.012, 0.012, 0.16, 6), toon('#ffffff'), { p: front(s * 0.05, 0.14, 0.01), outline: null });
        break;
      case 'top_hawaiian':
        [[-0.12, 0.08, '#ffffff'], [0.1, -0.06, '#ffd84d'], [-0.06, -0.16, '#ff9fb4'], [0.14, 0.14, '#ff9fb4'], [-0.18, -0.02, '#ffd84d']].forEach(([x, y, c]) => {
          part(torso, circle(0.045), toon(c), { p: front(x, y), outline: null, shadow: false });
        });
        part(torso, geo('vneck', () => new THREE.CircleGeometry(0.1, 3)), toon('#ffffff'), { p: front(0, 0.24, 0.006), r: [0, 0, -Math.PI / 2], outline: null, shadow: false });
        break;
      case 'top_jersey':
        part(torso, geo('jerseyNum', () => new THREE.PlaneGeometry(0.24, 0.24)), new THREE.MeshBasicMaterial({ map: jerseyNumber, transparent: true }), { p: front(0, -0.02, 0.02), outline: null, shadow: false });
        for (const s of [-1, 1]) part(torso, box(0.03, 0.5, 0.2), toon('#ffffff'), { p: [s * 0.25, 0, 0], outline: null });
        break;
      case 'top_suit':
        part(torso, geo('vneck2', () => new THREE.CircleGeometry(0.14, 3)), toon('#ffffff'), { p: front(0, 0.2, 0.004), r: [0, 0, -Math.PI / 2], s: [1, 0.8, 1], outline: null, shadow: false });
        part(torso, box(0.06, 0.24, 0.02), toon(L.topColor), { p: front(0, 0.06, 0.02), outline: null });
        part(torso, box(0.08, 0.06, 0.03), toon(tint(L.topColor, 0.8)), { p: front(0, 0.2, 0.02), outline: null });
        break;
      case 'top_racing':
        part(torso, box(0.6, 0.1, 0.44), toon(L.topColor), { r: [0, 0, 0.55], outline: null });
        break;
      case 'top_armor':
        part(torso, torus(0.25, 0.025, TAU, 6, 36), shiny('#7d869a'), { p: [0, -0.08, 0], r: [Math.PI / 2, 0, 0], s: [1.03, 0.82, 1], outline: null });
        part(torso, box(0.5, 0.06, 0.44), toon('#6b4a2b'), { p: [0, -0.28, 0], outline: null });
        break;
    }
  }

  /** 'idle' | 'walk' | 'sit' | 'fish' — used by portraits and sprite frames. */
  setPose(pose, phase = 0) {
    this.pose = pose;
    this.phase = phase;
  }

  jump() { this.jumpT = 0; }

  /** Play an emote animation: wave, laugh, heart, fire, gg, wow. */
  emote(name) {
    this.emoteName = name;
    this.emoteT = 0;
    if (name === 'gg' || name === 'wow') this.jump();
  }

  /**
   * Advance the animation. `speed` scales the stride (1 = walk, ~1.6+ = run); the phase advances
   * with it so feet don't slide.
   */
  update(dt, time, moving = false, speed = 1) {
    const { body, torso, head, legs, knees, arms, elbows, eyes, mouth, mouthOpen, anim } = this.rig;
    const posed = this.pose === 'walk';
    const walking = moving || posed;
    const goal = walking ? 1 : 0;
    if (dt === 0 || posed) this.walkW = goal;
    else this.walkW += (goal - this.walkW) * Math.min(1, dt * 9);
    const w = this.walkW, iw = 1 - w;

    if (moving) {
      const before = this.phase;
      this.phase += dt * 9 * speed;
      // a foot lands each time a leg reaches its front-most point
      const step = (p) => Math.floor((p - Math.PI / 2) / Math.PI);
      if (step(this.phase) !== step(before)) this.onStep?.();
    }
    const ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    const run = Math.min(1, Math.max(0, (speed - 1.3) / 0.5));
    const legA = (0.6 + run * 0.3) * w, armA = (0.5 + run * 0.4) * w;
    const breathe = Math.sin(time * 2.2);

    // ---- idle look-around ----
    const look = this.look;
    if (dt > 0) {
      look.next -= dt;
      if (look.next <= 0) {
        look.goal = w < 0.5 && Math.random() < 0.55 ? (Math.random() - 0.5) * 1.1 : 0;
        look.next = 1.6 + Math.random() * 4;
      }
      look.yaw += (look.goal * iw - look.yaw) * Math.min(1, dt * 3.5);
    } else look.yaw = 0;

    // ---- gait ----
    const kneeBend = [Math.max(0, -c), Math.max(0, c)]; // the leg swinging forward bends its knee
    legs[0].rotation.x = s * legA - kneeBend[0] * 0.3 * w;
    legs[1].rotation.x = -s * legA - kneeBend[1] * 0.3 * w;
    knees.forEach((k, i) => { k.rotation.x = (0.08 + kneeBend[i] * (1.05 + run * 0.6)) * w + (0.03 + breathe * 0.015) * iw; });
    arms[0].rotation.x = -s * armA;
    arms[1].rotation.x = s * armA;
    arms[0].rotation.z = -(0.1 + 0.06 * w + Math.sin(time * 1.6) * 0.03 * iw);
    arms[1].rotation.z = 0.1 + 0.06 * w + Math.sin(time * 1.6) * 0.03 * iw;
    elbows[0].rotation.set(-(0.18 * iw + (0.35 + run * 0.9 + Math.max(0, s) * 0.35) * w), 0, 0);
    elbows[1].rotation.set(-(0.18 * iw + (0.35 + run * 0.9 + Math.max(0, -s) * 0.35) * w), 0, 0);

    // keep the planted foot on the ground as the legs spread, plus a little bounce
    const drop = 0.46 * (1 - Math.cos(Math.abs(s) * legA));
    body.position.set(Math.sin(time * 0.7) * 0.015 * iw, -drop + (0.5 + 0.5 * Math.cos(2 * ph)) * (0.03 + run * 0.04) * w, 0);
    body.rotation.set((0.07 + run * 0.12) * w, s * 0.09 * w, -s * 0.035 * w + Math.sin(time * 0.7) * 0.02 * iw);
    body.scale.set(1, 1, 1);
    torso.scale.y = 1 + breathe * 0.014 * iw;
    head.rotation.set(
      -body.rotation.x * 0.6 + Math.sin(2 * ph) * 0.035 * w + Math.sin(time * 0.6) * 0.03 * iw,
      -body.rotation.y * 0.9 + look.yaw,
      s * 0.03 * w + Math.sin(time * 0.9) * 0.03 * iw,
    );

    if (this.pose === 'bench') {
      legs.forEach((l) => { l.rotation.x = -1.5; });
      knees.forEach((k) => { k.rotation.x = 1.5; });
      arms.forEach((a, i) => { a.rotation.x = -0.35; a.rotation.z = (i ? 1 : -1) * 0.12; });
      elbows.forEach((e) => { e.rotation.x = -0.95; });
      body.position.set(0, 0, 0);
      body.rotation.set(-0.05, 0, 0);
    } else if (this.pose === 'sit') {
      legs.forEach((l) => { l.rotation.x = -1.45; });
      knees.forEach((k) => { k.rotation.x = 1.45; });
      arms.forEach((a) => { a.rotation.x = -1.1; });
      elbows.forEach((e) => { e.rotation.x = -0.35; });
      body.position.set(0, 0, 0);
      body.rotation.set(0, 0, 0);
    } else if (this.aiming) {
      arms[0].rotation.set(-1.5, 0, -0.05);
      elbows[0].rotation.set(0, 0, 0);
      arms[1].rotation.set(-1.3, 0, -0.45);
      elbows[1].rotation.set(-0.35, 0, 0);
    } else if (this.pose === 'fish') {
      arms.forEach((a, i) => { a.rotation.x = -1.2; a.rotation.z = i ? -0.25 : 0.25; });
      elbows.forEach((e) => { e.rotation.x = -0.45; });
    }

    // ---- jump: crouch, stretch in the air, squash on landing ----
    if (this.jumpT < 1) {
      const prev = this.jumpT;
      this.jumpT = Math.min(1, this.jumpT + dt / 0.55);
      const j = this.jumpT;
      let lift = 0, squash = 0, tuck = 0;
      if (j < 0.15) squash = Math.sin((j / 0.15) * (Math.PI / 2)) * 0.18;
      else if (j < 0.85) {
        const k = (j - 0.15) / 0.7;
        lift = Math.sin(k * Math.PI) * 0.6;
        tuck = Math.sin(k * Math.PI);
        squash = -0.08 * Math.max(0, Math.sin(k * Math.PI * 2)); // stretch while rising
      } else squash = Math.sin(((j - 0.85) / 0.15) * Math.PI) * 0.16;
      body.position.y += lift - Math.max(0, squash) * 0.25;
      body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
      legs.forEach((l) => { l.rotation.x -= tuck * 0.45 + Math.max(0, squash) * 1.5; });
      knees.forEach((k) => { k.rotation.x += tuck * 0.9 + Math.max(0, squash) * 3; });
      if (!this.emoteName) {
        arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * (0.1 + 2.4 * tuck); });
        elbows.forEach((e, i) => { e.rotation.z = (i ? 1 : -1) * 0.3 * tuck; });
      }
      if (prev < 0.85 && j >= 0.85) this.onLand?.();
    }

    // ---- emotes ----
    let mouthWide = false;
    if (this.emoteName) {
      this.emoteT += dt;
      const t = this.emoteT, dur = 1.9;
      const k = Math.max(0, Math.min(1, t / 0.15, (dur - t) / 0.25));
      const to = (o, axis, v) => { o.rotation[axis] += (v - o.rotation[axis]) * k; };
      switch (this.emoteName) {
        case 'wave':
          to(arms[1], 'z', 2.5); to(arms[1], 'x', -0.2);
          to(elbows[1], 'x', 0); to(elbows[1], 'z', 0.55 + Math.sin(t * 16) * 0.45);
          to(body, 'z', -0.06); to(head, 'z', 0.1);
          break;
        case 'laugh':
          to(body, 'x', -0.14 + Math.sin(t * 28) * 0.035);
          body.position.y += Math.abs(Math.sin(t * 14)) * 0.03 * k;
          arms.forEach((a, i) => { to(a, 'x', -0.55); to(a, 'z', (i ? 1 : -1) * 0.35); });
          elbows.forEach((e) => to(e, 'x', -1.6));
          to(head, 'x', -0.3);
          mouthWide = true;
          break;
        case 'heart':
          arms.forEach((a, i) => { to(a, 'x', -1.0); to(a, 'z', (i ? -1 : 1) * 0.25); });
          elbows.forEach((e) => to(e, 'x', -1.55));
          to(body, 'z', Math.sin(t * 4) * 0.09);
          to(head, 'z', Math.sin(t * 4) * 0.14);
          break;
        case 'fire':
          to(arms[1], 'z', 2.85); to(arms[1], 'x', 0);
          to(elbows[1], 'z', Math.abs(Math.sin(t * 10)) * 1.1);
          to(arms[0], 'x', -0.35); to(arms[0], 'z', -0.55); to(elbows[0], 'x', -1.7);
          body.position.y += Math.abs(Math.sin(t * 10)) * 0.04 * k;
          break;
        case 'gg':
          arms.forEach((a, i) => { to(a, 'z', (i ? 1 : -1) * 2.5); to(a, 'x', 0); });
          elbows.forEach((e, i) => to(e, 'z', (i ? 1 : -1) * 0.15));
          break;
        case 'wow':
          to(body, 'x', -0.16);
          arms.forEach((a, i) => { to(a, 'z', (i ? 1 : -1) * 1.9); to(a, 'x', -0.2); });
          elbows.forEach((e, i) => to(e, 'z', (i ? 1 : -1) * 1.35));
          to(head, 'x', -0.18);
          mouthWide = true;
          break;
      }
      if (t >= dur) this.emoteName = null;
    }
    if (mouth) {
      mouth.visible = !mouthWide;
      mouthOpen.visible = mouthWide;
      if (mouthWide) mouthOpen.scale.y = 0.7 + Math.abs(Math.sin(time * 18)) * 0.35;
    }

    this.blinkAt -= dt;
    const blink = this.blinkAt < 0.12 && this.blinkAt > 0;
    if (this.blinkAt <= 0) this.blinkAt = 2 + Math.random() * 4;
    for (const e of eyes) e.scale.y = blink ? 0.12 : 1.3;

    for (const fn of anim) fn(time, dt, walking);
  }
}
