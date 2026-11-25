// Opening montage: a full-size carrier deck at golden hour, deck crew, steam, a catapult launch,
// then the title. Original shots and text; the music is the game's own anthem or a song from the player's device.
import * as THREE from 'three';
import { buildHornet } from './jet.js';
import { makeSky } from './sky.js';
import * as T from './textures.js';
import { Water } from 'three/addons/objects/Water.js';

const V3 = THREE.Vector3; const std = (o) => new THREE.MeshStandardMaterial(o);
const ease = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;

function crew(color, { helmet = color } = {}) {
  const g = new THREE.Group();
  const jersey = std({ color, roughness: 0.8 }), pants = std({ color: '#3d4148', roughness: 0.9 }), skin = std({ color: '#c99a78', roughness: 0.8 });
  const hm = std({ color: helmet, roughness: 0.5 });
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.7, 4, 8), pants); legL.position.set(-0.12, 0.47, 0);
  const legR = legL.clone(); legR.position.x = 0.12;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 10), jersey); torso.position.y = 1.18;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.3), std({ color: '#d6d2c4', roughness: 0.8 })); vest.position.y = 1.32; // flotation collar
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin); head.position.y = 1.62;
  const cran = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hm); cran.position.y = 1.64;
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), std({ color: '#222', roughness: 0.2, metalness: 0.6 })); goggles.position.set(0, 1.64, -0.12);
  const arm = (s) => { const p = new THREE.Group(); p.position.set(s * 0.27, 1.42, 0); const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 6), jersey); a.position.y = -0.3; p.add(a); const hnd = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), std({ color: '#e8e2cf' })); hnd.position.y = -0.6; p.add(hnd); g.add(p); return p; };
  g.add(legL, legR, torso, vest, head, cran, goggles);
  const L = arm(-1), R = arm(1);
  g.userData = { L, R, legL, legR, torso };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Intro {
  constructor(renderer) {
    this.renderer = renderer; this.t = 0; this.done = false;
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 6000);
    const sunDir = new V3(0.0, 0.07, -1).normalize();
    const sky = makeSky({ sunDir, zenith: '#3e4c73', horizon: '#ff9f4a', horizonAway: '#9c7f8c', sunColor: '#ffae4a', cloudLit: '#ffc68a', cloudDark: '#5a4556', groundCol: '#2a2a30', sunSize: 0.04, sunGlow: 1.8, cover: 0.45 });
    sky.scale.setScalar(4); scene.add(sky); this.sky = sky;
    scene.fog = new THREE.FogExp2('#d98c5c', 0.0009);
    scene.add(new THREE.HemisphereLight('#8da0c8', '#3a2c28', 0.45));
    const sun = new THREE.DirectionalLight('#ffb070', 3.4); sun.position.copy(sunDir).multiplyScalar(200); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 600 }); sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target); this.sun = sun;
    const water = new Water(new THREE.PlaneGeometry(12000, 12000), { textureWidth: 512, textureHeight: 512, waterNormals: T.waterNormalTex(), sunDirection: sunDir, sunColor: 0xffb070, waterColor: 0x183644, distortionScale: 3.5, fog: true });
    water.rotation.x = -Math.PI / 2; water.position.y = -20; water.material.uniforms.size.value = 4; scene.add(water); this.water = water;
    // full-size deck (a slice of it), facing -Z toward the sun
    const c = document.createElement('canvas'); c.width = 512; c.height = 2048; const x = c.getContext('2d');
    x.fillStyle = '#3b3e42'; x.fillRect(0, 0, 512, 2048);
    for (let i = 0; i < 30000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`; x.fillRect(Math.random() * 512, Math.random() * 2048, 3, 2); }
    x.fillStyle = '#8f8f8c'; x.fillRect(250, 0, 12, 2048); x.fillStyle = '#d8c548'; x.fillRect(150, 0, 5, 2048); x.fillRect(357, 0, 5, 2048);
    x.strokeStyle = '#e8e2c8'; x.lineWidth = 4; x.setLineDash([40, 30]); x.beginPath(); x.moveTo(60, 2048); x.lineTo(60, 0); x.stroke();
    const dt = T.toTex(c); dt.anisotropy = 8;
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(76, 300).rotateX(-Math.PI / 2), std({ map: dt, roughness: 0.85 }));
    deck.position.set(0, 0, -60); deck.receiveShadow = true; scene.add(deck);
    const hullM = std({ color: '#545b63', roughness: 0.8 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(76, 20, 300), hullM); hull.position.set(0, -10.05, -60); scene.add(hull);
    const island = new THREE.Group(); island.position.set(30, 0, 40);
    for (const [w, h, d, y] of [[12, 14, 30, 7], [10, 6, 20, 17], [8, 3, 16, 21.5]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hullM); b.position.y = y; b.castShadow = true; island.add(b); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 18), hullM); mast.position.y = 32; island.add(mast); scene.add(island);
    // the launching jet on cat 1 and parked jets
    this.jet = buildHornet({ modex: '214', paint: '#8b9198' }); this.jet.position.set(0, 2.35, 0); scene.add(this.jet);
    this.jbd = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 0.3), std({ color: '#5f656c', roughness: 0.6, metalness: 0.4 })); this.jbd.position.set(0, 0, 13); this.jbd.rotation.x = 0; scene.add(this.jbd);
    const parked = [[-24, 70, 2.6, '106'], [-24, 90, 2.6, '111'], [-26, 110, 2.6, '200'], [22, 110, -2.3, '305']];
    for (const [px, pz, ry, n] of parked) { const j = buildHornet({ modex: n }); j.position.set(px, 2.35, pz); j.rotation.y = ry; scene.add(j); }
    const second = buildHornet({ modex: '101' }); second.position.set(-20, 2.35, 30); second.rotation.y = 0.35; scene.add(second); this.second = second;
    // crew: yellow (director), green (cat crew), white (safety), purple (fuel), red (ordnance), brown (plane captain)
    const C = this.crew = {};
    const put = (k, col, p, ry = 0) => { const m = crew(col); m.position.copy(p); m.rotation.y = ry; scene.add(m); C[k] = m; return m; };
    put('shooter', '#e8d232', new V3(-14, 0, -4), -1.2);
    put('yellow', '#e8d232', new V3(9, 0, -14), 0.6);
    put('green1', '#2f9a4c', new V3(-4, 0, -9), 0); put('green2', '#2f9a4c', new V3(5, 0, 8), Math.PI);
    put('white', '#ececec', new V3(-9, 0, 4), -0.4); put('purple', '#6a3fa0', new V3(-30, 0, 58), 2);
    put('red', '#c8342a', new V3(-17, 0, 22), 1.2); put('brown', '#7b5534', new V3(12, 0, 4), -2.2);
    put('walker1', '#2f9a4c', new V3(-40, 0, 20), 0); put('walker2', '#e8d232', new V3(-44, 0, 34), 0);
    // steam along the cat track
    this.steam = []; this.glow = T.glowTex();
    this.shots = [
      { t: 0, d: 4.6, from: [-14, 1.7, 95], to: [-11, 1.6, 78], look: [0, 3, 0], lookTo: [2, 3, -12], fov: 30 },
      { t: 4.6, d: 4.2, from: [7, 1.5, -21], to: [10, 1.7, -19], look: [9, 1.6, -14], lookTo: [9, 1.5, -14], fov: 34 },
      { t: 8.8, d: 3.6, from: [-3, 0.5, -11], to: [-2.5, 0.6, -9], look: [0, 1, -6], lookTo: [0, 1.4, -2], fov: 42 },
      { t: 12.4, d: 3.3, from: [-6, 2.5, 24], to: [-4, 2.4, 20], look: [0, 2.2, 6], lookTo: [0, 2.4, 6], fov: 38 },
      { t: 15.7, d: 3.0, from: [-17, 1.3, -10], to: [-16, 1.2, -8], look: [-14, 0.9, -4], lookTo: [-4, 2, -2], fov: 36 },
      { t: 18.7, d: 2.3, from: [-26, 2.2, -70], to: [-26, 2.2, -70], look: [0, 3, -20], lookTo: [0, 4, -90], fov: 34 },
      { t: 21.0, d: 9.0, chase: true, fov: 50 },
    ];
    this.total = 29.5; this.launchT = 19.0; this.jetZ = 0; this.jetV = 0;
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
  update(dt) {
    const t = this.t += dt; const C = this.crew;
    this.water.material.uniforms.time.value = t * 0.5;
    // crew motion: walkers, director arm waves, thumbs-up, shooter's launch signal
    for (const k of ['walker1', 'walker2']) { const m = C[k]; m.position.z -= dt * 1.3; const s = Math.sin(t * 6); m.userData.legL.rotation.x = s * 0.5; m.userData.legR.rotation.x = -s * 0.5; m.userData.L.rotation.x = -s * 0.4; m.userData.R.rotation.x = s * 0.4; }
    const Y = C.yellow.userData; Y.L.rotation.z = -2.4 + Math.sin(t * 3) * 0.5; Y.R.rotation.z = 2.4 - Math.sin(t * 3 + 1) * 0.5;
    const thumbs = t > 13 ? ease(Math.min(1, (t - 13) * 2)) : 0;
    for (const k of ['green1', 'white', 'brown', 'red']) C[k].userData.R.rotation.z = lerp(0, 2.3, thumbs);
    const S = C.shooter.userData;
    if (t > 15.7) { const k = ease(Math.min(1, (t - 15.7) / 1.2)); S.R.rotation.z = lerp(0, 2.6, k); C.shooter.position.y = lerp(0, -0.35, k); S.legL.rotation.x = lerp(0, -1.2, k); }
    if (t > 17.6) { const k = ease(Math.min(1, (t - 17.6) / 0.6)); S.R.rotation.x = lerp(0, -1.6, k); S.R.rotation.z = lerp(2.6, 0.4, k); C.shooter.rotation.y = lerp(-1.2, Math.PI, k * 0.25 - 0); }
    // engines run up, JBD raises, then the shot
    const thr = t < 12 ? 0.3 : t < this.launchT ? 0.95 : 1;
    this.jbd.rotation.x = -Math.min(1, Math.max(0, (t - 11) / 1.5)) * 1.0;
    if (t > this.launchT) { this.jetV = Math.min(75, this.jetV + 38 * dt); this.jetZ -= this.jetV * dt; }
    this.jet.position.z = this.jetZ;
    if (this.jetZ < -150) { this.jet.position.y = 2.35 + (-150 - this.jetZ) * 0.12; this.jet.rotation.x = Math.min(0.25, (-150 - this.jetZ) * 0.004); }
    this.jet.userData.animate(dt, { thr, ab: t > 12.4, gearDown: this.jetZ > -190, hookDown: false });
    // steam
    if (Math.random() < dt * (t > this.launchT ? 60 : 14)) {
      const z = t > this.launchT ? this.jetZ + 10 + Math.random() * 30 : -6 - Math.random() * 120;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: '#f3e3d0', transparent: true, depthWrite: false, opacity: 0.35, fog: true }));
      s.position.set((Math.random() - 0.5) * 1.5, 0.3, z); s.scale.setScalar(2); this.scene.add(s); this.steam.push({ s, a: 0 });
    }
    for (let i = this.steam.length - 1; i >= 0; i--) { const p = this.steam[i]; p.a += dt; p.s.position.y += dt * 0.8; p.s.position.x += dt * 0.6; p.s.scale.setScalar(2 + p.a * 3); p.s.material.opacity = 0.35 * Math.max(0, 1 - p.a / 3); if (p.a > 3) { this.scene.remove(p.s); this.steam.splice(i, 1); } }
    // camera
    const cam = this.camera; let sh = this.shots[0]; for (const s of this.shots) if (t >= s.t) sh = s;
    if (cam.fov !== sh.fov) { cam.fov = sh.fov; cam.updateProjectionMatrix(); }
    if (sh.chase) {
      const k = Math.min(1, (t - sh.t) / sh.d); const jp = this.jet.position;
      cam.position.set(jp.x - 9 + k * 4, jp.y + 2.5 + k * 3, jp.z + 26 + k * 10); cam.lookAt(jp.x, jp.y + 1, jp.z - 20);
    } else {
      const k = ease(Math.min(1, (t - sh.t) / sh.d));
      cam.position.set(lerp(sh.from[0], sh.to[0], k), lerp(sh.from[1], sh.to[1], k), lerp(sh.from[2], sh.to[2], k));
      cam.lookAt(lerp(sh.look[0], sh.lookTo[0], k), lerp(sh.look[1], sh.lookTo[1], k), lerp(sh.look[2], sh.lookTo[2], k));
      if (sh === this.shots[5]) cam.lookAt(this.jet.position.x, 3, Math.min(this.jet.position.z, -10));
    }
    cam.position.y += Math.sin(t * 1.3) * 0.02; // handheld breath
    this.sun.target.position.copy(cam.position).setY(0); this.sun.position.copy(this.sun.target.position).add(new V3(0, 0.07, -1).normalize().multiplyScalar(200));
    if (t > this.total) this.done = true;
  }
  dispose() { this.scene.traverse((o) => { o.geometry?.dispose?.(); }); }
}

// timed title cards (original wording)
export const CARDS = [
  { t: 1.0, d: 3.6, html: 'On a carrier deck, a jet goes from standstill to flying speed in about <b>two seconds</b>.' },
  { t: 6.0, d: 3.4, html: 'The crew runs it with hand signals. A thumbs-up means <b>ready</b>.' },
  { t: 10.4, d: 3.4, html: 'Ours is <b>1.25 metres</b> long, runs on a ducted fan, and you fly it from the ground.' },
  { t: 14.6, d: 3.0, html: 'Same physics. Smaller margins.' },
];
