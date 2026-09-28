// Balıkçılık ve Ortak Kaynaklar — Schaefer artık üretim modeli, MSY, kota, av yasağı, koruma alanı ve açık erişim (ortakların trajedisi).
import { createSim, THREE, BufferGeometryUtils, fmt, clamp, instanced, seeded, TAU } from '@core';
import { createModel, K, Q, H, FLEETS, MAXB } from './model.js';

const YEARS_PER_SEC = 0.5;   // 1× hızda 1 sn = 0,5 yıl
const MAXFISH = 700;
const GR = 13;               // av sahası yarıçapı
const FLEET_COLORS = [0xef4444, 0xfacc15, 0x22c55e];
const FLEET_CSS = ['#ef4444', '#facc15', '#22c55e'];
const PORTS = [[-17, 6], [2, -18], [19, 9]];   // uzaklık: yakın < orta < uzak

const sim = createSim({
  background: 0x9fc4dd,
  fog: [70, 150],
  camera: { position: [0, 44, 46], target: [0, -2, 3], fov: 46 },
  controls: { maxDistance: 110, minDistance: 10 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Ortadaki av sahasında tek bir balık stoku var; balık sayısı stok büyüklüğünü gösterir. Üç limandan (kırmızı, sarı, yeşil)
    tekneler aynı stoğu avlar. Uzak limanın tekneleri daha çok yakıt harcar, yani tekne başına maliyetleri daha yüksektir.
    Yeşil şamandıralı dilim <b>koruma alanıdır</b>: orada avlanılmaz, balıklar oradan av sahasına taşar.</p>
    <h3>Model: Schaefer artık üretim modeli</h3>
    <p><b>dB/dt = r·B·(1 − B/K) − q·E·B</b>. B stok, K taşıma kapasitesi, r türün büyüme hızı, E av çabası (tekne sayısı),
    q yakalama katsayısı. Stoğun doğal artışı (<i>artık üretim</i>) en çok <b>B = K/2</b>'de olur; buradan sürekli alınabilecek
    en yüksek av <b>MSY = r·K/4</b>'tür (en yüksek sürdürülebilir verim). Sabit çaba ile denge stoğu B* = K·(1 − qE/r)'dir;
    <b>qE ≥ r</b> olursa stok sıfıra gider. Sabit bir <b>kota</b> (TAC) MSY'nin üstündeyse ya da stok K/2'nin altına düşmüşse,
    kota da stoğu çökertebilir.</p>
    <p><b>Açık erişim (Gordon–Schaefer):</b> kimse kaynağın sahibi değilse, kâr olduğu sürece yeni tekneler gelir. Filo, kâr
    sıfırlanana kadar büyür; denge stoğu B = c/(p·q) olur. Her balıkçı için mantıklı olan, topluluk için kötü sonuç verir:
    <b>ortakların trajedisi</b> (Hardin, 1968). Kota tek başına tekne yarışını durdurmaz: sezon kısalır, maliyet aynı kalır.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Açık erişim</b>: önce kâr yüksektir, tekneler çoğalır; stok düşer, kâr erir. Uzak liman ilk çekilen olur.</li>
      <li><b>MSY kotası</b>'nda "çevresel dalgalanma"yı %20'ye çıkar: kötü birkaç yıl stoğu K/2'nin altına iterse sabit kota
        stoğu dibe çeker. Kotayı %20 düşür, farkı gör.</li>
      <li><b>Aşırı avlanma</b>'da (120 tekne, qE > r) stoğun çöküşünü izle; sonra teknelerin yarısını çek: stok geri döner mi?</li>
      <li>r'yi 0,2'ye indir (yavaş büyüyen, uzun ömürlü tür): aynı filo çok daha hızlı çöküş yaratır.</li>
      <li>Aynı filoyla <b>koruma alanını</b> %0 ve %30 yaparak karşılaştır.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Kanada'nın Newfoundland açıklarındaki kuzey Atlantik morinası (cod) stoku onlarca yıllık aşırı avcılıktan sonra çöktü;
    hükümet <b>1992</b>'de av yasağı (moratoryum) ilan etti. Yumurtlayan stokun tarihsel düzeyinin yaklaşık <b>%1</b>'ine düştüğü
    tahmin edilir ve yaklaşık <b>30.000'den fazla</b> balıkçı ve fabrika işçisi işini kaybetti. Stok, yasaktan sonra onlarca yıl
    beklenen hızda toparlanmadı. (Kaynak: Wikipedia, "Collapse of the Atlantic northwest cod fishery"; Britannica, "Cod fishery
    collapse of 1992".)</p>
    <p><small>Sınırlar: Tek türlü, yaş yapısız, deterministik bir modeldir (isteğe bağlı çevresel gürültü hariç). K, q, fiyat ve
    maliyetler <b>temsilidir</b>; para birimi yalnız karşılaştırma içindir. Gerçek stok değerlendirmeleri yaş yapılı modeller,
    belirsizlik ve ihtiyat payı kullanır.</small></p>`,
});
sim.formatTime = () => `${Math.floor(model.t) + 1}. yıl · ${['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][Math.floor((model.t % 1) * 12)]}`;

const model = createModel(seeded(42));

// --- Deniz, taban, kıyılar ---
const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 60, 60),
  new THREE.MeshStandardMaterial({ color: 0x1b6a9a, transparent: true, opacity: 0.62, roughness: 0.25, metalness: 0.1, depthWrite: false }));
water.rotation.x = -Math.PI / 2;
water.renderOrder = 2;
sim.scene.add(water);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: 0x14384f, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -4;
sim.scene.add(floor);

// Av sahası kenarı
const ring = new THREE.Mesh(new THREE.RingGeometry(GR - 0.1, GR + 0.1, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.05;
sim.scene.add(ring);

// Limanlar
const landMat = new THREE.MeshStandardMaterial({ color: 0x9c8c63, roughness: 1 });
const houseMat = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.8 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 });
const labels = [];
PORTS.forEach(([x, z], i) => {
  const g = new THREE.Group();
  const out = new THREE.Vector2(x, z).normalize();
  g.position.set(x + out.x * 6, 0, z + out.y * 6);
  g.rotation.y = Math.atan2(out.x, out.y);
  const land = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1.6, 20), landMat);
  land.position.y = 0.3;
  land.scale.set(1.25, 1, 0.9);
  g.add(land);
  const r = seeded(i + 5);
  for (let k = 0; k < 6; k++) {
    const hx = (r() - 0.5) * 12, hz = r() * 3 + 1;
    const house = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), houseMat);
    house.position.set(hx, 1.6, hz);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 0.7, 4), roofMat);
    roof.position.set(hx, 2.45, hz);
    roof.rotation.y = Math.PI / 4;
    g.add(house, roof);
  }
  const pier = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x6b4f2e }));
  pier.position.set(0, 0.35, -8);
  g.add(pier);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.05), new THREE.MeshBasicMaterial({ color: FLEET_COLORS[i] }));
  flag.position.set(0.5, 3.4, -5.5);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3), houseMat);
  pole.position.set(0, 2, -5.5);
  g.add(flag, pole);
  sim.scene.add(g);
  labels.push(sim.label(`<span style="color:${FLEET_CSS[i]}">⚓</span> ${FLEETS[i].name}`, { parent: g, position: [0, 4.6, -3], className: 'plain' }));
});

