// The casino floor: walk around with everyone else in the casino and step up to a machine to play.
// Banks of slot machines on the left under a progressive jackpot sign, the roulette table (with a real
// spinning 3D wheel) in the middle, a roped-off VIP pit of card tables on the right, dice and the coin
// flip, and along the back wall the cashier's cage, Plinko, the prize wheel and the lounge bar.
import * as THREE from 'three';
import { net } from '../net.js';
import { toon, shiny, basic, canvasTexture, additive, glowTexture, outlineMaterial, TAU } from '../three/materials.js';
import { Character } from '../three/character.js';
import { casino } from '../games/casino.js';
import { ROULETTE_ORDER, roulettePocketColor } from '../games/roulette.js';
import { sfx } from '../sfx.js';

const RW = 40, RD = 30, WALL_H = 6;
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
}, { repeat: [10, 7.5] });

const wallTex = canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#4a2475';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#56308a';
  for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 32, 256);
  ctx.fillStyle = 'rgba(255,215,90,.25)';
  for (let x = 16; x < 256; x += 64) for (let y = 16; y < 256; y += 48) {
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 6, y); ctx.fill();
  }
}, { repeat: [9, 1.6] });

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
  const WHEEL = [0, 1.5, 0, 0, 0.5, 0, 2, 0, 0, 1.5, 0, 0.5, 0, 0, 0, 5];
  // red and black blanks, purple prizes, a gold jackpot, on a gold rim
  const seg = TAU / WHEEL.length;
  ctx.translate(256, 256);
  ctx.fillStyle = '#ffc53d';
  ctx.beginPath(); ctx.arc(0, 0, 256, 0, TAU); ctx.fill();
  WHEEL.forEach((m, i) => {
    const a0 = -Math.PI / 2 + i * seg;
    ctx.fillStyle = m === 0 ? (i % 2 ? '#1a1320' : '#b3122e') : m === 5 ? '#ffc53d' : m === 2 ? '#7a2fc0' : '#5b1f8f';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 232, a0, a0 + seg); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c99700'; ctx.lineWidth = 3; ctx.stroke();
    ctx.save();
    ctx.rotate(a0 + seg / 2);
    ctx.fillStyle = m === 5 ? '#3a2400' : '#ffd84d';
    ctx.font = '900 34px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m ? `×${m}` : '✖', 170, 12);
    ctx.restore();
  });
  // bulbs round the rim, and a black hub with a gold ring
  for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU; ctx.fillStyle = i % 2 ? '#fff6c9' : '#ff5d73'; ctx.beginPath(); ctx.arc(Math.cos(a) * 244, Math.sin(a) * 244, 7, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#1a1320';
  ctx.beginPath(); ctx.arc(0, 0, 50, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ffc53d'; ctx.lineWidth = 8; ctx.stroke();
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

// a classic casino carpet: deep burgundy with gold scrolls and jewel-coloured flowers
const richCarpet = canvasTexture(256, 256, (c) => {
  c.fillStyle = '#5a0f22'; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = 'rgba(214,170,60,.55)'; c.lineWidth = 3;
  for (let k = 0; k < 8; k++) { c.beginPath(); c.arc((k % 4) * 64 + 32, Math.floor(k / 4) * 128 + 64, 30, 0, Math.PI * 1.5); c.stroke(); }
  const petal = (x, y, col, r) => { c.fillStyle = col; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; c.beginPath(); c.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.7, r * 0.4, a, 0, TAU); c.fill(); } c.fillStyle = '#ffd84d'; c.beginPath(); c.arc(x, y, r * 0.45, 0, TAU); c.fill(); };
  for (const [x, y, col] of [[32, 32, '#1f6f8b'], [160, 32, '#6b2fa0'], [96, 96, '#1a7a4f'], [224, 96, '#1f6f8b'], [32, 160, '#6b2fa0'], [160, 160, '#1a7a4f'], [96, 224, '#1f6f8b'], [224, 224, '#6b2fa0']]) petal(x, y, col, 9);
  c.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 300; i++) c.fillRect((i * 37) % 256, (i * 91) % 256, 2, 2);
}, { repeat: [10, 7.5] });
// red damask wallpaper above the panelling
const damask = canvasTexture(128, 128, (c) => {
  c.fillStyle = '#6e1424'; c.fillRect(0, 0, 128, 128);
  c.fillStyle = 'rgba(214,170,60,.35)';
  for (const [x, y] of [[32, 32], [96, 96]]) {
    c.beginPath(); c.moveTo(x, y - 22); c.quadraticCurveTo(x + 16, y, x, y + 22); c.quadraticCurveTo(x - 16, y, x, y - 22); c.fill();
    c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill();
  }
}, { repeat: [14, 2] });
const woodPanel = canvasTexture(128, 64, (c) => {
  c.fillStyle = '#3a1c0e'; c.fillRect(0, 0, 128, 64);
  c.strokeStyle = '#5a3018'; c.lineWidth = 4; c.strokeRect(8, 8, 112, 48);
  c.fillStyle = 'rgba(255,200,120,.06)'; for (let y = 0; y < 64; y += 4) c.fillRect(0, y, 128, 1);
}, { repeat: [14, 1] });

