// Arı Kolonisi — kraliçe, işçiler, bal-polen ve mevsimler; koloniyi kıştan sağ çıkar.
// Görsel: gerçek ölçek (metre). Önde cam kenarlı gözlem kovanı (tek petek çerçevesi, 5,4 mm gözler),
// arkada Langstroth kovanı, ardında çayır; gökyüzü/ışık mevsime göre değişir.
import { createSim, THREE, BufferGeometryUtils, clamp, lerp, seeded, fmt, rand, smoothstep, procedural, mat, RoundedBoxGeometry,
  landscape, createTerrain, terrainSkirt, terrainMaterial, createVegetation, instanced } from '@core';
import * as M from './model.js';
import { softDot, treeGeometry, leafMat, barkMat } from './kit.js';

const DAYS_PER_SEC = 2;
const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
// Langstroth kovanı (dış ölçü 50,8 × 41,3 cm), uçuş deliği +x yüzünde
const HIVE = new THREE.Vector3(0.55, 0, -1.2);
// Çiçek öbeklerinin merkezleri (çayır otu bu öbeklerin içine girmez, çiçekler otun ardında kaybolmasın)
const FLOWER_PATCHES = [[1.6, -2.9], [2.8, -4.3], [0.4, -4.8], [3.8, -2.3], [1.7, -6.4], [-1.2, -3.4], [4.6, -5.8], [-2.6, -5.6], [0.2, -8.2]];
// Arılık: kovanın ardında, uçuş delikleri aynı yöne (+x) bakan bir sıra kovan (renkli boya, arıların kendi kovanını bulmasına yardım eder)
const APIARY = [[-3.1, -11.2, 0x7fa6c8], [-1.7, -11.5, 0xe2c25a], [-0.3, -11.3, 0xe9e4d6], [1.1, -11.6, 0x8fb07a], [2.5, -11.4, 0xd88a5a]];
// Kır çiçeği öbekleri (çayırın içinde, otun seyrek olduğu lekeler): [x, z, yarıçap, tür]
const WILD_DRIFTS = (() => {
  const r = seeded(83), out = [];
  for (let i = 0; i < 46; i++) {
    const x = -22 + r() * 44, z = -28 + r() * 25, rad = 1.2 + r() * 2.6;
    if (Math.hypot(x - HIVE.x, z - HIVE.z) < 3.2 || (Math.abs(z + 11.4) < 1.6 && Math.abs(x) < 4)) continue;
    out.push([x, z, rad, i % 8]);
  }
  // kovanın hemen önünde, kameranın gördüğü ilkbahar öbekleri (dağ lalesi, arı çiçeği, karahindiba)
  out.push([2.6, -3.6, 1.5, 0], [-1.3, -4.6, 1.4, 1], [4.3, -6.0, 1.9, 2], [1.0, -7.4, 2.0, 0], [-2.9, -7.3, 1.8, 1], [5.6, -3.1, 1.3, 2], [3.2, -9.0, 2.2, 1], [-0.8, -10.0, 1.8, 2]);
  return out;
})();
const STAND_H = 0.36;
const ENTR = new THREE.Vector3(HIVE.x + 0.3, STAND_H + 0.035, HIVE.z);

