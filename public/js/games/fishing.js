// Fishing, right in the world: walk up to the pond and you step onto the dock with a rod.
// Hold (click or Space) to charge a cast, release to throw; when the bobber dips, click to hook the
// fish, then hold to keep the green bar on it. How well you track the fish decides how rare your
// catch is. Other players see you fishing (rod, line and bobber) through `pose` messages.
import * as THREE from 'three';
import { net } from '../net.js';
import { S, me, esc } from '../state.js';
import { CATALOG, RARITY } from '../catalog.js';
import { toon, basic } from '../three/materials.js';
import { groundRing } from '../three/fx.js';
import { buildFishModel, fishThumb } from '../three/fishmodels.js';
import * as M from '../map.js';
import { sfx } from '../sfx.js';
import { $, TAU, clamp, listen, hiDpiCanvas, confetti } from './util.js';

const TRACK = { x: 22, y: 18, w: 46, h: 400 }; // a tall track: more room for the fish to get away
const BASE_BAR = 80;          // the catch bar with a basic rod; better rods make it taller
const RODS = Object.fromEntries(CATALOG.rods.map((r) => [r.id, r]));
const myRod = () => RODS[me().rod] ?? CATALOG.rods[0];
const barHeight = () => BASE_BAR + (myRod().bar ?? 0);
const WATER_Y = 0.1;
// some fish stay a secret until somebody catches one
/** The fish of one water ('pond' or 'ocean'); secret mythics only once somebody's caught one. */
const journalFish = (dex, water = 'pond') => CATALOG.fish.filter((f) => (f.water ?? 'pond') === water && (f.rarity !== 'mythic' || dex[f.name]));
const HINTS = {
  hooking: 'Hooked! Get ready…',
  idle: '<b>Hold</b> click or <kbd>Space</kbd> to charge your cast, <b>release</b> to throw.',
  charging: 'Release to cast! Farther casts find better fish.',
  casting: 'Casting…',
  waiting: 'Wait for a bite… don\'t reel too early!',
  bite: '<b>Click now</b> to hook it!',
  reeling: '<b>Hold</b> to raise the green bar, let go to drop it. Keep the fish inside!',
  landing: 'Reeling it in…',
  result: 'Click to cast again.',
};

/** Bobber + fishing line for one fisher (you or a friend). */
export class Line {
  constructor(scene) {
    this.scene = scene;
    this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10, 0, TAU, 0, Math.PI / 2), basic('#ff4d4d'));
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10, 0, TAU, Math.PI / 2, Math.PI / 2), basic('#ffffff'));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6), toon('#1d1b2e'));
    stick.position.y = 0.2;
    this.bobber.add(top, bottom, stick);
    this.geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 18 }, () => new THREE.Vector3()));
    this.line = new THREE.Line(this.geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    this.ripples = [];
    this.visible = false;
    scene.add(this.bobber, this.line);
    this.show(false);
  }

  show(on) {
    this.visible = on;
    this.bobber.visible = this.line.visible = on;
  }

  ripple(x, z, size = 1) {
    const r = groundRing(0.2, 0.3, '#ffffff', 0.7);
    r.position.set(x, WATER_Y + 0.02, z);
    this.scene.add(r);
    this.ripples.push({ r, age: 0, size });
  }

  /** Draw the line from the rod tip to the bobber, sagging a little. */
  update(dt, tip, sag = 0.6) {
    this.ripples = this.ripples.filter((rp) => {
      rp.age += dt;
      rp.r.scale.setScalar(1 + rp.age * 4 * rp.size);
      rp.r.material.opacity = Math.max(0, 0.7 - rp.age * 0.6);
      if (rp.age < 1.2) return true;
      this.scene.remove(rp.r);
      return false;
    });
    if (!this.visible || !tip) return;
    const b = this.bobber.position;
    const pos = this.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = i / (pos.count - 1);
      pos.setXYZ(i, tip.x + (b.x - tip.x) * k, tip.y + (b.y + 0.05 - tip.y) * k - Math.sin(k * Math.PI) * sag, tip.z + (b.z - tip.z) * k);
    }
    pos.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.bobber, this.line);
    for (const rp of this.ripples) this.scene.remove(rp.r);
    this.ripples = [];
  }
}

