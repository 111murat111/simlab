// Elektrikli Araç — fizikten menzil (sürtünme, hava direnci, iklimlendirme, geri kazanım), CC-CV şarj eğrisi ve mahalle akşam yükü.
import { createSim, THREE, fmt, clamp, lerp, seeded, RoundedBoxGeometry, instanced } from '@core';
import { CARS, consumption, hvacPower, coldCapacity, airRho, chargePower, chargeTime, neighbourhood, houseLoad, ETA_DRIVE, ETA_REGEN, REGEN_MAX, AUX, ETA_AC, T0, STEP } from './model.js';
import { xyPlot } from './plot.js';

const STRAIGHT = 100, RAD = 25, ROADW = 8;
const PERIM = 2 * STRAIGHT + 2 * Math.PI * RAD;
const LIGHTS = [0.08, 0.42, 0.74]; // trafik ışıklarının yol üzerindeki konumu (0..1)
const HILL_A = 1.13; // m — %4 en büyük eğim (dalga boyu çevrenin yarısı)
const HILL_VIS = 3; // görsel abartma
const NB = { x0: -48, z0: -150, cols: 8, rows: 5, dx: 13, dz: 15 }; // mahalle ızgarası
const NVIS = NB.cols * NB.rows;
const MIN_PER_S = 1; // şarj: 1 s = 1 dakika
const MAH_H_PER_S = 0.2; // mahalle: 1 s = 12 dakika

const sim = createSim({
  background: 0x0f172a,
  camera: { position: [-34, 16, 58], target: [-16, 0, 25], fov: 50, far: 1500 },
  controls: { maxDistance: 400, minDistance: 8 },
  fog: [250, 700],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p><b>A · Sürüş:</b> Araç bir halka yolda döner. Batarya enerjisi dört yere gider: <b>hava direnci</b> ½·ρ·C<sub>d</sub>·A·v²
    (güç v³ ile artar!), <b>yuvarlanma direnci</b> C<sub>rr</sub>·m·g, <b>fren kaybı</b> (şehirde her duruşta ½·m·v² kinetik
    enerji; geri kazanımlı fren bunun bir kısmını bataryaya geri yazar) ve <b>iklimlendirme + elektronik</b>. İklimlendirme
    saatte sabit güç çektiği için yavaş şehir trafiğinde kilometre başına payı çok büyür.</p>
    <p><b>B · Şarj:</b> Şebekeden çekilen güç, şarj cihazının gücü ile bataryanın o anda kabul edebildiği gücün küçüğüdür.
    Batarya dolarken hücre gerilimi sınıra yaklaşır; <b>sabit akım → sabit gerilim (CC-CV)</b> geçişinde akım, dolayısıyla güç
    azalır. Bu yüzden hızlı şarjda %80'den sonrası uzun sürer; 7 kW'lık ev şarjında ise sınır cihazdadır ve eğri düzdür.</p>
    <p><b>C · Mahalle:</b> Herkes akşam 18:00 civarı eve gelip aracını aynı anda takarsa, zaten en yüksek olan akşam tüketimine
    araç şarjı eklenir. Zamanlayıcıyla 23:00'e ertelemek yeni bir zirve yaratabilir; <b>akıllı şarj</b> ise yükü gece boyunca
    en boş saatlere yayar, sabah 07:00'de araçlar yine dolu olur.</p>
    <h3>Dene</h3>
    <ul>
      <li>Otoyolda hızı 90'dan 130 km/h'ye çıkar: tüketim ve menzil nasıl değişiyor? Hava direnci kalemine bak.</li>
      <li>"Kışın şehir içi": ısıtmanın payı ne kadar? Isı pompasını aç.</li>
      <li>Şehir içinde geri kazanımlı freni kapat, sonra tepeli yolu seç.</li>
      <li>Şarjda DC 350 kW seç: 60 kWh'lik batarya bunu kullanabiliyor mu? Sıcaklığı 0 °C yap, sonra ön ısıtmayı aç.</li>
      <li>Mahallede EV oranını %100 yap, "Hemen", "23:00" ve "Akıllı" stratejilerinin zirvesini ve trafo sınırını karşılaştır.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p><small>Araç değerleri (kütle, C<sub>d</sub>, ön alan, C<sub>rr</sub>) sınıfını temsil eden yaklaşık değerlerdir, belirli bir
    modele ait değildir. Aktarma verimi %88, geri kazanım verimi %70, en çok 60 kW. Şehir döngüsü: her 400 m'de bir durup
    20 s bekleme. Kabin ısı kaybı ≈ 100 W/K, ısı pompası COP'u soğukta 1,3'e kadar düşer; soğukta kullanılabilir kapasite ve
    şarj kabulü azalır (temsilî katsayılar). Şarj eğrisi temsilî bir C-oranı eğrisidir (en çok ≈ 2C). Mahalle hane yük profili
    temsilîdir; ısıtma/soğutma talebi, şebeke gerilimi ve trafo ısınması modellenmez.</small></p>
    <h3>Güncel bağlam</h3>
    <p><small>IEA <i>Global EV Outlook 2025</i>: 2024'te dünyada 17 milyonun üzerinde elektrikli otomobil satıldı, satış payı
    %20'yi aştı. Çin'de otomobil satışlarının neredeyse yarısı elektrikliydi; Avrupa'da pay ≈ %20'de kaldı; ABD'de satılan her
    10 otomobilden 1'inden fazlası elektrikliydi. Kaynak: iea.org/reports/global-ev-outlook-2025 (IEA, 2025).</small></p>`,
});

