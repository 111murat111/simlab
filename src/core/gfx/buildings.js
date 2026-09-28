// Binalar: gerçek geometrili cepheler (girintili pencere + söve, doğrama, denizlik, iç mekânı görünen yansıtıcı cam, perde),
// kat silmeleri, korniş, balkon (dolu / demir korkuluk / cam balkon), dükkân katı (vitrin, tente, tabela, kepenk), giriş
// kapıları; arketipler: Türk apartmanı, eski ev, ofis kulesi, klasik kamu binası, sanayi yapısı. Çatılar: kırma / beşik
// (kiremit, saçak, mahya) ya da düz (parapet, su deposu, güneş kolektörü, anten, çanak, merdiven kovası).
// Performans: bina parçaları malzeme başına tek geometride birleşir, tekrarlanan parçalar (doğrama, cam, korkuluk, tente,
// klima, çatı donanımı) örneklenir; kent karolara bölünür, uzaktaki karolar tek çizimli "kabuk" (pencere ızgaralı
// gölgelendirici) olarak çizilir, yakına gelince ayrıntılı geometri tembel üretilir.
// Birimler metre. Harici doku yok: tüm yüzeyler procedural() ile üretilir.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { procedural, mat } from './materials.js';
import { NOISE3_GLSL } from './terrain.js';

const LOWQ = typeof location !== 'undefined' && /[?&]low\b/.test(location.search);
/** mulberry32 */
export function cityRng(seed = 1) {
  let a = (Math.floor(seed * 9973) + 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickR = (r, a) => a[Math.floor(r() * a.length) % a.length];
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// ============================================================================ Renk paletleri (Türkiye kent dokusu)
export const PALETTES = {
  plaster: [0xe9dfcc, 0xe4d3b4, 0xf0e8da, 0xd9c7a8, 0xe8cfb0, 0xd6dccd, 0xcfd3d2, 0xf1ece2, 0xe3c79c, 0xd9b39b, 0xc8d3d6, 0xe6d8c0, 0xd8c4b4],
  house: [0xd9b77f, 0xe5d6bd, 0xc98f74, 0xe9e1d0, 0xb9c4c1, 0xd7a98a, 0xc7b48f, 0xe2cfa7],
  band: [0xf4f1ea, 0xe8e4dc, 0xd2cdc3, 0xb9b2a6, 0xa8836a, 0x8e9aa0],
  tile: [0xb4583a, 0xa94f33, 0xc0663f, 0x9a4a35, 0x8f4631, 0xb86a48],
  spandrel: [0x27313a, 0x33404a, 0x1d262d, 0x444d55, 0x3a4a52],
  frame: [0xf3f3f0, 0xf3f3f0, 0xf3f3f0, 0xeeede8, 0x3b3e42, 0x5b3e2b],
  awning: [0x9b2f2a, 0x2f5f8a, 0x2f6a45, 0xc79a2a, 0x7a2f4f, 0x4a4f55, 0xb8562e, 0x1f4a6b],
  sign: [0xc8102e, 0x0f4c9c, 0xf2c200, 0x1e7a3c, 0xe86f1c, 0x2b2b2b, 0xf4f4f4, 0x6a2c91, 0x00857c],
  brick: [0x9c4a32, 0x8d4a36, 0xa65e3e, 0x7f3f2c, 0xb06a4c],
  stone: [0xdcd3c1, 0xd6ccb8, 0xe2dccd, 0xcfc6b2],
  clad: [0x9aa3a8, 0xb9bcbc, 0x6e7c86, 0xc9c3b4, 0x7d8b73],
};

// ============================================================================ Malzemeler
// bInfo (öznitelik) → vB: x = bina taban kotu, y = duvar üst kotu (tabana göre), z = tohum, w = yaş/yıpranma (0–1)
function withB(m) {
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    base(sh);
    sh.vertexShader = sh.vertexShader.replace('varying vec3 vPObj;', 'attribute vec4 bInfo; varying vec4 vB; varying vec3 vPObj;')
      .replace('vPObj = position;', 'vPObj = position; vB = bInfo;');
    sh.fragmentShader = sh.fragmentShader.replace('varying vec3 vPObj;', 'varying vec4 vB; varying vec3 vPObj;');
  };
  return m;
}
// Yıpranma: çatı ve denizliklerden inen yağmur izleri, zemine yakın sıçrama kiri ve kararma, lekeli tadilat boyası
const WEATHER = `
  float hy = p.y - vB.x;
  float wn = fbm3(p*0.45 + vB.z*11.0, 3);
  float wst = fbm3(vec3((p.x + p.z)*2.3, p.y*0.14, vB.z*7.0), 4);
  float topF = smoothstep(vB.y - 6.0, vB.y + 0.5, hy);
  col *= 1.0 - vB.w*0.2*smoothstep(0.5, 0.8, wst)*(0.35 + 0.65*topF);
  float gnd = 1.0 - smoothstep(0.0, 1.0 + 0.9*wn, hy);
  col = mix(col, col*vec3(0.6, 0.58, 0.53), (0.3 + 0.45*vB.w)*gnd);
  col *= mix(0.88, 1.0, smoothstep(0.0, 9.0, hy));`;

const P_PLASTER = `
  float n = fbm3(p*1.3 + vB.z*5.0, 4), fine = vn3(p*24.0), g2 = vn3(p*70.0);
  col *= 0.93 + 0.1*n + 0.07*(fine - 0.5);
  col *= 1.0 - 0.08*vB.w*smoothstep(0.55, 0.72, fbm3(p*0.16 + vB.z*9.0, 3));
  ${WEATHER}
  rough = 0.86 + 0.08*fine;
  h = fine*0.55 + g2*0.3 + n*0.15;`;
const P_BRICK = `
  vec3 a = axisDominant(pn); vec2 uv = a.x > 0.5 ? p.zy : (a.y > 0.5 ? p.xz : p.xy);
  uv *= vec2(4.4, 13.0);
  float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5;
  vec2 f = fract(uv), id = floor(uv);
  float aa = aaW(vec3(uv*0.5, 0.0));
  float m = smoothstep(0.0, 0.07, min(f.x, 1.0 - f.x)*0.45)*smoothstep(0.0, 0.1, min(f.y, 1.0 - f.y));
  m = mix(0.86, m, aa);
  float tint = mix(0.5, h13(vec3(id, 3.0 + vB.z*10.0)), aa);
  float n = fbm3(p*6.0, 3);
  vec3 bc = col*(0.74 + 0.42*tint)*(0.86 + 0.22*n);
  col = mix(vec3(0.58, 0.56, 0.52)*(0.85 + 0.2*n), bc, m);
  ${WEATHER}
  rough = mix(0.95, 0.84, m);
  h = m*0.8 + n*0.2;`;
const P_ASHLAR = `
  vec3 a = axisDominant(pn); vec2 uv = a.x > 0.5 ? p.zy : (a.y > 0.5 ? p.xz : p.xy);
  uv *= vec2(0.85, 2.2);
  float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5 + h13(vec3(row, 1.0, 2.0))*0.3;
  vec2 f = fract(uv), id = floor(uv);
  float aa = aaW(vec3(uv, 0.0));
  float m = smoothstep(0.0, 0.02, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.045, min(f.y, 1.0 - f.y)); m = mix(0.93, m, aa);
  float t = mix(0.5, h13(vec3(id, 9.0)), aa);
  float n = fbm3(p*2.0, 4), fine = vn3(p*30.0);
  col *= (0.9 + 0.14*t)*(0.88 + 0.18*n + 0.06*(fine - 0.5));
  col *= mix(0.7, 1.0, m);
  ${WEATHER}
  rough = 0.74 + 0.16*fine; h = m*0.7 + fine*0.3;`;
const P_PLINTH = `
  vec3 a = axisDominant(pn); vec2 uv = a.x > 0.5 ? p.zy : (a.y > 0.5 ? p.xz : p.xy);
  uv *= vec2(1.25, 2.1);
  float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5;
  vec2 f = fract(uv), id = floor(uv);
  float aa = aaW(vec3(uv, 0.0));
  float m = smoothstep(0.0, 0.015, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.03, min(f.y, 1.0 - f.y)); m = mix(0.93, m, aa);
  float t = mix(0.5, h13(vec3(id, 4.0 + vB.z)), aa);
  float n = fbm3(p*3.0, 4), sp = vn3(p*90.0);
  col *= (0.84 + 0.26*t)*(0.88 + 0.2*n) + 0.06*(sp - 0.5);
  col *= mix(0.55, 1.0, m);
  ${WEATHER}
  rough = 0.7 + 0.2*sp; h = m*0.7 + sp*0.3;`;
const P_TRIM = `
  float n = fbm3(p*1.8 + vB.z*3.0, 4), fine = vn3(p*30.0);
  col *= 0.94 + 0.08*n + 0.05*(fine - 0.5);
  ${WEATHER}
  rough = 0.76 + 0.12*fine; h = fine*0.5 + n*0.3;`;
const P_METAL = `
  float n = fbm3(p*3.0, 3), fine = vn3(p*60.0);
  float chip = smoothstep(0.76, 0.82, fbm3(p*7.0 + vB.z*9.0, 4))*vB.w;
  col *= 0.9 + 0.12*n; col = mix(col, vec3(0.42, 0.3, 0.22), chip*0.8);
  rough = 0.42 + 0.2*n + 0.3*chip; metal = 0.3*(1.0 - chip);
  h = fine*0.3 - chip*0.5;`;
const P_CLAD = `
  vec3 a = axisDominant(pn); float u = a.x > 0.5 ? p.z : p.x;
  float rib = abs(fract(u*5.0) - 0.5)*2.0; rib = smoothstep(0.2, 0.8, rib);
  float n = fbm3(p*1.5 + vB.z*4.0, 4);
  col *= 0.86 + 0.1*rib + 0.12*n;
  ${WEATHER}
  rough = 0.5 + 0.2*n; metal = 0.35;
  h = rib;`;
const P_TILE = `
  vec2 nh = pn.xz; float ln = length(nh); nh = ln > 1e-3 ? nh/ln : vec2(0.0, 1.0);
  float along = dot(p.xz, vec2(-nh.y, nh.x));
  float rw = p.y*6.2;
  vec2 uv = vec2(along*4.7, rw);
  vec2 f = fract(uv), id = floor(uv);
  float aa = aaW(vec3(uv*0.6, 0.0));
  float t = h13(vec3(id, 5.0 + vB.z*10.0));
  float cv = sin(f.x*6.2831)*0.5 + 0.5;
  float ov = smoothstep(0.0, 0.22, f.y);
  col *= mix(0.95, (0.76 + 0.38*t)*(0.8 + 0.25*cv)*mix(0.55, 1.0, ov), aa);
  col *= 0.85 + 0.25*fbm3(p*0.7 + vB.z*2.0, 3);
  col = mix(col, vec3(0.27, 0.26, 0.21), vB.w*0.45*smoothstep(0.55, 0.8, fbm3(p*1.1 + vB.z*3.0, 3)));
  rough = 0.6 + 0.25*t; h = mix(0.5, cv*0.6 + ov*0.4, aa);`;
const P_MEMBRANE = `
  float n = fbm3(p*0.8 + vB.z*5.0, 4), fine = vn3(p*30.0);
  float seam = 1.0 - smoothstep(0.0, 0.03, abs(fract(p.x*0.95) - 0.5) - 0.46);
  col *= 0.8 + 0.3*n + 0.08*(fine - 0.5);
  col *= 1.0 - 0.14*seam;
  float pud = smoothstep(0.62, 0.8, fbm3(p*0.3 + vB.z, 3));
  col *= 1.0 - 0.18*pud;
  rough = 0.88 - 0.25*pud; h = fine*0.4 + seam*0.4;`;

let MATS = null;
/** Paylaşılan bina malzemeleri (tek sefer derlenir). */
export function buildingMaterials() {
  if (MATS) return MATS;
  const PV = (key, pattern, params = {}, bump = 0.015, physical = false) => withB(procedural({ key, physical, bump, pattern, params: { color: 0xffffff, roughness: 0.85, vertexColors: true, ...params } }));
  const glass = glassMaterial(), sign = signMaterial();
  MATS = {
    wall: PV('bld-plaster', P_PLASTER, { roughness: 0.9 }, 0.014),
    brick: PV('bld-brick', P_BRICK, { roughness: 0.9 }, 0.03),
    stone: PV('bld-stone', P_ASHLAR, { roughness: 0.8 }, 0.025),
    plinth: PV('bld-plinth', P_PLINTH, { roughness: 0.8 }, 0.02),
    trim: PV('bld-trim', P_TRIM, { roughness: 0.8 }, 0.01),
    metal: PV('bld-metal', P_METAL, { roughness: 0.45 }, 0.006),
    clad: PV('bld-clad', P_CLAD, { roughness: 0.55 }, 0.03),
    tile: PV('bld-tile', P_TILE, { roughness: 0.7 }, 0.05),
    roof: PV('bld-membrane', P_MEMBRANE, { roughness: 0.9 }, 0.012),
    panel: PV('bld-spandrel', 'float n = fbm3(p*0.5, 3); col *= 0.94 + 0.1*n; rough = 0.1 + 0.05*n; h = 0.0;',
      { roughness: 0.1, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }, 0.0, true),
    // örneklenen parçalar (renk instanceColor ile)
    frame: procedural({ key: 'bld-frame', params: { color: 0xffffff, roughness: 0.38 }, bump: 0.004,
      pattern: 'float n = vn3(p*80.0); float dd = fbm3(p*4.0 + seed*9.0, 3); col *= (0.97 + 0.05*n)*(1.0 - 0.12*smoothstep(0.6, 0.85, dd)); rough = 0.34 + 0.12*dd; h = n;' }),
    glass,
    wood: mat.wood({ color: 0xffffff, varnish: true, ring: 14 }),
    shutter: procedural({ key: 'bld-shutter', params: { color: 0xffffff, roughness: 0.5, metalness: 0.4 }, bump: 0.03,
      pattern: `float cor = sin(p.y*78.5); float n = fbm3(p*2.0 + seed*7.0, 4);
        col *= (0.86 + 0.12*cor)*(0.85 + 0.25*n); col = mix(col, vec3(0.3, 0.3, 0.3), 0.35*smoothstep(0.6, 0.85, fbm3(p*1.2 + 3.0, 3)));
        rough = 0.45 + 0.3*n; h = cor*0.5 + 0.5;` }),
    awning: procedural({ key: 'bld-awning', physical: true, params: { color: 0xffffff, roughness: 0.85, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.8, 0.8, 0.8), side: THREE.DoubleSide }, bump: 0.01,
      pattern: `float st = step(0.5, fract(p.x*2.3)); col = mix(col, vec3(0.92, 0.9, 0.84), st*step(0.45, seed));
        float n = fbm3(p*2.0 + seed*5.0, 3); col *= 0.82 + 0.25*n; h = vn3(p*120.0);` }),
    sign,
    rail: procedural({ key: 'bld-rail', params: { color: 0xffffff, roughness: 0.45, metalness: 0.5 }, bump: 0.004,
      pattern: 'float n = fbm3(p*6.0 + seed*4.0, 3); col *= 0.85 + 0.2*n; col = mix(col, vec3(0.4, 0.28, 0.2), 0.4*smoothstep(0.7, 0.85, n)); rough = 0.4 + 0.3*n; h = n;' }),
    equip: procedural({ key: 'bld-equip', params: { color: 0xffffff, roughness: 0.5, vertexColors: true }, bump: 0.004,
      pattern: 'float n = fbm3(p*5.0 + seed*6.0, 3); col *= 0.9 + 0.12*n; col = mix(col, col*vec3(0.75, 0.7, 0.6), 0.4*smoothstep(0.6, 0.85, fbm3(p*2.0 + 1.0, 3))); rough = 0.45 + 0.2*n; h = n;' }),
    galv: mat.brushedMetal({ color: 0xbfc3c6, rough: 0.5 }),
    tankM: mat.paintedMetal({ color: 0xffffff, wear: 0.35 }),
    collector: new THREE.MeshPhysicalMaterial({ color: 0x0d1a2a, roughness: 0.08, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 }),
    shell: shellMaterial(),
  };
  return MATS;
}

