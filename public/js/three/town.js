// The town's furniture: street lamps, fences, cottages, market stalls, landmarks, the creek and its
// bridges. Everything sits on the terrain (heightAt).
import * as THREE from 'three';
import { TAU, toon, basic, shiny, additive, glowTexture, outlineMaterial, canvasTexture } from './materials.js';
import * as M from '../map.js';

const OUT = outlineMaterial(0.035);
const p3 = (x, y) => { const p = M.to3(x, y); return { x: p.x, y: M.heightAt(x, y), z: p.z }; };

function mesh(parent, geo, mat, { p = [0, 0, 0], r = null, s = null, outline = false, cast = true } = {}) {
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

/** Merge a list of { geo, matrix } into one geometry (same material). */
function mergeGeo(parts) {
  const pos = [], nor = [];
  for (const { geo, matrix } of parts) {
    const g = geo.clone().applyMatrix4(matrix);
    const n = g.index ? g.toNonIndexed() : g;
    n.computeVertexNormals();
    pos.push(...n.attributes.position.array);
    nor.push(...n.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
const at = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));

function instances(geo, mat, list, cast = true) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = cast;
  im.receiveShadow = true;
  return im;
}

// ---- street lamps: an old-fashioned iron post with a curled arm and a hanging lantern -------------
function lampParts() {
  const iron = [];
  iron.push({ geo: new THREE.CylinderGeometry(0.34, 0.42, 0.3, 8), matrix: at(0, 0.15, 0) });
  iron.push({ geo: new THREE.CylinderGeometry(0.22, 0.3, 0.5, 8), matrix: at(0, 0.5, 0) });
  iron.push({ geo: new THREE.CylinderGeometry(0.09, 0.13, 3.3, 8), matrix: at(0, 2.3, 0) });
  iron.push({ geo: new THREE.TorusGeometry(0.16, 0.04, 6, 12), matrix: at(0, 1.2, 0, Math.PI / 2) });
  iron.push({ geo: new THREE.TorusGeometry(0.14, 0.04, 6, 12), matrix: at(0, 3.5, 0, Math.PI / 2) });
  iron.push({ geo: new THREE.SphereGeometry(0.13, 8, 6), matrix: at(0, 4.0, 0) });
  // the arm: a quarter circle curling out over the street, plus a scroll underneath
  iron.push({ geo: new THREE.TorusGeometry(0.55, 0.05, 6, 14, Math.PI / 2), matrix: at(0, 3.45, 0.55, 0, Math.PI / 2, 0) });
  iron.push({ geo: new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), matrix: at(0, 3.85, 0.95, Math.PI / 2) });
  iron.push({ geo: new THREE.TorusGeometry(0.22, 0.035, 6, 12, Math.PI * 1.3), matrix: at(0, 3.25, 0.3, 0, Math.PI / 2, 0) });
  // the lantern's cap and frame
  iron.push({ geo: new THREE.ConeGeometry(0.34, 0.3, 6), matrix: at(0, 3.62, 1.15) });
  iron.push({ geo: new THREE.SphereGeometry(0.06, 6, 4), matrix: at(0, 3.82, 1.15) });
  iron.push({ geo: new THREE.CylinderGeometry(0.26, 0.2, 0.08, 6), matrix: at(0, 2.98, 1.15) });
  const glass = [{ geo: new THREE.CylinderGeometry(0.24, 0.18, 0.5, 6), matrix: at(0, 3.23, 1.15) }];
  return { iron: mergeGeo(iron), glass: mergeGeo(glass) };
}

