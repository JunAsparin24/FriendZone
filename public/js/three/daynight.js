// Day and night for the world. Everyone shares one clock (it runs off real time), so the whole zone
// sees the same sunset. A full day lasts DAY_MS: a long day, a golden evening, then a starry night
// where the lamps light up the paths.
import * as THREE from 'three';
import { additive, glowTexture, TAU } from './materials.js';
import { settings } from '../settings.js';

export const DAY_MS = 20 * 60 * 1000;
const NIGHT_LAMPS = 6; // real point lights, moved to the lamps nearest the camera

/** 0..1 through the day: 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. */
export const dayPhase = (now = Date.now()) => (settings.dayNight === false ? 0.22 : ((now / DAY_MS) + 0.1) % 1);

/** A friendly label for the HUD clock. */
export function timeOfDay(phase = dayPhase()) {
  const hours = (phase * 24 + 6) % 24; // phase 0 is 6am
  const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
  const icon = phase < 0.04 || (phase > 0.46 && phase < 0.54) ? '🌅' : phase < 0.5 ? '☀️' : '🌙';
  const clock = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  return { icon, clock, night: phase > 0.53 && phase < 0.97 };
}

const C = (hex) => new THREE.Color(hex);
// sky gradients (top, middle, horizon) and fog/hemisphere tints at key moments
const DAY = { top: C('#2f6fd6'), mid: C('#7fb7f5'), bottom: C('#d9ecff'), fog: C('#cfe4fb'), hemiSky: C('#dcefff'), hemiGround: C('#6d8f55') };
const DUSK = { top: C('#3a3f8f'), mid: C('#e07a6a'), bottom: C('#ffc48a'), fog: C('#e8b79a'), hemiSky: C('#ffd2b0'), hemiGround: C('#5a5a55') };
const NIGHT = { top: C('#050a1f'), mid: C('#0d1a44'), bottom: C('#1e2d5c'), fog: C('#141d3a'), hemiSky: C('#6f86c9'), hemiGround: C('#1d2540') };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class DayNight {
  /** env: { sky, sunGlow, lanternMat, lampGlows, lamps } from the environment; hemi + sun lights from the world. */
  constructor(scene, env, hemi, sun) {
    Object.assign(this, { scene, env, hemi, sun });
    this.tmp = { top: new THREE.Color(), mid: new THREE.Color(), bottom: new THREE.Color(), fog: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color() };
    // moon + stars
    this.moon = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: '#f4f1ff', fog: false, transparent: true }));
    this.moonGlow = new THREE.Sprite(additive(glowTexture, 0xbfd0ff, 0.6));
    this.moonGlow.material.fog = false;
    this.moonGlow.scale.setScalar(90);
    this.moon.add(this.moonGlow, disc);
    this.moonDisc = disc;
    scene.add(this.moon);
    const starPos = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random(), v = Math.random() * 0.9 + 0.1;
      const a = u * TAU, y = v;
      const r = Math.sqrt(1 - y * y);
      starPos.push(Math.cos(a) * r * 700, y * 700, Math.sin(a) * r * 700);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    scene.add(this.stars);
    // a few warm lights that follow you around at night, sitting on the nearest lamps
    this.lampLights = Array.from({ length: NIGHT_LAMPS }, () => {
      const l = new THREE.PointLight(0xffc870, 0, 16, 1.4);
      scene.add(l);
      return l;
    });
    this.lastPick = 0;
  }

  update(center, now = Date.now()) {
    const phase = dayPhase(now);
    const elev = Math.sin(phase * TAU);                  // sun height: 1 at noon, -1 at midnight
    const day = smooth(-0.12, 0.22, elev);              // 0 night .. 1 day
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * (1 - smooth(0.2, 0.3, elev)); // near the horizon
    const t = this.tmp;
    for (const k of Object.keys(t)) {
      t[k].copy(NIGHT[k]).lerp(DAY[k], day);
      t[k].lerp(DUSK[k], dusk * 0.75);
    }
    const u = this.env.sky.material.uniforms;
    u.top.value.copy(t.top);
    u.mid.value.copy(t.mid);
    u.bottom.value.copy(t.bottom);
    this.scene.fog.color.copy(t.fog);
    this.hemi.color.copy(t.hemiSky);
    this.hemi.groundColor.copy(t.hemiGround);
    this.hemi.intensity = 0.28 + 0.97 * day;

    // the sun sweeps east to west; at night a cool moonlight takes over the same shadow light
    const az = phase * TAU;
    const sunDir = new THREE.Vector3(Math.cos(az) * 0.8, Math.max(0.15, Math.abs(elev)), 0.45).normalize();
    this.sun.position.set(center.x + sunDir.x * 60, sunDir.y * 60, center.z + sunDir.z * 60 + 20);
    this.sun.target.position.set(center.x, 0, center.z);
    this.sun.intensity = 0.3 + 2.1 * day;
    this.sun.color.set(day > 0.3 ? '#fff0d4' : '#a9bfff').lerp(new THREE.Color('#ffb070'), dusk * 0.8);
    const sky = new THREE.Vector3(Math.cos(az) * 0.8, elev, 0.45).normalize();
    this.env.sunGlow.position.set(center.x + sky.x * 600, sky.y * 600, center.z + sky.z * 600);
    this.env.sunGlow.visible = elev > -0.1;
    this.env.sunGlow.material.color.set(dusk > 0.3 ? 0xffa060 : 0xfff2c0);
    this.moon.position.set(center.x - sky.x * 600, -sky.y * 600, center.z - sky.z * 600);
    this.moon.lookAt(center.x, 0, center.z);
    this.moon.visible = elev < 0.15;
    this.moonDisc.material.opacity = Math.min(1, (0.15 - elev) * 4);
    this.stars.position.set(center.x, 0, center.z);
    this.stars.material.opacity = 1 - smooth(-0.25, 0.05, elev);
    this.stars.visible = this.stars.material.opacity > 0.01;

    // lamps glow at dusk and light the ground at night
    const lampOn = 1 - smooth(-0.05, 0.2, elev);
    this.env.lanternMat.emissiveIntensity = 0.5 + lampOn * 2.2;
    for (const s of this.env.lampGlows) s.material.opacity = 0.2 + lampOn * 0.7;
    if (lampOn > 0.02 && performance.now() - this.lastPick > 400) {
      this.lastPick = performance.now();
      const near = this.env.lamps
        .map((p) => [p, (p.x - center.x) ** 2 + (p.z - center.z) ** 2])
        .sort((a, b) => a[1] - b[1]).slice(0, NIGHT_LAMPS);
      this.lampLights.forEach((l, i) => { const p = near[i]?.[0]; if (p) l.position.set(p.x, 3.2, p.z); });
    }
    for (const l of this.lampLights) l.intensity = lampOn * 14;
    return { phase, day, night: lampOn };
  }
}
