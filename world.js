// Worlds for TopRC: Hornets Run. Everything is RC scale: a 1.25 m jet, a 200 m strip, a 60 m model carrier.
// Each builder returns the collision interface the flight model expects plus spawn points and mission props.
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import * as T from './textures.js';
import { makeSky } from './sky.js';

const V3 = THREE.Vector3;
export const std = (o) => new THREE.MeshStandardMaterial(o);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function lights(scene, p) {
  const hemi = new THREE.HemisphereLight(p.skyCol, p.groundCol, p.hemi ?? 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(p.sunCol, p.sunI ?? 2.6);
  sun.position.copy(p.sunDir).multiplyScalar(120); sun.castShadow = p.hi;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera; c.left = -14; c.right = 14; c.top = 14; c.bottom = -14; c.near = 1; c.far = 400;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.015;
  scene.add(sun, sun.target);
  return sun;
}
function skyAndFog(scene, p) {
  const sky = makeSky(p); scene.add(sky);
  scene.fog = new THREE.FogExp2(p.fog, p.fogD);
  return sky;
}
function water(g, { size, level = 0, color, hi, sunDir, dist = 2.6, scale = 2.2 }) {
  const nrm = T.waterNormalTex();
  if (hi) {
    const w = new Water(new THREE.PlaneGeometry(size, size), { textureWidth: 512, textureHeight: 512, waterNormals: nrm, sunDirection: sunDir.clone().normalize(), sunColor: 0xffd9a0, waterColor: new THREE.Color(color).getHex(), distortionScale: dist, fog: true });
    w.rotation.x = -Math.PI / 2; w.position.y = level; w.material.uniforms.size.value = scale; g.add(w);
    return (t) => { w.material.uniforms.time.value = t * 0.6; };
  }
  nrm.repeat.set(size / 9, size / 9);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), std({ color, roughness: 0.1, metalness: 0.3, normalMap: nrm, normalScale: new THREE.Vector2(0.25, 0.25) }));
  m.position.y = level; g.add(m);
  return (t) => nrm.offset.set(t * 0.01, t * 0.006);
}
// heightfield mesh with vertex colours from a colour function
function terrainMesh(H, colFn, { w, d, sx, sz, cx = 0, cz = 0 }) {
  const geo = new THREE.PlaneGeometry(w, d, sx, sz).rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setXYZ(i, x, H(x, z), z); }
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) { colFn(c, p.getX(i), p.getY(i), p.getZ(i), n.getY(i)); col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, std({ vertexColors: true, roughness: 0.95, flatShading: false }));
  m.receiveShadow = true; return m;
}
// simple obstacle registry: boxes + vertical cylinders in a coarse hash grid
class Obstacles {
  constructor() { this.boxes = []; this.cells = new Map(); }
  box(x0, y0, z0, x1, y1, z1) { this.boxes.push([x0, y0, z0, x1, y1, z1]); }
  cyl(x, z, r, h, y0 = 0) { const k = `${Math.floor(x / 20)},${Math.floor(z / 20)}`; (this.cells.get(k) || this.cells.set(k, []).get(k)).push([x, z, r, h, y0]); }
  hit(p) {
    for (const b of this.boxes) if (p.x > b[0] && p.x < b[3] && p.y > b[1] && p.y < b[4] && p.z > b[2] && p.z < b[5]) return true;
    const cx = Math.floor(p.x / 20), cz = Math.floor(p.z / 20);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = this.cells.get(`${cx + i},${cz + j}`); if (!l) continue;
      for (const [x, z, r, h, y0] of l) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r && p.y < y0 + h && p.y > y0) return true;
    }
    return false;
  }
}
function trees(g, obs, H, list, { leaf = '#3f5a2e', trunk = '#4a3a2a', snow = false } = {}) {
  const cone = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), stem = new THREE.CylinderGeometry(0.12, 0.16, 1, 5).translate(0, 0.5, 0);
  const ml = std({ color: leaf, roughness: 0.9, flatShading: true }), mt = std({ color: trunk, roughness: 1 });
  const im = new THREE.InstancedMesh(cone, ml, list.length), it = new THREE.InstancedMesh(stem, mt, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3();
  list.forEach(([x, z, h], i) => {
    const y = H(x, z); q.setFromAxisAngle(new V3(0, 1, 0), x * 1.7 + z);
    m.compose(p.set(x, y + h * 0.18, z), q, s.set(h * 0.28, h * 0.85, h * 0.28)); im.setMatrixAt(i, m);
    m.compose(p.set(x, y, z), q, s.set(h * 0.25, h * 0.25, h * 0.25)); it.setMatrixAt(i, m);
    obs.cyl(x, z, h * 0.22, h, y);
  });
  im.castShadow = true; im.receiveShadow = true; g.add(im, it);
  if (snow) im.material.color.set('#2e4636');
}

