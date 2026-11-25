// Procedural F/A-18E/F-style Super Hornet (real scale, metres). Nose points -Z, up +Y, right +X.
import * as THREE from 'three';
import { makeCanvas, toTex, glowTex } from './textures.js';

export const GEAR_H = 2.35; // CG height above the deck with gear down

function cr(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function loft(sections, segs = 40, sub = 5) {
  const rings = []; const N = sections.length;
  for (let i = 0; i < N - 1; i++) {
    const s0 = sections[Math.max(0, i - 1)], s1 = sections[i], s2 = sections[i + 1], s3 = sections[Math.min(N - 1, i + 2)];
    for (let k = 0; k < sub; k++) { const t = k / sub; rings.push(s1.map((_, j) => (j === 0 ? s1[0] + (s2[0] - s1[0]) * t : cr(s0[j], s1[j], s2[j], s3[j], t)))); }
  }
  rings.push(sections[N - 1]);
  const pos = [], idx = []; const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (const [z, w, h, yc, n] of rings) for (let j = 0; j <= segs; j++) {
    const th = (j / segs) * Math.PI * 2;
    pos.push((w / 2) * sp(Math.sin(th), 2 / n), yc - (h / 2) * sp(Math.cos(th), 2 / n), z);
  }
  for (let r = 0; r < rings.length - 1; r++) for (let j = 0; j < segs; j++) { const a = r * (segs + 1) + j, b = a + segs + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const cap = (ri, flip) => { const [z, , , yc] = rings[ri]; const c = pos.length / 3; pos.push(0, yc, z); for (let j = 0; j < segs; j++) { const a = ri * (segs + 1) + j; flip ? idx.push(c, a + 1, a) : idx.push(c, a, a + 1); } };
  cap(0, false); cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// flat planform (x = span, z = chord) extruded to a thin plate lying in the XZ plane
function plate(pts, thick) {
  const sh = new THREE.Shape(); pts.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z))); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.4, bevelSegments: 1 });
  g.translate(0, 0, -thick / 2); g.rotateX(Math.PI / 2); return g;
}
function numTex(n) {
  const [c, g] = makeCanvas(256, 128); g.clearRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(40,44,50,0.9)'; g.font = 'bold 92px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 128, 66);
  const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function buildHornet({ modex = '100', paint = '#8f959c', dark = false } = {}) {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: dark ? '#4a4f56' : paint, roughness: 0.55, metalness: 0.25 });
  const skin2 = new THREE.MeshStandardMaterial({ color: dark ? '#3c4046' : '#7b8188', roughness: 0.6, metalness: 0.25 });
  const metal = new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.35, metalness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1e2a33', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.82, envMapIntensity: 1.6 });
  const tire = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 });
  const add = (g, m, x = 0, y = 0, z = 0, parent = root) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };

  // fuselage
  add(loft([
    [-9.3, 0.08, 0.08, 0.05, 2], [-8.6, 0.6, 0.6, 0.1, 2.2], [-7.2, 1.05, 1.15, 0.2, 2.4], [-5.6, 1.35, 1.6, 0.3, 2.6],
    [-3.6, 1.7, 1.55, 0.2, 3], [-1.5, 2.7, 1.35, 0.0, 4], [1.5, 3.0, 1.25, -0.05, 4.5], [4.5, 2.6, 1.15, 0.05, 4],
    [7.5, 2.1, 1.0, 0.1, 3.4], [9.0, 1.8, 0.9, 0.1, 3],
  ], 44, 5), skin);
  // canopy
  const can = add(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.78, -5.1); can.scale.set(0.55, 0.62, 1.9);
  // LEX + wings + tails
  for (const s of [-1, 1]) {
    add(plate([[0.6, -7.2], [1.5, -3.5], [1.6, -1.2], [0.6, -1.2]].map(([x, z]) => [x * s, z]), 0.08), skin, 0, 0.05, 0);
    add(plate([[1.3, -1.6], [6.8, 2.3], [6.8, 3.6], [1.3, 3.9]].map(([x, z]) => [x * s, z]), 0.16), skin, 0, -0.05, 0);
    add(plate([[1.1, 6.1], [4.0, 8.4], [4.0, 9.6], [1.1, 9.4]].map(([x, z]) => [x * s, z]), 0.1), skin2, 0, 0.05, 0);
    const fin = new THREE.Group(); fin.position.set(s * 1.2, 0.4, 0); fin.rotation.z = -s * 0.36; root.add(fin);
    const fm = new THREE.Mesh(plate([[0, 4.2], [3.2, 7.1], [3.2, 8.5], [0, 8.9]], 0.12), skin); fm.rotation.z = Math.PI / 2; fm.castShadow = true; fin.add(fm);
    // intake
    add(new THREE.BoxGeometry(0.9, 1.0, 3.6), skin2, s * 1.3, -0.45, -1.6);
    add(new THREE.BoxGeometry(0.75, 0.8, 0.05), metal, s * 1.3, -0.45, -3.42);
    // engine nozzle
    add(new THREE.CylinderGeometry(0.5, 0.56, 1.3, 18).rotateX(Math.PI / 2), metal, s * 0.58, 0.1, 9.4);
  }
  // afterburner flames
  const flames = [];
  for (const s of [-1, 1]) {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.42, 4.2, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 2.1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a40').multiplyScalar(3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    fl.position.set(s * 0.58, 0.1, 10.1); root.add(fl); flames.push(fl);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffb070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    core.scale.setScalar(2.2); core.position.set(s * 0.58, 0.1, 10.0); root.add(core); flames.push(core);
  }
  // landing gear (retractable) + hook
  const gear = new THREE.Group(); root.add(gear);
  const leg = (x, z, h, r) => {
    add(new THREE.CylinderGeometry(0.09, 0.09, h, 8), metal, x, -0.6 - h / 2, z, gear);
    add(new THREE.CylinderGeometry(r, r, 0.32, 16).rotateZ(Math.PI / 2), tire, x, -0.6 - h, z, gear);
  };
  leg(0, -6.4, 1.35, 0.36); leg(-1.7, 1.2, 1.35, 0.42); leg(1.7, 1.2, 1.35, 0.42);
  const hook = new THREE.Group(); hook.position.set(0, -0.3, 8.0); root.add(hook);
  add(new THREE.BoxGeometry(0.12, 0.12, 2.2).translate(0, 0, 1.1), metal, 0, 0, 0, hook);
  // modex numbers + lights
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ map: numTex(modex), transparent: true, polygonOffset: true, polygonOffsetFactor: -4 }));
    d.position.set(s * 0.72, 0.05, -6.6); d.rotation.y = s * Math.PI / 2; root.add(d);
  }
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(6) })); navR.position.set(-6.8, -0.03, 3.0); root.add(navR);
  const navG = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x20ff50).multiplyScalar(6) })); navG.position.set(6.8, -0.03, 3.0); root.add(navG);

  let gearT = 1, hookT = 0;
  root.userData = {
    flames, gear, hook,
    animate(dt, { thr = 0, ab = false, gearDown = true, hookDown = false } = {}) {
      gearT += ((gearDown ? 1 : 0) - gearT) * Math.min(1, dt * 1.5);
      gear.scale.y = Math.max(0.02, gearT); gear.position.y = (1 - gearT) * 0.6; gear.visible = gearT > 0.03;
      hookT += ((hookDown ? 1 : 0) - hookT) * Math.min(1, dt * 3); hook.rotation.x = -hookT * 0.55;
      const fl = ab ? 1 : Math.max(0, (thr - 0.7) / 0.3) * 0.25;
      flames.forEach((f, i) => {
        if (f.isSprite) f.material.opacity = 0.25 + fl * 0.75;
        else { f.material.opacity = fl * (0.55 + Math.random() * 0.15); f.scale.set(1, 1, 0.6 + fl * 0.6 + Math.random() * 0.08); }
      });
    },
  };
  root.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
  return root;
}

