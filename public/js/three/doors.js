// Front doors for the houses. buildDoor(id) returns the door set in its doorway: a casing round the
// opening on the room side, jamb liners through the wall's thickness (so there's never a gap to see
// through) and the door itself, sitting in the middle of the wall. In room tiles: the opening is 2
// wide and 2.2 tall, centred on the group's origin, with +Z pointing out through the wall.
import * as THREE from 'three';
import { toon, shiny, basic, canvasTexture } from './materials.js';

export const DOOR_W = 2, DOOR_H = 2.2, WALL_T = 0.265;
const PW = DOOR_W - 0.08, PH = DOOR_H - 0.04, PZ = WALL_T / 2; // the door leaf and where it sits

function add(g, geo, mat, p = [0, 0, 0], r = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  m.castShadow = true; // (not receiving shadows: the door's own parts would stripe themselves with shadow acne)
  g.add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Casing on the room side + liners through the wall. */
function frame(g, color, { casing = 0.16, header = 0.18 } = {}) {
  const c = toon(color);
  // casing on both faces of the wall, liners right through it
  // (standing just proud of the wall and the skirting board, never on the same plane as either)
  for (const z of [-0.042, WALL_T + 0.042]) {
    for (const sx of [-1, 1]) add(g, box(casing, DOOR_H + header, 0.07), c, [sx * (DOOR_W / 2 + casing / 2 - 0.02), (DOOR_H + header) / 2, z]);
    add(g, box(DOOR_W + casing * 2 + 0.06, header, 0.09), c, [0, DOOR_H + header / 2 - 0.02, z]);
  }
  for (const sx of [-1, 1]) add(g, box(0.05, DOOR_H + 0.02, WALL_T + 0.04), c, [sx * (DOOR_W / 2 - 0.025), DOOR_H / 2, WALL_T / 2]);
  add(g, box(DOOR_W, 0.05, WALL_T + 0.04), c, [0, DOOR_H - 0.025, WALL_T / 2]);
  add(g, box(DOOR_W, 0.03, WALL_T), toon('#8a8175'), [0, 0.015, WALL_T / 2]); // threshold
}

/** A leaf (one door slab), its room-side face at z = -d/2 relative to where it's put. */
function leaf(g, w, h, color, x = 0, d = 0.08) {
  return add(g, box(w, h, d), toon(color), [x, h / 2 + 0.02, PZ]);
}
const face = (d = 0.08) => PZ - d / 2; // room-side face of a leaf

function knob(g, x, y = 1.05, mat = shiny('#ffc53d')) {
  for (const z of [face() - 0.05, PZ + 0.09]) add(g, new THREE.SphereGeometry(0.075, 12, 10), mat, [x, y, z]);
}
function lever(g, x, y = 1.05, mat = shiny('#d9dde6')) {
  for (const [z, s] of [[face() - 0.04, -1], [PZ + 0.08, 1]]) {
    add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.07, 10), mat, [x, y, z], [Math.PI / 2, 0, 0]);
    add(g, box(0.28, 0.04, 0.04), mat, [x - 0.12, y, z + s * 0.03]);
  }
}
/** A raised panel on both faces of the leaf. */
function panel(g, x, y, w, h, color) {
  for (const z of [face() - 0.015, PZ + 0.055]) add(g, box(w, h, 0.03), toon(color), [x, y, z]);
}