// ---------------------------------------------------------------- airfield (golden hour)
function buildField(ctx) {
  const { scene, hi } = ctx; const g = new THREE.Group(); scene.add(g);
  const sunDir = new V3(-0.55, 0.16, -0.82);
  const sky = skyAndFog(scene, { sunDir, zenith: '#3f5f93', horizon: '#f3b67a', horizonAway: '#b9a3a0', sunColor: '#ffbf6a', cloudLit: '#ffd7a8', cloudDark: '#7a6672', groundCol: '#5c5438', sunSize: 0.03, sunGlow: 1.2, cover: 0.42, fog: '#d9ad86', fogD: 0.0016 });
  const sun = lights(scene, { sunDir, sunCol: '#ffc88a', sunI: 2.8, skyCol: '#9fb6e0', groundCol: '#6a5a3a', hemi: 0.6, hi });
  const H = (x, z) => { const r = Math.hypot(x, z); return smooth(500, 1400, r) * (40 + 60 * T.fbm(x * 0.002, z * 0.002, 3, 5)) + T.fbm(x * 0.01, z * 0.01, 2, 3) * 0.8 * smooth(140, 300, r); };
  const grass = std({ map: T.grassTex(), roughness: 1 }); grass.map.repeat.set(220, 220);
  const gm = terrainMesh(H, (c, x, y, z, ny) => c.set('#7d8a45').lerp(new THREE.Color('#a59a5a'), T.fbm(x * 0.01, z * 0.01, 2, 9)).lerp(new THREE.Color('#6b6a55'), smooth(20, 70, y)), { w: 3600, d: 3600, sx: 120, sz: 120 });
  gm.material = std({ vertexColors: true, roughness: 1, map: grass.map }); g.add(gm);
  // runway: 200 m x 12 m asphalt, threshold bars and centreline
  const rwyC = document.createElement('canvas'); rwyC.width = 128; rwyC.height = 2048; const r = rwyC.getContext('2d');
  r.fillStyle = '#3d3d3f'; r.fillRect(0, 0, 128, 2048);
  for (let i = 0; i < 6000; i++) { r.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`; r.fillRect(Math.random() * 128, Math.random() * 2048, 2, 2); }
  r.fillStyle = '#e8e6dc'; for (let y = 120; y < 1930; y += 70) r.fillRect(62, y, 4, 36);
  for (const y0 of [20, 1980]) for (let x = 10; x < 120; x += 14) r.fillRect(x, y0, 8, 48);
  r.fillRect(2, 0, 3, 2048); r.fillRect(123, 0, 3, 2048);
  const rwy = new THREE.Mesh(new THREE.PlaneGeometry(12, 200).rotateX(-Math.PI / 2), std({ map: T.toTex(rwyC), roughness: 0.85 }));
  rwy.position.y = 0.02; rwy.receiveShadow = true; g.add(rwy);
  // pilot box, fence, shade tents, flight-line cars, windsock
  const obs = new Obstacles();
  const white = std({ color: '#e9e5da', roughness: 0.8 }), dark = std({ color: '#2b2e33', roughness: 0.7 }), canvas = std({ color: '#c8452f', roughness: 0.9, side: THREE.DoubleSide });
  const fenceM = std({ color: '#9aa0a6', roughness: 0.6, metalness: 0.4 });
  for (let z = -90; z <= 90; z += 6) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1), fenceM); p.position.set(-14, 0.55, z); g.add(p); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 180), fenceM); rail.position.set(-14, 1.05, 0); g.add(rail);
  for (let i = 0; i < 4; i++) {
    const tent = new THREE.Group(); tent.position.set(-22, 0, -30 + i * 18);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1, 4, 1, true).rotateY(Math.PI / 4), i % 2 ? canvas : white); roof.position.y = 2.8; tent.add(roof);
    for (const [a, b] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4), dark); l.position.set(a, 1.2, b); tent.add(l); }
    const table = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.8), white); table.position.y = 0.8; tent.add(table);
    tent.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.add(tent);
    obs.box(-25.4, 0, -33.4 + i * 18, -18.6, 3.4, -26.6 + i * 18);
  }
  const carCols = ['#7b1e1e', '#d7d2c6', '#1f3b5a', '#3a3a3a', '#8a8a86'];
  for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.4, 4.4), std({ color: carCols[i % 5], roughness: 0.35, metalness: 0.6 })); c.position.set(-34, 0.7, -50 + i * 10); c.castShadow = true; g.add(c); obs.box(-35, 0, -52.2 + i * 10, -33, 1.5, -47.8 + i * 10); }
  const hangar = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 18), std({ map: T.corrugatedTex(), color: '#c9c3b2', roughness: 0.7, metalness: 0.3 }));
  hangar.position.set(-60, 4.5, 60); hangar.castShadow = hangar.receiveShadow = true; g.add(hangar); obs.box(-72, 0, 51, -48, 9, 69);
  const sockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6), white); sockPole.position.set(14, 3, -60); g.add(sockPole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 10, 1, true).rotateZ(Math.PI / 2), std({ color: '#ff6a1a', side: THREE.DoubleSide })); sock.position.set(14.9, 5.8, -60); g.add(sock);
  obs.cyl(14, -60, 0.4, 6);
  // tree lines
  const tl = []; const rr = T.rng(11);
  for (let i = 0; i < 520; i++) { const a = rr() * Math.PI * 2, d = 230 + rr() * 520; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.abs(x) < 40 && Math.abs(z) < 260) continue; tl.push([x, z, 7 + rr() * 9]); }
  trees(g, obs, H, tl);
  const pilot = new V3(-12.5, 1.7, 4);
  return {
    name: 'field', group: g, sky, sun, sunDir, H, obs,
    groundAt: (x, z) => (Math.abs(x) < 6 && Math.abs(z) < 100 ? 0.02 : H(x, z)),
    surfaceAt: (x, z) => (Math.abs(x) < 6 && Math.abs(z) < 100 ? 'runway' : 'ground'),
    hitTest: (p) => obs.hit(p),
    spawn: { pos: new V3(0, 0, 92), yaw: 0 }, pilot, bloom: 0.4, exposure: 1.0,
    update() {},
  };
}

// ---------------------------------------------------------------- model carrier at sea (golden hour)
export const DECK = { y: 6, len: 60, w: 13, x: 0, z: 0 };
export function buildCarrierShip(g, obs) {
  const hull = std({ color: '#5d646c', roughness: 0.75, metalness: 0.25 }), deckM = std({ color: '#3a3d40', roughness: 0.92 });
  const D = DECK;
  // hull: lofted box, wider at the deck with a flared bow
  const shape = new THREE.Shape(); shape.moveTo(-5, 0); shape.lineTo(5, 0); shape.lineTo(6.6, D.y - 0.2); shape.lineTo(-6.6, D.y - 0.2); shape.closePath();
  const hg = new THREE.ExtrudeGeometry(shape, { depth: D.len - 4, bevelEnabled: false }).translate(0, -1.2, -(D.len - 4) / 2);
  const hm = new THREE.Mesh(hg, hull); hm.castShadow = hm.receiveShadow = true; g.add(hm);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(6.6, 6, 4, 1).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.55, 1), hull); bow.position.set(0, D.y - 2.6, -D.len / 2 - 1); g.add(bow);
  // flight deck texture: angled landing area, cat track, wires, numbers
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const x = c.getContext('2d');
  x.fillStyle = '#3c3f43'; x.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`; x.fillRect(Math.random() * 256, Math.random() * 1024, 3, 2); }
  x.save(); x.translate(128, 1024); x.rotate(-0.09);
  x.strokeStyle = '#e8e2c8'; x.lineWidth = 3; x.setLineDash([22, 18]); x.beginPath(); x.moveTo(-6, 0); x.lineTo(-6, -720); x.stroke(); x.setLineDash([]);
  x.strokeStyle = '#d8c548'; x.lineWidth = 4; x.beginPath(); x.moveTo(-70, 0); x.lineTo(-70, -700); x.moveTo(58, 0); x.lineTo(58, -700); x.stroke(); x.restore();
  x.fillStyle = '#9a9a98'; x.fillRect(122, 20, 12, 380); // catapult track
  x.fillStyle = '#d8c548'; x.fillRect(110, 400, 36, 6);
  x.fillStyle = '#e8e2c8'; x.font = 'bold 120px Arial'; x.textAlign = 'center'; x.save(); x.translate(128, 900); x.fillText('73', 0, 0); x.restore();
  for (const wz of [0, 1, 2, 3]) { x.fillStyle = '#1b1c1e'; x.fillRect(30, 640 + wz * 40, 196, 5); }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(D.w, 0.3, D.len), [deckM, deckM, std({ map: T.toTex(c), roughness: 0.9 }), deckM, deckM, deckM]);
  deck.position.set(0, D.y - 0.15, 0); deck.receiveShadow = true; deck.castShadow = true; g.add(deck);
  // island
  const isl = new THREE.Group(); isl.position.set(5.2, D.y, 2);
  const blk = (w, h, d, x0, y0, z0, m = hull) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x0, y0, z0); b.castShadow = b.receiveShadow = true; isl.add(b); return b; };
  blk(1.6, 3.2, 7, 0, 1.6, 0); blk(1.4, 1.4, 5, 0, 3.9, -0.6); blk(1.5, 0.5, 4.5, 0, 4.85, -0.6, std({ color: '#1b2430', roughness: 0.2, metalness: 0.8 }));
  blk(0.3, 3, 0.3, 0, 6.9, 0); blk(1.8, 0.12, 0.12, 0, 7.6, 0); blk(0.9, 0.9, 0.1, 0, 6.4, 1.2, std({ color: '#2b3038' }));
  g.add(isl); obs.box(4.3, 0, -2, 6.1, D.y + 8.4, 5.6);
  // arresting wires (visible cables)
  const wireM = std({ color: '#111', roughness: 0.4, metalness: 0.7 });
  const wires = [17, 19.5, 22, 24.5].map((z) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 9.5).rotateZ(Math.PI / 2), wireM); w.position.set(-0.5, D.y + 0.04, z); g.add(w); return z; });
  // jet blast deflector behind the cat
  const jbd = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.06), std({ color: '#6b7076', roughness: 0.6, metalness: 0.5 })); jbd.position.set(0, D.y + 0.2, -2.6); jbd.rotation.x = -0.7; jbd.castShadow = true; g.add(jbd);
  return { wires, cat: { start: new V3(0, D.y + 0.17, -4.2), endZ: -D.len / 2 + 0.5 } };
}
export function onDeck(x, z) { return Math.abs(x - DECK.x) < DECK.w / 2 && Math.abs(z - DECK.z) < DECK.len / 2; }
function buildSea(ctx) {
  const { scene, hi } = ctx; const g = new THREE.Group(); scene.add(g);
  const sunDir = new V3(0.35, 0.1, -0.93);
  const sky = skyAndFog(scene, { sunDir, zenith: '#4a5f86', horizon: '#ffb46a', horizonAway: '#b39aa6', sunColor: '#ffb45a', cloudLit: '#ffd0a0', cloudDark: '#6b5866', groundCol: '#203038', sunSize: 0.032, sunGlow: 1.4, cover: 0.38, fog: '#e0a67c', fogD: 0.0011 });
  const sun = lights(scene, { sunDir, sunCol: '#ffbe7a', sunI: 3.0, skyCol: '#8ea6d0', groundCol: '#2c3a40', hemi: 0.5, hi });
  const upd = water(g, { size: 6000, color: '#1f4252', hi, sunDir, dist: 3.2, scale: 2.6 });
  const obs = new Obstacles();
  const ship = buildCarrierShip(g, obs);
  // escort ship on the horizon + rocky islands
  const esc = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 30), std({ color: '#5f666e' })); esc.position.set(-160, 1, -260); g.add(esc);
  const rock = std({ color: '#6a6358', roughness: 1, flatShading: true });
  const isles = [[420, -900, 90, 70], [-700, -500, 60, 40], [900, 300, 120, 55], [-300, 1100, 80, 35]];
  for (const [ix, iz, r, h] of isles) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9, 3), rock); m.position.set(ix, h / 2 - 3, iz); g.add(m); }
  const H = (x, z) => { for (const [ix, iz, r, h] of isles) { const d = Math.hypot(x - ix, z - iz); if (d < r) return (h - 3) * (1 - d / r) - 3; } return 0; };
  const wireAt = (x, z) => { if (!onDeck(x, z) || Math.abs(x) > 4.8) return 0; for (let i = 0; i < ship.wires.length; i++) if (Math.abs(z - ship.wires[i]) < 0.35) return ship.wires.length - i; return 0; };
  return {
    name: 'sea', group: g, sky, sun, sunDir, H, obs, ship,
    groundAt: (x, z) => (onDeck(x, z) ? DECK.y : Math.max(0, H(x, z))),
    surfaceAt: (x, z) => (onDeck(x, z) ? 'deck' : H(x, z) > 0 ? 'terrain' : 'water'),
    wireAt, hitTest: (p) => obs.hit(p) || (p.y < DECK.y - 0.05 && p.y > -1 && Math.abs(p.x) < 6.6 && Math.abs(p.z) < DECK.len / 2 + 3),
    spawn: { pos: ship.cat.start.clone(), yaw: 0, cat: true }, pilot: new V3(-6.2, DECK.y + 1.7, 12), bloom: 0.5, exposure: 1.0,
    update: (t) => upd(t),
  };
}

