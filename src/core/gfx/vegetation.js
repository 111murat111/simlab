// Bitki örtüsü ve kayalar: örneklenmiş (instanced) ağaçlar (fıstık çamı, servi, geniş yapraklı/zeytin) ve kaya blokları.
// Yerleşim yükseklik fonksiyonundan: eğim, yükseklik bandı, orman maskesi (arazi malzemesindeki lekelerle aynı ölçek).
// Rüzgâr salınımı vertex shader'da; her örnek kendi renk/ölçek varyasyonunu taşır. Gölge atar, AO alır.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE3_GLSL } from './terrain.js';

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const LOWQ = typeof location !== 'undefined' && /[?&]low\b/.test(location.search);
const OPAQUE_UV = 0.03; // yaprak dokusunun opak köşesi: gövde ve iç çekirdek bu tek teksele bakar

// Yaprak kümesi dokusu (canvas): opak köşe + rastgele dönük yaprak elipsleri; alfa kesimiyle gerçek yaprak siluetleri
let leafTex = null;
function leafTexture() {
  if (leafTex || typeof document === 'undefined') return leafTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), r = rng(77);
  g.fillStyle = '#fff';
  for (const [x, y] of [[0, 0], [S - 18, 0], [0, S - 18], [S - 18, S - 18]]) g.fillRect(x, y, 18, 18); // opak köşeler (flipY'den bağımsız)
  // Yaprak demeti: merkezde yoğun, kenara doğru seyrelen ~420 yaprak (kart alanının ~%70'i)
  const cx = 138, cy = 134, R0 = 100;
  for (let i = 0; i < 420; i++) {
    const rr = R0 * Math.sqrt(r()) * (0.35 + 0.65 * r()), a0 = r() * Math.PI * 2;
    const x = cx + Math.cos(a0) * rr, y = cy + Math.sin(a0) * rr * 0.9;
    const a = a0 + (r() - 0.5) * 1.2, L = 18 + r() * 16, W = 7 + r() * 5;
    const v = Math.floor(130 + r() * 125);
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = `rgb(${v - 12},${v},${v - 30})`;
    g.beginPath(); g.ellipse(0, 0, L / 2, W / 2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(80,90,60,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
    g.restore();
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.anisotropy = 4;
  return leafTex;
}
const constAttr = (n, v) => new THREE.Float32BufferAttribute(new Array(n).fill(v), 1);
const constUV = (n) => new THREE.Float32BufferAttribute(new Array(n * 2).fill(OPAQUE_UV), 2);

// Yaprak kümesi: koyu iç çekirdek (boşlukları doldurur) + çevresine saçılmış alfa kesimli yaprak kartları.
// Kart normalleri kümenin merkezinden dışa bakar → yumuşak, hacimli taç ışığı; vertex rengi iç gölgeyi (AO) taşır.
function blob(r, sx, sy, sz, cx, cy, cz, rnd, cardScale = 1, dens = 1) {
  const R = rng(Math.floor(rnd * 1e6) + 1);
  const core = new THREE.IcosahedronGeometry(r * 0.7, 1).toNonIndexed();
  const p = core.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * sx, y = p.getY(i) * sy, z = p.getZ(i) * sz;
    p.setXYZ(i, x + cx, y + cy, z + cz);
    const ao = 0.35 + 0.25 * THREE.MathUtils.smoothstep(y / (r * sy), -1, 0.8);
    col.push(ao, ao, ao);
  }
  core.computeVertexNormals();
  core.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  core.setAttribute('leaf', constAttr(p.count, 1));
  core.setAttribute('uv', constUV(p.count));
  // Kartlar
  const n = Math.max(4, Math.round((14 + 11 * r * r) * (LOWQ ? 0.6 : 1) * dens));
  cardScale *= Math.min(1.6, 1 / Math.sqrt(Math.max(dens, 0.2)));   // seyrek kartlar biraz büyür: taç kapalı kalır
  const pos = [], nor = [], uv = [], cl = [];
  const d = new THREE.Vector3(), t = new THREE.Vector3(), bt = new THREE.Vector3(), cn = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    d.set(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); if (d.lengthSq() < 1e-4) d.set(0, 1, 0); d.normalize();
    const u = Math.pow(R(), 0.3), s = (0.5 + 0.45 * R()) * cardScale * Math.min(1.4, r / 1.4 + 0.3);
    const c = [cx + d.x * u * r * sx, cy + d.y * u * r * sy, cz + d.z * u * r * sz];
    cn.set(d.x + (R() - 0.5) * 1.2, d.y + (R() - 0.5) * 1.2, d.z + (R() - 0.5) * 1.2).normalize();
    t.crossVectors(cn, Math.abs(cn.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    bt.crossVectors(cn, t).normalize();
    const rot = R() * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
    const T = t.clone().multiplyScalar(cr).addScaledVector(bt, sr), B = bt.clone().multiplyScalar(cr).addScaledVector(t, -sr);
    const q = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    const nn = d.clone().multiplyScalar(0.75).addScaledVector(up, 0.35).normalize();
    const ao = 0.5 + 0.5 * u * (0.6 + 0.4 * THREE.MathUtils.smoothstep(d.y, -1, 0.7));
    for (const [a, b] of q) {
      pos.push(c[0] + (T.x * a + B.x * b) * s * 0.5, c[1] + (T.y * a + B.y * b) * s * 0.5, c[2] + (T.z * a + B.z * b) * s * 0.5);
      nor.push(nn.x, nn.y, nn.z);
      uv.push(0.12 + 0.84 * (a * 0.5 + 0.5), 0.1 + 0.84 * (b * 0.5 + 0.5));
      cl.push(ao, ao, ao);
    }
  }
  const cards = new THREE.BufferGeometry();
  cards.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cards.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  cards.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  cards.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  cards.setAttribute('leaf', constAttr(pos.length / 3, 1));
  return mergeGeometries([core, cards]);
}
// Dal: iki nokta arasında incelen silindir (gövdeden taç kümelerine)
function limb(a, b, r0, r1) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), L = A.distanceTo(Bv);
  const g = new THREE.CylinderGeometry(r1, r0, L, 5, 1, true);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize()));
  g.translate(A.x, A.y, A.z);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(0.8), 3));
  g.setAttribute('leaf', constAttr(n, 0));
  g.setAttribute('uv', constUV(n));
  return g.toNonIndexed();
}
function trunk(h, r0, r1, bend, seg = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 6, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = y / h;
    p.setX(i, p.getX(i) + bend[0] * t * t * h);
    p.setZ(i, p.getZ(i) + bend[1] * t * t * h);
    col.push(0.9, 0.9, 0.9);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('leaf', constAttr(p.count, 0));
  g.setAttribute('uv', constUV(p.count));
  g.computeVertexNormals();
  return g;
}
const strip = (g) => (g.index ? g.toNonIndexed() : g);