// Koruma alanı dilimi + şamandıralar
const reserveMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
reserveMesh.rotation.x = -Math.PI / 2;
reserveMesh.position.y = 0.06;
sim.scene.add(reserveMesh);
const buoys = instanced(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0xa3e635, emissive: 0x1a3300 }), 64);
buoys.frustumCulled = false;
sim.scene.add(buoys);
const reserveLabel = sim.label('🛡️ Koruma alanı', { position: [0, 1.5, 0], className: 'plain' });
labels.push(reserveLabel);
const R_START = Math.PI * 0.62;   // dilimin başladığı açı (x-z düzleminde, kameraya yakın taraf)
const mtx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1), eul = new THREE.Euler();
function drawReserve() {
  const f = model.p.reserve;
  reserveMesh.visible = f > 0.001;
  reserveLabel.visible = f > 0.001 && (typeof showLabels === 'undefined' || showLabels.value);
  reserveMesh.geometry.dispose();
  // CircleGeometry xy düzleminde; rotation.x = −90° ile açı θ → (cosθ, −sinθ) olur; −açı vererek x-z açısını eşle
  reserveMesh.geometry = new THREE.CircleGeometry(GR, 48, -R_START - f * TAU, f * TAU);
  let n = 0;
  if (f > 0.001) {
    const nArc = Math.max(4, Math.round(40 * f));
    const add = (x, z) => { mtx.makeTranslation(x, 0.1, z); buoys.setMatrixAt(n++, mtx); };
    for (let k = 0; k <= nArc; k++) { const a = R_START + (k / nArc) * f * TAU; add(Math.cos(a) * GR, Math.sin(a) * GR); }
    if (f < 0.999) for (const a of [R_START, R_START + f * TAU]) for (let k = 1; k < 6; k++) add(Math.cos(a) * GR * k / 6, Math.sin(a) * GR * k / 6);
    const am = R_START + f * Math.PI;
    reserveLabel.position.set(Math.cos(am) * GR * 0.6, 1.5, Math.sin(am) * GR * 0.6);
  }
  buoys.count = Math.min(n, 64);
  buoys.instanceMatrix.needsUpdate = true;
}
const inReserve = (x, z) => {
  const f = model.p.reserve;
  if (f <= 0) return false;
  let a = Math.atan2(z, x) - R_START;
  a = ((a % TAU) + TAU) % TAU;
  return a < f * TAU && x * x + z * z < GR * GR * 1.1;
};

