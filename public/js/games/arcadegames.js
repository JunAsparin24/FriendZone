// The arcade cabinets: little 2D games played on a canvas inside a panel. Each game is
// { id, name, color, blurb, controls, init(G), update(G, dt), draw(G, ctx) }; the shared runner
// handles the loop, keys/pointer, the start and game-over screens, and reports the score.
import { net } from '../net.js';
import { S, esc, fmt, nameOf, me } from '../state.js';
import { sfx } from '../sfx.js';
import { listen } from './util.js';
import { touch } from '../touch.js';
import { spriteFrame } from '../three/portrait.js';

const W = 480, H = 560;
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const INK = '#1a1330';

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
}
function text(ctx, str, x, y, size = 22, color = '#fff', align = 'center') {
  ctx.font = `${size}px "Luckiest Guy", Rubik, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = size / 6;
  ctx.strokeStyle = INK;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}
function hud(G, extra = '') {
  text(G.ctx, `${fmt(Math.floor(G.score))}`, W / 2, 30, 30);
  if (extra) text(G.ctx, extra, W - 14, 30, 18, '#ffd84d', 'right');
}

// ---------------------------------------------------------------------------------------------
// Snake
// ---------------------------------------------------------------------------------------------
const SNAKE = {
  id: 'snake', name: 'Snake', color: '#6ee7a0', blurb: 'Eat the apples, grow longer, don\'t bite yourself.',
  controls: 'Arrows / WASD to turn', touch: 'swipe', touchHelp: 'Swipe to turn',
  init(G) {
    G.cols = 20; G.rows = 22; G.cell = 24; G.oy = 32;
    G.snake = [{ x: 8, y: 11 }, { x: 7, y: 11 }, { x: 6, y: 11 }];
    G.dir = { x: 1, y: 0 }; G.queue = [];
    G.step = 0; G.rate = 0.13;
    G.place = () => { do { G.apple = { x: Math.floor(Math.random() * G.cols), y: Math.floor(Math.random() * G.rows) }; } while (G.snake.some((s) => s.x === G.apple.x && s.y === G.apple.y)); };
    G.place();
  },
  key(G, k) {
    const d = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[k];
    if (!d) return;
    const last = G.queue[G.queue.length - 1] ?? G.dir;
    if (d[0] === -last.x && d[1] === -last.y) return;
    if (G.queue.length < 3) G.queue.push({ x: d[0], y: d[1] });
  },
  update(G, dt) {
    G.step += dt;
    if (G.step < G.rate) return;
    G.step = 0;
    if (G.queue.length) G.dir = G.queue.shift();
    const h = { x: G.snake[0].x + G.dir.x, y: G.snake[0].y + G.dir.y };
    if (h.x < 0 || h.y < 0 || h.x >= G.cols || h.y >= G.rows || G.snake.some((s) => s.x === h.x && s.y === h.y)) return G.over();
    G.snake.unshift(h);
    if (h.x === G.apple.x && h.y === G.apple.y) {
      G.score += 10;
      G.rate = Math.max(0.06, G.rate - 0.003);
      sfx('coin');
      G.place();
    } else G.snake.pop();
  },
  draw(G, ctx) {
    ctx.fillStyle = '#153b2a'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) if ((x + y) % 2) { ctx.fillStyle = '#18442f'; ctx.fillRect(x * G.cell, G.oy + y * G.cell, G.cell, G.cell); }
    const c = G.cell;
    ctx.fillStyle = '#ff5d73';
    ctx.beginPath(); ctx.arc(G.apple.x * c + c / 2, G.oy + G.apple.y * c + c / 2 + 1, c * 0.38, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3fa34d'; ctx.fillRect(G.apple.x * c + c / 2 - 1, G.oy + G.apple.y * c + 2, 3, 6);
    G.snake.forEach((s, i) => roundRect(ctx, s.x * c + 1, G.oy + s.y * c + 1, c - 2, c - 2, 7, i ? (i % 2 ? '#6ee7a0' : '#58d68d') : '#b8ffd6'));
    const hd = G.snake[0];
    ctx.fillStyle = INK;
    for (const s of [-1, 1]) ctx.fillRect(hd.x * c + c / 2 + G.dir.x * 5 + G.dir.y * s * 5 - 2, G.oy + hd.y * c + c / 2 + G.dir.y * 5 + G.dir.x * s * 5 - 2, 4, 4);
    hud(G, `${G.snake.length} long`);
  },
};

// ---------------------------------------------------------------------------------------------
// Brick Breaker
// ---------------------------------------------------------------------------------------------
const BREAKOUT = {
  id: 'breakout', name: 'Brick Breaker', color: '#ff9f43', blurb: 'Bounce the ball and smash every brick. Clear the wall for a faster one.',
  controls: 'Mouse or ← → to move · Space to launch', touchHelp: 'Drag to move the paddle · tap to launch',
  init(G) {
    G.pw = 90; G.px = W / 2; G.lives = 3; G.level = 1;
    G.wall = () => {
      G.bricks = [];
      const cols = ['#ff5d73', '#ff9f43', '#ffd84d', '#6ee7a0', '#39c6ff', '#b77bff'];
      for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) G.bricks.push({ x: 12 + c * 57, y: 70 + r * 26, w: 53, h: 20, c: cols[r], v: (6 - r) * 10 });
    };
    G.serve = () => { G.ball = { x: G.px, y: H - 60, vx: 0, vy: 0, stuck: true }; };
    G.wall(); G.serve();
  },
  key(G, k) { if (k === ' ' && G.ball.stuck) { G.ball.stuck = false; const sp = 330 + G.level * 30; G.ball.vx = rnd(-0.5, 0.5) * sp; G.ball.vy = -sp; } },
  pointer(G, x) { G.px = Math.max(G.pw / 2, Math.min(W - G.pw / 2, x)); },
  click(G) { this.key(G, ' '); },
  update(G, dt) {
    const k = G.keys;
    if (k.has('arrowleft') || k.has('a')) this.pointer(G, G.px - 460 * dt);
    if (k.has('arrowright') || k.has('d')) this.pointer(G, G.px + 460 * dt);
    const b = G.ball;
    if (b.stuck) { b.x = G.px; b.y = H - 60; return; }
    for (let sub = 0; sub < 3; sub++) {
      b.x += (b.vx * dt) / 3; b.y += (b.vy * dt) / 3;
      if (b.x < 8 || b.x > W - 8) { b.vx = -b.vx; b.x = Math.max(8, Math.min(W - 8, b.x)); sfx('tick'); }
      if (b.y < 48) { b.vy = Math.abs(b.vy); sfx('tick'); }
      if (b.vy > 0 && b.y > H - 58 && b.y < H - 40 && Math.abs(b.x - G.px) < G.pw / 2 + 8) {
        const off = (b.x - G.px) / (G.pw / 2), sp = Math.hypot(b.vx, b.vy);
        b.vx = off * sp * 0.8; b.vy = -Math.sqrt(Math.max(1, sp * sp - b.vx * b.vx));
        sfx('pop', { vol: 0.5 });
      }
      for (const br of G.bricks) {
        if (br.dead || b.x < br.x - 7 || b.x > br.x + br.w + 7 || b.y < br.y - 7 || b.y > br.y + br.h + 7) continue;
        br.dead = true; G.score += br.v * G.level;
        const fromSide = b.x < br.x || b.x > br.x + br.w;
        if (fromSide) b.vx = -b.vx; else b.vy = -b.vy;
        sfx('bonk', { power: 0.2 });
        break;
      }
    }
    if (b.y > H + 20) {
      G.lives -= 1;
      sfx('error');
      if (G.lives <= 0) return G.over();
      G.serve();
    }
    if (G.bricks.every((br) => br.dead)) { G.level += 1; G.score += 500; sfx('levelup'); G.wall(); G.serve(); }
  },
  draw(G, ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1d1450'); g.addColorStop(1, '#0c0a2a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const br of G.bricks) if (!br.dead) { roundRect(ctx, br.x, br.y, br.w, br.h, 5, br.c); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(br.x + 4, br.y + 3, br.w - 8, 4); }
    roundRect(ctx, G.px - G.pw / 2, H - 50, G.pw, 14, 7, '#39c6ff', INK);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(G.ball.x, G.ball.y, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    hud(G, `♥ ${G.lives} · L${G.level}`);
    if (G.ball.stuck) text(ctx, 'Space / click to launch', W / 2, H - 100, 18, '#ffd84d');
  },
};

// ---------------------------------------------------------------------------------------------
// Flappy Friend
// ---------------------------------------------------------------------------------------------
const FLAPPY = {
  id: 'flappy', name: 'Flappy Friend', color: '#ffd84d', blurb: 'Flap through the gaps between the pipes. One bump and it\'s over!',
  controls: 'Space, W or click to flap', touchHelp: 'Tap to flap',
  init(G) { G.by = H / 2; G.vy = 0; G.pipes = []; G.t = 1.2; G.speed = 170; G.cloud = Array.from({ length: 5 }, () => ({ x: rnd(0, W), y: rnd(40, 250), s: rnd(0.6, 1.3) })); },
  key(G, k) { if (k === ' ' || k === 'w' || k === 'arrowup') { G.vy = -330; sfx('whoosh'); } },
  click(G) { this.key(G, ' '); },
  update(G, dt) {
    G.vy += 900 * dt; G.by += G.vy * dt;
    G.t -= dt;
    if (G.t <= 0) { G.t = 1.45; G.pipes.push({ x: W + 40, gap: rnd(130, H - 190), scored: false }); }
    G.speed = 170 + G.score * 3;
    for (const p of G.pipes) {
      p.x -= G.speed * dt;
      if (!p.scored && p.x < 100) { p.scored = true; G.score += 1; sfx('coin'); }
      if (p.x < 100 + 18 && p.x + 60 > 100 - 18 && (G.by - 16 < p.gap - 75 || G.by + 16 > p.gap + 75)) return G.over();
    }
    G.pipes = G.pipes.filter((p) => p.x > -80);
    for (const c of G.cloud) { c.x -= 20 * c.s * dt; if (c.x < -80) c.x = W + 60; }
    if (G.by > H - 40 || G.by < 0) G.over();
  },
  draw(G, ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7fc8ff'); g.addColorStop(1, '#c8ecff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    for (const c of G.cloud) { ctx.beginPath(); ctx.arc(c.x, c.y, 22 * c.s, 0, TAU); ctx.arc(c.x + 24 * c.s, c.y + 6, 18 * c.s, 0, TAU); ctx.arc(c.x - 22 * c.s, c.y + 8, 16 * c.s, 0, TAU); ctx.fill(); }
    for (const p of G.pipes) {
      for (const [y, h] of [[0, p.gap - 75], [p.gap + 75, H - 40 - (p.gap + 75)]]) {
        roundRect(ctx, p.x, y, 60, h, 4, '#58c75a', INK);
        roundRect(ctx, p.x - 5, y === 0 ? y + h - 22 : y, 70, 22, 4, '#6ee76e', INK);
      }
    }
    ctx.fillStyle = '#d9b26a'; ctx.fillRect(0, H - 40, W, 40); ctx.fillStyle = '#6ee76e'; ctx.fillRect(0, H - 40, W, 8);
    ctx.save(); ctx.translate(100, G.by); ctx.rotate(Math.max(-0.5, Math.min(1.1, G.vy / 500)));
    ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7, -5, 6, 0, TAU); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(9, -5, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.moveTo(14, 1); ctx.lineTo(26, 4); ctx.lineTo(14, 8); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-6, 4, 9, 5, Math.sin(performance.now() / 60) * 0.6, 0, TAU); ctx.fill();
    ctx.restore();
    hud(G);
  },
};

// ---------------------------------------------------------------------------------------------
// Block Drop
// ---------------------------------------------------------------------------------------------
const SHAPES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const SHAPE_COL = { I: '#39e6ff', O: '#ffd84d', T: '#b77bff', S: '#6ee7a0', Z: '#ff5d73', J: '#3b82f6', L: '#ff9f43' };
const BLOCKS = {
  id: 'blocks', name: 'Block Drop', color: '#39c6ff', blurb: 'Stack the falling blocks and fill whole rows to clear them.',
  controls: '← → move · ↑ rotate · ↓ soft drop · Space hard drop', touch: 'blocks', touchHelp: 'Swipe ← → to move · tap to rotate · swipe ↓ to drop',
  init(G) {
    G.bw = 10; G.bh = 20; G.cs = 25; G.ox = 20; G.oy = 40;
    G.grid = Array.from({ length: G.bh }, () => Array(G.bw).fill(null));
    G.bag = []; G.lines = 0; G.level = 1; G.fall = 0;
    G.next = this.draw1(G);
    this.spawn(G);
  },
  draw1(G) { if (!G.bag.length) G.bag = Object.keys(SHAPES).sort(() => Math.random() - 0.5); return G.bag.pop(); },
  spawn(G) {
    G.cur = { k: G.next, cells: SHAPES[G.next].map(([x, y]) => [x, y]), x: 3, y: 0 };
    G.next = this.draw1(G);
    if (this.hit(G, G.cur.cells, G.cur.x, G.cur.y)) G.over();
  },
  hit(G, cells, ox, oy) { return cells.some(([x, y]) => x + ox < 0 || x + ox >= G.bw || y + oy >= G.bh || (y + oy >= 0 && G.grid[y + oy][x + ox])); },
  lock(G) {
    for (const [x, y] of G.cur.cells) if (y + G.cur.y >= 0) G.grid[y + G.cur.y][x + G.cur.x] = SHAPE_COL[G.cur.k];
    const full = G.grid.map((r, i) => (r.every(Boolean) ? i : -1)).filter((i) => i >= 0);
    for (const i of full) { G.grid.splice(i, 1); G.grid.unshift(Array(G.bw).fill(null)); }
    if (full.length) { G.score += [0, 100, 300, 500, 800][full.length] * G.level; G.lines += full.length; G.level = 1 + Math.floor(G.lines / 10); sfx('correct'); } else sfx('thud');
    this.spawn(G);
  },
  key(G, k) {
    const c = G.cur;
    if (k === 'arrowleft' || k === 'a') { if (!this.hit(G, c.cells, c.x - 1, c.y)) c.x--; }
    else if (k === 'arrowright' || k === 'd') { if (!this.hit(G, c.cells, c.x + 1, c.y)) c.x++; }
    else if (k === 'arrowdown' || k === 's') { if (!this.hit(G, c.cells, c.x, c.y + 1)) { c.y++; G.score += 1; } }
    else if (k === 'arrowup' || k === 'w') {
      if (c.k === 'O') return;
      const size = c.k === 'I' ? 3 : 2;
      const rot = c.cells.map(([x, y]) => [size - y, x]);
      for (const kick of [0, -1, 1, -2, 2]) if (!this.hit(G, rot, c.x + kick, c.y)) { c.cells = rot; c.x += kick; sfx('tick'); break; }
    } else if (k === ' ') { while (!this.hit(G, c.cells, c.x, c.y + 1)) { c.y++; G.score += 2; } this.lock(G); }
  },
  update(G, dt) {
    G.fall += dt;
    const rate = Math.max(0.08, 0.8 - (G.level - 1) * 0.07);
    if (G.fall < rate) return;
    G.fall = 0;
    if (this.hit(G, G.cur.cells, G.cur.x, G.cur.y + 1)) this.lock(G); else G.cur.y++;
  },
  draw(G, ctx) {
    ctx.fillStyle = '#10143a'; ctx.fillRect(0, 0, W, H);
    const { cs, ox, oy } = G;
    roundRect(ctx, ox - 4, oy - 4, G.bw * cs + 8, G.bh * cs + 8, 8, '#1c2358', '#39c6ff');
    const cell = (x, y, c) => { roundRect(ctx, ox + x * cs + 1, oy + y * cs + 1, cs - 2, cs - 2, 4, c); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(ox + x * cs + 4, oy + y * cs + 3, cs - 8, 4); };
    G.grid.forEach((r, y) => r.forEach((c, x) => c && cell(x, y, c)));
    let gy = G.cur.y; while (!this.hit(G, G.cur.cells, G.cur.x, gy + 1)) gy++;
    ctx.globalAlpha = 0.25; for (const [x, y] of G.cur.cells) if (y + gy >= 0) cell(x + G.cur.x, y + gy, SHAPE_COL[G.cur.k]); ctx.globalAlpha = 1;
    for (const [x, y] of G.cur.cells) if (y + G.cur.y >= 0) cell(x + G.cur.x, y + G.cur.y, SHAPE_COL[G.cur.k]);
    const sx = ox + G.bw * cs + 24;
    text(ctx, 'NEXT', sx + 80, oy + 16, 22);
    roundRect(ctx, sx, oy + 36, 160, 100, 10, '#1c2358', '#39c6ff');
    for (const [x, y] of SHAPES[G.next]) roundRect(ctx, sx + 30 + x * 25, oy + 60 + y * 25, 23, 23, 4, SHAPE_COL[G.next]);
    text(ctx, 'SCORE', sx + 80, oy + 180, 20); text(ctx, fmt(G.score), sx + 80, oy + 212, 28, '#ffd84d');
    text(ctx, 'LINES', sx + 80, oy + 262, 20); text(ctx, String(G.lines), sx + 80, oy + 294, 28, '#6ee7a0');
    text(ctx, 'LEVEL', sx + 80, oy + 344, 20); text(ctx, String(G.level), sx + 80, oy + 376, 28, '#ff8fc7');
  },
};

// ---------------------------------------------------------------------------------------------
// 2048
// ---------------------------------------------------------------------------------------------
const TILE_COL = { 2: '#fff1d6', 4: '#ffe0b0', 8: '#ffb36b', 16: '#ff9248', 32: '#ff6e4a', 64: '#ff4a3d', 128: '#ffe066', 256: '#ffd84d', 512: '#ffc53d', 1024: '#b77bff', 2048: '#7c6bff' };
const MERGE = {
  id: 'merge', name: '2048', color: '#ffc53d', blurb: 'Slide the tiles. Two the same merge into one. Can you reach 2048?',
  controls: 'Arrows / WASD to slide', touch: 'swipe', touchHelp: 'Swipe to slide the tiles',
  init(G) { G.b = Array.from({ length: 4 }, () => Array(4).fill(0)); G.anim = 0; this.add(G); this.add(G); },
  add(G) {
    const free = []; G.b.forEach((r, y) => r.forEach((v, x) => !v && free.push([x, y])));
    if (!free.length) return;
    const [x, y] = pick(free); G.b[y][x] = Math.random() < 0.9 ? 2 : 4; G.pop = [x, y]; G.anim = 0;
  },
  slide(row) {
    const vals = row.filter(Boolean), out = []; let gained = 0;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === vals[i + 1]) { out.push(vals[i] * 2); gained += vals[i] * 2; i++; } else out.push(vals[i]);
    }
    while (out.length < 4) out.push(0);
    return { out, gained };
  },
  key(G, k) {
    const dir = { arrowleft: 'l', a: 'l', arrowright: 'r', d: 'r', arrowup: 'u', w: 'u', arrowdown: 'd', s: 'd' }[k];
    if (!dir) return;
    const before = JSON.stringify(G.b);
    for (let i = 0; i < 4; i++) {
      let line = dir === 'l' || dir === 'r' ? [...G.b[i]] : G.b.map((r) => r[i]);
      if (dir === 'r' || dir === 'd') line.reverse();
      const { out, gained } = this.slide(line);
      G.score += gained;
      if (dir === 'r' || dir === 'd') out.reverse();
      if (dir === 'l' || dir === 'r') G.b[i] = out; else out.forEach((v, y) => { G.b[y][i] = v; });
    }
    if (JSON.stringify(G.b) === before) return;
    sfx('pop', { vol: 0.4 });
    this.add(G);
    const canMove = G.b.some((r, y) => r.some((v, x) => !v || v === r[x + 1] || v === G.b[y + 1]?.[x]));
    if (!canMove) G.over();
  },
  update(G, dt) { G.anim = Math.min(1, G.anim + dt * 6); },
  draw(G, ctx) {
    ctx.fillStyle = '#2b1f3a'; ctx.fillRect(0, 0, W, H);
    const size = 420, ox = (W - size) / 2, oy = 90, gap = 12, t = (size - gap * 5) / 4;
    roundRect(ctx, ox, oy, size, size, 16, '#4a3a5e');
    G.b.forEach((r, y) => r.forEach((v, x) => {
      const px = ox + gap + x * (t + gap), py = oy + gap + y * (t + gap);
      roundRect(ctx, px, py, t, t, 10, '#5d4b73');
      if (!v) return;
      const s = G.pop && G.pop[0] === x && G.pop[1] === y ? 0.5 + G.anim * 0.5 : 1;
      const d = (t * (1 - s)) / 2;
      roundRect(ctx, px + d, py + d, t * s, t * s, 10, TILE_COL[v] ?? '#39e6ff');
      ctx.font = `${v >= 1000 ? 30 : 40}px "Luckiest Guy", Rubik, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = v <= 4 ? '#6b4a2b' : '#ffffff';
      ctx.fillText(String(v), px + t / 2, py + t / 2 + 3);
    }));
    hud(G, `best tile ${Math.max(...G.b.flat())}`);
  },
};

