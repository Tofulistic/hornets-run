// TopRC: Hornets Run — an RC-scale F/A-18 jet simulator.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildHornet, buildBandit } from './jet.js';
import { JetBody, RC } from './flight.js';
import { buildWorld, DECK, gorgeX } from './world.js';
import { AIJet, FX, Missile, Flare, Escort } from './ai.js';
import { Sound, Anthem } from './audio.js';
import { HUD, fmt } from './hud.js';
import { Intro, CARDS } from './intro.js';
import { Input } from './input.js';
import { initSetup } from './setup.js';
import { Music } from './music.js';
import { initTouch } from './touch.js';
import { initIndicators, animatePane, swapText, enterMenu, reveal } from './menuanim.js';
import { PhoneLink, runPadPage, newCode, SITE_URL } from './phone.js';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const COARSE = matchMedia('(pointer: coarse)').matches;
let placeInd = null;

// ---------------- settings
const DEF = { mission: 'canyon', map: 'field', flight: 'arcade', cam: 'auto', quality: COARSE ? 'low' : 'high', touch: 'auto', units: 'ms',
  rates: 1, expo: 0.35, smoothMs: 25, delayMs: 0, bankLimit: 60, autoWeapons: 'auto', autoGear: 'on',
  vol: 0.8, musicVol: 0.6, wingmen: '2', display: 'hud', introMusic: 'anthem', flightMusic: 'off', tab: 'controls', seenIntro: false };
let cfg = { ...DEF };
try { cfg = { ...DEF, ...JSON.parse(localStorage.getItem('toprc.cfg') || '{}') }; } catch (e) { /* defaults */ }
const saveCfg = () => { try { localStorage.setItem('toprc.cfg', JSON.stringify(cfg)); } catch (e) { /* private mode */ } };

// ---------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.id = 'view'; document.body.prepend(renderer.domElement);
const applyQuality = () => { const hi = cfg.quality === 'high'; renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 1.5 : 1)); renderer.shadowMap.enabled = hi; };
applyQuality();
const composer = new EffectComposer(renderer);
const rpass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.5, 0.9);
composer.addPass(rpass); composer.addPass(bloom); composer.addPass(new OutputPass());
const hud = new HUD($('hudCanvas'));
const input = new Input(); const sound = new Sound(); const anthem = new Anthem(sound); const music = new Music();
const link = new PhoneLink(); input.remote = link;
sound.setVolume(cfg.vol); sound.musicVol = cfg.musicVol; music.setVolume(cfg.musicVol);
function rcModel(mesh) { const g = new THREE.Group(); mesh.scale.setScalar(RC.scale); g.add(mesh); g.userData.animate = (dt, o) => mesh.userData.animate?.(dt, o); return g; }

const MISSIONS = {
  canyon: { map: 'canyon', name: 'Canyon run', cam: 'chase', desc: 'Low and fast down a frozen river gorge. Thread the gates, stay under the radar ceiling, hit the bunker at the end, then climb out before the clock runs out.' },
  carrier: { map: 'sea', name: 'Carrier ops', cam: 'pilot', desc: 'Bungee launch off a 60 m model carrier, fly a circuit, then come back with the hook down and catch a wire. The 3-wire is the one you want.' },
  dogfight: { map: 'desert', name: 'Dogfight', cam: 'chase', desc: 'Three bandits over the mesas. Get on their tail, hold the lock until the tone goes solid, fire, and pop flares when one is fired at you.' },
  formation: { map: 'sea', name: 'Formation', cam: 'chase', desc: 'Hold right echelon on the lead jet through a sunset circuit. Stay inside the box to score. Smooth hands win this one.' },
  free: { map: null, name: 'Free flight', cam: 'pilot', desc: 'Your field, your rules. Take off, land, do circuits. R resets you to the start.' },
};
const MAP_NAMES = { field: 'Airfield', sea: 'Carrier at sea', canyon: 'Snow canyon', desert: 'Desert mesas' };

