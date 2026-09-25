// Tarım ve Hasat — dört tarla, günlük toprak suyu (kova) modeli, azot tepkisi, sıcaklık/dolu stresi ve hasat ekonomisi.
import { createSim, THREE, fmt, clamp, lerp, smoothstep, seeded, instanced, disposeObject, BufferGeometryUtils } from '@core';

const DOY0 = 60, DOY1 = 304;            // sezon: 1 Mart – 31 Ekim
const SEASON = DOY1 - DOY0 + 1;
const SEC_PER_DAY = 0.25;
const NSOIL = 4;                        // topraktan gelen azot (kg/da)
const ROWS_N = 12, COLS_N = 14, PLANTS = ROWS_N * COLS_N;
const PLOT = 10, GAP = 3;
const PLOT_COL = ['#facc15', '#4ade80', '#f87171', '#c4b5fd'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// Aylık yağış (mm) — Akdeniz/Güneydoğu iç kesim benzeri: kışın yağışlı, yazın kurak
const RAIN_M = [90, 75, 65, 45, 30, 10, 3, 3, 8, 35, 60, 90];

// Ürün parametreleri (FAO-56 Kc, AquaCrop tarzı su verimliliği; değerler yaklaşık)
const CROPS = {
  bugday: { name: 'Buğday', emoji: '🌾', base: 0, gdd: 1450, wp: 17, hi: 0.45, fresh: 1.13, ccx: 0.9, kc: [0.4, 1.15, 0.3],
    heatT: 31, nOpt: 14, nconc: 0.012, price: 13, fixed: 3800, h: 0.95, sow: 60, leaf: 0x5fa83a, ripe: 0xd9b44a, fruitC: 0xe3c565, col: '#facc15' },
  misir: { name: 'Mısır', emoji: '🌽', base: 10, gdd: 1600, wp: 36, hi: 0.48, fresh: 1.15, ccx: 0.92, kc: [0.35, 1.2, 0.5],
    heatT: 35, nOpt: 20, nconc: 0.011, price: 11, fixed: 7000, h: 2.2, sow: 105, leaf: 0x3f9b3a, ripe: 0xb59a52, fruitC: 0xf2c94c, col: '#4ade80' },
  domates: { name: 'Domates', emoji: '🍅', base: 10, gdd: 1400, wp: 20, hi: 0.5, fresh: 1 / 0.065, ccx: 0.85, kc: [0.6, 1.15, 0.8],
    heatT: 33, nOpt: 18, nconc: 0.02, price: 4.5, fixed: 20000, h: 0.8, sow: 121, leaf: 0x3b8f3f, ripe: 0x6b7f3a, fruitC: 0xe53935, col: '#f87171' },
  pamuk: { name: 'Pamuk', emoji: '☁️', base: 15.6, gdd: 1300, wp: 19, hi: 0.35, fresh: 1.08, ccx: 0.88, kc: [0.35, 1.18, 0.6],
    heatT: 38, nOpt: 15, nconc: 0.015, price: 28, fixed: 8000, h: 1.15, sow: 115, leaf: 0x4c9a45, ripe: 0x8a6f4d, fruitC: 0xf8fafc, col: '#e2e8f0' },
};

const sim = createSim({
  background: 0x9cc7ea,
  camera: { position: [0, 27, 31], target: [0, 0, 2], fov: 45 },
  controls: { maxDistance: 70, minDistance: 8, maxPolarAngle: Math.PI * 0.46 },
  fog: [60, 140],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Dört tarlada dört ayrı ürün bir sezon boyunca (1 Mart – 31 Ekim) gün gün büyür. Bitkilerin boyu ve yaprak örtüsü
    biyokütleyi, rengi suyun ve olgunluğun durumunu gösterir: sararan yapraklar <b>su stresi</b>, altın/kahverengi renk
    <b>olgunluk</b> demektir. Toprak rengi nemle koyulaşır.</p>
    <p><b>Model:</b> Toprak bir <b>kova</b> gibidir: yağmur + sulama girer, bitki terlemesi (ET = Ks·Kc·ET₀) çıkar, taşan su derine
    sızar ve yanında azotu yıkar. Su, kovanın “kolay alınabilir” kısmının altına inince bitki stomalarını kapatır (Ks &lt; 1)
    ve büyüme yavaşlar. Biyokütle ≈ su verimliliği × Σ(terleme/ET₀) (AquaCrop yaklaşımı), verim = biyokütle × hasat indeksi.
    Gelişim hızı <b>büyüme derece-günü</b> ile ilerler. Azota tepki azalan verimlidir (Mitscherlich eğrisi); aşırı gübre
    yatma ve tuzluluk ile verimi düşürür, fazlası yıkanır.</p>
    <h3>Dene</h3>
    <ul>
      <li>“Kuraklık” senaryosunda sulamayı salmadan damlaya çevir: aynı su ile verim ve su ayak izi nasıl değişiyor?</li>
      <li>Gübreyi 0'dan 40 kg/da'ya adım adım artır: verim önce hızla artar, sonra düzleşir, en sonunda düşer.</li>
      <li>Mısırı çok geç ek: çiçeklenme temmuz sıcağına denk gelir. “Sıcak hava dalgası”nda hangi ürün en çok zarar görüyor?</li>
      <li>Kuraklığa dayanıklı çeşit normal yılda biraz az, kurak yılda çok daha fazla verir mi?</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Salma (karık) sulamada suyun önemli bir kısmı buharlaşma, yüzey akışı ve derine sızmayla kaybolur; damla sulamada verim
    çok daha yüksektir. Fazla azot yeraltı suyunda nitrat kirliliğine yol açar. Buğday burada ilkbahar ekimiyle modellenmiştir
    (Türkiye'de çoğunlukla kışlık ekilir). Fiyat ve maliyetler örnektir; bölgeye ve yıla göre çok değişir.</p>`,
});

// --- Yardımcılar ---
const doyToDate = (doy) => {
  let m = 0, d = doy;
  while (m < 11 && d > MDAYS[m]) { d -= MDAYS[m]; m++; }
  return `${d} ${MONTHS[m]}`;
};
const monthOf = (doy) => { let m = 0, d = doy; while (m < 11 && d > MDAYS[m]) { d -= MDAYS[m]; m++; } return m; };
const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

// --- Hava üretimi ---
let weatherSeed = 7;
let weather = [];
let hailDay = -1, heatStart = -1;
function makeWeather() {
  const r = seeded(weatherSeed);
  const g = () => { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const sc = scenario.value;
  const rainMul = sc === 'kurak' ? 0.3 : 1, tAdd = sc === 'kurak' ? 1.5 : 0;
  heatStart = sc === 'sicak' ? 168 + Math.floor(r() * 10) : -1;
  hailDay = sc === 'dolu' ? 150 + Math.floor(r() * 40) : -1;
  weather = [];
  let e = 0;
  for (let doy = DOY0; doy <= DOY1; doy++) {
    e = 0.7 * e + g() * 1.8;
    const m = monthOf(doy);
    const pWet = Math.min(0.55, RAIN_M[m] / 70 + 0.02);
    const mean = RAIN_M[m] / Math.max(1, pWet * MDAYS[m]);
    let rain = r() < pWet ? -Math.log(1 - r()) * mean * rainMul : 0;
    if (rain < 0.5) rain = 0;
    let T = 16 + 12 * Math.sin((2 * Math.PI * (doy - 110)) / 365) + e + tAdd;
    const heat = heatStart > 0 && doy >= heatStart && doy < heatStart + 12;
    if (heat) T += 8;
    if (rain > 0) T -= 2;
    const dtr = 12 + 3 * Math.sin((2 * Math.PI * (doy - 110)) / 365) - (rain > 0 ? 4 : 0);
    const tmax = T + dtr / 2;
    const Ra = 29 + 12 * Math.sin((2 * Math.PI * (doy - 80)) / 365); // tepe radyasyonu (MJ/m²/gün), ~37°K
    const et0 = Math.max(0.3, 0.0023 * (T + 17.8) * Math.sqrt(Math.max(1, dtr)) * Ra * 0.408);
    weather.push({ doy, T, tmax, rain, et0, heat, hail: doy === hailDay });
  }
}

// --- Sahne: zemin, çiftlik ---
const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x6b8f3e, roughness: 1 }));
grass.rotation.x = -Math.PI / 2;
sim.scene.add(grass);
{
  // Tarla yolu
  const road = new THREE.MeshStandardMaterial({ color: 0xa08a68, roughness: 1 });
  const r1 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2 * PLOT + GAP + 8), road);
  r1.rotation.x = -Math.PI / 2; r1.position.y = 0.01;
  sim.scene.add(r1);
  const r2 = new THREE.Mesh(new THREE.PlaneGeometry(2 * PLOT + GAP + 8, 2.2), road);
  r2.rotation.x = -Math.PI / 2; r2.position.y = 0.011;
  sim.scene.add(r2);
  // Çiftlik evi
  const house = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3), new THREE.MeshStandardMaterial({ color: 0xe8dcc4 }));
  wall.position.y = 1.2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.6, 4), new THREE.MeshStandardMaterial({ color: 0xb4432f }));
  roof.position.y = 3.2; roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.8);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x6b4226 }));
  door.position.set(0, 0.7, 1.52);
  house.add(wall, roof, door);
  house.position.set(-17, 0, -9);
  sim.scene.add(house);
  // Su deposu
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 16), new THREE.MeshStandardMaterial({ color: 0x7c9cb4, metalness: 0.2, roughness: 0.5 }));
  tank.position.set(-17, 3.2, -4.5);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.1, 1.6), new THREE.MeshStandardMaterial({ color: 0x5b4636, wireframe: true }));
  legs.position.set(-17, 1.05, -4.5);
  sim.scene.add(tank, legs);
  // Ağaçlar
  const tr = instanced(new THREE.ConeGeometry(1, 2.6, 7), new THREE.MeshStandardMaterial({ color: 0x2f6b34 }), 16);
  const tt = instanced(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2b }), 16);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2, R = 20 + hash(i, 3) * 4;
    const x = Math.cos(a) * R * 1.1, z = Math.sin(a) * R * 0.75 - 4;
    if (z > 8) { tr.setMatrixAt(i, m.makeScale(0, 0, 0)); tt.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
    const s = 0.8 + hash(i, 7) * 0.6;
    tr.setMatrixAt(i, m.compose(new THREE.Vector3(x, 1 + 1.3 * s, z), q, new THREE.Vector3(s, s, s)));
    tt.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0.5, z), q, new THREE.Vector3(1, 1, 1)));
  }
  sim.scene.add(tr, tt);
}
// Meteoroloji istasyonu ve etiketi
const station = new THREE.Group();
{
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), new THREE.MeshStandardMaterial({ color: 0xcbd5e1 }));
  pole.position.y = 1.5;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
  box.position.y = 2.2;
  station.add(pole, box);
  station.position.set(15, 0, -9);
  sim.scene.add(station);
}
const wxLbl = sim.label('', { parent: station, position: [0, 3.6, 0], className: 'big' });