function signMaterial() {
  const sign = procedural({ key: 'bld-sign', params: { color: 0xffffff, roughness: 0.35 }, bump: 0.004, uniforms: { uSignLit: { value: 0.05 } },
    pattern: 'float n = fbm3(p*3.0, 3); col *= 0.94 + 0.08*n; rough = 0.3 + 0.15*n; h = n;' });
  const base = sign.onBeforeCompile;
  sign.onBeforeCompile = (sh) => { base(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb*uSignLit;'); };
  return sign;
}
/** Bağımsız gece ışığı seti (bölge bölge karartma için): populateCity({ ownLights: true }) bunu kendisi yapar. */
export function cityLightSet() { return { glass: glassMaterial(), shell: shellMaterial(), sign: signMaterial() }; }

// Cam: iç mekân eşlemesi (oda kutusu: taban, tavan, yan/arka duvar, mobilya), tül/fon perde/stor, Fresnel yansıması.
// gInfo: x = tür (0 konut, 1 dükkân, 2 ofis, 3 merdiven/giriş, 4 sanayi, 5 cam balkon), y = oda tabanı (cam merkezine göre, m),
// z = oda genişliği, w = oda derinliği.
function glassMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, ior: 1.52, specularIntensity: 1,
    specularColor: new THREE.Color(0.9, 1.0, 0.96), envMapIntensity: 1.0 });
  const U = { uLit: { value: 0 }, uIntK: { value: 1 } };
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 gInfo; varying vec4 vGI; varying vec3 vIO; varying vec3 vID; varying vec3 vGS;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          mat4 GM = modelMatrix;
          #ifdef USE_INSTANCING
            GM = modelMatrix*instanceMatrix;
          #endif
          vec3 X = GM[0].xyz, Y = GM[1].xyz, Z = GM[2].xyz;
          float sx = length(X), sy = length(Y), sz = max(length(Z), 1e-5);
          vec3 wpos = (GM*vec4(position, 1.0)).xyz;
          vec3 V = wpos - cameraPosition;
          vID = vec3(dot(V, X)/sx, dot(V, Y)/sy, dot(V, Z)/sz);
          vIO = vec3(position.x*sx, position.y*sy, 0.0);
          vGI = gInfo;
          vec3 it = GM[3].xyz*0.173;
          vGS = vec3(fract(sin(dot(it, vec3(12.9898, 78.233, 37.719)))*43758.5453), sx, sy);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uLit, uIntK;
        varying vec4 vGI; varying vec3 vIO; varying vec3 vID; varying vec3 vGS;
        float gh(float x){ return fract(sin(x*127.1 + 311.7)*43758.5453); }
        float gCover = 0.0; vec3 gEmit = vec3(0.0);
        vec3 interior(){
          float sd = vGS.x; vec2 sz = vGS.yz; float kind = vGI.x;
          bool shop = kind > 0.5 && kind < 1.5, office = kind > 1.5 && kind < 2.5, ind = kind > 3.5 && kind < 4.5, bal = kind > 4.5;
          vec3 o = vec3(vIO.xy, 0.0);
          vec3 d = vID; d.z = min(d.z, -1e-3); d = normalize(d);
          float RW = max(vGI.z, sz.x + 0.3), D = max(vGI.w, 0.6), fy = vGI.y;
          float ceilH = shop ? 3.4 : (ind ? 6.5 : (office ? 2.9 : 2.7));
          ceilH = max(ceilH, sz.y*0.5 - fy + 0.2);
          float ox = (gh(sd*7.1) - 0.5)*(RW - sz.x)*0.8;
          vec3 bmin = vec3(-RW*0.5 + ox, fy, -D), bmax = vec3(RW*0.5 + ox, fy + ceilH, 1.0);
          vec3 tt = (mix(bmin, bmax, step(0.0, d)) - o)/d;
          float t = min(min(tt.x, tt.y), tt.z);
          vec3 hp = o + d*t;
          float dz = clamp(-hp.z/D, 0.0, 1.0);
          vec3 wallC = mix(vec3(0.8, 0.76, 0.68), vec3(0.72, 0.76, 0.74), gh(sd*3.3))*(0.8 + 0.3*gh(sd*5.1));
          vec3 c;
          if (t == tt.y) {
            if (d.y > 0.0) {
              c = vec3(0.86, 0.85, 0.82);
              if (office) { vec2 g = fract(hp.xz/vec2(1.2, 1.8)); float pnl = step(0.25, g.x)*step(g.x, 0.75)*step(0.3, g.y)*step(g.y, 0.7); c = mix(vec3(0.62), vec3(0.9), pnl); gEmit += vec3(1.0, 0.98, 0.92)*pnl*(0.25 + 0.9*uLit); }
              if (shop) { vec2 g = fract(hp.xz/vec2(1.5, 1.5)); float sp = 1.0 - smoothstep(0.08, 0.14, length(g - 0.5)); gEmit += vec3(2.2, 2.0, 1.7)*sp*(0.3 + 0.7*uLit); }
            } else {
              c = office ? vec3(0.3, 0.31, 0.33) : (shop ? vec3(0.62, 0.6, 0.56)*(0.9 + 0.1*step(0.5, fract(hp.x*1.7)) ) :
                  vec3(0.44, 0.31, 0.2)*(0.82 + 0.3*step(0.5, fract(hp.x*5.0 + gh(floor(hp.z*1.2))))));
              if (ind) c = vec3(0.4, 0.4, 0.38);
            }
          } else if (t == tt.x) {
            c = wallC*0.86;
          } else {
            c = wallC;
            float fx = hp.x - ox - (gh(sd*13.3) - 0.5)*RW*0.5;
            if (!office && abs(fx) < 0.5 + 0.6*gh(sd*19.7) && hp.y < fy + 0.9 + 1.2*gh(sd*23.1)) c = mix(vec3(0.24, 0.17, 0.11), vec3(0.55, 0.5, 0.45), gh(sd*29.3));
            if (office) { float desk = step(hp.y, fy + 0.75)*step(fy + 0.7, hp.y); c = mix(c, vec3(0.5), 0.5*desk); }
          }
          if (shop && t != tt.y) {
            float shl = fract((hp.y - fy)*2.4);
            vec3 goods = vec3(gh(floor(hp.x*4.0 + hp.z*4.0)*1.7 + sd), gh(floor(hp.x*4.0 - hp.z*3.0)*2.3 + 7.0), gh(floor(hp.z*4.0 + hp.x*2.0)*3.1 + 3.0));
            c = mix(c, mix(vec3(0.45), goods, 0.45)*0.7 + 0.1, step(0.3, shl)*step(hp.y - fy, 2.3)*step(0.2, hp.y - fy)*0.7);
          }
          float lightK = shop ? 1.2 : (office ? 0.85 : (bal ? 0.9 : 0.55));
          c *= mix(1.0, bal ? 0.7 : 0.28, dz)*lightK;
          if (!shop && !office && !bal && gh(sd*31.7) < 0.22) c *= 0.35;
          if (kind > 2.5 && kind < 3.5) c *= 0.6;
          vec2 q = vIO.xy/sz + 0.5;
          if (kind < 0.5 || bal) {
            float r1 = gh(sd*11.3), r2 = gh(sd*17.9), r3 = gh(sd*23.7);
            vec3 fab = vec3(0.0); float cov = 0.0;
            if (r1 < (bal ? 0.3 : 0.62)) {
              float fold = 0.5 + 0.5*sin(vIO.x*42.0 + sin(vIO.y*2.3 + sd*6.0)*1.6);
              fab = vec3(0.87, 0.86, 0.81)*(0.82 + 0.18*fold); cov = 0.5 + 0.22*fold;
              if (gh(sd*43.1) > 0.72 && q.x > 0.55) cov = 0.0;
            }
            if (r2 < 0.45) {
              float dw = 0.1 + 0.14*r3, e = min(q.x, 1.0 - q.x);
              if (e < dw) {
                vec3 dc = mix(vec3(0.58, 0.45, 0.32), vec3(0.47, 0.19, 0.17), gh(sd*47.3));
                dc = mix(dc, vec3(0.32, 0.37, 0.46), step(0.72, gh(sd*53.9)));
                fab = dc*(0.72 + 0.28*(0.5 + 0.5*sin(vIO.x*70.0))); cov = 1.0;
              }
            }
            if (r3 > 0.8) {
              float down = 0.2 + 0.6*gh(sd*29.1);
              if (1.0 - q.y < down) { fab = vec3(0.83, 0.8, 0.74)*(0.86 + 0.14*step(0.5, fract(vIO.y*14.0))); cov = 1.0; }
            }
            c = mix(c, fab, cov);
            gCover = cov;
          }
          float lit = step(gh(sd*61.3), uLit*((shop || office) ? 0.95 : 0.6));
          gEmit += c*vec3(1.0, 0.78, 0.55)*lit*(shop ? 3.0 : 1.8);
          if (shop || office) gEmit += c*0.12;
          return c;
        }`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = interior();')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = 0.015 + 0.07*gh(vGS.x*9.1);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + (vec3(gh(vGS.x*3.7), gh(vGS.x*5.3), gh(vGS.x*8.9)) - 0.5)*0.04);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gEmit;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= gCover*0.65;
        reflectedLight.indirectDiffuse *= uIntK;`);
  };
  m.customProgramCacheKey = () => 'simlab-bld-glass-v2';
  return m;
}

// Uzak kabuk: tek malzemede pencere ızgarası (kat/aks), dükkân katı, parapet, çatı. Öznitelikler:
// fuv (u, v: cephe metre), fsz (yüz genişliği, duvar yüksekliği), fprm (kat yük., aks, stil, tohum), fex (dükkân, tür, zemin kat üstü, son kat üstü)
// stil: 0 apartman, 1 ofis, 2 tuğla, 3 eski ev, 4 kamu, 5 sanayi. tür: 0 duvar, 1 düz çatı, 2 kiremit çatı
function shellMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const U = { uLit: { value: 0 } };
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 fuv; attribute vec2 fsz; attribute vec4 fprm; attribute vec4 fex;
        varying vec2 vF; varying vec2 vSz; varying vec4 vPrm; varying vec4 vEx; varying vec3 vOP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vF = fuv; vSz = fsz; vPrm = fprm; vEx = fex; vOP = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vF; varying vec2 vSz; varying vec4 vPrm; varying vec4 vEx; varying vec3 vOP;
        uniform float uLit;
        ${NOISE3_GLSL}
        float fR, fM; vec3 fE;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 wc = diffuseColor.rgb;
          float nz = fbm3(vOP*0.25, 3);
          fR = 0.88; fM = 0.0; fE = vec3(0.0);
          float fh = vPrm.x, bw = vPrm.y, sty = vPrm.z, sd = vPrm.w;
          float kind = vEx.y;
          vec3 cc = wc*(0.9 + 0.16*nz);
          if (kind < 0.5) {
            float W = vSz.x, g0 = vEx.z, top = vEx.w;
            float nb = max(1.0, floor(W/bw + 0.5)), cw = W/nb;
            float iu = floor(vF.x/cw), fu = vF.x/cw - iu;
            float shop = vEx.x;
            float isG = step(vF.y, g0);
            float iv = isG > 0.5 ? -1.0 : floor((vF.y - g0)/fh);
            float lh = isG > 0.5 ? g0 : fh;
            float fv = isG > 0.5 ? vF.y/max(g0, 0.1) : (vF.y - g0)/fh - iv;
            vec2 q = vec2((fu - 0.5)*cw, (fv - 0.5)*lh);
            if (sty > 1.5 && sty < 2.5) cc *= 0.9 + 0.12*vn3(vec3(vF*vec2(4.0, 13.0), sd));
            if (vF.y < 0.55 && sty < 4.5) cc *= 0.62;
            if (vF.y < top + 0.02 && vF.y > 0.4) {
              vec2 hw; float oy;
              bool store = isG > 0.5 && shop > 0.5;
              if (store) { hw = vec2(cw*0.5 - 0.35, lh*0.36); oy = -lh*0.12; }
              else if (sty > 0.5 && sty < 1.5) { hw = vec2(cw*0.5 - 0.04, lh*0.5 - 0.62); oy = 0.1; }
              else if (sty > 2.5 && sty < 3.5) { hw = vec2(0.5, 0.85); oy = 0.1; }
              else if (sty > 3.5 && sty < 4.5) { hw = vec2(0.7, 1.4); oy = 0.2; }
              else if (sty > 4.5) { hw = vec2(cw*0.35, 0.9); oy = lh*0.12; }
              else { hw = vec2(0.62, 0.72); oy = 0.1; }
              vec2 dq = abs(q - vec2(0.0, oy)) - hw;
              float dd = max(dq.x, dq.y);
              float hsh = fract(sin(dot(vec3(iu + 1.7, iv + 3.1, sd*97.0), vec3(12.9898, 78.233, 37.719)))*43758.5453);
              if (dd < 0.0) {
                bool frame = dd > -0.07 || (sty < 0.5 && abs(q.x) < 0.04 && !store);
                if (frame) { cc = sty > 0.5 && sty < 1.5 ? vec3(0.1, 0.105, 0.11) : vec3(0.8, 0.8, 0.78); fR = 0.4; }
                else {
                  cc = mix(vec3(0.05, 0.065, 0.075), vec3(0.16, 0.18, 0.19), hsh);
                  if (!store && hsh < 0.4 && (sty < 0.5 || sty > 1.5)) cc = mix(cc, vec3(0.55, 0.53, 0.48), 0.6);
                  if (store) cc = vec3(0.2, 0.2, 0.19);
                  fM = 0.35; fR = 0.12;
                  float lit = step(hsh, uLit*0.65);
                  fE = vec3(1.0, 0.72, 0.45)*lit*(store ? 1.8 : 1.0);
                }
              } else if (!store && dq.x < 0.06 && q.y - oy < -hw.y && q.y - oy > -hw.y - 0.08) { cc = vec3(0.8, 0.79, 0.76); }
              else if (!store && dq.x < 0.0 && q.y - oy < -hw.y) { cc *= 1.0 - 0.1*smoothstep(0.0, 1.2, -(q.y - oy + hw.y)); }
              if (store && q.y - oy > hw.y + 0.12 && q.y - oy < hw.y + 0.7 && dq.x < 0.1) {
                vec3 scol = vec3(fract(iu*0.37 + sd), fract(iu*0.71 + sd*3.0), fract(iu*0.13 + sd*7.0));
                cc = scol*0.6 + 0.1; fR = 0.35; fE = scol*uLit*0.8;
              }
            }
            if (sty < 0.5 && isG < 0.5 && fv < 0.07 && vF.y < top) cc *= 0.92;
            cc *= 0.92 + 0.08*smoothstep(0.0, 2.0, vF.y);
          } else if (kind < 1.5) {
            float e = min(min(vF.x, vSz.x - vF.x), min(vF.y, vSz.y - vF.y));
            cc = e < 0.25 ? vec3(0.72, 0.71, 0.68) : wc*(0.75 + 0.35*nz);
          } else {
            cc = wc*(0.78 + 0.3*nz)*(0.9 + 0.1*vn3(vOP*3.0));
            fR = 0.7;
          }
          diffuseColor.rgb = cc;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fR;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = fM;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fE;');
  };
  m.customProgramCacheKey = () => 'simlab-bld-shell-v1';
  return m;
}