const STYLES = {
  door_classic(g) {
    frame(g, '#8b5a2b');
    leaf(g, PW, PH, '#7a4a28');
    for (const y of [0.6, 1.55]) panel(g, 0, y, PW * 0.72, 0.72, '#8e5a32');
    knob(g, PW / 2 - 0.2);
  },
  door_white(g) {
    frame(g, '#f4f0ea');
    leaf(g, PW, PH, '#ffffff');
    for (const x of [-0.42, 0.42]) for (const [y, h] of [[0.45, 0.55], [1.1, 0.5], [1.7, 0.55]]) panel(g, x, y, 0.7, h, '#f1ede6');
    lever(g, PW / 2 - 0.18);
  },
  door_red(g) {
    frame(g, '#ffffff');
    leaf(g, PW, PH, '#c8243a');
    for (const x of [-0.42, 0.42]) { panel(g, x, 0.55, 0.66, 0.7, '#b01e32'); panel(g, x, 1.55, 0.66, 0.8, '#b01e32'); }
    const brass = shiny('#ffc53d');
    add(g, box(0.5, 0.1, 0.04), brass, [0, 1.12, face() - 0.03]); // letterbox
    add(g, new THREE.TorusGeometry(0.12, 0.025, 8, 18), brass, [0, 1.7, face() - 0.05]); // knocker
    add(g, new THREE.SphereGeometry(0.05, 10, 8), brass, [0, 1.83, face() - 0.05]);
    knob(g, PW / 2 - 0.2, 1.05, brass);
  },
  door_barn(g) {
    // a sliding barn door hung on a rail across the room side
    frame(g, '#5a3a22');
    leaf(g, PW, PH, '#3a2618', 0, 0.04);
    const wood = toon('#a0643a'), dark = toon('#7a4a28');
    const bw = DOOR_W + 0.36, z = -0.09;
    for (let i = 0; i < 6; i++) add(g, box(bw / 6 - 0.02, DOOR_H + 0.05, 0.07), i % 2 ? wood : toon('#94592f'), [-bw / 2 + (i + 0.5) * (bw / 6), (DOOR_H + 0.05) / 2, z]);
    for (const y of [0.25, DOOR_H - 0.2]) add(g, box(bw, 0.2, 0.05), dark, [0, y, z - 0.06]);
    const diag = Math.hypot(bw - 0.3, DOOR_H - 0.6);
    add(g, box(0.2, diag, 0.05), dark, [0, DOOR_H / 2, z - 0.06], [0, 0, Math.atan2(bw - 0.3, DOOR_H - 0.6)]);
    const iron = toon('#2b2b33');
    add(g, box(bw + 1.2, 0.08, 0.06), iron, [0.4, DOOR_H + 0.22, -0.05]);
    for (const x of [-bw / 2 + 0.35, bw / 2 - 0.35]) {
      add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.05, 14), iron, [x, DOOR_H + 0.2, -0.1], [Math.PI / 2, 0, 0]);
      add(g, box(0.05, 0.3, 0.03), iron, [x, DOOR_H + 0.05, -0.13]);
    }
    add(g, box(0.06, 0.5, 0.06), iron, [bw / 2 - 0.25, 1.05, z - 0.08]);
  },
  door_french(g) {
    // double doors, mostly glass
    frame(g, '#ffffff');
    const glass = toon('#bfe6ff', { emissive: '#9fd6ff', emissiveIntensity: 0.45 });
    const white = toon('#ffffff');
    for (const sx of [-1, 1]) {
      const cx = sx * PW / 4;
      add(g, box(PW / 2 - 0.02, PH, 0.05), glass, [cx, PH / 2 + 0.02, PZ]);
      // the frame of each leaf and its glazing bars
      for (const x of [cx - PW / 4 + 0.05, cx + PW / 4 - 0.05]) add(g, box(0.1, PH, 0.1), white, [x, PH / 2 + 0.02, PZ]);
      for (const y of [0.08, 0.45, 0.95, 1.45, PH - 0.04]) add(g, box(PW / 2, y < 0.1 || y > 2 ? 0.1 : 0.05, 0.1), white, [cx, y + 0.02, PZ]);
      add(g, box(PW / 2, 0.35, 0.1), white, [cx, 0.2, PZ]);
      add(g, box(0.04, PH - 0.5, 0.09), white, [cx, (PH + 0.4) / 2, PZ]);
      lever(g, sx * 0.15 + 0.12, 1.05);
    }
  },
  door_castle(g) {
    // heavy oak planks, iron straps and studs, a ring pull, under a stone surround
    frame(g, '#8f8a99', { casing: 0.26, header: 0.3 });
    leaf(g, PW, PH, '#4a3020', 0, 0.1);
    for (let i = 0; i < 5; i++) for (const z of [face(0.1) - 0.01, PZ + 0.06]) add(g, box(0.02, PH - 0.05, 0.02), toon('#2e1c12'), [-PW / 2 + (i + 1) * PW / 6, PH / 2 + 0.02, z]);
    const iron = toon('#2b2b33');
    for (const y of [0.4, 1.1, 1.85]) {
      add(g, box(PW - 0.1, 0.12, 0.03), iron, [0, y, face(0.1) - 0.02]);
      for (let i = 0; i < 6; i++) add(g, new THREE.SphereGeometry(0.035, 8, 6), iron, [-PW / 2 + 0.15 + i * (PW - 0.3) / 5, y, face(0.1) - 0.04]);
    }
    add(g, new THREE.TorusGeometry(0.13, 0.025, 8, 18), iron, [PW / 2 - 0.3, 0.95, face(0.1) - 0.05]);
    // keystone blocks on the surround
    for (const [x, y] of [[-DOOR_W / 2 - 0.13, 0.6], [DOOR_W / 2 + 0.13, 1.2], [-DOOR_W / 2 - 0.13, 1.8], [0, DOOR_H + 0.13]]) add(g, box(0.3, 0.26, 0.1), toon('#a39ead'), [x, y, -0.07]);
  },
  door_candy(g) {
    frame(g, '#6ee7c0');
    leaf(g, PW, PH, '#ff9fc7');
    const heart = new THREE.Shape();
    heart.moveTo(0, -0.22); heart.bezierCurveTo(-0.36, 0.02, -0.2, 0.3, 0, 0.14); heart.bezierCurveTo(0.2, 0.3, 0.36, 0.02, 0, -0.22);
    const hg = new THREE.ExtrudeGeometry(heart, { depth: 0.02, bevelEnabled: false });
    for (const z of [face() - 0.02, PZ + 0.04]) add(g, hg, toon('#fff4a8', { emissive: '#fff4a8', emissiveIntensity: 0.4 }), [0, 1.6, z]);
    for (const y of [0.4, 0.75]) add(g, box(PW * 0.7, 0.08, 0.1), toon('#ffffff'), [0, y, PZ]);
    knob(g, PW / 2 - 0.2, 1.05, toon('#6ee7c0'));
  },
  door_scifi(g) {
    // sliding metal panels split by a glowing seam, with a lit keypad
    frame(g, '#3a3f55', { casing: 0.2, header: 0.24 });
    const metal = shiny('#9aa3b8'), dark = toon('#2b2f45');
    for (const sx of [-1, 1]) {
      const cx = sx * (PW / 4 + 0.01);
      add(g, box(PW / 2 - 0.02, PH, 0.08), metal, [cx, PH / 2 + 0.02, PZ]);
      for (const z of [face() - 0.01, PZ + 0.05]) {
        add(g, box(PW / 2 - 0.2, 0.08, 0.02), dark, [cx, 0.6, z]);
        add(g, box(PW / 2 - 0.2, 0.08, 0.02), dark, [cx, 1.7, z]);
        add(g, box(0.1, 0.8, 0.02), dark, [sx * 0.2, 1.15, z]);
      }
    }
    const neon = basic('#39e6ff');
    add(g, box(0.04, PH, 0.1), neon, [0, PH / 2 + 0.02, PZ]);
    add(g, box(DOOR_W + 0.4, 0.05, 0.05), neon, [0, DOOR_H + 0.26, -0.06]);
    add(g, box(0.22, 0.34, 0.05), dark, [DOOR_W / 2 + 0.36, 1.1, -0.04]);
    for (let i = 0; i < 6; i++) add(g, box(0.05, 0.05, 0.02), basic(i === 5 ? '#6ee7a0' : '#39e6ff'), [DOOR_W / 2 + 0.3 + (i % 2) * 0.1, 1.2 - ((i / 2) | 0) * 0.09, -0.07]);
  },
};

