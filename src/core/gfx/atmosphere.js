// Fiziksel gökyüzü: Rayleigh + Mie tek saçılma (Açık Deniz'den), prosedürel bulut, gece yıldızları.
// Gökyüzü bir eşdikdörtgen HDR dokuya pişirilir; aynı doku ortam ışığı (PMREM) ve arka plan olarak kullanılır,
// güneşin rengi atmosferden geçişe (transmittance) göre hesaplanır. Tüm ışık tek kaynaktan gelir.
import * as THREE from 'three';
import { GLSL_COMMON } from './glsl.js';

const RE = 6360e3, RA = 6460e3, HR = 8000, HM = 1200;
const BR = [5.5e-6, 13.0e-6, 22.4e-6], BM = 21e-6;

export const CLOUDS_GLSL = /* glsl */ `
uniform float uCloud, uTime; uniform vec3 uSunDir, uSunCol; uniform vec2 uCloudV;
vec4 clouds(vec3 d, vec3 base, vec3 amb){
  if (d.y <= 0.0 || uCloud < 0.005) return vec4(base, 0.0);
  float t = 1800.0/(d.y + 0.035);
  vec2 p = (d.xz*t - uCloudV*uTime)*0.00028;
  float n = fbm(p, 6);
  float th = mix(0.74, 0.28, uCloud);
  float dens = smoothstep(th, th + 0.2, n);
  float n2 = fbm(p + normalize(uSunDir.xz + 1e-4)*0.07, 4);
  float lit = clamp(1.0 - (n2 - n)*5.0, 0.25, 1.3);
  float silver = pow(max(dot(d, uSunDir), 0.0), 10.0)*(1.0 - dens)*3.0;
  vec3 col = uSunCol*(0.5*lit + silver) + amb*mix(1.4, 0.8, uCloud);
  col *= mix(1.0, 0.5, uCloud*uCloud*smoothstep(th, th + 0.45, n));
  col = mix(col, base, 1.0 - exp(-t*0.000016));
  float a = dens*smoothstep(0.0, 0.12, d.y);
  return vec4(mix(base, col, a), a);
}`;

const ATMO_GLSL = /* glsl */ `
const float Re = 6360e3, Ra = 6460e3, HR = 8000.0, HM = 1200.0;
const vec3 BR = vec3(5.5e-6, 13.0e-6, 22.4e-6); const float BM = 21e-6;
vec2 rs(vec3 ro, vec3 rd, float r){ float b = dot(ro, rd), c = dot(ro, ro) - r*r, h = b*b - c; if (h < 0.0) return vec2(-1.0); h = sqrt(h); return vec2(-b - h, -b + h); }
vec3 atmo(vec3 rd, vec3 sd){
  vec3 ro = vec3(0.0, Re + 2.0, 0.0);
  float tmax = rs(ro, rd, Ra).y;
  float ds = tmax/20.0;
  float mu = dot(rd, sd), g = 0.76;
  float pR = 3.0/(16.0*PI)*(1.0 + mu*mu);
  float pM = 3.0/(8.0*PI)*((1.0 - g*g)*(1.0 + mu*mu))/((2.0 + g*g)*pow(1.0 + g*g - 2.0*g*mu, 1.5));
  vec3 sR = vec3(0.0), sM = vec3(0.0); float oR = 0.0, oM = 0.0;
  for (int i = 0; i < 20; i++){
    vec3 p = ro + rd*(float(i) + 0.5)*ds;
    float h = length(p) - Re;
    float dR = exp(-h/HR)*ds, dM = exp(-h/HM)*ds;
    oR += dR; oM += dM;
    if (rs(p, sd, Re).x > 0.0) continue;
    float dl = rs(p, sd, Ra).y/8.0; float lR = 0.0, lM = 0.0;
    for (int j = 0; j < 8; j++){ vec3 q = p + sd*(float(j) + 0.5)*dl; float hq = length(q) - Re; lR += exp(-hq/HR)*dl; lM += exp(-hq/HM)*dl; }
    vec3 att = exp(-(BR*(oR + lR) + BM*1.1*(oM + lM)));
    sR += dR*att; sM += dM*att;
  }
  return 20.0*(pR*BR*sR + pM*BM*sM*uHaze) + vec3(0.0004, 0.0008, 0.0016);
}`;

