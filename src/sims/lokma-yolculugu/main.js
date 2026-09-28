// Bir Lokmanın Yolculuğu — çocuklar için sindirim sistemi: peristaltizmle ilerleyen lokma, organ durakları, kana geçen besinler.
import { createSim, THREE, clamp, lerp, fmt, pick, mat, procedural, RoundedBoxGeometry, textPlane } from '@core';
import { blobGeometry, loftTube, sdfMesh, sEllipsoid, sCone , tissue } from './bio.js';
import { STAND, bodyItems } from './human.js';
import { createClassroom, classroomFloor } from './classroom.js';

// Ölçek: sindirim düzeni 'birim' uzayında (1 birim = K m ≈ 8,7 cm); gerçek boyutlu yetişkin gövdesine oturtulur
const K = 0.0868, OFF = [0, 1.1206, 0.0202];
const U2W = (a) => [a[0] * K + OFF[0], a[1] * K + OFF[1], a[2] * K + OFF[2]];
const HOME = [[0.3, 1.36, 1.78], [0, 1.2, 0.02]];   // tüm gövde + kaide üstü ve isim levhası kadrajda

const sim = createSim({
  studio: { mood: 'lab', color: 0x6f7880, warmth: 0.15, key: { el: 40, az: 150, power: 1.3 }, radius: 10, height: 6, floorMaterial: classroomFloor() },
  camera: { position: HOME[0], target: HOME[1], fov: 45, near: 0.02, far: 60 },
  controls: { minDistance: 0.25, maxDistance: 2.4, maxPolarAngle: Math.PI * 0.85, minPolarAngle: Math.PI * 0.15 },
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

// Ceviz kaplama (gerçek ölçek): dikey damar, 2–4 mm aralıklı lif çizgileri, gözenek, cila
function walnut(color = 0x5c4331, key = 'lok-walnut') {
  // Ceviz kaplama: düz kesim; ≈2–4 mm'lik ince lif figürü, düşük kontrast, yarı mat vernik
  return procedural({
    key, physical: true, bump: 0.0008, params: { color, roughness: 0.46, clearcoat: 0.55, clearcoatRoughness: 0.28 },
    pattern: `
      float a = p.x + p.z;
      float wav = fbm3(vec3(a*3.0, p.y*0.5, 3.0), 3);
      float fig = a*95.0 + wav*7.0 + 0.6*sin(p.y*4.0 + a*9.0);
      float band = smoothstep(0.2, 0.9, 0.5 + 0.5*sin(fig*6.2832));
      float fine = vn3(vec3(a*700.0, p.y*14.0, 1.0));
      float pore = smoothstep(0.8, 0.92, vn3(vec3(a*420.0, p.y*30.0, 5.0)));
      float flake = fbm3(vec3(a*5.0, p.y*1.0, 9.0), 3);
      col *= 0.9 + 0.08*band + 0.05*(fine - 0.5) + 0.1*(flake - 0.5);
      col = mix(col, vec3(dot(col, vec3(0.33))), 0.15);
      col = mix(col, col*vec3(0.75, 0.68, 0.62), pore*0.4);
      rough = 0.42 + 0.14*pore;
      h = band*0.3 + fine*0.4 - pore*0.4;`,
  });
}

// --- Beden: müze tipi "cam insan" gövde modeli (kolsuz torso + baş, gerçek boyut) kaide üstünde ---
// Sindirim düzeni birim uzayında kurulur (1 birim = K m); root grubu bunu metreye çevirir.
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
// Arka plan: fen sınıfı (bulanık duvarlar, alan derinliği hissi)
createClassroom(sim.scene);
const root = new THREE.Group();
root.scale.setScalar(K);
root.position.set(...OFF);
sim.scene.add(root);
const toU = (g) => g.translate(-OFF[0], -OFF[1], -OFF[2]).scale(1 / K, 1 / K, 1 / K); // ayakta metre → birim
{
  // Kaide: ceviz blok, fırçalı çelik üst plaka, pirinç isim levhası
  const TOP = 0.8;
  const block = new THREE.Mesh(new RoundedBoxGeometry(0.44, TOP - 0.012, 0.34, 4, 0.02), walnut());
  block.position.set(0, (TOP - 0.012) / 2, -0.01);
  // süpürgelik/kaide ayağı: biraz geniş, koyu, pahlı taban bloğu (gövdeyi yerden ayırır)
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.47, 0.06, 0.37, 3, 0.012), walnut(0x3e2c20, 'lok-walnut-dark'));
  plinth.position.set(0, 0.03, -0.01);
  plinth.castShadow = true; plinth.receiveShadow = true;
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.012, 0.36, 3, 0.004), mat.brushedMetal({ color: 0xc9ccd0, scale: 4 }));
  plate.position.set(0, TOP - 0.006, -0.01);
  const brass = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.05, 0.004, 2, 0.0015), mat.brushedMetal({ color: 0xc8a25a, scale: 6, rough: 0.25 }));
  brass.position.set(0, TOP - 0.08, 0.1605);
  const txt = textPlane('SİNDİRİM SİSTEMİ', 0.016, { color: '#3b2a12' });
  txt.position.set(0, TOP - 0.08, 0.163);
  sim.scene.add(block, plinth, plate, brass, txt);
  // Müze vitrini gibi kaideyi önden yumuşakça aydınlatan spot (kaide ve levha karanlıkta kalmasın)
  const spot = new THREE.SpotLight(0xfff0dc, 5, 4, 0.5, 0.8, 2);
  spot.position.set(0.35, 1.25, 1.5); spot.target.position.set(0, 0.55, 0);
  sim.scene.add(spot, spot.target);
}
// Cam gövde kabuğu: SDF beden (kolsuz, kalçadan kesik), gerçek kırılmalı ince cam
const shellItems = bodyItems(STAND, { build: 1.2, parts: { arms: false }, floorCut: 0.8 });
const shellRaw = sdfMesh(shellItems, { cell: LOWQ ? 0.011 : 0.0075 });
{ // gövde (boyun altı) organlara yer açmak için biraz geniş: stilize müze modeli oranı
  const p = shellRaw.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = THREE.MathUtils.smoothstep(p.getY(i), 1.4, 1.47); const w = 1 - f; p.setXYZ(i, p.getX(i) * (1 + 0.08 * w), p.getY(i), p.getZ(i) * (1 + 0.07 * w)); }
  shellRaw.computeVertexNormals();
}
const shellGeo = toU(shellRaw);
// İnce cam kabuk: yalnız ön yüz çizilir (çift geçiş yok); içerisi olduğu gibi görünür, yansıma ve kenar koyuluğu
// Fresnel ile artar (önceden çarpılmış alfa: arka plan × (1 − α) + yansıma)
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, ior: 1.5, specularIntensity: 1,
  transparent: true, depthWrite: false, side: THREE.FrontSide, envMapIntensity: 1.5,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
