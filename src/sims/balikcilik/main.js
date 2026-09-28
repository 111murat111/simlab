// Balıkçılık ve Ortak Kaynaklar — Schaefer artık üretim modeli, MSY, kota, av yasağı, koruma alanı ve açık erişim (ortakların trajedisi).
// Görsel: gerçek ölçekli körfez (metre). Model birimi 1 = 25 m: av sahası yarıçapı ≈ 325 m, limanlar kıyıda ≈ 600 m uzakta.
import { createSim, THREE, BufferGeometryUtils, fmt, clamp, instanced, seeded, TAU, smoothstep, lerp, mat, procedural, RoundedBoxGeometry,
  landscape, createTerrain, terrainSkirt, terrainMaterial, createVegetation, depthTexture, populateCity, streetLamps, crowd } from '@core';
import { createModel, K, Q, H, FLEETS, MAXB } from './model.js';
import { sweep, boatHullGeometry, boatBandGeometry, boatDeckGeometry, boatUpperGeometries, hullPaint, workPaint, bandPaint,
  deckPlanks, quayStone, gullGeometries } from './kit.js';

const YEARS_PER_SEC = 0.5;   // 1× hızda 1 sn = 0,5 yıl
const MAXFISH = 700;
const GR = 13;               // av sahası yarıçapı (model birimi)
const U = 25;                // 1 model birimi = 25 m
const FLEET_COLORS = [0xc8322b, 0xe0b21a, 0x2f8a3e];
const FLEET_CSS = ['#ef4444', '#facc15', '#22c55e'];
const PORTS = [[-17, 6], [2, -18], [19, 9]];   // uzaklık: yakın < orta < uzak
const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;

