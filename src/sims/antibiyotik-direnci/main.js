// Antibiyotik Direnci — petri kabında direnç geni taşıyan bakteriler, doz takvimi, farmakokinetik ve seçilim.
import { createSim, THREE, fmt, clamp, heatColor, instanced, TAU } from '@core';
import { createModel, BINS, DR, K } from './model.js';

const HOURS_PER_SEC = 2;   // 1× hızda 1 sn = 2 saat
const H = 0.25;            // model adımı (saat)
const END = 21 * 24;       // varsayılan gözlem süresi (saat)
const T0 = 6;              // ilk doz saati
const MAXV = 1500;         // ekranda en çok hücre
const DISH_R = 5;
const AGAR_Y = 0.26;

const sim = createSim({
  background: 0x0c1220,
  camera: { position: [0, 8.6, 8.8], target: [0, 0, 0.4], fov: 46 },
  controls: { minDistance: 5, maxDistance: 26 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Petri kabında bir bakteri popülasyonu var. Her bakterinin bir <b>direnç düzeyi</b> (MIC: onu durdurmaya yetecek en düşük
    ilaç derişimi) vardır ve bu özellik yavrulara geçer. Bölünme sırasında nadiren <b>mutasyon</b> olur; bazı yavrular biraz daha
    dirençli doğar. Direnç ücretsiz değildir: dirençli bakteriler ilaçsız ortamda biraz daha yavaş çoğalır.</p>
    <p>Renkler direnci gösterir: <b style="color:#60a5fa">mavi</b> hassas, <b style="color:#facc15">sarı</b>–<b style="color:#f97316">turuncu</b>
    orta, <b style="color:#ef4444">kırmızı</b> çok dirençli. Mor sis, ilacın kaptaki derişimidir.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Tam tedavi</b> senaryosunu izle: son kalan az sayıdaki dirençli hücre de temizlenir.</li>
      <li><b>Erken bırak</b>: bakteri sayısı çok düşmüşken ilacı kes. Hayatta kalanlar çoğunlukla dirençlidir ve popülasyon
        onların yavrularıyla yeniden büyür (nüks). Sonra “aynı ilaçla yeniden tedavi”yi dene.</li>
      <li>Doz aralığını 24 saate çıkar veya yarılanma ömrünü kısalt: ilaç dozlar arasında MIC'in altına düşer, dirençliler seçilir.</li>
    </ul>
    <h3>Model</h3>
    <p>İlaç derişimi tek bölmeli farmakokinetikle azalır: <b>C(t) = C₀·e<sup>−kt</sup></b>, k = ln2 / yarılanma ömrü; her dozda
    derişim artar ve birikir. Öldürme hızı Emax/Hill eğrisini izler: <b>E = Emax·xⁿ/(1+xⁿ)</b>, x = C / (MIC·EC50).
    Büyüme lojistiktir (taşıma kapasitesi ≈ 10⁹ bakteri); bağışıklık sistemi seyrek popülasyonları temizlemeye yardım eder.
    Milyarlarca bakteri hesaplanır; ekranda <b>logaritmik ölçekle</b> en çok ${fmt(MAXV)} hücre çizilir, 200'ün altında her nokta
    tek bir bakteridir. Nadir mutantlar en az bir hücreyle gösterilir.</p>
    <p><small>Sayılar temsilidir; gerçek ilaç, doz ve süreler bakteri türüne ve hastaya göre değişir.</small></p>
    <h3>Gerçek hayatta</h3>
    <p>Antibiyotiği yalnızca hekim reçete ettiğinde, önerilen doz, aralık ve sürede kullan; kendi kendine yarıda bırakma, artanı
    saklama, başkasıyla paylaşma. Antibiyotikler grip ve soğuk algınlığı gibi virüs hastalıklarına etki etmez. Gereksiz kullanım
    dirençli bakterilerin seçilmesini hızlandırır.</p>`,
});

// --- Sahne: masa, petri kabı, agar ---
{
  const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: 0.9 }));
  table.rotation.x = -Math.PI / 2;
  sim.scene.add(table);
  const agar = new THREE.Mesh(new THREE.CylinderGeometry(DISH_R + 0.15, DISH_R + 0.15, 0.24, 72),
    new THREE.MeshStandardMaterial({ color: 0xe6cf86, roughness: 0.55 }));
  agar.position.y = 0.13;
  sim.scene.add(agar);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(DISH_R + 0.3, DISH_R + 0.3, 0.7, 72, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.22, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = 0.35;
  sim.scene.add(glass);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(DISH_R + 0.3, 0.05, 8, 96),
    new THREE.MeshStandardMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.55 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.7;
  sim.scene.add(rim);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(DISH_R + 0.3, DISH_R + 0.3, 0.03, 72),
    new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.3 }));
  base.position.y = 0.015;
  sim.scene.add(base);
}

// İlaç sisi (derişime göre opaklık)
const drugMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0, depthWrite: false });
const drugFog = new THREE.Mesh(new THREE.CylinderGeometry(DISH_R + 0.25, DISH_R + 0.25, 0.4, 72), drugMat);
drugFog.position.y = 0.46;
sim.scene.add(drugFog);

// Doz damlası ve halka dalgası
const drop = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc084fc, emissive: 0x6b21a8, emissiveIntensity: 0.6 }));
drop.visible = false;
sim.scene.add(drop);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xd8b4fe, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.y = AGAR_Y + 0.03;
sim.scene.add(ring);
let dropAnim = -1, ringAnim = -1;

const status = sim.label('', { position: [0, 1.6, -DISH_R - 0.6], className: 'big' });

// --- Bakteri hücreleri (temsilî) ---
const cellGeo = new THREE.CapsuleGeometry(0.055, 0.13, 2, 6);
cellGeo.rotateZ(Math.PI / 2);
const cellMesh = instanced(cellGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXV);
cellMesh.frustumCulled = false;
sim.scene.add(cellMesh);
const mArr = cellMesh.instanceMatrix.array;
cellMesh.setColorAt(0, new THREE.Color(1, 1, 1));
const cArr = cellMesh.instanceColor.array;

const cx = new Float32Array(MAXV), cz = new Float32Array(MAXV), ca = new Float32Array(MAXV);
const cbin = new Int8Array(MAXV);
const cstate = new Uint8Array(MAXV); // 0 boş, 1 canlı, 2 ölüyor
const clife = new Float32Array(MAXV); // doğum: 0→1 büyüme, ölüm: 1→0
const binCol = [];
for (let i = 0; i < BINS; i++) binCol.push(heatColor(Math.min(1, i / 6) * 0.95 + (i ? 0.05 : 0)));
const plainCol = new THREE.Color(0x86efac);
const deadCol = new THREE.Color(0x6b7280);
const tmpCol = new THREE.Color();
const colonies = [];
function newColonies() {
  colonies.length = 0;
  for (let k = 0; k < 18; k++) {
    const r = Math.sqrt(Math.random()) * (DISH_R - 1), a = Math.random() * TAU;
    colonies.push([Math.cos(a) * r, Math.sin(a) * r, 0.45 + Math.random() * 0.45]);
  }
}

const aliveIdx = new Int32Array(MAXV), binStart = new Int32Array(BINS + 1), binCnt = new Int32Array(BINS + 1);
const target = new Int32Array(BINS);

function visCount(N) {
  if (N < 1) return 0;
  if (N < 200) return Math.round(N);
  return Math.min(MAXV, Math.round(200 + (MAXV - 200) * (Math.log10(N) - Math.log10(200)) / (Math.log10(K) - Math.log10(200))));
}

const _pt = [0, 0];
function colonyPoint() {
  // yuvarlak koloni: merkezin çevresinde disk içinde düzgün dağılım
  const c = colonies[Math.floor(Math.random() * colonies.length)];
  const r = c[2] * Math.sqrt(Math.random()), a = Math.random() * TAU;
  _pt[0] = c[0] + Math.cos(a) * r; _pt[1] = c[1] + Math.sin(a) * r;
  return _pt;
}

function spawnAt(s, bin, instant) {
  // ebeveyn: aynı sınıftan (yoksa herhangi) canlı hücre
  let par = -1;
  const n0 = binStart[bin + 1] - binStart[bin];
  if (n0 > 0) par = aliveIdx[binStart[bin] + Math.floor(Math.random() * n0)];
  else if (binStart[BINS] > 0) par = aliveIdx[Math.floor(Math.random() * binStart[BINS])];
  let x, z;
  if (par >= 0) {
    const a = Math.random() * TAU, d = 0.12 + Math.random() * 0.14;
    x = cx[par] + Math.cos(a) * d; z = cz[par] + Math.sin(a) * d;
  } else {
    [x, z] = colonyPoint();
  }
  if (x * x + z * z > (DISH_R - 0.2) ** 2) [x, z] = colonyPoint();
  cx[s] = x; cz[s] = z; ca[s] = Math.random() * TAU; cbin[s] = bin; cstate[s] = 1; clife[s] = instant ? 1 : 0;
}

let freePtr = 0;
function freeSlot() {
  for (let k = 0; k < MAXV; k++) {
    const s = (freePtr + k) % MAXV;
    if (cstate[s] === 0) { freePtr = s + 1; return s; }
  }
  return -1;
}

/** Ekrandaki hücreleri modeldeki sınıf dağılımına yaklaştırır (ölenler solar, yeniler ebeveyn yanında doğar). */
function reconcile(instant = false) {
  const N = m.total();
  const V = visCount(N);
  for (let b = 0; b < BINS; b++) {
    const nb = m.n[b];
    let t = N > 0 ? Math.round((V * nb) / N) : 0;
    if (nb >= 1 && t === 0) t = 1; // nadir mutant en az bir hücreyle
    target[b] = Math.min(t, Math.ceil(nb));
  }
  // canlıları sınıflara göre sırala
  binCnt.fill(0);
  for (let s = 0; s < MAXV; s++) if (cstate[s] === 1) binCnt[cbin[s]]++;
  let acc = 0;
  for (let b = 0; b <= BINS; b++) { binStart[b] = acc; acc += b < BINS ? binCnt[b] : 0; }
  binCnt.fill(0);
  for (let s = 0; s < MAXV; s++) if (cstate[s] === 1) { const b = cbin[s]; aliveIdx[binStart[b] + binCnt[b]++] = s; }
  for (let b = 0; b < BINS; b++) {
    const have = binStart[b + 1] - binStart[b];
    if (have > target[b]) {
      let kill = have - target[b];
      const off = Math.floor(Math.random() * have);
      for (let k = 0; k < have && kill > 0; k++) {
        const s = aliveIdx[binStart[b] + ((off + k * 7) % have)];
        if (cstate[s] !== 1) continue;
        if (instant) { cstate[s] = 0; } else { cstate[s] = 2; clife[s] = 1; }
        kill--;
      }
    } else if (have < target[b]) {
      for (let k = have; k < target[b]; k++) {
        const s = freeSlot();
        if (s < 0) break;
        spawnAt(s, b, instant);
      }
    }
  }
}

function drawCells(rdt) {
  const colorOn = showColor.value;
  for (let s = 0; s < MAXV; s++) {
    const o = s * 16, st = cstate[s];
    let sc = 0;
    if (st === 1) {
      if (clife[s] < 1) clife[s] = Math.min(1, clife[s] + rdt * 2.5);
      sc = 0.35 + 0.65 * clife[s];
      const c = colorOn ? binCol[cbin[s]] : plainCol;
      cArr[s * 3] = c.r; cArr[s * 3 + 1] = c.g; cArr[s * 3 + 2] = c.b;
    } else if (st === 2) {
      clife[s] -= rdt * 1.6;
      if (clife[s] <= 0) { cstate[s] = 0; clife[s] = 0; }
      sc = Math.max(0, clife[s]) * 0.9;
      tmpCol.copy(colorOn ? binCol[cbin[s]] : plainCol).lerp(deadCol, 1 - Math.max(0, clife[s]) * 0.6);
      cArr[s * 3] = tmpCol.r; cArr[s * 3 + 1] = tmpCol.g; cArr[s * 3 + 2] = tmpCol.b;
    }
    const c = Math.cos(ca[s]) * sc, sn = Math.sin(ca[s]) * sc;
    mArr[o] = c; mArr[o + 1] = 0; mArr[o + 2] = -sn; mArr[o + 3] = 0;
    mArr[o + 4] = 0; mArr[o + 5] = sc; mArr[o + 6] = 0; mArr[o + 7] = 0;
    mArr[o + 8] = sn; mArr[o + 9] = 0; mArr[o + 10] = c; mArr[o + 11] = 0;
    mArr[o + 12] = cx[s]; mArr[o + 13] = AGAR_Y + 0.055 * sc; mArr[o + 14] = cz[s]; mArr[o + 15] = 1;
  }
  cellMesh.instanceMatrix.needsUpdate = true;
  cellMesh.instanceColor.needsUpdate = true;
}

// --- Model ve tedavi takvimi ---
const m = createModel();
let T = 0, nextDose = T0, dosesGiven = 0, courseStart = T0, lastDoseT = -1, stopAt = Infinity;
let stoppedEarly = false, verdict = null, nextChart = 0, courseNo = 1, endT = END;

const plannedDoses = () => Math.max(1, Math.round((days.value * 24) / tau.value));
const courseOver = () => dosesGiven >= plannedDoses() || T >= stopAt;

function giveDose() {
  m.C += dose.value;
  dosesGiven++;
  lastDoseT = T;
  nextDose += tau.value;
  dropAnim = 0;
}

function stopNow() {
  if (courseOver()) return;
  stopAt = T;
  stoppedEarly = true;
  sim.toast(`⛔ Tedavi ${fmt(T / 24, 1)}. günde bırakıldı`, 'warn');
}

function newCourse() {
  courseStart = T + 0.01;
  nextDose = courseStart;
  dosesGiven = 0;
  // yeni kür tam süre uygulanır
  earlyStop.set(false);
  stopAt = Infinity;
  stoppedEarly = false;
  verdict = null;
  courseNo++;
  endT = Math.max(endT, T + (days.value + 6) * 24);
  sim.hud.hide();
  verdictBox.set('');
  sim.toast(`💊 ${courseNo}. tedavi kürü başladı (aynı ilaç)`);
}

function advance(hours) {
  let steps = Math.ceil(hours / H);
  while (steps-- > 0 && T < endT) {
    if (T >= nextDose - 1e-6 && dosesGiven < plannedDoses() && T < stopAt) giveDose();
    m.step(H);
    T += H;
    if (T >= nextChart) { pushChart(); nextChart += 2; }
    judge();
  }
}

function judge() {
  if (verdict) return;
  const N = m.total();
  const mic = Math.pow(2, m.meanR());
  if (N === 0) {
    verdict = 'temiz';
    showVerdict(`<h2>✅ Enfeksiyon temizlendi</h2><p>${fmt(T / 24, 1)}. günde son bakteri de öldü. Tedavi, ilacın etkisinden
      kısmen kaçabilen az sayıdaki dirençli hücre de yok olana kadar sürdü.</p>`, 'good');
    return;
  }
  if (courseOver() && T > Math.max(lastDoseT, stopAt === Infinity ? 0 : stopAt) + 24 && N > 1e8) {
    const early = stoppedEarly && dosesGiven < plannedDoses();
    verdict = early ? 'nüks' : 'başarısız';
    const why = early
      ? `Tedavi ${fmt(stopAt / 24, 1)}. günde bırakıldı. O anda hayatta kalan az sayıdaki bakteri çoğunlukla dirençliydi;
         yeniden çoğalan popülasyonun ortalama direnci <b>${fmt(mic, 1)} kat</b>.`
      : `İlaç derişimi dozlar arasında bakterilerin bir kısmının MIC değerinin altına düştü; hayatta kalan dirençliler seçildi.
         Yeni popülasyonun ortalama direnci <b>${fmt(mic, 1)} kat</b>.`;
    showVerdict(`<h2>${early ? '⚠️ Nüks: bakteriler geri döndü' : '❌ Tedavi başarısız'}</h2><p>${why} Aynı ilaç artık daha az etkili.</p>`, 'bad', true);
    return;
  }
  if (T >= endT - H) {
    verdict = 'süre';
    showVerdict(`<h2>⏱ Gözlem süresi bitti</h2><p>Bakteri sayısı: ${big(N)}, ortalama direnç ${fmt(mic, 1)} kat.</p>`, 'warn', true);
  }
}

function showVerdict(html, tone, retry = false) {
  sim.hud.show(`${html}${retry ? '<button class="btn primary" data-a="kur">🔁 Aynı ilaçla yeniden tedavi</button>' : ''}
    <button class="btn" data-a="bas">⟲ Baştan başla</button>`, { tone });
  sim.hud.el.querySelector('[data-a="bas"]').onclick = () => sim.reset();
  const k = sim.hud.el.querySelector('[data-a="kur"]');
  if (k) k.onclick = () => newCourse();
  verdictBox.set(html.replace(/<h2>/, '<b>').replace(/<\/h2>/, '</b><br>'));
  verdictBox.el.className = 'ctl-text ' + (tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'warn');
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (e) => String(e).split('').map((d) => (d === '-' ? '⁻' : SUP[+d])).join('');
function big(n) {
  if (n < 1000) return fmt(Math.round(n));
  const e = Math.floor(Math.log10(n));
  return `${fmt(n / 10 ** e, 1)} × 10${sup(e)}`;
}
function sci(x) {
  const e = Math.floor(Math.log10(x) + 1e-9), mnt = x / 10 ** e;
  return `${Math.abs(mnt - 1) < 0.05 ? '' : fmt(mnt, 1) + ' × '}10${sup(e)}`;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Senaryolar');
const SCEN = {
  tam: { dose: 6, tau: 8, days: 7, hl: 4, early: false, text: '<b>Tam tedavi:</b> 7 gün, 8 saatte bir doz. Önerilen süre boyunca ilaç derişimi yüksek tutulur.' },
  erken: { dose: 6, tau: 8, days: 7, hl: 4, early: true, stop: 3, text: '<b>Erken bırak:</b> aynı plan, ama “kendimi iyi hissediyorum” diye 3. günde bırakılıyor.' },
  dusuk: { dose: 3, tau: 8, days: 7, hl: 4, early: false, text: '<b>Düşük doz:</b> ilaç derişimi hassasları öldürmeye yeter ama orta dirençlileri durduramaz.' },
  atlama: { dose: 6, tau: 24, days: 7, hl: 4, early: false, text: '<b>Seyrek doz:</b> günde yalnızca bir doz; ilaç dozlar arasında MIC’in altına düşer.' },
};
const scenText = ui.text(SCEN.tam.text, 'card');
function applyScen(key) {
  const s = SCEN[key];
  dose.set(s.dose); tau.set(s.tau); days.set(s.days); halfLife.set(s.hl);
  earlyStop.set(s.early); if (s.stop) stopDay.set(s.stop);
  scenText.set(s.text);
  sim.reset();
  sim.play();
}
ui.buttons([
  { label: '✅ Tam tedavi', variant: 'good', onClick: () => applyScen('tam') },
  { label: '⚠️ Erken bırak', variant: 'danger', onClick: () => applyScen('erken') },
]);
ui.buttons([
  { label: '📉 Düşük doz', onClick: () => applyScen('dusuk') },
  { label: '⏰ Seyrek doz', onClick: () => applyScen('atlama') },
]);

ui.section('Tedavi planı');
const dose = ui.slider({ label: 'Doz (tepe artışı)', min: 0, max: 16, step: 0.5, value: 6, format: (v) => `${fmt(v, 1)} × MIC₀` });
const tau = ui.slider({ label: 'Doz aralığı', min: 4, max: 24, step: 2, value: 8, unit: 'saat' });
const days = ui.slider({ label: 'Tedavi süresi', min: 1, max: 14, step: 1, value: 7, unit: 'gün' });
const halfLife = ui.slider({ label: 'İlacın yarılanma ömrü', min: 1, max: 12, step: 0.5, value: 4, unit: 'saat',
  onChange: (v) => { m.halfLife = v; } });
const earlyStop = ui.toggle({ label: 'Tedaviyi erken bırak', value: false,
  onChange: (v) => { if (!courseOver() || !v) { stopAt = v ? courseStart + stopDay.value * 24 : Infinity; stoppedEarly = v; } } });
const stopDay = ui.slider({ label: 'Bırakma günü', min: 1, max: 7, step: 0.5, value: 3, format: (v) => `${fmt(v, 1)}. gün`,
  onChange: (v) => { if (earlyStop.value && !courseOver()) stopAt = courseStart + v * 24; } });
ui.buttons([
  { label: '⛔ Şimdi bırak', onClick: () => stopNow() },
  { label: '💊 Yeni kür', variant: 'primary', onClick: () => newCourse() },
]);

ui.section('Biyoloji');
const muS = ui.slider({ label: 'Mutasyon olasılığı (bölünme başına)', min: -8, max: -5, step: 0.5, value: -6,
  format: (v) => sci(10 ** v),
  onChange: (v) => { m.p.mu = 10 ** v; } });
const costS = ui.slider({ label: 'Direncin bedeli (büyüme kaybı)', min: 0, max: 0.15, step: 0.01, value: 0.05,
  format: (v) => `%${fmt(v * 100)} / 2 kat MIC`, onChange: (v) => { m.p.cost = v; } });
const immune = ui.toggle({ label: 'Bağışıklık sistemi yardım etsin', value: true, onChange: (v) => { m.p.immune = v; } });
const showColor = ui.toggle({ label: 'Direnci renkle göster', value: true });
ui.text(`<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#2563eb,#22c55e,#facc15,#f97316,#dc2626)"></div>
  <div style="display:flex;justify-content:space-between;font-size:11.5px"><span>MIC 1× (hassas)</span><span>2×</span><span>4×</span><span>≥ 8×</span></div>`);

ui.section('Durum');
const stN = ui.stat({ label: 'Bakteri' });
const stMic = ui.stat({ label: 'Ortalama MIC', unit: '×' });
const stC = ui.stat({ label: 'İlaç derişimi', unit: '× MIC₀' });
const stDose = ui.stat({ label: 'Alınan doz' });
const stRes = ui.stat({ label: 'Dirençli (MIC ≥ 4×)' });
const stPhase = ui.stat({ label: 'Tedavi' });
const verdictBox = ui.text('');
const popChart = ui.chart({ title: 'Bakteri sayısı (log₁₀) ve ortalama direnç (log₂ MIC)', maxPoints: END / 2 + 1, yMin: 0, yMax: 9.5,
  series: [{ name: 'log₁₀ bakteri', color: '#22c55e', fill: true }, { name: 'Ort. direnç (log₂ MIC)', color: '#f97316' }] });
const drugChart = ui.chart({ title: 'İlaç derişimi (× MIC₀)', maxPoints: END / 2 + 1, yMin: 0,
  series: [{ name: 'İlaç', color: '#a855f7', fill: true }, { name: 'Hassas MIC', color: '#94a3b8' }, { name: 'Ort. MIC', color: '#f97316' }] });
let lastMic = 1;

function pushChart() {
  const N = m.total();
  if (N > 0) lastMic = Math.pow(2, m.meanR());
  popChart.push([N > 0 ? Math.log10(N) : 0, N > 0 ? m.meanR() : 0]);
  drugChart.push([m.C, 1, lastMic]);
}

function resistantFrac() {
  let r = 0, s = 0;
  for (let i = 0; i < BINS; i++) { s += m.n[i]; if (i * DR >= 2) r += m.n[i]; }
  return s > 0 ? r / s : 0;
}

function updateStats() {
  const N = m.total();
  stN.set(big(N), N === 0 ? 'good' : N > 1e8 ? 'bad' : 'warn');
  const mic = Math.pow(2, m.meanR());
  stMic.set(N > 0 ? fmt(mic, 1) : '—', mic >= 4 ? 'bad' : mic >= 2 ? 'warn' : '');
  stC.set(fmt(m.C, 1), m.C >= 1 ? 'good' : '');
  stDose.set(`${dosesGiven} / ${plannedDoses()}`);
  const f = resistantFrac();
  stRes.set(N === 0 ? '—' : f <= 0 ? '%0' : f < 0.001 ? '< %0,1' : `%${fmt(f * 100, f < 0.1 ? 1 : 0)}`, f > 0.5 ? 'bad' : f > 0.01 ? 'warn' : '');
  let ph;
  if (T < courseStart) ph = 'Başlamadı';
  else if (!courseOver()) ph = `${Math.floor((T - courseStart) / 24) + 1}. gün`;
  else ph = T >= stopAt && dosesGiven < plannedDoses() ? 'Bırakıldı' : 'Bitti';
  stPhase.set(ph, ph === 'Bırakıldı' ? 'warn' : '');
  let s;
  if (N === 0) s = '✅ Kap temiz';
  else if (T < courseStart) s = '🦠 Enfeksiyon kuruldu';
  else if (!courseOver()) s = `💊 Tedavi: ${Math.floor((T - courseStart) / 24) + 1}. gün / ${fmt(days.value)}`;
  else if (T >= stopAt && dosesGiven < plannedDoses()) s = '⛔ Tedavi yarıda bırakıldı';
  else s = '🏁 Tedavi tamamlandı';
  status.setText(s);
}

sim.formatTime = () => `${Math.floor(T / 24) + 1}. gün ${String(Math.floor(T % 24)).padStart(2, '0')}:00`;

// --- Döngü ---
sim.onUpdate((dt) => {
  if (T >= endT) return;
  advance(dt * HOURS_PER_SEC);
});

let statTick = 0;
sim.onRender((rdt) => {
  reconcile();
  drawCells(rdt);
  drugMat.opacity = 0.38 * (m.C / (m.C + 4));
  if (dropAnim >= 0) {
    dropAnim += rdt * 2.2;
    drop.visible = dropAnim < 1;
    drop.position.set(0, AGAR_Y + 4 * (1 - dropAnim * dropAnim), 0);
    if (dropAnim >= 1) { dropAnim = -1; ringAnim = 0; }
  }
  if (ringAnim >= 0) {
    ringAnim += rdt * 0.9;
    const s = 0.3 + ringAnim * (DISH_R - 0.2);
    ring.scale.set(s, s, 1);
    ringMat.opacity = 0.8 * (1 - ringAnim);
    if (ringAnim >= 1) { ringAnim = -1; ringMat.opacity = 0; }
  }
  if (++statTick % 6 === 0) updateStats();
});

function reset() {
  m.p.mu = 10 ** muS.value; m.p.cost = costS.value; m.p.immune = immune.value;
  m.halfLife = halfLife.value;
  m.C = 0;
  m.seed(K * 0.9);
  T = 0; nextDose = T0; courseStart = T0; dosesGiven = 0; lastDoseT = -1; courseNo = 1; endT = END;
  stopAt = earlyStop.value ? T0 + stopDay.value * 24 : Infinity;
  stoppedEarly = earlyStop.value;
  verdict = null; nextChart = 0; lastMic = 1;
  dropAnim = ringAnim = -1; drop.visible = false; ringMat.opacity = 0;
  popChart.clear(); drugChart.clear();
  sim.hud.hide();
  verdictBox.set('');
  cstate.fill(0);
  newColonies();
  reconcile(true);
  pushChart();
  nextChart = 2;
  updateStats();
}
sim.onReset(reset);
reset();
sim.toast('İpucu: “Erken bırak” senaryosunu “Tam tedavi” ile karşılaştır.');
