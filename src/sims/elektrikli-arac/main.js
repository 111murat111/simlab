// Elektrikli Araç — fizikten menzil (sürtünme, hava direnci, iklimlendirme, geri kazanım), CC-CV şarj eğrisi ve mahalle akşam yükü.
import { createSim, THREE, fmt, clamp, lerp, seeded, RoundedBoxGeometry, BufferGeometryUtils, mat, landscape, createTerrain, terrainSkirt, createVegetation,
  makeCity, makeBlock, streetMaterials, streetTrees, streetLamps, carFleet, textTexture } from '@core';
import { makeEV, trafficLight, pvMat, bayDecal } from './ev.js';
import { CARS, consumption, hvacPower, coldCapacity, airRho, chargePower, chargeTime, neighbourhood, houseLoad, ETA_DRIVE, ETA_REGEN, REGEN_MAX, AUX, ETA_AC, T0, STEP } from './model.js';
import { xyPlot } from './plot.js';

const STRAIGHT = 100, RAD = 25, ROADW = 8;
const PERIM = 2 * STRAIGHT + 2 * Math.PI * RAD;
const LIGHTS = [0.08, 0.42, 0.74]; // trafik ışıklarının yol üzerindeki konumu (0..1)
const HILL_A = 1.13; // m — %4 en büyük eğim (dalga boyu çevrenin yarısı)
const HILL_VIS = 3; // görsel abartma
const START_D = 30; // aracın halkadaki başlangıç noktası (istasyonun önü)
const MIN_PER_S = 1; // şarj: 1 s = 1 dakika
const MAH_H_PER_S = 0.2; // mahalle: 1 s = 12 dakika
// Kent ızgarası (m): kuzeyde ana mahalle, halkanın iki yanında yan adalar
const XS_N = [-300, -225, -160, -95, -30, 30, 95, 160, 225, 300], ZS_N = [-240, -175, -110, -44];
const XS_W = [-300, -225, -160, -95], XS_E = [95, 160, 225, 300], ZS_S = [-44, 20, 84];
const ROAD = 9, WALK = 3;
const CITY = { x0: -312, x1: 312, z0: -252, z1: 96 };
const CAM0 = [-24, 5.5, 37];

