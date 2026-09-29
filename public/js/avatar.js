// 2D-canvas access to the 3D characters: portraits for UI and animated sprites for the mini-games.
import { DEFAULT_LOOK } from './three/character.js';
import { renderPortrait, spriteFrame, WALK_FRAMES } from './three/portrait.js';

export { DEFAULT_LOOK };

const TAU = Math.PI * 2;
const HAT_HEIGHT = { hat_party: 14, hat_tophat: 16, hat_wizard: 22, hat_halo: 12, hat_crown: 8, hat_cowboy: 6, hat_viking: 10, hat_horns: 12 };
/** Offset from the feet to above the head, in 2D sprite units (scale 1). */
export const headTop = (look) => -60 - (HAT_HEIGHT[look?.hat] ?? 0);

/** Height of a person drawn at scale 1, in canvas px. */
const PERSON_PX = 60;
const CHAR_UNITS = 1.95;

/**
 * Draw a person with their feet at (x, y) on a 2D canvas.
 * opts: face (1 right / -1 left), walk (phase), moving, scale, alpha, aim (radians, draws a blaster),
 *       sitting, fishing, jump (px)
 */
export function drawPerson(ctx, x, y, look, opts = {}) {
  const { face = 1, walk = 0, moving = false, scale = 1, alpha = 1, aim = null, sitting = false, fishing = false, jump = 0 } = opts;
  const L = look ?? DEFAULT_LOOK;
  const pose = sitting ? 'sit' : fishing ? 'fish' : moving ? 'walk' : 'idle';
  const frame = moving ? Math.floor((((walk / TAU) % 1) + 1) % 1 * WALK_FRAMES) : 0;
  const f = spriteFrame(L, pose, frame);
  const k = (PERSON_PX * scale) / CHAR_UNITS / f.ppu;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (!sitting) {
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(2, 12 * scale - jump * 0.1), 3.8 * scale, 0, 0, TAU);
    ctx.fill();
  }
  ctx.translate(x, y - jump * scale);
  if (face < 0) ctx.scale(-1, 1);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(f.canvas, -f.ax * k, -f.ay * k, f.canvas.width * k, f.canvas.height * k);
  ctx.restore();
  if (aim != null) {
    const sx = x, sy = y - 30 * scale - jump * scale;
    const ex = sx + Math.cos(aim) * 22 * scale, ey = sy + Math.sin(aim) * 22 * scale;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a1330';
    ctx.lineWidth = 8 * scale;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#3b4266';
    ctx.lineWidth = 5 * scale;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = '#6ee7ff';
    ctx.shadowColor = '#6ee7ff';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(ex, ey, 2.6 * scale, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

export function nameTag(ctx, x, y, text, sub, color) {
  ctx.save();
  ctx.font = '700 13px Rubik, sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 16;
  ctx.fillStyle = 'rgba(13,31,74,.8)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 15, w, 20, 10);
  ctx.fill();
  if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2 + 7, y + 2, w - 14, 2);
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y);
  if (sub) {
    ctx.font = '700 11px Rubik, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(13,31,74,.8)';
    ctx.strokeText(sub, x, y - 20);
    ctx.fillStyle = '#ffd84d';
    ctx.fillText(sub, x, y - 20);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Portraits
// ---------------------------------------------------------------------------

const portraitCache = new Map();

/** Standalone portrait canvas. zoom: 'body' (full person) or 'head' (close-up). */
export function avatarCanvas(look, w = 72, h = w, { zoom = 'body', face = 1 } = {}) {
  const dpr = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  const key = `${JSON.stringify(look)}|${pw}x${ph}|${zoom}|${face}`;
  let src = portraitCache.get(key);
  if (!src) {
    src = document.createElement('canvas');
    src.width = pw;
    src.height = ph;
    src.getContext('2d').drawImage(renderPortrait(look ?? DEFAULT_LOOK, pw, ph, { zoom, yaw: face * 0.45 }), 0, 0);
    if (portraitCache.size > 300) portraitCache.delete(portraitCache.keys().next().value);
    portraitCache.set(key, src);
  }
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// Portraits that aren't cached yet are rendered a few per frame so big grids never freeze the UI.
const queue = [];
let pumping = false;
function pump() {
  const start = performance.now();
  while (queue.length && performance.now() - start < 10) {
    const { el, args } = queue.shift();
    if (!el.isConnected) continue;
    el.replaceChildren(avatarCanvas(...args));
    el.classList.remove('portrait-loading');
  }
  if (queue.length) requestAnimationFrame(pump);
  else pumping = false;
}

/** Fill `el` with a portrait: immediately if cached, otherwise progressively. */
export function portraitInto(el, look, w = 72, h = w, opts = {}) {
  const dpr = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  const key = `${JSON.stringify(look)}|${Math.round(w * dpr)}x${Math.round(h * dpr)}|${opts.zoom ?? 'body'}|${opts.face ?? 1}`;
  if (portraitCache.has(key)) {
    el.replaceChildren(avatarCanvas(look, w, h, opts));
    el.classList.remove('portrait-loading');
    return;
  }
  el.classList.add('portrait-loading');
  queue.push({ el, args: [look, w, h, opts] });
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
}

/** Live-render a portrait into an existing 2D context (wardrobe preview). */
export function paintPortrait(ctx, look, w, h, { yaw = 0.45, time = 0, zoom = 'body', pose = 'idle', phase = 0 } = {}) {
  const dpr = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  const img = renderPortrait(look ?? DEFAULT_LOOK, Math.round(w * dpr), Math.round(h * dpr), { zoom, yaw, time, pose, phase });
  ctx.drawImage(img, 0, 0, w, h);
}
