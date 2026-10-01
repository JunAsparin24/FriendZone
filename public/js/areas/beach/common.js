// Building blocks shared by the Coral Cove modules (the beach, the pier, the park, the boats).
import * as THREE from 'three';
import { toon, basic, canvasTexture, outlineMaterial, glowTexture } from '../../three/materials.js';
import { lampParts } from '../../three/town.js';

export const OUT = outlineMaterial(0.04);

export function add(parent, geo, mat, { p = [0, 0, 0], r = null, s = null, outline = false, cast = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  if (s) m.scale.set(...s);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (outline) m.add(new THREE.Mesh(geo, OUT));
  parent.add(m);
  return m;
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (a, b, h, n = 12) => new THREE.CylinderGeometry(a, b, h, n);
export const sph = (r, a = 14, b = 10) => new THREE.SphereGeometry(r, a, b);
export const group = (parent, x = 0, y = 0, z = 0, ry = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; };

/** Seeded random numbers (the same town for everyone). */
export function seeded(seed) {
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  r.range = (a, b) => a + r() * (b - a);
  return r;
}

/** Merge several (already transformed) geometries into one, for instancing. */
export function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
export const tf = (g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));

/** Many copies of one geometry: [{ x, y, z, ry, s, color }]. */
export function instanced(parent, geo, mat, list, { outline = true, cast = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  im.count = list.length;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach((it, i) => {
    e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    q.setFromEuler(e);
    const s = it.s ?? 1;
    m.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), q, new THREE.Vector3(it.sx ?? s, it.sy ?? s, it.sz ?? s));
    im.setMatrixAt(i, m);
    if (it.color) im.setColorAt(i, new THREE.Color(it.color));
  });
  im.castShadow = cast;
  im.receiveShadow = true;
  parent.add(im);
  if (outline) {
    const ol = new THREE.InstancedMesh(geo, OUT, Math.max(1, list.length));
    ol.count = list.length;
    for (let i = 0; i < list.length; i++) { im.getMatrixAt(i, m); ol.setMatrixAt(i, m); }
    parent.add(ol);
  }
  return im;
}

const plankTex = canvasTexture(256, 256, (c) => {
  c.fillStyle = '#c99a62'; c.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) { c.fillStyle = 'rgba(80,45,15,.35)'; c.fillRect(0, y + 29, 256, 3); for (let k = 0; k < 5; k++) { c.fillStyle = 'rgba(80,45,15,.12)'; c.fillRect((k * 61 + y * 3) % 256, y + 6, 30, 2); } }
});
/** Wooden planks, repeated rx × ry times. */
export const plank = (rx, ry, tint = '#ffffff') => { const t = plankTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true; return new THREE.MeshToonMaterial({ map: t, color: tint, gradientMap: toon('#fff').gradientMap }); };
const stripes = new Map();
/** Awning stripes. */
export const stripeMat = (a, b, rx = 1) => {
  const key = `${a}${b}${rx}`;
  if (!stripes.has(key)) {
    const t = canvasTexture(128, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect(i * 16, 0, 16, 64); } });
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(rx, 1);
    stripes.set(key, new THREE.MeshToonMaterial({ map: t, gradientMap: toon('#fff').gradientMap, side: THREE.DoubleSide }));
  }
  return stripes.get(key);
};

/** Lit things the day/night cycle turns on: lamps (lantern, halo, pool of light) and windows. */
export function nightLights() {
  return {
    lanternMat: new THREE.MeshToonMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0.5, gradientMap: toon('#fff').gradientMap }),
    haloMat: new THREE.SpriteMaterial({ map: glowTexture, color: 0xffd27a, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending }),
    poolMat: new THREE.MeshBasicMaterial({ color: '#ffe0a0', transparent: true, opacity: 0, depthWrite: false }),
    windows: [],
  };
}
/** A street lamp at (x, z) like the town's: an iron post with a curled arm and a hanging lantern.
 *  ry turns it (the lantern hangs out towards +z when ry is 0). Lamps are instanced: call flushLamps() once. */
const lampList = [];
export function lamp(parent, lights, x, z, { y = 0, ry = 0 } = {}) {
  lampList.push({ parent, lights, m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)) });
}
export function flushLamps() {
  const { iron, glass } = lampParts();
  const byParent = new Map();
  for (const l of lampList) { if (!byParent.has(l.parent)) byParent.set(l.parent, []); byParent.get(l.parent).push(l); }
  for (const [parent, list] of byParent) {
    const a = new THREE.InstancedMesh(iron, toon('#2b2f4a'), list.length), b = new THREE.InstancedMesh(glass, list[0].lights.lanternMat, list.length);
    list.forEach((l, i) => { a.setMatrixAt(i, l.m); b.setMatrixAt(i, l.m); });
    a.castShadow = true;
    parent.add(a, b);
  }
  lampList.length = 0;
}
/** A window that glows at night. */
export function windowMat(lights, color = '#9fd6ff') {
  const m = new THREE.MeshToonMaterial({ color, emissive: '#ffd98a', emissiveIntensity: 0, gradientMap: toon('#fff').gradientMap });
  lights.windows.push(m);
  return m;
}
export { basic, toon };