const sim = createSim({
  sky: { elevation: 30, azimuth: 130, clouds: 0.3, haze: 1.3, visibility: 12000 },
  ocean: { wind: 5.5, windDir: 210, fetch: 35, chop: 0.75, foam: 0.35 },
  camera: { position: [-600, 15, 400], target: [-620, 4, 230], fov: 46, near: 0.5, far: 80000 },
  controls: { maxDistance: 5000, minDistance: 6, maxPolarAngle: 1.5 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bir körfezin ortasındaki av sahasında tek bir balık stoku var. Suyun altındaki koyu lekeler <b>balık sürüleridir</b>;
    sürü sayısı ve büyüklüğü stok büyüklüğünü gösterir (<b>Su altı</b> görünümünde balıkların kendisini görebilirsin).
    Üç limandan (kırmızı, sarı, yeşil bayraklı) tekneler aynı stoğu avlar. Uzak limanın tekneleri daha çok yakıt harcar, yani
    tekne başına maliyetleri daha yüksektir. Sarı şamandıralarla çevrili yeşil dilim <b>koruma alanıdır</b>: orada avlanılmaz,
    balıklar oradan av sahasına taşar.</p>
    <h3>Model: Schaefer artık üretim modeli</h3>
    <p><b>dB/dt = r·B·(1 − B/K) − q·E·B</b>. B stok, K taşıma kapasitesi, r türün büyüme hızı, E av çabası (tekne sayısı),
    q yakalama katsayısı. Stoğun doğal artışı (<i>artık üretim</i>) en çok <b>B = K/2</b>'de olur; buradan sürekli alınabilecek
    en yüksek av <b>MSY = r·K/4</b>'tür (en yüksek sürdürülebilir verim). Sabit çaba ile denge stoğu B* = K·(1 − qE/r)'dir;
    <b>qE ≥ r</b> olursa stok sıfıra gider. Sabit bir <b>kota</b> (TAC) MSY'nin üstündeyse ya da stok K/2'nin altına düşmüşse,
    kota da stoğu çökertebilir.</p>
    <p><b>Açık erişim (Gordon–Schaefer):</b> kimse kaynağın sahibi değilse, kâr olduğu sürece yeni tekneler gelir. Filo, kâr
    sıfırlanana kadar büyür; denge stoğu B = c/(p·q) olur. Her balıkçı için mantıklı olan, topluluk için kötü sonuç verir:
    <b>ortakların trajedisi</b> (Hardin, 1968). Kota tek başına tekne yarışını durdurmaz: sezon kısalır, maliyet aynı kalır.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Açık erişim</b>: önce kâr yüksektir, tekneler çoğalır; stok düşer, kâr erir. Uzak liman ilk çekilen olur.</li>
      <li><b>MSY kotası</b>'nda "çevresel dalgalanma"yı %20'ye çıkar: kötü birkaç yıl stoğu K/2'nin altına iterse sabit kota
        stoğu dibe çeker. Kotayı %20 düşür, farkı gör.</li>
      <li><b>Aşırı avlanma</b>'da (120 tekne, qE > r) stoğun çöküşünü izle; sonra teknelerin yarısını çek: stok geri döner mi?</li>
      <li>r'yi 0,2'ye indir (yavaş büyüyen, uzun ömürlü tür): aynı filo çok daha hızlı çöküş yaratır.</li>
      <li>Aynı filoyla <b>koruma alanını</b> %0 ve %30 yaparak karşılaştır.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Kanada'nın Newfoundland açıklarındaki kuzey Atlantik morinası (cod) stoku onlarca yıllık aşırı avcılıktan sonra çöktü;
    hükümet <b>1992</b>'de av yasağı (moratoryum) ilan etti. Yumurtlayan stokun tarihsel düzeyinin yaklaşık <b>%1</b>'ine düştüğü
    tahmin edilir ve yaklaşık <b>30.000'den fazla</b> balıkçı ve fabrika işçisi işini kaybetti. Stok, yasaktan sonra onlarca yıl
    beklenen hızda toparlanmadı. (Kaynak: Wikipedia, "Collapse of the Atlantic northwest cod fishery"; Britannica, "Cod fishery
    collapse of 1992".)</p>
    <p><small>Sınırlar: Tek türlü, yaş yapısız, deterministik bir modeldir (isteğe bağlı çevresel gürültü hariç). K, q, fiyat ve
    maliyetler <b>temsilidir</b>; para birimi yalnız karşılaştırma içindir. Gerçek stok değerlendirmeleri yaş yapılı modeller,
    belirsizlik ve ihtiyat payı kullanır. Sahne temsilidir: gerçek av sahaları çok daha geniştir; zaman hızlandırıldığı için
    tekneler gerçekte olduğundan hızlı gider.</small></p>`,
});
sim.formatTime = () => `${Math.floor(model.t) + 1}. yıl · ${['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][Math.floor((model.t % 1) * 12)]}`;

const model = createModel(seeded(42));
const scene = sim.scene;

// --- Körfez: güneye açık at nalı kıyı, üç liman kasabası (rıhtım teras, taranmış liman havzası, mendirek) ---
const hills = landscape({ seed: 12, size: 1600, height: 210, octaves: 6, warp: 0.45 });
const RS = 640;
function shoreR(th) {
  const open = smoothstep(0.78, 0.36, Math.abs(th));            // th = 0 → +z (açık deniz)
  return RS + 45 * Math.sin(3 * th + 1) + 22 * Math.sin(7 * th + 0.4) + 5000 * open;
}
function hB0(x, z) {
  const r = Math.hypot(x, z), d = r - shoreR(Math.atan2(x, z));
  if (d < 0) return -Math.min(55, -d * 0.075 + 2);
  const k = smoothstep(80, 700, d);
  return -2 + d * 0.09 + (k > 0 ? Math.max(0, hills(x, z) + 40) * k : 0);
}
// Liman çerçeveleri: out = karaya doğru birim vektör, pr = kıyıya paralel; yerel koordinat [a (kıyı boyu), n (karaya doğru)]
const QY = 1.2;               // rıhtım kotu (m)
const PW = PORTS.map(([x, z]) => {
  const o = new THREE.Vector2(x, z).normalize(), P = { out: o, x: (x + o.x * 6) * U, z: (z + o.y * 6) * U };
  let dS = 0; while (hB0(P.x + o.x * dS, P.z + o.y * dS) < 0.5 && dS < 400) dS += 4;
  P.sx = P.x + o.x * dS; P.sz = P.z + o.y * dS; P.pr = new THREE.Vector2(-o.y, o.x); P.face = Math.atan2(-o.x, -o.y);
  return P;
});
const toW = (P, a, n) => [P.sx + P.pr.x * a + P.out.x * n, P.sz + P.pr.y * a + P.out.y * n];
const toL = (P, x, z) => { const dx = x - P.sx, dz = z - P.sz; return [dx * P.pr.x + dz * P.pr.y, dx * P.out.x + dz * P.out.y]; };
// Açılış karesi: Yakın Liman'ın ağzında, mendirek feneri sağda; öndeki tekneler, rıhtım, iskele ve arkada kıyı köyü
const CAM0 = (() => { const P = PW[0], [cx, cz] = toW(P, -30, -130), [tx, tz] = toW(P, -8, -18); return [[cx, 8.5, cz], [tx, 3.5, tz]]; })();
const CAM_NEAR = (() => { const P = PW[0], [cx, cz] = toW(P, -34, -92), [tx, tz] = toW(P, -50, -40); return [[cx, 6.5, cz], [tx, 1.5, tz]]; })();
function hB(x, z) {
  let h = hB0(x, z);
  for (const P of PW) {
    const [a, n] = toL(P, x, z);
    if (Math.abs(a) > 260 || n < -260 || n > 200) continue;
    const terr = smoothstep(135, 100, Math.abs(a)) * smoothstep(-40, -26, n) * smoothstep(75, 42, n);     // kıyı terası
    h = lerp(h, QY - 0.05, terr);
    const dr = smoothstep(150, 105, Math.abs(a - 5)) * smoothstep(-250, -200, n) * smoothstep(-22, -32, n); // taranmış havza
    h = lerp(h, Math.min(h, -5.5), dr);
  }
  return h;
}
const TOPT = { water: 0, grass: 0x56662e, dry: 0x7f7a47, forest: 0.95, sand: 0xcdb98e, rock: 0x8a8275 };
scene.add(createTerrain(hB, { size: [3000, 3000], res: LOW ? [260, 260] : [380, 380], material: terrainMaterial(TOPT) }));
const BIG = 30000;
scene.add(createTerrain((x, z) => hB(x, z) - 3 * Math.min(smoothstep(1500, 1440, Math.abs(x)), smoothstep(1500, 1440, Math.abs(z))),
  { size: [BIG, BIG], res: LOW ? [200, 200] : [280, 280], material: terrainMaterial(TOPT) }));
scene.add(terrainSkirt(hB, { inner: BIG / 2, outer: 70000, material: terrainMaterial(TOPT) }));
{
  const DR = [-4000, -4000, 4000, 4000];
  sim.ocean.setDepth(depthTexture(hB, DR, LOW ? 384 : 512), DR);
}
const inVillage = (x, z) => PW.some((P) => { const [a, n] = toL(P, x, z); return Math.abs(a) < 135 && n > -40 && n < 125; });
const veg = createVegetation(hB, {
  rect: [-4000, -4000, 4000, 2600], trees: LOW ? 3200 : 7000, shrubs: LOW ? 900 : 2200, rocks: 160, seed: 3,
  near: [...toW(PW[0], 0, 330), 750],
  kinds: { pine: 0.5, broad: 0.3, cypress: 0.2 }, leafA: 0x3a5224, leafB: 0x66713a,
  forest: (x, z) => {
    if (inVillage(x, z)) return 0;
    const f = (a, b) => Math.sin(a) * Math.cos(b);
    return 0.5 + 0.3 * f(x * 0.018 + 1.3, z * 0.021) + 0.2 * f(x * 0.051 + z * 0.02, z * 0.047 - 2.1);
  },
});
scene.add(veg.group);

// Limanlar: taş kaplı rıhtım + döşeme, ahşap iskele, kaya/tetrapod mendirek ve fener, rıhtımda babalar, kasalar, ağlar;
// arkada kıyı köyü (motorun bina modülü: denize bakan dükkânlı apartmanlar ve kiremit çatılı evler), sokak lambaları
const labels = [];
const concM = mat.concrete({ color: 0xbdb6aa }), quayM = quayStone(), coreM = mat.rock({ color: 0x4f4a44, strata: 0.05 });
const ARM = { rocks: [], tetra: [], bol: [], crate: [], net: [], pile: [], lamp: [], ppl: [] };
const lots = [];
PW.forEach((P, i) => {
  const W = (a, n) => toW(P, a, n);
  // rıhtım: n = −25 (su yüzü) … +20; kıyı boyunca 200 m
  { const [x, z] = W(0, 0);
    const quay = new THREE.Mesh(new RoundedBoxGeometry(200, 6.2, 50, 2, 0.35), quayM);
    quay.position.set(x, QY - 3.1, z); quay.rotation.y = P.face; quay.receiveShadow = true; scene.add(quay);
    const [cx, cz] = W(0, -24.6);
    const cope = new THREE.Mesh(new RoundedBoxGeometry(200, 0.32, 0.9, 2, 0.1), concM);
    cope.position.set(cx, QY + 0.1, cz); cope.rotation.y = P.face; scene.add(cope); }
  // ahşap iskele: a = −55, rıhtımdan denize 46 m
  { const [x, z] = W(-55, -48);
    const deck = new THREE.Mesh(new RoundedBoxGeometry(3.4, 0.28, 46, 1, 0.06), deckPlanks(0x8c7152));
    deck.position.set(x, QY - 0.12, z); deck.rotation.y = P.face; deck.castShadow = deck.receiveShadow = true; scene.add(deck);
    for (let n = -26; n >= -70; n -= 4) for (const s of [-1.55, 1.55]) ARM.pile.push(W(-55 + s, n));
    for (let n = -30; n >= -70; n -= 8) for (const s of [-1.45, 1.45]) ARM.bol.push([...W(-55 + s, n), 0.02]);
    // iskelenin ucunda iki balıkçı: biri kenarda oturmuş denize bakıyor, biri ayakta
    ARM.ppl.push({ at: W(-55.5, -70.75), y: QY + 0.02 - 0.46, yaw: P.face + 0.1, pose: 'sit', kind: 'fisher' },
      { at: W(-54.4, -66.5), y: QY + 0.02, yaw: P.face - 0.5, pose: 'stand', kind: 'fisher' }); }
  // rıhtım donanımı: babalar, balık kasası yığınları, kurumaya serilmiş ağlar, lambalar, insanlar
  { const rq = seeded(500 + i);
    for (let a = -95; a <= 95; a += 9) if (Math.abs(a + 55) > 4) ARM.bol.push([...W(a, -23.2), 0]);
    for (let k = 0; k < 16; k++) { const a = (rq() - 0.5) * 170, n = -20 + rq() * 9; ARM.crate.push([...W(a, n), P.face + (rq() - 0.5) * 0.4, 1 + Math.floor(rq() * 3), rq()]); }
    for (let k = 0; k < 9; k++) { const a = (rq() - 0.5) * 160, n = -14 + rq() * 12; ARM.net.push([...W(a, n), rq()]); }
    for (let a = -90; a <= 90; a += 22) ARM.lamp.push([...W(a, 17), P.face]);
    // rıhtımda insanlar: ağ onaran / kasa ayıklayan balıkçılar, duranlar ve rıhtım boyunca gidip gelen yürüyenler (?low: daha az)
    for (let k = 0; k < 14; k++) {
      const a = (rq() - 0.5) * 180, n = -21 + rq() * 36, yaw = rq() * TAU;
      if (LOW && k % 2) continue;
      const role = k % 7;
      if (role < 2) ARM.ppl.push({ P, walk: { a, n: 4 + (n + 21) / 4, amp: 9 + (k % 3) * 4, v: 1.15 + 0.1 * (k % 4), ph: yaw }, y: QY, pose: 'walk', kind: 'folk' });
      else ARM.ppl.push({ at: W(a, n), y: QY, yaw, pose: role === 2 ? 'crouch' : role === 3 ? 'work' : 'stand', kind: role < 4 ? 'fisher' : 'folk' });
    } }
  // mendirek: kıyıdan çıkıp limanı saran taş seti (kaya dolgu çekirdeği)
  const path = [];
  for (let k = 0; k <= 24; k++) {
    const t = k / 24, along = lerp(95, -20, t), off = -lerp(0, 150, Math.sin(t * Math.PI / 2));
    const [x, z] = W(along, off + 8 * t);
    path.push(new THREE.Vector3(x, 0, z));
  }
  scene.add(new THREE.Mesh(sweep([[-13, -9], [-5, 1.8], [0, 2.8], [5, 1.8], [13, -9]], path), coreM));
  const cv = new THREE.CatmullRomCurve3(path), L = cv.getLength();
  P.bw = cv; P.hc = new THREE.Vector2(...W(10, -70));
  // Zırh: iç yüzde iri ocak taşları, deniz tarafında beton tetrapodlar
  { const n = Math.floor(L / 2.6), rr = seeded(300 + i);
    const prof = (u) => { const a = Math.abs(u); return a < 5 ? lerp(2.8, 1.8, a / 5) : lerp(1.8, -9, (a - 5) / 8); };
    for (let k = 1; k < n; k++) {
      const t = k / n, q = cv.getPointAt(t), tg = cv.getTangentAt(t);
      let nx = -tg.z, nz = tg.x;
      if ((q.x - P.hc.x) * nx + (q.z - P.hc.y) * nz < 0) { nx = -nx; nz = -nz; }     // n: denize doğru
      const lap = (u) => [q.x + nx * u, prof(u), q.z + nz * u];
      for (const u of [-3.6, -6.4, -9.2]) { const [x, y, z] = lap(u + (rr() - 0.5) * 1.2), sc = 1.5 + rr() * 1.3; ARM.rocks.push([x, y + sc * 0.35, z, sc, rr() * TAU, rr()]); }
      if (k % 2 === 0) { const [x, y, z] = lap((rr() - 0.5) * 2.5), sc = 1.1 + rr() * 0.6; ARM.rocks.push([x, y + 0.2, z, sc, rr() * TAU, rr()]); }
      for (const u of [4.2, 6.6, 9.0, 11.2]) { const [x, y, z] = lap(u + (rr() - 0.5) * 1.0); ARM.tetra.push([x, y + 0.9, z, 1.05 + rr() * 0.15, rr() * TAU, rr() * TAU]); }
    } }
  // mendirek feneri (yeşil): kule, galeri, fener odası
  { const q = cv.getPointAt(0.985);
    const prof = [[0.001, 0], [1.5, 0], [1.5, 0.5], [1.15, 0.7], [1.0, 6.4], [1.35, 6.5], [1.35, 6.7], [0.8, 6.75], [0.8, 7.9], [0.9, 8.0], [0.5, 8.6], [0.06, 8.9], [0.001, 9.0]].map(([a, b]) => new THREE.Vector2(a, b));
    const tg = new THREE.LatheGeometry(prof, 20), pa = tg.attributes.position, col = new Float32Array(pa.count * 3);
    for (let k = 0; k < pa.count; k++) { const y = pa.getY(k), g = (y > 1.8 && y < 3.2) || (y > 4.4 && y < 5.8) || y > 7.95; col.set(g ? [0.12, 0.45, 0.2] : [0.93, 0.92, 0.88], k * 3); }
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const tower = new THREE.Mesh(tg, workPaint()); tower.position.set(q.x, 2.6, q.z); tower.castShadow = tower.receiveShadow = true; scene.add(tower);
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.0, 12), mat.glow({ color: 0x55ff88, intensity: 1.6 }));
    lan.position.set(q.x, 2.6 + 7.3, q.z); scene.add(lan); }
  // kıyı köyü: 1. sıra denize bakan dükkânlı apartmanlar (balık lokantaları), arkada kiremit çatılı evler
  { const r = seeded(40 + i);
    for (let row = 0; row < 3; row++) {
      let a = -92 + r() * 6;
      while (a < 92) {
        const w = row === 0 ? 12 + r() * 6 : 9 + r() * 5, d = row === 0 ? 11 + r() * 3 : 8 + r() * 3;
        const n = 28 + d / 2 + row * 23 + (r() - 0.5) * 3;
        if (r() > (row === 0 ? 0.08 : 0.22)) {
          const [x, z] = W(a + w / 2, n), c = Math.cos(P.face), s = Math.sin(P.face);
          let y0 = 1e9;
          for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) y0 = Math.min(y0, hB(x + lx * c + lz * s, z - lx * s + lz * c));
          const type = row === 0 ? 'apartment' : r() < 0.7 ? 'house' : 'apartment';
          lots.push({ x, z, rot: P.face + (row ? (r() - 0.5) * 0.08 : 0), y0: y0 - 0.25, width: w, depth: d, type,
            floors: type === 'apartment' ? 3 + Math.floor(r() * (row ? 2 : 3)) : 2 + Math.floor(r() * 2), shop: row === 0 ? r() < 0.8 : false,
            roof: r() < 0.65 ? 'hip' : type === 'house' ? 'gable' : 'flat', age: 0.35 + r() * 0.5, seed: 100 * i + lots.length * 7.3 });
        }
        a += w + 2.5 + r() * 4;
      }
    } }
  const [lx, lz] = W(0, 140);
  const g = new THREE.Object3D(); g.position.set(lx, hB(lx, lz) + 28, lz); scene.add(g);
  labels.push(sim.label(`<span style="color:${FLEET_CSS[i]}">⚓</span> ${FLEETS[i].name}`, { parent: g, position: [0, 0, 0], className: 'plain' }));
  // filo bayrağı (iskele ucunda direk)
  const [fx, fz] = W(-55, -69);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 8, 10), mat.brushedMetal({ color: 0xd5d8dc }));
  pole.position.set(fx, QY + 4, fz); scene.add(pole);
  const flagG = new THREE.PlaneGeometry(2.4, 1.6, 8, 2); flagG.translate(1.2, 0, 0);
  const flag = new THREE.Mesh(flagG, bandPaint(FLEET_COLORS[i]));
  flag.position.set(fx, QY + 7.1, fz); flag.rotation.y = P.face + 1.2;
  flag.userData.base = flagG.attributes.position.array.slice();
  scene.add(flag);
  P.flag = flag;
});
const city = populateCity({ lots, seed: 9, camera: CAM0[0] });
scene.add(city.group);
{
  const lamps = streetLamps(ARM.lamp.map(([x, z, r]) => [x, z, r, QY]));
  scene.add(lamps.group);
}

{
  // Zırh kayaları: gürültüyle bozulmuş, basık çok yüzlüler
  const rg = new THREE.IcosahedronGeometry(1, 2), rp = rg.attributes.position, v = new THREE.Vector3();
  for (let k = 0; k < rp.count; k++) { v.fromBufferAttribute(rp, k); const f = 0.78 + 0.3 * Math.abs(Math.sin(v.x * 3.1 + v.y * 5.3) * Math.cos(v.z * 4.7 - v.x)) + 0.06 * Math.sin(v.x * 9 + v.z * 7); rp.setXYZ(k, v.x * f * 1.15, v.y * f * 0.72, v.z * f); }
  rg.computeVertexNormals(); rg.deleteAttribute('uv');
  // Tetrapod: merkezden dört yöne (düzgün dörtyüzlü köşeleri) uzanan kesik koni bacaklar
  const legs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((d) => {
    const g = new THREE.CylinderGeometry(0.34, 0.62, 1.7, 10).translate(0, 0.85, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d).normalize()));
    g.deleteAttribute('uv'); return g.toNonIndexed();
  });
  const tg = BufferGeometryUtils.mergeGeometries(legs); tg.computeVertexNormals();
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const rocks = instanced(rg, mat.rock({ color: 0x938c80, strata: 0.15 }), ARM.rocks.length);
  ARM.rocks.forEach(([x, y, z, s, a, b], k) => rocks.setMatrixAt(k, m4.compose(p.set(x, y, z), qq.setFromEuler(e.set((b - 0.5) * 0.6, a, (b - 0.5) * 0.4)), sc.set(s, s, s))));
  const tetra = instanced(tg, mat.concrete({ color: 0xc9c3b8 }), ARM.tetra.length);
  ARM.tetra.forEach(([x, y, z, s, a, b], k) => tetra.setMatrixAt(k, m4.compose(p.set(x, y, z), qq.setFromEuler(e.set(b, a, b * 0.5)), sc.set(s, s, s))));
  const bolG = BufferGeometryUtils.mergeGeometries([
    new THREE.LatheGeometry([[0.001, 0], [0.34, 0], [0.3, 0.1], [0.24, 0.55], [0.34, 0.62], [0.34, 0.72], [0.001, 0.74]].map(([a, b]) => new THREE.Vector2(a, b)), 12),
  ].map((g) => { g.deleteAttribute('uv'); return g; })).translate(0, QY, 0);
  const bol = instanced(bolG, mat.paintedMetal({ color: 0x2a2d31, wear: 0.5 }), ARM.bol.length);
  ARM.bol.forEach(([x, z, y], k) => bol.setMatrixAt(k, m4.compose(p.set(x, y || 0, z), qq.identity(), sc.set(1, 1, 1))));
  const CRC = [0x2f6fb0, 0xd9d4c8, 0xc0392b, 0x2e8b57], cc = new THREE.Color();
  const nCr = ARM.crate.reduce((s, c) => s + c[3], 0);
  const crate = instanced(new RoundedBoxGeometry(1.2, 0.5, 0.8, 1, 0.05), mat.plastic({ color: 0xffffff, gloss: 0.3 }), nCr);
  let ci = 0;
  ARM.crate.forEach(([x, z, a, h, c]) => { for (let j = 0; j < h; j++) { crate.setMatrixAt(ci, m4.compose(p.set(x, QY + 0.25 + j * 0.5, z), qq.setFromEuler(e.set(0, a + j * 0.05, 0)), sc.set(1, 1, 1))); crate.setColorAt(ci++, cc.setHex(CRC[Math.floor(c * CRC.length)])); } });
  // kurumaya serilmiş ağ yığınları: kabarık, düzensiz öbek
  const netG = new THREE.IcosahedronGeometry(1, 2), np = netG.attributes.position;
  for (let k = 0; k < np.count; k++) { v.fromBufferAttribute(np, k); const f = 1 + 0.14 * Math.sin(v.x * 6 + v.z * 3) * Math.cos(v.y * 5 - v.z * 4); np.setXYZ(k, v.x * f, Math.max(-0.05, v.y) * f, v.z * f); }
  netG.computeVertexNormals();
  const net = instanced(netG, mat.fabric({ color: 0xffffff }), ARM.net.length);
  const NTC = [0x2f7d4a, 0xd8742a, 0x1f5f8b, 0x3a8f5c];
  ARM.net.forEach(([x, z, c], k) => { net.setMatrixAt(k, m4.compose(p.set(x, QY, z), qq.setFromEuler(e.set(0, c * TAU, 0)), sc.set(2.0 + c * 1.5, 0.55 + c * 0.35, 1.5 + c))); net.setColorAt(k, cc.setHex(NTC[Math.floor(c * 4)])); });
  const pileG = new THREE.CylinderGeometry(0.2, 0.22, 7.5, 8).translate(0, QY - 3.7, 0); pileG.deleteAttribute('uv');
  const piles = instanced(pileG, mat.wood({ color: 0x5d4632 }), ARM.pile.length);
  ARM.pile.forEach(([x, z], k) => piles.setMatrixAt(k, m4.compose(p.set(x, 0, z), qq.identity(), sc.set(1, 1, 1))));
  for (const m of [rocks, tetra, bol, crate, net, piles]) { m.castShadow = m.receiveShadow = true; m.userData.noFit = true; scene.add(m); }
}
// İnsanlar: motorun eklemli figürleri (@core crowd). Balıkçılar muşamba/iş giysili (turuncu, sarı, lacivert), diğerleri günlük giysili;
// yürüyenler rıhtım boyunca gidip gelir (yürüme yönüne dönük, adım gerçek yer değiştirmeden)
const folk = crowd(ARM.ppl.length, { seed: 41, camera: sim.camera, seat: 0.46 });
scene.add(folk.group);
const OILSKIN = [0xe0762a, 0xf0b429, 0x2f4f7a, 0x3d5a3a, 0xc8472e];
ARM.ppl.forEach((q, k) => {
  if (q.kind === 'fisher') folk.dress(k, { seed: 900 + k, outfit: 'casual', sleeves: 'long', build: 1.05 + 0.15 * ((k * 7) % 3) / 2,
    colors: { top: OILSKIN[k % OILSKIN.length], bottom: [0x2b2f36, 0x3a3f2e, 0x4a4036][k % 3] }, hair: k % 3 === 0 ? { style: 'bald' } : undefined });
  else folk.dress(k, { seed: 900 + k, outfit: ['casual', 'casual', 'student', 'office'][k % 4] });
  if (q.at) folk.set(k, q.at[0], q.y, q.at[1], q.yaw, q.pose);
});
function placeFolk(t) {
  ARM.ppl.forEach((q, k) => {
    if (!q.walk) return;
    const w = q.walk, T = (2 * w.amp) / w.v, u = ((t + w.ph * T / TAU) % (2 * T) + 2 * T) % (2 * T);
    const fwd = u < T, s = fwd ? u / T : 2 - u / T;             // 0 → 1 → 0 (uçlarda geri döner)
    const a = w.a + (s * 2 - 1) * w.amp, [x, z] = toW(q.P, clamp(a, -92, 92), w.n);
    const dir = fwd ? 1 : -1, yaw = Math.atan2(q.P.pr.x * dir, q.P.pr.y * dir);
    folk.set(k, x, q.y, z, yaw, 'walk');
  });
  folk.update(t);
}
placeFolk(0);
// Martılar: ağ çeken teknelerin ve limanın üstünde süzülen küçük sürüler (gövde + iki kanat; kanatlar çırpar ve süzülür)
const NG = 60;
const GG = gullGeometries(), gullMat = workPaint();
const gullB = instanced(GG.body, gullMat, NG), gullL = instanced(GG.wingL, gullMat, NG), gullR = instanced(GG.wingR, gullMat, NG);
for (const m of [gullB, gullL, gullR]) { m.material.side = THREE.DoubleSide; m.frustumCulled = false; m.userData.noShadow = true; scene.add(m); }
const gullPh = Array.from({ length: NG }, (_, k) => [(Math.sin(k * 12.9898) * 43758.5453 % 1 + 1) % 1, (k * 0.618) % 1]);
const m4g = new THREE.Matrix4(), m4w = new THREE.Matrix4(), mRot = new THREE.Matrix4(), qg = new THREE.Quaternion(), eg = new THREE.Euler(), pvg = new THREE.Vector3(), svg = new THREE.Vector3(1.25, 1.25, 1.25);
function drawGulls(t) {
  const hubs = [];
  boats.forEach((F, i) => { const n = Math.round(model.boats[i]); for (let k = 0; k < n && hubs.length < 4; k++) if (F.list[k].v > 0.1 && F.list[k].v < 0.5) hubs.push([F.list[k].p.x * U, F.list[k].p.y * U, 1]); });
  PW.forEach((P, i) => { hubs.push([...toW(P, -30, -45), 1.4]); if (i === 0) hubs.push([...toW(P, 20, -80), 1.2], [...toW(P, -70, -110), 1]); });
  for (let k = 0; k < NG; k++) {
    const h = hubs[k % hubs.length], [a0, b0] = gullPh[k], dir = k % 2 ? 1 : -1, a = t * (0.22 + 0.2 * b0) * dir + a0 * TAU;
    const R = (12 + 30 * b0) * h[2], x = h[0] + Math.cos(a) * R, z = h[1] + Math.sin(a) * R, y = 7 + 18 * a0 + Math.sin(t * 0.7 + k) * 2;
    const glide = Math.sin(t * 0.35 + k * 2.1) > 0.2;
    const flap = glide ? 0.12 + 0.05 * Math.sin(t * 2 + k) : 0.55 * Math.sin(t * (6.5 + 3 * b0) + k * 1.7);
    // yön: dairesel uçuşa teğet (+x baş), içe yatış
    qg.setFromEuler(eg.set(0.35 * -dir, -a - dir * Math.PI / 2, 0.08, 'YXZ'));
    m4g.compose(pvg.set(x, y, z), qg, svg);
    gullB.setMatrixAt(k, m4g);
    gullL.setMatrixAt(k, m4w.multiplyMatrices(m4g, mRot.makeRotationX(-flap)));
    gullR.setMatrixAt(k, m4w.multiplyMatrices(m4g, mRot.makeRotationX(flap)));
  }
  gullB.instanceMatrix.needsUpdate = gullL.instanceMatrix.needsUpdate = gullR.instanceMatrix.needsUpdate = true;
}