// Yağmur / dolu parçacıkları
const RAIN_N = 900;
const rainPos = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) {
  const x = (Math.random() - 0.5) * 40, y = Math.random() * 16, z = (Math.random() - 0.5) * 34;
  rainPos.set([x, y, z, x, y + 0.5, z], i * 6);
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0, depthWrite: false });
const rainPts = new THREE.LineSegments(rainGeo, rainMat);
rainPts.frustumCulled = false;
sim.scene.add(rainPts);
let rainVis = 0, hailVis = 0;

// --- Bitki geometrileri (yükseklik 1'e normalize) ---
function geo(g, x = 0, y = 0, z = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  g.scale(sx, sy, sz); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z);
  return g;
}
const merge = (list) => BufferGeometryUtils.mergeGeometries(list.map((g) => g.toNonIndexed()));
const GEOS = {
  bugday: {
    plant: merge([0, 1, 2, 3].map((i) => geo(new THREE.ConeGeometry(0.035, 1, 4), Math.cos(i * 1.6) * 0.06, 0.5, Math.sin(i * 1.6) * 0.06, Math.sin(i) * 0.12, Math.cos(i) * 0.12))),
    fruit: merge([0, 1, 2, 3].map((i) => geo(new THREE.SphereGeometry(0.04, 5, 4), Math.cos(i * 1.6) * 0.12, 0.98, Math.sin(i * 1.6) * 0.12, 0, 0, 1, 3, 1))),
  },
  misir: {
    plant: merge([
      geo(new THREE.CylinderGeometry(0.035, 0.05, 1, 5), 0, 0.5),
      ...[0, 1, 2, 3, 4].map((i) => geo(new THREE.BoxGeometry(0.45, 0.012, 0.07), 0.2 * (i % 2 ? 1 : -1), 0.25 + i * 0.15, 0, 0, (i % 2 ? -1 : 1) * 0.35)),
    ]),
    fruit: merge([geo(new THREE.CylinderGeometry(0.045, 0.035, 0.2, 6), 0.07, 0.5, 0, 0, -0.35)]),
  },
  domates: {
    plant: merge([geo(new THREE.SphereGeometry(0.42, 7, 5), 0, 0.55, 0, 0, 0, 1, 0.85, 1), geo(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 4), 0, 0.15)]),
    fruit: merge([0, 1, 2, 3, 4].map((i) => geo(new THREE.SphereGeometry(0.075, 6, 4), Math.cos(i * 1.3) * 0.38, 0.35 + (i % 3) * 0.14, Math.sin(i * 1.3) * 0.38))),
  },
  pamuk: {
    plant: merge([geo(new THREE.SphereGeometry(0.33, 7, 5), 0, 0.62, 0, 0, 0, 1, 1.1, 1), geo(new THREE.CylinderGeometry(0.025, 0.035, 0.4, 4), 0, 0.2)]),
    fruit: merge([0, 1, 2, 3, 4, 5].map((i) => geo(new THREE.SphereGeometry(0.075, 6, 4), Math.cos(i * 1.05) * 0.26, 0.8 + (i % 2) * 0.12, Math.sin(i * 1.05) * 0.26))),
  },
};
const plantMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
const fruitMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
const dripMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 });

