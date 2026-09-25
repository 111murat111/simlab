// Bileşik Faiz ve Enflasyon — birikim şehri: nominal / reel / yastık altı jeton kuleleri ve kredi kartı borç sarmalı.
import { createSim, THREE, fmt, clamp, lerp, instanced, textPlane, disposeObject } from '@core';

const COIN_H = 0.21;          // bir jetonun kalınlığı (dünya birimi)
const MAX_COINS = 44;         // en yüksek kuledeki jeton sayısı
const MAX_TOWERS = 52;
const ROWS = 3;
const ROW_Z = [2.2, -0.9, -4.0];
const SEC_PER_YEAR = 0.85;    // 1× hızda bir yıl kaç saniye sürer
const CAP = MAX_TOWERS * ROWS * (MAX_COINS + 4);

const C = {
  principal: 0x7fb2ff, interest: 0xf5c542, real: 0x2dd4bf, pillow: 0x9aa4b2,
  debt: 0xef4444, paidP: 0x8b95a5, paidI: 0xfb923c,
};

const sim = createSim({
  background: 0x0a1222,
  camera: { position: [0, 12.5, 27], target: [0, 3.2, -1], fov: 48 },
  controls: { maxDistance: 70, minDistance: 6, maxPolarAngle: Math.PI * 0.47 },
  fog: [55, 120],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Zaman soldan sağa akar; her kule bir yılın sonundaki birikimdir ve her jeton sabit bir tutardır (tutarı panelde yazar).
    <b style="color:#7fb2ff">Mavi</b> jetonlar senin yatırdığın para (başlangıç + aylık katkılar), <b style="color:#f5c542">altın</b>
    jetonlar faizin faizi dahil kazanılan getiridir. Orta sıradaki <b style="color:#2dd4bf">turkuaz</b> kuleler aynı paranın
    <b>bugünkü alım gücü</b> (reel değer); üzerindeki kırmızı saydam kısım enflasyonun erittiği değerdir. Arka gri sıra
    “yastık altı”: hiç faiz almadan bekleyen paranın reel değeri.</p>
    <p>Bileşik faiz: <b>A = P·(1 + r/m)<sup>m·t</sup></b> (m: yılda kaç kez faiz eklendiği). Reel getiri:
    <b>(1 + faiz) / (1 + enflasyon) − 1</b>. <b>72 kuralı:</b> paranın ikiye katlanma süresi ≈ 72 / yıllık % getiri.</p>
    <h3>Dene</h3>
    <ul>
      <li>Faizi enflasyona eşitle: nominal kule büyür ama turkuaz (reel) kule yerinde sayar.</li>
      <li>Süreyi 10'dan 30 yıla çıkar: altın jetonların payı nasıl hızla büyüyor?</li>
      <li>Bileşik sıklığını yıllıktan günlüğe çevir: fark ne kadar? (Faiz oranı arttıkça fark büyür.)</li>
      <li>Kredi kartı modunda yalnız asgari ödemeyi yap, sonra her ay 1.000 ₺ fazla öde: süre ve toplam faiz nasıl değişiyor?</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Mevduat faizinden stopaj (vergi) kesilir; kredi kartı faizine KKDF ve BSMV eklenir. Gerçekte faiz ve enflasyon her yıl değişir;
    bu model onları sabit kabul eder. Kredi kartında faiz oranı ve asgari ödeme oranı düzenlemelerle değişir; kaydırıcılarla dene.</p>
    <p><small>Bu simülasyon eğitim amaçlıdır; yatırım tavsiyesi değildir.</small></p>`,
});

// --- Para biçimi ---
function tl(v) {
  const a = Math.abs(v);
  if (!isFinite(v)) return '—';
  if (a >= 1e9) return `${fmt(v / 1e9, a >= 1e11 ? 0 : 2)} mr ₺`;
  if (a >= 1e6) return `${fmt(v / 1e6, a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)} mn ₺`;
  if (a >= 1e4) return `${fmt(v / 1e3, 0)} bin ₺`;
  return `${fmt(v, 0)} ₺`;
}
const tlShort = (v) => tl(v).replace(' ₺', '');

// --- Zemin ve şehir dekoru ---
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: 0x111a2c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  sim.scene.add(ground);
  const grid = new THREE.GridHelper(160, 80, 0x1e2a44, 0x16203a);
  grid.position.y = 0.005;
  sim.scene.add(grid);
  // Zaman yolu (ön taraf)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(40, 1.4), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, ROW_Z[0] + 1.9);
  sim.scene.add(road);
  const dash = instanced(new THREE.PlaneGeometry(0.7, 0.08), new THREE.MeshBasicMaterial({ color: 0xfacc15 }), 30);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  for (let i = 0; i < 30; i++) dash.setMatrixAt(i, m.compose(new THREE.Vector3(-19.5 + i * 1.35, 0.02, ROW_Z[0] + 1.9), q, new THREE.Vector3(1, 1, 1)));
  sim.scene.add(dash);
  // Uzakta silik binalar (şehir silüeti)
  const n = 70, bld = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1a2640, roughness: 0.9 }), n);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const x = -45 + r() * 90, z = -14 - r() * 18, h = 2 + r() * 9, w = 1.5 + r() * 2.5;
    bld.setMatrixAt(i, m.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w)));
  }
  sim.scene.add(bld);
}

// Sıra platformları
const platMat = new THREE.MeshStandardMaterial({ color: 0x1b2740, roughness: 0.8 });
const platforms = ROW_Z.map((z) => {
  const p = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 2.2), platMat);
  p.position.set(0, 0.06, z);
  sim.scene.add(p);
  return p;
});

// --- Jetonlar (tek InstancedMesh) ---
const coinGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
const coins = instanced(coinGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.38 }), CAP);
coins.frustumCulled = false;
const white = new THREE.Color(1, 1, 1);
for (let i = 0; i < CAP; i++) coins.setColorAt(i, white);
coins.count = 0;
sim.scene.add(coins);
const coinOwner = new Int16Array(CAP * 2); // [yıl, sıra]

// Enflasyonun erittiği kısım (saydam kutular)
const ghosts = instanced(new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.2, depthWrite: false, roughness: 1 }), MAX_TOWERS * 2);
ghosts.frustumCulled = false;
ghosts.count = 0;
sim.scene.add(ghosts);

// Seçili yıl vurgusu
const hilite = new THREE.Mesh(new THREE.PlaneGeometry(1, 9.6), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.22, depthWrite: false }));
hilite.rotation.x = -Math.PI / 2;
hilite.position.set(0, 0.14, -0.9);
hilite.visible = false;
sim.scene.add(hilite);

// Etiketler
const nomLbl = sim.label('', { position: [0, 0, 0] });
const realLbl = sim.label('', { position: [0, 0, 0] });
let yearLbls = [];
let rowSigns = [];

// --- Durum ---
let mode = 'birikim';
let plan = null;       // { n, xs, spacing, r, coinV, rows:[{segs(k)→[[v,renk]]}] , ghost(k)→[[lo,hi]] }
let progress = 0;      // yıl cinsinden animasyon ilerlemesi
let lastDrawn = -1;
let pushedYears = 0;
let selected = -1;

// --- Modeller ---
function computeSaving() {
  const P0 = startAmt.value, mon = monthly.value, r = rate.value / 100, inf = infl.value / 100, tax = taxRate.value / 100;
  const N = years.value, freq = +freqSel.value;
  const rd = r / 365;
  let bal = P0, accrued = 0, principal = P0, taxPaid = 0, gross = 0;
  const out = [{ nom: P0, prin: P0, real: P0, pillow: P0, tax: 0 }];
  for (let y = 1; y <= N; y++) {
    let month = -1;
    for (let d = 0; d < 365; d++) {
      const m = Math.floor((d * 12) / 365);
      if (m !== month) { month = m; bal += mon; principal += mon; }
      accrued += bal * rd;
      const endOfMonth = Math.floor(((d + 1) * 12) / 365) !== m;
      const credit = freq === 365 || (freq === 12 && endOfMonth) || (freq === 1 && d === 364);
      if (credit) {
        const t = accrued * tax;
        gross += accrued; taxPaid += t; bal += accrued - t; accrued = 0;
      }
    }
    const cpi = Math.pow(1 + inf, y);
    out.push({ nom: bal, prin: principal, real: bal / cpi, pillow: principal / cpi, tax: taxPaid });
  }
  const last = out[N];
  const showPillow = pillowT.value;
  const netR = Math.pow(last.nom / Math.max(1, last.prin), 0) && effectiveNet(r, freq, tax);
  const realR = (1 + netR) / (1 + inf) - 1;
  return {
    kind: 'birikim', data: out, n: N + 1, gross, taxPaid, netR, realR,
    rows: [
      (k) => [[out[k].prin, C.principal], [Math.max(0, out[k].nom - out[k].prin), C.interest]],
      (k) => [[out[k].real, C.real]],
      showPillow ? (k) => [[out[k].pillow, C.pillow]] : null,
    ],
    ghost: (k) => [[1, out[k].real, out[k].nom], showPillow ? [2, out[k].pillow, out[k].prin] : null],
    maxV: Math.max(...out.map((o) => Math.max(o.nom, o.real, o.prin))),
    rowNames: ['Nominal birikim', 'Reel değer (bugünün parası)', showPillow ? 'Yastık altı (reel)' : null],
  };
}

function effectiveNet(r, freq, tax) {
  // Vergi sonrası yıllık efektif getiri
  const rn = r * (1 - tax);
  return freq === 1 ? rn : Math.pow(1 + rn / freq, freq) - 1;
}

function computeDebt() {
  const D = debtAmt.value, i = (cardRate.value / 100) * (kkdf.value ? 1.3 : 1), pct = minPct.value / 100, extra = extraPay.value;
  let B = D, paidP = 0, paidI = 0, m = 0, firstPay = 0;
  const out = [{ debt: D, paidP: 0, paidI: 0 }];
  while (B > 0.5 && m < 600) {
    const int = B * i;
    B += int;
    let pay = Math.max(B * pct, Math.min(100, B)) + extra;
    pay = Math.min(pay, B);
    if (m === 0) firstPay = pay;
    const toI = Math.min(pay, int);
    paidI += toI; paidP += pay - toI; B -= pay; m++;
    if (m % 12 === 0 || B <= 0.5) out.push({ debt: Math.max(0, B), paidP, paidI });
  }
  const done = B <= 0.5;
  const pmt12 = (D * i) / (1 - Math.pow(1 + i, -12));
  return {
    kind: 'borc', data: out, n: out.length, months: m, done, paidI, paidP, firstPay, pmt12, iEff: i, endDebt: B,
    rows: [
      (k) => [[out[k].debt, C.debt]],
      (k) => [[out[k].paidP, C.paidP], [out[k].paidI, C.paidI]],
      null,
    ],
    ghost: () => [],
    maxV: Math.max(...out.map((o) => Math.max(o.debt, o.paidP + o.paidI))),
    rowNames: ['Kalan borç', 'Ödediğin toplam (anapara + faiz)', null],
  };
}

// --- Yerleşim ---
function rebuild() {
  plan = mode === 'birikim' ? computeSaving() : computeDebt();
  const n = plan.n;
  plan.spacing = n > 1 ? Math.min(1.7, 26 / (n - 1)) : 1;
  const len = plan.spacing * (n - 1);
  plan.xs = Array.from({ length: n }, (_, k) => -len / 2 + k * plan.spacing);
  plan.r = clamp(plan.spacing * 0.4, 0.14, 0.62);
  plan.coinV = Math.max(plan.maxV, 1) / MAX_COINS;

  platforms.forEach((p, i) => {
    p.visible = !!plan.rows[i];
    p.scale.x = len + plan.r * 2 + 1.2;
  });
  hilite.scale.x = plan.r * 2.6;

  // Yıl etiketleri
  yearLbls.forEach(disposeObject);
  const step = n <= 11 ? 1 : n <= 21 ? 2 : n <= 31 ? 5 : 5;
  yearLbls = [];
  for (let k = 0; k < n; k += step) {
    const t = plan.kind === 'birikim' ? (k === 0 ? 'Bugün' : `${k}. yıl`) : (k === 0 ? 'Başlangıç' : `${k}. yıl`);
    yearLbls.push(sim.label(t, { position: [plan.xs[k], 0.05, ROW_Z[0] + 1.9], className: 'plain' }));
  }
  // Sıra tabelaları
  rowSigns.forEach(disposeObject);
  rowSigns = [];
  plan.rowNames.forEach((name, i) => {
    if (!name) return;
    const col = ['#cfe1ff', '#99f6e4', '#cbd5e1'][i];
    const sgn = textPlane(name, 0.55, { color: mode === 'borc' ? ['#fecaca', '#fed7aa'][i] : col, size: 48 });
    sgn.position.set(-len / 2 - plan.r - 0.4 - sgn.geometry.parameters.width / 2, 0.45, ROW_Z[i]);
    sim.scene.add(sgn);
    rowSigns.push(sgn);
  });

  selected = -1;
  hilite.visible = false;
  sim.time = 0;
  progress = 0;
  lastDrawn = -1;
  pushedYears = 0;
  (mode === 'birikim' ? chartSave : chartDebt).clear();
  updateStats();
  draw(0);
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Color();
const hash = (a, b, c) => { const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return x - Math.floor(x); };

function segsAt(row, k, g) {
  const cur = row(k);
  if (g >= 1 || k === 0) return cur;
  const prev = row(k - 1);
  return cur.map(([v, col], i) => [lerp(prev[i] ? prev[i][0] : 0, v, g), col]);
}

function draw(p) {
  const P = plan, n = P.n;
  let idx = 0, gi = 0;
  const kMax = Math.min(n - 1, Math.floor(p) + 1);
  let topNom = 0, topReal = 0, topK = 0, valNom = 0, valReal = 0;
  for (let k = 0; k <= kMax; k++) {
    const g = k === 0 ? 1 : clamp(p - k + 1, 0, 1);
    if (g <= 0) break;
    const x = P.xs[k];
    for (let ri = 0; ri < ROWS; ri++) {
      const row = P.rows[ri];
      if (!row) continue;
      const segs = segsAt(row, k, g);
      const total = segs.reduce((a, s) => a + s[0], 0);
      const count = Math.min(MAX_COINS + 3, Math.round(total / P.coinV));
      for (let c = 0; c < count && idx < CAP; c++) {
        const mid = (c + 0.5) * P.coinV;
        let acc = 0, col = segs[segs.length - 1][1];
        for (const [v, cc] of segs) { acc += v; if (mid <= acc) { col = cc; break; } }
        const j = hash(k, c, ri);
        _p.set(x + (j - 0.5) * P.r * 0.12, 0.12 + (c + 0.5) * COIN_H, ROW_Z[ri] + (hash(c, k, ri + 3) - 0.5) * P.r * 0.12);
        _s.set(P.r, COIN_H * 0.84, P.r);
        coins.setMatrixAt(idx, _m.compose(_p, _q, _s));
        coins.setColorAt(idx, _c.setHex(col).multiplyScalar(0.86 + j * 0.2));
        coinOwner[idx * 2] = k; coinOwner[idx * 2 + 1] = ri;
        idx++;
      }
      if (ri === 0) { topNom = 0.12 + count * COIN_H; valNom = total; topK = k; }
      if (ri === 1) { topReal = 0.12 + count * COIN_H; valReal = total; }
    }
    // Enflasyon erimesi
    const gh = P.ghost(k);
    for (const gg of gh) {
      if (!gg) continue;
      const [ri, lo0, hi0] = gg;
      const lo = k === 0 ? lo0 : lerp(P.ghost(k - 1).find((q) => q && q[0] === ri)?.[1] ?? 0, lo0, g);
      const hi = k === 0 ? hi0 : lerp(P.ghost(k - 1).find((q) => q && q[0] === ri)?.[2] ?? 0, hi0, g);
      const hLo = Math.round(lo / P.coinV) * COIN_H, hHi = Math.round(hi / P.coinV) * COIN_H;
      if (hHi - hLo < 0.02) continue;
      _p.set(x, 0.12 + (hLo + hHi) / 2, ROW_Z[ri]);
      _s.set(P.r * 2.05, hHi - hLo, P.r * 2.05);
      ghosts.setMatrixAt(gi++, _m.compose(_p, _q, _s));
    }
  }
  coins.count = idx;
  coins.instanceMatrix.needsUpdate = true;
  if (coins.instanceColor) coins.instanceColor.needsUpdate = true;
  coins.boundingSphere = null;
  ghosts.count = gi;
  ghosts.instanceMatrix.needsUpdate = true;

  nomLbl.position.set(P.xs[topK], topNom + 0.45, ROW_Z[0]);
  realLbl.position.set(P.xs[topK], topReal + 0.45, ROW_Z[1]);
  if (P.kind === 'birikim') {
    nomLbl.setText(`<span style="color:#f5c542">${tl(valNom)}</span>`);
    realLbl.setText(`<span style="color:#5eead4">${tl(valReal)}</span>`);
  } else {
    nomLbl.setText(`<span style="color:#fca5a5">Borç ${tl(valNom)}</span>`);
    realLbl.setText(`<span style="color:#fdba74">Ödenen ${tl(valReal)}</span>`);
  }
}

// --- Güncelleme döngüsü ---
sim.onUpdate((dt) => {
  if (!plan) return;
  const end = plan.n - 1;
  if (progress >= end && lastDrawn >= end) return;
  progress = Math.min(end, progress + dt / SEC_PER_YEAR);
  const q = Math.round(progress * 30) / 30;
  if (q !== lastDrawn) { lastDrawn = q; draw(q); }
  // Grafik: tamamlanan yıllar
  while (pushedYears <= Math.floor(progress)) {
    const d = plan.data[pushedYears];
    if (plan.kind === 'birikim') chartSave.push([d.nom, d.real, pillowT.value ? d.pillow : d.prin / Math.pow(1 + infl.value / 100, pushedYears)]);
    else chartDebt.push([d.debt, d.paidI, d.paidP]);
    pushedYears++;
  }
});

sim.formatTime = () => {
  if (!plan) return '';
  const y = Math.floor(progress);
  return plan.kind === 'birikim' ? `${y}. yıl / ${plan.n - 1}` : `${y}. yıl · ${fmt(Math.min(plan.months, Math.round(progress * 12)))}. ay`;
};

// --- Arayüz ---
const ui = sim.ui;
ui.section('Mod');
const modeSeg = ui.segmented({
  options: [{ value: 'birikim', label: '💰 Birikim' }, { value: 'borc', label: '💳 Kredi kartı borcu' }],
  value: 'birikim', onChange: (v) => { mode = v; syncMode(); rebuild(); },
});

const secSave = ui.section('Birikim ayarları');
const startAmt = ui.slider({ label: 'Başlangıç tutarı', min: 0, max: 1000000, step: 5000, value: 100000, format: (v) => `${fmt(v)} ₺`, onChange: () => rebuild() });
const monthly = ui.slider({ label: 'Aylık katkı', min: 0, max: 50000, step: 250, value: 2000, format: (v) => `${fmt(v)} ₺`, onChange: () => rebuild() });
const rate = ui.slider({ label: 'Yıllık faiz / getiri', min: 0, max: 80, step: 0.5, value: 30, format: (v) => `%${fmt(v, 1)}`, onChange: () => rebuild() });
const infl = ui.slider({ label: 'Yıllık enflasyon', min: 0, max: 80, step: 0.5, value: 25, format: (v) => `%${fmt(v, 1)}`, onChange: () => rebuild() });
const taxRate = ui.slider({ label: 'Vergi / stopaj (faizden)', min: 0, max: 25, step: 0.5, value: 15, format: (v) => `%${fmt(v, 1)}`, onChange: () => rebuild() });
const years = ui.slider({ label: 'Süre', min: 1, max: 40, step: 1, value: 20, unit: 'yıl', onChange: () => rebuild() });
const freqSel = ui.segmented({
  label: 'Bileşik sıklığı (faiz ne sıklıkla eklenir)',
  options: [{ value: '1', label: 'Yıllık' }, { value: '12', label: 'Aylık' }, { value: '365', label: 'Günlük' }],
  value: '12', onChange: () => rebuild(),
});
const pillowT = ui.toggle({ label: 'Yastık altı karşılaştırması', value: true, onChange: () => rebuild() });
ui.text('<b>Hazır senaryolar</b>');
ui.buttons([
  { label: 'Yüksek enflasyon', onClick: () => preset({ rate: 45, infl: 50 }) },
  { label: 'Düşük enflasyon', onClick: () => preset({ rate: 6, infl: 2.5 }) },
]);
ui.buttons([
  { label: 'Pozitif reel faiz', onClick: () => preset({ rate: 40, infl: 25 }) },
  { label: 'Erken başla', onClick: () => preset({ start: 0, monthly: 1000, years: 40, rate: 12, infl: 8 }) },
]);

const secDebt = ui.section('Kredi kartı borcu');
const debtAmt = ui.slider({ label: 'Kart borcu', min: 1000, max: 200000, step: 1000, value: 30000, format: (v) => `${fmt(v)} ₺`, onChange: () => rebuild() });
const cardRate = ui.slider({ label: 'Aylık akdi faiz', min: 0.5, max: 6, step: 0.05, value: 3.5, format: (v) => `%${fmt(v, 2)} / ay`, onChange: () => rebuild() });
const kkdf = ui.toggle({ label: 'KKDF + BSMV ekle (faizin %30\'u kadar)', value: true, onChange: () => rebuild() });
const minPct = ui.slider({ label: 'Asgari ödeme oranı', min: 2, max: 60, step: 1, value: 20, format: (v) => `%${fmt(v)}`, onChange: () => rebuild() });
const extraPay = ui.slider({ label: 'Her ay ek ödeme', min: 0, max: 10000, step: 250, value: 0, format: (v) => `${fmt(v)} ₺`, onChange: () => rebuild() });
ui.text('<small>Ödeme = max(asgari oran × ekstre, 100 ₺) + ek ödeme. Kartla yeni harcama yapılmadığı varsayılır.</small>');

ui.section('Sonuçlar');
const scale = ui.text('', 'card');
const st = [0, 1, 2, 3, 4, 5, 6, 7].map(() => ui.stat({ label: '' }));
const summary = ui.text('', 'card');
const chartSave = ui.chart({
  title: 'Yıl sonu değer', maxPoints: 41, format: tlShort,
  series: [{ name: 'Nominal', color: '#f5c542' }, { name: 'Reel', color: '#2dd4bf', fill: true }, { name: 'Yastık altı (reel)', color: '#9aa4b2' }],
});
const chartDebt = ui.chart({
  title: 'Borç sarmalı (yıl sonu)', maxPoints: 51, format: tlShort,
  series: [{ name: 'Kalan borç', color: '#ef4444', fill: true }, { name: 'Ödenen faiz', color: '#fb923c' }, { name: 'Ödenen anapara', color: '#8b95a5' }],
});
ui.text('<small>Kuleye tıkla: o yılın ayrıntıları. Eğitim amaçlıdır, yatırım tavsiyesi değildir.</small>');

function setStat(i, label, val, tone) {
  st[i].el.querySelector('.stat-l').textContent = label;
  st[i].set(val, tone);
  st[i].el.style.display = label ? '' : 'none';
}

function preset(o) {
  if (o.start != null) startAmt.set(o.start);
  if (o.monthly != null) monthly.set(o.monthly);
  if (o.years != null) years.set(o.years);
  if (o.rate != null) rate.set(o.rate);
  if (o.infl != null) infl.set(o.infl);
  rebuild();
  sim.toast(`Faiz %${fmt(rate.value, 1)} · enflasyon %${fmt(infl.value, 1)}`);
}

function syncMode() {
  secSave.parentElement.style.display = mode === 'birikim' ? '' : 'none';
  secDebt.parentElement.style.display = mode === 'borc' ? '' : 'none';
  chartSave.el.style.display = mode === 'birikim' ? '' : 'none';
  chartDebt.el.style.display = mode === 'borc' ? '' : 'none';
}

function updateStats() {
  const P = plan;
  scale.set(`🪙 1 jeton ≈ <b>${tl(P.coinV)}</b>`);
  if (P.kind === 'birikim') {
    const L = P.data[P.n - 1], N = P.n - 1;
    const pct = (x) => `%${fmt(x * 100, 1)}`;
    const dbl = P.netR > 0 ? 72 / (P.netR * 100) : Infinity;
    setStat(0, 'Nominal son değer', tl(L.nom), 'good');
    setStat(1, 'Reel son değer', tl(L.real), L.real >= L.prin ? 'good' : 'bad');
    setStat(2, 'Toplam yatırılan', tl(L.prin));
    setStat(3, 'Net faiz kazancı', tl(L.nom - L.prin), 'good');
    setStat(4, 'Ödenen stopaj', tl(P.taxPaid), P.taxPaid > 0 ? 'warn' : '');
    setStat(5, 'Yastık altı (reel)', tl(L.pillow), L.pillow < L.prin ? 'bad' : '');
    setStat(6, '72 kuralı: 2 katına', isFinite(dbl) ? `≈ ${fmt(dbl, 1)} yıl` : 'hiç', '');
    setStat(7, 'Reel getiri / yıl', pct(P.realR), P.realR >= 0 ? 'good' : 'bad');
    const realWord = P.realR >= 0
      ? `Reel getiri pozitif: alım gücün yılda yaklaşık <b>${pct(P.realR)}</b> artıyor; 72 kuralına göre reel olarak ~${fmt(72 / Math.max(0.01, P.realR * 100), 0)} yılda ikiye katlanır.`
      : `Reel getiri <b>negatif (${pct(P.realR)})</b>: rakam büyüse de alım gücün eriyor; reel olarak ~${fmt(72 / Math.max(0.01, -P.realR * 100), 0)} yılda yarıya iner.`;
    summary.set(`${N} yılda yatırdığın <b>${tl(L.prin)}</b>, nominal <b>${tl(L.nom)}</b> oldu; bugünün parasıyla <b>${tl(L.real)}</b> ediyor.
      Yastık altında kalsaydı alım gücü <b>${tl(L.pillow)}</b> olurdu.<br>${realWord}<br><small>Net efektif faiz (vergi sonrası): ${pct(P.netR)}/yıl.</small>`);
  } else {
    const yrs = P.months / 12;
    setStat(0, 'Bitiş süresi', P.done ? (P.months < 24 ? `${P.months} ay` : `${fmt(yrs, 1)} yıl`) : '50+ yıl', P.done ? (P.months > 36 ? 'warn' : 'good') : 'bad');
    setStat(1, 'Toplam faiz', tl(P.paidI), 'bad');
    setStat(2, 'Toplam ödeme', tl(P.paidI + P.paidP));
    setStat(3, 'İlk ay ödemesi', tl(P.firstPay));
    setStat(4, 'Efektif aylık faiz', `%${fmt(P.iEff * 100, 2)}`, 'warn');
    setStat(5, 'Yıllık bileşik', `%${fmt((Math.pow(1 + P.iEff, 12) - 1) * 100, 0)}`, 'bad');
    setStat(6, '12 ayda kapatmak için', `${tl(P.pmt12)}/ay`, 'good');
    setStat(7, '', '');
    const ratio = P.paidI / debtAmt.value;
    summary.set(P.done
      ? `Bu ödeme planıyla <b>${tl(debtAmt.value)}</b> borç <b>${P.months} ayda</b> bitiyor ve <b>${tl(P.paidI)}</b> faiz ödüyorsun
         (borcun <b>%${fmt(ratio * 100, 0)}</b>'i kadar). Her ay biraz fazla ödemek süreyi ve faizi çarpıcı biçimde kısaltır.`
      : `⚠️ Ödemeler faizi karşılamıyor: 50 yıl sonra bile <b>${tl(P.endDebt)}</b> borç kalıyor. Bu bir <b>borç sarmalı</b>.
         Asgari ödeme oranını ya da ek ödemeyi artır.`);
  }
}

// Kuleye tıkla → ayrıntı
sim.onClick(() => [coins], (hit) => {
  if (hit.instanceId == null || !plan) return;
  const k = coinOwner[hit.instanceId * 2];
  const d = plan.data[k];
  selected = k;
  hilite.visible = true;
  hilite.position.x = plan.xs[k];
  if (plan.kind === 'birikim') {
    sim.toast(`<b>${k === 0 ? 'Başlangıç' : k + '. yıl sonu'}</b><br>Nominal: ${tl(d.nom)} (yatırılan ${tl(d.prin)} + faiz ${tl(d.nom - d.prin)})<br>
      Reel: ${tl(d.real)} · Yastık altı: ${tl(d.pillow)}`);
  } else {
    sim.toast(`<b>${k === 0 ? 'Başlangıç' : k + '. yıl sonu'}</b><br>Kalan borç: ${tl(d.debt)}<br>Ödenen: anapara ${tl(d.paidP)} + faiz ${tl(d.paidI)}`, d.debt > debtAmt.value ? 'bad' : '');
  }
});

sim.onReset(() => rebuild());
syncMode();
rebuild();
