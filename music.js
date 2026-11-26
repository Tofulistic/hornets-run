// Convoy soundtrack: the player picks an audio file; it's remembered in this browser (IndexedDB) and loops.
const DB = 'toprc-music', STORE = 'tracks';

function idb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function put(blob, name) {
  try { const db = await idb(); const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put({ blob, name }, 'convoy'); } catch (e) { /* storage unavailable */ }
}
async function get() {
  try { const db = await idb(); return await new Promise((res) => { const r = db.transaction(STORE).objectStore(STORE).get('convoy'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); } catch (e) { return null; }
}
async function del() { try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).delete('convoy'); } catch (e) { /* ignore */ } }

export class Music {
  constructor() {
    this.audio = new Audio(); this.audio.loop = true; this.audio.preload = 'auto';
    this.name = ''; this.duration = 0; this.vol = 0.6; this.url = null; this.onchange = null;
    get().then((rec) => { if (rec && rec.blob) this.setBlob(rec.blob, rec.name, false); });
  }
  async setBlob(blob, name, save = true) {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob); this.audio.src = this.url; this.name = name;
    await new Promise((res) => { this.audio.onloadedmetadata = res; this.audio.onerror = res; setTimeout(res, 4000); });
    this.duration = isFinite(this.audio.duration) ? this.audio.duration : 0;
    if (save) put(blob, name);
    this.onchange?.();
  }
  load(file) { return this.setBlob(file, file.name.replace(/\.[^.]+$/, '')); }
  clear() { this.stop(); if (this.url) URL.revokeObjectURL(this.url); this.url = null; this.audio.removeAttribute('src'); this.name = ''; this.duration = 0; del(); this.onchange?.(); }
  // find the song's big moment (largest jump in loudness) so the opening's title can land on it
  async hitTime() {
    if (this._hit && this._hit.url === this.url) return this._hit.t;
    let t = null;
    try {
      const buf = await (await fetch(this.url)).arrayBuffer();
      const C = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
      const audio = await C.decodeAudioData(buf);
      const d = audio.getChannelData(0), sr = audio.sampleRate, w = Math.floor(sr / 10), n = Math.floor(d.length / w), e = new Float32Array(n);
      for (let i = 0; i < n; i++) { let s = 0; for (let j = i * w; j < (i + 1) * w; j += 4) s += d[j] * d[j]; e[i] = Math.sqrt(s / (w / 4)); }
      let best = 0; const lo = 60, hi = Math.min(n - 30, 1200);
      for (let i = lo; i < hi; i++) { let a = 0, b = 0; for (let k = 0; k < 30; k++) { a += e[i + k]; b += e[i - 30 + k]; } const r = a / (b + 1e-4); if (r > best) { best = r; t = i / 10; } }
      if (best < 1.15) t = null;
    } catch (e) { t = null; }
    this._hit = { url: this.url, t }; return t;
  }
  get loaded() { return !!this.url && this.duration > 0; }
  setVolume(v) { this.vol = v; this.audio.volume = Math.max(0, Math.min(1, v)); }
  play() { if (!this.loaded) return; this.audio.currentTime = 0; this.audio.volume = this.vol; this.audio.play().catch(() => {}); this.playing = true; }
  pause() { if (this.playing) this.audio.pause(); }
  resume() { if (this.playing) this.audio.play().catch(() => {}); }
  stop() { this.audio.pause(); this.playing = false; }
}