// ---------------------------------------------------------------------------------------------
// Sky Hop (keep climbing)
// ---------------------------------------------------------------------------------------------
const HOP = {
  id: 'hop', name: 'Sky Hop', color: '#ff8fc7', blurb: 'Bounce from cloud to cloud and climb as high as you can. Don\'t fall!',
  controls: '← → or A/D to steer (wrap around the sides)', touch: 'sides', touchHelp: 'Hold the left or right side to steer',
  init(G) {
    G.px = W / 2; G.py = H - 80; G.vy = -600; G.vx = 0; G.cam = 0; G.top = 0;
    G.plats = [{ x: W / 2 - 40, y: H - 40, w: 80, kind: 'n' }];
    G.lastY = H - 40; G.lastKind = 'n';
    while (G.lastY > -H) G.plats.push(this.plat(G, 0));
  },
  /** The next cloud up. A bounce carries you about 155 px, and a crumbling cloud ('b') can't be bounced
   *  on, so the cloud after one is always a solid one close above it: no gap is ever out of reach. */
  plat(G, height) {
    const r = Math.random(), hard = Math.min(0.4, height / 20000), afterCrumble = G.lastKind === 'b';
    const kind = r < 0.12 + hard ? 'm' : r < 0.2 + hard && !afterCrumble ? 'b' : 'n';
    const y = G.lastY - (afterCrumble ? rnd(30, 45) : rnd(60, 92));
    G.lastY = y; G.lastKind = kind;
    return { x: rnd(10, W - 90), y, w: 80, kind, dx: rnd(60, 120) * (Math.random() < 0.5 ? -1 : 1) };
  },
  update(G, dt) {
    const k = G.keys;
    const want = (k.has('arrowleft') || k.has('a') ? -1 : 0) + (k.has('arrowright') || k.has('d') ? 1 : 0);
    G.vx += (want * 380 - G.vx) * Math.min(1, dt * 8);
    G.px += G.vx * dt;
    if (G.px < -15) G.px = W + 15; if (G.px > W + 15) G.px = -15;
    const prev = G.py;
    G.vy += 1400 * dt; G.py += G.vy * dt;
    for (const p of G.plats) {
      if (p.kind === 'm') { p.x += p.dx * dt; if (p.x < 0 || p.x > W - p.w) p.dx = -p.dx; }
      if (p.gone) continue;
      if (G.vy > 0 && prev + 18 <= p.y && G.py + 18 >= p.y && G.px > p.x - 10 && G.px < p.x + p.w + 10) {
        if (p.kind === 'b') { p.gone = true; sfx('pop', { vol: 0.5 }); continue; }
        G.vy = -660; sfx('boing');
      }
    }
    // the camera climbs with you
    const line = G.cam + H * 0.4;
    if (G.py < line) G.cam = G.py - H * 0.4;
    G.top = Math.max(G.top, -(G.cam));
    G.score = Math.floor(G.top / 3);
    if (G.lastY > G.cam - 60) G.plats.push(this.plat(G, G.top));
    G.plats = G.plats.filter((p) => p.y < G.cam + H + 40);
    if (G.py > G.cam + H + 40) G.over();
  },
  draw(G, ctx) {
    const hue = Math.min(1, G.top / 30000);
    // a deep blue sky (so the white clouds stand out), turning to night the higher you get
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, hue > 0.5 ? '#141a52' : '#2f6fd6'); g.addColorStop(1, hue > 0.5 ? '#4a36a8' : '#6fb4f5');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cloud = (x, y, grow) => {
      ctx.beginPath();
      ctx.arc(x + 20, y + 6, 12 + grow, 0, TAU); ctx.arc(x + 40, y + 2, 15 + grow, 0, TAU); ctx.arc(x + 60, y + 6, 12 + grow, 0, TAU);
      ctx.rect(x + 8 - grow, y + 4 - grow, 64 + grow * 2, 12 + grow * 2);
      ctx.fill();
    };
    for (const p of G.plats) {
      if (p.gone) continue;
      const y = p.y - G.cam;
      const c = p.kind === 'b' ? '#e8c27a' : p.kind === 'm' ? '#b8f0ff' : '#ffffff';
      ctx.fillStyle = INK; cloud(p.x, y, 3);                                // outline
      ctx.fillStyle = p.kind === 'b' ? '#b8904a' : p.kind === 'm' ? '#7fcbe8' : '#b9d4f5'; cloud(p.x, y + 2, 0); // shaded underside
      ctx.fillStyle = c; cloud(p.x, y - 2, -1);
      if (p.kind === 'b') { ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x + 30, y); ctx.lineTo(p.x + 40, y + 12); ctx.lineTo(p.x + 48, y + 2); ctx.stroke(); }
    }
    const y = G.py - G.cam;
    ctx.save(); ctx.translate(G.px, y);
    const sq = G.vy < -400 ? 1.15 : 1;
    ctx.scale(1 / sq, sq);
    ctx.fillStyle = '#ff8fc7'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    for (const s of [-1, 1]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * 6, -4, 5, 0, TAU); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 6 + Math.sign(G.vx) * 1.5, -3, 2.5, 0, TAU); ctx.fill(); }
    ctx.restore();
    hud(G, `${Math.floor(G.top / 10)} m`);
  },
};

