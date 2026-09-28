// DNA Mutfağı — DNA tarifinden proteine: transkripsiyon, translasyon ve tek harflik mutasyonların etkisi.
import { createSim, THREE, clamp, smoothstep, lerp, instanced, randInt, pick, mat, RoundedBoxGeometry, BufferGeometryUtils } from '@core';
import { darkMedium, blobGeometry, loftTube, tissue, softDot } from './bio.js';
import { buildCellEnv } from './cellEnv.js';
import { AA, CLASS_NAME, COMP, RNA_COMP, aaName, aaShort, toRNA, translate, classify, randomGene } from './genetik.js';

const D = 0.5;              // nükleotit aralığı
const RAD = 0.85;           // sarmal yarıçapı
const GROOVE = 0.62;        // iki zincir arasındaki açı kayması: büyük ve küçük oluk
const TWIST = Math.PI / 5;  // 36°/baz çifti (≈10 bç/tur)
const SUB = 4;              // omurga çizgisinde nükleotit başına ara nokta
const YD = 5.4, YM = 0.6, YP = -1.5, YO = -3.0;
const MAX_NT = 60, MAX_CH = 24, MAX_AA = 22;
const TX_RATE = 7;          // transkripsiyon hızı (nükleotit/s)
const STEP = 1.2;           // translasyon: kodon başına süre (s)
const BASE_HEX = { A: '#22c55e', T: '#ef4444', G: '#eab308', C: '#3b82f6', U: '#f97316' };
const CLASS_HEX = { h: '#fcd34d', p: '#5eead4', a: '#fb7185', b: '#a5b4fc' };
const MONO = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '12px', letterSpacing: '1px' };
const HBB = 'ATGGTGCATCTGACTCCTGAGGAGAAGTCTTAA';
const GENES = {
  orak: { label: 'Orak hücre (HBB: GAG → GTG)', seq: HBB, mut: HBB.slice(0, 19) + 'T' + HBB.slice(20), hbb: true, sel: 19 },
  hbb: { label: 'Normal β-globin (HBB başı)', seq: HBB, hbb: true, sel: 19 },
  kisa: { label: 'Kısa tarif (8 amino asit)', seq: 'ATGGCTTGGAAACGCTTCGGATACTAA', sel: 7 },
  rastgele: { label: 'Rastgele gen', random: true, sel: 4 },
};