// --- Balıklar ---
function fishGeo() {
  const body = new THREE.SphereGeometry(0.5, 8, 6);
  body.scale(0.55, 0.16, 0.18);
  const tail = new THREE.ConeGeometry(0.14, 0.22, 4);
  tail.rotateZ(Math.PI / 2); tail.scale(1, 0.4, 1); tail.translate(-0.36, 0, 0);
  return BufferGeometryUtils.mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()]);
}
const fishMesh = instanced(fishGeo(), new THREE.MeshStandardMaterial({ color: 0xcfe3f0, roughness: 0.35, metalness: 0.5, emissive: 0x16323f }), MAXFISH);
fishMesh.frustumCulled = false;
sim.scene.add(fishMesh);
const fish = [];
{
  const r = seeded(17);
  for (let i = 0; i < MAXFISH; i++) fish.push({ u: r(), v: Math.sqrt(r()), y: -0.6 - r() * 2.2, ph: r() * TAU, w: 0.25 + r() * 0.3, s: 0.8 + r() * 0.5 });
}
function drawFish(t) {
  const f = model.p.reserve, B = model.B();
  const nR = Math.round((model.Br / K) * MAXFISH), nF = Math.round((model.Bf / K) * MAXFISH);
  const n = Math.min(MAXFISH, nR + nF);
  for (let i = 0; i < n; i++) {
    const F = fish[i];
    const reserve = i < nR;
    const a0 = reserve ? R_START + F.u * f * TAU : R_START + f * TAU + F.u * (1 - f) * TAU;
    const a = a0 + Math.sin(t * F.w + F.ph) * 0.05 * (reserve ? f : 1 - f) * 3;
    const rr = F.v * (GR - 0.8) + Math.sin(t * 0.7 + F.ph) * 0.4;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    eul.set(0, -a + Math.PI * (F.w > 0.4 ? 1 : 0) + Math.sin(t * 6 + F.ph) * 0.15, 0);
    q4.setFromEuler(eul);
    mtx.compose(pv.set(x, F.y, z), q4, sv.setScalar(F.s));
    fishMesh.setMatrixAt(i, mtx);
  }
  fishMesh.count = n;
  fishMesh.instanceMatrix.needsUpdate = true;
  void B;
}

