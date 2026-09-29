// World layout shared by the 3D renderer, movement/collision and the minimap.
// Positions are in "map pixels" (the same units the server uses): 4800 x 3200. The town grows out
// from the square in the middle: shops and the studio around it, the games in their own districts,
// a residential lane to the south, a creek running down from the northwest hills into the lake.
export const W = 4800;
export const H = 3200;
export const TAU = Math.PI * 2;
export const CENTER = { x: W / 2, y: H / 2 };
export const PLAZA_R = 170;
export const FOUNTAIN_R = 46;
/** Map pixels per 3D world unit. */
export const PX = 20;

export const EMOTES = { wave: '👋', laugh: '😂', heart: '❤️', fire: '🔥', gg: 'GG', wow: '😮' };

// `face` is the side the door is on (default 's'); buildings turn to face their street.
// For 'e'/'w' the footprint is already turned (w runs along x, h along y).
export const SPOTS = [
  { id: 'doodle', emoji: '🎨', name: 'Doodle Studio', kind: 'studio', x: 1990, y: 1080, w: 260, h: 210 },
  { id: 'shop', emoji: '👕', name: 'Style Shop', kind: 'boutique', x: 2620, y: 1070, w: 330, h: 220 },
  { id: 'trading', emoji: '💰', name: 'Trading Post', kind: 'market', x: 1830, y: 1440, w: 190, h: 310, face: 'e' },
  { id: 'racing', emoji: '🏎️', name: 'Race Track', kind: 'garage', x: 2160, y: 200, w: 470, h: 250 },
  { id: 'boss', emoji: '👾', name: 'Boss Cave', kind: 'cave', x: 1140, y: 390, w: 320, h: 230 },
  { id: 'bumper', emoji: '💥', name: 'Bumper Dome', kind: 'dome', x: 3000, y: 640, w: 260, h: 210 },
  { id: 'arena', emoji: '⚔️', name: 'Arena', kind: 'colosseum', x: 3480, y: 420, w: 470, h: 290 },
  { id: 'casino', emoji: '🎰', name: 'Casino', kind: 'casino', x: 3920, y: 1400, w: 250, h: 340, face: 'w' },
  { id: 'archery', emoji: '🏹', name: 'Archery Range', kind: 'range', x: 640, y: 1310, w: 220, h: 320, face: 'e' },
  { id: 'fishing', emoji: '🎣', name: 'Fishing Pond', kind: 'pond', x: 560, y: 2140, w: 640, h: 380 },
  { id: 'house', emoji: '🏠', name: 'Houses', kind: 'houses', x: 2230, y: 2330, w: 380, h: 270, face: 'n' },
  { id: 'pets', emoji: '🐾', name: 'Pet Shop', kind: 'petshop', x: 3230, y: 1720, w: 280, h: 210, face: 'n' },
];

/** The part of a spot you can't walk through (buildings: the lower part; ponds: all of it). */
export const solidOf = (s) => (s.kind === 'pond' ? { x: s.x, y: s.y - 14, w: s.w, h: s.h + 14 } : { x: s.x, y: s.y + s.h * 0.42, w: s.w, h: s.h * 0.58 });
export function doorOf(s) {
  if (s.kind === 'pond') return { x: s.x + s.w / 2, y: s.y - 30 };
  if (s.face === 'n') return { x: s.x + s.w / 2, y: s.y - 20 };
  if (s.face === 'e') return { x: s.x + s.w + 20, y: s.y + s.h / 2 };
  if (s.face === 'w') return { x: s.x - 20, y: s.y + s.h / 2 };
  return { x: s.x + s.w / 2, y: s.y + s.h + 20 };
}
/** Unit vector pointing out of the door. */
export const doorDir = (s) => ({ n: [0, -1], e: [1, 0], w: [-1, 0] }[s.kind === 'pond' ? 'n' : s.face] ?? [0, 1]);

