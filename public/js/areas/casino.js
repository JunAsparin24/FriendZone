// The casino floor: walk around with everyone else in the casino and step up to a machine to play.
// Slots line the left wall, the prize wheel hangs on the right, the coin-flip and blackjack tables are
// by the door and the shared roulette table (with a real spinning 3D wheel) sits in the middle.
import * as THREE from 'three';
import { net } from '../net.js';
import { toon, shiny, basic, canvasTexture, additive, glowTexture, outlineMaterial, TAU } from '../three/materials.js';
import { Character } from '../three/character.js';
import { casino } from '../games/casino.js';
import { ROULETTE_ORDER, roulettePocketColor } from '../games/roulette.js';
import { sfx } from '../sfx.js';

const RW = 28, RD = 22, WALL_H = 5.5;
const OUT = outlineMaterial(0.03);
const SEG = TAU / ROULETTE_ORDER.length;

function add(parent, geo, mat, { p = [0, 0, 0], r = null, s = null, outline = false, cast = true } = {}) {
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

const carpetTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#8f1530';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 4;
  for (let i = -256; i < 512; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 256, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i + 256, 0); ctx.lineTo(i, 256); ctx.stroke();
  }
  ctx.fillStyle = '#ffd84d';
  for (let x = 0; x <= 256; x += 64) for (let y = 0; y <= 256; y += 64) { ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  for (let x = 32; x < 256; x += 64) for (let y = 32; y < 256; y += 64) { ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill(); }
}, { repeat: [7, 5.5] });

const wallTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#4a2475';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#56308a';
  for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 32, 256);
  ctx.fillStyle = 'rgba(255,215,90,.25)';
  for (let x = 16; x < 256; x += 64) for (let y = 16; y < 256; y += 48) {
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 6, y); ctx.fill();
  }
}, { repeat: [6, 1.5] });

const slotScreenTex = canvasTexture(192, 96, (ctx) => {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 192, 96);
  ctx.font = '52px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['🍒', '7️⃣', '💎'].forEach((s, i) => ctx.fillText(s, 32 + i * 64, 52));
  ctx.fillStyle = 'rgba(224,70,60,.8)';
  ctx.fillRect(0, 46, 192, 4);
});

const feltTex = canvasTexture(512, 256, (ctx) => {
  ctx.fillStyle = '#1f7a47';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 3;
  const x0 = 170, y0 = 40, cw = 26, ch = 40;
  for (let c = 0; c < 12; c++) for (let r = 0; r < 3; r++) {
    const n = (c + 1) * 3 - r;
    ctx.fillStyle = roulettePocketColor(n);
    ctx.fillRect(x0 + c * cw, y0 + r * ch, cw, ch);
    ctx.strokeRect(x0 + c * cw, y0 + r * ch, cw, ch);
    ctx.fillStyle = '#fff';
    ctx.font = '700 12px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(n), x0 + c * cw + cw / 2, y0 + r * ch + 25);
  }
  ctx.fillStyle = '#2f9e44';
  ctx.fillRect(x0 - 30, y0, 30, ch * 3);
  ctx.strokeRect(x0 - 30, y0, 30, ch * 3);
  ctx.fillStyle = '#fff';
  ctx.fillText('0', x0 - 15, y0 + ch * 1.5 + 5);
  ['1st 12', '2nd 12', '3rd 12'].forEach((t, i) => {
    ctx.strokeRect(x0 + i * cw * 4, y0 + ch * 3, cw * 4, 30);
    ctx.fillText(t, x0 + i * cw * 4 + cw * 2, y0 + ch * 3 + 20);
  });
});