// ---------------------------------------------------------------------------------------------
// One Second
// ---------------------------------------------------------------------------------------------
const SECOND = {
  id: 'second', name: 'One Second', color: '#b77bff', blurb: 'Five tries. Start the clock, then stop it at exactly 1.00 seconds. The numbers vanish halfway!',
  controls: 'Space or click to start / stop',
  init(G) { G.round = 0; G.phase = 'wait'; G.t0 = 0; G.results = []; },
  key(G, k) {
    if (k !== ' ') return;
    const now = performance.now();
    if (G.phase === 'wait') { G.phase = 'run'; G.t0 = now; sfx('tick'); }
    else if (G.phase === 'run') {
      const t = (now - G.t0) / 1000, err = Math.abs(t - 1);
      const pts = Math.max(0, Math.round(200 - err * 1000));
      G.results.push({ t, pts }); G.score += pts; G.round += 1;
      sfx(pts > 180 ? 'correct' : pts > 100 ? 'coin' : 'error');
      G.phase = 'show'; G.showT = 1.2;
    }
  },
  click(G) { this.key(G, ' '); },
  update(G, dt) { if (G.phase === 'show' && (G.showT -= dt) <= 0) { if (G.round >= 5) G.over(); else G.phase = 'wait'; } },
  draw(G, ctx) {
    ctx.fillStyle = '#1a1033'; ctx.fillRect(0, 0, W, H);
    const t = G.phase === 'run' ? (performance.now() - G.t0) / 1000 : G.results[G.results.length - 1]?.t ?? 0;
    ctx.strokeStyle = '#3a2a6e'; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(W / 2, 230, 130, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#b77bff'; ctx.beginPath(); ctx.arc(W / 2, 230, 130, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1.5, t)); ctx.stroke();
    const hidden = G.phase === 'run' && t > 0.45;
    text(ctx, hidden ? '?.??' : t.toFixed(2), W / 2, 230, 64, hidden ? '#8a7ab8' : '#ffffff');
    text(ctx, G.phase === 'wait' ? `Round ${G.round + 1} of 5 — press Space to start` : G.phase === 'run' ? 'Press Space at 1.00!' : `+${G.results[G.results.length - 1].pts}`, W / 2, 400, 22, '#ffd84d');
    G.results.forEach((r, i) => text(ctx, `${r.t.toFixed(2)}s  +${r.pts}`, W / 2, 450 + i * 22, 16, r.pts > 180 ? '#6ee7a0' : '#d9d2ff'));
    hud(G);
  },
};

// ---------------------------------------------------------------------------------------------
// Memory Match
// ---------------------------------------------------------------------------------------------
const CARD_ART = [
  (c) => { c.fillStyle = '#ff5d73'; c.beginPath(); c.moveTo(0, 14); c.bezierCurveTo(-26, -4, -14, -24, 0, -10); c.bezierCurveTo(14, -24, 26, -4, 0, 14); c.fill(); },
  (c) => { c.fillStyle = '#ffd84d'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 8 : 20; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill(); },
  (c) => { c.fillStyle = '#39c6ff'; c.beginPath(); c.moveTo(0, -20); c.bezierCurveTo(16, 0, 14, 18, 0, 18); c.bezierCurveTo(-14, 18, -16, 0, 0, -20); c.fill(); },
  (c) => { c.fillStyle = '#6ee7a0'; for (const [x, y] of [[0, -9], [9, 0], [0, 9], [-9, 0]]) { c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill(); } },
  (c) => { c.fillStyle = '#ff9f43'; c.beginPath(); c.arc(0, 0, 18, 0, TAU); c.fill(); c.fillStyle = '#6b3a1e'; c.fillRect(-2, -24, 4, 8); },
  (c) => { c.fillStyle = '#b77bff'; c.beginPath(); c.moveTo(0, -20); c.lineTo(18, 0); c.lineTo(0, 20); c.lineTo(-18, 0); c.fill(); },
  (c) => { c.fillStyle = '#f4f0ff'; c.beginPath(); c.arc(-6, 0, 14, 0, TAU); c.arc(8, 3, 11, 0, TAU); c.fill(); c.fillStyle = '#8fd3ff'; c.beginPath(); c.arc(0, -2, 5, 0, TAU); c.fill(); },
  (c) => { c.fillStyle = '#ff8fc7'; c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fill(); for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; c.beginPath(); c.arc(Math.cos(a) * 13, Math.sin(a) * 13, 8, 0, TAU); c.fill(); } c.fillStyle = '#ffd84d'; c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill(); },
];
const MEMORY = {
  id: 'memory', name: 'Memory Match', color: '#39e6ff', blurb: 'Flip two cards at a time and find all the pairs. Faster with fewer misses scores more.',
  controls: 'Click the cards',
  init(G) {
    const ids = [...CARD_ART.keys(), ...CARD_ART.keys()].sort(() => Math.random() - 0.5);
    G.cards = ids.map((id, i) => ({ id, i, up: false, done: false, flip: 0 }));
    G.open = []; G.misses = 0; G.time = 0; G.wait = 0; G.score = 5000;
  },
  cardAt(x, y) {
    const cw = 96, ch = 110, gap = 12, ox = (W - (cw * 4 + gap * 3)) / 2, oy = 70;
    return G_CARDS.find((c) => { const cx = ox + (c.i % 4) * (cw + gap), cy = oy + Math.floor(c.i / 4) * (ch + gap); return x >= cx && x <= cx + cw && y >= cy && y <= cy + ch; });
  },
  clickAt(G, x, y) {
    G_CARDS = G.cards;
    if (G.wait > 0 || G.open.length >= 2) return;
    const c = this.cardAt(x, y);
    if (!c || c.up || c.done) return;
    c.up = true; G.open.push(c); sfx('pop', { vol: 0.4 });
    if (G.open.length === 2) {
      const [a, b] = G.open;
      if (a.id === b.id) { a.done = b.done = true; G.open = []; sfx('correct'); if (G.cards.every((q) => q.done)) G.over(); }
      else { G.misses += 1; G.wait = 0.8; }
    }
  },
  update(G, dt) {
    G.time += dt;
    G.score = Math.max(0, Math.round(5000 - G.time * 40 - G.misses * 120));
    for (const c of G.cards) c.flip += ((c.up || c.done ? 1 : 0) - c.flip) * Math.min(1, dt * 12);
    if (G.wait > 0 && (G.wait -= dt) <= 0) { G.open.forEach((c) => { c.up = false; }); G.open = []; }
  },
  draw(G, ctx) {
    ctx.fillStyle = '#10243a'; ctx.fillRect(0, 0, W, H);
    const cw = 96, ch = 110, gap = 12, ox = (W - (cw * 4 + gap * 3)) / 2, oy = 70;
    for (const c of G.cards) {
      const x = ox + (c.i % 4) * (cw + gap), y = oy + Math.floor(c.i / 4) * (ch + gap);
      const sx = Math.abs(Math.cos(c.flip * Math.PI));
      ctx.save(); ctx.translate(x + cw / 2, y + ch / 2); ctx.scale(Math.max(0.05, sx), 1);
      if (c.flip < 0.5) {
        roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 12, '#3b6fd0', INK);
        ctx.fillStyle = 'rgba(255,255,255,.2)'; for (let k = -3; k <= 3; k++) ctx.fillRect(-cw / 2 + 10, k * 14 - 3, cw - 20, 5);
      } else {
        roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 12, c.done ? '#e8fff2' : '#ffffff', INK);
        ctx.scale(1.3, 1.3); CARD_ART[c.id](ctx);
      }
      ctx.restore();
    }
    hud(G, `misses ${G.misses}`);
  },
};
let G_CARDS = [];

