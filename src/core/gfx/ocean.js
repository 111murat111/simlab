// FFT okyanus (Açık Deniz'den): JONSWAP spektrumu + Mitsuyasu yayılımı, 3 kademe, Stockham FFT, Jacobian köpüğü.
// Eklenenler: uzun dalga girişi (tsunami/gelgit yükseklik haritası), derinlik haritası (sığlık rengi, kıyı köpüğü,
// dalga sönümü), herhangi bir dünya ölçeğine yerleştirme. Okyanus metre cinsinden çalışır; mesh.scale dünya/metre.
import * as THREE from 'three';
import { GLSL_COMMON } from './glsl.js';

const G = 9.81;
const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
const LOOP_T = 200;

function spectrumParams(U, fetchKm) {
  const F = fetchKm * 1000;
  let wp = 22 * Math.pow(G * G / (U * F), 1 / 3);
  wp = Math.max(wp, 0.855 * G / U);
  return { wp, alpha: 0.076 * Math.pow(U * U / (F * G), 0.22) };
}
function jonswap(w, wp, alpha) {
  const sigma = w <= wp ? 0.07 : 0.09;
  const r = Math.exp(-((w - wp) ** 2) / (2 * sigma * sigma * wp * wp));
  return alpha * G * G / w ** 5 * Math.exp(-1.25 * (wp / w) ** 4) * Math.pow(3.3, r);
}
/** Anlamlı dalga yüksekliği Hs (m) ve tepe periyodu Tp (sn). */
export function seaState(wind, fetchKm, L0 = 600) {
  const { wp, alpha } = spectrumParams(wind, fetchKm);
  const w0 = Math.sqrt(G * 2 * Math.PI / L0), w1 = 25;
  let m0 = 0; const n = 3000, dw = (w1 - w0) / n;
  for (let i = 0; i < n; i++) m0 += jonswap(w0 + (i + 0.5) * dw, wp, alpha) * dw;
  return { Hs: 4 * Math.sqrt(m0), Tp: 2 * Math.PI / wp };
}

const FS_VS = /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FS_INIT = GLSL_COMMON + /* glsl */ `
uniform sampler2D uNoise; uniform float uN, uL, uKmin, uKmax, uWp, uAlpha, uU, uWindAng;
out vec4 o;
const float Gc = 9.81;
float jonswap(float w){
  float sg = w <= uWp ? 0.07 : 0.09;
  float r = exp(-(w - uWp)*(w - uWp)/(2.0*sg*sg*uWp*uWp));
  return uAlpha*Gc*Gc/pow(w, 5.0)*exp(-1.25*pow(uWp/w, 4.0))*pow(3.3, r);
}
float spread(float th, float w){
  float sp = clamp(11.5*pow(Gc/(uWp*uU), 2.5), 2.0, 30.0);
  float s = w <= uWp ? sp*pow(w/uWp, 5.0) : sp*pow(w/uWp, -2.5);
  s = clamp(s, 0.4, 30.0);
  float nrm = sqrt(s/PI)*0.5*(1.0 + 1.0/(8.0*s));
  return nrm*pow(abs(cos(th*0.5)), 2.0*s);
}
float amp(vec2 k){
  float kl = length(k);
  if (kl < uKmin || kl >= uKmax) return 0.0;
  float w = sqrt(Gc*kl);
  float dwdk = Gc/(2.0*w);
  float th = atan(k.y, k.x) - uWindAng;
  float Sk = jonswap(w)*spread(th, w)*dwdk/kl;
  Sk *= exp(-kl*kl*2.5e-5);
  float dk = 2.0*PI/uL;
  return 0.5*sqrt(Sk)*dk;
}
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  int n = int(uN);
  vec2 m = vec2(c); m -= uN*step(uN*0.5, m);
  vec2 k = m*2.0*PI/uL;
  ivec2 cm = (ivec2(n) - c) % ivec2(n);
  vec2 h0 = texelFetch(uNoise, c, 0).xy*amp(k);
  vec2 h0m = texelFetch(uNoise, cm, 0).xy*amp(-k);
  o = vec4(h0, h0m.x, -h0m.y);
}`;

