// Ekosistem Dengesi — ot, geyik ve kurttan oluşan ajan tabanlı besin zinciri; trofik çağlayan ve Yellowstone hikâyesi.
import { createSim, THREE, BufferGeometryUtils, fmt, instanced, rand, seeded } from '@core';
import { createModel, W, HALF, MAXD, MAXW, riverX } from './model.js';

const sim = createSim({
  background: 0x9cc9e6,
  fog: [60, 130],
  camera: { position: [0, 31, 39], target: [0, -1, 2], fov: 46 },
  controls: { maxDistance: 90, minDistance: 8 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Kareli çayırda <b>ot</b> büyür (yeşil = gür, kahverengi = yenmiş). <b>Geyikler</b> (kahverengi) otu yer, enerji toplar
    ve yavrular. <b>Kurtlar</b> (gri) geyik avlar. Nehir kıyısındaki <b>söğüt fidanları</b> geyikler yoğunken kemirilip kısalır.
    Her hayvan kendi başına basit kurallarla hareket eder; nüfus dalgaları bu kurallardan kendiliğinden doğar.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Kurtları çıkar</b>: geyikler çoğalır, otlar ve söğütler yenip biter. Sonra <b>geri getir</b> ve toparlanmayı izle.</li>
      <li>"Yellowstone hikâyesi" senaryosunu başlat, grafikte üç dönemi karşılaştır.</li>
      <li><b>Kuraklık</b> başlat: önce otlar, sonra geyikler, en son kurtlar azalır — etki zincir boyunca gecikmeli yayılır.</li>
      <li>Kurtsuz vadide <b>avcılığı</b> aç: avcılar kurtların işini kısmen üstlenebilir mi?</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>ABD'deki Yellowstone Ulusal Parkı'nda kurtlar 1920'lerde avlanarak yok edildi. Sonraki on yıllarda geyik (wapiti)
    sayısı arttı; nehir kıyısındaki söğüt ve kavak fidanları aşırı otlatmadan zarar gördü. 1995–1996'da Kanada'dan getirilen
    kurtlar parka bırakıldı; ardından geyik sayısı azaldı ve bazı bölgelerde söğütler yeniden boy attı. Bir yırtıcının
    bitkilere kadar uzanan bu zincirleme etkisine <b>trofik çağlayan</b> denir. Bilim insanları etkinin büyüklüğünü hâlâ
    tartışıyor: iklim, ayılar, pumalar ve insan avcılığı da rol oynadı.</p>
    <h3>Model</h3>
    <p>Ajan tabanlı Lotka–Volterra benzeri model: av–avcı döngüleri, otun sınırlı olması ve kurtların bölge savunması
    (kalabalıkta daha az yavru) sayesinde sönümlenmeden sürer. Zayıf, çok genç ya da yaşlı geyikler daha kolay yakalanır.
    Kurt azken geyiklerin nehir kıyısında daha rahat otlaması "korku manzarası" fikrini basitçe temsil eder.
    Zaman sıkıştırılmıştır; sayılar gerçek Yellowstone verisi değildir.</p>`,
});
sim.formatTime = (t) => `${Math.floor(t / 52) + 1}. yıl · ${Math.floor(t % 52) + 1}. hafta`;

const model = createModel();
const { D, Wf, wil, grass, water } = model;

// --- Zemin ve çevre ---
{
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  sim.scene.add(outer);
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.3, W + 0.6), new THREE.MeshStandardMaterial({ color: 0x4a3622, roughness: 1 }));
  base.position.y = -0.15;
  sim.scene.add(base);
}

// Ot karoları
const NT = W * W;
const tileMesh = instanced(new THREE.BoxGeometry(0.97, 1, 0.97), new THREE.MeshStandardMaterial({ roughness: 0.9 }), NT);
tileMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NT * 3), 3);
tileMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
tileMesh.frustumCulled = false;
sim.scene.add(tileMesh);
const jitter = new Float32Array(NT);
{
  const r = seeded(7);
  for (let i = 0; i < NT; i++) jitter[i] = (r() - 0.5) * 0.08;
}
const cDirt = new THREE.Color(0x8a6a3e), cGrass = new THREE.Color(0x3f9a2c), cDry = new THREE.Color(0xc2a656), cWater = new THREE.Color(0x3d8bd0);
const tc = new THREE.Color();
function drawTiles() {
  const m = tileMesh.instanceMatrix.array, col = tileMesh.instanceColor.array;
  const dry = model.drought > 0 ? 0.55 : 0;
  for (let i = 0; i < NT; i++) {
    const ix = i % W, iz = (i / W) | 0, o = i * 16;
    let sy;
    if (water[i]) {
      sy = 0.03;
      tc.copy(cWater);
      tc.offsetHSL(0, 0, jitter[i] * 0.4 + Math.sin(sim.time * 1.5 + ix * 0.7 + iz * 0.4) * 0.02);
    } else {
      const g = grass[i];
      sy = 0.05 + g * 0.16;
      tc.copy(cDirt).lerp(cGrass, Math.min(1, g * 1.15));
      if (dry) tc.lerp(cDry, dry * g);
      tc.offsetHSL(0, 0, jitter[i]);
    }
    m[o] = 1; m[o + 5] = sy; m[o + 10] = 1; m[o + 15] = 1;
    m[o + 12] = ix - HALF + 0.5; m[o + 13] = sy / 2; m[o + 14] = iz - HALF + 0.5;
    col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b;
  }
  tileMesh.instanceMatrix.needsUpdate = true;
  tileMesh.instanceColor.needsUpdate = true;
}

// Park dışındaki orman (süs)
{
  const trunkG = new THREE.CylinderGeometry(0.12, 0.18, 1, 6); trunkG.translate(0, 0.5, 0);
  const crownG = new THREE.ConeGeometry(0.9, 2.6, 7); crownG.translate(0, 2.3, 0);
  const N = 220;
  const trunks = instanced(trunkG, new THREE.MeshStandardMaterial({ color: 0x5b3d24 }), N);
  const crowns = instanced(crownG, new THREE.MeshStandardMaterial({ color: 0x24552d, roughness: 0.9 }), N);
  const r = seeded(3), o = new THREE.Object3D();
  crowns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  for (let i = 0; i < N; i++) {
    let x, z;
    do { x = (r() - 0.5) * 84; z = (r() - 0.5) * 84; } while (Math.max(Math.abs(x), Math.abs(z)) < HALF + 1.5);
    o.position.set(x, 0, z);
    o.scale.setScalar(0.8 + r() * 0.8);
    o.rotation.y = r() * 6;
    o.updateMatrix();
    trunks.setMatrixAt(i, o.matrix); crowns.setMatrixAt(i, o.matrix);
    tc.setHex(0x24552d).offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.08);
    crowns.setColorAt(i, tc);
  }
  sim.scene.add(trunks, crowns);
}

// Söğüt fidanları (nehir kıyısı)
const willowTrunk = instanced((() => { const g = new THREE.CylinderGeometry(0.05, 0.08, 1, 5); g.translate(0, 0.5, 0); return g; })(),
  new THREE.MeshStandardMaterial({ color: 0x6b4a2e }), wil.x.length);
const willowCrown = instanced((() => { const g = new THREE.IcosahedronGeometry(0.42, 0); g.scale(1, 1.3, 1); g.translate(0, 1.05, 0); return g; })(),
  new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), wil.x.length);
willowCrown.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(wil.x.length * 3), 3);
willowTrunk.frustumCulled = willowCrown.frustumCulled = false;
sim.scene.add(willowTrunk, willowCrown);
const cBare = new THREE.Color(0x8b6a45), cLeaf = new THREE.Color(0x7cc36b);
const wm = new THREE.Matrix4();
function drawWillows() {
  for (let k = 0; k < wil.n; k++) {
    const hh = wil.h[k], s = 0.35 + hh * 1.35;
    wm.makeScale(s * (0.4 + hh * 0.6), s, s * (0.4 + hh * 0.6));
    wm.setPosition(wil.x[k], 0.05, wil.z[k]);
    willowTrunk.setMatrixAt(k, wm);
    wm.makeScale(s * hh, s, s * hh);
    wm.setPosition(wil.x[k], 0.05, wil.z[k]);
    willowCrown.setMatrixAt(k, wm);
    tc.copy(cBare).lerp(cLeaf, Math.min(1, hh * 1.3));
    willowCrown.setColorAt(k, tc);
  }
  willowTrunk.count = willowCrown.count = wil.n;
  willowTrunk.instanceMatrix.needsUpdate = willowCrown.instanceMatrix.needsUpdate = true;
  willowCrown.instanceColor.needsUpdate = true;
}

// --- Hayvan modelleri (+x yönüne bakar) ---
function part(g, x, y, z) { g.translate(x, y, z); return g; }
function deerGeometry() {
  const legs = [[0.22, 0.09], [0.22, -0.09], [-0.22, 0.09], [-0.22, -0.09]].map(([x, z]) => part(new THREE.BoxGeometry(0.07, 0.36, 0.07), x, 0.18, z));
  const g = BufferGeometryUtils.mergeGeometries([
    part(new THREE.BoxGeometry(0.66, 0.26, 0.26), 0, 0.46, 0),
    part(new THREE.BoxGeometry(0.12, 0.3, 0.12).rotateZ(-0.5), 0.33, 0.66, 0),
    part(new THREE.BoxGeometry(0.24, 0.13, 0.13), 0.46, 0.8, 0),
    part(new THREE.ConeGeometry(0.03, 0.24, 4), 0.4, 0.97, 0.06),
    part(new THREE.ConeGeometry(0.03, 0.24, 4), 0.4, 0.97, -0.06),
    part(new THREE.BoxGeometry(0.08, 0.1, 0.1), -0.36, 0.55, 0),
    ...legs,
  ]);
  return g;
}
function wolfGeometry() {
  const legs = [[0.26, 0.1], [0.26, -0.1], [-0.26, 0.1], [-0.26, -0.1]].map(([x, z]) => part(new THREE.BoxGeometry(0.09, 0.3, 0.09), x, 0.15, z));
  return BufferGeometryUtils.mergeGeometries([
    part(new THREE.BoxGeometry(0.8, 0.28, 0.3), 0, 0.42, 0),
    part(new THREE.BoxGeometry(0.26, 0.24, 0.24), 0.48, 0.55, 0),
    part(new THREE.BoxGeometry(0.2, 0.11, 0.13), 0.66, 0.5, 0),
    part(new THREE.ConeGeometry(0.05, 0.14, 4), 0.46, 0.73, 0.08),
    part(new THREE.ConeGeometry(0.05, 0.14, 4), 0.46, 0.73, -0.08),
    part(new THREE.BoxGeometry(0.4, 0.08, 0.08).rotateZ(0.5), -0.55, 0.42, 0),
    ...legs,
  ]);
}
const deerMesh = instanced(deerGeometry(), new THREE.MeshStandardMaterial({ color: 0xb07a45, roughness: 0.8 }), MAXD);
const wolfMesh = instanced(wolfGeometry(), new THREE.MeshStandardMaterial({ color: 0x5b6270, roughness: 0.7 }), MAXW);
deerMesh.frustumCulled = wolfMesh.frustumCulled = false;
sim.scene.add(deerMesh, wolfMesh);

function drawAnimals(S, mesh, base) {
  const m = mesh.instanceMatrix.array;
  for (let i = 0; i < S.n; i++) {
    const c = Math.cos(S.a[i]), s = Math.sin(S.a[i]);
    const k = base * (0.55 + 0.45 * Math.min(1, S.age[i] / 10)), o = i * 16;
    m[o] = c * k; m[o + 1] = 0; m[o + 2] = s * k; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = k; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = -s * k; m[o + 9] = 0; m[o + 10] = c * k; m[o + 11] = 0;
    m[o + 12] = S.x[i]; m[o + 13] = 0.08; m[o + 14] = S.z[i]; m[o + 15] = 1;
  }
  mesh.count = S.n;
  mesh.instanceMatrix.needsUpdate = true;
}

// Etiketler
const labels = [
  sim.label('🌊 Nehir', { position: [riverX(-HALF + 3), 1.2, -HALF + 3], className: 'plain' }),
  sim.label('🌿 Söğüt fidanları', { position: [riverX(8) + 3, 2.4, 8] }),
];

// --- Olaylar ---
let story = null; // Yellowstone senaryosu adımları
function setWolves(on, announce = true) {
  model.p.wolvesOn = on;
  if (!on) {
    model.removeWolves();
    if (announce) sim.toast('🐺 Kurtlar vadiden çıkarıldı', 'bad');
  } else {
    for (let i = 0; i < 14; i++) model.addWolf(rand(-6, 6), rand(-HALF + 2, -HALF + 6), 1.2, rand(10, 30));
    if (announce) sim.toast('🐺 Kurtlar vadiye geri döndü', 'good');
  }
  wolfBtn.innerHTML = on ? '🐺 Kurtları çıkar' : '🐺 Kurtları geri getir';
  wolfBtn.className = 'btn ' + (on ? 'danger' : 'good');
}
function drought() {
  model.drought = 26;
  sim.hud.show('<h2>☀️ Kuraklık!</h2>Yarım yıl boyunca yağmur yok: otlar çok yavaş büyüyor.', { timeout: 3500, tone: 'warn' });
}

const PRESETS = {
  denge: () => { model.reset(260, 22); setWolves(true, false); },
  kurtsuz: () => { model.reset(320, 0); setWolves(false, false); },
  yellowstone: () => {
    model.reset(260, 22); setWolves(true, false);
    story = [
      { t: 45, run: () => { setWolves(false, false); sim.hud.show('<h2>1920\'ler: Son kurtlar avlandı</h2>Yırtıcısı kalmayan geyikler çoğalmaya başlıyor…', { timeout: 5000, tone: 'bad' }); } },
      { t: 150, run: () => sim.hud.show('<h2>Onlarca yıl sonra…</h2>Geyikler nehir kıyısını rahatça otluyor; söğüt fidanları büyüyemiyor.', { timeout: 5000, tone: 'warn' }) },
      { t: 210, run: () => { setWolves(true, false); sim.hud.show('<h2>1995: Kurtlar geri döndü</h2>Kanada\'dan getirilen kurtlar parka bırakıldı. Bakalım ne olacak?', { timeout: 5000, tone: 'good' }); } },
      { t: 330, run: () => sim.hud.show('<h2>Trofik çağlayan</h2>Kurt → daha az geyik → daha çok ot ve söğüt. Grafiklerde üç dönemi karşılaştır!', { timeout: 6000, tone: 'good' }) },
    ];
  },
};

function load(name) {
  story = null;
  sim.hud.hide();
  model.p.hunting = hunting.value;
  PRESETS[name]();
  popChart.clear(); plantChart.clear();
  nextPush = 0; peakDeer = 0;
  drawTiles(); drawWillows(); drawAnimals(D, deerMesh, 1); drawAnimals(Wf, wolfMesh, 1.1);
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Senaryo');
const preset = ui.segmented({
  options: [{ value: 'denge', label: 'Dengeli vadi' }, { value: 'kurtsuz', label: 'Kurtsuz vadi' }, { value: 'yellowstone', label: 'Yellowstone hikâyesi' }],
  value: 'denge', onChange: () => { sim.reset(); sim.play(); },
});

ui.section('Olaylar');
const wolfBtn = ui.button({ label: '🐺 Kurtları çıkar', variant: 'danger', onClick: () => { story = null; setWolves(!model.p.wolvesOn); } });
ui.buttons([
  { label: '☀️ Kuraklık', variant: 'primary', onClick: drought },
  { label: '🦌 +30 geyik', onClick: () => { for (let i = 0; i < 30; i++) model.addDeer(rand(-HALF + 2, HALF - 2), rand(-HALF + 2, HALF - 2), 0.8, 15); } },
]);
const hunting = ui.toggle({ label: '🎯 Avcılık (geyik avı izni)', value: false, onChange: (v) => { model.p.hunting = v; sim.toast(v ? '🎯 Geyik avı başladı' : 'Av yasaklandı', v ? 'warn' : ''); } });

ui.section('Doğa ayarları');
ui.slider({ label: 'Geyik üreme hızı', min: 0.02, max: 0.15, step: 0.005, value: model.p.deerBirth, format: (v) => `${fmt(v * 100, 1)} % / hafta`, onChange: (v) => (model.p.deerBirth = v) });
ui.slider({ label: 'Kurt üreme hızı', min: 0.02, max: 0.16, step: 0.005, value: model.p.wolfBirth, format: (v) => `${fmt(v * 100, 1)} % / hafta`, onChange: (v) => (model.p.wolfBirth = v) });
ui.slider({ label: 'Otun yeniden büyüme hızı', min: 0.03, max: 0.3, step: 0.01, value: model.p.regrow, format: (v) => `${fmt(v / 0.14, 1)}×`, onChange: (v) => (model.p.regrow = v) });

ui.section('Durum');
const stDeer = ui.stat({ label: '🦌 Geyik' });
const stWolf = ui.stat({ label: '🐺 Kurt' });
const stGrass = ui.stat({ label: '🌱 Ot örtüsü', unit: '%' });
const stWillow = ui.stat({ label: '🌿 Söğüt boyu', unit: '%' });
const popChart = ui.chart({ title: 'Hayvan sayıları', series: [{ name: 'Geyik', color: '#d09a5c' }, { name: 'Kurt', color: '#cbd5e1' }], maxPoints: 300, yMin: 0 });
const plantChart = ui.chart({ title: 'Bitkiler (%)', series: [{ name: 'Ot', color: '#4ade80', fill: true }, { name: 'Söğüt', color: '#2dd4bf' }], maxPoints: 300, yMin: 0, yMax: 100, height: 90 });
const story_ = ui.text('', 'card');

ui.section('Görünüm', { open: false });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => labels.forEach((l) => (l.visible = v)) });
ui.buttons([
  { label: '🎥 Genel', onClick: () => sim.moveCamera([0, 31, 39], [0, -1, 2]) },
  { label: '🔍 Nehir kıyısı', onClick: () => sim.moveCamera([riverX(4) + 12, 9, 14], [riverX(4), 0, 3]) },
]);

// --- Döngü ---
let nextPush = 0, peakDeer = 0, drawTick = 0;
sim.onUpdate((dt, t) => {
  let rem = dt;
  while (rem > 1e-6) { const h = Math.min(0.1, rem); model.step(h); rem -= h; }
  if (story && story.length && t >= story[0].t) story.shift().run();
  if (t >= nextPush) {
    nextPush = Math.floor(t) + 1;
    popChart.push([D.n, Wf.n]);
    plantChart.push([model.grassCover * 100, model.willowMean * 100]);
  }
  peakDeer = Math.max(peakDeer, D.n);
});

sim.onRender(() => {
  drawAnimals(D, deerMesh, 1);
  drawAnimals(Wf, wolfMesh, 1.1);
  if (drawTick++ % 3 === 0) { drawTiles(); drawWillows(); }
  if (drawTick % 10 === 1) updateStats();
});

function updateStats() {
  const g = model.grassCover * 100, wl = model.willowMean * 100;
  stDeer.set(D.n, D.n > 450 ? 'bad' : D.n < 60 ? 'warn' : '');
  stWolf.set(Wf.n, Wf.n === 0 ? 'bad' : '');
  stGrass.set(fmt(g, 0), g < 25 ? 'bad' : g > 55 ? 'good' : '');
  stWillow.set(fmt(wl, 0), wl < 25 ? 'bad' : wl > 55 ? 'good' : '');
  let msg;
  if (model.drought > 0) msg = '☀️ <b>Kuraklık:</b> ot çok yavaş büyüyor. Aç kalan geyikler zayıflıyor, kurtlar zayıf geyikleri daha kolay yakalıyor.';
  else if (!Wf.n && D.n > 300) msg = '🦌 <b>Kurt yok:</b> geyikler hızla çoğaldı; otlar ve nehir kıyısındaki söğütler yenip bitiyor. Bir yırtıcının yokluğunun bitkilere kadar yansımasına <b>trofik çağlayan</b> denir.';
  else if (!Wf.n) msg = '🦌 <b>Kurt yok:</b> geyikleri durduracak bir yırtıcı kalmadı. Sayıları artık yalnızca otun miktarına bağlı.';
  else if (Wf.n > 35 && D.n < 150) msg = '🐺 <b>Çok kurt, az geyik:</b> kurtlar yakında aç kalacak ve azalacak. Bu arada otlar yeniden gürleşiyor.';
  else if (D.n > 400) msg = '🦌 <b>Geyik patlaması:</b> otlar hızla azalıyor. Bol yiyecek bulan kurtlar da çoğalmaya başlayacak.';
  else msg = '⚖️ <b>Döngü:</b> geyik çoğalınca kurt çoğalır → geyik azalır → kurt aç kalıp azalır → ot gürleşir, geyik yeniden çoğalır…';
  story_.set(msg);
}

// Hayvana tıkla → bilgi
sim.onClick(() => { deerMesh.computeBoundingSphere(); wolfMesh.computeBoundingSphere(); return [deerMesh, wolfMesh]; }, (hit) => {
  const i = hit.instanceId;
  if (i == null) return;
  const isDeer = hit.object === deerMesh, S = isDeer ? D : Wf;
  if (i >= S.n) return;
  const e = S.e[i], age = S.age[i];
  const state = e < 0.3 ? 'aç ve zayıf' : e > 1 ? 'tok ve güçlü' : 'idare ediyor';
  sim.toast(`${isDeer ? '🦌 <b>Geyik</b>' : '🐺 <b>Kurt</b>'} · ${fmt(age, 0)} haftalık · ${state} (enerji %${fmt(Math.min(1, e / 1.4) * 100, 0)})`);
});

sim.onReset(() => load(preset.value));
load('denge');