export function buildDoor(id) {
  const g = new THREE.Group();
  (STYLES[id] ?? STYLES.door_classic)(g);
  return g;
}

// ---- little pictures for the shop and style picker ------------------------------------------------
const PICS = {
  door_classic: { frame: '#8b5a2b', leaf: '#7a4a28', panels: '#8e5a32', knob: '#ffc53d' },
  door_white: { frame: '#e6e1d8', leaf: '#ffffff', panels: '#ece7de', knob: '#aab0bd', six: true },
  door_red: { frame: '#ffffff', leaf: '#c8243a', panels: '#b01e32', knob: '#ffc53d', six: false },
  door_barn: { frame: '#5a3a22', leaf: '#a0643a', knob: '#2b2b33', barn: true },
  door_french: { frame: '#ffffff', leaf: '#bfe6ff', knob: '#d9dde6', glass: true },
  door_castle: { frame: '#8f8a99', leaf: '#4a3020', knob: '#2b2b33', straps: true },
  door_candy: { frame: '#6ee7c0', leaf: '#ff9fc7', knob: '#6ee7c0', heart: true },
  door_scifi: { frame: '#3a3f55', leaf: '#9aa3b8', knob: '#39e6ff', scifi: true },
};
const pics = new Map();
export function doorImage(id) {
  if (pics.has(id)) return pics.get(id);
  const d = PICS[id] ?? PICS.door_classic;
  const tex = canvasTexture(96, 96, (c) => {
    c.fillStyle = '#efe6d6'; c.fillRect(0, 0, 96, 96);
    c.fillStyle = d.frame; c.fillRect(24, 8, 48, 88);
    c.fillStyle = d.leaf; c.fillRect(30, 14, 36, 82);
    c.fillStyle = d.panels ?? d.leaf;
    if (d.six) for (const x of [33, 49]) for (const [y, h] of [[18, 22], [44, 18], [66, 26]]) c.fillRect(x, y, 14, h);
    else if (d.panels) { c.fillRect(34, 20, 28, 30); c.fillRect(34, 56, 28, 34); }
    if (d.barn) { c.strokeStyle = '#6b3f22'; c.lineWidth = 3; for (let x = 36; x < 66; x += 6) { c.beginPath(); c.moveTo(x, 14); c.lineTo(x, 96); c.stroke(); } c.lineWidth = 5; c.beginPath(); c.moveTo(32, 90); c.lineTo(64, 20); c.stroke(); c.fillStyle = '#2b2b33'; c.fillRect(18, 8, 62, 4); }
    if (d.glass) { c.fillStyle = '#ffffff'; c.fillRect(46, 14, 4, 82); for (const y of [36, 58, 80]) c.fillRect(30, y, 36, 3); }
    if (d.straps) { c.fillStyle = '#2b2b33'; for (const y of [26, 52, 80]) c.fillRect(30, y, 36, 5); }
    if (d.heart) { c.fillStyle = '#fff4a8'; c.font = '20px sans-serif'; c.textAlign = 'center'; c.fillText('♥', 48, 38); }
    if (d.scifi) { c.fillStyle = '#39e6ff'; c.fillRect(47, 14, 3, 82); c.fillRect(20, 4, 56, 3); }
    c.fillStyle = d.knob; c.beginPath(); c.arc(d.glass || d.scifi ? 44 : 60, 58, 3.5, 0, Math.PI * 2); c.fill();
  });
  const url = tex.image.toDataURL();
  pics.set(id, url);
  return url;
}