const FS_TIME = GLSL_COMMON + /* glsl */ `
uniform sampler2D uH0; uniform float uN, uL, uT, uW0;
layout(location = 0) out vec4 oA; layout(location = 1) out vec4 oB;
vec2 I(vec2 v){ return vec2(-v.y, v.x); }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 m = vec2(c); m -= uN*step(uN*0.5, m);
  vec2 k = m*2.0*PI/uL;
  float kl = length(k);
  if (kl < 1e-6){ oA = vec4(0.0); oB = vec4(0.0); return; }
  float w = floor(sqrt(9.81*kl)/uW0)*uW0;
  vec4 h0 = texelFetch(uH0, c, 0);
  float ph = w*uT;
  vec2 e = vec2(cos(ph), sin(ph));
  vec2 h = cmul(h0.xy, vec2(e.x, -e.y)) + cmul(h0.zw, e);
  vec2 ih = I(h);
  vec2 Dx = -k.x/kl*ih, Dz = -k.y/kl*ih;
  vec2 Dydx = k.x*ih, Dydz = k.y*ih;
  vec2 Dxdx = k.x*k.x/kl*h, Dzdz = k.y*k.y/kl*h, Dxdz = k.x*k.y/kl*h;
  oA = vec4(Dx + I(h), Dz + I(Dxdz));
  oB = vec4(Dydx + I(Dydz), Dxdx + I(Dzdz));
}`;

const FS_FFT = GLSL_COMMON + /* glsl */ `
uniform sampler2D uA, uB; uniform float uN, uSub; uniform int uHoriz;
layout(location = 0) out vec4 oA; layout(location = 1) out vec4 oB;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  float idx = uHoriz == 1 ? float(c.x) : float(c.y);
  float hs = uSub*0.5;
  float ev = floor(idx/uSub)*hs + mod(idx, hs);
  int ie = int(ev), io = int(ev + uN*0.5);
  ivec2 ce = uHoriz == 1 ? ivec2(ie, c.y) : ivec2(c.x, ie);
  ivec2 co = uHoriz == 1 ? ivec2(io, c.y) : ivec2(c.x, io);
  float ang = 2.0*PI*idx/uSub;
  vec2 tw = vec2(cos(ang), sin(ang));
  vec4 ea = texelFetch(uA, ce, 0), oa = texelFetch(uA, co, 0);
  vec4 eb = texelFetch(uB, ce, 0), ob = texelFetch(uB, co, 0);
  oA = vec4(ea.xy + cmul(tw, oa.xy), ea.zw + cmul(tw, oa.zw));
  oB = vec4(eb.xy + cmul(tw, ob.xy), eb.zw + cmul(tw, ob.zw));
}`;

const FS_FINAL = /* glsl */ `
uniform sampler2D uA, uB, uPrev; uniform float uLambda, uDt, uFoamBias, uFoamDecay;
layout(location = 0) out vec4 oDisp; layout(location = 1) out vec4 oDeriv;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uA, c, 0), b = texelFetch(uB, c, 0);
  float l = uLambda;
  float jxx = 1.0 + l*b.z, jzz = 1.0 + l*b.w, jxz = l*a.w;
  float J = jxx*jzz - jxz*jxz;
  float foam = texelFetch(uPrev, c, 0).w*exp(-uFoamDecay*uDt);
  foam = max(foam, clamp((uFoamBias - J)*1.6, 0.0, 1.0));
  oDisp = vec4(l*a.x, a.y, l*a.z, foam);
  oDeriv = vec4(b.x, b.y, l*b.z, l*b.w);
}`;

// Ortak: uzun dalga ve derinlik haritaları (metre, okyanus yerel xz'si üzerinde bir dikdörtgen)
const MAPS = /* glsl */ `
uniform sampler2D uLong, uDepth; uniform vec4 uLongRect, uDepthRect; uniform float uLongOn, uDepthOn;
vec2 rectUV(vec2 p, vec4 r){ return (p - r.xy)/(r.zw - r.xy); }
float longH(vec2 p){ return uLongOn > 0.5 ? textureLod(uLong, rectUV(p, uLongRect), 0.0).r : 0.0; }
float depthAt(vec2 p){ return uDepthOn > 0.5 ? textureLod(uDepth, rectUV(p, uDepthRect), 0.0).r : 1e4; }
`;