export function distToRect(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

export function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** Map pixels -> 3D world coordinates (x, z). */
export const to3 = (x, y) => ({ x: (x - CENTER.x) / PX, z: (y - CENTER.y) / PX });

// ---- terrain -------------------------------------------------------------------------
// Hills with flat tops (the Boss Cave sits on the northwest one, dug into its slope). Heights are
// in 3D world units; everything else in the town stays at ground level.
export const HILLS = [
  { x: 1300, y: 640, r: 600, h: 5.5, top: 0.42 },   // the highland: cave + windmill
  { x: 380, y: 700, r: 330, h: 2.6, top: 0.2 },
  { x: 4330, y: 520, r: 430, h: 3.6, top: 0.25 },   // lookout hill behind the arena
  { x: 3950, y: 2760, r: 420, h: 3.0, top: 0.3 },   // orchard hill
  { x: 1500, y: 2900, r: 300, h: 1.6, top: 0.2 },
];
export function heightAt(x, y) {
  let h = 0;
  for (const hl of HILLS) {
    const d = Math.hypot(x - hl.x, y - hl.y) / hl.r;
    if (d >= 1) continue;
    const k = d <= hl.top ? 1 : 0.5 * (1 + Math.cos(Math.PI * (d - hl.top) / (1 - hl.top)));
    h = Math.max(h, hl.h * k);
  }
  return h;
}

// ---- roads -----------------------------------------------------------------------------
// Streets are smooth curves through a few control points (Catmull-Rom), sampled into `pts`.
function spline(ctrl, step = 22) {
  const pts = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const last = ctrl[ctrl.length - 1];
  pts.push({ x: last[0], y: last[1] });
  return pts;
}
const door = (id) => { const d = doorOf(SPOTS.find((s) => s.id === id)); return [d.x, d.y]; };
const C = CENTER;
const ROADS = [
  { name: 'Main Street', w: 1.1, lamps: true, ctrl: [[C.x + 160, C.y + 20], [2950, 1640], [3420, 1600], door('casino')] },
  { name: 'Speedway Road', w: 1, lamps: true, ctrl: [[C.x, C.y - 165], [2410, 1250], [2380, 800], door('racing')] },
  { name: 'Highland Road', w: 0.9, lamps: true, ctrl: [[C.x - 130, C.y - 110], [2000, 1330], [1760, 1120], [1600, 900], [1440, 720], door('boss')] },
  { name: 'Market Street', w: 1, lamps: true, ctrl: [[C.x - 165, C.y + 10], door('trading'), [1640, 1560], [1250, 1520], door('archery')] },
  { name: 'Lakeside Walk', w: 0.8, ctrl: [[1300, 1528], [1180, 1780], [1020, 1990], door('fishing')] },
  { name: 'Maple Lane', w: 0.9, lamps: true, ctrl: [[C.x, C.y + 165], [2410, 1900], door('house')] },
  { name: 'Maple Lane', w: 0.85, ctrl: [[1640, 2190], [2050, 2200], [2420, 2230], [2850, 2210], [3280, 2240], [3560, 2330]] },
  { name: 'Stadium Way', w: 0.9, lamps: true, ctrl: [[2950, 1640], [3060, 1260], door('bumper')] },
  { name: 'Stadium Way', w: 0.85, ctrl: [[3060, 1260], [3420, 1070], door('arena')] },
  { name: 'Pet Walk', w: 0.7, ctrl: [[3300, 1612], door('pets')] },
  { name: 'Studio Walk', w: 0.7, ctrl: [door('doodle'), [2190, 1420], [C.x - 110, C.y - 130]] },
  { name: 'Shop Walk', w: 0.7, ctrl: [door('shop'), [2700, 1400], [C.x + 120, C.y - 125]] },
];
export const PATHS = ROADS.map((r) => ({ ...r, pts: spline(r.ctrl) }));
export const nearPath = (p, margin) => PATHS.some((path) => path.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < margin * path.w));