glassMat.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
    float gcv = clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0);
    float gF = pow(1.0 - gcv, 3.0);
    // kenarda camın içinden geçen yol uzar: hafif mavi-gri soğurma + ince parlak kontur
    float gA = 0.015 + 0.42*gF;
    outgoingLight += vec3(0.62, 0.72, 0.8)*0.1*gF;
    gl_FragColor = vec4(outgoingLight, gA);`);
};
glassMat.customProgramCacheKey = () => 'lokma-thin-glass';
const shell = new THREE.Mesh(shellGeo, glassMat);
shell.userData.noCast = true; shell.userData.noAO = true; shell.castShadow = false;
shell.renderOrder = 5;
root.add(shell);
// Gözler: göz yuvasında göz küreleri (cam kabuğun içinde)
{
  const scl = mat.ceramic({ color: 0xf1ece4 });
  const iris = mat.plastic({ color: 0x5a3a1c, gloss: 0.9 });
  const pup = mat.plastic({ color: 0x0b0b0c, gloss: 1 });
  for (const s of [-1, 1]) {
    const c = new THREE.Vector3(0.031 * s, 1.626, 0.064).sub(new THREE.Vector3(...OFF)).divideScalar(K);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.0118 / K, 32, 20), scl);
    e.position.copy(c); root.add(e);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.0119 / K, 32, 8, 0, Math.PI * 2, 0, 0.55), iris);
    ir.rotation.x = Math.PI / 2; ir.position.copy(c); root.add(ir);
    const pp = new THREE.Mesh(new THREE.SphereGeometry(0.01195 / K, 24, 6, 0, Math.PI * 2, 0, 0.24), pup);
    pp.rotation.x = Math.PI / 2; pp.position.copy(c); root.add(pp);
  }
}
// Ağız: dişler + dil + oynayan çene (birim uzayı)
const jaw = new THREE.Group();
jaw.position.set(0, 5.1, 0.2);
root.add(jaw);
{
  const tm = mat.ceramic({ color: 0xf0e8d6 });
  const gum = tissue({ color: 0xc8606c, veins: 0.1, scale: 3 });
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = -1.15 + (i / (N - 1)) * 2.3, back = Math.abs(a) > 0.6;
    const w = back ? 0.11 : 0.085;
    const tooth = new RoundedBoxGeometry(w, 0.1, back ? 0.1 : 0.05, 2, 0.02);
    const ux = Math.sin(a) * 0.27, uz = 0.2 + Math.cos(a) * 0.46;
    const up = new THREE.Mesh(tooth, tm); up.position.set(ux, 5.245, uz); up.rotation.y = a; root.add(up);
    const lo = new THREE.Mesh(tooth, tm); lo.position.set(ux * 0.96, 0.045, uz - 0.2 - 0.02); lo.rotation.y = a; jaw.add(lo);
  }
  // diş etleri (at nalı)
  const arch = (y, sc, zo) => new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => { const a = -1.2 + i * 0.3; return new THREE.Vector3(Math.sin(a) * 0.27 * sc, y, zo + Math.cos(a) * 0.46 * sc); }));
  root.add(new THREE.Mesh(loftTube(arch(5.3, 1, 0.2), () => 0.055, { segs: 40, radial: 10 }), gum));
  jaw.add(new THREE.Mesh(loftTube(arch(-0.01, 0.96, 0.0), () => 0.055, { segs: 40, radial: 10 }), gum));
  const tongue = new THREE.Mesh(blobGeometry(1, { detail: 10, amp: 0.05, freq: 2 }), tissue({ color: 0xc86a78, veins: 0.15, scale: 4 }));
  tongue.scale.set(0.24, 0.08, 0.36); tongue.position.set(0, 0.06, 0.08);
  jaw.add(tongue);
}

// --- Sindirim tüpü (tek parça, yarıçap ve renk boyunca değişir) ---
const C = {
  mouth: 0xc9606e, eso: 0xcf7f7a, stomach: 0xd98f78, small: 0xe3a08e, large: 0xc08a70, rect: 0xa9705e,
};
const CP = [
  [[0, 5.2, 0.5], 0.17, C.mouth, 0], [[0, 5.0, 0.2], 0.22, C.mouth, 0], [[0, 4.5, -0.05], 0.17, C.eso, 1],
  [[0, 3.6, -0.12], 0.15, C.eso, 1], [[0.05, 2.8, -0.1], 0.15, C.eso, 1], [[0.15, 2.1, 0], 0.15, C.eso, 1],
  [[0.38, 1.75, 0.1], 0.32, C.stomach, 2], [[0.82, 1.62, 0.18], 0.62, C.stomach, 2], [[1.05, 1.18, 0.24], 0.7, C.stomach, 2],
  [[0.85, 0.72, 0.3], 0.58, C.stomach, 2], [[0.45, 0.55, 0.32], 0.36, C.stomach, 2], [[0.15, 0.6, 0.3], 0.2, C.stomach, 2],
  [[-0.2, 0.5, 0.25], 0.17, C.small, 3], [[-0.45, 0.15, 0.15], 0.17, C.small, 3], [[-0.2, -0.3, 0.2], 0.17, C.small, 3],
];
// İnce bağırsak kıvrımları: yatay sıralar, uçlarda yarım daire dönüşler (tüp kendini kesmez, kıvrımlar düzgün)
for (let row = 0; row < 5; row++) {
  const y = -0.62 - row * 0.34, dir = row % 2 ? -1 : 1;
  const xs = [-0.82, -0.41, 0, 0.41, 0.82].map((x) => x * dir);
  xs.forEach((x, k) => CP.push([[x, y + 0.03 * Math.sin(k * 1.9 + row), 0.24 + 0.08 * Math.sin(k * 1.3 + row * 2.1)], 0.15, C.small, 3]));
  if (row < 4) CP.push([[xs[4] + 0.2 * dir, y - 0.17, 0.3], 0.15, C.small, 3]);
}
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
const TS = LOWQ ? 1000 : 1400, RS = LOWQ ? 22 : 28;
const tubeGeo = new THREE.TubeGeometry(curve, TS, 1, RS, false);
const tPos = tubeGeo.attributes.position;
const centers = [], dirs = new Float32Array(tPos.count * 3), base = new Float32Array(TS + 1);
{
  const LEN = curve.getLength();
  for (let i = 0; i <= TS; i++) {
    centers.push(curve.getPointAt(i / TS)); base[i] = radiusAt(i / TS);
    // kalın bağırsak cepleri (haustra): yaklaşık 3 cm aralıklı halka boğumları
    const ul = i / TS;
    if (ul > cpU[LARGE_START] && ul < cpU[CP.length - 3]) base[i] *= 1 - 0.14 * Math.pow(0.5 + 0.5 * Math.cos(ul * LEN / 0.36 * Math.PI * 2), 6);
  }
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
const tubeMat = tissue({ color: 0xffffff, veins: 0.22, scale: 5 });
tubeMat.vertexColors = true; tubeMat.side = THREE.DoubleSide; tubeMat.clearcoat = 0.9; tubeMat.clearcoatRoughness = 0.15;
const uBolus = { value: new THREE.Vector4(0, 0, 0, 0) };
{ // lokmanın olduğu yerde duvar içeriden sıcak ışık alır (ince doku ışığı geçirir)
  const b0 = tubeMat.onBeforeCompile;
  tubeMat.onBeforeCompile = (sh) => {
    b0(sh);
    sh.uniforms.uBolus = uBolus;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uBolus;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uBolus.w > 0.0) { float d = length(vPObj - uBolus.xyz); totalEmissiveRadiance += vec3(1.0, 0.45, 0.25) * exp(-d*d/(uBolus.w*uBolus.w)) * 0.5; }`);
  };
  tubeMat.customProgramCacheKey = () => 'lokma-tup';
}
const tube = new THREE.Mesh(tubeGeo, tubeMat);
root.add(tube);
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
function organ(mesh, name, info) { mesh.userData.info = { name, info }; organInfo.push(mesh); root.add(mesh); return mesh; }
const wet = (m, cc = 0.8) => { m.clearcoat = cc; m.clearcoatRoughness = 0.18; return m; };
// Karaciğer: büyük sağ lob + mideye uzanan ince sol lob, alt yüzü mide/bağırsak için oyuk
const liverGeo = sdfMesh([
  { p: [sEllipsoid([-0.9, 1.52, 0.1], [0.86, 0.56, 0.6], [0, 0, 0.25]), sEllipsoid([-0.1, 1.72, 0.2], [0.72, 0.34, 0.42], [0, 0, 0.12]),
    sEllipsoid([0.42, 1.86, 0.24], [0.36, 0.17, 0.28], [0, 0, -0.1])], k: 0.28 },
  { p: [sEllipsoid([0.85, 1.25, 0.2], [0.72, 0.62, 0.62])], k: 0.12, op: 'sub' },
  { p: [sEllipsoid([-0.6, 0.72, 0.3], [0.7, 0.35, 0.7])], k: 0.18, op: 'sub' },
], { cell: 0.045, noiseAmp: 0.012, noiseFreq: 2 });
const liver = organ(new THREE.Mesh(liverGeo, wet(tissue({ color: 0x7c2b22, veins: 0.12, scale: 1.6 }), 1)), 'Karaciğer',
  'Vücudun en büyük iç organı. Safra üretir, bağırsaktan gelen kandaki besinleri işler ve depolar, zararlı maddeleri temizler.');
