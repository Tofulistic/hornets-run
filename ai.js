// AI jets (bandits, wingmen, formation lead), missiles, flares and explosions.
// AI flies a point-mass "bank-to-turn" model at RC scale so it moves like the player's jet.
import * as THREE from 'three';
import { glowTex } from './textures.js';

const V3 = THREE.Vector3; const _a = new V3(), _b = new V3(), _c = new V3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class AIJet {
  constructor(mesh, { speed = 34, turn = 1.0, hp = 1, team = 'red' } = {}) {
    this.mesh = mesh; this.pos = new V3(); this.vel = new V3(0, 0, -speed); this.speed = speed; this.turn = turn;
    this.bank = 0; this.hp = hp; this.team = team; this.dead = false; this.fireCd = 3 + Math.random() * 3; this.flares = 6; this.t = 0;
    this.goal = new V3(); this.fall = 0;
  }
  place(p, yaw) { this.pos.copy(p); this.vel.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(this.speed); this.sync(0); }
  // fly toward this.goal; minAlt keeps it off the ground
  fly(dt, world, { minAgl = 25, speed = this.speed, turn = this.turn } = {}) {
    this.t += dt;
    if (this.dead) { // spiral down
      this.fall += dt; this.vel.y -= 9.8 * dt; this.bank += dt * 4; this.pos.addScaledVector(this.vel, dt);
      const gy = world.groundAt(this.pos.x, this.pos.z, this.pos.y); if (this.pos.y < gy) { this.pos.y = gy; this.vel.set(0, 0, 0); this.mesh.visible = false; }
      this.sync(dt); return;
    }
    const cur = _a.copy(this.vel).normalize();
    const want = _b.copy(this.goal).sub(this.pos);
    const gy = world.groundAt(this.pos.x, this.pos.z, this.pos.y), agl = this.pos.y - gy;
    if (agl < minAgl) want.y += (minAgl - agl) * 8 + 20;
    want.normalize();
    // rotate velocity toward desired, limited by turn rate (rad/s)
    const ang = Math.acos(clamp(cur.dot(want), -1, 1));
    const step = Math.min(ang, turn * dt);
    if (ang > 1e-4) { const axis = _c.crossVectors(cur, want).normalize(); cur.applyAxisAngle(axis, step); }
    // bank toward the turn
    const side = new V3().crossVectors(cur, new V3(0, 1, 0)).normalize();
    const lat = want.dot(side); // + = turning right
    const tgtBank = clamp(lat * 3, -1.3, 1.3) * (ang > 0.02 ? 1 : 0.2);
    this.bank += (tgtBank - this.bank) * Math.min(1, dt * 3);
    const spd = this.vel.length(); const nv = spd + (speed - spd) * Math.min(1, dt * 0.8);
    this.vel.copy(cur).multiplyScalar(nv);
    this.pos.addScaledVector(this.vel, dt);
    this.sync(dt);
  }
  sync(dt) {
    const f = _a.copy(this.vel); if (f.lengthSq() < 1e-4) return; f.normalize();
    _m.lookAt(new V3(), f, new V3(0, 1, 0)); this.mesh.quaternion.setFromRotationMatrix(_m);
    _q.setFromAxisAngle(new V3(0, 0, 1), -this.bank); this.mesh.quaternion.multiply(_q);
    this.mesh.position.copy(this.pos);
    this.mesh.userData.animate?.(dt, { thr: 0.8, ab: !this.dead && this.vel.length() > this.speed * 1.05, gearDown: false });
  }
  fwd(o = new V3()) { return o.copy(this.vel).normalize(); }
}