// ---------------------------------------------------------------- snowy river gorge (morning)
const gx0 = (z) => 90 * Math.sin(z / 260) + 45 * Math.sin(z / 115 + 1.3);
export const gorgeX = (z) => (z > 1250 ? gx0(1250) + (gx0(1250) - gx0(1249)) * (z - 1250) : gx0(z)); // straight run-in at the entrance
function buildCanyon(ctx) {
  const { scene, hi } = ctx; const g = new THREE.Group(); scene.add(g);
  const sunDir = new V3(0.5, 0.42, -0.6);
  const sky = skyAndFog(scene, { sunDir, zenith: '#2e5d9c', horizon: '#c8d6e4', horizonAway: '#a8bccf', sunColor: '#fff1d6', cloudLit: '#ffffff', cloudDark: '#8b98a8', groundCol: '#d9e0e8', sunSize: 0.022, cover: 0.35, fog: '#c7d3df', fogD: 0.0019 });
  const sun = lights(scene, { sunDir, sunCol: '#fff0dc', sunI: 2.6, skyCol: '#c4d6ec', groundCol: '#a0a4aa', hemi: 1.15, hi });
  const FLOOR = 0;
  const H = (x, z) => {
    const d = Math.abs(x - gorgeX(z));
    const half = 16 + 8 * Math.sin(z / 70);                  // gorge half-width 8..24 m
    const wall = smooth(half, half + 22, d) * (55 + 25 * T.fbm(x * 0.004, z * 0.004, 2, 3));
    const peaks = smooth(half + 10, half + 160, d) * 150 * T.fbm(x * 0.0035, z * 0.0035, 4, 7);
    const rough = T.fbm(x * 0.05, z * 0.05, 2, 1) * 3 * smooth(half - 4, half + 6, d);
    return FLOOR + wall + peaks + rough;
  };
  const snow = new THREE.Color('#f3f6fa'), rockC = new THREE.Color('#77726d'), ice = new THREE.Color('#8fa7b4'), pine = new THREE.Color('#2f4235');
  const colFn = (c, x, y, z, ny) => {
    const s = smooth(0.55, 0.85, ny) * smooth(4, 20, y);
    c.copy(rockC).lerp(new THREE.Color('#7b756e'), T.fbm(x * 0.02, z * 0.02, 2, 4)).lerp(snow, s);
    if (y < 1.5) c.copy(ice);
    if (y > 3 && y < 40 && ny > 0.75 && T.fbm(x * 0.03, z * 0.03, 2, 8) > 0.55) c.lerp(pine, 0.5);
  };
  const LEN = 3400;
  g.add(terrainMesh(H, colFn, { w: 900, d: LEN, sx: hi ? 220 : 140, sz: hi ? 640 : 420 }));
  // far ring of peaks
  const far = new THREE.Mesh(new THREE.CylinderGeometry(2600, 2600, 400, 64, 3, true), std({ color: '#cfd9e4', roughness: 1, side: THREE.BackSide, fog: true }));
  const fp = far.geometry.attributes.position; for (let i = 0; i < fp.count; i++) if (fp.getY(i) > 0) fp.setY(i, 100 + 220 * T.fbm(Math.atan2(fp.getX(i), fp.getZ(i)) * 3, 0, 3, 2)); fp.needsUpdate = true;
  far.position.y = 0; g.add(far);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), std({ color: '#e6ebf0', roughness: 1 })); outer.position.y = 60; g.add(outer);
  // river
  const riv = std({ color: '#2d4a55', roughness: 0.15, metalness: 0.2 });
  const rg = new THREE.PlaneGeometry(40, LEN, 1, 400).rotateX(-Math.PI / 2); const rp = rg.attributes.position;
  for (let i = 0; i < rp.count; i++) rp.setX(i, rp.getX(i) + gorgeX(rp.getZ(i)));
  const river = new THREE.Mesh(rg, riv); river.position.y = 0.6; g.add(river);
  const obs = new Obstacles();
  const tl = []; const rr = T.rng(5);
  for (let i = 0; i < 900; i++) { const z = (rr() - 0.5) * LEN, side = rr() < 0.5 ? -1 : 1, x = gorgeX(z) + side * (30 + rr() * 140); const y = H(x, z); if (y > 8 && y < 70) tl.push([x, z, 6 + rr() * 8]); }
  trees(g, obs, H, tl, { leaf: '#2a3f33', snow: true });
  // gates along the run, the strike target at the far end, SAM site
  const gates = []; const gateM = std({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: 0.6, roughness: 0.5 });
  for (let z = 1300, i = 0; z > -1250; z -= 260, i++) {
    const x = gorgeX(z), y = 9 + (i % 3) * 2; const r = 7;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.25, 8, 40), gateM.clone()); ring.position.set(x, y, z);
    const dz = gorgeX(z - 5) - gorgeX(z + 5); ring.rotation.y = Math.atan2(dz, 10); g.add(ring);
    gates.push({ pos: new V3(x, y, z), r, mesh: ring, passed: false, n: new V3(-Math.sin(ring.rotation.y), 0, -Math.cos(ring.rotation.y)) });
  }
  const tz = -1500, tx = gorgeX(tz);
  const target = new THREE.Group(); target.position.set(tx, H(tx, tz), tz);
  const bunker = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 4, 16, 1, false, 0, Math.PI), std({ color: '#7b7a76', roughness: 0.9 })); bunker.rotation.z = Math.PI / 2; bunker.rotation.y = Math.PI / 2; bunker.position.y = 0; target.add(bunker);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), std({ color: '#222', roughness: 1 })); door.position.set(0, 1.6, 9.05); target.add(door);
  const mark = new THREE.Mesh(new THREE.RingGeometry(10, 11, 40).rotateX(-Math.PI / 2), std({ color: '#ff3b2a', emissive: '#ff2200', emissiveIntensity: 1.2, transparent: true, opacity: 0.8 })); mark.position.y = 0.6; target.add(mark);
  g.add(target);
  const sams = [[gorgeX(-1300) + 70, -1300], [gorgeX(-1700) - 80, -1700], [gorgeX(-900) + 90, -900]].map(([x, z]) => {
    const s = new THREE.Group(); s.position.set(x, H(x, z), z);
    const b = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 6), std({ color: '#5a5f4a' })); b.position.y = 0.7; s.add(b);
    const rack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 4.4), std({ color: '#6b705a' })); rack.position.y = 2; rack.rotation.x = -0.5; s.add(rack);
    g.add(s); return s;
  });
  return {
    name: 'canyon', group: g, sky, sun, sunDir, H, obs, gates, target, sams, ceiling: 30,
    groundAt: (x, z) => Math.max(0.6, H(x, z)),
    surfaceAt: (x, z) => (H(x, z) < 0.6 ? 'water' : 'terrain'),
    hitTest: (p) => obs.hit(p),
    spawn: { pos: new V3(gorgeX(1550), 14, 1550), yaw: Math.atan2(-(gorgeX(1540) - gorgeX(1550)) / 10, 1), airborne: true, speed: 33 }, pilot: null, bloom: 0.25, exposure: 0.95,
    update() {},
  };
}