// --- Harita katmanları: av sahası kenarı ve koruma alanı (üstte, açılıp kapanır) ---
const OVL_Y = 0.9;
const ring = new THREE.Mesh(new THREE.RingGeometry(GR * U - 0.9, GR * U + 0.9, 240), new THREE.MeshBasicMaterial({ color: 0xe6f3f7, transparent: true, opacity: 0.3, depthWrite: false }));
ring.rotation.x = -Math.PI / 2;
ring.position.y = OVL_Y;
ring.userData.noShadow = true;
scene.add(ring);
const reserveMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
reserveMesh.rotation.x = -Math.PI / 2;
reserveMesh.position.y = OVL_Y;
reserveMesh.userData.noShadow = true;
scene.add(reserveMesh);
// Şamandıralar (gerçek nesne): sarı gövde, direk ve tepe işareti
const buoyG = BufferGeometryUtils.mergeGeometries([
  new THREE.SphereGeometry(0.75, 14, 10).toNonIndexed(),
  new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6).translate(0, 1.4, 0).toNonIndexed(),
  new THREE.ConeGeometry(0.35, 0.6, 8).translate(0, 2.7, 0).toNonIndexed(),
].map((g) => { g.deleteAttribute('uv'); return g; }));
const buoys = instanced(buoyG, mat.plastic({ color: 0xf2c418, gloss: 0.5 }), 64);
buoys.frustumCulled = false;
scene.add(buoys);
const reserveLabel = sim.label('🛡️ Koruma alanı', { position: [0, 40, 0], className: 'plain' });
labels.push(reserveLabel);
const R_START = Math.PI * 0.62;   // dilimin başladığı açı (x-z düzleminde, kameraya yakın taraf)
const mtx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1), eul = new THREE.Euler();
const buoyXZ = [];
function drawReserve() {
  const f = model.p.reserve;
  reserveMesh.visible = f > 0.001 && showMap.value;
  reserveLabel.visible = f > 0.001 && (typeof showLabels === 'undefined' || showLabels.value);
  reserveMesh.geometry.dispose();
  // CircleGeometry xy düzleminde; rotation.x = −90° ile açı θ → (cosθ, −sinθ) olur; −açı vererek x-z açısını eşle
  reserveMesh.geometry = new THREE.CircleGeometry(GR * U, 64, -R_START - f * TAU, f * TAU);
  buoyXZ.length = 0;
  if (f > 0.001) {
    const nArc = Math.max(4, Math.round(40 * f));
    const add = (x, z) => buoyXZ.push([x * U, z * U]);
    for (let k = 0; k <= nArc; k++) { const a = R_START + (k / nArc) * f * TAU; add(Math.cos(a) * GR, Math.sin(a) * GR); }
    if (f < 0.999) for (const a of [R_START, R_START + f * TAU]) for (let k = 1; k < 6; k++) add(Math.cos(a) * GR * k / 6, Math.sin(a) * GR * k / 6);
    const am = R_START + f * Math.PI;
    reserveLabel.position.set(Math.cos(am) * GR * U * 0.6, 40, Math.sin(am) * GR * U * 0.6);
  }
  buoyXZ.length = Math.min(buoyXZ.length, 64);
  placeBuoys(0);
}
function placeBuoys(t) {
  buoyXZ.forEach(([x, z], n) => {
    eul.set(Math.sin(t * 1.3 + n) * 0.12, 0, Math.cos(t * 1.1 + n * 1.7) * 0.12);
    mtx.compose(pv.set(x, Math.sin(t * 1.6 + n * 0.7) * 0.2 - 0.15, z), q4.setFromEuler(eul), sv.set(1, 1, 1));
    buoys.setMatrixAt(n, mtx);
  });
  buoys.count = buoyXZ.length;
  buoys.instanceMatrix.needsUpdate = true;
}
const inReserve = (x, z) => {
  const f = model.p.reserve;
  if (f <= 0) return false;
  let a = Math.atan2(z, x) - R_START;
  a = ((a % TAU) + TAU) % TAU;
  return a < f * TAU && x * x + z * z < GR * GR * 1.1;
};