// ---------------- the game
class Game {
  constructor(c) {
    this.c = c; this.mission = c.mission; this.mapName = MISSIONS[c.mission].map || c.map;
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 9000);
    this.world = buildWorld(this.mapName, { scene, hi: c.quality === 'high', renderer });
    renderer.toneMappingExposure = this.world.exposure; bloom.strength = this.world.bloom;
    rpass.scene = scene; rpass.camera = this.camera;
    this.jet = rcModel(buildHornet({ modex: '214' })); scene.add(this.jet);
    this.body = new JetBody(); this.fx = new FX(scene);
    this.camMode = c.cam === 'auto' ? (MISSIONS[this.mission].cam === 'pilot' && !this.world.pilot ? 'chase' : MISSIONS[this.mission].cam) : c.cam;
    if (this.camMode === 'pilot' && !this.world.pilot) this.camMode = 'chase';
    this.camPos = new V3(); this.camLook = new V3(); this.cineT = 0; this.cineShot = 0;
    this.restart();
  }
  restart() {
    for (const a of this.ais || []) this.scene.remove(a.mesh);
    for (const m of this.missiles || []) m.dispose();
    for (const f of this.flares || []) this.scene.remove(f.s);
    this.fx.clear();
    this.runId = (this.runId || 0) + 1;
    this.ais = []; this.missiles = []; this.flares = []; this.t = 0; this.done = false;
    this.endT = undefined; this.crashSaid = false; this.trapSaid = false; this.warnText = null; this.lines = []; this.arrowTo = null; $('results').classList.add('hidden'); this.paused = false;
    this.msg = ''; this.msgT = 0; this.lockT = 0; this.lockTarget = null; this.fireCd = 0; this.flareCd = 0; this.gunCd = 0;
    this.ammo = { msl: 8, flr: 30 }; this.manualGear = null; this.manualHook = null; this.thrSpring = 0;
    const W = this.world, sp = W.spawn, b = this.body;
    b.reset(sp.pos, sp.yaw, { airborne: !!sp.airborne, speed: sp.speed || 0 });
    if (sp.cat) { b.cat = { start: sp.pos.clone(), q: b.q.clone(), dir: new V3(0, 0, -1), fired: false, v: 0, accel: 9, vEnd: 21, len: sp.pos.z - (-DECK.len / 2 + 0.5), s: 0 }; }
    this.M = {}; const M = this.M;
    if (this.mission === 'canyon') {
      M.timer = 150; M.gates = 0; W.gates.forEach((g) => { g.passed = false; g.mesh.material.emissive.set('#ff5a00'); }); M.struck = false; M.painted = 0; M.samCd = 0; M.egress = false;
      W.target.visible = true; this.say('Stay low. Thread the gates.', 3);
    }
    if (this.mission === 'carrier') { M.phase = 'launch'; M.far = false; }
    if (this.mission === 'dogfight') {
      b.reset(new V3(0, 140, 500), 0, { airborne: true, speed: 34 }); M.kills = 0; M.wave = 0; this.spawnWave(1);
      this.say('Bandits ahead. Get on their six.', 3);
    }
    if (this.mission === 'formation') {
      const lead = new AIJet(rcModel(buildHornet({ modex: '100' })), { speed: 31, turn: 0.32, team: 'blue' });
      lead.place(new V3(0, 60, 200), 0); this.scene.add(lead.mesh); lead.role = 'lead'; this.ais.push(lead);
      const wing = new AIJet(rcModel(buildHornet({ modex: '103' })), { speed: 31, turn: 0.6, team: 'blue' }); wing.place(new V3(-4, 60, 205), 0); wing.role = 'wing'; this.scene.add(wing.mesh); this.ais.push(wing);
      M.wps = [[0, 60, -600], [500, 80, -900], [900, 70, -300], [700, 50, 400], [100, 25, 300], [0, 18, -200], [-500, 60, -500], [-700, 80, 200], [0, 60, 600]].map((p) => new V3(...p)); M.wp = 0;
      M.timer = 100; M.inBox = 0;
      b.reset(new V3(4, 59.5, 210), 0, { airborne: true, speed: 31 });
      this.say('Join right echelon on Lead', 3);
    }
    // wingmen flying with you, convoy style
    for (const e of this.escorts || []) this.scene.remove(e.mesh);
    this.escorts = []; this.trail = []; W.spawnCenter = sp.pos;
    const n = this.mission === 'formation' ? 0 : +this.c.wingmen;
    const V_OFF = [new V3(4.5, 0.3, 4.5), new V3(-4.5, 0.3, 4.5), new V3(9, 0.6, 9)];
    for (let i = 0; i < n; i++) {
      const e = new Escort(rcModel(buildHornet({ modex: ['211', '212', '215'][i] })), V_OFF[i]);
      if (this.mission === 'canyon') { e.trail = this.trail; e.delay = 0.35 * (i + 1); e.off.set(0, 0.6 * (i + 1), 0); }
      const f = b.fwd(new V3());
      const start = b.onGround ? new V3(sp.pos.x + 80 + i * 10, sp.pos.y + 45, sp.pos.z) : b.pos.clone().addScaledVector(f, -e.off.z - (e.trail ? 12 * (i + 1) : 0)).add(new V3(-f.z * e.off.x, e.off.y, f.x * e.off.x));
      e.place(start, b.onGround ? new V3(0, 0, -30) : b.vel.clone(), b.q);
      this.scene.add(e.mesh); this.escorts.push(e);
    }
    this.syncModel(0);
  }
  spawnWave(n) {
    const b = this.body;
    for (let i = 0; i < n + (this.M.wave ? 1 : 0); i++) {
      const a = new AIJet(rcModel(buildBandit()), { speed: 37, turn: 0.95, team: 'red' });
      const ang = (i - 0.5) * 0.6; a.place(new V3(b.pos.x + Math.sin(ang) * 500, 150 + i * 15, b.pos.z - 600 - i * 60), Math.PI); a.fireCd = 12 + i * 4;
      this.scene.add(a.mesh); this.ais.push(a);
    }
    this.M.wave++;
  }
  say(t, d = 2.5) { this.msg = t; this.msgT = d; }
  get flightMode() { return input.state.source === 'phone' && link.state?.mode ? link.state.mode : this.c.flight; }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  update(dt, render = true) {
    const st = input.update(dt);
    if (this.paused) { sound.engine({}); sound.tones(0, false); return; }
    // throttle: spring sticks (touch, phone, Xbox) nudge it; radio/keyboard set it directly
    let thr = st.thr;
    if (st.spring) { this.thrSpring = clamp(this.thrSpring + (st.climb || 0) * dt * 0.8, 0, 1); thr = this.thrSpring; }
    if (!st.arm) thr = 0;
    if (st.reset) { this.restart(); return; }
    const b = this.body, W = this.world, M = this.M;
    const inp = { thr, roll: st.roll, pitch: st.pitch, yaw: st.yaw };
    const fcfg = { mode: this.flightMode, expo: this.c.expo, rates: this.c.rates, bankLimit: this.c.bankLimit };
    // carrier catapult: hold, then fire at full power
    if (b.cat && !b.cat.fired && thr > 0.9) { b.cat.fired = true; sound.cat(); this.say('Launch!', 1.5); }
    // auto gear / hook (radio pilots rarely have spare switches)
    const agl = b.pos.y - W.groundAt(b.pos.x, b.pos.z, b.pos.y);
    if (this.c.autoGear === 'on' && this.manualGear === null && !b.crashed) {
      if (!b.onGround && agl > 14 && b.vel.y > -1) b.gearDown = false;
      if (agl < 9 || (this.mission === 'carrier' && M.phase === 'return' && this.distToShip() < 500)) b.gearDown = true;
    } else if (this.manualGear !== null) b.gearDown = this.manualGear;
    b.hookDown = this.manualHook !== null ? this.manualHook : (this.mapName === 'sea' && !b.cat && (this.mission === 'carrier' ? M.phase !== 'launch' : true));
    const SUB = 4, h = dt / SUB;
    for (let i = 0; i < SUB; i++) b.step(h, inp, fcfg, W);
    if (b.trap && !this.trapSaid) { this.trapSaid = true; sound.trap(); }
    if (!b.trap) this.trapSaid = false;
    if (b.crashed && !this.crashSaid) { this.crashSaid = true; this.fx.boom(b.pos.clone(), 0.8); sound.boom(0.8); this.say(b.crashReason, 3); this.endT = 2.5; }
    if (!b.crashed) this.crashSaid = false;
    this.t += dt;
    this.updateCombat(dt, st);
    this.updateMission(dt);
    for (const a of this.ais) {
      if (a.role === 'lead') { const wp = M.wps[M.wp]; a.goal.copy(wp); if (a.pos.distanceTo(wp) < 60) M.wp = (M.wp + 1) % M.wps.length; a.fly(dt, W, { minAgl: 12 }); }
      else if (a.role === 'wing') { const L = this.ais[0]; const f = L.fwd(new V3()); const r = new V3().crossVectors(f, new V3(0, 1, 0)).normalize(); a.goal.copy(L.pos).addScaledVector(r, -4).addScaledVector(f, -4 + 30); a.fly(dt, W, { minAgl: 10, speed: L.speed + clamp(a.pos.distanceTo(new V3().copy(L.pos).addScaledVector(r, -4).addScaledVector(f, -4)) * 0.6, -4, 6) * Math.sign(new V3().copy(L.pos).addScaledVector(f, -4).sub(a.pos).dot(f)), turn: 1.2 }); }
      else this.flyBandit(a, dt);
    }
    this.trail.push({ t: this.t, p: b.pos.clone(), v: b.vel.clone() }); if (this.trail.length > 240) this.trail.shift();
    for (const e of this.escorts) e.update(dt, b, W);
    this.fx.update(dt);
    if (!b.crashed && b.airspeed > 20 && b.gload > 3.2 && Math.random() < dt * 20) { // wingtip vapour at high G
      for (const s of [-1, 1]) this.fx.puff(this.jet.localToWorld(new V3(s * 0.4 / RC.scale * RC.scale * 1, 0, 0.1)), { size: 0.18, life: 0.4, grow: 2 });
    }
    this.syncModel(dt);
    this.updateCamera(dt);
    W.sky.position.copy(this.camera.position);
    W.sun.target.position.copy(b.pos); W.sun.position.copy(b.pos).addScaledVector(W.sunDir, 120);
    W.sky.userData.uniforms.time.value = this.t; W.update(this.t);
    const dist = this.camMode === 'pilot' ? this.camera.position.distanceTo(b.pos) : 3;
    sound.engine({ thr: b.thr, airspeed: b.airspeed, on: !b.crashed, inside: this.camMode === 'cockpit', dist });
    if (render) this.drawHUD(st);
    if (this.endT !== undefined && !this.done) { this.endT -= dt; if (this.endT <= 0) this.finish(false); }
    if (render) composer.render();
    if (link.status === 'connected') link.tell({ flying: true, armed: st.arm });
  }
  distToShip() { return Math.hypot(this.body.pos.x, this.body.pos.z); }
  syncModel(dt) { const b = this.body; this.jet.position.copy(b.pos); this.jet.quaternion.copy(b.q); this.jet.userData.animate(dt, { thr: b.thr, ab: b.thr > 0.97 && !b.crashed, gearDown: b.gearDown, hookDown: b.hookDown }); }

  // ---- weapons, locks, missiles, flares
  updateCombat(dt, st) {
    const b = this.body, W = this.world; const auto = this.c.autoWeapons === 'on' || (this.c.autoWeapons === 'auto' && !st.fireMapped);
    this.fireCd -= dt; this.flareCd -= dt; this.gunCd -= dt;
    // targets in front of the nose
    const fwd = b.fwd(new V3()); let best = null, bestA = 0.6;
    const cands = this.ais.filter((a) => a.team === 'red' && !a.dead);
    if (this.mission === 'canyon' && !this.M.struck) cands.push({ pos: W.target.position.clone().setY(W.target.position.y + 2), vel: new V3(), ground: true });
    for (const a of cands) {
      const d = a.pos.clone().sub(b.pos); const dist = d.length(); if (dist > (a.ground ? 320 : 450)) continue;
      const ang = Math.acos(clamp(d.normalize().dot(fwd), -1, 1)); if (ang < bestA) { bestA = ang; best = a; }
    }
    if (best && best === this.lockTarget && !b.crashed) this.lockT += dt; else { this.lockTarget = best; this.lockT = 0; }
    const locked = this.lockTarget && this.lockT > 1.0;
    let wantFire = st.fire; if (auto && locked && this.lockT > 1.4) wantFire = true;
    if (wantFire && !b.crashed && this.fireCd <= 0) {
      if (locked && this.ammo.msl > 0) {
        this.ammo.msl--; this.fireCd = 1.2; sound.missile();
        const m = new Missile(this.scene, b.pos.clone().addScaledVector(b.up(new V3()), -0.12), b.vel.clone().addScaledVector(fwd, 6), this.lockTarget, { owner: 'blue', speed: 75, turn: 3.5 });
        this.missiles.push(m); this.say('Fox two', 1);
      } else if (!locked && st.fire && this.gunCd <= 0) { // guns
        this.gunCd = 0.07; sound.gun();
        const muzzle = b.pos.clone().addScaledVector(fwd, 0.6);
        this.fx.puff(muzzle.clone().addScaledVector(fwd, 8), { size: 0.12, life: 0.25, grow: 0, fire: true, vel: fwd.clone().multiplyScalar(220).add(b.vel) });
        for (const a of this.ais) if (a.team === 'red' && !a.dead) { const d = a.pos.clone().sub(b.pos); const dist = d.length(); if (dist < 180 && d.normalize().dot(fwd) > 0.997 && Math.random() < 0.35) this.hitAI(a, 0.34); }
      }
    }
    if ((st.flare || (auto && this.missiles.some((m) => m.owner === 'red' && m.target === b && m.pos.distanceTo(b.pos) < 140))) && this.flareCd <= 0 && this.ammo.flr > 0 && !b.crashed) {
      this.flareCd = 0.5; this.ammo.flr -= 2; sound.flare();
      for (const s of [-1, 1]) this.flares.push(new Flare(this.scene, b.pos, b.vel.clone().multiplyScalar(0.5).add(b.right(new V3()).multiplyScalar(s * 8)).add(new V3(0, -3, 0))));
    }
    for (let i = this.flares.length - 1; i >= 0; i--) { const f = this.flares[i]; f.update(dt, this.fx); if (f.dead) this.flares.splice(i, 1); }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]; const hit = m.update(dt, this.fx, this.flares);
      const gy = W.groundAt(m.pos.x, m.pos.z, m.pos.y);
      if (m.pos.y < gy) { m.done = true; this.fx.boom(m.pos.clone(), 0.6); }
      if (hit) {
        if (hit === b) { if (!b.crashed) { b.crash('Shot down'); } }
        else if (hit.ground) { this.fx.boom(hit.pos.clone(), 3); sound.boom(1.5); this.M.struck = true; W.target.visible = false; this.say('Target destroyed! Climb out!', 3); }
        else if (!hit.isFlare) this.hitAI(hit, 1);
        else this.fx.boom(m.pos.clone(), 0.4);
      }
      if (m.done) { m.dispose(); this.missiles.splice(i, 1); }
    }
    this.lockState = locked ? 2 : this.lockTarget ? 1 : 0;
    this.warn = this.missiles.some((m) => m.owner === 'red' && m.target === b);
    sound.tones(b.crashed ? 0 : this.lockState, this.warn && !b.crashed);
  }
  hitAI(a, dmg) { a.hp -= dmg; if (a.hp <= 0 && !a.dead) { a.dead = true; this.fx.boom(a.pos.clone(), 1); sound.boom(1); this.M.kills = (this.M.kills || 0) + 1; this.say('Splash one!', 2); } else this.fx.puff(a.pos, { size: 0.5, life: 0.4, fire: true }); }
  flyBandit(a, dt) {
    const b = this.body; if (a.dead) { a.fly(dt, this.world); if (Math.random() < dt * 30) this.fx.puff(a.pos, { size: 0.6, life: 2, grow: 3, color: '#333' }); return; }
    const toP = b.pos.clone().sub(a.pos); const dist = toP.length(); const af = a.fwd(new V3());
    const pf = b.fwd(new V3()); const behindMe = b.pos.clone().sub(a.pos).normalize().dot(pf) > 0.6 && dist < 260; // player on its six
    if (behindMe && !b.crashed) { // break turn
      const side = new V3().crossVectors(af, new V3(0, 1, 0)).normalize().multiplyScalar(a.t % 8 < 4 ? 1 : -1);
      a.goal.copy(a.pos).addScaledVector(af, 60).addScaledVector(side, 90).add(new V3(0, Math.sin(a.t) * 30, 0));
      a.fly(dt, this.world, { speed: 40, turn: 1.15, minAgl: 30 });
    } else {
      a.goal.copy(b.pos).addScaledVector(b.vel, Math.min(2, dist / 60)); if (b.crashed) a.goal.set(a.pos.x + af.x * 100, 150, a.pos.z + af.z * 100);
      a.fly(dt, this.world, { speed: dist > 300 ? 42 : 36, turn: 0.95, minAgl: 30 });
    }
    a.fireCd -= dt;
    if (!b.crashed && a.fireCd <= 0 && dist < 320 && toP.normalize().dot(af) > 0.88) {
      a.fireCd = 9 + Math.random() * 5; sound.missile();
      this.missiles.push(new Missile(this.scene, a.pos.clone(), a.vel.clone(), b, { owner: 'red', speed: 66, turn: 2.6, life: 6 })); this.say('Missile! Flares!', 2);
    }
  }
  // ---- objectives
  updateMission(dt) {
    const b = this.body, W = this.world, M = this.M; if (this.done || b.crashed) return;
    this.lines = []; this.arrowTo = null;
    if (this.mission === 'canyon') {
      M.timer -= dt; if (M.timer <= 0) return this.finish(false, 'Out of time');
      for (const g of W.gates) {
        if (g.passed) continue; const rel = b.pos.clone().sub(g.pos); const side = rel.dot(g.n);
        if (g.prevSide !== undefined && Math.sign(side) !== Math.sign(g.prevSide) && Math.abs(side) < 20) {
          if (rel.addScaledVector(g.n, -side).length() < g.r) { g.passed = true; M.gates++; g.mesh.material.emissive.set('#40ff80'); sound.ding(); } else g.passed = 'miss';
        }
        g.prevSide = side;
      }
      const agl = b.pos.y - W.groundAt(b.pos.x, b.pos.z);
      if (!M.struck) {
        if (agl > W.ceiling) { M.painted += dt; if (M.painted > 0.5) this.warnText = 'ABOVE THE CEILING'; } else M.painted = Math.max(0, M.painted - dt * 2);
        M.samCd -= dt;
        if (M.painted > 3 && M.samCd <= 0) this.samLaunch();
        const nxt = W.gates.find((g) => !g.passed); this.arrowTo = nxt ? nxt.pos : W.target.position;
      } else {
        M.samCd -= dt;
        if (!M.egress) { M.egress = true; M.samCd = 2; M.sams = 2; }
        if (M.sams > 0 && M.samCd <= 0) { this.samLaunch(); M.sams--; M.samCd = 3.5; }
        if (b.pos.y > 200) return this.finish(true);
        this.arrowTo = null;
      }
      this.lines = [`GATES ${M.gates}/${W.gates.length}`, M.struck ? 'CLIMB ABOVE 200 m' : 'TARGET: BUNKER AT RIVER\'S END'];
    }
    if (this.mission === 'carrier') {
      const d = this.distToShip();
      if (M.phase === 'launch' && !b.cat) { M.phase = 'out'; this.say('Good shot! Fly out past 500 m', 3); }
      if (M.phase === 'out' && d > 500) { M.phase = 'return'; this.say('Turn back. Gear and hook down. Land on the deck.', 4); }
      if (M.phase === 'return') { this.arrowTo = new V3(0, DECK.y, 30); if (b.trap && b.airspeed < 0.6) return this.finish(true); if (b.onGround && !b.trap && b.surfaceAt !== 'x' && W.surfaceAt(b.pos.x, b.pos.z) === 'deck' && !M.touched) { M.touched = true; } if (M.touched && !b.onGround && !b.trap) { M.touched = false; this.say('Bolter! Go around', 2.5); } }
      this.lines = [M.phase === 'launch' ? 'FULL THROTTLE TO LAUNCH' : M.phase === 'out' ? `OUTBOUND ${Math.round(d)}/500 m` : `SHIP ${Math.round(d)} m · HOOK ${b.hookDown ? 'DOWN' : 'UP'}`];
    }
    if (this.mission === 'dogfight') {
      const alive = this.ais.filter((a) => !a.dead).length;
      if (alive === 0) { if (M.wave < 2) { this.spawnWave(2); this.say('Two more inbound!', 3); } else return this.finish(true); }
      const near = this.ais.filter((a) => !a.dead).sort((p, q) => p.pos.distanceTo(b.pos) - q.pos.distanceTo(b.pos))[0]; if (near) this.arrowTo = near.pos;
      this.lines = [`KILLS ${M.kills}`, `BANDITS ${alive}`];
    }
    if (this.mission === 'formation') {
      M.timer -= dt; if (M.timer <= 0) return this.finish(true);
      const L = this.ais[0]; const f = L.fwd(new V3()); const r = new V3().crossVectors(f, new V3(0, 1, 0)).normalize();
      M.slot = L.pos.clone().addScaledVector(r, 4).addScaledVector(f, -4).add(new V3(0, -0.4, 0));
      const e = b.pos.distanceTo(M.slot); M.err = e; if (e < 2.5) M.inBox += dt; this.arrowTo = M.slot;
      this.lines = [`IN POSITION ${Math.round(M.inBox / Math.max(1, 100 - M.timer) * 100)}%`, e < 2.5 ? 'IN THE BOX' : `SLOT ${e.toFixed(1)} m`];
    }
  }
  samLaunch() {
    const W = this.world, b = this.body; this.M.samCd = 6; this.M.painted = 0;
    const s = W.sams.slice().sort((p, q) => p.position.distanceTo(b.pos) - q.position.distanceTo(b.pos))[0];
    const from = s.position.clone().add(new V3(0, 3, 0)); const v = b.pos.clone().sub(from).normalize().multiplyScalar(25).add(new V3(0, 15, 0));
    this.missiles.push(new Missile(this.scene, from, v, b, { owner: 'red', speed: 64, turn: 2.4, life: 7 })); sound.missile(); this.say('SAM launch! Flares!', 2);
  }
  finish(win, why) {
    if (this.done) return; this.done = true; const M = this.M, b = this.body;
    let title = win ? 'Mission complete' : 'Mission failed', rows = [];
    if (b.crashed) rows.push(['What happened', b.crashReason]); else if (why) rows.push(['What happened', why]);
    if (this.mission === 'canyon') { rows.push(['Gates', `${M.gates} / ${this.world.gates.length}`], ['Target', M.struck ? 'Destroyed' : 'Intact']); if (win) rows.push(['Time left', fmt(M.timer)]); }
    if (this.mission === 'carrier' && b.trap) { title = `Trapped the ${['', '1', '2', '3', '4'][b.trap.wire]}-wire`; rows.push(['Grade', b.trap.wire === 3 ? 'OK — perfect pass' : b.trap.wire === 2 ? 'Fair' : 'No-grade, but you\'re aboard'], ['Flight time', fmt(this.t)]); }
    if (this.mission === 'dogfight') rows.push(['Kills', String(M.kills)], ['Time', fmt(this.t)]);
    if (this.mission === 'formation') rows.push(['Time in position', `${Math.round(M.inBox / 100 * 100)}%`], ['Rating', M.inBox > 70 ? 'Blue Angels material' : M.inBox > 40 ? 'Solid wingman' : 'Keep practising']);
    if (this.mission === 'free') { title = 'Crashed'; rows.push(['Flight time', fmt(this.t)]); }
    $('resTitle').textContent = title;
    $('resBody').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const run = this.runId = (this.runId || 0) + 1;
    setTimeout(() => { if (this.done && game === this && this.runId === run) $('results').classList.remove('hidden'); }, 600);
  }
  // ---- cameras: pilot on the ground (Phoenix-style, auto-zoom), chase, cockpit, cinematic
  updateCamera(dt) {
    const b = this.body, cam = this.camera; const f = b.fwd(new V3());
    let fov = 55;
    if (this.camMode === 'pilot') {
      const P = this.world.pilot; cam.position.copy(P);
      const d = P.distanceTo(b.pos); fov = clamp(2 * Math.atan(3.2 / Math.max(1, d)) * 57.3, 7, 60);
      this.camLook.lerp(b.pos, 1 - Math.exp(-dt * 12)); cam.lookAt(this.camLook);
    } else if (this.camMode === 'cockpit') {
      cam.position.copy(b.pos).addScaledVector(f, 0.32).addScaledVector(b.up(new V3()), 0.07); cam.quaternion.copy(b.q); fov = 62;
    } else if (this.camMode === 'cine') {
      this.cineT -= dt;
      const esc = this.escorts.filter((e) => e.pos.distanceTo(b.pos) < 40);
      if (this.cineT <= 0 || !this.cineShot) {
        const shots = ['flyby', 'side', 'low', 'trail', 'close'];
        if (esc.length && !b.onGround) shots.push('wing', 'wing', 'over');
        let pick; do { pick = shots[Math.floor(Math.random() * shots.length)]; } while (pick === this.cineShot?.k && shots.length > 1);
        const side = new V3().crossVectors(f, new V3(0, 1, 0)).normalize(); const sgn = Math.random() < 0.5 ? -1 : 1;
        const S = this.cineShot = { k: pick, sgn, e: esc[Math.floor(Math.random() * esc.length)] };
        this.cineT = pick === 'wing' ? 6 : pick === 'flyby' || pick === 'close' ? 3.2 : 4.5;
        const lead = Math.max(18, b.airspeed);
        if (pick === 'flyby') S.anchor = b.pos.clone().addScaledVector(f, lead * 1.6).addScaledVector(side, sgn * 2.2).add(new V3(0, 0.4, 0));
        if (pick === 'close') S.anchor = b.pos.clone().addScaledVector(f, lead * 1.1).addScaledVector(side, sgn * 0.9).add(new V3(0, -0.25, 0));
        if (pick === 'low') S.anchor = b.pos.clone().addScaledVector(f, lead * 2.2).addScaledVector(side, sgn * 6); 
        if (S.anchor && pick === 'low') S.anchor.y = this.world.groundAt(S.anchor.x, S.anchor.z) + 0.6;
      }
      const S = this.cineShot; const side = b.right(new V3()), up = b.up(new V3());
      fov = 50;
      if (S.anchor) { const gy = this.world.groundAt(S.anchor.x, S.anchor.z); S.anchor.y = Math.max(S.anchor.y, gy + 0.4); cam.position.copy(S.anchor); cam.lookAt(b.pos); fov = clamp(2 * Math.atan((S.k === 'low' ? 5 : 2.4) / Math.max(1, cam.position.distanceTo(b.pos))) * 57.3, 10, 65); }
      else if (S.k === 'wing' && S.e) { // riding on a wingman's shoulder, looking across at you
        const ef = S.e.vel.clone().normalize(); const er = new V3().crossVectors(ef, new V3(0, 1, 0)).normalize();
        const toMe = b.pos.clone().sub(S.e.pos); const sideMe = Math.sign(toMe.dot(er)) || 1;
        this.camPos.copy(S.e.pos).addScaledVector(ef, -1.4).addScaledVector(er, -sideMe * 0.5).add(new V3(0, 0.35, 0));
        cam.position.copy(this.camPos); cam.lookAt(b.pos.clone().addScaledVector(f, 1.5)); fov = 46;
      } else if (S.k === 'over' && S.e) { // high and behind the whole formation
        cam.position.copy(b.pos).addScaledVector(f, -12).add(new V3(0, 5, 0)).addScaledVector(side, S.sgn * 4); cam.lookAt(b.pos.clone().addScaledVector(f, 6)); fov = 52;
      } else if (S.k === 'trail') { cam.position.copy(b.pos).addScaledVector(f, -6).addScaledVector(up, 0.4).addScaledVector(side, S.sgn * 1.4); cam.lookAt(b.pos.clone().addScaledVector(f, 8)); fov = 48; }
      else { cam.position.copy(b.pos).addScaledVector(side, 2.4 * S.sgn).addScaledVector(f, 0.5).addScaledVector(up, 0.25); cam.lookAt(b.pos.clone().addScaledVector(f, 0.8)); fov = 44; }
      const gy = this.world.groundAt(cam.position.x, cam.position.z); if (cam.position.y < gy + 0.3) cam.position.y = gy + 0.3;
    } else { // chase
      const vdir = b.vel.lengthSq() > 4 ? b.vel.clone().normalize() : f;
      const want = b.pos.clone().addScaledVector(vdir, -3.4).add(b.up(new V3()).multiplyScalar(0.75));
      if (!this.camPos.lengthSq() || this.camPos.distanceTo(want) > 30) this.camPos.copy(want);
      this.camPos.lerp(want, 1 - Math.exp(-dt * 7));
      const gy = this.world.groundAt(this.camPos.x, this.camPos.z); this.camPos.y = Math.max(this.camPos.y, gy + 0.3);
      cam.position.copy(this.camPos); cam.up.lerp(b.up(new V3()).lerp(new V3(0, 1, 0), 0.6), 1 - Math.exp(-dt * 4)).normalize();
      cam.lookAt(b.pos.clone().addScaledVector(f, 4)); fov = 58 + clamp(b.airspeed - 30, 0, 25) * 0.4;
    }
    if (this.camMode !== 'chase') cam.up.set(0, 1, 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
  }
  drawHUD(st) {
    const b = this.body, W = this.world; const e = new THREE.Euler().setFromQuaternion(b.q, 'YXZ');
    const fpmP = b.vel.lengthSq() > 4 ? hud.proj(b.pos.clone().addScaledVector(b.vel, 3), this.camera) : null;
    const targets = [];
    if (this.lockTarget) targets.push({ screen: hud.proj(this.lockTarget.pos, this.camera), dist: this.lockTarget.pos.distanceTo(b.pos), locked: this.lockState === 2, lockT: this.lockT, label: this.lockTarget.ground ? 'TGT' : null });
    if (this.mission === 'formation' && this.M.slot) targets.push({ screen: hud.proj(this.M.slot, this.camera), dist: this.M.err, label: 'SLOT' });
    let arrow = null;
    if (this.arrowTo) {
      const p = this.arrowTo.clone().project(this.camera); let x = p.x, y = p.y; const behind = p.z > 1; if (behind) { x = -x; y = -y; }
      if (behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.88) { const k = 0.85 / Math.max(Math.abs(x), Math.abs(y), 1e-3); x *= k; y *= k; arrow = [(x + 1) / 2 * innerWidth, (1 - y) / 2 * innerHeight, Math.atan2(-y, x)]; }
    }
    const warn = [];
    if (this.warn) warn.push(['MISSILE — FLARES', true]);
    if (this.warnText) { warn.push([this.warnText, true]); this.warnText = null; }
    if (b.stalled && !b.onGround) warn.push(['STALL', true]);
    if (!st.arm) warn.push([st.armSwitch ? 'THROTTLE SAFE · FLIP ARM' : st.source === 'touch' || st.source === 'phone' ? 'THROTTLE SAFE · TAP ARM' : 'THROTTLE SAFE · PRESS X', false]);
    if (b.cat && !b.cat.fired) warn.push([st.spring ? 'PUSH LEFT STICK UP TO FULL POWER' : 'FULL THROTTLE TO LAUNCH', false]);
    else if (this.mission !== 'canyon' && this.mission !== 'dogfight' && this.mission !== 'formation' && b.onGround && b.airspeed < 1 && !b.trap && !b.crashed && this.t < 8) warn.push([st.spring ? 'LEFT STICK UP: THROTTLE · PULL BACK AT 12 m/s' : 'THROTTLE UP · PULL BACK GENTLY AT 12 m/s', false]);
    if (this.msgT > 0) { this.msgT -= 1 / 60; warn.unshift([this.msg, false]); }
    if (b.crashed) warn.unshift([`${b.crashReason} — R to reset`, false]);
    if (this.c.display === 'cine') { hud.draw({ minimal: true, warn: warn.filter(([t, red]) => red || t === this.msg || b.crashed) }, this.camera); return; }
    hud.draw({ full: this.camMode !== 'pilot', bank: e.z, pitch: e.x, heading: ((-e.y * 57.3) % 360 + 360) % 360, speed: b.airspeed, alt: Math.max(0, b.pos.y - RC.gearH - W.groundAt(b.pos.x, b.pos.z)), g: b.gload, aoa: b.alpha * 57.3, thr: b.thr, armed: st.arm, units: this.c.units,
      mode: this.flightMode, rates: this.c.rates, gear: b.gearDown, hook: b.hookDown, stall: b.stalled && !b.onGround, fpm: fpmP,
      weapons: this.mission === 'dogfight' || this.mission === 'canyon' ? `MSL ${this.ammo.msl} · FLR ${this.ammo.flr}` : null,
      targets, arrow, timer: this.M.timer ?? null, lines: this.lines, warn }, this.camera);
  }
  dispose() {
    this.fx.clear(); for (const m of this.missiles) m.dispose();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
    sound.stopAll(); hud.draw(null);
  }
}