// ---------------------------------------------------------------------------------------------
// Surf Rush (Coral Cove's surf shack): carve up the wave, launch off the crest, spin flips in the air
// and land them straight. Dodge rocks, buoys and gulls; grab the stars.
// ---------------------------------------------------------------------------------------------
const SURF = {
  id: 'surf', name: 'Surf Rush', color: '#39c6ff', blurb: 'Hold to carve up the wave and launch off the top. Hold in the air to flip, let go to land it straight. Dodge rocks, buoys and gulls!',
  controls: 'Hold Space / Up / click', touchHelp: 'Hold to carve and flip, let go to land',
  init(G) {
    G.y = 400; G.vy = 0; G.air = false; G.rot = 0; G.airT = 0; G.spd = 230; G.t = 0; G.hold = false;
    G.things = []; G.next = 1.2; G.pops = []; G.spray = [];
    // your own character rides the board (a crouched surf stance)
    try { G.me = spriteFrame(S.players[S.me]?.look, 'idle', 0); } catch { G.me = null; }
    G.up = () => { G.hold = false; };
    window.addEventListener('pointerup', G.up);
  },
  click(G) { G.hold = true; },
  update(G, dt) {
    if (G.done) return;
    G.t += dt;
    const hold = G.hold || G.keys.has(' ') || G.keys.has('arrowup') || G.keys.has('w');
    const WATER = 400, CREST = 250;
    G.spd = Math.min(560, 230 + G.t * 7);
    G.score += G.spd * dt * 0.08;
    if (!G.air) {
      G.vy += (hold ? -1100 : 820) * dt;
      G.vy = Math.max(-520, Math.min(520, G.vy));
      G.y += G.vy * dt;
      if (G.y > WATER) { G.y = WATER; G.vy = 0; }
      if (G.y < CREST) {
        if (G.vy < -300) { G.air = true; G.airT = 0; G.rot = 0; sfx('whoosh', { vol: 0.5 }); }
        else { G.y = CREST; G.vy = 0; }
      }
      if (Math.random() < dt * 30) G.spray.push({ x: 130, y: G.y + 10, vx: -rnd(60, 160), vy: -rnd(40, 160), life: 0.5 });
    } else {
      G.airT += dt;
      G.vy += 900 * dt;
      G.y += G.vy * dt;
      if (hold) G.rot += 8 * dt;
      if (G.y >= CREST + 30 && G.vy > 0) {
        // landing: the board has to be (nearly) flat
        const r = ((G.rot % TAU) + TAU) % TAU;
        if (r > 0.75 && r < TAU - 0.75) { sfx('splash'); G.over(); return; }
        const flips = Math.round(G.rot / TAU);
        const bonus = Math.round(G.airT * 120) + flips * 400;
        G.score += bonus;
        G.pops.push({ x: 150, y: G.y - 50, text: flips ? `${flips > 1 ? `${flips}x ` : ''}FLIP! +${bonus}` : `AIR +${bonus}`, life: 1.2 });
        sfx(flips ? 'correct' : 'land', { vol: 0.6 });
        G.air = false; G.rot = 0; G.vy = 120;
      }
    }
    // obstacles and stars
    if ((G.next -= dt) <= 0) {
      G.next = rnd(0.7, 1.5) * (330 / G.spd) * 1.3;
      const r = Math.random();
      const kind = r < 0.35 ? 'rock' : r < 0.55 ? 'buoy' : r < 0.72 ? 'gull' : 'star';
      const y = { rock: 405, buoy: rnd(310, 360), gull: rnd(120, 220), star: rnd(150, 390) }[kind];
      G.things.push({ kind, x: W + 40, y, ph: Math.random() * TAU });
    }
    for (const o of G.things) {
      o.x -= G.spd * dt * (o.kind === 'gull' ? 1.25 : 1);
      if (o.kind === 'gull') o.y += Math.sin(G.t * 4 + o.ph) * 30 * dt;
      const r = { rock: 26, buoy: 18, gull: 18, star: 20 }[o.kind];
      if (!o.hit && Math.abs(o.x - 150) < r + 16 && Math.abs(o.y - (G.y - 12)) < r + 14) {
        o.hit = true;
        if (o.kind === 'star') { G.score += 150; G.pops.push({ x: o.x, y: o.y - 20, text: '+150', life: 0.8 }); sfx('coin', { vol: 0.5 }); }
        else { sfx('splash'); G.over(); return; }
      }
    }
    G.things = G.things.filter((o) => o.x > -60 && !(o.hit && o.kind === 'star'));
    for (const q of G.spray) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 500 * dt; q.life -= dt; }
    G.spray = G.spray.filter((q) => q.life > 0);
    for (const q of G.pops) { q.y -= 40 * dt; q.life -= dt; }
    G.pops = G.pops.filter((q) => q.life > 0);
  },
  draw(G, ctx) {
    if (G.done && G.up) { window.removeEventListener('pointerup', G.up); G.up = null; }
    const t = G.t;
    const sky = ctx.createLinearGradient(0, 0, 0, 300);
    sky.addColorStop(0, '#3fa9ff'); sky.addColorStop(0.6, '#9fe0ff'); sky.addColorStop(1, '#ffe6c4');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(380, 90);
    for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.fillStyle = 'rgba(255,240,160,.18)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(160, -14); ctx.lineTo(160, 14); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(380, 90, 36, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 4; i++) { const cx = ((i * 150 - t * 18) % 640 + 640) % 640 - 80, cy = 40 + (i % 2) * 40; ctx.beginPath(); ctx.ellipse(cx, cy, 34, 12, 0, 0, TAU); ctx.ellipse(cx + 22, cy - 8, 22, 12, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#6fb38a';
    for (let i = 0; i < 3; i++) { const x = ((i * 220 - t * 12) % 700 + 700) % 700 - 100; ctx.beginPath(); ctx.ellipse(x, 245, 90, 26, 0, Math.PI, 0); ctx.fill(); }
    // the swell, rising towards the right
    const water = ctx.createLinearGradient(0, 230, 0, H);
    water.addColorStop(0, '#2fc4d8'); water.addColorStop(1, '#10589e');
    ctx.fillStyle = water;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, 240 + Math.sin(x * 0.03 + t * 3) * 6);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); for (let x = 0; x <= W; x += 10) ctx.lineTo(x, 300 + k * 50 + Math.sin(x * 0.04 - t * 4 + k) * 5); ctx.stroke(); }
    // the curl chasing you
    ctx.fillStyle = '#e9fbff';
    ctx.beginPath(); ctx.moveTo(0, 230); ctx.quadraticCurveTo(70 + Math.sin(t * 5) * 6, 200, 60, 300); ctx.quadraticCurveTo(40, 420, 0, 440); ctx.fill();
    ctx.fillStyle = '#9ee8f5'; ctx.beginPath(); ctx.moveTo(0, 260); ctx.quadraticCurveTo(40, 250, 30, 320); ctx.quadraticCurveTo(20, 380, 0, 390); ctx.fill();
    for (const o of G.things) {
      ctx.save(); ctx.translate(o.x, o.y);
      if (o.kind === 'rock') { ctx.fillStyle = '#6d6a7c'; ctx.beginPath(); ctx.moveTo(-30, 12); ctx.lineTo(-18, -22); ctx.lineTo(6, -30); ctx.lineTo(28, -8); ctx.lineTo(30, 12); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); }
      if (o.kind === 'buoy') { ctx.fillStyle = '#ff5d73'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-16, -4, 32, 8); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.stroke(); }
      if (o.kind === 'gull') { ctx.strokeStyle = INK; ctx.lineWidth = 4; const f = Math.sin(t * 12 + o.ph) * 8; ctx.beginPath(); ctx.moveTo(-18, f); ctx.quadraticCurveTo(-8, -10, 0, 0); ctx.quadraticCurveTo(8, -10, 18, f); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 2, 8, 5, 0, 0, TAU); ctx.fill(); }
      if (o.kind === 'star') { ctx.rotate(t * 3); ctx.fillStyle = '#ffd84d'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, r = i % 2 ? 8 : 18; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.restore();
    }
    for (const q of G.spray) { ctx.fillStyle = `rgba(255,255,255,${Math.max(0, q.life * 1.6)})`; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, TAU); ctx.fill(); }
    // the surfer
    ctx.save(); ctx.translate(150, G.y);
    ctx.rotate(G.air ? -G.rot : Math.max(-0.5, Math.min(0.4, G.vy / 900)));
    ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.ellipse(0, 0, 38, 7, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(-30, -1.5, 60, 3);
    if (G.me) {
      // the sprite faces right, feet at its anchor; ~70px tall on the board
      const k = 100 / (G.me.canvas.height * 0.8);
      ctx.drawImage(G.me.canvas, -G.me.ax * k, -G.me.ay * k - 2, G.me.canvas.width * k, G.me.canvas.height * k);
    }
    ctx.restore();
    for (const q of G.pops) text(ctx, q.text, q.x, q.y, 22, '#ffd84d');
    if (G.air) text(ctx, G.rot > 0.5 ? `spin ${Math.floor((G.rot / TAU) * 10) / 10}` : 'AIR!', 150, G.y - 90, 18, '#fff');
    hud(G, `${Math.round(G.spd / 10)} km/h`);
  },
};

