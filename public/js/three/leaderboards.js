// Leaderboard signs out in the town: a wooden board on two posts by the Boss Cave (deepest dungeon
// floor) and the Archery Range (best score), listing the zone's top five. They redraw as stats change.
import * as THREE from 'three';
import * as M from '../map.js';
import { S, fmt } from '../state.js';
import { toon, outlineMaterial } from './materials.js';

const OUT = outlineMaterial(0.03);
const BOARDS = [
  { spot: 'dungeon', title: 'DEEPEST DUNGEON', stat: 'dungeonBest', unit: (v) => `Floor ${v}`, color: '#7c6bff' },
  { spot: 'archery', title: 'ARCHERY LEGENDS', stat: 'archeryBest', unit: (v) => `${v}/50`, color: '#37c871' },
  { spot: 'race', title: 'RACE CHAMPIONS', stat: 'raceWins', unit: (v) => `${v} wins`, color: '#e0463c' },
  { spot: 'arenaWins', title: 'ARENA VICTORIES', stat: 'arenaWins', unit: (v) => `${v} wins`, color: '#ff9f43' },
  { spot: 'arenaKills', title: 'ARENA KNOCKOUTS', stat: 'elims', unit: (v) => `${v} KOs`, color: '#d6334a' },
  { spot: 'fish', title: 'MASTER ANGLERS', stat: 'fish', unit: (v) => `${v} fish`, color: '#3b82f6' },
];

function mesh(parent, geo, mat, p, outline = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.castShadow = true;
  if (outline) m.add(new THREE.Mesh(geo, OUT));
  parent.add(m);
  return m;
}

export function buildLeaderboards(scene) {
  const list = BOARDS.map((b) => {
    // beside the door, a little out in front, turned slightly towards the path
    const { x: px, y: py, face: facing } = M.BOARD_SPOTS.find((s) => s.id === b.spot);
    const g = new THREE.Group();
    const p = M.to3(px, py);
    g.position.set(p.x, M.groundAt(px, py), p.z);
    g.rotation.y = facing;
    g.scale.setScalar(1.9);
    scene.add(g);
    const wood = toon('#8b5a2b'), dark = toon('#5a3a1e');
    for (const x of [-1.6, 1.6]) mesh(g, new THREE.BoxGeometry(0.22, 4.2, 0.22), dark, [x, 2.1, 0]);
    mesh(g, new THREE.BoxGeometry(3.7, 2.7, 0.18), wood, [0, 2.85, 0]);
    mesh(g, new THREE.BoxGeometry(3.9, 0.22, 0.34), dark, [0, 4.3, 0]);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 372;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.45, 2.5), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(0, 2.85, 0.1);
    g.add(face);
    const back = face.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.1;
    g.add(back);
    return { ...b, c, tex, key: '' };
  });

  const draw = (bd) => {
    const rows = Object.values(S.players ?? {}).filter((p) => (p.stats?.[bd.stat] ?? 0) > 0)
      .sort((a, b) => b.stats[bd.stat] - a.stats[bd.stat] || a.name.localeCompare(b.name)).slice(0, 5);
    const key = rows.map((p) => `${p.name}:${p.stats[bd.stat]}`).join('|');
    if (key === bd.key) return;
    bd.key = key;
    const x = bd.c.getContext('2d');
    x.fillStyle = '#f3e2c0'; x.fillRect(0, 0, 512, 372);
    x.fillStyle = 'rgba(139,90,43,.12)'; for (let y = 0; y < 372; y += 18) x.fillRect(0, y, 512, 2);
    x.fillStyle = bd.color; x.fillRect(0, 0, 512, 70);
    x.font = '40px "Luckiest Guy", Rubik, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#1a1330'; x.strokeText(bd.title, 256, 38); x.fillStyle = '#fff'; x.fillText(bd.title, 256, 38);
    if (!rows.length) { x.font = '26px Rubik, sans-serif'; x.fillStyle = '#6b4a2b'; x.fillText('No records yet. Be the first!', 256, 210); }
    rows.forEach((p, i) => {
      const y = 104 + i * 56;
      x.textAlign = 'left'; x.font = '32px "Luckiest Guy", Rubik, sans-serif';
      x.fillStyle = ['#e0a020', '#8a93a8', '#b5652a', '#6b4a2b', '#6b4a2b'][i]; x.fillText(`${i + 1}.`, 28, y);
      x.fillStyle = '#3a2410'; x.font = '30px Rubik, sans-serif';
      const name = p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name;
      x.fillText(name, 82, y);
      x.textAlign = 'right'; x.font = '30px "Luckiest Guy", Rubik, sans-serif'; x.fillStyle = bd.color;
      x.fillText(bd.unit(fmt(p.stats[bd.stat])), 486, y);
    });
    bd.tex.needsUpdate = true;
  };
  const refresh = () => list.forEach(draw);
  refresh();
  document.fonts?.ready?.then(() => { list.forEach((b) => { b.key = '*'; }); refresh(); });
  return { refresh };
}