// ---------------- menu wiring
let game = null;
function syncSeg() {
  document.querySelectorAll('.seg[data-key]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(cfg[seg.dataset.key]) === b.dataset.v)));
  $('mapBlock').classList.toggle('collapsed', cfg.mission !== 'free');
  placeInd?.();
}
document.querySelectorAll('.seg[data-key]').forEach((seg) => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; cfg[seg.dataset.key] = b.dataset.v; saveCfg(); syncSeg(); describe();
  if (seg.dataset.key === 'quality') applyQuality(); if (seg.dataset.key === 'display') { if (game) game.c.display = cfg.display; applyDisplay(); } if (seg.dataset.key === 'wingmen' && game) { game.c.wingmen = cfg.wingmen; } if (seg.dataset.key === 'introMusic' || seg.dataset.key === 'flightMusic') musicUI();
}));
const SLIDERS = [['rates', 'Rates (RC mode)', 0.5, 1.4, 0.05], ['expo', 'Expo', 0, 0.8, 0.05], ['bankLimit', 'Bank limit (Arcade) °', 30, 80, 5], ['smoothMs', 'Stick smoothing ms', 0, 120, 5], ['delayMs', 'Added input delay ms', 0, 200, 10]];
const SOUND = [['vol', 'Sound volume', 0, 1, 0.05], ['musicVol', 'Music volume (M mutes)', 0, 1, 0.05]];
const sliderEls = [];
function buildSliders(el, list) {
  for (const [k, name, min, max, step] of list) {
    const w = document.createElement('div');
    w.innerHTML = `<label><span>${name}</span><span>${cfg[k]}</span></label><input type="range" min="${min}" max="${max}" step="${step}" value="${cfg[k]}" aria-label="${name}">`;
    w.querySelector('input').oninput = (e) => {
      cfg[k] = +e.target.value; saveCfg(); if (game) game.c[k] = cfg[k]; applyLive();
      for (const s of sliderEls) if (s.k === k) { s.inp.value = cfg[k]; s.lab.textContent = cfg[k]; }
    };
    sliderEls.push({ k, inp: w.querySelector('input'), lab: w.querySelector('label span:last-child') }); el.appendChild(w);
  }
}
function applyLive() { input.smoothMs = cfg.smoothMs; input.delayMs = cfg.delayMs; sound.setVolume(cfg.vol); sound.setMusicVolume(cfg.musicVol); music.setVolume(cfg.musicVol); }
buildSliders($('inputSliders'), SLIDERS); buildSliders($('soundSliders'), SOUND); buildSliders($('pauseSliders'), [...SOUND, ...SLIDERS.slice(0, 3)]);
applyLive();
const DESC_FLIGHT = { arcade: 'Stabilised trainer: sticks set the bank and climb angle, it levels itself when you let go and refuses to stall. Good for first flights and friends.', rc: 'Like Phoenix or a real model: the sticks move the control surfaces. It keeps whatever attitude you leave it in, stalls if you get slow, and drops a wing if you yank it.' };
function describe() {
  const m = MISSIONS[cfg.mission];
  swapText($('descMission'), m.desc); swapText($('descFlight'), DESC_FLIGHT[cfg.flight]);
  swapText($('flySummary'), `${m.name} · ${MAP_NAMES[m.map || cfg.map]} · ${cfg.flight === 'rc' ? 'RC mode' : 'Arcade'}${cfg.mission !== 'formation' && +cfg.wingmen ? ` · ${cfg.wingmen} wingm${cfg.wingmen === '1' ? 'an' : 'en'}` : ''}${cfg.display === 'cine' ? ' · Cinematic' : ''}`);
}
const TAB_ORDER = ['controls', 'settings', 'music', 'help'];
function showTab(t) {
  const prev = cfg.tab; const changed = prev && prev !== t;
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  document.querySelectorAll('.pane[data-pane]').forEach((p) => p.classList.toggle('active', p.dataset.pane === t));
  cfg.tab = t; saveCfg(); if (changed) animatePane(document.querySelector(`.pane[data-pane="${t}"]`), Math.sign(TAB_ORDER.indexOf(t) - TAB_ORDER.indexOf(prev))); placeInd?.();
}
document.querySelectorAll('.tabs [data-tab]').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
placeInd = initIndicators(); syncSeg(); showTab(cfg.tab || 'controls'); describe();
document.fonts?.ready.then(() => placeInd(true));