/** Street lamps. Returns what the day/night cycle needs to light them up. */
export function buildLamps(scene, lamps) {
  const { iron, glass } = lampParts();
  const ironMat = toon('#2b2f4a');
  const lanternMat = toon('#fff1b8', { emissive: '#ffd27a', emissiveIntensity: 0.9 });
  const mats = lamps.map((l) => { const p = p3(l.x, l.y); return at(p.x, p.y, p.z, 0, l.h ?? 0); });
  scene.add(instances(iron, ironMat, mats));
  scene.add(instances(glass, lanternMat, mats, false));
  // a soft pool of light on the ground under each lantern and a small halo (same brightness for every lamp)
  const poolTex = canvasTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,215,140,1)');
    g.addColorStop(1, 'rgba(255,215,140,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const poolGeo = new THREE.PlaneGeometry(7, 7);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMats = lamps.map((l) => {
    const a = l.h ?? 0;
    const x = l.x + Math.sin(a) * 23, y = l.y + Math.cos(a) * 23;
    const p = p3(x, y);
    return at(p.x, p.y + 0.06, p.z);
  });
  const pools = instances(poolGeo, poolMat, poolMats, false);
  pools.renderOrder = 1;
  scene.add(pools);
  const haloMat = additive(glowTexture, 0xffd27a, 0.3);
  haloMat.depthTest = true;
  const glows = lamps.map((l) => {
    const a = l.h ?? 0;
    const p = p3(l.x + Math.sin(a) * 23, l.y + Math.cos(a) * 23);
    const s = new THREE.Sprite(haloMat);
    s.scale.setScalar(1.3);
    s.position.set(p.x, p.y + 3.2, p.z);
    scene.add(s);
    return s;
  });
  return { lanternMat, poolMat, haloMat, glows, lamps: lamps.map((l) => { const p = p3(l.x, l.y); return { x: p.x, z: p.z }; }) };
}

// ---- fences --------------------------------------------------------------------------------------
export function buildFences(scene, fences) {
  const picketPosts = [], picketRails = [], railPosts = [], railRails = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const f of fences) {
    const picket = f.kind === 'picket';
    const step = picket ? 9 : 44;
    for (let i = 0; i < f.pts.length - 1; i++) {
      const a = f.pts[i], b = f.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.round(len / step));
      let prev = null;
      for (let k = 0; k <= n; k++) {
        if (k === 0 && i > 0) { prev = p3(a.x, a.y); continue; }
        const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
        const p = p3(x, y);
        const ang = Math.atan2(b.x - a.x, b.y - a.y);
        (picket ? picketPosts : railPosts).push(at(p.x, p.y, p.z, 0, ang));
        if (prev) {
          // rails follow the ground between posts
          const mid = new THREE.Vector3((p.x + prev.x) / 2, 0, (p.z + prev.z) / 2);
          const dir = new THREE.Vector3(p.x - prev.x, p.y - prev.y, p.z - prev.z);
          const l = dir.length();
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
          for (const h of picket ? [0.35, 0.72] : [0.5, 0.95]) {
            mid.y = (p.y + prev.y) / 2 + h;
            (picket ? picketRails : railRails).push(new THREE.Matrix4().compose(mid.clone(), q, new THREE.Vector3(l, 1, 1)));
          }
        }
        prev = p;
      }
    }
  }
  const white = toon('#fffaf0'), wood = toon('#9c6a3c');
  const picketGeo = new THREE.BoxGeometry(0.12, 1.0, 0.06);
  picketGeo.translate(0, 0.5, 0);
  const tip = new THREE.ConeGeometry(0.085, 0.16, 4);
  tip.translate(0, 1.08, 0);
  scene.add(instances(mergeGeo([{ geo: picketGeo, matrix: new THREE.Matrix4() }, { geo: tip, matrix: new THREE.Matrix4() }]), white, picketPosts));
  scene.add(instances(new THREE.BoxGeometry(1, 0.08, 0.04), white, picketRails));
  const postGeo = new THREE.BoxGeometry(0.2, 1.25, 0.2);
  postGeo.translate(0, 0.62, 0);
  scene.add(instances(postGeo, wood, railPosts));
  scene.add(instances(new THREE.BoxGeometry(1, 0.12, 0.08), wood, railRails));
  void up;
}