/** Ağaç türleri (metre): gövde+dallar ve taç (yaprak kartlı kümeler) ayrı geometriler. dens: kart yoğunluğu (0.2–1). */
function treeGeoms(kind, seed, dens = 1) {
  const r = rng(seed), wood = [], crown = [];
  const B = (rr, sx, sy, sz, c, cs = 1) => crown.push(blob(rr, sx, sy, sz, c[0], c[1], c[2], r(), cs, dens));
  if (kind === 'pine') { // fıstık çamı: eğri gövde, şemsiye taç
    const h = 9, b = [(r() - 0.5) * 0.25, (r() - 0.5) * 0.25];
    wood.push(trunk(h, 0.32, 0.16, b));
    const top = [b[0] * h, h, b[1] * h];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + r(), d = i ? 1.6 + r() * 2.0 : 0;
      const c = [top[0] + Math.cos(a) * d, top[1] + 0.5 + r() * 0.7 - d * 0.18, top[2] + Math.sin(a) * d];
      if (i) wood.push(limb([top[0] * 0.85, h * (0.82 + r() * 0.1), top[2] * 0.85], c, 0.11, 0.05));
      B(1.3 + r() * 0.5, 1.3, 0.5, 1.3, c);
    }
  } else if (kind === 'redpine') { // kızılçam: uzun düz gövde, kat kat düzensiz taç
    const h = 11 + r() * 3, b = [(r() - 0.5) * 0.12, (r() - 0.5) * 0.12];
    wood.push(trunk(h, 0.28, 0.1, b));
    for (let i = 0; i < 7; i++) {
      const y = h * (0.5 + 0.5 * i / 7) + r(), a = r() * 6.28, d = (1 - i / 8) * 1.6 + r() * 0.6, w = 1.9 * (1 - i / 9) + r() * 0.5;
      const t = y / h, c = [b[0] * h * t * t + Math.cos(a) * d, y, b[1] * h * t * t + Math.sin(a) * d];
      wood.push(limb([b[0] * h * t * t, y - 0.6, b[1] * h * t * t], c, 0.08, 0.03));
      B(w, 1.15, 0.55, 1.15, c);
    }
  } else if (kind === 'oak') { // meşe: kalın kısa gövde, geniş kubbe taç
    const h = 3.6, b = [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3];
    wood.push(trunk(h + 1.5, 0.34, 0.18, b));
    for (let i = 0; i < 7; i++) {
      const a = r() * 6.28, d = i ? 1.5 + r() * 1.5 : 0;
      const c = [b[0] * h + Math.cos(a) * d, h + 1.6 + r() * 1.8, b[1] * h + Math.sin(a) * d];
      if (i) wood.push(limb([b[0] * h * 0.9, h * 0.9, b[1] * h * 0.9], c, 0.13, 0.05));
      B(1.8 + r() * 0.7, 1.1, 0.8, 1.1, c);
    }
  } else if (kind === 'poplar') { // kavak: ince uzun sütun
    const h = 13 + r() * 3;
    wood.push(trunk(h, 0.22, 0.05, [0, 0]));
    // Sık üst üste binen küçük kümeler: sürekli, hafif düzensiz iğ biçimli siluet (üst üste top görünmez)
    for (let i = 0; i < 13; i++) {
      const t = i / 12, y = 2.8 + t * (h - 2.4), w = (0.35 + 1.05 * Math.sin(Math.PI * Math.pow(t, 0.8))) * (0.85 + r() * 0.3);
      const a = r() * 6.28, j = w * 0.35 * r();
      B(w, 1, 1.25, 1, [Math.cos(a) * j, y, Math.sin(a) * j], 0.7);
    }
  } else if (kind === 'fruit') { // meyve ağacı: kısa gövde, alçak yuvarlak taç
    const b = [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3];
    wood.push(trunk(2.2, 0.16, 0.1, b));
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28, d = i ? 0.8 + r() * 0.6 : 0, c = [b[0] * 2.2 + Math.cos(a) * d, 2.6 + r() * 0.8, b[1] * 2.2 + Math.sin(a) * d];
      if (i) wood.push(limb([b[0] * 2.0, 1.9, b[1] * 2.0], c, 0.07, 0.03));
      B(1.0 + r() * 0.4, 1.15, 0.8, 1.15, c, 0.85);
    }
  } else if (kind === 'cypress') { // servi: ince uzun sütun
    wood.push(trunk(2.5, 0.2, 0.14, [0, 0]));
    for (let i = 0; i < 11; i++) {
      const t = i / 10, y = 1.6 + t * 9, w = (0.3 + 0.95 * Math.pow(1 - t, 0.75) * Math.min(1, t * 4 + 0.55)) * (0.9 + r() * 0.2);
      const a = r() * 6.28, j = w * 0.25 * r();
      B(w, 1, 1.2, 1, [Math.cos(a) * j, y, Math.sin(a) * j], 0.65);
    }
  } else if (kind === 'shrub') { // maki çalısı: alçak, yayvan kümeler
    const k = 3 + Math.floor(r() * 3);
    wood.push(trunk(0.5, 0.05, 0.03, [0, 0], 5));
    for (let i = 0; i < k; i++) {
      const a = r() * Math.PI * 2, d = i ? 0.5 + r() * 0.7 : 0;
      B(0.55 + r() * 0.35, 1.2, 0.8, 1.2, [Math.cos(a) * d, 0.35 + r() * 0.35, Math.sin(a) * d], 0.6);
    }
  } else { // geniş yapraklı / zeytin: kısa gövde, düzensiz yuvarlak taç
    const h = 3.2, b = [(r() - 0.5) * 0.4, (r() - 0.5) * 0.4];
    wood.push(trunk(h, 0.28, 0.18, b));
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, d = i ? 1.2 + r() * 1.2 : 0;
      const c = [b[0] * h + Math.cos(a) * d, h + 1.2 + r() * 1.4, b[1] * h + Math.sin(a) * d];
      if (i) wood.push(limb([b[0] * h * 0.9, h * 0.92, b[1] * h * 0.9], c, 0.1, 0.04));
      B(1.4 + r() * 0.6, 1.1, 0.85, 1.1, c);
    }
  }
  return { trunk: mergeGeometries(wood.map(strip)), crown: mergeGeometries(crown.map(strip)) };
}
function makeTree(kind, seed) {
  const { trunk: t, crown } = treeGeoms(kind, seed);
  return mergeGeometries([t, crown]);
}