const sim = createSim({
  sky: { elevation: 38, azimuth: 205, clouds: 0.35, haze: 1.2, visibility: 3200 },
  camera: { position: CAM0, target: [-15, 1.5, 10], fov: 50, near: 0.3, far: 30000 },
  controls: { maxDistance: 400, minDistance: 6, maxPolarAngle: Math.PI * 0.49 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p><b>A · Sürüş:</b> Araç bir halka yolda döner. Batarya enerjisi dört yere gider: <b>hava direnci</b> ½·ρ·C<sub>d</sub>·A·v²
    (güç v³ ile artar!), <b>yuvarlanma direnci</b> C<sub>rr</sub>·m·g, <b>fren kaybı</b> (şehirde her duruşta ½·m·v² kinetik
    enerji; geri kazanımlı fren bunun bir kısmını bataryaya geri yazar) ve <b>iklimlendirme + elektronik</b>. İklimlendirme
    saatte sabit güç çektiği için yavaş şehir trafiğinde kilometre başına payı çok büyür.</p>
    <p><b>B · Şarj:</b> Şebekeden çekilen güç, şarj cihazının gücü ile bataryanın o anda kabul edebildiği gücün küçüğüdür.
    Batarya dolarken hücre gerilimi sınıra yaklaşır; <b>sabit akım → sabit gerilim (CC-CV)</b> geçişinde akım, dolayısıyla güç
    azalır. Bu yüzden hızlı şarjda %80'den sonrası uzun sürer; 7 kW'lık ev şarjında ise sınır cihazdadır ve eğri düzdür.
    İstasyonun tentesindeki güneş panelleri gün içinde şarj enerjisinin bir kısmını karşılar.</p>
    <p><b>C · Mahalle:</b> Herkes akşam 18:00 civarı eve gelip aracını aynı anda takarsa, zaten en yüksek olan akşam tüketimine
    araç şarjı eklenir. Zamanlayıcıyla 23:00'e ertelemek yeni bir zirve yaratabilir; <b>akıllı şarj</b> ise yükü gece boyunca
    en boş saatlere yayar, sabah 07:00'de araçlar yine dolu olur. Garaj yolundaki araç yeşile dönünce o evde şarj sürüyor demektir.</p>
    <h3>Dene</h3>
    <ul>
      <li>Otoyolda hızı 90'dan 130 km/h'ye çıkar: tüketim ve menzil nasıl değişiyor? Hava direnci kalemine bak.</li>
      <li>"Kışın şehir içi": ısıtmanın payı ne kadar? Isı pompasını aç.</li>
      <li>Şehir içinde geri kazanımlı freni kapat, sonra tepeli yolu seç.</li>
      <li>Şarjda DC 350 kW seç: 60 kWh'lik batarya bunu kullanabiliyor mu? Sıcaklığı 0 °C yap, sonra ön ısıtmayı aç.</li>
      <li>Mahallede EV oranını %100 yap, "Hemen", "23:00" ve "Akıllı" stratejilerinin zirvesini ve trafo sınırını karşılaştır.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p><small>Araç değerleri (kütle, C<sub>d</sub>, ön alan, C<sub>rr</sub>) sınıfını temsil eden yaklaşık değerlerdir, belirli bir
    modele ait değildir. Aktarma verimi %88, geri kazanım verimi %70, en çok 60 kW. Şehir döngüsü: her 400 m'de bir durup
    20 s bekleme. Kabin ısı kaybı ≈ 100 W/K, ısı pompası COP'u soğukta 1,3'e kadar düşer; soğukta kullanılabilir kapasite ve
    şarj kabulü azalır (temsilî katsayılar). Şarj eğrisi temsilî bir C-oranı eğrisidir (en çok ≈ 2C). Mahalle hane yük profili
    temsilîdir; ısıtma/soğutma talebi, şebeke gerilimi ve trafo ısınması modellenmez.</small></p>
    <h3>Güncel bağlam</h3>
    <p><small>IEA <i>Global EV Outlook 2025</i>: 2024'te dünyada 17 milyonun üzerinde elektrikli otomobil satıldı, satış payı
    %20'yi aştı. Çin'de otomobil satışlarının neredeyse yarısı elektrikliydi; Avrupa'da pay ≈ %20'de kaldı; ABD'de satılan her
    10 otomobilden 1'inden fazlası elektrikliydi. Kaynak: iea.org/reports/global-ev-outlook-2025 (IEA, 2025).</small></p>`,
});

// --- Sahne: hafif dalgalı arazi, kent kenarı mahalle, halka yol, park, şarj istasyonu ---
const scene = sim.scene;
const LOW = /[?&]low\b/.test(location.search);
const G = streetMaterials();
const ss = THREE.MathUtils.smoothstep;
/** Halka yol ekseninden yatay uzaklık (m). */
function ringDist(x, z) {
  if (Math.abs(x) <= STRAIGHT / 2) return Math.min(Math.abs(z - RAD), Math.abs(z + RAD));
  return Math.abs(Math.hypot(Math.abs(x) - STRAIGHT / 2, z) - RAD);
}
// Kent ve park düz bir ovada; ova kenarından itibaren hafif dalgalı tarlalar, uzakta ağaçlı tepeler
const hfun = landscape({ seed: 31, size: 1400, height: 85, octaves: 6, warp: 0.35,
  shape: (x, z, h) => {
    const dd = Math.max(0, CITY.x0 - x, x - CITY.x1, CITY.z0 - z, z - CITY.z1);
    return -0.06 + ss(dd, 4, 60) * 1.6 * Math.sin(x * 0.021 + 0.7) * Math.cos(z * 0.017) * (1 - ss(dd, 200, 500)) + ss(dd, 20, 900) * (h + 14);
  } });
const terrain = createTerrain(hfun, { size: [3200, 3200], res: LOW ? [128, 128] : [220, 220],
  materialOptions: { water: -60, grassAmount: 0.75, forest: 0.45, grass: 0x61702f, dry: 0x9d8b56 } });
terrain.userData.noFit = true;
scene.add(terrain, terrainSkirt(hfun, { inner: 1600, outer: 22000 }));
const inCity = (x, z) => x > CITY.x0 - 14 && x < CITY.x1 + 14 && z > CITY.z0 - 14 && z < CITY.z1 + 14;
const veg = createVegetation((x, z) => (inCity(x, z) ? -100 : hfun(x, z)), {
  rect: [-1500, -1500, 1500, 1500], trees: LOW ? 1500 : 3200, shrubs: LOW ? 300 : 700, rocks: 0, seed: 12, water: -60,
  kinds: { broad: 0.3, oak: 0.25, pine: 0.15, poplar: 0.15, cypress: 0.15 },
  forest: (x, z) => 0.5 + 0.3 * Math.sin(x * 0.011 + 1.2) * Math.cos(z * 0.013) + (Math.hypot(x, z) > 700 ? 0.15 : -0.1) });
scene.add(veg.group);

// --- Kent: kuzeyde mahalle (bahçeli müstakil evler → uzakta apartmanlar), halkanın iki yanında yan adalar ---
const HOOD_I = [3, 4, 5], HOOD_J = [1, 2];
const hr = ROAD / 2;
const innerOf = (xs, zs, i, j) => {
  const r = { x0: xs[i] + hr + WALK, x1: xs[i + 1] - hr - WALK, z0: zs[j] + hr + WALK, z1: zs[j + 1] - hr - WALK };
  r.w = r.x1 - r.x0; r.d = r.z1 - r.z0; r.cx = (r.x0 + r.x1) / 2; r.cz = (r.z0 + r.z1) / 2;
  return r;
};
// Bahçeli evler: sokağa bakan iki sıra; her parselde ev + yan garaj yolu (araç + duvar şarj cihazı), ön bahçe çalıları, ağaçlar
const hoodLots = [], suburbLots = new Map(), drives = [], yardTrees = [], yardShrubs = [], paths = [];
{
  const r = seeded(77);
  for (const i of HOOD_I) for (const j of HOOD_J) {
    const inn = innerOf(XS_N, ZS_N, i, j), lots = [];
    const n = Math.floor(inn.w / 12.4), P = inn.w / n;
    for (const side of [1, -1]) {
      const rot = side > 0 ? 0 : Math.PI, edge = side > 0 ? inn.z1 : inn.z0;
      const W = (u, v) => (side > 0 ? [0, edge + v] : [0, edge - v]);
      for (let k = 0; k < n; k++) {
        const u0 = inn.x0 + (k + 0.5) * P;
        const at = (u, v) => [side > 0 ? u0 + u : u0 - u, W(u, v)[1]];
        const w = 7 + r() * 1.1, d = 8.4 + r() * 1.4, set = 5.6 + r() * 1.4, f = r() < 0.5 ? 1 : -1;
        const hu = f * (-P / 2 + 0.6 + w / 2), wallU = f * (-P / 2 + 0.6 + w), du = f * (-P / 2 + 0.6 + w + 1.75);
        const [hx, hz] = at(hu, -(set + d / 2));
        lots.push({ x: hx, z: hz, rot, type: 'house', width: w, depth: d, floors: 2, y0: 0.15, roof: r() < 0.7 ? 'hip' : 'gable', seed: r() * 1000 });
        const dl = set + d * 0.75, [dx, dz] = at(du, -dl / 2);
        drives.push([dx, dz, rot, 2.8, dl]);
        const [px, pz] = at(hu + f * 0.8, -set / 2); paths.push([px, pz, rot, 1.2, set]);
        const [cx, cz] = at(du, -(set + 2.4)), [bx, bz] = at(wallU + f * 0.08, -(set + 1.1));
        hoodLots.push({ car: [cx, cz, rot + Math.PI / 2], box: [bx, 1.55, bz, rot + f * Math.PI / 2], mouth: at(du, 0) });
        // ön bahçe: sokak kenarında çalı dizisi (garaj yolu açık), bahçe ağacı; arka bahçede meyve ağacı
        for (let u = -P / 2 + 0.7; u < P / 2 - 0.5; u += 1.15) if (Math.abs(u - du) > 1.9) yardShrubs.push([...at(u, -0.7 - r() * 0.2), r() * 6, 0, 0.17]);
        yardTrees.push([...at(hu - f * (w / 2 - 1.5), -(set * 0.45)), r() * 6, r() < 0.5 ? 1 : 0, 0.17]);
        yardTrees.push([...at(hu + (r() - 0.5) * 3, -(set + d + 3 + r() * 2)), r() * 6, 1, 0.17]);
      }
    }
    suburbLots.set(i + ',' + j, lots);
  }
}
const nearDrive = (x, z, rr) => hoodLots.some((h) => Math.hypot(h.mouth[0] - x, h.mouth[1] - z) < rr);
const floorsN = (x, z, rnd, type) => type === 'house' ? 2 + (rnd() < 0.3 ? 1 : 0) : Math.round(3 + ss(-z, 60, 260) * 3 + rnd() * 2);
const cityN = makeCity({ xs: XS_N, zs: ZS_N, road: ROAD, walk: WALK, seed: 8, parked: LOW ? 40 : 70, camera: CAM0,
  near: LOW ? 170 : 260, lawnInside: true,
  plan: (i, j) => (i === 1 && j === 1) || (i === 6 && j === 0) ? 'park' : 'city',
  lots: (inner, rnd, i, j) => suburbLots.get(i + ',' + j) || makeBlock(inner, { seed: 30 + i * 7 + j * 13, gap: 2.5, shops: j === 2 ? 0.6 : 0.3,
    mix: j === 0 ? { apartment: 0.85, house: 0.15 } : { apartment: 0.45, house: 0.55 }, floors: floorsN }),
  treeOk: (x, z) => !nearDrive(x, z, 2.2), parkOk: (x, z) => !nearDrive(x, z, 3.5) });
const sideBlock = (seed) => (inner, rnd, i, j) => makeBlock(inner, { seed: seed + i * 5 + j * 11, gap: 2.8, shops: 0.35, mix: { apartment: 0.4, house: 0.6 }, floors: floorsN });
const cityW = makeCity({ xs: XS_W, zs: ZS_S, road: ROAD, walk: WALK, seed: 21, parked: LOW ? 14 : 24, camera: CAM0, near: LOW ? 170 : 260, lots: sideBlock(50) });
const cityE = makeCity({ xs: XS_E, zs: ZS_S, road: ROAD, walk: WALK, seed: 33, parked: LOW ? 14 : 24, camera: CAM0, near: LOW ? 170 : 260, lots: sideBlock(90) });
const cities = [cityN, cityW, cityE];
cities.forEach((c) => scene.add(c.group));
// Ada içlerinde (avlu) ağaçlar; bahçelerde çalı ve ağaçlar
{
  const r = seeded(5), court = [];
  for (const [c, xs, zs] of [[cityN, XS_N, ZS_N], [cityW, XS_W, ZS_S], [cityE, XS_E, ZS_S]]) for (const b of c.blocks) {
    if (b.kind !== 'city' || suburbLots.has(b.i + ',' + b.j) && c === cityN) continue;
    const inn = innerOf(xs, zs, b.i, b.j);
    for (let k = 0; k < 5; k++) court.push([inn.cx + (r() - 0.5) * (inn.w - 34), inn.cz + (r() - 0.5) * (inn.d - 34), r() * 6, 1, 0.17]);
  }
  yardTrees.push(...court);
}
const yardT = streetTrees(yardTrees, 19, { broad: 0.3, fruit: 0.35, cypress: 0.15, oak: 0.2 });
const yardS = streetTrees(yardShrubs, 23, { shrub: 1 });
scene.add(yardT.group, yardS.group);
// Garaj yolları ve bahçe yolları (parke taşı)
{
  const geos = [...drives, ...paths].map(([x, z, rot, w, l]) => new RoundedBoxGeometry(w, 0.06, l, 1, 0.02).rotateY(rot).translate(x, 0.19, z));
  const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), G.paver);
  m.receiveShadow = true; m.userData.noFit = true;
  scene.add(m);
}

// --- Park: halka yolun çevresi (ağaç türleri karışık, çalılar, yakında çim öbekleri) ---
const parkOk = (x, z) => x > -88 && x < 88 && z > -37 && z < 116 && ringDist(x, z) > 8.5
  && !(x > -23 && x < 1 && z > -6 && z < 11) && !(x > 12 && x < 24 && z < -31);
const park = createVegetation((x, z) => (parkOk(x, z) && Math.hypot(x - CAM0[0], z - CAM0[2]) > 16 ? 0 : -100), {
  rect: [-90, -40, 90, 118], trees: 95, shrubs: 120, rocks: 0, seed: 7, water: -60,
  kinds: { oak: 0.28, broad: 0.18, poplar: 0.2, cypress: 0.16, fruit: 0.18 },
  forest: (x, z) => 0.5 + 0.35 * Math.sin(x * 0.05 + 1.0) * Math.cos(z * 0.045) + (z > 34 ? 0.1 : 0) });
const lawnTufts = createVegetation((x, z) => (parkOk(x, z) ? 0 : -100), { rect: [-90, -40, 90, 118], trees: 0, rocks: 0, seed: 9, water: -60,
  grass: LOW ? 2600 : 6000, grassAt: [CAM0[0] + 8, CAM0[2] - 12, 26], grassFar: 45 });
scene.add(park.group, lawnTufts.group);