const gall = organ(new THREE.Mesh(blobGeometry(0.17, { detail: 10, amp: 0.05, stretch: [1, 1.5, 1] }), wet(tissue({ color: 0x4d7a2e, veins: 0.05, scale: 5 }), 1)), 'Safra kesesi',
  'Karaciğerin ürettiği yeşilimsi safrayı depolar ve yemekten sonra ince bağırsağa sıkar. Safra, yağları küçük damlalara ayırır.');
gall.position.set(-0.55, 0.98, 0.45); gall.rotation.z = -0.4;
const panCurve = new THREE.CatmullRomCurve3([[-0.3, 0.3, -0.18], [0.1, 0.4, -0.27], [0.55, 0.5, -0.3], [0.95, 0.6, -0.25], [1.18, 0.72, -0.2]].map((p) => new THREE.Vector3(...p)));
const pancreas = organ(new THREE.Mesh(loftTube(panCurve, (t) => lerp(0.2, 0.085, t) * (1 + 0.1 * Math.sin(t * 40)), { segs: 60, radial: 16, squash: 0.75, noiseAmp: 0.03, noiseFreq: 9 }),
  wet(tissue({ color: 0xe0b27c, veins: 0.05, scale: 7 }), 0.5)), 'Pankreas',
  'Midenin arkasında durur. Güçlü sindirim suları üretip ince bağırsağa gönderir; ayrıca kan şekerini ayarlayan insülin hormonunu yapar.');