/**
 * Tek tek yerleştirilecek ağaçlar için (sahne önü, bahçe, sokak ağacı): { trunk, crown } geometrileri.
 * kind: 'pine' (fıstık çamı) | 'redpine' (kızılçam) | 'oak' | 'broad' | 'fruit' | 'poplar' | 'cypress' | 'shrub'.
 * Taç, leafMaterial() ile kullanılmalı (alfa kesimli yaprak kartları). dens: kart yoğunluğu (binlerce örnekte 0.3–0.5).
 */
export function treeParts(kind, seed = 1, o = {}) { return treeGeoms(kind, seed * 7919 + 13, o.dens ?? 1); }

/** Yaprak malzemesi (treeParts taçları için): color ana ton; InstancedMesh.setColorAt ile örnek başına ton; rüzgârla salınır. */
export function leafMaterial(color = 0x4a6a2a, o = {}) {
  const U = { vTime: { value: 0 }, vWind: { value: o.wind ?? 0.6 }, vLeafA: { value: new THREE.Color(0.74, 0.78, 0.7) },
    vLeafB: { value: new THREE.Color(1.15, 1.12, 0.95) }, vBark: { value: new THREE.Color(o.bark ?? 0x5a4632) }, vGrassFar: { value: 40 },
    vGrassA: { value: new THREE.Color(1, 1, 1) }, vGrassB: { value: new THREE.Color(1, 1, 1) } };
  const m = foliageMaterial(U);
  m.color.set(color);
  m.onBeforeRender = () => { U.vTime.value = performance.now() / 1000; };
  m.userData.uniforms = U;
  return m;
}

