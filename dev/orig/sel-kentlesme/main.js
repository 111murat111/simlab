// Sel ve Kentleşme — betonlaşma yüzey akışını artırır: SCS-CN + Nash hidrografı, Manning ile dere seviyesi ve taşkın.
import { createSim, THREE, ImprovedNoise, fmt, clamp, lerp, seeded, instanced } from '@core';
import { simulate, rational, stageOf, bankfullQ, CH, T_END, BANKFULL_D, AREA_KM2 } from './hydro.js';

const sim = createSim({
  background: 0x8fb3d9,
  camera: { position: [2, 17, 21], target: [0.5, 0, 0.5], fov: 44 },
  controls: { minDistance: 8, maxDistance: 60 },
  fog: [45, 110],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>4,8 × 3,6 km'lik (≈17 km²) küçük bir havza: tepelerden inen yağmur suyu, kasabanın içinden geçen dereye toplanır.
    <b>Kentleşme</b> arttıkça orman ve çayırlar çatı, yol ve otoparka dönüşür. Bu yüzeyler suyu emmez: yağmurun çok
    daha büyük kısmı <b>yüzey akışına</b> geçer ve oluk-boru-kanal sistemiyle dereye çok daha <b>hızlı</b> ulaşır.
    Sonuç: daha yüksek ve daha erken bir <b>pik debi</b>. Dere kıyı dolu seviyesini aşınca taşkın düzlüğündeki alçak
    evler su altında kalır.</p>
    <h3>Dene</h3>
    <ul>
      <li>"Sağanak" hazır ayarını kentleşme %5 ve %70 ile karşılaştır; grafikte pikin nasıl büyüyüp öne kaydığına bak.</li>
      <li>Kentleşme %60'ta önlemleri tek tek aç: yeşil çatı, geçirgen kaldırım, yağmur bahçesi, bekletme havuzu.</li>
      <li>"Dere yatağına yapılaşma"yı aç: aynı debi daralmış yatakta daha yüksek su seviyesi demektir.</li>
      <li>Toprak önceden ıslakken (art arda yağışlar) aynı yağmurun etkisini gör.</li>
    </ul>
    <h3>Model</h3>
    <p>Yağış fazlası <b>SCS eğri numarası (CN)</b> yöntemiyle hesaplanır: Q = (P − 0,2S)² / (P + 0,8S), S = 25400/CN − 254 (mm).
    CN değerleri TR-55 tablolarından (B grubu toprak): orman ≈ 60, çayır ≈ 69, geçirimsiz yüzey 98. Akış, gecikme süresi SCS
    formülüyle bulunan (kentleşmeyle kısalan) bir <b>Nash doğrusal hazne kaskadı</b> ile dereye ötelenir; su derinliği
    dikdörtgen kanal + taşkın düzlüğü için <b>Manning</b> denkleminden çözülür. Karşılaştırma için <b>rasyonel yöntem</b>
    (Q = C·i·A / 3,6) de gösterilir.</p>
    <h3>Gerçek hayatta</h3>
    <p>Türkiye'deki pek çok kentsel sel, dere yataklarının daraltılması, üstünün kapatılması ya da içine yapı yapılmasıyla
    ağırlaşmıştır. "Sünger kent" yaklaşımı (yeşil altyapı, geçirimli yüzey, bekletme alanları) yağmuru kaynağında tutmayı hedefler.</p>
    <p><small>Düşey ölçek abartılmıştır. Sayılar küçük bir örnek havza için gerçekçi mertebededir, belirli bir yeri temsil etmez.</small></p>`,
});
sim.formatTime = () => `${Math.floor(tMin / 60)} sa ${String(Math.floor(tMin % 60)).padStart(2, '0')} dk`;

// --- Arazi ---
const W = 24, D = 18;                       // dünya birimi (1 birim = 200 m)
const VE = 0.25;                            // düşey: 1 m = 0,25 birim (abartılı)
const noise = new ImprovedNoise();
const cz = (x) => 1.2 * Math.sin(x * 0.25 + 0.5);          // derenin menderes çizgisi
const bedY = (x) => 0.07 * (12 - x);                       // boyuna eğim (görsel)
let CW = 0.34;                                             // kanal yarı genişliği (görsel)
const FPW = 3.2, BANK = BANKFULL_D * VE, FP_S = 0.375;     // taşkın düzlüğü: 200 m'de 1,5 m yükselme
function prof(x, z) {
  const ad = Math.abs(z - cz(x));
  if (ad < CW) return 0;
  if (ad < CW + 0.15) return ((ad - CW) / 0.15) * BANK;
  if (ad < FPW) return BANK + (ad - CW - 0.15) * FP_S;
  const e = ad - FPW;
  return BANK + (FPW - CW - 0.15) * FP_S + Math.pow(e, 1.3) * 0.55 + (noise.noise(x * 0.18, z * 0.18, 1.7) * 0.5 + 0.5) * e * 0.35;
}
const H = (x, z) => bedY(x) + prof(x, z);

const SEG_X = 160, SEG_Z = 120;
const terrGeo = new THREE.PlaneGeometry(W, D, SEG_X, SEG_Z);
terrGeo.rotateX(-Math.PI / 2);
terrGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(terrGeo.attributes.position.count * 3), 3));
const terrain = new THREE.Mesh(terrGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false }));
sim.scene.add(terrain);
function shapeTerrain() {
  const p = terrGeo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i)));
  p.needsUpdate = true;
  terrGeo.computeVertexNormals();
}

// Kenar "etek"i: arazi bloğu görünümü
const skirt = new THREE.Mesh(new THREE.BoxGeometry(W, 1, D), new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }));
skirt.position.y = -0.52;
sim.scene.add(skirt);

// --- Hücreler (arazi kullanımı) ---
const CS = 0.5, NX = W / CS, NZ = D / CS;
const rnd = seeded(7);
const cells = [];
for (let j = 0; j < NZ; j++) {
  for (let i = 0; i < NX; i++) {
    const x = -W / 2 + (i + 0.5) * CS, z = -D / 2 + (j + 0.5) * CS;
    const ad = Math.abs(z - cz(x));
    const r = rnd();
    const sub = r < 0.35 ? 'roof' : r < 0.55 ? 'pave' : r < 0.75 ? 'road' : 'garden';
    // Kentleşme sırası: kasaba merkezine yakın, vadi tabanı önce
    const score = Math.hypot(x - 3.5, (z - cz(x)) * 1.3) + Math.max(0, ad - FPW) * 0.6 + rnd() * 1.6;
    cells.push({ i, j, x, z, ad, sub, score, forestKey: noise.noise(x * 0.3, z * 0.3, 5.1) + (ad > FPW ? 0.4 : -0.3) + rnd() * 0.3, h: 0.35 + rnd() * 0.5, state: 'meadow' });
  }
}
const cellAt = (x, z) => cells[clamp(Math.floor((z + D / 2) / CS), 0, NZ - 1) * NX + clamp(Math.floor((x + W / 2) / CS), 0, NX - 1)];
const landCells = () => cells.filter((c) => c.ad >= CW + 0.3);

// Binalar, ağaçlar, yağmur bahçeleri
const MAXB = cells.length;
const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const buildings = instanced(bGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAXB);
buildings.count = 0;
sim.scene.add(buildings);
const roofs = instanced(new THREE.BoxGeometry(1, 0.06, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), MAXB);
roofs.count = 0;
sim.scene.add(roofs);
const treeGeo = new THREE.ConeGeometry(0.16, 0.5, 6).translate(0, 0.3, 0);
const trees = instanced(treeGeo, new THREE.MeshStandardMaterial({ color: 0x1f5e33, roughness: 0.9, flatShading: true }), cells.length * 2);
trees.count = 0;
sim.scene.add(trees);
const gardenMesh = instanced(new THREE.CircleGeometry(0.17, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.6 }), cells.length);
gardenMesh.count = 0;
sim.scene.add(gardenMesh);

const COL = {
  forest: new THREE.Color(0x2f6b35), meadow: new THREE.Color(0x7fa34a), road: new THREE.Color(0x3a3f47), pave: new THREE.Color(0x9aa0a8),
  paveP: new THREE.Color(0xa08a6a), garden: new THREE.Color(0x5f9a45), roof: new THREE.Color(0x8b9098), bed: new THREE.Color(0x6b5a45),
  bank: new THREE.Color(0x8a7a5a), hill: new THREE.Color(0x6f8f45),
};
const roofCol = new THREE.Color(0xb45a3c), roofGreen = new THREE.Color(0x3f8f3a), wallCol = new THREE.Color(0xe7dcc8), floodCol = new THREE.Color(0x3b82f6);

const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
let houseList = [];   // taşkın düzlüğündeki binalar {idx, elev(m)}

function applyLandUse() {
  const land = landCells();
  land.forEach((c) => (c.state = 'meadow'));
  cells.forEach((c) => { if (c.ad < CW + 0.3) c.state = 'channel'; });
  const nUrban = Math.round(P.urban * land.length);
  const byScore = [...land].sort((a, b) => a.score - b.score);
  byScore.slice(0, nUrban).forEach((c) => (c.state = 'urban'));
  // Dere yatağına yapılaşma: kıyıdaki şerit binalarla dolar
  if (P.encroach) land.forEach((c) => { if (c.ad < CW + 0.8 && Math.abs(c.x - 3.5) < 7) { c.state = 'urban'; c.sub = c.sub === 'garden' ? 'roof' : c.sub; c.bank = true; } });
  const nat = land.filter((c) => c.state !== 'urban').sort((a, b) => b.forestKey - a.forestKey);
  nat.slice(0, Math.round(nat.length * 0.6)).forEach((c) => (c.state = 'forest'));

  // Köşe renkleri
  const pos = terrGeo.attributes.position, col = terrGeo.attributes.color;
  const tmp = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    const ad = Math.abs(z - cz(x));
    if (ad < CW + 0.15) tmp.copy(COL.bed);
    else if (ad < CW + 0.3) tmp.copy(COL.bank);
    else {
      const c = cellAt(x, z);
      if (c.state === 'forest') tmp.copy(COL.forest);
      else if (c.state === 'urban') tmp.copy(c.sub === 'road' ? COL.road : c.sub === 'pave' ? (P.permeable ? COL.paveP : COL.pave) : c.sub === 'garden' ? COL.garden : COL.pave);
      else tmp.copy(ad > FPW + 2 ? COL.hill : COL.meadow);
    }
    const n = noise.noise(x * 1.7, z * 1.7, 3) * 0.08;
    col.setXYZ(k, tmp.r * (1 + n), tmp.g * (1 + n), tmp.b * (1 + n));
  }
  col.needsUpdate = true;

  // Binalar
  let b = 0, t = 0, g = 0;
  houseList = [];
  for (const c of cells) {
    if (c.state === 'urban' && c.sub === 'roof') {
      const y = H(c.x, c.z);
      const tall = c.bank ? 0.35 : c.h * (1 + Math.max(0, 1.6 - Math.hypot(c.x - 3.5, c.z - cz(3.5)) / 3));
      m4.compose(v3.set(c.x, y - 0.05, c.z), q0, s3.set(0.36, tall, 0.36));
      buildings.setMatrixAt(b, m4);
      buildings.setColorAt(b, wallCol);
      m4.compose(v3.set(c.x, y - 0.05 + tall + 0.03, c.z), q0, s3.set(0.4, 1, 0.4));
      roofs.setMatrixAt(b, m4);
      roofs.setColorAt(b, P.greenRoof ? roofGreen : roofCol);
      if (c.ad < FPW + 0.2) houseList.push({ idx: b, elev: prof(c.x, c.z) / VE });
      b++;
    } else if (c.state === 'forest') {
      for (let k = 0; k < 2; k++) {
        const x = c.x + (k ? 0.12 : -0.1) + (c.forestKey * 7 % 0.1), z = c.z + (k ? -0.1 : 0.12);
        m4.compose(v3.set(x, H(x, z) - 0.02, z), q0, s3.setScalar(0.8 + ((c.h * 10 + k) % 0.5)));
        trees.setMatrixAt(t++, m4);
      }
    } else if (c.state === 'urban' && c.sub === 'garden' && P.rainGarden) {
      m4.compose(v3.set(c.x, H(c.x, c.z) + 0.03, c.z), q0, s3.setScalar(1));
      gardenMesh.setMatrixAt(g++, m4);
    }
  }
  buildings.count = roofs.count = b;
  trees.count = t;
  gardenMesh.count = g;
  for (const m of [buildings, roofs, trees, gardenMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  floodedPrev = -1;
}

// --- Su yüzeyi (dere + taşkın) ---
const waterGeo = new THREE.PlaneGeometry(W, 9.5, 160, 24);
{
  const p = waterGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), d = p.getY(i);
    p.setXYZ(i, x, bedY(x) + 0.015, cz(x) + d);
  }
  waterGeo.computeVertexNormals();
}
const waterMat = new THREE.MeshStandardMaterial({ color: 0x2f7fc0, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.88 });
const water = new THREE.Mesh(waterGeo, waterMat);
sim.scene.add(water);

// Bekletme havuzu
const pond = new THREE.Group();
{
  const px = -1.2, pz = cz(-1.2) + 2.1, y = H(px, pz);
  const rim = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9 });
  const add = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), rim); m.position.set(x, 0.1, z); pond.add(m); };
  add(2.2, 0.1, 0, -0.65); add(2.2, 0.1, 0, 0.65); add(0.1, 1.4, -1.1, 0); add(0.1, 1.4, 1.1, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6b8e4e }));
  floor.position.y = 0.02;
  const pw = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a86c8, transparent: true, opacity: 0.85 }));
  pond.add(floor, pw);
  pond.userData.water = pw;
  pond.position.set(px, y + 0.02, pz);
  pond.rotation.y = -0.1;
  sim.scene.add(pond);
  sim.label('Bekletme havuzu', { parent: pond, position: [0, 0.6, 0], className: 'plain' });
}

// Limnimetre (su seviyesi ölçer) — kasabada, kıyıda
const GX = 4.5, GZ = cz(4.5) - (CW + 0.2);
const gauge = new THREE.Group();
{
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
  post.position.y = 0.8;
  const bf = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.12), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  bf.position.y = BANK;
  gauge.add(post, bf);
  gauge.position.set(GX, bedY(GX), GZ);
  sim.scene.add(gauge);
}
const gaugeLbl = sim.label('', { parent: gauge, position: [0, 1.9, 0] });

sim.label('Kasaba', { position: [3.5, 3.2, cz(3.5) - 3.2], className: 'plain' });
sim.label('Dere →', { position: [-9, bedY(-9) + 0.9, cz(-9)], className: 'plain' });
sim.label('Yukarı havza (tepeler)', { position: [-8, 7.5, -7.5], className: 'plain' });

// --- Yağmur parçacıkları ---
const RN = 3000;
const rainPos = new Float32Array(RN * 3 * 2);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainSeed = seeded(3);
const drops = [];
for (let k = 0; k < RN; k++) drops.push({ x: (rainSeed() - 0.5) * W, z: (rainSeed() - 0.5) * D, y: rainSeed() * 14 });
const rainLines = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.55 }));
rainLines.frustumCulled = false;
sim.scene.add(rainLines);

// --- Parametreler ve hesap ---
const P = { urban: 0.1, greenRoof: false, permeable: false, rainGarden: false, pond: false, encroach: false, amc: 'normal', forestShare: 0.6 };
const R = { i: 60, dur: 1 };
let run, ref, tMin = 0, chartIdx = 0, floodedPrev = -1, ended = false;
const STEP = 3;   // grafik noktası / dk

const ch = () => (P.encroach ? CH.dar : CH.dogal);
function recompute(restart = false) {
  run = simulate(P, R.i, R.dur);
  ref = simulate({ ...P, urban: 0.05, greenRoof: false, permeable: false, rainGarden: false, pond: false, encroach: false }, R.i, R.dur);
  if (restart) { tMin = 0; ended = false; }
  chart.clear(); stageChart.clear();
  chartIdx = 0;
  pushCharts();
  updateStats();
}
function pushCharts() {
  const bq = bankfullQ(ch());
  while (chartIdx * STEP <= Math.min(tMin, T_END)) {
    const k = chartIdx * STEP;
    chart.push([ref.Q[k], run.Q[k], bq]);
    stageChart.push([stageOf(run.Q[k], ch()), BANKFULL_D]);
    chartIdx++;
  }
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('🏙️ Havza');
const urbanS = ui.slider({ label: 'Kentleşme', min: 0, max: 90, step: 1, value: P.urban * 100, unit: '%',
  onInput: (v) => { P.urban = v / 100; applyLandUse(); recompute(); } });
ui.select({ label: 'Toprak nemi (önceki günler)', value: 'normal', options: [{ value: 'kuru', label: 'Kuru (uzun süre yağışsız)' }, { value: 'normal', label: 'Normal' }, { value: 'islak', label: 'Islak (art arda yağış)' }],
  onChange: (v) => { P.amc = v; recompute(); } });

ui.section('🌧️ Yağış');
const iS = ui.slider({ label: 'Yağış şiddeti', min: 5, max: 100, step: 1, value: R.i, unit: 'mm/sa', onChange: (v) => { R.i = v; recompute(true); } });
const dS = ui.slider({ label: 'Süre', min: 0.5, max: 6, step: 0.5, value: R.dur, unit: 'sa', onChange: (v) => { R.dur = v; recompute(true); } });
const preset = (i, d) => { R.i = i; R.dur = d; iS.set(i); dS.set(d); recompute(true); };
ui.buttons([
  { label: '🌦 Hafif', onClick: () => preset(8, 3) },
  { label: '⛈ Sağanak', variant: 'primary', onClick: () => preset(60, 1) },
  { label: '🌧 Uzun', onClick: () => preset(15, 6) },
]);
ui.button({ label: '▶ Olayı baştan oynat', onClick: () => { recompute(true); sim.play(); } });

ui.section('🌱 Önlemler (ve bir hata)');
const tog = (label, key, relayout = true) => ui.toggle({ label, value: P[key], onChange: (v) => { P[key] = v; if (relayout) applyLandUse(); recompute(); } });
tog('Yeşil çatılar', 'greenRoof');
tog('Geçirgen kaldırım / otopark', 'permeable');
tog('Yağmur bahçeleri', 'rainGarden');
ui.toggle({ label: 'Bekletme havuzu (150.000 m³)', value: false, onChange: (v) => { P.pond = v; pond.visible = v; recompute(); } });
ui.toggle({ label: '⚠️ Dere yatağına yapılaşma', value: false, onChange: (v) => { P.encroach = v; CW = v ? 0.2 : 0.34; shapeTerrain(); applyLandUse(); placeGauge(); recompute(); } });

ui.section('📊 Sonuçlar');
const stPeak = ui.stat({ label: 'Pik debi', unit: 'm³/s' });
const stRef = ui.stat({ label: 'Doğal durumda pik', unit: 'm³/s' });
const stTp = ui.stat({ label: 'Pike varış (yağış başından)', unit: 'dk' });
const stC = ui.stat({ label: 'Akış katsayısı (hacim)' });
const stNow = ui.stat({ label: 'Şu anki debi', unit: 'm³/s' });
const stStage = ui.stat({ label: 'Su seviyesi', unit: 'm' });
const stFlood = ui.stat({ label: 'Su basan bina' });
const stCN = ui.stat({ label: 'Havza CN' });
const chart = ui.chart({ title: 'Hidrograf: debi (m³/s) — zaman', series: [{ name: 'Doğal (%5 kent)', color: '#22c55e' }, { name: 'Senaryo', color: '#38bdf8', fill: true }, { name: 'Kıyı dolu debi', color: '#ef4444' }], maxPoints: Math.floor(T_END / STEP) + 1, yMin: 0 });
const stageChart = ui.chart({ title: 'Dere su seviyesi (m)', series: [{ name: 'Seviye', color: '#60a5fa', fill: true }, { name: 'Kıyı (taşma sınırı)', color: '#ef4444' }], maxPoints: Math.floor(T_END / STEP) + 1, yMin: 0, height: 80 });
const ratCard = ui.text('', 'card');

function updateStats() {
  stPeak.set(run.peak, run.peak > bankfullQ(ch()) ? 'bad' : run.peak > 0.7 * bankfullQ(ch()) ? 'warn' : 'good');
  stRef.set(ref.peak);
  stTp.set(run.tPeak);
  stC.set(fmt(run.C, 2), run.C > 0.4 ? 'bad' : run.C > 0.25 ? 'warn' : 'good');
  stCN.set(fmt(run.cn, 0));
  const rat = rational(P, R.i, R.dur);
  ratCard.set(`Toplam yağış <b>${fmt(R.i * R.dur, 0)} mm</b> → yüzey akışı <b>${fmt(run.runVol / 1e3, 0)} bin m³</b>` +
    ` (doğal durumda ${fmt(ref.runVol / 1e3, 0)} bin m³).<br>Gecikme süresi <b>${fmt(run.lag * 60, 0)} dk</b> (doğal: ${fmt(ref.lag * 60, 0)} dk).` +
    `<br>Rasyonel yöntem: Q = C·i·A/3,6 = ${fmt(rat.C, 2)} × ${fmt(R.i, 0)} × ${fmt(AREA_KM2, 1)} / 3,6 ≈ <b>${fmt(rat.Q, 0)} m³/s</b>` +
    ` <small>(tepe değer için üst sınır; havza tutmasını ve ötelemeyi yok sayar)</small>` +
    `<br>Kıyı dolu kapasite: <b>${fmt(bankfullQ(ch()), 0)} m³/s</b>${P.encroach ? ' <span style="color:var(--bad)">(daralmış yatak)</span>' : ''}.`);
}

function placeGauge() {
  gauge.position.z = cz(GX) - (CW + 0.2);
}

// --- Zaman döngüsü ---
const MIN_PER_SEC = 8;
const sky = new THREE.Color(), skyClear = new THREE.Color(0x8fb3d9), skyStorm = new THREE.Color(0x4a5566);
const cleanW = new THREE.Color(0x2f7fc0), muddyW = new THREE.Color(0x8a6a44);
let stageNow = 0, rainNow = 0;
sim.onUpdate((dt) => {
  if (ended) return;
  tMin = Math.min(T_END, tMin + dt * MIN_PER_SEC);
  pushCharts();
  if (tMin >= T_END) { ended = true; sim.toast('Olay bitti. Ayarları değiştir ya da "Olayı baştan oynat".'); }
});

let statTick = 0;
sim.onRender((dt) => {
  const k = Math.min(T_END, Math.floor(tMin));
  const Q = run.Q[k];
  const target = stageOf(Q, ch());
  stageNow += (target - stageNow) * Math.min(1, dt * 4);
  water.position.y = stageNow * VE;
  const bq = bankfullQ(ch());
  waterMat.color.copy(cleanW).lerp(muddyW, clamp(Q / bq - 0.3, 0, 1) * 0.8);
  rainNow = run.rain[k];
  sky.copy(skyClear).lerp(skyStorm, clamp(rainNow / 40, 0, 1));
  sim.scene.background.copy(sky);
  sim.scene.fog.color.copy(sky);
  const sun = sim.scene.userData.sun;
  if (sun) sun.intensity = lerp(2.2, 0.9, clamp(rainNow / 40, 0, 1));
  if (pond.visible) pond.userData.water.position.y = 0.03 + run.pond[k] * 0.2;

  // Yağmur
  const n = rainOn.value ? Math.round(clamp(rainNow / 80, 0, 1) * RN) : 0;
  rainGeo.setDrawRange(0, n * 2);
  if (n) {
    const fall = dt * 16, len = 0.35;
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      d.y -= fall;
      if (d.y < H(d.x, d.z)) d.y += 14;
      rainPos[i * 6] = d.x; rainPos[i * 6 + 1] = d.y; rainPos[i * 6 + 2] = d.z;
      rainPos[i * 6 + 3] = d.x - 0.04; rainPos[i * 6 + 4] = d.y + len; rainPos[i * 6 + 5] = d.z;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // Taşkın: alçak binalar
  let flooded = 0;
  for (const h of houseList) if (stageNow > h.elev + 0.05) flooded++;
  if (flooded !== floodedPrev) {
    for (const h of houseList) roofs.setColorAt(h.idx, stageNow > h.elev + 0.05 ? floodCol : P.greenRoof ? roofGreen : roofCol);
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    if (flooded > floodedPrev && floodedPrev >= 0 && flooded > 0) sim.toast(`🌊 ${flooded} bina sular altında!`, 'bad');
    floodedPrev = flooded;
  }
  if (++statTick % 8 === 0) {
    stNow.set(Q);
    stStage.set(fmt(stageNow, 2), stageNow > BANKFULL_D ? 'bad' : stageNow > 0.75 * BANKFULL_D ? 'warn' : 'good');
    stFlood.set(flooded, flooded ? 'bad' : 'good');
    gaugeLbl.setText(`Su: ${fmt(stageNow, 2)} m ${stageNow > BANKFULL_D ? '⚠️ TAŞTI' : ''}`);
    gaugeLbl.el.style.color = stageNow > BANKFULL_D ? '#fca5a5' : '#e5ecf6';
  }
});

ui.section('👁️ Görünüm', { open: false });
const rainOn = ui.toggle({ label: 'Yağmur damlaları', value: true });
ui.toggle({ label: 'Ağaçlar', value: true, onChange: (v) => (trees.visible = v) });

sim.onReset(() => { recompute(true); stageNow = 0; });

pond.visible = false;
shapeTerrain();
applyLandUse();
recompute(true);
