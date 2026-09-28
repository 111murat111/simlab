// Prosedürel PBR malzeme kütüphanesi: harici doku yok; desen, pürüzlülük ve mikro kabartma nesne uzayında 3B gürültüden
// üretilir (UV gerekmez, ilkel geometride de dikişsiz). InstancedMesh'te her örnek kendi ton/desen varyasyonunu alır.
// Kullanım: import { mat } from '@core';  new THREE.Mesh(geo, mat.concrete({ color: 0xb8b2a7 }))
import * as THREE from 'three';
import { NOISE3_GLSL } from './terrain.js';

const EXTRA_GLSL = /* glsl */ `
float ridge3(vec3 p){ return 1.0 - abs(vn3(p)*2.0 - 1.0); }
float cells3(vec3 p){ // Worley F1
  vec3 i = floor(p), f = fract(p); float d = 1.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 g = vec3(x, y, z); vec3 o = vec3(h13(i + g), h13(i + g + 11.3), h13(i + g + 27.1));
    d = min(d, length(g + o - f));
  }
  return d;
}
// Örtüşmesiz (bant sınırlı) sürümler: piksel ayak izinden ince frekanslar ortalamasına söner
float aaW(vec3 q){ return 1.0 - smoothstep(0.25, 0.75, length(fwidth(q))); }
float vn3a(vec3 q){ return mix(0.5, vn3(q), aaW(q)); }
float cells3a(vec3 q){ return mix(0.55, cells3(q), aaW(q)); }
float fbm3a(vec3 q, int oct){
  float fw = length(fwidth(q)), s = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++){ if (i >= oct) break; s += a*mix(0.5, vn3(q), 1.0 - smoothstep(0.25, 0.75, fw)); q = q*2.03 + 17.1; fw *= 2.03; a *= 0.5; }
  return s;
}
vec3 axisDominant(vec3 n){ vec3 a = abs(n); return a.x > a.y && a.x > a.z ? vec3(1,0,0) : (a.y > a.z ? vec3(0,1,0) : vec3(0,0,1)); }
`;

/**
 * Genel prosedürel malzeme. pattern GLSL'i şu değişkenleri görür/değiştirir:
 *   vec3 p (nesne uzayı × ölçek), vec3 pn (nesne normali), float seed (örnek başına 0–1),
 *   vec3 col, float rough, float metal, float h (kabartma yüksekliği, ~0–1)
 */