function wheelFaceTex() {
  return canvasTexture(512, 512, (ctx) => {
    ctx.translate(256, 256);
    ctx.fillStyle = '#5a3a1c';
    ctx.beginPath(); ctx.arc(0, 0, 256, 0, TAU); ctx.fill();
    ROULETTE_ORDER.forEach((n, i) => {
      const a0 = -Math.PI / 2 + i * SEG;
      ctx.fillStyle = roulettePocketColor(n);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 236, a0, a0 + SEG); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.rotate(a0 + SEG / 2);
      ctx.translate(210, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = '700 22px Rubik, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(n), 0, 8);
      ctx.restore();
    });
    const g = ctx.createRadialGradient(-30, -30, 10, 0, 0, 140);
    g.addColorStop(0, '#d9a060');
    g.addColorStop(1, '#6b4424');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 140, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffd84d';
    ctx.lineWidth = 8;
    ctx.stroke();
  });
}

const prizeTex = canvasTexture(512, 512, (ctx) => {
  const WHEEL = [0, 1.5, 0, 2, 0, 0.5, 0, 2, 0, 1.5, 0, 0.5, 0, 2, 0, 5];
  const COL = { 0: '#2b2f4a', 0.5: '#6b7194', 1.5: '#39c6ff', 2: '#6ee7a0', 5: '#ffc53d' };
  const seg = TAU / WHEEL.length;
  ctx.translate(256, 256);
  ctx.fillStyle = '#ffc53d';
  ctx.beginPath(); ctx.arc(0, 0, 256, 0, TAU); ctx.fill();
  WHEEL.forEach((m, i) => {
    const a0 = -Math.PI / 2 + i * seg;
    ctx.fillStyle = COL[m];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 232, a0, a0 + seg); ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.rotate(a0 + seg / 2);
    ctx.fillStyle = m === 5 ? '#3a2a00' : '#fff';
    ctx.font = '900 34px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m ? `×${m}` : '✖', 170, 12);
    ctx.restore();
  });
  ctx.fillStyle = '#1a3d85';
  ctx.beginPath(); ctx.arc(0, 0, 50, 0, TAU); ctx.fill();
});

const signTex = canvasTexture(512, 128, (ctx) => {
  ctx.font = '96px "Luckiest Guy", Rubik, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff5dac';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#ffe27a';
  ctx.fillText('JACKPOT', 256, 70);
});

let env = null; // the room is built once and reused

