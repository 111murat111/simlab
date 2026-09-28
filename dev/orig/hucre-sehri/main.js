// Hücre Şehri — hayvan hücresini bir şehir gibi yönet: glikoz + O₂ → ATP, protein üretimi, kargo ve virüs savunması.
import { createSim, THREE, BufferGeometryUtils, clamp, rand, pick, fmt, TAU } from '@core';

const CELL_R = 10, ZS = 0.82;        // hücre yarıçapı ve z basıklığı (elips)
const STEP = 0.1;                    // sabit simülasyon adımı (sn)
const ATP_MAX = 400;

const sim = createSim({
  background: 0x0b1628,
  camera: { position: [0, 17, 14], target: [0, 0, 0.8], fov: 50 },
  controls: { maxPolarAngle: 1.3, minDistance: 8, maxDistance: 42 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bir <b>hayvan hücresi</b>ni yukarıdan görüyorsun. Her organel şehirde bir göreve benzer:
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

// --- Malzemeler ---
const organMats = {}; // anahtar → [materyal, temel parlaklık]
function mat(key, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.55, ...opts });
  (organMats[key] ||= []).push(m);
  return m;
}
const clickables = [];
const tag = (obj, key) => { obj.userData.org = key; clickables.push(obj); return obj; };

// --- Hücre: sitoplazma, zar, kapılar ---
const cell = new THREE.Group();
scene.add(cell);
const floorMat = mat('sito', 0x1f7a8c, { roughness: 0.9 });
floorMat.emissiveIntensity = 0.12;
const floor = tag(new THREE.Mesh(new THREE.CircleGeometry(CELL_R, 72), floorMat), 'sito');
floor.rotation.x = -Math.PI / 2;
floor.scale.set(1, ZS, 1); // döndürülmüş dairede y ölçeği dünyada z olur
floor.position.y = -0.05;
cell.add(floor);
const floorBase = new THREE.Color(0x1f7a8c), floorDirty = new THREE.Color(0x6b5a2e), floorSick = new THREE.Color(0x7a2e4a);

const domeMat = mat('zar', 0xf9a8d4, { transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
const dome = new THREE.Mesh(new THREE.SphereGeometry(CELL_R, 56, 20, 0, TAU, 0, Math.PI / 2), domeMat);
dome.scale.set(1, 0.32, ZS);
cell.add(dome);
const rimMat = mat('zar', 0xec4899, { roughness: 0.4 });
const rim = tag(new THREE.Mesh(new THREE.TorusGeometry(CELL_R, 0.32, 10, 120), rimMat), 'zar');
rim.rotation.x = -Math.PI / 2;
rim.scale.set(1, ZS, 1);
cell.add(rim);

const membranePoint = (th, out, r = CELL_R) => out.set(Math.cos(th) * r, 0.35, Math.sin(th) * r * ZS);
{
  const n = 20, gate = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 10), mat('zar', 0xfacc15), n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) { membranePoint((i / n) * TAU + 0.1, d.position); d.updateMatrix(); gate.setMatrixAt(i, d.matrix); }
  cell.add(tag(gate, 'zar'));
}

// --- Çekirdek (belediye) ---
const NUC = V3(-2.9, 0.9, -0.4);
{
  const g = new THREE.Group();
  g.position.copy(NUC);
  const env = new THREE.Mesh(new THREE.SphereGeometry(2.6, 40, 24), mat('cekirdek', 0xa78bfa, { transparent: true, opacity: 0.55, depthWrite: false }));
  env.scale.y = 0.6;
  g.add(tag(env, 'cekirdek'));
  const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 16), mat('cekirdek', 0x6d28d9));
  nucleolus.position.set(0.5, 0, 0.3);
  g.add(tag(nucleolus, 'cekirdek'));
  const pts = [];
  for (let i = 0; i < 26; i++) pts.push(V3(rand(-1.8, 1.8), rand(-0.6, 0.6), rand(-1.8, 1.8)).clampLength(0, 1.9));
  const chrom = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 260, 0.07, 5), mat('cekirdek', 0xf0abfc));
  g.add(tag(chrom, 'cekirdek'));
  const pores = new THREE.InstancedMesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), mat('cekirdek', 0x4c1d95), 16);
  const d = new THREE.Object3D();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    d.position.set(Math.cos(a) * 2.45, 0.35 * Math.sin(i * 2.3), Math.sin(a) * 2.45);
    d.lookAt(0, 0, 0); d.updateMatrix(); pores.setMatrixAt(i, d.matrix);
  }
  g.add(pores);
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
  const erMat = mat('er', 0x60a5fa);
  for (const r of ER_R) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.17, 8, 56, ER_ARC), erMat);
    m.rotation.x = -Math.PI / 2;
    g.add(tag(m, 'er'));
  }
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
  const ribo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), mat('ribozom', 0xfb3f6c), riboPos.length);
  const d = new THREE.Object3D();
  riboPos.forEach((p, i) => { d.position.copy(p); d.updateMatrix(); ribo.setMatrixAt(i, d.matrix); });
  cell.add(tag(ribo, 'ribozom'));
}

