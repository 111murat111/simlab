// Roket modeli (gerçek ölçek, m), motor alevi (HDR, bloom) ve duman/buhar parçacıkları (yumuşak, güneşle aydınlanan billboard).
import { THREE, mat, RoundedBoxGeometry, textTexture } from '@core';

const RAD = 0.8;          // gövde yarıçapı (m)
const RHO = 1000;         // yakıt + oksitleyici ortalama yoğunluğu (kg/m³, temsilî)
const tankLen = (kg) => kg / (RHO * Math.PI * RAD * RAD);

const M = {
  white: mat.paintedMetal({ color: 0xcfd2d2, wear: 0.04 }),
  black: mat.paintedMetal({ color: 0x1c1d20, wear: 0.12 }),
  red: mat.paintedMetal({ color: 0xb22a22, wear: 0.05 }),
  grey: mat.paintedMetal({ color: 0x8c9196, wear: 0.3 }),
  bell: mat.brushedMetal({ color: 0x6d5c4f, rough: 0.42 }),
  bellIn: mat.brushedMetal({ color: 0x2c2522, rough: 0.6 }),
  metal: mat.brushedMetal({ color: 0xaeb3b8 }),
};
M.bell.side = THREE.DoubleSide;

function lathe(pts, m, seg = 64) { return new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-3), y)), seg), m); }
// Motor çanı: boğaz → çıkış (çan eğrisi), üstte güç başlığı
function engine(exitR, len) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([exitR * (0.32 + 0.68 * Math.pow(1 - t, 0.62)), t * len]); }
  g.add(lathe(pts, M.bell, 40));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(exitR, exitR * 0.05, 6, 40), M.metal); ring.rotation.x = Math.PI / 2; g.add(ring);
  const head = lathe([[exitR * 0.3, len], [exitR * 0.5, len + 0.08], [exitR * 0.55, len + exitR * 0.9], [exitR * 0.2, len + exitR * 1.2]], M.metal, 24);
  g.add(head);
  return g;
}
function finGeo() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(0.95, 0.15); sh.lineTo(0.95, 1.0); sh.lineTo(0, 2.6); sh.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  g.translate(0, 0, -0.03);
  return g;
}
let logoTex = null;