const sim = createSim({
  studio: { mood: 'lab', color: 0x2a3050, warmth: 0.05, key: { el: 55, az: 200, power: 1.4 }, radius: 80, height: 40 },
  camera: { position: [-3.5, 5.6, 19.5], target: [-0.3, 2.0, -0.5], fov: 45 },
  controls: { minDistance: 5, maxDistance: 50 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Üstte <b>DNA</b> (tarif defteri): iki zincir, A–T ve G–C eşleşmeleriyle bağlı. <b>RNA polimeraz</b> sarmalı açar,
    <b>kalıp zinciri</b> okuyarak bir <b>mRNA</b> kopyası (tarifin fotokopisi) yazar. mRNA, kodlayan zincirle aynıdır; yalnız T yerine
    <b>U</b> bulunur. Aşçı <b>ribozom</b> mRNA'yı üçer harf (<b>kodon</b>) okur; her kodona uyan <b>antikodonlu tRNA</b> doğru amino asidi getirir.
    AUG “başla”, UAA/UAG/UGA “dur” demektir. Amino asitler zincir hâlinde birleşip <b>protein</b>i (yemeği) oluşturur.</p>
    <p>Sarmalda şeker-fosfat <b>omurgası</b> (tüp ve fosfat küreleri) dışta, bazlar içte yassı basamaklar hâlinde; iki zincir arasındaki
    açı farkı <b>büyük</b> ve <b>küçük oluğu</b> oluşturur. Arkada <b>çekirdek zarı</b> (iki katlı zar) ve üzerindeki <b>por kompleksleri</b>,
    çekirdek içinde boncuklu <b>kromatin</b> (histonlara sarılı DNA) ile <b>çekirdekçik</b>; zarın altında sitoplazmada
    ribozomlu <b>ER</b> keseleri, serbest ribozomlar, uzakta <b>mitokondriler</b> ve kesecikler; sitoplazmayı <b>hücre iskeleti</b> (kalın mikrotübüller, ince aktin iplikleri) çaprazlar. Zarın ön kesitinde iki lipit çift katmanı ve porlar görünür. Çevrede süzülen renkli parıltılar serbest nükleotitlerdir.</p>
    <p>Boncuk renkleri amino asidin kimyasını gösterir: <span style="color:${CLASS_HEX.h}">hidrofobik</span>,
    <span style="color:${CLASS_HEX.p}">polar</span>, <span style="color:${CLASS_HEX.a}">asidik (−)</span>, <span style="color:${CLASS_HEX.b}">bazik (+)</span>.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Orak hücre</b> hazır geninde tek harf (A → T) Glutamik asidi (−, suyu sever) Valine (suyu sevmez) çeviriyor. Boncuk rengi değişiyor!</li>
      <li>“Örnek bul” düğmeleriyle <b>sessiz</b>, <b>yanlış anlamlı</b>, <b>anlamsız</b> ve <b>çerçeve kayması</b> mutasyonlarını karşılaştır.</li>
      <li>Bir harf <b>sil</b>: sonraki tüm kodonlar kayar. Sonra bir harf daha sil, bir daha… Üç silmede çerçeve düzelir!</li>
      <li>Kodonun 3. harfini değiştir: çoğu zaman protein değişmez (genetik kodun yedekliliği: 64 kodon, 20 amino asit).</li>
      <li>DNA'daki bir basamağa tıklayarak konum seç.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p><b>Orak hücre anemisi</b>, β-globin genindeki tek harflik değişiklikten (GAG → GTG) kaynaklanır. Oksijen azaldığında değişmiş
    hemoglobin molekülleri birbirine yapışıp lifler oluşturur, alyuvarlar orak biçimini alır. Geni tek kopya taşıyanlar genellikle sağlıklıdır
    ve sıtmaya karşı kısmen korunurlar. <b>Kistik fibrozda</b> en sık mutasyon, üç harfin silinmesiyle tek bir amino asidin (fenilalanin)
    eksilmesidir; bu bir çerçeve içi silmedir.</p>
    <h3>Model ve sınırları</h3>
    <p><small>Burada yalnız kodlayan dizi var: HBB örneği gerçek genin ilk 10 kodonu, sonuna eğitim amaçlı bir DUR kodonu eklendi.
    Gerçek genlerde intronlar kesilip atılır (splaysing), ribozomun başlangıcı çevredeki dizilere de bağlıdır. β-globinde ilk metiyonin olgun
    proteinden çıkarıldığı için tıp kaynakları Glu→Val değişimini <b>6. konum</b> (Glu6Val) olarak anar; bu simülasyonda Met'i de saydığımız için 7. sıradadır.
    Sarmal 10 baz çifti/tur çizildi (gerçekte ≈10,5).</small></p>`,
});
sim.formatTime = () => STAGE_SHORT[stage] || '';

// --- Ortam: koyu çekirdek sıvısı, derinlik pusu, süzülen parçacıklar ---
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const medium = darkMedium(sim, {
  top: 0x18285a, bottom: 0x1a1850, glow: 0x2a3f86, glowDir: [0.2, 0.3, -0.9], tint: 0x5a2a80,
  fog: 0x070b1d, density: 0.012, motes: LOWQ ? 260 : 600, box: [44, 22, 26], center: [0, 2.5, -4],
  moteColor: 0x9fb6ff, moteColor2: 0xffc6e8, moteSize: 0.07, moteOpacity: 0.5,
});

// --- Ortak geometri / yardımcılar ---
const scene = sim.scene;
const sphereGeo = new THREE.SphereGeometry(1, LOWQ ? 20 : 32, LOWQ ? 14 : 22);
// Baz (basamak): sarmal eksenine dik, yassı halka düzlemi gibi ince levha (x: kalınlık, z: genişlik)
const slabGeo = new RoundedBoxGeometry(1.1, 1, 3.4, 2, 0.34);
/** Yüzeyin kendi renginden ışıma (örnek rengi dahil): moleküller karanlık ortamda hafifçe parlar, bloom alır. */
function glowFrom(m, k) {
  const prev = m.onBeforeCompile, pk = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uSelfGlow = m.userData.selfGlow;
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float uSelfGlow;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uSelfGlow;');
  };
  m.userData.selfGlow = { value: k };
  m.customProgramCacheKey = () => (pk ? pk() : '') + '-selfglow';
  return m;
}
const gloss = (color, k = 0.3, g = 0.9) => glowFrom(mat.plastic({ color, gloss: g }), k);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), QI = new THREE.Quaternion();
const _col = new THREE.Color();

function inst(geo, mat, n) {
  const m = instanced(geo, mat, n);
  m.frustumCulled = false;
  for (let i = 0; i < n; i++) m.setColorAt(i, _col.set(0xffffff));
  scene.add(m);
  return m;
}
function setBall(mesh, i, p, r) { _s.setScalar(r); _m.compose(p, QI, _s); mesh.setMatrixAt(i, _m); }
function setSeg(mesh, i, a, b, r) {
  _dir.subVectors(b, a);
  const len = Math.max(_dir.length(), 1e-4);
  _q.setFromUnitVectors(UP, _dir.multiplyScalar(1 / len));
  _p.addVectors(a, b).multiplyScalar(0.5);
  _s.set(r, len, r);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}
/** Omurga: noktaları her güncellemede değişen, paralel taşımalı çerçeveli tüp (şeker-fosfat zinciri). */
function makeTube(color, maxPts, radius, glowK = 0.35) {
  const R = LOWQ ? 8 : 12, nv = maxPts * (R + 1);
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), pts = new Float32Array(maxPts * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < maxPts - 1; i++) for (let j = 0; j < R; j++) {
    const a = i * (R + 1) + j, b = a + R + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  g.setIndex(idx);
  g.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(g, gloss(color, glowK, 0.8));
  mesh.frustumCulled = false;
  scene.add(mesh);
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3(), Q = new THREE.Vector3();
  mesh.userData.pts = pts;
  mesh.userData.update = (n) => {
    if (n < 2) { g.setDrawRange(0, 0); return; }
    N.set(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      T.set(pts[i1 * 3] - pts[i0 * 3], pts[i1 * 3 + 1] - pts[i0 * 3 + 1], pts[i1 * 3 + 2] - pts[i0 * 3 + 2]).normalize();
      N.addScaledVector(T, -N.dot(T));
      if (N.lengthSq() < 1e-6) N.set(0, 0, 1).addScaledVector(T, -T.z);
      N.normalize();
      B.crossVectors(T, N);
      P.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      for (let j = 0; j <= R; j++) {
        const an = (j / R) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an);
        Q.set(N.x * c + B.x * s, N.y * c + B.y * s, N.z * c + B.z * s);
        const o = (i * (R + 1) + j) * 3;
        nor[o] = Q.x; nor[o + 1] = Q.y; nor[o + 2] = Q.z;
        pos[o] = P.x + Q.x * radius; pos[o + 1] = P.y + Q.y * radius; pos[o + 2] = P.z + Q.z * radius;
      }
    }
    g.setDrawRange(0, (n - 1) * R * 6);
    g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true;
  };
  return mesh;
}
function lbl(text, pos = [0, 0, 0], cls = 'plain', style, parent = scene) {
  const l = sim.label(text, { parent, position: pos, className: cls });
  if (style) Object.assign(l.el.style, style);
  return l;
}

// --- DNA ---
// Şeker-fosfat omurgası: kalın tüp (deoksiriboz) + her nükleotitte fosfat küresi; bazlar yassı levhalar
const bbA = inst(sphereGeo, gloss(0xf3cf9a, 0.22, 0.85), MAX_NT), bbB = inst(sphereGeo, gloss(0xe8b27e, 0.22, 0.85), MAX_NT);
const rungA = inst(slabGeo, gloss(0xffffff, 0.5), MAX_NT), rungB = inst(slabGeo, gloss(0xffffff, 0.5), MAX_NT);
const lineA = makeTube(0xdfe8f7, (MAX_NT - 1) * SUB + 1, 0.1, 0.22), lineB = makeTube(0x9fb8dc, (MAX_NT - 1) * SUB + 1, 0.1, 0.22);
// RNA polimeraz: DNA'yı saran iri, yarı saydam protein kümesi
const polMat = glowFrom(tissue({ color: 0x2dd4bf, veins: 0.15 }), 0.18);
Object.assign(polMat, { transparent: true, opacity: 0.42, depthWrite: false, clearcoat: 0.8, roughness: 0.35 });
const pol = new THREE.Mesh(blobGeometry(1, { detail: LOWQ ? 6 : 10, amp: 0.16, freq: 1.7, seed: 2 }), polMat);
pol.scale.set(1.0, 1.35, 1.2);
// Enzimin DNA'yı kavrayan çenesi (ikinci, daha küçük lob) ve RNA çıkış kanalı tarafındaki kabartı
const polJaw = new THREE.Mesh(blobGeometry(0.6, { detail: LOWQ ? 5 : 8, amp: 0.24, freq: 2.1, seed: 6 }), polMat);
polJaw.position.set(0.6, -0.55, 0.55);
const polLobe = new THREE.Mesh(blobGeometry(0.45, { detail: LOWQ ? 4 : 7, amp: 0.25, freq: 2.4, seed: 8 }), polMat);
polLobe.position.set(-0.55, 0.62, -0.5);
polJaw.userData.noCast = polLobe.userData.noCast = true;
pol.add(polJaw, polLobe);
pol.userData.noCast = true;
scene.add(pol);
// Seçili konum göstergesi: sarmalı (ve mRNA'yı) saran, hafif ışıyan iki ince halka ve aralarında yumuşak bir ışık lekesi
function selRing(R, t) {
  const g = new THREE.Group();
  const rm = Object.assign(mat.glow({ color: 0xbcd0ff, intensity: 1.1 }), { transparent: true, opacity: 0.75, depthWrite: false });
  const tg = new THREE.TorusGeometry(R, t, 8, 48).rotateY(Math.PI / 2);
  for (const dx of [-0.24, 0.24]) { const r = new THREE.Mesh(tg, rm); r.position.x = dx; r.userData.noCast = true; r.raycast = () => {}; g.add(r); }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0x8fb0ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(R * 2.6); halo.raycast = () => {};
  g.add(halo);
  scene.add(g);
  return g;
}
const selBox = selRing(1.3, 0.03);
const selBoxM = selRing(0.52, 0.022);

// Hücre ortamı: çekirdek zarı (çift zar + por kompleksleri) zemin ve arka duvar olarak; kromatin, çekirdekçik, ER, ribozomlar
const env = buildCellEnv(scene, { LOWQ });

// --- mRNA ---
const mBB = inst(sphereGeo, gloss(0xfcd88a, 0.3), MAX_NT), mStick = inst(slabGeo, gloss(0xffffff, 0.5), MAX_NT);
const lineM = makeTube(0xfcd88a, MAX_NT, 0.075, 0.3);

// --- Ribozom, tRNA, salıverme faktörü ---
// Ribozom: iki alt birimli, yumrulu rRNA-protein kütlesi (yarı saydam: içinden mRNA ve tRNA görünür)
const ribMat = (c, o) => {
  const m = glowFrom(tissue({ color: c, veins: 0.25 }), 0.22);
  return Object.assign(m, { transparent: true, opacity: o, depthWrite: false, clearcoat: 0.7 });
};
const ribSmall = new THREE.Mesh(blobGeometry(1, { detail: LOWQ ? 6 : 9, amp: 0.3, freq: 2.6, seed: 1, oct: 4 }), ribMat(0x8b5cf6, 0.7));
ribSmall.scale.set(1.35, 0.42, 0.9);
const ribLarge = new THREE.Mesh(blobGeometry(1, { detail: LOWQ ? 6 : 9, amp: 0.3, freq: 2.4, seed: 3, oct: 4 }), ribMat(0xb39dfa, 0.55));
ribLarge.scale.set(1.5, 0.9, 1.05);
ribSmall.userData.noCast = ribLarge.userData.noCast = true;
scene.add(ribSmall, ribLarge);
const ribLbl = lbl('Ribozom', [0, 0, 0], 'plain', { color: '#c4b5fd', fontSize: '11px' });

const stubGeo = new THREE.CapsuleGeometry(0.075, 0.18, 4, 12);
const beadGeo = new THREE.SphereGeometry(0.21, 28, 20);
// tRNA'nın L biçimi: antikodon kolu (altta) → dirsek → alıcı kol (amino asit ucu üstte); ilmekler şişkin uçlarla
const tArms = [
  [[[-0.5, 0.33, 0], [0, 0.29, 0.03], [0.5, 0.33, 0]], (t) => 0.085 + 0.04 * Math.exp(-((t - 0.5) ** 2) / 0.02)],
  [[[0, 0.33, 0], [0.06, 0.7, 0.05], [0.02, 1.05, 0], [0, 1.32, 0]], (t) => 0.085 + 0.02 * Math.sin(t * 9)],
  [[[-0.45, 0.82, 0.02], [0, 0.87, 0], [0.42, 0.9, -0.03]], (t) => 0.07 + 0.05 * Math.exp(-(Math.min(t, 1 - t) ** 2) / 0.006)],
].map(([p, r]) => loftTube(new THREE.CatmullRomCurve3(p.map((v) => new THREE.Vector3(...v))), r, { segs: 40, radial: 14, noiseAmp: 0.01, noiseFreq: 6 }));
function makeTRNA() {
  const g = new THREE.Group();
  const mt = glowFrom(tissue({ color: 0xf472b6, veins: 0.2 }), 0.35);
  mt.clearcoat = 0.8;
  for (const geo of tArms) g.add(new THREE.Mesh(geo, mt));
  const stubs = [0, 1, 2].map((k) => {
    const s = new THREE.Mesh(stubGeo, gloss(0xffffff, 1.1));
    s.position.set((k - 1) * D, 0.15, 0);
    g.add(s);
    return s;
  });
  const bead = new THREE.Mesh(beadGeo, gloss(0xffffff, 0.9));
  bead.position.y = 1.45;
  g.add(bead);
  const label = lbl('', [0.95, 1.2, 0], '', { ...MONO, fontSize: '11px' }, g);
  g.visible = false;
  scene.add(g);
  return { g, stubs, bead, label, k: -1 };
}
const trnas = [makeTRNA(), makeTRNA()];
// Salıverme faktörü: tRNA'yı taklit eden protein (DUR kodonuna oturur)
const rf = new THREE.Mesh(blobGeometry(0.42, { detail: 6, amp: 0.18, freq: 2.4, seed: 7, stretch: [0.8, 1.25, 0.7] }), glowFrom(tissue({ color: 0xf43f5e, veins: 0.2 }), 0.5));
rf.visible = false;
scene.add(rf);
const rfLbl = lbl('DUR → salıverme faktörü', [0.9, 0.7, 0], '', { fontSize: '11px', color: '#fda4af' }, rf);

// --- Protein ---
// Amino asit: omurga atomu kümesi + yan zincir (R grubu) çıkıntısı; peptit bağları boncukları birleştiren tüp
const aaGeo = BufferGeometryUtils.mergeGeometries([
  blobGeometry(1, { detail: LOWQ ? 3 : 4, amp: 0.1, freq: 2.2, seed: 12 }),
  blobGeometry(0.52, { detail: 2, amp: 0.12, freq: 2.6, seed: 13 }).translate(0.28, 0.92, 0.35),
  blobGeometry(0.36, { detail: 2, amp: 0.1, freq: 2.6, seed: 14 }).translate(-0.62, 0.55, -0.4),
]);
const chain = inst(aaGeo, gloss(0xffffff, 0.45, 0.7), MAX_AA);
const lineP = makeTube(0xe9dcc4, MAX_AA, 0.07, 0.2), lineO = makeTube(0xb8b0a0, MAX_AA, 0.05, 0.1);
function syncPep(tube, mesh, n) {
  const pts = tube.userData.pts;
  for (let j = 0; j < n; j++) { mesh.getMatrixAt(j, _m); _p.setFromMatrixPosition(_m); pts[j * 3] = _p.x; pts[j * 3 + 1] = _p.y; pts[j * 3 + 2] = _p.z; }
  tube.userData.update(n);
}
const origMat = gloss(0xffffff, 0.5);
Object.assign(origMat, { transparent: true, opacity: 0.5 });
const origBeads = inst(aaGeo, origMat, MAX_AA);
const rings = inst(new THREE.TorusGeometry(1, 0.08, 10, 40), mat.glow({ color: 0xfff1d6, intensity: 3 }), MAX_AA);
chain.count = origBeads.count = rings.count = 0;

// --- Etiketler ---
const pools = { cod: [], tpl: [], mrna: [], prot: [], orig: [] };
for (let i = 0; i < MAX_CH; i++) {
  pools.cod.push(lbl('', [0, 0, 0], '', MONO));
  pools.tpl.push(lbl('', [0, 0, 0], '', MONO));
  pools.mrna.push(lbl('', [0, 0, 0], '', MONO));
}
for (let i = 0; i < MAX_AA; i++) {
  pools.prot.push(lbl('', [0, 0, 0], 'plain', { fontSize: '11.5px' }));
  pools.orig.push(lbl('', [0, 0, 0], 'plain', { fontSize: '11px', opacity: '0.6' }));
}
const titleStyle = { fontSize: '12px', color: '#cbd5e1' };
const titles = {
  dna: lbl('<b>DNA</b><br><small>tarif defteri</small>', [0, YD, 0], 'plain', { ...titleStyle, textAlign: 'center' }),
  mrna: lbl('<b>mRNA</b><br><small>tarif kopyası</small>', [0, YM, 0], 'plain', { ...titleStyle, textAlign: 'center' }),
  prot: lbl('<b>Protein</b><br><small>yemek</small>', [0, YP, 0], 'plain', { ...titleStyle, textAlign: 'center' }),
  orig: lbl('<b>Orijinal</b>', [0, YO, 0], 'plain', { ...titleStyle, opacity: '0.7' }),
  cod: lbl('kodlayan', [0, 0, 0], 'plain', { fontSize: '10.5px', color: '#94a3b8' }),
  tpl: lbl('kalıp', [0, 0, 0], 'plain', { fontSize: '10.5px', color: '#94a3b8' }),
  nuc: lbl('↑ çekirdek', [0, 0, 0], 'plain', { fontSize: '10.5px', color: '#a5b4fc' }),
  cyt: lbl('↓ sitoplazma', [0, 0, 0], 'plain', { fontSize: '10.5px', color: '#a5b4fc' }),
};
const ends = [0, 1, 2, 3, 4, 5].map(() => lbl('', [0, 0, 0], 'plain', { fontSize: '11px', color: '#94a3b8' }));
const stageLbl = lbl('', [0, YD + 3.1, 0], 'big', { whiteSpace: 'normal', maxWidth: '520px', textAlign: 'center' });

// --- Durum ---
let orig = HBB, cur = HBB, L = HBB.length, meta = GENES.orak, sel = 19;
let prot = translate(cur), cls = classify(orig, cur), chunks = [];
const open = new Float32Array(MAX_NT), mProg = new Float32Array(MAX_NT);
let stage = 'idle', polPos = 0, scanT = 0, scanDur = 1, k = 0, u = 0, relT = 0, hiChunk = -1;
let dnaDirty = true, mDirty = true, meterTick = 0;
const STAGE_SHORT = { tx: 'Transkripsiyon', scan: 'Ribozom bağlanıyor', tl: 'Translasyon', rel: 'Protein salınıyor', done: 'Protein hazır', idle: '' };

const xOf = (i) => (i - (L - 1) / 2) * D;
const codonX = (j, p = prot) => xOf(clamp((p.pos[j] ?? (p.start + 3 * j)) + 1, 0, L - 1));
const stepX = (kk) => xOf(clamp(prot.start + 3 * kk + 1, 0, L - 1));
const colored = (str, rna) => [...str].map((c) => { const b = rna && c === 'T' ? 'U' : c; return `<span style="color:${BASE_HEX[b]}">${b}</span>`; }).join('');
const ease = (t) => t * t * (3 - 2 * t);

function buildChunks() {
  chunks = [];
  const s = prot.start >= 0 ? prot.start : 0;
  if (s > 0) chunks.push({ a: 0, b: s, kind: 'utr' });
  let after = prot.start < 0;
  for (let i = s; i < L; i += 3) {
    const b = Math.min(L, i + 3);
    let kind = after ? 'utr' : b - i < 3 ? 'part' : 'cds';
    if (!after && i === prot.stopAt) { kind = 'stop'; after = true; }
    chunks.push({ a: i, b, kind });
  }
}

/** Dizi değişince: renkler, etiketler, satır başlıkları, orijinal protein satırı. */
function layoutStatic() {
  for (const m of [bbA, bbB, rungA, rungB, mBB, mStick]) m.count = L;
  for (let i = 0; i < L; i++) {
    rungA.setColorAt(i, _col.set(BASE_HEX[cur[i]]));
    rungB.setColorAt(i, _col.set(BASE_HEX[COMP[cur[i]]]));
    mStick.setColorAt(i, _col.set(BASE_HEX[cur[i] === 'T' ? 'U' : cur[i]]));
  }
  rungA.instanceColor.needsUpdate = rungB.instanceColor.needsUpdate = mStick.instanceColor.needsUpdate = true;

  // Kodon etiketleri
  for (let c = 0; c < MAX_CH; c++) {
    const ch = chunks[c];
    const [lc, lt, lm] = [pools.cod[c], pools.tpl[c], pools.mrna[c]];
    lc.visible = lt.visible = lm.visible = !!ch;
    if (!ch) continue;
    const x = (xOf(ch.a) + xOf(ch.b - 1)) / 2;
    const str = cur.slice(ch.a, ch.b);
    lc.position.set(x, YD + 1.95, 0); lt.position.set(x, YD - 1.95, 0); lm.position.set(x, YM - 0.72, 0);
    lc.setText(colored(str));
    lt.setText(colored([...str].map((b) => COMP[b]).join('')));
    lm.setText(colored(str, true));
    const mutated = str !== orig.slice(ch.a, ch.b);
    const dim = ch.kind === 'utr' || ch.kind === 'part';
    for (const l of [lc, lt, lm]) {
      l.el.style.opacity = dim ? '0.5' : '1';
      l.el.style.borderColor = mutated ? '#f97316' : ch.kind === 'stop' ? '#ef4444' : '';
      l.el.style.background = mutated ? 'rgba(249,115,22,.25)' : '';
    }
  }
  hiChunk = -1;

  const x0 = xOf(0) , x1 = xOf(L - 1);
  titles.dna.position.set(x0 - 2.3, YD, 0);
  titles.mrna.position.set(x0 - 2.3, YM, 0);
  titles.prot.position.set(x0 - 2.3, YP, 0);
  titles.orig.position.set(x0 - 2.3, YO, 0);
  titles.cod.position.set(x0 - 2.3, YD + 1.95, 0);
  titles.tpl.position.set(x0 - 2.3, YD - 1.95, 0);
  titles.nuc.position.set(x0 - 2.3, 3.15, 0);
  titles.cyt.position.set(x0 - 2.3, 2.55, 0);
  const endDefs = [["5'", x0 - 0.75, YD + 1.95], ["3'", x1 + 0.75, YD + 1.95], ["3'", x0 - 0.75, YD - 1.95], ["5'", x1 + 0.75, YD - 1.95], ["5'", x0 - 0.75, YM - 0.72], ["3'", x1 + 0.75, YM - 0.72]];
  endDefs.forEach(([t, x, y], i) => { ends[i].setText(t); ends[i].position.set(x, y, 0); });

  // Orijinal protein satırı (yalnız mutasyon varsa)
  const po = cls.po;
  const showOrig = cur !== orig;
  titles.orig.visible = showOrig;
  origBeads.count = showOrig ? Math.min(po.aa.length, MAX_AA) : 0;
  for (let j = 0; j < MAX_AA; j++) {
    const l = pools.orig[j];
    l.visible = showOrig && j < po.aa.length;
    if (!l.visible) continue;
    const a = po.aa[j], x = xOf(po.pos[j] + 1);
    _a.set(x, YO, 0);
    setBall(origBeads, j, _a, 0.19);
    origBeads.setColorAt(j, _col.set(CLASS_HEX[AA[a][2]]));
    l.position.set(x, YO - 0.48, 0);
    l.setText(aaShort(a));
    l.el.style.color = CLASS_HEX[AA[a][2]];
  }
  origBeads.instanceMatrix.needsUpdate = true;
  if (origBeads.instanceColor) origBeads.instanceColor.needsUpdate = true;

  // Güncel protein boncuk renkleri
  for (let j = 0; j < Math.min(prot.aa.length, MAX_AA); j++) chain.setColorAt(j, _col.set(CLASS_HEX[AA[prot.aa[j]][2]]));
  chain.instanceColor.needsUpdate = true;

  selBox.position.set(xOf(sel), YD, 0);
  selBoxM.position.set(xOf(sel), YM + 0.2, 0);
  dnaDirty = mDirty = true;
}

function updateDNA() {
  dnaDirty = false;
  for (let i = 0; i < L; i++) {
    const x = xOf(i), th = i * TWIST, o = open[i], r = RAD * (1 - o);
    const cy = Math.cos(th) * r, sz = Math.sin(th) * r, cyB = -Math.cos(th - GROOVE) * r, szB = -Math.sin(th - GROOVE) * r;
    _a.set(x, YD + cy + o * 0.95, sz);
    _b.set(x, YD + cyB - o * 0.95, szB);
    setBall(bbA, i, _a, 0.15);
    setBall(bbB, i, _b, 0.15);
    const my = YD + (cy + cyB) / 2, mz = (sz + szB) / 2;
    _c.set(x, my + o * 0.42, mz); setSeg(rungA, i, _a, _c, 0.075);
    _c.set(x, my - o * 0.42, mz); setSeg(rungB, i, _b, _c, 0.075);
  }
  // Pürüzsüz omurga çizgileri
  const pa = lineA.userData.pts, pb = lineB.userData.pts;
  const n = (L - 1) * SUB + 1;
  for (let q = 0; q < n; q++) {
    const t = q / SUB, i = Math.min(Math.floor(t), L - 2), f = t - i;
    const o = lerp(open[i], open[i + 1] ?? open[i], f), th = t * TWIST, x = (t - (L - 1) / 2) * D;
    const r = RAD * (1 - o), cy = Math.cos(th) * r, sz = Math.sin(th) * r;
    pa[q * 3] = x; pa[q * 3 + 1] = YD + cy + o * 0.95; pa[q * 3 + 2] = sz;
    pb[q * 3] = x; pb[q * 3 + 1] = YD - Math.cos(th - GROOVE) * r - o * 0.95; pb[q * 3 + 2] = -Math.sin(th - GROOVE) * r;
  }
  lineA.userData.update(n); lineB.userData.update(n);
  for (const m of [bbA, bbB, rungA, rungB]) { m.instanceMatrix.needsUpdate = true; m.boundingSphere = null; }
}

function updateMRNA() {
  mDirty = false;
  const pm = lineM.userData.pts;
  let formed = 0, contiguous = true;
  for (let i = 0; i < L; i++) {
    const t = mProg[i], x = xOf(i);
    if (t <= 0) {
      _a.set(x, YM, 0);
      setBall(mBB, i, _a, 1e-4); _c.set(x, YM + 1e-3, 0); setSeg(mStick, i, _a, _c, 1e-4);
      contiguous = false;
      continue;
    }
    const e = ease(t);
    _a.set(x, lerp(YD - 0.7, YM, e), lerp(0.55, 0, e));
    setBall(mBB, i, _a, 0.11);
    _c.set(_a.x, _a.y + 0.45, _a.z);
    setSeg(mStick, i, _a, _c, 0.07);
    if (contiguous && t >= 1) { pm[formed * 3] = x; pm[formed * 3 + 1] = YM; pm[formed * 3 + 2] = 0; formed++; } else contiguous = false;
  }
  lineM.userData.update(formed);
  for (const m of [mBB, mStick]) { m.instanceMatrix.needsUpdate = true; m.boundingSphere = null; }
}

// --- Aşamalar ---
function setStage(html) { stageLbl.setText(html); }

function hideMachines() {
  pol.visible = ribSmall.visible = ribLarge.visible = ribLbl.visible = rf.visible = false;
  trnas.forEach((t) => { t.g.visible = false; t.k = -1; });
}

function startPipeline() {
  hideMachines();
  stage = 'tx';
  polPos = -2;
  open.fill(0); mProg.fill(0);
  k = 0; u = 0; relT = 0;
  chain.count = 0; rings.count = 0;
  pools.prot.forEach((l) => (l.visible = false));
  highlight(-1);
  setStage('1️⃣ <b>Transkripsiyon</b>: RNA polimeraz DNA\'dan mRNA kopyası yazıyor');
  dnaDirty = mDirty = true;
}

function beginScan() {
  if (prot.start < 0) {
    stage = 'done';
    setStage('⛔ mRNA\'da <b>AUG</b> yok: ribozom başlayamadı, protein yapılamadı');
    sim.toast('Başlangıç kodonu (AUG) yok → protein yok', 'bad');
    showResult();
    return;
  }
  stage = 'scan';
  scanT = 0;
  scanDur = 1.2 + prot.start * 0.08;
  setStage('2️⃣ <b>Ribozom</b> mRNA\'ya bağlanıp ilk <b>AUG</b>\'yu arıyor');
}

function beginTranslation() {
  stage = 'tl';
  k = 0; u = 0;
  setStage('3️⃣ <b>Translasyon</b>: tRNA\'lar kodona uyan amino asidi getiriyor');
}

function advance() {
  if (k < prot.aa.length) { k++; return; }
  stage = 'rel';
  relT = 0;
  highlight(-1);
  setStage(prot.stop ? '4️⃣ <b>DUR</b> kodonu: protein serbest kalıyor'
    : '⚠️ DUR kodonu yok: ribozom mRNA\'nın sonunda takıldı, zincir yine de ayrılıyor');
}

function finishDone() {
  stage = 'done';
  hideMachines();
  showResult();
  const n = prot.aa.length;
  setStage(n ? `✅ Protein hazır: <b>${n}</b> amino asit` + (cur !== orig ? ` · <span style="color:${toneHex(cls.tone)}">${cls.title}</span>` : '')
    : '⛔ Protein yapılamadı');
  if (cur !== orig) sim.toast(`${cls.title}`, cls.tone);
}

function finishInstant() {
  hideMachines();
  open.fill(0); mProg.fill(1);
  dnaDirty = mDirty = true;
  k = prot.aa.length; relT = 1;
  stage = 'done';
  highlight(-1);
  showResult();
  const n = prot.aa.length;
  setStage(prot.start < 0 ? '⛔ mRNA\'da AUG yok: protein yapılamadı' : `✅ Protein: <b>${n}</b> amino asit` + (cur !== orig ? ` · <span style="color:${toneHex(cls.tone)}">${cls.title}</span>` : ''));
}
const toneHex = (t) => (t === 'bad' ? '#f87171' : t === 'warn' ? '#fbbf24' : t === 'good' ? '#4ade80' : '#e5ecf6');

/** Protein boncuklarını kodonlarının altına diz, etiketleri ve değişim halkalarını göster. */
function showResult() {
  const n = Math.min(prot.aa.length, MAX_AA);
  chain.count = n;
  let r = 0;
  for (let j = 0; j < MAX_AA; j++) {
    const l = pools.prot[j];
    l.visible = j < n;
    if (j >= n) continue;
    const a = prot.aa[j], x = codonX(j);
    _a.set(x, YP, 0);
    setBall(chain, j, _a, 0.24);
    l.position.set(x, YP - 0.52, 0);
    const changed = cur !== orig && cls.changed.has(j);
    l.setText(changed ? `<b>${aaShort(a)}</b>` : aaShort(a));
    l.el.style.color = CLASS_HEX[AA[a][2]];
    l.el.style.textDecoration = changed ? 'underline' : '';
    if (changed) { _s.setScalar(0.34); _m.compose(_a, QI, _s); rings.setMatrixAt(r++, _m); }
  }
  rings.count = r;
  chain.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = true;
  chain.boundingSphere = null;
}

function highlight(c) {
  if (hiChunk >= 0 && pools.mrna[hiChunk]) pools.mrna[hiChunk].el.style.outline = '';
  hiChunk = c;
  if (c >= 0 && pools.mrna[c]) pools.mrna[c].el.style.outline = '2px solid #a78bfa';
}
const chunkOfNt = (i) => chunks.findIndex((ch) => i >= ch.a && i < ch.b);

function configTRNA(t, kk) {
  t.k = kk;
  const a0 = prot.start + 3 * kk;
  const codon = toRNA(cur.slice(a0, a0 + 3));
  const anti = [...codon].map((b) => RNA_COMP[b]).join('');
  t.stubs.forEach((s, i) => s.material.color.set(BASE_HEX[anti[i]]));
  const a = prot.aa[kk];
  t.bead.material.color.set(CLASS_HEX[AA[a][2]]);
  t.label.setText(`${colored(anti)} <span style="color:${CLASS_HEX[AA[a][2]]}">${aaShort(a)}</span>`);
  highlight(chunkOfNt(a0));
}

// --- Güncelleme ---
sim.onUpdate((dt) => {
  if (stage === 'tx') {
    polPos += dt * TX_RATE;
    for (let i = 0; i < L; i++) {
      open[i] = smoothstep(0, 1, 1 - Math.abs(i - polPos) / 4.5);
      mProg[i] = clamp((polPos - i) / 5, 0, 1);
    }
    dnaDirty = mDirty = true;
    if (polPos >= L + 5) { open.fill(0); mProg.fill(1); beginScan(); }
  } else if (stage === 'scan') {
    scanT += dt;
    if (scanT >= scanDur) beginTranslation();
  } else if (stage === 'tl') {
    u += dt / STEP;
    while (u >= 1 && stage === 'tl') { u -= 1; advance(); }
  } else if (stage === 'rel') {
    relT += dt / 1.8;
    if (relT >= 1) finishDone();
  }
});

const _from = new THREE.Vector3(), _dock = new THREE.Vector3();
function chainPos(j, n, xr, out) {
  const back = n - 1 - j;
  return out.set(xr - 0.4 - back * 0.42, YM + 2.1 + 0.14 * Math.sin(back * 1.3), 0.15);
}

sim.onRender((rdt) => env.update(Math.min(rdt || 0.016, 0.05)));
sim.onRender(() => {
  if (dnaDirty) updateDNA();
  if (mDirty) updateMRNA();

  pol.visible = stage === 'tx';
  if (pol.visible) pol.position.set(xOf(clamp(polPos, 0, L - 1)), YD, 0);

  const ribOn = stage === 'scan' || stage === 'tl' || stage === 'rel';
  ribSmall.visible = ribLarge.visible = ribLbl.visible = ribOn;
  if (!ribOn) return meterUpdate();

  let xr = 0, sep = 0, fade = 1;
  const nAA = prot.aa.length;
  if (stage === 'scan') {
    const a = ease(clamp(scanT / 1.0, 0, 1));
    const s2 = ease(clamp((scanT - 1.0) / Math.max(0.01, scanDur - 1.0), 0, 1));
    xr = lerp(xOf(Math.min(1, L - 1)), stepX(0), s2);
    sep = 1 - a; fade = a;
  } else if (stage === 'tl') {
    xr = k >= nAA || u < 0.6 ? stepX(k) : lerp(stepX(k), stepX(k + 1), ease((u - 0.6) / 0.4));
  } else {
    xr = stepX(k);
    sep = ease(relT); fade = 1 - relT;
  }
  ribSmall.position.set(xr, YM - 0.2 - sep * 2.0, 0);
  ribLarge.position.set(xr, YM + 1.15 + sep * 2.5, 0);
  ribSmall.material.opacity = 0.7 * fade;
  ribLarge.material.opacity = 0.55 * fade;
  ribLbl.position.set(xr + 1.9, YM + 1.5 + sep * 2.5, 0);

  // tRNA'lar ve salıverme faktörü
  const tIn = trnas[k % 2], tOut = trnas[(k + 1) % 2];
  if (stage === 'tl' && k < nAA) {
    if (tIn.k !== k) configTRNA(tIn, k);
    const xc = stepX(k);
    _dock.set(xc, YM + 0.47, 0);
    _from.set(xc + 2.6, YM + 2.3, 2.6);
    tIn.g.position.lerpVectors(_from, _dock, ease(clamp(u / 0.45, 0, 1)));
    tIn.g.visible = true;
    tIn.bead.visible = u < 0.55;
  } else tIn.g.visible = false;
  if (stage === 'tl' && k >= 1 && u < 0.5 && tOut.k === k - 1) {
    const xc = stepX(k - 1);
    _dock.set(xc, YM + 0.47, 0);
    _from.set(xc - 2.4, YM + 2.4, 2.2);
    tOut.g.position.lerpVectors(_dock, _from, ease(u / 0.5));
    tOut.g.visible = true;
    tOut.bead.visible = false;
  } else tOut.g.visible = false;

  rf.visible = (stage === 'tl' && k >= nAA) || (stage === 'rel' && relT < 0.6);
  if (rf.visible) {
    const xc = stepX(k);
    _dock.set(xc, YM + 0.95, 0.1);
    _from.set(xc + 2.6, YM + 2.3, 2.6);
    if (stage === 'tl') { rf.position.lerpVectors(_from, _dock, ease(clamp(u / 0.45, 0, 1))); if (u < 0.05) highlight(chunkOfNt(prot.start + 3 * k)); }
    else rf.position.lerpVectors(_dock, _from, relT / 0.6);
    rf.rotation.y += 0.03;
  }

  // Büyüyen zincir → serbest kalınca kodonlarının altına iner
  const n = Math.min(MAX_AA, stage === 'scan' ? 0 : stage === 'tl' ? k + (k < nAA && u >= 0.55 ? 1 : 0) : nAA);
  chain.count = n;
  for (let j = 0; j < n; j++) {
    chainPos(j, n, xr, _a);
    if (stage === 'rel') { _b.set(codonX(j), YP, 0); _a.lerp(_b, ease(relT)); }
    setBall(chain, j, _a, stage === 'rel' ? lerp(0.21, 0.24, relT) : 0.21);
  }
  chain.instanceMatrix.needsUpdate = true;
  chain.boundingSphere = null;
  meterUpdate();
});
sim.onRender(() => {
  syncPep(lineP, chain, chain.visible ? chain.count : 0);
  syncPep(lineO, origBeads, titles.orig.visible ? origBeads.count : 0);
});

function meterUpdate() {
  if (++meterTick % 6) return;
  const nAA = Math.max(1, prot.aa.length + 1);
  const v = stage === 'tx' ? clamp(polPos / (L + 5), 0, 1) * 0.35 : stage === 'scan' ? 0.38 : stage === 'tl' ? 0.4 + 0.5 * (k + u) / nAA
    : stage === 'rel' ? 0.9 + 0.1 * relT : 1;
  stageMeter.set(v, STAGE_SHORT[stage] || '—');
}

// --- Dizi işlemleri ---
function applySequence(seq, { frame: doFrame = false, instant = false } = {}) {
  cur = seq;
  L = cur.length;
  prot = translate(cur);
  cls = classify(orig, cur);
  sel = clamp(sel, 0, L - 1);
  buildChunks();
  layoutStatic();
  updatePanel();
  if (doFrame) frame();
  if (mode.value === 'aninda' || instant) finishInstant(); else startPipeline();
}

function frame() {
  const cam = sim.camera, t = Math.tan((cam.fov * Math.PI) / 360), aspect = cam.aspect || 1.3;
  const dist = Math.max(14.5 / (2 * t), (L * D + 7.5) / aspect / (2 * t));
  const d = dist * 0.94;
  sim.moveCamera([-0.3 - d * 0.16, 2.2 + d * 0.16, d * 0.98], [-0.3, 2.0, -0.5]);
}

function loadGene(key) {
  meta = GENES[key];
  orig = meta.random ? randomGene() : meta.seq;
  sel = meta.sel;
  seqInput.value = orig;
  applySequence(meta.mut || orig, { frame: true });
}

function setSel(i) {
  sel = clamp(i, 0, L - 1);
  selBox.position.set(xOf(sel), YD, 0);
  selBoxM.position.set(xOf(sel), YM + 0.2, 0);
  posSlider.set(sel + 1);
  updateSelInfo();
}

function describeSub(before, after, i) {
  const p = translate(before);
  if (p.start < 0 || i < p.start) return '';
  const j = Math.floor((i - p.start) / 3), a0 = p.start + 3 * j;
  if (a0 + 3 > before.length) return '';
  const c0 = before.slice(a0, a0 + 3), c1 = after.slice(a0, a0 + 3);
  const n0 = aaNameOf(c0), n1 = aaNameOf(c1);
  return `${j + 1}. kodon: ${toRNA(c0)} → ${toRNA(c1)} · ${n0} → ${n1}`;
}
function aaNameOf(c) { const t = translate('ATG' + c); return t.aa.length > 1 ? aaName(t.aa[1]) : 'DUR'; }

function edit(kind) {
  const b = baseSeg.value;
  let s = cur;
  if (kind === 'nokta') {
    if (cur[sel] === b) { sim.toast(`Bu konumda zaten ${b} var; başka bir baz seç.`, 'warn'); return; }
    s = cur.slice(0, sel) + b + cur.slice(sel + 1);
    const d = describeSub(cur, s, sel);
    sim.toast(`🔁 ${sel + 1}. harf: ${cur[sel]} → ${b}${d ? '<br>' + d : ''}`);
  } else if (kind === 'ekle') {
    if (L >= MAX_NT) { sim.toast(`En fazla ${MAX_NT} harf.`, 'warn'); return; }
    s = cur.slice(0, sel) + b + cur.slice(sel);
    sim.toast(`➕ ${sel + 1}. konuma ${b} eklendi`);
  } else {
    if (L <= 6) { sim.toast('Dizi çok kısa.', 'warn'); return; }
    s = cur.slice(0, sel) + cur.slice(sel + 1);
    sim.toast(`➖ ${sel + 1}. harf (${cur[sel]}) silindi`);
  }
  applySequence(s);
}

function randomMutation() {
  const i = randInt(0, L - 1);
  sel = i;
  const r = Math.random();
  if (r < 0.7 || L >= MAX_NT || L <= 6) {
    const b = pick('ACGT'.replace(cur[i], '').split(''));
    baseSeg.set(b);
    edit('nokta');
  } else {
    baseSeg.set(pick(['A', 'C', 'G', 'T']));
    edit(r < 0.85 ? 'ekle' : 'sil');
  }
}

/** Orijinal genden istenen türde tek harflik bir mutasyon bulur. */
function example(type) {
  const po = translate(orig);
  if (po.start < 0) { sim.toast('Orijinal dizide AUG yok.', 'warn'); return; }
  const lo = po.start + 3, hi = po.stop ? po.stopAt : orig.length - 1;
  const cands = [];
  if (type === 'frameshift') {
    for (let p = lo; p < hi; p++) {
      cands.push([p, orig.slice(0, p) + orig.slice(p + 1)]);
      cands.push([p, orig.slice(0, p) + pick(['A', 'C', 'G', 'T']) + orig.slice(p)]);
    }
  } else {
    for (let p = lo; p < hi; p++) {
      for (const b of 'ACGT') {
        if (b === orig[p]) continue;
        const s = orig.slice(0, p) + b + orig.slice(p + 1);
        if (classify(orig, s).type === type) cands.push([p, s]);
      }
    }
  }
  if (!cands.length) { sim.toast('Bu gende böyle tek harflik bir değişiklik bulunamadı.', 'warn'); return; }
  const [p, s] = pick(cands);
  sel = p;
  if (s.length === orig.length) {
    const d = describeSub(orig, s, p);
    sim.toast(`${p + 1}. harf: ${orig[p]} → ${s[p]}${d ? '<br>' + d : ''}`);
  } else sim.toast(`${p + 1}. konumda bir harf ${s.length > orig.length ? 'eklendi' : 'silindi'}`);
  applySequence(s);
}

// --- Arayüz ---
const ui = sim.ui;
// Not: ana sayfadaki .card kuralı (flex sütun) panel kartlarına da uyuyor; satır içi stille düzelt.
function card() { const t = ui.text('', 'card'); Object.assign(t.el.style, { display: 'block', transform: 'none', overflow: 'visible', lineHeight: '1.5' }); return t; }
ui.section('Gen tarifi');
ui.select({ label: 'Hazır gen', options: Object.entries(GENES).map(([value, g]) => ({ value, label: g.label })), value: 'orak', onChange: (v) => loadGene(v) });
const inpWrap = document.createElement('div');
inpWrap.className = 'ctl';
inpWrap.innerHTML = '<div class="ctl-top"><span>Kendi dizini yaz (kodlayan zincir, 5\'→3\')</span></div>';
const seqInput = document.createElement('input');
Object.assign(seqInput, { type: 'text', spellcheck: false, value: HBB, maxLength: 80 });
Object.assign(seqInput.style, { ...MONO, width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: '8px', padding: '6px 8px', textTransform: 'uppercase', fontSize: '12px' });
inpWrap.append(seqInput);
ui.append(inpWrap);
function applyInput() {
  const s = seqInput.value.toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
  if (s.length < 6 || s.length > MAX_NT) { sim.toast(`Dizi 6–${MAX_NT} harf olmalı (yalnız A, C, G, T).`, 'warn'); return; }
  orig = s;
  meta = { label: 'Kendi tarifin' };
  sel = Math.min(sel, s.length - 1);
  seqInput.value = s;
  applySequence(s, { frame: true });
  if (!s.startsWith('ATG')) sim.toast('İpucu: gen genellikle ATG ile başlar; ribozom ilk ATG\'yu arar.', 'warn');
}
seqInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyInput(); });
ui.button({ label: '✔️ Diziyi uygula (yeni orijinal)', onClick: applyInput });
const selInfo = card();

ui.section('Mutasyon araçları');
const posSlider = ui.slider({ label: 'Seçili harf (konum)', min: 1, max: HBB.length, step: 1, value: 20, onInput: (v) => setSel(v - 1) });
const baseSeg = ui.segmented({ label: 'Yeni baz', options: ['A', 'T', 'G', 'C'], value: 'T' });
ui.buttons([
  { label: '🔁 Nokta', variant: 'primary', title: 'Seçili harfi yeni bazla değiştir', onClick: () => edit('nokta') },
  { label: '➕ Ekle', title: 'Seçili konuma yeni baz ekle', onClick: () => edit('ekle') },
  { label: '➖ Sil', variant: 'danger', title: 'Seçili harfi sil', onClick: () => edit('sil') },
]);
ui.buttons([
  { label: '🎲 Rastgele mutasyon', onClick: randomMutation },
  { label: '↩️ Orijinale dön', variant: 'good', onClick: () => applySequence(orig) },
]);
ui.text('<b>Örnek bul</b> (orijinal genden tek harf):');
ui.buttons([
  { label: '🤫 Sessiz', onClick: () => example('silent') },
  { label: '🔀 Yanlış anlamlı', onClick: () => example('missense') },
]);
ui.buttons([
  { label: '⛔ Anlamsız', onClick: () => example('nonsense') },
  { label: '↔️ Çerçeve kayması', onClick: () => example('frameshift') },
]);

ui.section('Sonuç');
const resultCard = card();
const stLen = ui.stat({ label: 'Nükleotit' });
const stAA = ui.stat({ label: 'Amino asit' });
const stChg = ui.stat({ label: 'Değişen amino asit' });
const stStop = ui.stat({ label: 'DUR kodonu' });
const protCard = card();

ui.section('Oynatma');
const stageMeter = ui.meter({ label: 'Aşama', color: '#a78bfa' });
const mode = ui.segmented({ label: 'Değişiklikten sonra', options: [{ value: 'anim', label: 'Animasyonla üret' }, { value: 'aninda', label: 'Sonucu hemen göster' }], value: 'anim' });
ui.buttons([
  { label: '▶ Baştan üret', variant: 'primary', onClick: () => startPipeline() },
  { label: '⏩ Sonuca atla', onClick: () => finishInstant() },
]);
ui.toggle({ label: 'Harf etiketleri', value: true, onChange: (v) => {
  for (const key of ['cod', 'tpl', 'mrna']) pools[key].forEach((l, i) => (l.visible = v && !!chunks[i]));
} });

ui.section('Renkler', { open: false });
ui.text(`<b>Bazlar:</b> ${['A', 'T', 'G', 'C', 'U'].map((b) => `<span style="color:${BASE_HEX[b]}">■ ${b}</span>`).join(' ')}
  <br>A–T (RNA'da A–U) ve G–C eşleşir.<br><b>Amino asitler:</b><br>` +
  Object.entries(CLASS_NAME).map(([c, n]) => `<span style="color:${CLASS_HEX[c]}">●</span> ${n}`).join('<br>') +
  '<br><span style="color:#f97316">▢</span> turuncu çerçeve: orijinalden farklı kodon · <span style="color:#ef4444">▢</span> DUR kodonu');

function protHtml(aa, ref) {
  if (!aa.length) return '<i>protein yok</i>';
  return [...aa].map((a, j) => {
    const diff = ref != null && ref[j] !== a;
    return `<span style="color:${CLASS_HEX[AA[a][2]]};${diff ? 'text-decoration:underline;font-weight:700' : ''}">${AA[a][0]}</span>`;
  }).join('–');
}

function updateSelInfo() {
  const b = cur[sel];
  let html = `Seçili: <b>${sel + 1}. harf</b> = <span style="color:${BASE_HEX[b]}"><b>${b}</b></span> (kalıpta ${COMP[b]}, mRNA'da ${b === 'T' ? 'U' : b})`;
  if (prot.start >= 0 && sel >= prot.start) {
    const j = Math.floor((sel - prot.start) / 3), a0 = prot.start + 3 * j;
    if (a0 + 3 <= L) {
      const c = cur.slice(a0, a0 + 3);
      const beyond = prot.stop && a0 > prot.stopAt;
      html += `<br>${j + 1}. kodon ${colored(c, true)} → ${beyond ? 'DUR\'dan sonra (okunmaz)' : aaNameOf(c)} · kodonun ${sel - a0 + 1}. harfi`;
    }
  } else if (prot.start >= 0) html += '<br>Başlangıç kodonundan önce (okunmaz)';
  selInfo.set(html);
}

function updatePanel() {
  posSlider.input.max = L;
  posSlider.set(sel + 1);
  updateSelInfo();
  let html = `<b style="color:${toneHex(cls.tone)}">${cls.title}</b><br>${cls.text}`;
  if (meta.hbb && cls.type === 'missense') {
    const j = [...cls.changed][0];
    html += `<br><small>Not: β-globinde ilk Met olgun proteinden çıkarılır; buradaki ${j + 1}. amino asit tıpta <b>${j}. konum</b> olarak geçer`
      + (cls.pc.aa[j] === 'V' && cls.po.aa[j] === 'E' && j === 6 ? ' → <b>Glu6Val = orak hücre (HbS)</b>. Glutamik asit (−, suyu sever) yerine Valin (suyu sevmez) gelince hemoglobinler oksijensiz ortamda birbirine yapışır.' : '.') + '</small>';
  }
  resultCard.set(html);
  stLen.set(L);
  stAA.set(prot.aa.length);
  stChg.set(cur === orig ? 0 : cls.changed.size, cur === orig || !cls.changed.size ? '' : cls.changed.size > 2 ? 'bad' : 'warn');
  stStop.set(prot.start < 0 ? '—' : prot.stop ? 'var' : 'yok', prot.stop ? 'good' : 'bad');
  const names = prot.aa.length ? [...prot.aa].map((a) => AA[a][1]).join(', ') : '';
  protCard.set((cur !== orig ? `<b>Orijinal:</b> ${protHtml(cls.po.aa)}<br>` : '') + `<b>Şimdiki:</b> ${protHtml(prot.aa, cur !== orig ? cls.po.aa : null)}`
    + (names ? `<br><small>${names}</small>` : ''));
}

// DNA / mRNA basamağına ya da protein boncuğuna tıkla
sim.onClick(() => [rungA, rungB, bbA, bbB, mStick, mBB, chain], (hit) => {
  const id = hit.instanceId;
  if (id == null) return;
  if (hit.object === chain) {
    const a = prot.aa[id];
    if (a) sim.toast(`<b>${id + 1}. amino asit: ${AA[a][1]}</b> (${AA[a][0]}) · ${CLASS_NAME[AA[a][2]]}<br>kodon ${toRNA(cur.slice(prot.pos[id], prot.pos[id] + 3))}`);
    return;
  }
  setSel(id);
});

sim.onReset(() => { if (mode.value === 'aninda') finishInstant(); else startPipeline(); });
loadGene('orak');
