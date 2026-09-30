// The Arcade: a neon games hall full of cabinets. Walk up to one and press E to play it; the big board
// on the back wall shows the zone's top score on every machine.
import * as THREE from 'three';
import { S, fmt, nameOf } from '../state.js';
import { toon, basic, canvasTexture, additive, glowTexture, TAU } from '../three/materials.js';
import { room, add, openWalker } from './store.js';
import { ARCADE_GAMES, arcadeCabinet } from '../games/arcadegames.js';
import { listen } from '../games/util.js';

/** A cabinet: body, a glowing screen with the game's title art, a marquee, joystick and buttons. */
function cabinet(def) {
  const g = new THREE.Group();
  const body = toon('#221845'), side = toon(def.color);
  add(g, new THREE.BoxGeometry(1.2, 2.3, 1.0), body, { p: [0, 1.15, 0], outline: true });
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.06, 2.3, 1.02), side, { p: [s * 0.63, 1.15, 0] });
  const screenTex = canvasTexture(256, 200, (c) => {
    const grd = c.createLinearGradient(0, 0, 0, 200);
    grd.addColorStop(0, '#0c0a2a'); grd.addColorStop(1, '#1d1450');
    c.fillStyle = grd; c.fillRect(0, 0, 256, 200);
    c.fillStyle = def.color;
    for (let i = 0; i < 30; i++) c.fillRect((i * 53) % 256, (i * 37) % 200, 3, 3);
    c.font = '38px "Luckiest Guy", Rubik, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 8; c.strokeStyle = '#000'; c.strokeText(def.name.toUpperCase(), 128, 90);
    c.fillStyle = def.color; c.fillText(def.name.toUpperCase(), 128, 90);
    c.font = '18px Rubik, sans-serif'; c.fillStyle = '#ffffff'; c.fillText('PRESS START', 128, 150);
  });
  const screen = add(g, new THREE.PlaneGeometry(0.95, 0.75), new THREE.MeshBasicMaterial({ map: screenTex }), { p: [0, 1.62, 0.44], r: [-0.18, 0, 0], cast: false });
  const marqueeTex = canvasTexture(256, 64, (c) => {
    c.fillStyle = def.color; c.fillRect(0, 0, 256, 64);
    c.font = '34px "Luckiest Guy", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#1a1330'; c.fillText(def.name.toUpperCase(), 128, 36);
  });
  add(g, new THREE.BoxGeometry(1.22, 0.36, 0.5), body, { p: [0, 2.46, 0.24] });
  add(g, new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: marqueeTex }), { p: [0, 2.46, 0.5], cast: false });
  // control panel
  add(g, new THREE.BoxGeometry(1.22, 0.14, 0.5), toon('#2e2266'), { p: [0, 1.08, 0.66], r: [0.25, 0, 0] });
  add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), toon('#c0c6d4'), { p: [-0.3, 1.22, 0.7] });
  add(g, new THREE.SphereGeometry(0.06, 10, 8), toon('#ff5d73'), { p: [-0.3, 1.32, 0.7] });
  ['#ffd84d', '#39c6ff', '#6ee7a0'].forEach((c, i) => add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), toon(c), { p: [0.05 + i * 0.14, 1.17, 0.7 - (i % 2) * 0.05], r: [0.25, 0, 0] }));
  const glow = new THREE.Sprite(additive(glowTexture, new THREE.Color(def.color).getHex(), 0.35));
  glow.scale.set(1.8, 1.4, 1);
  glow.position.set(0, 1.62, 0.6);
  g.add(glow);
  return { group: g, screen, glow };
}

/** The high-score wall: best score on every machine, redrawn as scores come in. */
function scoreBoard() {
  const cw = 1024, ch = 512;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const x = c.getContext('2d');
    x.fillStyle = '#0c0a2a'; x.fillRect(0, 0, cw, ch);
    x.strokeStyle = '#ff4fd8'; x.lineWidth = 10; x.strokeRect(8, 8, cw - 16, ch - 16);
    x.font = '64px "Luckiest Guy", Rubik, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#ff4fd8'; x.shadowBlur = 20; x.fillStyle = '#ffffff'; x.fillText('HIGH SCORES', cw / 2, 62);
    x.shadowBlur = 0;
    ARCADE_GAMES.forEach((g, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const px = 50 + col * 480, py = 140 + row * 92;
      const top = S.arcade?.[g.id]?.[0];
      x.textAlign = 'left';
      x.font = '34px "Luckiest Guy", Rubik, sans-serif'; x.fillStyle = g.color; x.fillText(g.name.toUpperCase(), px, py);
      x.font = '28px Rubik, sans-serif'; x.fillStyle = top ? '#ffffff' : '#6a6a9a';
      x.fillText(top ? `${nameOf(top.k)} · ${fmt(top.s)}` : '— no score yet —', px, py + 38);
    });
    tex.needsUpdate = true;
  };
  draw();
  return { tex, draw };
}