/** Roket: kök grubun y=0'ı motor çıkış düzlemi. stages: 1 | 2 */
export function buildRocket(fuel, stages) {
  const root = new THREE.Group(), s1 = new THREE.Group(), s2 = new THREE.Group();
  root.add(s1, s2);
  const L1 = tankLen(stages === 2 ? fuel * 0.72 : fuel), L2 = stages === 2 ? tankLen(fuel * 0.28) : 0;
  // 1. kademe: 4 motor, kuyruk eteği, tank gövdesi
  const eR = 0.26, eL = 0.9;
  const engines1 = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, e = engine(eR, eL);
    e.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4); s1.add(e); engines1.push(e.position.clone());
  }
  const skirtTop = 2.0;
  s1.add(lathe([[0.62, 0.75], [0.7, 0.78], [0.86, 1.1], [RAD + 0.02, 1.6], [RAD + 0.02, skirtTop]], M.black));
  const heat = lathe([[0.02, 0.8], [0.62, 0.8], [0.62, 0.86], [0.02, 0.86]], M.grey, 32); s1.add(heat);
  const y0 = skirtTop, y1 = y0 + L1;
  s1.add(lathe([[RAD, y0], [RAD, y1]], M.white));
  for (let y = y0 + 2.2; y < y1 - 0.5; y += 2.2) { const w = new THREE.Mesh(new THREE.TorusGeometry(RAD + 0.002, 0.008, 4, 64), M.grey); w.rotation.x = Math.PI / 2; w.position.y = y; s1.add(w); }
  const band = lathe([[RAD + 0.006, y0 + 0.25], [RAD + 0.006, y0 + 0.55]], M.red); s1.add(band);
  // Kanatçıklar
  const fg = finGeo();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, f = new THREE.Mesh(fg, M.black);
    f.position.set(Math.cos(a) * (RAD - 0.02), 0.15, Math.sin(a) * (RAD - 0.02)); f.rotation.y = -a; s1.add(f);
  }
  // Kablo kanalı
  const race = new THREE.Mesh(new RoundedBoxGeometry(0.1, L1 - 0.4, 0.16, 2, 0.04), M.grey); race.position.set(0, (y0 + y1) / 2, -RAD - 0.05); s1.add(race);
  // Yazı: gövde üstünde dikey
  if (!logoTex) { logoTex = textTexture('SİMLAB', { size: 96, color: '#16181b', font: '800 {s}px system-ui, sans-serif', pad: 8 }); }
  const lh = Math.min(L1 * 0.6, 5.2), lw = lh / logoTex.userData.aspect;
  const logo = new THREE.Mesh(new THREE.CylinderGeometry(RAD + 0.004, RAD + 0.004, lh, 24, 1, true, -0.75 - lw / RAD / 2, lw / RAD),
    new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.45, depthWrite: false }));
  logo.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 0) { /* u,v yer değiştir: yazı boyuna */ const u = a[i], w = a[i + 1]; a[i] = w; a[i + 1] = 1 - u; } });
  logo.position.y = y0 + L1 * 0.52; logo.userData.ownMat = true; s1.add(logo);
  // Havalandırma çıkışı (rampada sıvı oksijen buharı)
  const vent = new THREE.Vector3(RAD + 0.02, y1 - 0.8, 0.25);
  let top = y1, nozzle2 = null, bell2R = 0;
  if (stages === 2) {
    // Ara kademe (karbon) ve içinde vakum motoru
    const iL = 1.9;
    s1.add(lathe([[RAD + 0.005, y1], [RAD + 0.005, y1 + iL]], M.black));
    const e2 = engine(0.55, 1.5); e2.position.y = y1 + 0.2; s2.add(e2);
    nozzle2 = y1 + 0.2; bell2R = 0.55;
    const b0 = y1 + iL;
    s2.add(lathe([[RAD, b0], [RAD, b0 + L2]], M.white));
    s2.add(lathe([[RAD + 0.006, b0 + L2 - 0.5], [RAD + 0.006, b0 + L2 - 0.2]], M.red));
    top = b0 + L2;
  }
  // Faydalı yük kaportası: ogive burun, ayrılma dikişi
  const fL = 4.6, fb = top;
  s2.add(lathe([[RAD, fb], [RAD, fb + 0.25]], M.black));
  const og = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; og.push([RAD * Math.sqrt(Math.max(0, 1 - Math.pow(t, 1.9))) * (1 - 0.04 * t), fb + 0.25 + t * fL]); }
  s2.add(lathe(og, M.white));
  const seam = new THREE.Mesh(new THREE.TorusGeometry(RAD + 0.003, 0.012, 4, 64), M.grey); seam.rotation.x = Math.PI / 2; seam.position.y = fb + 0.26; s2.add(seam);
  const tip = lathe([[0.06, fb + 0.25 + fL - 0.12], [0.03, fb + 0.25 + fL + 0.02], [0.001, fb + 0.25 + fL + 0.05]], M.metal, 16); s2.add(tip);
  const height = fb + 0.25 + fL;
  return { root, s1, s2, height, engines1, nozzle2, bell2R, eR, vent, top1: y1 };
}
export function disposeRocket(r) {
  if (!r) return;
  r.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.userData.ownMat) o.material.dispose(); });
  r.root.removeFromParent();
}