pancreas.position.set(0, 0, 0);
pancreas.userData.center = new THREE.Vector3(0.35, 0.45, -0.25);
// Kalp: karıncık gövdesi + sola-aşağı sivri uç + kulakçıklar + aort kökü
const heartGeo = sdfMesh([
  { p: [sEllipsoid([0, 0.02, 0], [0.36, 0.38, 0.31], [0, 0, -0.5]), sCone([0.05, -0.02, 0.02], [0.3, -0.36, 0.08], 0.28, 0.05),
    sEllipsoid([-0.24, 0.24, -0.05], [0.18, 0.16, 0.2]), sEllipsoid([0.2, 0.28, -0.12], [0.15, 0.13, 0.17]),
    sCone([-0.02, 0.22, -0.02], [-0.06, 0.62, -0.06], 0.11, 0.1), sCone([0.08, 0.2, 0.08], [0.12, 0.5, 0.02], 0.1, 0.09)], k: 0.1 },
], { cell: 0.02, noiseAmp: 0.006, noiseFreq: 5 });
const heart = organ(new THREE.Mesh(heartGeo, wet(tissue({ color: 0x9e2226, veins: 0.35, scale: 3 }), 0.9)), 'Kalp',
  'Kanı tüm vücuda pompalar. Bağırsaktan emilen besinler kanla önce karaciğere, oradan kalbe ve tüm hücrelere gider.');