export class Fishing {
  /** world: the World; spot: { x, y (map px), X, Z (3D), heading } where you stand on the dock. */
  constructor(world, spot) {
    this.world = world;
    this.spot = spot;
    // (the world, or another place that offers fishing: it hands over your actor, a HUD root and its water)
    this.water = world.water ?? 'pond';
    this.actor = world.fishActor ? world.fishActor() : world.actors.get(S.me);
    this.line = new Line(world.scene);
    this.state = 'idle';
    this.holding = false;
    this.power = 0;
    this.chargeT = 0;
    this.timer = 0;
    this.game = null;
    this.result = null;
    this.cast = null;
    this.buildHud();
    this.setState('idle');
    this.actor.char.setProp('rod', myRod().id);
    this.actor.char.setPose('fish');
    this.actor.lift = spot.dock ? 0.49 : 0;
    sfx('enter');
    net.send('pose', { pose: 'fish' });
    this.off = listen({
      fish_result: (m) => this.onResult(m),
      fish_hooked: (m) => { if (this.state === 'hooking') this.startReeling(m); },
      player: (m) => {
        if (m.p.key !== S.me) return;
        this.renderJournalBtn();
        this.renderRods();
        this.actor.char.setProp('rod', myRod().id);
      },
      error: (m) => {
        if (m.for !== 'fish' && m.for !== 'fish_hook') return;
        m.handled = true;
        this.say(m.msg);
        this.reset();
      },
    });
  }

  // ---- hud -------------------------------------------------------------------------

