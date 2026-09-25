// Zaman Makinesi Şehir — temsili bir İstanbul kıyı semtinin 1900 → 2050 dönüşümü (konut, yeşil alan, ulaşım).
import { createSim, THREE, fmt, clamp, lerp, seeded, instanced } from '@core';

const Y0 = 1900, Y1 = 2050;
const LOTS = 10;       // her model parsel ≈ 10 gerçek parsel/bina
const LOT_M2 = 400;    // gerçek parsel alanı (m²)
const FLOOR_H = 0.3;   // 1 kat = 3 m = 0,3 birim

const sim = createSim({
  background: 0xa9cfee,
  camera: { position: [10, 23, 42], target: [0, 1, -4], fov: 46 },
  controls: { maxDistance: 110, minDistance: 8 },
  fog: [80, 170],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>İstanbul'daki pek çok kıyı semtinden esinlenen <b>temsili</b> bir mahalle: denize inen bir yamaç, sahil yolu, iskele,
    tepede cami ve koru. Zaman çizelgesini kaydırdıkça bahçeli iki katlı ahşap evler apartmanlara, bazı parseller yüksek
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

// --- Sahne: arazi, su, yollar ---
{
  const g = new THREE.PlaneGeometry(170, 120, 120, 90).rotateX(-Math.PI / 2).translate(0, 0, -35);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, Math.max(-3, hillY(pos.getZ(i))));
  g.computeVertexNormals();
  sim.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8a9a6a, roughness: 1 })));
}
const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 60).rotateX(-Math.PI / 2).translate(0, -0.25, 38), new THREE.MeshStandardMaterial({ color: 0x2a6f97, roughness: 0.25, metalness: 0.1 }));
sim.scene.add(water);
// Karşı kıyı silueti
{
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x7b8c74, roughness: 1 });
  for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 8), m); s.scale.set(1.6, 0.35, 0.7); s.position.set(-60 + k * 15, 0, 66 + (k % 2) * 4); g.add(s); }
  sim.scene.add(g);
}
const asphalt = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.95 });
const ROADS_Z = [5.9, (plots[12].z + plots[24].z) / 2, (plots[36].z + plots[48].z) / 2];
ROADS_Z.forEach((z, i) => {
  const road = new THREE.Mesh(new THREE.BoxGeometry(80, 0.08, i ? 1.3 : 2.2), asphalt);
  road.position.set(0, hillY(z) + 0.02, z);
  sim.scene.add(road);
});
const quay = new THREE.Mesh(new THREE.BoxGeometry(80, 0.6, 1.4), new THREE.MeshStandardMaterial({ color: 0xb8b2a4 }));
quay.position.set(0, -0.1, 7.6);
sim.scene.add(quay);
// İskele
const pier = new THREE.Group();
pier.add(new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 4).translate(0, 0, 2), new THREE.MeshStandardMaterial({ color: 0x8b6b4a })));
pier.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.4).translate(0, 0.75, 3.3), new THREE.MeshStandardMaterial({ color: 0xe8dcc4 })));
pier.add(new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 4).rotateY(Math.PI / 4).translate(0, 1.7, 3.3), new THREE.MeshStandardMaterial({ color: 0x9a4a36 })));
pier.position.set(5, 0.05, 7.6);
sim.scene.add(pier);
sim.label('⚓ İskele', { parent: pier, position: [0, 2.6, 3.3], className: 'plain' });

// Tramvay rayları, raylı sistem hattı, bisiklet yolları
const tramRails = new THREE.Mesh(new THREE.BoxGeometry(80, 0.03, 0.5), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6 }));
tramRails.position.set(0, hillY(5.3) + 0.08, 5.3);
const railLine = new THREE.Group();
railLine.add(new THREE.Mesh(new THREE.BoxGeometry(80, 0.35, 1.1), new THREE.MeshStandardMaterial({ color: 0x6b7280 })));
railLine.position.set(0, hillY(ROADS_Z[2]) - 0.05, ROADS_Z[2] - 1.35);
const station = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 1.6), new THREE.MeshStandardMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.85 }));
station.position.set(1.5, 0.6, -0.9);
railLine.add(station);
const stationLbl = sim.label('Ⓜ İstasyon', { parent: railLine, position: [1.5, 1.8, -0.9] });
const bikeMat = new THREE.MeshStandardMaterial({ color: 0x16a34a });
const bikeLanes = ROADS_Z.slice(0, 2).map((z, i) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(80, 0.05, 0.35), bikeMat);
  m.position.set(0, hillY(z) + 0.06, z + (i ? 0.75 : -1.25));
  return m;
});
sim.scene.add(tramRails, railLine, ...bikeLanes);