/** A slot machine: a cabinet with a curved screen, a lit topper with its own title, a button deck. */
function slotMachine(g, x, z, ry, color, title, anim, phase) {
  const m = new THREE.Group();
  m.position.set(x, 0, z);
  m.rotation.y = ry;
  g.add(m);
  const gold = shiny('#d4af37', { metalness: 0.7, roughness: 0.3 }), body = toon(color);
  add(m, new THREE.BoxGeometry(1.1, 1.0, 0.9), toon('#1a1320'), { p: [0, 0.5, 0], outline: true });
  add(m, new THREE.BoxGeometry(1.1, 1.3, 0.75), body, { p: [0, 1.65, -0.07], outline: true });
  add(m, new THREE.BoxGeometry(1.14, 0.06, 0.95), gold, { p: [0, 1.0, 0] });
  add(m, new THREE.PlaneGeometry(0.86, 0.62), new THREE.MeshBasicMaterial({ map: slotScreenTex }), { p: [0, 1.62, 0.31], r: [-0.1, 0, 0], cast: false });
  add(m, new THREE.BoxGeometry(1.0, 0.1, 0.4), toon('#2a2d3e'), { p: [0, 1.08, 0.42], r: [0.35, 0, 0] });
  ['#ff3b4f', '#ffd84d', '#39c6ff', '#6ee7a0'].forEach((c, i) => add(m, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), basic(c), { p: [-0.3 + i * 0.2, 1.14, 0.48], r: [0.35, 0, 0], cast: false }));
  // the topper: a rounded lit sign with the machine's name
  const top = canvasTexture(256, 96, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 96); gr.addColorStop(0, color); gr.addColorStop(1, '#1a1320');
    c.fillStyle = gr; c.beginPath(); c.roundRect(0, 0, 256, 96, 40); c.fill();
    c.font = '40px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = '#fff6b0'; c.shadowBlur = 12; c.fillStyle = '#fff6b0'; c.fillText(title, 128, 52);
  });
  add(m, new THREE.BoxGeometry(1.1, 0.5, 0.3), body, { p: [0, 2.55, -0.22] });
  add(m, new THREE.PlaneGeometry(1.0, 0.42), new THREE.MeshBasicMaterial({ map: top }), { p: [0, 2.55, -0.06], cast: false });
  const bulbs = [];
  for (let k = 0; k < 7; k++) bulbs.push(add(m, new THREE.SphereGeometry(0.035, 8, 6), basic('#fff6b0').clone(), { p: [-0.45 + k * 0.15, 2.84, -0.1], cast: false }));
  anim.push((t) => bulbs.forEach((b, k) => { b.material.color.setHSL(((k + Math.floor(t * 6) + phase) % 7) / 7, 0.85, 0.7); }));
  // a stool in front
  add(m, new THREE.CylinderGeometry(0.26, 0.24, 0.1, 16), toon('#8f1530'), { p: [0, 0.68, 0.95] });
  add(m, new THREE.CylinderGeometry(0.04, 0.06, 0.62, 8), gold, { p: [0, 0.32, 0.95], cast: false });
  add(m, new THREE.CylinderGeometry(0.2, 0.22, 0.04, 16), gold, { p: [0, 0.02, 0.95], cast: false });
  return m;
}