const setup = initSetup(input, () => { if (game) $('pause').classList.remove('hidden'); else $('menu').classList.remove('hidden'); });
$('btnSetup').onclick = () => { $('menu').classList.add('hidden'); setup.open(); };
$('btnPauseSetup').onclick = () => { $('pause').classList.add('hidden'); setup.open(); };
const CAMS = ['pilot', 'chase', 'cockpit', 'cine'];
const nextCam = () => { if (!game) return; let i = CAMS.indexOf(game.camMode); do { i = (i + 1) % CAMS.length; } while (CAMS[i] === 'pilot' && !game.world.pilot); game.camMode = CAMS[i]; game.camPos.set(0, 0, 0); game.cineShot = null; game.say({ pilot: 'Pilot view', chase: 'Chase', cockpit: 'Cockpit', cine: 'Cinematic' }[game.camMode], 1.2); };
const touch = initTouch(input, { onCam: nextCam, onPause: () => setPaused(true) });
const wantTouch = () => cfg.touch === 'on' || (cfg.touch === 'auto' && COARSE);

let flightTrack = null;
function startMusic() {
  stopMusic();
  if (cfg.flightMusic === 'mine' && music.loaded) { music.audio.loop = true; music.play(); flightTrack = 'mine'; }
  if (cfg.flightMusic === 'anthem') { anthem.start(); flightTrack = 'anthem'; }
}
function stopMusic() { if (flightTrack === 'mine') music.stop(); if (flightTrack === 'anthem' || anthem.playing) anthem.stop(); flightTrack = null; }
function applyDisplay() { document.body.classList.toggle('cleanview', !!game && cfg.display === 'cine'); }
function startGame() {
  $('loadMsg').textContent = 'Building world…'; sound.init();
  if (menuSong) { music.stop(); menuSong = false; $('rights').classList.remove('show'); }
  setTimeout(() => {
    try {
      if (game) { game.dispose(); game = null; }
      game = new Game({ ...cfg });
      $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('results').classList.add('hidden'); $('loadMsg').textContent = '';
      touch.show(wantTouch()); startMusic(); applyDisplay();
    } catch (err) { console.error(err); $('loadMsg').textContent = 'Error: ' + err.message; }
  }, 30);
}
$('btnFly').onclick = startGame;
function setPaused(p) {
  if (!game) return; game.paused = p; $('pause').classList.toggle('hidden', !p);
  if (p) { sound.stopAll(); if (flightTrack === 'mine') music.pause(); } else if (flightTrack === 'mine') music.resume();
}
function toMenu() { document.body.classList.remove('cleanview'); setPaused(false); stopMusic(); game.dispose(); game = null; touch.show(false); $('results').classList.add('hidden'); $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); menuBackdrop(); placeInd(true); enterMenu(); }
$('btnResume').onclick = () => setPaused(false);
$('btnRestart').onclick = () => { game.restart(); setPaused(false); };
$('btnQuit').onclick = toMenu;
$('btnAgain').onclick = () => { $('results').classList.add('hidden'); game.restart(); };
$('btnResMenu').onclick = toMenu;
addEventListener('keydown', (e) => {
  if (intro && !intro.skipping) { skipIntro(); return; }
  if (e.code === 'Escape' && game && $('setup').classList.contains('hidden')) setPaused(!game.paused);
  if (!game) return;
  if (e.code === 'KeyC') nextCam();
  if (e.code === 'KeyV') { cfg.display = cfg.display === 'cine' ? 'hud' : 'cine'; game.c.display = cfg.display; saveCfg(); syncSeg(); applyDisplay(); }
  if (e.code === 'KeyG') { game.manualGear = !game.body.gearDown; }
  if (e.code === 'KeyH') { game.manualHook = !game.body.hookDown; }
  if (e.code === 'KeyT') { cfg.flight = cfg.flight === 'rc' ? 'arcade' : 'rc'; game.c.flight = cfg.flight; saveCfg(); syncSeg(); describe(); game.say(cfg.flight === 'rc' ? 'RC mode' : 'Arcade mode', 1.5); }
  if (e.code === 'KeyM') { cfg.musicVol = cfg.musicVol > 0 ? 0 : 0.6; saveCfg(); applyLive(); for (const s of sliderEls) if (s.k === 'musicVol') { s.inp.value = cfg.musicVol; s.lab.textContent = cfg.musicVol; } }
});
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); game?.resize(); intro?.resize(); menuScene?.resize(); });