// the creek runs down from the highland into the lake; roads cross it on little bridges
export const CREEK = spline([[1560, 1000], [1450, 1260], [1480, 1500], [1360, 1760], [1220, 1960], [1130, 2170]], 18);
export const nearCreek = (p, margin) => CREEK.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < margin);

// ---- town furniture ------------------------------------------------------------------------
// cottages along Maple Lane (decoration: the real houses are inside the Houses building)
const COTTAGE_COLORS = ['#ffd6a5', '#bde0fe', '#ffc8dd', '#caffbf', '#fdffb6', '#e0c3fc', '#ffadad', '#a0c4ff'];
const ROOFS = ['#d6334a', '#3b5bdb', '#2f9e44', '#8b5a2b', '#7048e8', '#e8590c'];
export const COTTAGES = [
  [1700, 2030, 's'], [1880, 2040, 's'], [2690, 2050, 's'], [2880, 2040, 's'], [3080, 2060, 's'],
  [1690, 2320, 'n'], [1890, 2330, 'n'], [2720, 2340, 'n'], [2920, 2330, 'n'], [3130, 2360, 'n'],
].map(([x, y, face], i) => ({ x, y, w: 130, h: 110, face, color: COTTAGE_COLORS[i % COTTAGE_COLORS.length], roof: ROOFS[(i * 5) % ROOFS.length] }));
// market stalls between the square and the trading post
export const STALLS = [[2060, 1780, 0], [2170, 1840, 0.3], [1720, 1300, 0], [1690, 1820, 3.14]].map(([x, y, r], i) => ({ x, y, r, color: ['#ff5d73', '#39c6ff', '#ffd84d', '#6ee7a0'][i] }));
export const LANDMARKS = {
  windmill: { x: 1560, y: 560 },
  gazebo: { x: 3560, y: 2560 },
  well: { x: 1500, y: 1650 },
  lighthouse: { x: 520, y: 2600 },
};

/** Is this point clear of the square, buildings, streets, water and props (for scattering things)? */
export function openGround(p, pad = 10) {
  if (Math.hypot(p.x - CENTER.x, p.y - CENTER.y) < PLAZA_R + 40) return false;
  // (<= so that points inside a footprint count even with no padding)
  if (SPOTS.some((s) => distToRect(p, { x: s.x - 30, y: s.y - 40, w: s.w + 60, h: s.h + 70 }) <= pad)) return false;
  if (COTTAGES.some((c) => distToRect(p, { x: c.x - 70, y: c.y - 60, w: c.w + 140, h: c.h + 120 }) <= pad)) return false;
  if (STALLS.some((s) => Math.hypot(p.x - s.x, p.y - s.y) < 60 + pad)) return false;
  if (Object.values(LANDMARKS).some((l) => Math.hypot(p.x - l.x, p.y - l.y) < 90 + pad)) return false;
  if (nearCreek(p, 40 + pad)) return false;
  return !nearPath(p, 38);
}

/** The flat boxes/circles/lines you bump into besides buildings and trees (in map px). */
function propSolids(fences) {
  const out = [];
  for (const c of COTTAGES) out.push({ rect: { x: c.x, y: c.y, w: c.w, h: c.h } });
  for (const s of STALLS) out.push({ circle: { x: s.x, y: s.y, r: 38 } });
  out.push({ circle: { ...LANDMARKS.windmill, r: 55 } }, { circle: { ...LANDMARKS.gazebo, r: 70 } }, { circle: { ...LANDMARKS.well, r: 30 } }, { circle: { ...LANDMARKS.lighthouse, r: 45 } });
  for (const f of fences) for (let i = 0; i < f.pts.length - 1; i++) out.push({ seg: [f.pts[i], f.pts[i + 1]] });
  return out;
}

