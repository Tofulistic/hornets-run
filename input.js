// Gamepad (ELRS BLE Joystick / USB) + keyboard input with saved channel mapping.
const KEY = 'toprc.mapping.v1';

export const DEFAULT_MAP = {
  thr: { axis: 2, inv: false, min: -1, max: 1 },
  yaw: { axis: 3, inv: false, min: -1, max: 1 },
  pitch: { axis: 1, inv: false, min: -1, max: 1 },
  roll: { axis: 0, inv: false, min: -1, max: 1 },
  arm: { type: 'none', index: -1, inv: false },
  reset: { type: 'none', index: -1, inv: false },
  fire: { type: 'none', index: -1, inv: false },
  flare: { type: 'none', index: -1, inv: false },
  deadband: 0.02,
};

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.thr) return { ...structuredClone(DEFAULT_MAP), ...s }; } catch (e) { /* ignore */ }
  return structuredClone(DEFAULT_MAP);
}

export class Input {
  constructor() {
    this.map = load();
    this.keys = new Set();
    this.kbThr = 0; this.kbArm = true; this.kbReset = false; this.tapFire = false; this.tapFlare = false;
    this.smoothMs = 30; this.delayMs = 0; this.hist = []; this.out = { thr: 0, yaw: 0, pitch: 0, roll: 0 };
    this.touch = null;
    this.state = { thr: 0, climb: 0, spring: false, yaw: 0, pitch: 0, roll: 0, arm: false, armSwitch: false, reset: false, source: 'keyboard', pad: null };
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.tapFire = true; e.preventDefault(); }
      if (e.code === 'KeyF') this.tapFlare = true;
      if (e.code === 'KeyX') this.kbArm = !this.kbArm;
      if (e.code === 'KeyR') this.kbReset = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.map)); } catch (e) { /* ignore */ } }
  resetDefaults() { this.map = structuredClone(DEFAULT_MAP); this.save(); }

  pads() { return navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : []; }
  pad() {
    const ps = this.pads();
    return ps.find((p) => p.id === this.map.padId) || ps.find((p) => /expresslrs|elrs|radiomaster|edgetx|opentx|joystick/i.test(p.id)) || ps[0] || null;
  }
  axisVal(pad, ch) {
    const c = this.map[ch]; const raw = pad.axes[c.axis] ?? 0;
    let v = ((raw - c.min) / (c.max - c.min || 1)) * 2 - 1;
    v = Math.max(-1, Math.min(1, v));
    if (c.inv) v = -v;
    return v;
  }
  switchVal(pad, sw) {
    const s = this.map[sw]; if (!s) return false;
    if (s.type === 'axis') { const v = (pad.axes[s.index] ?? 0) * (s.inv ? -1 : 1); return v > 0.3; }
    if (s.type === 'button') { const b = pad.buttons[s.index]; return !!b && (b.pressed || b.value > 0.5) !== !!s.inv; }
    return false;
  }
  // Xbox-style pads (phone gamepad apps, real controllers) use the browser's standard layout
  isStandardPad(pad) {
    return pad && pad.mapping === 'standard' && pad.id !== this.map.padId && !/expresslrs|elrs|radiomaster|edgetx|opentx/i.test(pad.id);
  }
  update(dt) {
    const st = this.state; const pad = this.pad(); st.pad = pad;
    const db = this.map.deadband;
    const dz = (v, d = db) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
    const a = this.smoothMs > 0 ? 1 - Math.exp(-dt / (this.smoothMs / 1000)) : 1; // stick smoothing (removes BLE stepping)
    const f = (cur, v) => cur + (v - cur) * a;
    st.spring = false;
    const T = this.touch; const L = this.remote;
    if (L && L.everConnected && L.status !== 'off') { // phone controller over the room
      // if the link drops, sticks centre (Angle mode then holds a hover) until it comes back
      const P = L.fresh ? L.state : { lx: 0, ly: 0, rx: 0, ry: 0, arm: L.lastArm };
      st.linkLost = !L.fresh; st.source = 'phone'; st.spring = true;
      st.climb = f(st.climb || 0, +P.ly || 0); st.yaw = f(st.yaw, +P.lx || 0);
      st.pitch = f(st.pitch, +P.ry || 0); st.roll = f(st.roll, +P.rx || 0);
      st.armSwitch = false; st.arm = !!P.arm; st.reset = this.kbReset; st.fire = !!P.fire; st.flare = !!P.flare;
    } else if (T && T.active) {
      st.source = 'touch'; st.spring = true;
      st.climb = f(st.climb || 0, T.ly); st.yaw = f(st.yaw, T.lx);
      st.pitch = f(st.pitch, T.ry); st.roll = f(st.roll, T.rx);
      st.armSwitch = false; st.arm = !T.disarmed; st.reset = T.reset; T.reset = false; st.fire = !!T.fire; st.flare = !!T.flare;
    } else if (this.isStandardPad(pad)) {
      st.source = 'gamepad'; st.spring = true;
      const ax = (i) => pad.axes[i] ?? 0;
      st.climb = f(st.climb || 0, dz(-ax(1), 0.12)); st.yaw = f(st.yaw, dz(ax(0), 0.12));
      st.roll = f(st.roll, dz(ax(2), 0.1)); st.pitch = f(st.pitch, dz(-ax(3), 0.1));
      st.armSwitch = false; st.arm = this.kbArm;
      st.fire = !!(pad.buttons[7]?.value > 0.4 || pad.buttons[0]?.pressed); st.flare = !!(pad.buttons[4]?.pressed || pad.buttons[5]?.pressed || pad.buttons[1]?.pressed);
      const r = !!pad.buttons[3]?.pressed; st.reset = (r && !this._lastReset) || this.kbReset; this._lastReset = r;
    } else if (pad && pad.axes.length >= 4) {
      st.source = 'gamepad';
      st.thr = f(st.thr, (this.axisVal(pad, 'thr') + 1) / 2);
      st.yaw = f(st.yaw, dz(this.axisVal(pad, 'yaw')));
      st.pitch = f(st.pitch, dz(this.axisVal(pad, 'pitch')));
      st.roll = f(st.roll, dz(this.axisVal(pad, 'roll')));
      st.armSwitch = this.map.arm.type !== 'none';
      st.arm = st.armSwitch ? this.switchVal(pad, 'arm') : this.kbArm;
      st.fire = this.switchVal(pad, 'fire'); st.flare = this.switchVal(pad, 'flare'); st.fireMapped = this.map.fire.type !== 'none';
      const r = this.map.reset.type !== 'none' && this.switchVal(pad, 'reset');
      st.reset = (r && !this._lastReset) || this.kbReset; this._lastReset = r;
    } else {
      st.source = 'keyboard';
      const k = (c) => this.keys.has(c) ? 1 : 0;
      this.kbThr = Math.max(0, Math.min(1, this.kbThr + (k('KeyW') - k('KeyS')) * dt * 0.6));
      const ease = (cur, tgt) => cur + (tgt - cur) * Math.min(1, dt * 8);
      st.thr = this.kbThr;
      st.yaw = ease(st.yaw, k('KeyD') - k('KeyA'));
      st.pitch = ease(st.pitch, k('ArrowUp') - k('ArrowDown'));
      st.roll = ease(st.roll, k('ArrowRight') - k('ArrowLeft'));
      st.armSwitch = false; st.arm = this.kbArm; st.reset = this.kbReset;
      st.fire = k('Space') === 1; st.flare = k('KeyF') === 1;
    }
    this.kbReset = false;
    st.fire = st.fire || this.tapFire; st.flare = st.flare || this.tapFlare; this.tapFire = this.tapFlare = false;
    if (st.source !== 'gamepad' || st.spring) st.fireMapped = true;
    // optional added input delay (simulates radio/video latency)
    if (this.delayMs > 0) {
      const now = performance.now();
      this.hist.push({ t: now, thr: st.thr, climb: st.climb, yaw: st.yaw, pitch: st.pitch, roll: st.roll });
      const cut = now - this.delayMs; let k = 0;
      while (k < this.hist.length - 1 && this.hist[k + 1].t <= cut) k++;
      this.hist.splice(0, k);
      const h = this.hist[0];
      return { ...st, thr: h.thr, climb: h.climb, yaw: h.yaw, pitch: h.pitch, roll: h.roll };
    }
    this.hist.length = 0;
    return st;
  }
}