// --- Tekneler ---
function boatGeo() {
  const hull = new THREE.BoxGeometry(1.6, 0.4, 0.6);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getX(i) > 0.5) p.setZ(i, p.getZ(i) * 0.25);   // sivri pruva
  hull.translate(0, 0.15, 0);
  const cabin = new THREE.BoxGeometry(0.5, 0.4, 0.45);
  cabin.translate(-0.25, 0.55, 0);
  const mast = new THREE.CylinderGeometry(0.03, 0.03, 0.9);
  mast.translate(0.3, 0.75, 0);
  return BufferGeometryUtils.mergeGeometries([hull.toNonIndexed(), cabin.toNonIndexed(), mast.toNonIndexed()]);
}
const bGeo = boatGeo();
const boats = FLEETS.map((_, i) => {
  const mesh = instanced(bGeo, new THREE.MeshStandardMaterial({ color: FLEET_COLORS[i], roughness: 0.6 }), MAXB);
  mesh.frustumCulled = false;
  sim.scene.add(mesh);
  const r = seeded(100 + i);
  const list = [];
  for (let k = 0; k < MAXB; k++) {
    const home = new THREE.Vector2(PORTS[i][0] + (r() - 0.5) * 7, PORTS[i][1] + (r() - 0.5) * 7);
    list.push({ p: home.clone(), home, tgt: new THREE.Vector2(), hd: 0, timer: 0, spd: 5 + r() * 2, ph: r() * TAU, rnd: r });
  }
  return { mesh, list };
});
function pickSpot(b) {
  for (let k = 0; k < 20; k++) {
    const a = b.rnd() * TAU, d = Math.sqrt(b.rnd()) * (GR - 1);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!inReserve(x, z)) { b.tgt.set(x, z); return; }
  }
  b.tgt.set(0, 0);
}
const tv = new THREE.Vector2();
function moveBoats(dt, t) {
  const open = model.fishingOpen && model.B() > 0.05;
  boats.forEach((F, i) => {
    const n = Math.round(model.boats[i]);
    for (let k = 0; k < MAXB; k++) {
      const b = F.list[k];
      const active = k < n;
      if (!active) { b.p.copy(b.home); continue; }
      if (!open) b.tgt.copy(b.home);
      else if (b.timer <= 0 || inReserve(b.tgt.x, b.tgt.y) || b.tgt.equals(b.home)) { pickSpot(b); b.timer = 3 + b.rnd() * 5; }
      tv.subVectors(b.tgt, b.p);
      const d = tv.length();
      if (d > 0.3) {
        const step = Math.min(d, b.spd * dt);
        b.p.addScaledVector(tv.normalize(), step);
        b.hd = Math.atan2(-tv.y, tv.x);
      } else if (open) { b.timer -= dt; b.hd += dt * 0.6; }   // ağ çekerken yavaş döner
    }
    const m = F.mesh.instanceMatrix.array;
    for (let k = 0; k < n; k++) {
      const b = F.list[k];
      eul.set(Math.sin(t * 2 + b.ph) * 0.06, b.hd, Math.sin(t * 1.7 + b.ph) * 0.05);
      q4.setFromEuler(eul);
      mtx.compose(pv.set(b.p.x, Math.sin(t * 2.2 + b.ph) * 0.06, b.p.y), q4, sv.set(1, 1, 1));
      mtx.toArray(m, k * 16);
    }
    F.mesh.count = n;
    F.mesh.instanceMatrix.needsUpdate = true;
  });
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Senaryo');
const preset = ui.segmented({
  options: [{ value: 'acik', label: 'Açık erişim' }, { value: 'msy', label: 'MSY kotası' }, { value: 'asiri', label: 'Aşırı avlanma' }, { value: 'koruma', label: 'Koruma alanı' }],
  value: 'acik', onChange: () => { sim.reset(); sim.play(); },
});

ui.section('⛵ Filolar');
const fleetSl = FLEETS.map((F, i) => ui.slider({ label: `<span style="color:${FLEET_CSS[i]}">■</span> ${F.name}: tekne`, min: 0, max: MAXB, step: 1, value: 20,
  onChange: (v) => { model.boats[i] = v; } }));
const openAcc = ui.toggle({ label: '🔓 Açık erişim (kâr varsa yeni tekne gelir)', value: false, onChange: (v) => { model.p.openAccess = v; syncFleetSliders(); } });
const price = ui.slider({ label: 'Balık fiyatı', min: 1, max: 6, step: 0.1, value: 3, format: (v) => `${fmt(v, 1)} birim / ton`, onChange: (v) => (model.p.price = v) });
const cost = ui.slider({ label: 'Tekne başına yıllık maliyet', min: 0.1, max: 0.6, step: 0.01, value: 0.25, format: (v) => `${fmt(v * 1000, 0)} birim`, onChange: (v) => (model.p.cost = v) });

ui.section('🏛️ Yönetim');
const quota = ui.slider({ label: 'Yıllık av kotası (TAC)', min: 0, max: 30, step: 0.5, value: 0,
  format: (v) => (v === 0 ? 'kota yok' : `${fmt(v, 1)} bin ton (MSY'nin %${fmt((v / model.msy()) * 100, 0)}'i)`), onChange: (v) => (model.p.quota = v) });
const closure = ui.slider({ label: 'Üreme mevsimi av yasağı', min: 0, max: 6, step: 1, value: 0, format: (v) => (v ? `${v} ay (Nisan'dan itibaren)` : 'yok'), onChange: (v) => (model.p.closure = v) });
const reserve = ui.slider({ label: 'Deniz koruma alanı', min: 0, max: 60, step: 5, value: 0, unit: '%', onChange: (v) => { model.setReserve(v / 100); drawReserve(); } });

ui.section('🐟 Tür ve çevre');
const rSl = ui.slider({ label: 'Büyüme hızı r', min: 0.1, max: 1.2, step: 0.05, value: 0.5,
  format: (v) => `${fmt(v, 2)} /yıl · ${v < 0.3 ? 'yavaş (uzun ömürlü tür)' : v > 0.8 ? 'hızlı (kısa ömürlü tür)' : 'orta'}`,
  onChange: (v) => { model.p.r = v; quota.set(quota.value); } });
const noise = ui.slider({ label: 'Çevresel dalgalanma (yıldan yıla)', min: 0, max: 40, step: 1, value: 0, unit: '%', onChange: (v) => (model.p.noise = v / 100) });
ui.buttons([
  { label: '🐟 Kotayı MSY yap', onClick: () => quota.set(Math.round(model.msy() * 2) / 2, true) },
  { label: '⛵ Filoyu yarıya indir', onClick: () => { model.boats = model.boats.map((b) => Math.round(b / 2)); syncFleetSliders(); } },
]);

ui.section('📊 Durum');
const stStock = ui.stat({ label: 'Stok (K\'nin yüzdesi)', unit: '%' });
const stCatch = ui.stat({ label: 'Son 12 ay av', unit: 'bin t' });
const stMsy = ui.stat({ label: 'MSY = rK/4', unit: 'bin t' });
const stBoats = ui.stat({ label: 'Toplam tekne' });
const stProfit = ui.stat({ label: 'Son 12 ay kâr', unit: 'birim' });
const stState = ui.stat({ label: 'Av sahası' });
const stockChart = ui.chart({ title: 'Stok B (bin ton) · kesikli seviye: K/2', series: [{ name: 'Stok', color: '#38bdf8', fill: true }, { name: 'K/2 (MSY stoğu)', color: '#94a3b8' }], maxPoints: 400, yMin: 0, yMax: K });
const catchChart = ui.chart({ title: 'Yıllık av ve MSY (bin ton/yıl)', series: [{ name: 'Av', color: '#f97316' }, { name: 'MSY', color: '#a3e635' }, { name: 'Kota', color: '#e879f9' }], maxPoints: 400, yMin: 0, height: 100 });
const econChart = ui.chart({ title: 'Filo: tekne sayısı ve yıllık kâr', series: [{ name: 'Tekne', color: '#e2e8f0' }, { name: 'Kâr (×1000 birim)', color: '#4ade80' }], maxPoints: 400, height: 100 });
const note = ui.text('', 'card');

ui.section('Görünüm', { open: false });
const showLabels = ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => { labels.forEach((l) => (l.visible = v)); drawReserve(); } });
ui.buttons([
  { label: '🎥 Genel', onClick: () => sim.moveCamera([0, 44, 46], [0, -2, 3]) },
  { label: '⬇️ Yukarıdan', onClick: () => sim.moveCamera([0, 62, 2], [0, 0, 0]) },
  { label: '🌊 Su altı', onClick: () => sim.moveCamera([0, -1.2, 22], [0, -1.5, 0]) },
]);