/** Deterministic placement of trees, lamps, benches, fences and the rest. */
export function buildLayout() {
  const rnd = seeded(42);
  // ---- fences: picket fences round the cottage yards (gate towards the lane), rails by the fields
  const fences = [];
  for (const c of COTTAGES) {
    const x0 = c.x - 40, x1 = c.x + c.w + 40, gate = c.x + c.w / 2;
    const [yFront, yBack] = c.face === 's' ? [c.y + c.h + 55, c.y - 30] : [c.y - 55, c.y + c.h + 30];
    fences.push({ kind: 'picket', pts: [{ x: gate - 22, y: yFront }, { x: x0, y: yFront }, { x: x0, y: yBack }, { x: x1, y: yBack }, { x: x1, y: yFront }, { x: gate + 22, y: yFront }] });
  }
  fences.push({ kind: 'rail', pts: [{ x: 300, y: 1180 }, { x: 300, y: 1760 }, { x: 600, y: 1800 }] }); // archery field
  fences.push({ kind: 'rail', pts: [{ x: 3560, y: 2760 }, { x: 3700, y: 2980 }, { x: 4200, y: 3040 }, { x: 4330, y: 2820 }] }); // orchard
  fences.push({ kind: 'rail', pts: spline([[1560, 1060], [1510, 880], [1420, 760]], 60).map((p) => ({ x: p.x + 60, y: p.y + 10 })) }); // highland road edge
  const solids = propSolids(fences);
  const nearFence = (p, m) => fences.some((f) => f.pts.some((q, i) => i < f.pts.length - 1 && distToSeg(p, q, f.pts[i + 1]) < m));

  // ---- trees: dense woods near the edges and on the hills, a few shade trees in town, an orchard
  const trees = [];
  const clash = (t) =>
    Math.hypot(t.x - CENTER.x, t.y - CENTER.y) < PLAZA_R + 70 ||
    SPOTS.some((s) => distToRect(t, { x: s.x - 50, y: s.y - 70, w: s.w + 100, h: s.h + 110 }) < 10) ||
    !openGround(t, 12) || nearFence(t, 24) ||
    trees.some((o) => Math.hypot(o.x - t.x, o.y - t.y) < 50);
  const wildness = (x, y) => {
    const edge = Math.min(x, y, W - x, H - y);
    const town = Math.hypot((x - CENTER.x) / 1.4, y - CENTER.y);
    return Math.min(1, Math.max(0.05, (town - 550) / 900)) * (edge < 300 ? 1.6 : 1) + (heightAt(x, y) > 0.5 ? 0.5 : 0);
  };
  for (let i = 0; i < 9000 && trees.length < 330; i++) {
    const x = 60 + rnd() * (W - 120), y = 80 + rnd() * (H - 120);
    if (rnd() > wildness(x, y) * 0.7) continue;
    const t = { x, y, kind: rnd() < (heightAt(x, y) > 1 ? 0.6 : 0.28) ? 'pine' : rnd() < 0.3 ? 'bush' : 'oak', v: Math.floor(rnd() * 3), size: 0 };
    t.size = t.kind === 'bush' ? 14 + rnd() * 5 : t.kind === 'pine' ? 30 + rnd() * 12 : 24 + rnd() * 12;
    if (!clash(t)) trees.push(t);
  }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) { // the orchard
    const t = { x: 3720 + c * 110 + (r % 2) * 50, y: 2800 + r * 80, kind: 'oak', v: 3, size: 22 };
    if (!trees.some((o) => Math.hypot(o.x - t.x, o.y - t.y) < 40)) trees.push(t);
  }
  const border = [];
  for (let x = 0; x <= W; x += 46 + rnd() * 14) {
    border.push({ x, y: 10 + rnd() * 10, kind: 'pine', v: Math.floor(rnd() * 2), size: 30 + rnd() * 10 });
    border.push({ x: x + 20, y: H - 6 - rnd() * 8, kind: 'pine', v: Math.floor(rnd() * 2), size: 32 + rnd() * 10 });
  }
  for (let y = 60; y <= H; y += 46 + rnd() * 14) {
    border.push({ x: 8 + rnd() * 10, y, kind: 'pine', v: Math.floor(rnd() * 2), size: 30 + rnd() * 10 });
    border.push({ x: W - 8 - rnd() * 10, y, kind: 'pine', v: Math.floor(rnd() * 2), size: 30 + rnd() * 10 });
  }

  // ---- lamps: along the lit streets, well spaced and alternating sides; four at the square's corners
  const lamps = [];
  const lampOk = (p) => !nearPath(p, 26) && !lamps.some((l) => Math.hypot(l.x - p.x, l.y - p.y) < 230)
    && !SPOTS.some((s) => distToRect(p, s) < 30) && !nearCreek(p, 30) && Math.hypot(p.x - CENTER.x, p.y - CENTER.y) > PLAZA_R + 20
    && !COTTAGES.some((c) => distToRect(p, { x: c.x - 40, y: c.y - 55, w: c.w + 80, h: c.h + 110 }) < 5);
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * TAU;
    lamps.push({ x: CENTER.x + Math.cos(a) * (PLAZA_R + 24), y: CENTER.y + Math.sin(a) * (PLAZA_R + 24), h: a + Math.PI });
  }
  PATHS.forEach((road, ri) => {
    if (!road.lamps) return;
    for (let k = 6; k < road.pts.length - 4; k += 4) {
      const q = road.pts[k], n = road.pts[k + 1];
      const len = Math.hypot(n.x - q.x, n.y - q.y) || 1;
      const side = (k + ri) % 8 < 4 ? 1 : -1;
      const off = 34 * road.w + 12;
      const p = { x: q.x - ((n.y - q.y) / len) * off * side, y: q.y + ((n.x - q.x) / len) * off * side };
      // `h`: the lamp arm reaches out over the street
      if (lampOk(p)) lamps.push({ ...p, h: Math.atan2(q.x - p.x, q.y - p.y) });
    }
  });

  // ---- benches: `h` is the direction the seat faces (as a 3D heading); a handful, where people hang out
  const benches = [];
  const facing = (b, tx, ty) => Math.atan2(tx - b.x, ty - b.y);
  for (let i = 0; i < 4; i++) { // on the square, between the streets, facing the fountain
    const a = ((i + 0.5) / 4) * TAU;
    const p = { x: CENTER.x + Math.cos(a) * 118, y: CENTER.y + Math.sin(a) * 118 };
    benches.push({ ...p, h: facing(p, CENTER.x, CENTER.y) });
  }
  const g = LANDMARKS.gazebo;
  for (let i = 0; i < 3; i++) { // round the gazebo in the park
    const a = -0.4 + i * 1.3;
    const p = { x: g.x + Math.cos(a) * 150, y: g.y + Math.sin(a) * 150 };
    benches.push({ ...p, h: facing(p, g.x, g.y) });
  }
  const pond = SPOTS.find((s) => s.kind === 'pond');
  benches.push({ x: pond.x + pond.w + 60, y: pond.y + 140, h: -Math.PI / 2 }, { x: pond.x + pond.w + 60, y: pond.y + 240, h: -Math.PI / 2 });
  benches.push({ x: 1320, y: 820, h: facing({ x: 1320, y: 820 }, 1700, 1400) }); // view from the highland

  const archery = SPOTS.find((s) => s.id === 'archery');
  const targets = [{ x: archery.x - 150, y: archery.y + 60 }, { x: archery.x - 190, y: archery.y + 170 }, { x: archery.x - 150, y: archery.y + 280 }];
  return { trees, border, lamps, benches, targets, fences, solids };
}