// --- Sahne: zemin, yol ---
const scene = sim.scene;
scene.add(new THREE.AmbientLight(0x8090b0, 0.6));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x1f3a2a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);

let hills = false;
/** Yol üzerindeki nokta: d (m) → konum, yön */
function roadAt(d, out = new THREE.Vector3()) {
  d = ((d % PERIM) + PERIM) % PERIM;
  let x, z, ang;
  const half = STRAIGHT / 2, arc = Math.PI * RAD;
  if (d < STRAIGHT) { x = -half + d; z = RAD; ang = 0; }
  else if (d < STRAIGHT + arc) { const a = (d - STRAIGHT) / RAD; x = half + Math.sin(a) * RAD; z = Math.cos(a) * RAD; ang = a; }
  else if (d < 2 * STRAIGHT + arc) { x = half - (d - STRAIGHT - arc); z = -RAD; ang = Math.PI; }
  else { const a = (d - 2 * STRAIGHT - arc) / RAD; x = -half - Math.sin(a) * RAD; z = -Math.cos(a) * RAD; ang = Math.PI + a; }
  const y = hills ? HILL_A * HILL_VIS * Math.sin((4 * Math.PI * d) / PERIM) : 0;
  out.set(x, y, z);
  out.ang = ang;
  return out;
}
const roadMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
const lineMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
let road = null;
function buildRoad() {
  if (road) { road.traverse((o) => o.geometry?.dispose()); road.removeFromParent(); }
  road = new THREE.Group();
  const N = 240, pos = [], idx = [], dpos = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    roadAt((i / N) * PERIM, p);
    const nx = -Math.sin(p.ang), nz = -Math.cos(p.ang); // yola dik
    pos.push(p.x + nx * ROADW / 2, p.y + 0.02, p.z + nz * ROADW / 2, p.x - nx * ROADW / 2, p.y + 0.02, p.z - nz * ROADW / 2);
    if (i < N) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    if (i % 4 < 2) dpos.push(p.x, p.y + 0.05, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, roadMat);
  road.add(m);
  // Orta şerit kesikli çizgi
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3));
  road.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xe2e8f0, size: 0.5 })));
  scene.add(road);
  // trafik ışıkları yol yüksekliğine otursun
  lightPoles.forEach((lp, i) => { const q = roadAt(LIGHTS[i] * PERIM); lp.position.set(q.x - Math.sin(q.ang) * (ROADW / 2 + 1), q.y, q.z - Math.cos(q.ang) * (ROADW / 2 + 1)); lp.rotation.y = q.ang; });
}

// Trafik ışıkları
const lightPoles = LIGHTS.map(() => {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x475569 }));
  pole.position.y = 2.25;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), new THREE.MeshStandardMaterial({ color: 0x111827 }));
  box.position.y = 4.6;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  lamp.position.set(0, 4.6, 0.3);
  g.add(pole, box, lamp);
  g.userData.lamp = lamp;
  scene.add(g);
  return g;
});

// Ağaçlar (dekor)
{
  const rnd = seeded(7);
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2, 6), crown = new THREE.ConeGeometry(2, 5, 7);
  const tm = instanced(trunk, new THREE.MeshStandardMaterial({ color: 0x5b3a1e }), 60);
  const cm = instanced(crown, new THREE.MeshStandardMaterial({ color: 0x2f6b3a, flatShading: true }), 60);
  const M = new THREE.Matrix4();
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2, r = 85 + rnd() * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.7 + 10;
    M.makeTranslation(x, 1, z); tm.setMatrixAt(i, M);
    M.makeTranslation(x, 4.2, z); cm.setMatrixAt(i, M);
  }
  scene.add(tm, cm);
}

// --- Araç modeli ---
function makeCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(4.5, 0.9, 1.9, 3, 0.3), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 }));
  body.position.y = 0.75;
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.75, 1.7, 3, 0.3), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.5 }));
  cabin.position.set(-0.2, 1.45, 0);
  g.add(body, cabin);
  const wg = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14);
  wg.rotateX(Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ color: 0x111827 });
  g.userData.wheels = [];
  for (const [x, z] of [[1.45, 0.9], [1.45, -0.9], [-1.45, 0.9], [-1.45, -0.9]]) {
    const w = new THREE.Mesh(wg, wm);
    w.position.set(x, 0.38, z);
    g.add(w);
    g.userData.wheels.push(w);
  }
  const hl = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
  for (const z of [0.6, -0.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.4), hl); l.position.set(2.26, 0.85, z); g.add(l); }
  g.userData.body = body;
  return g;
}
const car = makeCar(CARS.kompakt.color);
scene.add(car);
const carLabel = sim.label('', { parent: car, position: [0, 3.2, 0] });