// --- Binalar (örnekli) ---
const N = plots.length;
const mk = (geo, mat, n = N) => { const m = instanced(geo, mat, n); sim.scene.add(m); return m; };
const houseBody = mk(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
const houseRoof = mk(new THREE.ConeGeometry(0.75, 0.5, 4).rotateY(Math.PI / 4).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ color: 0x9a4a36, roughness: 0.8, flatShading: true }));
const aptBody = mk(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.85 }));
const towerBody = mk(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.35 }));
const roofTop = mk(new THREE.BoxGeometry(1, 0.08, 1), new THREE.MeshStandardMaterial({ color: 0x4d9a3e, roughness: 1 }));
const lotTiles = mk(new THREE.BoxGeometry(2.3, 0.06, 2.3), new THREE.MeshStandardMaterial({ roughness: 1 }));
const TREES = N * 4;
const trees = mk(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.9, flatShading: true }), TREES);
// Cami
const mosque = new THREE.Group();
{
  const stone = new THREE.MeshStandardMaterial({ color: 0xe7e2d6, roughness: 0.8 }), lead = new THREE.MeshStandardMaterial({ color: 0x8e9aa6, roughness: 0.5 });
  mosque.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 2).translate(0, 0.55, 0), stone));
  mosque.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.1, 0), lead));
  mosque.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 10).translate(1.2, 1.6, 1.2), stone));
  mosque.add(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 10).translate(1.2, 3.55, 1.2), lead));
  const mp = plots.find((p) => p.mosque);
  mosque.position.set(mp.x, mp.y, mp.z);
}
sim.scene.add(mosque);

const HOUSE_COL = [0xd9a066, 0xc98b8b, 0x9fb3c8, 0xe8d6a8, 0xb89c7d];
const APT_COL = [0xefe6d2, 0xe2d4b7, 0xd8d0c4, 0xf2dfc4, 0xcfc6b8];
const tm = new THREE.Matrix4(), tc = new THREE.Color(), q = new THREE.Quaternion(), yAx = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s3 = new THREE.Vector3();
const place = (mesh, i, x, y, z, sx, sy, sz, rot = 0) => mesh.setMatrixAt(i, tm.compose(v.set(x, y, z), q.setFromAxisAngle(yAx, rot), s3.set(sx, sy, sz)));
const pickMap = new Map(); // mesh → [plot indeksleri]