export function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** Paint the ground (grass, hills, streets, square, creek, gardens, lake bed) onto a canvas. Used as the 3D ground texture and the minimap. */
export function renderGround(scale = 0.8) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * scale);
  c.height = Math.round(H * scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  const rnd = seeded(7);

  ctx.fillStyle = '#5fae55';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 180;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rnd() < 0.5 ? 'rgba(150,210,110,.22)' : 'rgba(40,110,60,.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // hill shading: light slopes facing the sun (from the upper left), shade the others
  const cell = 16;
  for (let y = 0; y < H; y += cell) {
    for (let x = 0; x < W; x += cell) {
      const h = heightAt(x, y);
      if (h < 0.02) continue;
      const sx = heightAt(x + cell, y) - heightAt(x - cell, y), sy = heightAt(x, y + cell) - heightAt(x, y - cell);
      const light = -(sx + sy) * 0.9;
      ctx.fillStyle = light > 0 ? `rgba(230,255,170,${Math.min(0.12, light)})` : `rgba(20,60,40,${Math.min(0.2, -light)})`;
      ctx.fillRect(x, y, cell, cell);
    }
  }
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * W, y = rnd() * H;
    ctx.strokeStyle = rnd() < 0.55 ? 'rgba(35,95,45,.3)' : 'rgba(190,240,150,.3)';
    ctx.beginPath();
    ctx.moveTo(x - 2, y); ctx.lineTo(x - 1, y - 4); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 1.5, y - 5); ctx.moveTo(x + 2.5, y); ctx.lineTo(x + 3.5, y - 3.5);
    ctx.stroke();
  }

  // cottage gardens: lawns, flower beds and a path to each door
  for (const ct of COTTAGES) {
    ctx.fillStyle = 'rgba(120,200,100,.45)';
    ctx.fillRect(ct.x - 40, ct.face === 's' ? ct.y - 30 : ct.y - 55, ct.w + 80, ct.h + 85);
    ctx.fillStyle = '#d8bd88';
    const px = ct.x + ct.w / 2 - 12;
    if (ct.face === 's') ctx.fillRect(px, ct.y + ct.h, 24, 70); else ctx.fillRect(px, ct.y - 70, 24, 70);
    for (let k = 0; k < 10; k++) {
      ctx.fillStyle = ['#ff9fb4', '#fff6b0', '#e57bff', '#ffb13b'][k % 4];
      const fx = ct.x - 30 + (k % 5) * 10, fy = ct.face === 's' ? ct.y + ct.h + 20 + Math.floor(k / 5) * 12 : ct.y - 40 + Math.floor(k / 5) * 12;
      ctx.beginPath(); ctx.arc(fx, fy, 3, 0, TAU); ctx.fill();
    }
  }
  // the orchard's rows and the archery field
  ctx.strokeStyle = 'rgba(90,150,60,.35)';
  ctx.lineWidth = 10;
  for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.moveTo(3690, 2800 + r * 80); ctx.lineTo(4300, 2800 + r * 80); ctx.stroke(); }
  ctx.fillStyle = 'rgba(160,220,110,.18)';
  ctx.beginPath(); ctx.roundRect(300, 1180, 330, 580, 60); ctx.fill();

  // streets
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [[62, 'rgba(120,90,50,.35)'], [56, '#b3905a'], [48, '#d8bd88'], [36, '#e6cf9f']]) {
    ctx.strokeStyle = color;
    for (const p of PATHS) {
      ctx.lineWidth = width * p.w;
      ctx.beginPath();
      p.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
  }
  for (const p of PATHS) {
    for (const q of p.pts) {
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(150,115,70,.45)' : 'rgba(250,238,205,.65)';
        ctx.beginPath();
        ctx.ellipse(q.x + (rnd() - 0.5) * 36 * p.w, q.y + (rnd() - 0.5) * 36 * p.w, 1.2 + rnd() * 2, 0.8 + rnd() * 1.3, rnd() * 3, 0, TAU);
        ctx.fill();
      }
    }
  }

  // the creek: sandy banks, then water
  for (const [width, color] of [[46, '#d9c38f'], [30, '#3f8fcf'], [18, '#5fb0ea']]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    CREEK.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
  }

  // the town square
  ctx.fillStyle = '#8f8266';
  ctx.beginPath(); ctx.arc(CENTER.x, CENTER.y, PLAZA_R + 14, 0, TAU); ctx.fill();
  ctx.fillStyle = '#bfb092';
  ctx.beginPath(); ctx.arc(CENTER.x, CENTER.y, PLAZA_R + 5, 0, TAU); ctx.fill();
  const stones = ['#dccfb0', '#d1c3a2', '#e6dabd', '#d6c9a9', '#e0d3b5', '#cdbf9d'];
  let ring = 0;
  for (let r = 30; r < PLAZA_R; r += 16, ring++) {
    const n = Math.floor((TAU * r) / 26);
    ctx.lineWidth = 13;
    for (let i = 0; i < n; i++) {
      const a0 = ((i + (ring % 2) * 0.5) / n) * TAU;
      ctx.strokeStyle = stones[Math.floor(rnd() * stones.length)];
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, r, a0 + 0.035, a0 + TAU / n - 0.035);
      ctx.stroke();
    }
  }
  // cobbled forecourts in front of every building
  for (const s of SPOTS) {
    if (s.kind === 'pond') continue;
    const d = doorOf(s), [dx, dy] = doorDir(s);
    ctx.fillStyle = 'rgba(200,185,150,.9)';
    ctx.beginPath();
    ctx.roundRect(d.x - (dy ? 70 : 40) - dx * 10, d.y - (dx ? 70 : 40) - dy * 10, dy ? 140 : 80, dx ? 140 : 80, 24);
    ctx.fill();
  }

  // flower patches in the meadows
  for (let i = 0; i < 480; i++) {
    const fx = 60 + rnd() * (W - 120), fy = 80 + rnd() * (H - 140);
    if (!openGround({ x: fx, y: fy }, 0)) continue;
    const col = ['#ff9fb4', '#fff6b0', '#ffffff', '#e57bff', '#ffb13b', '#9fd8ff'][Math.floor(rnd() * 6)];
    for (let k = 0; k < 7; k++) {
      const x = fx + (rnd() - 0.5) * 44, y = fy + (rnd() - 0.5) * 26;
      ctx.fillStyle = col;
      for (let p = 0; p < 5; p++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos((p * TAU) / 5) * 2, y + Math.sin((p * TAU) / 5) * 2, 1.8, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ffcf33';
      ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill();
    }
  }

  // lake bed (the 3D water surface sits on top of this)
  const pond = SPOTS.find((s) => s.kind === 'pond');
  ctx.fillStyle = '#d9c38f';
  ctx.beginPath(); ctx.roundRect(pond.x - 24, pond.y - 24, pond.w + 48, pond.h + 48, 150); ctx.fill();
  ctx.fillStyle = '#b89d68';
  ctx.beginPath(); ctx.roundRect(pond.x - 6, pond.y - 6, pond.w + 12, pond.h + 12, 130); ctx.fill();
  const wg = ctx.createRadialGradient(pond.x + pond.w / 2, pond.y + pond.h / 2, 20, pond.x + pond.w / 2, pond.y + pond.h / 2, pond.w / 1.6);
  wg.addColorStop(0, '#12407a');
  wg.addColorStop(0.7, '#1f5fa8');
  wg.addColorStop(1, '#3f8fcf');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.roundRect(pond.x, pond.y, pond.w, pond.h, 120); ctx.fill();

  // a red carpet out of the casino's door
  const casino = SPOTS.find((s) => s.kind === 'casino');
  const cd = doorOf(casino), [cx] = doorDir(casino);
  ctx.fillStyle = '#b3203a';
  ctx.fillRect(cx < 0 ? cd.x - 30 : cd.x - 20, cd.y - 30, 50, 60);
  ctx.fillStyle = '#ffc53d';
  ctx.fillRect(cx < 0 ? cd.x - 30 : cd.x - 20, cd.y - 30, 50, 3);
  ctx.fillRect(cx < 0 ? cd.x - 30 : cd.x - 20, cd.y + 27, 50, 3);
  return c;
}
