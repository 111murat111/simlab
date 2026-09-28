// Rüzgâr Türbini — P = ½ρAv³Cp, Betz sınırı, Cp(λ, β) eğrisi, kanat açısı kontrolü, iz (wake) akışı ve Weibull yıllık enerji.
import { createSim, THREE, fmt, clamp, rand, lerp, disposeObject } from '@core';
import { BETZ, CUT_IN, CUT_OUT, ETA, cp, lamOpt, cpMax, airDensity, hubHeight, ratedWind, operate, operateManual, induction, weibull, annual } from './model.js';
import { xyPlot } from './plot.js';

const RV = 10; // görsel rotor yarıçapı (birim)
const NP = 1400; // akış parçacığı
const FLOW = 1.3; // parçacık görsel hızı: birim/s başına m/s
const X0 = -40, X1 = 80, RMAX = 16;

const sim = createSim({
  background: 0x9cc3e6,
  camera: { position: [-40, 30, 62], target: [18, 14, 0], fov: 50, far: 3000 },
  controls: { maxDistance: 260, minDistance: 12 },
  fog: [180, 520],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Yatay eksenli bir rüzgâr türbini. Rüzgâr soldan gelir; rotor rüzgârın kinetik enerjisinin bir kısmını alır, bu yüzden
    arkasındaki hava <b>yavaşlar</b> (mavi parçacıklar) ve genişleyen bir <b>iz</b> (wake) oluşur. Rüzgârdaki güç
    <b>P = ½·ρ·A·v³</b>: hız iki katına çıkınca güç <b>8 katına</b>, rotor çapı iki katına çıkınca güç <b>4 katına</b> çıkar.</p>
    <p>Türbinin aldığı pay <b>güç katsayısı Cp</b>'dir. Hiçbir türbin <b>Betz sınırını (16/27 ≈ %59,3)</b> aşamaz: havayı tamamen
    durdurursan arkadan gelen hava geçemez. En iyi durumda rotor önündeki rüzgârı 1/3 oranında yavaşlatır, iz ise
    serbest rüzgârın 1/3'üne iner. Gerçek büyük türbinlerde aerodinamik Cp ≈ 0,45–0,50'dir.</p>
    <p>Cp, <b>uç hız oranına</b> λ = ωR/v (kanat ucunun hızı / rüzgâr hızı) ve kanat açısına (pitch, β) bağlıdır.
    Otomatik kontrolde türbin üç bölgede çalışır: <b>${CUT_IN} m/s</b> altında durur; nominal hıza kadar rotor devrini
    ayarlayıp en iyi λ'yı izler (Cp en yüksek); nominal hızın üstünde kanatları döndürüp (pitch) gücü sınırlar;
    <b>${CUT_OUT} m/s</b> üstünde kanatları rüzgâra paralel (bayrak) konuma alıp durur.</p>
    <h3>Dene</h3>
    <ul>
      <li>Rüzgârı 6'dan 12 m/s'ye çıkar: rüzgârdaki güç 8 kat artar ama çıkış nominal güçte kesilir; kanat açısı büyür.</li>
      <li>"Elle" kontrole geç, λ'yı 3 ile 14 arasında gezdir: Cp tepe noktasını bul. Kanat sayısını 2'ye indir, tepe sağa kayar.</li>
      <li>Rakımı 2.500 m'ye çıkar veya sıcaklığı 35 °C yap: hava seyrelir, aynı rüzgârda daha az enerji.</li>
      <li>"Küçük ev türbini": ortalama 4,5 m/s rüzgârda kapasite faktörü neden bu kadar düşük? Ortalama hızı 6'ya çıkar.</li>
      <li>Weibull k'yi 1,5'e düşür (değişken rüzgâr) ve 3'e çıkar (düzenli rüzgâr): aynı ortalamada yıllık enerji değişir.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p><small>Cp(λ, β) için Heier (1998) / Slootweg vd. (2003, IEEE Trans. Power Systems) ampirik formülü kullanılır:
    Cp = 0,5176·(116/λᵢ − 0,4β − 5)·e<sup>−21/λᵢ</sup> + 0,0068λ, 1/λᵢ = 1/(λ+0,08β) − 0,035/(β³+1); tepe ≈ 0,48 (λ ≈ 8,1).
    Bu formül 3 kanatlı türbin içindir; 1, 2, 4, 5 kanat için λ ekseni ve tepe değeri <b>temsilî</b> olarak ölçeklenir
    (az kanat → yüksek optimum λ ve daha büyük uç kaybı). Dişli + jeneratör verimi %95 kabul edilir. İz hızı ideal
    aktüatör disk kuramından (Cp = 4a(1−a)²) gelir; parçacıklar görünürlük için hızlandırılmıştır, görsel dönüş hızı
    sınırlıdır. Rüzgâr hızı göbek yüksekliğindedir; rüzgâr kesmesi, türbülans, yaw ve park içi iz kayıpları "diğer kayıplar"
    kaydırıcısında toplanır. Yıllık enerji: güç eğrisi × Weibull dağılımı × 8.760 saat. Hazır ayarlardaki boyutlar temsilîdir;
    açık deniz ayarı 240 m rotorlu IEA 15 MW referans türbinine (Gaertner vd., NREL, 2020) benzer.</small></p>`,
});

// --- Sahne ---
const scene = sim.scene;
const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshStandardMaterial({ color: 0x5f8f4e, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const hills = new THREE.Group();
{
  const mat = new THREE.MeshStandardMaterial({ color: 0x55804a, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2), d = rand(260, 420);
    const h = new THREE.Mesh(new THREE.ConeGeometry(rand(40, 80), rand(20, 55), 7), mat);
    h.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    hills.add(h);
  }
  scene.add(hills);
}

const turbine = new THREE.Group();
scene.add(turbine);
const white = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55, metalness: 0.1 });
const grey = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.6 });
const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 1, 20), white);
turbine.add(tower);
const head = new THREE.Group(); // nasel + rotor
turbine.add(head);
const nacelle = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.35, 1.35), white);
nacelle.position.x = 1.1;
head.add(nacelle);
const rotor = new THREE.Group();
rotor.position.x = -1.1;
head.add(rotor);
const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), grey);
spinner.rotation.z = Math.PI / 2;
spinner.scale.set(1, 1.5, 1);
rotor.add(spinner);

function bladeGeometry() {
  // Kanat planı: kökte geniş, uca doğru incelen; açıklık +y, veter z yönünde
  const s = new THREE.Shape();
  const r0 = 0.6, L = RV - r0;
  s.moveTo(-0.25, r0);
  s.bezierCurveTo(-0.5, r0 + 1.2, -0.55, r0 + 2.5, -0.35, r0 + L * 0.5);
  s.lineTo(-0.1, r0 + L);
  s.lineTo(0.12, r0 + L);
  s.bezierCurveTo(0.35, r0 + L * 0.5, 0.95, r0 + 2.5, 0.85, r0 + 1.3);
  s.lineTo(0.25, r0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -0.07);
  g.rotateY(Math.PI / 2); // veter z'ye, kalınlık x'e
  return g;
}
const bladeGeo = bladeGeometry();
let bladePivots = [];
function buildBlades(B) {
  bladePivots.forEach((p) => p.parent.removeFromParent());
  bladePivots = [];
  for (let i = 0; i < B; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i / B) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.add(new THREE.Mesh(bladeGeo, white));
    arm.add(pivot);
    rotor.add(arm);
    bladePivots.push(pivot);
  }
}

// Ölçek için insan figürü (1,8 m)
const person = new THREE.Group();
{
  const m = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.55, 4, 8), m);
  body.position.y = 0.5;
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfcd9b6 }));
  headM.position.y = 1.0;
  person.add(body, headM);
  person.position.set(3, 0, 5);
  scene.add(person);
}
const personLabel = sim.label('insan 1,8 m', { parent: person, position: [0, 1.4, 0], className: 'plain' });

// Akış tüpü yüzeyi (rotordan geçen havanın sınırı)
const tubeMat = new THREE.MeshBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
let tube = null;

// Parçacıklar
const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3);
const px = new Float32Array(NP), pr0 = new Float32Array(NP), pth = new Float32Array(NP);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
points.frustumCulled = false;
scene.add(points);
function spawn(i, anywhere) {
  px[i] = anywhere ? rand(X0, X1) : X0 + rand(0, 3);
  pr0[i] = RMAX * Math.sqrt(Math.random());
  pth[i] = rand(0, Math.PI * 2);
}
for (let i = 0; i < NP; i++) spawn(i, true);

const hubLabel = sim.label('', { parent: head, position: [0, 3.2, 0] });
const windLabel = sim.label('Rüzgâr →', { position: [X0 + 6, 0, 0], className: 'plain' });
const wakeLabel = sim.label('', { position: [60, 0, 0], className: 'plain' });

// --- Durum ---
const st = { v: 9, alt: 0, temp: 15, D: 130, Pk: 4000, B: 3, manual: false, lam: 8, beta: 0, U: 7.5, k: 2, loss: 10 };
let t = {}, op = {}, a = 0, hubVis = 16, S = 1, rotorAngle = 0;
let annualRes = { E: 0, cf: 0 };
let camD = -1;

function turbineParams() {
  return { D: st.D, B: st.B, Prated: st.Pk * 1000, rho: airDensity(st.alt, st.temp) };
}

function layout() {
  S = RV / (st.D / 2);
  hubVis = hubHeight(st.D) * S;
  tower.scale.set(1, hubVis, 1);
  tower.position.y = hubVis / 2;
  head.position.y = hubVis;
  person.scale.setScalar(S);
  person.position.set(RV * 0.35 + 0.4 * S, 0, RV * 0.45);
  personLabel.position.y = 2.1;
  hubLabel.position.y = 3.2;
  windLabel.position.y = hubVis + RMAX * 0.2;
  wakeLabel.position.y = hubVis - RV * 1.35;
  if (camD === st.D) return;
  camD = st.D;
  const dist = Math.max(40, (hubVis + RV) * 1.35);
  sim.moveCamera([-dist * 0.75, hubVis * 0.75 + 8, dist * 0.9], [16, Math.max(hubVis * 0.72, hubVis - RV * 0.6), 0]);
}

// Eksen üzerindeki hız açığı (aktüatör disk / girdap silindiri), x birim cinsinden
const deficit = (x) => a * (1 + x / Math.sqrt(x * x + RV * RV));
const recover = (x) => (x > 45 ? Math.exp(-(x - 45) / 70) : 1);

function buildTube() {
  if (tube) disposeObject(tube);
  tube = null;
  if (a < 0.005) return;
  const Rinf = RV * Math.sqrt(1 - a);
  const pts = [];
  for (let x = -30; x <= 70; x += 2.5) pts.push(new THREE.Vector2(Rinf * Math.sqrt(1 / (1 - deficit(x))), x));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateZ(-Math.PI / 2);
  tube = new THREE.Mesh(g, tubeMat);
  tube.position.y = hubVis;
  tube.visible = showTube.value;
  scene.add(tube);
}

function compute() {
  t = turbineParams();
  op = st.manual ? operateManual(t, st.v, st.lam, st.beta) : operate(t, st.v);
  a = induction(op.cp);
  if (op.region === 4 || st.v < 0.5) a = 0;
}

function recomputeAll() {
  compute();
  layout();
  buildTube();
  const lossF = 1 - st.loss / 100;
  const r = annual(t, st.U, st.k);
  annualRes = { E: r.E * lossF, cf: r.cf * lossF };
  refreshPanel();
  drawCharts();
}

// --- Güncelleme ---
const col = new THREE.Color(), cSlow = new THREE.Color(0x1e3a8a), cFast = new THREE.Color(0xf8fafc);
sim.onUpdate((dt) => {
  // Rotor: gerçek açısal hız, görsel olarak en fazla ≈ 50 d/dk
  const w = Math.min(op.omega || 0, 5.2);
  rotorAngle += w * dt;
  rotor.rotation.x = -rotorAngle;
  const beta = THREE.MathUtils.degToRad(op.beta || 0);
  for (const p of bladePivots) p.rotation.y = lerp(p.rotation.y, beta, Math.min(1, dt * 3));

  const vis = st.v * FLOW;
  const Rinf2 = RV * RV * (1 - a);
  for (let i = 0; i < NP; i++) {
    const x = px[i];
    const d = deficit(x);
    const r02 = pr0[i] * pr0[i];
    const inside = r02 < Rinf2;
    const geo = 1 / (1 - d);
    const r = Math.sqrt(inside ? r02 * geo : r02 + Rinf2 * (geo - 1));
    const u = inside ? 1 - d * recover(x) : 1 + 0.25 * a * Math.exp(-((x / 25) ** 2)) * (Rinf2 / (r * r + 1));
    px[i] += Math.max(0.15, vis * u) * dt + 0.02;
    if (px[i] > X1) spawn(i, false);
    const y = hubVis + r * Math.sin(pth[i]);
    pPos[i * 3] = px[i];
    pPos[i * 3 + 1] = y < 0.3 ? -50 : y;
    pPos[i * 3 + 2] = r * Math.cos(pth[i]);
    col.copy(cSlow).lerp(cFast, clamp((u - 0.3) / 0.7, 0, 1));
    pCol[i * 3] = col.r; pCol[i * 3 + 1] = col.g; pCol[i * 3 + 2] = col.b;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
});

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır ayarlar');
const PRESETS = {
  kara: { v: 9, alt: 300, temp: 15, D: 130, Pk: 4000, B: 3, U: 7.5, k: 2, site: 'kara', manual: false },
  deniz: { v: 11, alt: 0, temp: 12, D: 240, Pk: 15000, B: 3, U: 9.5, k: 2.2, site: 'deniz', manual: false },
  firtina: { v: 28, alt: 300, temp: 8, D: 130, Pk: 4000, B: 3, U: 7.5, k: 2, site: 'firtina', manual: false },
  kucuk: { v: 7, alt: 100, temp: 15, D: 3, Pk: 2.5, B: 3, U: 4.5, k: 2, site: 'kara', manual: false },
};
ui.buttons([
  { label: '🏞️ Kara türbini', onClick: () => applyPreset('kara') },
  { label: '🌊 Açık deniz', onClick: () => applyPreset('deniz') },
]);
ui.buttons([
  { label: '⛈️ Fırtına', onClick: () => applyPreset('firtina') },
  { label: '🏡 Küçük ev türbini', onClick: () => applyPreset('kucuk') },
]);

ui.section('Rüzgâr ve hava');
const sV = ui.slider({ label: 'Rüzgâr hızı (göbekte)', min: 0, max: 30, step: 0.5, value: st.v, unit: 'm/s', onInput: (v) => { st.v = v; recomputeLight(); } });
const sAlt = ui.slider({ label: 'Rakım', min: 0, max: 3000, step: 50, value: st.alt, unit: 'm', onInput: (v) => { st.alt = v; recomputeAll(); } });
const sTemp = ui.slider({ label: 'Hava sıcaklığı', min: -20, max: 40, step: 1, value: st.temp, unit: '°C', onInput: (v) => { st.temp = v; recomputeAll(); } });

ui.section('Türbin');
const sD = ui.slider({ label: 'Rotor çapı', min: 2, max: 240, step: 1, value: st.D, unit: 'm', onInput: (v) => { st.D = v; recomputeAll(); } });
const PMIN = 1, PMAX = 20000;
const toP = (s) => {
  const p = PMIN * Math.pow(PMAX / PMIN, s / 100), e = Math.pow(10, Math.floor(Math.log10(p)) - 1);
  return Math.round(p / e) * e; // iki anlamlı basamak
};
const fromP = (p) => (100 * Math.log(p / PMIN)) / Math.log(PMAX / PMIN);
const fmtP = (w) => (w >= 1e6 ? `${fmt(w / 1e6, w >= 1e7 ? 1 : 2)} MW` : w >= 1e3 ? `${fmt(w / 1e3, w >= 1e5 ? 0 : 1)} kW` : `${fmt(w, 0)} W`);
const sP = ui.slider({ label: 'Nominal güç', min: 0, max: 100, step: 0.1, value: fromP(st.Pk), format: (s) => fmtP(toP(s) * 1000), onInput: (s) => { st.Pk = toP(s); recomputeAll(); } });
const segB = ui.segmented({ label: 'Kanat sayısı', options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) })), value: st.B,
  onChange: (b) => { st.B = b; buildBlades(b); recomputeAll(); } });
const segMode = ui.segmented({ label: 'Kontrol', options: [{ value: 'oto', label: 'Otomatik' }, { value: 'elle', label: 'Elle' }], value: 'oto',
  onChange: (m) => { st.manual = m === 'elle'; syncManual(); recomputeAll(); } });
const sLam = ui.slider({ label: 'Uç hız oranı λ (elle)', min: 1, max: 16, step: 0.1, value: st.lam, onInput: (v) => { st.lam = v; recomputeLight(); } });
const sBeta = ui.slider({ label: 'Kanat açısı β (elle)', min: 0, max: 40, step: 0.5, value: st.beta, unit: '°', onInput: (v) => { st.beta = v; recomputeLight(); } });
function syncManual() { sLam.disable(!st.manual); sBeta.disable(!st.manual); }

ui.section('Anlık durum');
const stWind = ui.stat({ label: 'Rüzgârdaki güç' });
const stOut = ui.stat({ label: 'Elektrik çıkışı' });
const stCp = ui.stat({ label: 'Cp (aerodinamik)' });
const stLam = ui.stat({ label: 'Uç hız oranı λ' });
const stRpm = ui.stat({ label: 'Rotor devri', unit: 'd/dk' });
const stTip = ui.stat({ label: 'Kanat ucu hızı', unit: 'm/s' });
const stBeta = ui.stat({ label: 'Kanat açısı β', unit: '°' });
const stRho = ui.stat({ label: 'Hava yoğunluğu', unit: 'kg/m³' });
const mBetz = ui.meter({ label: 'Betz sınırına yakınlık (Cp / 0,593)', color: '#22c55e' });
const regionText = ui.text('', 'card');
const cpPlot = xyPlot(ui, { title: 'Cp – λ eğrisi (seçili β ve kanat sayısı)', height: 130, xFmt: (v) => fmt(v, 0), yFmt: (v) => fmt(v, 2),
  legend: [{ name: 'Cp(λ)', color: '#38bdf8' }, { name: 'Betz 0,593', color: '#f87171' }, { name: 'çalışma noktası', color: '#facc15' }] });
const pcPlot = xyPlot(ui, { title: 'Güç eğrisi ve rüzgâr dağılımı', height: 140, xFmt: (v) => fmt(v, 0), yFmt: (v) => fmt(v, 0) + '%', y2Fmt: (v) => fmt(v, 0) + '%',
  legend: [{ name: 'çıkış / nominal (sol)', color: '#38bdf8' }, { name: 'Weibull saat payı (sağ)', color: '#a78bfa' }, { name: 'şu an', color: '#facc15' }] });

ui.section('Yıllık üretim');
const sU = ui.slider({ label: 'Yıllık ortalama rüzgâr', min: 3, max: 12, step: 0.1, value: st.U, unit: 'm/s', onInput: (v) => { st.U = v; recomputeAll(); } });
const sK = ui.slider({ label: 'Weibull biçim k (2 = Rayleigh)', min: 1.2, max: 3.5, step: 0.1, value: st.k, onInput: (v) => { st.k = v; recomputeAll(); } });
const sLoss = ui.slider({ label: 'Diğer kayıplar (iz, arıza, şebeke)', min: 0, max: 30, step: 1, value: st.loss, unit: '%', onInput: (v) => { st.loss = v; recomputeAll(); } });
const stAEP = ui.stat({ label: 'Yıllık enerji' });
const stCF = ui.stat({ label: 'Kapasite faktörü', unit: '%' });
const stFLH = ui.stat({ label: 'Tam yük saati', unit: 'saat/yıl' });
const stVr = ui.stat({ label: 'Nominal rüzgâr', unit: 'm/s' });
const aepNote = ui.text('', '');

ui.section('Görünüm', { open: false });
const showFlow = ui.toggle({ label: 'Akış parçacıkları', value: true, onChange: (v) => (points.visible = v) });
const showTube = ui.toggle({ label: 'Akış tüpü (rotordan geçen hava)', value: true, onChange: (v) => tube && (tube.visible = v) });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => [hubLabel, windLabel, wakeLabel, personLabel].forEach((l) => (l.visible = v)) });

const fmtE = (wh) => (wh >= 1e9 ? `${fmt(wh / 1e9, 1)} GWh` : wh >= 1e6 ? `${fmt(wh / 1e6, 1)} MWh` : `${fmt(wh / 1e3, 0)} kWh`);
const REGION = {
  0: 'Elle kontrol: rotor devri λ ile, kanat açısı β ile senin elinde. Güç nominali aşarsa jeneratör aşırı yüklenir.',
  1: `Bölge 1 — rüzgâr ${fmt(CUT_IN)} m/s altında: üretim yok, rotor boşta döner.`,
  2: 'Bölge 2 — değişken hız: rotor devri rüzgârla birlikte artar, λ en iyi değerde tutulur → Cp en yüksek.',
  3: 'Bölge 3 — nominal güç: rotor devri sabit, kanatlar döndürülerek (pitch) fazla güç rüzgâra bırakılır.',
  4: `Fırtına — rüzgâr ${fmt(CUT_OUT)} m/s üstünde: kanatlar bayrak konumunda (β = 90°), rotor frenlendi, üretim yok.`,
};

function refreshPanel() {
  stWind.set(fmtP(op.Pwind));
  const over = st.manual && op.P > t.Prated * 1.02;
  stOut.set(fmtP(op.P), over ? 'bad' : op.P > 0 ? 'good' : '');
  stCp.set(fmt(op.cp, 3), op.cp > BETZ ? 'bad' : '');
  stLam.set(fmt(op.lam, 1));
  const rpm = (op.omega * 60) / (2 * Math.PI);
  stRpm.set(fmt(rpm, rpm < 10 ? 1 : 0));
  const tip = op.omega * st.D / 2;
  stTip.set(fmt(tip, 0), tip > 90 ? 'warn' : '');
  stBeta.set(fmt(op.beta, 1));
  stRho.set(fmt(t.rho, 3));
  mBetz.set(op.cp / BETZ, `${fmt((op.cp / BETZ) * 100, 0)}%`);
  let txt = REGION[op.region];
  if (over) txt += ` <b>Şu an nominalin ${fmt(op.P / t.Prated, 1)} katı!</b>`;
  if (st.manual && st.v > CUT_OUT) txt += ' Bu rüzgârda gerçek türbin kendini durdururdu.';
  regionText.set(txt);
  hubLabel.setText(`<b>${fmtP(op.P)}</b> · Cp ${fmt(op.cp, 2)}`);
  windLabel.setText(`Rüzgâr ${fmt(st.v, 1)} m/s →`);
  wakeLabel.setText(a > 0.005 ? `iz ≈ ${fmt(st.v * (1 - 2 * a), 1)} m/s` : '');
  stAEP.set(fmtE(annualRes.E));
  stCF.set(fmt(annualRes.cf * 100, 1), annualRes.cf > 0.3 ? 'good' : annualRes.cf < 0.15 ? 'bad' : 'warn');
  stFLH.set(fmt(annualRes.cf * 8760, 0));
  stVr.set(fmt(ratedWind(t), 1));
  const homes = annualRes.E / 1e3 / 10791;
  aepNote.set(`Nominal güç ${fmtP(t.Prated)} × 8.760 saat = ${fmtE(t.Prated * 8760)} olurdu; rüzgâr hep esmediği için gerçek üretim bu üst sınırın
    yalnızca bir kısmıdır (kapasite faktörü %${fmt(annualRes.cf * 100, 0)}). Bu enerji ≈ <b>${fmt(homes, homes < 10 ? 1 : 0)}</b> ABD hanesinin yıllık tüketimine eşit
    (10.791 kWh/hane, EIA 2022).`);
}

function drawCharts() {
  const B = st.B, beta = st.manual ? st.beta : op.beta;
  const cpPts = [];
  for (let l = 0; l <= 16; l += 0.2) cpPts.push([l, cp(l, beta, B)]);
  cpPlot.draw({
    xMin: 0, xMax: 16, yMin: 0, yMax: 0.6, xTicks: 8,
    series: [{ pts: cpPts, color: '#38bdf8', fill: 0.12 }],
    hlines: [{ y: BETZ, color: '#f87171', label: 'Betz 16/27' }],
    vlines: [{ x: lamOpt(B), color: 'rgba(148,163,184,.7)', label: `λopt ${fmt(lamOpt(B), 1)}`, bottom: true }],
    marks: op.lam > 0 ? [{ x: Math.min(op.lam, 16), y: op.cp, color: '#facc15' }] : [],
  });
  const f = weibull(st.U, st.k);
  const pc = [], wb = [];
  let wmax = 0;
  for (let v = 0; v <= 30; v += 0.25) {
    pc.push([v, (operate(t, v).P / t.Prated) * 100]);
    const w = f(v) * 100;
    wmax = Math.max(wmax, w);
    wb.push([v, w]);
  }
  pcPlot.draw({
    xMin: 0, xMax: 30, yMin: 0, yMax: 120, xTicks: 6, y2: { min: 0, max: Math.ceil((wmax * 1.1) / 3) * 3 },
    series: [{ pts: wb, color: '#a78bfa', axis: 2, fill: 0.15, width: 1.5 }, { pts: pc, color: '#38bdf8' }],
    vlines: [{ x: CUT_IN, color: 'rgba(148,163,184,.6)', label: 'başlama' }, { x: CUT_OUT, color: 'rgba(248,113,113,.8)', label: 'kesme' }],
    marks: [{ x: Math.min(st.v, 30), y: Math.min(120, (op.P / t.Prated) * 100), color: '#facc15' }],
  });
}

function recomputeLight() {
  compute();
  buildTube();
  refreshPanel();
  drawCharts();
}

function setSite(site) {
  const sea = site === 'deniz', storm = site === 'firtina';
  ground.material.color.setHex(sea ? 0x2b6d9c : storm ? 0x46603c : 0x5f8f4e);
  hills.visible = !sea;
  const bg = storm ? 0x5b6b7c : sea ? 0xa9cde8 : 0x9cc3e6;
  scene.background.setHex(bg);
  scene.fog.color.setHex(bg);
}

function applyPreset(name) {
  const p = PRESETS[name];
  Object.assign(st, { v: p.v, alt: p.alt, temp: p.temp, D: p.D, Pk: p.Pk, B: p.B, U: p.U, k: p.k, manual: p.manual });
  sV.set(p.v); sAlt.set(p.alt); sTemp.set(p.temp); sD.set(p.D); sP.set(fromP(p.Pk)); sU.set(p.U); sK.set(p.k);
  segB.set(p.B); segMode.set('oto');
  buildBlades(p.B);
  syncManual();
  setSite(p.site);
  recomputeAll();
  for (let i = 0; i < NP; i++) spawn(i, true);
}

sim.onReset(() => applyPreset('kara'));
applyPreset('kara');