let hills = false;
/** Yol üzerindeki nokta: d (m) → konum, yön (ekseni). Tepeli yolda görsel yükseklik tabandan başlar (0…2·A·abartma). */
function roadAt(d, out = new THREE.Vector3()) {
  d = ((d % PERIM) + PERIM) % PERIM;
  let x, z, ang;
  const half = STRAIGHT / 2, arc = Math.PI * RAD;
  if (d < STRAIGHT) { x = -half + d; z = RAD; ang = 0; }
  else if (d < STRAIGHT + arc) { const a = (d - STRAIGHT) / RAD; x = half + Math.sin(a) * RAD; z = Math.cos(a) * RAD; ang = a; }
  else if (d < 2 * STRAIGHT + arc) { x = half - (d - STRAIGHT - arc); z = -RAD; ang = Math.PI; }
  else { const a = (d - 2 * STRAIGHT - arc) / RAD; x = -half - Math.sin(a) * RAD; z = -Math.cos(a) * RAD; ang = Math.PI + a; }
  const y = hills ? HILL_A * HILL_VIS * (1 + Math.sin((4 * Math.PI * d) / PERIM)) : 0;
  out.set(x, y, z);
  out.ang = ang;
  return out;
}
const LANE = 2; // araç sağ şeritte (merkez çizgisinden 2 m sağda)
// Şerit: yol ekseni boyunca [yanal ofset, dikey ofset] sütunlarından ızgara
function ribbon(cols, d0 = 0, d1 = PERIM, step = 1) {
  const n = Math.max(1, Math.round((d1 - d0) / step)), pos = [], idx = [], p = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    roadAt(d0 + ((d1 - d0) * i) / n, p);
    const rx = Math.sin(p.ang), rz = Math.cos(p.ang);
    for (const c of cols) { const [o, y] = typeof c === 'function' ? c(p.y) : c; pos.push(p.x + rx * o, y, p.z + rz * o); }
    if (i < n) for (let k = 0; k < cols.length - 1; k++) {
      const a = i * cols.length + k, b = a + cols.length;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
let road = null;
function buildRoad() {
  if (road) { road.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); road.removeFromParent(); }
  road = new THREE.Group();
  const H = ROADW / 2, mesh = (geo, m) => { const o = new THREE.Mesh(geo, m); o.receiveShadow = true; o.userData.noFit = true; road.add(o); return o; };
  mesh(ribbon([[-H - 0.05, 0], [H + 0.05, 0]].map(([o]) => (y) => [o, y + 0.05])), G.asphalt);
  // Beton bordür (yol kenarı) + çim şevler (dolgu yüksekliğine göre genişler)
  for (const s of [-1, 1]) {
    mesh(ribbon([(y) => [s * (H + 0.05), y + 0.05], (y) => [s * (H + 0.05), y + 0.16], (y) => [s * (H + 0.3), y + 0.16], (y) => [s * (H + 0.3), y + 0.03]].map((f, k, a) => (s > 0 ? f : a[a.length - 1 - k]))), G.curb);
    const cols = [(y) => [s * (H + 0.28), y + 0.04], (y) => [s * (H + 1.0), y + 0.02], (y) => [s * (H + 1.0 + Math.max(0.8, 1.6 * y)), -0.07]];
    mesh(ribbon(s > 0 ? cols : cols.reverse()), G.lawn);
  }
  // Kenar çizgileri (sürekli) ve orta kesikli çizgi
  for (const s of [-1, 1]) mesh(ribbon([(y) => [s * (H - 0.35) - 0.075, y + 0.062], (y) => [s * (H - 0.35) + 0.075, y + 0.062]]), G.paint);
  const dash = [];
  for (let d = 0; d < PERIM - 3; d += 9) dash.push(ribbon([(y) => [-0.07, y + 0.062], (y) => [0.07, y + 0.062]], d, d + 3, 1));
  // Dur çizgileri (sağ şerit, ışıktan 2 m önce)
  for (const u of LIGHTS) dash.push(ribbon([(y) => [0.2, y + 0.063], (y) => [H - 0.45, y + 0.063]], u * PERIM - 2.4, u * PERIM - 2.0, 0.4));
  mesh(BufferGeometryUtils.mergeGeometries(dash), G.paint);
  dash.forEach((g) => g.dispose());
  scene.add(road);
  // Trafik lambaları sağ banket üzerinde, gelen araca dönük
  lightPoles.forEach((lp, i) => {
    const q = roadAt(LIGHTS[i] * PERIM);
    lp.position.set(q.x + Math.sin(q.ang) * (H + 0.7), q.y + 0.02, q.z + Math.cos(q.ang) * (H + 0.7));
    lp.rotation.y = q.ang - Math.PI / 2;
  });
}
// Trafik ışıkları (gerçek ölçek, siperlikli üç lamba)
const lightPoles = LIGHTS.map(() => { const g = trafficLight(); scene.add(g); return g; });
// Halka yol lambaları (dış kenarda, kol yola dönük)
const ringLamps = (() => {
  const pts = [], p = new THREE.Vector3();
  for (let d = 14; d < PERIM; d += 34) {
    if (LIGHTS.some((u) => Math.abs(u * PERIM - d) < 8)) continue;
    roadAt(d, p);
    const rx = Math.sin(p.ang), rz = Math.cos(p.ang), o = ROADW / 2 + 1.3;
    pts.push([p.x + rx * o, p.z + rz * o, Math.atan2(-rx, -rz)]);
  }
  const l = streetLamps(pts, { y: 0.02 });
  scene.add(l.group);
  return l;
})();

// --- Araç modeli (sınıfa göre gövde: küçük = hatchback, kompakt = fastback, SUV) ---
const CAR_TYPE = { kucuk: 'hatch', kompakt: 'sedan', suv: 'suv' };
const car = new THREE.Group();
function setCarType(k) {
  const old = car.userData.inner;
  if (old) { car.remove(old); old.traverse((o) => { if (o.isMesh && o.material === car.userData.body?.material) o.material.dispose(); }); }
  const inner = makeEV(CAR_TYPE[k] || 'sedan', CARS[k].color);
  car.add(inner);
  car.userData = { ...inner.userData, inner };
  if (st.part === 'B') layCable();
}
scene.add(car);
const carLabel = sim.label('', { parent: car, position: [0, 3.2, 0] });

// --- Şarj istasyonu (halkanın içinde): güneş panelli tente, iki DC şarj kabini, güç kabini, pilon, işaretli park yerleri ---
const station = new THREE.Group();
station.position.set(-12, 0, 2);
scene.add(station);
const sAdd = (geo, m, x, y, z, par = station) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; par.add(o); return o; };
const RB = (w, h, d, r = 0.04, s = 2) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const white = mat.paintedMetal({ color: 0xeef0f2, wear: 0.08 }), steel = mat.paintedMetal({ color: 0xc9ced3, wear: 0.15 });
const teal = mat.paintedMetal({ color: 0x0f766e, wear: 0.05 }), dark = mat.plastic({ color: 0x1c1f23, gloss: 0.3 });
const concrete = mat.concrete({ color: 0xb4afa6, stains: 0.35 });
const brushed = mat.brushedMetal({ color: 0xb8bdc2, rough: 0.3 });
/** Tuval dokusu işlenmiş (hafif ışıyan) levha malzemesi. */
function signMat(tex, glow = 0.9) { return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.35 }); }
{
  // Parke taşı döşeme + granit bordür
  sAdd(RB(18, 0.14, 12.5, 0.05), G.paver, 1.5, 0.0, 0.3);
  for (const [w, d, x, z] of [[18.3, 0.26, 1.5, -5.97], [18.3, 0.26, 1.5, 6.57], [0.26, 12.5, -7.52, 0.3], [0.26, 12.5, 10.52, 0.3]]) sAdd(RB(w, 0.2, d, 0.03), G.curb, x, 0.05, z);
  // Kolonlar: beton temel + çelik kolon + taban levhası
  for (const [x, z] of [[-5.8, -4.3], [8.8, -4.3], [-5.8, 4.3], [8.8, 4.3]]) {
    sAdd(RB(0.8, 0.28, 0.8, 0.05), concrete, x, 0.2, z);
    sAdd(RB(0.5, 0.03, 0.5, 0.01), brushed, x, 0.35, z);
    sAdd(RB(0.32, 4.95, 0.32, 0.06, 3), steel, x, 2.85, z);
  }
  // Tente: kutu kiriş gövde, açık gri alt tavan, turkuaz alın bandı + ışıklı yazı, LED şerit, gömme armatürler
  sAdd(RB(16.2, 0.55, 10.2, 0.12, 3), white, 1.5, 5.55, 0);
  sAdd(RB(15.8, 0.06, 9.8, 0.02), mat.paintedMetal({ color: 0xd9dde0, wear: 0.02 }), 1.5, 5.25, 0);
  for (const z of [-5.12, 5.12]) sAdd(RB(16.25, 0.22, 0.05, 0.02), teal, 1.5, 5.62, z);
  const led = mat.glow({ color: 0x5eead4, intensity: 1.2 });
  for (const z of [-5.13, 5.13]) sAdd(RB(15.4, 0.05, 0.03, 0.01, 1), led, 1.5, 5.42, z);
  const logo = signMat(textTexture('⚡ ŞARJ NOKTASI', { size: 72, color: '#f0fdfa', bg: '#0f766e', pad: 18 }), 0.55);
  for (const z of [-5.16, 5.16]) { const s = sAdd(new THREE.PlaneGeometry(4.6, 0.42), logo, 1.5, 5.66, z); if (z < 0) s.rotation.y = Math.PI; s.castShadow = false; }
  const panel = mat.glow({ color: 0xfff4e6, intensity: 1.4 });
  for (const x of [-3.2, 1.5, 6.2]) for (const z of [-2.2, 2.2]) sAdd(RB(2.6, 0.04, 0.5, 0.01, 1), panel, x, 5.21, z);
  // Tente üstü güneş paneli dizisi: alüminyum raylar üstünde güneye (+z) 8° eğik modüller
  const pv = pvMat(), pg = new THREE.BoxGeometry(1.0, 0.04, 1.7), tilt = (8 * Math.PI) / 180;
  for (const z of [-3.8, -1.9, 0, 1.9, 3.8]) {
    for (const dz of [-0.55, 0.55]) sAdd(RB(15.2, 0.06, 0.07, 0.02), brushed, 1.5, 5.86 + dz * Math.sin(tilt), z + dz);
    for (let k = 0; k < 14; k++) {
      const p = sAdd(pg, pv, 1.5 - 6.83 + k * 1.05, 5.95, z);
      p.rotation.x = tilt;
    }
  }
  // Şarj park yerleri: yeşil boyalı zemin, piktogram + numara, ayırıcı çizgiler, tekerlek takozları
  const green = mat.concrete({ color: 0x2f7a4b, stains: 0.15 });
  [1.4, 6.6].forEach((x, i) => {
    sAdd(new THREE.BoxGeometry(4.6, 0.012, 5.4), green, x, 0.076, 0.9).castShadow = false;
    const dec = sAdd(new THREE.PlaneGeometry(1.7, 3.4), new THREE.MeshStandardMaterial({ map: bayDecal(i + 1), transparent: true, roughness: 0.6, depthWrite: false }), x, 0.084, 1.9);
    dec.rotation.x = -Math.PI / 2; dec.castShadow = false;
    sAdd(RB(1.7, 0.13, 0.22, 0.05), concrete, x, 0.13, -1.5);
  });
  for (const x of [-1.2, 4.0, 9.2]) sAdd(new THREE.BoxGeometry(0.14, 0.013, 5.4), G.paint, x, 0.077, 0.9).castShadow = false;
  // Çarpma koruma direkleri (sarı-siyah) şarj kabinlerinin önünde
  const bol = new THREE.LatheGeometry([[0.001, 0], [0.09, 0], [0.09, 0.9], [0.075, 0.97], [0.001, 0.99]].map(([a, b]) => new THREE.Vector2(a, b)), 16);
  const yel = mat.paintedMetal({ color: 0xf2c200, wear: 0.25 }), band = mat.paintedMetal({ color: 0x151515, wear: 0.2 });
  for (const x of [-1.05, 0.45, 4.15, 5.65]) {
    sAdd(bol, yel, x, 0.07, -2.05);
    for (const y of [0.55, 0.75]) sAdd(new THREE.CylinderGeometry(0.093, 0.093, 0.08, 16), band, x, 0.07 + y, -2.05);
  }
  // Güç kabini (trafo/evirici panosu): panjurlar, kapılar, uyarı levhası; önünde küçük çakıl alan
  const cab = new THREE.Group(); cab.position.set(-4.4, 0.07, -4.85); station.add(cab);
  const grey = mat.paintedMetal({ color: 0xb9bec2, wear: 0.12 });
  sAdd(RB(3.0, 0.2, 1.1, 0.03), concrete, 0, 0.1, 0, cab);
  sAdd(RB(2.8, 2.05, 0.9, 0.05, 3), grey, 0, 1.22, 0, cab);
  sAdd(RB(2.95, 0.09, 1.02, 0.03), grey, 0, 2.28, 0, cab);
  for (const x of [-0.7, 0.7]) {
    sAdd(RB(1.3, 1.8, 0.03, 0.02), grey, x, 1.2, 0.46, cab);
    for (let k = 0; k < 7; k++) sAdd(RB(1.0, 0.035, 0.05, 0.012, 1), mat.paintedMetal({ color: 0x8e959b, wear: 0.1 }), x, 0.45 + k * 0.08, 0.48, cab);
    sAdd(RB(0.04, 0.16, 0.04, 0.012, 1), brushed, x + (x < 0 ? 0.55 : -0.55), 1.25, 0.49, cab);
  }
  const warn = signMat(textTexture('⚡ YÜKSEK\nGERİLİM', { size: 42, color: '#111', bg: '#f5c518', pad: 10 }), 0.08);
  sAdd(new THREE.PlaneGeometry(0.42, 0.34), warn, 0, 1.75, 0.49, cab).castShadow = false;
  // Pilon (yol kenarında): turkuaz totem, ışıklı simge, güç bilgisi
  const py = new THREE.Group(); py.position.set(-7.0, 0.07, 5.6); station.add(py);
  sAdd(RB(1.3, 0.25, 0.6, 0.04), concrete, 0, 0.12, 0, py);
  sAdd(RB(1.1, 4.3, 0.38, 0.08, 3), teal, 0, 2.4, 0, py);
  const pyTex = signMat(textTexture('⚡\nŞARJ\nDC 150–350 kW\nAC 22 kW', { size: 54, color: '#ecfeff', bg: '#115e59', pad: 16 }), 0.7);
  for (const s of [-1, 1]) { const f = sAdd(new THREE.PlaneGeometry(0.9, 2.1), pyTex, 0, 3.0, s * 0.2, py); if (s < 0) f.rotation.y = Math.PI; f.castShadow = false; }
}
// Şarj kabini: beton kaide, gövde, turkuaz yan panel, canlı ekran (tuval), kart okuyucu, acil stop, iki soket tutucusu, durum şeritleri
const postMat = mat.glow({ color: 0x0ea5e9, intensity: 2.2 });
const cableMat = mat.rubber({ color: 0x16181b });
cableMat.emissive = new THREE.Color(0x22c55e); cableMat.emissiveIntensity = 0;
function screenCanvas() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 184;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (soc, kw, on) => {
    const x = c.getContext('2d');
    x.fillStyle = '#06131f'; x.fillRect(0, 0, 256, 184);
    x.fillStyle = '#0ea5e9'; x.fillRect(0, 0, 256, 26);
    x.fillStyle = '#e0f2fe'; x.font = '700 18px system-ui, sans-serif'; x.textBaseline = 'middle'; x.fillText(on ? '⚡ ŞARJ OLUYOR' : 'HAZIR · KABLOYU TAKIN', 10, 14);
    x.font = '800 64px system-ui, sans-serif'; x.fillStyle = '#f0fdfa'; x.fillText(`%${Math.round(soc * 100)}`, 12, 72);
    x.font = '700 26px system-ui, sans-serif'; x.fillStyle = '#5eead4'; x.fillText(`${fmt(kw, kw < 20 ? 1 : 0)} kW`, 12, 124);
    x.fillStyle = '#1e293b'; x.fillRect(12, 150, 232, 18);
    x.fillStyle = on ? '#22c55e' : '#38bdf8'; x.fillRect(12, 150, 232 * clamp(soc, 0, 1), 18);
    tex.needsUpdate = true;
  };
  return { tex, draw };
}
const scr1 = screenCanvas(), scr2 = screenCanvas();
scr1.draw(0.1, 0, false); scr2.draw(0.78, 46, true);
function charger(x, z, statusMat, scr) {
  const g = new THREE.Group(); g.position.set(x, 0.07, z); station.add(g);
  sAdd(RB(1.1, 0.22, 0.8, 0.05), concrete, 0, 0.11, 0, g);
  sAdd(RB(0.78, 1.95, 0.52, 0.12, 3), white, 0, 1.2, 0, g);
  sAdd(RB(0.06, 1.8, 0.54, 0.03), teal, -0.37, 1.2, 0, g);
  sAdd(RB(0.06, 1.8, 0.54, 0.03), teal, 0.37, 1.2, 0, g);
  sAdd(RB(0.84, 0.12, 0.58, 0.05), steel, 0, 2.22, 0, g);
  sAdd(RB(0.8, 0.03, 0.56, 0.01, 1), statusMat, 0, 2.15, 0, g);
  sAdd(RB(0.58, 0.44, 0.03, 0.02), dark, 0, 1.62, 0.255, g);
  const s = sAdd(new THREE.PlaneGeometry(0.5, 0.36), signMat(scr.tex, 1.1), 0, 1.62, 0.272, g); s.castShadow = false;
  sAdd(RB(0.22, 0.14, 0.03, 0.02), dark, -0.12, 1.28, 0.265, g);
  const stop = sAdd(new THREE.CylinderGeometry(0.045, 0.05, 0.04, 20).rotateX(Math.PI / 2), mat.plastic({ color: 0xd11f1f, gloss: 0.6 }), 0.17, 1.28, 0.28, g);
  stop.castShadow = false;
  sAdd(RB(0.6, 0.55, 0.02, 0.03), dark, 0, 0.8, 0.262, g);
  for (const s2 of [-1, 1]) sAdd(RB(0.035, 1.5, 0.035, 0.015, 1), statusMat, s2 * 0.41, 1.25, 0.23, g);
  for (const s2 of [-1, 1]) sAdd(RB(0.12, 0.2, 0.14, 0.04), mat.plastic({ color: 0x25282c, gloss: 0.2 }), s2 * 0.46, 1.35, 0.05, g); // soket yuvaları
  // sağ tutucudaki ikinci kablo (sarılı, boşta)
  const c2 = [new THREE.Vector3(0.46, 1.35, 0.1), new THREE.Vector3(0.62, 0.8, 0.18), new THREE.Vector3(0.55, 0.3, 0.25), new THREE.Vector3(0.3, 0.2, 0.32), new THREE.Vector3(0.5, 0.45, 0.2), new THREE.Vector3(0.48, 1.1, 0.12)];
  sAdd(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(c2), 40, 0.028, 8), cableMat, 0, 0, 0, g);
  return g;
}
charger(-0.3, -2.9, postMat, scr1);
charger(4.9, -2.9, mat.glow({ color: 0x22c55e, intensity: 2.2 }), scr2);
const PLUG = new THREE.Vector3(-0.3 - 0.46, 0.07 + 1.35, -2.9 + 0.12); // soketin istasyon içi konumu (sol tutucu)
const tube = (pts, r = 0.035) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, r, 8);
// Tutucuda asılı kablo (A/C) ve araca takılı kablo (B)
const holster = sAdd(tube([PLUG, new THREE.Vector3(PLUG.x - 0.18, 0.7, PLUG.z + 0.05), new THREE.Vector3(PLUG.x - 0.05, 0.35, PLUG.z + 0.1), new THREE.Vector3(PLUG.x - 0.02, 1.1, PLUG.z + 0.02)]), cableMat, 0, 0, 0);
const cable = sAdd(new THREE.BufferGeometry(), cableMat, 0, 0, 0);
const plugHead = sAdd(RB(0.12, 0.1, 0.22, 0.04), mat.plastic({ color: 0x25282c, gloss: 0.25 }), 0, 0, 0);
function layCable() {
  car.updateMatrixWorld(true); station.updateMatrixWorld(true);
  const port = station.worldToLocal(car.localToWorld(car.userData.port.clone()));
  const mid = PLUG.clone().lerp(port, 0.5);
  cable.geometry.dispose();
  cable.geometry = tube([PLUG, new THREE.Vector3(PLUG.x + 0.05, 0.5, PLUG.z + 0.25), new THREE.Vector3(mid.x, 0.18, mid.z), new THREE.Vector3(port.x - 0.35, 0.3, port.z), port]);
  plugHead.position.copy(port);
}
function showCable(b) { cable.visible = plugHead.visible = b; holster.visible = !b; }
// Yan park yerinde şarj olan ikinci araç
const other = makeEV('suv', 0xd9dcdc);
other.position.set(6.6, 0.07, 0.6); other.rotation.y = Math.PI / 2;
station.add(other);
{
  other.updateMatrixWorld(true);
  const p2 = station.worldToLocal(other.localToWorld(other.userData.port.clone())), pl2 = new THREE.Vector3(4.9 - 0.46, 1.42, -2.78);
  sAdd(tube([pl2, new THREE.Vector3(pl2.x + 0.05, 0.5, pl2.z + 0.25), new THREE.Vector3((pl2.x + p2.x) / 2, 0.18, (pl2.z + p2.z) / 2), new THREE.Vector3(p2.x - 0.35, 0.3, p2.z), p2]), cableMat, 0, 0, 0);
}
const PARK = new THREE.Vector3(-12 + 0, 0.07, 2 + 0); // araç park noktası (istasyon merkezi)