// --- Tarlalar ---
const CENTERS = [[-(PLOT + GAP) / 2, -(PLOT + GAP) / 2], [(PLOT + GAP) / 2, -(PLOT + GAP) / 2], [-(PLOT + GAP) / 2, (PLOT + GAP) / 2], [(PLOT + GAP) / 2, (PLOT + GAP) / 2]];
const DEFAULTS = [
  { crop: 'bugday', variety: 'standart', irr: 0, method: 'salma', N: 14 },
  { crop: 'misir', variety: 'standart', irr: 65, method: 'salma', N: 20 },
  { crop: 'domates', variety: 'standart', irr: 45, method: 'damla', N: 18 },
  { crop: 'pamuk', variety: 'standart', irr: 75, method: 'salma', N: 15 },
];
const DRY = new THREE.Color(0xc3a27a), WET = new THREE.Color(0x4e3524);
const plots = CENTERS.map(([cx, cz], i) => {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  sim.scene.add(g);
  const soil = new THREE.Mesh(new THREE.BoxGeometry(PLOT, 0.2, PLOT), new THREE.MeshStandardMaterial({ color: 0x8b6b4a, roughness: 1 }));
  soil.position.y = 0.0;
  soil.userData.plot = i;
  g.add(soil);
  // Karıklar (sıra arası izler)
  const fur = instanced(new THREE.BoxGeometry(PLOT - 0.4, 0.02, 0.12), new THREE.MeshStandardMaterial({ color: 0x5c4330, roughness: 1 }), ROWS_N);
  const water = instanced(new THREE.BoxGeometry(PLOT - 0.4, 0.03, 0.22), new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0, roughness: 0.2 }), ROWS_N);
  const drip = instanced(new THREE.CylinderGeometry(0.035, 0.035, PLOT - 0.4, 5), dripMat, ROWS_N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  for (let r = 0; r < ROWS_N; r++) {
    const z = -PLOT / 2 + (r + 0.5) * (PLOT / ROWS_N);
    fur.setMatrixAt(r, m.makeTranslation(0, 0.105, z + PLOT / ROWS_N / 2));
    water.setMatrixAt(r, m.makeTranslation(0, 0.115, z + PLOT / ROWS_N / 2));
    drip.setMatrixAt(r, m.compose(new THREE.Vector3(0, 0.14, z + 0.1), q, new THREE.Vector3(1, 1, 1)));
  }
  g.add(fur, water, drip);
  // Seçim çerçevesi
  const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(PLOT + 0.5, 0.3, PLOT + 0.5)), new THREE.LineBasicMaterial({ color: 0xfacc15 }));
  sel.position.y = 0.1;
  sel.visible = false;
  g.add(sel);
  const lbl = sim.label('', { parent: g, position: [0, 3.2, PLOT / 2 - 1.2] });
  // Bitki taban yerleşimi
  const base = [];
  for (let r = 0; r < ROWS_N; r++) for (let c = 0; c < COLS_N; c++) {
    const k = r * COLS_N + c;
    base.push({
      x: -PLOT / 2 + (c + 0.5) * (PLOT / COLS_N) + (hash(k, i) - 0.5) * 0.15,
      z: -PLOT / 2 + (r + 0.5) * (PLOT / ROWS_N) + (hash(i, k) - 0.5) * 0.1,
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler((hash(k, 9) - 0.5) * 0.1, hash(k, 5) * 6.28, (hash(k, 4) - 0.5) * 0.1)),
      s: 0.85 + hash(k, 11) * 0.3, h: hash(k, i + 20),
    });
  }
  return { i, g, soil, water, drip, sel, lbl, base, plant: null, fruit: null, ...structuredClone(DEFAULTS[i]), sow: CROPS[DEFAULTS[i].crop].sow };
});