  buildHud() {
    const el = document.createElement('div');
    el.className = 'fish-hud';
    el.innerHTML = `
      <div class="hud-panel fish-top"><b>🎣 Fishing</b> <span class="fish-hint"></span></div>
      <div class="fish-msg hidden"></div>
      <div class="fish-power hidden"><i></i></div>
      <div class="fish-reel hidden"><canvas></canvas></div>
      <div class="fish-result hidden"></div>
      <div class="fish-rods hidden"></div>
      <div class="fish-actions"><button class="btn small" data-rods>🎣 Rods</button><button class="btn small" data-journal></button><button class="btn small" data-stop>← Stop fishing</button></div>`;
    (this.world.hudRoot ?? document.getElementById('world')).append(el);
    this.el = el;
    this.ctx = hiDpiCanvas($(el, 'canvas'), TRACK.w + 90, TRACK.h + 70);
    $(el, '[data-stop]').onclick = () => this.world.stopActivity();
    $(el, '[data-journal]').onclick = () => window.dispatchEvent(new CustomEvent('fz:open', { detail: this.water === 'ocean' ? 'journalOcean' : 'journal' }));
    // the result card and HUD buttons should not count as a "press" for casting
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    $(el, '.fish-result').onclick = () => this.reset();
    $(el, '[data-rods]').onclick = () => { const r = $(el, '.fish-rods'); r.classList.toggle('hidden'); this.renderRods(); };
    $(el, '.fish-rods').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rod]');
      if (!b) return;
      const rod = RODS[b.dataset.rod];
      if (!me().rods?.includes(rod.id) && this.confirmRod !== rod.id) { this.confirmRod = rod.id; this.renderRods(); return; }
      this.confirmRod = null;
      net.send('rod', { id: rod.id });
      sfx(me().rods?.includes(rod.id) ? 'swap' : 'buy');
    });
    this.renderJournalBtn();
  }

  renderRods() {
    const box = $(this.el, '.fish-rods');
    if (box.classList.contains('hidden')) return;
    const p = me();
    box.innerHTML = `<h4>🎣 Rod shop</h4>${CATALOG.rods.map((r) => {
      const own = p.rods?.includes(r.id), using = p.rod === r.id;
      const label = using ? 'Using' : own ? 'Use' : this.confirmRod === r.id ? `Buy for ${r.price.toLocaleString()}?` : `🪙 ${r.price.toLocaleString()}`;
      return `<button class="fish-rod ${using ? 'on' : ''} ${own ? '' : 'locked'}" data-rod="${r.id}" ${using ? 'disabled' : ''}>
        <i style="--c:${r.color}"></i><span><b>${esc(r.name)}</b><small>${esc(r.desc)}</small>
        <em>Bar +${r.bar} · Luck +${Math.round(r.luck * 100)}%</em></span><strong>${label}</strong></button>`;
    }).join('')}`;
  }

  renderJournalBtn() {
    const dex = me().fishdex ?? {};
    const list = journalFish(dex, this.water);
    $(this.el, '[data-journal]').textContent = `📖 Journal ${list.filter((f) => dex[f.name]).length}/${list.length}`;
  }

  setState(s) {
    this.state = s;
    $(this.el, '.fish-hint').innerHTML = HINTS[s] ?? '';
    $(this.el, '.fish-power').classList.toggle('hidden', s !== 'charging');
    $(this.el, '.fish-reel').classList.toggle('hidden', s !== 'reeling' && s !== 'landing');
    $(this.el, '.fish-result').classList.toggle('hidden', s !== 'result');
  }

  say(text) {
    const m = $(this.el, '.fish-msg');
    m.textContent = text;
    m.classList.remove('hidden');
    clearTimeout(this.sayTimer);
    this.sayTimer = setTimeout(() => m.classList.add('hidden'), 2200);
  }

  // ---- input -------------------------------------------------------------------------

  press() {
    this.holding = true;
    if (this.state === 'idle') { this.chargeT = 0; this.setState('charging'); sfx('charge'); }
    else if (this.state === 'waiting') { this.say('Too early! You spooked it.'); sfx('escape'); this.reset(); }
    else if (this.state === 'bite') this.hook();
    else if (this.state === 'result') this.reset();
  }

  release() {
    this.holding = false;
    if (this.state !== 'charging') return;
    let dist = 3 + this.power * 9;
    const s = this.spot;
    // from the shore, a cast that would land on the far bank comes up short in the water instead
    const wet = this.world.isWater ? (d) => this.world.isWater(s.X + Math.sin(s.heading) * d, s.Z + Math.cos(s.heading) * d) : (d) => M.inLake(s.X * M.PX + M.CENTER.x + Math.sin(s.heading) * d * M.PX, s.Z * M.PX + M.CENTER.y + Math.cos(s.heading) * d * M.PX);
    while (dist > 1.5 && !wet(dist)) dist -= 0.5;
    const to = new THREE.Vector3(s.X + Math.sin(s.heading) * dist + (Math.random() - 0.5) * 0.6, WATER_Y, s.Z + Math.cos(s.heading) * dist + (Math.random() - 0.5) * 0.6);
    const from = this.tip() ?? new THREE.Vector3(s.X, 2, s.Z);
    this.cast = { from: from.clone(), to, t: 0 };
    this.line.show(true);
    this.setState('casting');
    sfx('cast');
    this.actor.char.emote(null);
  }

  reset() {
    this.setState('idle');
    this.game = null;
    this.result = null;
    this.holding = false;
    this.line.show(false);
    this.bite(false);
    net.send('pose', { pose: 'fish' });
  }

  bite(on) {
    const e = this.actor.el.emote;
    e.textContent = on ? '❗' : '';
    e.classList.toggle('hidden', !on);
    if (on) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
  }

  /** Set the hook: the pond decides what's on the line (rarer fish fight harder), then the reeling starts. */
  hook() {
    this.setState('hooking');
    this.bite(false);
    sfx('hook');
    net.send('fish_hook', { p: this.power });
    this.timer = 3; // (if the answer never comes, give up)
  }

  startReeling(m) {
    // d: how hard this fish fights (junk ~0.2 … mythic ~1.5). The rarest fish follow a pattern: fast,
    // jumpy, but it repeats, so it can be learned.
    const difficulty = m.d;
    let seed = m.seed ?? 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pattern = m.pat ? Array.from({ length: 6 }, () => 0.08 + rnd() * 0.84) : null;
    this.game = {
      d: difficulty, pattern, pt: 0, bar: 40, vel: 0, fish: TRACK.h / 2, target: TRACK.h / 2, retarget: 0.6,
      progress: 0.36, on: 0, total: 0, onBar: true,
      treasure: Math.random() < 0.3 ? { at: 1 + Math.random() * 2, y: 0, p: 0, life: 7, shown: false, got: false } : null,
    };
    this.setState('reeling');
    net.send('pose', { pose: 'reel', bx: this.line.bobber.position.x, bz: this.line.bobber.position.z });
  }

  tip() {
    const t = this.actor.char.rodTip;
    return t ? t.getWorldPosition(new THREE.Vector3()) : null;
  }

  // ---- update ------------------------------------------------------------------------

  update(dt, now) {
    const b = this.line.bobber.position;
    if (this.state === 'charging') {
      this.chargeT += dt;
      this.power = Math.abs(Math.sin(this.chargeT * 2.2));
      $(this.el, '.fish-power i').style.height = `${this.power * 100}%`;
    } else if (this.state === 'casting') {
      const c = this.cast;
      c.t += dt / 0.6;
      const k = Math.min(1, c.t);
      b.copy(c.from).lerp(c.to, k);
      b.y += Math.sin(k * Math.PI) * 2.5;
      if (k >= 1) {
        b.y = WATER_Y;
        this.world.sparks?.burst(b.x, 0.2, b.z, '#dff4ff', { n: 14, speed: 2, up: 3, size: 0.25 });
        this.line.ripple(b.x, b.z, 1.2);
        sfx('plop');
        this.timer = 1.4 + Math.random() * 3.4 - this.power * 0.8;
        this.setState('waiting');
        net.send('pose', { pose: 'cast', bx: b.x, bz: b.z });
      }
    } else if (this.state === 'waiting') {
      b.y = WATER_Y + Math.sin(now / 300) * 0.03;
      this.timer -= dt;
      if (Math.random() < dt * 0.6) this.line.ripple(b.x, b.z, 0.4);
      if (this.timer <= 0) {
        this.timer = 1.3; // be quick!
        this.setState('bite');
        sfx('bite');
        this.bite(true);
        this.world.sparks?.burst(b.x, 0.2, b.z, '#dff4ff', { n: 10, speed: 1.5, up: 2, size: 0.2 });
        this.line.ripple(b.x, b.z, 1.5);
        net.send('pose', { pose: 'bite', bx: b.x, bz: b.z });
      }
    } else if (this.state === 'hooking') {
      b.y = WATER_Y - 0.1 + Math.sin(now / 40) * 0.05;
      this.timer -= dt;
      if (this.timer <= 0) { this.say('It got away…'); this.reset(); }
    } else if (this.state === 'bite') {
      b.y = WATER_Y - 0.12 + Math.sin(now / 40) * 0.05;
      this.timer -= dt;
      if (this.timer <= 0) { this.say('It got away…'); sfx('escape'); this.reset(); }
    } else if (this.state === 'reeling') {
      this.updateReel(dt, now);
      b.x += (Math.sin(now / 200) * 0.3) * dt;
      b.y = WATER_Y - 0.05 + Math.sin(now / 60) * 0.04;
      if (Math.random() < dt * 4) this.line.ripple(b.x, b.z, 0.5);
      this.drawReel(now);
    } else if (this.state === 'landing') {
      const tip = this.tip();
      if (tip) b.lerp(tip, Math.min(1, dt * 3));
      this.drawReel(now);
    }
    this.line.update(dt, this.tip(), this.state === 'reeling' ? 0.1 : 0.5);
  }

  updateReel(dt, now) {
    const g = this.game;
    const BAR_H = barHeight();
    g.vel += (this.holding ? 1050 : -820) * dt;
    if (this.holding) sfx('reel');
    g.vel = clamp(g.vel, -420, 420);
    g.bar += g.vel * dt;
    if (g.bar < 0) { g.bar = 0; g.vel = Math.abs(g.vel) > 60 ? -g.vel * 0.35 : 0; }
    if (g.bar > TRACK.h - BAR_H) { g.bar = TRACK.h - BAR_H; g.vel = -Math.abs(g.vel) * 0.2; }
    const span = TRACK.h - 24;
    if (g.pattern) {
      // legendary/mythic: leap between the same few spots in the same order, with a wiggle on top
      g.pt += dt;
      const beat = 1.25 - Math.min(0.6, g.d * 0.35);
      const i = Math.floor(g.pt / beat);
      g.target = 12 + g.pattern[i % g.pattern.length] * span + Math.sin(g.pt * (4 + g.d * 2)) * 18 * g.d;
      g.fish += (g.target - g.fish) * Math.min(1, dt * (3 + g.d * 4));
    } else {
      g.retarget -= dt;
      if (g.retarget <= 0) {
        // the rarer the fish, the more it darts, and the faster it swims
        const dart = Math.random() < 0.15 + g.d * 0.35;
        g.target = dart ? clamp(g.fish + (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * (80 + g.d * 90)), 12, TRACK.h - 12) : 12 + Math.random() * span;
        g.retarget = dart ? 0.4 - g.d * 0.12 : Math.max(0.25, 0.5 + Math.random() * (1.9 - g.d));
      }
      g.fish += (g.target - g.fish) * Math.min(1, dt * (0.8 + g.d * 2.8)) + Math.sin(now / 70) * g.d * 0.5;
    }
    g.fish = clamp(g.fish, 8, TRACK.h - 8);
    const inside = (y) => y >= g.bar - 6 && y <= g.bar + BAR_H + 6;
    const on = inside(g.fish);
    g.onBar = on;
    g.total += dt;
    if (on) g.on += dt;
    // (common fish forgive a slip more than rare ones do)
    g.progress += on ? (0.33 / (1 + g.d * 0.35)) * dt : -(0.1 + g.d * 0.16) * dt;
    const t = g.treasure;
    if (t && !t.got) {
      if (!t.shown && g.total > t.at) { t.shown = true; t.y = 30 + Math.random() * (TRACK.h - 60); }
      if (t.shown) {
        t.life -= dt;
        t.p = clamp(t.p + (inside(t.y) ? 0.6 : -0.12) * dt, 0, 1);
        if (t.p >= 1) { t.got = true; sfx('treasure'); this.say('🎁 Treasure!'); }
        if (t.life <= 0) g.treasure = null;
      }
    }
    if (g.progress >= 1) {
      const acc = g.on / g.total;
      const perfect = acc > 0.97;
      const q = clamp(acc * 0.9 + (perfect ? 0.1 : 0), 0, 1); // (how big it turns out to be)
      if (perfect) { this.say('✨ PERFECT!'); sfx('notify'); }
      sfx('splash');
      net.send('fish', { q, treasure: !!g.treasure?.got });
      this.setState('landing');
    } else if (g.progress <= 0) {
      this.say('The fish escaped!');
      sfx('escape');
      this.reset();
    }
  }

  drawReel(now) {
    const ctx = this.ctx, g = this.game, T = TRACK, BAR_H = barHeight();
    if (!g) return;
    ctx.clearRect(0, 0, T.w + 90, T.h + 70);
    ctx.save();
    ctx.translate(g.onBar ? 0 : Math.sin(now / 25) * 1.5, 0);
    ctx.fillStyle = '#7a4a28';
    ctx.beginPath(); ctx.roundRect(T.x - 14, T.y - 14, T.w + 56, T.h + 28, 14); ctx.fill();
    ctx.strokeStyle = '#4a2c14';
    ctx.lineWidth = 3;
    ctx.stroke();
    const tg = ctx.createLinearGradient(0, T.y, 0, T.y + T.h);
    tg.addColorStop(0, '#5bb8f0');
    tg.addColorStop(1, '#1b4f8f');
    ctx.fillStyle = tg;
    ctx.fillRect(T.x, T.y, T.w, T.h);
    const barTop = T.y + T.h - g.bar - BAR_H;
    ctx.fillStyle = g.onBar ? 'rgba(110,231,120,.8)' : 'rgba(110,231,120,.45)';
    ctx.fillRect(T.x + 2, barTop, T.w - 4, BAR_H);
    ctx.strokeStyle = g.onBar ? '#c8ffc8' : '#6ee7a0';
    ctx.lineWidth = 2;
    ctx.strokeRect(T.x + 2, barTop, T.w - 4, BAR_H);
    if (g.treasure?.shown && !g.treasure.got) {
      const ty = T.y + T.h - g.treasure.y;
      ctx.font = '20px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎁', T.x + T.w / 2, ty);
      ctx.fillStyle = '#ffc53d';
      ctx.fillRect(T.x + 6, ty + 13, (T.w - 12) * g.treasure.p, 3);
    }
    ctx.save();
    ctx.translate(T.x + T.w / 2, T.y + T.h - g.fish);
    ctx.rotate(Math.sin(now / 90) * 0.25);
    ctx.fillStyle = g.d > 0.6 ? '#ff9f43' : '#ffe27a';
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-18, -7); ctx.lineTo(-18, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0b1a3d';
    ctx.beginPath(); ctx.arc(5, -2, 1.8, 0, TAU); ctx.fill();
    ctx.restore();
    const px = T.x + T.w + 12, pw = 16;
    ctx.fillStyle = '#2a1a0c';
    ctx.fillRect(px, T.y, pw, T.h);
    const p = clamp(g.progress, 0, 1);
    ctx.fillStyle = p < 0.33 ? '#ff5d73' : p < 0.66 ? '#ffd84d' : '#6ee7a0';
    ctx.fillRect(px + 2, T.y + T.h - p * T.h, pw - 4, p * T.h);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = '700 12px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`On fish ${g.total ? Math.round((g.on / g.total) * 100) : 100}%`, T.x + T.w / 2 + 14, T.y + T.h + 36);
  }

  onResult(m) {
    this.result = m;
    this.setState('result');
    this.line.show(false);
    const f = m.fish, r = RARITY[f.rarity];
    const card = $(this.el, '.fish-result');
    card.style.setProperty('--r', r.color);
    card.innerHTML = `${m.first ? '<span class="tag">NEW!</span>' : m.record ? '<span class="tag rec">RECORD!</span>' : ''}
      <div class="fr-emoji"><img class="fish-img" src="${fishThumb(f)}" alt=""></div><div class="fr-rar">${r.label}</div><div class="fr-name">${esc(f.name)}</div>
      <div class="muted">${f.size} inches</div><div class="fr-coins">${m.bagged ? `🎒 Worth ${m.price} 🪙 at the Fish Market` : `Bag full, sold for +${m.sold} 🪙`}${m.treasure ? ` · 🎁 +${m.treasure} 🪙` : ''}</div>
      <small class="muted">click to cast again</small>`;
    sfx('catch', { rarity: f.rarity });
    if (m.first || m.record) setTimeout(() => sfx('unlock'), 700);
    if (['rare', 'epic', 'legendary'].includes(f.rarity)) confetti(this.el, { colors: [r.color, '#fff', '#ffd84d'] });
    this.actor.char.emote('gg');
    net.send('pose', { pose: 'catch' });
    // hold the catch up over your head for a moment
    const trophy = buildFishModel(f);
    const scale = f.rarity === 'junk' ? 0.9 : Math.min(2.2, 0.8 + f.size / 60);
    trophy.scale.setScalar(scale);
    trophy.position.set(0, 2.9, 0);
    this.actor.char.root.add(trophy);
    const born = performance.now();
    const spin = () => {
      const t = (performance.now() - born) / 1000;
      if (t > 3 || !trophy.parent) { trophy.parent?.remove(trophy); return; }
      trophy.rotation.y = t * 2.2;
      trophy.position.y = 2.9 + Math.sin(t * 5) * 0.08 + Math.min(1, t * 4) * 0.2;
      requestAnimationFrame(spin);
    };
    spin();
  }

  stop() {
    this.off();
    clearTimeout(this.sayTimer);
    this.line.dispose();
    this.el.remove();
    this.bite(false);
    this.actor.char.setProp(null);
    this.actor.char.setPose('idle');
    this.actor.lift = 0;
    net.send('pose', { pose: null });
  }
}