// --- Şarj istasyonu (halkanın içinde) ---
const station = new THREE.Group();
station.position.set(-12, 0, 2);
scene.add(station);
{
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 9), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
  canopy.position.y = 5;
  for (const [x, z] of [[-6.5, -4], [6.5, -4], [-6.5, 4], [6.5, 4]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 5, 8), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
    c.position.set(x, 2.5, z);
    station.add(c);
  }
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), new THREE.MeshStandardMaterial({ color: 0x475569 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  station.add(canopy, pad);
}
const postMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0ea5e9, emissiveIntensity: 0.4 });
const post = new THREE.Mesh(new RoundedBoxGeometry(0.8, 2, 0.6, 2, 0.15), postMat);
post.position.set(0, 1, -2.2);
station.add(post);
const cableMat = new THREE.MeshStandardMaterial({ color: 0x111827, emissive: 0x22c55e, emissiveIntensity: 0 });
const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1.4, -1.9), new THREE.Vector3(0.6, 0.4, -1.4), new THREE.Vector3(1.4, 0.6, -0.9), new THREE.Vector3(1.6, 0.95, -0.95),
]), 20, 0.07, 6), cableMat);
station.add(cable);
const PARK = new THREE.Vector3(-12 + 0, 0, 2 + 0); // araç park noktası (istasyon merkezi)

// --- Mahalle ---
const hood = new THREE.Group();
scene.add(hood);
const houseGeo = new THREE.BoxGeometry(7, 4, 6);
const roofGeo = new THREE.ConeGeometry(5.3, 2.6, 4);
roofGeo.rotateY(Math.PI / 4);
const winGeo = new THREE.PlaneGeometry(4.6, 1.3);
const houses = instanced(houseGeo, new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.9 }), NVIS);
const roofs = instanced(roofGeo, new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.8, flatShading: true }), NVIS);
const wins = instanced(winGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), NVIS);
const hoodCarGeo = new RoundedBoxGeometry(4.2, 1.4, 1.9, 2, 0.35);
const hoodCars = instanced(hoodCarGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), NVIS);
hood.add(houses, roofs, wins, hoodCars);
const hpos = [];
{
  const M = new THREE.Matrix4();
  for (let i = 0; i < NVIS; i++) {
    const c = i % NB.cols, r = Math.floor(i / NB.cols);
    const x = NB.x0 + c * NB.dx, z = NB.z0 + r * NB.dz;
    hpos.push([x, z]);
    M.makeTranslation(x, 2, z); houses.setMatrixAt(i, M);
    M.makeTranslation(x, 5.3, z); roofs.setMatrixAt(i, M);
    M.makeTranslation(x, 2.2, z + 3.01); wins.setMatrixAt(i, M);
  }
  // mahalle yolları
  const street = new THREE.MeshStandardMaterial({ color: 0x2b3444, roughness: 1 });
  for (let r = 0; r <= NB.rows; r++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(NB.cols * NB.dx + 10, 3.5), street);
    s.rotation.x = -Math.PI / 2;
    s.position.set(NB.x0 + ((NB.cols - 1) * NB.dx) / 2, 0.01, NB.z0 + r * NB.dz - 7.5 + 12.2);
    hood.add(s);
  }
  // trafo
  const tr = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3), new THREE.MeshStandardMaterial({ color: 0x64748b }));
  tr.position.set(NB.x0 + ((NB.cols - 1) * NB.dx) / 2, 1.5, NB.z0 - 11);
  hood.add(tr);
  hood.userData.trafo = tr;
}
const trafoLabel = sim.label('', { parent: hood.userData.trafo, position: [0, 4.2, 0] });
const hoodLabel = sim.label('', { position: [NB.x0 + ((NB.cols - 1) * NB.dx) / 2, 12, NB.z0 - 6], className: 'plain' });

// --- Durum ---
const st = {
  part: 'A', carKey: 'kompakt', bat: 60, city: false, v: 110, hills: false, regen: true, T: 20, hvacOn: true, heatPump: false,
  ac: 7.4, dc: 150, precond: false,
  nHouses: 100, share: 30, homeKw: 7.4, dailyKm: 40, strategy: 'hemen', trafo: 150,
};
let cons = null, rangeKm = 0;
let drive = { d: 0, v: 0, wait: 0, stopIdx: -1, energy: 0, dist: 0 };
let chg = { soc: 0.1, t: 0 };
let mah = { t: 0, res: null, evs: [] };

// --- Hesap ---
function computeDrive() {
  const c = CARS[st.carKey];
  cons = consumption({ car: c, v: st.v, city: st.city, T: st.T, hvacOn: st.hvacOn, heatPump: st.heatPump, regen: st.regen, hills: st.hills });
  rangeKm = (st.bat * coldCapacity(st.T)) / cons.per100 * 100;
}
function mixedPer100() {
  // Mahalle için günlük karma kullanım: yarı şehir, yarı 90 km/h
  const c = CARS[st.carKey], base = { car: c, T: st.T, hvacOn: st.hvacOn, heatPump: st.heatPump, regen: st.regen, hills: false };
  return 0.5 * consumption({ ...base, v: 50, city: true }).per100 + 0.5 * consumption({ ...base, v: 90, city: false }).per100;
}
function computeHood() {
  const nEV = Math.round((st.nHouses * st.share) / 100);
  const rnd = seeded(42);
  const per100 = mixedPer100();
  const evs = [];
  for (let i = 0; i < nEV; i++) {
    const u = 1 - rnd(), v = rnd();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const arrive = clamp(18.3 + g * 1.0, 15, 23.5);
    const km = st.dailyKm * (0.5 + rnd());
    evs.push({ arrive, jitter: rnd() * 0.25, kwh: (km * per100) / 100 / ETA_AC });
  }
  mah.evs = evs;
  mah.res = neighbourhood(st.nHouses, evs, st.homeKw, st.strategy);
  mah.per100 = per100;
}

