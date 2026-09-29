// Everything static (or ambiently animated) in the 3D world.
import * as THREE from 'three';
import { TAU, toon, basic, shiny, canvasTexture, additive, glowTexture, puffTexture, outlineMaterial } from './materials.js';
import { buildBuilding } from './buildings.js';
import { buildLamps, buildFences, buildTown } from './town.js';
import * as M from '../map.js';

const U = (px) => px / M.PX;
const pos3 = (x, y) => M.to3(x, y);
/** Ground height under a 3D point. */
export const groundAt = (x, z) => M.heightAt(x * M.PX + M.CENTER.x, z * M.PX + M.CENTER.y);
const HALF_W = M.W / M.PX / 2, HALF_H = M.H / M.PX / 2;

/** Merge geometries (with transforms and a flat color each) into one non-indexed geometry with vertex colors. */
function merge(parts) {
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  for (const { geo, matrix, color } of parts) {
    const g0 = geo.clone().applyMatrix4(matrix);
    const g = g0.index ? g0.toNonIndexed() : g0;
    g.computeVertexNormals();
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    c.set(color ?? '#ffffff');
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
/** Flat-shaded (faceted) copy of a geometry for the low-poly look. */
export function faceted(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}
const T = (x, y, z, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

/** Wind sway for foliage: bends vertices above `from` height using a shared time uniform. */
function withWind(shared, wind, strength = 0.06, from = 1.2) {
  const material = shared.clone(); // never patch the cached, shared material
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float h = max(0.0, position.y - ${from.toFixed(2)});
      transformed.x += sin(uWind * 1.7 + ip.x * 0.35 + ip.z * 0.2) * ${strength.toFixed(3)} * h;
      transformed.z += cos(uWind * 1.3 + ip.z * 0.3) * ${(strength * 0.6).toFixed(3)} * h;`,
    );
  };
  material.customProgramCacheKey = () => `wind${strength}${from}`;
  return material;
}

function instanced(geo, material, list, { cast = true, colorOf = null } = {}) {
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  list.forEach((it, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot ?? 0);
    m.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), q, new THREE.Vector3(it.s, it.sy ?? it.s, it.s));
    mesh.setMatrixAt(i, m);
    if (colorOf) mesh.setColorAt(i, c.set(colorOf(it, i)));
  });
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------

export function buildEnvironment(scene) {
  const anim = [];
  const wind = { value: 0 };
  const rnd = M.seeded(99);
  const layout = M.buildLayout();
  const textTextures = [];
  const ctx = {
    puff: puffTexture,
    // text textures are redrawn once web fonts finish loading
    text(w, h, draw) {
      const tex = canvasTexture(w, h, draw);
      textTextures.push({ tex, draw });
      return tex;
    },
  };

  // ---- sky, fog, light -------------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(760, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#2f6fd6') }, mid: { value: new THREE.Color('#7fb7f5') }, bottom: { value: new THREE.Color('#d9ecff') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.8, h)) : mix(bottom, mid, smoothstep(-0.05, 0.15, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        }`,
    }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog('#cfe4fb', 120, 380);
  const sunGlow = new THREE.Sprite(additive(glowTexture, 0xfff2c0, 0.9));
  sunGlow.scale.setScalar(70);
  sunGlow.position.set(260, 220, 360);
  scene.add(sunGlow);

  // ---- ground ------------------------------------------------------------------
  const groundCanvas = M.renderGround();
  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 8;
  const groundGeo = new THREE.PlaneGeometry(HALF_W * 2, HALF_H * 2, Math.round(HALF_W * 2), Math.round(HALF_H * 2));
  const gp = groundGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setZ(i, groundAt(gp.getX(i), -gp.getY(i))); // plane z becomes height once it's laid flat
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grassTex = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#5fae55';
    c.fillRect(0, 0, 256, 256);
    const r = M.seeded(5);
    for (let i = 0; i < 600; i++) {
      c.fillStyle = r() < 0.5 ? 'rgba(35,95,45,.25)' : 'rgba(190,240,150,.22)';
      c.fillRect(r() * 256, r() * 256, 2, 5);
    }
  }, { repeat: [220, 220] });
  // the meadow beyond the map: a big sheet with the map cut out of it, so it never covers dips in the
  // terrain (like the creek's channel)
  const outerShape = new THREE.Shape([new THREE.Vector2(-800, -800), new THREE.Vector2(800, -800), new THREE.Vector2(800, 800), new THREE.Vector2(-800, 800)]);
  outerShape.holes.push(new THREE.Path([new THREE.Vector2(-HALF_W, -HALF_H), new THREE.Vector2(-HALF_W, HALF_H), new THREE.Vector2(HALF_W, HALF_H), new THREE.Vector2(HALF_W, -HALF_H)]));
  const outerGeo = new THREE.ShapeGeometry(outerShape);
  const ouv = outerGeo.attributes.uv;
  for (let i = 0; i < ouv.count; i++) ouv.setXY(i, (ouv.getX(i) + 800) / 1600, (ouv.getY(i) + 800) / 1600);
  const outer = new THREE.Mesh(outerGeo, new THREE.MeshLambertMaterial({ map: grassTex }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  outer.receiveShadow = true;
  scene.add(outer);

  // rolling hills and far mountains outside the playable area
  const hillMat = toon('#58a553');
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + rnd() * 0.2;
    const r = 22 + rnd() * 26;
    // outside the fence all the way round: walk out along the angle until the hill clears the map
    const out = 12 + rnd() * 40;
    let k = 1;
    const cx = Math.cos(a), cz = Math.sin(a);
    while (Math.abs(cx * k) < HALF_W + r * 1.4 * 0.62 + out && Math.abs(cz * k) < HALF_H + r * 0.62 + out) k += 2;
    const hill = new THREE.Mesh(faceted(new THREE.IcosahedronGeometry(r, 2)), hillMat);
    hill.position.set(cx * k, -r * 0.62, cz * k);
    hill.scale.set(1.4, 0.8 + rnd() * 0.4, 1);
    hill.receiveShadow = true;
    scene.add(hill);
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rnd() * 0.3;
    const dist = 330 + rnd() * 70;
    const h = 60 + rnd() * 55;
    const mtn = new THREE.Mesh(faceted(new THREE.ConeGeometry(h * 0.9, h, 7)), toon('#7e93b8'));
    mtn.position.set(Math.cos(a) * dist, h / 2 - 6, Math.sin(a) * dist);
    scene.add(mtn);
    const cap = new THREE.Mesh(faceted(new THREE.ConeGeometry(h * 0.27, h * 0.3, 7)), toon('#f4f8ff'));
    cap.position.set(mtn.position.x, h - 6 - h * 0.15 + 0.2, mtn.position.z);
    scene.add(cap);
  }

  // ---- fence around the playable area --------------------------------------------
  const fenceMat = toon('#9c6a3c');
  const posts = [], rails = [];
  const fx = HALF_W - 0.6, fz = HALF_H - 0.6;
  // leave the north fence open behind the Boss Cave so it doesn't cut across the cave hill
  const cave = M.SPOTS.find((s) => s.kind === 'cave');
  const gap = { from: U(cave.x - 900) - 3, to: U(cave.x + cave.w - 900) + 3 };
  const inGap = (x) => x > gap.from && x < gap.to;
  for (let x = -fx; x <= fx + 0.01; x += 2.5) {
    posts.push({ x, z: fz });
    if (!inGap(x)) posts.push({ x, z: -fz });
  }
  posts.push({ x: gap.from, z: -fz }, { x: gap.to, z: -fz });
  for (let z = -fz + 2.5; z < fz; z += 2.5) { posts.push({ x: -fx, z }, { x: fx, z }); }
  scene.add(instanced(new THREE.BoxGeometry(0.22, 1.3, 0.22), fenceMat, posts.map((p) => ({ ...p, y: 0.65, s: 1 }))));
  const northLeft = gap.from + fx, northRight = fx - gap.to;
  for (const y of [0.55, 1.0]) {
    for (const [x, z, w, d] of [
      [-fx + northLeft / 2, -fz, northLeft, 0.1], [gap.to + northRight / 2, -fz, northRight, 0.1],
      [0, fz, fx * 2, 0.1], [-fx, 0, 0.1, fz * 2], [fx, 0, 0.1, fz * 2],
    ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), fenceMat);
      rail.position.set(x, y, z);
      rail.castShadow = true;
      rails.push(rail);
      scene.add(rail);
    }
  }

  // ---- trees, bushes, grass, flowers, rocks ------------------------------------------
  const oakTrunk = new THREE.CylinderGeometry(0.2, 0.3, 2.6, 8);
  oakTrunk.translate(0, 1.3, 0);
  const oakCanopy = merge([
    [0, 3.3, 0, 1.45], [0.95, 2.9, 0.25, 1.05], [-0.9, 3.0, -0.3, 1.1], [0.15, 4.1, -0.1, 0.95], [0.3, 2.8, 0.85, 0.85], [-0.4, 2.7, 0.7, 0.8],
  ].map(([x, y, z, r], i) => ({ geo: new THREE.IcosahedronGeometry(r, 1), matrix: T(x, y, z), color: i === 3 ? '#e8ffe0' : '#ffffff' })));
  const pineTrunk = new THREE.CylinderGeometry(0.18, 0.26, 1.8, 8);
  pineTrunk.translate(0, 0.9, 0);
  const pineCanopy = merge([[1.55, 2.3, 2.3], [1.2, 2.0, 3.4], [0.82, 1.7, 4.4], [0.45, 1.2, 5.2]].map(([r, h, y]) => ({ geo: new THREE.ConeGeometry(r, h, 8), matrix: T(0, y, 0) })));
  const bushGeo = merge([[0, 0.55, 0, 0.75], [0.6, 0.45, 0.2, 0.6], [-0.55, 0.45, -0.1, 0.62], [0.1, 0.9, -0.1, 0.5]].map(([x, y, z, r]) => ({ geo: new THREE.IcosahedronGeometry(r, 1), matrix: T(x, y, z) })));

  const oaks = [], pines = [], bushes = [];
  const place = (t) => {
    const p = pos3(t.x, t.y);
    const item = { x: p.x, y: M.heightAt(t.x, t.y), z: p.z, rot: rnd() * TAU, v: t.v };
    if (t.kind === 'pine') pines.push({ ...item, s: t.size / 34 * 1.1 });
    else if (t.kind === 'bush') bushes.push({ ...item, s: t.size / 16 * 0.85 });
    else oaks.push({ ...item, s: t.size / 28 * 1.1 });
  };
  layout.trees.forEach(place);
  layout.border.forEach(place);
  // forest outside the fence
  for (let i = 0; i < 1300; i++) {
    const x = (rnd() - 0.5) * 360, z = (rnd() - 0.5) * 260;
    if (Math.abs(x) < HALF_W + 2 && Math.abs(z) < HALF_H + 2) continue;
    const kind = rnd() < 0.55 ? 'pine' : 'oak';
    (kind === 'pine' ? pines : oaks).push({ x, z, rot: rnd() * TAU, s: 1 + rnd() * 0.7, v: Math.floor(rnd() * 3) });
  }
  const leafGreens = ['#3f9a47', '#4fa843', '#2f8a4a', '#5cb05a'];
  const pineGreens = ['#23744a', '#2a7f45', '#1f6b43'];
  const barkMat = toon('#6b4a2b');
  const leafMat = withWind(toon('#ffffff', { vertexColors: true }), wind, 0.05, 1.8);
  const pineMat = withWind(toon('#ffffff', { vertexColors: true }), wind, 0.035, 1.5);
  const bushMat = withWind(toon('#ffffff', { vertexColors: true }), wind, 0.05, 0.3);
  scene.add(instanced(oakTrunk, barkMat, oaks));
  scene.add(instanced(oakCanopy, leafMat, oaks, { colorOf: (t, i) => leafGreens[(t.v + i) % leafGreens.length] }));
  scene.add(instanced(pineTrunk, barkMat, pines));
  scene.add(instanced(pineCanopy, pineMat, pines, { colorOf: (t, i) => pineGreens[(t.v + i) % pineGreens.length] }));
  scene.add(instanced(bushGeo, bushMat, bushes, { colorOf: (t, i) => ['#357f3c', '#43954a', '#3c8c43'][i % 3] }));
  // berries/flowers on bushes
  const berries = [];
  bushes.forEach((b, i) => { for (let k = 0; k < 5; k++) berries.push({ x: b.x + (rnd() - 0.5) * 1.4 * b.s, y: b.y + (0.5 + rnd() * 0.6) * b.s, z: b.z + (rnd() - 0.5) * 1.2 * b.s, s: 1, v: i }); });
  scene.add(instanced(new THREE.SphereGeometry(0.08, 6, 4), toon('#ffffff'), berries, { cast: false, colorOf: (t) => (t.v % 2 ? '#ff5d73' : '#fff6b0') }));

  // grass tufts
  const bladeGeo = (() => {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.ConeGeometry(0.05, 0.45 + i * 0.1, 3);
      g.translate(0, (0.45 + i * 0.1) / 2, 0);
      parts.push({ geo: g, matrix: new THREE.Matrix4().makeRotationZ((i - 1) * 0.35).setPosition((i - 1) * 0.06, 0, 0) });
    }
    return merge(parts);
  })();
  const tufts = [];
  for (let i = 0; i < 60000 && tufts.length < 17000; i++) {
    const px = 30 + rnd() * (M.W - 60), py = 30 + rnd() * (M.H - 60);
    if (!M.openGround({ x: px, y: py }, 0)) continue;
    const p = pos3(px, py);
    tufts.push({ x: p.x, y: M.heightAt(px, py), z: p.z, rot: rnd() * TAU, s: 0.7 + rnd() * 0.7 });
  }
  for (let i = 0; i < 3000; i++) {
    const x = (rnd() - 0.5) * 260, z = (rnd() - 0.5) * 190;
    if (Math.abs(x) < HALF_W && Math.abs(z) < HALF_H) continue;
    tufts.push({ x, z, rot: rnd() * TAU, s: 0.8 + rnd() * 0.8 });
  }
  const grassMat = withWind(toon('#ffffff', { vertexColors: true }), wind, 0.3, 0.05);
  scene.add(instanced(bladeGeo, grassMat, tufts, { cast: false, colorOf: (t, i) => ['#4f9e47', '#63b35a', '#78c46a', '#468f40'][i % 4] }));

  // 3D flowers
  const flowers = [];
  for (let i = 0; i < 30000 && flowers.length < 2200; i++) {
    const px = 40 + rnd() * (M.W - 80), py = 40 + rnd() * (M.H - 80);
    if (!M.openGround({ x: px, y: py }, 0)) continue;
    const p = pos3(px, py);
    const cluster = 2 + Math.floor(rnd() * 4);
    const col = ['#ff9fb4', '#fff6b0', '#ffffff', '#e57bff', '#ffb13b', '#9fd8ff'][Math.floor(rnd() * 6)];
    const gy = M.heightAt(px, py);
    for (let k = 0; k < cluster; k++) flowers.push({ x: p.x + (rnd() - 0.5) * 0.8, z: p.z + (rnd() - 0.5) * 0.8, y: gy + 0.28 + rnd() * 0.1, g: gy, s: 1, c: col });
  }
  scene.add(instanced(new THREE.IcosahedronGeometry(0.1, 0), toon('#ffffff'), flowers, { cast: false, colorOf: (t) => t.c }));
  const stems = flowers.map((f) => ({ ...f, y: f.g + 0.14, s: 1 }));
  scene.add(instanced(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 4), toon('#3f8f3a'), stems, { cast: false }));

  const rocks = [];
  for (let i = 0; i < 4000 && rocks.length < 320; i++) {
    const px = 40 + rnd() * (M.W - 80), py = 40 + rnd() * (M.H - 80);
    if (!M.openGround({ x: px, y: py }, 10)) continue;
    const p = pos3(px, py);
    rocks.push({ x: p.x, z: p.z, y: M.heightAt(px, py) + 0.1, s: 0.25 + rnd() * 0.45 + (M.heightAt(px, py) > 2 ? 0.5 : 0), sy: 0.18 + rnd() * 0.3, rot: rnd() * TAU });
  }
  scene.add(instanced(new THREE.DodecahedronGeometry(1, 0), toon('#a4a1b5'), rocks));

  // ---- plaza props -----------------------------------------------------------------
  const c0 = { x: 0, z: 0 };
  const fountain = new THREE.Group();
  const basin = new THREE.LatheGeometry([[0, 0], [2.35, 0], [2.45, 0.2], [2.45, 0.75], [2.2, 0.78], [2.1, 0.35], [0, 0.35]].map(([x, y]) => new THREE.Vector2(x, y)), 48);
  const stone = toon('#b8bdd2');
  const basinMesh = new THREE.Mesh(basin, stone);
  basinMesh.castShadow = basinMesh.receiveShadow = true;
  basinMesh.add(new THREE.Mesh(basin, outlineMaterial(0.04)));
  fountain.add(basinMesh);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.9, 16), stone);
  pillar.position.y = 1.1;
  pillar.castShadow = true;
  fountain.add(pillar);
  const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.9, 0.2], [1.05, 0.45], [0.95, 0.5], [0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)), 32), stone);
  bowl.position.y = 1.95;
  bowl.castShadow = true;
  fountain.add(bowl);

  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { t: { value: 0 }, deep: { value: new THREE.Color('#1f63b8') }, shallow: { value: new THREE.Color('#58b4ff') } },
    vertexShader: 'varying vec2 vP; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: `uniform float t; uniform vec3 deep; uniform vec3 shallow; varying vec2 vP;
      float wave(vec2 p){ return sin(p.x*1.7+t*1.3)*0.5 + sin(p.y*2.3-t*1.1)*0.5 + sin((p.x+p.y)*1.1+t*0.7)*0.5; }
      void main(){
        float w = wave(vP); float w2 = wave(vP*2.7+3.1);
        vec3 col = mix(deep, shallow, 0.42 + 0.14*w);
        col += smoothstep(1.2, 1.5, w + w2*0.6) * 0.65;
        col += smoothstep(0.9, 1.0, sin(w*5.0 + t)) * 0.05;
        gl_FragColor = vec4(col, 0.9);
        #include <colorspace_fragment>
      }`,
  });
  anim.push((t) => { waterMat.uniforms.t.value = t; });
  const fWater = new THREE.Mesh(new THREE.CircleGeometry(2.15, 40), waterMat);
  fWater.rotation.x = -Math.PI / 2;
  fWater.position.y = 0.62;
  fountain.add(fWater);
  const topWater = new THREE.Mesh(new THREE.CircleGeometry(0.92, 24), waterMat);
  topWater.rotation.x = -Math.PI / 2;
  topWater.position.y = 2.38;
  fountain.add(topWater);
  // spray particles + ripples
  const dropMat = new THREE.SpriteMaterial({ map: glowTexture, color: 0xcfeaff, transparent: true, depthWrite: false });
  const drops = Array.from({ length: 70 }, (_, i) => {
    const s = new THREE.Sprite(dropMat);
    s.scale.setScalar(0.18);
    s.userData = { a: (i / 70) * TAU, off: i / 70 };
    fountain.add(s);
    return s;
  });
  const ripples = [0, 1, 2].map(() => {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 40), basic('#ffffff', { transparent: true, opacity: 0.5, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.64;
    fountain.add(r);
    return r;
  });
  anim.push((t) => {
    drops.forEach((d) => {
      const p = (t * 0.8 + d.userData.off) % 1;
      const a = d.userData.a;
      const rad = 0.25 + p * 1.6;
      d.position.set(Math.cos(a) * rad, 2.6 + Math.sin(p * Math.PI) * 1.3 - p * 2.0, Math.sin(a) * rad);
      d.material.opacity = 0.9;
    });
    ripples.forEach((r, i) => {
      const p = (t * 0.45 + i / 3) % 1;
      r.scale.setScalar(0.6 + p * 1.4);
      r.material.opacity = 0.5 * (1 - p);
    });
  });
  fountain.position.set(c0.x, 0, c0.z);
  scene.add(fountain);

  // street lamps + fences
  const lit = buildLamps(scene, layout.lamps);
  buildFences(scene, layout.fences);
  // benches (you can sit on them)
  for (const b of layout.benches) {
    const p = pos3(b.x, b.y);
    const bench = new THREE.Group();
    const wood = toon('#b07a45'), iron = toon('#2b2f4a');
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.6), wood);
    seat.position.y = 0.55;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.1), wood);
    back.position.set(0, 0.95, -0.28);
    bench.add(seat, back);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.55), iron);
      leg.position.set(s * 0.95, 0.27, 0);
      bench.add(leg);
    }
    bench.traverse((o) => { o.castShadow = true; });
    bench.position.set(p.x, M.heightAt(b.x, b.y), p.z);
    bench.rotation.y = b.h;
    scene.add(bench);
  }
  // archery targets outside the range
  const targetTex = canvasTexture(128, 128, (c) => {
    ['#f4f4f4', '#f4f4f4', '#2a2a2a', '#2a2a2a', '#3aa0ff', '#3aa0ff', '#ff4d4d', '#ff4d4d', '#ffd84d', '#ffd84d'].forEach((col, i) => {
      c.fillStyle = col;
      c.beginPath(); c.arc(64, 64, 62 - i * 6, 0, TAU); c.fill();
    });
  });
  for (const tg of layout.targets) {
    const p = pos3(tg.x, tg.y);
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.25, 32), [toon('#e8c96a'), new THREE.MeshBasicMaterial({ map: targetTex }), toon('#e8c96a')]);
    face.rotation.x = Math.PI / 2 - 0.2;
    face.position.y = 1.6;
    face.castShadow = true;
    g.add(face);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), toon('#7a4a28'));
      leg.position.set(s * 0.5, 0.9, -0.2);
      leg.rotation.z = s * 0.15;
      g.add(leg);
    }
    g.position.set(p.x, M.heightAt(tg.x, tg.y), p.z);
    g.rotation.y = Math.PI / 2 + 0.3;
    scene.add(g);
  }

  // ---- the pond --------------------------------------------------------------------
  const pond = M.SPOTS.find((s) => s.kind === 'pond');
  const pa = pos3(pond.x, pond.y), pb = pos3(pond.x + pond.w, pond.y + pond.h);
  const r = U(150);
  const shape = new THREE.Shape();
  const [x0, x1, y0, y1] = [pa.x, pb.x, -pb.z, -pa.z];
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x1 - r, y0); shape.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x1, y1 - r); shape.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x0 + r, y1); shape.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x0, y0 + r); shape.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  const pondWater = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), waterMat);
  pondWater.rotation.x = -Math.PI / 2;
  pondWater.position.y = 0.08;
  scene.add(pondWater);
  const dockX = (pa.x + pb.x) / 2;
  const dock = new THREE.Group();
  const plank = toon('#a0703f');
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.5), i % 2 ? plank : toon('#94663a'));
    p.position.set(0, 0.42, -1.6 + i * 0.52);
    p.castShadow = p.receiveShadow = true;
    dock.add(p);
  }
  for (const [x, z] of [[-1.1, 0], [1.1, 0], [-1.1, 3], [1.1, 3], [-1.1, 4.3], [1.1, 4.3]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8), toon('#6b4226'));
    post.position.set(x, 0.3, z);
    dock.add(post);
  }
  dock.position.set(dockX, 0, pa.z);
  scene.add(dock);
  const pads = [];
  for (let i = 0; i < 14; i++) {
    const x = pa.x + 2 + rnd() * (pb.x - pa.x - 4), z = pa.z + 2 + rnd() * (pb.z - pa.z - 4);
    if (Math.abs(x - dockX) < 2.5 && z < pa.z + 6) continue;
    pads.push({ x, z, y: 0.1, s: 0.5 + rnd() * 0.5, rot: rnd() * TAU });
  }
  const padGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.04, 16, 1, false, 0.4, TAU - 0.4);
  scene.add(instanced(padGeo, toon('#3f9a47'), pads, { cast: false }));
  scene.add(instanced(new THREE.SphereGeometry(0.16, 8, 6), toon('#ff9fb4'), pads.filter((_, i) => i % 2).map((p) => ({ ...p, y: 0.2, s: 1 })), { cast: false }));
  const reeds = [];
  // clumps along the shoreline (the shape is in x/-z)
  const cz0 = (pa.z + pb.z) / 2;
  for (const q of shape.getSpacedPoints(160)) {
    const x = q.x, z = -q.y;
    if (Math.abs(x - dockX) < 3 && z < cz0) continue;
    if (rnd() < 0.35) continue;
    reeds.push({ x: x + (rnd() - 0.5) * 0.8, z: z + (rnd() - 0.5) * 0.8, s: 0.8 + rnd() * 0.6, rot: rnd() * TAU });
  }
  const reedGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.4, 5);
  reedGeo.translate(0, 0.7, 0);
  scene.add(instanced(reedGeo, withWind(toon('#3b7f3a'), wind, 0.12, 0.2), reeds, { cast: false }));
  const catGeo = new THREE.CapsuleGeometry(0.07, 0.22, 3, 6);
  catGeo.translate(0, 1.45, 0);
  scene.add(instanced(catGeo, withWind(toon('#7a4a28'), wind, 0.12, 0.2), reeds.filter((_, i) => i % 2), { cast: false }));

  // ---- buildings ---------------------------------------------------------------------
  const buildings = [];
  for (const s of M.SPOTS) {
    if (s.kind === 'pond') continue;
    const b = buildBuilding(s, anim, ctx);
    scene.add(b);
    buildings.push(b);
  }

  // ---- the rest of the town: cottages, stalls, landmarks, the creek and its bridges
  const town = buildTown(scene, layout, anim, waterMat);

  // ---- clouds + butterflies ------------------------------------------------------------
  const cloudMat = toon('#ffffff');
  const clouds = [];
  for (let i = 0; i < 28; i++) {
    const parts = [];
    const n = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) parts.push({ geo: new THREE.IcosahedronGeometry(1.4 + rnd() * 1.4, 2), matrix: T((k - n / 2) * 1.6, rnd() * 0.8, (rnd() - 0.5) * 1.6) });
    const cloud = new THREE.Mesh(merge(parts), cloudMat);
    cloud.position.set((rnd() - 0.5) * 400, 26 + rnd() * 14, (rnd() - 0.5) * 280);
    cloud.scale.setScalar(1.2 + rnd() * 1.4);
    cloud.castShadow = true;
    cloud.userData.speed = 1 + rnd() * 1.5;
    scene.add(cloud);
    clouds.push(cloud);
  }
  const butterflies = [];
  for (let i = 0; i < 30; i++) {
    const b = new THREE.Group();
    const col = ['#ff9fb4', '#ffd84d', '#9fd8ff', '#e57bff'][i % 4];
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), toon(col, { side: THREE.DoubleSide }));
      w.position.x = s * 0.14;
      w.scale.set(1, 1.3, 1);
      const pivot = new THREE.Group();
      pivot.add(w);
      b.add(pivot);
      return pivot;
    });
    const p = pos3(200 + rnd() * (M.W - 400), 200 + rnd() * (M.H - 400));
    b.position.set(p.x, 1.5, p.z);
    b.userData = { wings, target: b.position.clone(), vel: new THREE.Vector3(), phase: rnd() * 6 };
    scene.add(b);
    butterflies.push(b);
  }

  function update(dt, t) {
    wind.value = t;
    for (const fn of anim) fn(t, dt);
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 210) c.position.x = -210;
    }
    for (const b of butterflies) {
      const u = b.userData;
      if (b.position.distanceTo(u.target) < 0.5) {
        u.target.set(
          Math.max(-HALF_W + 4, Math.min(HALF_W - 4, b.position.x + (Math.random() - 0.5) * 14)),
          0.8 + Math.random() * 2.2,
          Math.max(-HALF_H + 4, Math.min(HALF_H - 4, b.position.z + (Math.random() - 0.5) * 14)),
        );
      }
      const dir = u.target.clone().sub(b.position);
      u.vel.lerp(dir.normalize().multiplyScalar(2.2), Math.min(1, dt * 2));
      b.position.addScaledVector(u.vel, dt);
      b.position.y += Math.sin(t * 6 + u.phase) * 0.01;
      b.rotation.y = Math.atan2(u.vel.x, u.vel.z);
      const ground = groundAt(b.position.x, b.position.z);
      if (b.position.y < ground + 0.6) b.position.y = ground + 0.6;
      if (u.target.y < ground + 0.8) u.target.y = ground + 0.8 + Math.random() * 1.5;
      const flap = Math.sin(t * 22 + u.phase) * 0.9;
      u.wings[0].rotation.z = -0.3 - flap;
      u.wings[1].rotation.z = 0.3 + flap;
    }
  }

  function redrawText() {
    for (const { tex, draw } of textTextures) {
      const c = tex.image;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      draw(g, c.width, c.height);
      tex.needsUpdate = true;
    }
  }

  return { update, groundCanvas, buildings, ground, redrawText, sky, sunGlow, lit, windows: town.windows };
}