// ---------------------------------------------------------------------------------------------
// Star Blaster: waves of aliens sway and swoop down; your ship fires on its own.
// ---------------------------------------------------------------------------------------------
function sbWave(G) {
  G.wave += 1;
  G.aliens = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) G.aliens.push({ hx: 60 + c * 50, hy: 90 + r * 40, x: 60 + c * 50, y: -40 - r * 40, row: r, dive: null });
  G.sway = 0;
}
const BLASTER = {
  id: 'blaster', name: 'Star Blaster', color: '#ff5d73', blurb: 'Blast the alien waves before they swoop down on you. Grab the ⚡ for double shots!',
  controls: 'Arrows/A-D or the mouse to move · your ship fires on its own', touchHelp: 'Hold the left or right side to move', touch: 'sides',
  init(G) { G.x = W / 2; G.tx = null; G.cd = 0; G.shots = []; G.bombs = []; G.lives = 3; G.inv = 0; G.wave = 0; G.power = 0; G.drops = []; G.fx = []; G.stars = Array.from({ length: 50 }, () => ({ x: rnd(0, W), y: rnd(0, H), s: rnd(0.5, 2) })); sbWave(G); },
  pointer(G, x) { G.tx = x; },
  update(G, dt) {
    const k = G.keys, mv = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    if (mv) { G.x += mv * 300 * dt; G.tx = null; } else if (G.tx != null) G.x += Math.max(-300 * dt, Math.min(300 * dt, G.tx - G.x));
    G.x = Math.max(24, Math.min(W - 24, G.x));
    G.inv -= dt; G.power -= dt;
    if ((G.cd -= dt) <= 0) {
      G.cd = 0.22;
      for (const o of G.power > 0 ? [-10, 10] : [0]) G.shots.push({ x: G.x + o, y: H - 70 });
      sfx('shoot', { vol: 0.15 });
    }
    G.sway += dt;
    const spd = 1 + G.wave * 0.15;
    for (const a of G.aliens) {
      if (a.dive) {
        a.dive.t += dt;
        a.x = a.dive.x0 + Math.sin(a.dive.t * 2.4) * 110; a.y += (150 + G.wave * 15) * dt;
        if (a.y > H + 30) { a.dive = null; a.y = -30; }
        if (G.inv <= 0 && Math.abs(a.x - G.x) < 22 && Math.abs(a.y - (H - 50)) < 20) { a.dead = true; this.hurt(G); }
      } else {
        const hx = a.hx + Math.sin(G.sway * spd) * 40;
        a.x += (hx - a.x) * Math.min(1, dt * 4); a.y += (a.hy - a.y) * Math.min(1, dt * 3);
        if (Math.random() < dt * 0.04 * spd) a.dive = { t: 0, x0: a.x };
        if (Math.random() < dt * 0.05 * spd) G.bombs.push({ x: a.x, y: a.y + 10 });
      }
    }
    for (const s of G.shots) {
      s.y -= 520 * dt;
      const a = G.aliens.find((q) => !q.dead && Math.abs(q.x - s.x) < 18 && Math.abs(q.y - s.y) < 14);
      if (a) {
        a.dead = s.dead = true;
        const pts = (40 - a.row * 10) * (a.dive ? 2 : 1);
        G.score += pts;
        G.fx.push({ x: a.x, y: a.y, t: 0.4 });
        if (Math.random() < 0.06) G.drops.push({ x: a.x, y: a.y });
        sfx('pop', { vol: 0.4 });
      }
    }
    for (const b of G.bombs) { b.y += 230 * dt; if (G.inv <= 0 && Math.abs(b.x - G.x) < 18 && Math.abs(b.y - (H - 50)) < 16) { b.dead = true; this.hurt(G); } }
    for (const d of G.drops) { d.y += 120 * dt; if (Math.abs(d.x - G.x) < 22 && Math.abs(d.y - (H - 50)) < 20) { d.dead = true; G.power = 8; sfx('powerup'); } }
    if (G.done) return;
    G.shots = G.shots.filter((s) => !s.dead && s.y > -10);
    G.bombs = G.bombs.filter((b) => !b.dead && b.y < H + 10);
    G.drops = G.drops.filter((d) => !d.dead && d.y < H + 10);
    G.aliens = G.aliens.filter((a) => !a.dead);
    for (const f of G.fx) f.t -= dt;
    G.fx = G.fx.filter((f) => f.t > 0);
    for (const s of G.stars) { s.y += s.s * 40 * dt; if (s.y > H) { s.y = 0; s.x = rnd(0, W); } }
    if (!G.aliens.length) { G.score += 200 * G.wave; sfx('reveal', { rarity: 'rare' }); sbWave(G); }
  },
  hurt(G) {
    G.lives -= 1; G.inv = 1.5; sfx('hurt');
    if (G.lives <= 0) G.over();
  },
  draw(G, ctx) {
    ctx.fillStyle = '#05031a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    for (const s of G.stars) ctx.fillRect(s.x, s.y, s.s, s.s * 2);
    const cols = ['#ff4fd8', '#ffd84d', '#39c6ff', '#6ee7a0'];
    for (const a of G.aliens) {
      const c = cols[a.row], wob = Math.sin(performance.now() / 150 + a.hx) * 3;
      ctx.fillStyle = c;
      ctx.fillRect(a.x - 14, a.y - 8, 28, 14); ctx.fillRect(a.x - 18, a.y - 2 + wob, 6, 10); ctx.fillRect(a.x + 12, a.y - 2 - wob, 6, 10);
      ctx.fillRect(a.x - 8, a.y - 14, 4, 6); ctx.fillRect(a.x + 4, a.y - 14, 4, 6);
      ctx.fillStyle = INK; ctx.fillRect(a.x - 8, a.y - 4, 5, 5); ctx.fillRect(a.x + 3, a.y - 4, 5, 5);
    }
    ctx.fillStyle = '#ffffff'; for (const s of G.shots) ctx.fillRect(s.x - 2, s.y - 8, 4, 12);
    ctx.fillStyle = '#ff5d73'; for (const b of G.bombs) { ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, TAU); ctx.fill(); }
    for (const d of G.drops) text(ctx, '⚡', d.x, d.y, 22, '#ffd84d');
    for (const f of G.fx) { ctx.fillStyle = `rgba(255,216,77,${f.t * 2})`; ctx.beginPath(); ctx.arc(f.x, f.y, (0.4 - f.t) * 60, 0, TAU); ctx.fill(); }
    if (G.inv <= 0 || Math.floor(G.inv * 10) % 2) {
      const y = H - 50;
      ctx.fillStyle = G.power > 0 ? '#ffd84d' : '#39c6ff';
      ctx.beginPath(); ctx.moveTo(G.x, y - 18); ctx.lineTo(G.x + 20, y + 14); ctx.lineTo(G.x, y + 6); ctx.lineTo(G.x - 20, y + 14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#ff9f43'; ctx.fillRect(G.x - 4, y + 8, 8, 6 + Math.random() * 6);
    }
    hud(G, `${'❤️'.repeat(Math.max(0, G.lives))}  W${G.wave}`);
  },
};