heart.position.set(0.35, 2.85, 0.2);
// Damarlar: kapı toplardamarı (bağırsak → karaciğer) ve karaciğer → kalp
const portal = new THREE.CatmullRomCurve3([[-0.05, -2.0, 0.05], [0.05, -1.2, 0.05], [-0.1, -0.5, 0.05], [-0.35, 0.3, 0.0], [-0.6, 1.2, 0.1]].map((p) => new THREE.Vector3(...p)));
const toHeart = new THREE.CatmullRomCurve3([[-0.6, 1.3, 0.1], [-0.25, 2.0, 0.05], [0.25, 2.6, 0.15]].map((p) => new THREE.Vector3(...p)));
const vesselMat = wet(tissue({ color: 0x8e2f52, veins: 0.1, scale: 8 }), 0.9);
organ(new THREE.Mesh(loftTube(portal, () => 0.075, { segs: 80, radial: 12 }), vesselMat), 'Kapı toplardamarı', 'Bağırsaklardan emilen besinlerle dolu kanı önce karaciğere taşır; karaciğer bu besinleri işler ve süzer.');
organ(new THREE.Mesh(loftTube(toHeart, () => 0.075, { segs: 40, radial: 12 }), vesselMat), 'Toplardamar (karaciğerden kalbe)', 'Karaciğerden çıkan kan kalbe gider; kalp de onu tüm vücuda pompalar.');
// Bağırsaktan kapı toplardamarına dallar
const branches = [];
for (const [x, y] of [[-0.85, -0.6], [0.85, -0.9], [-0.85, -1.3], [0.85, -1.6], [-0.6, -1.95], [0.6, -0.3]]) {
  const b = new THREE.CatmullRomCurve3([new THREE.Vector3(x, y, 0.2), new THREE.Vector3(x * 0.5, y + 0.1, 0.1), portal.getPointAt(clamp(0.1 + (y + 2) / 3.4 * 0.5, 0, 0.6))]);
  branches.push(b);
  root.add(new THREE.Mesh(loftTube(b, (t) => lerp(0.03, 0.045, t), { segs: 20, radial: 8 }), vesselMat));
}
// Tüp üzerine tıklama bilgisi
tube.userData.info = null;