// --- Mahalle (C): kent motorundaki bahçeli evlerin ilk NVIS'i; garaj yolunda araç + duvar tipi şarj cihazı ---
const HC = [0, -95];
hoodLots.sort((a, b) => Math.hypot(a.car[0] - HC[0], a.car[1] - HC[1]) - Math.hypot(b.car[0] - HC[0], b.car[1] - HC[1]));
const NVIS = Math.min(40, hoodLots.length);
const hpos = hoodLots.slice(0, NVIS);
const hood = new THREE.Group();
scene.add(hood);
const hoodCars = carFleet(NVIS, { seed: 8, types: ['hatch', 'sedan', 'suv'] });
hood.add(hoodCars.group);
const wallbox = new THREE.InstancedMesh(RB(0.34, 0.46, 0.14, 0.04), mat.plastic({ color: 0xe9eaeb, gloss: 0.35 }), NVIS);
const wbLed = new THREE.InstancedMesh(RB(0.03, 0.18, 0.04, 0.01, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) }), NVIS);
wallbox.castShadow = true;
hood.add(wallbox, wbLed);
{
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), off = new THREE.Vector3();
  hpos.forEach((h, i) => {
    const [x, y, z, a] = h.box;
    q.setFromAxisAngle(up, a);
    wallbox.setMatrixAt(i, m4.compose(v.set(x, y, z), q, one));
    off.set(0, 0.03, 0.075).applyQuaternion(q);
    wbLed.setMatrixAt(i, m4.compose(v.set(x + off.x, y + off.y, z + off.z), q, one));
  });
  // Trafo köşkü: beton gövde, havalandırma panjurları, metal kapılar, uyarı levhası (halka ile mahalle arasında)
  const tg = new THREE.Group();
  tg.position.set(18, 0, -35.2);
  hood.add(tg);
  sAdd(RB(6, 0.14, 5, 0.04), G.paver, 0, 0.0, 0, tg);
  sAdd(RB(4, 2.6, 3, 0.08, 3), mat.concrete({ color: 0xc9c3b6, stains: 0.5 }), 0, 1.37, 0, tg);
  sAdd(RB(4.3, 0.18, 3.3, 0.05), concrete, 0, 2.75, 0, tg);
  const door = mat.paintedMetal({ color: 0x5f6b62, wear: 0.3 });
  for (const x of [-0.95, 0.95]) {
    sAdd(RB(1.5, 2.0, 0.05, 0.02), door, x, 1.16, 1.52, tg);
    for (let k = 0; k < 6; k++) sAdd(RB(1.2, 0.04, 0.06, 0.015, 1), steel, x, 0.45 + k * 0.1, 1.56, tg);
  }
  const tw = signMat(textTexture('⚡ TRAFO', { size: 40, color: '#111', bg: '#f5c518', pad: 8 }), 0.08);
  sAdd(new THREE.PlaneGeometry(0.5, 0.2), tw, 0, 2.3, 1.56, tg).castShadow = false;
  hood.userData.trafo = tg;
}
const trafoLabel = sim.label('', { parent: hood.userData.trafo, position: [0, 4.2, 0] });
const hoodLabel = sim.label('', { position: [HC[0], 16, HC[1] + 10], className: 'plain' });