// --- Balıklar: sürüler (her sürü 12 balık); üstten sürü gölgesi, su altında balığın kendisi ---
const PER = 12, NSCH = Math.ceil(MAXFISH / PER);
function fishGeo() {
  const body = new THREE.SphereGeometry(0.5, 14, 8);
  body.scale(0.62, 0.2, 0.12);
  const tail = new THREE.ConeGeometry(0.13, 0.2, 4);
  tail.rotateZ(Math.PI / 2); tail.scale(1, 1, 0.25); tail.translate(-0.38, 0, 0);
  const dors = new THREE.ConeGeometry(0.06, 0.12, 3); dors.scale(1.6, 1, 0.2); dors.translate(0, 0.12, 0);
  return BufferGeometryUtils.mergeGeometries([body.toNonIndexed(), tail.toNonIndexed(), dors.toNonIndexed()].map((g) => { g.deleteAttribute('uv'); return g; }));
}
const fishMat = procedural({
  key: 'balik-fish', params: { color: 0xb9c6cc, roughness: 0.3, metalness: 0.6 },
  pattern: 'float top = smoothstep(-0.02, 0.07, p.y); col = mix(col, vec3(0.08, 0.14, 0.18), top); col *= 0.85 + 0.25*vn3(p*40.0 + seed*9.0); rough = mix(0.28, 0.5, top); metal = mix(0.65, 0.2, top);',
});
const fishMesh = instanced(fishGeo(), fishMat, MAXFISH);
fishMesh.frustumCulled = false;
fishMesh.scale.setScalar(1.4);   // ~0,9 m (morina boyu)
scene.add(fishMesh);
const blotchTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const dx = (x - 64) / 64, dy = (y - 64) / 64, a = Math.atan2(dy, dx);
    const rr = Math.hypot(dx, dy) / (0.72 + 0.14 * Math.sin(3 * a + 1) + 0.08 * Math.sin(5 * a + 2));
    const n = 0.75 + 0.25 * Math.sin(x * 0.7) * Math.sin(y * 0.9 + x * 0.2);
    const al = Math.max(0, 1 - rr) ** 0.8 * n;
    const k = (y * 128 + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * Math.min(1, al));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const blotchG = new THREE.PlaneGeometry(1, 1); blotchG.rotateX(-Math.PI / 2);
