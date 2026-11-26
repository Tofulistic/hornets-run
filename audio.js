// Synthesised sound: EDF jet whine, wind, weapons, warnings, and the game's original anthem.
// Everything is generated live with WebAudio; no audio files are shipped.
export class Sound {
  constructor() { this.ctx = null; this.vol = 0.8; this.musicVol = 0.7; }
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = this.vol;
    const lim = C.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2; // never clip
    this.master.connect(lim); lim.connect(C.destination);
    this.sfx = C.createGain(); this.sfx.connect(this.master);
    this.music = C.createGain(); this.music.gain.value = this.musicVol; this.music.connect(this.master);
    const len = C.sampleRate * 2, b = C.createBuffer(1, len, C.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    // engine: two detuned saws + fan noise through a band-pass
    const eng = this.eng = C.createGain(); eng.gain.value = 0; eng.connect(this.sfx);
    const bp = this.engBp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5; bp.connect(eng);
    this.o1 = C.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = C.createOscillator(); this.o2.type = 'sawtooth';
    const og = C.createGain(); og.gain.value = 0.18; this.o1.connect(og); this.o2.connect(og); og.connect(bp);
    this.o1.start(); this.o2.start();
    const fan = this.noise(true); const fbp = this.fanBp = C.createBiquadFilter(); fbp.type = 'bandpass'; fbp.Q.value = 0.9; fan.connect(fbp); fbp.connect(eng);
    const wind = this.noise(true); const wf = this.windF = C.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 600;
    const wg = this.windG = C.createGain(); wg.gain.value = 0; wind.connect(wf); wf.connect(wg); wg.connect(this.sfx);
    // warning / lock tones
    this.tone = C.createOscillator(); this.tone.type = 'square'; this.toneG = C.createGain(); this.toneG.gain.value = 0;
    const tf = C.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 2200;
    this.tone.connect(tf); tf.connect(this.toneG); this.toneG.connect(this.sfx); this.tone.start();
  }
  noise(loop = false) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = loop; if (loop) s.start(); return s; }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  setMusicVolume(v) { this.musicVol = v; if (this.music) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  engine({ thr = 0, airspeed = 0, on = false, inside = false, dist = 0 }) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const att = 1 / (1 + dist * 0.012);
    const f = 220 + thr * 520 + airspeed * 2;
    this.o1.frequency.setTargetAtTime(f, t, 0.08); this.o2.frequency.setTargetAtTime(f * 1.503, t, 0.08);
    this.engBp.frequency.setTargetAtTime(700 + thr * 2600, t, 0.08); this.fanBp.frequency.setTargetAtTime(900 + thr * 3200, t, 0.08);
    this.eng.gain.setTargetAtTime(on ? (0.05 + thr * 0.3) * att * (inside ? 0.6 : 1) : 0, t, 0.1);
    this.windG.gain.setTargetAtTime(on ? Math.min(0.35, airspeed * airspeed * 0.00025) * (inside ? 1.2 : att) : 0, t, 0.15);
    this.windF.frequency.setTargetAtTime(300 + airspeed * 25, t, 0.15);
  }
  // lock: 0 none, 1 seeking growl, 2 locked tone; warn: missile inbound
  tones(lock, warn) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    let f = 0, g = 0;
    if (warn) { f = Math.floor(t * 6) % 2 ? 1050 : 820; g = 0.05; }
    else if (lock === 2) { f = 1240; g = 0.045; }
    else if (lock === 1) { f = 360 + Math.sin(t * 38) * 40; g = 0.03; }
    this.tone.frequency.setTargetAtTime(f || 400, t, 0.01); this.toneG.gain.setTargetAtTime(g, t, 0.02);
  }
  burst({ dur = 0.3, f0 = 1200, f1 = 200, type = 'bandpass', q = 1, gain = 0.4, delay = 0 } = {}) {
    if (!this.ctx) return; const C = this.ctx, t = C.currentTime + delay;
    const s = this.noise(); const fl = C.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + dur + 0.05);
  }
  thump(f = 70, dur = 0.5, gain = 0.6) {
    if (!this.ctx) return; const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur);
  }
  missile() { this.burst({ dur: 1.4, f0: 300, f1: 2400, gain: 0.35, q: 0.7 }); this.thump(90, 0.3, 0.3); }
  gun() { this.burst({ dur: 0.06, f0: 900, f1: 300, gain: 0.25, q: 0.8 }); }
  boom(big = 1) { this.burst({ dur: 1.8 * big, f0: 900, f1: 60, type: 'lowpass', gain: 0.7 }); this.thump(55, 1.2, 0.8); }
  flare() { this.burst({ dur: 0.25, f0: 3000, f1: 800, gain: 0.2, q: 2 }); }
  cat() { this.burst({ dur: 1.6, f0: 400, f1: 2000, type: 'bandpass', q: 0.5, gain: 0.5 }); this.thump(60, 0.4, 0.5); }
  trap() { this.thump(45, 0.5, 0.7); this.burst({ dur: 0.8, f0: 1800, f1: 200, gain: 0.3 }); }
  ding() { if (!this.ctx) return; const C = this.ctx, t = C.currentTime; for (const [f, d] of [[880, 0], [1320, 0.08]]) { const o = C.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = C.createGain(); g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.18, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.5); o.connect(g); g.connect(this.sfx); o.start(t + d); o.stop(t + d + 0.6); } }
  stopAll() { if (!this.ctx) return; this.engine({}); this.tones(0, false); }
}