const sim = createSim({
  sky: { elevation: 48, azimuth: 150, clouds: 0.3, haze: 1.2, visibility: 16000 },
  shadows: true, shadowSize: 8,
  camera: { position: [0.05, 1.22, 1.05], target: [0.35, 0.78, -1.1], fov: 45, near: 0.04, far: 40000 },
  controls: { minDistance: 0.15, maxDistance: 40 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Önde <b>gözlem kovanı</b> var: iki yanı cam, içinde tek bir petek çerçevesi. Kovanın içini böyle görürüz.
    Arkada arıların yaşadığı <b>kovan</b> (Langstroth tipi), onun ardında çayır var. Her şey gerçek boyutunda:
    bir petek gözü 5,4 mm, bir işçi arı 1,3 cm. Her altıgen gözün içinde bir şey saklanır:</p>
    <ul>
      <li>⚪ <b>Yumurta</b> → 🐛 <b>larva</b> → 🟫 <b>kapalı yavru</b> (pupa). Yumurtadan işçi arı çıkması <b>21 gün</b> sürer.</li>
      <li>🟠 <b>Bal</b> (nektardan yapılır; olgunlaşınca üstü balmumuyla sırlanır) ve 🟡 <b>polen</b> (arıların protein kaynağı, larvaları besler).</li>
    </ul>
    <p><b>Kraliçe 👑</b> yazın günde 1.500–2.000 yumurta bırakabilir. Genç işçiler kovanda bakıcılık yapar, büyüyünce
    <b>tarlacı</b> olup çiçeklere uçar. İyi çiçek bulan arı kovanda <b>sallanma dansı</b> yapar: dansın açısı çiçeklerin güneşe göre yönünü söyler!</p>
    <p>Kışın arılar uçmaz; birbirine sokulup <b>kış salkımı</b> olur, kaslarını titreterek ısınır ve yazın biriktirdikleri balı yer.
    Yaz arısı 5–6 hafta, kış arısı birkaç ay yaşar.</p>
    <h3>Dene</h3>
    <ul>
      <li>Çiçek sayısını azalt: bal yetmezse koloni kışı çıkaramaz.</li>
      <li>Arıcı hasadını %100 yap: bütün balı alırsan ne olur? Şeker şurubu vererek kurtarabilir misin?</li>
      <li>Varroa akarını aç ve sonbaharda <b>🧪 Varroa ilacı</b> düğmesine bas.</li>
      <li>Pestisiti aç: tarlacı arılar daha kısa yaşar ve yolunu kaybeder.</li>
      <li><b>Petek yakından</b> görünümüne geç: yavru alanı ortada, bal üst köşelerde birikir.</li>
    </ul>
    <p><small>Sayılar basitleştirilmiş bir nüfus modelinden gelir (gerçek kovanlara yakın ama temsili). Bir yıl = 360 gün.
    Uçan tarlacılar görünsün diye 1,6 kat büyük çizildi; petekteki arılar gerçek boyutta.</small></p>`,
});

// --- Model durumu ---
const O = { flowers: 150, rainChance: 0.2, pesticide: false, varroa: false, harvestFrac: 0.3 };
let col, rng, dayAcc = 0, lastSeason = -1, ended = false;
const scene = sim.scene;
const dummy = new THREE.Object3D();

// --- Arazi: kovan çevresi düz çayır, uzakta tepeler ---
const roll = landscape({ seed: 17, size: 260, height: 5, octaves: 4, warp: 0.3 });
const hills = landscape({ seed: 23, size: 2400, height: 260, octaves: 6, warp: 0.4 });
function hW(x, z) {
  const r = Math.hypot(x, z);
  let h = 0;
  const a = smoothstep(18, 160, r);
  if (a > 0) h += (roll(x, z) + 1) * a;
  const b = smoothstep(900, 5000, r);
  if (b > 0) h += Math.max(0, hills(x, z) + 60) * b;
  return h;
}
const landMat = terrainMaterial({ water: -50, forest: 0.3, grass: 0x5f7a2e, dry: 0x8a8a4a, soil: 0x55682c, grassAmount: 1 });
const TU = landMat.userData.terrain;
scene.add(createTerrain(hW, { size: [400, 400], res: LOW ? [150, 150] : [220, 220], material: landMat }));
scene.add(createTerrain((x, z) => hW(x, z) - 0.8 * Math.min(smoothstep(200, 185, Math.abs(x)), smoothstep(200, 185, Math.abs(z))),
  { size: [24000, 24000], res: LOW ? [170, 170] : [240, 240], material: landMat }));
scene.add(terrainSkirt(hW, { inner: 11500, outer: 30000, material: landMat }));
const veg = createVegetation(hW, {
  rect: [-4000, -4000, 4000, 4000], trees: LOW ? 2200 : 5000, shrubs: LOW ? 500 : 1400, rocks: 40, seed: 9, water: -50,
  kinds: { broad: 0.6, pine: 0.25, cypress: 0.15 }, leafA: 0x3e5a26, leafB: 0x6e7c35,
  forest: (x, z) => { const r = Math.hypot(x, z); return r < 45 ? 0 : 0.25 + 0.45 * smoothstep(45, 400, r); },
});
scene.add(veg.group);

// Meyve bahçesi: kovanın ardında sıra sıra meyve ağaçları (yaprak kartlı, tam yoğunluk), iki yanda çerçeveleyen iri ağaçlar
const TREES = [];
{
  const kinds = [treeGeometry('fruit', 3, { dens: 1 }), treeGeometry('fruit', 9, { dens: 1 }), treeGeometry('fruit', 14, { dens: 1 }), treeGeometry('oak', 5, { dens: 1 })];
  const leaf = leafMat(0x4f6e2c), bark = barkMat(0x5a4632);
  const spots = [[-6.5, -6.5, 3, 1.1], [9.5, -9, 3, 1.0]];
  for (let row = 0; row < 3; row++) for (let i = -3; i <= 3; i++) {
    const x = i * 6.5 + (row % 2) * 3.2 + Math.sin(i * 3.1 + row) * 0.6, z = -22 - row * 7 + Math.cos(i * 1.7) * 0.5;
    spots.push([x, z, (i + row + 9) % 3, 0.85 + ((i * 7 + row * 3) % 5) * 0.06]);
  }
  const per = kinds.map(() => []);
  spots.forEach((sp, k) => per[sp[2]].push(sp));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const cc = new THREE.Color();
  per.forEach((list, k) => {
    if (!list.length) return;
    const tr = new THREE.InstancedMesh(kinds[k].trunk, bark, list.length), cr = new THREE.InstancedMesh(kinds[k].crown, leaf, list.length);
    list.forEach(([x, z, , s], i) => {
      m4.compose(v.set(x, hW(x, z) - 0.05, z), q.setFromAxisAngle(up, x * 1.7 + z), sc.set(s, s * (0.92 + 0.1 * Math.sin(x)), s));
      tr.setMatrixAt(i, m4); cr.setMatrixAt(i, m4);
      cr.setColorAt(i, cc.setHSL(0.24 + 0.03 * Math.sin(x * 2.1 + z), 0.35, 0.72 + 0.12 * Math.cos(x + z * 0.7)));
    });
    for (const m of [tr, cr]) { m.castShadow = m.receiveShadow = true; m.userData.noFit = true; scene.add(m); TREES.push(m); }
  });
  TREES.leaf = leaf;
}
// Çayır otu (motor çim öbekleri): kovan önü ve çiçek öbekleri dışında, 3–28 m halkada gür ve dalgalanan
const meadowH = (x, z) => {
  const dh = Math.min(Math.hypot(x - HIVE.x, z - HIVE.z), Math.hypot(x + 0.5, z - 0.1), Math.hypot(x - 0.3, z - 0.3));
  const df = Math.min(...FLOWER_PATCHES.map(([px, pz]) => Math.hypot(x - px, z - pz)));
  const dw = WILD_DRIFTS.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr * 0.55);
  const da = APIARY.some(([px, pz]) => Math.hypot(x - px, z - pz) < 0.75);
  return dh < 2.6 || df < 2.2 || dw || da ? -100 : hW(x, z);
};
const meadow = createVegetation(meadowH, {
  rect: [-30, -40, 30, 20], trees: 0, shrubs: 0, rocks: 0, water: -50, seed: 44, grass: LOW ? 16000 : 38000, grassAt: [1, -8, 30], grassFar: 34,
  grassA: 0x4d6a22, grassB: 0x9a9a4c,
});
meadow.group.scale.y = 0.5; // ilkbahar çayırı: otlar henüz kısa, çiçekler üstünde
scene.add(meadow.group);

// Çim öbekleri: kovan önü biçilmiş (kısa), çayır uzun
const NTUFT = LOW ? 3500 : 7000;
const tuftGeo = (() => {
  const gs = [];
  for (let b = 0; b < 9; b++) {
    const g = new THREE.PlaneGeometry(0.028, 1, 1, 3), p = g.attributes.position;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 0.5;
      p.setXYZ(i, p.getX(i) * (1 - y * 0.85), y, 0.22 * y * y);
      const k = 0.62 + 0.5 * y; c.set([k, k * 1.02, k * 0.9], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.rotateX(-0.1 - Math.random() * 0.3); g.rotateY(b * 0.9 + Math.random() * 0.5);
    g.translate((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05);
    gs.push(g);
  }
  const g = BufferGeometryUtils.mergeGeometries(gs);
  g.deleteAttribute('uv');
  return g;
})();
const tuftMat = procedural({
  key: 'ari-tuft', params: { color: 0x5f7a2e, roughness: 0.8, vertexColors: true, side: THREE.DoubleSide },
  pattern: 'col *= 0.75 + 0.5*vn3(p*2.0 + seed*9.0);',
});
const tufts = instanced(tuftGeo, tuftMat, NTUFT);
tufts.frustumCulled = false;
tufts.userData.noCast = true; tufts.userData.noFit = true;
scene.add(tufts);
const tuftData = [];
{
  const r = seeded(31);
  for (let i = 0; i < NTUFT; i++) {
    const a = r() * Math.PI * 2, d = 0.25 + Math.sqrt(r()) * 3.4;   // yalnız kovan önündeki biçilmiş çim
    const x = 0.3 + Math.cos(a) * d, z = -2 + Math.sin(a) * d;
    const nearHive = Math.min(Math.hypot(x - HIVE.x, z - HIVE.z), Math.hypot(x + 0.5, z - 0.1));
    if (nearHive < 0.32) { i--; continue; }
    const mown = 1 - smoothstep(1.2, 2.6, Math.min(nearHive, Math.hypot(x - 0.3, z - 0.3)));
    tuftData.push({ x, z, y: hW(x, z), a: r() * 6.283, h: lerp(0.09 + r() * 0.08, 0.04 + r() * 0.04, mown), w: 0.9 + r() * 0.9 });
  }
}
function updateTufts(k) {
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), m4 = new THREE.Matrix4();
  tuftData.forEach((t, i) => {
    m4.compose(v.set(t.x, t.y - 0.01, t.z), q.setFromEuler(e.set(0, t.a, 0)), s.set(t.w, Math.max(0.01, t.h * k), t.w));
    tufts.setMatrixAt(i, m4);
  });
  tufts.instanceMatrix.needsUpdate = true;
}
updateTufts(1);

// --- Malzemeler ---
function paintedWood(color) {
  return procedural({
    key: 'ari-paint', bump: 0.0006, params: { color, roughness: 0.62 },
    pattern: `
      float g = vn3(vec3(p.x*6.0, p.y*140.0, p.z*6.0) + seed*7.0), n = fbm3(p*9.0, 3);
      col *= 0.9 + 0.08*g + 0.06*n;
      col = mix(col, col*vec3(0.78, 0.72, 0.6), smoothstep(0.62, 0.8, n)*0.5);   // hava lekesi
      rough = 0.55 + 0.2*g; h = g*0.5 + n*0.5;`,
  });
}
const woodM = mat.wood({ color: 0x9a7048, ring: 14 });
const darkWoodM = mat.wood({ color: 0x6b4a2e, ring: 10 });
const tinM = mat.brushedMetal({ color: 0xaeb3b8, rough: 0.42 });
const blackM = new THREE.MeshStandardMaterial({ color: 0x0b0906, roughness: 0.9 });
const box = (w, h, d, m, x, y, z, parent, r = 0.004) => {
  const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), m);
  o.position.set(x, y, z); parent.add(o); return o;
};

let hiveLbl;
// --- Langstroth kovanı: ayaklık, dip tahtası, derin gövde, bal katı, iç kapak, sac örtülü çatı ---
{
  const g = new THREE.Group();
  const L = 0.508, W = 0.413;
  // ayaklık
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.05, STAND_H - 0.04, 0.05, darkWoodM, sx * 0.23, (STAND_H - 0.04) / 2, sz * 0.17, g);
  box(0.6, 0.04, 0.44, darkWoodM, 0.03, STAND_H - 0.02, 0, g);
  // dip tahtası + iniş tahtası
  box(L, 0.022, W, woodM, 0, STAND_H + 0.011, 0, g);
  box(0.09, 0.02, W, woodM, L / 2 + 0.04, STAND_H + 0.01, 0, g);
  box(0.02, 0.02, W, woodM, L / 2 - 0.01, STAND_H + 0.03, 0, g, 0.002); // uçuş deliği daraltıcısı çerçevesi
  const b1 = paintedWood(0xe9e4d6), b2 = paintedWood(0xd9c38a);
  const y1 = STAND_H + 0.022;
  box(L, 0.243, W, b1, 0, y1 + 0.1215, 0, g);                 // derin kuluçka gövdesi
  box(L, 0.168, W, b2, 0, y1 + 0.243 + 0.084, 0, g);          // bal katı (ballık)
  // tutma yuvaları
  for (const [y, hh] of [[y1 + 0.17, 0.028], [y1 + 0.243 + 0.11, 0.024]]) {
    for (const s of [-1, 1]) box(0.12, hh, 0.004, blackM, 0, y, s * (W / 2 + 0.0005), g, 0.0015);
    for (const s of [-1, 1]) box(0.004, hh, 0.12, blackM, s * (L / 2 + 0.0005), y, 0, g, 0.0015);
  }
  // uçuş deliği (karanlık yarık)
  box(0.006, 0.019, 0.3, blackM, L / 2 + 0.0015, STAND_H + 0.033, 0, g, 0.001);
  const yt = y1 + 0.243 + 0.168;
  box(L, 0.012, W, woodM, 0, yt + 0.006, 0, g);                // iç kapak
  const roof = new THREE.Group();
  box(L + 0.05, 0.075, W + 0.05, paintedWood(0xcfc7b4), 0, 0.0375, 0, roof);
  box(L + 0.056, 0.004, W + 0.056, tinM, 0, 0.077, 0, roof, 0.0015);
  box(0.008, 0.06, W + 0.056, tinM, (L + 0.056) / 2, 0.047, 0, roof, 0.0015);
  box(0.008, 0.06, W + 0.056, tinM, -(L + 0.056) / 2, 0.047, 0, roof, 0.0015);
  roof.position.y = yt + 0.012;
  roof.rotation.y = 0.012;
  g.add(roof);
  // üstte duran taş (rüzgâr için)
  const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 2), mat.rock({ color: 0x8a847b }));
  st.scale.set(1.3, 0.6, 1); st.position.set(-0.08, yt + 0.012 + 0.079 + 0.03, 0.05);
  g.add(st);
  g.position.copy(HIVE);
  scene.add(g);
  for (const [x, z, c] of APIARY) {
    const h = g.clone(), pb = paintedWood(c);
    h.traverse((o) => { if (o.material === b1 || o.material === b2) o.material = pb; });
    h.position.set(x, hW(x, z), z); h.rotation.y = (x * 7.3 % 1) * 0.08;
    scene.add(h);
  }
  hiveLbl = sim.label('🏠 Kovan', { position: [HIVE.x, yt + 0.25, HIVE.z], className: 'plain' });
}

// --- Arı geometrisi (metre; baş +z) ---
function beeGeometry(scale = 1) {
  const parts = [];
  const add = (g, c) => {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set(typeof c === 'function' ? c(g.attributes.position, i) : c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(g);
  };
  const head = new THREE.SphereGeometry(0.0019, 12, 8); head.scale(1.05, 0.95, 0.8); head.translate(0, 0.0002, 0.0048);
  add(head, [0.035, 0.03, 0.025]);
  const eye = (s) => { const e = new THREE.SphereGeometry(0.0009, 8, 6); e.scale(0.7, 1.3, 1); e.translate(s * 0.0015, 0.0005, 0.0047); return e; };
  add(eye(1), [0.02, 0.018, 0.015]); add(eye(-1), [0.02, 0.018, 0.015]);
  const thorax = new THREE.SphereGeometry(0.0024, 12, 10); thorax.scale(1, 0.95, 1.05); thorax.translate(0, 0.0004, 0.0012);
  add(thorax, [0.3, 0.2, 0.09]);
  const abd = new THREE.SphereGeometry(0.0024, 16, 12); abd.scale(1, 0.9, 1.8); abd.translate(0, -0.0002, -0.0045);
  add(abd, (p, i) => {
    const t = (p.getZ(i) + 0.0088) / 0.0086; // 0 kuyruk – 1 bel
    if (t < 0.08) return [0.05, 0.035, 0.02];
    const band = (t * 5.2) % 1;
    return band < 0.42 ? [0.06, 0.04, 0.02] : [0.62, 0.36, 0.07];
  });
  const leg = (s, k) => {
    const g = new THREE.CylinderGeometry(0.00022, 0.00016, 0.0065, 4);
    g.translate(0, -0.00325, 0);
    g.rotateZ(s * (0.9 + k * 0.08)); g.rotateX((k - 1) * 0.55);
    g.translate(s * 0.0012, -0.0008, 0.0022 - k * 0.0014);
    return g;
  };
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) add(leg(s, k), [0.05, 0.04, 0.03]);
  const ant = (s) => { const g = new THREE.CylinderGeometry(0.00012, 0.00012, 0.004, 3); g.translate(0, 0.002, 0); g.rotateX(0.9); g.rotateZ(-s * 0.35); g.translate(s * 0.0006, 0.0012, 0.0062); return g; };
  add(ant(1), [0.04, 0.03, 0.02]); add(ant(-1), [0.04, 0.03, 0.02]);
  const g = BufferGeometryUtils.mergeGeometries(parts);
  g.scale(scale, scale, scale);
  return g;
}
function wingGeometry(scale = 1) {
  const w = (s, len, wid, dz, spread) => {
    const g = new THREE.CircleGeometry(1, 16);
    g.scale(wid, len, 1); g.translate(0, -len, 0); g.rotateX(-Math.PI / 2 + 0.12); // kök önde, uç arkada
    g.rotateY(s * spread); g.translate(s * 0.0011, 0.0027, 0.002 + dz);
    g.deleteAttribute('uv');
    return g;
  };
  const g = BufferGeometryUtils.mergeGeometries([w(1, 0.0046, 0.0016, 0, 0.32), w(-1, 0.0046, 0.0016, 0, 0.32), w(1, 0.0032, 0.0012, -0.0012, 0.5), w(-1, 0.0032, 0.0012, -0.0012, 0.5)]);
  g.scale(scale, scale, scale);
  return g;
}
const beeMat = procedural({
  key: 'ari-bee', physical: true, bump: 0.0002,
  params: { color: 0xffffff, vertexColors: true, roughness: 0.6, sheen: 0.8, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xc9a15a) },
  pattern: 'float f = vn3(p*5200.0 + seed*11.0); col *= 0.82 + 0.3*f; rough = 0.5 + 0.35*f; h = f;',
});
const wingMat = new THREE.MeshPhysicalMaterial({
  color: 0xe8eef2, transparent: true, opacity: 0.26, roughness: 0.12, metalness: 0, side: THREE.DoubleSide, depthWrite: false,
  iridescence: 0.7, iridescenceIOR: 1.35, specularIntensity: 1,
});
/** Gövde + saydam kanat: iki InstancedMesh, aynı matris. */
function beeSwarm(n, scale, parent) {
  const body = instanced(beeGeometry(scale), beeMat, n), wing = instanced(wingGeometry(scale), wingMat, n);
  wing.userData.noCast = true;
  body.frustumCulled = wing.frustumCulled = false;
  parent.add(body, wing);
  return {
    set(i, m) { body.setMatrixAt(i, m); wing.setMatrixAt(i, m); },
    set count(c) { body.count = wing.count = c; },
    done() { body.instanceMatrix.needsUpdate = wing.instanceMatrix.needsUpdate = true; },
  };
}
function singleBee(scale) {
  const g = new THREE.Group();
  const w = new THREE.Mesh(wingGeometry(scale), wingMat); w.userData.noCast = true;
  g.add(new THREE.Mesh(beeGeometry(scale), beeMat), w);
  return g;
}
// Petek düzleminde yatan arı: sırtı dışarı (+z), başı a açısına
const flat = (o, a) => { o.rotation.order = 'ZYX'; o.rotation.set(Math.PI / 2, 0, a + Math.PI / 2); };

// --- Gözlem kovanı: tek derin çerçeve, gerçek boy altıgen gözler ---
const CELL_W = 0.0054;                               // işçi gözü, kenardan kenara 5,4 mm
const COMB_C = 80, COMB_R = 44;
const HR = CELL_W / Math.sqrt(3);
const HX = CELL_W, HY = 1.5 * HR;
const combW = COMB_C * HX, combH = COMB_R * HY;       // ≈ 43 × 21 cm
const comb = new THREE.Group();
comb.position.set(-0.5, 0.95, 0.1);
comb.rotation.y = 0.32;
scene.add(comb);
const NC = COMB_C * COMB_R;
const cellData = new Uint8Array(NC * 4);
const cellTex = new THREE.DataTexture(cellData, COMB_C, COMB_R, THREE.RGBAFormat);
cellTex.magFilter = cellTex.minFilter = THREE.NearestFilter;
cellTex.needsUpdate = true;
const combMat = (() => {
  const m = procedural({
    key: 'ari-comb', physical: true, bump: 0.0016,
    params: { color: 0xffffff, roughness: 0.5, clearcoat: 0.0 },
    uniforms: { uCells: { value: cellTex }, uW: { value: combW }, uH: { value: combH }, uHX: { value: HX }, uCR: { value: new THREE.Vector2(COMB_C, COMB_R) } },
    pattern: /* glsl */ `
      float HRr = uHX/1.7320508, HYr = 1.5*HRr;
      vec2 q = p.xy;
      float fr = (uH*0.5 - q.y)/HYr - 0.5;
      float best = 1e9; vec2 cen = vec2(0.0), id = vec2(0.0);
      for (int dr = 0; dr <= 1; dr++) {
        float r = floor(fr) + float(dr);
        float off = mod(r, 2.0) > 0.5 ? 0.5 : 0.0;
        float fc = (q.x + uW*0.5 + uHX*0.25)/uHX - 0.5 - off;
        for (int dc = 0; dc <= 1; dc++) {
          float c = floor(fc) + float(dc);
          vec2 ce = vec2(-uW*0.5 + uHX*(c + 0.5 + off) - uHX*0.25, uH*0.5 - HYr*(r + 0.5));
          float d = distance(q, ce);
          if (d < best) { best = d; cen = ce; id = vec2(c, r); }
        }
      }
      vec2 v = q - cen;
      float e = max(abs(v.x), abs(v.x)*0.5 + abs(v.y)*0.8660254)/(uHX*0.5);   // 0 merkez – 1 duvar
      vec4 tx = texture2D(uCells, (id + 0.5)/uCR);
      float inside = step(0.0, id.x)*step(0.0, id.y)*step(id.x, uCR.x - 1.0)*step(id.y, uCR.y - 1.0);
      float kind = floor(tx.r*255.0 + 0.5)*inside, hs = tx.g;
      float n1 = vn3(p*2600.0), n2 = fbm3(p*180.0, 3);
      // balmumu: yavru alanında kullanılmış petek koyulaşır
      vec3 wax = mix(vec3(0.78, 0.55, 0.2), vec3(0.42, 0.24, 0.07), tx.b)*(0.9 + 0.2*n2);
      float wall = smoothstep(0.8, 0.93, e);
      vec3 c = wax*mix(0.3, 0.75, smoothstep(0.1, 0.85, e));               // boş gözün dibi gölgede
      float rg = 0.55, hh = 0.25*e;
      if (kind > 0.5 && kind < 1.5) {                                        // yumurta: 1,5 mm beyaz çubuk
        float el = length(v/vec2(0.00032, 0.00075));
        float egg = 1.0 - smoothstep(0.7, 1.0, el);
        c = mix(c, vec3(0.86, 0.84, 0.76), egg); rg = mix(rg, 0.3, egg); hh += egg*0.3;
      } else if (kind > 1.5 && kind < 2.5) {                                 // larva: inci beyazı C, arı sütü içinde
        float rr = uHX*(0.14 + 0.14*hs), ang = atan(v.y, v.x);
        float ring = 1.0 - smoothstep(uHX*0.06*(0.6 + hs), uHX*0.1*(0.6 + hs), abs(length(v) - rr));
        ring *= smoothstep(0.2, 0.6, abs(ang - 1.2*hs - 0.4));
        float jelly = 1.0 - smoothstep(0.35, 0.55, e);
        c = mix(c, vec3(0.8, 0.74, 0.55), jelly*0.6);
        c = mix(c, vec3(0.9, 0.88, 0.8)*(0.9 + 0.1*n1), ring);
        rg = mix(rg, 0.18, max(ring, jelly*0.8)); hh = max(hh, ring*0.7 + jelly*0.3);
      } else if (kind > 2.5 && kind < 3.5) {                                 // kapalı yavru: gözenekli kubbe kapak
        vec3 cap = vec3(0.5, 0.3, 0.1)*(0.75 + 0.45*n1)*(0.85 + 0.3*hs);
        c = cap*(0.8 + 0.25*(1.0 - e*e)); rg = 0.85; hh = 0.55 + 0.45*(1.0 - e*e) + 0.1*n1;
      } else if (kind > 3.5 && kind < 4.5) {                                 // açık bal: parlak kehribar
        c = mix(vec3(0.34, 0.1, 0.005), vec3(0.75, 0.35, 0.03), smoothstep(0.2, 0.95, e));
        rg = 0.06; hh = 0.45;
      } else if (kind > 4.5 && kind < 5.5) {                                 // sırlı bal: açık renk mum kapak
        c = vec3(0.8, 0.68, 0.42)*(0.88 + 0.2*n1); rg = 0.42; hh = 0.8 - 0.1*e*e + 0.05*n1;
      } else if (kind > 5.5) {                                               // polen: sıkıştırılmış renkli topak
        vec3 pc = hs < 0.25 ? vec3(0.8, 0.3, 0.02) : hs < 0.5 ? vec3(0.78, 0.58, 0.05) : hs < 0.75 ? vec3(0.45, 0.12, 0.03) : vec3(0.5, 0.55, 0.1);
        c = pc*(0.7 + 0.4*n1)*mix(1.0, 0.7, smoothstep(0.5, 0.9, e)); rg = 0.9; hh = 0.4 + 0.1*n1;
      }
      // hücre duvarı (ince mum kenar)
      c = mix(c, wax*1.12, wall); rg = mix(rg, 0.4, wall); hh = mix(hh, 1.0, wall);
      col = c; rough = rg; h = hh; metal = 0.0;`,
  });
  const ob = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { ob(sh, r); sh.fragmentShader = sh.fragmentShader.replace('uniform float uCells;', 'uniform sampler2D uCells;'); };
  m.customProgramCacheKey = () => 'ari-comb-v1';
  return m;
})();
{
  const face = new THREE.PlaneGeometry(combW + 0.004, combH + 0.004);
  const front = new THREE.Mesh(face, combMat);
  front.receiveShadow = true;
  const back = new THREE.Mesh(face, combMat);
  back.rotation.y = Math.PI; back.position.z = -0.025;
  comb.add(front, back);
  // çerçeve (üst çıta kulaklı, yan çıtalar, alt çıta)
  const fz = -0.0125;
  box(combW + 0.07, 0.019, 0.027, woodM, 0, combH / 2 + 0.0115, fz, comb, 0.002);
  box(combW + 0.004, 0.01, 0.022, woodM, 0, -combH / 2 - 0.006, fz, comb, 0.0015);
  for (const s of [-1, 1]) box(0.009, combH + 0.024, 0.027, woodM, s * (combW / 2 + 0.0065), 0, fz, comb, 0.0015);
  // gözlem kovanı kasası: ahşap kenarlar, iki yanı cam
  const cw = combW + 0.1, ch = combH + 0.1;
  box(cw + 0.04, 0.03, 0.08, darkWoodM, 0, ch / 2 + 0.015, fz, comb);
  box(cw + 0.04, 0.03, 0.08, darkWoodM, 0, -ch / 2 - 0.015, fz, comb);
  for (const s of [-1, 1]) box(0.03, ch, 0.08, darkWoodM, s * (cw / 2 + 0.005), 0, fz, comb);
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0, specularIntensity: 1, envMapIntensity: 1.4, depthWrite: false });
  const gl = new THREE.PlaneGeometry(cw - 0.01, ch);
  const g1 = new THREE.Mesh(gl, glassM); g1.position.z = fz + 0.034;
  const g2 = new THREE.Mesh(gl, glassM); g2.position.z = fz - 0.034; g2.rotation.y = Math.PI;
  g1.userData.noCast = g2.userData.noCast = true;
  comb.add(g1, g2);
  // kovana giden şeffaf giriş borusu ağzı ve ayak
  const y0 = -ch / 2 - 0.03;
  box(0.22, 0.03, 0.16, darkWoodM, 0, y0 - 0.015, fz, comb);
  box(0.06, 0.95 - 0.1 - (ch / 2 + 0.06), 0.06, darkWoodM, 0, y0 - 0.03 - (0.95 - 0.1 - (ch / 2 + 0.06)) / 2, fz, comb);
  box(0.42, 0.03, 0.3, darkWoodM, 0, -0.95 + 0.015, fz, comb);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 20, 1, true), glassM);
  tube.rotation.z = Math.PI / 2; tube.position.set(cw / 2 + 0.07, -ch / 2 + 0.05, fz);
  comb.add(tube);
}
const cellPos = [];
for (let r = 0; r < COMB_R; r++) for (let c = 0; c < COMB_C; c++) {
  const x = -combW / 2 + HX * (c + 0.5 + (r % 2 ? 0.5 : 0)) - HX * 0.25;
  const y = combH / 2 - HY * (r + 0.5);
  cellPos.push(new THREE.Vector3(x, y, 0));
}
// Hücre sıraları: yavru merkezde, bal üstte
const cellHash = cellPos.map((_, i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1);
const byCenter = [...cellPos.keys()].sort((a, b) => nd(cellPos[a]) - nd(cellPos[b]));
function nd(p) { return Math.hypot(p.x / (combW * 0.5), (p.y + combH * 0.08) / (combH * 0.62)); }
const KIND = { empty: 0, egg: 1, larva: 2, capped: 3, honey: 4, cappedHoney: 5, pollen: 6 };
const cellKind = new Array(NC).fill('empty');
// Kullanılmış (yavru büyütülmüş) petek koyu renklidir: merkezden uzaklığa göre sabit
const darkness = cellPos.map((p) => Math.round(255 * clamp(1.15 - nd(p) * 1.1, 0, 0.85)));
function updateComb() {
  const brood = M.broodTotal(col);
  const nB = Math.round(NC * 0.42 * Math.min(1, brood / 36000));
  const nP = Math.round(NC * 0.1 * Math.min(1, col.pollen / 1.5));
  const nH = Math.round(NC * 0.45 * Math.min(1, col.honey / 60));
  const e = M.eggs(col), l = M.larvae(col), cp = M.capped(col), tot = e + l + cp || 1;
  cellKind.fill('empty');
  for (let k = 0; k < nB; k++) {
    const i = byCenter[k], h = cellHash[i];
    cellKind[i] = h < e / tot ? 'egg' : h < (e + l) / tot ? 'larva' : 'capped';
  }
  for (let k = nB; k < nB + nP && k < NC; k++) cellKind[byCenter[k]] = 'pollen';
  // Bal: üst sıralardan başlayarak boş hücreler (merkezden uzaktakiler önce)
  let placed = 0;
  for (let k = NC - 1; k >= 0 && placed < nH; k--) { const i = byCenter[k]; if (cellKind[i] === 'empty') { cellKind[i] = 'honey'; placed++; } }
  const capFrac = Math.min(0.8, col.honey / 50);
  for (let i = 0; i < NC; i++) {
    let kind = cellKind[i];
    if (kind === 'honey' && cellHash[i] < capFrac) kind = 'cappedHoney';
    cellData[i * 4] = KIND[kind];
    cellData[i * 4 + 1] = Math.floor(((cellHash[i] * 7.31) % 1) * 255);
    cellData[i * 4 + 2] = darkness[i];
    cellData[i * 4 + 3] = 255;
  }
  cellTex.needsUpdate = true;
}
const combLbl = sim.label('🔍 Kovanın içi: gözlem kovanı', { parent: comb, position: [0, combH / 2 + 0.11, 0] });

// Petek üzerindeki arılar, kraliçe ve dansçı
const COMB_BEES = LOW ? 260 : 420;
const BEE_Z = 0.0027;
const combBees = beeSwarm(COMB_BEES, 1, comb);
const cb = Array.from({ length: COMB_BEES }, () => ({ p: new THREE.Vector3(rand(-0.2, 0.2), rand(-0.09, 0.09), BEE_Z), t: new THREE.Vector3(), a: rand(0, 6), w: rand(0, 3) }));
const queen = singleBee(1.12);
queen.scale.set(1, 1, 1.35);
comb.add(queen);
const queenLbl = sim.label('👑 Kraliçe', { parent: queen, position: [0, 0.014, 0], className: 'plain' });
const qState = { p: new THREE.Vector3(0, 0, BEE_Z + 0.0003), t: new THREE.Vector3(), wait: 0 };
const dancer = singleBee(1);
comb.add(dancer);
const danceLbl = sim.label('💃 Sallanma dansı', { parent: dancer, position: [0, 0.014, 0], className: 'plain' });

// --- Çiçekler: kır papatyası/gelincik benzeri, gerçek boy (taç 3–4 cm) ---
const MAXF = 300;
const flowerR = seeded(11);
const PAL = [[0xf2a5c8, 0xf6d3e2, 0xfbfaf5, 0xb58ad8], [0xf2c230, 0xd8423a, 0xfbfaf5, 0x6b8fd8], [0x9a62c8, 0xe39a2a, 0xf3e08a, 0xfbfaf5]];
const flowers = [];
// Her "çiçek" bir bitki: 3 çiçek başlı öbek (papatya/gelincik/peygamber çiçeği gibi); çiçek sayısı ayarı bitki sayısıdır
const PER = 3, VIS = MAXF * PER;
const patchC = FLOWER_PATCHES;
for (let i = 0; i < MAXF; i++) {
  const pc = patchC[i % patchC.length];
  const a = flowerR() * Math.PI * 2, d = Math.sqrt(flowerR()) * 2.1;
  const type = Math.floor(flowerR() * 3); // 0 ilkbahar, 1 yaz, 2 sonbahar
  const start = [-10, 80, 160][type] + flowerR() * 30, len = 60 + flowerR() * 35;
  const x0 = pc[0] + Math.cos(a) * d, z0 = pc[1] + Math.sin(a) * d;
  const color = new THREE.Color(PAL[type][Math.floor(flowerR() * 4)]), big = 1.25 + flowerR() * 0.55; // papatya/gelincik taç çapı ~4–7 cm
  for (let k = 0; k < PER; k++) {
    const x = x0 + (flowerR() - 0.5) * 0.16, z = z0 + (flowerR() - 0.5) * 0.16;
    flowers.push({ x, z, y: hW(x, z), h: 0.22 + flowerR() * 0.3, rot: flowerR() * 6.28, tilt: (flowerR() - 0.5) * 0.6, start: start + k * 4, len,
      color: color.clone().offsetHSL(0, 0, (flowerR() - 0.5) * 0.08), open: 0, big: big * (0.85 + 0.3 * flowerR()) });
  }
}
const stemG = (() => {
  const s = new THREE.CylinderGeometry(0.0014, 0.002, 1, 5, 1); s.translate(0, 0.5, 0);
  const lf = (y, a) => { const g = new THREE.PlaneGeometry(0.012, 0.07, 1, 2); g.translate(0, 0.035, 0); g.rotateX(-1.0); g.rotateY(a); g.translate(0, y, 0); return g; };
  const g = BufferGeometryUtils.mergeGeometries([s.toNonIndexed(), lf(0.18, 0).toNonIndexed(), lf(0.4, 2.4).toNonIndexed()].map((q) => { q.deleteAttribute('uv'); return q; }));
  return g;
})();
const petalG = (() => {
  const ps = [];
  for (let k = 0; k < 12; k++) {
    const g = new THREE.CircleGeometry(1, 10);
    g.scale(0.0036, 0.0085, 1); g.translate(0, 0.0105, 0); g.rotateX(-Math.PI / 2 + 0.28);
    g.rotateY(k / 12 * Math.PI * 2 + (k % 2) * 0.1);
    g.deleteAttribute('uv');
    ps.push(g);
  }
  return BufferGeometryUtils.mergeGeometries(ps);
})();
const centerG = new THREE.SphereGeometry(0.0048, 12, 8); centerG.scale(1, 0.55, 1);
const stems = instanced(stemG, mat.foliage({ color: 0x4d7a2a }), VIS);
const heads = instanced(petalG, procedural({
  key: 'ari-petal', params: { color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide, sheen: 0.5 }, physical: true,
  pattern: 'float v = vn3(vec3(length(p.xz)*1400.0, p.y*300.0, atan(p.z, p.x)*40.0)); col *= 0.82 + 0.25*v; col = mix(col*0.7, col, smoothstep(0.003, 0.012, length(p.xz)));',
}), VIS);
const centers = instanced(centerG, procedural({
  key: 'ari-disc', bump: 0.0005, params: { color: 0xd79a1a, roughness: 0.8 },
  pattern: 'float f = cells3(p*1500.0); col *= 0.7 + 0.4*f; h = f;',
}), VIS);
[stems, heads, centers].forEach((m) => { m.frustumCulled = false; m.userData.noFit = true; scene.add(m); });
heads.userData.noCast = centers.userData.noCast = true;
flowers.forEach((f, i) => heads.setColorAt(i, f.color));
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _m4 = new THREE.Matrix4();
function updateFlowers() {
  const d = col.day % M.YEAR;
  const n = O.flowers * PER;
  for (let i = 0; i < VIS; i++) {
    const f = flowers[i];
    const x = (d - f.start) / f.len;
    // (ilkbahar çiçekleri yıl başından önce açmaya başlar)
    f.open = x > 0 && x < 1 ? Math.sin(Math.PI * clamp(x * 1.3, 0, 1)) ** 0.5 : 0;
    const winter = d >= 270;
    const sh = winter ? 0.02 : f.h * (0.4 + 0.6 * Math.max(f.open, 0.3));
    _q.setFromEuler(_e.set(f.tilt * 0.3, f.rot, f.tilt * 0.2));
    _m4.compose(_v.set(f.x, f.y, f.z), _q, _s.set(1, sh, 1));
    stems.setMatrixAt(i, _m4);
    const s = Math.max(0.001, f.open) * f.big;
    _m4.compose(_v.set(f.x + f.tilt * 0.2 * sh * 0.3, f.y + sh, f.z), _q.setFromEuler(_e.set(f.tilt, f.rot, 0)), _s.set(s, s, s));
    heads.setMatrixAt(i, _m4);
    _m4.compose(_v.set(f.x + f.tilt * 0.2 * sh * 0.3, f.y + sh + 0.0015 * s, f.z), _q, _s.set(s, s, s));
    centers.setMatrixAt(i, _m4);
  }
  stems.count = heads.count = centers.count = n;
  stems.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = centers.instanceMatrix.needsUpdate = true;
  heads.instanceColor.needsUpdate = true;
  if (typeof updateWild === 'function') updateWild();
}

// --- Kır çiçekleri: çayırda türlere göre öbekler; her tür kendi mevsiminde açar (gün 0 ≈ mart başı) ---
// Tür: [ad, biçim (0 kadeh, 1 başak, 2 top), renkler, açma başı (gün), süre (gün), boy (m)]
const WILD = [
  ['Dağ lalesi (Anemone coronaria)', 0, [0xc8242a, 0x7a3a9a, 0xd8d0e8], -25, 80, [0.15, 0.3]],
  ['Arı çiçeği (Muscari)', 1, [0x3f45b0, 0x5a4ac0], -20, 75, [0.1, 0.2]],
  ['Karahindiba', 2, [0xf2c21e], -5, 130, [0.08, 0.25]],
  ['Gelincik (Papaver rhoeas)', 0, [0xe0301e, 0xd82a1c], 45, 70, [0.3, 0.6]],
  ['Üçgül (Trifolium)', 2, [0xf2eef0, 0xe0a0c8], 50, 150, [0.1, 0.2]],
  ['Lavanta (Lavandula)', 1, [0x8a6cc8, 0x7a5cc0], 95, 70, [0.3, 0.55]],
  ['Hindiba (Cichorium)', 0, [0x7a9ae8], 110, 120, [0.4, 0.8]],
  ['Çiğdem (Crocus)', 0, [0xc890d8, 0xb070c8], 195, 45, [0.08, 0.14]],
];
const WF = LOW ? 3200 : 7200, TAU = Math.PI * 2;
const wildGeo = [
  (() => {   // kadeh: 5 çukur taç yaprak, koyu merkez
    const ps = [];
    for (let k = 0; k < 5; k++) {
      const g = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 0.62, 0, Math.PI * 0.5);
      g.scale(0.022, 0.03, 0.022).rotateZ(0.5).rotateY(k / 5 * TAU);
      ps.push(g.toNonIndexed());
    }
    ps.push(new THREE.SphereGeometry(0.007, 8, 5).toNonIndexed().translate(0, 0.004, 0));
    const g = BufferGeometryUtils.mergeGeometries(ps.map((q) => { q.deleteAttribute('uv'); return q; }));
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const rr = Math.hypot(p.getX(i), p.getZ(i)), k = rr < 0.008 ? 0.12 : 0.7 + 0.35 * Math.min(1, rr / 0.03); c.set([k, k, k], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  })(),
  (() => {   // başak: sarmal dizili küçük çiçekçikler (lavanta/arı çiçeği)
    const ps = [];
    for (let k = 0; k < 16; k++) {
      const y = k / 16 * 0.07, a = k * 2.4, rr = 0.009 * (1 - 0.5 * k / 16);
      ps.push(new THREE.IcosahedronGeometry(0.0065 * (1 - 0.35 * k / 16), 0).translate(Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
    const g = BufferGeometryUtils.mergeGeometries(ps.map((q) => { q.deleteAttribute('uv'); return q.index ? q.toNonIndexed() : q; }));
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = 0.7 + 0.4 * p.getY(i) / 0.07; c.set([k, k, k], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  })(),
  (() => {   // top: üçgül/karahindiba başı
    const g = new THREE.IcosahedronGeometry(0.014, 2), p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { p.setY(i, p.getY(i) * 0.8); const k = 0.75 + 0.3 * Math.max(0, p.getY(i) / 0.011); c.set([k, k, k], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.computeVertexNormals();
    return g;
  })(),
];
const wildMat = procedural({
  key: 'ari-wild', physical: true, params: { color: 0xffffff, vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, sheen: 0.4 },
  pattern: 'col *= 0.85 + 0.25*vn3(p*900.0 + seed*7.0);',
});
const wildMeshes = wildGeo.map((g) => instanced(g, wildMat, WF));
const wildStems = instanced(stemG, stems.material, WF);
for (const m of [...wildMeshes, wildStems]) {
  if (m !== wildStems) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(WF * 3), 3);
  m.frustumCulled = false; m.userData.noFit = true; m.userData.noCast = m !== wildStems; m.count = 0; scene.add(m);
}
const wild = [];
{
  const r = seeded(97);
  for (let i = 0; i < WF; i++) {
    const dr = WILD_DRIFTS[i % WILD_DRIFTS.length], sp = WILD[dr[3]];
    const a = r() * TAU, d = dr[2] * Math.sqrt(-Math.log(1 - r() * 0.95)) * 0.6;   // öbek içinde yoğun, kenara seyrelen
    const x = dr[0] + Math.cos(a) * d, z = dr[1] + Math.sin(a) * d;
    wild.push({ x, z, y: hW(x, z), sp: dr[3], c: new THREE.Color(sp[2][Math.floor(r() * sp[2].length)]).offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.1),
      h: lerp(sp[5][0], sp[5][1], r()), st: sp[3] + (r() - 0.5) * 16, rot: r() * TAU, tilt: (r() - 0.5) * 0.5, big: 1.15 + r() * 0.5, rank: r() });
  }
}
let wildKey = '';
function updateWild() {
  const d = col.day % M.YEAR, frac = 0.3 + 0.7 * O.flowers / 300, key = Math.floor(d) + '|' + O.flowers;
  if (key === wildKey) return;
  wildKey = key;
  const cnt = [0, 0, 0];
  let ns = 0;
  for (const f of wild) {
    if (f.rank > frac) continue;
    const sp = WILD[f.sp], x = (d - f.st) / sp[4];
    let open = x > 0 && x < 1 ? Math.sin(Math.PI * x) ** 0.4 : 0;
    if (open < 0.03) continue;
    const kind = sp[1], m = wildMeshes[kind], sh = f.h * (0.5 + 0.5 * open);
    _q.setFromEuler(_e.set(f.tilt * 0.3, f.rot, f.tilt * 0.2));
    _m4.compose(_v.set(f.x, f.y, f.z), _q, _s.set(1, sh, 1));
    wildStems.setMatrixAt(ns++, _m4);
    const s = open * f.big;
    _m4.compose(_v.set(f.x + f.tilt * 0.06 * sh, f.y + sh, f.z), _q.setFromEuler(_e.set(f.tilt * 0.5, f.rot, 0)), _s.set(s, s, s));
    m.setMatrixAt(cnt[kind], _m4); m.setColorAt(cnt[kind], f.c); cnt[kind]++;
  }
  wildMeshes.forEach((m, k) => { m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  wildStems.count = ns; wildStems.instanceMatrix.needsUpdate = true;
}
// --- Uçan tarlacılar ---
const FLY = 120;
const fliers = beeSwarm(FLY, 1.6, scene);
const fl = Array.from({ length: FLY }, () => ({ state: 0, t: 0, f: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), wob: rand(0, 6), dur: 1 }));
function pickFlower() {
  const n = O.flowers * PER;
  for (let k = 0; k < 8; k++) { const i = Math.floor(Math.random() * n); if (flowers[i].open > 0.35) return i; }
  return -1;
}

// --- Yağmur (damla izi) / kar (yumuşak tanecik): kameranın çevresinde saran kutu ---
const RBOX = 6, RAIN = LOW ? 900 : 1800;
const rainPos = new Float32Array(RAIN * 6);
for (let i = 0; i < RAIN; i++) { const x = rand(-RBOX, RBOX), y = rand(0, 7), z = rand(-RBOX, RBOX); rainPos.set([x, y, z, x, y + 0.22, z], i * 6); }
const rainGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xc9d6e2, transparent: true, opacity: 0.55, depthWrite: false });
const rain = new THREE.LineSegments(rainGeo, rainMat);
const SNOW = LOW ? 900 : 1800;
const snowPos = new Float32Array(SNOW * 3);
for (let i = 0; i < SNOW; i++) snowPos.set([rand(-RBOX, RBOX), rand(0, 7), rand(-RBOX, RBOX)], i * 3);
const snowGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.018, map: softDot(), transparent: true, opacity: 0.9, depthWrite: false }));
for (const o of [rain, snow]) { o.frustumCulled = false; o.userData.noShadow = true; o.userData.noFit = true; o.visible = false; scene.add(o); }
const wrapS = (v) => v - 2 * RBOX * Math.round(v / (2 * RBOX));

// --- Mevsim renkleri (arazi, çim, yaprak) ---
const GRASS = [0x5f7a2e, 0x6a7532, 0x7f7240, 0x5e5c44].map((c) => new THREE.Color(c));
const DRY = [0x8a8a4a, 0xa39458, 0x9c8250, 0x7e735c].map((c) => new THREE.Color(c));
const TUFT = [0x6a8a34, 0x7a8a3c, 0x8c7c44, 0x7a7458].map((c) => new THREE.Color(c));
const LEAF_A = [0x4a6e2a, 0x3e5a26, 0x8a5424, 0x4d4436].map((c) => new THREE.Color(c));
const LEAF_B = [0x86a040, 0x6e7c35, 0xb88a2c, 0x6a5a44].map((c) => new THREE.Color(c));
const SUN_EL = [46, 62, 36, 22];
const tmpC = new THREE.Color();
const mix4 = (arr, s, next, b, out) => out.copy(arr[s]).lerp(arr[next], b);
const flowerCentroid = new THREE.Vector3();
let visTimer = 0, time = 0, skyKey = -1, tuftK = -1, wetV = 0;
sim.onRender((real) => {
  if (!col) return;
  time += real;
  const run = sim.paused ? 0 : real * Math.min(sim.speed, 3);
  const d = col.day % M.YEAR, s = M.seasonOf(col.day);
  // Mevsim geçişi (son %20'de yumuşak)
  const sf = (d % 90) / 90, next = (s + 1) % 4;
  const blend = smooth(clamp((sf - 0.8) / 0.2, 0, 1));
  const winter = d >= 270;
  // kar örtüsü: kışın ilk iki haftasında gelir, yıl sonunda erir
  const snowAmt = smooth(clamp((d - 272) / 14, 0, 1)) * (1 - smooth(clamp((d - 350) / 10, 0, 1)));
  mix4(GRASS, s, next, blend, TU.tGrass.value); mix4(DRY, s, next, blend, TU.tDry.value);
  TU.tSnow.value = snowAmt > 0.01 ? lerp(60, -160, snowAmt) : 1e9;
  wetV = lerp(wetV, col.rain && !winter ? 0.7 : 0, Math.min(1, real * 0.8));
  TU.tWet.value = wetV;
  mix4(TUFT, s, next, blend, tuftMat.color);
  mix4(LEAF_A, s, next, blend, veg.uniforms.vLeafA.value); mix4(LEAF_B, s, next, blend, veg.uniforms.vLeafB.value);
  mix4(LEAF_A, s, next, blend, TREES.leaf.color).lerp(tmpC.setHex(0xffffff), 0.25);
  const tk = Math.round((1 - 0.85 * snowAmt) * 20) / 20;
  if (tk !== tuftK) { tuftK = tk; updateTufts(tk); }
  veg.update(time, col.rain ? 2 : 1); meadow.update(time, col.rain ? 1.8 : 0.9);
  mix4(TUFT, s, next, blend, meadow.uniforms.vGrassA.value).multiplyScalar(0.92); mix4(DRY, s, next, blend, meadow.uniforms.vGrassB.value);
  // Gökyüzü: güneş yüksekliği mevsime göre, yağışta kapalı (adımlı güncelleme: ortam haritası en çok saniyede bir)
  const el = Math.round(lerp(SUN_EL[s], SUN_EL[next], blend));
  const cl = col.rain ? 1 : 0;
  const key = el * 10 + cl;
  if (key !== skyKey) {
    skyKey = key;
    sim.sky.set({ elevation: el, clouds: cl ? (winter ? 0.95 : 0.88) : (winter ? 0.5 : 0.3), haze: cl ? 2.2 : (winter ? 1.6 : 1.2), visibility: cl ? 4500 : (winter ? 9000 : 16000) });
  }
  // Yağış
  const tgt = sim.controls ? sim.controls.target : sim.camera.position;
  rain.visible = col.rain && !winter;
  snow.visible = col.rain && winter;
  if (rain.visible) {
    const a = rainPos, v = 7.5 * real;
    for (let i = 0; i < RAIN; i++) {
      let y = a[i * 6 + 1] - v; if (y < 0) y += 7;
      const x = tgt.x + wrapS(a[i * 6] - tgt.x), z = tgt.z + wrapS(a[i * 6 + 2] - tgt.z);
      a[i * 6] = a[i * 6 + 3] = x; a[i * 6 + 2] = a[i * 6 + 5] = z; a[i * 6 + 1] = y; a[i * 6 + 4] = y + 0.22;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  if (snow.visible) {
    const a = snowPos, v = 0.7 * real;
    for (let i = 0; i < SNOW; i++) {
      let y = a[i * 3 + 1] - v; if (y < 0) y += 7;
      a[i * 3] = tgt.x + wrapS(a[i * 3] + Math.sin(time * 0.8 + i) * 0.12 * real - tgt.x);
      a[i * 3 + 2] = tgt.z + wrapS(a[i * 3 + 2] - tgt.z);
      a[i * 3 + 1] = y;
    }
    snowGeo.attributes.position.needsUpdate = true;
  }
  // Uçan arılar
  const activity = col.forageToday > 0.02 ? 1 : 0;
  const want = Math.min(FLY, Math.round((col.foragers / 180) * activity));
  let vis = 0;
  flowerCentroid.set(0, 0, 0);
  let fc = 0;
  for (let i = 0; i < FLY; i++) {
    const b = fl[i];
    if (b.state === 0) {
      if (i < want && Math.random() < real * 1.5) {
        const f = pickFlower();
        if (f >= 0) { const F = flowers[f]; b.f = f; b.state = 1; b.t = 0; b.from.copy(ENTR); b.to.set(F.x, F.y + F.h * (0.4 + 0.6 * Math.max(F.open, 0.3)) + 0.02, F.z); b.dur = b.from.distanceTo(b.to) / 1.4; }
      }
    } else {
      b.t += run;
      if (b.state === 2 && b.t > 1.2) { b.state = 3; b.t = 0; b.from.copy(b.to); b.to.copy(ENTR); }
      else if ((b.state === 1 || b.state === 3) && b.t > b.dur) {
        if (b.state === 1) { b.state = 2; b.t = 0; } else b.state = 0;
      }
    }
    if (b.state === 0) continue;
    if (b.state === 2) {
      dummy.position.copy(b.to);
      dummy.position.y += Math.sin(time * 8 + b.wob) * 0.012;
      dummy.lookAt(b.to.x + Math.sin(time * 3 + b.wob), b.to.y, b.to.z + Math.cos(time * 3 + b.wob));
      flowerCentroid.add(b.to); fc++;
    } else {
      const u = clamp(b.t / b.dur, 0, 1);
      dummy.position.lerpVectors(b.from, b.to, u);
      dummy.position.y += Math.sin(u * Math.PI) * 0.6 + Math.sin(time * 9 + b.wob) * 0.02;
      dummy.position.x += Math.sin(u * 7 + b.wob) * 0.08;
      dummy.lookAt(b.to.x, dummy.position.y, b.to.z);
    }
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    fliers.set(vis++, dummy.matrix);
  }
  fliers.count = vis;
  fliers.done();

  // Petek arıları: kışın salkım, diğer mevsimlerde gezinme
  const nb = Math.min(COMB_BEES, Math.round(col.hive / 80));
  const cluster = winter && col.hive > 0;
  const cr = Math.min(0.09, 0.015 + Math.sqrt(nb) * 0.004);
  for (let i = 0; i < nb; i++) {
    const b = cb[i];
    if (cluster) {
      const a = i * 2.399, rr = cr * Math.sqrt((i + 0.5) / nb);
      b.t.set(Math.cos(a) * rr, -0.02 + Math.sin(a) * rr * 0.9, BEE_Z + (i % 3) * 0.004);
      b.p.lerp(b.t, Math.min(1, real * 2));
      dummy.position.copy(b.p);
      dummy.position.x += Math.sin(time * 30 + i) * 0.0003; // titreşerek ısınma
      flat(dummy, a);
    } else {
      b.w -= run;
      if (b.w <= 0) { const c = cellPos[byCenter[Math.floor(Math.random() * NC * 0.6)]]; b.t.set(c.x, c.y, BEE_Z); b.w = rand(1, 4); }
      const dx = b.t.x - b.p.x, dy = b.t.y - b.p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.0005) { b.a = Math.atan2(dy, dx); const st = Math.min(dist, run * 0.012); b.p.x += (dx / dist) * st; b.p.y += (dy / dist) * st; }
      b.p.z = BEE_Z;
      dummy.position.copy(b.p);
      flat(dummy, b.a);
    }
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    combBees.set(i, dummy.matrix);
  }
  combBees.count = nb;
  combBees.done();

  // Kraliçe: yavru alanında dolaşır
  qState.wait -= run;
  if (qState.wait <= 0) { const c = cellPos[byCenter[Math.floor(Math.random() * NC * 0.3)]]; qState.t.set(c.x, c.y, BEE_Z + 0.0003); qState.wait = rand(1.5, 3); }
  qState.p.lerp(qState.t, Math.min(1, run * 1.2));
  if (cluster) queen.position.set(0, -0.02, BEE_Z + 0.012); else queen.position.copy(qState.p);
  flat(queen, Math.atan2(qState.t.y - qState.p.y, qState.t.x - qState.p.x));

  // Sallanma dansı: düz koşu açısı = çiçek yönü ile güneş yönü arasındaki açı
  const dancing = !cluster && fc > 0 && activity;
  dancer.visible = dancing;
  danceLbl.visible = dancing && showLabels;
  if (dancing) {
    flowerCentroid.divideScalar(fc);
    const angF = Math.atan2(flowerCentroid.z - HIVE.z, flowerCentroid.x - HIVE.x);
    const sd = sim.sky.sunDir;
    const angS = Math.atan2(sd.z, sd.x);
    const phi = -(angF - angS);                 // petek üzerinde yukarı = güneş yönü
    const ph = (time * 0.8) % 2, u = ph % 1;
    const dir = new THREE.Vector2(Math.sin(phi), Math.cos(phi));
    const side = ph < 1 ? 1 : -1;
    const base = new THREE.Vector2(combW * 0.28, -0.01);
    let x, y;
    if (u < 0.5) { const k = u / 0.5 - 0.5; x = base.x + dir.x * k * 0.03; y = base.y + dir.y * k * 0.03; x += Math.sin(time * 40) * 0.0012; }
    else { const k = (u - 0.5) / 0.5; const a = Math.PI * k; x = base.x + dir.x * 0.015 * Math.cos(a) + side * dir.y * 0.014 * Math.sin(a); y = base.y + dir.y * 0.015 * Math.cos(a) - side * dir.x * 0.014 * Math.sin(a); }
    dancer.position.set(x, y, BEE_Z + 0.0005);
    flat(dancer, Math.atan2(dir.y, dir.x));
  }
  visTimer += real;
  if (visTimer > 0.25) { visTimer = 0; updateComb(); updateFlowers(); }
});
const smooth = (t) => t * t * (3 - 2 * t);
let showLabels = true;
const VIEWS = {
  genel: [[0.05, 1.22, 1.05], [0.35, 0.78, -1.1]],
  petek: [[-0.36, 1.0, 0.52], [-0.5, 0.95, 0.1]],
  giris: [[1.55, 0.62, -0.75], [0.85, 0.42, -1.2]],
  cayir: [[3.6, 1.5, 1.8], [1.4, 0.3, -3.6]],
};

// --- Simülasyon adımı ---
sim.onUpdate((dt) => {
  if (!col || ended) return;
  dayAcc += dt * DAYS_PER_SEC;
  let n = Math.min(Math.floor(dayAcc), 40);
  dayAcc -= Math.floor(dayAcc);
  while (n-- > 0 && !ended) {
    if (col.day % M.YEAR === 175 && O.harvestFrac > 0) {
      const taken = M.harvest(col, O.harvestFrac);
      if (taken > 0.5) sim.toast(`🍯 Arıcı yaz sonunda ${fmt(taken, 1)} kg bal hasat etti`, O.harvestFrac > 0.6 ? 'warn' : 'good');
    }
    M.stepDay(col, { ...O, rng });
    if (col.day % 2 === 0) chart.push([M.adults(col) / 1000, M.broodTotal(col) / 1000, col.honey]);
    const s = M.seasonOf(col.day);
    if (s !== lastSeason) {
      lastSeason = s;
      const msg = ['🌸 İlkbahar! Çiçekler açıyor, kraliçe yumurtlamayı artırıyor.', '☀️ Yaz! Bal akımı zamanı: tarlacılar çok çalışıyor.',
        '🍂 Sonbahar: çiçekler azalıyor, kış arıları yetişiyor. Kış için bal yeterli mi?', '❄️ Kış: arılar salkım oldu, biriken balı yiyerek ısınıyorlar.'][s];
      sim.toast(msg, s === 3 ? 'warn' : '');
    }
    if (col.dead) { lose(); break; }
    if (col.day % M.YEAR === 0) { win(); break; }
  }
});
function win() {
  ended = true;
  sim.hud.show(`<h2>🎉 Koloni kışı atlattı!</h2>${M.SEASONS[0].emoji} ${col.winters}. yıl tamam · ${fmt(M.adults(col))} arı · ${fmt(col.honey, 1)} kg bal kaldı
    · toplam hasat ${fmt(col.harvested, 1)} kg<br><button class="btn primary" data-a="go">▶ Yeni yıla devam</button><button class="btn" data-a="new">⟲ Baştan</button>`, { tone: 'good' });
  sim.hud.el.querySelector('[data-a=go]').onclick = () => { ended = false; sim.hud.hide(); };
  sim.hud.el.querySelector('[data-a=new]').onclick = () => restart();
}
function lose() {
  ended = true;
  sim.hud.show(`<h2>😢 Koloni hayatta kalamadı</h2>${col.cause}<br><small>İpucu: daha çok çiçek, daha az hasat, varroa ilacı ya da şeker şurubu dene.</small><br>
    <button class="btn primary" data-a="new">⟲ Tekrar dene</button>`, { tone: 'bad' });
  sim.hud.el.querySelector('[data-a=new]').onclick = () => restart();
}

// --- Panel ---
const ui = sim.ui;
ui.section('Çevre');
const sFlow = ui.slider({ label: '🌼 Çiçek sayısı', min: 10, max: 300, step: 10, value: O.flowers, onChange: (v) => { O.flowers = v; updateFlowers(); } });
const sRain = ui.slider({ label: '🌧️ Yağmurlu gün oranı', min: 0, max: 0.7, step: 0.05, value: O.rainChance, format: (v) => `%${fmt(v * 100)}`, onChange: (v) => { O.rainChance = v; } });
const tPest = ui.toggle({ label: '☠️ Tarlada pestisit', value: false, onChange: (v) => { O.pesticide = v; } });
const tVar = ui.toggle({ label: '🕷️ Varroa akarı', value: false, onChange: (v) => { O.varroa = v; if (v) sim.toast('🕷️ Kovana varroa akarı girdi!', 'bad'); } });
ui.section('Arıcı');
const sHarv = ui.slider({ label: '🍯 Yaz sonu hasadı (175. gün)', min: 0, max: 1, step: 0.05, value: O.harvestFrac, format: (v) => `balın %${fmt(v * 100)}'i`, onChange: (v) => { O.harvestFrac = v; } });
ui.buttons([
  { label: '🍯 Şimdi hasat', onClick: () => { const t = M.harvest(col, O.harvestFrac || 0.3); sim.toast(`${fmt(t, 1)} kg bal alındı`, 'warn'); } },
  { label: '🍬 Şurup +5 kg', variant: 'good', onClick: () => { if (col.dead) return; col.honey += 5; sim.toast('🍬 Şeker şurubu verildi (+5 kg)', 'good'); } },
  { label: '🧪 Varroa ilacı', onClick: () => { col.mites *= 0.1; sim.toast(O.varroa ? '🧪 Akarların %90\'ı temizlendi' : 'Kovanda akar yok', 'good'); } },
]);
ui.section('Koloni');
const stSeason = ui.stat({ label: 'Mevsim' });
const stBees = ui.stat({ label: 'Arı sayısı' });
const stBrood = ui.stat({ label: 'Yavru (yumurta+larva+pupa)' });
const stHoney = ui.stat({ label: 'Bal', unit: 'kg' });
const stPollen = ui.stat({ label: 'Polen', unit: 'kg' });
const stMite = ui.stat({ label: 'Varroa yükü', unit: '%' });
const winterM = ui.meter({ label: '❄️ Kışa hazırlık (bal + arı)', color: 'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e)' });
const chart = ui.chart({ title: 'Yıl boyunca koloni', series: [{ name: 'Arı (bin)', color: '#facc15', fill: true }, { name: 'Yavru (bin)', color: '#f472b6' }, { name: 'Bal (kg)', color: '#f97316' }], maxPoints: 180 });
const legend = ui.text('<span style="color:#f2efe4">⬤</span> yumurta <span style="color:#efe6cc">⬤</span> larva <span style="color:#a8743c">⬤</span> kapalı yavru <span style="color:#d0820e">⬤</span> bal <span style="color:#e6d3a0">⬤</span> sırlı bal <span style="color:#e0801a">⬤</span> polen', 'card');
ui.section('Görünüm');
ui.buttons([
  { label: 'Genel', onClick: () => sim.moveCamera(...VIEWS.genel) },
  { label: 'Petek yakından', onClick: () => sim.moveCamera(...VIEWS.petek) },
  { label: 'Kovan girişi', onClick: () => sim.moveCamera(...VIEWS.giris) },
  { label: 'Çayır', onClick: () => sim.moveCamera(...VIEWS.cayir) },
]);
ui.toggle({ label: '🏷️ Etiketler', value: true, onChange: (v) => { showLabels = v; for (const l of [hiveLbl, combLbl, queenLbl]) l.visible = v; } });

let statT = 0;
sim.onRender((real) => {
  if (!col || (statT += real) < 0.3) return;
  statT = 0;
  const s = M.seasonOf(col.day);
  stSeason.set(`${M.SEASONS[s].emoji} ${M.SEASONS[s].name}`);
  const A = M.adults(col);
  stBees.set(Math.round(A), A < 5000 ? 'bad' : A < 15000 ? 'warn' : 'good');
  stBrood.set(Math.round(M.broodTotal(col)));
  stHoney.set(fmt(col.honey, 1), col.honey < 5 ? 'bad' : col.honey < 15 ? 'warn' : 'good');
  stPollen.set(fmt(col.pollen, 2), col.pollen < 0.1 ? 'bad' : '');
  const load = A > 0 ? (col.mites / A) * 100 : 0;
  stMite.set(O.varroa ? fmt(load, 1) : '—', load > 10 ? 'bad' : load > 3 ? 'warn' : '');
  const ready = Math.min(1, col.honey / 20) * 0.6 + Math.min(1, A / 15000) * 0.4;
  winterM.set(ready, `${fmt(ready * 100)}%`);
});

sim.formatTime = () => (col ? `${M.SEASONS[M.seasonOf(col.day)].emoji} ${col.winters + 1}. yıl · ${(col.day % M.YEAR) + 1}. gün` : '');

function restart() {
  col = M.createColony();
  col.day = 20; // mart sonu
  rng = seeded(21);
  dayAcc = 0; lastSeason = -1; ended = false;
  sim.hud.hide();
  chart.clear();
  updateComb(); updateFlowers();
  if (sim.paused) sim.play();
}
sim.onReset(() => {
  Object.assign(O, { flowers: 150, rainChance: 0.2, pesticide: false, varroa: false, harvestFrac: 0.3 });
  sFlow.set(150); sRain.set(0.2); tPest.set(false); tVar.set(false); sHarv.set(0.3);
  restart();
});
restart();