function makeRock(seed) {
  const r = rng(seed), g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position;
  const s = [0.8 + r() * 0.8, 0.45 + r() * 0.4, 0.7 + r() * 0.7], o = [r() * 10, r() * 10, r() * 10];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    let k = 1;
    // kırık yüzeyler: birkaç düzlemle kesme + dalgalanma
    for (let j = 0; j < 5; j++) {
      const n = new THREE.Vector3(Math.sin(o[0] + j * 2.1), Math.cos(o[1] + j * 1.3) * 0.7, Math.cos(o[2] + j * 2.9)).normalize();
      const d = v.dot(n); if (d > 0.62 + 0.1 * j / 5) k = Math.min(k, (0.62 + 0.1 * j / 5) / d);
    }
    k *= 1 + 0.08 * Math.sin(v.x * 9 + o[0]) * Math.sin(v.y * 8 + o[1]) * Math.sin(v.z * 7 + o[2]);
    v.multiplyScalar(k);
    p.setXYZ(i, v.x * s[0], Math.max(v.y * s[1], -0.15), v.z * s[2]);
  }
  g.computeVertexNormals();
  return g;
}

function foliageMaterial(U, grass = false) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  if (!grass) { m.map = leafTexture(); m.alphaTest = 0.42; }
  if (grass) m.specularIntensity = 0.12; else m.specularIntensity = 0.28;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float leaf; uniform float vTime, vWind, vGrassFar; varying float vLeaf; varying vec3 vLP; varying float vSeed;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLeaf = leaf; vLP = position;
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        vSeed = fract(sin(dot(ip.xz, vec2(12.9898, 78.233)))*43758.5453);
        float sway = vWind*(0.02 + 0.05*vSeed)*position.y*position.y*0.02;
        float ph = vTime*(1.1 + 0.4*vSeed) + dot(ip.xz, vec2(0.05, 0.03));
        transformed.x += sway*(sin(ph) + 0.35*sin(ph*2.3 + 1.0));
        transformed.z += sway*0.6*cos(ph*0.8 + 0.5);
        #ifdef GRASS
          { vec3 wp = (modelMatrix*vec4(ip, 1.0)).xyz;
            transformed *= 1.0 - smoothstep(vGrassFar*0.55, vGrassFar, length(wp - cameraPosition)); }
        #endif
        transformed += leaf*normal*0.06*vWind*sin(vTime*4.0 + position.x*3.0 + position.y*2.0)*0.05;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 vLeafA, vLeafB, vBark, vGrassA, vGrassB; varying float vLeaf; varying vec3 vLP; varying float vSeed;
        ${NOISE3_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float n = fbm3(vLP*2.2 + vSeed*31.0, 4), k = vn3(vLP*9.0 + vSeed*7.0);
          vec3 leafC = mix(vLeafA, vLeafB, clamp(vSeed*0.8 + 0.4*n - 0.1, 0.0, 1.0))*(0.62 + 0.6*k);
          // yaprak aralarındaki boşluklar: koyu gözenekler
          leafC *= mix(0.6, 1.0, smoothstep(0.25, 0.55, k + 0.3*n));
          vec3 barkC = vBark*(0.6 + 0.6*fbm3(vLP*vec3(6.0, 1.5, 6.0), 3));
          #ifdef GRASS
            leafC = mix(vGrassA, vGrassB, vSeed*vSeed)*(0.8 + 0.4*n);
          #endif
          diffuseColor.rgb *= mix(barkC, leafC, vLeaf);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal *= mix(1.0, faceDirection, vLeaf); // yaprak kartı arkadan da dışa bakan normal kullanır
        {
          float e = 0.05, s = 9.0;
          float b0 = vn3(vLP*s + vSeed*7.0);
          vec3 g = vec3(vn3((vLP + vec3(e,0,0))*s + vSeed*7.0) - b0, vn3((vLP + vec3(0,e,0))*s + vSeed*7.0) - b0, vn3((vLP + vec3(0,0,e))*s + vSeed*7.0) - b0)/e;
          normal = normalize(normal - vLeaf*0.08*(viewMatrix*vec4(g, 0.0)).xyz);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.95, 0.78, vLeaf);
        #ifdef GRASS
          roughnessFactor = 1.0;
        #endif`);
  };
  if (grass) m.defines = { GRASS: '' };
  m.customProgramCacheKey = () => 'simlab-foliage' + (grass ? '-g' : '');
  return m;
}