// ---------------------------------------------------------------- desert range with mesas (late afternoon) — dogfights
function buildDesert(ctx) {
  const { scene, hi } = ctx; const g = new THREE.Group(); scene.add(g);
  const sunDir = new V3(-0.6, 0.24, 0.76);
  const sky = skyAndFog(scene, { sunDir, zenith: '#3a69a8', horizon: '#f0c79a', horizonAway: '#b8c3cf', sunColor: '#ffd9a0', cloudLit: '#fff0dc', cloudDark: '#a39aa0', groundCol: '#b08a5e', sunSize: 0.025, cover: 0.3, fog: '#e2c4a0', fogD: 0.0009 });
  const sun = lights(scene, { sunDir, sunCol: '#ffd6a0', sunI: 2.9, skyCol: '#a8c0e0', groundCol: '#8a6a48', hemi: 0.6, hi });
  const mesas = []; const rr = T.rng(21);
  for (let i = 0; i < 26; i++) { const a = rr() * Math.PI * 2, d = 250 + rr() * 1500; mesas.push([Math.cos(a) * d, Math.sin(a) * d, 50 + rr() * 110, 35 + rr() * 60]); }
  const H = (x, z) => {
    let h = T.fbm(x * 0.002, z * 0.002, 3, 2) * 25 + T.fbm(x * 0.02, z * 0.02, 2, 6) * 1.5;
    for (const [mx, mz, r, mh] of mesas) { const d = Math.hypot(x - mx, z - mz) / r; h += mh * (1 - smooth(0.75, 1.05, d)) * (0.92 + 0.08 * T.fbm(x * 0.03, z * 0.03, 1, 3)); }
    return h - 8;
  };
  const sand = new THREE.Color('#c9a275'), red = new THREE.Color('#a45c3b'), dark = new THREE.Color('#7a4a33');
  g.add(terrainMesh(H, (c, x, y, z, ny) => { c.copy(sand).lerp(new THREE.Color('#b88f62'), T.fbm(x * 0.01, z * 0.01, 2, 3)); if (ny < 0.8) c.lerp(red, smooth(0.8, 0.4, ny)); if (Math.sin(y * 0.6) > 0.7 && ny < 0.7) c.lerp(dark, 0.4); }, { w: 4400, d: 4400, sx: hi ? 220 : 150, sz: hi ? 220 : 150 }));
  // a dry-lake strip to land on
  const lake = new THREE.Mesh(new THREE.CircleGeometry(160, 48).rotateX(-Math.PI / 2), std({ color: '#e4d7bf', roughness: 1 })); lake.position.y = H(0, 0) + 0.08; g.add(lake);
  const obs = new Obstacles(); const y0 = H(0, 0);
  const cact = []; for (let i = 0; i < 300; i++) { const x = (rr() - 0.5) * 2000, z = (rr() - 0.5) * 2000; if (Math.hypot(x, z) > 200) cact.push([x, z, 3 + rr() * 3]); }
  trees(g, obs, H, cact, { leaf: '#5d6a3c' });
  const lakeY = y0 + 0.08;
  return {
    name: 'desert', group: g, sky, sun, sunDir, H, obs,
    groundAt: (x, z) => (Math.hypot(x, z) < 160 ? Math.max(lakeY, H(x, z)) : H(x, z)),
    surfaceAt: (x, z) => (Math.hypot(x, z) < 160 ? 'runway' : 'terrain'),
    hitTest: (p) => obs.hit(p),
    spawn: { pos: new V3(0, lakeY, 120), yaw: 0 }, pilot: new V3(-14, lakeY + 1.7, 80), bloom: 0.35, exposure: 1.0,
    update() {},
  };
}

export const MAPS = { field: buildField, sea: buildSea, canyon: buildCanyon, desert: buildDesert };
export function buildWorld(name, ctx) { return MAPS[name](ctx); }