function syncFleetSliders() {
  fleetSl.forEach((s, i) => { s.set(Math.round(model.boats[i])); s.disable(model.p.openAccess); });
}

// --- Hazır ayarlar ---
const PRESETS = {
  acik: { boats: [6, 6, 6], open: true, quota: 0, closure: 0, reserve: 0, r: 0.5, noise: 0, B0: 90 },
  msy: { boats: [25, 25, 25], open: false, quota: 12.5, closure: 0, reserve: 0, r: 0.5, noise: 0, B0: 80 },
  asiri: { boats: [40, 40, 40], open: false, quota: 0, closure: 0, reserve: 0, r: 0.5, noise: 0, B0: 80 },
  koruma: { boats: [30, 30, 30], open: false, quota: 0, closure: 2, reserve: 30, r: 0.5, noise: 0, B0: 80 },
};
function load(name) {
  const P = PRESETS[name];
  openAcc.set(P.open, true); rSl.set(P.r, true); noise.set(P.noise, true);
  price.set(3, true); cost.set(0.25, true);
  quota.set(P.quota, true); closure.set(P.closure, true);
  model.p.reserve = P.reserve / 100; reserve.set(P.reserve);
  model.reset(P.B0, P.boats);
  syncFleetSliders();
  drawReserve();
  acc = 0; nextPush = 0; wasCollapsed = false;
  stockChart.clear(); catchChart.clear(); econChart.clear();
  boats.forEach((F) => F.list.forEach((b) => { b.p.copy(b.home); b.timer = 0; }));
  updateStats();
}