// ---------------- phone controller (laptop side)
link.onstatus = (s) => {
  const txt = { connecting: 'Connecting…', waiting: 'Waiting for the phone…', connected: 'Phone connected ✓', unavailable: 'Couldn’t reach the pairing service. Check the internet and click New code.', taken: 'That code is busy. Click New code.', off: '' }[s] || s;
  $('phoneStatus').textContent = txt; $('phoneDot').classList.toggle('ok', s === 'connected');
  if (s === 'connected') $('padText').textContent = 'Phone controller connected';
};
link.onevent = (k) => {
  if (k === 'fly' && !game) startGame();
  if (!game) return;
  if (k === 'reset') game.restart(); if (k === 'cam') nextCam(); if (k === 'pause') setPaused(!game.paused);
};
function loadQR() {
  const srcs = ['https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'];
  const tryLoad = (i) => new Promise((res) => {
    if (typeof window.qrcode === 'function') return res(true); if (i >= srcs.length) return res(false);
    const sc = document.createElement('script'); sc.src = srcs[i]; sc.onload = () => res(typeof window.qrcode === 'function' ? true : tryLoad(i + 1)); sc.onerror = () => res(tryLoad(i + 1)); document.head.appendChild(sc);
  });
  return tryLoad(0);
}
$('btnPhone').onclick = async () => {
  const wasHidden = $('phoneBox').classList.contains('hidden');
  const code = newCode(); const url = `${SITE_URL}#pad-${code}`;
  $('phoneBox').classList.remove('hidden'); $('phoneCode').textContent = code; $('phoneLink').textContent = url;
  $('btnPhone').textContent = 'New code'; if (wasHidden) reveal($('phoneBox'));
  const box = $('qr'); box.innerHTML = ''; box.classList.remove('hidden'); let ok = false;
  if (await loadQR()) { try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); ok = true; } catch (e) { ok = false; } }
  if (!ok) box.classList.add('hidden');
  $('btnCopyLink').onclick = () => { navigator.clipboard?.writeText(url).then(() => { $('btnCopyLink').textContent = 'Copied ✓'; }, () => {}); };
  link.host(code);
};
$('btnFull').onclick = () => { const d = document.documentElement; (d.requestFullscreen?.() || d.webkitRequestFullscreen?.())?.catch?.(() => {}); };