function buildRoom() {
  const g = new THREE.Group();
  const floor = add(g, new THREE.PlaneGeometry(RW, RD), new THREE.MeshToonMaterial({ map: carpetTex }), { r: [-Math.PI / 2, 0, 0], cast: false });
  floor.receiveShadow = true;
  // marble lobby outside the room so there's never a void behind the camera
  add(g, new THREE.PlaneGeometry(120, 120), toon('#2a1a3a'), { p: [0, -0.02, 0], r: [-Math.PI / 2, 0, 0], cast: false });
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.6, WALL_H, 0.6), toon('#f4ecd8'), { p: [s * (RW / 2 + 0.3), WALL_H / 2, RD / 2 + 0.3] });
  const wallMat = new THREE.MeshToonMaterial({ map: wallTex, side: THREE.DoubleSide });
  const trim = shiny('#c9a227', { metalness: 0.6, roughness: 0.35 });
  const walls = {
    back: add(g, new THREE.PlaneGeometry(RW, WALL_H), wallMat, { p: [0, WALL_H / 2, -RD / 2] }),
    front: add(g, new THREE.PlaneGeometry(RW, WALL_H), wallMat, { p: [0, WALL_H / 2, RD / 2], r: [0, Math.PI, 0] }),
    left: add(g, new THREE.PlaneGeometry(RD, WALL_H), wallMat, { p: [-RW / 2, WALL_H / 2, 0], r: [0, Math.PI / 2, 0] }),
    right: add(g, new THREE.PlaneGeometry(RD, WALL_H), wallMat, { p: [RW / 2, WALL_H / 2, 0], r: [0, -Math.PI / 2, 0] }),
  };
  for (const [k, w] of Object.entries(walls)) {
    const along = k === 'back' || k === 'front';
    const t = add(w, new THREE.BoxGeometry(along ? RW : RD, 0.25, 0.15), trim, { p: [0, WALL_H / 2 - 0.1, 0.05] });
    t.castShadow = false;
    add(w, new THREE.BoxGeometry(along ? RW : RD, 0.35, 0.12), toon('#2a1245'), { p: [0, -WALL_H / 2 + 0.17, 0.05], cast: false });
  }
  // the exit: a golden doorway in the front wall
  add(walls.front, new THREE.BoxGeometry(2.8, 3.6, 0.2), trim, { p: [0, -WALL_H / 2 + 1.8, 0.02] });
  add(walls.front, new THREE.BoxGeometry(2.2, 3.2, 0.25), basic('#fff3c4'), { p: [0, -WALL_H / 2 + 1.6, 0.04], cast: false });
  // neon sign
  add(walls.back, new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }), { p: [0, 1.1, 0.06], cast: false });

  // columns
  for (const x of [-7, 7]) for (const z of [-RD / 2 + 0.6, RD / 2 - 0.6]) {
    add(g, new THREE.CylinderGeometry(0.4, 0.45, WALL_H, 16), toon('#f4ecd8'), { p: [x, WALL_H / 2, z], outline: true });
    add(g, new THREE.BoxGeometry(1.1, 0.3, 1.1), trim, { p: [x, WALL_H - 0.1, z] });
  }
  // chandeliers
  const glows = [];
  for (const [x, z] of [[-6, -3], [6, -3], [0, 4]]) {
    add(g, new THREE.CylinderGeometry(0.02, 0.02, 2.2, 6), trim, { p: [x, WALL_H + 1.6, z], cast: false });
    add(g, new THREE.TorusGeometry(0.8, 0.07, 8, 32), trim, { p: [x, WALL_H + 0.5, z], r: [Math.PI / 2, 0, 0], cast: false });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      add(g, new THREE.SphereGeometry(0.1, 8, 6), basic('#fff6c9'), { p: [x + Math.cos(a) * 0.8, WALL_H + 0.62, z + Math.sin(a) * 0.8], cast: false });
    }
    const glow = new THREE.Sprite(additive(glowTexture, 0xffd88a, 0.45));
    glow.scale.setScalar(3.4);
    glow.position.set(x, WALL_H + 0.6, z);
    g.add(glow);
    glows.push(glow);
    const light = new THREE.PointLight(0xffd79a, 18, 14, 1.8);
    light.position.set(x, WALL_H - 0.2, z);
    g.add(light);
  }

  const anim = [];
  const machines = [];

  // slot machines along the left wall
  for (let i = 0; i < 5; i++) {
    const z = -6 + i * 3;
    const m = new THREE.Group();
    add(m, new THREE.BoxGeometry(1.3, 2.3, 1.1), toon(['#d6334a', '#3b5bdb', '#8f1530', '#2f9e44', '#b77bff'][i]), { p: [0, 1.15, 0], outline: true });
    add(m, new THREE.BoxGeometry(1.4, 0.35, 1.2), trim, { p: [0, 2.45, 0] });
    add(m, new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: slotScreenTex }), { p: [0, 1.55, 0.56], cast: false });
    add(m, new THREE.BoxGeometry(1.35, 0.1, 0.4), trim, { p: [0, 1.0, 0.7] });
    add(m, new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), shiny('#c0c6d4'), { p: [0.78, 1.7, 0.1] });
    add(m, new THREE.SphereGeometry(0.1, 10, 8), toon('#e0463c'), { p: [0.78, 2.1, 0.1] });
    const bulbs = [];
    for (let k = 0; k < 5; k++) bulbs.push(add(m, new THREE.SphereGeometry(0.06, 8, 6), basic('#fff6b0'), { p: [-0.5 + k * 0.25, 2.3, 0.57], cast: false }));
    anim.push((t) => bulbs.forEach((b, k) => { b.visible = (Math.floor(t * 5) + k + i) % 3 !== 0; }));
    m.position.set(-RW / 2 + 1, 0, z);
    m.rotation.y = Math.PI / 2;
    g.add(m);
    machines.push({ game: 'slots', obj: m, x: -RW / 2 + 2.6, z, r: 1.7, label: 'play the slots', icon: 'casino', solid: { x: -RW / 2 + 1, z, w: 1.2, d: 1.4 } });
  }

  // the prize wheel on the right wall
  const pw = new THREE.Group();
  add(pw, new THREE.BoxGeometry(0.5, 0.5, 5.2), toon('#6b4a2b'), { p: [0, 0.25, 0] });
  add(pw, new THREE.CylinderGeometry(0.15, 0.2, 3.4, 10), toon('#6b4a2b'), { p: [0, 1.7, 0] });
  const disc = new THREE.Group();
  add(disc, new THREE.CylinderGeometry(2.2, 2.2, 0.2, 48), [toon('#c9a227'), new THREE.MeshBasicMaterial({ map: prizeTex }), toon('#c9a227')], { r: [0, 0, Math.PI / 2], outline: true });
  disc.position.set(-0.2, 3.4, 0);
  pw.add(disc);
  add(pw, new THREE.ConeGeometry(0.25, 0.5, 4), toon('#e0463c'), { p: [-0.35, 5.75, 0], r: [Math.PI, 0, 0] });
  pw.position.set(RW / 2 - 0.8, 0, -3);
  g.add(pw);
  anim.push((t, dt) => { disc.rotation.x += dt * 0.35; });
  machines.push({ game: 'wheel', obj: pw, x: RW / 2 - 3, z: -3, r: 2.4, label: 'spin the prize wheel', icon: 'casino', solid: { x: RW / 2 - 0.8, z: -3, w: 1.2, d: 5.2 } });

  // coin flip table by the entrance
  const ct = new THREE.Group();
  add(ct, new THREE.CylinderGeometry(1.1, 1.1, 0.12, 32), toon('#1f7a47'), { p: [0, 1.0, 0], outline: true });
  add(ct, new THREE.CylinderGeometry(1.15, 1.15, 0.1, 32), trim, { p: [0, 0.92, 0] });
  add(ct, new THREE.CylinderGeometry(0.15, 0.25, 0.9, 10), toon('#3a2410'), { p: [0, 0.45, 0] });
  const coin = add(ct, new THREE.CylinderGeometry(0.45, 0.45, 0.08, 32), shiny('#ffc53d', { metalness: 0.8, roughness: 0.25 }), { p: [0, 2.1, 0], r: [Math.PI / 2, 0, 0], outline: true });
  const coinGlow = new THREE.Sprite(additive(glowTexture, 0xffd84d, 0.4));
  coinGlow.scale.setScalar(1.8);
  coinGlow.position.y = 2.1;
  ct.add(coinGlow);
  ct.position.set(8, 0, 5.5);
  g.add(ct);
  anim.push((t) => { coin.rotation.z = t * 3; coin.position.y = 2.1 + Math.sin(t * 2) * 0.15; });
  machines.push({ game: 'coinflip', obj: ct, x: 8, z: 5.5, r: 2.4, label: 'flip a coin', icon: 'trading', solid: { x: 8, z: 5.5, r: 1.2 } });

  // the blackjack table: a half-moon of green felt with the dealer behind it
  const bjt = new THREE.Group();
  const halfMoon = (r, h) => new THREE.CylinderGeometry(r, r, h, 40, 1, false, -Math.PI / 2, Math.PI); // round side towards the players
  add(bjt, halfMoon(2.1, 0.85), toon('#5a3a1c'), { p: [0, 0.43, 0], outline: true });
  add(bjt, halfMoon(2.2, 0.1), trim, { p: [0, 0.9, 0] });
  add(bjt, halfMoon(2.0, 0.04), toon('#1f7a47'), { p: [0, 0.97, 0] });
  add(bjt, new THREE.BoxGeometry(4.4, 0.95, 0.4), toon('#3a2410'), { p: [0, 0.47, -0.1] });
  // a dealt hand, a shoe and chip stacks on the felt
  const cardMat = toon('#fffdf6'), backMat = toon('#b3203a');
  [[-0.9, 0.9, 0.2], [-0.5, 1.0, -0.15], [0.6, 1.1, 0.1], [1.0, 0.95, -0.2], [0.1, 0.45, 0.05], [0.4, 0.45, -0.1]].forEach(([x, z, r], i) => {
    add(bjt, new THREE.BoxGeometry(0.32, 0.015, 0.45), i === 5 ? backMat : cardMat, { p: [x, 1.0, z], r: [0, r, 0], cast: false });
  });
  add(bjt, new THREE.BoxGeometry(0.5, 0.3, 0.7), toon('#23263f'), { p: [1.5, 1.1, 0.2], r: [0, -0.4, 0] });
  ['#e0463c', '#39c6ff', '#1d1b2e', '#6ee7a0'].forEach((c, i) => {
    for (let k = 0; k < 3 + i; k++) add(bjt, new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), toon(c), { p: [-1.4 + i * 0.28, 1.02 + k * 0.05, 0.25], cast: false });
  });
  bjt.position.set(-6, 0, 4.2);
  g.add(bjt);
  machines.push({ game: 'blackjack', obj: bjt, x: -6, z: 6.4, r: 2.2, label: 'play blackjack', icon: 'casino', solid: { x: -6, z: 5, w: 4.4, d: 2 } });

  // the roulette table
  const rt = new THREE.Group();
  add(rt, new THREE.BoxGeometry(6.4, 0.9, 3.4), toon('#5a3a1c'), { p: [0, 0.45, 0], outline: true });
  add(rt, new THREE.BoxGeometry(6.6, 0.12, 3.6), toon('#3a2410'), { p: [0, 0.95, 0] });
  add(rt, new THREE.PlaneGeometry(6.0, 3.0), new THREE.MeshToonMaterial({ map: feltTex }), { p: [0, 1.02, 0], r: [-Math.PI / 2, 0, 0], cast: false });
  const bowl = add(rt, new THREE.CylinderGeometry(1.15, 1.0, 0.4, 40), toon('#3a2410'), { p: [-2.1, 1.2, 0], outline: true });
  bowl.castShadow = true;
  const wheel = new THREE.Group();
  wheel.position.set(-2.1, 1.42, 0);
  add(wheel, new THREE.CircleGeometry(1.0, 48), new THREE.MeshBasicMaterial({ map: wheelFaceTex() }), { r: [-Math.PI / 2, 0, 0], cast: false });
  add(wheel, new THREE.CylinderGeometry(0.08, 0.12, 0.3, 12), trim, { p: [0, 0.15, 0] });
  for (let i = 0; i < 4; i++) add(wheel, new THREE.BoxGeometry(0.5, 0.04, 0.05), trim, { p: [Math.cos(i * Math.PI / 2) * 0.25, 0.25, Math.sin(i * Math.PI / 2) * 0.25], r: [0, -i * Math.PI / 2, 0] });
  rt.add(wheel);
  const ball = add(rt, new THREE.SphereGeometry(0.06, 12, 10), shiny('#ffffff', { metalness: 0.1, roughness: 0.2 }), { p: [-2.1, 1.48, 0.9] });
  rt.position.set(0, 0, -4.5);
  g.add(rt);
  machines.push({ game: 'roulette', obj: rt, x: 0, z: -2, r: 3.4, label: 'join the roulette table', icon: 'roulette', solid: { x: 0, z: -4.5, w: 6.6, d: 3.6 } });

  // the bar in the back right corner
  const bar = new THREE.Group();
  add(bar, new THREE.BoxGeometry(6, 1.2, 1.1), toon('#5a3a1c'), { p: [0, 0.6, 0], outline: true });
  add(bar, new THREE.BoxGeometry(6.2, 0.12, 1.3), trim, { p: [0, 1.25, 0] });
  add(bar, new THREE.BoxGeometry(6, 2.6, 0.4), toon('#3a2410'), { p: [0, 1.3, -1.5] });
  for (let i = 0; i < 12; i++) {
    add(bar, new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), toon(['#6ee7a0', '#ff9f43', '#39c6ff', '#e57bff'][i % 4], { transparent: true, opacity: 0.85 }),
      { p: [-2.6 + i * 0.47, 1.85 + (i % 2) * 0.7, -1.2], cast: false });
  }
  for (let i = 0; i < 4; i++) {
    add(bar, new THREE.CylinderGeometry(0.28, 0.28, 0.1, 16), toon('#d6334a'), { p: [-2.2 + i * 1.45, 0.85, 1.1] });
    add(bar, new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), trim, { p: [-2.2 + i * 1.45, 0.4, 1.1], cast: false });
  }
  bar.position.set(8.5, 0, -RD / 2 + 1.4);
  g.add(bar);

  // plants + velvet ropes by the door
  for (const [x, z] of [[-12.5, 9.5], [12.5, 9.5], [-12.5, -9.5]]) {
    add(g, new THREE.CylinderGeometry(0.45, 0.35, 0.8, 14), toon('#c9a227'), { p: [x, 0.4, z], outline: true });
    add(g, new THREE.IcosahedronGeometry(0.8, 1), toon('#2f9e44'), { p: [x, 1.4, z], outline: true });
  }
  for (const x of [-2.5, 2.5]) {
    add(g, new THREE.CylinderGeometry(0.06, 0.08, 1, 8), trim, { p: [x, 0.5, 8.6] });
    add(g, new THREE.SphereGeometry(0.1, 10, 8), trim, { p: [x, 1.05, 8.6] });
  }

  // staff (just for show)
  const dealer = new Character({ skin: '#e3ac78', hairColor: '#2b1d14', topColor: '#23263f', bottomColor: '#23263f', hair: 'hair_short', top: 'top_suit', hat: 'hat_none', face: 'face_none', back: 'back_none', aura: 'aura_none' });
  dealer.root.position.set(0, 0, -6.8);
  g.add(dealer.root);
  const barkeep = new Character({ skin: '#8d5524', hairColor: '#e8e8e8', topColor: '#ffffff', bottomColor: '#23263f', hair: 'hair_curly', top: 'top_suit', hat: 'hat_none', face: 'face_mustache', back: 'back_none', aura: 'aura_none' });
  barkeep.root.position.set(8.5, 0, -RD / 2 + 0.6);
  g.add(barkeep.root);
  const cardDealer = new Character({ skin: '#f6c9a0', hairColor: '#e84393', topColor: '#23263f', bottomColor: '#23263f', hair: 'hair_bob', top: 'top_suit', eyes: 'eyes_lashes' });
  cardDealer.root.position.set(-6, 0, 3.6);
  g.add(cardDealer.root);
  anim.push((t, dt) => { dealer.update(dt, t, false); barkeep.update(dt, t + 2, false); cardDealer.update(dt, t + 4, false); });

  const solids = [
    ...machines.map((m) => m.solid),
    { x: 8.5, z: -RD / 2 + 1.2, w: 6.4, d: 2.8 },
    ...[[-7, -RD / 2 + 0.6], [7, -RD / 2 + 0.6], [-7, RD / 2 - 0.6], [7, RD / 2 - 0.6]].map(([x, z]) => ({ x, z, r: 0.5 })),
    ...[[-12.5, 9.5], [12.5, 9.5], [-12.5, -9.5]].map(([x, z]) => ({ x, z, r: 0.6 })),
    { x: 0, z: -6.8, r: 0.6 },
    { x: -6, z: 3.6, r: 0.6 },
  ];
  return { group: g, walls, machines, solids, anim, wheel, ball, glows };
}

