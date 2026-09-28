// World layout shared by the 3D renderer, movement/collision and the minimap.
// Positions are in "map pixels" (the same units the server uses): 1800 x 1200.
export const W = 1800;
export const H = 1200;
export const TAU = Math.PI * 2;
export const CENTER = { x: W / 2, y: H / 2 };
export const PLAZA_R = 150;
export const FOUNTAIN_R = 46;
/** Map pixels per 3D world unit. */
export const PX = 20;

export const EMOTES = { wave: '👋', laugh: '😂', heart: '❤️', fire: '🔥', gg: 'GG', wow: '😮' };

export const SPOTS = [
  { id: 'racing', emoji: '🏎️', name: 'Race Track', kind: 'garage', x: 110, y: 90, w: 380, h: 200 },
  { id: 'boss', emoji: '👾', name: 'Boss Cave', kind: 'cave', x: 770, y: 40, w: 260, h: 190, soon: true },
  { id: 'arena', emoji: '⚔️', name: 'Arena', kind: 'colosseum', x: 1300, y: 70, w: 380, h: 230 },
  { id: 'archery', emoji: '🏹', name: 'Archery Range', kind: 'range', x: 90, y: 470, w: 260, h: 180 },
  { id: 'casino', emoji: '🎰', name: 'Casino', kind: 'casino', x: 1450, y: 460, w: 270, h: 200 },
  { id: 'fishing', emoji: '🎣', name: 'Fishing Pond', kind: 'pond', x: 120, y: 830, w: 460, h: 290 },
  { id: 'trading', emoji: '💰', name: 'Trading Post', kind: 'market', x: 640, y: 980, w: 250, h: 150 },
  { id: 'shop', emoji: '👕', name: 'Style Shop', kind: 'boutique', x: 990, y: 950, w: 270, h: 180 },
  { id: 'house', emoji: '🏠', name: 'Houses', kind: 'houses', x: 1400, y: 880, w: 320, h: 230, soon: true },
];

/** The part of a spot you can't walk through (buildings: the lower part; ponds: all of it). */
export const solidOf = (s) => (s.kind === 'pond' ? { x: s.x, y: s.y - 14, w: s.w, h: s.h + 14 } : { x: s.x, y: s.y + s.h * 0.42, w: s.w, h: s.h * 0.58 });
export const doorOf = (s) => (s.kind === 'pond' ? { x: s.x + s.w / 2, y: s.y - 30 } : { x: s.x + s.w / 2, y: s.y + s.h + 20 });

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

// Curved dirt paths from the plaza to each door.
export const PATHS = SPOTS.map((s, i) => {
  const d = doorOf(s);
  const mx = (CENTER.x + d.x) / 2, my = (CENTER.y + d.y) / 2;
  const len = Math.hypot(d.x - CENTER.x, d.y - CENTER.y);
  const off = (i % 2 ? 1 : -1) * Math.min(60, len * 0.12);
  const c = { x: mx - ((d.y - CENTER.y) / len) * off, y: my + ((d.x - CENTER.x) / len) * off };
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 1 / 40) {
    pts.push({ x: (1 - t) ** 2 * CENTER.x + 2 * (1 - t) * t * c.x + t * t * d.x, y: (1 - t) ** 2 * CENTER.y + 2 * (1 - t) * t * c.y + t * t * d.y });
  }
  return { from: CENTER, c, to: d, pts };
});
export const nearPath = (p, margin) => PATHS.some((path) => path.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < margin));

/** Is this point clear of the plaza, buildings and paths (for scattering decoration)? */
export function openGround(p, pad = 10) {
  if (Math.hypot(p.x - CENTER.x, p.y - CENTER.y) < PLAZA_R + 40) return false;
  if (SPOTS.some((s) => distToRect(p, { x: s.x - 30, y: s.y - 40, w: s.w + 60, h: s.h + 70 }) < pad)) return false;
  return !nearPath(p, 34);
}

