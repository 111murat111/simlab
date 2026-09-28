// Karbon Ayak İzi Evi — kesit görünümlü evde her tercih yıllık CO₂e (kişi başı) hesabını ve evin görünümünü değiştirir.
import { createSim, THREE, fmt, clamp, lerp, rand, seeded, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils, landscape, createTerrain, terrainSkirt,
  createVegetation, makeCity, makeBlock, streetMaterials, streetTrees, streetLamps } from '@core';
import { plaster, tiles, parquet, pvMat, radiatorGeo, bicycle, cityBus, airliner, wheelieBin, trashBag, softDot } from './props.js';
import { createSmoke } from './smoke.js';
import { makeEV } from './ev.js';
import { makePlot } from './plot.js';

// Yaklaşık emisyon katsayıları (kg CO₂e) — eğitim amaçlı yuvarlanmış değerler
const K = {
  grid: 0.45,          // şebeke elektriği, kg/kWh (Türkiye civarı)
  gas: 0.2 / 0.9,      // doğalgaz kombi, kg/kWh ısı (%90 verim)
  coal: 0.34 / 0.6,    // kömür sobası, kg/kWh ısı (%60 verim)
  heatPumpCOP: 3,      // ısı pompası: 1 kWh elektrikle ~3 kWh ısı
  heatDemand: 3300,    // kişi başı yıllık ısı ihtiyacı, kWh (orta yalıtım, 3 kişilik ev)
  car: 0.17, ev: 0.08, bus: 0.05, bike: 0,   // kg/km (kişi başı)
  treeKg: 20,          // bir ağacın yılda bağladığı CO₂ (yaklaşık)
  flight: 0.3,         // gidiş-dönüş kısa/orta mesafe uçuş (~2.000 km × ~0,15 kg/km), t
};
const PEOPLE = 3;
const INSUL = [1.4, 1, 0.6];
const WASH_KWH = { 30: 0.5, 40: 0.8, 60: 1.3, 90: 2.2 };
const TARGET = 2, TR_AVG = 6.6;
const CATS = [
  { key: 'heat', name: 'Isınma', color: '#f97316' },
  { key: 'elec', name: 'Elektrik', color: '#facc15' },
  { key: 'food', name: 'Beslenme', color: '#22c55e' },
  { key: 'trans', name: 'Ulaşım', color: '#38bdf8' },
  { key: 'fly', name: 'Uçuşlar', color: '#f472b6' },
  { key: 'other', name: 'Tüketim ve atık', color: '#a78bfa' },
];