function buildPlants(p) {
  for (const k of ['plant', 'fruit']) if (p[k]) { p[k].removeFromParent(); p[k].dispose(); }
  const G = GEOS[p.crop];
  p.plant = instanced(G.plant, plantMat, PLANTS);
  p.fruit = instanced(G.fruit, fruitMat, PLANTS);
  const w = new THREE.Color(1, 1, 1);
  for (let k = 0; k < PLANTS; k++) { p.plant.setColorAt(k, w); p.fruit.setColorAt(k, w); }
  p.plant.frustumCulled = p.fruit.frustumCulled = false;
  p.g.add(p.plant, p.fruit);
}

function resetPlotState(p) {
  Object.assign(p, {
    W: (scenario.value === 'kurak' ? 0.45 : 0.9) * taw(p), sown: false, done: false, gdd: 0, f: 0, B: 0, CC: 0, ccDmg: 0, ksAvg: 1, ks: 1,
    hiHeat: 1, hiWater: 1, hiHail: 1, leached: 0, uptake: 0, et: 0, irrApplied: 0, drainSum: 0, wet: 0,
    harvestDoy: 0, yield: 0, immature: false, heatDays: 0, stressDays: 0,
  });
}
const taw = (p) => (p.variety === 'dayanikli' ? 175 : 145);
const depl = (p) => (p.variety === 'dayanikli' ? 0.62 : 0.5);

// Azot faktörü (Mitscherlich) ve aşırı gübre cezası
function nFactor(p) {
  const c = CROPS[p.crop];
  const supply = Math.max(0, NSOIL + p.N - p.leached);
  return 1 - Math.exp(-supply / (c.nOpt / 3));
}
const overN = (p) => clamp(1 - 0.015 * Math.max(0, p.N - 1.4 * CROPS[p.crop].nOpt), 0.5, 1);

function canopyPot(c, f) {
  return c.ccx * Math.max(0.03, smoothstep(0.0, 0.32, f)) * (1 - 0.5 * smoothstep(0.85, 1, f));
}
function kcAt(c, f) {
  const [ini, mid, end] = c.kc;
  if (f < 0.15) return ini;
  if (f < 0.45) return lerp(ini, mid, (f - 0.15) / 0.3);
  if (f < 0.8) return mid;
  return lerp(mid, end, (f - 0.8) / 0.2);
}

function stepPlot(p, w) {
  const c = CROPS[p.crop], doy = w.doy;
  if (!p.sown && !p.done && doy >= p.sow) p.sown = true;
  const growing = p.sown && !p.done;
  const TAW = taw(p), pDep = depl(p);
  // Sulama
  let irr = 0;
  if (growing && p.irr > 0) {
    if (p.method === 'damla') irr = p.irr / 7;
    else if ((doy - p.sow) % 7 === 0) irr = p.irr;
  }
  const eff = p.method === 'damla' ? 0.9 : 0.6;
  p.irrApplied += irr;
  if (irr > 0 && p.method === 'salma') p.wet = 1;
  let drain = p.method === 'salma' ? irr * 0.2 : 0;  // salmada kaybın bir kısmı derine sızar
  p.W += w.rain * (w.rain > 25 ? 0.85 : 1) + irr * eff;
  if (p.W > TAW) { drain += p.W - TAW; p.W = TAW; }
  p.drainSum += drain;
  // Azot yıkanması
  const pool = Math.max(0, NSOIL + p.N - p.leached - p.uptake);
  if (drain > 0) p.leached += pool * (drain / (drain + 300)) * 0.5;
  // Su stresi ve evapotranspirasyon
  const ks = p.W >= (1 - pDep) * TAW ? 1 : Math.max(0, p.W / ((1 - pDep) * TAW));
  p.ks = ks;
  let et;
  if (growing) et = ks * Math.max(0.25, kcAt(c, p.f) * (0.3 + 0.7 * Math.min(1, p.CC / c.ccx + 0.2))) * w.et0;
  else et = 0.2 * (p.W / TAW) * w.et0;
  et = Math.min(et, p.W);
  p.W -= et;
  if (!growing) return;
  p.et += et;
  // Gelişim ve büyüme
  p.gdd += Math.max(0, Math.min(w.T, 32) - c.base);
  p.f = Math.min(1, p.gdd / c.gdd);
  const nf = nFactor(p);
  p.ksAvg = lerp(p.ksAvg, ks, 0.08);
  p.CC = canopyPot(c, p.f) * Math.sqrt(nf) * (0.35 + 0.65 * p.ksAvg) * (1 - p.ccDmg);
  const tf = clamp((w.T - c.base) / 4, 0, 1) * (w.tmax > c.heatT + 6 ? 0.7 : 1);
  const dB = c.wp * ks * p.CC * 1.1 * tf * nf;
  p.B += dB;
  p.uptake += dB * c.nconc;
  p.ccDmg *= 0.97;
  if (ks < 0.5) p.stressDays++;
  if (p.f > 0.45 && p.f < 0.72) {
    if (w.tmax > c.heatT) { p.hiHeat = Math.max(0.3, p.hiHeat - (w.tmax - c.heatT) * 0.006); p.heatDays++; }
    if (ks < 0.6) p.hiWater = Math.max(0.4, p.hiWater - (0.6 - ks) * 0.03);
  }
  if (w.hail) {
    p.B *= 0.72; p.ccDmg = 0.55;
    if (p.f > 0.4) p.hiHail *= 0.75;
  }
  if (p.f >= 1) harvest(p, doy, false);
}