// ---- cottages ----------------------------------------------------------------------------------
function cottage(c) {
  const g = new THREE.Group();
  const w = c.w / M.PX, d = c.h / M.PX, h = 2.8;
  mesh(g, new THREE.BoxGeometry(w, 0.4, d), toon('#8f8a99'), { p: [0, 0.2, 0] });
  mesh(g, new THREE.BoxGeometry(w - 0.3, h, d - 0.3), toon(c.color), { p: [0, 0.4 + h / 2, 0], outline: true });
  // roof: a gable along the width
  const shape = new THREE.Shape();
  const hd = d / 2 + 0.45;
  shape.moveTo(-hd, 0); shape.lineTo(hd, 0); shape.lineTo(0, 2.2); shape.closePath();
  const roof = new THREE.ExtrudeGeometry(shape, { depth: w + 0.6, bevelEnabled: false });
  roof.translate(0, 0, -(w + 0.6) / 2);
  roof.rotateY(Math.PI / 2);
  mesh(g, roof, toon(c.roof), { p: [0, 0.4 + h, 0], outline: true });
  mesh(g, new THREE.BoxGeometry(0.6, 1.4, 0.6), toon('#b5563a'), { p: [w * 0.25, 0.4 + h + 1.4, -d * 0.15] });
  // front: door, two windows with flower boxes
  const fz = d / 2 - 0.13;
  mesh(g, new THREE.BoxGeometry(1.0, 1.8, 0.1), toon('#7a4a28'), { p: [0, 1.3, fz + 0.02] });
  mesh(g, new THREE.SphereGeometry(0.06, 6, 4), shiny('#ffd84d'), { p: [0.3, 1.3, fz + 0.1] });
  for (const s of [-1, 1]) {
    mesh(g, new THREE.BoxGeometry(1.0, 0.85, 0.08), toon('#9fd6ff', { emissive: '#ffd27a', emissiveIntensity: 0 }), { p: [s * w * 0.3, 2.1, fz + 0.02], cast: false }).userData.window = true;
    mesh(g, new THREE.BoxGeometry(1.15, 0.08, 0.1), toon('#ffffff'), { p: [s * w * 0.3, 2.1, fz + 0.06], cast: false });
    mesh(g, new THREE.BoxGeometry(1.15, 0.22, 0.3), toon('#6b4a2b'), { p: [s * w * 0.3, 1.6, fz + 0.18] });
    for (let k = 0; k < 3; k++) mesh(g, new THREE.SphereGeometry(0.12, 6, 4), toon(['#ff5d73', '#ffd84d', '#e57bff'][k]), { p: [s * w * 0.3 - 0.35 + k * 0.35, 1.78, fz + 0.22], cast: false });
  }
  mesh(g, new THREE.BoxGeometry(0.3, 1.0, 0.3), toon('#2b2f4a'), { p: [w / 2 + 1.2, 0.5, d / 2 + 1.6] }); // mailbox post
  mesh(g, new THREE.BoxGeometry(0.4, 0.3, 0.55), toon('#d6334a'), { p: [w / 2 + 1.2, 1.1, d / 2 + 1.6] });
  const p = p3(c.x + c.w / 2, c.y + c.h / 2);
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = c.face === 'n' ? Math.PI : 0;
  return g;
}

function stall(s) {
  const g = new THREE.Group();
  const wood = toon('#8b5a2b');
  for (const [x, z] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) mesh(g, new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), wood, { p: [x, 1.3, z] });
  mesh(g, new THREE.BoxGeometry(2.8, 0.15, 1.5), wood, { p: [0, 1.0, 0.2] });
  mesh(g, new THREE.BoxGeometry(2.7, 0.9, 1.3), toon('#6b4a2b'), { p: [0, 0.5, 0.2] });
  // striped awning
  const stripes = canvasTexture(128, 32, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : s.color; c.fillRect(i * 16, 0, 16, 32); } });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 2.2), [toon(s.color), toon(s.color), new THREE.MeshToonMaterial({ map: stripes }), toon(s.color), toon(s.color), toon(s.color)]);
  awning.position.set(0, 2.7, 0.1);
  awning.rotation.x = 0.18;
  awning.castShadow = true;
  g.add(awning);
  // goods on the counter
  ['#ff5d73', '#ffd84d', '#6ee7a0', '#ff9f43', '#b77bff'].forEach((c, i) => mesh(g, new THREE.SphereGeometry(0.16, 8, 6), toon(c), { p: [-1 + i * 0.5, 1.2, 0.3] }));
  mesh(g, new THREE.BoxGeometry(0.6, 0.45, 0.5), toon('#c9955a'), { p: [1.6, 0.23, 0.9] });
  const p = p3(s.x, s.y);
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = s.r;
  return g;
}

