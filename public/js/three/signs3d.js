// Big 3D marquee lettering for the buildings' signs (like the casino's): extruded block letters with
// glowing faces and coloured sides, and a ring of chasing bulbs round every letter. The font loads
// once in the background; each sign fills itself in as soon as it's ready.
import * as THREE from 'three';
import { FontLoader } from '../../vendor/FontLoader.js';
import { toon, basic, outlineMaterial } from './materials.js';

const OUT = outlineMaterial(0.02);
let fontPromise = null;
export function signFont() {
  fontPromise ??= fetch(new URL('../../vendor/helvetiker_bold.typeface.json', import.meta.url))
    .then((r) => r.json())
    .then((json) => new FontLoader().parse(json));
  return fontPromise;
}

const BULB = new THREE.SphereGeometry(1, 8, 6);
const ON = new THREE.Color('#fff6b0'), OFF = new THREE.Color('#6a4a1a');

/**
 * A sign reading `text`, fitted into w × h (world units), standing on its baseline at the group's
 * origin and facing +Z. face: the glowing letter faces; side: the letters' returns.
 */
export function letterSign(text, { w = 6, h = 1.2, face = '#fff6e0', side = '#c21838', depth = 0.3, bulbs = true } = {}) {
  const g = new THREE.Group();
  signFont().then((font) => {
    const shapes = font.generateShapes(text, 1);
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 1, curveSegments: 6 });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const bw = bb.max.x - bb.min.x, bh = bb.max.y - bb.min.y;
    const k = Math.min(w / bw, h / bh);
    const inner = new THREE.Group();
    inner.scale.set(k, k, 1);
    inner.position.set(-(bb.min.x + bw / 2) * k, -bb.min.y * k, -depth);
    g.add(inner);
    const faceMat = new THREE.MeshToonMaterial({ color: face, emissive: face, emissiveIntensity: 0.45, gradientMap: toon('#fff').gradientMap });
    const letters = new THREE.Mesh(geo, [faceMat, toon(side)]);
    letters.castShadow = true;
    letters.add(new THREE.Mesh(geo, OUT));
    inner.add(letters);
    if (!bulbs) return;
    // bulbs every ~0.17 font units round each outline and hole
    const pts = [];
    for (const sh of shapes) for (const path of [sh, ...sh.holes]) {
      const n = Math.max(4, Math.round(path.getLength() / 0.17));
      path.getSpacedPoints(n).slice(0, n).forEach((p) => pts.push(p));
    }
    const mesh = new THREE.InstancedMesh(BULB, basic('#ffffff'), pts.length);
    const m = new THREE.Matrix4(), r = 0.028;
    pts.forEach((p, i) => { m.makeScale(r, r, r / k).setPosition(p.x, p.y, depth + 0.035); mesh.setMatrixAt(i, m); mesh.setColorAt(i, ON); });
    mesh.frustumCulled = false;
    inner.add(mesh);
    // chase: every third bulb dims, stepping along 8 times a second
    let last = -1;
    mesh.onBeforeRender = () => {
      const step = Math.floor(performance.now() / 125);
      if (step === last) return;
      last = step;
      for (let i = 0; i < pts.length; i++) mesh.setColorAt(i, (step + i) % 3 === 0 ? OFF : ON);
      mesh.instanceColor.needsUpdate = true;
    };
  });
  return g;
}