// --- Golgi (kargo) ---
const GOL = V3(4.3, 0.4, -1.4);
{
  const g = new THREE.Group();
  g.position.copy(GOL);
  g.rotation.y = -1.0;
  const cols = [0xfb7185, 0xf59e0b, 0xfbbf24, 0xfde047];
  cols.forEach((c, k) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1.0 + k * 0.38, 0.19, 8, 32, 2.0), mat('golgi', c));
    m.rotation.x = -Math.PI / 2;
    m.position.y = k * 0.06;
    g.add(tag(m, 'golgi'));
  });
  cell.add(g);
}
const GOL_OUT = V3(6.0, 0.5, -1.5); // paketlerin çıktığı nokta

// --- Mitokondriler (santral) ---
const M_SLOTS = [[-6.9, 3.2, 0.4], [0.9, 4.8, -0.3], [6.1, 3.3, 0.9], [-6.4, -3.9, -0.6], [2.0, -5.9, 0.2],
  [-3.4, 5.6, 1.2], [7.8, -3.4, 1.3], [-8.3, 0.1, 1.6], [4.2, 5.7, -0.8], [-1.2, -6.4, 0.5]];
const mitoGeo = new THREE.CapsuleGeometry(0.55, 1.5, 4, 14);
const cristaeGeo = (() => {
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(V3(-0.95 + i * 0.24, 0.3, i % 2 ? 0.34 : -0.34));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 60, 0.07, 5);
})();
const mitoMat = mat('mito', 0xf97316);
const cristaeMat = mat('mito', 0xffedd5);
const mitos = M_SLOTS.map(([x, z, r]) => {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(mitoGeo, mitoMat);
  outer.rotation.z = Math.PI / 2;
  g.add(tag(outer, 'mito'), tag(new THREE.Mesh(cristaeGeo, cristaeMat), 'mito'));
  g.position.set(x, 0.45, z);
  g.rotation.y = r;
  g.scale.set(1, 0.65, 1);
  g.visible = false;
  cell.add(g);
  return g;
});

// --- Lizozomlar (geri dönüşüm) ---
const L_SLOTS = [[-4.6, 3.3], [2.9, 2.3], [-4.5, -5.3], [5.6, -4.8], [-8.2, -2.6], [0.9, -3.9], [2.4, 6.4], [8.4, 1.0]];
const lysoGeo = new THREE.SphereGeometry(0.42, 18, 12);
const lysoMat = mat('lizozom', 0x4ade80);
const lysos = L_SLOTS.map(([x, z]) => {
  const m = tag(new THREE.Mesh(lysoGeo, lysoMat), 'lizozom');
  m.position.set(x, 0.5, z);
  m.visible = false;
  cell.add(m);
  return { mesh: m, home: V3(x, 0.5, z), phase: rand(0, TAU) };
});

// --- Parçacık akışları (glikoz, O₂, ATP, protein, kargo, atık) ---
function makePool(color, r, n, emissive = 0.4) {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 8, 6),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.5 }), n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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
  const parts = [new THREE.IcosahedronGeometry(r, 1)];
  const dir = new THREE.Vector3(), q = new THREE.Quaternion(), up = V3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
    dir.set(Math.cos(th) * rr, y, Math.sin(th) * rr);
    q.setFromUnitVectors(up, dir);
    const c = new THREE.CylinderGeometry(spikeR * 0.5, spikeR * 0.5, spikeLen, 5).translate(0, r + spikeLen / 2, 0).applyQuaternion(q);
    const tip = new THREE.SphereGeometry(spikeR, 6, 4).translate(0, r + spikeLen, 0).applyQuaternion(q);
    parts.push(c, tip);
  }
  return BufferGeometryUtils.mergeGeometries(parts.map((g) => { const x = g.index ? g.toNonIndexed() : g; x.deleteAttribute('uv'); return x; }));
}
const virusGeo = spikyGeometry(0.36, 14, 0.2, 0.07);
const virusMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x991b1b, emissiveIntensity: 0.6, roughness: 0.4 });
const endoGeo = new THREE.SphereGeometry(0.7, 16, 10);
const endoMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.25, depthWrite: false });
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
const copies = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.15, 0), virusMat, 120);
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
const tcell = tag(new THREE.Mesh(spikyGeometry(1.3, 22, 0.35, 0.14),
  new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x166534, emissiveIntensity: 0.5, roughness: 0.5 })), 'tcell');
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
