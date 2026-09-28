// Sinir Ağı Nasıl Öğrenir? — tarayıcıda geri yayılımla eğitilen küçük MLP: 3B karar yüzeyi, canlı ağ şeması, eğitim/test kaybı.
import { createSim, THREE, fmt, clamp, instanced, mat, RoundedBoxGeometry, BufferGeometryUtils } from '@core';
import { rackMaterial, rackGeometry, raisedFloor, cableTray, ledStrip, haze } from './serverhall.js';
import { createNet, forward, trainBatch, evaluate, makeData, ACT } from './nn.js';

const SURF = 9;            // yüzeyin kenar uzunluğu (dünya birimi)
const DOM = 1.2;           // veri alanı [-DOM, DOM]
const S = SURF / (2 * DOM);
const SEG = 44;
const HAMP = 1.5;          // yüzey yükseklik genliği
const MAX_PTS = 400;
const NET_Z = -5.2, NET_Y = 4.6, NET_W = 9;

const sim = createSim({
  studio: { color: 0x9aa0a6, mood: 'lab', warmth: -0.35, key: { el: 72, az: 20, power: 0.8 }, radius: 30, height: 18 },
  camera: { position: [0.35, 3.05, 4.3], target: [0, 1.15, -0.45], fov: 50, near: 0.02, far: 200 },
  controls: { maxDistance: 7.5, minDistance: 1.2 },
  look: { aoRadius: 0.25 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Sahne bir sunucu salonunun soğuk koridoru: ağ, iki sıra rafın arasındaki masada eğitiliyor. Önde, iki sınıflı bir veri kümesi (<b style="color:#60a5fa">mavi</b> ve <b style="color:#fb923c">turuncu</b> noktalar) ve ağın
    <b>karar yüzeyi</b>. Yüzeyin yüksekliği ve rengi, ağın o noktada "mavi" dediği olasılıktır; saydam düz levha %50 düzeyidir,
    yüzeyin levhayı kestiği yer <b>karar sınırı</b>dır. Küreler eğitim, sekizyüzlüler test noktalarıdır (ağ testleri hiç görmez).</p>
    <p>Arkada ağın kendisi: soldan sağa girdi (x₁, x₂), gizli katmanlar ve çıktı nöronu. Çizgiler ağırlıklardır:
    <b style="color:#60a5fa">mavi</b> pozitif, <b style="color:#fb923c">turuncu</b> negatif; kalınlık büyüklüğü gösterir.
    Bir nörona tıkla: yüzey o nöronun çıktısını gösterir; ağın her katmanda daha karmaşık şekilleri nasıl birleştirdiğini gör.</p>
    <h3>Nasıl öğreniyor?</h3>
    <p>Her nöron girdilerinin ağırlıklı toplamını bir <b>aktivasyon fonksiyonundan</b> (tanh, ReLU, sigmoid) geçirir; çıktı nöronu sigmoid ile
    0–1 arası olasılık üretir. Hata, <b>ikili çapraz entropi</b> kaybıyla ölçülür. <b>Geri yayılım</b> (zincir kuralı) her ağırlığın kayba
    etkisini (gradyan) hesaplar; <b>SGD</b> ağırlıkları gradyanın tersine "öğrenme hızı" kadar kaydırır, <b>Adam</b> bunu her
    parametre için uyarlar. <b>L2 düzenlileştirme</b> büyük ağırlıkları cezalandırarak daha yumuşak sınırlar çizdirir.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Doğrusal model + XOR</b>: gizli katman yokken ağ yalnızca düz bir çizgi çizebilir; XOR'u çözemez. Bir gizli katman ekle.</li>
      <li><b>Aşırı öğrenme</b>: az ve gürültülü veriyle büyük ağ eğitim kaybını sıfıra indirir ama test kaybı yükselir; yüzey noktaların etrafında kıvrılır.
      Sonra <b>L2</b> ekle ve farkı gör.</li>
      <li><b>Spiral</b>: sığ ağlar zorlanır; 3 katman × 8 nöron ile dene. ReLU ile tanh'ı karşılaştır.</li>
      <li>Öğrenme hızını 3'e çıkar: kayıp zıplar ya da takılır. Çok küçük hız ise öğrenmeyi yavaşlatır.</li>
      <li>Toplu boyutu (batch) 1 ile "tümü" arasında değiştir: kayıp eğrisinin gürültüsü nasıl değişiyor?</li>
    </ul>
    <h3>Sınırlar</h3>
    <p><small>Ağ gerçekten tarayıcında, düz JavaScript ile eğitilir (kütüphane yok). Veri kümeleri oyuncak örneklerdir; gerçek yapay zekâ
    modelleri milyonlarca–milyarlarca parametre ve çok daha fazla veriyle, benzer ilkelerle (gradyan inişi, geri yayılım) eğitilir.
    Rastgele başlangıç nedeniyle her eğitim biraz farklı sonuçlanır.</small></p>`,
});

// --- Durum ---
const cfg = {
  data: 'daire', n: 240, noise: 0.15, testFrac: 0.3,
  layers: 2, neurons: 4, act: 'tanh',
  opt: 'adam', lr: 0.03, l2: 0, batch: 10, eps: 12,
};
let data, trainIdx = [], testIdx = [], net, epoch = 0, dataSeed = 7, wSeed = 1;
let selected = null; // null = çıktı; {l, j}
let dirty = true, epochAcc = 0;
let lastTrain = { loss: NaN, acc: NaN }, lastTest = { loss: NaN, acc: NaN };
sim.formatTime = () => `${fmt(epoch)}. dönem`;

// --- Sunucu salonu (metre): soğuk koridor, iki sıra raf, kablo tavaları, tavan armatürleri, pus ---
const HALL_Z0 = -7.2, HALL_Z1 = 4.8, AX = 1.5, RD = 1.2, CEIL = 3.6;
const rackMat = rackMaterial({ w: 0.6, h: 2.1 });
if (sim.stage?.mesh) sim.stage.mesh.visible = false; // salon kapalı: stüdyo fonu görünmez
{
  const scene = sim.scene;
  scene.add(raisedFloor(-4.8, HALL_Z0, 4.8, HALL_Z1, (x) => Math.abs(x) < AX));
  const RN = 16, racks = instanced(rackGeometry(0.6, 2.1, RD), rackMat, RN * 2);
  const d = new THREE.Object3D();
  let k = 0;
  for (const side of [-1, 1]) for (let i = 0; i < RN; i++) {
    d.position.set(side * (AX + RD / 2), 0, HALL_Z0 + 1.2 + 0.3 + i * 0.6);
    d.rotation.set(0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0); d.updateMatrix();
    racks.setMatrixAt(k++, d.matrix);
  }
  racks.castShadow = racks.receiveShadow = true; racks.userData.noFit = true;
  scene.add(racks);
  // duvarlar, tavan, kapı
  const wall = mat.concrete({ color: 0xc9ccce, stains: 0.15 });
  const add = (g, m, cast = false) => { const o = new THREE.Mesh(g, m); o.receiveShadow = true; o.castShadow = cast; o.userData.noFit = true; if (!cast) o.userData.noCast = true; scene.add(o); return o; };
  add(new THREE.BoxGeometry(0.2, CEIL, HALL_Z1 - HALL_Z0).translate(-4.9, CEIL / 2, (HALL_Z0 + HALL_Z1) / 2), wall);
  add(new THREE.BoxGeometry(0.2, CEIL, HALL_Z1 - HALL_Z0).translate(4.9, CEIL / 2, (HALL_Z0 + HALL_Z1) / 2), wall);
  add(new THREE.BoxGeometry(9.8, CEIL, 0.2).translate(0, CEIL / 2, HALL_Z0 - 0.1), wall);
  add(new THREE.BoxGeometry(9.8, CEIL, 0.2).translate(0, CEIL / 2, HALL_Z1 + 0.1), wall);
  add(new THREE.BoxGeometry(9.8, 0.1, HALL_Z1 - HALL_Z0).translate(0, CEIL + 0.05, (HALL_Z0 + HALL_Z1) / 2), mat.concrete({ color: 0xdadcdc, stains: 0.05 }));
  const door = add(new RoundedBoxGeometry(1.2, 2.2, 0.08, 2, 0.02).translate(0, 1.1, HALL_Z0 + 0.01), mat.paintedMetal({ color: 0x8c949b, wear: 0.1 }));
  door.castShadow = false;
  const win = add(new THREE.BoxGeometry(0.3, 0.8, 0.02).translate(0, 1.5, HALL_Z0 + 0.06), new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.05, metalness: 0.3 }));
  win.castShadow = false;
  // soğuk koridor kapatması: raf üstlerinde cam panel çerçevesi
  const alu = mat.brushedMetal({ color: 0xc4c8cc, rough: 0.3 });
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.05, HALL_Z1 - HALL_Z0 - 2.4).translate(side * AX, 2.13, (HALL_Z0 + 1.2 + HALL_Z0 + 1.2 + 16 * 0.6) / 2), alu);
  // kablo tavaları (raf sıralarının üstünde) ve tavan armatürleri
  for (const side of [-1, 1]) {
    scene.add(cableTray([side * (AX + 0.45), HALL_Z0 + 0.4], [side * (AX + 0.45), HALL_Z1 - 0.4], 2.55, 0.45, side < 0 ? 0xd7b21f : 0x9aa3ab));
    scene.add(cableTray([side * (AX + 0.95), HALL_Z0 + 0.4], [side * (AX + 0.95), HALL_Z1 - 0.4], 2.85, 0.3, 0x9aa3ab));
  }
  for (const x of [-0.8, 0.8]) for (const z of [-5.2, -1.8, 1.6]) scene.add(ledStrip(2.4, x, CEIL - 0.04, z));
  for (const x of [-3.9, 3.9]) for (const z of [-4.5, 0, 3.6]) scene.add(ledStrip(2.4, x, CEIL - 0.04, z));
  const hz = haze(46, [-1.4, 0.05, HALL_Z0 + 0.8, 1.4, 1.1, 3.4]);
  scene.add(hz);
  sim.onRender(() => { const t = performance.now() / 1000; rackMat.userData.uniforms.uTime.value = t; hz.userData.update(t); });
}

// İçerik grubu: model birimleri korunur, 1 birim = 0,2 m; masanın üstünde karar yüzeyi, arkasında cam ekranda ağ
const G = new THREE.Group();
G.scale.setScalar(0.2); G.position.set(0, 1.0, 0);
sim.scene.add(G);
{
  // masa: koyu kompozit tabla, fırçalanmış çelik kenar, ayaklar
  const top = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.05, 2.05, 2, 0.015), mat.plastic({ color: 0x1d2024, gloss: 0.3 }));
  top.position.set(0, 0.64, 0);
  const rim = new THREE.Mesh(new RoundedBoxGeometry(2.09, 0.03, 2.09, 2, 0.012), mat.brushedMetal({ color: 0xaab0b6, rough: 0.3 }));
  rim.position.set(0, 0.6, 0);
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.56, 1.7, 2, 0.02), mat.paintedMetal({ color: 0x2a2e33, wear: 0.1 }));
  body.position.set(0, 0.3, 0);
  // ekran: alüminyum çerçeveli koyu cam, iki ayak
  const scr = new THREE.Mesh(new RoundedBoxGeometry(2.34, 1.74, 0.04, 2, 0.012), new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.08, metalness: 0.4 }));
  scr.position.set(0, 1.0 + 4.6 * 0.2, -1.2);
  const frm = new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.8, 0.03, 2, 0.012), mat.brushedMetal({ color: 0xb8bdc2, rough: 0.28 }));
  frm.position.set(0, 1.0 + 4.6 * 0.2, -1.225);
  const legs = [-1, 1].map((sx) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.06, 10), frm.material); l.position.set(sx * 1.05, 0.53, -1.23); return l; });
  const feet = [-1, 1].map((sx) => { const f = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.03, 0.5, 1, 0.01), frm.material); f.position.set(sx * 1.05, 0.015, -1.23); return f; });
  [top, rim, body, scr, frm, ...legs, ...feet].forEach((o) => { o.castShadow = o.receiveShadow = true; sim.scene.add(o); });
}

// --- Karar yüzeyi ---
const surfGeo = new THREE.PlaneGeometry(SURF, SURF, SEG, SEG).rotateX(-Math.PI / 2);
surfGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(surfGeo.attributes.position.count * 3), 3));
const surf = new THREE.Mesh(surfGeo, new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.15 }));
surf.castShadow = surf.receiveShadow = true;
G.add(surf);
{
  const half = new THREE.Mesh(new THREE.PlaneGeometry(SURF + 0.6, SURF + 0.6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  half.position.y = 0.001;
  G.add(half);
  // çerçeve: 12 ince alüminyum çubuk
  const bars = [], hx = SURF / 2, hy = HAMP;
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    bars.push(new THREE.BoxGeometry(SURF, 0.05, 0.05).translate(0, a * hy, b * hx));
    bars.push(new THREE.BoxGeometry(0.05, 0.05, SURF).translate(a * hx, b * hy, 0));
    bars.push(new THREE.BoxGeometry(0.05, HAMP * 2, 0.05).translate(a * hx, 0, b * hx));
  }
  const frame = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(bars.map((g) => g.toNonIndexed())), mat.brushedMetal({ color: 0xc0c5ca, rough: 0.3 }));
  frame.castShadow = true;
  G.add(frame);
  sim.label('x₁ →', { parent: G, position: [SURF / 2 - 0.6, -HAMP, SURF / 2 + 0.8], className: 'plain' });
  sim.label('x₂ →', { parent: G, position: [-SURF / 2 - 0.9, -HAMP, -SURF / 2 + 1], className: 'plain' });
}
const surfLbl = sim.label('', { parent: G, position: [0, HAMP + 0.3, -SURF / 2 + 0.2] });

const C0 = new THREE.Color(0xf59e0b), C1 = new THREE.Color(0x3b82f6), CMID = new THREE.Color(0xf1f5f9);
const _c = new THREE.Color();
function mixColor(v, out) {
  return v < 0.5 ? out.copy(C0).lerp(CMID, v * 2) : out.copy(CMID).lerp(C1, (v - 0.5) * 2);
}

// --- Veri noktaları ---
const ptTrain = instanced(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, clearcoat: 1 }), MAX_PTS);
const ptTest = instanced(new THREE.OctahedronGeometry(0.14), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, flatShading: true }), MAX_PTS);
[ptTrain, ptTest].forEach((m) => { m.frustumCulled = false; m.castShadow = true; G.add(m); });
const PT0 = new THREE.Color(0xea580c), PT1 = new THREE.Color(0x1d4ed8), PT0t = new THREE.Color(0xfdba74), PT1t = new THREE.Color(0x93c5fd);

// --- Ağ şeması ---
const MAX_N = 2 + 3 * 8 + 1, MAX_E = 2 * 8 + 8 * 8 * 2 + 8 + 2;
// Ağ, cam ekranın önünde parlayan ışık kürecikleri ve ışık çizgileri olarak çizilir (HDR → hafif çiçeklenme)
const neuronMesh = instanced(new THREE.SphereGeometry(0.28, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.5, 1.5) }), MAX_N);
const edgeMesh = instanced(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.25, 1.25) }), MAX_E);
[neuronMesh, edgeMesh].forEach((m) => { m.frustumCulled = false; m.userData.noCast = true; G.add(m); });
let neuronPos = [], neuronId = [], layerLbls = [];
const dummy = new THREE.Object3D(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

function layoutNet() {
  const sz = net.sizes, Lc = sz.length;
  neuronPos = []; neuronId = [];
  sz.forEach((n, l) => {
    const x = -NET_W / 2 + (NET_W * l) / (Lc - 1);
    neuronPos.push([]);
    for (let j = 0; j < n; j++) {
      const y = NET_Y + (j - (n - 1) / 2) * 0.88;
      neuronPos[l].push(new THREE.Vector3(x, y, NET_Z));
      neuronId.push({ l, j });
    }
  });
  layerLbls.forEach((o) => { o.el.remove(); o.removeFromParent(); });
  layerLbls = sz.map((n, l) => sim.label(l === 0 ? 'Girdi' : l === Lc - 1 ? 'Çıktı' : `Gizli ${l}`,
    { parent: G, position: [neuronPos[l][0].x, NET_Y + 3.7, NET_Z], className: 'plain' }));
  layerLbls.push(sim.label('x₁', { parent: G, position: [neuronPos[0][0].x - 0.65, neuronPos[0][0].y, NET_Z], className: 'plain' }));
  layerLbls.push(sim.label('x₂', { parent: G, position: [neuronPos[0][1].x - 0.65, neuronPos[0][1].y, NET_Z], className: 'plain' }));
}

function drawNet() {
  let k = 0;
  neuronId.forEach(({ l, j }, i) => {
    dummy.position.copy(neuronPos[l][j]);
    dummy.quaternion.identity();
    const sel = selected ? selected.l === l && selected.j === j : l === net.L;
    dummy.scale.setScalar(sel ? 1.35 : 1);
    dummy.updateMatrix();
    neuronMesh.setMatrixAt(i, dummy.matrix);
    // Nöronun rengi: yanlılığı (bias) ile; girdiler gri
    let col;
    if (sel) col = _c.setHex(0xfde047);
    else if (l === 0) col = _c.setHex(0x94a3b8);
    else col = mixColor(clamp(0.5 + net.b[l - 1][j] * 0.35, 0, 1), _c);
    neuronMesh.setColorAt(i, col);
  });
  neuronMesh.count = neuronId.length;
  neuronMesh.instanceMatrix.needsUpdate = true;
  neuronMesh.instanceColor.needsUpdate = true;
  for (let l = 0; l < net.L; l++) {
    const W = net.W[l], nIn = net.sizes[l];
    for (let j = 0; j < net.sizes[l + 1]; j++) {
      for (let i = 0; i < nIn; i++) {
        const w = W[j * nIn + i], m = Math.min(1, Math.abs(w) / 2);
        _a.copy(neuronPos[l][i]); _b.copy(neuronPos[l + 1][j]);
        const len = _a.distanceTo(_b);
        dummy.position.addVectors(_a, _b).multiplyScalar(0.5);
        dummy.quaternion.setFromUnitVectors(UP, _b.sub(_a).normalize());
        const r = 0.012 + 0.07 * m;
        dummy.scale.set(r, len, r);
        dummy.updateMatrix();
        edgeMesh.setMatrixAt(k, dummy.matrix);
        edgeMesh.setColorAt(k, _c.setHex(0x334155).lerp(w >= 0 ? C1 : C0, 0.25 + 0.75 * m));
        k++;
      }
    }
  }
  edgeMesh.count = k;
  edgeMesh.instanceMatrix.needsUpdate = true;
  if (edgeMesh.instanceColor) edgeMesh.instanceColor.needsUpdate = true;
}

// Seçili nöronun çıktısını [0,1]'e ölçekle
function neuronValue(x1, x2) {
  const p = forward(net, x1, x2);
  if (!selected) return p;
  const v = net.a[selected.l][selected.j];
  if (selected.l === 0) return clamp((v + DOM) / (2 * DOM), 0, 1);
  const A = ACT[net.act];
  if (A.hi == null) return clamp(v / 2, 0, 1); // ReLU: 0..2 aralığı
  return (v - A.lo) / (A.hi - A.lo);
}

function drawSurface() {
  const pos = surfGeo.attributes.position, col = surfGeo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const v = neuronValue(x / S, -z / S);
    pos.setY(i, (v - 0.5) * 2 * HAMP);
    mixColor(v, _c);
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  surfGeo.computeVertexNormals();
  // Noktalar yüzeyin hemen üstünde
  let a = 0, b = 0;
  for (let k = 0; k < data.n; k++) {
    const x1 = data.X[k * 2], x2 = data.X[k * 2 + 1];
    const v = neuronValue(x1, x2);
    dummy.position.set(x1 * S, (v - 0.5) * 2 * HAMP + 0.16, -x2 * S);
    dummy.quaternion.identity();
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    const isTest = testSet.has(k);
    const m = isTest ? ptTest : ptTrain;
    const idx = isTest ? b++ : a++;
    m.setMatrixAt(idx, dummy.matrix);
    m.setColorAt(idx, data.Y[k] ? (isTest ? PT1t : PT1) : (isTest ? PT0t : PT0));
  }
  ptTrain.count = a; ptTest.count = b;
  [ptTrain, ptTest].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  surfLbl.setText(selected
    ? `Yüzey: <b>${selected.l === 0 ? 'girdi x' + (selected.j ? '₂' : '₁') : `Gizli ${selected.l} · nöron ${selected.j + 1}`}</b> çıktısı <small>(çıktıya dönmek için çıktı nöronuna tıkla)</small>`
    : 'Yüzey: ağın “mavi” olasılığı · saydam levha = %50');
}

// --- Veri ve ağ kurulumu ---
let testSet = new Set();
function buildData() {
  data = makeData(cfg.data, cfg.n, cfg.noise, dataSeed);
  const idx = [...Array(cfg.n).keys()];
  const rnd = mulberry(dataSeed * 31 + 5);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const nt = Math.round(cfg.n * cfg.testFrac);
  testIdx = idx.slice(0, nt); trainIdx = idx.slice(nt);
  testSet = new Set(testIdx);
}
function mulberry(a) {
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function buildNet() {
  const sizes = [2, ...Array(cfg.layers).fill(cfg.neurons), 1];
  net = createNet(sizes, cfg.act, wSeed);
  epoch = 0; epochAcc = 0;
  if (selected && (selected.l >= sizes.length - 1 || selected.j >= sizes[selected.l])) selected = null;
  layoutNet();
  lossChart.clear(); accChart.clear();
  measure(true);
  dirty = true;
}
function restartAll() { buildData(); buildNet(); }

// --- Eğitim ---
function runEpoch() {
  const order = trainIdx.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const bs = cfg.batch === 0 ? order.length : cfg.batch;
  for (let s = 0; s < order.length; s += bs) trainBatch(net, data.X, data.Y, order.slice(s, s + bs), cfg);
  epoch++;
}
function measure(push) {
  lastTrain = evaluate(net, data.X, data.Y, trainIdx);
  lastTest = evaluate(net, data.X, data.Y, testIdx);
  if (push) {
    lossChart.push([Math.min(lastTrain.loss, 3), Math.min(lastTest.loss, 3)]);
    accChart.push([lastTrain.acc * 100, lastTest.acc * 100]);
  }
  updateStats();
}

sim.onUpdate((dt) => {
  epochAcc = Math.min(epochAcc + dt * cfg.eps, 4);
  const t0 = performance.now();
  let did = false;
  while (epochAcc >= 1 && performance.now() - t0 < 10) {
    runEpoch(); epochAcc -= 1; did = true;
    if (epoch % 2 === 0) measure(true);
  }
  if (did) dirty = true;
});

let frameN = 0;
sim.onRender(() => {
  if (dirty && ++frameN % 3 === 0) { drawSurface(); drawNet(); dirty = false; }
});

// Nörona tıkla → yüzeyde onun çıktısı
sim.onClick([neuronMesh], (hit) => {
  if (hit.instanceId == null) return;
  const id = neuronId[hit.instanceId];
  if (!id) return;
  selected = id.l === net.L ? null : id;
  dirty = true;
  frameN = 2;
});

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır deneyler');
const PRESETS = [
  ['Doğrusal model + XOR', { data: 'xor', layers: 0, noise: 0.1, n: 240, testFrac: 0.3, lr: 0.03, opt: 'adam', l2: 0 }],
  ['Gizli katman XOR\'u çözer', { data: 'xor', layers: 1, neurons: 4, act: 'tanh', noise: 0.1, n: 240, testFrac: 0.3, lr: 0.03, opt: 'adam', l2: 0 }],
  ['Spiral: derin ağ', { data: 'spiral', layers: 3, neurons: 8, act: 'tanh', noise: 0.05, n: 300, testFrac: 0.3, lr: 0.03, opt: 'adam', l2: 0, batch: 10 }],
  ['Aşırı öğrenme', { data: 'daire', layers: 3, neurons: 8, act: 'tanh', noise: 0.9, n: 80, testFrac: 0.5, lr: 0.03, opt: 'adam', l2: 0, batch: 10 }],
  ['L2 ile düzenlileştirme', { data: 'daire', layers: 3, neurons: 8, act: 'tanh', noise: 0.9, n: 80, testFrac: 0.5, lr: 0.03, opt: 'adam', l2: 0.01, batch: 10 }],
  ['Çok büyük öğrenme hızı', { data: 'daire', layers: 2, neurons: 4, act: 'tanh', noise: 0.15, n: 240, testFrac: 0.3, lr: 3, opt: 'sgd', l2: 0, batch: 10 }],
];
for (let i = 0; i < PRESETS.length; i += 2) {
  ui.buttons(PRESETS.slice(i, i + 2).map(([label, o]) => ({ label, onClick: () => applyPreset(label, o) })));
}

ui.section('Veri');
const dataSeg = ui.segmented({
  options: [{ value: 'daire', label: '◎ Daire' }, { value: 'xor', label: '⊞ XOR' }, { value: 'spiral', label: '🌀 Spiral' }, { value: 'iki', label: '⚬⚬ İki küme' }],
  value: cfg.data, onChange: (v) => { cfg.data = v; restartAll(); },
});
const nS = ui.slider({ label: 'Nokta sayısı', min: 40, max: MAX_PTS, step: 20, value: cfg.n, onChange: (v) => { cfg.n = v; restartAll(); } });
const noiseS = ui.slider({ label: 'Gürültü', min: 0, max: 1, step: 0.05, value: cfg.noise, format: (v) => `%${fmt(v * 100)}`, onChange: (v) => { cfg.noise = v; restartAll(); } });
const testS = ui.slider({ label: 'Test payı (ağ görmez)', min: 0.1, max: 0.6, step: 0.05, value: cfg.testFrac, format: (v) => `%${fmt(v * 100)}`, onChange: (v) => { cfg.testFrac = v; restartAll(); } });
ui.button({ label: '🎲 Yeni örneklem çek', onClick: () => { dataSeed++; restartAll(); } });

ui.section('Ağ mimarisi');
const layS = ui.slider({ label: 'Gizli katman sayısı', min: 0, max: 3, step: 1, value: cfg.layers, onChange: (v) => { cfg.layers = v; buildNet(); } });
const neuS = ui.slider({ label: 'Katman başına nöron', min: 1, max: 8, step: 1, value: cfg.neurons, onChange: (v) => { cfg.neurons = v; buildNet(); } });
const actSeg = ui.segmented({
  label: 'Aktivasyon', options: [{ value: 'tanh', label: 'tanh' }, { value: 'relu', label: 'ReLU' }, { value: 'sigmoid', label: 'sigmoid' }],
  value: cfg.act, onChange: (v) => { cfg.act = v; buildNet(); },
});
const archTxt = ui.text('', 'card');
ui.button({ label: '♻️ Ağırlıkları yeniden başlat', onClick: () => { wSeed++; buildNet(); } });

ui.section('Eğitim');
const optSeg = ui.segmented({ label: 'Optimizasyon', options: [{ value: 'sgd', label: 'SGD' }, { value: 'adam', label: 'Adam' }], value: cfg.opt, onChange: (v) => { cfg.opt = v; } });
const LRS = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3];
const lrSel = ui.select({ label: 'Öğrenme hızı', options: LRS.map((v) => ({ value: String(v), label: fmt(v, 3).replace(/0+$/, '').replace(/,$/, '') })), value: String(cfg.lr), onChange: (v) => { cfg.lr = +v; } });
const L2S = [0, 0.0001, 0.001, 0.003, 0.01, 0.03, 0.1];
const l2Sel = ui.select({ label: 'L2 düzenlileştirme (λ)', options: L2S.map((v) => ({ value: String(v), label: v === 0 ? 'Yok' : fmt(v, 4).replace(/0+$/, '') })), value: String(cfg.l2), onChange: (v) => { cfg.l2 = +v; } });
const BS = [1, 4, 10, 30, 0];
const bsSel = ui.select({ label: 'Toplu boyutu (batch)', options: BS.map((v) => ({ value: String(v), label: v === 0 ? 'Tüm eğitim verisi' : String(v) })), value: String(cfg.batch), onChange: (v) => { cfg.batch = +v; } });
ui.slider({ label: 'Hız', min: 1, max: 30, step: 1, value: cfg.eps, format: (v) => `${fmt(v)} dönem/sn`, onInput: (v) => { cfg.eps = v; } });
ui.buttons([
  { label: '⏯ Başlat / Durdur', variant: 'primary', onClick: () => sim.pause(!sim.paused) },
  { label: '⏭ Tek dönem', onClick: () => { runEpoch(); measure(true); dirty = true; frameN = 2; } },
]);

ui.section('Sonuçlar');
const stEp = ui.stat({ label: 'Dönem (epoch)' });
const stPar = ui.stat({ label: 'Parametre' });
const stTrL = ui.stat({ label: 'Eğitim kaybı' });
const stTeL = ui.stat({ label: 'Test kaybı' });
const stTrA = ui.stat({ label: 'Eğitim doğruluğu' });
const stTeA = ui.stat({ label: 'Test doğruluğu' });
const lossChart = ui.chart({ title: 'Kayıp (çapraz entropi, düşük = iyi)', maxPoints: 250, yMin: 0,
  series: [{ name: 'Eğitim', color: '#e2e8f0' }, { name: 'Test', color: '#f472b6' }], format: (v) => fmt(v, 2) });
const accChart = ui.chart({ title: 'Doğruluk (%)', maxPoints: 250, yMin: 40, yMax: 100,
  series: [{ name: 'Eğitim', color: '#e2e8f0' }, { name: 'Test', color: '#f472b6' }] });
const verdict = ui.text('', 'card');
ui.text('<small>Grafikler her 2 dönemde bir güncellenir. Test verisi eğitimde hiç kullanılmaz; yalnızca ölçüm içindir.</small>');

function updateStats() {
  stEp.set(fmt(epoch));
  stPar.set(fmt(net.params));
  stTrL.set(fmt(lastTrain.loss, 3));
  stTeL.set(fmt(lastTest.loss, 3), lastTest.loss > lastTrain.loss * 1.5 + 0.05 ? 'bad' : '');
  stTrA.set(`%${fmt(lastTrain.acc * 100)}`, lastTrain.acc > 0.95 ? 'good' : '');
  stTeA.set(`%${fmt(lastTest.acc * 100)}`, lastTest.acc > 0.95 ? 'good' : lastTest.acc < 0.75 ? 'bad' : 'warn');
  archTxt.set(`Yapı: <b>${net.sizes.join(' → ')}</b> · ${fmt(net.params)} parametre<br><small>${cfg.layers === 0 ? 'Gizli katman yok: model yalnızca doğrusal (düz) bir sınır çizebilir.' : 'Her gizli katman, önceki katmanın şekillerini birleştirerek daha karmaşık sınırlar kurar.'}</small>`);
  let v;
  if (epoch < 20) v = 'Eğitim başlıyor…';
  else if (!isFinite(lastTrain.loss) || lastTrain.loss > 0.9) v = '⚠️ Kayıp düşmüyor: öğrenme hızı çok büyük olabilir ya da model bu şekli çizemeyecek kadar basit.';
  else if (lastTest.loss > lastTrain.loss * 2 + 0.1 && lastTrain.acc - lastTest.acc > 0.08) v = '🔍 <b>Aşırı öğrenme</b>: eğitim verisini ezberliyor, test hatası artıyor. L2 ekle, ağı küçült ya da daha çok veri kullan.';
  else if (lastTrain.acc < 0.8) v = 'Model veriye henüz uymuyor (<i>eksik öğrenme</i>). Daha çok nöron/katman ya da daha uzun eğitim dene.';
  else v = '✅ Eğitim ve test başarımı yakın: model genelleme yapıyor.';
  verdict.set(v);
}

function applyPreset(label, o) {
  Object.assign(cfg, { neurons: 4, act: 'tanh', batch: 10 }, o);
  dataSeg.set(cfg.data); nS.set(cfg.n); noiseS.set(cfg.noise); testS.set(cfg.testFrac);
  layS.set(cfg.layers); neuS.set(cfg.neurons); actSeg.set(cfg.act); optSeg.set(cfg.opt);
  lrSel.set(String(cfg.lr)); l2Sel.set(String(cfg.l2)); bsSel.set(String(cfg.batch));
  selected = null;
  restartAll();
  sim.play();
  sim.toast(`🧪 ${label}`);
}

sim.onReset(() => { wSeed++; buildNet(); });
restartAll();
