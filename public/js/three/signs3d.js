// Big 3D lettering for the buildings' signs: extruded letters with glowing faces and coloured sides,
// in a typeface that suits each building, evenly spaced. Optional marquee bulbs chase round the
// letters (the casino's). Fonts load in the background; each sign fills itself in once its font is ready.
import * as THREE from 'three';
import { FontLoader } from '../../vendor/FontLoader.js';
import { toon, basic, outlineMaterial } from './materials.js';

const OUT = outlineMaterial(0.02);
// Google Fonts (OFL / Apache), converted to three.js typeface JSON
const FONTS = {
  block: 'helvetiker_bold.typeface.json',
  arcade: 'fonts/arcade.typeface.json', // Press Start 2P
  racing: 'fonts/racing.typeface.json', // Racing Sans One
  spooky: 'fonts/spooky.typeface.json', // Creepster
  military: 'fonts/military.typeface.json', // Black Ops One
  medieval: 'fonts/medieval.typeface.json', // Pirata One
  script: 'fonts/script.typeface.json', // Pacifico
  chewy: 'fonts/chewy.typeface.json', // Chewy
  chunky: 'fonts/chunky.typeface.json', // Lilita One
};
const fonts = new Map();
export function signFont(name = 'block') {
  if (!fonts.has(name)) {
    fonts.set(name, fetch(new URL(`../../vendor/${FONTS[name] || FONTS.block}`, import.meta.url))
      .then((r) => r.json())
      .then((json) => new FontLoader().parse(json)));
  }
  return fonts.get(name);
}

/** The x/y extent of some shapes (outer outlines only). */
function extent(shapes) {
  const b = new THREE.Box2();
  for (const sh of shapes) for (const p of sh.getPoints(4)) b.expandByPoint(p);
  return b;
}

/**
 * Lay `text` out as [{ shapes, x }] with an even gap between each letter's ink (not the font's own
 * advance widths, which leave some pairs looking cramped and others loose). `even: false` keeps the
 * font's natural spacing (for joined-up script).
 */
function layout(font, text, { even = true, gap = 0.13 } = {}) {
  if (!even) return [{ shapes: font.generateShapes(text, 1), x: 0 }];
  const out = [];
  let x = 0, first = true;
  for (const ch of text) {
    if (ch === ' ') { x += 0.32; continue; }
    const shapes = font.generateShapes(ch, 1);
    if (!shapes.length) continue;
    const b = extent(shapes);
    if (!first) x += gap;
    out.push({ shapes, x: x - b.min.x });
    x += b.max.x - b.min.x;
    first = false;
  }
  return out;
}

const BULB = new THREE.SphereGeometry(1, 8, 6);
const ON = new THREE.Color('#fff6b0'), OFF = new THREE.Color('#6a4a1a');

/**
 * A sign reading `text`, fitted into w × h (world units), standing on its baseline at the group's
 * origin and facing +Z. face: the glowing letter faces; side: the letters' returns; font: a key of
 * FONTS; bulbs: ring the letters with chasing marquee bulbs.
 */
export function letterSign(text, { w = 6, h = 1.2, face = '#fff6e0', side = '#c21838', depth = 0.3, bulbs = false, font = 'block', even = true, glow = 0.35 } = {}) {
  const g = new THREE.Group();
  signFont(font).then((f) => {
    const items = layout(f, text, { even });
    const bb = new THREE.Box2();
    for (const it of items) { const e = extent(it.shapes); bb.expandByPoint(new THREE.Vector2(e.min.x + it.x, e.min.y)).expandByPoint(new THREE.Vector2(e.max.x + it.x, e.max.y)); }
    const bw = bb.max.x - bb.min.x, bh = bb.max.y - bb.min.y;
    const k = Math.min(w / bw, h / bh);
    const inner = new THREE.Group();
    inner.scale.set(k, k, 1);
    inner.position.set(-(bb.min.x + bw / 2) * k, -bb.min.y * k, -depth);
    g.add(inner);
    const faceMat = new THREE.MeshToonMaterial({ color: face, emissive: face, emissiveIntensity: glow, gradientMap: toon('#fff').gradientMap });
    const mats = [faceMat, toon(side)];
    const pts = [];
    for (const it of items) {
      const geo = new THREE.ExtrudeGeometry(it.shapes, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.015, bevelSegments: 1, curveSegments: 6 });
      geo.translate(it.x, 0, 0);
      const letters = new THREE.Mesh(geo, mats);
      letters.castShadow = true;
      letters.add(new THREE.Mesh(geo, OUT));
      inner.add(letters);
      // bulbs every ~0.17 font units round each outline and hole
      if (bulbs) for (const sh of it.shapes) for (const path of [sh, ...sh.holes]) {
        const n = Math.max(4, Math.round(path.getLength() / 0.17));
        path.getSpacedPoints(n).slice(0, n).forEach((p) => pts.push(new THREE.Vector2(p.x + it.x, p.y)));
      }
    }
    if (!pts.length) return;
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
