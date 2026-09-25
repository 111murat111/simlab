// Uzay Çöpü ve Kessler Sendromu — alçak yörüngede irtifa bantlarına göre nesne nüfusu, çarpışma zinciri ve önlemler.
import { createSim, THREE, fmt, clamp, rand, pick, heatColor, ImprovedNoise, instanced, TAU } from '@core';
import * as M from './model.js';

const R_VIS = 6.371;       // Dünya yarıçapı (1 birim = 1000 km)
const ALT_X = 3;           // irtifa görsel olarak 3× abartılı
const rOf = (h) => R_VIS + (h / 1000) * ALT_X;
const YEAR_SEC = 1.5;      // 1× hızda bir yıl kaç saniye
const MAXI = 9000;         // en çok nokta
const TIERS = [4, 10, 25, 100, 250, 1000, 2500, 10000];
const CATS = [
  { key: 'S', name: 'Aktif uydu', color: 0x4ade80 },
  { key: 'D', name: 'Ölü uydu / roket gövdesi', color: 0xfbbf24 },
  { key: 'Z', name: 'Görev sonu inişte', color: 0x93c5fd },
  { key: 'F', name: 'Parça', color: 0xf87171 },
];

const sim = createSim({
  background: 0x02040b,
  camera: { position: [0, 13, 30], target: [0, 0, 0], fov: 50, far: 3000 },
  controls: { maxDistance: 120, minDistance: 9, maxPolarAngle: Math.PI, enablePan: false },
  lights: false,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Dünya ve alçak yörüngedeki (LEO, 200–2.000 km) ≥ 10 cm nesneler: <b style="color:#4ade80">aktif uydular</b>,
    <b style="color:#fbbf24">ölü uydular ve roket gövdeleri</b>, görev sonu kuralına uyup <b style="color:#93c5fd">alçalmakta olan uydular</b>, <b style="color:#f87171">çarpışma ve patlama parçaları</b>.
    Her nokta birkaç nesneyi temsil eder; irtifa görünürlük için 3 kat abartılmıştır. Ekvator düzlemindeki halkalar
    irtifa bantlarıdır: renkleri o banttaki parça nüfusunun <b>çarpışma üretimi − atmosfer temizliği</b> ile net büyüme hızını gösterir
    (mavi: atmosfer temizliyor, sarı: denge, kırmızı: çarpışmalarla kendi kendini besliyor).</p>
    <h3>Model</h3>
    <ul>
      <li><b>Çarpışma hızı ∝ yoğunluk²:</b> Bir banttaki çarpışma sayısı nesne sayısının karesiyle artar, bant hacmine bölünür.
      Aktif uydular manevrayla kaçınabilir ("kaçınma başarısı").</li>
      <li><b>Parçalanma:</b> İki bütün nesne çarpışırsa NASA Standart Parçalanma Modeline göre
      N(≥L<sub>c</sub>) = 0,1·M<sup>0,75</sup>·L<sub>c</sub><sup>−1,71</sup> → M ≈ 1.000 kg için ≈ 900 adet ≥ 10 cm parça.
      Parçanın uyduya çarpması daha az parça üretir (temsili 50).</li>
      <li><b>Atmosfer sürüklemesi:</b> Nesneler yavaşça alçalır ve yanar. Ömür irtifayla üstel artar: ≈ 400 km'de 1–2 yıl,
      600 km'de onlarca yıl, 800 km'de yüzyıllar, 1.000 km üstünde binlerce yıl (temsili; Güneş etkinliğine bağlı).</li>
      <li><b>Görev sonu kuralı:</b> Uyumlu uydular görev bitince 25 yıl (IADC yönergesi) ya da 5 yıl (ABD FCC, 2022) içinde yörüngeden çıkar;
      uymayanlar ölü nesne olarak kalır. <b>Aktif enkaz kaldırma</b> en riskli bantlardan büyük ölü nesneleri toplar.</li>
      <li><b>Kessler sendromu:</b> Bir bantta çarpışmaların ürettiği parça, sürüklemenin temizlediğinden fazlaysa nüfus fırlatma olmadan da büyür
      (Kessler & Cour-Palais, 1978).</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li><b>Fırlatma durursa</b>: 400 km altı birkaç yılda temizlenir ama 800–1.000 km'deki parçalar yüzyıllarca kalır ve çarpışmalar
      parça sayısını yavaşça artırır. NASA'nın LEGEND simülasyonları da benzer sonuç verir (Liou & Johnson, 2006).</li>
      <li><b>Kontrolsüz büyüme</b>: çarpışmalar zincirleme artar, grafik üstel koşar.</li>
      <li><b>ASAT testi</b> düğmesine bas: 865 km'ye binlerce parça eklenir; o bandın halkası kırmızıya döner ve uzun süre öyle kalır.</li>
      <li>"Bugünkü eğilim"de 5 yıl kuralını ve yılda 20 nesne kaldırmayı aç: büyüme ne kadar yavaşlıyor?</li>
    </ul>
    <h3>Gerçek veriler</h3>
    <ul>
      <li>ESA Uzay Çevresi Raporu 2025: ≈ 40.000 nesne izleniyor, bunların ≈ 11.000'i aktif uydu; tahminen 10 cm'den büyük
      50.000'den fazla, 1 cm'den büyük 1,2 milyondan fazla enkaz var.</li>
      <li>10 Şubat 2009: aktif Iridium 33 ile kullanılmayan Kosmos 2251, 789 km'de ≈ 11,7 km/s hızla çarpıştı; 2.000'den fazla parça kataloglandı.</li>
      <li>Ocak 2007: Çin, ≈ 865 km'deki Fengyun-1C uydusunu füzeyle vurdu (ASAT testi); 3.000'den fazla izlenebilir parça oluştu.</li>
    </ul>
    <p><small>Başlangıçtaki bant dağılımı, fırlatma dağılımı, sürükleme ömürleri ve çarpışma katsayısı temsilidir (başlangıçta yılda ≈ 0,1
    büyük çarpışma). Model istatistikseldir: tek tek yörüngeler hesaplanmaz, eğim ve yörünge düzlemleri gösterim içindir.
    Kaynaklar: ESA Space Environment Report 2025; NASA Orbital Debris Program Office (SBM; ODQN); Kessler & Cour-Palais (1978).</small></p>`,
});

// --- Yıldızlar, Dünya ---
{
  const n = 2500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set(new THREE.Vector3().randomDirection().multiplyScalar(rand(700, 1200)).toArray(), i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sim.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd4ff, size: 1.3, sizeAttenuation: false })));
}
sim.scene.add(new THREE.AmbientLight(0x6b7fa8, 1.1));
const sunL = new THREE.DirectionalLight(0xffffff, 2.6);
sunL.position.set(30, 12, 18);
sim.scene.add(sunL);

function earthTexture() {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const nz = new ImprovedNoise();
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - y / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * TAU;
      const px = Math.cos(lat) * Math.cos(lon), py = Math.sin(lat), pz = Math.cos(lat) * Math.sin(lon);
      const n = nz.noise(px * 1.6, py * 1.6, pz * 1.6) + 0.5 * nz.noise(px * 4, py * 4, pz * 4) + 0.2 * nz.noise(px * 9, py * 9, pz * 9);
      const ice = Math.abs(lat) > 1.25;
      let r, gg, b;
      if (ice) { r = 235; gg = 240; b = 248; }
      else if (n > 0.12) { const t = clamp((n - 0.12) * 2, 0, 1); r = 60 + t * 90; gg = 120 - t * 20 + (Math.abs(lat) < 0.4 ? 20 : 0); b = 50 + t * 30; }
      else { const t = clamp(-n, 0, 0.6); r = 18; gg = 70 - t * 50; b = 150 - t * 60; }
      const k = (y * W + x) * 4;
      img.data.set([r, gg, b, 255], k);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const earth = new THREE.Mesh(new THREE.SphereGeometry(R_VIS, 64, 40), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.85 }));
earth.rotation.z = 0.41;
sim.scene.add(earth);
const atmo = new THREE.Mesh(new THREE.SphereGeometry(R_VIS * 1.025, 48, 32), new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false }));
sim.scene.add(atmo);

// --- İrtifa bantları (ekvator halkaları) ---
const rings = [];
const ringGroup = new THREE.Group();
sim.scene.add(ringGroup);
for (let i = 0; i < M.NB; i++) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(rOf(M.EDGES[i]) + 0.02, rOf(M.EDGES[i + 1]) - 0.02, 128, 1),
    new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.userData.band = i;
  ringGroup.add(m);
  rings.push(m);
}
for (const [h, a] of [[400, 0.6], [1000, Math.PI - 0.6], [2000, 0.6]]) {
  const r = rOf(h) + 0.15;
  sim.label(`${fmt(h, 0)} km`, { parent: ringGroup, position: [r * Math.cos(a), 0.3, r * Math.sin(a)], className: 'plain' });
}

// --- Nesne noktaları (InstancedMesh) ---
const dots = instanced(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXI);
dots.frustumCulled = false;
{
  const m = new THREE.Matrix4(), c = new THREE.Color(0xffffff);
  for (let i = 0; i < MAXI; i++) { dots.setMatrixAt(i, m); dots.setColorAt(i, c); }
}
sim.scene.add(dots);

// Her (bant, tür) için sabit yörünge parametreleri: e1(3), e2(3), r, θ0, ω
const INCL = { S: [53, 53, 97.6, 70, 43, 87.9], Z: [53, 53, 97.6, 70, 87.9], D: [97.6, 82, 74, 71, 65, 99], F: [98.6, 86.4, 74, 82, 65, 97] };
const params = [];
for (let b = 0; b < M.NB; b++) params.push(CATS.map(() => ({ n: 0, a: new Float32Array(0) })));
function ensure(b, ci, n) {
  const P = params[b][ci];
  if (P.n >= n) return P.a;
  const a = new Float32Array(Math.max(n, P.n * 2, 64) * 9);
  a.set(P.a);
  const key = CATS[ci].key;
  for (let k = P.n; k < a.length / 9; k++) {
    const h = rand(M.EDGES[b], M.EDGES[b + 1]);
    const r = rOf(h);
    const inc = ((pick(INCL[key]) + rand(-3, 3)) * Math.PI) / 180;
    const O = rand(0, TAU);
    const o = k * 9;
    a[o] = Math.cos(O); a[o + 1] = 0; a[o + 2] = Math.sin(O);
    a[o + 3] = -Math.sin(O) * Math.cos(inc); a[o + 4] = Math.sin(inc); a[o + 5] = Math.cos(O) * Math.cos(inc);
    a[o + 6] = r; a[o + 7] = rand(0, TAU); a[o + 8] = 0.35 * (R_VIS / r) ** 1.5 * (rand() < 0.5 ? 1 : 0.97);
  }
  P.a = a;
  P.n = a.length / 9;
  return a;
}

let tier = 4;
const counts = [];   // [bant][tür] → nokta sayısı
function layout() {
  const tot = totalObjects();
  tier = TIERS.find((t) => tot / t <= MAXI) || TIERS.at(-1);
  let idx = 0;
  const col = new THREE.Color();
  for (let b = 0; b < M.NB; b++) {
    counts[b] = [];
    for (let ci = 0; ci < CATS.length; ci++) {
      const k = CATS[ci].key;
      const v = S[k][b];
      let n = Math.round(v / tier);
      n = Math.min(n, MAXI - idx);
      counts[b][ci] = n;
      ensure(b, ci, n);
      col.setHex(CATS[ci].color);
      for (let j = 0; j < n; j++) dots.setColorAt(idx + j, col);
      idx += n;
    }
  }
  dots.count = idx;
  if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
}

let visT = 0;
function moveDots(dt) {
  visT += dt;
  const arr = dots.instanceMatrix.array;
  let idx = 0;
  for (let b = 0; b < M.NB; b++) {
    for (let ci = 0; ci < CATS.length; ci++) {
      const n = counts[b]?.[ci] || 0;
      const a = params[b][ci].a;
      for (let j = 0; j < n; j++) {
        const o = j * 9, th = a[o + 7] + a[o + 8] * visT, c = Math.cos(th) * a[o + 6], s = Math.sin(th) * a[o + 6];
        const m = (idx + j) * 16;
        arr[m + 12] = c * a[o] + s * a[o + 3];
        arr[m + 13] = c * a[o + 1] + s * a[o + 4];
        arr[m + 14] = c * a[o + 2] + s * a[o + 5];
      }
      idx += n;
    }
  }
  dots.instanceMatrix.needsUpdate = true;
}

// --- Çarpışma parlamaları ---
const flashTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,190,90,.8)');
  gr.addColorStop(1, 'rgba(255,80,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const flashes = Array.from({ length: 10 }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.visible = false;
  s.userData.life = 0;
  sim.scene.add(s);
  return s;
});
function flashAt(band, big) {
  const f = flashes.find((x) => !x.visible) || flashes[0];
  const r = rOf(rand(M.EDGES[band], M.EDGES[band + 1]));
  f.position.copy(new THREE.Vector3().randomDirection().multiplyScalar(r));
  f.userData = { life: 1, big };
  f.visible = true;
}

// --- Durum ve parametreler ---
let S = M.initState();
const P = { launch: 2500, pmd: 0.9, rule: 25, adr: 0, avoid: 0.9, sun: 1 };
let rng = Math.random;
let lastToast = 0;

function totalObjects() { let t = 0; for (let i = 0; i < M.NB; i++) t += M.total(S, i); return t; }

function event(kind) {
  if (kind === 'asat') {
    M.addFragments(S, 5, 3000);
    flashAt(5, true); flashAt(5, true);
    sim.toast(`💥 ${Math.floor(S.year)}: ASAT testi 865 km'de — 3.000 izlenebilir parça (Fengyun-1C, 2007 benzeri)`, 'bad');
  } else if (kind === 'iridium') {
    S.S[4] = Math.max(0, S.S[4] - 1); S.D[4] = Math.max(0, S.D[4] - 1);
    M.addFragments(S, 4, 2000);
    flashAt(4, true);
    sim.toast(`💥 ${Math.floor(S.year)}: 789 km'de uydu–uydu çarpışması — 2.000 parça (Iridium 33 – Kosmos 2251, 2009 benzeri)`, 'bad');
  } else if (kind === 'mega') {
    S.S[2] += 5000;
    sim.toast('🚀 550 km bandına 5.000 uydu eklendi', 'warn');
  }
  layout();
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır senaryolar');
const PRESETS = {
  bugun: { launch: 2500, pmd: 0.9, rule: 25, adr: 0, avoid: 0.9, sun: 1 },
  sorumlu: { launch: 2500, pmd: 0.95, rule: 5, adr: 20, avoid: 0.95, sun: 1 },
  kontrolsuz: { launch: 5000, pmd: 0.5, rule: 0, adr: 0, avoid: 0.7, sun: 1 },
  durur: { launch: 0, pmd: 0.9, rule: 25, adr: 0, avoid: 0.9, sun: 1 },
};
ui.buttons([
  { label: '📈 Bugünkü eğilim', variant: 'primary', onClick: () => applyPreset('bugun') },
  { label: '🌱 Sorumlu kullanım', onClick: () => applyPreset('sorumlu') },
]);
ui.buttons([
  { label: '🔥 Kontrolsüz büyüme', onClick: () => applyPreset('kontrolsuz') },
  { label: '⛔ Fırlatma durursa', onClick: () => applyPreset('durur') },
]);

ui.section('Politika ve koşullar');
const ctl = {};
ctl.launch = ui.slider({ label: 'Yılda fırlatılan uydu', min: 0, max: 8000, step: 100, value: P.launch, format: (v) => `${fmt(v, 0)} / yıl`, onInput: (v) => (P.launch = v) });
ctl.rule = ui.segmented({ label: 'Görev sonu yörüngeden çıkma kuralı', options: [{ value: 0, label: 'Kural yok' }, { value: 25, label: '25 yıl' }, { value: 5, label: '5 yıl' }], value: P.rule, onChange: (v) => (P.rule = v) });
ctl.pmd = ui.slider({ label: 'Kurala uyum oranı', min: 0, max: 1, step: 0.01, value: P.pmd, format: (v) => `%${fmt(v * 100, 0)}`, onInput: (v) => (P.pmd = v) });
ctl.adr = ui.slider({ label: 'Aktif enkaz kaldırma', min: 0, max: 200, step: 1, value: P.adr, format: (v) => `${fmt(v, 0)} nesne / yıl`, onInput: (v) => (P.adr = v) });
ctl.avoid = ui.slider({ label: 'Aktif uyduların çarpışmadan kaçınma başarısı', min: 0, max: 0.99, step: 0.01, value: P.avoid, format: (v) => `%${fmt(v * 100, 0)}`, onInput: (v) => (P.avoid = v) });
ctl.sun = ui.segmented({ label: 'Güneş etkinliği (atmosfer yoğunluğu)', options: [{ value: 0.6, label: 'Düşük' }, { value: 1, label: 'Orta' }, { value: 1.6, label: 'Yüksek' }], value: P.sun, onChange: (v) => (P.sun = v) });

ui.section('Olaylar');
ui.buttons([
  { label: '💥 ASAT testi (865 km)', variant: 'danger', onClick: () => event('asat') },
  { label: '🛰 Uydu çarpışması (789 km)', variant: 'danger', onClick: () => event('iridium') },
]);
ui.button({ label: '🚀 Mega takımyıldız: +5.000 uydu (550 km)', onClick: () => event('mega') });
ui.toggle({ label: 'İrtifa bandı halkaları', value: true, onChange: (v) => (ringGroup.visible = v) });

ui.section('Durum');
const st = {
  year: ui.stat({ label: 'Yıl' }),
  tot: ui.stat({ label: 'LEO nesne (≥10 cm)' }),
  act: ui.stat({ label: 'Aktif uydu' }),
  frag: ui.stat({ label: 'Parça' }),
  col: ui.stat({ label: 'Büyük çarpışma' }),
  rate: ui.stat({ label: 'Çarpışma / yıl' }),
};
const kessTxt = ui.text('', 'card');
const legendTxt = ui.text('');
const compact = (v) => (v >= 1e6 ? `${fmt(v / 1e6, 1)} mn` : v >= 1e4 ? `${fmt(v / 1e3, 0)} bin` : fmt(v, 0));
const axis = (v) => (v >= 1e6 ? `${fmt(v / 1e6, 1)}mn` : v >= 1e4 ? `${fmt(v / 1e3, 0)}b` : fmt(v, 0));
const GROUPS = [[0, 2, '200–500 km', '#38bdf8'], [2, 4, '500–700 km', '#4ade80'], [4, 6, '700–900 km', '#fbbf24'], [6, 9, '900–2.000 km', '#f472b6']];
const bandChart = ui.chart({ title: 'Nesne sayısı, irtifa bandına göre (son 200 yıl; b = bin, mn = milyon)', series: GROUPS.map(([, , n, c]) => ({ name: n, color: c })), maxPoints: 400, height: 120, format: axis });
const typeChart = ui.chart({ title: 'Türüne göre', series: CATS.map((c) => ({ name: c.name, color: '#' + c.color.toString(16).padStart(6, '0') })), maxPoints: 400, height: 100, format: axis });
const rateChart = ui.chart({ title: 'Beklenen çarpışma sayısı / yıl', series: [{ name: 'büyük (bütün–bütün)', color: '#ef4444', fill: true }, { name: 'hasar (parça–uydu)', color: '#fb923c' }], maxPoints: 400, height: 90, format: (v) => fmt(v, v < 10 ? 1 : 0) });

function applyPreset(name) {
  Object.assign(P, PRESETS[name]);
  for (const k in PRESETS[name]) ctl[k].set(PRESETS[name][k]);
  restart();
}
function restart() {
  S = M.initState();
  bandChart.clear(); typeChart.clear(); rateChart.clear();
  layout();
  updatePanel(M.rates(S, P));
}

const ringCol = new THREE.Color();
function updatePanel(r) {
  const tot = totalObjects();
  st.year.set(String(Math.floor(S.year)));
  st.tot.set(compact(tot), tot > 100000 ? 'bad' : tot > 50000 ? 'warn' : '');
  st.act.set(compact(M.sum(S.S)));
  st.frag.set(compact(M.sum(S.F)));
  st.col.set(fmt(S.catastrophic, 0), S.catastrophic > 20 ? 'bad' : S.catastrophic > 3 ? 'warn' : '');
  const cr = M.sum(r.map((x) => x.II));
  st.rate.set(fmt(cr, cr < 10 ? 2 : 0), cr > 1 ? 'bad' : cr > 0.3 ? 'warn' : 'good');
  // Kendi kendini besleyen bant: çarpışma parçası üretimi, sürüklemenin temizlediğinden fazla ve nüfusu anlamlı büyütüyor
  const hot = r.map((x, i) => [i, x.growth, x.ratio]).filter(([, g, q]) => q > 1 && g > 0.002).sort((a, b) => b[1] - a[1]);
  kessTxt.set(hot.length
    ? `⚠️ <b>Kendi kendini besleyen bantlar</b> (çarpışma parçası > atmosferin temizlediği):<br>${hot.slice(0, 4).map(([i, g]) => `${M.BAND_NAMES[i]} km <b>+%${fmt(g * 100, 1)}/yıl</b>`).join(' · ')}
       <br><small>Bu bantlarda fırlatma dursa bile parça sayısı çarpışmalarla artar.</small>`
    : '✅ Hiçbir bantta çarpışmalar parça nüfusunu atmosferin temizleyebileceğinden hızlı büyütmüyor.');
  legendTxt.set(`<small><b style="color:#4ade80">●</b> aktif · <b style="color:#fbbf24">●</b> ölü uydu / roket gövdesi · <b style="color:#93c5fd">●</b> görev sonu inişte · <b style="color:#f87171">●</b> parça · 1 nokta ≈ ${fmt(tier, 0)} nesne · irtifa 3× abartılı</small>`);
  // Halka rengi: çarpışmaların net parça büyüme hızı (%/yıl) — mavi: temizleniyor, sarı: denge, kırmızı: büyüyor
  r.forEach((x, i) => {
    const t = clamp(0.5 + x.growth * 25, 0, 1);
    heatColor(t, ringCol);
    rings[i].material.color.copy(ringCol);
    rings[i].material.opacity = 0.1 + Math.abs(t - 0.5) * 0.35;
  });
}

// --- Döngü ---
sim.formatTime = () => `Yıl ${Math.floor(S.year)}`;
let chartAcc = 0, panelAcc = 0, layoutAcc = 0;
sim.onUpdate((dt) => {
  let dy = dt / YEAR_SEC;
  while (dy > 1e-9) {
    const h = Math.min(dy, 0.05);
    const ev = M.step(S, P, h, rng);
    dy -= h;
    for (const e of ev) {
      flashAt(e.band, e.big);
      if (e.big && performance.now() - lastToast > 2500) {
        lastToast = performance.now();
        sim.toast(`💥 ${Math.floor(S.year)}: ${M.BAND_NAMES[e.band]} km bandında çarpışma — ≈ ${fmt(M.FRAG_CAT, 0)} yeni parça`, 'bad');
      }
    }
    chartAcc += h;
    if (chartAcc >= 0.5) {
      chartAcc = 0;
      bandChart.push(GROUPS.map(([a, b]) => { let t = 0; for (let i = a; i < b; i++) t += M.total(S, i); return t; }));
      typeChart.push([M.sum(S.S), M.sum(S.D), M.sum(S.Z), M.sum(S.F)]);
      const r = M.rates(S, P);
      rateChart.push([M.sum(r.map((x) => x.II)), M.sum(r.map((x) => x.IF))]);
    }
  }
  layoutAcc += dt;
  if (layoutAcc > 0.3) { layoutAcc = 0; layout(); }
});

sim.onRender((dt) => {
  earth.rotation.y += dt * 0.05;
  moveDots(dt);
  for (const f of flashes) {
    if (!f.visible) continue;
    f.userData.life -= dt * 0.8;
    if (f.userData.life <= 0) { f.visible = false; continue; }
    const l = f.userData.life;
    f.scale.setScalar((f.userData.big ? 3 : 1.2) * (1.2 - l));
    f.material.opacity = l;
  }
  panelAcc += dt;
  if (panelAcc > 0.3) { panelAcc = 0; updatePanel(M.rates(S, P)); }
});

// Halkaya tıkla → bant bilgisi
sim.onClick(() => (ringGroup.visible ? rings : []), (hit) => {
  const i = hit.object.userData.band;
  const r = M.rates(S, P)[i];
  const life = M.dragLife((M.EDGES[i] + M.EDGES[i + 1]) / 2, P.sun);
  sim.toast(`<b>${M.BAND_NAMES[i]} km</b> · aktif ${fmt(S.S[i], 0)} · ölü ${fmt(S.D[i], 0)} · inişte ${fmt(S.Z[i], 0)} · parça ${fmt(S.F[i], 0)}<br>
    sürükleme ömrü ≈ ${life < 1 ? 'aylar' : life > 5000 ? 'binlerce yıl' : fmt(life, 0) + ' yıl'} · büyük çarpışma ${fmt(r.II, 3)}/yıl · parça net büyüme %${fmt(r.growth * 100, 2)}/yıl`);
});

sim.onReset(() => restart());
restart();
