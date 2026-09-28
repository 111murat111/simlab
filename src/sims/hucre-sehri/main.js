// Hücre Şehri — hayvan hücresini bir şehir gibi yönet: glikoz + O₂ → ATP, protein üretimi, kargo ve virüs savunması.
import { createSim, THREE, BufferGeometryUtils, clamp, rand, pick, fmt, TAU, mat as M, procedural } from '@core';
import { darkMedium, blobGeometry, loftTube, fbm, tissue, softDot } from './bio.js';

const CELL_R = 10, ZS = 0.82;        // hücre yarıçapı ve z basıklığı (elips)
const STEP = 0.1;                    // sabit simülasyon adımı (sn)
const ATP_MAX = 400;

const sim = createSim({
  studio: { mood: 'lab', color: 0x3a4a52, warmth: 0.1, key: { el: 62, az: 200, power: 1.4 }, radius: 80, height: 40 },
  camera: { position: [2.2, 11.6, 13.4], target: [0, -0.3, 0.4], fov: 48 },
  controls: { maxPolarAngle: 1.3, minDistance: 8, maxDistance: 42 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bir <b>hayvan hücresi</b>ni tepesi kesilip açılmış hâlde (kesit görünümü) yukarıdan görüyorsun: kalın <b>zar</b>ın içinde yarı saydam
    <b>sitoplazma</b>, çift zarlı <b>çekirdek</b> (porları ve içindeki kromatinle), içi <b>krista</b> kıvrımlarıyla dolu mitokondriler,
    üst üste dizilmiş Golgi keseleri ve kıvrımlı ER tabakaları. Her organel şehirde bir göreve benzer:
    <b>çekirdek</b> belediye (DNA'daki planlar), <b>mitokondri</b> enerji santrali, <b>ribozom</b> fabrika,
    <b>ER</b> üretim hattı, <b>Golgi</b> kargo merkezi, <b>lizozom</b> geri dönüşüm, <b>hücre zarı</b> sınır kapısı.
    Sarı noktalar glikoz, mavi noktalar oksijen, parlak altın noktalar <b>ATP</b> (hücrenin pili), yeşiller protein,
    pembe kabarcıklar kargo keseleri.</p>
    <h3>Dene</h3>
    <ul>
      <li>Organellere (ya da etiketlerine) tıkla: ne iş yaptıklarını öğren.</li>
      <li><b>Oksijeni</b> sıfırla: santraller durur, bir glikozdan yalnızca 2 ATP çıkar. ATP nasıl düşüyor?</li>
      <li>Yeni santral (mitokondri) kur, besini artır, daha çok protein üret.</li>
      <li><b>Virüs saldırısını</b> başlat. ATP'ni savunmalara harca: lizozom devriyesi, interferon alarmı, RNA makası
      ya da T hücresini çağır.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Hücre solunumunda bir glikoz, oksijenle yaklaşık <b>30 ATP</b> verir; oksijen yoksa yalnız glikoliz çalışır ve
    <b>2 ATP</b> çıkar (kas yorulunca laktik asit bu yüzden oluşur). Virüsler kendi başına çoğalamaz; hücrenin
    ribozomlarını ve ATP'sini ele geçirir. Enfekte hücre <b>interferon</b> salgılayarak kendini ve komşularını uyarır
    (interferon, protein yapımını da yavaşlatır ve RNA kesen enzimleri çalıştırır). Hücre kurtulamazsa
    <b>T hücreleri</b> onu kontrollü biçimde yok ederek komşuları korur.</p>
    <p><small>Oyun sayıları (ATP maliyetleri, hızlar) öğretmek için basitleştirilmiştir; oranlar gerçeği yansıtır, miktarlar değil.</small></p>`,
});

const scene = sim.scene;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// --- Organel bilgileri ---
const INFO = {
  cekirdek: { t: '🏛️ Belediye = Çekirdek', d: 'Şehrin bütün planları (DNA) burada saklanır. Hangi proteinin ne zaman yapılacağına burada karar verilir; tarifler mRNA olarak fabrikalara gönderilir.', f: 'Bir insan hücresindeki DNA uç uca eklense yaklaşık 2 metre olur!' },
  mito: { t: '⚡ Enerji santrali = Mitokondri', d: 'Glikozu oksijenle "yakar" ve ATP üretir. ATP, hücredeki her işi çalıştıran küçük bir pil gibidir.', f: 'Oksijenle bir glikozdan yaklaşık 30 ATP çıkar. Mitokondrinin kendine ait küçük bir DNA\'sı bile vardır.' },
  ribozom: { t: '🏭 Fabrika = Ribozom', d: 'mRNA tarifini okur, amino asitleri sırayla birleştirip protein yapar. Her yeni protein ATP harcar.', f: 'Tek bir hücrede milyonlarca ribozom olabilir.' },
  er: { t: '🛣️ Üretim hattı = Endoplazmik retikulum (ER)', d: 'Üzeri ribozomlarla kaplı "pürüzlü ER", yeni yapılan proteinleri katlar ve Golgi\'ye taşır. Pürüzsüz ER ise yağ (lipit) yapar.', f: 'ER, çekirdeğin zarıyla birleşik bir tüneller ağıdır.' },
  golgi: { t: '📦 Kargo merkezi = Golgi aygıtı', d: 'Proteinleri düzenler, adres etiketi takar ve keseciklere paketleyip gideceği yere yollar.', f: 'Bazı paketler hücre dışına gönderilir; örneğin sindirim enzimleri ve hormonlar.' },
  lizozom: { t: '♻️ Geri dönüşüm = Lizozom', d: 'İçindeki sindirim enzimleriyle eskimiş parçaları ve içeri giren mikropları parçalar; yapı taşlarını (amino asit) geri kazanır.', f: 'Lizozomun içi asidiktir; enzimleri ancak orada iyi çalışır.' },
  zar: { t: '🧱 Sınır kapısı = Hücre zarı', d: 'Neyin girip çıkacağını seçer. Sarı kapılar (taşıyıcı proteinler) glikoz gibi maddeleri içeri alır; oksijen zardan kendiliğinden geçer.', f: 'Zardaki pompalar sürekli ATP harcar; enerji biterse şehir düzeni bozulur.' },
  sito: { t: '🌊 Şehir meydanı = Sitoplazma', d: 'Organellerin yüzdüğü jel kıvamındaki sıvı. Glikozun ilk parçalanması (glikoliz) burada olur ve 2 ATP verir.', f: 'Oksijen yoksa hücre yalnız glikolizle idare etmek zorunda kalır.' },
  virus: { t: '🦠 Virüs', d: 'Kendi başına çoğalamaz. Zardaki bir "anahtar deliğine" (reseptör) bağlanır, içeri girer ve hücrenin fabrikalarına kendi kopyalarını yaptırır.', f: 'Antibiyotikler virüslere etki etmez; vücut bağışıklık sistemiyle savaşır.' },
  tcell: { t: '🛡️ T hücresi', d: 'Bağışıklık sisteminin askeri. Enfekte hücrenin yüzeyindeki "yardım bayrağını" (MHC) görünce o hücreyi kontrollü biçimde yok eder, böylece virüs komşulara yayılamaz.', f: 'Buna programlı hücre ölümü (apoptoz) denir.' },
};

// --- Ortam: koyu hücre dışı sıvı, derin sis, süzülen parçacıklar (elektron mikroskobu esintili renk sanatı) ---
darkMedium(sim, { top: 0x1f5058, bottom: 0x081a20, glow: 0x2f7a80, glowDir: [0.3, 0.8, -0.5], tint: 0x5a2c56, cloud: 1.4,
  fog: 0x0d2a30, density: 0.022, motes: 520, box: [70, 26, 60], center: [0, -2, -6], moteColor: 0xa6f0ff, moteColor2: 0xffd0e8, moteSize: 0.16, moteOpacity: 0.3 });
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;

// --- Malzemeler --- (ıslak, yarı saydam görünümlü biyolojik yüzeyler; parlaklık oyun durumuna göre değişir)
const organMats = {}; // anahtar → [materyal, temel parlaklık]
function mat(key, color, opts = {}) {
  const m = tissue({ color, veins: opts.veins ?? 0.15, scale: opts.scale ?? 1.4 });
  delete opts.veins; delete opts.scale;
  m.emissive = new THREE.Color(color); m.emissiveIntensity = 0.15;
  m.clearcoat = 0.7; m.clearcoatRoughness = 0.25; m.roughness = 0.42;
  Object.assign(m, opts);
  (organMats[key] ||= []).push(m);
  return m;
}
const clickables = [];
const tag = (obj, key) => { obj.userData.org = key; clickables.push(obj); return obj; };
const noisy = (g, amp, freq, seed = 0) => { // yüzeyi normal boyunca gürültüyle boz (organik)
  const p = g.attributes.position, v = new THREE.Vector3();
  if (!g.attributes.normal) g.computeVertexNormals(); const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const d = amp * fbm(v.x * freq + seed, v.y * freq, v.z * freq - seed, 3) * 2; p.setXYZ(i, v.x + n.getX(i) * d, v.y + n.getY(i) * d, v.z + n.getZ(i) * d); }
  g.computeVertexNormals(); return g;
};

/** Kesit: yüzeyin bir düzlemin üstünde kalan üçgenlerini at (organelin içini göstermek için). up: 'y' ekseninde kesme yüksekliği */
function cutAbove(g, yCut) {
  const q = g.index ? g.toNonIndexed() : g;
  const p = q.attributes.position, keep = [];
  for (let i = 0; i < p.count; i += 3) {
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    if (cy <= yCut) keep.push(i);
  }
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const a = q.attributes[name];
    if (!a) continue;
    const arr = new Float32Array(keep.length * 9);
    keep.forEach((i, k) => { for (let j = 0; j < 9; j++) arr[k * 9 + j] = a.array[i * 3 + j]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}
const DS = { side: THREE.DoubleSide };

// --- Hücre: sitoplazma, zar, kapılar ---
const cell = new THREE.Group();
scene.add(cell);
const floorMat = mat('sito', 0x1f7a8c, { veins: 0.35, scale: 0.9 });
floorMat.emissiveIntensity = 0.12; floorMat.roughness = 0.6; floorMat.clearcoat = 0.4;
const floorGeo = new THREE.RingGeometry(0.001, CELL_R, 128, 40);
{ // sitoplazma tabanı: hafif çukur, kabarcıklı
  const p = floorGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), r = Math.min(1, Math.hypot(x, y) / CELL_R); p.setZ(i, -1.7 * Math.sqrt(1 - r * r) * (0.75 + 0.25 * (1 - r)) + 0.1 * fbm(x * 0.5, y * 0.5, 3.1, 3)); }
  floorGeo.computeVertexNormals();
}
const floor = tag(new THREE.Mesh(floorGeo, floorMat), 'sito');
floor.rotation.x = -Math.PI / 2;
floor.scale.set(1, ZS, 1); // döndürülmüş dairede y ölçeği dünyada z olur
floor.position.y = -0.05;
cell.add(floor);
const floorBase = new THREE.Color(0x1f7a8c), floorDirty = new THREE.Color(0x6b5a2e), floorSick = new THREE.Color(0x7a2e4a);

// Hücre zarı: kalınlığı olan elipsoit kabuk; tepesi kesilip açılmış (kesit), kesik kenarda lipit çift katmanı görünür
const DOME_H = 3.0, CUT = 0.42, THK = 0.3;
const domeMat = mat('zar', 0xe8c0dc, { transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, veins: 0.05, scale: 3 });
domeMat.sheen = 1; domeMat.sheenRoughness = 0.35; domeMat.clearcoat = 1; domeMat.clearcoatRoughness = 0.12;
const domeGeo = (() => {
  const pr = [], N = 40, Ri = CELL_R - THK, Hi = DOME_H - THK;
  for (let i = 0; i <= N; i++) { const y = (i / N) * CUT * DOME_H; pr.push(new THREE.Vector2(CELL_R * Math.sqrt(1 - (y / DOME_H) ** 2), y)); }
  const yc = CUT * DOME_H;
  for (let i = N; i >= 0; i--) { const y = (i / N) * yc; pr.push(new THREE.Vector2(Ri * Math.sqrt(Math.max(0, 1 - (y / Hi) ** 2)), y)); }
  const g = new THREE.LatheGeometry(pr, LOWQ ? 96 : 160);
  g.scale(1, 1, ZS);
  return noisy(g, 0.06, 0.6);
})();
const dome = new THREE.Mesh(domeGeo, domeMat);
dome.userData.noCast = true;
cell.add(dome);
// Kesik kenar: zarın iki lipit tabakası (dış açık, iç koyu), kalın ve ıslak
const rimMat = mat('zar', 0xd9a0c8, { veins: 0.15, scale: 4 });
const lipR = CELL_R * Math.sqrt(1 - CUT * CUT) - THK * 0.2;
const rim = tag(new THREE.Mesh(noisy(new THREE.TorusGeometry(lipR, 0.11, 12, 200), 0.03, 2), rimMat), 'zar');
rim.rotation.x = -Math.PI / 2;
rim.scale.set(1, ZS, 1);
rim.position.y = CUT * DOME_H;
const rimIn = new THREE.Mesh(noisy(new THREE.TorusGeometry(lipR - 0.22, 0.09, 10, 200), 0.03, 2), mat('zar', 0x9a4a8a, { veins: 0.1, scale: 4 }));
rimIn.rotation.x = -Math.PI / 2; rimIn.scale.set(1, ZS, 1); rimIn.position.y = CUT * DOME_H - 0.12;
cell.add(rim, rimIn);
// Ekvator: kubbe ile taban zarının birleştiği kalın zar kuşağı (yan kesitte zar kalınlığı)
const belt = tag(new THREE.Mesh(noisy(new THREE.TorusGeometry(CELL_R - 0.08, 0.2, 14, 220), 0.05, 1.4), mat('zar', 0xd98ab8, { veins: 0.2, scale: 2 })), 'zar');
belt.rotation.x = -Math.PI / 2; belt.scale.set(1, ZS, 1); belt.position.y = 0.02;
cell.add(belt);
// Sitoplazma: kalabalık protein ve metabolitlerin yarı saydam pusu (hacim hissi, derinlikte katmanlanır)
{
  const NP = LOWQ ? 700 : 1500, pos = new Float32Array(NP * 3), col = new Float32Array(NP * 3);
  const c1 = new THREE.Color(0x7fe0e8), c2 = new THREE.Color(0xf0c0e0);
  for (let i = 0; i < NP; i++) {
    const a = rand(0, TAU), r = Math.sqrt(Math.random()) * (CELL_R - 0.6), rr = r / CELL_R;
    const top = DOME_H * Math.sqrt(1 - rr * rr) * 0.95, bot = -1.5 * Math.sqrt(1 - rr * rr);
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = rand(bot, Math.min(top, CUT * DOME_H)); pos[i * 3 + 2] = Math.sin(a) * r * ZS;
    const c = Math.random() < 0.8 ? c1 : c2, k = rand(0.5, 1.2);
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const haze = new THREE.Points(g, new THREE.PointsMaterial({ map: softDot(), size: 0.22, vertexColors: true, transparent: true, opacity: 0.3,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  haze.raycast = () => {}; haze.frustumCulled = false;
  cell.add(haze);
}

const membranePoint = (th, out, r = CELL_R) => out.set(Math.cos(th) * r, 0.35, Math.sin(th) * r * ZS);
{ // taşıyıcı proteinler: zarı delen, ortası kanallı kabarcık kümeleri
  const tg = BufferGeometryUtils.mergeGeometries([0, 1, 2].map((k) => {
    const a = (k / 3) * TAU;
    return blobGeometry(0.19, { detail: 3, amp: 0.1, freq: 3, seed: k, stretch: [1, 2.6, 1] }).translate(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17);
  }));
  const n = 20, gate = new THREE.InstancedMesh(tg, mat('zar', 0xfacc15, { veins: 0.05, scale: 4 }), n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) { membranePoint((i / n) * TAU + 0.1, d.position); d.rotation.y = i; d.updateMatrix(); gate.setMatrixAt(i, d.matrix); }
  cell.add(tag(gate, 'zar'));
}

// --- Çekirdek (belediye) ---
const NUC = V3(-2.9, 0.9, -0.4);
{
  const g = new THREE.Group();
  g.position.copy(NUC);
  // Çift zarlı çekirdek kılıfı: dış ve iç zar, tepesi kesik (içteki kromatin ve çekirdekçik görünür)
  const envG = blobGeometry(2.6, { detail: LOWQ ? 14 : 20, amp: 0.035, freq: 1.2 }).scale(1, 0.6, 1);
  const env = new THREE.Mesh(cutAbove(envG, 0.62), mat('cekirdek', 0x9c86e8, { veins: 0.12, scale: 2, ...DS }));
  const envIn = new THREE.Mesh(cutAbove(blobGeometry(2.42, { detail: LOWQ ? 14 : 20, amp: 0.035, freq: 1.2 }).scale(1, 0.56, 1), 0.5),
    mat('cekirdek', 0x5b3fa8, { veins: 0.2, scale: 3, ...DS }));
  g.add(tag(env, 'cekirdek'), tag(envIn, 'cekirdek'));
  // Nükleoplazma: kesitten görünen koyu, dokulu iç yüzey
  const npl = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64).rotateX(-Math.PI / 2), mat('cekirdek', 0x3a2470, { veins: 0.35, scale: 3 }));
  npl.position.y = -0.55; npl.scale.z = 0.95;
  g.add(tag(npl, 'cekirdek'));
  const nucleolus = new THREE.Mesh(blobGeometry(0.85, { detail: 10, amp: 0.12, freq: 2.2 }), mat('cekirdek', 0x6d28d9, { veins: 0.4, scale: 4 }));
  nucleolus.position.set(0.5, -0.05, 0.3);
  nucleolus.scale.y = 0.7;
  g.add(tag(nucleolus, 'cekirdek'));
  const pts = [];
  for (let i = 0; i < 30; i++) pts.push(V3(rand(-1.8, 1.8), rand(-0.45, 0.35), rand(-1.8, 1.8)).clampLength(0, 1.95));
  const chromMat = mat('cekirdek', 0xe7a4f5, { veins: 0.05, scale: 6, ...DS });
  const chrom = new THREE.Mesh(loftTube(new THREE.CatmullRomCurve3(pts), (t) => 0.075 * (1 + 0.45 * Math.sin(t * 140)), { segs: LOWQ ? 600 : 900, radial: 7, noiseAmp: 0.22, noiseFreq: 3 }), chromMat);
  g.add(tag(chrom, 'cekirdek'));
  // Heterokromatin: zarın iç yüzüne yapışık yoğun kümeler
  const hg = blobGeometry(0.34, { detail: 3, amp: 0.3, freq: 2.4, seed: 3 });
  const het = new THREE.InstancedMesh(hg, mat('cekirdek', 0xb57ad8, { veins: 0.2, scale: 5 }), 14);
  { const d = new THREE.Object3D();
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + rand(-0.2, 0.2); d.position.set(Math.cos(a) * 2.05, rand(-0.45, -0.1), Math.sin(a) * 2.05); d.rotation.set(rand(0, 3), rand(0, 3), 0); d.scale.set(rand(0.8, 1.4), 0.6, rand(0.8, 1.2)); d.updateMatrix(); het.setMatrixAt(i, d.matrix); } }
  g.add(tag(het, 'cekirdek'));
  // Por kompleksleri: sekiz alt birimli halkalar, kılıf yüzeyine dik
  const poreG = BufferGeometryUtils.mergeGeometries([...Array(8)].map((_, k) => {
    const a = (k / 8) * TAU;
    return blobGeometry(0.065, { detail: 1, amp: 0.15, freq: 3, seed: k }).scale(1, 1, 1.6).translate(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0);
  }));
  const NPORE = LOWQ ? 40 : 70, pores = new THREE.InstancedMesh(poreG, mat('cekirdek', 0xd9c8ff, { veins: 0, scale: 6 }), NPORE);
  const d = new THREE.Object3D();
  let np = 0;
  for (let i = 0; np < NPORE && i < 800; i++) {
    const u = rand(-1, 1), a = rand(0, TAU), q = Math.sqrt(1 - u * u);
    const pos = V3(q * Math.cos(a) * 2.6, u * 2.6 * 0.6, q * Math.sin(a) * 2.6);
    if (pos.y > 0.5) continue;
    d.position.copy(pos); d.lookAt(pos.x * 2, pos.y + pos.y / 0.36, pos.z * 2); d.updateMatrix(); pores.setMatrixAt(np++, d.matrix);
  }
  pores.count = np;
  g.add(tag(pores, 'cekirdek'));
  cell.add(g);
}

// --- ER (üretim hattı) ve ribozomlar (fabrika) ---
const ER_PSI = -1.35, ER_ARC = 2.4, ER_R = [3.25, 3.8, 4.35];
const erPoint = (r, a, out) => out.set(NUC.x + r * Math.cos(a + ER_PSI), 0.25, NUC.z - r * Math.sin(a + ER_PSI));
const riboPos = [];
{
  const g = new THREE.Group();
  g.position.set(NUC.x, 0.25, NUC.z);
  g.rotation.y = ER_PSI;
  const erMat = mat('er', 0x6aa8f0, { veins: 0.12, scale: 3, ...DS });
  // Kıvrımlı sisterna keseleri: ana üç tabaka + araya katlanan ince kıvrımlar (hacimli, dalgalı perdeler)
  [...ER_R.map((r, n) => [r, n, 0.2, 0]), ...ER_R.slice(0, 2).map((r, n) => [r + 0.27, n + 3, 0.14, 0.18]), [ER_R[0] - 0.27, 5, 0.13, -0.15]].forEach(([r, n, w, dy]) => {
    const pts = [];
    for (let i = 0; i <= 28; i++) { const a = (i / 28) * ER_ARC, rr = r + 0.12 * Math.sin(a * 5 + n); pts.push(V3(rr * Math.cos(a), dy + 0.22 * Math.sin(a * 6 + n * 2), -rr * Math.sin(a))); }
    const m = new THREE.Mesh(loftTube(new THREE.CatmullRomCurve3(pts), (t) => w * (0.75 + 0.25 * Math.sin(t * 31 + n)) * Math.min(1, Math.sin(Math.PI * t) * 6), { segs: 140, radial: 16, squash: 0.5, view: [0, 1, 0], noiseAmp: 0.1, noiseFreq: 2.5 }), erMat);
    g.add(tag(m, 'er'));
  });
  cell.add(g);
  for (const r of ER_R) for (let k = 0; k < 24; k++) {
    const p = erPoint(r + pick([-0.24, 0.24]), (k + 0.5) / 24 * ER_ARC, new THREE.Vector3());
    p.y = 0.3; riboPos.push(p);
  }
  for (let k = 0; k < 34; k++) {
    const a = rand(0, TAU), r = rand(2.5, 8.5);
    const p = V3(Math.cos(a) * r, 0.2, Math.sin(a) * r * ZS);
    if (p.distanceTo(NUC) > 3) riboPos.push(p);
  }
  // ribozom: büyük + küçük alt birim
  const rg = BufferGeometryUtils.mergeGeometries([blobGeometry(0.13, { detail: 3, amp: 0.12, freq: 3 }), blobGeometry(0.09, { detail: 3, amp: 0.12, freq: 3, seed: 2 }).translate(0.05, 0.1, 0.02)]);
  const ribo = new THREE.InstancedMesh(rg, mat('ribozom', 0xfb3f6c, { veins: 0, scale: 6 }), riboPos.length);
  const d = new THREE.Object3D();
  riboPos.forEach((p, i) => { d.position.copy(p); d.rotation.set(rand(0, 3), rand(0, 3), 0); d.updateMatrix(); ribo.setMatrixAt(i, d.matrix); });
  cell.add(tag(ribo, 'ribozom'));
}

// --- Golgi (kargo) ---
const GOL = V3(4.3, 0.4, -1.4);
{
  const g = new THREE.Group();
  g.position.copy(GOL);
  g.rotation.y = -1.0;
  const cols = [0xf07a8e, 0xf0985a, 0xf0b850, 0xf0d060];
  // Üst üste 6 yassı sisterna (cis → trans), ortası ince, uçları şişkin; kesecik tomurcukları
  for (let k = 0; k < 6; k++) {
    const r = 0.95 + k * 0.3, pts = [], arc = 2.0 - k * 0.08;
    for (let i = 0; i <= 18; i++) { const a = (i / 18) * arc + k * 0.04; pts.push(V3(r * Math.cos(a), 0.08 * Math.sin(a * 4 + k), -r * Math.sin(a))); }
    const m = new THREE.Mesh(loftTube(new THREE.CatmullRomCurve3(pts), (t) => 0.21 * (0.8 + 0.7 * Math.pow(Math.abs(t - 0.5) * 2, 5)), { segs: 70, radial: 16, squash: 0.42, view: [0, 1, 0], noiseAmp: 0.06, noiseFreq: 3 }),
      mat('golgi', cols[Math.min(3, Math.floor(k * 4 / 6))], { veins: 0.1, scale: 3, ...DS }));
    m.position.y = 0.05 + k * 0.17;
    g.add(tag(m, 'golgi'));
  }
  const vg = blobGeometry(0.16, { detail: 4, amp: 0.1 });
  for (let k = 0; k < 12; k++) { const v = new THREE.Mesh(vg, organMats.golgi[k % 4]); const a = rand(-0.2, 2.2), r = rand(1.0, 2.4); v.position.set(r * Math.cos(a) + 0.3, rand(0, 0.35), -r * Math.sin(a) + rand(-0.2, 0.2)); g.add(tag(v, 'golgi')); }
  cell.add(g);
}
const GOL_OUT = V3(6.0, 0.5, -1.5); // paketlerin çıktığı nokta

// --- Mitokondriler (santral) ---
const M_SLOTS = [[-6.9, 3.2, 0.4], [0.9, 4.8, -0.3], [6.1, 3.3, 0.9], [-6.4, -3.9, -0.6], [2.0, -5.9, 0.2],
  [-3.4, 5.6, 1.2], [7.8, -3.4, 1.3], [-8.3, 0.1, 1.6], [4.2, 5.7, -0.8], [-1.2, -6.4, 0.5]];
// Kesit mitokondri: dış zar + iç zar (tepesi açık), içeride iç zarın kıvrımları (krista) karşılıklı raflar gibi
const mitoGeo = cutAbove(noisy(new THREE.CapsuleGeometry(0.55, 1.5, 10, 28).rotateZ(Math.PI / 2), 0.05, 1.4), 0.2);
const mitoInGeo = cutAbove(noisy(new THREE.CapsuleGeometry(0.46, 1.4, 10, 28).rotateZ(Math.PI / 2), 0.04, 1.6, 2), 0.12);
const cristaeGeo = (() => {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const x = -0.8 + i * 0.2, side = i % 2 ? 1 : -1;
    const pg = new THREE.PlaneGeometry(0.62, 0.5, 8, 6);
    const pp = pg.attributes.position;
    for (let k = 0; k < pp.count; k++) { const u = pp.getX(k), v = pp.getY(k); pp.setZ(k, 0.035 * Math.sin(v * 22 + i) + 0.02 * Math.sin(u * 14)); }
    pg.rotateY(Math.PI / 2).translate(x, -0.12, side * 0.13);
    parts.push(pg);
  }
  return BufferGeometryUtils.mergeGeometries(parts);
})();
const mitoMat = mat('mito', 0xe86a2a, { veins: 0.2, scale: 3, ...DS });
const mitoInMat = mat('mito', 0xb8401e, { veins: 0.25, scale: 4, ...DS });
const cristaeMat = mat('mito', 0xffd9b8, { veins: 0.1, scale: 5, ...DS });
const matrixMat = mat('mito', 0x6a1a10, { veins: 0.3, scale: 6 });
const matrixGeo = new THREE.CapsuleGeometry(0.4, 1.3, 4, 16).rotateZ(Math.PI / 2).scale(1, 0.25, 1).translate(0, -0.3, 0);
const mitos = M_SLOTS.map(([x, z, r]) => {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(mitoGeo, mitoMat);
  const inner = new THREE.Mesh(mitoInGeo, mitoInMat);
  const mx = new THREE.Mesh(matrixGeo, matrixMat);
  const cr = new THREE.Mesh(cristaeGeo, cristaeMat);
  g.add(tag(outer, 'mito'), tag(inner, 'mito'), tag(mx, 'mito'), tag(cr, 'mito'));
  g.position.set(x, 0.45, z);
  g.rotation.y = r;
  g.scale.set(1, 0.65, 1);
  g.visible = false;
  cell.add(g);
  return g;
});

// --- Lizozomlar (geri dönüşüm) ---
const L_SLOTS = [[-4.6, 3.3], [2.9, 2.3], [-4.5, -5.3], [5.6, -4.8], [-8.2, -2.6], [0.9, -3.9], [2.4, 6.4], [8.4, 1.0]];
const lysoGeo = blobGeometry(0.42, { detail: 8, amp: 0.1, freq: 1.8 });
const lysoMat = mat('lizozom', 0x4ade80, { veins: 0.3, scale: 5 });
const lysos = L_SLOTS.map(([x, z]) => {
  const m = tag(new THREE.Mesh(lysoGeo, lysoMat), 'lizozom');
  m.position.set(x, 0.5, z);
  m.visible = false;
  cell.add(m);
  return { mesh: m, home: V3(x, 0.5, z), phase: rand(0, TAU) };
});
// Hücre iskeleti (mikrotübüller): çekirdekten zara uzanan ince, hafif ışıyan lifler
{
  const fm = tissue({ color: 0x2a6070, veins: 0, scale: 4 });
  Object.assign(fm, { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  fm.emissive = new THREE.Color(0x7fe0ff); fm.emissiveIntensity = 0.35;
  const parts = [];
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * TAU + rand(-0.1, 0.1), r1 = CELL_R - 0.6;
    const e = V3(Math.cos(a) * r1, 0.05, Math.sin(a) * r1 * ZS), s = NUC.clone().add(V3(Math.cos(a) * 2.7, -0.75, Math.sin(a) * 2.7 * 0.8));
    const m = s.clone().lerp(e, 0.5).add(V3(rand(-0.8, 0.8), 0.1, rand(-0.8, 0.8)));
    parts.push(loftTube(new THREE.CatmullRomCurve3([s, m, e]), () => 0.025, { segs: 30, radial: 4, caps: false }));
  }
  const cs = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(parts), fm);
  cs.userData.noCast = true; cs.raycast = () => {};
  cell.add(cs);
}
// Doku bağlamı: hücrenin oturduğu hücre dışı matris (bazal zar + kolajen lif demetleri) ve sisin içinde yan yana dizilmiş,
// alçak komşu hücreler (tek katlı doku). Hepsi hücrenin altında/uzakta kalır; kadrajı kesen yakın kütle yok.
{
  const ecm = procedural({
    key: 'hs-ecm', physical: true, bump: 0.04,
    params: { color: 0xffffff, roughness: 0.55, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x9fdcd8) },
    pattern: `
      float n = fbm3(p*0.08, 4);
      float f1 = pow(ridge3(vec3(p.x*0.35, 0.0, p.z*0.05) + n*1.5), 10.0);
      float f2 = pow(ridge3(vec3(p.x*0.06 + 3.0, 0.0, p.z*0.3) + n*1.7), 10.0);
      col = mix(vec3(0.06, 0.2, 0.22), vec3(0.14, 0.32, 0.33), n) + vec3(0.3, 0.22, 0.28)*(f1 + f2)*0.6;
      rough = 0.5 + 0.2*n;
      h = n*0.4 + (f1 + f2)*0.5;`,
  });
  const floorE = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 1, 1).rotateX(-Math.PI / 2), ecm);
  floorE.position.y = -2.6; floorE.raycast = () => {}; floorE.userData.noCast = true;
  scene.add(floorE);
  // Kolajen lif demetleri: tabanda uzanan, hafif kıvrık ince tüpler
  const colMat = tissue({ color: 0xc7b8c8, veins: 0.05, scale: 3 });
  colMat.side = THREE.DoubleSide;
  const fibs = [];
  for (let k = 0; k < (LOWQ ? 26 : 50); k++) {
    const a = rand(0, TAU), R = rand(11, 40), th = rand(0, Math.PI), L = rand(5, 12);
    const c = V3(Math.cos(a) * R, -2.45, Math.sin(a) * R * 0.9 - 3), d = V3(Math.cos(th), 0, Math.sin(th));
    const pts = [-1, -0.33, 0.33, 1].map((t, i) => c.clone().addScaledVector(d, t * L / 2).add(V3(rand(-0.5, 0.5), 0.12 * (i % 2), rand(-0.5, 0.5))));
    fibs.push(loftTube(new THREE.CatmullRomCurve3(pts), () => rand(0.05, 0.1), { segs: 30, radial: 6, caps: true }));
  }
  const fm2 = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(fibs.map((g) => { const q = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); return q; })), colMat);
  fm2.raycast = () => {}; fm2.userData.noCast = true;
  scene.add(fm2);
  // Komşu hücreler: alçak, basık kubbeler (sisle yumuşar); kameradan uzakta, halka biçiminde
  const nm = tissue({ color: 0x3a7a80, veins: 0.2, scale: 0.6 });
  nm.clearcoat = 0.4; nm.roughness = 0.45;
  nm.emissive = new THREE.Color(0x0d3036); nm.emissiveIntensity = 0.5;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + 0.3, R = rand(22.5, 25);
    if (Math.sin(a) > 0.55) continue; // kameranın önündekiler (görüş dışı / yakın) atlanır
    const n = new THREE.Mesh(blobGeometry(CELL_R * rand(0.95, 1.1), { detail: LOWQ ? 7 : 10, amp: 0.08, freq: 1.2, seed: k, stretch: [1, 0.2, 0.85] }), nm);
    n.position.set(Math.cos(a) * R, -2.3, Math.sin(a) * R * 0.9);
    n.raycast = () => {};
    scene.add(n);
  }
}

// --- Parçacık akışları (glikoz, O₂, ATP, protein, kargo, atık) ---
function makePool(color, r, n, emissive = 0.4) {
  const m = new THREE.InstancedMesh(blobGeometry(r, { detail: 2, amp: 0.08, freq: 3 }),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive * 1.6, roughness: 0.35 }), n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.userData.noCast = true;
  const arr = m.instanceMatrix.array;
  arr.fill(0);
  for (let i = 0; i < n; i++) arr[i * 16 + 15] = 1;
  m.frustumCulled = false;
  scene.add(m);
  return { mesh: m, n, a: new Float32Array(n * 6), t: new Float32Array(n), dur: new Float32Array(n), alive: new Uint8Array(n), cur: 0, acc: 0 };
}
const pools = {
  glc: makePool(0xfef08a, 0.13, 50),
  o2: makePool(0x7dd3fc, 0.1, 60),
  atp: makePool(0xfacc15, 0.12, 70, 1.2),
  prot: makePool(0x34d399, 0.13, 40),
  ves: makePool(0xf472b6, 0.26, 24, 0.5),
  waste: makePool(0x9ca3af, 0.12, 30, 0.1),
};
function spawn(pl, from, to, dur) {
  for (let k = 0; k < pl.n; k++) {
    const i = (pl.cur + k) % pl.n;
    if (pl.alive[i]) continue;
    pl.cur = i + 1;
    pl.a.set([from.x, from.y, from.z, to.x, to.y, to.z], i * 6);
    pl.t[i] = 0; pl.dur[i] = dur; pl.alive[i] = 1;
    return;
  }
}
function updatePool(pl, dt) {
  const arr = pl.mesh.instanceMatrix.array, a = pl.a;
  for (let i = 0; i < pl.n; i++) {
    const o = i * 16;
    if (!pl.alive[i]) { arr[o] = arr[o + 5] = arr[o + 10] = 0; continue; }
    const t = (pl.t[i] += dt / pl.dur[i]);
    if (t >= 1) { pl.alive[i] = 0; arr[o] = arr[o + 5] = arr[o + 10] = 0; continue; }
    const j = i * 6, s = t < 0.1 ? t * 10 : t > 0.9 ? (1 - t) * 10 : 1;
    arr[o] = arr[o + 5] = arr[o + 10] = s;
    arr[o + 12] = a[j] + (a[j + 3] - a[j]) * t;
    arr[o + 13] = a[j + 1] + (a[j + 4] - a[j + 1]) * t + Math.sin(Math.PI * t) * 0.6;
    arr[o + 14] = a[j + 2] + (a[j + 5] - a[j + 2]) * t;
  }
  pl.mesh.instanceMatrix.needsUpdate = true;
}
function clearPools() { for (const k in pools) { pools[k].alive.fill(0); pools[k].acc = 0; } }

// --- Virüsler, virüs kopyaları, interferon halkası, T hücresi ---
function spikyGeometry(r, n, spikeLen, spikeR) {
  const parts = [blobGeometry(r, { detail: 6, amp: 0.06, freq: 2.5 })];
  const dir = new THREE.Vector3(), q = new THREE.Quaternion(), up = V3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
    dir.set(Math.cos(th) * rr, y, Math.sin(th) * rr);
    q.setFromUnitVectors(up, dir);
    const c = new THREE.CylinderGeometry(spikeR * 0.45, spikeR * 0.7, spikeLen, 8).translate(0, r * 0.96 + spikeLen / 2, 0).applyQuaternion(q);
    const tip = new THREE.SphereGeometry(spikeR, 10, 6).translate(0, r * 0.96 + spikeLen, 0).applyQuaternion(q);
    parts.push(c, tip);
  }
  return BufferGeometryUtils.mergeGeometries(parts.map((g) => { const x = g.index ? g.toNonIndexed() : g; if (x.attributes.uv) x.deleteAttribute('uv'); return x; }));
}
const virusGeo = spikyGeometry(0.36, 14, 0.2, 0.07);
const virusMat = tissue({ color: 0xef4444, veins: 0.2, scale: 6 });
virusMat.emissive = new THREE.Color(0x991b1b); virusMat.emissiveIntensity = 0.8; virusMat.clearcoat = 0.8;
const endoGeo = blobGeometry(0.7, { detail: 6, amp: 0.05 });
const endoMat = new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.15, clearcoat: 1 });
const VIRUS_TOTAL = 10;
const viruses = [];
for (let i = 0; i < 12; i++) {
  const m = tag(new THREE.Mesh(virusGeo, virusMat), 'virus');
  const bub = new THREE.Mesh(endoGeo, endoMat);
  m.add(bub);
  m.visible = false;
  scene.add(m);
  viruses.push({ mesh: m, bub, phase: 'off', p: new THREE.Vector3(), target: new THREE.Vector3(), timer: 0, th: 0, spin: rand(0.5, 2) });
}
const copies = new THREE.InstancedMesh(spikyGeometry(0.12, 8, 0.06, 0.03), virusMat, 120);
const copyPos = [];
{
  const d = new THREE.Object3D();
  for (let i = 0; i < 120; i++) {
    const base = i % 2 ? pick(riboPos) : GOL;
    const p = V3(base.x + rand(-1.3, 1.3), rand(0.3, 1.1), base.z + rand(-1.3, 1.3));
    copyPos.push(p);
    d.position.copy(p); d.scale.setScalar(0); d.updateMatrix(); copies.setMatrixAt(i, d.matrix);
  }
  copies.frustumCulled = false;
  scene.add(copies);
}
const ifnRing = new THREE.Mesh(new THREE.TorusGeometry(CELL_R, 0.18, 6, 96),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0, depthWrite: false }));
ifnRing.rotation.x = -Math.PI / 2;
scene.add(ifnRing);
const tcellMat = tissue({ color: 0x4ade80, veins: 0.25, scale: 2 });
tcellMat.emissive = new THREE.Color(0x166534); tcellMat.emissiveIntensity = 0.6; tcellMat.clearcoat = 0.7;
const tcell = tag(new THREE.Mesh(spikyGeometry(1.3, 70, 0.2, 0.11), tcellMat), 'tcell');
tcell.visible = false;
scene.add(tcell);

// --- Etiketler (şehir adları) ---
const labels = [];
function cityLabel(text, key, pos) {
  const l = sim.label(text, { position: pos, className: 'clickable' });
  l.el.addEventListener('click', () => showInfo(key));
  labels.push(l);
  return l;
}
cityLabel('🏛️ Belediye · çekirdek', 'cekirdek', [NUC.x, 2.9, NUC.z]);
const mitoLabel = cityLabel('⚡ Santral · mitokondri', 'mito', [M_SLOTS[2][0], 1.5, M_SLOTS[2][1]]);
cityLabel('🏭 Fabrika · ribozom + ER', 'ribozom', [0.9, 1.3, 1.9]);
cityLabel('📦 Kargo · Golgi', 'golgi', [GOL.x + 1.4, 1.6, GOL.z]);
const lysoLabel = cityLabel('♻️ Geri dönüşüm · lizozom', 'lizozom', [L_SLOTS[2][0], 1.4, L_SLOTS[2][1]]);
cityLabel('🧱 Sınır kapısı · zar', 'zar', [0, 1.3, CELL_R * ZS + 0.3]);

// --- Ekonomi durumu ---
const E = { atp: 120, glc: 10, amino: 40, waste: 5, prot: 0, golgiQ: 0, shipped: 0, M: 4, L: 3, atpRate: 0, protRate: 0, blackout: false };
const goals = { atp: false, ship: false, build: false, win: false };

function econ(h) {
  const food = sFood.value, o2 = sO2.value / 100, prod = sProd.value / 100;
  E.glc = Math.min(60, E.glc + 0.12 * food * h);
  E.amino = Math.min(150, E.amino + 0.3 * food * h);
  const eff = E.waste > 60 ? 0.6 : 1;
  const aer = Math.min(E.glc, E.M * 0.15 * o2 * eff * h);
  E.glc -= aer;
  const ana = Math.min(E.glc, 0.4 * (1 - o2) * h);
  E.glc -= ana;
  const gain = aer * 30 + ana * 2;
  E.atpRate += (gain / h - E.atpRate) * Math.min(1, h * 2);
  E.atp += gain - 3 * h; // zar pompaları sürekli ATP harcar
  // Protein üretimi (virüs genomları ribozomları ele geçirir, interferon üretimi durdurur)
  const hijack = 1 - Math.min(0.8, G.genomes * 0.15);
  const want = prod * 1.0 * hijack * (G.ifnT > 0 ? 0 : 1) * eff * h;
  const made = Math.max(0, Math.min(want, E.atp / 6, E.amino / 2));
  E.atp -= made * 6; E.amino -= made * 2;
  E.prot += made; E.golgiQ += made;
  E.protRate += (made / h - E.protRate) * Math.min(1, h * 2);
  while (E.golgiQ >= 2) { E.golgiQ -= 2; E.shipped++; vis.ves++; }
  // Atık ve geri dönüşüm
  E.waste += (0.15 + 0.25 * made / h) * h;
  const dig = Math.min(E.waste, E.L * 0.12 * h);
  E.waste -= dig; E.amino = Math.min(150, E.amino + dig * 2);
  vis.waste += dig * 3;
  const wasBlack = E.blackout;
  E.blackout = E.atp <= 0;
  E.atp = clamp(E.atp, 0, ATP_MAX);
  if (E.blackout && !wasBlack) sim.toast('🔌 Enerji kesintisi! ATP bitti, fabrikalar durdu.', 'bad');
  vis.glc += (aer + ana) * 5;
  vis.o2 += aer * 12;
  vis.atp += gain * 0.25;
  vis.prot += made * 3;
  if (!goals.atp && E.atp >= 200) { goals.atp = true; goalDone('200 ATP biriktirdin'); }
  if (!goals.ship && E.shipped >= 10) { goals.ship = true; goalDone('10 kargo paketi gönderdin'); }
}
const vis = { glc: 0, o2: 0, atp: 0, prot: 0, ves: 0, waste: 0 };

// --- Virüs saldırısı oyunu ---
const G = { on: false, t: 0, spawned: 0, nextSpawn: 0, genomes: 0, load: 0, maxLoad: 0, ifnT: 0, patrolT: 0, tcellT: -1, rnaCD: 0, spent: 0, end: null, endT: 0 };
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

function startAttack() {
  resetGameVisuals();
  Object.assign(G, { on: true, t: 0, spawned: 0, nextSpawn: 5, genomes: 0, load: 0, maxLoad: 0, ifnT: 0, patrolT: 0, tcellT: -1, rnaCD: 0, spent: 0, end: null, endT: 0 });
  if (E.atp < 60) sim.toast('⚠️ ATP az! Savunma için enerji gerekir.', 'warn');
  showGameHud();
  sim.play();
}

function resetGameVisuals() {
  for (const v of viruses) { v.phase = 'off'; v.mesh.visible = false; }
  tcell.visible = false;
  ifnRing.material.opacity = 0;
  cell.scale.set(1, 1, 1);
  rimMat.color.setHex(0xec4899); rimMat.emissive.setHex(0xec4899);
}

const DEF = {
  lyso: { cost: 20, label: '♻️ Lizozom devriyesi', tip: '12 sn boyunca lizozomlar içeri giren virüsleri avlar' },
  ifn: { cost: 35, label: '📣 İnterferon alarmı', tip: '15 sn virüs çoğalmasını yavaşlatır ama protein üretimi durur' },
  rna: { cost: 30, label: '✂️ RNA makası', tip: 'Virüs genomlarını keser (interferon açıkken çalışır)' },
  tcell: { cost: 10, label: '🛡️ T hücresi çağır', tip: 'Yardım bayrağı kaldır: T hücresi gelir, hücre hâlâ enfekteyse onu feda eder' },
};
function canUse(k) {
  if (!G.on || G.end) return false;
  if (E.atp < DEF[k].cost) return false;
  if (k === 'rna') return G.ifnT > 0 && G.rnaCD <= 0;
  if (k === 'tcell') return G.tcellT < 0;
  if (k === 'ifn') return G.ifnT <= 0;
  if (k === 'lyso') return G.patrolT <= 0;
  return true;
}
function useDefence(k) {
  if (!canUse(k)) return;
  E.atp -= DEF[k].cost; G.spent += DEF[k].cost;
  if (k === 'lyso') { G.patrolT = 12; sim.toast('♻️ Lizozomlar devriyede!', 'good'); }
  if (k === 'ifn') { G.ifnT = 15; sim.toast('📣 İnterferon alarmı! Komşu hücreler de uyarıldı.', 'good'); }
  if (k === 'rna') {
    let cut = 0;
    for (let g = G.genomes; g > 0; g--) if (Math.random() < 0.7) cut++;
    G.genomes -= cut; G.load *= 0.6; G.rnaCD = 4;
    sim.toast(`✂️ RNA makası ${cut} virüs genomunu kesti`, 'good');
  }
  if (k === 'tcell') {
    G.tcellT = 8;
    tcell.position.set(0, 1, 17); tcell.visible = true;
    sim.toast('🛡️ Yardım bayrağı kalktı, T hücresi yolda…');
  }
  refreshHud();
}

let hudRefs = null;
function showGameHud() {
  sim.hud.show(`<b>🦠 Virüs saldırısı!</b> Kırmızı virüsler zara yapışıp içeri giriyor. ATP'ni savunmaya harca.
    <div style="font-size:13px;margin-top:4px">Virüs yükü <b class="g-load">0</b>% · Genom <b class="g-gen">0</b> ·
    ATP <b class="g-atp">0</b> · <span class="g-st"></span></div>
    <div>${Object.entries(DEF).map(([k, d]) => `<button class="btn" data-def="${k}" title="${d.tip}">${d.label} <small>(${d.cost} ATP)</small></button>`).join('')}</div>`, { tone: 'warn' });
  const el = sim.hud.el;
  hudRefs = { load: el.querySelector('.g-load'), gen: el.querySelector('.g-gen'), atp: el.querySelector('.g-atp'), st: el.querySelector('.g-st'),
    btns: [...el.querySelectorAll('button[data-def]')] };
  hudRefs.btns.forEach((b) => b.addEventListener('click', () => useDefence(b.dataset.def)));
  refreshHud();
}
function refreshHud() {
  if (!hudRefs || !G.on || G.end) return;
  hudRefs.load.textContent = fmt(G.load, 0);
  hudRefs.gen.textContent = G.genomes;
  hudRefs.atp.textContent = fmt(E.atp, 0);
  const st = [];
  if (G.spawned < VIRUS_TOTAL) st.push(`gelen virüs ${G.spawned}/${VIRUS_TOTAL}`);
  if (G.ifnT > 0) st.push(`📣 ${fmt(G.ifnT, 0)} sn`);
  if (G.patrolT > 0) st.push(`♻️ ${fmt(G.patrolT, 0)} sn`);
  if (G.tcellT >= 0) st.push(`🛡️ ${fmt(G.tcellT, 0)} sn`);
  hudRefs.st.textContent = st.join(' · ');
  hudRefs.btns.forEach((b) => { b.disabled = !canUse(b.dataset.def); b.style.opacity = b.disabled ? 0.45 : 1; });
}

function endGame(kind) {
  G.end = kind; G.endT = 0;
  let html, tone;
  if (kind === 'win') {
    const stars = G.maxLoad < 30 ? 3 : G.maxLoad < 60 ? 2 : 1;
    html = `<h2>🎉 Şehir kurtarıldı! ${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</h2>
      <p>En yüksek virüs yükü %${fmt(G.maxLoad, 0)}, savunmaya ${fmt(G.spent, 0)} ATP harcadın.
      ${stars < 3 ? 'Daha erken interferon + RNA makası kullanırsan yük daha az yükselir.' : 'Mükemmel savunma!'}</p>`;
    tone = 'good';
    if (!goals.win) { goals.win = true; goalDone('Virüs saldırısını püskürttün'); }
  } else if (kind === 'feda') {
    html = `<h2>🛡️ Kahramanca fedakârlık</h2><p>T hücresi enfekte hücreyi kontrollü biçimde yok etti (apoptoz).
      Bu hücre kurtulamadı ama virüs komşu hücrelere yayılamadı. Vücutta her gün böyle olur!</p>`;
    tone = 'warn';
  } else {
    html = `<h2>💥 Virüsler şehri ele geçirdi</h2><p>Fabrikalar yalnız virüs yapmaya başladı ve hücre patladı; yeni virüsler
      komşu hücrelere dağıldı. İpucu: önce ATP biriktir, virüsler içeri girince <b>interferon</b> + <b>RNA makası</b> kullan.</p>`;
    tone = 'bad';
  }
  sim.hud.show(`${html}<button class="btn primary g-again">🔁 Tekrar oyna</button><button class="btn g-close">🏙️ Şehre dön</button>`, { tone });
  sim.hud.el.querySelector('.g-again').onclick = () => { sim.reset(); startAttack(); };
  sim.hud.el.querySelector('.g-close').onclick = () => { G.on = false; G.end = null; resetGameVisuals(); sim.hud.hide(); };
}

function gameStep(h) {
  G.t += h;
  G.ifnT = Math.max(0, G.ifnT - h); G.patrolT = Math.max(0, G.patrolT - h); G.rnaCD = Math.max(0, G.rnaCD - h);
  if (G.end) {
    G.endT += h;
    if (G.end === 'lose') { cell.scale.setScalar(1 + Math.min(0.15, G.endT * 0.1)); }
    if (G.end === 'feda') { const s = Math.max(0.55, 1 - G.endT * 0.12); cell.scale.set(s, 1, s); }
    return;
  }
  // Yeni virüs
  if (G.spawned < VIRUS_TOTAL && G.t >= G.nextSpawn) {
    const v = viruses.find((x) => x.phase === 'off');
    if (v) {
      v.th = rand(0, TAU);
      membranePoint(v.th, v.target, CELL_R + 0.4);
      membranePoint(v.th + rand(-0.3, 0.3), v.p, CELL_R + 7);
      v.p.y = 2.5;
      v.phase = 'approach'; v.mesh.visible = true; v.bub.visible = false;
    }
    G.spawned++; G.nextSpawn = G.t + 2.5;
  }
  let active = 0;
  for (const v of viruses) {
    if (v.phase === 'off') continue;
    active++;
    if (v.phase === 'approach') {
      tmpA.subVectors(v.target, v.p);
      const d = tmpA.length();
      if (d < 0.1) { v.phase = 'docked'; v.timer = 3; } else v.p.addScaledVector(tmpA, Math.min(1, (2.2 * h) / d));
    } else if (v.phase === 'docked') {
      v.timer -= h;
      if (v.timer <= 0) {
        v.phase = 'inside'; v.bub.visible = true;
        membranePoint(v.th, v.p, CELL_R - 0.9);
        v.target.copy(pick(riboPos)); v.target.y = 0.5;
      }
    } else if (v.phase === 'inside') {
      tmpA.subVectors(v.target, v.p);
      const d = tmpA.length();
      if (d < 0.2) { v.phase = 'off'; v.mesh.visible = false; G.genomes++; sim.toast('🧬 Bir virüs genomu fabrikaları ele geçirdi!', 'bad'); }
      else v.p.addScaledVector(tmpA, Math.min(1, (1.0 * h) / d));
    }
    v.mesh.position.copy(v.p);
  }
  // Lizozomlar içerideki virüsleri kovalar
  const lspeed = G.patrolT > 0 ? 3.2 : 0.8;
  for (let i = 0; i < E.L; i++) {
    const L = lysos[i];
    let best = null, bd = G.patrolT > 0 ? 99 : 3.5;
    for (const v of viruses) if (v.phase === 'inside') { const d = v.p.distanceTo(L.mesh.position); if (d < bd) { bd = d; best = v; } }
    const tgt = best ? best.p : L.home;
    tmpB.subVectors(tgt, L.mesh.position); tmpB.y = 0;
    const d = tmpB.length();
    if (d > 0.01) L.mesh.position.addScaledVector(tmpB, Math.min(1, (lspeed * h) / d));
    if (best && L.mesh.position.distanceTo(best.p) < 0.75) {
      best.phase = 'off'; best.mesh.visible = false;
      vis.waste += 4;
      sim.toast('♻️ Lizozom bir virüsü sindirdi!', 'good');
    }
  }
  // Çoğalma: virüs genomu hücrenin ATP'sini ve ribozomlarını kullanır
  if (G.genomes > 0) {
    const rate = G.genomes * 1.0 * (G.ifnT > 0 ? 0.2 : 1) * (E.atp > 0 ? 1 : 0.4);
    G.load += rate * h;
    E.atp = Math.max(0, E.atp - G.genomes * 1.0 * h);
  } else if (G.load > 0) G.load = Math.max(0, G.load - 4 * h);
  if (G.patrolT > 0) G.load = Math.max(0, G.load - 0.3 * E.L * h); // otofaji
  G.maxLoad = Math.max(G.maxLoad, G.load);
  // T hücresi
  if (G.tcellT >= 0) {
    G.tcellT -= h;
    tcell.position.z = Math.max(CELL_R * ZS + 1.5, tcell.position.z - 1.3 * h);
    if (G.tcellT <= 0) {
      G.tcellT = -1;
      if (G.genomes > 0 || G.load > 15) { endGame('feda'); return; }
      tcell.visible = false;
      sim.toast('🛡️ T hücresi kontrol etti: şehir temiz, geri döndü.', 'good');
    }
  }
  if (G.load >= 100) { G.load = 100; endGame('lose'); return; }
  if (G.spawned >= VIRUS_TOTAL && active === 0 && G.genomes === 0 && G.load <= 0.5) endGame('win');
}

// --- Döngü ---
let acc = 0, uiT = 0, chartT = 0;
sim.onUpdate((dt) => {
  acc += dt;
  let n = 0;
  while (acc >= STEP && n++ < 10) {
    acc -= STEP;
    econ(STEP);
    if (G.on) gameStep(STEP);
    uiT += STEP; chartT += STEP;
  }
  if (n >= 10) acc = 0;
  spawnVisuals();
  const pdt = Math.min(dt, 0.8);
  for (const k in pools) updatePool(pools[k], pdt);
  // Boştaki lizozomlar hafifçe süzülür
  if (!G.on || G.end) for (let i = 0; i < E.L; i++) {
    const L = lysos[i]; L.phase += pdt * 0.6;
    L.mesh.position.set(L.home.x + Math.sin(L.phase) * 0.35, 0.5, L.home.z + Math.cos(L.phase * 0.8) * 0.3);
  }
  if (uiT >= 0.25) { uiT = 0; updatePanel(); refreshHud(); }
  if (chartT >= 0.5) { chartT = 0; chart.push([E.atp, E.waste, G.on ? G.load : 0]); }
});

const hl = {};
let pulse = 0;
sim.onRender((rdt) => {
  pulse += rdt;
  // Görsel parlaklıklar: santraller üretimle, fabrikalar protein hızıyla parlar
  const mitoGlow = 0.12 + Math.min(0.9, E.atpRate / 40);
  const riboGlow = 0.15 + Math.min(0.8, E.protRate);
  for (const key in organMats) {
    const h = (hl[key] = Math.max(0, (hl[key] || 0) - rdt * 0.8));
    const base = key === 'mito' ? mitoGlow : key === 'ribozom' || key === 'er' ? riboGlow : 0.15;
    const blink = h > 0 ? h * (0.6 + 0.4 * Math.sin(pulse * 12)) : 0;
    for (const m of organMats[key]) m.emissiveIntensity = base + blink;
  }
  // Sitoplazma rengi: atık çok → bulanık; virüs yükü → kızarır
  floorMat.color.copy(floorBase).lerp(floorDirty, clamp((E.waste - 30) / 60, 0, 0.8)).lerp(floorSick, G.on ? clamp(G.load / 100, 0, 0.8) : 0);
  floorMat.emissive.copy(floorMat.color);
  // Virüs dönüşleri ve kopyalar
  for (const v of viruses) if (v.mesh.visible) { v.mesh.rotation.y += rdt * v.spin; v.mesh.rotation.x += rdt * 0.7; }
  const nc = G.on ? Math.min(120, Math.floor(G.load * 1.2)) : 0;
  const ca = copies.instanceMatrix.array;
  for (let i = 0; i < 120; i++) {
    const o = i * 16, p = copyPos[i];
    const s = i < nc ? 1 : 0;
    let x = p.x, z = p.z;
    if (G.end === 'lose') { const k = 1 + G.endT * 1.6; x *= k; z *= k; }
    ca[o] = ca[o + 5] = ca[o + 10] = s;
    ca[o + 12] = x; ca[o + 13] = p.y + Math.sin(pulse * 2 + i) * 0.08; ca[o + 14] = z;
  }
  copies.instanceMatrix.needsUpdate = true;
  // İnterferon halkası dışa yayılır
  if (G.on && G.ifnT > 0) {
    const f = (pulse * 0.6) % 1;
    ifnRing.scale.set(1 + f * 0.8, 1 + f * 0.8 * ZS, 1);
    ifnRing.material.opacity = 0.7 * (1 - f);
  } else ifnRing.material.opacity = 0;
  if (tcell.visible) tcell.rotation.y += rdt * 0.5;
  if (G.end === 'lose') { rimMat.color.setHex(0xef4444); rimMat.emissive.setHex(0xef4444); }
});

const _from = new THREE.Vector3(), _to = new THREE.Vector3();
function activeMito() { return mitos[Math.floor(Math.random() * E.M)].position; }
function spawnVisuals() {
  if (!showFlow.value) { for (const k in vis) vis[k] = 0; return; }
  const cap = 6;
  let c = 0;
  while (vis.glc >= 1 && c++ < cap) { vis.glc--; membranePoint(rand(0, TAU), _from); spawn(pools.glc, _from, activeMito(), rand(2, 3)); }
  c = 0;
  while (vis.o2 >= 1 && c++ < cap) { vis.o2--; membranePoint(rand(0, TAU), _from); spawn(pools.o2, _from, activeMito(), rand(1.5, 2.5)); }
  c = 0;
  while (vis.atp >= 1 && c++ < cap) {
    vis.atp--;
    _from.copy(activeMito());
    const r = Math.random();
    if (r < 0.45) _to.copy(pick(riboPos)); else if (r < 0.7) membranePoint(rand(0, TAU), _to); else _to.set(NUC.x + rand(-2, 2), 0.8, NUC.z + rand(-2, 2));
    spawn(pools.atp, _from, _to, rand(1.2, 2));
  }
  c = 0;
  while (vis.prot >= 1 && c++ < cap) { vis.prot--; _from.copy(riboPos[Math.floor(Math.random() * 72)]); spawn(pools.prot, _from, GOL, rand(1.5, 2.5)); }
  c = 0;
  while (vis.ves >= 1 && c++ < cap) { vis.ves--; membranePoint(rand(-1.4, 1.0), _to, CELL_R - 0.2); spawn(pools.ves, GOL_OUT, _to, rand(2.5, 3.5)); }
  c = 0;
  while (vis.waste >= 1 && c++ < cap) {
    vis.waste--;
    const L = lysos[Math.floor(Math.random() * E.L)].mesh.position;
    _from.set(L.x + rand(-2.5, 2.5), 0.3, L.z + rand(-2.5, 2.5));
    spawn(pools.waste, _from, L, rand(1.5, 2.5));
  }
  for (const k in vis) vis[k] = Math.min(vis[k], 20);
}

// --- Bilgi ve tıklama ---
function showInfo(key) {
  const i = INFO[key];
  if (!i) return;
  infoCard.set(`<div><b>${i.t}</b><br>${i.d}<br><i>💡 ${i.f}</i></div>`);
  hl[key] = 1.4;
  if (key === 'ribozom') hl.er = 1.4;
  sim.toast(`<b>${i.t}</b>`);
}
sim.onClick(clickables, (hit) => {
  let o = hit.object;
  while (o && !o.userData.org) o = o.parent;
  if (o) showInfo(o.userData.org);
});

// --- Panel ---
const ui = sim.ui;
const infoCard = ui.text('<div>👆 <b>Organellere tıkla</b>, şehirde hangi işi yaptıklarını öğren!</div>', 'card');
const goalCard = ui.text('', 'card');
function goalDone(msg) { sim.toast(`🎯 Görev tamam: ${msg}!`, 'good'); renderGoals(); }
function renderGoals() {
  const g = (ok, t) => `${ok ? '✅' : '⬜'} ${t}`;
  goalCard.set(`<div><b>🎯 Görevler</b><br>${g(goals.atp, '200 ATP biriktir')}<br>${g(goals.ship, '10 kargo paketi gönder')}<br>
    ${g(goals.build, 'Yeni bir santral ya da lizozom kur')}<br>${g(goals.win, 'Virüs saldırısını püskürt')}</div>`);
}

ui.section('🏙️ Şehri yönet');
const sFood = ui.slider({ label: '🍞 Besin girişi (glikoz + amino asit)', min: 0, max: 10, step: 1, value: 5,
  format: (v) => (v === 0 ? 'yok' : v < 4 ? 'az' : v < 8 ? 'orta' : 'bol') });
const sO2 = ui.slider({ label: '🫧 Oksijen', min: 0, max: 100, step: 5, value: 100, unit: '%' });
const sProd = ui.slider({ label: '🏭 Protein üretimi', min: 0, max: 100, step: 5, value: 60, unit: '%' });
ui.buttons([
  { label: '⚡ Yeni santral (80 ATP)', title: 'Mitokondriler bölünerek çoğalır', onClick: () => build('M') },
  { label: '♻️ Yeni lizozom (40 ATP)', onClick: () => build('L') },
]);
function build(kind) {
  const cost = kind === 'M' ? 80 : 40, amino = kind === 'M' ? 10 : 8;
  const max = kind === 'M' ? mitos.length : lysos.length;
  if ((kind === 'M' ? E.M : E.L) >= max) { sim.toast('Şehirde yer kalmadı!', 'warn'); return; }
  if (E.atp < cost || E.amino < amino) { sim.toast(`Yetersiz kaynak: ${cost} ATP ve ${amino} amino asit gerekir.`, 'warn'); return; }
  E.atp -= cost; E.amino -= amino;
  if (kind === 'M') { mitos[E.M].visible = true; E.M++; hl.mito = 1.2; sim.toast('⚡ Mitokondri bölündü: yeni santral hazır!', 'good'); }
  else { lysos[E.L].mesh.visible = true; E.L++; hl.lizozom = 1.2; sim.toast('♻️ Yeni lizozom hazır!', 'good'); }
  if (!goals.build) { goals.build = true; goalDone('Yeni bir yapı kurdun'); }
}

ui.section('📊 Kaynaklar');
const mATP = ui.meter({ label: '🔋 ATP (enerji)', color: '#facc15' });
const mGlc = ui.meter({ label: '🍬 Glikoz deposu', color: '#fef08a' });
const mAmino = ui.meter({ label: '🧱 Amino asit (yapı taşı)', color: '#34d399' });
const mWaste = ui.meter({ label: '🗑️ Atık', color: '#9ca3af' });
const stAtpRate = ui.stat({ label: 'ATP üretimi', unit: '/sn' });
const stProt = ui.stat({ label: 'Yapılan protein' });
const stShip = ui.stat({ label: 'Kargo paketi' });
const stBuild = ui.stat({ label: 'Santral · lizozom' });
const statusText = ui.text('', '');
const chart = ui.chart({ title: 'ATP, atık ve virüs yükü', series: [{ name: 'ATP', color: '#facc15' }, { name: 'Atık', color: '#9ca3af' }, { name: 'Virüs yükü', color: '#ef4444' }], maxPoints: 200, yMin: 0 });

ui.section('🦠 Virüs saldırısı');
ui.text('Virüsler zara bağlanır, içeri girer ve fabrikaları ele geçirir. Önce ATP biriktir, sonra savunmalarını seç!');
ui.button({ label: '🦠 Saldırıyı başlat', variant: 'danger', onClick: () => startAttack() });

ui.section('👁️ Görünüm', { open: false });
const showLabels = ui.toggle({ label: 'Şehir etiketleri', value: true, onChange: (v) => labels.forEach((l) => (l.visible = v)) });
const showFlow = ui.toggle({ label: 'Madde akışını göster', value: true, onChange: (v) => { if (!v) clearPools(); } });
ui.toggle({ label: 'Zar kubbesi', value: true, onChange: (v) => (dome.visible = v) });

function updatePanel() {
  mATP.set(E.atp / ATP_MAX, fmt(E.atp, 0));
  mGlc.set(E.glc / 60, fmt(E.glc, 0));
  mAmino.set(E.amino / 150, fmt(E.amino, 0));
  mWaste.set(E.waste / 100, fmt(E.waste, 0));
  mWaste.color(E.waste > 60 ? '#f97316' : '#9ca3af');
  stAtpRate.set(fmt(E.atpRate, 0), E.atpRate < 3 ? 'bad' : E.atpRate > 15 ? 'good' : '');
  stProt.set(fmt(E.prot, 0));
  stShip.set(E.shipped);
  stBuild.set(`${E.M} · ${E.L}`);
  const o2 = sO2.value;
  let msg = '🙂 Şehir düzenli çalışıyor.', cls = 'good';
  if (E.blackout) { msg = '🔌 Enerji kesintisi! Besini ve oksijeni artır ya da üretimi azalt.'; cls = 'bad'; }
  else if (o2 === 0) { msg = '🫧 Oksijen yok: santraller durdu, glikozdan yalnız 2 ATP çıkıyor.'; cls = 'bad'; }
  else if (E.waste > 60) { msg = '🗑️ Atık birikti, şehir yavaşladı. Yeni lizozom kur!'; cls = 'warn'; }
  else if (sFood.value === 0) { msg = '🍞 Besin gelmiyor; depolar tükeniyor.'; cls = 'warn'; }
  else if (G.on && G.genomes > 0 && !G.end) { msg = '🦠 Fabrikalar virüs kopyası yapmaya zorlanıyor!'; cls = 'bad'; }
  statusText.set(msg);
  statusText.el.className = 'ctl-text ' + cls;
}

// --- Sıfırlama ---
function resetAll() {
  Object.assign(E, { atp: 120, glc: 10, amino: 40, waste: 5, prot: 0, golgiQ: 0, shipped: 0, M: 4, L: 3, atpRate: 0, protRate: 0, blackout: false });
  mitos.forEach((m, i) => (m.visible = i < E.M));
  lysos.forEach((l, i) => { l.mesh.visible = i < E.L; l.mesh.position.copy(l.home); });
  G.on = false; G.end = null; G.genomes = 0; G.load = 0; G.ifnT = 0; G.patrolT = 0; G.tcellT = -1;
  resetGameVisuals();
  clearPools();
  for (const k in vis) vis[k] = 0;
  sim.hud.hide();
  chart.clear();
  acc = 0;
  updatePanel();
}
sim.onReset(resetAll);
resetAll();
renderGoals();
mitoLabel.visible = lysoLabel.visible = showLabels.value;
sim.toast('👋 Hoş geldin belediye başkanı! Organellere tıkla, şehri tanı.');
