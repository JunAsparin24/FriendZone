// Shared materials and textures for the stylized (cel-shaded) 3D look.
import * as THREE from 'three';

export const TAU = Math.PI * 2;

/** 4-step light ramp for toon shading. */
const gradientMap = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([95, 165, 220, 255]), 4, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const toonCache = new Map();
/** Cached cel-shaded material. */
export function toon(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap, ...opts });
    toonCache.set(key, m);
  }
  return m;
}

const basicCache = new Map();
export function basic(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, ...opts });
    basicCache.set(key, m);
  }
  return m;
}

const stdCache = new Map();
/** Shiny material for metal and glass. */
export function shiny(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = stdCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.55, ...opts });
    stdCache.set(key, m);
  }
  return m;
}

/** Inverted-hull outline: draws back faces pushed out along the normals. */
export function outlineMaterial(thickness, color = 0x1a1330) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n  transformed += normalize(normal) * ${thickness.toFixed(4)};`,
    );
  };
  m.customProgramCacheKey = () => `outline${thickness}`;
  return m;
}

export function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

/** Soft round glow sprite texture (white, tint with material color). */
export const glowTexture = canvasTexture(128, 128, (ctx) => {
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
});

export const puffTexture = canvasTexture(128, 128, (ctx) => {
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,.95)');
  g.addColorStop(0.6, 'rgba(255,255,255,.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, TAU);
  ctx.fill();
});

export const starTexture = canvasTexture(128, 128, (ctx) => {
  ctx.translate(64, 64);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(1, 'rgba(255,240,150,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, r = i % 2 ? 12 : 60;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.fill();
});

export const heartTexture = canvasTexture(128, 128, (ctx) => {
  ctx.fillStyle = '#ff5d8c';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(64, 108);
  ctx.bezierCurveTo(8, 70, 18, 14, 64, 40);
  ctx.bezierCurveTo(110, 14, 120, 70, 64, 108);
  ctx.fill();
  ctx.stroke();
});

export const flameTexture = canvasTexture(128, 128, (ctx) => {
  const g = ctx.createRadialGradient(64, 80, 4, 64, 70, 60);
  g.addColorStop(0, 'rgba(255,250,200,1)');
  g.addColorStop(0.35, 'rgba(255,180,60,.95)');
  g.addColorStop(0.75, 'rgba(255,80,30,.6)');
  g.addColorStop(1, 'rgba(255,40,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(64, 4);
  ctx.bezierCurveTo(100, 50, 120, 90, 64, 124);
  ctx.bezierCurveTo(8, 90, 28, 50, 64, 4);
  ctx.fill();
});

export function additive(texture, color = 0xffffff, opacity = 1) {
  return new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}

/** Emoji / text badge texture, e.g. building emblems. */
export function emojiTexture(emoji, size = 256, ring = '#ffb347') {
  return canvasTexture(size, size, (ctx) => {
    const r = size / 2;
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath(); ctx.arc(r, r, r - 8, 0, TAU); ctx.fill();
    ctx.lineWidth = size * 0.07;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.font = `${size * 0.52}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, r, r + size * 0.03);
  });
}