// Gökyüzü: A/B öğleden sonra; C'de mahalle saatine göre güneş (41° K, ekinoks yaklaşık — yalnız görsel)
const SKY_DAY = { elevation: 38, azimuth: 205 };
let skyEl = SKY_DAY.elevation, skyAz = SKY_DAY.azimuth;
function skyAt(h) {
  const H = ((h - 12) * 15 * Math.PI) / 180, lat = (41 * Math.PI) / 180;
  const el = Math.asin(Math.cos(lat) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat)) + Math.PI;
  return { elevation: (el * 180) / Math.PI, azimuth: (az * 180) / Math.PI };
}
function setSky(s) {
  if (Math.abs(s.elevation - skyEl) < 0.05 && Math.abs(s.azimuth - skyAz) < 0.05) return;
  skyEl = s.elevation; skyAz = s.azimuth;
  sim.sky.set(s);
  const lit = THREE.MathUtils.smoothstep(-skyEl, -6, 4);
  cities.forEach((c) => c.lamps.setLit(lit)); ringLamps.setLit(lit); hoodCars.lights(lit);
}
sim.onRender(() => {
  const t = sim.time;
  veg.update(t, 0.6); park.update(t, 0.6); lawnTufts.update(t, 0.6); yardT.update(t, 0.6); yardS.update(t, 0.5);
  cities.forEach((c) => c.update(t, 0.6));
});

// --- Durum ---
const st = {
  part: 'A', carKey: 'kompakt', bat: 60, city: false, v: 110, hills: false, regen: true, T: 20, hvacOn: true, heatPump: false,
  ac: 7.4, dc: 150, precond: false,
  nHouses: 100, share: 30, homeKw: 7.4, dailyKm: 40, strategy: 'hemen', trafo: 150,
};
let cons = null, rangeKm = 0;
let drive = { d: START_D, v: 0, wait: 0, stopIdx: -1, energy: 0, dist: 0 };
let chg = { soc: 0.1, t: 0 };
let mah = { t: 0, res: null, evs: [] };

