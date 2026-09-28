// Orman Yangını — Alexandridis tipi hücresel otomat: rüzgâr, eğim, nem ve bitki örtüsüne bağlı yayılma; yangın şeridi ve su uçağı.
import { createSim, THREE, ImprovedNoise, fmt, clamp, lerp, seeded, instanced, mat, createTerrain, terrainMaterial, terrainSkirt, createVegetation, depthTexture, RoundedBoxGeometry, BufferGeometryUtils } from '@core';
import { softDot, houseGeometries, plaster, roofTiles, treeGeometry, leafMat, barkMat } from './kit.js';

const N = 80;            // N×N hücre
const CELL_M = 20;       // bir hücre 20 m × 20 m
const HA = (CELL_M * CELL_M) / 10000; // hücre başına hektar (0,04)
const HALF = N / 2;
const SIZE = N * CELL_M; // 1.600 m
const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;

const sim = createSim({
  // Öğleden sonra güneşi: ışık yangın cephesine çapraz vurur, ağaç gölgeleri uzun düşer (derinlik).
  sky: { elevation: 24, azimuth: 236, clouds: 0.34, haze: 2.1, visibility: 3000, wind: [6, 0] },
  ocean: { wind: 3, windDir: 270, fetch: 2, foam: 0.1 },
  // Gölge haritası çekirdek tarafından her karede kameranın baktığı bölgeye göre sığdırılır (core/look.js).
  shadows: true, shadowSize: 900,
  camera: { position: [-560, 205, 760], target: [40, 60, 40], fov: 42, near: 1, far: 80000 },
  controls: { minDistance: 30, maxDistance: 6000, maxPolarAngle: Math.PI * 0.47 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>${fmt(N * N * HA, 0)} hektarlık tepelik bir Akdeniz ormanı (1,6 km × 1,6 km): kızılçam, meşe, maki çalılığı ve çayır alanları, bir göl,
    bir orman yolu ve bir köy. Arazi 20 m × 20 m'lik hücrelere bölünmüştür; her ağaç kendi hücresinin durumunu gösterir
    (yeşil, yanan, kömürleşmiş, ıslak). Her dakika yanan her hücre komşularını belli bir olasılıkla tutuşturur.</p>
    <h3>Model</h3>
    <p>Yayılma olasılığı Alexandridis ve ark. (2008) hücresel otomat modelinden uyarlanmıştır:
    <b>p = p<sub>h</sub> · (1+p<sub>bitki</sub>) · (1+p<sub>yoğunluk</sub>) · p<sub>rüzgâr</sub> · p<sub>eğim</sub></b>.</p>
    <ul>
      <li><b>Rüzgâr:</b> p<sub>w</sub> = e<sup>0,045·V</sup> · e<sup>0,131·V·(cos θ − 1)</sup> (V m/s, θ rüzgârla yayılma yönü arası açı). Rüzgâr yönünde hızlanır, tersine neredeyse durur.</li>
      <li><b>Eğim:</b> p<sub>s</sub> = e<sup>0,078·θ<sub>eğim</sub></sup>. Alev yokuş yukarı eğildiği için yangın <b>yokuş yukarı daha hızlı</b> ilerler.</li>
      <li><b>Bitki:</b> çam (reçineli) en kolay, çayır en zor tutuşur; ama çayır hızlı yanıp söner, meşe uzun süre yanar.</li>
      <li><b>Nem:</b> kuru hava (düşük bağıl nem) yakıtı kurutur. Nem etkisi modele yaklaşık bir çarpan olarak eklenmiştir (varsayım).</li>
      <li><b>Kıvılcım sıçraması:</b> kuvvetli rüzgârda çam kozalakları ve közler rüzgâr yönünde yüzlerce metre uçup yeni yangınlar başlatabilir.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li>Rüzgârı 50 km/sa, nemi %10 yap: yangının köye nasıl koştuğunu gör. Sonra nemi %60 yap.</li>
      <li>"Şerit çiz" modunda yangının önüne bir <b>yangın şeridi</b> çek. Kıvılcım sıçraması açıkken şerit her zaman yeterli mi?</li>
      <li>"Su bırak" moduyla uçağı alev cephesine gönder. Uçak her seferden sonra dolmak için zamana ihtiyaç duyar.</li>
      <li>Vadiden yokuş yukarı ve tepeden aşağı yangın başlat, hızları karşılaştır.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Türkiye'de orman yangınlarının büyük çoğunluğu insan kaynaklıdır (anız yakma, sigara, piknik ateşi, elektrik hatları).
    Ormanda ateş yakma; yangın görürsen <b>112</b>'yi ara. Kızılçam ormanları yazın çok kolay tutuşur ve yangına uyum sağlamıştır:
    kozalakları yangından sonra açılarak ormanı yeniler.</p>
    <p><small>Hücre boyu 20 m, zaman adımı 1 dakika. Arazi, ağaçlar ve evler gerçek ölçektedir (dikey abartı yok). Model eğitim amaçlıdır; gerçek yangın davranışı yakıt nemi, alev boyu, taç yangını gibi pek çok etkene bağlıdır.</small></p>`,
});
const scene = sim.scene;

// --- Bitki / hücre tipleri ---
const V_WATER = 0, V_CAM = 1, V_MESE = 2, V_CALI = 3, V_CAYIR = 4, V_YOL = 5, V_SERIT = 6, V_EV = 7;
const VEG = [
  { name: 'Göl', burn: false },
  { name: 'Çam', burn: true, pveg: 0.4, dur: 5 },
  { name: 'Meşe', burn: true, pveg: -0.2, dur: 8 },
  { name: 'Çalı (maki)', burn: true, pveg: 0, dur: 3 },
  { name: 'Çayır', burn: true, pveg: -0.3, dur: 1 },
  { name: 'Orman yolu', burn: false },
  { name: 'Yangın şeridi', burn: false },
  { name: 'Ev', burn: true, pveg: 0, dur: 12 },
];
const PRESETS = {
  karisik: { label: 'Karışık', f: [0.36, 0.28, 0.2, 0.16] },
  cam: { label: 'Çam ağırlıklı', f: [0.7, 0.1, 0.12, 0.08] },
  mese: { label: 'Meşe ağırlıklı', f: [0.1, 0.66, 0.14, 0.1] },
  maki: { label: 'Maki/çalılık', f: [0.08, 0.08, 0.64, 0.2] },
};

// --- Hücre dizileri ---
const NN = N * N;
const H = new Float32Array(NN);      // yükseklik (m, model)
const veg = new Uint8Array(NN);
const origVeg = new Uint8Array(NN);
const state = new Uint8Array(NN);    // 0 yanmaz, 1 yakıt, 2 yanıyor, 3 kül
const burnT = new Uint8Array(NN);
const wet = new Float32Array(NN);    // dakika
let burning = [];
const idx = (i, j) => j * N + i;
const cellX = (i) => (i - HALF + 0.5) * CELL_M, cellZ = (j) => (j - HALF + 0.5) * CELL_M;

// --- Arazi yükseklik alanı (sürekli; hücre merkezlerinde modelle aynı) ---
let seed = 7, waterLevel = 0, hMin = 0, hMax = 1;
const noise = new ImprovedNoise();
function rawH(x, z) { // x, z dünya metresi
  const xn = (x / CELL_M + HALF - 0.5) / N, zn = (z / CELL_M + HALF - 0.5) / N, ox = seed * 17.31, oz = seed * 7.77;
  return 0.62 * noise.noise(xn * 2.1 + ox, zn * 2.1 + oz, 0.37) + 0.27 * noise.noise(xn * 4.7 + oz, zn * 4.7 + ox, 1.7) + 0.11 * noise.noise(xn * 10 + ox, zn * 10, 4.1)
    - 0.12 * (clamp(xn, -0.3, 1.3) + clamp(zn, -0.3, 1.3));
}
/** Görsel yükseklik (m, göl yüzeyi = 0): alan dışında tepeler yükselir (çanak), ince pürüz eklenir. */
function hWorld(x, z) {
  const out = Math.max(Math.abs(x), Math.abs(z)) - SIZE / 2;
  const base = ((rawH(x, z) - hMin) / (hMax - hMin)) * 300 - waterLevel;
  const rough = 1.6 * noise.noise(x * 0.021, z * 0.021, 7.3) + 0.7 * noise.noise(x * 0.07, z * 0.07, 2.2);
  return base + rough + THREE.MathUtils.smoothstep(out, 0, 500) * 110;
}
function genTerrain() {
  let mn = Infinity, mx = -Infinity;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const h = rawH(cellX(i), cellZ(j)); H[idx(i, j)] = h; mn = Math.min(mn, h); mx = Math.max(mx, h); }
  hMin = mn; hMax = mx;
  for (let k = 0; k < NN; k++) H[k] = ((H[k] - mn) / (mx - mn)) * 300; // 0–300 m rölyef
  const sorted = Float32Array.from(H).sort();
  waterLevel = sorted[Math.floor(NN * 0.05)];
}

// Hücre durum haritası (arazi malzemesine): R kül, G ıslak, B çıplak toprak (yol/şerit), A yanıyor
const cellData = new Uint8Array(NN * 4);
const cellTex = new THREE.DataTexture(cellData, N, N, THREE.RGBAFormat);
cellTex.magFilter = cellTex.minFilter = THREE.LinearFilter; cellTex.needsUpdate = true;
const fireU = { uCellMap: { value: cellTex }, uCellO: { value: new THREE.Vector2(-SIZE / 2, -SIZE / 2) }, uCellS: { value: SIZE }, uFireT: { value: 0 } };
function burnTerrainMaterial(opts) {
  const m = terrainMaterial(opts), orig = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    orig(sh, r);
    Object.assign(sh.uniforms, fireU);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uCellMap; uniform vec2 uCellO; uniform float uCellS, uFireT; vec4 gCell; float gAsh;')
      .replace('diffuseColor.rgb = c;', `diffuseColor.rgb = c;
        {
          vec2 cuv = (vTW.xz - uCellO)/uCellS;
          gCell = (cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0) ? texture2D(uCellMap, cuv) : vec4(0.0);
          float an = fbm3(tP*0.3, 3), fn = vn3(tP*1.7);
          float bare = smoothstep(0.35, 0.6, gCell.b + 0.25*(an - 0.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.46, 0.37, 0.27)*(0.75 + 0.45*an)*(0.85 + 0.3*fn), bare);
          gAsh = smoothstep(0.3, 0.6, gCell.r + 0.3*(an - 0.5));
          vec3 ash = mix(vec3(0.035, 0.03, 0.028), vec3(0.2, 0.19, 0.18), smoothstep(0.55, 0.85, fbm3(tP*0.9, 3)))*(0.7 + 0.6*fn);
          diffuseColor.rgb = mix(diffuseColor.rgb, ash, gAsh);
          diffuseColor.rgb *= 1.0 - 0.4*gCell.g;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float fl = fbm3(tP*0.12 + vec3(0.0, uFireT*0.9, uFireT*0.3), 3);
          float emb = smoothstep(0.45, 0.8, vn3(tP*0.8 + uFireT*0.2));
          totalEmissiveRadiance += vec3(1.0, 0.3, 0.05)*gCell.a*(3.0*fl*fl + 2.0*emb)*2.5;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, gAsh);');
  };
  m.customProgramCacheKey = () => 'orman-yangini-terrain';
  return m;
}
function writeCell(k) {
  const o = k * 4;
  cellData[o] = state[k] === 3 || (state[k] === 2 && burnT[k] < VEG[veg[k]].dur) ? 255 : 0;
  cellData[o + 1] = wet[k] > 0 ? 255 : 0;
  cellData[o + 2] = veg[k] === V_YOL || veg[k] === V_SERIT ? 255 : 0;
  cellData[o + 3] = state[k] === 2 ? 255 : 0;
  cellDirty = true;
}
let cellDirty = false;

// Arazi ağları (yeniden üretilebilir): alan (sık ağ) + çevre + ufka etek
const landGroup = new THREE.Group();
scene.add(landGroup);
let terrain = null;
// Alan içi zemin: orman örtüsü altında koyu gölge (ağaçlar zemine oturur), açıklıklarda kurumuş çayır.
const domainMat = burnTerrainMaterial({ water: 0, grass: 0x6f7a36, dry: 0xa89359, soil: 0x6e5438, forest: 0.95, forestCol: 0x2b3a1c, rock: 0x847a6c, sand: 0xb7a37a });
function buildLand() {
  landGroup.children.forEach((c) => c.geometry.dispose());
  landGroup.clear();
  terrain = createTerrain(hWorld, { size: [SIZE + 40, SIZE + 40], res: LOW ? [240, 240] : [330, 330], material: domainMat });
  landGroup.add(terrain);
  const inside = (x, z) => Math.min(THREE.MathUtils.smoothstep(Math.abs(x), SIZE / 2 + 20, SIZE / 2 - 20), THREE.MathUtils.smoothstep(Math.abs(z), SIZE / 2 + 20, SIZE / 2 - 20));
  // Alan dışı: uzak tepeler orman gölgesiyle koyulaşır → ufukta hava perspektifi okunur
  const opts = { water: 0, grass: 0x6b7639, dry: 0xa08d5c, forest: 0.95, forestCol: 0x2f4020 };
  landGroup.add(createTerrain((x, z) => hWorld(x, z) - 3 * inside(x, z), { size: [10000, 10000], res: [220, 220], materialOptions: opts }));
  landGroup.add(terrainSkirt(hWorld, { inner: 5000, outer: 60000, material: terrainMaterial(opts) }));
  sim.ocean.setDepth(depthTexture(hWorld, [-1200, -1200, 1200, 1200], 256), [-1200, -1200, 1200, 1200]);
}
// Çevre ormanı (alan dışı): motorun bitki örtüsü
let outerVeg = null;
function buildOuterVeg() {
  if (outerVeg) { outerVeg.group.removeFromParent(); outerVeg.group.traverse((o) => o.geometry?.dispose()); }
  outerVeg = createVegetation(hWorld, {
    rect: [-4200, -4200, 4200, 4200], trees: LOW ? 4000 : 9000, shrubs: LOW ? 2000 : 5000, rocks: 300, seed: seed + 3, water: 1,
    // Koyu ve doygun yaprak rengi: zemin gölgesiyle birlikte okunur bir orman kütlesi oluşur
    kinds: { pine: 0.6, broad: 0.3, cypress: 0.1 }, leafA: 0x22381a, leafB: 0x4a5826,
    forest: (x, z) => (Math.max(Math.abs(x), Math.abs(z)) < SIZE / 2 + 40 ? 0 : 0.55 + 0.35 * Math.sin(x * 0.004 + 1.3) * Math.cos(z * 0.005)),
  });
  scene.add(outerVeg.group);
}

let village = { i: 60, j: 50, houses: [] };
function genVegetation(presetKey) {
  const f = PRESETS[presetKey].f;
  const o = seed * 3.3;
  const score = new Float32Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = idx(i, j);
    // Yüksek yerlerde çam, alçakta çalı/çayır
    score[k] = noise.noise(i * 0.09 + o, j * 0.09, 2.2) + 0.5 * noise.noise(i * 0.25, j * 0.25 + o, 5.5) + 0.9 * (H[k] / 300);
  }
  const land = [];
  for (let k = 0; k < NN; k++) if (H[k] > waterLevel) land.push(k); else veg[k] = V_WATER;
  land.sort((a, b) => score[b] - score[a]);
  const cum = [f[0], f[0] + f[1], f[0] + f[1] + f[2]];
  land.forEach((k, r) => {
    const q = r / land.length;
    veg[k] = q < cum[0] ? V_CAM : q < cum[1] ? V_MESE : q < cum[2] ? V_CALI : V_CAYIR;
  });
  // Orman yolu (kıvrımlı, 4-bağlantılı)
  roadPts.length = 0;
  let pj = Math.round(N * 0.3);
  for (let i = 0; i < N; i++) {
    const tjf = N * 0.3 + Math.sin(i * 0.09 + seed) * 7 + i * 0.25, tj = Math.round(tjf);
    roadPts.push([i, tjf]);
    while (pj !== tj) { setRoad(i, pj); pj += Math.sign(tj - pj); }
    setRoad(i, pj);
  }
  // Köy: güneydoğuda en düz, sudan olmayan yer
  let best = null, bestS = Infinity;
  for (let j = 44; j < 66; j++) for (let i = 54; i < 70; i++) {
    const k = idx(i, j);
    if (veg[k] === V_WATER || veg[k] === V_YOL) continue;
    const s = Math.abs(H[k] - H[idx(i + 2, j)]) + Math.abs(H[k] - H[idx(i, j + 2)]) + Math.abs(H[k] - H[idx(i - 2, j)]) + H[k] * 0.05;
    if (s < bestS) { bestS = s; best = [i, j]; }
  }
  village = { i: best[0], j: best[1], houses: [] };
  for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
    const i = best[0] + di, j = best[1] + dj, k = idx(i, j);
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    if (veg[k] !== V_WATER && veg[k] !== V_YOL && di * di + dj * dj <= 16) veg[k] = V_CAYIR;
  }
  const spots = [[-2, -2], [1, -2], [-3, 1], [0, 1], [3, 0], [1, 3]];
  for (const [di, dj] of spots) {
    const k = idx(best[0] + di, best[1] + dj);
    if (veg[k] === V_WATER || veg[k] === V_YOL) continue;
    veg[k] = V_EV;
    village.houses.push({ k, burned: false });
  }
  origVeg.set(veg);
}
const roadPts = [];
function setRoad(i, j) {
  if (i < 0 || j < 0 || i >= N || j >= N) return;
  const k = idx(i, j);
  if (veg[k] !== V_WATER) veg[k] = V_YOL;
}