/** The fish journal + the zone's pond records, as a panel. */
export function fishJournal(body, { water: start = 'pond' } = {}) {
  let water = start;
  body.addEventListener('click', (e) => { const t = e.target.closest('[data-water]'); if (t) { water = t.dataset.water; render(); } });
  const render = () => {
    const dex = me().fishdex ?? {};
    const list = journalFish(dex, water);
    const found = list.filter((f) => dex[f.name]).length;
    const records = [];
    for (const p of Object.values(S.players)) {
      for (const [name, d] of Object.entries(p.fishdex ?? {})) {
        const f = CATALOG.fish.find((x) => x.name === name);
        if (f && (f.water ?? 'pond') === water) records.push({ p, f, best: d.best });
      }
    }
    records.sort((a, b) => b.best - a.best);
    body.innerHTML = `
      <h2>📖 Fish Journal <small class="muted">${found}/${list.length} found</small></h2>
      <div class="journal-tabs"><button class="btn small ${water === 'pond' ? 'primary' : 'ghost'}" data-water="pond">🎣 Pond</button><button class="btn small ${water === 'ocean' ? 'primary' : 'ghost'}" data-water="ocean">🌊 Ocean</button></div>
      <div class="journal">${list.map((f) => {
        const d = dex[f.name];
        const r = RARITY[f.rarity];
        return `<div class="jcard ${d ? '' : 'unknown'}" style="--r:${r.color}">
          <div class="jemoji">${d ? `<img class="fish-img" src="${fishThumb(f)}" alt="">` : '❓'}</div><div class="jname">${d ? esc(f.name) : '???'}</div>
          <div class="jrar">${r.label}</div>${d ? `<div class="jmeta">×${d.n} · best ${d.best}"</div>` : ''}</div>`;
      }).join('')}</div>
      <h3>🏆 ${water === 'ocean' ? 'Ocean' : 'Pond'} records (biggest catches in the zone)</h3>
      <ol class="records">${records.slice(0, 8).map((x) => `<li><span><img class="fish-img sm" src="${fishThumb(x.f)}" alt=""> ${esc(x.f.name)}</span><b>${x.best}"</b><small>${esc(x.p.name)}</small></li>`).join('') || '<li class="muted">Nobody has caught anything yet!</li>'}</ol>`;
  };
  render();
  return listen({ player: render });
}

