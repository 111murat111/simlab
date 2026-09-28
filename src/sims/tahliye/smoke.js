// Yumuşak duman/toz parçacıkları (roket-firlatma'dan uyarlanmış yerel yardımcı): kamera-yüzlü örneklenmiş dörtgenler,
// gürültülü yumuşak kenar, güneş + ortam ışığı, sis. emit() → update(dt) → light(sky, camera).
import { THREE } from '@core';

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