// --- Ağaçlar: her hücrede gerçek boyda birkaç ağaç (taç + gövde ayrı; durum rengi örnek başına) ---
const KINDS = { [V_CAM]: { kind: 'pine', per: LOW ? 2 : 4, leaf: 0x24391c }, [V_MESE]: { kind: 'oak', per: LOW ? 2 : 3, leaf: 0x3d4f22 }, [V_CALI]: { kind: 'shrub', per: LOW ? 3 : 5, leaf: 0x4a5527 } };
const trunkMat = barkMat(0x4a3b2c);
const TG = {};
for (const v of [V_CAM, V_MESE, V_CALI]) TG[v] = { geo: treeGeometry(KINDS[v].kind, v * 3 + 1), mat: leafMat(KINDS[v].leaf) };
let treeMeshes = {};
const cellTrees = new Array(NN);   // hücre → [başlangıç, adet]
const tInfo = [];                   // [v][n] = [x, y, z, s, rot, tone]
function buildTrees() {
  Object.values(treeMeshes).forEach(({ crown, trunk }) => { crown.removeFromParent(); trunk.removeFromParent(); crown.dispose(); trunk.dispose(); });
  treeMeshes = {};
  const rnd = seeded(seed * 101 + 3);
  const counts = { [V_CAM]: 0, [V_MESE]: 0, [V_CALI]: 0 };
  for (let k = 0; k < NN; k++) if (counts[origVeg[k]] !== undefined) counts[origVeg[k]] += KINDS[origVeg[k]].per;
  for (const v of [V_CAM, V_MESE, V_CALI]) {
    const n = Math.max(1, counts[v]);
    const crown = instanced(TG[v].geo.crown, TG[v].mat, n), trunk = instanced(TG[v].geo.trunk, trunkMat, n);
    crown.count = trunk.count = counts[v];
    crown.frustumCulled = trunk.frustumCulled = false;
    crown.userData.n = 0;
    treeMeshes[v] = { crown, trunk };
    tInfo[v] = [];
    scene.add(crown, trunk);
  }
  for (let k = 0; k < NN; k++) {
    const v = origVeg[k], T = treeMeshes[v];
    cellTrees[k] = null;
    if (!T) continue;
    const i = k % N, j = (k / N) | 0, per = KINDS[v].per, start = T.crown.userData.n;
    for (let q = 0; q < per; q++) {
      const x = cellX(i) + (rnd() - 0.5) * CELL_M * 0.9, z = cellZ(j) + (rnd() - 0.5) * CELL_M * 0.9;
      tInfo[v][start + q] = [x, hWorld(x, z) - 0.25, z, 0.75 + rnd() * 0.5, rnd() * 6.28, rnd()];
    }
    T.crown.userData.n += per;
    cellTrees[k] = [start, per];
    setTree(k);
  }
  for (const T of Object.values(treeMeshes)) for (const m of [T.crown, T.trunk]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
function setTree(k) {
  const v = origVeg[k], T = treeMeshes[v], ct = cellTrees[k];
  if (!T || !ct) return;
  for (let q = 0; q < ct[1]; q++) {
    const n = ct[0] + q, b = tInfo[v][n];
    let s = b[3], cs = 1;
    _c2.setRGB(0.8, 0.8, 0.8);
    if (veg[k] === V_SERIT) { s = 0.0001; }
    else if (state[k] === 2) { _c.setRGB(0.32, 0.1, 0.03).multiplyScalar(0.6 + 0.6 * b[5]); _c2.setRGB(0.12, 0.09, 0.07); cs = 0.9; }
    else if (state[k] === 3) { _c.setRGB(0.045, 0.04, 0.036); _c2.setRGB(0.04, 0.035, 0.03); cs = v === V_CALI ? 0.25 : 0.55; }
    else { _c.setRGB(1, 1, 1).multiplyScalar(0.85 + 0.3 * b[5]); if (wet[k] > 0) _c.multiply(_v2c.setRGB(0.7, 0.82, 0.95)); }
    _q.setFromAxisAngle(UP, b[4]);
    _m.compose(_v.set(b[0], b[1], b[2]), _q, _s.set(s * cs, s * (state[k] === 3 ? 0.9 : 1) * (cs < 1 ? 1 : 1), s * cs));
    T.crown.setMatrixAt(n, _m); T.crown.setColorAt(n, _c);
    _m.compose(_v, _q, _s.set(s, s, s));
    T.trunk.setMatrixAt(n, _m); T.trunk.setColorAt(n, _c2);
  }
  T.crown.instanceMatrix.needsUpdate = T.trunk.instanceMatrix.needsUpdate = true;
  T.crown.instanceColor.needsUpdate = T.trunk.instanceColor.needsUpdate = true;
}
const _v2c = new THREE.Color();
function paint(k) { writeCell(k); setTree(k); }

// Orman yolu: toprak şerit (yumuşak eğri, araziye oturur)
let roadMesh = null;
const roadMat = mat.asphalt({ color: 0x8a7458, scale: 0.6 });
function buildRoad() {
  if (roadMesh) { roadMesh.removeFromParent(); roadMesh.geometry.dispose(); }
  const pos = [], idx2 = [];
  const pts = roadPts.map(([i, jf]) => new THREE.Vector3(cellX(i), 0, (jf - HALF + 0.5) * CELL_M));
  const curve = new THREE.CatmullRomCurve3(pts), NS = 400;
  for (let s = 0; s <= NS; s++) {
    const p = curve.getPoint(s / NS), t = curve.getTangent(s / NS);
    const sx = -t.z, sz = t.x, L = Math.hypot(sx, sz) || 1;
    for (const u of [-2.6, 2.6]) { const x = p.x + sx / L * u, z = p.z + sz / L * u; pos.push(x, Math.max(hWorld(x, z), 0.2) + 0.25, z); }
    if (s < NS) { const a = s * 2; idx2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx2); g.computeVertexNormals();
  roadMesh = new THREE.Mesh(g, roadMat);
  roadMesh.userData.noCast = true;
  scene.add(roadMesh);
}

// --- Köy evleri: gerçek boyda, kiremit çatılı; yanınca kararır, çatı çöker ---
const houseGroup = new THREE.Group();
scene.add(houseGroup);
const HGEO = [houseGeometries({ w: 9, d: 8, floors: 1, roof: 'gable' }), houseGeometries({ w: 10, d: 8, floors: 2, roof: 'gable' })];
const hWall = plaster(0xece2cc), hRoof = roofTiles(0xa4492c), hGlass = mat.plastic({ color: 0x1d2630, gloss: 1 }), hTrim = mat.wood({ color: 0x6b4a2e });
let villageLabel;
function buildHouses() {
  houseGroup.clear();
  village.houses.forEach((h, n) => {
    const i = h.k % N, j = (h.k / N) | 0, x = cellX(i), z = cellZ(j), G = HGEO[n % 2];
    const g = new THREE.Group();
    const walls = new THREE.Mesh(G.walls, hWall.clone()), roof = new THREE.Mesh(G.roof, hRoof), glass = new THREE.Mesh(G.glass, hGlass), trim = new THREE.Mesh(G.trim, hTrim);
    g.add(walls, roof, glass, trim);
    const y = Math.min(hWorld(x - 5, z - 5), hWorld(x + 5, z - 5), hWorld(x - 5, z + 5), hWorld(x + 5, z + 5));
    g.position.set(x, y - 0.3, z); g.rotation.y = n * 0.9 + 0.3;
    houseGroup.add(g);
    h.mesh = g; h.walls = walls; h.roof = roof;
  });
  if (villageLabel) villageLabel.removeFromParent();
  villageLabel = sim.label('🏘 Köy', { position: [cellX(village.i), hWorld(cellX(village.i), cellZ(village.j)) + 45, cellZ(village.j)] });
}
function burnHouse(h) {
  h.walls.material.color.setHex(0x2a2522);
  h.roof.visible = false;
}

// --- Parçacıklar: alev, duman, su (metre cinsinden boy, yumuşak yuvarlak doku) ---
const DOT = softDot();
const PU = { map: { value: DOT }, scale: { value: 600 } };
function particleSystem(max, additive) {
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array(max * 3), C = new Float32Array(max * 3), A = new Float32Array(max), S = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(A, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(S, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: PU,
    vertexShader: `attribute float alpha; attribute float size; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale;
      void main(){ vA=alpha; vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/max(-mv.z,1.0); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC;
      void main(){ vec4 t=texture2D(map, gl_PointCoord); gl_FragColor=vec4(vC, t.a*vA); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, m);
  pts.frustumCulled = false;
  scene.add(pts);
  const life = new Float32Array(max), maxLife = new Float32Array(max), vel = new Float32Array(max * 3);
  return { pts, geo, P, C, A, S, life, maxLife, vel, max, next: 0 };
}
const smoke = particleSystem(LOW ? 600 : 1000, false);
const flames = particleSystem(LOW ? 900 : 1600, true);
const drops = particleSystem(600, false);
function spawn(ps, x, y, z, vx, vy, vz, lifeS, size, r, g, b) {
  const n = ps.next; ps.next = (n + 1) % ps.max;
  ps.P[n * 3] = x; ps.P[n * 3 + 1] = y; ps.P[n * 3 + 2] = z;
  ps.vel[n * 3] = vx; ps.vel[n * 3 + 1] = vy; ps.vel[n * 3 + 2] = vz;
  ps.life[n] = lifeS; ps.maxLife[n] = lifeS; ps.S[n] = size;
  ps.C[n * 3] = r; ps.C[n * 3 + 1] = g; ps.C[n * 3 + 2] = b;
}

// --- Rüzgâr oku (veri katmanı) ---
// Rüzgâr oku: araziye yakın, ince ve yarı saydam — harita oku gibi. Bilgi değeri korunur,
// gökyüzünde asılı çöp olmaktan çıkar (renk/yön bilgisi etikette de yazılı).
const windArrow = new THREE.Group();
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfff2e0, transparent: true, opacity: 0.45, depthWrite: false });
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1, 10).rotateZ(-Math.PI / 2).translate(0.5, 0, 0), arrowMat);
const head = new THREE.Mesh(new THREE.ConeGeometry(10, 24, 12).rotateZ(-Math.PI / 2), arrowMat);
windArrow.add(shaft, head);
const WIND_ARROW_POS = [-SIZE / 2 + 150, -SIZE / 2 + 120];
windArrow.position.set(WIND_ARROW_POS[0], hWorld(WIND_ARROW_POS[0], WIND_ARROW_POS[1]) + 26, WIND_ARROW_POS[1]);
scene.add(windArrow);
const windLabel = sim.label('', { parent: windArrow, position: [0, 30, 0] });
// Ok her rüzgâr değişiminde araziye göre yüksekliğini tazeler (arazi eğimli)
function seatWindArrow() { windArrow.position.y = hWorld(WIND_ARROW_POS[0], WIND_ARROW_POS[1]) + 26; }
// Yön etiketleri: yükseklik sabit değil, arazi yüzeyine göre oturur
const compassLabels = [];
for (const [t, x, z] of [['K', 0, -SIZE / 2 - 60], ['G', 0, SIZE / 2 + 60], ['D', SIZE / 2 + 60, 0], ['B', -SIZE / 2 - 60, 0]]) {
  const L = sim.label(t, { position: [x, hWorld(x, z) + 40, z], className: 'plain big' });
  compassLabels.push({ L, x, z });
}

// --- Su uçağı (CL-415 benzeri amfibi): gövde, yüksek kanat, iki motor, kuyruk, kanat altı şamandıralar ---
const plane = new THREE.Group();
const props = [];
{
  const yel = mat.paintedMetal({ color: 0xf2c200, wear: 0.15 }), red = mat.paintedMetal({ color: 0xc8231c, wear: 0.15 }), dark = mat.paintedMetal({ color: 0x2a2d31, wear: 0.3 });
  const prof = [[0, 0.02], [0.6, 0.9], [2, 1.35], [5, 1.5], [11, 1.45], [15, 1.0], [19.5, 0.35], [19.8, 0.02]];
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, r]) => new THREE.Vector2(r, x)), 32), yel);
  body.rotation.z = Math.PI / 2; body.position.x = 9.9; body.scale.set(1, 1, 0.85);
  plane.add(body);
  const belly = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, r]) => new THREE.Vector2(r * 1.02, x)), 32, Math.PI * 0.62, Math.PI * 0.76), red);
  belly.rotation.z = Math.PI / 2; belly.position.x = 9.9; belly.scale.set(1, 1, 0.85);
  plane.add(belly);
  const wingS = new THREE.Shape(); wingS.moveTo(0, 0); wingS.bezierCurveTo(0.3, 0.35, 1.2, 0.42, 3.2, 0.12); wingS.lineTo(3.3, 0); wingS.bezierCurveTo(2, -0.08, 0.6, -0.12, 0, 0);
  const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(wingS, { depth: 28.6, bevelEnabled: false }), yel);
  wing.position.set(-2, 1.6, -14.3); plane.add(wing);
  for (const s of [-1, 1]) {
    const nac = new THREE.Mesh(new THREE.LatheGeometry([[0.02, -3], [0.6, -2.5], [0.75, -1], [0.7, 1.5], [0.3, 3]].map(([y, r]) => new THREE.Vector2(r, y)).map((v) => new THREE.Vector2(v.y, v.x)), 20), yel);
    nac.rotation.z = Math.PI / 2; nac.position.set(-1.5, 1.6, s * 4.6); plane.add(nac);
    const prop = new THREE.Mesh(new THREE.CircleGeometry(2, 24).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    prop.position.set(-4.6, 1.6, s * 4.6); plane.add(prop); props.push(prop);
    const flt = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 2.4, 4, 10).rotateZ(Math.PI / 2), yel);
    flt.position.set(-0.5, -0.6, s * 12.5); plane.add(flt);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), dark); strut.position.set(-0.5, 0.5, s * 12.5); plane.add(strut);
  }
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(3.2, 0); fin.lineTo(2.2, 5.5); fin.lineTo(0.9, 5.5); fin.closePath();
  const finM = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.25, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 }), red);
  finM.position.set(15.8, 0.8, -0.12); plane.add(finM);
  const stab = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.2, 10, 1, 0.08), yel); stab.position.set(18.2, 5.8, 0); plane.add(stab);
  const cockpit = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.7, 1.9, 2, 0.25), mat.plastic({ color: 0x14202c, gloss: 1 })); cockpit.position.set(1.4, 1.25, 0); plane.add(cockpit);
  plane.scale.setScalar(1);
  plane.visible = false;
  scene.add(plane);
}
const flight = { active: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), target: null, dropped: false };
let planeCooldown = 0; // dakika
const REFILL_MIN = 12;
const DROP_R = 2.6; // hücre (≈50 m)
const FLIGHT_S = 10; // gerçek saniye (geçiş)

function sendPlane(i, j) {
  if (flight.active) { sim.toast('Uçak zaten görevde.', 'warn'); return; }
  if (planeCooldown > 0) { sim.toast(`✈️ Uçak su alıyor: ${Math.ceil(planeCooldown)} dk sonra hazır.`, 'warn'); return; }
  const k = idx(i, j);
  const tx = cellX(i), tz = cellZ(j), ty = Math.max(hWorld(tx, tz), 0) + 45;
  // Uçak rüzgâra karşı yaklaşır
  const dx = -wind.x, dz = -wind.z, L = Math.hypot(dx, dz) || 1;
  const ux = L > 0.01 ? dx / L : 1, uz = L > 0.01 ? dz / L : 0;
  flight.from.set(tx - ux * 900, ty + 60, tz - uz * 900);
  flight.to.set(tx + ux * 900, ty + 60, tz + uz * 900);
  flight.target = { i, j, x: tx, y: ty, z: tz, k };
  flight.active = true; flight.t = 0; flight.dropped = false;
  plane.visible = true;
  plane.rotation.set(0, Math.atan2(uz, -ux), 0);
}
function applyDrop(ci, cj) {
  let put = 0;
  const R = Math.ceil(DROP_R);
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    if (di * di + dj * dj > DROP_R * DROP_R) continue;
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const k = idx(i, j);
    if (state[k] === 2) { state[k] = 1; burnT[k] = 0; put++; }
    if (state[k] === 1) wet[k] = 90;
    paint(k);
  }
  if (put) burning = burning.filter((k) => state[k] === 2);
  planeCooldown = REFILL_MIN;
  sim.toast(put ? `💧 ${put} hücrede alev söndürüldü. Islak alan ~90 dk tutuşmaz.` : '💧 Su bırakıldı: bitki ıslandı, tutuşması zorlaştı.', 'good');
}

// --- Durum ---
let minutes = 0, stepAcc = 0, fuel0 = 0, extinguishedToast = true, breakMeters = 0;
const hist = [];
const wind = { x: 1, z: 0, V: 0 };
const dirW = new Float32Array(8);
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function computeWind() {
  const th = (windDir.value * Math.PI) / 180; // nereden esiyor (0 = kuzey)
  wind.x = -Math.sin(th); wind.z = Math.cos(th); // estiği yön (kuzey = -z)
  wind.V = windSpeed.value / 3.6; // m/s
  for (let n = 0; n < 8; n++) {
    const [dx, dz] = NB[n];
    const L = Math.hypot(dx, dz);
    const cos = (dx * wind.x + dz * wind.z) / L;
    dirW[n] = Math.exp(wind.V * (0.045 + 0.131 * (cos - 1)));
  }
  // Ok
  windArrow.rotation.y = -Math.atan2(wind.z, wind.x);
  const len = 60 + windSpeed.value * 4;
  shaft.scale.x = len;
  head.position.x = len + 16;
  windArrow.visible = showArrow.value && windSpeed.value > 0.5;
  seatWindArrow();
  windLabel.setText(`💨 Rüzgâr ${fmt(windSpeed.value, 0)} km/sa · ${compass(windDir.value)}`);
  sim.sky.set({ wind: [wind.x * Math.max(wind.V, 1), wind.z * Math.max(wind.V, 1)] });
  sim.ocean.set({ wind: 1.5 + wind.V * 0.5, windDir: windDir.value });
}
const DIRS = ['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'];
const compass = (d) => `${DIRS[Math.round(d / 45) % 8]}dan`.replace('kuzeydan', 'kuzeyden').replace('doğudan', 'doğudan').replace('batıdan', 'batıdan').replace('güneydan', 'güneyden');
const moisture = () => clamp(Math.exp(-0.035 * (humidity.value - 30)), 0.12, 1.6);
const DENS = { seyrek: -0.4, normal: 0, sik: 0.3 };

function ignite(k) {
  if (state[k] !== 1) return false;
  state[k] = 2;
  burnT[k] = VEG[veg[k]].dur;
  wet[k] = 0;
  burning.push(k);
  paint(k);
  if (veg[k] === V_EV) {
    const h = village.houses.find((x) => x.k === k);
    if (h && !h.burned) {
      h.burned = true;
      burnHouse(h);
      sim.toast('🏚 Köyde bir ev yandı!', 'bad');
    }
  }
  extinguishedToast = false;
  return true;
}

function step() {
  minutes++;
  if (planeCooldown > 0) planeCooldown--;
  const PH = 0.58 * moisture();
  const den = 1 + DENS[density.value];
  const next = [];
  const spotOn = spotting.value && wind.V > 5;
  for (const k of burning) {
    if (state[k] !== 2) continue;
    const i = k % N, j = (k / N) | 0;
    const dur = VEG[veg[k]].dur;
    for (let n = 0; n < 8; n++) {
      const ni = i + NB[n][0], nj = j + NB[n][1];
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = nj * N + ni;
      if (state[nk] !== 1) continue;
      const dist = n < 4 ? CELL_M : CELL_M * Math.SQRT2;
      const slopeDeg = (Math.atan((H[nk] - H[k]) / dist) * 180) / Math.PI;
      let p = PH * (1 + VEG[veg[nk]].pveg) * den * dirW[n] * Math.exp(0.078 * slopeDeg);
      if (wet[nk] > 0) p *= 0.05;
      if (p >= 1) p = 1;
      // Yanma süresine yayılmış olasılık: toplamda ≈ p
      const ps = 1 - Math.pow(1 - p, 1 / dur);
      if (Math.random() < ps) next.push(nk);
    }
    // Kıvılcım sıçraması (yalnız çam, rüzgâr > 5 m/s)
    if (spotOn && veg[k] === V_CAM && Math.random() < 0.006 * (wind.V - 5)) {
      const d = 3 + Math.random() * wind.V * 0.9; // hücre (≈60–300 m)
      const a = (Math.random() - 0.5) * 0.5;
      const ca = Math.cos(a), sa = Math.sin(a);
      const si = Math.round(i + (wind.x * ca - wind.z * sa) * d), sj = Math.round(j + (wind.x * sa + wind.z * ca) * d);
      if (si >= 0 && sj >= 0 && si < N && sj < N) {
        const sk = sj * N + si;
        if (state[sk] === 1 && wet[sk] <= 0 && Math.random() < 0.5 * moisture()) { next.push(sk); spotted++; }
      }
    }
    if (--burnT[k] <= 0) { state[k] = 3; paint(k); } else if (burnT[k] === VEG[veg[k]].dur - 1) writeCell(k);
  }
  burning = burning.filter((k) => state[k] === 2);
  for (const k of next) ignite(k);
  // Kuruma
  if (minutes % 5 === 0) for (let k = 0; k < NN; k++) if (wet[k] > 0) { wet[k] -= 5; if (wet[k] <= 0) { wet[k] = 0; paint(k); } }
  if (!burning.length && !extinguishedToast) {
    extinguishedToast = true;
    sim.toast(`🧯 Yangın söndü. Toplam yanan alan: ${fmt(burnedHa(), 1)} ha`, 'good');
  }
  if (minutes % 5 === 0) {
    const b = burnedHa();
    hist.push([minutes, b]);
    if (hist.length > 400) hist.shift();
    chart.push([b, burning.length * HA]);
  }
}
let spotted = 0;
function burnedHa() {
  let c = 0;
  for (let k = 0; k < NN; k++) if (state[k] >= 2 && origVeg[k] !== V_WATER) c++;
  return c * HA;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('🖱 Tıklama modu');
const modeSeg = ui.segmented({
  options: [{ value: 'fire', label: '🔥 Tutuştur' }, { value: 'break', label: '🚧 Şerit çiz' }, { value: 'water', label: '✈️ Su bırak' }],
  value: 'fire',
  onChange: (v) => {
    if (sim.controls) sim.controls.enableRotate = v !== 'break';
    modeHelp.set({ fire: 'Araziye tıkla: o noktada yangın başlar.', break: 'Sol tuşla <b>sürükleyerek</b> yangın şeridi çiz (bitki temizlenir, ~60 m genişlik). Döndürmek için modu değiştir; sağ tuşla kaydırabilirsin.', water: 'Araziye tıkla: su uçağı rüzgâra karşı gelip ~100 m çaplı alana su bırakır.' }[v]);
  },
});
const modeHelp = ui.text('Araziye tıkla: o noktada yangın başlar.', 'card');

ui.section('🌬 Hava');
const windSpeed = ui.slider({ label: 'Rüzgâr hızı', min: 0, max: 60, step: 1, value: 20, unit: 'km/sa', onChange: () => computeWind() });
const windDir = ui.slider({ label: 'Rüzgâr yönü (nereden)', min: 0, max: 359, step: 1, value: 270, format: (v) => `${fmt(v, 0)}° · ${compass(v)}`, onChange: () => computeWind() });
const humidity = ui.slider({ label: 'Bağıl nem', min: 5, max: 90, step: 1, value: 25, unit: '%', onChange: () => humidityTone() });
const spotting = ui.toggle({ label: 'Kıvılcım sıçraması (közler uçar)', value: true });

ui.section('🌲 Orman');
const presetSel = ui.select({ label: 'Bitki örtüsü', options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })), value: 'karisik', onChange: () => rebuild(false) });
const density = ui.segmented({ label: 'Orman yoğunluğu', options: [{ value: 'seyrek', label: 'Seyrek' }, { value: 'normal', label: 'Normal' }, { value: 'sik', label: 'Sık' }], value: 'normal' });
ui.buttons([
  { label: '🗺 Yeni arazi', onClick: () => { seed = (seed * 31 + 11) % 997; rebuild(true); } },
  { label: '🧹 Şeritleri sil', onClick: () => clearBreaks() },
]);
ui.buttons([
  { label: '🔥 Rastgele tutuştur', variant: 'danger', onClick: () => randomIgnite() },
  { label: '✈️ Alev cephesine su', variant: 'primary', onClick: () => autoDrop() },
]);

ui.section('📊 Durum');
const stBurn = ui.stat({ label: 'Yanan alan', unit: 'ha' });
const stActive = ui.stat({ label: 'Şu an yanan', unit: 'ha' });
const stRate = ui.stat({ label: 'Yanma hızı', unit: 'ha/sa' });
const stSaved = ui.stat({ label: 'Kurtarılan orman', unit: '%' });
const stVillage = ui.stat({ label: 'Köy (sağlam ev)' });
const stPlane = ui.stat({ label: 'Su uçağı' });
const chart = ui.chart({ title: 'Yanan alan (ha) — zamanla', series: [{ name: 'Toplam yanan', color: '#f97316', fill: true }, { name: 'Aktif yangın', color: '#ef4444' }], maxPoints: 240 });
const riskCard = ui.text('', 'card');

ui.section('👁 Görünüm');
const showArrow = ui.toggle({ label: 'Rüzgâr oku', value: true, onChange: () => computeWind() });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => document.querySelectorAll('.label-layer .lbl').forEach((e) => (e.style.display = v ? '' : 'none')) });
ui.buttons([
  { label: '🔭 Genel', onClick: () => sim.moveCamera([-560, 205, 760], [40, 60, 40]) },
  { label: '🔥 Alev cephesi', onClick: () => frontView() },
  { label: '🏘 Köy', onClick: () => { const x = cellX(village.i), z = cellZ(village.j), y = hWorld(x, z); sim.moveCamera([x - 150, y + 70, z + 170], [x, y + 5, z]); } },
]);

function frontView() {
  let k = burning.length ? burning[0] : idx(20, 46), bs = -Infinity;
  for (const b of burning) { const s = (b % N) * wind.x + ((b / N) | 0) * wind.z; if (s > bs) { bs = s; k = b; } }
  const x = cellX(k % N), z = cellZ((k / N) | 0), y = hWorld(x, z);
  sim.moveCamera([x + wind.x * 260 + 120, y + 110, z + wind.z * 260 + 200], [x, y + 10, z]);
}

function humidityTone() {
  const h = humidity.value;
  const m = moisture();
  riskCard.set(`Yangın riski: <b style="color:${m > 1.2 ? 'var(--bad)' : m > 0.7 ? 'var(--warn)' : 'var(--good)'}">${m > 1.2 ? 'çok yüksek' : m > 0.7 ? 'yüksek' : m > 0.35 ? 'orta' : 'düşük'}</b> · nem %${fmt(h, 0)}, rüzgâr ${fmt(windSpeed.value, 0)} km/sa.
    <br><small>"30-30-30 kuralı": sıcaklık > 30 °C, nem < %30, rüzgâr > 30 km/sa ise yangın riski en yüksektir.</small>`);
}

function updateStats() {
  const b = burnedHa();
  stBurn.set(b, b > 50 ? 'bad' : b > 10 ? 'warn' : '');
  stActive.set(burning.length * HA, burning.length ? 'bad' : 'good');
  // Son 60 dakikadaki artış
  let rate = 0;
  if (hist.length > 1) {
    const last = hist[hist.length - 1];
    let first = hist[0];
    for (let q = hist.length - 1; q >= 0; q--) { if (last[0] - hist[q][0] >= 60) { first = hist[q]; break; } first = hist[q]; }
    const dm = last[0] - first[0];
    if (dm > 0) rate = ((last[1] - first[1]) / dm) * 60;
  }
  stRate.set(rate, rate > 30 ? 'bad' : rate > 5 ? 'warn' : '');
  let alive = 0;
  for (let k = 0; k < NN; k++) { const v = origVeg[k]; if ((v === V_CAM || v === V_MESE || v === V_CALI) && state[k] === 1) alive++; }
  const saved = fuel0 ? (100 * alive) / fuel0 : 100;
  stSaved.set(saved, saved > 90 ? 'good' : saved > 70 ? 'warn' : 'bad');
  const ok = village.houses.filter((h) => !h.burned).length;
  stVillage.set(`${ok}/${village.houses.length}`, ok === village.houses.length ? 'good' : ok ? 'warn' : 'bad');
  stPlane.set(flight.active ? 'Görevde' : planeCooldown > 0 ? `${Math.ceil(planeCooldown)} dk` : 'Hazır', flight.active || planeCooldown > 0 ? 'warn' : 'good');
}

// --- Etkileşim ---
function cellFromHit(p) {
  const i = Math.floor(p.x / CELL_M + HALF), j = Math.floor(p.z / CELL_M + HALF);
  return i >= 0 && j >= 0 && i < N && j < N ? [i, j] : null;
}
sim.onClick(() => [terrain], (hit) => {
  const c = cellFromHit(hit.point);
  if (!c) return;
  if (modeSeg.value === 'fire') {
    let n = 0;
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const i = c[0] + di, j = c[1] + dj;
      if (i >= 0 && j >= 0 && i < N && j < N && ignite(idx(i, j))) n++;
    }
    if (!n) sim.toast('Burada yanacak bir şey yok (su, yol, şerit ya da kül).', 'warn');
  } else if (modeSeg.value === 'water') sendPlane(c[0], c[1]);
});

let drawing = false, lastPt = null;
function stamp(fi, fj) {
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (di * di + dj * dj > 1) continue;
    const i = Math.floor(fi) + di, j = Math.floor(fj) + dj;
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const k = idx(i, j);
    if (state[k] !== 1 || veg[k] === V_EV) continue;
    veg[k] = V_SERIT; state[k] = 0;
    paint(k);
  }
}
function drawAt(e) {
  const hits = sim.raycast(e, [terrain]);
  if (!hits.length) return;
  const fi = hits[0].point.x / CELL_M + HALF, fj = hits[0].point.z / CELL_M + HALF;
  if (lastPt) {
    const d = Math.hypot(fi - lastPt[0], fj - lastPt[1]);
    const n = Math.ceil(d / 0.3);
    for (let s = 1; s <= n; s++) stamp(lerp(lastPt[0], fi, s / n), lerp(lastPt[1], fj, s / n));
    breakMeters += d * CELL_M;
  } else stamp(fi, fj);
  lastPt = [fi, fj];
}
sim.dom.addEventListener('pointerdown', (e) => {
  if (modeSeg.value !== 'break' || e.button !== 0) return;
  drawing = true; lastPt = null;
  drawAt(e);
});
sim.dom.addEventListener('pointermove', (e) => { if (drawing) drawAt(e); });
const endDraw = () => {
  if (drawing && breakMeters > 0) sim.toast(`🚧 Yangın şeridi: toplam ${fmt(breakMeters, 0)} m`, '');
  drawing = false; lastPt = null;
};
sim.dom.addEventListener('pointerup', endDraw);
sim.dom.addEventListener('pointerleave', endDraw);

function clearBreaks() {
  for (let k = 0; k < NN; k++) if (veg[k] === V_SERIT) { veg[k] = origVeg[k]; state[k] = VEG[veg[k]].burn ? 1 : 0; paint(k); }
  breakMeters = 0;
}
function randomIgnite() {
  for (let tries = 0; tries < 200; tries++) {
    const k = Math.floor(Math.random() * NN);
    if (state[k] === 1 && veg[k] !== V_EV) {
      ignite(k);
      const i = k % N, j = (k / N) | 0;
      sim.toast(`🔥 Yeni yangın: ${Math.round(i * CELL_M)} m doğu, ${Math.round(j * CELL_M)} m güney`, 'bad');
      return;
    }
  }
}
function autoDrop() {
  if (!burning.length) { sim.toast('Şu an yanan bir alan yok.', 'warn'); return; }
  // Rüzgâr yönünde en öndeki yanan hücre (alev cephesi)
  let best = burning[0], bs = -Infinity;
  for (const k of burning) {
    const s = (k % N) * wind.x + ((k / N) | 0) * wind.z + Math.random() * 0.5;
    if (s > bs) { bs = s; best = k; }
  }
  sendPlane(best % N, (best / N) | 0);
}

// --- Döngü ---
const STEP_REAL = 0.25; // 1× hızda 1 dakikalık adım = 0,25 s
sim.onUpdate((dt) => {
  stepAcc += dt / STEP_REAL;
  let n = 0;
  while (stepAcc >= 1 && n < 40) { step(); stepAcc -= 1; n++; }
  if (n >= 40) stepAcc = 0;
});

let uiTick = 0, tWall = 0;
const _sz = new THREE.Vector2();
sim.onRender((real) => {
  tWall += real;
  const dtp = sim.paused ? 0 : real * Math.min(sim.speed, 3);
  fireU.uFireT.value = tWall;
  sim.renderer.getDrawingBufferSize(_sz);
  PU.scale.value = _sz.y / (2 * Math.tan(THREE.MathUtils.degToRad(sim.camera.fov) / 2));
  if (cellDirty) { cellTex.needsUpdate = true; cellDirty = false; }
  outerVeg?.update(tWall, 0.4 + wind.V * 0.12);
  // Alevler ve duman (m)
  const nb = burning.length;
  if (dtp > 0 && nb) {
    const fl = Math.min(nb * 3, LOW ? 60 : 110), sm = Math.min(Math.ceil(nb / 2), LOW ? 10 : 18);
    const lean = 1.5 + wind.V * 0.6;
    for (let q = 0; q < fl; q++) {
      const k = burning[(Math.random() * nb) | 0];
      const x = cellX(k % N) + (Math.random() - 0.5) * CELL_M, z = cellZ((k / N) | 0) + (Math.random() - 0.5) * CELL_M;
      const tall = veg[k] === V_CAM ? 1.6 : veg[k] === V_MESE ? 1.3 : veg[k] === V_EV ? 1.4 : 0.7;
      const hot = 0.6 + Math.random() * 0.8;
      spawn(flames, x, hWorld(x, z) + 1 + Math.random() * 6 * tall, z, wind.x * lean, (6 + Math.random() * 8) * tall, wind.z * lean, 0.5 + Math.random() * 0.6, (7 + Math.random() * 7) * tall, 5 * hot, (1.5 + Math.random() * 1.2) * hot, 0.25 * hot);
    }
    for (let q = 0; q < sm; q++) {
      const k = burning[(Math.random() * nb) | 0];
      const x = cellX(k % N) + (Math.random() - 0.5) * CELL_M, z = cellZ((k / N) | 0) + (Math.random() - 0.5) * CELL_M;
      const g = 0.16 + Math.random() * 0.12;
      // Sütun: güçlü yukarı kaldırma + uzun ömür → dikey yangın kolonu, sonra rüzgârla yatay yayılır
      spawn(smoke, x, hWorld(x, z) + 10, z, wind.x * (1.5 + wind.V * 0.9), 26 + Math.random() * 16, wind.z * (1.5 + wind.V * 0.9), 34 + Math.random() * 20, 20 + Math.random() * 14, g * 1.05, g, g * 0.92);
    }
  }
  for (const ps of [flames, smoke, drops]) {
    let any = false;
    for (let n = 0; n < ps.max; n++) {
      if (ps.life[n] <= 0) { if (ps.A[n] !== 0) { ps.A[n] = 0; any = true; } continue; }
      any = true;
      ps.life[n] -= dtp;
      const f = Math.max(0, ps.life[n] / ps.maxLife[n]);
      ps.P[n * 3] += ps.vel[n * 3] * dtp; ps.P[n * 3 + 1] += ps.vel[n * 3 + 1] * dtp; ps.P[n * 3 + 2] += ps.vel[n * 3 + 2] * dtp;
      if (ps === smoke) {
        ps.A[n] = Math.min(1, (1 - f) * 5) * f * 0.62; ps.S[n] += dtp * 7;
        // Kaldırma kuvveti yükseklikle artar: sütun yukarı uzanır, üstte yatay dağılır
        ps.vel[n * 3 + 1] = ps.vel[n * 3 + 1] * (1 - dtp * 0.04) + dtp * 5.5;
        // yükseldikçe açılır (seyreltilmiş duman güneşte daha açık görünür)
        const lift = Math.min(1, dtp * 0.03); ps.C[n * 3] += (0.55 - ps.C[n * 3]) * lift; ps.C[n * 3 + 1] += (0.52 - ps.C[n * 3 + 1]) * lift; ps.C[n * 3 + 2] += (0.5 - ps.C[n * 3 + 2]) * lift;
      } else if (ps === flames) { ps.A[n] = Math.min(1, (1 - f) * 6) * f; ps.C[n * 3 + 1] *= 1 - dtp * 1.6; ps.C[n * 3 + 2] *= 1 - dtp * 2; ps.S[n] *= 1 - dtp * 0.5; }
      else { ps.A[n] = f * 0.85; ps.vel[n * 3 + 1] -= 12 * dtp; ps.S[n] += dtp * 6; }
    }
    if (any) { ps.geo.attributes.position.needsUpdate = true; ps.geo.attributes.alpha.needsUpdate = true; ps.geo.attributes.size.needsUpdate = true; ps.geo.attributes.color.needsUpdate = true; }
  }
  // Uçak (gerçek zamanlı animasyon; duraklatılınca bekler)
  props.forEach((p) => { p.rotation.x += real * 40; });
  if (flight.active && !sim.paused) {
    flight.t += real / FLIGHT_S;
    const t = Math.min(flight.t, 1);
    plane.position.lerpVectors(flight.from, flight.to, t);
    plane.position.y = flight.from.y - Math.sin(Math.PI * t) * 55;
    plane.rotation.z = -Math.cos(Math.PI * t) * 0.12;
    if (!flight.dropped && t >= 0.47) {
      flight.dropped = true;
      applyDrop(flight.target.i, flight.target.j);
    }
    if (flight.dropped && t < 0.6) {
      for (let q = 0; q < 26; q++) spawn(drops, plane.position.x + (Math.random() - 0.5) * 6, plane.position.y - 1.5, plane.position.z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6 - wind.x * 2, -8 - Math.random() * 6, (Math.random() - 0.5) * 6 - wind.z * 2, 1.6 + Math.random(), 4 + Math.random() * 4, 0.82, 0.88, 0.95);
    }
    if (flight.t >= 1) { flight.active = false; plane.visible = false; }
  }
  if (++uiTick % 10 === 0) updateStats();
});

sim.formatTime = () => `${Math.floor(minutes / 60)} sa ${String(minutes % 60).padStart(2, '0')} dk`;

// --- Kurulum / sıfırlama ---
function resetFire() {
  state.fill(0); burnT.fill(0); wet.fill(0);
  veg.set(origVeg);
  burning = [];
  fuel0 = 0;
  for (let k = 0; k < NN; k++) {
    state[k] = VEG[veg[k]].burn ? 1 : 0;
    const v = veg[k];
    if (v === V_CAM || v === V_MESE || v === V_CALI) fuel0++;
  }
  for (let k = 0; k < NN; k++) writeCell(k);
  buildTrees();
  village.houses.forEach((h) => { h.burned = false; });
  buildHouses();
  minutes = 0; stepAcc = 0; hist.length = 0; spotted = 0; breakMeters = 0; planeCooldown = 0;
  flight.active = false; plane.visible = false;
  for (const ps of [flames, smoke, drops]) ps.life.fill(0);
  chart.clear();
  extinguishedToast = true;
  // Başlangıç yangını: batıdaki bir ormanlık hücre (rüzgâr doğuya eserken köye doğru)
  let start = -1;
  for (let r = 0; r < 20 && start < 0; r++) for (let dj = -r; dj <= r && start < 0; dj++) for (let di = -r; di <= r; di++) {
    const i = 16 + di, j = 46 + dj;
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const k = idx(i, j);
    if (state[k] === 1 && (veg[k] === V_CAM || veg[k] === V_CALI || veg[k] === V_MESE)) { start = k; break; }
  }
  if (start >= 0) {
    const si = start % N, sj = (start / N) | 0;
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) if (si + di >= 0 && sj + dj >= 0 && si + di < N && sj + dj < N) ignite(idx(si + di, sj + dj));
  }
  // Açılış karesi için yangına biraz zaman ver (yanmış iz + duman sütunu)
  if (warmup) { for (let q = 0; q < 22; q++) step(); warmup = false; }
  updateStats();
}
let warmup = true;
function rebuild(newLand) {
  if (newLand || !terrain) { genTerrain(); buildLand(); buildOuterVeg(); }
  genVegetation(presetSel.value);
  buildRoad();
  resetFire();
}

sim.onReset(() => resetFire());
computeWind();
humidityTone();
rebuild(true);
sim.toast('🔥 Batıda bir yangın başladı. Rüzgâr doğudaki köye doğru esiyor!', 'warn');
