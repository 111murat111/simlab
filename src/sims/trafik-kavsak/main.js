// Trafik ve Kavşak — sinyalize kavşakta IDM araçlar ve halka yolda hayalet sıkışıklık (Sugiyama deneyi).
import { createSim, THREE, fmt, rand, mat, RoundedBoxGeometry, landscape, createTerrain, terrainSkirt, createVegetation, treeParts, leafMaterial, BufferGeometryUtils,
  makeCity, carFleet, streetMaterials as groundMats, streetTrees, crowd, cityRng } from '@core';
import { createRing, ringStats, RING_DT, CAR_LEN } from './ring.js';

const sim = createSim({
  sky: { elevation: 42, azimuth: 225, clouds: 0.3, haze: 1.2, visibility: 3000 },
  camera: { position: [19, 10.5, 22], target: [-8, 1, -8], fov: 45, near: 0.3, far: 30000 },
  controls: { maxDistance: 260, minDistance: 4, maxPolarAngle: Math.PI * 0.49 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p><b>Kavşak modu:</b> Dört koldan gelen araçlar <b>IDM</b> (Akıllı Sürücü Modeli) ile sürer: her sürücü önündeki
    araca olan boşluğa, hız farkına ve güvenli takip süresine göre hızlanır ya da fren yapar. Kırmızıda durma
    çizgisinde bekler, sarıda durabiliyorsa durur. Sola dönen araç karşıdan gelen trafiğe yol vermek zorundadır ve
    tek şeritli yolda arkasındakileri de bekletir.</p>
    <p><b>Halka yol modu:</b> 2008'deki Sugiyama deneyinde sürücüler dairesel bir pistte sabit hızla gitmeye çalışmış;
    ne kaza ne darboğaz varken kendiliğinden <b>dur-kalk dalgası</b> oluşmuştur. Nedeni tepki gecikmesi ve aşırı
    tepkidir: küçük bir fren arkadakilere büyüyerek aktarılır. Dalga, araçlar ileri giderken <b>geriye doğru</b> ilerler.</p>
    <h3>Dene</h3>
    <ul>
      <li>K-G gelişini artır, yeşil süresini değiştirme: kuyruk büyür. Sonra <b>Uyarlanır sinyal</b>i aç.</li>
      <li>Sola dönüş oranını %40 yap: tek sola dönen araç bütün şeridi tıkar, araç/saat düşer.</li>
      <li>Halka yolda <b>Bir sürücü fren yapsın</b>: uzay–zaman diyagramında geriye yatık kırmızı bant oluşur.</li>
      <li><b>Otonom (ACC) araçlar</b>ı aç: boşluk bırakıp sabit hızda giden birkaç araç dalgayı söndürür; dur-kalk bitince ortalama hız da artar (Stern ve ark., 2018).</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Trafik mühendisleri sinyal sürelerini döngü, yeşil oranı ve talebe göre ayarlar; akıllı (uyarlanır) sinyaller
    döngü dedektörleri ya da kameralarla kuyruğa tepki verir. Otoyolda "yığılma dalgaları" çoğu zaman kaza olmadan
    oluşur; takip mesafesini korumak ve ani fren yapmamak dalgayı küçültür.</p>
    <p><small>Model basitleştirilmiştir: tek şerit, şerit değiştirme yok; kaldırımdaki yayalar yalnızca dekordur, trafiği etkilemez.</small></p>`,
});
const LOW = /[?&]low\b/.test(location.search);
// ---------- Çevre: kent dışında hafif tepeli arazi ve ağaçlar ----------
const hfun = landscape({ seed: 17, size: 2200, height: 120, octaves: 6, warp: 0.3,
  shape: (x, z, h) => { const d = Math.max(Math.abs(x), Math.abs(z)); return -0.3 + THREE.MathUtils.smoothstep(d, 245, 1000) * (h + 8); } });
const terrain = createTerrain(hfun, { size: [3000, 3000], res: LOW ? [120, 120] : [200, 200],
  materialOptions: { water: -60, grassAmount: 0.75, forest: 0.5, grass: 0x60702f, dry: 0x9c8c58 } });
terrain.userData.noFit = true;
sim.scene.add(terrain, terrainSkirt(hfun, { inner: 1500, outer: 22000 }));
const veg = createVegetation((x, z) => (Math.max(Math.abs(x), Math.abs(z)) < 250 ? -100 : hfun(x, z)), {
  rect: [-1400, -1400, 1400, 1400], trees: LOW ? 1200 : 2600, rocks: 0, seed: 5, water: -60, kinds: { broad: 0.6, pine: 0.25, cypress: 0.15 } });
sim.scene.add(veg.group);

// ---------- Ortak araç görünümü: örneklenmiş gerçekçi otomobiller (city.js) ----------
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
const PALETTE = [0xf2f2f0, 0x1a1c1f, 0x8e959c, 0xb7bcc0, 0x24344f, 0x8a1d1d, 0x6b6f73, 0xd7d2c4, 0x2f4a3a]; // araç boyaları (kimlik → renk)
const speedColor = (v, vmax) => tmpC.setHSL(0.33 * Math.max(0, Math.min(1, v / vmax)), 0.85, 0.5);

// =====================================================================
// A) KAVŞAK
// =====================================================================
const R = 60, STOP = 7.5, LANE = 1.75, LIN = R - STOP, LOUT = R - STOP;
const V0 = 13.9, A_MAX = 1.5, B_CMF = 2.5, S0 = 2, TH = 1.2, V_TURN = 7;
const H = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // yaklaşma yönleri: Kuzeyden, Doğudan, Güneyden, Batıdan
const DNAME = ['Kuzey', 'Doğu', 'Güney', 'Batı'];
const rightOf = (h) => [-h[1], h[0]];
const axisOf = (d) => d % 2; // 0: K-G, 1: D-B

const PATHS = H.map((h) => [0, 1, 2].map((turn) => {
  const r = rightOf(h);
  const e = turn === 0 ? h : turn === 1 ? r : [-r[0], -r[1]];
  const re = rightOf(e);
  const A = [-h[0] * STOP + r[0] * LANE, -h[1] * STOP + r[1] * LANE];
  const B = [e[0] * STOP + re[0] * LANE, e[1] * STOP + re[1] * LANE];
  const k = turn === 0 ? (2 * STOP) / 3 : 0.5523 * (turn === 1 ? STOP - LANE : STOP + LANE);
  const P1 = [A[0] + h[0] * k, A[1] + h[1] * k], P2 = [B[0] - e[0] * k, B[1] - e[1] * k];
  const N = 24, pts = [], cum = [0];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    pts.push([w[0] * A[0] + w[1] * P1[0] + w[2] * P2[0] + w[3] * B[0], w[0] * A[1] + w[1] * P1[1] + w[2] * P2[1] + w[3] * B[1]]);
    if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { h, r, e, re, ek: H.findIndex((q) => q[0] === e[0] && q[1] === e[1]), pts, cum, len: cum[N] };
}));

const LIGHT_ON = [0xff3b3b, 0xffc21a, 0x2cff6a], LIGHT_OFF = [0x3a1414, 0x3a300e, 0x0f3a1c];
// --- Sahne: kent dokusu (yollar, kaldırımlar, cepheli binalar, ağaçlar), trafik ışıkları ---
const xGroup = new THREE.Group();
sim.scene.add(xGroup);
const xLabels = [];
const CL = [-225, -150, -75, 0, 75, 150, 225];
// Motor kent kiti (makeCity): gerçek geometrili binalar (girintili pencereler, balkonlar, dükkân katı, çatı donanımı),
// uzak karolarda tek çizimli kabuk; granit bordürlü kaldırımlar, rögarlar, lambalar, ağaçlar, park etmiş araçlar.
const city = makeCity({
  xs: CL, zs: CL, road: 7, walk: 3.5, seed: 8, parked: LOW ? 30 : 60, camera: [19, 10.5, 22], tile: 75, near: LOW ? 140 : 210,
  parkOk: (x, z, alongX) => (alongX ? Math.abs(z) > 1 : Math.abs(x) > 1), // ana yollar (x = 0, z = 0) trafiğe açık
  // Kameranın baktığı güneydoğu köşesi: alçak, açık bir kent meydanı (kavşak ve kuyruklar görünür kalsın)
  plan: (i, j) => (i === 3 && j === 3 ? 'plaza' : 'city'),
  treeOk: (x, z) => !(x > 0 && z > 0 && (x < 9 || z < 9)),
  floors: (x, z, r, type) => (type === 'apartment' ? 4 + Math.floor(r() * 4) + (Math.hypot(x, z) < 120 ? 1 : 0) : type === 'office' ? 7 + Math.floor(r() * 6) : undefined),
  block: (inner, i, j) => (Math.hypot(inner.cx, inner.cz) < 120
    ? { mix: { apartment: 0.86, house: 0.08, office: 0.06 }, gap: (i + j) % 2 ? 0 : 2.5, shops: 0.8 }
    : { mix: { apartment: 0.66, house: 0.3, office: 0.04 }, gap: 3, shops: 0.35 }),
});
xGroup.add(city.group);
// ---------- Köşe meydanı: çeşme, banklar, saksılar, kafe, ağaçlar, insanlar ----------
const plaza = new THREE.Group();
let plazaFolk = () => {};
xGroup.add(plaza);
{
  const Y0 = 0.16; // kaldırım/meydan döşemesi üst kotu
  const stone = mat.concrete({ color: 0xc9c2b4, stains: 0.35 }), dark = mat.concrete({ color: 0x8d8880, stains: 0.5 });
  // Meydan döşemesi: büyük format granit plaklar (derzli, lekeli, aşınmış), yağmur oluğu kanalı ve ızgaralar
  {
    const GS = groundMats();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(67.6, 67.6).rotateX(-Math.PI / 2), GS.slab);
    floor.position.set(37.5, Y0 + 0.004, 37.5); floor.receiveShadow = true; floor.userData.noFit = true; plaza.add(floor);
    const chan = new THREE.Mesh(new THREE.BoxGeometry(60, 0.03, 0.3), GS.iron);
    chan.position.set(37.5, Y0 + 0.006, 22.5); chan.receiveShadow = true; chan.userData.noAO = true; plaza.add(chan);
    const gr = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.02, 0.9), GS.iron, 8);
    const gm = new THREE.Matrix4();
    [[12, 12], [62, 12], [12, 62], [62, 62], [37.5, 8.5], [8.5, 37.5], [66.5, 37.5], [37.5, 50]].forEach(([x, z], i) => gr.setMatrixAt(i, gm.makeTranslation(x, Y0 + 0.008, z)));
    gr.receiveShadow = true; gr.userData.noAO = true; plaza.add(gr);
  }
  const iron = mat.paintedMetal({ color: 0x2b3036, wear: 0.15 }), slat = mat.wood({ color: 0x8a5a34, varnish: true });
  const add = (geo, m, x, y, z, ry = 0, par = plaza) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; par.add(o); return o; };
  // Çeşme: dönel profilli taş havuz, su yüzeyi, orta kaide ve kâse
  const FX = 26, FZ = 27;
  add(new THREE.LatheGeometry([[5.2, 0], [5.3, 0.05], [5.3, 0.55], [5.0, 0.62], [4.75, 0.6], [4.7, 0.2], [0.001, 0.2]].map(([a, b]) => new THREE.Vector2(a, b)), 72), stone, FX, Y0, FZ);
  const water = new THREE.Mesh(new THREE.CircleGeometry(4.72, 64).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x1d3c44, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 }));
  water.position.set(FX, Y0 + 0.45, FZ); water.receiveShadow = true; plaza.add(water);
  add(new THREE.LatheGeometry([[0.9, 0], [0.9, 0.3], [0.45, 0.45], [0.35, 1.5], [0.5, 1.6], [1.6, 1.75], [1.7, 1.95], [1.5, 2.0], [0.2, 1.9], [0.12, 2.6], [0.22, 2.75], [0.001, 2.8]].map(([a, b]) => new THREE.Vector2(a, b)), 48), stone, FX, Y0 + 0.2, FZ);
  // Banklar: ahşap çıtalar, döküm ayaklar
  const benchG = BufferGeometryUtils.mergeGeometries([0, 1, 2, 3].map((k) => new RoundedBoxGeometry(1.9, 0.045, 0.11, 1, 0.015).translate(0, 0.45, -0.18 + k * 0.13)).concat(
    [0, 1].map((k) => new RoundedBoxGeometry(1.9, 0.11, 0.045, 1, 0.015).rotateX(-0.25).translate(0, 0.7 + k * 0.16, -0.27 - k * 0.04))));
  const legG = BufferGeometryUtils.mergeGeometries([-0.8, 0.8].map((x) => new RoundedBoxGeometry(0.06, 0.45, 0.5, 1, 0.02).translate(x, 0.22, -0.05)).concat(
    [-0.8, 0.8].map((x) => new RoundedBoxGeometry(0.05, 0.5, 0.05, 1, 0.01).rotateX(-0.25).translate(x, 0.7, -0.3))));
  const benches = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.5; benches.push([FX + Math.cos(a) * 7.6, FZ + Math.sin(a) * 7.6, -a - Math.PI / 2]); }
  for (let k = 0; k < 4; k++) benches.push([14 + k * 6, 11.6, 0]);
  const bI = new THREE.InstancedMesh(benchG, slat, benches.length), lI = new THREE.InstancedMesh(legG, iron, benches.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  benches.forEach(([x, z, ry], i) => { m4.compose(v.set(x, Y0, z), q.setFromAxisAngle(up, ry), one); bI.setMatrixAt(i, m4); lI.setMatrixAt(i, m4); });
  for (const m of [bI, lI]) { m.castShadow = m.receiveShadow = true; plaza.add(m); }
  // Ağaçlar (yaprak kartlı, tam yoğunluk) meydanın uzak yarısında; taş ağaç çanakları
  const leaf = leafMaterial(0x4d6b2a), pit = new THREE.LatheGeometry([[1.3, 0], [1.3, 0.12], [1.1, 0.14], [0.001, 0.1]].map(([a, b]) => new THREE.Vector2(a, b)), 32);
  const treeSpots = [[16, 34], [10, 22], [36, 10], [60, 34], [44, 58], [62, 56], [24, 54]];   // ilk üçü kadrajı iki yandan çerçeveler
  const kinds = ['broad', 'oak', 'broad', 'oak'];
  const tg = kinds.map((k, i) => { const t = treeParts(k, 3 + i * 5, { dens: 1 }); return BufferGeometryUtils.mergeGeometries([t.trunk, t.crown]); });
  treeSpots.forEach(([x, z], i) => {
    const t = new THREE.Mesh(tg[i % tg.length], leaf); t.position.set(x, Y0, z); t.rotation.y = i * 1.7; t.scale.setScalar(0.85 + (i % 3) * 0.12);
    t.castShadow = t.receiveShadow = true; t.userData.noAO = true; plaza.add(t);
    add(pit, dark, x, Y0, z);
  });
  // Saksılar: beton kasalar + maki
  const box = new RoundedBoxGeometry(2.6, 0.7, 1.1, 2, 0.08), shrub = treeParts('shrub', 9, { dens: 1 });
  const shrubG = BufferGeometryUtils.mergeGeometries([shrub.trunk, shrub.crown]);
  [[14, 20, 0.8], [20, 14, 0.8], [46, 27, 0.8], [12, 42, Math.PI / 2]].forEach(([x, z, ry]) => {
    add(box, stone, x, Y0 + 0.35, z, ry);
    const s = new THREE.Mesh(shrubG, leaf); s.position.set(x, Y0 + 0.6, z); s.scale.set(0.9, 0.55, 0.45); s.rotation.y = ry; s.castShadow = true; plaza.add(s);
  });
  // Kafe köşkü: çelik çerçeve, cam cephe, saçaklı çatı; önünde şemsiyeli masalar
  const kiosk = new THREE.Group(); kiosk.position.set(43, Y0, 18); kiosk.rotation.y = Math.PI / 4; plaza.add(kiosk);
  add(new RoundedBoxGeometry(7, 0.25, 4.4, 2, 0.06), dark, 0, 0.12, 0, 0, kiosk);
  add(new RoundedBoxGeometry(6.4, 2.7, 3.8, 2, 0.04), mat.glass({ tint: 0xcfe3e6, rough: 0.08 }), 0, 1.6, 0, 0, kiosk);
  add(new RoundedBoxGeometry(6.2, 2.6, 0.2, 1, 0.03), mat.brick({ color: 0x8d4a36 }), 0, 1.55, 1.85, 0, kiosk);
  for (const x of [-3.15, 0, 3.15]) for (const z of [-1.85, 1.85]) add(new RoundedBoxGeometry(0.12, 2.8, 0.12, 1, 0.02), iron, x, 1.6, z, 0, kiosk);
  add(new RoundedBoxGeometry(8.2, 0.22, 5.6, 2, 0.08), mat.paintedMetal({ color: 0x3d4a3f, wear: 0.1 }), 0, 3.08, 0, 0, kiosk);
  const canopy = new THREE.LatheGeometry([[0.001, 0.35], [0.9, 0.2], [1.4, 0.02], [1.42, -0.12]].map(([a, b]) => new THREE.Vector2(a, b)), 8);
  const cloth = [mat.fabric({ color: 0xe9e2d0 }), mat.fabric({ color: 0x9b2f2a })];
  [[-2, -4.2], [1.5, -4.6], [-0.2, -7.4], [3.6, -7.2]].forEach(([x, z], i) => {
    add(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 8), iron, x, 1.15, z, 0, kiosk);
    add(canopy, cloth[i % 2], x, 2.2, z, 0, kiosk);
    add(new THREE.LatheGeometry([[0.001, 0.74], [0.4, 0.74], [0.4, 0.7], [0.05, 0.68], [0.04, 0.05], [0.25, 0.02], [0.25, 0], [0.001, 0]].map(([a, b]) => new THREE.Vector2(a, b)), 24), iron, x + 0.6, 0, z, 0, kiosk);
  });
  // İnsanlar: motorun eklemli figürleri (@core crowd). Banklarda oturanlar, çeşme başında ve kafe önünde duranlar,
  // çeşmenin çevresinde ve kavşağı saran dört adanın kaldırımlarında yürüyenler (yola inmezler: model yayaları içermez).
  {
    const rr = cityRng(41);
    const sitters = [], standers = [];
    // Bank: yerel +z önü (oturak merkezi z ≈ 0,02); oturan kişinin orijini (ayak) biraz öne
    const seatAt = (b, off) => { const [x, z, ry] = benches[b]; const fx = Math.sin(ry), fz = Math.cos(ry), lx = Math.cos(ry), lz = -Math.sin(ry);
      return [x + fx * 0.12 + lx * off, z + fz * 0.12 + lz * off, ry]; };
    [[0, -0.42], [0, 0.45], [2, 0.1], [3, -0.4], [4, 0.35], [7, -0.45], [7, 0.4], [9, 0]].slice(0, LOW ? 5 : 8).forEach(([b, off]) => sitters.push(seatAt(b, off)));
    const face = (x, z, tx, tz) => [x, z, Math.atan2(tx - x, tz - z)];
    const kx = (lx, lz) => [43 + lx * Math.SQRT1_2 + lz * Math.SQRT1_2, 18 - lx * Math.SQRT1_2 + lz * Math.SQRT1_2];   // köşk yerel → dünya
    const [ka, kb] = kx(0, -2.9), [wa, wb] = kx(0.2, -5.9);
    standers.push(face(ka, kb, 43, 18), face(33.4, 17.2, 34.6, 18), face(34.6, 18, 33.4, 17.2));
    if (!LOW) standers.push(face(wa, wb, 43 - 1.8, 18 - 7.4 * Math.SQRT1_2), face(26 + 6.1 * Math.cos(1.05), 27 + 6.1 * Math.sin(1.05), 26, 27), face(18.8, 18.3, 19.5, 17.4), face(19.6, 17.5, 18.8, 18.3));
    // Yürüyüş halkaları: çeşme çevresi (daire) ve kavşak çevresindeki dört adanın kaldırımı (dikdörtgen; bordürden 1,9–2,8 m içeride)
    const walkers = [];
    const nF = LOW ? 3 : 5, nB = LOW ? 4 : 9;
    for (let k = 0; k < nF; k++) walkers.push({ ring: 10.2 + (rr() - 0.5) * 0.8, s: k / nF + rr() * 0.1, v: 1.1 + rr() * 0.35, dir: k % 2 ? 1 : -1 });
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) for (let k = 0; k < nB; k++) {
      const d = 1.9 + rr() * 0.9, a = 3.5 + d, b = 71.5 - d;
      walkers.push({ rect: sx > 0 ? (sz > 0 ? [a, a, b, b] : [a, -b, b, -a]) : (sz > 0 ? [-b, a, -a, b] : [-b, -b, -a, -a]), s: (k + rr() * 0.6) / nB, v: 1.05 + rr() * 0.45, dir: k % 2 ? 1 : -1 });
    }
    const n = sitters.length + standers.length + walkers.length;
    const c = crowd(n, { seed: 23, camera: sim.camera, outfits: { casual: 6, office: 3, student: 2 }, seat: 0.47 });
    plaza.add(c.group);
    let i = 0;
    for (const [x, z, ry] of sitters) c.set(i++, x, Y0, z, ry, 'sit');
    const st0 = i;
    for (const [x, z, ry] of standers) c.set(i++, x, Y0, z, ry, 'stand');
    if (!LOW) c.dress(st0 + 3, { outfit: 'waiter', seed: 5 });
    c.dress(st0, { outfit: 'office', seed: 8 });
    const w0 = i, yaw = walkers.map((w) => 0);
    const loopAt = (w) => {
      if (w.ring) { const a = w.s * Math.PI * 2; return [26 + Math.cos(a) * w.ring, 27 + Math.sin(a) * w.ring, -Math.sin(a) * w.dir, Math.cos(a) * w.dir]; }
      const [x0, z0, x1, z1] = w.rect, W = x1 - x0, D = z1 - z0, L = 2 * (W + D);
      let p = (((w.s % 1) + 1) % 1) * L;
      let x, z, dx, dz;
      if (p < W) { x = x0 + p; z = z0; dx = 1; dz = 0; }
      else if ((p -= W) < D) { x = x1; z = z0 + p; dx = 0; dz = 1; }
      else if ((p -= D) < W) { x = x1 - p; z = z1; dx = -1; dz = 0; }
      else { p -= W; x = x0; z = z1 - p; dx = 0; dz = -1; }
      return [x, z, dx * w.dir, dz * w.dir];
    };
    const len = (w) => (w.ring ? Math.PI * 2 * w.ring : 2 * (w.rect[2] - w.rect[0] + w.rect[3] - w.rect[1]));
    plazaFolk = (real, moving) => {
      walkers.forEach((w, k) => {
        if (moving) w.s += (w.dir * w.v * Math.min(real, 0.1)) / len(w);
        const [x, z, dx, dz] = loopAt(w);
        let d = Math.atan2(dx, dz) - yaw[k];
        d = Math.atan2(Math.sin(d), Math.cos(d));
        yaw[k] += real > 0 ? d * Math.min(1, real * 6) : d;
        c.set(w0 + k, x, Y0, z, yaw[k], 'walk');
      });
      c.update(performance.now() / 1000);
    };
    plazaFolk(0, false);
  }
}
{
  // Durma çizgileri (gelen şeridin önünde)
  const paint = groundMats().paint;
  for (const h of H) {
    const r = rightOf(h);
    const line = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.02, 0.4), paint);
    line.position.set(-h[0] * STOP + r[0] * LANE, 0.014, -h[1] * STOP + r[1] * LANE);
    line.rotation.y = Math.atan2(h[0], h[1]);
    line.receiveShadow = true;
    xGroup.add(line);
  }
}
// Trafik lambaları (her kolun sağında, gelen araçlara dönük): direk + gövde + siperlikli üç lamba
const SIG = {
  pole: new THREE.LatheGeometry([[0.001, 0], [0.15, 0], [0.15, 0.12], [0.08, 0.22], [0.07, 3.9], [0.001, 3.95]].map(([a, b]) => new THREE.Vector2(a, b)), 14),
  body: new RoundedBoxGeometry(0.4, 1.12, 0.28, 2, 0.06),
  plate: new RoundedBoxGeometry(0.66, 1.36, 0.03, 2, 0.05),
  visor: new THREE.CylinderGeometry(0.15, 0.15, 0.24, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2),
  bulb: new THREE.CircleGeometry(0.115, 24),
  mPole: mat.paintedMetal({ color: 0x3b3f44, wear: 0.25 }), mBody: mat.paintedMetal({ color: 0x1b1d20, wear: 0.12 }),
};
const heads = H.map((h, d) => {
  const r = rightOf(h);
  const g = new THREE.Group();
  g.position.set(-h[0] * (STOP + 1.2) + r[0] * 4.6, 0.15, -h[1] * (STOP + 1.2) + r[1] * 4.6);
  g.rotation.y = Math.atan2(-h[0], -h[1]);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(SIG.pole, SIG.mPole, 0, 0, 0);
  add(SIG.body, SIG.mBody, 0, 4.45, 0.12);
  add(SIG.plate, SIG.mBody, 0, 4.45, -0.04);
  const bulbs = [0, 1, 2].map((k) => {
    add(SIG.visor, SIG.mBody, 0, 4.82 - k * 0.37, 0.38);
    const m = add(SIG.bulb, mat.glow({ color: LIGHT_OFF[k], intensity: 0.4 }), 0, 4.82 - k * 0.37, 0.265);
    m.castShadow = false;
    return m;
  });
  xGroup.add(g);
  const qLabel = sim.label('', { parent: xGroup, position: [-h[0] * 34 + r[0] * 6, 3, -h[1] * 34 + r[1] * 6] });
  xLabels.push(qLabel);
  return { bulbs, qLabel, d };
});
const sigLabel = sim.label('', { parent: xGroup, position: [0, 10, 0], className: 'big' });
xLabels.push(sigLabel);

const XMAX = 260;
const xFleet = carFleet(XMAX, { seed: 3 });
xGroup.add(xFleet.group);
const xUsed = new Uint8Array(XMAX), xPrev = new Uint8Array(XMAX);

// --- Kavşak durumu ---
let X;
function resetX() {
  X = {
    t: 0, queues: [[], [], [], []], exits: [[], [], [], []], backlog: [0, 0, 0, 0], nextArr: [0, 0, 0, 0].map(() => rand(0, 4)),
    phase: 0, phaseT: 0, waits: [], passes: [], nextId: 0, chartT: 0,
  };
  // Isınma: kavşak boş başlamasın
  for (let i = 0; i < 600; i++) stepX(0.1);
  X.t = 0; X.passes = []; X.waits = [];
  xChart?.clear();
}
// Faz: [K-G durumu, D-B durumu]; G yeşil, Y sarı, R kırmızı
const PHASES = [['G', 'R'], ['Y', 'R'], ['R', 'R'], ['R', 'G'], ['R', 'Y'], ['R', 'R']];
const axisState = (a) => PHASES[X.phase][a];

function phaseDur(p) {
  if (p === 1 || p === 4) return 3;
  if (p === 2 || p === 5) return 2;
  return p === 0 ? gNS.value : gEW.value;
}
function axisDemand(a, range) {
  let n = 0;
  for (const d of [a, a + 2]) for (const c of X.queues[d]) if (c.s < LIN && c.s > LIN - range) n++;
  return n;
}
function axisQueue(a) {
  let n = X.backlog[a] + X.backlog[a + 2];
  for (const d of [a, a + 2]) for (const c of X.queues[d]) if (c.s < LIN && c.v < 2) n++;
  return n;
}
function stepSignal(h) {
  X.phaseT += h;
  const p = X.phase;
  let done = X.phaseT >= phaseDur(p);
  if (adaptive.value && (p === 0 || p === 3)) {
    // Uyarlanır: en az 7 s, en çok 50 s yeşil; yeşil yön boşalınca ya da karşı kuyruk çok birikince geçiş
    const a = p === 0 ? 0 : 1, o = 1 - a;
    const gDem = axisDemand(a, 35), oQ = axisQueue(o);
    done = X.phaseT >= 7 && ((gDem === 0 && oQ > 0) || X.phaseT >= 50 || (X.phaseT >= 15 && oQ > 3 * gDem + 6));
  }
  if (done) { X.phase = (p + 1) % 6; X.phaseT = 0; }
}

function idmA(v, gap, dv, v0) {
  const s = S0 + Math.max(0, v * TH + (v * dv) / (2 * Math.sqrt(A_MAX * B_CMF)));
  return A_MAX * (1 - Math.pow(v / v0, 4) - Math.pow(s / Math.max(gap, 0.1), 2));
}

function spawn(h) {
  const lam = [nsRate.value, ewRate.value, nsRate.value, ewRate.value];
  for (let d = 0; d < 4; d++) {
    X.nextArr[d] -= h;
    while (X.nextArr[d] <= 0) { X.backlog[d]++; X.nextArr[d] += -Math.log(1 - Math.random()) * 3600 / lam[d]; }
    const q = X.queues[d], last = q[q.length - 1];
    if (X.backlog[d] > 0 && (!last || last.s > CAR_LEN + 5)) {
      X.backlog[d]--;
      const u = Math.random(), pl = leftPct.value / 100;
      const turn = u < pl ? 2 : u < pl + 0.15 ? 1 : 0;
      const v = last ? Math.min(V0 * 0.9, last.v + 1) : V0 * 0.9;
      q.push({ d, turn, s: 0, v, acc: 0, wait: 0, id: X.nextId++, color: PALETTE[X.nextId % PALETTE.length], passed: false });
    }
  }
}

// Karşı yönden gelen (sola dönmeyen) araçlarla çakışma var mı?
function opposingConflict(d) {
  const o = (d + 2) % 4, a = axisOf(d);
  for (const oc of X.queues[o]) {
    if (oc.turn === 2) continue;
    const len = PATHS[o][oc.turn].len;
    if (oc.s > LIN + len - 3) continue;
    if (oc.s >= LIN - 1) return true;
    const dist = LIN - oc.s;
    if (axisState(a) !== 'G' && dist > (oc.v * oc.v) / 8 + 1) continue; // duracak
    if (oc.v > 1 && dist / oc.v < 3.5) return true;
    if (oc.v <= 1 && dist < 3 && axisState(a) === 'G') return true;
  }
  return false;
}
// Kavşak içinde ilerlemiş (kararlı) karşı sola dönen var mı?
function opposingLeftInBox(d) {
  for (const oc of X.queues[(d + 2) % 4]) if (oc.turn === 2 && oc.s > LIN + 2.6 && oc.s < LIN + PATHS[oc.d][2].len - 3) return true;
  return false;
}
function crossBoxBusy(a) {
  for (const d of [1 - a, 3 - a]) for (const c of X.queues[d]) if (c.s > LIN - 0.5 && c.s < LIN + PATHS[d][c.turn].len - 1.5) return true;
  return false;
}

function stepX(h) {
  X.t += h;
  stepSignal(h);
  spawn(h);
  const busy = [crossBoxBusy(0), crossBoxBusy(1)];
  for (let d = 0; d < 4; d++) {
    const q = X.queues[d], a = axisOf(d), st = axisState(a);
    for (let i = 0; i < q.length; i++) {
      const c = q[i], P = PATHS[d][c.turn];
      const v0 = c.turn && c.s > LIN - 30 ? V_TURN : V0;
      let acc = A_MAX * (1 - Math.pow(c.v / v0, 4));
      if (i > 0) acc = Math.min(acc, idmA(c.v, q[i - 1].s - c.s - CAR_LEN, c.v - q[i - 1].v, v0));
      const ex = X.exits[P.ek], tail = ex[ex.length - 1];
      if (tail) acc = Math.min(acc, idmA(c.v, LIN + P.len - c.s + tail.u - CAR_LEN, c.v - tail.v, v0));
      if (c.s < LIN) {
        const dist = LIN - c.s, canStop = dist > (c.v * c.v) / 8 + 0.5;
        let stop = st === 'R' || (st === 'Y' && canStop);
        if (!stop && canStop && (busy[a] || (c.turn !== 2 && opposingLeftInBox(d)))) stop = true;
        if (stop) acc = Math.min(acc, idmA(c.v, dist + S0 - 0.6, c.v, v0));
      }
      if (c.turn === 2 && c.s < LIN + 2.5 && opposingConflict(d)) acc = Math.min(acc, idmA(c.v, LIN + 2.5 - c.s + S0 - 0.3, c.v, v0));
      c.acc = Math.max(-8, Math.min(A_MAX, acc));
    }
  }
  for (let k = 0; k < 4; k++) {
    const ex = X.exits[k];
    for (let i = 0; i < ex.length; i++) {
      const c = ex[i];
      let acc = A_MAX * (1 - Math.pow(c.v / V0, 4));
      if (i > 0) acc = Math.min(acc, idmA(c.v, ex[i - 1].u - c.u - CAR_LEN, c.v - ex[i - 1].v, V0));
      c.acc = Math.max(-8, Math.min(A_MAX, acc));
    }
  }
  // Konum güncelle
  for (let d = 0; d < 4; d++) {
    const q = X.queues[d];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      const v1 = Math.max(0, c.v + c.acc * h);
      c.s += (c.v + v1) * 0.5 * h;
      c.v = v1;
      if (i > 0 && q[i - 1].s - c.s < CAR_LEN + 0.3) { c.s = q[i - 1].s - CAR_LEN - 0.3; c.v = Math.min(c.v, q[i - 1].v); }
      if (c.v < 1.5) c.wait += h;
      if (!c.passed && c.s >= LIN) { c.passed = true; X.passes.push(X.t); }
    }
    while (q.length && q[0].s >= LIN + PATHS[d][q[0].turn].len) {
      const c = q.shift(), P = PATHS[d][c.turn];
      c.u = c.s - LIN - P.len;
      c.ek = P.ek;
      X.exits[P.ek].push(c);
      X.waits.push(c.wait);
      if (X.waits.length > 80) X.waits.shift();
    }
  }
  for (let k = 0; k < 4; k++) {
    const ex = X.exits[k];
    for (const c of ex) {
      const v1 = Math.max(0, c.v + c.acc * h);
      c.u += (c.v + v1) * 0.5 * h;
      c.v = v1;
    }
    ex.sort((p, q) => q.u - p.u);
    while (ex.length && ex[0].u > LOUT) ex.shift();
  }
  while (X.passes.length && X.passes[0] < X.t - 300) X.passes.shift();
}

function poseX(c, exit) {
  if (exit) {
    const e = H[c.ek], re = rightOf(e), dl = STOP + c.u;
    return [e[0] * dl + re[0] * LANE, e[1] * dl + re[1] * LANE, Math.atan2(e[0], e[1])];
  }
  const P = PATHS[c.d][c.turn];
  if (c.s < LIN) {
    const dl = R - c.s;
    return [-P.h[0] * dl + P.r[0] * LANE, -P.h[1] * dl + P.r[1] * LANE, Math.atan2(P.h[0], P.h[1])];
  }
  const u = Math.min(c.s - LIN, P.len - 1e-6);
  let i = 1;
  while (i < P.cum.length - 1 && P.cum[i] < u) i++;
  const a = P.pts[i - 1], b = P.pts[i], f = (u - P.cum[i - 1]) / (P.cum[i] - P.cum[i - 1] || 1);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[0] - a[0], b[1] - a[1])];
}

function renderX() {
  const put = (c, exit) => {
    const slot = c.id % XMAX;
    const [x, z, yaw] = poseX(c, exit);
    const L = xFleet.info(slot).L, fx = Math.sin(yaw), fz = Math.cos(yaw);
    xFleet.set(slot, x - fx * L / 2, 0, z - fz * L / 2, yaw - Math.PI / 2, (exit ? c.u + 300 : c.s) / 0.33);
    xFleet.tint(slot, colorBySpeed.value ? speedColor(c.v, V0) : null);
    xUsed[slot] = 1;
  };
  xUsed.fill(0);
  for (const q of X.queues) for (const c of q) put(c, false);
  for (const ex of X.exits) for (const c of ex) put(c, true);
  for (let i = 0; i < XMAX; i++) if (xPrev[i] && !xUsed[i]) xFleet.hide(i);
  xPrev.set(xUsed);
  xFleet.commit();
  // Işıklar
  for (const hd of heads) {
    const st = axisState(axisOf(hd.d));
    const on = st === 'R' ? 0 : st === 'Y' ? 1 : 2;
    hd.bulbs.forEach((b, k) => { b.material.emissive.setHex(k === on ? LIGHT_ON[k] : LIGHT_OFF[k]); b.material.emissiveIntensity = k === on ? 6 : 0.35; });
    const qn = X.backlog[hd.d] + X.queues[hd.d].filter((c) => c.s < LIN && c.v < 2).length;
    hd.qLabel.setText(`${DNAME[hd.d]} · kuyruk ${qn}`);
  }
  const p = X.phase, left = Math.max(0, phaseDur(p) - X.phaseT);
  const txt = p === 0 ? '🟢 K-G yeşil' : p === 3 ? '🟢 D-B yeşil' : p === 1 ? '🟡 K-G sarı' : p === 4 ? '🟡 D-B sarı' : '🔴 Tüm yönler kırmızı';
  sigLabel.setText(adaptive.value && (p === 0 || p === 3) ? `${txt} · ${fmt(X.phaseT, 0)} s (uyarlanır)` : `${txt} · ${fmt(Math.ceil(left), 0)} s`);
}

// =====================================================================
// B) HALKA YOL
// =====================================================================
const ring = createRing({ L: 230, n: 22 });
const RR = ring.L / (2 * Math.PI);
const rGroup = new THREE.Group();
sim.scene.add(rGroup);
const rLabels = [];
{
  const GM = groundMats();
  const road = new THREE.Mesh(new THREE.RingGeometry(RR - 3.2, RR + 3.2, 180, 2).rotateX(-Math.PI / 2), GM.asphalt);
  road.position.y = 0.03; road.receiveShadow = true;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(RR - 3.2, 120).rotateX(-Math.PI / 2), GM.lawn);
  inner.position.y = 0.025; inner.receiveShadow = true;
  const apron = new THREE.Mesh(new THREE.RingGeometry(RR + 3.2, RR + 16, 180, 1).rotateX(-Math.PI / 2), GM.lawn);
  apron.position.y = 0.02; apron.receiveShadow = true;
  rGroup.add(road, inner, apron);
  // Kenar çizgileri (sürekli beyaz) ve iç kenarda trafik konileri
  for (const rr of [RR - 3.0, RR + 3.0]) {
    const l = new THREE.Mesh(new THREE.RingGeometry(rr - 0.08, rr + 0.08, 200, 1).rotateX(-Math.PI / 2), GM.paint);
    l.position.y = 0.04; l.receiveShadow = true; rGroup.add(l);
  }
  const coneG = new THREE.LatheGeometry([[0.001, 0], [0.22, 0], [0.22, 0.035], [0.13, 0.05], [0.035, 0.7], [0.001, 0.71]].map(([a, b]) => new THREE.Vector2(a, b)), 16);
  const nc = 36, cones = new THREE.InstancedMesh(coneG, mat.plastic({ color: 0xff5a14, gloss: 0.35 }), nc);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < nc; i++) { const th = (i / nc) * Math.PI * 2; cones.setMatrixAt(i, m4.makeTranslation(Math.cos(th) * (RR - 4.1), 0.03, Math.sin(th) * (RR - 4.1))); }
  cones.castShadow = true;
  rGroup.add(cones);
  // Ağaçlar: iç alanda birkaç, dışarıda halka boyunca
  const pts = [];
  for (let i = 0; i < 9; i++) { const th = rand(0, Math.PI * 2), rr = rand(4, RR - 11); pts.push([Math.cos(th) * rr, Math.sin(th) * rr, 0, 1]); }
  for (let i = 0; i < 60; i++) { const th = rand(0, Math.PI * 2), rr = rand(RR + 20, RR + 70); pts.push([Math.cos(th) * rr, Math.sin(th) * rr, 0, 1]); }
  const tr = streetTrees(pts, 12);
  rGroup.add(tr.group);
  rGroup.userData.trees = tr;
  rLabels.push(sim.label(`Halka yol · çevre ${fmt(ring.L)} m`, { parent: rGroup, position: [0, 2, 0] }));
}
const RMAX = 40;
const rFleet = carFleet(RMAX, { seed: 11 });
// Otonom araç: tavanda lidar başlığı (siyah gövde + camgöbeği ışık halkası)
const lidarBody = new THREE.InstancedMesh(new THREE.LatheGeometry([[0.001, 0], [0.2, 0], [0.2, 0.05], [0.14, 0.07], [0.14, 0.2], [0.12, 0.24], [0.001, 0.25]].map(([a, b]) => new THREE.Vector2(a, b)), 20), mat.plastic({ color: 0x151618, gloss: 0.6 }), RMAX);
const lidarRing = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.145, 0.145, 0.05, 20, 1, true).translate(0, 0.15, 0), mat.glow({ color: 0x22d3ee, intensity: 3 }), RMAX);
for (const m of [lidarBody, lidarRing]) { m.count = 0; m.frustumCulled = false; }
rGroup.add(rFleet.group, lidarBody, lidarRing);
const brakeLabel = sim.label('🛑 Fren!', { parent: rGroup, position: [0, 3, 0] });
rLabels.push(brakeLabel);
let ringAcc = 0, ringSteps = 0;
const AV_COL = new THREE.Color(0xe0f2fe);

function renderRing() {
  const n = ring.cars.length;
  let m = 0;
  for (let i = 0; i < RMAX; i++) {
    if (i >= n) { rFleet.hide(i); continue; }
    const c = ring.cars[i], th = (c.x / ring.L) * Math.PI * 2;
    const yaw = Math.atan2(-Math.sin(th), Math.cos(th)), fx = -Math.sin(th), fz = Math.cos(th);
    const inf = rFleet.info(i), cx = Math.cos(th) * RR - fx * inf.L / 2, cz = Math.sin(th) * RR - fz * inf.L / 2;
    rFleet.set(i, cx, 0, cz, yaw - Math.PI / 2, c.x / 0.33);
    rFleet.tint(i, c.av ? AV_COL : ringColor.value ? speedColor(c.v, ring.v0 * 0.85) : null);
    if (c.av) {
      dummy.position.set(cx, inf.H - 0.02, cz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      lidarBody.setMatrixAt(m, dummy.matrix); lidarRing.setMatrixAt(m++, dummy.matrix);
    }
  }
  rFleet.commit();
  lidarBody.count = lidarRing.count = m;
  lidarBody.instanceMatrix.needsUpdate = lidarRing.instanceMatrix.needsUpdate = true;
  const bc = ring.cars[ring.brakeCar];
  brakeLabel.visible = mode.value === 'ring' && ring.brakeT > 0 && !!bc;
  if (bc) { const th = (bc.x / ring.L) * Math.PI * 2; brakeLabel.position.set(Math.cos(th) * RR, 3.2, Math.sin(th) * RR); }
}

// Uzay–zaman diyagramı (konum ↑, zaman →; kırmızı = yavaş)
const stWrap = document.createElement('div');
stWrap.className = 'chart';
stWrap.innerHTML = '<div class="chart-title">Uzay–zaman diyagramı (dikey: halkadaki konum, yatay: zaman)</div>';
const stCv = document.createElement('canvas');
stCv.width = 300; stCv.height = 130;
stCv.style.cssText = 'width:100%;height:130px;display:block;border-radius:6px;background:#0b1220';
stWrap.append(stCv);
const stLegend = document.createElement('div');
stLegend.className = 'legend';
stLegend.innerHTML = '<span><i style="background:#ef4444"></i>duran</span><span><i style="background:#eab308"></i>yavaş</span><span><i style="background:#22c55e"></i>akıcı</span><span><i style="background:#e0f2fe"></i>otonom</span>';
stWrap.append(stLegend);
const stCtx = stCv.getContext('2d');
function stColumn() {
  const W = stCv.width, Hh = stCv.height;
  stCtx.drawImage(stCv, -1, 0);
  stCtx.fillStyle = '#0b1220';
  stCtx.fillRect(W - 1, 0, 1, Hh);
  for (const c of ring.cars) {
    const y = Hh - 1 - (c.x / ring.L) * (Hh - 2);
    stCtx.fillStyle = c.av ? '#e0f2fe' : '#' + speedColor(c.v, ring.v0 * 0.85).getHexString();
    stCtx.fillRect(W - 1, y - 1, 1, 2);
  }
}
function resetRing() {
  ring.reset();
  ring.setAV(avOn.value ? avCount.value : 0);
  ringAcc = 0; ringSteps = 0;
  stCtx.fillStyle = '#0b1220';
  stCtx.fillRect(0, 0, stCv.width, stCv.height);
  rChart?.clear();
}

// =====================================================================
// Arayüz
// =====================================================================
const ui = sim.ui;
const secs = { x: [], ring: [] };
const sec = (title, m) => { const inner = ui.section(title); secs[m].push(inner.parentElement); return inner; };

ui.section('Mod');
const mode = ui.segmented({
  options: [{ value: 'x', label: '🚦 Kavşak' }, { value: 'ring', label: '⭕ Halka yol (hayalet sıkışıklık)' }],
  value: 'x', onChange: (v) => setMode(v),
});

// Kamera: köşe meydanından (fotoğraf), cadde boyunca (yaya gözü), kuş bakışı (bütün kuyruklar)
const VIEWS = {
  x: { kose: [[19, 10.5, 22], [-8, 1, -8]], cadde: [[5.5, 4.2, 58], [-1, 2.2, -4]], kus: [[10, 150, 70], [0, 0, 0]] },
  ring: { kose: [[30, 34, 70], [0, 0, 2]], cadde: [[RR + 12, 3.5, 12], [RR - 8, 1, -30]], kus: [[0, 120, 45], [0, 0, 0]] },
};
function setView(v) { const c = VIEWS[mode.value][v]; sim.moveCamera(c[0], c[1]); }
const view = ui.segmented({ label: 'Bakış', options: [{ value: 'kose', label: 'Köşe' }, { value: 'cadde', label: 'Cadde' }, { value: 'kus', label: 'Kuş bakışı' }], value: 'kose', onChange: setView });

sec('Kavşak · hazır senaryolar', 'x');
const XPRESETS = {
  denge: { ns: 450, ew: 300, gns: 25, gew: 20, left: 15, ad: false },
  ana: { ns: 750, ew: 150, gns: 20, gew: 20, left: 10, ad: false },
  zirve: { ns: 700, ew: 600, gns: 30, gew: 30, left: 25, ad: false },
  gece: { ns: 120, ew: 80, gns: 30, gew: 30, left: 15, ad: false },
};
const xPreset = ui.segmented({
  options: [{ value: 'denge', label: 'Dengeli' }, { value: 'ana', label: 'Ana cadde' }, { value: 'zirve', label: 'Akşam zirvesi' }, { value: 'gece', label: 'Gece' }],
  value: 'denge', onChange: (v) => applyX(v),
});
sec('Kavşak · sinyal', 'x');
const gNS = ui.slider({ label: 'K-G yeşil süresi', min: 5, max: 60, step: 1, value: 25, unit: 's' });
const gEW = ui.slider({ label: 'D-B yeşil süresi', min: 5, max: 60, step: 1, value: 20, unit: 's' });
const adaptive = ui.toggle({ label: 'Uyarlanır (akıllı) sinyal', value: false });
const cycleText = ui.text('', 'card');
sec('Kavşak · trafik talebi', 'x');
const nsRate = ui.slider({ label: 'K-G geliş (her yönden)', min: 50, max: 900, step: 10, value: 450, unit: 'araç/sa' });
const ewRate = ui.slider({ label: 'D-B geliş (her yönden)', min: 50, max: 900, step: 10, value: 300, unit: 'araç/sa' });
const leftPct = ui.slider({ label: 'Sola dönen oranı', min: 0, max: 40, step: 1, value: 15, unit: '%' });
const colorBySpeed = ui.toggle({ label: 'Araçları hıza göre renklendir', value: false });
sec('Kavşak · durum', 'x');
const stWait = ui.stat({ label: 'Ort. bekleme', unit: 's' });
const stQns = ui.stat({ label: 'Kuyruk K-G', unit: 'araç' });
const stQew = ui.stat({ label: 'Kuyruk D-B', unit: 'araç' });
const stFlow = ui.stat({ label: 'Geçen', unit: 'araç/sa' });
const xChart = ui.chart({ title: 'Kuyruk uzunluğu (araç)', series: [{ name: 'K-G', color: '#60a5fa' }, { name: 'D-B', color: '#f97316' }, { name: 'Ort. bekleme (s)', color: '#e879f9' }], maxPoints: 240, yMin: 0 });

sec('Halka yol · sürücüler', 'ring');
const RPRESETS = {
  sugi: { n: 22, T: 1.0, tau: 0.6, av: false },
  dikkat: { n: 22, T: 1.8, tau: 0.3, av: false },
  otonom: { n: 22, T: 1.0, tau: 0.6, av: true, k: 3 },
  yogun: { n: 32, T: 1.0, tau: 0.7, av: false },
};
const rPreset = ui.segmented({
  options: [{ value: 'sugi', label: 'Sugiyama' }, { value: 'dikkat', label: 'Dikkatli' }, { value: 'otonom', label: 'Otonom karışım' }, { value: 'yogun', label: 'Yoğun' }],
  value: 'sugi', onChange: (v) => applyRing(v),
});
const nCars = ui.slider({ label: 'Araç sayısı', min: 10, max: 36, step: 1, value: 22, onChange: (v) => { ring.setCount(v); ring.setAV(avOn.value ? avCount.value : 0); } });
const followT = ui.slider({ label: 'Takip mesafesi (zaman aralığı)', min: 0.6, max: 2.4, step: 0.1, value: 1.0, unit: 's', onChange: (v) => (ring.T = v) });
const tauS = ui.slider({ label: 'Tepki süresi', min: 0.2, max: 1.2, step: 0.05, value: 0.6, unit: 's', onChange: (v) => (ring.tau = v) });
ui.button({ label: '🛑 Bir sürücü fren yapsın', variant: 'danger', onClick: () => { ring.brake(Math.floor(Math.random() * ring.cars.length)); sim.toast('Bir sürücü sertçe fren yaptı — dalgayı izle', 'warn'); } });
const ringColor = ui.toggle({ label: 'Araçları hıza göre renklendir', value: true });
const avOn = ui.toggle({ label: 'Otonom (ACC) araçlar', value: false, onChange: () => ring.setAV(avOn.value ? avCount.value : 0) });
const avCount = ui.slider({ label: 'Otonom araç sayısı', min: 1, max: 6, step: 1, value: 3, onChange: (v) => avOn.value && ring.setAV(v) });
sec('Halka yol · durum', 'ring');
const rMean = ui.stat({ label: 'Ortalama hız', unit: 'km/sa' });
const rStop = ui.stat({ label: 'Duran araç' });
const rSd = ui.stat({ label: 'Hız dalgalanması', unit: 'km/sa' });
const rFlow = ui.stat({ label: 'Akış', unit: 'araç/sa' });
const rChart = ui.chart({ title: 'Hız (km/sa)', series: [{ name: 'Ortalama', color: '#22c55e' }, { name: 'En yavaş araç', color: '#ef4444' }], maxPoints: 240, yMin: 0 });
ui.append(stWrap);

function applyX(name) {
  const p = XPRESETS[name];
  nsRate.set(p.ns); ewRate.set(p.ew); gNS.set(p.gns); gEW.set(p.gew); leftPct.set(p.left); adaptive.set(p.ad);
  resetX();
}
function applyRing(name) {
  const p = RPRESETS[name];
  ring.n = p.n; nCars.set(p.n); followT.set(p.T); tauS.set(p.tau); ring.T = p.T; ring.tau = p.tau;
  avOn.set(p.av); if (p.k) avCount.set(p.k);
  resetRing();
}

function setMode(m) {
  xGroup.visible = m === 'x';
  rGroup.visible = m === 'ring';
  xLabels.forEach((l) => (l.visible = m === 'x'));
  rLabels.forEach((l) => (l.visible = m === 'ring'));
  secs.x.forEach((e) => (e.style.display = m === 'x' ? '' : 'none'));
  secs.ring.forEach((e) => (e.style.display = m === 'ring' ? '' : 'none'));
  setView(view.value);
}

// ---------- Döngü ----------
let statT = 0;
sim.onUpdate((dt) => {
  if (mode.value === 'x') {
    const n = Math.ceil(dt / 0.1);
    for (let i = 0; i < n; i++) stepX(dt / n);
    X.chartT += dt;
    if (X.chartT >= 1) {
      X.chartT = 0;
      const w = X.waits.length ? X.waits.reduce((a, b) => a + b, 0) / X.waits.length : 0;
      xChart.push([axisQueue(0), axisQueue(1), w]);
    }
  } else {
    ringAcc += Math.min(dt, 1);
    while (ringAcc >= RING_DT) {
      ring.step(RING_DT);
      ringAcc -= RING_DT;
      if (++ringSteps % 10 === 0) stColumn();
      if (ringSteps % 10 === 0) {
        const s = ringStats(ring);
        rChart.push([s.mean * 3.6, s.min * 3.6]);
      }
    }
  }
});

let vt = 0;
sim.onRender((real) => {
  vt += real;
  veg.update(vt, 0.7);
  if (mode.value === 'x') { renderX(); city.update(vt, 0.7); plazaFolk(real, !sim.paused); } else { renderRing(); rGroup.userData.trees.update(vt, 0.7); }
  statT += real;
  if (statT < 0.4) return;
  statT = 0;
  if (mode.value === 'x') {
    const w = X.waits.length ? X.waits.reduce((a, b) => a + b, 0) / X.waits.length : 0;
    stWait.set(fmt(w, 1), w > 40 ? 'bad' : w > 20 ? 'warn' : 'good');
    const qa = axisQueue(0), qb = axisQueue(1);
    stQns.set(qa, qa > 15 ? 'bad' : qa > 8 ? 'warn' : '');
    stQew.set(qb, qb > 15 ? 'bad' : qb > 8 ? 'warn' : '');
    const span = Math.min(300, X.t);
    stFlow.set(span > 20 ? fmt((X.passes.length / span) * 3600, 0) : '—');
    if (adaptive.value) cycleText.set('Uyarlanır mod: yeşil en az 7, en çok 50 s. Yeşil yöndeki akış kesilince ya da karşı kuyruk çok büyüyünce ışık değişir.');
    else {
      const C = gNS.value + gEW.value + 10;
      cycleText.set(`Döngü süresi <b>${C} s</b> (yeşiller + 2×3 s sarı + 2×2 s tüm kırmızı) · K-G payı <b>%${fmt((gNS.value / C) * 100, 0)}</b>, D-B payı <b>%${fmt((gEW.value / C) * 100, 0)}</b>`);
    }
  } else {
    const s = ringStats(ring);
    rMean.set(fmt(s.mean * 3.6, 1));
    rStop.set(s.stopped, s.stopped > 2 ? 'bad' : s.stopped ? 'warn' : 'good');
    rSd.set(fmt(s.sd * 3.6, 1), s.sd > 3 ? 'bad' : s.sd > 1.5 ? 'warn' : 'good');
    rFlow.set(fmt(s.flow, 0));
  }
});

sim.onReset(() => { if (mode.value === 'x') resetX(); else resetRing(); });
resetX();
resetRing();
setMode('x');