// --- UI ---
const ui = sim.ui;
ui.section('Bölüm');
const segPart = ui.segmented({ options: [{ value: 'A', label: 'A · Sürüş' }, { value: 'B', label: 'B · Şarj' }, { value: 'C', label: 'C · Mahalle' }], value: 'A', onChange: (p) => setPart(p) });
ui.section('Senaryolar');
const SCEN = {
  ilik: { city: true, v: 50, T: 18, hvacOn: true, heatPump: false, hills: false, regen: true },
  kis: { city: false, v: 120, T: -5, hvacOn: true, heatPump: false, hills: false, regen: true },
  kissehir: { city: true, v: 50, T: -5, hvacOn: true, heatPump: false, hills: false, regen: true },
  yaz: { city: false, v: 110, T: 38, hvacOn: true, heatPump: false, hills: false, regen: true },
  eko: { city: false, v: 90, T: 20, hvacOn: true, heatPump: false, hills: false, regen: true },
};
ui.buttons([{ label: '🌤️ Ilık şehir içi', onClick: () => scenario('ilik') }, { label: '❄️ Kışın otoyol', onClick: () => scenario('kis') }]);
ui.buttons([{ label: '🏙️ Kışın şehir içi', onClick: () => scenario('kissehir') }, { label: '☀️ Yaz + klima', onClick: () => scenario('yaz') }]);
ui.buttons([{ label: '🍃 Ekonomik 90 km/h', onClick: () => scenario('eko') }]);

ui.section('A · Araç ve yol');
const segCar = ui.segmented({ label: 'Araç sınıfı', options: Object.entries(CARS).map(([k, c]) => ({ value: k, label: c.name })), value: st.carKey,
  onChange: (k) => { st.carKey = k; st.bat = CARS[k].bat; sBat.set(st.bat); car.userData.body.material.color.setHex(CARS[k].color); updateAll(); } });
const sBat = ui.slider({ label: 'Batarya kapasitesi (kullanılabilir)', min: 30, max: 120, step: 1, value: st.bat, unit: 'kWh', onInput: (v) => { st.bat = v; updateAll(); } });
const segCity = ui.segmented({ label: 'Sürüş', options: [{ value: 'city', label: 'Şehir (dur-kalk)' }, { value: 'hwy', label: 'Otoyol (sabit hız)' }], value: 'hwy',
  onChange: (m) => { st.city = m === 'city'; if (st.city && st.v > 70) sV.set(50, true); else updateAll(); } });
const sV = ui.slider({ label: 'Seyir hızı', min: 30, max: 150, step: 5, value: st.v, unit: 'km/h', onInput: (v) => { st.v = v; updateAll(); } });
const segHill = ui.segmented({ label: 'Yol', options: [{ value: 'duz', label: 'Düz' }, { value: 'tepe', label: 'Tepeli (±%4 eğim)' }], value: 'duz',
  onChange: (m) => { st.hills = m === 'tepe'; hills = st.hills; buildRoad(); updateAll(); } });
const tRegen = ui.toggle({ label: 'Rejeneratif (geri kazanımlı) fren', value: st.regen, onChange: (v) => { st.regen = v; updateAll(); } });

ui.section('A · Hava ve iklimlendirme');
const sT = ui.slider({ label: 'Dış sıcaklık', min: -20, max: 40, step: 1, value: st.T, unit: '°C', onInput: (v) => { st.T = v; updateAll(); } });
const tHvac = ui.toggle({ label: 'Isıtma / klima açık (kabin 21 °C)', value: st.hvacOn, onChange: (v) => { st.hvacOn = v; updateAll(); } });
const tHP = ui.toggle({ label: 'Isı pompası (dirençli ısıtıcı yerine)', value: st.heatPump, onChange: (v) => { st.heatPump = v; updateAll(); } });

ui.section('A · Tüketim ve menzil');
const stCons = ui.stat({ label: 'Tüketim (kWh/100 km)' });
const stRange = ui.stat({ label: 'Menzil', unit: 'km' });
const stAvg = ui.stat({ label: 'Ortalama hız', unit: 'km/h' });
const stHvac = ui.stat({ label: 'İklimlendirme gücü', unit: 'kW' });
const PARTS = [
  ['aero', 'Hava direnci', '#38bdf8'], ['roll', 'Yuvarlanma direnci', '#a78bfa'], ['brake', 'Fren kaybı (ısı)', '#f97316'],
  ['motorLoss', 'Motor + evirici kaybı', '#facc15'], ['hvac', 'Isıtma / klima', '#f87171'], ['aux', 'Elektronik', '#94a3b8'],
];
const partMeters = PARTS.map(([, name, color]) => ui.meter({ label: name, color }));
const regenText = ui.text('', '');
const rangePlot = xyPlot(ui, { title: 'Otoyol menzili – hız (bu sıcaklıkta)', height: 130, xFmt: (v) => fmt(v, 0), yFmt: (v) => fmt(v, 0),
  legend: [{ name: 'menzil (km)', color: '#22c55e' }, { name: 'şu an', color: '#facc15' }] });