const blotches = instanced(blotchG, new THREE.MeshBasicMaterial({ map: blotchTex, color: 0x0b2a36, transparent: true, opacity: 0.55, depthWrite: false }), NSCH);
blotches.frustumCulled = false;
blotches.userData.noShadow = true;
blotches.renderOrder = 3;
scene.add(blotches);
const schools = [], fish = [];
{
  const r = seeded(17);
  for (let s = 0; s < NSCH; s++) schools.push({ u: r(), v: Math.sqrt(r()), ph: r() * TAU, w: 0.25 + r() * 0.3, size: 26 + r() * 22, dep: 4 + r() * 8 });
  for (let i = 0; i < MAXFISH; i++) {
    const a = r() * TAU, d = Math.sqrt(r());
    fish.push({ s: Math.floor(i / PER), ox: Math.cos(a) * d, oz: Math.sin(a) * d, oy: (r() - 0.5) * 3, ph: r() * TAU, w: 0.6 + r() * 0.5 });
  }
}
const schoolPos = schools.map(() => new THREE.Vector3());
function drawFish(t) {
  const f = model.p.reserve;
  const nR = Math.round((model.Br / K) * MAXFISH), nF = Math.round((model.Bf / K) * MAXFISH);
  const n = Math.min(MAXFISH, nR + nF);
  const inv = 1 / fishMesh.scale.x;
  // sürü merkezleri
  for (let s = 0; s < NSCH; s++) {
    const S = schools[s], reserve = s * PER < nR;
    const a0 = reserve ? R_START + S.u * f * TAU : R_START + f * TAU + S.u * (1 - f) * TAU;
    const a = a0 + Math.sin(t * S.w * 0.3 + S.ph) * 0.05 * (reserve ? f : 1 - f) * 3;
    const rr = (S.v * (GR - 0.8) + Math.sin(t * 0.2 + S.ph) * 0.4) * U;
    schoolPos[s].set(Math.cos(a) * rr, -S.dep, Math.sin(a) * rr);
    const k = clamp(n - s * PER, 0, PER) / PER, sc = S.size * Math.sqrt(k);
    mtx.compose(pv.set(schoolPos[s].x, OVL_Y - 0.05, schoolPos[s].z), q4.setFromEuler(eul.set(0, S.ph + t * 0.05, 0)), sv.set(sc, 1, sc * 0.7));
    blotches.setMatrixAt(s, mtx);
  }
  blotches.count = NSCH;
  blotches.instanceMatrix.needsUpdate = true;
  blotches.visible = showSchools.value;
  for (let i = 0; i < n; i++) {
    const F = fish[i], S = schools[F.s], c = schoolPos[F.s];
    const sw = t * 0.25 * F.w + F.ph, rad = S.size * 0.45;
    const rx = F.ox * Math.cos(sw) - F.oz * Math.sin(sw), rz = F.ox * Math.sin(sw) + F.oz * Math.cos(sw);
    const x = c.x + rx * rad, z = c.z + rz * rad;
    eul.set(0, Math.atan2(-rx, -rz) + Math.sin(t * 7 + F.ph) * 0.12, 0);   // yüzme yönü: dönüşe teğet (+x baş)
    q4.setFromEuler(eul);
    mtx.compose(pv.set(x * inv, (c.y + F.oy) * inv, z * inv), q4, sv.set(1, 1, 1));
    fishMesh.setMatrixAt(i, mtx);
  }
  fishMesh.count = n;
  fishMesh.instanceMatrix.needsUpdate = true;
}