// ============================================================================ Örneklenen parça kütüphanesi
const clean = (g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };
// Kutu listesi → tek geometri; yalnız görünen yüzler (mask: 1 +z, 2 −z, 4 +x, 8 −x, 16 +y, 32 −y; varsayılan hepsi)
function boxes(list) {
  const P = [], N = [];
  for (const [x, y, z, sx, sy, sz, m = 63] of list) {
    const X0 = x - sx / 2, X1 = x + sx / 2, Y0 = y - sy / 2, Y1 = y + sy / 2, Z0 = z - sz / 2, Z1 = z + sz / 2;
    const q = (a, b, c, d, n) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) N.push(...n); };
    if (m & 1) q([X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1], [0, 0, 1]);
    if (m & 2) q([X1, Y0, Z0], [X0, Y0, Z0], [X0, Y1, Z0], [X1, Y1, Z0], [0, 0, -1]);
    if (m & 4) q([X1, Y0, Z1], [X1, Y0, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [1, 0, 0]);
    if (m & 8) q([X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0], [-1, 0, 0]);
    if (m & 16) q([X0, Y1, Z1], [X1, Y1, Z1], [X1, Y1, Z0], [X0, Y1, Z0], [0, 1, 0]);
    if (m & 32) q([X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0, Z1], [X0, Y0, Z1], [0, -1, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
// Dikdörtgen kasa: 4 çıta, yalnız ön yüz + açıklığa bakan iç yüz (dış yüzler söveye / kasaya yaslanır)
const rectFrame = (w, h, t, d, x = 0, y = 0, z = 0) => [[x, y + h / 2 - t / 2, z, w, t, d, 33], [x, y - h / 2 + t / 2, z, w, t, d, 17],
  [x - w / 2 + t / 2, y, z, t, h - 2 * t, d, 5], [x + w / 2 - t / 2, y, z, t, h - 2 * t, d, 9]];
const tint = (g, hex) => { _c.set(hex); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));

/** Parça tabanı ölçüleri (örnek ölçeği = gerçek / taban). */
const BASE = { win: [1.2, 1.45], door: [0.85, 2.25], shop: [3, 3.1], entry: [1.4, 2.5], tall: [1, 1.7], ind: [2.4, 1.8], glz: [0.9, 1.6], bars: [1.2, 1.45], woodDoor: [1.1, 2.3], shutter: [3, 3.1] };
let LIB = null;
function lib() {
  if (LIB) return LIB;
  const t = 0.065, dp = 0.07;
  const sash = (w, h, x) => rectFrame(w, h, 0.045, 0.05, x, 0, 0.012);
  const win = boxes([...rectFrame(1.2, 1.45, t, dp), [0, 0, 0, 0.07, 1.45 - 2 * t, dp, 13], ...sash(0.52, 1.3, -0.3), ...sash(0.52, 1.3, 0.3)]);
  const door = boxes([...rectFrame(0.85, 2.25, t, dp), [0, -0.3, 0.005, 0.72, 0.08, 0.06, 49], [0, -0.7, 0.0, 0.72, 0.75, 0.035, 17], ...rectFrame(0.72, 2.12, 0.04, 0.05, 0, 0, 0.012)]);
  const shop = boxes([...rectFrame(3, 3.1, 0.06, 0.08), [-0.55, 0, 0, 0.06, 3.0, 0.08, 13], [0.55, 0, 0, 0.06, 3.0, 0.08, 13], [0, 0.92, 0, 2.9, 0.06, 0.08, 49], [0, -1.42, 0.01, 2.9, 0.26, 0.05, 17]]);
  const entry = boxes([...rectFrame(1.4, 2.5, 0.07, 0.09), [0, -0.27, 0, 0.05, 1.96, 0.09, 13], [0, 0.72, 0, 1.3, 0.06, 0.09, 49], [-0.35, -0.2, 0.06, 0.45, 0.035, 0.035, 61], [0.35, -0.2, 0.06, 0.45, 0.035, 0.035, 61], [0, -1.08, 0.01, 1.3, 0.3, 0.05, 17]]);
  const tall = boxes([...rectFrame(1, 1.7, 0.07, 0.08), [0, -0.19, 0, 0.06, 1.18, 0.08, 13], [0, 0.4, 0, 0.9, 0.06, 0.08, 49], ...rectFrame(0.42, 1.12, 0.04, 0.05, -0.23, -0.2, 0.012), ...rectFrame(0.42, 1.12, 0.04, 0.05, 0.23, -0.2, 0.012)]);
  const indL = [...rectFrame(2.4, 1.8, 0.06, 0.07)];
  for (let i = 1; i < 4; i++) indL.push([-1.2 + i * 0.6, 0, 0, 0.03, 1.7, 0.04, 13]);
  for (let j = 1; j < 4; j++) indL.push([0, -0.9 + j * 0.45, 0, 2.3, 0.03, 0.04, 49]);
  const ind = boxes(indL);
  const glz = boxes([...rectFrame(0.9, 1.6, 0.045, 0.06)]);
  const barsL = [[0, 0.45, 0.02, 1.2, 0.03, 0.012, 49], [0, -0.45, 0.02, 1.2, 0.03, 0.012, 49]];
  for (let i = 0; i < 10; i++) barsL.push([-0.54 + i * 0.12, 0, 0.02, 0.016, 1.42, 0.016, 13]);
  const bars = boxes(barsL);
  const woodDoor = boxes([[0, 0, 0, 1.1, 2.3, 0.06, 1], ...[-0.24, 0.24].flatMap((x) => [[x, 0.62, 0.035, 0.36, 0.72, 0.02, 61], [x, -0.42, 0.035, 0.36, 1.0, 0.02, 61]]), [0.4, -0.05, 0.07, 0.03, 0.18, 0.04, 61]]);
  const shutter = boxes([[0, 0, 0, 3, 3.1, 0.03, 1], [0, -1.52, 0.02, 3, 0.07, 0.05, 49]]);
  const sign = boxes([[0, 0, 0.05, 1, 1, 0.1, 61]]);
  // tente: eğik bez + sarkan saçak (birim genişlik, 1,1 m çıkma)
  const awning = mergeGeometries([
    clean(new THREE.BoxGeometry(1, 0.015, 1.2).rotateX(0.42).translate(0, -0.24, 0.55)),
    clean(new THREE.BoxGeometry(1, 0.26, 0.01).translate(0, -0.6, 1.1)),
  ]);
  // demir korkuluk modülü (1 m)
  const railL = [[0, 1.0, 0, 1.0, 0.045, 0.05, 51], [0, 0.1, 0, 1.0, 0.035, 0.03, 19]];
  for (let i = 0; i < 8; i++) railL.push([-0.4375 + i * 0.125, 0.55, 0, 0.018, 0.9, 0.018, 3]);
  const rail = boxes(railL);
  // klima dış ünitesi: gövde + fan ızgarası + konsollar
  const acBody = tint(clean(new THREE.BoxGeometry(0.8, 0.55, 0.28).translate(0, 0.275, 0)), 0xe7e6e0);
  const acFan = tint(clean(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12).rotateX(Math.PI / 2).translate(-0.12, 0.275, 0.145)), 0x3a3c3e);
  const acGr = tint(boxes([[-0.12, 0.275, 0.158, 0.4, 0.012, 0.006], [-0.12, 0.275, 0.158, 0.012, 0.4, 0.006]]), 0x9a9c9e);
  const acBr = tint(boxes([[-0.3, -0.02, -0.02, 0.04, 0.04, 0.34], [0.3, -0.02, -0.02, 0.04, 0.04, 0.34]]), 0x55585b);
  const ac = mergeGeometries([acBody, acFan, acGr, acBr]).translate(0, 0, 0.14);
  // uydu çanağı
  const dishB = tint(clean(new THREE.LatheGeometry(V2([[0.001, 0], [0.12, 0.012], [0.24, 0.045], [0.32, 0.09], [0.31, 0.1], [0.001, 0.02]]), 20).rotateX(-Math.PI / 2 + 0.5).translate(0, 0.35, 0)), 0xeeeeea);
  const dishA = tint(boxes([[0, 0.18, -0.05, 0.03, 0.36, 0.03], [0, 0.45, 0.2, 0.025, 0.025, 0.4], [0, 0.52, 0.38, 0.06, 0.06, 0.08]]), 0x6c6e70);
  const dish = mergeGeometries([dishB, dishA]);
  // TV anteni (yagi): direk + bum + elemanlar
  const antL = [[0, 1.5, 0, 0.035, 3.0, 0.035], [0, 2.8, 0.2, 0.025, 0.025, 1.4]];
  for (let i = 0; i < 7; i++) antL.push([0, 2.8, -0.35 + i * 0.16, 0.9 - i * 0.07, 0.012, 0.012]);
  antL.push([0, 2.2, 0, 0.02, 0.02, 0.9]);
  const antenna = boxes(antL);
  // güneş enerjili su ısıtıcı: kollektör (eğik), üstte yatay depo, galvaniz ayaklar (+z = güneye bakar)
  const tilt = 0.7;
  const solarP = clean(new RoundedBox(1.9, 0.08, 1.05, 0.02).rotateX(-tilt).translate(0, 0.95, 0.25));
  const solarT = clean(new THREE.CylinderGeometry(0.27, 0.27, 1.8, 18).rotateZ(Math.PI / 2).translate(0, 1.62, -0.28));
  const solarF = boxes([[-0.85, 0.8, -0.28, 0.04, 1.6, 0.04], [0.85, 0.8, -0.28, 0.04, 1.6, 0.04], [-0.85, 0.2, 0.45, 0.04, 0.4, 0.04], [0.85, 0.2, 0.45, 0.04, 0.4, 0.04],
    [0, 0.05, 0.08, 1.8, 0.04, 0.04], [0, 1.35, -0.28, 1.75, 0.035, 0.035]]);
  const tankG = mergeGeometries([clean(new THREE.CylinderGeometry(0.46, 0.46, 1.5, 20).rotateZ(Math.PI / 2).translate(0, 0.72, 0)),
    boxes([[-0.5, 0.15, 0, 0.08, 0.3, 0.8], [0.5, 0.15, 0, 0.08, 0.3, 0.8]])]);
  const glass = new THREE.PlaneGeometry(1, 1);
  const M = buildingMaterials();
  LIB = {
    win: { geo: win, mat: 'frame' }, door: { geo: door, mat: 'frame' }, shop: { geo: shop, mat: 'frame' }, entry: { geo: entry, mat: 'frame' },
    tall: { geo: tall, mat: 'frame' }, ind: { geo: ind, mat: 'frame' }, glz: { geo: glz, mat: 'frame' }, bars: { geo: bars, mat: 'rail' },
    woodDoor: { geo: woodDoor, mat: 'wood' }, shutter: { geo: shutter, mat: 'shutter' }, sign: { geo: sign, mat: 'sign' }, awning: { geo: awning, mat: 'awning' },
    rail: { geo: rail, mat: 'rail' }, ac: { geo: ac, mat: 'equip', noColor: true }, dish: { geo: dish, mat: 'equip', noColor: true }, antenna: { geo: antenna, mat: 'galv', noColor: true },
    solarP: { geo: solarP, mat: 'collector', noColor: true }, solarT: { geo: solarT, mat: 'tankM' }, solarF: { geo: solarF, mat: 'galv', noColor: true },
    tank: { geo: tankG, mat: 'tankM' }, glass: { geo: glass, mat: 'glass', noColor: true },
  };
  for (const v of Object.values(LIB)) v.m = M[v.mat];
  return LIB;
}
// RoundedBoxGeometry'ye bağımlı olmadan pahlı kutu (kollektör kasası için)
function RoundedBox(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

// ============================================================================ Geometri kurucu
// Büyüyen tipli diziler (JS dizisine push + dönüştürme yerine: ~4 kat hızlı, çöp üretmez)
class Bucket {
  constructor() { this.nv = 0; this.ni = 0; this.cap = 0; this.icap = 0; this.grow(1024, 2048); }
  grow(v, i) {
    if (v > this.cap) {
      const c = Math.max(v, this.cap * 2), o = this;
      const g = (a, k) => { const b = new Float32Array(c * k); if (a) b.set(a.subarray(0, o.nv * k)); return b; };
      this.p = g(this.p, 3); this.n = g(this.n, 3); this.c = g(this.c, 3); this.b = g(this.b, 4); this.cap = c;
    }
    if (i > this.icap) { const c = Math.max(i, this.icap * 2), b = new Uint32Array(c); if (this.i) b.set(this.i.subarray(0, this.ni)); this.i = b; this.icap = c; }
  }
  vert(x, y, z, nx, ny, nz, c, I) {
    const k = this.nv++, p = this.p, n = this.n, cc = this.c, b = this.b;
    p[k * 3] = x; p[k * 3 + 1] = y; p[k * 3 + 2] = z; n[k * 3] = nx; n[k * 3 + 1] = ny; n[k * 3 + 2] = nz;
    cc[k * 3] = c[0]; cc[k * 3 + 1] = c[1]; cc[k * 3 + 2] = c[2]; b[k * 4] = I[0]; b[k * 4 + 1] = I[1]; b[k * 4 + 2] = I[2]; b[k * 4 + 3] = I[3];
  }
  tri(a, b, c) { const i = this.i, k = this.ni; i[k] = a; i[k + 1] = b; i[k + 2] = c; this.ni += 3; }
}
const SIDES = (w, d) => [
  { o: [-w / 2, 0, d / 2], u: [1, 0, 0], n: [0, 0, 1], L: w },
  { o: [w / 2, 0, d / 2], u: [0, 0, -1], n: [1, 0, 0], L: d },
  { o: [w / 2, 0, -d / 2], u: [-1, 0, 0], n: [0, 0, -1], L: w },
  { o: [-w / 2, 0, -d / 2], u: [0, 0, 1], n: [-1, 0, 0], L: d },
];

class Builder {
  constructor() {
    this.B = {}; this.I = {};
    this.T = new THREE.Matrix4(); this.F = new THREE.Matrix4();
    this.col = [1, 1, 1]; this.inf = [0, 0, 0, 0];
  }
  bucket(k) { return this.B[k] || (this.B[k] = new Bucket()); }
  hex(h) { _c.set(h); return [_c.r, _c.g, _c.b]; }
  color(h) { this.col = this.hex(h); return this; }
  local() { this.F.copy(this.T); return this; }
  side(k, w, d) {
    const s = SIDES(w, d)[k];
    _m.makeBasis(_v.fromArray(s.u), _up, _s.fromArray(s.n)).setPosition(s.o[0], s.o[1], s.o[2]);
    this.F.multiplyMatrices(this.T, _m);
    return s.L;
  }
  poly(k, pts, n, col) {
    const bk = this.bucket(k), e = this.F.elements, base = bk.nv, c = col || this.col, I = this.inf;
    bk.grow(bk.nv + pts.length, bk.ni + (pts.length - 2) * 3);
    const nx = e[0] * n[0] + e[4] * n[1] + e[8] * n[2], ny = e[1] * n[0] + e[5] * n[1] + e[9] * n[2], nz = e[2] * n[0] + e[6] * n[1] + e[10] * n[2];
    for (const q of pts) bk.vert(e[0] * q[0] + e[4] * q[1] + e[8] * q[2] + e[12], e[1] * q[0] + e[5] * q[1] + e[9] * q[2] + e[13], e[2] * q[0] + e[6] * q[1] + e[10] * q[2] + e[14], nx, ny, nz, c, I);
    const a = pts[0], b = pts[1], cc = pts[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2];
    const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0;
    for (let j = 1; j + 1 < pts.length; j++) { if (flip) bk.tri(base, base + j + 1, base + j); else bk.tri(base, base + j, base + j + 1); }
  }
  /** Eksen hizalı kutu (etkin çerçevede). skip: 1 alt, 2 üst, 4 −z, 8 +z, 16 −x, 32 +x */
  box(k, x0, x1, y0, y1, z0, z1, col, skip = 0) {
    if (!(skip & 1)) this.poly(k, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], col);
    if (!(skip & 2)) this.poly(k, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], col);
    if (!(skip & 4)) this.poly(k, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], col);
    if (!(skip & 8)) this.poly(k, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], col);
    if (!(skip & 16)) this.poly(k, [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0], col);
    if (!(skip & 32)) this.poly(k, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], col);
  }
  /** Dikdörtgen taban çevresinde profil süpürme (silme, korniş, parapet kapağı). prof: [[t (dışa), v (yukarı)], …] */
  ring(k, x0, x1, z0, z1, y, prof, col, sides = 15) {
    for (let i = 0; i + 1 < prof.length; i++) {
      const [ta, va] = prof[i], [tb, vb] = prof[i + 1];
      let nt = vb - va, nv = -(tb - ta); const l = Math.hypot(nt, nv) || 1; nt /= l; nv /= l;
      const S = [
        [(t) => [x0 - t, z1 + t], (t) => [x1 + t, z1 + t], [0, 1]],
        [(t) => [x1 + t, z1 + t], (t) => [x1 + t, z0 - t], [1, 0]],
        [(t) => [x1 + t, z0 - t], (t) => [x0 - t, z0 - t], [0, -1]],
        [(t) => [x0 - t, z0 - t], (t) => [x0 - t, z1 + t], [-1, 0]],
      ];
      S.forEach(([A, B, dn], si) => {
        if (!(sides & (1 << si))) return;
        const a0 = A(ta), b0 = B(ta), a1 = A(tb), b1 = B(tb);
        this.poly(k, [[a0[0], y + va, a0[1]], [b0[0], y + va, b0[1]], [b1[0], y + vb, b1[1]], [a1[0], y + vb, a1[1]]], [dn[0] * nt, nv, dn[1] * nt], col);
      });
    }
  }
  /** İki nokta arasında dikdörtgen kesitli kiriş (mahya, kenar tahtası). */
  beam(k, p0, p1, wd, ht, col) {
    const d = _v.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize().clone();
    let s = new THREE.Vector3().crossVectors(d, _up); if (s.lengthSq() < 1e-6) s.set(1, 0, 0); s.normalize();
    const u = new THREE.Vector3().crossVectors(s, d).normalize();
    const P = (p, a, b) => [p[0] + s.x * a + u.x * b, p[1] + s.y * a + u.y * b, p[2] + s.z * a + u.z * b];
    const w2 = wd / 2, h2 = ht / 2;
    const q = [[w2, h2], [-w2, h2], [-w2, -h2], [w2, -h2]];
    for (let i = 0; i < 4; i++) {
      const [a1, b1] = q[i], [a2, b2] = q[(i + 1) % 4];
      const nx = s.x * (a1 + a2) + u.x * (b1 + b2), ny = s.y * (a1 + a2) + u.y * (b1 + b2), nz = s.z * (a1 + a2) + u.z * (b1 + b2);
      this.poly(k, [P(p0, a1, b1), P(p1, a1, b1), P(p1, a2, b2), P(p0, a2, b2)], [nx, ny, nz], col);
    }
    this.poly(k, q.map(([a, b]) => P(p0, a, b)), [-d.x, -d.y, -d.z], col);
    this.poly(k, q.map(([a, b]) => P(p1, a, b)), [d.x, d.y, d.z], col);
  }
  /** Hazır BufferGeometry ekle (etkin çerçeve × m). */
  geo(k, g, m, col) {
    const gg = g.index ? g.toNonIndexed() : g;
    const P = gg.attributes.position, N = gg.attributes.normal;
    _m2.multiplyMatrices(this.F, m || _m.identity());
    const nm = new THREE.Matrix3().getNormalMatrix(_m2);
    const bk = this.bucket(k), base = bk.nv, c = col || this.col, I = this.inf;
    bk.grow(bk.nv + P.count, bk.ni + P.count);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(_m2); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      bk.vert(v.x, v.y, v.z, n.x, n.y, n.z, c, I);
    }
    for (let i = 0; i + 2 < P.count; i += 3) bk.tri(base + i, base + i + 1, base + i + 2);
  }
  at(u, v, t, sx = 1, sy = 1, sz = 1, ry = 0) {
    _m2.compose(_v.set(u, v, t), _q.setFromAxisAngle(_up, ry), _s.set(sx, sy, sz));
    return new THREE.Matrix4().multiplyMatrices(this.F, _m2);
  }
  inst(type, m, c = null, x = null) { (this.I[type] || (this.I[type] = [])).push({ m, c, x }); }

  /** Açıklıklı duvar yüzü (etkin cephe çerçevesinde): u ∈ [0, L], v ∈ [v0, H]; açıklıklar boş kalır. */
  wall(k, L, H, ops, o = {}) {
    const v0 = o.v0 ?? 0, pl = o.plinth ?? 0, pk = o.pkey || 'plinth', pc = o.pcol;
    const us = new Set([0, L]), vs = new Set([v0, H]);
    if (pl > v0 && pl < H) vs.add(pl);
    for (const q of ops) { us.add(Math.max(0, Math.min(L, q.u0))); us.add(Math.max(0, Math.min(L, q.u1))); if (q.v0 > v0 && q.v0 < H) vs.add(q.v0); if (q.v1 > v0 && q.v1 < H) vs.add(q.v1); }
    const U = [...us].sort((a, b) => a - b), V = [...vs].sort((a, b) => a - b);
    const hit = (u, v) => ops.some((q) => u > q.u0 && u < q.u1 && v > q.v0 && v < q.v1);
    for (let j = 0; j + 1 < V.length; j++) {
      const a = V[j], b = V[j + 1];
      if (b - a < 1e-4) continue;
      const vm = (a + b) / 2, inP = b <= pl + 1e-6;
      const t = inP ? 0.035 : 0, key = inP ? pk : k, col = inP ? pc : undefined;
      let r0 = null, r1 = null;
      const flush = () => {
        if (r0 === null) return;
        this.poly(key, [[r0, a, t], [r1, a, t], [r1, b, t], [r0, b, t]], [0, 0, 1], col);
        if (inP && Math.abs(b - pl) < 1e-6) this.poly(key, [[r0, b, 0], [r1, b, 0], [r1, b, t], [r0, b, t]], [0, 1, 0], col);
        r0 = null;
      };
      for (let i = 0; i + 1 < U.length; i++) {
        const u0 = U[i], u1 = U[i + 1];
        if (u1 - u0 < 1e-4) continue;
        if (hit((u0 + u1) / 2, vm)) flush(); else { if (r0 === null) r0 = u0; r1 = u1; }
      }
      flush();
    }
  }
  /** Açıklık ayrıntıları: söve (girinti), denizlik, doğrama, cam, kanat/kepenk, parmaklık. */
  openings(k, ops, o = {}) {
    for (const q of ops) {
      const rd = q.rd ?? 0.16, w = q.u1 - q.u0, h = q.v1 - q.v0, uc = (q.u0 + q.u1) / 2, vc = (q.v0 + q.v1) / 2;
      const t0 = q.v0 < (o.plinth ?? 0) ? 0.035 : 0, rk = q.rk || k;
      this.poly(rk, [[q.u0, q.v0, t0], [q.u0, q.v1, t0], [q.u0, q.v1, -rd], [q.u0, q.v0, -rd]], [1, 0, 0]);
      this.poly(rk, [[q.u1, q.v0, t0], [q.u1, q.v1, t0], [q.u1, q.v1, -rd], [q.u1, q.v0, -rd]], [-1, 0, 0]);
      this.poly(rk, [[q.u0, q.v1, t0], [q.u1, q.v1, t0], [q.u1, q.v1, -rd], [q.u0, q.v1, -rd]], [0, -1, 0]);
      if (!q.sill) this.poly(rk, [[q.u0, q.v0, t0], [q.u1, q.v0, t0], [q.u1, q.v0, -rd], [q.u0, q.v0, -rd]], [0, 1, 0]);
      else this.box('trim', q.u0 - 0.05, q.u1 + 0.05, q.v0 - 0.055, q.v0 + 0.005, -rd * 0.6, 0.055, q.scol || o.trimCol);
      if (q.hood) this.box('trim', q.u0 - 0.12, q.u1 + 0.12, q.v1, q.v1 + 0.16, 0, 0.1, q.scol || o.trimCol);
      const fz = -rd * 0.55;
      if (q.frame) { const B = BASE[q.frame]; this.inst(q.frame, this.at(uc, vc, fz, w / B[0], h / B[1], 1), q.fcol ?? 0xf2f2ef); }
      if (q.glass) this.inst('glass', this.at(uc, vc, fz - 0.01, w, h, 1), null, q.glass);
      if (q.leaf) { const B = BASE[q.leaf]; this.inst(q.leaf, this.at(uc, vc, fz + 0.02, w / B[0], h / B[1], 1), q.lcol ?? 0xffffff); }
      if (q.bars) this.inst('bars', this.at(uc, vc, 0.03, w / 1.2, h / 1.45, 1), q.barCol ?? 0x2a2c2e);
    }
  }

  finish(group, M = buildingMaterials()) {
    const L = lib();
    for (const [k, bk] of Object.entries(this.B)) {
      if (!bk.ni) continue;
      const g = new THREE.BufferGeometry(), nv = bk.nv;
      g.setAttribute('position', new THREE.BufferAttribute(bk.p.slice(0, nv * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(bk.n.slice(0, nv * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(bk.c.slice(0, nv * 3), 3));
      g.setAttribute('bInfo', new THREE.BufferAttribute(bk.b.slice(0, nv * 4), 4));
      g.setIndex(new THREE.BufferAttribute(nv < 65536 ? Uint16Array.from(bk.i.subarray(0, bk.ni)) : bk.i.slice(0, bk.ni), 1));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M[k]);
      mesh.castShadow = mesh.receiveShadow = true; mesh.userData.noFit = true; mesh.userData.own = true;
      mesh.name = 'bld:' + k;
      group.add(mesh);
    }
    for (const [type, list] of Object.entries(this.I)) {
      if (!list.length) continue;
      const P = L[type];
      let geo = P.geo;
      if (type === 'glass') {
        geo = P.geo.clone();
        const a = new Float32Array(list.length * 4);
        list.forEach((o, i) => a.set(o.x, i * 4));
        geo.setAttribute('gInfo', new THREE.InstancedBufferAttribute(a, 4));
      }
      const im = new THREE.InstancedMesh(geo, M[P.mat], list.length);
      list.forEach((o, i) => { im.setMatrixAt(i, o.m); if (!P.noColor) im.setColorAt(i, _c.set(o.c ?? 0xffffff)); });
      im.computeBoundingSphere(); im.computeBoundingBox?.();
      im.castShadow = type !== 'glass'; im.receiveShadow = true;
      im.userData.noFit = true; im.userData.own = type === 'glass';
      if (type === 'glass') im.userData.noCast = true;
      im.name = 'bld:' + type;
      group.add(im);
    }
    return group;
  }
}

// ============================================================================ Bina tanımı (ölçüler + seçimler)
const TYPES = ['apartment', 'house', 'office', 'public', 'industrial'];
/** Kullanıcı seçeneklerinden tam bina tanımı üretir (belirlenimci). */
function spec(o) {
  const seed = o.seed ?? Math.random() * 1000;
  const r = cityRng(seed + 0.123);
  const type = TYPES.includes(o.type) ? o.type : 'apartment';
  const C = o.colors || {};
  const S = { type, seed, x: o.x ?? 0, z: o.z ?? 0, rot: o.rot ?? 0, y0: o.y0 ?? 0, attL: !!o.attL, attR: !!o.attR, age: o.age ?? 0.25 + r() * 0.6, roofGear: o.roofGear };
  if (type === 'apartment') {
    Object.assign(S, { w: o.width ?? 13 + r() * 8, d: o.depth ?? 11 + r() * 4, fl: o.floors ?? 5 + Math.floor(r() * 4), fh: 2.95 + r() * 0.15 });
    S.shop = o.shop ?? r() < 0.5;
    S.raise = S.shop ? 0 : 0.5 + r() * 0.5;
    S.g0 = S.shop ? 4.2 : S.fh + S.raise;
    S.roof = o.roof ?? (r() < 0.45 ? 'hip' : 'flat');
    S.top = S.g0 + (S.fl - 1) * S.fh;
    S.H = S.top + (S.roof === 'flat' ? 1.05 : 0.3);
    S.brick = o.material === 'brick' || (o.material == null && r() < 0.1);
    S.wall = C.wall ?? (S.brick ? pickR(r, PALETTES.brick) : pickR(r, PALETTES.plaster));
    S.band = C.trim ?? pickR(r, PALETTES.band);
    S.bands = o.bands ?? r() < 0.7;
    S.balcony = o.balcony ?? pickR(r, ['solid', 'solid', 'rail', 'glazed', 'glazed', 'rail']);
    S.balCol = r() < 0.5 ? S.wall : S.band;
    S.frame = C.frame ?? pickR(r, PALETTES.frame);
    S.winW = pickR(r, [1.2, 1.3, 1.45, 1.6]);
    S.bay = 3.1 + r() * 0.5;
    S.style = S.brick ? 2 : 0;
  } else if (type === 'house') {
    Object.assign(S, { w: o.width ?? 9 + r() * 5, d: o.depth ?? 8 + r() * 4, fl: o.floors ?? 2 + Math.floor(r() * 2), fh: 3.2 + r() * 0.3 });
    S.shop = o.shop ?? false; S.raise = 0.6 + r() * 0.3; S.g0 = S.fh + S.raise;
    S.roof = o.roof ?? (r() < 0.7 ? 'hip' : 'gable');
    S.top = S.g0 + (S.fl - 1) * S.fh; S.H = S.top + 0.35;
    S.wall = C.wall ?? pickR(r, PALETTES.house); S.band = C.trim ?? pickR(r, [0xeee9df, 0xd9d2c3, 0xc9bfae]);
    S.frame = C.frame ?? pickR(r, [0x5a3b26, 0xf1efe8, 0x4b5a4a, 0x6b4a32, 0xe8e2d4]);
    S.bay = 2.4 + r() * 0.4; S.age = o.age ?? 0.55 + r() * 0.45; S.style = 3; S.brick = false;
  } else if (type === 'office') {
    Object.assign(S, { w: o.width ?? 22 + r() * 14, d: o.depth ?? 18 + r() * 10, fl: o.floors ?? 8 + Math.floor(r() * 12), fh: 3.7 });
    S.shop = true; S.raise = 0; S.roof = 'flat';
    S.lobby = o.lobby ?? S.y0 === 0;
    S.g0 = S.lobby ? 5.2 : 0.45;
    if (!S.lobby) S.fl += 1;
    S.top = S.g0 + (S.fl - 1) * S.fh; S.H = S.top + 1.2;
    S.wall = C.wall ?? pickR(r, PALETTES.spandrel); S.band = C.trim ?? pickR(r, [0xb8bcbe, 0x8e959a, 0xd0cfca]);
    S.frame = C.frame ?? pickR(r, [0x2b2f33, 0x9aa0a4, 0x3a3f44]);
    S.bay = 1.5; S.module = 1.5; S.style = 1; S.age = o.age ?? 0.15 + r() * 0.2;
  } else if (type === 'public') {
    Object.assign(S, { w: o.width ?? 34 + r() * 14, d: o.depth ?? 20 + r() * 8, fl: o.floors ?? 2 + Math.floor(r() * 2), fh: 5.0 });
    S.shop = false; S.raise = 1.5; S.g0 = S.fh + S.raise; S.roof = o.roof ?? 'hip';
    S.top = S.g0 + (S.fl - 1) * S.fh; S.H = S.top + 1.6;
    S.wall = C.wall ?? pickR(r, PALETTES.stone); S.band = C.trim ?? 0xe4ddcf; S.frame = C.frame ?? 0x3a2e24;
    S.bay = 4.2; S.style = 4; S.age = o.age ?? 0.35 + r() * 0.3;
  } else {
    Object.assign(S, { w: o.width ?? 28 + r() * 16, d: o.depth ?? 18 + r() * 10, fl: 1, fh: o.height ?? 7.5 + r() * 2.5 });
    S.shop = false; S.raise = 0; S.g0 = S.fh; S.roof = o.roof ?? (r() < 0.45 ? 'saw' : 'gable');
    S.top = S.fh; S.H = S.fh + 0.3;
    S.brick = o.material ? o.material === 'brick' : r() < 0.55;
    S.wall = C.wall ?? (S.brick ? pickR(r, PALETTES.brick) : pickR(r, PALETTES.clad));
    S.band = C.trim ?? 0xb8b3a8; S.frame = C.frame ?? pickR(r, [0x2d3a34, 0x3b3f44, 0x6b7680]);
    S.bay = 3.6; S.style = S.brick ? 2 : 5; S.age = o.age ?? 0.45 + r() * 0.5;
  }
  S.roofCol = C.roof ?? (S.roof === 'flat' ? pickR(r, [0x6f6d68, 0x85827a, 0x5d5c59]) : type === 'public' ? 0x5c6b66 : type === 'industrial' ? pickR(r, [0x7a8288, 0x8c6b5a, 0x6b7074]) : pickR(r, PALETTES.tile));
  S.floors = S.fl;
  S.height = S.H + (S.roof === 'flat' ? 0 : Math.min(S.w, S.d) * 0.3);
  return S;
}

// ============================================================================ Arketipler
const rdOf = (S) => (S.type === 'public' ? 0.3 : S.type === 'house' ? 0.2 : 0.16);

function emitApartment(b, S, r) {
  const { w, d, fh, g0, raise, fl, H, top, shop } = S;
  const flat = S.roof === 'flat', wk = S.brick ? 'brick' : 'wall';
  const fb = (k) => (k === 0 ? raise : g0 + (k - 1) * fh);
  const trim = b.hex(S.band), pcol = b.hex(pickR(r, [0x5d5a55, 0x6e6a63, 0x817c73, 0x4d4b48]));
  const plH = shop ? 0.45 : raise + 0.12;
  const rd = rdOf(S), bd = 1.15 + r() * 0.3;
  const doorW = 0.85;
  const glassR = (fl0, vc, rw) => [0, fl0 - vc, rw, 3.8 + r() * 1.6];
  const win = (uc, fl0, ww, hh = 1.45, sill = 0.88, x = {}) => ({ u0: uc - ww / 2, u1: uc + ww / 2, v0: fl0 + sill, v1: fl0 + sill + hh, rd, frame: 'win', fcol: S.frame, sill: true, scol: trim, glass: glassR(fl0, fl0 + sill + hh / 2, Math.max(3.4, ww + 1.5)), ...x });
  const small = (uc, fl0) => ({ u0: uc - 0.32, u1: uc + 0.32, v0: fl0 + 1.5, v1: fl0 + 2.15, rd: 0.12, frame: 'win', fcol: S.frame, sill: true, scol: trim, glass: [0, -1.82, 2.2, 2.2] });
  const acs = [];
  for (let side = 0; side < 4; side++) {
    const L = b.side(side, w, d);
    const att = (side === 1 && S.attR) || (side === 3 && S.attL);
    const ops = [], bals = [];
    if (!att) {
      const front = side === 0, back = side === 2;
      const nb = Math.max(1, Math.round(L / S.bay)), bw = L / nb;
      if (front || back) {
        const ent = Math.max(0, Math.floor(nb / 2) - (nb % 2 === 0 && r() < 0.5 ? 1 : 0));
        const pat = r(), balC = new Set();
        if (S.balcony !== 'none' && bw >= 2.5) for (let j = 0; j < nb; j++) {
          const on = back ? j % 2 === 1 || nb === 1 : pat < 0.4 ? (j === 0 || j === nb - 1) : pat < 0.75 ? j % 2 === (nb % 2 ? 0 : 1) : j !== ent;
          if (on) balC.add(j);
        }
        // zemin kat
        for (let j = 0; j < nb; j++) {
          const uc = (j + 0.5) * bw;
          if (front && j === ent) {
            ops.push({ u0: uc - 0.72, u1: uc + 0.72, v0: 0.12, v1: 2.72, rd: 0.35, frame: 'entry', fcol: 0x8f969c, glass: [3, -1.4, 2.4, 3.0] });
            b.box('trim', uc - 1.15, uc + 1.15, 2.95, 3.1, 0, 1.15, trim);
            b.box('plinth', uc - 0.95, uc + 0.95, 0, 0.12, 0, 0.55, pcol);
            continue;
          }
          if (front && shop) {
            const u0 = j * bw + 0.32, u1 = (j + 1) * bw - 0.32, closed = r() < 0.14;
            ops.push({ u0, u1, v0: 0.1, v1: 3.2, rd: 0.22, frame: closed ? null : 'shop', fcol: pickR(r, [0x9aa0a6, 0x3b3f44, 0x6b7076]),
              glass: closed ? null : [1, 0.05 - 1.65, bw + 1, Math.min(9, d * 0.6)], leaf: closed ? 'shutter' : null, lcol: pickR(r, [0xb8bcbf, 0x9ba3a8, 0x8a8f86]) });
            b.box('metal', u0 - 0.05, u1 + 0.05, 3.2, 3.48, 0, 0.13, b.hex(0x7a7f84));
            b.inst('sign', b.at((u0 + u1) / 2, 3.78, 0, u1 - u0 + 0.15, 0.62, 1), pickR(r, PALETTES.sign));
            if (r() < 0.5) b.inst('awning', b.at((u0 + u1) / 2, 3.42, 0.02, u1 - u0 + 0.1, 1, 1 + r() * 0.3), pickR(r, PALETTES.awning));
            if (r() < 0.25) acs.push([u1 - 0.5, 3.9]);
            continue;
          }
          if (!shop || !front) {
            if (front || back) ops.push(win(uc, fb(0), S.winW, 1.45, 0.88, { bars: r() < 0.4 && raise < 0.9, barCol: 0x2c2e30 }));
          }
        }
        // üst katlar
        for (let k = 1; k < fl; k++) for (let j = 0; j < nb; j++) {
          const uc = (j + 0.5) * bw, f0 = fb(k);
          if (balC.has(j)) {
            const du = bw >= 3.0 ? uc - 0.55 : uc;
            ops.push({ u0: du - doorW / 2, u1: du + doorW / 2, v0: f0 + 0.03, v1: f0 + 2.28, rd, frame: 'door', fcol: S.frame, glass: glassR(f0, f0 + 1.15, 3.6) });
            if (bw >= 3.0) ops.push(win(uc + 0.62, f0, 1.0));
            bals.push([j * bw + 0.14, (j + 1) * bw - 0.14, f0]);
          } else {
            ops.push(win(uc, f0, S.winW));
            if (r() < 0.12) acs.push([uc + S.winW / 2 + 0.55, f0 + 1.0]);
          }
        }
      } else {
        // yan cepheler: dar pencereler ve banyo pencereleri
        for (let k = 0; k < fl; k++) {
          if (k === 0 && shop) continue;
          for (let j = 0; j < nb; j++) {
            const uc = (j + 0.5) * bw, f0 = fb(k);
            if (j % 2 === 0) { ops.push(win(uc, f0, 1.0, 1.35, 0.95)); if (r() < 0.22) acs.push([uc + 1.05, f0 + 1.1]); }
            else if (r() < 0.6) ops.push(small(uc, f0));
          }
        }
      }
    }
    b.wall(wk, L, H, ops, { plinth: plH, pcol });
    b.openings(wk, ops, { plinth: plH, trimCol: trim });
    // balkonlar
    for (const [u0, u1, f0] of bals) {
      const bc = b.hex(S.balCol);
      b.box('trim', u0, u1, f0 - 0.18, f0, 0, bd, trim);
      if (S.balcony === 'rail') {
        const n = Math.max(1, Math.round((u1 - u0) / 1.0)), mw = (u1 - u0) / n;
        for (let i = 0; i < n; i++) b.inst('rail', b.at(u0 + (i + 0.5) * mw, f0, bd - 0.04, mw, 1, 1), 0x2e3134);
        const ns = Math.max(1, Math.round(bd)), ms = bd / ns;
        for (let i = 0; i < ns; i++) { b.inst('rail', b.at(u0 + 0.03, f0, (i + 0.5) * ms, ms, 1, 1, Math.PI / 2), 0x2e3134); b.inst('rail', b.at(u1 - 0.03, f0, (i + 0.5) * ms, ms, 1, 1, Math.PI / 2), 0x2e3134); }
      } else {
        const ph = S.balcony === 'glazed' ? 0.92 : 1.02;
        b.box('wall', u0, u1, f0, f0 + ph, bd - 0.12, bd, bc, 1);
        b.box('wall', u0, u0 + 0.12, f0, f0 + ph, 0, bd - 0.12, bc, 1);
        b.box('wall', u1 - 0.12, u1, f0, f0 + ph, 0, bd - 0.12, bc, 1);
        b.box('trim', u0 - 0.02, u1 + 0.02, f0 + ph, f0 + ph + 0.05, bd - 0.15, bd + 0.02, trim);
        b.box('trim', u0 - 0.02, u0 + 0.15, f0 + ph, f0 + ph + 0.05, 0, bd - 0.15, trim);
        b.box('trim', u1 - 0.15, u1 + 0.02, f0 + ph, f0 + ph + 0.05, 0, bd - 0.15, trim);
        if (S.balcony === 'glazed') {
          const gh = fh - ph - 0.25, n = Math.max(2, Math.round((u1 - u0) / 0.85)), pw = (u1 - u0 - 0.04) / n, vc = f0 + ph + 0.05 + gh / 2;
          for (let i = 0; i < n; i++) {
            const uc = u0 + 0.02 + (i + 0.5) * pw;
            b.inst('glz', b.at(uc, vc, bd - 0.07, pw / 0.9, gh / 1.6, 1), 0xd9dbdc);
            b.inst('glass', b.at(uc, vc, bd - 0.075, pw, gh, 1), null, [5, f0 - vc, u1 - u0, bd - 0.1]);
          }
          for (const us of [u0 + 0.06, u1 - 0.06]) {
            b.inst('glz', b.at(us, vc, (bd - 0.1) / 2, (bd - 0.14) / 0.9, gh / 1.6, 1, Math.PI / 2), 0xd9dbdc);
            b.inst('glass', b.at(us, vc, (bd - 0.1) / 2, bd - 0.14, gh, 1, us < u1 - 0.1 ? -Math.PI / 2 : Math.PI / 2), null, [5, f0 - vc, bd, u1 - u0]);
          }
          b.box('trim', u0, u1, f0 + fh - 0.2, f0 + fh - 0.02, 0, bd, trim);
        } else if (r() < 0.25) b.inst('dish', b.at(u0 + 0.45, f0 + ph + 0.05, bd - 0.2, 1, 1, 1, r() * 0.8 - 0.4));
      }
      if (r() < 0.3) b.inst('ac', b.at(u1 - 0.55, f0 + 0.05, 0.0, 1, 1, 1));
    }
    for (const [u, v] of acs) b.inst('ac', b.at(u, v, 0, 1, 1, 1));
  }
  // kat silmeleri, dükkân üstü korniş
  b.local();
  if (S.bands) for (let k = 1; k < fl; k++) b.ring('trim', -w / 2, w / 2, -d / 2, d / 2, fb(k) - 0.06, [[0, 0], [0.045, 0], [0.045, 0.2], [0, 0.2]], trim);
  if (shop) b.ring('trim', -w / 2, w / 2, -d / 2, d / 2, g0 - 0.3, [[0, 0], [0.09, 0], [0.12, 0.08], [0.12, 0.26], [0, 0.26]], trim, 1);
  roofTop(b, S, r, { trim, wk });
}

function emitHouse(b, S, r) {
  const { w, d, fh, g0, raise, fl, H } = S;
  const fb = (k) => (k === 0 ? raise : g0 + (k - 1) * fh);
  const trim = b.hex(S.band), pcol = b.hex(pickR(r, [0x8a857b, 0x9a9282, 0x6f6b64]));
  const plH = raise + 0.2, rd = rdOf(S);
  for (let side = 0; side < 4; side++) {
    const L = b.side(side, w, d);
    const att = (side === 1 && S.attR) || (side === 3 && S.attL);
    const ops = [];
    if (!att) {
      const nb = Math.max(1, Math.round(L / S.bay)), bw = L / nb, ent = Math.floor(nb / 2);
      for (let k = 0; k < fl; k++) for (let j = 0; j < nb; j++) {
        const uc = (j + 0.5) * bw, f0 = fb(k);
        if (side === 0 && k === 0 && j === ent) {
          ops.push({ u0: uc - 0.58, u1: uc + 0.58, v0: 0.42, v1: 2.75, rd: 0.3, leaf: 'woodDoor', lcol: pickR(r, [0x6b4a30, 0x4e3524, 0x7a5a3a, 0x3f4a40]), hood: true, scol: trim });
          b.box('plinth', uc - 0.95, uc + 0.95, 0, 0.21, 0, 0.9, pcol); b.box('plinth', uc - 0.8, uc + 0.8, 0.21, 0.42, 0, 0.5, pcol);
          continue;
        }
        if (side % 2 === 1 && j % 2 === 1) continue;
        ops.push({ u0: uc - 0.5, u1: uc + 0.5, v0: f0 + 0.8, v1: f0 + 2.5, rd, frame: 'tall', fcol: S.frame, sill: true, scol: trim, hood: k > 0 && r() < 0.5,
          glass: [0, -0.8 - 0.85, 3.4, 4.2], bars: k === 0 && r() < 0.35, barCol: 0x2a2a2a });
      }
    }
    b.wall('wall', L, H, ops, { plinth: plH, pcol });
    b.openings('wall', ops, { plinth: plH, trimCol: trim });
  }
  b.local();
  for (let k = 1; k < fl; k++) b.ring('trim', -w / 2, w / 2, -d / 2, d / 2, fb(k) - 0.1, [[0, 0], [0.05, 0], [0.07, 0.05], [0.07, 0.2], [0, 0.26]], trim);
  roofTop(b, S, r, { trim, wk: 'wall' });
}

function emitOffice(b, S, r) {
  const { w, d, fh, g0, fl, H, top } = S;
  const fb = (k) => (k === 0 ? 0 : g0 + (k - 1) * fh);
  const spand = b.hex(S.wall), mul = b.hex(S.frame), trim = b.hex(S.band), stone = b.hex(pickR(r, PALETTES.stone));
  for (let side = 0; side < 4; side++) {
    const L = b.side(side, w, d);
    const nm = Math.max(2, Math.round(L / S.module)), mw = L / nm;
    // zemin: taş kaplı ayaklar arasında yüksek lobi camları
    const nb = Math.max(1, Math.round(L / 6)), bw = L / nb;
    const ops = [];
    if (S.lobby) for (let j = 0; j < nb; j++) {
      const u0 = j * bw + 0.45, u1 = (j + 1) * bw - 0.45, uc = (u0 + u1) / 2;
      const isEnt = side === 0 && j === Math.floor(nb / 2);
      ops.push({ u0, u1, v0: 0.05, v1: g0 - 0.9, rd: 0.3, rk: 'stone' });
      const gw = u1 - u0, np = Math.max(1, Math.round(gw / 1.6)), pw = gw / np;
      for (let i = 0; i < np; i++) {
        const pc = u0 + (i + 0.5) * pw;
        if (isEnt && i === Math.floor(np / 2)) { b.inst('entry', b.at(pc, 1.3, -0.2, pw / 1.4, 2.5 / 2.5 * 1.0, 1), 0x9aa0a4); b.inst('glass', b.at(pc, 1.3, -0.22, pw, 2.5, 1), null, [3, -1.3, 6, 10]); b.inst('glz', b.at(pc, 1.3 + 1.25 + (g0 - 0.95 - 2.55) / 2, -0.2, pw / 0.9, (g0 - 0.95 - 2.55) / 1.6, 1), 0x9aa0a4); b.inst('glass', b.at(pc, 1.3 + 1.25 + (g0 - 0.95 - 2.55) / 2, -0.22, pw, g0 - 0.95 - 2.55, 1), null, [2, -(2.55 + (g0 - 0.95 - 2.55) / 2), 8, 10]); continue; }
        const gh = g0 - 0.95, vc = 0.05 + gh / 2;
        b.inst('glz', b.at(pc, vc, -0.2, pw / 0.9, gh / 1.6, 1), 0x9aa0a4);
        b.inst('glass', b.at(pc, vc, -0.22, pw, gh, 1), null, [1, -vc + 0.05, 8, 10]);
      }
    }
    if (S.lobby) { b.wall('stone', L, g0 - 0.45, ops, {}); b.openings('stone', ops, {}); }
    // giydirme cephe: kat bantları (opak cam), görüş camı, dikmeler ve kayıtlar
    for (let k = 1; k < fl; k++) {
      const f0 = fb(k), vb = f0 + 0.75, vt = f0 + fh - 0.45, vc = (vb + vt) / 2;
      b.poly('panel', [[0, f0 - 0.45, 0], [L, f0 - 0.45, 0], [L, vb, 0], [0, vb, 0]], [0, 0, 1], spand);
      for (let i = 0; i < nm; i++) b.inst('glass', b.at((i + 0.5) * mw, vc, -0.04, mw, vt - vb, 1), null, [2, f0 - vc, 12, 9]);
      b.box('metal', 0, L, vb - 0.03, vb + 0.03, -0.05, 0.05, mul, 0);
      b.box('metal', 0, L, vt - 0.03, vt + 0.03, -0.05, 0.05, mul, 0);
    }
    b.poly('panel', [[0, top - 0.45, 0], [L, top - 0.45, 0], [L, H, 0], [0, H, 0]], [0, 0, 1], spand);
    for (let i = 0; i <= nm; i++) b.box('metal', i * mw - 0.035, i * mw + 0.035, Math.max(0, g0 - 0.05), H - 0.1, -0.02, 0.14, mul, 0);
  }
  b.local();
  b.ring('metal', -w / 2, w / 2, -d / 2, d / 2, H, [[-0.3, 0], [0.08, 0], [0.08, 0.1], [-0.3, 0.1], [-0.3, 0]], mul);
  if (S.lobby) b.ring('stone', -w / 2, w / 2, -d / 2, d / 2, g0 - 0.8, [[0, 0], [0.25, 0], [0.25, 0.35], [0, 0.35]], stone);
  roofTop(b, S, r, { trim, wk: 'panel', office: true });
}

function emitPublic(b, S, r) {
  const { w, d, fh, g0, raise, fl, H, top } = S;
  const fb = (k) => (k === 0 ? raise : g0 + (k - 1) * fh);
  const trim = b.hex(S.band), st = b.hex(S.wall);
  const pw = Math.min(w * 0.46, 24), nc = pw > 18 ? 8 : 6, colH = top - raise - 1.3, pz = 3.4;
  for (let side = 0; side < 4; side++) {
    const L = b.side(side, w, d);
    const nb = Math.max(1, Math.round(L / S.bay)), bw = L / nb, ops = [];
    for (let k = 0; k < fl; k++) for (let j = 0; j < nb; j++) {
      const uc = (j + 0.5) * bw, f0 = fb(k);
      if (side === 0 && k === 0 && Math.abs(uc - L / 2) < 1.2) {
        ops.push({ u0: uc - 1.2, u1: uc + 1.2, v0: raise, v1: raise + 4.2, rd: 0.45, leaf: 'woodDoor', lcol: 0x5a3a24, hood: true, scol: trim });
        continue;
      }
      ops.push({ u0: uc - 0.75, u1: uc + 0.75, v0: f0 + 0.9, v1: f0 + 3.8, rd: 0.3, frame: 'tall', fcol: S.frame, sill: true, scol: trim, hood: true, glass: [0, -0.9 - 1.45, 5, 7] });
    }
    b.wall('stone', L, H, ops, { plinth: raise + 0.05, pkey: 'stone', pcol: b.hex(0xbdb4a2) });
    b.openings('stone', ops, { plinth: raise + 0.05, trimCol: trim });
  }
  b.local();
  // kaide + ön merdiven
  b.ring('stone', -w / 2, w / 2, -d / 2, d / 2, 0, [[0, 0], [0.5, 0], [0.5, raise], [0, raise]], b.hex(0xc9c0ad));
  for (let s = 0; s < 6; s++) { const y = s * raise / 6; b.box('stone', -pw / 2 - 1, pw / 2 + 1, y, y + raise / 6, d / 2 + 0.5, d / 2 + pz + 3.2 - s * 0.45, b.hex(0xd2c9b6), 0); }
  b.box('stone', -pw / 2 - 0.4, pw / 2 + 0.4, 0, raise, d / 2, d / 2 + pz + 0.9, b.hex(0xd2c9b6), 0);
  // kolonat: kaide, entasisli gövde, başlık
  const shaft = new THREE.LatheGeometry(V2(Array.from({ length: 9 }, (_, i) => { const t = i / 8; return [0.62 * (1 - 0.12 * t * t), 0.55 + t * (colH - 1.1)]; })), 24);
  const cbase = new THREE.LatheGeometry(V2([[0, 0], [0.9, 0], [0.9, 0.22], [0.78, 0.32], [0.72, 0.45], [0.62, 0.55], [0, 0.55]]), 24);
  const cap = new THREE.LatheGeometry(V2([[0, colH - 0.55], [0.56, colH - 0.55], [0.6, colH - 0.45], [0.8, colH - 0.25], [0.9, colH - 0.1], [0, colH - 0.1]]), 24);
  for (let i = 0; i < nc; i++) {
    const x = -pw / 2 + 0.9 + i * (pw - 1.8) / (nc - 1);
    for (const g of [shaft, cbase, cap]) b.geo('trim', g, new THREE.Matrix4().makeTranslation(x, raise, d / 2 + pz), trim);
    b.box('trim', x - 0.95, x + 0.95, raise + colH - 0.1, raise + colH + 0.2, d / 2 + pz - 0.95, d / 2 + pz + 0.95, trim);
  }
  // saçaklık, alınlık, eğik kornişler
  const eY = raise + colH + 0.2;
  b.box('stone', -pw / 2 - 0.3, pw / 2 + 0.3, eY, eY + 1.6, d / 2, d / 2 + pz + 1.1, st);
  b.box('trim', -pw / 2 - 0.5, pw / 2 + 0.5, eY + 1.6, eY + 1.9, d / 2, d / 2 + pz + 1.35, trim);
  const ph = pw * 0.2, zF = d / 2 + pz + 1.05;
  b.poly('stone', [[-pw / 2 - 0.2, eY + 1.9, zF], [pw / 2 + 0.2, eY + 1.9, zF], [0, eY + 1.9 + ph, zF]], [0, 0, 1], st);
  const rl = [[-pw / 2 - 0.55, eY + 1.9, zF + 0.2], [0, eY + 1.95 + ph + 0.2, zF + 0.2], [pw / 2 + 0.55, eY + 1.9, zF + 0.2]];
  b.beam('trim', rl[0], rl[1], 0.7, 0.35, trim); b.beam('trim', rl[1], rl[2], 0.7, 0.35, trim);
  // portik çatısı (alınlık arkası, bina gövdesine uzanır)
  const rc = b.hex(S.roofCol);
  b.poly('metal', [[-pw / 2 - 0.5, eY + 1.9, zF + 0.1], [0, eY + 1.9 + ph, zF + 0.1], [0, eY + 1.9 + ph, d / 2 - 1], [-pw / 2 - 0.5, eY + 1.9, d / 2 - 1]], [-ph, pw / 2, 0], rc);
  b.poly('metal', [[pw / 2 + 0.5, eY + 1.9, zF + 0.1], [0, eY + 1.9 + ph, zF + 0.1], [0, eY + 1.9 + ph, d / 2 - 1], [pw / 2 + 0.5, eY + 1.9, d / 2 - 1]], [ph, pw / 2, 0], rc);
  // korniş + parapet (atika)
  b.ring('trim', -w / 2, w / 2, -d / 2, d / 2, top, [[0, 0], [0.08, 0.05], [0.12, 0.2], [0.35, 0.35], [0.45, 0.5], [0.45, 0.62], [0, 0.62]], trim);
  for (let k = 1; k < fl; k++) b.ring('trim', -w / 2, w / 2, -d / 2, d / 2, fb(k) - 0.15, [[0, 0], [0.1, 0], [0.12, 0.3], [0, 0.3]], trim);
  roofTop(b, S, r, { trim, wk: 'stone' });
}

function emitIndustrial(b, S, r) {
  const { w, d, H, fh } = S;
  const wk = S.brick ? 'brick' : 'clad', trim = b.hex(S.band), pcol = b.hex(0x8f8b83);
  for (let side = 0; side < 4; side++) {
    const L = b.side(side, w, d), ops = [];
    const nb = Math.max(1, Math.round(L / S.bay)), bw = L / nb;
    for (let j = 0; j < nb; j++) {
      const uc = (j + 0.5) * bw;
      if (side === 0 && (j === 1 || (nb > 5 && j === nb - 2))) {
        ops.push({ u0: uc - 2.0, u1: uc + 2.0, v0: 0.05, v1: 4.55, rd: 0.25, leaf: 'shutter', lcol: pickR(r, [0x9aa3a8, 0x6d7e8a, 0xb0a888]) });
        continue;
      }
      if (bw > 2.8) ops.push({ u0: uc - 1.2, u1: uc + 1.2, v0: Math.min(2.8, fh - 2.6), v1: Math.min(2.8, fh - 2.6) + 1.8, rd: 0.22, frame: 'ind', fcol: S.frame, sill: true, scol: trim, glass: [4, -3.6, 8, 12] });
    }
    b.wall(wk, L, H, ops, { plinth: 0.6, pkey: 'trim', pcol: pcol });
    b.openings(wk, ops, { plinth: 0.6, trimCol: trim });
  }
  b.local();
  roofTop(b, S, r, { trim, wk });
}

// ---------------------------------------------------------------------------- Çatılar
function hipRoof(b, S, { key = 'tile', gable = false, o = 0.5, pitch = 0.52, trim, wk = 'wall' }) {
  const { w, d, H } = S;
  const tn = Math.tan(pitch), ye = H - o * tn, a = w / 2 + o, bb = d / 2 + o;
  const col = b.hex(S.roofCol);
  const along = a >= bb, half = along ? bb : a, r = gable ? (along ? a : bb) : (along ? a - bb : bb - a), yr = ye + half * tn;
  const e = [[-a, ye, bb], [a, ye, bb], [a, ye, -bb], [-a, ye, -bb]];
  const R0 = along ? [-r, yr, 0] : [0, yr, -r], R1 = along ? [r, yr, 0] : [0, yr, r];
  const nrm = (p, q, s) => { const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [s[0] - p[0], s[1] - p[1], s[2] - p[2]]; let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; if (n[1] < 0) n = n.map((x) => -x); return n; };
  const face = (pts) => { b.poly(key, pts, nrm(pts[0], pts[1], pts[2]), col); b.poly('trim', pts.map((p) => [p[0], p[1] - 0.06, p[2]]), nrm(pts[0], pts[1], pts[2]).map((x) => -x), trim); };
  if (along) {
    face([e[0], e[1], R1, R0]); face([e[2], e[3], R0, R1]);
    if (!gable) { face([e[1], e[2], R1]); face([e[3], e[0], R0]); }
  } else {
    face([e[1], e[2], R0, R1]); face([e[3], e[0], R1, R0]);
    if (!gable) { face([e[0], e[1], R1]); face([e[2], e[3], R0]); }
  }
  // saçak: alın tahtası + saçak altı
  const fcol = trim;
  if (gable) {
    const gx = along ? w / 2 : d / 2, gz = along ? d / 2 : w / 2;
    for (const sgn of [1, -1]) {
      const pts = along ? [[sgn * gx, H, gz], [sgn * gx, H, -gz], [sgn * gx, H + gz * tn, 0]] : [[gz, H, sgn * gx], [-gz, H, sgn * gx], [0, H + gz * tn, sgn * gx]];
      b.poly(wk, pts, along ? [sgn, 0, 0] : [0, 0, sgn]);
      const eA = along ? [sgn * (a + 0.02), ye, bb] : [bb, ye, sgn * (a + 0.02)], eB = along ? [sgn * (a + 0.02), ye, -bb] : [-bb, ye, sgn * (a + 0.02)], top = along ? [sgn * (a + 0.02), yr, 0] : [0, yr, sgn * (a + 0.02)];
      b.beam('trim', eA, top, 0.05, 0.26, fcol); b.beam('trim', top, eB, 0.05, 0.26, fcol);
    }
    const sides = along ? 5 : 10;
    b.ring('trim', -w / 2, w / 2, -d / 2, d / 2, ye - 0.2, [[0, 0], [o, 0], [o, 0.2]], fcol, sides);
  } else {
    b.ring('trim', -w / 2, w / 2, -d / 2, d / 2, ye - 0.2, [[0, 0], [o, 0], [o, 0.2]], fcol);
  }
  // mahya ve kırma mahyaları
  const cap = b.hex(S.roofCol === 0x5c6b66 ? 0x4e5b57 : 0x8e3f2c);
  b.beam(key, [R0[0], R0[1] + 0.05, R0[2]], [R1[0], R1[1] + 0.05, R1[2]], 0.26, 0.14, cap);
  if (!gable) { b.beam(key, [e[0][0], e[0][1] + 0.04, e[0][2]], [R0[0], R0[1] + 0.04, R0[2]], 0.22, 0.12, cap);
    b.beam(key, [e[3][0], e[3][1] + 0.04, e[3][2]], [R0[0], R0[1] + 0.04, R0[2]], 0.22, 0.12, cap);
    b.beam(key, [e[1][0], e[1][1] + 0.04, e[1][2]], [R1[0], R1[1] + 0.04, R1[2]], 0.22, 0.12, cap);
    b.beam(key, [e[2][0], e[2][1] + 0.04, e[2][2]], [R1[0], R1[1] + 0.04, R1[2]], 0.22, 0.12, cap); }
  // oluk
  b.ring('metal', -w / 2 - o, w / 2 + o, -d / 2 - o, d / 2 + o, ye - 0.2, [[0, 0.02], [0.1, 0.0], [0.13, 0.1]], b.hex(0x8d9092), gable ? (along ? 5 : 10) : 15);
  return { ye, yr, R0, R1, along };
}

function roofTop(b, S, r, { trim, wk, office = false }) {
  const { w, d, H, top } = S;
  b.local();
  if (S.roof === 'hip' || S.roof === 'gable') {
    const key = S.type === 'public' ? 'metal' : 'tile';
    const R = hipRoof(b, S, { key, gable: S.roof === 'gable', o: S.type === 'house' ? 0.65 : S.type === 'public' ? 0.4 : 0.45, pitch: S.type === 'public' ? 0.35 : 0.5 + r() * 0.1, trim, wk });
    // bacalar, antenler
    const nch = S.type === 'house' ? 1 + Math.floor(r() * 2) : S.type === 'apartment' ? Math.floor(r() * 3) : 0;
    for (let i = 0; i < nch; i++) {
      const x = (r() - 0.5) * w * 0.5, z = (r() - 0.5) * d * 0.4, y1 = R.yr + 0.7;
      b.box(wk === 'brick' ? 'brick' : 'wall', x - 0.3, x + 0.3, R.ye, y1, z - 0.25, z + 0.25, undefined, 1);
      b.box('trim', x - 0.38, x + 0.38, y1, y1 + 0.1, z - 0.33, z + 0.33, trim);
    }
    const na = S.type === 'public' ? 0 : Math.floor(r() * (S.type === 'apartment' ? 3 : 2));
    for (let i = 0; i < na; i++) { const t = r(); const p = [R.R0[0] + (R.R1[0] - R.R0[0]) * t, R.yr, R.R0[2] + (R.R1[2] - R.R0[2]) * t]; b.inst('antenna', b.at(p[0], p[1] - 0.2, p[2], 1, 0.8 + r() * 0.4, 1, r() * 3)); }
    return;
  }
  if (S.roof === 'saw' && S.type === 'industrial') {
    const n = Math.max(2, Math.round(w / 7)), sw = w / n, rh = 2.6;
    const rc = b.hex(S.roofCol);
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + i * sw, x1 = x0 + sw;
      b.poly('clad', [[x0, H, d / 2], [x1, H + rh, d / 2], [x1, H + rh, -d / 2], [x0, H, -d / 2]], [-rh, sw, 0], rc);
      b.poly('panel', [[x1, H, d / 2], [x1, H + rh, d / 2], [x1, H + rh, -d / 2], [x1, H, -d / 2]], [1, 0, 0], b.hex(0x4a5a66));
      b.poly(S.brick ? 'brick' : 'clad', [[x0, H, d / 2], [x1, H, d / 2], [x1, H + rh, d / 2]], [0, 0, 1]);
      b.poly(S.brick ? 'brick' : 'clad', [[x0, H, -d / 2], [x1, H, -d / 2], [x1, H + rh, -d / 2]], [0, 0, -1]);
    }
    b.ring('trim', -w / 2, w / 2, -d / 2, d / 2, H - 0.25, [[0, 0], [0.08, 0], [0.08, 0.25], [0, 0.25]], trim);
    return;
  }
  if (S.type === 'industrial') { S.roof = 'gable'; hipRoof(b, S, { key: 'clad', gable: true, o: 0.35, pitch: 0.2, trim, wk }); return; }
  // düz çatı: parapet iç yüzü, kaplama, harpuşta
  const ins = 0.22, rc = b.hex(S.roofCol), y = top + 0.06;
  b.poly('roof', [[-w / 2 + ins, y, d / 2 - ins], [w / 2 - ins, y, d / 2 - ins], [w / 2 - ins, y, -d / 2 + ins], [-w / 2 + ins, y, -d / 2 + ins]], [0, 1, 0], rc);
  b.ring(wk, -w / 2, w / 2, -d / 2, d / 2, y, [[-ins, H - y], [-ins, 0]]);
  if (!office) b.ring('trim', -w / 2, w / 2, -d / 2, d / 2, H, [[-ins - 0.03, 0], [0.04, 0], [0.04, 0.07], [-ins - 0.03, 0.07], [-ins - 0.03, 0]], trim);
  // çatı donanımı (Türk düz çatısı): merdiven kovası, su deposu, güneş enerjili ısıtıcı, anten, çanak; ofiste klima
  const iw = w - 2 * ins - 1.2, id = d - 2 * ins - 1.2;
  if (iw < 2 || id < 2 || S.roofGear === false) return;
  const cs = 2.6, nx = Math.max(1, Math.floor(iw / cs)), nz = Math.max(1, Math.floor(id / cs));
  const cells = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) cells.push([-iw / 2 + (i + 0.5) * iw / nx, -id / 2 + (j + 0.5) * id / nz]);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  let ci = 0;
  const next = () => (ci < cells.length ? cells[ci++] : null);
  const wallC = b.hex(S.type === 'office' ? S.band : S.wall);
  if (S.type !== 'industrial' && w > 9 && d > 8) {
    const c = next();
    if (c) {
      const [x, z] = c, ph = office ? 3.4 : 2.6, hw = office ? 3 : 1.5, hd = office ? 2.5 : 1.3;
      b.box(office ? 'panel' : wk, x - hw, x + hw, y, y + ph, z - hd, z + hd, wallC, 1);
      b.box('trim', x - hw - 0.05, x + hw + 0.05, y + ph, y + ph + 0.08, z - hd - 0.05, z + hd + 0.05, trim, 1);
      b.inst('woodDoor', b.at(x, y + 1.05, z + hd + 0.035, 0.85 / 1.1, 2.0 / 2.3, 1), 0x6d7175);
    }
  }
  const R = S.rot || 0;
  if (office) {
    const n = 3 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) { const c = next(); if (!c) break; b.inst('ac', b.at(c[0], y + 0.25, c[1], 1.8, 1.8, 1.8, Math.floor(r() * 4) * Math.PI / 2)); }
    const c = next(); if (c) b.inst('antenna', b.at(c[0], y, c[1], 1.4, 2.2, 1.4));
    return;
  }
  const nt = 1 + Math.floor(r() * 3), ns = S.type === 'apartment' ? Math.floor(r() * 5) : 0, na = 1 + Math.floor(r() * 3), nd = Math.floor(r() * 3);
  for (let i = 0; i < ns; i++) { const c = next(); if (!c) break; const m = b.at(c[0], y, c[1], 1, 1, 1, -R); b.inst('solarP', m); b.inst('solarT', m, pickR(r, [0xeeeeea, 0xd7d9da, 0xe8e4d8])); b.inst('solarF', m); }
  for (let i = 0; i < nt; i++) { const c = next(); if (!c) break; b.inst('tank', b.at(c[0], y, c[1], 1, 1, 1, r() * 3), pickR(r, [0xe9e9e4, 0xcdd0d2, 0x9aa4ab, 0xdadcd0])); }
  for (let i = 0; i < na; i++) { const c = next(); if (!c) break; b.inst('antenna', b.at(c[0], y, c[1], 1, 0.8 + r() * 0.5, 1, r() * 3)); }
  for (let i = 0; i < nd; i++) { const c = next(); if (!c) break; b.inst('dish', b.at(c[0], y, c[1], 1.2, 1.2, 1.2, -R + (r() - 0.5))); }
}