export function arcadeArea(stage) {
  stage.lights({ background: '#0a0620', sky: 0xb9a0ff, ground: 0x2a1a4a, hemi: 1.0, sun: 0.7, sunPos: [6, 30, 12], box: 18 });
  const W = 26, D = 20;
  const g = room(stage, {
    w: W, d: D, floor: ['#1d1450', '#241a5e'], wall: '#2a1f5e', trim: '#ff4fd8',
    motif: (c) => { c.fillStyle = 'rgba(57,230,255,.25)'; for (const [x, y] of [[40, 50], [170, 190]]) { c.fillRect(x, y, 16, 16); c.fillRect(x + 20, y + 8, 8, 8); } },
  });
  stage.scene.add(g);
  const anim = [];
  const solids = [];

  // eight cabinets: a row along the back wall, and three down each side
  const spots = [
    [-7.5, -8.8, 0], [-2.5, -8.8, 0], [2.5, -8.8, 0], [7.5, -8.8, 0],
    [-11.8, -3, Math.PI / 2], [-11.8, 2, Math.PI / 2], [11.8, -3, -Math.PI / 2], [11.8, 2, -Math.PI / 2],
  ];
  ARCADE_GAMES.forEach((def, i) => {
    const [x, z, ry] = spots[i];
    const cab = cabinet(def);
    cab.group.position.set(x, 0, z);
    cab.group.rotation.y = ry;
    g.add(cab.group);
    solids.push(ry ? { x, z, w: 1.1, d: 1.3 } : { x, z, w: 1.3, d: 1.1 });
    const fx = x + Math.sin(ry) * 1.5, fz = z + Math.cos(ry) * 1.5;
    stage.interactable({ x: fx, z: fz, r: 1.5, label: `play ${def.name}`, icon: 'arcade', obj: cab.group,
      use: () => stage.openPanel({ wide: true, mount: (body) => arcadeCabinet(body, def.id) }) });
    anim.push((t) => { cab.glow.material.opacity = 0.25 + Math.sin(t * 2 + i) * 0.1; });
  });

  // the high-score wall above the back row
  const board = scoreBoard();
  add(g, new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: board.tex }), { p: [0, 3.3, -D / 2 + 0.06], cast: false });

  // a claw machine full of plushies, and a ticket counter
  const claw = new THREE.Group();
  claw.position.set(-9.5, 0, 7);
  g.add(claw);
  add(claw, new THREE.BoxGeometry(1.6, 1.0, 1.6), toon('#ff4fd8'), { p: [0, 0.5, 0], outline: true });
  add(claw, new THREE.BoxGeometry(1.5, 1.4, 1.5), toon('#dff4ff', { transparent: true, opacity: 0.3 }), { p: [0, 1.7, 0], cast: false });
  add(claw, new THREE.BoxGeometry(1.6, 0.2, 1.6), toon('#ff4fd8'), { p: [0, 2.5, 0], outline: true });
  ['#ffd84d', '#6ee7a0', '#39c6ff', '#ff9f43', '#b77bff', '#ff8fc7'].forEach((c, i) => add(claw, new THREE.SphereGeometry(0.18, 12, 10), toon(c), { p: [((i % 3) - 1) * 0.4, 1.15 + Math.floor(i / 3) * 0.2, (i % 2 ? 0.3 : -0.3)] }));
  const clawHead = add(claw, new THREE.ConeGeometry(0.14, 0.25, 6), toon('#c0c6d4'), { p: [0, 2.1, 0], r: [Math.PI, 0, 0] });
  anim.push((t) => { clawHead.position.x = Math.sin(t * 0.7) * 0.45; clawHead.position.z = Math.cos(t * 0.5) * 0.4; });
  solids.push({ x: -9.5, z: 7, w: 1.8, d: 1.8 });

  // neon strips on the floor edges pulse
  const strips = [];
  for (const s of [-1, 1]) strips.push(add(g, new THREE.BoxGeometry(W - 1, 0.03, 0.12), basic(s < 0 ? '#39e6ff' : '#ff4fd8'), { p: [0, 0.02, s * (D / 2 - 2.6)], cast: false }));
  anim.push((t) => strips.forEach((m, i) => { m.visible = Math.sin(t * 3 + i * Math.PI) > -0.6; }));

  const walker = openWalker(stage, { w: W, d: D, solids });
  const off = listen({ arcade_board: () => board.draw() });
  stage.onFrame((dt, now) => { for (const fn of anim) fn(now / 1000, dt); });
  stage.banner('<div class="big">🕹️ Arcade</div>Walk up to a cabinet and press <kbd>E</kbd> to play. Beat the high scores!', 3000);
  return () => { off(); walker.stop(); stage.scene?.remove(g); };
}
