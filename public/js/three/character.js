// 3D chibi characters built from primitives, with every cosmetic from cosmetics.json.
// The character stands at the origin facing +Z; it is ~1.95 units tall.
import * as THREE from 'three';
import { buildPet } from './pets.js';
import { buildMount } from './mounts.js';
import {
  TAU, toon, basic, shiny, outlineMaterial, canvasTexture,
  additive, starTexture, heartTexture, flameTexture, glowTexture, puffTexture,
} from './materials.js';

export const DEFAULT_LOOK = {
  skin: '#f6c9a0', hairColor: '#2b1d14', topColor: '#39c6ff', bottomColor: '#23263f', shoeColor: '#23263f', eyeColor: '#1d1b2e',
  eyes: 'eyes_round', height: 'height_medium', build: 'build_regular',
  hair: 'hair_short', top: 'top_tee', bottom: 'bottom_pants', hat: 'hat_none', face: 'face_none', back: 'back_none', aura: 'aura_none',
  pet: 'pet_none', mount: 'mount_none', shoes: 'shoes_sneakers', socks: 'socks_none', sockColor: '#f5f5f5',
};

// Body shapes: leg/torso stretch for height; width, depth and limb thickness for build.
const HEIGHTS = {
  height_tiny: { leg: 0.62, torso: 0.84 },
  height_short: { leg: 0.8, torso: 0.92 },
  height_medium: { leg: 1, torso: 1 },
  height_tall: { leg: 1.22, torso: 1.08 },
};
const BUILDS = {
  build_slim: { w: 0.86, d: 0.9, limb: 0.88 },
  build_regular: { w: 1, d: 1, limb: 1 },
  build_broad: { w: 1.2, d: 1.08, limb: 1.14 },
  build_round: { w: 1.32, d: 1.5, limb: 1.08 },
};
const BOTTOMS = {
  bottom_pants: { legs: 'pants' },
  bottom_shorts: { legs: 'shorts' },
  bottom_skirt: { legs: 'skin', socks: true, skirt: { len: 0.28, flare: 0.38 } },
  bottom_cuffed: { legs: 'pants', cuffs: true },
  bottom_cargo: { legs: 'pants', baggy: 1.12, pockets: true },
  bottom_jeans: { legs: 'pants', seams: true, cuffs: true },
  bottom_joggers: { legs: 'pants', jogger: true, stripe: true },
  bottom_flares: { legs: 'pants', flare: true, seams: true },
  bottom_ripped: { legs: 'pants', ripped: true, seams: true },
  bottom_overalls: { legs: 'pants', overalls: true, cuffs: true, pattern: 'denim', seams: true },
  bottom_leather: { legs: 'pants', leather: true, seams: true },
  bottom_athletic: { legs: 'shorts', stripe: true },
  bottom_plaidskirt: { legs: 'skin', socks: true, skirt: { len: 0.25, flare: 0.34, pattern: 'plaid' } },
};

const R = 0.42; // head radius
const OUT = outlineMaterial(0.02);
const OUT_THIN = outlineMaterial(0.012);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _xAxis = new THREE.Vector3(1, 0, 0), _yAxis = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _v8 = new THREE.Vector3(), _m1 = new THREE.Matrix4(), _gs = new THREE.Vector3();
const BOW_SCALE = 0.72;

/**
 * Two-bone IK for an arm: turn the shoulder pivot and bend the elbow so the hand lands on `target`
 * (in the pivot's parent frame), with the elbow rolled towards `pole`. Out of reach -> arm straight.
 */
function ikArm(pivot, elbow, target, pole) {
  const l = 0.19;
  const reach = _ik1.copy(target).sub(pivot.position).divideScalar(pivot.scale.x);
  const dist = Math.min(Math.max(reach.length(), 0.05), l * 2 * 0.995);
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (2 * l * l - dist * dist) / (2 * l * l))));
  elbow.rotation.set(-bend, 0, 0);
  const hand = _ik2.set(0, -l - l * Math.cos(bend), l * Math.sin(bend)).normalize();
  const n = reach.normalize();
  const q = _ikq.setFromUnitVectors(hand, n);
  const e = _ik3.set(0, -1, 0).applyQuaternion(q);
  const pl = _ik4.copy(pole);
  e.addScaledVector(n, -e.dot(n));
  pl.addScaledVector(n, -pl.dot(n));
  if (e.lengthSq() > 1e-6 && pl.lengthSq() > 1e-6) {
    const ang = Math.atan2(n.dot(_ik2.crossVectors(e, pl)), e.dot(pl));
    q.premultiply(_ikq2.setFromAxisAngle(n, ang));
  }
  pivot.quaternion.copy(q);
}
const _ik1 = new THREE.Vector3(), _ik2 = new THREE.Vector3(), _ik3 = new THREE.Vector3(), _ik4 = new THREE.Vector3();

/**
 * Two-bone IK for a leg: swing the hip and bend the knee (backwards, like a knee does) so the foot lands
 * on `target` (in the hip pivot's parent frame). thigh, shin: the bone lengths.
 */
function ikLeg(pivot, knee, target, thigh, shin) {
  const dx = target.x - pivot.position.x, dy = target.y - pivot.position.y, dz = target.z - pivot.position.z;
  const d = Math.min(Math.max(Math.hypot(dy, dz), 0.05), (thigh + shin) * 0.999);
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (thigh * thigh + shin * shin - d * d) / (2 * thigh * shin))));
  const along = Math.atan2(-dz, -dy); // (0 straight down, negative swings forward)
  const offset = Math.asin(Math.min(1, Math.max(-1, (shin * Math.sin(bend)) / d)));
  pivot.rotation.set(along - offset, 0, Math.asin(Math.max(-0.5, Math.min(0.5, dx / Math.max(d, 0.05)))));
  knee.rotation.set(bend, 0, 0);
}
const _ikq = new THREE.Quaternion(), _ikq2 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();

// color: a top with its own look (it can be recoloured with topTint); accent: the default colour of
// its trim/tie/stripes (recolour with topAccent)
const TOPS = {
  top_tee: { sleeve: 'short' },
  top_tank: { sleeve: 'none' },
  top_hoodie: { sleeve: 'long', hood: true, accent: '#ffffff' },
  top_hawaiian: { sleeve: 'short', pattern: 'hawaiian', accent: '#ffd84d' },
  top_jersey: { sleeve: 'short', accent: '#ffffff' },
  top_suit: { sleeve: 'long', color: '#23263f', accent: '#e0463c' },
  top_racing: { sleeve: 'long', color: '#f4f4f4', accent: '#e0463c', armStripe: true },
  top_armor: { sleeve: 'long', color: '#aab3c5', metal: true, accent: '#8b5a2b' },
  top_robe: { sleeve: 'long', color: '#5b2a86', robe: true, accent: '#ffc53d' },
  top_leather: { sleeve: 'long', color: '#1d1b22', leather: true, accent: '#f4f0ff' },
  top_varsity: { sleeve: 'long', accent: '#f4f0ff', armAccent: true },
  top_puffer: { sleeve: 'long', puffy: true, accent: '#23263f' },
  top_sweater: { sleeve: 'long', accent: '#f4f0ff' },
  top_flannel: { sleeve: 'long', pattern: 'plaid', accent: '#1d1b2e' },
  top_kimono: { sleeve: 'long', kimono: true, accent: '#ffc53d' },
  top_denim: { sleeve: 'long', color: '#4a74b8', accent: '#e8c07a' },
  top_tux: { sleeve: 'long', color: '#15141c', accent: '#15141c' },
  top_polo: { sleeve: 'short', accent: '#ffffff' },
};
const hex = (c) => `#${new THREE.Color(c).getHexString()}`;
// printed fabrics, made per colour pair (cached)
const patternCache = new Map();
function patternMaterial(kind, main, accent) {
  const key = `${kind}${main}${accent}`;
  if (!patternCache.has(key)) {
    const tex = canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = main; ctx.fillRect(0, 0, 128, 128);
      if (kind === 'plaid') {
        ctx.globalAlpha = 0.45; ctx.fillStyle = accent;
        for (let i = 0; i < 128; i += 32) { ctx.fillRect(i, 0, 12, 128); ctx.fillRect(0, i, 128, 12); }
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffffff';
        for (let i = 20; i < 128; i += 32) { ctx.fillRect(i, 0, 2, 128); ctx.fillRect(0, i, 128, 2); }
      } else if (kind === 'hawaiian') {
        const flower = (x, y, r, c) => {
          ctx.fillStyle = c;
          for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
        };
        ctx.fillStyle = 'rgba(40,120,60,.55)';
        for (const [x, y, a] of [[20, 90, 0.6], [80, 30, -0.4], [110, 100, 1.2], [50, 50, 2]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
        flower(30, 30, 14, accent); flower(96, 70, 16, '#ffffff'); flower(40, 104, 11, accent); flower(110, 16, 10, '#ff9fb4'); flower(70, 118, 9, '#ffffff');
      } else if (kind === 'dots') {
        ctx.fillStyle = accent;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.beginPath(); ctx.arc(x * 32 + (y % 2) * 16 + 8, y * 32 + 16, 6, 0, TAU); ctx.fill(); }
      } else if (kind === 'check' || kind === 'gingham') {
        // chef's check (hard squares) or soft gingham (see-through stripes both ways)
        const n = kind === 'check' ? 8 : 6, w = 128 / n;
        ctx.fillStyle = accent;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          if (kind === 'check' ? (x + y) % 2 : false) ctx.fillRect(x * w, y * w, w, w);
        }
        if (kind === 'gingham') {
          ctx.globalAlpha = 0.45;
          for (let i = 0; i < n; i += 2) { ctx.fillRect(i * w, 0, w, 128); ctx.fillRect(0, i * w, 128, w); }
        }
      } else if (kind === 'floral') {
        // little five-petal blossoms scattered over the fabric (kimonos, sundresses)
        const rnd = (k) => ((Math.sin(k * 91.7) * 43758.5453) % 1 + 1) % 1;
        for (let i = 0; i < 14; i++) {
          const x = rnd(i) * 128, y = rnd(i + 50) * 128, r = 5 + rnd(i + 99) * 5;
          for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; ctx.fillStyle = i % 3 ? accent : '#ffffff'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.45, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(x, y, r * 0.25, 0, TAU); ctx.fill();
        }
      } else if (kind === 'ribs' || kind === 'stripes') {
        ctx.fillStyle = kind === 'ribs' ? 'rgba(0,0,0,.14)' : accent;
        for (let x = 0; x < 128; x += kind === 'ribs' ? 8 : 32) ctx.fillRect(x, 0, kind === 'ribs' ? 3 : 14, 128);
      } else if (kind === 'argyle') {
        ctx.fillStyle = accent;
        for (const [x, y] of [[32, 32], [96, 96], [96, 32], [32, 96]]) { ctx.globalAlpha = (x + y) % 128 ? 0.55 : 1; ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + 30, y); ctx.lineTo(x, y + 30); ctx.lineTo(x - 30, y); ctx.fill(); }
        ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(128, 128); ctx.moveTo(128, 0); ctx.lineTo(0, 128); ctx.moveTo(64, 0); ctx.lineTo(128, 64); ctx.lineTo(64, 128); ctx.lineTo(0, 64); ctx.closePath(); ctx.stroke();
      } else if (kind === 'sparkle') {
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        for (let i = 0; i < 40; i++) { const x = (i * 37) % 128, y = (i * 71) % 128; ctx.fillRect(x, y, 2, 2); }
      } else if (kind === 'denim') {
        ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1;
        for (let i = -128; i < 128; i += 4) { ctx.beginPath(); ctx.moveTo(i, 128); ctx.lineTo(i + 128, 0); ctx.stroke(); }
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const rep = { plaid: [3, 2], hawaiian: [2, 1.5], dots: [3, 2], check: [3, 2], gingham: [3, 2], floral: [2, 1.5], ribs: [4, 1], stripes: [3, 1], argyle: [2, 1.5], sparkle: [3, 2], denim: [3, 2] }[kind] ?? [2, 1.5];
    tex.repeat.set(rep[0], rep[1]);
    patternCache.set(key, new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, gradientMap: toon('#ffffff').gradientMap }));
  }
  return patternCache.get(key);
}
const letterTexture = (() => {
  const cache = new Map();
  return (color, bg) => {
    const key = color + bg;
    if (!cache.has(key)) cache.set(key, canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(4, 4, 56, 56, 10); ctx.fill();
      ctx.font = '900 46px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.strokeText('F', 32, 36);
      ctx.fillStyle = color; ctx.fillText('F', 32, 36);
    }));
    return cache.get(key);
  };
})();
const numberTexture = (() => {
  const cache = new Map();
  return (color) => {
    if (!cache.has(color)) cache.set(color, canvasTexture(128, 128, (ctx) => {
      ctx.font = '900 96px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 10; ctx.strokeStyle = '#1d1b2e'; ctx.strokeText('7', 64, 70);
      ctx.fillStyle = color; ctx.fillText('7', 64, 70);
    }));
    return cache.get(color);
  };
})();
const FRINGE_HIDING_HATS = new Set(['hat_durag', 'hat_beanie', 'hat_helmet', 'hat_viking', 'hat_bucket', 'hat_cap']);
const COVERING_HATS = new Set(['hat_durag', 'hat_cap', 'hat_beanie', 'hat_cowboy', 'hat_bucket', 'hat_tophat', 'hat_viking',
  'hat_wizard', 'hat_helmet', 'hat_robin', 'hat_party', 'hat_crown', 'hat_sunhat', 'hat_bandana']);

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

// more tops. bodice: [bottom, top] of a fitted piece over bare skin (tank, cami, crop…); shirt: a collared
// shirt worn under a vest; sleeve: 'none' | 'short' | 'long' | 'puff' | 'puffLong' | 'flutter' | 'off' | 'kimono'
Object.assign(TOPS, {
  top_tank: { sleeve: 'none', bodice: [-0.35, 0.22], straps: 0.034 },
  top_kimono: { sleeve: 'kimono', kimono: true, pattern: 'floral', accent: '#ffc53d' },
  top_oxford: { sleeve: 'long', accent: '#f4f0ff' },
  top_crop: { sleeve: 'short', bodice: [-0.03, 0.36] },
  top_cami: { sleeve: 'none', bodice: [-0.35, 0.15], straps: 0.012 },
  top_tube: { sleeve: 'none', bodice: [-0.15, 0.15] },
  top_halter: { sleeve: 'none', bodice: [-0.35, 0.18], halter: true },
  top_ribbed: { sleeve: 'long', pattern: 'ribs' },
  top_cardigan: { sleeve: 'long', accent: '#f4f0ff' },
  top_babydoll: { sleeve: 'puff', accent: '#ffffff' },
  top_ruffle: { sleeve: 'flutter', accent: '#ffffff' },
  top_blouse: { sleeve: 'puffLong', accent: '#ff5d8f' },
  top_offshoulder: { sleeve: 'off', bodice: [-0.35, 0.12] },
  top_sailor: { sleeve: 'short', accent: '#e0463c' },
  top_sweatervest: { sleeve: 'long', shirt: '#f6f4ee', vest: 'argyle', accent: '#1d1b2e' },
  top_vest_plaid: { sleeve: 'long', shirt: '#f6f4ee', vest: 'plaid', accent: '#1d1b2e' },
  top_vest_brown: { sleeve: 'long', shirt: '#f6f4ee', vest: 'plain', color: '#7a4a2a', accent: '#c9a227' },
  top_corset: { sleeve: 'none', bodice: [-0.32, 0.16], shiny: true, accent: '#1d1b2e' },
  // (the tops that full outfits are made of)
  dress_strap: { sleeve: 'none', bodice: [-0.35, 0.17], straps: 0.02 },
  dress_slip: { sleeve: 'none', bodice: [-0.35, 0.15], straps: 0.01, shiny: true },
  dress_short: { sleeve: 'short' },
  dress_sweetheart: { sleeve: 'none', bodice: [-0.35, 0.14], sweetheart: true },
  dress_sleeveless: { sleeve: 'none' },
  dress_off: { sleeve: 'off', bodice: [-0.35, 0.12] },
  dress_puff: { sleeve: 'puff', square: true },
  dress_bridal: { sleeve: 'none', bodice: [-0.35, 0.15], sweetheart: true, sparkle: true },
  dress_polo: { sleeve: 'none', polo: true },
  dress_pinafore: { sleeve: 'short', shirt: '#f6f4ee', bib: true },
  suit3: { sleeve: 'long', color: '#2b2f4a', accent: '#c9a227' },
  track_jacket: { sleeve: 'long', armStripe: true, accent: '#ffffff' },
  jump_top: { sleeve: 'long', accent: '#1d1b2e' },
  pj_top: { sleeve: 'long', pattern: 'gingham', accent: '#ffffff' },
  scrub_top: { sleeve: 'short', color: '#2fa58a' },
  chef_jacket: { sleeve: 'long', color: '#fbfbf6', accent: '#1d1b2e' },
  gi_top: { sleeve: 'long', color: '#fbfbf6', accent: '#1d1b2e' },
  astro_top: { sleeve: 'long', puffy: true, color: '#f4f4f2', accent: '#39c6ff' },
  cheer_top: { sleeve: 'none', accent: '#ffffff' },
  school_top: { sleeve: 'long', shirt: '#f6f4ee', blazer: true, color: '#2b3a6b', accent: '#e0463c' },
});
// more bottoms (and the outfits' own). skirt.len can be 'midi', 'ankle' or 'floor' as well as a length
Object.assign(BOTTOMS, {
  bottom_chinos: { legs: 'pants', crease: true, cuffs: true },
  bottom_sweats: { legs: 'pants', jogger: true, baggy: 1.12 },
  bottom_cargoshorts: { legs: 'shorts', long: true, pockets: true, baggy: 1.1 },
  bottom_capri: { legs: 'capri' },
  bottom_miniskirt: { legs: 'skin', socks: true, skirt: { len: 0.19, flare: 0.31 } },
  bottom_pleated: { legs: 'skin', socks: true, skirt: { len: 0.27, flare: 0.42, pleats: 14 } },
  bottom_longskirt: { legs: 'skin', skirt: { len: 'ankle', flare: 0.38 } },
  bottom_widelegs: { legs: 'pants', baggy: 1.1, flare: true, crease: true },
  bottom_plaidpants: { legs: 'pants', pattern: 'plaid', crease: true },
  suitpants: { legs: 'pants', crease: true },
  tuxpants: { legs: 'pants', crease: true, satin: true },
  trackpants: { legs: 'pants', jogger: true, stripe: true },
  jumppants: { legs: 'pants', cuffs: true },
  pjpants: { legs: 'pants', pattern: 'gingham', cuffs: true },
  checkpants: { legs: 'pants', pattern: 'check' },
  gipants: { legs: 'pants', baggy: 1.16, flare: true },
  astropants: { legs: 'pants', baggy: 1.22, puffy: true, cuffs: true },
  skirt_sun: { legs: 'skin', skirt: { len: 0.3, flare: 0.44, pattern: 'floral', frill: true } },
  skirt_slip: { legs: 'skin', skirt: { len: 'midi', flare: 0.32, shiny: true } },
  skirt_maxi: { legs: 'skin', skirt: { len: 'ankle', flare: 0.42, belt: true } },
  skirt_party: { legs: 'skin', skirt: { len: 0.24, flare: 0.5, frill: true, tulle: true } },
  skirt_lbd: { legs: 'skin', skirt: { len: 0.22, flare: 0.3 } },
  skirt_gown: { legs: 'skin', skirt: { len: 'floor', flare: 0.62, sparkle: true, belt: true } },
  skirt_princess: { legs: 'skin', skirt: { len: 'floor', flare: 0.72, tiers: true, belt: true } },
  skirt_bridal: { legs: 'skin', skirt: { len: 'floor', flare: 0.66, sparkle: true, tiers: true } },
  skirt_tennis: { legs: 'skin', socks: true, skirt: { len: 0.2, flare: 0.38, pleats: 16 } },
  skirt_pinafore: { legs: 'skin', socks: true, skirt: { len: 0.27, flare: 0.36 } },
  skirt_cheer: { legs: 'skin', socks: true, skirt: { len: 0.18, flare: 0.42, pleats: 14, hem: true } },
  skirt_school: { legs: 'skin', socks: true, skirt: { len: 0.25, flare: 0.42, pleats: 16, pattern: 'plaid' } },
  skirt_kimono: { legs: 'skin', skirt: { len: 'ankle', flare: 0.3, pattern: 'floral', wrap: true } },
});
// full outfits: a top and a bottom (worn instead of yours), in the outfit's colour + accent
const OUTFITS = {
  outfit_sundress: { top: 'dress_strap', bottom: 'skirt_sun', color: '#ffd84d', accent: '#ffffff' },
  outfit_pajamas: { top: 'pj_top', bottom: 'pjpants', color: '#8fd3ff', accent: '#ffffff' },
  outfit_pinafore: { top: 'dress_pinafore', bottom: 'skirt_pinafore', color: '#c2185b', accent: '#ffd84d' },
  outfit_tennis: { top: 'dress_polo', bottom: 'skirt_tennis', color: '#ffffff', accent: '#2f9e44' },
  outfit_slip: { top: 'dress_slip', bottom: 'skirt_slip', color: '#e3d9ff' },
  outfit_maxi: { top: 'dress_short', bottom: 'skirt_maxi', color: '#ff7a59', accent: '#8a3d00' },
  outfit_lbd: { top: 'dress_sleeveless', bottom: 'skirt_lbd', color: '#1d1b22' },
  outfit_tracksuit: { top: 'track_jacket', bottom: 'trackpants', color: '#3b5bdb', accent: '#ffffff' },
  outfit_jumpsuit: { top: 'jump_top', bottom: 'jumppants', color: '#2f9e44', accent: '#1d1b2e' },
  outfit_school: { top: 'school_top', bottom: 'skirt_school', color: '#2b3a6b', accent: '#e0463c' },
  outfit_cheer: { top: 'cheer_top', bottom: 'skirt_cheer', color: '#e0463c', accent: '#ffffff' },
  outfit_scrubs: { top: 'scrub_top', bottom: 'suitpants', color: '#2fa58a' },
  outfit_chef: { top: 'chef_jacket', bottom: 'checkpants', color: '#fbfbf6', accent: '#1d1b2e', pants: '#fbfbf6', pantsAccent: '#1d1b2e' },
  outfit_gi: { top: 'gi_top', bottom: 'gipants', color: '#fbfbf6', accent: '#1d1b2e' },
  outfit_suit: { top: 'top_suit', bottom: 'suitpants', color: '#23263f', accent: '#e0463c' },
  outfit_threepiece: { top: 'suit3', bottom: 'suitpants', color: '#2b2f4a', accent: '#c9a227' },
  outfit_gown: { top: 'dress_off', bottom: 'skirt_gown', color: '#7048e8', accent: '#ffd84d' },
  outfit_kimono: { top: 'top_kimono', bottom: 'skirt_kimono', color: '#c2185b', accent: '#ffc53d' },
  outfit_princess: { top: 'dress_puff', bottom: 'skirt_princess', color: '#ffa3cf', accent: '#ffd84d' },
  outfit_tux: { top: 'top_tux', bottom: 'tuxpants', color: '#15141c', accent: '#15141c' },
  outfit_wedding: { top: 'dress_bridal', bottom: 'skirt_bridal', color: '#fbfbf8', accent: '#f4e8cf' },
  outfit_astronaut: { top: 'astro_top', bottom: 'astropants', color: '#f4f4f2', accent: '#39c6ff' },
};
/** The capsule torso's radius at height y (its own frame, before the torso's scale). */
const torsoR = (y) => (Math.abs(y) <= 0.1 ? 0.25 : Math.sqrt(Math.max(0, 0.0625 - (Math.abs(y) - 0.1) ** 2)));
/** A fitted piece of clothing following the torso from y0 up to y1 (tank tops, bodices, vests). */
function bodiceGeo(y0, y1, lift = 0.012) {
  return geo(`bodice${y0},${y1},${lift}`, () => {
    const pts = [];
    for (let i = 0; i <= 18; i++) { const y = y0 + (y1 - y0) * (i / 18); pts.push(new THREE.Vector2(torsoR(y) + lift, y)); }
    return new THREE.LatheGeometry(pts, 36);
  });
}
/** A strap over one shoulder (at x), from the front edge of a top (height y) round to the back: a flat
 *  ribbon `w` wide lying right on the body. */
function strapGeo(x, y, w) {
  return geo(`strap2${x},${y},${w}`, () => {
    const xs = x / 1.02, rho = Math.sqrt(Math.max(0.001, 0.0625 - xs * xs)), lift = 0.006;
    // in the torso's unscaled frame: up the front, over the top of the shoulder, down the back
    const path = [];
    for (let k = 0; k <= 4; k++) { const yy = y + (0.1 - y) * (k / 4); path.push([yy, rho, 0, 1]); }
    for (let k = 1; k < 16; k++) { const a = (k / 16) * Math.PI; path.push([0.1 + Math.sin(a) * rho, Math.cos(a) * rho, Math.sin(a), Math.cos(a)]); }
    for (let k = 0; k <= 4; k++) { const yy = 0.1 + (y - 0.1) * (k / 4); path.push([yy, -rho, 0, -1]); }
    const pos = [], idx = [];
    path.forEach(([yy, z, ny, nz], i) => {
      for (const side of [-1, 1]) pos.push((xs + side * w / 2) * 1.02, yy + ny * lift, (z + nz * lift) * 0.8);
      if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}
/**
 * Bend the flat pieces sewn onto a top (plackets, stripes, zips, panels, straps…) round the curve of
 * the body, so they lie on it from top to bottom instead of sticking out where the torso narrows.
 * Every vertex keeps how far it was off the body at the piece's middle.
 */
function conformToTorso(torso, from) {
  const surf = (y, x, z) => {
    const r = torsoR(Math.max(-0.35, Math.min(0.35, y))), a = Math.atan2(x, z);
    return 1 / Math.sqrt((Math.sin(a) / (r * 1.02)) ** 2 + (Math.cos(a) / (r * 0.8)) ** 2 + 1e-9);
  };
  const v = new THREE.Vector3(), inv = new THREE.Matrix4();
  for (const m of torso.children.slice(from)) {
    if (!m.isMesh || m.geometry.type !== 'BoxGeometry') continue;
    const { width, height, depth } = m.geometry.parameters;
    m.updateMatrix();
    const centre = new THREE.Vector3().setFromMatrixPosition(m.matrix);
    // only pieces lying on the surface that run up or down it far enough to need bending
    if (Math.abs(Math.hypot(centre.x, centre.z) - surf(centre.y, centre.x, centre.z)) > 0.08) continue;
    const tall = new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position).applyMatrix4(m.matrix);
    if (tall.max.y - tall.min.y < 0.07) continue;
    const g = new THREE.BoxGeometry(width, height, depth, Math.max(1, Math.round(width / 0.04)), 10, 1);
    const p = g.attributes.position;
    inv.copy(m.matrix).invert();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrix);
      const rad = Math.hypot(v.x, v.z);
      if (rad < 1e-4) continue;
      const k = (surf(v.y, v.x, v.z) + rad - surf(centre.y, v.x, v.z)) / rad;
      v.x *= k; v.z *= k;
      v.applyMatrix4(inv);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    m.geometry = g;
    for (const o of m.children) if (o.userData.outline) o.geometry = g;
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

/** How far down from the crown (radians) the hairline sits in direction phi (0 = front). */
function hairline(phi, front, side, back) {
  const c = Math.cos(phi);
  return c >= 0 ? side + (front - side) * Math.pow(c, 1.4) : side + (back - side) * Math.pow(-c, 0.35);
}

/** A hair shell hugging the head down to a hairline: high over the forehead, low at the nape.
 *  inner > 0 closes it: a second layer at that radius (the scalp) joined to the outside by a rim along
 *  the hairline, so it's solid hair, not a hollow helmet you can see into. */
function shellGeo(front, side, back, r, inner = 0, thin = false) {
  return geo(`shell${front},${side},${back},${r},${inner},${thin}`, () => {
    const U = 56, V = 18, pos = [], nor = [], uv = [], idx = [];
    const layer = (rad, sign, taper = false) => {
      for (let i = 0; i <= U; i++) {
        const phi = (i / U) * TAU;
        const lim = hairline(phi, front, side, back);
        for (let j = 0; j <= V; j++) {
          const th = (j / V) * lim;
          const n = [Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi)];
          // a closed cap thins out towards its edge, so it meets the scalp like hair does (no thick
          // ledge round the hairline)
          // (less so at the back, where the locks at the nape hang over the edge anyway)
          const k = taper ? Math.pow(Math.max(0, (j / V - 0.55) / 0.45), 1.4) * 0.88 * Math.min(1, Math.max(0.3, (Math.cos(phi) + 0.7) / 0.7)) : 0;
          const rr = rad + (inner - rad) * k;
          pos.push(n[0] * rr, n[1] * rr, n[2] * rr);
          nor.push(n[0] * sign, n[1] * sign, n[2] * sign);
          uv.push(i / U, j / V); // u: round the head, v: crown -> hairline
        }
      }
    };
    layer(r, 1, thin);
    for (let i = 0; i < U; i++) {
      for (let j = 0; j < V; j++) {
        const a = i * (V + 1) + j, b = (i + 1) * (V + 1) + j;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const outer = pos.length / 3;
    if (inner) {
      layer(inner, -1);
      for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
        const a = outer + i * (V + 1) + j, b = outer + (i + 1) * (V + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      // the rim: its own vertices (shaded like the outside of the hair), outer edge to inner edge
      const rim = pos.length / 3;
      for (let i = 0; i <= U; i++) {
        const o = (i * (V + 1) + V) * 3, n = (outer + i * (V + 1) + V) * 3;
        pos.push(pos[o], pos[o + 1], pos[o + 2], pos[n], pos[n + 1], pos[n + 2]);
        nor.push(nor[o], nor[o + 1], nor[o + 2], nor[o], nor[o + 1], nor[o + 2]);
        uv.push(i / U, 1, i / U, 1);
      }
      for (let i = 0; i < U; i++) { const a = rim + i * 2, b = a + 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.userData.outer = outer; // (vertices before this are the outside of the hair)
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  });
}

function shell(head, mat, { front = 0.95, side = 1.45, back = 2.25, lift = 0.035, outline = OUT } = {}) {
  return part(head, shellGeo(front, side, back + 0.18, R + lift, R - 0.012), mat, { outline });
}

/** Point at angle phi (0 = front) and theta (down from the crown) on a sphere of radius r. */
const onHead = (phi, th, r = R) => new THREE.Vector3(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi)).multiplyScalar(r);

function fringe(head, mat, count = 4, { y = 0.25, spread = 0.44, size = 0.13 } = {}) {
  for (let i = 0; i < count; i++) {
    const x = -spread / 2 + (i * spread) / (count - 1);
    const p = onFace(x, y - Math.abs(x) * 0.15, -0.02);
    // tall enough to tuck up under the hair shell, so there's never a strip of forehead showing above it
    part(head, sphere(size, 16, 12), mat, { p: [p.x, p.y + size * 0.15, p.z], s: [1.15, 0.8, 0.6], q: faceTo(p), outline: OUT_THIN }).userData.fringe = true;
  }
}

/** A hanging curtain of hair around the back and sides (long hair, bobs). */
function curtain(head, mat, { len = 0.62, flare = 0.1, wrap = 0.35, top = 0 } = {}) {
  // a lathe that starts up under the hair shell hugging the skull, then falls from the widest point
  // with a soft flare and tucks under at the ends, so it reads as one piece with the rest of the hair
  const g = geo(`curtain2${len},${flare},${wrap}`, () => {
    const pts = [];
    const r0 = R + 0.05;
    for (let k = 0; k <= 6; k++) {
      const a = 0.75 - (k / 6) * 0.75; // angle above the equator
      pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0));
    }
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      pts.push(new THREE.Vector2(r0 + flare * Math.pow(t, 1.6), -len * t));
    }
    pts.push(new THREE.Vector2(r0 + flare - 0.035, -len - 0.035));
    pts.push(new THREE.Vector2(r0 + flare - 0.08, -len - 0.02));
    return new THREE.LatheGeometry(pts.reverse(), 40, Math.PI / 2 - wrap, Math.PI + wrap * 2);
  });
  const m = toon(`#${mat.color.getHexString()}`, { side: THREE.DoubleSide });
  part(head, g, m, { p: [0, top, -0.01], s: [1, 1, 0.94], outline: OUT_THIN });
}

/** A tied tail of hair along a curve of points, with a scrunchie at the root. */
function tail(head, mat, pts, r0, r1, tie = '#ff5d73') { // (tie: the scrunchie's colour)
  const v = pts.map((p) => new THREE.Vector3(...p));
  taper(head, v, r0, r1, mat);
  part(head, sphere(r1 * 1.15, 10, 8), mat, { p: v[v.length - 1].toArray(), outline: OUT_THIN });
  const dir = v[1].clone().sub(v[0]);
  part(head, torus(r0 * 0.9, 0.035, TAU, 8, 20), toon(tie), { p: v[0].clone().lerp(v[1], 0.45).toArray(), q: pointTo(dir).multiply(new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2)), outline: null });
}

/** Blobs scattered over the scalp, skipping the face (curls, afros). */
function blobs(head, mat, { dist, size, step, front = 1.0, side = 1.55, back = 2.2, outline = null }) {
  for (let th = 0.15; th < 2.4; th += step) {
    const ring = Math.max(1, Math.round((TAU * Math.sin(th)) / step));
    for (let k = 0; k < ring; k++) {
      const phi = (k / ring) * TAU + th * 1.7;
      if (th > hairline(phi, front, side, back)) continue;
      part(head, sphere(size, 12, 10), mat, { p: onHead(phi, th, dist).toArray(), outline });
    }
  }
}

const bigEyes = (style) => style === 'eyes_sparkle';
function heartShape(r) {
  const s = new THREE.Shape();
  s.moveTo(0, -r * 0.9);
  s.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.9, r * 1.0, 0, r * 0.35);
  s.bezierCurveTo(r * 0.9, r * 1.0, r * 1.3, -r * 0.1, 0, -r * 0.9);
  return s;
}
function starShape(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}

function mix(a, b, k) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
}

/** Neat braided rows running from the front hairline to the nape and hanging down past it as braid
 *  ends; `lineup`: a sharp edged hairline. */
function cornrows(head, mat, L, lineup) {
  const scalp = toon(mix(L.hairColor, L.skin, lineup ? 0.2 : 0.4));
  shell(head, scalp, { front: lineup ? 1.0 : 0.95, side: 1.5, back: 2.2, lift: 0.006, outline: null });
  const shade = toon(mix(L.hairColor, '#000000', 0.2));
  for (let k = -5; k <= 5; k++) {
    const c = k * 0.074, r = Math.sqrt((R + 0.024) ** 2 - c * c);
    const pts = [];
    const u0 = Math.asin(Math.min(1, 0.24 / r)), u1 = Math.PI + 0.95 - Math.abs(k) * 0.05;
    for (let i = 0; i <= 14; i++) {
      const u = u0 + ((u1 - u0) * i) / 14;
      pts.push(new THREE.Vector3(c * (1 + 0.12 * Math.sin(u)), Math.sin(u) * r, Math.cos(u) * r));
    }
    // the braid carries on past the nape and hangs down the neck
    const end = pts[pts.length - 1];
    const len = 0.18 + ((k + 5) % 3) * 0.05;
    pts.push(end.clone().add(new THREE.Vector3(c * 0.2, -len * 0.5, -0.03)), end.clone().add(new THREE.Vector3(c * 0.35, -len, -0.02)));
    strand(head, k % 2 ? shade : mat, pts, 0.04, 0.03, { bumps: 22, bumpAmt: 0.16, radial: 7, segs: 60 });
  }
  if (lineup) {
    // a crisp, dark edge right along the front hairline and temples
    for (let i = 0; i <= 12; i++) {
      const p = onFace(-0.3 + i * 0.05, 0.24 - Math.abs(-0.3 + i * 0.05) * 0.25, 0.012);
      part(head, box(0.055, 0.02, 0.02), toon(mix(L.hairColor, '#000000', 0.3)), { p: p.toArray(), q: faceTo(p), outline: null });
    }
  }
}

/**
 * One strand of hair (a lock, a loc, a spike of a mane): a smooth tube along a curve through `pts`,
 * tapering from r0 at the root to r1, closed with a rounded (or pointed) tip. `bumps` adds the knobbly
 * rhythm of real locs/twists; `flat` squashes it into a ribbon (fringes, layered cuts).
 */
function strandGeo(pts, r0, r1, { bumps = 0, bumpAmt = 0.14, flat = 1, point = false, radial = 9, segs = 26 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    let r = r0 + (r1 - r0) * t;
    if (point) r *= 1 - Math.pow(t, 3) * 0.92;
    if (bumps) r *= 1 + Math.sin(t * bumps * TAU) * bumpAmt;
    N.copy(frames.normals[i]); B.copy(frames.binormals[i]);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const cx = Math.cos(a) * r, cy = Math.sin(a) * r * flat;
      pos.push(P.x + N.x * cx + B.x * cy, P.y + N.y * cx + B.y * cy, P.z + N.z * cx + B.z * cy);
    }
  }
  // rounded cap at the tip
  const end = curve.getPointAt(1), dir = curve.getTangentAt(1);
  const capI = pos.length / 3;
  pos.push(end.x + dir.x * r1 * 0.9, end.y + dir.y * r1 * 0.9, end.z + dir.z * r1 * 0.9);
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, b, c, b, d, c);
    }
  }
  const last = segs * radial;
  for (let j = 0; j < radial; j++) idx.push(last + j, last + ((j + 1) % radial), capI);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function strand(head, mat, pts, r0, r1, opts = {}) {
  const key = `strand${pts.map((v) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`).join('|')}${r0},${r1},${JSON.stringify(opts)}`;
  return part(head, geo(key, () => strandGeo(pts, r0, r1, opts)), mat, { outline: opts.outline === undefined ? OUT_THIN : opts.outline });
}
/** A path that hugs the scalp from (phi0, th0) to (phi1, th1), then falls `len` down and out. */
function lockPath(phi0, th0, phi1, th1, len, { lift = 0.03, out = 0.07, sway = 0, curl = 0 } = {}) {
  const pts = [];
  for (let k = 0; k <= 3; k++) {
    const t = k / 3;
    pts.push(onHead(phi0 + (phi1 - phi0) * t, th0 + (th1 - th0) * t, R + lift + t * 0.02));
  }
  const edge = pts[pts.length - 1];
  const o = new THREE.Vector3(edge.x, 0, edge.z).normalize();
  const side = new THREE.Vector3(-o.z, 0, o.x);
  for (let k = 1; k <= 3; k++) {
    const t = k / 3;
    pts.push(edge.clone().addScaledVector(o, out * Math.sqrt(t) + curl * t * t).addScaledVector(side, Math.sin(t * 2.2) * sway).add(new THREE.Vector3(0, -len * t, 0)));
  }
  return pts;
}

const hairTexCache = new Map();
/** 360 waves: rippling bands of light and dark, circling out from the crown. */
function wavesMaterial(color) {
  const key = `waves${color}`;
  if (!hairTexCache.has(key)) {
    const tex = canvasTexture(256, 256, (c) => {
      c.fillStyle = color; c.fillRect(0, 0, 256, 256);
      const light = mix(color, '#ffffff', 0.22), dark = mix(color, '#000000', 0.45);
      for (let row = 0; row < 16; row++) {
        const y0 = 6 + row * 16;
        c.lineWidth = 5;
        c.strokeStyle = row % 2 ? dark : light;
        c.beginPath();
        for (let x = 0; x <= 256; x += 4) c.lineTo(x, y0 + Math.sin((x / 256) * Math.PI * 2 * 12 + row * 0.7) * 4);
        c.stroke();
      }
    });
    tex.wrapS = THREE.RepeatWrapping;
    hairTexCache.set(key, new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, gradientMap: toon('#ffffff').gradientMap }));
  }
  return hairTexCache.get(key);
}
/** A scalp with neat box parts (the skin showing between sections), for locs and twists. */
function partsMaterial(color, skin) {
  const key = `parts${color}${skin}`;
  if (!hairTexCache.has(key)) {
    const tex = canvasTexture(256, 256, (c) => {
      c.fillStyle = mix(color, '#000000', 0.15); c.fillRect(0, 0, 256, 256);
      c.strokeStyle = mix(skin, color, 0.25); c.lineWidth = 5;
      for (let i = -256; i < 512; i += 42) {
        c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 256, 256); c.stroke();
        c.beginPath(); c.moveTo(i, 256); c.lineTo(i + 256, 0); c.stroke();
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    hairTexCache.set(key, new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, gradientMap: toon('#ffffff').gradientMap }));
  }
  return hairTexCache.get(key);
}
const tieColor = (L, def) => L.hairTie || def;
/** Fine strands of hair: soft streaks running from the crown to the hairline (a grey map over the colour). */
const strandTexture = canvasTexture(256, 128, (c) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 128);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 256, w = 1 + rnd() * 2.5, dark = rnd() < 0.7;
    c.strokeStyle = dark ? `rgba(0,0,0,${0.08 + rnd() * 0.1})` : `rgba(255,255,255,${0.3 + rnd() * 0.3})`;
    c.lineWidth = w;
    c.beginPath();
    for (let y = 0; y <= 128; y += 8) c.lineTo(x + Math.sin(y / 24 + i) * 3, y);
    c.stroke();
  }
});
strandTexture.wrapS = strandTexture.wrapT = THREE.RepeatWrapping;
strandTexture.repeat.set(3, 1);
const strandCache = new Map();
function strandMaterial(color) {
  if (!strandCache.has(color)) strandCache.set(color, new THREE.MeshToonMaterial({ color, map: strandTexture, gradientMap: toon('#ffffff').gradientMap, side: THREE.DoubleSide }));
  return strandCache.get(color);
}

const HAIR = {
  hair_short(head, mat) { shell(head, mat, { front: 0.9, side: 1.4, back: 2.15 }); fringe(head, mat); },
  // ---- braids, locs, fades and friends ----
  hair_cornrows(head, mat, L) { cornrows(head, mat, L, false); },
  hair_cornrows_lineup(head, mat, L) { cornrows(head, mat, L, true); },
  hair_dreads(head, mat, L) {
    // a big, full mop of chunky locs: they spring up from the crown for volume, arc over the head and
    // hang all round, as bangs over the forehead, to the jaw at the sides and a bit longer at the back
    shell(head, mat, { front: 0.95, side: 1.5, back: 2.2, lift: 0.03 });
    const shade = toon(mix(L.hairColor, '#000000', 0.25)), cuff = toon(tieColor(L, '#f2c14e'));
    let n = 0;
    const rings = [[0.08, 7], [0.36, 13], [0.66, 19], [0.95, 23]];
    for (const [th0, count] of rings) {
      for (let k = 0; k < count; k++) {
        const phi = (k / count) * TAU + th0 * 2.3;
        const front = Math.cos(phi); // 1 = over the face
        const thEnd = front > 0.35 ? 0.98 + (1 - front) * 0.35 : 1.35 + Math.max(0, -front) * 0.25;
        if (th0 > thEnd - 0.15) continue;
        const root = onHead(phi, th0, R + 0.03);
        const mid = onHead(phi, (th0 + thEnd) / 2, R + 0.13 - th0 * 0.05);
        const edge = onHead(phi, thEnd, R + 0.1);
        const o = new THREE.Vector3(edge.x, 0, edge.z).normalize();
        // how far they hang: short bangs at the front, jaw length at the sides, longer at the back
        const len = front > 0.35 ? 0.1 + ((n * 7) % 3) * 0.03 : 0.2 + Math.max(0, -front) * 0.16 + ((n * 5) % 4) * 0.035;
        const tip = edge.clone().addScaledVector(o, 0.04).add(new THREE.Vector3(0, -len, 0));
        const m = n % 3 === 0 ? shade : mat;
        strand(head, m, [root, mid, edge, edge.clone().lerp(tip, 0.55).addScaledVector(o, 0.03), tip], 0.068, 0.06, { bumps: 5, bumpAmt: 0.07, radial: 9, segs: 22 });
        // gold cuffs on a few of the hanging locs
        if (n % 4 === 1 && front <= 0.35) part(head, cyl(0.072, 0.072, 0.05, 12), cuff, { p: edge.clone().lerp(tip, 0.6).addScaledVector(o, 0.02).toArray(), q: pointTo(tip.clone().sub(edge)), outline: null });
        n++;
      }
    }
  },
  hair_twists(head, mat, L) {
    // short dreads / sponge twists: little knobbly coils all over, springing up and out
    shell(head, mat, { front: 0.95, side: 1.45, back: 2.15, lift: 0.015 });
    const shade = toon(mix(L.hairColor, '#000000', 0.15));
    let n = 0;
    for (let th = 0.12; th < 1.95; th += 0.24) {
      const ring = Math.max(1, Math.round((TAU * Math.sin(th)) / 0.24));
      for (let k = 0; k < ring; k++) {
        const phi = (k / ring) * TAU + th * 2.1;
        if (th > hairline(phi, 0.9, 1.4, 2.1) - 0.05) continue;
        const nrm = onHead(phi, th, 1).normalize();
        const up = nrm.clone().add(new THREE.Vector3(0, 0.45, 0)).normalize();
        const len = 0.08 + ((k * 3 + Math.round(th * 10)) % 3) * 0.03;
        const a = nrm.clone().multiplyScalar(R + 0.01);
        const b = a.clone().addScaledVector(up, len * 0.55);
        const c = a.clone().addScaledVector(up, len).add(new THREE.Vector3(0, -0.02 * Math.sin(th), 0));
        strand(head, n++ % 3 === 0 ? shade : mat, [a, b, c], 0.042, 0.036, { bumps: 3, bumpAmt: 0.18, radial: 7, segs: 12 });
      }
    }
  },
  hair_fade(head, mat, L) {
    // short on top, fading down to skin on the sides and back, with a crisp line-up
    shell(head, mat, { front: 0.95, side: 1.02, back: 1.2, lift: 0.03 });
    shell(head, toon(mix(L.hairColor, L.skin, 0.45)), { front: 0.95, side: 1.35, back: 1.8, lift: 0.012, outline: null });
    shell(head, toon(mix(L.hairColor, L.skin, 0.75)), { front: 0.95, side: 1.62, back: 2.2, lift: 0.004, outline: null });
    for (let i = 0; i < 9; i++) {
      const p = onFace(-0.2 + i * 0.05, 0.26 + Math.sin(i) * 0.01, 0.035);
      part(head, sphere(0.06, 10, 8), mat, { p: p.toArray(), s: [1.2, 0.5, 0.6], q: faceTo(p), outline: null });
    }
  },
  hair_liberty(head, mat, L) {
    // liberty spikes: a helmet of hair with jagged little points round its edge, and long needle-sharp
    // spikes bursting out in every direction, like a sea urchin
    shell(head, mat, { front: 0.95, side: 1.6, back: 2.3, lift: 0.05 });
    const shade = toon(mix(L.hairColor, '#000000', 0.2));
    // short jagged points hanging round the edge (fringe, sides and nape)
    for (let i = 0; i < 26; i++) {
      const phi = (i / 26) * TAU;
      const th = hairline(phi, 0.95, 1.6, 2.3) - 0.06;
      const base = onHead(phi, th, R + 0.05);
      const tip = base.clone().add(new THREE.Vector3(0, -0.08 - (i % 3) * 0.04, 0)).addScaledVector(base.clone().setY(0).normalize(), 0.02);
      strand(head, i % 2 ? shade : mat, [base.clone().add(new THREE.Vector3(0, 0.05, 0)), base, tip], 0.045, 0.006, { point: true, flat: 0.5, radial: 6, segs: 6 });
    }
    // the big spikes, spread evenly over the head
    const N = 44;
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 1.25, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996;
      const dir = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
      const th = Math.acos(y), phi = Math.atan2(dir.x, dir.z);
      if (th > hairline(phi, 0.95, 1.6, 2.3) - 0.1) continue;
      const len = 0.38 + ((i * 7) % 5) * 0.07;
      part(head, cone(0.05, len, 8), i % 3 === 0 ? shade : mat, { p: dir.clone().multiplyScalar(R + 0.02 + len / 2).toArray(), q: pointTo(dir), outline: OUT_THIN });
    }
  },
  hair_waves(head, mat, L) {
    // 360 waves: a close, brushed cap with ripples all the way round, a sharp line-up at the forehead
    // and squared-off corners at the temples
    shell(head, wavesMaterial(hex(L.hairColor)), { front: 0.98, side: 1.55, back: 2.2, lift: 0.03 });
    const edge = toon(mix(L.hairColor, '#000000', 0.25));
    for (const sx of [-1, 1]) {
      const p = onHead(sx * 1.32, 1.3, R + 0.032);
      part(head, box(0.07, 0.12, 0.03), edge, { p: p.toArray(), q: faceTo(new THREE.Vector3(p.x, 0, p.z)), outline: null });
    }
    for (let i = 0; i <= 10; i++) {
      const x = -0.28 + i * 0.056, pt = onFace(x, 0.25 - Math.abs(x) * 0.2, 0.028);
      part(head, box(0.058, 0.018, 0.02), edge, { p: pt.toArray(), q: faceTo(pt), outline: null });
    }
  },
  hair_freeform(head, mat, L) {
    // wild freeform: a big shaggy mass of jagged, pointed locks sticking out every which way, spiky
    // bangs hanging over the eyes, and plenty of volume round the sides and back
    shell(head, mat, { front: 0.95, side: 1.55, back: 2.3, lift: 0.04 });
    const shade = toon(mix(L.hairColor, '#000000', 0.25));
    const N = 90;
    for (let i = 0; i < N; i++) {
      // spread evenly over the head (golden-angle spiral), skipping the face
      const y = 1 - (i / (N - 1)) * 1.45, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996;
      const nrm = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
      const th = Math.acos(Math.max(-1, Math.min(1, y))), phi = Math.atan2(nrm.x, nrm.z);
      if (th > hairline(phi, 0.95, 1.75, 2.45)) continue;
      const front = Math.cos(phi) * Math.sin(th);
      const base = nrm.clone().multiplyScalar(R + 0.05);
      // most spikes stick out and droop; the ones over the face hang down as bangs
      const dir = nrm.clone().multiplyScalar(front > 0.5 ? 0.25 : 0.85).add(new THREE.Vector3(((i * 7) % 5 - 2) * 0.08, front > 0.5 ? -1 : -0.35 - Math.max(0, 0.3 - y) * 0.6, 0)).normalize();
      const len = (front > 0.5 ? 0.14 + ((i * 5) % 3) * 0.03 : 0.22 + ((i * 11) % 7) * 0.035); // (bangs stop above the eyes)
      const kink = new THREE.Vector3(Math.sin(i * 1.7), 0.2, Math.cos(i * 2.3)).multiplyScalar(0.04);
      const tip = base.clone().addScaledVector(dir, len);
      strand(head, i % 3 === 0 ? shade : mat, [base, base.clone().lerp(tip, 0.5).add(kink), tip], 0.07, 0.01, { point: true, flat: 0.55, radial: 7, segs: 10 });
    }
  },
  hair_spiky(head, mat) {
    shell(head, mat, { front: 0.9, side: 1.4, back: 2.1 });
    const dirs = [[0, 1, 0.15], [0.5, 0.85, 0.15], [-0.5, 0.85, 0.15], [0.35, 0.75, -0.5], [-0.35, 0.75, -0.5], [0, 0.65, -0.75],
      [0.78, 0.55, -0.2], [-0.78, 0.55, -0.2], [0.22, 0.85, 0.5], [-0.26, 0.85, 0.45]];
    for (const d of dirs) {
      const v = new THREE.Vector3(...d).normalize();
      part(head, cone(0.11, 0.34, 10), mat, { p: v.clone().multiplyScalar(R + 0.12).toArray(), q: pointTo(v), outline: OUT_THIN });
    }
    fringe(head, mat);
  },
  hair_long(head, mat) {
    shell(head, mat, { front: 0.95, side: 1.5, back: 2.4 });
    curtain(head, mat, { len: 0.66, flare: 0.1, wrap: 0.32 });
    fringe(head, mat, 5, { spread: 0.36 });
  },
  hair_bob(head, mat) {
    // a rounded chin-length bob: full at the sides, curling under at the ends, with a soft full fringe
    shell(head, mat, { front: 1.05, side: 1.62, back: 2.35 });
    curtain(head, mat, { len: 0.36, flare: 0.1, wrap: 0.62 });
    fringe(head, mat, 6, { y: 0.24, spread: 0.52, size: 0.14 });
  },
  hair_ringlets(head, mat) {
    // long curly hair: springy curls over the head that tumble down past the shoulders
    shell(head, mat, { front: 1.0, side: 1.55, back: 2.25, lift: 0.02 });
    blobs(head, mat, { dist: R + 0.05, size: 0.12, step: 0.3, front: 0.95, outline: OUT_THIN });
    for (let i = 0; i < 11; i++) {
      const a = Math.PI / 2 + 0.15 + (i / 10) * (Math.PI - 0.3);
      for (let k = 0; k < 4; k++) {
        const r = R + 0.06 + k * 0.012;
        part(head, sphere(0.1 - k * 0.008, 12, 10), mat, { p: [Math.sin(a) * r, -0.12 - k * 0.15, Math.cos(a) * r * 0.95], outline: OUT_THIN });
        if (i === 0 || i === 10) break;
      }
    }
  },
  hair_curlybob(head, mat) {
    // short bouncy curls that stop at the jaw
    shell(head, mat, { front: 0.95, side: 1.6, back: 2.3, lift: 0.02 });
    blobs(head, mat, { dist: R + 0.06, size: 0.13, step: 0.3, front: 0.92, side: 1.7, back: 2.3, outline: OUT_THIN });
    for (let i = 0; i < 13; i++) {
      const a = Math.PI / 2 - 0.1 + (i / 12) * (Math.PI + 0.2);
      part(head, sphere(0.12, 12, 10), mat, { p: [Math.sin(a) * (R + 0.06), -0.14, Math.cos(a) * (R + 0.04)], outline: OUT_THIN });
    }
  },
  hair_puffs(head, mat, L) {
    // two big, round, fluffy afro puffs high on the head, tied off with scrunchies, hair slicked back
    // with a neat centre part
    shell(head, mat, { front: 0.95, side: 1.5, back: 2.25, lift: 0.015 });
    part(head, box(0.012, 0.004, 0.36), toon(mix(L.hairColor, L.skin, 0.5)), { p: [0, R + 0.02, 0.04], r: [0.1, 0, 0], outline: null });
    for (const sx of [-1, 1]) {
      const c = new THREE.Vector3(sx * 0.29, 0.43, -0.06);
      part(head, sphere(0.2, 20, 16), mat, { p: c.toArray(), s: [1, 0.95, 1] });
      // a fuzzy surface of little curls over the puff
      for (let k = 0; k < 26; k++) {
        const y = 1 - (k / 25) * 1.6, r = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.39996;
        const v = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        if (v.y < -0.45) continue;
        part(head, sphere(0.06, 10, 8), mat, { p: c.clone().addScaledVector(v, 0.19).toArray(), outline: null });
      }
      part(head, torus(0.1, 0.03, TAU, 8, 20), toon(tieColor(L, '#ff5d73')), { p: c.clone().add(new THREE.Vector3(-sx * 0.05, -0.17, 0.01)).toArray(), r: [Math.PI / 2, sx * 0.45, 0], outline: null });
    }
  },
  hair_ponytail(head, mat, L) {
    shell(head, mat, { front: 0.95, side: 1.5, back: 2.3 });
    // gathered at the back of the head, tied, then falling down the neck
    part(head, sphere(0.15, 16, 12), mat, { p: [0, 0.16, -0.4], s: [1, 0.9, 0.8], outline: OUT_THIN });
    tail(head, mat, [[0, 0.16, -0.44], [0, 0.06, -0.52], [0, -0.1, -0.53], [0, -0.3, -0.47], [0, -0.48, -0.38]], 0.14, 0.065, tieColor(L, '#ff5d73'));
    fringe(head, mat);
  },
  hair_pigtails(head, mat, L) {
    shell(head, mat, { front: 0.95, side: 1.5, back: 2.3 });
    for (const s of [-1, 1]) {
      tail(head, mat, [[s * 0.4, 0.04, -0.2], [s * 0.55, -0.1, -0.2], [s * 0.6, -0.32, -0.16], [s * 0.54, -0.5, -0.1]], 0.1, 0.045, tieColor(L, '#ffd84d'));
    }
    fringe(head, mat);
  },
  hair_twintails(head, mat, L) {
    shell(head, mat, { front: 0.95, side: 1.5, back: 2.3 });
    for (const s of [-1, 1]) {
      part(head, sphere(0.13, 14, 10), mat, { p: [s * 0.3, 0.28, -0.2], outline: OUT_THIN });
      tail(head, mat, [[s * 0.36, 0.28, -0.22], [s * 0.5, 0.24, -0.26], [s * 0.58, 0.04, -0.26], [s * 0.6, -0.3, -0.22], [s * 0.56, -0.66, -0.16], [s * 0.5, -0.95, -0.1]], 0.13, 0.05, tieColor(L, '#e84393'));
    }
    fringe(head, mat, 5, { spread: 0.4 });
  },
  hair_braid(head, mat, L) {
    shell(head, mat, { front: 0.95, side: 1.5, back: 2.35 });
    for (let i = 0; i < 8; i++) {
      const r = 0.1 - i * 0.006;
      part(head, sphere(r, 12, 10), mat, { p: [(i % 2 ? 0.035 : -0.035), -0.12 - i * 0.12, -0.47 + i * 0.012], s: [1, 1.2, 0.9], r: [0, 0, i % 2 ? 0.4 : -0.4], outline: OUT_THIN });
    }
    part(head, torus(0.05, 0.022, TAU, 8, 16), toon(tieColor(L, '#6ee7a0')), { p: [0, -1.0, -0.39], r: [Math.PI / 2, 0, 0], outline: null });
    part(head, sphere(0.06, 10, 8), mat, { p: [0, -1.07, -0.38], s: [1, 1.4, 1], outline: OUT_THIN });
    fringe(head, mat);
  },
  hair_bun(head, mat, L) {
    shell(head, mat, { front: 0.95, side: 1.45, back: 2.2 });
    part(head, sphere(0.18), mat, { p: [0, 0.4, -0.18] });
    part(head, torus(0.13, 0.03, TAU, 8, 20), toon(tieColor(L, '#ff5d73')), { p: [0, 0.3, -0.15], r: [Math.PI / 2 + 0.35, 0, 0], outline: null });
    fringe(head, mat, 3);
  },
  hair_spacebuns(head, mat) {
    shell(head, mat, { front: 0.95, side: 1.45, back: 2.25 });
    for (const s of [-1, 1]) part(head, sphere(0.15), mat, { p: [s * 0.27, 0.35, -0.06] });
    fringe(head, mat, 4);
  },
  hair_topknot(head, mat, L) {
    shell(head, mat, { front: 0.8, side: 1.35, back: 2.1 });
    part(head, sphere(0.12), mat, { p: [0, R + 0.1, -0.06], s: [1, 0.85, 1] });
    part(head, cyl(0.06, 0.08, 0.06, 12), toon(tieColor(L, '#e0463c')), { p: [0, R + 0.01, -0.05], outline: null });
  },
  hair_curly(head, mat) {
    shell(head, mat, { front: 1.0, side: 1.55, back: 2.2, lift: 0.02 });
    blobs(head, mat, { dist: R + 0.04, size: 0.12, step: 0.3, front: 0.95 });
  },
  hair_afro(head, mat) {
    shell(head, mat, { front: 1.0, side: 1.6, back: 2.25, lift: 0.02 });
    blobs(head, mat, { dist: R + 0.13, size: 0.19, step: 0.36, front: 0.9, side: 1.55, back: 2.1, outline: OUT_THIN });
  },
  hair_locs(head, mat, L) {
    // locs: box-parted scalp, the top half gathered up into a high tie that spills over, the rest
    // hanging twisty past the shoulders
    shell(head, partsMaterial(hex(L.hairColor), hex(L.skin)), { front: 0.95, side: 1.5, back: 2.2, lift: 0.012, outline: null });
    const shade = toon(mix(L.hairColor, '#000000', 0.25));
    const tie = new THREE.Vector3(0, R + 0.02, -0.2);
    // gathered locs: from all over the top of the head, along the scalp to the tie, then fountaining out
    let n = 0;
    for (let i = 0; i < 12; i++) {
      const phi = (i / 12) * TAU, th = 0.55 + (i % 2) * 0.25;
      const root = onHead(phi, th, R + 0.03);
      const mid = root.clone().lerp(tie, 0.55).setLength(R + 0.05);
      const out = new THREE.Vector3(Math.sin(phi) * 0.18, 0.12, -0.1 + Math.cos(phi) * 0.05);
      const len = 0.35 + (i % 4) * 0.08;
      const pts = [root, mid, tie.clone(), tie.clone().add(out), tie.clone().add(out.clone().multiplyScalar(1.8)).add(new THREE.Vector3(0, -len * 0.5, -0.08)), tie.clone().add(out.clone().multiplyScalar(2)).add(new THREE.Vector3((i % 3 - 1) * 0.05, -len, -0.14))];
      strand(head, n++ % 3 === 0 ? shade : mat, pts, 0.042, 0.036, { bumps: 10, bumpAmt: 0.14, radial: 7, segs: 30 });
    }
    part(head, torus(0.07, 0.03, TAU, 8, 16), toon(tieColor(L, '#ffc53d')), { p: tie.toArray(), r: [0.4, 0, 0], outline: null });
    // hanging locs round the sides and back
    for (let i = 0; i < 20; i++) {
      const phi = Math.PI * 0.35 + (i / 19) * Math.PI * 1.3, th = 1.25 + (i % 3) * 0.1;
      const root = onHead(phi, th - 0.45, R + 0.025), edge = onHead(phi, th, R + 0.05);
      const o = new THREE.Vector3(edge.x, 0, edge.z).normalize();
      const len = 0.45 + ((i * 7) % 5) * 0.07;
      const zz = (k) => new THREE.Vector3(o.z, 0, -o.x).multiplyScalar(((k % 2) ? 1 : -1) * 0.03); // a little zigzag
      const pts = [root, edge, edge.clone().addScaledVector(o, 0.04).add(new THREE.Vector3(0, -len * 0.35, 0)).add(zz(1)), edge.clone().addScaledVector(o, 0.06).add(new THREE.Vector3(0, -len * 0.7, 0)).add(zz(2)), edge.clone().addScaledVector(o, 0.07).add(new THREE.Vector3(0, -len, 0))];
      strand(head, n++ % 3 === 0 ? shade : mat, pts, 0.042, 0.035, { bumps: 11, bumpAmt: 0.14, radial: 7, segs: 30 });
    }
  },
  hair_swoop(head, mat) {
    shell(head, mat, { front: 0.9, side: 1.4, back: 2.15 });
    const p = onFace(-0.05, 0.27, 0.02);
    part(head, sphere(0.2, 20, 14), mat, { p: p.toArray(), q: faceTo(p).multiply(new THREE.Quaternion().setFromAxisAngle(Z, 0.35)), s: [1.7, 0.6, 0.55], outline: OUT_THIN });
    const q = onFace(0.2, 0.2, 0.0);
    part(head, sphere(0.13, 16, 12), mat, { p: q.toArray(), q: faceTo(q).multiply(new THREE.Quaternion().setFromAxisAngle(Z, 0.7)), s: [1.4, 0.55, 0.55], outline: OUT_THIN });
  },
  hair_emo(head, mat, L) {
    // emo: a long, sleek side fringe swept across the forehead and over one eye, choppy pointed layers
    // round the back and sides, and a bit of teased volume at the crown
    shell(head, mat, { front: 0.9, side: 1.55, back: 2.3, lift: 0.03 });
    const shade = toon(mix(L.hairColor, '#000000', 0.2));
    // the fringe: ribbons from the side part, across the brow, ending at the cheek
    [[-0.3, 0.1, 0.28, 0.08], [-0.28, 0.02, 0.24, 0.075], [-0.24, -0.05, 0.19, 0.06], [-0.16, 0.14, 0.33, 0.06], [-0.34, 0.18, 0.12, 0.05]]
      .forEach(([x0, y1, x1, w], i) => {
        const a = onFace(x0, 0.36, 0.05), b = onFace((x0 + x1) / 2, 0.28 - i * 0.01, 0.065), c = onFace(x1, y1, 0.06);
        const d = onFace(Math.min(0.36, x1 + 0.05), y1 - 0.12, 0.05);
        strand(head, i === 3 ? shade : mat, [a, b, c, d], w, 0.012, { point: true, flat: 0.38, radial: 10, segs: 18 });
      });
    // choppy layers round the sides and back, ending in points
    for (let i = 0; i < 17; i++) {
      const phi = Math.PI * 0.38 + (i / 16) * Math.PI * 1.24;
      const th = 0.95 + (i % 2) * 0.2;
      const root = onHead(phi, th, R + 0.035);
      const o = new THREE.Vector3(root.x, 0, root.z).normalize();
      const len = 0.28 + ((i * 5) % 4) * 0.05;
      const tip = root.clone().addScaledVector(o, 0.08).add(new THREE.Vector3(0, -len, 0));
      strand(head, i % 3 === 0 ? shade : mat, [root, root.clone().lerp(tip, 0.45).addScaledVector(o, 0.06), tip], 0.085, 0.015, { point: true, flat: 0.45, radial: 8, segs: 12 });
    }
    // teased crown
    for (let i = 0; i < 5; i++) {
      const v = onHead(Math.PI + (i - 2) * 0.45, 0.45, 1).normalize();
      const a = v.clone().multiplyScalar(R + 0.02);
      strand(head, mat, [a, a.clone().addScaledVector(v, 0.13).add(new THREE.Vector3(0, 0.03, -0.08)), a.clone().addScaledVector(v, 0.2).add(new THREE.Vector3(0, -0.02, -0.18))], 0.08, 0.015, { point: true, flat: 0.5, radial: 8, segs: 10 });
    }
  },
  hair_quiff(head, mat) {
    shell(head, mat, { front: 1.0, side: 1.35, back: 2.1 });
    part(head, sphere(0.22, 20, 14), mat, { p: [0, 0.36, 0.2], s: [1.25, 0.85, 1.15], r: [-0.4, 0, 0], outline: OUT_THIN });
    part(head, sphere(0.15, 16, 12), mat, { p: [0.02, 0.5, 0.26], s: [1.1, 0.7, 1], r: [-0.7, 0, 0.1], outline: OUT_THIN });
  },
  hair_messy(head, mat) {
    shell(head, mat, { front: 0.9, side: 1.45, back: 2.2 });
    const tufts = [[0, 1, 0], [0.4, 0.9, 0.2], [-0.45, 0.85, 0.1], [0.3, 0.8, -0.5], [-0.3, 0.75, -0.55], [0.1, 0.55, -0.85],
      [0.8, 0.4, -0.3], [-0.8, 0.35, -0.3], [0.55, 0.7, 0.45], [-0.5, 0.75, 0.45], [0.05, 0.75, 0.62]];
    tufts.forEach((d, i) => {
      const v = new THREE.Vector3(...d).normalize();
      const bend = new THREE.Vector3(Math.sin(i * 2.3), 0.2, Math.cos(i * 1.7)).multiplyScalar(0.35);
      part(head, cone(0.1, 0.24 + (i % 3) * 0.05, 8), mat, { p: v.clone().multiplyScalar(R + 0.08).toArray(), q: pointTo(v.clone().add(bend)), outline: OUT_THIN });
    });
    fringe(head, mat, 4, { size: 0.12 });
  },
  hair_mohawk(head, mat, L) {
    shell(head, toon(mix(L.hairColor, L.skin, 0.55)), { front: 1.0, side: 1.5, back: 2.25, lift: 0.006, outline: null });
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + i * 0.36;
      const v = new THREE.Vector3(0, Math.cos(a), -Math.sin(a));
      part(head, cone(0.12, 0.42, 4), mat, { p: v.clone().multiplyScalar(R + 0.12).toArray(), q: pointTo(v), s: [0.45, 1, 1], outline: OUT_THIN });
    }
  },
  hair_none(head, mat, L) {
    shell(head, toon(mix(L.hairColor, L.skin, 0.5)), { front: 0.95, side: 1.5, back: 2.25, lift: 0.006, outline: null });
  },
  hair_flame(head, mat, L, anim) {
    shell(head, mat, { front: 0.9, side: 1.45, back: 2.2 });
    fringe(head, mat);
    const hot = toon(mix(L.hairColor, '#ffd84d', 0.35), { emissive: L.hairColor, emissiveIntensity: 0.5 });
    const core = [];
    for (let i = 0; i < 7; i++) {
      const v = onHead(i * 0.9, 0.2 + (i % 3) * 0.25, 1).normalize();
      core.push(part(head, cone(0.12, 0.45, 8), hot, { p: v.clone().multiplyScalar(R + 0.14).toArray(), q: pointTo(v.clone().add(new THREE.Vector3(0, 1.2, 0))), outline: OUT_THIN }));
    }
    const tintHex = new THREE.Color(L.hairColor).lerp(new THREE.Color('#ffb13b'), 0.5).getHex();
    const flames = sprites(head, additive(flameTexture, tintHex, 0.9), 10, 0.3);
    anim.push((t) => {
      core.forEach((c, i) => { c.scale.y = 1 + Math.sin(t * 9 + i * 1.9) * 0.18; });
      flames.forEach((s, i) => {
        const p = (t * 1.1 + i / 10) % 1;
        const a = i * 2.4;
        s.position.set(Math.cos(a) * 0.3 * (1 - p), R + 0.1 + p * 0.7, Math.sin(a) * 0.3 * (1 - p) - 0.05);
        s.scale.set(0.3 * (1 - p), 0.45 * (1 - p), 1);
      });
    });
  },
};

// ---------------------------------------------------------------------------
// Animal Crossing–style hair: a puffy cap that sits off the head (not a helmet), chunky pointed locks
// for fringes and sides, a soft shine across the top, and drawn-on swirls for curly hair. These
// replace the plainer versions of the everyday styles above.
// ---------------------------------------------------------------------------
let AC_LIFT = 0.085; // (less under hats that hug the head)

/** A chunky lock: a flattened, tapering ribbon along `pts`, lying flat against the head (its width runs
 *  across the head's surface, its thickness away from it), ending in a rounded point. */
function lockGeo(pts, w, thick, tipW = 0.12) {
  const key = `lock${pts.map((v) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`).join('|')}${w},${thick},${tipW}`;
  return geo(key, () => {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const segs = 16, radial = 10, pos = [], idx = [];
    const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      curve.getPointAt(t, P); curve.getTangentAt(t, T);
      N.copy(P).normalize(); // away from the middle of the head
      B.crossVectors(T, N).normalize();
      N.crossVectors(B, T).normalize();
      const ww = w * (1 - Math.pow(t, 1.7) * (1 - tipW)) * (0.75 + 0.25 * Math.sin(Math.min(1, t * 3) * Math.PI / 2));
      const th = thick * (1 - t * 0.55);
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * TAU;
        const x = Math.cos(a) * ww, y = Math.sin(a) * th;
        pos.push(P.x + B.x * x + N.x * y, P.y + B.y * x + N.y * y, P.z + B.z * x + N.z * y);
      }
    }
    const end = curve.getPointAt(1), dir = curve.getTangentAt(1);
    const capI = pos.length / 3;
    pos.push(end.x + dir.x * w * tipW, end.y + dir.y * w * tipW, end.z + dir.z * w * tipW);
    const startI = capI + 1, s0 = curve.getPointAt(0);
    pos.push(s0.x, s0.y, s0.z);
    for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
    const last = segs * radial;
    for (let j = 0; j < radial; j++) { idx.push(last + j, capI, last + ((j + 1) % radial)); idx.push(startI, j, (j + 1) % radial); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}
function acLock(head, mat, pts, w = 0.1, thick = 0.035, tipW = 0.12) {
  return part(head, lockGeo(pts, w, thick, tipW), mat, { outline: OUT_THIN });
}

/** The puffy cap of hair, sitting a little off the scalp. */
function acCap(head, mat, { front = 0.98, side = 1.5, back = 2.25, lift = AC_LIFT, sy = 1.03 } = {}) {
  // (closed underneath, its inner layer sitting right on the scalp once it's scaled up)
  return part(head, shellGeo(front, side, back + 0.18, R + lift, (R - 0.008) / 1.05, true), mat, { p: [0, 0.02, -0.015], s: [1.05, sy + 0.03, 1.03], outline: OUT });
}

/** A lighter streak of shine curving over the top of the hair. */
function acShine(head, L, { r = R + AC_LIFT + 0.012, th = 0.5, width = 0.9 } = {}) {
  const pts = [];
  for (let k = 0; k <= 6; k++) pts.push(onHead(-width / 2 + (k / 6) * width, th + Math.sin((k / 6) * Math.PI) * 0.06, r * 1.03));
  const m = toon(mix(L.hairColor, '#ffffff', 0.32));
  part(head, lockGeo(pts, 0.03, 0.006, 0.4), m, { outline: null, shadow: false });
}

/** A fringe of chunky locks over the forehead. sweep > 0 pushes them to one side; part: where the
 *  parting is (-1..1), locks either side curve away from it. */
function acBangs(head, mat, { n = 4, spread = 1.0, sweep = 0, len = 0.2, part: parting = null, w = 0.15, top = 0.42, lift = AC_LIFT + 0.01, end = 1.1 } = {}) {
  n = Math.min(n, 5);
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const phi = u * spread * 0.62;
    const away = parting == null ? 0 : (u >= parting ? 1 : -1) * 0.32;
    const sw = sweep + away;
    const thEnd = end + (1 - Math.abs(u)) * 0.06 - Math.abs(u) * 0.02 + len * 0.3;
    const pts = [
      onHead(phi - sw * 0.25, top, R + lift - 0.02),
      onHead(phi, 0.85, R + lift + 0.008),
      onHead(phi + sw * 0.25, (0.85 + thEnd) / 2 + 0.05, R + lift - 0.005),
      onHead(phi + sw * 0.42, thEnd, R + 0.035),
    ];
    acLock(head, mat, pts, w * (1 - Math.abs(u) * 0.12) * (n > 4 ? 0.85 : 1), 0.05, 0.38).userData.fringe = true;
  }
}

/** Locks hanging down in front of the ears (and on round the sides, `n` a side). */
function acSides(head, mat, { len = 0.22, n = 1, w = 0.11, from = 1.22, outward = 0.04 } = {}) {
  for (const s of [-1, 1]) for (let k = 0; k < n; k++) {
    const phi = s * (from + k * 0.32);
    const a = onHead(phi, 0.75, R + AC_LIFT - 0.01), b = onHead(phi, 1.35, R + AC_LIFT + 0.01);
    const o = new THREE.Vector3(b.x, 0, b.z).normalize();
    const c = b.clone().addScaledVector(o, outward).add(new THREE.Vector3(0, -len * 0.55, 0));
    const d = b.clone().addScaledVector(o, outward * 0.6).add(new THREE.Vector3(0, -len, 0)).addScaledVector(new THREE.Vector3(0, 0, 1), 0.03);
    acLock(head, mat, [a, b, c, d], w * 1.2, 0.05, 0.35);
  }
}

/** Chunky pointed ends all round the back and sides of the cap. */
function acNape(head, mat, { n = 9, len = 0.14, w = 0.12, from = 0.45, to = 1.55, th = 1.55, out = 0.03 } = {}) {
  for (let i = 0; i < n; i++) {
    const phi = Math.PI * (from + (i / Math.max(1, n - 1)) * (to - from)) * (1);
    for (const s of i === 0 && from === 0 ? [1] : [1]) {
      const p0 = onHead(phi, th - 0.4, R + AC_LIFT - 0.005), p1 = onHead(phi, th, R + AC_LIFT + 0.01);
      const o = new THREE.Vector3(p1.x, 0, p1.z).normalize();
      acLock(head, mat, [p0, p1, p1.clone().addScaledVector(o, out).add(new THREE.Vector3(0, -len * 0.6, 0)), p1.clone().addScaledVector(o, out * 0.4).add(new THREE.Vector3(0, -len, 0))], w * 1.25, 0.05, 0.35);
    }
  }
}

/** The same colour a touch lighter (k > 0) or darker (k < 0), keeping its hue and richness. */
function lighten(c, k) {
  const hsl = new THREE.Color(c).getHSL({});
  return `#${new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + k))).getHexString()}`;
}
const doubleCache = new Map();
/** The same material, drawn on both sides (one shared copy per material). */
function doubleSided(m) {
  let d = doubleCache.get(m.uuid);
  if (!d) { d = m.clone(); d.side = THREE.DoubleSide; doubleCache.set(m.uuid, d); }
  return d;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Lots of little balls merged into one mesh (one draw call): items are [x, y, z, r]. */
function bubbleGeo(key, items) {
  return geo(`bub${key}`, () => {
    const unit = new THREE.SphereGeometry(1, 12, 9).toNonIndexed();
    const up = unit.attributes.position.array, un = unit.attributes.normal.array;
    const pos = new Float32Array(up.length * items.length), nor = new Float32Array(un.length * items.length);
    items.forEach(([x, y, z, r], i) => {
      const o = i * up.length;
      for (let k = 0; k < up.length; k += 3) {
        pos[o + k] = x + up[k] * r; pos[o + k + 1] = y + up[k + 1] * r; pos[o + k + 2] = z + up[k + 2] * r;
        nor[o + k] = un[k]; nor[o + k + 1] = un[k + 1]; nor[o + k + 2] = un[k + 2];
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return g;
  });
}

/** Springy curls: round little coils in three shades of the hair colour (so they read as separate
 *  curls, not a pattern painted on). items: [x, y, z, r]. */
function curls(head, mat, L, key, items) {
  const shades = [mat, toon(lighten(L.hairColor, 0.035))];
  const groups = [[], []];
  items.forEach((it, i) => groups[(i * 7) % 3 === 0 ? 1 : 0].push(it));
  // (no outline per curl: the hulls of the inner ones would show as dark gaps between them)
  groups.forEach((g, k) => { if (g.length) part(head, bubbleGeo(`${key}${k}`, g), shades[k], { outline: null }); });
}

/** Points spread evenly over the scalp down to a hairline (golden-angle spiral), `dist` from the
 *  middle of the head, with curl sizes between r0 and r1. */
function curlCover(n, dist, { front = 0.95, side = 1.6, back = 2.25, r0 = 0.07, r1 = 0.09, y = 0, seed = 3 } = {}) {
  const rnd = mulberry(seed), out = [];
  for (let i = 0; i < n; i++) {
    const v = 1 - (i / (n - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - v * v)), a = i * 2.39996;
    const th = Math.acos(v), phi = Math.atan2(Math.sin(a) * r, Math.cos(a) * r);
    if (th > hairline(phi, front, side, back)) continue;
    const p = onHead(phi, th, dist * (0.97 + rnd() * 0.06));
    out.push([p.x, p.y + y, p.z, r0 + (r1 - r0) * rnd()]);
  }
  return out;
}

/** Wavy hair: locks hanging round the sides and back in soft S-curves (n a side). */
function waveLocks(head, mat, shade, { len = 0.7, amp = 0.06, w = 0.16, n = 8, out = 0.03 } = {}) {
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const phi = s * (1.05 + (i / (n - 1)) * (Math.PI - 1.05 - 0.12));
    const p0 = onHead(phi, 0.85, R + AC_LIFT - 0.005), p1 = onHead(phi, 1.45, R + AC_LIFT + 0.02);
    const o = new THREE.Vector3(p1.x, 0, p1.z).normalize(), side = new THREE.Vector3(-o.z, 0, o.x);
    const l = len * (0.92 + ((i * 5) % 3) * 0.06);
    const pts = [p0, p1];
    for (let k = 1; k <= 5; k++) {
      const t = k / 5;
      pts.push(p1.clone().addScaledVector(o, out * Math.sqrt(t) + Math.sin(t * Math.PI * 2 + i) * amp).addScaledVector(side, Math.sin(t * Math.PI * 2.5 + i) * amp * 0.6).add(new THREE.Vector3(0, -l * t, 0)));
    }
    acLock(head, i % 3 === 1 ? shade : mat, pts, w, 0.055, 0.3);
  }
}

/** A braid along `pts`: overlapping lobes leaning left and right in turn, in two shades. */
function braidAlong(head, mat, L, pts, { n = 24, size = 0.075, closed = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  const shade = toon(mix(L.hairColor, '#000000', 0.2));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    // lobe frame: y along the braid, z out from the head, then lean it about z
    const out = p.clone().normalize(), side = new THREE.Vector3().crossVectors(tan, out).normalize();
    out.crossVectors(side, tan).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, tan, out))
      .multiply(new THREE.Quaternion().setFromAxisAngle(Z, i % 2 ? 0.55 : -0.55));
    part(head, sphere(size, 12, 10), i % 2 ? shade : mat, { p: p.toArray(), q, s: [0.85, 1.5, 0.75], outline: OUT_THIN });
  }
}

/** A lumpy cap: like the hair cap but standing well off the head with a bumpy, cloud-like outline. */
function lumpyCap(head, mat, { front = 0.95, side = 1.6, back = 2.25, r = R + 0.16, amp = 0.07, lumps = 7, y = 0.02, s = [1, 1, 1] } = {}) {
  const g = geo(`lumpy${front},${side},${back},${r},${amp},${lumps}`, () => {
    const solid = shellGeo(front, side, back + 0.18, r, R - 0.01);
    const base = solid.clone();
    const p = base.attributes.position;
    const v = new THREE.Vector3();
    const rimStart = p.count - (56 + 1) * 2; // (the rim's outer vertices move with the outside)
    for (let i = 0; i < p.count; i++) {
      if (i >= solid.userData.outer && (i < rimStart || (i - rimStart) % 2)) continue; // (the scalp layer stays put)
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      const bump = Math.sin(n.x * lumps + 1.3) * Math.sin(n.y * lumps + 0.7) * Math.sin(n.z * lumps + 2.1);
      v.setLength(r * (1 + amp * (0.5 + 0.5 * bump)));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    base.computeVertexNormals();
    return base;
  });
  return part(head, g, mat, { p: [0, y, -0.02], s, outline: OUT });
}


Object.assign(HAIR, {
  hair_short(head, mat, L) {
    acCap(head, mat, { front: 0.95, side: 1.4, back: 2.15 });
    acNape(head, mat, { n: 7, len: 0.09, w: 0.11, from: 0.55, to: 1.45, th: 1.55 });
    acSides(head, mat, { len: 0.12, w: 0.1 });
    acBangs(head, mat, { n: 4, sweep: 0.35, len: 0.1, w: 0.12 });
    acShine(head, L);
  },
  hair_spiky(head, mat, L) {
    acCap(head, mat, { front: 0.92, side: 1.4, back: 2.1 });
    const shade = toon(mix(L.hairColor, '#000000', 0.15));
    const dirs = [[0, 1, 0.2], [0.5, 0.85, 0.15], [-0.5, 0.85, 0.15], [0.35, 0.8, -0.45], [-0.35, 0.8, -0.45], [0, 0.65, -0.75],
      [0.78, 0.55, -0.2], [-0.78, 0.55, -0.2], [0.24, 0.9, 0.5], [-0.28, 0.9, 0.45]];
    dirs.forEach((d, i) => {
      const v = new THREE.Vector3(...d).normalize();
      const a = v.clone().multiplyScalar(R + 0.03), tip = v.clone().multiplyScalar(R + 0.33).add(new THREE.Vector3(0, 0.05, -0.04));
      acLock(head, i % 3 ? mat : shade, [a, a.clone().lerp(tip, 0.5).addScaledVector(v, 0.03), tip], 0.13, 0.07, 0.1);
    });
    acBangs(head, mat, { n: 4, sweep: -0.2, len: 0.06, w: 0.11 });
    acShine(head, L);
  },
  hair_long(head, mat, L) {
    acCap(head, mat, { front: 0.98, side: 1.5, back: 2.4 });
    curtain(head, mat, { len: 0.66, flare: 0.13, wrap: 0.32, top: 0.0 });
    // chunky ends round the bottom of the curtain
    for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 - 0.25 + (i / 8) * (Math.PI + 0.5);
      const r = R + 0.05 + 0.13;
      const top = new THREE.Vector3(Math.sin(a) * r, -0.5, Math.cos(a) * r * 0.94);
      acLock(head, mat, [top, top.clone().add(new THREE.Vector3(0, -0.12, 0)), top.clone().add(new THREE.Vector3(Math.sin(a) * 0.01, -0.24, Math.cos(a) * 0.01))], 0.14, 0.05);
    }
    acSides(head, mat, { len: 0.5, w: 0.12 });
    acBangs(head, mat, { n: 5, part: 0.25, len: 0.14 });
    acShine(head, L);
  },
  hair_bob(head, mat, L) {
    acCap(head, mat, { front: 1.0, side: 1.62, back: 2.35 });
    curtain(head, mat, { len: 0.34, flare: 0.14, wrap: 0.62 });
    acBangs(head, mat, { n: 6, len: 0.16, spread: 1.1, w: 0.11 });
    acShine(head, L);
  },
  hair_ponytail(head, mat, L) {
    acCap(head, mat, { front: 0.95, side: 1.5, back: 2.3, lift: 0.05 });
    part(head, sphere(0.16, 16, 12), mat, { p: [0, 0.16, -0.43], s: [1, 0.9, 0.8], outline: OUT_THIN });
    tail(head, mat, [[0, 0.16, -0.47], [0, 0.06, -0.56], [0, -0.1, -0.58], [0, -0.3, -0.51], [0, -0.5, -0.4]], 0.16, 0.07, tieColor(L, '#ff5d73'));
    acSides(head, mat, { len: 0.16, w: 0.09 });
    acBangs(head, mat, { n: 4, sweep: 0.3, len: 0.12 });
    acShine(head, L);
  },
  hair_pigtails(head, mat, L) {
    acCap(head, mat, { front: 0.95, side: 1.5, back: 2.3, lift: 0.05 });
    for (const s of [-1, 1]) tail(head, mat, [[s * 0.42, 0.04, -0.2], [s * 0.58, -0.1, -0.2], [s * 0.63, -0.32, -0.16], [s * 0.57, -0.52, -0.1]], 0.12, 0.05, tieColor(L, '#ffd84d'));
    acBangs(head, mat, { n: 5, part: 0, len: 0.14 });
    acShine(head, L);
  },
  hair_twintails(head, mat, L) {
    acCap(head, mat, { front: 0.95, side: 1.5, back: 2.3, lift: 0.05 });
    for (const s of [-1, 1]) {
      part(head, sphere(0.14, 14, 10), mat, { p: [s * 0.32, 0.3, -0.2], outline: OUT_THIN });
      tail(head, mat, [[s * 0.38, 0.3, -0.22], [s * 0.53, 0.26, -0.26], [s * 0.61, 0.04, -0.26], [s * 0.63, -0.3, -0.22], [s * 0.59, -0.66, -0.16], [s * 0.53, -0.95, -0.1]], 0.15, 0.06, tieColor(L, '#e84393'));
    }
    acBangs(head, mat, { n: 5, len: 0.16 });
    acShine(head, L);
  },
  hair_braid(head, mat, L) {
    acCap(head, mat, { front: 0.95, side: 1.5, back: 2.35, lift: 0.05 });
    for (let i = 0; i < 8; i++) {
      const r = 0.11 - i * 0.006;
      part(head, sphere(r, 12, 10), mat, { p: [(i % 2 ? 0.04 : -0.04), -0.12 - i * 0.12, -0.5 + i * 0.012], s: [1, 1.2, 0.9], r: [0, 0, i % 2 ? 0.4 : -0.4], outline: OUT_THIN });
    }
    part(head, torus(0.055, 0.024, TAU, 8, 16), toon(tieColor(L, '#6ee7a0')), { p: [0, -1.0, -0.42], r: [Math.PI / 2, 0, 0], outline: null });
    acLock(head, mat, [new THREE.Vector3(0, -1.03, -0.42), new THREE.Vector3(0, -1.12, -0.42), new THREE.Vector3(0, -1.2, -0.4)], 0.09, 0.05);
    acBangs(head, mat, { n: 4, sweep: -0.3, len: 0.12 });
    acShine(head, L);
  },
  hair_bun(head, mat, L) {
    acCap(head, mat, { front: 0.95, side: 1.45, back: 2.2, lift: 0.05 });
    part(head, sphere(0.2), mat, { p: [0, 0.44, -0.2], s: [1, 0.92, 1] });
    part(head, torus(0.14, 0.032, TAU, 8, 20), toon(tieColor(L, '#ff5d73')), { p: [0, 0.32, -0.16], r: [Math.PI / 2 + 0.35, 0, 0], outline: null });
    acSides(head, mat, { len: 0.18, w: 0.08 });
    acBangs(head, mat, { n: 3, part: 0, len: 0.1, spread: 0.7 });
    acShine(head, L);
  },
  hair_spacebuns(head, mat, L) {
    // two round buns high on the head, each tied off with a scrunchie
    acCap(head, mat, { front: 0.95, side: 1.45, back: 2.25, lift: 0.05 });
    for (const s of [-1, 1]) {
      part(head, sphere(0.17, 20, 16), mat, { p: [s * 0.3, 0.4, -0.06] });
      part(head, torus(0.11, 0.028, TAU, 8, 18), toon(tieColor(L, '#ff9fe0')), { p: [s * 0.26, 0.27, -0.05], r: [Math.PI / 2, s * 0.6, 0], outline: null });
    }
    acBangs(head, mat, { n: 4, len: 0.14 });
    acShine(head, L);
  },
  hair_topknot(head, mat, L) {
    acCap(head, mat, { front: 0.85, side: 1.35, back: 2.1, lift: 0.045 });
    part(head, sphere(0.13), mat, { p: [0, R + 0.13, -0.06], s: [1, 0.85, 1] });
    part(head, cyl(0.065, 0.085, 0.06, 12), toon(tieColor(L, '#e0463c')), { p: [0, R + 0.04, -0.05], outline: null });
    acShine(head, L, { th: 0.7 });
  },
  hair_swoop(head, mat, L) {
    acCap(head, mat, { front: 0.92, side: 1.4, back: 2.15 });
    // one big swoop across the forehead, flicking up at the end
    [[-0.95, 0.32, 0.3, 0.16], [-0.7, 0.42, 0.55, 0.13]].forEach(([p0, t0, p1, w]) => {
      acLock(head, mat, [onHead(p0, 0.4, R + 0.08), onHead((p0 + p1) / 2, t0 + 0.55, R + 0.1), onHead(p1, 1.0, R + 0.09), onHead(p1 + 0.2, 0.88, R + 0.08)], w, 0.06);
    });
    acNape(head, mat, { n: 7, len: 0.08 });
    acShine(head, L);
  },
  hair_quiff(head, mat, L) {
    acCap(head, mat, { front: 1.0, side: 1.35, back: 2.1, lift: 0.05 });
    // swept up and back off the forehead in big chunky waves
    for (let i = 0; i < 4; i++) {
      const phi = (i - 1.5) * 0.28;
      const a = onHead(phi, 0.95, R + 0.06), b = onHead(phi * 0.8, 0.5, R + 0.24), c = onHead(phi * 0.5, 0.2, R + 0.2);
      acLock(head, mat, [a, b, c, onHead(phi * 0.4, 0.15, R + 0.12)], 0.14, 0.09, 0.3);
    }
    acSides(head, mat, { len: 0.08, w: 0.09 });
    acShine(head, L, { th: 0.75, r: R + 0.24 });
  },
  hair_messy(head, mat, L) {
    acCap(head, mat, { front: 0.92, side: 1.45, back: 2.2 });
    const tufts = [[0, 1, 0], [0.4, 0.9, 0.2], [-0.45, 0.85, 0.1], [0.3, 0.8, -0.5], [-0.3, 0.75, -0.55], [0.1, 0.55, -0.85], [0.8, 0.4, -0.3], [-0.8, 0.35, -0.3]];
    tufts.forEach((d, i) => {
      const v = new THREE.Vector3(...d).normalize();
      const bend = new THREE.Vector3(Math.sin(i * 2.3), 0.1, Math.cos(i * 1.7)).multiplyScalar(0.12);
      const a = v.clone().multiplyScalar(R + AC_LIFT - 0.01);
      acLock(head, mat, [a, a.clone().addScaledVector(v, 0.1).add(bend), a.clone().addScaledVector(v, 0.17).add(bend.clone().multiplyScalar(2.2))], 0.12, 0.05);
    });
    acBangs(head, mat, { n: 5, sweep: 0.15, len: 0.16 });
    acSides(head, mat, { len: 0.14, w: 0.1 });
  },
  // ---- curly hair: a soft volume covered in round 3D curls
  hair_curly(head, mat, L) {
    lumpyCap(head, toon(mix(L.hairColor, '#000000', 0.12)), { front: 0.95, side: 1.62, back: 2.25, r: R + 0.09, amp: 0.05 });
    const items = curlCover(170, R + 0.12, { front: 0.92, side: 1.62, back: 2.25, r0: 0.068, r1: 0.088, y: 0.02, seed: 11 });
    // a couple of curls hanging in front of each ear
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) items.push([s * (0.45 - k * 0.01), -0.02 - k * 0.09, 0.02 - k * 0.03, 0.075 - k * 0.006]);
    curls(head, mat, L, 'curly', items);
  },
  hair_curlybob(head, mat, L) {
    // short bouncy curls that stop at the jaw
    lumpyCap(head, toon(mix(L.hairColor, '#000000', 0.12)), { front: 0.97, side: 1.75, back: 2.4, r: R + 0.1, amp: 0.05 });
    const items = curlCover(180, R + 0.13, { front: 0.94, side: 1.75, back: 2.4, r0: 0.07, r1: 0.09, y: 0.02, seed: 5 });
    for (let row = 0; row < 2; row++) for (let i = 0; i < 15; i++) {
      const a = Math.PI / 2 - 0.2 + ((i + row * 0.5) / 14) * (Math.PI + 0.4), r = R + 0.11 - row * 0.02;
      items.push([Math.sin(a) * r, -0.1 - row * 0.12, Math.cos(a) * r * 0.95, 0.09 - row * 0.008]);
    }
    curls(head, mat, L, 'curlybob', items);
  },
  hair_ringlets(head, mat, L) {
    // long curly hair: a curly cap that tumbles down past the shoulders in springy ringlets
    lumpyCap(head, toon(mix(L.hairColor, '#000000', 0.12)), { front: 0.97, side: 1.65, back: 2.3, r: R + 0.09, amp: 0.05 });
    const items = curlCover(170, R + 0.12, { front: 0.94, side: 1.65, back: 2.3, r0: 0.068, r1: 0.088, y: 0.02, seed: 7 });
    for (let i = 0; i < 13; i++) {
      const a = Math.PI / 2 + 0.05 + (i / 12) * (Math.PI - 0.1);
      const n = i === 0 || i === 12 ? 4 : 6;
      for (let k = 0; k < n; k++) {
        // each ringlet coils: the curls wobble from side to side as they fall
        const r = R + 0.08 + k * 0.012 + Math.sin(k * 2.1 + i) * 0.02, aa = a + Math.sin(k * 1.9 + i * 0.7) * 0.05;
        items.push([Math.sin(aa) * r, -0.08 - k * 0.12, Math.cos(aa) * r * 0.95, 0.085 - k * 0.005]);
      }
    }
    curls(head, mat, L, 'ringlets', items);
  },
  hair_afro(head, mat, L) {
    // a big, round, full afro: a soft cloud of curls standing well off the head
    lumpyCap(head, toon(mix(L.hairColor, '#000000', 0.15)), { front: 0.9, side: 1.62, back: 2.25, r: R + 0.2, amp: 0.05, lumps: 6, y: 0.06, s: [1.06, 1, 1] });
    const items = curlCover(240, R + 0.23, { front: 0.88, side: 1.62, back: 2.25, r0: 0.08, r1: 0.105, y: 0.06, seed: 9 })
      .map(([x, y, z, r]) => [x * 1.06, y, z, r]);
    // fill in round the hairline so the edge of the afro is soft and round, not a cut-off cap
    for (let i = 0; i < 22; i++) {
      const phi = (i / 21 - 0.5) * 2 * 1.6, th = hairline(phi, 0.88, 1.62, 2.25) - 0.08;
      const p = onHead(phi, th, R + 0.16);
      items.push([p.x * 1.04, p.y + 0.04, p.z, 0.1]);
    }
    curls(head, mat, L, 'afro', items);
  },
  hair_puffs(head, mat, L) {
    // two big, round, curly puffs high on the head, tied off; the rest slicked back to a centre part
    acCap(head, mat, { front: 0.95, side: 1.5, back: 2.25, lift: 0.025 });
    part(head, box(0.012, 0.004, 0.36), toon(mix(L.hairColor, L.skin, 0.5)), { p: [0, R + 0.03, 0.04], r: [0.1, 0, 0], outline: null });
    const items = [];
    for (const sx of [-1, 1]) {
      const c = new THREE.Vector3(sx * 0.3, 0.44, -0.06);
      part(head, sphere(0.19, 20, 16), toon(mix(L.hairColor, '#000000', 0.15)), { p: c.toArray(), outline: null });
      for (let k = 0; k < 46; k++) {
        const y = 1 - (k / 45) * 1.7, r = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.39996;
        const v = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        items.push([c.x + v.x * 0.19, c.y + v.y * 0.19, c.z + v.z * 0.19, 0.065 + (k % 3) * 0.008]);
      }
      part(head, torus(0.1, 0.032, TAU, 8, 20), toon(tieColor(L, '#ff5d73')), { p: c.clone().add(new THREE.Vector3(-sx * 0.05, -0.18, 0.01)).toArray(), r: [Math.PI / 2, sx * 0.45, 0], outline: null });
    }
    curls(head, mat, L, 'puffs', items);
    acShine(head, L, { r: R + 0.04, th: 0.65, width: 0.5 });
  },

  // ---- newer cuts ----
  hair_braidcrown(head, mat, L) {
    // hair parted in the middle and pulled back, with a thick braid wrapped all the way round the
    // head like a crown, and a few loose wisps at the temples
    acCap(head, mat, { front: 0.95, side: 1.5, back: 2.25, lift: 0.04 });
    part(head, box(0.012, 0.004, 0.3), toon(mix(L.hairColor, L.skin, 0.5)), { p: [0, R + 0.045, 0.1], r: [0.25, 0, 0], outline: null });
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const phi = (k / 16) * TAU, c = Math.cos(phi);
      pts.push(onHead(phi, 0.72 + (1 - c) * 0.3, R + 0.09));
    }
    braidAlong(head, mat, L, pts, { n: 30, size: 0.08, closed: true });
    for (const s of [-1, 1]) {
      const a = onHead(s * 1.05, 1.0, R + 0.05);
      acLock(head, mat, [a, a.clone().add(new THREE.Vector3(s * 0.02, -0.12, 0.03)), a.clone().add(new THREE.Vector3(s * 0.01, -0.24, 0.05))], 0.05, 0.025);
    }
    acShine(head, L, { th: 0.42, width: 0.6 });
  },
  hair_pixie(head, mat, L) {
    // a cropped pixie: close at the back and sides, soft piecey texture on top and a wispy fringe
    // swept to one side
    acCap(head, mat, { front: 0.92, side: 1.4, back: 2.0, lift: 0.05 });
    const shade = toon(mix(L.hairColor, '#000000', 0.15));
    for (let i = 0; i < 6; i++) {
      const phi = (i - 2.5) * 0.35, a = onHead(phi, 0.2 + (i % 2) * 0.12, R + 0.07);
      const tip = onHead(phi + 0.25, 0.62 + (i % 2) * 0.1, R + 0.12);
      acLock(head, i % 3 ? mat : shade, [a, a.clone().lerp(tip, 0.5).multiplyScalar(1.03), tip], 0.1, 0.04, 0.15);
    }
    acBangs(head, mat, { n: 4, sweep: 0.7, len: 0.06, w: 0.11, spread: 0.85 });
    acNape(head, mat, { n: 7, len: 0.06, w: 0.09, th: 1.45 });
    acSides(head, mat, { len: 0.1, w: 0.07, outward: 0.02 });
    acShine(head, L);
  },
  hair_crewcut(head, mat, L) {
    // a short, neat crew cut: a little longer at the front so it stands up, tapering short at the sides
    shell(head, mat, { front: 0.98, side: 1.15, back: 1.45, lift: 0.045 });
    shell(head, toon(mix(L.hairColor, L.skin, 0.22)), { front: 0.98, side: 1.5, back: 2.15, lift: 0.02, outline: null });
    for (let i = 0; i < 7; i++) {
      const phi = (i - 3) * 0.2, a = onHead(phi, 0.9, R + 0.03);
      acLock(head, mat, [a, a.clone().add(new THREE.Vector3(0, 0.05, 0.01)), a.clone().add(new THREE.Vector3(0, 0.08, -0.02))], 0.09, 0.035, 0.3);
    }
    acShine(head, L, { r: R + 0.06, th: 0.55, width: 0.7 });
  },
  hair_wolfcut(head, mat, L) {
    // a wolf cut: a soft rounded crown with lots of volume, chunky curtain bangs parted near the middle,
    // and choppy layers down to the jaw that flick out at the ends
    acCap(head, mat, { front: 0.98, side: 1.62, back: 2.35, sy: 1.07 });
    const shade = toon(mix(L.hairColor, '#000000', 0.15));
    acBangs(head, mat, { n: 5, part: 0.15, len: 0.2, w: 0.16, spread: 1.05 });
    // the layers round the face and back, each ending in an outward flick
    const layers = [[1.05, 0.34], [1.3, 0.42], [1.6, 0.4], [1.9, 0.36], [2.25, 0.34], [2.6, 0.34], [2.95, 0.36]];
    for (const s of [-1, 1]) layers.forEach(([phi, len], i) => {
      if (s > 0 && i === layers.length - 1) return;
      const f = s * phi;
      const p0 = onHead(f, 0.8, R + AC_LIFT - 0.005), p1 = onHead(f, 1.4, R + AC_LIFT + 0.02);
      const o = new THREE.Vector3(p1.x, 0, p1.z).normalize();
      const p2 = p1.clone().addScaledVector(o, 0.02).add(new THREE.Vector3(0, -len * 0.7, 0));
      const p3 = p2.clone().addScaledVector(o, 0.045).add(new THREE.Vector3(0, -len * 0.25, 0));
      const p4 = p3.clone().addScaledVector(o, 0.035).add(new THREE.Vector3(0, 0.025, 0)); // the flick
      acLock(head, i % 3 === 1 ? shade : mat, [p0, p1, p2, p3, p4], 0.2, 0.06, 0.25);
    });
    acShine(head, L);
  },
  hair_bowlcut(head, mat, L) {
    // a round bowl cut: one smooth dome cut dead straight all the way round, just above the eyebrows
    // and the tops of the ears, with a thick rolled edge
    part(head, shellGeo(1.08, 1.32, 1.55 + 0.18, R + 0.07), mat, { p: [0, 0.01, 0], s: [1.05, 1.03, 1.04], outline: OUT });
    // a few faint lines combed down the fringe
    const line = toon(mix(L.hairColor, '#000000', 0.25));
    for (let i = -3; i <= 3; i++) {
      const a = onHead(i * 0.16, 0.65, R + 0.115), b = onHead(i * 0.17, 0.98, R + 0.12);
      strand(head, line, [a, a.clone().lerp(b, 0.5).multiplyScalar(1.01), b], 0.008, 0.008, { radial: 5, segs: 8, outline: null });
    }
    acShine(head, L, { r: R + 0.09, th: 0.45 });
  },
  hair_emo(head, mat, L) {
    // emo side swoop: a long sleek fringe swept from a deep side part right across the forehead and
    // over one eye, choppy pointed layers round the back, and a little teased volume at the crown
    acCap(head, mat, { front: 0.92, side: 1.55, back: 2.3 });
    const shade = toon(mix(L.hairColor, '#000000', 0.2));
    [[-1.05, 0.3, 0.17, 0.17], [-0.8, 0.38, 0.32, 0.15], [-0.55, 0.45, 0.4, 0.12]].forEach(([p0, t0, x1, w], i) => {
      const a = onHead(p0, t0, R + AC_LIFT), b = onHead(p0 * 0.25, 0.72, R + AC_LIFT + 0.04);
      const c = onFace(x1 * 0.6, 0.13 - i * 0.02, AC_LIFT + 0.02), d = onFace(x1, -0.08 - i * 0.05, 0.06);
      acLock(head, i === 1 ? shade : mat, [a, b, c, d], w, 0.055, 0.2).userData.fringe = true;
    });
    acNape(head, mat, { n: 11, len: 0.24, w: 0.12, from: 0.5, to: 1.5, out: 0.05 });
    acSides(head, mat, { len: 0.3, w: 0.1 });
    for (let i = 0; i < 4; i++) {
      const v = onHead(Math.PI + (i - 1.5) * 0.45, 0.75, 1).normalize(), a = v.clone().multiplyScalar(R + AC_LIFT - 0.02);
      acLock(head, i % 2 ? shade : mat, [a, a.clone().addScaledVector(v, 0.05).add(new THREE.Vector3(0, 0, -0.04)), a.clone().addScaledVector(v, 0.07).add(new THREE.Vector3(0, -0.06, -0.09))], 0.13, 0.05, 0.12);
    }
    acShine(head, L);
  },
  hair_mullet(head, mat, L) {
    // business in the front, party in the back: short and neat on top and at the sides (swept back),
    // long and flowing at the back down onto the shoulders
    acCap(head, mat, { front: 0.95, side: 1.35, back: 2.3, lift: 0.06 });
    const shade = toon(mix(L.hairColor, '#000000', 0.15));
    // the top: a few short locks swept back flat over the crown
    for (let i = 0; i < 5; i++) {
      const phi = (i - 2) * 0.32, a = onHead(phi, 0.85, R + AC_LIFT), b = onHead(phi * 0.9, 0.45, R + AC_LIFT + 0.02);
      acLock(head, i % 2 ? shade : mat, [a, b, onHead(phi * 0.8, 0.15, R + AC_LIFT + 0.01)], 0.15, 0.05, 0.2);
    }
    acBangs(head, mat, { n: 4, len: 0.06, w: 0.12, spread: 0.8, sweep: -0.3 });
    // the party: a mane of long locks from the back of the head, falling in a soft wave
    for (let i = 0; i < 9; i++) {
      const phi = Math.PI + (i / 8 - 0.5) * 2.0, p0 = onHead(phi, 1.3, R + AC_LIFT), p1 = onHead(phi, 1.95, R + AC_LIFT + 0.03);
      const o = new THREE.Vector3(p1.x, 0, p1.z).normalize(), len = 0.42 + (i % 3) * 0.05 - Math.abs(i - 4) * 0.03;
      acLock(head, i % 2 ? shade : mat, [p0, p1,
        p1.clone().addScaledVector(o, 0.06).add(new THREE.Vector3(0, -len * 0.45, 0)),
        p1.clone().addScaledVector(o, 0.03).add(new THREE.Vector3(0, -len * 0.8, 0)),
        p1.clone().addScaledVector(o, 0.1).add(new THREE.Vector3(0, -len, 0))], 0.22, 0.06, 0.25);
    }
    acShine(head, L, { th: 0.62 });
  },
  hair_karen(head, mat, L) {
    // the asymmetric "can I speak to the manager" bob: spiky stacked volume at the back of the crown,
    // long angled sides at the front, a side-swept fringe and chunky blonde highlights
    acCap(head, mat, { front: 0.95, side: 1.55, back: 2.0, sy: 1.08 });
    const hi = toon(mix(L.hairColor, '#ffe9a8', 0.55));
    for (let i = 0; i < 9; i++) {
      const phi = Math.PI + (i - 4) * 0.3, v = onHead(phi, 0.8 + (i % 2) * 0.2, 1).normalize();
      const a = v.clone().multiplyScalar(R + AC_LIFT - 0.02), o = new THREE.Vector3(v.x, 0, v.z).normalize();
      // short choppy stacked layers flicking out at the back of the crown
      acLock(head, mat, [a, a.clone().addScaledVector(o, 0.06).add(new THREE.Vector3(0, 0.02, 0)), a.clone().addScaledVector(o, 0.12).add(new THREE.Vector3(0, -0.01, 0))], 0.13, 0.05, 0.1);
    }
    // chunky highlight streaks combed back over the top
    for (const phi of [Math.PI - 1.1, Math.PI - 0.4, Math.PI + 0.3, Math.PI + 1.0]) {
      const pts = [0.3, 0.75, 1.2, 1.6].map((th) => onHead(phi + th * 0.12, th, (R + AC_LIFT) * 1.065 + 0.012));
      part(head, lockGeo(pts, 0.045, 0.008, 0.5), hi, { outline: null, shadow: false });
    }
    // the long angled front pieces, longer on one side
    for (const s of [-1, 1]) {
      const len = s > 0 ? 0.38 : 0.3, a = onHead(s * 1.0, 0.7, R + AC_LIFT), b = onHead(s * 1.12, 1.3, R + AC_LIFT + 0.03);
      const o = new THREE.Vector3(b.x, 0, b.z).normalize();
      acLock(head, mat, [a, b, b.clone().addScaledVector(o, 0.04).add(new THREE.Vector3(0, -len * 0.5, 0.05)), b.clone().add(new THREE.Vector3(0, -len, 0.12))], 0.17, 0.06, 0.25);
    }
    acBangs(head, mat, { n: 4, sweep: 0.75, len: 0.1, w: 0.13 });
    acNape(head, mat, { n: 7, len: 0.05, w: 0.1, from: 0.7, to: 1.3, th: 1.6 });
    acShine(head, L);
  },
  // ---- waves ----
  hair_wavy_long(head, mat, L) {
    // long, soft waves past the shoulders, parted to one side
    acCap(head, mat, { front: 0.98, side: 1.52, back: 2.4 });
    const shade = toon(mix(L.hairColor, '#000000', 0.14));
    waveLocks(head, mat, shade, { len: 0.78, amp: 0.06, w: 0.17, n: 8 });
    acBangs(head, mat, { n: 4, part: 0.35, len: 0.16, w: 0.15 });
    acShine(head, L);
  },
  hair_wavy_bob(head, mat, L) {
    // a full wavy bob that swings out at the jaw
    acCap(head, mat, { front: 1.0, side: 1.6, back: 2.35, sy: 1.05 });
    const shade = toon(mix(L.hairColor, '#000000', 0.14));
    waveLocks(head, mat, shade, { len: 0.42, amp: 0.05, w: 0.18, n: 7, out: 0.06 });
    acBangs(head, mat, { n: 5, part: -0.3, len: 0.14, w: 0.14 });
    acShine(head, L);
  },
  hair_wavy_short(head, mat, L) {
    // short beachy waves: loose S-shaped locks tumbling over the top and round the ears
    acCap(head, mat, { front: 0.95, side: 1.42, back: 2.15 });
    const shade = toon(mix(L.hairColor, '#000000', 0.14));
    for (let i = 0; i < 7; i++) {
      const phi = (i - 3) * 0.32, th0 = 0.2 + (i % 2) * 0.1;
      const pts = [0, 1, 2, 3, 4].map((k) => onHead(phi + Math.sin(k * 1.6 + i) * 0.12, th0 + k * 0.2, R + AC_LIFT + 0.015 + (k === 4 ? -0.02 : 0)));
      acLock(head, i % 3 === 1 ? shade : mat, pts, 0.15, 0.05, 0.3).userData.fringe = true;
    }
    acNape(head, mat, { n: 7, len: 0.12, w: 0.12 });
    acSides(head, mat, { len: 0.16, w: 0.1, outward: 0.04 });
    acShine(head, L);
  },
  hair_flipbob(head, mat, L) {
    // a sleek bob with the ends flipped out and up all the way round, and a soft full fringe
    acCap(head, mat, { front: 1.0, side: 1.6, back: 2.35 });
    curtain(head, mat, { len: 0.26, flare: 0.1, wrap: 0.55 });
    for (let i = 0; i < 11; i++) {
      const a = Math.PI / 2 - 0.4 + (i / 10) * (Math.PI + 0.8), r = R + 0.16;
      const p0 = new THREE.Vector3(Math.sin(a) * r, -0.22, Math.cos(a) * r * 0.94), o = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      acLock(head, mat, [p0, p0.clone().add(new THREE.Vector3(0, -0.08, 0)), p0.clone().addScaledVector(o, 0.05).add(new THREE.Vector3(0, -0.11, 0)), p0.clone().addScaledVector(o, 0.08).add(new THREE.Vector3(0, -0.05, 0))], 0.17, 0.05, 0.35);
    }
    acBangs(head, mat, { n: 6, len: 0.14, spread: 1.1, w: 0.12 });
    acShine(head, L);
  },
  hair_halfup(head, mat, L) {
    // half up, half down: long straight hair with the top gathered into a little ponytail at the back
    acCap(head, mat, { front: 0.98, side: 1.5, back: 2.4 });
    curtain(head, mat, { len: 0.62, flare: 0.08, wrap: 0.3 });
    tail(head, mat, [[0, 0.3, -0.42], [0, 0.26, -0.52], [0, 0.12, -0.56], [0, -0.06, -0.54]], 0.1, 0.05, tieColor(L, '#ff5d73'));
    part(head, sphere(0.1, 14, 10), mat, { p: [0, 0.3, -0.42], outline: OUT_THIN });
    acSides(head, mat, { len: 0.52, w: 0.12, outward: 0.03 });
    acBangs(head, mat, { n: 5, part: 0.2, len: 0.14 });
    acShine(head, L);
  },
  hair_boxbraids(head, mat, L) {
    // long box braids down past the shoulders, a few framing the face, gold cuffs here and there
    shell(head, partsMaterial(hex(L.hairColor), hex(L.skin)), { front: 0.95, side: 1.5, back: 2.25, lift: 0.014, outline: null });
    const shade = toon(mix(L.hairColor, '#000000', 0.2)), gold = shiny('#ffd84d', { metalness: 0.6, roughness: 0.3 });
    let n = 0;
    for (let i = 0; i < 26; i++) {
      const phi = (i / 26) * TAU + 0.12;
      const front = Math.cos(phi);
      if (front > 0.8) continue; // (not over the face)
      const th = hairline(phi, 0.95, 1.5, 2.25) - 0.08;
      const root = onHead(phi, 0.35 + (i % 3) * 0.12, R + 0.03), edge = onHead(phi, th, R + 0.06);
      const o = new THREE.Vector3(edge.x, 0, edge.z).normalize();
      const len = (front > 0.3 ? 0.55 : 0.8) + ((i * 7) % 4) * 0.05;
      const tip = edge.clone().addScaledVector(o, 0.06).add(new THREE.Vector3(0, -len, 0));
      const pts = [root, root.clone().lerp(edge, 0.5).setLength(R + 0.06), edge, edge.clone().lerp(tip, 0.5).addScaledVector(o, 0.04), tip];
      strand(head, n++ % 3 === 0 ? shade : mat, pts, 0.034, 0.03, { bumps: 16, bumpAmt: 0.18, radial: 7, segs: 40 });
      if (i % 3 === 0) part(head, cyl(0.04, 0.04, 0.05, 10), gold, { p: edge.clone().lerp(tip, 0.75).addScaledVector(o, 0.03).toArray(), outline: null });
    }
  },
  hair_sidepony(head, mat, L) {
    // everything swept round to one side into a low, curly ponytail resting on the shoulder
    acCap(head, mat, { front: 0.95, side: 1.5, back: 2.3, lift: 0.05 });
    const tie = toon(tieColor(L, '#ff5d8f'));
    const root = new THREE.Vector3(-0.36, -0.12, -0.28);
    part(head, torus(0.08, 0.03, TAU, 8, 16), tie, { p: root.toArray(), r: [0.3, 0.9, 0], outline: null });
    // a bouncy cluster of curls
    const items = [];
    for (let k = 0; k < 22; k++) {
      const t = k / 21, a = k * 2.4, r = 0.09 + Math.sin(t * Math.PI) * 0.06;
      items.push([root.x - 0.08 - t * 0.05 + Math.cos(a) * r, root.y - 0.08 - t * 0.38, root.z + 0.05 + t * 0.06 + Math.sin(a) * r, 0.075]);
    }
    curls(head, mat, L, 'sidepony', items);
    acBangs(head, mat, { n: 4, sweep: -0.5, len: 0.12 });
    acSides(head, mat, { len: 0.16, w: 0.09 });
    acShine(head, L);
  },
  hair_bangs(head, mat, L) {
    // long, straight, silky hair with a thick blunt fringe cut straight across above the eyes
    acCap(head, mat, { front: 0.98, side: 1.5, back: 2.4 });
    curtain(head, mat, { len: 0.7, flare: 0.07, wrap: 0.3 });
    for (let i = 0; i < 8; i++) {
      const phi = (i / 7 - 0.5) * 1.35, a = onHead(phi, 0.35, R + AC_LIFT - 0.01);
      const b = onHead(phi, 0.8, R + AC_LIFT + 0.015), c = onHead(phi, 1.12 + Math.abs(phi) * 0.12, R + 0.05);
      acLock(head, mat, [a, b, c], 0.13, 0.05, 0.85).userData.fringe = true;
    }
    acSides(head, mat, { len: 0.55, w: 0.12, outward: 0.03 });
    for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 - 0.2 + (i / 8) * (Math.PI + 0.4), r = R + 0.05 + 0.08;
      const top = new THREE.Vector3(Math.sin(a) * r, -0.56, Math.cos(a) * r * 0.94);
      acLock(head, mat, [top, top.clone().add(new THREE.Vector3(0, -0.1, 0)), top.clone().add(new THREE.Vector3(0, -0.17, 0))], 0.15, 0.045, 0.9);
    }
    acShine(head, L);
  },
});
const TALL_HAIR = new Set(['hair_ringlets', 'hair_curlybob', 'hair_curly', 'hair_liberty', 'hair_freeform', 'hair_twists', 'hair_dreads', 'hair_spiky', 'hair_mohawk', 'hair_bun', 'hair_afro', 'hair_quiff', 'hair_spacebuns', 'hair_topknot', 'hair_messy', 'hair_flame', 'hair_karen', 'hair_braidcrown']);
/** How much further out than usual the hair reaches (hats and hair accessories sit that much higher). */
const HAIR_VOLUME = { hair_curly: 1.14, hair_curlybob: 1.16, hair_ringlets: 1.14, hair_afro: 1.42, hair_dreads: 1.08 };

// ---------------------------------------------------------------------------
// hats (in head space; top of the head is y = R)
// ---------------------------------------------------------------------------

// hats and back items that take your chosen accessory colour (full palette), else their own default
const hatCol = (L, def) => L.hatColor || def;
const backCol = (L, def) => L.backColor || def;

const HATS = {
  hat_cap(head, L) {
    const c = hatCol(L, L.topColor), m = toon(c);
    part(head, dome(R + 0.05), m, { p: [0, 0.04, 0], s: [1, 0.85, 1] });
    part(head, cyl(0.3, 0.3, 0.035, 28), toon(tint(c, 0.8)), { p: [0, 0.14, 0.36], s: [1, 1, 0.85], r: [0.12, 0, 0] });
    part(head, sphere(0.045), toon(tint(c, 1.3)), { p: [0, R + 0.02, 0] });
  },
  hat_beanie(head, L) {
    const base = hatCol(L, L.topColor), c = tint(base, 0.85);
    part(head, dome(R + 0.06, Math.PI / 2 + 0.1), toon(c), { s: [1, 1.12, 1] });
    part(head, torus(R + 0.05, 0.06), toon(tint(base, 1.25)), { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0] });
    part(head, sphere(0.11), toon('#ffffff'), { p: [0, R + 0.2, 0] });
  },
  hat_headphones(head, L) {
    part(head, torus(R + 0.07, 0.035, Math.PI), toon('#2b2f4a'), { outline: OUT_THIN });
    for (const s of [-1, 1]) part(head, cyl(0.13, 0.13, 0.1), toon(hatCol(L, '#ff5d73')), { p: [s * (R + 0.04), 0, 0], r: [0, 0, Math.PI / 2] });
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
  hat_cowboy(head, L) {
    const col = hatCol(L, '#8b5a2b');
    const brown = toon(col, { side: THREE.DoubleSide });
    const brim = geo('cowboyBrim', () => new THREE.LatheGeometry([0.28, 0.62, 0.72, 0.78].map((x, i) => new THREE.Vector2(x, [0, 0, 0.06, 0.14][i])), 40));
    part(head, brim, brown, { p: [0, 0.27, 0], outline: OUT_THIN });
    part(head, cyl(0.26, 0.31, 0.32), toon(col), { p: [0, 0.43, 0] });
    part(head, cyl(0.315, 0.315, 0.06), toon(tint(col, 0.55)), { p: [0, 0.31, 0], outline: null });
  },
  hat_bucket(head, L) {
    const kc = hatCol(L, '#c9b27a');
    const khaki = toon(kc, { side: THREE.DoubleSide });
    const brim = geo('bucketBrim', () => new THREE.LatheGeometry([0.36, 0.5, 0.58].map((x, i) => new THREE.Vector2(x, [0, -0.07, -0.13][i])), 40));
    part(head, brim, khaki, { p: [0, 0.28, 0], outline: OUT_THIN });
    part(head, cyl(0.3, 0.38, 0.3), toon(kc), { p: [0, 0.43, 0] });
    part(head, sphere(0.05), toon('#ff9f43'), { p: [0, 0.43, 0.35], s: [1.5, 0.8, 0.5], outline: null });
  },
  hat_robin(head) {
    part(head, cone(0.36, 0.8, 20), toon('#2f9e44'), { p: [0, 0.3, -0.12], r: [-1.2, 0, 0], s: [1, 1, 0.55] });
    const pts = [new THREE.Vector3(-0.2, 0.42, -0.05), new THREE.Vector3(-0.28, 0.62, -0.2), new THREE.Vector3(-0.3, 0.8, -0.42), new THREE.Vector3(-0.26, 0.9, -0.62)];
    taper(head, pts, 0.04, 0.01, toon('#e0463c'));
  },
  hat_helmet(head, L) {
    part(head, geo('helmetShell', () => new THREE.SphereGeometry(R + 0.09, 32, 20, 0, TAU, 0, 2.05)), toon(hatCol(L, '#e0463c')));
    part(head, torus(R + 0.095, 0.035, Math.PI), toon('#ffffff'), { r: [0, Math.PI / 2, 0], outline: null });
    const visor = geo('visor', () => new THREE.SphereGeometry(R + 0.1, 24, 10, Math.PI / 2 + 0.95, -1.9, 1.2, 0.62));
    part(head, visor, shiny('#1a2a4a', { transparent: true, opacity: 0.88, side: THREE.DoubleSide }), { outline: null });
  },
  hat_durag(head, L) {
    // a satin du-rag: fitted over the top of the head from the forehead to the back, clear of the ears,
    // a band across the brow, a seam down the middle, knotted at the back with two long tails
    const c = hatCol(L, '#1d1b2e');
    const satin = shiny(c, { roughness: 0.22, metalness: 0.15 });
    shell(head, satin, { front: 1.02, side: 1.32, back: 1.95, lift: 0.055 });
    // the band: a slightly raised strip following the front edge round to the back
    const band = geo('duragBand', () => {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const phi = (i / 40) * TAU;
        pts.push(onHead(phi, hairline(phi, 1.02, 1.32, 1.95 + 0.18) - 0.07, R + 0.062));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, 0.022, 6, true);
    });
    part(head, band, satin, { outline: null });
    // the seam down the middle
    const seam = geo('duragSeam2', () => {
      const pts = [];
      for (let i = 0; i <= 12; i++) pts.push(onHead(0, -1.75 + (i / 12) * 2.72, R + 0.06));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.01, 5);
    });
    part(head, seam, toon(tint(c, 0.7)), { outline: null });
    // knot and tails at the back
    const knot = onHead(Math.PI, 1.72, R + 0.07);
    part(head, sphere(0.07, 12, 10), satin, { p: knot.toArray(), s: [1.2, 0.9, 0.8], outline: OUT_THIN });
    for (const sx of [-1, 1]) {
      part(head, sphere(0.06, 10, 8), satin, { p: [knot.x + sx * 0.08, knot.y + 0.02, knot.z + 0.02], s: [1.4, 0.7, 0.5], r: [0, 0, sx * 0.5], outline: OUT_THIN });
      const g = geo('duragTail', () => { const pg = new THREE.PlaneGeometry(0.13, 0.6, 1, 6); pg.translate(0, -0.3, 0); return pg; });
      part(head, g, toon(c, { side: THREE.DoubleSide }), { p: [knot.x + sx * 0.05, knot.y - 0.04, knot.z - 0.02], r: [0.18, 0, sx * 0.12], outline: OUT_THIN });
    }
  },
  hat_viking(head) {
    part(head, dome(R + 0.05), toon('#9aa3b5'));
    part(head, torus(R + 0.05, 0.045), toon('#b8860b'), { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0] });
    for (const s of [-1, 1]) {
      const pts = [[0.36, 0.18, 0], [0.55, 0.28, 0], [0.68, 0.48, 0], [0.7, 0.68, 0]].map(([x, y, z]) => new THREE.Vector3(s * x, y, z));
      taper(head, pts, 0.08, 0.012, toon('#f4ecd8'));
    }
  },
  hat_tophat(head, L) {
    const tc = hatCol(L, '#1d1b2e');
    part(head, cyl(0.44, 0.44, 0.035, 36), toon(tc), { p: [0, 0.32, 0] });
    part(head, cyl(0.27, 0.29, 0.56, 32), toon(tc), { p: [0, 0.62, 0] });
    part(head, cyl(0.295, 0.295, 0.09, 32), toon('#e0463c'), { p: [0, 0.4, 0], outline: null });
  },
  hat_wizard(head, L) {
    const wc = hatCol(L, '#5b3fb5');
    const purple = toon(wc);
    part(head, cyl(0.58, 0.58, 0.03, 40), toon(tint(wc, 0.8)), { p: [0, 0.3, 0] });
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

  // ---- hair accessories ----
  hat_bow(head, L) {
    // a big bow on top of the head, tilted to one side
    const c = hatCol(L, '#ff5d8f'), m = toon(c);
    const g = onSurface(head, -0.7, 0.5, R + 0.07, 0.3);
    for (const s of [-1, 1]) {
      part(g, sphere(0.11, 16, 12), m, { p: [s * 0.12, 0.01, 0], s: [1.25, 0.9, 0.42], r: [0, 0, s * 0.3], outline: OUT_THIN });
      part(g, box(0.05, 0.14, 0.02), m, { p: [s * 0.05, -0.1, 0.01], r: [0, 0, s * 0.35], outline: OUT_THIN });
    }
    part(g, sphere(0.05, 12, 10), toon(tint(c, 0.8)), { p: [0, 0, 0.02], s: [1, 1.1, 0.7], outline: OUT_THIN });
  },
  hat_headband(head, L) {
    // a padded headband over the top of the head, from ear to ear
    const c = hatCol(L, '#39c6ff');
    part(head, torus(R + 0.075, 0.034, Math.PI, 8, 40), toon(c), { r: [0.45, 0, 0], outline: OUT_THIN });
  },
  hat_flower(head, L) {
    // a big flower tucked behind one ear, with a smaller bud beside it
    const c = hatCol(L, '#ff9fe0');
    flower(head, 'flowerBig', onSurface(head, 1.0, 0.72, R + 0.08), c, 0.095);
    flower(head, 'flowerSmall', onSurface(head, 1.3, 0.55, R + 0.08), tint(c, 1.35), 0.06);
  },
  hat_flowercrown(head) {
    // a ring of little flowers and leaves all the way round
    const cols = ['#ff9fe0', '#ffd84d', '#ffffff', '#9fd8ff', '#ff8a65'];
    const leaf = toon('#4caf50');
    for (let i = 0; i < 10; i++) {
      const phi = (i / 10) * TAU, th = 0.68 + (1 - Math.cos(phi)) * 0.2;
      flower(head, `crown${i % 5}`, onSurface(head, phi, th, R + 0.08), cols[i % 5], 0.05);
      const l = onSurface(head, phi + TAU / 20, th + 0.02, R + 0.075, 0.9);
      part(l, sphere(0.05, 10, 8), leaf, { s: [1.5, 0.6, 0.35], outline: OUT_THIN });
    }
  },
  hat_clips(head, L) {
    // a row of bright hair clips above one ear
    const c = hatCol(L, '#ffd84d');
    [c, '#ff5d8f', '#6ee7a0'].forEach((col, k) => {
      const g = onSurface(head, 0.75 + k * 0.1, 0.45 + k * 0.19, R + 0.09, 0.5);
      part(g, box(0.22, 0.055, 0.04), toon(col), { outline: OUT_THIN });
      part(g, sphere(0.04, 10, 8), toon(tint(col, 1.3)), { p: [0.11, 0, 0.015], outline: null });
    });
  },
  hat_beret(head, L) {
    const c = hatCol(L, '#d6334a');
    part(head, sphere(0.4, 28, 16), toon(c), { p: [-0.06, R + 0.04, -0.02], s: [1, 0.3, 1], r: [0.12, 0, 0.22] });
    part(head, torus(0.33, 0.025, TAU, 8, 32), toon(tint(c, 0.75)), { p: [-0.04, R - 0.02, -0.01], r: [Math.PI / 2 + 0.12, 0, 0.18], outline: null });
    part(head, cyl(0.018, 0.022, 0.07, 8), toon(tint(c, 0.7)), { p: [-0.1, R + 0.16, -0.02], r: [0.1, 0, 0.25], outline: null });
  },
  hat_sunhat(head, L) {
    // a wide, floppy straw sun hat with a ribbon round the crown
    const c = hatCol(L, '#f2d9a0');
    const straw = toon(c, { side: THREE.DoubleSide });
    const brim = geo('sunBrim2', () => {
      // floppy: the brim droops and ripples gently all the way round
      const g = new THREE.LatheGeometry([0.3, 0.5, 0.68, 0.84].map((x, i) => new THREE.Vector2(x, [0, -0.04, -0.12, -0.22][i])), 64);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); p.setY(i, p.getY(i) + Math.sin(Math.atan2(z, x) * 6) * 0.025 * Math.max(0, r - 0.4)); }
      g.computeVertexNormals();
      return g;
    });
    part(head, brim, straw, { p: [0, 0.3, 0], r: [0.08, 0, 0], outline: OUT_THIN });
    part(head, cyl(0.28, 0.33, 0.24, 32), toon(c), { p: [0, 0.42, 0.01] });
    part(head, cyl(0.335, 0.335, 0.06, 32), toon('#ff7aa8'), { p: [0, 0.34, 0.01], outline: null });
    const bow = onSurface(head, -0.9, 1.05, 0.34);
    bow.position.y = 0.35;
    for (const s of [-1, 1]) part(bow, sphere(0.05, 10, 8), toon('#ff7aa8'), { p: [s * 0.05, 0, 0], s: [1.3, 0.8, 0.4], outline: OUT_THIN });
  },
  hat_bandana(head, L) {
    // a polka-dot bandana tied over the hair, knotted at the back
    const c = hatCol(L, '#e0463c');
    const m = dotsMaterial(hex(c));
    shell(head, m, { front: 1.0, side: 1.32, back: 1.95, lift: 0.06 });
    const knot = onHead(Math.PI, 1.72, R + 0.075);
    part(head, sphere(0.07, 12, 10), toon(c), { p: knot.toArray(), s: [1.2, 0.9, 0.8], outline: OUT_THIN });
    for (const sx of [-1, 1]) {
      const g = geo('bandanaTail', () => { const pg = new THREE.PlaneGeometry(0.12, 0.26, 1, 3); pg.translate(0, -0.13, 0); return pg; });
      part(head, g, toon(c, { side: THREE.DoubleSide }), { p: [knot.x + sx * 0.05, knot.y - 0.03, knot.z - 0.02], r: [0.25, 0, sx * 0.4], outline: OUT_THIN });
    }
  },
};

/** A group sitting on the head surface at (phi, th), its z pointing out of the head; `roll` turns it. */
function onSurface(head, phi, th, r, roll = 0) {
  const g = new THREE.Group();
  const p = onHead(phi, th, r);
  g.position.copy(p);
  g.quaternion.copy(faceTo(p)).multiply(new THREE.Quaternion().setFromAxisAngle(Z, roll));
  head.add(g);
  return g;
}
/** A five-petal flower (one mesh for the petals) facing out of `g`. */
function flower(head, key, g, color, size) {
  const petals = [];
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.3; petals.push([Math.cos(a) * size, Math.sin(a) * size, 0, size * 0.8]); }
  part(g, bubbleGeo(`petals${size}`, petals), toon(color), { s: [1, 1, 0.45], outline: OUT_THIN });
  part(g, sphere(size * 0.55, 10, 8), toon('#ffc93d'), { p: [0, 0, size * 0.35], s: [1, 1, 0.6], outline: null });
}
function dotsMaterial(color) {
  const key = `dots${color}`;
  if (!hairTexCache.has(key)) {
    const tex = canvasTexture(128, 128, (c) => {
      c.fillStyle = color; c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#ffffff';
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.beginPath(); c.arc(x * 32 + (y % 2) * 16 + 8, y * 32 + 16, 5, 0, TAU); c.fill(); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 2);
    hairTexCache.set(key, new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, gradientMap: toon('#ffffff').gradientMap }));
  }
  return hairTexCache.get(key);
}

// ---------------------------------------------------------------------------
// face items
// ---------------------------------------------------------------------------

const EYE_X = 0.16, EYE_Y = 0.0;
// face items marked "tint" take the colour picked for their slot, otherwise their own
const faceCol = (L, def) => L.faceColor || def;

/** The full beard: one thick, soft piece along the jaw from sideburn to sideburn, full at the chin,
 *  stopping under the bottom lip so the mouth still shows. */
function beardGeo() {
  return geo('beard2', () => {
    const U = 34, V = 12, pos = [], idx = [];
    const v = new THREE.Vector3();
    for (let i = 0; i <= U; i++) {
      const phi = -1.72 + (i / U) * 3.44, front = Math.max(0, Math.cos(phi));
      // where it starts (top) and ends (bottom), measured down from the crown
      const top = Math.PI / 2 - 0.2 + front * front * 0.58; // sideburns up by the ears, just under the lip in front
      const bot = Math.PI / 2 + 0.78 + front * 0.22;        // along the jawline, round under the chin
      for (let j = 0; j <= V; j++) {
        const t = j / V, th = top + (bot - top) * t;
        // thicker towards the chin and the lower edge, a little lumpy so it reads as hair
        const thick = 0.022 + front * front * (0.03 + t * 0.05) + Math.sin(t * Math.PI) * 0.02 + Math.sin(i * 1.7 + j * 2.3) * 0.004;
        v.set(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi)).multiplyScalar(R + thick);
        if (front > 0.6 && t > 0.65) v.y -= (t - 0.65) * 0.12 * (front - 0.6) * 2.5; // the chin comes to a soft point
        pos.push(v.x, v.y, v.z);
      }
    }
    for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j, b = (i + 1) * (V + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

const FACES = {
  face_glasses(head, L) {
    const m = toon(faceCol(L, '#1d1b2e'));
    for (const s of [-1, 1]) {
      const p = onFace(s * EYE_X, EYE_Y, 0.035);
      part(head, torus(0.1, 0.014, TAU, 8, 28), m, { p: p.toArray(), q: faceTo(p), outline: null });
      // the arms back to the ears
      const a = onFace(s * (EYE_X + 0.1), EYE_Y + 0.01, 0.03), b = new THREE.Vector3(s * (R + 0.012), EYE_Y + 0.01, 0.02), c2 = new THREE.Vector3(s * (R - 0.04), EYE_Y - 0.02, -0.2);
      taper(head, [a, b, c2], 0.011, 0.011, m);
    }
    part(head, cyl(0.012, 0.012, 0.1, 6), m, { p: [0, EYE_Y + 0.01, R + 0.02], r: [0, 0, Math.PI / 2], outline: null });
  },
  face_sunglasses(head, L) {
    const m = shiny(faceCol(L, '#141220'), { metalness: 0.4, roughness: 0.15 });
    for (const s of [-1, 1]) {
      const p = onFace(s * EYE_X, EYE_Y, 0.03);
      part(head, box(0.2, 0.13, 0.04), m, { p: p.toArray(), q: faceTo(p), outline: OUT_THIN });
    }
    part(head, box(0.1, 0.03, 0.03), m, { p: [0, EYE_Y + 0.03, R + 0.02], outline: null });
    for (const s of [-1, 1]) {
      // arms: from the lens edge, curving back along the side of the head
      const a = onFace(s * (EYE_X + 0.1), EYE_Y + 0.03, 0.02), b = new THREE.Vector3(s * (R + 0.015), EYE_Y + 0.03, 0.02), c2 = new THREE.Vector3(s * (R - 0.04), EYE_Y, -0.2);
      taper(head, [a, b, c2], 0.015, 0.015, m);
    }
  },
  face_mustache(head, L) {
    // a curly handlebar: two fat lobes from under the nose, flicking up at the ends
    const m = toon(faceCol(L, mix(L.hairColor, '#000000', 0.15)));
    for (const s of [-1, 1]) {
      const p = onFace(s * 0.07, -0.085, 0.016);
      part(head, sphere(0.06, 14, 10), m, { p: p.toArray(), s: [1.45, 0.6, 0.65], r: [0, 0, s * 0.3], outline: OUT_THIN });
      const tip = onFace(s * 0.15, -0.065, 0.012);
      part(head, sphere(0.03, 10, 8), m, { p: tip.toArray(), s: [1.3, 0.7, 0.7], r: [0, 0, -s * 0.6], outline: null });
    }
  },
  face_eyepatch(head, L) {
    const m = toon(faceCol(L, '#15131f'));
    const p = onFace(EYE_X, EYE_Y, 0.02);
    part(head, cyl(0.1, 0.1, 0.025, 20), m, { p: p.toArray(), q: new THREE.Quaternion().setFromUnitVectors(Y, p.clone().normalize()), outline: null });
    // the strap: a great circle through the patch, running up across the forehead and round the back
    const u = p.clone().normalize();
    const w = new THREE.Vector3(-1, 0.22, 0).addScaledVector(u, -new THREE.Vector3(-1, 0.22, 0).dot(u)).normalize();
    const strap = geo('patchStrap2', () => {
      const pts = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        pts.push(u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).multiplyScalar(R + (Math.cos(a) > 0.9 ? 0.02 : 0.05)));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, 0.013, 6, true);
    });
    part(head, strap, m, { outline: null });
  },
  face_heartshades(head, L) {
    const c = faceCol(L, '#ff4f8b');
    const m = shiny(c, { roughness: 0.2 }), frame = toon(tint(c, 0.6));
    for (const s of [-1, 1]) {
      const p = onFace(s * EYE_X, EYE_Y, 0.035);
      part(head, geo('heartLens', () => new THREE.ExtrudeGeometry(heartShape(0.1), { depth: 0.025, bevelEnabled: false })), m, { p: p.toArray(), q: faceTo(p), outline: OUT_THIN });
    }
    part(head, box(0.1, 0.022, 0.02), frame, { p: [0, EYE_Y + 0.035, R + 0.03], outline: null });
  },
  face_3dglasses(head) {
    const frame = toon('#f4f0ff');
    part(head, box(0.1, 0.03, 0.02), frame, { p: [0, EYE_Y + 0.02, R + 0.03], outline: null });
    for (const s of [-1, 1]) {
      const a = onFace(s * (EYE_X + 0.11), EYE_Y + 0.03, 0.025), b = new THREE.Vector3(s * (R + 0.015), EYE_Y + 0.03, 0.02), c2 = new THREE.Vector3(s * (R - 0.03), EYE_Y, -0.2);
      taper(head, [a, b, c2], 0.014, 0.014, frame);
    }
    [['#ff3b4f', -1], ['#39c6ff', 1]].forEach(([c, s]) => {
      const p = onFace(s * EYE_X, EYE_Y, 0.035);
      part(head, box(0.19, 0.12, 0.012), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75 }), { p: p.toArray(), q: faceTo(p), outline: null });
      part(head, box(0.22, 0.15, 0.01), frame, { p: onFace(s * EYE_X, EYE_Y, 0.028).toArray(), q: faceTo(p), outline: OUT_THIN });
    });
  },
  face_goggles(head, L) {
    const strap = toon(faceCol(L, '#5a3a1e')), lens = shiny('#8fd3ff', { roughness: 0.1 }), rim = shiny('#c9a44a', { metalness: 0.6 });
    part(head, torus(R + 0.02, 0.028, TAU, 6, 48), strap, { p: [0, EYE_Y + 0.1, 0], r: [Math.PI / 2 - 0.12, 0, 0], outline: null });
    for (const s of [-1, 1]) {
      const p = onFace(s * EYE_X, EYE_Y + 0.02, 0.05);
      part(head, cyl(0.085, 0.09, 0.06, 20), rim, { p: p.toArray(), q: new THREE.Quaternion().setFromUnitVectors(Y, p.clone().normalize()), outline: OUT_THIN });
      part(head, circle(0.07), lens, { p: onFace(s * EYE_X, EYE_Y + 0.02, 0.082).toArray(), q: faceTo(p), outline: null });
    }
  },
  face_bandana(head, L) {
    // a cowboy bandana: a printed cloth tied snugly over the nose and all the way round, its point hanging
    // down over the chin in front, knotted at the back of the neck with two short tails
    const c = faceCol(L, '#d6334a');
    const cloth = dotsMaterial(hex(c)).clone();
    cloth.side = THREE.DoubleSide;
    const band = geo('bandanaBand2', () => new THREE.SphereGeometry(R + 0.022, 40, 14, 0, TAU, Math.PI / 2 + 0.08, 0.7));
    part(head, band, cloth, { outline: OUT_THIN });
    // a rolled top edge, just under the eyes
    part(head, torus(Math.sin(Math.PI / 2 + 0.08) * (R + 0.024), 0.014, TAU, 6, 48), toon(tint(c, 0.8)), { p: [0, Math.cos(Math.PI / 2 + 0.08) * (R + 0.024), 0], r: [Math.PI / 2, 0, 0], outline: null });
    // the point: a triangle of the same cloth hanging off the front, tucked against the chin
    const tri = geo('bandanaPoint', () => {
      const sh = new THREE.Shape();
      sh.moveTo(-0.15, 0); sh.lineTo(0.15, 0); sh.quadraticCurveTo(0.05, -0.11, 0, -0.2); sh.quadraticCurveTo(-0.05, -0.11, -0.15, 0);
      const g = new THREE.ShapeGeometry(sh, 6);
      const uv = g.attributes.uv; // (so the print lines up roughly with the band)
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.5, uv.getY(i) * 2.5);
      return g;
    });
    part(head, tri, cloth, { p: [0, -0.29, R - 0.095], r: [0.55, 0, 0], outline: OUT_THIN });
    const knot = new THREE.Vector3(0, -0.12, -R - 0.03);
    part(head, sphere(0.05, 10, 8), toon(c), { p: knot.toArray(), s: [1.2, 0.9, 0.8], outline: OUT_THIN });
    for (const sx of [-1, 1]) part(head, box(0.06, 0.17, 0.015), toon(c), { p: [sx * 0.04, -0.21, -R - 0.05], r: [0.25, 0, sx * 0.4], outline: OUT_THIN });
  },
  face_clownnose(head, L) {
    part(head, sphere(0.07, 16, 12), shiny(faceCol(L, '#ff2d3d'), { roughness: 0.15 }), { p: onFace(0, -0.04, 0.035).toArray(), outline: OUT_THIN });
  },
  face_beard(head, L) {
    const c = faceCol(L, mix(L.hairColor, '#000000', 0.08));
    const m = toon(c, { side: THREE.DoubleSide });
    part(head, beardGeo(), m, { outline: OUT_THIN });
    // a mustache joining it at the corners of the mouth
    for (const s of [-1, 1]) {
      const p = onFace(s * 0.065, -0.088, 0.018);
      part(head, sphere(0.058, 12, 8), toon(c), { p: p.toArray(), s: [1.5, 0.55, 0.6], r: [0, 0, s * 0.42], outline: null });
    }
    // a few darker tufts for texture
    const dark = toon(tint(c, 0.75));
    for (const [x, y] of [[-0.1, -0.24], [0.08, -0.27], [-0.02, -0.31], [0.16, -0.2], [-0.18, -0.17]]) {
      const p = onFace(x, y, 0.05 + (Math.abs(x) < 0.12 ? 0.03 : 0));
      part(head, sphere(0.03, 8, 6), dark, { p: p.toArray(), s: [0.6, 1.3, 0.5], outline: null, shadow: false });
    }
  },
  face_bandaid(head) {
    const p = onFace(-0.2, -0.1, 0.012);
    const g = part(head, box(0.16, 0.055, 0.012), toon('#f2c29a'), { p: p.toArray(), q: faceTo(p), outline: OUT_THIN });
    g.rotateZ(0.5);
    part(g, box(0.06, 0.045, 0.004), toon('#e8a878'), { p: [0, 0, 0.008], outline: null, shadow: false });
  },
  face_cyber(head, L, anim) {
    const tinted = !!L.faceColor;
    const glow = new THREE.MeshBasicMaterial({ color: faceCol(L, '#39e6ff'), transparent: true, opacity: 0.85 });
    const band = geo('cyberBand', () => new THREE.SphereGeometry(R + 0.04, 40, 6, -1.35, 2.7, Math.PI / 2 - 0.15, 0.2));
    part(head, band, toon('#1d1b2e', { side: THREE.DoubleSide }), { p: [0, EYE_Y, 0], outline: OUT_THIN });
    const strip = part(head, geo('cyberStrip', () => new THREE.SphereGeometry(R + 0.045, 40, 2, -1.2, 2.4, Math.PI / 2 - 0.06, 0.05)), glow, { p: [0, EYE_Y, 0], outline: null, shadow: false });
    anim.push((t) => { if (!tinted) glow.color.setHSL((0.52 + Math.sin(t * 0.8) * 0.08 + 1) % 1, 0.9, 0.6); strip.scale.x = 1 + Math.sin(t * 6) * 0.01; });
  },
  face_ninja(head, L) {
    const c = faceCol(L, '#23213a');
    const m = toon(c, { side: THREE.DoubleSide });
    // a band of cloth wrapped round the lower face: part of a sphere shell, so it hugs the cheeks and chin
    const band = geo('ninjaBand', () => new THREE.SphereGeometry(R + 0.018, 36, 16, 0, TAU, Math.PI / 2 + 0.12, 0.62));
    part(head, band, m, { outline: OUT_THIN });
    part(head, torus(R + 0.02, 0.02, TAU, 8, 48), toon(tint(c, 1.3)), { p: [0, -0.05, 0], r: [Math.PI / 2, 0, 0], outline: null });
    part(head, sphere(0.06, 12, 10), m, { p: [0, -0.07, -R - 0.03], s: [1.2, 1, 0.7] });
    for (const s of [-1, 1]) part(head, box(0.07, 0.24, 0.02), m, { p: [s * 0.06, -0.2, -R - 0.05], r: [0.3, 0, s * 0.35], outline: OUT_THIN });
  },
  face_monocle(head, L) {
    const gold = shiny(faceCol(L, '#ffc53d'), { metalness: 0.8 });
    const p = onFace(EYE_X, EYE_Y, 0.035);
    part(head, torus(0.105, 0.014, TAU, 8, 28), gold, { p: p.toArray(), q: faceTo(p), outline: null });
    const pts = [p.clone().add(new THREE.Vector3(0.02, -0.1, 0)), onFace(0.24, -0.22, 0.02), new THREE.Vector3(0.22, -0.4, 0.2)];
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
  back_backpack(back, anim, state, L) {
    const c = backCol(L, '#c96b2c');
    part(back, box(0.44, 0.5, 0.22), toon(c), { p: [0, -0.02, -0.1] });
    part(back, box(0.46, 0.17, 0.25), toon(tint(c, 1.2)), { p: [0, 0.18, -0.1] });
    part(back, box(0.26, 0.16, 0.06), toon(tint(c, 0.8)), { p: [0, -0.14, -0.23], outline: OUT_THIN });
  },
  back_cape(back, anim, state, L) {
    const g = new THREE.PlaneGeometry(0.66, 0.98, 4, 10);
    g.translate(0, -0.49, 0);
    const base = Float32Array.from(g.attributes.position.array);
    const cape = new THREE.Mesh(g, toon(backCol(L, '#d6334a'), { side: THREE.DoubleSide }));
    cape.position.set(0, 0.22, -0.08);
    // a gold clasp at each shoulder
    for (const sx of [-1, 1]) part(back, sphere(0.05, 12, 10), shiny('#ffc53d'), { p: [sx * 0.24, 0.2, 0.0], outline: null });
    cape.castShadow = true;
    back.add(cape);
    state.disposables.push(g);
    anim.push((t, dt, moving) => {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x0 = base[i * 3], y0 = base[i * 3 + 1];
        const k = -y0 / 0.98;
        pos.setX(i, x0 * (1 + k * 0.3));
        const wrap = (1 - k) * Math.pow(Math.abs(x0) / 0.33, 2) * 0.14; // the top edge curls round the shoulders
        pos.setZ(i, wrap - k * k * (moving ? 0.55 : 0.1) - Math.sin(t * 4 + k * 5) * 0.035 * k);
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
    anim.push((t) => ws.forEach((w, i) => { w.rotation.y = (i ? 1 : -1) * (0.55 + Math.sin(t * 4) * 0.25); })); // (flapping behind you)
  },
  back_dragon(back, anim) {
    const ws = [wing(back, -1, true), wing(back, 1, true)];
    anim.push((t) => ws.forEach((w, i) => { w.rotation.y = (i ? 1 : -1) * (0.5 + Math.sin(t * 3) * 0.3); }));
  },
  back_quiver(back) {
    // an archer's quiver, full of fletched arrows
    part(back, cyl(0.1, 0.085, 0.5, 14), toon('#8b5a2b'), { p: [0.08, 0, -0.16], r: [0, 0, -0.35] });
    for (const y of [0.2, -0.2]) part(back, torus(0.1, 0.015, TAU, 6, 16), toon('#ffc53d'), { p: [0.08 + y * 0.35, y, -0.16], r: [Math.PI / 2, 0.35, 0], outline: null });
    for (let i = 0; i < 5; i++) {
      const x = 0.08 + 0.13 + (i % 3 - 1) * 0.035, z = -0.16 + (i < 3 ? 0.02 : -0.03);
      part(back, cyl(0.01, 0.01, 0.3, 5), toon('#c9955a'), { p: [x - 0.04, 0.38, z], r: [0, 0, -0.35], outline: null });
      part(back, box(0.07, 0.09, 0.005), toon(['#e0463c', '#f4f0ff', '#37c871'][i % 3]), { p: [x - 0.08, 0.53, z], r: [0, 0, -0.35], outline: null });
    }
    part(back, box(0.04, 0.6, 0.02), toon('#5a3a1e'), { p: [0, 0.05, 0.02], r: [0, 0, 0.8], outline: null });
  },
  back_sword(back, anim) {
    // a greatsword slung across the back, with a glowing rune on the blade
    const g = new THREE.Group();
    g.position.set(0, 0.05, -0.17);
    g.rotation.z = 0.6;
    back.add(g);
    part(g, box(0.1, 0.9, 0.025), shiny('#d8dde8', { metalness: 0.8, roughness: 0.25 }), { p: [0, -0.15, 0], outline: OUT_THIN });
    part(g, cone(0.05, 0.12, 4), shiny('#d8dde8', { metalness: 0.8, roughness: 0.25 }), { p: [0, -0.66, 0], r: [Math.PI, Math.PI / 4, 0], s: [1, 1, 0.3], outline: null });
    part(g, box(0.32, 0.05, 0.06), shiny('#ffc53d', { metalness: 0.7 }), { p: [0, 0.31, 0], outline: OUT_THIN });
    part(g, cyl(0.03, 0.03, 0.22, 8), toon('#5a2a1a'), { p: [0, 0.45, 0] });
    part(g, sphere(0.045, 10, 8), shiny('#b77bff'), { p: [0, 0.58, 0], outline: null });
    const rune = part(g, box(0.03, 0.4, 0.03), basic('#8f6bff'), { p: [0, -0.1, 0], outline: null, shadow: false });
    anim.push((t) => { rune.material.color.setHSL(0.72, 0.9, 0.55 + Math.sin(t * 3) * 0.12); });
  },
  back_anglerpack(back, anim, state, L) {
    // a fishing pack: basket, rod poking up, and today's catch dangling off the side
    const c = backCol(L, '#6b8e23');
    part(back, box(0.42, 0.44, 0.22), toon(c), { p: [0, -0.04, -0.1] });
    part(back, box(0.44, 0.08, 0.24), toon(tint(c, 0.75)), { p: [0, 0.2, -0.1] });
    part(back, cyl(0.012, 0.018, 1.2, 6), toon('#8b5a2b'), { p: [-0.15, 0.45, -0.2], r: [0.1, 0, 0.25], outline: null });
    part(back, cyl(0.04, 0.04, 0.05, 10), shiny('#c0c6d4'), { p: [-0.12, 0.05, -0.23], r: [0, 0, Math.PI / 2], outline: null });
    const fish = new THREE.Group();
    fish.position.set(0.24, -0.05, -0.08);
    back.add(fish);
    part(fish, sphere(0.07, 12, 8), toon('#6fa8dc'), { p: [0, -0.1, 0], s: [0.6, 1.6, 0.5], outline: OUT_THIN });
    part(fish, cone(0.05, 0.08, 4), toon('#6fa8dc'), { p: [0, -0.24, 0], r: [Math.PI, 0, 0], s: [1, 1, 0.3], outline: null });
    anim.push((t, dt, moving) => { fish.rotation.z = Math.sin(t * (moving ? 10 : 2)) * (moving ? 0.35 : 0.1); });
  },
  back_flag(back, anim) {
    // a checkered racing flag on a pole, flapping as you run
    part(back, cyl(0.015, 0.015, 1.5, 6), shiny('#c0c6d4'), { p: [0.3, 0.55, -0.2], outline: null });
    const tex = geo('checkerTex', () => canvasTexture(64, 64, (c) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) { c.fillStyle = (x + y) % 2 ? '#1d1b2e' : '#ffffff'; c.fillRect(x * 11, y * 16, 11, 16); } }));
    const g = new THREE.PlaneGeometry(0.5, 0.34, 8, 1);
    g.translate(0.25, 0, 0);
    const base = Float32Array.from(g.attributes.position.array);
    const flag = new THREE.Mesh(g, new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide }));
    flag.position.set(0.31, 1.12, -0.2);
    flag.rotation.y = Math.PI / 2 + 0.6;
    back.add(flag);
    anim.push((t, dt, moving) => {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x0 = base[i * 3]; pos.setZ(i, Math.sin(t * (moving ? 14 : 5) - x0 * 9) * 0.05 * (x0 / 0.5)); }
      pos.needsUpdate = true;
    });
  },
  back_shield(back, anim, state, L) {
    // a round arena shield with a gold rim and boss
    const c = backCol(L, '#b3261e');
    part(back, cyl(0.3, 0.3, 0.05, 28), toon(c), { p: [0, 0, -0.17], r: [Math.PI / 2, 0, 0] });
    part(back, torus(0.3, 0.025, TAU, 6, 32), shiny('#ffc53d', { metalness: 0.7 }), { p: [0, 0, -0.2], outline: null });
    part(back, sphere(0.07, 12, 10), shiny('#ffc53d', { metalness: 0.7 }), { p: [0, 0, -0.21], s: [1, 1, 0.6], outline: null });
    for (const r of [0.8, -0.8]) part(back, box(0.04, 0.5, 0.01), shiny('#e8e0d0', { metalness: 0.5 }), { p: [0, 0, -0.2], r: [0, 0, r], outline: null });
  },
  back_guitar(back, anim, state, L) {
    // an electric guitar slung across the back: a glossy double-cutaway body with a sunburst edge, white
    // pickguard, chrome pickups and bridge, a long fretted neck and a headstock with tuning pegs
    const c = backCol(L, '#e0463c');
    const g = new THREE.Group();
    g.position.set(0.02, -0.02, -0.19);
    g.rotation.z = -0.75;
    g.scale.setScalar(1.25);
    back.add(g);
    const bodyGeo = geo('guitarBody', () => {
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.27);
      sh.bezierCurveTo(0.2, -0.27, 0.22, -0.08, 0.15, -0.02);
      sh.bezierCurveTo(0.12, 0.02, 0.17, 0.08, 0.15, 0.15); // the treble horn
      sh.bezierCurveTo(0.13, 0.2, 0.07, 0.17, 0.05, 0.1);
      sh.lineTo(-0.05, 0.1);
      sh.bezierCurveTo(-0.08, 0.2, -0.17, 0.19, -0.16, 0.1); // the bass horn
      sh.bezierCurveTo(-0.15, 0.04, -0.12, 0.0, -0.16, -0.05);
      sh.bezierCurveTo(-0.22, -0.12, -0.2, -0.27, 0, -0.27);
      const geom = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3, curveSegments: 16 });
      geom.translate(0, 0, -0.025);
      return geom;
    });
    part(g, bodyGeo, shiny(c, { roughness: 0.18, metalness: 0.1 }), { outline: OUT_THIN });
    // a darker burst showing round the edge, and the white pickguard
    part(g, bodyGeo, shiny(tint(c, 0.45), { roughness: 0.2, metalness: 0.1 }), { p: [0, 0, 0.006], s: [1.05, 1.05, 1], outline: null });
    const guard = geo('guitarGuard', () => {
      const sh = new THREE.Shape();
      sh.moveTo(-0.06, 0.09); sh.lineTo(0.04, 0.09); sh.bezierCurveTo(0.1, -0.02, 0.14, -0.1, 0.06, -0.17); sh.bezierCurveTo(0.0, -0.2, -0.1, -0.16, -0.12, -0.06); sh.lineTo(-0.06, 0.09);
      return new THREE.ShapeGeometry(sh, 10);
    });
    part(g, guard, toon('#f6f2ea'), { p: [0, 0, -0.04], r: [0, Math.PI, 0], outline: null });
    const chrome = shiny('#e8ecf5', { metalness: 0.9, roughness: 0.2 });
    for (const y of [0.04, -0.04, -0.12]) part(g, box(0.075, 0.022, 0.012), toon('#1d1b2e'), { p: [0, y, -0.045], outline: null });
    part(g, box(0.09, 0.03, 0.016), chrome, { p: [0, -0.19, -0.045], outline: null }); // bridge
    for (let k = 0; k < 3; k++) part(g, cyl(0.014, 0.014, 0.014, 10), chrome, { p: [0.09 - k * 0.015, -0.12 - k * 0.04, -0.045], r: [Math.PI / 2, 0, 0], outline: null }); // knobs
    // the neck with frets and dots, out to the headstock
    part(g, box(0.05, 0.5, 0.025), toon('#7a4a26'), { p: [0, 0.34, -0.012], outline: OUT_THIN });
    part(g, box(0.046, 0.5, 0.006), toon('#3a2414'), { p: [0, 0.34, -0.027], outline: null });
    for (let k = 0; k < 9; k++) part(g, box(0.048, 0.004, 0.008), chrome, { p: [0, 0.13 + k * 0.05, -0.03], outline: null });
    for (const y of [0.23, 0.33, 0.43]) part(g, circle(0.006), basic('#f6f2ea'), { p: [0, y + 0.025, -0.0315], r: [0, Math.PI, 0], outline: null, shadow: false });
    const headstock = part(g, box(0.08, 0.14, 0.022), shiny(tint(c, 0.8), { roughness: 0.25 }), { p: [0.012, 0.66, -0.012], r: [0, 0, -0.12], outline: OUT_THIN });
    for (let k = 0; k < 6; k++) part(headstock, cyl(0.008, 0.008, 0.03, 6), chrome, { p: [0.05, -0.05 + k * 0.022, 0], r: [0, 0, Math.PI / 2], outline: null });
    // strings
    for (let k = 0; k < 4; k++) part(g, box(0.0025, 0.86, 0.0025), basic('#dfe4ee'), { p: [-0.015 + k * 0.01, 0.2, -0.036], outline: null, shadow: false });
    // a woven strap across the chest
    part(back, box(0.05, 0.72, 0.015), toon('#1d1b2e'), { p: [0, 0.05, 0.035], r: [0, 0, -0.85], outline: null });
    part(back, box(0.016, 0.72, 0.017), toon(tint(c, 1.3)), { p: [0, 0.05, 0.036], r: [0, 0, -0.85], outline: null });
  },
  back_butterfly(back, anim, state, L) {
    // big stained-glass butterfly wings out from the shoulder blades, flapping behind you
    const c = backCol(L, '#b77bff');
    const wingTex = geo(`bflyTex${c}`, () => canvasTexture(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(10, 64, 4, 10, 64, 130);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, c); g.addColorStop(0.85, tint(c, 0.6)); g.addColorStop(1, '#1d1b2e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = 'rgba(29,27,46,.75)'; ctx.lineWidth = 3;
      for (const a of [-0.9, -0.4, 0.1, 0.6, 1.0]) { ctx.beginPath(); ctx.moveTo(4, 64); ctx.lineTo(4 + Math.cos(a) * 140, 64 + Math.sin(a) * 140); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (const [x, y, r] of [[96, 34, 8], [104, 92, 6], [80, 108, 5], [88, 20, 4]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    }));
    const mat = new THREE.MeshToonMaterial({ map: wingTex, transparent: true, opacity: 0.92, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.2, depthWrite: false });
    const shape = (upper) => geo(`bflyWing${upper}`, () => {
      const sh = new THREE.Shape();
      if (upper) { sh.moveTo(0, 0); sh.bezierCurveTo(0.12, 0.36, 0.48, 0.5, 0.56, 0.3); sh.bezierCurveTo(0.6, 0.12, 0.38, 0.0, 0, 0); }
      else { sh.moveTo(0, 0); sh.bezierCurveTo(0.34, -0.04, 0.46, -0.24, 0.32, -0.38); sh.bezierCurveTo(0.2, -0.46, 0.04, -0.3, 0, 0); }
      const geom = new THREE.ShapeGeometry(sh, 16);
      const uv = geom.attributes.uv, p = geom.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.6, 0.5 + p.getY(i) / 1.0);
      return geom;
    });
    const ws = [-1, 1].map((sx) => {
      const w = new THREE.Group();
      w.position.set(sx * 0.05, 0.1, -0.12);
      back.add(w);
      for (const upper of [true, false]) {
        const m = part(w, shape(upper), mat, { s: [sx, 1, 1], outline: null, shadow: false });
        m.renderOrder = 2;
      }
      return w;
    });
    // the body of the butterfly, between the wings
    part(back, capsule(0.03, 0.22), toon('#2b2340'), { p: [0, 0.08, -0.12], outline: OUT_THIN });
    // flapping: each wing swings backwards from the spine (never forwards into you)
    anim.push((t, dt, moving) => ws.forEach((w, i) => { w.rotation.y = (i ? 1 : -1) * (0.25 + Math.abs(Math.sin(t * (moving ? 11 : 2.6))) * 0.75); }));
  },
  back_mech(back, anim) {
    // a chunky mech booster pack with glowing thrust rings
    const metal = shiny('#4a4f66', { metalness: 0.6, roughness: 0.35 });
    part(back, box(0.46, 0.46, 0.2), metal, { p: [0, 0.02, -0.14] });
    part(back, box(0.3, 0.12, 0.04), basic('#39e6ff'), { p: [0, 0.12, -0.25], outline: null, shadow: false });
    const rings = [];
    for (const sx of [-1, 1]) {
      part(back, cyl(0.09, 0.11, 0.3, 14), metal, { p: [sx * 0.2, -0.24, -0.2] });
      const ring = part(back, torus(0.08, 0.02, TAU, 6, 18), basic('#39e6ff'), { p: [sx * 0.2, -0.41, -0.2], r: [Math.PI / 2, 0, 0], outline: null, shadow: false });
      const beam = part(back, cone(0.07, 0.35, 12), basic('#8ff4ff', { transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), { p: [sx * 0.2, -0.6, -0.2], r: [Math.PI, 0, 0], outline: null, shadow: false });
      rings.push([ring, beam]);
    }
    anim.push((t, dt, moving) => rings.forEach(([ring, beam], i) => {
      ring.scale.setScalar(1 + Math.sin(t * 10 + i) * 0.1);
      beam.scale.y = (moving ? 1.4 : 0.5) + Math.sin(t * 25 + i) * 0.15;
    }));
  },
};

// ---------------------------------------------------------------------------
// things to hold (in the hand's frame once the forearm is held out: +y is up out of the fist, +z is
// forward, and the grip is at the origin)
// ---------------------------------------------------------------------------

const handCol = (L, def) => L.handColor || def;
/** Sprites that each fade on their own (each gets its own material). */
const ownSprites = (g, tex, color, opacity, n, scale) => Array.from({ length: n }, () => {
  const sp = new THREE.Sprite(additive(tex, color, opacity));
  sp.scale.setScalar(scale);
  g.add(sp);
  return sp;
});
const textCache = new Map();
/** A little sign texture with big bold text. */
function signText(text, bg, fg, { w = 128, h = 128, size = 44, round = 0 } = {}) {
  const key = `${text}${bg}${fg}${w}${h}${size}${round}`;
  if (!textCache.has(key)) textCache.set(key, canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    if (round) { ctx.beginPath(); ctx.roundRect(0, 0, w, h, round); ctx.fill(); } else ctx.fillRect(0, 0, w, h);
    ctx.font = `900 ${size}px Rubik, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = fg;
    ctx.fillText(text, w / 2, h / 2 + 2);
  }));
  return textCache.get(key);
}

const HANDS = {
  hand_lightsaber(g, L, anim) {
    const col = handCol(L, '#39e6ff');
    const metal = shiny('#c8ced8', { metalness: 0.85, roughness: 0.25 }), black = toon('#1d1b2e');
    part(g, cyl(0.028, 0.028, 0.24, 14), metal, { p: [0, 0.02, 0], outline: OUT_THIN });
    for (let k = 0; k < 4; k++) part(g, cyl(0.031, 0.031, 0.022, 14), black, { p: [0, -0.07 + k * 0.04, 0], outline: null });
    part(g, cyl(0.035, 0.03, 0.05, 14), metal, { p: [0, 0.16, 0], outline: OUT_THIN }); // the emitter
    part(g, box(0.012, 0.03, 0.012), basic('#ff3b4f'), { p: [0.03, 0.06, 0], outline: null, shadow: false }); // the switch
    // the blade: a white-hot core in a glow of colour
    const blade = new THREE.Group();
    blade.position.y = 0.19;
    g.add(blade);
    part(blade, cyl(0.016, 0.02, 1.0, 10), basic('#ffffff'), { p: [0, 0.5, 0], outline: null, shadow: false });
    const glow = part(blade, cyl(0.036, 0.04, 1.04, 12), basic(col, { transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), { p: [0, 0.5, 0], outline: null, shadow: false });
    for (let k = 0; k < 4; k++) {
      const sp = new THREE.Sprite(additive(glowTexture, new THREE.Color(col).getHex(), 0.35));
      sp.scale.set(0.24, 0.34, 1);
      sp.position.y = 0.12 + k * 0.26;
      blade.add(sp);
    }
    anim.push((t) => { glow.scale.x = glow.scale.z = 1 + Math.sin(t * 40) * 0.06 + Math.sin(t * 17) * 0.04; });
  },
  hand_sword(g) {
    const steel = shiny('#dfe4ee', { metalness: 0.85, roughness: 0.22 }), gold = shiny('#ffc53d', { metalness: 0.7, roughness: 0.3 });
    part(g, cyl(0.024, 0.026, 0.18, 10), toon('#5a2a1a'), { p: [0, 0, 0], outline: OUT_THIN });
    part(g, sphere(0.04, 12, 10), gold, { p: [0, -0.11, 0], outline: OUT_THIN }); // pommel
    part(g, box(0.26, 0.04, 0.05), gold, { p: [0, 0.1, 0], outline: OUT_THIN }); // crossguard
    for (const s of [-1, 1]) part(g, sphere(0.03, 10, 8), gold, { p: [s * 0.13, 0.1, 0], outline: null });
    part(g, box(0.07, 0.72, 0.016), steel, { p: [0, 0.48, 0], outline: OUT_THIN });
    part(g, box(0.014, 0.64, 0.02), shiny('#b8c0d0', { metalness: 0.9 }), { p: [0, 0.46, 0], outline: null }); // the fuller
    part(g, cone(0.035, 0.1, 4), steel, { p: [0, 0.89, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.23], outline: null });
  },
  hand_wand(g, L, anim) {
    const col = handCol(L, '#ffd84d');
    part(g, cyl(0.012, 0.02, 0.4, 8), toon('#3a2414'), { p: [0, 0.14, 0], outline: OUT_THIN });
    part(g, cyl(0.022, 0.022, 0.08, 8), toon('#c9955a'), { p: [0, -0.02, 0], outline: null });
    const star = part(g, geo('wandStar', () => new THREE.ExtrudeGeometry(starShape(0.08), { depth: 0.025, bevelEnabled: false }).translate(0, 0, -0.0125)), shiny(col, { emissive: col, emissiveIntensity: 0.35 }), { p: [0, 0.4, 0], outline: OUT_THIN });
    const sp = new THREE.Sprite(additive(glowTexture, new THREE.Color(col).getHex(), 0.7));
    sp.scale.setScalar(0.32);
    star.add(sp);
    const sparks = sprites(g, additive(starTexture, 0xffffff, 0.9), 4, 0.06);
    anim.push((t) => {
      star.rotation.y = t * 2.5;
      sparks.forEach((s, i) => { const a = t * 2 + i * 1.6; s.position.set(Math.cos(a) * 0.12, 0.4 + Math.sin(a * 1.3) * 0.1, Math.sin(a) * 0.12); });
    });
  },
  hand_hairdryer(g, L, anim) {
    const col = handCol(L, '#ff8fc7'), m = shiny(col, { roughness: 0.3, metalness: 0.1 });
    part(g, capsule(0.04, 0.14), m, { p: [0, 0.02, -0.02], outline: OUT_THIN }); // handle
    part(g, cyl(0.07, 0.065, 0.24, 18), m, { p: [0, 0.14, 0.06], r: [Math.PI / 2, 0, 0], outline: OUT_THIN }); // barrel
    part(g, cyl(0.05, 0.065, 0.06, 18), toon('#2b2f4a'), { p: [0, 0.14, 0.2], r: [Math.PI / 2, 0, 0], outline: OUT_THIN }); // nozzle
    part(g, cyl(0.06, 0.06, 0.02, 18), toon('#2b2f4a'), { p: [0, 0.14, -0.065], r: [Math.PI / 2, 0, 0], outline: null }); // back vent
    part(g, box(0.02, 0.03, 0.03), toon('#ffffff'), { p: [0, 0.06, 0.02], outline: null }); // the switch
    part(g, cyl(0.008, 0.008, 0.3, 5), toon('#2b2f4a'), { p: [0, -0.2, -0.02], outline: null }); // the cord
    const puff = ownSprites(g, puffTexture, 0xffffff, 0.35, 3, 0.08);
    anim.push((t) => puff.forEach((s, i) => { const k = (t * 2 + i / 3) % 1; s.position.set(0, 0.14, 0.24 + k * 0.3); s.scale.setScalar(0.06 + k * 0.12); s.material.opacity = 0.35 * (1 - k); }));
  },
  hand_stopsign(g) {
    part(g, cyl(0.016, 0.016, 1.0, 8), shiny('#b8c0d0', { metalness: 0.7 }), { p: [0, 0.38, 0], outline: OUT_THIN });
    const sign = new THREE.Group();
    sign.position.set(0, 0.95, 0.02);
    g.add(sign);
    part(sign, geo('stopOct', () => new THREE.CylinderGeometry(0.21, 0.21, 0.02, 8)), toon('#f4f4f4'), { r: [Math.PI / 2, Math.PI / 8, 0], outline: OUT_THIN });
    const face = new THREE.MeshBasicMaterial({ map: signText('STOP', '#d62828', '#ffffff', { size: 40 }) });
    part(sign, geo('stopFace', () => new THREE.CircleGeometry(0.19, 8).rotateZ(Math.PI / 8)), face, { p: [0, 0, 0.012], outline: null, shadow: false });
    part(sign, geo('stopFace', () => new THREE.CircleGeometry(0.19, 8).rotateZ(Math.PI / 8)), toon('#b8c0d0'), { p: [0, 0, -0.012], r: [0, Math.PI, 0], outline: null });
  },
  hand_balloon(g, L, anim) {
    const col = handCol(L, '#ff5d73');
    const string = part(g, cyl(0.004, 0.004, 0.75, 4), basic('#f4f0ff'), { p: [0, 0.37, 0], outline: null, shadow: false });
    const b = new THREE.Group();
    b.position.y = 0.78;
    g.add(b);
    part(b, sphere(0.16, 20, 16), shiny(col, { roughness: 0.15, metalness: 0.05 }), { p: [0, 0.16, 0], s: [1, 1.18, 1], outline: OUT_THIN });
    part(b, cone(0.03, 0.04, 8), shiny(col, { roughness: 0.15, metalness: 0.05 }), { p: [0, -0.02, 0], outline: null });
    part(b, sphere(0.04, 8, 6), basic('#ffffff', { transparent: true, opacity: 0.55 }), { p: [-0.06, 0.24, 0.12], s: [0.6, 1, 0.4], outline: null, shadow: false });
    anim.push((t) => { b.rotation.z = Math.sin(t * 1.6) * 0.12; b.rotation.x = Math.sin(t * 1.3) * 0.08; string.rotation.z = b.rotation.z * 0.5; });
  },
  hand_umbrella(g, L) {
    const col = handCol(L, '#39c6ff');
    part(g, cyl(0.013, 0.013, 1.2, 8), toon('#2b2f4a'), { p: [0, 0.5, 0], outline: OUT_THIN });
    part(g, torus(0.05, 0.014, Math.PI, 6, 12), toon('#6b4226'), { p: [0.05, -0.1, 0], r: [0, 0, Math.PI], outline: null }); // the J handle
    // the canopy: eight panels in two shades, with points round the edge
    const canopy = geo('umbrellaCanopy', () => new THREE.ConeGeometry(0.6, 0.26, 8, 1, true));
    part(g, canopy, toon(col, { side: THREE.DoubleSide }), { p: [0, 1.0, 0], outline: OUT_THIN });
    part(g, geo('umbrellaStripe', () => new THREE.ConeGeometry(0.602, 0.262, 8, 1, true, 0, Math.PI / 4)), toon('#ffffff', { side: THREE.DoubleSide }), { p: [0, 1.0, 0], outline: null });
    part(g, geo('umbrellaStripe', () => new THREE.ConeGeometry(0.602, 0.262, 8, 1, true, 0, Math.PI / 4)), toon('#ffffff', { side: THREE.DoubleSide }), { p: [0, 1.0, 0], r: [0, Math.PI, 0], outline: null });
    part(g, sphere(0.025, 8, 6), toon('#2b2f4a'), { p: [0, 1.14, 0], outline: null });
  },
  hand_icecream(g, L) {
    const col = handCol(L, '#ff9fc8');
    const waffle = geo('waffleTex', () => canvasTexture(64, 64, (c) => {
      c.fillStyle = '#d9a25a'; c.fillRect(0, 0, 64, 64); c.strokeStyle = '#a8743f'; c.lineWidth = 3;
      for (let i = -64; i < 128; i += 12) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 64, 64); c.stroke(); c.beginPath(); c.moveTo(i, 64); c.lineTo(i + 64, 0); c.stroke(); }
    }));
    part(g, cone(0.065, 0.2, 14), new THREE.MeshToonMaterial({ map: waffle }), { p: [0, 0.04, 0], r: [Math.PI, 0, 0], outline: OUT_THIN });
    part(g, sphere(0.075, 14, 12), toon('#fff4e0'), { p: [0, 0.17, 0], outline: OUT_THIN });
    part(g, sphere(0.07, 14, 12), toon(col), { p: [0, 0.27, 0], outline: OUT_THIN });
    part(g, sphere(0.022, 8, 6), shiny('#e0263c'), { p: [0, 0.35, 0], outline: null });
    for (let k = 0; k < 6; k++) part(g, box(0.012, 0.004, 0.004), toon(['#ff5d73', '#ffd84d', '#6ee7a0', '#39c6ff'][k % 4]), { p: [Math.cos(k) * 0.05, 0.3, Math.sin(k) * 0.05], r: [0, k, 0.6], outline: null, shadow: false });
  },
  hand_bouquet(g, L) {
    const col = handCol(L, '#ff8fc7');
    part(g, cone(0.11, 0.3, 12), toon(col, { side: THREE.DoubleSide }), { p: [0, 0.06, 0], r: [Math.PI, 0, 0], outline: OUT_THIN }); // wrapping paper
    part(g, torus(0.05, 0.012, TAU, 6, 14), toon('#ffffff'), { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0], outline: null }); // ribbon
    const cols = ['#ff5d73', '#ffffff', '#ffd84d', '#ff9fe0', '#e84393'];
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4, r = k ? 0.06 : 0;
      const f = new THREE.Group();
      f.position.set(Math.cos(a) * r, 0.24 + (k ? 0 : 0.03), Math.sin(a) * r);
      f.rotation.set(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4);
      g.add(f);
      flower(f, `bq${k % 5}`, f, cols[k % 5], 0.04);
    }
    for (let k = 0; k < 5; k++) part(g, sphere(0.04, 8, 6), toon('#4caf50'), { p: [Math.cos(k * 1.3) * 0.09, 0.2, Math.sin(k * 1.3) * 0.09], s: [0.5, 1.2, 0.3], r: [0, k * 1.3, 0.5], outline: null });
  },
  hand_boba(g, L) {
    const col = handCol(L, '#e8c9a0');
    part(g, cyl(0.065, 0.055, 0.2, 16), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 0.1 }), { p: [0, 0.08, 0], outline: OUT_THIN });
    part(g, cyl(0.06, 0.051, 0.17, 16), toon(col), { p: [0, 0.065, 0], outline: null });
    for (let k = 0; k < 8; k++) part(g, sphere(0.014, 6, 5), toon('#2a1a12'), { p: [Math.cos(k * 2.3) * 0.03, -0.005 + (k % 2) * 0.02, Math.sin(k * 2.3) * 0.03], outline: null, shadow: false });
    part(g, sphere(0.066, 16, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.4 }), { p: [0, 0.18, 0], s: [1, 0.35, 1], outline: null });
    part(g, cyl(0.012, 0.012, 0.3, 8), toon('#ff5d73'), { p: [0.015, 0.25, 0], r: [0, 0, -0.15], outline: null });
  },
  hand_coffee(g, L) {
    const col = handCol(L, '#f6f2ea');
    part(g, cyl(0.06, 0.048, 0.18, 16), toon(col), { p: [0, 0.07, 0], outline: OUT_THIN });
    part(g, cyl(0.058, 0.053, 0.07, 16), toon('#a8743f'), { p: [0, 0.07, 0], outline: null }); // the sleeve
    part(g, cyl(0.064, 0.064, 0.025, 16), toon('#2b2f4a'), { p: [0, 0.17, 0], outline: OUT_THIN }); // lid
    part(g, cyl(0.03, 0.04, 0.02, 12), toon('#2b2f4a'), { p: [0, 0.19, 0], outline: null });
    const steam = sprites(g, additive(puffTexture, 0xffffff, 0.25), 2, 0.07);
    steam.forEach((s, i) => s.position.set(0, 0.26 + i * 0.07, 0));
  },
  hand_phone(g, L) {
    const col = handCol(L, '#2b2f4a');
    part(g, box(0.1, 0.19, 0.016), shiny(col, { roughness: 0.25, metalness: 0.2 }), { p: [0, 0.07, 0], outline: OUT_THIN });
    const screen = canvasTexture(64, 128, (c) => {
      const gr = c.createLinearGradient(0, 0, 64, 128); gr.addColorStop(0, '#7c6bff'); gr.addColorStop(1, '#ff6fb5');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 128);
      c.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.beginPath(); c.roundRect(6 + i * 14, 20 + j * 16, 10, 10, 3); c.fill(); }
    });
    part(g, geo('phoneScreen', () => new THREE.PlaneGeometry(0.088, 0.17)), new THREE.MeshBasicMaterial({ map: screen }), { p: [0, 0.07, -0.009], r: [0, Math.PI, 0], outline: null, shadow: false });
  },
  hand_torch(g, L, anim) {
    part(g, cyl(0.022, 0.03, 0.42, 8), toon('#6b4226'), { p: [0, 0.12, 0], outline: OUT_THIN });
    part(g, cyl(0.04, 0.034, 0.08, 10), toon('#c9b27a'), { p: [0, 0.32, 0], outline: OUT_THIN }); // the wrapped head
    const flame = ownSprites(g, flameTexture, 0xffa53a, 0.95, 3, 0.2);
    const core = new THREE.Sprite(additive(glowTexture, 0xffd27a, 0.7));
    core.scale.setScalar(0.35);
    core.position.y = 0.42;
    g.add(core);
    anim.push((t) => flame.forEach((s, i) => { const k = (t * 2.2 + i / 3) % 1; s.position.set(Math.sin(t * 9 + i) * 0.015, 0.4 + k * 0.14, 0); s.scale.set(0.16 * (1 - k * 0.6), 0.24 * (1 - k * 0.4), 1); s.material.opacity = 0.95 * (1 - k); }));
  },
  hand_lollipop(g, L) {
    const col = handCol(L, '#ff5d73');
    part(g, cyl(0.01, 0.01, 0.4, 6), toon('#ffffff'), { p: [0, 0.14, 0], outline: OUT_THIN });
    const swirl = geo(`swirl${col}`, () => canvasTexture(128, 128, (c) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, 128, 128);
      c.strokeStyle = col; c.lineWidth = 12; c.beginPath();
      for (let a = 0; a < TAU * 4; a += 0.1) { const r = a * 2.2; c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
      c.stroke();
    }));
    part(g, cyl(0.13, 0.13, 0.04, 28), new THREE.MeshToonMaterial({ map: swirl }), { p: [0, 0.44, 0], r: [Math.PI / 2, 0, 0], outline: OUT_THIN });
  },
  hand_foamfinger(g, L) {
    const col = handCol(L, '#ffd84d');
    const m = toon(col);
    part(g, box(0.16, 0.18, 0.08), m, { p: [0, 0.1, 0.02], outline: OUT_THIN }); // the fist
    part(g, capsule(0.035, 0.16), m, { p: [-0.04, 0.3, 0.03], outline: OUT_THIN }); // the pointing finger
    part(g, capsule(0.03, 0.06), m, { p: [0.09, 0.12, 0.05], r: [0, 0, -0.9], outline: OUT_THIN }); // thumb
    const num = new THREE.MeshBasicMaterial({ map: signText('#1', col, '#1d1b2e', { size: 64 }) });
    part(g, geo('foamNum', () => new THREE.PlaneGeometry(0.15, 0.15)), num, { p: [0, 0.1, 0.062], outline: null, shadow: false });
  },
  hand_mic(g, L) {
    part(g, cyl(0.022, 0.016, 0.2, 10), toon(handCol(L, '#1d1b2e')), { p: [0, 0.02, 0], outline: OUT_THIN });
    part(g, cyl(0.03, 0.024, 0.03, 12), shiny('#c0c6d4', { metalness: 0.8 }), { p: [0, 0.13, 0], outline: null });
    part(g, sphere(0.05, 14, 12), new THREE.MeshToonMaterial({ map: dotsMaterial('#9aa2b4').map, color: '#c8ced8' }), { p: [0, 0.18, 0], outline: OUT_THIN });
  },
  hand_pan(g) {
    part(g, cyl(0.02, 0.022, 0.24, 8), toon('#2b2f4a'), { p: [0, 0.02, 0], outline: OUT_THIN }); // the handle
    const pan = new THREE.Group();
    pan.position.set(0, 0.26, 0.0);
    pan.rotation.x = -Math.PI / 2 + 0.25; // (held out flat, tipped a little towards you)
    g.add(pan);
    part(pan, cyl(0.17, 0.15, 0.05, 24), shiny('#2b2f3a', { metalness: 0.5, roughness: 0.35 }), { p: [0, 0.19, 0], outline: OUT_THIN });
    part(pan, cyl(0.1, 0.1, 0.01, 18), toon('#fbfbf6'), { p: [0, 0.22, 0.03], outline: null }); // an egg
    part(pan, sphere(0.04, 12, 8), toon('#ffc53d'), { p: [0.01, 0.225, 0.04], s: [1, 0.5, 1], outline: null });
  },
  hand_baguette(g) {
    const bread = toon('#d9a25a');
    const b = part(g, capsule(0.045, 0.62), bread, { p: [0, 0.22, 0.03], r: [0.2, 0, 0], outline: OUT_THIN });
    for (let k = 0; k < 4; k++) part(b, box(0.05, 0.012, 0.03), toon('#f1d9a8'), { p: [0, -0.2 + k * 0.13, 0.038], r: [0, 0, 0.5], outline: null, shadow: false });
  },
  hand_sparkler(g, L, anim) {
    part(g, cyl(0.006, 0.006, 0.5, 4), toon('#8d96a8'), { p: [0, 0.2, 0], outline: null });
    part(g, cyl(0.012, 0.012, 0.18, 6), toon('#4a4f66'), { p: [0, 0.36, 0], outline: null });
    const sparks = ownSprites(g, starTexture, 0xffe9a8, 1, 8, 0.08);
    const core = new THREE.Sprite(additive(glowTexture, 0xfff2b0, 0.9));
    core.scale.setScalar(0.22);
    core.position.y = 0.45;
    g.add(core);
    anim.push((t) => sparks.forEach((s, i) => {
      const k = (t * 3 + i / 8) % 1, a = i * 2.39 + Math.floor(t * 3 + i / 8) * 1.7;
      s.position.set(Math.cos(a) * k * 0.2, 0.45 + Math.sin(a * 1.3) * k * 0.16, Math.sin(a) * k * 0.2);
      s.material.opacity = 1 - k;
    }));
  },
  hand_teddy(g, L) {
    const col = handCol(L, '#b5784a'), m = toon(col), light = toon(tint(col, 1.35));
    const bear = new THREE.Group();
    bear.position.set(0, 0.02, 0.06);
    bear.rotation.x = -0.25;
    g.add(bear);
    part(bear, sphere(0.09, 14, 12), m, { p: [0, 0.12, 0], s: [1, 1.1, 0.9], outline: OUT_THIN });
    part(bear, sphere(0.04, 10, 8), light, { p: [0, 0.11, 0.07], s: [1, 1.1, 0.5], outline: null }); // tummy
    part(bear, sphere(0.075, 14, 12), m, { p: [0, 0.26, 0], outline: OUT_THIN });
    part(bear, sphere(0.03, 10, 8), light, { p: [0, 0.245, 0.065], s: [1.1, 0.8, 0.7], outline: null }); // snout
    part(bear, sphere(0.012, 6, 5), basic('#1d1b2e'), { p: [0, 0.255, 0.087], outline: null, shadow: false });
    for (const s of [-1, 1]) {
      part(bear, sphere(0.028, 8, 6), m, { p: [s * 0.055, 0.32, -0.005], outline: OUT_THIN }); // ears
      part(bear, sphere(0.01, 6, 5), basic('#1d1b2e'), { p: [s * 0.028, 0.28, 0.066], outline: null, shadow: false }); // eyes
      part(bear, sphere(0.035, 8, 6), m, { p: [s * 0.04, 0.03, 0.02], s: [1, 1.2, 1], outline: OUT_THIN }); // feet
      part(bear, sphere(0.03, 8, 6), m, { p: [s * 0.09, 0.15, 0.02], s: [1, 1.4, 1], outline: OUT_THIN }); // arms
    }
    part(bear, sphere(0.025, 8, 6), toon('#ff5d73'), { p: [0, 0.2, 0.06], s: [1.6, 0.8, 0.6], outline: null }); // a bow tie
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

/** A tall licking flame with a hot white centre (for ki and the like). */
const kiTexture = canvasTexture(64, 128, (c) => {
  const grad = c.createRadialGradient(32, 92, 2, 32, 80, 60);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grad;
  c.beginPath(); c.moveTo(32, 4); c.bezierCurveTo(52, 50, 62, 80, 50, 108); c.quadraticCurveTo(32, 128, 14, 108); c.bezierCurveTo(2, 80, 12, 50, 32, 4); c.fill();
});
/** A soft pool of light (white in the middle, fading out). */
const groundGlowTexture = canvasTexture(128, 128, (c) => {
  const grad = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grad; c.fillRect(0, 0, 128, 128);
});
/** Every aura sits on a glowing base: a pool of light at your feet, a ring rippling out, a soft column
 *  of light and motes drifting up, in the aura's colour. */
function auraBase(g, anim, color, { motes = 10, column = 0.3, ring = true } = {}) {
  const hex = new THREE.Color(color).getHex();
  const pool = part(g, geo('auraPool', () => new THREE.CircleGeometry(1, 32)), new THREE.MeshBasicMaterial({ map: groundGlowTexture, color: hex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), { p: [0, 0.02, 0], r: [-Math.PI / 2, 0, 0], outline: null, shadow: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const rip = ring ? part(g, geo('auraRing', () => new THREE.RingGeometry(0.9, 1, 48)), ringMat, { p: [0, 0.03, 0], r: [-Math.PI / 2, 0, 0], outline: null, shadow: false }) : null;
  const col = column ? new THREE.Sprite(additive(glowTexture, hex, column)) : null;
  if (col) { col.scale.set(1.3, 2.6, 1); col.position.y = 1.1; g.add(col); }
  const dots = sprites(g, additive(glowTexture, hex, 0.9), motes, 0.06);
  anim.push((t) => {
    pool.material.opacity = 0.6 + Math.sin(t * 2.2) * 0.15;
    pool.scale.setScalar(1 + Math.sin(t * 2.2) * 0.05);
    if (rip) { const w = (t * 0.45) % 1; rip.scale.setScalar(0.3 + w * 0.9); ringMat.opacity = (1 - w) * 0.55; }
    if (col) col.material.opacity = column * (0.8 + Math.sin(t * 1.7) * 0.2);
    dots.forEach((d, k) => { const p = (t * 0.3 + k / motes) % 1, a = k * 2.4 + t * 0.4; d.position.set(Math.cos(a) * (0.35 + (k % 3) * 0.15), p * 2.3, Math.sin(a) * (0.35 + (k % 3) * 0.15)); d.material.opacity = Math.sin(p * Math.PI) * 0.9; });
  });
}
const AURA_BASE = {
  aura_sparkle: '#fff3a0', aura_hearts: '#ff7ab6', aura_fire: '#ff7a30', aura_rainbow: '#b98bff', aura_shadow: '#8a3dff',
  aura_koi: '#ffd84d', aura_abyss: '#1fd8c8', aura_warlord: '#ff2a2a', aura_laurel: '#ffd84d', aura_tide: '#5fc8ff',
  aura_speed: '#ffffff', aura_storm: '#9fc8ff',
};

const AURAS = {
  aura_sparkle(g, anim) {
    const list = sprites(g, additive(starTexture, 0xfff3a0), 16, 0.2);
    anim.push((t) => list.forEach((s, i) => {
      const a = t * (i % 2 ? 0.7 : -0.5) + i * 0.8, r = i % 2 ? 0.7 : 0.5;
      s.position.set(Math.cos(a) * r, 0.2 + ((i * 0.23 + t * 0.15) % 1) * 2.0, Math.sin(a) * r);
      s.scale.setScalar(0.06 + Math.max(0, Math.sin(t * 4 + i * 1.7)) * 0.24);
      s.material.rotation = t * 2;
    }));
  },
  aura_hearts(g, anim) {
    const list = [];
    for (let i = 0; i < 9; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture, transparent: true, depthWrite: false })); g.add(sp); list.push(sp); }
    anim.push((t) => list.forEach((s, i) => {
      // hearts float up in a lazy spiral, popping (with a little bounce) as they go
      const p = (t * 0.4 + i / 9) % 1, a = i * 2.1 + p * 3;
      s.position.set(Math.cos(a) * (0.4 + p * 0.2), 0.4 + p * 2.0, Math.sin(a) * (0.4 + p * 0.2));
      s.material.opacity = Math.min(1, (1 - p) * 2.5);
      s.scale.setScalar(0.24 * (1 - p * 0.4) * (1 + Math.sin(t * 8 + i) * 0.08));
    }));
  },
  aura_fire(g, anim) {
    const glow = new THREE.Sprite(additive(glowTexture, 0xff7a30, 0.5));
    glow.scale.set(2, 2.4, 1);
    glow.position.y = 0.9;
    g.add(glow);
    const list = sprites(g, additive(flameTexture, 0xffffff, 0.9), 24, 0.35);
    const embers = sprites(g, additive(glowTexture, 0xffb03a, 1), 12, 0.06);
    anim.push((t) => {
      list.forEach((s, i) => {
        const p = (t * 1.1 + i / 24) % 1;
        const a = i * 2.4 + Math.sin(t + i) * 0.2;
        s.position.set(Math.cos(a) * 0.5 * (1 - p * 0.6), p * 1.8, Math.sin(a) * 0.5 * (1 - p * 0.6));
        s.scale.set(0.4 * (1 - p), 0.62 * (1 - p), 1);
      });
      embers.forEach((e, i) => { const p = (t * 0.7 + i / 12) % 1, a = i * 1.9 + t; e.position.set(Math.cos(a) * 0.6, p * 2.6, Math.sin(a) * 0.6 + Math.sin(t * 3 + i) * 0.1); e.material.opacity = 1 - p; });
    });
  },
  aura_rainbow(g, anim) {
    const rings = [0, 1, 2].map((i) => part(g, rainbowRing(0.85 - i * 0.12), rainbowMaterial, { p: [0, 0.95, 0], outline: null, shadow: false }));
    const prisms = [];
    for (let i = 0; i < 12; i++) { const sp = new THREE.Sprite(additive(starTexture, new THREE.Color().setHSL(i / 12, 0.9, 0.65).getHex(), 1)); g.add(sp); prisms.push(sp); }
    anim.push((t) => {
      rings[0].rotation.set(Math.PI / 2 + Math.sin(t) * 0.3, t * 1.2, 0);
      rings[1].rotation.set(Math.PI / 2 - 0.5, -t * 1.6, 0.4);
      rings[2].rotation.set(Math.PI / 2 + 0.6, t * 0.9, -0.5);
      prisms.forEach((s, i) => { const a = -t * 1.3 + (i / 12) * TAU; s.position.set(Math.cos(a) * 1.0, 0.95 + Math.sin(t * 2 + i) * 0.5, Math.sin(a) * 1.0); s.scale.setScalar(0.08 + Math.max(0, Math.sin(t * 6 + i)) * 0.12); });
    });
  },
  aura_shadow(g, anim) {
    const glow = new THREE.Sprite(additive(glowTexture, 0x7a2fd6, 0.55));
    glow.scale.set(2, 2.6, 1);
    glow.position.y = 1;
    g.add(glow);
    const list = sprites(g, additive(flameTexture, 0xa45bff, 0.85), 24, 0.35);
    const smoke = sprites(g, new THREE.SpriteMaterial({ map: puffTexture, color: 0x2a1240, transparent: true, opacity: 0.45, depthWrite: false }), 6, 0.5);
    anim.push((t) => smoke.forEach((s, i) => { const p = (t * 0.25 + i / 6) % 1, a = i * 1.1; s.position.set(Math.cos(a) * 0.6, 0.1 + p * 0.6, Math.sin(a) * 0.6); s.scale.setScalar(0.5 + p * 0.6); s.material.opacity = (1 - p) * 0.45; }));
    anim.push((t) => {
      glow.material.opacity = 0.45 + Math.sin(t * 2) * 0.12;
      list.forEach((s, i) => {
        const p = (t * 0.7 + i / 24) % 1;
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
  aura_abyss(g, anim) {
    // Abyssal Depths: a slow vortex of deep-sea glow, runes circling at your feet and bubbles rising
    const glow = new THREE.Sprite(additive(glowTexture, 0x1fd8c8, 0.4));
    glow.scale.set(2.2, 2.6, 1);
    glow.position.y = 0.9;
    g.add(glow);
    const rune = part(g, geo('abyssRunes', () => new THREE.RingGeometry(0.62, 0.78, 6, 1)), basic('#3ff0d8', { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), { p: [0, 0.03, 0], r: [-Math.PI / 2, 0, 0], outline: null, shadow: false });
    const bubbles = sprites(g, additive(glowTexture, 0x9ffcff, 0.8), 12, 0.12);
    const wisps = sprites(g, additive(flameTexture, 0x5b2aff, 0.6), 8, 0.3);
    anim.push((t) => {
      rune.rotation.z = t * 0.6;
      glow.material.opacity = 0.35 + Math.sin(t * 1.5) * 0.1;
      bubbles.forEach((s, i) => { const p = (t * 0.35 + i / 12) % 1, a = i * 2.3 + t; s.position.set(Math.cos(a) * 0.55, p * 2.1, Math.sin(a) * 0.55); s.scale.setScalar(0.06 + (1 - p) * 0.06); });
      wisps.forEach((s, i) => { const a = t * 1.2 + (i / 8) * TAU; s.position.set(Math.cos(a) * 0.7, 0.25 + Math.sin(t * 2 + i) * 0.15, Math.sin(a) * 0.7); });
    });
  },
  aura_warlord(g, anim) {
    // Warlord: blood-red embers and three blades orbiting you
    const glow = new THREE.Sprite(additive(glowTexture, 0xff2a2a, 0.35));
    glow.scale.set(2, 2.4, 1);
    glow.position.y = 0.9;
    g.add(glow);
    const blades = [0, 1, 2].map(() => {
      const b = new THREE.Group();
      part(b, box(0.04, 0.42, 0.012), shiny('#e8eaf2', { metalness: 0.8, roughness: 0.2 }), { p: [0, 0.1, 0], outline: OUT_THIN });
      part(b, box(0.14, 0.03, 0.03), shiny('#c21838'), { p: [0, -0.12, 0], outline: null });
      const trail = new THREE.Sprite(additive(glowTexture, 0xff3b3b, 0.6));
      trail.scale.set(0.3, 0.6, 1);
      b.add(trail);
      g.add(b);
      return b;
    });
    const embers = sprites(g, additive(glowTexture, 0xff5a3a, 0.9), 14, 0.08);
    anim.push((t) => {
      blades.forEach((b, i) => { const a = t * 1.8 + (i / 3) * TAU; b.position.set(Math.cos(a) * 0.85, 1.0 + Math.sin(t * 2 + i) * 0.15, Math.sin(a) * 0.85); b.rotation.set(0, -a, 0.3); });
      embers.forEach((s, i) => { const p = (t * 0.6 + i / 14) % 1, a = i * 2.4; s.position.set(Math.cos(a) * 0.5, p * 1.9, Math.sin(a) * 0.5); s.material.opacity = 1 - p; });
    });
  },
  aura_laurel(g, anim) {
    // Champion's Laurels: a golden laurel wreath floating over your head and a shower of gold sparks
    const gold = shiny('#ffc53d', { metalness: 0.75, roughness: 0.25 });
    const wreath = new THREE.Group();
    wreath.position.y = 2.25;
    g.add(wreath);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      if (Math.abs(Math.sin(a / 2)) < 0.12) continue; // a gap at the front
      part(wreath, sphere(0.06, 8, 6), gold, { p: [Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32], s: [0.6, 0.3, 1.4], r: [0, a, 0.4], outline: null });
    }
    const halo = new THREE.Sprite(additive(glowTexture, 0xffd84d, 0.5));
    halo.scale.setScalar(1.1);
    wreath.add(halo);
    const sparks = sprites(g, additive(starTexture, 0xffe27a), 10, 0.12);
    anim.push((t) => {
      wreath.rotation.y = t * 0.5;
      wreath.position.y = 2.25 + Math.sin(t * 2) * 0.04;
      sparks.forEach((s, i) => { const p = (t * 0.5 + i / 10) % 1, a = i * 1.9; s.position.set(Math.cos(a) * (0.3 + p * 0.4), 2.2 - p * 2.0, Math.sin(a) * (0.3 + p * 0.4)); s.scale.setScalar(0.12 * (1 - p)); });
    });
  },
  aura_tide(g, anim) {
    // Tidecaller: a spiralling ring of water with little fish leaping through it
    const water = part(g, geo('tideRing', () => new THREE.TorusGeometry(0.75, 0.06, 8, 48)), basic('#5fc8ff', { transparent: true, opacity: 0.55, depthWrite: false }), { p: [0, 0.5, 0], r: [Math.PI / 2, 0, 0], outline: null, shadow: false });
    const drops = sprites(g, additive(glowTexture, 0xbfeaff, 0.9), 16, 0.08);
    const fish = [0, 1, 2].map((i) => {
      const f = new THREE.Group();
      part(f, sphere(0.06, 10, 8), toon(['#6fa8dc', '#ff8a5c', '#6ee7a0'][i]), { s: [1.6, 0.8, 0.7], outline: OUT_THIN });
      part(f, cone(0.05, 0.08, 4), toon(['#6fa8dc', '#ff8a5c', '#6ee7a0'][i]), { p: [-0.12, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.3], outline: null });
      g.add(f);
      return f;
    });
    anim.push((t) => {
      water.rotation.z = t;
      water.position.y = 0.5 + Math.sin(t * 1.5) * 0.25;
      water.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
      drops.forEach((s, i) => { const a = t * 2 + i * 0.39; s.position.set(Math.cos(a) * 0.75, water.position.y + Math.sin(t * 5 + i) * 0.08, Math.sin(a) * 0.75); });
      fish.forEach((f, i) => {
        const a = t * 1.6 + (i / 3) * TAU, hop = Math.abs(Math.sin(t * 2.2 + i * 2));
        f.position.set(Math.cos(a) * 0.75, water.position.y + hop * 0.5, Math.sin(a) * 0.75);
        f.rotation.set(0, -a - Math.PI / 2, Math.cos(t * 2.2 + i * 2) * 0.9);
      });
    });
  },
  aura_speed(g, anim) {
    // Speed Demon: speed lines whipping past, a checkered ring at your feet and tyre-smoke puffs
    const lines = [];
    for (let i = 0; i < 12; i++) {
      const l = part(g, box(0.02, 0.02, 0.8), basic(i % 3 ? '#ffffff' : '#ffd84d', { transparent: true, opacity: 0.8, depthWrite: false }), { outline: null, shadow: false });
      l.userData.a = (i / 12) * TAU;
      lines.push(l);
    }
    const tex = geo('checkRingTex', () => canvasTexture(256, 32, (c) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { c.fillStyle = (x + y) % 2 ? '#1d1b2e' : '#ffffff'; c.fillRect(x * 16, y * 16, 16, 16); } }));
    const ring = part(g, geo('checkRing', () => new THREE.RingGeometry(0.6, 0.72, 48, 1)), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), { p: [0, 0.03, 0], r: [-Math.PI / 2, 0, 0], outline: null, shadow: false });
    const smoke = sprites(g, new THREE.SpriteMaterial({ map: puffTexture, transparent: true, opacity: 0.5, depthWrite: false }), 6, 0.3);
    anim.push((t, dt, moving) => {
      ring.rotation.z = -t * 2;
      lines.forEach((l, i) => {
        const p = (t * 2.5 + i / 12) % 1, a = l.userData.a;
        l.position.set(Math.cos(a) * 0.65, 0.3 + (i % 4) * 0.4, Math.sin(a) * 0.65 - (p - 0.5) * 1.6);
        l.material.opacity = Math.sin(p * Math.PI) * 0.8;
      });
      smoke.forEach((s, i) => { const p = (t * 0.8 + i / 6) % 1; s.position.set((i - 2.5) * 0.12, 0.1 + p * 0.5, -0.4 - p * 0.6); s.scale.setScalar(0.2 + p * 0.4); s.material.opacity = (1 - p) * (moving ? 0.6 : 0.25); });
    });
  },
  aura_storm(g, anim) {
    // Stormborn: a little thundercloud over your head, rain, and lightning cracking down around you
    const cloud = new THREE.Group();
    cloud.position.y = 2.35;
    g.add(cloud);
    for (const [x, z, r] of [[0, 0, 0.26], [0.24, 0.05, 0.2], [-0.24, -0.03, 0.21], [0.1, -0.15, 0.18], [-0.08, 0.16, 0.18]]) part(cloud, sphere(r, 12, 10), toon('#4a5068'), { p: [x, 0, z], s: [1, 0.7, 1], outline: OUT_THIN });
    const rain = [];
    for (let i = 0; i < 14; i++) rain.push(part(g, box(0.012, 0.14, 0.012), basic('#bfe0ff', { transparent: true, opacity: 0.8 }), { outline: null, shadow: false }));
    const boltMat = new THREE.MeshBasicMaterial({ color: '#fff6a0', transparent: true, opacity: 0 });
    const bolt = new THREE.Group();
    g.add(bolt);
    const zig = [[0, 2.2], [0.15, 1.7], [-0.05, 1.3], [0.12, 0.8], [-0.02, 0.3]];
    for (let i = 0; i < zig.length - 1; i++) {
      const [x0, y0] = zig[i], [x1, y1] = zig[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const seg = new THREE.Mesh(box(0.04, len, 0.04), boltMat);
      seg.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      seg.rotation.z = Math.atan2(x0 - x1, y1 - y0) * -1;
      bolt.add(seg);
    }
    const flash = new THREE.Sprite(additive(glowTexture, 0xfff6a0, 0));
    flash.scale.setScalar(2.4);
    flash.position.y = 1.2;
    bolt.add(flash);
    let next = 1;
    anim.push((t) => {
      cloud.rotation.y = t * 0.3;
      rain.forEach((r, i) => { const p = (t * 1.6 + i / 14) % 1, a = i * 2.4; r.position.set(Math.cos(a) * 0.22, 2.2 - p * 2.1, Math.sin(a) * 0.22); });
      if (t > next) { next = t + 1.2 + Math.random() * 2.2; bolt.rotation.y = Math.random() * TAU; bolt.position.set(Math.cos(t) * 0.6, 0, Math.sin(t) * 0.6); boltMat.userData.at = t; }
      const k = Math.max(0, 1 - (t - (boltMat.userData.at ?? -9)) * 5);
      boltMat.opacity = k;
      flash.material.opacity = k * 0.7;
    });
  },
  aura_og(g, anim, L) {
    // OG Tester (admin-given only): a full power-up. Tall flickering flames of ki roaring up round you,
    // a hot white core, lightning crackling through it, shockwaves rippling out along the ground and
    // pebbles lifting off it. The one aura you can recolour.
    const c = new THREE.Color(L?.auraColor || '#ffd84d');
    const hex = c.getHex(), pale = c.clone().lerp(new THREE.Color('#ffffff'), 0.55).getHex();
    const core = new THREE.Sprite(additive(glowTexture, hex, 0.8));
    core.scale.set(1.5, 2.8, 1);
    core.position.y = 1.1;
    g.add(core);
    // the flames: two rings of tall licks of ki, the outer ones in the aura colour, the inner ones paler
    const flames = [];
    for (let k = 0; k < 30; k++) {
      const outer = k < 20;
      const sp = new THREE.Sprite(additive(kiTexture, outer ? hex : pale, 1));
      g.add(sp);
      flames.push({ sp, a: ((outer ? k : k - 20) / (outer ? 20 : 10)) * TAU + (outer ? 0 : 0.3), r: outer ? 0.5 : 0.3, seed: k * 1.37, outer });
    }
    // lightning: little zig-zags that flash on and off round the body
    const boltMat = new THREE.MeshBasicMaterial({ color: pale, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const bolts = [0, 1, 2].map(() => {
      const b = new THREE.Group();
      let y = 0, x = 0;
      for (let k = 0; k < 4; k++) {
        const nx = (k % 2 ? 1 : -1) * 0.09, ny = y - 0.16;
        const seg = new THREE.Mesh(box(0.018, Math.hypot(nx - x, ny - y), 0.018), boltMat);
        seg.position.set((x + nx) / 2, (y + ny) / 2, 0);
        seg.rotation.z = Math.atan2(nx - x, y - ny);
        b.add(seg);
        x = nx; y = ny;
      }
      g.add(b);
      return b;
    });
    // shockwaves along the ground, and pebbles floating up
    const waveMat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const wave = part(g, geo('kiWave', () => new THREE.RingGeometry(0.85, 1, 48)), waveMat, { p: [0, 0.03, 0], r: [-Math.PI / 2, 0, 0], outline: null, shadow: false });
    const ground = part(g, geo('kiGround', () => new THREE.CircleGeometry(1.1, 32)), new THREE.MeshBasicMaterial({ map: groundGlowTexture, color: hex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }), { p: [0, 0.02, 0], r: [-Math.PI / 2, 0, 0], outline: null, shadow: false });
    const pebbles = [];
    for (let k = 0; k < 8; k++) pebbles.push(part(g, geo('kiPebble', () => new THREE.IcosahedronGeometry(0.035, 0)), toon('#8d8aa6'), { outline: null, shadow: false }));
    const motes = sprites(g, additive(glowTexture, pale, 0.9), 14, 0.07);
    let boltAt = 0;
    anim.push((t, dt) => {
      const surge = 0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.05;
      core.scale.set(1.4 * surge, 2.7 * surge, 1);
      core.material.opacity = 0.32 + Math.sin(t * 13) * 0.08;
      for (const f of flames) {
        // each lick roars up from the feet, stretching and flickering
        const p = (t * (f.outer ? 1.6 : 2.1) + f.seed) % 1;
        const a = f.a + Math.sin(t * 2 + f.seed) * 0.2;
        const r = f.r * (1 - p * 0.35);
        f.sp.position.set(Math.cos(a) * r, 0.2 + p * (f.outer ? 2.3 : 1.7), Math.sin(a) * r);
        const k = Math.sin(p * Math.PI);
        f.sp.scale.set((f.outer ? 0.6 : 0.42) * (0.7 + k * 0.5), (f.outer ? 1.6 : 1.2) * (0.6 + k * 0.7) * surge, 1);
        f.sp.material.opacity = (f.outer ? 0.85 : 0.35) * Math.min(1, k * 1.6);
      }
      if (t > boltAt) {
        boltAt = t + 0.12 + Math.random() * 0.5;
        for (const b of bolts) { const a = Math.random() * TAU, y = 0.5 + Math.random() * 1.3; b.position.set(Math.cos(a) * 0.4, y, Math.sin(a) * 0.4); b.rotation.set(0, -a, Math.random() - 0.5); }
        boltMat.userData.at = t;
      }
      boltMat.opacity = Math.max(0, 1 - (t - (boltMat.userData.at ?? -9)) * 9);
      const w = (t * 0.7) % 1;
      wave.scale.setScalar(0.4 + w * 1.8);
      waveMat.opacity = (1 - w) * 0.7;
      ground.material.opacity = 0.45 + Math.sin(t * 6) * 0.15;
      pebbles.forEach((pb, k) => { const p = (t * 0.35 + k / 8) % 1, a = k * 2.3; pb.position.set(Math.cos(a) * (0.6 + (k % 3) * 0.15), p * 1.4, Math.sin(a) * (0.6 + (k % 3) * 0.15)); pb.rotation.set(t * 3 + k, t * 2, 0); pb.visible = p < 0.9; });
      motes.forEach((m, k) => { const p = (t * 1.3 + k / 14) % 1, a = k * 2.4; m.position.set(Math.cos(a) * 0.55, p * 2.4, Math.sin(a) * 0.55); m.material.opacity = 1 - p; });
    });
  },
};

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------

// Each fishing rod has its own look: the blank (the long pole), the grip, the reel and the line guides.
const ROD_STYLES = {
  rod_twig: { blank: '#8b5a2b', grip: '#6b4226', twig: true },
  rod_bamboo: { blank: '#d9c46a', grip: '#8b6a2b', nodes: '#a88f3c', reel: '#8d96a8' },
  rod_fiber: { blank: '#39c6ff', grip: '#c9955a', reel: '#c0c6d4', guides: '#e8ecf5', shinyBlank: true },
  rod_clover: { blank: '#37c871', grip: '#f4f0ff', reel: '#ffd84d', guides: '#ffd84d', charm: 'clover' },
  rod_pro: { blank: '#1d1b2e', stripe: '#e0463c', grip: '#23263f', reel: '#e0463c', bigReel: true, guides: '#c0c6d4', shinyBlank: true },
  rod_golden: { blank: '#ffc53d', grip: '#7a2a8a', reel: '#ffe9a8', bigReel: true, guides: '#ffffff', shinyBlank: true, gold: true, charm: 'gem' },
};

/** Build a rod along -Y from the hand (the tip ends at y = -2.35). */
function buildRod(g, st) {
  const blankMat = st.gold ? shiny(st.blank, { metalness: 0.8, roughness: 0.25 }) : st.shinyBlank ? shiny(st.blank, { metalness: 0.2, roughness: 0.35 }) : toon(st.blank);
  if (st.twig) {
    // a knobbly stick with a string tied on
    part(g, cyl(0.022, 0.045, 2.4, 7), blankMat, { p: [0, -1.1, 0], outline: null });
    for (const [y, a] of [[-0.5, 0.7], [-1.2, -0.6], [-1.8, 0.9]]) part(g, cyl(0.008, 0.016, 0.22, 5), blankMat, { p: [0.05 * Math.sign(a), y, 0], r: [0, 0, a], outline: null });
    part(g, sphere(0.035, 8, 6), toon('#e8dcc0'), { p: [0, -2.3, 0], outline: null });
    return;
  }
  // grip + butt cap
  part(g, cyl(0.036, 0.04, 0.42, 10), toon(st.grip), { p: [0, 0.02, 0], outline: null });
  part(g, sphere(0.045, 10, 8), toon(st.grip), { p: [0, 0.24, 0], outline: null });
  // reel on the side
  const rs = st.bigReel ? 1.35 : 1;
  part(g, cyl(0.055 * rs, 0.055 * rs, 0.07, 14), shiny(st.reel ?? '#c0c6d4', { metalness: 0.6 }), { p: [0.07, -0.14, 0], r: [0, 0, Math.PI / 2], outline: null });
  part(g, cyl(0.012, 0.012, 0.09, 6), toon('#23263f'), { p: [0.12, -0.14, 0.04 * rs], r: [0, 0, Math.PI / 2], outline: null });
  part(g, sphere(0.018, 6, 5), toon('#23263f'), { p: [0.16, -0.14, 0.04 * rs], outline: null });
  // the blank, tapering to the tip
  part(g, cyl(0.011, 0.022, 2.15, 8), blankMat, { p: [0, -1.25, 0], outline: null });
  if (st.stripe) for (const y of [-0.45, -0.9, -1.5]) part(g, cyl(0.02, 0.02, 0.04, 8), toon(st.stripe), { p: [0, y, 0], outline: null });
  if (st.nodes) for (let i = 0; i < 6; i++) part(g, cyl(0.022 - i * 0.002, 0.022 - i * 0.002, 0.03, 8), toon(st.nodes), { p: [0, -0.4 - i * 0.33, 0], outline: null });
  if (st.guides) for (let i = 0; i < 4; i++) {
    const r = 0.03 - i * 0.004;
    part(g, torus(r, 0.005, TAU, 5, 12), shiny(st.guides, { metalness: 0.6 }), { p: [0, -0.55 - i * 0.48, 0.035], r: [0, Math.PI / 2, 0], outline: null });
  }
  if (st.charm === 'clover') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      part(g, sphere(0.035, 8, 6), toon('#2e9e5a'), { p: [0.02 + Math.cos(a) * 0.035, 0.34 + Math.sin(a) * 0.035, 0], s: [1, 1, 0.4], outline: null });
    }
  } else if (st.charm === 'gem') {
    const gem = part(g, new THREE.OctahedronGeometry(0.05, 0), shiny('#b77bff', { metalness: 0.3, roughness: 0.1 }), { p: [0, 0.32, 0], outline: null });
    const glow = new THREE.Sprite(additive(glowTexture, 0xffe27a, 0.6));
    glow.scale.setScalar(0.22);
    gem.add(glow);
  }
}

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
    this.draw = 0;             // how far a bow is drawn (0..1)
    this.nocked = false;       // an arrow sits on the bow string
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
    if (this.riding) this.setRiding(true);
  }

  /** Hop on (or off) the mount in your look. Returns false if you haven't got one. */
  setRiding(on) {
    if (this.mount) this.root.remove(this.mount.group);
    this.mount = null;
    this.riding = false;
    if (!on) return false;
    const m = buildMount(this.L?.mount);
    if (!m) return false;
    this.mount = m;
    m.ridden = true; // (the reins go to your hands)
    this.riding = true;
    this.root.add(m.group);
    m.onStep = () => this.onStep?.('hoof');
    m.onTrick = () => this.onStep?.('trick');
    return true;
  }

  /** Put something in the right hand: 'blaster', 'rod' or null. `color` tints a rod. */
  setProp(kind, color = this.propColor) {
    this.propKind = kind;
    this.propColor = color;
    this.bow = null;
    // (a game's prop takes the place of what you're holding in that hand)
    this.rig?.handItems?.forEach((g, i) => { if (g) g.visible = !(kind && i === (kind === 'bow' ? 1 : 0)); });
    // a right-handed archer holds the bow in the left hand; everything else goes in the right
    if (this.prop) this.prop.parent?.remove(this.prop);
    const hand = this.rig?.elbows[kind === 'bow' ? 1 : 0];
    if (!hand) return;
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
      frame.position.set(0, R * BOW_SCALE, 0);
      frame.scale.setScalar(BOW_SCALE);
      part(frame, torus(R, 0.035, a, 8, 24), toon('#8b5a2b'), { r: [0, 0, -a / 2], outline: OUT_THIN });
      part(frame, cyl(0.045, 0.045, 0.16, 8), toon('#4a2e1c'), { p: [R, 0, 0], outline: null });
      // the string is two pieces meeting at the nock, so it bends back as you draw
      const strings = [0, 1].map(() => part(frame, cyl(0.006, 0.006, 1, 4), basic('#f4f0ff'), { outline: null, shadow: false }));
      const arrow = new THREE.Group();
      part(arrow, cyl(0.018, 0.018, 1.0, 6), toon('#c9955a'), { p: [0.5, 0, 0], r: [0, 0, Math.PI / 2], outline: null });
      part(arrow, cone(0.04, 0.12, 6), toon('#c0c6d4'), { p: [1.05, 0, 0], r: [0, 0, -Math.PI / 2], outline: null });
      for (let k = 0; k < 3; k++) part(arrow, box(0.14, 0.004, 0.06), toon('#ff5d73'), { p: [0.08, Math.cos((k / 3) * TAU) * 0.03, Math.sin((k / 3) * TAU) * 0.03], r: [(k / 3) * TAU, 0, 0], outline: null, shadow: false });
      frame.add(arrow);
      this.bow = { R, a, strings, arrow, frame, held: false };
      g.add(frame);
    } else if (kind === 'shovel') {
      // a beach spade: wooden handle through the fist, a metal blade at the far end
      g.rotation.x = -0.4;
      part(g, cyl(0.03, 0.03, 1.1, 8), toon('#a8743f'), { p: [0, -0.35, 0], outline: OUT_THIN });
      part(g, box(0.16, 0.06, 0.05), toon('#6b4226'), { p: [0, 0.2, 0], outline: null });
      const blade = part(g, box(0.24, 0.3, 0.03), shiny('#c0c6d4'), { p: [0, -0.98, 0.02], outline: OUT_THIN });
      part(blade, cone(0.12, 0.12, 4), shiny('#c0c6d4'), { p: [0, -0.2, 0], r: [Math.PI, Math.PI / 4, 0], s: [1, 1, 0.25], outline: null });
    } else if (kind === 'rod') {
      g.rotation.x = -0.6;
      buildRod(g, ROD_STYLES[this.propColor] ?? { ...ROD_STYLES.rod_twig, blank: this.propColor ?? '#3b2a1a' });
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

  build(look) {
    this.L = look;
    let L = look;
    // a full outfit is worn instead of your top and bottoms (shoes and socks stay yours)
    const O = OUTFITS[L.outfit];
    if (O) {
      const col = L.outfitColor || O.color;
      const acc = L.outfitAccent || O.accent || '#ffffff';
      L = { ...L, top: O.top, topColor: col, topTint: col, topAccent: acc, bottom: O.bottom, bottomColor: O.pants ?? col, bottomAccent: O.pantsAccent ?? acc };
    }
    const top = TOPS[L.top] ?? TOPS.top_tee;
    const bottom = BOTTOMS[L.bottom] ?? BOTTOMS.bottom_pants;
    const anim = [];
    const state = { disposables: [] };
    const skin = toon(L.skin);
    // fixed-look tops (suits, armour…) keep their own colour unless you recolour them
    const topColor = top.color ? (L.topTint || top.color) : L.topColor;
    const accent = L.topAccent || top.accent || '#ffffff';
    const topPattern = top.vest && top.vest !== 'plain' ? top.vest : top.pattern;
    const topMat = top.metal ? shiny(topColor, { metalness: 0.75, roughness: 0.3 })
      : top.leather || top.shiny ? shiny(topColor, { metalness: 0.15, roughness: 0.42 })
        : topPattern ? patternMaterial(topPattern, hex(topColor), hex(accent)) : toon(topColor);
    const shirtMat = top.shirt ? toon(top.shirt) : null;
    const pants = bottom.leather ? shiny(L.bottomColor, { metalness: 0.15, roughness: 0.4 })
      : bottom.pattern ? patternMaterial(bottom.pattern, hex(L.bottomColor), hex(L.bottomAccent || (bottom.pattern === 'plaid' ? '#1d1b2e' : '#ffffff'))) : toon(L.bottomColor);
    const shoe = toon(L.shoeColor);

    // body shape: legs and torso stretch with height; build widens the torso and limbs
    const H = HEIGHTS[L.height] ?? HEIGHTS.height_medium;
    const B = BUILDS[L.build] ?? BUILDS.build_regular;
    const hipY = 0.46 * H.leg;
    const up = (y) => hipY + (y - 0.46) * H.torso; // a height on the default body, moved onto this one
    const kl = H.leg, kb = B.limb;

    const body = new THREE.Group();
    this.root.add(body);

    // legs: hip -> knee -> shoe, so steps can lift and bend
    const sole = toon('#f4f0ff');
    // socks show wherever the legs do: low/crew socks are a band above the shoe, knee socks cover the
    // shin, stockings the whole leg (a skirt's default is crew socks)
    const socks = L.socks && L.socks !== 'socks_none' ? L.socks : L.socks === 'socks_none' ? null : bottom.socks ? 'socks_crew' : null;
    const sockMat = toon(L.sockColor || '#f5f5f5');
    const trousers = bottom.legs === 'pants' || bottom.legs === 'capri';
    const upperMat = bottom.legs === 'skin' ? (socks === 'socks_stockings' ? sockMat : skin) : pants;
    const lowerMat = bottom.legs === 'pants' ? pants : (socks === 'socks_stockings' || socks === 'socks_high' ? sockMat : skin);
    const hemMat = toon(tint(L.bottomColor, 0.82)), creaseMat = toon(tint(L.bottomColor, 1.25));
    const knees = [];
    const fy = 0.26 * (1 - kl); // shoes keep their size and stay on the ground at any leg length
    const legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.12 * B.w, hipY, 0);
      const bw = kb * (bottom.baggy ?? 1);
      part(pivot, capsule(trousers ? 0.104 : 0.1, 0.1), upperMat, { p: [0, -0.1 * kl, 0], s: [bw, kl, bw] });
      if (bottom.legs === 'shorts') part(pivot, cyl(0.115 * bw, 0.12 * bw, 0.06, 14), hemMat, { p: [0, -0.19 * kl, 0], outline: null });
      if (bottom.pockets) part(pivot, box(0.05, 0.12, 0.14), toon(tint(L.bottomColor, 0.82)), { p: [s * 0.1 * bw, -0.1 * kl, 0], outline: OUT_THIN });
      if (bottom.seams) part(pivot, box(0.008, 0.2 * kl, 0.012), creaseMat, { p: [s * 0.1 * bw, -0.1 * kl, 0], outline: null, shadow: false });
      if (bottom.crease) part(pivot, box(0.006, 0.2 * kl, 0.01), creaseMat, { p: [0, -0.1 * kl, 0.102 * bw], outline: null, shadow: false });
      if (bottom.satin) part(pivot, box(0.016, 0.21 * kl, 0.03), shiny('#2a2833', { roughness: 0.15 }), { p: [s * 0.102 * bw, -0.1 * kl, 0], outline: null, shadow: false });
      if (bottom.stripe) part(pivot, box(0.012, (bottom.legs === 'shorts' ? 0.12 : 0.2) * kl, 0.03), toon(L.bottomAccent || '#ffffff'), { p: [s * 0.1 * bw, -0.1 * kl, 0], outline: null, shadow: false });
      if (bottom.ripped) part(pivot, circle(0.03), skin, { p: [s * 0.02, -0.14 * kl, 0.098 * bw], s: [1.4, 0.7, 1], outline: null, shadow: false });
      if (bottom.puffy) for (const y of [-0.06, -0.15]) part(pivot, torus(0.1 * bw, 0.024, TAU, 8, 18), pants, { p: [0, y * kl, 0], r: [Math.PI / 2, 0, 0], outline: null });
      const knee = new THREE.Group();
      knee.position.y = -0.2 * kl;
      if (trousers) {
        // straight trouser legs (not sausages): a rounded knee, then a cylinder down to a hem over the shoe
        const legMat = bottom.legs === 'capri' ? (socks === 'socks_high' || socks === 'socks_stockings' ? sockMat : skin) : pants;
        part(knee, sphere(0.094, 16, 12), pants, { s: [bw, 1, bw] });
        part(knee, capsule(0.088, 0.08), legMat, { p: [0, -0.08 * kl, 0], s: [kb, kl, kb] });
        const len = bottom.legs === 'capri' ? 0.1 : 0.17;
        if (!bottom.flare) part(knee, cyl(0.095, 0.093, len, 18), pants, { p: [0, -len / 2 * kl, 0], s: [bw, kl, bw] });
        if (!bottom.cuffs && !bottom.jogger && !bottom.flare) part(knee, torus(0.093 * bw, 0.011, TAU, 6, 20), hemMat, { p: [0, -len * kl, 0], r: [Math.PI / 2, 0, 0], outline: null });
        if (bottom.legs === 'capri') part(knee, torus(0.094 * bw, 0.014, TAU, 6, 20), hemMat, { p: [0, -len * kl, 0], r: [Math.PI / 2, 0, 0], outline: null });
        if (bottom.crease) part(knee, box(0.006, len * kl, 0.01), creaseMat, { p: [0, -len / 2 * kl, 0.095 * bw], outline: null, shadow: false });
        if (bottom.satin) part(knee, box(0.016, len * kl, 0.03), shiny('#2a2833', { roughness: 0.15 }), { p: [s * 0.094 * bw, -len / 2 * kl, 0], outline: null, shadow: false });
        if (bottom.puffy) part(knee, torus(0.096 * bw, 0.024, TAU, 8, 18), pants, { p: [0, -0.08 * kl, 0], r: [Math.PI / 2, 0, 0], outline: null });
      } else {
        part(knee, capsule(0.09, 0.08), lowerMat, { p: [0, -0.08 * kl, 0], s: [bw, kl, bw] });
        // long shorts come down over the knee
        if (bottom.long) {
          part(knee, cyl(0.106 * bw, 0.108 * bw, 0.07, 14), pants, { p: [0, -0.005, 0], outline: OUT_THIN });
          part(knee, torus(0.107 * bw, 0.011, TAU, 6, 18), hemMat, { p: [0, -0.04, 0], r: [Math.PI / 2, 0, 0], outline: null });
        }
      }
      if (bottom.cuffs) part(knee, cyl(0.1 * kb, 0.105 * kb, 0.06, 14), toon(tint(L.bottomColor, 1.25)), { p: [0, -0.14 * kl, 0], outline: OUT_THIN });
      if (bottom.seams && !bottom.flare) part(knee, box(0.008, 0.14 * kl, 0.012), creaseMat, { p: [s * 0.094 * bw, -0.07 * kl, 0], outline: null, shadow: false });
      if (bottom.stripe && bottom.legs !== 'shorts') part(knee, box(0.012, 0.14 * kl, 0.03), toon(L.bottomAccent || '#ffffff'), { p: [s * 0.094 * bw, -0.07 * kl, 0], outline: null, shadow: false });
      if (bottom.jogger) part(knee, cyl(0.084 * kb, 0.084 * kb, 0.06, 14), toon(tint(L.bottomColor, 0.8)), { p: [0, -0.15 * kl, 0], outline: OUT_THIN });
      if (bottom.flare) part(knee, cyl(0.092 * bw, 0.15 * bw, 0.17 * kl, 18, true), toon(L.bottomColor, { side: THREE.DoubleSide }), { p: [0, -0.085 * kl, 0.005], outline: OUT_THIN });
      if (bottom.ripped) {
        part(knee, circle(0.04), skin, { p: [0, 0.0, 0.096 * kb], s: [1.5, 0.8, 1], outline: null, shadow: false });
        for (const dy of [0.03, -0.03]) part(knee, box(0.08, 0.006, 0.004), toon('#f4f0ff'), { p: [0, dy, 0.098 * kb], outline: null, shadow: false });
      }
      if (bottom.legs !== 'pants' && socks === 'socks_crew') part(knee, cyl(0.093 * kb, 0.093 * kb, 0.1, 14), sockMat, { p: [0, -0.13 * kl, 0], outline: null });
      if (bottom.legs !== 'pants' && socks === 'socks_low') part(knee, cyl(0.093 * kb, 0.095 * kb, 0.045, 14), sockMat, { p: [0, -0.165 * kl, 0], outline: null });
      if (bottom.legs !== 'pants' && socks === 'socks_high') part(knee, torus(0.088 * kb, 0.012, TAU, 6, 16), toon(tint(L.sockColor || '#f5f5f5', 0.85)), { p: [0, 0.0, 0], r: [Math.PI / 2, 0, 0], outline: null });
      this.buildShoe(knee, L, shoe, sole, skin, fy);
      pivot.add(knee);
      knees.push(knee);
      body.add(pivot);
      return pivot;
    });
    part(body, sphere(0.25), pants, { p: [0, up(0.54), 0], s: [B.w, 0.6, 0.82 * B.d] });
    if (bottom.skirt) {
      const k = bottom.skirt;
      const skirt = new THREE.Group();
      skirt.position.y = up(0.52);
      body.add(skirt);
      // long skirts reach (almost) the floor, whatever your height
      const len = k.len === 'floor' ? up(0.52) - 0.025 : k.len === 'ankle' ? up(0.52) - 0.1 : k.len === 'midi' ? (up(0.52) - 0.1) * 0.72 : k.len;
      const skirtMat = k.pattern ? patternMaterial(k.pattern, hex(L.bottomColor), hex(L.bottomAccent || (k.pattern === 'plaid' ? '#1d1b2e' : '#ffffff'))).clone()
        : k.shiny ? shiny(L.bottomColor, { roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide }) : toon(L.bottomColor, { side: THREE.DoubleSide });
      skirtMat.side = THREE.DoubleSide;
      // tucked up under the shirt at the waist, snug over the hips, then flaring out to the hem; pleats
      // ripple the hem in and out
      const prof = geo(`skirtProf${len},${k.flare},${k.pleats ?? 0}`, () => {
        const g = new THREE.LatheGeometry([
          new THREE.Vector2(k.flare - 0.012, -len - 0.01), new THREE.Vector2(k.flare, -len), new THREE.Vector2(0.262 + (k.flare - 0.262) * 0.45, -len * 0.55),
          new THREE.Vector2(0.262, -0.06), new THREE.Vector2(0.252, 0.03), new THREE.Vector2(0.235, 0.14),
        ], k.pleats ? k.pleats * 4 : 32);
        if (k.pleats) {
          const p = g.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(z, x);
            const depth = Math.max(0, Math.min(1, -y / len)) * 0.07; // (flat at the waist, deepest at the hem)
            const kk = 1 + depth * Math.abs(Math.sin(a * k.pleats / 2));
            p.setX(i, x * kk); p.setZ(i, z * kk);
          }
          g.computeVertexNormals();
        }
        return g;
      });
      part(skirt, prof, skirtMat, { s: [B.w, 1, 0.82 * B.d], outline: OUT_THIN });
      part(skirt, torus(0.252, 0.02, TAU, 6, 32), toon(tint(L.bottomColor, 0.8)), { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0], s: [B.w, 0.82 * B.d, 1], outline: null });
      if (k.frill) part(skirt, cyl(k.flare * B.w * 0.96, k.flare * B.w * 1.2, 0.08, 28, true), toon(tint(L.bottomColor, 1.35), { side: THREE.DoubleSide }), { p: [0, -len + 0.06, 0], s: [1, 1, 0.85 * B.d], outline: null });
      if (k.tulle) part(skirt, cyl(0.27 * B.w, k.flare * B.w * 1.08, len * 0.9, 32, true), basic(L.bottomAccent || '#ffffff', { transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }), { p: [0, -len * 0.5, 0], s: [1, 1, 0.85 * B.d], outline: null, shadow: false });
      if (k.tiers) for (const t of [0.4, 0.72]) part(skirt, torus(0.262 + (k.flare - 0.262) * (t * 1.1), 0.02, TAU, 6, 40), toon(tint(L.bottomColor, 1.2)), { p: [0, -len * t, 0], r: [Math.PI / 2, 0, 0], s: [B.w, 0.82 * B.d, 1], outline: null });
      if (k.sparkle) {
        // a glittery layer just over the skirt
        const glitter = patternMaterial('sparkle', hex(L.bottomColor), '#ffffff').clone();
        Object.assign(glitter, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
        part(skirt, prof, glitter, { s: [B.w * 1.004, 1.001, 0.82 * B.d * 1.004], outline: null, shadow: false });
      }
      if (k.hem) part(skirt, torus(k.flare - 0.004, 0.016, TAU, 6, 40), toon(L.bottomAccent || '#ffffff'), { p: [0, -len + 0.025, 0], r: [Math.PI / 2, 0, 0], s: [B.w, 0.82 * B.d, 1], outline: null });
      if (k.belt) part(skirt, torus(0.258, 0.03, TAU, 6, 32), toon(L.bottomAccent || tint(L.bottomColor, 0.7)), { p: [0, 0.07, 0], r: [Math.PI / 2, 0, 0], s: [B.w, 0.82 * B.d, 1], outline: null });
      if (k.seams) for (const sx of [-1, 1]) part(skirt, box(0.008, len * 0.9, 0.01), creaseMat, { p: [sx * 0.2 * B.w, -len * 0.45, 0.2 * B.d], r: [0.2, 0, 0], outline: null, shadow: false });
      if (k.wrap) part(skirt, box(0.035, len, 0.012), toon(L.bottomAccent || '#ffc53d'), { p: [0.06, -len / 2, 0.26 * B.d + (k.flare - 0.26) * 0.4], r: [0.25, 0, -0.08], outline: null, shadow: false });
      const sway = k.len === 'floor' || k.len === 'ankle' ? 0.025 : 0.04;
      anim.push((t, dt, moving) => { skirt.rotation.x = moving ? Math.sin(t * 9) * sway : 0; });
    }

    const torso = new THREE.Group();
    torso.position.y = up(0.83);
    torso.scale.set(B.w, H.torso, B.d);
    body.add(torso);
    const fitted = (y0, y1, mat, lift = 0.012) => part(torso, bodiceGeo(y0, y1, lift), doubleSided(mat), { s: [1.02, 1, 0.8], outline: OUT_THIN });
    if (top.robe) {
      part(torso, cyl(0.26, 0.42, 0.98, 28), topMat, { p: [0, -0.14, 0], s: [1, 1, 0.85] });
      part(torso, torus(0.42, 0.035, TAU, 8, 40), shiny(accent), { p: [0, -0.62, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1], outline: null });
      part(torso, box(0.06, 0.95, 0.02), shiny(accent), { p: [0, -0.14, 0.3], r: [-0.14, 0, 0], outline: null });
      part(torso, torus(0.21, 0.08, TAU, 10, 28), toon('#f4f0ff'), { p: [0, 0.33, 0], r: [Math.PI / 2, 0, 0] });
    } else if (top.bodice) {
      // bare shoulders: skin, with the top fitted over it from its hem up to its neckline
      part(torso, capsule(0.25, 0.2), skin, { s: [1.02, 1, 0.8] });
      const [y0, y1] = top.bodice;
      fitted(y0, y1, topMat);
      const edge = toon(tint(topColor, top.sparkle ? 1.2 : 0.85));
      part(torso, torus(torsoR(y1) + 0.012, 0.012, TAU, 6, 36), edge, { p: [0, y1, 0], r: [Math.PI / 2, 0, 0], s: [1.02, 0.8, 1], outline: null });
      if (y0 > -0.3) part(torso, torus(torsoR(y0) + 0.012, 0.012, TAU, 6, 36), edge, { p: [0, y0, 0], r: [Math.PI / 2, 0, 0], s: [1.02, 0.8, 1], outline: null });
      if (top.straps) for (const sx of [-1, 1]) part(torso, strapGeo(sx * 0.13, y1 - 0.01, top.straps * 2), toon(topColor, { side: THREE.DoubleSide }), { outline: null });
      if (top.halter) for (const sx of [-1, 1]) {
        // two straps from the neckline up round the back of the neck
        const a = new THREE.Vector3(sx * 0.09, y1, torsoR(y1) * 0.8 + 0.01), b = new THREE.Vector3(sx * 0.07, 0.38, 0.06), c2 = new THREE.Vector3(sx * 0.02, 0.42, -0.08);
        taper(torso, [a, b, c2], 0.018, 0.016, toon(topColor));
      }
    } else if (top.shirt) {
      // a collared shirt with a vest (or blazer) over it, open in a V at the front
      part(torso, capsule(0.25, 0.2), shirtMat, { s: [1.02, 1, 0.8] });
      fitted(-0.35, 0.27, topMat, 0.016);
    } else {
      part(torso, capsule(0.25, 0.2), topMat, { s: [1.02, 1, 0.8] });
    }
    if (top.kimono && !O) {
      // the kimono carries on below the obi, down over the hips to mid-thigh
      const hemGeo = geo('kimonoHem', () => new THREE.LatheGeometry([new THREE.Vector2(0.3, -0.62), new THREE.Vector2(0.285, -0.4), new THREE.Vector2(0.262, -0.2), new THREE.Vector2(0.255, -0.05)], 32));
      part(torso, hemGeo, doubleSided(topMat), { s: [1.02, 1, 0.82], outline: OUT_THIN });
      part(torso, torus(0.3, 0.014, TAU, 6, 32), toon(accent), { p: [0, -0.62, 0], r: [Math.PI / 2, 0, 0], s: [1.02, 0.82, 1], outline: null });
    }
    const sewnOn = torso.children.length;
    this.decorateTop(torso, L, top, topColor, accent);
    if (bottom.overalls || top.bib) {
      // a bib up the front of the shirt (following the chest), straps over the shoulders crossing at
      // the back, a pocket with stitching and brass buttons
      const bibCol = top.bib ? topColor : L.bottomColor;
      const bib = top.bib ? topMat : pants, brass = shiny('#ffc53d', { metalness: 0.6 }), stitch = toon(tint(bibCol, 1.35));
      part(torso, bodiceGeo(-0.35, 0.08, 0.02), doubleSided(bib), { s: [0.62, 1, 0.8], p: [0, 0, 0.005], outline: OUT_THIN });
      part(torso, box(0.11, 0.07, 0.012), toon(tint(bibCol, 0.88)), { p: [0, -0.06, 0.218], outline: OUT_THIN });
      part(torso, box(0.11, 0.004, 0.004), stitch, { p: [0, -0.03, 0.226], outline: null, shadow: false });
      for (const sx of [-1, 1]) {
        part(torso, strapGeo(sx * 0.1, 0.06, 0.05), toon(bibCol, { side: THREE.DoubleSide }), { outline: null });
        part(torso, cyl(0.022, 0.022, 0.012, 12), brass, { p: [sx * 0.1, 0.05, 0.212], r: [Math.PI / 2, 0, 0], outline: null });
        part(torso, sphere(0.014, 8, 6), brass, { p: [sx * 0.255, -0.2, 0.0], outline: null }); // the side buttons
      }
    }
    conformToTorso(torso, sewnOn);

    part(body, cyl(0.09, 0.1, 0.16), skin, { p: [0, up(1.2), 0], s: [0.9 + B.w * 0.1, 1, 0.9 + B.w * 0.1], outline: null });

    // arms: shoulder -> elbow -> hand
    const LONG = new Set(['long', 'puffLong', 'kimono']), SHORT = new Set(['short', 'puff', 'flutter']);
    const sleeveMat = top.shirt && !top.blazer ? shirtMat : top.armAccent ? toon(accent) : topMat;
    const armMat = LONG.has(top.sleeve) ? sleeveMat : skin;
    const cuffMat = toon(tint(top.shirt && !top.blazer ? top.shirt : topColor, top.metal ? 0.8 : 0.85));
    const elbows = [];
    const arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * (0.33 + 0.26 * (B.w - 1)), up(1.1), 0);
      pivot.rotation.z = s * 0.1;
      pivot.scale.setScalar(kb);
      part(pivot, capsule(0.08, 0.07), armMat, { p: [0, -0.09, 0] });
      if (SHORT.has(top.sleeve)) part(pivot, capsule(0.1, 0.06), topMat, { p: [0, -0.05, 0] });
      if (top.sleeve === 'puff' || top.sleeve === 'puffLong') part(pivot, sphere(0.125, 16, 12), topMat, { p: [0, -0.04, 0], s: [1, 0.85, 1], outline: OUT_THIN });
      if (top.sleeve === 'flutter') part(pivot, cyl(0.1, 0.15, 0.1, 18, true), toon(topColor, { side: THREE.DoubleSide }), { p: [0, -0.08, 0], outline: OUT_THIN });
      if (top.sleeve === 'off') {
        // off the shoulder: a puffy band round the top of the arm
        part(pivot, torus(0.09, 0.035, TAU, 8, 18), topMat, { p: [0, -0.06, 0], r: [Math.PI / 2, 0, 0], outline: OUT_THIN });
        part(pivot, capsule(0.095, 0.03), topMat, { p: [0, -0.09, 0] });
      }
      if (top.metal) part(pivot, dome(0.15), topMat, { p: [0, 0.01, 0], s: [1, 0.8, 1] });
      if (top.sleeve === 'short') part(pivot, torus(0.1, 0.014, TAU, 6, 18), toon(top.accent && L.top !== 'top_hawaiian' ? accent : tint(topColor, 0.85)), { p: [0, -0.1, 0], r: [Math.PI / 2, 0, 0], outline: null });
      if (top.armStripe) part(pivot, capsule(0.083, 0.07), toon(accent), { p: [0, -0.09, 0], s: [0.35, 1, 1.02], r: [0, 0, 0], outline: null });
      if (top.puffy) for (const y of [-0.02, -0.12]) part(pivot, torus(0.078, 0.028, TAU, 8, 18), topMat, { p: [0, y, 0], r: [Math.PI / 2, 0, 0], outline: null });
      const elbow = new THREE.Group();
      elbow.position.y = -0.19;
      part(elbow, capsule(0.075, 0.06), armMat, { p: [0, -0.08, 0] });
      if (top.sleeve === 'kimono') {
        // wide kimono sleeves hanging down under the arm, open at the wrist
        part(elbow, cyl(0.085, 0.13, 0.17, 18, true), doubleSided(topMat), { p: [0, -0.08, -0.01], outline: OUT_THIN });
        part(elbow, box(0.03, 0.26, 0.22), topMat, { p: [0, -0.06, -0.1], outline: OUT_THIN });
        part(elbow, torus(0.13, 0.012, TAU, 6, 18), toon(accent), { p: [0, -0.165, -0.01], r: [Math.PI / 2, 0, 0], outline: null });
      } else if (LONG.has(top.sleeve)) part(elbow, torus(0.07, 0.025, TAU, 6, 16), cuffMat, { p: [0, -0.15, 0], r: [Math.PI / 2, 0, 0], outline: null });
      if (top.sleeve === 'puffLong') part(elbow, torus(0.07, 0.03, TAU, 6, 16), toon(accent), { p: [0, -0.15, 0], r: [Math.PI / 2, 0, 0], outline: null });
      part(elbow, sphere(0.088, 16, 12), skin, { p: [0, -0.19, 0.005], s: [0.95, 1.05, 1] });
      part(elbow, sphere(0.04, 8, 6), skin, { p: [s * -0.06, -0.16, 0.04], outline: null, shadow: false }); // thumb
      pivot.add(elbow);
      elbows.push(elbow);
      body.add(pivot);
      return pivot;
    });

    // things held in the hands (the right hand, then the left)
    const handItems = [];
    [['hand', 0], ['hand2', 1]].forEach(([key, i]) => {
      const id = L[key];
      if (!HANDS[id]) return;
      const g = new THREE.Group();
      g.position.set(0, -0.2, 0.02);
      g.rotation.x = Math.PI / 2; // (its +y points up out of the fist once the forearm is held out)
      HANDS[id](g, { ...L, handColor: L[`${key}Color`] }, anim, i ? 1 : -1);
      elbows[i].add(g);
      handItems[i] = g;
    });

    const head = new THREE.Group();
    head.position.y = up(1.52);
    body.add(head);
    part(head, sphere(R, 36, 28), skin);
    for (const s of [-1, 1]) part(head, sphere(0.085, 14, 10), toon(tint(L.skin, 0.93)), { p: [s * 0.41, -0.02, -0.02], s: [0.6, 1, 0.9], outline: OUT_THIN });

    // you can wear up to three hats / hair accessories and three face items at once ([look key, item])
    const hats = ['hat', 'hat2', 'hat3'].map((k) => [k, L[k]]).filter(([, id]) => id && id !== 'hat_none' && HATS[id]);
    const faces = ['face', 'face2', 'face3'].map((k) => [k, L[k]]).filter(([, id]) => id && id !== 'face_none' && FACES[id]);
    const hasHat = (id) => hats.some(([, h]) => h === id), hasFace = (id) => faces.some(([, f]) => f === id);
    const covering = hats.some(([, h]) => COVERING_HATS.has(h));

    // a big round head (Animal Crossing proportions) with a little button nose
    head.scale.setScalar(1.1);
    head.position.y += 0.03;
    if (!hasFace('face_ninja') && !hasFace('face_clownnose') && !hasFace('face_bandana')) {
      const np = onFace(0, -0.075, 0.008);
      part(head, sphere(0.032, 12, 10), toon(tint(L.skin, 0.88)), { p: np.toArray(), q: faceTo(np), s: [1.2, 0.9, 0.8], outline: null });
    }
    const hideEyes = hasFace('face_sunglasses') || hasHat('hat_helmet');
    const eyes = hideEyes ? [] : this.buildEyes(head, L);
    if (!hasFace('face_bandana') && !hasFace('face_ninja')) for (const s of [-1, 1]) {
      const p = onFace(s * 0.25, -0.09, 0.004);
      part(head, circle(0.065), basic('#ff7b9c', { transparent: true, opacity: 0.45, depthWrite: false }), { p: p.toArray(), q: faceTo(p), outline: null, shadow: false });
    }
    let mouth = null, mouthOpen = null;
    if (!hasFace('face_ninja') && !hasFace('face_bandana')) {
      const p = onFace(0, -0.13, 0.002);
      const q = faceTo(p).multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.PI));
      mouth = part(head, torus(0.055, 0.014, Math.PI, 6, 16), basic('#6b2f2f'), { p: p.toArray(), q, outline: null, shadow: false });
      const po = onFace(0, -0.15, -0.012);
      mouthOpen = part(head, sphere(0.055, 14, 10), basic('#5a1f2a'), { p: po.toArray(), q: faceTo(po), s: [1, 0.8, 0.35], outline: null, shadow: false });
      part(mouthOpen, sphere(0.03, 10, 8), basic('#ff7b8c'), { p: [0, -0.025, 0.02], s: [1.2, 0.6, 0.6], outline: null, shadow: false });
      mouthOpen.visible = false;
    }

    const hairMat = toon(L.hairColor);
    AC_LIFT = covering || hasHat('hat_durag') || hasHat('hat_cap') ? 0.03 : 0.085;
    const hair = covering && TALL_HAIR.has(L.hair) ? 'hair_short' : L.hair;
    const hairGroup = new THREE.Group();
    head.add(hairGroup);
    (HAIR[hair] ?? HAIR.hair_short)(hairGroup, hairMat, L, anim);
    // hair is solid all the way through: seen from underneath (or inside a lock) it shows its own
    // colour, never the dark outline shell behind it
    hairGroup.traverse((o) => { if (o.isMesh && !o.userData.outline && o.material.side === THREE.FrontSide) o.material = doubleSided(o.material); });
    // a little strand texture on the main body of the hair (the cap, long curtains, buns: the pieces
    // that have texture coordinates and are the hair's own colour)
    const strands = strandMaterial(L.hairColor), own = hairMat.color.getHex();
    hairGroup.traverse((o) => { if (o.isMesh && !o.userData.outline && o.geometry.attributes.uv && !o.material.map && o.material.color?.getHex() === own) o.material = strands; });
    // each face item in its own colour (face -> faceColor, face2 -> face2Color…)
    for (const [k, id] of faces) FACES[id](head, { ...L, faceColor: L[`${k}Color`] }, anim);
    for (const [k, id] of hats) {
      // hats sit over the puffier hair, so they're a size up (held from the head's centre)
      const hatGroup = new THREE.Group();
      hatGroup.scale.setScalar(id === 'hat_headphones' ? 1 : COVERING_HATS.has(id) ? 1.04 : 1.12);
      hatGroup.position.y = id === 'hat_halo' || id === 'hat_horns' ? 0 : 0.012;
      head.add(hatGroup);
      HATS[id](hatGroup, { ...L, hatColor: L[`${k}Color`] }, anim);
      // big curly hair: hats and accessories ride on top of the curls instead of sinking into them
      const vol = COVERING_HATS.has(id) || id === 'hat_halo' ? 1 : HAIR_VOLUME[hair] ?? 1;
      if (vol > 1) for (const o of hatGroup.children) { if (o.position.length() > 0.15) o.position.multiplyScalar(vol); else o.scale.multiplyScalar(vol); }
    }
    // hats that sit low on the forehead would have the fringe poking through them
    if (hats.some(([, h]) => FRINGE_HIDING_HATS.has(h))) head.traverse((o) => { if (o.userData.fringe) o.visible = false; });
    head.traverse((o) => { if (o.userData.spin) anim.push((t) => { o.rotation.y = t * 2; }); });

    const back = new THREE.Group();
    back.position.set(0, up(0.9), -0.16 * B.d);
    body.add(back);
    BACKS[L.back]?.(back, anim, state, L);

    const aura = new THREE.Group();
    this.root.add(aura);
    AURAS[L.aura]?.(aura, anim, L);
    if (AURA_BASE[L.aura]) auraBase(aura, anim, AURA_BASE[L.aura]);

    // a pet follows along behind you, and pootles about nearby while you stand still. It keeps its own
    // position in the world (so it trails and catches up rather than being glued to you), and is
    // re-expressed in the character's frame each frame.
    const pet = buildPet(L.pet);
    if (pet) {
      pet.group.position.set(0.95, 0, -0.35); // (the spot portraits use)
      pet.group.scale.setScalar(1.25);
      this.root.add(pet.group);
      const follow = { world: null, goal: new THREE.Vector3(0, 0, -1.3), wait: 0, heading: 0 };
      const tmp = new THREE.Vector3(), prev = new THREE.Vector3();
      anim.push((t, dt, moving) => {
        if (this.petOnLap) {
          // riding along (in a kart): curled up on your lap, facing forward
          pet.group.position.set(0, hipY + 0.1, 0.22);
          pet.group.rotation.set(0, 0, 0);
          pet.group.scale.setScalar(0.85);
          follow.world = null;
          pet.tick(t, dt, false);
          return;
        }
        pet.group.scale.setScalar(1.25);
        let petMoving = moving;
        if (dt > 0 && this.root.parent) {
          this.root.updateMatrixWorld();
          if (moving) follow.goal.set(Math.sin(t * 0.7) * 0.35, 0, -1.3); // right behind you, weaving a little
          else if ((follow.wait -= dt) <= 0) {
            // pick somewhere to wander to within a small circle around you
            const a = Math.random() * Math.PI * 2, r = 0.9 + Math.random() * 0.9;
            follow.goal.set(Math.cos(a) * r, 0, Math.sin(a) * r);
            follow.wait = 2 + Math.random() * 3;
          }
          const target = this.root.localToWorld(tmp.copy(follow.goal));
          if (!follow.world || follow.world.distanceTo(target) > 8) follow.world = target.clone();
          prev.copy(follow.world);
          const d = follow.world.distanceTo(target);
          const speed = moving ? Math.max(3, d * 4) : 1.2;
          if (d > 0.05) follow.world.lerp(target, Math.min(1, (speed * dt) / d));
          const step = follow.world.distanceTo(prev);
          petMoving = step > 0.002;
          if (petMoving) follow.heading = Math.atan2(follow.world.x - prev.x, follow.world.z - prev.z);
          pet.group.position.copy(this.root.worldToLocal(tmp.copy(follow.world)));
          pet.group.position.y = 0;
          const rootYaw = new THREE.Euler().setFromQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
          const want = follow.heading - rootYaw;
          const cur = pet.group.rotation.y;
          pet.group.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 8);
        }
        pet.tick(t, dt, petMoving);
      });
    }

    this.rig = { body, torso, head, legs, knees, arms, elbows, eyes, mouth, mouthOpen, anim, hipY, torsoY: H.torso, pet: pet?.group ?? null, handItems, kl, fy };
    this.state = state;
  }

  buildEyes(head, L) {
    const style = L.eyes ?? 'eyes_round';
    const iris = L.eyeColor ?? DEFAULT_LOOK.eyeColor;
    const dark = basic('#15131f');
    const white = basic('#ffffff');
    const eyes = [];
    for (const s of [-1, 1]) {
      const p = onFace(s * EYE_X, EYE_Y, -0.012);
      const q = faceTo(p);
      const shut = style === 'eyes_happy' || (style === 'eyes_wink' && s > 0);
      if (shut) {
        const ph = onFace(s * EYE_X, EYE_Y - 0.02, 0.003);
        part(head, torus(0.05, 0.016, Math.PI, 6, 16), dark, { p: ph.toArray(), q: faceTo(ph), outline: null, shadow: false });
      } else if (style === 'eyes_hearts' || style === 'eyes_stars') {
        const shape = style === 'eyes_hearts' ? heartShape(0.075) : starShape(0.085);
        part(head, geo(`eyeShape${style}`, () => new THREE.ShapeGeometry(shape)), basic(style === 'eyes_hearts' ? '#ff3b6b' : '#ffd84d'), { p: onFace(s * EYE_X, EYE_Y, 0.004).toArray(), q: faceTo(p), outline: null, shadow: false });
      } else if (style === 'eyes_dizzy') {
        const ph = onFace(s * EYE_X, EYE_Y, 0.004);
        for (const r of [0.8, -0.8]) {
          const x = part(head, box(0.11, 0.024, 0.01), dark, { p: ph.toArray(), q: faceTo(ph), outline: null, shadow: false });
          x.rotateZ(r);
        }
      } else if (style === 'eyes_dots') {
        const d = part(head, sphere(0.034, 12, 10), dark, { p: p.toArray(), q, s: [1, 1.1, 0.5], outline: null, shadow: false });
        part(d, sphere(0.011, 6, 5), white, { p: [0.01, 0.012, 0.03], outline: null, shadow: false });
        d.userData.sy = 1.1;
        eyes.push(d);
      } else {
        const big = style === 'eyes_sparkle' || style === 'eyes_surprised';
        const sy = style === 'eyes_sleepy' ? 0.8 : style === 'eyes_angry' ? 0.95 : style === 'eyes_surprised' ? 1.25 : 1.3;
        // surprised and cat eyes are pale with a small / slit pupil; the rest are big dark (or coloured) eyes
        const pale = style === 'eyes_surprised' || style === 'eyes_cat';
        const eye = part(head, sphere(big ? 0.08 : 0.071, 18, 14), basic(pale ? (style === 'eyes_cat' ? '#ffe066' : '#ffffff') : iris), { p: p.toArray(), q, s: [0.85, sy, 0.5], outline: pale ? OUT_THIN : null, shadow: false });
        eye.userData.sy = sy;
        if (style === 'eyes_surprised') part(eye, sphere(0.026, 10, 8), basic(iris), { p: [0, 0, 0.05], outline: null, shadow: false });
        else if (style === 'eyes_cat') part(eye, sphere(0.03, 10, 8), dark, { p: [0, 0, 0.05], s: [0.3, 1.5, 0.6], outline: null, shadow: false });
        else if (iris !== DEFAULT_LOOK.eyeColor) part(eye, sphere(big ? 0.04 : 0.034, 12, 10), dark, { p: [0, -0.004, 0.045], outline: null, shadow: false });
        part(eye, sphere(big ? 0.026 : 0.022, 10, 8), white, { p: [0.022, 0.024, 0.06], outline: null, shadow: false });
        if (big) part(eye, sphere(0.013, 8, 6), white, { p: [-0.024, -0.026, 0.06], outline: null, shadow: false });
        eyes.push(eye);
        if (style === 'eyes_sad' && s < 0) {
          // a single tear
          part(head, sphere(0.022, 10, 8), basic('#8fd3ff'), { p: onFace(s * (EYE_X + 0.02), EYE_Y - 0.11, 0.01).toArray(), s: [0.8, 1.3, 0.6], outline: null, shadow: false });
        }
        if (style === 'eyes_sleepy') {
          const lp = onFace(s * EYE_X, EYE_Y + 0.045, 0.006);
          part(head, capsule(0.014, 0.1), dark, { p: lp.toArray(), r: [0, 0, Math.PI / 2 - s * 0.08], outline: null, shadow: false });
        }
        if (style === 'eyes_lashes') {
          for (let i = 0; i < 2; i++) {
            const lp = onFace(s * (EYE_X + 0.05 + i * 0.022), EYE_Y + 0.07 - i * 0.03, 0.006);
            part(head, capsule(0.009, 0.045), dark, { p: lp.toArray(), r: [0, 0, -s * (0.7 + i * 0.4)], outline: null, shadow: false });
          }
        }
      }
      // eyebrows set the mood: angry ones slope down to the middle, sad ones up
      const tilt = { eyes_sleepy: 0.02, eyes_sparkle: 0.25, eyes_angry: -0.45, eyes_sad: 0.5, eyes_surprised: 0.1 }[style] ?? 0.15;
      const browY = style === 'eyes_angry' ? 0.13 : style === 'eyes_surprised' ? 0.21 : bigEyes(style) ? 0.18 : 0.16;
      const bp = onFace(s * EYE_X, browY, 0.005);
      part(head, capsule(0.016, 0.08), toon(tint(L.hairColor, 0.8)), { p: bp.toArray(), r: [0, 0, Math.PI / 2 + s * tilt], outline: null, shadow: false });
    }
    return eyes;
  }

  decorateTop(torso, L, top, color, accent = '#ffffff') {
    const front = (x, y, lift = 0.012) => {
      // front surface of the (scaled) torso capsule
      const r = 0.25;
      const z = Math.abs(y) <= 0.1 ? r : Math.sqrt(Math.max(0, r * r - (Math.abs(y) - 0.1) ** 2));
      return [x, y, z * 0.8 + lift];
    };
    // a point on the torso at angle a round from the front (sides at ±π/2), height y
    const around = (a, y, lift = 0.012) => {
      const r = 0.25;
      const rad = Math.abs(y) <= 0.1 ? r : Math.sqrt(Math.max(0, r * r - (Math.abs(y) - 0.1) ** 2));
      return [Math.sin(a) * (rad * 1.02 + lift), y, Math.cos(a) * (rad * 0.8 + lift)];
    };
    const acc = toon(accent), dark = toon(tint(color, 0.75)), white = toon('#f4f0ff');
    const ring = (y, mat, t = 0.018) => {
      const rad = Math.abs(y) <= 0.1 ? 0.25 : Math.sqrt(Math.max(0, 0.0625 - (Math.abs(y) - 0.1) ** 2));
      part(torso, torus(rad + 0.004, t, TAU, 6, 32), mat, { p: [0, y, 0], r: [Math.PI / 2, 0, 0], s: [1.02, 0.8, 1], outline: null });
    };
    const vneck = (mat, size = 0.12, y = 0.22) => part(torso, geo(`vn${size}`, () => new THREE.CircleGeometry(size, 3)), mat, { p: front(0, y, 0.006), r: [-0.35, 0, -Math.PI / 2], s: [1, 0.85, 1], outline: null, shadow: false });
    const lapels = (mat, w = 0.075) => {
      for (const sx of [-1, 1]) part(torso, box(w, 0.26, 0.02), mat, { p: front(sx * 0.075, 0.11, 0.02), r: [-0.25, 0, -sx * 0.38], outline: OUT_THIN });
    };
    const buttons = (mat, ys, x = 0) => ys.forEach((y) => part(torso, sphere(0.016, 8, 6), mat, { p: front(x, y, 0.018), outline: null, shadow: false }));
    const collar = (mat, flaps = true) => {
      if (flaps) for (const sx of [-1, 1]) part(torso, box(0.1, 0.05, 0.02), mat, { p: [sx * 0.08, 0.34, 0.14], r: [-0.9, sx * 0.5, sx * 0.3], outline: OUT_THIN });
      else ring(0.33, mat, 0.03);
    };
    switch (L.top) {
      case 'top_tee':
        part(torso, circle(0.08), toon(L.skin), { p: front(0, 0.27, 0.004), r: [-0.5, 0, 0], outline: null, shadow: false });
        ring(-0.16, dark, 0.012);
        break;
      case 'top_hoodie':
        part(torso, torus(0.2, 0.08, TAU, 10, 28), toon(tint(color, 0.85)), { p: [0, 0.3, -0.1], r: [Math.PI / 2 - 0.5, 0, 0] });
        part(torso, box(0.26, 0.12, 0.02), toon(tint(color, 0.85)), { p: front(0, -0.12), outline: OUT_THIN });
        for (const sx of [-1, 1]) {
          part(torso, cyl(0.009, 0.009, 0.15, 6), acc, { p: front(sx * 0.05, 0.14, 0.012), outline: null });
          part(torso, cyl(0.016, 0.012, 0.03, 8), acc, { p: front(sx * 0.05, 0.055, 0.014), outline: null });
        }
        ring(-0.17, dark, 0.02);
        break;
      case 'top_hawaiian':
        vneck(toon(L.skin), 0.1, 0.25);
        collar(toon(tint(color, 1.2)));
        buttons(white, [0.12, 0.02, -0.08]);
        break;
      case 'top_jersey': {
        part(torso, geo('jerseyNum', () => new THREE.PlaneGeometry(0.24, 0.24)), new THREE.MeshBasicMaterial({ map: numberTexture(accent), transparent: true }), { p: front(0, -0.02, 0.02), outline: null, shadow: false });
        for (const sx of [-1, 1]) part(torso, box(0.03, 0.5, 0.2), acc, { p: [sx * 0.25, 0, 0], outline: null });
        vneck(toon(L.skin), 0.09, 0.27);
        ring(0.3, acc, 0.022);
        break;
      }
      case 'top_suit':
        vneck(white, 0.14, 0.2);
        lapels(dark);
        part(torso, box(0.055, 0.2, 0.02), acc, { p: front(0, 0.07, 0.025), outline: null });
        part(torso, geo('tietip', () => new THREE.CircleGeometry(0.035, 4)), acc, { p: front(0, -0.04, 0.026), r: [0, 0, Math.PI / 4], outline: null });
        part(torso, box(0.065, 0.05, 0.03), toon(tint(accent, 0.8)), { p: front(0, 0.2, 0.028), outline: null });
        part(torso, box(0.06, 0.03, 0.01), acc, { p: front(-0.14, 0.12, 0.012), r: [0, -0.5, 0], outline: null });
        buttons(dark, [-0.06, -0.13], 0.03);
        break;
      case 'top_tux':
        vneck(white, 0.15, 0.19);
        lapels(shiny('#2a2833', { roughness: 0.2 }), 0.08);
        for (const sx of [-1, 1]) part(torso, cone(0.04, 0.09, 4), acc, { p: front(sx * 0.04, 0.22, 0.035), r: [0, 0, sx * Math.PI / 2], s: [1, 1, 0.5], outline: OUT_THIN });
        part(torso, sphere(0.02, 8, 6), acc, { p: front(0, 0.22, 0.038), outline: null });
        buttons(white, [0.1, 0.02, -0.06]);
        break;
      case 'top_racing':
        // a proper race suit: twin stripes down the front, coloured side panels, a zip, collar and belt
        for (const sx of [-1, 1]) {
          part(torso, box(0.035, 0.44, 0.02), acc, { p: front(sx * 0.07, 0.06, 0.006), outline: null, shadow: false });
          part(torso, box(0.02, 0.4, 0.17), acc, { p: [sx * 0.252, -0.01, 0], outline: null });
        }
        part(torso, box(0.012, 0.44, 0.02), shiny('#c0c6d4', { metalness: 0.6 }), { p: front(0, 0.02, 0.012), outline: null, shadow: false });
        ring(0.33, toon('#23263f'), 0.03);
        ring(-0.16, toon('#23263f'), 0.022);
        part(torso, circle(0.045), white, { p: front(-0.13, 0.13, 0.014), r: [0, -0.5, 0], outline: null, shadow: false });
        part(torso, circle(0.03), acc, { p: front(-0.13, 0.13, 0.018), r: [0, -0.5, 0], outline: null, shadow: false });
        part(torso, box(0.08, 0.035, 0.01), toon('#ffd84d'), { p: front(0.13, 0.13, 0.014), r: [0, 0.5, 0], outline: null, shadow: false });
        break;
      case 'top_armor':
        part(torso, torus(0.25, 0.025, TAU, 6, 36), shiny('#7d869a'), { p: [0, -0.08, 0], r: [Math.PI / 2, 0, 0], s: [1.03, 0.82, 1], outline: null });
        part(torso, box(0.5, 0.06, 0.44), acc, { p: [0, -0.28, 0], outline: null });
        part(torso, box(0.06, 0.05, 0.03), shiny('#ffc53d', { metalness: 0.7 }), { p: front(0, -0.28, 0.02), outline: null });
        ring(0.32, shiny(tint(color, 0.85), { metalness: 0.7 }), 0.035);
        part(torso, geo('crest', () => new THREE.CircleGeometry(0.06, 5)), acc, { p: front(0, 0.1, 0.02), r: [0, 0, Math.PI], outline: null, shadow: false });
        break;
      case 'top_robe':
        break;
      case 'top_leather':
        vneck(toon(accent), 0.12, 0.22);
        lapels(shiny(tint(color, 1.2), { metalness: 0.15, roughness: 0.4 }), 0.08);
        part(torso, box(0.012, 0.4, 0.015), shiny('#c0c6d4', { metalness: 0.7 }), { p: front(0.05, 0.0, 0.016), r: [0, 0, 0.12], outline: null, shadow: false });
        for (const sx of [-1, 1]) part(torso, box(0.07, 0.008, 0.01), shiny('#c0c6d4', { metalness: 0.7 }), { p: front(sx * 0.14, -0.08, 0.012), r: [0, sx * 0.5, 0], outline: null, shadow: false });
        ring(-0.16, toon(tint(color, 1.3)), 0.02);
        break;
      case 'top_varsity':
        ring(0.31, acc, 0.03); ring(0.335, toon(color), 0.02);
        ring(-0.16, acc, 0.025);
        part(torso, geo('vpatch', () => new THREE.PlaneGeometry(0.1, 0.1)), new THREE.MeshBasicMaterial({ map: letterTexture(accent, hex(color)), transparent: true }), { p: front(-0.12, 0.12, 0.016), r: [0, -0.45, 0], outline: null, shadow: false });
        buttons(acc, [0.16, 0.06, -0.04, -0.12]);
        break;
      case 'top_puffer':
        for (const y of [0.2, 0.06, -0.08]) ring(y, toon(tint(color, 1.08)), 0.045);
        part(torso, cyl(0.17, 0.2, 0.12, 22), toon(color), { p: [0, 0.34, 0], s: [1, 1, 0.85], outline: OUT_THIN });
        part(torso, box(0.012, 0.44, 0.015), toon(accent), { p: front(0, 0.04, 0.05), outline: null, shadow: false });
        break;
      case 'top_sweater':
        ring(0.1, acc, 0.03); ring(0.03, toon(tint(accent, 0.85)), 0.012); ring(0.17, toon(tint(accent, 0.85)), 0.012);
        for (let i = 0; i < 8; i++) part(torso, geo('knitd', () => new THREE.CircleGeometry(0.018, 4)), toon(color), { p: around(-0.9 + i * 0.26, 0.1, 0.035), r: [0, -0.9 + i * 0.26, 0], outline: null, shadow: false });
        ring(0.32, toon(tint(color, 0.85)), 0.03);
        ring(-0.16, toon(tint(color, 0.85)), 0.025);
        break;
      case 'top_flannel':
        vneck(white, 0.13, 0.2);
        collar(toon(tint(color, 0.9)));
        buttons(toon('#e8dcc0'), [0.1, 0.0, -0.1], 0.02);
        for (const sx of [-1, 1]) part(torso, box(0.08, 0.07, 0.012), patternMaterial('plaid', hex(color), hex(accent)), { p: front(sx * 0.12, 0.12, 0.014), r: [0, sx * 0.45, 0], outline: OUT_THIN });
        break;
      case 'top_denim':
        collar(toon(tint(color, 0.85)));
        vneck(white, 0.1, 0.25);
        for (const sx of [-1, 1]) {
          part(torso, box(0.09, 0.07, 0.012), toon(tint(color, 0.88)), { p: front(sx * 0.11, 0.12, 0.014), r: [0, sx * 0.45, 0], outline: OUT_THIN });
          part(torso, sphere(0.012, 6, 5), shiny('#c0c6d4', { metalness: 0.7 }), { p: front(sx * 0.11, 0.1, 0.028), outline: null, shadow: false });
        }
        buttons(shiny('#c0c6d4', { metalness: 0.7 }), [0.14, 0.04, -0.06]);
        part(torso, box(0.006, 0.44, 0.012), acc, { p: front(0.03, 0.0, 0.014), outline: null, shadow: false });
        ring(-0.16, toon(tint(color, 0.85)), 0.022);
        break;
      // ---- the newer tops (and the outfits' tops) ----
      case 'top_tank':
      case 'dress_sleeveless':
        if (L.top === 'dress_sleeveless') { part(torso, circle(0.085), toon(L.skin), { p: front(0, 0.27, 0.004), r: [-0.5, 0, 0], outline: null, shadow: false }); ring(0.3, dark, 0.012); }
        break;
      case 'top_oxford':
        collar(toon(tint(color, 0.92)));
        vneck(toon(L.skin), 0.06, 0.29);
        part(torso, box(0.04, 0.5, 0.012), toon(tint(color, 0.93)), { p: front(0, 0.03, 0.008), outline: null, shadow: false });
        buttons(acc, [0.2, 0.1, 0.0, -0.1]);
        part(torso, box(0.08, 0.08, 0.012), toon(tint(color, 0.9)), { p: front(-0.12, 0.12, 0.014), r: [0, -0.45, 0], outline: OUT_THIN });
        ring(-0.16, dark, 0.012);
        break;
      case 'top_crop':
        part(torso, circle(0.08), toon(L.skin), { p: front(0, 0.27, 0.016), r: [-0.5, 0, 0], outline: null, shadow: false });
        break;
      case 'top_cami':
      case 'dress_slip':
        // a little lace scallop along the neckline
        for (let i = 0; i < 9; i++) part(torso, sphere(0.014, 6, 5), toon(tint(color, 1.45)), { p: around(-0.8 + i * 0.2, 0.15, 0.012), outline: null, shadow: false });
        break;
      case 'top_ribbed':
        ring(0.3, toon(tint(color, 0.85)), 0.026);
        ring(-0.16, toon(tint(color, 0.85)), 0.02);
        break;
      case 'top_cardigan':
        // open down the front over a tee, buttoned edges and two pockets
        vneck(acc, 0.17, 0.12);
        for (const sx of [-1, 1]) {
          part(torso, box(0.03, 0.42, 0.014), toon(tint(color, 0.88)), { p: front(sx * 0.06, 0.0, 0.016), r: [0, 0, -sx * 0.12], outline: null });
          buttons(toon(tint(color, 0.6)), [0.0, -0.1], sx * 0.075);
          part(torso, box(0.09, 0.08, 0.012), toon(tint(color, 0.9)), { p: front(sx * 0.13, -0.08, 0.014), r: [0, sx * 0.5, 0], outline: OUT_THIN });
        }
        ring(-0.17, toon(tint(color, 0.85)), 0.026);
        break;
      case 'top_babydoll': {
        // a square neckline, a ribbon under the bust and a floaty, flared hem
        part(torso, box(0.18, 0.08, 0.01), toon(L.skin), { p: front(0, 0.27, 0.006), r: [-0.45, 0, 0], outline: null, shadow: false });
        ring(0.06, acc, 0.022);
        part(torso, sphere(0.03, 8, 6), acc, { p: front(0, 0.06, 0.03), s: [1.6, 0.8, 0.6], outline: null });
        const peplum = geo('babydollHem', () => new THREE.LatheGeometry([new THREE.Vector2(0.255, 0.04), new THREE.Vector2(0.27, -0.12), new THREE.Vector2(0.31, -0.3), new THREE.Vector2(0.3, -0.32)], 32));
        part(torso, peplum, toon(color, { side: THREE.DoubleSide }), { s: [1.02, 1, 0.82], outline: OUT_THIN });
        break;
      }
      case 'top_ruffle':
        for (const [y, r] of [[0.27, 0.19], [0.02, 0.27]]) {
          const g = geo(`ruffle${r}`, () => { const t = new THREE.TorusGeometry(r, 0.03, 6, 48); const p = t.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getY(i), p.getX(i)); p.setZ(i, p.getZ(i) + Math.sin(a * 12) * 0.018); } t.computeVertexNormals(); return t; });
          part(torso, g, toon(tint(color, 1.15)), { p: [0, y, 0], r: [Math.PI / 2, 0, 0], s: [1.04, 0.82, 1], outline: null });
        }
        part(torso, circle(0.06), toon(L.skin), { p: front(0, 0.29, 0.006), r: [-0.5, 0, 0], outline: null, shadow: false });
        break;
      case 'top_blouse':
        // a rounded collar with a big bow at the throat, and buttons down the front
        for (const sx of [-1, 1]) part(torso, sphere(0.07, 12, 8), toon(tint(color, 1.25)), { p: [sx * 0.06, 0.3, 0.15], s: [1.1, 0.35, 0.8], r: [-0.6, 0, sx * 0.3], outline: OUT_THIN });
        for (const sx of [-1, 1]) part(torso, sphere(0.05, 10, 8), acc, { p: front(sx * 0.05, 0.25, 0.04), s: [1.3, 0.8, 0.5], r: [0, 0, sx * 0.4], outline: OUT_THIN });
        part(torso, sphere(0.025, 8, 6), acc, { p: front(0, 0.25, 0.05), outline: null });
        for (const sx of [-1, 1]) part(torso, box(0.025, 0.12, 0.01), acc, { p: front(sx * 0.03, 0.17, 0.045), r: [0, 0, sx * 0.25], outline: null });
        buttons(toon(tint(color, 1.3)), [0.1, 0.0, -0.1]);
        break;
      case 'top_offshoulder':
      case 'dress_off': {
        // a wide ruffled band across the chest and round over the tops of the arms
        const band = geo('offBand', () => { const t = new THREE.TorusGeometry(0.31, 0.045, 8, 48); const p = t.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getY(i), p.getX(i)); p.setZ(i, p.getZ(i) + Math.sin(a * 10) * 0.012); } t.computeVertexNormals(); return t; });
        part(torso, band, toon(tint(color, L.top === 'dress_off' ? 1.1 : 1.08)), { p: [0, 0.12, 0], r: [Math.PI / 2, 0, 0], s: [1.15, 0.78, 1], outline: OUT_THIN });
        break;
      }
      case 'top_sailor':
        // the big square sailor collar (striped edge), and a neckerchief knotted in front
        part(torso, box(0.4, 0.22, 0.02), acc, { p: [0, 0.22, -0.22], r: [0.35, 0, 0], outline: OUT_THIN });
        part(torso, box(0.36, 0.012, 0.022), white, { p: [0, 0.16, -0.235], r: [0.35, 0, 0], outline: null });
        lapels(acc, 0.06);
        vneck(toon(L.skin), 0.11, 0.24);
        part(torso, sphere(0.04, 10, 8), toon('#e0463c'), { p: front(0, 0.1, 0.04), s: [1.4, 0.9, 0.6], outline: OUT_THIN });
        for (const sx of [-1, 1]) part(torso, box(0.035, 0.12, 0.01), toon('#e0463c'), { p: front(sx * 0.025, 0.03, 0.042), r: [0, 0, sx * 0.3], outline: null });
        ring(-0.16, dark, 0.014);
        break;
      case 'top_sweatervest':
      case 'top_vest_plaid':
      case 'top_vest_brown': {
        // the shirt shows in a V at the front, its collar folded over the vest
        vneck(white, 0.16, 0.16);
        collar(white);
        const edge = toon(tint(color, L.top === 'top_sweatervest' ? 0.8 : 0.7));
        for (const sx of [-1, 1]) part(torso, box(0.022, 0.24, 0.016), edge, { p: front(sx * 0.055, 0.15, 0.02), r: [-0.2, 0, -sx * 0.35], outline: null });
        if (L.top === 'top_sweatervest') ring(-0.16, toon(tint(color, 0.8)), 0.026);
        else {
          buttons(L.top === 'top_vest_brown' ? shiny(accent, { metalness: 0.6 }) : toon(tint(color, 0.6)), [0.02, -0.07, -0.16]);
          for (const sx of [-1, 1]) part(torso, box(0.08, 0.012, 0.012), edge, { p: front(sx * 0.13, -0.06, 0.016), r: [0, sx * 0.5, 0], outline: null });
        }
        if (L.top === 'top_vest_brown') {
          // a pocket watch chain across the front
          const pts = [new THREE.Vector3(...front(0.02, -0.07, 0.03)), new THREE.Vector3(...front(0.08, -0.11, 0.03)), new THREE.Vector3(...front(0.14, -0.07, 0.025))];
          taper(torso, pts, 0.006, 0.006, shiny(accent, { metalness: 0.8 }));
        }
        break;
      }
      case 'top_corset':
        // criss-cross lacing down the front, boning lines and a bow at the top
        for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) part(torso, box(0.075, 0.008, 0.008), acc, { p: front(0, 0.1 - i * 0.07, 0.018), r: [0, 0, sx * 0.55], outline: null, shadow: false });
        for (const x of [-0.14, -0.08, 0.08, 0.14]) part(torso, box(0.006, 0.36, 0.008), toon(tint(color, 0.75)), { p: front(x, -0.08, 0.014), r: [0, x * 3, 0], outline: null, shadow: false });
        part(torso, sphere(0.03, 8, 6), acc, { p: front(0, 0.15, 0.03), s: [1.6, 0.8, 0.6], outline: null });
        break;
      case 'dress_strap':
        // smocking across the bodice, and a little bow at the neckline
        for (const y of [0.08, 0.02, -0.04]) ring(y, toon(tint(color, 0.88)), 0.006);
        for (const sx of [-1, 1]) part(torso, sphere(0.03, 10, 8), acc, { p: front(sx * 0.03, 0.15, 0.02), s: [1.4, 0.8, 0.5], r: [0, 0, sx * 0.35], outline: OUT_THIN });
        part(torso, sphere(0.014, 8, 6), acc, { p: front(0, 0.15, 0.026), outline: null });
        break;
      case 'dress_short':
        part(torso, circle(0.1), toon(L.skin), { p: front(0, 0.27, 0.004), r: [-0.5, 0, 0], outline: null, shadow: false });
        ring(0.32, dark, 0.012);
        break;
      case 'dress_sweetheart':
      case 'dress_bridal':
        // the sweetheart neckline: two soft curves at the top
        for (const sx of [-1, 1]) part(torso, sphere(0.06, 12, 8), toon(tint(color, L.top === 'dress_bridal' ? 0.98 : 1)), { p: front(sx * 0.06, 0.13, -0.025), s: [1.2, 0.7, 0.55], outline: OUT_THIN });
        if (L.top === 'dress_bridal') for (let i = 0; i < 18; i++) part(torso, sphere(0.008, 5, 4), basic('#ffffff'), { p: around(-1 + (i % 6) * 0.4, 0.06 - Math.floor(i / 6) * 0.12, 0.016), outline: null, shadow: false });
        break;
      case 'dress_puff':
        part(torso, box(0.2, 0.09, 0.01), toon(L.skin), { p: front(0, 0.27, 0.006), r: [-0.45, 0, 0], outline: null, shadow: false });
        part(torso, box(0.21, 0.016, 0.015), acc, { p: front(0, 0.225, 0.012), r: [-0.3, 0, 0], outline: null });
        ring(-0.05, acc, 0.03);
        part(torso, sphere(0.04, 10, 8), acc, { p: front(0, -0.05, 0.05), s: [1.6, 0.9, 0.6], outline: null });
        break;
      case 'dress_polo':
      case 'cheer_top':
        if (L.top === 'dress_polo') {
          collar(toon(tint(color, 0.92)));
          part(torso, box(0.05, 0.12, 0.012), toon(tint(color, 0.92)), { p: front(0, 0.21, 0.012), outline: null, shadow: false });
          buttons(acc, [0.24, 0.18]);
          ring(-0.04, acc, 0.016);
        } else {
          // a chevron stripe across the chest and a big letter
          for (const sx of [-1, 1]) part(torso, box(0.24, 0.035, 0.012), acc, { p: front(sx * 0.09, 0.1, 0.012), r: [0, sx * 0.35, sx * 0.45], outline: null, shadow: false });
          part(torso, geo('cheerPatch', () => new THREE.PlaneGeometry(0.1, 0.1)), new THREE.MeshBasicMaterial({ map: letterTexture(accent, hex(color)), transparent: true }), { p: front(0, -0.05, 0.02), outline: null, shadow: false });
          part(torso, circle(0.07), toon(L.skin), { p: front(0, 0.29, 0.004), r: [-0.5, 0, 0], s: [1, 1.3, 1], outline: null, shadow: false });
        }
        break;
      case 'dress_pinafore':
        part(torso, circle(0.08), toon(L.skin), { p: front(0, 0.27, 0.004), r: [-0.5, 0, 0], outline: null, shadow: false });
        break;
      case 'suit3':
        vneck(white, 0.14, 0.2);
        // the waistcoat inside the jacket
        vneck(toon(tint(color, 0.75)), 0.1, 0.06);
        lapels(dark);
        part(torso, box(0.05, 0.2, 0.02), acc, { p: front(0, 0.09, 0.025), outline: null });
        part(torso, box(0.06, 0.045, 0.03), toon(tint(accent, 0.8)), { p: front(0, 0.2, 0.028), outline: null });
        buttons(shiny('#c9a227', { metalness: 0.7 }), [-0.02, -0.09], 0);
        part(torso, box(0.06, 0.03, 0.01), white, { p: front(-0.14, 0.12, 0.012), r: [0, -0.5, 0], outline: null });
        break;
      case 'track_jacket':
        part(torso, box(0.012, 0.5, 0.015), shiny('#c0c6d4', { metalness: 0.6 }), { p: front(0, 0.02, 0.014), outline: null, shadow: false });
        ring(0.33, toon(tint(color, 0.85)), 0.035);
        for (const sx of [-1, 1]) part(torso, box(0.02, 0.4, 0.015), acc, { p: front(sx * 0.12, 0.02, 0.012), r: [0, sx * 0.45, 0], outline: null, shadow: false });
        ring(-0.16, toon(tint(color, 0.85)), 0.024);
        break;
      case 'jump_top':
        collar(toon(tint(color, 0.88)));
        part(torso, box(0.012, 0.4, 0.015), shiny('#c0c6d4', { metalness: 0.6 }), { p: front(0, 0.05, 0.014), outline: null, shadow: false });
        ring(-0.12, acc, 0.028);
        part(torso, box(0.06, 0.05, 0.03), shiny('#c0c6d4', { metalness: 0.7 }), { p: front(0, -0.12, 0.04), outline: null });
        for (const sx of [-1, 1]) part(torso, box(0.08, 0.08, 0.012), toon(tint(color, 0.88)), { p: front(sx * 0.12, 0.12, 0.014), r: [0, sx * 0.45, 0], outline: OUT_THIN });
        break;
      case 'pj_top':
        collar(toon(tint(color, 0.9)));
        part(torso, box(0.035, 0.48, 0.012), acc, { p: front(0.02, 0.03, 0.01), outline: null, shadow: false });
        buttons(acc, [0.16, 0.06, -0.04, -0.13], -0.02);
        part(torso, box(0.08, 0.08, 0.012), toon(tint(color, 1.1)), { p: front(-0.12, 0.12, 0.014), r: [0, -0.45, 0], outline: OUT_THIN });
        break;
      case 'scrub_top':
        vneck(toon(L.skin), 0.12, 0.23);
        part(torso, box(0.09, 0.09, 0.012), toon(tint(color, 0.9)), { p: front(-0.12, 0.1, 0.014), r: [0, -0.45, 0], outline: OUT_THIN });
        part(torso, box(0.012, 0.06, 0.01), toon('#ffffff'), { p: front(-0.13, 0.14, 0.022), r: [0, -0.45, 0], outline: null }); // a pen
        ring(-0.16, dark, 0.012);
        break;
      case 'chef_jacket':
        // double-breasted: two rows of buttons, a stand collar and the overlap
        ring(0.32, toon(tint(color, 0.92)), 0.035);
        part(torso, box(0.012, 0.44, 0.012), toon(tint(color, 0.85)), { p: front(0.06, 0.04, 0.01), r: [0, 0, 0.08], outline: null, shadow: false });
        for (const x of [-0.08, 0.1]) buttons(acc, [0.17, 0.06, -0.05, -0.15], x);
        break;
      case 'gi_top':
      case 'top_kimono': {
        // the crossed collar (left over right) down to the belt / obi
        const gi = L.top === 'gi_top';
        const band = gi ? toon(tint(color, 0.9)) : acc;
        for (const [sx, z] of [[1, 0.018], [-1, 0.024]]) part(torso, box(gi ? 0.06 : 0.055, 0.42, 0.02), band, { p: front(sx * 0.055, 0.08, z), r: [0, 0, -sx * 0.5], outline: OUT_THIN });
        vneck(toon(L.skin), 0.11, 0.25);
        if (gi) {
          ring(-0.12, acc, 0.035);
          part(torso, sphere(0.035, 8, 6), acc, { p: front(0, -0.12, 0.05), s: [1.3, 0.8, 0.6], outline: null });
          for (const sx of [-1, 1]) part(torso, box(0.035, 0.16, 0.012), acc, { p: front(sx * 0.03, -0.2, 0.05), r: [0, 0, sx * 0.2], outline: null });
        } else {
          // the obi: a wide sash with a cord, tied in a big bow at the back
          ring(-0.1, acc, 0.07);
          ring(-0.1, toon(tint(accent, 0.6)), 0.012);
          part(torso, box(0.22, 0.12, 0.08), acc, { p: [0, -0.06, -0.24], outline: OUT_THIN });
          for (const sx of [-1, 1]) part(torso, box(0.16, 0.14, 0.04), toon(tint(accent, 0.85)), { p: [sx * 0.14, -0.04, -0.27], r: [0, 0, sx * 0.35], outline: OUT_THIN });
        }
        break;
      }
      case 'astro_top':
        for (const y of [0.18, -0.02]) ring(y, toon(tint(color, 0.92)), 0.04);
        ring(0.33, shiny('#c0c6d4', { metalness: 0.7 }), 0.05);
        part(torso, box(0.2, 0.13, 0.05), toon('#d8dce6'), { p: front(0, 0.06, 0.03), outline: OUT_THIN });
        ['#e0463c', '#ffd84d', accent].forEach((c, i) => part(torso, sphere(0.018, 8, 6), basic(c), { p: front(-0.05 + i * 0.05, 0.08, 0.06), outline: null, shadow: false }));
        part(torso, box(0.12, 0.02, 0.01), basic(accent), { p: front(0, 0.03, 0.058), outline: null, shadow: false });
        part(torso, box(0.08, 0.05, 0.01), toon('#3b5bdb'), { p: front(-0.15, 0.17, 0.012), r: [0, -0.55, 0], outline: null });
        break;
      case 'school_top':
        // a blazer over the shirt: lapels, a badge, buttons and a bow at the collar
        vneck(white, 0.16, 0.16);
        collar(white);
        lapels(toon(tint(color, 0.8)), 0.07);
        part(torso, sphere(0.04, 10, 8), acc, { p: front(0, 0.25, 0.04), s: [1.5, 0.8, 0.6], outline: OUT_THIN });
        for (const sx of [-1, 1]) part(torso, box(0.04, 0.09, 0.01), acc, { p: front(sx * 0.03, 0.2, 0.04), r: [0, 0, sx * 0.3], outline: null });
        part(torso, circle(0.035), shiny('#c9a227', { metalness: 0.6 }), { p: front(-0.13, 0.12, 0.016), r: [0, -0.5, 0], outline: null, shadow: false });
        buttons(shiny('#c9a227', { metalness: 0.6 }), [-0.04, -0.13], 0.03);
        break;
      case 'top_polo':
        collar(toon(tint(color, 0.9)));
        part(torso, box(0.05, 0.1, 0.012), toon(tint(color, 0.9)), { p: front(0, 0.22, 0.012), outline: null, shadow: false });
        buttons(acc, [0.24, 0.19]);
        part(torso, circle(0.02), acc, { p: front(-0.13, 0.12, 0.014), r: [0, -0.5, 0], outline: null, shadow: false });
        break;
    }
  }

  /** One shoe, on the lower leg (the knee group). fy keeps it on the ground at any leg length. */
  buildShoe(knee, L, shoe, sole, skin, fy) {
    const style = L.shoes || 'shoes_sneakers';
    const dark = toon(tint(L.shoeColor, 0.55)), light = toon(tint(L.shoeColor, 1.3));
    const gloss = shiny(L.shoeColor, { metalness: 0.15, roughness: 0.25 });
    const G = -0.26 + fy; // the ground, in the knee's frame
    const foot = (mat, s = [0.95, 0.6, 1.4], y = -0.2, rx = 0) => part(knee, sphere(0.12, 18, 12), mat, { p: [0, y + fy, 0.045], s, r: [rx, 0, 0] });
    const soleUnder = (mat, h = 0.22) => part(knee, sphere(0.12, 18, 8), mat, { p: [0, -0.235 + fy, 0.045], s: [0.98, h, 1.42], outline: null });
    const toes = (y = -0.205) => { for (let i = 0; i < 4; i++) part(knee, sphere(0.022 - i * 0.002, 8, 6), skin, { p: [-0.05 + i * 0.033, y + fy, 0.2 - Math.abs(i - 1.5) * 0.012], outline: null, shadow: false }); };
    switch (style) {
      case 'shoes_hightops':
        foot(shoe); soleUnder(sole);
        part(knee, cyl(0.098, 0.104, 0.13, 16), shoe, { p: [0, -0.13 + fy, 0.01], outline: OUT_THIN });
        part(knee, torus(0.098, 0.012, TAU, 6, 18), sole, { p: [0, -0.066 + fy, 0.01], r: [Math.PI / 2, 0, 0], outline: null });
        for (let i = 0; i < 3; i++) part(knee, box(0.06, 0.008, 0.01), sole, { p: [0, -0.18 + fy + i * 0.035, 0.105 + (i === 0 ? 0.03 : 0)], outline: null, shadow: false });
        part(knee, sphere(0.05, 10, 8), sole, { p: [0, -0.17 + fy, 0.17], s: [1.4, 0.6, 0.5], outline: null, shadow: false });
        break;
      case 'shoes_boots':
        foot(shoe, [1, 0.62, 1.42]); soleUnder(dark, 0.3);
        part(knee, cyl(0.104, 0.11, 0.2, 16), shoe, { p: [0, -0.1 + fy, 0.005], outline: OUT_THIN });
        part(knee, torus(0.104, 0.016, TAU, 6, 18), dark, { p: [0, 0.0 + fy, 0.005], r: [Math.PI / 2, 0, 0], outline: null });
        part(knee, box(0.12, 0.012, 0.01), dark, { p: [0, -0.2 + fy, 0.14], outline: null, shadow: false });
        break;
      case 'shoes_rainboots':
        // tall glossy wellies with a chunky sole and a band at the top
        foot(gloss, [1, 0.62, 1.42]); soleUnder(dark, 0.32);
        part(knee, cyl(0.108, 0.112, 0.27, 18), gloss, { p: [0, -0.065 + fy, 0.005], outline: OUT_THIN });
        part(knee, torus(0.108, 0.018, TAU, 6, 20), light, { p: [0, 0.07 + fy, 0.005], r: [Math.PI / 2, 0, 0], outline: null });
        part(knee, box(0.2, 0.025, 0.3), dark, { p: [0, G + 0.012, 0.05], outline: null, shadow: false });
        break;
      case 'shoes_dress':
        foot(gloss, [0.85, 0.5, 1.5]);
        part(knee, sphere(0.12, 18, 8), dark, { p: [0, -0.24 + fy, 0.045], s: [0.87, 0.14, 1.5], outline: null });
        part(knee, box(0.05, 0.01, 0.03), dark, { p: [0, -0.16 + fy, 0.1], outline: null, shadow: false });
        break;
      case 'shoes_loafers':
        // low, glossy, with a moc-toe seam and a penny strap across the top
        foot(gloss, [0.88, 0.5, 1.48]);
        part(knee, sphere(0.12, 18, 8), dark, { p: [0, -0.242 + fy, 0.045], s: [0.9, 0.16, 1.5], outline: null });
        part(knee, torus(0.055, 0.007, Math.PI, 6, 14), dark, { p: [0, -0.163 + fy, 0.13], r: [-Math.PI / 2 + 0.25, 0, 0], outline: null, shadow: false });
        part(knee, box(0.15, 0.016, 0.03), dark, { p: [0, -0.158 + fy, 0.05], r: [0.2, 0, 0], outline: null });
        part(knee, box(0.03, 0.012, 0.016), shiny('#c9a227', { metalness: 0.7 }), { p: [0, -0.153 + fy, 0.06], r: [0.2, 0, 0], outline: null, shadow: false });
        part(knee, box(0.1, 0.03, 0.06), dark, { p: [0, G + 0.015, -0.05], outline: null, shadow: false }); // heel
        break;
      case 'shoes_heels': {
        // pointed pumps: the heel up on a slim stiletto, the toe down, the top of the foot showing
        const pump = foot(gloss, [0.82, 0.5, 1.52], -0.175, 0.22);
        part(knee, sphere(0.06, 12, 8), skin, { p: [0, -0.15 + fy, 0.03], s: [1.2, 0.45, 1.2], outline: null, shadow: false });
        part(knee, cyl(0.012, 0.022, 0.09, 10), gloss, { p: [0, G + 0.045, -0.06], outline: OUT_THIN });
        part(knee, box(0.05, 0.012, 0.05), dark, { p: [0, G + 0.006, -0.06], outline: null, shadow: false });
        pump.castShadow = true;
        break;
      }
      case 'shoes_flats': {
        // ballet flats: a soft low shoe with the top of the foot showing and a little bow at the toe
        foot(skin, [0.85, 0.5, 1.35]);
        part(knee, sphere(0.122, 18, 10), shoe, { p: [0, -0.215 + fy, 0.05], s: [0.9, 0.35, 1.42], outline: OUT_THIN });
        part(knee, sphere(0.122, 18, 10), shoe, { p: [0, -0.205 + fy, 0.11], s: [0.86, 0.42, 0.9], outline: null });
        for (const s of [-1, 1]) part(knee, sphere(0.018, 8, 6), light, { p: [s * 0.02, -0.165 + fy, 0.17], s: [1.3, 0.8, 0.6], outline: null, shadow: false });
        part(knee, sphere(0.01, 6, 5), light, { p: [0, -0.165 + fy, 0.172], outline: null, shadow: false });
        break;
      }
      case 'shoes_maryjanes':
        // round-toed and shiny, with a strap over the top fastened with a button
        foot(gloss, [0.92, 0.6, 1.36]);
        part(knee, sphere(0.12, 18, 8), dark, { p: [0, -0.24 + fy, 0.045], s: [0.94, 0.16, 1.38], outline: null });
        part(knee, torus(0.085, 0.012, Math.PI, 6, 16), gloss, { p: [0, -0.18 + fy, 0.02], r: [0, Math.PI / 2, 0], outline: OUT_THIN });
        part(knee, sphere(0.012, 6, 5), shiny('#ffd84d', { metalness: 0.6 }), { p: [0.085, -0.17 + fy, 0.02], outline: null, shadow: false });
        break;
      case 'shoes_platform':
        // chunky platform trainers: a tall two-tone sole that the whole shoe sits up on
        foot(shoe, [0.95, 0.6, 1.4], -0.16);
        part(knee, cyl(0.118, 0.122, 0.09, 20), sole, { p: [0, G + 0.045, 0.045], s: [1, 1, 1.42], outline: OUT_THIN });
        part(knee, cyl(0.123, 0.123, 0.022, 20), toon(tint(L.shoeColor, 0.75)), { p: [0, G + 0.05, 0.045], s: [1, 1, 1.42], outline: null });
        part(knee, sphere(0.05, 10, 8), sole, { p: [0, -0.13 + fy, 0.17], s: [1.4, 0.6, 0.5], outline: null, shadow: false });
        for (let i = 0; i < 3; i++) part(knee, box(0.06, 0.008, 0.01), light, { p: [0, -0.13 + fy + i * 0.025, 0.11 - i * 0.02], outline: null, shadow: false });
        break;
      case 'shoes_sandals':
        foot(skin, [0.85, 0.5, 1.35]);
        toes();
        part(knee, sphere(0.12, 18, 8), dark, { p: [0, -0.24 + fy, 0.045], s: [0.92, 0.14, 1.45], outline: null });
        for (const z of [0.0, 0.1]) part(knee, box(0.2, 0.025, 0.035), shoe, { p: [0, -0.2 + fy + (z ? 0 : 0.02), 0.045 + z], outline: OUT_THIN });
        part(knee, torus(0.08, 0.012, TAU, 6, 16), shoe, { p: [0, -0.15 + fy, 0], r: [Math.PI / 2, 0, 0], outline: null });
        break;
      case 'shoes_slides':
        // pool slides: a thick moulded footbed and one wide padded strap over the top, with a stripe
        foot(skin, [0.85, 0.48, 1.32]);
        toes(-0.2);
        part(knee, cyl(0.112, 0.115, 0.04, 20), sole, { p: [0, G + 0.02, 0.045], s: [0.98, 1, 1.45], outline: OUT_THIN });
        part(knee, geo('slideStrap', () => new THREE.CylinderGeometry(0.115, 0.115, 0.12, 20, 1, true, -Math.PI / 2, Math.PI)), toon(L.shoeColor, { side: THREE.DoubleSide }), { p: [0, G + 0.04, 0.06], r: [-Math.PI / 2, 0, 0], s: [0.95, 1, 0.75], outline: OUT_THIN });
        part(knee, box(0.16, 0.02, 0.012), sole, { p: [0, G + 0.122, 0.07], r: [0, 0, 0], outline: null, shadow: false });
        break;
      default: // sneakers
        foot(shoe); soleUnder(sole);
        part(knee, sphere(0.05, 10, 8), sole, { p: [0, -0.17 + fy, 0.17], s: [1.4, 0.6, 0.5], outline: null, shadow: false });
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
    if (name === 'gg' || name === 'wow' || name === 'shoot' || name === 'bump') this.jump();
  }

  /**
   * Advance the animation. `speed` scales the stride (1 = walk, ~1.6+ = run); the phase advances
   * with it so feet don't slide.
   */
  update(dt, time, moving = false, speed = 1) {
    const { body, torso, head, legs, knees, arms, elbows, eyes, mouth, mouthOpen, anim } = this.rig;
    // how fast we're really going over the ground (so hooves, wheels and pedals keep pace with it)
    if (dt > 0) {
      this.root.getWorldPosition(_gs);
      const v = this.lastPos ? Math.min(40, _gs.distanceTo(this.lastPos) / dt) : 0;
      this.groundSpeed = (this.groundSpeed ?? 0) + ((moving ? v : 0) - (this.groundSpeed ?? 0)) * Math.min(1, dt * 8);
      (this.lastPos ??= new THREE.Vector3()).copy(_gs);
    }
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
    // (start from straight limbs: riding, driving and the like twist legs and arms sideways, and the
    // walk only sets their forward swing)
    legs.forEach((l) => { l.rotation.y = 0; l.rotation.z = 0; });
    knees.forEach((k) => { k.rotation.y = 0; k.rotation.z = 0; });
    arms.forEach((a) => { a.rotation.y = 0; });
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
    this.rig.handItems?.forEach((g, i) => {
      if (!g?.visible) return;
      arms[i].rotation.x = arms[i].rotation.x * 0.35 - 0.22;
      elbows[i].rotation.x = -1.2 - run * 0.15;
    });

    // keep the planted foot on the ground as the legs spread, plus a little bounce
    const drop = this.rig.hipY * (1 - Math.cos(Math.abs(s) * legA));
    body.position.set(Math.sin(time * 0.7) * 0.015 * iw, -drop + (0.5 + 0.5 * Math.cos(2 * ph)) * (0.03 + run * 0.04) * w, 0);
    body.rotation.set((0.07 + run * 0.12) * w, s * 0.09 * w, -s * 0.035 * w + Math.sin(time * 0.7) * 0.02 * iw);
    body.scale.set(1, 1, 1);
    torso.scale.y = this.rig.torsoY * (1 + breathe * 0.014 * iw);
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
    } else if (this.pose === 'lie') {
      // flat on your back, head towards -Z (the pillow end), feet towards +Z, gently breathing
      legs.forEach((l) => { l.rotation.x = 0; l.rotation.z = 0; });
      knees.forEach((k) => { k.rotation.x = 0.05; });
      arms.forEach((a, i) => { a.rotation.x = 0; a.rotation.z = (i ? 1 : -1) * 0.18; });
      elbows.forEach((e) => { e.rotation.set(-0.15, 0, 0); });
      body.rotation.set(-Math.PI / 2, 0, 0);
      body.position.set(0, 0.2, 0.85 + Math.sin(time * 1.3) * 0.004);
      head.rotation.set(0.1, 0, 0);
    } else if (this.pose === 'sit') {
      legs.forEach((l) => { l.rotation.x = -1.45; });
      knees.forEach((k) => { k.rotation.x = 1.45; });
      arms.forEach((a) => { a.rotation.x = -1.1; });
      elbows.forEach((e) => { e.rotation.x = -0.35; });
      body.position.set(0, 0, 0);
      body.rotation.set(0, 0, 0);
    } else if (this.pose === 'ride' && this.mount) {
      this.poseRide(dt, time, moving, speed);
    } else if (this.aiming) {
      arms[0].rotation.set(-1.5, 0, -0.05);
      elbows[0].rotation.set(0, 0, 0);
      if (this.bow) this.poseBow(body, head, arms, elbows);
      else {
        arms[1].rotation.set(-1.3, 0, -0.45);
        elbows[1].rotation.set(-0.35, 0, 0);
      }
    } else if (this.pose === 'swim') {
      // swimming: front crawl when moving (flat in the water, arms windmilling, legs fluttering);
      // treading water when still (upright, arms sculling, legs cycling)
      const sw = this.swimW = (this.swimW ?? 0) + ((moving ? 1 : 0) - (this.swimW ?? 0)) * Math.min(1, dt * 4);
      const st = time * 5.5;
      const lean = 0.2 + sw * 1.15;
      body.rotation.set(lean, 0, Math.sin(st) * 0.18 * sw);
      body.position.set(0, -0.05 - sw * 0.35 + Math.sin(time * 2) * 0.03, 0);
      head.rotation.set(-lean * 0.85, Math.sin(st) * 0.25 * sw, 0);
      const stroke = [st, st + Math.PI];
      arms.forEach((a, i) => {
        a.rotation.x = -(stroke[i] % TAU) * sw + (1 - sw) * (-0.3 + Math.sin(time * 3 + i) * 0.15);
        a.rotation.z = (i ? 1 : -1) * ((1 - sw) * (1.0 + Math.sin(time * 3 + i * Math.PI) * 0.35) + sw * 0.15);
      });
      elbows.forEach((e, i) => { e.rotation.set(-0.25 - Math.max(0, Math.sin(stroke[i])) * 0.6 * sw, 0, 0); });
      legs.forEach((l, i) => { l.rotation.x = Math.sin(st * 2 + i * Math.PI) * (0.35 * sw + 0.25 * (1 - sw)); });
      knees.forEach((k, i) => { k.rotation.x = 0.15 + Math.max(0, Math.sin(st * 2 + i * Math.PI)) * 0.4; });
    } else if (this.pose === 'dig') {
      // digging: drive the spade in, lever it back, toss the sand over the shoulder
      const dg = (time * 1.6) % 1;
      const push = dg < 0.4 ? dg / 0.4 : dg < 0.7 ? 1 - (dg - 0.4) / 0.3 * 0.6 : 0.4 - (dg - 0.7) / 0.3 * 0.4;
      body.rotation.set(0.25 + push * 0.35, -0.2, 0);
      body.position.set(0, -push * 0.08, 0);
      arms.forEach((a, i) => { a.rotation.x = -0.9 + push * 0.55 - (i ? 0.25 : 0); a.rotation.z = (i ? 1 : -1) * 0.15; });
      elbows.forEach((e) => { e.rotation.x = -0.5 - (1 - push) * 0.4; });
      legs.forEach((l, i) => { l.rotation.x = i ? -0.35 * push : 0.2; });
      knees.forEach((k) => { k.rotation.x = 0.2 + push * 0.45; });
      head.rotation.x = 0.35;
    } else if (this.pose === 'drive') {
      // riding a jet ski / at the wheel: seated, legs out in front, both hands on the wheel, turning it
      // (and looking) into the corner
      const lean = this.lean ?? 0;
      legs.forEach((l, i) => { l.rotation.x = -1.35; l.rotation.z = (i ? -1 : 1) * 0.2; });
      knees.forEach((k) => { k.rotation.x = 1.2; });
      arms.forEach((a, i) => { a.rotation.x = -1.15 + (i ? 1 : -1) * lean * 0.6; a.rotation.z = (i ? -1 : 1) * 0.28; });
      elbows.forEach((e) => { e.rotation.x = -0.55; });
      body.position.set(0, 0, 0);
      body.rotation.set(0.12, 0, lean * 0.5);
      head.rotation.set(-0.05, -lean * 0.8, -lean * 0.3);
    } else if (this.pose === 'moto') {
      // on a motorbike: tucked down over the tank, knees in, hands on the bars, leaning into the turn
      const lean = this.lean ?? 0;
      legs.forEach((l, i) => { l.rotation.x = -1.05; l.rotation.z = (i ? -1 : 1) * 0.2; });
      knees.forEach((k) => { k.rotation.x = 1.75; });
      arms.forEach((a, i) => { a.rotation.x = -1.05; a.rotation.z = (i ? -1 : 1) * 0.32; });
      elbows.forEach((e) => { e.rotation.x = -0.45; });
      body.position.set(0, -0.02, 0);
      body.rotation.set(0.55, 0, lean);
      head.rotation.set(-0.5, -lean * 0.5, 0);
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
      const t = this.emoteT, dur = { shoot: 0.8, throw: 0.8, kick: 0.6, bump: 0.7 }[this.emoteName] ?? 1.9;
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
        case 'shoot': // a jump shot: both hands up, flick the wrist at the top
          arms.forEach((a, i) => { to(a, 'x', -2.9 + Math.min(1, t * 3) * 0.3); to(a, 'z', (i ? 1 : -1) * 0.15); });
          elbows.forEach((e) => to(e, 'x', -0.9 + Math.min(1, t * 4) * 0.8));
          break;
        case 'throw': // a football pass: the right arm winds back and whips over
          to(arms[1], 'x', t < 0.35 ? -2.6 : -1.2); to(arms[1], 'z', 0.3);
          to(elbows[1], 'x', t < 0.35 ? -1.4 : -0.1);
          to(arms[0], 'x', -1.0); to(body, 'y', t < 0.35 ? 0.4 : -0.3);
          break;
        case 'kick':
          to(legs[1], 'x', t < 0.25 ? 0.7 : -1.2); to(knees[1], 'x', t < 0.25 ? 1.2 : 0.1);
          arms.forEach((a, i) => to(a, 'z', (i ? 1 : -1) * 0.7));
          to(body, 'x', -0.1);
          break;
        case 'bump': // a volleyball dig: arms together, straight out in front, a little knee bend
          arms.forEach((a, i) => { to(a, 'x', -1.35); to(a, 'z', (i ? -1 : 1) * 0.25); });
          elbows.forEach((e) => to(e, 'x', 0));
          knees.forEach((k) => to(k, 'x', 0.45));
          to(body, 'x', 0.15);
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
    for (const e of eyes) e.scale.y = blink ? 0.12 : e.userData.sy;

    for (const fn of anim) fn(time, dt, walking);
    if (this.bow) this.updateBow();
  }

  /** Riding: astride a horse, pedalling a bike, kicking along on a scooter or surfing a board. */
  poseRide(dt, time, moving, speed) {
    const { body, head, legs, knees, arms, elbows, hipY } = this.rig;
    const m = this.mount;
    m.tick(time, dt, moving, speed, moving ? this.groundSpeed ?? null : 0);
    const S = m.seatY;
    legs.forEach((l) => l.rotation.set(0, 0, 0));
    body.rotation.set(0, 0, 0);
    const go = this.rideW = (this.rideW ?? 0) + ((moving ? 1 : 0) - (this.rideW ?? 0)) * Math.min(1, dt * 5);
    if (m.stance === 'straddle') {
      // in the saddle: thighs out over the horse's sides, feet down in the stirrups, hands low on the
      // reins. Moving, you lean into it and rise and fall with the stride (and the reins go with the head).
      const bounce = m.bob;
      legs.forEach((l, i) => { l.rotation.x = -0.45 - go * 0.1; l.rotation.z = (i ? -1 : 1) * 0.9; });
      knees.forEach((k) => { k.rotation.x = 0.8 + go * 0.15; });
      arms.forEach((a, i) => { a.rotation.x = -0.65 - go * 0.2 + Math.sin(time * 10) * 0.05 * go; a.rotation.z = (i ? -1 : 1) * 0.1; });
      elbows.forEach((e) => { e.rotation.set(-1.0 + go * 0.2, 0, 0); });
      body.position.set(0, S - hipY + bounce * 1.3, -0.04);
      body.rotation.x = 0.06 + go * 0.22;
      head.rotation.x = -body.rotation.x * 0.7;
    } else if (m.stance === 'pedal' && m.pedalAt) {
      // pedalling: the saddle is set to your leg length, your feet stay on the pedals all the way round
      // and your hands on the grips, leaning in a little more as you speed up
      const { kl, fy } = this.rig;
      const thigh = 0.2 * kl, shin = 0.215 - fy;
      const hip = m.fit(thigh + shin);
      const lean = 0.32 + go * 0.12;
      body.rotation.set(lean, 0, 0);
      // put the hips over the saddle (the body turns about the feet, so allow for the lean)
      body.position.set(0, hip - hipY * Math.cos(lean), -0.1 - hipY * Math.sin(lean));
      head.rotation.x = -lean * 0.85;
      this.root.updateMatrixWorld(true);
      const mg = m.group;
      [-1, 1].forEach((side, i) => {
        body.worldToLocal(mg.localToWorld(m.pedalAt(side, _v1).add(_v2.set(0, 0.03, 0))));
        ikLeg(legs[i], knees[i], _v1, thigh, shin);
        body.worldToLocal(mg.localToWorld(m.gripAt(side, _v3)));
        ikArm(arms[i], elbows[i], _v3, _v6.set(side * 0.6, -0.4, -0.3));
      });
    } else if (m.stance === 'scoot') {
      // one foot on the deck, the other pushing off the ground in long kicks
      const kick = go * Math.sin(time * 6);
      legs[0].rotation.x = 0.05; knees[0].rotation.x = 0.2 + go * 0.15;
      legs[1].rotation.x = kick * 0.7 + go * 0.3; knees[1].rotation.x = 0.15 + Math.max(0, kick) * 0.6;
      arms.forEach((a, i) => { a.rotation.x = -1.05; a.rotation.z = (i ? -1 : 1) * 0.22; });
      elbows.forEach((e) => { e.rotation.set(-0.3, 0, 0); });
      body.position.set(0, S - go * 0.04 + Math.max(0, -kick) * 0.03, -0.05);
      body.rotation.x = 0.1 + go * 0.12;
      head.rotation.x = -body.rotation.x * 0.7;
    } else {
      // a board: side-on, knees bent, arms out for balance, eyes forward; crouch and spring for an ollie
      const hop = m.hop, crouch = hop > 0 ? 0.4 - hop : 0;
      legs.forEach((l, i) => { l.rotation.z = (i ? -1 : 1) * 0.32; l.rotation.x = -0.15 - crouch * 0.4 - hop * 0.6; });
      knees.forEach((k) => { k.rotation.x = 0.45 + crouch * 0.8 + hop * 1.2; });
      arms.forEach((a, i) => { a.rotation.x = -0.2 - hop * 0.5; a.rotation.z = (i ? 1 : -1) * (0.85 + hop * 0.6 + Math.sin(time * 2 + i) * 0.1); });
      elbows.forEach((e) => { e.rotation.set(-0.3, 0, 0); });
      body.position.set(0, S - 0.06 + hop - crouch * 0.06, 0);
      body.rotation.set(go * 0.1, 1.15, go * Math.sin(time * 2.4) * 0.07);
      head.rotation.y = -1.05;
    }
  }

  /**
   * Archer's stance: side-on to the target with the head turned to look down the arrow. The bow is
   * held up in front of the chest and the other hand holds the string, drawing it back to the
   * shoulder as the bow draws. Both arms are placed with a two-bone IK.
   */
  poseBow(body, head, arms, elbows) {
    const d = this.draw, bow = this.bow;
    const twist = -(1.1 + d * 0.15);
    body.rotation.y += twist;
    head.rotation.y -= twist * 0.85;
    head.rotation.x += 0.05;
    this.root.updateMatrixWorld(true);
    // the character's forward and up, in the body's frame
    const bodyQ = _q1.copy(body.getWorldQuaternion(_q1)).invert();
    const rootQ = this.root.getWorldQuaternion(_q2);
    const fwd = _v1.set(0, 0, 1).applyQuaternion(rootQ).applyQuaternion(bodyQ).normalize();
    const k = arms[0].scale.x;
    // anchor just in front of the string-side shoulder; the string rests a little further forward
    const anchor = _v2.copy(arms[0].position).addScaledVector(fwd, 0.12 * k);
    anchor.y += 0.05 * k;
    const rest = _v3.copy(anchor).addScaledVector(fwd, 0.21 * k);
    const depth = (bow.R - bow.R * Math.cos(bow.a / 2)) * BOW_SCALE * k;
    const grip = _v8.copy(rest).addScaledVector(fwd, depth);
    ikArm(arms[1], elbows[1], grip, _v6.set(1, -0.6, 0.2));
    ikArm(arms[0], elbows[0], rest.lerp(anchor, d), _v6.set(-1, 0.2, -0.6));
    // keep the bow upright and pointing forward, with its grip in the bow hand
    this.root.updateMatrixWorld(true);
    const hold = bow.frame.parent;
    const fwdW = _v4.set(0, 0, 1).applyQuaternion(rootQ);
    const upW = _v5.set(0, 1, 0).applyQuaternion(rootQ);
    const want = _q3.setFromRotationMatrix(_m1.makeBasis(fwdW, upW, _v7.crossVectors(fwdW, upW)));
    bow.frame.quaternion.copy(hold.getWorldQuaternion(_q4).invert().multiply(want));
    const gripW = hold.localToWorld(_v8.set(0, 0, 0));
    const scaleW = hold.getWorldScale(_v7).x * BOW_SCALE;
    bow.frame.position.copy(hold.worldToLocal(gripW.addScaledVector(fwdW, -bow.R * scaleW)));
    bow.held = true;
  }

  /** Bend the bow string back to the nock (the drawing hand when held) and sit the arrow on it. */
  updateBow() {
    const { R, a, strings, arrow, frame } = this.bow;
    const tipX = R * Math.cos(a / 2), tipY = R * Math.sin(a / 2);
    let nock = new THREE.Vector3(tipX - this.draw * 0.5, 0, 0);
    if (this.bow.held && this.rig) {
      this.root.updateMatrixWorld(true);
      nock = frame.worldToLocal(this.rig.elbows[0].localToWorld(new THREE.Vector3(0, -0.17, 0.02)));
      this.bow.held = false;
    }
    [[tipX, tipY], [tipX, -tipY]].forEach(([x, y], i) => {
      const from = new THREE.Vector3(x, y, 0);
      const dir = nock.clone().sub(from);
      strings[i].position.copy(from).add(nock).multiplyScalar(0.5);
      strings[i].scale.y = dir.length();
      strings[i].quaternion.setFromUnitVectors(Y, dir.normalize());
    });
    arrow.visible = this.nocked;
    arrow.position.copy(nock);
    // the arrow runs from the nock through the grip
    arrow.quaternion.setFromUnitVectors(_xAxis, _v1.set(R - nock.x, -nock.y, -nock.z).normalize());
  }
}
