// Bir Lokmanın Yolculuğu — çocuklar için sindirim sistemi: peristaltizmle ilerleyen lokma, organ durakları, kana geçen besinler.
import { createSim, THREE, clamp, lerp, fmt, pick } from '@core';

const sim = createSim({
  background: 0x10213a,
  camera: { position: [0, 1.2, 13], target: [0, 1.0, 0], fov: 45 },
  controls: { minDistance: 3, maxDistance: 22, maxPolarAngle: Math.PI * 0.85, minPolarAngle: Math.PI * 0.15 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Yediğin bir lokma, ağızdan başlayıp yaklaşık <b>8–9 metrelik</b> bir tüpten geçer. Tüpün kasları dalga gibi kasılarak
    (buna <b>peristaltizm</b> denir) lokmayı ileri iter. Her durakta lokmaya bir şey olur: çiğnenir, asitle karışır, parçalanır,
    besinleri kana geçer, suyu emilir.</p>
    <h3>Dene</h3>
    <ul>
      <li>Farklı yiyecekler seç: köftenin midede elmadan daha uzun kaldığını gör.</li>
      <li>İnce bağırsakta küçük renkli taneciklerin damarlara geçip karaciğere, oradan kalbe gittiğini izle.</li>
      <li>"Otomatik ilerle"yi kapat; her durakta "Devam" düğmesiyle kendin ilerle.</li>
      <li>Organlara tıkla: ne işe yaradıklarını öğren.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Süreler yaklaşıktır ve kişiden kişiye değişir. Bol su içmek ve lifli yiyecekler (meyve, sebze, tam tahıl) yemek
    sindirim sisteminin düzenli çalışmasına yardım eder.</p>`,
});

// --- Yiyecekler ---
const FOODS = {
  elma: { name: 'Elma', emoji: '🍎', color: 0xe23b3b, stomach: 45, small: 180, large: 20 * 60,
    n: { karb: 0.8, protein: 0.05, yag: 0.02, lif: 0.55, su: 0.9 },
    tip: 'Elma çabuk sindirilir. İçindeki <b>lif</b> sindirilmez ama bağırsakların düzenli çalışmasına yardım eder.' },
  ekmek: { name: 'Ekmek', emoji: '🍞', color: 0xd9a55b, stomach: 90, small: 210, large: 30 * 60,
    n: { karb: 1, protein: 0.3, yag: 0.08, lif: 0.3, su: 0.3 },
    tip: 'Ekmekteki <b>nişasta</b> daha ağızdayken tükürükle sindirilmeye başlar. Ekmeği uzun çiğne, tatlandığını fark edeceksin!' },
  kofte: { name: 'Köfte', emoji: '🍖', color: 0x8a4a2a, stomach: 210, small: 270, large: 36 * 60,
    n: { karb: 0.1, protein: 1, yag: 0.7, lif: 0, su: 0.5 },
    tip: 'Köftedeki <b>protein</b> kaslarının yapı taşıdır. Protein ve yağ midede uzun kalır; bu yüzden seni uzun süre tok tutar.' },
  cips: { name: 'Cips', emoji: '🥔', color: 0xf2c94c, stomach: 150, small: 240, large: 32 * 60,
    n: { karb: 0.6, protein: 0.1, yag: 0.85, lif: 0.12, su: 0.05 },
    tip: 'Cipsteki bol <b>yağ</b> mideyi yavaşlatır, içindeki fazla <b>tuz</b> da susatır. Ara sıra yemek sorun değil ama her gün değil!' },
};
const NUTS = {
  karb: { name: 'Karbonhidrat (şeker, nişasta)', color: 0xfacc15, css: '#facc15' },
  protein: { name: 'Protein', color: 0xf472b6, css: '#f472b6' },
  yag: { name: 'Yağ', color: 0xfb923c, css: '#fb923c' },
  su: { name: 'Su', color: 0x60a5fa, css: '#60a5fa' },
};

// --- Duraklar ---
const ST = [
  { key: 'agiz', name: 'Ağız', emoji: '👄', anim: 5, body: () => 1,
    text: () => `Dişler lokmayı küçük parçalara ayırır, dil karıştırır. <b>Tükürük</b> lokmayı ıslatır; içindeki enzim nişastayı sindirmeye başlar.<br>⏱ Yaklaşık 1 dakika çiğneme` },
  { key: 'yemekborusu', name: 'Yemek borusu', emoji: '⬇️', anim: 3, body: () => 0.15,
    text: () => `Yuttun! Yemek borusunun kasları dalga gibi kasılıp lokmayı mideye iter (<b>peristaltizm</b>).<br>⏱ Yalnızca 5–10 saniye` },
  { key: 'mide', name: 'Mide', emoji: '🫃', anim: 10, body: (f) => f.stomach,
    text: (f) => `Mide lokmayı <b>asit</b> ve enzimlerle yoğurup lapaya (<b>kimus</b>) çevirir. Proteinler burada parçalanmaya başlar.<br>${f.tip}<br>⏱ ${f.name} için yaklaşık ${hours(f.stomach)}` },
  { key: 'incebagirsak', name: 'İnce bağırsak', emoji: '🌀', anim: 18, body: (f) => f.small,
    text: () => `<b>Karaciğerden</b> gelen safra yağları küçük damlalara ayırır, <b>pankreas</b> sindirim suları yollar. Besinlerin çoğu burada minik tüycüklerden (<b>villus</b>) <b>kana geçer</b>!<br>⏱ Yaklaşık 3–5 saat` },
  { key: 'kalinbagirsak', name: 'Kalın bağırsak', emoji: '💧', anim: 12, body: (f) => f.large,
    text: () => `Kalan <b>su ve tuzlar</b> geri emilir. Burada yaşayan <b>yararlı bakteriler</b> lifleri işler. Kalan atık yavaş yavaş dışkıya dönüşür.<br>⏱ Genellikle 1–2 gün` },
  { key: 'cikis', name: 'Çıkış', emoji: '🚽', anim: 3, body: () => 5,
    text: (f) => `Yolculuk bitti! Sindirilemeyen kısımlar (${f.n.lif > 0.2 ? 'özellikle <b>lif</b>' : 'az miktarda artık'}) tuvalette dışarı atılır. Ellerini yıkamayı unutma! 🧼` },
];
function hours(min) {
  if (min < 60) return `${fmt(min)} dakika`;
  const h = min / 60;
  return `${fmt(h, h % 1 ? 1 : 0)} saat`;
}

// --- Beden ---
const skin = new THREE.MeshStandardMaterial({ color: 0xffc9a3, roughness: 0.6, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
{
  const prof = [[0.001, -3.5], [1.3, -3.3], [1.95, -2.4], [2.0, -1.0], [1.8, 0.2], [1.9, 1.6], [2.2, 2.8], [2.0, 3.6], [1.0, 3.95], [0.55, 4.1], [0.5, 4.4], [0.001, 4.45]].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(40), 40).scale(1, 1, 0.55), skin);
  torso.renderOrder = 5;
  sim.scene.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 24), skin);
  head.position.set(0, 5.35, 0);
  head.renderOrder = 5;
  sim.scene.add(head);
  const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), eyeB = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
  for (const x of [-0.4, 0.4]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), eyeW); e.position.set(x, 5.7, 0.98); sim.scene.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), eyeB); p.position.set(x, 5.72, 1.15); sim.scene.add(p);
    const ch = new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.6 }));
    ch.position.set(x * 1.6, 5.25, 0.95); ch.lookAt(x * 4, 5.25, 5); sim.scene.add(ch);
  }
}
// Ağız: dişler + dil + oynayan çene
const jaw = new THREE.Group();
jaw.position.set(0, 5.1, 0.2);
sim.scene.add(jaw);
{
  const tooth = new THREE.BoxGeometry(0.1, 0.1, 0.08), tm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + (i / 5) * 1.8;
    const up = new THREE.Mesh(tooth, tm); up.position.set(Math.sin(a) * 0.4, 5.22, 0.2 + Math.cos(a) * 0.55); sim.scene.add(up);
    const lo = new THREE.Mesh(tooth, tm); lo.position.set(Math.sin(a) * 0.38, 0.0, Math.cos(a) * 0.52); jaw.add(lo);
  }
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({ color: 0xf06a8a, roughness: 0.5 }));
  tongue.scale.set(0.3, 0.08, 0.45); tongue.position.set(0, 0.02, 0.15);
  jaw.add(tongue);
}

// --- Sindirim tüpü (tek parça, yarıçap ve renk boyunca değişir) ---
const C = {
  mouth: 0xf58ca0, eso: 0xf49a8a, stomach: 0xf4a261, small: 0xf7b2a0, large: 0xc9895e, rect: 0xb77a57,
};
const CP = [
  [[0, 5.2, 0.62], 0.22, C.mouth, 0], [[0, 5.0, 0.2], 0.22, C.mouth, 0], [[0, 4.5, -0.05], 0.17, C.eso, 1],
  [[0, 3.6, -0.12], 0.15, C.eso, 1], [[0.05, 2.8, -0.1], 0.15, C.eso, 1], [[0.15, 2.1, 0], 0.15, C.eso, 1],
  [[0.38, 1.75, 0.1], 0.32, C.stomach, 2], [[0.82, 1.62, 0.18], 0.62, C.stomach, 2], [[1.05, 1.18, 0.24], 0.7, C.stomach, 2],
  [[0.85, 0.72, 0.3], 0.58, C.stomach, 2], [[0.45, 0.55, 0.32], 0.36, C.stomach, 2], [[0.15, 0.6, 0.3], 0.2, C.stomach, 2],
  [[-0.2, 0.5, 0.25], 0.17, C.small, 3], [[-0.45, 0.15, 0.15], 0.17, C.small, 3], [[-0.2, -0.3, 0.2], 0.17, C.small, 3],
];
// İnce bağırsak kıvrımları
for (let row = 0; row < 5; row++) {
  const y = -0.62 - row * 0.33;
  const xs = row % 2 ? [0.85, 0.3, -0.3, -0.85] : [-0.85, -0.3, 0.3, 0.85];
  xs.forEach((x, k) => CP.push([[x, y + (k % 2 ? 0.06 : -0.04), 0.22 + ((k + row) % 2) * 0.12], 0.17, C.small, 3]));
}
CP.push([[-1.0, -2.1, 0.3], 0.18, C.small, 3]);
const LARGE_START = CP.length;
CP.push(
  [[-1.38, -1.95, 0.25], 0.32, C.large, 4], [[-1.5, -1.0, 0.25], 0.31, C.large, 4], [[-1.4, 0.0, 0.3], 0.3, C.large, 4],
  [[-0.7, 0.18, 0.55], 0.29, C.large, 4], [[0.1, 0.12, 0.62], 0.29, C.large, 4], [[0.9, 0.2, 0.55], 0.29, C.large, 4],
  [[1.45, 0.05, 0.3], 0.29, C.large, 4], [[1.55, -1.0, 0.25], 0.28, C.large, 4], [[1.45, -2.1, 0.25], 0.27, C.large, 4],
  [[0.75, -2.55, 0.3], 0.26, C.large, 4], [[0.15, -2.6, 0.1], 0.26, C.rect, 5], [[0, -3.0, 0], 0.22, C.rect, 5], [[0, -3.35, 0], 0.13, C.rect, 5],
);
const curve = new THREE.CatmullRomCurve3(CP.map((c) => new THREE.Vector3(...c[0])), false, 'centripetal');
// Denetim noktalarının yay uzunluğu parametresi
const cpU = (() => {
  const N = 3000, pts = [];
  for (let i = 0; i <= N; i++) pts.push(curve.getPointAt(i / N));
  let from = 0;
  return CP.map((c) => {
    const p = new THREE.Vector3(...c[0]);
    let best = from, bd = Infinity;
    for (let i = from; i <= Math.min(N, from + 600); i++) { const d = pts[i].distanceToSquared(p); if (d < bd) { bd = d; best = i; } }
    from = best;
    return best / N;
  });
})();
// Durak aralıkları
ST.forEach((s, i) => {
  const idx = CP.map((c, k) => (c[3] === i ? k : -1)).filter((k) => k >= 0);
  s.u0 = i === 0 ? 0 : cpU[idx[0]];
  s.u1 = i === ST.length - 1 ? 1 : cpU[CP.findIndex((c) => c[3] === i + 1)];
  s.center = curve.getPointAt((s.u0 + s.u1) / 2);
});
ST[0].u0 = 0.0;
function radiusAt(u) {
  for (let i = 1; i < CP.length; i++) if (u <= cpU[i]) { const t = (u - cpU[i - 1]) / (cpU[i] - cpU[i - 1] || 1); return lerp(CP[i - 1][1], CP[i][1], t * t * (3 - 2 * t)); }
  return CP[CP.length - 1][1];
}
const _ca = new THREE.Color(), _cb = new THREE.Color();
function colorAt(u, out) {
  for (let i = 1; i < CP.length; i++) if (u <= cpU[i]) { const t = (u - cpU[i - 1]) / (cpU[i] - cpU[i - 1] || 1); return out.copy(_ca.setHex(CP[i - 1][2])).lerp(_cb.setHex(CP[i][2]), t); }
  return out.setHex(CP[CP.length - 1][2]);
}
const TS = 700, RS = 14;
const tubeGeo = new THREE.TubeGeometry(curve, TS, 1, RS, false);
const tPos = tubeGeo.attributes.position;
const centers = [], dirs = new Float32Array(tPos.count * 3), base = new Float32Array(TS + 1);
{
  for (let i = 0; i <= TS; i++) { centers.push(curve.getPointAt(i / TS)); base[i] = radiusAt(i / TS); }
  const col = new Float32Array(tPos.count * 3), c = new THREE.Color();
  for (let i = 0; i <= TS; i++) {
    colorAt(i / TS, c);
    for (let j = 0; j <= RS; j++) {
      const k = i * (RS + 1) + j;
      dirs[k * 3] = tPos.getX(k) - centers[i].x; dirs[k * 3 + 1] = tPos.getY(k) - centers[i].y; dirs[k * 3 + 2] = tPos.getZ(k) - centers[i].z;
      col.set([c.r, c.g, c.b], k * 3);
    }
  }
  tubeGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tPos.setUsage(THREE.DynamicDrawUsage);
}
const tube = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }));
tube.renderOrder = 2;
sim.scene.add(tube);
let normTick = 0;
function deformTube(ub, bolusR, churn, t) {
  const w = 0.012;
  for (let i = 0; i <= TS; i++) {
    const u = i / TS;
    let r = base[i];
    const du = u - ub;
    // Lokmanın olduğu yerde şişkinlik, hemen arkasında sıkışma (peristaltik dalga)
    const bulge = Math.exp(-((du / w) ** 2));
    const squeeze = Math.exp(-(((du + 2.2 * w) / w) ** 2));
    r = Math.max(r * (1 - 0.45 * squeeze), bolusR * 1.1 * bulge + r * (1 - bulge));
    if (churn > 0 && u > ST[2].u0 && u < ST[2].u1) r *= 1 + churn * 0.08 * Math.sin(u * 180 - t * 6);
    // Hafif sürekli dalga
    r *= 1 + 0.03 * Math.sin(u * 90 - t * 2.5);
    for (let j = 0; j <= RS; j++) {
      const k = i * (RS + 1) + j;
      tPos.setXYZ(k, centers[i].x + dirs[k * 3] * r, centers[i].y + dirs[k * 3 + 1] * r, centers[i].z + dirs[k * 3 + 2] * r);
    }
  }
  tPos.needsUpdate = true;
  if (++normTick % 3 === 0) tubeGeo.computeVertexNormals();
}

// --- Yardımcı organlar ---
const organInfo = [];
function organ(mesh, name, info) { mesh.userData.info = { name, info }; organInfo.push(mesh); sim.scene.add(mesh); return mesh; }
const liver = organ(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshStandardMaterial({ color: 0x9a3b2c, roughness: 0.5 })), 'Karaciğer',
  'Vücudun en büyük iç organı. Safra üretir, bağırsaktan gelen kandaki besinleri işler ve depolar, zararlı maddeleri temizler.');
liver.scale.set(1.25, 0.55, 0.6); liver.position.set(-0.75, 1.55, 0.1); liver.rotation.z = 0.2;
const gall = organ(new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.4 })), 'Safra kesesi',
  'Karaciğerin ürettiği yeşilimsi safrayı depolar ve yemekten sonra ince bağırsağa sıkar. Safra, yağları küçük damlalara ayırır.');
gall.scale.set(1, 1.4, 1); gall.position.set(-0.55, 0.95, 0.45);
const pancreas = organ(new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 1.1, 6, 12), new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.6 })), 'Pankreas',
  'Midenin arkasında durur. Güçlü sindirim suları üretip ince bağırsağa gönderir; ayrıca kan şekerini ayarlayan insülin hormonunu yapar.');
pancreas.rotation.z = Math.PI / 2 - 0.2; pancreas.position.set(0.35, 0.42, -0.25);
const heart = organ(new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4 })), 'Kalp',
  'Kanı tüm vücuda pompalar. Bağırsaktan emilen besinler kanla önce karaciğere, oradan kalbe ve tüm hücrelere gider.');
heart.position.set(0.35, 2.85, 0.2); heart.scale.set(1, 1.15, 0.9);
// Damarlar: kapı toplardamarı (bağırsak → karaciğer) ve karaciğer → kalp
const portal = new THREE.CatmullRomCurve3([[-0.05, -2.0, 0.05], [0.05, -1.2, 0.05], [-0.1, -0.5, 0.05], [-0.35, 0.3, 0.0], [-0.6, 1.2, 0.1]].map((p) => new THREE.Vector3(...p)));
const toHeart = new THREE.CatmullRomCurve3([[-0.6, 1.3, 0.1], [-0.25, 2.0, 0.05], [0.25, 2.6, 0.15]].map((p) => new THREE.Vector3(...p)));
const vesselMat = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.4, transparent: true, opacity: 0.55, depthWrite: false });
organ(new THREE.Mesh(new THREE.TubeGeometry(portal, 60, 0.07, 8), vesselMat), 'Kapı toplardamarı', 'Bağırsaklardan emilen besinlerle dolu kanı önce karaciğere taşır; karaciğer bu besinleri işler ve süzer.');
organ(new THREE.Mesh(new THREE.TubeGeometry(toHeart, 30, 0.07, 8), vesselMat), 'Toplardamar (karaciğerden kalbe)', 'Karaciğerden çıkan kan kalbe gider; kalp de onu tüm vücuda pompalar.');
// Bağırsaktan kapı toplardamarına dallar
const branches = [];
for (const [x, y] of [[-0.85, -0.6], [0.85, -0.9], [-0.85, -1.3], [0.85, -1.6], [-0.6, -1.95], [0.6, -0.3]]) {
  const b = new THREE.CatmullRomCurve3([new THREE.Vector3(x, y, 0.2), new THREE.Vector3(x * 0.5, y + 0.1, 0.1), portal.getPointAt(clamp(0.1 + (y + 2) / 3.4 * 0.5, 0, 0.6))]);
  branches.push(b);
  const m = new THREE.Mesh(new THREE.TubeGeometry(b, 16, 0.035, 6), vesselMat);
  sim.scene.add(m);
}
// Tüp üzerine tıklama bilgisi
tube.userData.info = null;

// --- Lokma ---
const bolusMat = new THREE.MeshStandardMaterial({ color: 0xe23b3b, roughness: 0.55, emissive: 0x220000 });
const bolus = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), bolusMat);
sim.scene.add(bolus);
const bolusGlow = new THREE.PointLight(0xffffff, 2.2, 3, 1.5);
bolus.add(bolusGlow);

// --- Tanecikler (besin → kan, su, safra/pankreas suyu) ---
const NP = 260;
const pMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), NP);
pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pMesh.frustumCulled = false;
for (let i = 0; i < NP; i++) pMesh.setColorAt(i, new THREE.Color(0xffffff));
sim.scene.add(pMesh);
const parts = Array.from({ length: NP }, () => ({ alive: false }));
const tmpC = new THREE.Color();
function emit(kind, from) {
  const p = parts.find((q) => !q.alive);
  if (!p) return;
  p.alive = true; p.kind = kind; p.t = 0; p.from = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, 0.1));
  if (kind === 'su' && stageIdx === 4) { p.mode = 'fade'; p.dir = new THREE.Vector3().randomDirection().multiplyScalar(0.8); }
  else if (kind === 'safra' || kind === 'pankreas') { p.mode = 'juice'; p.to = from.clone(); p.from = (kind === 'safra' ? gall.position : pancreas.position).clone(); }
  else { p.mode = 'blood'; p.branch = pick(branches); }
  pMesh.setColorAt(parts.indexOf(p), tmpC.setHex(kind === 'safra' ? 0x7cb342 : kind === 'pankreas' ? 0xfff176 : NUTS[kind].color));
  pMesh.instanceColor.needsUpdate = true;
}
const dummy = new THREE.Object3D(), tv = new THREE.Vector3();
function updateParticles(dt) {
  parts.forEach((p, i) => {
    if (!p.alive) { dummy.position.set(0, -99, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix(); pMesh.setMatrixAt(i, dummy.matrix); return; }
    p.t += dt;
    let s = 1;
    if (p.mode === 'fade') { tv.copy(p.from).addScaledVector(p.dir, p.t); s = Math.max(0, 1 - p.t / 1.4); if (p.t > 1.4) p.alive = false; }
    else if (p.mode === 'juice') { const f = Math.min(1, p.t / 0.9); tv.copy(p.from).lerp(p.to, f); if (f >= 1) p.alive = false; }
    else {
      // bağırsak → dal → kapı toplardamarı → karaciğer → kalp
      const T1 = 0.6, T2 = 2.0, T3 = 0.9;
      if (p.t < T1) tv.copy(p.from).lerp(p.branch.getPoint(0), p.t / T1);
      else if (p.t < T1 + 0.7) tv.copy(p.branch.getPoint((p.t - T1) / 0.7));
      else if (p.t < T1 + 0.7 + T2) { const end = p.branch.getPoint(1); const u0 = nearestU(end); tv.copy(portal.getPointAt(lerp(u0, 1, (p.t - T1 - 0.7) / T2))); }
      else if (p.t < T1 + 0.7 + T2 + T3) tv.copy(toHeart.getPointAt((p.t - T1 - 0.7 - T2) / T3));
      else { p.alive = false; heartPulse = 1; }
    }
    dummy.position.copy(tv); dummy.scale.setScalar(s); dummy.updateMatrix();
    pMesh.setMatrixAt(i, dummy.matrix);
  });
  pMesh.instanceMatrix.needsUpdate = true;
}
const nuCache = new Map();
function nearestU(pt) {
  const k = pt.x.toFixed(2) + pt.y.toFixed(2);
  if (nuCache.has(k)) return nuCache.get(k);
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 50; i++) { const d = portal.getPointAt(i / 50).distanceToSquared(pt); if (d < bd) { bd = d; best = i / 50; } }
  nuCache.set(k, best);
  return best;
}

// --- Bilgi balonu ---
const bubble = sim.label('', { position: [0, 0, 0] });
Object.assign(bubble.el.style, { whiteSpace: 'normal', width: '230px', background: 'rgba(255,255,255,.95)', color: '#1f2937', textShadow: 'none',
  fontWeight: '500', fontSize: '12.5px', lineHeight: '1.35', padding: '8px 10px', borderRadius: '12px', border: '2px solid #fbbf24', marginLeft: '125px' });
const stageLabels = [];
ST.forEach((s) => {
  if (s.key === 'cikis') return;
  const l = sim.label(`${s.emoji} ${s.name}`, { position: s.key === 'agiz' ? [-1.5, 5.1, 0.6] : s.key === 'yemekborusu' ? [-0.95, 3.3, 0] : s.key === 'mide' ? [2.1, 1.3, 0.3] : s.key === 'incebagirsak' ? [0, -1.15, 0.9] : [-2.3, -1.0, 0.3] });
  stageLabels.push(l);
});
stageLabels.push(sim.label('Karaciğer', { position: [-1.4, 2.05, 0.3], className: 'plain' }), sim.label('Pankreas', { position: [1.5, 0.35, -0.2], className: 'plain' }),
  sim.label('Safra kesesi', { position: [-1.0, 0.75, 0.6], className: 'plain' }), sim.label('Kalp', { position: [1.0, 3.0, 0.2], className: 'plain' }));

// --- Durum ---
let food = FOODS.elma, foodKey = 'elma';
let u = 0, stageIdx = 0, stageT = 0, bodyMin = 0, waiting = false, done = false, heartPulse = 0, stopT = 0;
const absorbed = { karb: 0, protein: 0, yag: 0, su: 0 };
let emitAcc = 0;

function setFood(k) {
  foodKey = k; food = FOODS[k];
  restart();
}
function restart() {
  u = 0; stageIdx = 0; stageT = 0; bodyMin = 0; waiting = false; done = false; stopT = 0;
  Object.keys(absorbed).forEach((k) => (absorbed[k] = 0));
  parts.forEach((p) => (p.alive = false));
  bolusMat.color.setHex(food.color);
  sim.hud.hide();
  showStage();
}
function showStage() {
  const s = ST[stageIdx];
  bubble.setText(`<div style="font-size:14px;font-weight:700;margin-bottom:3px">${s.emoji} ${s.name}</div>${s.text(food)}` +
    (waiting ? '<div style="margin-top:5px;color:#b45309;font-weight:700">▶ "Devam" düğmesine bas</div>' : ''));
  const c = s.center;
  bubble.position.set(c.x + (s.key === 'mide' ? 0.9 : 0.4), c.y + 0.3, c.z + 0.6);
  if (s.key === 'agiz' || s.key === 'yemekborusu') bubble.position.set(0.9, s.key === 'agiz' ? 5.4 : 3.3, 0.4);
  if (s.key === 'cikis') bubble.position.set(0.7, -2.9, 0.4);
  stepList.set(ST.map((x, i) => `<div style="opacity:${i > stageIdx ? 0.5 : 1}">${i < stageIdx || done ? '✅' : i === stageIdx ? '👉' : '⬜'} ${x.emoji} ${x.name}</div>`).join(''));
}
function nextStage() {
  if (stageIdx >= ST.length - 1) {
    done = true;
    const tot = Object.keys(food.n).filter((k) => k !== 'lif').reduce((a, k) => a + food.n[k], 0);
    sim.hud.show(`<h2>🎉 Yolculuk tamamlandı!</h2>${food.emoji} <b>${food.name}</b> toplam yaklaşık <b>${hours(bodyMin)}</b> sürdü.<br>
      Kana geçen besinler: ${Object.keys(absorbed).filter((k) => food.n[k] > 0.04).map((k) => `<span style="color:${NUTS[k].css}">● ${NUTS[k].name.split(' (')[0]}</span>`).join(' · ')}<br>
      <small>${tot > 1.5 ? 'Bu yiyecek bol besin sağladı!' : 'Dengeli beslenmek için farklı yiyecekleri birlikte ye.'}</small><br>
      <button class="btn primary" data-a>🔁 Başka bir yiyecek dene</button>`, { tone: 'good' });
    sim.hud.el.querySelector('[data-a]').onclick = () => { const keys = Object.keys(FOODS); const nk = keys[(keys.indexOf(foodKey) + 1) % keys.length]; foodSeg.set(nk); setFood(nk); };
    showStage();
    return;
  }
  stageIdx++; stageT = 0; stopT = 0;
  waiting = false;
  showStage();
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Ne yiyelim?');
const foodSeg = ui.segmented({ options: Object.entries(FOODS).map(([k, f]) => ({ value: k, label: `${f.emoji} ${f.name}` })), value: 'elma', onChange: setFood });
const foodCard = ui.text('', 'card');
function showFood() {
  const bar = (v) => '●'.repeat(Math.round(v * 5)) + '○'.repeat(5 - Math.round(v * 5));
  foodCard.set(`<b>${food.emoji} ${food.name} içinde</b><br>
    <span style="color:#facc15">Karbonhidrat</span> ${bar(food.n.karb)}<br><span style="color:#f472b6">Protein</span> ${bar(food.n.protein)}<br>
    <span style="color:#fb923c">Yağ</span> ${bar(food.n.yag)}<br><span style="color:#a3e635">Lif</span> ${bar(food.n.lif)}<br><span style="color:#60a5fa">Su</span> ${bar(food.n.su)}`);
}
ui.section('Yolculuk');
const mProg = ui.meter({ label: 'İlerleme', color: 'linear-gradient(90deg,#f472b6,#fbbf24)' });
const stClock = ui.stat({ label: 'Vücut saati' });
const stStage = ui.stat({ label: 'Şu an' });
const stepList = ui.text('', 'card');
ui.buttons([
  { label: '▶ Devam', variant: 'primary', onClick: () => { if (waiting) { waiting = false; nextStage(); } } },
  { label: '🔁 Baştan', onClick: () => restart() },
]);
const auto = ui.toggle({ label: 'Otomatik ilerle', value: true, onChange: (v) => { if (v && waiting) { waiting = false; nextStage(); } } });
const follow = ui.toggle({ label: '🎥 Kamera lokmayı izlesin', value: false, onChange: (v) => { if (!v) sim.moveCamera([0, 1.2, 13], [0, 1.0, 0]); } });
ui.toggle({ label: 'Organ adları', value: true, onChange: (v) => stageLabels.forEach((l) => (l.visible = v)) });
ui.section('Kana geçen besinler');
const meters = {};
for (const [k, n] of Object.entries(NUTS)) meters[k] = ui.meter({ label: n.name, color: n.css });
ui.section('İlginç bilgiler');
const FACTS = [
  'Bir günde yaklaşık 1 litre tükürük üretiriz!',
  'İnce bağırsak yaklaşık 6 metre uzunluğundadır; bir sınıfın boyu kadar! Karnımıza katlanarak sığar.',
  'Mide kendi güçlü asidinden kalın bir mukus (sümüksü) tabakasıyla korunur.',
  'Karaciğer vücudun en büyük iç organıdır ve yüzlerce farklı iş yapar.',
  'Kalın bağırsakta trilyonlarca yararlı bakteri yaşar; bazıları vitamin bile üretir.',
  'Yemek borusu lokmayı kaslarıyla ittiği için baş aşağı dururken bile yutabilirsin (ama deneme!).',
  'Mide gurultusunun bilimsel adı "borborigmus"tur.',
  'İnce bağırsağın içi milyonlarca minik tüycükle (villus) kaplıdır; bu yüzden yüzeyi çok büyüktür.',
  'Pankreas hem sindirim suları hem de kan şekerini ayarlayan insülin hormonu üretir.',
  'Safra kesesi, karaciğerin yaptığı safrayı depolar; safra yağları küçük damlalara ayırır.',
  'Yemeği iyi çiğnemek midenin işini kolaylaştırır; lokmalarını küçük al ve acele etme.',
];
const factCard = ui.text('', 'card');
const newFact = () => factCard.set('💡 ' + pick(FACTS));
ui.button({ label: '🎲 Başka bir bilgi', onClick: newFact });
ui.section('Seçilen organ');
const organCard = ui.text('<small>Bir organa tıkla.</small>', 'card');

sim.onClick(() => [...organInfo, tube], (hit) => {
  let info = hit.object.userData.info;
  if (!info && hit.object === tube) {
    // tüpte en yakın durak
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 200; i++) { const d = curve.getPointAt(i / 200).distanceToSquared(hit.point); if (d < bd) { bd = d; best = i / 200; } }
    const s = ST.find((x) => best >= x.u0 && best <= x.u1) || ST[0];
    info = { name: `${s.emoji} ${s.name}`, info: s.text(food) };
  }
  if (!info) return;
  organCard.set(`<b>${info.name}</b><br>${info.info}`);
  sim.toast(`📍 ${info.name}`);
});
sim.controls.addEventListener('start', () => { if (follow.value) follow.set(false); });

// --- Döngü ---
sim.formatTime = () => `Vücut saati ${hours(bodyMin)}`;
sim.onUpdate((dt, t) => {
  const s = ST[stageIdx];
  if (!done && !waiting) {
    stageT += dt;
    const PAUSE = 1.5; // her durağın başında kısa bekleme (balonu okumak için)
    if (stageT > PAUSE) {
      const f = clamp((stageT - PAUSE) / s.anim, 0, 1);
      u = lerp(s.u0, s.u1, stageIdx === ST.length - 1 ? f : f);
      bodyMin += (dt / s.anim) * s.body(food);
      if (f >= 1) {
        if (stageIdx < ST.length - 1 && !auto.value) { waiting = true; showStage(); }
        else nextStage();
      }
    }
    // Emilim
    if (s.key === 'incebagirsak' && stageT > PAUSE) {
      emitAcc += dt * 6;
      while (emitAcc > 1) {
        emitAcc--;
        const opts = ['karb', 'protein', 'yag', 'su'].filter((k) => food.n[k] > 0.04 && absorbed[k] < food.n[k] * (k === 'su' ? 0.8 : 0.95));
        if (opts.length) { const k = pick(opts); absorbed[k] = Math.min(food.n[k], absorbed[k] + food.n[k] / 18); emit(k, bolus.position); }
      }
      if (u < s.u0 + 0.03 && Math.random() < dt * 8) emit(Math.random() < 0.5 ? 'safra' : 'pankreas', bolus.position);
    } else if (s.key === 'kalinbagirsak' && stageT > PAUSE) {
      emitAcc += dt * 4;
      while (emitAcc > 1) { emitAcc--; if (food.n.su > 0.04 && absorbed.su < food.n.su) { absorbed.su = Math.min(food.n.su, absorbed.su + food.n.su * 0.2 / 8); emit('su', bolus.position); } }
    }
  }
  // Lokma görünümü
  const p = curve.getPointAt(clamp(u, 0, 1));
  bolus.position.copy(p);
  const eaten = Object.keys(absorbed).reduce((a, k) => a + absorbed[k], 0) / Math.max(0.3, Object.keys(absorbed).reduce((a, k) => a + food.n[k], 0));
  let r = stageIdx === 0 ? lerp(0.24, 0.18, clamp(stageT / 4, 0, 1)) : stageIdx === 1 ? 0.14 : stageIdx === 2 ? 0.34 : lerp(0.16, 0.2, 1 - eaten);
  if (stageIdx >= 4) r = 0.2;
  if (done) r = 0.001;
  const wob = stageIdx === 0 ? 0.25 * Math.abs(Math.sin(t * 9)) : stageIdx === 2 ? 0.15 * Math.sin(t * 5) : 0;
  bolus.scale.set(r * (1 + wob), r * (1 - wob * 0.6), r);
  bolus.rotation.y += dt * 2;
  // Renk: midede lapaya, kalın bağırsakta kahverengiye döner
  const target = stageIdx >= 4 ? 0x6d4c2f : stageIdx >= 2 ? 0xd9b98a : food.color;
  bolusMat.color.lerp(tmpC.setHex(target), 1 - Math.exp(-dt * 0.8));
  // Çene çiğneme
  jaw.rotation.x = stageIdx === 0 && !done ? 0.25 * Math.max(0, Math.sin(t * 9)) : jaw.rotation.x * 0.9;
  deformTube(done ? -1 : u, done ? 0 : r, stageIdx === 2 ? 1 : 0, t);
  updateParticles(dt);
  heartPulse = Math.max(0, heartPulse - dt * 3);
  const hb = 1 + 0.08 * Math.max(0, Math.sin(t * 7.5)) + heartPulse * 0.15;
  heart.scale.set(hb, hb * 1.15, hb * 0.9);
  // Göstergeler
  mProg.set(done ? 1 : u, done ? 'tamamlandı' : `%${Math.round(u * 100)}`);
  stClock.set(hours(bodyMin));
  stStage.set(`${ST[stageIdx].emoji} ${ST[stageIdx].name}`);
  for (const k of Object.keys(NUTS)) meters[k].set(food.n[k] ? absorbed[k] / food.n[k] : 0, food.n[k] > 0.04 ? `%${Math.round((absorbed[k] / food.n[k]) * 100)}` : 'yok denecek kadar az');
});
sim.onRender((dt) => {
  if (follow.value) {
    const c = sim.controls;
    c.target.lerp(bolus.position, 1 - Math.exp(-dt * 3));
    tv.copy(bolus.position).add(new THREE.Vector3(1.4, 0.6, 5.5));
    sim.camera.position.lerp(tv, 1 - Math.exp(-dt * 2));
  }
});

sim.onReset(() => { restart(); newFact(); if (!follow.value) sim.moveCamera([0, 1.2, 13], [0, 1.0, 0]); });
showFood();
newFact();
restart();
// yiyecek kartını seçimle güncelle
const _setFood = setFood;
foodSeg.el.addEventListener('click', () => showFood());
void _setFood; void stopT;
