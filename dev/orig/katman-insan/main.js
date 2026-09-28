// Katman Katman İnsan — deri, kas, iskelet ve organ katmanları; tıkla-öğren ve "Organı bul" oyunu.
import { createSim, THREE, BufferGeometryUtils, ImprovedNoise, lerp, smoothstep } from '@core';

const sim = createSim({
  background: 0x0c1322,
  camera: { position: [0, 4.3, 10.5], target: [0, 3.7, 0], fov: 42 },
  controls: { minDistance: 2.2, maxDistance: 22, maxPolarAngle: Math.PI * 0.95 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Stilize bir insan modeli dört katmandan oluşur: <b>deri</b>, <b>kaslar</b>, <b>iskelet</b> ve <b>iç organlar</b>.
    Her katmanı açıp kapatabilir, saydamlığını değiştirebilirsin. Bir parçaya tıkladığında adı, katmanı ve görevi
    bilgi kartında görünür, parça parlayarak vurgulanır.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>🧅 Katmanları soy</b> düğmesiyle deriden organlara doğru içeri gir.</li>
      <li>Modeli arkadan çevir: sırt kasları, kürek kemikleri ve böbrekler arkada saklanıyor.</li>
      <li>Kalbin attığını ve akciğerlerin nefes alıp verdiğini izle.</li>
      <li><b>Çocuk modu</b>: "Organı bul" oyununda verilen organı tıklayarak bul, puan topla.</li>
    </ul>
    <p><small>Model primitif şekillerden kurulmuş, basitleştirilmiş bir eğitim modelidir; organ boyut ve konumları yaklaşıktır.
    Eğitim amaçlıdır, tıbbi tavsiye değildir.</small></p>`,
});

const scene = sim.scene;
const rim = new THREE.DirectionalLight(0x7aa7ff, 1.2);
rim.position.set(-6, 8, -8);
scene.add(rim);

// --- Zemin: parlayan platform ---
{
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x16223a, roughness: 0.6, metalness: 0.3 }));
  disc.position.y = -0.06;
  scene.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.01;
  scene.add(ring);
}

// --- Yardımcılar ---
const UP = new THREE.Vector3(0, 1, 0);
const V = (a) => new THREE.Vector3(...a);
const mirror = (p) => [-p[0], p[1], p[2]];

/** a→b arasına yönlendirilmiş geometri (kapsül, silindir…) yerleştirir. */
function orient(geo, a, b) {
  const A = V(a), B = V(b);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize());
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(m);
}
const capsule = (a, b, r, seg = 14) => orient(new THREE.CapsuleGeometry(r, Math.max(0.01, V(a).distanceTo(V(b))), 6, seg), a, b);
const ellipsoid = (pos, s, rot = [0, 0, 0], seg = 28) => {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  const m = new THREE.Matrix4().compose(V(pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(s));
  return g.applyMatrix4(m);
};
/** Uzun kemik: gövde + iki uçta eklem başları. */
function longBone(a, b, r) {
  const shaft = orient(new THREE.CylinderGeometry(r, r, V(a).distanceTo(V(b)), 10), a, b);
  const e1 = new THREE.SphereGeometry(r * 1.7, 12, 8).translate(...a);
  const e2 = new THREE.SphereGeometry(r * 1.6, 12, 8).translate(...b);
  return BufferGeometryUtils.mergeGeometries([shaft, e1, e2]);
}
const tube = (pts, r, seg = 64, rad = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V)), seg, r, rad, false);
const merge = (list) => BufferGeometryUtils.mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));

// Kas lifi dokusu (tuvalde üretilir)
const fiberTex = (() => {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  for (let x = 0; x < 128; x++) {
    const v = 150 + Math.round(Math.sin(x * 1.7) * 30 + Math.random() * 40);
    g.fillStyle = `rgb(${v + 60},${Math.round(v * 0.35)},${Math.round(v * 0.3)})`;
    g.fillRect(x, 0, 1, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
})();

// --- Katmanlar ve parçalar ---
const LAYERS = {
  skin: { name: 'Deri', group: new THREE.Group(), on: true, opacity: 0.22 },
  muscle: { name: 'Kaslar', group: new THREE.Group(), on: true, opacity: 0.35 },
  skeleton: { name: 'İskelet', group: new THREE.Group(), on: true, opacity: 1 },
  organs: { name: 'Organlar', group: new THREE.Group(), on: true, opacity: 1 },
};
Object.values(LAYERS).forEach((l) => scene.add(l.group));
const LAYER_EMOJI = { skin: '🟫', muscle: '💪', skeleton: '🦴', organs: '🫀' };

const parts = [];
const partByName = {};
/** Bir mesh'i adlandırılmış parçaya bağlar (aynı ada sahip mesh'ler birlikte vurgulanır). */
function part(layer, name, info, geo, matOpts, mesh) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02, transparent: true, ...matOpts });
  const m = mesh || new THREE.Mesh(geo, mat);
  if (mesh) m.material = mat;
  let p = partByName[name];
  if (!p) { p = partByName[name] = { name, info, layer, meshes: [] }; parts.push(p); }
  p.meshes.push(m);
  m.userData.part = p;
  m.userData.baseEmissive = new THREE.Color(matOpts.emissive ?? 0x000000);
  LAYERS[layer].group.add(m);
  return m;
}

// Gövde profili (LatheGeometry, derinlikte basık)
const TORSO = [[0.001, 3.32], [0.46, 3.38], [0.61, 3.58], [0.63, 3.85], [0.55, 4.25], [0.53, 4.5], [0.59, 4.9], [0.66, 5.25], [0.72, 5.52], [0.63, 5.76], [0.36, 5.9], [0.17, 5.98], [0.001, 6.0]];
const torsoGeo = (k, zs) => new THREE.LatheGeometry(TORSO.map(([r, y]) => new THREE.Vector2(r * k, y)), 48).scale(1, 1, zs);

const J = { // eklem noktaları (sağ taraf: -x; model +z yönüne bakar)
  shoulder: [-0.8, 5.55, 0], elbow: [-1.05, 4.45, -0.05], wrist: [-1.24, 3.45, 0.05], hand: [-1.31, 3.0, 0.08],
  hip: [-0.3, 3.5, 0], knee: [-0.33, 1.95, 0.03], ankle: [-0.34, 0.3, -0.02], toe: [-0.36, 0.1, 0.38],
};
const sides = (fn) => [fn((p) => p), fn(mirror)];

// ---------- DERİ ----------
{
  const skin = { color: 0xe8b894, roughness: 0.7, depthWrite: false };
  const info = 'En büyük organımız! Vücudu mikroplara, suya ve güneşe karşı korur, ter ile ısıyı düzenler, dokunma, sıcak ve acıyı hisseder.';
  const geos = [
    ellipsoid([0, 6.45, 0.02], [0.37, 0.45, 0.41], [0, 0, 0], 32), torsoGeo(1, 0.6),
    new THREE.CylinderGeometry(0.16, 0.18, 0.35, 16).translate(0, 5.98, 0),
    new THREE.ConeGeometry(0.06, 0.16, 10).rotateX(Math.PI / 2).translate(0, 6.4, 0.44),
  ];
  sides((f) => {
    geos.push(capsule(f(J.shoulder), f(J.elbow), 0.14), capsule(f(J.elbow), f(J.wrist), 0.11),
      ellipsoid(f(J.hand), [0.08, 0.2, 0.05]), capsule(f(J.hip), f(J.knee), 0.22), capsule(f(J.knee), f(J.ankle), 0.15),
      capsule(f(J.ankle), f(J.toe), 0.09), ellipsoid(f([-0.37, 6.44, -0.02]), [0.05, 0.1, 0.07]));
  });
  part('skin', 'Deri', info, merge(geos), skin);
}

// ---------- KASLAR ----------
{
  const base = { color: 0x7a2620, roughness: 0.8, depthWrite: false };
  const mus = { color: 0xffffff, map: fiberTex, roughness: 0.55, depthWrite: false };
  part('muscle', 'Derin gövde kasları', 'Omurgayı dik tutan ve solunuma yardım eden derin kaslar (ör. diyafram, sırt kasları, kaburgalar arası kaslar).', torsoGeo(0.95, 0.58), base);
  const M = (name, info, geos) => part('muscle', name, info, merge(geos), mus);
  M('Göğüs kası (pektoralis)', 'Kolu öne ve içe çeker; şınav gibi itme hareketlerinde çalışır.',
    sides((f) => ellipsoid(f([-0.3, 5.3, 0.35]), [0.28, 0.2, 0.08], [0, 0, f === mirror ? 0.3 : -0.3])));
  M('Omuz kası (deltoid)', 'Kolu yana, öne ve yukarı kaldırır.', sides((f) => ellipsoid(f([-0.8, 5.5, 0]), [0.19, 0.25, 0.19])));
  M('Karın kası (rektus abdominis)', 'Gövdeyi öne büker ve karın içindeki organları destekler ("altı kas" görünümü).',
    [4.98, 4.74, 4.5, 4.22].flatMap((y, i) => [-1, 1].map((s) => new THREE.BoxGeometry(0.15, i === 3 ? 0.3 : 0.21, 0.06).translate(s * 0.085, y, 0.32 - i * 0.005))));
  M('Dış eğik karın kasları', 'Gövdeyi yana büker ve döndürür.', sides((f) => ellipsoid(f([-0.42, 4.55, 0.18]), [0.13, 0.36, 0.13])));
  M('Boyun kası (sternokleidomastoid)', 'Başı yana döndürür ve öne eğer.', sides((f) => capsule(f([-0.13, 6.2, -0.02]), f([-0.04, 5.86, 0.13]), 0.04)));
  M('Trapez kası', 'Omuzları kaldırır; kürek kemiklerini ve başı hareket ettirir.', [ellipsoid([0, 5.55, -0.3], [0.52, 0.36, 0.08])]);
  M('Sırt kası (latissimus dorsi)', 'Kolu aşağı ve geriye çeker (tırmanma, yüzme, kürek çekme).', sides((f) => ellipsoid(f([-0.35, 4.85, -0.3]), [0.24, 0.46, 0.08], [0, 0, f === mirror ? -0.25 : 0.25])));
  M('Kalça kası (gluteus maximus)', 'Vücudun en büyük kası; kalçayı açar, ayağa kalkmayı, merdiven çıkmayı sağlar.', sides((f) => ellipsoid(f([-0.26, 3.55, -0.26]), [0.26, 0.27, 0.19])));
  const off = (p, dz, dx = 0) => [p[0] + dx, p[1], p[2] + dz];
  M('Pazı kası (biseps)', 'Dirseği büker ve önkolu avuç yukarı çevirir.', sides((f) => capsule(off(f(J.shoulder), 0.07), off(f(J.elbow), 0.07), 0.085)));
  M('Arka kol kası (triseps)', 'Dirseği açar (kolu düzleştirir).', sides((f) => capsule(off(f(J.shoulder), -0.07), off(f(J.elbow), -0.06), 0.095)));
  M('Önkol kasları', 'El bileğini ve parmakları büker, açar; kavramayı sağlar.', sides((f) => capsule(f(J.elbow), f(J.wrist), 0.095)));
  M('Ön uyluk kası (kuadriseps)', 'Dizi açar; yürürken, zıplarken ve çömelip kalkarken çalışır.', sides((f) => capsule(off(f(J.hip), 0.08), off(f(J.knee), 0.06), 0.17)));
  M('Arka uyluk kasları (hamstring)', 'Dizi büker ve kalçayı geriye doğru açar.', sides((f) => capsule(off(f(J.hip), -0.08), off(f(J.knee), -0.07), 0.15)));
  M('Baldır kası (gastroknemius)', 'Topuğu kaldırır; parmak ucunda durmayı, koşmayı ve zıplamayı sağlar.', sides((f) => capsule(off(f([-0.33, 1.8, 0.03]), -0.08), off(f([-0.34, 0.95, 0]), -0.06), 0.12)));
  M('Ön bacak kası (tibialis anterior)', 'Ayak ucunu yukarı kaldırır; yürürken ayağın takılmasını önler.', sides((f) => capsule(off(f([-0.33, 1.75, 0.03]), 0.08, -0.03), off(f([-0.34, 0.5, 0]), 0.07, -0.02), 0.055)));
}

// ---------- İSKELET ----------
const vertebrae = [];
{
  const bone = { color: 0xeee5cc, roughness: 0.5 };
  const B = (name, info, geo) => part('skeleton', name, info, geo, bone);
  const skull = merge([ellipsoid([0, 6.53, -0.03], [0.31, 0.34, 0.37], [0, 0, 0], 32), ellipsoid([0, 6.3, 0.1], [0.23, 0.24, 0.24])]);
  B('Kafatası', 'Beyni korur; 22 kemiğin (8 kafa + 14 yüz kemiği) birleşmesinden oluşur.', skull);
  part('skeleton', 'Kafatası', null, merge([ellipsoid([-0.1, 6.36, 0.28], [0.07, 0.06, 0.05]), ellipsoid([0.1, 6.36, 0.28], [0.07, 0.06, 0.05])]), { color: 0x1a1210, roughness: 0.9 });
  B('Alt çene (mandibula)', 'Kafatasının hareket edebilen tek kemiği; konuşmayı ve çiğnemeyi sağlar.',
    new THREE.TorusGeometry(0.17, 0.035, 8, 20, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI).scale(1, 1, 1.2).translate(0, 6.12, 0.1));

  // Omurga: S eğrili omurlar (InstancedMesh)
  const N = 26;
  const vGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.075, 10);
  const vm = new THREE.InstancedMesh(vGeo, new THREE.MeshStandardMaterial(), N);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), y = lerp(3.72, 6.15, t);
    const z = -0.2 - 0.045 * Math.sin(t * Math.PI * 2.1 + 0.4);
    const s = lerp(1.35, 0.8, t);
    mm.compose(new THREE.Vector3(0, y, z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s));
    vm.setMatrixAt(i, mm);
    vertebrae.push(new THREE.Vector3(0, y, z));
  }
  part('skeleton', 'Omurga', '33 omurdan oluşur (7 boyun, 12 sırt, 5 bel omuru, sağrı ve kuyruk sokumu). Omuriliği korur ve vücudu dik tutar.', null, bone, vm);
  B('Omurga', null, new THREE.ConeGeometry(0.12, 0.3, 10).rotateX(Math.PI).translate(0, 3.55, -0.17));

  // Kaburgalar: 12 çift, tüpler tek geometride
  const ribs = [];
  for (let i = 0; i < 12; i++) {
    const y = 5.62 - i * 0.1;
    const r = lerp(0.46, 0.6, Math.sin(Math.min(1, i / 7) * Math.PI / 2)) - (i > 9 ? 0.05 : 0);
    const frontX = i < 7 ? 0.06 : i < 10 ? 0.14 + (i - 7) * 0.08 : r * 0.9;
    const frontZ = i < 10 ? 0.34 : 0.05;
    for (const s of [-1, 1]) {
      const pts = [[s * 0.05, y, -0.21], [s * r * 0.8, y - 0.03, -0.2], [s * r, y - 0.09, 0], [s * r * 0.8, y - 0.17, frontZ * 0.8], [s * frontX, y - 0.22 - (i > 6 ? 0.08 : 0), frontZ]];
      ribs.push(tube(i < 10 ? pts : pts.slice(0, 4), 0.02, 24, 5));
    }
  }
  B('Kaburgalar', '12 çift kaburga kalbi ve akciğerleri bir kafes gibi korur; soluk alırken göğüs kafesi genişler.', merge(ribs));
  B('Göğüs kemiği (sternum)', 'Kaburgaların önde bağlandığı yassı kemik; CPR\'da bası bu kemiğin alt yarısına yapılır.',
    new THREE.BoxGeometry(0.11, 0.62, 0.035).rotateX(-0.12).translate(0, 5.3, 0.35));
  B('Köprücük kemiği (klavikula)', 'Kolu gövdeye bağlayan çubuk biçimli kemik; en sık kırılan kemiklerdendir.',
    merge(sides((f) => tube([f([-0.05, 5.7, 0.25]), f([-0.35, 5.74, 0.2]), f([-0.72, 5.72, 0.02])], 0.028, 16, 6))));
  const scap = new THREE.Shape([new THREE.Vector2(0, 0.22), new THREE.Vector2(0.24, 0.18), new THREE.Vector2(0.05, -0.28)]);
  B('Kürek kemiği (skapula)', 'Sırttaki üçgen yassı kemik; omuz ekleminin hareketine yön verir.',
    merge(sides((f) => new THREE.ExtrudeGeometry(scap, { depth: 0.025, bevelEnabled: false }).scale(f === mirror ? 1 : -1, 1, 1).translate(f([-0.2, 5.3, -0.33])[0], 5.3, -0.36))));
  B('Leğen kemiği (pelvis)', 'Gövdenin ağırlığını bacaklara aktarır; mesane gibi iç organları taşır ve korur.', merge([
    new THREE.TorusGeometry(0.3, 0.06, 8, 28).scale(1.2, 1, 0.8).rotateX(Math.PI / 2 - 0.35).translate(0, 3.55, 0),
    ...sides((f) => ellipsoid(f([-0.33, 3.77, -0.04]), [0.2, 0.2, 0.05], [0, f === mirror ? -0.5 : 0.5, 0], 16)),
  ]));
  B('Üst kol kemiği (humerus)', 'Omuzdan dirseğe uzanan uzun kemik.', merge(sides((f) => longBone(f(J.shoulder), f(J.elbow), 0.04))));
  B('Önkol kemikleri (radius ve ulna)', 'Önkolu oluşturan iki kemik; birbirinin etrafında dönerek avucu çevirmeyi sağlar.',
    merge(sides((f) => [longBone(f([-1.03, 4.43, -0.02]), f([-1.21, 3.47, 0.08]), 0.025), longBone(f([-1.08, 4.43, -0.08]), f([-1.27, 3.47, 0.0]), 0.022)]).flat()));
  B('El kemikleri', 'Her elde 27 kemik vardır; bu sayede çok hassas hareketler yapabiliriz.',
    merge(sides((f) => [ellipsoid(f([-1.27, 3.3, 0.06]), [0.07, 0.1, 0.03], [0, 0, 0], 10), ...[0, 1, 2, 3].map((k) => capsule(f([-1.24 - k * 0.025, 3.2, 0.04 + k * 0.012]), f([-1.27 - k * 0.035, 2.95, 0.06 + k * 0.015]), 0.013, 6))]).flat()));
  B('Uyluk kemiği (femur)', 'Vücudun en uzun ve en güçlü kemiği.', merge(sides((f) => longBone(f([-0.34, 3.48, 0]), f(J.knee), 0.055))));
  B('Diz kapağı (patella)', 'Diz ekleminin önündeki küçük yuvarlak kemik; ön uyluk kasının kirişi içindedir.', merge(sides((f) => ellipsoid(f([-0.33, 1.97, 0.14]), [0.06, 0.07, 0.03], [0, 0, 0], 12))));
  B('Kaval ve baldır kemiği (tibia, fibula)', 'Diz ile ayak bileği arasındaki iki kemik; tibia vücut ağırlığını taşır.',
    merge(sides((f) => [longBone(f([-0.31, 1.9, 0.03]), f([-0.33, 0.32, 0]), 0.045), longBone(f([-0.42, 1.85, -0.02]), f([-0.41, 0.35, -0.03]), 0.022)]).flat()));
  B('Ayak kemikleri', 'Her ayakta 26 kemik bulunur; kemerli yapısı yürürken yükü dağıtır.', merge(sides((f) => capsule(f([-0.34, 0.2, -0.05]), f([-0.36, 0.08, 0.34]), 0.06, 8))));
}

// ---------- ORGANLAR ----------
let heart, lungs, brain;
{
  const O = (name, info, geo, color, extra = {}) => part('organs', name, info, geo, { color, roughness: 0.45, ...extra });
  // Beyin: kıvrımlar gürültüyle
  const bg = new THREE.SphereGeometry(0.29, 64, 40);
  const noise = new ImprovedNoise(), p = bg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 - Math.abs(noise.noise(v.x * 22, v.y * 22, v.z * 22));
    let k = 1 + 0.07 * (n - 0.6);
    if (Math.abs(v.x) < 0.025 && v.y > -0.05) k -= 0.08 * (1 - Math.abs(v.x) / 0.025);
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  bg.scale(0.88, 0.8, 1.08).translate(0, 6.58, -0.03);
  bg.computeVertexNormals();
  brain = O('Beyin', 'Vücudun komuta merkezi: düşünme, hafıza, duyular ve hareketleri yönetir. Yaklaşık 86 milyar nöron içerir.', merge([bg,
    ellipsoid([0, 6.37, -0.22], [0.16, 0.09, 0.1]), capsule([0, 6.35, -0.12], [0, 6.1, -0.14], 0.045)]), 0xf0a3b0);

  lungs = O('Akciğerler', 'Soluduğumuz havadaki oksijeni kana geçirir, karbondioksiti dışarı atar. Sağ akciğer 3, sol akciğer 2 lobludur.',
    merge([ellipsoid([-0.31, 5.12, -0.02], [0.24, 0.5, 0.26]), ellipsoid([0.31, 5.14, -0.03], [0.21, 0.48, 0.25])]), 0xe98b9c);
  O('Soluk borusu (trakea)', 'Havayı akciğerlere taşır; C biçimli kıkırdak halkalar onu hep açık tutar.',
    merge([tube([[0, 6.02, 0.08], [0, 5.7, 0.05], [0, 5.5, 0.02]], 0.04, 12, 8), tube([[0, 5.52, 0.02], [-0.12, 5.4, 0], [-0.22, 5.3, -0.02]], 0.028, 10, 6), tube([[0, 5.52, 0.02], [0.12, 5.4, 0], [0.22, 5.3, -0.02]], 0.028, 10, 6)]), 0xd9d4c4);
  heart = O('Kalp', 'Kaslı bir pompa: dakikada yaklaşık 60–100 kez atarak kanı akciğerlere ve tüm vücuda gönderir.',
    merge([ellipsoid([0, 0, 0], [0.16, 0.19, 0.14]), new THREE.ConeGeometry(0.12, 0.2, 16).rotateZ(Math.PI).translate(0, -0.17, 0)]).rotateZ(0.55), 0xc8263b);
  heart.geometry.translate(0.07, 5.0, 0.15);
  O('Aort ve ana damarlar', 'Aort kalpten çıkan en büyük atardamardır; kanı tüm vücuda dağıtır. Toplardamarlar kanı kalbe geri getirir.',
    merge([tube([[0.02, 5.12, 0.15], [0.02, 5.42, 0.08], [-0.03, 5.45, -0.08], [-0.03, 5.2, -0.15], [-0.02, 4.4, -0.13], [0, 3.8, -0.1]], 0.04, 48, 8)]), 0xb91c1c);
  O('Toplardamarlar (ana toplardamar)', 'Oksijeni azalmış kanı vücuttan kalbe geri taşır.', tube([[-0.1, 5.5, 0.08], [-0.1, 5.05, 0.12], [-0.08, 4.4, -0.05], [-0.06, 3.8, -0.06]], 0.035, 32, 8), 0x3056c8);
  O('Karaciğer', 'En büyük iç organ: safra üretir, besinleri işleyip depolar, zararlı maddeleri etkisiz hale getirir.',
    ellipsoid([-0.2, 4.64, 0.08], [0.42, 0.19, 0.27], [0, 0, -0.25]), 0x7b2d22);
  O('Mide', 'Besinleri mide asidi ve pepsin enzimiyle karıştırıp çorba kıvamına (kimus) getirir.', merge([
    tube([[0.12, 4.86, 0.08], [0.3, 4.8, 0.11], [0.38, 4.6, 0.13], [0.28, 4.44, 0.15], [0.08, 4.44, 0.15], [-0.04, 4.52, 0.13]], 0.09, 40, 12),
    ellipsoid([0.28, 4.74, 0.1], [0.13, 0.12, 0.12])]), 0xdc8f78);
  // İnce bağırsak: kıvrımlı tüp
  const si = [];
  for (let k = 0; k < 6; k++) for (let j = 0; j <= 8; j++) {
    const u = k % 2 ? 1 - j / 8 : j / 8;
    si.push([lerp(-0.28, 0.28, u), 4.14 - k * 0.075 + 0.02 * Math.sin(j * 2.1 + k), 0.15 + 0.05 * Math.cos(j * 1.7 + k * 0.9)]);
  }
  O('İnce bağırsak', 'Yaklaşık 6 m uzunluğunda kıvrımlı bir tüp; besinlerin çoğu burada sindirilir ve kana emilir.', tube(si, 0.038, 360, 8), 0xf2a6a0);
  O('Kalın bağırsak', 'Suyu ve tuzları geri emer, dışkıyı oluşturur; yararlı bakteriler burada yaşar.',
    tube([[-0.38, 3.72, 0.12], [-0.42, 4.0, 0.14], [-0.4, 4.28, 0.17], [-0.2, 4.33, 0.22], [0.2, 4.33, 0.22], [0.4, 4.28, 0.17], [0.43, 3.95, 0.14], [0.35, 3.66, 0.1], [0.12, 3.6, 0.02], [0, 3.52, -0.08]], 0.07, 120, 10), 0xc98b5e);
  O('Böbrekler', 'Kanı süzerek idrar üretir; vücudun su-tuz dengesini ve kan basıncını düzenler.',
    merge([ellipsoid([-0.24, 4.3, -0.2], [0.085, 0.15, 0.07]), ellipsoid([0.24, 4.36, -0.2], [0.085, 0.15, 0.07]),
      tube([[-0.2, 4.2, -0.16], [-0.14, 3.9, -0.05], [-0.05, 3.6, 0.08]], 0.012, 12, 5), tube([[0.2, 4.26, -0.16], [0.14, 3.9, -0.05], [0.05, 3.6, 0.08]], 0.012, 12, 5)]), 0x8e2430);
  O('Mesane', 'Böbreklerden gelen idrarı biriktirir; dolunca tuvalete gitme isteği duyarız.', ellipsoid([0, 3.55, 0.12], [0.1, 0.09, 0.09]), 0xe6c86e);
}

// --- Katman görünürlüğü ---
function applyLayer(key) {
  const L = LAYERS[key];
  L.group.visible = L.on && L.opacity > 0.01;
  for (const p of parts) if (p.layer === key) for (const m of p.meshes) {
    m.material.opacity = L.opacity;
    m.material.transparent = L.opacity < 0.99;
    m.material.depthWrite = key !== 'skin' && L.opacity > 0.6;
  }
}

// --- Seçim ve vurgulama ---
let selected = null;
const selLabel = sim.label('', { position: [0, 0, 0], className: 'big' });
selLabel.visible = false;
function select(p, point) {
  if (selected) selected.meshes.forEach((m) => m.material.emissive.copy(m.userData.baseEmissive));
  selected = p;
  if (!p) { selLabel.visible = false; infoCard.set('<b>Bir parçaya tıkla</b> — adı ve görevi burada görünecek.'); return; }
  const info = p.info || partByName[p.name].info;
  infoCard.set(`<div style="font-size:16px;font-weight:700;margin-bottom:4px">${p.name}</div>
    <div style="margin-bottom:6px;opacity:.8">${LAYER_EMOJI[p.layer]} Katman: <b>${LAYERS[p.layer].name}</b></div>${info}`);
  selLabel.setText(p.name);
  if (point) selLabel.position.copy(point);
  selLabel.visible = showLabel.value;
}

function visibleMeshes() {
  const out = [];
  for (const p of parts) {
    const L = LAYERS[p.layer];
    if (L.on && L.opacity > 0.03) out.push(...p.meshes);
  }
  return out;
}
/** İlk "katı" isabet: saydam katmanların (opaklık < %50) içinden görülür. */
function pickHit(hits) {
  for (const h of hits) if (LAYERS[h.object.userData.part.layer].opacity >= 0.5) return h;
  return hits[0];
}

sim.onClick(visibleMeshes, (_, ev) => {
  const hits = sim.raycast(ev, visibleMeshes());
  if (!hits.length) return;
  const h = pickHit(hits);
  if (game.active) return gameClick(hits, h);
  select(h.object.userData.part, h.point);
});

// --- Katmanları soy animasyonu ---
let peel = null; // { t, dir }
const PEEL = [['skin', 0.4, 2.6, 1, 0], ['muscle', 3.0, 5.4, 1, 0], ['skeleton', 5.8, 8.0, 1, 0.12]];
function startPeel(dir) {
  for (const k of Object.keys(LAYERS)) { LAYERS[k].on = true; ctl[k].toggle.set(true); }
  LAYERS.organs.opacity = 1;
  peel = { t: dir > 0 ? 0 : 8.4, dir };
  sim.toast(dir > 0 ? '🧅 Katmanlar soyuluyor: deri → kas → iskelet → organlar' : '🧍 Katmanlar geri giydiriliyor', '');
}
sim.onUpdate((dt) => {
  if (!peel) return;
  peel.t += dt * peel.dir;
  for (const [k, a, b, v0, v1] of PEEL) {
    LAYERS[k].opacity = lerp(v0, v1, smoothstep(a, b, peel.t));
    ctl[k].slider.set(Math.round(LAYERS[k].opacity * 100));
  }
  Object.keys(LAYERS).forEach(applyLayer);
  if (peel.t > 8.6 || peel.t < 0) peel = null;
});

// --- Nabız ve soluk ---
sim.onUpdate((dt, t) => {
  const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.2)), 6);
  heart.scale.setScalar(1 + beat * 0.07);
  heart.position.set(0.07, 5.0, 0.15).multiplyScalar(-(beat * 0.07));
  const br = Math.sin(t * Math.PI * 2 * 0.25);
  lungs.scale.set(1 + br * 0.035, 1 + br * 0.02, 1 + br * 0.04);
  lungs.position.set(0, 5.13 * -(br * 0.02), 0);
  if (selected) {
    const k = 0.35 + 0.25 * Math.sin(t * 6);
    selected.meshes.forEach((m) => m.material.emissive.setRGB(0.15 * k, 0.45 * k, 1.0 * k));
  }
});

// --- Organı bul oyunu ---
const TARGETS = [
  ['Kalp', 'Göğsün ortasında, biraz solda; iki akciğerin arasında.'], ['Beyin', 'Kafatasının içinde!'],
  ['Akciğerler', 'Göğüs kafesini dolduran iki pembe süngerimsi organ.'], ['Karaciğer', 'Karnın sağ üst tarafında, kaburgaların altında.'],
  ['Mide', 'Karnın sol üst tarafında, J harfine benzer.'], ['İnce bağırsak', 'Karnın ortasında kıvrım kıvrım.'],
  ['Kalın bağırsak', 'İnce bağırsağın etrafını çerçeve gibi sarar.'], ['Böbrekler', 'Arkada, bel hizasında iki fasulye. Modeli çevir!'],
  ['Mesane', 'En altta, leğen kemiğinin içinde.'], ['Kafatası', 'Beyni saran kemik kask.'], ['Kaburgalar', 'Göğüs kafesinin kemik çubukları.'],
  ['Uyluk kemiği (femur)', 'Vücudun en uzun kemiği; kalçadan dize.'], ['Omurga', 'Sırtın ortasında üst üste dizili omurlar.'],
  ['Leğen kemiği (pelvis)', 'Kalçadaki kemik halka.'],
];
const game = { active: false, list: [], i: 0, score: 0, tries: 0, correct: 0, clicks: 0 };
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startGame() {
  peel = null;
  const preset = { skin: [true, 0.12], muscle: [false, 0.35], skeleton: [true, 0.55], organs: [true, 1] };
  for (const [k, [on, op]] of Object.entries(preset)) { LAYERS[k].on = on; LAYERS[k].opacity = op; ctl[k].toggle.set(on); ctl[k].slider.set(op * 100); applyLayer(k); }
  Object.assign(game, { active: true, list: shuffle([...TARGETS]).slice(0, 10), i: 0, score: 0, tries: 0, correct: 0, clicks: 0 });
  select(null);
  sim.moveCamera([0, 4.3, 9], [0, 4.6, 0]);
  showQuestion();
}
function showQuestion(extra = '') {
  const [name] = game.list[game.i];
  sim.hud.show(`<h2>🔎 Organı bul! (${game.i + 1}/${game.list.length})</h2>
    <div style="font-size:22px;margin:4px 0">Bul: <b style="color:#38bdf8">${name}</b></div>
    <div>Puan: <b>${game.score}</b>${extra}</div>
    <button class="btn" data-a="hint">💡 İpucu</button><button class="btn" data-a="skip">⏭ Pas</button><button class="btn danger" data-a="stop">✖ Bitir</button>`);
  const b = (a) => sim.hud.el.querySelector(`[data-a=${a}]`);
  b('hint').onclick = () => showQuestion(`<div style="margin-top:6px;color:#fbbf24">💡 ${game.list[game.i][1]}</div>`);
  b('skip').onclick = () => nextQuestion();
  b('stop').onclick = () => endGame();
  gameStats();
}
function gameClick(hits, first) {
  if (!game.active || game.tries < 0) return;
  const [name] = game.list[game.i];
  game.clicks++;
  const hit = hits.slice(0, 6).find((h) => h.object.userData.part.name === name);
  if (hit) {
    const pts = game.tries === 0 ? 10 : game.tries === 1 ? 5 : 2;
    game.score += pts; game.correct++;
    select(hit.object.userData.part, hit.point);
    sim.toast(`✅ Harika! Bu <b>${name}</b> (+${pts})`, 'good');
    setTimeout(nextQuestion, 900);
    game.tries = -99;
  } else if (game.tries >= 0) {
    game.tries++;
    sim.toast(`❌ Bu <b>${first.object.userData.part.name}</b>. Tekrar dene!`, 'bad');
  }
  gameStats();
}
function nextQuestion() {
  if (!game.active) return;
  game.tries = 0;
  game.i++;
  if (game.i >= game.list.length) return endGame();
  showQuestion();
}
function endGame() {
  if (!game.active) return;
  game.active = false;
  const max = game.list.length * 10, pct = game.score / max;
  const medal = pct >= 0.85 ? '🏆 Anatomi ustası!' : pct >= 0.6 ? '🥈 Çok iyi!' : pct >= 0.3 ? '🥉 İyi başlangıç!' : '📚 Biraz daha keşfet!';
  sim.hud.show(`<h2>${medal}</h2><div>Puan: <b>${game.score}</b> / ${max} · Doğru: <b>${game.correct}</b> · Tıklama: ${game.clicks}</div>
    <button class="btn primary" data-a="again">🔁 Tekrar oyna</button><button class="btn" data-a="close">Kapat</button>`, { tone: pct >= 0.6 ? 'good' : 'warn' });
  sim.hud.el.querySelector('[data-a=again]').onclick = startGame;
  sim.hud.el.querySelector('[data-a=close]').onclick = () => sim.hud.hide();
  gameStats();
}
function gameStats() {
  stScore.set(game.score, game.active ? 'good' : '');
  stQ.set(game.active ? `${Math.min(game.i + 1, game.list.length)}/${game.list.length}` : '—');
  stCorrect.set(game.correct);
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Katmanlar');
const ctl = {};
for (const [k, L] of Object.entries(LAYERS)) {
  const toggle = ui.toggle({ label: `${LAYER_EMOJI[k]} ${L.name}`, value: L.on, onChange: (v) => { L.on = v; peel = null; applyLayer(k); } });
  const slider = ui.slider({ label: `${L.name} opaklığı`, min: 0, max: 100, step: 1, value: L.opacity * 100, unit: '%',
    onInput: (v) => { L.opacity = v / 100; peel = null; applyLayer(k); } });
  ctl[k] = { toggle, slider };
}
ui.buttons([
  { label: '🧅 Katmanları soy', variant: 'primary', onClick: () => startPeel(1) },
  { label: '🧍 Geri giydir', onClick: () => startPeel(-1) },
]);

ui.section('Bilgi kartı');
const infoCard = ui.text('', 'card');
const showLabel = ui.toggle({ label: 'Seçili parçanın etiketi', value: true, onChange: (v) => (selLabel.visible = v && !!selected) });

ui.section('Görünüm');
ui.buttons([
  { label: 'Ön', onClick: () => sim.moveCamera([0, 4.3, 10.5], [0, 3.7, 0]) },
  { label: 'Arka', onClick: () => sim.moveCamera([0, 4.3, -10.5], [0, 3.7, 0]) },
  { label: 'Yan', onClick: () => sim.moveCamera([10.5, 4.3, 0], [0, 3.7, 0]) },
  { label: 'Gövde', onClick: () => sim.moveCamera([1.2, 5.0, 4.4], [0, 4.7, 0]) },
  { label: 'Baş', onClick: () => sim.moveCamera([0.8, 6.6, 2.4], [0, 6.4, 0]) },
]);
ui.toggle({ label: 'Otomatik döndür', value: false, onChange: (v) => { sim.controls.autoRotate = v; sim.controls.autoRotateSpeed = 1.5; } });

ui.section('🧒 Çocuk modu: Organı bul');
ui.text('Sana bir organ ya da kemik adı verilecek; modelde bulup tıkla. İlk denemede 10, ikincide 5 puan!');
ui.buttons([{ label: '🎮 Oyunu başlat', variant: 'good', onClick: startGame }, { label: 'Bitir', onClick: endGame }]);
const stScore = ui.stat({ label: 'Puan' });
const stQ = ui.stat({ label: 'Soru' });
const stCorrect = ui.stat({ label: 'Doğru' });

ui.section('Model');
ui.stat({ label: 'Parça' }).set(parts.length);
ui.stat({ label: 'Organ' }).set(parts.filter((p) => p.layer === 'organs').length);
ui.stat({ label: 'Kemik grubu' }).set(parts.filter((p) => p.layer === 'skeleton').length);
ui.text('<small>Eğitim amaçlıdır, tıbbi tavsiye değildir. Organ boyut ve konumları yaklaşıktır.</small>');

function resetAll() {
  peel = null;
  game.active = false;
  sim.hud.hide();
  const def = { skin: [true, 0.22], muscle: [true, 0.35], skeleton: [true, 1], organs: [true, 1] };
  for (const [k, [on, op]] of Object.entries(def)) {
    LAYERS[k].on = on; LAYERS[k].opacity = op; ctl[k].toggle.set(on); ctl[k].slider.set(op * 100); applyLayer(k);
  }
  select(null);
  gameStats();
  sim.moveCamera([0, 4.3, 10.5], [0, 3.7, 0]);
}
sim.onReset(resetAll);
resetAll();