const VS_OCEAN = MAPS + /* glsl */ `
uniform float uR, uDu, uN; uniform vec3 uL; uniform vec2 uCenter;
uniform sampler2D uD0, uD1, uD2;
out vec3 vPos; out vec3 vWorld; out float vAtt;
float mapc(float u){ float a = abs(u); return sign(u)*(64.0*a + (uR - 64.0)*a*a*a*a); }
float spc(float u){ float a = abs(u); return (64.0 + 4.0*(uR - 64.0)*a*a*a)*uDu; }
void main(){
  vec2 p = vec2(mapc(position.x), mapc(position.y)) + uCenter;
  float sp = max(spc(position.x), spc(position.y));
  vec3 d = textureLod(uD0, p/uL.x, max(0.0, log2(sp*uN/uL.x))).xyz
         + textureLod(uD1, p/uL.y, max(0.0, log2(sp*uN/uL.y))).xyz
         + textureLod(uD2, p/uL.z, max(0.0, log2(sp*uN/uL.z))).xyz;
  // Sığ suda rüzgâr dalgaları söner (kırılma bölgesi ~ derinlik < 6 m)
  float att = smoothstep(0.0, 6.0, depthAt(p));
  vAtt = att;
  vPos = vec3(p.x, longH(p), p.y) + d*att;
  vec4 w = modelMatrix*vec4(vPos, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;

const FS_OCEAN = GLSL_COMMON + MAPS + /* glsl */ `
in vec3 vPos; in vec3 vWorld; in float vAtt;
out vec4 oColor;
uniform sampler2D uV0, uV1, uV2, uD0, uD1, uD2, uSky;
uniform vec3 uL, uSunDir, uSunCol, uDeep, uSss, uSand; uniform float uHs, uTime, uScale, uFogDist;
vec3 skyL(vec3 d, float lod){ return textureLod(uSky, eqUV(d), lod).rgb; }
void main(){
  vec2 u0 = vPos.xz/uL.x, u1 = vPos.xz/uL.y, u2 = vPos.xz/uL.z;
  vec4 s = (texture(uV0, u0) + texture(uV1, u1) + texture(uV2, u2))*vAtt;
  vec2 slope = s.xy/max(vec2(0.2), 1.0 + s.zw);
  // Uzun dalga eğimi (tsunami cephesi) — sonlu farkla
  float longSlope = 0.0;
  if (uLongOn > 0.5){
    vec2 e = (uLongRect.zw - uLongRect.xy)/vec2(textureSize(uLong, 0));
    float hx = longH(vPos.xz + vec2(e.x, 0.0)) - longH(vPos.xz - vec2(e.x, 0.0));
    float hz = longH(vPos.xz + vec2(0.0, e.y)) - longH(vPos.xz - vec2(0.0, e.y));
    vec2 ls = vec2(hx/(2.0*e.x), hz/(2.0*e.y));
    slope += ls; longSlope = length(ls);
  }
  vec3 V = cameraPosition - vWorld; float dist = length(V)/uScale; V = normalize(V);
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  float nv0 = dot(N, V);
  if (nv0 < 0.03) N = normalize(N + V*(0.03 - nv0));
  float NV = max(dot(N, V), 0.02);
  vec3 L = uSunDir;
  float rough = 0.05 + 0.22*smoothstep(20.0, 5000.0, dist);

  vec3 R = reflect(-V, N); R.y = max(R.y, 0.004); R = normalize(R);
  float F = 0.02 + 0.98*pow(1.0 - NV, 5.0);
  vec3 refl = skyL(R, 0.5 + rough*10.0);

  vec3 H = normalize(L + V);
  float NH = max(dot(N, H), 0.0), NL = max(dot(N, L), 0.0);
  float a2 = rough*rough;
  float dd = NH*NH*(a2 - 1.0) + 1.0;
  float D = a2/(PI*dd*dd);
  float kk = rough*0.5;
  float Gs = NL/(NL*(1.0 - kk) + kk)*NV/(NV*(1.0 - kk) + kk);
  float Fh = 0.02 + 0.98*pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 spec = uSunCol*D*Gs*Fh/(4.0*NV)*step(0.0, L.y);

  vec3 amb = skyL(vec3(0.0, 1.0, 0.0), 6.0);
  float hN = clamp((vPos.y - longH(vPos.xz))/(uHs*0.5 + 0.2), 0.0, 2.0);
  vec2 lh = normalize(L.xz + 1e-4), vh = normalize(-V.xz + 1e-4);
  float back = pow(max(dot(lh, vh), 0.0), 4.0)*pow(max(0.5 - 0.5*dot(L, N), 0.0), 3.0);
  vec3 body = uDeep*(amb*2.2 + uSunCol*max(L.y, 0.0)*0.7)
            + uSss*uSunCol*(hN*back*2.4 + 0.05*hN*NV*NV) + uSss*amb*0.06*hN;

  // Sığlık: taban görünür, turkuaz geçiş (Beer–Lambert, bakış yolu boyunca)
  float depth = depthAt(vPos.xz);
  float shore = 0.0;
  if (uDepthOn > 0.5){
    if (depth < -1.5) discard;   // kara: su yüzeyi yok (arazi zaten örter, taşan kenar kalmasın)
    float path = max(depth, 0.0)/max(NV, 0.15);
    vec3 ext = exp(-path*vec3(0.45, 0.09, 0.07));
    vec3 bed = uSand*(amb*1.4 + uSunCol*max(L.y, 0.0)*0.9)*ext;
    vec3 shallowCol = uSss*(amb*1.6 + uSunCol*max(L.y, 0.0))*0.35*(1.0 - ext.g);
    body = mix(body, bed + shallowCol, exp(-max(depth, 0.0)*0.12));
    shore = (1.0 - smoothstep(0.2, 1.6, depth))*smoothstep(-1.5, -0.2, depth);
  }
  vec3 col = mix(body, refl, F) + spec;

  float fa = texture(uD0, u0).w + texture(uD1, u1).w*0.7 + texture(uD2, u2).w*0.35;
  fa *= vAtt;
  float pat = fbm(vPos.xz*0.8 + vec2(uTime*0.04, 0.0), 3);
  float patN = mix(pat, 0.5, smoothstep(40.0, 400.0, dist));
  float foam = smoothstep(0.3, 1.0, fa*(0.5 + patN));
  // Kıyı köpüğü (çalkantı hattı) ve kırılan uzun dalga cephesi
  float swash = fbm(vPos.xz*0.35 + vec2(uTime*0.25, uTime*0.1), 4);
  foam = max(foam, shore*smoothstep(0.35, 0.7, swash + shore*0.3));
  foam = max(foam, smoothstep(0.006, 0.03, longSlope)*smoothstep(0.35, 0.65, pat));
  vec3 foamC = vec3(0.86, 0.9, 0.92)*(amb*1.3 + uSunCol*(0.3 + 0.7*NL)*smoothstep(-0.05, 0.1, L.y));
  col = mix(col, foamC, clamp(foam, 0.0, 1.0));

  vec3 fogC = skyL(normalize(vec3(-V.x, 0.02, -V.z)), 3.0);
  col = mix(col, fogC, 1.0 - exp(-dist/uFogDist));
  oColor = vec4(col, 1.0);
}`;

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} sky   createSky() sonucu (yansıma dokusu, güneş)
 * @param {object} [o]
 *   wind (m/sn), windDir (derece, rüzgârın geldiği yön), fetch (km), chop (0–1.5), foam (0–1)
 *   scale: dünya birimi / metre (varsayılan 1), radius: ızgara yarıçapı (m), fogDist (m)
 *   deep, sss, sand: renkler (doğrusal)
 */
export function createOcean(renderer, sky, o = {}) {
  const S = { wind: 9, windDir: 225, fetch: 150, chop: 0.85, foam: 0.5, scale: 1, radius: 15000, fogDist: 6500, ...o };
  const N = LOW ? 128 : 256, LOGN = Math.log2(N), GRID = LOW ? 320 : 512;
  const CASCADES = [{ L: 600 }, { L: 97 }, { L: 17 }];
  CASCADES[0].kmin = 1e-4; CASCADES[0].kmax = 6 * 2 * Math.PI / CASCADES[1].L;
  CASCADES[1].kmin = CASCADES[0].kmax; CASCADES[1].kmax = 6 * 2 * Math.PI / CASCADES[2].L;
  CASCADES[2].kmin = CASCADES[1].kmax; CASCADES[2].kmax = 1e9;

  const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false, generateMipmaps: false };
  const fullRT = (count) => new THREE.WebGLRenderTarget(N, N, { ...nearest, type: THREE.FloatType, count });
  CASCADES.forEach((c, ci) => {
    const r = rng(1337 + ci * 7919);
    const data = new Float32Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const u1 = Math.max(r(), 1e-7), u2 = r(), rad = Math.sqrt(-2 * Math.log(u1));
      data[i * 4] = rad * Math.cos(2 * Math.PI * u2);
      data[i * 4 + 1] = rad * Math.sin(2 * Math.PI * u2);
    }
    c.noise = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
    Object.assign(c.noise, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, needsUpdate: true });
    c.h0 = fullRT(1);
    c.fin = [0, 1].map(() => {
      const rt = new THREE.WebGLRenderTarget(N, N, {
        type: THREE.HalfFloatType, count: 2, depthBuffer: false, generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      });
      rt.textures.forEach((t) => { t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); });
      return rt;
    });
    c.cur = 0;
  });
  const pp = [fullRT(2), fullRT(2)];

  // Tam ekran geçişleri
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(tri); quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mk = (fs, uniforms) => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: FS_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  const u = (v) => ({ value: v });
  const mInit = mk(FS_INIT, { uNoise: u(null), uN: u(N), uL: u(0), uKmin: u(0), uKmax: u(0), uWp: u(0), uAlpha: u(0), uU: u(0), uWindAng: u(0) });
  const mTime = mk(FS_TIME, { uH0: u(null), uN: u(N), uL: u(0), uT: u(0), uW0: u(2 * Math.PI / LOOP_T) });
  const mFFT = mk(FS_FFT, { uA: u(null), uB: u(null), uN: u(N), uSub: u(2), uHoriz: u(1) });
  const mFin = mk(FS_FINAL, { uA: u(null), uB: u(null), uPrev: u(null), uLambda: u(0), uDt: u(0), uFoamBias: u(0), uFoamDecay: u(0.45) });
  function run(mat, rt) { quad.material = mat; renderer.setRenderTarget(rt); renderer.render(qScene, qCam); }

  // Okyanus ızgarası: merkezde sık (≈0,25 m), uzakta seyrek
  const g = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(GRID * GRID * 3);
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const k = (j * GRID + i) * 3;
      pos[k] = i / (GRID - 1) * 2 - 1; pos[k + 1] = j / (GRID - 1) * 2 - 1;
    }
    const idx = new Uint32Array((GRID - 1) * (GRID - 1) * 6);
    let k = 0;
    for (let j = 0; j < GRID - 1; j++) for (let i = 0; i < GRID - 1; i++) {
      const a = j * GRID + i, b = a + 1, c = a + GRID, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const dummy = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType); dummy.needsUpdate = true;
  const U = {
    uR: u(S.radius), uDu: u(2 / (GRID - 1)), uN: u(N), uL: u(new THREE.Vector3(...CASCADES.map((c) => c.L))), uCenter: u(new THREE.Vector2()),
    uD0: u(null), uD1: u(null), uD2: u(null), uV0: u(null), uV1: u(null), uV2: u(null), uSky: u(sky.texture),
    uSunDir: sky.uniforms.uSunDir, uSunCol: sky.uniforms.uSunCol, uHs: u(1.5), uTime: u(0), uScale: u(S.scale), uFogDist: u(S.fogDist),
    uDeep: u(new THREE.Color(0.004, 0.024, 0.038)), uSss: u(new THREE.Color(0.03, 0.30, 0.25)), uSand: u(new THREE.Color(0.55, 0.47, 0.33)),
    uLong: u(dummy), uDepth: u(dummy), uLongRect: u(new THREE.Vector4(0, 0, 1, 1)), uDepthRect: u(new THREE.Vector4(0, 0, 1, 1)), uLongOn: u(0), uDepthOn: u(0),
  };
  const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS_OCEAN, fragmentShader: FS_OCEAN, uniforms: U });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.name = 'gfx:ocean'; mesh.userData.noShadow = true;
  mesh.scale.setScalar(S.scale);
  if (o.deep) U.uDeep.value.set(o.deep);
  if (o.sss) U.uSss.value.set(o.sss);
  if (o.sand) U.uSand.value.set(o.sand);

  let specDirty = true, t = 12, hs = 1.5, tp = 6;
  function buildSpectrum() {
    const { wp, alpha } = spectrumParams(S.wind, S.fetch);
    const th = S.windDir * Math.PI / 180;
    const windAng = Math.atan2(Math.cos(th), -Math.sin(th));
    Object.assign(mInit.uniforms, {});
    for (const c of CASCADES) {
      const q = mInit.uniforms;
      q.uNoise.value = c.noise; q.uL.value = c.L; q.uKmin.value = c.kmin; q.uKmax.value = c.kmax;
      q.uWp.value = wp; q.uAlpha.value = alpha; q.uU.value = S.wind; q.uWindAng.value = windAng;
      run(mInit, c.h0);
    }
    ({ Hs: hs, Tp: tp } = seaState(S.wind, S.fetch));
    U.uHs.value = hs;
  }
  function simulate(dt) {
    for (const c of CASCADES) {
      mTime.uniforms.uH0.value = c.h0.texture; mTime.uniforms.uL.value = c.L; mTime.uniforms.uT.value = t;
      run(mTime, pp[0]);
      let src = 0;
      for (const horiz of [1, 0]) {
        mFFT.uniforms.uHoriz.value = horiz;
        for (let s = 1; s <= LOGN; s++) {
          mFFT.uniforms.uA.value = pp[src].textures[0]; mFFT.uniforms.uB.value = pp[src].textures[1];
          mFFT.uniforms.uSub.value = 1 << s;
          run(mFFT, pp[1 - src]);
          src = 1 - src;
        }
      }
      const next = 1 - c.cur;
      Object.assign(mFin.uniforms.uA, { value: pp[src].textures[0] });
      mFin.uniforms.uB.value = pp[src].textures[1];
      mFin.uniforms.uPrev.value = c.fin[c.cur].textures[0];
      mFin.uniforms.uLambda.value = -S.chop; mFin.uniforms.uDt.value = dt;
      mFin.uniforms.uFoamBias.value = 0.35 + 0.75 * S.foam;
      run(mFin, c.fin[next]);
      c.cur = next;
    }
    [U.uD0, U.uD1, U.uD2].forEach((x, i) => { x.value = CASCADES[i].fin[CASCADES[i].cur].textures[0]; });
    [U.uV0, U.uV1, U.uV2].forEach((x, i) => { x.value = CASCADES[i].fin[CASCADES[i].cur].textures[1]; });
  }

  const inv = new THREE.Matrix4(), camLocal = new THREE.Vector3();
  return {
    mesh, uniforms: U,
    get seaState() { return { Hs: hs, Tp: tp }; },
    /** { wind, windDir, fetch, chop, foam } */
    set(p) {
      const spec = ['wind', 'windDir', 'fetch'].some((k) => k in p && p[k] !== S[k]);
      Object.assign(S, p);
      if ('scale' in p) { mesh.scale.setScalar(S.scale); U.uScale.value = S.scale; }
      if (spec) specDirty = true;
    },
    get state() { return { ...S }; },
    /** Uzun dalga yükseklik haritası (R kanalı = m). rect: [x0, z0, x1, z1] okyanus metresi. null → kapalı */
    setLongWave(tex, rect) { U.uLong.value = tex || dummy; U.uLongOn.value = tex ? 1 : 0; if (rect) U.uLongRect.value.set(...rect); },
    /** Derinlik haritası (R = su derinliği m, karada ≤ 0). */
    setDepth(tex, rect) { U.uDepth.value = tex || dummy; U.uDepthOn.value = tex ? 1 : 0; if (rect) U.uDepthRect.value.set(...rect); },
    /** Her kare çağır (dt: simülasyon saniyesi). */
    update(dt, camera) {
      const prev = renderer.getRenderTarget();
      if (specDirty) { buildSpectrum(); specDirty = false; }
      t = (t + dt) % LOOP_T;
      simulate(Math.max(dt, 1e-4));
      renderer.setRenderTarget(prev);
      U.uTime.value = t;
      // Izgara kamerayı izler (en sık hücre adımına yuvarlanmış), dalgalar dünyaya sabit kalır
      mesh.updateMatrixWorld();
      camLocal.copy(camera.position).applyMatrix4(inv.copy(mesh.matrixWorld).invert());
      const q = 64 * U.uDu.value * 4;
      U.uCenter.value.set(Math.round(camLocal.x / q) * q, Math.round(camLocal.z / q) * q);
    },
  };
}
