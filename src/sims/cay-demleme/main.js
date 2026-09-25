// Mükemmel Çay Demleme — çaydanlık + demlik, sıcaklığa bağlı (Arrhenius) birinci derece özütleme, difüzyon, ince belli bardakta renk.
import { createSim, THREE, fmt, clamp, rand, gauss, instanced } from '@core';

const RG = 8.314, TREF = 368.15;       // 95 °C referans
// Temsili hız sabitleri (1/dk, 95 °C'de) ve aktivasyon enerjileri (J/mol)
const K = {
  renk: { k: 0.12, Ea: 50000 },
  kaf: { k: 0.3, Ea: 35000 },
  tanH: { k: 0.15, Ea: 55000 },   // hızlı çıkan tanen kısmı
  tanY: { k: 0.012, Ea: 65000 },  // yavaş, uzun demde artmaya devam eden kısım
};
const DEM_L = 0.5, GLASS_L = 0.1;
const kAt = (c, T) => c.k * Math.exp((-c.Ea / RG) * (1 / (T + 273.15) - 1 / TREF));
const viscosity = (T) => 2.414e-5 * 10 ** (247.8 / (T + 273.15 - 140)); // suyun viskozitesi (Pa·s), Vogel tipi yaklaşım

const sim = createSim({
  background: 0x1a1512,
  camera: { position: [2.2, 4.6, 9.6], target: [0.6, 2.4, 0], fov: 45 },
  controls: { minDistance: 4, maxDistance: 22 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Altta su kaynayan <b>çaydanlık</b>, üstte buharla sıcak tutulan <b>demlik</b>. Demliği cam yaptık ki içini görebilelim:
    yapraklardan çıkan renkli minik noktalar <b>difüzyonla</b> suya yayılıyor. Sağdaki <b>ince belli bardakta</b> dem ile
    sıcak su karışıyor; rengi "açık"tan "tavşan kanı"na, oradan "koyu"ya gidiyor.</p>
    <h3>Difüzyon nedir? (çocuklar için)</h3>
    <p>Su molekülleri durmadan titreşir ve çarpışır. Yapraktan çıkan renk ve tat molekülleri bu çarpışmalarla rastgele
    itilir ve zamanla <b>kalabalık yerden tenha yere</b> yayılır. Su ne kadar sıcaksa moleküller o kadar hızlı hareket eder,
    su da daha "akışkan" olur: bu yüzden çay sıcak suda çabuk, soğuk suda çok yavaş demlenir. Karıştırmak yayılmayı hızlandırır.</p>
    <h3>Model</h3>
    <ul>
      <li>Her madde için birinci derece özütleme: <b>dC/dt = k·(C<sub>max</sub> − C)</b>. C<sub>max</sub> yaprak miktarıyla orantılı.</li>
      <li>Hız sabiti sıcaklıkla Arrhenius'a benzer artar: <b>k(T) = k₉₅·e<sup>−Ea/R·(1/T − 1/T₉₅)</sup></b>.</li>
      <li><b>Kafein</b> hızlı çıkar (birkaç dakikada çoğu suya geçer). <b>Renk</b> (teaflavin/tearubigin) biraz daha yavaş.
      <b>Tanenlerin</b> bir kısmı hızlı çıkar, bir kısmı uzun demlemede artmaya devam eder: çay uzun bekleyince burukluk
      (ağızda kuruluk) ve acılık artar, "demi kaçar".</li>
      <li>Bardak rengi Beer–Lambert yaklaşımıyla: çay mavi ışığı en çok, kırmızıyı en az soğurur; o yüzden kırmızı-amber görünür.</li>
      <li>Parçacıkların rastgele adımı D ∝ T/η (Stokes–Einstein): sıcak suyun viskozitesi (η) düşük olduğu için yayılma hızlanır.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li>"Klasik" ayarla 15 dakika demle, bardağın rengini izle; sonra dem oranını değiştir.</li>
      <li>Aynı süreyi 70 °C'de dene: renk ve tat ne kadar geride kalıyor?</li>
      <li>"Demi kaçmış" hazır ayarında 45+ dakika: kafein neredeyse sabit, burukluk artmaya devam ediyor.</li>
      <li>Karıştır düğmesine bas: yayılma ve özütleme bir süre hızlanır.</li>
    </ul>
    <p><small>Hız sabitleri, aktivasyon enerjileri ve renk/burukluk ölçekleri <b>temsilidir</b> (niteliksel eğilimleri gösterir,
    laboratuvar ölçümü değildir). Kafein tahmini, siyah çay yaprağında kuru ağırlıkça ~%3 kafein (tipik aralık %2–4) ve
    ~%85 özütleme varsayar; bardak ≈ 100 mL alınmıştır. Tanenin oksitlenmesi, suyun sertliği ve çay türü farkları yok.</small></p>`,
});
sim.formatTime = () => {
  const m = Math.floor(minutes), s = Math.floor((minutes * 60) % 60);
  return `Demleme ${m} dk ${String(s).padStart(2, '0')} sn`;
};

// --- Durum ---
let minutes = 0, stirT = 0;
const ex = { renk: 0, kaf: 0, tanH: 0, tanY: 0 };

// --- Sahne ---
const counter = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 7), new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.8 }));
counter.position.set(0.5, -0.15, 0);
sim.scene.add(counter);
const tile = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshStandardMaterial({ color: 0x2d2520, roughness: 0.9 }));
tile.position.set(0, 7, -4);
sim.scene.add(tile);
const warm = new THREE.PointLight(0xffe0b0, 14, 25, 1.5);
warm.position.set(3, 7, 5);
sim.scene.add(warm);

// Ocak
const KX = -1.2;
const burner = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.25, 40), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.5, roughness: 0.5 }));
burner.position.set(KX, 0.12, 0);
sim.scene.add(burner);
const flameMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.8 });
const flames = new THREE.Group();
for (let i = 0; i < 16; i++) {
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 6), flameMat);
  const a = (i / 16) * Math.PI * 2;
  f.position.set(KX + Math.cos(a) * 0.7, 0.36, Math.sin(a) * 0.7);
  flames.add(f);
}
sim.scene.add(flames);

// Çaydanlık (alt, metal)
const steel = new THREE.MeshStandardMaterial({ color: 0xd6d9de, metalness: 0.85, roughness: 0.25 });
const kettle = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [1.25, 0], [1.4, 0.2], [1.45, 1.4], [1.3, 1.9], [0.95, 2.1], [0.9, 2.2]].map(([x, y]) => new THREE.Vector2(x, y)), 48), steel);
kettle.position.set(KX, 0.3, 0);
sim.scene.add(kettle);
const spoutCurve = new THREE.CatmullRomCurve3([[KX + 1.3, 0.9, 0], [KX + 1.9, 1.5, 0], [KX + 2.25, 2.2, 0]].map((p) => new THREE.Vector3(...p)));
sim.scene.add(new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 20, 0.12, 10), steel));
const handle = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
handle.position.set(KX - 1.4, 1.5, 0);
handle.rotation.z = Math.PI / 2;
sim.scene.add(handle);

// Demlik (üst, cam)
const DY = 2.5, DR = 0.95, DH = 1.7;
const glassMat = new THREE.MeshPhongMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.2, shininess: 120, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
const demGlassMat = glassMat.clone();
demGlassMat.opacity = 0.1;
const demlik = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.8, 0], [DR, 0.25], [DR + 0.05, 1.1], [0.8, DH], [0.7, DH + 0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 48), demGlassMat);
demlik.position.set(KX, DY, 0);
demlik.renderOrder = 4;
sim.scene.add(demlik);
const lid = new THREE.Mesh(new THREE.SphereGeometry(0.72, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel);
lid.scale.y = 0.35;
lid.position.set(KX, DY + DH + 0.1, 0);
const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), steel);
knob.position.set(KX, DY + DH + 0.38, 0);
sim.scene.add(lid, knob);
const dSpout = new THREE.CatmullRomCurve3([[KX + 0.9, DY + 0.5, 0], [KX + 1.35, DY + 0.9, 0], [KX + 1.55, DY + 1.4, 0]].map((p) => new THREE.Vector3(...p)));
sim.scene.add(new THREE.Mesh(new THREE.TubeGeometry(dSpout, 16, 0.08, 8), glassMat));
const demLiqMat = new THREE.MeshPhongMaterial({ color: 0xfff8ec, transparent: true, opacity: 0.35, depthWrite: false, shininess: 20, specular: 0x222222 });
const LIQ_H = 1.25;
const demLiq = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.03], [0.78, 0.03], [DR - 0.04, 0.27], [DR, LIQ_H]].map(([x, y]) => new THREE.Vector2(x, y)).concat([new THREE.Vector2(0, LIQ_H)]), 40), demLiqMat);
demLiq.position.set(KX, DY, 0);
demLiq.renderOrder = 2;
sim.scene.add(demLiq);

// Yapraklar
const NL = 70;
const leaves = instanced(new THREE.BoxGeometry(0.14, 0.02, 0.06), new THREE.MeshStandardMaterial({ color: 0x2b1a0e, roughness: 0.9 }), NL);
const lf = Array.from({ length: NL }, () => ({ r: Math.sqrt(Math.random()) * 0.72, a: rand(0, Math.PI * 2), y: rand(0.06, 0.18), rot: rand(0, Math.PI), lift: 0 }));
sim.scene.add(leaves);

// Difüzyon parçacıkları
const NP = 320;
const dots = instanced(new THREE.SphereGeometry(0.028, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), NP);
dots.renderOrder = 3;
sim.scene.add(dots);
const COLS = { renk: 0xd9480f, kaf: 0xf8fafc, tan: 0x6b8e23 };
const dp = Array.from({ length: NP }, () => ({ on: false, x: 0, y: 0, z: 0 }));
let dpNext = 0;
const cc = new THREE.Color();
function emit(kind) {
  const p = dp[dpNext];
  const l = lf[Math.floor(Math.random() * NL)];
  p.on = true;
  p.x = Math.cos(l.a) * l.r; p.z = Math.sin(l.a) * l.r; p.y = l.y + l.lift + 0.03;
  dots.setColorAt(dpNext, cc.setHex(COLS[kind]));
  dots.instanceColor.needsUpdate = true;
  dpNext = (dpNext + 1) % NP;
}
dots.setColorAt(0, cc.setHex(0xffffff));

// Buhar
const NS = 40;
const steam = instanced(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }), NS);
const sp = Array.from({ length: NS }, () => ({ t: Math.random() }));
sim.scene.add(steam);

// İnce belli bardak + tabak
const GX = 2.9, GZ = 0.9;
const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.7, 0.08, 40), new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 }));
saucer.position.set(GX, 0.04, GZ);
sim.scene.add(saucer);
const gprof = [[0, 0], [0.42, 0], [0.44, 0.08], [0.36, 0.45], [0.31, 0.7], [0.36, 1.0], [0.5, 1.55], [0.52, 1.6]];
const tglass = new THREE.Mesh(new THREE.LatheGeometry(gprof.map(([x, y]) => new THREE.Vector2(x, y)), 48), glassMat);
tglass.position.set(GX, 0.08, GZ);
tglass.renderOrder = 4;
sim.scene.add(tglass);
const cupLiqMat = new THREE.MeshPhongMaterial({ color: 0xb04a1a, transparent: true, opacity: 0.88, shininess: 80 });
const lprof = [[0, 0.1], [0.38, 0.1], [0.33, 0.45], [0.28, 0.7], [0.33, 1.0], [0.45, 1.42], [0, 1.42]];
const cupLiq = new THREE.Mesh(new THREE.LatheGeometry(lprof.map(([x, y]) => new THREE.Vector2(x, y)), 40), cupLiqMat);
cupLiq.position.set(GX, 0.08, GZ);
cupLiq.renderOrder = 2;
sim.scene.add(cupLiq);
const glassLbl = sim.label('', { position: [GX, 2.15, GZ], className: 'plain' });
const demLbl = sim.label('', { position: [KX, DY + DH + 0.9, 0], className: 'plain' });
const tempLbl = sim.label('', { position: [KX + 0.2, 0.1, 2.0], className: 'plain' });

// --- Arayüz ---
const ui = sim.ui;
const PRESETS = {
  klasik: { label: 'Klasik Türk çayı (95 °C, 15 dk)', leaf: 15, T: 95, dem: 50 },
  aceleci: { label: 'Aceleci (3 dk sonra koy)', leaf: 15, T: 95, dem: 60 },
  kacmis: { label: 'Demi kaçmış (45+ dk)', leaf: 15, T: 95, dem: 50 },
  ilik: { label: 'Ilık su (70 °C)', leaf: 15, T: 70, dem: 50 },
  cok: { label: 'Bol yaprak, açık bardak', leaf: 28, T: 95, dem: 30 },
};
ui.section('Hazır ayarlar');
ui.select({ options: Object.entries(PRESETS).map(([k, p]) => ({ value: k, label: p.label })), value: 'klasik', onChange: (v) => {
  const p = PRESETS[v];
  leafSl.set(p.leaf); tempSl.set(p.T); demSl.set(p.dem);
  restart();
  if (v === 'kacmis') { advance(45); sim.toast('45 dakika ileri alındı', 'warn'); }
} });

ui.section('Demleme');
const leafSl = ui.slider({ label: 'Kuru çay (demliğe, 0,5 L su)', min: 4, max: 30, step: 1, value: 15, unit: 'g' });
const tempSl = ui.slider({ label: 'Demlikteki su sıcaklığı', min: 60, max: 100, step: 1, value: 95, unit: '°C' });
const speedSl = ui.slider({ label: 'Zaman hızı (1 sn = ? dk)', min: 0.25, max: 5, step: 0.25, value: 1, unit: 'dk' });
ui.buttons([
  { label: '🥄 Karıştır', variant: 'primary', onClick: () => { stirT = 1.5; } },
  { label: '🔄 Yeniden demle', onClick: () => restart() },
]);

ui.section('Bardak');
const demSl = ui.slider({ label: 'Dem oranı (koyu ↔ açık)', min: 10, max: 100, step: 5, value: 50, unit: '%', format: (v) => `%${v} dem · %${100 - v} su` });

ui.section('Sonuç');
const sTime = ui.stat({ label: 'Demleme süresi', unit: 'dk' });
const sCol = ui.stat({ label: 'Bardak rengi' });
const sKaf = ui.stat({ label: 'Kafein / bardak (≈)', unit: 'mg' });
const sBit = ui.stat({ label: 'Burukluk', unit: '/100' });
const mCol = ui.meter({ label: 'Renk özütlemesi', color: '#c2410c' });
const mKaf = ui.meter({ label: 'Kafein özütlemesi', color: '#e2e8f0' });
const mTan = ui.meter({ label: 'Tanen (burukluk) özütlemesi', color: '#65a30d' });
const verdict = ui.text('', 'card');
const chart = ui.chart({ title: 'Demlikte özütlenen oran (%) — zaman', series: [{ name: 'renk', color: '#ea580c' }, { name: 'kafein', color: '#e2e8f0' }, { name: 'tanen', color: '#84cc16' }], maxPoints: 360, yMin: 0, yMax: 100, format: (v) => fmt(v, 0) });

const tannin = () => 0.4 * ex.tanH + 0.6 * ex.tanY;
function advance(mins) {
  let m = mins;
  const T = tempSl.value;
  while (m > 1e-9) {
    const h = Math.min(m, 0.05);
    const boost = stirT > 0 ? 1.6 : 1;
    for (const key of Object.keys(ex)) {
      const old = ex[key];
      ex[key] = 1 - (1 - old) * Math.exp(-kAt(K[key], T) * boost * h);
      // Görsel: özütlenen miktar kadar parçacık salınır
      emitAcc[key] += (ex[key] - old) * (key === 'tanY' ? 900 : 260);
    }
    minutes += h; m -= h;
    chartAcc += h;
    if (chartAcc >= 0.25) { chartAcc = 0; chart.push([ex.renk * 100, ex.kaf * 100, tannin() * 100]); }
  }
}
const emitAcc = { renk: 0, kaf: 0, tanH: 0, tanY: 0 };
let chartAcc = 0;

function restart() {
  minutes = 0; stirT = 0; chartAcc = 0; sim.time = 0;
  for (const k of Object.keys(ex)) { ex[k] = 0; emitAcc[k] = 0; }
  dp.forEach((p) => (p.on = false));
  chart.clear();
}

// Beer–Lambert: mavi en çok soğurulur
const ABS = [0.25, 1.0, 2.2];
function teaColor(A, out) {
  return out.setRGB(Math.exp(-A * ABS[0]) * 0.98, Math.exp(-A * ABS[1]) * 0.95, Math.exp(-A * ABS[2]) * 0.9, THREE.SRGBColorSpace);
}
const colName = (A) => (A < 0.12 ? 'su gibi' : A < 0.5 ? 'çok açık' : A < 0.9 ? 'açık' : A < 1.6 ? 'tavşan kanı' : A < 2.4 ? 'koyu' : 'çok koyu');

sim.onUpdate((dt) => {
  const m = dt * speedSl.value;
  advance(m);
  stirT = Math.max(0, stirT - m);
  for (const [key, kind] of [['renk', 'renk'], ['kaf', 'kaf'], ['tanH', 'tan'], ['tanY', 'tan']]) {
    while (emitAcc[key] >= 1) { emit(kind); emitAcc[key] -= 1; }
  }
});

const dummy = new THREE.Object3D();
let uiT = 0;
sim.onRender((rdt) => {
  const T = tempSl.value;
  const t = sim.paused ? 0 : rdt;
  const stirring = stirT > 0;
  // Yapraklar: karıştırınca döner ve kalkar
  for (let i = 0; i < NL; i++) {
    const l = lf[i];
    if (stirring) { l.a += t * (2.5 - l.r); l.lift = Math.min(l.lift + t * 0.5, 0.6 * (1 - l.r)); }
    else l.lift = Math.max(0, l.lift - t * 0.25);
    dummy.position.set(KX + Math.cos(l.a) * l.r, DY + l.y + l.lift, Math.sin(l.a) * l.r);
    dummy.rotation.set(0, l.rot + l.a, 0.2);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  leaves.instanceMatrix.needsUpdate = true;
  // Difüzyon: rastgele yürüyüş, adım ∝ √(D), D ∝ T/η
  const D = ((T + 273.15) / viscosity(T)) / (293.15 / viscosity(20));
  const sig = Math.sqrt(t * speedSl.value) * 0.09 * Math.sqrt(D);
  for (let i = 0; i < NP; i++) {
    const p = dp[i];
    if (p.on) {
      p.x += gauss(0, sig); p.y += gauss(0, sig) + t * 0.02; p.z += gauss(0, sig);
      if (stirring) { const a = Math.atan2(p.z, p.x) + t * 2, r = Math.hypot(p.x, p.z); p.x = Math.cos(a) * r; p.z = Math.sin(a) * r; }
      const r = Math.hypot(p.x, p.z), rmax = DR - 0.08;
      if (r > rmax) { p.x *= rmax / r; p.z *= rmax / r; }
      p.y = clamp(p.y, 0.06, LIQ_H - 0.05);
    }
    dummy.position.set(KX + p.x, DY + p.y, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(p.on ? 1 : 0.0001);
    dummy.updateMatrix();
    dots.setMatrixAt(i, dummy.matrix);
  }
  dots.instanceMatrix.needsUpdate = true;
  // Buhar
  for (let i = 0; i < NS; i++) {
    const s = sp[i];
    s.t = (s.t + rdt * 0.35) % 1;
    dummy.position.set(KX + 2.3 + Math.sin(i * 3.1 + s.t * 4) * 0.15 * s.t, 2.3 + s.t * 2.2, Math.cos(i * 1.7) * 0.15 * s.t);
    dummy.scale.setScalar(0.4 + s.t * 1.6);
    dummy.updateMatrix();
    steam.setMatrixAt(i, dummy.matrix);
  }
  steam.instanceMatrix.needsUpdate = true;
  flames.children.forEach((f, i) => (f.scale.y = 0.8 + 0.3 * Math.sin(sim.time * 20 + i)));
  // Renkler (Beer–Lambert)
  const leafF = leafSl.value / 15, demF = demSl.value / 100;
  const Adem = 2.2 * leafF * ex.renk;        // demlikteki dem (daha uzun ışık yolu)
  teaColor(Adem, demLiqMat.color);
  demLiqMat.opacity = 0.3 + 0.62 * clamp(Adem / 1.5, 0, 1);
  const Ag = 2.4 * leafF * ex.renk * demF;   // bardak
  teaColor(Ag, cupLiqMat.color);
  cupLiqMat.opacity = 0.5 + 0.45 * clamp(Ag, 0, 1);
  uiT += rdt;
  if (uiT < 0.2) return;
  uiT = 0;
  const kaf = leafSl.value * 1000 * 0.03 * 0.85 * ex.kaf / DEM_L * GLASS_L * demF;
  const bit = 100 * clamp(tannin() * leafF * (demF / 0.5) * 0.8, 0, 1);
  sTime.set(fmt(minutes, 1));
  sCol.set(colName(Ag), Ag >= 0.9 && Ag < 1.6 ? 'good' : Ag >= 2.4 ? 'warn' : '');
  sKaf.set(fmt(kaf, 0));
  sBit.set(fmt(bit, 0), bit < 55 ? 'good' : bit < 70 ? 'warn' : 'bad');
  mCol.set(ex.renk, `%${fmt(ex.renk * 100, 0)}`);
  mKaf.set(ex.kaf, `%${fmt(ex.kaf * 100, 0)}`);
  mTan.set(tannin(), `%${fmt(tannin() * 100, 0)}`);
  const taste = bit < 30 ? 'yumuşak, hafif' : bit < 55 ? 'dengeli' : bit < 70 ? 'buruk' : 'çok buruk, acımsı (demi kaçmış)';
  let tip = '';
  if (minutes < 5) tip = 'Henüz erken: renk ve tat tam çıkmadı; kafeinin çoğu ise çoktan suya geçiyor.';
  else if (minutes > 35) tip = 'Uzun bekledi: kafein artık artmıyor, ama tanenler çıkmaya devam ediyor.';
  else if (T < 80) tip = 'Su soğuk: moleküller yavaş hareket ediyor, özütleme ve difüzyon yavaş.';
  else tip = 'Güzel bir dem aralığı. Dem oranıyla bardağın rengini ayarla.';
  verdict.set(`Tat: <b>${taste}</b> · Renk: <b>${colName(Ag)}</b><br>${tip}`);
  glassLbl.setText(`${colName(Ag)} · %${demSl.value} dem`);
  demLbl.setText(`dem: ${fmt(minutes, 0)} dk`);
  tempLbl.setText(`${fmt(T, 0)} °C · difüzyon ×${fmt(D, 1)} (20 °C'ye göre)`);
});

sim.onClick([tglass, cupLiq, demlik, demLiq], (hit) => {
  if (hit.object === tglass || hit.object === cupLiq) sim.toast('İnce belli bardak: dem + sıcak su. "Tavşan kanı" rengi çoğu kişinin sevdiği ölçüdür.');
  else sim.toast('Demlik: yapraklardan çıkan moleküller difüzyonla suya yayılıyor.');
});

sim.onReset(() => restart());
restart();