ui.section('B · Şarj');
const segAC = ui.segmented({ label: 'Ev / AC şarj', options: [3.7, 7.4, 11].map((k) => ({ value: k, label: `${fmt(k, 1)} kW` })), value: st.ac,
  onChange: (k) => { st.ac = k; st.homeKw = k; updateAll(); } });
const segDC = ui.segmented({ label: 'Hızlı / DC şarj', options: [50, 150, 350].map((k) => ({ value: k, label: `${k} kW` })), value: st.dc,
  onChange: (k) => { st.dc = k; updateAll(); } });
const segChg = ui.segmented({ label: 'Animasyondaki şarj', options: [{ value: 'dc', label: 'DC' }, { value: 'ac', label: 'AC' }], value: 'dc', onChange: () => { chg.soc = 0.1; chg.t = 0; updateAll(); } });
const tPre = ui.toggle({ label: 'Batarya ön ısıtma (soğukta)', value: st.precond, onChange: (v) => { st.precond = v; updateAll(); } });
ui.button({ label: '🔌 Şarjı %10\'dan başlat', variant: 'primary', onClick: () => { chg.soc = 0.1; chg.t = 0; setPart('B'); } });
const stAC = ui.stat({ label: 'AC %10→80', unit: 'saat' });
const stDC = ui.stat({ label: 'DC %10→80', unit: 'dk' });
const stPeak = ui.stat({ label: 'DC en yüksek güç', unit: 'kW' });
const stKm10 = ui.stat({ label: 'DC ile 10 dk\'da', unit: 'km menzil' });
const chgPlot = xyPlot(ui, { title: 'Şarj gücü – doluluk (SoC)', height: 130, xFmt: (v) => `%${fmt(v, 0)}`, yFmt: (v) => fmt(v, 0),
  legend: [{ name: 'DC (kW)', color: '#38bdf8' }, { name: 'AC (kW)', color: '#22c55e' }, { name: 'şu an', color: '#facc15' }] });

ui.section('C · Mahalle akşam yükü');
const sHouses = ui.slider({ label: 'Hane sayısı', min: 10, max: 200, step: 5, value: st.nHouses, onInput: (v) => { st.nHouses = v; updateAll(); } });
const sShare = ui.slider({ label: 'Elektrikli araç sahibi haneler', min: 0, max: 100, step: 5, value: st.share, unit: '%', onInput: (v) => { st.share = v; updateAll(); } });
const sKm = ui.slider({ label: 'Araç başına günlük yol (ort.)', min: 10, max: 150, step: 5, value: st.dailyKm, unit: 'km', onInput: (v) => { st.dailyKm = v; updateAll(); } });
const segStrat = ui.segmented({ label: 'Şarj stratejisi', options: [{ value: 'hemen', label: 'Hemen (18:00)' }, { value: 'zaman', label: '23:00 zamanlayıcı' }, { value: 'akilli', label: 'Akıllı' }], value: st.strategy,
  onChange: (s) => { st.strategy = s; updateAll(); } });
const sTrafo = ui.slider({ label: 'Trafo kapasitesi (temsilî)', min: 50, max: 800, step: 10, value: st.trafo, unit: 'kW', onInput: (v) => { st.trafo = v; updateAll(); } });
const stBase = ui.stat({ label: 'Zirve (araçsız)', unit: 'kW' });
const stTot = ui.stat({ label: 'Zirve (araçlı)', unit: 'kW' });
const stWhen = ui.stat({ label: 'Zirve saati' });
const stEVe = ui.stat({ label: 'Gecelik şarj enerjisi', unit: 'kWh' });
const hoodText = ui.text('', '');
const hoodPlot = xyPlot(ui, { title: 'Mahalle yükü, 12:00 → ertesi gün 12:00 (kW)', height: 150, xFmt: (v) => `${String(Math.round(v) % 24).padStart(2, '0')}`, yFmt: (v) => fmt(v, 0),
  legend: [{ name: 'hane yükü', color: '#94a3b8' }, { name: 'hane + şarj', color: '#f97316' }, { name: 'trafo', color: '#ef4444' }] });

ui.section('Görünüm', { open: false });
const tFollow = ui.toggle({ label: 'Kamera aracı izlesin (A)', value: true });
let labelsOn = true;
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => { labelsOn = v; syncLabels(); } });
function syncLabels() {
  carLabel.visible = labelsOn && st.part !== 'C';
  trafoLabel.visible = hoodLabel.visible = labelsOn && st.part === 'C';
}

