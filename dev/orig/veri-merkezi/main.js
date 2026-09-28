// Yapay Zekâ Veri Merkezi — BT yükü, PUE, buharlaşmalı soğutmanın su tüketimi, şebeke karbon yoğunluğu ve eşdeğerler.
import { createSim, THREE, fmt, clamp, rand, seeded, heatColor, instanced, smoothstep } from '@core';
import { COOLING, GRIDS, overheads, pue, wue, facility } from './model.js';
import { xyPlot } from './plot.js';

const ROWS = 6, PER_ROW = 14, NR = ROWS * PER_ROW;
const RW = 0.6, RD = 1.2, RH = 2.2; // raf boyutu (m)
const AISLE = 1.2;
const HALL_H = 4.5;
const NAIR = 900, NVAP = 500;
const HOUSE_KWH = 10791; // EIA: ABD ortalama konut aboneliği, 2022
const GEMINI_WH = 0.24; // Google (2025): medyan Gemini Apps metin istemi
const IEA_2024 = 415, IEA_2030 = 945; // TWh

const sim = createSim({
  background: 0x0b1220,
  camera: { position: [-18, 20, 25], target: [0.3, 1.5, -1], fov: 50 },
  controls: { maxDistance: 120, minDistance: 5 },
  fog: [70, 180],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bir veri merkezi salonunun kesiti. Raflardaki sunucular (yapay zekâ raflarında GPU'lar) çektikleri elektriğin
    <b>neredeyse tamamını ısıya</b> çevirir. Soğuk hava raf önündeki <b>soğuk koridordan</b> girer, ısınıp arkadaki
    <b>sıcak koridora</b> çıkar. Isı dışarı ya kompresörlü soğutucularla (chiller), ya serin dış havayla, ya da su
    <b>buharlaştırılarak</b> (soğutma kulesi) atılır. Sıvı soğutmada su, doğrudan çiplerin üstündeki plakalardan geçer.</p>
    <p><b>PUE</b> = tesisin toplam gücü / BT (sunucu) gücü. 1,0 ideal: tüm enerji hesaplamaya gider. Fazlası soğutma ve
    elektrik dağıtım kayıplarıdır. <b>WUE</b> = tesiste harcanan su (L) / BT enerjisi (kWh). 1 kWh ısıyı yalnız buharlaşmayla
    atmak için ≈ 1,5 L su buharlaşır (suyun buharlaşma ısısı ≈ 2,4 MJ/kg); kule tuzlanmasın diye atılan blöf suyu bunu artırır.</p>
    <h3>Dene</h3>
    <ul>
      <li>Soğutmayı "Buharlaşmalı" yap, sıcaklığı 10 °C'den 35 °C'ye çıkar: PUE az değişir ama su tüketimi hızla artar.</li>
      <li>Aynı tesisi Polonya ve Norveç şebekesine bağla: elektrik aynı, CO₂ yaklaşık 20 kat farklı.</li>
      <li>"Yapay zekâ eğitim kampüsü": yıllık tüketim kaç ABD hanesine eşit? Dünya veri merkezi tüketiminin yüzde kaçı?</li>
      <li>Kullanım oranını düşür: boşta bekleyen sunucular da elektrik çeker.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p><small>Soğutma katsayıları, chiller verimi (COP), boştaki sunucu gücü (%35) ve raf güçleri (klasik ≈ 8 kW, yapay zekâ ≈
    60 kW) <b>temsilîdir</b>; gerçek tesisler tasarıma, neme ve iklime göre çok farklıdır. Dış sıcaklık yıl boyu sabit kabul
    edilir; nem ve yaş termometre sıcaklığı modellenmez. Su yalnız tesis içi (doğrudan) sudur; elektrik üreten santrallerin
    dolaylı su tüketimi dahil değildir. Karbon, şebeke ortalamasıyla hesaplanır; yenilenebilir enerji anlaşmaları ve
    yedek jeneratörler dahil değildir.</small></p>
    <h3>Kaynaklar</h3>
    <p><small>• IEA, <i>Energy and AI</i> (2025): veri merkezleri 2024'te ≈ 415 TWh (dünya elektriğinin ≈ %1,5) tüketti;
    2030'da ≈ 945 TWh'ye çıkması bekleniyor. iea.org/reports/energy-and-ai<br>
    • Uptime Institute, <i>Global Data Center Survey 2024</i>: sektör ortalama PUE ≈ 1,56; beş yıldır neredeyse sabit;
    yeni tesisler çoğunlukla ≈ 1,3 ve altı. uptimeinstitute.com<br>
    • Şebeke karbon yoğunluğu: Ember (2026), Our World in Data aracılığıyla, 2024 yılı, yaşam döngüsü gCO₂e/kWh.
    ourworldindata.org/grapher/carbon-intensity-electricity<br>
    • Hane eşdeğeri: ABD EIA, 2022'de ortalama konut aboneliği yıllık 10.791 kWh. eia.gov/tools/faqs/faq.php?id=97<br>
    • Yapay zekâ sorgusu: Google (Ağustos 2025), medyan Gemini Apps metin istemi ≈ 0,24 Wh (veri merkezi ek yükleri dahil).
    Başka modeller, uzun yanıtlar, görsel/video üretimi ve farklı yöntemler için tahminler çok geniş bir aralıkta değişir;
    bu sayı yalnız bir şirketin kendi ölçümüdür. cloud.google.com/blog</small></p>`,
});

const scene = sim.scene;
scene.add(new THREE.AmbientLight(0x6070a0, 0.5));

// --- Zemin ve salon ---
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

const rowZ = [];
{
  // Düzen: S R0 H R1 S R2 H R3 S R4 H R5 S  (S = soğuk koridor, H = sıcak koridor)
  let z = AISLE;
  for (let r = 0; r < ROWS; r++) { rowZ.push(z + RD / 2); z += RD + AISLE; }
}
const HALL_W = PER_ROW * RW + 4, HALL_D = rowZ[ROWS - 1] + RD / 2 + AISLE;
const Z0 = -HALL_D / 2, X0 = -(PER_ROW * RW) / 2;
const hall = new THREE.Group();
scene.add(hall);
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, HALL_D), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  hall.add(floor);
  const wallM = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9, transparent: true, opacity: 0.85 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, HALL_H, 0.2), wallM);
  back.position.set(0, HALL_H / 2, Z0 - 0.1);
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, HALL_H, HALL_D), wallM);
  side.position.set(HALL_W / 2 + 0.1, HALL_H / 2, 0);
  hall.add(back, side);
  // koridor şeritleri
  for (let a = 0; a <= ROWS; a++) {
    const zc = Z0 + (a === 0 ? AISLE / 2 : rowZ[a - 1] + RD / 2 + AISLE / 2);
    const cold = a % 2 === 0;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(PER_ROW * RW, AISLE * 0.9), new THREE.MeshBasicMaterial({ color: cold ? 0x1d4ed8 : 0xb91c1c, transparent: true, opacity: 0.35 }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.02, zc);
    hall.add(strip);
  }
}

// --- Raflar ---
const rackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.4 });
const racks = instanced(new THREE.BoxGeometry(RW * 0.94, RH, RD), rackMat, NR);
const ledGeo = new THREE.PlaneGeometry(RW * 0.8, RH * 0.85);
const leds = instanced(ledGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), NR);
const tops = instanced(new THREE.BoxGeometry(RW * 0.94, 0.06, RD * 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }), NR);
hall.add(racks, leds, tops);
const rackInfo = [];
{
  const rnd = seeded(3), M = new THREE.Matrix4(), R = new THREE.Matrix4();
  for (let r = 0; r < ROWS; r++) {
    const facesNeg = r % 2 === 0; // ön yüz soğuk koridora bakar
    for (let i = 0; i < PER_ROW; i++) {
      const k = r * PER_ROW + i;
      const x = X0 + (i + 0.5) * RW, z = Z0 + rowZ[r];
      M.makeTranslation(x, RH / 2, z); racks.setMatrixAt(k, M);
      M.makeTranslation(x, RH / 2 + 0.05, z + (facesNeg ? -1 : 1) * (RD / 2 + 0.005));
      R.makeRotationY(facesNeg ? Math.PI : 0);
      leds.setMatrixAt(k, M.multiply(R));
      M.makeTranslation(x, RH + 0.03, z); tops.setMatrixAt(k, M);
      rackInfo.push({ x, z, facesNeg, h: rnd(), ph: rnd() * 6.28 });
    }
  }
}

// Sıvı soğutma boruları (satır üstünde)
const pipeMat = new THREE.MeshStandardMaterial({ color: 0x0e7490, emissive: 0x06b6d4, emissiveIntensity: 0.5, roughness: 0.4 });
const pipes = new THREE.Group();
for (let r = 0; r < ROWS; r++) {
  for (const dz of [-0.2, 0.2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, PER_ROW * RW + 2, 8), pipeMat);
    p.rotation.z = Math.PI / 2;
    p.position.set(1, RH + 0.25, Z0 + rowZ[r] + dz);
    pipes.add(p);
  }
}
{
  const cdu = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2, 1.6), new THREE.MeshStandardMaterial({ color: 0x0891b2 }));
  cdu.position.set(X0 + PER_ROW * RW + 1.3, 1, 0);
  pipes.add(cdu);
}
hall.add(pipes);

// Hava soğutma üniteleri (CRAH) arka duvar boyunca
const crahs = new THREE.Group();
for (let a = 0; a <= ROWS; a += 2) {
  const u = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
  const zc = Z0 + (a === 0 ? AISLE / 2 : rowZ[a - 1] + RD / 2 + AISLE / 2);
  u.position.set(X0 - 1.1, 1.1, zc);
  crahs.add(u);
}
hall.add(crahs);

// --- Hava akış parçacıkları ---
const airPos = new Float32Array(NAIR * 3), airCol = new Float32Array(NAIR * 3);
const airGeo = new THREE.BufferGeometry();
airGeo.setAttribute('position', new THREE.BufferAttribute(airPos, 3));
airGeo.setAttribute('color', new THREE.BufferAttribute(airCol, 3));
const air = new THREE.Points(airGeo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
air.frustumCulled = false;
hall.add(air);
const airS = new Float32Array(NAIR), airRack = new Uint16Array(NAIR), airH = new Float32Array(NAIR), airDx = new Float32Array(NAIR);
function spawnAir(i) {
  airS[i] = Math.random() * 0.2;
  airRack[i] = Math.floor(Math.random() * NR);
  airH[i] = rand(0.25, RH - 0.15);
  airDx[i] = rand(-RW / 2, RW / 2);
}
for (let i = 0; i < NAIR; i++) { spawnAir(i); airS[i] = Math.random(); }

// --- Dış tesisler: soğutma kulesi, chiller, trafo merkezi ---
const outside = new THREE.Group();
scene.add(outside);
const TOWER_POS = new THREE.Vector3(HALL_W / 2 + 6, 0, -5);
{
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const y = (i / 16) * 9;
    pts.push(new THREE.Vector2(2.2 + 1.3 * Math.pow((y - 6) / 6, 2), y));
  }
  const tower = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshStandardMaterial({ color: 0xa8b3c2, roughness: 0.9, side: THREE.DoubleSide }));
  tower.position.copy(TOWER_POS);
  outside.add(tower);
}
const vapPos = new Float32Array(NVAP * 3), vapAge = new Float32Array(NVAP);
const vapGeo = new THREE.BufferGeometry();
vapGeo.setAttribute('position', new THREE.BufferAttribute(vapPos, 3));
const vapor = new THREE.Points(vapGeo, new THREE.PointsMaterial({ color: 0xf1f5f9, size: 1.4, transparent: true, opacity: 0.45, depthWrite: false }));
vapor.frustumCulled = false;
outside.add(vapor);
for (let i = 0; i < NVAP; i++) { vapAge[i] = Math.random() * 6; vapPos[i * 3 + 1] = -100; }

const chillers = new THREE.Group();
const fans = [];
for (let i = 0; i < 3; i++) {
  const c = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 2), new THREE.MeshStandardMaterial({ color: 0x64748b }));
  c.position.set(HALL_W / 2 + 3 + i * 3.6, 0.8, HALL_D / 2 + 3);
  const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
  fan.position.set(0, 0.85, 0);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.18), new THREE.MeshStandardMaterial({ color: 0xcbd5e1 }));
  blade.position.y = 0.06;
  fan.add(blade);
  c.add(fan);
  fans.push(fan);
  chillers.add(c);
}
outside.add(chillers);

const substation = new THREE.Group();
substation.position.set(-HALL_W / 2 - 5, 0, -6);
{
  const tr = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.2), new THREE.MeshStandardMaterial({ color: 0x475569 }));
  tr.position.y = 1.2;
  substation.add(tr);
  for (const dx of [-0.8, 0, 0.8]) {
    const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xb45309 }));
    ins.position.set(dx, 2.85, 0);
    substation.add(ins);
  }
  // direkler ve hat
  const poleM = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
  for (let k = 1; k <= 3; k++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 10, 6), poleM);
    p.position.set(-k * 14, 5, -k * 6);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 0.15), poleM);
    arm.position.set(-k * 14, 9.6, -k * 6);
    substation.add(p, arm);
  }
}
outside.add(substation);
const lineMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.8 });
{
  const pts = [new THREE.Vector3(0, 3.2, 0)];
  for (let k = 1; k <= 3; k++) pts.push(new THREE.Vector3(-k * 14, 9.6, -k * 6));
  substation.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  const feed = [new THREE.Vector3(1.5, 2, 0), new THREE.Vector3(5, 3.8, 4)];
  substation.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(feed), lineMat));
}

// Etiketler
const lblCold = sim.label('Soğuk koridor', { parent: hall, position: [X0 + 1.5, 0.2, Z0 + rowZ[ROWS - 1] + RD / 2 + AISLE / 2], className: 'plain' });
const lblHot = sim.label('Sıcak koridor', { parent: hall, position: [X0 + PER_ROW * RW + 0.3, 2.6, Z0 + rowZ[0] + RD / 2 + AISLE / 2], className: 'plain' });
const lblTower = sim.label('', { parent: outside, position: [TOWER_POS.x + 4.5, 5.5, TOWER_POS.z + 1] });
const lblGrid = sim.label('', { parent: substation, position: [0, 4.2, 0] });
const lblHall = sim.label('', { parent: hall, position: [0, HALL_H + 0.8, Z0] });
const lblChill = sim.label('Chiller', { parent: chillers, position: [HALL_W / 2 + 6.6, 2.6, HALL_D / 2 + 3], className: 'plain' });

// --- Durum ---
const st = { itMW: 50, ai: 50, util: 70, type: 'klasik', T: 20, grid: 'wld', g: 471 };
let res = null;
const gridName = () => (GRIDS.find((x) => x.value === st.grid) || {}).label?.split(' — ')[0] || 'Özel';

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır ayarlar');
const PRESETS = {
  varsayilan: { itMW: 50, ai: 50, util: 70, type: 'klasik', T: 20, grid: 'wld' },
  kurumsal: { itMW: 5, ai: 5, util: 35, type: 'klasik', T: 18, grid: 'tur' },
  kampus: { itMW: 300, ai: 90, util: 80, type: 'sivi', T: 20, grid: 'usa' },
  kurak: { itMW: 100, ai: 60, util: 70, type: 'evap', T: 32, grid: 'wld' },
  kuzey: { itMW: 50, ai: 50, util: 70, type: 'serbest', T: 5, grid: 'nor' },
};
ui.buttons([{ label: '🏢 Klasik kurumsal', onClick: () => preset('kurumsal') }, { label: '🧠 YZ eğitim kampüsü', onClick: () => preset('kampus') }]);
ui.buttons([{ label: '🏜️ Sıcak-kurak, buharlaşmalı', onClick: () => preset('kurak') }, { label: '❄️ Kuzey, serbest soğutma', onClick: () => preset('kuzey') }]);

ui.section('Tesis');
const sIT = ui.slider({ label: 'Kurulu BT gücü', min: 1, max: 500, step: 1, value: st.itMW, unit: 'MW', onInput: (v) => { st.itMW = v; update(); } });
const sAI = ui.slider({ label: 'Yapay zekâ (GPU) iş yükü payı', min: 0, max: 100, step: 5, value: st.ai, unit: '%', onInput: (v) => { st.ai = v; update(); paintRacks(); } });
const sUtil = ui.slider({ label: 'Ortalama kullanım oranı', min: 5, max: 100, step: 5, value: st.util, unit: '%', onInput: (v) => { st.util = v; update(); } });

ui.section('Soğutma ve iklim');
const selCool = ui.select({ label: 'Soğutma türü', options: Object.entries(COOLING).map(([k, c]) => ({ value: k, label: c.name })), value: st.type, onChange: (v) => { st.type = v; update(); } });
const sT = ui.slider({ label: 'Dış hava sıcaklığı (yıl boyu sabit)', min: -5, max: 42, step: 1, value: st.T, unit: '°C', onInput: (v) => { st.T = v; update(); } });

ui.section('Şebeke');
const selGrid = ui.select({ label: 'Elektrik şebekesi (gCO₂e/kWh, 2024)', options: GRIDS.map((g) => ({ value: g.value, label: g.label })), value: st.grid,
  onChange: (v) => { st.grid = v; const g = GRIDS.find((x) => x.value === v); if (g.g != null) { st.g = g.g; sG.set(g.g); } update(); } });
const sG = ui.slider({ label: 'Karbon yoğunluğu', min: 0, max: 900, step: 5, value: st.g, unit: 'g/kWh', onInput: (v) => { st.g = v; st.grid = 'ozel'; selGrid.set('ozel'); update(); } });

ui.section('Sonuçlar');
const stIT = ui.stat({ label: 'BT gücü (ortalama)', unit: 'MW' });
const stTot = ui.stat({ label: 'Tesis gücü (şebekeden)', unit: 'MW' });
const stPUE = ui.stat({ label: 'PUE' });
const stWUE = ui.stat({ label: 'WUE', unit: 'L/kWh' });
const stE = ui.stat({ label: 'Yıllık elektrik', unit: 'GWh' });
const stW = ui.stat({ label: 'Yıllık su (tesis)', unit: 'bin m³' });
const stC = ui.stat({ label: 'Yıllık CO₂e', unit: 'bin ton' });
const stHH = ui.stat({ label: 'ABD hanesi eşdeğeri' });
const mIT = ui.meter({ label: 'BT (hesaplama)', color: '#38bdf8' });
const mCool = ui.meter({ label: 'Soğutma', color: '#f97316' });
const mDist = ui.meter({ label: 'Elektrik dağıtım kaybı (UPS, trafo)', color: '#facc15' });
const mMisc = ui.meter({ label: 'Aydınlatma, ofis vb.', color: '#94a3b8' });
const notes = ui.text('', 'card');
const puePlot = xyPlot(ui, { title: 'PUE – dış sıcaklık (dört soğutma türü)', height: 140, xFmt: (v) => `${fmt(v, 0)}°`, yFmt: (v) => fmt(v, 2),
  legend: [{ name: 'Klasik hava', color: '#f97316' }, { name: 'Serbest', color: '#22c55e' }, { name: 'Buharlaşmalı', color: '#38bdf8' }, { name: 'Sıvı', color: '#a78bfa' }, { name: 'Uptime ort. 1,56', color: '#f87171' }] });
const wuePlot = xyPlot(ui, { title: 'Buharlaşmalı soğutmada su – sıcaklık (L/kWh)', height: 110, xFmt: (v) => `${fmt(v, 0)}°`, yFmt: (v) => fmt(v, 1),
  legend: [{ name: 'WUE', color: '#38bdf8' }, { name: 'şu an', color: '#facc15' }] });

ui.section('Bağlam: dünya ve yapay zekâ');
const ctx = ui.text('', '');

ui.section('Görünüm', { open: false });
const tAir = ui.toggle({ label: 'Hava akışı', value: true, onChange: (v) => (air.visible = v) });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => [lblCold, lblHot, lblTower, lblGrid, lblHall, lblChill].forEach((l) => (l.visible = v)) });

// --- Hesap ve görselleştirme ---
const COLORS = { klasik: '#f97316', serbest: '#22c55e', evap: '#38bdf8', sivi: '#a78bfa' };
let aiFlags = [];
function paintRacks() {
  aiFlags = rackInfo.map((r) => r.h < st.ai / 100);
  const c = new THREE.Color();
  aiFlags.forEach((ai, k) => tops.setColorAt(k, c.setHex(ai ? 0x7e22ce : 0x0369a1)));
  tops.instanceColor.needsUpdate = true;
}

function update() {
  res = facility({ itMW: st.itMW, ai: st.ai / 100, util: st.util / 100, type: st.type, T: st.T, g: st.g });
  stIT.set(fmt(res.itAvg, res.itAvg < 10 ? 1 : 0));
  stTot.set(fmt(res.total, res.total < 10 ? 1 : 0));
  stPUE.set(fmt(res.pue, 2), res.pue < 1.25 ? 'good' : res.pue > 1.5 ? 'bad' : 'warn');
  stWUE.set(fmt(res.wue, 2), res.wue > 1 ? 'bad' : res.wue > 0.3 ? 'warn' : 'good');
  stE.set(fmt(res.totMWh / 1000, res.totMWh < 10000 ? 1 : 0));
  stW.set(fmt(res.water / 1000, res.water < 10000 ? 1 : 0));
  stC.set(fmt(res.co2 / 1000, res.co2 < 10000 ? 1 : 0));
  const hh = (res.totMWh * 1000) / HOUSE_KWH;
  stHH.set(fmt(hh, 0));
  const tot = res.pue;
  mIT.set(1 / tot, `%${fmt(100 / tot, 0)}`);
  mCool.set(res.ov.cool / tot, `%${fmt((res.ov.cool / tot) * 100, 0)}`);
  mDist.set(res.ov.dist / tot, `%${fmt((res.ov.dist / tot) * 100, 0)}`);
  mMisc.set(res.ov.misc / tot, `%${fmt((res.ov.misc / tot) * 100, 0)}`);
  const warn = st.type === 'klasik' && st.ai >= 50
    ? '<br><b>Not:</b> Yüksek yoğunluklu GPU raflarını yalnız havayla soğutmak zorlaşır; yeni yapay zekâ tesislerinde sıvı soğutma yaygınlaşıyor.' : '';
  notes.set(`Raf sayısı ≈ <b>${fmt(res.racks, 0)}</b> (temsilî: klasik raf 8 kW, YZ rafı 60 kW; sahnedeki her raf ≈ ${fmt(res.racks / NR, res.racks / NR < 10 ? 1 : 0)} gerçek raf).
    Şebeke: ${gridName()}, ${fmt(st.g, 0)} gCO₂e/kWh.${warn}`);
  const share = (res.totMWh / 1e6 / IEA_2024) * 100;
  const queries = (res.totMWh * 1e6) / GEMINI_WH;
  ctx.set(`Bu tesis yılda <b>${fmt(res.totMWh / 1e6, 2)} TWh</b> kullanıyor: 2024'te dünyadaki tüm veri merkezlerinin tükettiği
    ≈ 415 TWh içindeki payı: <b>%${fmt(share, share < 0.1 ? 3 : 2)}</b> (IEA, 2025). IEA bu toplamın 2030'a kadar ≈ 945 TWh'ye çıkmasını bekliyor.<br><br>
    Aynı enerji, Google'ın kendi ölçümüne göre medyan bir Gemini metin istemi (≈ 0,24 Wh) ile yaklaşık
    <b>${queries >= 1e12 ? fmt(queries / 1e12, 1) + ' trilyon' : fmt(queries / 1e9, 0) + ' milyar'}</b> isteme karşılık gelir. Tahminler modele, yanıt uzunluğuna ve yönteme göre çok değişir.`);
  // Grafikler
  const series = Object.keys(COOLING).map((k) => {
    const pts = [];
    for (let T = -5; T <= 42; T += 1) pts.push([T, pue(k, T)]);
    return { pts, color: COLORS[k], width: k === st.type ? 2.6 : 1.3 };
  });
  puePlot.draw({ xMin: -5, xMax: 42, yMin: 1, yMax: 1.8, xTicks: 5, series,
    hlines: [{ y: 1.56, color: '#f87171', label: '' }], marks: [{ x: st.T, y: res.pue, color: '#facc15' }] });
  const wp = [];
  for (let T = -5; T <= 42; T += 1) wp.push([T, wue('evap', T)]);
  wuePlot.draw({ xMin: -5, xMax: 42, yMin: 0, yMax: 2.4, xTicks: 5, series: [{ pts: wp, color: '#38bdf8', fill: 0.12 }],
    marks: st.type === 'evap' ? [{ x: st.T, y: res.wue, color: '#facc15' }] : [] });
  // Sahne
  const liquid = st.type === 'sivi';
  pipes.visible = liquid;
  lblHall.setText(`BT ${fmt(res.itAvg, 1)} MW · tesis ${fmt(res.total, 1)} MW · PUE ${fmt(res.pue, 2)}`);
  lblTower.setText(st.type === 'evap' ? `Soğutma kulesi: ${fmt(res.water / 365, 0)} m³/gün su` : 'Soğutma kulesi (kullanılmıyor)');
  lblGrid.setText(`Şebeke: ${fmt(res.total, 1)} MW<br><small>${fmt(res.co2 / 8760, 1)} t CO₂e/saat</small>`);
}

function preset(name) {
  const p = PRESETS[name];
  Object.assign(st, p);
  const g = GRIDS.find((x) => x.value === p.grid);
  st.g = g.g;
  sIT.set(p.itMW); sAI.set(p.ai); sUtil.set(p.util); selCool.set(p.type); sT.set(p.T); selGrid.set(p.grid); sG.set(st.g);
  paintRacks();
  update();
}

// --- Döngü ---
const col = new THREE.Color(), cCold = new THREE.Color(0x60a5fa), cHot = new THREE.Color(0xef4444);
let tick = 0;
sim.onUpdate((dt, t) => {
  const util = st.util / 100;
  // raf ışıkları: yük + titreşim
  if (++tick % 3 === 0) {
    for (let k = 0; k < NR; k++) {
      const r = rackInfo[k];
      const base = aiFlags[k] ? 0.25 + 0.75 * util : 0.15 + 0.5 * util;
      const load = clamp(base + 0.12 * Math.sin(t * (aiFlags[k] ? 3 : 1.3) + r.ph), 0, 1);
      heatColor(load, col);
      if (aiFlags[k]) col.lerp(new THREE.Color(0xe879f9), 0.25);
      leds.setColorAt(k, col);
    }
    leds.instanceColor.needsUpdate = true;
  }
  // hava akışı: sıvı soğutmada ısının çoğu suya gider, hava akışı azalır
  const liquid = st.type === 'sivi';
  const flow = (0.15 + 0.25 * util) * (liquid ? 0.35 : 1);
  const active = liquid ? Math.floor(NAIR * 0.3) : NAIR;
  for (let i = 0; i < NAIR; i++) {
    if (i >= active) { airPos[i * 3 + 1] = -50; continue; }
    airS[i] += dt * flow;
    if (airS[i] >= 1) spawnAir(i);
    const s = airS[i], r = rackInfo[airRack[i]];
    const dir = r.facesNeg ? 1 : -1; // ön → arka yönü (+z ya da −z)
    const zFront = r.z - dir * (RD / 2 + AISLE * 0.45), zBack = r.z + dir * (RD / 2 + AISLE * 0.45);
    let x = r.x + airDx[i], y, z, heat;
    if (s < 0.3) { const u = s / 0.3; y = u * airH[i]; z = zFront; heat = 0; }
    else if (s < 0.6) { const u = (s - 0.3) / 0.3; y = airH[i]; z = zFront + (zBack - zFront) * u; heat = smoothstep(0.3, 0.7, u); }
    else { const u = (s - 0.6) / 0.4; y = airH[i] + (HALL_H - airH[i]) * u; z = zBack; heat = 1; }
    airPos[i * 3] = x; airPos[i * 3 + 1] = y; airPos[i * 3 + 2] = z;
    col.copy(cCold).lerp(cHot, heat);
    airCol[i * 3] = col.r; airCol[i * 3 + 1] = col.g; airCol[i * 3 + 2] = col.b;
  }
  airGeo.attributes.position.needsUpdate = true;
  airGeo.attributes.color.needsUpdate = true;
  // su buharı
  const evapRate = st.type === 'evap' ? clamp(res.wue / 2, 0.05, 1) : 0;
  const nV = Math.floor(NVAP * evapRate);
  for (let i = 0; i < NVAP; i++) {
    vapAge[i] += dt;
    if (i >= nV) { vapPos[i * 3 + 1] = -100; continue; }
    if (vapAge[i] > 6 || vapPos[i * 3 + 1] < 0) {
      vapAge[i] = Math.random() * 0.5;
      const a = Math.random() * 6.28, rr = Math.random() * 1.9;
      vapPos[i * 3] = TOWER_POS.x + Math.cos(a) * rr; vapPos[i * 3 + 1] = 9; vapPos[i * 3 + 2] = TOWER_POS.z + Math.sin(a) * rr;
    }
    const rx = (Math.sin(i * 12.9898) * 43758.5453) % 1, rz = (Math.sin(i * 78.233) * 12543.123) % 1;
    vapPos[i * 3] += dt * (0.5 + Math.abs(rx) * 0.8) * (0.4 + vapAge[i] * 0.3);
    vapPos[i * 3 + 1] += dt * (2.2 - vapAge[i] * 0.22);
    vapPos[i * 3 + 2] += dt * rz * (0.4 + vapAge[i] * 0.4);
  }
  vapGeo.attributes.position.needsUpdate = true;
  // chiller fanları: soğutma yüküyle
  const fanW = (st.type === 'klasik' ? 8 : st.type === 'serbest' ? 3 + 8 * smoothstep(12, 26, st.T) : st.type === 'sivi' ? 1 + 6 * smoothstep(30, 42, st.T) : 0.5) * (0.4 + util);
  fans.forEach((f) => (f.rotation.y += fanW * dt));
  lineMat.opacity = 0.5 + 0.4 * Math.sin(t * 4);
  pipeMat.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * 5);
});

sim.onReset(() => preset('varsayilan'));
for (let k = 0; k < NR; k++) { leds.setColorAt(k, col.setHex(0x22c55e)); tops.setColorAt(k, col.setHex(0x38bdf8)); }
preset('varsayilan');