// --- Lokma --- (ıslak, topaklı besin lokması; tüp duvarını içeriden aydınlatır)
const bolusMat = wet(tissue({ color: 0xe23b3b, veins: 0, scale: 9 }), 0.6);
const bolus = new THREE.Mesh(blobGeometry(1, { detail: 14, amp: 0.09, freq: 1.6, oct: 2 }), bolusMat);
root.add(bolus);

// --- Tanecikler (besin → kan, su, safra/pankreas suyu) ---
const NP = 260;
const pMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) }), NP);
pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pMesh.frustumCulled = false; pMesh.userData.noCast = true;
for (let i = 0; i < NP; i++) pMesh.setColorAt(i, new THREE.Color(0xffffff));
root.add(pMesh);
const parts = Array.from({ length: NP }, () => ({ alive: false }));
const tmpC = new THREE.Color();
function emit(kind, from) {
  const p = parts.find((q) => !q.alive);
  if (!p) return;
  p.alive = true; p.kind = kind; p.t = 0; p.from = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, 0.1));
  if (kind === 'su' && stageIdx === 4) { p.mode = 'fade'; p.dir = new THREE.Vector3().randomDirection().multiplyScalar(0.8); }
  else if (kind === 'safra' || kind === 'pankreas') { p.mode = 'juice'; p.to = from.clone(); p.from = (kind === 'safra' ? gall.position : pancreas.userData.center).clone(); }
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
const bubble = sim.label('', { position: [0, 0, 0], parent: root });
Object.assign(bubble.el.style, { whiteSpace: 'normal', width: '230px', background: 'rgba(255,255,255,.95)', color: '#1f2937', textShadow: 'none',
  fontWeight: '500', fontSize: '12.5px', lineHeight: '1.35', padding: '8px 10px', borderRadius: '12px', border: '2px solid #fbbf24', marginLeft: '125px' });
