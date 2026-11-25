import * as THREE from 'three';

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------- value noise ----------
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h & 0xffff) / 0xffff;
}
export function noise2(x, y, seed = 0, period = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const w = (v) => period ? ((v % period) + period) % period : v;
  const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, oct = 4, seed = 0, period = 0) {
  let v = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    v += a * noise2(x * f, y * f, seed + i * 17, period ? period * f : 0);
    n += a; a *= 0.5; f *= 2;
  }
  return v / n;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
export function toTex(canvas, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Fill canvas per-pixel with a function (tileable noise using period)
export function pixelFill(g, w, h, fn) {
  const img = g.getImageData(0, 0, w, h); const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y); const i = (y * w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] ?? 255;
  }
  g.putImageData(img, 0, 0);
}

export function radialTex(stops, size = 128) {
  const [c, g] = makeCanvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const cache = {};
export function glowTex() {
  return cache.glow ||= radialTex([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.85)'], [0.35, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
}
export function blobShadowTex() {
  return cache.blob ||= radialTex([[0, 'rgba(0,0,0,0.75)'], [0.5, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]);
}

// ---------- farm ----------
export function fieldTex() {
  const S = 512; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const n = fbm(x / 64, y / 64, 4, 3, 8);
    const fine = noise2(x / 2, y / 2, 9, 256);
    const row = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 24 + n * 2);
    const t = n * 0.7 + row * 0.15 + fine * 0.25;
    const r = 120 + t * 95, gg = 100 + t * 70, b = 45 + t * 35;
    return [r, gg, b];
  });
  return toTex(c);
}
export function grassTex() {
  const S = 256; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const n = fbm(x / 32, y / 32, 4, 11, 8); const f = noise2(x / 1.5, y / 1.5, 4, 171);
    return [78 + n * 55 + f * 30, 88 + n * 55 + f * 28, 34 + n * 22];
  });
  return toTex(c);
}
export function dirtTex() {
  const S = 256; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const n = fbm(x / 24, y / 24, 4, 21, 11); const f = noise2(x / 1.3, y / 1.3, 5, 197);
    const track = Math.abs(((x / S) * 2) % 1 - 0.5) < 0.12 ? -18 : 0; // two tire tracks
    const v = n * 60 + f * 40 + track;
    return [135 + v, 112 + v * 0.9, 85 + v * 0.7];
  });
  return toTex(c);
}
export function strawTex() {
  const S = 256; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const s = noise2(x / 40, y / 1.2, 31) * 0.6 + noise2(x / 9, y / 0.6, 32) * 0.4;
    const n = fbm(x / 50, y / 50, 3, 33, 5);
    const v = s * 0.7 + n * 0.3;
    return [150 + v * 90, 115 + v * 75, 55 + v * 40];
  });
  return toTex(c);
}
export function baleEndTex() {
  const S = 256; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const dx = x - S / 2, dy = y - S / 2; const r = Math.hypot(dx, dy) / (S / 2);
    const a = Math.atan2(dy, dx);
    const spiral = 0.5 + 0.5 * Math.sin(r * 70 + a * 1.0 + noise2(x / 6, y / 6, 41) * 3);
    const n = noise2(x / 3, y / 3, 42);
    const v = spiral * 0.55 + n * 0.45;
    const edge = r > 0.97 ? 0.6 : 1;
    return [(150 + v * 95) * edge, (112 + v * 75) * edge, (50 + v * 40) * edge];
  });
  return toTex(c);
}
export function barnTex() {
  const W = 512, H = 256; const [c, g] = makeCanvas(W, H);
  pixelFill(g, W, H, (x, y) => {
    const plank = Math.floor(x / 16); const pv = hash2(plank, 0, 51);
    const grain = noise2(x / 3, y / 40, 52 + plank);
    const gap = (x % 16) < 1.5 ? 0.45 : 1;
    const n = fbm(x / 60, y / 60, 3, 53);
    const v = (0.75 + pv * 0.2 + grain * 0.1 - n * 0.15) * gap;
    return [150 * v, 32 * v, 26 * v];
  });
  return toTex(c);
}
export function roofTex() {
  const S = 256; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const rib = 0.5 + 0.5 * Math.cos((x / S) * Math.PI * 2 * 12);
    const n = fbm(x / 40, y / 40, 3, 61, 6);
    const v = 0.7 + rib * 0.2 + n * 0.15;
    return [120 * v, 135 * v, 150 * v];
  });
  return toTex(c);
}

