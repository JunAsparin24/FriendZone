// Leaderboards out in the town, one by each game: a floating glass panel listing the zone's top eight
// (with each player's face), and the current #1 standing beside it on a glowing pedestal under a
// spinning trophy. They redraw as stats change.
import * as THREE from 'three';
import * as M from '../map.js';
import { S, fmt } from '../state.js';
import { toon, shiny, outlineMaterial, additive, glowTexture } from './materials.js';
import { Character } from './character.js';
import { avatarCanvas } from '../avatar.js';

const OUT = outlineMaterial(0.03);
const ROWS = 8;
const CW = 560, CH = 720; // canvas size
const BOARDS = [
  { spot: 'dungeon', title: 'DEEPEST DUNGEON', icon: '👾', stat: 'dungeonBest', unit: (v) => `Floor ${v}`, color: '#7c6bff' },
  { spot: 'archery', title: 'ARCHERY LEGENDS', icon: '🏹', stat: 'archeryBest', unit: (v) => `${v}/50`, color: '#37c871' },
  { spot: 'race', title: 'RACE CHAMPIONS', icon: '🏎️', stat: 'raceWins', unit: (v) => `${v} wins`, color: '#e0463c' },
  { spot: 'arenaWins', title: 'ARENA VICTORIES', icon: '⚔️', stat: 'arenaWins', unit: (v) => `${v} wins`, color: '#ff9f43' },
  { spot: 'arenaKills', title: 'ARENA KNOCKOUTS', icon: '💥', stat: 'elims', unit: (v) => `${v} KOs`, color: '#d6334a' },
  { spot: 'fish', title: 'MASTER ANGLERS', icon: '🎣', stat: 'fish', unit: (v) => `${v} fish`, color: '#3b82f6' },
];
// name colours by place: gold, ice-blue, bronze, then white
const PLACE = [
  { fill: ['#fff3a0', '#ffc53d'], ring: '#ffc53d' },
  { fill: ['#e8fbff', '#5fd8ff'], ring: '#5fd8ff' },
  { fill: ['#ffd9b0', '#ff8a3a'], ring: '#ff8a3a' },
];
const FONT = '"Fredoka", "Rubik", sans-serif';

function mesh(parent, geo, mat, p, outline = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.castShadow = true;
  if (outline) m.add(new THREE.Mesh(geo, OUT));
  parent.add(m);
  return m;
}

function trophy() {
  const g = new THREE.Group();
  const gold = shiny('#ffc53d', { metalness: 0.75, roughness: 0.25 });
  mesh(g, new THREE.CylinderGeometry(0.2, 0.12, 0.28, 18, 1, true), gold, [0, 0.2, 0]);
  mesh(g, new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), gold, [0, 0.08, 0], false);
  for (const s of [-1, 1]) mesh(g, new THREE.TorusGeometry(0.07, 0.018, 6, 14, Math.PI), gold, [s * 0.2, 0.22, 0], false).rotation.z = s * Math.PI / 2;
  mesh(g, new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), gold, [0, -0.02, 0], false);
  mesh(g, new THREE.BoxGeometry(0.22, 0.06, 0.16), toon('#3a2a5a'), [0, -0.1, 0]);
  const glow = new THREE.Sprite(additive(glowTexture, 0xffd84d, 0.55));
  glow.scale.setScalar(1.1);
  glow.position.y = 0.15;
  g.add(glow);
  return g;
}