function yieldEst(p) {
  const c = CROPS[p.crop];
  const immat = p.f >= 1 ? 1 : smoothstep(0.55, 1, p.f);
  return p.B * c.hi * p.hiHeat * p.hiWater * p.hiHail * overN(p) * (p.variety === 'dayanikli' ? 0.92 : 1) * immat * c.fresh;
}
function harvest(p, doy, forced) {
  p.done = true;
  p.harvestDoy = doy;
  p.immature = forced && p.f < 1;
  p.yield = yieldEst(p);
  if (!forced) sim.toast(`${CROPS[p.crop].emoji} T${p.i + 1} hasat edildi: <b>${fmt(p.yield)} kg/da</b>`, 'good');
}

function economics(p) {
  const c = CROPS[p.crop];
  const y = p.done ? p.yield : yieldEst(p);
  const revenue = y * prices[p.crop];
  const water = p.irrApplied * waterCost.value; // 1 mm = 1 m³/da
  const cost = c.fixed + (p.variety === 'dayanikli' ? 400 : 0) + p.N * nPrice.value + water + (p.method === 'damla' && p.irr > 0 ? 1500 : 0);
  const wf = y > 1 ? (p.et * 1000) / y : Infinity;
  return { y, revenue, cost, profit: revenue - cost, wf };
}

// --- Sezon akışı ---
let day = 0, acc = 0, ended = false;
function newSeason(reroll) {
  if (reroll) weatherSeed = (Math.random() * 1e9) | 0;
  makeWeather();
  day = 0; acc = 0; ended = false;
  plots.forEach((p) => { resetPlotState(p); if (!p.plant || p.plant.userData.crop !== p.crop) { buildPlants(p); p.plant.userData.crop = p.crop; } });
  rainTotal = 0;
  sim.hud.hide();
  chartW.clear(); chartB.clear();
  refreshLegend();
  updateVisuals();
  updatePanel();
}
let rainTotal = 0;

function stepDay() {
  if (ended) return;
  const w = weather[day];
  rainTotal += w.rain;
  for (const p of plots) stepPlot(p, w);
  if (w.rain > 0) rainVis = Math.max(rainVis, clamp(w.rain / 15, 0.35, 1));
  if (w.hail) { hailVis = 1; sim.toast('🧊 Dolu yağdı! Yapraklar ve meyveler zarar gördü.', 'bad'); }
  if (w.heat && weather[day - 1] && !weather[day - 1].heat) sim.toast('🔥 Sıcak hava dalgası başladı (+8 °C)', 'warn');
  const sp = plots[selIdx];
  chartW.push([100 * sp.W / taw(sp), 100 * sp.ks, Math.min(100, w.rain * 3)]);
  chartB.push(plots.map((p) => p.B));
  day++;
  const allDone = plots.every((p) => p.done);
  if (day >= SEASON || allDone) {
    for (const p of plots) if (!p.done) harvest(p, DOY0 + day - 1, true);
    ended = true;
    showSummary();
  }
}

sim.onUpdate((dt) => {
  if (ended) return;
  acc += dt;
  let n = 0;
  while (acc >= SEC_PER_DAY && !ended && n < 40) { acc -= SEC_PER_DAY; stepDay(); n++; }
  if (n) { updateVisuals(); if (sim.frame % 2 === 0 || ended) updatePanel(); }
});

