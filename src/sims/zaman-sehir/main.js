// Zaman Makinesi Şehir — temsili bir İstanbul kıyı semtinin 1900 → 2050 dönüşümü (konut, yeşil alan, ulaşım).
import { createSim, THREE, fmt, clamp, lerp, seeded } from '@core';
import { buildWorld, slopeY, ROADS } from './world.js';

const Y0 = 1900, Y1 = 2050;
const LOTS = 10;       // her model parsel ≈ 10 gerçek parsel/bina
const LOT_M2 = 400;    // gerçek parsel alanı (m²)

const sim = createSim({
  sky: { elevation: 33, azimuth: 200, clouds: 0.32, haze: 1.1, visibility: 11000, wind: [5, 2] },
  ocean: { wind: 5, windDir: 210, fetch: 12, chop: 0.65, foam: 0.25 },
  camera: { position: [62, 13, 114], target: [-14, 17, -6], fov: 50, near: 1, far: 80000 },
  controls: { maxDistance: 2600, minDistance: 25, maxPolarAngle: 1.47 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>İstanbul'daki pek çok kıyı semtinden esinlenen <b>temsili</b> bir mahalle: denize inen bir yamaç, sahil yolu, iskele,
    tepede cami ve koru. Zaman çizelgesini kaydırdıkça bahçeli iki-üç katlı eski evler apartmanlara, bazı parseller yüksek
    binalara dönüşür; tramvay yerini otomobile, sonra raylı sisteme ve bisiklet yollarına bırakır. Vapurlar hep oradadır.</p>
    <h3>Dene</h3>
    <ul>
      <li>▶ ile 1900'den 2050'ye izle; nüfus ve kişi başı yeşil alan grafiklerinin nasıl ters yönde gittiğine bak.</li>
      <li>2050'de A (yeşil dönüşüm) ve B (yoğun yapılaşma) planlarını karşılaştır: nüfus, yeşil alan ve otomobil payı.</li>
      <li>Bir binaya tıkla: türünü, kat sayısını ve yapım yılını gör.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>İstanbul'da atlı tramvay 1871'de, elektrikli tramvay 1914'te başladı; Avrupa yakasındaki klasik tramvay 1961'de kaldırıldı.
    Boğaz'da düzenli vapur seferleri 1850'lerde Şirket-i Hayriye ile başladı. 1965 Kat Mülkiyeti Kanunu apartmanlaşmayı hızlandırdı.
    Boğaziçi Köprüsü 1973'te, Marmaray 2013'te açıldı. Dünya Sağlık Örgütü kişi başına en az ≈9 m² yeşil alan önerir.</p>
    <p><small>Semt, binalar ve sayılar <b>hayalidir</b>; genel eğilimleri göstermek için seçilmiştir. Her model bina yaklaşık 10 gerçek binayı
    temsil eder. Hane büyüklüğü zamanla ≈5,5 kişiden ≈2,7 kişiye iner. 2025 sonrası iki plan <b>senaryodur</b>, tahmin değildir.</small></p>`,
});

// --- Yerleşim ---
const hillY = (z) => (z < 8 ? Math.max(0, 4 - z) * 0.22 : -(z - 8) * 1.2);
const rnd = seeded(1923);
const plots = [];
for (let r = 0; r < 9; r++) {
  for (let c = 0; c < 12; c++) {
    const x = -15.7 + c * 2.6 + Math.floor(c / 4) * 1.4, z = 3 - r * 2.6 - Math.floor(r / 2) * 1.4;
    const grove = r >= 6;
    const p = { x, z, y: hillY(z), r, c, grove, rot: (rnd() - 0.5) * 0.12, col: rnd(), v: rnd() };
    if (grove) {
      p.mosque = r === 7 && c === 2;
      p.tA = !p.mosque && rnd() < 0.65 ? Math.round(1948 + (r - 6) * 22 + rnd() * 35) : Infinity;
      p.parkA = rnd() < 0.6;
    } else {
      p.hist = rnd() < 0.12;
      p.tA = p.hist ? Infinity : Math.round(1952 + rnd() * 40 + r * 2);
      p.tT = !p.hist && rnd() < 0.15 ? Math.round(1996 + rnd() * 26) : Infinity;
      p.parkA = !p.hist && p.tT === Infinity && rnd() < 0.22;
      p.towerB = !p.hist && rnd() < 0.3;
    }
    p.tF = Math.round(2027 + rnd() * 22);
    p.fA = 4 + Math.floor(rnd() * 3);
    plots.push(p);
  }
}
const cx = plots.reduce((s, p) => s + p.x, 0) / plots.length;
plots.forEach((p) => (p.x -= cx));

/** Parselin y yılındaki durumu (plan: 'A' | 'B'). */
function plotAt(p, y, plan) {
  if (p.mosque) return { type: 'mosque', floors: 1 };
  const fut = y >= p.tF && y > 2025;
  if (y < p.tA) {
    if (p.grove) return { type: 'grove', floors: 0 };
    return { type: p.hist ? 'hist' : 'house', floors: 2 };
  }
  if (fut && plan === 'A' && p.parkA && !(y >= p.tT)) return { type: 'park', floors: 0 };
  if (y >= p.tT || (fut && plan === 'B' && p.towerB)) {
    const base = y >= p.tT ? 14 + Math.floor(p.v * 18) : 16 + Math.floor(p.v * 12);
    return { type: 'tower', floors: fut && plan === 'B' ? base + 4 : base };
  }
  if (fut && plan === 'A') return { type: 'green', floors: 6 };
  let f = p.tA < 1966 ? 4 : p.tA < 1982 ? 5 : p.fA + 1;
  if (y >= 1985 && p.tA < 1970) f += 1;          // kat ilaveleri
  if (p.grove) f = Math.min(f, 5);
  if (fut && plan === 'B') f += 3;
  return { type: 'apt', floors: f };
}

const HH = [[1900, 5.5], [1950, 5.2], [1980, 4.4], [2000, 3.8], [2020, 3.2], [2050, 2.7]];
const MODES = [
  { k: 'yurume', name: 'Yürüme', color: '#a3a3a3' },
  { k: 'tram', name: 'Tramvay/otobüs', color: '#f59e0b' },
  { k: 'oto', name: 'Otomobil', color: '#ef4444' },
  { k: 'rayli', name: 'Metro/raylı', color: '#3b82f6' },
  { k: 'vapur', name: 'Vapur', color: '#14b8a6' },
  { k: 'bisiklet', name: 'Bisiklet', color: '#22c55e' },
];
// Ulaşım payları (%) — temsili eğilimler
const SHARES = [
  [1900, [70, 10, 0, 0, 20, 0]], [1930, [56, 24, 2, 0, 18, 0]], [1960, [42, 32, 10, 0, 16, 0]],
  [1990, [30, 36, 25, 1, 8, 0]], [2010, [26, 32, 29, 6, 7, 0]], [2025, [24, 27, 28, 13, 6, 2]],
];
const SHARES_2050 = { A: [30, 17, 12, 26, 7, 8], B: [19, 22, 40, 12, 4, 3] };
function table(tab, y) {
  for (let i = 1; i < tab.length; i++) if (y <= tab[i][0]) {
    const [y0, a] = tab[i - 1], [y1, b] = tab[i], u = (y - y0) / (y1 - y0);
    return Array.isArray(a) ? a.map((v, k) => lerp(v, b[k], u)) : lerp(a, b, u);
  }
  return tab[tab.length - 1][1];
}
const sharesAt = (y, plan) => (y <= 2025 ? table(SHARES, y) : table([[2025, SHARES[5][1]], [2050, SHARES_2050[plan]]], y));

const GREEN_M2 = { house: 0.6, hist: 0.6, apt: 0.1, tower: 0.25, green: 0.35, park: 1, grove: 1, mosque: 0.5 };
function stats(y, plan) {
  let homes = 0, green = 0, floors = 0, nb = 0;
  for (const p of plots) {
    const s = plotAt(p, y, plan);
    green += GREEN_M2[s.type] * LOTS * LOT_M2;
    if (s.type === 'house' || s.type === 'hist') homes += LOTS;
    if (s.type === 'apt' || s.type === 'green') homes += s.floors * 2 * LOTS;
    if (s.type === 'tower') homes += s.floors * 3 * LOTS;
    if (s.floors > 0 && s.type !== 'mosque') { floors += s.floors; nb++; }
  }
  const pop = homes * table(HH, y);
  return { pop, homes, greenPP: green / Math.max(1, pop), avgFloor: floors / Math.max(1, nb), shares: sharesAt(y, plan) };
}

// --- Sahne (world.js): yamaç, deniz, rıhtım, iskele, cami, dönem mimarisi, taşıtlar ---
plots.forEach((p) => { p.x *= 10; p.z *= 10; });
const world = buildWorld(sim, plots);

// --- Etiketler ---
const eraLbl = sim.label('', { position: [-30, 125, -160], className: 'big' });
const tagLbls = [
  sim.label('', { position: [-150, 12, 51], className: 'plain' }),
  sim.label('', { position: [170, slopeY(ROADS.r2) + 14, ROADS.r2], className: 'plain' }),
];
const stationLbl = sim.label('Ⓜ İstasyon', { position: [15, slopeY(ROADS.r2) + 9, ROADS.r2] });
const pierLbl = sim.label('⚓ İskele', { position: [world.PIER.x, 14, world.PIER.z1 - 8], className: 'plain' });

// --- Dönem kartları ---
const ERAS = [
  [1900, 'Geç Osmanlı', 'Ahşap, bahçeli iki katlı evler; mahalle yürüyerek yaşanır. Boğaz\'da 1850\'lerden beri Şirket-i Hayriye vapurları, sahil yolunda atlı tramvay (1914\'ten sonra elektrikli).'],
  [1923, 'Erken Cumhuriyet', 'Nüfus yavaş artar, ahşap doku büyük ölçüde sürer; sık yangınlar ahşap evleri azaltır. Tramvay ve vapur ana toplu taşımadır.'],
  [1950, 'Göç ve apartmanlaşma', 'Kırdan kente göçle nüfus hızla artar. 1965 Kat Mülkiyeti Kanunu ile bahçeli evlerin yerini apartmanlar alır. Avrupa yakasında tramvay 1961\'de kaldırılır; otomobil ve dolmuş yaygınlaşır.'],
  [1973, 'Köprüler ve otomobil', 'Boğaziçi Köprüsü (1973) açılır; yollar genişler, koru ve bahçeler yapılaşmaya açılır. Kat ilaveleriyle binalar yükselir.'],
  [1990, 'Metropol', 'Şehir nüfusu 2000\'lerde 10 milyonu aşar. Yüksek binalar ve alışveriş merkezleri çoğalır; hafif metro (1989) ve metro hatları (2000\'ler) açılır.'],
  [2010, 'Raylı sistem ve dönüşüm', 'Marmaray (2013) Boğaz\'ın altından raylı geçiş sağlar. Kentsel dönüşümle eski apartmanlar yenilenir; ilk bisiklet yolları görülür. İstanbul bugün 15 milyonu aşkın kişinin evi.'],
  [2026, 'Gelecek senaryosu', ''],
];
const PLAN_TXT = {
  A: '<b>Plan A — Yeşil dönüşüm:</b> dönüşen parsellerin bir kısmı parka döner, binalar orta yükseklikte ve yeşil çatılı; raylı sistem, bisiklet ve yürüme öne çıkar.',
  B: '<b>Plan B — Yoğun yapılaşma:</b> dönüşümde kat sayıları artar, yeni kuleler yükselir, koru ve parklar yapılaşır; otomobil payı büyür.',
};

// --- Arayüz ---
const ui = sim.ui;
ui.section('Zaman çizelgesi');
const year = ui.slider({ label: 'Yıl', min: Y0, max: Y1, step: 1, value: 1900, format: (x) => String(Math.round(x)), onInput: (x) => { yearF = x; update(); } });
let playing = true, yearF = 1900;
ui.buttons([
  { label: '▶ Oynat', variant: 'primary', onClick: () => { if (yearF >= Y1) yearF = Y0; playing = true; sim.play(); } },
  { label: '⏸ Durdur', onClick: () => (playing = false) },
]);
ui.buttons([1900, 1950, 1980, 2025, 2050].map((y) => ({ label: String(y), onClick: () => { playing = false; yearF = y; year.set(y); update(); } })));
const plan = ui.segmented({
  label: '2050 planı (2025 sonrası)',
  options: [{ value: 'A', label: '🌳 A: Yeşil dönüşüm' }, { value: 'B', label: '🏙️ B: Yoğun yapılaşma' }],
  value: 'A', onChange: () => { lastKey = ''; drawCharts(); update(); },
});
ui.section('Görünüm');
const showVeh = ui.toggle({ label: 'Araçları göster', value: true, onChange: () => update() });
const showLbl = ui.toggle({ label: 'Etiketler', value: true, onChange: (x) => { [eraLbl, pierLbl, ...tagLbls].forEach((l) => (l.visible = x)); update(); } });

ui.section('Dönem');
const eraCard = ui.text('', 'card');
ui.section('Durum');
const stPop = ui.stat({ label: 'Nüfus (semt)' });
const stGreen = ui.stat({ label: 'Kişi başı yeşil alan' });
const stFloor = ui.stat({ label: 'Ortalama kat' });
const stHomes = ui.stat({ label: 'Konut sayısı' });
const shareCard = ui.text('', 'card');
const chartA = ui.chart({
  title: 'Nüfus (bin kişi) · yeşil alan (m²/kişi) · ortalama kat',
  series: [{ name: 'Nüfus (bin)', color: '#f59e0b' }, { name: 'Yeşil m²/kişi', color: '#22c55e' }, { name: 'Ort. kat', color: '#60a5fa' }],
  maxPoints: (Y1 - Y0) / 5 + 1, height: 130,
});
const chartB = ui.chart({
  title: 'Ulaşım payları (%) 1900–2050',
  series: MODES.map((m) => ({ name: m.name, color: m.color })), maxPoints: (Y1 - Y0) / 5 + 1, height: 120, yMin: 0, yMax: 75,
});
function drawCharts() {
  chartA.clear(); chartB.clear();
  for (let y = Y0; y <= Y1; y += 5) {
    const s = stats(y, plan.value);
    chartA.push([s.pop / 1000, Math.min(80, s.greenPP), s.avgFloor]);
    chartB.push(s.shares);
  }
}

sim.formatTime = () => `Yıl ${Math.round(yearF)}`;
let lastKey = '', lastSig = '', cur = null;
function update() {
  const y = Math.round(yearF), pl = plan.value;
  const key = `${y}|${pl}`;
  if (key !== lastKey) {
    lastKey = key;
    const states = plots.map((p) => (p.state = plotAt(p, y, pl)));
    const sig = states.map((s) => s.type[0] + s.floors).join('') + '|' + pl + Math.floor(y / 3) + (y >= 1950) + (y >= 1960) + (y >= 1965);
    if (sig !== lastSig) { lastSig = sig; world.rebuild(states, y, pl); }
    cur = stats(y, pl);
    const era = [...ERAS].reverse().find((e) => y >= e[0]);
    eraLbl.setText(`${y} · ${era[1]}`);
    eraCard.set(`<b>${era[1]}</b><br>${era[0] >= 2026 ? PLAN_TXT[pl] : era[2]}`);
    stPop.set(fmt(cur.pop));
    stGreen.set(`${fmt(cur.greenPP, 1)} m²`, cur.greenPP < 5 ? 'bad' : cur.greenPP < 9 ? 'warn' : 'good');
    stFloor.set(fmt(cur.avgFloor, 1));
    stHomes.set(fmt(cur.homes));
    shareCard.set(`<b>Ulaşım payları</b> <small>(temsili)</small>` + MODES.map((m, i) => `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:3px">
      <span style="width:92px">${m.name}</span><span style="flex:1;height:8px;border-radius:4px;background:rgba(148,163,184,.2)">
      <span style="display:block;height:8px;border-radius:4px;width:${cur.shares[i]}%;background:${m.color}"></span></span><b style="width:34px;text-align:right">%${fmt(cur.shares[i])}</b></div>`).join(''));
  }
  const lbl = showLbl.value;
  stationLbl.visible = y >= 2008 && lbl;
  const bike = cur.shares[5];
  world.bikeA.visible = bike > 0.8;
  world.bikeB.visible = bike > 4;
  nCars = Math.round((cur.shares[2] / 100) * cur.pop / 180);
  tagLbls[0].setText(y < 1962 ? '🚋 Tramvay' : bike > 0.8 ? '🚲 Bisiklet yolu' : '🚗 Sahil yolu');
  tagLbls[1].setText(y >= 2008 ? '🚆 Raylı sistem' : '');
}
let nCars = 0;

sim.onUpdate((dt) => {
  if (playing) {
    yearF = Math.min(Y1, yearF + dt * 5);
    if (Math.round(yearF) !== year.value) { year.set(Math.round(yearF)); update(); }
    if (yearF >= Y1) { playing = false; sim.toast(`2050 · Plan ${plan.value} tamamlandı`, 'good'); }
  }
});
sim.onRender((rdt) => {
  world.update(sim.time, sim.paused ? 0 : Math.min(rdt, 0.1) * sim.speed, { veh: showVeh.value, y: Math.round(yearF), nCars });
});

// Binaya tıkla: en yakın parselin durumu
sim.onClick(() => world.buildings(), (hit) => {
  const P = hit.point;
  let best = null, bd = 16;
  for (const p of plots) { const d = Math.max(Math.abs(p.x - P.x), Math.abs(p.z - P.z)); if (d < bd) { bd = d; best = p; } }
  if (!best || !best.state || best.state.floors === 0) return;
  const s = best.state;
  const name = { house: 'Eski ev (taş bodrumlu, kiremit çatılı)', hist: 'Korunan tarihi ev', apt: 'Apartman', tower: 'Yüksek bina', green: 'Yeşil çatılı yeni bina', mosque: 'Mahalle camii' }[s.type];
  if (s.type === 'mosque') { sim.toast(`<b>${name}</b> · tek kubbeli, tek minareli klasik plan`); return; }
  const built = s.type === 'house' || s.type === 'hist' ? '1900 öncesi' : s.type === 'tower' && best.tT <= yearF ? best.tT : s.type === 'apt' && !(yearF >= best.tF && yearF > 2025) ? best.tA : best.tF;
  sim.toast(`<b>${name}</b> · ${s.floors} kat · yapım: ${built}`);
});

sim.onReset(() => { playing = true; yearF = Y0; year.set(Y0); plan.set('A'); lastKey = ''; drawCharts(); update(); });
// ?yil=1985 → o yıldan duraklatılmış başla (inceleme / ekran görüntüsü için)
const qy = /[?&]yil=(\d{4})/.exec(location.search);
if (qy) { yearF = clamp(+qy[1], Y0, Y1); year.set(Math.round(yearF)); playing = false; }
drawCharts();
update();