const sim = createSim({
  sky: { elevation: 44, azimuth: 158, clouds: 0.3, haze: 1.1, visibility: 4000 },
  camera: { position: [-3, 11.5, 30], target: [-0.5, 6.2, 0], fov: 50, near: 0.2, far: 30000 },
  controls: { minDistance: 10, maxDistance: 60, maxPolarAngle: Math.PI * 0.47 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Önü açık (kesit) bir ev: salon, mutfak, yatak odası ve çamaşır odası, yanında garaj. Paneldeki her tercih evde
    görünür bir şeyi değiştirir ve <b>yıllık karbon ayak izini</b> (kişi başı, ton CO₂e) yeniden hesaplar.
    Evin üstündeki <b>CO₂ bulutu</b> toplam salımla büyür, arka plandaki orman da bu salımı bir yılda bağlamak için
    gereken ağaç sayısını gösterir (her simge 10 ağaç).</p>
    <h3>Dene</h3>
    <ul>
      <li>Önce <b>yalıtımı</b> iyileştir: duvarlardan kaçan turuncu ısı parçacıkları azalır, ısınma payı düşer.</li>
      <li>Kömür sobasını <b>ısı pompasına</b> çevir; sonra çatıya <b>güneş paneli</b> ekle.</li>
      <li>Arabayı bırakıp <b>bisiklete</b> geç, haftadaki et günlerini azalt. Hangisi daha çok fark yaratıyor?</li>
      <li>"🌍 Yeşil ev" hazır ayarıyla 1,5 °C hedefine (~2 t) ne kadar yaklaşabildiğine bak.</li>
    </ul>
    <h3>Model</h3>
    <p>Hesap, 3 kişilik bir evde <b>kişi başı</b> paydır. Katsayılar <b>yaklaşıktır</b>: şebeke elektriği ≈ 0,45 kg/kWh,
    doğalgaz ≈ 0,2 kg/kWh, kömür ≈ 0,34 kg/kWh, benzinli araba ≈ 0,17 kg/km, toplu taşıma ≈ 0,05 kg/km (kişi başı),
    ısı pompası ≈ 3 kat verim (COP), 3 kW güneş paneli ≈ 4.000 kWh/yıl, bir ağaç yılda ≈ 20 kg CO₂.
    bir gidiş-dönüş uçuş (~2.000 km) ≈ 0,3 t. Türkiye'nin toplam sera gazı salımı kişi başı yaklaşık 6,6 t CO₂e'dir
    (TÜİK, 2022; sanayi dâhil); 1,5 °C hedefiyle uyumlu yaşam tarzı için kişi başı ~2 t civarına inmek gerekir.
    Kıyafet ve eşya alışverişi "Tüketim" kaleminde kaba bir sabit olarak tutulmuştur.</p>
    <p><small>Gerçek değerler iklime, evin büyüklüğüne, elektrik karışımına ve alışkanlıklara göre değişir.</small></p>`,
});
const scene = sim.scene;
const LOW = /[?&]low\b/.test(location.search);

// --- Yardımcılar ---
const house = new THREE.Group();
house.position.y = 0.17;           // ada içi bahçe çimi kotunda (kaldırım 0,15, çim 0,17)
scene.add(house);
const shade = (o) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };
function box(w, h, d, m, x, y, z, parent = house, r = Math.min(0.03, w / 4, h / 4, d / 4)) {
  const mesh = new THREE.Mesh(r > 0.004 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cyl(rt, rb, h, m, x, y, z, parent = house, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const clickables = [];
function info(obj, text) { obj.userData.info = text; clickables.push(obj); return obj; }
const G = streetMaterials();
const ss = THREE.MathUtils.smoothstep;

// --- Arazi ve mahalle (kent motoru): evin sokağı z = 15; ön sırada komşu evler, arkada fidanlık alanı ve arka sokağa
//     bakan evler, karşıda bahçeli evler; kent kenarından sonra hafif dalgalı tarla ve ağaçlı tepeler ---
const ROAD = 8, WALK = 3, HR = ROAD / 2, ZR = 15;
const XS = [-104, -50, 50, 104], ZS = [-80, ZR, 90];
const CITY = { x0: XS[0] - HR, x1: XS[3] + HR, z0: ZS[0] - HR, z1: ZS[2] + HR };
const hfun = landscape({ seed: 8, size: 2400, height: 120, octaves: 6, warp: 0.35,
  shape: (x, z, h) => {
    const dd = Math.max(0, CITY.x0 - x, x - CITY.x1, CITY.z0 - z, z - CITY.z1);
    return -0.06 + ss(dd, 4, 50) * 1.4 * Math.sin(x * 0.019 + 0.5) * Math.cos(z * 0.023) * (1 - ss(dd, 150, 400)) + ss(dd, 30, 700) * (h + 5);
  } });
const terrain = createTerrain(hfun, { size: [3000, 3000], res: LOW ? [120, 120] : [200, 200],
  materialOptions: { water: -60, grassAmount: 0.8, forest: 0.5, grass: 0x5e7430, dry: 0x9c8d58 } });
terrain.userData.noFit = true;
scene.add(terrain, terrainSkirt(hfun, { inner: 1500, outer: 22000 }));
const inCity = (x, z) => x > CITY.x0 - 12 && x < CITY.x1 + 12 && z > CITY.z0 - 12 && z < CITY.z1 + 12;
const veg = createVegetation((x, z) => (inCity(x, z) ? -100 : hfun(x, z)), {
  rect: [-1300, -1300, 1300, 1300], trees: LOW ? 1300 : 2800, shrubs: LOW ? 250 : 600, rocks: 0, seed: 21, water: -60,
  kinds: { oak: 0.3, broad: 0.25, poplar: 0.15, pine: 0.15, cypress: 0.15 },
  forest: (x, z) => 0.55 + 0.3 * Math.sin(x * 0.01 + 0.4) * Math.cos(z * 0.012) });
scene.add(veg.group);

// Parseller: her evin yanında garaj yolu, önünde giriş yolu, sokak kenarında çalı dizisi, ön ve arka bahçede ağaç
const CAM0 = [-3, 11.5, 30];
const FOREST = { x0: -31, x1: 31, z0: -37, z1: -7 };           // fidanlık alanı (evin arkası)
const inForest = (x, z) => x > FOREST.x0 && x < FOREST.x1 && z > FOREST.z0 && z < FOREST.z1;
const innerOf = (i, j) => ({ x0: XS[i] + HR + WALK, x1: XS[i + 1] - HR - WALK, z0: ZS[j] + HR + WALK, z1: ZS[j + 1] - HR - WALK });
const lotsMap = new Map(), mouths = [], drives = [], yardTrees = [], yardShrubs = [], foot = [], ownTrees = [];
{
  const r = seeded(77);
  // side +1: sokak +z yönünde (ev önü +z'ye bakar); side −1: sokak −z yönünde
  const plotRow = (lots, x0, x1, edge, side, skip) => {
    const n = Math.max(1, Math.round((x1 - x0) / 13)), P = (x1 - x0) / n, rot = side > 0 ? 0 : Math.PI;
    const zAt = (v) => edge - side * v;
    for (let k = 0; k < n; k++) {
      const u0 = x0 + (k + 0.5) * P;
      if (skip && skip(u0)) { yardTrees.push([u0 + (r() - 0.5) * 4, zAt(16 + r() * 6), r() * 6, 1, 0.17]); continue; }
      const w = 7.2 + r() * 1.2, d = 8.4 + r() * 1.2, set = 4.6 + r() * 1.0, f = r() < 0.5 ? 1 : -1;
      const hx = u0 + f * (-P / 2 + 0.7 + w / 2), dx = u0 + f * (-P / 2 + 0.7 + w + 1.7);
      lots.push({ x: hx, z: zAt(set + d / 2), rot, type: 'house', width: w, depth: d, floors: 2, y0: 0.15, roof: r() < 0.65 ? 'hip' : 'gable', seed: r() * 1000 });
      foot.push([hx, zAt(set + d / 2), w / 2 + 0.4, d / 2 + 0.4]);
      drives.push([dx, zAt((set + d * 0.7) / 2), 2.8, set + d * 0.7], [hx, zAt(set / 2), 1.2, set]);
      mouths.push([dx, edge + side * 1.9]);
      for (let u = -P / 2 + 0.6; u < P / 2 - 0.4; u += 1.1) {
        const x = u0 + u;
        if (Math.abs(x - dx) > 1.9 && Math.abs(x - hx) > 1.0) yardShrubs.push([x, zAt(0.7 + r() * 0.2), r() * 6, 0, 0.17]);
      }
      yardTrees.push([hx - f * (w / 2 - 1.3), zAt(set * 0.45), r() * 6, r() < 0.5 ? 1 : 0, 0.17]);
      yardTrees.push([hx + (r() - 0.5) * 3, zAt(set + d + 3 + r() * 2), r() * 6, 1, 0.17]);
    }
  };
  const own = innerOf(1, 0), opp = innerOf(1, 1), L0 = [], L1 = [];
  plotRow(L0, own.x0, -13, own.z1, 1);
  plotRow(L0, 14, own.x1, own.z1, 1);
  plotRow(L0, own.x0, own.x1, own.z0, -1);
  plotRow(L1, opp.x0, opp.x1, opp.z0, -1, (u) => Math.abs(u - CAM0[0]) < 21);
  plotRow(L1, opp.x0, opp.x1, opp.z1, 1);
  lotsMap.set('1,0', L0); lotsMap.set('1,1', L1);
}
const nearMouth = (x, z, rx, rz) => mouths.some(([mx, mz]) => Math.abs(mx - x) < rx && Math.abs(mz - z) < rz);
const city = makeCity({ xs: XS, zs: ZS, road: ROAD, walk: WALK, seed: 12, parked: LOW ? 14 : 26, camera: CAM0,
  near: LOW ? 170 : 260, lawnInside: true, lamps: false,
  lots: (inner, rnd, i, j) => lotsMap.get(i + ',' + j) || makeBlock(inner, { seed: 40 + i * 7 + j * 13, gap: 3, depth: [8, 11], width: [9, 13],
    mix: { house: 0.75, apartment: 0.25 }, shops: 0.2, floors: (x, z, rr, type) => (type === 'house' ? 2 : 3 + Math.floor(rr() * 2)) }),
  // evin önünde ve kamera ile ev arasında sokak ağacı yok (kesit görünsün); garaj yollarının ağzı açık
  treeOk: (x, z) => !nearMouth(x, z, 2.2, 1) && !(z > 5 && z < 25 && x > -27 && x < 25),
  parkOk: (x, z) => !nearMouth(x, z, 3.5, 6) && !(z === ZR && Math.abs(x) < 54) });
scene.add(city.group);
// Sokak lambaları (kent motorunun dizilimi; evin önündeki ve kamera ile ev arasındaki direkler çıkarıldı)
{
  const pts = [];
  for (const b of city.blocks) {
    if (b.kind === 'none') continue;
    const perim = [[(s) => [b.x0 + s, b.z1 - 1.1, 0], b.w], [(s) => [b.x0 + s, b.z0 + 1.1, Math.PI], b.w],
      [(s) => [b.x1 - 1.1, b.z0 + s, Math.PI / 2], b.d], [(s) => [b.x0 + 1.1, b.z0 + s, -Math.PI / 2], b.d]];
    for (const [f, len] of perim) for (let s = 12; s < len - 2; s += 28) { const p = f(s); if (!(p[1] > 5 && p[1] < 25 && p[0] > -27 && p[0] < 25)) pts.push(p); }
  }
  scene.add(streetLamps(pts).group);
}
// Diğer adaların iç avlularında ağaçlar
{
  const r = seeded(5);
  for (const b of city.blocks) {
    if (b.kind !== 'city' || lotsMap.has(b.i + ',' + b.j)) continue;
    const inn = innerOf(b.i, b.j);
    for (let k = 0; k < 4; k++) yardTrees.push([(inn.x0 + inn.x1) / 2 + (r() - 0.5) * (inn.x1 - inn.x0 - 26), (inn.z0 + inn.z1) / 2 + (r() - 0.5) * (inn.z1 - inn.z0 - 26), r() * 6, 1, 0.17]);
  }
}

// --- Kendi bahçemiz: beyaz ahşap çit + bahçe kapısı, beton garaj yolu, parke taşı giriş yolu, ağaçlar, çalı çiti, çim ---
const OWN = { x0: -12, x1: 13, z0: -6.5, z1: 7.55 };
{
  const fenceM = mat.wood({ color: 0xeee9df, ring: 4 });
  const pk = new THREE.Shape([[-0.043, 0], [0.043, 0], [0.043, 0.86], [0, 0.95], [-0.043, 0.86]].map(([a, b]) => new THREE.Vector2(a, b)));
  const pkGeo = new THREE.ExtrudeGeometry(pk, { depth: 0.022, bevelEnabled: false }).translate(0, 0.04, -0.011);
  const pickets = [], parts = [];
  const line = (x0, z0, x1, z1, gaps = []) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, yaw = Math.atan2(-uz, ux);
    const at = (s) => [x0 + ux * s, z0 + uz * s];
    for (let s = 0.08; s < L - 0.04; s += 0.13) if (!gaps.some(([a, b]) => s > a - 0.06 && s < b + 0.06)) pickets.push([...at(s), yaw]);
    // kesintisiz parçalar: iki kuşak + dikmeler
    const cuts = [0, ...gaps.flat(), L], segs = [];
    for (let k = 0; k < cuts.length; k += 2) segs.push([cuts[k], cuts[k + 1]]);
    for (const [a, b] of segs) {
      const [mx, mz] = at((a + b) / 2);
      for (const y of [0.3, 0.72]) parts.push(new THREE.BoxGeometry(b - a, 0.07, 0.035).rotateY(yaw).translate(mx - uz * 0.03, y, mz + ux * 0.03));
      const n = Math.max(1, Math.ceil((b - a) / 2.4));
      for (let k = 0; k <= n; k++) { const [px, pz] = at(a + ((b - a) * k) / n); parts.push(new THREE.BoxGeometry(0.09, 1.08, 0.09).rotateY(yaw).translate(px - uz * 0.06, 0.54, pz + ux * 0.06)); }
    }
  };
  line(OWN.x0, OWN.z1, OWN.x1, OWN.z1, [[9.9, 11.1], [16.2, 21.2]]);   // ön: bahçe kapısı (x −2,1…−0,9) ve garaj yolu açık
  line(OWN.x0, OWN.z1, OWN.x0, OWN.z0);
  line(OWN.x1, OWN.z1, OWN.x1, OWN.z0);
  line(OWN.x0, OWN.z0, OWN.x1, OWN.z0);
  const im = new THREE.InstancedMesh(pkGeo, fenceM, pickets.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  pickets.forEach(([x, z, yaw], i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.17, z), q.setFromAxisAngle(up, yaw), one)));
  im.castShadow = im.receiveShadow = true; im.userData.noFit = true;
  const rails = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(parts), fenceM);
  rails.position.y = 0.17; rails.castShadow = rails.receiveShadow = true; rails.userData.noFit = true;
  scene.add(im, rails);
  // bahçe kapısı (yarı açık) ve posta kutusu
  const gate = new THREE.Group();
  for (let k = 0; k < 8; k++) { const p = new THREE.Mesh(pkGeo, fenceM); p.position.x = 0.08 + k * 0.13; gate.add(p); }
  for (const y of [0.3, 0.72]) box(1.1, 0.07, 0.035, fenceM, 0.55, y, 0.03, gate, 0.01);
  gate.position.set(-2.1, 0.17, OWN.z1); gate.rotation.y = 0.9; shade(gate); scene.add(gate);
  const post = mat.paintedMetal({ color: 0x2f3b36, wear: 0.2 });
  box(0.08, 1.1, 0.08, post, -2.7, 0.72, OWN.z1 - 0.25, scene, 0.01);
  box(0.42, 0.3, 0.3, post, -2.7, 1.35, OWN.z1 - 0.25, scene, 0.05);
  // garaj yolu (fırçalanmış beton) ve giriş yolu (parke taşı)
  box(4.6, 0.08, 4.4, mat.concrete({ color: 0xb8b3aa, stains: 0.4 }), 6.7, 0.19, 5.85, scene, 0.02);
  drives.push([-1.5, 5.8, 1.3, 4.3]);
  // bahçe ağaçları (meyve, meşe, servi) ve çit dibinde çalılar
  ownTrees.push([-9.6, 5.2, 1.3, 0, 0.17], [-9.8, -4.4, 4.2, 1, 0.17], [11.2, -4.6, 2.2, 1, 0.17], [11.9, 5.9, 0.4, 0, 0.17]);
  for (let x = -11.4; x < 12.6; x += 0.95) if ((x < -3.1 || x > -0.1) && (x < 3.8 || x > 9.6)) yardShrubs.push([x, OWN.z1 - 0.55, x * 3.1, 0, 0.17]);
  for (const [x, z] of [[-7, 3.9], [-7, 2.6], [-7.1, -2.4], [9.9, 3.9], [9.9, 2.7]]) yardShrubs.push([x, z, x * z, 0, 0.17]);
}
const yT = [...yardTrees.filter(([x, z]) => !inForest(x, z) && !(x > OWN.x0 - 1.5 && x < OWN.x1 + 1.5 && z > OWN.z0 - 1.5 && z < OWN.z1 + 1)), ...ownTrees];
const yardT = streetTrees(yT, 19, { oak: 0.3, fruit: 0.35, broad: 0.2, cypress: 0.15 });
const yardS = streetTrees(yardShrubs, 23, { shrub: 1 });
scene.add(yardT.group, yardS.group);
{
  const geos = drives.map(([x, z, w, l]) => new RoundedBoxGeometry(w, 0.06, l, 1, 0.02).translate(x, 0.19, z));
  const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), G.paver);
  m.receiveShadow = true; m.userData.noFit = true;
  scene.add(m);
}
// Çim öbekleri: bahçelerde (evlerin, yolların ve garaj yollarının dışında)
const onLawn = (x, z) => {
  const own = x > -43 && x < 43 && ((z > -73 && z < 8) || (z > 22 && z < 83));
  if (!own) return false;
  if (x > -7.4 && x < 9.6 && z > -4.3 && z < 4.3) return false;
  if (x > 4.2 && x < 9.2 && z > 3.4 && z < 8.2) return false;
  if (drives.some(([dx, dz, w, l]) => Math.abs(x - dx) < w / 2 + 0.15 && Math.abs(z - dz) < l / 2 + 0.15)) return false;
  return !foot.some(([fx, fz, hw, hd]) => Math.abs(x - fx) < hw && Math.abs(z - fz) < hd);
};
const lawnTufts = createVegetation((x, z) => (onLawn(x, z) ? 0.17 : -100), { rect: [-44, -40, 44, 40], trees: 0, rocks: 0, seed: 9, water: -60,
  grass: LOW ? 2600 : 6000, grassAt: [-1, 4, 22], grassFar: 42 });
scene.add(lawnTufts.group);

// --- Ev gövdesi (önü kesit olarak açık): kalın duvar kesiti = iç sıva | tuğla | dış sıva; döşeme = betonarme + şap + parke ---
const wallM = plaster(0xf1e4cf), innerM = plaster(0xece3d3), tileM = tiles(0xdfe3e6, 0.3);
const brickM = mat.brick({ color: 0xb4603f, mortar: 0xd8cfbf });
const floorM = parquet(0xb27d4c), floorM2 = parquet(0x9a6a40);
const concreteM = mat.concrete({ color: 0xa8a39a, stains: 0.4 });
const slabM = mat.concrete({ color: 0x9e998f, stains: 0.15 }), screedM = mat.concrete({ color: 0x8c8880, stains: 0.05 });
box(10.6, 0.3, 7.6, concreteM, -1, -0.1, 0);                    // temel plağı
box(10, 0.025, 7, screedM, -1, 0.0625, 0, house, 0);            // şap
box(9.7, 0.025, 7, floorM, -1, 0.0875, 0, house, 0);            // parke (üst kot 0,1)
box(9.7, 0.02, 7, innerM, -1, 2.95, 0, house, 0);               // tavan sıvası
box(10, 0.18, 7, slabM, -1, 3.05, 0, house, 0);                 // ara kat betonarme döşeme
box(10, 0.03, 7, screedM, -1, 3.155, 0, house, 0);
box(4.85, 0.03, 7, floorM2, -3.45, 3.185, 0, house, 0);          // yatak odası parkesi
box(4.85, 0.03, 7, tileM, 1.45, 3.185, 0, house, 0);             // banyo fayansı
box(9.7, 0.02, 7, innerM, -1, 5.96, 0, house, 0);
box(10, 0.18, 7, slabM, -1, 6.06, 0, house, 0);                 // çatı döşemesi
// Arka duvar: pencere boşluklu (içeriden arkadaki fidanlık görünür)
const WINS = [[-3.5, 1.7], [1.5, 1.9], [-3.5, 4.7], [2.8, 4.8]];
const WALL_H = 6.25, WALL_Y = 3.025;
function holedWall(w, h, depth, pad = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.lineTo(-w / 2, -h / 2);
  for (const [x, y] of WINS) {
    const hx = x + 1, hy = y - WALL_Y, a = 0.8 + pad, b = 0.55 + pad, hole = new THREE.Path();
    hole.moveTo(hx - a, hy - b); hole.lineTo(hx - a, hy + b); hole.lineTo(hx + a, hy + b); hole.lineTo(hx + a, hy - b); hole.lineTo(hx - a, hy - b);
    s.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}
// Katmanlar (dıştan içe): dış sıva 3 cm | tuğla 24,5 cm | iç sıva 2,5 cm
const LAYERS = [[0.03, wallM, 10.3], [0.245, brickM, 10.24], [0.025, innerM, 9.7]];
let backWall;
{
  let z = -3.65;
  for (const [t, m, w] of LAYERS) {
    const wm = new THREE.Mesh(holedWall(w, WALL_H, t), m);
    wm.position.set(-1, WALL_Y, z + t / 2); shade(wm); house.add(wm);
    if (m === brickM) backWall = wm;
    z += t;
  }
  for (const [x0, dir] of [[-6.15, 1], [4.15, -1]]) {
    let x = x0;
    for (const [t, m] of LAYERS) { box(t, WALL_H, 7, m, x + (dir * t) / 2, WALL_Y, 0, house, 0); x += dir * t; }
  }
}
box(0.15, 6, 6.6, innerM, -1, 3, -0.2);
// Süpürgelik
for (const [w, x, z, rx] of [[9.6, -1, -3.33, 0], [6.8, -5.83, 0, 1], [6.8, 3.83, 0, 1]]) for (const y of [0.15, 3.25]) {
  const b = box(w, 0.1, 0.03, mat.wood({ color: 0xf4efe6, ring: 6 }), x, y, z); if (rx) b.rotation.y = Math.PI / 2;
}
// Yalıtım (mantolama): taş yünü levhalar + ince son kat sıva. Son kat kesitten 0,9 m geride biter: katmanlar görünsün.
const insM = procedural({ key: 'rockwool', params: { color: 0xd9b25a, roughness: 0.95 }, bump: 0.04,
  pattern: `float n = fbm3(p*vec3(9.0, 30.0, 9.0), 4); col *= 0.82 + 0.3*n; vec3 a = axisDominant(pn);
    vec2 uv = a.x > 0.5 ? p.zy : (a.y > 0.5 ? p.xz : p.xy); vec2 f = fract(uv/vec2(1.2, 0.6));
    float seam = smoothstep(0.0, 0.012, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.02, min(f.y, 1.0 - f.y)); col *= mix(0.6, 1.0, seam); h = n*seam;` });
const coatM = plaster(0xf4ecdb);
const insul = new THREE.Group();
house.add(insul);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const ub = (m) => { const o = new THREE.Mesh(unitBox, m); o.castShadow = o.receiveShadow = true; insul.add(o); return o; };
const insLeft = ub(insM), insRight = ub(insM), coatL = ub(coatM), coatR = ub(coatM), insTop = ub(insM);
const insBack = new THREE.Mesh(holedWall(10.3, WALL_H, 1, 0.02), insM); shade(insBack); insul.add(insBack);
const coatBack = new THREE.Mesh(holedWall(10.3, WALL_H, 1, 0.02), coatM); shade(coatBack); insul.add(coatBack);
function setInsulation(th) {
  insul.visible = th > 0;
  if (!th) return;
  const zb = -3.65 - th, L = 3.5 - zb, zc = 2.6, Lc = zc - zb + 0.015, zm = (zc + zb - 0.015) / 2;
  insLeft.scale.set(th, WALL_H, L); insLeft.position.set(-6.15 - th / 2, WALL_Y, (3.5 + zb) / 2);
  insRight.scale.set(th, WALL_H, L); insRight.position.set(4.15 + th / 2, WALL_Y, (3.5 + zb) / 2);
  coatL.scale.set(0.015, WALL_H, Lc); coatL.position.set(-6.15 - th - 0.0075, WALL_Y, zm);
  coatR.scale.set(0.015, WALL_H, Lc); coatR.position.set(4.15 + th + 0.0075, WALL_Y, zm);
  const sx = (10.3 + 2 * th) / 10.3;
  insBack.scale.set(sx, 1, th); insBack.position.set(-1, WALL_Y, -3.65 - th / 2);
  coatBack.scale.set(sx + 0.003, 1, 0.015); coatBack.position.set(-1, WALL_Y, zb - 0.0075);
  insTop.scale.set(10, th, 7); insTop.position.set(-1, 6.15 + th / 2, 0);
}
const insLbl = sim.label('', { position: [-6.4, 0.7, 3.9], className: 'plain' });
info(backWall, '🧱 <b>Duvarlar ve yalıtım:</b> Kesitte iç sıva, tuğla ve dış sıva görünür. Mantolama (taş yünü/EPS levha) ve çift cam ısı kaybını azaltır; aynı konfor için daha az yakıt.');
// Pencereler: tek cam (eski ahşap doğrama) ya da yalıtımlıyken PVC çerçeveli çift cam
const glassM = new THREE.MeshPhysicalMaterial({ color: 0xcfe6e0, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false });
const frameM = mat.plastic({ color: 0xf6f6f4, gloss: 0.45 });
const oldFrameM = mat.wood({ color: 0x7a5534, ring: 8 });
const frames = new THREE.Group();
house.add(frames);
for (const [x, y] of WINS) {
  const gp = box(1.6, 1.1, 0.02, glassM, x, y, -3.5, house, 0); gp.castShadow = false;
  box(1.62, 0.06, 0.34, oldFrameM, x, y - 0.56, -3.5);                       // eski ahşap denizlik
  box(1.8, 0.12, 0.12, frameM, x, y + 0.6, -3.3, frames);
  box(1.8, 0.12, 0.12, frameM, x, y - 0.6, -3.3, frames);
  box(0.12, 1.3, 0.12, frameM, x - 0.85, y, -3.3, frames);
  box(0.12, 1.3, 0.12, frameM, x + 0.85, y, -3.3, frames);
  box(0.08, 1.2, 0.1, frameM, x, y, -3.28, frames);
  const g2 = box(1.6, 1.1, 0.02, glassM, x, y, -3.4, frames, 0); g2.castShadow = false; // ikinci cam (çift cam)
  box(1.9, 0.05, 0.3, mat.concrete({ color: 0xd8d3ca, stains: 0.2 }), x, y - 0.62, -3.78, house); // dış denizlik
}
// Çatı: ahşap kaplama üstünde dalgalı kil kiremit sıraları (her sıra alttakinin üstüne biner), mahya kiremidi,
// alın ve rüzgâr tahtaları, oluk ve iniş boruları, üçgen kalkan duvarlar
const slope = Math.atan2(2.8, 4);
const RIDGE_Y = 6.15 + 2.8, LS = 5.15;
const clayM = procedural({ key: 'clay-tile', params: { color: 0xb65b37, roughness: 0.7 }, bump: 0.02,
  pattern: `float n = fbm3(p*2.5, 4), t = h13(vec3(floor(p.x/0.3 + 0.5), floor(p.z/0.13), 9.0));
    col *= (0.8 + 0.3*t)*(0.86 + 0.24*n);
    col = mix(col, vec3(0.3, 0.29, 0.24), 0.28*smoothstep(0.6, 0.85, fbm3(p*0.7 + 3.0, 3)));
    rough = 0.6 + 0.3*n; h = n;` });
const woodTrim = mat.wood({ color: 0x5c3d27, ring: 10 });
function tileCourseGeo(len) {
  const lam = 0.3, amp = 0.045, t = 0.016, n = Math.round(len / lam) * 8, top = [];
  for (let i = 0; i <= n; i++) { const x = -len / 2 + (i / n) * len; top.push(new THREE.Vector2(x, amp * (0.5 - 0.5 * Math.cos((2 * Math.PI * (x + len / 2)) / lam)))); }
  const pts = [...top, ...top.slice().reverse().map((v) => new THREE.Vector2(v.x, v.y - t))];
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.42, bevelEnabled: false });
  // İnce dalgalı profilin üçgenlemesi birkaç sıfır alanlı üçgen üretir → sıfır normal → gölgelendiricide NaN → bloom tüm
  // kareyi karartır (panel yokken siyah ekranın nedeni). Bu köşelere kiremit yüzeyinin normali verilir.
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) if (!(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i)) > 0.5)) nrm.setXYZ(i, 0, 1, 0);
  return g;
}
const courseGeo = tileCourseGeo(10.8);
function roofSlope(sign) {
  const g = new THREE.Group();
  g.position.set(-1, RIDGE_Y, 0);
  g.rotation.y = sign > 0 ? 0 : Math.PI;
  const s = new THREE.Group(); s.rotation.x = slope; g.add(s);
  box(10.9, 0.05, LS, mat.wood({ color: 0x8a6a48, ring: 10 }), 0, -0.025, LS / 2, s, 0);       // kaplama tahtası
  const nC = Math.ceil((LS - 0.42) / 0.35) + 1, im = new THREE.InstancedMesh(courseGeo, clayM, nC);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.07, 0, 0)), one = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < nC; k++) im.setMatrixAt(k, m4.compose(new THREE.Vector3(0, 0.004, Math.min(k * 0.35, LS - 0.42)), q, one));
  im.castShadow = im.receiveShadow = true; s.add(im);
  box(10.95, 0.2, 0.035, woodTrim, 0, -0.07, LS + 0.02, s, 0.01);                             // alın tahtası
  for (const x of [-5.47, 5.47]) box(0.035, 0.2, LS + 0.05, woodTrim, x, 0.02, LS / 2, s, 0.01); // rüzgâr tahtaları
  house.add(g);
  return s;
}
const roofFront = roofSlope(1);
roofSlope(-1);
{
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 10.95, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), mat.ceramic({ color: 0x9a4526 }));
  ridge.position.set(-1, RIDGE_Y + 0.05, 0); shade(ridge); house.add(ridge);
  const zinc = mat.brushedMetal({ color: 0xa7abae, rough: 0.35 });
  const eaveZ = LS * Math.cos(slope) + 0.08, eaveY = RIDGE_Y - LS * Math.sin(slope) - 0.12;
  for (const sgn of [1, -1]) {
    const gut = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 10.9, 14, 1, true, Math.PI, Math.PI).rotateZ(Math.PI / 2), zinc);
    gut.material.side = THREE.DoubleSide; gut.position.set(-1, eaveY, sgn * eaveZ); shade(gut); house.add(gut);
  }
  for (const x of [-6.35, 4.35]) cyl(0.05, 0.05, eaveY - 0.1, zinc, x, eaveY / 2 + 0.05, -eaveZ, house, 12); // iniş boruları (arka köşeler)
  const sh = new THREE.Shape([new THREE.Vector2(-3.8, 0), new THREE.Vector2(3.8, 0), new THREE.Vector2(0, 2.72)]);
  const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }).translate(0, 0, -0.15);
  for (const x of [-6, 4]) {
    const tri = new THREE.Mesh(gg, wallM);
    tri.rotation.y = Math.PI / 2;
    tri.position.set(x, 6.15, 0);
    shade(tri); house.add(tri);
  }
}
const chimney = box(0.7, 2.6, 0.7, mat.brick({ color: 0x8c3f2a }), -4.2, 8.2, -1.6, house, 0.02);
box(0.86, 0.1, 0.86, concreteM, -4.2, 9.52, -1.6);
cyl(0.1, 0.1, 0.3, mat.paintedMetal({ color: 0x3a3a3a, wear: 0.4 }), -4.2, 9.7, -1.6);
// Güneş paneli dizisi (ön çatı, 2 × 5 modül ≈ 3 kW): çatı kancaları, alüminyum raylar, ara/uç kelepçeler
const solar = new THREE.Group();
{
  const pm = pvMat(), alu = mat.brushedMetal({ color: 0xb8bdc2 }), hookM = mat.brushedMetal({ color: 0x8d9398, rough: 0.4 });
  const CL = [-4.3, -2.625, -0.875, 0.875, 2.625, 4.3];
  for (const zr of [1.3, 3.1]) {
    for (let i = 0; i < 5; i++) box(1.55, 0.04, 1.7, pm, -3.5 + i * 1.75, 0.2, zr, solar, 0);
    for (const dz of [-0.5, 0.5]) {
      box(8.9, 0.04, 0.045, alu, 0, 0.155, zr + dz, solar, 0);
      for (let k = 0; k < 6; k++) box(0.04, 0.12, 0.08, hookM, -4.2 + k * 1.68, 0.09, zr + dz, solar, 0);
      for (const x of CL) box(0.05, 0.035, 0.08, alu, x, 0.235, zr + dz, solar, 0);
    }
  }
  roofFront.add(solar);
  info(solar.children[0], '☀️ <b>Güneş paneli:</b> 3 kW panel Türkiye güneşinde yılda yaklaşık 4.000 kWh üretir; şebekeden çekilen elektriği azaltır.');
}


// --- Oda etiketleri ---
[['Salon', -4.9, 2.6], ['Mutfak', 3.0, 2.6], ['Yatak odası', -4.6, 5.6], ['Banyo', 3.2, 5.6], ['Garaj', 6.7, 2.6]]
  .forEach(([t, x, y]) => sim.label(t, { position: [x, y, 3.4], className: 'plain' }));

// --- Isınma cihazları ---
const radM = mat.paintedMetal({ color: 0xf6f6f3, wear: 0.05 });
const radiators = new THREE.Group();
house.add(radiators);
{
  const rg = radiatorGeo(1.4, 0.7), valve = mat.brushedMetal({ color: 0xd8dadc, rough: 0.2 });
  for (const [x, y] of [[-3.5, 0.55], [1.5, 0.65], [-3.5, 3.6], [2.8, 3.6]]) {
    const r = new THREE.Mesh(rg, radM); r.position.set(x, y, -3.22); shade(r); radiators.add(r);
    cyl(0.03, 0.03, 0.12, valve, x + 0.78, y - 0.32, -3.22, radiators, 10);
  }
}
const kombi = new THREE.Group();
box(0.55, 0.8, 0.33, mat.plastic({ color: 0xf7f7f5, gloss: 0.5 }), 0, 0, 0, kombi, 0.05);
box(0.3, 0.07, 0.02, mat.glow({ color: 0x7dd3fc, intensity: 0.8 }), 0, 0.2, 0.17, kombi, 0);
box(0.12, 0.12, 0.02, mat.plastic({ color: 0x1d1f22, gloss: 0.4 }), 0, -0.2, 0.17, kombi, 0);
for (const x of [-0.18, -0.06, 0.06, 0.18]) cyl(0.02, 0.02, 0.35, mat.brushedMetal({ color: 0xb87333, rough: 0.3 }), x, -0.57, 0.03, kombi, 8);
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 10), mat.glow({ color: 0x4f8dff, intensity: 5 }));
flame.position.set(0, -0.2, 0.175);
kombi.add(flame);
kombi.position.set(-0.3, 2.2, -3.15);
house.add(kombi);
info(kombi.children[0], '🔥 <b>Doğalgaz kombi:</b> Yoğuşmalı kombiler verimlidir ama yine de fosil yakıt yakar (≈0,2 kg CO₂/kWh).');
const stove = new THREE.Group();
{
  const iron = mat.paintedMetal({ color: 0x1d1f22, wear: 0.35 });
  const body = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.5, 0], [0.5, 0.08], [0.46, 0.12], [0.46, 1.05], [0.5, 1.1], [0.5, 1.18], [0.001, 1.2]].map(([a, b]) => new THREE.Vector2(a, b)), 28), iron);
  shade(body); stove.add(body);
  cyl(0.1, 0.1, 1.9, mat.brushedMetal({ color: 0x3a3d40, rough: 0.45 }), 0, 2.1, 0, stove, 16);
  box(0.46, 0.34, 0.06, iron, 0, 0.45, 0.46, stove, 0.02);
}
const coalGlow = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.22, 0.04, 1, 0.02), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff6a00, emissiveIntensity: 4 }));
coalGlow.position.set(0, 0.45, 0.49);
stove.add(coalGlow);
stove.position.set(-1.9, 0.1, -2.3);
house.add(stove);
info(stove.children[0], '⚫ <b>Kömür sobası:</b> Verimi düşük, yanması kirli: aynı ısı için doğalgazın yaklaşık 2,5 katı CO₂ ve bol is.');
const heatPump = new THREE.Group();
function outdoorUnit(par, w, h, d) {
  box(w, h, d, mat.paintedMetal({ color: 0xe9eaea, wear: 0.08 }), 0, h / 2, 0, par, 0.04);
  const grille = new THREE.Mesh(new THREE.RingGeometry(0.05, h * 0.38, 28, 3), mat.paintedMetal({ color: 0x2c3035, wear: 0.1 }));
  grille.rotation.y = -Math.PI / 2; grille.position.set(-w / 2 - 0.005, h * 0.53, 0); par.add(grille);
  for (let k = 1; k <= 4; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(h * 0.1 * k, 0.006, 4, 32), mat.brushedMetal({ color: 0x8a9096 }));
    ring.rotation.y = Math.PI / 2; ring.position.set(-w / 2 - 0.012, h * 0.53, 0); par.add(ring);
  }
  const fan = new THREE.Group();
  const blade = new THREE.Shape(); blade.moveTo(0, 0); blade.quadraticCurveTo(h * 0.15, h * 0.2, 0.02, h * 0.36); blade.quadraticCurveTo(-h * 0.1, h * 0.2, 0, 0);
  const bg = new THREE.ShapeGeometry(blade);
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(bg, mat.plastic({ color: 0x3b4046, gloss: 0.3 })); b.rotation.z = (k / 3) * Math.PI * 2; b.material.side = THREE.DoubleSide; fan.add(b); }
  fan.rotation.y = -Math.PI / 2; fan.position.set(-w / 2 + 0.03, h * 0.53, 0);
  par.add(fan);
  return fan;
}
const hpBody = new THREE.Group(); hpBody.position.y = 0.08; heatPump.add(hpBody);
const hpFan = outdoorUnit(hpBody, 0.5, 0.9, 1.3);
for (const z of [-0.45, 0.45]) box(0.45, 0.08, 0.08, concreteM, 0, 0.04, z, heatPump, 0.02);
heatPump.position.set(-6.9, 0, 1.2);
house.add(heatPump);
info(hpBody.children[0], '♨️ <b>Isı pompası:</b> Dış havadaki ısıyı içeri "pompalar"; 1 kWh elektrikle yaklaşık 3 kWh ısı verir.');

// --- Mobilya ---
const sofaM = mat.fabric({ color: 0x9b2f2a }), sofaM2 = mat.fabric({ color: 0x86241f });
box(2.6, 0.45, 0.95, sofaM, -4.2, 0.35, -2.6, house, 0.08);             // kanepe oturak
box(2.6, 0.75, 0.25, sofaM2, -4.2, 0.85, -3.0, house, 0.08);            // sırt
for (const x of [-5.4, -3.0]) box(0.22, 0.6, 0.95, sofaM2, x, 0.5, -2.6, house, 0.08);
for (const x of [-4.8, -3.6]) box(1.1, 0.14, 0.8, sofaM, x, 0.63, -2.55, house, 0.06); // minderler
box(0.05, 0.9, 1.6, mat.plastic({ color: 0x0c0d0f, gloss: 0.9 }), -5.75, 1.6, -0.6, house, 0.02); // TV
box(0.4, 0.45, 1.8, mat.wood({ color: 0x5d4330, ring: 14 }), -5.6, 0.3, -0.6, house, 0.02);         // TV sehpası
box(2.6, 0.02, 2.2, mat.fabric({ color: 0x6d5a8a }), -3.8, 0.1, 0.4, house, 0);                    // halı
box(0.9, 2, 0.75, mat.brushedMetal({ color: 0xe4e6e8, rough: 0.25 }), 3.3, 1.07, -2.8, house, 0.05); // buzdolabı
box(0.02, 0.5, 0.03, mat.brushedMetal({ color: 0x9da3a8 }), 2.95, 1.3, -2.41, house, 0);
box(2.4, 0.86, 0.62, mat.wood({ color: 0xe8e2d6, ring: 6 }), 1.1, 0.5, -3.0, house, 0.02);          // tezgah dolapları
box(2.5, 0.04, 0.66, mat.rock({ color: 0x3b3a38, strata: 0.1 }), 1.1, 0.95, -2.98, house, 0.01);    // tezgah üstü
box(0.5, 0.02, 0.36, mat.brushedMetal({ color: 0xc9cdd1, rough: 0.15 }), 0.4, 0.975, -3.0, house, 0); // evye
box(2.9, 0.05, 1.5, mat.wood({ color: 0xc89868, ring: 20, varnish: true }), 1.5, 0.8, 0.8, house, 0.01); // masa
for (const [x, z] of [[0.2, 0.2], [2.8, 0.2], [0.2, 1.4], [2.8, 1.4]]) cyl(0.035, 0.03, 0.75, mat.wood({ color: 0x7a5234, ring: 8 }), x, 0.42, z, house, 10);
box(2.2, 0.3, 3, mat.wood({ color: 0x8a6446, ring: 14 }), -4.1, 3.36, -1.7, house, 0.03);            // karyola
box(2.1, 0.22, 2.9, mat.fabric({ color: 0xf1efe9 }), -4.1, 3.62, -1.7, house, 0.08);                  // yatak
box(2.2, 0.1, 2.1, mat.fabric({ color: 0x2f5aa8 }), -4.1, 3.76, -1.25, house, 0.04);                  // yorgan
box(1.6, 0.16, 0.5, mat.fabric({ color: 0xf8f8f6 }), -4.1, 3.8, -2.9, house, 0.07);                   // yastık
box(1.8, 0.55, 0.9, mat.ceramic({ color: 0xf7f7f5 }), 2.9, 3.48, -2.8, house, 0.12);                  // küvet
// Ek mobilya: sehpa, berjer, kitaplık, yemek sandalyeleri, ocak, başlık + komodinler + gardırop + halı, banyo (fayans, klozet, lavabo, ayna)
{
  const oak = mat.wood({ color: 0xa87a4f, ring: 16, varnish: true }), walnut = mat.wood({ color: 0x5d4330, ring: 14 });
  const chairW = mat.wood({ color: 0x7a5234, ring: 8 }), cushion = mat.fabric({ color: 0x4f6b58 });
  const white = mat.ceramic({ color: 0xf7f7f5 });
  // sehpa + vazo
  box(1.1, 0.04, 0.6, oak, -4.0, 0.46, -1.1, house, 0.01);
  for (const [dx, dz] of [[-0.48, -0.24], [0.48, -0.24], [-0.48, 0.24], [0.48, 0.24]]) cyl(0.02, 0.018, 0.34, walnut, -4.0 + dx, 0.27, -1.1 + dz, house, 8);
  const vase = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.06, 0], [0.08, 0.07], [0.05, 0.18], [0.035, 0.24], [0.045, 0.26]].map(([a, b]) => new THREE.Vector2(a, b)), 20), mat.ceramic({ color: 0x2f6f8f }));
  vase.position.set(-3.75, 0.48, -1.1); vase.material.side = THREE.DoubleSide; shade(vase); house.add(vase);
  // berjer (TV'ye bakar)
  const arm = mat.fabric({ color: 0x3f5f7a });
  box(0.8, 0.4, 0.8, arm, -2.0, 0.34, -1.4, house, 0.08);
  box(0.18, 0.66, 0.8, arm, -1.62, 0.72, -1.4, house, 0.07);
  for (const dz of [-0.4, 0.4]) box(0.8, 0.52, 0.14, arm, -2.0, 0.44, -1.4 + dz, house, 0.06);
  // kitaplık + kitaplar (örnek başına renk)
  box(0.34, 2.0, 1.0, walnut, -5.68, 1.1, 2.1, house, 0.01);
  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1, 1), mat.fabric({ color: 0xffffff }), 60);
  {
    const r = seeded(31), m4 = new THREE.Matrix4(), c = new THREE.Color(), cols = [0x8c2f2a, 0x2f4f7f, 0x3e6b3a, 0xc9a44a, 0x6b4a7a, 0xe8e2d4, 0x2b2b2b];
    let n = 0;
    for (const y of [0.34, 0.8, 1.26, 1.72]) {
      box(0.3, 0.025, 0.92, walnut, -5.66, y - 0.02, 2.1, house, 0);
      for (let z = 1.66; z < 2.52 && n < 60; n++) {
        const t = 0.03 + r() * 0.035, h = 0.24 + r() * 0.12;
        books.setMatrixAt(n, m4.makeScale(1, h, t).setPosition(-5.66, y + h / 2, z + t / 2));
        books.setColorAt(n, c.setHex(cols[Math.floor(r() * cols.length)]));
        z += t + 0.004;
      }
    }
    books.count = n; books.castShadow = books.receiveShadow = true; house.add(books);
  }
  // yemek masası sandalyeleri
  for (const [x, z, yaw] of [[0.75, -0.3, 0], [2.25, -0.3, 0], [0.75, 1.9, Math.PI], [2.25, 1.9, Math.PI]]) {
    const ch = new THREE.Group();
    box(0.44, 0.04, 0.42, chairW, 0, 0.46, 0, ch, 0.01);
    box(0.4, 0.04, 0.38, cushion, 0, 0.5, 0.01, ch, 0.015);
    box(0.44, 0.42, 0.03, chairW, 0, 0.76, -0.2, ch, 0.01);
    for (const [dx, dz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) cyl(0.018, 0.016, 0.44, chairW, dx, 0.23, dz, ch, 8);
    ch.position.set(x, 0.1, z); ch.rotation.y = yaw; house.add(ch);
  }
  // ocak (cam seramik)
  box(0.6, 0.012, 0.5, mat.plastic({ color: 0x111214, gloss: 0.95 }), 1.9, 0.978, -2.98, house, 0);
  // yatak başlığı, komodinler, abajurlar, gardırop, halı
  box(2.3, 1.0, 0.08, walnut, -4.1, 3.72, -3.28, house, 0.02);
  for (const x of [-5.55, -2.65]) {
    box(0.45, 0.5, 0.4, oak, x, 3.45, -3.05, house, 0.02);
    cyl(0.05, 0.07, 0.22, white, x, 3.81, -3.05, house, 14);
    const shd = cyl(0.13, 0.16, 0.2, mat.fabric({ color: 0xf1e7d0 }), x, 4.0, -3.05, house, 20);
    shd.material.side = THREE.DoubleSide;
  }
  box(0.6, 2.2, 1.6, oak, -1.42, 4.3, 1.2, house, 0.02);
  box(0.01, 2.1, 0.01, walnut, -1.72, 4.3, 1.2, house, 0);
  for (const dz of [-0.07, 0.07]) box(0.03, 0.3, 0.02, mat.brushedMetal({ color: 0xc9cdd1 }), -1.73, 4.4, 1.2 + dz, house, 0);
  box(1.8, 0.015, 1.3, mat.fabric({ color: 0xb9a07a }), -3.9, 3.21, 0.9, house, 0);
  // banyo: duvar fayansı, klozet, lavabo + ayna
  box(4.7, 1.0, 0.015, tiles(0xcfe0e6, 0.2), 1.45, 3.7, -3.34, house, 0);
  box(0.015, 1.0, 3.2, tiles(0xcfe0e6, 0.2), 3.84, 3.7, -1.7, house, 0);
  const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.13, 0], [0.12, 0.2], [0.2, 0.38], [0.19, 0.4], [0.001, 0.4]].map(([a, b]) => new THREE.Vector2(a, b)), 22), white);
  bowl.scale.z = 1.25; bowl.position.set(1.35, 3.2, -2.95); shade(bowl); house.add(bowl);
  box(0.42, 0.4, 0.18, white, 1.35, 3.8, -3.24, house, 0.04);
  box(0.42, 0.14, 0.5, white, 3.6, 4.05, -0.9, house, 0.05);
  cyl(0.06, 0.08, 0.8, white, 3.6, 3.6, -0.9, house, 16);
  box(0.02, 0.8, 0.6, mat.brushedMetal({ color: 0xe8ecef, rough: 0.04 }), 3.83, 4.75, -0.9, house, 0);
}
// Çamaşır makinesi
const washer = new THREE.Group();
box(0.6, 0.85, 0.6, mat.plastic({ color: 0xf8f8f6, gloss: 0.55 }), 0, 0.43, 0, washer, 0.04);
const drumM = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.15, metalness: 0.2 });
const drum = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), drumM);
drum.position.set(0, 0.42, 0.302);
washer.add(drum);
const door = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 10, 28), mat.brushedMetal({ color: 0xbfc4c9, rough: 0.2 }));
door.position.set(0, 0.42, 0.31);
washer.add(door);
box(0.5, 0.08, 0.02, mat.plastic({ color: 0x2a2d31, gloss: 0.4 }), 0, 0.76, 0.3, washer, 0);
washer.position.set(0.2, 3.2, -2.7);
house.add(washer);
info(washer.children[0], '🧺 <b>Çamaşır makinesi:</b> Enerjinin çoğu suyu ısıtmaya gider; 30 °C yıkama 60 °C\'nin yarısından az enerji harcar.');
const washLbl = sim.label('', { parent: washer, position: [0, 1.3, 0.6], className: 'plain' });

// Tabaklar: haftanın 7 günü
const plates = [];
{
  const plateM = mat.ceramic({ color: 0xfbfbf8 });
  const steakM = mat.tissue({ color: 0x6e2a1b, veins: 0.15 }), saladM = mat.foliage({ color: 0x4e9a2e }), tomM = mat.plastic({ color: 0xd62d20, gloss: 0.7 });
  const plateGeo = new THREE.LatheGeometry([[0.001, 0], [0.16, 0], [0.19, 0.015], [0.24, 0.03], [0.245, 0.036], [0.001, 0.012]].map(([a, b]) => new THREE.Vector2(a, b)), 28);
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    const pl = new THREE.Mesh(plateGeo, plateM); pl.position.y = -0.02; g.add(pl);
    const steak = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10), steakM);
    steak.scale.set(1.2, 0.3, 0.9);
    steak.position.y = 0.04;
    g.add(steak);
    const salad = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(k === 4 ? 0.045 : 0.07, 10, 8), k === 4 ? tomM : saladM);
      s.scale.y = k === 4 ? 1 : 0.55;
      s.position.set(Math.cos(k * 1.5) * 0.08, 0.04, Math.sin(k * 1.5) * 0.08);
      salad.add(s);
    }
    g.add(salad);
    g.position.set(0.45 + (i % 4) * 0.7, 0.845, i < 4 ? 0.4 : 1.2);
    shade(g);
    house.add(g);
    plates.push({ steak, salad });
  }
  info(plates[0].steak, '🥩 <b>Et tüketimi:</b> Kırmızı et üretimi (özellikle sığır) çok sera gazı salar; bitkisel ağırlıklı beslenme ayak izini belirgin düşürür.');
}
const plateLbl = sim.label('', { position: [1.5, 1.35, 1.6], className: 'plain' });

// Klima
const acIn = box(1.0, 0.3, 0.24, mat.plastic({ color: 0xf8f8f6, gloss: 0.55 }), -3.5, 5.4, -3.22, house, 0.06);
info(acIn, '❄️ <b>Klima:</b> 1 kW\'lık bir klima günde 8 saat çalışırsa yazın yüzlerce kWh elektrik harcar.');
const acOut = new THREE.Group();
const acFan = outdoorUnit(acOut, 0.4, 0.6, 0.85);
acOut.position.set(-6.75 + 0.05, 4.1, -1.8);
box(0.5, 0.04, 0.9, mat.brushedMetal({ color: 0x9aa0a6 }), 0, -0.02, 0, acOut, 0);
house.add(acOut);

// Ampuller ve ışıklar (sarkıt armatür): armut ampul, parlayan malzeme (mat.glow) + nokta ışık
const BULB = new THREE.LatheGeometry([[0.001, -0.13], [0.04, -0.125], [0.068, -0.09], [0.074, -0.05], [0.055, -0.005], [0.03, 0.025], [0.027, 0.05], [0.001, 0.05]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
const bulbs = [];
for (const [x, y] of [[-3.5, 2.7], [1.5, 2.7], [-3.5, 5.7], [1.5, 5.7]]) {
  cyl(0.006, 0.006, 0.25, mat.plastic({ color: 0x111111 }), x, y + 0.2, 0);
  const shadeM = new THREE.Mesh(new THREE.LatheGeometry([[0.03, 0.12], [0.06, 0.1], [0.22, -0.04], [0.23, -0.05]].map(([a, b]) => new THREE.Vector2(a, b)), 24), mat.paintedMetal({ color: 0x2f3337, wear: 0.05 }));
  shadeM.material.side = THREE.DoubleSide;
  shadeM.position.set(x, y + 0.05, 0); house.add(shadeM);
  cyl(0.028, 0.028, 0.06, mat.brushedMetal({ color: 0xb08d57, rough: 0.3 }), x, y + 0.08, 0, house, 14); // duy
  const b = new THREE.Mesh(BULB, mat.glow({ color: 0xffc46b, intensity: 5 }));
  b.position.set(x, y, 0);
  house.add(b);
  const l = new THREE.PointLight(0xffffff, 2, 7, 1.6);
  l.position.set(x, y - 0.3, 0.5);
  house.add(l);
  bulbs.push({ b, l });
  info(b, '💡 <b>Ampul:</b> Akkor ampul enerjinin çoğunu ısıya çevirir; LED aynı ışığı ~8 kat daha az elektrikle verir.');
}

// --- Garaj ve ulaşım ---
const garage = new THREE.Group();
garage.position.y = 0.17;
scene.add(garage);
box(5.2, 0.12, 6.6, concreteM, 6.7, 0.06, 0.2, garage, 0.02);
box(5, 3, 0.25, wallM, 6.7, 1.5, -3.05, garage, 0.02);
box(0.25, 3, 6.6, wallM, 9.2, 1.5, 0.2, garage, 0.02);
box(5.5, 0.25, 7, concreteM, 6.8, 3.1, 0.2, garage, 0.04);
box(5.6, 0.12, 0.2, mat.paintedMetal({ color: 0x3b3f44, wear: 0.2 }), 6.8, 2.95, 3.55, garage, 0.03); // kepenk kasası
const car = makeEV('hatch', 0xb3261e, { petrol: true });
car.position.set(6.7, 0.12, 0.6); car.rotation.y = Math.PI / 2;
garage.add(car);
info(car.userData.body, '🚗 <b>Benzinli araba:</b> Tek kişiyle kilometre başına ≈170 g CO₂; günde 25 km yılda 1,5 tondan fazla eder.');
// Güneş paneli inverteri (garaj arka duvarı) + çatıdan inen DC kablo kanalı: panelle birlikte görünür
const solarKit = new THREE.Group();
garage.add(solarKit);
box(0.46, 0.62, 0.17, mat.paintedMetal({ color: 0xe9ebec, wear: 0.05 }), 7.9, 1.75, -2.84, solarKit, 0.03);
box(0.16, 0.07, 0.01, mat.glow({ color: 0x22c55e, intensity: 2 }), 7.9, 1.9, -2.75, solarKit, 0);
box(0.3, 0.04, 0.12, mat.plastic({ color: 0x3a3d40, gloss: 0.3 }), 7.9, 1.42, -2.84, solarKit, 0.01);
cyl(0.025, 0.025, 1.0, mat.plastic({ color: 0xdcdcd8, gloss: 0.3 }), 7.9, 2.56, -2.88, solarKit, 10);
info(solarKit.children[0], '☀️ <b>İnverter:</b> Panellerin doğru akımını (DC) evde kullanılan alternatif akıma (AC) çevirir.');
const ev = makeEV('hatch', 0x0e9f9a);
ev.position.set(6.7, 0.12, 0.6); ev.rotation.y = Math.PI / 2;
garage.add(ev);
const charger = new THREE.Group();
box(0.34, 0.46, 0.14, mat.plastic({ color: 0xeceded, gloss: 0.4 }), 0, 0, 0, charger, 0.04);
box(0.03, 0.18, 0.02, mat.glow({ color: 0x22c55e, intensity: 3 }), 0, 0.05, 0.075, charger, 0);
const chCable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.2, 0.05), new THREE.Vector3(0.05, -0.8, 0.3), new THREE.Vector3(-0.4, -0.6, 0.9), new THREE.Vector3(-0.85, -0.3, 1.35)]), 20, 0.025, 8), mat.rubber({ color: 0x161616 }));
charger.add(chCable);
charger.rotation.y = -Math.PI / 2;
charger.position.set(9.05, 1.2, -1.2);
garage.add(charger);
info(ev.userData.body, '🔌 <b>Elektrikli araba:</b> Egzozu yok; salımı şebeke elektriğinden gelir (≈80 g/km). Güneş paneliyle şarj edilirse daha da azalır.');
const bike = bicycle(0x1f5fbf);
bike.rotation.y = Math.PI / 2;
bike.position.set(5.6, 0.12, 0.8);
garage.add(bike);
info(bike.children[2], '🚲 <b>Bisiklet:</b> Neredeyse sıfır salım, üstelik sağlıklı! Kısa mesafelerde en iyi seçenek.');
const busStop = new THREE.Group();
{
  const steel = mat.paintedMetal({ color: 0x5b6470, wear: 0.2 });
  cyl(0.05, 0.05, 2.6, steel, 0, 1.3, 0, busStop, 12);
  const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 28).rotateX(Math.PI / 2), mat.paintedMetal({ color: 0x16a34a, wear: 0.05 }));
  sign.position.set(0, 2.55, 0.03); busStop.add(sign);
  const sh = new THREE.Group(); sh.position.set(1.8, 0, -0.1); busStop.add(sh);
  for (const x of [-1.2, 1.2]) box(0.08, 2.4, 0.08, steel, x, 1.2, -0.5, sh, 0.02);
  box(2.6, 0.08, 1.3, steel, 0, 2.44, -0.1, sh, 0.02);
  const pane = new THREE.MeshPhysicalMaterial({ color: 0xdfeeee, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false });
  box(2.4, 1.9, 0.02, pane, 0, 1.3, -0.52, sh, 0);
  box(1.8, 0.06, 0.4, mat.wood({ color: 0x8a5a33, ring: 10 }), 0, 0.48, -0.3, sh, 0.02);
  for (const x of [-0.8, 0.8]) box(0.05, 0.45, 0.05, steel, x, 0.24, -0.3, sh, 0);
  busStop.position.set(-8, 0.15, 10.2);
  scene.add(busStop);
}
const bus = cityBus(0x2563eb);
bus.rotation.y = Math.PI; // sağ şeritte −x yönüne gider
bus.position.set(40, 0, ZR - 2);
scene.add(bus);
info(bus.children[0], '🚌 <b>Toplu taşıma:</b> Bir otobüs onlarca kişiyi taşır; kişi başı salım arabanın yaklaşık üçte biri.');

// --- Uçak (yıllık uçuşlar): alçak irtifada geçen yolcu uçağı ---
const plane = airliner(0xdc2626);
plane.position.set(-300, 58, -230);
scene.add(plane);
info(plane.children[0], '✈️ <b>Uçuşlar:</b> Bir gidiş-dönüş (~2.000 km) uçuş kişi başı yaklaşık 0,3 t CO₂e demektir; yüksek irtifa etkileriyle daha da fazla olabilir.');

// --- Geri dönüşüm ---
const bins = new THREE.Group();
[[0x2563eb, 'Kâğıt'], [0xeab308, 'Plastik'], [0x16a34a, 'Cam']].forEach(([c], i) => {
  const b = wheelieBin(c); b.position.set(i * 0.9, 0, 0); bins.add(b);
});
bins.position.set(-10.3, 0.17, 3);
scene.add(bins);
info(bins.children[0].children[0], '♻️ <b>Geri dönüşüm:</b> Kâğıt, cam, metal ve plastiği ayırmak yeni malzeme üretimindeki enerjiyi azaltır.');
const trash = new THREE.Group();
for (let i = 0; i < 6; i++) {
  const s = trashBag();
  s.position.set((i % 3) * 0.7, 0.32 + Math.floor(i / 3) * 0.5, (i % 2) * 0.3);
  s.rotation.y = i * 1.7;
  trash.add(s);
}
trash.position.set(-10.3, 0.17, 3);
scene.add(trash);
info(trash.children[0].children[0], '🗑️ <b>Karışık çöp:</b> Ayrıştırılmayan atık depolama alanında metan (güçlü bir sera gazı) üretebilir.');

// --- Fidanlık: gereken ağaç sayısı (her fidan = 10 ağaç) ---
const MAX_TREES = 160;
const forest = new THREE.Group();
forest.position.y = 0.17;
scene.add(forest);
const forestParts = [];
{
  const src = createVegetation(() => 10, { rect: [0, 0, 1, 1], trees: 12, rocks: 0, kinds: { oak: 0.3, broad: 0.3, fruit: 0.2, cypress: 0.2 }, seed: 4 });
  const kinds = src.group.children.filter((c) => c.isInstancedMesh);
  forest.userData.veg = src;
  const rnd = seeded(7), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const spots = [];
  while (spots.length < MAX_TREES) {
    const x = (rnd() - 0.5) * 56, z = -8.5 - rnd() * 26;
    if (spots.some(([a, b]) => Math.hypot(a - x, b - z) < 1.7)) continue;
    spots.push([x, z]);
  }
  spots.sort((a, b) => Math.hypot(a[0] + 15, a[1] + 11) - Math.hypot(b[0] + 15, b[1] + 11));
  const per = kinds.map(() => []);
  spots.forEach((sp, i) => per[i % kinds.length].push([...sp, i]));
  kinds.forEach((k, j) => {
    const im = new THREE.InstancedMesh(k.geometry, k.material, per[j].length);
    per[j].forEach(([x, z], n) => {
      const sc = 0.32 + rnd() * 0.12;
      im.setMatrixAt(n, m4.compose(p.set(x, 0, z), q.setFromAxisAngle(up, rnd() * 6.28), s.set(sc, sc * (0.9 + rnd() * 0.2), sc)));
    });
    im.castShadow = im.receiveShadow = true; im.userData.noFit = true;
    forest.add(im);
    forestParts.push({ im, idx: per[j].map((t) => t[2]) });
  });
  // Fidan destek kazıkları yerine hafif malç halkaları
}
const forestLbl = sim.label('', { position: [-15, 5.4, -11], className: 'big' });
function setForest(n) {
  for (const f of forestParts) { let c = 0; while (c < f.idx.length && f.idx[c] < n) c++; f.im.count = c; }
}

// --- CO₂ bulutu (yumuşak, ışık alan duman parçacıkları; gerçekte CO₂ görünmez) ---
const puffSys = createSmoke(900);
scene.add(puffSys.mesh);
puffSys.wind.set(0.4, 0, 0.1);
const cloud = new THREE.Group();
const cloudM = new THREE.MeshBasicMaterial({ visible: false, color: 0x6b7280 });
const cloudHit = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8), cloudM);
cloudHit.scale.set(1.5, 0.8, 1);
cloud.add(cloudHit);
cloud.position.set(-1, 13.2, 0);
scene.add(cloud);
info(cloud.children[0], '☁️ <b>CO₂ bulutu:</b> Gerçekte CO₂ görünmez! Burada yıllık salımının büyüklüğünü göstermek için çizildi.');
const cloudLbl = sim.label('', { parent: cloud, position: [0, 2.3, 0], className: 'big' });

// --- Parçacıklar: ısı kaybı ve klima havası (yumuşak yuvarlak, toplamalı; renk → siyah = görünmez) ---
function emitter(n, size) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: softDot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  scene.add(pts);
  const P = Array.from({ length: n }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), life: 0, max: 1 }));
  return { pts, P, acc: 0 };
}
const heatFx = emitter(220, 0.45);
const airFx = emitter(60, 0.26);
const HEAT_RGB = [3, 1.2, 0.25], AIR_RGB = [0.9, 1.6, 2.2];
function spawnHeat(q) {
  const r = Math.random();
  if (r < 0.4) { q.p.set(rand(-6, 4), rand(0.2, 6), -3.8); q.v.set(0, 0.25, -0.8); }
  else if (r < 0.6) { q.p.set(-6.3, rand(0.2, 6), rand(-3.3, 3.3)); q.v.set(-0.8, 0.25, 0); }
  else if (r < 0.7) { q.p.set(4.3, rand(3.3, 6), rand(-3.3, 3.3)); q.v.set(0.8, 0.25, 0); }
  else { const z = rand(-3.8, 3.8); q.p.set(rand(-6, 4), 8.8 - Math.abs(z) * 0.7 + 0.2, z); q.v.set(0, 0.8, Math.sign(z) * 0.3); }
  q.max = rand(1.4, 2.4);
}
function spawnAir(q) { q.p.set(rand(-3.9, -3.1), 5.25, -3.05); q.v.set(rand(-0.1, 0.1), -0.5, 0.9); q.max = rand(1, 1.8); }
function stepFx(fx, rate, dt, spawn, rgb) {
  fx.acc += rate * dt;
  const pos = fx.pts.geometry.attributes.position.array, col = fx.pts.geometry.attributes.color.array;
  fx.P.forEach((q, i) => {
    if (q.life <= 0 && fx.acc >= 1) { fx.acc -= 1; spawn(q); q.life = q.max; }
    if (q.life > 0) { q.life -= dt; q.p.addScaledVector(q.v, dt); }
    const a = q.life > 0 ? Math.sin((q.life / q.max) * Math.PI) : 0;
    pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.life > 0 ? q.p.y : -99; pos[i * 3 + 2] = q.p.z;
    col[i * 3] = rgb[0] * a; col[i * 3 + 1] = rgb[1] * a; col[i * 3 + 2] = rgb[2] * a;
  });
  fx.acc = Math.min(fx.acc, 5);
  fx.pts.geometry.attributes.position.needsUpdate = true;
  fx.pts.geometry.attributes.color.needsUpdate = true;
}
let puffAcc = 0, exhAcc = 0, cloudAcc = 0;

// --- Durum ve hesap ---
const DEF = { heat: 'gas', ins: 1, bulb: 'akkor', ac: 4, wash: 40, meat: 4, trans: 'car', km: 25, fly: 1, solar: false, recycle: false };
const S = { ...DEF };

function compute() {
  const demand = K.heatDemand * INSUL[S.ins];
  let heat = 0, hpKwh = 0;
  if (S.heat === 'gas') heat = demand * K.gas;
  else if (S.heat === 'coal') heat = demand * K.coal;
  else { hpKwh = demand / K.heatPumpCOP; heat = hpKwh * K.grid; }
  const lightKwh = (10 * (S.bulb === 'akkor' ? 60 : 8) * 4 * 365) / 1000 / PEOPLE;
  const acKwh = (S.ac * 1.0 * 100) / PEOPLE;
  const washKwh = (208 * WASH_KWH[S.wash]) / PEOPLE;
  const baseKwh = 1500 / PEOPLE;
  const elecKwh = lightKwh + acKwh + washKwh + baseKwh;
  const evKwh = S.trans === 'ev' ? S.km * 365 * 0.18 : 0;
  let elec = elecKwh * K.grid;
  const food = 1300 + 1400 * (S.meat / 7);
  const perKm = { car: K.car, ev: K.ev, bus: K.bus, bike: K.bike }[S.trans];
  let trans = S.km * 365 * perKm;
  const other = S.recycle ? 1050 : 1200;
  // Güneş: 3 kW × ~1.350 kWh/kWp ≈ 4.000 kWh/yıl (hane), kişi payı; yalnızca evde tüketilen elektriği karşılar
  let solarSave = 0;
  if (S.solar) {
    const prod = 4000 / PEOPLE;
    const use = elecKwh + hpKwh + evKwh;
    solarSave = Math.min(prod, use) * K.grid;
  }
  const fly = S.fly * K.flight * 1000;
  const kg = { heat, elec, food, trans, fly, other };
  // Güneş kazancını elektrik tüketen kalemlerden sırayla düş
  let rest = solarSave;
  const takeFrom = (key, max) => { const t = Math.min(rest, max); kg[key] -= t; rest -= t; };
  takeFrom('elec', elec);
  if (S.heat === 'hp') takeFrom('heat', hpKwh * K.grid);
  if (S.trans === 'ev') takeFrom('trans', evKwh * K.grid);
  const t = Object.fromEntries(Object.entries(kg).map(([k, v]) => [k, v / 1000]));
  t.total = Object.values(kg).reduce((a, b) => a + b, 0) / 1000;
  t.solar = solarSave / 1000;
  t.lossRate = demand / K.heatDemand;
  return t;
}
let R = compute();

// --- Görsel güncelleme ---
const cloudTarget = { s: 1, c: new THREE.Color() };
function applyVisuals() {
  const th = [0, 0.14, 0.28][S.ins];
  setInsulation(th);
  insLbl.setText(S.ins ? `🧱 Mantolama ${Math.round(th * 100)} cm · çift cam` : '🧱 Yalıtımsız duvar · tek cam');
  frames.visible = S.ins > 0;
  kombi.visible = S.heat === 'gas';
  stove.visible = S.heat === 'coal';
  heatPump.visible = S.heat === 'hp';
  radiators.visible = S.heat !== 'coal';
  const warm = S.bulb === 'akkor';
  bulbs.forEach(({ b, l }) => { b.material.emissive.setHex(warm ? 0xffc46b : 0xf4f8ff); l.color.setHex(warm ? 0xffa64d : 0xe6f0ff); l.intensity = warm ? 2.6 : 2.2; });
  acOut.visible = S.ac > 0;
  drumM.color.copy(new THREE.Color(0x60a5fa).lerp(new THREE.Color(0xef4444), (S.wash - 30) / 60));
  washLbl.setText(`${S.wash} °C`);
  plates.forEach((p, i) => { p.steak.visible = i < S.meat; p.salad.visible = i >= S.meat; });
  plateLbl.setText(`🥩 ${S.meat} gün · 🥗 ${7 - S.meat} gün`);
  car.visible = S.trans === 'car';
  ev.visible = S.trans === 'ev';
  charger.visible = S.trans === 'ev';
  bike.visible = S.trans === 'bike' || S.trans === 'bus';
  bike.position.x = S.trans === 'bike' ? 6.7 : 5.2;
  busStop.visible = bus.visible = S.trans === 'bus';
  plane.visible = S.fly > 0;
  solar.visible = solarKit.visible = S.solar;
  bins.visible = S.recycle;
  trash.visible = !S.recycle;
  cloudTarget.s = Math.cbrt(Math.max(R.total, 0.2) / TR_AVG) * 1.25;
  cloudTarget.c.setHex(0x9ca3af).lerp(new THREE.Color(0x1f2937), clamp((R.total - 2) / 8, 0, 1));
  const trees = Math.round((R.total * 1000) / K.treeKg);
  const icons = Math.min(MAX_TREES, Math.round(trees / 10));
  setForest(icons);
  forestLbl.setText(`🌳 ${fmt(trees)} ağaç gerekir`);
  cloudLbl.setText(`${fmt(R.total, 1)} t CO₂e / yıl`);
}

// --- Animasyon ---
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), c3 = new THREE.Color();
let busX = 40, clock = 0;
sim.onUpdate((dt) => {
  clock += dt;
  // Isı kaybı: yalıtım ve ısınma ihtiyacıyla orantılı
  stepFx(heatFx, 40 * R.lossRate ** 2, dt, spawnHeat, HEAT_RGB);
  stepFx(airFx, S.ac * 3, dt, spawnAir, AIR_RGB);
  // Baca dumanı (kömür: koyu ve yoğun, kombi: ince beyaz buhar)
  const coal = S.heat === 'coal';
  puffAcc = Math.min(puffAcc + (coal ? 9 : S.heat === 'gas' ? 2.5 : 0) * dt, 3);
  while (puffAcc >= 1) {
    puffAcc -= 1;
    puffSys.emit(-4.2 + rand(-0.05, 0.05), 9.9, -1.6, 0.3, 0.9, 0, coal ? { s0: 0.45, s1: 3.2, life: 4, a: 0.75, alb: 0.16, rise: 0.7, drag: 0.5 } : { s0: 0.3, s1: 1.8, life: 3, a: 0.35, alb: 0.9, rise: 0.8, drag: 0.5 });
  }
  // Egzoz (benzinli araba çalışırken)
  if (S.trans === 'car') {
    exhAcc = Math.min(exhAcc + dt * 3, 2);
    while (exhAcc >= 1) { exhAcc -= 1; puffSys.emit(7.14, 0.57, 2.72, 0, 0.1, 0.8, { s0: 0.12, s1: 0.9, life: 2.2, a: 0.28, alb: 0.75, rise: 0.25, drag: 0.8 }); }
  }
  // CO₂ bulutu: toplam salımla büyüyen, koyulaşan yumuşak bulut
  {
    const sc = cloud.scale.x, alb = 0.15 + 0.75 * Math.max(0, cloudM.color.r * 0.3 + cloudM.color.g * 0.6 + cloudM.color.b * 0.1) / 0.36;
    cloudAcc = Math.min(cloudAcc + dt * 34, 6);
    while (cloudAcc >= 1) {
      cloudAcc -= 1;
      const u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1), r = Math.cbrt(Math.random());
      const x = Math.sin(v) * Math.cos(u) * r * 3.1 * sc, y = Math.cos(v) * r * 1.3 * sc, z = Math.sin(v) * Math.sin(u) * r * 2.1 * sc;
      puffSys.emit(cloud.position.x + x, cloud.position.y + y, cloud.position.z + z, rand(-0.1, 0.1), 0, rand(-0.1, 0.1),
        { s0: 1.4 * sc, s1: 2.6 * sc, life: 3.2, a: 0.55, alb: Math.min(0.9, alb), rise: 0, drag: 2 });
    }
  }
  // Uçak gökyüzünden geçer (uçuş sayısı arttıkça daha sık)
  if (S.fly > 0) { plane.position.x += dt * (5 + S.fly * 1.5) * 7; if (plane.position.x > 320) plane.position.x = -320; }
  // Otobüs geçer
  if (S.trans === 'bus') {
    const stopX = -6.5;
    const dx = Math.abs(busX - stopX) < 0.3 && (clock % 8) < 3 ? 0 : 6;
    busX -= dx * dt;
    if (busX < -40) busX = 40;
    bus.position.x = busX;
  }
});

sim.onRender((dt) => {
  hpFan.rotation.z += dt * 12 * (S.heat === 'hp' ? 1 : 0);
  acFan.rotation.z += dt * (4 + S.ac * 2);
  drum.rotation.z += dt * 5;
  flame.scale.y = 0.8 + Math.random() * 0.4;
  coalGlow.material.emissive.setHSL(0.06, 1, 0.45 + Math.random() * 0.1);
  const s = lerp(cloud.scale.x, cloudTarget.s, Math.min(1, dt * 3));
  cloud.scale.setScalar(s);
  cloud.position.y = 12.8 + s * 1.2 + Math.sin(performance.now() / 900) * 0.15;
  cloudM.color.lerp(cloudTarget.c, Math.min(1, dt * 3));
  puffSys.update(dt); puffSys.light(sim.sky, sim.camera);
  forest.userData.veg.update(sim.time, 0.5); veg.update(sim.time, 0.5);
  yardT.update(sim.time, 0.5); yardS.update(sim.time, 0.4); lawnTufts.update(sim.time, 0.5); city.update(sim.time, 0.5);
});

// --- Panel ---
const ui = sim.ui;
ui.section('🏠 Isınma ve yalıtım');
const cHeat = ui.segmented({ label: 'Isınma', options: [{ value: 'gas', label: '🔥 Kombi' }, { value: 'hp', label: '♨️ Isı pompası' }, { value: 'coal', label: '⚫ Soba' }], value: S.heat, onChange: (v) => set({ heat: v }) });
const cIns = ui.segmented({ label: 'Yalıtım (mantolama, çift cam)', options: [{ value: 0, label: 'Yok' }, { value: 1, label: 'Orta' }, { value: 2, label: 'İyi' }], value: S.ins, onChange: (v) => set({ ins: v }) });
ui.section('💡 Elektrik');
const cBulb = ui.segmented({ label: 'Ampuller', options: [{ value: 'akkor', label: 'Akkor (60 W)' }, { value: 'led', label: 'LED (8 W)' }], value: S.bulb, onChange: (v) => set({ bulb: v }) });
const cAc = ui.slider({ label: 'Klima (yazın, günde)', min: 0, max: 12, step: 1, value: S.ac, unit: 'saat', onInput: (v) => set({ ac: v }) });
const cWash = ui.segmented({ label: 'Çamaşır sıcaklığı', options: [30, 40, 60, 90].map((v) => ({ value: v, label: `${v} °C` })), value: S.wash, onChange: (v) => set({ wash: v }) });
const cSolar = ui.toggle({ label: '☀️ Çatıda güneş paneli (3 kW)', value: S.solar, onChange: (v) => set({ solar: v }) });
ui.section('🍽️ Beslenme ve atık');
const cMeat = ui.slider({ label: 'Haftada kaç gün et?', min: 0, max: 7, step: 1, value: S.meat, format: (v) => `${v} gün`, onInput: (v) => set({ meat: v }) });
const cRec = ui.toggle({ label: '♻️ Geri dönüşüm yapıyorum', value: S.recycle, onChange: (v) => set({ recycle: v }) });
ui.section('🚗 Ulaşım');
const cTrans = ui.segmented({ label: 'Günlük ulaşım', options: [{ value: 'car', label: '🚗 Araba' }, { value: 'ev', label: '🔌 E-araba' }, { value: 'bus', label: '🚌 Toplu' }, { value: 'bike', label: '🚲 Bisiklet' }], value: S.trans, onChange: (v) => set({ trans: v }) });
const cKm = ui.slider({ label: 'Günde yol', min: 0, max: 80, step: 1, value: S.km, unit: 'km', onInput: (v) => set({ km: v }) });
const cFly = ui.slider({ label: '✈️ Yılda uçuş (gidiş-dönüş)', min: 0, max: 10, step: 1, value: S.fly, format: (v) => `${v} kez`, onInput: (v) => set({ fly: v }) });
ui.section('⚡ Hazır evler');
ui.buttons([
  { label: '🌍 Yeşil ev', variant: 'good', onClick: () => set({ heat: 'hp', ins: 2, bulb: 'led', ac: 1, wash: 30, meat: 1, trans: 'bike', km: 10, fly: 0, solar: true, recycle: true }, true) },
  { label: '🏭 Yüksek karbon', variant: 'danger', onClick: () => set({ heat: 'coal', ins: 0, bulb: 'akkor', ac: 10, wash: 90, meat: 7, trans: 'car', km: 60, fly: 6, solar: false, recycle: false }, true) },
  { label: '↩ Ortalama ev', onClick: () => set({ ...DEF }, true) },
]);

ui.section('📊 Yıllık karbon ayak izi (kişi başı)');
const stTotal = ui.stat({ label: 'Toplam', unit: 't CO₂e' });
const stTrees = ui.stat({ label: 'Gereken ağaç', unit: 'adet' });
const stTarget = ui.stat({ label: '1,5 °C hedefinin', unit: 'katı' });
const stTR = ui.stat({ label: 'Türkiye ort. (≈6,6 t)', unit: '' });
const bar = makePlot(ui, { title: 'Kategori dağılımı (yaklaşık, ton)', height: 64, legend: CATS });
const meters = CATS.map((c) => ui.meter({ label: c.name, color: c.color }));
const solarMeter = ui.meter({ label: '☀️ Güneş panelinin kazandırdığı', color: '#34d399' });
const hist = ui.chart({ title: 'Değişikliklerinin etkisi (t CO₂e / yıl)', series: [{ name: 'Senin evin', color: '#f97316', fill: true }, { name: '1,5 °C hedefi ≈2 t', color: '#22c55e' }, { name: 'Türkiye ort. ≈6,6 t', color: '#94a3b8' }], maxPoints: 120, yMin: 0, yMax: 16 });
const tip = ui.text('', 'card');
ui.text('<small>Tüm katsayılar yaklaşık ve eğitim amaçlıdır. Evdeki nesnelere tıklayarak açıklamalarını gör.</small>');

const TIPS = {
  heat: 'En büyük payın <b>ısınma</b>. Yalıtım ve ısı pompası en etkili adımlar; termostatı 1 °C düşürmek de işe yarar.',
  elec: 'En büyük payın <b>elektrik</b>. LED ampul, daha az klima ve güneş paneli dene.',
  food: 'En büyük payın <b>beslenme</b>. Haftada birkaç gün et yerine baklagil (mercimek, nohut) seçmek büyük fark yaratır.',
  trans: 'En büyük payın <b>ulaşım</b>. Kısa yolları yürüyerek ya da bisikletle, uzunları toplu taşımayla yap.',
  fly: 'En büyük payın <b>uçuşlar</b>. Yakın yerlere trenle ya da otobüsle gitmek, uçuşları azaltmak büyük fark yaratır.',
  other: 'En büyük payın <b>tüketim</b>. Daha az ama uzun ömürlü eşya almak, onarmak ve geri dönüştürmek yardımcı olur.',
};

function refreshPanel() {
  const tone = R.total <= 2.5 ? 'good' : R.total <= TR_AVG ? 'warn' : 'bad';
  stTotal.set(fmt(R.total, 2), tone);
  const trees = Math.round((R.total * 1000) / K.treeKg);
  stTrees.set(fmt(trees), tone);
  stTarget.set(fmt(R.total / TARGET, 1) + '×', tone);
  const d = R.total - TR_AVG;
  stTR.set(`${d > 0 ? '+' : ''}${fmt(d, 1)} t`, d > 0 ? 'bad' : 'good');
  CATS.forEach((c, i) => meters[i].set(R[c.key] / 4, `${fmt(R[c.key], 2)} t`));
  solarMeter.set(R.solar / 1, R.solar ? `−${fmt(R.solar, 2)} t` : 'panel yok');
  let x = 0;
  const hbars = CATS.map((c) => { const b = { x0: x, x1: x + Math.max(0, R[c.key]), y0: 0.15, y1: 0.85, color: c.color }; x = b.x1; return b; });
  bar.set({ xMin: 0, xMax: 16, yMin: 0, yMax: 1, yTicks: [], xTicks: [0, 4, 8, 12, 16], xFmt: (v) => `${v} t`, padLeft: 8, hbars,
    vlines: [{ x: TARGET, color: '#22c55e', text: '1,5 °C' }, { x: TR_AVG, color: '#e2e8f0', text: 'TR' }] });
  const big = CATS.reduce((a, c) => (R[c.key] > R[a.key] ? c : a), CATS[0]);
  tip.set(`💡 ${TIPS[big.key]}${R.total <= 2.3 ? '<br>🎉 Harika! 1,5 °C hedefine çok yakınsın.' : ''}`);
}

function set(patch, syncUi = false) {
  Object.assign(S, patch);
  R = compute();
  applyVisuals();
  refreshPanel();
  if (syncUi) {
    cHeat.set(S.heat); cIns.set(S.ins); cBulb.set(S.bulb); cAc.set(S.ac); cWash.set(S.wash); cSolar.set(S.solar);
    cMeat.set(S.meat); cRec.set(S.recycle); cTrans.set(S.trans); cKm.set(S.km); cFly.set(S.fly);
  }
}

let histT = 0;
sim.onUpdate((dt) => {
  histT += dt;
  if (histT > 0.5) { histT = 0; hist.push([R.total, TARGET, TR_AVG]); }
});

sim.onClick(clickables, (hit) => {
  let o = hit.object;
  while (o && !o.userData.info) o = o.parent;
  if (o) sim.toast(o.userData.info);
});

sim.formatTime = () => `${fmt(R.total, 1)} t CO₂e / yıl`;
sim.onReset(() => { set({ ...DEF }, true); hist.clear(); busX = 40; });
set({ ...DEF });
sim.hud.show('🏡 Evdeki tercihlerini değiştir, <b>CO₂ bulutunu</b> küçült! Nesnelere tıklayarak öğren.', { timeout: 6000 });