// ---------------------------------------------------------------------------------------------
// Whack-a-Mole: 45 seconds, nine holes. Gold moles are worth loads; don't bonk the bombs!
// ---------------------------------------------------------------------------------------------
const WM_KEYS = ['q', 'w', 'e', 'a', 's', 'd', 'z', 'x', 'c'];
const wmHole = (i) => ({ x: 90 + (i % 3) * 150, y: 170 + Math.floor(i / 3) * 140 });
const WHACK = {
  id: 'whack', name: 'Whack-a-Mole', color: '#ff9f43', blurb: 'Bonk the moles as they pop up! Gold ones are worth five, and keep a streak going for bonus points. Never bonk a bomb!',
  controls: 'Click the moles (or Q W E / A S D / Z X C)', touchHelp: 'Tap the moles!',
  init(G) { G.time = 45; G.holes = Array.from({ length: 9 }, () => ({ up: 0, kind: null, life: 0, bonk: 0 })); G.next = 0.6; G.streak = 0; G.fx = []; G.shake = 0; },
  whack(G, i) {
    const h = G.holes[i];
    if (!h || !h.kind || h.bonk > 0) { G.streak = 0; return; }
    h.bonk = 0.3;
    const { x, y } = wmHole(i);
    if (h.kind === 'bomb') { G.score = Math.max(0, G.score - 30); G.streak = 0; G.shake = 0.4; G.fx.push({ x, y: y - 50, t: 0.8, txt: '-30', c: '#ff5d73' }); sfx('hurt'); return; }
    G.streak += 1;
    const pts = (h.kind === 'gold' ? 50 : 10) + Math.min(20, G.streak) * 2;
    G.score += pts;
    G.fx.push({ x, y: y - 50, t: 0.8, txt: `+${pts}`, c: h.kind === 'gold' ? '#ffd84d' : '#ffffff' });
    sfx(h.kind === 'gold' ? 'coins' : 'bonk', { power: 0.5, n: 3 });
  },
  key(G, k) { const i = WM_KEYS.indexOf(k); if (i >= 0) this.whack(G, i); },
  clickAt(G, x, y) {
    const i = G.holes.findIndex((_, j) => { const h = wmHole(j); return Math.abs(x - h.x) < 60 && y > h.y - 90 && y < h.y + 30; });
    if (i >= 0) this.whack(G, i); else G.streak = 0;
  },
  update(G, dt) {
    G.time -= dt;
    if (G.time <= 0) return G.over();
    const pace = 1 - G.time / 45; // 0 → 1 as time runs out: faster and busier
    if ((G.next -= dt) <= 0) {
      G.next = rnd(0.35, 0.8) * (1 - pace * 0.45);
      const free = G.holes.map((h, i) => (h.kind ? -1 : i)).filter((i) => i >= 0);
      if (free.length) {
        const h = G.holes[pick(free)], r = Math.random();
        Object.assign(h, { kind: r < 0.1 ? 'gold' : r < 0.22 ? 'bomb' : 'mole', life: rnd(0.7, 1.2) * (1 - pace * 0.4), up: 0, bonk: 0 });
      }
    }
    for (const h of G.holes) {
      if (!h.kind) continue;
      if (h.bonk > 0) { if ((h.bonk -= dt) <= 0) h.kind = null; continue; }
      h.life -= dt;
      h.up = h.life > 0.15 ? Math.min(1, h.up + dt * 8) : Math.max(0, h.up - dt * 8);
      if (h.life <= 0) { if (h.kind !== 'bomb') G.streak = 0; h.kind = null; }
    }
    G.shake -= dt;
    for (const f of G.fx) f.t -= dt;
    G.fx = G.fx.filter((f) => f.t > 0);
  },
  draw(G, ctx) {
    ctx.save();
    if (G.shake > 0) ctx.translate(rnd(-6, 6), rnd(-6, 6));
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#8fd66b'); g.addColorStop(1, '#5aa845');
    ctx.fillStyle = g; ctx.fillRect(-10, -10, W + 20, H + 20);
    G.holes.forEach((h, i) => {
      const { x, y } = wmHole(i);
      ctx.fillStyle = '#3d2a1a'; ctx.beginPath(); ctx.ellipse(x, y, 56, 20, 0, 0, TAU); ctx.fill();
      if (h.kind) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x - 60, y - 140, 120, 140); ctx.clip();
        const up = h.bonk > 0 ? 0.6 : h.up, my = y + 10 - up * 70;
        if (h.kind === 'bomb') {
          ctx.fillStyle = '#2a2d3e'; ctx.beginPath(); ctx.arc(x, my, 32, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffb13b'; ctx.beginPath(); ctx.arc(x + 14, my - 34, 6 + Math.random() * 3, 0, TAU); ctx.fill();
          text(ctx, '💣', x, my, 26);
        } else {
          ctx.fillStyle = h.kind === 'gold' ? '#ffd84d' : '#a0703f';
          ctx.beginPath(); ctx.ellipse(x, my + 10, 36, 44, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
          ctx.fillStyle = '#ffc7a8'; ctx.beginPath(); ctx.ellipse(x, my + 12, 14, 10, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ff8fc7'; ctx.beginPath(); ctx.arc(x, my + 7, 5, 0, TAU); ctx.fill();
          ctx.fillStyle = INK;
          if (h.bonk > 0) { text(ctx, 'x  x', x, my - 10, 18, INK); text(ctx, '★', x - 30, my - 40, 18, '#ffd84d'); text(ctx, '★', x + 28, my - 34, 14, '#ffd84d'); }
          else for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * 12, my - 8, 4, 0, TAU); ctx.fill(); }
        }
        ctx.restore();
      }
      ctx.fillStyle = '#6b4a2e'; ctx.beginPath(); ctx.ellipse(x, y + 4, 58, 14, 0, 0, Math.PI); ctx.fill();
      if (!touch.enabled) text(ctx, WM_KEYS[i].toUpperCase(), x + 48, y + 22, 14, 'rgba(255,255,255,.7)');
    });
    for (const f of G.fx) text(ctx, f.txt, f.x, f.y - (0.8 - f.t) * 40, 22, f.c);
    ctx.restore();
    hud(G, `⏱ ${Math.ceil(G.time)}${G.streak > 2 ? `  🔥${G.streak}` : ''}`);
  },
};