const stageLabels = [];
ST.forEach((s) => {
  if (s.key === 'cikis') return;
  const l = sim.label(`${s.emoji} ${s.name}`, { position: s.key === 'agiz' ? [-1.5, 5.1, 0.6] : s.key === 'yemekborusu' ? [-0.95, 3.3, 0] : s.key === 'mide' ? [2.1, 1.3, 0.3] : s.key === 'incebagirsak' ? [0, -1.15, 0.9] : [-2.3, -1.0, 0.3], parent: root });
  stageLabels.push(l);
});
stageLabels.push(sim.label('Karaciğer', { position: [-1.4, 2.05, 0.3], className: 'plain', parent: root }), sim.label('Pankreas', { position: [1.5, 0.35, -0.2], className: 'plain', parent: root }),
  sim.label('Safra kesesi', { position: [-1.0, 0.75, 0.6], className: 'plain', parent: root }), sim.label('Kalp', { position: [1.0, 3.0, 0.2], className: 'plain', parent: root }));

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
const follow = ui.toggle({ label: '🎥 Kamera lokmayı izlesin', value: false, onChange: (v) => { if (!v) sim.moveCamera(HOME[0], HOME[1]); } });
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
    const localHit = root.worldToLocal(hit.point.clone());
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 200; i++) { const d = curve.getPointAt(i / 200).distanceToSquared(localHit); if (d < bd) { bd = d; best = i / 200; } }
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
  uBolus.value.set(p.x, p.y, p.z, done ? 0 : r * 2.4);
  // Renk: midede lapaya, kalın bağırsakta kahverengiye döner
  const target = stageIdx >= 4 ? 0x6d4c2f : stageIdx >= 2 ? 0xd9b98a : food.color;
  bolusMat.color.lerp(tmpC.setHex(target), 1 - Math.exp(-dt * 0.8));
  // Çene çiğneme
  jaw.rotation.x = stageIdx === 0 && !done ? 0.25 * Math.max(0, Math.sin(t * 9)) : jaw.rotation.x * 0.9;
  deformTube(done ? -1 : u, done ? 0 : r, stageIdx === 2 ? 1 : 0, t);
  updateParticles(dt);
  heartPulse = Math.max(0, heartPulse - dt * 3);
  const hb = 1 + 0.08 * Math.max(0, Math.sin(t * 7.5)) + heartPulse * 0.15;
  heart.scale.setScalar(hb);
  // Göstergeler
  mProg.set(done ? 1 : u, done ? 'tamamlandı' : `%${Math.round(u * 100)}`);
  stClock.set(hours(bodyMin));
  stStage.set(`${ST[stageIdx].emoji} ${ST[stageIdx].name}`);
  for (const k of Object.keys(NUTS)) meters[k].set(food.n[k] ? absorbed[k] / food.n[k] : 0, food.n[k] > 0.04 ? `%${Math.round((absorbed[k] / food.n[k]) * 100)}` : 'yok denecek kadar az');
});
const wv = new THREE.Vector3();
sim.onRender((dt) => {
  if (follow.value) {
    const c = sim.controls;
    bolus.getWorldPosition(wv);
    c.target.lerp(wv, 1 - Math.exp(-dt * 3));
    tv.copy(wv).add(new THREE.Vector3(1.4, 0.6, 5.5).multiplyScalar(K));
    sim.camera.position.lerp(tv, 1 - Math.exp(-dt * 2));
  }
});

sim.onReset(() => { restart(); newFact(); if (!follow.value) sim.moveCamera(HOME[0], HOME[1]); });
showFood();
newFact();
restart();
// yiyecek kartını seçimle güncelle
const _setFood = setFood;
foodSeg.el.addEventListener('click', () => showFood());
void _setFood; void stopT;

// Ölçekli gruplar: prosedürel kabartma gücü görünüm (dünya) birimindedir → nesnenin dünya ölçeğine uyarlanır (benekli görünüm olmasın)
{
  const done = new WeakSet(), ws = new THREE.Vector3();
  const fixBump = () => sim.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      const u = m.userData?.uniforms?.pBump;
      if (!u || done.has(m)) continue;
      done.add(m);
      o.getWorldScale(ws);
      u.value *= Math.max(ws.x, 1e-4) < 0.999 ? ws.x : 1;
    }
  });
  let nb = 0;
  sim.onRender(() => { if (nb++ % 30 === 0) fixBump(); });
}