// Generic dark fifth-gen style adversary (original low-poly design, not a specific real aircraft)
export function buildBandit() {
  const root = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#3a3e44', roughness: 0.5, metalness: 0.3 });
  const m2 = new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.5, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#7a5a20', roughness: 0.1, metalness: 0.8 });
  const add = (g, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, mat); o.position.set(x, y, z); o.castShadow = true; root.add(o); return o; };
  add(loft([[-10, 0.1, 0.08, 0, 2], [-8, 1.0, 0.7, 0, 2.2], [-4, 2.4, 1.1, 0, 3.5], [2, 4.2, 1.0, 0, 5], [7, 3.0, 0.8, 0, 4], [9.5, 2.2, 0.6, 0, 3]], 32, 4), m);
  const c = add(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.45, -5.5); c.scale.set(0.5, 0.5, 1.7);
  for (const s of [-1, 1]) {
    add(plate([[1.5, -3.5], [7.2, 3.2], [7.2, 4.4], [1.5, 5.2]].map(([x, z]) => [x * s, z]), 0.12), m);
    add(plate([[1.5, 6.4], [4.6, 8.8], [4.6, 9.8], [1.5, 9.8]].map(([x, z]) => [x * s, z]), 0.1), m2);
    const fin = add(new THREE.BoxGeometry(0.1, 2.6, 2.6), m2, s * 1.6, 1.3, 7.2); fin.rotation.z = -s * 0.5; fin.rotation.x = -0.2;
    add(new THREE.CylinderGeometry(0.55, 0.6, 1.2, 14).rotateX(Math.PI / 2), m2, s * 0.8, 0, 9.6);
  }
  const fl = []; for (const s of [-1, 1]) { const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff8040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); g.scale.setScalar(2.5); g.position.set(s * 0.8, 0, 10.3); root.add(g); fl.push(g); }
  root.userData = { animate(dt, { ab = false } = {}) { fl.forEach((g) => { g.material.opacity = ab ? 0.9 : 0.4; }); } };
  return root;
}