// ---------------------------------------------------------------- original anthem ("Hornets Run")
// D minor, 92 BPM. A slow swell for the deck montage, a hit on the title, then drums, power chords and a lead line.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const D = 62; // D4
export class Anthem {
  constructor(sound) { this.s = sound; this.nodes = []; this.playing = false; }
  start(at = 0) {
    const S = this.s; S.init(); const C = S.ctx; this.stop();
    const out = this.out = C.createGain(); out.gain.value = 1.5; out.connect(S.music);
    const t0 = C.currentTime + 0.05 + at; this.t0 = t0; this.playing = true;
    const beat = 60 / 92, bar = beat * 4;
    const rev = this.reverb(C); rev.connect(out);
    const wet = C.createGain(); wet.gain.value = 0.25; wet.connect(rev);
    const bus = C.createGain(); bus.connect(out); bus.connect(wet);
    const prog = [[D, D + 3, D + 7], [D - 4, D, D + 3], [D - 9 + 12, D + 3, D + 7 - 12 + 12], [D - 2, D + 2, D + 5]]; // Dm  Bb  F  C (voiced)
    const roots = [D - 24, D - 28, D - 21, D - 26];
    // 1) the swell: pad + low drone, 4 bars
    for (let b = 0; b < 8; b++) {
      const ch = prog[b % 4], st = t0 + b * bar;
      for (const n of ch) this.pad(bus, NOTE(n), st, bar * 1.05, b < 4 ? 0.016 + b * 0.004 : 0.028);
      this.pad(bus, NOTE(roots[b % 4]), st, bar * 1.05, 0.05, 'triangle');
    }
    // heartbeat on the swell
    for (let i = 0; i < 16; i++) this.kick(bus, t0 + i * beat * 2, 0.18 + i * 0.012);
    // 2) the hit at bar 8 (title), then the band
    const hit = t0 + 8 * bar; this.hitT = hit - t0;
    this.boomHit(bus, hit);
    for (let b = 0; b < 8; b++) {
      const st = hit + b * bar, ch = prog[b % 4];
      for (let k = 0; k < 4; k++) { this.kick(bus, st + k * beat, 0.42); if (k % 2) this.snare(bus, st + k * beat, 0.2); }
      for (let k = 0; k < 8; k++) this.hat(bus, st + k * beat / 2, 0.035);
      // eighth-note power chords (root + fifth + octave) through a fuzz
      for (let k = 0; k < 8; k++) this.power(bus, NOTE(roots[b % 4] + 12), st + k * beat / 2, beat / 2 * 0.9, k % 4 === 0 ? 0.09 : 0.06);
      for (const n of ch) this.pad(bus, NOTE(n), st, bar, 0.016);
    }
    // lead line over the band (original melody)
    const mel = [[69, 2], [74, 1], [72, 1], [70, 3], [69, 1], [65, 2], [67, 1], [69, 1], [64, 4], [69, 2], [74, 1], [76, 1], [77, 3], [76, 1], [74, 2], [72, 1], [70, 1], [69, 4]];
    let tt = hit + 0 * bar;
    for (const [n, d] of mel) { this.lead(bus, NOTE(n), tt, d * beat * 0.95, 0.045); tt += d * beat; }
    this.dur = 16 * bar + 2;
  }
  osc(type, f, st, dur, g0, dest, { attack = 0.02, release = 0.3, detune = 0 } = {}) {
    const C = this.s.ctx; const o = C.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = C.createGain(); g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(g0, st + attack); g.gain.setValueAtTime(g0, st + Math.max(attack, dur - release)); g.gain.linearRampToValueAtTime(0, st + dur + release);
    o.connect(g); g.connect(dest); o.start(st); o.stop(st + dur + release + 0.05); this.nodes.push(o); return o;
  }
  pad(dest, f, st, dur, g, type = 'sawtooth') {
    const C = this.s.ctx; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4; lp.connect(dest);
    this.osc(type, f, st, dur, g, lp, { attack: dur * 0.35, release: dur * 0.3, detune: -7 }); this.osc(type, f, st, dur, g, lp, { attack: dur * 0.35, release: dur * 0.3, detune: 7 });
  }
  lead(dest, f, st, dur, g) {
    const C = this.s.ctx; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(dest);
    const o = this.osc('sawtooth', f, st, dur, g, lp, { attack: 0.03, release: 0.25 });
    const lfo = C.createOscillator(); lfo.frequency.value = 5.5; const lg = C.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o.detune); lfo.start(st + 0.25); lfo.stop(st + dur + 0.3); this.nodes.push(lfo);
    this.osc('square', f / 2, st, dur, g * 0.35, lp, { attack: 0.03, release: 0.25 });
  }
  power(dest, f, st, dur, g) {
    const C = this.s.ctx; const ws = C.createWaveShaper(); const k = 30, n = 1024, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; cv[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); } ws.curve = cv;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; const vol = C.createGain(); vol.gain.value = g * 1.1;
    ws.connect(lp); lp.connect(vol); vol.connect(dest);
    for (const m of [1, 1.4983, 2]) this.osc('sawtooth', f * m, st, dur, 0.5, ws, { attack: 0.005, release: 0.06 }); // the fuzz sets the level, vol scales it
  }
  kick(dest, st, g) {
    const C = this.s.ctx; const o = C.createOscillator(); o.frequency.setValueAtTime(140, st); o.frequency.exponentialRampToValueAtTime(42, st + 0.18);
    const v = C.createGain(); v.gain.setValueAtTime(g, st); v.gain.exponentialRampToValueAtTime(0.001, st + 0.35); o.connect(v); v.connect(dest); o.start(st); o.stop(st + 0.4); this.nodes.push(o);
  }
  noiseHit(dest, st, dur, g, f, type = 'highpass') {
    const C = this.s.ctx; const s = C.createBufferSource(); s.buffer = this.s.noiseBuf; const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
    const v = C.createGain(); v.gain.setValueAtTime(g, st); v.gain.exponentialRampToValueAtTime(0.001, st + dur); s.connect(fl); fl.connect(v); v.connect(dest); s.start(st); s.stop(st + dur + 0.05); this.nodes.push(s);
  }
  snare(dest, st, g) { this.noiseHit(dest, st, 0.22, g, 1500); this.osc('triangle', 190, st, 0.05, g * 0.6, dest, { attack: 0.002, release: 0.08 }); }
  hat(dest, st, g) { this.noiseHit(dest, st, 0.05, g, 7000); }
  boomHit(dest, st) { this.kick(dest, st, 0.7); this.noiseHit(dest, st, 2.5, 0.22, 300, 'lowpass'); for (const n of [D - 24, D - 12, D - 5, D]) this.osc('sawtooth', NOTE(n), st, 1.5, 0.03, dest, { attack: 0.005, release: 1.5 }); }
  reverb(C) {
    const len = C.sampleRate * 2.6, b = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const cv = C.createConvolver(); cv.buffer = b; return cv;
  }
  get time() { return this.playing ? this.s.ctx.currentTime - this.t0 : 0; }
  fade(sec = 1.5) { if (!this.out) return; const out = this.out, t = this.s.ctx.currentTime; out.gain.setTargetAtTime(0, t, sec / 3); setTimeout(() => { if (this.out === out) this.stop(); }, sec * 1000 + 200); }
  stop() { for (const n of this.nodes) { try { n.stop(); } catch (e) { /* already stopped */ } } this.nodes = []; try { this.out?.disconnect(); } catch (e) { /* ignore */ } this.out = null; this.playing = false; }
}