export function procedural({ physical = false, params = {}, uniforms = {}, pattern, scale = 1, bump = 0.02, key }) {
  const M = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M(params);
  const U = { pScale: { value: scale }, pBump: { value: bump }, ...uniforms };
  m.userData.uniforms = U;
  const decl = Object.entries(U).map(([k, v]) => {
    const x = v.value;
    const t = typeof x === 'number' ? 'float' : x?.isColor || x?.isVector3 ? 'vec3' : x?.isVector2 ? 'vec2' : x?.isVector4 ? 'vec4' : 'float';
    return `uniform ${t} ${k};`;
  }).join('\n');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPObj; varying vec3 vNObj; varying float vSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPObj = position; vNObj = normal; vSeed = 0.0;
        #ifdef USE_INSTANCING
          vec3 it = instanceMatrix[3].xyz; vSeed = fract(sin(dot(it, vec3(12.9898, 78.233, 37.719)))*43758.5453);
          vPObj += it*0.37;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPObj; varying vec3 vNObj; varying float vSeed;
        ${decl}
        ${NOISE3_GLSL}
        ${EXTRA_GLSL}
        vec3 pCol; float pRough, pMetal, pH;
        void pattern(vec3 p, vec3 pn, float seed, inout vec3 col, inout float rough, inout float metal, inout float h){
          ${pattern.replace(/\bvn3\(/g, 'vn3a(').replace(/\bfbm3\(/g, 'fbm3a(').replace(/\bcells3\(/g, 'cells3a(')}
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        pCol = diffuseColor.rgb; pRough = roughness; pMetal = metalness; pH = 0.0;
        pattern(vPObj*pScale, vNObj/max(length(vNObj), 1e-6), vSeed, pCol, pRough, pMetal, pH);
        // NaN koruması: tek bir NaN piksel bloom zincirinde tüm ekranı karartır
        if (!(pCol.r >= 0.0 || pCol.r < 0.0) || !(pCol.g >= 0.0 || pCol.g < 0.0) || !(pCol.b >= 0.0 || pCol.b < 0.0)) pCol = diffuseColor.rgb;
        if (!(pRough >= 0.0 || pRough < 0.0)) pRough = roughness;
        if (!(pMetal >= 0.0 || pMetal < 0.0)) pMetal = metalness;
        if (!(pH >= 0.0 || pH < 0.0)) pH = 0.0;
        diffuseColor.rgb = max(pCol, vec3(0.0));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(pRough, 0.0, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(pMetal, 0.0, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Yüzey gradyanı ile kabartma (Mikkelsen); uzakta söner (titreşim olmasın)
          float fade = 1.0 - smoothstep(20.0, 120.0, length(vViewPosition));
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          float dhx = dFdx(pH)*pBump*fade, dhy = dFdy(pH)*pBump*fade;
          vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
          vec3 nb = abs(det)*normal - grad;
          float l2 = dot(nb, nb);
          // Kenardan bakışta det→0: normalize(0) NaN verir; o durumda normal korunur
          if (l2 > 1e-30 && (l2 >= 0.0)) normal = nb*inversesqrt(l2);
        }`);
  };
  m.customProgramCacheKey = () => 'simlab-proc-' + (key || pattern.length + ':' + pattern.slice(0, 40));
  return m;
}

const C = (c) => new THREE.Color(c);

/** Malzeme kütüphanesi. Her fonksiyon { color, scale, ... } alır; renkler hex. */
export const mat = {
  concrete: ({ color = 0xb3ada3, scale = 1, stains = 0.5 } = {}) => procedural({
    key: 'concrete', scale, bump: 0.018, params: { color, roughness: 0.9 },
    uniforms: { uStain: { value: stains } },
    pattern: `
      float n = fbm3(p*2.2, 5), sp = vn3(p*40.0), st = fbm3(p*0.35 + seed*7.0, 4);
      col *= 0.82 + 0.28*n + 0.06*(sp - 0.5);
      col *= 1.0 - uStain*0.25*smoothstep(0.45, 0.8, st);
      float pore = smoothstep(0.75, 0.9, vn3(p*55.0));
      col *= 1.0 - 0.3*pore;
      rough = clamp(rough - 0.1*n + 0.08*pore, 0.5, 1.0);
      h = n*0.6 + sp*0.15 - pore*0.5;`,
  }),
  asphalt: ({ color = 0x2e2f33, scale = 1 } = {}) => procedural({
    key: 'asphalt', scale, bump: 0.02, params: { color, roughness: 0.92 },
    pattern: `
      float agg = cells3(p*18.0), n = fbm3(p*1.5, 4);
      col *= 0.75 + 0.45*smoothstep(0.1, 0.4, agg) + 0.2*n;
      col += vec3(0.05)*step(0.97, vn3(p*70.0));
      rough = 0.8 + 0.15*n;
      h = smoothstep(0.05, 0.35, agg);`,
  }),
  brushedMetal: ({ color = 0xc8ccd2, scale = 1, rough = 0.32 } = {}) => procedural({
    key: 'brushed', scale, bump: 0.004, params: { color, roughness: rough, metalness: 1 },
    pattern: `
      float br = vn3(vec3(p.x*2.0, p.y*260.0, p.z*260.0))*0.6 + vn3(vec3(p.x*6.0, p.y*900.0, p.z*900.0))*0.4;
      float sm = fbm3(p*3.0, 3);
      col *= 0.9 + 0.12*br + 0.06*sm;
      rough = clamp(rough + 0.12*(br - 0.5) + 0.1*(sm - 0.5), 0.12, 0.7);
      h = br;`,
  }),
  paintedMetal: ({ color = 0x2f6fb1, scale = 1, wear = 0.3 } = {}) => procedural({
    key: 'painted', scale, bump: 0.01, params: { color, roughness: 0.42 },
    uniforms: { uWear: { value: wear }, uBare: { value: C(0x8e9297) } },
    pattern: `
      float peel = vn3(p*30.0)*0.5 + vn3(p*80.0)*0.5;
      float chip = smoothstep(0.78 - uWear*0.25, 0.82 - uWear*0.25, fbm3(p*6.0 + seed*9.0, 5));
      float dirt = fbm3(p*1.2 + seed, 4);
      col *= 0.92 + 0.1*dirt;
      col = mix(col, uBare*(0.7 + 0.3*peel), chip);
      metal = mix(0.0, 0.9, chip);
      rough = mix(0.38 + 0.1*peel + 0.15*dirt, 0.5, chip);
      h = peel*0.2 - chip*0.8;`,
  }),
  wood: ({ color = 0x9a6b3f, scale = 1, ring = 18, varnish = false } = {}) => procedural({
    key: 'wood' + varnish, physical: varnish, scale, bump: 0.012,
    params: varnish ? { color, roughness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.15 } : { color, roughness: 0.7 },
    uniforms: { uRing: { value: ring } },
    pattern: `
      vec3 q = p + vec3(fbm3(p*vec3(0.6, 0.6, 2.5), 4)*0.35);
      float r = length(q.xz + seed*3.0)*uRing;
      float rings = smoothstep(0.0, 0.7, abs(fract(r) - 0.5)*2.0);
      float grain = vn3(vec3(p.x*120.0, p.y*4.0, p.z*120.0));
      col *= 0.72 + 0.28*rings + 0.12*(grain - 0.5);
      col = mix(col, col*vec3(0.78, 0.66, 0.55), (1.0 - rings)*0.5);
      rough = rough + 0.12*(1.0 - rings);
      h = rings*0.6 + grain*0.4;`,
  }),
  plastic: ({ color = 0xe8e8e8, scale = 1, gloss = 0.5 } = {}) => procedural({
    key: 'plastic', physical: true, scale, bump: 0.003,
    params: { color, roughness: 0.45 - gloss * 0.3, clearcoat: gloss * 0.6, clearcoatRoughness: 0.25 },
    pattern: `
      float n = vn3(p*120.0)*0.5 + fbm3(p*4.0, 3)*0.5;
      col *= 0.96 + 0.06*n + 0.04*(seed - 0.5);
      rough = clamp(rough + 0.08*(n - 0.5), 0.05, 1.0);
      h = n;`,
  }),
  rubber: ({ color = 0x1e1f21, scale = 1 } = {}) => procedural({
    key: 'rubber', scale, bump: 0.006, params: { color, roughness: 0.88 },
    pattern: `float n = vn3(p*90.0); col *= 0.9 + 0.2*n; rough = 0.82 + 0.1*n; h = n;`,
  }),
  fabric: ({ color = 0x6b7fa6, scale = 1 } = {}) => procedural({
    key: 'fabric', physical: true, scale, bump: 0.02,
    params: { color, roughness: 0.9, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(C(0xffffff), 0.4) },
    pattern: `
      vec3 a = axisDominant(pn); vec2 uv = a.x > 0.5 ? p.yz : (a.y > 0.5 ? p.xz : p.xy);
      float wx = sin(uv.x*420.0), wy = sin(uv.y*420.0);
      float weave = mix(0.5, 0.5 + 0.5*(sin(uv.x*420.0 + step(0.0, wy)*3.14159)*0.5 + 0.5)*(0.5 + 0.5*wy), aaW(vec3(uv*67.0, 0.0)));
      float n = fbm3(p*3.0, 3);
      col *= 0.8 + 0.25*weave + 0.1*n;
      h = weave;`,
  }),
  brick: ({ color = 0x9c4a32, mortar = 0xcfc6b8, scale = 1 } = {}) => procedural({
    key: 'brick', scale, bump: 0.03, params: { color, roughness: 0.88 },
    uniforms: { uMortar: { value: C(mortar) } },
    pattern: `
      vec3 a = axisDominant(pn); vec2 uv = a.x > 0.5 ? p.zy : (a.y > 0.5 ? p.xz : p.xy);
      uv *= vec2(4.5, 13.0);
      float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5;
      vec2 f = fract(uv), id = floor(uv);
      float m = smoothstep(0.0, 0.06, min(f.x, 1.0 - f.x)*0.45)*smoothstep(0.0, 0.08, min(f.y, 1.0 - f.y));
      float tint = h13(vec3(id, 3.0));
      float n = fbm3(p*8.0, 4);
      vec3 b = col*(0.72 + 0.4*tint)*(0.85 + 0.25*n);
      col = mix(uMortar*(0.8 + 0.2*n), b, m);
      rough = mix(0.95, 0.82, m);
      h = m*0.8 + n*0.2;`,
  }),
  rock: ({ color = 0x7a7570, scale = 1, strata = 0.4 } = {}) => procedural({
    key: 'rock', scale, bump: 0.05, params: { color, roughness: 0.9 },
    uniforms: { uStrata: { value: strata } },
    pattern: `
      float n = fbm3(p*1.2 + seed*5.0, 6), c = cells3(p*3.0);
      float st = sin((p.y + n*0.6)*18.0)*0.5 + 0.5;
      col *= 0.6 + 0.55*n + uStrata*0.15*(st - 0.5);
      col = mix(col, col*vec3(0.85, 0.9, 0.75), smoothstep(0.55, 0.8, fbm3(p*0.8 + 3.0, 3))*step(0.5, pn.y + 0.3)*0.6);
      rough = 0.8 + 0.15*n;
      h = n*0.7 + c*0.3;`,
  }),
  ceramic: ({ color = 0xf2efe8, scale = 1 } = {}) => procedural({
    key: 'ceramic', physical: true, scale, bump: 0.002, params: { color, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 },
    pattern: `float n = fbm3(p*2.0, 3); col *= 0.97 + 0.05*n; h = n;`,
  }),
  foliage: ({ color = 0x3f7a2a, scale = 1 } = {}) => procedural({
    key: 'foliage', scale, bump: 0.02, params: { color, roughness: 0.75, side: THREE.DoubleSide },
    pattern: `
      float n = fbm3(p*2.0 + seed*13.0, 4), v = vn3(p*25.0);
      col *= mix(vec3(0.85, 0.95, 0.7), vec3(1.15, 1.05, 0.8), n)*(0.8 + 0.3*seed);
      rough = 0.6 + 0.2*v;
      h = v;`,
  }),
  /** Canlı doku (hücre, organ, deri): yumuşak parlaklık, damarlanma, yarı saydam derinlik hissi */
  tissue: ({ color = 0xd98c7a, scale = 1, veins = 0.4 } = {}) => procedural({
    key: 'tissue', physical: true, scale, bump: 0.015,
    params: { color, roughness: 0.45, sheen: 0.6, sheenRoughness: 0.4, sheenColor: new THREE.Color(color).lerp(C(0xffffff), 0.5), clearcoat: 0.3, clearcoatRoughness: 0.4 },
    uniforms: { uVeins: { value: veins } },
    pattern: `
      float n = fbm3(p*2.5 + seed*4.0, 5);
      float vein = pow(ridge3(p*3.0 + n), 8.0);
      col *= 0.85 + 0.25*n;
      col = mix(col, col*vec3(0.6, 0.25, 0.3), vein*uVeins);
      h = n*0.6 + vein*0.4;`,
  }),
  /** Cam: gerçek kırılma (transmission) */
  glass: ({ color = 0xffffff, tint = 0xf2fbff, rough = 0.03, thickness = 0.2 } = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: rough, metalness: 0, transmission: 1, thickness, ior: 1.5, attenuationColor: C(tint), attenuationDistance: 2,
    specularIntensity: 1, envMapIntensity: 1.2,
  }),
  /** Sıvı: renkli soğurma (çay, kan, kimyasal) */
  liquid: ({ color = 0xb5651d, density = 0.4, rough = 0.02 } = {}) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: rough, transmission: 1, thickness: 1, ior: 1.34, attenuationColor: C(color), attenuationDistance: density,
  }),
  /** Işık yayan yüzey (ekran, LED, lav): bloom ile gerçekten parlar */
  glow: ({ color = 0x66ccff, intensity = 4 } = {}) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }),
};