// --- Motor alevi: HDR renk, çekirdek parlak, uçta söner; deniz seviyesinde şok elmasları ---
const FLAME_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`;
const FLAME_FS = `
uniform float uTime, uSea, uPower; uniform vec3 uHot, uMid;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h(float n){ return fract(sin(n)*43758.5453); }
float n1(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f*f*(3.0 - 2.0*f)); }
void main(){
  float t = vUv.y;
  float fr = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(fr, 2.2);
  float fl = 0.8 + 0.35*n1(uTime*23.0 + t*9.0) + 0.2*n1(uTime*51.0 - t*20.0 + vUv.x*30.0);
  float dia = 1.0 + uSea*1.3*pow(0.5 + 0.5*cos(t*6.2831*5.0), 10.0)*(1.0 - smoothstep(0.1, 0.6, t));
  float fall = pow(1.0 - t, 1.6)*smoothstep(0.0, 0.03, t);
  vec3 c = mix(uHot, uMid, smoothstep(0.02, 0.55, t + (1.0 - core)*0.35));
  float a = fall*(0.25 + 0.9*core)*fl*dia*uPower;
  gl_FragColor = vec4(c*a, a);
}`;
export function createFlame(n) {
  const pts = [];
  for (let i = 0; i <= 28; i++) { const t = i / 28; pts.push(new THREE.Vector2(Math.max(0.02, (1 + 0.45 * Math.sin(Math.min(t * 3.2, Math.PI)) * (1 - t)) * (1 - 0.8 * t)), -t)); }
  const geo = new THREE.LatheGeometry(pts, 32);
  const mk = () => new THREE.ShaderMaterial({
    vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 }, uSea: { value: 1 }, uPower: { value: 1 }, uHot: { value: new THREE.Color(9, 7.5, 5) }, uMid: { value: new THREE.Color(5, 1.9, 0.45) } },
  });
  const group = new THREE.Group();
  const list = [];
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, mk()); m.renderOrder = 5; m.userData.noAO = true; group.add(m); list.push(m); }
  return { group, list };
}

// --- Duman / buhar parçacıkları: örneklenmiş billboard, yumuşak kenar, güneş + gök ışığı ---
const SMOKE_VS = `
attribute vec3 aOff; attribute vec4 aPrm; attribute float aHeat;
varying vec2 vUv; varying vec4 vP; varying float vHeat; varying float vDepth;
void main(){
  vUv = uv; vP = aPrm; vHeat = aHeat;
  vec4 mv = viewMatrix*vec4(aOff, 1.0);
  float r = aPrm.w*6.2831; vec2 q = mat2(cos(r), -sin(r), sin(r), cos(r))*position.xy;
  mv.xy += q*aPrm.x;
  vDepth = -mv.z;
  gl_Position = projectionMatrix*mv;
}`;
const SMOKE_FS = `
uniform vec3 uSunV, uSunCol, uAmb, uFog; uniform float uFogD;
varying vec2 vUv; varying vec4 vP; varying float vHeat; varying float vDepth;
float h2(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 c = vUv*2.0 - 1.0; float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  vec2 q = vUv*2.6 + vP.w*37.0;
  float n = vn(q)*0.55 + vn(q*2.3)*0.3 + vn(q*5.1)*0.15;
  float a = smoothstep(1.0, 0.15, r2 + (n - 0.5)*0.9)*vP.y;
  vec3 nrm = normalize(vec3(c*0.85 + (n - 0.5)*0.6, sqrt(max(0.0, 1.0 - r2)) + 0.25));
  float lam = clamp(dot(nrm, uSunV)*0.55 + 0.45, 0.0, 1.0);
  vec3 col = vP.z*(uSunCol*lam*0.9 + uAmb*(0.8 + 0.4*nrm.y));
  col += vec3(5.0, 2.0, 0.55)*vHeat*(1.0 - r2*0.7);
  col = mix(col, uFog, 1.0 - exp(-vDepth*uFogD));
  gl_FragColor = vec4(col*a, a);
}`;
export function createSmoke(max = 1800) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const off = new Float32Array(max * 3), prm = new Float32Array(max * 4), hot = new Float32Array(max);
  const aOff = new THREE.InstancedBufferAttribute(off, 3), aPrm = new THREE.InstancedBufferAttribute(prm, 4), aHeat = new THREE.InstancedBufferAttribute(hot, 1);
  [aOff, aPrm, aHeat].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aOff', aOff); geo.setAttribute('aPrm', aPrm); geo.setAttribute('aHeat', aHeat);
  geo.instanceCount = 0;
  const U = { uSunV: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uFogD: { value: 0 } };
  const material = new THREE.ShaderMaterial({ vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, uniforms: U, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, fog: false });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.userData.noAO = true; mesh.raycast = () => {};
  // Parçacık durumu
  const P = { x: new Float32Array(max), y: new Float32Array(max), z: new Float32Array(max), vx: new Float32Array(max), vy: new Float32Array(max), vz: new Float32Array(max),
    age: new Float32Array(max), life: new Float32Array(max), s0: new Float32Array(max), s1: new Float32Array(max), a: new Float32Array(max), heat: new Float32Array(max),
    drag: new Float32Array(max), rise: new Float32Array(max), alb: new Float32Array(max), rot: new Float32Array(max) };
  let head = 0;
  const alive = new Uint8Array(max);
  function emit(x, y, z, vx, vy, vz, { s0 = 2, s1 = 12, life = 8, a = 0.5, heat = 0, drag = 0.6, rise = 0.6, alb = 0.85 } = {}) {
    const i = head; head = (head + 1) % max;
    P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
    P.age[i] = 0; P.life[i] = life * (0.8 + Math.random() * 0.4); P.s0[i] = s0; P.s1[i] = s1 * (0.8 + Math.random() * 0.4);
    P.a[i] = a; P.heat[i] = heat; P.drag[i] = drag; P.rise[i] = rise; P.alb[i] = alb * (0.9 + Math.random() * 0.15); P.rot[i] = Math.random();
    alive[i] = 1;
  }
  const wind = new THREE.Vector3(2.2, 0, 1.2);
  function update(dt) {
    let k = 0;
    for (let i = 0; i < max; i++) {
      if (!alive[i]) continue;
      P.age[i] += dt;
      const t = P.age[i] / P.life[i];
      if (t >= 1) { alive[i] = 0; continue; }
      const d = Math.exp(-P.drag[i] * dt);
      P.vx[i] = (P.vx[i] - wind.x) * d + wind.x; P.vz[i] = (P.vz[i] - wind.z) * d + wind.z; P.vy[i] = (P.vy[i] - P.rise[i]) * d + P.rise[i];
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
      const size = P.s0[i] + (P.s1[i] - P.s0[i]) * (1 - Math.exp(-4 * t));
      const al = P.a[i] * Math.min(1, t * 12) * Math.pow(1 - t, 1.4);
      off[k * 3] = P.x[i]; off[k * 3 + 1] = P.y[i]; off[k * 3 + 2] = P.z[i];
      prm[k * 4] = size; prm[k * 4 + 1] = al; prm[k * 4 + 2] = P.alb[i]; prm[k * 4 + 3] = P.rot[i] + t * 0.08;
      hot[k] = P.heat[i] * Math.exp(-P.age[i] * 5);
      k++;
    }
    geo.instanceCount = k;
    aOff.needsUpdate = aPrm.needsUpdate = aHeat.needsUpdate = true;
    return k;
  }
  function light(sky, camera) {
    U.uSunV.value.copy(sky.sunDir).transformDirection(camera.matrixWorldInverse);
    U.uSunCol.value.copy(sky.sunColor); U.uAmb.value.copy(sky.ambient).multiplyScalar(1.4);
    if (sky.fog) { U.uFog.value.copy(sky.fog.color); U.uFogD.value = sky.fog.density; }
  }
  function clear() { alive.fill(0); geo.instanceCount = 0; }
  return { mesh, emit, update, light, clear, wind };
}
