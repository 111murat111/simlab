// Kan Şekeri Dengesi — basitleştirilmiş Bergman minimal modeliyle 24 saatlik glukoz–insülin dinamiği ve organ etkinliği.
import { createSim, THREE, fmt, clamp, lerp } from '@core';
import * as M from './model.js';

const MIN_PER_SEC = 10;       // 1× hızda 1 saniye = 10 dakika
const DAY_START = 7 * 60;     // gün 07:00'de başlar
const SAMPLE = 5;             // grafik örnekleme aralığı (dk)
const NS = (24 * 60) / SAMPLE;

const sim = createSim({
  background: 0x0a0f1c,
  camera: { position: [0, 0.3, 7.6], target: [0, 0.1, 0], fov: 45 },
  controls: { minDistance: 3, maxDistance: 16 },
  lights: true,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Kan şekeri (glukoz) yemekle yükselir; pankreas <b>insülin</b> salgılar, insülin kasların ve karaciğerin şekeri almasını sağlar,
    şeker yeniden normale iner. Model, basitleştirilmiş <b>Bergman minimal modelidir</b>: glukoz, uzak insülin etkisi ve plazma insülini;
    buna bağırsak emilimi (hızlı/yavaş glisemik indeks), deri altı insülin emilimi, egzersiz ve böbrek eşiği (~180 mg/dL) eklenmiştir.</p>
    <p>Gövdede <b>pankreas</b> insülin salgıladıkça, <b>karaciğer</b> şeker depolarken (yeşil) ya da salarken (turuncu), <b>kaslar</b>
    şeker aldıkça, <b>bağırsak</b> emilim yaparken parlar. Damar içindeki parçacıklar kandaki şeker miktarını gösterir.</p>
    <h3>Dene</h3>
    <ul>
      <li>Aynı 60 g karbonhidratı önce <b>hızlı</b>, sonra <b>yavaş</b> GI ile ye: yavaş olanın tepe değeri belirgin düşük.</li>
      <li><b>Tip 2</b> modunda yemekten sonra 45 dk yürüyüş ekle: kaslar insülinden bağımsız şeker çeker, tepe düşer.</li>
      <li><b>Tip 1</b> modunda bolus insülini kapat, sonra fazla doz ver ve egzersiz yap: hiperglisemi ve hipoglisemi risklerini gör.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Sağlıklı kişide açlık şekeri genelde 70–99 mg/dL, tokluk 2. saatte 140'ın altındadır. Açlıkta 100–125 prediyabet,
    ≥126 mg/dL (tekrarlanan ölçümde) diyabet sınırıdır. Diyabette sürekli glukoz izlemede hedef, zamanın <b>%70'inden fazlasını</b>
    70–180 mg/dL aralığında (TIR) geçirmektir. 70'in altı hipoglisemidir: 15 g hızlı karbonhidrat alıp 15 dk sonra yeniden ölçülür (15-15 kuralı).</p>
    <p><small>⚕️ <b>Eğitim amaçlıdır, tıbbi tavsiye değildir.</b> Model ayarlı ve basittir; insülin dozu ya da tedavi kararı için
    kullanılamaz. GMI (tahmini A1c) gerçekte en az 14 günlük sensör verisi gerektirir.</small></p>`,
});
sim.formatTime = () => `Gün ${day} · ${clock(minute)}`;
const clock = (m) => { const t = ((Math.floor(m) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

// ================= 3B gövde =================
const body = new THREE.Group();
sim.scene.add(body);
const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c6a0, transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.6 });
const skinEdge = new THREE.MeshBasicMaterial({ color: 0xf8d7b8, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false });
function skin(geo, pos, rot = [0, 0, 0], parent = body) {
  const m = new THREE.Mesh(geo, skinMat); m.position.fromArray(pos); m.rotation.fromArray(rot); parent.add(m);
  const e = new THREE.Mesh(geo, skinEdge); e.scale.setScalar(1.03); m.add(e);
  return m;
}
skin(new THREE.SphereGeometry(0.38, 32, 20), [0, 1.62, 0]);
skin(new THREE.CapsuleGeometry(0.62, 1.2, 8, 24), [0, 0.35, 0]).scale.set(1, 1, 0.62);
skin(new THREE.CylinderGeometry(0.13, 0.15, 0.25, 16), [0, 1.2, 0]);
const limbs = {};
function limb(name, x, y, len, r, rotZ) {
  const g = new THREE.Group(); g.position.set(x, y, 0); g.rotation.z = rotZ; body.add(g);
  skin(new THREE.CapsuleGeometry(r, len, 6, 16), [0, -len / 2 - r * 0.6, 0], [0, 0, 0], g);
  limbs[name] = g;
  return g;
}
limb('lArm', -0.78, 0.95, 1.05, 0.14, -0.12);
limb('rArm', 0.78, 0.95, 1.05, 0.14, 0.12);
limb('lLeg', -0.3, -0.45, 1.25, 0.2, 0.02);
limb('rLeg', 0.3, -0.45, 1.25, 0.2, -0.02);

function organ(geo, color, pos, scale = [1, 1, 1], parent = body) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: color, emissiveIntensity: 0.05 });
  const m = new THREE.Mesh(geo, mat); m.position.fromArray(pos); m.scale.fromArray(scale); parent.add(m);
  return m;
}
const brain = organ(new THREE.SphereGeometry(0.26, 24, 16), 0xf0abfc, [0, 1.66, 0], [1, 0.85, 1.05]);
const heart = organ(new THREE.SphereGeometry(0.16, 20, 14), 0xef4444, [0.1, 0.78, 0.1], [1, 1.15, 0.9]);
const liver = organ(new THREE.SphereGeometry(0.34, 24, 16), 0x9a3412, [-0.25, 0.42, 0.08], [1.25, 0.62, 0.8]);
const stomach = organ(new THREE.SphereGeometry(0.2, 20, 14), 0xf9a8d4, [0.3, 0.38, 0.12], [1, 1.3, 0.8]);
const pancreas = organ(new THREE.CapsuleGeometry(0.06, 0.45, 6, 12), 0xfacc15, [0.08, 0.2, 0.02], [1, 1, 1]);
pancreas.rotation.z = Math.PI / 2 - 0.25;
const gut = organ(new THREE.TorusKnotGeometry(0.2, 0.05, 90, 8, 3, 5), 0xfb7185, [0, -0.12, 0.05], [1.15, 0.8, 0.6]);
const kidneys = [-0.26, 0.26].map((x) => organ(new THREE.SphereGeometry(0.1, 16, 12), 0x7f1d1d, [x, 0.2, -0.18], [0.8, 1.3, 0.8]));
const muscles = [];
for (const [name, len, r] of [['lArm', 0.55, 0.1], ['rArm', 0.55, 0.1], ['lLeg', 0.75, 0.15], ['rLeg', 0.75, 0.15]]) {
  const m = organ(new THREE.CapsuleGeometry(r, len, 6, 12), 0xb91c1c, [0, -len / 2 - 0.25, 0], [1, 1, 1], limbs[name]);
  m.material.emissive.setHex(0xffd166);
  muscles.push(m);
}
const lbls = [
  sim.label('Beyin', { parent: brain, position: [0.55, 0.1, 0], className: 'plain' }),
  sim.label('Karaciğer', { parent: liver, position: [-0.75, 0.05, 0], className: 'plain' }),
  sim.label('Mide', { parent: stomach, position: [0.55, 0.1, 0], className: 'plain' }),
  sim.label('Pankreas', { parent: pancreas, position: [0, -0.55, 0], className: 'plain' }),
  sim.label('Bağırsak', { parent: gut, position: [0.6, -0.1, 0], className: 'plain' }),
  sim.label('Kaslar', { parent: muscles[3], position: [0.45, 0, 0], className: 'plain' }),
];
const bodyLbl = sim.label('', { parent: body, position: [0, 2.35, 0], className: 'big' });

// Kan dolaşımındaki glukoz parçacıkları
const NP = 160;
const partGeo = new THREE.SphereGeometry(0.035, 8, 6);
const parts = new THREE.InstancedMesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NP);
parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
body.add(parts);
const vessel = new THREE.CatmullRomCurve3([
  [0.1, 0.8, 0.12], [0.6, 1.0, 0.05], [0.8, 0.2, 0.05], [0.4, -1.2, 0.05], [0.3, -2.0, 0.05], [0.1, -0.6, 0.1],
  [-0.1, -0.6, 0.1], [-0.3, -2.0, 0.05], [-0.4, -1.2, 0.05], [-0.8, 0.2, 0.05], [-0.6, 1.0, 0.05], [0, 1.45, 0.05],
].map((p) => new THREE.Vector3(...p)), true);
const vesselLine = new THREE.Mesh(new THREE.TubeGeometry(vessel, 160, 0.025, 6, true), new THREE.MeshBasicMaterial({ color: 0x7f1d1d, transparent: true, opacity: 0.45 }));
body.add(vesselLine);
const partOffset = Array.from({ length: NP }, () => Math.random());
const _m = new THREE.Matrix4(), _p = new THREE.Vector3();

const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.35;
sim.scene.add(floor);
const bed = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 1.6), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 }));
bed.position.set(0, -1.9, 0);
bed.visible = false;
sim.scene.add(bed);

// ================= Durum =================
let profile = 'saglikli';
let s, minute = DAY_START, day = 1, events = [], sleepUntil = -1, exerciseUntil = -1, exerciseStart = -1, sampleClock = 0;
let gData = [], iData = [], prevG = [], stats = { n: 0, sum: 0, tir: 0, normal: 0, hypo: 0 };
let hypoAlert = false, hyperAlert = false, lastRates = { Ra: 0, sec: 0, muscle: 0, hepatic: 0, renal: 0 };
const firedToday = new Set();

// ================= Arayüz =================
const ui = sim.ui;
ui.section('Kişi');
const profSel = ui.segmented({
  options: [{ value: 'saglikli', label: 'Sağlıklı' }, { value: 'direnc', label: 'İnsülin direnci' }, { value: 'tip1', label: 'Tip 1' }, { value: 'tip2', label: 'Tip 2' }],
  value: 'saglikli', onChange: (v) => { profile = v; restart(); },
});
const autoTg = ui.toggle({ label: 'Tipik gün programı (öğün, yürüyüş, uyku)', value: true });

ui.section('Öğün');
const carbSl = ui.slider({ label: 'Karbonhidrat', min: 10, max: 150, step: 5, value: 60, unit: 'g' });
const giSel = ui.segmented({ label: 'Glisemik indeks', options: [{ value: 'hizli', label: 'Hızlı (beyaz ekmek, şekerli içecek)' }, { value: 'yavas', label: 'Yavaş (bulgur, baklagil)' }], value: 'hizli' });
ui.buttons([
  { label: '🍽 Öğün ye', variant: 'primary', onClick: () => meal(carbSl.value, giSel.value === 'hizli') },
  { label: '🍬 15 g hızlı şeker', onClick: () => meal(15, true, '🍬') },
]);

ui.section('Egzersiz ve uyku');
const exSl = ui.slider({ label: 'Egzersiz süresi (orta tempo)', min: 15, max: 120, step: 5, value: 45, unit: 'dk' });
ui.buttons([
  { label: '🏃 Egzersiz yap', variant: 'good', onClick: () => exercise(exSl.value) },
  { label: '🌙 Uyu (8 saat)', onClick: () => sleep(480) },
]);

const insSec = ui.section('İnsülin (yalnız Tip 1)');
const basalSl = ui.slider({ label: 'Bazal insülin (uzun etkili)', min: 0, max: 40, step: 1, value: 20, unit: 'Ü/gün' });
const doseSl = ui.slider({ label: 'Bolus dozu (hızlı etkili)', min: 1, max: 20, step: 0.5, value: 5, unit: 'Ü' });
const ratioSl = ui.slider({ label: 'Otomatik bolus oranı: 1 Ü /', min: 5, max: 25, step: 1, value: 12, unit: 'g karbonhidrat' });
const autoBolusTg = ui.toggle({ label: 'Programdaki öğünlerde otomatik bolus', value: true });
ui.buttons([{ label: '💉 Bolus insülin', variant: 'primary', onClick: () => injectBolus(doseSl.value) }]);
const insNote = ui.text('', 'card');

ui.section('Hazır senaryolar');
ui.buttons([
  { label: '🎂 Pasta (100 g hızlı)', onClick: () => meal(100, true, '🎂') },
  { label: '🚶 Yemek sonrası yürüyüş', onClick: () => { meal(60, true); exercise(45, 30); } },
]);
ui.buttons([
  { label: '⚠️ Tip 1: yemeksiz doz', variant: 'danger', onClick: () => { if (profile !== 'tip1') { profSel.set('tip1'); profile = 'tip1'; restart(); } autoTg.set(false); injectBolus(10); } },
  { label: '🌅 Yeni gün', onClick: () => restart() },
]);

ui.section('Kan şekeri (24 saat)');
const cv = document.createElement('canvas');
cv.style.width = '100%';
cv.style.display = 'block';
ui.append(cv);
ui.text(`<div style="font-size:11px;opacity:.8;line-height:1.5"><span style="color:#60a5fa">━</span> glukoz (mg/dL) ·
  <span style="color:#c084fc">━</span> insülin (µU/mL, sağ eksen) · bantlar: <span style="color:#f87171">&lt;70 hipo</span> ·
  <span style="color:#4ade80">70–140 normal</span> · <span style="color:#fbbf24">&gt;180 hiper</span></div>`);
const stG = ui.stat({ label: 'Şu an', unit: 'mg/dL' });
const stI = ui.stat({ label: 'İnsülin', unit: 'µU/mL' });
const stAvg = ui.stat({ label: 'Ortalama (bugün)', unit: 'mg/dL' });
const stTir = ui.stat({ label: 'TIR 70–180', unit: '%' });
const stNorm = ui.stat({ label: 'Normal 70–140', unit: '%' });
const stHypo = ui.stat({ label: 'Hipo <70', unit: '%' });
const stGmi = ui.stat({ label: 'GMI (tahmini A1c)', unit: '%' });
const stState = ui.stat({ label: 'Durum' });
ui.text('<small>⚕️ Eğitim amaçlıdır, tıbbi tavsiye değildir. Bu simülasyon insülin dozu veya tedavi kararı için kullanılamaz.</small>', 'bad');

// ================= Olaylar =================
function logEvent(icon) { events.push({ m: minute, icon }); }
function meal(g, fast, icon) {
  M.eat(s, g, fast);
  logEvent(icon || (fast ? '🍞' : '🥗'));
  sim.toast(`${icon || '🍽'} ${g} g karbonhidrat (${fast ? 'hızlı' : 'yavaş'} GI)`);
}
function exercise(dur, delay = 0) {
  exerciseUntil = Math.max(exerciseUntil, minute + delay + dur);
  exerciseStart = minute + delay;
  events.push({ m: minute + delay, icon: '🏃' });
  if (sleepUntil > minute) sleepUntil = minute;
}
function sleep(dur) { sleepUntil = minute + dur; logEvent('🌙'); sim.toast('🌙 Uyku: 8 saat oruç; sabaha karşı "şafak olayı"na dikkat'); }
function injectBolus(u) {
  if (profile !== 'tip1') { sim.toast('İnsülin dozu bu simülasyonda yalnız Tip 1 modunda kullanılır', 'warn'); return; }
  M.inject(s, u);
  logEvent('💉');
  sim.toast(`💉 ${fmt(u, 1)} Ü hızlı etkili insülin`);
}

// Tipik gün (günün dakikası)
const PLAN = [
  { at: 7 * 60 + 30, id: 'kahvalti', run: () => planMeal(50, false, '🥣') },
  { at: 12 * 60 + 30, id: 'ogle', run: () => planMeal(70, false, '🍲') },
  { at: 16 * 60, id: 'ara', run: () => planMeal(25, true, '🍪') },
  { at: 18 * 60, id: 'yuruyus', run: () => exercise(45) },
  { at: 19 * 60 + 30, id: 'aksam', run: () => planMeal(80, false, '🍝') },
  { at: 23 * 60, id: 'uyku', run: () => sleep(480) },
];
function planMeal(g, fast, icon) {
  meal(g, fast, icon);
  if (profile === 'tip1' && autoBolusTg.value) { M.inject(s, g / ratioSl.value); }
}

// ================= Hesap =================
function restart() {
  s = M.createState(profile);
  const basal = profile === 'tip1' ? basalSl.value / 1440 : 0;
  for (let t = 0; t < 900; t += 0.5) M.step(s, 0.5, profile, { basal });
  minute = DAY_START; day = 1; events = []; sleepUntil = -1; exerciseUntil = -1; exerciseStart = -1; sampleClock = 0;
  gData = []; iData = []; prevG = []; stats = { n: 0, sum: 0, tir: 0, normal: 0, hypo: 0 };
  hypoAlert = hyperAlert = false; firedToday.clear();
  const t1 = profile === 'tip1';
  [basalSl, doseSl, ratioSl].forEach((c) => c.disable(!t1));
  insNote.set(t1 ? 'Tip 1\'de pankreas insülin üretmez: bazal + öğün (bolus) insülini gerekir.'
    : profile === 'tip2' ? 'Tip 2\'de insülin var ama etkisi zayıf (direnç) ve salgı yetersiz. Bu modelde tedavi yok; yaşam tarzı etkilerini dene.'
      : 'Pankreas insülini kendi ayarlar; dışarıdan insülin gerekmez.');
  insSec.parentElement.style.opacity = t1 ? '1' : '0.6';
  drawChart();
}

function dawnFactor(m) {
  const h = ((m % 1440) + 1440) % 1440 / 60;
  return h >= 3.5 && h <= 8.5 ? 0.12 * Math.sin(((h - 3.5) / 5) * Math.PI) : 0;
}

sim.onUpdate((dt) => {
  let mins = Math.min(dt, 0.8) * MIN_PER_SEC;
  const basal = profile === 'tip1' ? basalSl.value / 1440 : 0;
  while (mins > 1e-6) {
    const h = Math.min(0.5, mins);
    // Program
    if (autoTg.value) {
      const dm = minute - DAY_START - (day - 1) * 1440 + DAY_START;
      for (const p of PLAN) {
        const at = p.at >= DAY_START ? p.at : p.at + 1440;
        if (dm >= at && !firedToday.has(p.id)) { firedToday.add(p.id); p.run(); }
      }
    }
    const exercising = minute >= exerciseStart && minute < exerciseUntil;
    lastRates = M.step(s, h, profile, { basal, exercising, dawnFactor: dawnFactor(minute) });
    minute += h; mins -= h; sampleClock += h;
    if (sampleClock >= SAMPLE) {
      sampleClock -= SAMPLE;
      gData.push(s.G); iData.push(s.I);
      stats.n++; stats.sum += s.G;
      if (s.G >= 70 && s.G <= 180) stats.tir++;
      if (s.G >= 70 && s.G <= 140) stats.normal++;
      if (s.G < 70) stats.hypo++;
    }
    if (minute - DAY_START >= day * 1440) newDay();
  }
  // Uyarılar
  if (s.G < 70 && !hypoAlert) { hypoAlert = true; sim.toast('⚠️ Hipoglisemi (&lt;70 mg/dL)! 15 g hızlı karbonhidrat al, 15 dk sonra yeniden ölç (15-15 kuralı).', 'bad'); }
  if (s.G > 85) hypoAlert = false;
  if (s.G > 250 && !hyperAlert) { hyperAlert = true; sim.toast('Kan şekeri çok yüksek (&gt;250 mg/dL). Gerçekte doktorun önerdiği plana göre hareket edilir.', 'warn'); }
  if (s.G < 200) hyperAlert = false;
});

function newDay() {
  day++;
  prevG = gData; gData = []; iData = []; events = events.filter((e) => e.m >= minute - 1);
  firedToday.clear();
  stats = { n: 0, sum: 0, tir: 0, normal: 0, hypo: 0 };
}

// ================= Grafik =================
let chartTick = 0;
function drawChart() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const Wd = cv.clientWidth || 260, H = 180;
  if (cv.width !== Math.round(Wd * dpr)) { cv.width = Math.round(Wd * dpr); cv.height = H * dpr; cv.style.height = H + 'px'; }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, Wd, H);
  const pl = 30, pr = 26, pt = 8, pb = 26, iw = Wd - pl - pr, ih = H - pt - pb;
  const gMin = 40, gMax = 400;
  const Y = (g) => pt + ih * (1 - (clamp(g, gMin, gMax) - gMin) / (gMax - gMin));
  const X = (i) => pl + (iw * i) / NS;
  const band = (a, b, col) => { c.fillStyle = col; c.fillRect(pl, Y(b), iw, Y(a) - Y(b)); };
  band(gMin, 70, 'rgba(248,113,113,.18)');
  band(70, 140, 'rgba(74,222,128,.16)');
  band(140, 180, 'rgba(250,204,21,.07)');
  band(180, gMax, 'rgba(251,146,60,.12)');
  c.font = '10px system-ui'; c.fillStyle = 'rgba(148,163,184,.9)'; c.textAlign = 'right'; c.textBaseline = 'middle';
  for (const g of [70, 140, 180, 250, 400]) {
    c.strokeStyle = 'rgba(148,163,184,.18)'; c.beginPath(); c.moveTo(pl, Y(g)); c.lineTo(pl + iw, Y(g)); c.stroke();
    c.fillText(String(g), pl - 3, Y(g));
  }
  c.textAlign = 'left';
  for (const u of [0, 50, 100]) c.fillText(String(u), pl + iw + 3, pt + ih * (1 - u / 120));
  c.textAlign = 'center'; c.textBaseline = 'top';
  for (let hh = 0; hh <= 24; hh += 4) c.fillText(clock(DAY_START + hh * 60), X((hh * 60) / SAMPLE), pt + ih + 13);
  const line = (arr, col, f, w = 2) => {
    if (arr.length < 2) return;
    c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath();
    arr.forEach((v, i) => (i ? c.lineTo(X(i), f(v)) : c.moveTo(X(i), f(v))));
    c.stroke();
  };
  line(prevG, 'rgba(96,165,250,.28)', Y, 1.5);
  line(iData, '#c084fc', (u) => pt + ih * (1 - clamp(u, 0, 120) / 120), 1.5);
  line(gData, '#60a5fa', Y, 2.2);
  // Şimdi çizgisi ve olaylar
  const nowI = (minute - DAY_START - (day - 1) * 1440) / SAMPLE;
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(nowI), pt); c.lineTo(X(nowI), pt + ih); c.stroke();
  c.font = '11px system-ui'; c.textBaseline = 'bottom';
  for (const e of events) {
    const i = (e.m - DAY_START - (day - 1) * 1440) / SAMPLE;
    if (i >= 0 && i <= NS) c.fillText(e.icon, X(i), pt + ih + 12);
  }
}

// ================= Görsel güncelleme =================
const col = new THREE.Color();
let lie = 0, walk = 0;
sim.onRender((rdt) => {
  if (!s) return;
  if (++chartTick % 4 === 0) drawChart();
  const G = s.G;
  // Organ ışımaları
  const glow = (m, v, c1) => { m.material.emissiveIntensity = lerp(m.material.emissiveIntensity, 0.05 + clamp(v, 0, 1) * 1.6, 0.15); if (c1 != null) m.material.emissive.setHex(c1); };
  glow(pancreas, lastRates.sec / 12);
  glow(gut, lastRates.Ra / 5);
  glow(stomach, (s.gutF[0] + s.gutS[0]) / 60);
  const hep = lastRates.hepatic;
  glow(liver, Math.abs(hep) / 3, hep < 0 ? 0x22c55e : 0xf97316);
  muscles.forEach((m) => glow(m, lastRates.muscle / 4));
  kidneys.forEach((k) => glow(k, lastRates.renal / 1.5, 0xfbbf24));
  glow(brain, G < 70 ? 0.1 : 0.35);
  brain.material.color.setHex(G < 60 ? 0x6b7280 : 0xf0abfc);
  heart.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.05);
  // Kandaki glukoz parçacıkları
  const visible = Math.round(clamp(G / 400, 0.05, 1) * NP);
  const tt = performance.now() / 1000 * 0.03;
  for (let i = 0; i < NP; i++) {
    if (i < visible) { vessel.getPointAt((partOffset[i] + tt) % 1, _p); _m.makeTranslation(_p.x, _p.y, _p.z + 0.02); }
    else _m.makeScale(0, 0, 0);
    parts.setMatrixAt(i, _m);
  }
  parts.instanceMatrix.needsUpdate = true;
  if (G < 70) col.setHex(0x60a5fa); else if (G <= 140) col.setHex(0x4ade80); else if (G <= 180) col.setHex(0xfacc15); else col.setHex(0xf97316);
  parts.material.color.lerp(col, 0.1);
  // Uyku: yatar; egzersiz: yürür
  const sleeping = minute < sleepUntil;
  const exercising = minute >= exerciseStart && minute < exerciseUntil;
  lie = lerp(lie, sleeping ? 1 : 0, Math.min(1, rdt * 3));
  body.rotation.z = -lie * Math.PI / 2;
  body.position.y = -lie * 1.3;
  bed.visible = lie > 0.5;
  if (exercising && !sim.paused) walk += rdt * 6;
  const sw = exercising ? Math.sin(walk) * 0.45 : 0;
  limbs.lLeg.rotation.x = sw; limbs.rLeg.rotation.x = -sw;
  limbs.lArm.rotation.x = -sw * 0.8; limbs.rArm.rotation.x = sw * 0.8;
  const sun = sim.scene.userData.sun;
  if (sun) sun.intensity = lerp(sun.intensity, sleeping ? 0.5 : 2.2, 0.05);
  bodyLbl.setText(`${fmt(G, 0)} mg/dL${sleeping ? ' · 😴' : exercising ? ' · 🏃' : ''}`);
  bodyLbl.el.style.color = G < 70 ? '#93c5fd' : G <= 140 ? '#86efac' : G <= 180 ? '#fde047' : '#fdba74';
  // İstatistik
  if (chartTick % 8) return;
  stG.set(fmt(G, 0), G < 70 ? 'bad' : G > 180 ? 'warn' : 'good');
  stI.set(fmt(s.I, 0));
  if (stats.n) {
    const avg = stats.sum / stats.n;
    stAvg.set(fmt(avg, 0));
    const tir = (stats.tir / stats.n) * 100;
    stTir.set(fmt(tir, 0), tir >= 70 ? 'good' : tir >= 50 ? 'warn' : 'bad');
    stNorm.set(fmt((stats.normal / stats.n) * 100, 0));
    const hy = (stats.hypo / stats.n) * 100;
    stHypo.set(fmt(hy, 1), hy > 4 ? 'bad' : hy > 1 ? 'warn' : '');
    stGmi.set(fmt(3.31 + 0.02392 * avg, 1));
  }
  stState.set(sleeping ? 'Uyku' : exercising ? 'Egzersiz' : s.gutF[1] + s.gutS[1] + s.gutF[0] + s.gutS[0] > 3 ? 'Sindirim' : 'Dinlenme');
});

sim.onReset(() => restart());
restart();