// Taban: yalnız atmosfer (güneş değişince pişer)
const BASE_FS = GLSL_COMMON + /* glsl */ `
uniform float uHaze; uniform vec2 uRes; uniform vec3 uSunDir;
` + ATMO_GLSL + /* glsl */ `
out vec4 oColor;
void main(){
  vec3 d = eqDir(gl_FragCoord.xy/uRes);
  d.y = max(d.y, 0.0015);
  oColor = vec4(atmo(normalize(d), uSunDir), 1.0);
}`;
// Yansıma: taban + bulut (her kare, küçük); su, ortam ışığı ve ufuk altı için
const REFL_FS = GLSL_COMMON + /* glsl */ `
uniform sampler2D uBase; uniform vec2 uRes;
` + CLOUDS_GLSL + /* glsl */ `
out vec4 oColor;
void main(){
  vec3 d = eqDir(gl_FragCoord.xy/uRes);
  vec3 base = textureLod(uBase, eqUV(vec3(d.x, max(d.y, 0.0), d.z)), 0.0).rgb;
  vec3 amb = textureLod(uBase, vec2(0.5, 0.97), 0.0).rgb;
  vec3 c = clouds(d, base, amb).rgb;
  if (d.y < 0.0) c = mix(c, amb*0.35, smoothstep(0.0, -0.25, d.y));
  oColor = vec4(c, 1.0);
}`;

// Arka plan: pişmiş taban + piksel başına bulut, güneş diski, yıldızlar
const BG_VS = /* glsl */ `
out vec2 vNdc;
void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.99999, 1.0); }`;
const BG_FS = GLSL_COMMON + /* glsl */ `
uniform sampler2D uBase; uniform mat4 uProjInv, uCamWorld; uniform float uNight, uGroundY;
` + CLOUDS_GLSL + /* glsl */ `
in vec2 vNdc; out vec4 oColor;
void main(){
  vec4 v = uProjInv*vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize((uCamWorld*vec4(v.xyz/v.w, 0.0)).xyz);
  vec3 base = textureLod(uBase, eqUV(vec3(d.x, max(d.y, 0.0), d.z)), 0.0).rgb;
  float cd = dot(d, uSunDir), above = step(0.0, d.y + 0.003);
  base += uSunCol*(smoothstep(0.99993, 0.99997, cd)*40.0 + pow(max(cd, 0.0), 900.0)*1.5)*above;
  // Yıldızlar: gece artar, bulut örter
  if (uNight > 0.01 && d.y > 0.0){
    vec2 g = eqUV(d)*vec2(2400.0, 1200.0); vec2 gi = floor(g);
    float h = hash21(gi);
    float star = step(0.9965, h)*smoothstep(0.5, 0.0, length(fract(g) - 0.5))*(0.5 + 2.5*hash21(gi + 7.0));
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.55, 0.78)))*3.0, 2.0));   // Samanyolu
    base += uNight*(vec3(0.9, 0.95, 1.0)*star*0.6 + vec3(0.012, 0.013, 0.02)*band*fbm(d.xz*9.0/(d.y + 0.3), 5));
  }
  vec3 amb = textureLod(uBase, vec2(0.5, 0.97), 0.0).rgb;
  vec3 c = clouds(d, base, amb).rgb;
  if (d.y < 0.0) c = mix(c, amb*0.35, smoothstep(0.0, -0.25, d.y));
  oColor = vec4(c, 1.0);
}`;