// --- Tekneler: ≈ 13 m ahşap kıyı balıkçısı (istasyon gövde, güverte, kamara, direk, gırgır ağı); filo rengi küpeşte bandında ---
const NB = MAXB * 3;
const BU = boatUpperGeometries(3);
const hullMesh = instanced(boatHullGeometry(), hullPaint(), NB);
const deckMesh = instanced(boatDeckGeometry(), deckPlanks(), NB);
const upperMesh = instanced(BU.upper, workPaint(), NB);
const glassMesh = instanced(BU.glass, mat.plastic({ color: 0x16202a, gloss: 1 }), NB);
const bandMeshes = FLEET_COLORS.map((c) => instanced(boatBandGeometry(), bandPaint(c), MAXB));
for (const m of [hullMesh, deckMesh, upperMesh, glassMesh, ...bandMeshes]) { m.frustumCulled = false; m.userData.noFit = true; scene.add(m); }
// Dümen suyu: kıçtan açılan V dalgası ve köpüklü orta iz
const wakeTex = (() => {
  const W = 256, Hh = 64, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d'), img = g.createImageData(W, Hh);
  for (let x = 0; x < W; x++) {
    const t = 1 - x / (W - 1);                 // 0 kıç, 1 uç
    const w = 3 + 27 * t;
    for (let y = 0; y < Hh; y++) {
      const dy = Math.abs(y - Hh / 2);
      const arm = Math.exp(-(((dy - w) / (1.5 + 2.5 * t)) ** 2)) * (1 - t) ** 1.3 * 0.9;
      const mid = Math.exp(-((dy / (2 + 5 * t)) ** 2)) * (1 - t) ** 2 * (0.7 + 0.3 * Math.sin(x * 0.9 + y * 1.3));
      const a = Math.min(1, arm + mid) * smoothstep(0, 0.04, 1 - t);
      const k = (y * W + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * a);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const wakeG = new THREE.PlaneGeometry(1, 1); wakeG.rotateX(-Math.PI / 2); wakeG.translate(-0.5, 0, 0);
const wakes = instanced(wakeG, new THREE.MeshBasicMaterial({ map: wakeTex, color: 0xdfe8ea, transparent: true, opacity: 0.7, depthWrite: false }), NB);
wakes.frustumCulled = false;
wakes.userData.noShadow = true;
wakes.renderOrder = 4;
scene.add(wakes);
// Bağlama yerleri (sıra: kameraya en yakın/görünür olanlar önce → en son çıkan tekneler): mendirek içi borda, iskele
// iki yanı, rıhtıma kıçtan kara, havzada şamandıra
const hdOf = (dx, dz) => Math.atan2(-dz, dx);
function harborSlots(P, seed) {
  const r = seeded(seed), S = [], cv = P.bw, L = cv.getLength();
  const sea = hdOf(-P.out.x, -P.out.y);
  const free = (x, z, d) => S.every((s) => Math.hypot(s[0] - x, s[1] - z) > d);
  for (let t = 0.93; t > 0.3; t -= 15.5 / L) {
    const q = cv.getPointAt(t), tg = cv.getTangentAt(t);
    let nx = -tg.z, nz = tg.x;
    if ((P.hc.x - q.x) * nx + (P.hc.y - q.z) * nz < 0) { nx = -nx; nz = -nz; }
    S.push([q.x + nx * 14.2, q.z + nz * 14.2, hdOf(tg.x, tg.z)]);
  }
  for (const n of [-37, -52, -66]) for (const s of [-4, 4]) S.push([...toW(P, -55 + s, n), sea + (r() - 0.5) * 0.04]);
  const quay = [];
  for (let a = -95; a <= 95; a += 5.3) if (Math.abs(a + 55) > 9.5) quay.push(a);
  quay.sort((a, b) => Math.abs(a + 30) - Math.abs(b + 30));
  for (const a of quay) S.push([...toW(P, a, -31.9), sea + (r() - 0.5) * 0.05]);
  const moor = sea + 0.5;
  for (const n of [-58, -76, -94, -112, -130]) for (let a = -90; a <= 90; a += 10) {
    const t = (95 - a) / 115, nbw = a > -20 ? -150 * Math.sin(Math.min(1, t) * Math.PI / 2) + 8 * t : -1e9;
    if (a > -20 ? n < nbw + 18 : n < -80) continue;
    if (Math.abs(a + 55) < 11 && n > -82) continue;
    const [x, z] = toW(P, a + (r() - 0.5) * 3, n + (r() - 0.5) * 3);
    if (free(x, z, 12)) S.push([x, z, moor + (r() - 0.5) * 0.5]);
  }
  while (S.length < MAXB) S.push([...toW(P, -80 + r() * 160, -60 - r() * 40), moor + (r() - 0.5) * 0.5]);
  return S;
}
const HULL_TINTS = [0xffffff, 0xffffff, 0x9fbde3, 0xf0dca8, 0xb4d2ae, 0xffffff, 0x8fa9c9].map((c) => new THREE.Color(c));
const boats = FLEETS.map((_, i) => {
  const r = seeded(100 + i), P = PW[i], S = harborSlots(P, 900 + i);
  const mouth = new THREE.Vector2(...toW(P, -62, -170)).multiplyScalar(1 / U);
  const list = [];
  for (let k = 0; k < MAXB; k++) {
    const s = S[MAXB - 1 - k];
    const home = new THREE.Vector2(s[0] / U, s[1] / U);
    list.push({ p: home.clone(), home, homeHd: s[2], mouth, tgt: home.clone(), hd: s[2], inPort: true, pastMouth: false,
      timer: 1 + r() * 6, spd: 0.8 + r() * 0.3, ph: r() * TAU, rnd: r, v: 0,
      // filo içinde çeşitlilik: birkaç büyük gırgır teknesi (≈17 m), küçük kıyı tekneleri (≈11 m); borda boyası 4 renkten biri
      sc: k % 9 === 4 ? 1.32 : k % 5 === 2 ? 0.86 : 0.97 + r() * 0.08, tint: HULL_TINTS[(k * 7 + i * 3) % HULL_TINTS.length] });
    hullMesh.setColorAt(i * MAXB + k, HULL_TINTS[(k * 7 + i * 3) % HULL_TINTS.length]);
  }
  return { band: bandMeshes[i], list };
});
function pickSpot(b) {
  for (let k = 0; k < 20; k++) {
    const a = b.rnd() * TAU, d = Math.sqrt(b.rnd()) * (GR - 1);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!inReserve(x, z)) { b.tgt.set(x, z); return; }
  }
  b.tgt.set(0, 0);
}
const tv = new THREE.Vector2();
function moveBoats(dt, t) {
  const open = model.fishingOpen && model.B() > 0.05;
  let nw = 0;
  boats.forEach((F, i) => {
    const n = Math.round(model.boats[i]);
    for (let k = 0; k < MAXB; k++) {
      const b = F.list[k];
      if (k >= n) { b.p.copy(b.home); b.hd = b.homeHd; b.v = 0; b.inPort = true; b.pastMouth = false; continue; }
      let goal = b.home;
      if (open) {
        if (b.timer <= 0 || inReserve(b.tgt.x, b.tgt.y) || b.tgt.equals(b.home)) { pickSpot(b); b.timer = 3 + b.rnd() * 5; }
        goal = b.tgt;
      }
      const toHome = goal === b.home;
      let aim = goal;
      // limana giriş/çıkış liman ağzından (mendireğin ucundan dolaşarak)
      if (toHome && !b.inPort && !b.pastMouth) { aim = b.mouth; if (b.p.distanceTo(b.mouth) < 0.6) b.pastMouth = true; }
      else if (!toHome && b.inPort) { aim = b.mouth; if (b.p.distanceTo(b.mouth) < 0.6) { b.inPort = false; b.pastMouth = false; } }
      tv.subVectors(aim, b.p);
      const d = tv.length();
      if (d > 0.3) {
        const step = Math.min(d, b.spd * dt);
        b.p.addScaledVector(tv.normalize(), step);
        b.hd = Math.atan2(-tv.y, tv.x);
        b.v = dt > 0 ? 1 : b.v;
      } else if (toHome) { b.inPort = true; b.pastMouth = false; b.hd = b.homeHd; b.v = 0; }
      else if (open) { b.timer -= dt; b.hd += dt * 0.6; b.v = 0.25; }   // ağ çekerken yavaş döner
      else b.v = 0;
    }
    // demirli olanlar dahil hepsi çizilir (limanda bekleyen tekneler)
    for (let k = 0; k < MAXB; k++) {
      const b = F.list[k], gi = i * MAXB + k;
      eul.set(Math.sin(t * 1.1 + b.ph) * 0.025, b.hd, Math.sin(t * 0.9 + b.ph) * 0.02);
      q4.setFromEuler(eul);
      mtx.compose(pv.set(b.p.x * U, Math.sin(t * 1.3 + b.ph) * 0.1 - 0.04 * b.sc, b.p.y * U), q4, sv.set(b.sc, b.sc, b.sc));
      hullMesh.setMatrixAt(gi, mtx); deckMesh.setMatrixAt(gi, mtx); upperMesh.setMatrixAt(gi, mtx); glassMesh.setMatrixAt(gi, mtx);
      F.band.setMatrixAt(k, mtx);
      if (k < n && b.v > 0.01 && nw < NB) {
        const L = 45 * b.v, Wd = 9 + 12 * b.v;   // köpük izi suyun hemen üstünde (havada asılı şerit gibi görünmesin)
        mtx.compose(pv.set(b.p.x * U - Math.cos(b.hd) * 6.3, 0.14, b.p.y * U + Math.sin(b.hd) * 6.3), q4.setFromEuler(eul.set(0, b.hd, 0)), sv.set(L, 1, Wd));
        wakes.setMatrixAt(nw++, mtx);
      }
    }
    F.band.count = MAXB;
    F.band.instanceMatrix.needsUpdate = true;
  });
  for (const m of [hullMesh, deckMesh, upperMesh, glassMesh]) { m.count = NB; m.instanceMatrix.needsUpdate = true; }
  wakes.count = nw;
  wakes.instanceMatrix.needsUpdate = true;
}

// --- Gırgır ağı: ağ çeken teknelerin çevresinde yüzen mantar yaka halkası (yüzdürücüler) ve suya batan ağ perdesi ---
const NFL = 28, SEINE_R = 24;
const floatG = new THREE.CapsuleGeometry(0.3, 0.55, 3, 8).rotateZ(Math.PI / 2);
floatG.deleteAttribute('uv');
const floats = instanced(floatG, mat.plastic({ color: 0xf07a1a, gloss: 0.4 }), MAXB * 3 * NFL);
floats.frustumCulled = false; floats.userData.noShadow = true;
scene.add(floats);
const netCurtainTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1;
  for (let k = 0; k <= 64; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 32, 64); g.stroke(); g.beginPath(); g.moveTo(k, 0); g.lineTo(k - 32, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 3); return t;
})();
const curtainG = new THREE.CylinderGeometry(SEINE_R, SEINE_R * 0.8, 9, 40, 1, true).translate(0, -4.7, 0);
const curtains = instanced(curtainG, new THREE.MeshBasicMaterial({ color: 0x33403c, alphaMap: netCurtainTex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }), MAXB * 3);
curtains.frustumCulled = false; curtains.userData.noShadow = true;
scene.add(curtains);
function drawSeines(t) {
  let nf = 0, nc = 0;
  boats.forEach((F, i) => {
    const n = Math.round(model.boats[i]);
    for (let k = 0; k < n && k < MAXB; k++) {
      const b = F.list[k];
      if (!(model.fishingOpen && b.v > 0.1 && b.v < 0.5)) continue;
      // halka teknenin iskele tarafında; tekne halkanın kenarında durur
      const cx = b.p.x * U - Math.sin(b.hd) * SEINE_R * 0.9, cz = b.p.y * U - Math.cos(b.hd) * SEINE_R * 0.9;
      for (let j = 0; j < NFL; j++) {
        const a = (j / NFL) * TAU + b.ph;
        const x = cx + Math.cos(a) * SEINE_R * (1 + 0.04 * Math.sin(a * 3 + b.ph)), z = cz + Math.sin(a) * SEINE_R;
        mtx.compose(pv.set(x, Math.sin(t * 1.4 + j * 0.6 + b.ph) * 0.12 - 0.08, z), q4.setFromEuler(eul.set(0, -a, 0)), sv.set(1, 1, 1));
        floats.setMatrixAt(nf++, mtx);
      }
      mtx.compose(pv.set(cx, 0, cz), q4.identity(), sv.set(1, 1, 1));
      curtains.setMatrixAt(nc++, mtx);
    }
  });
  floats.count = nf; curtains.count = nc;
  floats.instanceMatrix.needsUpdate = curtains.instanceMatrix.needsUpdate = true;
}

// --- Su altı görünümü: kamera yüzeyin altına inince mavi-yeşil sis, yüzey alttan parlak ---
const UW_COL = new THREE.Color(0x0c4a58);
const uwFog = new THREE.FogExp2(UW_COL.getHex(), 0.03);
const uwSurface = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: 0x7fc6cf, side: THREE.BackSide }));
uwSurface.rotation.x = -Math.PI / 2; uwSurface.position.y = -0.2; uwSurface.visible = false; uwSurface.userData.noShadow = true;
scene.add(uwSurface);
let under = false, skyFog = null, skyBg = null;
function setUnder(on) {
  if (on === under) return;
  under = on;
  if (on) { skyFog = scene.fog; skyBg = scene.background; scene.fog = uwFog; scene.background = UW_COL; }
  else { scene.fog = skyFog; scene.background = skyBg; }
  sim.sky.mesh.visible = !on; sim.ocean.mesh.visible = !on; uwSurface.visible = on;
  curtains.material.visible = on; blotches.material.visible = !on; ring.material.visible = !on; reserveMesh.material.visible = !on; wakes.material.visible = !on;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Senaryo');
const preset = ui.segmented({
  options: [{ value: 'acik', label: 'Açık erişim' }, { value: 'msy', label: 'MSY kotası' }, { value: 'asiri', label: 'Aşırı avlanma' }, { value: 'koruma', label: 'Koruma alanı' }],
  value: 'acik', onChange: () => { sim.reset(); sim.play(); },
});

ui.section('⛵ Filolar');
const fleetSl = FLEETS.map((F, i) => ui.slider({ label: `<span style="color:${FLEET_CSS[i]}">■</span> ${F.name}: tekne`, min: 0, max: MAXB, step: 1, value: 20,
  onChange: (v) => { model.boats[i] = v; } }));
const openAcc = ui.toggle({ label: '🔓 Açık erişim (kâr varsa yeni tekne gelir)', value: false, onChange: (v) => { model.p.openAccess = v; syncFleetSliders(); } });
const price = ui.slider({ label: 'Balık fiyatı', min: 1, max: 6, step: 0.1, value: 3, format: (v) => `${fmt(v, 1)} birim / ton`, onChange: (v) => (model.p.price = v) });
const cost = ui.slider({ label: 'Tekne başına yıllık maliyet', min: 0.1, max: 0.6, step: 0.01, value: 0.25, format: (v) => `${fmt(v * 1000, 0)} birim`, onChange: (v) => (model.p.cost = v) });

ui.section('🏛️ Yönetim');
const quota = ui.slider({ label: 'Yıllık av kotası (TAC)', min: 0, max: 30, step: 0.5, value: 0,
  format: (v) => (v === 0 ? 'kota yok' : `${fmt(v, 1)} bin ton (MSY'nin %${fmt((v / model.msy()) * 100, 0)}'i)`), onChange: (v) => (model.p.quota = v) });
const closure = ui.slider({ label: 'Üreme mevsimi av yasağı', min: 0, max: 6, step: 1, value: 0, format: (v) => (v ? `${v} ay (Nisan'dan itibaren)` : 'yok'), onChange: (v) => (model.p.closure = v) });
const reserve = ui.slider({ label: 'Deniz koruma alanı', min: 0, max: 60, step: 5, value: 0, unit: '%', onChange: (v) => { model.setReserve(v / 100); drawReserve(); } });

ui.section('🐟 Tür ve çevre');
const rSl = ui.slider({ label: 'Büyüme hızı r', min: 0.1, max: 1.2, step: 0.05, value: 0.5,
  format: (v) => `${fmt(v, 2)} /yıl · ${v < 0.3 ? 'yavaş (uzun ömürlü tür)' : v > 0.8 ? 'hızlı (kısa ömürlü tür)' : 'orta'}`,
  onChange: (v) => { model.p.r = v; quota.set(quota.value); } });
const noise = ui.slider({ label: 'Çevresel dalgalanma (yıldan yıla)', min: 0, max: 40, step: 1, value: 0, unit: '%', onChange: (v) => (model.p.noise = v / 100) });
ui.buttons([
  { label: '🐟 Kotayı MSY yap', onClick: () => quota.set(Math.round(model.msy() * 2) / 2, true) },
  { label: '⛵ Filoyu yarıya indir', onClick: () => { model.boats = model.boats.map((b) => Math.round(b / 2)); syncFleetSliders(); } },
]);

ui.section('📊 Durum');
const stStock = ui.stat({ label: 'Stok (K\'nin yüzdesi)', unit: '%' });
const stCatch = ui.stat({ label: 'Son 12 ay av', unit: 'bin t' });
const stMsy = ui.stat({ label: 'MSY = rK/4', unit: 'bin t' });
const stBoats = ui.stat({ label: 'Toplam tekne' });
const stProfit = ui.stat({ label: 'Son 12 ay kâr', unit: 'birim' });
const stState = ui.stat({ label: 'Av sahası' });
const stockChart = ui.chart({ title: 'Stok B (bin ton) · kesikli seviye: K/2', series: [{ name: 'Stok', color: '#38bdf8', fill: true }, { name: 'K/2 (MSY stoğu)', color: '#94a3b8' }], maxPoints: 400, yMin: 0, yMax: K });
const catchChart = ui.chart({ title: 'Yıllık av ve MSY (bin ton/yıl)', series: [{ name: 'Av', color: '#f97316' }, { name: 'MSY', color: '#a3e635' }, { name: 'Kota', color: '#e879f9' }], maxPoints: 400, yMin: 0, height: 100 });
const econChart = ui.chart({ title: 'Filo: tekne sayısı ve yıllık kâr', series: [{ name: 'Tekne', color: '#e2e8f0' }, { name: 'Kâr (×1000 birim)', color: '#4ade80' }], maxPoints: 400, height: 100 });
const note = ui.text('', 'card');

ui.section('Görünüm', { open: false });
const showLabels = ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => { labels.forEach((l) => (l.visible = v)); drawReserve(); } });
const showMap = ui.toggle({ label: 'Harita katmanı (av sahası sınırı, koruma alanı)', value: true, onChange: (v) => { ring.visible = v; drawReserve(); } });
const showSchools = ui.toggle({ label: 'Balık sürülerini üstten göster', value: true });
ui.buttons([
  { label: '⚓ Liman', onClick: () => sim.moveCamera(...CAM0) },
  { label: '🚤 Tekneler', onClick: () => sim.moveCamera(...CAM_NEAR) },
  { label: '🎥 Av sahası', onClick: () => sim.moveCamera([-150, 55, 235], [400, 0, 185]) },
  { label: '🗺️ Körfez', onClick: () => sim.moveCamera([0, 520, 1050], [0, 0, 20]) },
  { label: '⬇️ Yukarıdan', onClick: () => sim.moveCamera([0, 1500, 60], [0, 0, 0]) },
  { label: '🌊 Su altı', onClick: () => {
    // en kalabalık görünen sürünün yanına in
    const n = fishMesh.count, s = Math.max(0, Math.min(NSCH - 1, Math.floor(n / PER / 2)));
    const c = schoolPos[s];
    if (!n) { sim.moveCamera([0, -6, 40], [0, -8, 0]); return; }
    sim.moveCamera([c.x + 24, c.y + 1, c.z + 24], [c.x, c.y, c.z]);
  } },
]);