// ---------------------------------------------------------------- particles: smoke trails, flares, explosions
export class FX {
  constructor(scene) {
    this.scene = scene; this.list = [];
    this.tex = glowTex();
    this.smokeMat = new THREE.SpriteMaterial({ map: this.tex, color: '#d8d4cc', transparent: true, depthWrite: false, opacity: 0.5, fog: true });
    this.fireMat = new THREE.SpriteMaterial({ map: this.tex, color: '#ffb050', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  }
  puff(p, { size = 0.6, life = 1.5, grow = 2, fire = false, vel = null, color = null } = {}) {
    if (this.list.length > 700) return;
    const m = (fire ? this.fireMat : this.smokeMat).clone(); if (color) m.color.set(color);
    const s = new THREE.Sprite(m); s.position.copy(p); s.scale.setScalar(size); this.scene.add(s);
    this.list.push({ s, life, t: 0, size, grow, vel: vel ? vel.clone() : null, o0: m.opacity });
  }
  boom(p, scale = 1) {
    for (let i = 0; i < 14; i++) this.puff(p.clone().add(new V3().randomDirection().multiplyScalar(Math.random() * 1.5 * scale)), { size: 2 * scale, life: 0.5 + Math.random() * 0.4, grow: 4, fire: true, vel: new V3().randomDirection().multiplyScalar(6 * scale) });
    for (let i = 0; i < 12; i++) this.puff(p.clone().add(new V3().randomDirection().multiplyScalar(Math.random() * 2 * scale)), { size: 2.5 * scale, life: 2.5 + Math.random() * 2, grow: 3, color: '#3a3532', vel: new V3(0, 2, 0).add(new V3().randomDirection().multiplyScalar(2)) });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const P = this.list[i]; P.t += dt; const k = P.t / P.life;
      if (k >= 1) { this.scene.remove(P.s); P.s.material.dispose(); this.list.splice(i, 1); continue; }
      if (P.vel) { P.s.position.addScaledVector(P.vel, dt); P.vel.multiplyScalar(Math.exp(-dt * 1.5)); }
      P.s.scale.setScalar(P.size * (1 + P.grow * k)); P.s.material.opacity = P.o0 * (1 - k) * (P.s.material.blending === THREE.AdditiveBlending ? 1.6 : 1);
    }
  }
  clear() { for (const P of this.list) { this.scene.remove(P.s); P.s.material.dispose(); } this.list.length = 0; }
}

// Missiles use proportional navigation; flares can seduce them.
export class Missile {
  constructor(scene, from, vel, target, { speed = 70, life = 6, owner = 'red', turn = 3.2 } = {}) {
    this.pos = from.clone(); this.vel = vel.clone(); this.target = target; this.speed = speed; this.life = life; this.owner = owner; this.turn = turn;
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#dcdcd6', roughness: 0.5 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffcf8a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    glow.scale.setScalar(0.9); glow.position.z = 0.3; this.mesh.add(body, glow); scene.add(this.mesh); this.scene = scene;
    this.done = false; this.t = 0; this.decoyed = false;
  }
  update(dt, fx, flares) {
    this.t += dt; if (this.t > this.life) { this.done = true; return null; }
    // seduction: a fresh flare near the target can steal the seeker (once)
    if (!this.decoyed && flares.length && this.target && !this.target.isFlare) {
      for (const f of flares) if (f.age < 0.7 && f.pos.distanceTo(this.target.pos) < 6 && Math.random() < dt * 6) { this.target = f; this.decoyed = true; break; }
    }
    const spd = Math.min(this.speed, this.vel.length() + 90 * dt);
    if (this.target && !this.target.dead) {
      const tp = this.target.pos, tv = this.target.vel || _c.set(0, 0, 0);
      const rel = _a.copy(tp).sub(this.pos); const dist = rel.length();
      const tgo = dist / Math.max(10, spd);
      const aim = _b.copy(tp).addScaledVector(tv, tgo * 0.9).sub(this.pos).normalize();
      const cur = this.vel.clone().normalize(); const ang = Math.acos(clamp(cur.dot(aim), -1, 1));
      if (ang > 1.4 && this.t > 0.6) this.target = null; // lost lock (overshot)
      else if (ang > 1e-4) cur.applyAxisAngle(_c.crossVectors(cur, aim).normalize(), Math.min(ang, this.turn * dt));
      this.vel.copy(cur).multiplyScalar(spd);
      if (dist < 2.2 && this.target) { this.done = true; return this.target; }
    } else this.vel.setLength(spd);
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos); this.mesh.lookAt(_a.copy(this.pos).sub(this.vel));
    if (Math.random() < dt * 40) fx.puff(this.pos, { size: 0.35, life: 2.2, grow: 3 });
    return null;
  }
  dispose() { this.scene.remove(this.mesh); }
}
export class Flare {
  constructor(scene, pos, vel) {
    this.isFlare = true; this.pos = pos.clone(); this.vel = vel.clone(); this.age = 0; this.dead = false;
    this.s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#fff2c0', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.s.scale.setScalar(1.4); scene.add(this.s); this.scene = scene;
  }
  update(dt, fx) {
    this.age += dt; this.vel.y -= 9.8 * dt * 0.6; this.vel.multiplyScalar(Math.exp(-dt * 1.2)); this.pos.addScaledVector(this.vel, dt);
    this.s.position.copy(this.pos); this.s.material.opacity = Math.max(0, 1 - this.age / 3); this.s.scale.setScalar(1.2 + Math.sin(this.age * 40) * 0.3);
    if (Math.random() < dt * 30) fx.puff(this.pos, { size: 0.4, life: 1.6, grow: 2.5 });
    if (this.age > 3) { this.dead = true; this.scene.remove(this.s); }
  }
}