// Hava perspektifi: Three.js'in sis parçası küresel olarak değiştirilir (yalnız fiziksel gökyüzü kullanan sayfada).
// Taşıyıcı THREE.FogExp2: fogColor = ufuk rengi, fogDensity = 1 / görüş mesafesi (dünya birimi). Işıklı malzemelerde
// güneş yönünde saçılma (inscatter) eklenir; uzaklık üstel (fiziksel) söner.
let aerialInstalled = false;
function installAerial() {
  if (aerialInstalled) return;
  aerialInstalled = true;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * vFogDepth );
    vec3 aerialCol = fogColor;
    #if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )
    #if NUM_DIR_LIGHTS > 0
      {
        vec3 vdir = normalize( - vViewPosition );
        float mu = max( dot( vdir, directionalLights[ 0 ].direction ), 0.0 );
        aerialCol += directionalLights[ 0 ].color * ( 1.0 / PI ) * ( pow( mu, 8.0 ) * 0.22 + pow( mu, 64.0 ) * 0.3 );
      }
    #endif
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, aerialCol, fogFactor );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
#endif`;
}

/** CPU tarafı: bir yöndeki atmosfer geçirgenliği (güneş ışığının rengi). */
function transmittance(sd) {
  const ro = [0, RE + 2, 0];
  const b = ro[1] * sd[1], c = ro[1] * ro[1] - RA * RA;
  const t = -b + Math.sqrt(b * b - c);
  const n = 48, ds = t / n;
  let oR = 0, oM = 0;
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * ds;
    const p = [sd[0] * s, ro[1] + sd[1] * s, sd[2] * s];
    const h = Math.hypot(p[0], p[1], p[2]) - RE;
    if (h < 0) return [0, 0, 0];
    oR += Math.exp(-h / HR) * ds; oM += Math.exp(-h / HM) * ds;
  }
  return BR.map((br) => Math.exp(-(br * oR + BM * 1.1 * oM)));
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {{elevation?:number, azimuth?:number, clouds?:number, haze?:number, wind?:number[]}} o
 *        açılar derece (azimut 0 = kuzey/−z, 90 = doğu/+x); wind: bulut sürüklenmesi [vx, vz] m/sn
 */