/** The Fish Market: pick fish from your bag and sell them to the fishmonger. */
export function fishMarket(body) {
  const picked = new Set();
  let flash = '';
  const price = (it) => {
    const f = CATALOG.fish.find((x) => x.name === it.name);
    if (!f) return 0;
    const [lo, hi] = f.size;
    const k = Math.min(1, Math.max(0, (it.size - lo) / Math.max(0.1, hi - lo)));
    return Math.max(1, Math.round(f.coins * (0.8 + 0.8 * k)));
  };
  const render = () => {
    const bag = (me().fishbag ?? []).filter((it) => CATALOG.fish.some((f) => f.name === it.name));
    for (const id of [...picked]) if (!bag.some((it) => it.id === id)) picked.delete(id);
    const order = ['legendary', 'epic', 'rare', 'uncommon', 'common', 'junk'];
    const rows = bag.map((it) => ({ it, f: CATALOG.fish.find((x) => x.name === it.name) }))
      .sort((a, b) => order.indexOf(a.f.rarity) - order.indexOf(b.f.rarity) || price(b.it) - price(a.it));
    const sel = rows.filter((r) => picked.has(r.it.id));
    const selTotal = sel.reduce((n, r) => n + price(r.it), 0);
    const allTotal = rows.reduce((n, r) => n + price(r.it), 0);
    body.innerHTML = `
      <h2>🐟 Fish Market <small class="muted">${bag.length}/60 in your bag</small></h2>
      <p class="muted fm-intro">"Fresh catch? I'll take it off your hands!" Tap the fish you want to sell. Bigger fish fetch more.</p>
      ${flash ? `<div class="fm-flash">${flash}</div>` : ''}
      ${rows.length ? `<div class="fm-grid">${rows.map(({ it, f }) => {
        const r = RARITY[f.rarity];
        return `<button class="fm-fish ${picked.has(it.id) ? 'on' : ''}" data-id="${it.id}" style="--r:${r.color}">
          <img class="fish-img" src="${fishThumb(f)}" alt=""><b>${esc(f.name)}</b><small>${r.label} · ${it.size}"</small><span class="fm-price">🪙 ${price(it)}</span></button>`;
      }).join('')}</div>
      <div class="fm-bar">
        <button class="btn ghost" data-a="none"${picked.size ? '' : ' disabled'}>Clear</button>
        <button class="btn ghost" data-a="pick-all">Select all</button>
        <button class="btn primary" data-a="sell"${picked.size ? '' : ' disabled'}>Sell ${sel.length || ''} for 🪙 ${selTotal}</button>
        <button class="btn" data-a="sell-all">Sell everything (🪙 ${allTotal})</button>
      </div>` : '<p class="fm-empty">Your fish bag is empty. Go catch something at the pond! 🎣</p>'}`;
    body.querySelectorAll('.fm-fish').forEach((b) => { b.onclick = () => { const id = +b.dataset.id; if (picked.has(id)) picked.delete(id); else picked.add(id); sfx('click'); render(); }; });
    body.querySelector('[data-a=none]')?.addEventListener('click', () => { picked.clear(); render(); });
    body.querySelector('[data-a=pick-all]')?.addEventListener('click', () => { rows.forEach((r) => picked.add(r.it.id)); render(); });
    body.querySelector('[data-a=sell]')?.addEventListener('click', () => net.send('fish_sell', { ids: [...picked] }));
    body.querySelector('[data-a=sell-all]')?.addEventListener('click', () => net.send('fish_sell', { all: true }));
  };
  render();
  return listen({
    player: (m) => { if (m.p.key === S.me) render(); },
    fish_sold: (m) => { picked.clear(); flash = `Sold ${m.n} fish for <b>🪙 ${m.coins}</b>! Pleasure doing business.`; sfx('coins', { n: 8 }); render(); },
  });
}
