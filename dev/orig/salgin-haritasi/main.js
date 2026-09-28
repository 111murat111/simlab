// Salgın Haritası — mini kasabada 1200 kişilik birey tabanlı SIR + aşı modeli: ev, okul, iş, çarşı ve hastane temasları.
import { createSim, THREE, fmt, lerp } from '@core';
import { createModel, S, I, R, V, TICKS } from './model.js';

const DAY_SEC = 3;          // 1× hızda bir gün = 3 saniye
const COLS = 10, ROWS_Z = [-19, -15, -11, 11, 15, 19];
const PER_B = 20;
const COL = { S: 0xfacc15, I: 0xef4444, R: 0x9ca3af, V: 0x3b82f6, Q: 0x7f1d1d };

const sim = createSim({
  background: 0x0b1324,
  camera: { position: [0, 44, 44], target: [0, 0, 2.5], fov: 42 },
  controls: { maxDistance: 110, minDistance: 8 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>1.200 kişilik bir kasaba. Her kapsül bir kişi: <b style="color:#facc15">sarı</b> hassas, <b style="color:#f87171">kırmızı</b>
    enfekte (<b style="color:#b91c1c">koyu kırmızı</b>: evde izole), <b style="color:#cbd5e1">gri</b> iyileşmiş (bağışık), <b style="color:#60a5fa">mavi</b> aşılı.
    İnsanlar gece evdedir; sabah çocuklar okula, yetişkinler ofis, fabrika, çarşı ve hastaneye gider, akşam bir kısmı alışverişe çıkar.
    Hastalık aynı yerde bulunan kişiler arasındaki temaslarla bulaşır. Çatıların kırmızılaşması o apartmandaki vaka yoğunluğunu gösterir.</p>
    <p>Bu, klasik <b>SIR</b> (Hassas → Enfekte → İyileşmiş) modelinin birey tabanlı hâlidir. <b>Efektif R</b>, bir enfektenin şu anki
    koşullarda ortalama kaç kişiye bulaştırdığıdır: R &gt; 1 iken vakalar artar, R &lt; 1 olunca azalır. Bağışık (aşılı + iyileşmiş) oranı
    yeterince yükselince salgın söner; buna <b>sürü bağışıklığı</b> denir.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Önlemsiz</b> senaryoda sivri zirveyi ve hastane kapasitesinin aşıldığı günleri gör.</li>
      <li><b>Maske + mesafe</b> ile “eğriyi düzleştir”: zirve düşer, salgın uzar, hastane taşmaz.</li>
      <li><b>%70 aşı</b>: birkaç vaka olur ama salgın büyüyemez. Aşı oranını salgın sırasında artırmayı da dene.</li>
      <li><b>Okullar kapalı</b> ve <b>karantina</b>yı tek tek aç: hangisi daha etkili?</li>
      <li>Bir apartmana tıkla: oraya yeni bir vaka gelir. Bir kişiye tıkla: durumunu ve kaç kişiye bulaştırdığını gör.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>COVID-19 döneminde “eğriyi düzleştir” çağrısının amacı, aynı anda hastalanan kişi sayısını hastanelerin kaldırabileceği
    düzeyde tutmaktı. Kızamık gibi çok bulaşıcı hastalıklarda sürü bağışıklığı için çok yüksek aşılama oranı gerekir; bu yüzden
    aşı oranındaki küçük düşüşler bile salgınlara yol açabilir.</p>
    <h3>Model ve sınırları</h3>
    <p><small>Varsayımlar: evde 2 saatte ortalama 0,4 hane içi temas; dışarıda günlük temas sayısı kaydırıcıyla ayarlanır ve
    temas aynı mekândaki rastgele biriyledir. Maske (yalnız ev dışında) takan hastadan bulaşmayı %50, takan sağlıklıya bulaşmayı
    %30 azaltır. Aşı enfeksiyon riskini “aşı etkinliği” kadar azaltır. Enfektelerin yaklaşık üçte ikisi belirti gösterir; karantina açıkken
    bunlar belirtiden sonra evde kalır. Ağır seyir olasılığı yaşla artar; yatak yoksa hasta evde kalır. Ölümler, yeniden enfeksiyon ve
    kuluçka dönemi modellenmemiştir. Sayılar belirli bir hastalığa ait değildir; kavramları göstermek içindir.</small></p>`,
});

const model = createModel({ buildings: COLS * ROWS_Z.length, perBuilding: PER_B, hhSize: 4 });
const N = model.N;
sim.formatTime = () => `${model.day + 1}. gün · ${String(model.hour * 2).padStart(2, '0')}:00`;

// --- Kasaba yerleşimi ---
const bPos = [];            // apartman merkezleri
ROWS_Z.forEach((z) => { for (let c = 0; c < COLS; c++) bPos.push([-18 + c * 4, z]); });
const PLACES = [
  { name: '🏫 Okul', cx: -15, color: 0xf59e0b, h: 2.2 },
  { name: '🏢 Ofisler', cx: -7.5, color: 0x60a5fa, h: 5 },
  { name: '🛒 Çarşı', cx: 0, color: 0x34d399, h: 1.6 },
  { name: '🏭 Fabrika', cx: 7.5, color: 0xa8a29e, h: 2.8 },
  { name: '🏥 Hastane', cx: 15, color: 0xf1f5f9, h: 3.4 },
];
const PLAZA = { z0: -2.6, z1: 5.4, hw: 2.8 };
const WARD = { x0: 12.4, x1: 17.6, z0: 3.6, z1: 5.4 };

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshLambertMaterial({ color: 0x24402e }));
  ground.rotation.x = -Math.PI / 2;
  sim.scene.add(ground);

  // yollar
  const roads = [];
  for (const z of [-8.6, 8.6]) roads.push([0, z, 46, 1.4]);
  for (const z of [-13, -17, 13, 17]) roads.push([0, z, 42, 0.7]);
  for (let x = -20; x <= 20; x += 4) { roads.push([x, -15, 0.7, 10]); roads.push([x, 15, 0.7, 10]); }
  const roadMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3b4252 }), roads.length);
  roads.forEach(([x, z, w, d], i) => {
    dummy.position.set(x, 0.01, z); dummy.scale.set(w, 1, d); dummy.updateMatrix();
    roadMesh.setMatrixAt(i, dummy.matrix);
  });
  sim.scene.add(roadMesh);

  // mekânlar: bina + meydan
  const plazaMat = new THREE.MeshLambertMaterial({ color: 0x55606f });
  for (const p of PLACES) {
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(PLAZA.hw * 2 + 0.4, PLAZA.z1 - PLAZA.z0 + 0.4).rotateX(-Math.PI / 2), plazaMat);
    plaza.position.set(p.cx, 0.02, (PLAZA.z0 + PLAZA.z1) / 2);
    sim.scene.add(plaza);
    const b = new THREE.Mesh(new THREE.BoxGeometry(5.6, p.h, 2.6), new THREE.MeshLambertMaterial({ color: p.color }));
    b.position.set(p.cx, p.h / 2, -4.6);
    sim.scene.add(b);
    p.label = sim.label(p.name, { position: [p.cx, p.h + (p.cx === 15 ? 2.2 : 0.9), -4.6] });
  }
  // hastane: kırmızı haç + koğuş zemini
  const red = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.05), red);
  cross1.position.set(15, 2.2, -3.27);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2, 0.05), red);
  cross2.position.copy(cross1.position);
  const ward = new THREE.Mesh(new THREE.PlaneGeometry(WARD.x1 - WARD.x0 + 0.3, WARD.z1 - WARD.z0 + 0.3).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7f1d1d }));
  ward.position.set((WARD.x0 + WARD.x1) / 2, 0.03, (WARD.z0 + WARD.z1) / 2);
  sim.scene.add(cross1, cross2, ward);
  // fabrika bacaları, okul bayrağı
  const chim = new THREE.CylinderGeometry(0.25, 0.3, 2.4, 8);
  for (const dx of [-1.6, 1.6]) {
    const c = new THREE.Mesh(chim, new THREE.MeshLambertMaterial({ color: 0x78716c }));
    c.position.set(7.5 + dx, 4, -5);
    sim.scene.add(c);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0xe5e7eb }));
  pole.position.set(-17.2, 3.3, -3.4);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshLambertMaterial({ color: 0xe11d48, side: THREE.DoubleSide }));
  flag.position.set(-16.8, 4.1, -3.4);
  sim.scene.add(pole, flag);

  // ağaçlar (kenar kuşak)
  const trees = [];
  for (let k = -22; k <= 22; k += 2.2) trees.push([k, -23], [k, 23], [-23, k], [23, k]);
  for (const x of [-11.25, -3.75, 3.75, 11.25]) trees.push([x, -1], [x, 2.2], [x, 5]);
  const treeMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.6, 1.8, 6).translate(0, 0.9, 0), new THREE.MeshLambertMaterial({ color: 0x15803d }), trees.length);
  trees.forEach(([x, z], i) => {
    const s = 0.7 + ((i * 37) % 10) / 20;
    dummy.position.set(x, 0, z); dummy.scale.set(s, s, s); dummy.updateMatrix();
    treeMesh.setMatrixAt(i, dummy.matrix);
  });
  sim.scene.add(treeMesh);
}

// apartmanlar ve çatılar (çatı rengi = vaka yoğunluğu)
const nB = bPos.length;
const bldMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1, 1.8).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), nB);
const roofMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1.32, 0.7, 4).rotateY(Math.PI / 4).translate(0, 0.35, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), nB);
const WALLS = [0xe7d8c9, 0xf1e3b5, 0xd9e4dd, 0xe8cfc8, 0xcfd8e6];
const ROOF = new THREE.Color(0x475569), ROOF_HOT = new THREE.Color(0xdc2626);
bPos.forEach(([x, z], b) => {
  const h = 1.3 + ((b * 7) % 5) * 0.25;
  dummy.position.set(x, 0, z); dummy.scale.set(1, h, 1); dummy.updateMatrix();
  bldMesh.setMatrixAt(b, dummy.matrix);
  bldMesh.setColorAt(b, tmpC.setHex(WALLS[b % WALLS.length]));
  dummy.position.set(x, h, z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
  roofMesh.setMatrixAt(b, dummy.matrix);
  roofMesh.setColorAt(b, ROOF);
});
sim.scene.add(bldMesh, roofMesh);
const bInf = new Int32Array(nB);

// --- İnsanlar ---
const agentMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.13, 0.22, 2, 6).translate(0, 0.24, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
agentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
agentMesh.frustumCulled = false;
sim.scene.add(agentMesh);
const px = new Float32Array(N), pz = new Float32Array(N), ux = new Float32Array(N), uz = new Float32Array(N), sc = new Float32Array(N);
const mArr = agentMesh.instanceMatrix.array;
for (let i = 0; i < N; i++) agentMesh.setColorAt(i, tmpC.setHex(COL.S));
const cArr = agentMesh.instanceColor.array;
const LIN = {};
for (const k in COL) LIN[k] = new THREE.Color(COL[k]);

function target(i, out) {
  const l = model.loc[i];
  if (l < model.P0) {
    // apartman çevresindeki avlu: 20 kişi kare bir halka üzerinde
    const [bx, bz] = bPos[model.bld[i]];
    const s = (((i % PER_B) + 0.5) / PER_B) * 4, side = Math.floor(s), t = (s - side) * 2.5 - 1.25;
    const e = 1.3 + (ux[i] - 0.5) * 0.3;
    out[0] = bx + (side === 0 ? t : side === 1 ? e : side === 2 ? -t : -e);
    out[1] = bz + (side === 0 ? -e : side === 1 ? t : side === 2 ? e : -t);
  } else if (l === model.WARD) {
    out[0] = lerp(WARD.x0, WARD.x1, ux[i]); out[1] = lerp(WARD.z0, WARD.z1, uz[i]);
  } else {
    const p = PLACES[l - model.P0];
    const z1 = l - model.P0 === 4 ? WARD.z0 - 0.3 : PLAZA.z1;
    out[0] = p.cx + (ux[i] * 2 - 1) * PLAZA.hw; out[1] = lerp(PLAZA.z0, z1, uz[i]);
  }
}
const tgt = [0, 0];

function writeMatrix(i) {
  const o = i * 16;
  mArr[o] = sc[i]; mArr[o + 5] = sc[i]; mArr[o + 10] = sc[i]; mArr[o + 15] = 1;
  mArr[o + 12] = px[i]; mArr[o + 14] = pz[i];
}

function paint() {
  const st = model.state;
  for (let i = 0; i < N; i++) {
    const s = st[i];
    const c = s === I ? (model.isolating(i) ? LIN.Q : LIN.I)
      : s === R ? LIN.R : s === V ? LIN.V : LIN.S;
    cArr[i * 3] = c.r; cArr[i * 3 + 1] = c.g; cArr[i * 3 + 2] = c.b;
  }
  agentMesh.instanceColor.needsUpdate = true;
  if (showHeat.value) {
    model.buildingInfected(bInf);
    for (let b = 0; b < nB; b++) roofMesh.setColorAt(b, tmpC.copy(ROOF).lerp(ROOF_HOT, Math.min(1, bInf[b] / 4)));
    roofMesh.instanceColor.needsUpdate = true;
  }
}

function snapAll() {
  for (let i = 0; i < N; i++) {
    target(i, tgt); px[i] = tgt[0]; pz[i] = tgt[1];
    writeMatrix(i);
  }
  agentMesh.instanceMatrix.needsUpdate = true;
}

// --- Arayüz ---
const ui = sim.ui;
// not: ui.text(…, 'card') ana sayfanın .card (flex sütun) kuralını da alıyor; içerik tek <div> içine sarılır
const card = (h) => `<div>${h}</div>`;
ui.text(card(`<span style="color:#facc15">●</span> Hassas &nbsp;<span style="color:#ef4444">●</span> Enfekte &nbsp;<span style="color:#9ca3af">●</span> İyileşmiş &nbsp;<span style="color:#3b82f6">●</span> Aşılı`), 'card');
ui.section('Hazır senaryolar');
const PRESETS = {
  onlemsiz: { vacc: 0, mask: 0, mobility: 100, contacts: 8, quarantine: false, schools: false },
  maske: { vacc: 0, mask: 80, mobility: 100, contacts: 5, quarantine: false, schools: false },
  asi: { vacc: 70, mask: 0, mobility: 100, contacts: 8, quarantine: false, schools: false },
  kapanma: { vacc: 0, mask: 30, mobility: 50, contacts: 8, quarantine: true, schools: true },
};
const presetText = ui.text('', 'card');
const PRESET_DESC = {
  onlemsiz: '<b>Önlemsiz:</b> herkes her gün dışarı çıkıyor, maske ve aşı yok.',
  maske: '<b>Maske + mesafe:</b> %80 maske, günlük temas 8 yerine 5.',
  asi: '<b>%70 aşı:</b> nüfusun %70\'i aşılı, başka önlem yok.',
  kapanma: '<b>Kapanma:</b> okullar kapalı, belirtili hastalar evde, yetişkinlerin yarısı evden çalışıyor.',
};
function applyPreset(k) {
  const s = PRESETS[k];
  vacc.set(s.vacc); mask.set(s.mask); mobility.set(s.mobility); contacts.set(s.contacts);
  quarantine.set(s.quarantine); schools.set(s.schools);
  presetText.set(card(PRESET_DESC[k]));
  syncParams();
  restart();
}
ui.buttons([
  { label: '🚫 Önlemsiz', onClick: () => applyPreset('onlemsiz') },
  { label: '😷 Maske + mesafe', onClick: () => applyPreset('maske') },
  { label: '💉 %70 aşı', onClick: () => applyPreset('asi') },
  { label: '🏠 Kapanma', onClick: () => applyPreset('kapanma') },
]);

ui.section('Önlemler');
const vacc = ui.slider({ label: 'Aşı oranı', min: 0, max: 95, step: 5, value: 0, unit: '%', onChange: () => { syncParams(); model.applyVaccination(); paint(); updateStats(); } });
const ve = ui.slider({ label: 'Aşı etkinliği (enfeksiyona karşı)', min: 0, max: 100, step: 5, value: 80, unit: '%', onChange: () => syncParams() });
const mask = ui.slider({ label: 'Maske kullanımı', min: 0, max: 100, step: 5, value: 0, unit: '%', onChange: () => syncParams() });
const mobility = ui.slider({ label: 'Hareketlilik (dışarı çıkan yetişkin)', min: 10, max: 100, step: 5, value: 100, unit: '%', onChange: () => syncParams() });
const quarantine = ui.toggle({ label: 'Karantina (belirtili hastalar evde)', value: false, onChange: () => { syncParams(); paint(); } });
const schools = ui.toggle({ label: 'Okullar kapalı', value: false, onChange: () => syncParams() });

ui.section('Hastalık');
const contacts = ui.slider({ label: 'Günlük temas (ev dışında)', min: 1, max: 20, step: 1, value: 8, unit: 'kişi', onChange: () => syncParams() });
const beta = ui.slider({ label: 'Bulaşma olasılığı (temas başına)', min: 1, max: 15, step: 0.5, value: 4, unit: '%', onChange: () => syncParams() });
const duration = ui.slider({ label: 'Hastalık süresi', min: 3, max: 21, step: 1, value: 8, unit: 'gün', onChange: () => syncParams() });
const capacity = ui.slider({ label: 'Hastane kapasitesi', min: 2, max: 40, step: 1, value: 8, unit: 'yatak', onChange: () => { syncParams(); updateStats(); } });
ui.buttons([
  { label: '🦠 +5 vaka', variant: 'danger', onClick: () => { model.seed(5); resumeAfterEnd(); paint(); } },
  { label: '⟲ Yeniden başlat', variant: 'primary', onClick: () => restart() },
]);
ui.text('İpucu: bir apartmana tıkla → orada yeni vaka başlar.');

ui.section('Durum');
const stDay = ui.stat({ label: 'Gün' });
const stI = ui.stat({ label: 'Anlık vaka' });
const stPeak = ui.stat({ label: 'Zirve (gün)' });
const stR = ui.stat({ label: 'Efektif R' });
const stTot = ui.stat({ label: 'Toplam enfekte', unit: '%' });
const stHosp = ui.stat({ label: 'Hastane (dolu / yatak)' });
const chart = ui.chart({
  title: 'Kişi sayısı — günlük', maxPoints: 200, yMin: 0, yMax: N,
  series: [{ name: 'Hassas', color: '#facc15' }, { name: 'Enfekte', color: '#ef4444', fill: true }, { name: 'İyileşmiş', color: '#9ca3af' }, { name: 'Aşılı', color: '#3b82f6' }],
});
const hChart = ui.chart({
  title: 'Hastane: ağır hasta ve kapasite', maxPoints: 200, yMin: 0, height: 90,
  series: [{ name: 'Yatan', color: '#f97316', fill: true }, { name: 'Yatak bulamayan', color: '#ef4444' }, { name: 'Kapasite', color: '#e5e7eb' }],
});
const note = ui.text('', 'card');

ui.section('Görünüm', { open: false });
const showHeat = ui.toggle({ label: 'Çatılarda vaka yoğunluğu', value: true, onChange: (v) => {
  if (!v) { for (let b = 0; b < nB; b++) roofMesh.setColorAt(b, ROOF); roofMesh.instanceColor.needsUpdate = true; }
  paint();
} });
ui.toggle({ label: 'Mekân etiketleri', value: true, onChange: (v) => PLACES.forEach((p) => (p.label.visible = v)) });
const dayNight = ui.toggle({ label: 'Gece–gündüz ışığı', value: true });

function syncParams() {
  Object.assign(model.p, {
    vacc: vacc.value / 100, ve: ve.value / 100, mask: mask.value / 100, mobility: mobility.value / 100,
    contacts: contacts.value, beta: beta.value / 100, duration: duration.value, capacity: capacity.value,
    quarantine: quarantine.value, schoolsClosed: schools.value,
  });
  PLACES[0].label.setText(schools.value ? '🏫 Okul (kapalı)' : '🏫 Okul');
}

function pushCharts() {
  const c = model.counts;
  chart.push([c[S], c[I], c[R], c[V]]);
  hChart.push([model.hospCount, model.unmet, model.p.capacity]);
}

function updateStats() {
  const c = model.counts;
  stDay.set(model.day + 1);
  stI.set(c[I], c[I] > N * 0.15 ? 'bad' : c[I] ? 'warn' : 'good');
  stPeak.set(`${fmt(model.peak)} (${model.peakDay + 1})`);
  stR.set(isFinite(model.rt) ? fmt(model.rt, 2) : '—', !isFinite(model.rt) ? '' : model.rt > 1 ? 'bad' : 'good');
  stTot.set(fmt((model.totalInf / N) * 100, 1));
  stHosp.set(`${model.hospCount}/${model.p.capacity}`, model.unmet ? 'bad' : model.hospCount >= model.p.capacity * 0.75 ? 'warn' : 'good');
  PLACES[4].label.setText(`🏥 Hastane · ${model.hospCount}/${model.p.capacity} yatak`);
  const immune = (c[R] + c[V]) / N;
  note.set(card(model.unmet
    ? `<b style="color:var(--bad)">⚠ Hastane dolu!</b> ${model.unmet} ağır hasta yatak bulamıyor. Toplam ${model.overDays} gün kapasite aşıldı.`
    : `Bağışık oranı (iyileşmiş + aşılı): <b>${fmt(immune * 100, 0)}%</b>. ${model.overDays ? `Kapasite ${model.overDays} gün aşıldı.` : 'Hastane şimdiye kadar taşmadı.'}`));
}

let acc = 0;
function restart() {
  syncParams();
  model.reset(4);
  acc = 0;
  chart.clear(); hChart.clear();
  pushCharts();
  sim.hud.hide();
  setScales();
  paint();
  snapAll();
  updateStats();
}

function resumeAfterEnd() { if (!model.ended) sim.hud.hide(); updateStats(); }

function showEnd() {
  const tot = model.totalInf / N;
  sim.hud.show(`<h2>Salgın ${model.day + 1}. günde sona erdi</h2>
    Nüfusun <b>%${fmt(tot * 100, 0)}</b>'i enfekte oldu · zirvede aynı anda <b>${fmt(model.peak)}</b> vaka (${model.peakDay + 1}. gün)<br>
    ${model.overDays ? `Hastane kapasitesi <b>${model.overDays} gün</b> aşıldı.` : 'Hastane kapasitesi hiç aşılmadı. 👏'}
    <br><button class="btn primary" data-act="again">⟲ Yeniden başlat</button>`, { tone: tot > 0.5 || model.overDays ? 'bad' : 'good' });
  sim.hud.el.querySelector('[data-act="again"]').onclick = () => restart();
}

// --- Döngü ---
const hemi = sim.scene.userData.hemi, sun = sim.scene.userData.sun;
const BG_DAY = new THREE.Color(0x13213b), BG_NIGHT = new THREE.Color(0x060a14);
sim.onUpdate((dt) => {
  if (model.ended) return;
  acc += (dt / DAY_SEC) * TICKS;
  let guard = 0;
  while (acc >= 1 && guard++ < 12) {
    acc -= 1;
    const dayEnd = model.tick();
    if (dayEnd) { pushCharts(); if (model.ended) { showEnd(); break; } }
  }
  if (guard > 0) { paint(); updateStats(); }
  // yürüyüş: hedef konuma üstel yaklaşım
  const a = 1 - Math.exp(-dt * 7);
  for (let i = 0; i < N; i++) {
    target(i, tgt);
    px[i] += (tgt[0] - px[i]) * a; pz[i] += (tgt[1] - pz[i]) * a;
    writeMatrix(i);
  }
  agentMesh.instanceMatrix.needsUpdate = true;
});

sim.onRender(() => {
  const h = model.hour * 2 + (acc % 1) * 2;
  const dayF = dayNight.value ? Math.max(0, Math.sin(((h - 6) / 24) * Math.PI * 2)) : 1;
  hemi.intensity = 0.75 + 0.65 * dayF;
  sun.intensity = 0.5 + 1.7 * dayF;
  sim.scene.background.copy(BG_NIGHT).lerp(BG_DAY, dayF);
});

// Tıklama: kişi → bilgi; apartman → yeni vaka
const AGE = ['Çocuk', 'Yetişkin', 'Yaşlı'];
const STN = ['Hassas', 'Enfekte', 'İyileşmiş', 'Aşılı'];
sim.onClick([agentMesh, bldMesh, roofMesh], (hit) => {
  const id = hit.instanceId;
  if (id == null) return;
  if (hit.object === agentMesh) {
    const s = model.state[id];
    let msg = `<b>${AGE[model.age[id]]}</b> · ${STN[s] || ''}`;
    if (s === I) msg += model.hosp[id] ? ' · 🏥 hastanede' : model.isolating(id) ? ' · 🏠 evde izole' : model.symp[id] ? ' · belirtili' : ' · belirtisiz';
    if (s === I || s === R) msg += ` · ${model.sec[id]} kişiye bulaştırdı`;
    sim.toast(msg, s === I ? 'bad' : s === V ? 'good' : '');
    return;
  }
  const n = model.seed(1, id);
  if (n) { resumeAfterEnd(); paint(); sim.toast(`🏠 ${id + 1}. apartmanda yeni vaka`, 'warn'); }
  else sim.toast('Bu apartmanda enfekte edilebilecek kimse kalmadı', 'good');
});

// başlangıç
for (let i = 0; i < N; i++) {
  ux[i] = Math.random(); uz[i] = Math.random();
  mArr.fill(0, i * 16, i * 16 + 16);
}
function setScales() { for (let i = 0; i < N; i++) sc[i] = model.age[i] === 0 ? 0.72 : model.age[i] === 2 ? 0.9 : 1; }
sim.onReset(() => restart());
presetText.set(card(PRESET_DESC.onlemsiz));
restart();
sim.toast('Bir apartmana tıkla: oraya yeni bir vaka gelir', '');