function buildScene(y, plan) {
  const cnt = { hb: 0, ap: 0, tw: 0, rt: 0, tr: 0 };
  const idx = { hb: [], ap: [], tw: [] };
  const tree = (x, yy, z, sc = 1) => { if (cnt.tr < TREES) place(trees, cnt.tr++, x, yy + 0.55 * sc, z, sc, sc * 1.2, sc); };
  plots.forEach((p, i) => {
    const st = plotAt(p, y, plan);
    p.state = st;
    const ground = st.type === 'grove' || st.type === 'park' || st.type === 'house' || st.type === 'hist' ? 0x6f9a4e : st.type === 'green' ? 0x86a66a : 0xa8a39a;
    place(lotTiles, i, p.x, p.y + 0.01, p.z, 1, 1, 1);
    lotTiles.setColorAt(i, tc.setHex(ground));
    if (st.type === 'house' || st.type === 'hist') {
      const k = cnt.hb++;
      place(houseBody, k, p.x - 0.25, p.y, p.z + 0.3, 1.3, 2 * FLOOR_H * 1.6, 1.1, p.rot);
      houseBody.setColorAt(k, tc.setHex(HOUSE_COL[Math.floor(p.col * 5)]));
      place(houseRoof, k, p.x - 0.25, p.y + 2 * FLOOR_H * 1.6, p.z + 0.3, 1.25, 1, 1.05, p.rot);
      idx.hb.push(i);
      tree(p.x + 0.65, p.y, p.z - 0.6, 0.9);
      if (p.v > 0.4) tree(p.x - 0.7, p.y, p.z - 0.7, 0.75);
    } else if (st.type === 'apt' || st.type === 'green') {
      const k = cnt.ap++, h = st.floors * FLOOR_H;
      place(aptBody, k, p.x, p.y, p.z, 1.9, h, 1.8, p.rot * 0.3);
      aptBody.setColorAt(k, tc.setHex(st.type === 'green' ? 0xf4f1ea : APT_COL[Math.floor(p.col * 5)]));
      idx.ap.push(i);
      if (st.type === 'green') { place(roofTop, cnt.rt++, p.x, p.y + h + 0.04, p.z, 1.85, 1, 1.75); tree(p.x + 1, p.y, p.z + 0.9, 0.7); }
    } else if (st.type === 'tower') {
      const k = cnt.tw++;
      place(towerBody, k, p.x, p.y, p.z, 1.6, st.floors * FLOOR_H, 1.6);
      towerBody.setColorAt(k, tc.setHex(p.col > 0.5 ? 0x7f9bb3 : 0x9aa9b8));
      idx.tw.push(i);
    } else if (st.type === 'grove' || st.type === 'park') {
      for (let t = 0; t < (st.type === 'grove' ? 4 : 3); t++) tree(p.x + ((t % 2) - 0.5) * 1.1, p.y, p.z + (Math.floor(t / 2) - 0.5) * 1.1, st.type === 'grove' ? 1.1 : 0.85);
    }
  });
  houseBody.count = houseRoof.count = cnt.hb;
  aptBody.count = cnt.ap; towerBody.count = cnt.tw; roofTop.count = cnt.rt; trees.count = cnt.tr;
  pickMap.set(houseBody, idx.hb).set(aptBody, idx.ap).set(towerBody, idx.tw);
  for (const m of [houseBody, houseRoof, aptBody, towerBody, roofTop, lotTiles, trees]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }
}

// --- Araçlar: tramvay, otomobiller, tren, vapurlar ---
const tram = new THREE.Group();
tram.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.55).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: 0xb91c1c })));
tram.add(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.6).translate(0, 0.84, 0), new THREE.MeshStandardMaterial({ color: 0xf5f5dc })));
tram.position.set(0, hillY(5.3) + 0.08, 5.3);
const train = new THREE.Group();
for (let k = 0; k < 4; k++) train.add(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 0.6).translate(k * 2.4, 0.5, 0), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xf1f5f9 : 0xe2e8f0 })));
train.add(new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.12, 0.62).translate(3.6, 0.45, 0), new THREE.MeshStandardMaterial({ color: 0xdc2626 })));
train.position.copy(railLine.position).add(new THREE.Vector3(0, 0.18, 0));
const CAR_MAX = 90;
const cars = instanced(new THREE.BoxGeometry(0.7, 0.32, 0.36).translate(0, 0.2, 0), new THREE.MeshStandardMaterial({ roughness: 0.5 }), CAR_MAX);
const carState = [];
const CAR_COL = [0xef4444, 0x3b82f6, 0xf8fafc, 0x111827, 0xfacc15, 0x9ca3af];
for (let k = 0; k < CAR_MAX; k++) {
  const lane = k % 5, road = lane < 2 ? 0 : lane < 4 ? 1 : 2, dir = lane % 2 ? 1 : -1;
  carState.push({ x: rnd() * 80 - 40, z: ROADS_Z[road] + (road === 0 ? (dir > 0 ? 0.45 : -0.1) : dir * 0.3), dir, sp: 3 + rnd() * 2 });
  cars.setColorAt(k, tc.setHex(CAR_COL[k % CAR_COL.length]));
}
const ferries = [0, 1].map((k) => {
  const f = new THREE.Group();
  f.add(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.3).translate(0, 0.2, 0), new THREE.MeshStandardMaterial({ color: 0xf8fafc })));
  f.add(new THREE.Mesh(new THREE.BoxGeometry(3, 0.55, 1.1).translate(0, 0.8, 0), new THREE.MeshStandardMaterial({ color: 0xe5e7eb })));
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.9, 10).translate(0, 1.4, 0), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  f.add(chim);
  f.userData = { chim, phase: k * Math.PI };
  sim.scene.add(f);
  return f;
});
sim.scene.add(tram, train, cars);