// --- Hesap ---
function computeDrive() {
  const c = CARS[st.carKey];
  cons = consumption({ car: c, v: st.v, city: st.city, T: st.T, hvacOn: st.hvacOn, heatPump: st.heatPump, regen: st.regen, hills: st.hills });
  rangeKm = (st.bat * coldCapacity(st.T)) / cons.per100 * 100;
}
function mixedPer100() {
  // Mahalle için günlük karma kullanım: yarı şehir, yarı 90 km/h
  const c = CARS[st.carKey], base = { car: c, T: st.T, hvacOn: st.hvacOn, heatPump: st.heatPump, regen: st.regen, hills: false };
  return 0.5 * consumption({ ...base, v: 50, city: true }).per100 + 0.5 * consumption({ ...base, v: 90, city: false }).per100;
}
function computeHood() {
  const nEV = Math.round((st.nHouses * st.share) / 100);
  const rnd = seeded(42);
  const per100 = mixedPer100();
  const evs = [];
  for (let i = 0; i < nEV; i++) {
    const u = 1 - rnd(), v = rnd();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const arrive = clamp(18.3 + g * 1.0, 15, 23.5);
    const km = st.dailyKm * (0.5 + rnd());
    evs.push({ arrive, jitter: rnd() * 0.25, kwh: (km * per100) / 100 / ETA_AC });
  }
  mah.evs = evs;
  mah.res = neighbourhood(st.nHouses, evs, st.homeKw, st.strategy);
  mah.per100 = per100;
}

// --- UI ---
const ui = sim.ui;
ui.section('Bölüm');
const segPart = ui.segmented({ options: [{ value: 'A', label: 'A · Sürüş' }, { value: 'B', label: 'B · Şarj' }, { value: 'C', label: 'C · Mahalle' }], value: 'A', onChange: (p) => setPart(p) });
ui.section('Senaryolar');
const SCEN = {
  ilik: { city: true, v: 50, T: 18, hvacOn: true, heatPump: false, hills: false, regen: true },
  kis: { city: false, v: 120, T: -5, hvacOn: true, heatPump: false, hills: false, regen: true },
  kissehir: { city: true, v: 50, T: -5, hvacOn: true, heatPump: false, hills: false, regen: true },
  yaz: { city: false, v: 110, T: 38, hvacOn: true, heatPump: false, hills: false, regen: true },
  eko: { city: false, v: 90, T: 20, hvacOn: true, heatPump: false, hills: false, regen: true },
};
ui.buttons([{ label: '🌤️ Ilık şehir içi', onClick: () => scenario('ilik') }, { label: '❄️ Kışın otoyol', onClick: () => scenario('kis') }]);
ui.buttons([{ label: '🏙️ Kışın şehir içi', onClick: () => scenario('kissehir') }, { label: '☀️ Yaz + klima', onClick: () => scenario('yaz') }]);
ui.buttons([{ label: '🍃 Ekonomik 90 km/h', onClick: () => scenario('eko') }]);

ui.section('A · Araç ve yol');
const segCar = ui.segmented({ label: 'Araç sınıfı', options: Object.entries(CARS).map(([k, c]) => ({ value: k, label: c.name })), value: st.carKey,
  onChange: (k) => { st.carKey = k; st.bat = CARS[k].bat; sBat.set(st.bat); setCarType(k); updateAll(); } });
const sBat = ui.slider({ label: 'Batarya kapasitesi (kullanılabilir)', min: 30, max: 120, step: 1, value: st.bat, unit: 'kWh', onInput: (v) => { st.bat = v; updateAll(); } });
const segCity = ui.segmented({ label: 'Sürüş', options: [{ value: 'city', label: 'Şehir (dur-kalk)' }, { value: 'hwy', label: 'Otoyol (sabit hız)' }], value: 'hwy',
  onChange: (m) => { st.city = m === 'city'; if (st.city && st.v > 70) sV.set(50, true); else updateAll(); } });
const sV = ui.slider({ label: 'Seyir hızı', min: 30, max: 150, step: 5, value: st.v, unit: 'km/h', onInput: (v) => { st.v = v; updateAll(); } });
const segHill = ui.segmented({ label: 'Yol', options: [{ value: 'duz', label: 'Düz' }, { value: 'tepe', label: 'Tepeli (±%4 eğim)' }], value: 'duz',
  onChange: (m) => { st.hills = m === 'tepe'; hills = st.hills; buildRoad(); updateAll(); } });
const tRegen = ui.toggle({ label: 'Rejeneratif (geri kazanımlı) fren', value: st.regen, onChange: (v) => { st.regen = v; updateAll(); } });

ui.section('A · Hava ve iklimlendirme');
const sT = ui.slider({ label: 'Dış sıcaklık', min: -20, max: 40, step: 1, value: st.T, unit: '°C', onInput: (v) => { st.T = v; updateAll(); } });
const tHvac = ui.toggle({ label: 'Isıtma / klima açık (kabin 21 °C)', value: st.hvacOn, onChange: (v) => { st.hvacOn = v; updateAll(); } });
const tHP = ui.toggle({ label: 'Isı pompası (dirençli ısıtıcı yerine)', value: st.heatPump, onChange: (v) => { st.heatPump = v; updateAll(); } });

ui.section('A · Tüketim ve menzil');
const stCons = ui.stat({ label: 'Tüketim (kWh/100 km)' });
const stRange = ui.stat({ label: 'Menzil', unit: 'km' });
const stAvg = ui.stat({ label: 'Ortalama hız', unit: 'km/h' });
const stHvac = ui.stat({ label: 'İklimlendirme gücü', unit: 'kW' });
const PARTS = [
  ['aero', 'Hava direnci', '#38bdf8'], ['roll', 'Yuvarlanma direnci', '#a78bfa'], ['brake', 'Fren kaybı (ısı)', '#f97316'],
  ['motorLoss', 'Motor + evirici kaybı', '#facc15'], ['hvac', 'Isıtma / klima', '#f87171'], ['aux', 'Elektronik', '#94a3b8'],
];
const partMeters = PARTS.map(([, name, color]) => ui.meter({ label: name, color }));
const regenText = ui.text('', '');
const rangePlot = xyPlot(ui, { title: 'Otoyol menzili – hız (bu sıcaklıkta)', height: 130, xFmt: (v) => fmt(v, 0), yFmt: (v) => fmt(v, 0),
  legend: [{ name: 'menzil (km)', color: '#22c55e' }, { name: 'şu an', color: '#facc15' }] });

ui.section('B · Şarj');
const segAC = ui.segmented({ label: 'Ev / AC şarj', options: [3.7, 7.4, 11].map((k) => ({ value: k, label: `${fmt(k, 1)} kW` })), value: st.ac,
  onChange: (k) => { st.ac = k; st.homeKw = k; updateAll(); } });
const segDC = ui.segmented({ label: 'Hızlı / DC şarj', options: [50, 150, 350].map((k) => ({ value: k, label: `${k} kW` })), value: st.dc,
  onChange: (k) => { st.dc = k; updateAll(); } });
const segChg = ui.segmented({ label: 'Animasyondaki şarj', options: [{ value: 'dc', label: 'DC' }, { value: 'ac', label: 'AC' }], value: 'dc', onChange: () => { chg.soc = 0.1; chg.t = 0; updateAll(); } });
const tPre = ui.toggle({ label: 'Batarya ön ısıtma (soğukta)', value: st.precond, onChange: (v) => { st.precond = v; updateAll(); } });
ui.button({ label: '🔌 Şarjı %10\'dan başlat', variant: 'primary', onClick: () => { chg.soc = 0.1; chg.t = 0; setPart('B'); } });
const stAC = ui.stat({ label: 'AC %10→80', unit: 'saat' });
const stDC = ui.stat({ label: 'DC %10→80', unit: 'dk' });
const stPeak = ui.stat({ label: 'DC en yüksek güç', unit: 'kW' });
const stKm10 = ui.stat({ label: 'DC ile 10 dk\'da', unit: 'km menzil' });
const chgPlot = xyPlot(ui, { title: 'Şarj gücü – doluluk (SoC)', height: 130, xFmt: (v) => `%${fmt(v, 0)}`, yFmt: (v) => fmt(v, 0),
  legend: [{ name: 'DC (kW)', color: '#38bdf8' }, { name: 'AC (kW)', color: '#22c55e' }, { name: 'şu an', color: '#facc15' }] });

ui.section('C · Mahalle akşam yükü');
const sHouses = ui.slider({ label: 'Hane sayısı', min: 10, max: 200, step: 5, value: st.nHouses, onInput: (v) => { st.nHouses = v; updateAll(); } });
const sShare = ui.slider({ label: 'Elektrikli araç sahibi haneler', min: 0, max: 100, step: 5, value: st.share, unit: '%', onInput: (v) => { st.share = v; updateAll(); } });
const sKm = ui.slider({ label: 'Araç başına günlük yol (ort.)', min: 10, max: 150, step: 5, value: st.dailyKm, unit: 'km', onInput: (v) => { st.dailyKm = v; updateAll(); } });
const segStrat = ui.segmented({ label: 'Şarj stratejisi', options: [{ value: 'hemen', label: 'Hemen (18:00)' }, { value: 'zaman', label: '23:00 zamanlayıcı' }, { value: 'akilli', label: 'Akıllı' }], value: st.strategy,
  onChange: (s) => { st.strategy = s; updateAll(); } });
