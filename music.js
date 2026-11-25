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
  get loaded() { return !!this.url && this.duration > 0; }
  setVolume(v) { this.vol = v; this.audio.volume = Math.max(0, Math.min(1, v)); }
  play() { if (!this.loaded) return; this.audio.currentTime = 0; this.audio.volume = this.vol; this.audio.play().catch(() => {}); this.playing = true; }
  pause() { if (this.playing) this.audio.pause(); }
  resume() { if (this.playing) this.audio.play().catch(() => {}); }
  stop() { this.audio.pause(); this.playing = false; }
}