function windmill(anim) {
  const g = new THREE.Group();
  mesh(g, new THREE.CylinderGeometry(1.6, 2.4, 7, 8), toon('#f4ecd8'), { p: [0, 3.5, 0], outline: true });
  mesh(g, new THREE.ConeGeometry(2.1, 2.2, 8), toon('#d6334a'), { p: [0, 8.1, 0], outline: true });
  mesh(g, new THREE.BoxGeometry(1.1, 1.9, 0.2), toon('#7a4a28'), { p: [0, 0.95, 2.25] });
  const hub = new THREE.Group();
  hub.position.set(0, 6.4, 2.0);
  g.add(hub);
  mesh(hub, new THREE.CylinderGeometry(0.3, 0.3, 0.6, 10), toon('#6b4a2b'), { r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Group();
    blade.rotation.z = (i / 4) * TAU;
    mesh(blade, new THREE.BoxGeometry(0.2, 4.2, 0.1), toon('#8b5a2b'), { p: [0, 2.2, 0.35] });
    mesh(blade, new THREE.BoxGeometry(1.1, 3.4, 0.05), toon('#fffaf0'), { p: [0.6, 2.5, 0.38] });
    hub.add(blade);
  }
  anim.push((t) => { hub.rotation.z = -t * 0.6; });
  return g;
}

function gazebo() {
  const g = new THREE.Group();
  mesh(g, new THREE.CylinderGeometry(3.4, 3.6, 0.4, 8), toon('#e8e2f4'), { p: [0, 0.2, 0] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    mesh(g, new THREE.CylinderGeometry(0.12, 0.12, 3, 8), toon('#ffffff'), { p: [Math.cos(a) * 3, 1.9, Math.sin(a) * 3] });
    if (i !== 2) mesh(g, new THREE.BoxGeometry(0.1, 0.1, 2.3), toon('#ffffff'), { p: [Math.cos(a + TAU / 16) * 2.8, 1.2, Math.sin(a + TAU / 16) * 2.8], r: [0, -a - TAU / 16, 0] });
  }
  mesh(g, new THREE.ConeGeometry(4, 2, 8), toon('#2f9e44'), { p: [0, 4.4, 0], outline: true });
  mesh(g, new THREE.SphereGeometry(0.25, 8, 6), shiny('#ffc53d'), { p: [0, 5.5, 0] });
  return g;
}

function well() {
  const g = new THREE.Group();
  mesh(g, new THREE.CylinderGeometry(1.1, 1.2, 1.0, 14, 1, true), toon('#a4a1b5', { side: THREE.DoubleSide }), { p: [0, 0.5, 0], outline: true });
  mesh(g, new THREE.CircleGeometry(1.05, 14), toon('#1f63b8'), { p: [0, 0.6, 0], r: [-Math.PI / 2, 0, 0], cast: false });
  for (const s of [-1, 1]) mesh(g, new THREE.BoxGeometry(0.15, 2.2, 0.15), toon('#6b4a2b'), { p: [s * 1.0, 1.6, 0] });
  const shape = new THREE.Shape();
  shape.moveTo(-1.5, 0); shape.lineTo(1.5, 0); shape.lineTo(0, 1.0); shape.closePath();
  const roof = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false });
  roof.translate(0, 0, -0.8);
  mesh(g, roof, toon('#b5563a'), { p: [0, 2.6, 0], outline: true });
  mesh(g, new THREE.CylinderGeometry(0.1, 0.1, 2, 8), toon('#6b4a2b'), { p: [0, 2.3, 0], r: [0, 0, Math.PI / 2] });
  return g;
}

function lighthouse(anim) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) mesh(g, new THREE.CylinderGeometry(1.35 - i * 0.18, 1.5 - i * 0.18, 2.2, 14), toon(i % 2 ? '#d6334a' : '#fffaf0'), { p: [0, 1.1 + i * 2.2, 0], outline: true });
  mesh(g, new THREE.CylinderGeometry(0.95, 0.95, 1.1, 12), toon('#fff6c9', { emissive: '#ffd27a', emissiveIntensity: 0.8 }), { p: [0, 9.4, 0], cast: false });
  mesh(g, new THREE.ConeGeometry(1.2, 1.2, 12), toon('#2b2f4a'), { p: [0, 10.55, 0] });
  const beam = new THREE.Sprite(additive(glowTexture, 0xffe8a0, 0.6));
  beam.scale.set(4, 4, 1);
  beam.position.y = 9.4;
  g.add(beam);
  anim.push((t) => { beam.material.opacity = 0.35 + Math.max(0, Math.sin(t * 1.4)) * 0.5; });
  return g;
}