/**
 * @param {(x:number,z:number)=>number} height
 * @param {object} o { rect:[x0,z0,x1,z1], trees (adet), rocks (adet), water (deniz seviyesi), snow, maxSlope,
 *                     kinds {pine, cypress, broad} ağırlıkları, seed, forest(x,z)→0–1 (isteğe bağlı maske),
 *                     near:[x,z,r] (yoğunluğu bu çevrede topla), leafA/leafB/bark }
 */
export function createVegetation(height, o = {}) {
  const P = { rect: [-500, -500, 500, 500], trees: 3000, rocks: 600, water: 0, snow: 1e9, maxSlope: 0.55, seed: 11,
    kinds: { pine: 0.3, broad: 0.28, cypress: 0.1 }, shrubs: 0, grass: 0, grassFar: 40, grassA: 0x46531f, grassB: 0x7d7040, leafA: 0x3a5623, leafB: 0x6e7c35, bark: 0x4a3b2c, ...o };
  const r = rng(P.seed), group = new THREE.Group();
  group.name = 'gfx:vegetation';
  const U = { vTime: { value: 0 }, vWind: { value: 1 }, vLeafA: { value: new THREE.Color(P.leafA) },
    vLeafB: { value: new THREE.Color(P.leafB) }, vBark: { value: new THREE.Color(P.bark) }, vGrassFar: { value: P.grassFar },
    vGrassA: { value: new THREE.Color(P.grassA) }, vGrassB: { value: new THREE.Color(P.grassB) } };
  const [x0, z0, x1, z1] = P.rect;
  const slope = (x, z) => { const e = 1.5, hx = height(x + e, z) - height(x - e, z), hz = height(x, z + e) - height(x, z - e); return Math.hypot(hx, hz) / (2 * e); };
  // Orman maskesi: arazi malzemesindeki orman lekeleriyle uyumlu, ucuz CPU gürültüsü
  const forest = P.forest || ((x, z) => {
    const f = (a, b) => Math.sin(a) * Math.cos(b);
    return 0.5 + 0.3 * f(x * 0.018 + 1.3, z * 0.021) + 0.2 * f(x * 0.051 + z * 0.02, z * 0.047 - 2.1);
  });
  const pick = (tries, ok) => {
    for (let t = 0; t < tries; t++) {
      let x, z;
      if (P.near && r() < 0.6) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * P.near[2]; x = P.near[0] + Math.cos(a) * d; z = P.near[1] + Math.sin(a) * d; }
      else { x = x0 + r() * (x1 - x0); z = z0 + r() * (z1 - z0); }
      const h = height(x, z);
      if (ok(x, z, h)) return [x, h, z];
    }
    return null;
  };
  const kinds = Object.entries(P.kinds).filter(([, w]) => w > 0);
  const wsum = kinds.reduce((s, [, w]) => s + w, 0);
  const mat = foliageMaterial(U);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [kind, w] of kinds) {
    const n = Math.round(P.trees * w / wsum);
    if (!n) continue;
    const geos = [0, 1, 2].map((v) => makeTree(kind, P.seed * 31 + v * 7 + kind.length));
    for (let v = 0; v < geos.length; v++) {
      const cnt = Math.ceil(n / geos.length);
      const im = new THREE.InstancedMesh(geos[v], mat, cnt);
      let k = 0;
      for (let i = 0; i < cnt; i++) {
        const p = pick(12, (x, z, h) => h > P.water + 2.5 && h < P.snow - 80 && slope(x, z) < P.maxSlope && r() < THREE.MathUtils.smoothstep(forest(x, z), 0.35, 0.7) * 0.9 + 0.04);
        if (!p) continue;
        q.setFromAxisAngle(up, r() * Math.PI * 2);
        const s = 0.7 + r() * 0.6;
        sc.set(s * (0.9 + r() * 0.2), s * (0.85 + r() * 0.3), s * (0.9 + r() * 0.2));
        m4.compose(new THREE.Vector3(p[0], p[1] - 0.3, p[2]), q, sc);
        im.setMatrixAt(k++, m4);
      }
      im.count = k;
      im.castShadow = true; im.receiveShadow = true;
      im.frustumCulled = false;
      im.name = 'gfx:tree-' + kind;
      group.add(im);
    }
  }
  // Maki çalıları: ağaçlardan bağımsız, açık alanlara da yayılır
  if (P.shrubs > 0) {
    for (let v = 0; v < 3; v++) {
      const cnt = Math.ceil(P.shrubs / 3), im = new THREE.InstancedMesh(makeTree('shrub', P.seed * 17 + v * 5), mat, cnt);
      let k = 0;
      for (let i = 0; i < cnt; i++) {
        const p = pick(10, (x, z, h) => h > P.water + 1.8 && h < P.snow - 60 && slope(x, z) < P.maxSlope + 0.15 && r() < 0.2 + 0.7 * forest(x, z));
        if (!p) continue;
        q.setFromAxisAngle(up, r() * Math.PI * 2);
        const s = 0.6 + r() * 0.9;
        m4.compose(new THREE.Vector3(p[0], p[1] - 0.15, p[2]), q, sc.set(s, s * (0.7 + r() * 0.5), s));
        im.setMatrixAt(k++, m4);
      }
      im.count = k; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.name = 'gfx:shrubs';
      group.add(im);
    }
  }
  // Çim öbekleri (yakın çevre): her örnek 7 eğik yaprak; kök koyu, uç açık
  const GA = P.grassAt || (P.near && [P.near[0], P.near[1], P.near[2] * 0.35]);
  if (P.grass > 0 && GA) {
    const blades = [], cols = [];
    for (let b = 0; b < 7; b++) {
      const a = b / 7 * Math.PI * 2 + r(), d = r() * 0.25, h = 0.3 + r() * 0.4, w = 0.06, lean = 0.15 + r() * 0.25;
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d, tx = Math.cos(a + 1.3) * w, tz = Math.sin(a + 1.3) * w;
      const ex = cx + Math.cos(a) * lean * h, ez = cz + Math.sin(a) * lean * h;
      blades.push(cx - tx, 0, cz - tz, cx + tx, 0, cz + tz, ex, h, ez);
      cols.push(0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.85, 0.85, 0.85);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute('leaf', new THREE.Float32BufferAttribute(new Array(blades.length / 3).fill(1), 1));
    g.computeVertexNormals();
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
    const gm = foliageMaterial(U, true);
    const im = new THREE.InstancedMesh(g, gm, P.grass);
    let k = 0;
    for (let i = 0; i < P.grass; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * GA[2], x = GA[0] + Math.cos(a) * d, z = GA[1] + Math.sin(a) * d, h = height(x, z);
      if (h < P.water + 2.2 || slope(x, z) > P.maxSlope + 0.1) continue;
      q.setFromAxisAngle(up, r() * 6.283);
      const s = 0.7 + r() * 0.8;
      m4.compose(new THREE.Vector3(x, h - 0.03, z), q, sc.set(s, s, s));
      im.setMatrixAt(k++, m4);
    }
    im.count = k; im.receiveShadow = true; im.frustumCulled = false; im.userData.noAO = true;
    im.name = 'gfx:grass';
    group.add(im);
  }
  if (P.rocks > 0) {
    const rm = new THREE.MeshStandardMaterial({ color: 0x6c675f, roughness: 0.9 });
    rm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRP; varying float vRS;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRP = position; vRS = fract(instanceMatrix[3].x*0.137 + instanceMatrix[3].z*0.071);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vRP; varying float vRS; ${NOISE3_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float rn = fbm3(vRP*3.0 + vRS*40.0, 5);
          diffuseColor.rgb *= (0.6 + 0.7*rn)*mix(vec3(1.0), vec3(1.08, 0.97, 0.86), vRS);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.33, 0.18), smoothstep(0.55, 0.9, normalize(vRP).y + 0.3*rn)*0.6); // yosun/liken üstte`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { float e = 0.02, s = 6.0; float b0 = fbm3(vRP*s, 4);
            vec3 g = vec3(fbm3((vRP + vec3(e,0,0))*s, 4) - b0, fbm3((vRP + vec3(0,e,0))*s, 4) - b0, fbm3((vRP + vec3(0,0,e))*s, 4) - b0)/e;
            normal = normalize(normal - 0.12*(viewMatrix*vec4(g, 0.0)).xyz); }`);
    };
    rm.customProgramCacheKey = () => 'simlab-rock';
    for (let v = 0; v < 3; v++) {
      const cnt = Math.ceil(P.rocks / 3), im = new THREE.InstancedMesh(makeRock(P.seed + v * 13), rm, cnt);
      let k = 0;
      for (let i = 0; i < cnt; i++) {
        const p = pick(10, (x, z, h) => h > P.water - 1.5 && r() < 0.25 + slope(x, z) * 1.5);
        if (!p) continue;
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * Math.PI * 2, (r() - 0.5) * 0.4));
        const s = 0.4 + Math.pow(r(), 3) * 3.5;
        m4.compose(new THREE.Vector3(p[0], p[1] - s * 0.25, p[2]), q, sc.set(s, s, s));
        im.setMatrixAt(k++, m4);
      }
      im.count = k; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.name = 'gfx:rocks';
      group.add(im);
    }
  }
  group.traverse((ob) => { if (ob.isInstancedMesh) { ob.userData.noFit = true; ob.userData.noAO = true; } }); // geniş alana yayılı: gölge kutusunu şişirmesin
  return {
    group, uniforms: U,
    update(t, wind = 1) { U.vTime.value = t; U.vWind.value = wind; },
  };
}