// --- Döngü ---
let acc = 0, nextPush = 0, wasCollapsed = false, lastYear = -1;
sim.onUpdate((dt, t) => {
  acc += dt * YEARS_PER_SEC;
  while (acc >= H) { model.step(); acc -= H; }
  if (model.p.openAccess && model.yearIdx !== lastYear) { lastYear = model.yearIdx; syncFleetSliders(); }
  if (model.t >= nextPush) {
    nextPush = model.t + 0.2;
    stockChart.push([model.B(), K / 2]);
    catchChart.push([model.annualCatch, model.msy(), model.p.quota || 0]);
    econChart.push([model.effort(), model.annualProfit]);
  }
  if (model.collapsed && !wasCollapsed) sim.toast('📉 Stok çöktü: K\'nin %10\'unun altında', 'bad');
  wasCollapsed = model.collapsed;
  moveBoats(Math.min(dt, 0.1) * 1.2, t);
});

let tick = 0;
sim.onRender(() => {
  drawFish(performance.now() / 1000);
  if (sim.paused) moveBoats(0, sim.time);
  if (tick++ % 10 === 0) updateStats();
  const p = water.geometry.attributes.position, tt = performance.now() / 1000;
  if (tick % 2 === 0) {
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 0.25 + tt) * 0.12 + Math.cos(p.getY(i) * 0.3 + tt * 0.8) * 0.1);
    p.needsUpdate = true;
  }
});