// ---------- yard ----------
export function concreteTex(seed = 71) {
  const S = 1024; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const n = fbm(x / 90, y / 90, 5, seed, 11);
    const f = noise2(x / 1.6, y / 1.6, seed + 1, 640);
    const stain = fbm(x / 30, y / 30, 3, seed + 2, 34);
    let v = 88 + n * 45 + f * 18 - (stain > 0.62 ? 25 : 0);
    // slab joints every 256 px
    if (x % 256 < 3 || y % 256 < 3) v *= 0.45;
    return [v, v * 0.99, v * 0.96];
  });
  // cracks
  const r = rng(seed);
  g.strokeStyle = 'rgba(20,20,20,0.75)'; g.lineWidth = 1.5;
  for (let k = 0; k < 26; k++) {
    let x = r() * S, y = r() * S, a = r() * Math.PI * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < 40; i++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); }
    g.stroke();
  }
  return toTex(c);
}
// wetness: white = dry, dark = puddle. Used for alpha (dry opaque) and roughness.
export function wetTex(seed = 81) {
  const S = 512; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const n = fbm(x / 70, y / 70, 5, seed, 7);
    const p = n > 0.53 ? Math.max(0, 1 - (n - 0.53) * 9) : 1;
    const v = 70 + p * 175;
    return [v, v, v];
  });
  return toTex(c, { srgb: false });
}
export function corrugatedTex() {
  const W = 512, H = 256; const [c, g] = makeCanvas(W, H);
  pixelFill(g, W, H, (x, y) => {
    const rib = Math.abs(Math.sin((x / W) * Math.PI * 18));
    const rust = fbm(x / 30, y / 12, 4, 91, 0);
    const streak = noise2(x / 4, y / 70, 92);
    let v = 0.62 + rib * 0.38;
    v *= 1 - Math.max(0, rust - 0.55) * 1.3;
    v *= 0.9 + streak * 0.15;
    const edge = (y < 10 || y > H - 10) ? 0.55 : 1;
    v *= edge;
    const rr = rust > 0.6 ? 1.12 : 1;
    return [v * 235 * rr, v * 230, v * 225 / rr];
  });
  return toTex(c);
}
export function chainLinkTex() {
  const S = 64; const [c, g] = makeCanvas(S, S);
  g.clearRect(0, 0, S, S); g.strokeStyle = 'rgba(190,195,200,0.9)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.stroke();
  const t = toTex(c); return t;
}
export function hazardTex() {
  const S = 128; const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#e8b51c'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#151515';
  for (let i = -S; i < S * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - S, S); g.lineTo(i - S, S); g.fill(); }
  return toTex(c);
}

// ---------- extra maps ----------
export function sandTex() {
  const S = 512; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const n = fbm(x / 64, y / 64, 4, 121, 8); const f = noise2(x / 2, y / 2, 122, 256);
    const rip = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 30 + n * 6);
    const v = 0.78 + n * 0.15 + f * 0.1 + rip * 0.05;
    return [235 * v, 205 * v, 160 * v];
  });
  return toTex(c);
}
export function rockTex() {
  const S = 256; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const n = fbm(x / 32, y / 32, 5, 131, 8); const f = noise2(x / 2, y / 2, 132, 128);
    const strata = 0.5 + 0.5 * Math.sin(y / 9 + n * 4);
    const v = 0.55 + n * 0.3 + f * 0.12 + strata * 0.1;
    return [190 * v, 120 * v, 82 * v];
  });
  return toTex(c);
}
export function hescoTex() {
  const S = 128; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => {
    const n = noise2(x / 4, y / 4, 141, 32); const m = fbm(x / 16, y / 16, 3, 142, 8);
    const v = 0.72 + n * 0.15 + m * 0.15;
    return [200 * v, 178 * v, 135 * v];
  });
  g.strokeStyle = 'rgba(70,64,52,0.75)'; g.lineWidth = 1.5;
  for (let i = 0; i <= S; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  g.lineWidth = 4; g.strokeStyle = 'rgba(60,56,46,0.9)'; g.strokeRect(0, 0, S, S);
  return toTex(c);
}
export function plankTex() {
  const W = 256, H = 256; const [c, g] = makeCanvas(W, H);
  pixelFill(g, W, H, (x, y) => {
    const plank = Math.floor(y / 32); const pv = (noise2(plank, 3, 151) - 0.5) * 0.25;
    const grain = noise2(x / 30, y / 2.5, 152 + plank);
    const gap = (y % 32) < 2 ? 0.35 : 1;
    const v = (0.72 + pv + grain * 0.18) * gap;
    return [150 * v, 112 * v, 78 * v];
  });
  return toTex(c);
}
export function helipadTex() {
  const S = 256; const [c, g] = makeCanvas(S, S);
  pixelFill(g, S, S, (x, y) => { const n = noise2(x / 3, y / 3, 161); const v = 0.62 + n * 0.12; return [180 * v, 172 * v, 160 * v]; });
  g.strokeStyle = 'rgba(245,240,225,0.9)'; g.lineWidth = 10; g.beginPath(); g.arc(S / 2, S / 2, S * 0.38, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(245,240,225,0.95)';
  g.fillRect(S * 0.33, S * 0.28, S * 0.08, S * 0.44); g.fillRect(S * 0.59, S * 0.28, S * 0.08, S * 0.44); g.fillRect(S * 0.33, S * 0.46, S * 0.34, S * 0.08);
  const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
export function waterNormalTex() {
  const S = 256; const [c, g] = makeCanvas(S, S);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = fbm(x / 32, y / 32, 4, 171, 8) + 0.5 * fbm(x / 8, y / 8, 3, 172, 32);
  pixelFill(g, S, S, (x, y) => {
    const hx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
    const hy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const nx = -hx * 6, ny = -hy * 6, nz = 1; const l = Math.hypot(nx, ny, nz);
    return [(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (nz / l * 0.5 + 0.5) * 255];
  });
  return toTex(c, { srgb: false });
}