/** Deterministic placement of trees, lamps, benches and targets. */
export function buildLayout() {
  const rnd = seeded(42);
  const trees = [];
  const clash = (t) =>
    Math.hypot(t.x - CENTER.x, t.y - CENTER.y) < PLAZA_R + 60 ||
    SPOTS.some((s) => distToRect(t, { x: s.x - 40, y: s.y - 60, w: s.w + 80, h: s.h + 90 }) < 10) ||
    nearPath(t, 46) ||
    trees.some((o) => Math.hypot(o.x - t.x, o.y - t.y) < 52);
  for (let i = 0; i < 900 && trees.length < 58; i++) {
    const t = { x: 60 + rnd() * (W - 120), y: 80 + rnd() * (H - 120), kind: rnd() < 0.25 ? 'pine' : rnd() < 0.35 ? 'bush' : 'oak', v: Math.floor(rnd() * 3), size: 0 };
    t.size = t.kind === 'bush' ? 14 + rnd() * 5 : t.kind === 'pine' ? 30 + rnd() * 10 : 24 + rnd() * 10;
    if (!clash(t)) trees.push(t);
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
  const lamps = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    const p = { x: CENTER.x + Math.cos(a) * (PLAZA_R + 22), y: CENTER.y + Math.sin(a) * (PLAZA_R + 22) };
    if (!nearPath(p, 34)) lamps.push(p);
  }
  const benches = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.15;
    const p = { x: CENTER.x + Math.cos(a) * 112, y: CENTER.y + Math.sin(a) * 104, a };
    if (!nearPath(p, 40) && benches.length < 4) benches.push(p);
  }
  const targets = [{ x: 385, y: 560 }, { x: 395, y: 630 }];
  return { trees, border, lamps, benches, targets };
}

/** Paint the ground (grass, paths, plaza, flowers, pond bed) onto a canvas. Used as the 3D ground texture and the minimap. */
export function renderGround(scale = 2) {
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  const rnd = seeded(7);

  ctx.fillStyle = '#5fae55';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 320; i++) {
    const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 140;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rnd() < 0.5 ? 'rgba(150,210,110,.24)' : 'rgba(40,110,60,.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * W, y = rnd() * H;
    ctx.strokeStyle = rnd() < 0.55 ? 'rgba(35,95,45,.3)' : 'rgba(190,240,150,.3)';
    ctx.beginPath();
    ctx.moveTo(x - 2, y); ctx.lineTo(x - 1, y - 4); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 1.5, y - 5); ctx.moveTo(x + 2.5, y); ctx.lineTo(x + 3.5, y - 3.5);
    ctx.stroke();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [[60, 'rgba(120,90,50,.35)'], [54, '#b3905a'], [46, '#d8bd88'], [34, '#e6cf9f']]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const p of PATHS) {
      ctx.beginPath();
      ctx.moveTo(p.from.x, p.from.y);
      ctx.quadraticCurveTo(p.c.x, p.c.y, p.to.x, p.to.y);
      ctx.stroke();
    }
  }
  for (const p of PATHS) {
    for (const q of p.pts) {
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(150,115,70,.45)' : 'rgba(250,238,205,.65)';
        ctx.beginPath();
        ctx.ellipse(q.x + (rnd() - 0.5) * 36, q.y + (rnd() - 0.5) * 36, 1.2 + rnd() * 2, 0.8 + rnd() * 1.3, rnd() * 3, 0, TAU);
        ctx.fill();
      }
    }
  }

  // plaza stones
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

  // flower patches
  for (let i = 0; i < 90; i++) {
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

  // pond bed (the 3D water surface sits on top of this)
  const pond = SPOTS.find((s) => s.kind === 'pond');
  ctx.fillStyle = '#d9c38f';
  ctx.beginPath(); ctx.roundRect(pond.x - 20, pond.y - 20, pond.w + 40, pond.h + 40, 125); ctx.fill();
  ctx.fillStyle = '#b89d68';
  ctx.beginPath(); ctx.roundRect(pond.x - 6, pond.y - 6, pond.w + 12, pond.h + 12, 108); ctx.fill();
  const wg = ctx.createRadialGradient(pond.x + pond.w / 2, pond.y + pond.h / 2, 20, pond.x + pond.w / 2, pond.y + pond.h / 2, pond.w / 1.6);
  wg.addColorStop(0, '#12407a');
  wg.addColorStop(0.7, '#1f5fa8');
  wg.addColorStop(1, '#3f8fcf');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.roundRect(pond.x, pond.y, pond.w, pond.h, 100); ctx.fill();

  // red carpet in front of the casino
  const casino = SPOTS.find((s) => s.kind === 'casino');
  ctx.fillStyle = '#b3203a';
  ctx.fillRect(casino.x + casino.w / 2 - 28, casino.y + casino.h - 4, 56, 40);
  ctx.fillStyle = '#ffc53d';
  ctx.fillRect(casino.x + casino.w / 2 - 28, casino.y + casino.h - 4, 3, 40);
  ctx.fillRect(casino.x + casino.w / 2 + 25, casino.y + casino.h - 4, 3, 40);
  return c;
}