export function buildLeaderboards(scene) {
  const list = BOARDS.map((b) => {
    const { x: px, y: py, face: facing } = M.BOARD_SPOTS.find((s) => s.id === b.spot);
    const g = new THREE.Group();
    const p = M.to3(px, py);
    g.position.set(p.x, M.groundAt(px, py), p.z);
    g.rotation.y = facing;
    g.scale.setScalar(1.6);
    scene.add(g);
    // the floating glass panel
    const float = new THREE.Group();
    g.add(float);
    const glow = new THREE.Sprite(additive(glowTexture, new THREE.Color(b.color).getHex(), 0.4));
    glow.scale.set(5.6, 6.4, 1);
    glow.position.set(0, 3.3, -0.1);
    float.add(glow);
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const W = 3.5, H = W * (CH / CW);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    face.position.set(0, 3.3, 0);
    float.add(face);
    // a thin coloured frame round the glass
    const frame = new THREE.MeshBasicMaterial({ color: b.color });
    for (const [x, y, w, h] of [[0, 3.3 + H / 2, W + 0.08, 0.05], [0, 3.3 - H / 2, W + 0.08, 0.05], [-W / 2, 3.3, 0.05, H], [W / 2, 3.3, 0.05, H]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frame);
      bar.position.set(x, y, 0);
      float.add(bar);
    }
    // the champion's pedestal beside the board
    const podium = new THREE.Group();
    podium.position.set(-W / 2 - 1.1, 0, 0.4);
    g.add(podium);
    mesh(podium, new THREE.CylinderGeometry(0.62, 0.72, 0.4, 24), toon('#2a2f55'), [0, 0.2, 0]);
    mesh(podium, new THREE.CylinderGeometry(0.64, 0.64, 0.06, 24), toon(b.color), [0, 0.42, 0], false);
    const ring = new THREE.Sprite(additive(glowTexture, new THREE.Color(b.color).getHex(), 0.5));
    ring.scale.set(2.2, 1.1, 1);
    ring.position.y = 0.5;
    podium.add(ring);
    const cup = trophy();
    podium.add(cup);
    return { ...b, c, tex, key: '', float, podium, cup, champ: null, champKey: '', phase: Math.random() * 6, waveAt: 3 + Math.random() * 5 };
  });

  const draw = (bd) => {
    const rows = Object.values(S.players ?? {}).filter((p) => (p.stats?.[bd.stat] ?? 0) > 0)
      .sort((a, b) => b.stats[bd.stat] - a.stats[bd.stat] || a.name.localeCompare(b.name)).slice(0, ROWS);
    const key = rows.map((p) => `${p.name}:${p.stats[bd.stat]}:${JSON.stringify(p.look)}`).join('|');
    if (key === bd.key) return;
    bd.key = key;
    const x = bd.c.getContext('2d');
    x.clearRect(0, 0, CW, CH);
    // dark glass
    x.fillStyle = 'rgba(12,16,42,0.86)';
    x.beginPath(); x.roundRect(0, 0, CW, CH, 26); x.fill();
    const sheen = x.createLinearGradient(0, 0, CW, CH);
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.4, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,0.04)');
    x.fillStyle = sheen; x.fill();
    // header
    const hg = x.createLinearGradient(0, 0, 0, 96);
    hg.addColorStop(0, bd.color); hg.addColorStop(1, new THREE.Color(bd.color).multiplyScalar(0.6).getStyle());
    x.fillStyle = hg;
    x.beginPath(); x.roundRect(0, 0, CW, 96, [26, 26, 0, 0]); x.fill();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `46px "Luckiest Guy", ${FONT}`;
    x.lineWidth = 8; x.strokeStyle = '#140c2a'; x.strokeText(bd.title, CW / 2 + 18, 52);
    x.fillStyle = '#ffffff'; x.fillText(bd.title, CW / 2 + 18, 52);
    x.font = '40px sans-serif'; x.fillText(bd.icon, 42, 50);
    if (!rows.length) {
      x.font = `600 30px ${FONT}`; x.fillStyle = '#c3c9e4';
      x.fillText('No records yet.', CW / 2, CH / 2 - 10);
      x.fillText('Be the first!', CW / 2, CH / 2 + 30);
    }
    const rowH = (CH - 120) / ROWS;
    rows.forEach((p, i) => {
      const cy = 110 + i * rowH + rowH / 2;
      if (i % 2 === 0) { x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(14, cy - rowH / 2 + 3, CW - 28, rowH - 6); }
      const place = PLACE[i];
      // face, in a ring coloured by place
      const r = rowH * 0.38, ax = 44;
      x.save();
      x.beginPath(); x.arc(ax, cy, r, 0, Math.PI * 2); x.closePath();
      x.fillStyle = '#2a3160'; x.fill();
      x.clip();
      try { x.drawImage(avatarCanvas(p.look, 64, 64, { zoom: 'head' }), ax - r, cy - r, r * 2, r * 2); } catch { /* not ready */ }
      x.restore();
      x.lineWidth = 4; x.strokeStyle = place?.ring ?? p.color ?? '#8a93c8';
      x.beginPath(); x.arc(ax, cy, r, 0, Math.PI * 2); x.stroke();
      // name and score, bold with a dark outline; the podium places shine in gold, blue and bronze
      const fill = place ? (() => { const gr = x.createLinearGradient(0, cy - 18, 0, cy + 18); gr.addColorStop(0, place.fill[0]); gr.addColorStop(1, place.fill[1]); return gr; })() : '#ffffff';
      x.textBaseline = 'middle';
      x.font = `700 ${i < 3 ? 34 : 30}px ${FONT}`;
      x.lineWidth = 7; x.strokeStyle = '#0a0d24';
      const name = p.name.length > 13 ? `${p.name.slice(0, 12)}…` : p.name;
      x.textAlign = 'left';
      x.strokeText(name, 86, cy + 1); x.fillStyle = fill; x.fillText(name, 86, cy + 1);
      x.textAlign = 'right';
      const val = bd.unit(fmt(p.stats[bd.stat]));
      x.strokeText(val, CW - 26, cy + 1); x.fillStyle = fill; x.fillText(val, CW - 26, cy + 1);
    });
    bd.tex.needsUpdate = true;
    // the #1 steps up onto the pedestal (rebuilt only when the leader or their outfit changes)
    const top = rows[0];
    const champKey = top ? `${top.key}:${JSON.stringify(top.look)}` : '';
    if (champKey !== bd.champKey) {
      bd.champKey = champKey;
      if (bd.champ) { bd.podium.remove(bd.champ.root); bd.champ = null; }
      if (top) {
        bd.champ = new Character(top.look);
        bd.champ.root.position.y = 0.45;
        bd.champ.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        bd.podium.add(bd.champ.root);
      }
    }
  };
  const refresh = () => list.forEach(draw);
  refresh();
  document.fonts?.ready?.then(() => { list.forEach((b) => { b.key = '*'; }); refresh(); });
  let last = 0;
  const tick = (t) => {
    const dt = Math.min(0.1, Math.max(0, t - last));
    last = t;
    list.forEach((b) => {
      b.float.position.y = 0.3 + Math.sin(t * 1.2 + b.phase) * 0.1;
      const headY = b.champ ? 3.0 : 1.2;
      b.cup.position.y = headY + Math.sin(t * 2 + b.phase) * 0.08;
      b.cup.rotation.y = t * 1.5;
      if (b.champ) {
        b.champ.update(dt, t, false);
        if (t > b.waveAt) { b.champ.emote(Math.random() < 0.5 ? 'wave' : 'gg'); b.waveAt = t + 6 + Math.random() * 8; }
      }
    });
  };
  return { refresh, tick };
}