export const ARCADE_GAMES = [SNAKE, BREAKOUT, FLAPPY, BLOCKS, MERGE, HOP, SECOND, MEMORY, BLASTER, WHACK];
/** What a go costs inside the Arcade (it pays out tickets instead of coins). */
export const ARCADE_COST = 10;
export const ARCADE_BY_ID = Object.fromEntries([...ARCADE_GAMES, SURF].map((g) => [g.id, g]));

// ---------------------------------------------------------------------------------------------
// The cabinet panel: the game on the left, the zone's high scores on the right
// ---------------------------------------------------------------------------------------------

/** `paid`: in the Arcade, where each go costs coins and pays out tickets. */
export function arcadeCabinet(body, id, { paid = false } = {}) {
  const def = ARCADE_BY_ID[id];
  body.innerHTML = `
    <div class="arc">
      <div class="arc-screen" style="--c:${def.color}">
        <canvas width="${W}" height="${H}"></canvas>
        <div class="arc-overlay"></div>
      </div>
      <div class="arc-side">
        <h2 style="color:${def.color}">${esc(def.name)}</h2>
        <p class="muted small">${esc(def.blurb)}</p>
        ${paid ? '<p class="arc-wallet"></p>' : ''}
        <p class="arc-controls"><b>Controls:</b> ${esc(touch.enabled && def.touchHelp ? def.touchHelp : def.controls)}</p>
        <h3>🏆 High scores</h3>
        <ol class="arc-board"></ol>
      </div>
    </div>`;
  const canvas = body.querySelector('canvas'), ctx = canvas.getContext('2d');
  const box = body.closest('.modal-box');
  box?.classList.add('arc-modal'); // (phones: the game gets the whole screen)
  box?.parentElement?.classList.add('arc-full');
  const overlay = body.querySelector('.arc-overlay'), boardEl = body.querySelector('.arc-board');
  let G = null, raf = 0, last = 0, lastResult = null, waiting = false;
  const wallet = body.querySelector('.arc-wallet');
  const renderWallet = () => { if (wallet) wallet.innerHTML = `🪙 <b>${fmt(me()?.coins ?? 0)}</b> · 🎟️ <b>${fmt(me()?.tickets ?? 0)}</b> tickets`; };

  const renderBoard = () => {
    const board = S.arcade?.[id] ?? [];
    boardEl.innerHTML = board.length ? board.map((e, i) => `<li class="${e.k === S.me ? 'me' : ''}"><span>${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span><b>${esc(nameOf(e.k))}</b><em>${fmt(e.s)}</em></li>`).join('')
      : '<li class="muted">No scores yet. Be the first!</li>';
  };
  const showStart = () => {
    overlay.classList.remove('hidden');
    const mine = (S.arcade?.[id] ?? []).find((e) => e.k === S.me);
    overlay.innerHTML = `<div class="arc-title" style="color:${def.color}">${esc(def.name)}</div>
      ${lastResult ? `<div class="arc-final">Score <b>${fmt(lastResult.s)}</b>${lastResult.best ? ' · <span class="win">New best!</span>' : ''}${lastResult.coins ? ` · +${fmt(lastResult.coins)} 🪙` : ''}${lastResult.tickets ? ` · <span class="arc-tix">+${fmt(lastResult.tickets)} 🎟️</span>` : ''}</div>` : ''}
      ${mine ? `<div class="muted">Your best: ${fmt(mine.s)}</div>` : ''}
      <button class="btn primary" data-play ${waiting ? 'disabled' : ''}>${paid ? `🪙 ${ARCADE_COST} · ${lastResult ? 'Play again' : 'Insert coin'}` : lastResult ? 'Play again' : 'Press start'}</button>
      <div class="muted small">${esc(touch.enabled && def.touchHelp ? def.touchHelp : def.controls)}</div>`;
  };
  // in the Arcade: pay first, and the game starts when the server says the coins went in
  const start = () => {
    if (!paid) return begin();
    if (waiting) return;
    waiting = true;
    net.send('arcade_play', { g: id });
    showStart();
  };
  const begin = () => {
    waiting = false;
    overlay.classList.add('hidden');
    G = { ctx, score: 0, keys: new Set(), done: false };
    G.over = () => {
      if (G.done) return;
      G.done = true;
      sfx('lose');
      const score = Math.floor(G.score);
      lastResult = { s: score, coins: 0, best: false };
      net.send('arcade_score', { g: id, s: score });
      setTimeout(showStart, 700);
    };
    def.init(G);
    sfx('start');
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  };
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G && !G.done) def.update(G, dt);
    if (G) def.draw(G, ctx);
    if (G?.done) { ctx.fillStyle = 'rgba(10,6,30,.55)'; ctx.fillRect(0, 0, W, H); text(ctx, 'GAME OVER', W / 2, H / 2, 48, '#ff5d73'); }
    raf = requestAnimationFrame(loop);
  };
  // idle attract screen
  const attract = () => { ctx.fillStyle = '#12082a'; ctx.fillRect(0, 0, W, H); };
  attract();

  const onKey = (e) => {
    const k = e.key.toLowerCase();
    if (!G || G.done) { if ((k === ' ' || k === 'enter') && !overlay.classList.contains('hidden')) { e.preventDefault(); start(); } return; }
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (e.type === 'keydown') {
      if (!e.repeat || ['arrowleft', 'arrowright', 'arrowdown', 'a', 'd', 's'].includes(k)) def.key?.(G, k);
      G.keys.add(k);
    } else G.keys.delete(k);
  };
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
  canvas.addEventListener('pointermove', (e) => { if (G && !G.done && def.pointer) def.pointer(G, pos(e)[0]); });
  // phones: swipes become arrow keys, holding a side of the screen holds that arrow, taps rotate
  let swipe = null;
  const SW = { l: 'arrowleft', r: 'arrowright', u: 'arrowup', d: 'arrowdown' };
  canvas.addEventListener('pointerdown', (e) => {
    if (!G || G.done) return;
    const [x, y] = pos(e);
    if (e.pointerType === 'touch' && def.touch) {
      e.preventDefault();
      swipe = { x: e.clientX, y: e.clientY, used: false };
      if (def.touch === 'sides') { swipe.key = x < W / 2 ? 'arrowleft' : 'arrowright'; G.keys.add(swipe.key); }
      return;
    }
    if (def.clickAt) def.clickAt(G, x, y); else def.click?.(G);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!swipe || !G || G.done || e.pointerType !== 'touch' || def.touch === 'sides') return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.hypot(dx, dy) < 28) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'l' : 'r') : (dy < 0 ? 'u' : 'd');
    // blocks: sideways swipes keep stepping as you drag; down drops it all the way
    if (def.touch === 'blocks' && dir === 'd') { if (!swipe.used) def.key(G, ' '); swipe.used = true; return; }
    if (def.touch === 'blocks' && dir === 'u') return;
    if (swipe.used && def.touch !== 'blocks') return;
    def.key(G, SW[dir]);
    swipe.used = true;
    swipe.x = e.clientX; swipe.y = e.clientY;
  });
  const endSwipe = () => {
    if (!swipe) return;
    if (swipe.key) G?.keys.delete(swipe.key);
    else if (!swipe.used && def.touch === 'blocks' && G && !G.done) def.key(G, 'arrowup'); // a tap rotates
    swipe = null;
  };
  canvas.addEventListener('pointerup', endSwipe);
  canvas.addEventListener('pointercancel', endSwipe);
  overlay.addEventListener('click', (e) => { if (e.target.closest('[data-play]')) start(); });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);

  const off = listen({
    arcade_board: (m) => { if (m.g === id) renderBoard(); },
    arcade_go: (m) => { if (m.g === id && waiting) { sfx('coin'); begin(); } },
    error: (m) => { if (m.for === 'arcade_play' && waiting) { waiting = false; showStart(); } },
    player: () => renderWallet(),
    arcade_result: (m) => {
      if (m.g !== id) return;
      lastResult = { s: m.s, coins: m.coins, tickets: m.tickets, best: m.best };
      if (m.tickets) sfx('coins', { n: 4 });
      if (m.best) sfx('reveal', { rarity: 'rare' });
      if (!overlay.classList.contains('hidden')) showStart();
    },
  });
  renderBoard();
  renderWallet();
  showStart();
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    box?.classList.remove('arc-modal');
    box?.parentElement?.classList.remove('arc-full');
    off();
  };
}