export function createSky(renderer, scene, o = {}) {
  const st = { elevation: 25, azimuth: 210, clouds: 0.3, haze: 1, wind: [6, 3], visibility: 0, ...o };
  // visibility (dünya birimi): hava perspektifi mesafesi; 0 → kapalı
  installAerial();
  const fog = new THREE.FogExp2(0x8899aa, 0);
  if (st.visibility > 0) { scene.fog = fog; fog.density = 1 / st.visibility; }
  const horizon = new THREE.Color();
  const eq = (w, h, mips) => {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, generateMipmaps: mips,
      minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    });
    rt.texture.mapping = THREE.EquirectangularReflectionMapping;
    rt.texture.wrapS = THREE.RepeatWrapping;
    return rt;
  };
  const baseRT = eq(512, 256, true), reflRT = eq(256, 128, true);

  const sunDir = new THREE.Vector3(), sunCol = new THREE.Color(), ambient = new THREE.Color();
  const shared = {
    uSunDir: { value: sunDir }, uSunCol: { value: new THREE.Vector3() }, uCloud: { value: st.clouds },
    uTime: { value: 0 }, uCloudV: { value: new THREE.Vector2() },
  };
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const pass = (fs, uniforms) => {
    const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BG_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    const sc = new THREE.Scene(), me = new THREE.Mesh(tri, m);
    me.frustumCulled = false; sc.add(me);
    return { m, sc };
  };
  const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const basePass = pass(BASE_FS, { uSunDir: shared.uSunDir, uHaze: { value: st.haze }, uRes: { value: new THREE.Vector2(512, 256) } });
  const reflPass = pass(REFL_FS, { ...shared, uBase: { value: baseRT.texture }, uRes: { value: new THREE.Vector2(256, 128) } });

  const bgMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: BG_VS, fragmentShader: BG_FS, depthTest: false, depthWrite: false, fog: false,
    uniforms: {
      ...shared, uBase: { value: baseRT.texture }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uNight: { value: 0 },
    },
  });
  const bg = new THREE.Mesh(tri, bgMat);
  bg.frustumCulled = false; bg.renderOrder = -1e9; bg.raycast = () => {}; bg.name = 'gfx:sky';
  bg.userData.noShadow = true;
  scene.add(bg);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, baseDirty = true, envDirty = true, lastEnv = -1e9;

  const D2R = Math.PI / 180;
  function recompute() {
    const el = st.elevation * D2R, az = st.azimuth * D2R;
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    // Güneş ışığı: atmosfer geçirgenliği × bulut örtüsü (Açık Deniz ölçeği: öğlen ≈ 2,6)
    const tr = transmittance([sunDir.x, Math.max(sunDir.y, 0.002), sunDir.z]);
    const fade = THREE.MathUtils.clamp((st.elevation + 1.5) / 3, 0, 1);
    const cl = 1 - 0.78 * Math.pow(st.clouds, 1.5);
    const k = 2.6 * fade * cl;
    sunCol.setRGB(tr[0] * k, tr[1] * k, tr[2] * k);
    shared.uSunCol.value.set(sunCol.r, sunCol.g, sunCol.b);
    shared.uCloud.value = st.clouds;
    shared.uCloudV.value.set(st.wind[0], st.wind[1]);
    basePass.m.uniforms.uHaze.value = st.haze;
    bgMat.uniforms.uNight.value = THREE.MathUtils.smoothstep(-sunDir.y, -0.02, 0.18);
    baseDirty = envDirty = true;
  }
  recompute();

  function draw(p, rt) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(p.sc, cam2);
    renderer.setRenderTarget(prev);
  }
  function bakeEnv() {
    if (envRT) envRT.dispose();
    envRT = pmrem.fromEquirectangular(reflRT.texture);
    scene.environment = envRT.texture;
    const px = new Uint16Array(4);
    try {
      renderer.readRenderTargetPixels(baseRT, 256, 250, 1, 1, px);
      const f = THREE.DataUtils.fromHalfFloat;
      ambient.setRGB(f(px[0]), f(px[1]), f(px[2]));
      // Ufuk rengi: güneşin tersi ve yanları ortalaması (sis/hava perspektifi tabanı)
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < 8; i++) {
        renderer.readRenderTargetPixels(baseRT, (i * 64 + 32) % 512, 129, 1, 1, px);
        r += f(px[0]); g += f(px[1]); b += f(px[2]);
      }
      horizon.setRGB(r / 8, g / 8, b / 8);
      fog.color.copy(horizon);
    } catch { ambient.setRGB(0.1, 0.16, 0.3); horizon.setRGB(0.5, 0.6, 0.7); fog.color.copy(horizon); }
    envDirty = false;
  }

  return {
    mesh: bg, sunDir, sunColor: sunCol, ambient, texture: reflRT.texture, uniforms: shared,
    get night() { return bgMat.uniforms.uNight.value; },
    horizon, fog,
    /** Durumu değiştir: { elevation, azimuth, clouds, haze, wind } */
    set(p) {
      Object.assign(st, p);
      if ('visibility' in p) { scene.fog = st.visibility > 0 ? fog : null; fog.density = st.visibility > 0 ? 1 / st.visibility : 0; }
      recompute();
    },
    get state() { return { ...st }; },
    /** Pozlama (Açık Deniz'den): alçak güneşte ve bulutta açılır. */
    exposure() {
      const se = Math.sin(Math.max(st.elevation, 0) * D2R);
      let e = 1.0 / (0.22 + 0.95 * Math.sqrt(se));
      if (st.elevation < 0) e *= 1 + -st.elevation * 0.35;
      return e * (1 + 0.35 * st.clouds);
    },
    /** Her kare: gökyüzü ve bulut yansıması; ortam ışığı güneş/bulut değişince (≤ 1/sn) yenilenir. */
    update(camera, time) {
      shared.uTime.value = time;
      bgMat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
      bgMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
      if (baseDirty) { draw(basePass, baseRT); baseDirty = false; }
      draw(reflPass, reflRT);
      const now = performance.now();
      if (envDirty && now - lastEnv > 1000) { lastEnv = now; bakeEnv(); }
    },
    dispose() { baseRT.dispose(); reflRT.dispose(); envRT?.dispose(); pmrem.dispose(); bgMat.dispose(); scene.remove(bg); },
  };
}