function updateStats() {
  const B = model.B(), pct = (B / K) * 100, msy = model.msy();
  stStock.set(fmt(pct, 0), pct < 10 ? 'bad' : pct < 40 ? 'warn' : 'good');
  stCatch.set(fmt(model.annualCatch, 1), model.annualCatch > msy * 1.02 ? 'warn' : '');
  stMsy.set(fmt(msy, 1));
  const E = model.effort();
  stBoats.set(Math.round(E), Q * E >= model.p.r ? 'bad' : '');
  stProfit.set(fmt(model.annualProfit * 1000, 0), model.annualProfit < 0 ? 'bad' : 'good');
  stState.set(model.fishingOpen ? 'açık' : model.closedBy === 'sezon' ? 'av yasağı' : 'kota doldu', model.fishingOpen ? '' : 'warn');

  const Eeq = model.p.r / Q;
  let msg;
  if (B < 1) msg = '💀 <b>Stok tükendi.</b> Avlanacak balık kalmadı; tekneler zarar ediyor. Newfoundland morinasında olduğu gibi, avı durdurmak bile hızlı toparlanma garantisi vermez.';
  else if (model.collapsed) msg = `📉 <b>Çöküş:</b> stok K'nin %10'unun altında. Artık üretim çok küçük (r·B·(1−B/K) ≈ ${fmt(model.p.r * B * (1 - B / K), 1)} bin ton/yıl); av bunu aşarsa stok sıfıra gider.`;
  else if (model.p.openAccess && model.annualProfit > 0.5) msg = '🔓 <b>Açık erişim:</b> kâr var, bu yüzden her yıl yeni tekneler katılıyor. Kâr sıfırlanana kadar filo büyüyecek.';
  else if (model.p.openAccess) msg = `🔓 <b>Ortakların trajedisi:</b> kâr erimiş, stok düşük (B ≈ c/(p·q)). Herkes kendi açısından mantıklı davrandı; sonuç topluluk için kötü.`;
  else if (Q * E >= model.p.r && !model.p.reserve && !model.p.quota) msg = `⚠️ <b>Çaba çok yüksek:</b> ${Math.round(E)} tekne, q·E ≥ r sınırını (${fmt(Eeq, 0)} tekne) aşıyor. Bu çabayla hiçbir pozitif denge stoğu yok.`;
  else if (model.p.quota > msy + 0.01) msg = '⚠️ <b>Kota MSY\'nin üstünde:</b> hiçbir stok düzeyi bu kadar artık üretemez; kota her yıl dolarsa stok sonunda çöker.';
  else if (model.p.quota && B < K / 2 && model.annualCatch > model.p.r * B * (1 - B / K)) msg = '⚠️ <b>Sabit kota tuzağı:</b> stok K/2\'nin altında; artık üretim kotadan küçük. Kota düşürülmezse stok giderek hızlanarak azalır.';
  else if (model.p.reserve > 0) msg = '🛡️ <b>Koruma alanı:</b> içerideki balıklar yoğunlaşıp büyüyor ve dışarı taşarak avı besliyor. Stok, filo büyük olsa da daha güvende.';
  else if (Math.abs(B - K / 2) < 6 && model.annualCatch > msy * 0.9) msg = '🎯 <b>MSY\'ye yakın:</b> stok K/2 civarında, av en yüksek sürdürülebilir düzeyde. Ama güvenlik payı yok!';
  else msg = `ℹ️ Bu çabayla denge stoğu B* = K·(1 − qE/r) ≈ <b>${fmt(Math.max(0, K * (1 - (Q * E) / model.p.r)), 0)} bin ton</b>. MSY için gereken çaba yaklaşık ${fmt(Eeq / 2, 0)} tekne.`;
  note.set(msg);
}

sim.onClick(() => boats.map((b) => b.mesh), (hit) => {
  const i = boats.findIndex((b) => b.mesh === hit.object);
  if (i < 0) return;
  const n = model.boats[i], E = model.effort();
  const ly = model.lastYear;
  const per = ly && n > 0.5 ? (ly.prof[i] / n) * 1000 : NaN;
  sim.toast(`⛵ <b>${FLEETS[i].name}</b> · ${Math.round(n)} tekne · maliyet ${fmt(model.costOf(i) * 1000, 0)} birim/tekne·yıl · geçen yıl tekne başı kâr ${fmt(per, 0)} birim (${fmt(E ? (n / E) * 100 : 0, 0)}% av payı)`,
    per < 0 ? 'bad' : 'good');
});

sim.onReset(() => load(preset.value));
load('acik');
