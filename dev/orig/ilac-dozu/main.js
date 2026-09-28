// İlaç Dozu ve Yarı Ömür — tek bölmeli farmakokinetik: ağızdan (1. derece emilim), IV bolus ve infüzyon; tedavi penceresi.
import { createSim, THREE, fmt, clamp, lerp, rand, instanced } from '@core';

// Temsili ilaçlar (gerçek bir ilaca karşılık gelmez)
const DRUGS = {
  A: { name: 'İlaç A (kısa yarı ömür)', t12: 4, vd: 50, f: 0.8, ka: 1.2, fr: 0.3, dose: 500, tau: 8, mec: 3, mtc: 15 },
  B: { name: 'İlaç B (uzun yarı ömür, böbrekle atılır)', t12: 24, vd: 100, f: 0.9, ka: 0.8, fr: 0.7, dose: 100, tau: 24, mec: 0.8, mtc: 2.5 },
  C: { name: 'İlaç C (dar tedavi penceresi)', t12: 8, vd: 40, f: 0.6, ka: 1.5, fr: 0.9, dose: 300, tau: 12, mec: 3, mtc: 7 },
};

const sim = createSim({
  background: 0x0e1422,
  camera: { position: [1.2, 4.2, 11.5], target: [1.2, 3.3, 0], fov: 45 },
  controls: { minDistance: 4, maxDistance: 25 },
  info: `
    <p style="border:1px solid #f87171;border-radius:8px;padding:8px"><b>⚠️ Eğitim amaçlıdır.</b> İlaç A/B/C ve tüm değerler
    temsilidir, gerçek bir ilacı anlatmaz. Doz, doz aralığı veya unutulan doz kararı için mutlaka <b>hekim veya eczacıya</b> danış;
    prospektüsteki talimat bu simülasyondan önce gelir.</p>
    <h3>Ne görüyorsun?</h3>
    <p>Kan damarlarındaki parçacıkların <b>sayısı ve rengi</b> kandaki ilaç derişimini (C) gösterir: gri/mavi = etkisiz düzey,
    yeşil = <b>tedavi penceresi</b>, kırmızı = toksik düzey. Sağdaki cam sütun aynı derişimi ölçekli gösterir.
    Ağızdan alınan hap mideye iner, ilaç yavaş yavaş kana <b>emilir</b>; karaciğer ve böbrekler onu sürekli <b>temizler</b>.</p>
    <h3>Model</h3>
    <ul>
      <li>Tek bölmeli model: dA<sub>kan</sub>/dt = k<sub>a</sub>·A<sub>mide</sub> − k·A<sub>kan</sub>; C = A<sub>kan</sub> / V<sub>d</sub>.</li>
      <li>Eliminasyon hız sabiti k = CL / V<sub>d</sub>, yarı ömür <b>t½ = ln2 / k ≈ 0,693·V<sub>d</sub>/CL</b>.</li>
      <li>Klerens = böbrek dışı + böbrek kısmı × böbrek fonksiyonu. Böbrek zayıfladıkça t½ uzar, ilaç birikir.</li>
      <li>Kararlı durum ortalaması: <b>C<sub>ss,ort</sub> = F·Doz / (CL·τ)</b>. Kararlı duruma yaklaşık <b>4–5 yarı ömürde</b>
      (%94–97) ulaşılır; bu süre dozdan bağımsızdır, yalnızca t½'ye bağlıdır.</li>
      <li>Yükleme dozu ≈ Doz / (1 − e<sup>−kτ</sup>): ilk günden kararlı düzeye yakın başlatır.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li>İlaç B ile yükleme dozunu kapat/aç: kararlı duruma ~4–5 gün mü, ilk dozda mı ulaşılıyor?</li>
      <li>Bir doz unut: C tedavi penceresinin altına iner. Sonra "çift doz" al: tepe toksik bölgeye taşabilir.
      (Bu yüzden unutulan doz için genellikle "çift doz alma" denir; ne yapılacağını eczacı söyler.)</li>
      <li>Böbrek fonksiyonunu %30'a indir: aynı dozla ilaç birikir. Hekimler böyle durumlarda dozu ya da aralığı ayarlar.</li>
      <li>İlaç A'da doz aralığını 8 saatten 4 saate indir (dozu yarıya indirerek): dalgalanma azalır.</li>
      <li>IV infüzyon: sürekli damla, dalgalanmasız düz bir kararlı düzey verir.</li>
    </ul>
    <p><small>Sınırlar: tek bölme (dağılım anlık), doğrusal kinetik, sabit emilim; beslenme, etkileşimler, yaş, kilo, genetik ve
    aktif metabolitler yok. Kaynak: standart farmakokinetik denklemleri (ör. Rowland &amp; Tozer, <i>Clinical Pharmacokinetics
    and Pharmacodynamics</i>).</small></p>`,
});
sim.formatTime = (t) => {
  const h = hours;
  const d = Math.floor(h / 24), hh = Math.floor(h % 24), mm = Math.floor((h * 60) % 60);
  return `Gün ${d + 1} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

// --- Durum ---
let hours = 0, gut = 0, blood = 0, nextDose = 0, skipNext = false, firstDone = false;
let inWin = 0, afterFirst = 0, lastPeak = 0, lastTrough = Infinity, curPeak = 0, curTrough = Infinity, doseCount = 0, missed = 0;
const drug = () => DRUGS[drugSel.value];
const kidney = () => kidneySl.value / 100;
function pk() {
  const d = drug();
  const k0 = Math.LN2 / t12Sl.value;                 // normal böbrekte
  const cl0 = k0 * vdSl.value;
  const cl = cl0 * ((1 - d.fr) + d.fr * kidney());
  const k = cl / vdSl.value;
  return { k, cl, t12: Math.LN2 / k, ka: d.ka, f: route.value === 'oral' ? fSl.value / 100 : 1 };
}
const conc = () => blood / vdSl.value;

// --- Sahne ---
const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: 0x1a2336, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
sim.scene.add(floor);
const body = new THREE.Group();
sim.scene.add(body);
const skin = new THREE.MeshPhongMaterial({ color: 0x9fc5ff, transparent: true, opacity: 0.13, depthWrite: false, shininess: 40 });
const part = (geo, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, skin); m.position.set(x, y, z); m.rotation.z = rz; m.renderOrder = 5; body.add(m); return m; };
part(new THREE.CapsuleGeometry(1.05, 1.7, 8, 24), 0, 3.6, 0);
part(new THREE.SphereGeometry(0.62, 24, 16), 0, 5.75, 0);
part(new THREE.CylinderGeometry(0.25, 0.3, 0.5, 16), 0, 5.05, 0);
part(new THREE.CapsuleGeometry(0.28, 2.1, 6, 12), -1.45, 3.55, 0, -0.18);
part(new THREE.CapsuleGeometry(0.28, 2.1, 6, 12), 1.45, 3.55, 0, 0.18);
part(new THREE.CapsuleGeometry(0.36, 2.2, 6, 12), -0.5, 1.2, 0);
part(new THREE.CapsuleGeometry(0.36, 2.2, 6, 12), 0.5, 1.2, 0);
body.children.forEach((m) => m.scale.z = 0.7);

const organ = (geo, color, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 })); m.position.set(x, y, z); body.add(m); return m; };
const heart = organ(new THREE.SphereGeometry(0.28, 20, 14), 0xd4344a, 0.22, 4.3, 0.15);
const stomach = organ(new THREE.SphereGeometry(0.34, 20, 14), 0xf0a38a, -0.35, 3.45, 0.25);
stomach.scale.set(1.3, 0.8, 0.8);
const liver = organ(new THREE.SphereGeometry(0.4, 20, 14), 0x8b3a2b, 0.42, 3.6, 0.1);
liver.scale.set(1.3, 0.6, 0.8);
const kidneyMat = new THREE.MeshStandardMaterial({ color: 0xa0453a, roughness: 0.6 });
const kidneys = [-0.45, 0.45].map((x) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), kidneyMat); m.scale.set(0.8, 1.3, 0.8); m.position.set(x, 3.0, -0.3); body.add(m); return m; });

// Damarlar (kalpten çıkıp dönen kapalı döngüler)
const H = [0.2, 4.3, 0.1];
const loops = [
  [H, [0.1, 5.0, 0.15], [0.15, 5.9, 0.2], [-0.15, 6.0, -0.1], [-0.1, 5.0, -0.1], [0, 4.4, -0.05]],
  [H, [-0.8, 4.6, 0.1], [-1.5, 3.9, 0.1], [-1.75, 2.6, 0.05], [-1.55, 3.6, -0.1], [-0.7, 4.4, -0.1]],
  [H, [0.9, 4.6, 0.1], [1.55, 3.9, 0.1], [1.75, 2.6, 0.05], [1.5, 3.6, -0.1], [0.7, 4.4, -0.1]],
  [H, [-0.15, 3.3, 0.1], [-0.5, 1.8, 0.1], [-0.55, 0.2, 0.1], [-0.45, 1.8, -0.1], [-0.1, 3.3, -0.1]],
  [H, [0.25, 3.3, 0.1], [0.5, 1.8, 0.1], [0.55, 0.2, 0.1], [0.45, 1.8, -0.1], [0.3, 3.3, -0.1]],
  [H, [0.5, 3.8, 0.15], [0.5, 3.0, -0.25], [-0.5, 3.0, -0.25], [-0.3, 3.8, 0.0]],
].map((pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), true));
const vesselMat = new THREE.MeshStandardMaterial({ color: 0x9b1c2c, roughness: 0.5, transparent: true, opacity: 0.55 });
loops.forEach((c) => body.add(new THREE.Mesh(new THREE.TubeGeometry(c, 90, 0.045, 6, true), vesselMat)));
const lens = loops.map((c) => c.getLength());
const totLen = lens.reduce((a, b) => a + b, 0);

const NP = 360;
const parts = instanced(new THREE.SphereGeometry(0.055, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), NP);
body.add(parts);
const pp = Array.from({ length: NP }, (_, i) => {
  let r = rand(0, totLen), li = 0;
  while (r > lens[li] && li < lens.length - 1) { r -= lens[li]; li++; }
  return { li, u: rand(0, 1), off: new THREE.Vector3(rand(-0.03, 0.03), rand(-0.03, 0.03), rand(-0.03, 0.03)), th: i / NP };
});
const dummy = new THREE.Object3D();

// Seviye sütunu (3B ölçek)
const GX = 3.6, G0 = 0.4, GH = 5.6;
const gauge = new THREE.Group();
gauge.position.set(GX, 0, 0);
sim.scene.add(gauge);
const gaugeGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, GH, 32, 1, true), new THREE.MeshPhongMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
gaugeGlass.position.y = G0 + GH / 2;
gaugeGlass.renderOrder = 4;
const gaugeFill = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1, 32), new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.4, emissive: 0x000000 }));
const winBand = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
const toxBand = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.4, 32), new THREE.MeshStandardMaterial({ color: 0x334155 }));
base.position.y = 0.2;
gauge.add(gaugeGlass, gaugeFill, winBand, toxBand, base);
const lblMtc = sim.label('', { parent: gauge, position: [0.6, 0, 0], className: 'plain' });
const lblMec = sim.label('', { parent: gauge, position: [0.6, 0, 0], className: 'plain' });
const lblC = sim.label('', { parent: gauge, position: [0, G0 + GH + 0.45, 0], className: 'big' });

// Hap ve serum torbası
const pillMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
const pills = [];
function dropPill(big) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.18, 4, 10), pillMat);
  m.rotation.z = Math.PI / 2;
  if (big) m.scale.setScalar(1.4);
  body.add(m);
  pills.push({ m, t: 0 });
}
const ivGroup = new THREE.Group();
const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.15), new THREE.MeshPhongMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.7 }));
bag.position.set(-2.6, 6.2, 0.4);
const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-2.6, 5.8, 0.4], [-2.5, 4.6, 0.5], [-2.0, 3.2, 0.35], [-1.75, 2.7, 0.15]].map((p) => new THREE.Vector3(...p))), 30, 0.02, 6), new THREE.MeshBasicMaterial({ color: 0xcbd5e1 }));
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6.6, 8), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6 }));
pole.position.set(-2.9, 3.3, 0.3);
const dropM = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
ivGroup.add(bag, line, pole, dropM);
sim.scene.add(ivGroup);
const lblState = sim.label('', { position: [0, 7.1, 0], className: 'big' });

// --- Arayüz ---
const ui = sim.ui;
ui.text('⚠️ <b>Eğitim amaçlıdır.</b> İlaçlar ve değerler temsilidir. Doz kararı için hekim/eczacıya danış.', 'bad');
ui.section('Hazır senaryolar');
const SCEN = {
  std: { label: 'Standart tedavi', set: () => {} },
  load: { label: 'Yükleme dozu ile', set: () => { drugSel.set('B'); applyDrug(); loadTg.set(true); } },
  forget: { label: 'Unutkan hasta (dozların ~%30\'u atlanır)', set: () => { forgetTg.set(true); } },
  renal: { label: 'Böbrek yetmezliği (%30)', set: () => { drugSel.set('B'); applyDrug(); kidneySl.set(30); } },
  inf: { label: 'IV infüzyon', set: () => { route.set('inf'); } },
};
const scen = ui.select({ options: Object.entries(SCEN).map(([k, s]) => ({ value: k, label: s.label })), value: 'std', onChange: (v) => {
  loadTg.set(false); forgetTg.set(false); route.set('oral'); kidneySl.set(100); applyDrug(); SCEN[v].set(); restart();
} });

ui.section('İlaç');
const drugSel = ui.select({ options: Object.entries(DRUGS).map(([k, d]) => ({ value: k, label: d.name })), value: 'A', onChange: () => { applyDrug(); restart(); } });
const route = ui.segmented({ label: 'Veriliş yolu', options: [{ value: 'oral', label: 'Ağızdan' }, { value: 'iv', label: 'IV bolus' }, { value: 'inf', label: 'IV infüzyon' }], value: 'oral', onChange: () => restart() });
const doseSl = ui.slider({ label: 'Doz', min: 25, max: 1000, step: 25, value: 500, unit: 'mg' });
const tauSl = ui.slider({ label: 'Doz aralığı (τ)', min: 2, max: 48, step: 1, value: 8, unit: 'saat' });
const loadTg = ui.toggle({ label: 'İlk doz yükleme dozu olsun', value: false, onChange: () => restart() });
const forgetTg = ui.toggle({ label: 'Unutkan hasta (rastgele atlanan dozlar)', value: false });
ui.buttons([
  { label: '⏭ Sonraki dozu unut', onClick: () => { skipNext = true; sim.toast('Bir sonraki doz atlanacak', 'warn'); } },
  { label: '💊💊 Şimdi ekstra doz', variant: 'danger', onClick: () => { giveDose(doseSl.value, true); sim.toast('Ekstra doz alındı (çift doz)', 'bad'); } },
]);

ui.section('Vücut ve ilaç özellikleri');
const t12Sl = ui.slider({ label: 'Yarı ömür (normal böbrekte)', min: 1, max: 48, step: 0.5, value: 4, unit: 'saat' });
const vdSl = ui.slider({ label: 'Dağılım hacmi V<sub>d</sub>', min: 5, max: 300, step: 5, value: 50, unit: 'L' });
const fSl = ui.slider({ label: 'Biyoyararlanım F (ağızdan)', min: 10, max: 100, step: 5, value: 80, unit: '%' });
const kidneySl = ui.slider({ label: 'Böbrek fonksiyonu', min: 10, max: 100, step: 5, value: 100, unit: '%' });
const hps = ui.slider({ label: 'Zaman hızı (1 sn = ? saat)', min: 0.5, max: 12, step: 0.5, value: 3, unit: 'saat' });

ui.section('Ölçümler');
const sC = ui.stat({ label: 'Kandaki derişim', unit: 'mg/L' });
const sT12 = ui.stat({ label: 'Etkin yarı ömür', unit: 'saat' });
const sCL = ui.stat({ label: 'Klerens', unit: 'L/sa' });
const sCss = ui.stat({ label: 'Kararlı ort. (C<sub>ss</sub>)', unit: 'mg/L' });
const sPT = ui.stat({ label: 'Son aralık tepe / dip', unit: 'mg/L' });
const sWin = ui.stat({ label: 'Pencerede geçen süre', unit: '%' });
const ssMeter = ui.meter({ label: 'Kararlı duruma yaklaşma', color: '#38bdf8' });
const note = ui.text('', 'card');
const chart = ui.chart({ title: 'Kan derişimi C(t) — mg/L', series: [{ name: 'C', color: '#38bdf8', fill: true }, { name: 'en düşük etkili', color: '#22c55e' }, { name: 'toksik eşik', color: '#ef4444' }], maxPoints: 480, height: 150, format: (v) => fmt(v, v < 10 ? 1 : 0) });

function applyDrug() {
  const d = drug();
  doseSl.set(d.dose); tauSl.set(d.tau); t12Sl.set(d.t12); vdSl.set(d.vd); fSl.set(d.f * 100);
}

function giveDose(D, extra = false) {
  const p = pk();
  if (route.value === 'oral') { gut += p.f * D; dropPill(D > doseSl.value * 1.01); }
  else if (route.value === 'iv') blood += D;
  doseCount++;
  if (!extra) { lastPeak = curPeak; lastTrough = curTrough; curPeak = 0; curTrough = Infinity; }
}

function scheduledDose() {
  if (route.value === 'inf') { nextDose += tauSl.value; return; }
  const forgot = skipNext || (forgetTg.value && firstDone && Math.random() < 0.3);
  skipNext = false;
  if (forgot) { missed++; sim.toast(`Doz unutuldu (${missed}. kez)`, 'warn'); }
  else {
    let D = doseSl.value;
    if (!firstDone && loadTg.value) { D = D / (1 - Math.exp(-pk().k * tauSl.value)); sim.toast(`Yükleme dozu: ${fmt(D, 0)} mg`, 'good'); }
    giveDose(D);
  }
  firstDone = true;
  nextDose += tauSl.value;
}

function restart() {
  hours = 0; gut = 0; blood = 0; nextDose = 0; skipNext = false; firstDone = false;
  inWin = 0; afterFirst = 0; lastPeak = 0; lastTrough = Infinity; curPeak = 0; curTrough = Infinity; doseCount = 0; missed = 0;
  sim.time = 0; chartAcc = 0;
  pills.forEach((p) => { p.m.geometry.dispose(); p.m.removeFromParent(); }); pills.length = 0;
  chart.clear();
  ivGroup.visible = route.value !== 'oral';
  fSl.disable(route.value !== 'oral');
}

// --- Benzetim ---
let chartAcc = 0;
sim.onUpdate((dt) => {
  let h = dt * hps.value;
  const p = pk();
  const d = drug();
  const inf = route.value === 'inf' ? doseSl.value / tauSl.value : 0; // mg/saat
  const stepH = Math.max(0.25, t12Sl.value / 16);
  while (h > 1e-9) {
    const hs = Math.min(h, 0.05, Math.max(nextDose - hours, 1e-6));
    const g2 = gut * Math.exp(-p.ka * hs);
    const abs = gut - g2;
    gut = g2;
    blood = blood * Math.exp(-p.k * hs) + abs + inf * hs;
    hours += hs; h -= hs;
    const C = conc();
    if (firstDone || inf) { afterFirst += hs; if (C >= d.mec && C <= d.mtc) inWin += hs; }
    curPeak = Math.max(curPeak, C); curTrough = Math.min(curTrough, C);
    chartAcc += hs;
    if (chartAcc >= stepH) { chartAcc -= stepH; chart.push([C, d.mec, d.mtc]); }
    if (hours >= nextDose - 1e-9) scheduledDose();
  }
});

// --- Görsel ---
const col = new THREE.Color(), cLow = new THREE.Color(0x64748b), cOk = new THREE.Color(0x22c55e), cTox = new THREE.Color(0xef4444), cWarn = new THREE.Color(0xf97316);
function concColor(C, d, out) {
  if (C < d.mec) return out.copy(cLow).lerp(cOk, clamp(C / d.mec, 0, 1) * 0.35);
  if (C <= d.mtc) return out.copy(cOk);
  return out.copy(cWarn).lerp(cTox, clamp((C - d.mtc) / (d.mtc * 0.3), 0, 1));
}
let uiT = 0;
sim.onRender((rdt) => {
  const d = drug(), p = pk(), C = conc();
  const top = d.mtc * 1.5;
  const y = (c) => G0 + GH * clamp(c / top, 0, 1);
  // Parçacıklar: sayı ∝ derişim
  const frac = clamp(C / top, 0, 1);
  concColor(C, d, col);
  parts.material.color.copy(col);
  const t = sim.paused ? 0 : rdt;
  for (let i = 0; i < NP; i++) {
    const q = pp[i];
    q.u = (q.u + t * 0.9 / lens[q.li]) % 1;
    dummy.position.copy(loops[q.li].getPointAt(q.u)).add(q.off);
    dummy.scale.setScalar(q.th < frac ? 1 : 0.0001);
    dummy.updateMatrix();
    parts.setMatrixAt(i, dummy.matrix);
  }
  parts.instanceMatrix.needsUpdate = true;
  heart.scale.setScalar(1 + 0.08 * Math.max(0, Math.sin(sim.time * 7)));
  kidneyMat.color.setHex(0xa0453a).lerp(col.setHex(0x6b7280), 1 - kidney());
  // Haplar: ağızdan mideye
  for (let i = pills.length - 1; i >= 0; i--) {
    const q = pills[i];
    q.t += t * 0.8;
    const s = clamp(q.t, 0, 1);
    q.m.position.set(lerp(0, -0.35, s), lerp(5.55, 3.45, s), lerp(0.7, 0.3, s));
    if (q.t > 1.6) { q.m.geometry.dispose(); q.m.removeFromParent(); pills.splice(i, 1); }
  }
  stomach.material.emissive.setHex(0xf59e0b).multiplyScalar(clamp(gut / (doseSl.value || 1), 0, 1) * 0.6);
  // Serum damlası
  if (ivGroup.visible) { const k = (sim.time * 1.5) % 1; dropM.position.set(-2.6, 5.75 - k * 0.4, 0.4); dropM.visible = route.value === 'inf' || k < 0.2; }
  // Ölçek sütunu
  const fillH = Math.max(y(C) - G0, 0.001);
  gaugeFill.scale.y = fillH; gaugeFill.position.y = G0 + fillH / 2;
  gaugeFill.material.color.copy(concColor(C, d, col));
  winBand.scale.y = y(d.mtc) - y(d.mec); winBand.position.y = (y(d.mtc) + y(d.mec)) / 2;
  toxBand.scale.y = y(top) - y(d.mtc); toxBand.position.y = (y(top) + y(d.mtc)) / 2;
  lblMtc.position.y = y(d.mtc); lblMec.position.y = y(d.mec);
  uiT += rdt;
  if (uiT < 0.2) return;
  uiT = 0;
  lblMtc.setText(`— toksik eşik ${fmt(d.mtc, 1)}`);
  lblMec.setText(`— en düşük etkili ${fmt(d.mec, 1)}`);
  lblC.setText(`${fmt(C, 2)} mg/L`);
  const zone = C < d.mec ? ['Etkisiz düzey', '#94a3b8'] : C <= d.mtc ? ['Tedavi penceresinde', '#4ade80'] : ['Toksik bölge!', '#f87171'];
  lblState.setText(`<span style="color:${zone[1]}">${zone[0]}</span>`);
  sC.set(fmt(C, 2), C < d.mec ? 'warn' : C <= d.mtc ? 'good' : 'bad');
  sT12.set(fmt(p.t12, 1), kidney() < 0.6 && d.fr > 0.5 ? 'warn' : '');
  sCL.set(fmt(p.cl, 2));
  const css = route.value === 'inf' ? doseSl.value / tauSl.value / p.cl : (p.f * doseSl.value) / (p.cl * tauSl.value);
  sCss.set(fmt(css, 2), css < d.mec ? 'warn' : css <= d.mtc ? 'good' : 'bad');
  sPT.set(lastPeak > 0 && isFinite(lastTrough) ? `${fmt(lastPeak, 1)} / ${fmt(lastTrough, 1)}` : '—', lastPeak > d.mtc || lastTrough < d.mec ? 'warn' : '');
  sWin.set(afterFirst > 0 ? fmt((inWin / afterFirst) * 100, 0) : '—');
  const ssFrac = 1 - Math.exp(-p.k * hours);
  ssMeter.set(loadTg.value ? 1 : ssFrac, loadTg.value ? 'yükleme dozuyla hemen' : `%${fmt(ssFrac * 100, 0)} · ${fmt(hours / p.t12, 1)} yarı ömür geçti`);
  const tss = 4.5 * p.t12;
  note.set(`Bu koşullarda kararlı duruma ≈ <b>${fmt(tss, 0)} saat</b> (${fmt(tss / 24, 1)} gün, 4–5 × t½) sonra ulaşılır.
    Doz sayısı: <b>${doseCount}</b>, unutulan: <b>${missed}</b>. ${route.value === 'inf' ? `İnfüzyon hızı ${fmt(doseSl.value / tauSl.value, 1)} mg/saat.` : `Sonraki doz: ${fmt(Math.max(0, nextDose - hours), 1)} saat sonra.`}`);
});

sim.onClick([heart, liver, stomach, ...kidneys], (hit) => {
  const o = hit.object;
  const msg = o === heart ? 'Kalp: ilacı tüm vücuda dağıtır.' : o === liver ? 'Karaciğer: ilaçların çoğunu metabolize eder (böbrek dışı klerens).'
    : o === stomach ? 'Mide/bağırsak: hap çözünür, ilaç k<sub>a</sub> hızıyla kana emilir.' : `Böbrek: ilacı idrarla atar. Fonksiyon %${kidneySl.value}.`;
  sim.toast(msg);
});

sim.onReset(() => restart());
restart();