// --- Güncelle ---
const fmtH = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} sa ${String(m % 60).padStart(2, '0')} dk`; };
const clock = (h) => { const x = ((h % 24) + 24) % 24; return `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.floor((x % 1) * 60)).padStart(2, '0')}`; };

function updateAll() {
  computeDrive();
  computeHood();
  // A
  stCons.set(fmt(cons.per100, 1), cons.per100 > 22 ? 'bad' : cons.per100 < 15 ? 'good' : 'warn');
  stRange.set(fmt(rangeKm, 0));
  stAvg.set(fmt(cons.avgSpeed, 0));
  stHvac.set(fmt(cons.hvacW / 1000, 1));
  const tot = cons.per100;
  PARTS.forEach(([k], i) => partMeters[i].set(cons.parts[k] / tot, `${fmt(cons.parts[k], 1)} kWh · %${fmt((cons.parts[k] / tot) * 100, 0)}`));
  regenText.set(st.city
    ? (st.regen ? `Geri kazanım 100 km'de <b>${fmt(cons.regen, 1)} kWh</b> enerjiyi bataryaya geri yazıyor.` : 'Geri kazanım kapalı: frenlemedeki tüm kinetik enerji balatalarda ısıya dönüşüyor.')
    : `Hava yoğunluğu ${fmt(airRho(st.T), 3)} kg/m³ (soğuk hava daha yoğun → daha çok direnç). Kullanılabilir kapasite: %${fmt(coldCapacity(st.T) * 100, 0)}.`);
  const c = CARS[st.carKey], pts = [];
  let ymax = 0;
  for (let v = 30; v <= 150; v += 10) {
    const r = consumption({ car: c, v, city: false, T: st.T, hvacOn: st.hvacOn, heatPump: st.heatPump, regen: st.regen, hills: st.hills });
    const km = (st.bat * coldCapacity(st.T)) / r.per100 * 100;
    ymax = Math.max(ymax, km);
    pts.push([v, km]);
  }
  const hwNow = st.city ? null : [st.v, rangeKm];
  rangePlot.draw({ xMin: 30, xMax: 150, yMin: 0, yMax: Math.ceil(ymax / 150) * 150, xTicks: 6, series: [{ pts, color: '#22c55e', fill: 0.12 }],
    marks: hwNow ? [{ x: hwNow[0], y: hwNow[1], color: '#facc15' }] : [] });
  // B
  const acC = { kw: st.ac }, dcC = { kw: st.dc, dc: true };
  stAC.set(fmt(chargeTime(0.1, 0.8, st.bat, acC, st.T, st.precond), 1));
  stDC.set(fmt(chargeTime(0.1, 0.8, st.bat, dcC, st.T, st.precond) * 60, 0));
  let peak = 0;
  const dcPts = [], acPts = [];
  for (let s = 0; s <= 1.0001; s += 0.01) {
    const pd = chargePower(Math.min(s, 1), st.bat, dcC, st.T, st.precond).grid;
    peak = Math.max(peak, pd);
    dcPts.push([s * 100, pd]);
    acPts.push([s * 100, chargePower(Math.min(s, 1), st.bat, acC, st.T, st.precond).grid]);
  }
  stPeak.set(fmt(peak, 0), peak < st.dc * 0.8 ? 'warn' : '');
  // 10 dakikada eklenen menzil (%10'dan)
  let s = 0.1, e = 0;
  for (let i = 0; i < 600; i++) { const p = chargePower(s, st.bat, dcC, st.T, st.precond).batt; e += p / 3600; s = Math.min(1, s + p / 3600 / st.bat); }
  stKm10.set(fmt((e / cons.per100) * 100, 0));
  chgPlot.draw({ xMin: 0, xMax: 100, yMin: 0, yMax: Math.max(20, Math.ceil(peak / 30) * 30), xTicks: 5,
    series: [{ pts: dcPts, color: '#38bdf8', fill: 0.12 }, { pts: acPts, color: '#22c55e' }],
    vlines: [{ x: 10, color: 'rgba(148,163,184,.6)' }, { x: 80, color: 'rgba(148,163,184,.8)', label: '%80' }],
    marks: st.part === 'B' ? [{ x: chg.soc * 100, y: curChargeKw(), color: '#facc15' }] : [] });
  drawHood();
}

function drawHood() {
  const r = mah.res;
  const xs = (i) => T0 + (i + 0.5) * STEP;
  const basePts = [], totPts = [];
  let pb = 0, pt = 0, pti = 0, evE = 0;
  for (let i = 0; i < r.NS; i++) {
    const b = r.base[i], t = b + r.ev[i];
    basePts.push([xs(i), b]); totPts.push([xs(i), t]);
    if (b > pb) pb = b;
    if (t > pt) { pt = t; pti = i; }
    evE += r.ev[i] * STEP;
  }
  stBase.set(fmt(pb, 0));
  stTot.set(fmt(pt, 0), pt > st.trafo ? 'bad' : pt > st.trafo * 0.85 ? 'warn' : 'good');
  stWhen.set(clock(xs(pti)));
  stEVe.set(fmt(evE, 0));
  const nEV = mah.evs.length;
  hoodText.set(`${nEV} araç, ortalama ${fmt(mah.per100, 1)} kWh/100 km (yarı şehir yarı 90 km/h, bu sıcaklıkta). Zirve araçsız duruma göre
    <b>${pb > 0 ? '+%' + fmt(((pt - pb) / pb) * 100, 0) : '—'}</b>. ${pt > st.trafo ? '<b>Trafo aşırı yükleniyor!</b>' : ''}`);
  const ymax = Math.max(pt, st.trafo) * 1.1;
  const h = 12 + (mah.t * MAH_H_PER_S) % 24;
  hoodPlot.draw({ xMin: T0, xMax: T0 + 24, yMin: 0, yMax: Math.ceil(ymax / 30) * 30, xTicks: 8,
    series: [{ pts: basePts, color: '#94a3b8', fill: 0.15, width: 1.5 }, { pts: totPts, color: '#f97316' }],
    hlines: [{ y: st.trafo, color: '#ef4444', label: 'trafo' }],
    vlines: st.part === 'C' ? [{ x: h, color: '#facc15', label: clock(h) }] : [] });
}

