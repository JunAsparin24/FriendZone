// Small helpers shared by the activity panels.
import { net } from '../net.js';
import { isTyping } from '../state.js';

export const TAU = Math.PI * 2;
export const $ = (root, sel) => root.querySelector(sel);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Subscribe to several message types at once; returns one unsubscribe. */
export function listen(map) {
  const offs = Object.entries(map).map(([t, fn]) => net.on(t, fn));
  return () => offs.forEach((off) => off());
}

/** Window keydown/keyup listener that ignores typing in inputs. Returns an unsubscribe. */
export function onKeys(down, up) {
  const d = (e) => { if (!isTyping()) down?.(e); };
  const u = (e) => { if (!isTyping()) up?.(e); };
  window.addEventListener('keydown', d);
  window.addEventListener('keyup', u);
  return () => {
    window.removeEventListener('keydown', d);
    window.removeEventListener('keyup', u);
  };
}

export function hiDpiCanvas(canvas, w, h) {
  // always render at least 2x so text and edges stay crisp, even on low-DPI screens
  const dpr = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

/** requestAnimationFrame loop with dt in seconds; returns a stop function. */
export function loop(fn) {
  let raf = 0, last = performance.now(), alive = true;
  const frame = (now) => {
    if (!alive) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    fn(dt, now);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); };
}

/** Burst of confetti over an element (absolutely positioned canvas, removes itself). */
export function confetti(host, { count = 90, colors = ['#ffd84d', '#ff5d73', '#6ee7a0', '#39c6ff', '#e57bff'] } = {}) {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  host.append(c);
  const w = host.clientWidth, h = host.clientHeight;
  const ctx = hiDpiCanvas(c, w, h);
  const parts = Array.from({ length: count }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 80, y: h * 0.45,
    vx: (Math.random() - 0.5) * 520, vy: -250 - Math.random() * 420,
    r: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
    s: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  let age = 0;
  const stop = loop((dt) => {
    age += dt;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 700 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 2.4);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (age > 2.4) { stop(); c.remove(); }
  });
}

/** Floating "+10" style text list for canvases. */
export class Popups {
  constructor() { this.list = []; }
  add(text, x, y, color = '#fff', size = 18) { this.list.push({ text, x, y, color, size, age: 0 }); }
  draw(ctx, dt) {
    this.list = this.list.filter((p) => (p.age += dt) < 1.2);
    for (const p of this.list) {
      ctx.save();
      ctx.globalAlpha = 1 - p.age / 1.2;
      ctx.font = `900 ${p.size}px Rubik, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.strokeText(p.text, p.x, p.y - p.age * 40);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - p.age * 40);
      ctx.restore();
    }
  }
}