function signpost() {
  const g = new THREE.Group();
  mesh(g, new THREE.CylinderGeometry(0.1, 0.12, 3.2, 8), toon('#6b4a2b'), { p: [0, 1.6, 0] });
  const signs = [['Casino', 0.2, '#ff5d73'], ['Lake', 2.9, '#39c6ff'], ['Arena', 0.9, '#ff9f43'], ['Cave', -2.4, '#7c6bff']];
  signs.forEach(([label, ang, color], i) => {
    const tex = canvasTexture(256, 64, (c) => {
      c.fillStyle = '#e6cf9f'; c.fillRect(0, 0, 256, 64);
      c.fillStyle = color; c.fillRect(0, 0, 18, 64);
      c.font = '700 38px Rubik, sans-serif'; c.fillStyle = '#3a2410'; c.textBaseline = 'middle'; c.fillText(label, 30, 34);
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.08), [toon('#c9955a'), toon('#c9955a'), toon('#c9955a'), toon('#c9955a'), new THREE.MeshToonMaterial({ map: tex }), new THREE.MeshToonMaterial({ map: tex })]);
    const arm = new THREE.Group();
    arm.rotation.y = ang;
    board.position.set(0.8, 2.9 - i * 0.45, 0);
    board.castShadow = true;
    arm.add(board);
    g.add(arm);
  });
  return g;
}

/** Everything in the town apart from buildings, trees and lamps. */
export function buildTown(scene, layout, anim, waterMat) {
  const group = new THREE.Group();
  scene.add(group);
  for (const c of M.COTTAGES) group.add(cottage(c));
  for (const s of M.STALLS) group.add(stall(s));
  const place = (obj, { x, y }, ry = 0) => { const p = p3(x, y); obj.position.set(p.x, p.y, p.z); obj.rotation.y = ry; group.add(obj); return obj; };
  place(windmill(anim), M.LANDMARKS.windmill, 0.6);
  place(gazebo(), M.LANDMARKS.gazebo);
  place(well(), M.LANDMARKS.well, 0.4);
  place(lighthouse(anim), M.LANDMARKS.lighthouse);
  place(signpost(), { x: M.CENTER.x + 150, y: M.CENTER.y - 150 }, 0);

  // the creek: a ribbon of water hugging the ground, with little wooden bridges where streets cross it
  const pts = M.CREEK;
  const pos = [], idx = [];
  pts.forEach((q, i) => {
    const n = pts[Math.min(pts.length - 1, i + 1)], pr = pts[Math.max(0, i - 1)];
    const dx = n.x - pr.x, dy = n.y - pr.y, l = Math.hypot(dx, dy) || 1;
    for (const s of [-1, 1]) {
      const x = q.x - (dy / l) * 14 * s, y = q.y + (dx / l) * 14 * s;
      const p = p3(x, y);
      pos.push(p.x, p.y + 0.07, p.z);
    }
    if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const creekGeo = new THREE.BufferGeometry();
  creekGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  creekGeo.setIndex(idx);
  creekGeo.computeVertexNormals();
  const creek = new THREE.Mesh(creekGeo, waterMat);
  group.add(creek);
  const plank = toon('#a0703f'), rail = toon('#6b4226');
  for (const road of M.PATHS) {
    let lastCross = -99;
    road.pts.forEach((q, i) => {
      if (i - lastCross < 6 || !M.nearCreek(q, 12)) return;
      lastCross = i;
      const n = road.pts[Math.min(road.pts.length - 1, i + 1)];
      const ang = Math.atan2(n.x - q.x, n.y - q.y);
      const b = new THREE.Group();
      mesh(b, new THREE.BoxGeometry(2.4 * road.w + 0.6, 0.18, 3.4), plank, { p: [0, 0.3, 0] });
      for (const s of [-1, 1]) {
        mesh(b, new THREE.BoxGeometry(0.12, 0.1, 3.4), rail, { p: [s * (1.2 * road.w + 0.3), 1.0, 0] });
        for (const z of [-1.5, 0, 1.5]) mesh(b, new THREE.BoxGeometry(0.12, 0.8, 0.12), rail, { p: [s * (1.2 * road.w + 0.3), 0.65, z] });
      }
      place(b, q, ang);
    });
  }
  // cottage windows glow in the evening
  const windows = [];
  group.traverse((o) => { if (o.userData.window) windows.push(o.material); });
  return { group, windows: [...new Set(windows)] };
}