const EMIT = { apartment: emitApartment, house: emitHouse, office: emitOffice, public: emitPublic, industrial: emitIndustrial };
function emitBuilding(b, S, origin = [0, 0]) {
  b.T.compose(_v.set(S.x - origin[0], S.y0, S.z - origin[1]), _q.setFromAxisAngle(_up, S.rot), _s.set(1, 1, 1));
  b.inf = [S.y0, S.H, (S.seed * 0.618) % 1, S.age];
  b.color(S.wall);
  const r = cityRng(S.seed + 7.77);
  EMIT[S.type](b, { ...S }, r);
}

// ---------------------------------------------------------------------------- Uzak kabuk
function emitShell(A, S, origin) {
  const { w, d, H } = S;
  const c = Math.cos(S.rot), s = Math.sin(S.rot), X = S.x - origin[0], Z = S.z - origin[1], Y = S.y0;
  const Wp = (lx, y, lz) => [X + lx * c + lz * s, Y + y, Z - lx * s + lz * c];
  const Wn = (nx, nz) => [nx * c + nz * s, 0, -nx * s + nz * c];
  _c.set(S.type === 'office' ? S.wall : S.wall);
  const col = [_c.r, _c.g, _c.b];
  const top = S.roof === 'flat' ? S.top : S.H + 5;
  const prm = [S.fh, S.type === 'office' ? 1.5 : S.bay, S.style, (S.seed * 0.618) % 1];
  const quad = (pts, n, uv, sz, ex, cl) => {
    const base = A.p.length / 3;
    pts.forEach((p, i) => { A.p.push(...p); A.n.push(...n); A.c.push(...cl); A.uv.push(...uv[i]); A.sz.push(...sz); A.pr.push(...prm); A.ex.push(...ex); });
    A.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const tri = (pts, n, ex, cl) => {
    const base = A.p.length / 3;
    pts.forEach((p) => { A.p.push(...p); A.n.push(...n); A.c.push(...cl); A.uv.push(p[0], p[2]); A.sz.push(1, 1); A.pr.push(...prm); A.ex.push(...ex); });
    A.i.push(base, base + 1, base + 2);
  };
  const w2 = w / 2, d2 = d / 2;
  const sides = [[[-w2, d2], [w2, d2], [0, 1], w], [[w2, d2], [w2, -d2], [1, 0], d], [[w2, -d2], [-w2, -d2], [0, -1], w], [[-w2, -d2], [-w2, d2], [-1, 0], d]];
  sides.forEach(([p0, p1, n, len], k) => {
    const att = (k === 1 && S.attR) || (k === 3 && S.attL);
    quad([Wp(p0[0], 0, p0[1]), Wp(p1[0], 0, p1[1]), Wp(p1[0], H, p1[1]), Wp(p0[0], H, p0[1])], Wn(n[0], n[1]),
      [[0, 0], [len, 0], [len, H], [0, H]], [len, H], [S.shop && k === 0 ? 1 : 0, 0, S.g0, att ? -1 : top], col);
  });
  if (S.roof === 'flat') {
    _c.set(S.roofCol);
    quad([Wp(-w2, H, d2), Wp(w2, H, d2), Wp(w2, H, -d2), Wp(-w2, H, -d2)], [0, 1, 0], [[0, d], [w, d], [w, 0], [0, 0]], [w, d], [0, 1, 0, 0], [_c.r, _c.g, _c.b]);
  } else {
    _c.set(S.roofCol);
    const rc = [_c.r, _c.g, _c.b];
    const o = 0.45, tn = Math.tan(S.type === 'industrial' ? 0.2 : 0.5), ye = H - o * tn, a = w2 + o, bb = d2 + o;
    const along = a >= bb, half = along ? bb : a, gable = S.roof !== 'hip', r = gable ? (along ? a : bb) : (along ? a - bb : bb - a), yr = ye + half * tn;
    const e = [Wp(-a, ye, bb), Wp(a, ye, bb), Wp(a, ye, -bb), Wp(-a, ye, -bb)];
    const R0 = along ? Wp(-r, yr, 0) : Wp(0, yr, -r), R1 = along ? Wp(r, yr, 0) : Wp(0, yr, r);
    const nn = (p, q, t) => { const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [t[0] - p[0], t[1] - p[1], t[2] - p[2]]; let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l); return n[1] < 0 ? n.map((x) => -x) : n; };
    const ex = [0, 2, 0, 0];
    const addT = (p, q, t) => { const n = nn(p, q, t); const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [t[0] - p[0], t[1] - p[1], t[2] - p[2]]; const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; if (g[1] < 0) tri([p, t, q], n, ex, rc); else tri([p, q, t], n, ex, rc); };
    if (along) { addT(e[0], e[1], R1); addT(e[0], R1, R0); addT(e[2], e[3], R0); addT(e[2], R0, R1); if (!gable) { addT(e[1], e[2], R1); addT(e[3], e[0], R0); } }
    else { addT(e[1], e[2], R0); addT(e[1], R0, R1); addT(e[3], e[0], R1); addT(e[3], R1, R0); if (!gable) { addT(e[0], e[1], R1); addT(e[2], e[3], R0); } }
    if (gable) {
      const gx = along ? w2 : d2, gz = along ? d2 : w2;
      for (const sg of [1, -1]) {
        const pts = along ? [Wp(sg * gx, H, gz), Wp(sg * gx, H, -gz), Wp(sg * gx, H + gz * tn, 0)] : [Wp(gz, H, sg * gx), Wp(-gz, H, sg * gx), Wp(0, H + gz * tn, sg * gx)];
        addT(pts[0], pts[1], pts[2]);
      }
    }
    // saçak altını kapat (alttan bakınca delik görünmesin)
    const ys = ye - 0.05;
    const q = [Wp(-a, ys, bb), Wp(a, ys, bb), Wp(a, ys, -bb), Wp(-a, ys, -bb)];
    tri([q[0], q[2], q[1]], [0, -1, 0], [0, 1, 0, 0], col); tri([q[0], q[3], q[2]], [0, -1, 0], [0, 1, 0, 0], col);
  }
}