function curChargeKw() {
  const ch = segChg.value === 'ac' ? { kw: st.ac } : { kw: st.dc, dc: true };
  return chargePower(chg.soc, st.bat, ch, st.T, st.precond).grid;
}

// --- Bölüm geçişi ---
const CAMS = {
  A: [[-34, 16, 58], [-16, 0, 25]],
  B: [[-24, 8, 16], [-12, 1.2, 1]],
  C: [[-2.5, 92, -30], [-2.5, 0, -116]],
};
function setPart(p) {
  st.part = p;
  segPart.set(p);
  syncLabels();
  sim.moveCamera(...CAMS[p]);
  if (p === 'B') placeAtStation();
  sim.formatTime = p === 'A' ? null : p === 'B' ? () => `Şarj: ${fmtH(chg.t / 60)}` : () => `Saat ${clock(12 + mah.t * MAH_H_PER_S)}`;
  updateAll();
}
function placeAtStation() {
  car.position.copy(PARK);
  car.position.x += 1.4; car.position.z += 0.5;
  car.rotation.set(0, Math.PI / 2, 0);
}

function scenario(k) {
  const s = SCEN[k];
  Object.assign(st, s);
  segCity.set(s.city ? 'city' : 'hwy'); sV.set(s.v); sT.set(s.T); tHvac.set(s.hvacOn); tHP.set(s.heatPump); tRegen.set(s.regen);
  segHill.set(s.hills ? 'tepe' : 'duz'); hills = s.hills; buildRoad();
  if (st.part !== 'A') setPart('A'); else updateAll();
}

// --- Döngü ---
const tmpV = new THREE.Vector3();
let hoodTick = 0;
sim.onUpdate((dt) => {
  if (st.part === 'A') stepDrive(dt);
  else if (st.part === 'B') stepCharge(dt);
  else stepHood(dt);
});

function stepDrive(dt) {
  const c = CARS[st.carKey], vmax = st.v / 3.6;
  const D = drive;
  let a = 0;
  if (D.wait > 0) {
    D.wait -= dt; D.v = 0;
    if (D.wait <= 0) D.stopIdx = -1;
  } else if (st.city) {
    // bir sonraki ışığa mesafe
    let best = Infinity, bi = -1;
    LIGHTS.forEach((u, i) => { let dd = u * PERIM - (D.d % PERIM); if (dd < 0.3) dd += PERIM; if (dd < best) { best = dd; bi = i; } });
    if (D.v * D.v / (2 * 2.0) >= best - 3 && D.v > 0.1) a = -Math.min(4, (D.v * D.v) / (2 * Math.max(0.5, best - 2.5)));
    else if (D.v < vmax) a = 1.5;
    if (best < 3 && D.v < 0.6) { D.wait = 8; D.v = 0; D.stopIdx = bi; a = 0; }
  } else {
    a = clamp((vmax - D.v) * 0.8, -3, 2);
  }
  const vNew = clamp(D.v + a * dt, 0, 45);
  const vm = (D.v + vNew) / 2;
  // anlık batarya gücü
  const grade = st.hills ? HILL_A * (4 * Math.PI / PERIM) * Math.cos((4 * Math.PI * D.d) / PERIM) : 0;
  const th = Math.atan(grade);
  const F = 0.5 * airRho(st.T) * c.Cd * c.A * vm * vm + c.Crr * c.m * 9.81 * Math.cos(th) + c.m * 9.81 * Math.sin(th) + c.m * 1.05 * (dt > 0 ? (vNew - D.v) / dt : 0);
  const Pw = F * vm;
  const aux = AUX + hvacPower(st.T, { on: st.hvacOn, heatPump: st.heatPump });
  const Pb = (Pw >= 0 ? Pw / ETA_DRIVE : -(st.regen ? Math.min(-Pw, REGEN_MAX) * ETA_REGEN : 0)) + aux;
  D.v = vNew;
  D.d += vm * dt;
  D.dist += vm * dt;
  D.energy += Pb * dt;
  roadAt(D.d, tmpV);
  car.position.copy(tmpV);
  const ahead = roadAt(D.d + 2);
  car.rotation.set(0, tmpV.ang, Math.atan2(ahead.y - tmpV.y, 2));
  for (const w of car.userData.wheels) w.rotation.z -= (vm * dt) / 0.38;
  if (tFollow.value && sim.controls) {
    // hedefi araca doğru kaydır, kamerayı aynı miktarda taşı (kullanıcının açısı korunur)
    const tg = sim.controls.target;
    const dx = (car.position.x - tg.x) * Math.min(1, dt * 3), dz = (car.position.z - tg.z) * Math.min(1, dt * 3), dy = (car.position.y - tg.y) * Math.min(1, dt * 3);
    tg.x += dx; tg.y += dy; tg.z += dz;
    sim.camera.position.x += dx; sim.camera.position.y += dy; sim.camera.position.z += dz;
  }
  LIGHTS.forEach((_, i) => lightPoles[i].userData.lamp.material.color.setHex(!st.city ? 0x22c55e : D.stopIdx === i ? 0xef4444 : 0xfacc15));
  if (sim.frame % 5 === 0) {
    const kw = Pb / 1000;
    const trip = D.dist > 50 ? `${fmt((D.energy / 3.6e6) / (D.dist / 1000) * 100, 1)} kWh/100 km (bu sürüş)` : '';
    carLabel.setText(`<b>${fmt(vm * 3.6, 0)} km/h</b> · ${kw < 0 ? '↺ ' : '⚡ '}${fmt(kw, 1)} kW<br><small>${trip}</small>`);
  }
}