const sTrafo = ui.slider({ label: 'Trafo kapasitesi (temsilî)', min: 50, max: 800, step: 10, value: st.trafo, unit: 'kW', onInput: (v) => { st.trafo = v; updateAll(); } });
const stBase = ui.stat({ label: 'Zirve (araçsız)', unit: 'kW' });
const stTot = ui.stat({ label: 'Zirve (araçlı)', unit: 'kW' });
const stWhen = ui.stat({ label: 'Zirve saati' });
const stEVe = ui.stat({ label: 'Gecelik şarj enerjisi', unit: 'kWh' });
const hoodText = ui.text('', '');
const hoodPlot = xyPlot(ui, { title: 'Mahalle yükü, 12:00 → ertesi gün 12:00 (kW)', height: 150, xFmt: (v) => `${String(Math.round(v) % 24).padStart(2, '0')}`, yFmt: (v) => fmt(v, 0),
  legend: [{ name: 'hane yükü', color: '#94a3b8' }, { name: 'hane + şarj', color: '#f97316' }, { name: 'trafo', color: '#ef4444' }] });

ui.section('Görünüm', { open: false });
const tFollow = ui.toggle({ label: 'Kamera aracı izlesin (A)', value: true });
let labelsOn = true;
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => { labelsOn = v; syncLabels(); } });
function syncLabels() {
  carLabel.visible = labelsOn && st.part !== 'C';
  trafoLabel.visible = hoodLabel.visible = labelsOn && st.part === 'C';
}

// --- Güncelle ---
const fmtH = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} sa ${String(m % 60).padStart(2, '0')} dk`; };
const clock = (h) => { const x = ((h % 24) + 24) % 24; return `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.floor((x % 1) * 60)).padStart(2, '0')}`; };

function updateAll() {
  computeDrive();
  computeHood();
  // A
  stCons.set(fmt(cons.per100, 1), cons.per100 > 22 ? 'bad' : cons.per100 < 15 ? 'good' : 'warn');
  stRange.set(fmt(rangeKm, 0));
  stAvg.set(fmt(cons.avgSpeed, 0));
  stHvac.set(fmt(cons.hvacW / 1000, 1));
  const tot = cons.per100;
  PARTS.forEach(([k], i) => partMeters[i].set(cons.parts[k] / tot, `${fmt(cons.parts[k], 1)} kWh · %${fmt((cons.parts[k] / tot) * 100, 0)}`));
  regenText.set(st.city
    ? (st.regen ? `Geri kazanım 100 km'de <b>${fmt(cons.regen, 1)} kWh</b> enerjiyi bataryaya geri yazıyor.` : 'Geri kazanım kapalı: frenlemedeki tüm kinetik enerji balatalarda ısıya dönüşüyor.')
    : `Hava yoğunluğu ${fmt(airRho(st.T), 3)} kg/m³ (soğuk hava daha yoğun → daha çok direnç). Kullanılabilir kapasite: %${fmt(coldCapacity(st.T) * 100, 0)}.`);
  const c = CARS[st.carKey], pts = [];
  let ymax = 0;
  for (let v = 30; v <= 150; v += 10) {
    const r = consumption({ car: c, v, city: false, T: st.T, hvacOn: st.hvacOn, heatPump: st.heatPump, regen: st.regen, hills: st.hills });
    const km = (st.bat * coldCapacity(st.T)) / r.per100 * 100;
    ymax = Math.max(ymax, km);
    pts.push([v, km]);
  }
  const hwNow = st.city ? null : [st.v, rangeKm];
  rangePlot.draw({ xMin: 30, xMax: 150, yMin: 0, yMax: Math.ceil(ymax / 150) * 150, xTicks: 6, series: [{ pts, color: '#22c55e', fill: 0.12 }],
    marks: hwNow ? [{ x: hwNow[0], y: hwNow[1], color: '#facc15' }] : [] });
  // B
  const acC = { kw: st.ac }, dcC = { kw: st.dc, dc: true };
  stAC.set(fmt(chargeTime(0.1, 0.8, st.bat, acC, st.T, st.precond), 1));
  stDC.set(fmt(chargeTime(0.1, 0.8, st.bat, dcC, st.T, st.precond) * 60, 0));
  let peak = 0;
  const dcPts = [], acPts = [];
  for (let s = 0; s <= 1.0001; s += 0.01) {
    const pd = chargePower(Math.min(s, 1), st.bat, dcC, st.T, st.precond).grid;
    peak = Math.max(peak, pd);
    dcPts.push([s * 100, pd]);
    acPts.push([s * 100, chargePower(Math.min(s, 1), st.bat, acC, st.T, st.precond).grid]);
  }
  stPeak.set(fmt(peak, 0), peak < st.dc * 0.8 ? 'warn' : '');
  // 10 dakikada eklenen menzil (%10'dan)
  let s = 0.1, e = 0;
  for (let i = 0; i < 600; i++) { const p = chargePower(s, st.bat, dcC, st.T, st.precond).batt; e += p / 3600; s = Math.min(1, s + p / 3600 / st.bat); }
  stKm10.set(fmt((e / cons.per100) * 100, 0));
  chgPlot.draw({ xMin: 0, xMax: 100, yMin: 0, yMax: Math.max(20, Math.ceil(peak / 30) * 30), xTicks: 5,
    series: [{ pts: dcPts, color: '#38bdf8', fill: 0.12 }, { pts: acPts, color: '#22c55e' }],
    vlines: [{ x: 10, color: 'rgba(148,163,184,.6)' }, { x: 80, color: 'rgba(148,163,184,.8)', label: '%80' }],
    marks: st.part === 'B' ? [{ x: chg.soc * 100, y: curChargeKw(), color: '#facc15' }] : [] });
  drawHood();
}

function drawHood() {
  const r = mah.res;
  const xs = (i) => T0 + (i + 0.5) * STEP;
  const basePts = [], totPts = [];
  let pb = 0, pt = 0, pti = 0, evE = 0;
  for (let i = 0; i < r.NS; i++) {
    const b = r.base[i], t = b + r.ev[i];
    basePts.push([xs(i), b]); totPts.push([xs(i), t]);
    if (b > pb) pb = b;
    if (t > pt) { pt = t; pti = i; }
    evE += r.ev[i] * STEP;
  }
  stBase.set(fmt(pb, 0));
  stTot.set(fmt(pt, 0), pt > st.trafo ? 'bad' : pt > st.trafo * 0.85 ? 'warn' : 'good');
  stWhen.set(clock(xs(pti)));
  stEVe.set(fmt(evE, 0));
  const nEV = mah.evs.length;
  hoodText.set(`${nEV} araç, ortalama ${fmt(mah.per100, 1)} kWh/100 km (yarı şehir yarı 90 km/h, bu sıcaklıkta). Zirve araçsız duruma göre
    <b>${pb > 0 ? '+%' + fmt(((pt - pb) / pb) * 100, 0) : '—'}</b>. ${pt > st.trafo ? '<b>Trafo aşırı yükleniyor!</b>' : ''}`);
  const ymax = Math.max(pt, st.trafo) * 1.1;
  const h = 12 + (mah.t * MAH_H_PER_S) % 24;
  hoodPlot.draw({ xMin: T0, xMax: T0 + 24, yMin: 0, yMax: Math.ceil(ymax / 30) * 30, xTicks: 8,
    series: [{ pts: basePts, color: '#94a3b8', fill: 0.15, width: 1.5 }, { pts: totPts, color: '#f97316' }],
    hlines: [{ y: st.trafo, color: '#ef4444', label: 'trafo' }],
    vlines: st.part === 'C' ? [{ x: h, color: '#facc15', label: clock(h) }] : [] });
}

function curChargeKw() {
  const ch = segChg.value === 'ac' ? { kw: st.ac } : { kw: st.dc, dc: true };
  return chargePower(chg.soc, st.bat, ch, st.T, st.precond).grid;
}

// --- Bölüm geçişi ---
const CAMS = {
  A: [CAM0, [-15, 1.5, 10]],
  B: [[-21, 5.2, 14.5], [-11, 1.3, 0.5]],
  C: [[0, 125, -22], [0, 0, -108]],
};
function setPart(p) {
  st.part = p;
  segPart.set(p);
  syncLabels();
  sim.moveCamera(...CAMS[p]);
  if (p !== 'C') { setSky(SKY_DAY); cities.forEach((c) => c.buildings.setLit(0)); }
  if (p === 'B') placeAtStation();
  showCable(p === 'B');
  sim.formatTime = p === 'A' ? null : p === 'B' ? () => `Şarj: ${fmtH(chg.t / 60)}` : () => `Saat ${clock(12 + mah.t * MAH_H_PER_S)}`;
  updateAll();
}
function placeAtStation() {
  car.position.copy(PARK);
  car.position.x += 1.4; car.position.z += 0.5;
  car.rotation.set(0, Math.PI / 2, 0);
  layCable();
}

function scenario(k) {
  const s = SCEN[k];
  Object.assign(st, s);
  segCity.set(s.city ? 'city' : 'hwy'); sV.set(s.v); sT.set(s.T); tHvac.set(s.hvacOn); tHP.set(s.heatPump); tRegen.set(s.regen);
  segHill.set(s.hills ? 'tepe' : 'duz'); hills = s.hills; buildRoad();
  if (st.part !== 'A') setPart('A'); else updateAll();
}

