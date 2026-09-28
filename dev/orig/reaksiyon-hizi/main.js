// Reaksiyon Hızı — A + B → C çarpışma kuramı: Maxwell–Boltzmann hızları, etkinleşme enerjisi, yönelim ve katalizör.
import { createSim, THREE, fmt, clamp, rand, gauss, instanced, heatColor } from '@core';

const R = 0.008314;                  // kJ/(mol·K)
const MAXA = 150, MAXB = 150, N = MAXA + MAXB;
const RAD = 0.5, RADC = RAD * 1.26;  // C, A ile B'nin toplam hacmine sahip
const MASS = [0.5, 0.5, 1];
const RADS = [RAD, RAD, RADC];
const L0 = 12;                       // 1 L'lik kutunun kenarı (dünya birimi)
const CAT = 0.5;                     // katalizör Ea'yı yarıya indirir
const ORIENT_COS = 0.3;              // tepkime bölgesi karşı tarafa ~73° içinde bakmalı
const P_ORIENT = (1 - ORIENT_COS) / 2;
const H_MAX = 0.02;
const COL = ['#f87171', '#60a5fa', '#c084fc'];

const sim = createSim({
  background: 0x0a0f1c,
  camera: { position: [15, 11, 19], target: [0, -0.5, 0], fov: 48 },
  controls: { minDistance: 8, maxDistance: 60 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Kutuda kırmızı <b>A</b> ve mavi <b>B</b> parçacıkları rastgele hızlarla uçuşuyor (Maxwell–Boltzmann dağılımı).
    Bir A ile B çarpıştığında tepkime ancak iki şart birlikte sağlanırsa olur: çarpışma enerjisi <b>etkinleşme enerjisi
    Ea</b>'dan büyük olmalı ve A'nın sarı <b>tepkime bölgesi</b> B'ye dönük olmalı (doğru yönelim). O zaman mor <b>C</b>
    oluşur ve kısa bir parlama görürsün.</p>
    <p><b>Arrhenius denklemi:</b> k = A·e<sup>−Ea/RT</sup>. Burada A çarpışma sıklığı ile yönelim çarpanını, e<sup>−Ea/RT</sup>
    ise yeterince enerjili çarpışmaların kesrini anlatır. Sıcaklık artınca dağılımın kuyruğu Ea çizgisinin sağına kayar;
    katalizör ise enerji tepesini alçaltan başka bir yol açar.</p>
    <h3>Dene</h3>
    <ul>
      <li>Sıcaklığı 300 K'den 600 K'e çıkar: çarpışma sayısı yalnızca ~%40 artar ama başarılı çarpışma oranı katlanır.</li>
      <li>Katalizörü aç: histogramdaki Ea çizgisi sola kayar, hız sıcaklık değişmeden artar.</li>
      <li>Hacmi büyüt ya da derişimi azalt: çarpışmalar seyrekleşir, tepkime yavaşlar (hız = k·[A]·[B]).</li>
      <li>"Yönelim şartı"nı kapat: başarılı çarpışma oranı yaklaşık ${fmt(1 / P_ORIENT, 1)} katına çıkar.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Buzdolabı yiyeceklerin bozulma tepkimelerini yavaşlatır; arabalardaki katalitik konvertör zehirli CO ve NO'yu
    düşük sıcaklıkta dönüştürür; vücudumuzdaki enzimler tepkimeleri milyonlarca kat hızlandıran katalizörlerdir.</p>
    <p><small>Model basitleştirilmiştir: Ea değerleri gerçek tepkimelerden (50–150 kJ/mol) küçük seçildi, yoksa ekranda tek
    bir tepkime görmek saatler sürerdi. Sıcaklık bir termostatla sabit tutulur; hacim ve derişim ölçeklidir.</small></p>`,
});
sim.formatTime = (t) => `${fmt(t, 1)} s`;

const st = { T: 300, nA: 100, nB: 100, V: 1, Ea: 6, cat: false, orient: true, sites: true };
const EaEff = () => (st.cat ? st.Ea * CAT : st.Ea);
let L = L0;

// --- Sahne: kutu, ısıtıcı plaka ---
const box = new THREE.Group();
sim.scene.add(box);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
box.add(new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.07, side: THREE.BackSide, depthWrite: false })));
box.add(new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.55 })));
const plateMat = new THREE.MeshStandardMaterial({ color: 0x334155, emissive: 0x000000, roughness: 0.6, metalness: 0.3 });
const plate = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.05, 1.12), plateMat);
box.add(plate);
const catMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.25, emissive: 0x0d9488, emissiveIntensity: 0.6 });
const catMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.012, 0.6), catMat);
box.add(catMesh);
const plateLabel = sim.label('', { parent: sim.scene, position: [0, 0, 0], className: 'plain' });
const eqLabel = sim.label('A + B → C', { parent: sim.scene, position: [0, 0, 0], className: 'big' });

function layoutBox() {
  box.scale.setScalar(L);
  plate.position.y = -0.5 - 0.035;
  catMesh.position.y = -0.5 + 0.007;
  plateLabel.position.set(0, -L / 2 - 1.3, L / 2 + 0.4);
  eqLabel.position.set(0, L / 2 + 1.1, 0);
}

// --- Parçacıklar ---
const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), ori = new Float32Array(N * 3);
const type = new Int8Array(N);   // 0 = A, 1 = B, 2 = C, −1 = yok
const sphere = new THREE.SphereGeometry(1, 18, 12);
const meshes = [0xef4444, 0x3b82f6, 0xa855f7].map((c, k) => {
  const m = instanced(sphere, new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.1 }), k === 2 ? MAXA : k ? MAXB : MAXA);
  m.frustumCulled = false;
  sim.scene.add(m);
  return m;
});
const siteMesh = instanced(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xca8a04, emissiveIntensity: 0.8 }), MAXA);
siteMesh.frustumCulled = false;
sim.scene.add(siteMesh);

// Tepkime parlamaları
const FL = 24;
const flash = { p: new Float32Array(FL * 3), age: new Float32Array(FL).fill(9), next: 0 };
const flashMesh = instanced(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), FL);
flashMesh.frustumCulled = false;
sim.scene.add(flashMesh);

function sigma(k) { return Math.sqrt((R * st.T) / MASS[k]); }

function init() {
  type.fill(-1);
  const half = L / 2;
  const place = (i, k) => {
    type[i] = k;
    const r = RADS[k], lim = half - r;
    for (let tries = 0; tries < 30; tries++) {
      const x = rand(-lim, lim), y = rand(-lim, lim), z = rand(-lim, lim);
      let ok = true;
      for (let j = 0; j < i && ok; j++) {
        if (type[j] < 0) continue;
        const dx = pos[j * 3] - x, dy = pos[j * 3 + 1] - y, dz = pos[j * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz < 4 * r * r) ok = false;
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      if (ok) break;
    }
    const s = sigma(k);
    vel[i * 3] = gauss(0, s); vel[i * 3 + 1] = gauss(0, s); vel[i * 3 + 2] = gauss(0, s);
    let ox = gauss(), oy = gauss(), oz = gauss();
    const l = Math.hypot(ox, oy, oz) || 1;
    ori[i * 3] = ox / l; ori[i * 3 + 1] = oy / l; ori[i * 3 + 2] = oz / l;
  };
  for (let i = 0; i < st.nA; i++) place(i, 0);
  for (let i = 0; i < st.nB; i++) place(MAXA + i, 1);
  flash.age.fill(9);
  resetCounters();
}

// --- Sayaçlar (kayan pencere: 10 × 0,5 s) ---
const WIN = 10, BIN = 0.5;
const binColl = new Float32Array(WIN), binReact = new Float32Array(WIN);
let binT = 0, binI = 0, reactedTotal = 0, chartT = 0;
function resetCounters() {
  binColl.fill(0); binReact.fill(0); binT = 0; binI = 0; reactedTotal = 0; chartT = 0;
  concChart?.clear();
}

// --- Fizik ---
const NCMAX = 32;
const head = new Int32Array(NCMAX * NCMAX * NCMAX), nextI = new Int32Array(N), cellOf = new Int32Array(N);

function react(i, j) {
  const a = type[i] === 0 ? i : j, b = a === i ? j : i;
  const ma = MASS[0], mb = MASS[1], M = ma + mb;
  for (let c = 0; c < 3; c++) {
    pos[a * 3 + c] = (pos[a * 3 + c] + pos[b * 3 + c]) / 2;
    vel[a * 3 + c] = (ma * vel[a * 3 + c] + mb * vel[b * 3 + c]) / M; // momentum korunur
  }
  type[a] = 2; type[b] = -1;
  const f = flash.next; flash.next = (f + 1) % FL;
  flash.p[f * 3] = pos[a * 3]; flash.p[f * 3 + 1] = pos[a * 3 + 1]; flash.p[f * 3 + 2] = pos[a * 3 + 2];
  flash.age[f] = 0;
  binReact[binI]++; reactedTotal++;
}

function collide(i, j) {
  const ti = type[i], tj = type[j];
  const ri = RADS[ti], rj = RADS[tj], rr = ri + rj;
  const dx = pos[j * 3] - pos[i * 3], dy = pos[j * 3 + 1] - pos[i * 3 + 1], dz = pos[j * 3 + 2] - pos[i * 3 + 2];
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= rr * rr || d2 < 1e-9) return;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d;
  const vn = (vel[i * 3] - vel[j * 3]) * nx + (vel[i * 3 + 1] - vel[j * 3 + 1]) * ny + (vel[i * 3 + 2] - vel[j * 3 + 2]) * nz;
  const mi = MASS[ti], mj = MASS[tj];
  if (vn > 0) {
    if (ti + tj === 1) {
      binColl[binI]++;
      const mu = (mi * mj) / (mi + mj);
      const E = 0.5 * mu * vn * vn; // merkezler doğrultusundaki bağıl kinetik enerji (kJ/mol)
      let oriented = true;
      if (st.orient) {
        const a = ti === 0 ? i : j, s = a === i ? 1 : -1;
        oriented = (ori[a * 3] * nx + ori[a * 3 + 1] * ny + ori[a * 3 + 2] * nz) * s > ORIENT_COS;
      }
      if (E >= EaEff() && oriented) { react(i, j); return; }
    }
    const J = (2 * vn) / (1 / mi + 1 / mj);
    vel[i * 3] -= (J / mi) * nx; vel[i * 3 + 1] -= (J / mi) * ny; vel[i * 3 + 2] -= (J / mi) * nz;
    vel[j * 3] += (J / mj) * nx; vel[j * 3 + 1] += (J / mj) * ny; vel[j * 3 + 2] += (J / mj) * nz;
  }
  const push = (rr - d) / 2;
  pos[i * 3] -= nx * push; pos[i * 3 + 1] -= ny * push; pos[i * 3 + 2] -= nz * push;
  pos[j * 3] += nx * push; pos[j * 3 + 1] += ny * push; pos[j * 3 + 2] += nz * push;
}

function step(h) {
  const half = L / 2;
  let ke = 0, n = 0;
  for (let i = 0; i < N; i++) {
    const k = type[i];
    if (k < 0) continue;
    const r = RADS[k];
    for (let c = 0; c < 3; c++) {
      const q = i * 3 + c;
      pos[q] += vel[q] * h;
      if (pos[q] > half - r) { pos[q] = half - r; vel[q] = -Math.abs(vel[q]); }
      else if (pos[q] < -half + r) { pos[q] = -half + r; vel[q] = Math.abs(vel[q]); }
    }
    if (k === 0) { // tepkime bölgesi döner (dönme difüzyonu)
      const q = i * 3, w = 5 * Math.sqrt(h);
      const ox = ori[q] + (Math.random() - 0.5) * w, oy = ori[q + 1] + (Math.random() - 0.5) * w, oz = ori[q + 2] + (Math.random() - 0.5) * w;
      const l = Math.hypot(ox, oy, oz) || 1;
      ori[q] = ox / l; ori[q + 1] = oy / l; ori[q + 2] = oz / l;
    }
    ke += 0.5 * MASS[k] * (vel[i * 3] ** 2 + vel[i * 3 + 1] ** 2 + vel[i * 3 + 2] ** 2);
    n++;
  }
  // Berendsen termostatı: sıcaklığı hedefe doğru çeker
  if (n) {
    const Tcur = (2 / 3) * (ke / n) / R;
    if (Tcur > 1) {
      const lam = Math.sqrt(clamp(1 + (h / 0.6) * (st.T / Tcur - 1), 0.8, 1.25));
      for (let i = 0; i < N * 3; i++) vel[i] *= lam;
    }
  }
  // Hücre listesi ile çarpışmalar
  const nc = clamp(Math.floor(L / (2 * RADC)), 1, NCMAX);
  const ncl = nc * nc * nc;
  for (let c = 0; c < ncl; c++) head[c] = -1;
  const inv = nc / L;
  for (let i = 0; i < N; i++) {
    if (type[i] < 0) continue;
    const cx = clamp(Math.floor((pos[i * 3] + half) * inv), 0, nc - 1);
    const cy = clamp(Math.floor((pos[i * 3 + 1] + half) * inv), 0, nc - 1);
    const cz = clamp(Math.floor((pos[i * 3 + 2] + half) * inv), 0, nc - 1);
    const c = (cx * nc + cy) * nc + cz;
    cellOf[i] = c; nextI[i] = head[c]; head[c] = i;
  }
  for (let i = 0; i < N; i++) {
    if (type[i] < 0) continue;
    const c = cellOf[i];
    const cz = c % nc, cy = ((c - cz) / nc) % nc, cx = Math.floor(c / (nc * nc));
    outer: for (let ax = Math.max(0, cx - 1); ax <= Math.min(nc - 1, cx + 1); ax++) {
      for (let ay = Math.max(0, cy - 1); ay <= Math.min(nc - 1, cy + 1); ay++) {
        for (let az = Math.max(0, cz - 1); az <= Math.min(nc - 1, cz + 1); az++) {
          for (let j = head[(ax * nc + ay) * nc + az]; j >= 0; j = nextI[j]) {
            if (j <= i || type[j] < 0) continue;
            collide(i, j);
            if (type[i] < 0) break outer;
          }
        }
      }
    }
  }
}

function counts() {
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < N; i++) { const k = type[i]; if (k === 0) a++; else if (k === 1) b++; else if (k === 2) c++; }
  return [a, b, c];
}

sim.onUpdate((dt) => {
  const n = Math.ceil(dt / H_MAX), h = dt / n;
  for (let s = 0; s < n; s++) {
    step(h);
    binT += h;
    if (binT >= BIN) { binT -= BIN; binI = (binI + 1) % WIN; binColl[binI] = 0; binReact[binI] = 0; }
  }
  for (let f = 0; f < FL; f++) flash.age[f] += dt;
  chartT += dt;
  if (chartT >= 0.5) {
    chartT = 0;
    const [a, b, c] = counts();
    concChart.push([a / st.V, b / st.V, c / st.V]);
  }
});

// --- Çizim ---
const tmpCol = new THREE.Color();
sim.onRender((real) => {
  const cnt = [0, 0, 0];
  let sc = 0;
  for (let i = 0; i < N; i++) {
    const k = type[i];
    if (k < 0) continue;
    const arr = meshes[k].instanceMatrix.array, o = cnt[k]++ * 16, r = RADS[k];
    writeMatrix(arr, o, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], r);
    if (k === 0 && st.sites) {
      writeMatrix(siteMesh.instanceMatrix.array, sc++ * 16, pos[i * 3] + ori[i * 3] * r * 0.85,
        pos[i * 3 + 1] + ori[i * 3 + 1] * r * 0.85, pos[i * 3 + 2] + ori[i * 3 + 2] * r * 0.85, r * 0.34);
    }
  }
  meshes.forEach((m, k) => { m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; });
  siteMesh.count = sc; siteMesh.instanceMatrix.needsUpdate = true;
  let fc = 0;
  for (let f = 0; f < FL; f++) {
    const a = flash.age[f];
    if (a > 0.6) continue;
    writeMatrix(flashMesh.instanceMatrix.array, fc++ * 16, flash.p[f * 3], flash.p[f * 3 + 1], flash.p[f * 3 + 2], 0.4 + a * 2.6);
  }
  flashMesh.count = fc; flashMesh.instanceMatrix.needsUpdate = true;
  plateMat.emissive.copy(heatColor(clamp((st.T - 200) / 800, 0, 1), tmpCol)).multiplyScalar(0.3);
  catMesh.visible = st.cat;
  uiTimer += real;
  if (uiTimer > 0.3) { uiTimer = 0; updateStats(); drawHist(); }
});
let uiTimer = 0;

function writeMatrix(a, o, x, y, z, s) {
  a[o] = s; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = s; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}

// --- Panel ---
const ui = sim.ui;
ui.section('Hazır deneyler');
const PRESETS = {
  oda: { T: 300, nA: 100, nB: 100, V: 1, Ea: 6, cat: false },
  sicak: { T: 700, nA: 100, nB: 100, V: 1, Ea: 6, cat: false },
  katalizor: { T: 300, nA: 100, nB: 100, V: 1, Ea: 6, cat: true },
  seyreltik: { T: 300, nA: 40, nB: 40, V: 2, Ea: 6, cat: false },
  yuksekEa: { T: 300, nA: 120, nB: 120, V: 1, Ea: 14, cat: false },
};
const preset = ui.segmented({
  options: [
    { value: 'oda', label: 'Oda sıcaklığı' }, { value: 'sicak', label: 'Sıcak' }, { value: 'katalizor', label: 'Katalizör' },
    { value: 'seyreltik', label: 'Seyreltik' }, { value: 'yuksekEa', label: 'Yüksek Ea' },
  ],
  value: 'oda',
  onChange: (v) => applyPreset(v),
});

ui.section('Koşullar');
const sT = ui.slider({ label: 'Sıcaklık', min: 200, max: 1000, step: 10, value: st.T, unit: 'K',
  format: (v) => `${fmt(v)} K (${fmt(v - 273)} °C)`, onChange: (v) => { st.T = v; drawProfile(); } });
const sA = ui.slider({ label: 'A parçacığı sayısı', min: 10, max: MAXA, step: 5, value: st.nA, onChange: (v) => { st.nA = v; init(); } });
const sB = ui.slider({ label: 'B parçacığı sayısı', min: 10, max: MAXB, step: 5, value: st.nB, onChange: (v) => { st.nB = v; init(); } });
const sV = ui.slider({ label: 'Hacim', min: 0.5, max: 2, step: 0.1, value: st.V, unit: 'L', onChange: (v) => setVolume(v) });
const sEa = ui.slider({ label: 'Etkinleşme enerjisi Ea', min: 1, max: 20, step: 0.5, value: st.Ea, unit: 'kJ/mol',
  onChange: (v) => { st.Ea = v; drawProfile(); } });
const tCat = ui.toggle({ label: 'Katalizör (Ea yarıya iner)', value: st.cat, onChange: (v) => { st.cat = v; drawProfile(); } });
ui.toggle({ label: 'Yönelim şartı (tepkime bölgesi)', value: st.orient, onChange: (v) => { st.orient = v; } });
ui.toggle({ label: 'Tepkime bölgelerini göster', value: st.sites, onChange: (v) => { st.sites = v; } });
ui.button({ label: '🔄 Yeniden karıştır', variant: 'primary', onClick: () => init() });

ui.section('Ölçümler');
ui.text(`<span style="color:${COL[0]}">● A</span> &nbsp; <span style="color:${COL[1]}">● B</span> &nbsp;
  <span style="color:${COL[2]}">● C (ürün)</span> &nbsp; <span style="color:#fde047">● tepkime bölgesi</span>`);
const stRate = ui.stat({ label: 'Tepkime hızı', unit: 'C/(L·s)' });
const stSucc = ui.stat({ label: 'Başarılı çarpışma', unit: '%' });
const stTheo = ui.stat({ label: 'Kuramsal oran', unit: '%' });
const stColl = ui.stat({ label: 'A–B çarpışması', unit: '/s' });
const stTemp = ui.stat({ label: 'Ölçülen sıcaklık', unit: 'K' });
const stDone = ui.stat({ label: 'Tamamlanma', unit: '%' });
const concChart = ui.chart({
  title: 'Derişim – zaman (parçacık/L)',
  series: [{ name: '[A]', color: COL[0] }, { name: '[B]', color: COL[1] }, { name: '[C]', color: COL[2], fill: true }],
  maxPoints: 240, yMin: 0,
});

function makeCanvas(title, height) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  wrap.innerHTML = `<div class="chart-title">${title}</div>`;
  const cv = document.createElement('canvas');
  cv.style.width = '100%';
  cv.style.height = height + 'px';
  const legend = document.createElement('div');
  legend.className = 'legend';
  wrap.append(cv, legend);
  ui.append(wrap);
  return { cv, legend, height };
}
function prep(c) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = c.cv.clientWidth || 280, H = c.height;
  if (c.cv.width !== Math.round(W * dpr)) { c.cv.width = Math.round(W * dpr); c.cv.height = Math.round(H * dpr); }
  const g = c.cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.font = '10px system-ui';
  return { g, W, H };
}

const hist = makeCanvas('Parçacık enerji dağılımı (Maxwell–Boltzmann)', 150);
hist.legend.innerHTML = '<span><i style="background:#64748b"></i>Ea altı</span><span><i style="background:#f59e0b"></i>Ea üstü</span><span><i style="background:#e2e8f0"></i>Kuramsal eğri</span><span><i style="background:#ef4444"></i>Ea eşiği</span>';
const NB = 32;
const bins = new Float32Array(NB);
function drawHist() {
  const { g, W, H } = prep(hist);
  const pl = 8, pr = 8, pt = 16, pb = 18, iw = W - pl - pr, ih = H - pt - pb;
  const RT = R * st.T, Ea = EaEff();
  const Emax = Math.max(8 * RT, st.Ea * 1.3);
  bins.fill(0);
  let n = 0, above = 0;
  for (let i = 0; i < N; i++) {
    const k = type[i];
    if (k < 0) continue;
    const E = 0.5 * MASS[k] * (vel[i * 3] ** 2 + vel[i * 3 + 1] ** 2 + vel[i * 3 + 2] ** 2);
    bins[Math.min(NB - 1, Math.floor((E / Emax) * NB))]++;
    n++; if (E >= Ea) above++;
  }
  const bw = Emax / NB;
  // Kuramsal f(E) = 2·√(E/π)·(RT)^(−3/2)·e^(−E/RT)
  const pdf = (E) => 2 * Math.sqrt(E / Math.PI) * Math.pow(RT, -1.5) * Math.exp(-E / RT);
  let ymax = 1;
  for (let b = 0; b < NB; b++) ymax = Math.max(ymax, bins[b], n * bw * pdf((b + 0.5) * bw));
  ymax *= 1.1;
  const X = (E) => pl + (iw * E) / Emax, Y = (v) => pt + ih * (1 - v / ymax);
  for (let b = 0; b < NB; b++) {
    const e0 = b * bw;
    g.fillStyle = e0 + bw / 2 >= Ea ? '#f59e0b' : '#64748b';
    g.fillRect(X(e0) + 0.5, Y(bins[b]), iw / NB - 1, pt + ih - Y(bins[b]));
  }
  g.strokeStyle = '#e2e8f0'; g.lineWidth = 1.5; g.beginPath();
  for (let s = 0; s <= 100; s++) { const E = (Emax * s) / 100; const y = Y(n * bw * pdf(E)); s ? g.lineTo(X(E), y) : g.moveTo(X(E), y); }
  g.stroke();
  const drawLine = (E, col, dash, text) => {
    if (E > Emax) return;
    g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = 2;
    g.beginPath(); g.moveTo(X(E), pt - 4); g.lineTo(X(E), pt + ih); g.stroke(); g.setLineDash([]);
    g.fillStyle = col; g.textAlign = X(E) > W - 90 ? 'right' : 'left'; g.textBaseline = 'top';
    g.fillText(text, X(E) + (g.textAlign === 'right' ? -4 : 4), pt - 12);
  };
  if (st.cat) drawLine(st.Ea, 'rgba(239,68,68,.45)', [4, 3], '');
  drawLine(Ea, '#ef4444', [], `Ea = ${fmt(Ea, 1)} kJ/mol · %${fmt(n ? (100 * above) / n : 0, 1)} üstünde`);
  g.fillStyle = 'rgba(148,163,184,.85)'; g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillText('0', pl, H - pb + 4);
  g.textAlign = 'right'; g.fillText(`${fmt(Emax, 0)} kJ/mol →`, W - pr, H - pb + 4);
}

const prof = makeCanvas('Enerji profili (tepkime koordinatı)', 130);
function drawProfile() {
  const { g, W, H } = prep(prof);
  const pl = 26, pr = 8, pt = 14, pb = 16, iw = W - pl - pr, ih = H - pt - pb;
  const dH = -5, top = 22;
  const Y = (e) => pt + ih * (1 - (e - (dH - 2)) / (top - (dH - 2)));
  const X = (x) => pl + iw * x;
  const curve = (ea, col, dash) => {
    g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
    for (let s = 0; s <= 120; s++) {
      const x = s / 120, t = Math.exp(-(((x - 0.5) / 0.13) ** 2));
      const e = x < 0.5 ? ea * t : dH + (ea - dH) * t;
      s ? g.lineTo(X(x), Y(e)) : g.moveTo(X(x), Y(e));
    }
    g.stroke(); g.setLineDash([]);
  };
  g.strokeStyle = 'rgba(148,163,184,.25)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(0)); g.stroke();
  curve(Math.min(st.Ea, top), '#ef4444', []);
  if (st.cat) curve(Math.min(st.Ea * CAT, top), '#2dd4bf', [5, 3]);
  g.fillStyle = '#ef4444'; g.textAlign = 'left'; g.textBaseline = 'bottom';
  g.fillText(`Ea = ${fmt(st.Ea, 1)}`, X(0.53), Y(Math.min(st.Ea, top)) + 2);
  if (st.cat) { g.fillStyle = '#2dd4bf'; g.textBaseline = 'top'; g.fillText(`katalizörlü: ${fmt(st.Ea * CAT, 1)}`, X(0.56), Y(st.Ea * CAT) + 2); }
  g.fillStyle = 'rgba(203,213,225,.9)'; g.textBaseline = 'bottom';
  g.fillText('A + B', X(0.02), Y(0) - 2);
  g.textAlign = 'right'; g.fillText('C', X(0.98), Y(dH) - 2);
  g.textAlign = 'left'; g.fillStyle = 'rgba(148,163,184,.85)'; g.textBaseline = 'top';
  g.fillText(`RT = ${fmt(R * st.T, 2)} kJ/mol`, X(0.02), H - pb + 2);
  prof.legend.innerHTML = '<span><i style="background:#ef4444"></i>Katalizörsüz yol</span>' +
    (st.cat ? '<span><i style="background:#2dd4bf"></i>Katalizörlü yol</span>' : '');
}

const arrText = ui.text('', 'card');

function updateStats() {
  const coll = binColl.reduce((s, v) => s + v, 0), rx = binReact.reduce((s, v) => s + v, 0);
  const win = Math.max(BIN, Math.min(WIN * BIN, sim.time));
  const [a, b, c] = counts();
  stRate.set(fmt(rx / win / st.V, 2));
  stSucc.set(coll ? fmt((100 * rx) / coll, 2) : '—');
  const theo = (st.orient ? P_ORIENT : 1) * Math.exp(-EaEff() / (R * st.T));
  stTheo.set(fmt(theo * 100, 2));
  stColl.set(fmt(coll / win, 0));
  let ke = 0, n = 0;
  for (let i = 0; i < N; i++) { const k = type[i]; if (k < 0) continue; ke += 0.5 * MASS[k] * (vel[i * 3] ** 2 + vel[i * 3 + 1] ** 2 + vel[i * 3 + 2] ** 2); n++; }
  stTemp.set(n ? fmt(((2 / 3) * (ke / n)) / R, 0) : '—');
  const lim = Math.min(st.nA, st.nB);
  stDone.set(fmt(lim ? (100 * c) / lim : 0, 0), c >= lim ? 'good' : '');
  plateLabel.setText(`🔥 ${fmt(st.T)} K${st.cat ? ' · katalizör yüzeyi' : ''}`);
  arrText.set(`<div><b>Arrhenius:</b> e<sup>−Ea/RT</sup> = e<sup>−${fmt(EaEff(), 1)}/${fmt(R * st.T, 2)}</sup> = <b>${fmt(Math.exp(-EaEff() / (R * st.T)), 3)}</b><br>
    Hız = k·[A]·[B] → [A] = ${fmt(a / st.V, 0)}, [B] = ${fmt(b / st.V, 0)} parçacık/L</div>`);
}

function setVolume(v) {
  const Lnew = L0 * Math.cbrt(v), s = Lnew / L;
  for (let i = 0; i < N * 3; i++) pos[i] *= s;
  for (let f = 0; f < FL * 3; f++) flash.p[f] *= s;
  st.V = v; L = Lnew;
  layoutBox();
  sim.camera.position.multiplyScalar(s); // aynı açıdan, kutuyla orantılı uzaklık
}

function applyPreset(k) {
  const p = PRESETS[k];
  Object.assign(st, p);
  sT.set(p.T); sA.set(p.nA); sB.set(p.nB); sEa.set(p.Ea); tCat.set(p.cat); sV.set(p.V);
  setVolume(p.V);
  init();
  drawProfile();
}

sim.onReset(() => { init(); drawProfile(); });
layoutBox();
init();
drawProfile();
updateStats();