sim.onRender((rdt) => {
  // Yağmur/dolu parçacıkları
  rainVis = Math.max(0, rainVis - rdt * 0.9);
  hailVis = Math.max(0, hailVis - rdt * 0.35);
  const vis = Math.max(rainVis, hailVis);
  rainPts.visible = vis > 0.01;
  if (rainPts.visible) {
    const hail = hailVis > rainVis;
    rainMat.opacity = 0.7 * vis;
    rainMat.color.setHex(hail ? 0xffffff : 0xbfd8ff);
    const a = rainGeo.attributes.position.array, len = hail ? 0.15 : 0.5, sp = rdt * (hail ? 9 : 16);
    for (let i = 0; i < RAIN_N; i++) {
      let y = a[i * 6 + 1] - sp;
      if (y < 0) y += 16;
      a[i * 6 + 1] = y; a[i * 6 + 4] = y + len;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  // Salma suyu zamanla çekilir
  for (const p of plots) {
    p.wet = Math.max(0, p.wet - rdt * 0.5 * sim.speed);
    p.water.material.opacity = 0.75 * p.wet;
    p.water.visible = p.wet > 0.01;
  }
  // Gökyüzü
  const w = weather[Math.min(day, SEASON - 1)];
  const target = _sky.setHex(w && w.heat ? 0xe9c89f : 0x9cc7ea).lerp(_gray.setHex(0x61748a), Math.max(rainVis, hailVis) * 0.8);
  sim.scene.background.lerp(target, Math.min(1, rdt * 3));
  sim.scene.fog.color.copy(sim.scene.background);
});
const _sky = new THREE.Color(), _gray = new THREE.Color();

// --- Görsel güncelleme ---
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const STRESS = new THREE.Color(0xc9b458), STUB = new THREE.Color(0xa88a5c);
function updateVisuals() {
  for (const p of plots) {
    const c = CROPS[p.crop];
    p.soil.material.color.copy(DRY).lerp(WET, clamp(p.W / taw(p), 0, 1));
    p.drip.visible = p.method === 'damla';
    const growing = p.sown && !p.done;
    const hFrac = p.sown ? (0.16 + 0.84 * smoothstep(0, 0.62, p.f)) * (0.55 + 0.45 * Math.min(1, p.B / (c.wp * 45))) : 0;
    const wFrac = 0.45 + 0.55 * Math.min(1, p.CC / c.ccx + 0.15);
    const ripe = smoothstep(0.78, 1, p.f);
    const fruitVis = p.sown ? smoothstep(0.45, 0.6, p.f) : 0;
    const keep = p.hiHeat * p.hiWater * p.hiHail * Math.min(1, p.B / (c.wp * 40) + 0.3);
    for (let k = 0; k < PLANTS; k++) {
      const b = p.base[k];
      let hs, ws;
      if (!p.sown) { hs = 0; ws = 0; }
      else if (p.done) { hs = 0.07; ws = 0.6; }
      else { hs = c.h * hFrac * b.s; ws = wFrac * b.s * (c.h > 1.5 ? 1 : 1.1); }
      _m.compose(_v.set(b.x, 0.1, b.z), b.q, _s.set(ws, Math.max(hs, 0.0001), ws));
      p.plant.setMatrixAt(k, _m);
      if (p.done) _c.copy(STUB);
      else {
        _c.setHex(c.leaf).lerp(STRESS, (1 - p.ks) * 0.8).lerp(_c2.setHex(c.ripe), ripe);
        _c.multiplyScalar(0.9 + b.h * 0.2);
      }
      p.plant.setColorAt(k, _c);
      const showF = growing && fruitVis > 0 && b.h < keep;
      _m.compose(_v.set(b.x, 0.1, b.z), b.q, _s.set(showF ? ws : 0, showF ? Math.max(hs, 0.0001) : 0, showF ? ws : 0));
      p.fruit.setMatrixAt(k, _m);
      if (showF) {
        const ripeF = smoothstep(0.62, 0.95, p.f);
        p.fruit.setColorAt(k, _c.setHex(p.crop === 'domates' || p.crop === 'pamuk' ? 0x5a9e3c : 0x8fb04a).lerp(_c2.setHex(c.fruitC), ripeF));
      }
    }
    p.plant.instanceMatrix.needsUpdate = p.fruit.instanceMatrix.needsUpdate = true;
    p.plant.instanceColor.needsUpdate = p.fruit.instanceColor.needsUpdate = true;
    // Etiket
    let status;
    if (!p.sown) status = `ekim: ${doyToDate(p.sow)}`;
    else if (p.done) status = `<b style="color:#86efac">${fmt(p.yield)} kg/da</b>${p.immature ? ' (olgunlaşmadan)' : ''}`;
    else status = `%${fmt(p.f * 100)} gelişim${p.ks < 0.6 ? ' · <span style="color:#fca5a5">susuz!</span>' : ''}`;
    p.lbl.setText(`T${p.i + 1} ${c.emoji} ${c.name} · ${status}`);
    p.sel.visible = p.i === selIdx;
  }
  const w = weather[Math.min(day, SEASON - 1)];
  if (w) {
    const icon = w.hail ? '🧊' : w.rain > 0 ? '🌧️' : w.heat ? '🔥' : w.tmax > 32 ? '☀️' : '🌤️';
    wxLbl.setText(`${icon} ${fmt(w.tmax)} °C${w.rain > 0 ? ` · ${fmt(w.rain)} mm` : ''}`);
  }
}

// --- Arayüz ---
let selIdx = 0;
const prices = Object.fromEntries(Object.entries(CROPS).map(([k, c]) => [k, c.price]));
const ui = sim.ui;
ui.section('Tarla seç');
const plotSeg = ui.segmented({ options: plots.map((p) => ({ value: p.i, label: `T${p.i + 1}` })), value: 0, onChange: (v) => selectPlot(v) });
ui.text('<small>Sahnede bir tarlaya tıklayarak da seçebilirsin. Ürün, çeşit ve ekim tarihi değişince sezon baştan başlar; sulama ve gübre anında etkiler.</small>');

ui.section('Seçili tarlanın yönetimi');
const cropSel = ui.select({ label: 'Ürün', options: Object.entries(CROPS).map(([k, c]) => ({ value: k, label: `${c.emoji} ${c.name}` })), value: plots[0].crop,
  onChange: (v) => { const p = plots[selIdx]; p.crop = v; p.sow = CROPS[v].sow; sowS.set(p.sow); priceS.set(prices[v]); newSeason(false); } });
const varSeg = ui.segmented({ label: 'Tohum çeşidi', options: [{ value: 'standart', label: 'Standart' }, { value: 'dayanikli', label: 'Kuraklığa dayanıklı' }], value: 'standart',
  onChange: (v) => { plots[selIdx].variety = v; newSeason(false); } });
const sowS = ui.slider({ label: 'Ekim tarihi', min: 60, max: 180, step: 1, value: plots[0].sow, format: doyToDate,
  onChange: (v) => { plots[selIdx].sow = v; newSeason(false); } });
const irrS = ui.slider({ label: 'Sulama', min: 0, max: 120, step: 1, value: plots[0].irr, unit: 'mm/hafta', onChange: (v) => { plots[selIdx].irr = v; updatePanel(); } });
const methSeg = ui.segmented({ label: 'Sulama yöntemi', options: [{ value: 'damla', label: '💧 Damla (%90 verim)' }, { value: 'salma', label: '🌊 Salma (%60 verim)' }], value: plots[0].method,
  onChange: (v) => { plots[selIdx].method = v; updateVisuals(); updatePanel(); } });
const nS = ui.slider({ label: 'Azotlu gübre (N)', min: 0, max: 40, step: 1, value: plots[0].N, unit: 'kg/da', onChange: (v) => { plots[selIdx].N = v; updatePanel(); } });
ui.button({ label: 'Bu sulama/gübre ayarını tüm tarlalara uygula', onClick: () => {
  const s = plots[selIdx];
  plots.forEach((p) => { p.irr = s.irr; p.method = s.method; p.N = s.N; });
  updateVisuals(); updatePanel(); sim.toast('Ayarlar dört tarlaya uygulandı');
} });

ui.section('Hava ve senaryo');
const scenario = ui.segmented({ options: [{ value: 'normal', label: 'Normal' }, { value: 'kurak', label: '🏜️ Kuraklık' }, { value: 'sicak', label: '🔥 Sıcak dalga' }, { value: 'dolu', label: '🧊 Dolu' }],
  value: 'normal', onChange: () => newSeason(false) });
ui.buttons([
  { label: '🎲 Yeni hava', onClick: () => newSeason(true) },
  { label: '⏩ Sezonu bitir', variant: 'primary', onClick: () => { while (!ended) stepDay(); updateVisuals(); updatePanel(); } },
]);
const stDate = ui.stat({ label: 'Tarih' });
const stT = ui.stat({ label: 'En yüksek sıcaklık', unit: '°C' });
const stRain = ui.stat({ label: 'Toplam yağış', unit: 'mm' });
const stET0 = ui.stat({ label: 'ET₀ (bugün)', unit: 'mm' });

ui.section('Seçili tarla');
const mW = ui.meter({ label: 'Toprak suyu (kullanılabilir)', color: '#3b82f6' });
const mF = ui.meter({ label: 'Gelişim (derece-gün)', color: '#22c55e' });
const stB = ui.stat({ label: 'Biyokütle', unit: 'kg/da' });
const stY = ui.stat({ label: 'Verim (tahmini)', unit: 'kg/da' });
const stProfit = ui.stat({ label: 'Kâr', unit: '₺/da' });
const stRev = ui.stat({ label: 'Gelir / maliyet', unit: '₺/da' });
const stIrr = ui.stat({ label: 'Sulama suyu', unit: 'm³/da' });
const stWF = ui.stat({ label: 'Su ayak izi', unit: 'L/kg' });
const stLeach = ui.stat({ label: 'Yıkanan azot', unit: 'kg/da' });
const stNf = ui.stat({ label: 'Azot yeterliliği' });
const note = ui.text('', 'card');
const chartW = ui.chart({ title: 'Seçili tarla: toprak suyu ve stres (%)', yMin: 0, yMax: 100, maxPoints: SEASON,
  series: [{ name: 'Toprak suyu', color: '#3b82f6', fill: true }, { name: 'Su stresi yok (Ks)', color: '#22c55e' }, { name: 'Yağış', color: '#94a3b8' }] });
const chartB = ui.chart({ title: 'Biyokütle (kg/da)', maxPoints: SEASON, series: PLOT_COL.map((color) => ({ name: 'T', color })) });

ui.section('Fiyatlar (örnek)', { open: false });
const priceS = ui.slider({ label: 'Seçili ürünün fiyatı', min: 1, max: 60, step: 0.5, value: prices[plots[0].crop], format: (v) => `${fmt(v, 1)} ₺/kg`,
  onChange: (v) => { prices[plots[selIdx].crop] = v; updatePanel(); } });
const nPrice = ui.slider({ label: 'Azot fiyatı', min: 10, max: 100, step: 1, value: 40, format: (v) => `${fmt(v)} ₺/kg N`, onChange: () => updatePanel() });
const waterCost = ui.slider({ label: 'Sulama suyu + pompa enerjisi', min: 0, max: 10, step: 0.25, value: 2.5, format: (v) => `${fmt(v, 2)} ₺/m³`, onChange: () => updatePanel() });
ui.text('<small>Sabit maliyet (tohum, toprak işleme, ilaç, hasat) ürüne göre eklenir; damla sistemi +1.500 ₺/da, dayanıklı tohum +400 ₺/da.</small>');

function refreshLegend() {
  chartB.el.querySelectorAll('.legend span').forEach((s, i) => {
    const c = CROPS[plots[i].crop];
    s.lastChild.textContent = `T${i + 1} ${c.name}`;
  });
}

function selectPlot(i) {
  selIdx = i;
  plotSeg.set(i);
  const p = plots[i];
  cropSel.set(p.crop); varSeg.set(p.variety); sowS.set(p.sow); irrS.set(p.irr); methSeg.set(p.method); nS.set(p.N);
  priceS.set(prices[p.crop]);
  chartW.clear();
  updateVisuals();
  updatePanel();
}

function updatePanel() {
  const w = weather[Math.min(day, SEASON - 1)];
  stDate.set(doyToDate(w.doy));
  stT.set(fmt(w.tmax), w.tmax > 35 ? 'bad' : w.tmax > 30 ? 'warn' : '');
  stRain.set(fmt(rainTotal));
  stET0.set(fmt(w.et0, 1));
  const p = plots[selIdx], c = CROPS[p.crop];
  const wr = p.W / taw(p);
  mW.set(wr, `%${fmt(wr * 100)}`);
  mW.color(wr < 1 - depl(p) ? '#f97316' : '#3b82f6');
  mF.set(p.f, p.done ? 'hasat edildi' : p.sown ? `%${fmt(p.f * 100)}` : 'ekilmedi');
  const e = economics(p);
  stB.set(fmt(p.B));
  stY.set(fmt(e.y), p.done ? 'good' : '');
  stY.el.querySelector('.stat-l').textContent = p.done ? 'Verim (hasat)' : 'Verim (tahmini)';
  stProfit.set(fmt(e.profit), e.profit >= 0 ? 'good' : 'bad');
  stRev.set(`${fmt(e.revenue / 1000, 1)} / ${fmt(e.cost / 1000, 1)} bin`);
  stIrr.set(fmt(p.irrApplied));
  stWF.set(isFinite(e.wf) ? fmt(e.wf) : '—');
  stLeach.set(fmt(p.leached, 1), p.leached > 3 ? 'bad' : p.leached > 1 ? 'warn' : '');
  const nf = nFactor(p);
  stNf.set(`%${fmt(nf * 100)}`, p.N > 1.4 * c.nOpt ? 'bad' : nf < 0.8 ? 'warn' : 'good');
  const tips = [];
  if (p.N > 1.4 * c.nOpt) tips.push(`⚠️ Aşırı gübre: ${c.name} için ~${c.nOpt} kg/da yeterli; fazlası yatma/tuzluluk yapar ve yıkanır.`);
  else if (nf < 0.75) tips.push('Azot yetersiz: yaprak örtüsü zayıf kalıyor.');
  if (p.stressDays > 10) tips.push(`💧 ${p.stressDays} gün şiddetli su stresi yaşandı.`);
  if (p.heatDays > 0) tips.push(`🔥 Çiçeklenmede ${p.heatDays} gün aşırı sıcak (> ${c.heatT} °C): tane/meyve tutumu azaldı.`);
  if (p.drainSum > 80) tips.push(`Derine sızan su: ${fmt(p.drainSum)} mm (sulama fazla ya da salma).`);
  if (p.immature) tips.push('Sezon bitti ama ürün olgunlaşmadı: ekim çok geçti.');
  note.set(tips.length ? tips.join('<br>') : `${c.emoji} ${c.name}: ${p.done ? 'hasat tamam.' : p.sown ? 'gelişiyor, sorun yok.' : `${doyToDate(p.sow)} tarihinde ekilecek.`}`);
}

function showSummary() {
  const rows = plots.map((p) => {
    const c = CROPS[p.crop], e = economics(p);
    return `<tr><td>T${p.i + 1} ${c.emoji} ${c.name}</td><td>${fmt(e.y)}</td><td style="color:${e.profit >= 0 ? '#86efac' : '#fca5a5'}">${fmt(e.profit)}</td><td>${isFinite(e.wf) ? fmt(e.wf) : '—'}</td></tr>`;
  }).join('');
  const sc = { normal: 'Normal yıl', kurak: 'Kuraklık', sicak: 'Sıcak hava dalgası', dolu: 'Dolu' }[scenario.value];
  sim.hud.show(`<h2>🚜 Hasat raporu · ${sc}</h2>
    <table style="margin:0 auto;font-size:13px;border-spacing:10px 3px;text-align:right">
      <tr style="color:#94a3b8"><th style="text-align:left">Tarla</th><th>Verim kg/da</th><th>Kâr ₺/da</th><th>Su izi L/kg</th></tr>${rows}</table>
    <small>Toplam yağış ${fmt(rainTotal)} mm</small><br>
    <button class="btn primary" data-a="same">Aynı havayla tekrar</button><button class="btn" data-a="new">🎲 Yeni sezon</button>`, { tone: 'good' });
  sim.hud.el.querySelector('[data-a=same]').onclick = () => newSeason(false);
  sim.hud.el.querySelector('[data-a=new]').onclick = () => newSeason(true);
}

sim.onClick(() => plots.map((p) => p.soil), (hit) => selectPlot(hit.object.userData.plot));
sim.formatTime = () => (weather.length ? doyToDate(weather[Math.min(day, SEASON - 1)].doy) : '');
sim.onReset(() => newSeason(false));
newSeason(false);
selectPlot(0);