function stepCharge(dt) {
  const ch = segChg.value === 'ac' ? { kw: st.ac } : { kw: st.dc, dc: true };
  let pb = 0;
  if (chg.soc < 0.999) {
    const p = chargePower(chg.soc, st.bat, ch, st.T, st.precond);
    pb = p.batt;
    const hours = (dt * MIN_PER_S) / 60;
    chg.soc = Math.min(1, chg.soc + (p.batt * hours) / st.bat);
    chg.t += dt * MIN_PER_S;
  }
  cableMat.emissiveIntensity = pb > 0 ? 0.6 + 0.4 * Math.sin(sim.time * 6) : 0;
  postMat.emissive.setHex(pb > 0 ? 0x22c55e : 0x0ea5e9);
  if (sim.frame % 5 === 0) {
    const grid = pb > 0 ? pb / (ch.dc ? 0.95 : ETA_AC) : 0;
    carLabel.setText(`<b>%${fmt(chg.soc * 100, 0)}</b> · ${fmt(grid, grid < 20 ? 1 : 0)} kW<br><small>${chg.soc >= 0.999 ? 'dolu' : 'şarj oluyor'} · ${fmtH(chg.t / 60)}</small>`);
    if (sim.frame % 15 === 0) updateAll();
  }
}

const M4 = new THREE.Matrix4(), col = new THREE.Color();
const hide = new THREE.Matrix4().makeScale(0, 0, 0);
function stepHood(dt) {
  mah.t += dt;
  const h = 12 + (mah.t * MAH_H_PER_S) % 24;
  const r = mah.res;
  const slot = Math.min(r.NS - 1, Math.floor((h - T0) / STEP));
  const night = h >= 17 && h < 31 ? 1 : 0.35;
  const hl = houseLoad(h);
  const nEV = mah.evs.length;
  const evVis = Math.round((NVIS * st.share) / 100);
  let charging = 0;
  for (let i = 0; i < NVIS; i++) {
    const shown = i < Math.min(NVIS, st.nHouses);
    houses.setMatrixAt(i, shown ? M4.makeTranslation(hpos[i][0], 2, hpos[i][1]) : hide);
    roofs.setMatrixAt(i, shown ? M4.makeTranslation(hpos[i][0], 5.3, hpos[i][1]) : hide);
    wins.setMatrixAt(i, shown ? M4.makeTranslation(hpos[i][0], 2.2, hpos[i][1] + 3.01) : hide);
    const lit = clamp(hl * (0.7 + 0.6 * ((i * 37) % 10) / 10), 0, 1.2);
    wins.setColorAt(i, col.setRGB(0.2 + 0.8 * lit * night, 0.2 + 0.65 * lit * night, 0.25 + 0.3 * lit * night));
    let show = false;
    if (shown && i < evVis && nEV > 0) {
      const j = Math.min(nEV - 1, Math.floor((i * nEV) / Math.max(1, evVis)));
      const ev = mah.evs[j];
      const home = h >= ev.arrive && h < 31;
      if (home) {
        show = true;
        const on = r.charging[j][slot];
        if (on) charging++;
        hoodCars.setColorAt(i, col.setHex(on ? 0x22c55e : 0x64748b));
      }
    }
    hoodCars.setMatrixAt(i, show ? M4.makeTranslation(hpos[i][0] + 4.8, 0.75, hpos[i][1] + 1).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)) : hide);
  }
  for (const m of [houses, roofs, wins, hoodCars]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  const load = r.base[slot] + r.ev[slot];
  trafoLabel.setText(`Trafo: <b>${fmt(load, 0)} kW</b> / ${fmt(st.trafo, 0)}`);
  trafoLabel.el.style.borderColor = load > st.trafo ? '#ef4444' : '';
  hoodLabel.setText(`${clock(h)} · şarjdaki araç (görünen): ${charging}${st.nHouses > NVIS ? ` · ilk ${NVIS} hane gösteriliyor` : ''}`);
  if (++hoodTick % 6 === 0) drawHood();
}

sim.onReset(() => {
  drive = { d: 0, v: 0, wait: 0, stopIdx: -1, energy: 0, dist: 0 };
  chg = { soc: 0.1, t: 0 };
  mah.t = 0;
  if (st.part === 'B') placeAtStation();
  updateAll();
});

// başlangıç
for (let i = 0; i < NVIS; i++) { wins.setColorAt(i, col.setHex(0x334155)); hoodCars.setColorAt(i, col.setHex(0x64748b)); }
buildRoad();
updateAll();
setPart('A');
mah.t = (18 - 12) / MAH_H_PER_S; // mahalle 18:00'den başlasın
stepHood(0);