// ---------------- music picker (the player's own song is never uploaded anywhere)
function musicUI() {
  const len = (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
  $('musicName').textContent = music.loaded ? `Your song: ${music.name} (${len(music.duration)})` : 'No song chosen';
  $('btnMusicClear').classList.toggle('hidden', !music.loaded);
}
music.onchange = musicUI; musicUI();
$('btnMusic').onclick = () => $('musicFile').click();
$('musicFile').onchange = async (e) => { const f = e.target.files[0]; if (f) { $('musicName').textContent = 'Loading…'; await music.load(f); cfg.introMusic = 'mine'; saveCfg(); syncSeg(); } e.target.value = ''; };
$('btnMusicClear').onclick = () => music.clear();
$('btnReplay').onclick = () => { if (menuSong) { music.stop(); menuSong = false; } $('menu').classList.add('hidden'); playIntro(); };

function padStatus() {
  const p = input.pad(); $('padDot').classList.toggle('ok', !!p || link.status === 'connected');
  if (link.status !== 'connected') $('padText').textContent = p ? `Controller: ${p.id.replace(/\s*\(.*$/, '')}` : (COARSE ? 'Touch controls ready' : 'Keyboard ready · no radio detected');
}
addEventListener('gamepadconnected', padStatus); addEventListener('gamepaddisconnected', padStatus); padStatus();

// ---------------- menu backdrop: the model carrier at sunset with jets circling
let menuScene = null;
function menuBackdrop() {
  if (menuScene) return;
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 9000);
  const world = buildWorld('sea', { scene, hi: cfg.quality === 'high', renderer });
  const parked = rcModel(buildHornet({ modex: '214' })); parked.position.copy(world.spawn.pos); scene.add(parked); parked.userData.animate(0, { gearDown: true });
  const fly = [0, 1].map((i) => { const j = rcModel(buildHornet({ modex: i ? '103' : '100' })); scene.add(j); return j; });
  let t = 0;
  menuScene = {
    resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); },
    update(dt) {
      t += dt; world.update(t); world.sky.userData.uniforms.time.value = t;
      fly.forEach((j, i) => { const a = t * 0.11 + i * 0.12; const r = 90; j.position.set(Math.cos(a) * r, 22 + i * 0.6, Math.sin(a) * r - 40); j.lookAt(Math.cos(a + 0.05) * r, 22 + i * 0.6, Math.sin(a + 0.05) * r - 40); j.rotateY(Math.PI); j.rotateZ(0.45); j.userData.animate(dt, { thr: 0.8, gearDown: false }); });
      const a = t * 0.03; camera.position.set(-10 + Math.sin(a) * 4, DECK.y + 2.2, 14 + Math.cos(a) * 3); camera.lookAt(0, DECK.y + 0.6, -8);
      world.sky.position.copy(camera.position); world.sun.target.position.set(0, DECK.y, 0); world.sun.position.copy(world.sun.target.position).addScaledVector(world.sunDir, 120);
      renderer.toneMappingExposure = 1; bloom.strength = 0.5; rpass.scene = scene; rpass.camera = camera; composer.render();
    },
    dispose() { scene.traverse((o) => { o.geometry?.dispose?.(); }); menuScene = null; },
  };
}

