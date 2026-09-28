// İlaç Dozu ve Yarı Ömür — tek bölmeli farmakokinetik: ağızdan (1. derece emilim), IV bolus ve infüzyon; tedavi penceresi.
import { createSim, THREE, fmt, clamp } from '@core';
import { buildClinic } from './clinic.js';

// Temsili ilaçlar (gerçek bir ilaca karşılık gelmez)
const DRUGS = {
  A: { name: 'İlaç A (kısa yarı ömür)', t12: 4, vd: 50, f: 0.8, ka: 1.2, fr: 0.3, dose: 500, tau: 8, mec: 3, mtc: 15 },
  B: { name: 'İlaç B (uzun yarı ömür, böbrekle atılır)', t12: 24, vd: 100, f: 0.9, ka: 0.8, fr: 0.7, dose: 100, tau: 24, mec: 0.8, mtc: 2.5 },
  C: { name: 'İlaç C (dar tedavi penceresi)', t12: 8, vd: 40, f: 0.6, ka: 1.5, fr: 0.9, dose: 300, tau: 12, mec: 3, mtc: 7 },
};

const sim = createSim({
  studio: { mood: 'day', color: 0xb4b8b0, warmth: 0.3, key: { el: 34, az: 318, power: 1.6 }, radius: 12, height: 6 },
  look: { exposure: 0.74 },
  camera: { position: [-0.62, 1.1, 0.92], target: [0.08, 0.88, -0.16], fov: 38, near: 0.02, far: 60 },
  controls: { minDistance: 0.35, maxDistance: 3.2, maxPolarAngle: Math.PI * 0.62 },
  info: `
    <p style="border:1px solid #f87171;border-radius:8px;padding:8px"><b>⚠️ Eğitim amaçlıdır.</b> İlaç A/B/C ve tüm değerler
    temsilidir, gerçek bir ilacı anlatmaz. Doz, doz aralığı veya unutulan doz kararı için mutlaka <b>hekim veya eczacıya</b> danış;
    prospektüsteki talimat bu simülasyondan önce gelir.</p>
    <h3>Ne görüyorsun?</h3>
    <p>Bir hastane odasında başucu masası. <b>Hasta monitörü</b> kandaki ilaç derişimini (C) canlı çizer: yeşil bant
    <b>tedavi penceresi</b>, kırmızı bant toksik bölgedir. Sağ alttaki büyütülmüş <b>kan örneğinde</b> parlayan ilaç parçacıklarının
    sayısı derişimle artar (gri = etkisiz, yeşil = pencerede, kırmızı = toksik). Ağızdan her dozda blisterden bir kapsül eksilir;
    ilaç bağırsaktan yavaş yavaş kana <b>emilir</b>, karaciğer ve böbrekler onu sürekli <b>temizler</b>. IV bolusta enjektör
    boşalır; infüzyonda serumdan sürekli damla düşer ve pompa hızı gösterir.</p>
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
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const R = buildClinic(sim, LOWQ);
const lbls = R.labels.map(([o, pos, t]) => sim.label(t, { parent: o, position: pos, className: 'plain' }));
const hist = [];
const HMAX = 240;

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
  if (route.value === 'oral') { gut += p.f * D; R.takePill(); }
  else if (route.value === 'iv') { blood += D; R.pushSyringe(); }
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
  R.resetPills(); hist.length = 0;
  chart.clear();
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
    if (chartAcc >= stepH) { chartAcc -= stepH; chart.push([C, d.mec, d.mtc]); hist.push(C); if (hist.length > HMAX) hist.shift(); }
    if (hours >= nextDose - 1e-9) scheduledDose();
  }
});

// --- Görsel ---
const col = new THREE.Color(), cLow = new THREE.Color(0x94a3b8), cOk = new THREE.Color(0x4ade80), cTox = new THREE.Color(0xf87171), cWarn = new THREE.Color(0xfb923c);
function concColor(C, d, out) {
  if (C < d.mec) return out.copy(cLow).lerp(cOk, clamp(C / d.mec, 0, 1) * 0.35);
  if (C <= d.mtc) return out.copy(cOk);
  return out.copy(cWarn).lerp(cTox, clamp((C - d.mtc) / (d.mtc * 0.3), 0, 1));
}
let uiT = 0, monT = 1, wall = 0, showSample = true;
sim.onRender((rdt) => {
  const d = drug(), p = pk(), C = conc();
  const top = d.mtc * 1.5;
  wall += sim.paused ? 0 : rdt;
  R.update(rdt, wall, { infusing: route.value === 'inf', ivMode: route.value !== 'oral' });
  monT += rdt;
  if (monT > 0.25) {
    monT = 0;
    const zone = C < d.mec ? 'Etkisiz düzey' : C <= d.mtc ? 'Tedavi penceresinde' : 'Toksik bölge!';
    concColor(C, d, col);
    R.drawMonitor({
      drug: d.name.split(' (')[0], time: sim.formatTime(0), top, mec: d.mec, mtc: d.mtc, hist, maxN: HMAX,
      C: fmt(C, 2), zone, zoneCol: '#' + col.getHexString(), frac: showSample ? C / top : 0, dotCol: '#' + col.getHexString(), t: wall,
      foot: `t½ ${fmt(p.t12, 1)} sa · CL ${fmt(p.cl, 1)} L/sa · doz ${doseCount} · unutulan ${missed}`,
    });
    R.drawPump(route.value === 'inf', fmt(doseSl.value / tauSl.value, 1));
  }
  uiT += rdt;
  if (uiT < 0.2) return;
  uiT = 0;
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

const O = R.objects;
sim.onClick([O.monitor, O.bottle, O.blister, O.syringe, O.bag, O.pump], (hit) => {
  let o = hit.object; const is = (x) => { let q = o; while (q) { if (q === x) return true; q = q.parent; } return false; };
  const msg = is(O.monitor) ? 'Monitör: kandaki ilaç derişimi C(t); yeşil bant tedavi penceresi.'
    : is(O.bottle) || is(O.blister) ? 'Ağızdan doz: ilaç bağırsaktan k<sub>a</sub> hızıyla kana emilir; biyoyararlanım F kadarı kana ulaşır.'
      : is(O.syringe) ? 'IV bolus: dozun tamamı anında kana geçer (F = 1).' : 'IV infüzyon: sabit hızla damla; dalgalanmasız kararlı düzey.';
  sim.toast(msg);
});

ui.section('Görünüm');
ui.toggle({ label: 'Monitörde kan örneği', value: true, onChange: (v) => { showSample = v; } });
ui.toggle({ label: 'Nesne etiketleri', value: true, onChange: (v) => lbls.forEach((l) => { l.visible = v; l.el.style.display = v ? '' : 'none'; }) });
ui.buttons([
  { label: 'Genel', onClick: () => sim.moveCamera([-0.62, 1.1, 0.92], [0.08, 0.88, -0.16]) },
  { label: 'Monitör', onClick: () => sim.moveCamera([-0.3, 1.05, 0.35], [-0.2, 1.0, -0.18]) },
  { label: 'Haplar', onClick: () => sim.moveCamera([-0.14, 0.95, 0.52], [-0.08, 0.76, 0.16]) },
]);

sim.onReset(() => restart());
restart();

