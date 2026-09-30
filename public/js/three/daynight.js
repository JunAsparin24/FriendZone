// Day and night for the world. Everyone shares one clock (it runs off real time), so the whole zone
// sees the same sunset. A full day lasts DAY_MS: a long day, a golden evening, then a starry night
// where the lamps light up the paths.
import * as THREE from 'three';
import { additive, glowTexture, TAU } from './materials.js';
import { settings } from '../settings.js';

export const DAY_MS = 20 * 60 * 1000;

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
// rain: a low grey sky, closer fog, flatter light (blended in over a few seconds)
const STORM = { top: C('#4d586b'), mid: C('#76808f'), bottom: C('#98a1ad'), fog: C('#8b95a3'), hemiSky: C('#b7c2d0'), hemiGround: C('#4f5f4a') };
const STORM_NIGHT = { top: C('#0b0f1a'), mid: C('#151c2b'), bottom: C('#222b3b'), fog: C('#1a2130'), hemiSky: C('#56637d'), hemiGround: C('#1a2030') };
const CLOUD = { day: C('#ffffff'), dusk: C('#ffc2b0'), night: C('#34416b'), storm: C('#7c8595'), stormNight: C('#232a3a') };
const RAIN_DROPS = 2400, RAIN_BOX = 46, RAIN_H = 30;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class DayNight {
  /** env: { sky, sunGlow, lit (street lamps), windows } from the environment; hemi + sun lights from the world. */
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
    // rain: streaks falling in a box that follows you around
    this.rain = false;
    this.storm = 0;
    const drops = new Float32Array(RAIN_DROPS * 6);
    this.drops = Array.from({ length: RAIN_DROPS }, () => ({ x: (Math.random() - 0.5) * RAIN_BOX * 2, y: Math.random() * RAIN_H, z: (Math.random() - 0.5) * RAIN_BOX * 2, v: 26 + Math.random() * 10 }));
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(drops, 3));
    this.rainLines = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0, depthWrite: false }));
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    scene.add(this.rainLines);
    this.lastNow = null;
    this.cloudCol = new THREE.Color();
  }

  setRain(on) { this.rain = !!on; }

  update(center, now = Date.now()) {
    const phase = dayPhase(now);
    const elev = Math.sin(phase * TAU);                  // sun height: 1 at noon, -1 at midnight
    const day = smooth(-0.12, 0.22, elev);              // 0 night .. 1 day
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * (1 - smooth(0.2, 0.3, elev)); // near the horizon
    const dt = this.lastNow == null ? 0 : Math.min(0.2, Math.max(0, (now - this.lastNow) / 1000)); // (clocks can jump)
    this.lastNow = now;
    this.storm += ((this.rain ? 1 : 0) - this.storm) * Math.min(1, dt * 0.35);
    const storm = this.storm;
    const t = this.tmp;
    for (const k of Object.keys(t)) {
      t[k].copy(NIGHT[k]).lerp(DAY[k], day);
      t[k].lerp(DUSK[k], dusk * 0.75);
      const grey = STORM_NIGHT[k].clone().lerp(STORM[k], day);
      t[k].lerp(grey, storm * 0.85);
    }
    const u = this.env.sky.material.uniforms;
    u.top.value.copy(t.top);
    u.mid.value.copy(t.mid);
    u.bottom.value.copy(t.bottom);
    this.scene.fog.color.copy(t.fog);
    this.scene.fog.far = 380 - storm * 170;
    this.scene.fog.near = 120 - storm * 70;
    this.hemi.color.copy(t.hemiSky);
    this.hemi.groundColor.copy(t.hemiGround);
    this.hemi.intensity = (0.28 + 0.97 * day) * (1 - storm * 0.2);
    // cloud colours: white by day, peach at dusk, deep blue at night, slate in the rain
    const cc = this.cloudCol.copy(CLOUD.night).lerp(CLOUD.day, day).lerp(CLOUD.dusk, dusk * 0.8);
    cc.lerp(CLOUD.stormNight.clone().lerp(CLOUD.storm, day), storm * 0.9);
    if (this.env.cloudMat) this.env.cloudMat.color.copy(cc);
    u.cloudCol.value.copy(cc).lerp(t.top, 0.08);
    u.cloudShade.value.copy(cc).multiplyScalar(0.78).lerp(t.mid, 0.25);
    u.cover.value = 0.4 + storm * 0.5;
    u.glow.value = (0.35 + day * 0.65) * (1 - storm * 0.85);
    u.time.value = now / 1000;
    u.sunCol.value.set(dusk > 0.3 ? '#ffb070' : day > 0.2 ? '#fff2c0' : '#9fb4ff');

    // the sun sweeps east to west; at night a cool moonlight takes over the same shadow light
    const az = phase * TAU;
    const sunDir = new THREE.Vector3(Math.cos(az) * 0.8, Math.max(0.15, Math.abs(elev)), 0.45).normalize();
    this.sun.position.set(center.x + sunDir.x * 60, sunDir.y * 60, center.z + sunDir.z * 60 + 20);
    this.sun.target.position.set(center.x, 0, center.z);
    this.sun.intensity = (0.3 + 2.1 * day) * (1 - storm * 0.6);
    this.sun.color.set(day > 0.3 ? '#fff0d4' : '#a9bfff').lerp(new THREE.Color('#ffb070'), dusk * 0.8);
    const sky = new THREE.Vector3(Math.cos(az) * 0.8, elev, 0.45).normalize();
    this.env.sunGlow.position.set(center.x + sky.x * 600, sky.y * 600, center.z + sky.z * 600);
    this.env.sunGlow.visible = elev > -0.1 && storm < 0.6;
    this.env.sunGlow.material.opacity = 0.9 * (1 - storm);
    u.sunDir.value.copy(elev > -0.1 ? sky : sky.clone().negate()); // (at night the halo sits around the moon)
    this.env.sunGlow.material.color.set(dusk > 0.3 ? 0xffa060 : 0xfff2c0);
    this.moon.position.set(center.x - sky.x * 600, -sky.y * 600, center.z - sky.z * 600);
    this.moon.lookAt(center.x, 0, center.z);
    this.moon.visible = elev < 0.15;
    this.moonDisc.material.opacity = Math.min(1, (0.15 - elev) * 4);
    this.stars.position.set(center.x, 0, center.z);
    this.stars.material.opacity = (1 - smooth(-0.25, 0.05, elev)) * (1 - storm);
    this.moonDisc.material.opacity *= 1 - storm * 0.9;

    // falling rain around the player
    this.rainLines.visible = storm > 0.02;
    if (this.rainLines.visible) {
      this.rainLines.material.opacity = storm * 0.5;
      const pos = this.rainLines.geometry.attributes.position;
      const wind = 3;
      for (let i = 0; i < RAIN_DROPS; i++) {
        const d = this.drops[i];
        d.y -= d.v * dt;
        d.x += wind * dt;
        if (d.y < 0) { d.y += RAIN_H; d.x = (Math.random() - 0.5) * RAIN_BOX * 2; d.z = (Math.random() - 0.5) * RAIN_BOX * 2; }
        const x = center.x + d.x, z = center.z + d.z, y = (center.y ?? 0) + d.y - 4;
        pos.setXYZ(i * 2, x, y, z);
        pos.setXYZ(i * 2 + 1, x - wind * 0.03, y + 0.7, z);
      }
      pos.needsUpdate = true;
    }
    this.stars.visible = this.stars.material.opacity > 0.01;

    // every lamp glows the same at night: a lit lantern, a soft halo and a pool of light on the ground
    // (no real lights, so nothing changes with where you stand or look)
    const lampOn = Math.max(1 - smooth(-0.05, 0.2, elev), storm * 0.7); // (the lamps come on in the rain too)
    const lit = this.env.lit;
    lit.lanternMat.emissiveIntensity = 0.5 + lampOn * 1.6;
    lit.haloMat.opacity = 0.05 + lampOn * 0.3;
    lit.poolMat.opacity = lampOn * 0.55;
    for (const m of this.env.windows) m.emissiveIntensity = lampOn * 0.9;
    return { phase, day, night: lampOn, storm };
  }
}
