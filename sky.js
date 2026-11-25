import * as THREE from 'three';

const vert = /* glsl */`
varying vec3 vDir;
void main(){
  vec4 wp = modelMatrix * vec4(position,1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // far plane
}`;
const frag = /* glsl */`
uniform vec3 sunDir, zenith, horizon, horizonAway, sunColor, cloudLit, cloudDark, groundCol;
uniform float sunSize, sunGlow, time, cover, cloudBright;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5;} return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float sd = max(dot(d, sunDir), 0.);
  float az = max(dot(normalize(d.xz+1e-4), normalize(sunDir.xz+1e-4)), 0.);
  vec3 hz = mix(horizonAway, horizon, pow(az, 2.0));
  vec3 col = mix(hz, zenith, pow(clamp(h,0.,1.), 0.5));
  col += sunColor * (pow(sd, 6.) * 0.35 * sunGlow + pow(sd, 48.) * 0.9 * sunGlow);
  col = mix(col, hz * 1.05, exp(-max(h,0.)*14.) * 0.55);
  // clouds
  if (h > 0.0 && cover > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 0.55 + vec2(time*0.003, time*0.001);
    float n = fbm(uv * 1.3);
    float n2 = fbm(uv * 1.3 + sunDir.xz * 0.05);
    float c = smoothstep(1.0 - cover, 1.0 - cover + 0.32, n);
    float lit = clamp((n - n2) * 5. + 0.5, 0., 1.);
    vec3 cc = mix(cloudDark, cloudLit, lit * 0.55 + pow(sd, 2.5) * 0.6 + pow(az,3.)*0.25);
    cc += sunColor * pow(sd, 10.) * 0.6 * sunGlow;
    cc *= cloudBright;
    float fade = smoothstep(0.0, 0.1, h);
    col = mix(col, cc, c * fade * 0.92);
  }
  // sun disk
  float disk = smoothstep(cos(sunSize), cos(sunSize*0.6), dot(d, sunDir));
  col += sunColor * disk * 14. * sunGlow;
  if (h < 0.0) col = mix(col, groundCol, smoothstep(0.0, -0.06, h));
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeSky(p) {
  const c = (x) => new THREE.Color(x);
  const u = {
    sunDir: { value: p.sunDir.clone().normalize() },
    zenith: { value: c(p.zenith) }, horizon: { value: c(p.horizon) }, horizonAway: { value: c(p.horizonAway) },
    sunColor: { value: c(p.sunColor) }, cloudLit: { value: c(p.cloudLit) }, cloudDark: { value: c(p.cloudDark) },
    groundCol: { value: c(p.groundCol) },
    sunSize: { value: p.sunSize ?? 0.025 }, sunGlow: { value: p.sunGlow ?? 1 }, time: { value: 0 }, cover: { value: p.cover ?? 0.5 },
    cloudBright: { value: p.cloudBright ?? 1 },
  };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), m);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  mesh.userData.uniforms = u;
  return mesh;
}