// ---------------- splash (disclaimer) + intro montage
let intro = null, introSong = false, menuSong = false;
let introSongTimer = 0;
async function playIntro() {
  sound.init(); menuScene?.dispose();
  introSong = cfg.introMusic === 'mine' && music.loaded;
  let pre = 0, delay = 0, loopUntil = 0;
  if (introSong) {
    // line the title up with the song's big moment, and keep the montage going for the length of the song
    const hit = await music.hitTime();
    if (hit != null) { if (hit > 20.9) pre = hit - 20.9; else delay = 20.9 - hit; }
    loopUntil = Math.min(music.duration + delay, 240);
  }
  intro = new Intro(renderer, { pre, loopUntil }); intro.songDelay = delay; intro.resize(); intro.cardsShown = new Set();
  document.body.classList.add('cine'); $('introUI').classList.remove('hidden'); $('cards').innerHTML = ''; $('titleCard').classList.remove('show');
  if (introSong) {
    music.audio.loop = false; clearTimeout(introSongTimer); introSongTimer = setTimeout(() => music.play(), delay * 1000);
    $('rights').innerHTML = `♪ “${music.name.replace(/[<>&]/g, '')}” — all rights belong to its owners. Played from your device, not distributed with this game.`; $('rights').classList.add('show');
  } else if (cfg.introMusic !== 'off') anthem.start();
}
function skipIntro() { if (!intro) return; intro.skipping = true; endIntro(); }
function endIntro() {
  if (!intro) return; intro.dispose(); intro = null; document.body.classList.remove('cine'); $('introUI').classList.add('hidden'); if (!introSong) $('rights').classList.remove('show');
  clearTimeout(introSongTimer);
  if (introSong) { // the song carries on quietly under the menu until it ends or you fly
    if (!music.playing || music.audio.ended) { music.stop(); $('rights').classList.remove('show'); } else { music.audio.volume = music.vol * 0.55; menuSong = true; music.audio.onended = () => { menuSong = false; $('rights').classList.remove('show'); }; }
  } else anthem.fade(2);
  cfg.seenIntro = true; saveCfg();
  $('menu').classList.remove('hidden'); menuBackdrop(); placeInd(true); enterMenu();
}
function introFrame(dt) {
  // lock the pictures to the music clock so the title always lands on the beat, even if frames drop
  if (introSong && music.audio.ended) { endIntro(); return; } // song finished: straight to the menu, no frozen frame
  const clock = introSong ? (music.audio.paused ? null : music.audio.currentTime + intro.songDelay) : anthem.playing ? anthem.time : null;
  if (clock != null && clock > intro.t) dt = Math.min(0.25, clock - intro.t); else if (clock != null) dt = 0;
  intro.update(dt); const t = intro.u;
  for (const [i, c] of CARDS.entries()) {
    if (t >= c.t && !intro.cardsShown.has(i)) { intro.cardsShown.add(i); const el = document.createElement('p'); el.className = 'card'; el.innerHTML = c.html; $('cards').appendChild(el); requestAnimationFrame(() => el.classList.add('show')); setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 900); }, c.d * 1000); }
  }
  $('titleCard').classList.toggle('show', t > 20.9 && t < 33 && intro.cycle === 0);
  renderer.toneMappingExposure = 1.05; bloom.strength = 0.55; rpass.scene = intro.scene; rpass.camera = intro.camera; composer.render();
  if (intro.done) endIntro();
}
$('splash').onclick = () => {
  $('splash').classList.add('hidden'); sound.init();
  // unlock the song element inside the tap (iPhone/Safari block play() that starts later otherwise)
  if (cfg.introMusic === 'mine' && music.loaded) { music.audio.muted = true; music.audio.play().then(() => { music.audio.pause(); music.audio.muted = false; }, () => { music.audio.muted = false; }); }
  playIntro();
};
$('introUI').onclick = skipIntro;

// phone opened with #pad-<code>: become the controller instead of the game
const padMatch = /^#pad(?:-([a-z0-9]{4,6}))?$/.exec(location.hash);
if (padMatch) { $('splash').classList.add('hidden'); runPadPage(padMatch[1] || '', input, touch); }
else { $('menu').classList.add('hidden'); $('splash').classList.remove('hidden'); }
setInterval(() => { if (!game && link.status === 'connected') link.tell({ flying: false }); }, 1000);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game) game.update(dt);
  else if (intro) introFrame(dt);
  else if (menuScene && !$('menu').classList.contains('hidden')) menuScene.update(dt);
  if (!game && !padMatch) padStatus();
}
requestAnimationFrame(frame);
window.__toprc = { music, playIntro, sim(sec, fn) { const log = []; for (let i = 0; i < sec * 60; i++) { fn?.(game, i / 60); game.update(1 / 60, false); if (i % 60 === 0) { const b = game.body; log.push(`${i / 60}s p${b.pos.toArray().map((v) => v.toFixed(0))} v${b.airspeed.toFixed(1)} ${b.crashReason || ''} ${game.M.phase || ''}`); } } return log; }, input, get game() { return game; }, cfg, startGame, skipIntro, get intro() { return intro; } };