function buildRoom() {
  const g = new THREE.Group();
  const anim = [], machines = [], solids = [], glows = [];
  const gold = shiny('#d4af37', { metalness: 0.7, roughness: 0.3 }), trim = gold;
  const marble = toon('#efe6d6'), darkWood = toon('#3a1c0e');
  add(g, new THREE.PlaneGeometry(RW, RD), new THREE.MeshToonMaterial({ map: richCarpet }), { r: [-Math.PI / 2, 0, 0], cast: false });

  // ---- the walls: wood panelling with a gold rail, damask above, a gold crown along the top ----
  const wallMat = new THREE.MeshToonMaterial({ map: damask, side: THREE.DoubleSide });
  const walls = {
    back: add(g, new THREE.PlaneGeometry(RW, WALL_H), wallMat, { p: [0, WALL_H / 2, -RD / 2] }),
    front: add(g, new THREE.PlaneGeometry(RW, WALL_H), wallMat, { p: [0, WALL_H / 2, RD / 2], r: [0, Math.PI, 0] }),
    left: add(g, new THREE.PlaneGeometry(RD, WALL_H), wallMat, { p: [-RW / 2, WALL_H / 2, 0], r: [0, Math.PI / 2, 0] }),
    right: add(g, new THREE.PlaneGeometry(RD, WALL_H), wallMat, { p: [RW / 2, WALL_H / 2, 0], r: [0, -Math.PI / 2, 0] }),
  };
  for (const [k, w] of Object.entries(walls)) {
    const len = k === 'back' || k === 'front' ? RW : RD;
    add(w, new THREE.PlaneGeometry(len, 1.6), new THREE.MeshToonMaterial({ map: woodPanel }), { p: [0, -WALL_H / 2 + 0.8, 0.02], cast: false });
    add(w, new THREE.BoxGeometry(len, 0.08, 0.1), trim, { p: [0, -WALL_H / 2 + 1.62, 0.05], cast: false });
    add(w, new THREE.BoxGeometry(len, 0.3, 0.2), trim, { p: [0, WALL_H / 2 - 0.15, 0.08], cast: false });
    add(w, new THREE.BoxGeometry(len, 0.18, 0.08), darkWood, { p: [0, -WALL_H / 2 + 0.09, 0.04], cast: false });
    // wall lamps: a gold arm and a glowing shade every few metres
    for (let s = -len / 2 + 3; s < len / 2 - 2; s += 5) {
      if (k === 'front' && Math.abs(s) < 3) continue;
      add(w, new THREE.BoxGeometry(0.12, 0.3, 0.12), trim, { p: [s, 0.7, 0.08], cast: false });
      add(w, new THREE.CylinderGeometry(0.14, 0.22, 0.28, 12), basic('#ffe6a8'), { p: [s, 1.0, 0.25], cast: false });
      const gl = new THREE.Sprite(additive(glowTexture, 0xffcf7a, 0.5));
      gl.scale.setScalar(1.6);
      gl.position.set(s, 1.0, 0.3);
      w.add(gl);
    }
  }
  // the grand entrance: a gold frame round the doors, a WELCOME sign, a red carpet runner and rope stands
  add(walls.front, new THREE.BoxGeometry(3.6, 4.2, 0.3), trim, { p: [0, -WALL_H / 2 + 2.1, 0.05] });
  add(walls.front, new THREE.BoxGeometry(3.0, 3.8, 0.35), basic('#fff3c4'), { p: [0, -WALL_H / 2 + 1.9, 0.08], cast: false });
  const welcome = canvasTexture(512, 96, (c) => { c.font = '64px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#ffd84d'; c.shadowBlur = 18; c.fillStyle = '#fff6c9'; c.fillText('★ WELCOME ★', 256, 52); });
  add(walls.front, new THREE.PlaneGeometry(4.5, 0.85), new THREE.MeshBasicMaterial({ map: welcome, transparent: true }), { p: [0, 1.1, 0.12], cast: false });
  add(g, new THREE.PlaneGeometry(2.6, 9), toon('#b3122e'), { p: [0, 0.012, RD / 2 - 4.5], r: [-Math.PI / 2, 0, 0], cast: false });
  for (const sx of [-1, 1]) add(g, new THREE.PlaneGeometry(0.12, 9), gold, { p: [sx * 1.3, 0.014, RD / 2 - 4.5], r: [-Math.PI / 2, 0, 0], cast: false });
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    const z = RD / 2 - 1.5 - k * 2.4;
    add(g, new THREE.CylinderGeometry(0.06, 0.09, 1.0, 10), gold, { p: [sx * 1.7, 0.5, z] });
    add(g, new THREE.SphereGeometry(0.1, 10, 8), gold, { p: [sx * 1.7, 1.05, z] });
    add(g, new THREE.CylinderGeometry(0.2, 0.22, 0.05, 16), gold, { p: [sx * 1.7, 0.03, z], cast: false });
    if (k < 3) add(g, new THREE.CylinderGeometry(0.035, 0.035, 2.4, 8), toon('#b3122e'), { p: [sx * 1.7, 0.85, z - 1.2], r: [Math.PI / 2, 0, 0], cast: false });
    solids.push({ x: sx * 1.7, z, r: 0.18 });
  }
  const neon = canvasTexture(512, 128, (c) => { c.font = '90px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#ff5dac'; c.shadowBlur = 24; c.fillStyle = '#ffe27a'; c.fillText('JACKPOT', 256, 70); });
  add(walls.back, new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: neon, transparent: true }), { p: [0, 1.6, 0.1], cast: false });

  // ---- marble columns with gold bands ----
  for (const [x, z] of [[-6.5, -8], [6.5, -8], [-6.5, 2], [6.5, 2], [-17, -14], [17, -14], [-17, 14], [17, 14]]) {
    add(g, new THREE.CylinderGeometry(0.45, 0.5, WALL_H, 18), marble, { p: [x, WALL_H / 2, z], outline: true });
    for (const y of [0.15, 1.6, WALL_H - 0.2]) add(g, new THREE.CylinderGeometry(0.56, 0.56, 0.18, 18), gold, { p: [x, y, z] });
    solids.push({ x, z, r: 0.6 });
  }
  // ---- crystal chandeliers: tiers of glowing crystal drops ----
  for (const [x, z, big] of [[0, -3, 1.3], [-11, -5, 1], [11, -5, 1], [-11, 7, 1], [11, 7, 1]]) {
    const ch = new THREE.Group();
    ch.position.set(x, WALL_H - 0.4, z);
    g.add(ch);
    add(ch, new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), gold, { p: [0, 0.9, 0], cast: false });
    for (const [r, y, n] of [[0.95 * big, 0, 14], [0.65 * big, -0.35, 10], [0.35 * big, -0.65, 7]]) {
      add(ch, new THREE.TorusGeometry(r, 0.04, 6, 32), gold, { p: [0, y, 0], r: [Math.PI / 2, 0, 0], cast: false });
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; add(ch, new THREE.OctahedronGeometry(0.08), basic('#f4fbff'), { p: [Math.cos(a) * r, y - 0.14, Math.sin(a) * r], s: [0.7, 1.4, 0.7], cast: false }); }
    }
    const glow = new THREE.Sprite(additive(glowTexture, 0xffe1a8, 0.55));
    glow.scale.setScalar(4 * big);
    glow.position.y = -0.3;
    ch.add(glow);
    glows.push(glow);
    const light = new THREE.PointLight(0xffd79a, 20 * big, 15, 1.8);
    light.position.set(x, WALL_H - 1, z);
    g.add(light);
  }

  // ---- slots: a bank along the left wall and an island of machines back to back, with a progressive
  // jackpot sign over the island that keeps ticking up ----
  const titles = ['LUCKY 7', 'GOLD RUSH', 'DIAMONDS', 'CHERRY POP', 'MEGA WIN', 'FORTUNE', 'STAR BURST', 'BIG BUCKS', 'JACKPOT!', 'TREASURE', 'WILD WEST', 'NEON NIGHTS'];
  const cols = ['#d6334a', '#3b5bdb', '#8f1530', '#2f9e44', '#b77bff', '#ff9f43', '#1fa3a0', '#e84393', '#d4af37', '#5b1f8f', '#c0563f', '#ff4fd8'];
  let si = 0;
  const slot = (x, z, ry) => {
    const m = slotMachine(g, x, z, ry, cols[si % 12], titles[si % 12], anim, si);
    const fx = Math.sin(ry), fz = Math.cos(ry);
    machines.push({ game: 'slots', obj: m, x: x + fx * 1.4, z: z + fz * 1.4, r: 0.9, label: `play ${titles[si % 12]}`, icon: 'casino', solid: { x, z, w: Math.abs(fx) > 0.5 ? 1.0 : 1.2, d: Math.abs(fx) > 0.5 ? 1.2 : 1.0 } });
    si++;
  };
  for (let i = 0; i < 6; i++) slot(-RW / 2 + 0.7, -10 + i * 2.6, Math.PI / 2);
  for (let i = 0; i < 3; i++) { slot(-12.2, -6 + i * 2.6, -Math.PI / 2); slot(-11.2, -6 + i * 2.6, Math.PI / 2); }
  const jp = document.createElement('canvas'); jp.width = 512; jp.height = 128;
  const jpTex = new THREE.CanvasTexture(jp); jpTex.colorSpace = THREE.SRGBColorSpace;
  let jackpot = 48213.57;
  const drawJp = () => {
    const c = jp.getContext('2d');
    c.fillStyle = '#05030f'; c.fillRect(0, 0, 512, 128);
    c.font = '26px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ff5dac'; c.fillText('★ PROGRESSIVE JACKPOT ★', 256, 34);
    c.font = '60px "Luckiest Guy", Rubik, sans-serif'; c.fillStyle = '#ffd84d'; c.shadowColor = '#ffd84d'; c.shadowBlur = 14; c.fillText(`🪙 ${jackpot.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`, 256, 100); c.shadowBlur = 0;
    jpTex.needsUpdate = true;
  };
  drawJp();
  const sign = new THREE.Group();
  sign.position.set(-11.7, 3.9, -3.4);
  g.add(sign);
  add(sign, new THREE.BoxGeometry(0.3, 1.2, 4.2), toon('#1a1320'), { outline: true });
  for (const s of [-1, 1]) add(sign, new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: jpTex }), { p: [s * 0.16, 0, 0], r: [0, s * Math.PI / 2, 0], cast: false });
  add(sign, new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), gold, { p: [0, 1.4, 0], cast: false });
  let jpT = 0;
  anim.push((t, dt) => { if ((jpT += dt) > 0.4) { jpT = 0; jackpot += Math.random() * 3.7; drawJp(); } });

  // ---- the roulette table in the middle (the 3D wheel spins with the real game) ----
  const rt = new THREE.Group();
  add(rt, new THREE.BoxGeometry(6.4, 0.9, 3.4), darkWood, { p: [0, 0.45, 0], outline: true });
  add(rt, new THREE.BoxGeometry(6.7, 0.14, 3.7), toon('#5a2a14'), { p: [0, 0.95, 0] });
  add(rt, new THREE.BoxGeometry(6.8, 0.04, 3.8), gold, { p: [0, 0.88, 0], cast: false });
  add(rt, new THREE.PlaneGeometry(6.0, 3.0), new THREE.MeshToonMaterial({ map: feltTex }), { p: [0, 1.03, 0], r: [-Math.PI / 2, 0, 0], cast: false });
  add(rt, new THREE.CylinderGeometry(1.15, 1.0, 0.4, 40), darkWood, { p: [-2.1, 1.2, 0], outline: true });
  add(rt, new THREE.TorusGeometry(1.15, 0.05, 8, 40), gold, { p: [-2.1, 1.4, 0], r: [Math.PI / 2, 0, 0], cast: false });
  const wheel = new THREE.Group();
  wheel.position.set(-2.1, 1.42, 0);
  add(wheel, new THREE.CircleGeometry(1.0, 48), new THREE.MeshBasicMaterial({ map: wheelFaceTex() }), { r: [-Math.PI / 2, 0, 0], cast: false });
  add(wheel, new THREE.CylinderGeometry(0.08, 0.12, 0.3, 12), gold, { p: [0, 0.15, 0] });
  for (let i = 0; i < 4; i++) add(wheel, new THREE.BoxGeometry(0.5, 0.04, 0.05), gold, { p: [Math.cos(i * Math.PI / 2) * 0.25, 0.25, Math.sin(i * Math.PI / 2) * 0.25], r: [0, -i * Math.PI / 2, 0] });
  rt.add(wheel);
  const ball = add(rt, new THREE.SphereGeometry(0.06, 12, 10), shiny('#ffffff', { metalness: 0.1, roughness: 0.2 }), { p: [-2.1, 1.48, 0.9] });
  // chip stacks on the felt, and stools round the players' side
  ['#e0463c', '#39c6ff', '#1d1b2e', '#6ee7a0', '#ffd84d'].forEach((c, i) => { for (let k = 0; k < 2 + i; k++) add(rt, new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), toon(c), { p: [0.4 + i * 0.4, 1.06 + k * 0.05, 0.9], cast: false }); });
  for (let k = 0; k < 5; k++) {
    add(rt, new THREE.CylinderGeometry(0.26, 0.24, 0.1, 16), toon('#8f1530'), { p: [-2.4 + k * 1.2, 0.7, 2.3] });
    add(rt, new THREE.CylinderGeometry(0.04, 0.06, 0.64, 8), gold, { p: [-2.4 + k * 1.2, 0.33, 2.3], cast: false });
  }
  rt.position.set(0, 0, -4.5);
  g.add(rt);
  machines.push({ game: 'roulette', obj: rt, x: 0, z: -1.6, r: 3.4, label: 'join the roulette table', icon: 'roulette', solid: { x: 0, z: -4.5, w: 6.8, d: 3.8 } });

  // ---- the raised VIP pit for the card tables, roped off with a gap to walk in ----
  add(g, new THREE.BoxGeometry(11, 0.2, 8), toon('#3a0a18'), { p: [11.5, 0.1, 4.5], cast: false });
  add(g, new THREE.BoxGeometry(11.2, 0.08, 8.2), gold, { p: [11.5, 0.16, 4.5], cast: false }); // (a gold rim round the edge)
  add(g, new THREE.PlaneGeometry(10.8, 7.8), toon('#2a0814'), { p: [11.5, 0.205, 4.5], r: [-Math.PI / 2, 0, 0], cast: false });
  const vip = canvasTexture(256, 64, (c) => { c.font = '44px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#d4af37'; c.shadowBlur = 14; c.fillStyle = '#ffe9a8'; c.fillText('V I P', 128, 36); });
  add(walls.right, new THREE.PlaneGeometry(3, 0.75), new THREE.MeshBasicMaterial({ map: vip, transparent: true }), { p: [-4.5, 1.6, 0.1], cast: false });
  const cardMat = toon('#fffdf6'), backMat = toon('#b3203a');
  const halfMoon = (r, h) => new THREE.CylinderGeometry(r, r, h, 40, 1, false, -Math.PI / 2, Math.PI);
  const cardTable = (x, z, felt, game, label) => {
    const t = new THREE.Group();
    add(t, halfMoon(2.1, 0.85), darkWood, { p: [0, 0.43, 0], outline: true });
    add(t, halfMoon(2.2, 0.12), toon('#5a2a14'), { p: [0, 0.9, 0] });
    add(t, halfMoon(2.0, 0.04), toon(felt), { p: [0, 0.97, 0] });
    add(t, new THREE.BoxGeometry(4.4, 0.95, 0.4), darkWood, { p: [0, 0.47, -0.1] });
    [[-0.9, 0.9, 0.2], [-0.5, 1.0, -0.15], [0.6, 1.1, 0.1], [1.0, 0.95, -0.2], [0.1, 0.45, 0.05], [0.4, 0.45, -0.1]].forEach(([cx, cz, r], i) => add(t, new THREE.BoxGeometry(0.32, 0.015, 0.45), i === 5 ? backMat : cardMat, { p: [cx, 1.0, cz], r: [0, r, 0], cast: false }));
    add(t, new THREE.BoxGeometry(0.5, 0.3, 0.7), toon('#23263f'), { p: [1.5, 1.1, 0.2], r: [0, -0.4, 0] });
    ['#e0463c', '#39c6ff', '#1d1b2e', '#6ee7a0'].forEach((c, i) => { for (let k = 0; k < 3 + i; k++) add(t, new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), toon(c), { p: [-1.4 + i * 0.28, 1.02 + k * 0.05, 0.25], cast: false }); });
    for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + ((k + 0.5) / 4) * Math.PI; add(t, new THREE.CylinderGeometry(0.24, 0.22, 0.1, 16), toon('#8f1530'), { p: [Math.sin(a) * 2.6, 0.7, Math.cos(a) * 2.6] }); add(t, new THREE.CylinderGeometry(0.04, 0.06, 0.6, 8), gold, { p: [Math.sin(a) * 2.6, 0.32, Math.cos(a) * 2.6], cast: false }); }
    // a low lamp over the felt
    add(t, new THREE.CylinderGeometry(0.015, 0.015, 2.6, 6), gold, { p: [0, 3.6, 0.5], cast: false });
    add(t, new THREE.CylinderGeometry(0.3, 0.5, 0.3, 16, 1, true), toon('#1f4f3a', { side: THREE.DoubleSide }), { p: [0, 2.3, 0.5], cast: false });
    t.position.set(x, 0.2, z);
    g.add(t);
    machines.push({ game, obj: t, x, z: z + 2.4, r: 2, label, icon: 'casino', solid: { x, z: z + 0.3, w: 4.4, d: 2.2 } });
    return t;
  };
  cardTable(8.5, 2.5, '#1f7a47', 'blackjack', 'play blackjack');
  cardTable(14.2, 2.5, '#1f7a47', 'blackjack', 'play blackjack (VIP table)');
  cardTable(14.2, 8.6, '#1f4f9a', 'hilo', 'play High-Low');
  for (const [x0, z0, x1, z1] of [[6.2, 0.6, 6.2, 8.4], [6.2, 8.6, 9.5, 8.6]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 2.2));
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
      add(g, new THREE.CylinderGeometry(0.06, 0.09, 1.0, 10), gold, { p: [x, 0.7, z] });
      add(g, new THREE.SphereGeometry(0.1, 10, 8), gold, { p: [x, 1.25, z] });
      if (k < n) { const nx = x0 + ((x1 - x0) * (k + 1)) / n, nz = z0 + ((z1 - z0) * (k + 1)) / n; const rope = add(g, new THREE.CylinderGeometry(0.035, 0.035, Math.hypot(nx - x, nz - z), 8), toon('#b3122e'), { p: [(x + nx) / 2, 1.05, (z + nz) / 2], cast: false }); rope.rotation.set(Math.PI / 2, Math.atan2(nx - x, nz - z), 0, 'YXZ'); }
    }
  }
  solids.push({ x: 6.2, z: 4.5, w: 0.3, d: 7.8 }, { x: 7.85, z: 8.6, w: 3.3, d: 0.3 });

  // ---- dice (a craps table) and the coin flip pedestal ----
  const dt = new THREE.Group();
  add(dt, new THREE.BoxGeometry(4.2, 0.9, 2.2), darkWood, { p: [0, 0.45, 0], outline: true });
  add(dt, new THREE.BoxGeometry(4.0, 0.06, 2.0), toon('#1f7a47'), { p: [0, 0.92, 0] });
  for (const s of [-1, 1]) { add(dt, new THREE.BoxGeometry(4.3, 0.24, 0.18), toon('#8f1530'), { p: [0, 1.02, s * 1.1] }); add(dt, new THREE.BoxGeometry(0.18, 0.24, 2.3), toon('#8f1530'), { p: [s * 2.12, 1.02, 0] }); }
  const dice = [0, 1].map((k) => add(dt, new THREE.BoxGeometry(0.22, 0.22, 0.22), toon('#ffffff'), { p: [-0.3 + k * 0.5, 1.07, 0], outline: true }));
  dice.forEach((d) => { for (let p = 0; p < 3; p++) add(d, new THREE.SphereGeometry(0.025, 6, 5), basic('#d6283a'), { p: [-0.05 + p * 0.05, 0.111, -0.05 + p * 0.05], cast: false }); });
  anim.push((t) => dice.forEach((d, k) => { d.rotation.y = t * (0.6 + k * 0.3); }));
  dt.position.set(11, 0, -5.5);
  g.add(dt);
  machines.push({ game: 'dice', obj: dt, x: 11, z: -3.4, r: 2.2, label: 'roll the dice', icon: 'casino', solid: { x: 11, z: -5.5, w: 4.4, d: 2.4 } });
  const ct = new THREE.Group();
  add(ct, new THREE.CylinderGeometry(0.9, 0.9, 0.12, 32), toon('#1f7a47'), { p: [0, 1.0, 0], outline: true });
  add(ct, new THREE.CylinderGeometry(0.95, 0.95, 0.1, 32), gold, { p: [0, 0.92, 0] });
  add(ct, new THREE.CylinderGeometry(0.15, 0.25, 0.9, 10), darkWood, { p: [0, 0.45, 0] });
  const coin = add(ct, new THREE.CylinderGeometry(0.4, 0.4, 0.07, 32), shiny('#ffc53d', { metalness: 0.8, roughness: 0.25 }), { p: [0, 2.0, 0], r: [Math.PI / 2, 0, 0], outline: true });
  const coinGlow = new THREE.Sprite(additive(glowTexture, 0xffd84d, 0.4));
  coinGlow.scale.setScalar(1.6);
  coinGlow.position.y = 2.0;
  ct.add(coinGlow);
  ct.position.set(-6, 0, 8.5);
  g.add(ct);
  anim.push((t) => { coin.rotation.z = t * 3; coin.position.y = 2.0 + Math.sin(t * 2) * 0.15; });
  machines.push({ game: 'coinflip', obj: ct, x: -6, z: 10.4, r: 1.8, label: 'flip a coin', icon: 'trading', solid: { x: -6, z: 8.5, r: 1 } });

  // ---- the back wall: the cashier's cage, Plinko, the big prize wheel and the lounge bar ----
  const cage = new THREE.Group();
  add(cage, new THREE.BoxGeometry(5, 1.1, 1.2), darkWood, { p: [0, 0.55, 0], outline: true });
  add(cage, new THREE.BoxGeometry(5.2, 0.1, 1.4), gold, { p: [0, 1.15, 0] });
  for (let k = 0; k < 16; k++) add(cage, new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), gold, { p: [-2.4 + k * 0.32, 2.0, 0.3], cast: false });
  add(cage, new THREE.BoxGeometry(5, 0.12, 0.2), gold, { p: [0, 2.85, 0.3] });
  const cashier = canvasTexture(256, 64, (c) => { c.fillStyle = '#1a1320'; c.fillRect(0, 0, 256, 64); c.font = '38px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffd84d'; c.fillText('CASHIER', 128, 36); });
  add(cage, new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: cashier }), { p: [0, 3.25, 0.31], cast: false });
  add(cage, new THREE.BoxGeometry(2.6, 0.7, 0.1), toon('#1a1320'), { p: [0, 3.25, 0.25] });
  cage.position.set(-13, 0, -RD / 2 + 0.8);
  g.add(cage);
  solids.push({ x: -13, z: -RD / 2 + 0.8, w: 5.2, d: 1.6 });
  const pl = new THREE.Group();
  add(pl, new THREE.BoxGeometry(2.6, 3.6, 0.4), toon('#2a1245'), { p: [0, 1.9, 0], outline: true });
  add(pl, new THREE.BoxGeometry(2.8, 0.25, 0.5), gold, { p: [0, 3.8, 0] });
  add(pl, new THREE.BoxGeometry(2.4, 3.0, 0.05), toon('#1a1030'), { p: [0, 2.0, 0.22] });
  for (let r = 0; r < 8; r++) for (let k = 0; k <= r; k++) add(pl, new THREE.SphereGeometry(0.04, 6, 5), basic('#e8e2ff'), { p: [(k - r / 2) * 0.26, 3.2 - r * 0.3, 0.26], cast: false });
  [9, 3, 1.4, 0.6, 0.3, 0.6, 1.4, 3, 9].forEach((mult, i) => add(pl, new THREE.BoxGeometry(0.22, 0.25, 0.08), basic(mult >= 3 ? '#ffc53d' : mult >= 1 ? '#7a2fc0' : '#3a2a5a'), { p: [(i - 4) * 0.26, 0.62, 0.26], cast: false }));
  const plBall = add(pl, new THREE.SphereGeometry(0.08, 10, 8), toon('#ff5d8f'), { p: [0, 3.3, 0.3] });
  anim.push((t) => { const f = (t * 0.4) % 1, step = Math.floor(f * 9); plBall.position.set(Math.sin(step * 1.7 + Math.floor(t * 0.4)) * 0.13 * Math.min(step, 4), 3.3 - f * 2.6, 0.3); });
  pl.position.set(-6.5, 0, -RD / 2 + 0.5);
  g.add(pl);
  machines.push({ game: 'plinko', obj: pl, x: -6.5, z: -RD / 2 + 2.5, r: 1.8, label: 'play Plinko', icon: 'casino', solid: { x: -6.5, z: -RD / 2 + 0.5, w: 2.8, d: 0.8 } });
  const pw = new THREE.Group();
  const disc = new THREE.Group();
  add(disc, new THREE.CylinderGeometry(2.0, 2.0, 0.2, 48), [gold, new THREE.MeshBasicMaterial({ map: prizeTex }), gold], { r: [Math.PI / 2, 0, 0], outline: true });
  disc.position.set(0, 3.3, 0.3);
  pw.add(disc);
  add(pw, new THREE.BoxGeometry(4.6, 0.3, 0.6), darkWood, { p: [0, 0.15, 0.3] });
  add(pw, new THREE.BoxGeometry(0.3, 3.2, 0.3), darkWood, { p: [0, 1.6, 0.1] });
  add(pw, new THREE.ConeGeometry(0.25, 0.5, 4), toon('#e0463c'), { p: [0, 5.55, 0.45], r: [Math.PI, 0, 0] });
  pw.position.set(6.5, 0, -RD / 2 + 0.3);
  g.add(pw);
  anim.push((t, dtt) => { disc.rotation.z += dtt * 0.35; });
  machines.push({ game: 'wheel', obj: pw, x: 6.5, z: -RD / 2 + 2.4, r: 2, label: 'spin the prize wheel', icon: 'casino', solid: { x: 6.5, z: -RD / 2 + 0.5, w: 4.6, d: 1 } });
  const bar = new THREE.Group();
  add(bar, new THREE.BoxGeometry(7, 1.2, 1.1), darkWood, { p: [0, 0.6, 0], outline: true });
  add(bar, new THREE.BoxGeometry(7.2, 0.12, 1.3), gold, { p: [0, 1.25, 0] });
  add(bar, new THREE.BoxGeometry(7, 3, 0.4), toon('#2a1408'), { p: [0, 1.5, -1.5] });
  for (let i = 0; i < 16; i++) add(bar, new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), toon(['#6ee7a0', '#ff9f43', '#39c6ff', '#e57bff'][i % 4], { transparent: true, opacity: 0.85 }), { p: [-3 + i * 0.4, 1.85 + (i % 2) * 0.75, -1.2], cast: false });
  for (let i = 0; i < 5; i++) { add(bar, new THREE.CylinderGeometry(0.28, 0.28, 0.1, 16), toon('#8f1530'), { p: [-2.8 + i * 1.4, 0.85, 1.1] }); add(bar, new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), gold, { p: [-2.8 + i * 1.4, 0.4, 1.1], cast: false }); }
  const lounge = canvasTexture(512, 128, (c) => { c.font = '80px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#39e6ff'; c.shadowBlur = 22; c.fillStyle = '#e9fdff'; c.fillText('LOUNGE', 256, 70); });
  add(bar, new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: lounge, transparent: true }), { p: [0, 3.5, -1.28], cast: false });
  bar.position.set(14, 0, -RD / 2 + 1.6);
  g.add(bar);
  solids.push({ x: 14, z: -RD / 2 + 1.4, w: 7.2, d: 2.8 });

  // ---- palms in the corners ----
  for (const [x, z] of [[-RW / 2 + 1.2, RD / 2 - 1.3], [RW / 2 - 1.2, RD / 2 - 1.3], [3.5, RD / 2 - 1.3], [-3.5, RD / 2 - 1.3]]) {
    add(g, new THREE.CylinderGeometry(0.45, 0.35, 0.8, 14), gold, { p: [x, 0.4, z], outline: true });
    add(g, new THREE.CylinderGeometry(0.08, 0.12, 1.6, 8), toon('#7a4a28'), { p: [x, 1.6, z] });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; add(g, new THREE.ConeGeometry(0.18, 1.3, 4), toon('#2f9e44'), { p: [x + Math.cos(a) * 0.5, 2.4, z + Math.sin(a) * 0.5], r: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] }); }
    solids.push({ x, z, r: 0.55 });
  }

  // ---- staff ----
  const dealer = new Character({ skin: '#e3ac78', hairColor: '#2b1d14', topColor: '#23263f', bottomColor: '#23263f', hair: 'hair_short', top: 'top_suit', hat: 'hat_none', face: 'face_none', back: 'back_none', aura: 'aura_none' });
  dealer.root.position.set(0, 0, -6.8);
  g.add(dealer.root);
  const cardDealer = new Character({ skin: '#c68642', hairColor: '#1d1b2e', topColor: '#ffffff', bottomColor: '#23263f', hair: 'hair_bun', top: 'top_suit', hat: 'hat_none', face: 'face_none', back: 'back_none', aura: 'aura_none' });
  cardDealer.root.position.set(8.5, 0.2, 1.8);
  g.add(cardDealer.root);
  const barkeep = new Character({ skin: '#8d5524', hairColor: '#e8e8e8', topColor: '#ffffff', bottomColor: '#23263f', hair: 'hair_curly', top: 'top_suit', hat: 'hat_none', face: 'face_mustache', back: 'back_none', aura: 'aura_none' });
  barkeep.root.position.set(14, 0, -RD / 2 + 0.6);
  g.add(barkeep.root);
  const teller = new Character({ skin: '#f6c9a0', hairColor: '#b55a2b', topColor: '#23263f', bottomColor: '#23263f', hair: 'hair_long', top: 'top_suit', hat: 'hat_none', face: 'face_glasses', back: 'back_none', aura: 'aura_none' });
  teller.root.position.set(-13, 0, -RD / 2 + 0.2);
  g.add(teller.root);
  anim.push((t, dtt) => { dealer.update(dtt, t, false); barkeep.update(dtt, t + 2, false); cardDealer.update(dtt, t + 4, false); teller.update(dtt, t + 6, false); });

  solids.push(...machines.map((m) => m.solid), { x: 0, z: -6.8, r: 0.6 });
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
    ceiling: WALL_H - 0.4,
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