export function casinoArea(stage) {
  env ||= buildRoom();
  const { group, walls, machines, solids, anim, wheel, ball } = env;
  stage.lights({ background: '#12081f', sky: 0xffe2c4, ground: 0x3a1a4a, hemi: 1.1, sun: 1.1, sunPos: [6, 30, 12], box: 18 });
  stage.scene.add(group);

  const walker = stage.walker({
    spawn: { x: (Math.random() - 0.5) * 3, z: RD / 2 - 4.5 }, speed: 5,
    bounds: { minX: -RW / 2, maxX: RW / 2, minZ: -RD / 2, maxZ: RD / 2 },
    solids,
    orbit: { yaw: 0, pitch: 0.7, dist: 12, maxDist: 18 },
  });
  walker.me.heading = Math.PI;

  for (const m of machines) {
    stage.interactable({
      x: m.x, z: m.z, r: m.r, label: m.label, icon: m.icon, obj: m.obj,
      use: () => stage.openPanel({ wide: m.game === 'roulette', mount: (body) => casino(body, { game: m.game }) }),
    });
  }
  stage.interactable({ x: 0, z: RD / 2 - 0.8, r: 2.3, label: 'leave the casino', use: () => stage.onExit?.() });

  // the 3D roulette wheel follows the real table
  let wheelRot = 0, spin = null, ballAng = 0, landed = null;
  const off = [
    net.on('roulette_spin', (m) => {
      const idx = ROULETTE_ORDER.indexOf(m.n);
      const T = Math.max(1.5, m.spin - 0.4);
      const w1 = wheelRot + TAU * 2 + Math.random() * TAU;
      const pocket = -Math.PI / 2 + (idx + 0.5) * SEG - w1;
      let b1 = pocket - TAU * 5;
      while (b1 > ballAng - TAU * 4) b1 -= TAU;
      spin = { t: 0, T, w0: wheelRot, w1, b0: ballAng, b1 };
      landed = null;
    }),
    net.on('roulette_result', (m) => { landed = m.n; }),
  ];

  const hideWalls = () => {
    const c = stage.camera.position;
    walls.front.visible = c.z < RD / 2 - 0.3;
    walls.back.visible = c.z > -RD / 2 + 0.3;
    walls.left.visible = c.x > -RW / 2 + 0.3;
    walls.right.visible = c.x < RW / 2 - 0.3;
  };


  stage.onFrame((dt, now) => {
    const t = now / 1000;
    for (const fn of anim) fn(t, dt);
    if (spin) {
      spin.t += dt;
      const k = Math.min(1, spin.t / spin.T);
      wheelRot = spin.w0 + (spin.w1 - spin.w0) * (1 - (1 - k) ** 3);
      ballAng = spin.b0 + (spin.b1 - spin.b0) * (1 - (1 - k) ** 2.2);
      const r = k < 0.7 ? 0.95 : 0.95 - 0.25 * Math.min(1, (k - 0.7) / 0.25);
      ball.position.set(-2.1 + Math.cos(ballAng) * r, 1.48, Math.sin(ballAng) * r);
      if (k >= 1) spin = null;
    } else {
      wheelRot += dt * 0.25;
      if (landed != null) ballAng -= dt * 0.25;
      else ballAng -= dt * 1.2;
      const r = landed != null ? 0.7 : 0.95;
      ball.position.set(-2.1 + Math.cos(ballAng) * r, 1.48, Math.sin(ballAng) * r);
    }
    wheel.rotation.y = wheelRot;
    hideWalls();
  });
  sfx('knock');
  stage.banner('<div class="big">🎰 Welcome to the Casino!</div>Walk up to a machine or table and press <kbd>E</kbd> to play.', 3200);

  return () => {
    walker.stop();
    off.forEach((f) => f());
    stage.scene?.remove(group);
  };
}