function buildShell(specs, origin, shellMat = buildingMaterials().shell) {
  const A = { p: [], n: [], c: [], uv: [], sz: [], pr: [], ex: [], i: [] };
  for (const S of specs) emitShell(A, S, origin);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(A.c, 3));
  g.setAttribute('fuv', new THREE.Float32BufferAttribute(A.uv, 2));
  g.setAttribute('fsz', new THREE.Float32BufferAttribute(A.sz, 2));
  g.setAttribute('fprm', new THREE.Float32BufferAttribute(A.pr, 4));
  g.setAttribute('fex', new THREE.Float32BufferAttribute(A.ex, 4));
  g.setIndex(A.i);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, shellMat);
  m.castShadow = m.receiveShadow = true; m.userData.noFit = true; m.userData.own = true;
  m.name = 'bld:shell';
  return m;
}

// ============================================================================ Karolar (LOD)
let budgetT = 0, budgetUsed = 0;
class CityTile extends THREE.Object3D {
  constructor(specs, cx, cz, opts) {
    super();
    this.isLOD = true; this.autoUpdate = true;
    this.specs = specs; this.opts = opts;
    this.position.set(cx, 0, cz);
    this.box = new THREE.Box3();
    for (const S of specs) {
      const rr = Math.hypot(S.w, S.d) / 2 + 1;
      this.box.expandByPoint(_v.set(S.x - rr, S.y0, S.z - rr)); this.box.expandByPoint(_v.set(S.x + rr, S.y0 + S.height, S.z + rr));
    }
    this.low = buildShell(specs, [cx, cz], opts.mats?.shell);
    if (opts.noRaycast) this.low.raycast = () => {};
    this.add(this.low);
    this.high = null;
    this.name = 'city:tile';
  }
  /** Ayrıntılı geometriyi üret. budget (ms) verilirse bina bina ilerler, bitince true döner. */
  buildHigh(budget = Infinity) {
    if (this.high) return true;
    const t0 = performance.now();
    if (!this.bld) { this.bld = new Builder(); this.k = 0; }
    const o = [this.position.x, this.position.z];
    while (this.k < this.specs.length) {
      emitBuilding(this.bld, this.specs[this.k++], o);
      if (performance.now() - t0 > budget) return false;
    }
    this.high = this.bld.finish(new THREE.Group(), this.opts.mats);
    this.bld = null;
    if (this.opts.noRaycast) this.high.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
    this.high.name = 'city:tile-high';
    this.add(this.high);
    this.high.updateMatrixWorld(true);
    return true;
  }
  distTo(p) { return this.box.distanceToPoint(p); }
  update(camera) {
    _v.setFromMatrixPosition(camera.matrixWorld);
    if (this.parent) this.parent.worldToLocal(_v);
    const dist = this.distTo(_v), near = this.opts.near;
    const want = this.high ? dist < near * 1.15 : dist < near;
    if (want && !this.high) {
      const now = performance.now();
      if (now - budgetT > 12) { budgetT = now; budgetUsed = 0; }   // yeni kare: bütçe sıfırlanır
      const left = this.opts.budget - budgetUsed;
      if (left > 0) { this.buildHigh(left); budgetUsed += performance.now() - now; }
    }
    const hi = want && !!this.high;
    if (this.high) this.high.visible = hi;
    this.low.visible = !hi;
  }
  dispose() {
    this.traverse((o) => { if (o.userData.own && o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
  }
}

// ============================================================================ Genel API
/**
 * Tek bina. o = { type: 'apartment'|'house'|'office'|'public'|'industrial', floors, width, depth, seed,
 *   colors: { wall, trim, roof, frame }, shop, roof: 'hip'|'gable'|'flat'|'saw', balcony: 'solid'|'rail'|'glazed'|'none',
 *   material: 'brick'|'plaster', attL/attR (bitişik yan duvar: pencere yok), age (0–1 yıpranma), lod: false → hep ayrıntılı }
 * Döner: Object3D (yerel orijin = taban merkezi, ön cephe +z). userData.spec: hesaplanan ölçüler (H, height, top …).
 */
export function makeBuilding(o = {}) {
  const S = spec({ ...o, x: 0, z: 0, rot: 0, y0: 0 });
  const g = new THREE.Group();
  g.name = 'building:' + S.type;
  if (o.lod === false) {
    const b = new Builder(); emitBuilding(b, S); b.finish(g);
  } else {
    const t = new CityTile([S], 0, 0, { near: o.near ?? (LOWQ ? 170 : 260), budget: 1e9 });
    t.buildHigh();
    g.add(t);
  }
  g.userData.spec = S;
  return g;
}

/**
 * Bir ada (iç dikdörtgen: kaldırım içi) için parsel listesi: ada çevresi boyunca yola bakan binalar.
 * rect = { x0, x1, z0, z1 }; o = { seed, mix: { apartment: 0.7, house: 0.2, office: 0.1 }, floors: (x, z, r, type) → kat,
 *   depth: [min, max], width: [min, max], gap: bina arası (0 → bitişik nizam), shops: 0–1, roofs: { hip, flat }, type: (x, z, r) → tip }
 * Döner: parsel dizisi (populateCity lots).
 */
export function makeBlock(rect, o = {}) {
  const r = cityRng((o.seed ?? 1) + 0.5);
  const lots = [];
  const inner = { x0: rect.x0, x1: rect.x1, z0: rect.z0, z1: rect.z1 };
  inner.w = inner.x1 - inner.x0; inner.d = inner.z1 - inner.z0;
  const mix = o.mix || { apartment: 0.78, house: 0.17, office: 0.05 };
  const mixE = Object.entries(mix), msum = mixE.reduce((s, [, v]) => s + v, 0);
  const pickType = (x, z) => {
    if (o.type) return o.type(x, z, r);
    let t = r() * msum; for (const [k, v] of mixE) { t -= v; if (t <= 0) return k; } return mixE[0][0];
  };
  const gap = o.gap ?? 3;
  const [dMin, dMax] = o.depth || [10, 14];
  const D = Math.min(dMax, inner.d / 2 - 0.5, inner.w / 2 - 0.5);
  if (D < 6) return lots;
  const place = (x, z, w, d, rot, attL, attR) => {
    const type = pickType(x, z);
    const L = { x, z, width: w, depth: d, rot, type, seed: r() * 1000, attL, attR };
    if (o.floors) L.floors = o.floors(x, z, r, type);
    if (type === 'apartment') L.shop = r() < (o.shops ?? 0.55);
    if (o.roofs && type !== 'office') L.roof = r() < (o.roofs.hip ?? 0.5) ? 'hip' : 'flat';
    if (type === 'office') { L.width = w; L.depth = d; }
    lots.push(L);
  };
  const run = (len, fn) => {
    let s = 0; const items = [];
    const [wMin, wMax] = o.width || [11, 19];
    while (s < len - 7) {
      let w = Math.min(wMin + r() * (wMax - wMin), len - s);
      if (len - s - w < 7) w = len - s;
      if (w < 7) break;
      items.push([s + w / 2, w]);
      s += w + (gap > 0 ? gap * (0.7 + r() * 0.6) : 0);
    }
    items.forEach(([c, w], i) => fn(c, w, gap <= 0 && i > 0, gap <= 0 && i < items.length - 1));
  };
  const d = dMin + r() * (D - dMin > 0 ? D - dMin : 0);
  const dd = Math.min(d, D);
  run(inner.w, (s, w, a, b) => place(inner.x0 + s, inner.z1 - dd / 2, w, dd, 0, a, b));
  run(inner.w, (s, w, a, b) => place(inner.x1 - s, inner.z0 + dd / 2, w, dd, Math.PI, a, b));
  const g2 = Math.max(gap, 1.5), zl = inner.d - 2 * dd - 2 * g2;
  if (zl > 9) {
    run(zl, (s, w, a, b) => place(inner.x1 - dd / 2, inner.z1 - dd - g2 - s, w, dd, Math.PI / 2, a, b));
    run(zl, (s, w, a, b) => place(inner.x0 + dd / 2, inner.z0 + dd + g2 + s, w, dd, -Math.PI / 2, a, b));
  }
  return lots;
}

/**
 * Çok bina: parselleri karolara ayırır; her karo uzakta tek çizimli kabuk, yakında ayrıntılı (tembel üretilir).
 * o = { lots: [{ x, z, rot, type, floors, width, depth, seed, y0, …makeBuilding seçenekleri }], seed, tile: karo boyu (m),
 *       near: ayrıntı uzaklığı (m), budget: kare başına üretim bütçesi (ms), camera: ilk karede yakındakileri hemen üret }
 * Döner: { group, specs, tiles, setLit(0–1), dispose(), stats() }
 */
export function populateCity(o = {}) {
  const tile = o.tile ?? 100, near = o.near ?? (LOWQ ? 170 : 280), budget = o.budget ?? 10;
  const mats = { ...buildingMaterials(), ...(o.ownLights ? cityLightSet() : null), ...(o.mats || null) };
  const group = new THREE.Group();
  group.name = 'city:buildings';
  const specs = (o.lots || []).map((L, i) => spec({ ...L, seed: L.seed ?? (o.seed ?? 1) * 1000 + i * 7.31 }));
  const bins = new Map();
  for (const S of specs) {
    const k = Math.floor(S.x / tile) + ',' + Math.floor(S.z / tile);
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(S);
  }
  const tiles = [];
  for (const [k, list] of bins) {
    const [i, j] = k.split(',').map(Number);
    const t = new CityTile(list, (i + 0.5) * tile, (j + 0.5) * tile, { near, budget, mats, noRaycast: !!o.noRaycast });
    tiles.push(t); group.add(t);
  }
  if (o.camera) {
    const p = o.camera.isObject3D ? o.camera.position : new THREE.Vector3().fromArray(o.camera);
    for (const t of tiles) if (t.distTo(p) < near) { t.buildHigh(); t.low.visible = false; }
  }
  return {
    group, specs, tiles,
    mats,
    setLit(v) { mats.glass.userData.uniforms.uLit.value = v; mats.shell.userData.uniforms.uLit.value = v; mats.sign.userData.uniforms.uSignLit.value = 0.05 + v * 1.6; },
    dispose() { tiles.forEach((t) => t.dispose()); },
    stats() { return { buildings: specs.length, tiles: tiles.length, detailed: tiles.filter((t) => t.high && t.high.visible).length }; },
  };
}