// --- Etiketler ---
const eraLbl = sim.label('', { position: [0, 13, -14], className: 'big' });
const tagLbls = [
  sim.label('', { position: [-12, 4, 6.2], className: 'plain' }),
  sim.label('', { position: [14, 7, ROADS_Z[2]], className: 'plain' }),
];

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
const showLbl = ui.toggle({ label: 'Etiketler', value: true, onChange: (x) => [eraLbl, stationLbl, ...tagLbls].forEach((l) => (l.visible = x)) });

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
let lastKey = '', cur = null;
function update() {
  const y = Math.round(yearF), pl = plan.value;
  const key = `${y}|${pl}`;
  if (key !== lastKey) {
    lastKey = key;
    buildScene(y, pl);
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
  const veh = showVeh.value;
  tram.visible = veh && y < 1962;
  tramRails.visible = y < 1962;
  railLine.visible = y >= 2008;
  station.visible = stationLbl.visible = y >= 2008;
  stationLbl.visible = y >= 2008 && showLbl.value;
  train.visible = veh && y >= 2012;
  const bike = cur.shares[5];
  bikeLanes.forEach((b, i) => (b.visible = bike > (i ? 4 : 0.8)));
  cars.count = veh ? Math.min(CAR_MAX, Math.round((cur.shares[2] / 100) * cur.pop / 180)) : 0;
  ferries.forEach((f) => { f.visible = veh; f.userData.chim.material.color.setHex(y < 1960 ? 0x111111 : 0xf59e0b); });
  tagLbls[0].setText(y < 1962 ? '🚋 Tramvay' : bike > 0.8 ? '🚲 Bisiklet yolu' : '🚗 Sahil yolu');
  tagLbls[1].setText(y >= 2008 ? '🚆 Raylı sistem' : '');
}

sim.onUpdate((dt) => {
  if (playing) {
    yearF = Math.min(Y1, yearF + dt * 5);
    if (Math.round(yearF) !== year.value) { year.set(Math.round(yearF)); update(); }
    if (yearF >= Y1) { playing = false; sim.toast(`2050 · Plan ${plan.value} tamamlandı`, 'good'); }
  }
  // Araç hareketi
  const t = sim.time;
  tram.position.x = ((t * 2.2) % 80) - 40;
  train.position.x = ((t * 6) % 90) - 50;
  for (let k = 0; k < cars.count; k++) {
    const c = carState[k];
    c.x += c.dir * c.sp * Math.min(dt, 0.25);
    if (c.x > 40) c.x -= 80; else if (c.x < -40) c.x += 80;
    tm.makeRotationY(c.dir > 0 ? 0 : Math.PI).setPosition(c.x, hillY(c.z) + 0.05, c.z);
    cars.setMatrixAt(k, tm);
  }
  cars.instanceMatrix.needsUpdate = true;
  ferries.forEach((f, k) => {
    const a = t * 0.12 + f.userData.phase;
    f.position.set(Math.cos(a) * 22, 0.05, 12.6 + Math.sin(a) * 1.2 + k * 1.6);
    f.rotation.y = Math.sin(a) > 0 ? Math.PI : 0;
  });
});

sim.onClick(() => [houseBody, aptBody, towerBody], (hit) => {
  const p = plots[pickMap.get(hit.object)?.[hit.instanceId]];
  if (!p) return;
  const s = p.state;
  const name = { house: 'Ahşap ev', hist: 'Korunan tarihi ahşap ev', apt: 'Apartman', tower: 'Yüksek bina', green: 'Yeşil çatılı yeni bina' }[s.type];
  const built = s.type === 'house' || s.type === 'hist' ? '1900 öncesi' : s.type === 'tower' && p.tT <= yearF ? p.tT : s.type === 'apt' && !(yearF >= p.tF && yearF > 2025) ? p.tA : p.tF;
  sim.toast(`<b>${name}</b> · ${s.floors} kat · yapım: ${built}`);
});

sim.onReset(() => { playing = true; yearF = Y0; year.set(Y0); plan.set('A'); lastKey = ''; drawCharts(); update(); });
drawCharts();
update();
