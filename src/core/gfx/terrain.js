// Prosedürel arazi: yükseklik fonksiyonundan ağ + eğim/yükseklik tabanlı doku karışımı (kum, çimen, toprak, kaya, kar),
// gürültüden mikro normal. MeshStandardMaterial'e eklenir; gölge, ortam ışığı ve sis Three.js'ten gelir.
import * as THREE from 'three';

export const NOISE3_GLSL = /* glsl */ `
float h13(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float vn3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p, int oct){ float s = 0.0, a = 0.5; for (int i = 0; i < 7; i++){ if (i >= oct) break; s += a*vn3(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
`;

/**
 * Araziye özgü malzeme. Birimler metre (scale ile dünya birimine çevrilir).
 * @param {object} o  { scale (dünya/metre), water (m, deniz seviyesi), snow (m), sand, grass, dry, soil, rock, snowCol (hex),
 *                     grassAmount (0–1), wet (0–1: ıslak koyulaşma) }
 */
export function terrainMaterial(o = {}) {
  const P = {
    scale: 1, water: 0, snow: 1e9, sand: 0xc8b48a, grass: 0x56652a, dry: 0x9c8c55, soil: 0x6b5238, rock: 0x777069,
    snowCol: 0xf2f5f8, grassAmount: 1, wet: 0, forest: 1, forestCol: 0x3b4c25, ...o,
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const col = (h) => new THREE.Color(h);
  const U = {
    tScale: { value: P.scale }, tWater: { value: P.water }, tSnow: { value: P.snow }, tGrassAmt: { value: P.grassAmount }, tWet: { value: P.wet }, tForest: { value: P.forest }, tForestC: { value: col(P.forestCol) },
    tSand: { value: col(P.sand) }, tGrass: { value: col(P.grass) }, tDry: { value: col(P.dry) }, tSoil: { value: col(P.soil) },
    tRock: { value: col(P.rock) }, tSnowC: { value: col(P.snowCol) },
  };
  mat.userData.terrain = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vTW = (modelMatrix*vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(modelMatrix)*objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTW; varying vec3 vTN;
        uniform float tScale, tWater, tSnow, tGrassAmt, tWet, tForest; uniform vec3 tSand, tGrass, tDry, tSoil, tRock, tSnowC, tForestC;
        ${NOISE3_GLSL}
        float tCrown(vec2 p){ // ağaç tacı: en yakın hücre merkezine uzaklık → kubbe
          vec2 i = floor(p), f = fract(p); float d = 9.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
            vec2 g = vec2(x, y); vec2 o = vec2(h13(vec3(i + g, 1.7)), h13(vec3(i + g, 5.3)));
            d = min(d, length(g + o - f)/(0.6 + 0.5*h13(vec3(i + g, 9.1))));
          }
          return clamp(1.0 - d, 0.0, 1.0);
        }
        float tSlope, tH, tRockW, tForestW; vec3 tP;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        tP = vTW/tScale; tH = tP.y;
        vec3 n = normalize(vTN);
        tSlope = 1.0 - n.y;
        float big = fbm3(tP*0.012, 4), mid = fbm3(tP*0.09, 4), fine = fbm3(tP*0.9, 3);
        // Katmanlar: kum (su kenarı) → çimen/kuru ot → toprak → maki/orman → kaya (dik) → kar (yüksek)
        vec3 grass = mix(tGrass, tDry, smoothstep(0.35, 0.75, big + 0.25*mid - 0.1));
        grass *= 0.78 + 0.44*mid;
        vec3 c = mix(tSoil*(0.8 + 0.4*fine), grass, tGrassAmt*smoothstep(0.35, 0.55, mid + 0.35));
        // Orman / maki lekeleri: düşük eğim, kıyıdan biraz yukarıda, gürültü kümeleri; taç yapısı hücresel
        float fz = smoothstep(0.46, 0.6, fbm3(tP*0.018 + 3.1, 4) + 0.18*mid)*tGrassAmt*tForest;
        fz *= 1.0 - smoothstep(0.22, 0.4, tSlope);
        fz *= smoothstep(tWater + 3.0, tWater + 12.0, tH)*(1.0 - smoothstep(tSnow - 250.0, tSnow - 60.0, tH));
        float crown = tCrown(tP.xz*0.2);
        tForestW = fz*smoothstep(0.08, 0.5, crown + 0.25*fz);
        vec3 canopy = tForestC*(0.55 + 0.7*crown)*(0.85 + 0.3*fbm3(tP*0.05, 2));
        c = mix(c, canopy, tForestW);
        c = mix(c, tForestC*0.55, fz*(1.0 - tForestW)*0.6);   // taç arası gölge
        // Yakın detay (0.2–2 m): ot öbekleri, çıplak toprak benekleri, kuru sap — uzakta sönümlenir (örtüşme olmasın)
        {
          float near = 1.0 - smoothstep(25.0, 140.0, length(vViewPosition));
          float m1 = vn3(tP*2.7), m2 = vn3(tP*7.3 + 3.0);
          vec3 cd = c*(0.78 + 0.5*m1)*(0.85 + 0.3*m2);
          cd = mix(cd, tSoil*(0.7 + 0.4*m2), smoothstep(0.62, 0.8, m1*0.7 + fine*0.5)*0.8);
          cd = mix(cd, tDry*1.15, smoothstep(0.7, 0.9, m2)*0.5);
          c = mix(c, cd, near);
        }
        float beach = 1.0 - smoothstep(tWater + 0.8, tWater + 2.5 + 2.0*mid, tH);
        c = mix(c, tSand*(0.9 + 0.2*fine), beach);
        // Kaya: dik yamaç + sırt çıkıntıları, yatay tabakalanma
        tRockW = smoothstep(0.26, 0.42, tSlope + 0.18*(mid - 0.5) + 0.12*smoothstep(0.62, 0.8, big));
        float strata = fbm3(tP*vec3(0.12, 2.4, 0.12), 4);
        vec3 rock = tRock*(0.55 + 0.6*strata)*(0.82 + 0.36*fine);
        rock = mix(rock, rock*vec3(1.12, 0.98, 0.84), smoothstep(0.4, 0.8, fbm3(tP*0.03 + 7.0, 3)));
        c = mix(c, rock, tRockW);
        tForestW *= 1.0 - tRockW;
        float sn = smoothstep(tSnow - 40.0, tSnow + 40.0, tH + 80.0*(mid - 0.5)) * (1.0 - smoothstep(0.45, 0.7, tSlope));
        c = mix(c, tSnowC, sn);
        // Islak kum/toprak (su kenarı ve yağmur)
        float wet = max(1.0 - smoothstep(tWater, tWater + 0.6, tH), tWet);
        c *= 1.0 - 0.45*wet;
        diffuseColor.rgb = c;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(0.95, 0.85, tForestW), 0.72, tRockW) - 0.5*max(1.0 - smoothstep(tWater, tWater + 0.6, tH), tWet);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Mikro normal: gürültü gradyanı (dünya uzayı) → görüş uzayı
          float e = 0.35;
          float amp = mix(mix(0.35, 1.4, tForestW), 1.1, tRockW);
          float b0 = fbm3(tP*1.3, 3);
          vec3 gr = vec3(fbm3((tP + vec3(e, 0, 0))*1.3, 3) - b0, 0.0, fbm3((tP + vec3(0, 0, e))*1.3, 3) - b0)/e;
          vec3 nw = normalize(normalize(vTN) - amp*gr*0.35);
          normal = normalize(mix(normal, normalize((viewMatrix*vec4(nw, 0.0)).xyz), 0.8));
        }`);
  };
  mat.customProgramCacheKey = () => 'simlab-terrain';
  return mat;
}

/**
 * Yükseklik fonksiyonundan arazi ağı.
 * @param {(x:number, z:number)=>number} height  metre → metre
 * @param {object} o  { size:[w, d] (m), res:[nx, nz], center:[x, z] (m), scale, material }
 */
export function createTerrain(height, o = {}) {
  const size = o.size || [1000, 1000], res = o.res || [256, 256], c = o.center || [0, 0], scale = o.scale ?? 1;
  const g = new THREE.PlaneGeometry(size[0], size[1], res[0], res[1]);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + c[0], z = p.getZ(i) + c[1];
    p.setXYZ(i, x, height(x, z), z);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, o.material || terrainMaterial({ scale, ...(o.materialOptions || {}) }));
  mesh.scale.setScalar(scale);
  mesh.receiveShadow = true;
  mesh.name = 'gfx:terrain';
  mesh.userData.noCast = true; mesh.userData.noFit = true; // büyük zemin: gölge alır, gölge kutusunu şişirmez
  return mesh;
}

// --- Gerçekçi yükseklik üreticisi (CPU) ---
function makeNoise2(seed) {
  const p = new Uint8Array(512), r = (() => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const gx = [1, -1, 1, -1, 1, -1, 0, 0], gz = [1, 1, -1, -1, 0, 0, 1, -1];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  // Perlin gürültüsü + analitik türev: [değer, d/dx, d/dz]
  return (x, z) => {
    const X = Math.floor(x), Z = Math.floor(z), fx = x - X, fz = z - Z, xi = X & 255, zi = Z & 255;
    const g = (i, j, dx, dz) => { const h = p[p[xi + i] + zi + j] & 7; return [gx[h], gz[h], gx[h] * dx + gz[h] * dz]; };
    const a = g(0, 0, fx, fz), b = g(1, 0, fx - 1, fz), c = g(0, 1, fx, fz - 1), d = g(1, 1, fx - 1, fz - 1);
    const u = fade(fx), v = fade(fz), du = 30 * fx * fx * (fx * (fx - 2) + 1), dv = 30 * fz * fz * (fz * (fz - 2) + 1);
    const k1 = b[2] - a[2], k2 = c[2] - a[2], k3 = a[2] - b[2] - c[2] + d[2];
    const val = a[2] + u * k1 + v * k2 + u * v * k3;
    const dx = a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]) + u * v * (a[0] - b[0] - c[0] + d[0]) + du * (k1 + v * k3);
    const dz = a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]) + u * v * (a[1] - b[1] - c[1] + d[1]) + dv * (k2 + u * k3);
    return [val, dx, dz];
  };
}

/**
 * Aşınma görünümlü arazi (türev sönümlü fbm + alan bükme). Dönen fonksiyon (x, z) metre → yükseklik metre.
 * @param {object} o { seed, size (tipik tepe aralığı m), height (m), octaves, warp (0–1), base (m, ortalama taban),
 *                     shape: (x, z, h) => h  (kıyı, vadi vb. için son biçimlendirme) }
 */
export function landscape(o = {}) {
  const { seed = 7, size = 900, height = 260, octaves = 8, warp = 0.5, base = 0, shape } = o;
  const n = makeNoise2(seed), n2 = makeNoise2(seed + 101);
  return (x, z) => {
    let px = x / size, pz = z / size;
    if (warp) { const w1 = n2(px * 0.5, pz * 0.5)[0], w2 = n2(px * 0.5 + 5.2, pz * 0.5 + 1.3)[0]; px += warp * w1; pz += warp * w2; }
    let a = 0.5, sum = 0, dx = 0, dz = 0, f = 1;
    for (let i = 0; i < octaves; i++) {
      const [v, gx, gz] = n(px * f, pz * f);
      dx += gx; dz += gz;
      sum += a * v / (1 + dx * dx + dz * dz);   // eğimli yerde ayrıntı söner → sırt ve vadi
      a *= 0.5; f *= 2.02;
    }
    const h = base + height * (sum + 0.1);
    return shape ? shape(x, z, h) : h;
  };
}

/** Yükseklik fonksiyonundan su derinliği dokusu (R = seaLevel − h, m) — ocean.setDepth(tex, rect) için. */
export function depthTexture(height, rect, res = 256, seaLevel = 0) {
  const [x0, z0, x1, z1] = rect, data = new Float32Array(res * res * 4);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = x0 + (i + 0.5) / res * (x1 - x0), z = z0 + (j + 0.5) / res * (z1 - z0);
    data[(j * res + i) * 4] = seaLevel - height(x, z);
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

/** Ufka kadar uzanan seyrek halka: arazinin kenarından sonra (inner) dış yarıçapa (outer) kadar. */
export function terrainSkirt(height, o = {}) {
  const { inner = 1000, outer = 20000, rings = 48, segs = 128, center = [0, 0], scale = 1, material } = o;
  const pos = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const rad = inner * Math.pow(outer / inner, r / rings) * (r === 0 ? 0.985 : 1);
    for (let s = 0; s <= segs; s++) {
      const a = s / segs * Math.PI * 2;
      // Kare iç kenara oturması için: iç halka kareye yaklaşır
      const sq = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      const k = r === 0 ? 1 / sq : 1;
      const x = center[0] + Math.cos(a) * rad * k, z = center[1] + Math.sin(a) * rad * k;
      pos.push(x, height(x, z), z);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = r * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material || terrainMaterial({ scale }));
  mesh.scale.setScalar(scale); mesh.receiveShadow = true; mesh.userData.noShadow = true; mesh.name = 'gfx:skirt';
  return mesh;
}