// Wingmen that fly in formation on the player, like a convoy: a damped spring toward their slot,
// banking with their own lateral acceleration so they look flown, not glued. They move out of your way, never into it.
export class Escort {
  constructor(mesh, offset) {
    this.mesh = mesh; this.off = offset.clone(); this.pos = new V3(); this.vel = new V3(); this.q = new THREE.Quaternion(); this.bank = 0; this.dodge = new V3(); this.orbitA = Math.random() * 6;
    this.team = 'blue'; this.dead = false;
  }
  place(p, v, q) { this.pos.copy(p); this.vel.copy(v); this.q.copy(q); this.sync(0, 0.7); }
  update(dt, body, world) {
    const slot = _a, svel = _b;
    const airborne = !body.onGround && body.airspeed > 15 && !body.crashed;
    if (airborne && this.trail && this.trail.length > 2) { // follow the leader's exact path, a moment behind (canyon)
      const tt = this.trail[this.trail.length - 1].t - this.delay; let h = this.trail[0];
      for (let i = this.trail.length - 1; i >= 0; i--) if (this.trail[i].t <= tt) { h = this.trail[i]; break; }
      slot.copy(h.p).add(new V3(0, this.off.y, 0)); svel.copy(h.v);
    } else if (airborne) {
      // offset in the leader's frame, yaw-and-pitch only so a roll doesn't swing the whole formation
      const f = body.fwd(new V3()); const flat = new V3(f.x, 0, f.z); if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1); flat.normalize();
      const r = new V3(-flat.z, 0, flat.x);
      slot.copy(body.pos).addScaledVector(r, this.off.x).addScaledVector(f, -this.off.z).add(new V3(0, this.off.y, 0));
      svel.copy(body.vel);
    } else { // orbit overhead until the leader is flying
      this.orbitA += dt * 0.32; const c = world.spawnCenter || body.pos;
      slot.set(c.x + Math.cos(this.orbitA) * 110, (world.groundAt(c.x, c.z) || 0) + 45 + this.off.y, c.z + Math.sin(this.orbitA) * 110);
      svel.set(-Math.sin(this.orbitA), 0, Math.cos(this.orbitA)).multiplyScalar(110 * 0.32);
    }
    // keep clear of the player: slide the slot away if they come close
    const away = _c.copy(this.pos).sub(body.pos); const d = away.length();
    if (d < 4 && !body.crashed) this.dodge.addScaledVector(away.normalize(), (4 - d) * 6 * dt);
    this.dodge.multiplyScalar(Math.exp(-dt * 0.6)); slot.add(this.dodge);
    const gy = world.groundAt(slot.x, slot.z, slot.y); if (slot.y < gy + 4) slot.y = gy + 4;
    const k = airborne ? (this.trail ? 6 : 3.2) : 1.2, c = 2 * Math.sqrt(k);
    const acc = new V3().copy(slot).sub(this.pos).multiplyScalar(k).add(new V3().copy(svel).sub(this.vel).multiplyScalar(c));
    if (acc.length() > 45) acc.setLength(45);
    this.vel.addScaledVector(acc, dt);
    if (this.pos.distanceTo(slot) > 400) { this.pos.copy(slot); this.vel.copy(svel); } // teleport after a reset, out of sight
    this.pos.addScaledVector(this.vel, dt);
    // bank from sideways acceleration (coordinated turn)
    const fw = this.vel.lengthSq() > 1 ? new V3().copy(this.vel).normalize() : new V3(0, 0, -1);
    const right = new V3().crossVectors(fw, new V3(0, 1, 0)).normalize();
    const lat = acc.dot(right) + (airborne ? 0 : 0);
    this.bank += (Math.atan2(lat, 9.8) * 0.9 - this.bank) * Math.min(1, dt * 3);
    this.sync(dt, body.thr);
  }
  sync(dt, thr) {
    const f = _a.copy(this.vel); if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    _m.lookAt(new V3(), f, new V3(0, 1, 0)); this.mesh.quaternion.setFromRotationMatrix(_m);
    _q.setFromAxisAngle(new V3(0, 0, 1), -this.bank); this.mesh.quaternion.multiply(_q);
    this.mesh.position.copy(this.pos);
    this.mesh.userData.animate?.(dt, { thr, ab: thr > 0.97, gearDown: false });
  }
}