function syncFleetSliders() {
  fleetSl.forEach((s, i) => { s.set(Math.round(model.boats[i])); s.disable(model.p.openAccess); });
}

// --- Hazır ayarlar ---
const PRESETS = {
  acik: { boats: [6, 6, 6], open: true, quota: 0, closure: 0, reserve: 0, r: 0.5, noise: 0, B0: 90 },
  msy: { boats: [25, 25, 25], open: false, quota: 12.5, closure: 0, reserve: 0, r: 0.5, noise: 0, B0: 80 },
  asiri: { boats: [40, 40, 40], open: false, quota: 0, closure: 0, reserve: 0, r: 0.5, noise: 0, B0: 80 },
  koruma: { boats: [30, 30, 30], open: false, quota: 0, closure: 2, reserve: 30, r: 0.5, noise: 0, B0: 80 },
};
function load(name) {
  const P = PRESETS[name];
  openAcc.set(P.open, true); rSl.set(P.r, true); noise.set(P.noise, true);
  price.set(3, true); cost.set(0.25, true);
  quota.set(P.quota, true); closure.set(P.closure, true);
  model.p.reserve = P.reserve / 100; reserve.set(P.reserve);
  model.reset(P.B0, P.boats);
  syncFleetSliders();
  drawReserve();
  acc = 0; nextPush = 0; wasCollapsed = false;
  stockChart.clear(); catchChart.clear(); econChart.clear();
  boats.forEach((F) => F.list.forEach((b) => { b.p.copy(b.home); b.hd = b.homeHd; b.inPort = true; b.pastMouth = false; b.timer = 0; }));
  updateStats();
}

