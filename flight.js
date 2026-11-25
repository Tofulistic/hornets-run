// RC-scale jet flight model (Phoenix-RC style): real lift/drag from airspeed and angle of attack,
// stall with tip-stall wobble, EDF thrust that fades with speed, wheeled ground handling.
// RC mode: sticks drive the control surfaces directly. Arcade mode: a trainer stabiliser on the same physics.
import * as THREE from 'three';

const G = 9.81, RHO = 1.2;
export const RC = {
  scale: 1 / 14.6, // 18.3 m Super Hornet -> 1.25 m model
  mass: 3.6, S: 0.22, Tstatic: 40, Vfan: 72,
  CL0: 0.12, CLa: 4.6, aStall: 0.29, CLmax: 1.45,
  CD0: 0.05, K: 0.09, gearCD: 0.012,
  qref: 0.5 * RHO * 30 * 30,
  pitch: { auth: 15, stab: 40, damp: 8 }, roll: { auth: 52, damp: 14 }, yaw: { auth: 11, stab: 26, damp: 6 },
  gearH: 0.17, // CG height above wheels' contact patch
};
const V = THREE.Vector3, Q = THREE.Quaternion;
const _f = new V(), _u = new V(), _r = new V(), _vb = new V(), _a = new V(), _d = new V(), _l = new V(), _q = new Q(), _qi = new Q(), _e = new THREE.Euler();
const expo = (x, e) => x * (1 - e) + x * x * x * e;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class JetBody {
  constructor() {
    this.pos = new V(); this.vel = new V(); this.q = new Q(); this.w = new V();
    this.thr = 0; this.gearDown = true; this.hookDown = false; this.crashed = false; this.crashReason = '';
    this.onGround = true; this.alpha = 0; this.beta = 0; this.airspeed = 0; this.gload = 1; this.stalled = false;
    this.cat = null; this.trap = null; this.tipStall = 0; this.wind = new V();
  }
  reset(pos, yaw, { airborne = false, speed = 0 } = {}) {
    this.pos.copy(pos); this.q.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ')); this.w.set(0, 0, 0);
    this.vel.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(speed);
    this.thr = airborne ? 0.6 : 0; this.crashed = false; this.onGround = !airborne; this.gearDown = !airborne; this.hookDown = false;
    this.cat = null; this.trap = null; this.tipStall = 0;
  }
  fwd(o = new V()) { return o.set(0, 0, -1).applyQuaternion(this.q); }
  up(o = new V()) { return o.set(0, 1, 0).applyQuaternion(this.q); }
  right(o = new V()) { return o.set(1, 0, 0).applyQuaternion(this.q); }
  bank() { _e.setFromQuaternion(this.q, 'YXZ'); return _e.z; }
  pitchAng() { _e.setFromQuaternion(this.q, 'YXZ'); return _e.x; }

  // trainer-style stabiliser: sticks command bank/pitch angles, it flies the surfaces for you
  assist(inp, cfg) {
    _e.setFromQuaternion(this.q, 'YXZ');
    const bank = _e.z, pitch = _e.x;
    const tgtBank = -inp.roll * (cfg.bankLimit || 60) * Math.PI / 180;
    const tgtPitch = -inp.pitch * 40 * Math.PI / 180 + 0.01;
    let ur = clamp((bank - tgtBank) * 2.2 + this.w.z * 0.2, -1, 1);         // roll toward target bank
    let up = clamp(-(tgtPitch - pitch) * 2.6 + this.w.x * 0.25, -1, 1);    // pitch toward target attitude
    up -= Math.abs(Math.sin(bank)) * 0.35;                                   // hold the nose up in turns
    if (this.alpha > RC.aStall * 0.8) up = Math.max(up, -0.1);               // anti-stall: never pull into a stall
    const uy = clamp(inp.yaw - bank * 0.25, -1, 1);                          // auto-coordinate
    return { roll: clamp(ur, -1, 1), pitch: clamp(up, -1, 1), yaw: uy };
  }

  step(dt, inp, cfg, world) {
    if (this.crashed) { // tumble
      this.vel.y -= G * dt; this.vel.multiplyScalar(Math.exp(-dt * 0.8)); this.pos.addScaledVector(this.vel, dt);
      const wl = this.w.length(); if (wl > 1e-4) { _q.setFromAxisAngle(_a.copy(this.w).divideScalar(wl), wl * dt); this.q.multiply(_q).normalize(); }
      const gy = world.groundAt(this.pos.x, this.pos.z, this.pos.y); if (this.pos.y < gy + 0.08) { this.pos.y = gy + 0.08; this.vel.set(0, 0, 0); this.w.multiplyScalar(0.7); }
      return;
    }
    // throttle spool (EDF responds fast but not instantly)
    this.thr += clamp(inp.thr - this.thr, -dt * 2.5, dt * 2.5);
    // controls
    let c;
    if (cfg.mode === 'arcade') c = this.assist(inp, cfg);
    else { const e = cfg.expo ?? 0.3, rr = cfg.rates ?? 1; c = { roll: expo(inp.roll, e) * rr, pitch: expo(inp.pitch, e) * rr, yaw: expo(inp.yaw, e * 0.6) * rr }; }

    // catapult (bungee launcher) holds the jet then flings it down the deck
    if (this.cat) return this.catStep(dt, inp);

    // aerodynamics in body frame
    _qi.copy(this.q).invert();
    _vb.copy(this.vel).sub(this.wind).applyQuaternion(_qi);
    const Vair = _vb.length(); this.airspeed = Vair;
    const qd = 0.5 * RHO * Vair * Vair, qn = qd / RC.qref, sq = Math.sqrt(qn);
    this.alpha = Vair > 1 ? Math.atan2(-_vb.y, -_vb.z) : 0;
    this.beta = Vair > 1 ? Math.atan2(_vb.x, -_vb.z) : 0;
    const a = this.alpha, aa = Math.abs(a);
    let CL;
    if (aa < RC.aStall) CL = RC.CL0 + RC.CLa * a;
    else CL = Math.sign(a) * Math.max(0.55, RC.CLmax - (aa - RC.aStall) * 2.2); // past the stall lift collapses
    CL = clamp(CL, -RC.CLmax, RC.CLmax);
    this.stalled = aa > RC.aStall && Vair > 3;
    const CD = RC.CD0 + RC.K * CL * CL + (this.gearDown ? RC.gearCD : 0) + Math.sin(a) ** 2 * 1.1 + (this.hookDown ? 0.004 : 0);

    // forces (world frame)
    const fwd = this.fwd(_f), up = this.up(_u), right = this.right(_r);
    const F = _a.set(0, -G * RC.mass, 0);
    const T = RC.Tstatic * this.thr * Math.max(0, 1 - Vair / RC.Vfan) * (cfg.thrustScale ?? 1);
    F.addScaledVector(fwd, T);
    if (Vair > 0.5) {
      const vdir = _d.copy(this.vel).sub(this.wind).normalize();
      _l.copy(up).addScaledVector(vdir, -up.dot(vdir)); if (_l.lengthSq() > 1e-6) _l.normalize();
      F.addScaledVector(_l, qd * RC.S * CL);
      F.addScaledVector(vdir, -qd * RC.S * CD);
      F.addScaledVector(right, -qd * RC.S * 1.4 * this.beta); // side force
    }
    // moments -> body angular acceleration
    const P = RC.pitch, R = RC.roll, Y = RC.yaw;
    const aTrim = 0.022; // trimmed for ~32 m/s level cruise, like a real RC set-up
    let dwx = -c.pitch * P.auth * qn - P.stab * (a - aTrim) * qn - P.damp * this.w.x * Math.max(0.25, sq);
    let dwz = -c.roll * R.auth * qn - R.damp * this.w.z * Math.max(0.25, sq) + 4 * this.beta * qn;
    let dwy = -c.yaw * Y.auth * qn - Y.stab * this.beta * qn - Y.damp * this.w.y * Math.max(0.25, sq);
    // tip stall: a stalled wing drops, hard
    if (this.stalled && !this.onGround) {
      if (!this.tipStall) this.tipStall = Math.random() < 0.5 ? -1 : 1;
      dwz += this.tipStall * 26 * Math.min(1, (aa - RC.aStall) * 6) * Math.max(0.4, sq);
      dwx -= 6 * Math.max(0.4, sq); // nose drops
    } else this.tipStall = 0;
    if (this.onGround) { dwz = -this.w.z * 30; }
    this.w.x += dwx * dt; this.w.y += dwy * dt; this.w.z += dwz * dt;
    const wl = this.w.length(); if (wl > 1e-6) { _q.setFromAxisAngle(_vb.copy(this.w).divideScalar(wl), wl * dt); this.q.multiply(_q).normalize(); }

    // integrate
    this.gload = Vair > 3 ? (qd * RC.S * CL) / (RC.mass * G) : 1;
    this.vel.addScaledVector(F, dt / RC.mass);
    this.pos.addScaledVector(this.vel, dt);
    this.ground(dt, inp, c, world);
  }

  ground(dt, inp, c, world) {
    const gy = world.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const surf = world.surfaceAt ? world.surfaceAt(this.pos.x, this.pos.z, this.pos.y) : 'ground';
    const bottom = this.pos.y - RC.gearH;
    if (bottom < gy) {
      _e.setFromQuaternion(this.q, 'YXZ');
      const sink = -this.vel.y, bank = Math.abs(_e.z), pitch = _e.x, spd = Math.hypot(this.vel.x, this.vel.z);
      if (surf === 'water') return this.crash('Splash!');
      if (surf === 'terrain' && spd > 4) return this.crash('Hit the terrain');
      if (!this.gearDown) return this.crash('Belly landing');
      if (sink > 3.2) return this.crash('Hard landing');
      if (bank > 0.45) return this.crash('Wingtip strike');
      if (pitch < -0.2 && spd > 6) return this.crash('Nosed over');
      // on the wheels
      this.pos.y = gy + RC.gearH; if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
      // arrested landing on the carrier wires
      if (!this.trap && this.hookDown && world.wireAt && world.wireAt(this.pos.x, this.pos.z)) this.trap = { wire: world.wireAt(this.pos.x, this.pos.z) };
      const fwdFlat = _f.set(0, 0, -1).applyQuaternion(this.q).setY(0).normalize();
      const vf = this.vel.dot(fwdFlat);
      let decel = 0.4 + (this.thr < 0.05 ? 2.2 : 0); // rolling resistance + brakes at idle
      if (this.trap) decel = Math.max(decel, 18);
      const nv = Math.max(0, Math.abs(vf) - decel * dt) * Math.sign(vf);
      this.vel.x = fwdFlat.x * nv; this.vel.z = fwdFlat.z * nv; // tyres kill sideways slide
      // nose-wheel steering + rotation for take-off
      this.w.y = -inp.yaw * clamp(Math.abs(nv) * 0.12, 0, 1.6);
      const rot = clamp(-c.pitch, 0, 1) * clamp((Math.abs(nv) - 9) / 6, 0, 1); // rotate once there's speed
      const tgtPitch = rot * 0.22;
      _e.set(pitch + (tgtPitch - pitch) * Math.min(1, dt * 6), _e.y, _e.z * Math.exp(-dt * 10), 'YXZ');
      this.q.setFromEuler(_e); this.w.x *= Math.exp(-dt * 8); this.w.z = 0;
    } else if (bottom > gy + 0.03) { this.onGround = false; this.trap = null; }
    // obstacles (islands, carrier superstructure, trees)
    if (world.hitTest && world.hitTest(this.pos)) this.crash('Hit an obstacle');
  }

  catStep(dt, inp) {
    const C = this.cat;
    if (!C.fired) { this.pos.copy(C.start); this.vel.set(0, 0, 0); this.q.copy(C.q); this.w.set(0, 0, 0); this.onGround = true; return; }
    C.v = Math.min(C.vEnd, C.v + C.accel * dt); C.s += C.v * dt; this.airspeed = C.v;
    this.pos.copy(C.start).addScaledVector(C.dir, C.s);
    this.vel.copy(C.dir).multiplyScalar(C.v);
    if (C.s >= C.len) { this.cat = null; this.onGround = false; this.pos.y += 0.05; this.w.x = 0.6; } // off the bow, nose up a touch
  }
  crash(reason) {
    this.crashed = true; this.crashReason = reason;
    this.w.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 16);
    this.vel.multiplyScalar(0.4);
  }
}