// --- Döngü ---
const tmpV = new THREE.Vector3();
let hoodTick = 0;
sim.onUpdate((dt) => {
  if (st.part === 'A') stepDrive(dt);
  else if (st.part === 'B') stepCharge(dt);
  else stepHood(dt);
});

function stepDrive(dt) {
  const c = CARS[st.carKey], vmax = st.v / 3.6;
  const D = drive;
  let a = 0;
  if (D.wait > 0) {
    D.wait -= dt; D.v = 0;
    if (D.wait <= 0) D.stopIdx = -1;
  } else if (st.city) {
    // bir sonraki ışığa mesafe
    let best = Infinity, bi = -1;
    LIGHTS.forEach((u, i) => { let dd = u * PERIM - (D.d % PERIM); if (dd < 0.3) dd += PERIM; if (dd < best) { best = dd; bi = i; } });
    if (D.v * D.v / (2 * 2.0) >= best - 3 && D.v > 0.1) a = -Math.min(4, (D.v * D.v) / (2 * Math.max(0.5, best - 2.5)));
    else if (D.v < vmax) a = 1.5;
    if (best < 3 && D.v < 0.6) { D.wait = 8; D.v = 0; D.stopIdx = bi; a = 0; }
  } else {
    a = clamp((vmax - D.v) * 0.8, -3, 2);
  }
  const vNew = clamp(D.v + a * dt, 0, 45);
  const vm = (D.v + vNew) / 2;
  // anlık batarya gücü
  const grade = st.hills ? HILL_A * (4 * Math.PI / PERIM) * Math.cos((4 * Math.PI * D.d) / PERIM) : 0;
  const th = Math.atan(grade);
  const F = 0.5 * airRho(st.T) * c.Cd * c.A * vm * vm + c.Crr * c.m * 9.81 * Math.cos(th) + c.m * 9.81 * Math.sin(th) + c.m * 1.05 * (dt > 0 ? (vNew - D.v) / dt : 0);
  const Pw = F * vm;
  const aux = AUX + hvacPower(st.T, { on: st.hvacOn, heatPump: st.heatPump });
  const Pb = (Pw >= 0 ? Pw / ETA_DRIVE : -(st.regen ? Math.min(-Pw, REGEN_MAX) * ETA_REGEN : 0)) + aux;
  D.v = vNew;
  D.d += vm * dt;
  D.dist += vm * dt;
  D.energy += Pb * dt;
  roadAt(D.d, tmpV);
  car.position.copy(tmpV);
  car.position.x += Math.sin(tmpV.ang) * LANE; car.position.z += Math.cos(tmpV.ang) * LANE; car.position.y += 0.05;
  const ahead = roadAt(D.d + 2);
  car.rotation.set(0, tmpV.ang, Math.atan2(ahead.y - tmpV.y, 2));
  for (const w of car.userData.wheels) w.rotation.z -= (vm * dt) / 0.38;
  if (tFollow.value && sim.controls) {
    // hedefi araca doğru kaydır, kamerayı aynı miktarda taşı (kullanıcının açısı korunur)
    const tg = sim.controls.target;
    const dx = (car.position.x - tg.x) * Math.min(1, dt * 3), dz = (car.position.z - tg.z) * Math.min(1, dt * 3), dy = (car.position.y - tg.y) * Math.min(1, dt * 3);
    tg.x += dx; tg.y += dy; tg.z += dz;
    sim.camera.position.x += dx; sim.camera.position.y += dy; sim.camera.position.z += dz;
  }
  LIGHTS.forEach((_, i) => lightPoles[i].userData.set(!st.city ? 2 : D.stopIdx === i ? 0 : 1)); // 0 kırmızı, 1 sarı, 2 yeşil
  if (sim.frame % 5 === 0) {
    const kw = Pb / 1000;
    const trip = D.dist > 50 ? `${fmt((D.energy / 3.6e6) / (D.dist / 1000) * 100, 1)} kWh/100 km (bu sürüş)` : '';
    carLabel.setText(`<b>${fmt(vm * 3.6, 0)} km/h</b> · ${kw < 0 ? '↺ ' : '⚡ '}${fmt(kw, 1)} kW<br><small>${trip}</small>`);
  }
}

function stepCharge(dt) {
  const ch = segChg.value === 'ac' ? { kw: st.ac } : { kw: st.dc, dc: true };
  let pb = 0;
  if (chg.soc < 0.999) {
    const p = chargePower(chg.soc, st.bat, ch, st.T, st.precond);
    pb = p.batt;
    const hours = (dt * MIN_PER_S) / 60;
    chg.soc = Math.min(1, chg.soc + (p.batt * hours) / st.bat);
    chg.t += dt * MIN_PER_S;
  }
  cableMat.emissiveIntensity = pb > 0 ? 0.6 + 0.4 * Math.sin(sim.time * 6) : 0;
  postMat.emissive.setHex(pb > 0 ? 0x22c55e : 0x0ea5e9);
  if (sim.frame % 5 === 0) {
    const grid = pb > 0 ? pb / (ch.dc ? 0.95 : ETA_AC) : 0;
    carLabel.setText(`<b>%${fmt(chg.soc * 100, 0)}</b> · ${fmt(grid, grid < 20 ? 1 : 0)} kW<br><small>${chg.soc >= 0.999 ? 'dolu' : 'şarj oluyor'} · ${fmtH(chg.t / 60)}</small>`);
    if (sim.frame % 15 === 0) { updateAll(); scr1.draw(chg.soc, grid, pb > 0); }
  }
}

const col = new THREE.Color(), GREEN = new THREE.Color(0x22c55e);
const hide = new THREE.Matrix4().makeScale(0, 0, 0);
const wbM = Array.from({ length: NVIS }, (_, i) => { const m = new THREE.Matrix4(); wallbox.getMatrixAt(i, m); return m; });
const ledM = Array.from({ length: NVIS }, (_, i) => { const m = new THREE.Matrix4(); wbLed.getMatrixAt(i, m); return m; });
function stepHood(dt) {
  mah.t += dt;
  const h = 12 + (mah.t * MAH_H_PER_S) % 24;
  const r = mah.res;
  const slot = Math.min(r.NS - 1, Math.floor((h - T0) / STEP));
  const hl = houseLoad(h);
  const nEV = mah.evs.length;
  const evVis = Math.round((NVIS * st.share) / 100);
  const nShow = Math.min(NVIS, st.nHouses);
  if (st.part === 'C') setSky(skyAt(h));
  // Pencere ışıkları: hane yükü × karanlık (yük profili ile birlikte artar)
  const dark = THREE.MathUtils.smoothstep(-skyEl, -6, 4);
  if (st.part === 'C') { const litV = clamp(hl, 0, 1.2) * (0.15 + 0.85 * dark); cities.forEach((c) => c.buildings.setLit(litV)); }
  let charging = 0;
  for (let i = 0; i < NVIS; i++) {
    const shown = i < nShow, owner = shown && i < evVis && nEV > 0;
    let show = false, on = false;
    if (owner) {
      const j = Math.min(nEV - 1, Math.floor((i * nEV) / Math.max(1, evVis)));
      const ev = mah.evs[j];
      if (h >= ev.arrive && h < 31) {
        show = true;
        on = !!r.charging[j][slot];
        if (on) charging++;
      }
    }
    if (show) { const c = hpos[i].car; hoodCars.set(i, c[0], 0.2, c[1], c[2]); hoodCars.tint(i, on ? GREEN : null); } else hoodCars.hide(i);
    wallbox.setMatrixAt(i, owner ? wbM[i] : hide);
    wbLed.setMatrixAt(i, owner ? ledM[i] : hide);
    wbLed.setColorAt(i, col.setHex(on ? 0x22c55e : show ? 0x0ea5e9 : 0x1e293b));
  }
  hoodCars.commit();
  for (const m of [wallbox, wbLed]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  const load = r.base[slot] + r.ev[slot];
  trafoLabel.setText(`Trafo: <b>${fmt(load, 0)} kW</b> / ${fmt(st.trafo, 0)}`);
  trafoLabel.el.style.borderColor = load > st.trafo ? '#ef4444' : '';
  hoodLabel.setText(`${clock(h)} · şarjdaki araç (görünen): ${charging}${st.nHouses > NVIS ? ` · ilk ${NVIS} hane gösteriliyor` : ''}`);
  if (++hoodTick % 6 === 0) drawHood();
}

sim.onReset(() => {
  drive = { d: START_D, v: 0, wait: 0, stopIdx: -1, energy: 0, dist: 0 };
  chg = { soc: 0.1, t: 0 };
  mah.t = 0;
  if (st.part === 'B') placeAtStation();
  updateAll();
});

// başlangıç
setCarType(st.carKey);
buildRoad();
updateAll();
setPart('A');
mah.t = (18 - 12) / MAH_H_PER_S; // mahalle 18:00'den başlasın
stepHood(0);