// --- Döngü ---
let acc = 0, nextPush = 0, wasCollapsed = false, lastYear = -1;
sim.onUpdate((dt, t) => {
  acc += dt * YEARS_PER_SEC;
  while (acc >= H) { model.step(); acc -= H; }
  if (model.p.openAccess && model.yearIdx !== lastYear) { lastYear = model.yearIdx; syncFleetSliders(); }
  if (model.t >= nextPush) {
    nextPush = model.t + 0.2;
    stockChart.push([model.B(), K / 2]);
    catchChart.push([model.annualCatch, model.msy(), model.p.quota || 0]);
    econChart.push([model.effort(), model.annualProfit]);
  }
  if (model.collapsed && !wasCollapsed) sim.toast('📉 Stok çöktü: K\'nin %10\'unun altında', 'bad');
  wasCollapsed = model.collapsed;
  moveBoats(Math.min(dt, 0.1) * 1.2, t);
});

let tick = 0;
sim.onRender(() => {
  const tt = performance.now() / 1000;
  drawFish(tt);
  if (sim.paused) moveBoats(0, sim.time);
  if (tick++ % 10 === 0) updateStats();
  placeBuoys(tt);
  drawSeines(tt);
  drawGulls(tt);
  placeFolk(tt);
  setUnder(sim.camera.position.y < -0.4);
  // bayraklar rüzgârda
  for (const P of PW) {
    const a = P.flag.geometry.attributes.position, b = P.flag.userData.base;
    for (let k = 0; k < a.count; k++) { const x = b[k * 3]; a.setZ(k, Math.sin(x * 1.4 - tt * 6) * 0.18 * (x / 4.2)); }
    a.needsUpdate = true;
  }
});

function updateStats() {
  const B = model.B(), pct = (B / K) * 100, msy = model.msy();
  stStock.set(fmt(pct, 0), pct < 10 ? 'bad' : pct < 40 ? 'warn' : 'good');
  stCatch.set(fmt(model.annualCatch, 1), model.annualCatch > msy * 1.02 ? 'warn' : '');
  stMsy.set(fmt(msy, 1));
  const E = model.effort();
  stBoats.set(Math.round(E), Q * E >= model.p.r ? 'bad' : '');
  stProfit.set(fmt(model.annualProfit * 1000, 0), model.annualProfit < 0 ? 'bad' : 'good');
  stState.set(model.fishingOpen ? 'açık' : model.closedBy === 'sezon' ? 'av yasağı' : 'kota doldu', model.fishingOpen ? '' : 'warn');

  const Eeq = model.p.r / Q;
  let msg;
  if (B < 1) msg = '💀 <b>Stok tükendi.</b> Avlanacak balık kalmadı; tekneler zarar ediyor. Newfoundland morinasında olduğu gibi, avı durdurmak bile hızlı toparlanma garantisi vermez.';
  else if (model.collapsed) msg = `📉 <b>Çöküş:</b> stok K'nin %10'unun altında. Artık üretim çok küçük (r·B·(1−B/K) ≈ ${fmt(model.p.r * B * (1 - B / K), 1)} bin ton/yıl); av bunu aşarsa stok sıfıra gider.`;
  else if (model.p.openAccess && model.annualProfit > 0.5) msg = '🔓 <b>Açık erişim:</b> kâr var, bu yüzden her yıl yeni tekneler katılıyor. Kâr sıfırlanana kadar filo büyüyecek.';
  else if (model.p.openAccess) msg = `🔓 <b>Ortakların trajedisi:</b> kâr erimiş, stok düşük (B ≈ c/(p·q)). Herkes kendi açısından mantıklı davrandı; sonuç topluluk için kötü.`;
  else if (Q * E >= model.p.r && !model.p.reserve && !model.p.quota) msg = `⚠️ <b>Çaba çok yüksek:</b> ${Math.round(E)} tekne, q·E ≥ r sınırını (${fmt(Eeq, 0)} tekne) aşıyor. Bu çabayla hiçbir pozitif denge stoğu yok.`;
  else if (model.p.quota > msy + 0.01) msg = '⚠️ <b>Kota MSY\'nin üstünde:</b> hiçbir stok düzeyi bu kadar artık üretemez; kota her yıl dolarsa stok sonunda çöker.';
  else if (model.p.quota && B < K / 2 && model.annualCatch > model.p.r * B * (1 - B / K)) msg = '⚠️ <b>Sabit kota tuzağı:</b> stok K/2\'nin altında; artık üretim kotadan küçük. Kota düşürülmezse stok giderek hızlanarak azalır.';
  else if (model.p.reserve > 0) msg = '🛡️ <b>Koruma alanı:</b> içerideki balıklar yoğunlaşıp büyüyor ve dışarı taşarak avı besliyor. Stok, filo büyük olsa da daha güvende.';
  else if (Math.abs(B - K / 2) < 6 && model.annualCatch > msy * 0.9) msg = '🎯 <b>MSY\'ye yakın:</b> stok K/2 civarında, av en yüksek sürdürülebilir düzeyde. Ama güvenlik payı yok!';
  else msg = `ℹ️ Bu çabayla denge stoğu B* = K·(1 − qE/r) ≈ <b>${fmt(Math.max(0, K * (1 - (Q * E) / model.p.r)), 0)} bin ton</b>. MSY için gereken çaba yaklaşık ${fmt(Eeq / 2, 0)} tekne.`;
  note.set(msg);
}

sim.onClick(() => { hullMesh.computeBoundingSphere(); bandMeshes.forEach((m) => m.computeBoundingSphere()); return [hullMesh, ...bandMeshes]; }, (hit) => {
  const i = hit.object === hullMesh ? Math.floor((hit.instanceId ?? -MAXB) / MAXB) : bandMeshes.indexOf(hit.object);
  if (i < 0) return;
  const n = model.boats[i], E = model.effort();
  const ly = model.lastYear;
  const per = ly && n > 0.5 ? (ly.prof[i] / n) * 1000 : NaN;
  sim.toast(`⛵ <b>${FLEETS[i].name}</b> · ${Math.round(n)} tekne · maliyet ${fmt(model.costOf(i) * 1000, 0)} birim/tekne·yıl · geçen yıl tekne başı kâr ${fmt(per, 0)} birim (${fmt(E ? (n / E) * 100 : 0, 0)}% av payı)`,
    per < 0 ? 'bad' : 'good');
});

sim.onReset(() => load(preset.value));
load('acik');
sim.moveCamera(...(new URLSearchParams(location.search).get('view') === 'tekne' ? CAM_NEAR : CAM0));
